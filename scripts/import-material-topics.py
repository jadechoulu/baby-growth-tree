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


TITLE_PATTERN_FALLBACK_SOURCE = 'catalog-title-pattern-fallback-20261118'
TITLE_PATTERN_RULES = [
    (r'^(?:i|we) can see|^i see\b', 'patterns.group-see', '题名以 I / we can see 或 I see 开头'),
    (r'^(?:i|we)? ?(?:like|love)\b|^do you like\b', 'patterns.group-like', '题名包含 like / love'),
    (r'^here (?:is|are|comes)\b', 'patterns.group-here', '题名以 Here is / are / Here comes 开头'),
    (r'^(?:look|watch)(?: at|!)?\b', 'patterns.group-look', '题名以 Look at / Watch 开头'),
    (r'^(?:i|we) (?:have|has)\b| has\b| have\b', 'patterns.group-have', '题名包含 have / has'),
    (r'^(?:this|that|these|those|it) (?:is|are)\b|^he is\b|^she is\b|^here is\b|^there is\b', 'patterns.group-be', '题名以系动词结构开头'),
    (r'^come (?:and|in|to|over)\b|^come here\b', 'patterns.group-come-see', '题名以 Come ... 开头'),
    (r'^(?:is|are) doing\b| (?:is|are) \w+ing\b', 'patterns.group-doing', '题名包含进行时结构'),
    (r'^(?:i|we) can (?!see)\b| can\b', 'patterns.group-can', '题名包含 can'),
    (r'^there (?:is|are|were)\b', 'patterns.group-there', '题名以 There is / are 开头'),
    (r'^what\b|^where\b|^who\b|^why\b|^how\b|^when\b|^do you\b|^can you\b|^would you\b|^is it\b|^are they\b|\?$', 'patterns.group-questions', '题名是疑问结构'),
    (r"^let(?:'s| me)\b", 'patterns.group-let', '题名以 Let’s / Let me 开头'),
    (r'^(?:get|put|use|open|close|stop|draw|paint|make|count|wash|clean|tidy|brush|wake|go straight|turn left|turn right)\b', 'patterns.group-requests', '题名是明确指令'),
    (r'\b(?:goes|go|goes to|went|goes on|going to)?\b.*\b(?:goes|go|gone|went)\b|\bgoing to\b|\bwill\b', 'patterns.group-go', '题名包含 go / went / going / will / going to'),
    (r'^(?:in|on|under|inside|out|up|down)\b|\bis in\b|\bis on\b', 'patterns.group-location', '题名是位置结构'),
    (r'^(?:i hear|this feels|this looks|this smells|this sounds|this tastes)\b', 'patterns.group-senses', '题名是感官表达'),
]


def pattern_free(mapping):
    if list((mapping or {}).get('patterns', [])):
        return False
    if any(str(value or '').startswith('patterns.') for value in list((mapping or {}).get('topics', []))):
        return False
    return True

def is_single_word_pattern(text):
    value=str(text or '').strip()
    return '…' not in value and '...' not in value and bool(re.fullmatch(r'[A-Za-z]+[.!?]?', value))

def book_patterns(book):
    values=[]
    guide=book.get('studyGuide')
    guides=guide if isinstance(guide,list) else [guide] if isinstance(guide,dict) else []
    for item in guides:
        source_id=item.get('sourceId') if isinstance(item,dict) else None
        for pattern in list((item or {}).get('patterns', [])):
            if not isinstance(pattern,dict) or not pattern.get('text'):
                continue
            text=str(pattern['text'])
            # 单个英语词没有句型结构，即使被放在旧表“句型”列也不冒充句型。
            if is_single_word_pattern(text):
                continue
            value=dict(pattern)
            if not value.get('sourceId') and source_id:
                value['sourceId']=source_id
            values.append(value)
    values.extend(dict(item) for item in list(book.get('patterns', [])) if isinstance(item,dict) and item.get('text'))
    return [item for item in values if item.get('text')]


def title_pattern_group(title):
    value = re.sub(r'\s+', ' ', str(title or '').strip())
    for regex, group, reason in TITLE_PATTERN_RULES:
        if re.search(regex, value, re.I):
            return group, reason
    return 'patterns.group-other', '题名不是已识别的语句结构，先用其他句型归类保持可筛选'

