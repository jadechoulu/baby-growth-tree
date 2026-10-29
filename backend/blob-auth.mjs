const PREFIX = 'xiaoya-auth-v1/';
const MAX_TTL = 12 * 60 * 60_000;
const keyPattern = /^[a-f0-9]{64}$/;

/** Vercel 私有 Blob 仅保存一次性 state 和短期会话哈希，不保存宝宝记录。 */
export function createBlobAuth({ blob, options = {} }) {
  const pathFor = (kind, key) => `${PREFIX}${kind}/${key}.json`;
  const writeOptions = { ...options, access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 };
  async function read(path) {
    // @CfSecAICode 遵循消费金融安全编码 BE-AUTH-001 规范: 鉴权读取绕过 CDN，注销或 state 消费不能复用缓存。
    const found = await blob.get(path, { ...options, access: 'private', useCache: false });
    if (!found) return null;
    if (found.statusCode !== 200 || !found.stream || !found.blob.etag) throw new Error('登录状态读取失败');
    return { value: await new Response(found.stream).json(), etag: found.blob.etag };
  }
  async function operation({ operation, kind, key, payload, expiresAt, now }) {
    if (!['put', 'get', 'consume', 'delete'].includes(operation) || !['state', 'session'].includes(kind) || !keyPattern.test(key) || !Number.isFinite(now)) return Response.json({ code: 'INVALID_INTERNAL_REQUEST' }, { status: 400 });
    const path = pathFor(kind, key);
    if (operation === 'put') {
      if (!payload || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + MAX_TTL) return Response.json({ code: 'INVALID_INTERNAL_REQUEST' }, { status: 400 });
      await blob.put(path, JSON.stringify({ payload, expiresAt }), { ...writeOptions, allowOverwrite: false });
      return Response.json({ ok: true });
    }
    if (operation === 'delete') {
      await blob.del(path, options);
      return Response.json({ ok: true });
    }
    const entry = await read(path);
    if (!entry || entry.value.expiresAt <= now || entry.value.consumed) return Response.json(null);
    if (operation === 'consume') {
      try {
        // @CfSecAICode 遵循消费金融安全编码 GO-OAUTH-001 规范: ETag 条件更新原子标记已消费；并发回调只允许一个成功，不依赖先读再删。
        await blob.put(path, JSON.stringify({ expiresAt: entry.value.expiresAt, consumed: true }), { ...writeOptions, allowOverwrite: true, ifMatch: entry.etag });
      } catch (error) {
        if (error instanceof blob.BlobPreconditionFailedError) return Response.json(null);
        throw error;
      }
    }
    return Response.json(entry.value.payload);
  }
  const stub = { async fetch(request) {
    try { return await operation(await request.json()); }
    catch { return Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503 }); }
  } };
  return { idFromName: name => name, get: () => stub };
}

/** 逻辑过期即时生效；每日清理超过最大会话时长的私有状态文件。 */
export async function cleanupBlobAuth({ blob, options = {}, now = Date.now() }) {
  let cursor, deleted = 0;
  do {
    const page = await blob.list({ ...options, prefix: PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    const expired = page.blobs.filter(item => /^xiaoya-auth-v1\/(state|session)\/[a-f0-9]{64}\.json$/.test(item.pathname) && new Date(item.uploadedAt).getTime() + MAX_TTL <= now);
    if (expired.length) { await blob.del(expired.map(item => item.url), options); deleted += expired.length; }
    cursor = page.hasMore ? page.cursor : null;
    if (page.hasMore && !cursor) throw new Error('清理游标无效');
  } while (cursor);
  return { deleted };
}
