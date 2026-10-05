/* 自動玩家共用程式庫：三種程度的玩家，給 solve.js（平衡檢查、評價門檻）與 audit.js（關卡稽核）用。
   - weak（新手）：看到門有鑰匙就開、怪挑最便宜的打、祭壇只買生命、交易有錢就接
   - mid（一般）：貪婪＋一步前瞻（原本 tools/solve.js 的玩家）
   - strong（高手）：beam search，每一步保留評分最高的 B 個局面一路搜到通關
   - human（真人型）：同樣的 beam search，但只知道去過的樓層、每爬上新樓層就定案（像第一次玩、會存檔重來的真人）
   暗牆預設當牆（opt.secrets 才會走進去），所以評價基準不含隱藏房間。
   地圖上的事件：拿得到的道具、會自己說完話的 NPC、踩到的劇情都在 collect 裡自動處理（不花任何代價）；
   門、怪、商店、交易是要做決定的「動作」。 */
'use strict';
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
require(path.join(__dirname, '../js/core.js'));
const MT = globalThis.MT;
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const BUILD = process.env.MT_BUILD || 'bias';   // only＝祭壇只買對應能力；bias＝位能偏好對應能力（預設）；0＝不偏好
const BIAS = +process.env.MT_BIAS || 100;
let skillChoices = ['absorb', 'reflect', 'double'];   // 高手三種都試；setSkills 可以限定只走某一種

// 比 JSON 快的複製：地圖逐列 slice，其他淺層物件各自複製
function clone(st) {
  const o = Object.assign({}, st);
  o.keys = Object.assign({}, st.keys);
  o.items = Object.assign({}, st.items);
  o.equip = Object.assign({}, st.equip);
  o.shops = Object.assign({}, st.shops);
  o.flags = Object.assign({}, st.flags);
  o.echo = Object.assign({}, st.echo);   // 每層上一場的損失（回音地板）：各局面各自一份
  o.pages = st.pages.slice();
  o.layers = st.layers.slice();
  o.visited = st.visited.slice();
  o.maps = st.maps.map(m => (m ? m.map(r => r.slice()) : null));
  if (st.skill) o.skill = Object.assign({}, st.skill);   // 老琴師升級會直接改 skill.lv，不能共用
  if (st.talkAt) o.talkAt = st.talkAt.slice();
  return o;   // st.log 是串列（{p: 上一筆, e: 這一筆}），共用前面的部分，複製只要拷參考
}
// 路線紀錄（產生攻略用）：opt.log 時每個局面帶著自己走過的每一步
const note = (st, e) => { if (st.log !== undefined) st.log = { p: st.log, e }; };
function logList(st) {
  const out = [];
  for (let n = st.log; n; n = n.p) out.push(n.e);
  return out.reverse();
}
const maxFloor = st => Math.max(...st.visited);
const isTalker = t => MT.isNpc(t) && !MT.NPCS[t].shop && !MT.NPCS[t].deal && !MT.NPCS[t].level && !MT.NPCS[t].choose && !MT.NPCS[t].sage;
const NPC_ACT = n => n.shop || n.deal || n.level || n.choose;
// 走進這格要付生命：夾擊（目前生命的 1/3）、共鳴（固定值）、回音地板（這層上一場的損失）
const costly = (st, f, x, y) => MT.pincerAt(st, f, x, y) || MT.auraAt(st, f, x, y) > 0 || MT.tile(st, f, x, y) === 'Ec';

