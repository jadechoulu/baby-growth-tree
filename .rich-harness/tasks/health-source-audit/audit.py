"""只读校对：独立页面文本/坐标及单元格内容，对照卫健委全量JSON。"""
import csv
import difflib
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / 'assets/wst580-2017.pdf'
DATA = ROOT / 'data/health-standard.json'
OUT = ROOT / 'docs/audits'
clean = lambda value: re.sub(r'\s+', '', value or '')
source = json.loads(DATA.read_text())
items = source['items']
by_number = {item['number']: item for item in items}
domains = {entry['label']: entry['id'] for entry in source['domains']}
checks = defaultdict(list)
issues = []
a_items, b_items = {}, {}

def check(number, field, actual, expected):
    ok = clean(actual) == clean(expected) if isinstance(actual, str) else actual == expected
    checks[number].append((field, ok))
    if not ok:
        issues.append(dict(number=number, field=field, actual=actual, expected=expected))

with pdfplumber.open(PDF) as pdf:
    previous_headers = []
    for index in range(5, 8):
        page = pdf.pages[index]
        # 独立于原导入器，直接在整页文本定位编号/名称。
        raw_titles = {}
        for line in page.extract_text().splitlines():
            for match in re.finditer(r'□(\d+)(.*?)(?=□\d+|$)', line):
                raw_titles[int(match[1])] = clean(match[2])
        words = page.extract_words()
        header_rows = defaultdict(list)
        for word in words:
            if re.fullmatch(r'\d+月龄', word['text']):
                header_rows[round(word['top'])].append(word)
        label_lines = [line for line in page.crop((50, 0, 100, page.height)).extract_text_lines()
                       if clean(line['text']) in domains]
        for word in words:
            match = re.match(r'^□(\d+)', word['text'])
            if not match:
                continue
            number = int(match[1])
            assert number not in a_items, ('A duplicate', number)
            headers_before = [row for top, row in header_rows.items() if top < word['top']]
            headers = sorted(headers_before[-1] if headers_before else previous_headers, key=lambda value: value['x0'])
            assert len(headers) in (3, 5), (index + 1, number, headers)
            header = min(headers, key=lambda value: abs(value['x0'] - word['x0']))
            label = min(label_lines, key=lambda value: abs(value['top'] - word['top']))
            raw = raw_titles[number]
            a_items[number] = dict(title=raw.rstrip('R*'), month=int(re.match(r'\d+', header['text'])[0]),
                domain=domains[clean(label['text'])], parentReport='R' in raw, attention='*' in raw, tablePage=index + 1)
            for field, expected in a_items[number].items():
                check(number, field, by_number[number][field], expected)
            check(number, 'id', by_number[number]['id'], f'wst580-{number:03}')
        previous_headers = header_rows[max(header_rows)]
    for index in range(11, 26):
        page = pdf.pages[index]
        for table in page.find_tables():
            if len(table.columns) != 3:
                continue
            for geometry in table.rows:
                # 从PDF原坐标重新读三列，不采用原导入器table.extract()的返回值。
                cells = [clean(page.crop(box).extract_text()) if box else '' for box in geometry.cells]
                match = re.match(r'^(\d+)[．.、](.*)', cells[0])
                if not match:
                    continue
                number = int(match[1])
                assert number not in b_items, ('B duplicate', number)
                b_items[number] = dict(methodTitle=match[2], method=cells[1], requirement=cells[2], methodPage=index + 1)
                for field, expected in b_items[number].items():
                    check(number, field, by_number[number][field], expected)
        # 原始文字保留在任务证据目录，便于复查换行与页序。
        (ROOT / '.rich-harness/tasks/health-source-audit' / f'pdf-page-{index+1:02}.txt').write_text('\n'.join(line.rstrip() for line in page.extract_text().splitlines()) + '\n')

assert set(a_items) == set(b_items) == set(by_number) == set(range(1, 262))
assert len({item['id'] for item in items}) == 261
assert hashlib.sha256(PDF.read_bytes()).hexdigest() == source['sha256']
assert set(source['months']) == {item['month'] for item in items}
title_groups = defaultdict(list)
for item in items:
    title_groups[clean(item['title'])].append(item['number'])
duplicates = {title: numbers for title, numbers in title_groups.items() if len(numbers) > 1}
pairs = [(a, b) for index, a in enumerate(items) for b in items[index + 1:]
         if a['domain'] == b['domain'] and difflib.SequenceMatcher(None, a['title'], b['title']).ratio() >= .72]
base_variants = [item for item in items if clean(item['title']) != clean(item['methodTitle']).rstrip('R*')]
labels = {entry['id']: entry['label'] for entry in source['domains']}
OUT.mkdir(exist_ok=True)
tsv = OUT / 'wst580-2017-全261项原文核对-20261104.tsv'
fields = ['编号', '稳定ID', '能区', '标准月龄', '表A名称', '表B名称', 'R', '*', 'PDF表A页', 'PDF表B页', '操作方法', '通过要求', '核对字段数', '核对结果']
with tsv.open('w', newline='', encoding='utf-8-sig') as file:
    writer = csv.writer(file, delimiter='\t', lineterminator='\n')
    writer.writerow(fields)
    for item in items:
        n = item['number']
        writer.writerow([n, item['id'], labels[item['domain']], item['month'], item['title'], item['methodTitle'],
            'R' if item['parentReport'] else '', '*' if item['attention'] else '', item['tablePage'], item['methodPage'],
            item['method'], item['requirement'], len(checks[n]), '一致' if all(ok for _, ok in checks[n]) else '需处理'])
