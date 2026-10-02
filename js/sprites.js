/* 像素圖：16×16，字元對顏色。sym:true 的只畫左半 8 格，右半鏡射。
   1／2／3 是可替換的顏色（pal），同一張圖換色當不同的怪。 */
(function (MT) {
  'use strict';

  const BASE = {
    k: '#1b1a26', w: '#ffffff', g: '#b8bcc8', G: '#6b7080', d: '#3d4150', e: '#262436',
    r: '#e8453c', R: '#9a2228', o: '#f39a2e', y: '#ffd84a', Y: '#c9921a',
    l: '#8be05a', L: '#3a9a3a', b: '#5ab0ff', B: '#2d5fc0', c: '#aef4ff',
    p: '#c07cf5', P: '#6a34a8', s: '#f7cfa6', S: '#d09468', n: '#9a6634', N: '#5a3a1e', m: '#ff9ccc',
  };

  const PALS = {
    green: { 1: '#6fd64a', 2: '#2f8a33', 3: '#c8ffa8' },
    red: { 1: '#f0584c', 2: '#9a2228', 3: '#ffc0b8' },
    black: { 1: '#4a4660', 2: '#26233a', 3: '#8e89b0' },
    bat: { 1: '#7a5ab0', 2: '#40306a', 3: '#ff5a5a' },
    bigbat: { 1: '#b04a6a', 2: '#5a2238', 3: '#ffe24a' },
    vampire: { 1: '#40304a', 2: '#1e1624', 3: '#ff2a2a' },
    bone: { 1: '#efeadc', 2: '#9a9484', 3: '#ff5a5a' },
    warrior: { 1: '#efeadc', 2: '#3e6ed0', 3: '#ffd84a' },
    captain: { 1: '#efeadc', 2: '#c83a3a', 3: '#7affff' },
    blue: { 1: '#3d6fe0', 2: '#223f8a', 3: '#ffd84a' },
    purple: { 1: '#8a3ad0', 2: '#4a1a80', 3: '#7affff' },
    guard: { 1: '#a8b0c0', 2: '#5a6274', 3: '#e8453c' },
    dark: { 1: '#44405a', 2: '#221f30', 3: '#ff4a8a' },
    yellow: { 1: '#ffd84a', 2: '#b07a10' },
    iron: { 1: '#c4ccd8', 2: '#6b7080', 3: '#9a6634' },
    silver: { 1: '#eaf6ff', 2: '#7fb6e0', 3: '#ffd84a' },
    crystal: { 1: '#aef4ff', 2: '#6a34a8', 3: '#ffffff' },
    stone: { 1: '#8a8f9e', 2: '#555a68', 3: '#ffd84a' },
    doorY: { 1: '#ffd84a', 2: '#b07a10' },
    doorB: { 1: '#5ab0ff', 2: '#2d5fc0' },
    doorR: { 1: '#f0584c', 2: '#9a2228' },
  };
  PALS.gemRed = { 1: '#f0584c', 2: '#9a2228', 3: '#ffd0c8' };
  PALS.gemBlue = { 1: '#4aa0ff', 2: '#1f4fa8', 3: '#d8f0ff' };

  const S = {
    // ── 王子阿爾特（綽號小鐵）：頭上小王冠，手上拿鐵鎚 ──
    heroDown: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnNnnNnnk...',
      '...knssssssnk...',
      '...kssksskssk...',
      '...kssssssssk...',
      '....kssmmssk....',
      '...kkkkkkkkkk...',
      '..ksbbnnnnbbsk..',
      '..ksbbnnnnbbskG.',
      '..kkbbnnnnbbkkGG',
      '....kbnnnnbk.kn.',
      '....kbbkkbbk..n.',
      '....kNNk.kNNk...',
      '....kkkk.kkkk...',
    ] },
    // 序章練唱：沒拿鐵鎚、張嘴唱歌
    heroSing: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnNnnNnnk...',
      '...knssssssnk...',
      '...kssksskssk...',
      '...kssssssssk...',
      '....kssRRssk....',
      '...kkkkkkkkkk...',
      '..ksbbnnnnbbsk..',
      '..ksbbnnnnbbsk..',
      '..kkbbnnnnbbkk..',
      '....kbnnnnbk....',
      '....kbbkkbbk....',
      '....kNNk.kNNk...',
      '....kkkk.kkkk...',
    ] },
    // 序章被笑之後：閉眼、掛著淚、嘴角往下
    heroSad: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnNnnNnnk...',
      '...knnnnnnnnk...',
      '...kskksskksk...',
      '...kscsssscsk...',
      '....ksskkssk....',
      '...kkkkkkkkkk...',
      '..ksbbnnnnbbsk..',
      '..ksbbnnnnbbsk..',
      '..kkbbnnnnbbkk..',
      '....kbnnnnbk....',
      '....kbbkkbbk....',
      '....kNNk.kNNk...',
      '....kkkk.kkkk...',
    ] },
    heroUp: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnnnnk...',
      '...knnnnnnnnk...',
      '...knnNnnNnnk...',
      '...knnnnnnnnk...',
      '....knnnnnnk....',
      '...kkkkkkkkkk...',
      '..ksbbbbbbbbsk..',
      '.Gksbbbbbbbbsk..',
      'GGkkbbbbbbbbkk..',
      '.nk.kbbbbbbk....',
      '.n..kbbkkbbk....',
      '....kNNk.kNNk...',
      '....kkkk.kkkk...',
    ] },
    heroSide: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnsssk....',
      '...knnnsskskk...',
      '...knnnssssssk..',
      '....knnsssmsk...',
      '....kkkkkkkk....',
      '...kbbnnnnbk.GG.',
      '...kbbnnnnsk.GG.',
      '...kbbnnnnskkn..',
      '....kbnnnnbkn...',
      '....kbbkbbbk....',
      '....kNNkkNNk....',
      '....kkkkkkkk....',
    ] },

    // ── 多蕾（八分音符精靈）──
    fairy: { rows: [
      '........kk......',
      '........kyk.....',
      '..cc....kyyk....',
      '.cwcc...ky.yk...',
      '.cwwcc..ky..k...',
      '..cwcc..ky......',
      '...cc.kkky......',
      '....kkyyyyk.cc..',
      '...kyyyyyyyk.wc.',
      '..kyykyykyyyk.c.',
      '..kyyyyyyyyyk...',
      '..kyymyyymyyk...',
      '...kyyymmyyk....',
      '....kkyyyykk....',
      '......kkkk......',
      '................',
    ] },

    // ── 怪物 ──
    slime: { sym: true, rows: [
      '........', '........', '........', '........', '........',
      '......kk', '....kk11', '...k1133', '..k11131', '..k11111',
      '.k11wk11', '.k11kk11', '.k111111', '.k211111', '..k22222', '...kkkkk',
    ] },
    bat: { sym: true, rows: [
      '........', '........', '........', '........',
      'k.......', 'kk...k..', 'k1k..k1k', 'k11kk111', 'k111k131', 'k1111111',
      'k1212111', 'k2.2k111', 'k...k11k', '.....kk.', '........', '........',
    ] },
    skeleton: { sym: true, rows: [
      '........', '.....kkk', '....k111', '...k1111', '...k1111', '...k1k3k',
      '...k1111', '....k1k1', '.....kkk', '...kk1k1', '..k2k1k1', '..k2k111',
      '..kk.k1k', '.....k1k', '.....k1.', '....kk..',
    ] },
    mage: { sym: true, rows: [
      '.......k', '......k1', '.....k11', '....k111', '...k1111', '..k33333',
      '....ksss', '....kskw', '....ksss', '...k1kss', '..k11k11', '.k111111',
      '.k112111', '.k112111', 'k1112111', 'kkkkkkkk',
    ] },
    knight: { sym: true, rows: [
      '......k3', '.....k33', '....kk11', '...k1111', '...k1111', '...k1kkk',
      '...k1k33', '...k1111', '..kk2222', '.k11k111', 'k111k111', 'k1k1k222',
      'kk.k1111', '...k11k1', '...k22k2', '...kkk.k',
    ] },
    orc: { sym: true, rows: [
      '........', '....kkkk', '...kLlll', '..kLllll', '..kllkwk', '..kllllk',
      '..klwkll', '...kLlll', '..kknnnn', '.kllknnn', 'kllk.nNn', 'kllknnnn',
      'kkk.kNNN', '....knnk', '....kLLk', '....kkkk',
    ] },
    ghost: { sym: true, rows: [
      '........', '.....kkk', '....kwww', '...kwwww', '..kwwwww', '..kwwkkw',
      '..kwwkkw', '..kwwwww', '.kwwwwwk', '.kwwwwkk', '.kcwwwww', '.kccwwww',
      '.kcccwww', '..kccckc', '...kkk.k', '........',
    ] },
    golem: { sym: true, rows: [
      '........', '...kkkkk', '..kgggGg', '..kggGgg', '..kgyyGg', '..kgggGg',
      '.kkGGGGG', 'kggkgggg', 'kgGkgGgg', 'kggkgggG', 'kGGkGggg', 'kkkkgggg',
      '....kGGk', '...kggGk', '...kGGGk', '...kkkkk',
    ] },
    rest: { sym: true, rows: [
      '......kk', '....kkPP', '...kPPPP', '..kPPPPP', '..kPPkkk', '..kPkkrk',
      '..kPkkkk', '...kPPPP', '..kkPkwk', '.kPPkPPw', 'kPPPkPwP', 'kPkPkPPP',
      'kk.kPPPP', '...kPPPk', '..kPPPk.', '..kkkk..',
    ] },

    // ── Boss ──
    drumgolem: { sym: true, rows: [
      '........', '..kkkkkk', '.kyyyyyy', '.kwwwwww', '.kwwwwww', '.kyyyyyy',
      'kkrrkrrr', 'gkrwkrrr', 'gkrkkrrr', 'gkrrrrrr', 'gkrRRRRr', 'gkrrrrrr',
      '.kyyyyyy', '.kkkkkkk', '..kGk...', '.kGGk...',
    ] },
    siren: { sym: true, rows: [
      '....kkkk', '...kbbbb', '..kbbbbb', '..kbbsss', '.kbbsksk', '.kbbssss',
      '.kbbkssm', 'kbbbbkss', 'kbbkcccc', 'kbkccccc', 'kbkcckcc', '.kkcccck',
      '..kccccc', '..kcccck', '..kckckc', '...k.k.k',
    ] },
    // 靜默指揮家：白色面具，棕色頭髮跟阿爾特同色系（伏筆）
    maestro: { sym: true, rows: [
      '....kkkk', '...kNNNN', '..kNNNNN', '..kNwwww', '..kNwkkw', '...kwwww',
      '....kskk', '..kkkwwk', '.kddkwwr', 'kdddkwwk', 'kddddkkd', 'kdkddddd',
      'kdkdddkd', 'kk.kdddk', '...kddk.', '...kkkk.',
    ] },
    // 面具裂開後：底下是阿爾特自己的臉
    maestroBare: { sym: true, rows: [
      '....kkkk', '...knnnn', '..knnnnn', '..knssss', '..knskss', '...kssss',
      '....kssm', '..kkkwwk', '.kddkwwr', 'kdddkwwk', 'kddddkkd', 'kdkddddd',
      'kdkdddkd', 'kk.kdddk', '...kddk.', '...kkkk.',
    ] },

    // ── NPC ──
    // 國王巴索：王冠、白鬍子、紅袍（代碼沿用原版的吟遊詩人 bard）
    bard: { sym: true, rows: [
      '........', '....y.yy', '...kyyyy', '...kssss', '...kskss', '...kssss',
      '...kwwww', '..kkkwww', '.krrrrww', 'krrrrrrw', 'krRrrrrw', 'krRrrrrw',
      'krRrrrrw', '.krrrrrw', '.krrrrrw', '.kkkkkkk',
    ] },
    frog: { sym: true, rows: [
      '........', '....kkkk', '...koooo', '..kkkkkk', '..kllkkl', '.klkwkll',
      '.klkkkll', '.kllllll', '.klkkkkk', '..klllll', '.knnlyyl', 'knnnkyyl',
      'knnnklll', '.kkklLll', '...kLLkL', '...kkkkk',
    ] },
    altar: { sym: true, rows: [
      '.......k', '......k3', '......k3', '......k3', '......k3', '.....k33',
      '......k3', '....kkkk', '...k1111', '...k2222', '....k111', '....k121',
      '....k121', '...k1111', '..k22222', '..kkkkkk',
    ] },

    // ── 地形 ──
    stairsUp: { rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '..kGgggggggggk..',
      '..kGgkkkkkkggk..',
      '..kGgk....kggk..',
      '..kGkkkkkkkkgk..',
      '..kGgggggggggk..',
      '..kGGGGGGGGGGk..',
      '..kkkkkkkkkkkk..',
      '..kGgggggggggk..',
      '..kGGGGGGGGGGk..',
      '..kkkkkkkkkkkk..',
      '..kGgggggggggk..',
      '..kGGGGGGGGGGk..',
      '..kkkkkkkkkkkk..',
      '................',
    ] },
    stairsDown: { rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '..kekkkkkkkkek..',
      '..keGGGGGGGGek..',
      '..keeeeeeeeeek..',
      '..kekkkkkkkkek..',
      '..keGGGGGGGGek..',
      '..keeeeeeeeeek..',
      '..kekkkkkkkkek..',
      '..keGGGGGGGGek..',
      '..keeeeeeeeeek..',
      '..kekkkkkkkkek..',
      '..keGGGGGGGGek..',
      '..keeeeeeeeeek..',
      '..kkkkkkkkkkkk..',
      '................',
    ] },
    door: { sym: true, rows: [
      '.kkkkkkk', '.k222222', '.k211111', '.k211111', '.k212222', '.k212111',
      '.k212111', '.k21211k', '.k2121kk', '.k21211k', '.k212111', '.k212222',
      '.k211111', '.k211111', '.k222222', '.kkkkkkk',
    ] },
    gate: { sym: true, rows: [
      'kkkkkkkk', 'kGGGGGGG', 'kgk.gk.g', 'kgk.gk.g', 'kgk.gk.g', 'kGGGGGGG',
      'kgk.gk.g', 'kgk.gk.g', 'kgk.gk.g', 'kgk.gk.g', 'kGGGGGGG', 'kgk.gk.g',
      'kgk.gk.g', 'kgk.gk.g', 'kGGGGGGG', 'kkkkkkkk',
    ] },

    // ── 道具 ──
    key: { rows: [
      '................',
      '................',
      '.....kkkk.......',
      '....k1111k......',
      '...k11kk11k.....',
      '...k1k..k1k.....',
      '...k11kk11k.....',
      '....k1111k......',
      '.....k12k.......',
      '.....k12k.......',
      '.....k12kk......',
      '.....k1111k.....',
      '.....k12kk......',
      '.....k1111k.....',
      '.....kkkkk......',
      '................',
    ] },
    potion: { sym: true, rows: [
      '........', '........', '.....kkk', '.....kNN', '.....knn', '......kw',
      '.....kww', '....kww1', '...kw111', '..kw1111', '..k11111', '..k11111',
      '..k11112', '...k2222', '....kkkk', '........',
    ] },
    gem: { sym: true, rows: [
      '........', '........', '....kkkk', '...k3311', '..k33111', '.k331111',
      '.kkkkkkk', '.k311111', '..k31111', '...k3111', '....k311', '.....k31',
      '......k1', '.......k', '........', '........',
    ] },
    sword: { rows: [
      '................',
      '............kk..',
      '...........k11k.',
      '..........k112k.',
      '.........k112k..',
      '........k112k...',
      '.......k112k....',
      '..kk..k112k.....',
      '..k3kk112k......',
      '...k3k12k.......',
      '....k3kk........',
      '...k3k3k........',
      '..kykk.k3k......',
      '.kyyk...kk......',
      '..kk............',
      '................',
    ] },
    shield: { sym: true, rows: [
      '........', '..kkkkkk', '.k222222', '.k211111', '.k213333', '.k213111',
      '.k213111', '.k213111', '..k21311', '..k21311', '...k2131', '...k2131',
      '....k211', '.....k21', '......kk', '........',
    ] },
    page: { rows: [
      '................',
      '...kkkkkkkkk....',
      '..kwwwwwwwwwk...',
      '..kwgggggggwk...',
      '..kwwwwwwwwwk...',
      '..kwgggggwwwk...',
      '..kwwwwwwwwwk...',
      '..kwggggggwwk...',
      '..kwwwwwwwwwk...',
      '..kwggggwwwwk...',
      '..kwwwwwkkwwk...',
      '..kwwwwkkkkwk...',
      '..kwwwwwkkwwk...',
      '..kwwwwwwwwk....',
      '...kkkkkkkk.....',
      '................',
    ] },
    book: { rows: [
      '................',
      '..kkkkkkkkkkk...',
      '..kRrrrrrrrrrk..',
      '..kRrrryyyrrrk..',
      '..kRrrykkyrrrk..',
      '..kRrryyyyrrrk..',
      '..kRrrykkyrrrk..',
      '..kRrrrrrrrrrk..',
      '..kRrrrrrrrrrk..',
      '..kRrryyyyyrrk..',
      '..kRrrrrrrrrrk..',
      '..kRkkkkkkkkkk..',
      '..kRwwwwwwwwwk..',
      '..kkkkkkkkkkkk..',
      '................',
      '................',
    ] },
    feather: { rows: [
      '................',
      '...........kk...',
      '..........kcck..',
      '.........kcwcck.',
      '........kcwccck.',
      '.......kcwccck..',
      '......kcwccck...',
      '.....kcwccck....',
      '....kcwccck.....',
      '....kwccck......',
      '...kwcckk.......',
      '...kcck.........',
      '..kkk...........',
      '.kk.............',
      '................',
      '................',
    ] },
    drum: { sym: true, rows: [
      '........', '........', '...kkkkk', '..kyyyyy', '.kwwwwww', '.kwwwwww',
      '.kyyyyyy', '.krrkrrr', '.krrrkrr', '.krrkrrr', '.krrrkrr', '.krrkrrr',
      '.kyyyyyy', '..kkkkkk', '........', '........',
    ] },
    goldnote: { rows: [
      '..w.............',
      '.wyw.....kkk....',
      '..w......kyykk..',
      '.........kykyyk.',
      '.........kyk.kyk',
      '.........kyk..k.',
      '.........kyk....',
      '.........kyk..w.',
      '.........kyk.wyw',
      '.....kkkkkyk..w.',
      '....kyyyyyyk....',
      '...kyywyyyyk....',
      '...kywyyyyYk....',
      '...kyyyyyYYk....',
      '....kYYYYYk.....',
      '.....kkkkk......',
    ] },
    harp: { rows: [
      '................',
      '....kkk.........',
      '...kyyyk........',
      '...kykyykkk.....',
      '...kyk.kyyykk...',
      '...kykc.c.kyyk..',
      '...kyk.c.c.kyk..',
      '...kykc.c.c.kyk.',
      '...kyk.c.c.c.kyk',
      '...kykc.c.c.cky.',
      '...kyk.c.c.c.ky.',
      '...kykc.c.c.cky.',
      '...kyykkkkkkkyy.',
      '....kyyyyyyyyyk.',
      '.....kkkkkkkkk..',
      '................',
    ] },
  };

  // 樂譜符號（加圖示用）
  MT.SPRITE_OF = function (code) {
    if (MT.MONSTERS[code]) return MT.MONSTERS[code];
    if (MT.ITEMS[code]) return MT.ITEMS[code];
    if (MT.NPCS[code]) return MT.NPCS[code];
    return null;
  };

  const cache = new Map();
  /* 產生一張圖（離屏 canvas），scale 倍 */
  MT.sprite = function (name, pal, scale, flip) {
    const key = name + '|' + (pal || '') + '|' + scale + '|' + (flip ? 1 : 0);
    let c = cache.get(key);
    if (c) return c;
    const def = S[name];
    if (!def) return null;
    const colors = Object.assign({}, BASE, pal ? PALS[pal] : null);
    c = document.createElement('canvas');
    c.width = c.height = 16 * scale;
    const g = c.getContext('2d');
    def.rows.forEach((row, y) => {
      let r = def.sym ? row + row.split('').reverse().join('') : row;
      r = (r + '................').slice(0, 16);
      if (flip) r = r.split('').reverse().join('');
      for (let x = 0; x < 16; x++) {
        const ch = r[x];
        if (ch === '.' || ch === ' ') continue;
        const col = colors[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    });
    cache.set(key, c);
    return c;
  };
  MT.SPRITES = S;
  MT.PALS = PALS;

  /* 地板與牆：依區域畫（每格一張，快取） */
  const ZONE_STYLE = {
    1: { floor: '#2b2f3e', floor2: '#303548', wall: '#5d6680', wallHi: '#7d88a6', wallLo: '#3a4054', mortar: '#252a38' },
    2: { floor: '#34262b', floor2: '#3c2b31', wall: '#8a4a3e', wallHi: '#a86454', wallLo: '#5a2e28', mortar: '#2a1a1c' },
    3: { floor: '#231e3a', floor2: '#2a2446', wall: '#5a4a9a', wallHi: '#8e7ad8', wallLo: '#362a66', mortar: '#1a1530' },
  };
  MT.ZONE_STYLE = ZONE_STYLE;
  MT.terrain = function (kind, zone, size, variant) {
    const key = 'T|' + kind + '|' + zone + '|' + size + '|' + (variant || 0);
    let c = cache.get(key);
    if (c) return c;
    const st = ZONE_STYLE[zone];
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const u = size / 16;
    if (kind === 'floor') {
      g.fillStyle = (variant & 1) ? st.floor2 : st.floor;
      g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(0, 0, size, u);
      g.fillRect(0, 0, u, size);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, size - u, size, u);
      g.fillRect(size - u, 0, u, size);
      if (variant % 5 === 0) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(5 * u, 7 * u, 2 * u, u); }
    } else {
      g.fillStyle = st.mortar;
      g.fillRect(0, 0, size, size);
      if (zone === 3) {
        // 水晶牆：斜切面
        g.fillStyle = st.wall; g.fillRect(u, u, 14 * u, 14 * u);
        g.fillStyle = st.wallHi;
        g.beginPath(); g.moveTo(u, u); g.lineTo(9 * u, u); g.lineTo(u, 9 * u); g.fill();
        g.fillStyle = st.wallLo;
        g.beginPath(); g.moveTo(15 * u, 15 * u); g.lineTo(7 * u, 15 * u); g.lineTo(15 * u, 7 * u); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(3 * u, 3 * u, u, u);
      } else {
        const rows = [[0, 7], [8, 15]];
        rows.forEach(([y0], i) => {
          const off = i === 0 ? 0 : 8;
          for (let bx = -8; bx < 16; bx += 8) {
            const x0 = bx + off;
            const x = Math.max(0, x0) * u, w = (Math.min(16, x0 + 8) - Math.max(0, x0) - 1) * u;
            if (w <= 0) continue;
            g.fillStyle = st.wall; g.fillRect(x, y0 * u, w, 7 * u);
            g.fillStyle = st.wallHi; g.fillRect(x, y0 * u, w, u);
            g.fillStyle = st.wallLo; g.fillRect(x, (y0 + 6) * u, w, u);
          }
        });
      }
    }
    cache.set(key, c);
    return c;
  };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
