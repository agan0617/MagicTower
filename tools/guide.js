/* 產生通關攻略（HTML）：讓高手自動玩家實際跑一次，把路線切成一段一段（連續在同一層的步驟算一段），
   每段畫出那時的地圖、標上步驟編號，附步驟表與怪物代價表；再加上規則、技能、隱藏要素等說明。
   用法：node tools/guide.js <輸出的 html> [--width 4] [--skill absorb|reflect|double]
   產出是明文攻略，放到 agan0617.github.io 的 _private/magictower.html 再用那邊的 tools/encrypt.mjs 加密 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./sim.js');
const MT = S.MT;
const out = process.argv[2];
if (!out) { console.error('用法：node tools/guide.js <輸出的 html>'); process.exit(1); }
const wi = process.argv.indexOf('--width'), width = wi > 0 ? Number(process.argv[wi + 1]) : 4;
const ki = process.argv.indexOf('--skill');
if (ki > 0) S.setSkills([process.argv[ki + 1]]);
global.window = undefined;
require(path.join(__dirname, '../js/i18n.js'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FN = MT.floorName, mn = c => MT.monName(c);
const ITEM_NAME = { Yk: '銅鑰匙', Bk: '銀鑰匙', Rk: '金鑰匙', hp: MT.t('name_hp'), HP: MT.t('name_HP'), at: MT.t('name_at'), df: MT.t('name_df'), P1: '日記第一頁', P2: '日記第二頁', P3: '日記第三頁', FN: '失落的音符', Mb: '《怪物圖鑑》', Ch: '鑿子' };
const itemName = t => ITEM_NAME[t] || MT.itemName(t);
const DOOR = { Yd: '銅門', Bd: '銀門', Rd: '金門' };
const NPC_NAME = c => MT.t('npc_' + c) !== 'npc_' + c ? MT.t('npc_' + c) : MT.t(MT.NPCS[c].shop || ('level_' + MT.NPCS[c].level));

console.error(`高手（寬度 ${width}）跑路線中…`);
const t0 = Date.now();
const run = S.solveStrong({ width, log: true });
if (!run.done) { console.error('高手沒通關，攻略產生不了'); process.exit(1); }
const log = S.logList(run.st);
console.error(`通關，分數 ${run.score}，${log.length} 筆紀錄，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);

// ── 照紀錄重播，切段、存每段開始時的地圖與能力 ──
const stats = st => ({ hp: st.hp, atk: st.atk, def: st.def, gold: st.gold, exp: st.exp, lv: st.lv, ky: st.keys.y, kb: st.keys.b, kr: st.keys.r, skill: st.skill ? Object.assign({}, st.skill) : null });
const st = S.newRun();
const chapters = [];
let cur = null, pre = [];
// 照「進度」分段：最高到過的樓層一樣的步驟算同一段（途中回低樓層做的事也放在這一段，另外畫那層的地圖）。
// log 的順序：collect 撿到的東西（pick／talk／trig／sage）會出現在造成它的 act 之後、下一個 act 之前
for (const e of log) {
  if (e.type !== 'act') { pre.push(e); continue; }
  const a = e.a, f = a.c.f;
  S.collect(st);
  const stage = S.maxFloor(st);
  if (!cur || cur.stage !== stage) {
    cur = { stage, f: stage, start: stats(st), steps: [], maps: {}, monState: S.clone(st) };
    chapters.push(cur);
  }
  if (!cur.maps[f]) cur.maps[f] = st.maps[f].map(r => r.join(' '));   // 這一段第一次動到這層時的地圖
  const before = S.clone(st);
  const ok = S.doAction(st, a);
  if (!ok) { console.error('重播不一致：', JSON.stringify(a)); process.exit(1); }
  cur.steps.push({ a, pre, hp: st.hp, before, after: stats(st) });
  pre = [];
  cur.end = stats(st);
}
S.collect(st);
const finalPre = pre;

// ── 一步的文字 ──
function actText(s) {
  const a = s.a, b = s.before, t = a.c.t;
  if (a.kind === 'door') return `開<b>${DOOR[t]}</b>`;
  if (a.kind === 'break') return '用鑿子敲開<b>裂牆</b>';
  if (a.kind === 'pass') return `走過<b>夾擊</b>的格子（損失 ${b.hp - s.hp}）`;
  if (a.kind === 'fight') {
    const m = MT.MONSTERS[t];
    if (m.onBump && !b.flags['bump:' + t]) return `碰<b>${esc(mn(t))}</b>（劇情）`;
    return `打倒<b>${esc(mn(t))}</b>（損失 ${b.hp - s.hp}，金幣 +${m.gold}、經驗 +${m.exp}）`;
  }
  if (a.kind === 'buy') {
    if (a.shop === 'keys' || a.shop === 'keys2') return `向${MT.t(a.shop === 'keys' ? 'frog' : 'frog2')}買<b>${{ y: '銅', b: '銀', r: '金' }[a.what]}鑰匙</b>（${MT.SHOPS[a.shop][a.what]} 金）`;
    const S2 = MT.SHOPS[a.shop];
    return `在${MT.t(a.shop)}買<b>${{ hp: '生命 +' + S2.hp, atk: '攻擊 +' + S2.atk, def: '防禦 +' + S2.def }[a.what]}</b>（${b.gold - s.after.gold} 金）`;
  }
  if (a.kind === 'level') return `在${MT.t('level_' + a.id)}升到 <b>Lv${s.after.lv}</b>（${b.exp - s.after.exp} 經驗）`;
  if (a.kind === 'deal') return `跟${esc(NPC_NAME(t))}交易（${MT.DEALS[a.id].price} 金）`;
  if (a.kind === 'choose') return `選技能「<b>${MT.t('skill_' + a.skill)}</b>」`;
  return a.kind;
}
const preText = es => {
  const picks = {}, talks = [], other = [];
  for (const e of es) {
    if (e.type === 'pick') { const k = FN(e.f); (picks[k] = picks[k] || []).push(itemName(e.t)); }
    else if (e.type === 'talk') talks.push(`${FN(e.f)} 跟${esc(NPC_NAME(e.t))}說話`);
    else if (e.type === 'sage') other.push(`${FN(e.f)} 老琴師${e.lv === 1 ? '鑑定技能（生效）' : '把技能升到 Lv' + e.lv}`);
    else if (e.type === 'trig') other.push(`${FN(e.f)} 劇情`);
  }
  const parts = [];
  const pk = Object.entries(picks).map(([f, xs]) => {
    const cnt = {}; xs.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
    return f + ' ' + Object.entries(cnt).map(([x, n]) => x + (n > 1 ? '×' + n : '')).join('、');
  });
  if (pk.length) parts.push('沿路撿：' + pk.join('；'));
  if (talks.length) parts.push(talks.join('；'));
  if (other.length) parts.push(other.join('；'));
  return parts.join('<br>');
};
const statLine = s => `生命 <b class="hp">${s.hp}</b>　攻擊 <b class="atk">${s.atk}</b>　防禦 <b class="def">${s.def}</b>　金幣 <b class="gold">${s.gold}</b>　Lv <b>${s.lv}</b>（經驗 ${s.exp}）　鑰匙 <b class="ky">銅 ${s.ky}</b>／<b class="kb">銀 ${s.kb}</b>／<b class="kr">金 ${s.kr}</b>${s.skill ? `　技能 <b>${MT.t('skill_' + s.skill.type)}${s.skill.lv ? ' Lv' + s.skill.lv : '（未鑑定）'}</b>` : ''}`;
const SPN = { first: '先攻', magic: '魔法', pierce: '破甲', double: '連擊', drain: '吸血', pincer: '夾擊', boss: 'Boss', invincible: '無敵' };
const spText = m => (m.sp || []).map(s => `<span class="tag${s === 'boss' ? ' boss' : ''}">${SPN[s]}${s === 'drain' ? ' ' + Math.round(m.drain * 100) + '%' : ''}</span>`).join(' ');
function monTable(state, f) {
  const seen = [];
  for (const row of state.maps[f]) for (const t of row) if (MT.isMonster(t) && !seen.includes(t)) seen.push(t);
  if (!seen.length) return '';
  const rows = seen.map(t => {
    const m = MT.MONSTERS[t], c = MT.calc(state, t);
    const d = c.damage == null ? '<span class="bad">打不動</span>' : c.damage >= state.hp ? `<span class="bad">${c.damage}（打不過）</span>` : c.damage;
    return `<tr><td><canvas class="spr" data-code="${t}" width="32" height="32"></canvas></td><td>${esc(mn(t))}</td><td>${m.hp}</td><td>${m.atk}</td><td>${m.def}</td><td>${m.gold}</td><td>${m.exp}</td><td>${spText(m)}</td><td class="num">${d}</td></tr>`;
  });
  return `<table class="mt"><thead><tr><th></th><th>怪物</th><th>生命</th><th>攻擊</th><th>防禦</th><th>金幣</th><th>經驗</th><th>特技</th><th>以到達時能力估算的損失</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// ── 各層說明（第一次到那層的那一段才放） ──
const NOTES = {
  1: '起點旁有一把銅鑰匙和小愛心。<b>《怪物圖鑑》在左邊中間</b>，打一隻綠史萊姆就拿得到，先拿：之後地圖上怪物腳下才會出現戰鬥代價。上樓（左上）不用鑰匙。老門房會提醒「鑰匙永遠比門少」。左下那面裂牆後面是往隱藏層 B1 的樓梯，等拿到鑿子再回來。',
  2: '國王在中上，跟他說話拿兩把銅鑰匙（從王宮廚房的備用鑰匙圈拆下來的），說完他會讓路。再找他說話，他會一直偷瞄左邊的牆——<b>左邊 (0,3) 是暗牆</b>，後面有紅色小劍（攻略路線沒走，自己去撿）。右上兩隻盔甲蟲防禦 15，攻擊到 16 才打得動。',
  3: '<b>節拍之神在最上方</b>，用經驗值換等級，越早升越賺。骷髏館長（2×2）守著鐵劍、日記第一頁和紅色小劍。左邊是骷髏兵、骷髏戰士、骷髏兵的連戰走廊，盡頭是紅色小劍、藍色小盾，中間沒有補給。',
  4: '音叉祭壇在中上，前期買攻擊或防禦比買生命賺。左邊撿得到<b>第一把鑿子</b>；受傷的衛兵送防禦 +3（他被大蝙蝠咬了屁股）。',
  5: '鼓魔像（3×3）900 血、攻 78。Boss 還活著時不能飛走。左右各有一條連戰走廊通往補給，先算好再進 Boss 房。',
  6: '呱呱商人在中間賣鑰匙（銅 10／銀 50／金 100）。雙刀劍客登場：連擊，一回合打兩下，這一區開始防禦很值錢。右上的裂牆後面是大愛心和銀鑰匙。',
  7: '老鐵匠也被捲進塔裡了：<b>100 金幣幫你把武器磨利，攻擊 +6</b>，塔裡的鑿子都是他塞的。上方走廊有夾擊石像，兩隻中間那格不要踩。下半部的暗牆 (7,8) 後面是第二把鑿子（路線沒走）。',
  8: '小偷用 30 金賣三把「撿到的」銅鑰匙（鑰匙圈上刻著王宮廚房）。獄卒長（2×2，連擊）守著鐵盾和大愛心；日記第二頁在右上。下半部一整排夾擊石像，先從側邊打掉一隻再走中間。',
  9: '銀劍在中間的金門後面。右側的信差鴿子送來國王寄的《風之羽》（請用爪子簽收）。右下的裂牆後面是紅色小劍、藍色小盾。',
  10: '弦之魔女（3×3）3200 血。打倒後豎琴之靈出現在 Boss 的位置，<b>碰它選技能</b>：選了就不能換，要到 12F 找老琴師鑑定才會生效。',
  11: '古老音叉祭壇在中間。鏡中少女送生命 +600，提醒你去 12F 找老琴師。吸血蝙蝠開打前吸走目前生命的 20%：<b>血少的時候再去打</b>。右側 (10,6) 是暗牆。',
  12: '<b>老琴師在中間</b>：碰他就鑑定技能，勇者 Lv12、Lv22 時再碰可以升級。中間金門後面有第三把鑿子。',
  13: '右上是<b>進階節拍之神</b>：每級給的能力是 3F 的兩倍多，從這裡開始都在這邊升。呱呱商人的表哥自稱正牌，鑰匙比較貴。鏡之騎士（2×2）守著銀盾。',
  14: '琴師學徒：<b>320 金幣防禦 +14</b>（「保證——大概——不會壞」）。碎鏡小鬼很多，破甲讓防禦只算一半。',
  15: '回音之鏡（3×3）6500 血、連擊；鏡子裡是七歲、唱得完美的自己。打倒後找回「笛」。',
  16: '水晶祭壇在中間。占星師說「東南角有星光從牆縫漏出來」：<b>暗牆 (10,12)</b>，後面是紅色小劍、藍色小盾、大愛心（路線沒走）。',
  17: '<b>日記第三頁</b>在左邊中間。迷路的小節拍送一把銀鑰匙。',
  18: '回音指揮（2×2，魔法）守著金劍。',
  19: '<b>失落的音符在最上面的金門後面</b>（真結局必需）。最後的衛兵送生命 +1500。金盾：用鑿子敲開中間的裂牆，或從下面打兩隻無聲刺客。',
  20: '先打倒兩隻休止符衛士打開鐵門。第一次碰指揮家會播劇情（攻擊被寂靜吞掉），之後他變成可以打的形態。',
  0: '小偷的老家，箱子上都寫著「不是偷的」。小偷的奶奶送一把鑿子，還叫你看到孫子時叫他回家吃飯。',
};

// ── 每段的 HTML ──
const MAPS = [];
let secHtml = '';
chapters.forEach(ch => {
  const floorsHere = Object.keys(ch.maps).map(Number).sort((x, y) => (x === ch.f ? -1 : y === ch.f ? 1 : x - y));
  const marks = {};
  floorsHere.forEach(f => { marks[f] = []; });
  const rows = ch.steps.map((s, k) => {
    marks[s.a.c.f].push([s.a.c.x, s.a.c.y, k + 1]);
    const p = preText(s.pre);
    const back = s.a.c.f !== ch.f ? ' class="back"' : '';
    return (p ? `<tr class="pre"><td></td><td colspan="3">${p}</td></tr>` : '') +
      `<tr${back}><td class="n"><span class="dot">${k + 1}</span></td><td>${FN(s.a.c.f)} (${s.a.c.x},${s.a.c.y})</td><td>${actText(s)}</td><td class="num">${s.hp}</td></tr>`;
  });
  const figs = floorsHere.map(f => {
    MAPS.push(ch.maps[f]);
    return `<figure class="mapfig"><canvas class="map" data-sec="${MAPS.length - 1}" data-floor="${f}" width="352" height="480"></canvas><figcaption>${FN(f)}${f !== ch.f ? '（回來做的事）' : ''}</figcaption><script type="application/json" class="marks">${JSON.stringify(marks[f])}</script></figure>`;
  }).join('');
  secHtml += `<section id="f${ch.f}" class="floor">
    <h2>${FN(ch.f)}</h2>
    <p class="arrive">到達時：${statLine(ch.start)}</p>
    ${NOTES[ch.f] ? `<p class="note">${NOTES[ch.f]}</p>` : ''}
    ${ch.f === 1 ? '' : ''}${monTable(ch.monState, ch.f)}
    <div class="maps">${figs}</div>
    <table class="steps"><thead><tr><th>步驟</th><th>位置</th><th>動作</th><th>之後生命</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <p class="leave">上樓前：${statLine(ch.end)}</p>
  </section>
`;
});
const seenFloor = new Set(chapters.map(c => c.f));
const b1 = chapters.some(c => c.maps[0]);
const fin = run.st, rate = MT.rating(fin);
const toc = ['<a href="#basic">基本規則</a>', '<a href="#skill">技能</a>', '<a href="#tips">技巧</a>', '<a href="#true">真結局</a>', '<a href="#boss">Boss</a>', '<a href="#secret">隱藏要素</a>']
  .concat([...Array(21).keys()].slice(1).filter(f => seenFloor.has(f)).map(f => `<a href="#f${f}">${FN(f)}</a>`)).concat(['<a href="#end">通關</a>']).join('');
const bossRow = (c, f, note) => { const m = MT.MONSTERS[c]; return `<tr><td><canvas class="spr" data-code="${c}" width="32" height="32"></canvas></td><td>${esc(mn(c))}</td><td>${f}</td><td>${m.hp}</td><td>${m.atk}</td><td>${m.def}</td><td>${spText(m)}</td><td>${note}</td></tr>`; };
const css = fs.readFileSync(path.join(__dirname, 'guide.css'), 'utf8');
const js = ['data.js', 'core.js', 'sprites.js'].map(f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8')).join('\n');
const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>魔塔通關攻略</title>
<style>${css}</style>
</head>
<body>
<main>
<a class="back" href="../">← 遊戲攻略</a>
<h1>魔塔：失落的旋律 通關攻略 <small>對應版本 ${esc(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/VERSION: '([\w.]+)'/)[1])}</small></h1>
<p class="muted">這份攻略的路線是用遊戲本身的規則，讓自動玩家從 1F 一路打到結局實際跑出來的：照著步驟走一定打得通，最後剩 <b class="hp">${fin.hp}</b> 生命、評價 <b>${rate.grade}</b>（${rate.score} 分），並拿到<b>${rate.trueEnd ? '真結局' : '一般結局'}</b>。數字都是當下能力實算，不是估計。自動玩家會把生命壓得很低（有幾段只剩幾十血），真人建議多留緩衝、常存檔；也可以照自己的節奏調整順序。暗牆它不會去找，另外列在「隱藏要素」。</p>

<nav class="toc">${toc}</nav>

<section id="basic">
<h2>基本規則</h2>
<ul>
<li><b>戰鬥是固定結果</b>：勇者先攻，雙方輪流，每一下的傷害是「攻擊 − 對方防禦」。攻擊不高於對方防禦就完全打不動。</li>
<li><b>回合數</b>＝怪物生命 ÷（你的攻擊 − 怪物防禦），無條件進位；你損失的生命＝（回合數 − 1）× 怪物每下的傷害。</li>
<li><b>先攻</b>：開打前先打你一下。<b>魔法</b>：無視防禦。<b>破甲</b>：防禦只算一半。<b>連擊</b>：一回合打兩下。<b>吸血</b>：開打前先吸走你目前生命的一定比例（血少時打比較划算）。<b>夾擊</b>：走進兩隻夾擊怪中間的格子，失去目前生命的 1/3。</li>
<li>同色鑰匙開同色門（銅／銀／金）。紅色小劍加攻擊、藍色小盾加防禦、小愛心／大愛心補生命，數值依區域：1–5F 小劍小盾 +2、愛心 +50／+200；6–10F 與 B1 小劍小盾 +3、愛心 +100／+400；11–15F 小劍小盾 +3、愛心 +150／+600；16–20F 小劍小盾 +4、愛心 +250／+1000。</li>
<li><b>經驗值</b>：打怪會得到，3F 節拍之神、13F 進階節拍之神換等級（共用等級，13F 給得多）。</li>
<li><b>《怪物圖鑑》</b>要在 1F 撿到才看得到怪物能力；<b>《風之羽》</b>在 9F，可以在去過的樓層之間飛，Boss 還活著的樓層飛不走。</li>
<li><b>鑿子</b>敲得開有裂痕的牆，用一次少一把；全塔 7 面裂牆、4 把鑿子，要挑。</li>
</ul>
</section>

<section id="skill">
<h2>技能（10F 打倒弦之魔女後三選一）</h2>
<table class="mt"><thead><tr><th>唱法</th><th>效果（Lv1／2／3）</th><th>強在</th><th>弱在</th></tr></thead><tbody>
<tr><td>沉穩低音</td><td>被打少受 20%／35%／50%</td><td>連擊、魔法、Boss 都有效，最穩</td><td>攻擊太低時一樣拖很久</td></tr>
<tr><td>回音</td><td>被打的那一下彈回 35%／60%／85%，無視防禦</td><td>高攻怪、Boss：牠打你越痛死得越快</td><td>防禦太高時怪打不痛你，彈回去的也少</td></tr>
<tr><td>連音</td><td>每回合多打一下：+60%／+100%／+100%＋50%</td><td>高血、低防的怪</td><td>對剛好過門檻的高防怪，多的那下很小</td></tr>
</tbody></table>
<p>選完要到 <b>12F 老琴師</b>鑑定才生效；勇者 Lv12、Lv22 時再找他升級。三種都打得通：自動高手三種各跑一次，分數都在 21000～22600（這份路線選的是「${MT.t('skill_' + fin.skill.type)}」）。</p>
</section>

<section id="tips">
<h2>技巧</h2>
<div class="grid2">
<div class="card"><h3>先拿圖鑑、先衝節拍之神</h3>3F 第一級只要 10 經驗。前期每一點攻防，都會在後面每一場戰鬥回本。</div>
<div class="card"><h3>攻擊 vs. 防禦</h3>攻擊的價值在「少打幾回合」，剛好跨過一個回合門檻時效果最大；防禦的價值在「每一下少扣一點」，怪攻擊越高、連擊、打得越久越值錢。撿小劍、小盾前後打開圖鑑比一次數字。</div>
<div class="card"><h3>鑰匙要省</h3>門比鑰匙多很多，不可能全開。上樓那扇門先留著，8F 小偷的鑰匙最便宜。</div>
<div class="card"><h3>不急的怪先放著</h3>紅字或代價太高的先跳過，能力上來再飛回來打，代價可能只剩一半甚至 0。吸血怪留到血少的時候。</div>
<div class="card"><h3>交易幾乎都划算</h3>7F 老鐵匠（100 金→攻 +6）、8F 小偷（30 金→3 銅鑰匙）、14F 琴師學徒（320 金→防 +14）。</div>
<div class="card"><h3>生命最後再買</h3>評價看的是最後剩多少血，剩下的金幣、經驗會幫你折算。攻防先買才省得到血。</div>
</div>
</section>

<section id="true">
<h2>真結局條件</h2>
<ul>
<li>撿齊<b>三頁日記</b>：3F（骷髏館長後面）、8F（右上）、17F（左邊中段）。</li>
<li>找到<b>失落的音符</b>：19F 最上面的金門後面，要留一把金鑰匙。</li>
<li>兩樣都有，打倒指揮家後進入真結局；少一樣是一般結局。評價 S 也要真結局。</li>
</ul>
</section>

<section id="boss">
<h2>Boss 資料</h2>
<table class="mt"><thead><tr><th></th><th>Boss</th><th>樓層</th><th>生命</th><th>攻擊</th><th>防禦</th><th>特技</th><th>備註</th></tr></thead><tbody>
${bossRow('K1', '3F', '2×2，守鐵劍')}${bossRow('DG', '5F', '3×3，打倒後找回大鼓')}${bossRow('K2', '8F', '2×2，守鐵盾')}${bossRow('SR', '10F', '3×3，打倒後選技能')}
${bossRow('K3', '13F', '2×2，守銀盾')}${bossRow('EM', '15F', '3×3，打倒後找回笛')}${bossRow('K4', '18F', '2×2，守金劍')}${bossRow('rg', '20F', '兩隻都倒下舞台鐵門才開')}${bossRow('M2', '20F', '3×3，第一次碰打不動，劇情後才能開打')}
</tbody></table>
</section>

<section id="secret">
<h2>隱藏要素</h2>
<table class="mt"><thead><tr><th>種類</th><th>位置</th><th>說明</th></tr></thead><tbody>
<tr><td>暗牆（直接走過去）</td><td>2F (0,3)、7F (7,8)、11F (10,6)、16F (10,12)</td><td>看起來是牆，磚縫有一點點不一樣；用「查看」點牆會說「好像不太一樣」。國王、占星師會暗示</td></tr>
<tr><td>裂牆（要鑿子）</td><td>1F (2,12)→B1、6F、9F、12F、14F、17F、19F</td><td>鑿子只有 4 把：4F、7F 暗牆後、12F 金門後、B1 奶奶</td></tr>
<tr><td>隱藏層 B1</td><td>1F 左下裂牆後的樓梯</td><td>${esc(NOTES[0])}${b1 ? `攻略路線在 ${FN(chapters.find(c => c.maps[0]).f)} 那一段順路下去。` : ''}</td></tr>
</tbody></table>
</section>

${secHtml}
<section id="end">
<h2>通關</h2>
${finalPre.length ? `<p class="muted">${preText(finalPre)}</p>` : ''}
<p>最後：${statLine(stats(fin))}</p>
<p>評價 <b>${rate.grade}</b>：剩餘生命 ${rate.hp} ＋ 資源折算 ${rate.bonus} ＝ ${rate.score} 分（S 要 ${MT.RATING.S} 分以上且真結局、A ${MT.RATING.A}、B ${MT.RATING.B}）。</p>
</section>
</main>
<script>${js}</script>
<script>
(function () {
  const MAPS = ${JSON.stringify(MAPS)};
  const T = 32, SC = 2;
  function spriteFor(code) {
    if (MT.MONSTERS[code]) return [MT.MONSTERS[code].sprite, MT.MONSTERS[code].pal];
    if (MT.ITEMS[code]) return [MT.ITEMS[code].sprite, MT.ITEMS[code].pal];
    if (MT.NPCS[code]) return [MT.NPCS[code].sprite, MT.NPCS[code].pal];
    return { UU: ['stairsUp'], DD: ['stairsDown'], Yd: ['door', 'doorY'], Bd: ['door', 'doorB'], Rd: ['door', 'doorR'], Gt: ['gate'] }[code] || null;
  }
  const big = (name, pal, n) => { const d = MT.SPRITES[name]; return MT.sprite(name, pal, T * n / ((d && d.size) || 16)); };
  document.querySelectorAll('canvas.map').forEach(cv => {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const f = Number(cv.dataset.floor), rows = MAPS[cv.dataset.sec].map(r => r.split(' ')), zone = MT.zoneOf(f);
    cv.width = T * 11; cv.height = T * 15;
    rows.forEach((row, y) => row.forEach((code, x) => {
      const kind = code === '##' ? 'wall' : code === 'Hw' ? 'hidden' : code === 'Cw' ? 'cracked' : 'floor';
      g.drawImage(MT.terrain(kind, zone, T, (x * 7 + y * 13) % 10), x * T, y * T);
    }));
    const done = new Set();
    rows.forEach((row, y) => row.forEach((code, x) => {
      if (['##', '..', 'Hw', 'Cw'].includes(code)) return;
      const sp = spriteFor(code); if (!sp) return;
      const n = MT.MONSTERS[code] && MT.MONSTERS[code].size || 1;
      if (n > 1) { if (done.has(code)) return; done.add(code); g.drawImage(big(sp[0], sp[1], n), x * T, y * T); return; }
      g.drawImage(MT.sprite(sp[0], sp[1], SC), x * T, y * T);
    }));
    const marks = JSON.parse(cv.parentNode.querySelector('.marks').textContent);
    const byCell = {};
    marks.forEach(([x, y, n]) => { (byCell[x + ',' + y] = byCell[x + ',' + y] || []).push(n); });
    g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    Object.entries(byCell).forEach(([k, ns]) => {
      const [x, y] = k.split(',').map(Number), label = ns.join(',');
      const w = Math.max(18, g.measureText(label).width + 8);
      g.fillStyle = 'rgba(255,216,74,0.95)'; g.strokeStyle = '#1b1a26'; g.lineWidth = 1.5;
      const cx = x * T + T / 2, cy = y * T + 9;
      g.beginPath(); g.roundRect ? g.roundRect(cx - w / 2, cy - 8, w, 16, 8) : g.rect(cx - w / 2, cy - 8, w, 16); g.fill(); g.stroke();
      g.fillStyle = '#231a00'; g.fillText(label, cx, cy + 0.5);
    });
  });
  document.querySelectorAll('canvas.spr').forEach(cv => {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const sp = spriteFor(cv.dataset.code); if (!sp) return;
    const n = MT.MONSTERS[cv.dataset.code] && MT.MONSTERS[cv.dataset.code].size || 1;
    g.drawImage(n > 1 ? big(sp[0], sp[1], 1) : MT.sprite(sp[0], sp[1], SC), 0, 0);
  });
})();
</script>
</body>
</html>
`;
fs.writeFileSync(out, html);
console.error(`寫好了：${out}（${chapters.length} 段、${(html.length / 1024).toFixed(0)} KB）`);
