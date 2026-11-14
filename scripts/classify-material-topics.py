#!/usr/bin/env python3
"""离线生成逐册主题建议；不访问网络、不修改目录身份或个人事实。

本工具只消费已核外站身份的公开书目简介。生成结果需要复核后再经统一
导入脚本写入 taxonomy；页面不运行关键词推断。没有明确资料时按用户要求
采用题名兜底，并保留这个较弱的依据等级，绝不据此生成句型。
"""
import argparse
import collections
import hashlib
import html
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
GENERATED_SOURCES = {'xhs-public-content-topics-20261114', 'catalog-title-topic-fallback-20261114'}


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def dump(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def normal(value):
    value = unicodedata.normalize('NFKC', str(value or '')).replace('’', "'")
    return re.sub(r'[^a-z0-9\u4e00-\u9fff]+', ' ', value.lower()).strip()


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', str(value or '')))).strip()


def title_text(title, config):
    """只剥离明确配置的套系/目录前后缀，不把系列名中的Cat等当本册主题。"""
    result = str(title or '').strip()
    for pattern in config['titlePrefixPatterns']:
        result = re.sub(pattern, '', result, flags=re.I)
    for pattern in config['titleSuffixPatterns']:
        result = re.sub(pattern, '', result, flags=re.I)
    return result.strip()


def compile_rules(config, nodes):
    result = []
    for rule in config['rules']:
        if rule['topic'] not in nodes or rule['topic'].startswith('patterns'):
            raise ValueError('非法主题规则：' + rule['topic'])
        terms = [r'(?<![A-Za-z])' + re.escape(term).replace(r'\ ', r'\s+') + r'(?![A-Za-z])'
                 for term in rule.get('terms', [])]
        terms += [re.escape(term) for term in rule.get('chineseTerms', [])]
        if rule.get('regex'):
            terms.append(rule['regex'])
        result.append((rule, re.compile('|'.join(terms), re.I),
                       re.compile(rule['exclude'], re.I) if rule.get('exclude') else None))
    return result


def match_topics(text, rules):
    hits = []
    for rule, pattern, excluded in rules:
        if excluded and excluded.search(text):
            continue
        matches = list(pattern.finditer(text))
        if matches:
            hits.append({'topic': rule['topic'], 'ruleId': rule['id'],
                         'matchedText': list(dict.fromkeys(m.group() for m in matches))[:4]})
    # 如果已有具体二级，去掉同一级的冗余父标签，不扩大实际范围。
    parents = {hit['topic'].split('.')[0] for hit in hits if '.' in hit['topic']}
    return [hit for hit in hits if '.' in hit['topic'] or hit['topic'] not in parents]


def sentences(value):
    value = html.unescape(re.sub(r'<[^>]+>', ' ', str(value or '')))
    return [plain(item) for item in re.split(r'(?<=[.!?。！？；])\s*|[\r\n]+', value) if plain(item)]


def description_index(descriptions):
    by_guid, counts = collections.defaultdict(list), collections.defaultdict(set)
    for item in descriptions:
        guid = str(item.get('guid') or '')
        if not guid or item.get('error') or item.get('httpStatus', 200) != 200:
            continue
        by_guid[guid].append(item)
        for sentence in sentences(item.get('introduction')):
            if len(normal(sentence)) > 18:
                counts[normal(sentence)].add(normal(item.get('name')))
    return by_guid, {sentence: len(names) for sentence, names in counts.items()}


def book_guids(book):
    """只接受目录已有的外站身份；不以相同题名跨版本借用简介。"""
    values = list(book.get('externalIds', {}).get('xiaohuasheng', []))
    value = book.get('catalogMetadata', {}).get('sourcePublicGuid')
    if value:
        values.append(value)
    for url in [book.get('detailUrl'), book.get('coverSource', {}).get('sourceUrl')]:
        match = re.search(r'xiaohuasheng\.cn/book/([a-f0-9]+)(?:[/?#]|$)', url or '', re.I)
        if match:
            values.append(match.group(1))
    return list(dict.fromkeys(str(value) for value in values))


def description_topics(book, index, repeated, config, rules):
    generic = [re.compile(pattern, re.I) for pattern in config['genericDescriptionPatterns']]
    candidates = [item for guid in book_guids(book) for item in index.get(guid, [])]
    # 同身份多个公开缓存选实际有内容的一份；最长简介不天然更可信。
    accepted, rejected = [], []
    for item in candidates:
        records = []
        for sentence in sentences(item.get('introduction')):
            # 部分接口把书名原样填进简介；这是题名依据，不能提升为简介依据。
            if normal(title_text(sentence, config)) in {
                    normal(title_text(book['title'], config)), normal(title_text(item.get('name'), config))}:
                rejected.append('简介仅重复题名')
                continue
            if len(sentence) < 18 and len(re.findall(r'[\u4e00-\u9fff]', sentence)) < 8:
                continue
            if any(pattern.search(sentence) for pattern in generic):
                rejected.append('套系介绍／阅读推广段')
                continue
            if repeated.get(normal(sentence), 0) > config['descriptionMaxRepeatedBooks']:
                rejected.append('多册重复的通用介绍段')
                continue
            matches = match_topics(sentence, rules)
            if matches:
                records.append((sentence, matches))
        if not records:
            continue
        topics = list(dict.fromkeys(hit['topic'] for _, matches in records for hit in matches))
        # 多于12个主题通常是整套或书单介绍，不能下传为单册。
        if len(topics) > 12:
            rejected.append('简介含过多主题，无法确认是本册范围')
            continue
        accepted.append((topics, records, item))
    if not accepted:
        return None, list(dict.fromkeys(rejected))
    topics, records, item = max(accepted, key=lambda row: sum(len(sentence) for sentence, _ in row[1]))
    evidence = []
    for sentence, matches in records:
        # 仅保存命中所在句，不复制整篇简介；过长句按命中附近截取。
        excerpt = sentence
        if len(excerpt) > 480:
            first = matches[0]['matchedText'][0]
            start = max(0, sentence.lower().find(first.lower()) - 120)
            excerpt = ('…' if start else '') + sentence[start:start + 440] + '…'
        evidence.append({'kind': 'content-description', 'sourceId': 'xhs-public-content-topics-20261114',
                         'url': 'https://www.xiaohuasheng.cn/book/' + str(item['guid']),
                         'locator': '公开书目详情 introduction；外站身份 ' + str(item['guid']),
                         'summary': excerpt, 'matches': matches,
                         'checkedAt': '2026-11-14'})
    return {'topics': topics, 'status': 'description-derived',
            'basis': '按本册已关联外站身份的公开内容简介归类；保存命中摘要，未逐页核对正文，不将套系推广介绍下传。',
            'sourceIds': ['xhs-public-content-topics-20261114'], 'evidence': evidence}, list(dict.fromkeys(rejected))


def existing_topics(book, taxonomy):
    override = taxonomy.get('bookOverrides', {}).get(book['id'], {})
    sources = set(override.get('sourceIds', [])) | {item.get('sourceId') for item in override.get('evidence', []) if item.get('sourceId')}
    # 已导入本工具的低置信建议仍可在下次取得新简介/分类图后升级。
    # 不因首次导入造成第二次运行全变成preserved并清空持久配置。
    if sources and sources.issubset(GENERATED_SOURCES):
        override = {}
    legacy = [] if book.get('topicStatus') in ('title-fallback', 'description-derived') else book.get('topics', [])
    return [value for value in override.get('topics', []) if not value.startswith('patterns')] or legacy


def classify(book, taxonomy, config, rules, index, repeated):
    prior = existing_topics(book, taxonomy)
    if prior or book.get('topicStatus') in ('classification-verified', 'content-verified'):
        return {'id': book['id'], 'title': book['title'], 'resourceId': book['resourceId'],
                'status': 'preserved', 'reason': '沿用既有明确分类／内容映射，不以较弱简介或标题覆盖。', 'topics': prior}
    description, rejected = description_topics(book, index, repeated, config, rules)
    if description:
        return {'id': book['id'], 'title': book['title'], 'resourceId': book['resourceId'], **description}
    title = title_text(book['title'], config)
    ambiguous = {normal(value) for value in config.get('ambiguousTitles', [])}
    hits = [] if normal(title) in ambiguous else match_topics(title, rules)
    if hits:
        return {'id': book['id'], 'title': book['title'], 'resourceId': book['resourceId'],
                'topics': list(dict.fromkeys(hit['topic'] for hit in hits)), 'status': 'title-fallback',
                'basis': '按用户要求，以剥离已知套系／级别前缀后的单册题名兜底；仅作查找线索，不表示已核正文或本册句型。',
                'sourceIds': ['catalog-title-topic-fallback-20261114'],
                'evidence': [{'kind': 'title-fallback', 'sourceId': 'catalog-title-topic-fallback-20261114',
                              'locator': '公共目录稳定单册 ' + book['id'],
                              'originalTitle': book['title'], 'classificationTitle': title,
                              'summary': '仅按题名兜底：' + title, 'matches': hits,
                              'checkedAt': '2026-11-14'}],
                **({'descriptionRejected': rejected} if rejected else {})}
    reason = '公开简介没有可采用的本册主题，题名含义不明确或未命中可解释的主题。'
    if normal(title) in ambiguous:
        reason = '题名存在歧义／习语，未据表面词语推断内容；等待具体简介或原文。'
    return {'id': book['id'], 'title': book['title'], 'resourceId': book['resourceId'],
            'status': 'pending', 'topics': [], 'reason': reason,
            **({'descriptionRejected': rejected} if rejected else {})}


def effective_topics(book, taxonomy):
    """与公共模型一致应用旧标签及replaceLegacy；不含句型维度。"""
    override = taxonomy.get('bookOverrides', {}).get(book['id'], {})
    replaced = set(override.get('replaceLegacy', []))
    values = []
    for value in book.get('topics', []):
        legacy = taxonomy.get('legacyBookLabels', {}).get(value, value)
        if legacy not in replaced:
            values.extend(taxonomy.get('legacyBookTopics', {}).get(legacy, [legacy]))
    values.extend(override.get('topics', []))
    # 仅剥离上次本工具的补细分；原始一级、原表映射与独立证据不改。
    prior = set(override.get('subtopicRefinement', {}).get('topics', []))
    return list(dict.fromkeys(value for value in values if value not in prior and not value.startswith('patterns')))


def refine_root_only(book, taxonomy, config, rules, index, repeated):
    """只把原有一级细化到同父级二级，不借标题扩散另一内容根。"""
    nodes = {node['id']: node for node in taxonomy['nodes'] + config.get('nodes', [])}
    current = effective_topics(book, taxonomy)
    if not current or any(nodes.get(value, {}).get('parentId') for value in current):
        return None
    parents = set(current)
    def select(values):
        return [value for value in values if nodes.get(value, {}).get('parentId') in parents]
    description, _ = description_topics(book, index, repeated, config, rules)
    chosen = select(description['topics']) if description else []
    if chosen:
        record = {**description, 'topics': chosen, 'subtopicStatus': 'description-derived'}
        record.pop('status', None)
        record['basis'] = '保留原分类及核对状态；仅依据本册已关联的公开简介，在原有一级范围内补充二级。'
        # 证据只列本次实际采用的二级命中，避免旁支主题误显示为本次结论。
        record['evidence'] = [{**item, 'matches': [hit for hit in item.get('matches', []) if hit['topic'] in chosen]}
                              for item in record['evidence'] if any(hit['topic'] in chosen for hit in item.get('matches', []))]
        return record
    title = title_text(book['title'], config)
    if normal(title) in {normal(value) for value in config.get('ambiguousTitles', [])}:
        return None
    hits = [hit for hit in match_topics(title, rules) if select([hit['topic']])]
    if not hits:
        return None
    return {'topics': list(dict.fromkeys(hit['topic'] for hit in hits)), 'subtopicStatus': 'title-fallback',
            'basis': '保留原分类及核对状态；按用户要求仅以本册题名，在原有一级范围内补二级查找标签；未借用同名其他版本内容。',
            'sourceIds': ['catalog-title-topic-fallback-20261114'],
            'evidence': [{'kind': 'title-fallback', 'sourceId': 'catalog-title-topic-fallback-20261114',
                          'locator': '公共目录稳定单册 ' + book['id'], 'originalTitle': book['title'],
                          'classificationTitle': title, 'summary': '二级题名兜底（限原有一级）：' + title,
                          'matches': hits, 'checkedAt': '2026-11-14'}]}


def all_books(directory, plans):
    books = list(directory['books'])
    ids = {book['id'] for book in books}
    for plan in plans.get('plans', []):
        for book in plan.get('books', []):
            if book['id'] not in ids:
                books.append({**book, 'resourceId': plan['resourceId'], 'edition': plan['edition'], 'topics': []})
                ids.add(book['id'])
    return books


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', default=ROOT / 'english/data/resource-books.json')
    parser.add_argument('--plans', default=ROOT / 'english/data/reading-plans.json')
    parser.add_argument('--taxonomy', default=ROOT / 'english/data/topic-taxonomy.json')
    parser.add_argument('--rules', default=ROOT / 'english/data/material-topic-rules.json')
    parser.add_argument('--descriptions', action='append', default=[])
    parser.add_argument('--output', default='/tmp/book-topic-proposals.json')
    parser.add_argument('--report', default='/tmp/book-topic-report.json')
    parser.add_argument('--config-output', help='将有建议的精简显式映射写入持久配置；不含原始简介全文或私有路径')
    parser.add_argument('--refinements-only', action='store_true', help='只更新持久配置refinements；不改books原映射')
    args = parser.parse_args()
    directory, plans, taxonomy, config = map(load, (args.directory, args.plans, args.taxonomy, args.rules))
    descriptions = [item for path in args.descriptions for item in load(path)]
    index, repeated = description_index(descriptions)
    rules = compile_rules(config, {node['id'] for node in taxonomy['nodes'] + config.get('nodes', [])})
    books = all_books(directory, plans)
    if args.refinements_only:
        if not args.config_output or not Path(args.config_output).exists():
            raise ValueError('--refinements-only需要已存在的--config-output')
        saved = load(args.config_output)
        saved['refinements'] = {book['id']: record for book in books
                                for record in [refine_root_only(book, taxonomy, config, rules, index, repeated)] if record}
        dump(args.config_output, saved)
        counts = collections.Counter(record['subtopicStatus'] for record in saved['refinements'].values())
        print(json.dumps({'rootOnlyRefinements': len(saved['refinements']), **dict(counts)}, ensure_ascii=False))
        return
    proposals = [classify(book, taxonomy, config, rules, index, repeated) for book in books]
    counts = collections.Counter(item['status'] for item in proposals)
    series = collections.defaultdict(collections.Counter)
    for item in proposals:
        series[item['resourceId']][item['status']] += 1
    report = {'checkedAt': '2026-11-14', 'totalBooks': len(books), 'counts': dict(counts),
              'publicDescriptionRecords': len(descriptions), 'identityMatchedBooks': sum(bool(book_guids(book)) and any(guid in index for guid in book_guids(book)) for book in books),
              'inputHashes': {str(Path(path).name): hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in args.descriptions},
              'rulesSha256': hashlib.sha256(Path(args.rules).read_bytes()).hexdigest(),
              'series': dict(series),
              'pending': [item for item in proposals if item['status'] == 'pending'],
              'notes': ['完整检查公共目录及阅读计划投影；保留全部稳定ID，不修改完成事实。',
                        'description-derived仅表示按本册公开简介归类，不等于逐页正文核定。',
                        'title-fallback为用户授权的低置信查找线索，未据此生成任何句型。',
                        '同名不跨版借简介；仅采纳目录中已关联的公开guid，套系推广段及多册重复简介排除。']}
    dump(args.output, proposals)
    dump(args.report, report)
    if args.config_output:
        mapped = {item['id']: {key: item[key] for key in ('topics', 'status', 'basis', 'evidence', 'sourceIds')}
                  for item in proposals if item['status'] in ('description-derived', 'title-fallback')}
        dump(args.config_output, {'version': 1, 'checkedAt': '2026-11-14',
             'note': '仅保存已复核规则的离线显式建议；简介归类与题名兜底分别标识；句型不由本工具生成。',
             'sources': [
                 {'id': 'xhs-public-content-topics-20261114', 'title': '小花生公开书目详情：逐册内容简介归类',
                  'provider': '小花生公开书目', 'url': 'https://www.xiaohuasheng.cn/',
                  'kind': 'public-content-description', 'checkedAt': '2026-11-14',
                  'note': '仅从已关联公开guid的本册introduction提取摘要；不读取评论、用户或个人阅读记录。具体单册URL保存在每条evidence。简介关键词归类不等于逐页核对正文。'},
                 {'id': 'catalog-title-topic-fallback-20261114', 'title': '公共目录题名兜底分类（用户授权）',
                  'kind': 'title-fallback', 'checkedAt': '2026-11-14',
                  'locator': '公共resource-books目录及reading-plans投影的稳定单册ID',
                  'note': '仅在缺少较强主题依据时，按剥离明确套系／级别前缀的题名生成显式查找标签；保留原题名与命中短语，不冒充已核正文或句型。'}],
             'nodes': config.get('nodes', []),
             'rulesFile': 'material-topic-rules.json', 'books': mapped})
    print(json.dumps({'total': len(books), **dict(counts)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
