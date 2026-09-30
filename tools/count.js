/* 每層的鑰匙／門／寶石／藥水／金幣數量 */
'use strict';
const path = require('path');
require(path.join(__dirname, '../js/data.js'));
const MT = globalThis.MT;
let tot = { Yk: 0, Yd: 0, Bk: 0, Bd: 0, Rk: 0, Rd: 0 };
for (let f = 1; f <= MT.TOP; f++) {
  const c = {};
  let gold = 0;
  for (const r of MT.FLOORS[f]) for (const t of r.split(' ')) {
    c[t] = (c[t] || 0) + 1;
    if (MT.MONSTERS[t]) gold += MT.MONSTERS[t].gold;
  }
  for (const k in tot) tot[k] += c[k] || 0;
  const g = k => c[k] || 0;
  console.log(`F${f}\tY ${g('Yk')}/${g('Yd')}\tB ${g('Bk')}/${g('Bd')}\tR ${g('Rk')}/${g('Rd')}\tat ${g('at')} df ${g('df')} hp ${g('hp')} HP ${g('HP')}\t金 ${gold}\t累計Y ${tot.Yk}/${tot.Yd} B ${tot.Bk}/${tot.Bd} R ${tot.Rk}/${tot.Rd}`);
}
