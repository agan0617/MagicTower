/* 音樂與音效：全部用 Web Audio 即時合成，沒有外部音檔。
   塔裡的背景音樂分層：一開始只剩低音和零星的鐘聲（聲音被偷走了），
   打倒鼓魔像找回「鼓」、打倒弦之魔女找回「弦」，對應的聲部才會回來。 */
(function (MT) {
  'use strict';

  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function freq(tok) {
    const m = /^([a-g])(#|b)?(\d)$/.exec(tok);
    if (!m) return 0;
    let n = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const midi = (Number(m[3]) + 1) * 12 + n;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  const split = s => s.trim().split(/\s+/);

  /* 曲子：bpm、每拍兩格（八分音符）；每軌一個 layer，塔裡依找回的樂器開關 */
  const SONGS = {
    title: {
      bpm: 138,
      tracks: [
        { layer: 'lead', inst: 'lead', vol: 0.17, notes:
          'e5 - g5 - c6 - b5 a5  g5 - - - d5 - g5 -  a5 - c6 - e6 - d6 c6  c6 - a5 - f5 - a5 - ' +
          'g5 - e5 - c5 - e5 g5  b5 - a5 - g5 - d5 -  c6 - a5 - b5 - d6 -  c6 - - - . . . .' },
        { layer: 'base', inst: 'bass', vol: 0.30, notes:
          'c3 - g3 - c3 - g3 -  g2 - d3 - g2 - d3 -  a2 - e3 - a2 - e3 -  f2 - c3 - f2 - c3 - ' +
          'c3 - g3 - c3 - g3 -  g2 - d3 - g2 - d3 -  f2 - c3 - g2 - d3 -  c3 - g2 - c3 - . .' },
        { layer: 'strings', inst: 'pulse', vol: 0.06, notes:
          'c4 e4 g4 e4 c4 e4 g4 e4  b3 d4 g4 d4 b3 d4 g4 d4  a3 c4 e4 c4 a3 c4 e4 c4  a3 c4 f4 c4 a3 c4 f4 c4 ' +
          'c4 e4 g4 e4 c4 e4 g4 e4  b3 d4 g4 d4 b3 d4 g4 d4  a3 c4 f4 c4 b3 d4 g4 d4  c4 e4 g4 c5 g4 e4 c4 .' },
        { layer: 'drums', inst: 'drums', vol: 0.5, notes:
          'k h s h k k s h  k h s h k k s h  k h s h k k s h  k h s h k k s h ' +
          'k h s h k k s h  k h s h k k s h  k h s h k k s h  k k s k s k s s' },
      ],
    },
    tower: {
      bpm: 92,
      tracks: [
        { layer: 'base', inst: 'bell', vol: 0.10, notes:
          'e5 - - - . . . .  . . c5 - - - . .  d5 - - - b4 - - -  . . g#4 - - - . . ' +
          'e5 - - - a5 - - -  . . c6 - b5 - a5 -  f5 - - - g#5 - - -  a5 - - - - - . .' },
        { layer: 'base', inst: 'bass', vol: 0.26, notes:
          'a2 - - - e3 - - -  f2 - - - c3 - - -  g2 - - - d3 - - -  e2 - - - b2 - g#2 - ' +
          'a2 - - - e3 - - -  f2 - - - c3 - - -  d3 - - - e2 - - -  a2 - e3 - a3 - - -' },
        { layer: 'drums', inst: 'drums', vol: 0.42, notes:
          'k . h h s . h .  k . h h s . h .  k . h h s . h .  k . h h s . h h ' +
          'k . h h s . h .  k . h h s . h .  k . h h s . h .  k . h h s k s s' },
        { layer: 'strings', inst: 'pulse', vol: 0.05, notes:
          'a3 c4 e4 a4 e4 c4 a3 c4  f3 a3 c4 f4 c4 a3 f3 a3  g3 b3 d4 g4 d4 b3 g3 b3  e3 g#3 b3 e4 b3 g#3 e3 g#3 ' +
          'a3 c4 e4 a4 e4 c4 a3 c4  f3 a3 c4 f4 c4 a3 f3 a3  d4 f4 a4 f4 e4 g#4 b4 g#4  a3 c4 e4 a4 c5 a4 e4 c4' },
        { layer: 'lead', inst: 'lead', vol: 0.13, notes:
          'a4 - c5 - e5 - - -  f5 - e5 - c5 - - -  d5 - b4 - g4 - b4 -  g#4 - - - e4 - - - ' +
          'a4 - c5 - e5 - a5 -  c6 - b5 - a5 - e5 -  f5 - a5 - g#5 - b5 -  a5 - - - - - . .' },
      ],
    },
    boss: {
      bpm: 152,
      tracks: [
        { layer: 'lead', inst: 'lead', vol: 0.14, notes:
          'd5 - f5 - a5 - g5 f5  f5 - d5 - bb4 - - -  c5 - e5 - g5 - f5 e5  e5 - c#5 - a4 - - - ' +
          'd5 d5 f5 d5 a5 - c6 -  bb5 - a5 - f5 - d5 -  g5 - e5 - c6 - bb5 -  a5 - g5 - f5 - e5 c#5' },
        { layer: 'base', inst: 'bass', vol: 0.30, notes:
          'd2 d3 d2 d3 d2 d3 d2 d3  bb1 bb2 bb1 bb2 bb1 bb2 bb1 bb2  c2 c3 c2 c3 c2 c3 c2 c3  a1 a2 a1 a2 c#3 a2 e3 a2 ' +
          'd2 d3 d2 d3 d2 d3 d2 d3  bb1 bb2 bb1 bb2 bb1 bb2 bb1 bb2  c2 c3 c2 c3 c2 c3 c2 c3  a1 a2 a1 a2 c#3 a2 e3 a2' },
        { layer: 'strings', inst: 'pulse', vol: 0.05, notes:
          'd4 f4 a4 f4 d4 f4 a4 f4  d4 f4 bb4 f4 d4 f4 bb4 f4  e4 g4 c5 g4 e4 g4 c5 g4  e4 a4 c#5 a4 e4 a4 c#5 a4 ' +
          'd4 f4 a4 f4 d4 f4 a4 f4  d4 f4 bb4 f4 d4 f4 bb4 f4  e4 g4 c5 g4 e4 g4 c5 g4  e4 a4 c#5 a4 e4 a4 c#5 e5' },
        { layer: 'drums', inst: 'drums', vol: 0.5, notes:
          'k h s h k k s h  k h s h k k s h  k h s h k k s h  k h s h k s s s ' +
          'k h s h k k s h  k h s h k k s h  k h s h k k s h  s s s s k k s s' },
      ],
    },
  };
  SONGS.ending = Object.assign({}, SONGS.title, { bpm: 112 });

  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  const vol = { music: 0.8, sfx: 0.8 };
  let cur = null;        // { name, song, layerGains, step, nextTime, timer }
  let wantLayers = ['base'];

  MT.Audio = {
    get ready() { return !!ctx; },
    init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (pending) { const p = pending; pending = null; MT.Audio.play(p.name, p.layers); }
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setVolume(kind, v) {
      vol[kind] = v;
      if (!ctx) return;
      (kind === 'music' ? musicBus : sfxBus).gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
    get volume() { return Object.assign({}, vol); },
    get current() { return cur ? cur.name : null; },

    /* 播某首曲子；同一首只更新聲部 */
    play(name, layers) {
      if (layers) wantLayers = layers.slice();
      if (!ctx) { pending = { name, layers: wantLayers }; return; }
      if (name === 'none') { stopSong(0.8); return; }
      if (cur && cur.name === name) { applyLayers(); return; }
      stopSong(0.4);
      const song = SONGS[name];
      if (!song) return;
      const tracks = song.tracks.map(t => ({ t, notes: split(t.notes), gain: ctx.createGain() }));
      const steps = Math.max(...tracks.map(x => x.notes.length));
      tracks.forEach(x => { x.gain.gain.value = 0; x.gain.connect(musicBus); });
      cur = { name, song, tracks, steps, step: 0, nextTime: ctx.currentTime + 0.08, spb: 60 / song.bpm / 2 };
      applyLayers(true);
      cur.timer = setInterval(schedule, 25);
      schedule();
    },
    setLayers(layers) { wantLayers = layers.slice(); applyLayers(); },

    sfx(name) { if (ctx) try { SFX[name] && SFX[name](ctx.currentTime); } catch (e) { /* 音效失敗不影響遊戲 */ } },
  };
  let pending = null;

  function applyLayers(instant) {
    if (!cur) return;
    for (const x of cur.tracks) {
      const on = cur.name !== 'tower' || x.t.layer === 'base' || wantLayers.includes(x.t.layer);
      const v = on ? x.t.vol : 0;
      if (instant) x.gain.gain.value = v;
      else x.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.6);
    }
  }

  function stopSong(fade) {
    if (!cur) return;
    const old = cur; cur = null;
    clearInterval(old.timer);
    for (const x of old.tracks) {
      x.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => { try { x.gain.disconnect(); } catch (e) { /* 已經斷了 */ } }, fade * 1000 + 600);
    }
  }

  function schedule() {
    if (!cur) return;
    while (cur.nextTime < ctx.currentTime + 0.15) {
      for (const x of cur.tracks) {
        const tok = x.notes[cur.step % x.notes.length];
        if (!tok || tok === '.' || tok === '-') continue;
        // 長度＝後面接著幾個 '-'
        let len = 1;
        for (let i = cur.step + 1; i < cur.step + x.notes.length; i++) { if (x.notes[i % x.notes.length] === '-') len++; else break; }
        if (x.t.inst === 'drums') drum(tok, cur.nextTime, x.gain);
        else voice(x.t.inst, freq(tok), cur.nextTime, len * cur.spb, x.gain);
      }
      cur.step = (cur.step + 1) % cur.steps;
      cur.nextTime += cur.spb;
    }
  }

  function env(g, t, a, peak, d, sus, rel, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * sus, t + a + d);
    g.gain.setValueAtTime(peak * sus, t + Math.max(a + d, dur));
    g.gain.linearRampToValueAtTime(0.0001, t + Math.max(a + d, dur) + rel);
  }

  function voice(inst, f, t, dur, out) {
    if (!f) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(out);
    if (inst === 'lead') {
      o.type = 'square'; o.frequency.value = f;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = f * 0.006; lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t + 0.12); lfo.stop(t + dur + 0.2);
      env(g, t, 0.01, 1, 0.08, 0.7, 0.06, dur * 0.92);
    } else if (inst === 'pulse') {
      o.type = 'square'; o.frequency.value = f;
      env(g, t, 0.005, 1, 0.06, 0.4, 0.04, dur * 0.8);
    } else if (inst === 'bass') {
      o.type = 'triangle'; o.frequency.value = f;
      env(g, t, 0.01, 1, 0.1, 0.8, 0.05, dur * 0.9);
    } else if (inst === 'bell') {
      o.type = 'sine'; o.frequency.value = f;
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = f * 2.76; g2.gain.value = 0.25;
      o2.connect(g2); g2.connect(g);
      o2.start(t); o2.stop(t + dur + 1.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur + 1.4);
      o.start(t); o.stop(t + dur + 1.6);
      return;
    }
    o.start(t); o.stop(t + dur + 0.2);
  }

  function noise(t, dur, filterType, fq, peak, out, q) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = fq; if (q) f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f); f.connect(g); g.connect(out);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  function kick(t, out, peak) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.connect(g); g.connect(out);
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(peak || 1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.32);
  }

  function drum(tok, t, out) {
    if (tok.includes('k')) kick(t, out);
    if (tok.includes('s')) { noise(t, 0.16, 'bandpass', 1800, 0.7, out, 0.8); tone('triangle', 190, t, 0.08, 0.3, out); }
    if (tok.includes('h')) noise(t, 0.04, 'highpass', 7000, 0.35, out);
  }

  function tone(type, f, t, dur, peak, out, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(g); g.connect(out || sfxBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const arp = (type, notes, t, gap, dur, peak) => notes.forEach((n, i) => tone(type, freq(n), t + i * gap, dur, peak));

  const SFX = {
    step: t => noise(t, 0.03, 'lowpass', 900, 0.08, sfxBus),
    bump: t => tone('square', 90, t, 0.1, 0.15, sfxBus, 70),
    door: t => { tone('square', 220, t, 0.08, 0.12); tone('square', 165, t + 0.07, 0.12, 0.12); noise(t, 0.2, 'lowpass', 1200, 0.25, sfxBus); },
    key: t => arp('triangle', ['c6', 'e6', 'g6'], t, 0.05, 0.12, 0.3),
    item: t => arp('square', ['g5', 'c6', 'e6', 'g6'], t, 0.06, 0.14, 0.12),
    gem: t => arp('sine', ['c6', 'g6', 'c7', 'e7'], t, 0.045, 0.2, 0.3),
    potion: t => { tone('sine', 300, t, 0.12, 0.35, sfxBus, 700); tone('sine', 500, t + 0.12, 0.12, 0.3, sfxBus, 900); },
    hit: t => { noise(t, 0.08, 'bandpass', 1400, 0.5, sfxBus, 1); tone('square', 240, t, 0.08, 0.1, sfxBus, 110); },
    hurt: t => { tone('sawtooth', 160, t, 0.12, 0.15, sfxBus, 80); },
    kill: t => arp('square', ['e5', 'c5', 'g4', 'c4'], t, 0.04, 0.08, 0.1),
    stairs: t => arp('triangle', ['c5', 'e5', 'g5', 'c6', 'e6'], t, 0.04, 0.1, 0.25),
    stairsDown: t => arp('triangle', ['e6', 'c6', 'g5', 'e5', 'c5'], t, 0.04, 0.1, 0.25),
    blip: t => tone('square', 700 + Math.random() * 250, t, 0.03, 0.04),
    select: t => tone('square', 880, t, 0.05, 0.08),
    fanfare: t => {
      arp('square', ['c5', 'e5', 'g5'], t, 0.1, 0.12, 0.12);
      ['c6', 'e5', 'g5'].forEach(n => tone('square', freq(n), t + 0.32, 0.8, 0.09));
      tone('triangle', freq('c4'), t + 0.32, 0.8, 0.3);
    },
    boom: t => { kick(t, sfxBus, 1.4); noise(t, 0.5, 'lowpass', 300, 0.6, sfxBus); },
    harp: t => arp('sine', ['c5', 'e5', 'g5', 'b5', 'd6', 'f6', 'a6', 'c7'], t, 0.045, 0.6, 0.18),
    page: t => noise(t, 0.3, 'bandpass', 3000, 0.25, sfxBus, 0.5),
    nohit: t => { tone('sine', 110, t, 0.2, 0.4, sfxBus, 60); noise(t, 0.1, 'lowpass', 400, 0.3, sfxBus); },
    drumroll: t => { for (let i = 0; i < 18; i++) noise(t + i * 0.05, 0.08, 'bandpass', 1600, 0.25 + i * 0.03, sfxBus, 0.8); kick(t + 0.95, sfxBus, 1.5); },
    // 阿爾特變聲期破音的歌聲：鋸齒波亂滑音＋誇張顫音
    badsing: t => {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; lfo.frequency.value = 7; lg.gain.value = 25;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(sfxBus);
      const path = [220, 300, 250, 390, 180, 330, 262, 410, 200, 350];
      path.forEach((f, i) => o.frequency.linearRampToValueAtTime(f, t + i * 0.18));
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05);
      g.gain.setValueAtTime(0.12, t + 1.6); g.gain.linearRampToValueAtTime(0.0001, t + 1.85);
      for (let i = 0; i < 8; i++) kick(t + i * 0.23, sfxBus, 1);
      o.start(t); lfo.start(t); o.stop(t + 1.9); lfo.stop(t + 1.9);
    },
    // 序章練唱：破音 1.6 秒後全場哄笑（一串高低不同的短促「哈」，越後面越稀）
    crackLaugh: t => {
      SFX.badsing(t);
      for (let i = 0; i < 22; i++) {
        const f = 260 + Math.random() * 380, at = t + 1.6 + i * 0.09 + Math.random() * 0.06 + i * i * 0.004;
        tone('square', f, at, 0.07, 0.05 * (1 - i / 26), sfxBus, f * 0.75);
      }
    },
    buy: t => arp('square', ['b5', 'e6'], t, 0.08, 0.18, 0.1),
    error: t => { tone('square', 150, t, 0.1, 0.12); tone('square', 120, t + 0.12, 0.12, 0.12); },
    gate: t => { noise(t, 0.8, 'lowpass', 250, 0.6, sfxBus); tone('square', 60, t, 0.6, 0.08, sfxBus, 45); },
    save: t => arp('sine', ['e6', 'b6'], t, 0.1, 0.3, 0.2),
    fly: t => arp('sine', ['g5', 'd6', 'g6', 'd7'], t, 0.05, 0.25, 0.2),
  };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
