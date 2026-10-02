/* 平衡檢查：貪婪＋一步前瞻的自動玩家。打得通就代表關卡可解（真人通常玩得比它好）。
   用法：node tools/solve.js [-v] */
'use strict';
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
require(path.join(__dirname, '../js/core.js'));
const MT = globalThis.MT;
const verbose = process.argv.includes('-v');
const clone = o => JSON.parse(JSON.stringify(o));
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function maxFloor(st) { return Math.max(...st.visited); }

// 把目前走得到的地方的免費東西全撿完（跨樓層），回傳走得到的格子集合
function collect(st) {
  for (;;) {
    let changed = false;
    const seen = new Set();
    const q = [[st.floor, st.x, st.y]];
    seen.add(q[0].join(','));
    const reach = [];
    while (q.length) {
      const [f, x, y] = q.shift();
      reach.push([f, x, y]);
      const t0 = MT.tile(st, f, x, y);
      const hop = (nf, code) => {
        if (nf < 1 || nf > MT.TOP) return;
        const p = MT.findTile(st, nf, code);
        if (!p) return;
        const k = nf + ',' + p[0] + ',' + p[1];
        if (!seen.has(k)) { seen.add(k); q.push([nf, p[0], p[1]]); if (!st.visited.includes(nf)) st.visited.push(nf); }
      };
      if (t0 === 'UU') hop(f + 1, 'DD');
      if (t0 === 'DD') hop(f - 1, 'UU');
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, t = MT.tile(st, f, nx, ny);
        const k = f + ',' + nx + ',' + ny;
        if (seen.has(k)) continue;
        if (t === '..' || t === 'UU' || t === 'DD') { seen.add(k); q.push([f, nx, ny]); }
        else if (MT.isItem(t)) {
          const sf = st.floor; st.floor = f;
          MT.pickup(st, t); MT.setTile(st, f, nx, ny, '..');
          st.floor = sf; changed = true;
        } else if (t === 'Om' && !st.flags.bardTalked) {
          MT.runScriptState(st, 'bard'); changed = true;
        }
      }
      // 踩觸發
      const tr = MT.TRIGGERS[f];
      if (tr) for (const key in tr) {
        const [tx, ty] = key.split(',').map(Number);
        if (tx === x && ty === y && !st.flags['trig:' + f + ':' + tr[key]]) {
          st.flags['trig:' + f + ':' + tr[key]] = 1; MT.runScriptState(st, tr[key]); changed = true;
        }
      }
    }
    if (!changed) return reach;
  }
}

function frontier(st, reach) {
  const set = new Set(reach.map(r => r.join(',')));
  const out = new Map();
  for (const [f, x, y] of reach) for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy, t = MT.tile(st, f, nx, ny);
    if (MT.isMonster(t) || MT.DOORS[t] || (MT.isNpc(t) && MT.NPCS[t].shop)) {
      const k = f + ',' + nx + ',' + ny;
      if (!out.has(k)) out.set(k, { f, x: nx, y: ny, t, from: [x, y] });
    }
  }
  // 門的另一側已經走得到就不用開
  for (const [k, c] of out) if (MT.DOORS[c.t]) {
    const opp = [c.x * 2 - c.from[0], c.y * 2 - c.from[1]];
    if (set.has(c.f + ',' + opp[0] + ',' + opp[1])) out.delete(k);
  }
  return [...out.values()];
}

// 局面評分：血量 − 已知怪物總傷害 × 係數 ＋ 鑰匙價值
function score(st) {
  let dmg = 0;
  const top = Math.min(MT.TOP, maxFloor(st) + 1);
  for (let f = 1; f <= top; f++) for (const row of st.maps[f]) for (const t of row) {
    if (!MT.isMonster(t)) continue;
    const c = MT.calc(st, t);
    dmg += c.damage == null ? 20000 : Math.min(c.damage, 20000);
  }
  const z = MT.zoneOf(maxFloor(st));
  return st.hp - dmg * 0.25 + st.keys.y * 40 * z + st.keys.b * 120 * z + st.keys.r * 300 * z + st.gold * 2;
}

function act(st, c) {
  st.floor = c.f; st.x = c.from[0]; st.y = c.from[1];
  const dir = c.x > st.x ? 'right' : c.x < st.x ? 'left' : c.y > st.y ? 'down' : 'up';
  const ev = MT.step(st, dir);
  if (ev.script) MT.runScriptState(st, ev.script);
  return ev;
}

