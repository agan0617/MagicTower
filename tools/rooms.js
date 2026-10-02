/* 房間圖：把一層切成「不付代價就互通」的區域，印出區域編號圖、每個區域的內容，以及區域之間靠什麼相連
   （門、怪、裂牆、暗牆、NPC）。設計關卡時用來確認動線、鑰匙夠不夠、有沒有白開的房間。
   用法：node tools/rooms.js <樓層>（B1 用 0） */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
const f = Number(process.argv[2] || 1);
const st = MT.newGame();
const m = st.maps[f], W = MT.W, H = MT.H;
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const open = t => t === '..' || t === 'UU' || t === 'DD' || MT.isItem(t);
const id = [...Array(H)].map(() => Array(W).fill(-1));
const regions = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (id[y][x] >= 0 || !open(m[y][x])) continue;
  const r = regions.length, q = [[x, y]], cells = [];
  id[y][x] = r;
  while (q.length) {
    const [cx, cy] = q.shift(); cells.push([cx, cy]);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || id[ny][nx] >= 0 || !open(m[ny][nx])) continue;
      id[ny][nx] = r; q.push([nx, ny]);
    }
  }
  regions.push(cells);
}
const ch = r => (r < 26 ? String.fromCharCode(97 + r) : String.fromCharCode(65 + r - 26));
console.log('    ' + [...Array(W).keys()].map(x => String(x).padStart(2)).join(' '));
for (let y = 0; y < H; y++) console.log(String(y).padStart(2) + '  ' + m[y].map((t, x) => (id[y][x] >= 0 ? (MT.isItem(t) || t === 'UU' || t === 'DD' ? t : ' ' + ch(id[y][x])) : t === '##' ? '██' : t)).join(' '));
const start = new Set();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (['UU', 'DD'].includes(m[y][x]) || (f === MT.START.floor && x === MT.START.x && y === MT.START.y)) start.add(id[y][x]);
console.log('');
regions.forEach((cells, r) => {
  const items = cells.map(([x, y]) => m[y][x]).filter(t => t !== '..');
  const gates = new Map();
  for (const [x, y] of cells) for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const t = m[ny][nx];
    if (t === '##' || open(t)) continue;
    // 這個閘門另一邊連到哪些區域
    const other = new Set();
    for (const [ex, ey] of DIRS) { const ax = nx + ex, ay = ny + ey; if (ax >= 0 && ay >= 0 && ax < W && ay < H && id[ay][ax] >= 0 && id[ay][ax] !== r) other.add(ch(id[ay][ax])); }
    gates.set(`${t}@${nx},${ny}`, [...other].join('') || '-');
  }
  console.log(`${ch(r)}${start.has(r) ? '*' : ' '} ${String(cells.length).padStart(2)}格  ${items.join(' ') || '（空）'}　｜ ${[...gates].map(([g, o]) => `${g}→${o}`).join('  ')}`);
});
