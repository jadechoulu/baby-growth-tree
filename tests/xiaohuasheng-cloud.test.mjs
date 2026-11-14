import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createAppClient, createXhsService, fetchSnapshot, catalogMetadata } from '../backend/xiaohuasheng.mjs';

const NOW = Date.parse('2026-11-09T00:00:00Z');
const settings = () => ({ userId: '123', seed: 'fake-seed', authorization: 'fake-authorization', token: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12), platform: 'ios' });
const envelope = value => Response.json({ M: '1001', J: gzipSync(JSON.stringify(value)).toString('base64') });
const row = (id, extra = {}) => ({ bookId: id, guid: 'guid-' + id, name: 'Book ' + id, readedFlag: 1, readCount: 3, ...extra });
const detail = (id, extra = {}) => ({ pk: id, guid: 'guid-' + id, name: 'Book ' + id, language: '英文', frontCover: 'cover.jpg', ...extra });
function memoryStore() {
  const entries = new Map(); let version = 0;
  return {
    entries,
    async setJSON(key, data, options = {}) {
      const previous = entries.get(key);
      if (options.onlyIfNew && previous || options.onlyIfMatch && previous?.etag !== options.onlyIfMatch) return { modified: false };
      const etag = String(++version); entries.set(key, { data: structuredClone(data), etag }); return { modified: true, etag };
    },
    async getWithMetadata(key) { return structuredClone(entries.get(key) || null); },
  };
}

test('书目标签和出版字段按白名单升级缓存，下一次同步仍读取最新阅读状态',async()=>{
  const metadata=catalogMetadata(detail(1,{category:'英文，lovevery，Lovevery',seriesTitle:'Lovevery',press:'Lovevery',author:'Author',myComment:'private'}));
  assert.deepEqual(metadata.catalogTags,['英文','lovevery','Lovevery']);assert.equal(metadata.publisher,'Lovevery');assert.equal(metadata.seriesTitle,'Lovevery');assert.equal(metadata.myComment,undefined);
  const store=memoryStore();await store.setJSON('catalog/123/1',catalogMetadata(detail(1)));
  const cached=store.entries.get('catalog/123/1');delete cached.data.catalogSchemaVersion;
  let calls=0,read=true;
  const client={async get(path){if(path.startsWith('/bookroom/'))return [row(1,{readedFlag:read?1:0}),row(2)];calls++;return detail(Number(path.split('/').at(-1)),{category:'英文，lovevery'});}};
  let result=await fetchSnapshot({config:settings(),client,store,history:'history/first'});
  assert.equal(calls,2);assert.deepEqual(result.shelfCatalog.books[0].catalogTags,['英文','lovevery']);
  calls=0;read=false;result=await fetchSnapshot({config:settings(),client,store,history:'history/second'});
  assert.equal(calls,0);assert.equal(result.shelfCatalog.books[0].read,false);assert.equal(result.books.length,1);
});

test('云端按当前时间签名固定本人HTTPS路由，续取令牌；拒绝跳转且不泄漏上游凭据', async () => {
  const config = settings(), calls = [];
  const client = createAppClient({ config, now: () => NOW, network: async (url, options) => {
    calls.push({ url, options });
    return envelope(url.startsWith('http:') ? [{ name: config.token }] : [row(1)]);
  } });
  await client.refresh(); await client.get('/bookroom/queryBookroomBook/123/-2/-1/-1/0/30');
  assert.equal(calls[1].url, 'https://app.xiaohuasheng.cn//bookroom/queryBookroomBook/123/-2/-1/-1/0/30');
  assert.equal(calls[1].options.redirect, 'error');
  const timestamp = String(NOW / 1000), part = '/bookroom/queryBookroomBook/123/-2/-1/-1/0/30';
  const expected = createHash('md5').update(config.userId + timestamp + part + config.token + config.seed).digest('hex');
  assert.equal(calls[1].options.headers.signature, expected);
  await assert.rejects(client.get('/bookroom/queryBookroomBook/999/-2/-1/-1/0/30'));
  assert.equal(calls.length, 2);
  const bad = createAppClient({ config, network: async () => { throw new Error('fake-authorization-must-not-leak'); } });
  await assert.rejects(bad.refresh(), error => error.code === 'XHS_UNAVAILABLE' && !error.message.includes('authorization'));
});

