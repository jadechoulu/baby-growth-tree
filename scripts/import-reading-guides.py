"""从已归档的用户表格导入书目元信息；运行环境需安装 openpyxl（只读原件）。"""
from pathlib import Path
import hashlib
import json
import re
import openpyxl

ROOT = Path(__file__).resolve().parents[1] / 'english'
DATA = ROOT / 'data'


def load(name):
    return json.loads((DATA / (name + '.json')).read_text())


def write(name, value):
    (DATA / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def number(value):
    text = str(value or '').strip()
    return int(float(text)) if re.fullmatch(r'\d+(?:\.0)?', text) else None


def text(value):
    return str(value or '').strip()


def rows(sheet):
    values = [[cell.value for cell in row] for row in sheet]
    # 只展开原件明确合并的单元格，不将空行或跨主题空白向下填充。
    for merged in sheet.merged_cells.ranges:
        value = values[merged.min_row - 1][merged.min_col - 1]
        for r in range(merged.min_row, merged.max_row + 1):
            for c in range(merged.min_col, merged.max_col + 1):
                values[r - 1][c - 1] = value
    return values


def main():
    config, directory, taxonomy = load('reading-guide-map'), load('resource-books'), load('topic-taxonomy')
    supplements = load('book-subtopic-supplements')
    review_path = ROOT.parent / 'docs/audits/reading-guide-topic-review.json'
    review = json.loads(review_path.read_text()) if review_path.exists() else {}
    for node in supplements['nodes'] + review.get('nodes', []):
        if not any(item['id'] == node['id'] for item in taxonomy['nodes']):
            taxonomy['nodes'].append({key: node[key] for key in ('id', 'label', 'parentId')})
    for source in supplements['sources']:
        for collection in (directory['sources'], taxonomy['sources']):
            if not any(item['id'] == source['id'] for item in collection):
                collection.append(source)
    for book_id, supplement in supplements['books'].items():
        book = next(book for book in directory['books'] if book['id'] == book_id)
        override = taxonomy['bookOverrides'].setdefault(book_id, {'topics': []})
        for field in ('topics', 'sourceIds'):
            override[field] = list(dict.fromkeys(override.get(field, []) + supplement[field]))
        override['subtopicSupplement'] = supplement
        book['sourceIds'] = list(dict.fromkeys(book['sourceIds'] + supplement['sourceIds']))
        for evidence in supplement['evidence']:
            record = {'kind': 'content-summary', **evidence}
            if record not in book['topicEvidence']:
                book['topicEvidence'].append(record)
        if book['topicStatus'] == 'pending':
            book['topicStatus'] = 'content-verified'
            book['topicBasis'] = supplement['basis']
    for record in supplements['pending']:
        override = taxonomy['bookOverrides'].setdefault(record['bookId'], {'topics': []})
        override['subtopicPending'] = record['reason']
    nodes = {node['id'] for node in taxonomy['nodes']}
    for source in config['sources']:
        path = ROOT / source['file']
        workbook = openpyxl.load_workbook(path, data_only=True)
        word_sheet = workbook[source['wordSheet']]
        books = {}
        for row_index, row in enumerate(rows(word_sheet), 1):
            n = number(row[0])
            if n is not None and text(row[1]):
                books[n] = {'sourceId': source['id'], 'number': n, 'title': text(row[1]),
                            'locator': f'{word_sheet.title}!A{row_index}:B{row_index}', 'themes': [], 'patterns': []}
        theme_sheet = workbook[source['themeSheet']]
        parent = ''
        for row_index, row in enumerate(rows(theme_sheet), 1):
            if re.match(r'part\s*\d', text(row[0]), re.I):
                parent = re.sub(r'^part\s*\d+\s*[:：]\s*|主题[（(].*$', '', text(row[0]), flags=re.I)
            n, order = number(row[1]), number(row[0])
            if n not in books or order is None:
                continue
            record = {'order': order, 'title': text(row[2]), 'primary': parent,
                      'secondary': text(row[source['themeColumn']]),
                      'locator': f'{theme_sheet.title}!A{row_index}:E{row_index}'}
            books[n]['themes'].append(record)
        if source.get('patternSheet'):
            pattern_sheet = workbook[source['patternSheet']]
            for row_index, row in enumerate(rows(pattern_sheet), 1):
                n, order = number(row[1]), number(row[0])
                if n in books and order is not None:
                    books[n]['patterns'].append({'order': order, 'group': text(row[3]),
                        'text': text(row[source['patternColumn']]),
                        'locator': f'{pattern_sheet.title}!A{row_index}:E{row_index}'})
        assert len(books) == source['bookCount'], source['id']
        assert set(map(int, source['topics'])) == set(books), '必须逐本核定主题'
        metadata = {key: value for key, value in source.items() if key not in ('topics', 'bookLinks')}
        metadata.update(kind='user-provided-spreadsheet', checkedAt='2026-11-06',
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        sheets=workbook.sheetnames, unmatched=[])
        for n, guide in books.items():
            topic_ids = source['topics'][str(n)]
            assert set(topic_ids).issubset(nodes) and topic_ids, (n, topic_ids)
            book_id = source.get('bookLinks', {}).get(str(n))
            if source.get('bookLinks') is not None and not book_id:
                metadata['unmatched'].append({**guide, 'topics': topic_ids,
                    'note': '原表第87本为The birds，现有上下辑目录同号为The Rides；暂不关联已读记录。'})
                continue
            if book_id:
                book = next(book for book in directory['books'] if book['id'] == book_id)
            else:
                book_id = f"book-{source['id']}-{n:03d}"
                book = next((book for book in directory['books'] if book['id'] == book_id), None)
                if book is None:
                    book = {'id': book_id, 'resourceId': source['resourceId'], 'title': guide['title'],
                            'level': source['level'], 'edition': source['edition'], 'number': n,
                            'sourceIds': [], 'topics': [], 'topicEvidence': [],
                            'catalogNote': '仅为用户主题表收录范围，不代表RAZ官方书库全集或其他纸质选本。'}
                    directory['books'].append(book)
            if source['resourceId'] == 'resource-1qnd5uh':
                # 原表未逐册标虚构属性，也不是路线所指纸质选本；不冒充该路线书单。
                book['editionMatch'] = 'reference-only'
            book['studyGuide'] = guide
            book['topicBasis'] = '按用户原表的逐册分类与字词句内容核定；原始题名、分组、顺序及句型独立保留。'
            book['sourceIds'] = list(dict.fromkeys(book['sourceIds'] + [source['id']]))
            book['topicStatus'] = 'classification-verified'
            book['topicEvidence'] = [e for e in book.get('topicEvidence', []) if e.get('sourceId') != source['id']]
            book['topicEvidence'].append({'kind': 'source-classification', 'sourceId': source['id'],
                'locator': '；'.join(item['locator'] for item in guide['themes']),
                'originalTopic': '；'.join(dict.fromkeys(item['primary'] + (' / ' + item['secondary'] if item['secondary'] != item['primary'] else '') for item in guide['themes'])),
                'summary': '按用户原表分类与本条字词句内容核定公共主题；保留原表顺序和分组，不将语法词性当作内容主题。'})
            override = taxonomy['bookOverrides'].setdefault(book_id, {'topics': []})
            # 重跑时只替换本来源拥有的映射，防止已纠正的旧主题残留。
            previous = override.get('guideTopics', [])
            override['topics'] = list(dict.fromkeys([item for item in override['topics'] if item not in previous] + topic_ids))
            override['guideTopics'] = topic_ids
            override.update(basis='根据用户主题表的本册分类及字词句内容映射；原始分类、顺序与句型独立保留。',
                            sourceIds=list(dict.fromkeys(override.get('sourceIds', []) + [source['id']])))
        for collection in [directory['sources'], taxonomy['sources']]:
            collection[:] = [item for item in collection if item['id'] != source['id']]
            collection.append(metadata)
        if source['resourceId'] == 'resource-1qnd5uh':
            coverage = next(item for item in directory['coverage'] if item['resourceId'] == source['resourceId'])
            coverage.update(status='partial', bookCount=203, note='用户主题表：AA 103本、A 100本；只覆盖这两份整理表，不是RAZ全部级别或官方全集。')
        print(source['id'], len(books), '关联', len(books) - len(metadata['unmatched']), '待核对', len(metadata['unmatched']))
    if not any(item['resourceId'] == 'resource-1qnd5uh' for item in directory['seriesResearch']):
        directory['seriesResearch'].append({'resourceId': 'resource-1qnd5uh',
            'readingGuide': ['AA、A目录按用户原表逐册归档，整理表收录数不替代出版版本册数。'],
            'searchLog': ['用户提供RAZ AA主题阅读顺序和单词表、RAZ A主题句型单词表；逐册保留来源工作表位置。']})
    cover_path = DATA / 'raz-book-covers.json'
    if cover_path.exists():
        for entry in json.loads(cover_path.read_text())['books']:
            book = next(book for book in directory['books'] if book['id'] == entry['bookId'])
            if entry.get('canonicalTitle'):
                if book['studyGuide']['title'] != entry['canonicalTitle']:
                    book['aliases'] = list(dict.fromkeys(book.get('aliases', []) + [book['studyGuide']['title']]))
                book['title'] = entry['canonicalTitle']
                book['titleEvidence'] = {key: entry[key] for key in ('canonicalTitle', 'officialBookId', 'sourceUrl', 'verification') if key in entry}
            if entry.get('cover'):
                assert (ROOT / entry['cover']).is_file(), entry['cover']
                source = entry['coverSource']
                book['cover'] = entry['cover']
                book['coverSource'] = {**source, 'checkedAt': entry['checkedAt'],
                    'sourceUrl': source.get('url'),
                    'provider': 'Reading A-Z官方' if source['kind'] == 'official-book-resource-card' else '用户提供单册PDF',
                    'note': source['processing']}
    write('resource-books', directory)
    write('topic-taxonomy', taxonomy)


if __name__ == '__main__':
    main()
