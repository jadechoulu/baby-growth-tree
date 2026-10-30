"""验证本机备份的固定目录写入、历史保留与跨站拒绝。"""
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest


spec = importlib.util.spec_from_file_location(
    'local_server', Path(__file__).resolve().parent.parent / 'scripts/local-server.py',
)
local_server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local_server)


class LocalBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.site = self.root / 'site'
        self.site.mkdir()
        (self.site / 'index.html').write_text('<h1>本机预览</h1>', encoding='utf-8')
        self.backups = self.root / 'backups'
        self.server = local_server.create_server(
            port=0, directory=self.site, backup_directory=self.backups,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = 'http://' + self.server.backup_host
        self.filename = '小芽成长记录_2026-10-28.json'
        self.content = json.dumps({'version': 1, 'profile': {'name': '宝宝'}, 'records': {}}, ensure_ascii=False)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, *, filename=None, content=None, headers=None, body=None, endpoint=None):
        payload = {'filename': filename or self.filename, 'content': self.content if content is None else content}
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8') if body is None else body
        request_headers = {'Content-Type': 'application/json', 'Origin': self.origin}
        if headers:
            request_headers.update(headers)
        request_headers = {key: value for key, value in request_headers.items() if value is not None}
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=5)
        connection.request('POST', endpoint or local_server.BACKUP_ENDPOINT, body, request_headers)
        response = connection.getresponse()
        result = (response.status, json.loads(response.read()), dict(response.getheaders()))
        connection.close()
        return result

    def test_saves_exact_content_to_fixed_directory(self):
        status, result, headers = self.request()
        self.assertEqual(status, 201)
        self.assertTrue(result['saved'])
        self.assertEqual(result['path'], str((self.backups / self.filename).resolve()))
        self.assertEqual(Path(result['path']).read_bytes(), self.content.encode('utf-8'))
        self.assertEqual(result['bytes'], len(self.content.encode('utf-8')))
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_same_name_preserves_history(self):
        self.request()
        updated = json.dumps({'version': 1, 'profile': {}, 'records': {'skill': {'note': '新手记'}}}, ensure_ascii=False)
        status, result, _ = self.request(content=updated)
        self.assertEqual(status, 201)
        self.assertEqual(result['filename'], '小芽成长记录_2026-10-28 (1).json')
        self.assertEqual((self.backups / self.filename).read_text(), self.content)
        self.assertEqual(Path(result['path']).read_text(), updated)

    def test_health_backup_has_own_standard_and_preserves_history(self):
        filename = '小芽卫健委观察_2026-10-30.json'
        content = json.dumps({'version': 1, 'standard': 'WS/T 580—2017', 'records': {'wst580-138': {'status': 'observed'}}}, ensure_ascii=False)
        status, first, _ = self.request(filename=filename, content=content)
        self.assertEqual(status, 201)
        status, second, _ = self.request(filename=filename, content=content)
        self.assertEqual(status, 201)
        self.assertNotEqual(first['path'], second['path'])
        self.assertEqual(Path(first['path']).read_text(), content)
        self.assertEqual(self.request(filename=filename)[0], 400)
        self.assertEqual(self.request(content=content)[0], 400)

    def test_accepts_each_export_name_and_browser_suffix(self):
        for filename in ['小芽旧本机记录_2026-10-28.json', '小芽英语-启蒙记录备份.json', '小芽英语-启蒙记录备份 (2).json']:
            with self.subTest(filename=filename):
                self.assertEqual(self.request(filename=filename)[0], 201)

    def test_cross_origin_missing_origin_and_untrusted_host_are_rejected(self):
        for headers in [
            {'Origin': 'https://other.example'}, {'Origin': 'null'}, {'Origin': None},
            {'Host': 'other.example', 'Origin': 'http://other.example'},
            {'Host': 'localhost:' + str(self.server.server_address[1])},
        ]:
            with self.subTest(headers=headers):
                self.assertEqual(self.request(headers=headers)[0], 403)
        self.assertFalse(self.backups.exists())

    def test_path_traversal_and_non_export_names_are_rejected(self):
        for filename in ['../' + self.filename, '/tmp/' + self.filename, 'nested/' + self.filename, '记录.json', self.filename + '.exe']:
            with self.subTest(filename=filename):
                self.assertEqual(self.request(filename=filename)[0], 400)
        self.assertFalse(self.backups.exists())

    def test_existing_symlink_is_not_followed_or_overwritten(self):
        self.backups.mkdir()
        outside = self.root / 'outside.json'
        outside.write_text('保留', encoding='utf-8')
        (self.backups / self.filename).symlink_to(outside)
        status, result, _ = self.request()
        self.assertEqual(status, 201)
        self.assertEqual(result['filename'], '小芽成长记录_2026-10-28 (1).json')
        self.assertTrue((self.backups / self.filename).is_symlink())
        self.assertEqual(outside.read_text(), '保留')

    def test_invalid_record_schema_and_content_are_rejected(self):
        for content in ['{broken', '[]', '{}', '{"version":true,"profile":{},"records":{}}', '{"version":1,"profile":[],"records":{}}']:
            with self.subTest(content=content):
                self.assertEqual(self.request(content=content)[0], 400)
        self.assertFalse(self.backups.exists())

    def test_legacy_raw_export_preserves_broken_json_and_old_schema_exactly(self):
        filename = '小芽旧本机记录_2026-10-28.json'
        for content in ['{\n  "version": 1,\n  "records": {"坏掉":\n', '  {"legacyRecords": [], "profile": {"name": "宝宝"}}\n']:
            with self.subTest(content=content):
                status, result, _ = self.request(filename=filename, content=content)
                self.assertEqual(status, 201)
                self.assertEqual(Path(result['path']).read_bytes(), content.encode('utf-8'))
                self.assertEqual(self.request(content=content)[0], 400)
                self.assertEqual(self.request(filename='小芽英语-启蒙记录备份.json', content=content)[0], 400)

    def test_only_json_post_to_exact_endpoint_is_accepted(self):
        self.assertEqual(self.request(headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request(body=b'not json')[0], 400)
        self.assertEqual(self.request(endpoint='/__local-backup/')[0], 404)
        self.assertFalse(self.backups.exists())

    def test_static_site_still_serves_selected_directory(self):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=5)
        connection.request('GET', '/')
        response = connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertIn('本机预览', response.read().decode('utf-8'))
        connection.close()
        self.assertFalse(self.backups.exists())

    def test_non_loopback_binding_is_rejected(self):
        for bind in ['0.0.0.0', '192.168.1.2', '::', 'other.example']:
            with self.subTest(bind=bind):
                with self.assertRaises(ValueError):
                    local_server.create_server(bind=bind, port=0, directory=self.site)


if __name__ == '__main__':
    unittest.main()
