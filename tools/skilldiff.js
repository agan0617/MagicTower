/* 三選一技能的「選擇差異」（strategy-depth 技能標準）：高手用三種技能各跑幾局，比較
   (1) 開過的銅門集合兩兩重疊（|交集|／|較小的那組|，同種子配對，取平均；目標 ≤75%）
   (2) 祭壇購買偏好：鐵壁買防、連擊買攻、反彈買血各占該技能購買次數的比例（目標 ≥50%；只算技能生效後的購買）
   用法：node tools/skilldiff.js [--seeds N（預設 8）] [--jobs J（預設 6）]   吃 MT_OVERRIDE（JSON） */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const args = process.argv.slice(2);
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const SKILLS = ['absorb', 'reflect', 'double'];
if (args[0] === '--worker') {
  const [, skill, seed] = args;
  const S = require('./sim.js'); const MT = S.MT;
  if (process.env.MT_OVERRIDE) { const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } }; merge(MT, JSON.parse(process.env.MT_OVERRIDE)); }
  S.setSkills([skill]);
  const r = S.solveHuman({ width: 2, noise: 500, seed: +seed, ahead: 'all', log: true });
  // 祭壇偏好只算技能生效之後（12F 老琴師鑑定、lv ≥ 1）的購買：10F 才選技能，4F 祭壇大半是選技能之前買的，算進去等於量雜訊（3.3.1）
  const doors = [], buys = { atk: 0, def: 0, hp: 0 }, buysAll = { atk: 0, def: 0, hp: 0 };
  let lv = 0;
  for (const e of S.logList(r.st)) {
    if (e.type === 'sage') lv = e.lv;
    if (e.type === 'act' && e.a.kind === 'door' && MT.DOORS[e.a.c.t] === 'y') doors.push(e.a.c.f + ':' + e.a.c.x + ',' + e.a.c.y);
    if (e.type === 'act' && e.a.kind === 'buy' && ['atk', 'def', 'hp'].includes(e.a.what)) { buysAll[e.a.what]++; if (lv >= 1) buys[e.a.what]++; }
  }
  process.stdout.write(JSON.stringify({ skill, seed: +seed, done: !!r.done, score: r.score || 0, doors, buys, buysAll }));
  process.exit(0);
}
const seeds = num('--seeds', 8), jobs = num('--jobs', 6);
const queue = []; for (const sk of SKILLS) for (let s = 1; s <= seeds; s++) queue.push([sk, s]);
const out = []; let running = 0, idx = 0;
function next() {
  while (running < jobs && idx < queue.length) {
    const [sk, s] = queue[idx++]; running++;
    const p = spawn(process.execPath, [__filename, '--worker', sk, String(s)], { cwd: path.join(__dirname, '..') });
    let buf = ''; p.stdout.on('data', d => { buf += d; });
    p.on('close', () => { running--; try { out.push(JSON.parse(buf)); } catch (e) { console.error('壞掉的一局', sk, s); } if (idx < queue.length) next(); else if (!running) report(); });
  }
}
next();
function report() {
  const by = {}; for (const r of out) (by[r.skill] = by[r.skill] || []).push(r);
  console.log(`高手三種技能各 ${seeds} 局（同種子配對）`);
  for (const sk of SKILLS) {
    const a = by[sk] || []; const b = a.reduce((acc, r) => { for (const k in r.buys) acc[k] += r.buys[k]; return acc; }, { atk: 0, def: 0, hp: 0 });
    const tot = b.atk + b.def + b.hp || 1; const pref = { absorb: 'def', double: 'atk', reflect: 'hp' }[sk];
    const ba = a.reduce((acc, r) => { for (const k in r.buysAll) acc[k] += r.buysAll[k]; return acc; }, { atk: 0, def: 0, hp: 0 }), ta = ba.atk + ba.def + ba.hp || 1;
    console.log(`  ${sk.padEnd(8)} 通關 ${a.filter(r => r.done).length}/${a.length}  通關者分數中位數 ${median(a.filter(r => r.done).map(r => r.score))}  技能生效後的祭壇 攻 ${Math.round(b.atk / tot * 100)}% 防 ${Math.round(b.def / tot * 100)}% 血 ${Math.round(b.hp / tot * 100)}%（${b.atk + b.def + b.hp} 次；該技能偏好 ${pref} ${Math.round(b[pref] / tot * 100)}%，目標 ≥50%）  全部購買 ${ta} 次、偏好 ${Math.round(ba[pref] / ta * 100)}%`);
  }
  const pairs = [['absorb', 'reflect'], ['absorb', 'double'], ['reflect', 'double']];
  for (const [x, y] of pairs) {
    const ov = [];
    for (let s = 1; s <= seeds; s++) {
      const A = (by[x] || []).find(r => r.seed === s), B = (by[y] || []).find(r => r.seed === s);
      if (!A || !B || !A.doors.length || !B.doors.length) continue;
      const sa = new Set(A.doors), inter = B.doors.filter(d => sa.has(d)).length;
      ov.push(inter / Math.min(A.doors.length, B.doors.length));
    }
    console.log(`  開門重疊 ${x} vs ${y}：${Math.round(mean(ov) * 100)}%（目標 ≤75%，${ov.length} 對）`);
  }
}
const mean = a => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0);
const median = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
