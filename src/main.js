import { TRIP, PLACES, STAYS, STAY_NOTE, RENTAL, DAYS, BUDGET, RISKS, SNOW_STATS, DRIVING_RULES, FOOD, LINKS, EMERGENCY } from './data.js';
import { createWorld, DAY_COLORS } from './scene.js';

const $ = (s, el = document) => el.querySelector(s);
const yen = (n) => '¥' + n.toLocaleString();
const twd = (n) => 'NT$' + Math.round(n * TRIP.rate).toLocaleString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gmap = (r) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.from)}&destination=${encodeURIComponent(r.to)}&travelmode=${r.m === 'walk' ? 'walking' : 'driving'}`;
const TONE = { blue: '#3b82f6', amber: '#f59e0b', green: '#10b981', red: '#ef4444' };
const dayCost = (n) => BUDGET.rows[n - 1].reduce((a, b) => a + b, 0);
const TOTAL = DAYS.reduce((a, d) => a + dayCost(d.n), 0);
const daysUntil = (iso) => Math.ceil((new Date(iso) - new Date()) / 86400000);

// ---------- 行前任務（存在 localStorage） ----------
const TASKS = [
  { id: 'ghibli', due: '2026-11-10', text: '搶吉卜力 1/20 Premium 平日票（台灣 13:00 開賣，先登入 Boo-Woo 會員）', tag: '票券' },
  { id: 'onestay', due: '2026-12-14', text: '名古屋 OneStay 一宿：免費取消期限，確認是否付款鎖房', tag: '住宿' },
  { id: 'sakura', due: '2026-12-30', text: '高山櫻庵：免費取消期限', tag: '住宿' },
  { id: 'kanazawa', due: '2026-12-31', text: '金澤 Airbnb 民宿下訂（可免費取消）', tag: '住宿' },
  { id: 'okada', due: '2027-01-14', text: '岡田旅館（預付）：免費取消期限', tag: '住宿' },
  { id: 'lodge', due: '2027-01-14', text: '瀨戶 Lodge：免費取消期限', tag: '住宿' },
  { id: 'idp', due: '2026-12-31', text: '申請國際駕照／日文譯本', tag: '自駕' },
  { id: 'rental', due: '2026-11-30', text: '租車下訂，並把租車公司、預約編號填進網站（src/data.js 的 RENTAL）', tag: '自駕' },
  { id: 'car', due: '2026-12-31', text: '租車：確認雪胎、加租雪鏈、冬季保險', tag: '自駕' },
  { id: 'crab', due: '2027-01-10', text: '金澤 1/17 蟹料理晚餐訂位（確認整隻蟹／時價／服務費）', tag: '餐廳' },
  { id: 'model', due: '2027-01-10', text: '郡上八幡食品模型體驗電話預約 0575-65-3378', tag: '體驗' },
  { id: 'shiroyama', due: '2027-01-12', text: '電洽白川鄉觀光協會：城山展望台冬季是否開放 05769-6-1013', tag: '確認' },
  { id: 'gear', due: '2027-01-12', text: '防滑鞋、防寒衣物、暖暖包準備', tag: '裝備' },
  { id: 'ropeway', due: '2027-01-18', text: '前一晚查新穗高纜車「運行情報」與天氣', tag: '確認' },
];
const doneSet = new Set(JSON.parse(localStorage.getItem('trip-tasks') || '[]'));
const saveTasks = () => { localStorage.setItem('trip-tasks', JSON.stringify([...doneSet])); renderStatus(); };

// ---------- 3D 世界 ----------
const world = createWorld($('#world'), { onPick: (key) => openPlace(key) });

// ---------- 面板 ----------
const panel = $('#panel');
let current = null;
function show(name, html, title) {
  current = name;
  document.querySelectorAll('.rail button').forEach((b) => b.classList.toggle('on', b.dataset.view === name.split(':')[0]));
  panel.innerHTML = `<header><h2>${title}</h2><button class="x" aria-label="關閉">✕</button></header><div class="body">${html}</div>`;
  panel.classList.add('open');
  world.setPanelOffset(240);
  $('.x', panel).onclick = closePanel;
  panel.querySelectorAll('[data-day]').forEach((el) => (el.onclick = () => openDay(+el.dataset.day)));
  panel.querySelectorAll('[data-place]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); world.flyToPlace(el.dataset.place, 18); world.selectPlace(el.dataset.place); }));
  panel.querySelectorAll('img[data-zoom]').forEach((img) => (img.onclick = () => openLightbox(img.src, img.alt)));
  $('.body', panel).scrollTop = 0;
}
function closePanel() {
  panel.classList.remove('open'); current = null;
  world.setPanelOffset(0);
  document.querySelectorAll('.rail button').forEach((b) => b.classList.remove('on'));
  world.highlightDay(null);
}

const VIEWS = {
  overview() {
    const d = daysUntil(TRIP.start);
    const chain = ['airport', 'nagoya', 'gujo', 'takayama', 'shirakawa', 'kanazawa', 'furukawa', 'okuhida', 'shinhotaka', 'seto', 'ghibli', 'airport'];
    show('overview', `
      <div class="hero">
        <div class="hero-t">${TRIP.title}</div>
        <div class="hero-s">2027/1/13（三）– 1/20（三）｜四人自駕｜8天7夜</div>
        <div class="kpis">
          <div><b>${d > 0 ? d : 0}</b><span>天後出發</span></div>
          <div><b>11</b><span>個地點</span></div>
          <div><b>5</b><span>處住宿</span></div>
          <div><b>${twd(TOTAL)}</b><span>人均預估</span></div>
        </div>
      </div>
      <h3>路線</h3>
      <div class="chain">${chain.map((k, i) => `<button class="chip" data-place="${k}">${PLACES[k].name}</button>${i < chain.length - 1 ? '<i>→</i>' : ''}`).join('')}</div>
      <h3>航班</h3>
      <div class="card row"><span class="ico">🛬</span><div>${TRIP.flights.in}<small>入境領行李約 1~1.5 小時，約 14:00 機場取車</small></div></div>
      <div class="card row"><span class="ico">🛫</span><div>${TRIP.flights.out}<small>16:00 離開吉卜力，18:15 前到航廈報到</small></div></div>
      <h3>每日一覽</h3>
      ${DAYS.map(dayCard).join('')}
      <div class="note">💡 設計優點：只需搬 4 次行李（名古屋→高山→金澤→奧飛驒→瀨戶），高山、金澤各連住兩晚，雪天被砍的行程隔天還能補回。</div>
    `, '世界總覽');
  },
  days() { show('days', DAYS.map(dayCard).join(''), '每日行程'); },
  stays() {
    show('stays', `
      <h3>🚗 租車</h3>
      <div class="card rental">
        <div class="kv"><span>租車公司</span><b>${RENTAL.url ? `<a href="${esc(RENTAL.url)}" target="_blank" rel="noopener">${RENTAL.company} ↗</a>` : RENTAL.company}</b></div>
        <div class="kv"><span>車型</span><b>${RENTAL.car}</b></div>
        <div class="kv"><span>預約編號</span><b>${RENTAL.booking}</b></div>
        <div class="kv"><span>費用</span><b>${RENTAL.price}</b></div>
        <div class="kv"><span>取車</span><b>${RENTAL.pickup}</b></div>
        <div class="kv"><span>還車</span><b>${RENTAL.dropoff}</b></div>
        <div class="kv"><span>免費取消</span><b>${RENTAL.cancel}</b></div>
        <div class="muted" style="margin-top:6px">取車時當場確認：</div>
        <div class="checks">${RENTAL.checks.map((c) => `<span class="badge">☐ ${c}</span>`).join('')}</div>
      </div>
      <h3>🏨 住宿</h3>
      <p class="lead">固定兩處連住兩晚，減少搬運行李；最後一晚住瀨戶（近吉卜力公園）。</p>
      ${STAYS.map((s) => `
        <div class="card stay">
          <div class="stay-h"><span class="badge">${s.days}・${s.date}</span><span class="nights">${s.nights} 晚</span></div>
          <a class="stay-n" href="${esc(s.url)}" target="_blank" rel="noopener">${s.name} ↗</a>
          <div class="where" data-place="${s.place}">📍 ${PLACES[s.place].name}（在地圖上看）</div>
          <div class="price">${s.price}${s.alt ? `<small>${s.alt}</small>` : ''}</div>
          <div class="muted">${s.note}</div>
        </div>`).join('')}
      <div class="note">⚠️ ${STAY_NOTE}</div>
    `, '住宿・租車');
  },
  budget() {
    const totals = BUDGET.cols.map((_, c) => BUDGET.rows.reduce((a, r) => a + r[c], 0));
    const all = totals.reduce((a, b) => a + b, 0);
    const max = Math.max(...BUDGET.rows.map((r) => r.reduce((a, b) => a + b, 0)));
    let acc = 0;
    const conic = totals.map((t, i) => { const a = acc; acc += (t / all) * 360; return `${BUDGET.colors[i]} ${a}deg ${acc}deg`; }).join(',');
    show('budget', `
      <div class="kpi-grid">
        <div class="card kpi"><span>人均 8 天</span><b>${twd(all)}</b><small>${yen(all)}</small></div>
        <div class="card kpi"><span>人均每日</span><b>${twd(all / 8)}</b><small>${yen(Math.round(all / 8))} / 天</small></div>
        <div class="card kpi wide"><span>4 人總開銷</span><b>${twd(all * 4)}</b><small>${yen(all * 4)}｜匯率 ¥1 ≈ NT$${TRIP.rate}</small></div>
      </div>
      <h3>開銷結構</h3>
      <div class="card donut-wrap">
        <div class="donut" style="background:conic-gradient(${conic})"><div>${yen(all)}</div></div>
        <ul class="legend">${BUDGET.cols.map((c, i) => `<li><i style="background:${BUDGET.colors[i]}"></i>${c}<b>${Math.round((totals[i] / all) * 100)}%</b><small>${yen(totals[i])}</small></li>`).join('')}</ul>
      </div>
      <h3>每日人均（JPY）</h3>
      <div class="card bars">
        ${BUDGET.rows.map((r, d) => { const sum = r.reduce((a, b) => a + b, 0); return `
          <div class="bar-row" data-day="${d + 1}"><span class="bl">D${d + 1}</span>
            <div class="bar">${r.map((v, i) => `<i style="width:${(v / max) * 100}%;background:${BUDGET.colors[i]}" title="${BUDGET.cols[i]} ${yen(v)}"></i>`).join('')}</div>
            <span class="bv">${yen(sum)}</span></div>`; }).join('')}
      </div>
      <div class="note">${BUDGET.note}</div>
    `, '8 天開銷預估');
  },
  snow() {
    const maxDepth = Math.max(...SNOW_STATS.map((s) => s.depthNum));
    show('snow', `
      <h3>四個優化方向</h3>
      ${RISKS.map((r) => `
        <details class="card risk"><summary><span class="no">${r.no}</span><b>${r.title}</b><span class="lv ${r.level === '高風險' ? 'hi' : ''}">${r.level}</span></summary>
          <p>${r.desc}</p><ul>${r.fix.map((f) => `<li>${f}</li>`).join('')}</ul></details>`).join('')}
      <h3>每日 Checkpoint（硬性判斷點）</h3>
      <div class="card"><table class="tbl"><tr><th>天</th><th>判斷條件</th><th>對應動作</th></tr>
        ${DAYS.filter((d) => d.checkpoint).map((d) => `<tr data-day="${d.n}"><td><b>D${d.n}</b></td><td>${d.checkpoint.when}</td><td>${d.checkpoint.act}</td></tr>`).join('')}</table></div>
      <h3>下雪時的調整</h3>
      ${DAYS.filter((d) => d.snow).map((d) => `<div class="card row" data-day="${d.n}"><span class="ico">❄️</span><div><b>Day ${d.n}</b>　${d.snow}</div></div>`).join('')}
      <h3>1 月平均最深積雪（氣象庁平年值 1991–2020）</h3>
      <div class="card bars">
        ${SNOW_STATS.map((s) => `<div class="bar-row"><span class="bl wide">${s.place}</span><div class="bar"><i style="width:${(s.depthNum / maxDepth) * 100}%;background:#60a5fa"></i></div><span class="bv">${s.depth}</span></div>
          <div class="sub muted">降雪總量 ${s.total}・${s.days}・均溫 ${s.temp}</div>`).join('')}
      </div>
      <h3>開車原則</h3>
      ${DRIVING_RULES.map((r) => `<div class="card row"><span class="ico">${r.icon}</span><div><b>${r.title}</b><small>${r.text}</small></div></div>`).join('')}
      <div class="note">路面結冰、能見度差、除雪影響車流是這幾個地點 1 月中旬的日常，不是運氣不好才會遇到。</div>
    `, '雪況應變');
  },
  food() {
    show('food', FOOD.map((f) => `
      <h3><span data-place="${f.place}" class="link">📍 ${f.area}</span><span class="badge">${f.day}</span></h3>
      ${f.items.map(([n, d]) => `<div class="card food"><b>${n}</b><small>${d}</small></div>`).join('')}`).join('') +
      '<div class="note">整理自 Threads 網友分享（食記為個人經驗，出發前請再次確認營業狀態與價格）。</div>', '在地美食');
  },
  info() {
    show('info', `
      <h3>🆘 緊急電話</h3>
      <div class="sos">${EMERGENCY.map(([n, l]) => `<a class="card" href="tel:${n.replace('#', '%23')}"><b>${n}</b><small>${l}</small></a>`).join('')}</div>
      ${LINKS.map((g) => `<h3>${g.group}</h3>${g.items.map(([i, t, u, d]) => `<a class="card row link-card" href="${u}" target="_blank" rel="noopener"><span class="ico">${i}</span><div><b>${t} ↗</b><small>${d}</small></div></a>`).join('')}`).join('')}
      <div class="note">📶 這個網站支援離線：在手機上用瀏覽器打開一次後「加到主畫面」，山區沒訊號也能看行程（外部連結仍需網路）。</div>
    `, '實用資訊');
  },
  tasks() {
    const sorted = [...TASKS].sort((a, b) => a.due.localeCompare(b.due));
    show('tasks', `
      <p class="lead">勾選會存在這台裝置的瀏覽器裡。</p>
      ${sorted.map((t) => { const d = daysUntil(t.due); return `
        <label class="card task ${doneSet.has(t.id) ? 'done' : ''}">
          <input type="checkbox" data-task="${t.id}" ${doneSet.has(t.id) ? 'checked' : ''}>
          <div><div>${t.text}</div><small><span class="badge">${t.tag}</span> 期限 ${t.due.slice(5).replace('-', '/')}
          ${doneSet.has(t.id) ? '' : `<em class="${d <= 14 ? 'urgent' : ''}">${d >= 0 ? `剩 ${d} 天` : '已過期'}</em>`}</small></div>
        </label>`; }).join('')}
    `, '行前任務');
    panel.querySelectorAll('[data-task]').forEach((cb) => (cb.onchange = () => {
      cb.checked ? doneSet.add(cb.dataset.task) : doneSet.delete(cb.dataset.task);
      saveTasks(); VIEWS.tasks();
    }));
  },
};

function dayCard(d) {
  return `<button class="card day" data-day="${d.n}" style="--c:${DAY_COLORS[d.n - 1]}">
    <span class="dn">D${d.n}</span>
    <span class="dt"><b>${d.title}</b><small>${d.date}${d.stay ? '・住 ' + PLACES[d.stay].name : '・返台'}</small></span>
    <span class="tag" style="background:${TONE[d.tone]}">${d.tag}</span>
  </button>`;
}

function openDay(n) {
  const d = DAYS[n - 1];
  world.highlightDay(n);
  show('days:' + n, `
    <div class="day-head" style="--c:${DAY_COLORS[n - 1]}">
      <div><span class="tag" style="background:${TONE[d.tone]}">${d.tag}</span> <span class="muted">${d.date}</span></div>
      <div class="cost">本日人均 <b>${yen(dayCost(n))}</b> ≈ ${twd(dayCost(n))}</div>
      <div class="pager">${n > 1 ? `<button data-day="${n - 1}">← D${n - 1}</button>` : '<span></span>'}${n < 8 ? `<button data-day="${n + 1}">D${n + 1} →</button>` : ''}</div>
    </div>
    ${d.checkpoint ? `<div class="checkpoint">⏰ <b>Checkpoint</b>　${d.checkpoint.when} → ${d.checkpoint.act}</div>` : ''}
    <div class="timeline">${d.blocks.map((b) => `
      <div class="tl"><span class="tl-i">${b.icon}</span><div><b>${b.title}</b>${b.items.length ? `<ul>${b.items.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}</div></div>`).join('')}
    </div>
    <div class="note">💡 ${d.tip}</div>
    ${d.extra ? `<div class="note">🏮 ${d.extra}</div>` : ''}
    ${d.snow ? `<div class="note snow">❄️ 下雪時：${d.snow}</div>` : ''}
    <h3>景點意義與注意事項</h3>
    ${d.spots.map((s) => `<details class="card spot"><summary><b>${s.name}</b>${s.badge ? `<span class="badge">${s.badge}</span>` : ''}</summary>
      <p>${s.why}</p><ul>${s.notes.map((x) => `<li>${x}</li>`).join('')}</ul></details>`).join('')}
    <h3>路線（點擊開啟 Google 地圖導航）</h3>
    ${d.routes.map((r, i) => `<a class="card route" href="${gmap(r)}" target="_blank" rel="noopener"><span class="rn">${i + 1}</span><span>${r.from} → ${r.to}</span><span class="rm">${r.m === 'walk' ? '🚶' : '🚗'} ${r.t}</span></a>`).join('')}
    <div class="muted small">Google 地圖一般路況估計，未含積雪，冬季請再加 30–50%。</div>
    <h3>路線截圖</h3>
    <div class="shots">${d.shots.map((s, i) => `<img data-zoom src="img/routes/shot${s}.jpg" alt="Day ${n} 路線 ${i + 1}" loading="lazy">`).join('')}</div>
  `, `Day ${n}｜${d.title}`);
}

