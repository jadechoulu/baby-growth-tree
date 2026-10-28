# 小芽完整站点发布

只使用公开仓库 `jadechoulu/baby-growth-tree`：`main` 保存完整源码，GitHub Actions 统一构建 `dist/site` 并部署 GitHub Pages。现有网页地址保持不变；`codex/pages` 保留旧发布历史，两个开发会话不再各自写入该分支。

## 构建与验证

```sh
node --test tests/*.test.mjs english/tests/model.test.cjs
python3 tests/english-pages.test.py
node scripts/build-site.mjs
```

完整站点为 `dist/site`：`home.html` 是共同首页，根 `index.html` 保留成长树，`english/index.html` 是英语路线。两边顶部使用相对路径，可部署在 `/baby-growth-tree/` 等项目子路径。旧单文件在本地继续可用。

构建先生成成长白名单组件包和英语去个人资料组件包，再组装统一站点。只复制运行所需文件和已引用资料；不复制个人 JSON、备份、截图、MEMORY.md、tmp、output、Worker 秘密或源码仓 Git 历史。成长默认生日和公开英语档案为空。

## 分支自动提交、合并与发布

英语与成长各使用独立 worktree 和任务分支，在自己的工作目录完成修改、验收和提交后推送：

```sh
git push -u origin HEAD
```

任务分支以 `codex/english/` 或 `codex/growth/` 开头。`.github/workflows/auto-pr.yml` 自动创建或复用面向 main 的开放 PR，并安排“小芽验证与发布”运行 verify。main 保护要求 verify 通过且分支包含最新 main；无需额外审批，通过后自动 squash 合并并删除远端任务分支。旧 PR 和其他命名的分支不会被接管。

main 推进后，协调器更新其他开放任务分支并重新验证；冲突或测试失败时停止自动合并，在原 PR 修复后再次推送即可。已合并分支不复用，下个任务从最新 origin/main 新建分支。不强推，不直接向 main 或旧发布分支提交。

verify 由 main、两类专属分支的 push 或显式 dispatch 启动，不订阅机器人 PR 的 pull_request 事件，避免产生需要人工授权的空检查。其他命名的分支或外部 fork 不在这套自动交付范围内。

内置 GITHUB_TOKEN 创建 PR、更新分支、合并后不会可靠触发后续事件，协调器会显式 dispatch 验证，直接等待本次同一提交的验证结果，再安排受保护合并与 main 发布。等待最多十分钟，失败或超时保留 PR，不绕过检查。合并后也会主动同步其他开放任务 PR，不依赖机器人事件继续串联。工作流只对同仓库受管理分支操作，成功运行的 head SHA 必须仍是 PR 当前提交，拒绝过期结果与外部 fork。协调代码始终从 main 读取，不执行 PR 中的协调脚本。不存储个人 Token。

只有 main 的成功构建可运行 deploy job，PR 和任务分支只验证、不部署。网站来源、相对路径及浏览器数据库不变。GitHub Pages 设置使用 GitHub Actions（`build_type=workflow`），不再使用 legacy 发布分支。

如工作流需要重试，可在 GitHub Actions 重跑失败任务，或执行 `gh workflow run site.yml --ref <任务分支或main>`。`scripts/publish-site.mjs` 仅保留旧流程兼容，日常不运行。原私有 Git 历史仍保存在本机备份。

## 本机记录与可选云端

两边记录互不合并。成长仍用 `xiaoya-growth` IndexedDB v1；英语仍用 `little-leaf-english-v1` localStorage。页面路径与网站来源保留，不清空或迁移数据库。协议、主机、端口不同仍会隔离浏览器记录；发布包不携带真实个人记录。

默认 `cloud-config.json` 保持 `{ "apiBase": "" }`，本机可直接保存，不需要登录。启用云端是独立能力，详见 [Worker 说明](../worker/README.md)。完整站点构建可通过公开变量设置 HTTPS API 来源：

```sh
XIAOYA_API_BASE='https://your-worker.example.workers.dev' node scripts/build-site.mjs
```

构建仅写出 `apiBase` 字段，不复制配置中的其他字段；Token、OAuth secret 和会话密钥只放服务端。API 地址本身不迁移本机记录，须由本人在界面确认后才可导入。
