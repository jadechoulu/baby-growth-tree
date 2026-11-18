# 低幼路线与既有素材复用全量核对

- 核对日期：2026-11-18
- 核对范围：`english/data/low-age.json` 的 89 个原始素材、136 条阶段引用，逐条对照许密杉、庆爸、香蕉妈妈素材与 `resource-volumes.json` 公共册数范围。
- 结果：33 个原始素材可复用既有公共身份（32 个已有其他路线引用，1 个仅有公共目录）；56 个为低幼专属或无可靠对应项。
- 进度口径：136 条阶段引用中，33 条能唯一解析到公共分项范围，直接显示数量或逐本目录；33 条虽复用身份但级别/版本不唯一或未核，继续用状态或候选选择；其余为低幼专属引用。
- 原则：同名同媒介、同一套系的显式别名才归并；公共分项数量只按已核 scope 使用。未核版次、同名不同媒介、或只有整级数量但不匹配原表分项的，不借分母、不显示“0本”。
- 兼容：公共身份变化时，低幼阶段仍保留旧 `recordResourceId` 进度键，并把旧 ID 纳入 `mergedResourceIds` 供共享数量回读。

## 关键显式映射

| 低幼原文 | 归并资源 | 级别处理 |
| --- | --- | --- |
| 学乐小读者科普版 | Guided Science Readers | A/B/C 各沿用 16 本公共分项分母 |
| 学乐小读者漫画版 | First Little Comics | A/B 映射 A&B 合装 20 本，C 映射 C&D 合装 20 本；不拆摊单级 |
| 学乐高频词故事版 | Sight Word Stories | 第一辑映射 A 级 25 本；B/C 沿用 25 本 |
| 学乐巴蒂小读者 | Buddy Reader | A/B/C 各沿用 20 本分项 |
| 国家地理儿童百科／美国国家地理英语分级读物 | National Geographic Readers | 入门级与 Pre-reader 均映射 12 本 Pre-reader 分项 |
| 绿色大森林 | The Big Green Forest | `Little Fox L1` 映射全系列 24 集 |
| 蝙蝠和朋友们 | Bat and Friends | `Little Fox L1` 映射全系列 72 集 |
| 波西与皮普 | Pip and Posy | `英文版` 映射已核 12 本故事选集 |
| 托马斯小火车 | 托马斯和朋友 | 复用素材身份；“1级”不确认等于双语 12 册，不借分母 |
| I can read | I can read | 复用素材身份；“预备级·中信引进版”未核版次，不借特定选本分母 |

## 全量清单

