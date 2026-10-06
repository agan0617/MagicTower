/* 鑰匙預算表（strategy-depth 4.1）：先算清楚再動地圖，不要用模擬試。
   每層沿主線（下樓梯→上樓梯鑰匙最少的那條路）逐段記帳：每過一道主線銅門之前，先把「不再開別的門就撿得到」的銅鑰匙加進來，
   手上要 ≥1 才過得了；空手進這層也要走得通（主線自給）。主線段落裡撿得到的鑰匙＝走廊鑰匙，其他＝房內鑰匙（開支線門才拿得到）。
   用法：node tools/keybudget.js [-v]   吃 MT_OVERRIDE（JSON）看某組設定；輸出每層：主線要幾把、走廊幾把、空手進來缺幾把、房內幾把、支線房間幾間 */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
if (process.env.MT_OVERRIDE) { const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } }; merge(MT, JSON.parse(process.env.MT_OVERRIDE)); }
const verbose = process.argv.includes('-v');
const st = MT.newGame();
const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const wall = t => t === '##' || t === 'Hw' || t === 'Cw';
const npcBlock = t => MT.isNpc(t) && t !== 'Om';

// 主線：下樓梯到上樓梯、鑰匙最少的路；回傳路上的門（照順序）
function mainPath(f) {
  const m = st.maps[f];
  let from = MT.findTile(st, f, 'DD'); if (f === MT.START.floor) from = [MT.START.x, MT.START.y];
  const to = MT.findTile(st, f, 'UU');
  if (!from || !to) return null;
  const COST = { Yd: 1, Bd: 100, Rd: 10000 }, dist = new Map([[from.join(), 0]]), prev = new Map(), q = [[from[0], from[1], 0]];
  while (q.length) {
    q.sort((a, b) => a[2] - b[2]);
    const [x, y, d] = q.shift();
    if (x === to[0] && y === to[1]) break;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H) continue;
      const t = m[ny][nx]; if (wall(t) || npcBlock(t)) continue;
      const nd = d + (COST[t] || 0), k = nx + ',' + ny;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd); prev.set(k, x + ',' + y); q.push([nx, ny, nd]);
    }
  }
  const path = [];
  for (let k = to.join(); k; k = prev.get(k)) { path.push(k.split(',').map(Number)); if (k === from.join()) break; }
  path.reverse();
  return { from, to, path, doors: path.filter(([x, y]) => MT.DOORS[m[y][x]]) };
}
// 從起點不開門（已開的主線門除外）走得到的格子
function region(f, starts, opened) {
  const m = st.maps[f], seen = new Set(starts.map(([x, y]) => y * 100 + x)), q = starts.slice();
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy, k = ny * 100 + nx; if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H || seen.has(k)) continue;
      const t = m[ny][nx]; if (wall(t)) continue;
      if (MT.DOORS[t] && !opened.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
function analyze(print) {
  const T = { need: 0, free: 0, room: 0, doors: 0, rooms: 0, short: 0 }, out = {};
  if (print) console.log('樓層  主線銅門  走廊鑰匙  空手缺  房內鑰匙  銅門數  支線房間' + (verbose ? '  段落（撿到／門）' : ''));
  for (let f = 1; f <= MT.TOP; f++) {
    const m = st.maps[f]; if (!m) continue;
    const mp = mainPath(f); if (!mp) continue;
    const opened = new Set(); let carry = 0, shortfall = 0, free = 0; const segs = [], shortSegs = [];
    let reg = region(f, [mp.from], opened);
    const counted = new Set();
    const take = r => { let n = 0; for (const k of r) { if (counted.has(k)) continue; counted.add(k); if (m[Math.floor(k / 100)][k % 100] === 'Yk') n++; } return n; };
    let need = 0;
    for (const [dx, dy] of mp.doors) {
      const t = m[dy][dx];
      const segCells = [...reg].filter(k => !counted.has(k));
      const got = take(reg); carry += got; free += got;
      if (t === 'Yd') { need++; if (carry <= 0) { shortfall++; shortSegs.push(segCells); } else carry--; segs.push(`${got}/銅`); }
      else segs.push(`${got}/${t === 'Bd' ? '銀' : '金'}`);
      opened.add(dy * 100 + dx);
      reg = region(f, [mp.from], opened);
    }
    const got = take(reg); carry += got; free += got; segs.push(`${got}/上樓`);
    let room = 0, doors = 0;
    for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) { const t = m[y][x]; if (t === 'Yk' && !counted.has(y * 100 + x)) room++; if (t === 'Yd') doors++; }
    const seenRoom = new Set(); let rooms = 0;
    for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) {
      if (m[y][x] !== 'Yd') continue;
      for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H) continue; const n = m[ny][nx]; if (wall(n) || MT.DOORS[n] || counted.has(ny * 100 + nx) || reg.has(ny * 100 + nx)) continue;
        const r = region(f, [[nx, ny]], new Set()); const key = [...r].sort().join(','); if (!seenRoom.has(key)) { seenRoom.add(key); rooms++; } }
    }
    T.need += need; T.free += free; T.room += room; T.doors += doors; T.rooms += rooms; T.short += shortfall;
    out[f] = { need, free, shortfall, room, doors, rooms, mainCells: counted, shortSegs, stairs: [mp.from, mp.to] };
    if (print) console.log(`${MT.floorName(f).padEnd(4)}  ${String(need).padStart(5)}     ${String(free).padStart(5)}     ${shortfall ? ('缺 ' + shortfall).padStart(5) : '    -'}    ${String(room).padStart(5)}    ${String(doors).padStart(5)}    ${String(rooms).padStart(5)}` + (verbose ? '   ' + segs.join(' → ') : ''));
  }
  return { T, floors: out };
}
if (require.main === module) {
  const { T } = analyze(true);
  const stock = ['keys', 'keys2'].map(s => MT.keyStockLeft(st, s, 'y'));
  const unlimited = stock.some(x => x === Infinity);
  const stockN = unlimited ? Infinity : stock.reduce((a, b) => a + Math.max(0, b), 0);
  console.log(`
合計：主線銅門 ${T.need}、走廊鑰匙 ${T.free}（起手 ${MT.START.keys.y}）、空手進層會缺 ${T.short} 把、房內鑰匙 ${T.room}、商人庫存 ${unlimited ? '不限量' : stockN}；銅門 ${T.doors} 扇、支線房間 ${T.rooms} 間`);
  const budget = MT.START.keys.y + T.free + T.room + stockN - T.need;
  console.log(`支線預算（全拿）＝ ${budget === Infinity ? '不限' : budget} 把，對 ${T.rooms} 間支線房 → ${budget === Infinity ? '全部開得了' : Math.round(budget / T.rooms * 100) + '%'}（目標 60～70%；房內鑰匙要開那間才拿得到，實際更緊）`);
  if (T.short) console.log('⚠ 有樓層空手進來上不了樓：那層的主線段落要補鑰匙（放在缺的那一段）');
}
module.exports = { analyze, st, MT };
