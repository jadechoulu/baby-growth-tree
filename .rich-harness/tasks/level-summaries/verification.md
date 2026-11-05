# 级别册数汇总验收（2026-11-05）

本地分支 `codex/english/complete-level-summaries`，未提交、推送或发布。

## 完成范围

- 册数弹窗仅显示版本、级别／色带组合与册数，不再铺逐本封面、书名及已录入目录条数。组合从公共分项求和；逐本主题数据不删除。
- 大猫按用户最新要求沿用2019英版套装Pink44、Red44（红色仅有组合，不拆摊A／B），未采用现售Band Set数量；外研社目录级别补齐保留。不把不同出版快照合计当唯一故事数量。
- 牛津树6–9含DD各级27／25／18／18，基础64已经包含在88内，不重复加数。
- 补齐Buddy EF、培生启明星6–8、First Little Readers英文缺级、Guided Science与First Little Comics已有证据范围。
- 公共出版补证不新增默认分辑；全部458个阶段素材父键／子项键对比origin/main保持一致；原scope ID无删除、recordingEditions和recordingLevels无变更。新增回归测试保护大猫5–6与7–9级原子项键及记录。
- 册数入口有稳定ID，响应式重绘后关闭或Escape仍恢复入口焦点。

## 验证

- `node --test tests/*.test.mjs english/tests/model.test.cjs`：392项通过。
- `python3 tests/english-pages.test.py`：3项通过。
- `python3 english/build.py`：普通页与完整单文件构建成功。
- `node scripts/build-site.mjs`：完整站点包构建成功。
- `node --check english/app.js`、`node --check english/library-books.js`、`git diff --check`通过。
- 浏览器实际检查320／375／390／768／900／901／1280px。页面与浮窗无横向溢出，级别／数量／长版本名称无内部截断。
- 实际展开版本来源与未计入级别说明，核对大猫、牛津树、培生、Buddy汇总；许密杉500词筛选对应大猫30＋31＋25=86本，保留封面布局；关闭与Escape恢复`library-count-resource-g7xvo5`。
- 浏览验收不写入个人数量、时长、收藏或选版记录。

截图及测量：[验收目录](/Users/zhoulu/Documents/生活/育儿/codex/验收/2026-11-05-级别册数汇总)。

## 已查未定边界

本轮不声称全部出版物或全部原文子集已核齐。大猫官网Sapphire16和Pearl18同页数量冲突；外研后续级别现有目录快照不足。学乐外研282逐级分配、小书虫组合逐级、RAZ虚构子集、海尼曼分辑、悠游中间级等仍需更明确版本目录；保留说明，不按名称、数字或均分猜数。

具体来源与边界见`docs/audits/bigcat-levels-20261105.md`、`oxford-levels-20261105.md`和`series-level-coverage-20261105.md`。研究提案仅作证据留存，运行时统一读取`english/data/resource-volumes.json`。

## 用户选版更正

2026-11-05：撤下现售英版17个scope及对应运行来源／冲突说明，沿用旧Pink44，并由同一已核2019来源补Red44组合。两者使用公共displayEdition归组；没有书名或ID视图特判。公共目录当前已知范围合计409（旧英版88＋外研目录321），不是唯一故事总数。原选版ID／记录键保持，未更新个人记录。
