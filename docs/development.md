# 英语与成长的独立迭代

英语、成长分别在自己的会话和 Git worktree 中开发，共用一个产品和一套共享框架。使用对应会话提出需求即可；会话完成验收后提交并推送任务分支，后续 PR、合并和正式发布由 GitHub 自动处理。

## 开工前

```sh
git rev-parse --show-toplevel
git config --worktree xiaoya.area
git status --short
git fetch origin
```

`xiaoya.area` 应为 `english` 或 `growth`。如果目录、职责或工作区状态不符，先处理实际状态，不改动另一会话目录。不要把新 worktree 中缺少本机浏览器记录误当作记录丢失：记录按网站来源保存在浏览器，worktree 只隔离源码。

从最新 main 创建本次任务分支，例如：

```sh
git switch -c codex/english/路线筛选 origin/main
# 成长任务使用 codex/growth/<任务>
```

每次任务使用新分支；PR 合并后远端任务分支自动删除，下次不能沿用已合并分支追加修改。不能在 main 开发，也不要在一个 worktree 中切换另一会话正在使用的分支。

## 提交后的流程

1. 在本工作区完成需求及对应验收，只提交所属任务的文件，检查暂存差异。
2. 提交并执行 `git push -u origin HEAD`。
3. GitHub 创建或复用当前分支到 main 的 PR，安排 verify 测试和完整构建。
4. 若 main 已推进，机器人先更新 PR 分支并重新验证；全部通过后自动 squash 合并。
5. main 通过统一验证后部署 GitHub Pages，两分类一起发布。

无需用户反复批准创建 PR 或合并。失败检查和文本冲突不会被绕过，原会话应在原分支修复并推送。PR 创建后应附加到对应会话，并报告 PR 与发布结果，不能只以“已推送”表示正式站已更新。

机器人直接等待本次提交的验证结果，不要求用户逐次批准 Actions。若验证等待超时，在 Actions 重跑本分支的“分支自动提交与合并”任务；修改代码后再次推送也会重新执行。只重跑验证工作流不等于已经重启完整交付协调。正式站仍要以 main 的“小芽验证与发布”中 deploy 成功为准。

GitHub 可能向远端任务分支添加同步 main 的提交。在本机继续修改开放 PR 前，先 `git fetch origin` 并合并自己的远端任务分支，再合并最新 origin/main；保留未提交工作，不 force push。其他 PR 不属于当前任务，不顺手合并或关闭。

## 共享代码和预览

`shared/`、`site.css`、构建、工作流及全站文档为共享范围。必要改动仍在本任务分支完成，同时验证成长、英语、首页和详情，合并时由 verify 保护共同基线。不能因为 worktree 隔离而复制两套导航框架。

两个 worktree 各自的预览服务要使用不同端口；启停前按项目规则检查服务，不能停止或复用另一会话的服务进程。不同端口有不同浏览器存储来源，不自动合并成长记录、词汇、收藏和手记。

正式发布只来自 main 的 GitHub Actions。旧 `codex/pages` 分支和本机发布副本保留历史，两会话均不再向其推送。工作流详情及重试方式见 [发布说明](../deploy/README.md)。
