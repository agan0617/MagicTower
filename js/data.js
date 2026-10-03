/* 魔塔：失落的旋律 —— 關卡、怪物、道具、事件資料（純資料，瀏覽器與 node 解題器共用）。
   3.0.0 起 20 層＋隱藏層 B1，設計規則與每層的意圖見 DESIGN.md */
(function (MT) {
  'use strict';

  // 區域：1＝1–5F 石磚、2＝6–10F 紅磚、3＝11–15F 鏡之迴廊、4＝16–20F 水晶；B1（0）算第 2 區
  MT.zoneOf = f => (f === 0 ? 2 : f <= 5 ? 1 : f <= 10 ? 2 : f <= 15 ? 3 : 4);
  MT.TOP = 20;
  MT.BOTTOM = 0;

  /* 怪物：hp／atk／def／gold／exp；sp＝特技；size＝大型怪物佔 size×size 格（地圖上每格寫同一個代碼）
     first 先攻　magic 魔法（無視防禦）　pierce 破甲（無視一半防禦）　double 連擊（一回合打兩下）
     drain 吸血（開打前吸走目前生命的 drain 比例）　pincer 夾擊（走進兩隻中間失去三分之一生命）
     aura 共鳴（走進牠周圍八格，每一步失去 aura 點生命，防禦和技能擋不掉）
     boss 大血條　invincible 打不動（劇情解除）
     每一區都混著幾種「打法不同」的怪：高攻（等防禦堆起來再打）、高防（攻擊到門檻才打得動）、
     高血（拖得久，防禦值錢）、魔法（防禦沒用，要血或技能）、吸血（血少時打）、連擊（防禦加倍值錢） */
  MT.MONSTERS = {
    // 第 1 區
    gs: { hp: 35, atk: 18, def: 1, gold: 1, exp: 1, sprite: 'slime', pal: 'green' },
    rs: { hp: 45, atk: 21, def: 2, gold: 2, exp: 1, sprite: 'slime', pal: 'red' },
    bt: { hp: 30, atk: 36, def: 3, gold: 2, exp: 2, sprite: 'bat', pal: 'bat' },                       // 高攻低血
    sk: { hp: 55, atk: 40, def: 6, gold: 4, exp: 3, sprite: 'skeleton', pal: 'bone' },
    mg: { hp: 40, atk: 14, def: 6, gold: 4, exp: 3, sprite: 'mage', pal: 'blue', sp: ['magic'] },      // 魔法
    ab: { hp: 20, atk: 26, def: 15, gold: 6, exp: 4, sprite: 'beetle', pal: 'beetle' },                // 高防：攻擊 16 才打得動
    sw: { hp: 130, atk: 46, def: 10, gold: 6, exp: 5, sprite: 'skeleton', pal: 'warrior' },            // 高血
    bb: { hp: 50, atk: 66, def: 8, gold: 8, exp: 5, sprite: 'bat', pal: 'bigbat', sp: ['first'] },
    K1: { hp: 420, atk: 58, def: 14, gold: 40, exp: 30, size: 2, sprite: 'skelking', sp: ['boss'] },   // 3F 骷髏館長
    DG: { hp: 900, atk: 78, def: 20, gold: 80, exp: 60, size: 3, sprite: 'drumgolemBig', sp: ['boss'], onDeath: 'drumGet' },
    // 第 2 區
    ks: { hp: 300, atk: 75, def: 10, gold: 8, exp: 6, sprite: 'slime', pal: 'black' },                  // 高血
    gd: { hp: 90, atk: 80, def: 45, gold: 12, exp: 8, sprite: 'knight', pal: 'guard' },                // 高防
    oc: { hp: 200, atk: 115, def: 20, gold: 14, exp: 9, sprite: 'orc' },                                // 高攻
    wz: { hp: 110, atk: 50, def: 30, gold: 12, exp: 8, sprite: 'mage', pal: 'red', sp: ['magic'] },
    gh: { hp: 150, atk: 100, def: 35, gold: 15, exp: 10, sprite: 'ghost', sp: ['first'] },
    dw: { hp: 180, atk: 80, def: 40, gold: 16, exp: 11, sprite: 'swordsman', sp: ['double'] },         // 連擊
    pg: { hp: 130, atk: 90, def: 45, gold: 10, exp: 8, sprite: 'statue', pal: 'stoneP', sp: ['pincer'] },
    sc: { hp: 240, atk: 110, def: 45, gold: 20, exp: 14, sprite: 'skeleton', pal: 'captain' },
    rt: { hp: 200, atk: 95, def: 35, gold: 25, exp: 12, sprite: 'rat' },                                // B1 胖老鼠
    K2: { hp: 1800, atk: 125, def: 50, gold: 80, exp: 60, size: 2, sprite: 'jailer', sp: ['boss', 'double'] },   // 8F 獄卒長
    SR: { hp: 3200, atk: 160, def: 65, gold: 150, exp: 120, size: 3, sprite: 'sirenBig', sp: ['boss'], onDeath: 'harpGet' },
    // 第 3 區
    vb: { hp: 220, atk: 160, def: 75, gold: 25, exp: 18, sprite: 'bat', pal: 'vampire', sp: ['drain'], drain: 0.2 },
    mi: { hp: 280, atk: 180, def: 85, gold: 26, exp: 18, sprite: 'mirrorImp', sp: ['pierce'] },
    st: { hp: 80, atk: 200, def: 125, gold: 30, exp: 20, sprite: 'golem' },                            // 高防
    cm: { hp: 200, atk: 95, def: 90, gold: 28, exp: 20, sprite: 'chorister', sp: ['magic'] },
    eh: { hp: 260, atk: 150, def: 95, gold: 30, exp: 22, sprite: 'ghost', pal: 'echo', sp: ['double'] },
    kn: { hp: 500, atk: 210, def: 100, gold: 35, exp: 25, sprite: 'knight', pal: 'dark' },              // 高攻高血
    pm: { hp: 300, atk: 190, def: 105, gold: 30, exp: 20, sprite: 'statue', pal: 'mirrorP', sp: ['pincer'] },
    K3: { hp: 3500, atk: 230, def: 115, gold: 150, exp: 100, size: 2, sprite: 'mirrorKnight', sp: ['boss', 'pierce'] },  // 13F 鏡之騎士
    EM: { hp: 6500, atk: 250, def: 125, gold: 300, exp: 200, size: 3, sprite: 'echoMirror', sp: ['boss', 'double'], onDeath: 'fluteGet' },
    // 第 4 區
    cv: { hp: 380, atk: 290, def: 150, gold: 45, exp: 35, sprite: 'bat', pal: 'crystalBat', sp: ['drain', 'first'], drain: 0.25 },
    am: { hp: 320, atk: 160, def: 165, gold: 45, exp: 35, sprite: 'mage', pal: 'purple', sp: ['magic'] },
    kd: { hp: 800, atk: 300, def: 160, gold: 50, exp: 40, sprite: 'knight', pal: 'crystalK' },
    cg: { hp: 120, atk: 330, def: 205, gold: 50, exp: 40, sprite: 'golem', pal: 'crystalG' },          // 高防
    nb: { hp: 420, atk: 260, def: 170, gold: 45, exp: 35, sprite: 'owl', sp: ['double'] },
    dk: { hp: 360, atk: 320, def: 160, gold: 50, exp: 40, sprite: 'assassin', sp: ['pierce', 'first'] },
    rg: { hp: 900, atk: 330, def: 190, gold: 70, exp: 50, sprite: 'rest' },
    // 共鳴水晶（3.1）：周圍八格一直在共振，守在路口當「過路費」。魔法攻擊、防禦高，剛到 16F 打要一千多血，
    // 攻擊堆上去之後只要幾百：現在就打掉，還是先每次經過付一次共鳴，等變強再回來打
    rc: { hp: 500, atk: 150, def: 190, gold: 45, exp: 35, sprite: 'resonator', sp: ['magic', 'aura'], aura: 80 },
    K4: { hp: 6000, atk: 340, def: 185, gold: 200, exp: 150, size: 2, sprite: 'conductor', sp: ['boss', 'magic'] },     // 18F 回音指揮
    M1: { hp: 9999, atk: 350, def: 200, gold: 0, exp: 0, size: 3, sprite: 'maestroBig', sp: ['boss', 'invincible'], onBump: 'maestroDrum' },
    M2: { hp: 9000, atk: 450, def: 200, gold: 0, exp: 0, size: 3, sprite: 'maestroBig', sp: ['boss'], onDeath: 'ending' },
  };

  // 同區域的數值：[1區, 2區, 3區, 4區]
  MT.ZONE_VALUES = {
    hp: [50, 100, 150, 250],
    HP: [200, 400, 600, 1000],
    at: [2, 3, 3, 4],
    df: [2, 3, 3, 4],
  };

  /* 道具：kind 決定撿起來的效果；tool＝放進 items 的東西（圖鑑、風之羽、鑿子） */
  MT.ITEMS = {
    Yk: { kind: 'key', key: 'y', sprite: 'key1', pal: 'keyCu' },
    Bk: { kind: 'key', key: 'b', sprite: 'key2', pal: 'keyAg' },
    Rk: { kind: 'key', key: 'r', sprite: 'key3', pal: 'keyAu' },
    hp: { kind: 'hp', zone: 'hp', sprite: 'heartS' },
    HP: { kind: 'hp', zone: 'HP', sprite: 'heartBig' },
    at: { kind: 'atk', zone: 'at', sprite: 'gemSword', pal: 'gemRed' },
    df: { kind: 'def', zone: 'df', sprite: 'gemShield', pal: 'gemBlue' },
    s1: { kind: 'atk', value: 10, sprite: 'sword', pal: 'iron', equip: 'sword' },
    a1: { kind: 'def', value: 10, sprite: 'shield', pal: 'iron', equip: 'shield' },
    s2: { kind: 'atk', value: 20, sprite: 'sword', pal: 'silver', equip: 'sword' },
    a2: { kind: 'def', value: 20, sprite: 'shield', pal: 'silver', equip: 'shield' },
    s3: { kind: 'atk', value: 25, sprite: 'sword', pal: 'goldEq', equip: 'sword' },
    a3: { kind: 'def', value: 25, sprite: 'shield', pal: 'goldEq', equip: 'shield' },
    P1: { kind: 'page', page: 1, sprite: 'page' },
    P2: { kind: 'page', page: 2, sprite: 'page' },
    P3: { kind: 'page', page: 3, sprite: 'page' },
    FN: { kind: 'note', sprite: 'goldnote' },   // 失落的音符（真結局條件之一）
    Mb: { kind: 'tool', tool: 'book', sprite: 'book', script: 'bookGet' },     // 怪物圖鑑：有了才看得到怪物能力
    Ch: { kind: 'tool', tool: 'chisel', sprite: 'chisel', script: 'chiselGet' },   // 老鐵匠的鑿子：敲開裂牆，用一次少一把
  };

  MT.DOORS = { Yd: 'y', Bd: 'b', Rd: 'r' };

  /* NPC：碰到就觸發
     shop 商店　deal 一次性交易（MT.DEALS）　level 節拍之神（經驗換等級）　sage 老琴師（技能鑑定、升級）
     choose 豎琴之靈（技能三選一）　talk／again 對話（說過之後換 again；旗標 npc:代碼 或 flag） */
  MT.NPCS = {
    Om: { sprite: 'bard', talk: 'bard', again: 'bardAgain', flag: 'bardTalked' },   // 國王巴索（代碼沿用原版的吟遊詩人 bard）
    Mz: { sprite: 'maestroBare' },          // 結局：面具裂開後的指揮家（＝阿爾特自己），只在結局劇本裡出現
    Sh: { sprite: 'altar', pal: 'stone', shop: 'shop1' },
    S2: { sprite: 'altar', pal: 'mirrorA', shop: 'shop2' },
    S3: { sprite: 'altar', pal: 'crystal', shop: 'shop3' },
    Mk: { sprite: 'frog', shop: 'keys' },
    Mq: { sprite: 'frogCousin', shop: 'keys2' },
    L1: { sprite: 'metronome', pal: 'metroA', level: 'L1' },
    L2: { sprite: 'metronome', pal: 'metroB', level: 'L2' },
    Sg: { sprite: 'harpist', sage: true },
    Hs: { sprite: 'harp', choose: true },
    N1: { sprite: 'porter', talk: 'n1', again: 'n1b' },
    N2: { sprite: 'soldier', talk: 'n2' },
    N3: { sprite: 'smith', deal: 'd3', speaker: 'smith' },
    N4: { sprite: 'thief', deal: 'd4', speaker: 'thief' },
    N5: { sprite: 'mirrorGirl', talk: 'n5', again: 'n5b' },
    N6: { sprite: 'apprentice', deal: 'd6', speaker: 'apprentice' },
    N7: { sprite: 'astrologer', talk: 'n7', again: 'n7b' },
    N8: { sprite: 'fairy', pal: null, talk: 'n8' },
    N9: { sprite: 'soldier', pal: 'lastGuard', talk: 'n9' },
    Nb: { sprite: 'granny', talk: 'nb', again: 'nbb' },
    Fd: { sprite: 'pigeon', talk: 'fd' },
  };

  /* 祭壇：每買一次價格加 step；呱呱商人賣鑰匙、他的表哥收購鑰匙 */
  // 3.2.37～3.2.38（Ken 的點子）：11F／16F 祭壇每買一次的漲幅加大（原本 30／60 → 90／180），靠買來補救越來越貴；4F 不動，前期不受影響
  MT.SHOPS = {
    shop1: { base: 20, step: 10, hp: 300, atk: 3, def: 3 },
    shop2: { base: 120, step: 90, hp: 800, atk: 5, def: 5 },
    shop3: { base: 300, step: 180, hp: 2000, atk: 8, def: 8 },
    keys: { y: 10, b: 50, r: 100 },
    // 13F 表哥只收不賣（3.2.9 Ken 選的）：6F 負責賣、13F 負責收，兩個商人各有用處。原本他也賣、而且賣得比 6F 貴，
    // 可是 9F 拿到風之羽之後飛回 6F 不花任何東西，賣貴只剩笑點。收購照新新魔塔、50 層魔塔放在中後期，
    // 價格是 6F 賣價的一半（3.2.7 照他自己的賣價算一半是 45／90，跟 6F 只差一點，賣掉再飛回 6F 買幾乎不虧）
    keys2: { sell: { b: 25, r: 50 } },
  };

  /* 節拍之神：經驗值換等級。每升一級的花費＝base＋step×(等級−1)；3F 的 L1、13F 的進階版 L2 共用等級 */
  MT.LEVEL = {
    base: 10, step: 6, knee: 10, late: 6,   // 3.2.37：Lv10 以後每級再多漲 late，後期靠升級補救越來越貴（前期不變）
    L1: { hp: 120, atk: 2, def: 2 },
    L2: { hp: 300, atk: 4, def: 4 },
  };

  /* 路上的一次性交易：付金幣換能力或鑰匙，成交後 NPC 離開 */
  MT.DEALS = {
    d3: { price: 100, gain: { atk: 6 } },              // 7F 流浪鐵匠：幫你把武器磨利
    d4: { price: 30, gain: { keys: { y: 3 } } },        // 8F 小偷：三把「撿到的」銅鑰匙
    d6: { price: 320, gain: { def: 14 } },             // 14F 老琴師的學徒：補強盾牌
  };

  // Boss 還活著時不能用風之羽飛離的樓層：樓層 → Boss 代碼
  MT.NOFLY = { 5: 'DG', 10: 'SR', 15: 'EM', 20: 'M1' };

  /* 通關評價門檻（MT.rating 的分數），S 另外要真結局。3.1 起照真人型自動玩家（tools/solve.js human，
     寬度 1～2、noise 500／2000、各 12 個種子）的通關分數分佈定：B＝約後 1/4 的線、A＝約前 1/4 的線，
     S 比真人型最好的一次還高、要到高手的水準（高手寬度 4 回音、寬度 12 都還拿得到） */
  // 3.2.38 照兩種真人型各 40 局重訂（Ken 的目標：一般真人通關 ~60%、A 少數、B≈C；高手真人通關 90～95%、S 極少、A≈B、C 少；完美高手 S 且跟高手有差距）
  MT.RATING = { S: 8000, A: 5800, B: 1500 };

  MT.START = { floor: 1, x: 5, y: 14, hp: 1000, atk: 10, def: 10, gold: 0, keys: { y: 1, b: 0, r: 0 } };

  /* 地圖：寬 11×高 15，每格兩個字元，空白分隔。第 0 列在最上面。索引＝樓層，0＝隱藏層 B1。
     Hw＝暗牆（看起來是牆，走得過去）　Cw＝裂牆（要鑿子）　Gt＝鐵門（打倒守門的怪才開） */
  MT.FLOORS = [
    // B1 地下室（隱藏層）：小偷的老家，堆滿偷來的東西；胖老鼠（致敬胖老鼠工作室）
    [
      '## ## ## ## ## ## ## ## ## ## ##',
      '## at .. rt .. Nb .. gh .. df ##',
      '## .. ## ## ## .. ## ## ## .. ##',
      '## HP ## Yk Bk .. Yk hp ## at ##',
      '## .. ## ## ## .. ## ## ## .. ##',
      '## rt .. .. .. .. .. .. .. sc ##',
      '## ## ## ## Yd ## Yd ## ## ## ##',
      '## hp .. rt .. ## .. wz .. Bk ##',
      '## ## ## ## .. ## .. ## ## ## ##',
      '## at df gd .. .. .. rt at df ##',
      '## ## ## ## ## .. ## ## ## ## ##',
      '## .. .. .. .. .. .. .. .. .. ##',
      '## .. ## ## ## .. ## ## ## .. ##',
      '## .. ## ## ## .. ## ## ## .. ##',
      '## ## ## ## ## UU ## ## ## ## ##',
    ],
    // ── 第 1 區：石磚（1～5F） ──
    // 1F 入口大廳：圖鑑擋在中間走廊的紅史萊姆後面、往樓梯一定會經過（3.2.14 Ken 選的；3.2.11 放起點出口，更早是左邊要打一隻史萊姆）、第一次「鑰匙比門少」的取捨、右邊一條小連戰換寶石；
    // 左下的裂牆後面是通往隱藏層 B1 的下樓梯（要等拿到鑿子才敲得開）
    [
      'UU .. .. ## hp .. at ## Yk gs hp',
      '.. .. gs .. .. Mb .. ## ## ## Yd',
      '## ## ## ## ## rs ## ## hp .. ..',
      'df .. bt Yd .. .. .. .. Yd .. df',
      '## ## ## ## .. ## ## Yd ## ## ##',
      'hp gs .. .. .. ## df .. bt .. Yk',
      '## ## ## ## .. ## ## ## ## ## ##',
      'hp .. rs .. .. .. N1 ## at .. hp',
      '## ## ## Yd ## .. ## ## ## rs ##',
      'at .. gs .. ## .. Yd .. .. .. Yk',
      '## ## ## ## ## .. ## ## ## ## ##',
      'hp .. .. Yd .. .. .. .. .. gs ..',
      '## ## Cw ## ## .. ## ## ## ## Yd',
      'Yk .. DD ## Yk .. hp ## at .. ..',
      '.. .. .. ## .. .. .. ## hp .. df',
    ],
    // 2F 衛兵營房：國王（送兩把銅鑰匙＋提示）、盔甲蟲（防禦 15，攻擊不到 16 打不動）守著最肥的房間；
    // 左上一面暗牆藏著一個小房間（國王會暗示）
    [
      'DD .. Yk Yd .. ab .. ## at df ##',
      '.. sk .. ## .. ## .. ## ab ## ..',
      '## ## Yd ## Om ## .. Yd .. .. ..',
      'Hw .. .. ## .. ## ## ## ## ## Yd',
      'at ## .. .. .. .. .. .. sk .. ..',
      '## ## ## Yd ## ## Yd ## ## ## ..',
      'Yk gs .. .. ## .. .. mg .. ## ..',
      '.. ## ## mg ## .. ## ## Yk ## ..',
      'hp ## Yk .. ## .. .. .. .. bt ..',
      '## ## ## ## ## .. ## ## ## ## ##',
      'at .. .. rs .. .. .. ## hp .. ..',
      '.. ## ## ## ## ## .. ## ## Yd ##',
      '.. bt .. Yk .. Yd .. .. .. .. sk',
      '## ## ## ## .. ## ## ## ## ## ..',
      'UU .. .. Yd .. .. .. .. gs .. Yk',
    ],
    // 3F 書庫：節拍之神（經驗換等級）放在「只打少少幾隻就到得了」的地方；
    // 骷髏館長（2×2）守著鐵劍和日記第一頁；左邊是骷髏兵的連戰走廊
    [
      'UU .. .. ## L1 .. .. ## at ab hp',
      '.. .. sk Yd .. .. .. ## ## ## Yd',
      '## ## ## ## ## .. ## ## df .. ..',
      'sk at df ## .. .. .. .. .. .. ..',
      'sw ## ## ## ## ## ## ## ## ## ..',
      'sk ## at P1 ## ## ## HP Bd .. Yk',
      '.. ## s1 .. K1 K1 ## ## ## .. sk',
      'HP ## .. .. K1 K1 ## hp .. Yd ..',
      'df ## ## ## ## .. .. .. .. ## ..',
      'Yk .. bt Yd .. .. ## ## ## ## sw',
      '## ## ## ## ## .. ## Yk mg .. HP',
      'df gs .. Yd .. .. .. Yd ## ## ##',
      '## ## ## ## ## Yk ## .. ## df at',
      'at .. sk .. Yd .. .. .. Yd .. bb',
      '## ## ## ## ## .. DD ## ## ## hp',
    ],
    // 4F 音叉祭壇：祭壇在中間；受傷的士兵（送防禦）；第一把鑿子；右下大蝙蝠（先攻）守的寶庫；
    // 中央走廊往上的凹槽多一把銅鑰匙（3.2.29：真人型 40 局有 9 局在這層鑰匙用光卡死，加了之後剩 0）
    [
      'DD .. Yk Yd .. .. .. .. Yk sw df',
      '.. bb .. ## ## Sh ## ## .. ## ab',
      '## Yd ## ## .. .. .. ## Yd ## at',
      'Ch .. sw ## .. ## .. ## .. .. ..',
      '.. at .. ## .. ## mg ## hp ## ..',
      '## ## .. ## sk ## Yk ## ## ## Bd',
      'N2 .. .. .. .. .. .. .. .. .. ..',
      '## ## Yd ## ## ## ## Yd ## ## ##',
      'hp .. .. sk .. Yd .. .. bb .. HP',
      '.. ## ## ## .. ## ## ## ## ## ..',
      'Yk ## df .. .. ## at mg sk hp df',
      '.. ## ## ## Yd ## ## ## ## ## ..',
      'sk .. hp ## .. ## hp Yk ## ab Yk',
      '## ## Yd ## .. ## ## Yd ## ## Yd',
      'UU .. .. .. .. .. .. .. .. .. ..',
    ],
    // 5F 鼓魔像（3×3）：Boss 活著時不能飛走；左右各一條連戰走廊通往補給，要先算好再進 Boss 房
    [
      '## ## ## ## ## UU ## ## ## ## ##',
      '## hp at ## ## Gt ## ## HP df ##',
      '## .. .. ## DG DG DG ## .. .. ##',
      '## sw ## ## DG DG DG ## ## bb ##',
      '## sw ## ## DG DG DG ## ## bb ##',
      '## Yd ## .. .. .. .. .. ## Yd ##',
      '## .. .. .. ## .. ## .. .. .. ##',
      '## ## ## ## ## .. ## ## ## Yd ##',
      'Yk sk .. bt Yd .. Yd mg .. sk Yk',
      'hp ## ## ## ## .. ## ## ## ## hp',
      '.. .. at .. Yd .. Yd .. df .. ..',
      '## ## ## ## ## .. ## ## ## ## ##',
      '.. bb .. Yk ## .. ## Yk .. sw ..',
      '.. ## ## .. Yd .. Yd .. ## ## ..',
      'HP .. Bk .. ## DD ## .. Bk .. HP',
    ],
    // ── 第 2 區：紅磚（6～10F） ──
    // 6F 呱呱商人：雙刀劍客（連擊）登場，防禦變得很值錢；一面裂牆後面是銀鑰匙與大愛心
    [
      'UU .. ks ## at .. .. .. Cw HP Bk',
      '.. .. .. ## .. dw .. ## ## ## ##',
      '.. ## gd ## ## Yd ## ## at .. hp',
      'Yd ## .. .. .. .. .. .. .. ks ..',
      '.. ## ## ## Bd ## Mk ## ## ## Yd',
      'hp at ## .. .. ## ## ## df .. ..',
      '## ## ## .. wz ## ## ## ## ## ..',
      'Yk .. oc .. ## .. .. .. dw .. Yk',
      '.. ## ## ## ## ## ## Yd ## ## ##',
      'df .. Yd .. .. gd .. .. .. hp ..',
      '## ## ## .. ## ## ## ## ## ## Yd',
      'hp .. ks .. Yd .. at .. Yk .. ..',
      '.. ## ## ## ## ## ## ## ## ## ..',
      'Yk .. wz .. .. ## .. gh .. .. ..',
      '## ## ## ## ## ## ## ## ## ## DD',
    ],
    // 7F 幽靈畫廊：流浪鐵匠（交易：金幣換攻擊）；夾擊石像第一次出現（走廊中間那格不要踩）；
    // 暗牆後面是第二把鑿子
    [
      'DD .. .. Yd .. .. .. Yd gh .. UU',
      '.. gh ## ## ## pg ## ## ## .. ..',
      '.. .. ## Yk .. .. .. hp ## .. ..',
      '## Yd ## ## ## pg ## ## ## sc ##',
      '.. .. .. N3 ## .. ## .. .. .. at',
      '.. ## ## ## ## Yd ## ## ## ## ..',
      'Yk dw .. .. .. .. .. .. sc .. hp',
      '## ## ## ## ## Bd ## ## ## ## ##',
      'hp .. wz .. ## .. ## Hw Ch .. ..',
      '.. ## ## .. ## HP ## ## ## ## ..',
      'df .. .. .. Yd .. Yd .. oc .. at',
      '## ## ## Yd ## ## ## Yd ## ## ##',
      '.. gh .. .. ## Yk ## .. .. gd ..',
      '.. ## ## at ## .. ## Yk ## ## ..',
      'Yk .. .. .. Yd .. dw .. .. .. hp',
    ],
    // 8F 地牢：小偷（交易：便宜的銅鑰匙）、獄卒長（2×2）守著鐵盾與日記第二頁；
    // 下半是一整排的連戰（鐵柵欄＝夾擊石像兩兩一組）
    [
      'UU .. .. Yd .. ks .. Yd .. .. DD',
      '.. .. ## ## ## .. ## ## ## .. ..',
      '.. ## a1 .. K2 K2 .. .. P2 ## ..',
      '.. ## HP .. K2 K2 .. .. at ## ..',
      'Yd ## ## ## ## .. ## ## ## ## Yd',
      '.. sc .. .. .. .. .. .. .. gh ..',
      '## ## ## Yd ## Bd ## Yd ## ## ##',
      'N4 .. ## .. ## .. ## .. ## .. Yk',
      '.. .. ## gd ## .. ## wz ## .. ..',
      '## Yd ## .. ## Yd ## .. ## wz ##',
      'Yk .. pg .. pg .. pg .. pg .. at',
      '.. ## ## .. ## ## ## .. ## ## ..',
      'hp .. dw .. .. Yk .. .. gh .. df',
      '## ## ## ## ## Yd ## ## ## ## ##',
      'at .. Yk .. oc .. dw .. hp .. HP',
    ],
    // 9F 兵器庫：銀劍、信差鴿子（給風之羽）、高攻獸人與高防衛兵交錯，決定先拿攻還是防；
    // 裂牆後面是一顆藍寶石＋紅寶石
    [
      'DD .. .. ## hp .. at ## .. .. UU',
      '.. Yk .. ## .. sc .. ## .. gd ..',
      'Yd ## ## ## ## Yd ## ## ## ## ..',
      '.. .. oc .. .. .. .. .. gh .. ..',
      '## ## ## Yd ## ## ## Yd ## ## ##',
      'at .. wz .. ## s2 ## .. dw .. df',
      'hp .. .. .. ## Rd ## .. .. .. Yk',
      '## Bd ## ## ## .. ## ## ## Yd ##',
      'Yk .. gd .. Yd .. Yd .. sc .. Fd',
      '.. .. .. .. ## .. ## .. .. .. ..',
      'HP ## df .. ## .. ## .. ## ## ##',
      '## ## Yd ## ## Yd ## ## Yd Cw ..',
      'Yk .. sc .. ## dw ## .. dw ## at',
      '## ## ## Yd ## .. ## Yd ## ## df',
      '.. .. .. .. .. HP .. .. gd .. ..',
    ],
    // 10F 弦之魔女（3×3）：打倒後，豎琴之靈讓你三選一技能
    [
      '## ## ## ## ## UU ## ## ## ## ##',
      '.. HP .. ## ## Gt ## ## .. HP ..',
      '.. .. at ## SR SR SR ## df .. ..',
      '## Yd ## ## SR SR SR ## ## Yd ##',
      'gh .. .. ## SR SR SR ## .. .. gh',
      '.. sc .. ## .. .. .. ## .. sc ..',
      'Yk .. .. .. .. .. .. .. .. .. Yk',
      '## Yd ## ## DD .. ## ## ## Yd ##',
      'hp .. at .. ## .. ## .. df .. hp',
      '.. dw .. .. ## .. ## .. .. gd ..',
      'Yk .. hp .. ## .. ## .. hp .. Yk',
      '## ## Yd ## ## .. ## ## Yd ## ##',
      '.. pg .. pg .. .. .. gh .. oc ..',
      '## ## ## ## ## Yd ## ## ## ## ##',
      'Yk .. .. .. sc HP sc .. .. hp Yk',
    ],
    // ── 第 3 區：鏡之迴廊（11～15F） ──
    // 11F 鏡之迴廊入口：古老音叉祭壇、鏡中少女（提示老琴師在 12F）、吸血蝙蝠登場（血少的時候再去打）
    [
      '## ## ## ## .. DD .. ## ## ## ##',
      'Yk vb .. .. .. .. .. Yd .. mi HP',
      '.. ## ## ## ## .. ## ## ## ## Ec',
      'hp .. mi .. Yd .. ## ## N5 .. Yk',
      '.. ## ## ## ## S2 ## ## ## ## ..',
      'at .. .. Bd .. .. .. ## cm .. df',
      'Bk st .. ## Yk .. hp ## .. cm Hw',
      '## Yd ## ## ## Yd ## ## ## Yd ##',
      'HP .. cm .. .. .. .. .. eh .. ..',
      '## ## ## ## ## Bd ## ## ## ## ##',
      'UU .. df .. .. at .. Yd .. at Bk',
      '## Yd ## ## ## ## ## ## ## eh ##',
      '.. .. vb .. Yd HP Yd .. mi .. ..',
      'Yk ## ## ## ## kn ## ## ## ## df',
      '.. .. cm .. .. Ec .. .. vb .. ..',
    ],
    // 12F 老琴師：技能鑑定與升級；第三把鑿子；鏡像夾擊衛兵守著一條走廊
    [
      'DD .. .. .. .. vb .. Yd .. .. Yk',
      '## ## ## ## ## .. ## ## ## ## ..',
      'hp Yk .. Yd kn .. mi Yd .. at ..',
      '.. .. .. ## ## Rd ## ## .. .. ..',
      'cm ## ## ## HP Ch at ## ## ## vb',
      '.. .. .. .. ## ## ## .. .. .. ..',
      '## ## ## Yd ## Sg ## Yd ## ## ##',
      'df .. st .. .. Ec .. .. eh .. at',
      '.. ## ## ## ## Bd ## ## ## ## ..',
      '.. hp .. Bk ## HP ## HP .. Yk ..',
      'UU .. pm .. pm ## .. .. mi .. Yk',
      '## ## ## ## .. ## ## Yd ## ## ##',
      'Yk eh .. .. .. Yk ## .. .. vb ..',
      '## ## ## Yd ## mi ## Ec ## ## ##',
      '.. .. .. .. .. HP .. .. Cw HP Rk',
    ],
    // 13F 回音長廊：進階節拍之神、呱呱商人的表哥（自稱正牌，只收購鑰匙）、鏡之騎士（2×2）守著銀盾
    [
      'UU .. kn .. Yd .. .. .. .. .. L2',
      '## ## ## ## ## ## ## ## ## .. ..',
      'hp .. cm .. Bd .. st .. Yd .. Ec',
      '.. ## ## ## ## ## ## ## ## ## vb',
      'at .. .. Yd .. HP .. .. .. .. ..',
      'vb ## ## ## ## ## ## ## Mq ## ..',
      '.. Yk kn .. Yd .. .. .. .. df ..',
      '## ## ## ## ## ## ## Yd ## ## ##',
      'df .. st .. Yd Bk .. .. K3 K3 a2',
      '## ## ## ## ## ## ## .. K3 K3 ##',
      'df .. HP .. Ec .. vb .. .. .. DD',
      '## ## ## ## ## Yd ## ## ## ## ##',
      '.. .. cm .. .. .. .. .. vb .. Yk',
      '.. ## ## ## ## ## ## ## ## ## Yd',
      'Yk .. .. .. HP kn .. .. st .. ..',
    ],
    // 14F 鏡宮：老琴師的學徒（交易：金幣換防禦）；破甲的鏡像士兵很多，防禦只算一半
    [
      'DD .. Yk ## HP .. df ## .. .. UU',
      '.. mi .. ## at .. df ## .. vb ..',
      '.. .. .. ## ## Rd ## ## Yk .. ..',
      '## Yd ## .. .. .. .. .. ## Yd ##',
      'hp .. .. .. kn .. eh .. Bd .. Yk',
      'at .. ## ## ## .. ## ## ## .. df',
      '.. cm .. .. .. .. .. .. .. mi ..',
      '## ## ## Yd ## ## ## Yd ## ## ##',
      'Yk .. st .. .. N6 .. .. kn .. HP',
      'HP .. .. .. .. .. .. .. .. .. at',
      'at df .. .. ## Cw ## .. .. at df',
      '## ## Yd ## ## .. ## ## Yd ## ##',
      '.. .. eh .. ## HP ## .. cm .. ..',
      'Ec ## ## ## ## .. ## ## ## ## ..',
      'Yk .. .. .. .. Bk .. Ec .. .. hp',
    ],
    // 15F 回音之鏡（3×3）：打倒後找回「笛」
    [
      '## ## ## ## ## UU ## ## ## ## ##',
      '.. HP .. ## ## Gt ## ## .. HP ..',
      '.. .. at ## EM EM EM ## df .. ..',
      '## Yd ## ## EM EM EM ## ## Yd ##',
      'eh .. .. ## EM EM EM ## .. .. eh',
      '.. kn .. ## .. .. .. ## .. kn ..',
      'Yk .. .. .. .. .. .. .. .. .. Yk',
      '## Yd ## ## DD .. ## ## ## Yd ##',
      'hp .. at .. ## .. ## .. df .. hp',
      '.. pm .. pm ## .. ## .. mi .. ..',
      'Yk .. hp .. ## .. ## .. hp .. Yk',
      '## ## Yd ## ## .. ## ## Yd ## ##',
      '.. vb .. .. .. .. .. .. .. cm ..',
      '## ## ## ## ## Yd ## ## ## ## ##',
      'Yk .. Ec .. st HP st .. .. hp Yk',
    ],
    // ── 第 4 區：水晶（16～20F） ──
    // 16F 水晶迴廊：水晶祭壇；占星師（提示暗牆與失落的音符）
    [
      '## ## ## ## .. DD .. ## ## ## ##',
      'Yk cv .. .. .. .. .. .. .. dk HP',
      '.. ## ## ## ## rc ## ## ## ## ..',
      'hp .. kd .. Yd .. Yd .. nb .. Yk',
      '.. ## ## ## ## .. ## ## ## ## ..',
      'at .. .. Bd .. S3 .. Bd .. .. df',
      'Bk cg .. ## Yk .. Yk ## .. am HP',
      '## Yd ## ## ## Yd ## ## ## Yd ##',
      'HP .. am .. .. .. .. .. cv .. Bk',
      '## ## ## ## ## Bd ## ## ## ## ##',
      'UU .. df .. .. at .. N7 .. at df',
      '## Yd ## ## ## ## ## ## ## Yd ##',
      '.. .. cv .. Yd HP Yd .. kd hp Hw',
      'Yk ## ## ## ## rc ## ## ## ## at',
      '.. .. am .. .. .. .. .. ## HP df',
    ],
    // 17F 觀星台：日記第三頁、迷路的小精靈（送銀鑰匙）；裂牆後面是金鑰匙
    [
      'DD .. .. .. .. cv .. Yd .. .. Yk',
      '## ## ## ## ## .. ## ## ## ## ..',
      'hp Yk .. Yd kd .. dk Yd .. at ..',
      '.. .. .. ## ## Rd ## ## .. .. ..',
      'am ## ## ## at HP df ## ## ## cv',
      '.. .. P3 .. ## ## ## .. .. .. ..',
      '## ## ## Yd ## Rk ## Yd ## ## ##',
      'df .. cg .. .. rc .. .. nb .. at',
      '.. ## ## ## ## Bd ## ## ## ## ..',
      '.. hp .. Bk ## cv ## Yk rc HP ..',
      'UU .. nb .. ## HP ## .. am .. Yk',
      '## ## Yd ## ## ## ## ## Yd ## ##',
      'Yk am .. .. ## Yk ## N8 .. dk ..',
      '## ## ## Yd ## kd ## Yd ## ## ##',
      '.. .. .. .. .. HP .. .. Cw Rk ..',
    ],
    // 18F 回音長廊：指揮家的聲音；回音指揮（2×2）守著金劍
    [
      'UU .. kd .. Yd .. .. .. .. .. ..',
      '## ## ## ## ## ## ## ## ## ## ..',
      'hp .. am .. Bd .. cg .. Yd .. ..',
      '.. ## ## ## ## ## ## ## ## ## cv',
      'at .. .. Yd .. HP .. .. .. .. ..',
      'cv ## ## ## ## ## ## ## ## ## rc',
      '.. Yk kd .. Yd .. .. .. .. df ..',
      '## ## ## ## ## ## Yd ## ## ## ##',
      'at .. cg .. Yd Bk .. .. K4 K4 s3',
      '## ## ## ## ## ## ## .. K4 K4 ##',
      'df .. HP .. .. .. cv .. .. Yk DD',
      '## ## ## ## ## Yd ## ## ## ## ##',
      '.. .. am .. rc .. .. .. cv .. Yk',
      '.. ## ## ## ## ## ## ## ## ## Yd',
      'Yk .. .. .. HP kd .. .. cg .. ..',
    ],
    // 19F 前廳：失落的音符在金門後面；金盾在最長的連戰走廊盡頭；最後的衛兵
    [
      'DD .. Yk ## HP HP HP ## .. .. UU',
      '.. dk .. ## at FN df ## .. cv ..',
      '.. .. .. ## ## Rd ## ## Yk .. ..',
      '## Yd ## .. .. .. .. .. ## Yd ##',
      'hp .. .. .. kd rc nb .. Bd .. Yk',
      'at .. ## ## ## .. ## ## ## .. df',
      '.. am .. .. .. .. .. .. .. dk ..',
      '## ## ## Yd ## ## ## Yd ## ## ##',
      'Yk .. cg .. .. N9 .. .. kd .. HP',
      'HP .. .. .. .. rc .. .. .. .. Bk',
      'at df .. .. ## Cw ## .. .. HP Yk',
      '## ## Yd ## ## .. ## ## Yd ## ##',
      '.. .. nb .. ## a3 ## .. am .. ..',
      '.. ## ## ## ## dk ## ## ## ## ..',
      'Yk .. .. .. .. dk .. .. .. .. at',
    ],
    // 20F 靜默舞台：指揮家（3×3）；兩隻休止符衛士打倒才開鐵門
    [
      '## ## ## ## M1 M1 M1 ## ## ## ##',
      '## ## ## .. M1 M1 M1 .. ## ## ##',
      '## ## ## .. M1 M1 M1 .. ## ## ##',
      '## ## ## ## ## .. ## ## ## ## ##',
      '## HP .. ## ## Gt ## ## .. HP ##',
      '## .. .. .. .. .. .. .. .. .. ##',
      '## at .. ## ## .. ## ## .. df ##',
      '## ## ## ## rg .. rg ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. .. .. ## ## ## ##',
      '## ## ## ## .. DD .. ## ## ## ##',
    ],
  ];

  /* 踩到就觸發的劇情（只觸發一次）：floor → "x,y" → 劇本名 */
  MT.TRIGGERS = {
    0: { '5,14': 'b1Enter' },
    1: { '5,14': 'f1Start' },
    5: { '5,5': 'golemIntro' },
    10: { '5,5': 'sirenIntro' },
    15: { '5,5': 'echoIntro' },
    18: { '10,10': 'f18Voice' },
    19: { '0,0': 'f19Doremi' },
    20: { '5,12': 'f20Intro', '5,3': 'maestroIntro' },
  };

  /* 鐵門：指定的格子都清空（怪打倒）就打開 */
  MT.GATES = {
    5: [{ at: [5, 1], when: [[5, 3]] }],
    10: [{ at: [5, 1], when: [[5, 3]] }],
    15: [{ at: [5, 1], when: [[5, 3]] }],
    20: [{ at: [5, 4], when: [[4, 7], [6, 7]] }],
  };

  /* 劇本。指令：
       ['say', 說話者, 文字鍵]       對話（UI）
       ['narr', 文字鍵]               旁白
       ['shake', 毫秒] ['flash', 顏色] ['wait', 毫秒] ['sfx', 名稱] ['music', 曲名] ['fade', 'out'|'in']
       ['emote', 'hero'|[x,y], 符號]  頭上冒符號
       ['sparkle', x, y]              光點特效
       ['fairy', true|false]          多蕾現身／躲回口袋
       —— 以下會改遊戲狀態（解題器也會執行）——
       ['give', 道具, 數量]  ['stat', 屬性, 增量]  ['key', y|b|r, 數量]  ['flag', 名稱]  ['set', x, y, 代碼]
       ['swap', 舊代碼, 新代碼]（這層全部換掉，大型怪物用）  ['leave']（剛剛說話的 NPC 離開）  ['layer', 樂器]
       ['ending']                     結局
  */
  MT.SCRIPTS = {
    f1Start: [
      ['fairy', true],
      ['say', 'doremi', 'f1_1'],
      ['say', 'tink', 'f1_2'],
      ['say', 'doremi', 'f1_goal'],   // 第一次玩的人不知道目標是塔頂（Ken 指定）
      ['say', 'doremi', 'f1_3'],
      ['say', 'doremi', 'f1_5'],
      ['fairy', false],
    ],
    bookGet: [
      ['sfx', 'item'],
      ['fairy', true],
      ['say', 'doremi', 'book_1'],
      ['say', 'doremi', 'book_2'],
      ['say', 'tink', 'book_3'],
      ['fairy', false],
    ],
    chiselGet: [
      ['sfx', 'item'],
      ['narr', 'chisel_1'],
      ['say', 'tink', 'chisel_2'],
    ],
    n1: [['say', 'porter', 'n1_1'], ['say', 'tink', 'n1_2'], ['say', 'porter', 'n1_3']],
    n1b: [['say', 'porter', 'n1b']],
    // 第一次因為沒鑰匙過不去：多蕾提醒頭上有鑰匙圖示的人賣鑰匙（只講一次）
    keyHint: [['flag', 'hintKeyShop'], ['fairy', true], ['say', 'doremi', 'keyHint_1'], ['fairy', false]],
    bard: [
      ['emote', [4, 2], '♪'],
      ['say', 'bard', 'bard_1'],
      ['fairy', true],
      ['say', 'doremi', 'bard_2'],
      ['say', 'tink', 'bard_3'],
      ['say', 'doremi', 'bard_3b'],
      ['say', 'doremi', 'bard_4'],
      ['sfx', 'key'],
      ['key', 'y', 2],
      ['say', 'doremi', 'bard_5'],
      ['say', 'tink', 'bard_5b'],
      ['fairy', false],
      ['flag', 'bardTalked'],
      // 國王往旁邊牆邊的凹處退一步，讓出走廊
      ['sfx', 'step'], ['set', 4, 2, '..'], ['set', 5, 2, 'Om'],
      ['narr', 'bard_move'],
    ],
    bardAgain: [['say', 'bard', 'bard_again']],
    n2: [['say', 'soldier', 'n2_1'], ['say', 'tink', 'n2_2'], ['say', 'soldier', 'n2_3'], ['sfx', 'gem'], ['stat', 'def', 3], ['say', 'soldier', 'n2_4'], ['leave']],
    page1: [['sfx', 'page'], ['narr', 'page1_title'], ['narr', 'page1'], ['say', 'tink', 'page1_r']],
    page2: [['sfx', 'page'], ['narr', 'page2_title'], ['narr', 'page2'], ['fairy', true], ['say', 'doremi', 'page2_r'], ['say', 'tink', 'page2_t'], ['fairy', false]],
    page3: [['sfx', 'page'], ['narr', 'page3_title'], ['narr', 'page3'], ['fairy', true], ['say', 'doremi', 'page3_r'], ['say', 'tink', 'page3_t'], ['say', 'doremi', 'page3_hint'], ['fairy', false]],
    noteGet: [['sfx', 'harp'], ['sparkle', 5, 1], ['narr', 'note_got'], ['fairy', true], ['say', 'doremi', 'note_1'], ['say', 'tink', 'note_2'], ['say', 'doremi', 'note_3'], ['fairy', false]],
    golemIntro: [
      ['music', 'boss'],
      ['shake', 400], ['sfx', 'boom'], ['wait', 300],
      ['shake', 400], ['sfx', 'boom'], ['wait', 300],
      ['say', 'golem', 'golem_1'],
      ['fairy', true],
      ['say', 'doremi', 'golem_2'],
      ['say', 'tink', 'golem_3'],
      ['say', 'doremi', 'golem_4'],
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
      ['say', 'tink', 'drum_2b'],
      ['say', 'doremi', 'drum_3'],
      ['fairy', false],
    ],
    fd: [['say', 'pigeon', 'fd_1'], ['say', 'tink', 'fd_2'], ['say', 'pigeon', 'fd_3'], ['sfx', 'item'], ['give', 'fly', 1], ['fairy', true], ['say', 'doremi', 'fd_4'], ['fairy', false], ['leave']],
    sirenIntro: [
      ['music', 'boss'],
      ['sfx', 'harp'],
      ['say', 'siren', 'siren_1'],
      ['fairy', true],
      ['say', 'doremi', 'siren_2'],
      ['say', 'tink', 'siren_3'],
      ['say', 'siren', 'siren_4'],
      ['say', 'tink', 'siren_5'],
      ['fairy', false],
    ],
    harpGet: [
      ['flash', '#fff'], ['sparkle', 5, 3],
      ['sfx', 'fanfare'],
      ['give', 'harp', 1],
      ['layer', 'strings'],
      ['music', 'tower'],
      ['narr', 'harp_got'],
      ['set', 5, 3, 'Hs'],
      ['say', 'harpghost', 'harp_1'],
      ['fairy', true],
      ['say', 'doremi', 'harp_2'],
      ['say', 'tink', 'harp_3'],
      ['fairy', false],
      ['say', 'harpghost', 'harp_4'],
    ],
    n5: [['say', 'mirrorgirl', 'n5_1'], ['say', 'tink', 'n5_2'], ['say', 'mirrorgirl', 'n5_3'], ['sfx', 'potion'], ['stat', 'hp', 600], ['say', 'mirrorgirl', 'n5_4']],
    n5b: [['say', 'mirrorgirl', 'n5b']],
    echoIntro: [
      ['music', 'boss'],
      ['sfx', 'harp'],
      ['say', 'echo', 'echo_1'],
      ['say', 'tink', 'echo_2'],
      ['say', 'echo', 'echo_3'],
      ['fairy', true],
      ['say', 'doremi', 'echo_4'],
      ['say', 'tink', 'echo_5'],
      ['fairy', false],
    ],
    fluteGet: [
      ['flash', '#fff'], ['sparkle', 5, 3],
      ['sfx', 'fanfare'],
      ['give', 'flute', 1],
      ['layer', 'winds'],
      ['music', 'tower'],
      ['narr', 'flute_got'],
      ['fairy', true],
      ['say', 'doremi', 'flute_1'],
      ['say', 'tink', 'flute_2'],
      ['say', 'doremi', 'flute_3'],
      ['fairy', false],
    ],
    n7: [['say', 'astrologer', 'n7_1'], ['say', 'tink', 'n7_2'], ['say', 'astrologer', 'n7_3']],
    n7b: [['say', 'astrologer', 'n7b']],
    n8: [['say', 'lost', 'n8_1'], ['fairy', true], ['say', 'doremi', 'n8_2'], ['fairy', false], ['say', 'lost', 'n8_3'], ['sfx', 'key'], ['key', 'b', 1], ['leave']],
    f18Voice: [
      ['fade', 'out'],
      ['say', 'maestro', 'f13_1'],
      ['say', 'maestro', 'f13_2'],
      ['fade', 'in'],
      ['say', 'tink', 'f13_3'],
      ['say', 'tink', 'f13_3b'],
      ['fairy', true],
      ['say', 'doremi', 'f13_4'],
      ['fairy', false],
    ],
    f19Doremi: [
      ['fairy', true],
      ['say', 'doremi', 'f14_1'],
      ['say', 'tink', 'f14_2'],
      ['say', 'doremi', 'f14_3'],
      ['fairy', false],
    ],
    n9: [['say', 'guard', 'n9_1'], ['say', 'tink', 'n9_2'], ['say', 'guard', 'n9_3'], ['sfx', 'potion'], ['stat', 'hp', 1500], ['say', 'guard', 'n9_4'], ['leave']],
    b1Enter: [['fairy', true], ['say', 'doremi', 'b1_1'], ['say', 'tink', 'b1_2'], ['fairy', false]],
    nb: [['say', 'granny', 'nb_1'], ['say', 'tink', 'nb_2'], ['say', 'granny', 'nb_3'], ['sfx', 'item'], ['give', 'chisel', 1], ['say', 'granny', 'nb_4']],
    nbb: [['say', 'granny', 'nbb']],
    f20Intro: [
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
      ['say', 'doremi', 'md_3b'],
      ['fairy', false],
      ['music', 'none'],
      ['sfx', 'drumroll'], ['shake', 700], ['wait', 900],
      ['sfx', 'badsing'], ['shake', 1600], ['flash', '#ffd23f'], ['wait', 1800],
      ['say', 'maestro', 'md_4'],
      ['say', 'maestro', 'md_5'],
      ['say', 'maestro', 'md_6'],
      ['swap', 'M1', 'M2'],
      ['flag', 'maestroWeak'],
      ['music', 'boss'],
      ['say', 'maestro', 'md_7'],
    ],
    ending: [
      ['music', 'none'],
      ['wait', 500],
      ['say', 'maestro', 'end_1'],
      ['say', 'tink', 'end_2'],
      // 面具裂開：舞台中央換成沒戴面具的指揮家（＝阿爾特自己的臉）
      ['sfx', 'boom'], ['flash', '#fff'], ['swap', 'M2', '..'], ['set', 5, 1, 'Mz'],
      ['narr', 'end_2b'],
      ['fairy', true],
      ['say', 'shadow', 'end_3'],
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
      ['say', 'shadow', 'te_3'],
      ['say', 'doremi', 'te_4'],
      // 多蕾＝阿爾特小時候的歌聲：融進他的聲音裡
      ['fairy', false],
      ['narr', 'te_4b'],
      ['say', 'shadow', 'te_5'],
    ],
  };

  // 撿到日記頁時放的劇本
  MT.PAGE_SCRIPTS = { 1: 'page1', 2: 'page2', 3: 'page3' };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
