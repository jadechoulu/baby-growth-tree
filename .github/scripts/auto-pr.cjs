// 协调器只从 main 读取，PR 的代码仅在只读验证工作流中执行。
const managedBranch = branch => /^codex\/(english|growth)\/.+/.test(branch);

module.exports = async function coordinate({ github, context, core, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const repo = context.repo;
  const fullName = `${repo.owner}/${repo.repo}`;
  const run = context.payload.workflow_run;
  // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 仅处理本仓库自己的分支，拒绝 fork 运行携带写权限。
  if (context.payload.repository.full_name !== fullName || (run && run.head_repository.full_name !== fullName)) return;
  if (run && run.conclusion !== 'success') return;
  const branch = run ? run.head_branch : context.ref.replace('refs/heads/', '');
  if (branch !== 'main' && !managedBranch(branch)) return;

  const dispatch = async (ref, expectedSha) => {
    const started = new Date(Date.now() - 1000).toISOString();
    await github.rest.actions.createWorkflowDispatch({ ...repo, workflow_id: 'site.yml', ref });
    core.info(`已安排验证：${ref}`);
    if (!expectedSha) return;
    // 内置令牌的验证完成也可能不触发 workflow_run，直接等待刚安排的同一提交。
    for (let attempt = 0; attempt < 120; attempt++) {
      const { data } = await github.rest.actions.listWorkflowRuns({ ...repo, workflow_id: 'site.yml',
        branch: ref, event: 'workflow_dispatch', created: `>=${started}`, per_page: 20 });
      const result = data.workflow_runs.find(item => item.head_sha === expectedSha &&
        item.head_repository?.full_name === fullName);
      if (result?.status === 'completed') {
        if (result.conclusion !== 'success') throw new Error(`验证未通过，保留 PR：${result.html_url}`);
        return coordinate({ github, core, wait, context: { repo: context.repo, ref: context.ref,
          payload: { ...context.payload, workflow_run: result } } });
      }
      await wait(5000);
    }
    throw new Error(`等待 ${ref} 验证超时，保留 PR；请重跑协调工作流。`);
  };
  const owned = pr => pr.head.repo?.full_name === fullName && pr.base.ref === 'main' &&
    [repo.owner.toLowerCase(), 'github-actions[bot]'].includes(pr.user.login.toLowerCase());

  async function synchronize(pr) {
    const { data: comparison } = await github.rest.repos.compareCommits({ ...repo, base: 'main', head: pr.head.sha });
    if (!comparison.behind_by) return false;
    core.info(`PR #${pr.number} 更新到最新 main`);
    try {
      await github.rest.pulls.updateBranch({ ...repo, pull_number: pr.number, expected_head_sha: pr.head.sha });
    } catch (error) {
      if ([409, 422].includes(error.status)) {
        core.warning(`PR #${pr.number} 需要处理冲突或分支已变化，保留 PR 等待修复。`);
        return true;
      }
      throw error;
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data: updated } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
      if (updated.head.sha !== pr.head.sha) {
        // 内置令牌更新分支不会触发 push，必须显式触发验证。
        await dispatch(updated.head.ref, updated.head.sha);
        return true;
      }
      await wait(1000);
    }
    throw new Error(`PR #${pr.number} 分支更新仍未完成，请重新运行协调工作流。`);
  }

  async function synchronizeOpen() {
    const prs = await github.paginate(github.rest.pulls.list, { ...repo, base: 'main', state: 'open', per_page: 100 });
    for (const pr of prs.filter(pr => owned(pr) && !pr.draft && managedBranch(pr.head.ref))) await synchronize(pr);
  }
  if (branch === 'main') {
    await synchronizeOpen();
    return;
  }

  const { data: candidates } = await github.rest.pulls.list({ ...repo, head: `${repo.owner}:${branch}`, base: 'main', state: 'all', sort: 'updated', direction: 'desc', per_page: 100 });
  let pr = candidates.find(pr => pr.state === 'open');
  if (!pr && run) {
    // 内置令牌自动合并不会触发 main 的 push；验证完成后显式安排统一发布。
    const merged = candidates.find(pr => owned(pr) && pr.merged_at && pr.head.sha === run.head_sha);
    if (merged) {
      await dispatch('main');
      await synchronizeOpen();
    }
    return;
  }
  if (!pr) {
    const { data: comparison } = await github.rest.repos.compareCommits({ ...repo, base: 'main', head: branch });
    if (!comparison.ahead_by) return;
    const area = branch.startsWith('codex/english/') ? '英语启蒙' : '成长技能树';
    const subject = comparison.commits.at(-1).commit.message.split('\n')[0];
    ({ data: pr } = await github.rest.pulls.create({ ...repo, head: branch, base: 'main',
      title: `${area}：${subject}`,
      body: `由专属开发分支自动提交。\n\n通过必需检查 verify 后自动合并到 main；main 统一构建并发布网站。\n\n分支：\`${branch}\`` }));
    core.info(`已创建 PR #${pr.number}：${pr.html_url}`);
  }
  if (!owned(pr) || pr.draft) return;
  ({ data: pr } = await github.rest.pulls.get({ ...repo, pull_number: pr.number }));
  if (run && pr.head.sha !== run.head_sha) return;
  if (pr.merged || pr.merged_at) {
    if (run) {
      await dispatch('main');
      await synchronizeOpen();
    }
    return;
  }
  if (await synchronize(pr)) return;

  if (run) {
    // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 只合并本次通过验证的同一提交，拒绝过期运行。
    if (!['workflow_dispatch', 'push'].includes(run.event)) return;
    try {
      const { data: result } = await github.rest.pulls.merge({ ...repo, pull_number: pr.number, sha: run.head_sha, merge_method: 'squash' });
      if (!result.merged) throw new Error(`PR #${pr.number} 尚未满足合并条件：${result.message}`);
    } catch (error) {
      const { data: latest } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
      if (!latest.merged && !latest.merged_at) throw error;
    }
    await dispatch('main');
    await synchronizeOpen();
    return;
  }

  try {
    await github.graphql('mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}', { id: pr.node_id });
  } catch (error) {
    // 已经启用或当前状态尚不可启用时，直接等待验证后继续按受保护规则合并。
    core.warning(`PR #${pr.number} 自动合并将等待验证后继续处理：${error.message}`);
  }
  await dispatch(branch, pr.head.sha);
};

module.exports.managedBranch = managedBranch;
