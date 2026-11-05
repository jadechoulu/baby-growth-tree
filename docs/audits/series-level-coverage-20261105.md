# 套系逐级数量覆盖审计（2026-11-05）

本审计负责大猫、牛津树以外的套系；数量弹窗展示版本与级别汇总，不要求逐本目录。补证现已集成至 [公共数量目录](../../english/data/resource-volumes.json)，仅本地，未提交或发布；路线原文不改。研究提案保存在 `.rich-harness/tasks/level-summaries/`。

## 审计口径

以现有模型中book／reader／flashcard条目扫描，初扫171条（含交叉检查牛津树）；147条具有公共scope，14条具有逐本目录（补齐前快照）。逐本目录少不意味着缺出版级别。193个非空原文级别组合，101个不能整串命中公共scope；其中包含联合级、中文色名、复习／虚构限制、版次说明，不能把101一概称为缺级。

## 本轮已补齐范围

| 套系 | 新增公共级别与数量 | 处理边界 |
| --- | --- | --- |
| Buddy Readers | E&F16本 | 原来源已确认但漏建scope；不拆E/F |
| 培生启明星 | 6／7／8各18本 | 2025已出级别；不拿营销347册作当前总数 |
| First Little Readers | 英文A/B/C/D各25、E&F16、G&H16 | 给缺项资源补公共候选；外研A–J282独立，逐级未定 |
| Guided Science Readers | B/C/D各16、E&F12 | A16保留；16-page不是册数 |
| First Little Comics | A&B20、C&D20 | EF16保留；官方EF20文案冲突暂不写入 |

来源摘录、实际访问URL和核查日逐条写在JSON各scope.sources，均使用本次已读取原页或已保存现有官方证据。新增scope均referenceOnly，default:false，不自动改成作者指定版或必读量。

## 仍需进一步核实的实际范围

- 外研学乐小读者2025 A–J282：官方总量明确，但未取得逐级分配；不能平均282／10，亦不能套英文Parent Pack。
- First Little Comics EF：官方StoryPlus文案20与现有Single-Copy Set16不一致；没有足够ISBN证据证明为两种版本，暂保留16与冲突说明。
- 小书虫：已有1–6=48、1–14=108组合；未获得每级／虚构子集分配，不能均分。
- RAZ：纸书选本每级范围与路线虚构子集不相同，不能用整级分母代替虚构。
- 海尼曼：GK70版本明确；路线GK1–2、GK3／G1-1分辑与国内GK A43／B15／C12不构成自动等价。
- 悠游阅读：目前一级1–5和四级资料不足以填二三级及一级6–10；需逐辑出版清单。
- 快乐瓢虫、口语剧场、银河号：已有50／30／116整套数，但逐级或Part分配仍需出版来源。
- 其余纯说明字符串（如“Ready to Read版”“简单部分”“点读版”）不应机械生成为新出版级别。

## 全量扫描索引

“未整串命中”仅作待分型线索；组合可以由同版分项求和时不应重复建立人工总量。下表scope条数不是该套实际级数。

