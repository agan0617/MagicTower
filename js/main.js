/* 畫面、操作、演出、選單 */
(function () {
  'use strict';
  const MT = window.MT;
  const $ = s => document.querySelector(s);
  const TILE = 48, SC = 3, N = 11, SIZE = TILE * N;
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
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  /* ───────── 設定 ───────── */
  const settings = Object.assign({ music: 0.7, sfx: 0.8 }, MT.LS.get('settings', {}));
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
    maestro: ['maestro'], harpghost: ['harp'], frog: ['frog'],
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
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const code = m[y][x];
      const wall = code === '##';
      g.drawImage(MT.terrain(wall ? 'wall' : 'floor', zone, TILE, (x * 7 + y * 13) % 10), x * TILE, y * TILE);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
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
    drawHero(t);
    drawFx(t);
    g.restore();
    // 淡入淡出、閃光
    if (view.fade !== view.fadeTo) {
      const k = Math.min(1, (t - view.fadeT0) / view.fadeDur);
      view.fadeCur = view.fadeFrom + (view.fadeTo - view.fadeFrom) * k;
      if (k >= 1) view.fade = view.fadeTo;
    } else view.fadeCur = view.fade;
    if (view.fadeCur > 0) { g.fillStyle = `rgba(8,6,16,${view.fadeCur})`; g.fillRect(0, 0, SIZE, SIZE); }
    if (view.flash) {
      const k = (t - view.flash.t0) / view.flash.dur;
      if (k >= 1) view.flash = null;
      else { g.save(); g.globalAlpha = 1 - k; g.fillStyle = view.flash.color; g.fillRect(0, 0, SIZE, SIZE); g.restore(); }
    }
    if (view.banner) {
      const k = (t - view.banner.t0) / 1100;
      if (k >= 1) view.banner = null;
      else {
        g.save(); g.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
        g.fillStyle = 'rgba(8,6,16,0.6)'; g.fillRect(0, SIZE / 2 - 40, SIZE, 80);
        label(view.banner.text, SIZE / 2, SIZE / 2 + 14, '#ffe9a8', 40);
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
      box.classList.toggle('top', !!st && st.y >= 6);
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
  $('#dialog').addEventListener('pointerdown', e => { e.preventDefault(); advanceDialog(); });

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

  /* 點地圖走過去：只穿過空地，終點可以是任何東西（碰到就觸發） */
  function findPath(tx, ty) {
    const m = st.maps[st.floor];
    const key = (x, y) => y * N + x;
    const prev = new Map([[key(st.x, st.y), null]]);
    const q = [[st.x, st.y]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) break;
      for (const [d, [dx, dy]] of Object.entries(DIR_V)) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || prev.has(key(nx, ny))) continue;
        const code = m[ny][nx];
        const isTarget = nx === tx && ny === ty;
        if (code !== '..' && !isTarget) continue;
        prev.set(key(nx, ny), [x, y, d]);
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const path = [];
    for (let k = key(tx, ty); prev.get(k); ) { const p = prev.get(k); path.unshift(p[2]); k = key(p[0], p[1]); }
    return path;
  }
  async function walkPath(path) {
    const id = {};
    autoPath = id;
    for (const d of path) {
      if (autoPath !== id) return;
      while (busy) { await sleep(30); if (autoPath !== id) return; }
      const cont = await stepOnce(d);
      if (!cont) break;
      await sleep(105);
    }
    if (autoPath === id) autoPath = null;
  }
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'game' || busy) return;
    MT.Audio.init();
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * N), y = Math.floor((e.clientY - r.top) / r.height * N);
    if (x === st.x && y === st.y) return;
    const p = findPath(x, y);
    if (p && p.length) walkPath(p);
    else if (Math.abs(x - st.x) + Math.abs(y - st.y) === 1) stepOnce(x > st.x ? 'right' : x < st.x ? 'left' : y > st.y ? 'down' : 'up');
  });

  /* 按住連續走（搖桿與鍵盤共用） */
  let holdDir = null, holdTimer = null;
  function startHold(d) {
    autoPath = null;
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
  /* 搖桿：固定在搖桿區正中央；在這塊區域任何地方按住，都以搖桿中心判斷方向（取水平／垂直較大的一邊），
     拖離中心超過死區就朝那個方向連續走，放開搖桿回正 */
  const stick = $('#stick'), stickBase = $('#stickBase'), stickKnob = $('#stickKnob');
  const DEAD = 14;
  let stickId = null;
  function stickMove(e) {
    const r = stickBase.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const R = r.width / 2 - 20, dist = Math.hypot(dx, dy), k = dist > R ? R / dist : 1;
    stickKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    if (dist < DEAD) { stopHold(); return; }
    startHold(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }
  function stickEnd(e) {
    if (e.pointerId !== stickId) return;
    stickId = null; stopHold();
    stickKnob.style.transform = '';
    stick.classList.remove('active');
  }
  stick.addEventListener('pointerdown', e => {
    e.preventDefault(); MT.Audio.init();
    if (advanceDialog() || stickId !== null) return;
    stickId = e.pointerId;
    try { stick.setPointerCapture(e.pointerId); } catch (err) { /* 沒有真的觸控時抓不到，不影響 */ }
    stick.classList.add('active');
    stickMove(e);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);
  stick.addEventListener('lostpointercapture', stickEnd);  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', A: 'left', D: 'right' };
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
    stopHold(); autoPath = null;
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

  function openBook() {
    if (!st || mode !== 'game' || busy) return;
    if (!st.items.book) return;
    const seen = [];
    for (const row of st.maps[st.floor]) for (const c of row) if (MT.MONSTERS[c] && !seen.includes(c)) seen.push(c);
    const rows = seen.map(code => {
      const m = MT.MONSTERS[code], c = MT.calc(st, code);
      const sp = (m.sp || []).filter(s => s !== 'boss' || true).map(s => `<span class="tag">${esc(MT.t('sp_' + s))}</span>`).join('');
      const dmg = c.damage == null ? `<b class="bad">${esc(MT.t('cantHurt'))}</b>` : c.damage >= st.hp ? `<b class="bad">${c.damage}（${esc(MT.t('willLose'))}）</b>` : `<b style="color:${dmgColor(c)}">${c.damage}</b>`;
      const inv = (m.sp || []).includes('invincible');
      return `<div class="mon">${img(m.sprite, m.pal, 'big')}<div class="mi"><div class="mn">${esc(MT.monName(code))} ${sp}</div>
        <div class="ms">${esc(MT.t('hp'))} ${inv ? '???' : m.hp}　${esc(MT.t('atk'))} ${inv ? '???' : m.atk}　${esc(MT.t('def'))} ${inv ? '???' : m.def}　${esc(MT.t('gold'))} ${m.gold}</div>
        <div class="md">${esc(MT.t('dmg'))}：${dmg}</div></div></div>`;
    });
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
  function slotLine(sl) {
    if (!sl) return `<span class="muted">${esc(MT.t('empty'))}</span>`;
    return `${MT.t('floorN', { n: sl.floor })} · ${esc(MT.t('hp'))} ${sl.hp} · ${esc(sl.device || '')} · ${esc(timeAgo(sl.at))}`;
  }
  function openSaves(fromTitle) {
    if (!fromTitle && (!st || mode !== 'game' || busy)) return;
    const slots = ['auto', 's1', 's2', 's3'];
    const html = slots.map(k => {
      const sl = MT.Sync.get(k);
      const name = k === 'auto' ? MT.t('slotAuto') : MT.t('slotN', { n: k.slice(1) });
      return `<div class="slot"><div class="sn">${esc(name)}</div><div class="sd">${slotLine(sl)}</div><div class="sb">
        ${k !== 'auto' && !fromTitle ? `<button class="btn" data-save="${k}">${esc(MT.t('saveHere'))}</button>` : ''}
        ${sl ? `<button class="btn primary" data-load="${k}">${esc(MT.t('loadThis'))}</button>` : ''}</div></div>`;
    }).join('') + `<p class="muted small" id="saveCloud">${esc(MT.t('cloud'))}：${esc(cloudText())}</p>`;
    openModal(MT.t('saveTitle'), html, body => {
      body.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
        const k = b.dataset.save;
        if (MT.Sync.get(k) && await ask(MT.t('overwrite'), [{ key: 'n', label: MT.t('no') }, { key: 'y', label: MT.t('yes') }]) !== 'y') return;
        MT.Sync.save(k, MT.pack(st)); sfx('save'); toast(MT.t('saved'));
        closeModal(); openSaves();
      }));
      body.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', async () => {
        const k = b.dataset.load;
        if (!fromTitle && await ask(MT.t('loadConfirm'), [{ key: 'n', label: MT.t('no') }, { key: 'y', label: MT.t('yes') }]) !== 'y') return;
        closeModal();
        startGame(MT.unpack(MT.Sync.get(k).data));
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
          else checkCloudNewer({ changed: ['auto'] });
        } catch (err) {
          btn.disabled = false;
          const el = body.querySelector('#cloudErr'); el.hidden = false; el.textContent = MT.Sync.error || MT.t('cs_offline');
        }
      });
    });
  }

  // 別台裝置有比較新的自動存檔 → 問要不要讀
  async function checkCloudNewer(res) {
    if (!st || mode !== 'game' || !res.changed.includes('auto')) return;
    const a = MT.Sync.get('auto');
    if (!a || a.at <= lastAutoAt || a.device === MT.Sync.device) return;
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
    const sl = MT.Sync.save('auto', MT.pack(st));
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
      MT.Sync.pull().then(checkCloudNewer);
    }
  });
  window.addEventListener('pagehide', () => { if (mode === 'game') autosave(); MT.Sync.push(true); });

  /* ───────── 開場／結局動畫 ───────── */
  const cine = $('#cineCanvas');
  cine.width = cine.height = SIZE;
  const cg = cine.getContext('2d');
  cg.imageSmoothingEnabled = false;
  let cineScene = null, cineQueue = [], cineDone = null;

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
      const p = ((t / 1000 + i * 0.37) % 3) / 3;
      const x = cx + Math.sin(i * 1.7 + t / 900) * spread;
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

  const SCENES = {
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
      bigSprite('maestro', null, 330, SIZE - 190 + (Math.floor(t / 300) % 2) * 4, 5, true);
      bigSprite('heroDown', null, 120, SIZE - 200 + (Math.floor(t / 250) % 2) * -6, 6);
      bigSprite('fairy', null, 200, SIZE - 290 + Math.sin(t / 250) * 10, 4);
      bigSprite('bard', null, 30, SIZE - 150, 4); bigSprite('frog', null, 440, SIZE - 120, 4, true);
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
    if (s.scene) cineScene = s.scene;
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
    { scene: 'forge', text: 'pro_3' },
    { scene: 'maestro', text: 'pro_4', speaker: 'maestro', music: 'none', sfx: 'boom' },
    { text: 'pro_5', sfx: 'harp' },
    { scene: 'tower', text: 'pro_6' },
    { scene: 'meet', text: 'pro_7', speaker: 'doremi' },
    { text: 'pro_8', speaker: 'tink' },
    { text: 'pro_9', speaker: 'doremi' },
    { text: 'pro_10', speaker: 'tink' },
    { text: 'pro_11', speaker: 'doremi' },
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
    tg.font = 'bold 26px serif'; tg.textAlign = 'center';
    for (let i = 0; i < 14; i++) {
      const p = ((t / 2200 + i / 14) % 1);
      tg.globalAlpha = Math.sin(p * Math.PI) * 0.8; tg.fillStyle = ['#ffe066', '#aef4ff', '#ff9ccc'][i % 3];
      tg.fillText('♪♫♬♩'[i % 4], cx + Math.sin(i * 2.1 + t / 1200) * 200, SIZE - p * SIZE * 0.9);
    }
    tg.globalAlpha = 1;
    tg.drawImage(MT.sprite('heroUp', null, 4), cx - 32, SIZE - 80);
    tg.drawImage(MT.sprite('fairy', null, 3), cx + 30, SIZE - 120 + Math.sin(t / 300) * 6);
  }
  requestAnimationFrame(titleRender);

  function renderTitle() {
    $('#tTitle').textContent = MT.t('title');
    $('#tSub').textContent = MT.t('subtitle');
    const auto = MT.Sync.get('auto');
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
  $('#tContinue').addEventListener('click', () => { MT.Audio.init(); const a = MT.Sync.get('auto'); if (a) startGame(MT.unpack(a.data)); });
  $('#tNew').addEventListener('click', async () => {
    MT.Audio.init();
    if (MT.Sync.get('auto') && await ask(MT.t('confirmNew'), [{ key: 'n', label: MT.t('no') }, { key: 'y', label: MT.t('yes') }]) !== 'y') return;
    $('#title').hidden = true;
    await playCine(PROLOGUE);
    const s = MT.newGame();
    startGame(s, true);
  });
  $('#tLoad').addEventListener('click', () => { MT.Audio.init(); openSaves(true); });
  $('#tSettings').addEventListener('click', () => { MT.Audio.init(); openSettings(); });
  $('#tCloud').addEventListener('click', () => { MT.Audio.init(); openCloud(); });

  function startGame(s, fresh) {
    st = s;
    mode = 'game'; busy = 0;
    $('#title').hidden = true; $('#cine').hidden = true; $('#stage').classList.remove('under');
    view.fairy = false; view.move = null; view.dying = null; view.fx = []; view.fade = 0; view.fadeTo = 0; view.fadeCur = 0;
    playClock = Date.now();
    renderHud();
    playMusic(musicFor());
    view.banner = { text: MT.t('arrive', { n: st.floor }), t0: now() };
    if (fresh) {
      const id = MT.stepTrigger(st);
      if (!id) autosave();
      if (id) setTimeout(() => runScript(id).then(autosave), 700);
    } else lastAutoAt = (MT.Sync.get('auto') || {}).at || 0;
  }

  async function startEnding() {
    mode = 'cine';
    await sleep(300);
    const secs = Math.round(st.playMs / 1000);
    const tstr = `${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    await playCine([
      { scene: 'festival', text: 'ed_1', music: 'ending' },
      { text: 'ed_2', keep: true },
      { text: 'ed_3', keep: true },
      { text: 'ed_end', keep: true },
    ]);
    // 通關畫面
    mode = 'cine';
    $('#cine').hidden = false; $('#stage').classList.add('under');
    $('#cineName').hidden = true;
    $('#cineBody').innerHTML = `<b>${esc(MT.story('ed_thanks'))}</b><br><span class="small">${esc(MT.t('endStats', { t: tstr, s: st.steps, k: st.kills }))}</span><br><button class="btn primary" id="endBack">${esc(MT.t('backTitle'))}</button>`;
    cineQueue = []; endScreen = true;
    $('#cineSkip').hidden = true;
    $('#endBack').addEventListener('click', e => { e.stopPropagation(); endScreen = false; $('#cineSkip').hidden = false; $('#cine').hidden = true; showTitle(); });
  }

  /* ───────── 啟動 ───────── */
  document.addEventListener('pointerdown', () => MT.Audio.init(), { capture: true });
  setupIcons();
  renderStaticText();
  showTitle();
  // 網頁版離線可玩；App 版檔案已經在手機裡，不需要
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/MagicTowerApp/.test(navigator.userAgent)) {
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
  MT.appResume = () => { playClock = Date.now(); MT.Audio.resume(); MT.Sync.pull().then(checkCloudNewer); };

  MT.debug = { get st() { return st; }, set st(v) { st = v; renderHud(); }, runScript, startEnding, startGame, renderHud };
})();
