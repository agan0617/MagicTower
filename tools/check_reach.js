/* 地圖連通檢查：假設門都打得開、怪都打得贏、鐵門會開、暗牆與裂牆都找得到，只有牆和不會離開的 NPC（商店、國王）擋路，
   列出每層「永遠走不到」的格子。樓梯不能穿過（一踩就換樓層），只有從樓梯抵達時才能從那格往外走，
   所以「只接在樓梯旁邊、要穿過樓梯才到得了」的格子也會被抓出來。改地圖後跑 node tools/check_reach.js，應該要全部 OK。
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
// 說完話或交易完會離開的 NPC 不算擋路
const leaves = t => { const n = MT.NPCS[t]; return !!n && (!!n.deal || (n.talk && (MT.SCRIPTS[n.talk] || []).some(c => c[0] === 'leave'))); };
const blocks = t => t === '##' || (MT.isNpc(t) && !leaves(t));
const isStairs = t => t === 'UU' || t === 'DD';
const seen = new Set();      // 走得到（含走到樓梯上）
const arrived = new Set();   // 從樓梯抵達過的格子：可以從這裡往外走
const q = [[1, MT.START.x, MT.START.y, true]];
seen.add('1,' + MT.START.x + ',' + MT.START.y);
while (q.length) {
  const [f, x, y, byHop] = q.shift();
  const t = MT.tile(st, f, x, y);
  const hop = (nf, code) => {
    const p = nf >= MT.BOTTOM && nf <= MT.TOP && MT.findTile(st, nf, code);
    const k = p && nf + ',' + p[0] + ',' + p[1];
    if (p && !arrived.has(k)) { arrived.add(k); seen.add(k); q.push([nf, p[0], p[1], true]); }
  };
  if (t === 'UU') hop(f + 1, 'DD');
  if (t === 'DD') hop(f - 1, 'UU');
  if (isStairs(t) && !byHop) continue;   // 走到樓梯上就換樓層了，不能穿過去
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const nx = x + dx, ny = y + dy, k = f + ',' + nx + ',' + ny;
    if (seen.has(k) || blocks(MT.tile(st, f, nx, ny))) continue;
    seen.add(k); q.push([f, nx, ny, false]);
  }
}
let bad = 0;
for (let f = MT.BOTTOM; f <= MT.TOP; f++) {
  const miss = [];
  for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) {
    const t = st.maps[f][y][x];
    if (!blocks(t) && !seen.has(f + ',' + x + ',' + y)) miss.push(`${t}@${x},${y}`);
  }
  if (miss.length) { bad++; console.log(`${MT.floorName(f)} 走不到 ${miss.length} 格：${miss.join(' ')}`); }
}
console.log(bad ? `有 ${bad} 層有走不到的格子` : '全部樓層都走得到');
process.exit(bad ? 1 : 0);
