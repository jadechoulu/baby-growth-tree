# 全套系主题依据核对与册数修正（本地）

核对日期：2026-11-04。仅本地实现，未提交、未发布。

## 范围与结果

现有15套部分版本共423条分版本目录全部复查：内容简介225条、分类图190条、待核8条、书名兜底0条。内容依据不等于逐页阅读全文。其余151个书籍套系未取得逐册目录；47个非书籍素材不计入本数目录，不能声称全站书目已补齐。

|套系ID|目录条数|内容/分类已核|待核|
|---|---:|---:|---:|
|resource-1nuqi5t|192|190|2|
|resource-g7xvo5|44|41|3|
|resource-qckpg5|12|12|0|
|resource-o2t6vh|12|12|0|
|resource-960t1q|25|22|3|
|resource-var8qr|4|4|0|
|resource-e87t8v|25|25|0|
|resource-156rqb1|11|11|0|
|resource-cy521f|6|6|0|
|resource-nwgt6e|7|7|0|
|resource-152pfrt|24|24|0|
|resource-4meiec|33|33|0|
|resource-1vonnh3|6|6|0|
|resource-sfumgq|19|19|0|
|resource-afwa0g|3|3|0|

## 关键纠正与版本边界

- 培生旧3辑和基础词汇上下辑各96条，按各自表格和编号核对，不跨版套用主题。句型分组另存，不冒充内容主题。新版第81册GOME核为Come，原文件名与稳定ID保留。
- 大猫Pink1A/1B44条中41条有内容简介，Cars/I Can Help/I Can Do It保留待核。Yum为青蛙吃虫和计数；The Robot为身体。
- Pip的12条是经典故事10本及另外两个子系列各1本，不是固定全套12册；Scary Monster是戴面具吓朋友，不归幻想。
- 学乐6套92条按剧情核对；猫头鹰官网两处串书改用独立内容来源。龙和游戏冒险不因标题中的自然词就当科学知识。
- 小猪小象原25本与Like Reading分开；黑衣公主当前只收录前11本，官网已出第12本，不称11本现行全套；Mercy只原6册。
- FLR B级25册中22册已有内容简介依据，3册简介不足仍待核；Gingerbread Boy讲制作饼干，Growing Up讲幼年动物成长。
- 所有原有书目ID、版次、级别、阶段匹配限制、路线角色和个人记录键保留。

## 待核书目

- 词汇妙趣屋（NEW）· 3辑：The birthday
- 词汇妙趣屋（NEW）· 3辑：The trucks
- Scholastic Parent Pack · Level B：In My Pocket
- Scholastic Parent Pack · Level B：What Flies?
- Scholastic Parent Pack · Level B：Come Over
- Collins原版进口 · Pink 1A＋1B（44本套装）：Cars
- Collins原版进口 · Pink 1A＋1B（44本套装）：I Can Help
- Collins原版进口 · Pink 1A＋1B（44本套装）：I Can Do It

## 来源与界面

每条已核主题保留类型、sourceId、定位、内容摘要；单本ⓘ展示，分类原图可复用现有预览缩放。读者读法不作为作者路线门槛；找到不可读资料不伪称无资料而启用书名兜底。
来源永久链接与公开配图保留，已移除含评论和会话信息的临时正文摘录。封面优先对应单本，缺失继续套系图兜底。

## 验收

- 主题及数量模型14项回归通过；全量检查与构建见末尾最终检查记录。
- 列表／封面在320、375、390、768、900、901、1280px共14次检查，主体无横向溢出，前8张卡片内部不截断；封面每行2／2／2／5／6／4／6列。
- 最终紧凑目录弹层七档实际宽度检查通过，两侧遮罩至少12px，弹层无内部横向溢出；数据见final-modal-checks.json，截图count-modal-*.png。
- 单本主题依据、分类原图打开与缩放、关闭后焦点恢复已实际验证；最终FLR Gingerbread Boy详情确认显示食物主题、内容摘要与Goodreads来源。
- 路线与阶段筛选、44／86／96／194本数量、主题加载更多、布局保留、真实状态弹窗回退均通过浏览器核对。未改动个人记录作测试，也未声称真实移动设备同步已验收。
- 当前423条分版本目录415条有主题证据，8条待核；另151个书籍套系仍没有逐册目录，不将本批描述为全站目录已补齐。

最终检查：全量Node测试309项、页面构建测试3项通过；app.js与library-books.js语法检查、git diff --check通过。完整站点顺序重建成功，dist/site已更新。
