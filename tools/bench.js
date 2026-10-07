/* 平衡總表（strategy-depth）：幾組真人型自動玩家平行跑，印出 Ken 的平衡目標各項與跨層規劃三個指標。
   用法：node tools/bench.js [--runs N（每組每種技能幾局，預設 20）] [--seed S] [--jobs J（預設 8）] [--groups gen,pro,blind,rule,...] [--out 檔] [--resume]
         [--mt '{"KEY_RATE":{"y":1.3},"MAP_PATCH":{"11:0,1":"hp"}}'（覆蓋 MT 的數值試一組設定，不用改 data.js）] [--prio low/below/normal]
   組別（高手參數都是 width 2、noise 500）：
     gen    一般＝human --width 1 --noise 2000
     pro    高手＝--ahead all（知道整座塔）
     blind  盲高手＝--ahead blind（判斷力同高手、只看得到去過的樓層）
     rule   懂規則的盲高手＝blind＋MT_RULE=1（知道鑰匙會漲價、後面房間更值錢、該留金鑰匙，不知道地圖）
     pro_nokf      高手但關掉鑰匙遠見估價（MT_KF=0）——量基準差距裡 keyFuture 佔多少
     pro_nokf_nokeep  再關掉「留金鑰匙」（MT_KEEP=0）——剩下的差距＝純粹看得到後面樓層的怪
   三個指標（v2）：差距一律 (高−低)/高；主目標＝高手 vs 盲高手差距的增量；護欄 1＝高手 vs 懂規則的盲高手差距不放大；護欄 2＝盲高手通關率 ≥ 一般。
   每局跑完立刻寫一行 jsonl，中斷後 --resume 接著跑。子程序預設 below-normal 優先權（--prio low/below/normal）、預設 8 個平行，留 CPU 給別的工作 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const GROUPS = {
  gen: { width: 1, noise: 2000, ahead: null },
  pro: { width: 2, noise: 500, ahead: 'all' },
  blind: { width: 2, noise: 500, ahead: 'blind' },
  rule: { width: 2, noise: 500, ahead: 'blind', env: { MT_RULE: '1' } },
  perfect: { width: 8, noise: 300, ahead: 'all' },   // 完美玩家（3.4 報表用）：知道整座塔、寬度 8，跟攻略產生器 --human 同一組參數
  pro_nokf: { width: 2, noise: 500, ahead: 'all', env: { MT_KF: '0' } },
  pro_nokf_nokeep: { width: 2, noise: 500, ahead: 'all', env: { MT_KF: '0', MT_KEEP: '0' } },
};
const NAMES = { perfect: '完美（寬度 8）', gen: '一般', pro: '高手', blind: '盲高手（不知道後面樓層）', rule: '懂規則的盲高手', pro_nokf: '高手（無鑰匙遠見）', pro_nokf_nokeep: '高手（無鑰匙遠見、不留金鑰匙）' };
const SKILLS = ['absorb', 'reflect', 'double'];
const args = process.argv.slice(2);

if (args[0] === '--worker') {
  const [, g, skill, seed] = args;
  const G = GROUPS[g];
  Object.assign(process.env, G.env || {});   // 要在 require sim.js 之前設，它讀環境變數是在載入時
  const S = require('./sim.js');
  // 調數值用的覆蓋（--mt 傳進來的 JSON）：MT.KEY_RATE、MT.MAP_PATCH、MT.SHOPS… 一層層合併進 MT，不用改 data.js 就能試一組數值
  if (process.env.MT_OVERRIDE) { const merge = (o, p) => { for (const k in p) { if (p[k] === null) o[k] = {}; else if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object') merge(o[k], p[k]); else o[k] = p[k]; } }; /* null＝清空成 {}（例如把 MAP_PATCH 整個拿掉） */ merge(S.MT, JSON.parse(process.env.MT_OVERRIDE)); }
  S.setSkills([skill]);
  // MT_SNAP=F：另外記下第一次到達 F 層的局面（寫進 jsonl 的 snap 欄，給 tools/tail.js 從那裡接著跑）
  const o = { width: G.width, noise: G.noise, seed: +seed, ahead: G.ahead, snapFloor: +process.env.MT_SNAP || 0 };
  const r = S.solveHuman(o);
  const st = r.st;
  process.stdout.write(JSON.stringify({ g, skill, seed: +seed, done: !!r.done, score: r.score || 0, grade: r.grade || '-', te: !!(r.done && S.MT.isTrueEnding(st)), floor: S.maxFloor(st), hp: st.hp, atk: st.atk, def: st.def, gold: st.gold, keys: st.keys, bought: { y: st.shops["keys:y"] || 0, b: st.shops["keys:b"] || 0, r: st.shops["keys:r"] || 0 }, retried: st.retried || 0, lv: st.lv, sklv: st.skill ? st.skill.lv : 0, boss: st.boss || [], ...(o.snap ? { snap: o.snap } : {}) }));
  process.exit(0);
}