| 素材 | 稳定ID | 现有scope数 | 未整串命中的原文范围 |
| --- | --- | ---: | --- |
| 学乐小读者 | `resource-fkl6xf` | 2 | A&B；C&D；I&J |
| 学乐高频词 | `resource-h4sa2o` | 1 | — |
| First Little Readers | `resource-960t1q` | 0 | A&B；C&D |
| Sight Word Stories | `resource-z5w7e2` | 1 | — |
| Guided Science Readers | `resource-nqvpg2` | 1 | A&B；C&D；E&F |
| Buddy Reader | `resource-zl69cf` | 4 | E&F；E–F |
| First Little Comics | `resource-19jrpig` | 1 | A&B；C&D |
| 丽声妙想英文绘本2 | `resource-1mi9g2h` | 2 | 1&2；3&4；7-11 |
| 丽声英语百科 | `resource-5434e` | 11 | — |
| 小书虫 | `resource-10bn1i2` | 2 | 1&2；5&6；1；2；3；4（虚构）；5（虚构）；6（虚构）；7–10（虚构） |
| 悦读中国 | `resource-1mzat21` | 21 | — |
| 培生启明星 | `resource-1mx6gx6` | 8 | 6-8；6；7–8 |
| 培生儿童英语 | `resource-912oje` | 1 | — |
| Jump百科分级·蝌蚪 | `resource-1wlddvg` | 1 | — |
| Jump百科分级·牛蛙 | `resource-hlndqy` | 1 | SetA-H |
| Jump百科分级·袋鼠 | `resource-nymq45` | 1 | — |
| Jump百科分级·蓝鹰 | `resource-163rc2r` | 1 | — |
| 国家地理 | `resource-5iilo9` | 1 | — |
| RAZ | `resource-1qnd5uh` | 1 | AA–A（虚构部分）；B（虚构部分）；C–D（虚构部分）；E–F（虚构）；G–H（虚构）；I–J（虚构）；K–M（虚构） |
| 红火箭 | `resource-190oaw2` | 18 | 玫粉；大红；黄；绿；蓝 |
| 海尼曼 | `resource-9fvmjt` | 9 | GK1-2；GK3&G1-1；G1-2&G1-3；G1-2&G1-3&G2-1；G2-2&G2-3 |
| 悠游阅读 | `resource-7vimum` | 2 | 第一级6-10；第二级1-10；第三级1-5；第三级6-10 |
| 古力小超人 | `resource-1pinwiv` | 1 | 1；2 |
| QPlay奇问妙想国 | `resource-123ikqd` | 1 | — |
| WPlay词汇妙趣国 | `resource-1qj90tg` | 1 | — |
| My First Reading | `resource-1y3ytv6` | 4 | Collection 2 |
| 小犀牛 | `resource-1x8d7zy` | 1 | — |
| 猪和狐狸 | `resource-bbcmo0` | 1 | — |
| 培生亲子故事屋（爆笑英语） | `resource-1wpc6vb` | 2 | — |
| 儿童英语情境口语400句 | `resource-1vpccvb` | 2 | 上&下 |
| Unicorn And Yeti | `resource-nwgt6e` | 0 | — |
| Hello Hedgehog | `resource-1vonnh3` | 0 | — |
| 水先生 | `resource-197hwlb` | 1 | — |
| Bumble And Bee | `resource-afwa0g` | 0 | — |
| Maisy初体验 | `resource-qckpg5` | 0 | — |
| 牛津树初体验 | `resource-1f8szif` | 1 | — |
| 神奇校车桥梁版 | `resource-bpm5u8` | 1 | — |
| Croc and Ally 鳄鱼和艾丽 | `resource-1mymg35` | 1 | — |
| A Jack Book 淘气兔子杰克 | `resource-9d0yj6` | 1 | — |
| Fly Guy and Buzz 苍蝇小子 | `resource-1ukyalh` | 1 | — |
| 小火柴 | `resource-16o9su4` | 1 | — |
| Clifford Ultimate Red 大红狗克里弗 | `resource-1b758sx` | 1 | — |
| Moby Shinobi and Toby too! 忍者莫比与托比 | `resource-gb603o` | 1 | — |
| Fairlight Friends系列 | `resource-wqz9tv` | 1 | — |
| Henry and Mudge 亨利与马吉 | `resource-170tbmv` | 1 | Ready to Read版 |
| Flat Stanley 纸片人 | `resource-1dwbb86` | 1 | I can Read版 |
| Winnie and Wilbur 女巫温妮 | `resource-45qugp` | 1 | 绘本版 |
| Frog and Toad 青蛙与蟾蜍 | `resource-var8qr` | 1 | — |
| Dragon 胖龙蓝蓝 | `resource-1tlgrbe` | 1 | — |
| 冒险故事岛 | `resource-t0s324` | 10 | — |
| Olive & Beatrix 奥莉和贝特丽克斯 | `resource-1ef7fo1` | 1 | — |
| Press Start! 方块兔 | `resource-sfumgq` | 0 | — |
| Missy’s Super Duper 米西公主 | `resource-6rpiv2` | 1 | — |
| Journey to the West 西游记 | `resource-1af6ny6` | 1 | — |
| Rocket Girl 火箭女孩 | `resource-3qjvdw` | 1 | — |
| Rocket Girl’s Journey to the West 火箭女孩西游记 | `resource-hcpvnf` | 1 | — |
| Mighty Robot 威猛机器人 | `resource-1b0dlwg` | 1 | — |
| Billy and mini Monsters 比利和小怪兽 | `resource-7pnqm0` | 1 | — |
| Hot dog 腊肠狗系列 | `resource-13qqnf6` | 1 | — |
| Layla and the bots 莱拉和机器人 | `resource-d2yc4z` | 1 | — |
| Mercy Watson 小猪梅西 | `resource-cy521f` | 0 | — |
| Owl Diaries 猫头鹰日记 | `resource-152pfrt` | 0 | — |
| The Princess in Black 黑衣公主 | `resource-156rqb1` | 0 | — |
| Haggis and Tank 哈吉斯坦克 | `resource-ox5enn` | 1 | — |
| Princess Pink and the Land of Fake-Believe 粉红公主与虚无世界 | `resource-ny70rr` | 1 | — |
| Bad guys 坏蛋联盟 | `resource-17uzhaa` | 1 | — |
| Kung Pow Chicken 宫保鸡丁 | `resource-6ze03a` | 1 | — |
| Monkey Me 猴子男孩 | `resource-z8zhbt` | 1 | — |
| Junie B Jones 朱妮琼斯 | `resource-gzsymu` | 1 | — |
| Rabbit & Bear 胖熊和瘦兔 | `resource-o1ogk8` | 1 | — |
| Isadora moon 伊莎多拉穆恩系列 | `resource-1buy45u` | 1 | — |
| Desmond Cole Ghost Patrol 捉鬼小分队 | `resource-11j61f` | 1 | — |
| The Zack Files 扎克档案 | `resource-13sgknh` | 1 | — |
| Dragon Master 驯龙大师 | `resource-4meiec` | 0 | — |
| Magic Treehouse 神奇树屋漫画版 | `resource-1jxbmnm` | 1 | — |
| Magic Tree House 神奇树屋 | `resource-1mnq6y8` | 1 | — |
| The last firehawk 火鹰传奇 | `resource-1j8s6qm` | 1 | — |
| Stink 朱迪弟弟系列 | `resource-9ub1k4` | 1 | — |
| Judy Moody 稀奇古怪小朱迪 | `resource-1mu8hkl` | 1 | — |
| Marvin Redpost 麻烦精马文 | `resource-18dli54` | 1 | — |
| Pets rule! 萌宠当家 | `resource-12jlik8` | 1 | — |
| Real Pigeons 鸽子侦探 | `resource-19sq4gs` | 1 | — |
| The Notebook of Doom 毁灭日记 | `resource-agtp1r` | 1 | — |
| Eerie elementary 怪诞小学 | `resource-nxe263` | 1 | — |
| A to Z Mysteries 神秘事件 | `resource-1nhjndw` | 1 | — |
| Wayside School 歪歪路小学 | `resource-1whu8ta` | 1 | — |
| Lotus Lane 莲花巷女生日记 | `resource-1wst5jk` | 1 | — |
| My Weird School 疯狂学校 | `resource-1gq6hvt` | 1 | — |
| The Treehouse Collection 小屁孩树屋 | `resource-1k30p32` | 1 | — |
| Andrew Lost 安德鲁的微观世界 | `resource-1tu4qnm` | 1 | — |
| The magic school bus rides again 神奇校车大树系列 | `resource-1fcf1ox` | 1 | — |
| Merlin Mission 梅林任务 | `resource-1c42je5` | 1 | — |
| Geronimo Stilton 老鼠记者 | `resource-kacco9` | 1 | — |
| Football super stars 足球明星 | `resource-1rtjaam` | 1 | — |
| 时光学名词卡 | `resource-1xi6ik1` | 0 | — |
| 阿布巴布动词卡 | `resource-5d3abe` | 0 | — |
| 培生词汇妙趣屋 | `resource-1nuqi5t` | 11 | — |
| 学乐 | `resource-1cn6i3m` | 5 | D-E；F-I；D–E |
| 书虫 | `resource-149sp5j` | 7 | — |
| 海尼曼 GK70 | `resource-hojfp0` | 9 | — |
| Highlight 故事与科普配对 | `resource-jwq9vf` | 1 | 1；2；3-4 |
| 培生亲子故事屋 | `resource-141vfh7` | 2 | — |
| 培生（第六阶段未标明套系） | `resource-l64s2i` | 0 | 5-6 级别 |
| 名词卡 | `resource-19cnwh8` | 0 | — |
| 动词卡 | `resource-ehqeof` | 0 | — |
| 巴蒂英语 | `resource-1hv2ggo` | 2 | — |
| 悠游 | `resource-29ukn0` | 1 | — |
| 蛙小弟 | `resource-11wr0uz` | 1 | — |
| 皮特猫 | `resource-1hwirew` | 1 | My First |
| 牛津自拼 | `resource-1ghd02m` | 5 | — |
| 丽声高频词 | `resource-1hu7to9` | 2 | — |
| 莎林高频词 | `resource-gfdta7` | 1 | — |
| Evan-moor sight words | `resource-l141pg` | 1 | — |
| 蔬菜王国 | `resource-yy64zs` | 1 | — |
| 丽声自然拼读 | `resource-1raloog` | 1 | — |
| 大猫自然拼读 | `resource-1nnr59r` | 5 | — |
| 糊涂女佣 | `resource-oz0jbk` | 1 | — |
| 内裤超人 | `resource-ulmaqc` | 1 | — |
| 罗尔德达尔 | `resource-1r3pyyc` | 1 | — |
| 神奇校车 | `resource-13uj3q` | 1 | — |
| 哈里波特 | `resource-ngqkjv` | 1 | — |
| 新概念 | `resource-1sx9rf3` | 1 | — |
| Power up | `resource-1ew2482` | 1 | — |
| think | `resource-9v2gi2` | 1 | — |
| basic reading | `resource-kcbshs` | 1 | 400词；200词／400词；200词／400词（复习）；800词 |
| basic words | `resource-zqlmu5` | 1 | — |
| 名词闪卡 | `resource-kgt2tw` | 0 | — |
| TPR动词指令卡 | `resource-1nxtpna` | 0 | — |
| 大马泽单词本 | `resource-l95jou` | 0 | — |
| 大马泽台词本 | `resource-16z7681` | 0 | — |
| Highlight | `resource-11spny4` | 1 | — |
| 牛津自然拼读 | `resource-1hotvkv` | 1 | 第一册和第二册 |
| Booklife Junior | `resource-1clzu3i` | 2 | — |
| 小狐狸台词本 | `resource-ezbi3s` | 0 | — |
| 饼干狗 | `resource-a52ypl` | 1 | — |
| 巴塔木口语书 | `resource-ckc2k` | 0 | 24本 |
| Super Hammy | `resource-1yfs7b5` | 1 | A–B；C–D；E–F |
| 小猪小象 | `resource-e87t8v` | 0 | 简单部分；难的部分 |
| 口语剧场 | `resource-45fjcl` | 1 | Part 1；Part 2 |
| 培生400句 | `resource-166ekar` | 2 | — |
| Best Buddies | `resource-yl8irm` | 1 | 学乐橡子系列 |
| 波西与皮普 | `resource-o2t6vh` | 0 | — |
| 佩奇高频词绘本 | `resource-ie3zww` | 1 | — |
| 小猪和狐狸 | `resource-hlfpbh` | 1 | — |
| 快乐瓢虫 | `resource-106pkss` | 1 | L1；L2；L3；L4 |
| I can read | `resource-1qn098f` | 1 | 预备级（挑选）；基础级（挑选）；基础 |
| 银河号阅读全解码 | `resource-uux27w` | 1 | L1–3；L4–5；L6；L7–9 |
| 学乐橡子点读系列 | `resource-kjiouh` | 3 | 你好，小螃蟹｜你好，小刺猬｜独角兽与雪人 |
| 小毛人 | `resource-1hwgnzy` | 1 | My First |
| 丽声冒险岛 | `resource-mavhf5` | 10 | — |
| 淘气兔子 | `resource-zs4dhg` | 1 | 点读版 |
| 脏脏书 | `resource-127dfoe` | 1 | — |
| 汪培珽一段 | `resource-1g6rmtp` | 1 | Syd Hoff系列 |
| 佩奇绘本 | `resource-3z1ap6` | 1 | 红黄蓝盒 |
| Baby why | `resource-pc7ej8` | 1 | 生物化学 |
| Baby all | `resource-19dcja1` | 1 | 物理｜艺术 |
| 心智麦田轻科普绘本 | `resource-4oyfst` | 0 | 11本 |
| 大红狗 | `resource-1l68zks` | 1 | — |
| Frog and Friends | `resource-xqapbe` | 1 | — |
| 心智麦田 | `resource-1xt8nl` | 1 | — |
| 布鲁伊绘本 | `resource-13d4vi4` | 1 | 点读 |
| 培生 | `resource-1mopiiw` | 1 | — |
| 海狸 | `resource-1m8k2cj` | 1 | — |
| 美国Jump百科 | `resource-lkawg4` | 1 | — |
| 丽声中国文化英语分级阅读 | `resource-1u6no5j` | 1 | — |
| 悠游阅读成长计划 | `resource-hrutzm` | 1 | — |
| 托马斯和朋友 | `resource-a3pj5d` | 1 | — |
| 丽声冒险故事岛 | `resource-1daz61h` | 10 | — |
| 牛津阅读树丽声经典故事屋 | `resource-ffnro6` | 9 | — |
