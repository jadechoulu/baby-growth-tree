# 私有云记录 Worker

此目录实现全站私人记录同步核心，前端先保存本机，再通过服务同步 GitHub 私有仓库。当前生产由 Netlify 适配运行，私有仓 `jadechoulu/baby-growth-records` 已接收本人确认的 155 项成长记录和 70 听力词汇；实际部署和网页发布状态见 [同步说明](../docs/sync.md)。公开源码仍只维护一个仓库。本目录的 Cloudflare Worker 与 SQLite Durable Object 部署适配保留兼容，尚未部署；下面的 Cloudflare 命令不是当前生产的必要步骤。后端只负责登录和私有仓库中转，不作为宝宝记录主库。

## 需要的资源

1. 保留公开的网页仓库，另建一个 **私有仓库** 存放个人 JSON。先建立 `main` 等目标分支，记录文件可以不存在。Worker 每次读写前确认仓库为私有，配置成公开仓库会拒绝操作。
2. 注册 GitHub OAuth App：Homepage URL 为 Pages 页面；Authorization callback URL 为 `https://实际Worker域名/auth/callback`。只申请 `read:user`；不会要求 OAuth 授权读写仓库。
3. 创建单独的 fine-grained GitHub token，只选择私有记录仓库，授予 **Contents: Read and write**，其余权限保持最小。不要给 token 选择公开网页仓库。
4. 登录 Cloudflare 并通过 Wrangler 创建 Worker。按当前服务方案核对免费额度，无需为实现本身默认升级付费。

## 配置与部署

从本项目根目录执行 Wrangler（建议先固定一个经过审核的 Wrangler 版本再安装或运行）。所有秘密在终端交互中输入，禁止提交 `.dev.vars`、token 或 client secret。

```sh
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_ID --config worker/wrangler.toml
npx wrangler secret put GITHUB_CLIENT_SECRET --config worker/wrangler.toml
npx wrangler secret put GITHUB_DATA_TOKEN --config worker/wrangler.toml
```

修改 `worker/wrangler.toml` 的非秘密配置：

| 配置键 | 内容 |
| --- | --- |
| `FRONTEND_URL` | Pages 的完整固定地址，可带项目路径；必须 HTTPS |
| `WORKER_URL` | Worker 固定 HTTPS 来源，不带路径或查询参数 |
| `GITHUB_ALLOWED_USER_ID` | 本人账号的稳定数字 ID，可用 `gh api user --jq .id` 查询；不按可改名的用户名授权 |
| `GITHUB_DATA_REPO` | 私有仓库 `owner/name` |
| `GITHUB_DATA_BRANCH` | 已存在的目标分支 |
| `GITHUB_DATA_PATH` | 固定记录文件路径，如 `records/xiaoya.json` |
| `DEV_FRONTEND_ORIGINS` | 可选 JSON 数组，明确允许的本机来源；同时用于 API 和 OAuth 完成通知，禁止通配符 |

```sh
npx wrangler deploy --config worker/wrangler.toml
```

此操作会创建 Worker 和 SQLite Durable Object，实际执行前应确认上述账号资源和配置。首次部署得到实际域名后，核对 `WORKER_URL` 与 OAuth App 的回调地址完全一致，必要时更新再部署。前端另行配置 Worker URL。未配置完毕的服务返回 `NOT_CONFIGURED`，不会使用默认资料自动写入仓库。

## 登录和 API

前端先用 `crypto.randomUUID()` 或 32 字节随机数生成 `request`（32–128 个字母、数字、下划线或连字符），顶层弹窗打开 `/auth/login?request=...&origin=...`。来源必须属于配置白名单，再与十分钟一次性 OAuth state、`HttpOnly; Secure; SameSite=Lax` cookie、固定 OAuth client/callback 绑定，由 Durable Object 原子消费。只允许配置的数字身份登录。

回调页向 `FRONTEND_URL` 的固定来源发送：

```js
{ type: 'xiaoya-auth', request, token }
// 已消费但失败的流程：
{ type: 'xiaoya-auth', request, error: 'IDENTITY_NOT_ALLOWED' }
```

前端检查消息 `event.origin` 为配置的 Worker 来源、`event.source` 为所开的登录弹窗，并核对随机 `request`。令牌只在内存或 `sessionStorage` 保存，不进入 URL。打开方式保留 `window.opener`。回调只向 state 绑定的受信来源发送结果，包含明确配置的本机开发来源；不会接受任意回跳地址。

会话有效 12 小时，服务端只保存令牌的 SHA-256；关闭标签页可清除前端会话令牌，注销会撤销服务端会话。OAuth access token 仅短暂用于服务端识别身份，不向前端返回。API 不使用 cookie 鉴权，所有请求同时需要受信 `Origin` 与 `Authorization: Bearer ...`。响应禁止缓存，CORS 只开放固定前端来源。

| API | 响应 |
| --- | --- |
| `GET /api/session` | `{user:{id,login}}` |
| `POST /api/logout` | `{ok:true,revoked:true}` |
| `GET /api/data/{profile,growth,english}` | 对应固定文件的 `{snapshot,revision,savedAt}`；文件不存在三个字段均为 `null` |
| `PUT /api/data/{profile,growth,english}` | 写入 `{snapshot,revision}`；按分类 schema 校验并确认 GitHub 新 SHA |
| `GET /api/records` | `{snapshot,revision,savedAt}`；不存在的文件返回三个 `null`，绝不自动初始化 |
| `PUT /api/records` | 请求 `{snapshot:{version:1,profile,records},revision}`；成功返回同上 envelope |

`revision` 为上次 GitHub 文件 SHA，创建新文件用 `null`。文件更新使用 GitHub 乐观并发控制；409/422 会重新读取并返回 HTTP 409 `{code:'VERSION_CONFLICT',snapshot,revision,savedAt}`。前端需基于上次成功版本合并不同字段，冲突时保留双方内容并让本人选择，不得拿最新 SHA 无条件重写。只有 GitHub 返回新 SHA 后才可以显示“已同步”。手记应在前端适当合并保存，避免每个字符一次提交。请求上限 1 MiB，复用现有备份 schema 与技能目录 ID 校验；未知字段不会写入个人记录。

资料迁移必须在本人登录、读取云端成功后由前端明确发起。若云端非空，不得静默用 IndexedDB 或空默认资料覆盖。JSON 导入导出继续用于备份。GitHub 会保留文件提交历史，删除当前 JSON 不等于删除历史中的个人资料。

公开 Pages 资源只提供工具外壳，OAuth API 登录并不会让 Pages 静态文件变成私有。部署范围应排除个人备份、记录截图、MEMORY.md、tmp、本目录与本地凭据。隐私资料仅保存在私有 JSON，后端错误不回显 GitHub 原始响应或凭据。

## 验证

```sh
node --test tests/worker.test.mjs
```

测试使用内存 SQL 适配器和模拟 GitHub 网络，不连接实际账号，不创建仓库或部署服务。生产上线后还需验收实际 OAuth 弹窗、清除站点数据后重新登录恢复、双设备冲突与 GitHub 仓库权限。配置好的 Worker 返回错误时，前端必须保留未同步的本地修改。
