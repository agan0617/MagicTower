/* 小範圍模擬（後期）：從存下來的「高手第一次到 16F」局面接著跑到通關，比較改參數前後的技能上限與 S。
   存檔由完整高手跑一次產生（每行 {skill, seed, snap}，snap＝sim 的局面）；改 Lv3 參數這類只影響後期的東西，用它幾十秒一輪。
   用法：node tools/late.js <存檔 jsonl> [--mt '<JSON>'] [--jobs 8] [--noise 500]
   注意：起點是舊參數跑出來的 16F 狀態，16F 以前就生效的改動（例如鐵壁 Lv3 在勇者 Lv22 就升得到）會被低估，定案仍要完整驗收 */
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const args = process.argv.slice(2);
const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } };
if (args[0] === '--worker') {
  const [, file, line, mt, noise, off] = args;
  const S = require('./sim.js'); const MT = S.MT;
  if (mt) merge(MT, JSON.parse(mt));
  const rec = JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n')[+line]);
  S.setSkills([rec.skill]);
  const r = S.solveHuman({ width: 2, noise: +noise, seed: rec.seed + 1000 * (+off || 0), ahead: 'all', start: rec.snap });
  const rt = r.done ? MT.rating(r.st) : null;
  process.stdout.write(JSON.stringify({ skill: rec.skill, seed: rec.seed, done: !!r.done, score: r.score || 0, te: !!(rt && rt.trueEnd), grade: rt ? rt.grade : '-', floor: r.st.floor }));
  process.exit(0);
}
const file = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mt = opt('--mt', ''), jobs = Number(opt('--jobs', 8)), noise = opt('--noise', '500'), outFile = opt('--out', '');   // --out：每局一行，拿來跟基準做同局配對比較
const off = opt('--offset', '0');   // --offset N：同一批存檔換一組雜訊種子（seed＋1000N），樣本加倍用
// 沒有存檔的局（還沒到起點樓層就死了）跳過
const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((s, i) => [i, JSON.parse(s).snap]).filter(([, s]) => s).map(([i]) => i), n = lines.length;
const out = []; let running = 0, idx = 0; const t0 = Date.now();
const next = () => { while (running < jobs && idx < n) { const i = lines[idx++]; running++;
  const p = spawn(process.execPath, [__filename, '--worker', file, String(i), mt, noise, off], { cwd: path.join(__dirname, '..') }); let buf = '';
  p.stdout.on('data', d => buf += d);
  p.on('close', () => { running--; try { out.push(JSON.parse(buf)); } catch (e) { console.error('壞掉的一局', i); } if (idx < n) next(); else if (!running) report(); }); } };
next();
const median = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function report() {
  if (outFile) fs.writeFileSync(outFile, out.map(r => JSON.stringify(r)).join('\n') + '\n');
  const med = {};
  for (const sk of ['absorb', 'reflect', 'double']) {
    const a = out.filter(r => r.skill === sk), w = a.filter(r => r.done), g = c => a.filter(r => r.grade === c).length;
    med[sk] = median(w.map(r => r.score));
    console.log(`${sk.padEnd(8)} 通關 ${w.length}/${a.length}  通關者中位數 ${med[sk]}  最高 ${Math.max(0, ...w.map(r => r.score))}  真結局 ${a.filter(r => r.te).length}  評價 S${g('S')} A${g('A')} B${g('B')} C${g('C')}`);
  }
  console.log(`上限順序 連擊 ${med.double} ≥ 反彈 ${med.reflect} ≥ 鐵壁 ${med.absorb}：${med.double >= med.reflect && med.reflect >= med.absorb ? '✓' : '✗'}  兩端差 ${Math.round((med.double - med.absorb) / med.double * 100)}%  （${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
}
