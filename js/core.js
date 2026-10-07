/* 魔塔核心規則：狀態、移動、戰鬥、撿道具、開門、劇本的狀態指令。不碰畫面，node 解題器也用這支。 */
(function (MT) {
  'use strict';

  const W = 11, H = 15;
  const clone = o => JSON.parse(JSON.stringify(o));
  // 地圖字串→二維陣列。給樓層索引時套 MT.MAP_PATCH（調平衡期間的地圖改動，正式版會直接改回地圖字串）
  const parseFloor = (rows, f) => {
    const m = rows.map(r => r.split(' '));
    const P = MT.MAP_PATCH;
    if (P && f != null) for (const k in P) { const [ff, xy] = k.split(':'); if (+ff === f) { const [x, y] = xy.split(',').map(Number); m[y][x] = P[k]; } }
    return m;
  };

  MT.W = W; MT.H = H;
  // 存檔格式版本：2.0.0 地圖由 11×11 加高成 11×15（v2）；3.0.0 改成 20 層、地圖全部重畫（v3），舊存檔讀不了
  MT.SAVE_V = 3;
  MT.canLoad = data => !!data && data.v === MT.SAVE_V;

  MT.newGame = function () {
    const s = MT.START;
    return {
      v: MT.SAVE_V,
      floor: s.floor, x: s.x, y: s.y, dir: 'up',
      hp: s.hp, atk: s.atk, def: s.def, gold: s.gold, exp: 0, lv: 1,
      skill: null,           // { type: absorb／reflect／double, lv: 0～3 }；0＝選了還沒鑑定（不生效）
      keys: clone(s.keys),
      items: { book: 0, fly: 0, drum: 0, harp: 0, flute: 0, note: 0, chisel: 0 },
      pages: [],
      found: {},             // 收藏品圖鑑：代碼 → 在第幾層拿到（-1＝舊存檔補記、不知道哪一層）
      beaten: {},            // 怪物圖鑑：怪物代碼 → 第一次在第幾層打倒（3.2.64 起圖鑑只列打倒過的）
      equip: { sword: '', shield: '' },
      layers: [],            // 已經找回的樂器：drums／strings／lead
      maps: MT.FLOORS.map((f, i) => (f ? parseFloor(f, i) : null)),
      visited: [s.floor],
      flags: {},             // 劇情旗標、觸發過的劇本
      shops: { shop1: 0, shop2: 0, shop3: 0 },
      secrets: 0,            // 找到的暗牆數
      echo: {},              // 每層「上一場戰鬥」損失的生命（回音地板照這個扣）：樓層 → 數字
      mapV: 32,            // 地圖版本：舊存檔讀進來時，還沒去過的樓層換成這版的地圖（MT.migrate）
      steps: 0, kills: 0, playMs: 0,
      done: false,
    };
  };

  /* 存檔：地圖壓成字串，比較小 */
  MT.pack = st => {
    const o = Object.assign({}, st);
    o.maps = st.maps.map(m => (m ? m.map(r => r.join(' ')).join('/') : null));
    return o;
  };
  MT.unpack = o => {
    const st = clone(o);
    st.maps = o.maps.map(m => (m ? m.split('/').map(r => r.split(' ')) : null));
    return st;
  };

  MT.tile = (st, f, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '##' : st.maps[f][y][x]);
  MT.setTile = (st, f, x, y, t) => { st.maps[f][y][x] = t; };

  MT.zoneValue = (key, floor) => MT.ZONE_VALUES[key][MT.zoneOf(floor) - 1];
  MT.itemValue = (code, floor) => {
    const it = MT.ITEMS[code];
    return it.value != null ? it.value : MT.zoneValue(it.zone, floor);
  };

  MT.isMonster = t => !!MT.MONSTERS[t];
  MT.monSize = t => (MT.MONSTERS[t] && MT.MONSTERS[t].size) || 1;
  /* 大型怪物（size 2／3）在地圖上佔 size×size 格，每格都寫同一個代碼，共用一條血。
     回傳 (x, y) 所在那一塊的左上角 */
  MT.blockOrigin = function (st, f, x, y) {
    const t = MT.tile(st, f, x, y), n = MT.monSize(t);
    if (n === 1) return [x, y];
    while (x > 0 && MT.tile(st, f, x - 1, y) === t) x--;
    while (y > 0 && MT.tile(st, f, x, y - 1) === t) y--;
    // 同一代碼兩塊緊貼時，照 size 對齊（不會發生，保險）
    return [x, y];
  };
  // 清掉 (x, y) 所在的那一整塊
  MT.clearBlock = function (st, f, x, y) {
    const t = MT.tile(st, f, x, y), [ox, oy] = MT.blockOrigin(st, f, x, y), n = MT.monSize(t);
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (MT.tile(st, f, ox + dx, oy + dy) === t) MT.setTile(st, f, ox + dx, oy + dy, '..');
  };
  MT.isItem = t => !!MT.ITEMS[t];
  MT.isNpc = t => !!MT.NPCS[t];
  MT.hiddenItem = (f, x, y) => (MT.HIDDEN_ITEMS || {})[f + ':' + x + ',' + y] || null;

  /* 戰鬥試算。勇者先攻，雙方輪流；damage＝勇者這場會損失的生命，null＝打不動。
     怪物特技：first 先攻、double 一回合打兩下、magic 無視防禦、pierce 無視一半防禦、
     drain 開打前吸走勇者目前生命的 m.drain 比例（所以血少的時候去打比較划算）。
     勇者技能（鑑定後生效），3.2.66 起三種技能對應三種配點（Ken 指定）：
       absorb（鐵壁）＝防高型：戰鬥時防禦乘上倍數（防禦越高越賺；魔法攻擊無視防禦，所以擋不了）
       double（連擊）＝攻高型：每回合多打幾下（按攻擊減怪物防禦算，攻擊越高越賺）
       reflect（反彈）＝血高型：每被打一下就把一定比例彈回去（無視怪物防禦；挨打換輸出，血厚才撐得住）
     名稱 3.2.66 起改成鐵壁／連擊／反彈（原本沉穩低音／連音／回音）；代碼沿用 absorb（存檔裡的技能不用轉換）。 */
  MT.SKILL = {
    absorb: [1, 1.35, 1.5, 1.7],              // 防禦倍數（3.2.64 以前是「每下少受 20／35／50%」）
    absorbCap: [0, 90, 120, 150],              // 鐵壁加的防禦最多這麼多（3.2.68 Ken 指定：最穩、天花板最低；不讓有效防禦一路衝過最終魔王的攻擊。3.2.73 滿級 130→100；3.4 滿級 100→120：比 Lv2 低的上限讓升到 Lv3 打最終魔王反而多受約 800 傷害；3.6.2 滿級 120→150：3.4.2 的 20F 休止符衛士＋指揮家兩階段鐵壁要挨將近 100 下，完美鐵壁原分只剩 6000、拿 S 只靠 1 局）
    reflect: [0, 0.72, 1.0, 3.8],             // 彈回去的比例（以那一下實際打到的傷害算）。3.2.73 滿級 200%→380%，但要 Lv30 才升得到：高手上限在鐵壁與連擊中間；3.4 照 3.3.0 Lv1／Lv2 80／110%→76／105%；3.6.1 再降到 72／100%：一般玩家反彈通關率 83% 仍在鐵壁 72% 之上，違反「鐵壁最穩」（74／102% 只降到 80%，反應很陡）
    double: [[], [0.3], [0.6], [1, 1]],        // 每回合額外的攻擊（攻擊減怪物防禦的倍數）
    doubleGuard: 0.9,                          // 連擊＝全力進攻，戰鬥時防禦只算 90%
    doubleBurst: [1, 0.5], doubleBurstAt: 1.6, // 滿級爆發：攻擊 ≥ 怪物防禦 ×1.6 時再多打這兩下（3.2.73 第二下 50%→100%，連擊上限最高；3.7.1 改回 50%：完美玩家中位數連擊 19823 比反彈高 26%、32 局有 15 局 S，壓頂端，一般、高手幾乎不受影響）
    lvNeedDouble: [0, 0, 12, 26],              // 連擊升滿級要勇者 Lv26：會規劃、經驗值花得早的人才拿得到爆發
    lvNeedReflect: [0, 0, 12, 30],             // 反彈升滿級要勇者 Lv30（鐵壁維持 Lv22）：一般玩家多半停在 Lv2，用鐵壁最穩、反彈次之（3.2.73：Lv25→30）
    // 3.2.70（Ken 指定：連擊下限最低、上限最高）：一般玩家常囤經驗值、等級偏低，撐不到滿級；高手拿到爆發後分數最高
    lvNeed: [0, 0, 12, 22],                    // 升到第 n 級要的勇者等級（第 1 級＝鑑定就有）
    upCost: [0, 0, 50, 100],                   // 升到第 n 級要付老琴師的金幣（3.2.42 Ken 指定：升級要花一點資源才合理；鑑定免費）
  };
  const skillOf = st => (st.skill && st.skill.lv > 0 ? st.skill : null);
  MT.skillLvNeed = sk => (sk.type === 'double' ? MT.SKILL.lvNeedDouble : sk.type === 'reflect' ? MT.SKILL.lvNeedReflect : MT.SKILL.lvNeed);
  // 戰鬥時算的防禦：沉穩低音（absorb）乘上倍數
  MT.battleDef = st => { const sk = skillOf(st); return sk && sk.type === 'absorb' ? st.def + Math.min(Math.floor(st.def * (MT.SKILL.absorb[sk.lv] - 1)), MT.SKILL.absorbCap[sk.lv])
    : sk && sk.type === 'double' ? Math.floor(st.def * MT.SKILL.doubleGuard) : st.def; };
  MT.monHitRaw = function (st, m) {
    const sp = m.sp || [], def = MT.battleDef(st);
    if (sp.includes('magic')) return m.atk;
    if (sp.includes('pierce')) return Math.max(0, m.atk - Math.floor(def / 2));
    return Math.max(0, m.atk - def);
  };
  MT.calc = function (st, code) {
    const m = MT.MONSTERS[code];
    const sp = m.sp || [];
    const none = { damage: null, turns: 0, monActs: 0, heroHit: 0, monHit: 0, drain: 0, reflect: 0, strikes: [], monStrikes: 1, m };
    if (sp.includes('invincible')) return none;
    const heroHit = st.atk - m.def;
    if (heroHit <= 0) return none;
    const sk = skillOf(st);
    const raw = MT.monHitRaw(st, m);
    const monHit = raw;
    const reflect = sk && sk.type === 'reflect' && raw > 0 ? Math.ceil(raw * MT.SKILL.reflect[sk.lv]) : 0;
    const dk = sk && sk.type === 'double' ? MT.SKILL.double[sk.lv].concat(sk.lv >= 3 && st.atk >= m.def * MT.SKILL.doubleBurstAt ? MT.SKILL.doubleBurst : []) : [];
    const strikes = [heroHit].concat(dk.map(k => Math.max(1, Math.floor(heroHit * k))));
    const monStrikes = sp.includes('double') ? 2 : 1;
    const drain = sp.includes('drain') ? Math.floor(st.hp * m.drain) : 0;
    const per = strikes.reduce((a, b) => a + b, 0);
    let turns, monActs;
    if (!reflect) {
      // 沒有反彈：最後一回合一定是勇者打死牠（還沒輪到牠出手）
      turns = Math.floor((m.hp - 1) / per) + 1;
      monActs = turns - 1 + (sp.includes('first') ? 1 : 0);
    } else {
      // 有反彈：怪物出手也會扣自己的血，照回合慢慢算
      let hp = m.hp; turns = 0; monActs = 0;
      const monTurn = () => { monActs++; hp -= reflect * monStrikes; return hp <= 0; };
      if (!(sp.includes('first') && monTurn())) {
        for (;;) {
          turns++;
          for (const h of strikes) { hp -= h; if (hp <= 0) break; }
          if (hp <= 0 || monTurn()) break;
        }
      }
    }
    return { damage: drain + monActs * monStrikes * monHit, turns, monActs, heroHit, monHit, drain, reflect, strikes, monStrikes, m };
  };

  /* 經驗值換等級（節拍之神）：等級共用，越後面越貴；進階版（L2）每級給得比較多 */
  // 升到下一級的花費：base＋step×(等級−1)，過了 knee 級之後每級再多漲 late（前期不變、後期靠升級補救越來越貴）
  MT.lvCost = lv => { const L = MT.LEVEL; return L.base + L.step * (lv - 1) + Math.max(0, lv - (L.knee || Infinity)) * (L.late || 0); };
  MT.levelCost = st => MT.lvCost(st.lv);
  MT.buyLevel = function (st, id) {
    const cost = MT.levelCost(st);
    if (st.exp < cost) return false;
    const G = MT.LEVEL[id];
    st.exp -= cost; st.lv++;
    st.hp += G.hp; st.atk += G.atk; st.def += G.def;
    return true;
  };

  /* 技能：琴之精靈那裡三選一（lv 0，還不生效），老琴師鑑定後 lv 1，勇者等級夠了再找他升級 */
  MT.chooseSkill = function (st, type) {
    st.skill = { type, lv: 0 }; st.flags.skillChosen = 1;
    if (st.talkAt && MT.tile(st, st.floor, st.talkAt[0], st.talkAt[1]) === 'Hs') MT.setTile(st, st.floor, st.talkAt[0], st.talkAt[1], '..');   // 豎琴之靈選完就消失
  };
  // 老琴師：回傳這次發生的事（none／activate／up／notyet／max），並照做
  MT.sage = function (st) {
    const sk = st.skill;
    if (!sk) return { r: 'none' };
    if (sk.lv === 0) { sk.lv = 1; return { r: 'activate' }; }
    if (sk.lv >= 3) return { r: 'max' };
    const need = MT.skillLvNeed(sk)[sk.lv + 1], cost = MT.SKILL.upCost[sk.lv + 1];
    if (st.lv < need) return { r: 'notyet', need, cost };
    if (st.gold < cost) return { r: 'poor', cost };
    st.gold -= cost; sk.lv++;
    return { r: 'up', lv: sk.lv, cost };
  };
  MT.sagePreview = function (st) {
    const sk = st.skill;
    if (!sk) return 'none';
    if (sk.lv === 0) return 'activate';
    if (sk.lv >= 3) return 'max';
    if (st.lv < MT.skillLvNeed(sk)[sk.lv + 1]) return 'notyet';
    return st.gold >= MT.SKILL.upCost[sk.lv + 1] ? 'up' : 'poor';
  };

  /* 夾擊：走進兩隻夾擊怪（左右或上下）中間，立刻失去目前生命的三分之一 */
  MT.pincerAt = function (st, f, x, y) {
    const isP = t => MT.isMonster(t) && (MT.MONSTERS[t].sp || []).includes('pincer');
    return (isP(MT.tile(st, f, x - 1, y)) && isP(MT.tile(st, f, x + 1, y))) || (isP(MT.tile(st, f, x, y - 1)) && isP(MT.tile(st, f, x, y + 1)));
  };
  MT.pincerLoss = st => Math.floor(st.hp / 3);

  /* 共鳴（第 4 區）：走進共鳴怪周圍八格（含斜角，3×3 的範圍），每一步失去牠的 aura 點生命
     （固定值，防禦和技能都擋不掉）。兩隻的範圍重疊就扣兩份 */
  MT.auraAt = function (st, f, x, y) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const m = MT.MONSTERS[MT.tile(st, f, x + dx, y + dy)];
      if (m && m.aura) n += m.aura;
    }
    return n;
  };
  /* 回音地板 Ec（第 3 區）：踩上去，這層上一場戰鬥損失的生命會再扣一次，踩過就散掉變空地。
     還沒在這層打過就是 0，所以「最後打哪一隻再踩過去」是一個要算的順序 */
  MT.echoCost = (st, f) => (st.echo && st.echo[f]) || 0;
  // 走進 (x, y) 這一格要付的生命（回音＋共鳴；夾擊另外算，它是扣目前生命的比例、不會致命）
  MT.hazardAt = (st, f, x, y) => (MT.tile(st, f, x, y) === 'Ec' ? MT.echoCost(st, f) : 0) + MT.auraAt(st, f, x, y);

  MT.floorName = f => (f === 0 ? 'B1' : f + 'F');

  MT.shopPrice = (st, id) => MT.SHOPS[id].base + MT.SHOPS[id].step * st.shops[id];

  /* 往某方向走一步。回傳事件給畫面演出：
     move／bump（牆）／fight／cantFight／pickup／door／noKey／stairs／talk／shop／script／tooHurt（回音、共鳴付不起）
     move、pickup 可能帶 pincer／echo（踩了回音地板，0＝安靜）／aura（共鳴扣的生命） */
  MT.step = function (st, dir) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    st.dir = dir;
    const nx = st.x + d[0], ny = st.y + d[1];
    const t = MT.tile(st, st.floor, nx, ny);
    const ev = { x: nx, y: ny, tile: t };

    if (t === '##' || t === 'Gt') return Object.assign(ev, { type: 'bump' });
    // 裂牆：有鑿子就敲開（人不動），沒有就撞牆
    if (t === 'Cw') {
      if (!st.items.chisel) return Object.assign(ev, { type: 'noChisel' });
      st.items.chisel--;
      MT.setTile(st, st.floor, nx, ny, '..');
      return Object.assign(ev, { type: 'break' });
    }
    // 暗牆：看起來是牆，其實走得過去；走進去就變成空地
    if (t === 'Hw') {
      const hidden = MT.hiddenItem(st.floor, nx, ny);
      st.secrets = (st.secrets || 0) + 1;
      if (hidden) { MT.setTile(st, st.floor, nx, ny, hidden); return Object.assign(ev, { type: 'secret', x: nx, y: ny }); }   // 牆裡封著道具：牆碎開、道具露出來
      MT.setTile(st, st.floor, nx, ny, '..');
      st.x = nx; st.y = ny; st.steps++;
      return Object.assign(ev, { type: 'secret', script: MT.stepTrigger(st) });
    }

    if (MT.isMonster(t)) {
      const m = MT.MONSTERS[t];
      if (m.onBump && !st.flags['bump:' + t]) {
        st.flags['bump:' + t] = 1;
        return Object.assign(ev, { type: 'script', script: m.onBump });
      }
      const c = MT.calc(st, t);
      if (c.damage == null || c.damage >= st.hp) return Object.assign(ev, { type: 'cantFight', calc: c });
      // Boss 戰紀錄（技能表現分用）：打之前的能力與這場的結果。用「接一個新陣列」而不是 push，模擬複製局面時才不會共用
      if ((m.sp || []).includes('boss')) {
        const sk = skillOf(st);
        st.boss = (st.boss || []).concat([{ t, hp: st.hp, atk: st.atk, def: st.def, sk: sk ? sk.type : '', lv: sk ? sk.lv : 0, dmg: c.damage, turns: c.turns, refl: c.reflect * c.monActs * c.monStrikes }]);
      }
      st.hp -= c.damage;
      if (!st.echo) st.echo = {};
      st.echo[st.floor] = c.damage;   // 這層的回音地板之後就照這場扣
      st.gold += m.gold;
      st.exp += m.exp || 0;
      st.kills++;
      if (!st.beaten) st.beaten = {};
      if (st.beaten[t] == null) st.beaten[t] = st.floor;
      const at = MT.blockOrigin(st, st.floor, nx, ny);
      MT.clearBlock(st, st.floor, nx, ny);
      ev.at = at;
      const opened = MT.checkGates(st);
      return Object.assign(ev, { type: 'fight', calc: c, gold: m.gold, exp: m.exp || 0, opened, script: m.onDeath || null });
    }

    if (MT.DOORS[t]) {
      const k = MT.DOORS[t];
      if (st.keys[k] <= 0) return Object.assign(ev, { type: 'noKey', key: k });
      st.keys[k]--;
      MT.setTile(st, st.floor, nx, ny, '..');
      return Object.assign(ev, { type: 'door', key: k });
    }

    if (MT.isNpc(t)) {
      const n = MT.NPCS[t];
      st.talkAt = [nx, ny];
      if (n.shop) return Object.assign(ev, { type: 'shop', shop: n.shop });
      if (n.deal) return Object.assign(ev, { type: 'deal', deal: n.deal });
      if (n.level) return Object.assign(ev, { type: 'level', level: n.level });
      if (n.sage) return Object.assign(ev, { type: 'sage' });
      if (n.choose) return Object.assign(ev, { type: 'choose' });
      // 選好要播哪段之後就記成「說過了」，下次碰改說 again（3.2.8 修：以前遊戲裡從來沒記，只有自動玩家 sim.js 自己記，
      // 結果 B1 奶奶的鑿子、11F 鏡中少女的生命 +600 都能一直拿）
      const script = MT.npcScript(st, t);
      st.flags[n.flag || 'npc:' + t] = 1;
      return Object.assign(ev, { type: 'talk', script });
    }

    if (t === 'UU' || t === 'DD') {
      const to = st.floor + (t === 'UU' ? 1 : -1);
      MT.goFloor(st, to, t === 'UU' ? 'DD' : 'UU');
      return Object.assign(ev, { type: 'stairs', to, script: MT.arrivalTrigger(st) });
    }

    // 走得過去。回音地板、共鳴的格子要先付生命，付了會倒下就不走（跟打不贏的怪一樣擋下來）
    const echo = t === 'Ec' ? MT.echoCost(st, st.floor) : 0, aura = MT.auraAt(st, st.floor, nx, ny);
    if (echo + aura > 0 && echo + aura >= st.hp) return Object.assign(ev, { type: 'tooHurt', loss: echo + aura, echo, aura });
    if (t === 'Ec') { MT.setTile(st, st.floor, nx, ny, '..'); ev.echo = echo; }
    if (aura) ev.aura = aura;
    st.hp -= echo + aura;
    st.x = nx; st.y = ny; st.steps++;
    if (MT.pincerAt(st, st.floor, nx, ny)) { ev.pincer = MT.pincerLoss(st); st.hp -= ev.pincer; }
    if (MT.isItem(t)) {
      const got = MT.pickup(st, t);
      MT.setTile(st, st.floor, nx, ny, '..');
      return Object.assign(ev, { type: 'pickup', item: t, got, script: MT.stepTrigger(st) || got.script || null });
    }
    return Object.assign(ev, { type: 'move', script: MT.stepTrigger(st) });
  };

  /* 路上的 NPC：第一次說 talk，說過（旗標 npc:代碼，或 n.flag）之後說 again；沒有 again 的說過就不再觸發劇本 */
  MT.npcTalked = (st, t) => !!st.flags[MT.NPCS[t].flag || 'npc:' + t];
  MT.npcScript = (st, t) => {
    const n = MT.NPCS[t];
    return MT.npcTalked(st, t) ? n.again || null : n.talk;
  };
  /* 一次性交易：付金幣換能力或鑰匙，成交後 NPC 離開。回傳 true＝成交 */
  MT.dealOk = (st, id) => st.gold >= MT.DEALS[id].price && !st.flags['deal:' + id];
  MT.acceptDeal = function (st, id) {
    const D = MT.DEALS[id];
    if (!MT.dealOk(st, id)) return false;
    st.gold -= D.price;
    for (const k in D.gain) {
      if (k === 'keys') for (const c in D.gain.keys) st.keys[c] += D.gain.keys[c];
      else st[k] += D.gain[k];
    }
    st.flags['deal:' + id] = 1;
    if (st.talkAt) MT.setTile(st, st.floor, st.talkAt[0], st.talkAt[1], '..');
    return true;
  };

  /* 收藏品圖鑑（Ken 指定）：拿到之前只看得到剪影。代碼：道具名（book、fly…）、裝備代碼（s1…a3）、日記 P1～P3 */
  MT.COLLECT = ['book', 'fly', 'chisel', 's1', 'a1', 's2', 'a2', 's3', 'a3', 'drum', 'harp', 'flute', 'P1', 'P2', 'P3', 'note'];
  // 地圖上的代碼 → 收藏品代碼（舊存檔補記用）
  const COLLECT_TILE = { Mb: 'book', Ch: 'chisel', s1: 's1', a1: 'a1', s2: 's2', a2: 'a2', s3: 's3', a3: 'a3', P1: 'P1', P2: 'P2', P3: 'P3', FN: 'note' };
  // 記下拿到了，回傳是不是第一次
  MT.markFound = function (st, k) {
    if (!MT.COLLECT.includes(k)) return false;
    if (!st.found) st.found = {};
    if (st.found[k] != null) return false;
    st.found[k] = st.floor;
    return true;
  };
  MT.pickup = function (st, t) {
    const it = MT.ITEMS[t];
    const v = it.kind === 'key' || it.kind === 'page' || it.kind === 'note' || it.kind === 'tool' ? 1 : MT.itemValue(t, st.floor);
    const got = { kind: it.kind, value: v };
    if (it.kind === 'key') st.keys[it.key]++;
    else if (it.kind === 'hp') st.hp += v;
    else if (it.kind === 'atk') st.atk += v;
    else if (it.kind === 'def') st.def += v;
    else if (it.kind === 'page') { st.pages.push(it.page); got.script = MT.PAGE_SCRIPTS[it.page]; }
    else if (it.kind === 'note') { st.items.note = 1; got.script = 'noteGet'; }
    else if (it.kind === 'tool') { st.items[it.tool] = (st.items[it.tool] || 0) + (it.n || 1); got.script = it.script || null; }
    if (it.equip) st.equip[it.equip] = t;
    got.newFound = MT.markFound(st, it.kind === 'tool' ? it.tool : it.kind === 'page' ? 'P' + it.page : it.kind === 'note' ? 'note' : t);
    return got;
  };

  // 到某一層：站在對應的樓梯上
  MT.goFloor = function (st, to, stairs) {
    st.floor = to;
    const pos = MT.findTile(st, to, stairs) || MT.findTile(st, to, stairs === 'DD' ? 'UU' : 'DD');
    st.x = pos[0]; st.y = pos[1];
    if (!st.visited.includes(to)) st.visited.push(to);
  };

  MT.findTile = function (st, f, code) {
    const m = st.maps[f];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y][x] === code) return [x, y];
    return null;
  };

  // 飛到去過的樓層：落在下樓梯（1F 落在起點）
  MT.flyTo = function (st, f) {
    if (!st.items.fly || !st.visited.includes(f)) return false;
    if (f === 1) { st.floor = 1; st.x = MT.START.x; st.y = MT.START.y; }
    else MT.goFloor(st, f, 'DD');
    return true;
  };

  MT.stepTrigger = function (st) {
    const tr = MT.TRIGGERS[st.floor];
    const id = tr && tr[st.x + ',' + st.y];
    if (!id || st.flags['trig:' + st.floor + ':' + id]) return null;
    st.flags['trig:' + st.floor + ':' + id] = 1;
    return id;
  };
  MT.arrivalTrigger = MT.stepTrigger;

  MT.checkGates = function (st) {
    const gs = MT.GATES[st.floor];
    const opened = [];
    if (!gs) return opened;
    for (const g of gs) {
      const [gx, gy] = g.at;
      if (MT.tile(st, st.floor, gx, gy) !== 'Gt') continue;
      if (g.when.every(([x, y]) => !MT.isMonster(MT.tile(st, st.floor, x, y)))) {
        MT.setTile(st, st.floor, gx, gy, '..');
        opened.push([gx, gy]);
      }
    }
    return opened;
  };

  /* 買東西。回傳 true＝成交 */
  // 限量鑰匙還剩幾把（沒限量回傳 Infinity）。MT.KEY_STOCK_SHOP[shop][what] 是每個商人各自的庫存；沒有的話看 MT.KEY_STOCK[what]（兩個商人合計）。3.4 兩個都空＝不限購
  MT.keyStockLeft = (st, shop, what) => {
    const per = (MT.KEY_STOCK_SHOP || {})[shop];
    if (per && per[what] != null) return per[what] - (st.shops['stock:' + shop + ':' + what] || 0);
    const n = (MT.KEY_STOCK || {})[what]; return n == null ? Infinity : n - (st.shops['keys:' + what] || 0);
  };
  // 這把鑰匙現在賣多少（3.4 每買一把貴一倍）：起步價×KEY_RATE^已經買過的把數（四捨五入），兩個商人合計、不會重置；沒賣的回傳 null。
  // keyPriceAt 的 extra＝再多買幾把之後的價格（商人 UI 標下一把、模擬的懂規則玩家估價用）。鑰匙不能賣（3.4 拿掉 13F 表哥收購）
  MT.keyBought = (st, what) => st.shops['keys:' + what] || 0;
  MT.keyPriceAt = (st, shop, what, extra) => { const base = MT.SHOPS[shop][what]; return base == null ? null : Math.round(base * Math.pow((MT.KEY_RATE || {})[what] || 1, MT.keyBought(st, what) + (extra || 0))); };
  MT.keyPrice = (st, shop, what) => MT.keyPriceAt(st, shop, what, 0);
  MT.buy = function (st, shop, what) {
    if (shop === 'keys' || shop === 'keys2') {
      const price = MT.keyPrice(st, shop, what);
      if (price == null || st.gold < price) return false;   // 沒賣價＝這家不賣
      if (MT.keyStockLeft(st, shop, what) <= 0) return false;   // 限量的賣完了
      st.gold -= price; st.keys[what]++;
      st.shops['keys:' + what] = MT.keyBought(st, what) + 1;   // 兩商人合計的計數（漲價靠它）
      st.shops['stock:' + shop + ':' + what] = (st.shops['stock:' + shop + ':' + what] || 0) + 1;   // 這個商人自己的計數（各自限量用）
      return true;
    }
    const price = MT.shopPrice(st, shop);
    if (st.gold < price) return false;
    const S = MT.SHOPS[shop];
    st.gold -= price; st.shops[shop]++;
    if (what === 'hp') st.hp += S.hp;
    else if (what === 'atk') st.atk += S.atk;
    else st.def += S.def;
    return true;
  };

  /* 劇本裡會改狀態的指令（畫面照順序播，每一條都會呼叫這裡） */
  MT.applyCmd = function (st, c) {
    switch (c[0]) {
      case 'give': st.items[c[1]] = (st.items[c[1]] || 0) + c[2]; MT.markFound(st, c[1]); break;
      case 'stat': st[c[1]] += c[2]; break;
      case 'flag': st.flags[c[1]] = 1; break;
      case 'set': MT.setTile(st, st.floor, c[1], c[2], c[3]); break;
      case 'key': st.keys[c[1]] += c[2]; break;
      // 說話的 NPC 離開（剛剛碰到的那格變空地）
      case 'leave': if (st.talkAt) MT.setTile(st, st.floor, st.talkAt[0], st.talkAt[1], '..'); break;
      // 這層所有 c[1] 換成 c[2]（大型怪物整塊換）
      case 'swap': for (const row of st.maps[st.floor]) for (let x = 0; x < W; x++) if (row[x] === c[1]) row[x] = c[2]; break;
      // 最終 Boss 二階段：在原本 3×3 的位置放失控的指揮家（有失落的音符就是弱一點的 M4）
      case 'phase2': { const code = st.items.note ? 'M4' : 'M3'; for (let y = 0; y < 3; y++) for (let x = 4; x < 7; x++) MT.setTile(st, st.floor, x, y, code); break; }
      case 'layer': if (!st.layers.includes(c[1])) st.layers.push(c[1]); break;
      case 'ending': st.done = true; break;
    }
  };
  // 真結局：三頁日記全撿齊，並帶著失落的音符打倒指揮家
  MT.isTrueEnding = st => st.pages.length >= 3 && !!st.items.note;

  /* 技能表現分（3.5，Ken 指定：計分要認得三種技能各自的長處，三種技能的完美玩家都打得到 S）。
     只看技能生效後的 Boss 戰（13F 鏡之騎士、15F 回音之鏡、18F 回音指揮、20F 指揮家兩個階段），每一場依「你選的技能」量一個 0～1 的表現：
       鐵壁＝擋下幾成（每一下比沒有技能時少受幾成；魔法擋不了＝0）
       反彈＝彈回去的傷害佔 Boss 生命幾成（最多 1）
       連擊＝回合少了幾成（比沒有技能時）
     這場的分數＝表現 × Boss 生命 × MT.SKILL_SCORE.k[技能]（越強的 Boss 越值錢）。
     防刷：三種表現都跟戰鬥拖多長無關（反彈除外：多挨一下多彈一下，所以 k.reflect × 反彈比例上限 3.8 必須 < 1，多挨打一定虧）。
     k 照模擬定（3.6.2）：高手和完美玩家打到這幾隻 Boss 時能力差不多，所以這份分數約等於「選這個技能就加一個固定分」（中位數 鐵壁約 2500、反彈約 2000、連擊約 2200）。
     定法：完美玩家分數中位數 連擊＞反彈＞鐵壁、相鄰差 ≥10%，三種技能的完美玩家都有人拿 S，高手拿 S ≤10%（Ken 指定） */
  MT.SKILL_SCORE = { bosses: ['K3', 'EM', 'K4', 'M2', 'M3', 'M4'], k: { absorb: 0.2, reflect: 0.11, double: 0.15 } };
  // b：Boss 戰紀錄（MT.step 打之前記下的 能力＋技能），回傳這場的表現 0～1
  MT.bossPerf = function (b) {
    const st = { hp: b.hp, atk: b.atk, def: b.def, skill: { type: b.sk, lv: b.lv } }, st0 = { hp: b.hp, atk: b.atk, def: b.def, skill: null };
    const m = MT.MONSTERS[b.t], c = MT.calc(st, b.t), c0 = MT.calc(st0, b.t);
    if (c.damage == null) return 0;
    if (b.sk === 'absorb') { const r0 = MT.monHitRaw(st0, m); return r0 > 0 ? 1 - MT.monHitRaw(st, m) / r0 : 1; }
    if (b.sk === 'reflect') return Math.min(1, c.reflect * c.monActs * c.monStrikes / m.hp);
    if (b.sk === 'double') return c0.damage == null ? 1 : Math.max(0, 1 - c.turns / c0.turns);
    return 0;
  };
  MT.bossPts = b => (b.lv > 0 && MT.SKILL_SCORE.bosses.includes(b.t) ? Math.round(MT.bossPerf(b) * MT.MONSTERS[b.t].hp * (MT.SKILL_SCORE.k[b.sk] || 0)) : 0);
  // 這一局目前拿到的技能表現分
  MT.skillScore = st => (st.boss || []).reduce((a, b) => a + MT.bossPts(b), 0);
  // 用現在的能力去打 code 這隻 Boss 會拿幾分（模擬玩家估價用）
  MT.bossPtsNow = (st, code) => { const sk = skillOf(st); return sk ? MT.bossPts({ t: code, hp: st.hp, atk: st.atk, def: st.def, sk: sk.type, lv: sk.lv }) : 0; };

  /* 通關評價：剩餘生命＋剩下的金幣、鑰匙、經驗值折算成生命＋技能表現分。
     金幣照 16F 水晶祭壇當下的價格換生命，鑰匙先照呱呱商人的價格換金幣，經驗值照節拍之神換等級的生命，
     等於幫玩家把資源花完，不用最後跑回去買血。
     門檻（MT.RATING）用 tools/solve.js 的新手／一般／高手三種自動玩家的成績定；S 還要真結局 */
  MT.rating = function (st) {
    // 剩下的鑰匙照全塔最便宜的起步價換算（13F 表哥，沒漲價的價格），不然在 13F 買來囤著就能白賺分數
    const R = MT.RATING, S3 = MT.SHOPS.shop3, K = {};
    for (const c of ['y', 'b', 'r']) K[c] = Math.min(MT.SHOPS.keys[c], MT.SHOPS.keys2[c] || Infinity);   // 照最便宜的賣價（3.2.59 起表哥三種都賣）
    // 照真的去買來算：鑰匙換回金幣，金幣在水晶祭壇一次一次買生命（每買一次漲價），經驗值一級一級升（只算生命）
    let gold = st.gold + st.keys.y * K.y + st.keys.b * K.b + st.keys.r * K.r, n = st.shops.shop3 || 0, bonus = 0;
    for (let p = S3.base + S3.step * n; gold >= p; p += S3.step) { gold -= p; bonus += S3.hp; }
    let exp = st.exp, lv = st.lv;
    for (let c = MT.lvCost(lv); exp >= c; c = MT.lvCost(++lv)) { exp -= c; bonus += MT.LEVEL.L2.hp; }
    // 留到通關沒花的資源換算後再乘 MT.LEFTOVER（3.2.43 Ken 指定：留著要比花掉划算，先用 1.3）
    bonus = Math.floor(bonus * (MT.LEFTOVER || 1));
    const skill = MT.skillScore(st);
    const score = st.hp + bonus + skill;
    const trueEnd = MT.isTrueEnding(st);
    const grade = score >= R.S && trueEnd ? 'S' : score >= R.A ? 'A' : score >= R.B ? 'B' : 'C';
    return { hp: st.hp, bonus, skill, skillType: st.skill ? st.skill.type : '', score, grade, trueEnd, needTrue: score >= R.S && !trueEnd };
  };

  /* 存檔補上新版加的欄位（2.0.0 起只讀得了 v2 存檔，1.x 的地圖修補都用不到了） */
  MT.migrate = function (st) {
    if (st.items.note == null) st.items.note = 0;
    if (st.items.flute == null) st.items.flute = 0;
    if (st.secrets == null) st.secrets = 0;
    if (!st.echo) st.echo = {};
    // 3.1 改了 11～19F 的地圖（回音地板、共鳴水晶）：還沒去過的樓層換成新地圖，去過的照舊（不動已經打過的格子）
    if ((st.mapV || 0) < 31) {
      MT.FLOORS.forEach((f, i) => { if (f && !st.visited.includes(i)) st.maps[i] = parseFloor(f); });
      st.mapV = 31;
    }
    // 3.1.1 樓梯不再擋路：去過的樓層也補上（只動牆和樓梯，打過的格子不受影響）
    if (st.mapV < 32) {
      const open = { 7: [[9, 1]], 8: [[1, 1], [9, 1]] };
      for (const f in open) for (const [x, y] of open[f]) if (st.maps[f] && st.maps[f][y][x] === '##') st.maps[f][y][x] = '..';
      for (const f of [10, 15]) { const m = st.maps[f]; if (m && m[10][5] === 'DD' && m[7][4] === '##') { m[10][5] = '..'; m[7][4] = 'DD'; } }
      st.mapV = 32;
    }
    // 3.2.64 怪物圖鑑改成只列打倒過的：舊存檔照「去過的樓層上原本有這隻怪、現在那格沒了」補記
    if (!st.beaten) {
      st.beaten = {};
      for (const f of st.visited) {
        const orig = MT.FLOORS[f] && parseFloor(MT.FLOORS[f]), cur = st.maps[f];
        if (!orig || !cur) continue;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const t = orig[y][x];
          if (MT.MONSTERS[t] && cur[y][x] !== t && st.beaten[t] == null) st.beaten[t] = f;
        }
      }
    }
    // 3.2 收藏品圖鑑：舊存檔照「去過的樓層上原本有、現在沒了」補記在哪一層拿到；劇情給的（風之羽、樂器）不知道哪層就記 -1
    if (!st.found) {
      st.found = {};
      for (const f of st.visited) {
        const orig = MT.FLOORS[f] && parseFloor(MT.FLOORS[f]), cur = st.maps[f];
        if (!orig || !cur) continue;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const k = COLLECT_TILE[orig[y][x]];
          if (k && cur[y][x] !== orig[y][x] && st.found[k] == null) st.found[k] = f;
        }
      }
      for (const k of ['book', 'fly', 'chisel', 'drum', 'harp', 'flute', 'note']) if (st.items[k] && st.found[k] == null) st.found[k] = -1;
      for (const p of st.pages || []) if (st.found['P' + p] == null) st.found['P' + p] = -1;
      for (const e of [st.equip.sword, st.equip.shield]) if (e && st.found[e] == null) st.found[e] = -1;
    }
    if (st.items.chisel == null) st.items.chisel = 0;
    if (st.exp == null) { st.exp = 0; st.lv = 1; }
    if (st.shops.shop3 == null) st.shops.shop3 = 0;
    return st;
  };

  MT.runScriptState = function (st, id) { for (const c of MT.SCRIPTS[id]) MT.applyCmd(st, c); };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
