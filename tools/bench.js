/* 平衡總表（strategy-depth）：一般／高手／高手不看後面樓層三組真人型自動玩家平行跑，印出 Ken 的平衡目標各項。
   用法：node tools/bench.js [--runs N（每組每種技能幾局，預設 40）] [--seed S] [--jobs J] [--groups gen,pro,blind] [--out 檔] [--resume]
   一般＝human --width 1 --noise 2000；高手＝human --ahead all --width 2 --noise 500；
   盲高手＝同高手但 --ahead blind（判斷力一樣、不知道還沒去過的樓層），和高手的分數差＝跨樓層規劃值多少 */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const GROUPS = {
  gen: { width: 1, noise: 2000, ahead: null },
  pro: { width: 2, noise: 500, ahead: 'all' },
  blind: { width: 2, noise: 500, ahead: 'blind' },
};
const SKILLS = ['absorb', 'reflect', 'double'];
const args = process.argv.slice(2);

if (args[0] === '--worker') {
  const [, g, skill, seed] = args;
  const S = require('./sim.js');
  S.setSkills([skill]);
  const G = GROUPS[g];
  const r = S.solveHuman({ width: G.width, noise: G.noise, seed: +seed, ahead: G.ahead });
  const st = r.st;
  process.stdout.write(JSON.stringify({ g, skill, seed: +seed, done: !!r.done, score: r.score || 0, grade: r.grade || '-', te: !!(r.done && S.MT.isTrueEnding(st)), floor: S.maxFloor(st) }));
  process.exit(0);
}

const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const runs = num('--runs', 40), seed0 = num('--seed', 1), jobs = num('--jobs', 18);
// 每局跑完就寫一行到 --out（預設暫存目錄的 mt_bench.jsonl），中斷了加 --resume 接著跑、已經跑過的局不重跑
const fs = require('fs');
const oi = args.indexOf('--out'), outFile = oi >= 0 ? args[oi + 1] : path.join(require('os').tmpdir(), 'mt_bench.jsonl');
const resume = args.includes('--resume');
const gi = args.indexOf('--groups'), groups = gi >= 0 ? args[gi + 1].split(',') : Object.keys(GROUPS);
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
    let buf = '';
    p.stdout.on('data', d => { buf += d; });
    p.on('close', () => {
      running--;
      try { const r = JSON.parse(buf); out.push(r); fs.appendFileSync(outFile, JSON.stringify(r) + '\n'); } catch (e) { console.error('壞掉的一局', g, sk, s, buf.slice(0, 200)); }
      if (out.length % 30 === 0) process.stderr.write(`  ${out.length}/${total}（${((Date.now() - t0) / 1000).toFixed(0)}s）\n`);
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
function grades(rs) { const g = {}; for (const r of rs) g[r.grade] = (g[r.grade] || 0) + 1; return ['S', 'A', 'B', 'C', '-'].filter(k => g[k]).map(k => k + '×' + g[k]).join(' '); }
function stuck(rs) { const f = {}; for (const r of rs) if (!r.done) f[r.floor] = (f[r.floor] || 0) + 1; return Object.keys(f).sort((a, b) => a - b).map(k => k + 'F×' + f[k]).join(' ') || '-'; }

function report() {
  const by = (g, sk) => out.filter(r => r.g === g && (!sk || r.skill === sk));
  console.log(`\n共 ${out.length} 局，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  for (const g of groups) {
    const all = by(g);
    console.log(`\n【${{ gen: '一般', pro: '高手', blind: '盲高手（不知道後面樓層）' }[g]}】通關 ${pct(all.filter(r => r.done).length, all.length)}  真結局 ${pct(all.filter(r => r.te).length, all.length)}  評價 ${grades(all)}  卡住 ${stuck(all)}`);
    console.log(`  分數（沒過算 0）平均 ${mean(all.map(r => r.score))}  中位數 ${median(all.map(r => r.score))}`);
    for (const sk of SKILLS) {
      const rs = by(g, sk);
      if (!rs.length) continue;
      console.log(`  ${sk.padEnd(8)} 通關 ${pct(rs.filter(r => r.done).length, rs.length).padStart(4)}  前10%平均 ${String(top10(rs.map(r => r.score))).padStart(6)}  平均 ${String(mean(rs.map(r => r.score))).padStart(6)}  評價 ${grades(rs)}`);
    }
  }
  if (groups.includes('pro') && groups.includes('blind')) {
    const a = mean(by('pro').map(r => r.score)), b = mean(by('blind').map(r => r.score));
    const am = median(by('pro').map(r => r.score)), bm = median(by('blind').map(r => r.score));
    console.log(`\n跨層規劃差距：高手平均 ${a} vs 盲高手 ${b} → ${b ? ((a - b) / b * 100).toFixed(1) : '-'}%（中位數 ${am} vs ${bm} → ${bm ? ((am - bm) / bm * 100).toFixed(1) : '-'}%）`);
  }
  if (groups.includes('gen') && groups.includes('pro')) {
    const pg = by('gen').filter(r => r.done).length / by('gen').length, pp = by('pro').filter(r => r.done).length / by('pro').length;
    console.log(`高手 − 一般 通關率：${Math.round((pp - pg) * 100)} 個百分點`);
  }
}
