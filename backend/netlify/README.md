# Netlify 私人同步接口

更新：2026-10-30。本人 CLI 授权已完成，免费团队 `lu-chou` 下已部署 `xiaoya-jadechoulu-sync`。GitHub 应用与最小私有仓凭据已配置，线上健康接口返回 `provider: netlify, ready: true`。本人已实际登录、预览确认并上传原 5317 的 155 项成长记录；GitHub API 独立核对保存结果通过。本批网页已获提交合并授权，按 main 工作流发布，以正式入口与 Actions 核对部署结果；真实跨设备验收仍待完成。

接口地址：<https://xiaoya-jadechoulu-sync.netlify.app>。网页继续由 GitHub Pages 发布，记录仍在私有仓 `jadechoulu/baby-growth-records`。Netlify Blobs 仅存短期登录状态，不保存宝宝记录。真实状态库已验证并发仅一次消费、重放拒绝和注销即时生效，测试状态已删除。

## 一次性 GitHub 配置

这些配置仅供服务端使用。手机和其他设备日常只点击 GitHub 登录，不录入仓库令牌。秘密直接填写到 Netlify 环境变量界面，不发送到聊天或写入源码。

以下为复现与后续换钥步骤，当前应用已创建（应用 ID `3974003`），Client ID 已代填，两个生产秘密已由本人通过本机临时黄色表单写入并重新部署；不需要重复创建应用或令牌。本机助手不进入源码与公开发布包，也不持久保存秘密。

1. 打开 [GitHub OAuth 应用创建页](https://github.com/settings/applications/new)，填写：

| 字段 | 值 |
| --- | --- |
| Application name | `小芽私人记录同步` |
| Homepage URL | `https://jadechoulu.github.io/baby-growth-tree/` |
| Authorization callback URL | `https://xiaoya-jadechoulu-sync.netlify.app/auth/callback` |

保持 Device Flow 关闭。创建后获取 Client ID，并生成一次 Client secret。

2. 打开 [Netlify 环境变量](https://app.netlify.com/projects/xiaoya-jadechoulu-sync/configuration/env)，添加 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`。设为 production 的 Functions 可用；敏感值使用秘密变量选项，不放在前端构建变量中。

3. 打开 [GitHub fine-grained token 创建页](https://github.com/settings/personal-access-tokens/new)，资源所有者选自己的账号；Repository access 选择 Only select repositories，仅选 `baby-growth-records`。Repository permissions 的 Contents 设置为 Read and write，Metadata 沿用必需的只读权限，其他保持无权限。设置名称及有效期后生成。

4. 将此 token 直接添加为 Netlify 的秘密环境变量 `GITHUB_DATA_TOKEN`，同样仅供 production 的 Functions 使用。不要选择公开源码仓，不复用 gh 的全局登录令牌。

5. 配置完成后重新部署后端，再验收真实 OAuth。健康接口的 `ready: true` 仅代表配置齐全，不代表 GitHub 凭据有效或记录同步完成。令牌过期后需更新服务端变量并重新部署，用户已有本机记录不受影响。

公开变量已配置：`FRONTEND_URL`、`WORKER_URL`、`GITHUB_ALLOWED_USER_ID`、`GITHUB_DATA_REPO`、`GITHUB_DATA_BRANCH`、`GITHUB_DATA_PATH`、`DEV_FRONTEND_ORIGINS` 和 Node 22 运行时。新项目的 Netlify SSO 入口拦截已关闭；数据接口继续由应用自己的 GitHub 本人鉴权保护。定时清理是平台调度函数，公网 URL 返回 403。

## 可复现构建与部署

```sh
node scripts/build-sync-backend.mjs --netlify
cd dist/sync-netlify
npm ci --ignore-scripts
npm exec --yes --package=node@22.22.0 --package=netlify-cli@27.15.0 -- netlify deploy --prod --no-build --site a7d29b5d-9a15-4577-b846-d4355bb309aa
```

只上传 `dist/sync-netlify`，其中仅含显式白名单的后端代码、锁定依赖与空介绍页；不上传完整工程、个人备份、资料图片或本地环境文件。输出重建会清理目录，通过固定 site ID 关联已有项目。项目使用 Free 方案，部署、函数请求等消耗免费额度，不启用付费升级。

登录状态库使用 `getStore({name: 'xiaoya-auth-v1', consistency: 'strong'})`，一次性 state 通过 ETag 条件更新消费，不能改成先读再删。每日平台任务只删除该库固定键格式的过期状态。Netlify 新部署共用站点级库，不能使用 deploy 级临时库。

## 完成标准

真实本人登录、私有 GitHub JSON 保存、原 5317 逐类预览迁入，以及原为空的 5318 恢复 155 项完成记录均已完成（页面恢复结果由本人确认）；仍须核对真实多设备并发及登录失效恢复。不要把健康检查通过或本地可用描述成正式站已上线。网页须按用户要求，在明确“提交合并”后由 main 发布；发布前设置仓库变量 `XIAOYA_API_BASE` 为接口公开来源，值不含任何秘密。

## 卫健委观察接口发布（2026-10-30）

用户授权发布后已用白名单包更新生产，部署 `6ae451e76b7257575e039df8` 为 ready。`/api/data/health` 对应固定私有文件 `records/health.json`，与原成长记录分开；未改动原有配置、凭据或认证状态库。网页继续由 main 的统一工作流发布。新观察记录首次连接仍须本人登录、预览并确认；部署核验不向个人记录仓写入测试项目。
