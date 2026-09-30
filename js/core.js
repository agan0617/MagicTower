/* 魔塔核心規則：狀態、移動、戰鬥、撿道具、開門、劇本的狀態指令。不碰畫面，node 解題器也用這支。 */
(function (MT) {
  'use strict';

  const W = 11, H = 11;
  const clone = o => JSON.parse(JSON.stringify(o));
  const parseFloor = rows => rows.map(r => r.split(' '));

  MT.W = W; MT.H = H;

  MT.newGame = function () {
    const s = MT.START;
    return {
      v: 1,
      floor: s.floor, x: s.x, y: s.y, dir: 'up',
      hp: s.hp, atk: s.atk, def: s.def, gold: s.gold,
      keys: clone(s.keys),
      items: { book: 0, fly: 0, drum: 0, harp: 0 },
      pages: [],
      equip: { sword: '', shield: '' },
      layers: [],            // 已經找回的樂器：drums／strings／lead
      maps: MT.FLOORS.map(f => (f ? parseFloor(f) : null)),
      visited: [s.floor],
      flags: {},             // 劇情旗標、觸發過的劇本
      shops: { shop1: 0, shop2: 0 },
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
  MT.isItem = t => !!MT.ITEMS[t];
  MT.isNpc = t => !!MT.NPCS[t];

  /* 戰鬥試算。勇者先攻；damage＝勇者這場會損失的血量，null＝打不動 */
  MT.calc = function (st, code) {
    const m = MT.MONSTERS[code];
    const sp = m.sp || [];
    if (sp.includes('invincible')) return { damage: null, turns: 0, heroHit: 0, monHit: 0, m };
    const heroHit = st.atk - m.def;
    if (heroHit <= 0) return { damage: null, turns: 0, heroHit: 0, monHit: 0, m };
    const monHit = sp.includes('magic') ? m.atk : Math.max(0, m.atk - st.def);
    const turns = Math.ceil(m.hp / heroHit);
    let hits = turns - 1 + (sp.includes('first') ? 1 : 0);
    if (sp.includes('double')) hits *= 2;
    return { damage: hits * monHit, turns, heroHit, monHit, m };
  };

  MT.shopPrice = (st, id) => MT.SHOPS[id].base + MT.SHOPS[id].step * st.shops[id];

  /* 往某方向走一步。回傳事件給畫面演出：
     move／bump（牆）／fight／cantFight／pickup／door／noKey／stairs／talk／shop／script */
  MT.step = function (st, dir) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    st.dir = dir;
    const nx = st.x + d[0], ny = st.y + d[1];
    const t = MT.tile(st, st.floor, nx, ny);
    const ev = { x: nx, y: ny, tile: t };

    if (t === '##' || t === 'Gt') return Object.assign(ev, { type: 'bump' });

    if (MT.isMonster(t)) {
      const m = MT.MONSTERS[t];
      if (m.onBump && !st.flags['bump:' + t]) {
        st.flags['bump:' + t] = 1;
        return Object.assign(ev, { type: 'script', script: m.onBump });
      }
      const c = MT.calc(st, t);
      if (c.damage == null || c.damage >= st.hp) return Object.assign(ev, { type: 'cantFight', calc: c });
      st.hp -= c.damage;
      st.gold += m.gold;
      st.kills++;
      MT.setTile(st, st.floor, nx, ny, '..');
      const opened = MT.checkGates(st);
      return Object.assign(ev, { type: 'fight', calc: c, gold: m.gold, opened, script: m.onDeath || null });
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
      if (n.shop) return Object.assign(ev, { type: 'shop', shop: n.shop });
      const script = n.talk === 'bard' && st.flags.bardTalked ? 'bardAgain' : n.talk;
      return Object.assign(ev, { type: 'talk', script });
    }

    if (t === 'UU' || t === 'DD') {
      const to = st.floor + (t === 'UU' ? 1 : -1);
      MT.goFloor(st, to, t === 'UU' ? 'DD' : 'UU');
      return Object.assign(ev, { type: 'stairs', to, script: MT.arrivalTrigger(st) });
    }

    // 走得過去
    st.x = nx; st.y = ny; st.steps++;
    if (MT.isItem(t)) {
      const got = MT.pickup(st, t);
      MT.setTile(st, st.floor, nx, ny, '..');
      return Object.assign(ev, { type: 'pickup', item: t, got, script: MT.stepTrigger(st) || got.script || null });
    }
    return Object.assign(ev, { type: 'move', script: MT.stepTrigger(st) });
  };

  MT.pickup = function (st, t) {
    const it = MT.ITEMS[t];
    const v = it.kind === 'key' || it.kind === 'page' ? 1 : MT.itemValue(t, st.floor);
    const got = { kind: it.kind, value: v };
    if (it.kind === 'key') st.keys[it.key]++;
    else if (it.kind === 'hp') st.hp += v;
    else if (it.kind === 'atk') st.atk += v;
    else if (it.kind === 'def') st.def += v;
    else if (it.kind === 'page') { st.pages.push(it.page); got.script = MT.PAGE_SCRIPTS[it.page]; }
    if (it.equip) st.equip[it.equip] = t;
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
  MT.buy = function (st, shop, what) {
    if (shop === 'keys') {
      const price = MT.SHOPS.keys[what];
      if (st.gold < price) return false;
      st.gold -= price; st.keys[what]++;
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
      case 'give': st.items[c[1]] = (st.items[c[1]] || 0) + c[2]; break;
      case 'stat': st[c[1]] += c[2]; break;
      case 'flag': st.flags[c[1]] = 1; break;
      case 'set': MT.setTile(st, st.floor, c[1], c[2], c[3]); break;
      case 'layer': if (!st.layers.includes(c[1])) st.layers.push(c[1]); break;
      case 'ending': st.done = true; break;
    }
  };
  MT.runScriptState = function (st, id) { for (const c of MT.SCRIPTS[id]) MT.applyCmd(st, c); };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