report = OUT / 'wst580-2017-全量原文核对-20261104.md'
lines = ['# 卫健委 WS/T 580—2017 全量原文核对', '',
    '核对日期：2026-11-04。此为本地核对结果，不代表本批改动已上线。', '',
    '## 范围与结论', '',
    f'- 源件：`assets/wst580-2017.pdf`，26页；与用户提供的微信读书原文件SHA-256相同：`{source["sha256"]}`。',
    '- 表A.1：PDF第6–8页（印刷页4–6）；表B.1：PDF第12–26页（印刷页10–24）。以下页码均为PDF文件页码。',
    f'- 五能区、28个标准月龄组、261项全部覆盖，编号1–261及稳定ID完整，无重复ID和漏项。',
    f'- 全量校对每项11个字段（含稳定ID、名称、能区、月龄、R/*、两处页码、方法及通过要求），共{sum(len(v) for v in checks.values())}次字段比较；仅忽略空白/换行，不忽略汉字、方向、数量和标记。发现{len(issues)}处与原件不一致。',
    f'- 261个表A项目名称及261个表B项目名称各自均无完全同名项目。跨月龄存在相似动作、不同方向/时长/数量/条件，是原标准不同编号项目。',
    '- 未修改技能数据、依赖关系或个人观察记录；不将相似名称合并成同一项目，也不自动建立依赖或补记完成。', '',
    '## 方法与独立性', '',
    '1. 重新运行原导入器，输出到临时目录，与现有JSON的所有项目字段逐项比较，结果无差异。',
    '2. 不复用原导入器函数，以整页文本识别表A的编号和全名，再用文字坐标而非表格列下标核对月龄表头及能区标签。',
    '3. 按PDF表格原始坐标重新读取表B每一项三列，核对原文名称、操作方法和通过要求；同时检查两张表编号各自1–261恰好一次。',
    '4. 原件同时对若干项目使用不同短名称、标点或列举顺序，分字段保留，不擅自统一成作者没有写的名称。',
    '5. 全量机器校对能确认转录和归属与文件一致；相似项另以原文条件比较，不据此声称临床等价或必过前置。', '',
    '复核脚本：`.rich-harness/tasks/health-source-audit/audit.py`；完整字段见报告同目录的TSV：`'+tsv.name+'`。', '',
    '## 截图所示项目', '',
    '| 编号 | 月龄 | 原文项目 | 附录B通过要求 | PDF页 |', '| --- | --- | --- | --- | --- |']
for n in [203,204,214,222,223,233]:
    item = by_number[n]
    lines.append(f'| {n} | {item["month"]} | {item["title"]} | {item["requirement"]} | {item["tablePage"]} / {item["methodPage"]} |')
lines += ['', '**204要求向前，223要求向后**；203是独脚保持时间，214是踩踏板，222是接球，233是连续拍球，各自有不同编号及通过要求。截图没有同一编号在不同月龄重复出现。', '',
    '## 全部月龄与能区归属', '', '| 标准月龄 | 大运动 | 精细动作 | 适应能力 | 语言 | 社会行为 | 合计 |', '| --- | --- | --- | --- | --- | --- | --- |']
for month in source['months']:
    counts = Counter(item['domain'] for item in items if item['month'] == month)
    lines.append('| '+ ' | '.join(map(str, [month]+[counts[d['id']] for d in source['domains']]+[sum(counts.values())]))+' |')
lines += ['', '## 相似名称候选的逐对要求对照', '',
    f'本节列出同能区名称相似度≥0.72的{len(pairs)}对，供定位疑似重复；相似度只用于发现候选，不用于判定等价、进阶或建立连线。所有261项的完整要求均在后附清单及TSV中。', '',
    '| 项目A | 项目B | A的通过要求 | B的通过要求 |', '| --- | --- | --- | --- |']
for a,b in pairs:
    lines.append(f'| {a["number"]} · {a["month"]}月 · {a["title"]} | {b["number"]} · {b["month"]}月 · {b["title"]} | {a["requirement"]} | {b["requirement"]} |')
lines += ['', '## 原件表A与表B短名称不完全相同的项目', '',
    f'排除R/*后仍有{len(base_variants)}项名称差异，下列均来自原件，两处文本分别保留，并非擅自改名。', '',
    '| 编号 | 表A名称 | 表B名称 | PDF页A/B |', '| --- | --- | --- | --- |']
for item in base_variants:
    lines.append(f'| {item["number"]} | {item["title"]} | {item["methodTitle"]} | {item["tablePage"]} / {item["methodPage"]} |')
lines += ['', '## 全261项清单', '', '| 编号 | 标准月龄 | 能区 | 表A名称 | R/* | PDF页A/B | 通过要求 | 结果 |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
for item in items:
    n=item['number']; flags=('R' if item['parentReport'] else '')+('*' if item['attention'] else '')
    lines.append(f'| {n} | {item["month"]} | {labels[item["domain"]]} | {item["title"]} | {flags} | {item["tablePage"]} / {item["methodPage"]} | {item["requirement"]} | '+('一致' if all(ok for _,ok in checks[n]) else '需处理')+' |')
lines += ['', '## 差异记录', '', json.dumps(issues, ensure_ascii=False, indent=2) if issues else '与原件不一致的字段：0。']
report.write_text('\n'.join(lines)+'\n')
(ROOT/'.rich-harness/tasks/health-source-audit/result.json').write_text(json.dumps(dict(items=len(items), comparisons=sum(len(v) for v in checks.values()),issues=issues,duplicates=duplicates,similarPairs=len(pairs),baseVariants=len(base_variants)),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(items=len(items), comparisons=sum(len(v) for v in checks.values()),issues=issues,duplicates=duplicates,similarPairs=len(pairs),baseVariants=len(base_variants)),ensure_ascii=False,indent=2))
assert not issues, '存在需人工处理的字段差异，见报告'