function openPlace(key) {
  const days = DAYS.filter((d) => d.stops.includes(key));
  world.selectPlace(key);
  world.flyToPlace(key, 18);
  if (days.length === 1) return openDay(days[0].n);
  const stay = STAYS.find((s) => s.place === key);
  const food = FOOD.find((f) => f.place === key);
  show('place', `
    ${stay ? `<div class="card stay"><div class="stay-h"><span class="badge">${stay.days}</span><span class="nights">${stay.nights} 晚</span></div>
      <a class="stay-n" href="${esc(stay.url)}" target="_blank" rel="noopener">🛏 ${stay.name} ↗</a><div class="price">${stay.price}</div><div class="muted">${stay.note}</div></div>` : ''}
    <h3>相關行程</h3>${days.map(dayCard).join('')}
    ${food ? `<h3>在地美食</h3>${food.items.map(([n, d]) => `<div class="card food"><b>${n}</b><small>${d}</small></div>`).join('')}` : ''}
  `, '📍 ' + PLACES[key].name);
}

// ---------- 左側選單 / 右側控制 ----------
document.querySelectorAll('.rail button').forEach((b) => (b.onclick = () => {
  if (current && current.split(':')[0] === b.dataset.view) return closePanel();
  world.highlightDay(null);
  if (b.dataset.view !== 'days') world.home();
  VIEWS[b.dataset.view]();
}));
$('#zin').onclick = () => world.zoom(0.7);
$('#zout').onclick = () => world.zoom(1.4);
$('#home').onclick = () => { world.home(); world.highlightDay(null); };
$('#play').onclick = (e) => { world.setAnimate(!world.animate); e.currentTarget.textContent = world.animate ? '⏸' : '▶'; };
let snowOn = true;
$('#snowbtn').onclick = (e) => { snowOn = !snowOn; world.setSnow(snowOn); e.currentTarget.classList.toggle('off', !snowOn); };