test('完整分页、原始历史、白名单英文元信息和次数沿原契约派生；套装已读不下传成员', async () => {
  const store = memoryStore();
  const client = { async get(path) {
    if (path.startsWith('/bookroom/')) return [row(1, { isTaoxi: 1 }), row(2)];
    if (path === '/book/getBooksInTaoxi/1/0/100') return [detail(2), detail(3)];
    const id = Number(path.split('/').at(-1)); return detail(id, { bookCount: 2, myComment: 'private-must-not-leak', futurePrivateField: true });
  } };
  const value = await fetchSnapshot({ config: settings(), client, store, history: 'history/one', now: () => NOW });
  assert.equal(value.complete, true); assert.equal(value.books[0].readCount, 3);
  assert.equal(value.shelfCatalog.total, 2); assert.equal(value.shelfCatalog.collections[0].total, 2);
  assert.equal(value.shelfCatalog.collections[0].books[0].read, true);
  assert.equal(value.shelfCatalog.collections[0].books[1].read, false);
  assert.equal(store.entries.get('history/one/page-0').data.books[0].isTaoxi, 1);
  assert.doesNotMatch(JSON.stringify(value), /private-must-not-leak|futurePrivateField/);
  assert.equal(value.shelfCatalog.books[0].cover, 'https://img.xiaohuasheng.cn/cover.jpg');
});

test('重复身份、失败页、非法已读字段及目录缺册不生成可导入快照', async () => {
  const run = client => fetchSnapshot({ config: settings(), client, store: memoryStore(), history: 'history/test', now: () => NOW });
  await assert.rejects(run({ get: async () => [row(1), row(1)] }));
  await assert.rejects(run({ get: async () => [row(1, { readedFlag: true })] }));
  await assert.rejects(run({ get: async () => [row(1, { readCount: -1 })] }));
  await assert.rejects(run({ get: async path => path.startsWith('/bookroom/') ? [row(1, { isTaoxi: 1 })] : path.includes('getBooksInTaoxi') ? [] : detail(1, { bookCount: 2 }) }));
  await assert.rejects(run({ get: async path => path.endsWith('/0/30') ? Array.from({ length: 30 }, (_, i) => row(i + 1)) : Promise.reject(new Error('missing page')) }));
});

test('同一本人任务去重，一次性后台能力原子消费，状态不暴露凭据；完整快照与备份私有保存', async () => {
  const store = memoryStore(), config = settings(), env = { GITHUB_ALLOWED_USER_ID: '42', WORKER_URL: 'https://test.netlify.app', XIAOHUASHENG_CREDENTIALS: JSON.stringify(config) };
  let launch, reads = 0;
  const service = createXhsService({ env, store, now: () => NOW, network: async (url, options) => {
    if (String(url).includes('/.netlify/functions/')) { launch = JSON.parse(options.body); return new Response(null, { status: 202 }); }
    reads++;
    if (String(url).startsWith('http:')) return envelope([{ name: config.token }]);
    return envelope(String(url).includes('/bookroom/') ? [row(1)] : detail(1));
  } });
  assert.equal((await service.start()).status, 'queued');
  const original = launch;
  assert.equal((await service.start()).status, 'queued'); assert.equal(launch, original);
  assert.equal(await service.run({ ...launch, capability: '0'.repeat(64) }), false);
  assert.equal(await service.run(launch), true); const done = await service.status();
  assert.equal(done.status, 'complete'); assert.equal(done.snapshot.books[0].readCount, 3);
  const count = reads;
  assert.equal(await service.run(launch), false); assert.equal(reads, count);
  assert.doesNotMatch(JSON.stringify(done), /fake-seed|fake-authorization|capabilityHash/);
  assert.deepEqual(await service.backup({ version: 1, records: { test: { status: 'done' } } }), { saved: true });
  assert.equal([...store.entries.keys()].filter(key => key.startsWith('backups/42/')).length, 1);
});

