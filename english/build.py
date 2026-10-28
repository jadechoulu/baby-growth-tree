"""从已核对的资料数据生成可直接打开的 HTML；不依赖构建工具或网络。"""
from pathlib import Path
import argparse, json, base64, mimetypes, re, shutil

ROOT = Path(__file__).resolve().parent
RAW = {name: json.loads((ROOT / 'data' / (name + '.json')).read_text()) for name in ['banana','xu','qing','editorial']}
RAW['resourceCovers'] = json.loads((ROOT / 'data' / 'resource-covers.json').read_text())
RAW['sssSongs'] = json.loads((ROOT / 'data' / 'sss-songs.json').read_text())

RAW['xuSupplements'] = [json.loads((ROOT / 'data' / (name + '.json')).read_text()) for name in ['xu-thousand','xu-panorama']]
RAW['xuSupplements'][0]['relatedSources'] = [{'id':'xu-thousand-map','title':'许密杉路线 · 四阶段图解','file':'assets/sources/xu-thousand-map.png','previews':[{'page':1,'path':'assets/previews/xu-thousand-map.jpg'}],'note':'用户提供的团拼整理图，与许密杉阶段执行表PDF的四阶段为同一计划的图解；不另计为新阶段。PDF优先保留其完整原文，两者细节差异分别注明。'}]

def inline_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')

css=(ROOT/'styles.css').read_text().replace("@import url('');\n",'')+'\n'+(ROOT.parent/'site.css').read_text()
sections=json.loads((ROOT.parent/'shared/site-sections.json').read_text())
assert len({item['id'] for item in sections}) == len(sections), '分类 ID 重复'
for item in sections:
    assert (ROOT.parent/item['entry'].split('#')[0].split('?')[0]).is_file(), '分类入口不存在：'+item['entry']
config='// 自动生成自 site-sections.json，请勿手改。\nwindow.XIAOYA_SITE_SECTIONS='+inline_json(sections)+';\n'
config_path=ROOT.parent/'shared/site-config.js'
if not config_path.exists() or config_path.read_text()!=config: config_path.write_text(config)
js=(ROOT.parent/'shared/baby-profile.js').read_text()+'\n'+(ROOT.parent/'shared/site-shell.js').read_text()+'\n'+'\n'.join((ROOT/file).read_text() for file in ['model.js','app.js'])
assert not re.search(r'</script', js, re.I), '脚本包含意外的结束标签'

BASE='''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#2e6954">
<meta name="description" content="香蕉妈妈、许密杉、庆爸完整启蒙路线、素材套系与关联导航，含宝宝视角和原页预览。">
<title>小芽英语 · 启蒙路线与素材地图</title>
<style>__CSS__</style>
</head>
<body>
<div id="app"><div class="loading">正在展开启蒙小地图…</div></div>
<div id="overlay"></div><div id="preview"></div>
<script>window.XIAOYA_SITE_SECTIONS=__SECTIONS__;window.XIAOYA_SITE_ROOT=__ROOT__;</script>
<script>window.ROADMAP_SITE=__SITE__;window.ROADMAP_RAW=__RAW__;window.ROADMAP_ASSETS=__ASSETS__;</script>
<script>__JS__</script>
</body>
</html>'''

def write(path, assets, raw=RAW, script=js, site=None):
    site = site or {'home':'../home.html','growth':'../index.html'}
    html=BASE.replace('__SECTIONS__',inline_json(sections)).replace('__ROOT__',inline_json(site['home'].removesuffix('home.html'))).replace('__CSS__',css).replace('__SITE__',inline_json(site)).replace('__RAW__',inline_json(raw)).replace('__ASSETS__',inline_json(assets)).replace('__JS__',script)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(html)
    print(str(path), f'{path.stat().st_size / 1024 / 1024:.1f} MB')

def public_data(value):
    """公开页面仅保留路线资料，不携带本机来源路径。"""
    if isinstance(value, dict):
        return {key: public_data(item) for key, item in value.items()
                if key not in ('originalPath', 'sourceOriginalPath')}
    if isinstance(value, list):
        return [public_data(item) for item in value]
    return value

def build_pages():
    output = ROOT.parent / 'dist' / 'english-pages'
    raw = public_data(RAW)
    # 公开页面只带通用路线资料，个人档案由访问者在自己的浏览器设置。
    raw['editorial'] = {'suggestedAliases': raw['editorial'].get('suggestedAliases', [])}
    if js.count("birthDate:'',vocabulary:0") != 1:
        raise ValueError('默认档案必须为空，个人资料不能写入公开源码')
    public_js = js
    paths = set()
    def collect(value):
        if isinstance(value, dict):
            for item in value.values(): collect(item)
        elif isinstance(value, list):
            for item in value: collect(item)
        elif isinstance(value, str) and value.startswith('assets/'):
            paths.add(value)
    collect(raw)
    for relative in paths:
        source = (ROOT / relative).resolve()
        if not source.is_relative_to((ROOT / 'assets').resolve()) or not source.is_file():
            raise ValueError('公开资料文件无效：' + relative)
    if output.exists(): shutil.rmtree(output)
    output.mkdir(parents=True)
    write(output / 'index.html', {}, raw, public_js)
    for relative in sorted(paths):
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    (output / '.nojekyll').write_text('')
    print('已生成英语 Pages 发布包；仅含网页和引用资料，不包含宝宝档案、记录或本机路径。')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pages', action='store_true', help='生成公开英语导航到 dist/english-pages')
    args = parser.parse_args()
    if args.pages:
        build_pages()
    else:
        write(ROOT/'index.html',{})
        embedded={}
        for path in sorted((ROOT/'assets').rglob('*')):
            if not path.is_file() or path.name.startswith('.'): continue
            mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            embedded[path.relative_to(ROOT).as_posix()]='data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
        write(ROOT.parent/'output/web/英语启蒙路线导航.html',embedded,site={'home':'../../home.html','growth':'../../index.html'})
