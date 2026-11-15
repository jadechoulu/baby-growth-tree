"""将可复核的全素材分类配置并入共用主题库；不访问网络或修改个人事实。"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'english/data'
GENERATED_TOPIC_SOURCES = {'catalog-title-topic-fallback-20261114', 'xhs-public-content-topics-20261114'}


def read(name):
    return json.loads((DATA / (name + '.json')).read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def unique(values):
    return list(dict.fromkeys(values))


def append_records(target, values):
    for item in values:
        if item not in target:
            target.append(item)


def canonical(value):
    return re.sub(r'\s+', '', str(value).replace('...', '…').replace('’', "'")).lower()


def title_key(value):
    return re.sub(r'[^a-z0-9]+', '', str(value).lower().replace('’', "'"))


def merge_record(target, value):
    for field in ('topics', 'sourceIds', 'replaceLegacy'):
        if field in value:
            target[field] = unique(target.get(field, []) + value[field])
    for field in ('evidence', 'patterns'):
        if field in value:
            append_records(target.setdefault(field, []), value[field])
    for field in ('basis', 'status'):
        if field in value:
            target[field] = value[field]


def main():
    taxonomy, directory = read('topic-taxonomy'), read('resource-books')
    research, resource_config, book_config = (read(name) for name in (
        'material-topic-research', 'material-resource-topics', 'material-book-topics'))
    by_book = {book['id']: book for book in directory['books']}
    # 阅读计划在构建时投影为同一公共单册，主题仍按其原稳定ID保存。
    for plan in read('reading-plans').get('plans', []):
        for book in plan.get('books', []):
            by_book.setdefault(book['id'], book)
    nodes = {node['id'] for node in taxonomy['nodes']}
    for node in book_config.get('nodes', []):
        if node['id'] not in nodes:
            taxonomy['nodes'].append(node)
            nodes.add(node['id'])
    source_by_id = {source['id']: source for source in taxonomy['sources']}
    for config in (book_config, resource_config, research):
        for source in config.get('sources', []):
            source_by_id[source['id']] = source
    taxonomy['sources'] = list(source_by_id.values())
    for source in research['sources'] + book_config.get('sources', []):
        if not any(old['id'] == source['id'] for old in directory['sources']):
            directory['sources'].append(source)

    # 配置是自动题名映射的唯一来源；撤回误归后，旧输出不能继续让本册命中。
    for book_id, override in taxonomy['bookOverrides'].items():
        sources = set(override.get('sourceIds', [])) | {
            item.get('sourceId') for item in override.get('evidence', []) if item.get('sourceId')}
        if (book_id not in book_config['books'] and override.get('status') == 'title-fallback'
                and sources and sources.issubset(GENERATED_TOPIC_SOURCES)):
            override['topics'] = [value for value in override.get('topics', []) if value.startswith('patterns.')]
            override['evidence'] = [item for item in override.get('evidence', []) if item.get('sourceId') not in GENERATED_TOPIC_SOURCES]
            override['sourceIds'] = [value for value in override.get('sourceIds', []) if value not in GENERATED_TOPIC_SOURCES]
            override.update(status='pending', basis='已撤回不明确的题名主题；等待本册具体内容依据。')
            book = by_book.get(book_id)
            if book and book.get('topicStatus') == 'title-fallback':
                book.update(topicStatus='pending', topicBasis=override['basis'])

    # 所有关键词判断在离线工具完成；运行页面只读明确书目ID映射。
    for book_id, item in book_config['books'].items():
        if book_id not in by_book:
            raise ValueError('未知稳定书目ID：' + book_id)
        book = by_book[book_id]
        if item.get('topics'):
            override = taxonomy['bookOverrides'].setdefault(book_id, {'topics': []})
            if item.get('status') in ('title-fallback', 'description-derived') and (
                    override.get('status') in ('content-verified', 'classification-verified') or
                    book.get('topicStatus') in ('content-verified', 'classification-verified')):
                continue
            if override.get('status') in ('title-fallback', 'description-derived'):
                override['topics'] = unique(item['topics'] + [value for value in override.get('topics', []) if value.startswith('patterns.')])
                override['evidence'] = [value for value in override.get('evidence', []) if value.get('sourceId') not in GENERATED_TOPIC_SOURCES]
                override['sourceIds'] = unique(item.get('sourceIds', []) + [value for value in override.get('sourceIds', []) if value not in GENERATED_TOPIC_SOURCES])
            merge_record(override, item)
            if book.get('topicStatus') in ('pending', 'title-fallback', 'description-derived'):
                book['topicStatus'], book['topicBasis'] = item['status'], item['basis']

    # 原有一级分类不降级；新增二级单独说明较弱依据，避免同名跨维度扩散。
    for book_id, item in book_config.get('refinements', {}).items():
        if book_id not in by_book:
            raise ValueError('未知二级补充书目ID：' + book_id)
        override = taxonomy['bookOverrides'].setdefault(book_id, {'topics': []})
        merge_record(override, {key: value for key, value in item.items() if key not in ('basis', 'status')})
        override['subtopicStatus'] = item['subtopicStatus']
        override['subtopicBasis'] = item['basis']
        override['subtopicRefinement'] = item

    taxonomy['resourceMappings'] = resource_config['resources']
    for resource_id, item in research.get('resources', {}).items():
        merge_record(taxonomy['resourceMappings'].setdefault(resource_id, {'topics': []}), item)

    pattern_nodes = {canonical(n['label']): n['id'] for n in taxonomy['nodes'] if n.get('parentId') == 'patterns'}

    def pattern_id(text):
        key = canonical(text)
        if key not in pattern_nodes:
            identifier = 'patterns.' + hashlib.sha256(key.encode()).hexdigest()[:12]
            taxonomy['nodes'].append({'id': identifier, 'label': text, 'parentId': 'patterns'})
            pattern_nodes[key] = identifier
            nodes.add(identifier)
        return pattern_nodes[key]

    matched, unmatched, reference_only = [], [], []
    research_sources = {table['sourceId'] for table in research['tables']}
    for override in taxonomy['bookOverrides'].values():
        if 'evidence' in override:
            override['evidence'] = [value for value in override['evidence']
                                    if not (value.get('sourceId') in research_sources and value.get('kind') == 'sentence-pattern-table')]
        if 'patterns' in override:
            override['patterns'] = [value for value in override['patterns'] if value.get('sourceId') not in research_sources]
    for table in research['tables']:
        for row in table['rows']:
            record = {'sourceId': table['sourceId'], 'resourceId': table['resourceId'], 'title': row['title'], 'locator': row.get('locator')}
            source_level = row.get('sourceLevel', table.get('sourceLevel'))
            if source_level:
                record['sourceLevel'] = source_level
            candidates = [book for book in directory['books']
                          if book['resourceId'] == table['resourceId']
                          and book.get('level', '').lower() in [level.lower() for level in table['levels']]
                          and table.get('editionContains', '') in book.get('edition', '')
                          and title_key(book['title']) == title_key(row['title'])]
            if row.get('bookId'):
                if row['bookId'] not in by_book:
                    raise ValueError('未知分类表书目ID：' + row['bookId'])
                if not any(book['id'] == row['bookId'] for book in candidates):
                    raise ValueError('分类表书目ID与套系、级别、版本或题名冲突：' + row['bookId'])
                candidates = [book for book in candidates if book['id'] == row['bookId']]
            if table['status'] == 'reference-only':
                reference_only.append({**record, **({'bookId': row['bookId']} if row.get('bookId') else {}), 'reason': table['scopeNote']})
                continue
            if len(candidates) != 1:
                unmatched.append({**record, 'candidateIds': [b['id'] for b in candidates], 'reason': '没有唯一同套同级同题名条目；不按序号或其他版次绑定。'})
                continue
            book = candidates[0]
            override = taxonomy['bookOverrides'].setdefault(book['id'], {'topics': []})
            if row.get('topics') and override.get('status') in ('title-fallback', 'description-derived'):
                # 新正文采用自己的内容主题，旧题名候选不能跟着升级为已核分类。
                override['topics'] = [value for value in override.get('topics', []) if value.startswith('patterns.')]
                override['evidence'] = [value for value in override.get('evidence', []) if value.get('sourceId') not in GENERATED_TOPIC_SOURCES]
                override['sourceIds'] = [value for value in override.get('sourceIds', []) if value not in GENERATED_TOPIC_SOURCES]
            evidence = {'sourceId': table['sourceId'], 'locator': row.get('locator', ''),
                        'summary': table.get('scopeNote', '') + row.get('note', '') or row.get('locator', ''),
                        'kind': 'sentence-pattern-table' if row['patterns'] else 'content-summary'}
            if source_level:
                evidence['sourceLevel'] = source_level
            value = {'topics': row.get('topics', []) + [pattern_id(text) for text in row['patterns']],
                     'patterns': [{'text': text, 'sourceId': table['sourceId'], 'note': row.get('note', table.get('scopeNote', ''))} for text in row['patterns']],
                     'sourceIds': [table['sourceId']], 'evidence': [evidence]}
            if row.get('topics'):
                description = table['status'] == 'description-derived'
                value['evidence'].append({'kind': 'content-description' if description else 'content-summary',
                                          'sourceId': table['sourceId'],
                                          'locator': row.get('locator', ''),
                                          'summary': row.get('locator', ''),
                                          **({'url': source_by_id[table['sourceId']]['url']} if description else {})})
            merge_record(override, value)
            if row['patterns']:
                override['patternStatus'] = 'classification-verified'
            elif not override.get('patterns'):
                override.pop('patternStatus', None)
            if row.get('topics') and book.get('topicStatus') in ('pending', 'title-fallback', 'description-derived'):
                override['status'] = book['topicStatus'] = table['status']
                override['basis'] = book['topicBasis'] = '按已读公开正文的本册内容归类；句型来源与主题分别保留。'
            matched.append({**record, 'bookId': book['id'], 'patterns': row['patterns']})
    for resource_id, item in research.get('resources', {}).items():
        mapped = taxonomy['resourceMappings'][resource_id]
        mapped['topics'] = unique(mapped.get('topics', []) + [pattern_id(p['text']) for p in item.get('patterns', [])])

    for item in list(taxonomy['bookOverrides'].values()) + list(taxonomy['resourceMappings'].values()):
        if item.get('evidence'):
            # 重建的句型证据始终排在保留证据后，重跑不因删除再追加而改变输出顺序。
            item['evidence'].sort(key=lambda value: value.get('kind') == 'sentence-pattern-table')
        unknown = set(item.get('topics', [])) - nodes
        if unknown:
            raise ValueError('未知主题：' + ', '.join(unknown))
    taxonomy['checkedAt'] = research['checkedAt']
    write(DATA / 'topic-taxonomy.json', taxonomy)
    write(DATA / 'resource-books.json', directory)
    report = {'checkedAt': research['checkedAt'], 'matched': matched, 'unmatched': unmatched, 'referenceOnly': reference_only,
              'note': '小红书分类表／正文的逐项采用结果；参考版次、未唯一匹配及疑似语法错误不作原书句型。'}
    report_date = research['checkedAt'].replace('-', '')
    write(ROOT / 'docs/audits' / ('material-topic-patterns-' + report_date + '.json'), report)
    print(json.dumps({'matched': len(matched), 'unmatched': len(unmatched), 'referenceOnly': len(reference_only)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
