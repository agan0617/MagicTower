/* 驗收報表（3.4）：吃 bench.js 的 jsonl，照驗收資料重算評價門檻，印 Markdown 總表與平衡指標。
   用法：node tools/report.js <驗收 jsonl> [完美玩家 jsonl] [--keep]（--keep：照 data.js 現有門檻評分，不重算）
   門檻的定法：A＝高手通關者中位數、B＝一般通關者中位數；S 照 data.js（3.5 起不再取高手第 94 百分位，Ken 指定：三種技能的完美玩家都打得到 S 就好）
   完美玩家 jsonl 每行 {skill, done, score, te, floor}（tools/solve.js 的完美設定各技能跑出來的最好成績） */
'use strict';
const fs = require('fs');
const S = require('./sim.js'), MT = S.MT;
const args = process.argv.slice(2), keep = args.includes('--keep'), files = args.filter(a => !a.startsWith('--'));
const read = f => fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).map(JSON.parse);
const all = read(files[0]), rs = all.filter(r => r.g !== 'perfect'), perfect = (files[1] ? read(files[1]) : []).concat(all.filter(r => r.g === 'perfect'));
const med = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pctl = (a, q) => { const s = a.slice().sort((p, q2) => p - q2); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
const mean = a => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0);
const pro = rs.filter(r => r.g === 'pro' && r.done).map(r => r.score), gen = rs.filter(r => r.g === 'gen' && r.done).map(r => r.score);
const R = keep ? MT.RATING : { S: MT.RATING.S, A: Math.round(med(pro) / 100) * 100, B: Math.round(med(gen) / 100) * 100 };
const grade = r => (!r.done ? '沒過' : r.score >= R.S && r.te ? 'S' : r.score >= R.A ? 'A' : r.score >= R.B ? 'B' : 'C');
const NAMES = { gen: '一般', pro: '高手', blind: '盲高手', rule: '懂規則', perfect: '完美' }, SK = { absorb: '鐵壁', reflect: '反彈', double: '連擊' };
const out = [];
out.push(`評價門檻：S ${R.S}（要真結局）／A ${R.A}／B ${R.B}${keep ? '（data.js 現有）' : '（照這份驗收重算）'}`, '');
out.push('| 玩家 | 技能 | 局數 | 通關率 | 通關者中位數 | 真結局 | S／A／B／C／沒過 | 卡關樓層 |', '|---|---|---|---|---|---|---|---|');
const row = (g, sk, a) => {
  const w = a.filter(r => r.done), cnt = { S: 0, A: 0, B: 0, C: 0, 沒過: 0 };
  for (const r of a) cnt[grade(r)]++;
  const fl = {}; for (const r of a) if (!r.done) fl[r.floor] = (fl[r.floor] || 0) + 1;
  const fls = Object.keys(fl).sort((p, q) => p - q).map(f => `${f}F×${fl[f]}`).join(' ') || '—';
  out.push(`| ${NAMES[g]} | ${sk ? SK[sk] : '合計'} | ${a.length} | ${Math.round(w.length / a.length * 100)}% | ${med(w.map(r => r.score))} | ${Math.round(a.filter(r => r.te).length / a.length * 100)}% | ${cnt.S}／${cnt.A}／${cnt.B}／${cnt.C}／${cnt.沒過} | ${fls} |`);
};
for (const g of ['gen', 'pro', 'blind', 'rule']) {
  const a = rs.filter(r => r.g === g); if (!a.length) continue;
  for (const sk of ['absorb', 'reflect', 'double']) row(g, sk, a.filter(r => r.skill === sk));
  row(g, null, a);
}
for (const sk of ['absorb', 'reflect', 'double']) { const a = perfect.filter(r => r.skill === sk); if (a.length) row('perfect', sk, a); }
const pass = g => { const a = rs.filter(r => r.g === g); return a.length ? a.filter(r => r.done).length / a.length * 100 : NaN; };
const avg = g => mean(rs.filter(r => r.g === g).map(r => (r.done ? r.score : 0)));
const gap = (h, l) => (avg(h) - avg(l)) / avg(h) * 100;
const passSk = (g, sk) => { const a = rs.filter(r => r.g === g && r.skill === sk); return a.filter(r => r.done).length / a.length * 100; };
// 技能上限（3.5 起，Ken 同意）：看各技能「最高那一段」——高手前 10% 平均與完美玩家最高分，連擊都要最高。
// 不再用高手中位數：技能表現分約等於每種技能一個固定加分，把完美鐵壁拉到 S，鐵壁、反彈的中位數一定會超過連擊
const top10 = sk => { const s = rs.filter(r => r.g === 'pro' && r.skill === sk).map(r => (r.done ? r.score : 0)).sort((p, q) => q - p); return Math.round(mean(s.slice(0, Math.max(1, Math.round(s.length / 10))))); };
const pbest = sk => Math.max(0, ...perfect.filter(r => r.skill === sk && r.done).map(r => r.score));
const [fa, fr, fd] = ['absorb', 'reflect', 'double'].map(sk => passSk('gen', sk)), [ca, cr, cd] = ['absorb', 'reflect', 'double'].map(top10), [ba, br, bd] = ['absorb', 'reflect', 'double'].map(pbest);
const sOf = (a, sk) => a.filter(r => r.skill === sk && grade(r) === 'S').length;
const ok = b => (b ? '✓' : '✗');
out.push('', '| 指標 | 目標 | 結果 | |', '|---|---|---|---|');
out.push(`| 一般通關率 | 50～70% | ${pass('gen').toFixed(0)}% | ${ok(pass('gen') >= 50 && pass('gen') <= 70)} |`);
out.push(`| 高手通關率 | 60～90% | ${pass('pro').toFixed(0)}% | ${ok(pass('pro') >= 60 && pass('pro') <= 90)} |`);
out.push(`| 高手−一般 | 約 20 點 | ${(pass('pro') - pass('gen')).toFixed(0)} 點 | ${ok(Math.abs(pass('pro') - pass('gen') - 20) <= 8)} |`);
out.push(`| 主目標（高手 vs 盲高手平均分差） | ≥50% | ${gap('pro', 'blind').toFixed(1)}% | ${ok(gap('pro', 'blind') >= 50)} |`);
out.push(`| 護欄 1（高手 vs 懂規則） | ≤34.3% | ${gap('pro', 'rule').toFixed(1)}% | ${ok(gap('pro', 'rule') <= 34.3)} |`);
out.push(`| 護欄 2（盲高手通關 ≥ 一般） | 成立 | ${pass('blind').toFixed(0)}% vs ${pass('gen').toFixed(0)}% | ${ok(pass('blind') >= pass('gen'))} |`);
out.push(`| 技能下限（一般通關率）鐵壁≥反彈≥連擊、兩端差 ≥8 | | ${fa.toFixed(0)}／${fr.toFixed(0)}／${fd.toFixed(0)}% | ${ok(fa >= fr && fr >= fd && fa - fd >= 8)} |`);
out.push(`| 技能上限：高手前 10% 平均 連擊最高（連擊／反彈／鐵壁） | | ${cd}／${cr}／${ca} | ${ok(cd > cr && cd > ca)} |`);
if (perfect.length) {
  out.push(`| 技能上限：完美最高分 連擊最高（連擊／反彈／鐵壁） | | ${bd}／${br}／${ba} | ${ok(bd > br && bd > ba)} |`);
  out.push(`| 三種技能的完美玩家都打得到 S（鐵壁／反彈／連擊 拿 S 局數） | 各 ≥1 | ${['absorb', 'reflect', 'double'].map(sk => sOf(perfect, sk) + '/' + perfect.filter(r => r.skill === sk).length).join('／')} | ${ok(['absorb', 'reflect', 'double'].every(sk => sOf(perfect, sk) >= 1))} |`);
}
{ const p = rs.filter(r => r.g === 'pro'), n = ['absorb', 'reflect', 'double'].reduce((a, sk) => a + sOf(p, sk), 0); out.push(`| 高手 S 少數 | ≤10% | ${(n / p.length * 100).toFixed(0)}% | ${ok(n / p.length <= 0.1)} |`); }
if (perfect.length) { const best = Math.max(...perfect.filter(r => r.done).map(r => r.score), 0); out.push(`| 完美明顯拉開（最好成績 vs 高手第 94 百分位） | 明顯高 | ${best} vs ${Math.round(pctl(pro, 0.94))} | ${ok(best > pctl(pro, 0.94) * 1.15)} |`); }
console.log(out.join('\n'));