/* 把走得到的免費東西全撿完（跨樓層）：道具、NPC 對話、踩到的劇情。回傳走得到的格子 */
function collect(st, opt) {
  const secrets = opt && opt.secrets;
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
        if (nf < MT.BOTTOM || nf > MT.TOP) return;
        const p = MT.findTile(st, nf, code);
        if (!p) return;
        const k = nf + ',' + p[0] + ',' + p[1];
        if (!seen.has(k)) {
          seen.add(k); q.push([nf, p[0], p[1]]);
          if (!st.visited.includes(nf)) {
            st.visited.push(nf);
            // 記下第一次到這層時的能力（平衡用）
            st.trace = Object.assign({}, st.trace, { [nf]: `HP${st.hp} 攻${st.atk} 防${st.def} Lv${st.lv} 金${st.gold} 鑰${st.keys.y}/${st.keys.b}/${st.keys.r}` });
          }
        }
      };
      if (t0 === 'UU') hop(f + 1, 'DD');
      if (t0 === 'DD') hop(f - 1, 'UU');
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, t = MT.tile(st, f, nx, ny);
        const k = f + ',' + nx + ',' + ny;
        if (seen.has(k)) continue;
        // 夾擊、共鳴的那格不白走（要付生命，算成 frontier 的「pass」動作）；回音地板 Ec 不是 '..'，本來就不在這裡走
        if (t === '..' || t === 'UU' || t === 'DD') { if (!costly(st, f, nx, ny)) { seen.add(k); q.push([f, nx, ny]); } }
        else if (t === 'Hw' && secrets) { MT.setTile(st, f, nx, ny, '..'); st.secrets++; changed = true; }
        else if (MT.isItem(t) && !costly(st, f, nx, ny)) {
          const sf = st.floor; st.floor = f;
          const got = MT.pickup(st, t); MT.setTile(st, f, nx, ny, '..');
          st.floor = sf; changed = true;
          note(st, { type: 'pick', f, x: nx, y: ny, t });
          if (got.script) MT.runScriptState(st, got.script);
        } else if (t === 'Sg' && ['activate', 'up'].includes(MT.sagePreview(st))) {
          MT.sage(st); changed = true;   // 老琴師：鑑定免費、升級要付金幣（3.2.42），付得起就做
          note(st, { type: 'sage', f, x: nx, y: ny, lv: st.skill.lv });
        } else if (isTalker(t)) {
          const id = MT.npcScript(st, t);
          if (id && !MT.npcTalked(st, t)) {
            const sf = st.floor; st.floor = f; st.talkAt = [nx, ny];
            MT.runScriptState(st, id);
            if (!MT.npcTalked(st, t)) st.flags[MT.NPCS[t].flag || 'npc:' + t] = 1;   // 跟遊戲裡 MT.step 的 talk 一樣記成說過（sim 不走 MT.step，所以自己記）
            st.floor = sf; changed = true;
            note(st, { type: 'talk', f, x: nx, y: ny, t });
          }
        }
      }
      const tr = MT.TRIGGERS[f];
      if (tr) {
        const id = tr[x + ',' + y];
        if (id && !st.flags['trig:' + f + ':' + id]) {
          const sf = st.floor; st.floor = f;
          st.flags['trig:' + f + ':' + id] = 1; MT.runScriptState(st, id); changed = true;
          note(st, { type: 'trig', f, id });
          st.floor = sf;
        }
      }
    }
    if (!changed) return reach;
  }
}

/* 走得到的地方旁邊的門、怪（大型怪物一塊只算一次）、商店、交易 */
function frontier(st, reach, ban) {
  const set = new Set(reach.map(r => r.join(',')));
  const out = new Map();
  for (const [f, x, y] of reach) for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy, t = MT.tile(st, f, nx, ny);
    const isMon = MT.isMonster(t);
    // 夾擊、共鳴的空格（或道具）與回音地板也算「要付代價才過得去」的閘門
    const pin = (t === '..' || t === 'Ec' || MT.isItem(t)) && costly(st, f, nx, ny);
    if (!(isMon || pin || MT.DOORS[t] || t === 'Cw' || (MT.isNpc(t) && NPC_ACT(MT.NPCS[t])))) continue;
    let k = f + ',' + nx + ',' + ny;
    if (isMon && MT.monSize(t) > 1) { const o = MT.blockOrigin(st, f, nx, ny); k = f + ',' + o[0] + ',' + o[1]; }
    if (ban && ban.has(k)) continue;
    if (!out.has(k)) out.set(k, { k, f, x: nx, y: ny, t, from: [x, y] });
  }
  // 門的另一側已經走得到就不用開
  for (const [k, c] of out) if (MT.DOORS[c.t]) {
    const opp = [c.x * 2 - c.from[0], c.y * 2 - c.from[1]];
    if (set.has(c.f + ',' + opp[0] + ',' + opp[1])) out.delete(k);
  }
  return [...out.values()];
}

function act(st, c) {
  st.floor = c.f; st.x = c.from[0]; st.y = c.from[1];
  const dir = c.x > st.x ? 'right' : c.x < st.x ? 'left' : c.y > st.y ? 'down' : 'up';
  const ev = MT.step(st, dir);
  if (ev.script) MT.runScriptState(st, ev.script);
  return ev;
}