def add_title_pattern_fallback(mapping, title, locator, checked_at):
    group = title_pattern_group(title)[0]
    mapping['topics'] = unique(list(mapping.get('topics', [])) + [group])
    mapping['patternSourceIds'] = [TITLE_PATTERN_FALLBACK_SOURCE]
    mapping['patternStatus'] = 'title-fallback'


def unique_by_pattern_text(values):
    result, seen = [], set()
    for value in values:
        key = canonical(value.get('text'))
        if key not in seen:
            result.append(value)
            seen.add(key)
    return result

def remove_title_pattern_fallback(mapping):
    for key in ('patterns', 'patternSourceIds', 'patternStatus', 'patternBasis'):
        mapping.pop(key, None)
    mapping['topics'] = [item for item in mapping.get('topics', []) if not str(item).startswith('patterns.group-')]
    mapping['sourceIds'] = [item for item in mapping.get('sourceIds', []) if item != TITLE_PATTERN_FALLBACK_SOURCE]
    mapping['evidence'] = [item for item in mapping.get('evidence', [])
                           if item.get('sourceId') != TITLE_PATTERN_FALLBACK_SOURCE and item.get('kind') not in ('title-pattern-fallback', 'sandbox-sentence-pattern-table')]


def apply_title_pattern_fallback(taxonomy, directory, by_book, checked_at):
    fallback_books, mapped_unrouted_books, fallback_resources = [], [], []
    relation_by_book = {book_id: group for group in directory.get('readingEquivalences', [])
                        for book_id in group.get('bookIds', []) if group.get('kind') == 'same-isbn'}
    for book in by_book.values():
        mapping = taxonomy['bookOverrides'].setdefault(book['id'], {'topics': []})
        if mapping.get('patternStatus') == 'title-fallback':
            remove_title_pattern_fallback(mapping)
        raw_patterns = book_patterns(book)
        raw_by_text={canonical(item.get('text')):item for item in raw_patterns}
        for item in list(mapping.get('patterns', [])):
            if is_single_word_pattern(item.get('text')):
                mapping['patterns'].remove(item)
            elif item.get('sourceId') in (None, TITLE_PATTERN_FALLBACK_SOURCE):
                replacement=raw_by_text.get(canonical(item.get('text')))
                if replacement:
                    mapping['patterns'][mapping['patterns'].index(item)]=replacement
                else:
                    mapping['patterns'].remove(item)
        mapping['patterns']=[item for item in mapping.get('patterns', []) if item.get('sourceId') not in (None,TITLE_PATTERN_FALLBACK_SOURCE)]
        valid_sources=[item.get('sourceId') for item in mapping.get('patterns', []) if item.get('sourceId')]
        mapping['sourceIds']=[item for item in mapping.get('sourceIds', []) if item not in (None,TITLE_PATTERN_FALLBACK_SOURCE)]
        mapping['evidence']=[item for item in mapping.get('evidence', []) if item.get('sourceId') not in (None,TITLE_PATTERN_FALLBACK_SOURCE)]
        if valid_sources:
            mapping['sourceIds']=unique(list(mapping['sourceIds'])+valid_sources)
            mapping['patternStatus']='classification-verified'
            mapping['patternBasis']='原表或已核句型保留原文，并按用户确认的同类结构聚合。'
        else:
            mapping.pop('patterns', None);mapping.pop('patternStatus', None);mapping.pop('patternBasis', None)
            mapping['topics']=[item for item in mapping.get('topics', []) if not str(item).startswith('patterns.group-')]
        related_ids = list(relation_by_book.get(book['id'], {}).get('bookIds', []))
        related_has_pattern = any(
            not pattern_free(taxonomy['bookOverrides'].get(other_id)) or book_patterns(by_book.get(other_id, {}))
            for other_id in related_ids
        )
        if pattern_free(mapping) and raw_patterns and not related_has_pattern:
            pattern = raw_patterns[0]
            group, reason = title_pattern_group(pattern['text'])
            mapping['topics'] = unique(list(mapping.get('topics', [])) + [group])
            mapping['patterns'] = unique_by_pattern_text(list(mapping.get('patterns', [])) + raw_patterns)
            source_ids = [value.get('sourceId') for value in raw_patterns if value.get('sourceId')]
            mapping['sourceIds'] = unique(list(mapping.get('sourceIds', [])) + source_ids)
            mapping.setdefault('evidence', []).append({
                'kind': 'sentence-pattern-table', 'sourceId': pattern.get('sourceId'),
                'locator': '公共目录稳定单册 ' + book['id'] + ' 的原句型',
                'originalTitle': book.get('title'), 'summary': '原句型缺少公共映射：' + reason,
                'checkedAt': checked_at
            })
            mapping['patternStatus'] = 'classification-verified'
            mapping['patternBasis'] = '原表或已核句型保留原文，并按用户确认的同类结构聚合。'
            mapped_unrouted_books.append(book['id'])
        elif pattern_free(mapping) and not raw_patterns and not related_has_pattern:
            add_title_pattern_fallback(mapping, book.get('title'), '公共目录稳定单册 ' + book['id'], checked_at)
            fallback_books.append(book['id'])
    for resource_id, mapping in taxonomy['resourceMappings'].items():
        title = mapping.get('title') or resource_id
        if mapping.get('patternStatus') == 'title-fallback':
            remove_title_pattern_fallback(mapping)
        if pattern_free(mapping):
            add_title_pattern_fallback(mapping, title, '公共素材 ' + resource_id, checked_at)
            fallback_resources.append(resource_id)
    return fallback_books, mapped_unrouted_books, fallback_resources


