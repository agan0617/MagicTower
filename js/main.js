/* 畫面、操作、演出、選單 */
(function () {
  'use strict';
  const MT = window.MT;
  const $ = s => document.querySelector(s);
  // 地圖 W×H 格（2.0.0 起 11×15）；SIZE 是開場／結局動畫的正方形畫布
  const TILE = 48, SC = 3, W = MT.W, H = MT.H, MW = TILE * W, MH = TILE * H, SIZE = TILE * 11;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => performance.now();

  let st = null;              // 遊戲狀態
  let mode = 'title';         // title／cine／game
  let busy = 0;               // >0 時不收移動指令（演出、對話、選單）
  let lastAutoAt = 0;         // 這台裝置最後一次自動存檔的時間
  let playClock = 0;

  const view = {
    hx: 0, hy: 0, move: null, dir: 'down',
    fx: [], shake: 0, shakeUntil: 0, flash: null, fade: 0, fadeTo: 0, fadeT0: 0, fadeDur: 1,
    fairy: false, fairyT: 0, dying: null, lunge: null, hurt: 0, banner: null, doorFade: null,
  };

  const canvas = $('#map');
  canvas.width = MW; canvas.height = MH;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  /* ───────── 設定 ───────── */
  const settings = Object.assign({ music: 1, sfx: 1 }, MT.LS.get('settings', {}));   // 預設音量 100%（3.2.22 Ken 指定）
  MT.setLang(MT.LS.get('lang', MT.detectLang()));
  MT.Audio.setVolume('music', settings.music);
  MT.Audio.setVolume('sfx', settings.sfx);
  const sfx = n => MT.Audio.sfx(n);

  /* ───────── 圖示（img 用的 data URL）───────── */
  const iconCache = {};
  function icon(name, pal, flip) {
    const k = name + '|' + (pal || '') + (flip ? '|f' : '');
    if (!iconCache[k]) { const c = MT.sprite(name, pal, 2, flip); iconCache[k] = c ? c.toDataURL() : ''; }
    return iconCache[k];
  }
  const img = (name, pal, cls) => `<img class="px ${cls || ''}" src="${icon(name, pal)}" alt="">`;

  /* 代碼 → 圖 */
  function spriteFor(code) {
    if (MT.MONSTERS[code]) return [MT.MONSTERS[code].sprite, MT.MONSTERS[code].pal];
    if (MT.ITEMS[code]) return [MT.ITEMS[code].sprite, MT.ITEMS[code].pal];
    if (MT.NPCS[code]) return [MT.NPCS[code].sprite, MT.NPCS[code].pal];
    if (code === 'UU') return ['stairsUp'];
    if (code === 'DD') return ['stairsDown'];
    if (code === 'Yd') return ['door', 'doorY'];
    if (code === 'Bd') return ['door', 'doorB'];
    if (code === 'Rd') return ['door', 'doorR'];
    if (code === 'Gt') return ['gate'];
    return null;
  }
  const PORTRAIT = {
    tink: ['heroDown'], doremi: ['fairy'], bard: ['bard'], golem: ['drumgolem'], siren: ['siren'],
    maestro: ['maestro'], harpghost: ['harp'], frog: ['frog'], shadow: ['maestroBare'],
    porter: ['porter'], soldier: ['soldier'], guard: ['soldier', 'lastGuard'], pigeon: ['pigeon'], mirrorgirl: ['mirrorGirl'],
    echo: ['echoMirror'], astrologer: ['astrologer'], lost: ['fairy'], granny: ['granny'], thief: ['thief'],
    harpist: ['harpist'], metronome: ['metronome', 'metroA'], cousin: ['frogCousin'], apprentice: ['apprentice'], smith: ['smith'],
  };

  /* ───────── 地圖繪製 ───────── */
  // hp、ctx 不給就是目前這局、地圖畫布（教學的示意圖會帶自己的）
  function dmgColor(c, hp = st.hp) {
    if (c.damage == null || c.damage >= hp) return '#ff4a4a';
    if (c.damage === 0) return '#8cff8c';
    if (c.damage < hp / 4) return '#ffffff';
    if (c.damage < hp / 2) return '#ffe066';
    return '#ffa040';
  }
  function label(text, x, y, color, size, ctx = g) {
    ctx.font = `bold ${size || 13}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  const fmt = n => (n >= 100000 ? Math.round(n / 1000) + 'k' : String(n));

  // 一張圖畫成 n×n 格大（大型怪物：16×16 的圖畫成 2×2、24×24 的畫成 3×3）
  const spriteAt = (name, pal, n, flip) => { const d = MT.SPRITES[name]; return MT.sprite(name, pal, TILE * n / ((d && d.size) || 16), flip); };
  const BOSS_GLOW = { DG: '#ffd84a', SR: '#5ab0ff', EM: '#7affff' };
  // 有功能的 NPC 頭上的圖示（腳下都會發金光）：呱呱商人、小偷賣鑰匙＝鑰匙；祭壇、鐵匠、學徒收金幣、13F 表哥收購鑰匙＝金幣；
  // 節拍之神用經驗值升級＝「Lv」；老琴師（技能鑑定）、豎琴之靈（技能三選一）＝「♪」
  function tradeIcon(code) {
    const n = MT.NPCS[code];
    if (!n) return null;
    if (n.shop === 'keys' || (n.deal && MT.DEALS[n.deal].gain.keys)) return ['key1', 'keyCu'];   // 13F 表哥只收不賣（keys2），歸金幣
    if (n.deal || n.shop) return ['coin'];
    if (n.level) return { text: 'Lv', color: '#c8f0a0' };
    if (n.sage || n.choose) return { text: '♪', color: '#aef4ff' };
    return null;
  }
  /* 遇到才教（Ken 指定）：第一次碰到某個機制，多蕾講一句、問要不要看那一頁教學。每個 key 只講一次（旗標 tut:key）。
     page 是 TUT_PAGES 的索引：3 鑰匙與門、4 撿道具、5 金幣與經驗值、6 怪物特技 */
  // 通關過（有最佳紀錄，跨裝置同步）就是老玩家：再玩一次不用再教（Ken 指定）
  const veteran = () => !!(MT.Sync.best && MT.Sync.best());
  async function tutHint(key, page, vars) {
    if (!st || st.flags['tut:' + key] || scripting || veteran()) return;
    st.flags['tut:' + key] = 1;
    busy++;
    view.fairy = true; sfx('fly');
    await say('doremi', MT.t('th_' + key.split(':')[0], vars));
    const k = await ask(MT.t('thAsk'), [{ key: 'n', label: MT.t('thLater') }, { key: 'y', label: MT.t('thOpen') }]);
    view.fairy = false; busy--;
    autosave();
    if (k === 'y') openTutorial(false, page, true);
  }
  /* 走到附近才講（Ken 指定：一到樓層就連講兩個太擠）：英雄周圍 HINT_R 格內有沒看過的怪物特技、回音地板、
     祭壇／商人／節拍之神，一次講一個（危險的先講），講的時候停下腳步 */
  const SHOP_CODES = ['Sh', 'S2', 'S3', 'Mk', 'Mq', 'L1', 'L2'], HINT_R = 2;
  // 一格上有什麼值得講的：[旗標名, 教學頁, 文字參數]…
  function tileNews(c) {
    const out = [], mon = MT.MONSTERS[c];
    for (const s of (mon && mon.sp) || []) {
      if (s === 'boss' || s === 'invincible') continue;
      const tag = MT.t('sp_' + s, { p: Math.round((mon.drain || 0) * 100), n: mon.aura || 0 }).replace(/\s*[（(].*$/, '');
      out.push(['sp:' + s, 6, { sp: tag }]);
    }
    if (c === 'Ec') out.push(['echo', 6]);
    if (SHOP_CODES.includes(c)) out.push(['shop', 5]);
    return out;
  }
  function floorNews(f) {   // 整層（舊存檔補記用）
    const out = [];
    for (const row of st.maps[f]) for (const c of row) out.push(...tileNews(c));
    return out;
  }
  function nearNews() {
    const m = st.maps[st.floor], out = [];
    for (let y = st.y - HINT_R; y <= st.y + HINT_R; y++) for (let x = st.x - HINT_R; x <= st.x + HINT_R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      for (const n of tileNews(m[y][x])) if (!st.flags['tut:' + n[0]]) out.push(n);
    }
    out.sort((a, b) => (a[0] === 'shop') - (b[0] === 'shop'));
    return out[0] || null;
  }
  // 走一步、上下樓之後呼叫：有講就回傳 true（呼叫端停下自動走路）
  async function nearHints() {
    const h = nearNews();
    if (!h) return false;
    await tutHint(...h);
    return true;
  }
  // 舊存檔第一次讀進來：去過的樓層上已經見過的東西、開過門撿過道具，都當作講過了，不要一口氣補講
  function tutCatchUp() {
    if (st.flags.tutInit) return;
    st.flags.tutInit = 1;
    if (st.visited.length <= 1 && !st.steps) return;
    st.flags['tut:door'] = st.flags['tut:item'] = 1;
    for (const f of st.visited) for (const [k] of floorNews(f)) st.flags['tut:' + k] = 1;
  }
  // 第一次因為沒鑰匙過不去：多蕾提醒有人賣鑰匙（只講一次）
  function keyHint() {
    if (st.flags.hintKeyShop || scripting || veteran()) return;
    runScript('keyHint').then(autosave);
  }
  function drawTile(code, x, y, t) {
    const sp = spriteFor(code);
    if (!sp) return;
    const isMon = !!MT.MONSTERS[code];
    const n = isMon ? MT.monSize(code) : 1;
    if (n > 1) {   // 大型怪物：只在左上角那格畫一次
      const [ox, oy0] = MT.blockOrigin(st, st.floor, x, y);
      if (ox !== x || oy0 !== y) return;
      if (view.dying && view.dying.code === code && view.dying.x === x && view.dying.y === y) return;
    }
    const px = x * TILE, py = y * TILE, w = TILE * n;
    let oy = 0;
    if (isMon || MT.NPCS[code]) oy = (Math.floor(t / (n > 1 ? 700 : 420) + x * 0.7 + y * 1.3) % 2) ? -SC : 0;
    if (MT.ITEMS[code]) oy = Math.round(Math.sin(t / 380 + x + y) * 1.5);
    if (view.doorFade && view.doorFade.x === x && view.doorFade.y === y) return;
    if (isMon && (MT.MONSTERS[code].sp || []).includes('boss')) {
      g.save(); g.globalAlpha = 0.35 + 0.15 * Math.sin(t / 200);
      g.fillStyle = BOSS_GLOW[code] || '#c07cf5';
      g.beginPath(); g.ellipse(px + w / 2, py + w - 6, w * 0.42, 6 * n, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    const trade = tradeIcon(code);
    if (trade) {   // 有功能的 NPC：腳下一圈金光，不講就看不出誰能交易、升級（Ken 指定）
      // 金光要明顯到一眼看得出來（3.2.1 的 0.3 太淡，Ken 以為節拍之神沒有）：腳下的橢圓＋往上散的光暈
      // 節拍之神、祭壇這種圖整格寬，腳下的光會被圖蓋住：背後一圈大光暈露出圖的外緣，光圈和光點畫在圖的前面
      const cx = px + TILE / 2, cy = py + TILE - 7, a = 0.7 + 0.25 * Math.sin(t / 260);
      g.save();
      const halo = g.createRadialGradient(cx, py + TILE / 2, TILE * 0.3, cx, py + TILE / 2, TILE * 0.85);
      halo.addColorStop(0, `rgba(255,224,102,${a * 0.75})`); halo.addColorStop(1, 'rgba(255,224,102,0)');
      g.fillStyle = halo; g.fillRect(px - 14, py - 10, TILE + 28, TILE + 18);
      g.restore();
    }
    g.drawImage(n > 1 ? spriteAt(sp[0], sp[1], n) : MT.sprite(sp[0], sp[1], SC), px, py + oy);
    if (trade) {
      const cy = py + TILE - 5, a = 0.7 + 0.25 * Math.sin(t / 260);
      g.save();
      g.globalAlpha = a; g.strokeStyle = '#ffe066'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(px + TILE / 2, cy, TILE * 0.46, 7, 0, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 3; i++) {                       // 三顆往上飄的金色光點
        const k = (t / 1400 + i / 3 + x * 0.13) % 1;
        g.globalAlpha = (1 - k) * 0.95; g.fillStyle = '#fff6b0';
        g.fillRect(px + 8 + i * 14 + Math.sin(t / 300 + i) * 3, cy - k * (TILE - 6), 3, 3);
      }
      g.restore();
    }
    if (trade) {   // 頭上一個小圖示（見 tradeIcon）
      const bob = Math.round(Math.sin(t / 300 + x) * 2);
      if (trade.text) label(trade.text, px + TILE - 10, py + 14 + bob, trade.color, 12);
      else g.drawImage(MT.sprite(trade[0], trade[1], 1), px + TILE - 18, py + 1 + bob);
    }
    if (isMon && st.items.book) {
      const c = MT.calc(st, code);
      const txt = c.damage == null ? '???' : fmt(c.damage);
      label(txt, px + w / 2, py + w - 1, dmgColor(c), n > 1 ? 18 : 15);
    }
    // 夾擊怪：腳下一道紅色虛線，提醒「兩隻中間那格不要走」
    if (isMon && (MT.MONSTERS[code].sp || []).includes('pincer')) {
      g.save(); g.strokeStyle = 'rgba(255,90,90,0.55)'; g.setLineDash([4, 4]); g.lineWidth = 2;
      g.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6); g.restore();
    }
  }

  /* 共鳴的範圍（3.1）：共鳴怪周圍八格裡走得進去的格子（空地、道具、回音地板）鋪一層粉紅色＋虛線框（同夾擊的提醒），
     跟著共振一明一暗。水晶區的地板本來就是紫色，所以用粉紅才分得出來 */
  function drawAura(t) {
    const f = st.floor, m = st.maps[f];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = m[y][x];
      if (!(c === '..' || c === 'Ec' || MT.isItem(c)) || !MT.auraAt(st, f, x, y)) continue;
      g.save(); g.globalAlpha = 0.2 + 0.1 * Math.sin(t / 240 + (x + y) * 0.9);
      g.fillStyle = '#ff6ad8'; g.fillRect(x * TILE, y * TILE, TILE, TILE);
      g.globalAlpha = 0.7; g.strokeStyle = '#ff9cf0'; g.setLineDash([4, 4]); g.lineWidth = 2;
      g.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
      g.restore();
    }
  }
  /* 回音地板（3.1）：一圈往外擴的波紋；腳下標「這時踩上去要扣多少」（這層上一場戰鬥的損失，還沒打過是 0） */
  function drawEcho(x, y, t) {
    const k = ((t / 1500) + x * 0.37 + y * 0.21) % 1, cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
    g.save(); g.globalAlpha = 0.7 * (1 - k); g.strokeStyle = '#7affff'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, TILE * (0.12 + 0.36 * k), 0, Math.PI * 2); g.stroke(); g.restore();
    const n = MT.echoCost(st, st.floor) + MT.auraAt(st, st.floor, x, y);
    label(fmt(n), cx, y * TILE + TILE - 1, n >= st.hp ? '#ff4a4a' : n ? '#7affff' : '#8cff8c', 15);
  }

  function drawHero(t) {
    let x = st.x, y = st.y;
    if (view.move) {
      const k = Math.min(1, (t - view.move.t0) / view.move.dur);
      x = view.move.fx + (st.x - view.move.fx) * k;
      y = view.move.fy + (st.y - view.move.fy) * k;
      if (k >= 1) view.move = null;
    }
    view.hx = x; view.hy = y;
    let ox = 0, oy = 0;
    if (view.lunge) {
      const k = Math.min(1, (t - view.lunge.t0) / (view.lunge.dur || 140));
      const a = Math.sin(k * Math.PI) * 10;
      ox = view.lunge.dx * a; oy = view.lunge.dy * a;
      if (k >= 1) view.lunge = null;
    }
    if (view.knock) {                     // 被怪物打中：往後退一下
      const k = Math.min(1, (t - view.knock.t0) / 120);
      const a = Math.sin(k * Math.PI) * 5;
      ox += view.knock.dx * a; oy += view.knock.dy * a;
      if (k >= 1) view.knock = null;
    }
    const d = st.dir;
    // 原地踏步：站著時慢慢左右腳輪流抬，走路時踩快一點
    const foot = Math.floor(t / (view.move ? 140 : 380)) % 2 ? 'A' : 'B';
    // 外形跟著變強：攻＋防決定盔甲階段，手上拿的、臂上掛的照實際裝備（Ken 指定）
    const tier = MT.heroTier(st), eq = st.equip || {};
    if (view.tier != null && tier > view.tier) { sparkle(st.x, st.y, 40, ['#ffe066', '#ffffff', '#fff6b0', '#ffd84a']); flash('#fff6b0', 350); sfx('fanfare'); }   // 換新外形的那一刻閃一下
    view.tier = tier;
    const name = MT.heroSprite(d === 'up' ? 'up' : d === 'down' ? 'down' : 'side', foot, tier, eq.sword, eq.shield);
    const bob = view.move ? (Math.floor(t / 70) % 2 ? -SC : 0) : 0;
    const im = MT.sprite(name, null, SC, d === 'left');
    // 王子好找（Ken 指定）：腳下常駐一圈淡藍白光圈（跟 NPC 的金光分開）；剛換樓層、或停著不動 3 秒以上，頭上再跳一個小箭頭
    const fx0 = x * TILE + ox + TILE / 2, fy0 = y * TILE + oy + TILE - 5;
    const pulse = 0.45 + 0.15 * Math.sin(t / 420);
    g.save();
    g.globalAlpha = pulse * 0.5; g.fillStyle = '#9ad8ff';
    g.beginPath(); g.ellipse(fx0, fy0, TILE * 0.44, 7, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = pulse + 0.2; g.strokeStyle = '#e8f6ff'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(fx0, fy0, TILE * 0.44, 7, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
    if (view.heroAt !== st.floor + ',' + st.x + ',' + st.y) { view.heroAt = st.floor + ',' + st.x + ',' + st.y; view.heroStill = t; }
    const showArrow = !view.move && (t < (view.arrowUntil || 0) || t - (view.heroStill || t) > 3000);
    g.save();
    if (tier >= 3) {                          // 最後一階：腳下一圈一明一暗的金色光暈
      const cx = x * TILE + ox + TILE / 2, cy = y * TILE + oy + TILE * 0.62;
      const glow = g.createRadialGradient(cx, cy, 4, cx, cy, TILE * 0.7);
      glow.addColorStop(0, `rgba(255,216,74,${0.35 + 0.15 * Math.sin(t / 300)})`); glow.addColorStop(1, 'rgba(255,216,74,0)');
      g.fillStyle = glow; g.fillRect(cx - TILE, cy - TILE, TILE * 2, TILE * 2);
    }
    if (view.hurt > t && Math.floor(t / 50) % 2) g.globalAlpha = 0.35;
    g.drawImage(im, x * TILE + ox, y * TILE + oy + bob);
    g.restore();
    if (showArrow) {   // 頭上的小箭頭：白底深色描邊，上下跳；站在最上面一列時頭上沒空間，改成腳下往上指
      const top = y < 0.5, jump = Math.round(Math.sin(t / 180) * 4);
      const ax = fx0, ay = top ? y * TILE + oy + TILE + 6 + jump : y * TILE + oy - 6 + jump, h = top ? -10 : 10;   // h：箭頭底邊在尖端上方幾格（負的＝在下方，尖端朝上）
      g.save();
      g.beginPath(); g.moveTo(ax - 9, ay - h); g.lineTo(ax + 9, ay - h); g.lineTo(ax, ay); g.closePath();
      g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#1b1a26'; g.stroke();
      g.fillStyle = '#ffffff'; g.fill();
      g.restore();
    }
    // 多蕾跟在旁邊
    if (view.fairy) {
      const fx = x * TILE + 26 + Math.cos(t / 500) * 6, fy = y * TILE - 22 + Math.sin(t / 260) * 5;
      g.save(); g.globalAlpha = 0.5; g.fillStyle = '#fff6b0';
      g.beginPath(); g.arc(fx + 12, fy + 14, 14, 0, Math.PI * 2); g.fill(); g.restore();
      g.drawImage(MT.sprite('fairy', null, 2, Math.cos(t / 500) < 0), fx, fy);
      if (Math.random() < 0.15) view.fx.push({ kind: 'spark', x: fx + 12, y: fy + 26, vx: (Math.random() - 0.5) * 0.4, vy: 0.4, t0: t, life: 600, color: '#fff6b0' });
    }
  }

  function drawFx(t) {
    view.fx = view.fx.filter(f => t - f.t0 < f.life);
    for (const f of view.fx) {
      const k = (t - f.t0) / f.life;
      if (f.kind === 'text') {
        g.save(); g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
        label(f.text, f.x, f.y - k * 26, f.color, f.size || 16); g.restore();
      } else if (f.kind === 'spark') {
        const dt = t - f.t0;
        g.save(); g.globalAlpha = 1 - k; g.fillStyle = f.color;
        const s = f.size || 3;
        g.fillRect(f.x + f.vx * dt, f.y + f.vy * dt + (f.grav ? 0.0004 * dt * dt : 0), s, s); g.restore();
      } else if (f.kind === 'emote') {
        g.save(); g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        const bx = f.x, by = f.y - 8 - Math.min(1, k * 4) * 8;
        g.fillStyle = '#fff'; g.strokeStyle = '#1b1a26'; g.lineWidth = 2;
        g.beginPath(); g.roundRect ? g.roundRect(bx - 16, by - 26, 32, 24, 6) : g.rect(bx - 16, by - 26, 32, 24); g.fill(); g.stroke();
        g.fillStyle = '#1b1a26'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(f.text, bx, by - 13); g.restore();
      } else if (f.kind === 'cross') {
        const r = 13;
        g.save(); g.globalAlpha = 1 - k; g.lineCap = 'round';
        for (const [lw, col] of [[9, 'rgba(0,0,0,0.6)'], [5, '#ff4a4a']]) {
          g.lineWidth = lw; g.strokeStyle = col; g.beginPath();
          g.moveTo(f.x - r, f.y - r); g.lineTo(f.x + r, f.y + r); g.moveTo(f.x + r, f.y - r); g.lineTo(f.x - r, f.y + r); g.stroke();
        }
        g.restore();
      } else if (f.kind === 'slash' || f.kind === 'claw') {
        // slash＝勇者的斜劈（白色，每下方向交替，連打就是交叉的 X）；claw＝怪物的三道爪痕（紅色，方向跟斜劈相反）
        const r = TILE * (f.kind === 'slash' ? 0.42 : 0.3), p = Math.min(1, k * 2.5), s = f.flip ? -1 : 1;
        const lines = f.kind === 'slash' ? [0] : [-8, 0, 8];
        g.save(); g.globalAlpha = 1 - Math.max(0, k - 0.4) / 0.6; g.lineCap = 'round';
        const layers = f.kind === 'slash' ? [[8, 'rgba(255,255,255,0.35)'], [3, '#ffffff']] : [[6, 'rgba(0,0,0,0.5)'], [3, '#ff5a5a']];
        for (const [lw, col] of layers) {
          g.lineWidth = lw; g.strokeStyle = col;
          for (const o of lines) {
            g.beginPath(); g.moveTo(f.x - s * r + o, f.y - r); g.lineTo(f.x - s * r + o + s * 2 * r * p, f.y - r + 2 * r * p); g.stroke();
          }
        }
        g.restore();
      } else if (f.kind === 'note') {
        const dt = t - f.t0;
        g.save(); g.globalAlpha = 1 - k; g.fillStyle = f.color; g.font = 'bold 20px serif'; g.textAlign = 'center';
        g.fillText(f.text, f.x + Math.sin(dt / 200) * 8, f.y - dt * 0.05); g.restore();
      }
    }
  }

  /* 戰鬥中怪物頭上的血條：跟著每一下扣血滑順地縮短，剩一半變黃、剩四分之一變紅。
     最上面一列的怪畫在格子裡面；扣血數字從血條再上面跳出來，不會蓋住血條（見 battle） */
  function drawHpBar(d, alpha) {
    const r = Math.max(0, d.hp / d.hpMax);
    d.shown = d.shown == null ? r : d.shown + (r - d.shown) * 0.3;
    const dn = d.n || 1, bw = TILE * dn - 10, bh = dn > 1 ? 8 : 6, bx = d.x * TILE + 5, by = d.y > 0 ? d.y * TILE - bh - 2 : d.y * TILE + 1;
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    g.fillStyle = r > 0.5 ? '#6ee06e' : r > 0.25 ? '#ffd84a' : '#ff5a5a';
    g.fillRect(bx, by, bw * d.shown, bh);
    g.restore();
  }

  function render() {
    const t = now();
    requestAnimationFrame(render);
    if (!st || mode !== 'game') return;
    const f = st.floor, zone = MT.zoneOf(f);
    g.save();
    if (view.shakeUntil > t) g.translate((Math.random() - 0.5) * view.shake, (Math.random() - 0.5) * view.shake);
    const m = st.maps[f];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const code = m[y][x];
      const kind = code === '##' ? 'wall' : code === 'Hw' ? 'hidden' : code === 'Cw' ? 'cracked' : code === 'Ec' ? 'echo' : 'floor';
      g.drawImage(MT.terrain(kind, zone, TILE, (x * 7 + y * 13) % 10), x * TILE, y * TILE);
    }
    drawAura(t);
    drawRoute(t);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const code = m[y][x];
      if (code === 'Ec') drawEcho(x, y, t);
      else if (code !== '##' && code !== '..' && code !== 'Hw' && code !== 'Cw') drawTile(code, x, y, t);
    }
    // 開門：門往上淡出
    if (view.doorFade) {
      const d = view.doorFade, k = (t - d.t0) / 220;
      if (k >= 1) view.doorFade = null;
      else { g.save(); g.globalAlpha = 1 - k; g.drawImage(MT.sprite('door', d.pal, SC), d.x * TILE, d.y * TILE - k * 20); g.restore(); }
    }
    // 被打倒的怪
    if (view.dying) {
      const d = view.dying, k = (t - d.t0) / d.dur;
      if (k >= 1 && d.done) view.dying = null;
      else {
        g.save();
        if (d.phase === 'die') { g.globalAlpha = Math.max(0, 1 - k); }
        else if (Math.floor(t / 60) % 2 && d.flash > t) g.globalAlpha = 0.3;
        const sp = spriteFor(d.code), dn = d.n || 1, img = dn > 1 ? spriteAt(sp[0], sp[1], dn) : MT.sprite(sp[0], sp[1], SC);
        let ox = d.phase === 'die' ? 0 : (Math.random() - 0.5) * (d.flash > t ? 4 : 0), oy = 0, lean = 0;
        // 戰鬥中面對勇者：平常就往勇者那邊靠一點、上半身傾過去；輪到它出手時整隻撲過去
        if (d.face && d.phase === 'fight') {
          let a = 2;
          if (d.lunge) {
            const lk = Math.min(1, (t - d.lunge.t0) / d.lunge.dur);
            a += Math.sin(lk * Math.PI) * 12;
            if (lk >= 1) d.lunge = null;
          }
          ox += d.face[0] * a; oy += d.face[1] * a;
          lean = d.face[0] * (0.12 + (a - 2) / 12 * 0.15);
        }
        const px = d.x * TILE + ox, py = d.y * TILE + oy;
        if (lean) { g.translate(px + TILE * dn / 2, py + TILE * dn); g.transform(1, 0, -lean / dn, 1, 0, 0); g.drawImage(img, -TILE * dn / 2, -TILE * dn); }   // 以腳底為軸往勇者那邊斜
        else g.drawImage(img, px, py);
        g.restore();
        if (d.hpMax) drawHpBar(d, d.phase === 'die' ? Math.max(0, 1 - k) : 1);
      }
    }
    drawMarks(t);
    drawHero(t);
    drawFx(t);
    g.restore();
    // 淡入淡出、閃光
    if (view.fade !== view.fadeTo) {
      const k = Math.min(1, (t - view.fadeT0) / view.fadeDur);
      view.fadeCur = view.fadeFrom + (view.fadeTo - view.fadeFrom) * k;
      if (k >= 1) view.fade = view.fadeTo;
    } else view.fadeCur = view.fade;
    if (view.fadeCur > 0) { g.fillStyle = `rgba(8,6,16,${view.fadeCur})`; g.fillRect(0, 0, MW, MH); }
    if (view.flash) {
      const k = (t - view.flash.t0) / view.flash.dur;
      if (k >= 1) view.flash = null;
      else { g.save(); g.globalAlpha = 1 - k; g.fillStyle = view.flash.color; g.fillRect(0, 0, MW, MH); g.restore(); }
    }
    if (view.banner) {
      const k = (t - view.banner.t0) / 1100;
      if (k >= 1) view.banner = null;
      else {
        g.save(); g.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
        g.fillStyle = 'rgba(8,6,16,0.6)'; g.fillRect(0, MH / 2 - 40, MW, 80);
        label(view.banner.text, MW / 2, MH / 2 + 14, '#ffe9a8', 40);
        g.restore();
      }
    }
  }
  requestAnimationFrame(render);

  function fade(to, dur) {
    view.fadeFrom = view.fadeCur || view.fade; view.fadeTo = to; view.fadeT0 = now(); view.fadeDur = dur;
    view.fade = view.fadeFrom === to ? to : view.fadeFrom;
    return sleep(dur);
  }
  const floatText = (x, y, text, color, size) => view.fx.push({ kind: 'text', x: x * TILE + TILE / 2, y: y * TILE + 10, text, color, size, t0: now(), life: 900 });
  function sparkle(x, y, n, colors) {
    const t = now();
    for (let i = 0; i < (n || 26); i++) {
      const a = Math.random() * Math.PI * 2, v = 0.05 + Math.random() * 0.18;
      view.fx.push({ kind: 'spark', x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, grav: true,
        t0: t, life: 700 + Math.random() * 500, color: (colors || ['#ffe066', '#ffffff', '#ff9ccc', '#aef4ff'])[i % 4], size: 3 + (i % 2) * 2 });
    }
  }
  function notes(x, y, n) {
    const t = now();
    for (let i = 0; i < n; i++) view.fx.push({ kind: 'note', x: x * TILE + TILE / 2 + (Math.random() - 0.5) * 60, y: y * TILE + 10, text: '♪♫♬♩'[i % 4], color: ['#ffe066', '#aef4ff', '#ff9ccc'][i % 3], t0: t + i * 80, life: 1400 });
  }
  const shake = (ms, amp) => { view.shake = amp || 8; view.shakeUntil = now() + ms; };
  const flash = (color, dur) => { view.flash = { color: color || '#fff', t0: now(), dur: dur || 450 }; };

  /* ───────── HUD ───────── */
  /* 屬性增加時先在地圖上跳「+N」（鑰匙是鑰匙圖），再飛進上面的資訊列，飛到了數字才加上去（Ken 指定）。
     飛行途中那一份記在 hudHold，資訊列顯示「實際值－還在飛的」 */
  const HUD_KEYS = ['hp', 'atk', 'def', 'gold', 'ky', 'kb', 'kr'];
  const HUD_EL = { hp: '#hHp', atk: '#hAtk', def: '#hDef', gold: '#hGold', ky: '#hKy', kb: '#hKb', kr: '#hKr' };
  const hudHold = { hp: 0, atk: 0, def: 0, gold: 0, ky: 0, kb: 0, kr: 0 };
  const statOf = k => (k.length === 2 && k[0] === 'k' ? st.keys[k[1]] : st[k]);
  const hudVal = k => statOf(k) - hudHold[k];
  const snapStats = () => Object.fromEntries(HUD_KEYS.map(k => [k, statOf(k)]));
  let hudGen = 0;   // 每開一局加一：上一局還在飛的數字落地時不要動到這一局的資訊列
  function flyGain(key, n, x, y, delay) {
    if (!(n > 0)) return;
    const gen = hudGen;
    hudHold[key] += n;
    const r = canvas.getBoundingClientRect(), s = r.width / canvas.width;
    const sx = r.left + (x * TILE + TILE / 2) * s, sy = r.top + (y * TILE + TILE / 2) * s;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:50;pointer-events:none;white-space:nowrap;font:bold ' +
      Math.round((key === 'gold' ? 22 : 17) * s) + 'px ui-monospace,Menlo,Consolas,monospace;text-shadow:0 0 3px #000,0 0 3px #000,0 0 2px #000;opacity:0';
    if (key[0] === 'k' && key.length === 2) {
      const sp = spriteFor(KEY_OF[key[1]]), w = Math.round(TILE * s * 0.8);
      el.innerHTML = `<img src="${icon(sp[0], sp[1])}" style="width:${w}px;height:${w}px;image-rendering:pixelated;display:block">`;
    } else {
      el.textContent = { hp: '+' + n, atk: MT.t('atk') + '+' + n, def: MT.t('def') + '+' + n, gold: '+' + n + 'G' }[key];
      el.style.color = `var(--${key})`;   // 跟資訊列上那個數字同色（style.css 的 --hp／--atk／--def／--gold）
    }
    document.body.appendChild(el);
    setTimeout(() => {
      const target = $(HUD_EL[key]), tr = target.getBoundingClientRect();
      const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
      const at = (px, py, sc) => `translate(${px}px,${py}px) translate(-50%,-50%) scale(${sc})`;
      // 先在原地彈出來停一下，再加速飛進資訊列、邊飛邊縮小
      const a = el.animate([
        { transform: at(sx, sy, 0.5), opacity: 0 },
        { transform: at(sx, sy - 16 * s, 1.25), opacity: 1, offset: 0.14 },
        { transform: at(sx, sy - 20 * s, 1), opacity: 1, offset: 0.42, easing: 'cubic-bezier(.55,0,.85,.4)' },
        { transform: at(tx, ty, 0.55), opacity: 0.9 },
      ], { duration: 950, fill: 'forwards' });
      a.onfinish = () => {
        el.remove();
        if (gen !== hudGen) return;
        hudHold[key] -= n;
        if (st) target.textContent = hudVal(key);
        const tally = { hp: 'tallyHp', atk: 'tallyAtk', def: 'tallyDef', gold: 'tallyGold' }[key];
        if (tally) sfx(tally);   // 數字落進資訊列的那一下
        target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45)', filter: 'brightness(1.8)' }, { transform: 'scale(1)' }], { duration: 320 });
      };
    }, delay || 0);
  }
  // 比對事件前後的數值，增加的部分從地圖上 (x, y) 一項一項飛過去
  function flyGains(before, x, y) {
    let i = 0;
    for (const k of HUD_KEYS) { const d = statOf(k) - before[k]; if (d > 0) flyGain(k, d, x, y, i++ * 140); }
  }
  function renderHud() {
    if (!st) return;
    $('#hFloor').textContent = MT.floorName(st.floor);
    for (const k of HUD_KEYS) $(HUD_EL[k]).textContent = hudVal(k);
    const inst = [];
    if (st.items.drum) inst.push(img('drum', null, 'inst'));
    if (st.items.harp) inst.push(img('harp', null, 'inst'));
    if (st.items.flute) inst.push(img('flute', null, 'inst'));
    if (st.items.note) inst.push(img('goldnote', null, 'inst'));
    $('#hInst').innerHTML = inst.join('');
    $('#hLv').textContent = 'Lv' + st.lv;
    $('#hExp').textContent = 'EXP ' + st.exp;
    $('#hChW').hidden = !st.items.chisel; $('#hCh').textContent = st.items.chisel;
    const sk = st.skill;
    $('#hSk').hidden = !sk;
    if (sk) { $('#hSk').textContent = MT.t('skill_' + sk.type) + (sk.lv ? ' Lv' + sk.lv : ''); $('#hSk').classList.toggle('off', !sk.lv); $('#hSk').title = sk.lv ? '' : MT.t('skillNotYet'); }
    $('#bFly').disabled = !st.items.fly;
    $('#bBook').disabled = !st.items.book;
  }
  function renderStaticText() {
    document.title = MT.t('title') + '：' + MT.t('subtitle');
    $('#lHp').textContent = MT.t('hp'); $('#lAtk').textContent = MT.t('atk'); $('#lDef').textContent = MT.t('def'); $('#lGold').textContent = MT.t('gold');
    $('#bBook span').textContent = MT.t('btnBook'); $('#bFly span').textContent = MT.t('btnFly');
    $('#bSave span').textContent = MT.t('btnSave'); $('#bMenu span').textContent = MT.t('btnMenu');
    $('#cineSkip').textContent = MT.t('skip');
    $('#bLook span').textContent = MT.t('btnLook');
    renderCloudChip();
    if (mode === 'title') renderTitle();
    renderHud();
  }
  function setupIcons() {
    $('#iHp').src = icon('heart'); $('#iGold').src = icon('coin');
    $('#iAtk').src = icon('gemSword', 'gemRed'); $('#iDef').src = icon('gemShield', 'gemBlue');
    [['#iKy', 'Yk'], ['#iKb', 'Bk'], ['#iKr', 'Rk']].forEach(([id, c]) => { $(id).src = icon(MT.ITEMS[c].sprite, MT.ITEMS[c].pal); });
    $('#iCh').src = icon('chisel');
    $('#bLook img').src = icon('lens'); $('#bBook img').src = icon('book'); $('#bFly img').src = icon('feather');
    $('#bSave img').src = icon('page'); $('#bMenu img').src = icon('altar', 'stone');
  }

  /* ───────── 訊息 ───────── */
  let toastTimer = null;
  /* 提示（撿到道具等）放在畫面正中間（Ken 指定）：遊戲中對齊地圖中心、寬度不超出地圖，
     其他畫面（標題等）用 CSS 預設的視窗正中間 */
  function placeToast(el) {
    el.style.top = el.style.left = el.style.maxWidth = '';
    if (mode !== 'game') return;
    const m = $('#mapWrap').getBoundingClientRect();
    el.style.left = (m.left + m.width / 2) + 'px';
    el.style.top = (m.top + m.height / 2) + 'px';
    el.style.maxWidth = (m.width - 16) + 'px';
  }
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false; placeToast(el); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1900);
  }

  /* ───────── 對話框 ───────── */
  let dialogResolve = null, typing = null;
  function say(speaker, text) {
    return new Promise(res => {
      const box = $('#dialog');
      box.hidden = false;
      box.classList.toggle('narr', !speaker);
      box.classList.toggle('top', !!st && st.y >= Math.ceil(H / 2));
      const pc = $('#dPortrait');
      if (speaker && PORTRAIT[speaker]) {
        const p = PORTRAIT[speaker];
        pc.hidden = false; pc.src = icon(p[0], p[1]);
        $('#dName').textContent = MT.t('speaker_' + speaker);
        $('#dName').hidden = false;
      } else { pc.hidden = true; $('#dName').hidden = true; }
      const el = $('#dText');
      el.textContent = '';
      $('#dMore').hidden = true;
      const chars = Array.from(text);
      let i = 0;
      typing = setInterval(() => {
        i += 1;
        el.textContent = chars.slice(0, i).join('');
        if (i % 3 === 1 && speaker) MT.Audio.voice(speaker);   // 每個角色自己的聲音（阿爾特跟對方分得開）
        if (i >= chars.length) finishTyping();
      }, 28);
      function finishTyping() { clearInterval(typing); typing = null; el.textContent = text; $('#dMore').hidden = false; }
      dialogResolve = () => {
        if (typing) { finishTyping(); return; }
        dialogResolve = null; box.hidden = true; res();
      };
    });
  }
  function advanceDialog() { if (dialogResolve) { dialogResolve(); return true; } return false; }
  // 對話中點畫面任何地方都算下一步（不限對話框本身）；那一下不讓底下的按鈕、地圖收到，免得順手開了選單或走一步
  let eatClick = false;
  document.addEventListener('pointerdown', e => {
    eatClick = false;
    if (!dialogResolve || !$('#modal').hidden) return;
    e.preventDefault(); e.stopPropagation();
    eatClick = true;
    advanceDialog();
  }, { capture: true });
  document.addEventListener('click', e => {
    if (!eatClick) return;
    eatClick = false;
    e.preventDefault(); e.stopPropagation();
  }, { capture: true });

  /* ───────── 劇本 ───────── */
  function musicFor() {
    if (!st) return 'title';
    const f = st.floor;
    const bossAlive = code => MT.findTile(st, f, code);
    if (f === 5 && st.flags['trig:5:golemIntro'] && bossAlive('DG')) return 'boss';
    if (f === 10 && st.flags['trig:10:sirenIntro'] && bossAlive('SR')) return 'boss';
    if (f === 15 && st.flags['trig:15:echoIntro'] && bossAlive('EM')) return 'boss';
    if (f === 20 && st.flags['trig:20:f20Intro'] && !st.done) return 'boss';
    return 'tower';
  }
  const playMusic = name => MT.Audio.play(name, st ? st.layers : ['base']);

  let scripting = 0; // 劇本播到一半不存檔（旗標已設、道具還沒給的狀態不能留下來）
  async function runScript(id) {
    const cmds = MT.SCRIPTS[id];
    if (!cmds) return;
    busy++; scripting++;
    try {
      for (const c of cmds) {
        switch (c[0]) {
          case 'say': await say(c[1], MT.story(c[2])); break;
          case 'narr': await say(null, MT.story(c[1])); break;
          case 'shake': shake(c[1], 9); await sleep(Math.min(c[1], 300)); break;
          case 'flash': flash(c[1], 500); await sleep(250); break;
          case 'wait': await sleep(c[1]); break;
          case 'sfx': sfx(c[1]); break;
          case 'music': playMusic(c[1]); break;
          case 'fade': await fade(c[1] === 'out' ? 0.75 : 0, 500); break;
          case 'emote': {
            const [x, y] = c[1] === 'hero' ? [st.x, st.y] : c[1];
            view.fx.push({ kind: 'emote', x: x * TILE + TILE / 2, y: y * TILE, text: c[2], t0: now(), life: 1200 });
            await sleep(700); break;
          }
          case 'sparkle': sparkle(c[1], c[2], 40); notes(c[1], c[2], 8); break;
          case 'fairy':
            view.fairy = c[1];
            if (c[1]) { sfx('fly'); sparkle(st.x, st.y - 0.5, 14, ['#fff6b0', '#ffe066', '#ffffff', '#ff9ccc']); await sleep(250); }
            break;
          case 'layer':
            MT.applyCmd(st, c);
            MT.Audio.setLayers(st.layers);
            break;
          case 'give': {
            const fresh = MT.COLLECT.includes(c[1]) && !(st.found && st.found[c[1]] != null);
            MT.applyCmd(st, c);
            if (['book', 'fly', 'drum', 'harp', 'flute', 'chisel'].includes(c[1])) floatText(st.x, st.y, MT.itemName(c[1]), '#ffe9a8', 15);
            if (fresh) colNotice();
          }
            renderHud(); break;
          case 'set':
            MT.applyCmd(st, c);
            if (c[3] === 'Hs') { flash('#aef4ff', 500); sparkle(c[1], c[2], 30); }
            break;
          case 'swap':
            MT.applyCmd(st, c);
            if (c[2] === 'M2') { flash('#ffd84a', 600); sparkle(5, 1, 30); }
            break;
          case 'branch':
            if (c[1] === 'trueEnd' && MT.isTrueEnding(st)) await runScript(c[2]);
            break;
          case 'ending':
            MT.applyCmd(st, c);
            await sleep(600);
            busy--; // 交給結局畫面
            startEnding();
            return;
          default: { const before = snapStats(); MT.applyCmd(st, c); flyGains(before, st.x, st.y); }
        }
      }
    } finally { scripting--; if (busy > 0 && mode === 'game') busy--; }
    renderHud();
  }

  /* ───────── 移動與事件 ───────── */
  const DIR_V = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  let autoPath = null;

  async function stepOnce(dir) {
    if (busy || !st || mode !== 'game') return false;
    const fx = st.x, fy = st.y;
    const before = snapStats();
    const ev = MT.step(st, dir);
    switch (ev.type) {
      case 'bump': sfx('bump'); return false;
      case 'move':
        view.move = { fx, fy, t0: now(), dur: 95 }; sfx('step');
        if (ev.echo != null || ev.aura) await hazardHit(ev);
        if (ev.pincer) await pincerHit(ev);
        if (ev.script) { await sleep(110); await runScript(ev.script); autosave(); }
        if (!ev.script && !ev.pincer && await nearHints()) return false;
        return !ev.script && !ev.pincer;
      case 'secret':
        view.move = { fx, fy, t0: now(), dur: 95 };
        sfx('gate'); sparkle(ev.x, ev.y, 24, ['#ffe066', '#ffffff', '#aef4ff', '#ffe066']); toast(MT.t('secretFound'));
        if (ev.script) { await sleep(110); await runScript(ev.script); }
        autosave();
        return false;
      case 'break':
        sfx('boom'); shake(250, 6); sparkle(ev.x, ev.y, 26, ['#c8c8d8', '#8a8f9e', '#ffffff', '#ffe066']);
        toast(MT.t('wallBroken', { n: st.items.chisel })); renderHud(); autosave();
        return false;
      case 'noChisel': sfx('error'); toast(MT.t('needChisel')); return false;
      case 'deal': await openDeal(ev.deal); return false;
      case 'level': openLevel(ev.level); return false;
      case 'sage': await runSage(); return false;
      case 'choose': await openChoose(); return false;
      case 'pickup': {
        view.move = { fx, fy, t0: now(), dur: 95 };
        if (ev.aura) await hazardHit(ev);
        if (ev.pincer) await pincerHit(ev);
        const it = MT.ITEMS[ev.item];
        const g2 = ev.got;
        if (it.kind === 'key') { sfx('key'); toast(MT.t('got_key_' + it.key)); }
        else if (it.equip) { sfx('item'); toast(MT.t('got_equip', { name: MT.itemName(ev.item), stat: MT.t(it.kind), n: g2.value })); sparkle(ev.x, ev.y, 20); }
        else if (it.kind === 'hp') sfx('heart');
        else if (it.kind === 'atk') sfx('swordGet');
        else if (it.kind === 'def') sfx('shieldGet');
        flyGains(before, ev.x, ev.y);   // +N（鑰匙是鑰匙圖）從撿到的地方飛進資訊列
        if (g2.newFound) colNotice();
        // 藥水、小劍、小盾也跟鑰匙一樣跳提示（Ken 指定）
        if (['hp', 'atk', 'def'].includes(it.kind) && !it.equip) toast(MT.t('got_' + it.kind, { name: MT.t('name_' + ev.item), n: g2.value }));
        else if (it.kind === 'page') { toast(MT.t('got_page')); }
        else if (it.kind === 'note') { sfx('fanfare'); toast(MT.t('got_note')); sparkle(ev.x, ev.y, 30); }
        renderHud();
        if (ev.script) { await sleep(120); await runScript(ev.script); autosave(); return false; }
        if ((it.kind === 'atk' || it.kind === 'def') && !it.equip && !st.flags['tut:item']) { tutHint('item', 4); return false; }
        return true;
      }
      case 'door': {
        sfx('door');
        view.doorFade = { x: ev.x, y: ev.y, t0: now(), pal: { y: 'doorY', b: 'doorB', r: 'doorR' }[ev.key] };
        renderHud(); busy++; await sleep(200); busy--;
        tutHint('door', 3);
        return false;
      }
      case 'noKey': sfx('error'); toast(MT.t('needKey_' + ev.key)); keyHint(); return false;
      case 'tooHurt': sfx('error'); toast(MT.t('tooHurt', { n: ev.loss })); return false;
      case 'cantFight': {
        sfx('error');
        const nm = MT.monName(ev.tile);
        toast(ev.calc.damage == null ? MT.t('cantHurtMsg', { name: nm }) : MT.t('cantWin', { name: nm, d: ev.calc.damage }));
        return false;
      }
      case 'fight': await battle(ev, fx, fy, dir); return false;
      case 'stairs': await changeFloor(ev.tile === 'UU'); if (ev.script) await runScript(ev.script); await nearHints(); autosave(); return false;
      case 'talk': if (ev.script) { await runScript(ev.script); autosave(); } else toast(MT.t('npcBusy')); return false;
      case 'shop': openShop(ev.shop); return false;
      case 'script': await runScript(ev.script); autosave(); return false;
    }
    return false;
  }

  // 走進兩隻夾擊怪中間：紅閃＋扣血
  async function pincerHit(ev) {
    busy++;
    sfx('hurt'); flash('#ff3a3a', 300); shake(250, 6); view.hurt = now() + 300;
    floatText(st.x, st.y, '-' + ev.pincer, '#ff6a6a', 18);
    toast(MT.t('pincerHit', { n: ev.pincer }));
    renderHud();
    await sleep(320);
    busy--;
  }

  /* 回音地板、共鳴（3.1）：回音是青色波紋＋這層上一場戰鬥的損失再來一次（0 就只是一陣安靜的波紋）；
     共鳴是紫色、每一步一點，只有這次開遊戲第一次被震到時跳提示（走一整條共鳴走廊不要一直洗畫面） */
  async function hazardHit(ev) {
    busy++;
    if (ev.echo != null) {
      sparkle(st.x, st.y, 18, ['#7affff', '#4fd8cc', '#ffffff']);
      if (ev.echo) { sfx('echoHit'); flash('#4fd8cc', 260); view.hurt = now() + 300; floatText(st.x, st.y, '-' + ev.echo, '#7affff', 18); toast(MT.t('echoHit', { n: ev.echo })); }
      else { sfx('echoQuiet'); toast(MT.t('echoQuiet')); }
    }
    if (ev.aura) {
      sfx('auraHit'); view.hurt = now() + 220;
      floatText(st.x, st.y - (ev.echo ? 0.6 : 0), '-' + ev.aura, '#e0a8ff', 16);
      if (!view.auraTold) { view.auraTold = true; toast(MT.t('auraHit', { n: ev.aura })); }
    }
    renderHud();
    await sleep(ev.echo != null ? 320 : 90);
    busy--;
  }

  // 路上的一次性交易：說明＋要不要
  async function openDeal(id) {
    const D = MT.DEALS[id], n = MT.NPCS[st.maps[st.floor][st.talkAt[1]][st.talkAt[0]]];
    busy++;
    await say(n && n.speaker || null, MT.story('deal_' + id));
    busy--;
    const ok = st.gold >= D.price;
    const k = await ask(MT.t('dealAsk', { p: D.price, g: st.gold }), ok ? [{ key: 'n', label: MT.t('dealNo') }, { key: 'y', label: MT.t('dealYes') }] : [{ key: 'n', label: MT.t('dealPoor') }]);
    if (k !== 'y') { busy++; await say(n && n.speaker || null, MT.story('deal_' + id + '_no')); busy--; return; }
    const before = snapStats();
    const x = st.talkAt[0], y = st.talkAt[1];
    if (!MT.acceptDeal(st, id)) { sfx('error'); toast(MT.t('noGold')); return; }
    sfx('buy'); sparkle(x, y, 20); flyGains(before, x, y); renderHud();
    busy++; await say(n && n.speaker || null, MT.story('deal_' + id + '_yes')); busy--;
    autosave();
  }

  // 節拍之神：經驗值換等級
  function openLevel(id) {
    const G = MT.LEVEL[id], cost = MT.levelCost(st), poor = st.exp < cost;
    openModal(MT.t('level_' + id), `<div class="shopTop">${img('metronome', id === 'L2' ? 'metroB' : 'metroA', 'big')}<p>${esc(MT.t('levelText', { lv: st.lv, cost }))}</p></div>
      <div class="opts"><button class="btn opt" data-up ${poor ? 'disabled' : ''}>${esc(MT.t('levelUp', { hp: G.hp, atk: G.atk, def: G.def }))}</button></div>
      <p class="muted small">EXP：${st.exp}　Lv ${st.lv}</p><button class="btn" data-x>${esc(MT.t('leave'))}</button>`, body => {
      body.querySelector('[data-up]').addEventListener('click', () => {
        const before = snapStats();
        if (MT.buyLevel(st, id)) { sfx('fanfare'); notes(st.x, st.y, 6); flyGains(before, st.x, st.y); renderHud(); closeModal(); openLevel(id); autosave(); } else { sfx('error'); toast(MT.t('noExp')); }
      });
      body.querySelector('[data-x]').addEventListener('click', closeModal);
    });
  }

  // 老琴師：技能鑑定與升級（台詞跟著目前的狀態變）
  async function runSage() {
    busy++;
    const r = MT.sage(st);
    const sk = st.skill;
    const lines = { none: ['sage_none'], activate: ['sage_act1', 'sage_act2_' + (sk && sk.type)], up: ['sage_up', 'sage_up_' + (sk && sk.type)], notyet: ['sage_notyet'], max: ['sage_max'] }[r.r];
    for (const k of lines) await say('harpist', MT.story(k).replace('{lv}', r.need || (sk && sk.lv)).replace('{skill}', sk ? MT.t('skill_' + sk.type) : ''));
    if (r.r === 'activate' || r.r === 'up') { sfx('fanfare'); flash('#d9b8ff', 400); sparkle(st.x, st.y, 30); notes(st.x, st.y, 8); toast(MT.t('skillUp', { s: MT.t('skill_' + sk.type), lv: sk.lv })); }
    busy--;
    renderHud(); autosave();
  }

  // 豎琴之靈：三種唱法選一種（之後不能換）
  async function openChoose() {
    busy++;
    await say('harpghost', MT.story('choose_1'));
    busy--;
    const opts = ['absorb', 'reflect', 'double'].map(k => `<button class="btn opt skillOpt" data-s="${k}"><b>${esc(MT.t('skill_' + k))}</b><br><span class="small">${esc(MT.t('skillDesc_' + k))}</span></button>`).join('');
    openModal(MT.t('chooseTitle'), `<p class="small">${esc(MT.t('chooseHint'))}</p><div class="opts">${opts}</div>`, body => {
      body.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', async () => {
        const k = b.dataset.s;
        if (await ask(MT.t('chooseConfirm', { s: MT.t('skill_' + k) }), [{ key: 'n', label: MT.t('no') }, { key: 'y', label: MT.t('yes') }]) !== 'y') return;
        closeModal();
        const [x, y] = st.talkAt;
        MT.chooseSkill(st, k);
        sfx('harp'); flash('#aef4ff', 500); sparkle(x, y, 40);
        busy++;
        await say('harpghost', MT.story('choose_' + k));
        await say('doremi', MT.story('choose_after'));
        busy--;
        renderHud(); autosave();
      }));
    });
  }

  async function changeFloor(up) {
    busy++;
    sfx(up ? 'stairs' : 'stairsDown');
    view.move = null; view.dying = null;
    view.fadeCur = 1; view.fade = 1; view.fadeTo = 1;
    renderHud();
    playMusic(musicFor());
    await sleep(60);
    await fade(0, 260);
    view.banner = { text: MT.floorName(st.floor), t0: now() }; view.arrowUntil = now() + 2800;
    busy--;
  }

  async function battle(ev, fx, fy, dir) {
    busy++;
    clearRoute();   // 開打了，終點光標不用再留在怪物身上
    const c = ev.calc, m = c.m;
    const boss = (m.sp || []).includes('boss');
    const n = MT.monSize(ev.tile), [bx, by] = ev.at || [ev.x, ev.y];
    const cx = bx + (n - 1) / 2, cy = by + (n - 1) / 2;   // 怪物（整塊）的中心格
    const [dx, dy] = DIR_V[dir];
    view.dying = { code: ev.tile, x: bx, y: by, n, t0: now(), dur: 1e9, phase: 'fight', flash: 0, hpMax: m.hp, hp: m.hp, face: [-dx, -dy] };
    const center = (x, y) => [x * TILE + TILE / 2, y * TILE + TILE / 2];
    const fxAt = (kind, [x, y], flip, life) => view.fx.push({ kind, x, y, flip, t0: now(), life });
    /* 照 MT.calc 的規則排出每一下：勇者每回合打 c.strikes 這幾下（技能「連音」會多一下），
       怪物還活著就回擊 c.monStrikes 下（連擊兩下），反彈技能每被打一下就把 c.reflect 彈回去。
       吸血先演（開打前先吸）。整場照正常速度演會超過上限（一般 4 回合、Boss 8 回合）時，等比例加速 */
    const seq = [];
    let mhp = m.hp;
    const monTurn = () => {
      for (let s2 = 0; s2 < c.monStrikes; s2++) { seq.push({ who: 'mon', hit: c.monHit, refl: c.reflect }); mhp -= c.reflect; if (mhp <= 0) return true; }
      return false;
    };
    const sp = m.sp || [];
    let dead = sp.includes('first') && (c.monHit > 0 || c.reflect > 0) ? monTurn() : false;
    while (!dead) {
      for (const h of c.strikes) { const hit = Math.min(mhp, h); seq.push({ who: 'hero', hit }); mhp -= hit; if (mhp <= 0) break; }
      if (mhp <= 0) break;
      if (c.monHit > 0 || c.reflect > 0) dead = monTurn(); else seq.push({ who: 'idle' });
      if (seq.length > 4000) break;
    }
    const heroGap0 = boss ? 200 : 130, monGap0 = heroGap0 * 0.85;   // 雙方一來一往要看得出來
    const cap = (boss ? 8 : 4) * (heroGap0 + monGap0);
    const full = seq.reduce((a, e) => a + (e.who === 'hero' ? heroGap0 : e.who === 'mon' ? monGap0 : 0), 0);
    const k = full > cap ? cap / full : 1;
    const heroGap = Math.max(18, heroGap0 * k), monGap = Math.max(14, monGap0 * k);
    let lastSfx = 0;
    const sfxT = nm => { const t = now(); if (k === 1 || t - lastSfx >= 70) { sfx(nm); lastSfx = t; } };   // 加速時音效不要疊成一團
    let shown = st.hp + c.damage, monHp = m.hp, heroHits = 0, i = 0;
    const setHp = v => { shown = Math.max(st.hp, v); $('#hHp').textContent = shown; };
    if (c.drain) {   // 吸血：開打前先吸走一截
      sfx('drain'); flash('#b0103a', 300);
      floatText(st.x, st.y > 0 ? st.y - 0.3 : st.y + 0.25, MT.t('drainText', { n: c.drain }), '#ff4a8a', 15);
      setHp(shown - c.drain);
      await sleep(420);
    }
    for (const e of seq) {
      if (e.who === 'hero') {
        monHp -= e.hit; view.dying.hp = monHp;
        view.lunge = { dx, dy, t0: now(), dur: Math.min(140, heroGap) };
        fxAt('slash', center(cx, cy), i++ % 2, 220);
        sfxT(boss ? 'hitBig' : 'hit');   // 打 Boss 的每一下比較沉
        view.dying.flash = now() + 120;
        floatText(cx + (i % 2 ? 0.14 : -0.14), by > 0 ? by - 0.45 : by + 0.25, '-' + e.hit, '#ffffff', 14);
        if (boss) shake(120, 5);
        await sleep(heroGap);
      } else if (e.who === 'mon') {
        if (e.hit > 0) {
          sfxT('hurt'); view.hurt = now() + 120;
          view.dying.lunge = { t0: now(), dur: Math.max(90, Math.min(160, monGap + 40)) };
          view.knock = { dx: -dx, dy: -dy, t0: now() };
          fxAt('claw', center(st.x, st.y), heroHits % 2, 260);
          heroHits++;
          floatText(st.x + (heroHits % 2 ? 0.14 : -0.14), st.y > 0 ? st.y - 0.3 : st.y + 0.25, '-' + e.hit, '#ff6a6a', 14);
          setHp(shown - e.hit);
        }
        if (e.refl) {   // 反彈：同一下彈回去，紫色數字
          monHp -= e.refl; view.dying.hp = Math.max(0, monHp); view.dying.flash = now() + 120;
          sfxT('reflect');
          floatText(cx, by > 0 ? by - 0.2 : by + 0.4, '↺' + e.refl, '#d9b8ff', 13);
        }
        await sleep(monGap);
      }
    }
    // 結算
    $('#hHp').textContent = hudVal('hp');
    if (c.damage > 0) floatText(st.x, st.y, '-' + c.damage, '#ff6a6a', 18);
    sfx('kill');
    toast(MT.t(ev.gold ? 'killed' : 'killed0', { name: MT.monName(ev.tile), g: ev.gold, e: ev.exp }));   // 打倒怪物也跳提示（Ken 指定）；接著開鐵門的話會被「鐵門打開了」蓋過
    view.dying = { code: ev.tile, x: bx, y: by, n, t0: now(), dur: boss ? 900 : 300, phase: 'die', done: true, hpMax: m.hp, hp: 0, shown: view.dying.shown };
    sparkle(cx, cy, boss ? 60 : 14, boss ? null : ['#ffffff', '#ffe066', '#c8c8d8', '#ffffff']);
    if (boss) { shake(600, 12); flash('#ffffff', 700); sfx('boom'); }
    if (ev.gold) flyGain('gold', ev.gold, cx, cy, 180);   // 放大、G 緊貼數字，飛進資訊列才加上去（Ken 指定）
    renderHud();
    await sleep(boss ? 800 : 160);
    // 打倒 Boss：背景音樂停下來，放一段勝利小曲，放完才接後面（3.2.24 Ken 指定）；最終 Boss 直接進結局，不放
    if (boss && ev.tile !== 'M2') { MT.Audio.play('none'); sfx('victory'); await sleep(2700); }
    busy--;
    if (ev.opened && ev.opened.length) {
      sfx('gate'); shake(500, 4);
      ev.opened.forEach(([x, y]) => sparkle(x, y, 20, ['#c8c8d8', '#ffffff', '#8a8f9e', '#ffe066']));
      toast(MT.t('gateOpen'));
    }
    if (ev.script) await runScript(ev.script);
    if (mode === 'game') { playMusic(musicFor()); autosave(); }
  }

  /* ───────── 點地圖移動 ─────────
     手機上沒有方向鍵，一律點地圖：點一下就畫出路線（虛線＋終點框），勇者沿著走過去，走過的那段跟著消失。
     終點是怪物或門也是點一下就出發（打不贏、打不動、沒鑰匙的會直接擋下來，不會白白損失）。
     長按怪物、道具、門…顯示說明（怪物是圖鑑那一列）；選單的「查看模式」裡點一下就顯示同一張說明。 */
  let route = null;     // { cells:[[x,y]…], kind } 畫在地圖上的路線；kind：walk／fight／door
  let inspect = null;   // 正在看說明的格子 { x, y }
  let looking = false;  // 查看模式：點地圖只看說明、不移動
  function clearRoute() { route = null; }

  // BFS：只穿過 pass(代碼) 為真的格子，終點可以是任何東西（碰到就觸發）。回傳不含起點、含終點的格子
  function bfs(tx, ty, pass) {   // pass(代碼, x, y)
    const m = st.maps[st.floor];
    const key = (x, y) => y * W + x;
    const prev = new Map([[key(st.x, st.y), null]]);
    const q = [[st.x, st.y]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy] of Object.values(DIR_V)) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(key(nx, ny))) continue;
        if ((nx !== tx || ny !== ty) && !pass(m[ny][nx], nx, ny)) continue;
        prev.set(key(nx, ny), [x, y]);
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const cells = [];
    for (let c = [tx, ty]; prev.get(key(c[0], c[1])); c = prev.get(key(c[0], c[1]))) cells.unshift(c);
    return cells;
  }
  // 優先只走空地；走不到才允許順路撿道具（撿道具只有好處，劇情道具撿到會停下來播劇情）
  // 夾擊、共鳴的格子和回音地板盡量繞開（真的只能走那裡才走）
  const safe = (x, y) => !MT.pincerAt(st, st.floor, x, y) && !MT.auraAt(st, st.floor, x, y);
  const findPath = (tx, ty) => bfs(tx, ty, (c, x, y) => c === '..' && safe(x, y)) || bfs(tx, ty, (c, x, y) => (c === '..' || MT.isItem(c)) && safe(x, y))
    || cheapest(tx, ty);
  /* 繞不開的時候：挑「付的生命最少、再來步數最少」的路（共鳴範圍裡少走一格就少扣一次；夾擊算成很貴的一格）。
     格子少，直接每輪挑最小的展開就好 */
  function cheapest(tx, ty) {
    const m = st.maps[st.floor], key = (x, y) => y * W + x, ec = MT.echoCost(st, st.floor);
    const walk = c => c === '..' || c === 'Ec' || MT.isItem(c);
    const cost = (x, y) => 1 + 1000 * ((m[y][x] === 'Ec' ? ec : 0) + MT.auraAt(st, st.floor, x, y) + (MT.pincerAt(st, st.floor, x, y) ? 5000 : 0));
    const dist = new Map([[key(st.x, st.y), 0]]), prev = new Map([[key(st.x, st.y), null]]), open = [[st.x, st.y]], done = new Set();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist.get(key(...open[i])) < dist.get(key(...open[bi]))) bi = i;
      const [x, y] = open.splice(bi, 1)[0], k0 = key(x, y);
      if (done.has(k0)) continue;
      done.add(k0);
      if (x === tx && y === ty) break;
      for (const [dx, dy] of Object.values(DIR_V)) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const end = nx === tx && ny === ty;
        if (!end && !walk(m[ny][nx])) continue;
        const d = dist.get(k0) + (walk(m[ny][nx]) ? cost(nx, ny) : 1), k = key(nx, ny);
        if (dist.has(k) && dist.get(k) <= d) continue;
        dist.set(k, d); prev.set(k, [x, y]); open.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const cells = [];
    for (let c = [tx, ty]; prev.get(key(c[0], c[1])); c = prev.get(key(c[0], c[1]))) cells.unshift(c);
    return cells;
  }
  /* 沿路線要付的生命（共鳴每一步、回音地板每一塊；夾擊是比例、不會致命，不算）。終點是怪、門、NPC 的話人不會站上去 */
  function routeToll(cells) {
    const m = st.maps[st.floor], ec = MT.echoCost(st, st.floor);
    let n = 0;
    cells.forEach(([x, y], i) => {
      const c = m[y][x];
      if (i === cells.length - 1 && !(c === '..' || c === 'Ec' || MT.isItem(c))) return;
      n += (c === 'Ec' ? ec : 0) + MT.auraAt(st, st.floor, x, y);
    });
    return n;
  }

  async function walkRoute(cells) {
    const id = {};
    autoPath = id;
    for (const [nx, ny] of cells) {
      if (autoPath !== id) return;
      while (busy) { await sleep(30); if (autoPath !== id) return; }
      if (Math.abs(nx - st.x) + Math.abs(ny - st.y) !== 1) break;   // 位置變了（換樓層、劇情移動）
      const cont = await stepOnce(nx > st.x ? 'right' : nx < st.x ? 'left' : ny > st.y ? 'down' : 'up');
      if (!cont) break;
      await sleep(105);
    }
    if (autoPath === id) { autoPath = null; route = null; }
  }

  function tapTile(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (x === st.x && y === st.y) { autoPath = null; clearRoute(); return; }
    const code = st.maps[st.floor][y][x];
    const cells = code === '##' || code === 'Gt' ? null : findPath(x, y);   // 牆和鐵門不能當終點
    const refuse = msg => { autoPath = null; clearRoute(); sfx('error'); cross(x, y); if (msg) toast(msg); };
    if (!cells) { refuse(); return; }
    let kind = 'walk';
    const m = MT.MONSTERS[code], toll = routeToll(cells);
    if (toll && toll >= st.hp) { refuse(MT.t('tooHurt', { n: toll })); return; }
    if (toll) kind = 'hazard';
    if (code === 'Cw' && !st.items.chisel) { refuse(MT.t('needChisel')); return; }
    if (m && !(m.onBump && !st.flags['bump:' + code])) {   // 有劇情的 Boss 第一次碰是播劇情，不算開打
      const c = MT.calc(st, code);
      if (c.damage == null) { refuse(MT.t('cantHurtMsg', { name: MT.monName(code) })); return; }
      if (c.damage + toll >= st.hp) { refuse(MT.t('cantWin', { name: MT.monName(code), d: c.damage + toll })); return; }
      kind = 'fight';
    } else if (MT.DOORS[code]) {
      if (st.keys[MT.DOORS[code]] <= 0) { refuse(MT.t('needKey_' + MT.DOORS[code])); keyHint(); return; }
      kind = 'door';
    }
    route = { cells, kind };
    walkRoute(cells);
  }

  // 光標顏色（r,g,b）：平常白色，走去開打時帶一點淡紅
  const CURSOR_RGB = { walk: '255,255,255', door: '255,255,255', fight: '255,176,176', hazard: '226,176,255' };   // hazard：路上要付共鳴或回音
  // 終點光標：圓角方框＋淡淡的內光，約 1.6 秒一次緩慢明暗呼吸（同一般 RPG 的目的地游標）
  function cursor(x, y, rgb, t, ctx = g) {
    const a = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 1600));
    const pad = 3, s = TILE - pad * 2, ox = x * TILE + pad, oy = y * TILE + pad;
    ctx.save();
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ox, oy, s, s, 7) : ctx.rect(ox, oy, s, s);
    ctx.fillStyle = `rgba(${rgb},${a * 0.16})`; ctx.fill();
    ctx.shadowColor = `rgba(${rgb},${a * 0.8})`; ctx.shadowBlur = 8;
    ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(${rgb},${a})`; ctx.stroke();
    ctx.restore();
  }
  // 路線：從勇者連到終點的一條淡白細線（畫在地板上、道具和怪物底下），停在終點格的邊上不壓到光標
  function drawRoute() {
    if (!route) return;
    const cells = route.cells, i = cells.findIndex(c => c[0] === st.x && c[1] === st.y);
    const rest = cells.slice(i + 1);
    if (!rest.length) return;
    const c0 = TILE / 2, pts = [[view.hx * TILE + c0, view.hy * TILE + c0]].concat(rest.map(([x, y]) => [x * TILE + c0, y * TILE + c0]));
    const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
    const d = Math.hypot(ex - px, ey - py) || 1, cut = Math.min(d, TILE * 0.42);
    pts[pts.length - 1] = [ex - (ex - px) / d * cut, ey - (ey - py) / d * cut];
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.stroke();
    g.restore();
  }
  // 終點光標、正在看說明的那格的光標（畫在怪物、道具上面）
  function drawMarks(t) {
    if (route) {
      const [tx, ty] = route.cells[route.cells.length - 1];
      if (tx !== st.x || ty !== st.y) cursor(tx, ty, CURSOR_RGB[route.kind], t);
    }
    if (inspect) cursor(inspect.x, inspect.y, CURSOR_RGB.walk, t);
  }
  // 點到走不到的地方：那格閃一下紅色 ✕
  const cross = (x, y) => view.fx.push({ kind: 'cross', x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, t0: now(), life: 550 });

  /* 說明卡：長按地圖上的東西、或查看模式裡點東西時浮出來，再點一下任何地方收起來。
     放在地圖外面（不擋地圖），見 placeCard */
  const monCard = $('#monCard');
  const KEY_OF = { y: 'Yk', b: 'Bk', r: 'Rk' }, DOOR_OF = { y: 'Yd', b: 'Bd', r: 'Rd' };
  // 一格東西的說明：怪物用圖鑑那一列，其他是圖＋名稱＋一行說明；空地、牆回傳空字串
  function infoRow(code) {
    if (MT.MONSTERS[code]) return monRow(code);
    if (code === 'Hw') return `<div class="mon"><div class="mi"><div class="mn">${esc(MT.t('name_wall'))}</div><div class="md">${esc(MT.t('info_hidden'))}</div></div></div>`;
    if (code === 'Cw') return `<div class="mon"><div class="mi"><div class="mn">${esc(MT.t('name_Cw'))}</div><div class="md">${esc(MT.t('info_cracked', { n: st.items.chisel }))}</div></div></div>`;
    if (code === 'Ec') return `<div class="mon">${echoImg()}<div class="mi"><div class="mn">${esc(MT.t('name_Ec'))}</div><div class="md">${esc(MT.t('info_Ec', { n: MT.echoCost(st, st.floor) }))}</div></div></div>`;
    const sp = spriteFor(code), it = MT.ITEMS[code], n = MT.NPCS[code];
    if (!sp) return '';
    let name = '', desc = '';
    if (MT.DOORS[code]) {
      const k = MT.DOORS[code];
      name = MT.t('name_' + code); desc = MT.t('info_door', { key: MT.t('name_' + KEY_OF[k]), n: st.keys[k] });
    } else if (code === 'Gt') { name = MT.t('name_Gt'); desc = MT.t('info_gate'); }
    else if (code === 'UU' || code === 'DD') { name = MT.t('name_' + code); desc = MT.t('info_stairs', { n: st.floor + (code === 'UU' ? 1 : -1) }); }
    else if (it) {
      const v = it.zone || it.value != null ? MT.itemValue(code, st.floor) : 0;   // 鑰匙、日記、音符沒有數值
      if (it.kind === 'key') { name = MT.t('name_' + code); desc = MT.t('info_key', { door: MT.t('name_' + DOOR_OF[it.key]) }); }
      else if (it.equip) { name = MT.itemName(code); desc = MT.t('info_equip', { stat: MT.t(it.kind), n: v }); }
      else if (it.kind === 'page') { name = MT.t('name_page'); desc = MT.t('info_page'); }
      else if (it.kind === 'note') { name = MT.itemName('note'); desc = MT.t('info_note'); }
      else if (it.kind === 'tool') { name = MT.itemName(it.tool); desc = MT.t('info_' + it.tool); }
      else { name = MT.t('name_' + code); desc = MT.t('info_' + it.kind, { n: v }); }
    } else if (n && (n.shop === 'keys' || n.shop === 'keys2')) { name = MT.t(n.shop === 'keys' ? 'frog' : 'frog2'); const K = MT.SHOPS[n.shop]; desc = K.y != null ? MT.t('info_frog', K) : MT.t('info_buyer', K.sell); }
    else if (n && n.level) { name = MT.t('level_' + n.level); desc = MT.t('info_level', { cost: MT.levelCost(st), hp: MT.LEVEL[n.level].hp, atk: MT.LEVEL[n.level].atk, def: MT.LEVEL[n.level].def }); }
    else if (n && n.sage) { name = MT.t('speaker_harpist'); desc = MT.t('info_sage_' + MT.sagePreview(st)); }
    else if (n && n.choose) { name = MT.t('speaker_harpghost'); desc = MT.t('info_choose'); }
    else if (n && n.deal) { name = MT.t('npc_' + code); desc = MT.t('info_deal', { p: MT.DEALS[n.deal].price }); }
    else if (n && n.shop) { const S = MT.SHOPS[n.shop]; name = MT.t(n.shop); desc = MT.t('info_shop', { price: MT.shopPrice(st, n.shop), hp: S.hp, atk: S.atk, def: S.def }); }
    else if (n && n.talk) { name = MT.t('npc_' + code); desc = MT.t(MT.npcTalked(st, code) ? 'info_talked' : 'info_talk'); }
    else return '';
    return `<div class="mon">${img(sp[0], sp[1], 'big')}<div class="mi"><div class="mn">${esc(name)}</div><div class="md">${esc(desc)}</div></div></div>`;
  }
  const echoImg = () => `<img class="px big" src="${MT.terrain('echo', 3, 32, 0).toDataURL()}" alt="">`;
  // 地圖上一格的說明（勇者自己那格不算）；長按和查看模式共用。共鳴範圍裡的格子多一列「走進來會失去多少」
  function infoAt(x, y) {
    if (x === st.x && y === st.y) return '';
    const code = st.maps[st.floor][y][x], a = code === '..' || code === 'Ec' || MT.isItem(code) ? MT.auraAt(st, st.floor, x, y) : 0;
    return infoRow(code) + (a ? `<div class="mon"><div class="mi"><div class="mn">${esc(MT.t('name_aura'))}</div><div class="md">${esc(MT.t('info_aura', { n: a }))}</div></div></div>` : '');
  }
  function showInfo(html, x, y) {
    inspect = { x, y };
    monCard.innerHTML = html;
    monCard.hidden = false;
    placeCard();
    sfx('select');
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* 不支援就算了 */ }
  }
  /* 說明卡的位置：依序找地圖外放得下的空白，不蓋地圖。
     直向一律放在地圖上方，卡片下緣貼齊地圖上緣（Ken 指定）：空白不夠高就往上蓋住狀態列；
     橫向：左欄功能鍵下面 → 蓋住左欄的功能鍵 */
  function placeCard() {
    const R = el => el.getBoundingClientRect();
    const s = R($('#stage')), m = R($('#mapWrap')), hud = R($('#hud')), bar = R($('#bar'));
    const wide = matchMedia('(min-aspect-ratio: 5/4)').matches;
    if (!wide) {
      monCard.style.left = (m.left - s.left) + 'px'; monCard.style.width = m.width + 'px';
      monCard.style.top = Math.max(4, m.top - s.top - 4 - monCard.offsetHeight) + 'px';
      return;
    }
    // 區域：[top, bottom, left, width, below]（座標相對 #stage；below＝在地圖下方，放不下時貼底、往上長）
    const area = (top, bottom, x, below) => [top - s.top, bottom - s.top, x.left - s.left, x.width, below];
    const areas = [area(bar.bottom + 10, m.bottom, bar, true), area(hud.bottom + 10, m.bottom, bar, true)];
    const [, , x0, w0] = areas[0];
    monCard.style.left = x0 + 'px'; monCard.style.width = w0 + 'px';
    const h = monCard.offsetHeight;
    const fit = areas.find(a => a[1] - a[0] >= h) || areas.reduce((p, a) => (a[1] - a[0] > p[1] - p[0] ? a : p));
    const [top, bottom, left, width, below] = fit;
    monCard.style.left = left + 'px'; monCard.style.width = width + 'px';
    // 放得下：緊貼功能鍵下面；放不下：貼底、往上長
    monCard.style.top = (bottom - top >= h ? top : below ? bottom - h : top) + 'px';
  }
  window.addEventListener('resize', () => { if (!monCard.hidden) placeCard(); });
  function hideMonCard() { if (monCard.hidden) return false; monCard.hidden = true; inspect = null; return true; }
  monCard.addEventListener('pointerdown', e => { e.preventDefault(); hideMonCard(); });
  // 卡片在地圖外面，點狀態列或空白處也要能收起來（地圖自己會處理；功能鍵開視窗時也會收）
  $('#stage').addEventListener('pointerdown', e => { if (e.target !== canvas && !$('#bar').contains(e.target)) hideMonCard(); });

  /* 查看模式（功能鍵列的「查看」，按一下開、再按一下關）：點地圖只看說明、不會走過去。
     開著時按鈕亮黃色、地圖框變淡黃色（不在地圖上蓋提示條）；Esc／返回鍵／方向鍵也會關掉 */
  function setLook(on) {
    looking = on;
    $('#bLook').classList.toggle('on', on); $('#bLook').setAttribute('aria-pressed', on);
    $('#mapWrap').classList.toggle('looking', on);
    if (on) { autoPath = null; clearRoute(); }
    hideMonCard();
  }
  function lookAt(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const same = inspect && inspect.x === x && inspect.y === y;
    const html = infoAt(x, y);
    if (same || !html) { hideMonCard(); return; }
    showInfo(html, x, y);
  }

  const tileAt = e => {
    const r = canvas.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)];
  };
  let press = null;   // 按下中的手指：放開時才算「點」，在有說明的格子上按住超過 LONG_MS 就是「長按」
  const LONG_MS = 420;
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'game') return;
    e.preventDefault();
    if (press) return;   // 第二根手指不理
    if (advanceDialog() || busy) return;
    const [x, y] = tileAt(e);
    if (looking) { lookAt(x, y); return; }
    if (hideMonCard()) return;
    press = { id: e.pointerId, cx: e.clientX, cy: e.clientY, long: false, timer: 0 };
    const html = x >= 0 && y >= 0 && x < W && y < H ? infoAt(x, y) : '';
    if (html) press.timer = setTimeout(() => { if (press) { press.long = true; showInfo(html, x, y); } }, LONG_MS);
  });
  canvas.addEventListener('pointermove', e => {
    // 手指滑開就不算長按（放開時仍照放開的位置算一次點擊）
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.cx, e.clientY - press.cy) > 14) clearTimeout(press.timer);
  });
  canvas.addEventListener('pointerup', e => {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.timer);
    const long = press.long;
    press = null;
    if (long || mode !== 'game' || busy) return;
    tapTile(...tileAt(e));
  });
  canvas.addEventListener('pointercancel', () => { if (press) clearTimeout(press.timer); press = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());   // 長按不要跳出系統選單

  /* 鍵盤：按住連續走（電腦用） */
  let holdDir = null, holdTimer = null;
  function startHold(d) {
    if (looking) setLook(false);
    autoPath = null; clearRoute(); hideMonCard();
    if (holdDir === d) return;
    holdDir = d;
    clearTimeout(holdTimer);
    const tick = async () => {
      if (holdDir !== d) return;
      if (!busy && mode === 'game') await stepOnce(d);
      if (holdDir === d) holdTimer = setTimeout(tick, busy ? 40 : 125);
    };
    tick();
  }
  function stopHold(d) { if (!d || holdDir === d) { holdDir = null; clearTimeout(holdTimer); } }
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', A: 'left', D: 'right' };
  document.addEventListener('keydown', e => {
    MT.Audio.init();
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter' || e.key === ' ') { if (advanceDialog()) { e.preventDefault(); return; } if (mode === 'cine') { e.preventDefault(); cineNext(); return; } }
    if (!$('#modal').hidden) {
      if (e.key === 'Escape') closeModal();
      else if (tutGo && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); tutGo(e.key === 'ArrowLeft' ? -1 : 1); }   // 教學翻頁
      return;
    }
    if (dialogResolve) { if (KEYMAP[e.key]) e.preventDefault(); return; }
    if (mode !== 'game') return;
    const d = KEYMAP[e.key];
    if (d && e.key !== 'S') { e.preventDefault(); if (!e.repeat) startHold(d); return; }
    if (e.key === 'b' || e.key === 'B') openBook();
    else if (e.key === 'f' || e.key === 'F') openFly();
    else if (e.key === 'S') openSaves();
    else if (e.key === 'Escape') { if (looking) setLook(false); else openMenu(); }
  });
  document.addEventListener('keyup', e => { const d = KEYMAP[e.key]; if (d) stopHold(d); });
  window.addEventListener('blur', () => stopHold());

  $('#bLook').addEventListener('click', () => { if (mode === 'game' && !busy) { setLook(!looking); sfx('select'); } });
  $('#bBook').addEventListener('click', () => openBook());
  $('#bFly').addEventListener('click', () => openFly());
  $('#bSave').addEventListener('click', () => openSaves());
  $('#bMenu').addEventListener('click', () => openMenu());

  /* ───────── 選單 ───────── */
  let modalOnClose = null;
  function openModal(title, html, onBind, onClose) {
    busy++;
    stopHold(); autoPath = null; clearRoute(); hideMonCard();
    const m = $('#modal');
    m.hidden = false;
    $('#mTitle').textContent = title;
    $('#mBody').innerHTML = html;
    modalOnClose = onClose || null;
    if (onBind) onBind($('#mBody'));
    sfx('select');
  }
  function closeModal() {
    const m = $('#modal');
    if (m.hidden) return;
    m.hidden = true; $('#mBody').innerHTML = '';
    busy = Math.max(0, busy - 1);
    const f = modalOnClose; modalOnClose = null;
    if (f) f();
  }
  $('#mClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });

  function ask(body, buttons) {
    return new Promise(res => {
      const box = $('#confirm');
      box.hidden = false;
      $('#cBody').textContent = body;
      const bs = $('#cButtons');
      bs.innerHTML = buttons.map((b, i) => `<button class="btn ${i === buttons.length - 1 ? 'primary' : ''}" data-k="${b.key}">${esc(b.label)}</button>`).join('');
      bs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { box.hidden = true; sfx('select'); res(b.dataset.k); }));
    });
  }

  // 一隻怪物的能力與這場的代價（圖鑑和說明卡共用）
  function monRow(code) {
    const m = MT.MONSTERS[code], c = MT.calc(st, code);
    // 還沒拿到怪物圖鑑：只看得到名字
    if (!st.items.book) return `<div class="mon">${img(m.sprite, m.pal, 'big')}<div class="mi"><div class="mn">${esc(MT.monName(code))}</div><div class="md">${esc(MT.t('needBook'))}</div></div></div>`;
    const sp = (m.sp || []).map(s => `<span class="tag">${esc(MT.t('sp_' + s, { p: Math.round((m.drain || 0) * 100), n: m.aura || 0 }))}</span>`).join('');
    const dmg = c.damage == null ? `<b class="bad">${esc(MT.t('cantHurt'))}</b>` : c.damage >= st.hp ? `<b class="bad">${c.damage}（${esc(MT.t('willLose'))}）</b>` : `<b style="color:${dmgColor(c)}">${c.damage}</b>`;
    const inv = (m.sp || []).includes('invincible');
    return `<div class="mon">${img(m.sprite, m.pal, 'big')}<div class="mi"><div class="mn">${esc(MT.monName(code))} ${sp}</div>
      <div class="ms">${esc(MT.t('hp'))} ${inv ? '???' : m.hp}　${esc(MT.t('atk'))} ${inv ? '???' : m.atk}　${esc(MT.t('def'))} ${inv ? '???' : m.def}　${esc(MT.t('gold'))} ${m.gold}</div>
      <div class="md">${esc(MT.t('dmg'))}：${dmg}${m.exp ? `　<span class="muted">EXP ${m.exp}</span>` : ''}</div></div></div>`;
  }
  /* 圖鑑：兩個分頁——怪物（這層的怪物）｜收藏品（Ken 指定：特殊物品拿到才知道是什麼，不寫在教學裡） */
  let bookTab = 'mon';
  function openBook(tab) {
    if (!st || mode !== 'game' || busy) return;
    if (!st.items.book) return;
    bookTab = tab || bookTab;
    // 面板固定大小、分頁鈕釘在上面、清單在下面捲：切分頁時按鈕不會跑位置（Ken 指定），切換也不重開面板
    const render = body => {
      const n = MT.COLLECT.filter(k => st.found && st.found[k] != null).length;
      $('#mTitle').textContent = bookTab === 'mon' ? MT.t('bookTitle') + ' · ' + MT.t('floorN', { n: st.floor }) : MT.t('btnBook');
      let html;
      if (bookTab === 'mon') {
        const seen = [];
        for (const row of st.maps[st.floor]) for (const c of row) if (MT.MONSTERS[c] && !seen.includes(c)) seen.push(c);
        html = seen.length ? seen.map(monRow).join('') : `<p class="muted">${esc(MT.t('noMonsters'))}</p>`;
      } else html = MT.COLLECT.map(colRow).join('');
      body.innerHTML = `<div class="bookTabs"><button class="btn ${bookTab === 'mon' ? 'primary' : ''}" data-tab="mon">${esc(MT.t('tabMon'))}</button>`
        + `<button class="btn ${bookTab === 'col' ? 'primary' : ''}" data-tab="col">${esc(MT.t('tabCol'))} ${n}／${MT.COLLECT.length}</button></div>`
        + `<div class="bookList">${html}</div>`;
      body.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab === bookTab) return; bookTab = b.dataset.tab; sfx('select'); render(body); }));
      body.querySelectorAll('[data-read]').forEach(b => b.addEventListener('click', async () => { closeModal(); await runScript(MT.PAGE_SCRIPTS[b.dataset.read]); }));
    };
    openModal('', '', body => { body.parentElement.classList.add('book'); render(body); }, () => $('#modal .panel').classList.remove('book'));
  }
  // 第一次拿到收藏品：頭上飄一行「收進收藏品圖鑑」（不用 toast，免得蓋掉撿到東西的提示）
  function colNotice() { floatText(st.x, st.y - 0.8, MT.t('colNew'), '#ffe9a8', 13); }
  // 收藏品一列：拿到前是剪影＋？？？，拿到後是圖、名字、用途、在哪層拿到；日記可以重讀
  function colIcon(k) {
    if (k[0] === 'P') return ['page'];
    if (MT.ITEMS[k]) return [MT.ITEMS[k].sprite, MT.ITEMS[k].pal];
    return [{ book: 'book', fly: 'feather', chisel: 'chisel', drum: 'drum', harp: 'harp', flute: 'flute', note: 'goldnote' }[k]];
  }
  function colRow(k) {
    const [sp, pal] = colIcon(k), f = st.found && st.found[k];
    if (f == null) return `<div class="mon colRow"><span class="colSil">${img(sp, pal, 'big')}</span><div class="mi"><div class="mn">${esc(MT.t('colUnknown'))}</div><div class="md muted">${esc(MT.t('colNotYet'))}</div></div></div>`;
    const it = MT.ITEMS[k];
    const name = k[0] === 'P' ? MT.story('page' + k[1] + '_title') : MT.itemName(k);
    const desc = it && it.equip ? MT.t('col_equip', { stat: MT.t(it.kind), n: it.value }) : MT.t('col_' + (k[0] === 'P' ? 'page' : k));
    const where = f >= 0 ? MT.t('colWhere', { f: MT.floorName(f) }) : '';
    const read = k[0] === 'P' ? `<button class="btn colRead" data-read="${k[1]}">${esc(MT.t('colReread'))}</button>` : '';
    return `<div class="mon colRow">${img(sp, pal, 'big')}<div class="mi"><div class="mn">${esc(name)}</div><div class="md">${esc(desc)}</div>`
      + `${where ? `<div class="md muted">${esc(where)}</div>` : ''}${read}</div></div>`;
  }

  function openFly() {
    if (!st || mode !== 'game' || busy) return;
    if (!st.items.fly) { toast(MT.t('flyNeed')); return; }
    if (!MT.canFly(st)) { sfx('error'); toast(MT.t('flyBlocked')); return; }
    let html = '<div class="floors">';
    for (let f = MT.BOTTOM; f <= MT.TOP; f++) {
      const ok = st.visited.includes(f);
      if (f === 0 && !ok) continue;   // 隱藏層沒去過就不列出來
      html += `<button class="fl ${f === st.floor ? 'cur' : ''}" data-f="${f}" ${ok ? '' : 'disabled'} title="${ok ? '' : esc(MT.t('notVisited'))}">${MT.floorName(f)}</button>`;
    }
    html += '</div>';
    openModal(MT.t('flyTitle'), html, body => body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', async () => {
      const f = Number(b.dataset.f);
      closeModal();
      if (f === st.floor) return;
      if (MT.flyTo(st, f)) { sfx('fly'); await changeFloor(true); autosave(); }
    })));
  }

  function timeAgo(at) {
    const s = (Date.now() - at) / 1000;
    if (s < 60) return MT.t('justNow');
    if (s < 3600) return MT.t('minsAgo', { n: Math.floor(s / 60) });
    if (s < 86400) return MT.t('hoursAgo', { n: Math.floor(s / 3600) });
    return MT.t('daysAgo', { n: Math.floor(s / 86400) });
  }
  // 1.x 的存檔（v1）是 11×11 的舊地圖，2.0 讀不了
  const loadable = sl => !!sl && MT.canLoad(sl.data);
  const latestAuto = () => MT.Sync.autos().find(loadable) || null;
  function slotLine(sl) {
    if (!sl) return `<span class="muted">${esc(MT.t('empty'))}</span>`;
    if (!loadable(sl)) return `<span class="muted">${esc(MT.t('oldSave'))} · ${esc(sl.device || '')} · ${esc(timeAgo(sl.at))}</span>`;
    const dev = (sl.device || '') + (MT.Sync.isMine(sl) ? `（${MT.t('thisDevice')}）` : '');
    return `${MT.floorName(sl.floor)} · ${esc(MT.t('hp'))} ${sl.hp} · ${esc(dev)} · ${esc(timeAgo(sl.at))}`;
  }
  /* 存檔／讀檔：上面是每台裝置各一格的自動存檔，下面是所有裝置共用、最多 99 格的手動存檔（新的在前）。
     別台裝置存的格子只能讀，不能覆蓋（跟K書吧一樣，每台裝置只寫自己的格子） */
  function openSaves(fromTitle) {
    if (!fromTitle && (!st || mode !== 'game' || busy)) return;
    const S = MT.Sync, canSave = !fromTitle;
    const row = (sl, name) => `<div class="slot"><div class="sn">${esc(name)}</div><div class="sd">${slotLine(sl)}</div><div class="sb">
        ${canSave && sl.kind !== 'auto' && S.isMine(sl) ? `<button class="btn" data-save="${esc(sl.id)}">${esc(MT.t('saveHere'))}</button>` : ''}
        ${loadable(sl) ? `<button class="btn primary" data-load="${esc(sl.id)}">${esc(MT.t('loadThis'))}</button>` : ''}</div></div>`;
    const autos = S.autos(), manuals = S.manuals();
    const html = `<label class="lab">${esc(MT.t('slotAuto'))}</label>`
      + (autos.length ? autos.map(sl => row(sl, sl.device || MT.t('slotAuto'))).join('') : `<p class="muted">${esc(MT.t('empty'))}</p>`)
      + `<label class="lab">${esc(MT.t('slotManual'))}（${manuals.length}／${S.MANUAL_MAX}）</label>`
      + (canSave ? `<div class="row"><button class="btn" data-new="1">${esc(MT.t('saveNew'))}</button></div>` : '')
      + (manuals.length ? manuals.map((sl, i) => row(sl, MT.t('slotN', { n: manuals.length - i }))).join('') : `<p class="muted">${esc(MT.t('empty'))}</p>`)
      + `<button class="btn" id="saveCloud" type="button" data-s="${MT.Sync.status}"><i>●</i> ${esc(MT.t('cloud'))}：${esc(cloudText())}</button>`;
    const yesNo = [{ key: 'n', label: MT.t('no') }, { key: 'y', label: MT.t('yes') }];
    openModal(MT.t('saveTitle'), html, body => {
      body.querySelector('#saveCloud').addEventListener('click', () => { closeModal(); openCloud(); });
      const nb = body.querySelector('[data-new]');
      if (nb) nb.addEventListener('click', async () => {
        if (S.manualFull() && await ask(MT.t('manualFull', { n: S.MANUAL_MAX }), yesNo) !== 'y') return;
        S.saveManual(MT.pack(st)); sfx('save'); toast(MT.t('saved'));
        closeModal(); openSaves();
      });
      body.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
        if (await ask(MT.t('overwrite'), yesNo) !== 'y') return;
        S.saveManual(MT.pack(st), b.dataset.save); sfx('save'); toast(MT.t('saved'));
        closeModal(); openSaves();
      }));
      body.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', async () => {
        const sl = S.byId(b.dataset.load);
        if (!loadable(sl)) return;
        if (!fromTitle && await ask(MT.t('loadConfirm'), yesNo) !== 'y') return;
        closeModal();
        startGame(MT.unpack(sl.data));
        toast(MT.t('loaded'));
      }));
    });
  }

  function openShop(id) {
    if (id === 'keys' || id === 'keys2') {
      const K = MT.SHOPS[id], two = id === 'keys2';
      const opts = [['y', 'buyY'], ['b', 'buyB'], ['r', 'buyR']].filter(([k]) => K[k] != null).map(([k, lab]) =>
        `<button class="btn opt" data-k="${k}" ${st.gold < K[k] ? 'disabled' : ''}>${img(...spriteFor(KEY_OF[k]))} ${esc(MT.t(lab, { p: K[k] }))}</button>`).join('');
      // 表哥另外收購（K.sell）：身上沒有那種鑰匙就反灰
      const sells = K.sell ? `<p class="muted small">${esc(MT.t('sellHead'))}</p><div class="opts">` + Object.keys(K.sell).map(k =>
        `<button class="btn opt" data-s="${k}" ${st.keys[k] > 0 ? '' : 'disabled'}>${img(...spriteFor(KEY_OF[k]))} ${esc(MT.t('sell' + k.toUpperCase(), { p: K.sell[k], n: st.keys[k] }))}</button>`).join('') + '</div>' : '';
      openModal(MT.t(two ? 'frog2' : 'frog'), `<div class="shopTop">${img(two ? 'frogCousin' : 'frog', null, 'big')}<p>${esc(MT.t(two ? 'frog2Text' : 'frogText'))}</p></div><div class="opts">${opts}</div>${sells}
        <p class="muted small">${esc(MT.t('gold'))}：${st.gold}</p><button class="btn" data-x>${esc(MT.t('leave'))}</button>`, body => {
        body.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
          const before = snapStats();
          if (MT.sellKey(st, id, b.dataset.s)) { sfx('buy'); flyGains(before, st.x, st.y); renderHud(); closeModal(); openShop(id); autosave(); } else sfx('error');
        }));
        body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
          const before = snapStats();
          if (MT.buy(st, id, b.dataset.k)) { sfx('buy'); flyGains(before, st.x, st.y); renderHud(); closeModal(); openShop(id); autosave(); } else { sfx('error'); toast(MT.t('noGold')); }
        }));
        body.querySelector('[data-x]').addEventListener('click', closeModal);
      });
      return;
    }
    const S = MT.SHOPS[id], price = MT.shopPrice(st, id), poor = st.gold < price;
    const opts = [['hp', 'buyHp', S.hp, 'heartS', null], ['atk', 'buyAtk', S.atk, 'gemSword', 'gemRed'], ['def', 'buyDef', S.def, 'gemShield', 'gemBlue']].map(([k, lab, n, sp, pal]) =>
      `<button class="btn opt" data-k="${k}" ${poor ? 'disabled' : ''}>${img(sp, pal)} ${esc(MT.t(lab, { n }))}</button>`).join('');
    openModal(MT.t(id), `<div class="shopTop">${img('altar', MT.NPCS[{ shop1: 'Sh', shop2: 'S2', shop3: 'S3' }[id]].pal, 'big')}<p>${esc(MT.t('shopText', { price }))}</p></div>
      <div class="opts">${opts}</div><p class="muted small">${esc(MT.t('gold'))}：${st.gold}</p><button class="btn" data-x>${esc(MT.t('leave'))}</button>`, body => {
      body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
        const before = snapStats();
        if (MT.buy(st, id, b.dataset.k)) { sfx('buy'); notes(st.x, st.y, 4); flyGains(before, st.x, st.y); renderHud(); closeModal(); openShop(id); autosave(); } else { sfx('error'); toast(MT.t('noGold')); }
      }));
      body.querySelector('[data-x]').addEventListener('click', closeModal);
    });
  }

  function openMenu() {
    if (!st || mode !== 'game' || busy) return;
    openModal(MT.t('btnMenu'), `<div class="menu">
      <button class="btn" data-a="saves">${esc(MT.t('saveTitle'))}</button>
      <button class="btn" data-a="tutorial">${esc(MT.t('tutorial'))}</button>
      <button class="btn" data-a="settings">${esc(MT.t('settings'))}</button>
      <button class="btn" data-a="title">${esc(MT.t('backTitle'))}</button></div>
      <p class="muted small ver">${esc(versionText())}</p>`, body => {   // 版號放選單和標題畫面（3.2.32 Ken 指定，原本在設定）
      body.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a; closeModal();
        if (a === 'saves') openSaves();
        else if (a === 'tutorial') openTutorial();
        else if (a === 'settings') openSettings();
        else if (a === 'title') { autosave(); showTitle(); }
      }));
    });
  }

  /* 版號：網頁版與 App 外殼分開列。App 是開線上網頁的 WebView，外殼版號從它加在 User-Agent 的 MagicTowerApp/x.y.z 讀 */
  function versionText() {
    const app = (navigator.userAgent.match(/MagicTowerApp\/([\w.]+)/) || [])[1];
    return MT.t('verWeb') + ' v' + MT.VERSION + (app ? '　' + MT.t('verApp') + ' v' + app : '');
  }
  function openSettings() {
    const langs = MT.LANGS.map(l => `<button class="btn ${l === MT.getLang() ? 'primary' : ''}" data-l="${l}">${esc(MT.TEXT[l].langName)}</button>`).join('');
    openModal(MT.t('settings'), `
      <label class="lab">${esc(MT.t('language'))}</label><div class="row">${langs}</div>
      <label class="lab" for="vMusic">${esc(MT.t('musicVol'))}</label><input type="range" id="vMusic" min="0" max="1" step="0.05" value="${settings.music}">
      <label class="lab" for="vSfx">${esc(MT.t('sfxVol'))}</label><input type="range" id="vSfx" min="0" max="1" step="0.05" value="${settings.sfx}">
      <p class="muted small">${esc(MT.t('controls'))}</p>`, body => {
      body.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
        MT.setLang(b.dataset.l); MT.LS.set('lang', b.dataset.l);
        closeModal(); renderStaticText(); openSettings();
      }));
      body.querySelector('#vMusic').addEventListener('input', e => { settings.music = Number(e.target.value); MT.Audio.setVolume('music', settings.music); MT.LS.set('settings', settings); });
      body.querySelector('#vSfx').addEventListener('input', e => { settings.sfx = Number(e.target.value); MT.Audio.setVolume('sfx', settings.sfx); MT.LS.set('settings', settings); });
      body.querySelector('#vSfx').addEventListener('change', () => sfx('gem'));
    });
  }

  /* ───────── 教學（選單裡的「教學」，Ken 指定）─────────
     一頁一張示意圖＋說明。示意圖用地圖同一套地板、牆、像素圖、路線、終點框畫在小畫布上，
     怪物腳下的數字照 MT.calc 實算（假設一個剛開局的勇者 TUT_ST），規則或數值改了圖和例子會跟著對 */
  const TUT_ST = { hp: 200, atk: 10, def: 10, skill: null };
  /* rows：每列一串空白分隔的格子代碼（同 data.js 的地圖：.. 地板、## 牆、Cw 裂牆、@@ 勇者，其他照 spriteFor）
     opt：zone 區域、dir 勇者面向、route 路線格子（第一格是勇者）、goal 終點框、cross 紅 ✕、dmg 怪物腳下標損失、
          labels [[x, y, 文字, 顏色]] 格子下緣的字 */
  function tutScene(rows, opt = {}) {
    const cells = rows.map(r => r.trim().split(/\s+/));
    const h = cells.length, w = cells[0].length;
    const c = document.createElement('canvas');
    c.width = w * TILE; c.height = h * TILE;
    const tg = c.getContext('2d');
    tg.imageSmoothingEnabled = false;
    const mid = v => v * TILE + TILE / 2;
    cells.forEach((row, y) => row.forEach((code, x) => {
      const kind = code === '##' ? 'wall' : code === 'Cw' ? 'cracked' : code === 'Ec' ? 'echo' : 'floor';
      tg.drawImage(MT.terrain(kind, opt.zone || 1, TILE, (x * 7 + y * 13) % 10), x * TILE, y * TILE);
    }));
    if (opt.route) {   // 同 drawRoute：淡白粗線，停在終點格的邊上
      const pts = opt.route.map(([x, y]) => [mid(x), mid(y)]);
      const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
      const d = Math.hypot(ex - px, ey - py) || 1, cut = Math.min(d, TILE * 0.42);
      pts[pts.length - 1] = [ex - (ex - px) / d * cut, ey - (ey - py) / d * cut];
      tg.save(); tg.lineCap = 'round'; tg.lineJoin = 'round'; tg.lineWidth = 5; tg.strokeStyle = 'rgba(255,255,255,0.3)';
      tg.beginPath(); pts.forEach(([x, y], i) => (i ? tg.lineTo(x, y) : tg.moveTo(x, y))); tg.stroke(); tg.restore();
    }
    cells.forEach((row, y) => row.forEach((code, x) => {
      const sp = code === '@@' ? [MT.heroSprite(opt.dir || 'down', '', 0, '', '')] : spriteFor(code);
      if (!sp) return;
      tg.drawImage(MT.sprite(sp[0], sp[1], SC), x * TILE, y * TILE);
      if (opt.dmg && MT.MONSTERS[code]) {
        const k = MT.calc(TUT_ST, code);
        label(k.damage == null ? '???' : fmt(k.damage), mid(x), (y + 1) * TILE - 1, dmgColor(k, TUT_ST.hp), 15, tg);
      }
    }));
    for (const [x, y, text, color] of opt.labels || []) label(text, mid(x), (y + 1) * TILE - 1, color, 15, tg);
    if (opt.goal) cursor(opt.goal[0], opt.goal[1], CURSOR_RGB.walk, 400, tg);
    if (opt.cross) {   // 同點到走不到的地方閃的紅 ✕
      const [cx, cy] = [mid(opt.cross[0]), mid(opt.cross[1])], r = 13;
      tg.save(); tg.lineCap = 'round';
      for (const [lw, col] of [[9, 'rgba(0,0,0,0.6)'], [5, '#ff4a4a']]) {
        tg.lineWidth = lw; tg.strokeStyle = col; tg.beginPath();
        tg.moveTo(cx - r, cy - r); tg.lineTo(cx + r, cy + r); tg.moveTo(cx + r, cy - r); tg.lineTo(cx - r, cy + r); tg.stroke();
      }
      tg.restore();
    }
    return `<img class="px tutPic" src="${c.toDataURL()}" alt="">`;
  }
  // 圖示＋說明一列（怪物特技、小技巧那兩頁）
  const tutRow = (pic, head, text) => `<div class="tutRow">${pic}<div><b>${esc(head)}</b>${head && text ? '<br>' : ''}<span class="small">${tutFmt(text)}</span></div></div>`;
  const ZV = k => MT.ZONE_VALUES[MT.ITEMS[k].zone][0];
  // 第 1 頁的資訊列示意（3.2.20 Ken 指定：講「畫面上方」要直接畫出來）：跟真的資訊列同一套樣式，數字用開局的值
  // focus：只亮這幾格、其他變暗（第 6 頁只亮金幣和等級經驗，3.2.23）
  const tutHud = focus => {
    const S0 = MT.START, ic = (n, p) => `<img class="px" src="${icon(n, p)}" alt="">`, key = c => ic(MT.ITEMS[c].sprite, MT.ITEMS[c].pal);
    const f = k => (!focus ? '' : focus.includes(k) ? ' tutOn' : ' tutDim');
    const stat = (cls, img, label, v) => `<div class="hs ${cls}${f(cls)}"><span class="hl">${img}<span>${esc(MT.t(label))}</span></span><b>${v}</b></div>`;
    return `<div class="tutHud"><div class="hf${f('floor')}"><b>1F</b></div>`
      + stat('hp', ic('heart'), 'hp', S0.hp) + stat('atk', ic('gemSword', 'gemRed'), 'atk', S0.atk)
      + stat('def', ic('gemShield', 'gemBlue'), 'def', S0.def)
      + `<div class="hk"><span class="${f('keys')}">${key('Yk')}<b>${S0.keys.y}</b></span><span class="${f('keys')}">${key('Bk')}<b>${S0.keys.b}</b></span><span class="${f('keys')}">${key('Rk')}<b>${S0.keys.r}</b></span>`
      + `<span class="hres"><span class="hlv${f('lv')}"><b>Lv1</b><small>EXP 0</small></span>`
      + `<span class="hgold${f('gold')}">${ic('coin')}<b>${S0.gold}</b><small>${esc(MT.t('gold'))}</small></span></span></div><span class="tutQ">?</span></div>`;  // Lv／EXP 在前、金幣在後（3.2.36）
  };
  // 每頁：pic 標題下的示意圖、after 說明文字後面的補充（例子、一列一列的圖示說明）；文字是 i18n 的 tut_<頁>t（標題）、tut_<頁>
  const TUT_PAGES = [
    { pic: () => tutScene(['## ## UU ## ##', '## .. .. .. ##', '## .. .. .. ##', '## N8 @@ .. ##'], { dir: 'up', route: [[2, 3], [2, 2], [2, 1], [2, 0]], goal: [2, 0] }),
      after: () => tutHud() },
    { pic: () => tutScene(['.. .. ## .. .. Yk', '.. .. ## .. ## ..', '@@ .. .. .. ## ..'],
      { dir: 'side', route: [[0, 2], [1, 2], [2, 2], [3, 2], [3, 1], [3, 0], [4, 0], [5, 0]], goal: [5, 0], cross: [4, 2] }) },
    { pic: () => tutScene(['@@ gs rs bt sk ab'], { dir: 'side', dmg: true }),
      after: () => (st && st.items.book ? tutRow(img('book', null, 'big'), MT.itemName('book'), MT.t('tut_3b')) : '') },   // 圖鑑那列拿到才顯示（Ken 指定）
    { pic: () => tutScene(['Yk Bk Rk ## Gt ##', 'Yd Bd Rd .. sk ..']) },
    { pic: () => tutScene(['at df hp HP s1 a1'], { labels: [[0, 0, '+' + ZV('at'), '#ffae6a'], [1, 0, '+' + ZV('df'), '#7ac8ff'], [2, 0, '+' + ZV('hp'), '#ff7a7a'],
      [3, 0, '+' + ZV('HP'), '#ff7a7a'], [4, 0, '+' + MT.ITEMS.s1.value, '#ffae6a'], [5, 0, '+' + MT.ITEMS.a1.value, '#7ac8ff']] }) },
    { after: () => tutHud(['gold', 'lv']) + [['Sh', 'tut_altar', 'a'], ['Mk', 'frog', 'b'], ['L1', 'level_L1', 'c']]
      .map(([code, head, k]) => tutRow(img(...spriteFor(code), 'big'), MT.t(head), MT.t('tut_6' + k))).join('') },
    // 怪物特技、回音地板：遇到過（走到附近、多蕾講過，旗標 tut:sp:*／tut:echo）才解鎖說明，沒遇到的是剪影＋？？？（3.2.30 Ken 指定，不劇透後面的怪）；
    // 通關過的老玩家全部看得到；Boss 那列一律顯示
    { after: () => {
      const known = k => veteran() || !!(st && st.flags['tut:' + k]);
      const locked = pic => `<div class="tutRow"><span class="colSil">${pic}</span><div><b>${esc(MT.t('colUnknown'))}</b><br><span class="small">${esc(MT.t('tut_locked'))}</span></div></div>`;
      return [['bb', 'first'], ['dw', 'double'], ['mg', 'magic'], ['mi', 'pierce'], ['vb', 'drain'], ['pg', 'pincer'], ['rc', 'aura'], ['K1', 'boss']].map(([code, s]) => {
        const m = MT.MONSTERS[code];
        if (s !== 'boss' && !known('sp:' + s)) return locked(img(m.sprite, m.pal, 'big'));
        const tag = MT.t('sp_' + s, { p: Math.round((m.drain || 0) * 100), n: m.aura || 0 }).replace(/\s*[（(].*$/, '');   // 括號裡的說明下面另外寫
        return tutRow(img(m.sprite, m.pal, 'big'), tag, MT.t('tut_sp_' + s, { n: m.aura || 0 }));
      }).join('') + (known('echo') ? tutRow(echoImg(), MT.t('name_Ec'), MT.t('tut_echo')) : locked(echoImg()));
    } },
    { after: () => [['lens', 'look'], ['porter', 'npc'], ['harp', 'skill'], ['goldnote', 'rate'], ['page', 'save']]   // 特殊道具的用法拿到才看得到（圖鑑的收藏品分頁），不寫在這裡；存檔放最後（Ken 指定）
      .map(([sp, k]) => tutRow(img(sp, null, 'big'), '', MT.t('tut_t_' + k))).join('') },
  ];
  // 教學內文：??? 畫成紅色（跟地圖上打不動的標示一樣），**…** 畫成重點色
  const tutFmt = s => esc(s).replace(/\?\?\?/g, '<span class="tutRed">???</span>').replace(/\*\*(.+?)\*\*/g, '<b class="tutHi">$1</b>');
  let tutGo = null;   // 教學開著時的翻頁（鍵盤左右鍵用）
  // 選單、標題畫面、資訊列的「？」都開得了（教學的圖和例子不看目前這局）；startPage＝直接翻到第幾頁；
  // single＝遇到機制時彈出的那一頁：只看這頁，底下只有「關閉」（Ken 指定）
  function openTutorial(fromTitle, startPage, single) {
    if (!fromTitle && (!st || mode !== 'game' || busy)) return;
    let page = startPage || 0;
    const n = TUT_PAGES.length;
    openModal(MT.t('tutorial'), '', body => {
      const show = () => {
        const i = page + 1;
        $('#mTitle').textContent = single ? MT.t('tutorial') : `${MT.t('tutorial')}　${i}／${n}`;
        const dots = TUT_PAGES.map((_, j) => `<button class="tutDot ${j === page ? 'on' : ''}" data-p="${j}" aria-label="${j + 1}"></button>`).join('');
        const P = TUT_PAGES[page];
        // 內容放在 tutPage 裡（太長就自己捲），翻頁列固定在面板底部：每頁一樣大，「下一頁」不會跑位置（Ken 指定）
        body.innerHTML = `<div class="tutPage"><h3 class="tutH">${esc(MT.t('tut_' + i + 't'))}</h3>${P.pic ? `<div class="tutPicBox">${P.pic()}</div>` : ''}`
          + `<p class="tutText">${tutFmt(MT.t('tut_' + i, { at: MT.t('name_at'), df: MT.t('name_df'), hp: MT.t('name_hp'), HP: MT.t('name_HP') }))}</p>${P.after ? P.after() : ''}</div>`
          + (single ? `<div class="tutNav"><span></span><button class="btn primary" data-close>${esc(MT.t('tut_close'))}</button></div>`
            : `<div class="tutNav"><button class="btn" data-d="-1" ${page ? '' : 'disabled'}>${esc(MT.t('tut_prev'))}</button><span class="tutDots">${dots}</span>`
            + `<button class="btn primary" data-d="1">${esc(MT.t(page === n - 1 ? 'tut_done' : 'tut_next'))}</button></div>`);
        body.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
        body.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => tutGo(Number(b.dataset.d))));
        body.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { page = Number(b.dataset.p); sfx('select'); show(); }));
        body.parentElement.scrollTop = 0;
      };
      tutGo = d => {
        if (single) { if (d > 0) closeModal(); return; }   // 單頁：鍵盤右鍵＝關閉，左鍵不動
        if (page + d >= n) { closeModal(); return; }
        if (page + d < 0) return;
        page += d; sfx('select'); show();
      };
      if (!single) body.parentElement.classList.add('tut');   // 單頁不用翻，面板照內容高度就好
      show();
    }, () => { tutGo = null; $('#modal .panel').classList.remove('tut'); });
  }

  /* ───────── 雲端同步 ───────── */
  function cloudText() {
    const s = MT.Sync.status;
    if (s === 'ok') return MT.t('cs_ok') + ' · ' + timeAgo(MT.Sync.lastSync);
    if (s === 'err') return MT.t('cs_err') + '：' + MT.Sync.error;
    return MT.t('cs_' + s);
  }
  function renderCloudChip() {
    // 雲端同步的入口在存檔頁最下面；存檔頁開著時跟著更新狀態
    const c = $('#saveCloud');
    if (c) { c.dataset.s = MT.Sync.status; c.innerHTML = `<i>●</i> ${esc(MT.t('cloud'))}：${esc(cloudText())}`; }
    const tc = $('#tCloud');
    if (tc) tc.textContent = MT.t('cloud') + ' · ' + cloudText();
  }
  MT.Sync.onStatus = () => renderCloudChip();

  function openCloud() {
    const c = MT.Sync.conf();
    openModal(MT.t('cloudTitle'), `
      <p>${esc(MT.t('cloudBody'))}</p>
      <p class="status" data-s="${MT.Sync.status}">● ${esc(cloudText())}</p>
      <form id="cloudForm">
        <label class="lab" for="gToken">${esc(MT.t('tokenLabel'))}</label>
        <input type="password" id="gToken" autocomplete="off" spellcheck="false" placeholder="${c.token ? esc(MT.t('tokenSaved')) : 'github_pat_…'}">
        <p class="muted small">${MT.t('tokenHint')}</p>
        <label class="lab" for="gRepo">${esc(MT.t('repoLabel'))}</label>
        <input type="text" id="gRepo" autocomplete="off" spellcheck="false" value="${esc(c.owner + '/' + c.repo)}">
        <p class="err" id="cloudErr" hidden></p>
        <div class="row end">${c.token ? `<button type="button" class="btn danger" data-off>${esc(MT.t('disconnect'))}</button>` : ''}
          <button type="submit" class="btn primary">${esc(MT.t('connect'))}</button></div>
      </form>`, body => {
      const off = body.querySelector('[data-off]');
      if (off) off.addEventListener('click', () => { MT.Sync.disconnect(); closeModal(); openCloud(); });
      body.querySelector('#cloudForm').addEventListener('submit', async e => {
        e.preventDefault();
        const token = body.querySelector('#gToken').value.trim() || c.token;
        const repo = body.querySelector('#gRepo').value.trim();
        if (!token) return;
        const btn = body.querySelector('[type=submit]'); btn.disabled = true;
        try {
          await MT.Sync.connect(token, repo);
          closeModal();
          toast(MT.t('cs_ok'));
          if (mode === 'title') renderTitle();
          else checkCloudNewer();
        } catch (err) {
          btn.disabled = false;
          const el = body.querySelector('#cloudErr'); el.hidden = false; el.textContent = MT.Sync.error || MT.t('cs_offline');
        }
      });
    });
  }

  // 別台裝置有比較新的自動存檔 → 問要不要讀
  async function checkCloudNewer() {
    if (!st || mode !== 'game') return;
    const a = latestAuto();
    if (!a || a.at <= lastAutoAt || MT.Sync.isMine(a)) return;
    while (busy) await sleep(200);
    busy++;
    const k = await ask(MT.t('cloudNewer', { device: a.device, floor: a.floor, time: timeAgo(a.at) }), [{ key: 'stay', label: MT.t('cloudStay') }, { key: 'load', label: MT.t('cloudLoad') }]);
    busy--;
    if (k === 'load') { startGame(MT.unpack(a.data)); toast(MT.t('loaded')); }
    else lastAutoAt = a.at;
  }

  function autosave() {
    if (!st || st.done || mode !== 'game' || scripting) return;
    tickPlay();
    const sl = MT.Sync.saveAuto(MT.pack(st));
    lastAutoAt = sl.at;
  }
  function tickPlay() {
    const t = Date.now();
    if (playClock && st && mode === 'game' && !document.hidden) st.playMs += Math.min(t - playClock, 60000);
    playClock = t;
  }
  setInterval(tickPlay, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopHold();
      if (mode === 'game') autosave();
      MT.Sync.push(true);
      MT.Audio.suspend();
    } else {
      playClock = Date.now();
      MT.Audio.resume();
      MT.Sync.pull().then(() => checkCloudNewer());
    }
  });
  window.addEventListener('pagehide', () => { if (mode === 'game') autosave(); MT.Sync.push(true); });

  /* ───────── 開場／結局動畫 ───────── */
  const cine = $('#cineCanvas');
  cine.width = cine.height = SIZE;
  const cg = cine.getContext('2d');
  cg.imageSmoothingEnabled = false;
  let cineScene = null, cineT0 = 0, cineQueue = [], cineDone = null;   // cineT0＝這個場景開始的時間，給有時間軸的演出用
  let cinePose = null;   // 劇本那一步指定的阿爾特表情（pose），換場景時清掉
  let cineDots = 0;      // 劇本那一步標了 dots（無言）時的開始時間；頭上冒「…」泡泡＋一大滴汗，下一步就收掉

  const stars = Array.from({ length: 70 }, (_, i) => [(i * 97) % SIZE, (i * 53) % 300, (i % 3) + 1]);
  function drawTown(t, day) {
    // 房子剪影
    cg.fillStyle = day ? '#6a4a3a' : '#1a1628';
    for (let i = 0; i < 9; i++) {
      const x = i * 62 - 10, h = 90 + (i * 37) % 60;
      cg.fillRect(x, SIZE - h, 56, h);
      cg.beginPath(); cg.moveTo(x - 6, SIZE - h); cg.lineTo(x + 28, SIZE - h - 30); cg.lineTo(x + 62, SIZE - h); cg.fill();
      cg.fillStyle = day ? '#ffd84a' : (Math.floor(t / 700 + i) % 5 ? '#ffcf6a' : '#8a6a3a');
      cg.fillRect(x + 18, SIZE - h + 22, 10, 12);
      cg.fillStyle = day ? '#6a4a3a' : '#1a1628';
    }
    cg.fillStyle = day ? '#8a6a4a' : '#231d33';
    cg.fillRect(0, SIZE - 40, SIZE, 40);
  }
  function drawSky(t, top, bottom) {
    const gr = cg.createLinearGradient(0, 0, 0, SIZE);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    cg.fillStyle = gr; cg.fillRect(0, 0, SIZE, SIZE);
  }
  function drawStars(t) {
    for (const [x, y, s] of stars) { cg.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t / 500 + x)})`; cg.fillRect(x, y, s, s); }
  }
  function bigSprite(name, pal, x, y, sc, flip) { cg.drawImage(MT.sprite(name, pal, sc, flip), x, y); }
  function floatingNotes(t, n, cx, cy, spread, color, rise) {
    cg.font = 'bold 26px serif'; cg.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const p = ((t / 2000 + i * 0.37) % 3) / 3;            // 一趟 6 秒（1.4.4 起放慢一半，原本 3 秒）
      const x = cx + Math.sin(i * 1.7 + t / 1800) * spread;
      const y = cy - p * rise;
      cg.globalAlpha = Math.sin(p * Math.PI); cg.fillStyle = color || ['#ffe066', '#aef4ff', '#ff9ccc'][i % 3];
      cg.fillText('♪♫♬♩'[i % 4], x, y);
    }
    cg.globalAlpha = 1;
  }
  // lit：亮幾扇窗（由下往上），不給就全亮
  function drawTower(t, x, w, color, lit) {
    cg.fillStyle = color;
    cg.fillRect(x - w / 2, 90, w, SIZE - 130);
    cg.beginPath(); cg.moveTo(x - w / 2 - 14, 100); cg.lineTo(x, 30); cg.lineTo(x + w / 2 + 14, 100); cg.fill();
    cg.fillStyle = '#c07cf5';
    for (let i = 0; i < 6; i++) if (lit === undefined || 5 - i < lit) cg.fillRect(x - 6, 130 + i * 55, 12, 18);
  }
  // 兩個 #rrggbb 顏色之間取 k（0～1）
  function mixColor(a, b, k) {
    const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
    return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',') + ')';
  }

  // 夜裡的打鐵鋪：星空、左邊的鐵砧和還沒熄的爐火
  // 一張圖的純色剪影（影子用）
  const silCache = new Map();
  function silhouette(name, sc, color) {
    const key = name + '|' + sc + '|' + color;
    let c = silCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 16 * sc;
    const g = c.getContext('2d');
    g.drawImage(MT.sprite(name, null, sc), 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    silCache.set(key, c);
    return c;
  }
  // 過場的心跳：跟 audio.js 的 heartbeat 同一個節奏（一下比一下快）。回傳 0～1，咚的那一下最亮
  const HEART_MS = [];
  for (let i = 0, at = 150; i < 8; i++) { if (i) at += 950 - i * 70; HEART_MS.push(at); }
  function heartbeatAt(st) {
    let v = 0;
    for (const b of HEART_MS) for (const off of [0, 160]) { const d = st - b - off; if (d >= 0 && d < 260) v = Math.max(v, (1 - d / 260) * (off ? 0.7 : 1)); }
    return v;
  }
  function drawForgeNight(t) {
    drawSky(t, '#120c1c', '#3a1a14'); drawStars(t);
    cg.fillStyle = '#2a1a14'; cg.fillRect(0, SIZE - 120, SIZE, 120);
    cg.fillStyle = '#454a58'; cg.fillRect(40, SIZE - 170, 120, 30); cg.fillRect(70, SIZE - 140, 60, 50);
    cg.fillStyle = 'rgba(255,120,40,0.10)'; cg.beginPath(); cg.arc(100, SIZE - 160, 110 + Math.sin(t / 300) * 6, 0, Math.PI * 2); cg.fill();
  }

  /* 序章練唱廳：阿爾特在台上領唱、破音、全場哄笑。st＝場景開始後幾毫秒，laughing＝笑到什麼程度（0～1） */
  const LAUGH_TEXT = { zh: '哈哈', en: 'HA HA', ja: 'ハハ' };
  const CLANG_TEXT = { zh: '噹！', en: 'CLANG!', ja: 'カーン！' };
  let forgeBeat = -1;   // 打鐵鋪那幕上一次響鐵砧聲的拍子
  // 國王進門那幕：王子敲鐵的時間點（毫秒），跟國王的腳步聲（754／1131／1508）錯開，聽起來是噹、步、噹、步；國王站定前轉身
  const FORGE_KING_HITS = [150, 560, 940, 1320], FORGE_KING_TURN = 1500;
  const MEET_WALK = 1400;   // 遇見多蕾那幕：王子從左邊走進場的時間（毫秒）
  const MAESTRO_LAUGH = 2300;   // 黑衣人升到最高點、嘴裂開開始笑的時間（毫秒）
  // 鎚子敲下後跳出的「噹」：age＝敲下後幾毫秒，先放大一下再往上飄著淡掉
  function clangPop(age, x, y) {
    if (age < 0 || age > 900) return;
    const s = 1 + 0.35 * Math.max(0, 1 - age / 120), word = CLANG_TEXT[MT.getLang()] || CLANG_TEXT.en;
    cg.globalAlpha = Math.min(1, (900 - age) / 350);
    cg.textAlign = 'center'; cg.lineWidth = 5; cg.lineJoin = 'round';
    cg.font = `900 ${Math.round(40 * s)}px sans-serif`;
    cg.strokeStyle = '#1b1a26'; cg.fillStyle = '#ffe066';
    cg.strokeText(word, x, y - age / 900 * 40); cg.fillText(word, x, y - age / 900 * 40);
    cg.globalAlpha = 1;
  }
  const choir = Array.from({ length: 10 }, (_, i) => ({ x: [70, 120, 170, 358, 408, 458][i % 6] + (i >= 6 ? 25 : 0), row: i >= 6 ? 1 : 0, robe: i % 2 }));
  const audience = Array.from({ length: 11 }, (_, i) => ({ x: 20 + i * 49 + (i % 2) * 8, h: 30 + (i * 7) % 12 }));
  function drawRehearsal(t, st, laughing, sprite) {
    const gr = cg.createLinearGradient(0, 0, 0, SIZE);
    gr.addColorStop(0, '#2a1426'); gr.addColorStop(1, '#4a2a2a');
    cg.fillStyle = gr; cg.fillRect(0, 0, SIZE, SIZE);
    // 布幕
    for (let i = 0; i < 6; i++) {
      cg.fillStyle = i % 2 ? '#7a1e2a' : '#9a2a34';
      cg.fillRect(i * 16, 0, 16, SIZE - 150); cg.fillRect(SIZE - 96 + i * 16, 0, 16, SIZE - 150);
    }
    cg.fillStyle = '#5a141e'; cg.fillRect(0, 0, SIZE, 34);
    // 舞台
    cg.fillStyle = '#6a4a30'; cg.fillRect(0, SIZE - 150, SIZE, 40);
    cg.fillStyle = '#3a2618'; cg.fillRect(0, SIZE - 110, SIZE, 110);
    const bob = i => laughing * Math.abs(Math.sin(t / 95 + i * 1.9)) * 5;
    // 合唱團：後排兩階，站在王子兩側
    for (let i = 0; i < choir.length; i++) {
      const c = choir[i], y = SIZE - 205 - c.row * 30 - bob(i);
      cg.fillStyle = c.robe ? '#e8e0f0' : '#d0c4e4'; cg.fillRect(c.x - 13, y + 18, 26, 34);
      cg.fillStyle = '#f7cfa6'; cg.fillRect(c.x - 9, y, 18, 18);
      cg.fillStyle = '#5a3a1e'; cg.fillRect(c.x - 9, y, 18, 5);
      cg.fillStyle = '#1b1a26';
      if (laughing > 0.3) { cg.fillRect(c.x - 5, y + 8, 3, 2); cg.fillRect(c.x + 2, y + 8, 3, 2); cg.fillRect(c.x - 3, y + 12, 6, 4); }   // 瞇眼大笑
      else { cg.fillRect(c.x - 5, y + 7, 2, 3); cg.fillRect(c.x + 3, y + 7, 2, 3); cg.fillRect(c.x - 2, y + 12, 4, 3); }
    }
    // 王子
    const shake = laughing > 0.3 && sprite === 'heroSing' ? Math.sin(t / 40) * 1.5 : 0;
    cg.drawImage(MT.sprite(sprite, null, 6), SIZE / 2 - 48 + shake, SIZE - 246);
    // 台下觀眾剪影
    for (let i = 0; i < audience.length; i++) {
      const a = audience[i], y = SIZE - a.h - bob(i + 3);
      cg.fillStyle = '#150d16';
      cg.beginPath(); cg.arc(a.x, y, 16, 0, Math.PI * 2); cg.fill();
      cg.fillRect(a.x - 24, y + 12, 48, 40);
    }
  }
  // 漂在空中的「哈哈」：從人群冒出來往上飄
  function drawLaughs(t, n, alpha, sizeK) {
    cg.textAlign = 'center';
    const word = LAUGH_TEXT[MT.getLang()] || LAUGH_TEXT.en;
    for (let i = 0; i < n; i++) {
      const p = ((t / 1500 + i * 0.29) % 1);
      const src = i % 3 === 0 ? audience[(i * 5) % audience.length].x : choir[(i * 3) % choir.length].x;
      const y0 = i % 3 === 0 ? SIZE - 70 : SIZE - 230;
      cg.globalAlpha = alpha * Math.sin(p * Math.PI);
      cg.fillStyle = '#fff3c0';
      cg.font = `bold ${Math.round((14 + (i % 3) * 4) * sizeK)}px sans-serif`;
      cg.fillText(word, src + Math.sin(i * 2.3 + t / 400) * 14, y0 - p * 70);
    }
    cg.globalAlpha = 1;
  }

  // 唱歌的鎮民：[x, pal]；後排小一號、站高一點（遠），前排踩在地上
  function folk(back, front, backLift) {
    return [
      ...back.map(([x, pal]) => ({ x, pal, sc: 3, lift: backLift })),
      ...front.map(([x, pal]) => ({ x, pal, sc: 4, lift: 0 })),
    ].map((v, i) => Object.assign(v, { ph: (i * 1.37) % 3, flip: i % 2 === 1 }));
  }
  function drawFolk(t, list) {
    for (const v of list) {
      const sing = Math.floor(t / 420 + v.ph) % 3 !== 0;                 // 大部分時間張著嘴
      const bob = Math.abs(Math.sin(t / 480 + v.ph * 2)) * v.sc * 1.5;
      bigSprite(sing ? 'villagerSing' : 'villager', v.pal, v.x, SIZE - 38 - v.sc * 16 - v.lift - bob, v.sc, v.flip);
    }
  }
  // 序章廣場：前排避開國王（130～210）與正中間領唱的阿爾特（224～304）
  const townFolk = folk(
    [[28, 'vF'], [84, 'vC'], [200, 'vE'], [300, 'vA'], [352, 'vB'], [404, 'vD'], [468, 'vC']],
    [[2, 'vA'], [58, 'vE'], [310, 'vD'], [362, 'vF'], [414, 'vB'], [464, 'vA']], 22);
  // 一般結局的豐收祭：後排站在阿爾特、大鼓、國王那一排的空檔，前排擠滿地面（左邊留給呱呱商人）
  const festFolk = folk(
    [[4, 'vD'], [52, 'vA'], [218, 'vC'], [470, 'vE']],
    [[70, 'vB'], [122, 'vF'], [174, 'vA'], [226, 'vE'], [278, 'vC'], [330, 'vD'], [382, 'vA'], [434, 'vB'], [482, 'vF']], 66);
  // 真結局：後排在舞台兩側，前排是台前的觀眾（大鼓 40～120、國王 400～480 之間）
  const festTrueFolk = folk(
    [[0, 'vC'], [84, 'vE'], [150, 'vA'], [330, 'vB'], [384, 'vF'], [476, 'vD']],
    [[110, 'vF'], [160, 'vD'], [210, 'vB'], [262, 'vA'], [312, 'vE'], [354, 'vC']], 92);

  /* 序章：阿爾特腳下的影子站起來，變成戴微笑面具的巨大黑影；鎮上每一扇窗也飄出一縷暗影匯進它身上
     （每個人心裡都有一塊想讓世界閉嘴的地方）。它舉起指揮棒，所有音符被捲向棒尖 */
  function drawMaestroRise(t) {
    const st = t - cineT0;
    const k = Math.min(1, st / 2200), e = 1 - Math.pow(1 - k, 3);          // 從影子裡長出來
    const lift = Math.min(1, Math.max(0, (st - 1600) / 900));             // 舉起指揮棒
    const cx = SIZE / 2, sc = 10, fw = 16 * sc;
    // 升到最高點（MAESTRO_LAUGH 毫秒）之後才開始笑：身體一抖一抖，笑完慢慢停（3.2.31 Ken 指定）
    const lt = st - MAESTRO_LAUGH, laughing = lt > 0 && lt < 1800;
    const shake = laughing ? -Math.abs(Math.sin(lt / 95)) * 7 * (1 - lt / 1800) : 0;
    const fy = 96 + (1 - e) * 150 + Math.sin(t / 900) * 5 + shake;       // 身體左上角
    const footY = SIZE - 40;
    drawSky(t, '#05040c', '#170c24');
    // 身後一圈病態的紫光，讓純黑的剪影浮出來
    const halo = cg.createRadialGradient(cx, fy + 70, 10, cx, fy + 70, 230);
    halo.addColorStop(0, `rgba(110,60,170,${0.55 * e})`); halo.addColorStop(1, 'rgba(110,60,170,0)');
    cg.fillStyle = halo; cg.fillRect(0, 0, SIZE, SIZE);
    drawTown(t);
    // 每扇窗飄出來的暗影：沿著曲線流進黑影的胸口
    for (let i = 0; i < 9; i++) {
      const h = 90 + (i * 37) % 60, wx = i * 62 + 13, wy = SIZE - h + 28;
      for (let j = 0; j < 7; j++) {
        const p = ((st / 2600 + j / 7 + i * 0.11) % 1);
        if (st < 600 + i * 120) continue;
        const tx = cx, ty = fy + 120;
        const mx = (wx + tx) / 2 + Math.sin(i * 2.1) * 80, my = Math.min(wy, ty) - 90;
        const x = (1 - p) * (1 - p) * wx + 2 * (1 - p) * p * mx + p * p * tx;
        const y = (1 - p) * (1 - p) * wy + 2 * (1 - p) * p * my + p * p * ty;
        cg.globalAlpha = Math.sin(p * Math.PI) * 0.55 * e;
        cg.fillStyle = j % 2 ? '#3a2258' : '#2a173f';
        cg.beginPath(); cg.arc(x, y, 7 - p * 3, 0, Math.PI * 2); cg.fill();
      }
    }
    cg.globalAlpha = 1;
    // 阿爾特腳下的影子一路拉長，接到黑影的下襬
    const baseY = fy + fw - 24, sway = Math.sin(t / 500) * 10;
    cg.fillStyle = '#0c0914';
    cg.beginPath();
    cg.moveTo(cx - 22, footY + 2);
    cg.bezierCurveTo(cx - 40 + sway, footY - 60, cx - 70 - sway, baseY + 50, cx - 62, baseY);
    cg.lineTo(cx + 62, baseY);
    cg.bezierCurveTo(cx + 70 + sway, baseY + 50, cx + 40 - sway, footY - 60, cx + 22, footY + 2);
    cg.fill();
    // 黑影周圍往上散的煙
    for (let i = 0; i < 26; i++) {
      const p = ((t / 2200 + i / 26) % 1), side = i % 2 ? 1 : -1;
      const x = cx + side * (40 + (i * 13) % 50 + p * 30), y = fy + 150 - p * 170 - (i * 7) % 30;
      cg.globalAlpha = (1 - p) * 0.75 * e; cg.fillStyle = '#0c0914';
      cg.beginPath(); cg.arc(x, y, 9 + p * 10, 0, Math.PI * 2); cg.fill();
    }
    cg.globalAlpha = 1;
    // 阿爾特（小小的，背對著我們仰頭看自己的影子）
    bigSprite('heroUp', null, cx - 32, footY - 64, 4);
    // 手臂：右手舉指揮棒、左手往外張；先畫紫色輪廓再疊黑色
    const sh = fy + 10.5 * sc;
    const hand = [cx + 70 + 70 * lift, sh - 10 - 120 * lift + Math.sin(t / 380) * 6 * lift];
    const hand2 = [cx - 70 - 60 * lift, sh + 30 - 50 * lift + Math.sin(t / 450 + 1) * 5 * lift];
    // 手臂是一串由粗到細的煙團，越往指尖越細
    cg.globalAlpha = e;
    for (const [pad, col] of [[3, '#7a52c0'], [0, '#0c0914']]) {
      cg.fillStyle = col;
      for (const [hx, hy, s] of [[...hand, 1], [...hand2, -1]]) {
        const x0 = cx + s * 55, mx = cx + s * 95, my = sh - 20;
        for (let i = 0; i <= 20; i++) {
          const q = i / 20, x = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * mx + q * q * hx, y = (1 - q) * (1 - q) * sh + 2 * (1 - q) * q * my + q * q * hy;
          cg.beginPath(); cg.arc(x, y, 13 - q * 9 + pad, 0, Math.PI * 2); cg.fill();
        }
      }
    }
    const tip = [hand[0] + 34, hand[1] - 46];
    cg.lineCap = 'round';
    cg.strokeStyle = '#efeadc'; cg.lineWidth = 4;
    cg.beginPath(); cg.moveTo(hand[0], hand[1]); cg.lineTo(tip[0], tip[1]); cg.stroke();
    cg.globalAlpha = 1;
    // 面具：升起時沒有嘴，到最高點後嘴一格格裂開成笑臉（細縫 → 嘴角上翹 → 咧開）
    const face = lt < 0 ? 'maestroBlank' : lt < 280 ? 'maestroSmile1' : lt < 620 ? 'maestro' : 'maestroSmile3';
    cg.drawImage(MT.sprite(face, null, sc), cx - fw / 2, fy);
    // 面具眼洞的紅光一明一暗
    const glow = 0.35 + 0.35 * Math.sin(t / 260);
    cg.globalCompositeOperation = 'lighter'; cg.fillStyle = `rgba(255,58,106,${glow * e})`;
    for (const ex of [6, 9]) { cg.beginPath(); cg.arc(cx - fw / 2 + (ex + 0.5) * sc, fy + 4.5 * sc, 14, 0, Math.PI * 2); cg.fill(); }
    cg.globalCompositeOperation = 'source-over';
    return { tip, lift };
  }

  const SCENES = {
    rehearsal: t => {
      const st = t - cineT0;
      const laughing = Math.min(1, Math.max(0, (st - 1600) / 300));
      drawRehearsal(t, st, laughing, 'heroSing');
      cg.textAlign = 'center';
      // 唱歌時往上飄的音符；1.1 秒那顆最高音破掉：抖一下、裂成兩半往下掉
      if (st < 1600) {
        cg.font = 'bold 22px serif';
        for (let i = 0; i < 3; i++) {
          const p = ((st / 900 + i / 3) % 1);
          cg.globalAlpha = Math.sin(p * Math.PI) * 0.8; cg.fillStyle = '#ffe066';
          cg.fillText('♪♫♩'[i], SIZE / 2 + 40 + Math.sin(i * 2 + st / 300) * 20, SIZE - 260 - p * 80);
        }
        cg.globalAlpha = 1;
      }
      const cx = SIZE / 2 + 10, cy = SIZE - 330;
      cg.font = 'bold 54px serif';
      if (st > 500 && st < 1100) {
        cg.globalAlpha = (st - 500) / 600; cg.fillStyle = '#ffe066';
        cg.fillText('♪', cx + (st > 900 ? Math.sin(st / 15) * 4 : 0), cy);
        cg.globalAlpha = 1;
      } else if (st >= 1100 && st < 2600) {
        const k = (st - 1100) / 1500;
        cg.globalAlpha = 1 - k; cg.fillStyle = '#c9921a';
        for (const side of [-1, 1]) {
          cg.save();
          cg.beginPath(); cg.rect(side < 0 ? cx - 40 : cx, cy - 60, 40, 80); cg.clip();
          cg.translate(cx + side * k * 30, cy + k * k * 180); cg.rotate(side * k * 1.2);
          cg.fillText('♪', 0, 0);
          cg.restore();
        }
        cg.globalAlpha = 1;
      }
      if (laughing > 0) drawLaughs(t, 12, laughing, 1);
    },
    // 笑聲之後：燈全暗，只剩一束光打在低著頭的阿爾特身上；笑聲在黑暗裡越來越遠
    rehearsalSpot: t => {
      const st = t - cineT0;
      const k = Math.min(1, st / 1800), e = 1 - Math.pow(1 - k, 3);          // 先快後慢地收攏
      const settle = Math.max(0, 1 - st / 3000);                               // 人群的笑慢慢停
      drawRehearsal(t, st, settle, 'heroSad');
      const cx = SIZE / 2, cy = SIZE - 200, r = 520 - e * 420 + Math.sin(t / 700) * 3;
      const dark = cg.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      dark.addColorStop(0, 'rgba(6,4,12,0)'); dark.addColorStop(1, `rgba(6,4,12,${0.93 * e})`);
      cg.fillStyle = dark; cg.fillRect(0, 0, SIZE, SIZE);
      // 從上面打下來的光束與地上的光圈
      cg.globalCompositeOperation = 'lighter';
      cg.fillStyle = `rgba(255,236,190,${0.10 * e})`;
      cg.beginPath(); cg.moveTo(cx - 18, 0); cg.lineTo(cx + 18, 0); cg.lineTo(cx + 85, SIZE - 145); cg.lineTo(cx - 85, SIZE - 145); cg.fill();
      cg.fillStyle = `rgba(255,236,190,${0.16 * e})`;
      cg.beginPath(); cg.ellipse(cx, SIZE - 150, 80, 16, 0, 0, Math.PI * 2); cg.fill();
      cg.globalCompositeOperation = 'source-over';
      // 光圈外的黑暗裡還有零星的笑聲，越來越小、越來越淡
      drawLaughs(t * 0.6, 7, 0.35 * e * Math.max(0.25, 1 - st / 9000), 0.8);
      // 眼淚：從閉著的眼角慢慢滑落
      for (const [ex, ph] of [[-9, 0], [9, 0.5]]) {
        const p = ((st / 1700 + ph) % 1);
        if (st < 1200) continue;
        cg.globalAlpha = (1 - p) * 0.9; cg.fillStyle = '#aef4ff';
        cg.fillRect(cx + ex - 2, SIZE - 204 + p * 34, 4, 6);
      }
      cg.globalAlpha = 1;
    },
    // 傍晚的廣場：滿滿的鎮民一起唱歌，阿爾特站在前排正中間領唱，國王在他旁邊（旁白正在講他是合唱團的領唱）
    town: t => {
      drawSky(t, '#141a3a', '#3a2a5a'); drawStars(t); drawTown(t);
      drawFolk(t, townFolk);
      bigSprite('bard', null, 130, SIZE - 118, 5);
      bigSprite('heroSing', null, 224, SIZE - 118, 5);
      floatingNotes(t, 22, SIZE / 2, SIZE - 70, 250, null, 320);
    },
    // 逃出練唱廳：夜裡的街道往後退，阿爾特邊哭邊跑，「哈哈」一路追在後面；
    // 越跑越慢，王宮後面打鐵鋪的爐光從右邊滑進來，老鐵匠站在門口
    flee: t => {
      const st = t - cineT0;
      const k = Math.min(1, st / 3600), cam = 520 * (1 - Math.pow(1 - k, 2));   // 鏡頭跟著他往右，最後停下
      const running = k < 0.97;
      drawSky(t, '#0c0e24', '#2a1a3a'); drawStars(t);
      cg.fillStyle = '#e8e0c8'; cg.beginPath(); cg.arc(420 - cam * 0.05, 80, 26, 0, Math.PI * 2); cg.fill();   // 月亮幾乎不動
      // 遠景房子（慢）與近景房子（快），窗戶都黑了大半
      for (const [par, col, base, step, hh] of [[0.4, '#16122a', SIZE - 70, 70, 120], [1, '#0d0a18', SIZE - 40, 96, 90]]) {
        cg.fillStyle = col;
        const off = (cam * par) % step;
        for (let i = -1; i < SIZE / step + 2; i++) {
          const n = i + Math.floor(cam * par / step), x = i * step - off, h = hh + (n * 37 % 50);
          if (par === 1 && x + cam > 760) continue;                           // 打鐵鋪那一段不蓋房子
          cg.fillRect(x, base - h, step - 14, h);
          cg.beginPath(); cg.moveTo(x - 6, base - h); cg.lineTo(x + (step - 14) / 2, base - h - 26); cg.lineTo(x + step - 8, base - h); cg.fill();
          if (n % 3 === 0) { cg.fillStyle = '#6a5a3a'; cg.fillRect(x + 16, base - h + 20, 9, 11); cg.fillStyle = col; }
        }
      }
      cg.fillStyle = '#1a1424'; cg.fillRect(0, SIZE - 40, SIZE, 40);
      // 打鐵鋪：一間小木屋，門裡透出橘紅的爐光
      const fx = 860 - cam;
      if (fx < SIZE + 40) {
        const glow = cg.createRadialGradient(fx + 85, SIZE - 100, 10, fx + 85, SIZE - 100, 260);
        glow.addColorStop(0, `rgba(255,140,50,${0.45 + 0.05 * Math.sin(t / 180)})`); glow.addColorStop(1, 'rgba(255,140,50,0)');
        cg.fillStyle = glow; cg.fillRect(0, 0, SIZE, SIZE);
        cg.fillStyle = '#2a1a14'; cg.fillRect(fx, SIZE - 210, 170, 170);
        cg.beginPath(); cg.moveTo(fx - 16, SIZE - 210); cg.lineTo(fx + 85, SIZE - 262); cg.lineTo(fx + 186, SIZE - 210); cg.fill();
        cg.fillStyle = '#ff9a3a'; cg.fillRect(fx + 37, SIZE - 172, 96, 132);
        cg.fillStyle = '#ffd27a'; cg.fillRect(fx + 45, SIZE - 164, 80, 124);
        bigSprite('smith', null, fx + 29, SIZE - 40 - 112, 7);
      }
      // 阿爾特：跑步兩格輪流、身體一顛一顛；停下來之後喘氣、肩膀起伏
      const ax = 150 + (running ? 0 : Math.min(60, (st - 3500) / 12)) , frame = Math.floor(t / 130) % 2;
      const bob = running ? (frame ? -6 : 0) : Math.round(Math.sin(t / 260) * 2);
      bigSprite(running ? (frame ? 'heroRunA' : 'heroRunB') : 'heroRunB', null, Math.min(ax, 210), SIZE - 40 - 128 + bob, 8);
      // 被風吹到後面的眼淚
      if (running) for (let i = 0; i < 3; i++) {
        const p = ((t / 500 + i / 3) % 1);
        cg.globalAlpha = 1 - p; cg.fillStyle = '#aef4ff';
        cg.fillRect(150 + 70 - p * 70, SIZE - 168 + 50 + p * 20 - Math.sin(p * Math.PI) * 10, 5, 4);
      }
      cg.globalAlpha = 1;
      // 追在背後的笑聲：越來越淡、越來越小
      const word = LAUGH_TEXT[MT.getLang()] || LAUGH_TEXT.en;
      const fade = Math.max(0, 1 - st / 4200);
      cg.textAlign = 'center';
      for (let i = 0; i < 6; i++) {
        const p = ((t / 1300 + i / 6) % 1);
        cg.globalAlpha = Math.sin(p * Math.PI) * fade * 0.8; cg.fillStyle = '#fff3c0';
        cg.font = `bold ${Math.round((16 + (i % 3) * 5) * (0.6 + 0.4 * fade))}px sans-serif`;
        cg.fillText(word, 30 + (i * 23) % 110 - p * 40, SIZE - 210 - (i * 31) % 120 - p * 30);
      }
      cg.globalAlpha = 1;
    },
    // 第一下：老鐵匠什麼也沒問，把鎚子塞進他手裡。他一鎚敲下去——「噹！」一陣白光，耳邊轉著的笑聲全被震碎
    firstStrike: t => {
      const st = t - cineT0, HIT = 1500;
      drawSky(t, '#2a1810', '#5a2a18');
      cg.fillStyle = '#3a2418'; cg.fillRect(0, SIZE - 120, SIZE, 120);
      cg.fillStyle = '#555a68'; cg.fillRect(270, SIZE - 170, 120, 30); cg.fillRect(300, SIZE - 140, 60, 50);
      cg.fillStyle = 'rgba(255,140,40,0.15)'; cg.beginPath(); cg.arc(330, SIZE - 160, 140 + Math.sin(t / 200) * 10, 0, Math.PI * 2); cg.fill();
      const after = st - HIT;
      if (after > 0 && after < 260) cg.translate((Math.random() - 0.5) * 14 * (1 - after / 260), (Math.random() - 0.5) * 14 * (1 - after / 260));
      bigSprite('smith', null, -4, SIZE - 122 - 144, 9);
      // 鎚子從老鐵匠手上遞過去
      const give = Math.min(1, Math.max(0, (st - 200) / 700));
      if (give < 1) {
        const x = 120 + give * 130, y = SIZE - 200 - Math.sin(give * Math.PI) * 30;
        cg.fillStyle = '#1b1a26'; cg.fillRect(x - 6, y - 7, 12, 50); cg.fillRect(x - 19, y - 21, 38, 22);
        cg.fillStyle = '#9a6634'; cg.fillRect(x - 3, y - 4, 6, 44);
        cg.fillStyle = '#8a8f9e'; cg.fillRect(x - 16, y - 18, 32, 16);
        bigSprite('heroRunB', null, 150, SIZE - 250, 8);
      } else {
        const down = after > -120 && after < 160 ? 6 : 0;                     // 舉起、敲下
        bigSprite('heroSideSulk', null, 150, SIZE - 250 + down, 8);
      }
      // 敲下去之前，笑聲還在他頭邊打轉
      const word = LAUGH_TEXT[MT.getLang()] || LAUGH_TEXT.en;
      cg.textAlign = 'center';
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + t / 900, r = 80 + (i % 3) * 14;
        let x = 214 + Math.cos(a) * r, y = SIZE - 230 + Math.sin(a) * r * 0.45, al = 0.7;
        if (after > 0) { const q = Math.min(1, after / 500); x += Math.cos(a) * q * 160; y += Math.sin(a) * q * 90 - q * 20; al *= 1 - q; }   // 被震飛
        if (al <= 0) continue;
        cg.globalAlpha = al; cg.fillStyle = '#fff3c0'; cg.font = 'bold 18px sans-serif';
        cg.fillText(word, x, y);
      }
      cg.globalAlpha = 1;
      if (after > 0) {
        // 火星四濺
        for (let i = 0; i < 18; i++) {
          const q = Math.min(1, after / 900), a = -Math.PI * (0.1 + 0.8 * ((i * 0.37) % 1)), v = 120 + (i * 53) % 140;
          cg.globalAlpha = 1 - q; cg.fillStyle = ['#ffd84a', '#ff9a2e', '#fff6d0'][i % 3];
          cg.fillRect(318 + Math.cos(a) * v * q, SIZE - 175 + Math.sin(a) * v * q + q * q * 120, 5, 5);
        }
        cg.globalAlpha = 1;
        // 「噹！」
        if (after < 1400) {
          const s = 1 + 0.5 * Math.max(0, 1 - after / 160);
          cg.globalAlpha = Math.min(1, (1400 - after) / 400);
          cg.font = `900 ${Math.round(64 * s)}px sans-serif`; cg.lineWidth = 6; cg.lineJoin = 'round';
          cg.strokeStyle = '#1b1a26'; cg.fillStyle = '#ffe066';
          cg.strokeText(CLANG_TEXT[MT.getLang()] || CLANG_TEXT.en, 360, SIZE - 230); cg.fillText(CLANG_TEXT[MT.getLang()] || CLANG_TEXT.en, 360, SIZE - 230);
          cg.globalAlpha = 1;
        }
        // 白光一閃
        if (after < 300) { cg.fillStyle = `rgba(255,248,220,${0.75 * (1 - after / 300)})`; cg.fillRect(-20, -20, SIZE + 40, SIZE + 40); }
      }
    },
    // 打鐵鋪：阿爾特臭著臉敲鐵，老鐵匠在他身後看著
    forge: t => {
      drawSky(t, '#2a1810', '#5a2a18');
      cg.fillStyle = '#3a2418'; cg.fillRect(0, SIZE - 120, SIZE, 120);
      cg.fillStyle = '#555a68'; cg.fillRect(270, SIZE - 170, 120, 30); cg.fillRect(300, SIZE - 140, 60, 50);
      bigSprite('smith', null, -4, SIZE - 122 - 144, 9);
      const beat = Math.floor(t / 400), hit = beat % 2;
      if (hit && beat !== forgeBeat) { forgeBeat = beat; sfx('anvil'); }   // 鎚子落下那一格才響，跟畫面同拍
      bigSprite('heroSideSulk', null, 150, SIZE - 250 + (hit ? 6 : 0), 8);
      if (hit) for (let i = 0; i < 8; i++) { cg.fillStyle = ['#ffd84a', '#ff9a2e'][i % 2]; cg.fillRect(300 + Math.cos(i + t / 100) * 40, SIZE - 190 - Math.abs(Math.sin(i * 3 + t / 90)) * 50, 5, 5); }
      cg.fillStyle = 'rgba(255,140,40,0.15)'; cg.beginPath(); cg.arc(330, SIZE - 160, 140 + Math.sin(t / 200) * 10, 0, Math.PI * 2); cg.fill();
      // 每敲一下跳一個「噹」，左右交替；上一下的還沒散完，下一下就接上
      for (const b of [beat - (hit ? 0 : 1), beat - (hit ? 2 : 3)]) clangPop(t - b * 400, 348 + ((b >> 1) % 2 ? 44 : -44), SIZE - 215);
    },
    // 前一晚：先從黑畫面淡入夜裡的打鐵鋪，王子背對門口還在敲鐵；國王從右邊走進來，站定時王子才停手轉過身
    forgeKing: t => {
      const st = t - cineT0;
      drawForgeNight(t);
      const k = Math.min(1, Math.max(0, (st - 500) / 1100)), e = 1 - Math.pow(1 - k, 2);
      const step = k > 0 && k < 1 ? Math.abs(Math.sin(st / 120)) * 8 : 0;
      if (st < FORGE_KING_TURN) {
        const last = FORGE_KING_HITS.filter(h => h <= st).pop(), age = last === undefined ? -1 : st - last;
        bigSprite('heroSideSulk', null, 170, SIZE - 250 + (age >= 0 && age < 160 ? 6 : 0), 8, true);
        if (age >= 0 && age < 300) for (let i = 0; i < 8; i++) { cg.globalAlpha = 1 - age / 300; cg.fillStyle = ['#ffd84a', '#ff9a2e'][i % 2]; cg.fillRect(130 + Math.cos(i + t / 100) * 40, SIZE - 190 - Math.abs(Math.sin(i * 3 + t / 90)) * 50, 5, 5); }
        cg.globalAlpha = 1;
      } else bigSprite('heroSideSulk', null, 170, SIZE - 250, 8);
      FORGE_KING_HITS.forEach((h, i) => clangPop(st - h, 100 + (i % 2 ? 40 : -40), SIZE - 215));
      bigSprite('bard', null, SIZE + 10 - (SIZE + 10 - 330) * e, SIZE - 250 - step, 8);
      const dark = 1 - Math.min(1, st / 900);
      if (dark > 0) { cg.fillStyle = `rgba(6,4,12,${dark})`; cg.fillRect(0, 0, SIZE, SIZE); }
    },
    // 「全部都給我閉嘴！」：畫面猛震、紅光一圈圈炸開，吼聲往國王衝過去，國王被嚇得往後跳
    forgeRage: t => {
      const st = t - cineT0;
      const amp = st < 900 ? 3 + 11 * (1 - st / 900) : 2;
      cg.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
      drawForgeNight(t);
      const lunge = Math.min(1, st / 160) * 16, tremble = Math.sin(t / 30) * 2;
      const hx = 170 + lunge + tremble, hy = SIZE - 250;
      const mx = hx + 11 * 8, my = hy + 7 * 8 + 6;                      // 嘴巴的位置
      // 從王子身上炸開的紅光
      const pulse = st < 250 ? st / 250 : 0.45 + 0.25 * Math.sin(st / 140);
      const red = cg.createRadialGradient(hx + 64, hy + 64, 20, hx + 64, hy + 64, 300);
      red.addColorStop(0, `rgba(255,50,40,${0.5 * pulse})`); red.addColorStop(1, 'rgba(255,50,40,0)');
      cg.fillStyle = red; cg.fillRect(0, 0, SIZE, SIZE);
      // 國王往後一跳、再嚇得發抖
      const back = Math.min(1, st / 220);
      const hop = st < 450 ? Math.sin(st / 450 * Math.PI) * 26 : 0;
      bigSprite('bard', null, 330 + back * 40 + (st > 450 ? Math.sin(t / 45) * 1.5 : 0), SIZE - 250 - hop, 8);
      bigSprite('heroSideAngry', null, hx, hy, 8);
      // 吼聲：從嘴巴往右擴散的一圈圈聲波＋放射線
      cg.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const p = ((st / 650 + i / 4) % 1);
        cg.globalAlpha = 1 - p; cg.strokeStyle = '#fff3c0'; cg.lineWidth = 6 - p * 3;
        cg.beginPath(); cg.arc(mx, my, 24 + p * 200, -0.55, 0.55); cg.stroke();
      }
      cg.globalAlpha = 0.9; cg.strokeStyle = '#ffd84a'; cg.lineWidth = 4;
      for (let i = 0; i < 5; i++) {
        const a = -0.5 + i * 0.25, flick = 0.6 + 0.4 * Math.abs(Math.sin(t / 70 + i * 2));
        cg.beginPath(); cg.moveTo(mx + Math.cos(a) * 30, my + Math.sin(a) * 30);
        cg.lineTo(mx + Math.cos(a) * (30 + 70 * flick), my + Math.sin(a) * (30 + 70 * flick)); cg.stroke();
      }
      cg.globalAlpha = 1;
      // 頭上冒的怒氣符號（四個角朝外的紅色折線，一跳一跳）
      const ax = hx + 116, ay = hy + 4, s = 1 + 0.25 * Math.abs(Math.sin(t / 120));
      cg.strokeStyle = '#ff3a3a'; cg.lineWidth = 5;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = ax + dx * 9 * s, cy = ay + dy * 9 * s;
        cg.beginPath(); cg.moveTo(cx, cy + dy * 9 * s); cg.lineTo(cx, cy); cg.lineTo(cx + dx * 9 * s, cy); cg.stroke();
      }
      // 頭頂冒煙
      for (let i = 0; i < 4; i++) {
        const p = ((st / 900 + i / 4) % 1);
        cg.globalAlpha = (1 - p) * 0.6; cg.fillStyle = '#d8d0d0';
        cg.beginPath(); cg.arc(hx + 40 + i * 14 + Math.sin(p * 6 + i) * 6, hy - 6 - p * 70, 6 + p * 8, 0, Math.PI * 2); cg.fill();
      }
      cg.globalAlpha = 1;
    },
    // 吼完之後：國王愣住退進黑暗、爐火一點一點熄掉，只剩心跳。白天的笑聲和國王的嘮叨在他身邊打轉、
    // 一句句鑽進胸口；腳下的影子越拉越長，最後自己站了起來，比他高出一倍，睜開紅色的眼睛
    forgeShadow: t => {
      const st = t - cineT0;
      const fx = 170 + 64, fy = SIZE - 122;                                   // 阿爾特腳底中央
      const beat = heartbeatAt(st);                                           // 0～1，心跳那一下最亮
      const amp = st < 600 ? 4 * (1 - st / 600) : beat * 2;
      cg.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
      drawForgeNight(t);
      // 爐火熄掉：蓋一層黑把爐光吃掉
      const fireOut = Math.min(1, st / 2600);
      cg.fillStyle = `rgba(6,4,12,${0.55 * fireOut})`; cg.fillRect(0, 0, SIZE, SIZE);
      // 國王愣在原地、慢慢退進黑暗裡
      const kingA = Math.max(0, 1 - st / 1300);
      if (kingA > 0) { cg.globalAlpha = kingA; bigSprite('bard', null, 370 + (1 - kingA) * 30, SIZE - 250, 8); cg.globalAlpha = 1; }
      // 四周越來越暗，只剩阿爾特身上一圈紅光跟著心跳（先畫，影子才會從紅光裡浮出來）
      const dark = Math.min(0.85, st / 3200);
      const vg = cg.createRadialGradient(fx, fy - 70, 60, fx, fy - 70, 420);
      vg.addColorStop(0, 'rgba(6,4,12,0)'); vg.addColorStop(1, `rgba(6,4,12,${dark})`);
      cg.fillStyle = vg; cg.fillRect(0, 0, SIZE, SIZE);
      const red = cg.createRadialGradient(fx + 20, fy - 140, 10, fx + 20, fy - 140, 260 + beat * 50);
      red.addColorStop(0, `rgba(255,40,40,${0.22 + 0.33 * beat})`); red.addColorStop(1, 'rgba(255,40,40,0)');
      cg.fillStyle = red; cg.fillRect(0, 0, SIZE, SIZE);
      // 影子：先躺在地上往右拉長，再從腳底立起來，長到兩倍多高
      const grow = Math.min(1, Math.max(0, (st - 900) / 1700));
      const q0 = Math.min(1, Math.max(0, (st - 2600) / 1500)), q = q0 * q0 * (3 - 2 * q0);
      const L = 40 + 200 * grow;
      const W = 1 + 0.45 * q, kx = -(L / 128) * (1 - q), ky = 0.1 * (1 - q) + 2.3 * q;
      const sil = silhouette('heroSideAngry', 8, '#06040c'), rim = silhouette('heroSideAngry', 8, '#8a2240');
      const wob = Math.sin(t / 160) * 2;
      cg.save();
      cg.translate(fx, fy); cg.transform(W, 0, kx + wob * 0.004, ky, 0, 0);
      cg.globalAlpha = 0.25 + 0.5 * q + 0.25 * beat * q;                    // 站起來之後，邊上透出一圈暗紅
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -1.5], [0, 1]]) cg.drawImage(rim, -64 + dx, -128 + dy);
      cg.globalAlpha = 0.35; cg.drawImage(sil, -64 - 3, -128 - 2);   // 糊開的邊，看起來像煙
      cg.drawImage(sil, -64 + 3, -128 + 1);
      cg.globalAlpha = 0.95; cg.drawImage(sil, -64, -128);
      cg.restore();
      // 站起來之後往上散的黑煙
      for (let i = 0; i < 16 && q > 0; i++) {
        const p = ((t / 1900 + i / 16) % 1);
        const x = fx + (i % 2 ? 1 : -1) * (30 + (i * 17) % 60) * W, y = fy - ky * 128 * (0.25 + (i * 7 % 10) / 14) - p * 60;
        cg.globalAlpha = (1 - p) * 0.6 * q; cg.fillStyle = '#06040c';
        cg.beginPath(); cg.arc(x, y, 8 + p * 12, 0, Math.PI * 2); cg.fill();
      }
      cg.globalAlpha = 1;
      bigSprite('heroSideAngry', null, 170 + Math.sin(t / 30) * 1.5 * (0.4 + beat), SIZE - 250, 8);
      // 腦海裡的聲音：笑聲和國王的話在他身邊轉，越轉越近，最後鑽進胸口
      const echoes = MT.story('rage_echo').split('|');
      cg.textAlign = 'center';
      for (let i = 0; i < 12; i++) {
        const t0 = 300 + i * 330, life = 1900, p = (st - t0) / life;
        if (p < 0 || p > 1) continue;
        const a = i * 2.4 + p * 1.6, r = 230 * (1 - p * p);
        const x = fx + Math.cos(a) * r, y = fy - 80 + Math.sin(a) * r * 0.55;
        cg.globalAlpha = Math.sin(p * Math.PI) * 0.9;
        cg.fillStyle = i % 3 === 0 ? '#fff3c0' : '#ff7a6a';
        cg.font = `bold ${Math.round(18 + (1 - p) * 14)}px sans-serif`;
        cg.fillText(echoes[i % echoes.length], x, y);
      }
      cg.globalAlpha = 1;
      // 影子的頭上睜開兩隻紅眼，再浮出一抹白色的笑（面具的前兆）
      if (q > 0.85) {
        const open = Math.min(1, (st - 4000) / 400), hy = fy - ky * 88;
        if (open > 0) {
          cg.globalCompositeOperation = 'lighter';
          for (const u of [-6, 26]) {
            const ex = fx + u * W;
            cg.fillStyle = `rgba(255,58,106,${0.45 * open})`; cg.beginPath(); cg.arc(ex, hy, 18, 0, Math.PI * 2); cg.fill();
            cg.fillStyle = `rgba(255,120,150,${open})`; cg.fillRect(ex - 9, hy - 3 * open, 18, 6 * open);
          }
          cg.globalCompositeOperation = 'source-over';
        }
        const smile = Math.min(1, Math.max(0, (st - 4700) / 600));
        if (smile > 0) {
          cg.strokeStyle = `rgba(239,234,220,${smile * 0.9})`; cg.lineWidth = 5; cg.lineCap = 'round';
          cg.beginPath(); cg.arc(fx + 10 * W, hy + 22, 34, 0.25 * Math.PI, 0.75 * Math.PI); cg.stroke();
        }
      }
    },
    maestro: t => {
      const { tip, lift } = drawMaestroRise(t);
      // 指揮棒舉起之後，滿天的音符被捲向棒尖、越靠近越暗
      if (lift <= 0) return;
      cg.font = 'bold 24px serif'; cg.textAlign = 'center';
      for (let i = 0; i < 24; i++) {
        const p = ((t / 1600 + i / 24) % 1);
        const a = i * 0.9 + p * 6;
        const r = 260 * (1 - p);
        cg.globalAlpha = Math.sin(p * Math.PI) * lift; cg.fillStyle = ['#ffe066', '#aef4ff', '#ff9ccc'][i % 3];
        cg.fillText('♪♫♬♩'[i % 4], tip[0] + Math.cos(a) * r, tip[1] + Math.sin(a) * r * 0.6);
      }
      cg.globalAlpha = 1;
    },
    // 一夜過去：天空從深夜慢慢亮成清晨，高塔一路震動著從鎮中央的地底長出來，長好了窗戶才一格格亮起
    tower: t => {
      const st = t - cineT0;
      const sky = Math.min(1, st / 4200);
      drawSky(t, mixColor('#05040c', '#3a4060', sky), mixColor('#170c24', '#c89a7a', sky));
      cg.globalAlpha = 1 - sky; drawStars(t); cg.globalAlpha = 1;
      const g = Math.min(1, Math.max(0, (st - 600) / 3200)), e = 1 - Math.pow(1 - g, 3);
      const growing = g > 0 && g < 1;
      if (growing) cg.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
      cg.save();
      cg.beginPath(); cg.rect(0, 0, SIZE, SIZE - 40); cg.clip();             // 地面以下的部分還埋在土裡
      cg.translate(0, (1 - e) * (SIZE - 20));
      drawTower(t, SIZE / 2, 120, '#0e0b16', g < 1 ? 0 : Math.floor((st - 3800) / 160));
      cg.restore();
      // 塔往上頂的時候，地面噴出的塵土
      if (growing) for (let i = 0; i < 14; i++) {
        const p = ((st / 700 + i / 14) % 1), side = i % 2 ? 1 : -1;
        cg.globalAlpha = (1 - p) * 0.5 * (1 - g); cg.fillStyle = '#4a3e4e';
        cg.beginPath(); cg.arc(SIZE / 2 + side * (50 + p * 90 + (i * 11) % 30), SIZE - 50 - p * 60, 8 + p * 14, 0, Math.PI * 2); cg.fill();
      }
      cg.globalAlpha = 1;
      drawTown(t);
    },
    meet: t => {
      drawSky(t, '#3a4060', '#c89a7a'); drawTower(t, SIZE / 2 + 120, 80, '#0e0b16');
      cg.fillStyle = '#4a3a3a'; cg.fillRect(0, SIZE - 90, SIZE, 90);
      // 先是阿爾特第一次看到塔：嚇得往後一縮、頭上冒驚嘆號、冷汗直流（1.2 秒）。
      // 接著多蕾出場：先是一點光，四周的光點往它聚過去、越來越亮，然後「啵」地彈出來（約 1.3 秒）
      // 一開始先從左邊走進場（MEET_WALK 毫秒，3.2.17 Ken 指定），走到定點抬頭看到塔才嚇到
      const raw = t - cineT0 - MEET_WALK, st = raw - 1200;
      if (raw < 0) {
        const k = 1 + raw / MEET_WALK, foot = Math.floor((t - cineT0) / 140) % 2 ? 'A' : 'B';
        bigSprite(MT.heroSprite('side', foot, 0, '', ''), null, -130 + 220 * k, SIZE - 90 - 128 - (foot === 'A' ? 4 : 0), 8);
        return;
      }
      const fx = 300, fy = SIZE - 300 + Math.sin(t / 250) * 12, fc = [fx + 56, fy + 56];
      const shown = st >= 1300;
      const flinch = raw < 350 ? Math.sin(raw / 350 * Math.PI) : 0;
      const hx = 90 - flinch * 14, hy = SIZE - 90 - 128 - flinch * 18;
      bigSprite(cinePose || (shown ? 'heroSideShock' : 'heroSideScared'), null, hx, hy, 8);   // 腳踩在地面上緣；看到塔先嚇到，多蕾冒出來再傻眼
      if (!cinePose && !shown) {
        if (raw > 120 && raw < 1300) {                                         // 頭上的驚嘆號，彈一下才定住
          const pop = Math.min(1, (raw - 120) / 140), s = 1 + 0.4 * (1 - pop);
          cg.globalAlpha = raw > 1100 ? (1300 - raw) / 200 : 1;
          cg.fillStyle = '#ffe066'; cg.strokeStyle = '#1b1a26'; cg.lineWidth = 5; cg.lineJoin = 'round';
          cg.font = `900 ${Math.round(64 * s)}px sans-serif`; cg.textAlign = 'center';
          cg.strokeText('!', hx + 108, hy - 4); cg.fillText('!', hx + 108, hy - 4);
          cg.globalAlpha = 1;
        }
        const p = (raw % 900) / 900;                                           // 額頭滑下來的冷汗
        cg.globalAlpha = 1 - p; cg.fillStyle = '#aef4ff';
        cg.fillRect(hx + 66, hy + 32 + p * 22, 7, 10); cg.fillRect(hx + 68, hy + 27 + p * 22, 3, 5);
        cg.globalAlpha = 1;
      }
      if (cineDots) {                                                          // 無言：頭上的泡泡裡「・・・」一顆一顆冒，後腦杓滑下一大滴汗
        const d = t - cineDots, bx = hx + 132, by = hy - 54;
        cg.fillStyle = '#f4f1ff'; cg.strokeStyle = '#1b1a26'; cg.lineWidth = 4;
        cg.beginPath(); cg.ellipse(bx, by, 50, 26, 0, 0, Math.PI * 2); cg.fill(); cg.stroke();
        cg.beginPath(); cg.arc(bx - 46, by + 32, 7, 0, Math.PI * 2); cg.fill(); cg.stroke();
        cg.beginPath(); cg.arc(bx - 58, by + 46, 4, 0, Math.PI * 2); cg.fill(); cg.stroke();
        cg.fillStyle = '#1b1a26';
        for (let i = 0; i < Math.min(3, Math.floor(d / 400) + 1); i++) cg.fillRect(bx - 26 + i * 22, by - 4, 9, 9);
        {                                                                      // 汗跟「・・・」同時開始（3.2.33 Ken 指定，原本晚 1.3 秒）
          const q = Math.min(1, d / 1200), sx = hx + 10, sy = hy + 8 + q * 26;
          cg.fillStyle = '#aef4ff'; cg.strokeStyle = '#1b1a26'; cg.lineWidth = 3;
          cg.beginPath(); cg.moveTo(sx, sy - 22); cg.quadraticCurveTo(sx + 13, sy, sx, sy + 8); cg.quadraticCurveTo(sx - 13, sy, sx, sy - 22); cg.fill(); cg.stroke();
        }
      }
      if (st < 0) return;
      if (st < 1000) {
        const k = st / 1000;
        const glow = cg.createRadialGradient(fc[0], fc[1], 0, fc[0], fc[1], 10 + k * 50);
        glow.addColorStop(0, `rgba(255,246,176,${0.4 + 0.6 * k})`); glow.addColorStop(1, 'rgba(255,224,102,0)');
        cg.fillStyle = glow; cg.beginPath(); cg.arc(fc[0], fc[1], 10 + k * 50, 0, Math.PI * 2); cg.fill();
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2 + k * 2, r = (1 - k) * 140 + 6;
          cg.globalAlpha = Math.min(1, k * 3); cg.fillStyle = i % 2 ? '#fff6b0' : '#aef4ff';
          cg.fillRect(fc[0] + Math.cos(a) * r - 3, fc[1] + Math.sin(a) * r - 3, 6, 6);
        }
        cg.globalAlpha = 1;
      } else {
        const p = Math.min(1, (st - 1000) / 300);
        const sc = p < 1 ? 0.3 + 0.85 * p : 1 + Math.max(0, 0.15 - (st - 1300) / 1000);   // 彈出來時稍微放大再縮回
        const img = MT.sprite('fairy', null, 7);
        cg.globalAlpha = p;
        cg.drawImage(img, fc[0] - 56 * sc, fc[1] - 56 * sc, 112 * sc, 112 * sc);
        cg.globalAlpha = 1;
        if (st < 1700) {                                                       // 彈出瞬間的白光圈
          const q = (st - 1000) / 700;
          cg.globalAlpha = 1 - q; cg.strokeStyle = '#fff6b0'; cg.lineWidth = 6 * (1 - q) + 1;
          cg.beginPath(); cg.arc(fc[0], fc[1], 30 + q * 120, 0, Math.PI * 2); cg.stroke();
          cg.globalAlpha = 1;
        }
        for (let i = 0; i < 6; i++) { cg.fillStyle = '#fff6b0'; cg.fillRect(360 + Math.cos(t / 300 + i) * 60, SIZE - 240 + Math.sin(t / 200 + i * 2) * 50, 4, 4); }
      }
    },
    // 進塔前的第一人稱（Ken 指定）：慢慢走到大門前、心跳；兩隻手伸出來推門，先嘎一聲開一條縫、停住，
    // 再整扇嘎吱嘎吱往裡推開、撞上牆；門後一片漆黑，最後鏡頭往黑暗裡衝進去
    gate: t => {
      const s = t - cineT0, ease = k => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
      const crack = ease((s - 2000) / 450) * 0.1;                     // 2.0 秒：先開一條縫
      const swing = ease((s - 2900) / 1300);                          // 2.9～4.2 秒：整扇推開
      const open = crack + (1 - 0.1) * swing;
      const dive = Math.max(0, (s - 4500) / 1000);                    // 4.5 秒起往裡衝
      const zoom = 1 + 0.14 * ease(s / 1800) + dive * dive * 2.2;
      const bob = s < 4300 ? Math.sin(s / 430) * 4 : 0;               // 走路／喘氣的上下晃
      cg.fillStyle = '#000'; cg.fillRect(0, 0, SIZE, SIZE);
      cg.save();
      if ((s > 2000 && s < 2450) || (s > 2900 && s < 4300)) cg.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2);
      cg.translate(SIZE / 2, SIZE / 2 + 30 + bob); cg.scale(zoom, zoom); cg.translate(-SIZE / 2, -SIZE / 2 - 30);
      // 塔的外牆：石磚
      cg.fillStyle = '#1b1526'; cg.fillRect(-40, -40, SIZE + 80, SIZE + 80);
      cg.fillStyle = '#130f1c';
      for (let y = -40; y < SIZE + 40; y += 24) { cg.fillRect(-40, y, SIZE + 80, 3); for (let x = ((y / 24) % 2) * 28 - 40; x < SIZE + 40; x += 56) cg.fillRect(x, y, 3, 24); }
      const L = 144, R = 384, T = 196, cx = (L + R) / 2, half = (R - L) / 2;
      // 門框與拱頂
      cg.fillStyle = '#3a3048'; cg.fillRect(L - 22, T - 8, 22, SIZE); cg.fillRect(R, T - 8, 22, SIZE);
      cg.beginPath(); cg.arc(cx, T, half + 22, Math.PI, 0); cg.fill();
      cg.fillStyle = '#241c30'; cg.beginPath(); cg.arc(cx, T, half, Math.PI, 0); cg.fill();
      // 拱頂中央一顆被封住的音符，跟著心跳一明一暗
      cg.globalAlpha = 0.55 + 0.35 * Math.sin(s / 260); cg.fillStyle = '#c07cf5';
      cg.font = 'bold 54px serif'; cg.textAlign = 'center'; cg.fillText('♪', cx, T - 34); cg.globalAlpha = 1;
      // 門後：漆黑，深處一點紫光，音符被吸進去
      cg.fillStyle = '#000'; cg.fillRect(L, T, R - L, SIZE);
      const gl = cg.createRadialGradient(cx, T + 160, 2, cx, T + 160, 120);
      gl.addColorStop(0, `rgba(150,80,210,${0.3 * open})`); gl.addColorStop(1, 'rgba(150,80,210,0)');
      cg.fillStyle = gl; cg.fillRect(L, T, R - L, SIZE);
      if (open > 0.05) {
        cg.font = 'bold 22px serif';
        for (let i = 0; i < 10; i++) {
          const p = (s / 1400 + i / 10) % 1, a = i * 2.1;
          cg.globalAlpha = Math.sin(p * Math.PI) * open * 0.8; cg.fillStyle = ['#ffe066', '#aef4ff', '#ff9ccc'][i % 3];
          cg.fillText('♪♫♬♩'[i % 4], cx + Math.cos(a) * 110 * (1 - p), T + 150 + Math.sin(a) * 70 * (1 - p));
        }
        cg.globalAlpha = 1;
      }
      // 兩扇門往裡開：門縫那一邊往後退、變窄變矮（透視）
      const ang = open * 1.35;
      for (const side of [-1, 1]) {
        const hinge = side < 0 ? L : R, w = half * Math.cos(ang), edge = hinge - side * w, shrink = 1 - 0.28 * Math.sin(ang);
        const et = T + (1 - shrink) * 120, eb = SIZE + 40 - (1 - shrink) * 140;
        cg.fillStyle = mixColor('#4a3226', '#2a1c16', open);
        cg.beginPath(); cg.moveTo(hinge, T - 4); cg.lineTo(edge, et); cg.lineTo(edge, eb); cg.lineTo(hinge, SIZE + 40); cg.closePath(); cg.fill();
        cg.strokeStyle = 'rgba(0,0,0,0.45)'; cg.lineWidth = 3;      // 木板縫
        for (let k = 1; k < 4; k++) { const x = hinge + (edge - hinge) * k / 4; cg.beginPath(); cg.moveTo(x, T - 4 + (et - T + 4) * k / 4); cg.lineTo(x, SIZE + 40 - (SIZE + 40 - eb) * k / 4); cg.stroke(); }
        cg.fillStyle = '#1e1b1a';                                     // 兩道鐵箍
        for (const yy of [0.22, 0.62]) {
          const y1 = T + (SIZE - T) * yy, y2 = et + (eb - et) * yy;
          cg.beginPath(); cg.moveTo(hinge, y1 - 9); cg.lineTo(edge, y2 - 9 * shrink); cg.lineTo(edge, y2 + 9 * shrink); cg.lineTo(hinge, y1 + 9); cg.fill();
        }
        if (open < 0.5) {                                             // 門環
          cg.strokeStyle = '#8a7a5a'; cg.lineWidth = 5;
          cg.beginPath(); cg.arc(edge + side * 22, et + (eb - et) * 0.42, 13 * shrink, 0, Math.PI * 2); cg.stroke();
        }
      }
      // 開縫那一下：一條紫色的細光
      if (open > 0 && open < 0.3) {
        cg.globalAlpha = (0.3 - open) / 0.3 * 0.9; cg.fillStyle = '#d6a6ff';
        cg.fillRect(cx - 2, T, 4, SIZE - T); cg.globalAlpha = 1;
      }
      // 灰塵從拱頂掉下來
      if (s > 2000) for (let i = 0; i < 18; i++) {
        const p = ((s - 2000) / 1600 + i / 18) % 1;
        cg.globalAlpha = (1 - p) * 0.6 * (s < 4600 ? 1 : 0); cg.fillStyle = '#8a7a8a';
        cg.fillRect(L + ((i * 37) % (R - L)), T - 20 + p * 260, 3, 3);
      }
      cg.globalAlpha = 1;
      cg.restore();
      // 兩隻手（第一人稱，不跟鏡頭縮放）：1.1 秒伸出來貼上門，門開時跟著往兩邊推，3.8 秒後放下
      const up = ease((s - 1100) / 700) - ease((s - 3800) / 600);
      if (up > 0) {
        for (const side of [-1, 1]) {
          const spread = side * (36 + open * 120), hx = SIZE / 2 + spread - 34, hy = SIZE - up * 200 + bob;
          cg.fillStyle = '#2b3d73'; cg.fillRect(hx - 6 + side * 10, hy + 70, 80, 200);       // 袖子
          cg.fillStyle = '#1d2a52'; cg.fillRect(hx - 6 + side * 10, hy + 70, 80, 10);
          cg.fillStyle = '#e8b08a'; cg.fillRect(hx, hy, 68, 76);                             // 手掌
          for (let f = 0; f < 4; f++) cg.fillRect(hx + 2 + f * 17, hy - 26 + (f === 0 || f === 3 ? 8 : 0), 14, 30);   // 手指
          cg.fillRect(side < 0 ? hx + 62 : hx - 14, hy + 22, 20, 30);                       // 大拇指
          cg.fillStyle = '#c48a66'; cg.fillRect(hx, hy + 60, 68, 8);
        }
      }
      // 暗角：越接近開門越重；最後整個沉進黑暗
      const vg = cg.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.2, SIZE / 2, SIZE / 2, SIZE * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.55 + 0.3 * open})`);
      cg.fillStyle = vg; cg.fillRect(0, 0, SIZE, SIZE);
      if (dive > 0) { cg.globalAlpha = Math.min(1, dive * 0.9); cg.fillStyle = '#000'; cg.fillRect(0, 0, SIZE, SIZE); cg.globalAlpha = 1; }
    },
    // 一般結局：聲音回來了，全鎮的人跟阿爾特、國王一起在廣場上唱
    festival: t => {
      drawSky(t, '#5ab0ff', '#ffe0b0');
      cg.fillStyle = '#fff6d0'; cg.beginPath(); cg.arc(430, 80, 40, 0, Math.PI * 2); cg.fill();
      drawTown(t, true);
      drawFolk(t, festFolk.filter(v => v.sc === 3));
      bigSprite('drum', null, 290, SIZE - 180, 6);
      bigSprite('bard', null, 392, SIZE - 190 + (Math.floor(t / 300) % 2) * 4, 5);
      bigSprite('heroDown', null, 120, SIZE - 200 + (Math.floor(t / 250) % 2) * -6, 6);
      bigSprite('fairy', null, 200, SIZE - 290 + Math.sin(t / 250) * 10, 4);
      drawFolk(t, festFolk.filter(v => v.sc === 4));
      bigSprite('frog', null, 14, SIZE - 90, 3);
      floatingNotes(t, 24, SIZE / 2, SIZE - 70, 250, null, 360);
    },
    // 真結局：阿爾特站上舞台中央領唱，音符一圈圈流向他；國王和全鎮的人在台下跟著唱（多蕾已經融進他的聲音，不出現）
    festivalTrue: t => {
      drawSky(t, '#ff9a6a', '#ffe0b0');
      cg.fillStyle = '#fff6d0'; cg.beginPath(); cg.arc(SIZE / 2, 120, 60 + Math.sin(t / 400) * 4, 0, Math.PI * 2); cg.fill();
      drawTown(t, true);
      drawFolk(t, festTrueFolk.filter(v => v.sc === 3));
      cg.fillStyle = '#8a4a3e'; cg.fillRect(SIZE / 2 - 120, SIZE - 110, 240, 30);
      cg.font = 'bold 26px serif'; cg.textAlign = 'center';
      for (let i = 0; i < 20; i++) {
        const p = ((t / 2400 + i / 20) % 1), a = i * 1.3 + t / 1500, r = 240 * (1 - p);
        cg.globalAlpha = Math.sin(p * Math.PI); cg.fillStyle = ['#ffe066', '#aef4ff', '#ff9ccc'][i % 3];
        cg.fillText('♪♫♬♩'[i % 4], SIZE / 2 + Math.cos(a) * r, SIZE - 210 + Math.sin(a) * r * 0.45);
      }
      cg.globalAlpha = 1;
      const wave = Math.floor(t / 350) % 2;
      bigSprite('heroDown', null, SIZE / 2 - 48, SIZE - 210 - wave * 6, 6);
      drawFolk(t, festTrueFolk.filter(v => v.sc === 4));
      bigSprite('drum', null, 40, SIZE - 150, 5);
      bigSprite('bard', null, 400, SIZE - 160 + (Math.floor(t / 300) % 2) * -4, 5);
      bigSprite('frog', null, SIZE - 60, SIZE - 90, 3, true);
    },
  };
  function cineRender() {
    requestAnimationFrame(cineRender);
    if (mode !== 'cine' || !cineScene) return;
    const t = now();
    cg.save(); SCENES[cineScene](t); cg.restore();
  }
  requestAnimationFrame(cineRender);

  function playCine(steps) {
    return new Promise(res => {
      mode = 'cine';
      $('#cine').hidden = false; $('#stage').classList.add('under');
      cineQueue = steps.slice(); cineDone = res;
      cineNext();
    });
  }
  let cineFull = '', cineShowName = null;
  function cineNext() {
    if (endScreen) return;
    if (typing) { clearInterval(typing); typing = null; if (cineShowName) cineShowName(); $('#cineBody').textContent = cineFull; return; }
    const s = cineQueue.shift();
    if (!s) { endCine(); return; }
    if (s.scene && s.scene !== cineScene) MT.Audio.cutSfx();   // 換幕（含略過）：上一幕還沒放完的音效收掉，不拖到下一幕
    if (s.scene) { cineScene = s.scene; cineT0 = now(); cinePose = null; }
    if (s.pose) cinePose = s.pose;
    cineDots = s.dots ? now() : 0;
    if (s.music) MT.Audio.play(s.music, ['base', 'drums', 'strings', 'lead']);
    // sfx：一個音效名（sfxAt＝幾毫秒後才響），或 [[名稱, 毫秒], …] 一串對準畫面時間軸的音效；換場景就不再響
    if (s.sfx) {
      const sc = cineScene;
      for (const [n, at] of Array.isArray(s.sfx) ? s.sfx : [[s.sfx, s.sfxAt || 0]]) {
        if (!at) sfx(n); else setTimeout(() => { if (mode === 'cine' && cineScene === sc) sfx(n); }, at);
      }
    }
    const text = s.text ? MT.story(s.text) : '';
    cineFull = text;
    const tb = $('#cineText');
    tb.classList.toggle('speech', !!s.speaker);
    // 名字跟台詞一起出來：有 delay 的那步（等角色走進來、冒出來）先不顯示是誰在講（3.2.17 Ken 指定）
    const showName = () => { $('#cineName').textContent = s.speaker ? MT.t('speaker_' + s.speaker) : ''; $('#cineName').hidden = !s.speaker; cineShowName = null; };
    if (s.delay) { $('#cineName').hidden = true; cineShowName = showName; } else showName();
    const el = $('#cineBody');
    el.textContent = '';
    clearInterval(typing);
    const chars = Array.from(text);
    let i = 0;
    const type = () => {
      if (cineShowName) cineShowName();
      typing = setInterval(() => {
        i++; el.textContent = chars.slice(0, i).join('');
        if (s.speaker && !s.dots && i % 3 === 1) MT.Audio.voice(s.speaker);   // 每個角色自己的聲音；無言那句不出聲
        if (i >= chars.length) { clearInterval(typing); typing = null; }
      }, s.dots ? 300 : 32);                                                   // 無言的「…」一個一個慢慢冒
    };
    // delay：等畫面演完（例如國王走進來）才開始打字；這段時間點一下就直接顯示全文
    if (s.delay) typing = setTimeout(type, s.delay); else type();
    dialogResolve = null;
  }
  function endCine() {
    clearInterval(typing); typing = null;
    MT.Audio.cutSfx(); cineScene = null;   // 過場結束（含整段略過）：還沒放完的音效不帶進遊戲
    $('#cine').hidden = true; $('#stage').classList.remove('under');
    const r = cineDone; cineDone = null; cineQueue = [];
    if (r) r();
  }
  let endScreen = false;
  $('#cine').addEventListener('pointerdown', e => { if (e.target.id === 'cineSkip' || endScreen) return; e.preventDefault(); MT.Audio.init(); cineNext(); });
  $('#cineSkip').addEventListener('click', e => { e.stopPropagation(); clearInterval(typing); typing = null; cineQueue = cineQueue.filter(s => s.keep); cineNext(); });

  const PROLOGUE = [
    { scene: 'town', text: 'pro_1', music: 'title' },
    { text: 'pro_2' },
    { scene: 'rehearsal', text: 'pro_3', music: 'none', sfx: 'crackLaugh' },
    { scene: 'rehearsalSpot', text: 'pro_3s', sfx: 'laughEcho' },
    { scene: 'flee', text: 'pro_3r', delay: 500, sfx: 'runSteps' },
    { scene: 'firstStrike', text: 'pro_3t', sfx: 'clang', sfxAt: 1500, delay: 2300 },
    { scene: 'forge', text: 'pro_3a', music: 'title' },
    { text: 'pro_3b', speaker: 'smith' },
    { scene: 'forgeKing', text: 'pro_4', speaker: 'bard', delay: 1600,
      sfx: [['footstep', 754], ['footstep', 1131], ['footstep', 1508], ...FORGE_KING_HITS.map(ms => ['anvil', ms])] },   // 對準國王一步一步落地，中間夾著王子的敲鐵聲
    { scene: 'forgeRage', text: 'pro_4b', speaker: 'tink', music: 'none', sfx: 'boom' },
    // 心跳＋腦海裡的聲音一陣陣耳語（對準那些話出現），影子睜眼那一刻一記低音
    { scene: 'forgeShadow', text: 'pro_4c', delay: 900,
      sfx: [['heartbeat', 0], ...[300, 960, 1620, 2280, 2940, 3600].map(ms => ['whisper', ms]), ['eyesOpen', 4000]] },
    { scene: 'maestro', text: 'pro_5', sfx: [['shadowRise', 0], ['silence', 1600], ['evilLaugh', MAESTRO_LAUGH]] },   // 從影子裡長出來；1.6 秒舉起指揮棒，聲音全被吸走
    { scene: 'tower', text: 'pro_6', delay: 2400, sfx: 'towerRise', sfxAt: 600 },     // 塔 0.6 秒開始往上長
    // 先走進場（腳步聲對準每一步）；站定後頭上冒「！」；1.2 秒起光點聚過去、2.2 秒多蕾彈出來，彈出來後名字和台詞才出現
    { scene: 'meet', text: 'pro_7', speaker: 'doremi', delay: MEET_WALK + 2700,
      sfx: [...[140, 420, 700, 980, 1260].map(ms => ['footstep', ms]), ['startle', MEET_WALK + 120], ['fairyPop', MEET_WALK + 1200]] },
    { text: 'pro_8', speaker: 'tink' },
    { text: 'pro_9', speaker: 'doremi' },
    { text: 'pro_10', speaker: 'tink', pose: 'heroSideGuilty' },
    { text: 'pro_11', speaker: 'doremi' },
    { text: 'pro_11b', speaker: 'tink', pose: 'heroSideSulk', dots: true },   // 被叫「小鐵」先無言一拍，才回嘴
    { text: 'pro_12', speaker: 'tink' },
    // 第一人稱推開塔門：心跳一路響；2.0 秒開一條縫、2.9 秒整扇推開、4.2 秒撞上牆；演完才出字
    { scene: 'gate', text: 'pro_13', music: 'none', delay: 4600,
      sfx: [['gateHeart', 0], ['doorCreak', 2000], ['doorGroan', 2900], ['doorThud', 4200]] },
  ];

  /* ───────── 標題畫面 ───────── */
  const titleCanvas = $('#titleCanvas');
  titleCanvas.width = titleCanvas.height = SIZE;
  const tg = titleCanvas.getContext('2d');
  tg.imageSmoothingEnabled = false;
  function titleRender() {
    requestAnimationFrame(titleRender);
    if (mode !== 'title') return;
    const t = now();
    const gr = tg.createLinearGradient(0, 0, 0, SIZE);
    gr.addColorStop(0, '#0b0a1c'); gr.addColorStop(1, '#2a1a44');
    tg.fillStyle = gr; tg.fillRect(0, 0, SIZE, SIZE);
    for (const [x, y, s] of stars) { tg.fillStyle = `rgba(255,255,255,${0.3 + 0.4 * Math.sin(t / 600 + x)})`; tg.fillRect(x, y * 1.4, s, s); }
    tg.fillStyle = '#07060e';
    const cx = SIZE / 2;
    tg.fillRect(cx - 60, 150, 120, SIZE);
    tg.beginPath(); tg.moveTo(cx - 76, 160); tg.lineTo(cx, 70); tg.lineTo(cx + 76, 160); tg.fill();
    tg.fillStyle = '#c07cf5';
    for (let i = 0; i < 7; i++) { tg.globalAlpha = 0.5 + 0.5 * Math.sin(t / 700 + i); tg.fillRect(cx - 7, 190 + i * 48, 14, 20); }
    tg.globalAlpha = 1;
    tg.drawImage(MT.sprite('heroUp', null, 4), cx - 32, SIZE - 80);
    tg.drawImage(MT.sprite('fairy', null, 3), cx + 30, SIZE - 120 + Math.sin(t / 300) * 6);
    drawNotes(t);
  }
  requestAnimationFrame(titleRender);

  /* 標題音符：畫在另一張全解析度 canvas 上。背景那張只有 528px、被放大 3 倍多，
     音符畫在那上面每動一格就跳 3～4 個螢幕像素，放慢了反而一頓一頓的，漂不起來 */
  const noteCanvas = $('#titleNotes');
  const ng = noteCanvas.getContext('2d');
  const NOTE_COLORS = ['#ffe066', '#aef4ff', '#ff9ccc', '#d9b8ff'];
  const floatNotes = [];
  let noteW = 0, noteH = 0;
  function newNote(t, prefill) {
    const r = Math.random, life = 26000 + r() * 14000;          // 一趟 26～40 秒
    return {
      born: prefill ? t - r() * life : t, life,
      x: 0.04 + r() * 0.92,                                    // 起點（畫面寬的比例）
      sw1: 40 + r() * 70, sp1: 9000 + r() * 7000,              // 兩層不同週期的左右擺盪疊起來，軌跡才不會像鐘擺
      sw2: 12 + r() * 22, sp2: 3500 + r() * 2500,
      ph: r() * 6.3, breath: 1 + Math.floor(r() * 2),          // 上升速度一趟裡快慢起伏 1～2 次
      size: 22 + r() * 20, rot: 0.15 + r() * 0.2,
      glyph: '♪♫♬♩'[Math.floor(r() * 4)], color: NOTE_COLORS[Math.floor(r() * NOTE_COLORS.length)],
      alpha: 0.45 + r() * 0.35,
    };
  }
  function drawNotes(t) {
    const w = noteCanvas.clientWidth, h = noteCanvas.clientHeight, dpr = window.devicePixelRatio || 1;
    if (w !== noteW || h !== noteH) {
      noteW = w; noteH = h;
      noteCanvas.width = w * dpr; noteCanvas.height = h * dpr;
    }
    ng.setTransform(dpr, 0, 0, dpr, 0, 0);
    ng.clearRect(0, 0, w, h);
    const want = Math.round(Math.min(16, Math.max(8, w / 110)));
    while (floatNotes.length < want) floatNotes.push(newNote(t, true));
    ng.textAlign = 'center'; ng.textBaseline = 'middle';
    for (let i = 0; i < floatNotes.length; i++) {
      let n = floatNotes[i];
      if (t - n.born > n.life) n = floatNotes[i] = newNote(t, false);
      const age = t - n.born, p = age / n.life;
      // 上升不等速：p 疊一個正弦，速度在 0.6～1.4 倍之間緩慢起伏，像被氣流托著
      const k = n.breath * 2 * Math.PI, rise = p - Math.sin(p * k) * 0.4 / k;
      const y = h + 40 - rise * (h + 100);
      const x = n.x * w + Math.sin(age / n.sp1 + n.ph) * n.sw1 + Math.sin(age / n.sp2 + n.ph * 2) * n.sw2;
      const fade = Math.pow(Math.sin(p * Math.PI), 1.4);       // 淡入淡出比線性柔
      const s = n.size * (1.1 - 0.35 * p);                      // 越飄越小，像往遠處去
      ng.save();
      ng.translate(x, y);
      ng.rotate(Math.sin(age / (n.sp1 * 0.7) + n.ph) * n.rot);
      ng.globalAlpha = fade * n.alpha;
      ng.shadowColor = n.color; ng.shadowBlur = s * 0.6;
      ng.fillStyle = n.color;
      ng.font = `bold ${s.toFixed(1)}px serif`;
      ng.fillText(n.glyph, 0, 0);
      ng.restore();
    }
  }

  function renderTitle() {
    $('#tTitle').textContent = MT.t('title');
    $('#tSub').textContent = MT.t('subtitle');
    const auto = latestAuto();
    const cont = $('#tContinue');
    cont.hidden = !auto;
    cont.innerHTML = `${esc(MT.t('continue'))}${auto ? `<small>${slotLine(auto)}</small>` : ''}`;
    $('#tNew').textContent = MT.t('newGame');
    $('#tLoad').textContent = MT.t('load');
    $('#tTutorial').textContent = MT.t('tutorial');
    $('#tSettings').textContent = MT.t('settings');
    const best = MT.Sync.best();
    $('#tBest').hidden = !best;
    if (best) { $('#tBest').textContent = MT.t('rateBest', { g: best.data.grade, score: best.data.score }); $('#tBest').dataset.g = best.data.grade; }
    renderCloudChip();
    $('#tVer').textContent = versionText();
  }
  function showTitle() {
    mode = 'title'; st = null; busy = 0;
    setLook(false);
    $('#title').hidden = false; $('#stage').classList.add('under');
    $('#dialog').hidden = true;
    renderTitle();
    MT.Audio.play('title', ['base', 'drums', 'strings', 'winds', 'lead']);
    MT.Sync.pull().then(() => { if (mode === 'title') renderTitle(); });
  }
  $('#tContinue').addEventListener('click', () => { MT.Audio.init(); const a = latestAuto(); if (a) startGame(MT.unpack(a.data)); });
  $('#tNew').addEventListener('click', async () => {
    MT.Audio.init();
    if (MT.Sync.myAuto() && await ask(MT.t('confirmNew'), [{ key: 'n', label: MT.t('no') }, { key: 'y', label: MT.t('yes') }]) !== 'y') return;
    $('#title').hidden = true;
    await playCine(PROLOGUE);
    const s = MT.newGame();
    startGame(s, true);
  });
  $('#tLoad').addEventListener('click', () => { MT.Audio.init(); openSaves(true); });
  $('#tTutorial').addEventListener('click', () => { MT.Audio.init(); openTutorial(true); });
  $('#hHelp').addEventListener('click', () => { sfx('select'); openTutorial(); });
  $('#tSettings').addEventListener('click', () => { MT.Audio.init(); openSettings(); });
  $('#tCloud').addEventListener('click', () => { MT.Audio.init(); openCloud(); });

  function startGame(s, fresh) {
    st = MT.migrate(s);
    tutCatchUp();
    hudGen++; for (const k of HUD_KEYS) hudHold[k] = 0;   // 上一局還在飛的數字不要帶過來
    mode = 'game'; busy = 0;
    $('#title').hidden = true; $('#cine').hidden = true; $('#stage').classList.remove('under');
    view.fairy = false; view.move = null; view.dying = null; view.fx = []; view.fade = 0; view.fadeTo = 0; view.fadeCur = 0;
    view.tier = null;   // 讀進來的存檔本來就強的話，不要當成剛變身
    autoPath = null; clearRoute(); setLook(false);
    playClock = Date.now();
    renderHud();
    playMusic(musicFor());
    if (fresh) {
      // 推開塔門之後：畫面從全黑慢慢亮起來（3 秒），資訊列和下方按鈕晚一點才浮出來；亮完才出樓層字卡和開場對話（Ken 指定）
      const id = MT.stepTrigger(st);
      view.fade = view.fadeCur = view.fadeTo = 1;
      const stage = $('#stage');
      stage.classList.add('enter'); setTimeout(() => stage.classList.remove('enter'), 4500);
      busy++;
      fade(0, 3000).then(() => {
        busy = Math.max(0, busy - 1);
        view.banner = { text: MT.floorName(st.floor), t0: now() }; view.arrowUntil = now() + 2800;
        if (id) setTimeout(() => runScript(id).then(autosave), 900); else autosave();
      });
    } else {
      view.banner = { text: MT.floorName(st.floor), t0: now() }; view.arrowUntil = now() + 2800;
      lastAutoAt = (latestAuto() || {}).at || 0;
    }
  }

  async function startEnding() {
    mode = 'cine';
    await sleep(300);
    const secs = Math.round(st.playMs / 1000);
    const tstr = `${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    const trueEnd = MT.isTrueEnding(st);
    // 評價在演出前算好、記進最佳紀錄，演出中途關掉也不會漏記
    const r = MT.rating(st);
    const newBest = MT.Sync.saveBest(Object.assign({}, r, { playMs: st.playMs, steps: st.steps, kills: st.kills }));
    await playCine(trueEnd ? [
      { scene: 'festivalTrue', text: 'et_1', music: 'ending' },
      { text: 'et_2', keep: true },
      { text: 'et_3', keep: true },
      { text: 'et_4', keep: true },
      { text: 'ed_true_end', keep: true },
    ] : [
      { scene: 'festival', text: 'ed_1', music: 'ending' },
      { text: 'ed_2', keep: true },
      { text: 'ed_3', keep: true },
      { text: 'ed_end', keep: true },
    ]);
    // 通關畫面
    mode = 'cine';
    $('#cine').hidden = false; $('#stage').classList.add('under');
    $('#cineName').hidden = true;
    const rank = `<div class="rank" data-g="${r.grade}"><span class="rankLab">${esc(MT.t('rateTitle'))}</span><span class="rankG">${r.grade}</span>${newBest ? `<span class="rankNew">${esc(MT.t('rateNew'))}</span>` : ''}</div>`
      + `<span class="small">${esc(MT.t('rateCalc', { hp: r.hp, bonus: r.bonus, score: r.score }))}</span><br>`
      + (r.bonus ? `<span class="small">${esc(MT.t('rateBonusHint'))}</span><br>` : '')
      + (r.needTrue ? `<span class="small rankWarn">${esc(MT.t('rateNeedTrue'))}</span><br>` : '');
    $('#cineBody').innerHTML = `<b>${esc(MT.story('ed_thanks'))}</b><br>${rank}<span class="small">${esc(MT.t(trueEnd ? 'endTrue' : 'endNormal'))}　${esc(MT.t('endStats', { t: tstr, s: st.steps, k: st.kills }))}</span><br>${trueEnd ? '' : `<span class="small">${esc(MT.story('ed_hint'))}</span><br>`}<button class="btn primary" id="endBack">${esc(MT.t('backTitle'))}</button>`;
    cineQueue = []; endScreen = true;
    $('#cineSkip').hidden = true;
    $('#endBack').addEventListener('click', e => { e.stopPropagation(); endScreen = false; $('#cineSkip').hidden = false; $('#cine').hidden = true; showTitle(); });
  }

  /* ───────── 啟動 ───────── */
  document.addEventListener('pointerdown', () => MT.Audio.init(), { capture: true });
  setupIcons();
  renderStaticText();
  showTitle();
  // 離線可玩（1.5.0 起 App 也是開線上網址，一樣靠這個離線）
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 不支援就算了 */ });
  }
  /* Android App 呼叫：返回鍵先關視窗；切到背景前存檔上傳 */
  MT.onBack = () => {
    if (!$('#confirm').hidden) { const b = $('#cButtons button'); if (b) b.click(); return true; }
    if (!$('#modal').hidden) { closeModal(); return true; }
    if (mode === 'game' && looking) { setLook(false); return true; }
    if (mode === 'game' && !busy) { openMenu(); return true; }
    return false;
  };
  MT.appPause = () => { stopHold(); if (mode === 'game') autosave(); MT.Sync.push(true); MT.Audio.suspend(); };
  MT.appResume = () => { playClock = Date.now(); MT.Audio.resume(); MT.Sync.pull().then(() => checkCloudNewer()); };

  MT.debug = { get st() { return st; }, set st(v) { st = v; renderHud(); }, runScript, startEnding, startGame, renderHud, playCine };
})();