| # | 低幼原文 | 类型 | 归并资源 | 既有路线 | 公共范围 | 处理 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | SSS 指令式儿歌 | song | SSS 指令式儿歌（resource-1bry08c） | 许密杉 | — | 复用身份，范围待核或需候选 |
| 2 | 兔呗乐名词闪卡 | flashcard | 兔呗乐名词闪卡（resource-2qmp6l） | — | — | 状态记录 |
| 3 | Priddy First 100 | book | Priddy First 100（resource-168yypj） | — | — | 状态记录 |
| 4 | DK幼儿认知百科全书 | book | DK幼儿认知百科全书（resource-yjrejm） | — | — | 状态记录 |
| 5 | My First Book of Words | book | My First Book of Words（resource-1j06ua3） | — | — | 状态记录 |
| 6 | 农场里边谁在吵 | book | 农场里边谁在吵（resource-y7ajpx） | — | — | 状态记录 |
| 7 | 小蓝鸟发声童谣 | book | 小蓝鸟发声童谣（resource-qs2qou） | — | — | 状态记录 |
| 8 | 小兔比利 | book | 小兔比利（resource-1wdcw8m） | — | — | 状态记录 |
| 9 | 阿布巴布动词卡 | flashcard | 阿布巴布动词卡（resource-5d3abe） | 许密杉 | — | 复用身份，范围待核或需候选 |
| 10 | 小熊很忙 | book | 小熊很忙（resource-1tie9hk） | — | — | 状态记录 |
| 11 | Campbell机关书 | book | Campbell机关书（resource-leirux） | — | — | 状态记录 |
| 12 | 羊驼拉玛爱表达 | book | 羊驼拉玛爱表达（resource-6z3jet） | — | — | 状态记录 |
| 13 | 欢唱英语 | book | 欢唱英语（resource-bxepfh） | — | — | 状态记录 |
| 14 | Sing Along | book | Sing Along（resource-1nk58x2） | — | — | 状态记录 |
| 15 | SSS台词本 | book | SSS台词本（resource-7d04f2） | — | — | 状态记录 |
| 16 | Super Jojo儿歌 | song | Super Jojo儿歌（resource-4pfnvq） | — | — | 状态记录 |
| 17 | Peekaboo | book | Peekaboo（resource-187sw7w） | — | — | 状态记录 |
| 18 | 尤斯伯恩看里面认知版 | book | 尤斯伯恩看里面认知版（resource-hmas6r） | — | — | 状态记录 |
| 19 | 尤斯伯恩First Thousand Words | book | 尤斯伯恩First Thousand Words（resource-12sm01m） | — | — | 状态记录 |
| 20 | DK My First花边书 | book | DK My First花边书（resource-kz6giv） | — | — | 状态记录 |
| 21 | Priddy Lift the Flap First 100 | book | Priddy Lift the Flap First 100（resource-vvp92c） | — | — | 状态记录 |
| 22 | 苹果英语 | book | 苹果英语（resource-1t45iv5） | — | — | 状态记录 |
| 23 | 赳赳启蒙篇 | book | 赳赳启蒙篇（resource-1249z6l） | — | — | 状态记录 |
| 24 | 婴儿英语玩具书 | book | 婴儿英语玩具书（resource-107tpo9） | — | — | 状态记录 |
| 25 | Rookie认知系列 | book | Rookie认知系列（resource-1alzmkg） | — | — | 状态记录 |
| 26 | RAZ | reader | RAZ（resource-1qnd5uh） | 香蕉妈妈、庆爸 | 28 | 复用公共目录，按级别／选版解析 |
| 27 | 海尼曼 | reader | 海尼曼（resource-9fvmjt） | 香蕉妈妈、许密杉 | 9 | 复用公共目录，按级别／选版解析 |
| 28 | 学乐小读者科普版 | reader | 学乐小读者科普版（resource-nqvpg2） | 香蕉妈妈 | 5 | 复用公共目录，按级别／选版解析 |
| 29 | 学乐高频词 | reader | 学乐高频词（resource-h4sa2o） | 香蕉妈妈 | 1 | 复用公共目录，按级别／选版解析 |
| 30 | 培生词汇妙趣屋 | reader | 培生词汇妙趣屋（resource-1nuqi5t） | 许密杉、庆爸 | 11 | 复用公共目录，按级别／选版解析 |
| 31 | 大猫分级 | reader | 大猫分级（resource-g7xvo5） | 香蕉妈妈、许密杉、庆爸 | 20 | 复用公共目录，按级别／选版解析 |
| 32 | 悠游阅读成长计划 | reader | 悠游阅读成长计划（resource-7vimum） | 香蕉妈妈 | 4 | 复用公共目录，按级别／选版解析 |
| 33 | 学乐小读者漫画版 | reader | 学乐小读者漫画版（resource-19jrpig） | 香蕉妈妈 | 3 | 复用公共目录，按级别／选版解析 |
| 34 | 学乐高频词故事版 | reader | 学乐高频词故事版（resource-z5w7e2） | 香蕉妈妈 | 1 | 复用公共目录，按级别／选版解析 |
| 35 | 学乐巴蒂小读者 | reader | 学乐巴蒂小读者（resource-zl69cf） | 香蕉妈妈、庆爸 | 5 | 复用公共目录，按级别／选版解析 |
| 36 | SSS儿歌动画 | animation | SSS儿歌动画（resource-dpi3mm） | — | — | 状态记录 |
| 37 | Super Jojo儿歌动画 | animation | Super Jojo儿歌动画（resource-1vmvoe6） | — | — | 状态记录 |
| 38 | Didi’s day | animation | Didi’s day（resource-qe1v8g） | 许密杉 | — | 复用身份，范围待核或需候选 |
| 39 | Play Along | animation | Play Along（resource-1txjdrk） | — | — | 状态记录 |
| 40 | Susan名词卡 | flashcard | Susan名词卡（resource-639kek） | — | — | 状态记录 |
| 41 | Susan动词卡 | flashcard | Susan动词卡（resource-19ghr73） | — | — | 状态记录 |
| 42 | 米菲兔 | book | 米菲兔（resource-7i4vjd） | — | — | 状态记录 |
| 43 | 牛津小土豆 | book | 牛津小土豆（resource-1pedkj2） | — | — | 状态记录 |
| 44 | Busy Day职业系列 | book | Busy Day职业系列（resource-13uilyr） | — | — | 状态记录 |
| 45 | 拜伦巴顿交通工具 | book | 拜伦巴顿交通工具（resource-wkccnv） | — | — | 状态记录 |
| 46 | 古力小超人 | book | 古力小超人（resource-1pinwiv） | 香蕉妈妈、庆爸 | 2 | 复用公共目录，按级别／选版解析 |
| 47 | 橡树林的故事 | book | 橡树林的故事（resource-1wkn72n） | — | — | 状态记录 |
| 48 | 小鼠波波 | book | 小鼠波波（resource-14l3hjl） | — | — | 状态记录 |
| 49 | 一根毛 | book | 一根毛（resource-hgdl3y） | — | — | 状态记录 |
| 50 | 培生启明星 | reader | 培生启明星（resource-1mx6gx6） | 香蕉妈妈、许密杉、庆爸 | 11 | 复用公共目录，按级别／选版解析 |
| 51 | 国家地理儿童百科 | reader | 国家地理（resource-5iilo9） | 香蕉妈妈 | 1 | 复用公共目录，按级别／选版解析 |
| 52 | Yakka Dee | animation | Yakka Dee（resource-1tacti） | 许密杉 | — | 复用身份，范围待核或需候选 |
| 53 | Wow English | animation | Wow English（resource-ij95m4） | 许密杉、庆爸 | — | 复用身份，范围待核或需候选 |
| 54 | 古力小超人 | animation | 古力小超人（resource-mkq5i6） | — | — | 状态记录 |
| 55 | 车宝四兄弟 | animation | 车宝四兄弟（resource-rwp2c4） | — | — | 状态记录 |
| 56 | 绿色大森林 | animation | 绿色大森林（resource-1u3sl6e） | 许密杉 | 1 | 复用公共目录，按级别／选版解析 |
| 57 | Diggersaurs | book | Diggersaurs（resource-8rgfp8） | — | — | 状态记录 |
| 58 | 托马斯小火车 | reader | 托马斯小火车（resource-a3pj5d） | — | 1 | 复用公共目录，按级别／选版解析 |
| 59 | 波西与皮普 | book | 波西与皮普（resource-o2t6vh） | 庆爸 | 1 | 复用公共目录，按级别／选版解析 |
| 60 | 饼干狗 | book | 饼干狗（resource-a52ypl） | 庆爸 | 2 | 复用公共目录，按级别／选版解析 |
| 61 | I can read | reader | I can read（resource-1qn098f） | 庆爸 | 1 | 复用公共目录，按级别／选版解析 |
| 62 | 尤斯伯恩我的第一图书馆 | book | 尤斯伯恩我的第一图书馆（resource-bwu7h0） | — | — | 状态记录 |
| 63 | WPlay词汇妙趣国 | book | WPlay词汇妙趣国（resource-1qj90tg） | 香蕉妈妈、庆爸 | 1 | 复用公共目录，按级别／选版解析 |
| 64 | Busy Wheels | book | Busy Wheels（resource-vfnkkz） | — | — | 状态记录 |
| 65 | I’m the Driver | book | I’m the Driver（resource-1k2yyp5） | — | — | 状态记录 |
| 66 | Miles Kelly交通工具 | book | Miles Kelly交通工具（resource-iaa99t） | — | — | 状态记录 |
| 67 | Helper职业探索 | book | Helper职业探索（resource-jxjboc） | — | — | 状态记录 |
| 68 | 美国国家地理英语分级读物 | reader | 国家地理（resource-5iilo9） | 香蕉妈妈 | 1 | 复用公共目录，按级别／选版解析 |
| 69 | Jump百科分级 | reader | Jump百科分级（resource-1qi1xdy） | — | — | 状态记录 |
| 70 | 词汇妙趣国 | animation | 词汇妙趣国（resource-vp23xs） | — | — | 状态记录 |
| 71 | 动物王国大冒险 | animation | 动物王国大冒险（resource-16a6i0i） | 许密杉 | — | 复用身份，范围待核或需候选 |
| 72 | 挖掘机麦克斯 | animation | 挖掘机麦克斯（resource-1cmttwx） | — | — | 状态记录 |
| 73 | 汽车小英雄 | animation | 汽车小英雄（resource-1tyurre） | — | — | 状态记录 |
| 74 | 蝙蝠和朋友们 | animation | 蝙蝠和朋友们（resource-smispi） | 许密杉 | 1 | 复用公共目录，按级别／选版解析 |
| 75 | 蓝色小考拉 | animation | 蓝色小考拉（resource-1gsfuor） | 许密杉、庆爸 | — | 复用身份，范围待核或需候选 |
| 76 | 小鼠波波 | animation | 小鼠波波（resource-1danc8u） | 许密杉、庆爸 | — | 复用身份，范围待核或需候选 |
| 77 | 小猪小象 | book | 小猪小象（resource-e87t8v） | 庆爸 | 1 | 复用公共目录，按级别／选版解析 |
| 78 | 皮特毛（原表名称待核） | book | 皮特毛（原表名称待核）（resource-t0ykga） | — | — | 状态记录 |
| 79 | 小毛人 | book | 小毛人（resource-1hwgnzy） | 庆爸 | 1 | 复用公共目录，按级别／选版解析 |
| 80 | 尤斯伯恩Peep Inside | book | 尤斯伯恩Peep Inside（resource-4tmk19） | — | — | 状态记录 |
| 81 | 尤斯伯恩Very First Q&A | book | 尤斯伯恩Very First Q&A（resource-vu7i3r） | — | — | 状态记录 |
| 82 | Play Town | book | Play Town（resource-15s29p0） | — | — | 状态记录 |
| 83 | 国家地理低幼纸板书 | book | 国家地理低幼纸板书（resource-xw3imu） | — | — | 状态记录 |
| 84 | 国家地理Little Kids | book | 国家地理Little Kids（resource-195gxzq） | — | — | 状态记录 |
| 85 | DK See How They Grow | book | DK See How They Grow（resource-labj9x） | — | — | 状态记录 |
| 86 | Little Fox恐龙朋友们 | animation | Little Fox恐龙朋友们（resource-1sc18b9） | — | — | 状态记录 |
| 87 | 汽车学校 | animation | 汽车学校（resource-yn3vfj） | — | — | 状态记录 |
| 88 | 道奇 | animation | 道奇（resource-f7cp5r） | 许密杉、庆爸 | — | 复用身份，范围待核或需候选 |
| 89 | 小猪佩奇 | animation | 小猪佩奇（resource-1md8os8） | 庆爸 | — | 复用身份，范围待核或需候选 |