/* 一個「動作」：fight／door／buy（商店）／deal（交易）。回傳 false＝做不了 */
function doAction(st, a) {
  const hp0 = st.hp, ok = doAction0(st, a);
  if (ok) note(st, { type: 'act', a: { kind: a.kind, c: a.c, shop: a.shop, what: a.what, id: a.id, skill: a.skill }, hp0, hp: st.hp, gold: st.gold, exp: st.exp });
  return ok;
}
function doAction0(st, a) {
  // 跟 NPC 交易：人站到 NPC 旁邊（換樓層也要換位置，不然會被「瞬移」到別層的同一個座標）
  const goNpc = () => { st.floor = a.c.f; st.x = a.c.from[0]; st.y = a.c.from[1]; st.talkAt = [a.c.x, a.c.y]; };
  if (a.kind === 'buy') { goNpc(); return MT.buy(st, a.shop, a.what); }
  if (a.kind === 'deal') { goNpc(); return MT.acceptDeal(st, a.id); }
  if (a.kind === 'level') { goNpc(); return MT.buyLevel(st, a.id); }
  if (a.kind === 'choose') { goNpc(); MT.chooseSkill(st, a.skill); return true; }
  if (a.kind === 'break') { if (!st.items.chisel) return false; act(st, a.c); return true; }
  if (a.kind === 'pass') { const ev = act(st, a.c); return ev.type !== 'tooHurt' && st.hp > 0; }
  const t = a.c.t;
  if (MT.isMonster(t)) {
    const m = MT.MONSTERS[t];
    if (!(m.onBump && !st.flags['bump:' + t])) {
      const cc = MT.calc(st, t);
      if (cc.damage == null || cc.damage >= st.hp) return false;
    }
  } else if (MT.DOORS[t] && st.keys[MT.DOORS[t]] <= 0) return false;
  act(st, a.c);
  return true;
}

// 目前能做的所有動作
function actions(st, fr) {
  const out = [];
  for (const c of fr) {
    const t = c.t;
    if (MT.isNpc(t)) {
      const n = MT.NPCS[t];
      if (n.deal) { if (MT.dealOk(st, n.deal)) out.push({ kind: 'deal', id: n.deal, c }); continue; }
      if (n.level) { if (st.exp >= MT.levelCost(st)) out.push({ kind: 'level', id: n.level, c }); continue; }
      if (n.choose) { for (const sk of skillChoices) out.push({ kind: 'choose', skill: sk, c }); continue; }
      const shop = n.shop;
      // 鑰匙身上還有就不買（不然沒事做的時候會一直買來囤）
      if (shop === 'keys' || shop === 'keys2') { for (const w of ['y', 'b', 'r']) if (st.gold >= MT.SHOPS[shop][w] && st.keys[w] < 1) out.push({ kind: 'buy', shop, what: w, c }); continue; }
      // 照技能配點（3.2.70）：選了技能之後偏好那個技能對應的能力——鐵壁堆防、連擊堆攻、反彈堆血（真人會這樣玩；
      // 不這樣的話三種技能只差在公式，個性拉不開）。只買單一能力太極端（一般玩家幾乎全滅），預設改成位能加分
      const pref = BUILD === 'only' && st.skill ? { absorb: ['def'], double: ['atk'], reflect: ['hp'] }[st.skill.type] : null;
      if (st.gold >= MT.shopPrice(st, shop)) for (const w of pref || ['atk', 'def', 'hp']) out.push({ kind: 'buy', shop, what: w, c });
      continue;
    }
    if (t === 'Cw') { if (st.items.chisel > 0) out.push({ kind: 'break', c }); continue; }
    if (!MT.isMonster(t) && !MT.DOORS[t]) { out.push({ kind: 'pass', c }); continue; }
    if (MT.isMonster(t)) {
      const m = MT.MONSTERS[t];
      if (!(m.onBump && !st.flags['bump:' + t])) {
        const cc = MT.calc(st, t);
        if (cc.damage == null || cc.damage >= st.hp) continue;
      }
      out.push({ kind: 'fight', c });
    } else if (MT.DOORS[t]) { if (st.keys[MT.DOORS[t]] > 0) out.push({ kind: 'door', c }); }
  }
  return out;
}

