/* 關卡設計稽核：改地圖或數值後跑 `node tools/audit.js`，有問題的項目會列出來（設計規則見 docs/DESIGN.md）。
   1. 白開的房間：只有一道門、裡面只放同色鑰匙（數量不超過門）和怪
   2. 多餘的門：兩側不經過任何門或怪就互通
   3. 擋路的 NPC：拿掉牠之後原本分開的兩塊會接起來（會說完話離開、會讓路的不算）
   4. 樓梯當岔路：樓梯旁的格子不經過樓梯走不通
   5. 暗牆在主線上：不走暗牆就到不了上樓梯
   6. 左右內容重複：鏡射位置放一樣的怪、道具、門（超過 40% 列出來）
   7. 免費道具：從樓梯不付任何代價就撿得到的（超過 3 個列出來）
   8. 白踩的回音地板：不打任何怪就走得到（這層還沒打過，回音是 0，一上樓先踩過去就沒有取捨了）
   加 --sim：再用高手自動玩家跑一次，列出每層到達時紅寶石／藍寶石的價值比（攻擊比防禦值錢幾倍）*/
'use strict';
const S = require('./sim.js');
const MT = S.MT;
const st = MT.newGame();
const W = MT.W, H = MT.H, D = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const isGate = t => MT.isMonster(t) || !!MT.DOORS[t] || t === 'Cw' || t === 'Hw' || t === 'Ec';
// 共鳴的格子：要付生命才走得過，跟門、怪一樣算閘門
const auraCell = (f, x, y) => MT.auraAt(st, f, x, y) > 0;
const leaves = t => { const n = MT.NPCS[t]; return !!n && (!!n.deal || (n.talk && (MT.SCRIPTS[n.talk] || []).some(c => c[0] === 'leave'))); };
const blocks = t => t === '##' || t === 'Gt' || (MT.isNpc(t) && !leaves(t) && t !== 'Om');
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const STAIR_DETOUR = 4;   // 樓梯兩側不經樓梯互通的最多步數（檢查 4）
let problems = 0;
const report = (title, rows) => { if (!rows.length) { console.log(`✔ ${title}`); return; } problems += rows.length; console.log(`✘ ${title}（${rows.length}）`); rows.forEach(r => console.log('    ' + r)); };