function bestShop(st, shop) {
  let best = null, bs = -Infinity;
  for (const w of ['atk', 'def', 'hp']) {
    const s2 = clone(st); if (!MT.buy(s2, shop, w)) return null;
    const sc = score(s2); if (sc > bs) { bs = sc; best = w; }
  }
  return best;
}

let st = MT.newGame();
MT.runScriptState(st, MT.stepTrigger(st));
const log = [];
let turn = 0;
const floorLog = {};
while (!st.done && turn++ < 5000) {
  const reach = collect(st);
  const fr = frontier(st, reach);
  const mf = maxFloor(st);
  if (!floorLog[mf]) floorLog[mf] = `F${mf} 到達：HP ${st.hp} ATK ${st.atk} DEF ${st.def} 金 ${st.gold} 鑰 ${st.keys.y}/${st.keys.b}/${st.keys.r}`;
  // 商店
  const shops = fr.filter(c => MT.isNpc(c.t));
  let bought = false;
  for (const c of shops) {
    const shop = MT.NPCS[c.t].shop;
    if (shop === 'keys') {
      const needY = fr.some(d => d.t === 'Yd') && st.keys.y === 0;
      const needB = fr.some(d => d.t === 'Bd') && st.keys.b === 0;
      if (needB && MT.buy(st, 'keys', 'b')) { log.push('買藍鑰'); bought = true; }
      else if (needY && MT.buy(st, 'keys', 'y')) { log.push('買黃鑰'); bought = true; }
      continue;
    }
    const w = bestShop(st, shop);
    if (w && MT.buy(st, shop, w)) { log.push(`F${c.f} 祭壇買 ${w}`); bought = true; }
  }
  if (bought) continue;

  const cands = fr.filter(c => !MT.isNpc(c.t));
  let best = null, bestScore = -Infinity;
  const base = score(st);
  for (const c of cands) {
    if (MT.isMonster(c.t)) {
      const m = MT.MONSTERS[c.t];
      if (m.onBump && !st.flags['bump:' + c.t]) { best = c; bestScore = Infinity; break; }
      const cc = MT.calc(st, c.t);
      if (cc.damage == null || cc.damage >= st.hp) continue;
      if (cc.damage === 0) { best = c; bestScore = Infinity; break; }
    } else if (st.keys[MT.DOORS[c.t]] <= 0) continue;
    const s2 = clone(st);
    act(s2, c); collect(s2);
    const sc = score(s2);
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  if (!best) break;
  const hp0 = st.hp;
  const ev = act(st, best);
  if (verbose || MT.isMonster(best.t) && MT.MONSTERS[best.t].sp && MT.MONSTERS[best.t].sp.includes('boss'))
    log.push(`F${best.f} ${best.t}@${best.x},${best.y} ${ev.type} -${hp0 - st.hp} → HP ${st.hp} A${st.atk} D${st.def} $${st.gold} (${base.toFixed(0)}→${bestScore.toFixed(0)})`);
}
console.log(Object.values(floorLog).join('\n'));
console.log('---');
console.log(log.filter(l => verbose || /祭壇|DG|SR|M1|M2|鑰/.test(l)).join('\n'));
console.log('---');
console.log(st.done ? `通關！HP ${st.hp} ATK ${st.atk} DEF ${st.def} 金 ${st.gold} 擊倒 ${st.kills}　${MT.isTrueEnding(st) ? '★ 真結局' : '一般結局'}（日記 ${st.pages.length}/3、失落的音符 ${st.items.note ? '有' : '沒有'}）` : `卡住在 F${maxFloor(st)}（目前 F${st.floor}）：HP ${st.hp} ATK ${st.atk} DEF ${st.def} 金 ${st.gold} 鑰 ${JSON.stringify(st.keys)}`);
if (st.done) {
  const r = MT.rating(st);
  console.log(`評價分數 ${r.score}（生命 ${r.hp} ＋ 資源折算 ${r.bonus}）→ ${r.grade}　data.js 的 MT.RATING.base 目前是 ${MT.RATING.base}${r.score === MT.RATING.base ? '' : '，跟這次不一樣，要不要更新？'}`);
}
if (!st.done) {
  const reach = collect(st);
  for (const c of frontier(st, reach)) {
    const d = MT.isMonster(c.t) ? MT.calc(st, c.t).damage : '';
    console.log(`  前沿 F${c.f} ${c.t}@${c.x},${c.y} ${d}`);
  }
}
