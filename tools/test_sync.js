/* 同步邏輯測試：用假的 GitHub contents API 模擬兩台裝置輪流存檔、同時寫入（sha 衝突）、舊格式搬家
   用法：node tools/test_sync.js */
'use strict';
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');

// 假 GitHub：每個路徑一個檔案，每次 PUT 換 sha，sha 對不上回 409
const files = {};
let puts = 0, shaN = 0;
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64');
const dec = s => JSON.parse(Buffer.from(s, 'base64').toString());
async function fakeFetch(url, opt) {
  opt = opt || {};
  const ok = (body, status) => ({ ok: true, status: status || 200, json: async () => body });
  const bad = (status, message) => ({ ok: false, status, json: async () => ({ message }) });
  const m = /\/contents\/(.+)$/.exec(url);
  if (!m) return bad(404, 'Not Found');
  const p = m[1], f = files[p];
  if (!opt.method || opt.method === 'GET') return f ? ok({ content: f.content, sha: f.sha }) : bad(404, 'Not Found');
  const b = JSON.parse(opt.body);
  if ((b.sha || null) !== (f ? f.sha : null)) return bad(409, 'sha mismatch');
  if (opt.method === 'DELETE') { delete files[p]; return ok({}); }
  files[p] = { content: b.content, sha: 'sha' + (++shaN) }; puts++;
  return ok({ content: { sha: files[p].sha } });
}
const remote = () => dec(files['saves/magictower/saves.json'].content);

function device(name, presetStore) {
  const store = presetStore || {};
  const ctx = {
    console, setTimeout: () => 0, clearTimeout: () => {},
    TextEncoder, TextDecoder, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    navigator: { userAgent: name },
    fetch: fakeFetch, Date, JSON, Math, Promise, Uint8Array, String, Object, Array, Error, Map,
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
  let clock = 1000;
  const realNow = Date.now; Date.now = () => (clock += 1000);
  const A = device('PC'), B = device('Phone');
  assert.notStrictEqual(A.devId, B.devId);

  // A 自動存檔上傳；B 拉下來看得到，「繼續遊戲」會接 A 的進度
  A.saveAuto({ floor: 3, hp: 900 });
  await A.push();
  assert.strictEqual(A.status, 'ok');
  let r = await B.pull();
  assert.strictEqual(r.changed.length, 1);
  assert.strictEqual(B.latestAuto().floor, 3);
  assert.strictEqual(B.myAuto(), null, 'B 自己還沒有自動存檔');

  // B 玩到 5F：自動存檔是 B 自己那格，不會蓋掉 A 的
  B.saveAuto({ floor: 5, hp: 700 });
  B.saveManual({ floor: 5, hp: 700 });
  await B.push();
  // A 手上的 sha 已經舊了：A 存手動存檔 → 第一次 409，重讀合併後成功
  A.saveManual({ floor: 4, hp: 800 });
  await A.push();
  assert.strictEqual(A.status, 'ok');
  let d = remote();
  assert.strictEqual(d.list.filter(x => x.kind === 'auto').length, 2, '兩台裝置各一格自動存檔');
  assert.strictEqual(d.list.filter(x => x.kind === 'manual').length, 2);
  await A.pull();
  assert.strictEqual(A.latestAuto().device, 'Phone', '最新的自動存檔是 B 的');
  assert.strictEqual(A.myAuto().floor, 3, 'A 自己那格還在');

  // 覆蓋：只能覆蓋自己存的格子；別台的 id 傳進來會變成開新格
  const mineId = A.manuals().find(x => A.isMine(x)).id;
  const otherId = A.manuals().find(x => !A.isMine(x)).id;
  A.saveManual({ floor: 6, hp: 500 }, mineId);
  assert.strictEqual(A.byId(mineId).floor, 6);
  A.saveManual({ floor: 6, hp: 500 }, otherId);
  assert.strictEqual(A.byId(otherId).floor, 5, '別台的格子不能蓋');
  assert.strictEqual(A.manuals().length, 3);
  await A.push();

  // 同時存：兩邊各自存、各自推，雙方的格子都留著
  A.saveManual({ floor: 7, hp: 400 });
  B.saveManual({ floor: 8, hp: 300 });
  await A.push(); await B.push();
  await A.pull();
  assert.strictEqual(A.manuals().length, 5);
  assert.deepStrictEqual(A.manuals().map(x => x.floor).slice(0, 2), [8, 7], '新的在前');

  // 手動存檔最多 99 格，超過擠掉最舊的
  for (let i = 0; i < 100; i++) A.saveManual({ floor: 1, hp: i });
  assert.strictEqual(A.manuals().length, 99);
  assert.ok(A.manualFull());
  assert.strictEqual(A.manuals()[0].hp, 99);

  // 舊格式搬家：舊版頁面寫的 saves/magictower.json 與根目錄 saves.json 併進新清單、推上去、刪掉舊檔
  const old = at => ({ v: 1, slots: { auto: { at, device: 'Old', floor: 9, hp: 600, data: { floor: 9, hp: 600 } }, s1: { at: at - 5, device: 'Old', floor: 2, hp: 1000, data: { floor: 2, hp: 1000 } } } });
  const t0 = (clock += 1000);
  files['saves/magictower.json'] = { content: enc(old(t0)), sha: 'old1' };
  files['saves.json'] = { content: enc(old(t0)), sha: 'old2' };
  const C = device('Laptop');
  r = await C.pull();
  assert.strictEqual(C.latestAuto().floor, 9, '舊的自動存檔要能「繼續遊戲」');
  assert.strictEqual(C.manuals().filter(x => x.floor === 2).length, 1, '兩個舊檔是同一份，不能重複');
  assert.ok(!files['saves/magictower.json'] && !files['saves.json'], '舊檔要刪掉');
  assert.ok(remote().list.some(x => x.floor === 9), '要推上新位置');

  // 本機舊格式：第一次跑新版時把 mt.saves 轉過來
  const D = device('OldBrowser', { 'mt.saves': JSON.stringify(old(t0)) });
  assert.strictEqual(D.latestAuto().floor, 9);
  assert.strictEqual(D.manuals().length, 1);

  // 離線：fetch 丟例外 → 狀態 offline，本機存檔照樣在
  const E = device('Offline');
  E.api = async () => { const e = new Error('net'); e.status = 0; throw e; };
  E.saveAuto({ floor: 1, hp: 1000 });
  await E.push();
  assert.strictEqual(E.status, 'offline');
  assert.strictEqual(E.myAuto().floor, 1);

  Date.now = realNow;
  console.log(`同步測試通過（遠端寫入 ${puts} 次）`);
})().catch(e => { console.error(e); process.exit(1); });
