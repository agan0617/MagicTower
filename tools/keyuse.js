/* 鑰匙流向（strategy-depth）：跑一局真人型，印出每層開了幾扇門、買／賣幾把鑰匙、撿到幾把。
   用法：node tools/keyuse.js [--ahead all|blind] [--width N] [--noise N] [--seed S] [--skill X] */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
// 跟 bench.js 一樣吃 MT_OVERRIDE（JSON）覆蓋數值，看某組設定下的鑰匙流向
if (process.env.MT_OVERRIDE) { const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } };   // null＝清空成 {}（例如把 MAP_PATCH 整個拿掉） merge(MT, JSON.parse(process.env.MT_OVERRIDE)); }
const args = process.argv.slice(2);
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const ai = args.indexOf('--ahead'), ahead = ai >= 0 ? args[ai + 1] : null;
const ki = args.indexOf('--skill');
if (ki >= 0) S.setSkills([args[ki + 1]]);
const r = S.solveHuman({ width: num('--width', 2), noise: num('--noise', 500), seed: num('--seed', 1), ahead, log: true });
const per = {};
const row = f => (per[f] = per[f] || { open: { y: 0, b: 0, r: 0 }, buy: { y: 0, b: 0, r: 0 }, pick: { y: 0, b: 0, r: 0 } });
for (const e of S.logList(r.st)) {
  if (e.type === 'pick' && MT.ITEMS[e.t] && MT.ITEMS[e.t].kind === 'key') row(e.f).pick[MT.ITEMS[e.t].key]++;
  if (e.type === 'act' && e.a.kind === 'door') row(e.a.c.f).open[MT.DOORS[e.a.c.t]]++;
  if (e.type === 'act' && e.a.kind === 'buy' && ['y', 'b', 'r'].includes(e.a.what)) row(e.a.c.f).buy[e.a.what]++;
}
const fmt = o => `${o.y}/${o.b}/${o.r}`;
let tot = { open: { y: 0, b: 0, r: 0 }, buy: { y: 0, b: 0, r: 0 }, pick: { y: 0, b: 0, r: 0 } };
for (const f of Object.keys(per).map(Number).sort((a, b) => a - b)) {
  const p = per[f];
  for (const k of ['open', 'buy', 'pick']) for (const c of ['y', 'b', 'r']) tot[k][c] += p[k][c];
  console.log(`${MT.floorName(f).padEnd(4)} 開門 ${fmt(p.open).padEnd(7)} 撿 ${fmt(p.pick).padEnd(7)} 買 ${fmt(p.buy)}`);
}
console.log(`合計 開門 ${fmt(tot.open)}  撿 ${fmt(tot.pick)}  買 ${fmt(tot.buy)}  ${r.done ? '通關 ' + r.score + ' ' + r.grade : '沒過'}`);
