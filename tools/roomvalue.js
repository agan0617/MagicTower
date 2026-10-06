/* 銅門房間的收穫與代價（strategy-depth 4.2 房間分級用；audit.js 規則 1 也用）：
   對每層每扇銅門，算門後那塊區域（不經過其他門）的道具價值、守在裡面的怪照「標準抵達能力」要掉多少血、淨值＝價值−代價，
   照淨值排序印出來，設計時照著把房間分成「很好／普通／不值得」三級。
   用法：node tools/roomvalue.js [起樓層] [迄樓層]   預設 11～19；吃 MT_OVERRIDE（JSON）看某組設定下的房間
   被 require 時：analyzeFloor(f) 回傳該層每扇銅門的資料 */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
if (process.env.MT_OVERRIDE) { const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } }; merge(MT, JSON.parse(process.env.MT_OVERRIDE)); }
// 標準抵達能力：高手真人型（width 2、noise 500、seed 1）到每層時的攻防（3.2.74 的軌跡），只用來把守衛的代價換算成血；前兩區用模擬的新手／一般中間值
const ARRIVE = { 1: [10, 10], 2: [12, 10], 3: [16, 10], 4: [44, 30], 5: [55, 40], 6: [65, 48], 7: [83, 64], 8: [100, 73], 9: [114, 78], 10: [114, 78], 11: [139, 108], 12: [174, 126], 13: [196, 135], 14: [209, 182], 15: [221, 194], 16: [221, 197], 17: [248, 226], 18: [256, 241], 19: [264, 249] };
const HP_AT = f => (MT.zoneOf(f) >= 4 ? 3000 : MT.zoneOf(f) === 3 ? 1500 : MT.zoneOf(f) === 2 ? 800 : 400);   // 吸血怪照目前生命比例吸，血要給合理值
const PT = +process.env.MT_PT || 200;
const worth = (t, f) => {
  const it = MT.ITEMS[t];
  if (!it) return 0;
  if (it.kind === 'hp') return MT.zoneValue(it.zone, f);
  if (it.kind === 'atk' || it.kind === 'def') return (it.zone ? MT.zoneValue(it.zone, f) : it.value) * PT;
  if (it.kind === 'key') return { y: 150, b: 450, r: 900 }[it.key];
  return 2500;   // 日記、音符、道具
};
const st0 = MT.newGame();
const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
/* 回傳 [{door:'x,y', main:true}|{door, dup:true}|{door, n, items, mons, value, cost, net, guards, hasKey, hasStory}] */
/* statsFloor：用哪一層的標準抵達能力算守衛代價。設計用抵達當層（看「現在值不值得」）；稽核用該區最後一層（看「等變強回來也不值得」才算陷阱） */
function analyzeFloor(f, statsFloor, skill) {
  const m = st0.maps[f];
  if (!m) return [];
  const sf = statsFloor || f;
  const [atk, def] = ARRIVE[sf] || [200, 150];
  // skill：用哪種配點算守衛代價（5.1 房間分型）。鐵壁多防少攻、連擊多攻少防、反彈多血，各照技能 Lv2 算
  const bias = { absorb: [-10, 20, 0], double: [20, -10, 0], reflect: [0, 0, 600] }[skill] || [0, 0, 0];
  const st = Object.assign({}, st0, { hp: HP_AT(sf) + bias[2], atk: atk + bias[0], def: def + bias[1], floor: f, skill: skill ? { type: skill, lv: 2 } : st0.skill });
  const entries = new Set();
  for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) if (m[y][x] === 'UU' || m[y][x] === 'DD') entries.add(y * 100 + x);
  if (f === MT.START.floor) entries.add(MT.START.y * 100 + MT.START.x);
  const side = (sx, sy) => {
    const seen = new Set([sy * 100 + sx]), q = [[sx, sy]], items = [], mons = [];
    let entry = false;
    while (q.length) {
      const [cx, cy] = q.pop();
      const t = m[cy][cx];
      if (entries.has(cy * 100 + cx)) entry = true;
      if (MT.ITEMS[t]) items.push(t); else if (MT.isMonster(t)) mons.push(t);
      for (const [dx, dy] of D4) {
        const nx = cx + dx, ny = cy + dy, k = ny * 100 + nx;
        if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H || seen.has(k)) continue;
        const n = m[ny][nx];
        if (n === '##' || n === 'Hw' || n === 'Cw' || MT.DOORS[n]) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return { items, mons, entry, n: seen.size, key: [...seen].sort().join(',') };
  };
  const rows = [], seenRoom = new Set();
  const mainSet = new Set(S.mainDoors(st0, f));   // 主線上的門（兩道主線門之間的走廊不是房間）
  for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) {
    if (m[y][x] !== 'Yd') continue;
    if (mainSet.has(x + ',' + y)) { rows.push({ door: `${x},${y}`, main: true }); continue; }
    const sides = [];
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H) continue;
      const n = m[ny][nx];
      if (n === '##' || n === 'Hw' || n === 'Cw' || MT.DOORS[n]) continue;
      sides.push(side(nx, ny));
    }
    const far = sides.filter(s => !s.entry).sort((a, b) => a.n - b.n)[0];
    if (!far) { rows.push({ door: `${x},${y}`, main: true }); continue; }
    if (seenRoom.has(far.key)) { rows.push({ door: `${x},${y}`, dup: true }); continue; }
    seenRoom.add(far.key);
    const value = far.items.reduce((a, t) => a + worth(t, f), 0);
    const seenMon = new Set(); let cost = 0; const guards = [];
    for (const t of far.mons) {
      const mm = MT.MONSTERS[t];
      if (mm.size > 1 && seenMon.has(t)) continue;
      seenMon.add(t);
      const c = MT.calc(st, t);
      const d = c.damage == null ? 9999 : c.damage;
      cost += d; guards.push(`${t}:${d}`);
    }
    rows.push({ door: `${x},${y}`, n: far.n, items: far.items, mons: far.mons, value, cost, net: value - cost, guards,
      hasKey: far.items.some(t => MT.ITEMS[t].kind === 'key'), hasStory: far.items.some(t => ['page', 'note', 'tool'].includes(MT.ITEMS[t].kind)) });
  }
  return rows;
}
if (require.main === module && process.argv.includes('--skills')) {
  // 三種配點各自的淨值表（5.1 房間分型用）：看哪間房只對某種配點划算
  const [f0, f1] = [+(process.argv[2] || 11), +(process.argv[3] || 19)];
  for (let f = f0; f <= f1; f++) {
    const by = {}; for (const sk of ['absorb', 'reflect', 'double']) for (const r of analyzeFloor(f, f, sk)) if (!r.main && !r.dup) (by[r.door] = by[r.door] || { items: r.items, guards: r.mons })[sk] = r.net;
    const doors = Object.keys(by); if (!doors.length) continue;
    console.log(`
${MT.floorName(f)}  門      鐵壁    反彈    連擊   道具／守衛`);
    for (const d of doors) { const r = by[d]; const vals = [r.absorb, r.reflect, r.double]; const best = Math.max(...vals), worst = Math.min(...vals); const tag = best > 0 && worst < 0 ? ' ◆分型' : best - worst > 800 ? ' ◇有差' : ''; console.log(`  ${d.padEnd(6)} ${String(r.absorb).padStart(6)} ${String(r.reflect).padStart(6)} ${String(r.double).padStart(6)}   [${r.items.join(' ')}] 守 ${[...new Set(r.guards)].join(' ')}${tag}`); }
  }
} else if (require.main === module) {
  const [f0, f1] = [+(process.argv[2] || 11), +(process.argv[3] || 19)];
  for (let f = f0; f <= f1; f++) {
    const rows = analyzeFloor(f);
    if (!rows.length) continue;
    const [atk, def] = ARRIVE[f] || [200, 150];
    console.log(`\n${MT.floorName(f)}（標準抵達 攻 ${atk} 防 ${def}）`);
    const real = rows.filter(r => !r.main && !r.dup).sort((a, b) => b.net - a.net);
    for (const r of real) console.log(`  門 ${r.door.padEnd(5)} 淨值 ${String(r.net).padStart(6)}  價值 ${String(r.value).padStart(5)}  代價 ${String(r.cost).padStart(5)}  [${r.items.join(' ')}]  守衛 ${r.guards.join(' ') || '-'}`);
    const other = rows.filter(r => r.main || r.dup);
    if (other.length) console.log(`  （主線或同房的第二扇門：${other.map(r => r.door).join('  ')}）`);
  }
}
module.exports = { analyzeFloor, ARRIVE, st0 };   // st0 讓外面的工具改地圖後重算