def main():
    taxonomy, directory = read('topic-taxonomy'), read('resource-books')
    research, resource_config, book_config = (read(name) for name in (
        'material-topic-research', 'material-resource-topics', 'material-book-topics'))
    by_book = {book['id']: book for book in directory['books']}
    # 阅读计划在构建时投影为同一公共单册，主题仍按其原稳定ID保存。
    for plan in read('reading-plans').get('plans', []):
        for book in plan.get('books', []):
            by_book.setdefault(book['id'], book)
    nodes = {node['id'] for node in taxonomy['nodes']} | {group['id'] for group in taxonomy.get('patternGroups', [])}
    for node in book_config.get('nodes', []):
        if node['id'] not in nodes:
            taxonomy['nodes'].append(node)
            nodes.add(node['id'])
    title_pattern_source = {
        'id': TITLE_PATTERN_FALLBACK_SOURCE, 'title': '公共素材题名句型兜底（用户授权）',
        'kind': 'title-pattern-fallback', 'checkedAt': '2026-11-18',
        'locator': '公共resource-books目录与material-resource-topics逐项标题',
        'note': '仅在缺少原表、正文、简介或小红书句型依据时使用；按明确题名结构归入现有句型聚合，不确定时归其他，并保留原题名、规则和弱依据说明。'
    }
    for config in (research, book_config, resource_config):
        if not any(source['id'] == TITLE_PATTERN_FALLBACK_SOURCE for source in config.get('sources', [])):
            config.setdefault('sources', []).append(title_pattern_source)
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

    fallback_books, mapped_unrouted_books, fallback_resources = apply_title_pattern_fallback(taxonomy, directory, by_book, '2026-11-18')

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
              'titlePatternFallback': {'checkedAt': '2026-11-18', 'books': len(fallback_books), 'mappedWithoutRoute': len(mapped_unrouted_books), 'resources': len(fallback_resources),
                                       'sourceId': TITLE_PATTERN_FALLBACK_SOURCE,
                                       'note': '资料优先后仍无句型依据的公共素材，按明确题名归入现有聚合；不能识别结构的题名归其他，保留弱依据。'},
              'note': '小红书分类表、正文与题名兜底的逐项采用结果；参考版次、未唯一匹配及疑似语法错误不作原书句型。'}
    report_date = research['checkedAt'].replace('-', '')
    write(ROOT / 'docs/audits' / ('material-topic-patterns-' + report_date + '.json'), report)
    print(json.dumps({'matched': len(matched), 'unmatched': len(unmatched), 'referenceOnly': len(reference_only),
                      'titlePatternFallbackBooks': len(fallback_books), 'titlePatternMappedBooks': len(mapped_unrouted_books), 'titlePatternFallbackResources': len(fallback_resources)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
