/* 地圖連通檢查：假設門都打得開、怪都打得贏、鐵門會開，只有牆和 NPC（商店、國王）擋路，
   列出每層「永遠走不到」的格子。改地圖後跑 node tools/check_reach.js，應該要全部 OK。
   加 --after-talk：套用跟 NPC 對話後的地圖變化（例如國王讓路）再檢查一次 */
'use strict';
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
require(path.join(__dirname, '../js/core.js'));
const MT = globalThis.MT;

const st = MT.newGame();
if (process.argv.includes('--after-talk')) {
  st.floor = 2; MT.runScriptState(st, 'bard'); st.floor = 1;
}
const blocks = t => t === '##' || MT.isNpc(t);
const seen = new Set();
const q = [[1, MT.START.x, MT.START.y]];
seen.add(q[0].join(','));
while (q.length) {
  const [f, x, y] = q.shift();
  const t = MT.tile(st, f, x, y);
  const hop = (nf, code) => {
    const p = nf >= 1 && nf <= MT.TOP && MT.findTile(st, nf, code);
    if (p && !seen.has(nf + ',' + p)) { seen.add(nf + ',' + p); q.push([nf, p[0], p[1]]); }
  };
  if (t === 'UU') hop(f + 1, 'DD');
  if (t === 'DD') hop(f - 1, 'UU');
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const nx = x + dx, ny = y + dy, k = f + ',' + nx + ',' + ny;
    if (seen.has(k) || blocks(MT.tile(st, f, nx, ny))) continue;
    seen.add(k); q.push([f, nx, ny]);
  }
}
let bad = 0;
for (let f = 1; f <= MT.TOP; f++) {
  const miss = [];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    const t = st.maps[f][y][x];
    if (!blocks(t) && !seen.has(f + ',' + x + ',' + y)) miss.push(`${t}@${x},${y}`);
  }
  if (miss.length) { bad++; console.log(`F${f} 走不到 ${miss.length} 格：${miss.join(' ')}`); }
}
console.log(bad ? `有 ${bad} 層有走不到的格子` : '全部樓層都走得到');
process.exit(bad ? 1 : 0);
