const MAX_TTL = 12 * 60 * 60_000;
const KEY = /^(state|session)\/[a-f0-9]{64}$/;

/** Netlify Blobs 仅保存短期鉴权状态，记录仍在 GitHub 私有仓库。 */
export function createNetlifyAuth({ store }) {
  async function operation({ operation, kind, key, payload, expiresAt, now }) {
    const path = `${kind}/${key}`;
    if (!['put', 'get', 'consume', 'delete'].includes(operation) || !KEY.test(path) || !Number.isFinite(now)) return Response.json({ code: 'INVALID_INTERNAL_REQUEST' }, { status: 400 });
    if (operation === 'put') {
      if (!payload || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + MAX_TTL) return Response.json({ code: 'INVALID_INTERNAL_REQUEST' }, { status: 400 });
      const result = await store.setJSON(path, { payload, expiresAt }, { onlyIfNew: true });
      if (!result.modified) throw new Error('登录状态已存在');
      return Response.json({ ok: true });
    }
    if (operation === 'delete') {
      await store.delete(path);
      return Response.json({ ok: true });
    }
    // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 强一致读取避免使用注销前或已消费的缓存状态。
    const entry = await store.getWithMetadata(path, { type: 'json', consistency: 'strong' });
    if (!entry) return Response.json(null);
    if (!Number.isFinite(entry.data?.expiresAt) || !entry.etag) throw new Error('登录状态格式无效');
    if (entry.data.expiresAt <= now || entry.data.consumed) return Response.json(null);
    if (operation === 'consume') {
      // @CfSecAICode 遵循消费金融安全编码 GO-OAUTH-001 规范: 原子条件更新标记已消费，并发回调只有一次成功。
      const result = await store.setJSON(path, { expiresAt: entry.data.expiresAt, consumed: true }, { onlyIfMatch: entry.etag });
      if (!result.modified) return Response.json(null);
    }
    return Response.json(entry.data.payload);
  }
  const stub = { async fetch(request) {
    try { return await operation(await request.json()); }
    catch { return Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503 }); }
  } };
  return { idFromName: name => name, get: () => stub };
}

/** 仅清理本鉴权库中的过期状态；定时入口由 Netlify 平台调度，不开放公网 URL。 */
export async function cleanupNetlifyAuth({ store, now = Date.now() }) {
  let deleted = 0;
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) {
      if (!KEY.test(blob.key)) continue;
      const entry = await store.getWithMetadata(blob.key, { type: 'json', consistency: 'strong' });
      if (Number.isFinite(entry?.data?.expiresAt) && entry.data.expiresAt <= now) {
        await store.delete(blob.key);
        deleted += 1;
      }
    }
  }
  return { deleted };
}
