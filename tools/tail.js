/* 小範圍模擬（後段）：從 bench.js --snap F 存下來的局面（每局第一次到達 F 層）接著跑到通關，比較改後段數值（第 4 區的怪、Boss）前後的通關率。
   一局只跑最後幾層，幾十秒就能看一輪因果；起點是舊數值跑出來的，F 層以前就生效的改動會被低估，定案仍要用 bench.js 完整驗收。
   用法：node tools/bench.js --groups gen,pro,blind,rule --runs 8 --snap 16 --out base.jsonl
         node tools/tail.js base.jsonl [--mt '<JSON>'] [--jobs 12] [--out 檔]
   沒有存檔的局（還沒到 F 層就沒過）照原結果算沒通關 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const GROUPS = {   // 跟 bench.js 一樣
  gen: { width: 1, noise: 2000, ahead: null },
  pro: { width: 2, noise: 500, ahead: 'all' },
  blind: { width: 2, noise: 500, ahead: 'blind' },
  rule: { width: 2, noise: 500, ahead: 'blind', env: { MT_RULE: '1' } },
};
const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } };
const args = process.argv.slice(2);
if (args[0] === '--worker') {
  const [, file, line] = args;
  const rec = JSON.parse(fs.readFileSync(file, 'utf8').split('\n')[+line]);
  const G = GROUPS[rec.g];
  Object.assign(process.env, G.env || {});
  const S = require('./sim.js'), MT = S.MT;
  if (process.env.MT_OVERRIDE) merge(MT, JSON.parse(process.env.MT_OVERRIDE));
  S.setSkills([rec.skill]);
  const r = S.solveHuman({ width: G.width, noise: G.noise, seed: rec.seed, ahead: G.ahead, start: rec.snap });
  const st = r.st;
  process.stdout.write(JSON.stringify({ g: rec.g, skill: rec.skill, seed: rec.seed, done: !!r.done, score: r.score || 0, te: !!(r.done && MT.isTrueEnding(st)), floor: S.maxFloor(st), hp: st.hp, atk: st.atk, def: st.def, gold: st.gold, keys: st.keys }));
  process.exit(0);
}
const file = path.resolve(args[0]);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mt = opt('--mt', ''), jobs = +opt('--jobs', 12), outFile = opt('--out', '');
if (mt) { JSON.parse(mt); process.env.MT_OVERRIDE = mt; }
const recs = fs.readFileSync(file, 'utf8').split('\n').map((s, i) => [i, s.trim() ? JSON.parse(s) : null]).filter(([, r]) => r);
const todo = recs.filter(([, r]) => r.snap).map(([i]) => i);
const out = recs.filter(([, r]) => !r.snap).map(([, r]) => ({ g: r.g, skill: r.skill, seed: r.seed, done: r.done, score: r.score, floor: r.floor, keys: r.keys, nosnap: true }));
let running = 0, idx = 0; const t0 = Date.now();
const next = () => { while (running < jobs && idx < todo.length) { const i = todo[idx++]; running++;
  const p = spawn(process.execPath, [__filename, '--worker', file, String(i)], { cwd: path.join(__dirname, '..') });
  try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { /* 設不了就算了 */ }
  let buf = ''; p.stdout.on('data', d => buf += d); p.stderr.on('data', d => process.stderr.write(d));
  p.on('close', () => { running--; try { out.push(JSON.parse(buf)); } catch (e) { console.error('壞掉的一局', i, buf.slice(0, 200)); } if (idx < todo.length) next(); else if (!running) report(); }); } };
if (todo.length) next(); else report();
const median = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = a => (a.length ? Math.round(a.reduce((p, q) => p + q, 0) / a.length) : 0);
function report() {
  if (outFile) fs.writeFileSync(outFile, out.map(r => JSON.stringify(r)).join('\n') + '\n');
  const avg = {};
  for (const g of Object.keys(GROUPS)) {
    const a = out.filter(r => r.g === g); if (!a.length) continue;
    const w = a.filter(r => r.done);
    avg[g] = mean(a.map(r => (r.done ? r.score : 0)));
    const sk = ['absorb', 'reflect', 'double'].map(s => { const x = a.filter(r => r.skill === s); return s.slice(0, 1) + ' ' + Math.round(x.filter(r => r.done).length / Math.max(1, x.length) * 100) + '%'; }).join(' ');
    const fl = {}; for (const r of a) if (!r.done) fl[r.floor] = (fl[r.floor] || 0) + 1;
    console.log(`${g.padEnd(5)} 通關 ${w.length}/${a.length}＝${Math.round(w.length / a.length * 100)}%（${sk}）通關者中位數 ${median(w.map(r => r.score))}  平均（沒過算 0）${avg[g]}  沒過卡層 ${JSON.stringify(fl)}`);
  }
  const gap = (h, l) => (avg[h] ? ((avg[h] - avg[l]) / avg[h] * 100).toFixed(1) + '%' : '-');
  if (avg.pro && avg.blind) console.log(`主目標（高手 vs 盲高手）${gap('pro', 'blind')}  護欄 1（高手 vs 懂規則）${avg.rule ? gap('pro', 'rule') : '-'}  （${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
}
