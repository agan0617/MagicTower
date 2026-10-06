/* 鑰匙起步價算帳（3.4 每買一把貴一倍）：先算再跑模擬。
   用法：node tools/keycalc.js [銅起步價,銀,金 ...]（例：node tools/keycalc.js 10,50,100 20,100,200）
   做法：照 sim.js 的 doorValues（每扇門後的價值，以生命計）沿樓層記帳——撿到的鑰匙先開那層最值錢的門（主線門一定開），
   開不起的門排成「想買鑰匙開」的清單；買家照價值由高到低買，第 n 把的價錢＝起步價×2^(n−1)（6F 起買得到、13F 起用八折的表哥價），
   門後價值 > 價錢×金幣價值（g＝每金幣幾點生命）才買。印出每種起步價、每種 g 的購買把數、花費、買到的價值，對照全塔金幣總量。
   g＝1 是模擬高手眼中的金幣價值，g＝6 是一般玩家；真的花錢時還受手上金幣限制，這裡不算（看「花費佔全塔金幣」判斷） */
'use strict';
const S = require('./sim.js'), MT = S.MT;
const D = S.doorValues();
const MAIN = Infinity;
let gold = 0;
for (let f = MT.BOTTOM; f <= MT.TOP; f++) for (const r of MT.FLOORS[f]) for (const t of r.split(' ')) if (MT.MONSTERS[t]) gold += MT.MONSTERS[t].gold;
// 撿到的鑰匙開完之後還剩哪些門（每色、每層），以及沒用掉的鑰匙
function unfunded(c) {
  const left = []; let carry = c === 'y' ? MT.START.keys.y : 0;
  for (let f = MT.BOTTOM; f <= MT.TOP; f++) {
    if (!D[f]) continue;
    carry += D[f].keys[c];
    const doors = D[f].doors[c].slice().sort((a, b) => b - a);
    for (const v of doors) {
      if (v === MAIN || v >= 1e9) { carry--; continue; }
      if (v <= 0) continue;
      if (carry > 0) { carry--; continue; }
      left.push({ f, v });
    }
    if (carry < 0) carry = 0;
  }
  return { left, spare: carry };
}
const sets = process.argv.slice(2).length ? process.argv.slice(2) : ['10,50,100', '20,100,200', '40,200,400'];
console.log(`全塔怪物金幣 ${gold}（不含寶物房的金幣袋）`);
for (const c of ['y', 'b', 'r']) { const u = unfunded(c); const vs = u.left.map(d => d.v).sort((a, b) => b - a); console.log(`${{ y: '銅', b: '銀', r: '金' }[c]}：撿到的不夠開的門 ${vs.length} 扇，價值由高到低 ${vs.slice(0, 12).map(Math.round).join(' ')}${vs.length > 12 ? ' …' : ''}；撿到用不完 ${u.spare} 把`); }
for (const set of sets) {
  const start = Object.fromEntries(set.split(',').map((p, i) => [['y', 'b', 'r'][i], +p]));
  for (const g of [1, 3, 6]) {
    const row = [];
    let total = 0;
    for (const c of ['y', 'b', 'r']) {
      const vs = unfunded(c).left.filter(d => d.f >= 6).sort((a, b) => b.v - a.v);
      let n = 0, cost = 0, got = 0;
      for (const d of vs) {
        const price = Math.round(start[c] * (d.f >= 13 ? 0.8 : 1) * Math.pow(2, n));
        if (d.v <= price * g) break;
        n++; cost += price; got += d.v;
      }
      total += cost;
      row.push(`${{ y: '銅', b: '銀', r: '金' }[c]} ${n} 把 ${cost} 金（價值 ${Math.round(got)}）`);
    }
    console.log(`起步價 ${set.padEnd(12)} g=${g}：${row.join('、')}；合計 ${total} 金＝全塔金幣 ${Math.round(total / gold * 100)}%`);
  }
}
