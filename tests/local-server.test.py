"""验证本机备份的固定目录写入、历史保留与跨站拒绝。"""
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock


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

    def test_xhs_sync_accepts_only_same_origin_empty_request_and_fixed_command(self):
        snapshot = {'complete': True, 'books': [{'bookId': 'public-guid', 'title': 'Book'}]}
        result = mock.Mock(returncode=0, stdout=json.dumps(snapshot).encode(), stderr=b'not forwarded')
        with mock.patch.object(local_server.subprocess, 'run', return_value=result) as run:
            status, value, headers = self.request(endpoint=local_server.XHS_ENDPOINT, body=b'{}')
        self.assertEqual(status, 200)
        self.assertEqual(value, snapshot)
        self.assertNotIn('Access-Control-Allow-Origin', headers)
        self.assertEqual(run.call_args.args[0], [str(local_server.XHS_PYTHON), '-I', str(local_server.XHS_BRIDGE)])
        self.assertEqual(run.call_args.kwargs['timeout'], 240)
        self.assertFalse(self.backups.exists())

    def test_xhs_sync_rejects_cross_site_host_override_and_request_parameters(self):
        with mock.patch.object(local_server.subprocess, 'run') as run:
            for headers in [{'Origin': 'https://jadechoulu.github.io'}, {'Origin': None}, {'Origin': 'null'},
                            {'Host': 'attacker.example', 'Origin': 'http://attacker.example'}]:
                with self.subTest(headers=headers):
                    self.assertEqual(self.request(endpoint=local_server.XHS_ENDPOINT, body=b'{}', headers=headers)[0], 403)
            for body in [b'{"accountId":"other"}', b'{"url":"https://other.example"}',
                         b'{"command":"anything"}', b'{"path":"/tmp/file"}', b'[]', b'{}' + b' ' * 1024]:
                with self.subTest(body=body[:40]):
                    self.assertEqual(self.request(endpoint=local_server.XHS_ENDPOINT, body=body)[0], 400)
            self.assertEqual(self.request(endpoint=local_server.XHS_ENDPOINT, body=b'{}', headers={'Content-Type': 'text/plain'})[0], 415)
            run.assert_not_called()

    def test_xhs_sync_single_task_and_safe_errors(self):
        self.server.xhs_sync_lock.acquire()
        try:
            with mock.patch.object(local_server.subprocess, 'run') as run:
                status, value, _ = self.request(endpoint=local_server.XHS_ENDPOINT, body=b'{}')
                self.assertEqual((status, value['code']), (409, 'BUSY'))
                run.assert_not_called()
        finally:
            self.server.xhs_sync_lock.release()
        cases = [
            (mock.Mock(returncode=1, stdout=b'{"code":"INCOMPLETE"}', stderr=b'private secret'), 502, 'INCOMPLETE'),
            (mock.Mock(returncode=1, stdout=b'not json PRIVATE', stderr=b'private secret'), 502, 'CONNECTION_UNAVAILABLE'),
            (local_server.subprocess.TimeoutExpired('fixed', 240), 504, 'TIMEOUT'),
        ]
        for result, expected_status, expected_code in cases:
            with self.subTest(code=expected_code):
                config = {'side_effect': result} if isinstance(result, Exception) else {'return_value': result}
                with mock.patch.object(local_server.subprocess, 'run', **config):
                    status, value, _ = self.request(endpoint=local_server.XHS_ENDPOINT, body=b'{}')
                self.assertEqual((status, value['code']), (expected_status, expected_code))
                self.assertNotIn('private', json.dumps(value).lower())
                self.assertNotIn('secret', json.dumps(value).lower())
                self.assertFalse(self.server.xhs_sync_lock.locked())

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

    def test_audio_seeking_returns_only_requested_bytes(self):
        audio = bytes(range(256)) * 1024
        (self.site / 'test.mp3').write_bytes(audio)
        cases = [
            ('GET', {}, 200, audio, None),
            ('GET', {'Range': 'bytes=1000-1999'}, 206, audio[1000:2000], 'bytes 1000-1999/262144'),
            ('GET', {'Range': 'bytes=260000-'}, 206, audio[260000:], 'bytes 260000-262143/262144'),
            ('GET', {'Range': 'bytes=-1000'}, 206, audio[-1000:], 'bytes 261144-262143/262144'),
            ('GET', {'Range': 'bytes=262140-999999'}, 206, audio[-4:], 'bytes 262140-262143/262144'),
            ('GET', {'Range': 'bytes=999999-'}, 416, b'', 'bytes */262144'),
            ('GET', {'Range': 'bytes=20-10'}, 416, b'', 'bytes */262144'),
            ('GET', {'Range': 'bytes=-0'}, 416, b'', 'bytes */262144'),
            ('GET', {'Range': 'bytes=0-1,5-6'}, 200, audio, None),
            ('GET', {'Range': 'bytes=abc'}, 200, audio, None),
            ('GET', {'Range': 'items=0-1'}, 200, audio, None),
            ('GET', {'Range': 'bytes=0-1', 'If-Range': 'old-version'}, 200, audio, None),
            ('HEAD', {'Range': 'bytes=1000-1999'}, 200, b'', None),
        ]
        for method, headers, status, body, content_range in cases:
            with self.subTest(method=method, headers=headers):
                connection = http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=5)
                connection.request(method, '/test.mp3', headers=headers)
                response = connection.getresponse()
                self.assertEqual(response.status, status)
                self.assertEqual(response.getheader('Accept-Ranges'), 'bytes')
                self.assertEqual(response.getheader('Content-Range'), content_range)
                self.assertEqual(int(response.getheader('Content-Length')), len(audio) if method == 'HEAD' else len(body))
                self.assertEqual(response.read(), body)
                connection.close()

    def test_audio_cache_and_non_audio_requests_keep_standard_behavior(self):
        (self.site / 'test.mp3').write_bytes(b'audio')
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=5)
        connection.request('HEAD', '/test.mp3')
        response = connection.getresponse()
        modified = response.getheader('Last-Modified')
        response.read()
        for path, headers, status, expected in [
            ('/test.mp3', {'Range': 'bytes=1-2', 'If-Range': modified}, 206, b'ud'),
            ('/test.mp3', {'If-Modified-Since': modified}, 304, b''),
            ('/index.html', {'Range': 'bytes=1-2'}, 200, (self.site / 'index.html').read_bytes()),
        ]:
            with self.subTest(path=path, headers=headers):
                connection.close()
                connection = http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=5)
                connection.request('GET', path, headers=headers)
                response = connection.getresponse()
                self.assertEqual(response.status, status)
                self.assertEqual(response.read(), expected)
        connection.close()


if __name__ == '__main__':
    unittest.main()
