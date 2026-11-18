# -*- coding: utf-8 -*-
"""从用户原表导入低幼路线；显式映射只复用已确认的同媒介套系。"""
from pathlib import Path
import json, zipfile, xml.etree.ElementTree as ET, re, hashlib
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'english/assets/sources/low-age/lili-0-3.xlsx'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(SOURCE) as z:
    strings = [''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    cells = {c.attrib['r']: strings[int(c.find('m:v', NS).text)] if c.attrib.get('t') == 's' else c.find('m:v', NS).text for c in sheet.findall('.//m:c', NS) if c.find('m:v', NS) is not None}
    merges = [c.attrib['ref'] for c in sheet.findall('m:mergeCells/m:mergeCell', NS)]
def coordinate(cell):
    letters, row = re.fullmatch(r'([A-Z]+)(\d+)', cell).groups()
    col = 0
    for letter in letters: col = col * 26 + ord(letter) - 64
    return col, int(row)
def source_cell(cell):
    x, y = coordinate(cell)
    for merged in merges:
        start, end = merged.split(':'); a, b = coordinate(start); c, d = coordinate(end)
        if a <= x <= c and b <= y <= d: return start, merged
    return cell, cell
def original(col, row):
    cell, span = source_cell(col + str(row))
    return {'cell': cell, 'range': span, 'text': cells.get(cell, '').strip()}
# 每条采用 名称|级别|选材要求；同名不同媒介分别入公共模型，不按题名猜版次。
MAP = [
 {15: 'SSS 指令式儿歌|动物主题|必',17:'兔呗乐名词闪卡||与单词书二选一或叠加',19:'Priddy First 100|实物图单词书|与闪卡二选一或叠加;DK幼儿认知百科全书|小蝌蚪点读引进版|与闪卡二选一或叠加;My First Book of Words|小彼恩毛毛虫点读版|与闪卡二选一或叠加',21:'农场里边谁在吵||选;小蓝鸟发声童谣||选;小兔比利||必'},
 {15:'SSS 指令式儿歌|TPR主题|必',17:'阿布巴布动词卡|TPR|与单词书二选一或叠加',19:'Priddy First 100|实物图单词书|与闪卡二选一或叠加;DK幼儿认知百科全书|小蝌蚪点读引进版|与闪卡二选一或叠加;My First Book of Words|小彼恩毛毛虫点读版|与闪卡二选一或叠加',21:'小熊很忙||必·机关书候选;Campbell机关书||必·机关书候选;羊驼拉玛爱表达||选;欢唱英语||至少选一·儿歌类;Sing Along||至少选一·儿歌类;SSS台词本||至少选一·儿歌类'},
 {15:'SSS 指令式儿歌|认知、生活主题|二选一或叠加;Super Jojo儿歌|认知、生活主题|二选一或叠加',17:'阿布巴布动词卡|TPR|与单词书二选一或叠加',19:'Peekaboo|毛毛虫点读版|至少选一·非实物;尤斯伯恩看里面认知版|引进版双语|至少选一·非实物;尤斯伯恩First Thousand Words|PDF|至少选一·非实物;DK My First花边书||至少选一·复杂实物;Priddy Lift the Flap First 100||至少选一·复杂实物',21:'苹果英语||必·认知类候选;赳赳启蒙篇||必·认知类候选;婴儿英语玩具书||必·认知类候选;Rookie认知系列||必·认知类候选',23:'RAZ|AA|必·主线;海尼曼|GK（版次范围待核）|必·主线;学乐小读者科普版|A|选;学乐高频词|A|选;培生基础词汇|基础词汇 · 上下辑未指定|1岁半以上选;大猫分级|粉色A（原表标尺）|1岁半以上选;悠游阅读成长计划|第1级·第1–2套|1岁半以上选;学乐小读者漫画版|A|1岁半以上选;学乐高频词故事版|第一辑|1岁半以上选;学乐巴蒂小读者|A|1岁半以上选',25:'SSS儿歌动画||选;Super Jojo儿歌动画||选;Didi’s day||选;Play Along||选'},
 {15:'SSS 指令式儿歌|自选熟悉儿歌|选',17:'Susan名词卡||选·1岁半以上新启蒙;Susan动词卡||选·1岁半以上新启蒙',19:'Peekaboo|毛毛虫点读版|至少选一·非实物;尤斯伯恩看里面认知版|引进版双语|至少选一·非实物;尤斯伯恩First Thousand Words|PDF|至少选一·非实物;DK My First花边书||至少选一·复杂实物;Priddy Lift the Flap First 100||至少选一·复杂实物',21:'米菲兔||至少选一·简单故事;牛津小土豆||至少选一·简单故事;Busy Day职业系列||至少选一·简单故事;拜伦巴顿交通工具||至少选一·简单故事;古力小超人||至少选一·IP;橡树林的故事||至少选一·IP;小鼠波波||至少选一·IP;一根毛||至少选一·IP',23:'RAZ|A|必·主线;培生启明星|1|选;学乐小读者科普版|A|选;学乐小读者漫画版|A|选;学乐高频词|A|选;学乐高频词故事版|第一辑（承接左栏）|选;学乐巴蒂小读者|A|选;大猫分级|粉色B（原表标尺）|选;悠游阅读成长计划|第1级·第3–5套|选;国家地理儿童百科|入门级|选',25:'Yakka Dee||选;Wow English|第1级（原表标尺）|选;古力小超人||选;车宝四兄弟||选;绿色大森林|Little Fox L1|选'},
 {15:'SSS 指令式儿歌|自选熟悉儿歌|选',17:'Susan名词卡|简单游戏|选;Susan动词卡|简单游戏|选',21:'Diggersaurs||多选几套·故事;托马斯小火车|1级|多选几套·故事;波西与皮普|英文版|多选几套·故事;饼干狗||多选几套·故事;I can read|预备级·中信引进版|多选几套·故事;尤斯伯恩我的第一图书馆||多选几套·故事;WPlay词汇妙趣国||至少一套·科普故事;Busy Wheels||至少一套·科普故事;I’m the Driver||至少一套·科普故事;Miles Kelly交通工具||至少一套·科普故事;Helper职业探索||至少一套·科普故事',23:'RAZ|B|必·主线;培生启明星|2|选;学乐小读者科普版|B|选;学乐小读者漫画版|B|选;学乐高频词|B|选;学乐高频词故事版|B（版次范围待核）|选;学乐巴蒂小读者|B|选;大猫分级|红色A（原表标尺）|选;悠游阅读成长计划|第1级·第6–7套|选;美国国家地理英语分级读物|Pre-reader|选;Jump百科分级|蝌蚪ABC|选',25:'词汇妙趣国||至少一或叠加;动物王国大冒险||至少一或叠加;Wow English|第2级（原表标尺）|至少一或叠加;挖掘机麦克斯||至少一或叠加;汽车小英雄||至少一或叠加;蝙蝠和朋友们|Little Fox L1|至少一或叠加;蓝色小考拉||至少一或叠加;小鼠波波||至少一或叠加'},
 {15:'SSS 指令式儿歌|自选熟悉儿歌|选',17:'Susan名词卡|游戏、讨论|选;Susan动词卡|游戏、讨论|选',21:'小猪小象||多选几套·故事;皮特猫|原表“皮特毛”，名称待核|多选几套·故事;小毛人||多选几套·故事;尤斯伯恩Peep Inside||至少选一·简单科普;尤斯伯恩Very First Q&A||至少选一·简单科普;Play Town||至少选一·简单科普;国家地理低幼纸板书||至少选一·简单科普;国家地理Little Kids||至少选一·简单科普;DK See How They Grow|原表拼写see how the grow|至少选一·简单科普',23:'RAZ|C|必·主线;培生启明星|3|选;学乐小读者科普版|C|选;学乐小读者漫画版|C|选;学乐高频词|C|选;学乐高频词故事版|C（版次范围待核）|选;学乐巴蒂小读者|C|选;大猫分级|红色B（原表标尺）|选;悠游阅读成长计划|第1级·第9–10套（原表未列8）|选;Jump百科分级|蝌蚪CDE|选',25:'Wow English|第3–5级（原表标尺）|至少一或叠加;Little Fox恐龙朋友们|L1·名称对应待核|至少一或叠加;汽车学校||至少一或叠加;道奇||至少一或叠加;小猪佩奇||至少一或叠加'}
]
LABELS = {13:'亲子英语（家长参考）',15:'儿歌',17:'闪卡',19:'单词书／认知',21:'绘本',23:'分级',25:'动画'}
LEGACY_RECORD_IDS = {
  '培生基础词汇':'resource-1nuqi5t',
  '学乐小读者科普版':'resource-1fz5ghc',
  '学乐小读者漫画版':'resource-w0emcz',
  '学乐高频词故事版':'resource-1ajhfj0',
  '学乐巴蒂小读者':'resource-d2cdat',
  '国家地理儿童百科':'resource-1fxwtds',
  '美国国家地理英语分级读物':'resource-7odyop',
  'I can read':'resource-1eyszlp',
  '托马斯小火车':'resource-1kiztil',
  'Jump百科分级':'resource-1qi1xdy',
}
TITLES = ['名词与实物','名词加动作','认知与生活','短故事与分级','扩展故事','兴趣轻科普']
METHODS = ['同一个熟悉物品，指给宝宝看，说一个词或一句话；留出回应时间。','用拿、放、开、关等生活动作配短指令，先示范，再等宝宝参与。','从宝宝正玩的大小、颜色、形状出发，不抽考概念；重复同一短句。','选一本画面清楚、每页短句的故事，共读后把句型用到玩耍里。','围绕喜欢的角色读一小段，能跟随画面理解再延长；动画仅为家庭自选补充。','用喜欢的动物、职业或交通工具回答一个小问题，看图讨论，不要求复述。']
SIGNALS = [['愿意看向共同关注的实物','熟悉声音出现时有指、看或拿的回应','愿意再玩一次'],['熟悉指令下能参与一个动作','换一个同类物品仍有理解回应','愿意重复儿歌动作'],['能在熟悉场景理解短句','换一个画面仍能找到同一概念','愿意继续看或玩'],['能跟随短故事的画面','熟悉句型能在生活里迁移','愿意重复共读'],['能跟随一小段连续情节','能用指认或动作表达理解','延长内容后仍保持兴趣'],['对一个主题主动关注','能结合画面理解简单因果或信息','愿意交流、指认或提问']]
GOALS = ['约50词：从动物、水果、汽车、身体和家人等熟悉实物开始。','约100词：以名词和动作为主。','约150词：在生活中认识颜色、形状、大小和数量，理解短句。','约300词：共读短故事和入门分级，积累常用句型。','500–700词：扩展喜欢的角色与主题，跟随连续情节。','800–1000词：通过故事和简单科普探索感兴趣的话题。']
ENTRIES = ['刚接触英语，愿意一起看实物、听声音。','已熟悉一些物品名称，愿意看、指、拿或模仿动作。','已理解熟悉名词和简单动作指令，开始关注大小、形状、颜色等概念。','能理解熟悉的生活短句，愿意跟着画面听简单故事。','能跟随短故事，愿意重复熟悉句型、尝试稍长情节。','能跟随连续故事，对动物、职业或交通工具等主题有兴趣。']
EXITS = ['愿意一起看和玩，听到熟悉的词会看、指或拿。','能跟随熟悉指令做动作，换个物品也能理解。','能理解生活短句，换个画面仍能认出同一概念。','能跟随短故事，并在生活中理解熟悉句型。','能跟随连续情节，稍长的内容也愿意参与。','主动关注喜欢的主题，能看图理解并参与交流。']
def selection_path(index, row, requirement, col):
    """显式维护选择范围；类别互选与类别内部选材分别保留，不从书名猜关系。"""
    def group(key, title, rule, order, rows):
        return {'id':key, 'title':title, 'rule':rule, 'order':order,
                'sources':[original(col, r) for r in rows]}
    path = []
    if index <= 2 and row in [17, 19]:
        path.append(group('vocabulary', '闪卡与单词书', '两类二选一，也可搭配', 20, [17, 19]))
        path.append(group('flashcards' if row == 17 else 'wordbooks', '① 闪卡' if row == 17 else '② 单词书／认知',
                          '选这类时，下面两组各至少选一' if index == 2 and row == 19 else '以下为同类素材示例', row, [row]))
    if index in [2, 3] and row == 19:
        nonreal = requirement == '至少选一·非实物'
        path.append(group('nonreal' if nonreal else 'real', '非实物认知书' if nonreal else '复杂实物图书',
                          '以下至少选一套', (1 if nonreal else 2) + (20 if index == 3 else 0), [19]))
    if index == 2 and row == 15:
        path = [group('songs', '认知、生活主题儿歌', '以下两套二选一，也可搭配', 10, [15])]
    if index == 1 and row == 21:
        if requirement == '必·机关书候选':
            path = [group('mechanism', '主线 · 机关书', '以下为同类素材示例', 30, [21])]
        elif requirement == '至少选一·儿歌类':
            path = [group('songbooks', '儿歌类绘本', '以下至少选一套', 31, [21])]
    if index == 2 and row == 21:
        path = [group('cognition', '主线 · 认知绘本', '以下为同类素材示例', 30, [21])]
    if index == 3 and row == 21:
        simple = requirement == '至少选一·简单故事'
        path = [group('simple-stories' if simple else 'ip', '简单故事类' if simple else 'IP套系类',
                      '以下至少选一套', 30 if simple else 31, [21])]
    if index in [4, 5] and row == 21:
        stories = requirement == '多选几套·故事'
        path = [group('stories' if stories else 'science', '故事类' if stories else '科普故事类' if index == 4 else '简单科普类',
                      '从以下素材中多选几套' if stories else '以下至少选一套', 30 if stories else 31, [21])]
    if index in [4, 5] and row == 25:
        path = [group('animations', '动画', '以下至少选一部，也可搭配', 50, [25])]
    if not path:
        kind = 'main' if requirement.startswith('必') else 'older' if requirement.startswith('1岁半') else 'optional'
        title = ('主线 · ' if kind == 'main' else '1岁半以上可选 · ' if kind == 'older' else '可选 · ') + LABELS[row]
        path = [group(f'category-{row}-{kind}', title, '', {15:10,17:20,19:21,21:30,23:40,25:50}[row] + (0 if kind == 'main' else 2 if kind == 'older' else 1), [row])]
    return path
resources = {}; stages = []
for index, col in enumerate(['C','I','P','W','AD','AK']):
    groups = [{'label':LABELS[row], **original(col,row)} for row in LABELS]
    materials = []
    for row, spec in MAP[index].items():
        source = original(col, row)
        for entry in spec.split(';'):
            title, level, requirement = entry.split('|')
            media = {15:'song',17:'flashcard',19:'book',21:'book',23:'reader',25:'animation'}[row]
            if title.startswith('I can read') or title.startswith('托马斯小火车'): media='reader'
            # 原表错字不作为已确认别名绑定既有进度。
            if '名称待核' in level: title = '皮特毛（原表名称待核）'
            rid = 'low-' + hashlib.sha256((media+':'+title).encode()).hexdigest()[:12]
            resources.setdefault(rid, {'id':rid,'title':title,'type':media,'details':[]})
            basis = '按同一套系名称及媒介引用；具体版次、级别和选读范围以此处原文为准。'
            if media == 'song': basis = 'SSS等儿歌按原表主题自选曲目；不继承其他路线的必备10首或全歌库分母。'
            elif '待核' in level or '原表标尺' in level or '分册' in level: basis = '仅确认套系或原表名称；此范围尚未绑定其他版次目录，不按颜色、数字或分册序号换算级别。'
            elif title.startswith('学乐'): basis = '保留科普／漫画／高频词／故事版等子系列；原表未核定版次，暂不绑定其他学乐整套目录。'
            detail = {'label':'低幼原表引用','text':f"Step {index+1} · 活动复盘表!{source['range']} · {requirement}；{level or '原表未限级别'}；{basis}"}
            resources[rid]['details'].append(detail)
            # 原始role参与历史记录键；展示用途只修正roleEvidence。
            raw_main = '主线' in requirement
            main = requirement.startswith('必')
            selection = {'label':requirement, 'basis':source['text'],
                         'displayLabel':'' if main else requirement,
                         'groupPath':selection_path(index, row, requirement, col)}
            materials.append({'resourceId':rid,'recordResourceId':LEGACY_RECORD_IDS.get(title),**({'recordLevel':'','displayTitle':'培生基础词汇'} if title == '培生基础词汇' else {'recordLevel':{'第1级·第1–2套': '第1级·分册1–2', '第1级·第3–5套': '第1级·分册3–5', '第1级·第6–7套': '第1级·分册6–7', '第1级·第9–10套（原表未列8）': '第1级·分册9–10（原表未列8）'}[level]} if title == '悠游阅读成长计划' else {}),'level':level,'role':'主线' if raw_main else LABELS[row], 'original':source['text'], 'sourceCell':source['range'], 'matchBasis':basis,'selection':selection,'roleEvidence':{'status':'confirmed' if main else 'unresolved','kind':'main' if main else 'reference','usage':'主线' if main else '未标主辅','basis':('用户确认：低幼资料中的“必”表示主线。' if main else '选／至少一／二选一／多选仅说明选材范围，本次引用未核定主辅线。')+' '+basis,'checkedAt':'2026-11-18','sources':[{'sourceId':'low-age','page':index+1,'quote':source['text'],'note':'活动复盘表!'+source['range']+('；2026-11-18用户确认“必”的用途为主线。' if main else '')}]}})
    stage = {'id':f'low-age-{index+1}','title':f'Step {index+1} · {TITLES[index]}','shortTitle':f'Step {index+1}','domain':'listening','ageLabel':'参考年龄：'+original(col,9)['text'],'goal':'目标：'+GOALS[index].replace('：','。',1),'entry':ENTRIES[index],'entryBasis':{'kind':'editorial','basis':'结合当前阶段内容与前一阶段的理解表现整理，供试用选材参考。','previousStageId':f'low-age-{index}' if index else None},'exit':EXITS[index],'pages':[1],'materials':materials,'sourceGroups':groups,'sourceFields':[{'label':label,**original(col,row)} for label,row in [('年龄',9),('词汇目标',7),('学习重点',11)]],'method':METHODS[index],'signals':SIGNALS[index],'notes':['词数是阶段积累目标，不是起步门槛；各路线不直接换算。','同类先选一份，按兴趣增加。阶段由家长确认。'],'activities':[{'title':g['label'],'method':g['text'],'sourceCell':g['range']} for g in groups if g['text'] and g['text']!='/']}
    if index == 0: stage['startingReference']={'kind':'route-start','basis':'原表名词实物、儿歌和触摸共读的零基础起步；不与其他路线目标词数等价。'}
    stages.append(stage)
data = {'title':cells['C2'].replace('\n',' · '),'description':'从实物和动作开始，逐步共读故事、探索科普，按理解和兴趣调整。','source':{'file':'assets/sources/low-age/lili-0-3.xlsx','sheet':'活动复盘表','sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'note':'用户提供原始Excel，保留合并单元格继承关系；原表未署版本日期，2026-11-18导入。'},'ageCases':[{'id':'low-age-0-36','label':'0–3岁','ageMinMonths':0,'ageMaxMonthsExclusive':36}],'notes':[cells['A4'],'本站整理：原表关于3岁前蓝思200的说法为来源主张，不作为结果承诺。','家长亲子英语参考及设备建议保留在原文栏目，不计作宝宝阅读任务。'],'matchingRules':[{'title':'先选当下主题','text':'从宝宝正在吃、穿、洗、玩和喜欢的角色开始，同主题用实物→动作→图片→短句串起来。'},{'title':'再试理解与兴趣','text':'先试一页或一小段：能用看、指、拿、动作回应且愿意继续，就保留；不要求开口、翻译或复述。'},{'title':'一次只加一点难度','text':'优先清晰实物图、重复短句、短篇幅；换同级主题或减少句长后再试。持续回避就停，回到熟悉内容。'},{'title':'最后核对素材范围','text':'同系列还需核对媒介、版次、级别及单册。绘本和动画分开；颜色、数字级别、分册序号不互换。范围待核只记录当前选择，不借其他整套分母。'},{'title':'用量与进阶','text':'每次1–3分钟起，愿意再延长，随时可停。阶段由家长确认。'}],'resources':list(resources.values()),'stages':stages}
(ROOT/'english/data/low-age.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(f"低幼路线：{len(stages)}阶段，{len(resources)}个素材实体，{sum(len(s['materials']) for s in stages)}条阶段引用，42个原文栏目。")
