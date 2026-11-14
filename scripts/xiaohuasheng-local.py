"""本机受控小花生同步执行器；只输出已验证的派生已读快照，不输出认证值。"""
import contextlib
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor


TOOL_ROOT = Path('/Users/zhoulu/Documents/生活/育儿/codex/xiaohuasheng-apk-investigation-20261108')
BASE_PATH = re.compile(r'//bookroom/queryBookroomBook/([a-zA-Z0-9_-]{1,40})/-2/-1/-1')


class SyncFailure(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def catalog_metadata(value):
    """仅保留公开书目字段；language原值是英文版本判断依据。"""
    if not isinstance(value, dict):
        raise SyncFailure('INCOMPLETE')
    app_id, guid = str(value.get('pk', '')), value.get('guid')
    if not re.fullmatch(r'[1-9][0-9]*', app_id) or not isinstance(guid, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', guid):
        raise SyncFailure('INCOMPLETE')
    title = value.get('name')
    if not isinstance(title, str) or not title.strip() or len(title) > 1000:
        raise SyncFailure('INCOMPLETE')
    # @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 外站详情仅按白名单派生，不把社区、本人状态或未知字段交给网页。
    result = {'catalogSchemaVersion': 2, 'bookId': guid, 'appBookId': app_id, 'title': title.strip(),
              'language': value.get('language') if isinstance(value.get('language'), str) else ''}
    cover = value.get('frontCover')
    if isinstance(cover, str) and cover and len(cover) <= 1500:
        if not cover.startswith(('http:', 'https:', '//')):
            cover = 'https://img.xiaohuasheng.cn/' + cover.lstrip('/')
        if cover.startswith('https://img.xiaohuasheng.cn/'):
            result['cover'] = cover
    for source, target in [('isbn13', 'isbn'), ('author', 'author'), ('press', 'publisher')]:
        text = value.get(source)
        if isinstance(text, str) and len(text) <= 300:
            result[target] = text
    if isinstance(value.get('seriesTitle'), str) and len(value['seriesTitle']) <= 500:
        result['seriesTitle'] = value['seriesTitle'].strip()
    if isinstance(value.get('category'), str) and len(value['category']) <= 2000:
        result['catalogTags'] = list(dict.fromkeys(tag.strip() for tag in re.split(r'[，,、]', value['category']) if tag.strip()))
    series_id, series_guid, series_title = value.get('taoxiId'), value.get('taoxiGuid'), value.get('taoxiName')
    if (re.fullmatch(r'[1-9][0-9]*', str(series_id)) and isinstance(series_guid, str)
            and re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', series_guid) and isinstance(series_title, str)
            and 0 < len(series_title.strip()) <= 500):
        result['series'] = {'id': series_guid, 'appBookId': str(series_id), 'title': series_title.strip()}
    return result


def shelf_catalog(bookcase, out, fetch_detail, private_json, fetch_collection=None):
    """书架目录与已读一次同步；公共元信息按单册缓存，失败不能清空旧目录。"""
    cache = TOOL_ROOT / 'private' / 'shelf-metadata-v2'
    cache.mkdir(mode=0o700, parents=True, exist_ok=True)
    rows = bookcase['books']

    def one(row):
        app_id, guid = str(row['bookId']), row['guid']
        path = cache / (app_id + '.json')
        metadata = None
        if path.is_file():
            saved = json.loads(path.read_text(encoding='utf-8'))
            if saved.get('bookId') == guid and saved.get('appBookId') == app_id:
                metadata = saved
        if metadata is None:
            raw, response = fetch_detail(int(app_id))
            details = out / 'details'
            details.mkdir(mode=0o700, exist_ok=True)
            private_json(details / (app_id + '.json'), {'response': response, 'book': raw})
            if response.get('status') != 200 or response.get('M') != '1001':
                raise SyncFailure('INCOMPLETE')
            metadata = catalog_metadata(raw)
            if metadata['bookId'] != guid or metadata['appBookId'] != app_id:
                raise SyncFailure('INCOMPLETE')
            # 缓存只存上述白名单；逐次书架原值与派生目录另存不可覆盖的历史。
            if not path.exists():
                private_json(path, metadata)
        return {**metadata, 'read': row['readedFlag'] == 1, 'isCollection': row.get('isTaoxi') == 1}

    with ThreadPoolExecutor(max_workers=4) as pool:
        books = list(pool.map(one, rows))
    collections = []
    for parent in books:
        if not parent['isCollection'] or parent['language'] != '英文':
            continue
        if fetch_collection is None:
            raise SyncFailure('INCOMPLETE')
        path = cache / ('collection-' + parent['appBookId'] + '.json')
        if path.is_file():
            collection = json.loads(path.read_text(encoding='utf-8'))
        else:
            directory = out / ('collection-' + parent['appBookId'])
            summary = fetch_collection(int(parent['appBookId']), directory, with_details=True, concurrency=4)
            if summary.get('complete') is not True or summary.get('detailsComplete') is not True:
                raise SyncFailure('INCOMPLETE')
            raw = json.loads((directory / 'details/books.json').read_text(encoding='utf-8'))['books']
            children = [catalog_metadata(row) for row in raw]
            collection = {'parentId': parent['bookId'], 'appBookId': parent['appBookId'], 'title': parent['title'],
                          'total': summary['declaredBooks'], 'complete': True, 'books': children}
            if len(children) != collection['total'] or len({row['bookId'] for row in children}) != len(children):
                raise SyncFailure('INCOMPLETE')
            private_json(path, collection)
        # 套装本身已读不扩散到单册；只按全书架中该单册的readedFlag同步。
        read_ids = {book['bookId'] for book in books if book['read']}
        collections.append({**collection, 'books': [{**book, 'read': book['bookId'] in read_ids, 'isCollection': False,
                             'series': {'id': parent['bookId'], 'appBookId': parent['appBookId'], 'title': parent['title']}}
                            for book in collection['books']]})
    result = {'version': 1, 'complete': True, 'total': len(books), 'books': books, 'collections': collections}
    private_json(out / 'shelf-catalog.json', result)
    return result


def derive_snapshot(bookcase, owner):
    """再次校验书架原值，浏览器只接收必要身份和已读事实。"""
    if not isinstance(bookcase, dict) or bookcase.get('complete') is not True:
        raise SyncFailure('INCOMPLETE')
    if bookcase.get('sourceKind') != 'xiaohuasheng_app_bookcase_all':
        raise SyncFailure('INCOMPLETE')
    fetched_at = bookcase.get('fetchedAt')
    try:
        if not isinstance(fetched_at, str) or dt.datetime.fromisoformat(fetched_at).tzinfo is None:
            raise ValueError()
    except ValueError:
        raise SyncFailure('INCOMPLETE') from None
    rows, pages = bookcase.get('books'), bookcase.get('pages')
    if not isinstance(rows, list) or not isinstance(pages, list) or not pages:
        raise SyncFailure('INCOMPLETE')
    expected_offset = 0
    safe_pages = []
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            raise SyncFailure('INCOMPLETE')
        count = page.get('returned')
        if (type(page.get('offset')) is not int or page['offset'] != expected_offset
                or page.get('limit') != 30 or page.get('status') != 200
                or page.get('M') != '1001' or page.get('error')
                or type(count) is not int or not 0 <= count <= 30
                or (index < len(pages) - 1 and count != 30)
                or (index == len(pages) - 1 and count >= 30)):
            raise SyncFailure('INCOMPLETE')
        safe_pages.append({'offset': expected_offset, 'limit': 30, 'returned': count, 'status': 200, 'M': '1001'})
        expected_offset += count
    if (expected_offset != len(rows) or type(bookcase.get('uniqueBooks')) is not int
            or type(bookcase.get('uniqueGuids')) is not int
            or bookcase['uniqueBooks'] != len(rows) or bookcase['uniqueGuids'] != len(rows)):
        raise SyncFailure('INCOMPLETE')
    if not rows:
        raise SyncFailure('EMPTY')
    seen_ids, seen_guids, selected = set(), set(), []
    for row in rows:
        if not isinstance(row, dict):
            raise SyncFailure('INCOMPLETE')
        app_id, guid, flag = row.get('bookId'), row.get('guid'), row.get('readedFlag')
        if (type(app_id) not in (int, str) or not re.fullmatch(r'[1-9][0-9]*', str(app_id))
                or not isinstance(guid, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', guid)
                or str(app_id) in seen_ids or guid in seen_guids
                or type(flag) is not int or flag not in (0, 1)):
            raise SyncFailure('INCOMPLETE')
        seen_ids.add(str(app_id))
        seen_guids.add(guid)
        if flag != 1:
            continue
        title = row.get('bookNameFromServer') or row.get('name')
        if not isinstance(title, str) or not title.strip() or len(title) > 1000:
            raise SyncFailure('INCOMPLETE')
        # @CfSecAICode 遵循消费金融安全编码 BE-AUTH-002 规范: 明确选取浏览器所需身份与已读字段，完整书架其他原值仅留本机私有历史。
        count = row.get('readCount')
        if type(count) is not int or not 0 <= count <= 9007199254740991:
            raise SyncFailure('INCOMPLETE')
        selected.append({'bookId': guid, 'appBookId': str(app_id), 'title': title.strip(), 'readCount': count})
    if not selected:
        raise SyncFailure('EMPTY')
    return {
        'schemaVersion': 1, 'sourceKind': 'xiaohuasheng_bookcase_read',
        'sourceUrl': 'https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/' + owner + '/-2/-1/-1/0/30',
        'transport': 'xiaohuasheng-app-api', 'predicate': 'readedFlag=1',
        'accountId': owner, 'snapshotId': 'xiaohuasheng-app-' + owner + '-' + fetched_at,
        'fetchedAt': fetched_at, 'complete': True, 'authenticated': True,
        'advertisedCount': len(selected), 'actualUniqueCount': len(selected),
        'wholeBookcaseCount': len(rows), 'pages': safe_pages, 'books': selected,
    }


def run():
    # @CfSecAICode 遵循消费金融安全编码 BE-EXEC-001 规范: 模块只从固定的已验证本机工具目录加载，不接收浏览器提供的命令、路径、账号或URL。
    sys.path.insert(0, str(TOOL_ROOT))
    try:
        from xhs_standalone_bookcase import (
            BOOKCASE_QUERIES_ACCOUNT, SERVICE, fetch_saved_read_snapshot,
            keychain, private_json, validate_read_queries,
        )
        from xhs_request_signing import refresh_own_token
        from xhs_catalog_client import detail_value, collection_books
    except ImportError:
        raise SyncFailure('LOCAL_UNAVAILABLE') from None
    try:
        value = keychain().get_password(SERVICE, BOOKCASE_QUERIES_ACCOUNT)
        if not value:
            raise SyncFailure('AUTH_REQUIRED')
        registry = json.loads(value)
        validate_read_queries(registry)
        match = BASE_PATH.fullmatch(registry.get('basePath', ''))
        # @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 只接受钥匙串本人已授权的全书架范围，身份不由浏览器传入。
        if not match or registry.get('scope') != '用户在iOS书架选择全部类别和全部阅读状态':
            raise SyncFailure('AUTH_REQUIRED')
        owner = match[1]
        refreshed = refresh_own_token()
        if refreshed.get('success') is not True or refreshed.get('httpStatus') != 200 or refreshed.get('M') != '1001':
            raise SyncFailure('AUTH_REQUIRED')
    except SyncFailure:
        raise
    except Exception:
        raise SyncFailure('AUTH_REQUIRED') from None
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out = TOOL_ROOT / 'private' / ('local-sync-' + stamp + '-' + uuid.uuid4().hex[:12])
    try:
        out.mkdir(mode=0o700, parents=True, exist_ok=False)
        private_json(out / 'token-refresh.json', refreshed)
        # 逐页脱敏进度实时保留，执行器超时终止也不丢已取得的分页证据。
        progress_fd = os.open(out / 'page-events.jsonl', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(progress_fd, 'w', encoding='utf-8') as progress:
            with contextlib.redirect_stdout(progress):
                fetch_saved_read_snapshot(out / 'bookcase', whole_bookcase=True)
        # 取数前后的本人授权须仍一致，不把会话切换期间的另一书架当作当前本人。
        current_registry = json.loads(keychain().get_password(SERVICE, BOOKCASE_QUERIES_ACCOUNT))
        if current_registry.get('basePath') != registry['basePath']:
            raise SyncFailure('AUTH_REQUIRED')
        bookcase = json.loads((out / 'bookcase/bookcase.json').read_text(encoding='utf-8'))
        snapshot = derive_snapshot(bookcase, owner)
        with contextlib.redirect_stdout(sys.stderr):
            snapshot['shelfCatalog'] = shelf_catalog(bookcase, out, detail_value, private_json, collection_books)
        private_json(out / 'read-snapshot.json', snapshot)
        return snapshot
    except SyncFailure:
        raise
    except Exception:
        raise SyncFailure('CONNECTION_UNAVAILABLE') from None


def main():
    # @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 不将异常、私有原始响应、认证头或token输出到浏览器及服务器日志。
    try:
        result = run()
    except SyncFailure as error:
        print(json.dumps({'code': error.code}))
        return 1
    except Exception:
        print(json.dumps({'code': 'CONNECTION_UNAVAILABLE'}))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