/* 局面評分（位能）：生命＋資源 −「把目前看得到的怪全部打完要扣的血」。
   打一隻怪＝生命減少、剩餘傷害也減少，兩邊抵銷，所以只有真正的收穫（道具、能力、金幣）會讓分數上升。
   打不動的怪算一個很大的代價，所以讓牠變得打得動的攻擊力很值錢 */
/* 從這層的下樓梯走到上樓梯，最少要開幾扇門（各色分開算；怪物當走得過，鐵門也是）。
   真人一眼看得到上樓那扇門，會留鑰匙給它；自動玩家靠這個避免把主線要用的鑰匙花在支線上 */
function stairNeed(st, f) {
  const m = st.maps[f], W = MT.W, H = MT.H;
  let from = MT.findTile(st, f, 'DD');
  if (f === MT.START.floor) from = [MT.START.x, MT.START.y];
  const to = MT.findTile(st, f, 'UU');
  if (!from || !to) return null;
  const COST = { Yd: 1, Bd: 100, Rd: 10000 };
  const dist = new Map([[from.join(), 0]]);
  const q = [[from[0], from[1], 0]];
  while (q.length) {
    q.sort((a, b) => a[2] - b[2]);
    const [x, y, d] = q.shift();
    if (x === to[0] && y === to[1]) return { y: d % 100, b: Math.floor(d / 100) % 100, r: Math.floor(d / 10000) };
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const t = m[ny][nx];
      if (t === '##' || t === 'Hw' || t === 'Cw' || (MT.isNpc(t) && t !== 'Om')) continue;
      const nd = d + (COST[t] || 0), k = nx + ',' + ny;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd); q.push([nx, ny, nd]);
    }
  }
  return null;
}

// ahead：連還沒去過的下一層的怪也算進去（新手／一般／高手都偷看一層；真人型 human 不偷看，只算去過的樓層）；
// 'all'＝整座塔剩下的怪都算（玩過一次、知道後面有什麼的人，3.2.50 起用來模擬像 Ken 那樣的老手）
const GV = process.env.MT_GV != null ? +process.env.MT_GV : 1;   // 老手眼中一金幣／一經驗值多少生命（3 會囤到通關、0 會亂花，1 最像 Ken）
const GVN = +process.env.MT_GVN || 0;   // 沒看過整座塔的人眼中金幣／經驗的價值（0＝照舊 6／8）
const TE = process.env.MT_TE != null ? +process.env.MT_TE : 2500;
const CAP = +process.env.MT_CAP || 3000;   // 一隻怪最多算多少傷害

/* 這隻怪值不值得打（3.2.55）：拿開局的地圖算「把這格堵住，會少走到哪些格子」＝牠守著的東西。
   守著樓梯、NPC、劇情道具（日記、圖鑑、鑿子…）＝必經，傷害照算；
   只守著愛心、寶石、鑰匙、別的怪＝支線，以後的成本最多算到「那堆東西值多少」，
   太貴的就等於不打（不然模擬會把每隻怪都當成遲早要付的帳，幾乎全清；Ken 實際玩是沒好處的怪不打） */
