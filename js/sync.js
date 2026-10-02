/* 存檔與雲端同步。
   每台裝置在 localStorage 存一份全部存檔（自動存檔＋三格手動）；有 token 時跟私有 GitHub repo 裡的
   saves/magictower.json 對齊：每一格各自比時間，新的贏。做法跟K書吧一樣：token 由使用者在每台裝置貼一次，
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
  // 存檔 repo 可能跟其他遊戲／K書吧共用，每款遊戲各用 saves/ 底下自己的檔名
  const FILE = 'saves/magictower.json';
  const SLOTS = ['auto', 's1', 's2', 's3'];

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

  const Sync = {
    status: 'off', error: '', lastSync: 0, sha: null,
    onStatus: null,
    device: deviceName(),

    conf() { return Object.assign({}, DEFAULT, LS.get('gh', {})); },
    setConf(c) { LS.set('gh', c); },
    connected() { return !!this.conf().token; },

    local() {
      const s = LS.get('saves', null);
      return s && s.slots ? s : { v: 1, slots: {} };
    },
    writeLocal(s) {
      if (!LS.set('saves', s)) {
        // 空間不夠（極少見）：只留自動存檔
        LS.set('saves', { v: 1, slots: { auto: s.slots.auto } });
      }
    },

    /* 存一格。data＝MT.pack(state) */
    save(slot, data) {
      const s = this.local();
      s.slots[slot] = { at: Date.now(), device: this.device, floor: data.floor, hp: data.hp, data };
      this.writeLocal(s);
      this.schedulePush();
      return s.slots[slot];
    },
    get(slot) { return this.local().slots[slot] || null; },
    newest() {
      const s = this.local().slots;
      return SLOTS.map(k => s[k] && Object.assign({ slot: k }, s[k])).filter(Boolean).sort((a, b) => b.at - a.at)[0] || null;
    },

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
    async fetchRemote() {
      try {
        const j = await this.api('contents/' + FILE);
        return { data: JSON.parse(b64dec(j.content)), sha: j.sha };
      } catch (e) { if (e.status === 404) return { data: { v: 1, slots: {} }, sha: null }; throw e; }
    },

    // 每一格取比較新的
    merge(a, b) {
      const out = { v: 1, slots: {} };
      for (const k of SLOTS) {
        const x = a.slots && a.slots[k], y = b.slots && b.slots[k];
        const w = !x ? y : !y ? x : (y.at > x.at ? y : x);
        if (w) out.slots[k] = w;
      }
      return out;
    },

    /* 拉雲端的下來合併。回傳 { changed: [slot…] }（本機被雲端較新版本取代的格子） */
    async pull() {
      if (!this.connected()) return { changed: [] };
      this.setStatus('sync');
      try {
        const r = await this.fetchRemote();
        this.sha = r.sha;
        const loc = this.local();
        const merged = this.merge(loc, r.data);
        const changed = SLOTS.filter(k => merged.slots[k] && (!loc.slots[k] || merged.slots[k].at !== loc.slots[k].at));
        this.writeLocal(merged);
        // 本機有比雲端新的 → 順便推上去
        const needPush = SLOTS.some(k => merged.slots[k] && (!r.data.slots || !r.data.slots[k] || merged.slots[k].at !== r.data.slots[k].at));
        if (needPush) await this.push();
        else this.setStatus('ok');
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
            const merged = remote.data ? this.merge(this.local(), remote.data) : this.local();
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
