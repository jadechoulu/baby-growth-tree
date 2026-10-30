"""从 WS/T 580—2017 原件提取表 A.1 与表 B.1；输入 PDF 路径，不修改原件。"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import pdfplumber

MONTHS = list(range(1, 13)) + list(range(15, 37, 3)) + list(range(42, 85, 6))
DOMAINS = [('gross', '大运动'), ('fine', '精细动作'), ('adaptive', '适应能力'),
           ('language', '语言'), ('social', '社会行为')]


def compact(value):
    return re.sub(r'\s+', '', value or '')


def extract(source):
    items = {}
    with pdfplumber.open(source) as pdf:
        months = []
        for page_index in range(5, 8):
            page = pdf.pages[page_index]
            for table in page.find_tables():
                rows = table.extract()
                if len(table.columns) < 6:
                    continue
                labels = []
                for row, geometry in zip(rows, table.rows):
                    for col, value in enumerate(row):
                        name = compact(value)
                        if col < 3 and name in dict((label, key) for key, label in DOMAINS):
                            bbox = geometry.cells[col]
                            labels.append(((bbox[1] + bbox[3]) / 2,
                                           dict((label, key) for key, label in DOMAINS)[name]))
                for row, geometry in zip(rows, table.rows):
                    if any(compact(value) == '项目' for value in row):
                        months = [int(re.search(r'(\d+)月龄', value)[1]) for value in row if value and re.search(r'(\d+)月龄', value)]
                    for col, value in enumerate(row):
                        if not value or '□' not in value:
                            continue
                        bbox = geometry.cells[col]
                        # 两个长标题越过单元格文字边界，扩至右侧留白，仍不跨入下一列项目。
                        text = compact(page.crop((bbox[0], bbox[1], min(bbox[2] + 9, page.width), bbox[3])).extract_text())
                        match = re.fullmatch(r'□(\d+)(.+)', text)
                        if not match:
                            raise ValueError(f'项目单元格异常: {value}')
                        number, title = int(match[1]), match[2]
                        domain = min(labels, key=lambda label: abs(label[0] - (bbox[1] + bbox[3]) / 2))[1]
                        month = months[(col - 4) // 3]
                        assert number not in items, number
                        items[number] = dict(id=f'wst580-{number:03}', number=number,
                                             title=title.rstrip('R*'), month=month, domain=domain,
                                             parentReport='R' in title, attention='*' in title,
                                             tablePage=page_index + 1)
        for page_index in range(11, 26):
            for table in pdf.pages[page_index].extract_tables():
                for row in table:
                    match = re.match(r'^(\d+)[．.、](.*)', compact(row[0]))
                    if not match:
                        continue
                    number = int(match[1])
                    assert number in items and 'method' not in items[number], number
                    items[number].update(methodTitle=match[2], method=(row[1] or '').replace('\n', ''),
                                         requirement=(row[2] or '').replace('\n', ''), methodPage=page_index + 1)
    assert set(items) == set(range(1, 262))
    assert {item['month'] for item in items.values()} == set(MONTHS)
    for month in MONTHS:
        for domain, _ in DOMAINS:
            group = [item for item in items.values() if item['month'] == month and item['domain'] == domain]
            assert len(group) in [1, 2], (month, domain, group)
    for item in items.values():
        assert item['method'] and item['requirement'], item
    return dict(standard='WS/T 580—2017', title='0岁～6岁儿童发育行为评估量表',
                publisher='中华人民共和国国家卫生和计划生育委员会', published='2017-10-12',
                effective='2018-04-01', sha256=hashlib.sha256(Path(source).read_bytes()).hexdigest(),
                months=MONTHS, domains=[dict(id=key, label=label) for key, label in DOMAINS],
                items=[items[number] for number in sorted(items)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('--output', default='data/health-standard.json')
    args = parser.parse_args()
    content = extract(args.source)
    Path(args.output).write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n')
    print(f"已提取 {len(content['items'])} 项、{len(content['months'])} 个月龄组；附录 B 方法齐全。")
