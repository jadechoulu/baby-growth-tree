# 育儿记录与产物保存位置

- 用户指定的默认保存目录是 `/Users/zhoulu/Documents/生活/育儿/codex`。后续成长记录、英语启蒙记录、导出备份及相关截图、说明等新产物统一保存到该目录，不再默认保存到 Downloads。
- 保留历史备份；同名文件另存，不覆盖、合并或删除已有记录。
- 网页正在使用的浏览器数据库与 JSON 备份分开管理，不因整理目录清空浏览器记录。
- 项目源码仍在当前工作区维护；本地页面使用 `scripts/local-server.py` 提供备份写盘能力，服务用 `codex-dev` 管理。
- 按用户最新要求，只保留公开仓库 `jadechoulu/baby-growth-tree`。完整工程在 `main` 分支统一维护，生成网页放在同仓库的 `codex/pages` 分支供 GitHub Pages 发布；不再使用原私有源码仓和空记录仓。通过 `node scripts/build-site.mjs` 生成 `dist/site`，组件包 `dist/pages`、`dist/english-pages` 不单独部署到站点根。只公开工具源码和资料，不发布个人记录、真实默认档案、本机备份、密钥或原私有 Git 历史。保留根成长页面、`home.html`、`english/` 及 `output/web/` 单文件的相对导航，不改两应用存储名称或静默合并档案。
