/* 印出一層地圖（附座標），並列出：從樓梯（1F 從起點）不付代價走得到的道具、緊鄰的門與怪（含這時的戰鬥代價）。
   用法：node tools/show.js <樓層> [hp atk def]（能力不給就用遊戲開始的數值；B1 用 0） */
'use strict';
const S = require('./sim.js');
const MT = S.MT;
const f = Number(process.argv[2] || 1);
const st = MT.newGame();
if (process.argv[3]) { st.hp = +process.argv[3]; st.atk = +process.argv[4]; st.def = +process.argv[5]; }
const m = st.maps[f];
console.log('    ' + [...Array(MT.W).keys()].map(x => String(x).padStart(2)).join(' '));
m.forEach((r, y) => console.log(String(y).padStart(2) + '  ' + r.map(t => (t === '..' ? ' .' : t === '##' ? '██' : t)).join(' ')));
const cnt = {};
for (const r of m) for (const t of r) cnt[t] = (cnt[t] || 0) + 1;
const g = k => cnt[k] || 0;
console.log(`鑰匙 Y${g('Yk')}/B${g('Bk')}/R${g('Rk')}　門 Y${g('Yd')}/B${g('Bd')}/R${g('Rd')}　寶石 攻${g('at')} 防${g('df')}　藥水 ${g('hp')}+${g('HP')}`);
const mons = Object.keys(cnt).filter(t => MT.isMonster(t));
console.log('怪物（' + st.atk + '/' + st.def + '）：' + mons.map(t => `${t}×${cnt[t] / (MT.monSize(t) ** 2)}=${MT.calc(st, t).damage ?? '✕'}`).join('  '));
