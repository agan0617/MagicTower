/* 平衡檢查：新手／一般／真人型／高手四種自動玩家各跑一次，印出通關與否、分數、評價。
   改關卡或數值後跑 `node tools/solve.js` 確認：高手打得通、四種玩家的分數有明顯差距，再依結果調 data.js 的 MT.RATING。
   用法：node tools/solve.js [weak|mid|human|strong] [--width N] [--skill absorb|reflect|double] [-v]
         node tools/solve.js human [--width N] [--noise N] [--runs K] [--seed S]   真人型換 K 個亂數種子（從 S 起）各跑一次，最後印分佈
   --width 不給：真人型 4、高手 12 */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
const args = process.argv.slice(2);
const only = args.find(a => ['weak', 'mid', 'human', 'strong'].includes(a));
const wi = args.indexOf('--width'), width = wi >= 0 ? Number(args[wi + 1]) : null;
const si = args.indexOf('--skill');
const rotate = si >= 0 && args[si + 1] === 'rotate';   // --skill rotate：每局照種子輪流選三種技能（模擬第一次玩、隨便挑一種的一般玩家，3.2.68）
if (si >= 0 && !rotate) S.setSkills([args[si + 1]]);
const verbose = args.includes('-v');
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const noise = num('--noise', 0), nRuns = num('--runs', 1), seed0 = num('--seed', 1);
const ai = args.indexOf('--ahead'), ahead = ai >= 0 ? (['all', 'blind'].includes(args[ai + 1]) ? args[ai + 1] : args[ai + 1] === '1') : null;   // --ahead all＝看整座塔（老手）、1／0＝看不看下一層

function line(name, r, ms) {
  const st = r.st;
  const where = r.done ? '通關' : `卡在 ${MT.floorName(S.maxFloor(st))}`;
  const sk = st.skill ? `${st.skill.type} Lv${st.skill.lv}` : '-';
  return `${name.padEnd(6)} ${where.padEnd(8)} 分數 ${String(r.score == null ? '-' : r.score).padStart(6)} ${r.grade || ' '}  HP ${st.hp} 攻 ${st.atk} 防 ${st.def} Lv ${st.lv} 金 ${st.gold} 經驗 ${st.exp} 鑰 ${st.keys.y}/${st.keys.b}/${st.keys.r} 技能 ${sk}  擊倒 ${st.kills}${r.done && MT.isTrueEnding(st) ? '  真結局' : ''}  (${(ms / 1000).toFixed(1)}s)`;
}
const runs = { weak: () => S.solveWeak(), mid: () => S.solveMid(), human: seed => S.solveHuman({ width: width || 4, noise, seed, ahead }), strong: () => S.solveStrong({ width: width || 12, ahead }) };
const dist = [];
for (const k of only ? [only] : ['weak', 'mid', 'human', 'strong']) for (let seed = seed0; seed < seed0 + (k === 'human' ? nRuns : 1); seed++) {
  const t0 = Date.now();
  if (rotate) S.setSkills([['absorb', 'reflect', 'double'][seed % 3]]);
  const r = runs[k](seed);
  if (k === 'human') dist.push(r);
  console.log(line(k === 'human' && nRuns > 1 ? 'human#' + seed : k, r, Date.now() - t0));
  if (verbose && r.st.trace) for (const f of Object.keys(r.st.trace).map(Number).sort((a, b) => a - b)) console.log(`  到 ${MT.floorName(f).padEnd(3)} ${r.st.trace[f]}`);
  if (verbose && !r.done) {
    const st = r.st, reach = S.collect(st);
    for (const c of S.frontier(st, reach)) {
      const d = MT.isMonster(c.t) ? MT.calc(st, c.t).damage : '';
      console.log(`  前沿 ${MT.floorName(c.f)} ${c.t}@${c.x},${c.y} ${d == null ? '打不動' : d}`);
    }
  }
}
console.log(`門檻 MT.RATING：S ${MT.RATING.S}（要真結局）／A ${MT.RATING.A}／B ${MT.RATING.B}`);
if (dist.length > 1) {
  // 真人型的分佈：幾成通關、卡在哪幾層、通關的分數中位數與各評價的人數
  const done = dist.filter(r => r.done), sc = done.map(r => r.score).sort((a, b) => a - b);
  const stuck = {};
  dist.filter(r => !r.done).forEach(r => { const f = MT.floorName(S.maxFloor(r.st)); stuck[f] = (stuck[f] || 0) + 1; });
  const gr = {}; done.forEach(r => { gr[r.grade] = (gr[r.grade] || 0) + 1; });
  console.log(`真人型 ${dist.length} 次（寬度 ${width || 4}、noise ${noise}）：通關 ${done.length}` + (sc.length ? `，分數 ${sc[0]}～${sc[sc.length - 1]}、中位數 ${sc[Math.floor(sc.length / 2)]}` : '')
    + `；評價 ${Object.entries(gr).map(([g, n]) => g + '×' + n).join(' ') || '-'}；卡住 ${Object.entries(stuck).map(([f, n]) => f + '×' + n).join(' ') || '-'}`);
}
