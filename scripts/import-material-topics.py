"""将可复核的全素材分类配置并入共用主题库；不访问网络或修改个人事实。"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'english/data'


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

    # 所有关键词判断在离线工具完成；运行页面只读明确书目ID映射。
    for book_id, item in book_config['books'].items():
        if book_id not in by_book:
            raise ValueError('未知稳定书目ID：' + book_id)
        book = by_book[book_id]
        if item.get('topics'):
            override = taxonomy['bookOverrides'].setdefault(book_id, {'topics': []})
            if override.get('status') in ('title-fallback', 'description-derived'):
                override['topics'] = [value for value in override.get('topics', []) if value.startswith('patterns.')]
                generated_sources = {'catalog-title-topic-fallback-20261114', 'xhs-public-content-topics-20261114'}
                override['evidence'] = [value for value in override.get('evidence', []) if value.get('sourceId') not in generated_sources]
                override['sourceIds'] = [value for value in override.get('sourceIds', []) if value not in generated_sources]
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
        for field in ('evidence', 'patterns'):
            if field in override:
                override[field] = [value for value in override[field] if value.get('sourceId') not in research_sources]
    for table in research['tables']:
        for row in table['rows']:
            record = {'sourceId': table['sourceId'], 'resourceId': table['resourceId'], 'title': row['title'], 'locator': row.get('locator')}
            if table['status'] == 'reference-only':
                reference_only.append({**record, 'reason': table['scopeNote']})
                continue
            candidates = [book for book in directory['books']
                          if book['resourceId'] == table['resourceId']
                          and book.get('level', '').lower() in [level.lower() for level in table['levels']]
                          and table.get('editionContains', '') in book.get('edition', '')
                          and title_key(book['title']) == title_key(row['title'])]
            if len(candidates) != 1:
                unmatched.append({**record, 'candidateIds': [b['id'] for b in candidates], 'reason': '没有唯一同套同级同题名条目；不按序号或其他版次绑定。'})
                continue
            book = candidates[0]
            override = taxonomy['bookOverrides'].setdefault(book['id'], {'topics': []})
            evidence = {'sourceId': table['sourceId'], 'locator': row.get('locator', ''),
                        'summary': table.get('scopeNote', '') + row.get('note', '') or row.get('locator', ''), 'kind': 'sentence-pattern-table'}
            value = {'topics': row.get('topics', []) + [pattern_id(text) for text in row['patterns']],
                     'patterns': [{'text': text, 'sourceId': table['sourceId'], 'note': row.get('note', table.get('scopeNote', ''))} for text in row['patterns']],
                     'sourceIds': [table['sourceId']], 'evidence': [evidence]}
            if row.get('topics'):
                value['evidence'].append({'kind': 'content-summary', 'sourceId': table['sourceId'],
                                          'locator': row.get('locator', ''),
                                          'summary': row.get('locator', '')})
            merge_record(override, value)
            override['patternStatus'] = 'classification-verified'
            if row.get('topics') and book.get('topicStatus') in ('pending', 'title-fallback', 'description-derived'):
                override['status'] = book['topicStatus'] = table['status']
                override['basis'] = book['topicBasis'] = '按已读公开正文的本册内容归类；句型来源与主题分别保留。'
            matched.append({**record, 'bookId': book['id'], 'patterns': row['patterns']})
    for resource_id, item in research.get('resources', {}).items():
        mapped = taxonomy['resourceMappings'][resource_id]
        mapped['topics'] = unique(mapped.get('topics', []) + [pattern_id(p['text']) for p in item.get('patterns', [])])

    for item in list(taxonomy['bookOverrides'].values()) + list(taxonomy['resourceMappings'].values()):
        unknown = set(item.get('topics', [])) - nodes
        if unknown:
            raise ValueError('未知主题：' + ', '.join(unknown))
    taxonomy['checkedAt'] = '2026-11-14'
    write(DATA / 'topic-taxonomy.json', taxonomy)
    write(DATA / 'resource-books.json', directory)
    report = {'checkedAt': '2026-11-14', 'matched': matched, 'unmatched': unmatched, 'referenceOnly': reference_only,
              'note': '小红书分类表／正文的逐项采用结果；参考版次、未唯一匹配及疑似语法错误不作原书句型。'}
    write(ROOT / 'docs/audits/material-topic-patterns-20261114.json', report)
    print(json.dumps({'matched': len(matched), 'unmatched': len(unmatched), 'referenceOnly': len(reference_only)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
