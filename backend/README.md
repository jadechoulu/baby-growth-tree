# Vercel 私人同步后端

最新选择已转为 Netlify，部署状态与下一步配置见 [Netlify 说明](netlify/README.md)。本文件保留 Vercel 适配的可复现记录，不代表当前使用的平台。

当前状态：本地适配与模拟测试通过；Vercel 注册停在手机号短信验证，CLI 尚未授权，未创建线上项目或私有 Blob，未部署或迁入宝宝记录。

## 数据边界

网页继续由 GitHub Pages 发布，宝宝档案、成长和英语记录继续放在 GitHub 私有仓库。Vercel Functions 执行既有 `worker/index.mjs` 的 GitHub OAuth、固定本人身份、记录验证及 SHA 并发控制；不向前端暴露 GitHub 仓库凭据。

私有 Vercel Blob 只保存十分钟 OAuth state、十二小时会话哈希及身份，不保存宝宝记录。state 用 ETag 条件更新原子标记已消费，拒绝并发回放；鉴权读取使用 `useCache: false`，退出删除会话立即生效。过期即时拒绝，每日 Cron 清理超过最大会话时长的旧文件。禁止使用公开 Blob、进程内 Map 或本机文件替代生产会话库。

前端无需改用专用令牌，也不需要家长在手机填写令牌。用于私有仓库的 fine-grained token 只在部署时配置到服务端。

## 构建与部署

从仓库根目录执行：

```sh
node scripts/build-sync-backend.mjs
npx --yes vercel@65.5.0 login
npx --yes vercel@65.5.0 link --cwd dist/sync-backend --project xiaoya-sync-api --yes
npx --yes vercel@65.5.0 blob create-store xiaoya-auth --cwd dist/sync-backend --access private --yes --environment production
```

仅将 `dist/sync-backend` 上传到 Vercel，不从完整工程根目录运行 deploy。该目录由显式白名单生成，不含网页、资料图片、备份、文档和环境文件。重建会清理目录，之后重新 link 同一个项目即可；不要把部署配置或密钥放进公开网站包。

先用已连接私有 Blob 的项目取得固定生产域名，配置 `WORKER_URL` 后再用于真实登录；`WORKER_URL` 保留旧配置键名，内容改为 Vercel HTTPS 来源。

| 环境变量 | 配置 |
| --- | --- |
| `FRONTEND_URL` | `https://jadechoulu.github.io/baby-growth-tree/` |
| `WORKER_URL` | 实际固定 Vercel HTTPS 来源 |
| `GITHUB_ALLOWED_USER_ID` | `266516354` |
| `GITHUB_DATA_REPO` | `jadechoulu/baby-growth-records` |
| `GITHUB_DATA_BRANCH` | `main` |
| `GITHUB_DATA_PATH` | `records/xiaoya.json`，兼容旧接口 |
| `DEV_FRONTEND_ORIGINS` | `["http://127.0.0.1:5317","http://127.0.0.1:5318"]` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App；回调为实际固定来源加 `/auth/callback`，仅申请 `read:user` |
| `GITHUB_DATA_TOKEN` | 单独 fine-grained token，仅私有数据仓 Contents read/write；不能复用 gh 全局令牌 |
| `BLOB_STORE_ID` / `VERCEL_OIDC_TOKEN` 或 `BLOB_READ_WRITE_TOKEN` | 连接私有 Blob 后的平台身份或专用凭据；不导出到网页 |
| `CRON_SECRET` | 随机任务凭据，只在部署环境保存 |

秘密用 `vercel env add <变量名> production --sensitive --cwd dist/sync-backend` 在终端交互输入，不写命令参数、聊天、源码、备份或日志。非秘密配置也在该项目配置，勿复制全局环境凭据。所有配置完成后部署：

```sh
npx --yes vercel@65.5.0 deploy --prod --cwd dist/sync-backend --yes
```

`/api/health` 仅返回平台名称与配置是否齐全，不验证真实账号可用性，也不证明同步已上线。应继续验收实际 OAuth、私有 Blob 条件消费与注销、GitHub 读写，以及从原入口预览迁入和另一来源恢复。真实 API 来源最后写入本地 `cloud-config.json` 与仓库变量 `XIAOYA_API_BASE`；网页仍等用户明确要求提交合并后由 main 发布。

## 验证

```sh
node --test tests/vercel-backend.test.mjs tests/worker.test.mjs tests/sync-engine.test.mjs
node scripts/build-sync-backend.mjs
```

测试覆盖原子 state 消费、过期与撤销、完整模拟 OAuth 和记录读写、真实 Node HTTP 适配及部署白名单。Vercel 账号、网络和线上 SDK 行为必须另外实测，不能以模拟测试代替。