function flood(m, starts, ok) {
  const seen = new Set(starts.map(p => p.join())), q = starts.slice();
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of D) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (!inb(nx, ny) || seen.has(k) || !ok(m[ny][nx], nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
const floors = [];
for (let f = MT.BOTTOM; f <= MT.TOP; f++) floors.push(f);
const roots = f => {
  const r = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (['UU', 'DD'].includes(st.maps[f][y][x])) r.push([x, y]);
  if (f === MT.START.floor) r.push([MT.START.x, MT.START.y]);
  return r;
};

// 1. 白開的房間
{
  const rows = [];
  for (const f of floors) {
    const m = st.maps[f], seen = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = m[y][x];
      if (blocks(t) || MT.DOORS[t] || t === 'Cw' || t === 'Hw' || seen.has(x + ',' + y)) continue;
      const cells = [...flood(m, [[x, y]], c => !blocks(c) && !MT.DOORS[c] && c !== 'Cw' && c !== 'Hw')];
      cells.forEach(k => seen.add(k));
      const doors = new Set();
      for (const k of cells) { const [cx, cy] = k.split(',').map(Number); for (const [dx, dy] of D) { const nx = cx + dx, ny = cy + dy; if (inb(nx, ny) && MT.DOORS[m[ny][nx]]) doors.add(nx + ',' + ny); } }
      if (doors.size !== 1) continue;
      const ts = cells.map(k => { const [a, b] = k.split(',').map(Number); return m[b][a]; });
      if (ts.some(t => t === 'UU' || t === 'DD' || MT.isNpc(t))) continue;
      const [dk] = [...doors]; const [dx, dy] = dk.split(',').map(Number); const color = MT.DOORS[m[dy][dx]];
      const items = ts.filter(t => MT.isItem(t));
      if (items.every(t => MT.ITEMS[t].kind === 'key' && MT.ITEMS[t].key === color) && items.length <= 1)
        rows.push(`${MT.floorName(f)} ${m[dy][dx]}@${dk} 後面只有 ${items.join(' ') || '（沒東西）'}`);
    }
  }
  report('白開的房間', rows);
}
// 2. 多餘的門
{
  const rows = [];
  for (const f of floors) {
    const m = st.maps[f];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!MT.DOORS[m[y][x]]) continue;
      const sides = D.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => inb(a, b) && !blocks(m[b][a]) && !isGate(m[b][a]) && !auraCell(f, a, b));
      if (sides.length < 2) continue;
      const r = flood(m, [sides[0]], (c, a, b) => !(a === x && b === y) && !blocks(c) && !isGate(c) && !auraCell(f, a, b));
      if (sides.slice(1).every(p => r.has(p.join()))) rows.push(`${MT.floorName(f)} ${m[y][x]}@${x},${y}`);
    }
  }
  report('多餘的門', rows);
}
// 3. 擋路的 NPC
{
  const rows = [];
  for (const f of floors) {
    const m = st.maps[f];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = m[y][x];
      if (!MT.isNpc(t) || leaves(t) || t === 'Om') continue;
      const nb = D.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => inb(a, b) && !blocks(m[b][a]) && m[b][a] !== '##');
      if (nb.length < 2) continue;
      const r = flood(m, [nb[0]], (c, a, b) => !(a === x && b === y) && c !== '##' && !(MT.isNpc(c) && !leaves(c)));
      if (nb.slice(1).some(p => !r.has(p.join()))) rows.push(`${MT.floorName(f)} ${t}@${x},${y}`);
    }
  }
  report('擋路的 NPC', rows);
}
// 4. 樓梯當岔路
{
  const rows = [];
  for (const f of floors) {
    const m = st.maps[f];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!['UU', 'DD'].includes(m[y][x])) continue;
      // 裂牆、暗牆後面直接接樓梯是刻意的（敲開就是樓梯），不算岔路
      const nb = D.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => inb(a, b) && !blocks(m[b][a]) && m[b][a] !== 'Cw' && m[b][a] !== 'Hw');
      if (nb.length < 2) continue;
      // 光是「繞得到」不夠：3.1.0 的 7F／8F／10F／15F 都要繞 18～22 步、穿好幾扇門卻照樣通過（Ken 抓到）。
      // 兩側要在 STAIR_DETOUR 步內不經樓梯互通（繞過角落是 2 步、繞過 Boss 方塊或一格牆是 4 步）
      const dist = { [nb[0].join()]: 0 }, q = [nb[0]];
      while (q.length) {
        const [a, b] = q.shift();
        for (const [dx, dy] of D) {
          const na = a + dx, nb2 = b + dy, k = na + ',' + nb2;
          if (!inb(na, nb2) || (na === x && nb2 === y) || dist[k] != null) continue;
          const c = m[nb2][na];
          if (blocks(c) && c !== 'Gt') continue;
          dist[k] = dist[a + ',' + b] + 1; q.push([na, nb2]);
        }
      }
      const far = nb.slice(1).map(p => dist[p.join()]).filter(d => d == null || d > STAIR_DETOUR);
      if (far.length) rows.push(`${MT.floorName(f)} ${m[y][x]}@${x},${y}（不經樓梯要繞 ${far.map(d => d == null ? '∞' : d).join('／')} 步）`);
    }
  }
  report('樓梯當岔路（樓梯兩側要直接互通）', rows);
}
// 5. 暗牆在主線上
{
  const rows = [];
  for (const f of floors) {
    const m = st.maps[f], up = MT.findTile(st, f, 'UU'), from = f === MT.START.floor ? [MT.START.x, MT.START.y] : MT.findTile(st, f, 'DD');
    if (!up || !from || f === 0) continue;
    const r = flood(m, [from], c => (!blocks(c) || c === 'Gt') && c !== 'Hw');
    if (!r.has(up.join())) rows.push(`${MT.floorName(f)} 不走暗牆到不了上樓梯`);
  }
  report('暗牆不在主線上', rows);
}
// 6. 對稱：左右鏡射位置上放了一模一樣的怪、道具、門（牆壁對稱沒關係，內容一樣才等於「同一組選擇做兩次」）。
//    Boss 層中間擺 Boss，對稱是刻意的，不算
{
  const rows = [];
  for (const f of floors) {
    if (MT.NOFLY[f]) continue;
    const m = st.maps[f]; let same = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < 5; x++) {
      const a = m[y][x], b = m[y][W - 1 - x];
      if (a === '##' || a === '..' || b === '##' || b === '..') continue;
      n++; if (a === b) same++;
    }
    const p = n ? Math.round(same / n * 100) : 0;
    if (p > 40) rows.push(`${MT.floorName(f)} ${p}%（${same}/${n} 對）`);
  }
  report('左右內容相同 ≤ 40%', rows);
}
// 7. 免費道具
{
  const rows = [];
  for (const f of floors) {
    const m = st.maps[f];
    const r = flood(m, roots(f), (c, a, b) => !blocks(c) && !isGate(c) && !auraCell(f, a, b));
    const free = [...r].map(k => k.split(',').map(Number)).map(([a, b]) => m[b][a]).filter(t => MT.isItem(t) && t !== 'Mb');   // 怪物圖鑑擋在 1F 必經的路上、一定會撿，不是取捨，不算
    if (free.length > 3 && !MT.NOFLY[f]) rows.push(`${MT.floorName(f)} ${free.length} 個：${free.join(' ')}`);
  }
  report('免費道具 ≤ 3', rows);
}
// 8. 白踩的回音地板：從樓梯只開門、不打怪就走得到旁邊
{
  const rows = [];
  for (const f of floors) {
    const m = st.maps[f];
    const r = flood(m, roots(f), c => !blocks(c) && !MT.isMonster(c) && c !== 'Cw' && c !== 'Hw' && c !== 'Ec');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (m[y][x] !== 'Ec') continue;
      if (D.some(([dx, dy]) => r.has((x + dx) + ',' + (y + dy)))) rows.push(`${MT.floorName(f)} Ec@${x},${y}`);
    }
  }
  report('回音地板要先打過怪才到得了', rows);
}
// --sim：攻防價值比
if (process.argv.includes('--sim')) {
  const r = S.solveStrong({ width: 4 });
  console.log(`\n高手：${r.done ? '通關' : '卡住'} 分數 ${r.score}`);
  const trace = r.st.trace || {};
  for (const f of Object.keys(trace).map(Number).sort((a, b) => a - b)) {
    const m = /攻(\d+) 防(\d+)/.exec(trace[f]); if (!m) continue;
    const s2 = MT.newGame(); s2.atk = +m[1]; s2.def = +m[2]; s2.hp = 99999;
    const val = (stat, n) => {
      let d = 0;
      for (let g = f; g <= Math.min(MT.TOP, f + 1); g++) {
        const seen = new Set();
        for (const row of st.maps[g]) for (const t of row) {
          if (!MT.isMonster(t) || (MT.MONSTERS[t].sp || []).includes('invincible') || seen.has(t + g + Math.random())) continue;
          const a = MT.calc(s2, t).damage; s2[stat] += n; const b = MT.calc(s2, t).damage; s2[stat] -= n;
          if (a != null && b != null) d += (a - b) / (MT.monSize(t) ** 2);
        }
      }
      return d;
    };
    const z = MT.zoneOf(f), at = val('atk', MT.ZONE_VALUES.at[z - 1]), df = val('def', MT.ZONE_VALUES.df[z - 1]);
    console.log(`  ${MT.floorName(f).padEnd(3)} ${trace[f]}　紅寶石≈${Math.round(at)} 藍寶石≈${Math.round(df)} 血（攻／防 ${(at / Math.max(1, df)).toFixed(1)} 倍）`);
  }
}
console.log(problems ? `\n共 ${problems} 個問題` : '\n全部通過');
process.exit(problems ? 1 : 0);
