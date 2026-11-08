# 素材统一与公共书目补充

核对日期：2026-11-09。本批为本地修改，尚未提交或发布。接续[后续阶段目录核对](remaining-stage-catalogs-20261108.md)。

## 统一素材

同系列只生成一个素材实体、统一名称及图鉴入口，所有路线引用该实体；版本、有限选集和级别在素材内部维护。14个已确认的重复入口归并到对应公共素材：丽声冒险故事岛、培生亲子故事屋、牛津树、海尼曼、学乐小读者、小猪和狐狸、培生儿童英语情境口语400句、Frog and Friends、淘气兔子杰克、大红狗及悠游阅读成长计划。其中丽声、学乐及悠游各有多个历史入口。

显式身份关系维护于`resource-volumes.json`的`catalogResourceId`；旧名称仅供搜索和原文核对。旧素材ID、单册ID、阶段数量、计时、手记记录及GK70原字母级签名均保留，新显示级别明确GK70标尺，不与LLI字母级混算。图鉴主题套系Tab也按统一素材归组。旧同范围数量回读不相加，新共用记录包括0优先；逐本完成和撤回共用原单册事实。

## 公共目录增量

公共逐册目录从3389增加至3804，本批新增415本，未删除旧单册ID；新增415本均有小花生公开书目身份和原始封面URL，全部公共单册ID和小花生外部身份无重复。本批公开采集没有刷新本人书架或改写私人进度；新外部身份供已有已读快照匹配使用。

| 本批补充 | 新增本数 |
| --- | ---: |
| Guided Science Readers：A–D各16、E&F共12 | 76 |
| Croc and Ally 4、Fairylight Friends 3、Layla and the Bots 4、Moby Shinobi and Toby Too 3、Olive & Beatrix 2、Monkey Me 4 | 20 |
| Fly Guy原编号1–19 | 19 |
| Henry and Mudge具名选集 | 20 |
| Missy’s Super Duper 4、Mighty Robot 9、Billy and Mini Monsters 15、Haggis and Tank 3、Princess Pink 4、Kung Pow Chicken 4 | 39 |
| Junie B Jones 28、Rabbit & Bear 6、Zack Files 29、Magic Tree House 1–28 | 91 |
| Last Firehawk 12、Stink 12、Judy Moody 16、Marvin Redpost 8、Pets Rule 5、Real Pigeons 5 | 58 |
| Notebook of Doom 13、Eerie Elementary 9、Lotus Lane 4、Wayside School 3、Andrew Lost 18、A to Z Mysteries 26、Captain Underpants 12、Harry Potter 7 | 92 |
| 合计 | 415 |

另为既有120本目录接通8套具名出版范围与逐本计划：Bumble and Bee 3、Maisy First Experiences Set 1共12、Press Start 19、Mercy Watson原主系列6、Owl Diaries 24、Princess in Black 1–11、Dragon Masters 33、Pip and Posy选集12。官网目录快照与有限选集不表示后续不再出版；Pip and Posy的12本为经典10本、认知1本、翻翻1本，不冒称同版12本盒装。

与既有全集数量不同的目录单独标明有限选集，如Henry and Mudge 20、Kung Pow Chicken 4、Zack Files 29、Magic Tree House 28、Stink 12、Judy Moody 16、Pets Rule 5、Real Pigeons 5、Eerie Elementary 9、Wayside School 3；不覆盖原主系列数量。`directoryMatch.bookIds`引用实际单册，`includedIn`避免有据包含的范围重复加总。新书主题未核正文时继续待核，不凭题名补造二级主题。

## 封面修复

培生启明星3级42本、4级31本共73本改为小花生单册原始URL，73条请求均为HTTP200且图片类型，保留原PIYO来源与单册ID；未下载或镜像图片。3级第7本原PIYO误写Super Shopping，依据同级逐册目录及实际封面纠正为Too Many Pets，并保留纠错依据，不把另一册题名当作自动已读别名。

## 仍有缺口

