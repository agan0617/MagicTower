/* 鑰匙預算表（strategy-depth 4.1）：每層主線要幾把銅鑰匙、走廊不開門撿得到幾把、房間裡有幾把（開門退鑰匙）、支線房間幾間，
   以及整座塔的供需。先算清楚再動地圖，不要用模擬試。
   用法：node tools/keybudget.js   吃 MT_OVERRIDE（JSON）看某組設定 */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
if (process.env.MT_OVERRIDE) { const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } }; merge(MT, JSON.parse(process.env.MT_OVERRIDE)); }
const st = MT.newGame();
const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const outside = f => {
  const m = st.maps[f], seen = new Set(), q = [];
  for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) if (m[y][x] === 'UU' || m[y][x] === 'DD' || (f === MT.START.floor && x === MT.START.x && y === MT.START.y)) { seen.add(y * 100 + x); q.push([x, y]); }
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy, k = ny * 100 + nx; if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H || seen.has(k)) continue; const t = m[ny][nx]; if (t === '##' || t === 'Hw' || t === 'Cw' || MT.DOORS[t]) continue; seen.add(k); q.push([nx, ny]); } }
  return seen;
};
function stairNeed(f) {
  const m = st.maps[f]; let from = MT.findTile(st, f, 'DD'); if (f === MT.START.floor) from = [MT.START.x, MT.START.y]; const to = MT.findTile(st, f, 'UU');
  if (!from || !to) return { y: 0, b: 0 };
  const COST = { Yd: 1, Bd: 100, Rd: 10000 }, dist = new Map([[from.join(), 0]]), q = [[from[0], from[1], 0]];
  while (q.length) { q.sort((a, b) => a[2] - b[2]); const [x, y, d] = q.shift(); if (x === to[0] && y === to[1]) return { y: d % 100, b: Math.floor(d / 100) % 100 }; for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H) continue; const t = m[ny][nx]; if (t === '##' || t === 'Hw' || t === 'Cw' || (MT.isNpc(t) && t !== 'Om')) continue; const nd = d + (COST[t] || 0), k = nx + ',' + ny; if (dist.has(k) && dist.get(k) <= nd) continue; dist.set(k, nd); q.push([nx, ny, nd]); } }
  return { y: 0, b: 0 };
}
let T = { need: 0, free: 0, room: 0, doors: 0, rooms: 0 }, cumSlack = MT.START.keys.y;
console.log('樓層  主線要  走廊免費  房內退鑰匙  銅門數  支線房間數  走廊缺口  累計餘裕(只算走廊)');
for (let f = 1; f <= MT.TOP; f++) {
  const m = st.maps[f]; if (!m) continue;
  const o = outside(f), need = stairNeed(f).y;
  let free = 0, room = 0, doors = 0;
  for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) { const t = m[y][x]; if (t === 'Yk') (o.has(y * 100 + x) ? free++ : room++); if (t === 'Yd') doors++; }
  // 支線房間數：不在主線上、不含樓梯的銅門區域（同一間房多扇門算一間）
  const seenRoom = new Set(); let rooms = 0;
  for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) {
    if (m[y][x] !== 'Yd') continue;
    for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H) continue; const n = m[ny][nx]; if (n === '##' || n === 'Hw' || n === 'Cw' || MT.DOORS[n] || o.has(ny * 100 + nx)) continue;
      const seen = new Set([ny * 100 + nx]), q = [[nx, ny]]; while (q.length) { const [cx, cy] = q.pop(); for (const [ex, ey] of D4) { const ax = cx + ex, ay = cy + ey, k = ay * 100 + ax; if (ax < 0 || ay < 0 || ax >= MT.W || ay >= MT.H || seen.has(k)) continue; const t = m[ay][ax]; if (t === '##' || t === 'Hw' || t === 'Cw' || MT.DOORS[t]) continue; seen.add(k); q.push([ax, ay]); } }
      const key = [...seen].sort().join(','); if (!seenRoom.has(key)) { seenRoom.add(key); rooms++; } }
  }
  cumSlack += free - need;
  const gap = Math.max(0, need - free);
  T.need += need; T.free += free; T.room += room; T.doors += doors; T.rooms += rooms;
  console.log(`${MT.floorName(f).padEnd(4)}  ${String(need).padStart(4)}    ${String(free).padStart(5)}      ${String(room).padStart(5)}      ${String(doors).padStart(4)}     ${String(rooms).padStart(5)}      ${gap ? '缺 ' + gap : '  -'}        ${String(cumSlack).padStart(4)}`);
}
const stock = ['keys', 'keys2'].reduce((a, s) => a + (MT.keyStockLeft(st, s, 'y') === Infinity ? 0 : MT.keyStockLeft(st, s, 'y')), 0);
const unlimited = ['keys', 'keys2'].some(s => MT.keyStockLeft(st, s, 'y') === Infinity);
console.log(`\n合計：主線要 ${T.need}、走廊免費 ${T.free}（起手 ${MT.START.keys.y}）、房內退鑰匙 ${T.room}、商人庫存 ${unlimited ? '不限量' : stock}；銅門 ${T.doors} 扇、支線房間 ${T.rooms} 間`);
const sideBudget = MT.START.keys.y + T.free + T.room + (unlimited ? Infinity : stock) - T.need;
console.log(`支線預算（全拿）＝ ${sideBudget === Infinity ? '不限' : sideBudget} 把，對 ${T.rooms} 間支線房 → 開得了 ${sideBudget === Infinity ? '全部' : Math.round(sideBudget / T.rooms * 100) + '%'}（目標約 60～70%；房內退鑰匙要開那間才拿得到，實際預算更緊）`);
