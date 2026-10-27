# GitHub Pages 发布

当前公开网页仓库是 `jadechoulu/baby-growth-tree`，默认分支为 `codex/pages`，已有 Pages 地址为 <https://jadechoulu.github.io/baby-growth-tree/>。该地址仍是此前版本，本目录提供本次云端版本的发布流程；代码准备完成不代表 Worker、OAuth 或私有记录仓库已经配置或部署。

## 公开内容与个人记录

GitHub Pages 提供公开的工具外壳，访问者能读取 HTML、脚本、样式、技能目录和原始图谱 PDF。GitHub 登录保护的是 Worker 后面的私有记录 API，不能让 Pages 静态资源变为私有。

真实生日、宝宝资料、完成／回退状态、日期及手记以登录后允许身份所对应的 **GitHub 私有仓库**为主存储。前端不内置真实宝宝资料或服务端凭据。当前本人账号为 `jadechoulu`，稳定数字 ID 为 `266516354`；将其显式配置为允许身份，不能仅要求任意 GitHub 用户登录。Cloudflare 是运行小型后端的平台；此处的 Worker 负责登录校验和私有仓库读写，GitHub Pages 负责显示网页。具体 OAuth、Worker 变量和秘密配置请按 [Worker 部署说明](../worker/README.md) 完成。

上线迁移前先从当前页面导出 JSON 备份，并保留原文件。首次在本人登录且读取云端成功后明确选择迁入现有 IndexedDB／旧 localStorage／JSON 记录，预览核对后再确认。旧数据不会自动覆盖云端，也不会在迁入后被删除；换来源时需使用 JSON。少量界面偏好仍本地保存。

云端保存确认后才显示已同步；手记防抖约 1 秒，网络等待期间的新编辑继续保留。版本冲突按字段合并，同一字段冲突需本人选择；保存失败保留本页内容，可重试或导出包括未同步修改的记录。关闭或刷新前应完成同步或导出。

## 本地生成发布包

在项目根目录运行：

```sh
node --test tests/*.test.mjs
node scripts/build-pages.mjs
```

发布目录固定为 `dist/pages`。脚本仅复制显式列出的运行文件，重新构建会清除该目录中的旧文件。不会复制整个工作区或整个 `assets` 目录；个人 JSON 备份、记录截图、`MEMORY.md`、`tmp`、`english`、测试、Worker 及服务端配置均不在发布清单中。

根目录 `cloud-config.json` 默认可保持：

```json
{ "apiBase": "" }
```

空地址允许生成公开预览包，但该包无法登录或保存云端记录。配置真实后端后，可通过唯一公开构建变量写入 API 地址：

```sh
XIAOYA_API_BASE='https://your-worker.example.workers.dev' node scripts/build-pages.mjs
```

这里必须是公开 HTTPS API 来源，不带路径、用户名、密码、查询参数或片段。构建只生成 `apiBase` 字段，不复制其他配置或环境变量。Token、OAuth client secret、会话密钥只能写入服务端秘密配置。

本机联调若使用 HTTP，可显式执行 `XIAOYA_API_BASE='http://localhost:8787' node scripts/build-pages.mjs --allow-local-api`；此产物仅供本地使用，不能发布为正式页面。

## 手动发布

当前 Pages 仍是 **legacy：直接发布 `codex/pages` 的根目录**。只新增工作流文件不能关闭这条旧发布路径；若先推送，仍可能自动把分支根目录发布出去，绕过 `dist/pages` 白名单。

1. 先备份真实记录，审查待公开代码及 Git 跟踪文件，确认没有个人备份、截图或真实默认生日。白名单构建不能阻止敏感文件被提交到公开源码仓库。
2. **推送新版本前**，在仓库 **Settings → Pages → Build and deployment → Source** 从 **Deploy from a branch** 切换为 **GitHub Actions**，确认旧 legacy 分支发布路径已停用。
3. 完成 Worker、OAuth、允许访问身份和私有仓库配置，并验证登录及云端保存。没有 Cloudflare 账号时需先注册／登录，再按 Worker 说明配置。
4. 将已审查代码推送到 `codex/pages`；在仓库 **Settings → Secrets and variables → Actions → Variables** 添加 `XIAOYA_API_BASE`，值为公开 Worker API 来源。
5. 在 **Actions → 手动发布小芽网页 → Run workflow** 选择 `codex/pages`。工作流会先运行测试和构建，仅上传 `dist/pages`。
6. 打开发布结果，验证未登录和其他 GitHub 身份不能读取记录；本人确认迁入后，检查刷新、清除站点数据后重新登录恢复、完成／回退、手记、双设备冲突及失败导出。

工作流仅支持手动触发；未设置 `XIAOYA_API_BASE` 时停止发布，避免用没有登录能力的预览包覆盖正式页面。当前流程没有执行推送、创建账号资源或部署。
