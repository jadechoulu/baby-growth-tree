"""小花生全书架的完整性与最小已读快照边界。无凭据、无真实网络请求。"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    'xiaohuasheng_local', Path(__file__).resolve().parent.parent / 'scripts/xiaohuasheng-local.py',
)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def fixture(count=31):
    rows = [{'bookId': index + 1, 'guid': 'guid-' + str(index + 1), 'name': 'Book ' + str(index + 1),
             'readedFlag': 1 if index % 2 == 0 else 0, 'readFlag': 0, 'readCount': 3,
             'myStar': 5, 'futurePrivateField': 'not browser data'} for index in range(count)]
    pages = [{'offset': offset, 'limit': 30, 'status': 200, 'M': '1001', 'returned': min(30, count - offset)}
             for offset in range(0, count + 1, 30)]
    return {'sourceKind': 'xiaohuasheng_app_bookcase_all', 'fetchedAt': '2026-11-08T08:01:02+00:00',
            'complete': True, 'uniqueBooks': count, 'uniqueGuids': count, 'books': rows, 'pages': pages}


class DerivationTests(unittest.TestCase):
    def test_detail_identity_failure_keeps_raw_evidence_and_never_caches_wrong_book(self):
        data = fixture(1)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / 'attempt'
            out.mkdir()

            def save(path, value):
                path.write_text(json.dumps(value))

            def detail(_book_id):
                return {'pk': 1, 'guid': 'different-book', 'name': 'Wrong book', 'language': '英文'}, {'status': 200, 'M': '1001'}

            with mock.patch.object(bridge, 'TOOL_ROOT', root), self.assertRaises(bridge.SyncFailure):
                bridge.shelf_catalog(data, out, detail, save)
            self.assertTrue((out / 'details/1.json').is_file())
            self.assertFalse((root / 'private/shelf-metadata-v1/1.json').exists())

    def test_real_source_guid_numeric_identity_and_readed_predicate(self):
        data = fixture()
        result = bridge.derive_snapshot(data, 'owner')
        self.assertEqual(result['sourceUrl'], 'https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/owner/-2/-1/-1/0/30')
        self.assertEqual(result['transport'], 'xiaohuasheng-app-api')
        self.assertEqual(result['predicate'], 'readedFlag=1')
        self.assertEqual(result['wholeBookcaseCount'], 31)
        self.assertEqual(result['advertisedCount'], 16)
        self.assertEqual(result['actualUniqueCount'], 16)
        self.assertEqual(result['books'][0], {'bookId': 'guid-1', 'appBookId': '1', 'title': 'Book 1'})
        self.assertEqual(len(result['books']), 16)
        self.assertNotIn('futurePrivateField', str(result))
        self.assertNotIn('readCount', str(result))
        self.assertEqual(result['fetchedAt'], data['fetchedAt'])
        self.assertEqual(data, fixture())

    def test_exact_multiple_requires_legal_empty_terminal_page(self):
        data = fixture(30)
        self.assertEqual(len(bridge.derive_snapshot(data, 'owner')['books']), 15)
        data['pages'].pop()
        with self.assertRaises(bridge.SyncFailure):
            bridge.derive_snapshot(data, 'owner')

    def test_incomplete_duplicate_invalid_state_and_page_drift_rejected(self):
        mutations = [
            lambda data: data.update(complete=False),
            lambda data: data.update(sourceKind='xiaohuasheng_app_bookcase_read_filter'),
            lambda data: data.update(uniqueBooks=30),
            lambda data: data['pages'][1].update(offset=31),
            lambda data: data['pages'][0].update(returned=29),
            lambda data: data['pages'][0].update(status=403),
            lambda data: data['pages'][0].update(M='1002'),
            lambda data: data['books'][1].update(bookId=1),
            lambda data: data['books'][1].update(guid='guid-1'),
            lambda data: data['books'][1].update(bookId='not-numeric'),
            lambda data: data['books'][0].update(readedFlag=True),
            lambda data: data['books'][0].update(readedFlag='1'),
            lambda data: data['books'][0].pop('readedFlag'),
            lambda data: data['books'][0].update(name=''),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                data = copy.deepcopy(fixture())
                mutate(data)
                with self.assertRaises(bridge.SyncFailure) as error:
                    bridge.derive_snapshot(data, 'owner')
                self.assertEqual(error.exception.code, 'INCOMPLETE')

    def test_empty_shelf_or_no_readed_books_is_not_success(self):
        for data in (fixture(0), fixture(1)):
            for row in data['books']:
                row['readedFlag'] = 0
            with self.assertRaises(bridge.SyncFailure) as error:
                bridge.derive_snapshot(data, 'owner')
            self.assertEqual(error.exception.code, 'EMPTY')

    def test_runner_uses_authorized_whole_shelf_keeps_history_and_only_returns_selected_fields(self):
        registry = {'basePath': '//bookroom/queryBookroomBook/owner/-2/-1/-1',
                    'scope': '用户在iOS书架选择全部类别和全部阅读状态'}
        calls = []

        def private_json(path, value):
            with os.fdopen(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'w') as output:
                json.dump(value, output)

        def fetch(out, whole_bookcase=False):
            calls.append(whole_bookcase)
            out.mkdir(mode=0o700, parents=True, exist_ok=False)
            private_json(out / 'bookcase.json', fixture())
            print('{"offset":0}', flush=True)

        bookcase_module = SimpleNamespace(
            BOOKCASE_QUERIES_ACCOUNT='bookcase', SERVICE='service',
            fetch_saved_read_snapshot=fetch,
            keychain=lambda: SimpleNamespace(get_password=lambda *_: json.dumps(registry)),
            private_json=private_json, validate_read_queries=lambda value: calls.append(value['basePath']),
        )
        signing_module = SimpleNamespace(refresh_own_token=lambda: {'success': True, 'httpStatus': 200, 'M': '1001'})
        details_called = []

        def detail(book_id):
            details_called.append(book_id)
            return {'pk': book_id, 'guid': 'guid-' + str(book_id), 'name': 'Book ' + str(book_id),
                    'language': '英文', 'frontCover': '1/Book/test.jpg', 'readingChildCount': 100,
                    'privateCommunityData': 'never browser'}, {'status': 200, 'M': '1001'}

        catalog_module = SimpleNamespace(detail_value=detail, collection_books=lambda *_args, **_kwargs: None)
        original_path = list(sys.path)
        try:
            with tempfile.TemporaryDirectory() as directory:
                with mock.patch.object(bridge, 'TOOL_ROOT', Path(directory)), mock.patch.dict(sys.modules, {
                    'xhs_standalone_bookcase': bookcase_module, 'xhs_request_signing': signing_module,
                    'xhs_catalog_client': catalog_module,
                }):
                    first, second = bridge.run(), bridge.run()
                history = list((Path(directory) / 'private').glob('local-sync-*'))
                self.assertEqual(len(history), 2)
                for attempt in history:
                    self.assertEqual((attempt.stat().st_mode & 0o777), 0o700)
                    self.assertIn('futurePrivateField', (attempt / 'bookcase/bookcase.json').read_text())
                    self.assertNotIn('futurePrivateField', (attempt / 'read-snapshot.json').read_text())
                    self.assertEqual((attempt / 'read-snapshot.json').stat().st_mode & 0o777, 0o600)
                    self.assertIn('offset', (attempt / 'page-events.jsonl').read_text())
                self.assertEqual(first, second)
                self.assertEqual(calls.count(True), 2)
                self.assertEqual(len(details_called), 31)
                self.assertEqual(first['shelfCatalog']['total'], 31)
                self.assertNotIn('privateCommunityData', json.dumps(first))
                self.assertFalse(first['shelfCatalog']['books'][1]['read'])
        finally:
            sys.path[:] = original_path


if __name__ == '__main__':
    unittest.main()