本批不代表所有素材已补全。红火箭、Jump、部分丽声及First Little Comics等仍缺对应版次的完整逐册目录；学乐高频词不能直接替代Sight Word Stories或First Little Readers。书虫、部分Highlights及牛津拼读简称的实际版本仍未核定，不因名字接近合并。海尼曼GK70使用原独立70本阅读计划，不因公共`resource-books.json`中无目录而视作缺少逐本功能。

## 验证

529项Node业务测试通过；身份测试覆盖归并后的唯一实体、旧来源阶段与执行节点记录键不变、旧数量回读、新记录撤回至0，以及历史入口和统一素材的逐本完成／撤回共用。3项页面检查与普通入口、离线单文件、统一站点构建通过。浏览器复核旧名搜索、统一素材详情、版本目录、逐本勾选入口及宽窄屏；不在用户真实记录中写入测试勾选。

## 庆爸阶段册数的剩余缺口

2026-11-09复核，先前“目录30本”不等于已补完阶段选材：外研大猫1级整级30本，而庆爸引用仅虚构部分；逐册虚构分类尚未核定。RAZ用户主题表AA103+A100=203为整理表收录，现有One One具名出版选本AA99+A97=196为另一版本，两者不能互替为庆爸虚构分母。公共数量参考现在显示明确范围，提示保留版本和缺口；没有改个人进度或伪造百分比。

Super Hammy现有两套各15本完整目录，但尚未补齐与庆爸A/B/C/D的逐册对应。此次官方单册正文已核《Here Comes Super Hammy》为Fountas and Pinnell A、《Super Hammy Saves Little Mouse》为C，记录在各单册`readingLevel`，不改既有套装身份和单册ID；其余字母不能由这两本推断。出版社集合两页能访问，后续单册批次出现HTTP429，未继续重试；本次不能宣称字母分组已齐全。公开单册依据：

- https://dc-canada.ca/products/super-hammy-my-first-reading-series-here-comes-super-hammy
- https://dc-canada.ca/products/super-hammy-saves-little-mouse

古力小超人已核彩虹兔12本，但庆爸原表的1／2与该套的对应尚未确认，不能把12平均分给两个级别。以上是真实资料缺口，不是私人已读同步失败，也不因更换提示词而变成已完成。公共`quantityReference()`供两路线共用；已核对应目录的启明星、Buddy、培生妙趣屋、小书虫、QPlay、巴塔木仍沿用原准确分母和逐册进度。

## 本轮全量复查修订

2026-11-09后续核查已确认：庆爸原图把古力小超人与古力与朋友们并列，WPlay单独列在常规2。原表1／2现分别指向两套各12本完整公共目录；古力与朋友们新增12册，原记录键和古力小超人已有12册身份不变。小彼恩官方依据：https://www.xiaobien.com/product/detail/diandubao-17592 。上文“古力1／2尚未对应”是本轮之前的状态，现已替代。

RAZ AA／A以完整100册具名集合核对既有主题表同级完整题名，复用原单册ID，不以主题表103条冒充AA100册。后续级别按相同公开guid补分类。已核1303册小花生公开虚构字段，其中RAZ的AA、A、B、C、D、E、F、G、H、I、J、K、M共13个具名级别可生成完整虚构选本；L尚有1册缺分类，大猫1–4等也有缺字段，未猜补分母。小花生分类保留来源，不冒称出版社官方分类或庆爸逐册指定版次。

同版任意完整分项组合、唯一有效目录默认、具名选集成员过滤在公共层修复；图鉴选用范围保留完整成员映射，逐本弹窗的册数随当前书单范围变化。全量覆盖和剩余逐项缺口见[全量核查](material-progress-20261109.md)，公开分类证据见[分类核对JSON](book-genre-evidence-20261109.json)。上述为公共资料维护，未刷新本人书架、未改写私人进度；仍为本地修改。

本轮最终验收：539项Node测试、3项页面检查通过，英语普通入口／离线单文件及统一站点构建成功，全量完整映射检查0项错误。390px手机与恢复后的宽屏已复核RAZ AA的18本虚构书单、已读勾选状态、父子分母60＝18＋42，以及古力两套各12本；本次没有操作真实单册勾选。截图仅保存在本机默认产物目录，不进入公开站点或公共测试夹具。
