"""将已完整读取的小花生低幼套装目录接入公共素材、册数和逐本封面。

原始响应留在本机小花生私有采集目录，不进入站点包。只保存公共书目元信息与原始封面URL，不下载图片。
"""
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'english' / 'data'
ARCHIVE = Path('/Users/zhoulu/Documents/生活/育儿/codex/xiaohuasheng-apk-investigation-20261108/private/low-age-search-20261118-v1')
TODAY = '2026-11-18'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def clean(value):
    return re.sub(r'<[^>]+>', '', value or '').strip()


def image_url(path):
    return str(path) if str(path).startswith(('https://', 'http://')) else 'https://img.xiaohuasheng.cn/' + str(path).lstrip('/')



def import_extra(volumes, directory, covers):
    archive_root = ARCHIVE.parent / 'low-age-extra-20261118-v2'
    if not archive_root.exists():
        return
    raw_resources = read(ARCHIVE / 'targets.json')
    titles = {item['resourceId']: item['title'] for item in raw_resources}
    def source_and_books(resource_id, scope_id, title, raw_books, url, note, unit='本', complete=True):
        source = {'id': scope_id, 'title': '小花生 · ' + title, 'url': url, 'checkedAt': TODAY, 'note': note}
        directory['sources'] = [item for item in directory['sources'] if item['id'] != scope_id] + [source]
        members = []
        for index, raw in enumerate(raw_books, 1):
            guid = raw['guid']
            book = next((item for item in directory['books'] if guid in item.get('externalIds', {}).get('xiaohuasheng', [])), None)
            if book is None:
                book = {'id': 'book-low-age-detail-' + str(raw['pk']), 'resourceId': resource_id,
                    'title': clean(raw['name']), 'edition': title, 'level': '', 'number': index,
                    'sourceIds': [], 'externalIds': {'xiaohuasheng': [guid]}, 'topics': [], 'topicStatus': 'pending',
                    'topicBasis': '仅核对公开书目与版本身份；内容主题待核，不凭题名分类。'}
                directory['books'].append(book)
            if book['id'].startswith('book-low-age-detail-') and scope_id.startswith('low-age-v2-detail-'):
                book['edition'] = title
            book['sourceIds'] = list(dict.fromkeys(book.get('sourceIds', []) + [scope_id]))
            book['appBookId'] = raw['pk']
            book.setdefault('isbn', raw.get('isbn13', ''))
            book.setdefault('catalogMetadata', {}).update({'language': raw.get('language', ''),
                'publisher': raw.get('press', ''), 'author': raw.get('author', '')})
            cover = image_url(raw.get('frontCover', ''))
            if raw.get('frontCover'):
                book['cover'] = cover
                book['coverSource'] = {'sourceUrl': 'https://www.xiaohuasheng.cn/book/' + guid,
                    'imageUrl': cover, 'title': clean(raw['name']), 'provider': '小花生',
                    'kind': 'individual-book', 'retrievedAt': TODAY, 'checkedAt': TODAY}
            members.append(book['id'])
        entry = next((item for item in volumes['series'] if item['resourceId'] == resource_id), None)
        if entry is None:
            entry = {'resourceId': resource_id, 'title': titles.get(resource_id, title), 'unit': unit, 'scopes': [], 'sources': []}
            volumes['series'].append(entry)
        entry['unit'] = unit
        label = title + ' · ' + str(len(members)) + unit
        if len(label) > 100:
            label = ('单本候选 · ISBN ' + raw_books[0]['isbn13'] if len(raw_books) == 1 and raw_books[0].get('isbn13')
                     else '已核候选 · ' + scope_id + ' · ' + str(len(members)) + unit)
        scope = {'id': scope_id, 'label': label, 'level': '', 'edition': title,
            'parts': [{'label': title, 'count': len(members), 'unit': unit, 'directoryMatch': {'bookIds': members}}],
            'default': False, 'referenceOnly': True, 'note': note}
        entry['scopes'] = [item for item in entry.get('scopes', []) if item['id'] != scope_id]
        covered = {book_id for item in entry['scopes'] for part in item.get('parts', [])
                   for book_id in part.get('directoryMatch', {}).get('bookIds', [])}
        if not (len(members) == 1 and members[0] in covered):
            entry['scopes'].append(scope)
        entry['sources'] = [item for item in entry.get('sources', []) if item.get('url') != url] + [{
            'title': source['title'], 'url': url, 'checkedAt': TODAY, 'evidence': note}]
        entry['checkedAt'] = TODAY
        return entry, scope
    targets = [(archive_root, target) for target in read(archive_root / 'collection-targets.json') + read(archive_root / 'additional-collection-targets.json')]
    recheck_root = ARCHIVE.parent / 'low-age-reuse-recheck-20261118-v1'
    if (recheck_root / 'collection-targets.json').exists():
        targets += [(recheck_root, target) for target in read(recheck_root / 'collection-targets.json')]
    if (recheck_root / 'collection-5612030/run-summary.json').exists():
        targets.append((recheck_root, {'resourceId': 'resource-1qn098f', 'collectionId': 5612030}))
    journey_members = []
    for collection_root, target in targets:
        collection_id, resource_id = target['collectionId'], target['resourceId']
        summary = read(collection_root / ('collection-' + str(collection_id)) / 'run-summary.json')
        if not summary.get('complete') or not summary.get('detailsComplete'):
            continue
        books = read(collection_root / ('collection-' + str(collection_id)) / 'details/books.json')['books']
        if len(books) != summary['declaredBooks'] or len({b['guid'] for b in books}) != len(books):
            raise ValueError('v2套装完整性不一致：' + str(collection_id))
        meta = summary['collectionMetadata']
        title = clean(meta['name'])
        note = '此具名集合的声明数量、唯一书目身份和逐册详情已核；保留出版候选，不自动认定路线所指版本。'
        unit = '张' if resource_id in ['resource-639kek', 'resource-19ghr73'] else '本'
        if resource_id == 'resource-1qn098f' and collection_id == 5612030:
            title = 'I Can Read My First · HarperCollins英文原版参考26本'
            note = '小花生中信集合收录的26本成员实际是HarperCollins/Balzer+Bray原版ISBN；仅作英文原版参考，不冒充中信引进版逐册目录，不跨版本传递完成。'
        if collection_id == 2307406:
            # 原路线仅指小兔比利；4册系列包含其它三部作品，不能全部归到该单本。
            books = [book for book in books if book['pk'] == 12026]
            title = '小兔比利 · 亮丽精美触摸书中英双语版'
            note = '小兔比利单本；所属亮丽触摸系列为4册，其它3本不进入本素材分母。'
        if collection_id == 3775352:
            excluded = {96649, 96650, 96648, 132502, 132503, 2910005, 95806, 95807, 132491}
            books = [book for book in books if book['pk'] not in excluded]
            title = 'Maisy机关书 · 已核10册候选'
            note = '公开19件混合目录排除9册贴纸书；剩余10个书目身份为机关/翻翻书候选，含同作品不同版，不宣称10部不同作品或出版社全集。'
        if collection_id == 5548067:
            note += ' 当前为宝贝赳赳启蒙篇4册引进版；不冒充其它赳赳认知版本。'
        if collection_id == 150420:
            note += ' 当前是米菲Easy English双语24册版本，不冒充英文原版全集。'
        if collection_id == 3775350:
            note += ' 21个公开书目身份含同作品不同版，不等于21部不同作品或出版社全集。'
        entry, scope = source_and_books(resource_id, 'low-age-v2-xhs-' + str(collection_id), title, books,
            'https://www.xiaohuasheng.cn/series/' + meta['guid'], note, unit)
        if resource_id == 'resource-7vimum':
            journey_members.append((scope['id'], scope['parts'][0]['directoryMatch']['bookIds']))
        if resource_id not in covers or resource_id in ['resource-1wdcw8m', 'resource-1249z6l', 'resource-639kek', 'resource-19ghr73']:
            raw = books[0] if collection_id == 2307406 else meta
            cover = image_url(raw['frontCover'])
            url = ('https://www.xiaohuasheng.cn/book/' if collection_id == 2307406 else 'https://www.xiaohuasheng.cn/series/') + raw['guid']
            covers[resource_id] = {'path': cover, 'imageUrl': cover, 'sourceUrl': url, 'title': clean(raw['name']),
                'provider': '小花生', 'kind': 'individual-book' if collection_id == 2307406 else 'series-cover',
                'retrievedAt': TODAY, 'checkedAt': TODAY, 'note': note}
    if journey_members:
        if len(journey_members) != 10 or any(len(ids) != 6 for _, ids in journey_members):
            raise ValueError('悠游第一级须10套各6本完整目录')
        all_members = [book_id for _, ids in journey_members for book_id in ids]
        if len(set(all_members)) != 60:
            raise ValueError('悠游第一级跨套单册身份必须60个唯一')
        entry = next(item for item in volumes['series'] if item['resourceId'] == 'resource-7vimum')
        generated = {scope_id for scope_id, _ in journey_members}
        entry['scopes'] = [scope for scope in entry['scopes'] if scope['id'] not in generated]
        for scope in entry['scopes']:
            if scope['id'] == 'resource-29ukn0-count-20261104':
                scope['parts'][0]['directoryMatch'] = {'bookIds': all_members}
            elif scope['id'] == 'reading-journey-level1-1-5':
                scope['parts'][0]['directoryMatch'] = {'bookIds': all_members[:30]}
        pack_edition = '悠游阅读成长计划第一级 · 按套选读（每套6册）'
        pack_parts = [{'label': '第1级·第' + str(pack) + '套', 'count': 6,
                       'directoryMatch': {'bookIds': journey_members[pack-1][1]}} for pack in range(1,11)]
        pack_scope_id = 'youyou-first-level-individual-packs'
        entry['scopes'] = [item for item in entry['scopes'] if item['id'] != pack_scope_id] + [{
            'id': pack_scope_id, 'label': '第一级10套 · 每套6本', 'level': '第一级·按套选读',
            'edition': pack_edition, 'parts': pack_parts, 'default': False, 'referenceOnly': True,
            'includedIn': ['resource-29ukn0-count-20261104'],
            'note': '同一外研社第一级60本目录按10套各6本展开；与整级60册复用相同单册身份，不重复计总量。'}]
        for packs, level in [([1,2], '第1级·第1–2套'), ([3,4,5], '第1级·第3–5套'),
                             ([6,7], '第1级·第6–7套'), ([9,10], '第1级·第9–10套（原表未列8）')]:
            ids = [book_id for pack in packs for book_id in journey_members[pack-1][1]]
            scope_id = 'youyou-level1-packs-' + '-'.join(map(str,packs))
            scope = {'id': scope_id, 'label': level + ' · ' + str(len(ids)) + '本', 'level': level,
                'edition': pack_edition, 'parts': [dict(pack_parts[pack-1]) for pack in packs],
                'default': False, 'referenceOnly': True, 'includedIn': ['resource-29ukn0-count-20261104'],
                'note': '套号与单册号分开；每套6本，按完整唯一公开身份引用对应套组，不把套号当单册序号。'}
            entry['scopes'] = [item for item in entry['scopes'] if item['id'] != scope_id] + [scope]
    groups = read(archive_root / 'detail-groups.json')
    extra = read(archive_root / 'additional-detail-groups.json')
    for resource_id, ids in extra.items():
        groups.setdefault(resource_id, []).extend(ids)
    for filename in ['usborne-detail-groups.json', 'final-detail-groups.json']:
        if (archive_root / filename).is_file():
            for resource_id, ids in read(archive_root / filename).items():
                groups.setdefault(resource_id, []).extend(ids)
    groups['resource-168yypj'] = [19340, 182309, 5576641, 36137, 170972, 513228, 834199, 422984]
    groups['resource-kz6giv'] = [258906, 109435, 145716, 152546, 109436]
    groups['resource-1j06ua3'] = [349879]
    groups['resource-13uilyr'] = [4416028, 4822217, 4821117, 5142857, 6083234, 5142856]
    groups['resource-vvp92c'] = [171004, 304782, 121807, 378509, 431524, 5260423]
    groups['resource-1wdcw8m'] = [4475518, 704476, 5591150]
    groups.pop('resource-1txjdrk', None)
    groups.pop('resource-1vmvoe6', None)
    groups.pop('resource-iaa99t', None) # Miles Kelly搜索命中套装容器，不能当单本书或由题名推算目录。
    groups.pop('resource-bxepfh', None) # 13册包被原站误标为单本，不能当成一本书或据标题建立13册分母。
    for resource_id, ids in groups.items():
        for book_id in dict.fromkeys(ids):
            book_archive = archive_root / ('detail-' + str(book_id))
            if not book_archive.exists() or not read(book_archive / 'summary.json').get('readSucceeded'):
                continue
            raw = read(book_archive / 'books.json')['books']
            title = clean(raw['name'])
            # 单详情为具体单本候选；逐本独立版次，不把搜到的若干本声称为全系列。
            note = '已核具体单本及公开身份；作为系列中的单本/版次候选，不宣称出版社全集，不跨版本传递完成状态。'
            if resource_id == 'resource-1wdcw8m':
                note += ' 英文版与既有中英双语版独立维护。'
            edition = title + (' · ISBN ' + raw['isbn13'] if raw.get('isbn13') else ' · 公开书目 ' + raw['guid'])
            source_and_books(resource_id, 'low-age-v2-detail-' + str(book_id), edition, [raw],
                'https://www.xiaohuasheng.cn/book/' + raw['guid'], note)
            if resource_id not in covers or (resource_id == 'resource-195gxzq' and book_id == 51256):
                cover = image_url(raw['frontCover'])
                covers[resource_id] = {'path': cover, 'imageUrl': cover, 'sourceUrl': 'https://www.xiaohuasheng.cn/book/' + raw['guid'],
                    'title': title, 'provider': '小花生', 'kind': 'individual-book' if resource_id == 'resource-1wdcw8m' else 'series-example',
                    'retrievedAt': TODAY, 'checkedAt': TODAY, 'note': note}

    # Miles Kelly搜到的是具名套装容器；补正确封面与证据，不伪造逐本身份或据标题建立分母。
    miles_resource = 'resource-iaa99t'
    for book_id in [5822683, 5715461]:
        raw = read(archive_root / ('detail-' + str(book_id)) / 'books.json')['books']
        source_id = 'low-age-v2-detail-' + str(book_id)
        source_url = 'https://www.xiaohuasheng.cn/book/' + raw['guid']
        source = {'id': source_id, 'title': '小花生 · ' + clean(raw['name']), 'url': source_url, 'checkedAt': TODAY,
                  'note': '已查到Miles Kelly具名4册套装容器及ISBN，未取得完整逐册目录；两个不同套装不混合，不据题名建立阅读分母。'}
        directory['sources'] = [item for item in directory['sources'] if item['id'] != source_id] + [source]
        entry = next((item for item in volumes['series'] if item['resourceId'] == miles_resource), None)
        if entry is None:
            entry = {'resourceId': miles_resource, 'title': 'Miles Kelly交通工具', 'unit': '本', 'scopes': [], 'sources': []}
            volumes['series'].append(entry)
        entry['sources'] = [item for item in entry['sources'] if item.get('url') != source_url] + [source]
        entry['note'] = source['note']
        if book_id == 5822683:
            cover = image_url(raw['frontCover'])
            covers[miles_resource] = {'path': cover, 'imageUrl': cover, 'sourceUrl': source_url, 'title': clean(raw['name']),
                'provider': '小花生', 'kind': 'series-cover', 'retrievedAt': TODAY, 'checkedAt': TODAY,
                'note': 'Things That Go具名套装候选封面；不同Mighty Machines套装独立保留，不推导逐本进度。'}
    # 托马斯详情明确每级8册故事；没有逐册身份时只补具名出版参考数，不伪造单本。
    thomas_archive = archive_root / 'detail-1615532'
    if thomas_archive.exists() and read(thomas_archive / 'summary.json').get('readSucceeded'):
        raw = read(thomas_archive / 'books.json')['books']
        source_id = 'low-age-v2-detail-1615532'
        source_url = 'https://www.xiaohuasheng.cn/book/' + raw['guid']
        source = {'id': source_id, 'title': '小花生 · 托马斯和朋友英语启蒙分级绘本1–3级套装',
                  'url': source_url, 'checkedAt': TODAY,
                  'note': '简介明确3个级别，每级8册英文故事，中文助读手册与MP3不计故事册数；尚无逐册公开身份。'}
        directory['sources'] = [item for item in directory['sources'] if item['id'] != source_id] + [source]
        entry = next((item for item in volumes['series'] if item['resourceId'] == 'resource-a3pj5d'), None)
        if entry:
            for level in [1, 2, 3]:
                scope_id = 'thomas-english-graded-' + str(level) + '-8'
                scope = {'id': scope_id, 'label': '英语启蒙分级绘本 · ' + str(level) + '级8册故事',
                    'edition': '托马斯和朋友英语启蒙分级绘本 · 外研社引进版', 'level': str(level),
                    'parts': [{'label': str(level) + '级故事书', 'count': 8, 'level': str(level)}],
                    'default': False, 'referenceOnly': True, 'sources': [source], 'note': source['note']}
                entry['scopes'] = [item for item in entry['scopes'] if item['id'] != scope_id] + [scope]
            entry['sources'] = [item for item in entry['sources'] if item.get('url') != source_url] + [source]
    # 原表明确的单本也写入公共单册目录，不仅保存套系示例封面。
    for resource_id, book_id in [('resource-y7ajpx', 1915999), ('resource-12sm01m', 184020),
                                  ('resource-8rgfp8', 2493391), ('resource-1j06ua3', 4404007)]:
        book_archive = ARCHIVE / ('detail-' + str(book_id))
        if not book_archive.exists() or not read(book_archive / 'summary.json').get('readSucceeded'):
            continue
        raw = read(book_archive / 'books.json')['books']
        title = clean(raw['name'])
        edition = title + (' · ISBN ' + raw['isbn13'] if raw.get('isbn13') else ' · 公开书目 ' + raw['guid'])
        source_and_books(resource_id, 'low-age-v2-detail-' + str(book_id), edition, [raw],
            'https://www.xiaohuasheng.cn/book/' + raw['guid'],
            '已核具体单本候选与公开身份；未确认路线点读版/出版版本一致，不跨版传递进度。')


