import { mergeGrowthSnapshots } from './cloud.mjs';

export function sameGrowth(left, right) {
  const value = snapshot => snapshot === null ? null : [snapshot.profile.name, snapshot.profile.birthDate,
    Object.keys(snapshot.records).sort().filter(id => snapshot.records[id].completedAt || snapshot.records[id].note)
      .map(id => [id, snapshot.records[id].completedAt || null, snapshot.records[id].note || ''])];
  return JSON.stringify(value(left)) === JSON.stringify(value(right));
}

const copy = value => value === null ? null : structuredClone(value);

// 每次请求完成后，把请求期间的新编辑合并到服务端确认的版本上。
// 只有云端确认且本地没有待保存变更，才能显示“已同步”。
export function createSaveQueue({ store, getSnapshot, applySnapshot, onStatus, onConflict, debounceMs = 1000 }) {
  let base = null;
  let savedAt = null;
  let dirty = false;
  let running = false;
  let timer = null;
  let revision = 0;
  let waiters = [];
  let error = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const status = () => onStatus({ pending: running || timer !== null, dirty, error, savedAt });
  const settle = (through, success) => {
    const done = waiters.filter(item => item.revision <= through);
    waiters = waiters.filter(item => item.revision > through);
    done.forEach(item => item.resolve(success));
  };

  async function drain() {
    if (running) return;
    clearTimer();
    running = true;
    error = null;
    status();
    try {
      while (dirty) {
        const sent = copy(getSnapshot());
        const sentRevision = revision;
        let result;
        try {
          result = await store.save(sent, copy(base));
        } catch (failure) {
          if (failure.code !== 'MERGE_CONFLICT') throw failure;
          // 旧请求报告冲突前，用户可能已改成云端值；用最新编辑重新判断。
          const latest = copy(getSnapshot());
          const merged = mergeGrowthSnapshots(failure.base, latest, failure.remote);
          if (merged.conflicts.length) {
            throw Object.assign(new Error(failure.message), failure, { local: latest, conflicts: merged.conflicts, snapshot: merged.snapshot });
          }
          base = copy(failure.remote);
          savedAt = failure.savedAt;
          applySnapshot(copy(merged.snapshot));
          dirty = !sameGrowth(merged.snapshot, base);
          if (!dirty) { clearTimer(); settle(revision, true); }
          else if (timer !== null) break;
          continue;
        }
        const latest = copy(getSnapshot());
        const rebased = mergeGrowthSnapshots(sent, latest, result.snapshot);
        base = copy(result.snapshot);
        savedAt = result.savedAt;
        if (rebased.conflicts.length) {
          const conflict = new Error('保存期间，同一字段又在另一设备发生了修改。请选择要保留的内容。');
          Object.assign(conflict, { code: 'MERGE_CONFLICT', base: sent, local: latest, remote: result.snapshot, revision: result.revision, savedAt, conflicts: rebased.conflicts });
          throw conflict;
        }
        applySnapshot(copy(rebased.snapshot));
        dirty = !sameGrowth(rebased.snapshot, base);
        if (!dirty) {
          // 网络期间可能再次 request，但最终内容已被本次确认覆盖，全部等待者都应结束。
          clearTimer();
          settle(revision, true);
        } else {
          settle(sentRevision, true);
          if (timer !== null) break;
        }
      }
    } catch (failure) {
      error = failure;
      dirty = true;
      clearTimer(); // 失败后保留编辑，由用户明确重试，不能被旧防抖计时器悄悄重发。
      if (failure.code === 'MERGE_CONFLICT') {
        // 保存失败时仍包含等待期间的编辑，不能只展示旧请求的快照。
        const latest = copy(getSnapshot());
        const merged = mergeGrowthSnapshots(failure.base, latest, failure.remote);
        error = Object.assign(new Error(failure.message), failure, { local: latest, conflicts: merged.conflicts, snapshot: merged.snapshot });
        onConflict(error);
      }
      settle(revision, false);
    } finally {
      running = false;
      status();
    }
  }

  function request({ debounce = false } = {}) {
    dirty = true;
    error = null;
    const nextRevision = ++revision;
    const promise = new Promise(resolve => waiters.push({ revision: nextRevision, resolve }));
    clearTimer();
    // 在途请求期间也记录最后一次输入的防抖窗口，避免每个字符接着产生一次提交。
    if (debounce) timer = setTimeout(() => { timer = null; void drain(); }, debounceMs);
    else if (!running) void drain();
    status();
    return promise;
  }

  function adopt(envelope, local = envelope.snapshot) {
    if (running) throw new Error('请等待当前云端请求结束');
    clearTimer();
    settle(revision, false);
    base = copy(envelope.snapshot);
    savedAt = envelope.savedAt;
    dirty = !sameGrowth(local, base);
    error = null;
    if (local !== null) applySnapshot(copy(local));
    status();
  }

  return { request, adopt, flush: () => request(), getBase: () => copy(base) };
}
