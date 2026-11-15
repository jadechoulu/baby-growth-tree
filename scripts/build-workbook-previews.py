"""为已公开归档的原始主题表生成本站只读预览；不执行公式或外部链接。"""
from html import escape
from pathlib import Path
import posixpath
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1] / 'english/assets/sources/reading-guides'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def preview(path):
    with ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(item.itertext()) for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        links = {item.attrib['Id']: posixpath.normpath('xl/' + item.attrib['Target']).lstrip('/')
                 if not item.attrib['Target'].startswith('/') else item.attrib['Target'].lstrip('/')
                 for item in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
                 if item.attrib.get('TargetMode') != 'External'}
        sheets = []
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).find('s:sheets', NS):
            source = ET.fromstring(archive.read(links[sheet.attrib[REL]]))
            rows = []
            for row in source.findall('s:sheetData/s:row', NS):
                cells = {}
                for cell in row:
                    address = re.match(r'([A-Z]+)', cell.attrib['r'])[1]
                    column = 0
                    for char in address:
                        column = column * 26 + ord(char) - 64
                    value = cell.find('s:v', NS)
                    text = value.text or '' if value is not None else ''
                    if cell.attrib.get('t') == 's':
                        text = shared[int(text)] if text else ''
                    elif cell.attrib.get('t') == 'inlineStr':
                        text = ''.join(cell.find('s:is', NS).itertext())
                    cells[column] = text
                if any(cells.values()):
                    rows.append((row.attrib['r'], cells))
            width = max((max(cells) for _, cells in rows), default=1)
            content = ''.join('<tr><th>' + escape(number) + '</th>' + ''.join('<td>' + escape(cells.get(c, '')) + '</td>' for c in range(1, width + 1)) + '</tr>' for number, cells in rows)
            sheets.append((sheet.attrib['name'], '<table><tbody>' + content + '</tbody></table>'))
    nav = ''.join(f'<a href="#sheet-{i}">{escape(name)}</a>' for i, (name, _) in enumerate(sheets))
    body = ''.join(f'<section id="sheet-{i}"><h2>{escape(name)}</h2><div class="table-scroll">{table}</div></section>' for i, (name, table) in enumerate(sheets))
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(path.name) + '</title><style>body{margin:0;background:#fffdf7;color:#25463b;font:14px/1.5 system-ui}nav{position:sticky;top:0;display:flex;gap:6px;padding:8px;background:#eef4ef;overflow:auto}a{white-space:nowrap;padding:4px 8px;color:inherit;border:1px solid #cddbd1;border-radius:5px;text-decoration:none}section{display:none;padding:8px}section:first-of-type{display:block}body:has(section:target) section{display:none}body:has(section:target) section:target{display:block}h2{font-size:14px;margin:0 0 8px}.table-scroll{overflow:auto;max-height:calc(100vh - 92px)}table{border-collapse:collapse;min-width:100%}td,th{border:1px solid #dce4da;padding:5px 8px;min-width:60px;max-width:350px;white-space:pre-wrap;vertical-align:top;overflow-wrap:anywhere}th{background:#eef4ef;min-width:24px;position:sticky;left:0}</style><nav aria-label="工作表">' + nav + '</nav>' + body + '</html>'


if __name__ == '__main__':
    for path in ROOT.glob('*.xlsx'):
        path.with_suffix('.xlsx.preview.html').write_text(preview(path), encoding='utf-8')
