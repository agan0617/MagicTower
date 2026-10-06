/* 小範圍模擬的起點存檔（給 tools/late.js 用）：高手三種技能各完整跑一次，存下「第一次到某層」的局面，
   順便記技能升級的時間點（勇者等級＠樓層）與結局。
   用法：node tools/snap.js <輸出 jsonl> [--floor 13] [--seeds 8] [--jobs 8]
   起點選在要調的參數開始生效之前：鐵壁 Lv3 在 13～15F 升到，所以技能上限的調整用 13F（3.3.x） */
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const args = process.argv.slice(2);
if (args[0] === '--worker') {
  const [, skill, seed, floor] = args;
  const S = require('./sim.js'); const MT = S.MT;
  S.setSkills([skill]);
  const r = S.solveHuman({ width: 2, noise: 500, seed: +seed, ahead: 'all', log: true });
  // 照紀錄重播一次，在第一次到達 floor 時存局面
  const acts = S.logList(r.st).filter(e => e.type === 'act').map(e => e.a);
  const RUN = { ahead: 'all' };
  const st = S.newRun({}); let snap = null; const ups = []; let slv = 0;
  for (let i = 0; i < acts.length; i++) {
    S.collect(st, RUN);
    if (!snap && st.visited.includes(+floor)) { const c = S.clone(st); delete c.log; delete c._p; snap = c; }
    S.doAction(st, acts[i]);
    const lv = st.skill ? st.skill.lv : 0; if (lv !== slv) { ups.push({ skillLv: lv, heroLv: st.lv, floor: st.floor }); slv = lv; }
  }
  S.collect(st, RUN);
  const f = r.st;
  process.stdout.write(JSON.stringify({ skill, seed: +seed, done: !!r.done, score: r.score || 0, te: !!(r.done && MT.isTrueEnding(f)), lv: f.lv, skillLv: f.skill ? f.skill.lv : 0, replayOk: st.hp === f.hp && st.lv === f.lv, ups, snap }));
  process.exit(0);
}
const outFile = args[0];
if (!outFile) { console.error('用法：node tools/snap.js <輸出 jsonl> [--floor 13] [--seeds 8] [--jobs 8]'); process.exit(1); }
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const floor = opt('--floor', 13), seeds = opt('--seeds', 8), jobs = opt('--jobs', 8);
const q = []; for (const sk of ['absorb', 'reflect', 'double']) for (let s = 1; s <= seeds; s++) q.push([sk, s]);
let running = 0, idx = 0, done = 0;
const next = () => { while (running < jobs && idx < q.length) { const [sk, s] = q[idx++]; running++;
  const p = spawn(process.execPath, [__filename, '--worker', sk, String(s), String(floor)], { cwd: path.join(__dirname, '..') }); let buf = '';
  p.stdout.on('data', d => buf += d);
  p.on('close', () => { running--; done++; try { JSON.parse(buf); fs.appendFileSync(outFile, buf + '\n'); } catch (e) { console.error('壞掉的一局', sk, s); } console.log(`${done}/${q.length}`); next(); }); } };
next();
