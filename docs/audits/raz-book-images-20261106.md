# RAZ AA / A 单册书图核对（2026-11-06）

本次保持用户表格的203个稳定书目ID、原题名与级别范围，不把当前官网目录当作旧选本全集，也不复制整本PDF。

| 范围 | 原表书目 | PDF首页封面 | 官网逐册资源卡图 | 图片待核 |
|---|---:|---:|---:|---:|
| RAZ AA | 103 | 88 | 9 | 6 |
| RAZ A | 100 | 0 | 98 | 2 |

官方资源卡图确属对应单册，但并非纸质封面原图；`coverSource.kind`区分两类。官网原图直取受到403/CORS限制，故通过实际已加载的官网页面截图裁切保留该册图片。五页目录共199条，分页48/48/48/48/7；所用图片逐项确认已加载，`naturalWidth=250`。官网链接与图片原URL均保留在manifest中。

## 题名差异

用户原表`Birds Goes Home`与官网`Bird Goes Home`（bookId=13）对应：保留原表题名为别名，显示题名可按官方校正；不改变稳定ID。其余匹配仅忽略大小写、空格及标点，没有以模糊题名自动合并。

## 未核实图片的8条

| 稳定ID | 原表题名 | 核查结论 |
|---|---|---|
| `book-guide-raz-aa-019` | Animals Nap | 官方当前目录未匹配。第三方原文索引保留题名Animals Nap、Level aa、作者Lana Temor；未取得可核实图片，不将Nap Time视为同书。 |
| `book-guide-raz-aa-060` | The Zoo | 当前普通分级目录未匹配；第三方原文索引确认为早期Level aa Benchmark Book，作者Cheryl Ryan。不能据此关联当前其他Zoo题名或图片。 |
| `book-guide-raz-aa-090` | Funny Cat | 官方定向检索无结果；第三方原文索引确认为早期Level aa Benchmark Book，作者Chuck Garofano、插画Nora Voutas；图片尚未核实。 |
| `book-guide-raz-aa-101` | happy birthday | 官方定向检索仅返回无具体书目匹配的通用技能表；当前目录无同名项。与The Birthday Party不能凭相同题材合并。 |
| `book-guide-raz-aa-102` | in the city | 官方定向检索未定位该准确题名；当前目录仅有The City、City Street等不同条目，不能直接归同书。 |
| `book-guide-raz-aa-103` | jobs | 官方定向检索无结果；当前目录未定位准确题名，保留原表元信息与主题，不借用职业类其他封面。 |
| `book-guide-raz-a-028` | Fruit | 官方定向检索主要为Fruit Colors；2012年第三方旧目录将Fruit与Fruit Colors分别列于Level A，故不合并、不共用封面。 |
| `book-guide-raz-a-053` | I Go | 官方定向检索仅返回非书目文字，当前aa–A目录无准确题名；不使用Going Places等相近内容封面。 |

未核实条目仍保留主题表内容与逐册入口，不借用套装图或相似书图。搜索未命中不代表该书不存在；其中两本旧Benchmark Book与普通分级目录的范围不同。

## 数据与验证

元信息入口：`english/data/raz-book-covers.json`。图片：`english/assets/book-covers/raz-*.webp`，共195张、4,247,904字节。所有图片已通过解码与SHA256核对，并逐张联系表视觉核查。各条记录保留checkedAt、来源、处理方式、像素与哈希；本地PDF仅记录相对文件名和SHA256，不提交本机绝对路径或原PDF。
