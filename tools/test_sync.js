/* 同步邏輯測試：用假的 GitHub contents API 模擬兩台裝置輪流存檔、同時寫入（sha 衝突）
   用法：node tools/test_sync.js */
'use strict';
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');

// 假 GitHub：一個檔案，每次 PUT 換 sha，sha 對不上回 409
const remote = { content: null, sha: null, n: 0, puts: 0 };
// 舊版寫在 repo 根目錄的 saves.json（1.4.2 以前）
const stray = { content: null, sha: 'stray1', deleted: 0 };
async function fakeFetch(url, opt) {
  opt = opt || {};
  const ok = (body, status) => ({ ok: true, status: status || 200, json: async () => body });
  const bad = (status, message) => ({ ok: false, status, json: async () => ({ message }) });
  if (/\/contents\/saves\.json$/.test(url)) {
    if (!stray.content) return bad(404, 'Not Found');
    if (opt.method === 'DELETE') { stray.content = null; stray.deleted++; return ok({}); }
    return ok({ content: stray.content, sha: stray.sha });
  }
  if (!/\/contents\/saves\/magictower\.json$/.test(url)) return bad(404, 'Not Found');
  if (!opt.method || opt.method === 'GET') {
    if (!remote.content) return bad(404, 'Not Found');
    return ok({ content: remote.content, sha: remote.sha });
  }
  const b = JSON.parse(opt.body);
  if ((b.sha || null) !== remote.sha) return bad(409, 'sha mismatch');
  remote.content = b.content; remote.sha = 'sha' + (++remote.n); remote.puts++;
  return ok({ content: { sha: remote.sha } });
}

function device(name) {
  const store = {};
  const ctx = {
    console, setTimeout: (f) => 0, clearTimeout: () => {},
    TextEncoder, TextDecoder, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    navigator: { userAgent: name },
    fetch: fakeFetch, Date, JSON, Math, Promise, Uint8Array, String, Object, Array, Error,
  };
  ctx.window = ctx; ctx.window.MT = { t: k => k };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sync.js'), 'utf8'), ctx);
  const S = ctx.MT.Sync;
  S.device = name;
  S.setConf({ owner: 'o', repo: 'r', token: 't' });
  return S;
}

(async () => {
  const A = device('PC'), B = device('Phone');
  let clock = 1000;
  const realNow = Date.now; Date.now = () => (clock += 1000);

  // A 存檔上傳
  A.save('auto', { floor: 3, hp: 900 });
  await A.push();
  assert.strictEqual(A.status, 'ok');
  // B 拉下來，看得到 A 的進度
  let r = await B.pull();
  assert.strictEqual(JSON.stringify(r.changed), '["auto"]');
  assert.strictEqual(B.get('auto').floor, 3);
  // B 玩到 5F 存手動存檔 1 和自動存檔
  B.save('s1', { floor: 5, hp: 700 });
  B.save('auto', { floor: 5, hp: 700 });
  await B.push();
  // A 手上的 sha 已經舊了：A 存 s2 → 第一次 409，重讀合併後成功，而且不會蓋掉 B 的 auto
  A.save('s2', { floor: 4, hp: 800 });
  await A.push();
  assert.strictEqual(A.status, 'ok');
  const data = JSON.parse(Buffer.from(remote.content, 'base64').toString());
  assert.strictEqual(data.slots.auto.floor, 5, 'B 較新的自動存檔要留著');
  assert.strictEqual(data.slots.s1.floor, 5);
  assert.strictEqual(data.slots.s2.floor, 4);
  // A 拉取後本機也有 B 的新自動存檔
  r = await A.pull();
  assert.strictEqual(A.get('auto').device, 'Phone');
  assert.strictEqual(A.newest().slot, 's2'); // A 最後存的是 s2
  // B 拉下來拿到 A 存的 s2
  await B.pull();
  assert.strictEqual(B.get('s2').floor, 4);
  // 舊版頁面把較新的自動存檔寫在根目錄 saves.json：拉取時併進來、推上新位置、刪掉根目錄那份
  stray.content = Buffer.from(JSON.stringify({ v: 1, slots: { auto: { at: (clock += 1000), device: 'Old', floor: 7, hp: 600, data: { floor: 7, hp: 600 } } } })).toString('base64');
  r = await A.pull();
  assert.strictEqual(JSON.stringify(r.changed), '["auto"]');
  assert.strictEqual(A.get('auto').floor, 7);
  assert.strictEqual(JSON.parse(Buffer.from(remote.content, 'base64').toString()).slots.auto.floor, 7, '要推上新位置');
  assert.strictEqual(stray.deleted, 1, '根目錄那份要刪掉');
  assert.strictEqual(JSON.parse(Buffer.from(remote.content, 'base64').toString()).slots.s2.floor, 4, '其他格不受影響');
  // 離線：fetch 丟例外 → 狀態 offline，本機存檔照樣在
  const C = device('Offline');
  C.api = async () => { const e = new Error('net'); e.status = 0; throw e; };
  C.save('auto', { floor: 1, hp: 1000 });
  await C.push();
  assert.strictEqual(C.status, 'offline');
  assert.strictEqual(C.get('auto').floor, 1);

  Date.now = realNow;
  console.log(`同步測試通過（遠端寫入 ${remote.puts} 次）`);
})().catch(e => { console.error(e); process.exit(1); });