const GUARD = process.env.MT_GUARD !== '0';
const PT = +process.env.MT_PT || 200;   // 一點攻／防約等於多少生命
let guardMap = null;
function guardValues() {
  if (guardMap) return guardMap;
  guardMap = {};
  const st0 = MT.newGame(), D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let f = 0; f <= MT.TOP; f++) {
    const m = st0.maps[f];
    if (!m) continue;
    const entries = [];
    for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) if (m[y][x] === 'UU' || m[y][x] === 'DD') entries.push([x, y]);
    if (f === MT.START.floor) entries.push([MT.START.x, MT.START.y]);
    const reach = (bx, by) => {
      const seen = new Set(), q = [];
      for (const [x, y] of entries) if (!(x === bx && y === by)) { seen.add(y * 100 + x); q.push([x, y]); }
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of D4) {
          const nx = x + dx, ny = y + dy, k = ny * 100 + nx;
          if (nx < 0 || ny < 0 || nx >= MT.W || ny >= MT.H || seen.has(k) || m[ny][nx] === '##' || (nx === bx && ny === by)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return seen;
    };
    const all = reach(-1, -1), g = {};
    for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) {
      if (!MT.isMonster(m[y][x])) continue;
      const r = reach(x, y);
      let v = 0;
      for (const k of all) {
        if (r.has(k)) continue;
        const t = m[Math.floor(k / 100)][k % 100];
        if (t === '..' || MT.DOORS[t]) continue;
        if (t === 'UU' || t === 'DD' || MT.isNpc(t)) { v = Infinity; break; }
        if (MT.isMonster(t)) { const mm = MT.MONSTERS[t]; if (mm.boss || mm.onDeath) { v = Infinity; break; } v += ((mm.gold || 0) + (mm.exp || 0)) * 3; continue; }
        const it = MT.ITEMS[t];
        if (!it) continue;   // 裂牆、暗牆、地板機關
        if (it.kind === 'hp') v += MT.zoneValue(it.zone, f);
        else if ((it.kind === 'atk' || it.kind === 'def') && it.zone) v += MT.zoneValue(it.zone, f) * PT;
        else if (it.kind === 'key') v += { y: 150, b: 450, r: 900 }[it.key];
        else if (it.kind === 'page' || it.kind === 'note') v += TE;   // 真結局道具照 TE 估價（3.2.71）：守門怪比這還貴就放棄真結局，像真人一樣量力而為
        else { v = Infinity; break; }
      }
      const mm = MT.MONSTERS[m[y][x]];
      if (mm.boss || mm.onDeath) v = Infinity;
      g[y * 100 + x] = v + ((mm.gold || 0) + (mm.exp || 0)) * 3;
    }
    guardMap[f] = g;
  }
  return guardMap;
}
function potential(st, ahead = true) {
  const top = ahead === 'all' ? MT.TOP : Math.min(MT.TOP, maxFloor(st) + (ahead ? 1 : 0));
  let dmg = 0;
  for (let f = 1; f <= top; f++) {
    const m = st.maps[f], seen = new Set();
    for (let y = 0; y < MT.H; y++) for (let x = 0; x < MT.W; x++) {
      const t = m[y][x];
      if (!MT.isMonster(t)) continue;
      if (MT.monSize(t) > 1) { if (seen.has(t)) continue; seen.add(t); }
      const mm = MT.MONSTERS[t];
      if ((mm.sp || []).includes('invincible')) continue;
      const c = MT.calc(st, t);
      let cap = CAP * MT.zoneOf(f);
      if (GUARD && ahead === 'all') { const gv0 = guardValues()[f]; const gw = gv0 && gv0[y * 100 + x]; if (gw != null) cap = Math.min(cap, gw); }
      dmg += c.damage == null ? cap : Math.min(c.damage, cap);
    }
  }
  const z = MT.zoneOf(maxFloor(st));
  // 鑰匙的價值：前期（還買不到）照稀缺估，買得到之後不超過「商人賣價×金幣價值」，免得一直買來囤
  const kv = (c, early) => (st.visited.includes(6) ? Math.min(early, MT.SHOPS.keys[c] * 5) : early);
  // 主線上樓還要的鑰匙不夠：重罰（等於「這條路走不通」）
  let short = 0;
  const mf = maxFloor(st);
  if (mf < MT.TOP) {
    const need = stairNeed(st, mf);
    if (need) short = Math.max(0, need.y - st.keys.y) + Math.max(0, need.b - st.keys.b) * 2 + Math.max(0, need.r - st.keys.r) * 4;
  }
  // 看整座塔的老手（ahead＝'all'）：手上的金幣、經驗值估得比較低（各 3），傾向早點換成能力（3.2.53：不然會囤到通關）
  const gv = ahead === 'all' ? GV : GVN || 6, ev = ahead === 'all' ? GV : GVN || 8;
  // 老手知道真結局要三頁日記＋失落的音符（19F 金門後面），會留金鑰匙去拿：每樣算 TE 點生命（3.2.55）
  const te = ahead === 'all' ? (st.pages.length + (st.items.note ? 1 : 0)) * TE : 0;
  // 音符還沒拿：手上留一把金鑰匙另外加分，不然一路上會把金鑰匙花在別的金門，到 19F 才發現打不開
  const keep = ahead === 'all' && !st.items.note && st.keys.r > 0 ? TE : 0;
  const sk = BUILD === 'bias' && st.skill && st.skill.lv > 0 ? st.skill.type : null;
  const lean = sk === 'absorb' ? st.def * BIAS : sk === 'double' ? st.atk * BIAS : sk === 'reflect' ? st.hp * BIAS / 300 : 0;
  return lean + te + keep + st.hp - dmg - short * 4000 + st.keys.y * kv('y', 150) + st.keys.b * kv('b', 450) + st.keys.r * kv('r', 900) + st.gold * gv + st.exp * ev + (st.items.chisel || 0) * 300 * z;
}

