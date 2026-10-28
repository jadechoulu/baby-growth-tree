import test from 'node:test';
import assert from 'node:assert/strict';
import coordinate from '../.github/scripts/auto-pr.cjs';

const fullName = 'example/baby';
const sha = 'a'.repeat(40);
function setup({ event = 'push', branch = 'codex/english/example', conclusion = 'success', head = sha, fork = false, behind = 0, candidates, updatedSha, validation = 'success', validationSha } = {}) {
  const pr = { number: 2, node_id: 'PR_2', state: 'open', draft: false, user: { login: 'example' },
    head: { ref: branch, sha, repo: { full_name: fullName } }, base: { ref: 'main' } };
  const calls = [];
  const call = (name, result) => async args => {
    calls.push({ name, args });
    return { data: typeof result === 'function' ? result(args) : result };
  };
  let updated = false;
  let listed = candidates ?? [pr];
  const github = {
    rest: {
      pulls: {
        list: call('list', () => listed),
        get: call('get', () => updated && updatedSha ? { ...pr, head: { ...pr.head, sha: updatedSha } } : pr),
        create: call('create', () => { listed = [pr]; return pr; }),
        updateBranch: call('update', () => { updated = true; return {}; }),
        merge: call('merge', { merged: true }),
      },
      repos: { compareCommits: call('compare', () => ({ behind_by: updated ? 0 : behind, ahead_by: 1, commits: [{ commit: { message: '改进英语页面' } }] })) },
      actions: {
        createWorkflowDispatch: call('dispatch', {}),
        listWorkflowRuns: call('runs', () => ({ workflow_runs: [{ head_sha: validationSha ?? (updated ? updatedSha : sha),
          head_branch: branch, head_repository: { full_name: fullName }, event: 'workflow_dispatch',
          status: 'completed', conclusion: validation, html_url: 'https://example.test/run' }] })),
      },
    },
    graphql: async (...args) => { calls.push({ name: 'auto', args }); },
    paginate: async (fn, args) => (await fn(args)).data,
  };
  const context = { repo: { owner: 'example', repo: 'baby' }, ref: `refs/heads/${branch}`,
    payload: { repository: { full_name: fullName }, ...(event === 'workflow_run' ? { workflow_run: {
      head_repository: { full_name: fork ? 'other/baby' : fullName }, head_branch: branch,
      head_sha: head, conclusion, event: 'workflow_dispatch',
    } } : {}) } };
  // github-script 的 context.repo 是原型 getter，不能依靠对象展开保留。
  const repository = context.repo;
  Object.defineProperty(context, 'repo', { enumerable: false, get: () => repository });
  const core = { info() {}, warning() {} };
  return { calls, pr, github, run: () => coordinate({ github, context, core, wait: async () => {} }) };
}

test('专属分支推送自动创建 main PR，直接等待验证并合并发布，不依赖机器人后续事件', async () => {
  const app = setup({ candidates: [] });
  await app.run();
  assert.equal(app.calls.find(c => c.name === 'create').args.base, 'main');
  assert.deepEqual(app.calls.filter(c => c.name === 'dispatch').map(c => c.args.ref), ['codex/english/example', 'main']);
  assert.equal(app.calls.filter(c => c.name === 'auto').length, 1);
  assert.equal(app.calls.find(c => c.name === 'merge').args.sha, sha);
});

test('只有成功验证的当前提交可以合并，并显式触发 main 发布', async () => {
  const app = setup({ event: 'workflow_run' });
  await app.run();
  assert.equal(app.calls.find(c => c.name === 'merge').args.sha, sha);
  assert.deepEqual(app.calls.filter(c => c.name === 'dispatch').map(c => c.args.ref), ['main']);
});

test('失败、外部 fork 和非专属分支都不能使用协调器写权限', async () => {
  for (const options of [{ event: 'workflow_run', conclusion: 'failure' }, { event: 'workflow_run', fork: true }, { branch: 'codex/cloud-records' }]) {
    const app = setup(options);
    await app.run();
    assert.equal(app.calls.length, 0);
  }
});

test('过期的成功验证不能合并已经出现新提交的 PR', async () => {
  const app = setup({ event: 'workflow_run', head: 'b'.repeat(40) });
  await app.run();
  assert.equal(app.calls.filter(c => ['merge', 'dispatch', 'auto'].includes(c.name)).length, 0);
});

test('落后 main 时先更新分支并重新验证，不能沿用旧检查合并', async () => {
  const app = setup({ event: 'workflow_run', behind: 1, updatedSha: 'b'.repeat(40) });
  await app.run();
  assert.equal(app.calls.find(c => c.name === 'update').args.expected_head_sha, sha);
  assert.deepEqual(app.calls.filter(c => c.name === 'dispatch').map(c => c.args.ref), ['codex/english/example', 'main']);
  assert.equal(app.calls.find(c => c.name === 'merge').args.sha, 'b'.repeat(40));
});

test('原生自动合并先完成时，验证完成事件仍会安排 main 发布', async () => {
  const app = setup({ event: 'workflow_run', candidates: [] });
  app.pr.state = 'closed';
  app.pr.merged_at = '2026-10-28T00:00:00Z';
  const merged = setup({ event: 'workflow_run', candidates: [app.pr] });
  await merged.run();
  assert.deepEqual(merged.calls.filter(c => c.name === 'dispatch').map(c => c.args.ref), ['main']);
});

test('main 更新只同步本仓库的专属开放 PR，不接管已有其他分支', async () => {
  const app = setup({ branch: 'main', candidates: [] });
  const prs = [
    { ...app.pr, head: { ...app.pr.head, ref: 'codex/growth/example' } },
    { ...app.pr, head: { ...app.pr.head, ref: 'codex/cloud-records' } },
    { ...app.pr, user: { login: 'someone-else' }, head: { ...app.pr.head, ref: 'codex/english/external' } },
  ];
  const run = setup({ branch: 'main', candidates: prs });
  await run.run();
  assert.equal(run.calls.filter(c => c.name === 'compare').length, 1);
});

test('直接等待的验证失败或一直只有其他 SHA 时，保留 PR，不能合并或发布', async () => {
  for (const options of [{ validation: 'failure' }, { validationSha: 'c'.repeat(40) }]) {
    const app = setup(options);
    await assert.rejects(app.run(), /验证未通过|验证超时/);
    assert.equal(app.calls.filter(c => c.name === 'merge').length, 0);
    assert.deepEqual(app.calls.filter(c => c.name === 'dispatch').map(c => c.args.ref), ['codex/english/example']);
  }
});

test('等待验证排队结束后重新核对 PR，期间出现新提交则不能合并旧 SHA', async () => {
  const app = setup();
  const listRuns = app.github.rest.actions.listWorkflowRuns;
  let attempts = 0;
  app.github.rest.actions.listWorkflowRuns = async args => {
    if (++attempts === 1) return { data: { workflow_runs: [] } };
    const result = await listRuns(args);
    app.pr.head.sha = 'b'.repeat(40);
    return result;
  };
  await app.run();
  assert.equal(attempts, 2);
  assert.equal(app.calls.filter(c => c.name === 'merge').length, 0);
  assert.deepEqual(app.calls.filter(c => c.name === 'dispatch').map(c => c.args.ref), ['codex/english/example']);
});