const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const runs = num('--runs', 20), seed0 = num('--seed', 1), jobs = num('--jobs', 8);
// 子程序優先權：預設 below（低於一般，仍會讓給前景工作）。low＝Idle：在 P／E 混合核心的機器上會被排到 E 核、每局慢 5～6 倍，Ken 在用電腦時才用
const pi = args.indexOf('--prio'), prio = pi >= 0 ? args[pi + 1] : 'below';
// 小範圍模擬：--from F --top T 傳給子程序（sim.js 讀 MT_FROM／MT_TOP）
const fi = args.indexOf('--from'), ti = args.indexOf('--top');
if (fi >= 0) process.env.MT_FROM = args[fi + 1];
if (ti >= 0) process.env.MT_TOP = args[ti + 1];
const mi = args.indexOf('--mt');
if (mi >= 0) { JSON.parse(args[mi + 1]); process.env.MT_OVERRIDE = args[mi + 1]; }   // 先 parse 一次，壞 JSON 在這裡就報錯而不是每個子程序各死一次
const PRIO = { low: os.constants.priority.PRIORITY_LOW, below: os.constants.priority.PRIORITY_BELOW_NORMAL, normal: os.constants.priority.PRIORITY_NORMAL }[prio];
const oi = args.indexOf('--out'), outFile = oi >= 0 ? args[oi + 1] : path.join(os.tmpdir(), 'mt_bench.jsonl');
const resume = args.includes('--resume');
const si = args.indexOf('--snap'); if (si >= 0) process.env.MT_SNAP = args[si + 1];   // --snap F：記下到達 F 層的局面（tools/tail.js 用）
const gi = args.indexOf('--groups'), groups = gi >= 0 ? args[gi + 1].split(',') : ['gen', 'pro', 'blind', 'rule'];
for (const g of groups) if (!GROUPS[g]) { console.error('沒有這組：' + g); process.exit(1); }
const queue = [];
for (const g of groups) for (const sk of SKILLS) for (let s = seed0; s < seed0 + runs; s++) queue.push([g, sk, s]);
const out = [];
if (resume && fs.existsSync(outFile)) { for (const l of fs.readFileSync(outFile, 'utf8').split('\n')) if (l.trim()) out.push(JSON.parse(l)); }
else fs.writeFileSync(outFile, '');
const doneKey = new Set(out.map(r => r.g + ':' + r.skill + ':' + r.seed));
for (let i = queue.length - 1; i >= 0; i--) if (doneKey.has(queue[i].join(':'))) queue.splice(i, 1);
const total = queue.length + out.length;
let running = 0, idx = 0;
if (!queue.length) setImmediate(() => report());
const t0 = Date.now();
function next() {
  while (running < jobs && idx < queue.length) {
    const [g, sk, s] = queue[idx++];
    running++;
    const p = spawn(process.execPath, [__filename, '--worker', g, sk, String(s)], { cwd: path.join(__dirname, '..') });
    try { if (PRIO != null) os.setPriority(p.pid, PRIO); } catch (e) { /* 設不了就算了 */ }
    let buf = '';
    p.stdout.on('data', d => { buf += d; });
    p.on('close', () => {
      running--;
      try { const r = JSON.parse(buf); out.push(r); fs.appendFileSync(outFile, JSON.stringify(r) + '\n'); } catch (e) { console.error('壞掉的一局', g, sk, s, buf.slice(0, 200)); }
      if (out.length % 30 === 0 || out.length === total) process.stderr.write(`  ${out.length}/${total}（${((Date.now() - t0) / 1000).toFixed(0)}s）\n`);
      if (idx < queue.length) next();
      else if (!running) report();
    });
  }
}
next();

