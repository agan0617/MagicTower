/* 存檔與雲端同步（1.5.0 起，做法對齊K書吧的進度格）。
   存檔是一條清單：每台裝置一格自動存檔＋全部裝置共用最多 99 格手動存檔，新的在前。
   每一格有 id，每台裝置只會寫自己的格子（id 帶裝置 id），所以裝置之間不會互相蓋掉；
   合併＝兩邊的格子聯集，同一個 id 取比較新的。
   有 token 時跟私有 GitHub repo 裡的 saves/magictower/saves.json 對齊。token 由使用者在每台裝置貼一次，
   只存在那台裝置，直接從瀏覽器打 GitHub API，沒有任何中間伺服器。 */
(function (MT) {
  'use strict';

  const LS = {
    get(k, d) { try { const v = localStorage.getItem('mt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mt.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('mt.' + k); } catch (e) { /* 私密視窗 */ } },
  };
  MT.LS = LS;

  const DEFAULT = { owner: 'agan0617', repo: 'CloudSave', token: '' };
  // 存檔 repo 可能跟其他遊戲／K書吧共用，每款遊戲各用 saves/ 底下自己的目錄
  const FILE = 'saves/magictower/saves.json';
  // 舊格式（固定四格 auto／s1～s3、所有裝置共用）的位置：1.4.2～1.4.4 在 saves/magictower.json，更早在根目錄 saves.json。
  // 拉取時併進新清單、推上去後刪掉；還沒更新的舊頁面寫回來也會再被併進來
  const OLD_FILES = ['saves/magictower.json', 'saves.json'];
  const MANUAL_MAX = 99;
  const AUTO_MAX = 20;   // 自動存檔一台裝置一格；換瀏覽器、清資料都會變成新裝置，留最新的 20 台

  const b64enc = s => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); };
  const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0)));

  class GhError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

  function deviceName() {
    const ua = navigator.userAgent;
    if (/MagicTowerApp/.test(ua)) return 'Android App';
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Web';
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return os + (br ? ' ' + br : '');
  }
  // 裝置 id：第一次用的時候隨機產生，存在這台裝置（跟K書吧一樣）
  function deviceId() {
    let id = LS.get('device', null);
    if (!id) { id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); LS.set('device', id); }
    return id;
  }

  const EMPTY = () => ({ v: 2, list: [] });
  // 舊格式 { v:1, slots:{auto,s1,s2,s3} } 轉成清單。id 用存檔時間，本機和雲端轉出同一格就會是同一個 id
  function fromV1(o) {
    const list = [];
    if (o && o.slots) for (const k of Object.keys(o.slots)) {
      const s = o.slots[k];
      if (!s || !s.data) continue;
      list.push({ id: 'L:' + k + ':' + s.at, kind: k === 'auto' ? 'auto' : 'manual', dev: 'old', device: s.device || '', at: s.at, floor: s.floor, hp: s.hp, data: s.data });
    }
    return { v: 2, list };
  }
  const norm = o => (o && Array.isArray(o.list) ? o : o && o.slots ? fromV1(o) : EMPTY());

  // 聯集＋同 id 取新的，再依時間排序、各自截掉超過的
  function merge(a, b) {
    const m = new Map();
    for (const x of norm(a).list.concat(norm(b).list)) {
      const y = m.get(x.id);
      if (!y || x.at > y.at) m.set(x.id, x);
    }
    const all = [...m.values()].sort((x, y) => y.at - x.at);
    return { v: 2, list: all.filter(x => x.kind === 'auto').slice(0, AUTO_MAX).concat(all.filter(x => x.kind !== 'auto').slice(0, MANUAL_MAX)) };
  }
  const sig = o => norm(o).list.map(x => x.id + '@' + x.at).sort().join('|');

  const Sync = {
    status: 'off', error: '', lastSync: 0, sha: null,
    onStatus: null,
    device: deviceName(),
    devId: deviceId(),
    MANUAL_MAX,

    conf() { return Object.assign({}, DEFAULT, LS.get('gh', {})); },
    setConf(c) { LS.set('gh', c); },
    connected() { return !!this.conf().token; },

    local() {
      const s = LS.get('saves2', null);
      if (s && Array.isArray(s.list)) return s;
      // 第一次跑 1.5.0：把這台裝置舊的四格轉過來（舊的 mt.saves 不刪，退版還讀得到）
      const v = fromV1(LS.get('saves', null));
      this.writeLocal(v);
      return v;
    },
    writeLocal(s) {
      s = merge(s, EMPTY());
      if (!LS.set('saves2', s)) {
        // 空間不夠（極少見）：只留自動存檔
        LS.set('saves2', { v: 2, list: s.list.filter(x => x.kind === 'auto') });
      }
    },

    rec(kind, id, data) {
      return { id, kind, dev: this.devId, device: this.device, at: Date.now(), floor: data.floor, hp: data.hp, data };
    },
    put(r) {
      const s = this.local();
      s.list = s.list.filter(x => x.id !== r.id);
      s.list.unshift(r);
      this.writeLocal(s);
      this.schedulePush();
      return r;
    },
    /* 自動存檔：這台裝置自己那一格。data＝MT.pack(state) */
    saveAuto(data) { return this.put(this.rec('auto', 'a:' + this.devId, data)); },
    /* 手動存檔：沒給 id 就開新的一格；給 id 是覆蓋這台裝置自己存的那格 */
    saveManual(data, id) {
      if (id && !this.isMine(this.byId(id))) id = null;
      return this.put(this.rec('manual', id || 'm:' + this.devId + ':' + Date.now().toString(36), data));
    },
    isMine(r) { return !!r && r.dev === this.devId; },
    byId(id) { return this.local().list.find(x => x.id === id) || null; },
    autos() { return this.local().list.filter(x => x.kind === 'auto'); },
    manuals() { return this.local().list.filter(x => x.kind !== 'auto'); },
    myAuto() { return this.byId('a:' + this.devId); },
    // 「繼續遊戲」用：所有裝置裡最新的自動存檔
    latestAuto() { return this.autos()[0] || null; },
    manualFull() { return this.manuals().length >= MANUAL_MAX; },

    setStatus(st, err) {
      this.status = st; this.error = err || '';
      if (st === 'ok') this.lastSync = Date.now();
      if (this.onStatus) this.onStatus(st, this.error);
    },

    async api(path, opt) {
      const c = this.conf();
      const headers = { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' };
      if (opt && opt.body) headers['Content-Type'] = 'application/json';
      let r;
      try { r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/${path}`, Object.assign({ cache: 'no-store' }, opt, { headers })); }
      catch (e) { throw new GhError(0, e.message); }
      if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* 沒有內容 */ } throw new GhError(r.status, m || 'HTTP ' + r.status); }
      return r.json();
    },
    async fetchFile(path) {
      try {
        const j = await this.api('contents/' + path);
        return { data: JSON.parse(b64dec(j.content)), sha: j.sha };
      } catch (e) { if (e.status === 404) return null; throw e; }
    },
    async fetchRemote() {
      const r = await this.fetchFile(FILE);
      return r ? { data: norm(r.data), sha: r.sha } : { data: EMPTY(), sha: null };
    },

    merge,

    /* 拉雲端的下來合併。回傳 { changed: [id…] }（本機原本沒有、或被較新版本取代的格子） */
    async pull() {
      if (!this.connected()) return { changed: [] };
      this.setStatus('sync');
      try {
        const r = await this.fetchRemote();
        this.sha = r.sha;
        const olds = [];
        for (const p of OLD_FILES) { const o = await this.fetchFile(p); if (o) olds.push(Object.assign({ path: p }, o)); }
        const loc = this.local();
        let merged = merge(loc, r.data);
        for (const o of olds) merged = merge(merged, o.data);
        const before = new Map(loc.list.map(x => [x.id, x.at]));
        const changed = merged.list.filter(x => before.get(x.id) !== x.at).map(x => x.id);
        this.writeLocal(merged);
        // 本機有雲端沒有的（或舊位置有東西）→ 順便推上去
        if (sig(merged) !== sig(r.data)) await this.push();
        else this.setStatus('ok');
        // 舊位置的已經併進新清單（推上去了才刪）
        if (this.status === 'ok') for (const o of olds) {
          await this.api('contents/' + o.path, { method: 'DELETE', body: JSON.stringify({ message: '移除舊格式存檔（已併進 ' + FILE + '）', sha: o.sha }) }).catch(() => {});
        }
        return { changed };
      } catch (e) { this.fail(e); return { changed: [] }; }
    },

    timer: null,
    schedulePush() {
      if (!this.connected()) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 2500);
    },

    pushing: null,
    async push(keepalive) {
      if (!this.connected()) return;
      clearTimeout(this.timer);
      if (this.pushing && !keepalive) { this.schedulePush(); return; }
      this.setStatus('sync');
      const run = async () => {
        for (let tries = 0; tries < 4; tries++) {
          try {
            let remote;
            if (this.sha === null || tries > 0) remote = await this.fetchRemote();
            else remote = { data: null, sha: this.sha };
            const merged = remote.data ? merge(this.local(), remote.data) : merge(this.local(), EMPTY());
            const body = { message: `存檔 ${this.device} ${new Date().toISOString().slice(0, 16)}`, content: b64enc(JSON.stringify(merged)) };
            if (remote.sha) body.sha = remote.sha;
            const j = await this.api('contents/' + FILE, { method: 'PUT', body: JSON.stringify(body), keepalive: !!keepalive });
            this.sha = j.content.sha;
            this.writeLocal(merged);
            this.setStatus('ok');
            return;
          } catch (e) {
            if ((e.status === 409 || e.status === 422) && tries < 3) { this.sha = null; continue; }
            throw e;
          }
        }
      };
      this.pushing = run().catch(e => this.fail(e)).finally(() => { this.pushing = null; });
      return this.pushing;
    },

    fail(e) {
      if (!e.status) this.setStatus('offline');
      else this.setStatus('err', e.status === 401 ? MT.t('err401') : e.status === 403 ? MT.t('err403') : e.status === 404 ? MT.t('err404') : e.message);
    },

    /* 連線：先試讀一次，成功才存 token */
    async connect(token, repoFull) {
      const [owner, repo] = (repoFull || '').split('/');
      const prev = LS.get('gh', null);
      this.setConf({ owner: owner || DEFAULT.owner, repo: repo || DEFAULT.repo, token });
      this.sha = null;
      try {
        await this.fetchRemote();
      } catch (e) {
        if (prev) this.setConf(prev); else LS.del('gh');
        this.fail(e);
        throw e;
      }
      return this.pull();
    },
    disconnect() { LS.del('gh'); this.sha = null; this.setStatus('off'); },
  };

  MT.Sync = Sync;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : (globalThis.MT = globalThis.MT || {}));