function newRun(opt) {
  const st = MT.newGame();
  if (opt && opt.log) st.log = null;
  const id = MT.stepTrigger(st);
  if (id) MT.runScriptState(st, id);
  return st;
}
const result = (st, extra) => Object.assign({ st, done: st.done, score: st.done ? MT.rating(st).score : null, grade: st.done ? MT.rating(st).grade : null }, extra || {});

/* 新手：門有鑰匙就開、怪挑最便宜的、祭壇只買生命、交易有錢就接、不找暗牆 */
function solveWeak(opt = {}) {
  const st = newRun();
  for (let turn = 0; !st.done && turn < 8000; turn++) {
    const reach = collect(st);
    let as = actions(st, frontier(st, reach, opt.ban));
    if (!as.length) break;
    // 新手只顧眼前：有最高樓層的事可做就先做那一層的
    const top = maxFloor(st), here = as.filter(a => a.c.f === top);
    if (here.length) as = here;
    const pick = as.find(a => a.kind === 'deal')
      || as.find(a => a.kind === 'buy' && a.what === 'hp')
      || as.find(a => a.kind === 'door')
      || as.filter(a => a.kind === 'fight').sort((a, b) => cost(st, a) - cost(st, b))[0]
      || as.find(a => a.kind === 'pass')   // 沒別的事做才硬走過夾擊／共鳴／回音地板
      || as.find(a => a.kind === 'buy' && (a.what === 'y' || a.what === 'b'));
    if (!pick) break;
    doAction(st, pick);
  }
  return result(st);
}
const cost = (st, a) => { const t = a.c.t, m = MT.MONSTERS[t]; return m.onBump && !st.flags['bump:' + t] ? -1 : MT.calc(st, t).damage; };

/* 一般：每一步試做每個動作、撿完免費的東西，挑位能最高的（商店一樣） */
function solveMid(opt = {}) {
  const st = newRun();
  for (let turn = 0; !st.done && turn < 8000; turn++) {
    const reach = collect(st, opt);
    const as = actions(st, frontier(st, reach, opt.ban));
    if (!as.length) break;
    let best = null, bs = -Infinity;
    for (const a of as) {
      if (a.kind === 'fight') { const m = MT.MONSTERS[a.c.t]; if (m.onBump && !st.flags['bump:' + a.c.t]) { best = a; break; } }
      const s2 = clone(st);
      if (!doAction(s2, a)) continue;
      collect(s2, opt);
      let sc = potential(s2);
      if (opt.noise) sc += (opt.rng() - 0.5) * opt.noise;
      if (sc > bs) { bs = sc; best = a; }
    }
    if (!best) break;
    doAction(st, best);
  }
  return result(st);
}

