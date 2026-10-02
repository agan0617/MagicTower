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
  const settings = Object.assign({ music: 0.2, sfx: 0.2 }, MT.LS.get('settings', {}));
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
  };

  /* ───────── 地圖繪製 ───────── */
  function dmgColor(c) {
    if (c.damage == null || c.damage >= st.hp) return '#ff4a4a';
    if (c.damage === 0) return '#8cff8c';
    if (c.damage < st.hp / 4) return '#ffffff';
    if (c.damage < st.hp / 2) return '#ffe066';
    return '#ffa040';
  }
  function label(text, x, y, color, size) {
    g.font = `bold ${size || 13}px ui-monospace, Menlo, Consolas, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.9)';
    g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
  }
  const fmt = n => (n >= 100000 ? Math.round(n / 1000) + 'k' : String(n));

  function drawTile(code, x, y, t) {
    const px = x * TILE, py = y * TILE;
    const sp = spriteFor(code);
    if (!sp) return;
    const isMon = !!MT.MONSTERS[code];
    let oy = 0;
    if (isMon || MT.NPCS[code]) oy = (Math.floor(t / 420 + x * 0.7 + y * 1.3) % 2) ? -SC : 0;
    if (MT.ITEMS[code]) oy = Math.round(Math.sin(t / 380 + x + y) * 1.5);
    if (view.doorFade && view.doorFade.x === x && view.doorFade.y === y) return;
    const im = MT.sprite(sp[0], sp[1], SC);
    if (isMon && (MT.MONSTERS[code].sp || []).includes('boss')) {
      g.save(); g.globalAlpha = 0.35 + 0.15 * Math.sin(t / 200);
      g.fillStyle = code === 'SR' ? '#5ab0ff' : code === 'DG' ? '#ffd84a' : '#c07cf5';
      g.beginPath(); g.ellipse(px + TILE / 2, py + TILE - 6, 20, 6, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.drawImage(im, px, py + oy);
    if (isMon && st.items.book) {
      const c = MT.calc(st, code);
      const txt = c.damage == null ? '???' : fmt(c.damage);
      label(txt, px + TILE / 2, py + TILE - 1, dmgColor(c), 15);
    }
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
    const name = (d === 'up' ? 'heroUp' : d === 'down' ? 'heroDown' : 'heroSide') + foot;
    const bob = view.move ? (Math.floor(t / 70) % 2 ? -SC : 0) : 0;
    const im = MT.sprite(name, null, SC, d === 'left');
    g.save();
    if (view.hurt > t && Math.floor(t / 50) % 2) g.globalAlpha = 0.35;
    g.drawImage(im, x * TILE + ox, y * TILE + oy + bob);
    g.restore();
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
    const bw = TILE - 10, bh = 6, bx = d.x * TILE + 5, by = d.y > 0 ? d.y * TILE - 8 : d.y * TILE + 1;
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
      const wall = code === '##';
      g.drawImage(MT.terrain(wall ? 'wall' : 'floor', zone, TILE, (x * 7 + y * 13) % 10), x * TILE, y * TILE);
    }
    drawRoute(t);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const code = m[y][x];
      if (code !== '##' && code !== '..') drawTile(code, x, y, t);
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
        const sp = spriteFor(d.code), img = MT.sprite(sp[0], sp[1], SC);
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
        if (lean) { g.translate(px + TILE / 2, py + TILE); g.transform(1, 0, -lean, 1, 0, 0); g.drawImage(img, -TILE / 2, -TILE); }   // 以腳底為軸往勇者那邊斜
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
  function flyGain(key, n, x, y, delay) {
    if (!(n > 0)) return;
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
      el.style.color = { hp: '#8cff8c', atk: '#ff8a80', def: '#8ac8ff', gold: '#ffe066' }[key];
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
        hudHold[key] -= n;
        if (st) target.textContent = hudVal(key);
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
    $('#hFloor').textContent = MT.t('floorN', { n: st.floor });
    for (const k of HUD_KEYS) $(HUD_EL[k]).textContent = hudVal(k);
    const inst = [];
    if (st.items.drum) inst.push(img('drum', null, 'inst'));
    if (st.items.harp) inst.push(img('harp', null, 'inst'));
    if (st.items.note) inst.push(img('goldnote', null, 'inst'));
    $('#hInst').innerHTML = inst.join('');
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
    $('#bLook img').src = icon('lens'); $('#bBook img').src = icon('book'); $('#bFly img').src = icon('feather');
    $('#bSave img').src = icon('page'); $('#bMenu img').src = icon('altar', 'stone');
  }

  /* ───────── 訊息 ───────── */
  let toastTimer = null;
  /* 遊戲中提示（撿到道具等）放在畫面中上方（Ken 指定）：直向放在狀態列和地圖之間的空白，
     空白不夠（或橫向）就貼著地圖上緣、疊在地圖最上面；左右都對齊地圖中線。標題畫面照舊在最上面 */
  function placeToast(el) {
    el.style.top = el.style.left = el.style.maxWidth = '';
    if (mode !== 'game') return;
    const m = $('#mapWrap').getBoundingClientRect(), hud = $('#hud').getBoundingClientRect();
    el.style.left = (m.left + m.width / 2) + 'px';
    el.style.maxWidth = (m.width - 16) + 'px';
    const h = el.offsetHeight, gap = m.top - hud.bottom;
    const wide = matchMedia('(min-aspect-ratio: 5/4)').matches;
    el.style.top = (!wide && gap >= h + 8 ? hud.bottom + (gap - h) / 2 : m.top + 10) + 'px';
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
        if (i % 3 === 1 && speaker) sfx('blip');
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
    if (f === 15 && st.flags['trig:15:f15Intro'] && !st.done) return 'boss';
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
          case 'give':
            MT.applyCmd(st, c);
            if (c[1] === 'book' || c[1] === 'fly' || c[1] === 'drum' || c[1] === 'harp') floatText(st.x, st.y, MT.itemName(c[1]), '#ffe9a8', 15);
            renderHud(); break;
          case 'set':
            MT.applyCmd(st, c);
            if (c[3] === 'M2') { flash('#ffd84a', 600); sparkle(c[1], c[2], 30); }
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
        if (ev.script) { await sleep(110); await runScript(ev.script); autosave(); }
        return !ev.script;
      case 'pickup': {
        view.move = { fx, fy, t0: now(), dur: 95 };
        const it = MT.ITEMS[ev.item];
        const g2 = ev.got;
        if (it.kind === 'key') { sfx('key'); toast(MT.t('got_key_' + it.key)); }
        else if (it.equip) { sfx('item'); toast(MT.t('got_equip', { name: MT.itemName(ev.item), stat: MT.t(it.kind), n: g2.value })); sparkle(ev.x, ev.y, 20); }
        else if (it.kind === 'hp') sfx('potion');
        else if (it.kind === 'atk' || it.kind === 'def') sfx('gem');
        flyGains(before, ev.x, ev.y);   // +N（鑰匙是鑰匙圖）從撿到的地方飛進資訊列
        // 藥水、小劍、小盾也跟鑰匙一樣跳提示（Ken 指定）
        if (['hp', 'atk', 'def'].includes(it.kind) && !it.equip) toast(MT.t('got_' + it.kind, { name: MT.t('name_' + ev.item), n: g2.value }));
        else if (it.kind === 'page') { toast(MT.t('got_page')); }
        else if (it.kind === 'note') { sfx('fanfare'); toast(MT.t('got_note')); sparkle(ev.x, ev.y, 30); }
        renderHud();
        if (ev.script) { await sleep(120); await runScript(ev.script); autosave(); return false; }
        return true;
      }
      case 'door': {
        sfx('door');
        view.doorFade = { x: ev.x, y: ev.y, t0: now(), pal: { y: 'doorY', b: 'doorB', r: 'doorR' }[ev.key] };
        renderHud(); busy++; await sleep(200); busy--;
        return false;
      }
      case 'noKey': sfx('error'); toast(MT.t('needKey_' + ev.key)); return false;
      case 'cantFight': {
        sfx('error');
        const nm = MT.monName(ev.tile);
        toast(ev.calc.damage == null ? MT.t('cantHurtMsg', { name: nm }) : MT.t('cantWin', { name: nm, d: ev.calc.damage }));
        return false;
      }
      case 'fight': await battle(ev, fx, fy, dir); return false;
      case 'stairs': await changeFloor(ev.tile === 'UU'); if (ev.script) await runScript(ev.script); autosave(); return false;
      case 'talk': await runScript(ev.script); autosave(); return false;
      case 'shop': openShop(ev.shop); return false;
      case 'script': await runScript(ev.script); autosave(); return false;
    }
    return false;
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
    view.banner = { text: MT.t('arrive', { n: st.floor }), t0: now() };
    busy--;
  }

  async function battle(ev, fx, fy, dir) {
    busy++;
    clearRoute();   // 開打了，終點光標不用再留在怪物身上
    const c = ev.calc, m = c.m;
    const boss = (m.sp || []).includes('boss');
    const [dx, dy] = DIR_V[dir];
    view.dying = { code: ev.tile, x: ev.x, y: ev.y, t0: now(), dur: 1e9, phase: 'fight', flash: 0, hpMax: m.hp, hp: m.hp, face: [-dx, -dy] };
    const center = (x, y) => [x * TILE + TILE / 2, y * TILE + TILE / 2];
    const fxAt = (kind, [x, y], flip, life) => view.fx.push({ kind, x, y, flip, t0: now(), life });
    /* 每一回合照實演：勇者先打（怪物剩多少血就扣多少），怪物還活著就回擊（先攻＝開打前先打一次、連擊＝一次打兩下）。
       照正常速度演會超過上限（一般 4 回合、Boss 8 回合的長度）時，才把每一下的間隔等比例縮短，整場塞進上限 */
    const sp = m.sp || [];
    const strikes = sp.includes('double') ? 2 : 1;
    const monActs = c.monHit > 0 ? c.turns - 1 + (sp.includes('first') ? 1 : 0) : 0;
    const heroGap0 = boss ? 200 : 130, monGap0 = heroGap0 * 0.85;   // 雙方一來一往要看得出來，比以前慢一點（原本 95／170、怪物 0.7 倍）
    const cap = (boss ? 8 : 4) * (heroGap0 + monGap0);
    const full = c.turns * heroGap0 + monActs * monGap0;
    const k = full > cap ? cap / full : 1;
    const heroGap = Math.max(28, heroGap0 * k), monGap = Math.max(20, monGap0 * k);
    let lastSfx = 0;
    const sfxT = n => { const t = now(); if (k === 1 || t - lastSfx >= 70) { sfx(n); lastSfx = t; } };   // 加速時音效不要疊成一團
    let shown = st.hp + c.damage, monHp = m.hp, heroHits = 0;
    const monAct = async () => {
      for (let s = 0; s < strikes; s++) {
        sfxT('hurt'); view.hurt = now() + 120;
        // 怪物撲向勇者、勇者被打得往後退，身上留三道爪痕
        view.dying.lunge = { t0: now(), dur: Math.max(90, Math.min(160, monGap / strikes + 40)) };
        view.knock = { dx: -dx, dy: -dy, t0: now() };
        fxAt('claw', center(st.x, st.y), s % 2, 260);
        // 每被打一下，勇者頭上也跳紅色扣血數字（Ken 指定，增加戰鬥張力）
        heroHits++;
        floatText(st.x + (heroHits % 2 ? 0.14 : -0.14), st.y > 0 ? st.y - 0.3 : st.y + 0.25, '-' + c.monHit, '#ff6a6a', 14);
        shown = Math.max(st.hp, shown - c.monHit);
        $('#hHp').textContent = shown;
        await sleep(monGap / strikes);
      }
    };
    if (sp.includes('first') && c.monHit > 0) await monAct();
    for (let i = 0; i < c.turns; i++) {
      const hit = Math.min(monHp, c.heroHit);
      monHp -= hit;
      view.dying.hp = monHp;
      view.lunge = { dx, dy, t0: now(), dur: Math.min(140, heroGap) };   // 衝回來了怪物才出手，兩邊不疊在一起
      fxAt('slash', center(ev.x, ev.y), i % 2, 220);
      sfxT('hit');
      view.dying.flash = now() + 120;
      floatText(ev.x + (i % 2 ? 0.14 : -0.14), ev.y > 0 ? ev.y - 0.45 : ev.y + 0.25, '-' + hit, '#ffffff', 14);   // 從血條上面跳（最上面一列改從血條下面）
      if (boss) shake(120, 5);
      await sleep(heroGap);
      if (monHp > 0 && c.monHit > 0) await monAct();
    }
    // 結算
    $('#hHp').textContent = hudVal('hp');
    if (c.damage > 0) floatText(st.x, st.y, '-' + c.damage, '#ff6a6a', 18);
    sfx('kill');
    toast(MT.t(ev.gold ? 'killed' : 'killed0', { name: MT.monName(ev.tile), g: ev.gold }));   // 打倒怪物也跳提示（Ken 指定）；接著開鐵門的話會被「鐵門打開了」蓋過
    view.dying = { code: ev.tile, x: ev.x, y: ev.y, t0: now(), dur: boss ? 900 : 300, phase: 'die', done: true, hpMax: m.hp, hp: 0, shown: view.dying.shown };
    sparkle(ev.x, ev.y, boss ? 60 : 14, boss ? null : ['#ffffff', '#ffe066', '#c8c8d8', '#ffffff']);
    if (boss) { shake(600, 12); flash('#ffffff', 700); sfx('boom'); }
    if (ev.gold) flyGain('gold', ev.gold, ev.x, ev.y, 180);   // 放大、G 緊貼數字，飛進資訊列才加上去（Ken 指定）
    renderHud();
    await sleep(boss ? 800 : 160);
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
  function bfs(tx, ty, pass) {
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
        if ((nx !== tx || ny !== ty) && !pass(m[ny][nx])) continue;
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
  const findPath = (tx, ty) => bfs(tx, ty, c => c === '..') || bfs(tx, ty, c => c === '..' || MT.isItem(c));

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
    const m = MT.MONSTERS[code];
    if (m && !(m.onBump && !st.flags['bump:' + code])) {   // 有劇情的 Boss 第一次碰是播劇情，不算開打
      const c = MT.calc(st, code);
      if (c.damage == null) { refuse(MT.t('cantHurtMsg', { name: MT.monName(code) })); return; }
      if (c.damage >= st.hp) { refuse(MT.t('cantWin', { name: MT.monName(code), d: c.damage })); return; }
      kind = 'fight';
    } else if (MT.DOORS[code]) {
      if (st.keys[MT.DOORS[code]] <= 0) { refuse(MT.t('needKey_' + MT.DOORS[code])); return; }
      kind = 'door';
    }
    route = { cells, kind };
    walkRoute(cells);
  }

  // 光標顏色（r,g,b）：平常白色，走去開打時帶一點淡紅
  const CURSOR_RGB = { walk: '255,255,255', door: '255,255,255', fight: '255,176,176' };
  // 終點光標：圓角方框＋淡淡的內光，約 1.6 秒一次緩慢明暗呼吸（同一般 RPG 的目的地游標）
  function cursor(x, y, rgb, t) {
    const a = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 1600));
    const pad = 3, s = TILE - pad * 2, ox = x * TILE + pad, oy = y * TILE + pad;
    g.save();
    g.beginPath(); g.roundRect ? g.roundRect(ox, oy, s, s, 7) : g.rect(ox, oy, s, s);
    g.fillStyle = `rgba(${rgb},${a * 0.16})`; g.fill();
    g.shadowColor = `rgba(${rgb},${a * 0.8})`; g.shadowBlur = 8;
    g.lineWidth = 2.5; g.strokeStyle = `rgba(${rgb},${a})`; g.stroke();
    g.restore();
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
      else { name = MT.t('name_' + code); desc = MT.t('info_' + it.kind, { n: v }); }
    } else if (n && n.shop === 'keys') { name = MT.t('frog'); desc = MT.t('info_frog', MT.SHOPS.keys); }
    else if (n && n.shop) { const S = MT.SHOPS[n.shop]; name = MT.t(n.shop); desc = MT.t('info_shop', { price: MT.shopPrice(st, n.shop), hp: S.hp, atk: S.atk, def: S.def }); }
    else if (n && n.talk) { name = MT.t('speaker_' + n.talk); desc = MT.t('info_talk'); }
    else return '';
    return `<div class="mon">${img(sp[0], sp[1], 'big')}<div class="mi"><div class="mn">${esc(name)}</div><div class="md">${esc(desc)}</div></div></div>`;
  }
  // 地圖上一格的說明（勇者自己那格不算）；長按和查看模式共用
  const infoAt = (x, y) => x === st.x && y === st.y ? '' : infoRow(st.maps[st.floor][y][x]);
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
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
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
    const sp = (m.sp || []).map(s => `<span class="tag">${esc(MT.t('sp_' + s))}</span>`).join('');
    const dmg = c.damage == null ? `<b class="bad">${esc(MT.t('cantHurt'))}</b>` : c.damage >= st.hp ? `<b class="bad">${c.damage}（${esc(MT.t('willLose'))}）</b>` : `<b style="color:${dmgColor(c)}">${c.damage}</b>`;
    const inv = (m.sp || []).includes('invincible');
    return `<div class="mon">${img(m.sprite, m.pal, 'big')}<div class="mi"><div class="mn">${esc(MT.monName(code))} ${sp}</div>
      <div class="ms">${esc(MT.t('hp'))} ${inv ? '???' : m.hp}　${esc(MT.t('atk'))} ${inv ? '???' : m.atk}　${esc(MT.t('def'))} ${inv ? '???' : m.def}　${esc(MT.t('gold'))} ${m.gold}</div>
      <div class="md">${esc(MT.t('dmg'))}：${dmg}</div></div></div>`;
  }
  function openBook() {
    if (!st || mode !== 'game' || busy) return;
    if (!st.items.book) return;
    const seen = [];
    for (const row of st.maps[st.floor]) for (const c of row) if (MT.MONSTERS[c] && !seen.includes(c)) seen.push(c);
    const rows = seen.map(monRow);
    openModal(MT.t('bookTitle') + ' · ' + MT.t('floorN', { n: st.floor }), rows.length ? rows.join('') : `<p class="muted">${esc(MT.t('noMonsters'))}</p>`);
  }

  function openFly() {
    if (!st || mode !== 'game' || busy) return;
    if (!st.items.fly) { toast(MT.t('flyNeed')); return; }
    let html = '<div class="floors">';
    for (let f = 1; f <= MT.TOP; f++) {
      const ok = st.visited.includes(f);
      html += `<button class="fl ${f === st.floor ? 'cur' : ''}" data-f="${f}" ${ok ? '' : 'disabled'} title="${ok ? '' : esc(MT.t('notVisited'))}">${f}F</button>`;
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
    return `${MT.t('floorN', { n: sl.floor })} · ${esc(MT.t('hp'))} ${sl.hp} · ${esc(dev)} · ${esc(timeAgo(sl.at))}`;
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
    if (id === 'keys') {
      const K = MT.SHOPS.keys;
      const opts = [['y', 'buyY'], ['b', 'buyB'], ['r', 'buyR']].map(([k, lab]) =>
        `<button class="btn opt" data-k="${k}" ${st.gold < K[k] ? 'disabled' : ''}>${img(...spriteFor(KEY_OF[k]))} ${esc(MT.t(lab, { p: K[k] }))}</button>`).join('');
      openModal(MT.t('frog'), `<div class="shopTop">${img('frog', null, 'big')}<p>${esc(MT.t('frogText'))}</p></div><div class="opts">${opts}</div>
        <p class="muted small">${esc(MT.t('gold'))}：${st.gold}</p><button class="btn" data-x>${esc(MT.t('leave'))}</button>`, body => {
        body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
          const before = snapStats();
          if (MT.buy(st, 'keys', b.dataset.k)) { sfx('buy'); flyGains(before, st.x, st.y); renderHud(); closeModal(); openShop('keys'); autosave(); } else { sfx('error'); toast(MT.t('noGold')); }
        }));
        body.querySelector('[data-x]').addEventListener('click', closeModal);
      });
      return;
    }
    const S = MT.SHOPS[id], price = MT.shopPrice(st, id), poor = st.gold < price;
    const opts = [['hp', 'buyHp', S.hp, 'potion', 'red'], ['atk', 'buyAtk', S.atk, 'gemSword', 'gemRed'], ['def', 'buyDef', S.def, 'gemShield', 'gemBlue']].map(([k, lab, n, sp, pal]) =>
      `<button class="btn opt" data-k="${k}" ${poor ? 'disabled' : ''}>${img(sp, pal)} ${esc(MT.t(lab, { n }))}</button>`).join('');
    openModal(MT.t(id), `<div class="shopTop">${img('altar', MT.NPCS[id === 'shop1' ? 'Sh' : 'S2'].pal, 'big')}<p>${esc(MT.t('shopText', { price }))}</p></div>
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
      <button class="btn" data-a="settings">${esc(MT.t('settings'))}</button>
      <button class="btn" data-a="title">${esc(MT.t('backTitle'))}</button></div>`, body => {
      body.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a; closeModal();
        if (a === 'saves') openSaves();
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
      <p class="muted small">${esc(MT.t('controls'))}</p>
      <p class="muted small ver">${esc(versionText())}</p>`, body => {
      body.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
        MT.setLang(b.dataset.l); MT.LS.set('lang', b.dataset.l);
        closeModal(); renderStaticText(); openSettings();
      }));
      body.querySelector('#vMusic').addEventListener('input', e => { settings.music = Number(e.target.value); MT.Audio.setVolume('music', settings.music); MT.LS.set('settings', settings); });
      body.querySelector('#vSfx').addEventListener('input', e => { settings.sfx = Number(e.target.value); MT.Audio.setVolume('sfx', settings.sfx); MT.LS.set('settings', settings); });
      body.querySelector('#vSfx').addEventListener('change', () => sfx('gem'));
    });
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
  function drawForgeNight(t) {
    drawSky(t, '#120c1c', '#3a1a14'); drawStars(t);
    cg.fillStyle = '#2a1a14'; cg.fillRect(0, SIZE - 120, SIZE, 120);
    cg.fillStyle = '#454a58'; cg.fillRect(40, SIZE - 170, 120, 30); cg.fillRect(70, SIZE - 140, 60, 50);
    cg.fillStyle = 'rgba(255,120,40,0.10)'; cg.beginPath(); cg.arc(100, SIZE - 160, 110 + Math.sin(t / 300) * 6, 0, Math.PI * 2); cg.fill();
  }

  /* 序章練唱廳：阿爾特在台上領唱、破音、全場哄笑。st＝場景開始後幾毫秒，laughing＝笑到什麼程度（0～1） */
  const LAUGH_TEXT = { zh: '哈哈', en: 'HA HA', ja: 'ハハ' };
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
    const fy = 96 + (1 - e) * 150 + Math.sin(t / 900) * 5;               // 身體左上角
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
    cg.drawImage(MT.sprite('maestro', null, sc), cx - fw / 2, fy);
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
    // 打鐵鋪：阿爾特臭著臉敲鐵，老鐵匠在他身後看著
    forge: t => {
      drawSky(t, '#2a1810', '#5a2a18');
      cg.fillStyle = '#3a2418'; cg.fillRect(0, SIZE - 120, SIZE, 120);
      cg.fillStyle = '#555a68'; cg.fillRect(270, SIZE - 170, 120, 30); cg.fillRect(300, SIZE - 140, 60, 50);
      bigSprite('smith', null, -4, SIZE - 122 - 144, 9);
      const hit = Math.floor(t / 400) % 2;
      bigSprite('heroSideSulk', null, 150, SIZE - 250 + (hit ? 6 : 0), 8);
      if (hit) for (let i = 0; i < 8; i++) { cg.fillStyle = ['#ffd84a', '#ff9a2e'][i % 2]; cg.fillRect(300 + Math.cos(i + t / 100) * 40, SIZE - 190 - Math.abs(Math.sin(i * 3 + t / 90)) * 50, 5, 5); }
      cg.fillStyle = 'rgba(255,140,40,0.15)'; cg.beginPath(); cg.arc(330, SIZE - 160, 140 + Math.sin(t / 200) * 10, 0, Math.PI * 2); cg.fill();
    },
    // 前一晚：先從黑畫面淡入夜裡的打鐵鋪，國王從右邊走進來唸王子
    forgeKing: t => {
      const st = t - cineT0;
      drawForgeNight(t);
      const k = Math.min(1, Math.max(0, (st - 500) / 1100)), e = 1 - Math.pow(1 - k, 2);
      const step = k > 0 && k < 1 ? Math.abs(Math.sin(st / 120)) * 8 : 0;
      bigSprite('heroSideSulk', null, 170, SIZE - 250, 8);
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
      // 多蕾出場：先是一點光，四周的光點往它聚過去、越來越亮，然後「啵」地彈出來（約 1.3 秒）
      const st = t - cineT0;
      const fx = 300, fy = SIZE - 300 + Math.sin(t / 250) * 12, fc = [fx + 56, fy + 56];
      const shown = st >= 1300;
      bigSprite(cinePose || (shown ? 'heroSideShock' : 'heroSideSulk'), null, 90, SIZE - 90 - 128, 8);   // 腳踩在地面上緣；多蕾冒出來那一刻才傻眼
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
  let cineFull = '';
  function cineNext() {
    if (endScreen) return;
    if (typing) { clearInterval(typing); typing = null; $('#cineBody').textContent = cineFull; return; }
    const s = cineQueue.shift();
    if (!s) { endCine(); return; }
    if (s.scene) { cineScene = s.scene; cineT0 = now(); cinePose = null; }
    if (s.pose) cinePose = s.pose;
    if (s.music) MT.Audio.play(s.music, ['base', 'drums', 'strings', 'lead']);
    if (s.sfx) sfx(s.sfx);
    const text = s.text ? MT.story(s.text) : '';
    cineFull = text;
    const tb = $('#cineText');
    tb.classList.toggle('speech', !!s.speaker);
    $('#cineName').textContent = s.speaker ? MT.t('speaker_' + s.speaker) : '';
    $('#cineName').hidden = !s.speaker;
    const el = $('#cineBody');
    el.textContent = '';
    clearInterval(typing);
    const chars = Array.from(text);
    let i = 0;
    const type = () => {
      typing = setInterval(() => {
        i++; el.textContent = chars.slice(0, i).join('');
        if (s.speaker && i % 3 === 1) sfx('blip');
        if (i >= chars.length) { clearInterval(typing); typing = null; }
      }, 32);
    };
    // delay：等畫面演完（例如國王走進來）才開始打字；這段時間點一下就直接顯示全文
    if (s.delay) typing = setTimeout(type, s.delay); else type();
    dialogResolve = null;
  }
  function endCine() {
    clearInterval(typing); typing = null;
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
    { scene: 'rehearsalSpot', text: 'pro_3s' },
    { scene: 'forge', text: 'pro_3a', music: 'title' },
    { text: 'pro_3b', speaker: 'smith' },
    { scene: 'forgeKing', text: 'pro_4', speaker: 'bard', delay: 1600 },
    { scene: 'forgeRage', text: 'pro_4b', speaker: 'tink', music: 'none', sfx: 'boom' },
    { scene: 'maestro', text: 'pro_5', sfx: 'harp' },
    { scene: 'tower', text: 'pro_6', delay: 2400 },
    { scene: 'meet', text: 'pro_7', speaker: 'doremi', delay: 1500 },
    { text: 'pro_8', speaker: 'tink' },
    { text: 'pro_9', speaker: 'doremi' },
    { text: 'pro_10', speaker: 'tink', pose: 'heroSideGuilty' },
    { text: 'pro_11', speaker: 'doremi' },
    { text: 'pro_12', speaker: 'tink', pose: 'heroSideSulk' },
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
    $('#tSettings').textContent = MT.t('settings');
    const best = MT.Sync.best();
    $('#tBest').hidden = !best;
    if (best) { $('#tBest').textContent = MT.t('rateBest', { g: best.data.grade, score: best.data.score }); $('#tBest').dataset.g = best.data.grade; }
    renderCloudChip();
  }
  function showTitle() {
    mode = 'title'; st = null; busy = 0;
    setLook(false);
    $('#title').hidden = false; $('#stage').classList.add('under');
    $('#dialog').hidden = true;
    renderTitle();
    MT.Audio.play('title', ['base', 'drums', 'strings', 'lead']);
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
  $('#tSettings').addEventListener('click', () => { MT.Audio.init(); openSettings(); });
  $('#tCloud').addEventListener('click', () => { MT.Audio.init(); openCloud(); });

  function startGame(s, fresh) {
    st = MT.migrate(s);
    mode = 'game'; busy = 0;
    $('#title').hidden = true; $('#cine').hidden = true; $('#stage').classList.remove('under');
    view.fairy = false; view.move = null; view.dying = null; view.fx = []; view.fade = 0; view.fadeTo = 0; view.fadeCur = 0;
    autoPath = null; clearRoute(); setLook(false);
    playClock = Date.now();
    renderHud();
    playMusic(musicFor());
    view.banner = { text: MT.t('arrive', { n: st.floor }), t0: now() };
    if (fresh) {
      const id = MT.stepTrigger(st);
      if (!id) autosave();
      if (id) setTimeout(() => runScript(id).then(autosave), 700);
    } else lastAutoAt = (latestAuto() || {}).at || 0;
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

  MT.debug = { get st() { return st; }, set st(v) { st = v; renderHud(); }, runScript, startEnding, startGame, renderHud };
})();
