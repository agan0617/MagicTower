/* 平衡檢查：新手／一般／高手三種自動玩家各跑一次，印出通關與否、分數、評價。
   改關卡或數值後跑 `node tools/solve.js` 確認：高手打得通、三種玩家的分數有明顯差距，再依結果調 data.js 的 MT.RATING。
   用法：node tools/solve.js [weak|mid|strong] [--width N] [--skill absorb|reflect|double] [-v] */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
const args = process.argv.slice(2);
const only = args.find(a => ['weak', 'mid', 'strong'].includes(a));
const wi = args.indexOf('--width'), width = wi >= 0 ? Number(args[wi + 1]) : 12;
const si = args.indexOf('--skill');
if (si >= 0) S.setSkills([args[si + 1]]);
const verbose = args.includes('-v');

function line(name, r, ms) {
  const st = r.st;
  const where = r.done ? '通關' : `卡在 ${MT.floorName(S.maxFloor(st))}`;
  const sk = st.skill ? `${st.skill.type} Lv${st.skill.lv}` : '-';
  return `${name.padEnd(6)} ${where.padEnd(8)} 分數 ${String(r.score == null ? '-' : r.score).padStart(6)} ${r.grade || ' '}  HP ${st.hp} 攻 ${st.atk} 防 ${st.def} Lv ${st.lv} 金 ${st.gold} 經驗 ${st.exp} 鑰 ${st.keys.y}/${st.keys.b}/${st.keys.r} 技能 ${sk}  擊倒 ${st.kills}  (${(ms / 1000).toFixed(1)}s)`;
}
const runs = { weak: () => S.solveWeak(), mid: () => S.solveMid(), strong: () => S.solveStrong({ width }) };
for (const k of only ? [only] : ['weak', 'mid', 'strong']) {
  const t0 = Date.now();
  const r = runs[k]();
  console.log(line(k, r, Date.now() - t0));
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
