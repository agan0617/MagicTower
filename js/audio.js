/* 音樂與音效：用 Web Audio 即時合成；唯一的例外是王子之歌（audio/prince.mp3，見 PRINCE）。
   塔裡的背景音樂分層：一開始只剩低音和零星的鐘聲（聲音被偷走了），
   打倒鼓魔像找回「鼓」、打倒弦之魔女找回「弦」、打倒回音之鏡找回「笛」，對應的聲部才會回來。 */
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
      gain: 0.5,   // 整首的音量倍率（3.2.22 Ken 指定：預設音量改 100% 後，標題曲壓到一半）
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
        { layer: 'winds', inst: 'flute', vol: 0.11, notes:
          'g5 - - - e5 - - -  d5 - - - g5 - - -  e5 - - - c5 - - -  f5 - - - a5 - - - ' +
          'g5 - - - e5 - - -  d5 - - - b4 - - -  a4 - - - b4 - - -  c5 - - - - - - -' },
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
        { layer: 'winds', inst: 'flute', vol: 0.10, notes:
          'e5 - - - c5 - - -  c5 - - - a4 - - -  b4 - - - d5 - - -  b4 - - - g#4 - - - ' +
          'c5 - - - e5 - - -  f5 - - - e5 - - -  f5 - - - e5 - - -  e5 - - - - - - -' },
      ],
    },
    boss: {
      gain: 0.8,   // 3.2.31 Ken 指定：Boss 層（5F／10F／15F／20F 共用這首）音量 80%
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
        { layer: 'winds', inst: 'flute', vol: 0.09, notes:
          'a5 - - - f5 - - -  f5 - - - d5 - - -  g5 - - - e5 - - -  e5 - - - a5 - - - ' +
          'a5 - - - d6 - - -  bb5 - - - f5 - - -  g5 - - - c6 - - -  a5 - - - c#6 - - -' },
      ],
    },
  };
  // 最終決戰專屬曲（3.2.46 Ken 指定）：E 小調、低音一路往前推，主旋律是英雄式的上行；四樣找回來的樂器全部到齊。
  // 二階段 finale2 同一首、速度更快
  SONGS.finale = {
    gain: 0.85,
    bpm: 160,
    tracks: [
      { layer: 'lead', inst: 'lead', vol: 0.15, notes:
        'e5 - g5 - b5 - - -  c6 - b5 - g5 - e5 -  d6 - c6 - b5 - a5 -  b5 - - - f#5 - - - ' +
        'e5 - g5 - b5 - e6 -  c6 - - - b5 - g5 -  a5 - c6 - e6 - d6 c6  b5 - - - d#6 - - -' },
      { layer: 'base', inst: 'bass', vol: 0.32, notes:
        'e2 e3 e2 e3 e2 e3 e2 e3  c2 c3 c2 c3 c2 c3 c2 c3  d2 d3 d2 d3 d2 d3 d2 d3  b1 b2 b1 b2 b1 b2 b1 b2 ' +
        'e2 e3 e2 e3 e2 e3 e2 e3  c2 c3 c2 c3 c2 c3 c2 c3  a1 a2 a1 a2 a1 a2 a1 a2  b1 b2 b1 b2 d#3 b2 f#3 b2' },
      { layer: 'strings', inst: 'pulse', vol: 0.05, notes:
        'e4 g4 b4 g4 e4 g4 b4 g4  c4 e4 g4 e4 c4 e4 g4 e4  d4 f#4 a4 f#4 d4 f#4 a4 f#4  b3 d#4 f#4 d#4 b3 d#4 f#4 d#4 ' +
        'e4 g4 b4 g4 e4 g4 b4 g4  c4 e4 g4 e4 c4 e4 g4 e4  a3 c4 e4 c4 a3 c4 e4 c4  b3 d#4 f#4 d#4 b3 d#4 f#4 a4' },
      { layer: 'drums', inst: 'drums', vol: 0.55, notes:
        'k h s h k k s h  k h s h k k s h  k h s h k k s h  k h s h k s s s ' +
        'k h s h k k s h  k h s h k k s h  k h s h k k s h  s s s s k s k s' },
      { layer: 'winds', inst: 'flute', vol: 0.09, notes:
        'b5 - - - - - - -  g5 - - - - - - -  a5 - - - - - - -  f#5 - - - - - - - ' +
        'b5 - - - - - - -  e6 - - - - - - -  e6 - - - - - - -  d#6 - - - - - - -' },
    ],
  };
  SONGS.finale2 = Object.assign({}, SONGS.finale, { bpm: 178 });
  // 多蕾告別（3.2.47 Ken 指定）：慢版、只剩音樂盒的音色，A 小調下行，最後停在一個長音
  SONGS.farewell = {
    bpm: 72,
    tracks: [
      { layer: 'base', inst: 'bell', vol: 0.16, notes:
        'a5 - - - e5 - - -  f5 - - - c5 - - -  d5 - - - a4 - - -  b4 - - - e5 - - - ' +
        'a5 - c6 - b5 - a5 -  g5 - - - e5 - - -  f5 - e5 - d5 - c5 -  b4 - - - - - - -' },
      { layer: 'base', inst: 'bell', vol: 0.06, notes:
        'c5 - e5 - a5 - e5 -  a4 - c5 - f5 - c5 -  f4 - a4 - d5 - a4 -  g#4 - b4 - e5 - b4 - ' +
        'c5 - e5 - a5 - e5 -  c5 - e5 - g5 - e5 -  a4 - c5 - f5 - c5 -  g#4 - b4 - e5 - - -' },
      { layer: 'base', inst: 'bass', vol: 0.12, notes:
        'a2 - - - - - - -  f2 - - - - - - -  d2 - - - - - - -  e2 - - - - - - - ' +
        'a2 - - - - - - -  c3 - - - - - - -  d2 - - - - - - -  e2 - - - - - - -' },
    ],
  };
  SONGS.ending = Object.assign({}, SONGS.title, { bpm: 112 });

  /* 王子之歌（3.6 Ken 指定）：唯一一首用音檔的曲子，〈星光音樂盒〉原曲。
     同一段 8 小節主題唱四遍、一遍比一遍完整：打倒鼓魔像（5F）找回第一段、弦之魔女（10F）第二段、回音之鏡（15F）第三段，
     真結局才有第四段（完整版）。背景樂循環「第一段到目前那段」，找回新的一段時不用重來，播到那裡就會接下去。
     cuts＝每段在音檔裡開始的秒數（第一拍起音前 15ms，84 bpm、每段 22.86 秒）；接回開頭時舊的在接縫前 fade 秒淡出，
     第四段播完就是曲尾，讓餘音自然收掉。gain：音檔比合成的曲子大聲，壓到差不多 */
  const PRINCE = { url: 'audio/prince.mp3', cuts: [0, 22.841, 45.701, 68.562, 91.42], fade: 0.08, gain: 0.6 };
  // 第幾段：看找回了哪些樂器（drums＝鼓、strings＝豎琴、winds＝笛、lead＝真結局）
  const princeStage = () => wantLayers.includes('lead') ? 4 : wantLayers.includes('winds') ? 3 : wantLayers.includes('strings') ? 2 : 1;
  let princeBuf = null, princeLoading = null;
  function loadPrince() {
    if (princeBuf || princeLoading) return princeLoading;
    princeLoading = fetch(PRINCE.url).then(r => r.arrayBuffer())
      .then(b => new Promise((ok, ng) => ctx.decodeAudioData(b, ok, ng)))   // 舊版 Safari 只吃 callback 寫法
      .then(buf => { princeBuf = buf; })
      .catch(() => { princeLoading = null; });                              // 抓不到（離線又沒快取）就沒有這首，下次再試
    return princeLoading;
  }

  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  const vol = { music: 1, sfx: 1 };
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
      loadPrince();
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
      if (name === 'prince') { playPrince(); return; }
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

    // 把已經排好、還沒放完的音效全部收掉（3.2.32 Ken 指定：略過過場時心跳等聲音會拖到下一幕）：
    // 換一條新的音效匯流排，舊的那條快速淡出後拔掉，接在上面的聲音就一起停了
    cutSfx() {
      if (!ctx) return;
      const old = sfxBus;
      sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => { try { old.disconnect(); } catch (e) { /* 已經斷了 */ } }, 300);
    },
    sfx(name) { if (ctx) try { SFX[name] && SFX[name](ctx.currentTime); } catch (e) { /* 音效失敗不影響遊戲 */ } },
    // 對話打字的「嘟嘟」聲：每個角色一種聲音（見 VOICES），沒列到的用預設
    voice(speaker) { if (ctx) try { voiceBlip(VOICES[speaker] || VOICES.default, ctx.currentTime); } catch (e) { /* 同上 */ } },
  };
  let pending = null;

  // 王子之歌：從頭播，播到目前那段的結尾就接回開頭（音檔還沒抓好就等抓好再開始）
  function playPrince() {
    const me = cur = { name: 'prince', gain: ctx.createGain(), srcs: [] };
    me.gain.gain.value = PRINCE.gain; me.gain.connect(musicBus);
    const from = t0 => {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = princeBuf; src.connect(g); g.connect(me.gain);
      src.start(t0);
      src.onended = () => { me.srcs = me.srcs.filter(x => x.src !== src); try { g.disconnect(); } catch (e) { /* 已經斷了 */ } };
      me.srcs.push(me.now = { src, g, t0 });
    };
    const go = () => {
      if (cur !== me || !princeBuf) return;
      from(ctx.currentTime + 0.08);
      me.timer = setInterval(() => {
        const st = princeStage(), now = me.now;
        const end = Math.max(now.t0 + PRINCE.cuts[st], ctx.currentTime + 0.05);
        if (ctx.currentTime < end - 0.3) return;
        // 接縫：前三段的結尾緊接著下一段的第一拍，要在那之前淡掉；第四段後面只剩餘音，放著讓它自己收
        if (st < 4) {
          now.g.gain.setValueAtTime(1, end - PRINCE.fade);
          now.g.gain.linearRampToValueAtTime(0, end);
          now.src.stop(end + 0.02);
        }
        from(end);
      }, 100);
    };
    if (princeBuf) go(); else (loadPrince() || Promise.resolve()).then(go);
  }

  function applyLayers(instant) {
    if (!cur || !cur.tracks) return;   // 王子之歌沒有聲部，找回的段落在下一次接縫時才生效
    for (const x of cur.tracks) {
      const on = cur.name !== 'tower' || x.t.layer === 'base' || wantLayers.includes(x.t.layer);
      const v = on ? x.t.vol * (cur.song.gain || 1) : 0;
      if (instant) x.gain.gain.value = v;
      else x.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.6);
    }
  }

  function stopSong(fade) {
    if (!cur) return;
    const old = cur; cur = null;
    clearInterval(old.timer);
    if (old.srcs) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => {
        old.srcs.forEach(x => { try { x.src.stop(); } catch (e) { /* 已經停了 */ } });
        try { old.gain.disconnect(); } catch (e) { /* 已經斷了 */ }
      }, fade * 1000 + 600);
      return;
    }
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
    } else if (inst === 'flute') {
      // 笛：柔和的起音＋慢慢加深的顫音（15F 打倒回音之鏡後才出現的聲部）
      o.type = 'triangle'; o.frequency.value = f;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 4.8; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.008, t + 0.25);
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.3);
      env(g, t, 0.06, 1, 0.12, 0.75, 0.12, dur * 0.95);
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

  // 門軸的嘎吱聲：dur 秒、peak 音量；音高與音量都不規則地抖（像推一下卡一下）
  function creak(t, dur, peak) {
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 7;
    o.frequency.setValueAtTime(70, t);
    for (let i = 1, n = Math.round(dur * 14); i <= n; i++) o.frequency.linearRampToValueAtTime(60 + ((i * 37) % 11) * 9, t + dur * i / n);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.05);
    for (let i = 1, n = Math.round(dur * 8); i < n; i++) g.gain.linearRampToValueAtTime(peak * (0.45 + ((i * 53) % 7) / 12), t + dur * i / n);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
    noise(t, dur, 'bandpass', 2200, peak * 0.25, sfxBus, 2);
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

  /* 對話的角色聲音：f 音高範圍（每一聲隨機挑）、bend 尾音滑到幾倍、lp 低通（悶一點）、detune 疊一個走音的聲部、
     echo 後面跟兩聲回音、crack 偶爾破音往上跳（阿爾特變聲期）。阿爾特＝中音三角波，跟其他人一聽就分得開 */
  const VOICES = {
    tink: { type: 'triangle', f: [300, 380], dur: 0.05, peak: 0.13, bend: 0.85, crack: 0.07 },
    shadow: { type: 'sawtooth', f: [150, 185], dur: 0.07, peak: 0.07, bend: 0.8, lp: 900, detune: 9 },
    doremi: { type: 'sine', f: [1250, 1550], dur: 0.045, peak: 0.1, bend: 1.15 },
    bard: { type: 'square', f: [185, 235], dur: 0.06, peak: 0.05, bend: 0.9 },
    smith: { type: 'sawtooth', f: [120, 150], dur: 0.07, peak: 0.08, lp: 700 },
    porter: { type: 'triangle', f: [235, 285], dur: 0.06, peak: 0.12, bend: 0.92 },
    granny: { type: 'triangle', f: [520, 620], dur: 0.06, peak: 0.11, bend: 0.88 },
    frog: { type: 'square', f: [380, 480], dur: 0.06, peak: 0.05, bend: 0.55 },
    pigeon: { type: 'sine', f: [360, 420], dur: 0.07, peak: 0.13, bend: 0.75 },
    golem: { type: 'square', f: [70, 90], dur: 0.09, peak: 0.08, lp: 450 },
    siren: { type: 'sine', f: [700, 900], dur: 0.07, peak: 0.08, bend: 1.25, detune: 12 },
    maestro: { type: 'sawtooth', f: [90, 105], dur: 0.09, peak: 0.08, lp: 650, detune: 7 },
    maestroRage: { type: 'sawtooth', f: [85, 125], dur: 0.07, peak: 0.1, lp: 900, detune: 14 },   // 失控的指揮家：同一把聲音但更粗、音高抖得更兇（3.2.75）
    harpghost: { type: 'sine', f: [600, 780], dur: 0.08, peak: 0.08, detune: 100 },
    soldier: { type: 'square', f: [260, 320], dur: 0.05, peak: 0.045, bend: 0.9 },
    guard: { type: 'square', f: [200, 250], dur: 0.05, peak: 0.05 },
    mirrorgirl: { type: 'sine', f: [900, 1100], dur: 0.05, peak: 0.09, bend: 1.05 },
    echo: { type: 'sine', f: [500, 600], dur: 0.06, peak: 0.09, echo: true },
    astrologer: { type: 'triangle', f: [450, 550], dur: 0.06, peak: 0.11, bend: 1.1 },
    lost: { type: 'square', f: [1000, 1200], dur: 0.025, peak: 0.035 },
    thief: { type: 'square', f: [600, 800], dur: 0.035, peak: 0.04, bend: 1.1 },
    harpist: { type: 'triangle', f: [330, 400], dur: 0.06, peak: 0.12, bend: 0.95 },
    apprentice: { type: 'triangle', f: [600, 720], dur: 0.045, peak: 0.11 },
    default: { type: 'square', f: [700, 950], dur: 0.03, peak: 0.04 },
  };
  function voiceBlip(v, t) {
    let f = v.f[0] + Math.random() * (v.f[1] - v.f[0]);
    if (v.crack && Math.random() < v.crack) f *= 1.7;
    let out = sfxBus;
    if (v.lp) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = v.lp; lp.connect(sfxBus); out = lp; }
    const one = (at, peak) => {
      tone(v.type, f, at, v.dur, peak, out, v.bend ? f * v.bend : undefined);
      if (v.detune) tone(v.type, f * (1 + v.detune / 1000), at, v.dur, peak * 0.7, out, v.bend ? f * v.bend : undefined);
    };
    one(t, v.peak);
    if (v.echo) { one(t + 0.09, v.peak * 0.45); one(t + 0.18, v.peak * 0.2); }
  }

  const SFX = {
    step: t => noise(t, 0.03, 'lowpass', 900, 0.08, sfxBus),
    bump: t => tone('square', 90, t, 0.1, 0.15, sfxBus, 70),
    // 開門（3.2.16 Ken 指定重做）：鑰匙插進去轉「喀」→ 門閂彈開「卡」→ 短短一聲嘎吱 → 門靠到牆的悶響
    door: t => {
      noise(t, 0.03, 'highpass', 6000, 0.35, sfxBus); tone('square', 2400, t, 0.02, 0.05, sfxBus, 1800);
      noise(t + 0.07, 0.06, 'bandpass', 1300, 0.7, sfxBus, 4); tone('triangle', 520, t + 0.07, 0.07, 0.14, sfxBus, 300);
      creak(t + 0.12, 0.26, 0.28);
      kick(t + 0.4, sfxBus, 0.45); noise(t + 0.4, 0.18, 'lowpass', 500, 0.3, sfxBus);
    },
    key: t => arp('triangle', ['c6', 'e6', 'g6'], t, 0.05, 0.12, 0.3),
    item: t => arp('square', ['g5', 'c6', 'e6', 'g6'], t, 0.06, 0.14, 0.12),
    gem: t => arp('sine', ['c6', 'g6', 'c7', 'e7'], t, 0.045, 0.2, 0.3),
    potion: t => { tone('sine', 300, t, 0.12, 0.35, sfxBus, 700); tone('sine', 500, t + 0.12, 0.12, 0.3, sfxBus, 900); },
    // ── 序章的過場音效 ──
    // 被笑之後的黑暗裡：耳朵裡的笑聲一聲聲回響、越來越稀越小
    laughEcho: t => {
      for (let i = 0; i < 9; i++) {
        const at = t + 0.2 + i * 0.36 + Math.random() * 0.08, f = 300 + Math.random() * 300, k = 1 - i / 10;
        tone('square', f, at, 0.07, 0.035 * k, sfxBus, f * 0.75);
        tone('square', f, at + 0.13, 0.07, 0.015 * k, sfxBus, f * 0.75);   // 回音
      }
    },
    // 逃出練唱廳：一路跑的腳步（跟畫面上兩格輪流同拍），停下來之後喘三口氣
    runSteps: t => {
      for (let i = 0; i < 26; i++) {
        const at = t + i * 0.13;
        noise(at, 0.05, 'lowpass', 700, i % 2 ? 0.22 : 0.3, sfxBus);
        kick(at, sfxBus, 0.18);
      }
      for (let i = 0; i < 3; i++) {
        const at = t + 3.7 + i * 0.55, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.8;
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.18, at + 0.12); g.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
        src.connect(f); f.connect(g); g.connect(sfxBus); src.start(at, Math.random() * 0.5); src.stop(at + 0.45);
      }
    },
    // 國王走進打鐵鋪的沉重腳步
    footstep: t => { kick(t, sfxBus, 0.55); noise(t, 0.09, 'lowpass', 420, 0.35, sfxBus); },
    // 打鐵鋪裡平常敲鐵的聲音（比第一鎚輕）
    anvil: t => {
      noise(t, 0.06, 'bandpass', 3500, 0.3, sfxBus, 2);
      tone('triangle', 1760, t, 0.45, 0.07, sfxBus, 1720);
      tone('square', 1318, t, 0.12, 0.03, sfxBus);
    },
    // 腦海裡的聲音：一陣耳語般的氣音湧上來又退下去
    whisper: t => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true; f.type = 'bandpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(1800 + Math.random() * 1400, t); f.frequency.linearRampToValueAtTime(1200, t + 1.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14, t + 0.35); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t, Math.random() * 0.5); src.stop(t + 1.25);
    },
    // 影子睜開紅眼：一記低沉走音的重音，上面一聲刺耳的高音
    eyesOpen: t => {
      for (const d of [0, 8]) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 73.4 * (1 + d / 1000);
        f.type = 'lowpass'; f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.65);
      }
      tone('sine', 2960, t + 0.05, 0.9, 0.04, sfxBus, 2790);
    },
    // 黑衣人從影子裡長出來：越來越近的低鳴
    shadowRise: t => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass';
      f.frequency.setValueAtTime(90, t); f.frequency.exponentialRampToValueAtTime(900, t + 2.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 2.0); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t); src.stop(t + 2.7);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(41, t); o.frequency.linearRampToValueAtTime(55, t + 2.1);
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.4, t + 2.0); og.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + 2.6);
    },
    // 黑衣人升到最高點後的笑聲（3.2.31 Ken 指定）：低沉的「呵、呵、呵…」一聲比一聲低，帶一點氣音和回音
    evilLaugh: t => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 1.4; bp.connect(sfxBus);
      for (let i = 0; i < 6; i++) {
        const at = t + i * 0.2 + (i > 2 ? 0.08 : 0), f0 = 150 - i * 9, v = 0.5 - i * 0.05;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.15, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.85, at + 0.16);
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(v, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + 0.17);
        o.connect(g); g.connect(bp); o.start(at); o.stop(at + 0.2);
        noise(at, 0.12, 'bandpass', 1200, 0.18 * v, sfxBus, 1);                 // 氣音
        tone('sawtooth', f0 * 0.85, at + 0.45, 0.14, 0.04, sfxBus, f0 * 0.7);    // 遠遠的回音
      }
    },
    // 指揮棒一舉：一段旋律剛起頭就被拉走——音一個個往下滑、越來越悶，最後被一陣風聲吸成一片寂靜
    silence: t => {
      const notes = ['c5', 'e5', 'g5', 'c6', 'e6', 'g6', 'c7'];
      notes.forEach((n, i) => {
        const at = t + i * 0.09, f0 = freq(n), o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.5, at + 0.9);
        f.type = 'lowpass'; f.frequency.setValueAtTime(5000, at); f.frequency.exponentialRampToValueAtTime(300, at + 0.9);
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.12, at + 0.01); g.gain.exponentialRampToValueAtTime(0.001, at + 0.95);
        o.connect(f); f.connect(g); g.connect(sfxBus); o.start(at); o.stop(at + 1);
      });
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true; f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(6000, t + 0.2); f.frequency.exponentialRampToValueAtTime(200, t + 1.6);
      g.gain.setValueAtTime(0.0001, t + 0.2); g.gain.linearRampToValueAtTime(0.35, t + 0.9); g.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t + 0.2); src.stop(t + 1.75);
    },
    // 多蕾出場：光點聚過去的一陣往上爬的閃爍，然後「啵」地彈出來
    fairyPop: t => {
      for (let i = 0; i < 8; i++) tone('sine', 1200 + i * 180 + Math.random() * 60, t + i * 0.11, 0.12, 0.04 + i * 0.006, sfxBus);
      tone('sine', 380, t + 1.0, 0.12, 0.25, sfxBus, 1100);
      arp('sine', ['c7', 'e7', 'g7', 'c8'], t + 1.05, 0.04, 0.35, 0.12);
    },
    // 序章靜默之塔從地底升起（約 3.2 秒，跟畫面一樣先快後慢）：低頻的轟隆聲＋往下沉的低音，
    // 石頭摩擦的悶響越來越稀，最後「轟」一聲定住，再拖一記兩個音互相打架的低沉鐘響
    // 塔門（進塔前的第一人稱）：舊門軸的嘎——鋸齒波在窄帶通裡忽高忽低地抖，加一點木頭摩擦的沙沙聲
    doorCreak: t => creak(t, 0.4, 0.5),
    doorGroan: t => creak(t, 1.3, 0.75),
    // 門板撞上裡面的牆：一記悶響，在空蕩的塔裡迴盪三次
    doorThud: t => { for (let i = 0; i < 3; i++) { kick(t + i * 0.32, sfxBus, 1.5 * (1 - i * 0.35)); noise(t + i * 0.32, 0.4, 'lowpass', 260 - i * 50, 0.6 * (1 - i * 0.35), sfxBus); } },
    towerRise: t => {
      const D = 3.2;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(160, t); f.frequency.linearRampToValueAtTime(80, t + D);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.1, t + 0.3);
      g.gain.setValueAtTime(1.1, t + 1.0); g.gain.exponentialRampToValueAtTime(0.001, t + D + 0.4);
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t); src.stop(t + D + 0.5);
      const o = ctx.createOscillator(), of = ctx.createBiquadFilter(), og = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(44, t); o.frequency.linearRampToValueAtTime(30, t + D);
      of.type = 'lowpass'; of.frequency.value = 180;
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.35, t + 0.4); og.gain.exponentialRampToValueAtTime(0.001, t + D + 0.3);
      o.connect(of); of.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + D + 0.4);
      for (let i = 0, at = t + 0.08; i < 9; i++) { kick(at, sfxBus, 1.0 * (1 - i / 11)); at += 0.22 + i * 0.05; }   // 越往後越慢
      kick(t + D, sfxBus, 1.8); noise(t + D, 1.0, 'lowpass', 240, 1.0, sfxBus);
      for (const fq of [98, 103.8]) tone('sine', fq, t + D + 0.05, 3, 0.22, sfxBus);
    },
    // 序章阿爾特第一次看到塔：頭上冒「！」那一下，短促往上滑的兩聲
    startle: t => {
      tone('square', 520, t, 0.07, 0.11, sfxBus, 1100);
      tone('square', 1480, t + 0.075, 0.22, 0.09, sfxBus, 1400);
      tone('triangle', 740, t + 0.075, 0.22, 0.12, sfxBus);
    },
    // 序章第一鎚：鐵砧上「噹——」一聲，高頻金屬泛音拖長尾音
    clang: t => {
      kick(t, sfxBus, 0.9);
      noise(t, 0.12, 'bandpass', 3800, 0.6, sfxBus, 2);
      tone('square', 1320, t, 0.9, 0.08, sfxBus, 1250);
      tone('triangle', 2093, t, 1.4, 0.16, sfxBus, 2050);
      tone('sine', 3136, t, 1.1, 0.08, sfxBus);
    },
    // ── 撿道具：愛心、小劍、小盾各有自己的聲音 ──
    heart: t => {
      arp('sine', ['c5', 'g5', 'c6'], t, 0.07, 0.4, 0.22);
      tone('triangle', freq('e4'), t, 0.5, 0.12, sfxBus);
      tone('sine', freq('e6'), t + 0.21, 0.6, 0.08, sfxBus);
    },
    swordGet: t => {   // 拔劍出鞘的「鏘」
      noise(t, 0.22, 'highpass', 5000, 0.25, sfxBus);
      tone('triangle', 1568, t + 0.02, 0.4, 0.14, sfxBus, 2093);
      tone('sine', 3136, t + 0.08, 0.35, 0.05, sfxBus);
    },
    shieldGet: t => {  // 盾牌一頓「咚——」帶一點金屬餘音
      kick(t, sfxBus, 0.5);
      tone('square', 392, t, 0.1, 0.06, sfxBus);
      tone('triangle', 784, t + 0.03, 0.5, 0.12, sfxBus, 770);
      tone('sine', 1175, t + 0.03, 0.45, 0.05, sfxBus);
    },
    // 數字飛進資訊列落地的那一下（音高照數值分）；金幣是兩聲叮
    tallyHp: t => tone('sine', freq('a5'), t, 0.14, 0.12, sfxBus),
    tallyAtk: t => tone('sine', freq('d6'), t, 0.14, 0.12, sfxBus),
    tallyDef: t => tone('sine', freq('b5'), t, 0.14, 0.12, sfxBus),
    tallyGold: t => { tone('square', freq('b6'), t, 0.07, 0.05, sfxBus); tone('square', freq('e7'), t + 0.07, 0.2, 0.05, sfxBus); },
    // ── 戰鬥 ──
    hitBig: t => { noise(t, 0.12, 'bandpass', 1000, 0.6, sfxBus, 1); tone('square', 180, t, 0.12, 0.12, sfxBus, 70); kick(t, sfxBus, 0.9); },
    reflect: t => { tone('sine', 2637, t, 0.18, 0.1, sfxBus, 3136); noise(t, 0.05, 'bandpass', 4500, 0.2, sfxBus, 3); },
    drain: t => {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.45);
      lfo.frequency.value = 18; lg.gain.value = 30; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + 0.52); lfo.stop(t + 0.52);
    },
    // ── 3.1 地形 ──
    // 回音地板：上一場的那一擊在走廊裡又響了一次——同一記悶響一聲比一聲遠、越來越小
    echoHit: t => {
      for (let i = 0; i < 4; i++) {
        const at = t + i * 0.14, k = 1 - i * 0.24;
        noise(at, 0.07, 'bandpass', 1300 - i * 220, 0.45 * k, sfxBus, 1);
        tone('square', 220 - i * 18, at, 0.09, 0.09 * k, sfxBus, 100);
      }
    },
    // 回音地板，這層還沒打過：只有水面般的一圈輕響
    echoQuiet: t => { tone('sine', 1568, t, 0.25, 0.06, sfxBus, 1480); tone('sine', 1568, t + 0.16, 0.25, 0.025, sfxBus, 1480); },
    // 共鳴：水晶被震到的嗡——兩個靠很近的高音互相打架，加一點刺耳的雜音
    auraHit: t => {
      tone('triangle', 1760, t, 0.22, 0.07, sfxBus);
      tone('triangle', 1790, t, 0.22, 0.07, sfxBus);
      noise(t, 0.06, 'highpass', 6000, 0.12, sfxBus);
      tone('sawtooth', 140, t, 0.1, 0.06, sfxBus, 90);
    },
    // 攻擊、受擊：3.2.16 重做過，Ken 聽了要換回原本的（3.2.18）
    hit: t => { noise(t, 0.08, 'bandpass', 1400, 0.5, sfxBus, 1); tone('square', 240, t, 0.08, 0.1, sfxBus, 110); },
    hurt: t => { tone('sawtooth', 160, t, 0.12, 0.15, sfxBus, 80); },
    // 打倒：「噗」地消散＋一串往上的亮音（原本是往下掉的音階，聽起來像輸了）
    kill: t => {
      noise(t, 0.28, 'bandpass', 1600, 0.45, sfxBus, 0.7);
      kick(t, sfxBus, 0.4);
      arp('triangle', ['g5', 'c6', 'e6', 'g6'], t + 0.04, 0.04, 0.16, 0.11);
      tone('sine', freq('c7'), t + 0.2, 0.35, 0.05, sfxBus);
    },
    stairs: t => arp('triangle', ['c5', 'e5', 'g5', 'c6', 'e6'], t, 0.04, 0.1, 0.25),
    stairsDown: t => arp('triangle', ['e6', 'c6', 'g5', 'e5', 'c5'], t, 0.04, 0.1, 0.25),
    select: t => tone('square', 880, t, 0.05, 0.08),
    fanfare: t => {
      arp('square', ['c5', 'e5', 'g5'], t, 0.1, 0.12, 0.12);
      ['c6', 'e5', 'g5'].forEach(n => tone('square', freq(n), t + 0.32, 0.8, 0.09));
      tone('triangle', freq('c4'), t + 0.32, 0.8, 0.3);
    },
    boom: t => { kick(t, sfxBus, 1.4); noise(t, 0.5, 'lowpass', 300, 0.6, sfxBus); },
    // 打倒 Boss 的勝利小曲（3.2.24 Ken 指定，原創旋律，約 2.7 秒）：三連音往上衝 → 兩小句 → 最後一個長音配和弦
    // 多蕾最後一顆光點落在阿爾特身上的那一聲（3.2.47）：清亮的「叮——」帶一點泛音
    chime: t => { tone('sine', freq('e6'), t, 1.8, 0.16, sfxBus); tone('sine', freq('b6'), t + 0.02, 1.4, 0.06, sfxBus); tone('triangle', freq('e5'), t, 1.2, 0.05, sfxBus); },
    // 最後一擊前的慢動作：兩下很慢、很重的心跳（3.2.46）
    slowBeat: t => {
      for (const at of [0, 0.62]) { kick(t + at, sfxBus, 1.2); tone('triangle', 110, t + at, 0.18, 0.35, sfxBus, 60); noise(t + at, 0.14, 'lowpass', 400, 0.5, sfxBus); }
    },
    // 戰鬥中血少（勇者生命掉到開打前的 1/3 以下，3.7.0）：一下「怦—咚」，音色同 gateHeart（手機喇叭也聽得到）
    dangerBeat: t => {
      kick(t, sfxBus, 1.0); tone('triangle', 120, t, 0.14, 0.3, sfxBus, 70); noise(t, 0.1, 'lowpass', 420, 0.45, sfxBus);
      kick(t + 0.17, sfxBus, 0.7); tone('triangle', 100, t + 0.17, 0.12, 0.2, sfxBus, 62); noise(t + 0.17, 0.08, 'lowpass', 360, 0.3, sfxBus);
    },
    victory: t => {
      [['e5', 0, 0.11], ['g5', 0.12, 0.11], ['c6', 0.24, 0.3], ['b5', 0.58, 0.11], ['c6', 0.72, 0.11], ['d6', 0.86, 0.3],
       ['e6', 1.2, 0.3], ['d6', 1.52, 0.11], ['e6', 1.66, 0.11], ['g6', 1.8, 0.9]]
        .forEach(([n, at, d]) => tone('square', freq(n), t + at, d, 0.11, sfxBus));
      [['c3', 0, 0.5], ['f3', 0.58, 0.55], ['g3', 1.16, 0.55], ['c3', 1.8, 1.0]].forEach(([n, at, d]) => tone('triangle', freq(n), t + at, d, 0.3, sfxBus));
      ['c5', 'e5', 'g5'].forEach(n => tone('sine', freq(n), t + 1.8, 0.9, 0.06, sfxBus));
      [0, 0.58, 1.16, 1.8].forEach(at => noise(t + at, 0.12, 'highpass', 6000, 0.12, sfxBus));
    },
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
    // 序章吼完之後的心跳：八下「咚、咚」一下比一下快，底下墊一條慢慢變大的低音（節奏同 main.js 的 HEART_MS）
    // 推開塔門時的心跳（3.2.21 Ken 指定）：「怦—咚」一下比一下快、一下比一下大聲，一路跳到門撞上牆。
    // 原本的 heartbeat 只有 40～150Hz 的低頻，手機喇叭幾乎放不出來；這裡多疊 100～400Hz 的悶響，手機也聽得到
    gateHeart: t => {
      let at = t + 0.1;
      for (let i = 0; at < t + 4.3; i++) {
        const k = Math.min(1, i / 6), p = 0.55 + 0.45 * k;
        kick(at, sfxBus, 1.0 * p); tone('triangle', 120, at, 0.14, 0.32 * p, sfxBus, 70); noise(at, 0.1, 'lowpass', 420, 0.5 * p, sfxBus);
        kick(at + 0.17, sfxBus, 0.7 * p); tone('triangle', 100, at + 0.17, 0.12, 0.22 * p, sfxBus, 62); noise(at + 0.17, 0.08, 'lowpass', 360, 0.35 * p, sfxBus);
        at += 0.78 - 0.3 * k;                                             // 0.78 秒一下，越來越急，最後 0.48 秒一下
      }
    },
    heartbeat: t => {
      let at = t + 0.15;
      for (let i = 0; i < 8; i++) {
        if (i) at += (950 - i * 70) / 1000;
        kick(at, sfxBus, 1.1); kick(at + 0.16, sfxBus, 0.75);
        // 3.2.22：同 gateHeart 多疊 100～400Hz 的悶響，手機喇叭才聽得到（Ken 同意）
        const p = 0.6 + 0.4 * i / 7;
        tone('triangle', 120, at, 0.14, 0.3 * p, sfxBus, 70); noise(at, 0.1, 'lowpass', 420, 0.45 * p, sfxBus);
        tone('triangle', 100, at + 0.16, 0.12, 0.2 * p, sfxBus, 62); noise(at + 0.16, 0.08, 'lowpass', 360, 0.3 * p, sfxBus);
      }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(62, t + 6);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 5); g.gain.linearRampToValueAtTime(0.0001, t + 7);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 7.1);
    },
    buy: t => arp('square', ['b5', 'e6'], t, 0.08, 0.18, 0.1),
    error: t => { tone('square', 150, t, 0.1, 0.12); tone('square', 120, t + 0.12, 0.12, 0.12); },
    gate: t => { noise(t, 0.8, 'lowpass', 250, 0.6, sfxBus); tone('square', 60, t, 0.6, 0.08, sfxBus, 45); },
    save: t => arp('sine', ['e6', 'b6'], t, 0.1, 0.3, 0.2),
    fly: t => arp('sine', ['g5', 'd6', 'g6', 'd7'], t, 0.05, 0.25, 0.2),
  };
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
