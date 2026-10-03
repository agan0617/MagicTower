/* 像素圖：16×16，字元對顏色。sym:true 的只畫左半 8 格，右半鏡射。
   1／2／3 是可替換的顏色（pal），同一張圖換色當不同的怪。 */
(function (MT) {
  'use strict';

  const BASE = {
    k: '#1b1a26', w: '#ffffff', g: '#b8bcc8', G: '#6b7080', d: '#3d4150', e: '#262436',
    r: '#e8453c', R: '#9a2228', o: '#f39a2e', y: '#ffd84a', Y: '#c9921a',
    l: '#8be05a', L: '#3a9a3a', b: '#5ab0ff', B: '#2d5fc0', c: '#aef4ff',
    p: '#c07cf5', P: '#6a34a8', s: '#f7cfa6', S: '#d09468', n: '#9a6634', N: '#5a3a1e', m: '#ff9ccc',
    v: '#0c0914', V: '#7a52c0', x: '#ff3a6a',   // 指揮家：純黑的影子、紫色輪廓光、面具底下發光的眼
    t: '#4fd8cc', T: '#1d6e72', i: '#e4eef6',   // 鏡之迴廊：青綠的光、深青的鏡面、亮銀
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
    // 三種鑰匙與門：銅（最便宜）→ 銀 → 金（最貴），鑰匙和同等級的門同色
    keyCu: { 1: '#d98a4a', 2: '#8a4a1e', 3: '#f6c48e' },
    keyAg: { 1: '#d6deea', 2: '#7c8698', 3: '#ffffff' },
    keyAu: { 1: '#ffd23a', 2: '#b07a10', 3: '#fff3a8' },
    doorY: { 1: '#d98a4a', 2: '#8a4a1e' },
    doorB: { 1: '#d6deea', 2: '#7c8698' },
    doorR: { 1: '#ffd23a', 2: '#b07a10' },
  };
  PALS.gemRed = { 1: '#f0584c', 2: '#9a2228', 3: '#ffd0c8' };
  PALS.gemBlue = { 1: '#4aa0ff', 2: '#1f4fa8', 3: '#d8f0ff' };
  // 鎮民：衣服亮／暗、頭髮
  PALS.vA = { 1: '#5ab0ff', 2: '#2d5fc0', 3: '#5a3a1e' };
  PALS.vB = { 1: '#f39a2e', 2: '#a85a10', 3: '#1b1a26' };
  PALS.vC = { 1: '#8be05a', 2: '#3a9a3a', 3: '#c9921a' };
  PALS.vD = { 1: '#c07cf5', 2: '#6a34a8', 3: '#9a6634' };
  PALS.vE = { 1: '#ff9ccc', 2: '#c04a7a', 3: '#3a2418' };
  PALS.vF = { 1: '#efeadc', 2: '#9a9484', 3: '#b8bcc8' };
  // 3.0 新增的怪物與 NPC 配色
  PALS.ghostW = { 1: '#ffffff', 2: '#aef4ff' };                       // 幽靈預設（白＋淡青）
  PALS.echo = { 1: '#c8fff6', 2: '#2fa8a8' };                         // 回音幽靈：青銀
  PALS.golemS = { 1: '#b8bcc8', 2: '#6b7080', 3: '#ffd84a' };         // 石像魔像預設
  PALS.crystalG = { 1: '#cdb4ff', 2: '#6a4ac0', 3: '#7affff' };       // 水晶魔像
  PALS.crystalBat = { 1: '#e88ad8', 2: '#7a3aa8', 3: '#aef4ff' };     // 水晶蝙蝠：粉紫
  PALS.crystalK = { 1: '#bfe6ff', 2: '#7a4ad0', 3: '#ff6ad8' };       // 水晶騎士
  PALS.beetle = { 1: '#4a8ad0', 2: '#22407a', 3: '#bfe4ff' };         // 鎧甲蟲：鋼藍硬殼
  PALS.stoneP = { 1: '#9a9eaa', 2: '#585c6a', 3: '#ff6a3a' };         // 石像鬼（夾擊）
  PALS.mirrorP = { 1: '#d4eef2', 2: '#4f9aa6', 3: '#ff4ad0' };        // 鏡像守衛（夾擊）
  PALS.goldEq = { 1: '#ffe066', 2: '#c08a10', 3: '#e8453c' };         // 金劍／金盾：金、暗金、紅寶石
  PALS.mirrorA = { 1: '#d8eaf2', 2: '#5f8496', 3: '#5ff0e0' };        // 鏡之祭壇
  PALS.metroA = { 1: '#ffd84a', 2: '#c9921a', 3: '#fff3b0' };         // 節拍之神（金鈴）：金、暗金、亮面
  PALS.metroB = { 1: '#bfe4ff', 2: '#5f84d8', 3: '#ffffff' };         // 節拍之神（進階，銀藍大鈴）
  PALS.soldierP = { 1: '#a8b0c0', 2: '#5a6274', 3: '#3d6fe0' };       // 受傷的士兵：鐵甲、藍罩袍
  PALS.lastGuard = { 1: '#e6c66a', 2: '#8a6a2a', 3: '#c83a3a' };      // 最後的守衛：金甲、紅罩袍
  PALS.resonator = { 1: '#efe6ff', 2: '#9a7ae8', 3: '#ff9cf0' };      // 共鳴水晶（3.1）：淡紫晶體、粉色共振光

  const S = {
    // ── 王子阿爾特（綽號小鐵）：頭上小王冠 ──
    // 地圖上的 heroDown／heroUp／heroSide 由下面的 MT.heroSprite 組出來（身體＋武器＋盾＋披風，跟著變強換外形）
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
    // 序章被笑之後：八字眉、眼睛往下看、掛著淚、嘴抿成一小撇
    heroSad: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnNnnNnnk...',
      '...knssssssnk...',
      '...kssNssNssk...',
      '...ksNksskNsk...',
      '....kscSScsk....',
      '...kkkkkkkkkk...',
      '..ksbbnnnnbbsk..',
      '..ksbbnnnnbbsk..',
      '..kkbbnnnnbbkk..',
      '....kbnnnnbk....',
      '....kbbkkbbk....',
      '....kNNk.kNNk...',
      '....kkkk.kkkk...',
    ] },
    // 序章逃出練唱廳：還沒拿鐵鎚、眉尾垂下、眼角掛著淚往前跑（A 步伐張開、B 收攏，輪流畫就是在跑）
    heroRunA: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnsNsk....',
      '...knnnsskskk...',
      '...knnnsscsssk..',
      '....knnssSkk....',
      '....kkkkkkkk....',
      '...kbbnnnnbk....',
      '..ksbbnnnnbsk...',
      '..kkbbnnnnbkk...',
      '....kbnnnnbk....',
      '...kbbk..kbbk...',
      '..kNNk....kNNk..',
      '..kkkk....kkkk..',
    ] },
    heroRunB: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnsNsk....',
      '...knnnsskskk...',
      '...knnnsscsssk..',
      '....knnssSkk....',
      '....kkkkkkkk....',
      '...kbbnnnnbk....',
      '...kbbnnnnsk....',
      '...kbbnnnnsk....',
      '....kbnnnnbk....',
      '....kbbkbbbk....',
      '....kNNkkNNk....',
      '....kkkkkkkk....',
    ] },
    // 序章躲在打鐵鋪：眉頭壓低、嘴抿成一條線的臭臉
    heroSideSulk: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnskkk....',
      '...knnnsskskk...',
      '...knnnssssssk..',
      '....knnssskkk...',
      '....kkkkkkkk....',
      '...kbbnnnnbk.GG.',
      '...kbbnnnnsk.GG.',
      '...kbbnnnnskkn..',
      '....kbnnnnbkn...',
      '....kbbkbbbk....',
      '....kNNkkNNk....',
      '....kkkkkkkk....',
    ] },
    // 序章遇見多蕾：眼睛瞪大、嘴巴張成小 o 的傻眼臉
    heroSideShock: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnsksk....',
      '...knnnsskskk...',
      '...knnnssssssk..',
      '....knnsssksk...',
      '....kkkkkkkk....',
      '...kbbnnnnbk.GG.',
      '...kbbnnnnsk.GG.',
      '...kbbnnnnskkn..',
      '....kbnnnnbkn...',
      '....kbbkbbbk....',
      '....kNNkkNNk....',
      '....kkkkkkkk....',
    ] },
    // 序章第一次看到靜默之塔：眉毛挑高、眼睛瞪大露出眼白、嘴巴張開的驚嚇臉
    heroSideScared: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnsksk....',
      '...knnnswkskk...',
      '...knnnswwsssk..',
      '....knnssRRsk...',
      '....kkkkkRkk....',
      '...kbbnnnnbk.GG.',
      '...kbbnnnnsk.GG.',
      '...kbbnnnnskkn..',
      '....kbnnnnbkn...',
      '....kbbkbbbk....',
      '....kNNkkNNk....',
      '....kkkkkkkk....',
    ] },
    // 序章說「應該是我害的吧」：眼皮垂下、往下看的心虛臉
    heroSideGuilty: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnsssk....',
      '...knnnssSskk...',
      '...knnnssksssk..',
      '....knnsssSsk...',
      '....kkkkkkkk....',
      '...kbbnnnnbk.GG.',
      '...kbbnnnnsk.GG.',
      '...kbbnnnnskkn..',
      '....kbnnnnbkn...',
      '....kbbkbbbk....',
      '....kNNkkNNk....',
      '....kkkkkkkk....',
    ] },
    // 序章吼「全部都給我閉嘴」：眉頭壓低、嘴張到最大、臉漲紅
    heroSideAngry: { rows: [
      '.....y.yy.y.....',
      '....kyyyyyyk....',
      '....knnnnnnk....',
      '...knnnnnNnnk...',
      '...knnnnskkk....',
      '...knnnsskskk...',
      '...knnnrsssssk..',
      '....knnssRRRk...',
      '....kkkkkRRk....',
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
    // 幽靈與魔像用 1／2／3 上色（預設 pal ghostW／golemS 跟原本一樣），回音幽靈 echo、水晶魔像 crystalG 換色
    ghost: { sym: true, pal: 'ghostW', rows: [
      '........', '.....kkk', '....k111', '...k1111', '..k11111', '..k11kk1',
      '..k11kk1', '..k11111', '.k11111k', '.k1111kk', '.k211111', '.k221111',
      '.k222111', '..k222k2', '...kkk.k', '........',
    ] },
    golem: { sym: true, pal: 'golemS', rows: [
      '........', '...kkkkk', '..k11121', '..k11211', '..k13321', '..k11121',
      '.kk22222', 'k11k1111', 'k12k1211', 'k11k1112', 'k22k2111', 'kkkk1111',
      '....k22k', '...k112k', '...k222k', '...kkkkk',
    ] },
    rest: { sym: true, rows: [
      '......kk', '....kkPP', '...kPPPP', '..kPPPPP', '..kPPkkk', '..kPkkrk',
      '..kPkkkk', '...kPPPP', '..kkPkwk', '.kPPkPPw', 'kPPPkPwP', 'kPkPkPPP',
      'kk.kPPPP', '...kPPPk', '..kPPPk.', '..kkkk..',
    ] },
    // 共鳴水晶（3.1）：一叢尖尖的水晶，中間那根像音叉，兩隻小眼睛；3 是共振的亮光
    resonator: { sym: true, pal: 'resonator', rows: [
      '.......k', '......k3', '..k...k3', '.k3k..k1', '.k31k.k1', '.k11kk11',
      '..k1k211', '..k2k211', '..kk1kw1', '..k11111', '.k221111', '.k222211',
      'k2222222', 'kkkkkkkk', '.3......', '........',
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
    // 靜默指揮家：沒有身體的純黑影子，輪廓是阿爾特的剪影（頭上同樣的王冠尖角＝伏筆），
    // 臉上一張只會微笑的白面具、眼洞透出紅光，下襬散成煙——每個人心裡那個想把一切關掉的自己
    maestro: { sym: true, rows: [
      '.....V.V', '....Vvvv', '...Vvvvv', '..Vvvwww', '..Vvwkxw', '..Vvwwww',
      '..Vvwkww', '..Vvwwkk', '..Vvvwww', '.Vvvvvvw', 'Vvvvvvvv', 'Vvvvvvvv',
      'Vvvvvvvv', '.Vvvvvvv', '..Vvvvvv', '...Vvvvv',
    ] },
    // 面具裂開後：底下是阿爾特自己的臉
    maestroBare: { sym: true, rows: [
      '.....V.V', '....Vvvv', '...Vvvvv', '..Vvnnnn', '..Vnnsss', '..Vvssks',
      '..Vvssss', '..Vvvssm', '..Vvvvss', '.Vvvvvvv', 'Vvvvvvvv', 'Vvvvvvvv',
      'Vvvvvvvv', '.Vvvvvvv', '..Vvvvvv', '...Vvvvv',
    ] },
    // 序章廣場上唱歌的鎮民：1／2 衣服、3 頭髮，換 pal 就是不同的人；Sing 是張嘴的那一格
    villager: { sym: true, rows: [
      '........', '.....kkk', '....k333', '...k3333', '...k33ss', '...kssss',
      '...kskss', '...kssss', '....kssk', '....ksss', '..kk1111', '.k112111',
      '.k112111', '.ks12111', '..k22222', '...kkkkk',
    ] },
    villagerSing: { sym: true, rows: [
      '........', '.....kkk', '....k333', '...k3333', '...k33ss', '...kssss',
      '...kskss', '...kssss', '....kssR', '....ksRR', '..kk1111', '.k112111',
      '.k112111', '.ks12111', '..k22222', '...kkkkk',
    ] },

    // ── NPC ──
    // 國王巴索：王冠、白鬍子、紅袍（代碼沿用原版的吟遊詩人 bard）
    bard: { sym: true, rows: [
      '........', '....y.yy', '...kyyyy', '...kssss', '...kskss', '...kssss',
      '...kwwww', '..kkkwww', '.krrrrww', 'krrrrrrw', 'krRrrrrw', 'krRrrrrw',
      'krRrrrrw', '.krrrrrw', '.krrrrrw', '.kkkkkkk',
    ] },
    // 老鐵匠：禿頭、灰色鬢角與粗眉、大把灰鬍子、皮圍裙、捲起袖子的粗手臂
    smith: { sym: true, rows: [
      '........', '....kkkk', '...kssss', '..kgssss', '..kgggss', '..kgsksS',
      '..kssssS', '...kgggg', '..kggggg', '.kkggggg', 'ksskeggg', 'ksskennn',
      'ksskennn', '.kkkennn', '...kNNNN', '...kkkkk',
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
    // 上樓梯：側面看往右上爬的四階樓梯，左上角一個黃色向上箭頭
    stairsUp: { rows: [
      '................',
      '...yy.....kkkkk.',
      '..yyyy....kgggk.',
      '.yyyyyy...kGGGk.',
      '...yy..kkkkGGGk.',
      '...yy..kgggGGGk.',
      '...yy..kGGGGGGk.',
      '....kkkkGGGGGGk.',
      '....kgggGGGGGGk.',
      '....kGGGGGGGGGk.',
      '.kkkkGGGGGGGGGk.',
      '.kgggGGGGGGGGGk.',
      '.kGGGGGGGGGGGGk.',
      '.kGGGGGGGGGGGGk.',
      '.kkkkkkkkkkkkkk.',
      '................',
    ] },
    // 下樓梯：跟上樓梯同風格，左右鏡射成往右下走的四階樓梯，右上角一個黃色向下箭頭
    stairsDown: { rows: [
      '................',
      '.kkkkk.....yy...',
      '.kgggk.....yy...',
      '.kGGGk.....yy...',
      '.kGGGkkkkyyyyyy.',
      '.kGGGgggk.yyyy..',
      '.kGGGGGGk..yy...',
      '.kGGGGGGkkkk....',
      '.kGGGGGGgggk....',
      '.kGGGGGGGGGk....',
      '.kGGGGGGGGGkkkk.',
      '.kGGGGGGGGGgggk.',
      '.kGGGGGGGGGGGGk.',
      '.kGGGGGGGGGGGGk.',
      '.kkkkkkkkkkkkkk.',
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
    // 鑰匙分三級，越高級越豪華（pal keyCu／keyAg／keyAu）：
    // 銅＝透空的小圓環、樸素的柄、雙齒；銀＝大圓環＋柄上一圈裝飾、雙齒；金＝頂上王冠、環心一顆紅寶石、閃光、雙齒
    key1: { rows: [
      '................',
      '................',
      '......kkkk......',
      '.....k3311k.....',
      '....k31kk12k....',
      '....k1k..k2k....',
      '....k1k..k2k....',
      '....k12kk22k....',
      '.....k1222k.....',
      '......k12k......',
      '......k12k......',
      '......k12kkk....',
      '......k1222k....',
      '......k12kkk....',
      '......k1222k....',
      '......kkkkkk....',
    ] },
    key2: { rows: [
      '................',
      '.....kkkkkk.....',
      '....k331111k....',
      '...k31kkkk12k...',
      '...k3k....k2k...',
      '...k1k....k2k...',
      '...k12kkkk22k...',
      '....k122222k....',
      '.....kk12kk.....',
      '.....k3112k.....',
      '.....kk12kk.....',
      '......k12kkk....',
      '......k12222k...',
      '......k12kkk....',
      '......k12222k...',
      '......kkkkkkk...',
    ] },
    key3: { rows: [
      '....k..kk..k..w.',
      '...k3kk31kk1kwww',
      '...k33111111k.w.',
      '..k311kkkk112k..',
      '..k31kwrrrk12k..',
      '..k11krrRRk22k..',
      '..k112kkkk222k..',
      '...k12222222k...',
      '....kkk12kkk....',
      '.....k3112k.....',
      '.....kk12kk.....',
      '......k12kkkk...',
      '......k12222k...',
      '......k12kkkk...',
      '......k12222k...',
      '......kkkkkkk...',
    ] },
    // 加生命的道具：小愛心（hp）、金邊大愛心＋右上角閃光（HP）。跟狀態列的生命愛心同一個形象
    heartS: { rows: [
      '................',
      '................',
      '................',
      '................',
      '....kkk..kkk....',
      '...krrrkkrrrk...',
      '..krwwrrrrrrRk..',
      '..krwrrrrrrrRk..',
      '..krrrrrrrrRRk..',
      '...krrrrrrRRk...',
      '....krrrrRRk....',
      '.....krrRRk.....',
      '......krRk......',
      '.......kk.......',
      '................',
      '................',
    ] },
    heartBig: { rows: [
      '..............w.',
      '.............www',
      '..kkk......kkkw.',
      '.kyyyk....kyyyk.',
      'kyrrryk..kyrrryk',
      'kyrwwrykkyrrrRyk',
      'kyrwrrrrrrrrRRyk',
      'kyrrrrrrrrrrRRyk',
      '.kyrrrrrrrrRRyk.',
      '..kyrrrrrrRRyk..',
      '...kyrrrrRRyk...',
      '....kyrrRRyk....',
      '.....kyRRyk.....',
      '......kyyk......',
      '.......kk.......',
      '................',
    ] },
    // 加攻／加防的小道具（pal gemRed／gemBlue）：直立的小劍、金邊小盾，右上角一顆閃光；
    // 跟鐵劍銀劍（斜放、鐵色）這類裝備分得開。狀態列的攻擊／防禦也用這兩張
    gemSword: { rows: [
      '.......kk.......',
      '......k31k...w..',
      '.....k3112k.www.',
      '.....k3112k..w..',
      '.....k3112k.....',
      '.....k3112k.....',
      '.....k3112k.....',
      '.....k3112k.....',
      '.....k3112k.....',
      '..kkkk3112kkkk..',
      '..kyyyyyyyyyyk..',
      '..kkkkkNNkkkkk..',
      '......kNNk......',
      '......kNNk......',
      '.....kyyyyk.....',
      '......kkkk......',
    ] },
    gemShield: { rows: [
      '..............w.',
      '.............www',
      '...kkkkkkkkkk.w.',
      '..kyyyyyyyyyyk..',
      '..ky311yy112yk..',
      '..ky311yy112yk..',
      '..ky3yyyyyy2yk..',
      '..ky311yy112yk..',
      '..ky311yy112yk..',
      '...ky31yy12yk...',
      '...ky31yy12yk...',
      '....ky3yy2yk....',
      '.....kyyyyk.....',
      '......kyyk......',
      '.......kk.......',
      '................',
    ] },
    // 狀態列生命／金幣的圖示（不在地圖上出現）
    heart: { rows: [
      '................',
      '................',
      '...kkk....kkk...',
      '..krrrk..krrrk..',
      '.krwwrrkkrrrrRk.',
      '.krwrrrrrrrrrRk.',
      '.krrrrrrrrrrrRk.',
      '.krrrrrrrrrrRRk.',
      '..krrrrrrrrRRk..',
      '...krrrrrrRRk...',
      '....krrrrRRk....',
      '.....krrRRk.....',
      '......krRk......',
      '.......kk.......',
      '................',
      '................',
    ] },
    coin: { rows: [
      '................',
      '................',
      '.....kkkkkk.....',
      '...kkyyyyyykk...',
      '..kyyyyyyyyyYk..',
      '..kywyYYYYyyYk..',
      '.kywyYyyyyYyyYk.',
      '.kyyyYyyyyYyyYk.',
      '.kyyyYyyyyYyyYk.',
      '.kyyyYyyyyYyyYk.',
      '..kyyyYYYYyyYk..',
      '..kyyyyyyyyYYk..',
      '...kkYYYYYYkk...',
      '.....kkkkkk.....',
      '................',
      '................',
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
    // 放大鏡：功能鍵列的「查看」
    lens: { rows: [
      '................',
      '................',
      '................',
      '....kkkkk.......',
      '...kgcccgk......',
      '..kgcwwccgk.....',
      '..kgcwcccgk.....',
      '..kgcccccgk.....',
      '...kgcccgkk.....',
      '....kkkkkGGk....',
      '.........kGnk...',
      '..........knnk..',
      '...........knnk.',
      '............kk..',
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

    // ══ 3.0 新增 ══
    // ── 怪物 ──
    // 鎧甲蟲：鋼藍硬殼、中縫、頭上一根角（pal beetle）
    beetle: { sym: true, pal: 'beetle', rows: [
      '........', '..d....k', '...d..kg', '....kkkg', '...kdddd', '...kdrdd',
      '..kkkkkk', '.k33111k', 'dk31111k', '.k31111k', 'dk11111k', '.k11112k',
      'dk11122k', '..k1222k', '...kkkkk', '........',
    ] },
    // 雙刀劍士：紅頭巾、藍道服，兩手各握一把直立的刀
    swordsman: { sym: true, rows: [
      '.k......', 'kwk.....', 'kwg..kkk', 'kwg.kRRR', 'kwg.ksks', 'kwg.ksss',
      'kwg..kss', 'kwg.kBBb', 'kyyykbbb', '.kssskbb', '..Nk.kbb', '..k..kyy',
      '....kBBB', '....kBBk', '....kNNk', '....kkkk',
    ] },
    // 石像鬼：成對出現夾擊（pal stoneP／mirrorP）
    statue: { sym: true, pal: 'stoneP', rows: [
      '........', '.k......', '.k1k..kk', '..k1kk11', '..kk1111', 'k..k1311',
      'kk.k1111', 'k1k.k222', 'k11kk111', 'k121k111', 'k1221k11', 'k2221k11',
      '.kkk2k11', '...kk1k1', '.k222222', '.kkkkkkk',
    ] },
    // 胖老鼠：圓滾滾、大門牙、眨一隻眼，尾巴從右下角捲出來
    rat: { rows: [
      '................',
      '.kkk........kkk.',
      'kmmGk......kGmmk',
      'kmmGkkkkkkkkGmmk',
      '.kkggggggggggkk.',
      '..kggggggggggk..',
      '.kggkwggggggggk.',
      '.kggkkggggkkggk.',
      'kggggggmmggggggk',
      'kgmgggkkkkgggmgk',
      'kgggggkwwkgggggk',
      'kgGgwwwwwwwwgGgk',
      'kgGwwwwwwwwwwGgk',
      '.kGgwwwwwwwwgGkm',
      '..kGGggggggGGk.m',
      '..kmmkkkkkkmmkm.',
    ] },
    // 鏡片小惡魔：銀色的頭、青綠的碎鏡翅膀
    mirrorImp: { sym: true, rows: [
      '........', '.k......', '.kik....', '..kik.kk', '...kkiii', '...kiggg',
      'kk.kgxgg', 'kik.kgkw', 'kitk.kkk', 'kittkTtc', 'kitTkTct', '.kTkkTtc',
      '..k.kTtt', '....kTtk', '....kTk.', '....kk..',
    ] },
    // 詩班歌者：紫色兜帽、白色披肩，張嘴唱出魔法
    chorister: { sym: true, rows: [
      '.....kkk', '....kppp', '...kpppp', '..kppPPP', '..kpPsss', '..kpPsks',
      '..kpPsss', '..kpPssk', '.kppPssR', '.kpppPsk', '.kppppkw', 'kpppkwww',
      'kpppkwww', 'kppPkwww', 'kpPPkwgw', 'kkkkkkkk',
    ] },
    // 夜梟：大黃眼、耳羽、胸前羽紋
    owl: { sym: true, rows: [
      '........', '..k.....', '..kk....', '..knkkkk', '.knnnnnn', '.knkkkkn',
      '.kkyyyyk', '.kkykkyo', '.kkyyyyo', '.knkkkko', '.kNnSSSS', 'kNNnSnSS',
      'kNNnSSSS', '.kNNnSnS', '..kNNnnn', '...koko.',
    ] },
    // 暗影刺客：深色兜帽、紫水晶飾邊、紅眼，右手一把水晶短刀
    assassin: { rows: [
      '................',
      '.......kk.......',
      '......kppk......',
      '.....kdppdk.....',
      '....kddddddk.kk.',
      '...kddkkkkddkwck',
      '...kdkxkkxkdkwck',
      '...kddkkkkddkwck',
      '....keeeeeekkwck',
      '...kkdeeeedkkwck',
      '..kdddkppkddkppk',
      '.kdddpkppkpdkssk',
      '.kddppkddkppddk.',
      '.kdppkddddkppdk.',
      '.kddkddddddkddk.',
      '.kkkkkkkkkkkkkk.',
    ] },

    // ── 中頭目（2×2 格，16×16 放大畫）──
    // 骷髏館長：金冠、紅眼窩、紫袍金領，骨頭手捧著一本攤開的書
    skelking: { sym: true, rows: [
      '....y..y', '...kyyyy', '...kyryy', '..kwwwww', '..kwwwww', '..kwkkww',
      '..kwkrww', '..kwwwwk', '...kwwww', '...kwkwk', '.kPykkkk', 'kPpPykkk',
      'kPpRwggk', 'kPwRwwgk', 'kPwRkkkk', 'kkkkkkkk',
    ] },
    // 獄卒長：鐵盔、皮背心、右手舉狼牙棒、腰上一串鑰匙
    jailer: { rows: [
      '...........kkk..',
      '....kkkkk.knnnk.',
      '...kGgggGkknnnk.',
      '...kGGGGGkknNnk.',
      '...kskkskk.knNk.',
      '...ksssssk.knNk.',
      '...kSRRRSk.knk..',
      '..kkkSSSkkk.knk.',
      '.kNnnkkknnNkkssk',
      'kNnnnnnnnnnNkssk',
      'ksnnnnnnnnnnkkk.',
      'kssknnyyynnk....',
      'kkkgyknnnnnk....',
      '.kgkgknNNnnk....',
      '..kgk.kNkNNk....',
      '......kkkkkk....',
    ] },
    // 鏡之騎士：銀甲、青綠盔纓與目光，胸前一面鏡盾
    mirrorKnight: { sym: true, rows: [
      '......kt', '.....ktt', '....kkii', '...kiiii', '...kigii', '...kikkk',
      '...kgkck', '...kgggg', '.kkkkkkk', 'kiigkcwt', 'kgGgkctt', 'kgkgkttt',
      'kk.gkttT', '...kkttT', '....kkTT', '.....kkk',
    ] },
    // 回音指揮：影子般的高帽禮服、紫色輪廓光與眼睛，右手高舉指揮棒
    conductor: { rows: [
      '................',
      '.....VVVVV....w.',
      '.....VvvvV...wV.',
      '.....VvvvV..wV..',
      '...VVkkkkkVwV...',
      '....VvvvvvkV....',
      '....VvpvpvV.....',
      '....VvvvvvV.VwV.',
      '..VVkVvvvVkVkwV.',
      '.VvvvVwwVvvvvV..',
      'VwkvvVwwVvvkV...',
      'VwVvvvVVvvvV....',
      '.V.VvvvvvvvV....',
      '...VvvvVvvvV....',
      '...VvvV.VvvV....',
      '...VVV...VVV....',
    ] },

    // ── 大頭目（3×3 格，24×24）──
    // 鼓之魔像：太鼓身體、金邊鉚釘、鼓面上的臉，兩手高舉鼓棒
    drumgolemBig: { sym: true, size: 24, rows: [
      '............', '.kk.........', 'kwnk........', 'knnk...kkkkk', '.kNk.kkyyyyy', '.kNkkyywwwww',
      '.kNkywwwwwww', 'kgggkywwwwww', 'kgGgkkyyyyyy', 'kgggkyYkYYkY', '.kgGkrrrrrrr', '.kgGkrrkkkrr',
      '.kgGkrkyyykr', '.kGGkrrkkkrr', 'kggGkrrrrrrr', 'kgGGkrRrkwkw', 'kkkkkrRrrkkk', '....krRrrrrr',
      '....kyykyyky', '....kYYYYYYY', '.....kkkkkkk', '......kgggGk', '.....kggGGGk', '.....kkkkkkk',
    ] },
    // 弦之魔女：藍色長髮、蒼白的臉與紅眼、金色豎琴冠，背後一副金色豎琴，琴弦往下化成鎖鏈
    sirenBig: { sym: true, size: 24, rows: [
      'kk..........', 'kyk.........', 'kyk......y.y', '.kyk.....yyy', '.kyk...kkbbb', '.kyk..kbbbbb',
      '.kykc.kbbBBB', '.kykckbbBiii', '.kykckbbBixi', '.kykckbbBiii', '..kyckbbBiir', '..kyckbbbBii',
      '..kyckbbbbki', '...kgkbbbkBB', '...kGkbbkBbB', '...kgkbkBbii', '...kGkkBbBBB', '...kgk.kBbBB',
      '...kGk.kBBbB', '...kgk.kbBBb', '..kgGgkkBbBB', '..kGkGkcBBbB', '..kkkkkccccc', '......kkkkkk',
    ] },
    // 回音之鏡：銀色雕花鏡框、青綠的光，鏡子裡是小時候戴著小王冠在唱歌的阿爾特剪影，兩旁飄著音符
    echoMirror: { sym: true, size: 24, rows: [
      '..........kk', '.........ktt', '.......kkgti', '.....kkgiiii', '....kgiikkkk', '...kgikkTTTT',
      '...kgkTTcTTT', '..kgikTcTTTT', '..kgkTTTTTTT', '..kgkTTTTyTy', '..ktkTTTTyyy', '..kgkTcTTvvv',
      '..kgkTcTTvvv', '..kgkccTTvvt', '..ktkccTTvvv', '..kgkTTTTTvv', '..kgkTTTvvvv', '..kgkTTvvvvv',
      '..kgkTTvvvvv', '..kgikkkkkkk', '...kgiiiiiii', '....kkGGkkkk', '....kGGk....', '...kkkkk....',
    ] },
    // 靜默指揮家（大）：純黑影子、紫色輪廓光、王冠尖角的剪影、白色微笑面具＋紅色眼洞，
    // 右手高舉指揮棒、左手垂下，下半身散成煙
    maestroBig: { size: 24, rows: [
      '.......V.V.VV.V.V......w',
      '......VvVvVvvVvVvV.....w',
      '......VvvvvvvvvvvV....w.',
      '.....VvvvvvvvvvvvvV...w.',
      '.....VvvwwwwwwwwvvV.VVw.',
      '.....VvwwwwwwwwwwvV.VvV.',
      '.....VvwkxwwwwxkwvV.VvV.',
      '.....VvwkkwwwwkkwvV.VvV.',
      '.....VvwwwwwwwwwwvV.VvV.',
      '.....VvwkwwwwwwkwvV.VvV.',
      '.....VvvwkkkkkkwvvV.VvV.',
      '......VvvwwwwwwvvV..VvV.',
      '.....VVvvvvvvvvvvVvvvvV.',
      '...VVvvvvvvvvvvvvvvvvvV.',
      '.VVvvvvvvvvvvvvvvvvvvvV.',
      'VvvvvvvPvvvvvvvvPvvvvV..',
      'VvvVvvvvPvvvvvvPvvvvV...',
      'Vvv.VvvvvPvvvvPvvvvvV...',
      'VvV.VvvvvvPvvPvvvvvV....',
      'V.V..VvvvvvvvvvvvvvV....',
      '.....VvvPvvvvvvPvvV.....',
      '......VvvVvvvvVvvV......',
      '.......V.vvVVvv.V.......',
      '........V..vv..V........',
    ] },

    // ── NPC ──
    // 節拍之神：會動的節拍器，凹槽裡一根擺錘＋砝碼，下面一張笑臉（pal metroA 石木／metroB 水晶金）
    // 節拍之神＝金色鈴鐺精靈（3.2.3 Ken 選的；原本的節拍器兩版都被嫌醜）：頂上一個掛環、圓頂鈴身上一張小臉＋腮紅，
    // 下緣外翻的金邊、底下吊著鈴舌。代碼沿用 metronome（pal metroA 金／metroB 銀藍）
    metronome: { pal: 'metroA', rows: [
      '.......kk.......',
      '......k33k......',
      '.....kkkkkk.....',
      '....k331111k....',
      '...k33111112k...',
      '...k31111112k...',
      '...k31k11k12k...',
      '...k3m1kk1m2k...',
      '...k31111112k...',
      '..k3111111112k..',
      '.k311111111122k.',
      'k33333333333332k',
      'k22222222222222k',
      '.kkkkkkkkkkkkkk.',
      '......k22k......',
      '.......kk.......',
    ] },
    // 豎琴賢者：白色長鬚、藍袍，抱著一把小豎琴
    harpist: { rows: [
      '................',
      '.....kkkkkk.....',
      '....kssssssk....',
      '...kwsssssswkkk.',
      '...kwwwsswwwkyk.',
      '...kwksssskwkyyk',
      '...kwssssssw.kyk',
      '...kwwwwwwwwkcyk',
      '..kBwwwwwwwwkcyk',
      '.kBBwwwwwwwkcsyk',
      '.kbBwwwwwwwkcsyk',
      'kbbBkwwwwkbkcyyk',
      'kbbBkwwwwkbkyyk.',
      'kbbBBkwwkBbbkk..',
      'kbbbBBkwkBBbbk..',
      'kkkkkkkkkkkkkk..',
    ] },
    // 青蛙商人的表哥：高禮帽、單片眼鏡＋金鍊、紅領結，半瞇著眼一臉得意
    frogCousin: { rows: [
      '....kkkkkkkk....',
      '....keeeeeek....',
      '....kRRRRRRk....',
      '..kkkkkkkkkkkk..',
      '..klllllllyyyk..',
      '.klLLLlllyLLLyk.',
      '.klkwklllykwkyk.',
      '.kllklllllyyylk.',
      '.klllkkkkkkkkyk.',
      '..klllRkkRlllk..',
      '.knnlyyllyylnnk.',
      'knnnkyyllyyknnnk',
      'knnnkllllllknnnk',
      '.kkklLllllLlkkk.',
      '...kLLkLLkLLk...',
      '...kkkkkkkkkk...',
    ] },
    // 老守門人：藍帽、灰鬍渣、棕外套，右手提一盞燈
    porter: { rows: [
      '................',
      '.....kkkkkk.....',
      '....kBBBBBBk....',
      '...kkkkkkkkkk...',
      '....kSssssSk....',
      '....kskssksk....',
      '....kgssssgk....',
      '....kggSSggk....',
      '...kkkggggkkk...',
      '..knnnkggknnnk..',
      '..knnnnkknnnnk..',
      '..ksnnnnnnnnsk..',
      '..kkNnnnnnnNkkk.',
      '....kNnnnnNkyyk.',
      '....kNNkkNNkwyk.',
      '....kkkk.kkkkkk.',
    ] },
    // 受傷的士兵：頭上纏著繃帶（1／2 盔甲、3 罩袍；pal lastGuard 是最後的守衛）
    soldier: { pal: 'soldierP', rows: [
      '................',
      '.....kkkkkk.....',
      '....k111111k....',
      '...k11111111k...',
      '...kk222222kk...',
      '....kwwwwwrk....',
      '....kskssksk....',
      '....ksssssSk....',
      '.....kskksk.....',
      '...kk111111kk...',
      '..k11k3333k11k..',
      '..k1k333333k1k..',
      '..ksk3w3333ksk..',
      '...kk3333w3kk...',
      '....k22kk22k....',
      '....kkkk.kkkk...',
    ] },
    // 喜劇小偷：黑面罩、條紋衫，肩上扛著一大袋
    thief: { rows: [
      '................',
      '..kkk....kkkk...',
      '.kSSSk..keeeek..',
      'kSSSSSk.kssssk..',
      'kSSSSSSkeweewek.',
      'kSSSSSSSkssssk..',
      'kSNSSSSsksRRsk..',
      'kSNSSSSkkwewewk.',
      '.kSNNSkkewewewek',
      '..kkkk.kwewewewk',
      '.......kewewewek',
      '.......kswewewsk',
      '........kNNNNNk.',
      '........kNkkNk..',
      '.......kNk..kNk.',
      '.......kkk..kkk.',
    ] },
    // 鏡中少女：銀色長髮、青綠洋裝，右手拿著一面小手鏡
    mirrorGirl: { rows: [
      '................',
      '.....kkkkkk.....',
      '....kiiiiiik....',
      '...kiiiiiiiik...',
      '...kiissssiik...',
      '..kiissssssiik..',
      '..kiskssssksik..',
      '..kissssssssikkk',
      '..kiissmmssiikwc',
      '..kiiksssskiikcc',
      '.kiiktTTTTtkiikk',
      '.kikttttttttksN.',
      '.kikTttttttTkik.',
      '..ktTttttttTtk..',
      '.kTTTTTTTTTTTTk.',
      '.kkkkkkkkkkkkkk.',
    ] },
    // 豎琴學徒：橘頭巾、圍裙，手上一把調音扳手
    apprentice: { rows: [
      '................',
      '.....kkkkkk.....',
      '....kNNNNNNk....',
      '...kooooooook...',
      '...kNssssssNk...',
      '...ksksssksk.kk.',
      '...ksssssssk.kgk',
      '....ksmmmsk..kgk',
      '...kbkkkkkbk.kgk',
      '..kbbkbbbbkbkskk',
      '.kbbknnnnnnkbsk.',
      '.kbknnnnnnnnkk..',
      '.ksknnnyynnnk...',
      '..kknnnnnnnnk...',
      '...kNNk..kNNk...',
      '...kkkk..kkkk...',
    ] },
    // 占星師：星星尖帽、星袍，右手舉著望遠鏡
    astrologer: { rows: [
      '.......kk.......',
      '......kBBk......',
      '......kBBk....kk',
      '.....kByBBk..kyk',
      '.....kBBBBk.kYyk',
      '....kBBBByBkYyk.',
      '..kkkkkkkkkkyk..',
      '....kSssssSkk...',
      '....ksksskssk...',
      '....kwwwwwwk....',
      '...kBwwwwwwkk...',
      '..kBBkwwwwkskk..',
      '.kBBBBkwwkBBBk..',
      '.kByBBBkkBBByBk.',
      '.kBBBBBByBBBBBk.',
      '.kkkkkkkkkkkkkk.',
    ] },
    // 小偷的奶奶：灰髮髻、紅撲撲的臉頰、紫披肩，拄著拐杖笑咪咪
    granny: { rows: [
      '................',
      '................',
      '.......kk.......',
      '......kggk......',
      '.....kkkkkk.....',
      '....kggggggk....',
      '....kgssssgk....',
      '....kskssksk....',
      '....kmssssmk....',
      '....ksSkkSsk....',
      '...kppkkkkppk...',
      '..kppppppppppknn',
      '..kPpppppppPPksn',
      '...kPPPPPPPPk.n.',
      '....kRRRRRRk..n.',
      '....kkkkkkkk.kk.',
    ] },
    // 信鴿：戴藍色郵差帽，腳上綁著紅色信筒
    pigeon: { rows: [
      '................',
      '.....kkkk.......',
      '....kBBBBk......',
      '...kkkkkkkk.....',
      '...kgggggk......',
      '..kgokgggk......',
      'kyyggggggk......',
      '.kkggtpttgk.....',
      '...ktpttgggkk...',
      '...kgggGGgggGkk.',
      '...kgggggGGGGGGk',
      '....kggggggGGkkk',
      '.....kgggggkkk..',
      '......kkrrk.....',
      '......koko......',
      '.....kk.kk......',
    ] },

    // ── 道具 ──
    // 老鐵匠的鑿子：鐵刃、銅箍、木柄
    chisel: { rows: [
      '................',
      '.............kk.',
      '............kwgk',
      '...........kwggk',
      '..........kwggk.',
      '.........kwggk..',
      '........kwggk...',
      '.......kkYYk....',
      '......knnkk.....',
      '.....knnNk......',
      '....knnNk.......',
      '...knnNk........',
      '..knnNk.........',
      '..kNNk..........',
      '...kk...........',
      '................',
    ] },
    // 回音之笛（狀態列的樂器列，跟鼓、豎琴放一起）：銀色橫笛斜放，青綠的笛頭與笛尾、按鍵，深青的吹口與指孔
    flute: { rows: [
      '................',
      '.............kk.',
      '............kttk',
      '...........kttGk',
      '..........kTigk.',
      '.........kiigk..',
      '........kiigk...',
      '.......kitgk....',
      '......kiTgk.....',
      '.....kitgk......',
      '....kiTgk.......',
      '...kitgk........',
      '..kiTgk.........',
      '.kttGk..........',
      'kttGk...........',
      '.kkk............',
    ] },
  };

  // 樂譜符號（加圖示用）
  /* ── 地圖上的王子：身體＋武器＋盾＋披風組出來，跟著變強換外形（Ken 指定）──
     身體用 u（上衣／盔甲）、a（袖子褲子）、f（靴子）三個字母，換 pal 就換一套裝備顏色；
     武器、盾照實際裝備畫（鐵鎚→鐵劍→銀劍、沒盾→鐵盾→銀盾），握在拳頭（s）裡；
     第 2 階起多一件紅披風，第 3 階金色盔甲（地圖上另外加金色光暈，見 main.js 的 drawHero）。
     腳：A 抬左腳、B 抬右腳、不給就是站好（序章的 heroDown／heroUp／heroSide 用站好的那張） */
  const HERO_HEAD = {
    down: ['.....y.yy.y.....', '....kyyyyyyk....', '....knnnnnnk....', '...knnNnnNnnk...', '...knssssssnk...',
      '...kssksskssk...', '...kssssssssk...', '....kssmmssk....', '...kkkkkkkkkk...'],
    // 背影：後腦杓中間一個髮旋（3.2.11 以前是照正面瀏海的兩撮深色，背面看像兩隻眼睛）
    up: ['.....y.yy.y.....', '....kyyyyyyk....', '....knnnnnnk....', '...knnnNNnnnk...', '...knnnnnNnnk...',
      '...knnnnnnnnk...', '...knnnnnnnnk...', '....knnnnnnk....', '...kkkkkkkkkk...'],
    side: ['.....y.yy.y.....', '....kyyyyyyk....', '....knnnnnnk....', '...knnnnnNnnk...', '...knnnnsssk....',
      '...knnnsskskk...', '...knnnssssssk..', '....knnsssmsk...', '....kkkkkkkk....'],
  };
  const HERO_BODY = {
    down: ['..ksaauuuuaask..', '..ksaauuuuaask..', '..kkaauuuuaakk..', '....kauuuuak....'],
    up: ['..ksauuuuuuask..', '..ksauuuuuuask..', '..kkauuuuuuakk..', '....kauuuuak....'],
    side: ['...kaauuuuak....', '...kaauuuusk....', '...kaauuuusk....', '....kauuuuak....'],
  };
  const HERO_LEGS = {
    front: { '': ['....kaakkaak....', '....kffk.kffk...', '....kkkk.kkkk...'],
      A: ['....kffkkaak....', '....kkkk.kffk...', '.........kkkk...'],
      B: ['....kaakkffk....', '....kffkkkkk....', '....kkkk........'] },
    side: { '': ['....kaakaaak....', '....kffkkffk....', '....kkkkkkkk....'],
      A: ['....kffkaaak....', '....kkkkkffk....', '........kkkk....'],
      B: ['....kaakfffk....', '....kffkkkkk....', '....kkkk........'] },
  };
  // 疊圖：{列號: 那一列}，'.' 透明。up 用 down 的左右鏡射（背面看，武器跟盾換邊）
  const HERO_WEAPON = {
    down: {
      hammer: { 6: '.............gGG', 7: '.............GGG', 8: '..............h.', 9: '..............h.', 10: '..............h.', 11: '............kssk', 12: '..............h.' },
      s1: { 2: '..............g.', 3: '..............gG', 4: '..............gG', 5: '..............gG', 6: '..............gG', 7: '..............gG', 8: '..............gG', 9: '..............gG', 10: '.............YYY', 11: '............kssk', 12: '..............Y.' },
      s2: { 1: '..............w.', 2: '..............wc', 3: '..............wc', 4: '..............wc', 5: '..............wc', 6: '..............wc', 7: '..............wc', 8: '..............wc', 9: '..............wc', 10: '.............yyy', 11: '............kssk', 12: '..............r.' },
      // 金劍：金色劍身＋發光的劍尖、護手鑲紅寶石
      s3: { 1: '..............w.', 2: '..............yw', 3: '..............yw', 4: '..............yw', 5: '..............yw', 6: '..............yw', 7: '..............yw', 8: '..............yw', 9: '..............Yw', 10: '............YrYr', 11: '............kssk', 12: '..............Y.' },
    },
    side: {
      hammer: { 9: '..............gg', 10: '..............GG', 11: '...........shhGG', 12: '..............GG' },
      s1: { 10: '............Ygg.', 11: '...........sYGGg', 12: '............Y...' },
      s2: { 10: '............ywww', 11: '...........syccw', 12: '............y...' },
      s3: { 9: '............r..w', 10: '............Yyyy', 11: '...........sYYYw', 12: '............r...' },
    },
  };
  const HERO_SHIELD = {
    down: {
      a1: { 9: 'kkkk', 10: 'kgGk', 11: 'kGGk', 12: 'kGGk', 13: '.kk.' },
      a2: { 9: 'kyyk', 10: 'ywcy', 11: 'ycyy', 12: 'yccy', 13: '.yy.' },
      a3: { 9: 'kYYk', 10: 'Ywyy', 11: 'Yyry', 12: 'Yyyy', 13: '.YY.' },   // 金盾：暗金邊、紅寶石
    },
    side: {
      a1: { 9: '....kkkk', 10: '....kgGk', 11: '....kGGk', 12: '.....kk.' },
      a2: { 9: '....kyyk', 10: '....ywcy', 11: '....ycyy', 12: '.....yy.' },
      a3: { 9: '....kYYk', 10: '....Ywyy', 11: '....Yyry', 12: '.....YY.' },
    },
  };
  // 披風：down／side 墊在身體後面（只填空白處），up 是背影、直接蓋在背上
  const HERO_CAPE = {
    down: { 8: '..rrrrrrrrrrrr..', 9: '.RrrrrrrrrrrrrR.', 10: '.RrrrrrrrrrrrrR.', 11: '.RrrrrrrrrrrrrR.', 12: '.RRrrrrrrrrrrRR.', 13: '.RRrrrrrrrrrrRR.', 14: '..RRRRRRRRRRRR..' },
    up: { 9: '....rrrrrrrr....', 10: '....rrrrrrrr....', 11: '...rrrrrrrrrr...', 12: '...rrrrrrrrrr...', 13: '...RRRRRRRRRR...' },
    side: { 8: '...r............', 9: '..rr............', 10: '..rr............', 11: '.Rrr............', 12: '.Rrrr...........', 13: '.RRrr...........', 14: 'RRRR............' },
  };
  PALS.hero0 = { u: '#9a6634', a: '#5ab0ff', f: '#5a3a1e' };   // 布背心（一開始的小鐵）
  PALS.hero1 = { u: '#8a93a6', a: '#3d6fe0', f: '#555a68' };   // 鎖子甲
  PALS.hero2 = { u: '#dfe6f0', a: '#2d5fc0', f: '#a8b0c0' };   // 銀色板甲＋紅披風
  PALS.hero3 = { u: '#ffd84a', a: '#7a3ad0', f: '#c9921a' };   // 金色盔甲＋紅披風＋光暈
  Object.assign(BASE, { u: PALS.hero0.u, a: PALS.hero0.a, f: PALS.hero0.f, h: '#9a6634' });   // h＝鐵鎚握柄
  const mirror = o => Object.fromEntries(Object.entries(o).map(([r, s]) => [r, s.padEnd(16, '.').split('').reverse().join('')]));
  const overlay = (rows, o, under) => {
    for (const [r, s] of Object.entries(o || {})) {
      const row = rows[r].split('');
      for (let x = 0; x < s.length; x++) if (s[x] !== '.' && (!under || row[x] === '.')) row[x] = s[x];
      rows[r] = row.join('');
    }
  };
  // 回傳組好的圖名（給 MT.sprite 用）；dir：down／up／side，foot：''／A／B，tier：0～3，sword／shield：裝備代碼或空字串
  MT.heroSprite = function (dir, foot, tier, sword, shield) {
    const name = `hero_${dir}_${foot}_${tier}_${sword || 'hammer'}_${shield || ''}`;
    if (S[name]) return name;
    const legs = HERO_LEGS[dir === 'side' ? 'side' : 'front'][foot || ''];
    const rows = HERO_HEAD[dir].concat(HERO_BODY[dir], legs);
    const pick = (table, key) => { const t = table[dir === 'up' ? 'down' : dir]; return t && t[key] && (dir === 'up' ? mirror(t[key]) : t[key]); };
    if (tier >= 2 && dir !== 'up') overlay(rows, HERO_CAPE[dir], true);
    // 手跟著腳擺（3.2.27 Ken 指定）：抬左腳那格拿武器的手往上 1 格、抬右腳那格拿盾的手往上 1 格，站著踏步時兩手一上一下
    const lift = (o, on) => (o && on ? Object.fromEntries(Object.entries(o).map(([r, s]) => [Number(r) - 1, s])) : o);
    overlay(rows, lift(pick(HERO_SHIELD, shield), foot === 'B'));
    if (tier >= 2 && dir === 'up') overlay(rows, HERO_CAPE.up);
    overlay(rows, lift(pick(HERO_WEAPON, sword || 'hammer'), foot === 'A'));
    S[name] = { rows, pal: 'hero' + tier };
    return name;
  };
  // 外形的四個階段看攻擊＋防禦：一開始 20，5F 的 Boss 前後約 70、10F 約 170、15F 約 300、通關約 350～450
  MT.heroTier = st => { const p = st.atk + st.def; return p >= 300 ? 3 : p >= 170 ? 2 : p >= 70 ? 1 : 0; };
  // 序章與標題畫面用的：一開始的樣子、拿鐵鎚、站好
  for (const dir of ['down', 'up', 'side']) S['hero' + dir[0].toUpperCase() + dir.slice(1)] = S[MT.heroSprite(dir, '', 0, '', '')];

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
    const colors = Object.assign({}, BASE, pal ? PALS[pal] : def.pal ? PALS[def.pal] : null);   // def.pal：組出來的王子自帶裝備配色
    // 大部分是 16×16；大型怪物用 def.size（例如 24×24），每列一樣補滿 size 格
    const n = def.size || 16, pad = '.'.repeat(n);
    c = document.createElement('canvas');
    c.width = c.height = n * scale;
    const g = c.getContext('2d');
    def.rows.forEach((row, y) => {
      let r = def.sym ? row + row.split('').reverse().join('') : row;
      r = (r + pad).slice(0, n);
      if (flip) r = r.split('').reverse().join('');
      for (let x = 0; x < n; x++) {
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

  /* 地板與牆：依區域畫（每格一張，快取）
     1＝石磚、2＝紅磚、3＝鏡之迴廊（銀青色的鏡面板＋斜向反光）、4＝水晶（斜切面）
     kind：floor 地板、wall 牆、cracked 裂牆（用鑿子敲得開，裂痕要一眼看得出來）、hidden 暗道（幾乎跟牆一樣，只有一道髮絲般的細紋）、
     echo 回音地板（地板加青色同心波紋） */
  const ZONE_STYLE = {
    1: { floor: '#2b2f3e', floor2: '#303548', wall: '#5d6680', wallHi: '#7d88a6', wallLo: '#3a4054', mortar: '#252a38' },
    2: { floor: '#34262b', floor2: '#3c2b31', wall: '#8a4a3e', wallHi: '#a86454', wallLo: '#5a2e28', mortar: '#2a1a1c' },
    3: { floor: '#1f2a31', floor2: '#24313a', wall: '#7f9cab', wallHi: '#d4ecf2', wallLo: '#3e5866', mortar: '#162027', glow: '#4fd8cc' },
    4: { floor: '#231e3a', floor2: '#2a2446', wall: '#5a4a9a', wallHi: '#8e7ad8', wallLo: '#362a66', mortar: '#1a1530' },
  };
  MT.ZONE_STYLE = ZONE_STYLE;
  // 裂牆的裂痕（16 格座標）：一道由上到下的主裂縫＋四條分岔，中間裂得最開
  const CRACK = [[8, 0], [8, 1], [7, 2], [7, 3], [8, 4], [9, 5], [9, 6], [8, 7], [9, 7], [7, 8], [8, 8], [6, 9], [6, 10], [7, 11], [8, 12], [8, 13], [7, 14], [7, 15],
    [10, 5], [11, 4], [12, 4], [13, 3], [6, 8], [5, 7], [4, 7], [3, 6], [5, 11], [4, 12], [3, 12], [9, 12], [10, 13], [11, 13]];
  const HAIRLINE = [[11, 8], [11, 9], [12, 10], [12, 11], [11, 12]];   // 暗道：只有這幾格淡淡的細紋
  MT.terrain = function (kind, zone, size, variant) {
    const key = 'T|' + kind + '|' + zone + '|' + size + '|' + (variant || 0);
    let c = cache.get(key);
    if (c) return c;
    const st = ZONE_STYLE[zone] || ZONE_STYLE[1];
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const u = size / 16;
    const cell = (x, y) => g.fillRect(x * u, y * u, u, u);
    if (kind === 'floor' || kind === 'echo') {
      g.fillStyle = (variant & 1) ? st.floor2 : st.floor;
      g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(0, 0, size, u);
      g.fillRect(0, 0, u, size);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, size - u, size, u);
      g.fillRect(size - u, 0, u, size);
      if (variant % 5 === 0) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(5 * u, 7 * u, 2 * u, u); }
      if (zone === 3 && variant % 3 === 0 && kind === 'floor') { g.fillStyle = 'rgba(79,216,204,0.07)'; g.fillRect(9 * u, 3 * u, u, u); g.fillRect(3 * u, 11 * u, u, u); }
      if (kind === 'echo') {
        // 回音地板（3.1）：一圈一圈往外擴的青色波紋，中間一點亮光（地圖上另外疊一圈會動的波紋）
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const r = Math.hypot(x - 7.5, y - 7.5);
          const a = Math.abs(r - 6.2) < 0.55 ? 0.6 : Math.abs(r - 3.6) < 0.5 ? 0.42 : r < 1.2 ? 0.85 : 0;
          if (a) { g.fillStyle = `rgba(79,216,204,${a})`; cell(x, y); }
        }
      }
    } else {
      g.fillStyle = st.mortar;
      g.fillRect(0, 0, size, size);
      if (zone === 3) {
        // 鏡面板：銀色板面、上左亮邊、下右暗邊、青綠的內框，加一道斜斜的反光
        g.fillStyle = st.wallLo; g.fillRect(u, u, 14 * u, 14 * u);
        g.fillStyle = st.wall; g.fillRect(u, u, 13 * u, 13 * u);
        g.fillStyle = st.wallHi; g.fillRect(u, u, 13 * u, u); g.fillRect(u, u, u, 13 * u);
        g.fillStyle = 'rgba(79,216,204,0.35)'; g.fillRect(2 * u, 13 * u, 12 * u, u); g.fillRect(13 * u, 2 * u, u, 12 * u);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 8; i++) { cell(3 + i, 11 - i); cell(4 + i, 11 - i); }
        g.fillStyle = 'rgba(255,255,255,0.28)';
        for (let i = 0; i < 4; i++) cell(8 + i, 12 - i);
        if (variant & 1) { g.fillStyle = 'rgba(255,255,255,0.8)'; cell(4, 3); }
      } else if (zone === 4) {
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
      if (kind === 'cracked') {
        // 裂痕右下側一道亮邊（翹起來的碎片），本體近乎全黑，再掉幾顆碎屑
        g.fillStyle = 'rgba(255,255,255,0.28)';
        for (const [x, y] of CRACK) cell(x + 1, y);
        g.fillStyle = '#0c0a12';
        for (const [x, y] of CRACK) cell(x, y);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        cell(2, 14); cell(12, 14); cell(13, 15); cell(3, 15);
      } else if (kind === 'hidden') {
        g.fillStyle = 'rgba(0,0,0,0.24)';
        for (const [x, y] of HAIRLINE) cell(x, y);
        g.fillStyle = 'rgba(255,255,255,0.07)';
        cell(12, 9);
      }
    }
    cache.set(key, c);
    return c;
  };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
