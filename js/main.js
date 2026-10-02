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
      const k = Math.min(1, (t - view.lunge.t0) / 140);
      const a = Math.sin(k * Math.PI) * 10;
      ox = view.lunge.dx * a; oy = view.lunge.dy * a;
      if (k >= 1) view.lunge = null;
    }
    const d = st.dir;
    const name = d === 'up' ? 'heroUp' : d === 'down' ? 'heroDown' : 'heroSide';
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
      } else if (f.kind === 'note') {
        const dt = t - f.t0;
        g.save(); g.globalAlpha = 1 - k; g.fillStyle = f.color; g.font = 'bold 20px serif'; g.textAlign = 'center';
        g.fillText(f.text, f.x + Math.sin(dt / 200) * 8, f.y - dt * 0.05); g.restore();
      }
    }
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
        const sp = spriteFor(d.code);
        g.drawImage(MT.sprite(sp[0], sp[1], SC), d.x * TILE + (d.phase === 'die' ? 0 : (Math.random() - 0.5) * (d.flash > t ? 4 : 0)), d.y * TILE);
        g.restore();
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
  function renderHud() {
    if (!st) return;
    $('#hFloor').textContent = MT.t('floorN', { n: st.floor });
    $('#hHp').textContent = st.hp;
    $('#hAtk').textContent = st.atk;
    $('#hDef').textContent = st.def;
    $('#hGold').textContent = st.gold;
    $('#hKy').textContent = st.keys.y;
    $('#hKb').textContent = st.keys.b;
    $('#hKr').textContent = st.keys.r;
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
    renderCloudChip();
    if (mode === 'title') renderTitle();
    renderHud();
  }
  function setupIcons() {
    $('#iKy').src = icon('key', 'yellow'); $('#iKb').src = icon('key', 'blue'); $('#iKr').src = icon('key', 'red');
    $('#bBook img').src = icon('book'); $('#bFly img').src = icon('feather');
    $('#bSave img').src = icon('page'); $('#bMenu img').src = icon('altar', 'stone');
  }

  /* ───────── 訊息 ───────── */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
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
          default: MT.applyCmd(st, c);
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
        else if (it.kind === 'hp') { sfx('potion'); floatText(ev.x, ev.y, '+' + g2.value, '#8cff8c'); }
        else if (it.kind === 'atk') { sfx('gem'); floatText(ev.x, ev.y, MT.t('atk') + '+' + g2.value, '#ff8a80'); }
        else if (it.kind === 'def') { sfx('gem'); floatText(ev.x, ev.y, MT.t('def') + '+' + g2.value, '#8ac8ff'); }
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
    const c = ev.calc, m = c.m;
    const boss = (m.sp || []).includes('boss');
    const [dx, dy] = DIR_V[dir];
    view.dying = { code: ev.tile, x: ev.x, y: ev.y, t0: now(), dur: 1e9, phase: 'fight', flash: 0 };
    const hpBefore = st.hp + c.damage;
    let shown = hpBefore;
    const rounds = Math.min(c.turns, boss ? 8 : 4);
    const perHit = c.turns > 1 ? Math.round(c.damage / Math.max(1, c.turns - 1 + ((m.sp || []).includes('first') ? 1 : 0))) : 0;
    const gap = boss ? 170 : 95;
    for (let i = 0; i < rounds; i++) {
      view.lunge = { dx, dy, t0: now() };
      sfx('hit');
      view.dying.flash = now() + 120;
      floatText(ev.x, ev.y, '-' + Math.min(m.hp, c.heroHit), '#ffffff', 14);
      if (boss) shake(120, 5);
      await sleep(gap);
      if (i < rounds - 1 && c.monHit > 0) {
        sfx('hurt'); view.hurt = now() + 120;
        shown = Math.max(st.hp, shown - perHit);
        $('#hHp').textContent = shown;
        await sleep(gap * 0.7);
      }
    }
    // 結算
    $('#hHp').textContent = st.hp;
    if (c.damage > 0) floatText(st.x, st.y, '-' + c.damage, '#ff6a6a', 18);
    sfx('kill');
    view.dying = { code: ev.tile, x: ev.x, y: ev.y, t0: now(), dur: boss ? 900 : 300, phase: 'die', done: true };
    sparkle(ev.x, ev.y, boss ? 60 : 14, boss ? null : ['#ffffff', '#ffe066', '#c8c8d8', '#ffffff']);
    if (boss) { shake(600, 12); flash('#ffffff', 700); sfx('boom'); }
    if (ev.gold) setTimeout(() => floatText(ev.x, ev.y, '+' + ev.gold + ' G', '#ffe066', 14), 180);
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
     終點是怪物或門（會扣血、用掉鑰匙）時，第一下只顯示路線和代價，同一格再點一次才出發，誤觸不會白白損失。
     長按怪物顯示牠的能力（同圖鑑那一列）。 */
  let route = null;     // { cells:[[x,y]…], kind } 畫在地圖上的路線；kind：walk／fight／door
  let pending = null;   // 等第二下確認的終點 'x,y'
  let inspect = null;   // 長按中的怪物 { x, y }
  function clearRoute() { route = null; pending = null; }

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
    let kind = 'walk', msg = '';
    const m = MT.MONSTERS[code];
    if (m && !(m.onBump && !st.flags['bump:' + code])) {   // 有劇情的 Boss 第一次碰是播劇情，不用確認
      const c = MT.calc(st, code);
      if (c.damage == null) { refuse(MT.t('cantHurtMsg', { name: MT.monName(code) })); return; }
      if (c.damage >= st.hp) { refuse(MT.t('cantWin', { name: MT.monName(code), d: c.damage })); return; }
      kind = 'fight'; msg = c.damage ? MT.t('confirmFight', { d: c.damage }) : MT.t('confirmFight0');
    } else if (MT.DOORS[code]) {
      const k = MT.DOORS[code];
      if (st.keys[k] <= 0) { refuse(MT.t('needKey_' + k)); return; }
      kind = 'door'; msg = MT.t('confirmDoor_' + k);
    }
    const at = x + ',' + y;
    if (kind !== 'walk' && pending !== at) {
      autoPath = null;   // 正在走的話先停下來，等確認
      pending = at; route = { cells, kind };
      sfx('select'); toast(msg);
      return;
    }
    pending = null;
    route = { cells, kind };
    walkRoute(cells);
  }

  // 光標顏色（r,g,b）：平常白色，等確認開打時帶一點淡紅
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
  // 終點光標、長按中的怪物光標（畫在怪物上面）
  function drawMarks(t) {
    if (route) {
      const [tx, ty] = route.cells[route.cells.length - 1];
      if (tx !== st.x || ty !== st.y) cursor(tx, ty, CURSOR_RGB[route.kind], t);
    }
    if (inspect) cursor(inspect.x, inspect.y, CURSOR_RGB.walk, t);
  }
  // 點到走不到的地方：那格閃一下紅色 ✕
  const cross = (x, y) => view.fx.push({ kind: 'cross', x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, t0: now(), life: 550 });

  /* 長按怪物：地圖上方或下方（避開那隻怪）浮出能力卡，再點一下任何地方收起來 */
  const monCard = $('#monCard');
  function showMonCard(code, x, y) {
    inspect = { x, y };
    monCard.innerHTML = monRow(code);
    monCard.classList.toggle('top', y >= Math.ceil(H / 2));
    monCard.hidden = false;
    sfx('select');
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* 不支援就算了 */ }
  }
  function hideMonCard() { if (monCard.hidden) return false; monCard.hidden = true; inspect = null; return true; }
  monCard.addEventListener('pointerdown', e => { e.preventDefault(); hideMonCard(); });

  const tileAt = e => {
    const r = canvas.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)];
  };
  let press = null;   // 按下中的手指：放開時才算「點」，在怪物上按住超過 LONG_MS 就是「長按」
  const LONG_MS = 420;
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'game') return;
    e.preventDefault();
    if (press) return;   // 第二根手指不理
    if (advanceDialog() || hideMonCard() || busy) return;
    const [x, y] = tileAt(e);
    press = { id: e.pointerId, cx: e.clientX, cy: e.clientY, long: false, timer: 0 };
    const code = MT.tile(st, st.floor, x, y);
    if (MT.isMonster(code)) press.timer = setTimeout(() => { if (press) { press.long = true; showMonCard(code, x, y); } }, LONG_MS);
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
    else if (e.key === 'Escape') openMenu();
  });
  document.addEventListener('keyup', e => { const d = KEYMAP[e.key]; if (d) stopHold(d); });
  window.addEventListener('blur', () => stopHold());

  $('#bBook').addEventListener('click', () => openBook());
  $('#bFly').addEventListener('click', () => openFly());
  $('#bSave').addEventListener('click', () => openSaves());
  $('#bMenu').addEventListener('click', () => openMenu());
  $('#cloudChip').addEventListener('click', () => openCloud());

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

  // 一隻怪物的能力與這場的代價（圖鑑和長按卡片共用）
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
      + `<p class="muted small" id="saveCloud">${esc(MT.t('cloud'))}：${esc(cloudText())}</p>`;
    const yesNo = [{ key: 'n', label: MT.t('no') }, { key: 'y', label: MT.t('yes') }];
    openModal(MT.t('saveTitle'), html, body => {
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
        `<button class="btn opt" data-k="${k}" ${st.gold < K[k] ? 'disabled' : ''}>${img('key', { y: 'yellow', b: 'blue', r: 'red' }[k])} ${esc(MT.t(lab, { p: K[k] }))}</button>`).join('');
      openModal(MT.t('frog'), `<div class="shopTop">${img('frog', null, 'big')}<p>${esc(MT.t('frogText'))}</p></div><div class="opts">${opts}</div>
        <p class="muted small">${esc(MT.t('gold'))}：${st.gold}</p><button class="btn" data-x>${esc(MT.t('leave'))}</button>`, body => {
        body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
          if (MT.buy(st, 'keys', b.dataset.k)) { sfx('buy'); renderHud(); closeModal(); openShop('keys'); autosave(); } else { sfx('error'); toast(MT.t('noGold')); }
        }));
        body.querySelector('[data-x]').addEventListener('click', closeModal);
      });
      return;
    }
    const S = MT.SHOPS[id], price = MT.shopPrice(st, id), poor = st.gold < price;
    const opts = [['hp', 'buyHp', S.hp, 'potion', 'red'], ['atk', 'buyAtk', S.atk, 'gem', 'gemRed'], ['def', 'buyDef', S.def, 'gem', 'gemBlue']].map(([k, lab, n, sp, pal]) =>
      `<button class="btn opt" data-k="${k}" ${poor ? 'disabled' : ''}>${img(sp, pal)} ${esc(MT.t(lab, { n }))}</button>`).join('');
    openModal(MT.t(id), `<div class="shopTop">${img('altar', MT.NPCS[id === 'shop1' ? 'Sh' : 'S2'].pal, 'big')}<p>${esc(MT.t('shopText', { price }))}</p></div>
      <div class="opts">${opts}</div><p class="muted small">${esc(MT.t('gold'))}：${st.gold}</p><button class="btn" data-x>${esc(MT.t('leave'))}</button>`, body => {
      body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
        if (MT.buy(st, id, b.dataset.k)) { sfx('buy'); notes(st.x, st.y, 4); renderHud(); closeModal(); openShop(id); autosave(); } else { sfx('error'); toast(MT.t('noGold')); }
      }));
      body.querySelector('[data-x]').addEventListener('click', closeModal);
    });
  }

  function openMenu() {
    if (!st || mode !== 'game' || busy) return;
    openModal(MT.t('btnMenu'), `<div class="menu">
      <button class="btn" data-a="saves">${esc(MT.t('saveTitle'))}</button>
      <button class="btn" data-a="settings">${esc(MT.t('settings'))}</button>
      <button class="btn" data-a="cloud">${esc(MT.t('cloud'))}</button>
      <button class="btn" data-a="title">${esc(MT.t('backTitle'))}</button></div>`, body => {
      body.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a; closeModal();
        if (a === 'saves') openSaves();
        else if (a === 'settings') openSettings();
        else if (a === 'cloud') openCloud();
        else if (a === 'title') { autosave(); showTitle(); }
      }));
    });
  }

  function openSettings() {
    const langs = MT.LANGS.map(l => `<button class="btn ${l === MT.getLang() ? 'primary' : ''}" data-l="${l}">${esc(MT.TEXT[l].langName)}</button>`).join('');
    openModal(MT.t('settings'), `
      <label class="lab">${esc(MT.t('language'))}</label><div class="row">${langs}</div>
      <label class="lab" for="vMusic">${esc(MT.t('musicVol'))}</label><input type="range" id="vMusic" min="0" max="1" step="0.05" value="${settings.music}">
      <label class="lab" for="vSfx">${esc(MT.t('sfxVol'))}</label><input type="range" id="vSfx" min="0" max="1" step="0.05" value="${settings.sfx}">
      <p class="muted small">${esc(MT.t('controls'))}</p>
      <p class="muted small ver">v${MT.VERSION}</p>`, body => {
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
    const c = $('#cloudChip');
    c.dataset.s = MT.Sync.status;
    c.title = MT.t('cloud') + '：' + cloudText();
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
  function drawTower(t, x, w, color) {
    cg.fillStyle = color;
    cg.fillRect(x - w / 2, 90, w, SIZE - 130);
    cg.beginPath(); cg.moveTo(x - w / 2 - 14, 100); cg.lineTo(x, 30); cg.lineTo(x + w / 2 + 14, 100); cg.fill();
    cg.fillStyle = '#c07cf5';
    for (let i = 0; i < 6; i++) cg.fillRect(x - 6, 130 + i * 55, 12, 18);
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
    town: t => { drawSky(t, '#141a3a', '#3a2a5a'); drawStars(t); drawTown(t); floatingNotes(t, 10, SIZE / 2, SIZE - 60, 220, null, 300); bigSprite('bard', null, 130, SIZE - 118, 5); bigSprite('frog', null, 330, SIZE - 118, 5, true); },
    forge: t => {
      drawSky(t, '#2a1810', '#5a2a18');
      cg.fillStyle = '#3a2418'; cg.fillRect(0, SIZE - 120, SIZE, 120);
      cg.fillStyle = '#555a68'; cg.fillRect(270, SIZE - 170, 120, 30); cg.fillRect(300, SIZE - 140, 60, 50);
      const hit = Math.floor(t / 400) % 2;
      bigSprite('heroSide', null, 150, SIZE - 250 + (hit ? 6 : 0), 8);
      if (hit) for (let i = 0; i < 8; i++) { cg.fillStyle = ['#ffd84a', '#ff9a2e'][i % 2]; cg.fillRect(300 + Math.cos(i + t / 100) * 40, SIZE - 190 - Math.abs(Math.sin(i * 3 + t / 90)) * 50, 5, 5); }
      cg.fillStyle = 'rgba(255,140,40,0.15)'; cg.beginPath(); cg.arc(330, SIZE - 160, 140 + Math.sin(t / 200) * 10, 0, Math.PI * 2); cg.fill();
    },
    // 前一晚：國王站在打鐵鋪門口唸王子
    forgeKing: t => {
      drawSky(t, '#120c1c', '#3a1a14'); drawStars(t);
      cg.fillStyle = '#2a1a14'; cg.fillRect(0, SIZE - 120, SIZE, 120);
      cg.fillStyle = '#454a58'; cg.fillRect(40, SIZE - 170, 120, 30); cg.fillRect(70, SIZE - 140, 60, 50);
      cg.fillStyle = 'rgba(255,120,40,0.10)'; cg.beginPath(); cg.arc(100, SIZE - 160, 110 + Math.sin(t / 300) * 6, 0, Math.PI * 2); cg.fill();
      bigSprite('heroSide', null, 170, SIZE - 250, 8);
      bigSprite('bard', null, 330, SIZE - 250, 8);
    },
    maestro: t => {
      drawSky(t, '#05040c', '#1a0f2a'); drawTown(t);
      // 被吸走的音符
      cg.font = 'bold 24px serif'; cg.textAlign = 'center';
      for (let i = 0; i < 24; i++) {
        const p = ((t / 1600 + i / 24) % 1);
        const a = i * 0.9 + p * 6;
        const r = 230 * (1 - p);
        cg.globalAlpha = p; cg.fillStyle = ['#ffe066', '#aef4ff', '#ff9ccc'][i % 3];
        cg.fillText('♪♫♬♩'[i % 4], SIZE / 2 + Math.cos(a) * r, 150 + Math.sin(a) * r * 0.5);
      }
      cg.globalAlpha = 1;
      bigSprite('maestro', null, SIZE / 2 - 64, 110, 8);
    },
    tower: t => { drawSky(t, '#3a4060', '#c89a7a'); drawTower(t, SIZE / 2, 120, '#0e0b16'); drawTown(t); },
    meet: t => {
      drawSky(t, '#3a4060', '#c89a7a'); drawTower(t, SIZE / 2 + 120, 80, '#0e0b16');
      cg.fillStyle = '#4a3a3a'; cg.fillRect(0, SIZE - 90, SIZE, 90);
      bigSprite('heroSide', null, 90, SIZE - 250, 8);
      bigSprite('fairy', null, 300, SIZE - 300 + Math.sin(t / 250) * 12, 7, true);
      for (let i = 0; i < 6; i++) { cg.fillStyle = '#fff6b0'; cg.fillRect(360 + Math.cos(t / 300 + i) * 60, SIZE - 240 + Math.sin(t / 200 + i * 2) * 50, 4, 4); }
    },
    festival: t => {
      drawSky(t, '#5ab0ff', '#ffe0b0');
      cg.fillStyle = '#fff6d0'; cg.beginPath(); cg.arc(430, 80, 40, 0, Math.PI * 2); cg.fill();
      drawTown(t, true);
      floatingNotes(t, 16, SIZE / 2, SIZE - 60, 250, null, 360);
      bigSprite('drum', null, 290, SIZE - 180, 6);
      bigSprite('bard', null, 392, SIZE - 190 + (Math.floor(t / 300) % 2) * 4, 5);
      bigSprite('heroDown', null, 120, SIZE - 200 + (Math.floor(t / 250) % 2) * -6, 6);
      bigSprite('fairy', null, 200, SIZE - 290 + Math.sin(t / 250) * 10, 4);
      bigSprite('frog', null, 20, SIZE - 90, 3);
    },
    // 真結局：阿爾特站上舞台中央領唱，音符一圈圈流向他；國王在台下跟著唱（多蕾已經融進他的聲音，不出現）
    festivalTrue: t => {
      drawSky(t, '#ff9a6a', '#ffe0b0');
      cg.fillStyle = '#fff6d0'; cg.beginPath(); cg.arc(SIZE / 2, 120, 60 + Math.sin(t / 400) * 4, 0, Math.PI * 2); cg.fill();
      drawTown(t, true);
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
    if (s.scene) { cineScene = s.scene; cineT0 = now(); }
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
    typing = setInterval(() => {
      i++; el.textContent = chars.slice(0, i).join('');
      if (s.speaker && i % 3 === 1) sfx('blip');
      if (i >= chars.length) { clearInterval(typing); typing = null; }
    }, 32);
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
    { scene: 'forgeKing', text: 'pro_4', speaker: 'bard' },
    { text: 'pro_4b', speaker: 'tink', music: 'none', sfx: 'boom' },
    { scene: 'maestro', text: 'pro_5', sfx: 'harp' },
    { scene: 'tower', text: 'pro_6' },
    { scene: 'meet', text: 'pro_7', speaker: 'doremi' },
    { text: 'pro_8', speaker: 'tink' },
    { text: 'pro_9', speaker: 'doremi' },
    { text: 'pro_10', speaker: 'tink' },
    { text: 'pro_11', speaker: 'doremi' },
    { text: 'pro_12', speaker: 'tink' },
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
    renderCloudChip();
  }
  function showTitle() {
    mode = 'title'; st = null; busy = 0;
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
    autoPath = null; clearRoute(); hideMonCard();
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
    $('#cineBody').innerHTML = `<b>${esc(MT.story('ed_thanks'))}</b><br><span class="small">${esc(MT.t(trueEnd ? 'endTrue' : 'endNormal'))}　${esc(MT.t('endStats', { t: tstr, s: st.steps, k: st.kills }))}</span><br>${trueEnd ? '' : `<span class="small">${esc(MT.story('ed_hint'))}</span><br>`}<button class="btn primary" id="endBack">${esc(MT.t('backTitle'))}</button>`;
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
    if (mode === 'game' && !busy) { openMenu(); return true; }
    return false;
  };
  MT.appPause = () => { stopHold(); if (mode === 'game') autosave(); MT.Sync.push(true); MT.Audio.suspend(); };
  MT.appResume = () => { playClock = Date.now(); MT.Audio.resume(); MT.Sync.pull().then(() => checkCloudNewer()); };

  MT.debug = { get st() { return st; }, set st(v) { st = v; renderHud(); }, runScript, startEnding, startGame, renderHud };
})();
