/* 魔塔：失落的旋律 —— 關卡、怪物、道具、事件資料（純資料，瀏覽器與 node 解題器共用） */
(function (MT) {
  'use strict';

  // 區域：1＝1–5F 石磚、2＝6–10F 紅磚、3＝11–15F 水晶
  MT.zoneOf = f => (f <= 5 ? 1 : f <= 10 ? 2 : 3);

  /* 怪物：hp／atk／def／gold；sp＝特技
     first：先攻（開打前先打你一下）  magic：魔法攻擊（無視防禦）  double：一回合打兩下
     boss：Boss（顯示大血條）  invincible：打不動（由劇情解除） */
  MT.MONSTERS = {
    gs: { hp: 35, atk: 18, def: 1, gold: 1, sprite: 'slime', pal: 'green' },
    rs: { hp: 45, atk: 20, def: 2, gold: 2, sprite: 'slime', pal: 'red' },
    bt: { hp: 35, atk: 38, def: 3, gold: 3, sprite: 'bat', pal: 'bat' },
    sk: { hp: 50, atk: 42, def: 6, gold: 5, sprite: 'skeleton', pal: 'bone' },
    mg: { hp: 60, atk: 32, def: 8, gold: 5, sprite: 'mage', pal: 'blue' },
    sw: { hp: 55, atk: 52, def: 12, gold: 8, sprite: 'skeleton', pal: 'warrior' },
    bb: { hp: 60, atk: 70, def: 8, gold: 10, sprite: 'bat', pal: 'bigbat', sp: ['first'] },
    DG: { hp: 280, atk: 70, def: 18, gold: 60, sprite: 'drumgolem', sp: ['boss'], onDeath: 'drumGet' },

    ks: { hp: 130, atk: 60, def: 3, gold: 8, sprite: 'slime', pal: 'black' },
    gd: { hp: 80, atk: 60, def: 30, gold: 14, sprite: 'knight', pal: 'guard' },
    oc: { hp: 220, atk: 80, def: 5, gold: 18, sprite: 'orc' },
    wz: { hp: 100, atk: 55, def: 20, gold: 14, sprite: 'mage', pal: 'red', sp: ['magic'] },
    gh: { hp: 100, atk: 85, def: 25, gold: 20, sprite: 'ghost', sp: ['first'] },
    sc: { hp: 130, atk: 90, def: 28, gold: 25, sprite: 'skeleton', pal: 'captain' },
    SR: { hp: 800, atk: 140, def: 45, gold: 150, sprite: 'siren', sp: ['boss'], onDeath: 'harpGet' },

    vb: { hp: 200, atk: 180, def: 50, gold: 30, sprite: 'bat', pal: 'vampire', sp: ['first'] },
    kn: { hp: 300, atk: 200, def: 90, gold: 40, sprite: 'knight', pal: 'dark' },
    am: { hp: 250, atk: 150, def: 70, gold: 40, sprite: 'mage', pal: 'purple', sp: ['magic'] },
    gl: { hp: 50, atk: 180, def: 110, gold: 35, sprite: 'golem' },
    rg: { hp: 500, atk: 260, def: 110, gold: 70, sprite: 'rest' },
    M1: { hp: 3000, atk: 350, def: 150, gold: 0, sprite: 'maestro', sp: ['boss', 'invincible'], onBump: 'maestroDrum' },
    M2: { hp: 1200, atk: 270, def: 100, gold: 0, sprite: 'maestro', sp: ['boss'], onDeath: 'ending' },
  };

  // 同區域的數值：[1區, 2區, 3區]
  MT.ZONE_VALUES = {
    hp: [50, 100, 200],
    HP: [200, 400, 800],
    at: [2, 3, 4],
    df: [2, 3, 4],
  };

  /* 道具：kind 決定撿起來的效果 */
  MT.ITEMS = {
    Yk: { kind: 'key', key: 'y', sprite: 'key', pal: 'yellow' },
    Bk: { kind: 'key', key: 'b', sprite: 'key', pal: 'blue' },
    Rk: { kind: 'key', key: 'r', sprite: 'key', pal: 'red' },
    hp: { kind: 'hp', zone: 'hp', sprite: 'potion', pal: 'red' },
    HP: { kind: 'hp', zone: 'HP', sprite: 'potion', pal: 'blue' },
    at: { kind: 'atk', zone: 'at', sprite: 'gem', pal: 'gemRed' },
    df: { kind: 'def', zone: 'df', sprite: 'gem', pal: 'gemBlue' },
    s1: { kind: 'atk', value: 10, sprite: 'sword', pal: 'iron', equip: 'sword' },
    a1: { kind: 'def', value: 10, sprite: 'shield', pal: 'iron', equip: 'shield' },
    s2: { kind: 'atk', value: 25, sprite: 'sword', pal: 'silver', equip: 'sword' },
    a2: { kind: 'def', value: 25, sprite: 'shield', pal: 'silver', equip: 'shield' },
    P1: { kind: 'page', page: 1, sprite: 'page' },
    P2: { kind: 'page', page: 2, sprite: 'page' },
    P3: { kind: 'page', page: 3, sprite: 'page' },
    FN: { kind: 'note', sprite: 'goldnote' },   // 失落的音符（真結局條件之一）
  };

  MT.DOORS = { Yd: 'y', Bd: 'b', Rd: 'r' };

  /* NPC：碰到就對話；shop／merchant 會開選單 */
  MT.NPCS = {
    Om: { sprite: 'bard', talk: 'bard' },
    Sh: { sprite: 'altar', pal: 'stone', shop: 'shop1' },
    S2: { sprite: 'altar', pal: 'crystal', shop: 'shop2' },
    Mk: { sprite: 'frog', shop: 'keys' },
  };

  /* 祭壇：每買一次價格加 step */
  MT.SHOPS = {
    shop1: { base: 20, step: 10, hp: 300, atk: 3, def: 3 },
    shop2: { base: 80, step: 20, hp: 1200, atk: 8, def: 8 },
    keys: { y: 10, b: 50, r: 100 },
  };

  MT.START = { floor: 1, x: 5, y: 10, hp: 1000, atk: 10, def: 10, gold: 0, keys: { y: 1, b: 0, r: 0 } };
  MT.TOP = 15;

  /* 地圖：11×11，每格兩個字元，空白分隔。第 0 列在最上面。 */
  MT.FLOORS = [
    null,
    // 1F 入口大廳
    [
      'UU .. .. ## hp .. at ## .. .. Yk',
      '.. gs .. ## .. rs .. ## .. gs ..',
      '.. .. .. ## ## Yd ## ## ## Yd ##',
      '## Yd ## ## .. .. .. .. .. .. ..',
      '.. .. .. ## .. ## ## ## ## ## ..',
      'Yk bt hp Yd .. ## df .. Yk ## ..',
      '.. .. .. ## .. ## .. gs .. Yd ..',
      '## ## ## ## .. ## ## ## ## ## ..',
      'hp .. gs Yd .. .. .. ## rs .. hp',
      'Yk .. .. ## .. .. Yk ## .. .. at',
      '.. rs .. ## .. .. .. ## Yk .. ..',
    ],
    // 2F 衛兵營房（老吟遊詩人）
    [
      'DD .. sk Yk Yd .. .. ## hp Yk ..',
      '.. ## ## ## ## ## .. ## .. mg ..',
      '.. ## at .. Yk ## .. ## ## Yd ##',
      '.. ## .. rs .. Yd .. .. .. .. ..',
      'Yk ## ## ## ## ## .. ## ## ## ..',
      'Yd .. .. Om .. ## .. ## df hp ..',
      '## ## ## ## Yd ## .. .. .. bt ..',
      'hp gs .. .. .. ## .. ## ## ## ..',
      '.. ## ## ## Bd ## .. ## Yk .. ..',
      'Yk ## df at .. ## .. ## .. rs ..',
      '.. Yd .. .. hp ## .. sk .. ## UU',
    ],
    // 3F 書庫（日記第一頁）
    [
      '.. .. .. ## UU .. .. ## hp .. Yk',
      '.. sw .. Yd .. .. .. Yd .. sk ..',
      'Yk .. hp ## ## Yd ## ## ## ## ..',
      '## Yd ## ## .. mg .. .. .. .. ..',
      '.. .. .. ## .. ## ## ## ## ## ..',
      'at bt P1 Yd .. .. .. .. df .. Yk',
      '.. .. .. ## ## ## .. ## ## Bd ##',
      '## Yd ## ## .. .. .. ## Bk sw at',
      '.. rs .. ## .. sk .. ## ## ## ##',
      'Yk .. hp ## .. .. .. Yd Bk .. Yk',
      '.. .. df ## DD .. Yk ## .. mg ..',
    ],
    // 4F 音叉祭壇（商店）與鐵劍
    [
      'DD .. .. Yd .. .. .. Yd .. sw UU',
      '.. .. .. ## ## Sh ## ## .. .. ##',
      '## Yd ## ## .. .. .. ## ## Yd ##',
      'hp .. sw ## ## Yd ## ## bb .. hp',
      '.. at .. ## Yk .. .. ## .. df ..',
      '## ## .. ## .. gs .. ## .. ## ##',
      '.. .. .. .. .. .. .. .. .. .. ..',
      'Yk ## ## ## Bd ## ## ## ## ## Yk',
      '.. sk .. ## .. sw .. ## .. mg ..',
      'df .. hp ## .. .. .. ## hp .. at',
      '.. Yk .. ## .. s1 .. ## .. Bk ..',
    ],
    // 5F 鼓魔像
    [
      '## ## ## ## .. UU .. ## ## ## ##',
      '## hp .. ## ## Gt ## ## .. HP ##',
      '## .. at ## .. .. .. ## df .. ##',
      '## Yd ## ## .. DG .. ## ## Yd ##',
      'Yk .. .. ## .. .. .. ## .. .. Yk',
      '.. bb .. ## ## .. ## ## .. bb ..',
      '.. .. .. .. .. .. .. .. .. .. ..',
      '## ## Yd ## ## .. ## ## Yd ## ##',
      'Yk sw .. ## .. .. .. ## .. sw Yk',
      'hp .. df ## .. .. .. ## at .. hp',
      '.. Bk .. ## .. DD .. ## .. .. ..',
    ],
    // 6F 呱呱商人與鐵盾
    [
      'DD .. ks ## a1 gd .. ## Yk .. ..',
      '.. Yk .. ## ## Bd ## ## .. ks ..',
      '## Yd ## .. .. .. .. .. ## Yd ##',
      'hp .. ks .. ## ## ## .. hp .. at',
      '.. at .. .. ## Mk ## .. .. .. ..',
      '## ## ## Yd ## .. ## .. ## ## ##',
      'Yk .. oc .. .. .. .. .. .. gd Yk',
      '.. ## ## ## ## Yd ## ## ## ## ..',
      'df .. wz .. .. .. .. .. wz .. HP',
      '## ## ## Yd ## ## ## .. ## ## ##',
      'hp at .. .. .. UU .. .. .. df hp',
    ],
    // 7F 幽靈畫廊
    [
      'UU .. gh .. Yd .. .. .. gh .. DD',
      '## ## ## ## ## .. ## ## ## ## ..',
      'at hp .. Yd .. .. .. .. .. hp df',
      '.. sc .. ## ## Bd ## ## .. sc ..',
      '## Yd ## ## Rk .. HP ## ## Yd ##',
      '.. .. .. ## ## ## ## ## .. .. ..',
      'Yk ks .. Yd .. wz Yk Yd .. ks Yk',
      '## ## ## ## .. .. .. ## ## ## ##',
      'hp .. gd .. .. Rd .. .. gd .. hp',
      'df ## ## ## ## .. ## ## ## ## at',
      '.. Yk .. ## at HP df ## .. Yk ..',
    ],
    // 8F 地牢（日記第二頁）
    [
      'DD .. .. Yd .. oc .. Yd .. .. UU',
      '.. ## ## ## ## .. ## ## ## ## ..',
      'Yk ## hp at ## .. ## df hp ## ..',
      '.. ## .. gd .. .. .. gd .. ## gh',
      '.. ## ## ## ## .. ## ## ## ## Yk',
      'ks Yd .. .. .. P2 .. .. .. Yd ks',
      '.. ## ## ## ## .. ## ## ## ## ..',
      '.. ## Yk wz Yd .. Yd wz Bk ## ..',
      '.. ## HP .. ## .. ## .. Rk ## ..',
      '## ## ## ## ## Bd ## ## ## ## ##',
      'Yk .. at .. sc .. sc .. df .. Yk',
    ],
    // 9F 兵器庫（銀劍）
    [
      'UU .. gh ## hp .. hp ## .. .. DD',
      '.. Yk .. ## .. sc .. ## .. Yk ..',
      'Yd ## ## ## ## Yd ## ## ## ## ..',
      '.. .. oc .. .. .. .. .. oc .. ..',
      '## ## ## Yd ## ## ## Yd ## ## ##',
      'at .. wz .. ## s2 ## .. wz .. df',
      'hp .. .. .. ## Rd ## .. .. .. hp',
      '## Bd ## ## ## .. ## ## ## .. ##',
      'Yk .. gd .. Yd .. .. .. gd .. Yk',
      '.. .. .. .. ## .. ## .. .. .. ..',
      'HP .. df .. ## HP ## .. at .. Bk',
    ],
    // 10F 弦之魔女
    [
      '## ## ## ## .. UU .. ## ## ## ##',
      '.. HP .. ## ## Gt ## ## .. HP ..',
      '.. .. at ## Rk .. .. ## df .. ..',
      '## Yd ## ## .. SR .. ## ## Yd ##',
      'gh .. .. ## .. .. .. ## .. .. gh',
      '.. sc .. ## ## .. ## ## .. sc ..',
      'Yk .. .. .. .. .. .. .. .. .. Yk',
      '## Yd ## ## ## .. ## ## ## Yd ##',
      'hp .. at .. ## .. ## .. df .. hp',
      '.. gd .. .. ## .. ## .. .. gd ..',
      'Yk .. hp .. ## DD ## .. hp .. Yk',
    ],
    // 11F 水晶迴廊（古老音叉）
    [
      '## ## ## ## .. DD .. ## ## ## ##',
      'Yk vb .. .. .. .. .. .. .. vb Yk',
      '.. ## ## ## ## .. ## ## ## ## ..',
      'hp .. kn .. Yd .. Yd .. kn .. hp',
      '.. ## ## ## ## .. ## ## ## ## ..',
      'at .. .. Bd .. S2 .. Bd .. .. df',
      'Bk gl .. ## Yk .. Yk ## .. gl Bk',
      '## Yd ## ## ## Yd ## ## ## Yd ##',
      'HP .. am .. .. .. .. .. am .. HP',
      '## ## ## ## ## Bd ## ## ## ## ##',
      'at .. df .. .. UU .. .. at .. df',
    ],
    // 12F 觀星台（銀盾、日記第三頁）
    [
      'DD .. .. .. .. vb .. Yd .. .. Yk',
      '## ## ## ## ## .. ## ## ## ## ..',
      'hp Yk .. Yd kn .. kn Yd .. at ..',
      '.. .. .. ## ## Rd ## ## .. .. ..',
      'am ## ## ## HP a2 HP ## ## ## am',
      '.. .. P3 .. ## ## ## .. .. .. ..',
      '## ## ## Yd ## Rk ## Yd ## ## ##',
      'df .. gl .. .. .. .. .. gl .. at',
      '.. ## ## ## ## Bd ## ## ## ## ..',
      '.. hp .. Bk ## vb ## Bk .. hp ..',
      'UU .. gd .. ## HP ## .. gd .. Yk',
    ],
    // 13F 回音長廊
    [
      'UU .. kn .. Yd .. .. .. .. .. ..',
      '## ## ## ## ## ## ## ## ## ## ..',
      'hp .. am .. Bd .. gl .. Yd .. ..',
      '.. ## ## ## ## ## ## ## ## ## vb',
      'at .. .. Yd .. HP .. .. .. .. ..',
      'vb ## ## ## ## ## ## ## ## ## ..',
      '.. Yk kn .. Yd .. .. .. .. df ..',
      '## ## ## ## ## ## ## ## ## ## Yd',
      'Yk .. gl .. Yd Bk .. .. kn .. ..',
      '## ## ## ## ## ## ## ## ## ## ..',
      'df .. HP .. .. .. vb .. at Yk DD',
    ],
    // 14F 前廳
    [
      'DD .. Yk ## HP HP HP ## .. .. UU',
      '.. rg .. ## at FN df ## .. rg ..',
      '.. .. .. ## ## Rd ## ## Yk .. ..',
      '## Yd ## .. .. .. .. .. ## Yd ##',
      'hp .. .. .. kn .. kn .. Bd .. hp',
      'at .. ## ## ## .. ## ## ## .. df',
      '.. am .. .. .. .. .. .. .. am ..',
      '## ## ## Yd ## ## ## Yd ## ## ##',
      'Yk .. gl .. .. .. .. .. gl .. Yk',
      'HP .. .. .. .. .. .. .. .. .. HP',
      'at df .. .. .. .. .. .. .. at df',
    ],
    // 15F 靜默舞台
    [
      '## ## ## ## ## ## ## ## ## ## ##',
      '## ## ## .. .. M1 .. .. ## ## ##',
      '## ## ## .. .. .. .. .. ## ## ##',
      '## ## ## ## ## .. ## ## ## ## ##',
      '## HP .. ## ## Gt ## ## .. HP ##',
      '## .. .. .. .. .. .. .. .. .. ##',
      '## at .. ## ## .. ## ## .. df ##',
      '## ## ## ## rg .. rg ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. DD .. ## ## ## ##',
    ],
  ];

  /* 踩到就觸發的劇情（只觸發一次）：floor → "x,y" → 劇本名 */
  MT.TRIGGERS = {
    1: { '5,10': 'f1Start' },
    5: { '5,5': 'golemIntro' },
    10: { '5,5': 'sirenIntro' },
    13: { '10,10': 'f13Voice' },
    14: { '0,0': 'f14Doremi' },
    15: { '5,8': 'f15Intro', '5,3': 'maestroIntro' },
  };

  /* 鐵門：指定的格子都清空（怪打倒）就打開 */
  MT.GATES = {
    5: [{ at: [5, 1], when: [[5, 3]] }],
    10: [{ at: [5, 1], when: [[5, 3]] }],
    15: [{ at: [5, 4], when: [[4, 7], [6, 7]] }],
  };

  /* 劇本。指令：
       ['say', 說話者, 文字鍵]       對話（UI）
       ['narr', 文字鍵]               旁白
       ['shake', 毫秒] ['flash', 顏色] ['wait', 毫秒] ['sfx', 名稱] ['music', 曲名] ['fade', 'out'|'in']
       ['emote', 'hero'|[x,y], 符號]  頭上冒符號
       ['sparkle', x, y]              光點特效
       ['fairy', true|false]          多蕾現身／躲回口袋
       —— 以下會改遊戲狀態（解題器也會執行）——
       ['give', 道具, 數量]  ['stat', 屬性, 增量]  ['flag', 名稱]  ['set', x, y, 代碼]  ['layer', 樂器]
       ['ending']                     結局
  */
  MT.SCRIPTS = {
    f1Start: [
      ['fairy', true],
      ['say', 'doremi', 'f1_1'],
      ['say', 'tink', 'f1_2'],
      ['say', 'doremi', 'f1_3'],
      ['sfx', 'item'],
      ['give', 'book', 1],
      ['say', 'doremi', 'f1_4'],
      ['say', 'doremi', 'f1_5'],
      ['fairy', false],
    ],
    bard: [
      ['emote', [3, 5], '♪'],
      ['say', 'bard', 'bard_1'],
      ['fairy', true],
      ['say', 'doremi', 'bard_2'],
      ['say', 'tink', 'bard_3'],
      ['say', 'doremi', 'bard_4'],
      ['sfx', 'item'],
      ['give', 'fly', 1],
      ['say', 'doremi', 'bard_5'],
      ['fairy', false],
      ['flag', 'bardTalked'],
    ],
    bardAgain: [['say', 'bard', 'bard_again']],
    golemIntro: [
      ['music', 'boss'],
      ['shake', 400], ['sfx', 'boom'], ['wait', 300],
      ['shake', 400], ['sfx', 'boom'], ['wait', 300],
      ['say', 'golem', 'golem_1'],
      ['fairy', true],
      ['say', 'doremi', 'golem_2'],
      ['say', 'tink', 'golem_3'],
      ['fairy', false],
    ],
    drumGet: [
      ['flash', '#fff'], ['sparkle', 5, 3],
      ['sfx', 'fanfare'],
      ['give', 'drum', 1],
      ['layer', 'drums'],
      ['music', 'tower'],
      ['narr', 'drum_got'],
      ['fairy', true],
      ['say', 'doremi', 'drum_1'],
      ['say', 'tink', 'drum_2'],
      ['say', 'doremi', 'drum_3'],
      ['fairy', false],
    ],
    sirenIntro: [
      ['music', 'boss'],
      ['sfx', 'harp'],
      ['say', 'siren', 'siren_1'],
      ['fairy', true],
      ['say', 'doremi', 'siren_2'],
      ['say', 'tink', 'siren_3'],
      ['say', 'siren', 'siren_4'],
      ['fairy', false],
    ],
    harpGet: [
      ['flash', '#fff'], ['sparkle', 5, 3],
      ['sfx', 'fanfare'],
      ['give', 'harp', 1],
      ['layer', 'strings'],
      ['music', 'tower'],
      ['narr', 'harp_got'],
      ['say', 'harpghost', 'harp_1'],
      ['fairy', true],
      ['say', 'doremi', 'harp_2'],
      ['say', 'tink', 'harp_3'],
      ['fairy', false],
    ],
    page1: [['sfx', 'page'], ['narr', 'page1_title'], ['narr', 'page1']],
    page2: [['sfx', 'page'], ['narr', 'page2_title'], ['narr', 'page2'], ['fairy', true], ['say', 'doremi', 'page2_r'], ['fairy', false]],
    page3: [['sfx', 'page'], ['narr', 'page3_title'], ['narr', 'page3'], ['fairy', true], ['say', 'doremi', 'page3_r'], ['say', 'tink', 'page3_t'], ['say', 'doremi', 'page3_hint'], ['fairy', false]],
    noteGet: [['sfx', 'harp'], ['sparkle', 5, 1], ['narr', 'note_got'], ['fairy', true], ['say', 'doremi', 'note_1'], ['say', 'tink', 'note_2'], ['fairy', false]],
    f13Voice: [
      ['fade', 'out'],
      ['say', 'maestro', 'f13_1'],
      ['say', 'maestro', 'f13_2'],
      ['fade', 'in'],
      ['say', 'tink', 'f13_3'],
      ['fairy', true],
      ['say', 'doremi', 'f13_4'],
      ['fairy', false],
    ],
    f14Doremi: [
      ['fairy', true],
      ['say', 'doremi', 'f14_1'],
      ['say', 'tink', 'f14_2'],
      ['say', 'doremi', 'f14_3'],
      ['fairy', false],
    ],
    f15Intro: [
      ['music', 'none'],
      ['wait', 600],
      ['say', 'maestro', 'f15_1'],
      ['fairy', true],
      ['say', 'doremi', 'f15_2'],
      ['fairy', false],
      ['music', 'boss'],
    ],
    maestroIntro: [
      ['emote', [5, 1], '…'],
      ['say', 'maestro', 'mi_1'],
      ['say', 'tink', 'mi_2'],
      ['say', 'maestro', 'mi_3'],
    ],
    maestroDrum: [
      ['sfx', 'nohit'],
      ['shake', 200],
      ['narr', 'md_0'],
      ['say', 'maestro', 'md_1'],
      ['fairy', true],
      ['say', 'doremi', 'md_2'],
      ['say', 'tink', 'md_3'],
      ['fairy', false],
      ['music', 'none'],
      ['sfx', 'drumroll'], ['shake', 700], ['wait', 900],
      ['sfx', 'badsing'], ['shake', 1600], ['flash', '#ffd23f'], ['wait', 1800],
      ['say', 'maestro', 'md_4'],
      ['say', 'maestro', 'md_5'],
      ['say', 'maestro', 'md_6'],
      ['set', 5, 1, 'M2'],
      ['flag', 'maestroWeak'],
      ['music', 'boss'],
      ['say', 'maestro', 'md_7'],
    ],
    ending: [
      ['music', 'none'],
      ['wait', 500],
      ['say', 'maestro', 'end_1'],
      ['fairy', true],
      ['say', 'doremi', 'end_2'],
      ['say', 'maestro', 'end_3'],
      ['say', 'tink', 'end_4'],
      ['branch', 'trueEnd', 'trueEndTalk'],  // 三頁日記＋失落的音符都到手 → 真結局的對話
      ['flash', '#fff'],
      ['layer', 'lead'],
      ['ending'],
    ],
    trueEndTalk: [
      ['say', 'doremi', 'te_1'],
      ['sfx', 'harp'], ['sparkle', 5, 1],
      ['narr', 'te_2'],
      ['emote', [5, 1], '♪'],
      ['say', 'maestro', 'te_3'],
      ['say', 'doremi', 'te_4'],
      ['say', 'maestro', 'te_5'],
    ],
  };

  // 撿到日記頁時放的劇本
  MT.PAGE_SCRIPTS = { 1: 'page1', 2: 'page2', 3: 'page3' };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