const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
// 前 10% 平均：照分數排（沒通關算 0），取前 10% 局（至少 1 局）
const top10 = a => { const s = a.slice().sort((x, y) => y - x); return mean(s.slice(0, Math.max(1, Math.round(s.length / 10)))); };
// 平均的 95% 區間：bootstrap 重抽 1000 次（固定種子，報表可重現）
function ci(a) {
  if (a.length < 2) return [mean(a), mean(a)];
  let x = 12345; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const ms = [];
  for (let i = 0; i < 1000; i++) { let s = 0; for (let j = 0; j < a.length; j++) s += a[Math.floor(rnd() * a.length)]; ms.push(s / a.length); }
  ms.sort((p, q) => p - q);
  return [Math.round(ms[25]), Math.round(ms[974])];
}
// 通關率的 95% 區間（Wilson）
function wilson(k, n) {
  if (!n) return '-';
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return `${Math.round((c - h) / d * 100)}～${Math.round((c + h) / d * 100)}%`;
}
function grades(rs) { const g = {}; for (const r of rs) g[r.grade] = (g[r.grade] || 0) + 1; return ['S', 'A', 'B', 'C', '-'].filter(k => g[k]).map(k => k + '×' + g[k]).join(' '); }
function stuck(rs) { const f = {}; for (const r of rs) if (!r.done) f[r.floor] = (f[r.floor] || 0) + 1; return Object.keys(f).sort((a, b) => a - b).map(k => k + 'F×' + f[k]).join(' ') || '-'; }
const gap = (hi, lo) => (hi ? ((hi - lo) / hi * 100).toFixed(1) + '%' : '-');

function report() {
  const by = (g, sk) => out.filter(r => r.g === g && (!sk || r.skill === sk));
  console.log(`\n共 ${out.length} 局，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  for (const g of groups) {
    const all = by(g);
    if (!all.length) continue;
    const sc = all.map(r => r.score), [lo, hi] = ci(sc), d = all.filter(r => r.done).length;
    console.log(`\n【${NAMES[g]}】通關 ${pct(d, all.length)}（95% ${wilson(d, all.length)}）  真結局 ${pct(all.filter(r => r.te).length, all.length)}  評價 ${grades(all)}  卡住 ${stuck(all)}`);
    console.log(`  分數（沒過算 0）平均 ${mean(sc)}（95% ${lo}～${hi}）  中位數 ${median(sc)}  通關者中位數 ${median(all.filter(r => r.done).map(r => r.score))}`);
    for (const sk of SKILLS) {
      const rs = by(g, sk);
      if (!rs.length) continue;
      console.log(`  ${sk.padEnd(8)} 通關 ${pct(rs.filter(r => r.done).length, rs.length).padStart(4)}  前10%平均 ${String(top10(rs.map(r => r.score))).padStart(6)}  平均 ${String(mean(rs.map(r => r.score))).padStart(6)}  評價 ${grades(rs)}`);
    }
  }
  // 兩組的差距：組平均差＋同種子配對差（同 skill 同 seed 一對一相減，雜訊比組平均差小）
  const pair = (hiG, loG) => {
    const H = by(hiG), L = by(loG);
    if (!H.length || !L.length) return null;
    const lm = new Map(L.map(r => [r.skill + ':' + r.seed, r.score]));
    const diffs = H.filter(r => lm.has(r.skill + ':' + r.seed)).map(r => r.score - lm.get(r.skill + ':' + r.seed));
    const a = mean(H.map(r => r.score)), b = mean(L.map(r => r.score));
    return `${NAMES[hiG]} ${a} vs ${NAMES[loG]} ${b} → 差距 ${gap(a, b)}（配對差中位數 ${median(diffs)}、平均 ${mean(diffs)}，${diffs.length} 對）`;
  };
  const lines = [];
  const has = g => groups.includes(g) && by(g).length;
  if (has('pro') && has('blind')) lines.push('主目標  ' + pair('pro', 'blind'));
  if (has('pro') && has('rule')) lines.push('護欄 1  ' + pair('pro', 'rule'));
  if (has('rule') && has('blind')) lines.push('懂規則值多少  ' + pair('rule', 'blind'));
  if (has('pro') && has('pro_nokf')) lines.push('鑰匙遠見值多少  ' + pair('pro', 'pro_nokf'));
  if (has('pro_nokf') && has('pro_nokf_nokeep')) lines.push('留金鑰匙值多少  ' + pair('pro_nokf', 'pro_nokf_nokeep'));
  if (has('pro_nokf_nokeep') && has('blind')) lines.push('純粹看得到後面樓層值多少  ' + pair('pro_nokf_nokeep', 'blind'));
  if (lines.length) console.log('\n' + lines.join('\n'));
  if (has('gen') && has('blind')) {
    const pg = by('gen').filter(r => r.done).length / by('gen').length, pb = by('blind').filter(r => r.done).length / by('blind').length;
    console.log(`護欄 2  盲高手通關 ${Math.round(pb * 100)}% vs 一般 ${Math.round(pg * 100)}% → ${pb >= pg ? '成立' : '不成立（判斷力更好卻死更多）'}`);
  }
  if (has('gen') && has('pro')) {
    const pg = by('gen').filter(r => r.done).length / by('gen').length, pp = by('pro').filter(r => r.done).length / by('pro').length;
    console.log(`高手 − 一般 通關率：${Math.round((pp - pg) * 100)} 個百分點`);
  }
}