// ---------- 搜尋 ----------
const index = [
  ...Object.entries(PLACES).map(([k, p]) => ({ label: p.name, sub: '地點', go: () => openPlace(k) })),
  ...DAYS.flatMap((d) => d.spots.map((s) => ({ label: s.name, sub: `Day ${d.n}・景點`, go: () => openDay(d.n) }))),
  ...STAYS.map((s) => ({ label: s.name, sub: `${s.days}・住宿`, go: () => openPlace(s.place) })),
  ...FOOD.flatMap((f) => f.items.map(([n]) => ({ label: n, sub: `${f.area}・美食`, go: () => VIEWS.food() }))),
];
const search = $('#search'), results = $('#results');
search.oninput = () => {
  const q = search.value.trim().toLowerCase();
  if (!q) { results.hidden = true; return; }
  const hits = index.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 8);
  results.innerHTML = hits.length ? hits.map((h, i) => `<button data-i="${index.indexOf(h)}">${h.label}<small>${h.sub}</small></button>`).join('') : '<div class="empty">找不到</div>';
  results.hidden = false;
  results.querySelectorAll('button').forEach((b) => (b.onclick = () => { index[+b.dataset.i].go(); results.hidden = true; search.value = ''; }));
};
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) results.hidden = true; });

// ---------- Lightbox ----------
function openLightbox(src, alt) {
  const lb = $('#lightbox');
  lb.innerHTML = `<img src="${src}" alt="${esc(alt)}"><div>${esc(alt)}</div>`;
  lb.hidden = false; lb.onclick = () => (lb.hidden = true);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#lightbox').hidden = true; } });

// ---------- 底部狀態列 ----------
const dayChips = $('#daychips');
dayChips.innerHTML = DAYS.map((d) => `<button data-day="${d.n}" style="--c:${DAY_COLORS[d.n - 1]}" title="${d.title}">D${d.n}</button>`).join('');
dayChips.querySelectorAll('button').forEach((b) => (b.onclick = () => openDay(+b.dataset.day)));
let lastDay = 0;
world.onCarMove((t) => {
  const n = world.dayAtCar(t);
  if (n === lastDay) return;
  lastDay = n;
  dayChips.querySelectorAll('button').forEach((b) => b.classList.toggle('car', +b.dataset.day === n));
  $('#carinfo').textContent = `🚗 模擬中：Day ${n} ${DAYS[n - 1].title}`;
});
function renderStatus() {
  const pct = Math.round((doneSet.size / TASKS.length) * 100);
  $('#pct').textContent = pct + '%';
  $('#pctbar').style.width = pct + '%';
  const d = daysUntil(TRIP.start), g = daysUntil(TRIP.ghibliSale);
  $('#countdown').innerHTML = `✈️ 距出發 <b>${Math.max(d, 0)}</b> 天` + (g >= 0 ? `　🎟️ 吉卜力搶票 <b>${g}</b> 天後（11/10 13:00）` : '');
  const next = [...TASKS].filter((t) => !doneSet.has(t.id)).sort((a, b) => a.due.localeCompare(b.due))[0];
  $('#nexttask').textContent = next ? `下一件事：${next.text.split('（')[0]}（${next.due.slice(5).replace('-', '/')}）` : '行前任務全部完成 🎉';
  $('#taskdot').textContent = TASKS.length - doneSet.size;
}
$('#nexttask').onclick = () => VIEWS.tasks();
renderStatus();

// ---------- 離線（Service Worker） ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
