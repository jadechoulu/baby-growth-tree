"""本机静态预览，并将小芽 JSON 备份保存到用户指定的育儿目录。"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path
import re
import socket


PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIRECTORY = Path('/Users/zhoulu/Documents/生活/育儿/codex')
BACKUP_ENDPOINT = '/__local-backup'
BACKUP_NAME = re.compile(
    r'(?P<stem>小芽(?:成长记录|旧本机记录|卫健委观察)_[0-9]{4}-[0-9]{2}-[0-9]{2}'
    r'|小芽英语-启蒙记录备份)(?: \([0-9]+\))?\.json'
)


def loopback_address(value):
    if value == 'localhost':
        return '127.0.0.1'
    try:
        address = ipaddress.ip_address(value)
    except ValueError as error:
        raise ValueError('仅支持本机回环地址，如 127.0.0.1 或 ::1') from error
    if not address.is_loopback:
        raise ValueError('本机备份服务只允许监听回环地址')
    return str(address)


def save_backup(filename, content, destination=BACKUP_DIRECTORY):
    name_match = BACKUP_NAME.fullmatch(filename) if isinstance(filename, str) else None
    if not name_match or not isinstance(content, str):
        raise ValueError('仅接受小芽成长记录、卫健委观察、旧本机记录或英语启蒙记录的 JSON 备份文件名')
    # 旧本机记录支持原文导出供修复；仅此已通过完整文件名校验的类别允许损坏 JSON 或旧结构。
    if not name_match['stem'].startswith('小芽旧本机记录_'):
        try:
            data = json.loads(content)
        except (ValueError, UnicodeError) as error:
            raise ValueError('备份内容不是有效的 JSON，未保存文件') from error
        if (
            not isinstance(data, dict)
            or type(data.get('version')) is not int
            or data['version'] != 1
            or not isinstance(data.get('records'), dict)
        ):
            raise ValueError('备份须包含 version: 1 和 records 对象')
        if name_match['stem'].startswith('小芽卫健委观察_'):
            if data.get('standard') != 'WS/T 580—2017':
                raise ValueError('卫健委观察备份的标准标识无效')
        elif not isinstance(data.get('profile'), dict):
            raise ValueError('成长和英语备份须包含 profile 对象')

    encoded = content.encode('utf-8')
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve(strict=True)
    # @CfSecAICode 遵循消费金融安全编码 BE-FILE-002 规范: 文件名白名单与规范化目标校验共同限定固定根目录，使用目录描述符及不跟随符号链接的独占创建保留已有文件。
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        index = 0
        while True:
            name = filename if index == 0 else f'{name_match["stem"]} ({index}).json'
            target = root / name
            if target.is_symlink() or target.resolve(strict=False).parent != root:
                index += 1
                continue
            try:
                output_fd = os.open(
                    name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o600, dir_fd=root_fd,
                )
                break
            except FileExistsError:
                index += 1
        try:
            with os.fdopen(output_fd, 'wb') as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.fsync(root_fd)
        except BaseException:
            os.unlink(name, dir_fd=root_fd)
            raise
    finally:
        os.close(root_fd)
    return {'saved': True, 'filename': name, 'path': str(target), 'bytes': len(encoded)}


class BackupHandler(SimpleHTTPRequestHandler):
    def json_response(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != BACKUP_ENDPOINT:
            self.json_response(404, {'error': '没有此本机接口'})
            return
        # @CfSecAICode 遵循消费金融安全编码 FE-CSRF-001 规范: 本机无 Cookie 会话接口同时严格校验监听 Host、同源 Origin 及 JSON 类型，不允许跨站表单或跨域调用，不启用 CORS。
        if (
            self.headers.get_all('Host', []) != [self.server.backup_host]
            or self.headers.get_all('Origin', []) != ['http://' + self.server.backup_host]
        ):
            self.json_response(403, {'error': '备份只允许从本机预览页面同源保存'})
            return
        if len(self.headers.get_all('Content-Type', [])) != 1 or self.headers.get_content_type() != 'application/json':
            self.json_response(415, {'error': '备份请求必须使用 application/json'})
            return
        try:
            length_headers = self.headers.get_all('Content-Length', [])
            if len(length_headers) != 1 or not re.fullmatch(r'[0-9]+', length_headers[0]) or self.headers.get('Transfer-Encoding'):
                raise ValueError('备份请求缺少有效的 Content-Length')
            body = self.rfile.read(int(length_headers[0]))
            payload = json.loads(body.decode('utf-8'))
            if not isinstance(payload, dict):
                raise ValueError('备份请求必须为 JSON 对象')
            result = save_backup(payload.get('filename'), payload.get('content'), self.server.backup_directory)
        except (ValueError, UnicodeError, RecursionError) as error:
            self.json_response(400, {'error': str(error) or '备份请求格式无效'})
            return
        except OSError:
            self.json_response(500, {'error': '备份未能写入育儿目录，请保留网页并重试'})
            return
        self.json_response(201, result)


def create_server(bind='127.0.0.1', port=5317, directory=PROJECT_ROOT, *, backup_directory=BACKUP_DIRECTORY):
    bind = loopback_address(bind)
    server_type = ThreadingHTTPServer
    if ':' in bind:
        class IPv6Server(ThreadingHTTPServer):
            address_family = socket.AF_INET6
        server_type = IPv6Server
    server = server_type((bind, port), partial(BackupHandler, directory=str(Path(directory).resolve())))
    host = '[' + bind + ']' if ':' in bind else bind
    server.backup_host = host + ':' + str(server.server_address[1])
    server.backup_directory = Path(backup_directory)
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5317)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--directory', type=Path, default=PROJECT_ROOT)
    args = parser.parse_args()
    try:
        server = create_server(args.bind, args.port, args.directory)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print('本机预览：http://' + server.backup_host, flush=True)
    print('JSON 备份目录：' + str(BACKUP_DIRECTORY), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