def main():
    volumes_path, books_path, covers_path = DATA / 'resource-volumes.json', DATA / 'resource-books.json', DATA / 'resource-covers.json'
    volumes, directory, covers = read(volumes_path), read(books_path), read(covers_path)
    raw_targets = json.loads((ARCHIVE / 'collections-to-fetch.json').read_text())
    if not any(target['collectionId'] == 1618386 for target in raw_targets):
        raw_targets.insert(0, {'resourceId': 'resource-1t45iv5', 'collectionId': 1618386})
    raw_resources = read(ARCHIVE / 'targets.json')
    raw_titles = {item['resourceId']: item['title'] for item in raw_resources}
    raw_titles['resource-1t45iv5'] = '苹果英语'
    groups = {}
    special_resources = {5456845: 'resource-1pinwiv', 5459604: 'resource-1qj90tg', 6707879: 'resource-1wlddvg'}
    for target in raw_targets:
        resource_id = special_resources.get(target['collectionId'], target['resourceId'])
        groups.setdefault(resource_id, []).append(target)
    for resource_id, targets in groups.items():
        # 动画不复用同名绘本的册数；Jump百科与同套不同选本保留公共候选。
        targets = [target for target in targets if (ARCHIVE / ('collection-' + str(target['collectionId'])) / 'run-summary.json').is_file()]
        targets = [target for target in targets if read(ARCHIVE / ('collection-' + str(target['collectionId'])) / 'run-summary.json').get('detailsComplete')]
        if not targets:
            continue
        existing = next((entry for entry in volumes['series'] if entry['resourceId'] == resource_id), None)
        if existing is None:
            existing = {'resourceId': resource_id, 'unit': '本', 'title': raw_titles.get(resource_id, '低幼素材'), 'scopes': [], 'sources': []}
            volumes['series'].append(existing)
        for target in targets:
            collection_id = target['collectionId']
            archive = ARCHIVE / ('collection-' + str(collection_id))
            summary_path = archive / 'run-summary.json'
            if not summary_path.is_file():
                continue
            summary = read(summary_path)
            if not summary.get('complete') or not summary.get('detailsComplete'):
                continue
            books = read(archive / 'details/books.json')['books']
            if len(books) != summary['declaredBooks'] or len({book['guid'] for book in books}) != len(books):
                raise ValueError('套装目录不完整：' + str(collection_id))
            meta = summary['collectionMetadata']
            title, edition = clean(meta['name']), clean(meta['name'])
            source_id = 'low-age-xhs-' + str(collection_id)
            source_url = 'https://www.xiaohuasheng.cn/series/' + meta['guid']
            source = {'id': source_id, 'title': '小花生 · ' + title + ' · 完整套装目录', 'url': source_url,
                      'checkedAt': TODAY, 'note': '套装声明册数、唯一单册ID和逐册详情均已完整核对；图片只保留原始URL。'}
            directory['sources'] = [item for item in directory['sources'] if item['id'] != source_id] + [source]
            scope_id = 'low-age-xhs-' + str(collection_id)
            members = []
            reused_scope_ids = {5456845: 'gyuri-rainbow-rabbit-12', 5459604: 'wplay-official-storybooks-12'}
            reused_scope = next((scope for scope in existing.get('scopes', [])
                                 if scope['id'] == reused_scope_ids.get(collection_id)), None)
            # W-PLAY的29件含12故事、12练习和5游戏。只接已有公共故事身份，不能把总包当阅读分母。
            if collection_id in [100179, 100180]:
                story_ids = {100179: {151913, 216024, 221583, 221584, 203269, 125039},
                             100180: {216023, 203345, 203270, 203344, 203271, 110917}}[collection_id]
                books = [book for book in books if book['pk'] in story_ids]
                if len(books) != 6:
                    raise ValueError('小土豆已核故事子集必须为6本')
                title += ' · 六主题故事子集（排除容器及教辅）'
            if collection_id == 5459604:
                story_guids = {guid for book in directory['books']
                               if book['resourceId'] == resource_id and not book['id'].startswith('book-low-age-')
                               for guid in book.get('externalIds', {}).get('xiaohuasheng', [])}
                books = [book for book in books if book['guid'] in story_guids]
                if len(books) != 12:
                    raise ValueError('W-PLAY故事目录必须与原有12个公共身份一致')
            for index, raw in enumerate(books, 1):
                guid = raw['guid']
                cover = image_url(raw['frontCover'])
                external = {'xiaohuasheng': [guid]}
                old = next((book for book in directory['books'] if guid in book.get('externalIds', {}).get('xiaohuasheng', [])), None)
                if old is None:
                    old = {'id': 'book-low-age-' + str(collection_id) + '-' + str(index).zfill(3), 'resourceId': resource_id,
                           'title': raw['name'], 'level': '', 'edition': edition, 'number': index,
                           'sourceIds': [], 'topics': [], 'topicStatus': 'pending'}
                    directory['books'].append(old)
                if old['id'].startswith('book-low-age-'):
                    old['resourceId'] = resource_id
                # 公开guid相同就复用既有身份；目录再采集不改原题名、版本、顺序、级别或主题。
                old.update({'appBookId': raw['pk'], 'cover': cover})
                old.setdefault('isbn', raw.get('isbn13', ''))
                old.setdefault('externalIds', {}).setdefault('xiaohuasheng', [])
                old['externalIds']['xiaohuasheng'] = list(dict.fromkeys(old['externalIds']['xiaohuasheng'] + [guid]))
                old.setdefault('catalogMetadata', {})['language'] = raw.get('language', '')
                old.setdefault('topicBasis', '仅核对公开出版目录与书目身份；主题内容待核，不凭题名分类。')
                old['sourceIds'] = list(dict.fromkeys(old.get('sourceIds', []) + [source_id]))
                old['coverSource'] = {'sourceUrl': 'https://www.xiaohuasheng.cn/book/' + guid, 'imageUrl': cover,
                                      'title': raw['name'], 'provider': '小花生', 'kind': 'individual-book',
                                      'retrievedAt': TODAY, 'checkedAt': TODAY}
                members.append(old['id'])
            scope = {'id': scope_id, 'label': title + ' · ' + str(len(books)) + '册', 'level': '', 'edition': edition,
                     'parts': [{'label': '全' + str(len(books)) + '册', 'count': len(books),
                                'directoryMatch': {'edition': edition, 'bookIds': members}}],
                     'default': False, 'referenceOnly': True}
            if collection_id in [100179, 100180]:
                scope['note'] = '完整公开8件目录中逐题名核出6本主题故事，排除套装容器、错辑/教辅；此为已核故事子集，不宣称出版社全集或路线指定版。'
            version_notes = {
                5265013: '此具名套装为8册，简介所列全系列12册不等于该8册范围。同一单册按公开guid及App数字身份复用记录；同名但ISBN不同的另版独立维护，套装已读不传播为每册已读。',
                2201266: '中英歌谣引进版4册套装，保留为出版候选；未核定与路线所指版本一致，不自动作为阶段分母。',
                6466045: '当前采集为中文／其他语言标注的乐乐趣8册版本，未找到双语证据；不自动作为英语阶段分母。'
            }
            if collection_id in version_notes:
                scope['note'] = version_notes[collection_id]
            existing['title'] = raw_titles.get(resource_id, existing.get('title', '低幼素材'))
            existing['scopes'] = [item for item in existing.get('scopes', []) if item['id'] not in (scope_id, 'apple-english-10')]
            if reused_scope:
                reused_scope['parts'][0]['directoryMatch']['bookIds'] = members
            else:
                existing['scopes'].append(scope)
            existing['sources'] = [item for item in existing.get('sources', []) if item.get('url') != source_url] + [{
                'title': source['title'], 'url': source_url,
                'evidence': '套装声明' + str(summary['declaredBooks']) + '册，唯一单册ID与详情均完整。' + ('其中12册故事复用原公共目录，练习和游戏不进入阅读分母。' if collection_id == 5459604 else ''), 'checkedAt': TODAY}]
            existing['checkedAt'] = TODAY
            if resource_id not in covers:
                cover = image_url(meta['frontCover'])
                covers[resource_id] = {'path': cover, 'sourceUrl': source_url, 'imageUrl': cover,
                                      'title': title, 'provider': '小花生', 'kind': 'series-cover',
                                      'retrievedAt': TODAY, 'checkedAt': TODAY}
    uncertain_versions = {'resource-yjrejm', 'resource-1tie9hk', 'resource-1wkn72n', 'resource-1pedkj2'}
    volumes['references'] = [ref for ref in volumes['references']
                             if not (ref['resourceId'] in uncertain_versions and ref.get('stageId', '').startswith('low-age-')
                                     and ref.get('scopeId', '').startswith('low-age-xhs-'))]
    # 单套完整目录按原阶段引用，不给多个套装/辑次擅自选定版本。
    low_age = read(DATA / 'low-age.json')
    for resource_id, targets in groups.items():
        entry = next((entry for entry in volumes['series'] if entry['resourceId'] == resource_id), None)
        if entry is None or resource_id in uncertain_versions:
            continue
        if len(entry.get('scopes', [])) != 1 or resource_id in ['resource-vp23xs', 'resource-mkq5i6', 'resource-1wlddvg', 'resource-1qj90tg', 'resource-1pinwiv']:
            continue
        scope_id = entry['scopes'][0]['id']
        raw_ids = {target['rawId'] for target in raw_resources if target['resourceId'] == resource_id}
        if resource_id == 'resource-1t45iv5':
            raw_ids.add('low-f533ea8c0860')
        for stage in low_age['stages']:
            if any(material['resourceId'] in raw_ids for material in stage['materials']):
                volumes['references'] = [ref for ref in volumes['references'] if not (ref['resourceId'] == resource_id and ref['stageId'] == stage['id'])]
                volumes['references'].append({'resourceId': resource_id, 'stageId': stage['id'], 'scopeId': scope_id})
    single_path = ARCHIVE / 'covers-to-fetch.json'
    if single_path.is_file():
        for target in read(single_path):
            # 这两条旧候选分别是作者动物书／动画同名书，不能冒充出版社机关书／动画封面。
            if target['resourceId'] in ['resource-leirux', 'resource-1txjdrk']:
                continue
            if target['resourceId'] in covers:
                continue
            archive = ARCHIVE / ('detail-' + str(target['bookId']))
            if not (archive / 'summary.json').is_file():
                continue
            if not read(archive / 'summary.json').get('readSucceeded'):
                continue
            raw = read(archive / 'books.json')['books']
            cover = image_url(raw['frontCover'])
            covers[target['resourceId']] = {'path': cover, 'sourceUrl': 'https://www.xiaohuasheng.cn/book/' + raw['guid'],
                'imageUrl': cover, 'title': raw['name'], 'provider': '小花生', 'kind': 'series-example',
                'retrievedAt': TODAY, 'checkedAt': TODAY,
                'note': '单册或系列示例封面；没有完整套装目录时不作为册数依据。'}
    potato_excluded = {100179, 232580, 232577, 232579}
    directory['books'] = [book for book in directory['books'] if not (
        book['id'].startswith(('book-low-age-100179-', 'book-low-age-100180-')) and book.get('appBookId') in potato_excluded)]
    import_extra(volumes, directory, covers)
    for resource_id in ['resource-y7ajpx', 'resource-12sm01m']:
        if resource_id in covers:
            covers[resource_id]['kind'] = 'individual-book'
            covers[resource_id]['note'] = '当前具名单本候选封面，不代表其他出版版本。'
    # 每套查询记录来自实际采集来源，不补造内容分类和阅读指南。
    for resource_id in {book['resourceId'] for book in directory['books']}:
        research = next((record for record in directory.get('seriesResearch', []) if record['resourceId'] == resource_id), None)
        source_ids = list(dict.fromkeys(source_id for book in directory['books'] if book['resourceId'] == resource_id
                                        for source_id in book.get('sourceIds', []) if source_id.startswith(('low-age-xhs-', 'low-age-v2-'))))
        if not source_ids:
            continue
        if research is not None:
            research['sourceIds'] = list(dict.fromkeys(research.get('sourceIds', []) + source_ids))
            research.setdefault('searchLog', []).extend({'source': '小花生App公开书目API', 'query': source_id,
                'result': '已核具体目录/单本身份与版本；不推导内容主题。'} for source_id in source_ids
                if not any(log.get('query') == source_id for log in research.get('searchLog', [])))
            continue
        directory.setdefault('seriesResearch', []).append({'resourceId': resource_id, 'checkedAt': TODAY,
            'scope': '小花生公开套装目录、唯一单册身份与详情；主题内容尚未核定。',
            'sourceIds': source_ids, 'readingGuide': [],
            'searchLog': [{'source': '小花生App公开书目API', 'query': source_id,
                           'result': '声明册数与完整目录、逐册详情交叉核对；不推导内容主题。'} for source_id in source_ids]})
    for book in directory['books']:
        book['sourceIds'] = [source_id for source_id in book.get('sourceIds', []) if source_id != 'low-age-apple-xhs']
    directory['sources'] = [source for source in directory['sources'] if source['id'] != 'low-age-apple-xhs']
    volumes['checkedAt'] = TODAY
    directory['coverCheckedAt'] = TODAY
    write(volumes_path, volumes)
    write(books_path, directory)
    write(covers_path, covers)
    print('低幼套装导入完成；只有目录与逐册详情均完整的集合才写入公共范围。')


if __name__ == '__main__':
    main()
