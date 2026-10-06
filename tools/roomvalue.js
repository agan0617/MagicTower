/* 銅門房間的收穫與代價（strategy-depth 4.2 房間分級用）：
   對每層每扇銅門，算門後那塊區域（不經過其他門）的道具價值、守在裡面的怪照「標準抵達能力」要掉多少血、淨值＝價值−代價，
   照淨值排序印出來，設計時照著把房間分成「很好／普通／不值得」三級。
   用法：node tools/roomvalue.js [起樓層] [迄樓層]   預設 11～19；吃 MT_OVERRIDE（JSON）看某組設定下的房間 */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
if (process.env.MT_OVERRIDE) { const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } }; merge(MT, JSON.parse(process.env.MT_OVERRIDE)); }
const [f0, f1] = [+(process.argv[2] || 11), +(process.argv[3] || 19)];
// 標準抵達能力：高手真人型（width 2、noise 500、seed 1）到每層時的攻防（3.2.74 的軌跡），只用來把守衛的代價換算成血
const ARRIVE = { 11: [139, 108], 12: [174, 126], 13: [196, 135], 14: [209, 182], 15: [221, 194], 16: [221, 197], 17: [248, 226], 18: [256, 241], 19: [264, 249] };
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
for (let f = f0; f <= f1; f++) {
  const m = st0.maps[f];
  if (!m) continue;
  const [atk, def] = ARRIVE[f] || [200, 150];
  const st = Object.assign({}, st0, { hp: 99999, atk, def, floor: f });
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
  for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) {
    if (m[y][x] !== 'Yd') continue;
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
    if (seenRoom.has(far.key)) { rows.push({ door: `${x},${y}`, dup: true }); continue; }   // 同一間房的第二扇門
    seenRoom.add(far.key);
    const value = far.items.reduce((a, t) => a + worth(t, f), 0);
    // 守衛代價：房裡每隻怪照標準能力算一次（大型怪多格只算一次）
    const seenMon = new Set(); let cost = 0; const guards = [];
    for (const t of far.mons) {
      const mm = MT.MONSTERS[t];
      if (mm.size > 1 && seenMon.has(t)) continue;
      seenMon.add(t);
      const c = MT.calc(st, t);
      const d = c.damage == null ? 9999 : c.damage;
      cost += d; guards.push(`${t}:${d}`);
    }
    rows.push({ door: `${x},${y}`, n: far.n, items: far.items, value, cost, net: value - cost, guards });
  }
  console.log(`\n${MT.floorName(f)}（標準抵達 攻 ${atk} 防 ${def}）`);
  const real = rows.filter(r => !r.main && !r.dup).sort((a, b) => b.net - a.net);
  for (const r of real) console.log(`  門 ${r.door.padEnd(5)} 淨值 ${String(r.net).padStart(6)}  價值 ${String(r.value).padStart(5)}  代價 ${String(r.cost).padStart(5)}  [${r.items.join(' ')}]  守衛 ${r.guards.join(' ') || '-'}`);
  const other = rows.filter(r => r.main || r.dup);
  if (other.length) console.log(`  （主線或同房的第二扇門：${other.map(r => r.door).join('  ')}）`);
}
