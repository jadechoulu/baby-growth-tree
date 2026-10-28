# 小芽完整站点发布

只使用公开仓库 `jadechoulu/baby-growth-tree`：`main` 保存完整源码，`codex/pages` 保存构建后的网页。保留现有 Pages 地址与 `codex/pages:/` 发布方式；发布分支目录只是同仓库的另一个 checkout，不是另一个仓库或开发工程。

## 构建与验证

```sh
node --test tests/*.test.mjs english/tests/model.test.cjs
python3 tests/english-pages.test.py
node scripts/build-site.mjs
```

完整站点为 `dist/site`：`home.html` 是共同首页，根 `index.html` 保留成长树，`english/index.html` 是英语路线。两边顶部使用相对路径，可部署在 `/baby-growth-tree/` 等项目子路径。旧单文件在本地继续可用。

构建先生成成长白名单组件包和英语去个人资料组件包，再组装统一站点。只复制运行所需文件和已引用资料；不复制个人 JSON、备份、截图、MEMORY.md、tmp、output、Worker 秘密或源码仓 Git 历史。成长默认生日和公开英语档案为空。

## 一条命令更新网站

先在唯一源码工程修改并完成测试，再运行：

```sh
node scripts/publish-site.mjs --target ../baby-growth-tree --push
```

脚本只允许已配置到 `jadechoulu/baby-growth-tree` 的干净 `codex/pages` 发布副本。构建后移除 Git 已跟踪的过期发布文件，复制新产物、核对暂存差异、提交并推送；不覆盖未提交工作，不 force push。不带 `--push` 时停在本地发布提交，便于审阅。发布分支目录不手工开发，唯一源码在同仓库 `main` 分支。

GitHub Actions“构建小芽完整站点”可在 `main` 手动运行测试并下载完整产物。它不直接部署；使用上述命令发布到同仓库的 `codex/pages`，无需跨仓库 Token。公开源码只提交整理后的当前快照，原私有 Git 历史保存在本机备份。

## 本机记录与可选云端

两边记录互不合并。成长仍用 `xiaoya-growth` IndexedDB v1；英语仍用 `little-leaf-english-v1` localStorage。页面路径与网站来源保留，不清空或迁移数据库。协议、主机、端口不同仍会隔离浏览器记录；发布包不携带真实个人记录。

默认 `cloud-config.json` 保持 `{ "apiBase": "" }`，本机可直接保存，不需要登录。启用云端是独立能力，详见 [Worker 说明](../worker/README.md)。完整站点构建可通过公开变量设置 HTTPS API 来源：

```sh
XIAOYA_API_BASE='https://your-worker.example.workers.dev' node scripts/build-site.mjs
```

构建仅写出 `apiBase` 字段，不复制配置中的其他字段；Token、OAuth secret 和会话密钥只放服务端。API 地址本身不迁移本机记录，须由本人在界面确认后才可导入。