/* 高手：beam search。每一層保留位能最高的 width 個局面（同樣的盤面只留一個），一路展開到有人通關 */
function sig(st) {
  let s = st.hp + '|' + st.atk + '|' + st.def + '|' + st.gold + '|' + st.keys.y + st.keys.b + st.keys.r + '|';
  const top = Math.min(MT.TOP, maxFloor(st) + 1);
  for (let f = 1; f <= top; f++) s += st.maps[f].map(r => r.join('')).join('');
  return s;
}
function solveStrong(opt = {}) {
  const width = opt.width || 12;
  let beam = [newRun(opt)];
  collect(beam[0], opt);
  let best = null, depth = 0, last = beam;
  while (beam.length && depth++ < 3000) {
    last = beam;
    const next = [], seen = new Set();
    for (const st of beam) {
      const as = actions(st, frontier(st, collect(st, opt), opt.ban));
      for (const a of as) {
        const s2 = clone(st);
        if (!doAction(s2, a)) continue;
        collect(s2, opt);
        if (s2.done) { const sc = MT.rating(s2).score; if (!best || sc > best.score) best = { st: s2, score: sc }; continue; }
        const g = sig(s2);
        if (seen.has(g)) continue;
        seen.add(g);
        s2._p = potential(s2, opt.ahead == null ? true : opt.ahead);
        next.push(s2);
      }
    }
    next.sort((a, b) => b._p - a._p);
    // 保留多樣性：照「最高到過的樓層」分組，每組至少留幾個，免得整排都是同一種走法（例如都把鑰匙花光）
    const keep = next.slice(0, width), groups = new Map();
    for (const s of next) { const k = maxFloor(s) + ':' + (s.keys.y > 0 ? 1 : 0); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    for (const g of groups.values()) for (const s of g.slice(0, Math.max(1, width >> 2))) if (!keep.includes(s)) keep.push(s);
    beam = keep;
    // 已經有人通關、而且剩下的局面生命都比他少很多，就不用再搜了
    if (best && beam.every(s => s.hp + s.gold * 6 < best.score * 0.5)) break;
  }
  if (best) return result(best.st);
  // 沒人通關：回報卡住前走得最遠（最高樓層、再比位能）的局面
  const far = last.slice().sort((a, b) => maxFloor(b) - maxFloor(a) || b._p - a._p)[0];
  return result(far || newRun());
}

/* 真人型：模擬「第一次玩、會存檔重來」的真人。跟高手一樣用 beam search，但
   - 只知道去過的樓層：評分不偷看還沒上去的那一層（potential 的 ahead＝false）
   - 不能回到過去：最好的局面一爬上新樓層就「存檔」，beam 只留那一個局面往下走，
     之前的決定（鑰匙花在哪、先拿攻還是防）都定了，到了上面才發現不對也改不回來
   width＝在同一段裡肯試幾種走法（會讀檔重來幾次）。高手能保留不同的歷史一路比到通關，這裡不行
   noise＝判斷失準的程度：每個局面的評分加上 ±noise/2 的亂數（真人不會精算，常把差不多的兩步看反）；
   seed 固定亂數，同一組參數跑出來一樣 */
function rngOf(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function solveHuman(opt = {}) {
  const width = opt.width || 4, noise = opt.noise || 0, rng = rngOf(opt.seed || 1);
  let beam = [newRun(opt)];
  collect(beam[0], opt);
  let committed = maxFloor(beam[0]), best = null, depth = 0, last = beam;
  while (beam.length && depth++ < 4000) {
    last = beam;
    const next = [], seen = new Set();
    for (const st of beam) {
      const as = actions(st, frontier(st, collect(st, opt), opt.ban));
      for (const a of as) {
        const s2 = clone(st);
        if (!doAction(s2, a)) continue;
        collect(s2, opt);
        if (s2.done) { const sc = MT.rating(s2).score; if (!best || sc > best.score) best = { st: s2, score: sc }; continue; }
        const g = sig(s2);
        if (seen.has(g)) continue;
        seen.add(g);
        s2._p = potential(s2, opt.ahead == null ? false : opt.ahead) + (noise ? (rng() - 0.5) * noise : 0);
        next.push(s2);
      }
    }
    next.sort((a, b) => b._p - a._p);
    // 最好的那個局面到了新樓層：存檔，從這裡重新開始試
    if (next.length && maxFloor(next[0]) > committed) { committed = maxFloor(next[0]); beam = [next[0]]; continue; }
    const keep = next.slice(0, width), groups = new Map();
    for (const s of next) { const k = maxFloor(s) + ':' + (s.keys.y > 0 ? 1 : 0); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    for (const g of groups.values()) for (const s of g.slice(0, Math.max(1, width >> 2))) if (!keep.includes(s)) keep.push(s);
    beam = keep;
    if (best && beam.every(s => s.hp + s.gold * 6 < best.score * 0.5)) break;
  }
  if (best) return result(best.st);
  const far = last.slice().sort((a, b) => maxFloor(b) - maxFloor(a) || b._p - a._p)[0];
  return result(far || newRun());
}

function setSkills(list) { skillChoices = list; }
module.exports = { setSkills, logList, newRun, MT, clone, collect, frontier, actions, doAction, potential, solveWeak, solveMid, solveStrong, solveHuman, maxFloor };
