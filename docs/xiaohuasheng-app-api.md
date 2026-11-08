# 小花生App API独立读取与复用

更新日期：2026-11-08。本页依据本机已保存的最终验收、协议说明、100册详情核验及`final-evaluation-v2.json`落档，本次只核对证据和维护文档，没有重新联网读取本人书架或导入个人进度。

## 当前默认方案

本机已授权macOS钥匙串可用时，书架、搜索、套装完整目录和单册详情优先复用已验证的App API动态签名CLI。移动匿名JSON、桌面HTTP继续作为无会话／公开采集的候选和兼容路径，见[公开书目采集](xiaohuasheng-catalog-http.md)；旧证据保留，不表示旧接口失效。未具备本机授权时，不反复尝试提取凭据；按当前任务采用公开资料或已有完整快照。

Mac已在USB与网络配对设备均0、临时18883／18884服务关闭、临时CA私钥移除后，独立续取本人API token并直连读取成功。以后无需连接手机、启用代理、安装证书或手动滑动收集分页。未检测到手机不证明手机Wi-Fi代理／诊断描述文件已恢复，二者不能互相替代验收。

该方案是本机维护能力：CLI与凭据不进入公开站点、GitHub Actions或浏览器。网站本机“同步进度”现由受控同源接口接入此CLI；正式站与手机只回读已有私人英语云端记录并显示抓取时间，不把云端回读描述成跨站实时刷新。完整边界见[已读同步方案](xiaohuasheng-read-sync.md#2026-11-08同步按钮功能接入)。

## 接口、编码与签名

| 用途 | 已验证的官方接口 |
| --- | --- |
| 本人全书架 | `GET https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/{本人account}/-2/-1/-1/{offset}/30` |
| 搜索 | `POST https://app.xiaohuasheng.cn//other/searchBook5` |
| 套装目录 | `GET https://app.xiaohuasheng.cn//book/getBooksInTaoxi/{套装数字ID}/{offset}/{limit}` |
| 单册详情 | `GET https://app.xiaohuasheng.cn//book/getBookInfo5/{数字ID}` |
| 本人API token续取 | `GET http://www.xiaohuasheng.cn:83/UserService.svc/getToken/{本人}/{timestamp}/{md5}` |

网络URL保留路径前导双斜线，签名输入使用单斜线路径。使用`urlsplit(完整绝对URL).path`取得路径后按CLI规则规范化；不能直接拆`//bookroom/...`，否则会把bookroom当主机。响应必须同时HTTP200且`M="1001"`；`J`按Base64→gzip→UTF-8 JSON读取。HTTP200、成功解压或文件生成均不能单独证明业务成功／完整。

```text
GET  = MD5(userId + timestamp + 单斜线路径 + 本人token + 共享参数)
POST = MD5(userId + timestamp + J解压后的原始UTF-8 JSON字符串 + 本人token + 共享参数)
```

共享参数及认证值仅从钥匙串读取，本文不保存值。POST签原始内层JSON文本，空格和键顺序须与实际发送一致；路径、offset、关键词、详情ID或时间戳变化后重新签名，不是静态重放。已保存的36／36本人真实GET／POST样本匹配，新关键词“牛津树”、搜索offset20、未捕获目录路径和新页长也已在线成功。

搜索内层已验证字段为`language/search/offset/sort/isTaoxi/limit`；`isTaoxi=1`限定套装，`isTaoxi=-1`不是同一筛选。固定官方HTTPS数据域名，只读接口与本人身份，沿现有CLI禁用环境代理和重定向，不新增写操作。

token引导是已实测的官方旧HTTP:83协议，无TLS保护；数据接口使用HTTPS。本人API token续取已实现，重新登录／重建原登录凭据未实现，不能承诺凭据永久有效。凭据失效、撤销或协议变化时须重新取得授权或修订脚本，不改为在公开站点暴露认证值。

## 本机CLI入口

本机工具根目录：`/Users/zhoulu/Documents/生活/育儿/codex/xiaohuasheng-apk-investigation-20261108`。执行器固定使用其`tools/mitmproxy-venv/bin/python`（含keyring），不替换为另一个pymobiledevice3环境。

在该目录运行；以下`新的独立历史目录`须每次另取不存在的新路径，示例不是批量自动执行指令：

```sh
tools/mitmproxy-venv/bin/python xhs_request_signing.py --refresh-token
tools/mitmproxy-venv/bin/python xhs_standalone_bookcase.py --bookcase-pages --out private/新的书架历史目录
tools/mitmproxy-venv/bin/python xhs_catalog_client.py search raz --is-taoxi 1 --limit 100 --max-pages 100 --out private/新的搜索历史目录
tools/mitmproxy-venv/bin/python xhs_catalog_client.py collection 3748697 --page-size 100 --with-details --concurrency 3 --out private/新的目录历史目录
tools/mitmproxy-venv/bin/python xhs_catalog_client.py detail 694453 --out private/新的详情历史目录
```

`3748697`是已验证的RAZ aa套装数字ID（公开guid为`c734f72b105f11d0`），仅为具名示例，不从级别猜其他数字ID。每项任务只执行所需命令，token续取为显式步骤，失败不无限重试。不完整结果退出非零；不能仅按退出前已写文件数认完整。

钥匙串service为`local.codex.xiaohuasheng.bookcase`、`local.codex.xiaohuasheng.catalog`、`local.codex.xiaohuasheng.auth`，记录名称包括“本人App会话”“授权目录查询样本”“本人签名已验证参数”“本人令牌接口成功响应”。名称用于定位现有授权，不代表其他机器已有相同凭据；不得导出或回显记录内容。完整记录名与协议留在本机复用说明，公开仓库不复制钥匙串或认证样本。

## 分页、身份与保存

- 书架offset从0按实际协议页长连续推进，合法短末页终止；检查每页HTTP／业务码、全部字段、数字`bookId`与`guid`唯一性。目录同时核对套装声明册数、唯一数字ID／guid和全部页；搜索到合法空页才认定该关键词与筛选的返回范围完整。达到页数上限、重复页、重复身份、缺页或请求失败均为不完整，不能当空页。
- 每次先保存原始JSON、CSV、时间、请求范围、分页数量和失败证据，再生成派生已读列表和差异；不覆盖上一份完整快照。分页漂移、服务端数量变化须保留异常，不能为凑旧计数重抓或改写原值。
- 本人书架JSON保留当前全部16原字段及以后新增字段；CSV只是当前字段索引，JSON为完整依据。字段为`bookId/guid/pk/syncFlag/name/bookNameFromServer/frontCover/frontCoverWidth/frontCoverHeight/myStar/readFlag/readedFlag/readCount/isTaoxi/bookCount/notBorrowFlag`。
- 旧网页`bookId`逐字对应App`guid`，历史113／113已核对；App数字`bookId`另存，不能填进原网页身份字段。既有公共单册稳定ID、出版版本及个人进度键不改，不按书名或序号跨版硬绑。重复导入仍按公共单册去重。
- 已读依据全书架`readedFlag=1`，保留全部原字段。本批与`readCount>0`全量一致只是观察结果，不能改成永久规则；`readFlag`本批全0，不能用来判已读。`readCount`经已保存手机9本样本核对，可作为App书架“读过／2次／3次”徽标原值同步；它不代表已核实的逐条打卡日志，不生成阅读日期、时长或掌握程度。已读仍只看`readedFlag`。App“读过”筛选92本是另一参数范围，不替代全书架状态。
- 封面只保留原始路径／URL与来源，不下载或镜像；相对路径原值独立保留，展示补域须按对应已验证客户端规则，不凭空造URL。详情仍是书目信息，不是整书正文、逐页图片或整套电子书。
- 单册详情导出保留书目与公共聚合字段及逐册observed／preserved／omitted字段名清单，排除社区用户、孩子、评论、阅读动态字段。CLI详情原始导出可能含本人状态，进入公共书目库前仍须只选公共元信息；私有书架、认证、手机截图与原始私有响应不进入Git或`dist/site`。

## 最新证据与能力边界

以下是2026-11-08已保存验收样本，不是固定总数、未来成功保证或本次重新在线获取的结果：

| 范围 | 最终验收 |
| --- | --- |
| 全书架 | 19页取得555条，数字bookId／guid各555唯一，全部HTTP200／M1001；网络合计7.638秒 |
| 已读字段 | 最终128条`readedFlag=1`；较早127条快照与相同555个身份集合相比，仅一本readedFlag／readCount从0变1，原因和实际阅读日期未知；旧快照与差异保留 |
| `raz`套装搜索 | 31套，下一offset31合法空页；含Quiz／StoryBots，声明册数合计2648不是去重书数或出版社全集 |
| RAZ aa目录 | 声明100，完整100个双身份；手机与服务均不可用时，新页长37以0／37／74取得37／37／26 |
| 单册详情 | 100／100成功，目录与详情数字ID／guid对应；3并发31.867秒。断开手机及关闭服务后另验单册成功，未重复请求全部100份 |
| 字段覆盖 | 119顶层字段保留100项、排除19项；页数100／100、词数89／100；ISBN13、AR、Lexile本批为空，缺失不补造 |

本机证据根目录同上，维护时先读：

1. `private/mac-without-phone-final-20261108-051647/独立获取最终验收与交接_20261108_0521.md`。
2. `小花生独立读取协议与复用说明_20261108_0513.md`（127是早期快照，以最终128和差异为更新）。
3. `private/catalog-client-complete-verification-20261108-v1.md`。
4. `private/mac-without-phone-final-20261108-051647/final-evaluation-v2.json`（`allRequiredChecksPassed=true`）。初版汇总字段误读与固定127预期已更正，旧文件保留，不以重发请求掩盖差异。

这些证据只留本机，公开仓库保存方法与能力结论。此交接不授权导入、改写个人英语进度、创建定时任务或重新发布；发布沿当前会话的独立授权，私人同步仍遵守[已读与公共素材匹配方案](xiaohuasheng-read-sync.md)。