test('目录请求失败须等待同批请求结束再落定失败，停止继续发出后续查询', async () => {
  let release, finishFirst, secondSettled = false;
  const blocked = new Promise(resolve => { release = resolve; });
  const firstFailed = new Promise(resolve => { finishFirst = resolve; });
  const requested = [];
  const work = fetchSnapshot({ config: settings(), store: memoryStore(), history: 'history/failed', client: { async get(path) {
    if (path.startsWith('/bookroom/')) return Array.from({ length: 10 }, (_, i) => row(i + 1));
    const id = Number(path.split('/').at(-1)); requested.push(id);
    if (id === 1) { finishFirst(); throw new Error('目录不可用'); }
    await blocked; secondSettled = true; return detail(id);
  } } });
  await firstFailed; release();
  await assert.rejects(work);
  assert.equal(secondSettled, true);
  assert.equal(requested.length, 4);
});

test('后台任务只有私人记录保存回执确认后才完成；页面关闭也执行同一导入，失败不报已同步', async () => {
  for (const broken of [false,true]) {
    const store=memoryStore(), config=settings(), env={GITHUB_ALLOWED_USER_ID:'42',WORKER_URL:'https://test.netlify.app',XIAOHUASHENG_CREDENTIALS:JSON.stringify(config)};
    let launch, imported=0;
    const service=createXhsService({env,store,now:()=>NOW,network:async(url,options)=>{
      if(String(url).includes('/.netlify/functions/')){launch=JSON.parse(options.body);return new Response(null,{status:202});}
      if(String(url).startsWith('http:'))return envelope([{name:config.token}]);
      return envelope(String(url).includes('/bookroom/')?[row(1)]:detail(1));
    },importSnapshot:async(value,backup)=>{
      assert.equal(value.complete,true);imported++;
      await backup({version:1,records:{manual:{status:'done'}}});
      if(broken)throw Error('private upstream response');
      return {saved:true,revision:'b'.repeat(40)};
    }});
    await service.start();await service.run(launch);
    assert.equal(imported,1);assert.equal((await service.status()).status,broken?'failed':'complete');
    assert.ok([...store.entries.keys()].some(key=>key.startsWith('backups/42/')));
    if(broken){assert.equal((await service.status()).code,'XHS_SAVE_FAILED');assert.doesNotMatch(JSON.stringify(await service.status()),/private upstream/);}
  }
});

test('未配置、授权失效、后台超时不返回旧结果为本次成功，也不清空先前历史', async () => {
  const store = memoryStore(), env = { GITHUB_ALLOWED_USER_ID: '42', WORKER_URL: 'https://test.netlify.app' }; let launch, time = NOW;
  const service = createXhsService({ env, store, now: () => time, network: async (url, options) => {
    if (String(url).includes('/.netlify/functions/')) { launch = JSON.parse(options.body); return new Response(null, { status: 202 }); }
    return Response.json({ M: '9999', J: 'upstream-private-value' });
  } });
  await assert.rejects(service.start(), { code: 'XHS_NOT_CONFIGURED' });
  env.XIAOHUASHENG_CREDENTIALS = JSON.stringify(settings()); await service.start();
  time += 17 * 60_000;
  assert.equal((await service.status()).code, 'XHS_TIMEOUT'); assert.equal(await service.run(launch), false);
  await store.setJSON('history/old/snapshot', { complete: true });
  await service.start(); await service.run(launch);
  const result = await service.status();
  assert.equal(result.status, 'failed'); assert.equal(result.code, 'XHS_AUTH_REQUIRED');
  assert.equal([...store.entries].some(([key, value]) => key.endsWith('/result') && value.data.code === 'XHS_AUTH_REQUIRED'), true);
  assert.equal(store.entries.has('history/old/snapshot'), true);
  assert.doesNotMatch(JSON.stringify(result), /upstream-private-value/);
});
