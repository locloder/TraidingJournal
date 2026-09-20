let trades = [];
let accounts = [];
let tradeSeq = 1, acctSeq = 1;
let editingTradeId = null;
const STORAGE_ON = typeof TradeDB !== 'undefined';

function pad(n){return n.toString().padStart(2,'0');}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1700);
}
function parseNum(str){
  if(str===null || str===undefined) return NaN;
  const s = String(str).trim().replace(',', '.');
  if(s==='') return NaN;
  return parseFloat(s);
}
function computeDir(entry, exit, net){
  if(entry===null || exit===null || isNaN(entry) || isNaN(exit)) return 'Long';
  const delta = exit - entry;
  if(net===undefined || net===null || isNaN(net)){
    return delta>=0 ? 'Long' : 'Short';
  }
  if(delta===0) return net>=0 ? 'Long' : 'Short';
  return (delta>=0) === (net>=0) ? 'Long' : 'Short';
}
function computeSession(dtStr){
  if(!dtStr) return 'London';
  const d = new Date(dtStr);
  if(isNaN(d)) return 'London';
  const h = d.getHours();
  if(h>=0 && h<8) return 'Asia';
  if(h>=8 && h<13) return 'London';
  if(h>=13 && h<16) return 'London/NY';
  if(h>=16 && h<21) return 'NY';
  return 'Asia';
}

async function saveState(){
  if(!STORAGE_ON) return;
  try{
    await TradeDB.set('trades', JSON.stringify(trades));
    await TradeDB.set('accounts', JSON.stringify(accounts));
    await TradeDB.set('settings', JSON.stringify({theme: document.body.dataset.theme, tradeSeq, acctSeq}));
  }catch(e){ console.warn('save failed', e); }
}
async function loadState(){
  if(!STORAGE_ON) return;
  try{
    const t = await TradeDB.get('trades').catch(()=>null);
    if(t && t.value) trades = JSON.parse(t.value);
    const a = await TradeDB.get('accounts').catch(()=>null);
    if(a && a.value) accounts = JSON.parse(a.value);
    const s = await TradeDB.get('settings').catch(()=>null);
    if(s && s.value){
      const parsed = JSON.parse(s.value);
      tradeSeq = parsed.tradeSeq || (trades.reduce((m,t)=>Math.max(m,t.id||0),0)+1);
      acctSeq = parsed.acctSeq || (accounts.reduce((m,a)=>Math.max(m,a.id||0),0)+1);
      if(parsed.theme) setTheme(parsed.theme, true);
    }
  }catch(e){ console.warn('load failed', e); }
}

function updateDbCountNote(){
  const el = document.getElementById('dbCountNote');
  if(el) el.textContent = `${trades.length} сделок · ${accounts.length} счетов`;
}

function animateValue(el, endText, isNumeric){
  if(!isNumeric){ el.textContent = endText; return; }
  const match = endText.match(/-?[\d.]+/);
  if(!match){ el.textContent = endText; return; }
  const end = parseFloat(match[0]);
  const prefix = endText.slice(0, match.index);
  const suffix = endText.slice(match.index + match[0].length);
  const start = parseFloat((el.dataset.raw||'0'));
  el.dataset.raw = end;
  const dur = 500, t0 = performance.now();
  function step(now){
    const p = Math.min(1, (now - t0)/dur);
    const eased = 1 - Math.pow(1-p, 3);
    const val = start + (end-start)*eased;
    el.textContent = prefix + val.toFixed(match[0].includes('.')?2:0).replace(/^-0.00$/,'0.00') + suffix;
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function tickClock(){
  const now = new Date();
  const h = now.getHours();
  const greet = h<6?'Доброй ночи':(h<12?'Доброе утро':(h<18?'Добрый день':'Добрый вечер'));
  document.getElementById('homeGreeting').textContent = greet;
  document.getElementById('homeDate').textContent = now.toLocaleDateString('ru-RU',{weekday:'long', year:'numeric', month:'long', day:'numeric'}).toUpperCase();
  document.getElementById('homeClock').textContent = pad(now.getHours())+' : '+pad(now.getMinutes())+' : '+pad(now.getSeconds());
  document.getElementById('dateStr').textContent = now.toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});
  document.getElementById('clockStr').textContent = pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
}
tickClock(); setInterval(tickClock,1000);

const tickerData = [
  {n:'EUR/USD', v:'1.06432', d:'-0.12%', up:false},
  {n:'GBP/USD', v:'1.2678', d:'+0.08%', up:true},
  {n:'Bitcoin', v:'26,611', d:'+0.11%', up:true},
  {n:'Ethereum', v:'1,594.9', d:'+0.05%', up:true},
  {n:'S&P 500', v:'4,320.6', d:'-0.13%', up:false},
  {n:'US 100', v:'14,707.8', d:'+0.18%', up:true},
  {n:'XAU/USD', v:'2,341.2', d:'+0.22%', up:true},
];
document.getElementById('homeTicker').innerHTML = [...tickerData,...tickerData].map(t=>
  `<div class="tk">${t.n} <b>${t.v}</b> <span class="${t.up?'up':'down'}">${t.d}</span></div>`).join('');

function gotoView(name){
  if(name==='home'){
    document.getElementById('view-home').style.display='flex';
    document.getElementById('appShell').classList.remove('active');
    return;
  }
  document.getElementById('view-home').style.display='none';
  document.getElementById('appShell').classList.add('active');
  document.querySelectorAll('.nav-item[data-view]').forEach(i=>i.classList.toggle('active', i.dataset.view===name));
  document.querySelectorAll('.view2').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  if(name==='screenshots') onShotsViewOpen();
  const titles = {dashboard:'Обзор', journal:'Журнал сделок', screenshots:'Скриншоты', calendar:'Календарь', analytics:'Аналитика', accounts:'Счета'};
  document.getElementById('pagetitle').textContent = titles[name];
  document.getElementById('crumbs').textContent = 'Trading Journal / '+titles[name];
  setTimeout(()=>Object.values(charts).forEach(c=>c&&c.resize()),10);
}
document.querySelectorAll('[data-goto]').forEach(el=>el.addEventListener('click',()=>gotoView(el.dataset.goto)));
document.querySelectorAll('.nav-item[data-view]').forEach(el=>el.addEventListener('click',()=>gotoView(el.dataset.view)));

Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.font.size = 10.5;
Chart.defaults.interaction.mode = 'nearest';
Chart.defaults.interaction.intersect = false;
Chart.defaults.interaction.axis = 'x';

function chartColors(){
  const cs = getComputedStyle(document.body);
  return {
    green: cs.getPropertyValue('--green').trim(),
    red: cs.getPropertyValue('--red').trim(),
    accent: cs.getPropertyValue('--accent').trim(),
    faint: cs.getPropertyValue('--text-faint').trim(),
    border: cs.getPropertyValue('--border').trim(),
  };
}
const charts = {};
let growthMeta = [];
let riskMeta = [];
let lastGaugeVal = 0;
let gaugeRAF = null;
function drawGaugeArc(value, gMin, gMax){
  const fill = document.getElementById('gaugeFill');
  const knob = document.getElementById('gaugeKnob');
  const pulse = document.getElementById('gaugePulse');
  if(!fill || !knob) return;
  const cx=100, cy=104, r=80, topX=100, topY=cy-r;
  let theta;
  if(value>=0){
    const f = gMax>0 ? Math.max(0,Math.min(1, value/gMax)) : 0;
    theta = (Math.PI/2)*(1-f);
  } else {
    const f = gMin<0 ? Math.max(0,Math.min(1, value/gMin)) : 0;
    theta = (Math.PI/2)*(1+f);
  }
  const ex = cx + r*Math.cos(theta);
  const ey = cy - r*Math.sin(theta);
  const sweep = value>=0 ? 1 : 0;
  const isZero = Math.abs(value) < 0.001;
  const d = isZero
    ? `M${topX},${topY} L${topX},${topY}`
    : `M${topX},${topY} A${r},${r} 0 0,${sweep} ${ex.toFixed(2)},${ey.toFixed(2)}`;
  fill.setAttribute('d', d);
  knob.setAttribute('cx', ex.toFixed(2));
  knob.setAttribute('cy', ey.toFixed(2));
  const neg = value<0;
  fill.classList.toggle('neg', neg);
  knob.classList.toggle('neg', neg);
  if(pulse){
    pulse.setAttribute('cx', ex.toFixed(2));
    pulse.setAttribute('cy', ey.toFixed(2));
    pulse.classList.toggle('neg', neg);
    pulse.classList.toggle('idle', isZero);
  }
}
function animateGauge(fromVal, toVal, gMin, gMax, duration){
  duration = duration || 700;
  if(gaugeRAF) cancelAnimationFrame(gaugeRAF);
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now-start)/duration);
    const eased = 1-Math.pow(1-t,3);
    drawGaugeArc(fromVal + (toVal-fromVal)*eased, gMin, gMax);
    if(t<1) gaugeRAF = requestAnimationFrame(step);
  }
  gaugeRAF = requestAnimationFrame(step);
}
function winrateTooltipHandler(context){
  const el = document.getElementById('winrateTooltip');
  if(!el) return;
  const tt = context.tooltip;
  if(!tt || tt.opacity === 0){ el.classList.remove('show'); return; }
  const dp = tt.dataPoints && tt.dataPoints[0];
  if(dp) el.textContent = dp.label+': '+dp.raw;
  el.classList.add('show');
}
function buildCharts(){
  const c = chartColors();
  Chart.defaults.color = c.faint;
  Chart.defaults.borderColor = c.border;
  if(charts.radar) Object.values(charts).forEach(ch=>ch.destroy());

  charts.radar = new Chart(document.getElementById('radarChart'),{
    type:'radar',
    data:{labels:['Win Rate','Recovery','Profit Factor','Consistency'],
      datasets:[{data:[0,0,0,0], backgroundColor:c.accent+'22', borderColor:c.accent, borderWidth:2, pointBackgroundColor:c.accent, pointRadius:3, pointHitRadius:10}]},
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:600, easing:'easeOutCubic'},
      interaction:{mode:'nearest', intersect:true, axis:'xy'},
      scales:{r:{angleLines:{color:c.border}, grid:{color:c.border}, pointLabels:{color:c.faint, font:{size:10}}, ticks:{display:false}, suggestedMin:0, suggestedMax:100}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{title:(items)=> items[0].label}}}}
  });
  charts.growth = new Chart(document.getElementById('growthChart'),{
    type:'line',
    data:{labels:[], datasets:[{data:[], borderColor:c.accent, backgroundColor:c.accent+'18', fill:true, tension:.3, pointRadius:0, pointHitRadius:18, pointHoverRadius:5, pointHoverBackgroundColor:c.accent, borderWidth:2}]},
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:600, easing:'easeOutCubic'},
      scales:{x:{grid:{color:c.border}, ticks:{maxRotation:0, autoSkip:true}}, y:{grid:{color:c.border}, ticks:{callback:v=>'$'+v}}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{title:(items)=> growthMeta[items[0].dataIndex] || ''}}}}
  });
  charts.session = new Chart(document.getElementById('sessionChart'),{
    type:'bar',
    data:{labels:[], datasets:[{data:[], backgroundColor:[], borderRadius:6, maxBarThickness:46}]},
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:600, easing:'easeOutCubic'},
      scales:{x:{grid:{display:false}}, y:{grid:{color:c.border}, ticks:{callback:v=>'$'+v}}},
      plugins:{legend:{display:false}}}
  });
  charts.risk = new Chart(document.getElementById('riskChart'),{
    type:'bar',
    data:{labels:[], datasets:[{data:[], backgroundColor:[], borderRadius:5, maxBarThickness:26}]},
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:600, easing:'easeOutCubic'},
      scales:{x:{grid:{display:false}, ticks:{autoSkip:true, maxRotation:0}}, y:{grid:{color:c.border}, ticks:{callback:v=>v+'R'}}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{title:(items)=> riskMeta[items[0].dataIndex] || ''}}}}
  });
  charts.winrate = new Chart(document.getElementById('winrateDonut'),{
    type:'doughnut',
    data:{labels:['Win','Lose'], datasets:[{data:[1,1], backgroundColor:[c.border,c.border], borderWidth:0, borderRadius:6, spacing:3}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:'72%', animation:{duration:600, easing:'easeOutCubic'},
      plugins:{legend:{display:false}, tooltip:{enabled:false, external:winrateTooltipHandler}}}
  });
}

function refreshAccountSelect(){
  const sel = document.getElementById('f-acc');
  sel.innerHTML = accounts.length ? accounts.map(a=>`<option>${a.name}</option>`).join('') : '<option value="">— нет счетов —</option>';
}
document.getElementById('addAcctBtn').addEventListener('click',()=>{
  const name = document.getElementById('af-name').value.trim();
  if(!name){ document.getElementById('af-name').focus(); showToast('Укажите название счёта'); return; }
  const type = document.getElementById('af-type').value;
  const init = parseNum(document.getElementById('af-init').value)||0;
  const goal = parseNum(document.getElementById('af-goal').value)||0;
  accounts.push({id:acctSeq++, name, type, init, goal});
  document.getElementById('af-name').value=''; document.getElementById('af-init').value=''; document.getElementById('af-goal').value='';
  renderAccounts(); refreshAccountSelect(); recalcAll(); saveState();
  showToast('Счёт добавлен');
});
function renderAccounts(){
  const grid = document.getElementById('acctGrid');
  const empty = document.getElementById('acctEmpty');
  grid.innerHTML=''; empty.style.display = accounts.length ? 'none':'block';
  accounts.forEach((a,i)=>{
    const net = trades.filter(t=>t.acc===a.name).reduce((s,t)=>s+t.net,0);
    const bal = a.init + net;
    const won = trades.filter(t=>t.acc===a.name && t.net>0).length;
    const total = trades.filter(t=>t.acc===a.name).length;
    const wr = total ? Math.round(won/total*100) : 0;
    const pct = a.goal>0 ? Math.min(100, Math.max(0,(bal/a.goal)*100)) : 0;
    const card = document.createElement('div');
    card.className='acct-card';
    card.style.animationDelay = (i*40)+'ms';
    card.innerHTML = `
      <div class="acct-top"><div class="acct-name">${a.name}</div><div class="acct-type">${a.type}</div></div>
      <div class="acct-bal ${net<0?'neg':''}">$${bal.toFixed(2)}</div>
      <div class="acct-label">Текущий баланс</div>
      <div class="acct-row"><span>Win rate</span><span>${total? wr+'%':'—'}</span></div>
      <div class="acct-row"><span>Цель</span><span>$${bal.toFixed(0)} / ${a.goal?'$'+a.goal.toFixed(0):'—'}</span></div>
      <div class="bar-track"><div class="bar-fill" data-pct="${pct}" style="width:0"></div></div>
      <div style="text-align:right;margin-top:10px;"><button class="del-btn" data-del-acct="${a.id}">удалить ×</button></div>`;
    card.addEventListener('click', ()=> openAccountModal(a.id));
    grid.appendChild(card);
  });
  requestAnimationFrame(()=>grid.querySelectorAll('.bar-fill').forEach(b=>b.style.width=b.dataset.pct+'%'));
  grid.querySelectorAll('[data-del-acct]').forEach(btn=>btn.addEventListener('click',(ev)=>{
    ev.stopPropagation();
    accounts = accounts.filter(a=>a.id != btn.dataset.delAcct);
    renderAccounts(); refreshAccountSelect(); recalcAll(); saveState();
  }));
}

const acctOverlay = document.getElementById('acctModalOverlay');
let acctModalId = null;
function openAccountModal(id){
  const a = accounts.find(x=>x.id==id); if(!a) return;
  acctModalId = id;
  document.getElementById('acctModalTitle').textContent = a.name;
  const accTrades = trades.filter(t=>t.acc===a.name).sort((x,y)=> new Date(y.close||y.open) - new Date(x.close||x.open));
  const net = accTrades.reduce((s,t)=>s+t.net,0);
  const bal = a.init + net;
  const balEl = document.getElementById('acctModalBalance');
  balEl.textContent = '$'+bal.toFixed(2);
  balEl.className = 'dsr-pnl'+(accTrades.length?(net>=0?' pos':' neg'):'');
  document.getElementById('acctModalCount').textContent = accTrades.length+' '+(accTrades.length===1?'сделка':'сделок');
  const list = document.getElementById('acctTradeList');
  const empty = document.getElementById('acctModalEmpty');
  list.innerHTML=''; empty.style.display = accTrades.length ? 'none':'block';
  accTrades.forEach((t,i)=>{
    const row = document.createElement('div');
    row.className='day-trade-row';
    row.style.animationDelay = (i*35)+'ms';
    row.innerHTML = `
      <div class="dtr-left">
        <span class="badge pair">${t.pair}</span>
        <span class="badge ${t.dir.toLowerCase()}">${t.dir}</span>
        <span>${fmtDT(t.close)}</span>
      </div>
      <div class="dtr-pnl" style="color:${t.net>=0?'var(--green)':'var(--red)'}">${t.net>=0?'+':''}$${t.net.toFixed(2)}</div>`;
    row.addEventListener('click', ()=>{ closeAccountModal(); openViewModal(t.id); });
    list.appendChild(row);
  });
  acctOverlay.classList.add('show');
}
function closeAccountModal(){ acctOverlay.classList.remove('show'); acctModalId=null; }
document.getElementById('acctModalClose').addEventListener('click', closeAccountModal);
document.getElementById('acctModalCancel').addEventListener('click', closeAccountModal);
acctOverlay.addEventListener('click', e=>{ if(e.target===acctOverlay) closeAccountModal(); });
document.getElementById('acctModalDelete').addEventListener('click', ()=>{
  if(!acctModalId) return;
  if(!confirm('Удалить счёт? Сделки останутся в журнале, но потеряют привязку к счёту.')) return;
  accounts = accounts.filter(a=>a.id != acctModalId);
  closeAccountModal();
  renderAccounts(); refreshAccountSelect(); recalcAll(); saveState();
  showToast('Счёт удалён');
});

const overlay = document.getElementById('tradeModalOverlay');
const formWrap = document.getElementById('tradeFormWrap');
const detailWrap = document.getElementById('tradeDetailWrap');
const modalFoot = document.getElementById('tradeModalFoot');

function restrictNumericInput(id, allowNegative){
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', ()=>{
    let v = el.value;
    let neg = false;
    if(allowNegative && v.charAt(0)==='-'){ neg = true; }
    let cleaned = v.replace(/[^0-9.]/g,'');
    const firstDot = cleaned.indexOf('.');
    if(firstDot !== -1){
      cleaned = cleaned.slice(0, firstDot+1) + cleaned.slice(firstDot+1).replace(/\./g,'');
    }
    el.value = (neg?'-':'') + cleaned;
  });
}
['f-entry','f-exit','f-sl','f-tp','f-risk','f-rr'].forEach(id=>restrictNumericInput(id,false));
['f-gross','f-comm'].forEach(id=>restrictNumericInput(id,true));

function suggestRR(){
  const entry = parseNum(document.getElementById('f-entry').value);
  const sl = parseNum(document.getElementById('f-sl').value);
  const tp = parseNum(document.getElementById('f-tp').value);
  const grossVal = parseNum(document.getElementById('f-gross').value);
  const hint = document.getElementById('rrAutoHint');
  if(isNaN(entry) || isNaN(sl) || isNaN(tp) || entry===sl){ if(hint) hint.textContent='\u00a0'; return; }
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr = risk>0 ? (reward/risk) : 0;
  if(!rr){ if(hint) hint.textContent='\u00a0'; return; }
  const signedRR = (!isNaN(grossVal) && grossVal<0) ? -rr : rr;
  if(hint) hint.innerHTML = `по цене: <span class="rr-auto-tag">${signedRR.toFixed(2)}</span> · <span style="text-decoration:underline;cursor:pointer;" id="rrUseSuggested">подставить</span>`;
  const useBtn = document.getElementById('rrUseSuggested');
  if(useBtn) useBtn.addEventListener('click', ()=>{ document.getElementById('f-rr').value = signedRR.toFixed(2); });
}
['f-entry','f-sl','f-tp','f-gross'].forEach(id=> document.getElementById(id).addEventListener('input', suggestRR));


const pairOptions = ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD','EURGBP','EURJPY','GBPJPY','EURAUD','AUDJPY','XAUUSD','XAGUSD','XPTUSD','BTCUSD','ETHUSD','SOLUSD','US30','US100','US500','DE40','UK100','JP225','WTIUSD','BRENT'];
function attachPairAutocomplete(input){
  const list = document.createElement('div');
  list.className = 'autocomplete-list';
  document.body.appendChild(list);
  function position(){
    const r = input.getBoundingClientRect();
    list.style.left = r.left+'px';
    list.style.top = (r.bottom+4)+'px';
    list.style.width = r.width+'px';
  }
  function render(filter){
    const f = filter.trim().toUpperCase();
    const matches = f ? pairOptions.filter(p=>p.includes(f)) : pairOptions;
    if(!matches.length){ list.classList.remove('show'); return; }
    list.innerHTML = matches.map(p=>`<div class="autocomplete-item" data-val="${p}">${p}</div>`).join('');
    position();
    list.classList.add('show');
  }
  input.addEventListener('input', ()=> render(input.value));
  input.addEventListener('focus', ()=> render(input.value));
  input.addEventListener('blur', ()=> setTimeout(()=>list.classList.remove('show'), 150));
  list.addEventListener('mousedown', e=>{
    const item = e.target.closest('.autocomplete-item');
    if(item){ input.value = item.dataset.val; list.classList.remove('show'); input.dispatchEvent(new Event('change')); }
  });
  window.addEventListener('resize', ()=>{ if(list.classList.contains('show')) position(); });
  window.addEventListener('scroll', ()=>{ if(list.classList.contains('show')) position(); }, true);
}
attachPairAutocomplete(document.getElementById('f-pair'));

(function initFloatingTooltips(){
  const tip = document.createElement('div');
  tip.className = 'floating-tip';
  document.body.appendChild(tip);
  function place(target){
    const r = target.getBoundingClientRect();
    tip.textContent = target.dataset.tip;
    tip.classList.add('show');
    const tipRect = tip.getBoundingClientRect();
    let top = r.top - tipRect.height - 8;
    if(top < 8) top = r.bottom + 8;
    let left = r.left + r.width/2 - tipRect.width/2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.top = top+'px';
    tip.style.left = left+'px';
  }
  function hide(){ tip.classList.remove('show'); }
  document.addEventListener('mouseover', e=>{
    const el = e.target.closest('[data-tip]');
    if(el) place(el);
  });
  document.addEventListener('mouseout', e=>{
    const el = e.target.closest('[data-tip]');
    if(el) hide();
  });
  document.addEventListener('scroll', hide, true);
})();

function calcDelta(t){
  const entry = parseFloat(t.entry), exit = parseFloat(t.exit);
  if(isNaN(entry) || isNaN(exit) || entry===0) return null;
  const delta = exit-entry;
  const pct = (delta/Math.abs(entry))*100;
  return {delta, pct};
}

function openAddModal(){
  editingTradeId = null;
  document.getElementById('tradeModalTitle').textContent = 'Новая сделка';
  formWrap.style.display='block'; detailWrap.style.display='none';
  document.getElementById('tradeModalEdit').style.display='none'; document.getElementById('tradeModalSave').style.display='inline-block';
  ['f-open','f-close','f-pair','f-entry','f-exit','f-sl','f-tp','f-gross','f-comm','f-risk','f-rr','f-setup','f-note'].forEach(id=>document.getElementById(id).value='');
  refreshAccountSelect();
  const hint = document.getElementById('rrAutoHint'); if(hint) hint.innerHTML='&nbsp;';
  overlay.classList.add('show');
}
function openEditModal(id){
  const t = trades.find(x=>x.id==id); if(!t) return;
  editingTradeId = id;
  document.getElementById('tradeModalTitle').textContent = 'Редактировать сделку';
  formWrap.style.display='block'; detailWrap.style.display='none';
  document.getElementById('tradeModalEdit').style.display='none'; document.getElementById('tradeModalSave').style.display='inline-block';
  document.getElementById('f-open').value = t.open||'';
  document.getElementById('f-close').value = t.close||'';
  document.getElementById('f-pair').value = t.pair;
  refreshAccountSelect();
  document.getElementById('f-acc').value = t.acc||'';
  document.getElementById('f-entry').value = t.entry ?? '';
  document.getElementById('f-exit').value = t.exit ?? '';
  document.getElementById('f-sl').value = t.sl ?? '';
  document.getElementById('f-tp').value = t.tp ?? '';
  document.getElementById('f-gross').value = t.gross;
  document.getElementById('f-comm').value = t.comm;
  document.getElementById('f-risk').value = t.lot||'';
  document.getElementById('f-rr').value = t.rr||'';
  document.getElementById('f-setup').value = t.setup||'';
  document.getElementById('f-note').value = t.note||'';
  const hint = document.getElementById('rrAutoHint'); if(hint) hint.innerHTML='&nbsp;';
  suggestRR();
  overlay.classList.add('show');
}
function openViewModal(id){
  const t = trades.find(x=>x.id==id); if(!t) return;
  editingTradeId = id;
  document.getElementById('tradeModalTitle').textContent = t.pair+' · '+t.dir;
  formWrap.style.display='none'; detailWrap.style.display='block';
  document.getElementById('tradeModalEdit').style.display='inline-block'; document.getElementById('tradeModalSave').style.display='none';
  const grid = document.getElementById('detailGrid');
  const d = calcDelta(t);
  grid.innerHTML = `
    <div class="detail-item"><div class="dk">Открытие</div><div class="dv">${fmtDT(t.open)}</div></div>
    <div class="detail-item"><div class="dk">Закрытие</div><div class="dv">${fmtDT(t.close)}</div></div>
    <div class="detail-item"><div class="dk">Счёт</div><div class="dv">${t.acc||'—'}</div></div>
    <div class="detail-item"><div class="dk">Сессия</div><div class="dv">${t.sess}</div></div>
    <div class="detail-item"><div class="dk">Цена входа</div><div class="dv">${t.entry ?? '—'}</div></div>
    <div class="detail-item"><div class="dk">Цена выхода</div><div class="dv">${t.exit ?? '—'}</div></div>
    <div class="detail-item"><div class="dk">S/L</div><div class="dv">${t.sl ?? '—'}</div></div>
    <div class="detail-item"><div class="dk">T/P</div><div class="dv">${t.tp ?? '—'}</div></div>
    <div class="detail-item"><div class="dk">Gross P&amp;L</div><div class="dv" style="color:${t.gross>=0?'var(--green)':'var(--red)'}">${t.gross>=0?'+':''}$${t.gross.toFixed(2)}</div></div>
    <div class="detail-item"><div class="dk">Net P&amp;L</div><div class="dv" style="color:${t.net>=0?'var(--green)':'var(--red)'}">${t.net>=0?'+':''}$${t.net.toFixed(2)}</div></div>
    <div class="detail-item"><div class="dk">Комиссия</div><div class="dv">${t.comm>=0?'+':''}$${t.comm.toFixed(2)}</div></div>
    <div class="detail-item"><div class="dk">Объём, лот</div><div class="dv">${t.lot||'—'}</div></div>
    <div class="detail-item"><div class="dk">RR</div><div class="dv">${t.rr||'—'}</div></div>
    <div class="detail-item"><div class="dk">△ движение цены</div><div class="dv">${d? (d.delta>=0?'+':'')+d.delta.toFixed(5)+' ('+(d.pct>=0?'+':'')+d.pct.toFixed(2)+'%)' : '—'}</div></div>
    <div class="detail-item" style="grid-column:span 2;"><div class="dk">Сетап</div><div class="dv">${t.setup||'—'}</div></div>`;
  document.getElementById('detailNote').textContent = t.note ? t.note : 'Заметок нет.';
  renderTradeShots(id);
  overlay.classList.add('show');
}
function closeModal(){ overlay.classList.remove('show'); editingTradeId=null; }
document.getElementById('tradeModalEdit').addEventListener('click', ()=> openEditModal(editingTradeId));
document.getElementById('openAddTrade').addEventListener('click', openAddModal);
document.getElementById('tradeModalClose').addEventListener('click', closeModal);
document.getElementById('tradeModalCancel').addEventListener('click', closeModal);
overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });

document.getElementById('tradeModalSave').addEventListener('click',()=>{
  if(formWrap.style.display==='none'){
    openEditModal(editingTradeId); return;
  }
  const open = document.getElementById('f-open').value;
  const close = document.getElementById('f-close').value;
  const pair = document.getElementById('f-pair').value.trim().toUpperCase();
  const acc = document.getElementById('f-acc').value;
  const entryRaw = document.getElementById('f-entry').value;
  const exitRaw = document.getElementById('f-exit').value;
  const slRaw = document.getElementById('f-sl').value;
  const tpRaw = document.getElementById('f-tp').value;
  const entry = entryRaw===''?null:parseNum(entryRaw);
  const exit = exitRaw===''?null:parseNum(exitRaw);
  const sl = slRaw===''?null:parseNum(slRaw);
  const tp = tpRaw===''?null:parseNum(tpRaw);
  const gross = parseNum(document.getElementById('f-gross').value);
  const comm = parseNum(document.getElementById('f-comm').value)||0;
  const lot = document.getElementById('f-risk').value.trim().replace(',', '.');
  const rr = parseNum(document.getElementById('f-rr').value)||0;
  const setup = document.getElementById('f-setup').value.trim();
  const note = document.getElementById('f-note').value.trim();
  const dir = computeDir(entry, exit, gross + comm);
  const sess = computeSession(open || close);
  if(!pair || isNaN(gross) || !close){ showToast('Заполните инструмент, дату закрытия и Gross P&L'); return; }
  const net = gross + comm;
  if(editingTradeId){
    const t = trades.find(x=>x.id==editingTradeId);
    Object.assign(t, {open, close, pair, dir, sess, acc, entry, exit, sl, tp, gross, comm, net, lot, rr, setup, note});
    showToast('Сделка обновлена');
  } else {
    trades.push({id:tradeSeq++, open, close, pair, dir, sess, acc, entry, exit, sl, tp, gross, comm, net, lot, rr, setup, note});
    showToast('Сделка добавлена');
  }
  closeModal();
  renderJournal(); renderAccounts(); recalcAll(); saveState();
});

function renderJournal(){
  const body = document.getElementById('journalBody');
  const empty = document.getElementById('journalEmpty');
  body.innerHTML='';
  document.getElementById('journalCount').textContent = trades.length+' записей';
  empty.style.display = trades.length ? 'none':'block';
  const sorted = [...trades].sort((a,b)=> new Date(a.close||a.open) - new Date(b.close||b.open));
  sorted.forEach((t,i)=>{
    const tr = document.createElement('tr');
    tr.style.animationDelay = (i*25)+'ms';
    const notePreview = t.note ? (t.note.length>18 ? t.note.slice(0,18)+'…' : t.note) : '—';
    tr.innerHTML = `
      <td>${i+1}</td><td>${fmtDT(t.open)}</td><td>${fmtDT(t.close)}</td>
      <td><span class="badge pair">${t.pair}</span></td>
      <td><span class="badge ${t.dir.toLowerCase()}">${t.dir}</span></td>
      <td>${t.sess}</td><td>${t.acc||'—'}</td>
      <td class="${t.gross>=0?'pnl-pos':'pnl-neg'}">${t.gross>=0?'+':''}$${t.gross.toFixed(2)}</td>
      <td>${t.comm>=0?'+':''}$${t.comm.toFixed(2)}</td>
      <td class="${t.net>=0?'pnl-pos':'pnl-neg'}">${t.net>=0?'+':''}$${t.net.toFixed(2)}</td>
      <td>${t.lot||'—'}</td><td>${t.rr||'—'}</td>
      <td>${t.setup?'<span class="badge pair">'+t.setup+'</span>':'—'}</td>
      <td title="${(t.note||'').replace(/"/g,'&quot;')}">${notePreview}</td>
      <td>${shotFlagHtml(t.id)}<button class="del-btn" data-del-trade="${t.id}">×</button></td>`;
    tr.addEventListener('click', (e)=>{ if(e.target.closest('[data-del-trade]')) return; openViewModal(t.id); });
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-del-trade]').forEach(btn=>btn.addEventListener('click',(ev)=>{
    ev.stopPropagation();
    trades = trades.filter(t=>t.id != btn.dataset.delTrade);
    unlinkShotsFromTrade(btn.dataset.delTrade);
    renderJournal(); renderAccounts(); recalcAll(); saveState();
  }));
}
function fmtDT(s){ if(!s) return '—'; const d=new Date(s); if(isNaN(d)) return s; return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }

let calCursor = new Date();
function renderCalendar(){
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  document.getElementById('calMonthLabel').textContent = calCursor.toLocaleDateString('ru-RU',{month:'long', year:'numeric'});
  const dayMap = {};
  trades.forEach(t=>{
    if(!t.close) return;
    const d = new Date(t.close);
    if(d.getFullYear()===y && d.getMonth()===m){
      const day = d.getDate();
      if(!dayMap[day]) dayMap[day] = {pnl:0,count:0};
      dayMap[day].pnl += t.net; dayMap[day].count += 1;
    }
  });
  const grid = document.getElementById('calGrid'); grid.innerHTML='';
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d=>{ const el=document.createElement('div'); el.className='cal-dow'; el.textContent=d; grid.appendChild(el); });
  const firstDay = new Date(y,m,1);
  let startOffset = (firstDay.getDay()+6)%7;
  const daysInMonth = new Date(y,m+1,0).getDate();
  const today = new Date();
  for(let i=0;i<startOffset;i++){ const el=document.createElement('div'); el.className='cal-cell empty'; grid.appendChild(el); }
  let total=0, tc=0;
  for(let d=1; d<=daysInMonth; d++){
    const el=document.createElement('div'); el.className='cal-cell';
    if(today.getFullYear()===y && today.getMonth()===m && today.getDate()===d) el.classList.add('today');
    const info = dayMap[d];
    if(info){
      el.classList.add(info.pnl>=0?'pos':'neg'); total+=info.pnl; tc+=info.count;
      el.innerHTML = `<div class="cal-daynum">${d}</div><div><div class="cal-pnl">${info.pnl>=0?'+':''}${info.pnl.toFixed(1)}</div><div class="cal-trades">${info.count} сделок</div></div>`;
    } else { el.innerHTML = `<div class="cal-daynum">${d}</div>`; }
    el.addEventListener('click', ()=> openDayModal(y, m, d));
    grid.appendChild(el);
  }
  document.getElementById('calSummary').innerHTML = `P&amp;L: <span style="color:${total>=0?'var(--green)':'var(--red)'}">${total>=0?'+':''}$${total.toFixed(2)}</span> · Сделок: ${tc}`;
}
document.getElementById('calPrev').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()-1); renderCalendar();});
document.getElementById('calNext').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()+1); renderCalendar();});

const dayOverlay = document.getElementById('dayModalOverlay');
let dayModalDate = null;
function openDayModal(y, m, d){
  dayModalDate = new Date(y, m, d);
  document.getElementById('dayModalTitle').textContent = dayModalDate.toLocaleDateString('ru-RU',{day:'numeric', month:'long', year:'numeric'});
  const dayTrades = trades.filter(t=>{
    if(!t.close) return false;
    const dt = new Date(t.close);
    return dt.getFullYear()===y && dt.getMonth()===m && dt.getDate()===d;
  }).sort((a,b)=> new Date(a.close) - new Date(b.close));

  const pnl = dayTrades.reduce((s,t)=>s+t.net,0);
  const pnlEl = document.getElementById('dayModalPnl');
  pnlEl.textContent = (pnl>=0?'+':'')+'$'+pnl.toFixed(2);
  pnlEl.className = 'dsr-pnl'+(dayTrades.length?(pnl>=0?' pos':' neg'):'');
  document.getElementById('dayModalCount').textContent = dayTrades.length+' '+(dayTrades.length===1?'сделка':'сделок');

  const list = document.getElementById('dayTradeList');
  const empty = document.getElementById('dayModalEmpty');
  list.innerHTML = '';
  empty.style.display = dayTrades.length ? 'none' : 'block';
  dayTrades.forEach((t,i)=>{
    const row = document.createElement('div');
    row.className = 'day-trade-row';
    row.style.animationDelay = (i*35)+'ms';
    row.innerHTML = `
      <div class="dtr-left">
        <span class="badge pair">${t.pair}</span>
        <span class="badge ${t.dir.toLowerCase()}">${t.dir}</span>
        <span>${fmtDT(t.close).split(' ')[1]||''}</span>
      </div>
      <div class="dtr-pnl" style="color:${t.net>=0?'var(--green)':'var(--red)'}">${t.net>=0?'+':''}$${t.net.toFixed(2)}</div>`;
    row.addEventListener('click', ()=>{ closeDayModal(); openViewModal(t.id); });
    list.appendChild(row);
  });
  dayOverlay.classList.add('show');
}
function closeDayModal(){ dayOverlay.classList.remove('show'); }
document.getElementById('dayModalClose').addEventListener('click', closeDayModal);
document.getElementById('dayModalCancel').addEventListener('click', closeDayModal);
dayOverlay.addEventListener('click', e=>{ if(e.target===dayOverlay) closeDayModal(); });
document.getElementById('dayModalAddTrade').addEventListener('click', ()=>{
  closeDayModal();
  openAddModal();
  if(dayModalDate){
    const d = dayModalDate;
    const iso = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T12:00:00';
    document.getElementById('f-open').value = iso;
    document.getElementById('f-close').value = iso;
  }
});

function stdDev(arr){ if(arr.length<2) return 0; const mean=arr.reduce((a,b)=>a+b,0)/arr.length; return Math.sqrt(arr.reduce((a,b)=>a+Math.pow(b-mean,2),0)/arr.length); }
function recalcAll(){
  const n = trades.length;
  const wins = trades.filter(t=>t.net>0), losses = trades.filter(t=>t.net<0);
  const winRate = n ? (wins.length/n*100) : 0;
  const totalPnL = trades.reduce((s,t)=>s+t.net,0);
  const grossProfit = wins.reduce((s,t)=>s+t.net,0);
  const grossLoss = Math.abs(losses.reduce((s,t)=>s+t.net,0));
  const profitFactor = grossLoss>0 ? grossProfit/grossLoss : (grossProfit>0?99:0);
  const totalInit = accounts.reduce((s,a)=>s+a.init,0);
  const returns = totalInit>0 ? (totalPnL/totalInit*100) : 0;

  const sorted = [...trades].sort((a,b)=> new Date(a.close||a.open) - new Date(b.close||b.open));
  let running = totalInit, peak = totalInit, maxDD = 0;
  const curve=[totalInit], labels=[''];
  growthMeta = ['Старт · $'+totalInit.toFixed(2)];
  sorted.forEach((t,i)=>{
    running+=t.net; curve.push(running);
    const d = new Date(t.close||t.open);
    labels.push(isNaN(d)?'':(pad(d.getDate())+'.'+pad(d.getMonth()+1)));
    growthMeta.push('Сделка #'+(i+1)+' · '+t.pair);
    if(running>peak) peak=running; const dd=peak-running; if(dd>maxDD) maxDD=dd;
  });
  const recoveryFactor = maxDD>0 ? totalPnL/maxDD : (totalPnL>0?10:0);
  const consistency = n<2 ? 0 : Math.max(0, 100 - (stdDev(sorted.map(t=>t.net)) / ((Math.abs(totalPnL)/n)||1) * 40));

  const wrTxt = n ? winRate.toFixed(1)+'%' : '—';
  const pnlTxt = n ? (totalPnL>=0?'+':'')+'$'+totalPnL.toFixed(2) : '—';
  const retTxt = totalInit>0 ? returns.toFixed(1)+'%' : '—';
  const pfTxt = n ? profitFactor.toFixed(2) : '—';
  const consTxt = n>=2 ? consistency.toFixed(0)+'%' : '—';

  ['a'].forEach(pfx=>{
    animateValue(document.getElementById(pfx+'-winrate'), wrTxt, n>0);
    const pnlEl = document.getElementById(pfx+'-pnl');
    animateValue(pnlEl, pnlTxt, n>0); pnlEl.className = 'stat-value'+(n?(totalPnL>=0?' pos':' neg'):'');
    animateValue(document.getElementById(pfx+'-returns'), retTxt, totalInit>0);
    animateValue(document.getElementById(pfx+'-pf'), pfTxt, n>0);
    animateValue(document.getElementById(pfx+'-cons'), consTxt, n>=2);
  });
  const aRing = document.getElementById('a-winrate-ring');
  if(aRing) aRing.style.setProperty('--pct', n ? winRate.toFixed(1) : 0);

  const balanceEl = document.getElementById('w-balance');
  if(balanceEl) balanceEl.textContent = '$'+(totalInit+totalPnL).toFixed(2);
  const wPnl = document.getElementById('w-pnl');
  if(wPnl){ wPnl.textContent = pnlTxt; wPnl.className = 'balance-sub-value'+(n?(totalPnL>=0?' pos':' neg'):''); }

  const usePercent = totalInit>0;
  const gaugeSeries = usePercent ? curve.map(v=>(v-totalInit)/totalInit*100) : curve.map(v=>v-totalInit);
  const histMin = Math.min(0, ...gaugeSeries);
  const histMax = Math.max(0, ...gaugeSeries);
  const floor = usePercent ? 1 : Math.max(10, Math.abs(totalPnL)*0.2 || 10);
  const gMax = +(Math.max(floor, histMax*1.15)).toFixed(usePercent?1:2);
  const gMin = +(Math.min(-floor, histMin*1.15)).toFixed(usePercent?1:2);
  const gaugeTargetVal = n ? (usePercent ? returns : totalPnL) : 0;
  animateGauge(lastGaugeVal, gaugeTargetVal, gMin, gMax);
  lastGaugeVal = gaugeTargetVal;

  const gaugeSubtitleEl = document.getElementById('gaugeSubtitle');
  if(gaugeSubtitleEl) gaugeSubtitleEl.textContent = usePercent ? '· доходность' : '· P&L';

  const gaugeValueEl = document.getElementById('gaugeValue');
  if(gaugeValueEl){
    const gaugeTxt = !n ? '—' : usePercent
      ? (returns>=0?'+':'')+returns.toFixed(1)+'%'
      : (totalPnL>=0?'+':'')+'$'+totalPnL.toFixed(2);
    animateValue(gaugeValueEl, gaugeTxt, n>0);
    gaugeValueEl.className = 'gauge-value'+(n?(gaugeTargetVal>=0?' pos':' neg'):'');
  }

  const winrateCenter = document.getElementById('winrateCenter');
  if(winrateCenter) winrateCenter.textContent = n ? winRate.toFixed(0)+'%' : '0%';
  if(charts.winrate){
    const cw = chartColors();
    charts.winrate.data.datasets[0].data = n ? [wins.length, losses.length] : [1,1];
    charts.winrate.data.datasets[0].backgroundColor = n ? [cw.green, cw.red] : [cw.border, cw.border];
    charts.winrate.update();
  }

  const longs = trades.filter(t=>t.dir==='Long').length;
  const shorts = trades.filter(t=>t.dir==='Short').length;
  const totalDir = longs+shorts;
  const longPct = totalDir ? (longs/totalDir*100) : 50;
  const shortPct = 100-longPct;
  const rLongPct = document.getElementById('ratioLongPct'); if(rLongPct) rLongPct.textContent = longPct.toFixed(1)+'%';
  const rShortPct = document.getElementById('ratioShortPct'); if(rShortPct) rShortPct.textContent = shortPct.toFixed(1)+'%';
  const rLongBar = document.getElementById('ratioBarLong'); if(rLongBar) rLongBar.style.width = longPct+'%';
  const rShortBar = document.getElementById('ratioBarShort'); if(rShortBar) rShortBar.style.width = shortPct+'%';
  const rLongCount = document.getElementById('ratioLongCount'); if(rLongCount) rLongCount.textContent = longs;
  const rShortCount = document.getElementById('ratioShortCount'); if(rShortCount) rShortCount.textContent = shorts;

  const sidebarPnl = document.getElementById('sidebarPnl');
  sidebarPnl.textContent = (totalPnL>=0?'+':'')+'$'+totalPnL.toFixed(2);
  sidebarPnl.className = 'v'+(totalPnL<0?' neg':'');

  charts.radar.data.datasets[0].data = [Math.min(100,winRate), Math.min(100,Math.max(0,recoveryFactor*20)), Math.min(100,profitFactor*20), Math.min(100,consistency)];
  charts.radar.update();

  charts.growth.data.labels = labels; charts.growth.data.datasets[0].data = curve; charts.growth.update();
  document.getElementById('growthNote').textContent = n ? `$${totalInit.toFixed(0)} → $${running.toFixed(0)}` : 'нет данных';

  const c = chartColors();
  const sessAgg = {}; trades.forEach(t=>{ sessAgg[t.sess]=(sessAgg[t.sess]||0)+t.net; });
  const sessLabels = Object.keys(sessAgg);
  charts.session.data.labels = sessLabels;
  charts.session.data.datasets[0].data = sessLabels.map(k=>sessAgg[k]);
  charts.session.data.datasets[0].backgroundColor = sessLabels.map(k=> sessAgg[k]>=0?c.green:c.red);
  charts.session.update();

  charts.risk.data.labels = sorted.map(t=>{ const d=new Date(t.close||t.open); return isNaN(d)?'':(pad(d.getDate())+'.'+pad(d.getMonth()+1)); });
  charts.risk.data.datasets[0].data = sorted.map(t=> t.net>=0 ? (t.rr||1) : -(t.rr||1));
  charts.risk.data.datasets[0].backgroundColor = sorted.map(t=> t.net>=0?c.green:c.red);
  riskMeta = sorted.map((t,i)=>'Сделка #'+(i+1)+' · '+t.pair);
  charts.risk.update();

  renderCalendar();
  updateDbCountNote();
}

/* ================= Скриншоты ================= */
let screenshots = [];
let shotSeq = 1;
let pendingShot = null;
let viewShotId = null;
const SHOTS_ON = typeof ShotDB !== 'undefined' && ShotDB.available;

const sfPair = document.getElementById('sf-pair');
const sfTrade = document.getElementById('sf-trade');
const sfNote = document.getElementById('sf-note');
const shotDrop = document.getElementById('shotDrop');
const shotFile = document.getElementById('shotFile');
const svPair = document.getElementById('sv-pair');
const svTrade = document.getElementById('sv-trade');
const svNote = document.getElementById('sv-note');
const shotViewOverlay = document.getElementById('shotViewOverlay');
const shotViewWrap = document.getElementById('shotViewImgWrap');

const SHOT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10.5" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>';

function escHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function shortDT(s){ const d=new Date(s); if(isNaN(d)) return '—'; return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
function tradeLabel(t){ return t.pair+' · '+t.dir+' · '+shortDT(t.close||t.open)+' · '+(t.net>=0?'+':'')+'$'+t.net.toFixed(2); }
function linkedTrade(s){ return s.tradeId!=null ? (trades.find(x=>x.id==s.tradeId)||null) : null; }
function shotsForTrade(id){ return screenshots.filter(s=>s.tradeId!=null && s.tradeId==id).sort((a,b)=>a.created.localeCompare(b.created)); }
function tradeDetailOpen(){ return overlay.classList.contains('show') && detailWrap.style.display!=='none' && !!editingTradeId; }
function shotFlagHtml(tradeId){
  const n = shotsForTrade(tradeId).length;
  return n ? `<span class="shot-flag" title="Скриншотов: ${n}">${SHOT_ICON}${n}</span>` : '';
}

/* ---- обработка картинки: сжатие + миниатюра ---- */
function loadImage(blob){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
function canvasToBlob(canvas, type, q){ return new Promise(res=>canvas.toBlob(res, type, q)); }
async function scaleImage(img, maxSide, quality){
  const k = Math.min(1, maxSide/Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth*k));
  const h = Math.max(1, Math.round(img.naturalHeight*k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
  ctx.drawImage(img, 0, 0, w, h);
  let blob = await canvasToBlob(c, 'image/webp', quality);
  if(!blob || blob.type!=='image/webp') blob = await canvasToBlob(c, 'image/jpeg', quality);
  return {blob, w, h};
}
async function processImageFile(file){
  const img = await loadImage(file);
  const full = await scaleImage(img, 2200, .9);
  const thumb = await scaleImage(img, 520, .8);
  return {blob:full.blob, thumb:thumb.blob, w:full.w, h:full.h};
}

/* ---- хранение ---- */
function hydrateShot(rec){
  return Object.assign({}, rec, {url:URL.createObjectURL(rec.blob), turl:URL.createObjectURL(rec.thumb||rec.blob)});
}
async function persistShot(s){
  const {url, turl, ...rec} = s;
  await ShotDB.put(rec);
}
async function addShot(data){
  const rec = {id:shotSeq++, pair:data.pair, tradeId:data.tradeId||null, note:data.note||'', created:new Date().toISOString(), blob:data.blob, thumb:data.thumb, w:data.w, h:data.h};
  await ShotDB.put(rec);
  screenshots.push(hydrateShot(rec));
  return rec;
}
async function loadShots(){
  if(!SHOTS_ON) return;
  try{
    const all = await ShotDB.getAll();
    screenshots = (all||[]).map(hydrateShot);
    shotSeq = screenshots.reduce((m,s)=>Math.max(m,s.id),0)+1;
  }catch(e){ console.warn('screenshots load failed', e); }
}
function unlinkShotsFromTrade(id){
  screenshots.filter(s=>s.tradeId!=null && s.tradeId==id).forEach(s=>{
    s.tradeId = null;
    persistShot(s).catch(e=>console.warn('unlink failed', e));
  });
  renderShots();
}

/* ---- выбор сделки ---- */
function fillTradeSelect(sel, pair, current){
  const list = [...trades].sort((a,b)=> new Date(b.close||b.open) - new Date(a.close||a.open));
  const p = (pair||'').trim().toUpperCase();
  const mine = p ? list.filter(t=>t.pair===p) : [];
  const rest = p ? list.filter(t=>t.pair!==p) : list;
  const opt = t=>`<option value="${t.id}">${escHtml(tradeLabel(t))}</option>`;
  let html = '<option value="">Без привязки</option>';
  if(mine.length) html += `<optgroup label="Сделки по ${escHtml(p)}">${mine.map(opt).join('')}</optgroup>`;
  if(rest.length) html += `<optgroup label="${mine.length?'Остальные сделки':'Все сделки'}">${rest.map(opt).join('')}</optgroup>`;
  sel.innerHTML = html;
  sel.value = current ? String(current) : '';
}
function wirePairTrade(pairEl, tradeEl){
  const onPair = ()=>{
    const p = pairEl.value.trim().toUpperCase();
    let cur = tradeEl.value;
    if(cur){ const t = trades.find(x=>x.id==cur); if(!t || t.pair!==p) cur = ''; }
    fillTradeSelect(tradeEl, p, cur);
  };
  pairEl.addEventListener('input', onPair);
  pairEl.addEventListener('change', onPair);
  tradeEl.addEventListener('change', ()=>{
    const t = trades.find(x=>x.id==tradeEl.value);
    if(t){ pairEl.value = t.pair; fillTradeSelect(tradeEl, t.pair, t.id); }
  });
}
attachPairAutocomplete(sfPair);
attachPairAutocomplete(svPair);
wirePairTrade(sfPair, sfTrade);
wirePairTrade(svPair, svTrade);

/* ---- добавление: вставка / файл / перетаскивание ---- */
function renderPending(){
  const has = !!pendingShot;
  const img = document.getElementById('shotPreview');
  if(has) img.src = pendingShot.url; else img.removeAttribute('src');
  img.style.display = has ? 'block' : 'none';
  document.getElementById('shotDropEmpty').style.display = has ? 'none' : 'flex';
  document.getElementById('shotClear').style.display = has ? 'flex' : 'none';
  shotDrop.classList.toggle('has', has);
}
function clearPending(){
  if(pendingShot){ URL.revokeObjectURL(pendingShot.url); pendingShot = null; }
  renderPending();
}
async function setPendingFromFile(file){
  if(!file || !file.type || !file.type.startsWith('image/')){ showToast('Нужен файл-изображение'); return; }
  try{
    const p = await processImageFile(file);
    clearPending();
    pendingShot = Object.assign({}, p, {url:URL.createObjectURL(p.blob)});
    renderPending();
    if(!sfPair.value.trim()) sfPair.focus();
  }catch(e){ console.warn(e); showToast('Не удалось прочитать изображение'); }
}
document.getElementById('shotPickBtn').addEventListener('click', ()=> shotFile.click());
shotFile.addEventListener('change', ()=>{ const f = shotFile.files[0]; shotFile.value=''; if(f) setPendingFromFile(f); });
document.getElementById('shotClear').addEventListener('click', clearPending);
['dragenter','dragover'].forEach(ev=>shotDrop.addEventListener(ev, e=>{ e.preventDefault(); shotDrop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev=>shotDrop.addEventListener(ev, e=>{ e.preventDefault(); shotDrop.classList.remove('drag'); }));
shotDrop.addEventListener('drop', e=>{ const f = e.dataTransfer && e.dataTransfer.files[0]; if(f) setPendingFromFile(f); });

document.addEventListener('paste', async e=>{
  const items = e.clipboardData && e.clipboardData.items;
  if(!items) return;
  let file = null;
  for(const it of items){ if(it.kind==='file' && it.type.startsWith('image/')){ file = it.getAsFile(); break; } }
  if(!file) return;
  if(shotViewOverlay.classList.contains('show')) return;
  const openModal = document.querySelector('.modal-overlay.show');
  if(openModal){
    if(tradeDetailOpen()){ e.preventDefault(); attachFileToTrade(file, editingTradeId); }
    return;
  }
  if(document.getElementById('view-screenshots').classList.contains('active')){
    e.preventDefault();
    await setPendingFromFile(file);
    if(pendingShot) showToast('Скриншот вставлен');
  }
});

async function attachFileToTrade(file, tradeId){
  const t = trades.find(x=>x.id==tradeId); if(!t) return;
  if(!SHOTS_ON){ showToast('Хранилище скриншотов недоступно в этом браузере'); return; }
  try{
    const p = await processImageFile(file);
    await addShot(Object.assign({}, p, {pair:t.pair, tradeId:t.id, note:''}));
    renderShots(); renderJournal();
    if(tradeDetailOpen() && editingTradeId==tradeId) renderTradeShots(tradeId);
    showToast('Скриншот прикреплён к сделке');
  }catch(e){ console.warn(e); showToast('Не удалось сохранить скриншот'); }
}

document.getElementById('shotSaveBtn').addEventListener('click', async ()=>{
  if(!SHOTS_ON){ showToast('Хранилище скриншотов недоступно в этом браузере'); return; }
  if(!pendingShot){ showToast('Сначала вставьте скриншот'); return; }
  const pair = sfPair.value.trim().toUpperCase();
  if(!pair){ sfPair.focus(); showToast('Укажите торговую пару'); return; }
  const tradeId = sfTrade.value ? Number(sfTrade.value) : null;
  try{
    await addShot({blob:pendingShot.blob, thumb:pendingShot.thumb, w:pendingShot.w, h:pendingShot.h, pair, tradeId, note:sfNote.value.trim()});
  }catch(e){ console.warn(e); showToast('Не удалось сохранить скриншот'); return; }
  clearPending();
  sfPair.value = ''; sfNote.value = '';
  fillTradeSelect(sfTrade, '', '');
  renderShots(); renderJournal();
  showToast('Скриншот сохранён');
});

/* ---- галерея ---- */
function renderShots(){
  const grid = document.getElementById('shotGrid');
  const empty = document.getElementById('shotEmpty');
  const pairSel = document.getElementById('shotFilterPair');
  const linkSel = document.getElementById('shotFilterLink');
  const pairs = [...new Set(screenshots.map(s=>s.pair))].sort();
  const curPair = pairSel.value;
  pairSel.innerHTML = '<option value="">Все пары</option>'+pairs.map(p=>`<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');
  pairSel.value = pairs.includes(curPair) ? curPair : '';

  const list = screenshots
    .filter(s=> (!pairSel.value || s.pair===pairSel.value) && (linkSel.value==='all' || (linkSel.value==='linked')===!!linkedTrade(s)))
    .sort((a,b)=> b.created.localeCompare(a.created));

  document.getElementById('shotCount').textContent = list.length+' '+(list.length===1?'скриншот':'скриншотов');
  grid.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';
  empty.textContent = screenshots.length ? 'По выбранным фильтрам ничего нет.' : 'Скриншотов пока нет — вставьте первый через Ctrl+V.';

  list.forEach((s,i)=>{
    const t = linkedTrade(s);
    const card = document.createElement('div');
    card.className = 'shot-card';
    card.style.animationDelay = Math.min(i,12)*30+'ms';
    card.innerHTML = `
      <div class="shot-thumb"><img src="${s.turl}" alt="${escHtml(s.pair)}" loading="lazy"></div>
      <div class="shot-meta">
        <div class="shot-meta-row"><span class="badge pair">${escHtml(s.pair)}</span><span class="shot-date">${shortDT(s.created)}</span></div>
        <div class="shot-link ${t?'linked':''}">${t ? `Сделка · <span style="color:${t.net>=0?'var(--green)':'var(--red)'}">${t.net>=0?'+':''}$${t.net.toFixed(2)}</span>` : 'Без привязки к сделке'}</div>
        ${s.note ? `<div class="shot-note">${escHtml(s.note)}</div>` : ''}
      </div>`;
    card.addEventListener('click', ()=> openShotViewer(s.id));
    grid.appendChild(card);
  });
}
document.getElementById('shotFilterPair').addEventListener('change', renderShots);
document.getElementById('shotFilterLink').addEventListener('change', renderShots);

function onShotsViewOpen(){
  fillTradeSelect(sfTrade, sfPair.value, sfTrade.value);
  renderShots();
  if(!SHOTS_ON) showToast('Хранилище скриншотов недоступно в этом браузере');
}

/* ---- просмотр / редактирование ---- */
function openShotViewer(id){
  const s = screenshots.find(x=>x.id==id); if(!s) return;
  viewShotId = s.id;
  document.getElementById('shotViewTitle').textContent = s.pair;
  document.getElementById('shotViewImg').src = s.url;
  shotViewWrap.classList.remove('zoom');
  document.getElementById('shotViewMeta').textContent = shortDT(s.created)+' · '+s.w+'×'+s.h+' px';
  svPair.value = s.pair;
  fillTradeSelect(svTrade, s.pair, s.tradeId);
  svNote.value = s.note || '';
  const t = linkedTrade(s);
  const alreadyThere = t && tradeDetailOpen() && editingTradeId==t.id;
  document.getElementById('shotViewOpenTrade').style.display = (t && !alreadyThere) ? 'inline-block' : 'none';
  shotViewOverlay.classList.add('show');
}
function closeShotViewer(){ shotViewOverlay.classList.remove('show'); viewShotId = null; }
function afterShotChange(){
  renderShots(); renderJournal();
  if(tradeDetailOpen()) renderTradeShots(editingTradeId);
}
shotViewWrap.addEventListener('click', ()=> shotViewWrap.classList.toggle('zoom'));
document.getElementById('shotViewClose').addEventListener('click', closeShotViewer);
shotViewOverlay.addEventListener('click', e=>{ if(e.target===shotViewOverlay) closeShotViewer(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && shotViewOverlay.classList.contains('show')) closeShotViewer(); });

document.getElementById('shotViewSave').addEventListener('click', async ()=>{
  const s = screenshots.find(x=>x.id==viewShotId); if(!s) return;
  const pair = svPair.value.trim().toUpperCase();
  if(!pair){ svPair.focus(); showToast('Укажите торговую пару'); return; }
  s.pair = pair;
  s.tradeId = svTrade.value ? Number(svTrade.value) : null;
  s.note = svNote.value.trim();
  try{ await persistShot(s); }catch(e){ console.warn(e); showToast('Не удалось сохранить изменения'); return; }
  closeShotViewer(); afterShotChange();
  showToast('Изменения сохранены');
});
document.getElementById('shotViewDelete').addEventListener('click', async ()=>{
  const s = screenshots.find(x=>x.id==viewShotId); if(!s) return;
  if(!confirm('Удалить скриншот?')) return;
  try{ await ShotDB.delete(s.id); }catch(e){ console.warn(e); showToast('Не удалось удалить скриншот'); return; }
  URL.revokeObjectURL(s.url); URL.revokeObjectURL(s.turl);
  screenshots = screenshots.filter(x=>x.id!==s.id);
  closeShotViewer(); afterShotChange();
  showToast('Скриншот удалён');
});
document.getElementById('shotViewOpenTrade').addEventListener('click', ()=>{
  const s = screenshots.find(x=>x.id==viewShotId); if(!s || s.tradeId==null) return;
  const tid = s.tradeId;
  closeShotViewer();
  openViewModal(tid);
});

/* ---- скриншоты внутри окна сделки ---- */
function renderTradeShots(tradeId){
  const wrap = document.getElementById('detailShots');
  const list = shotsForTrade(tradeId);
  wrap.innerHTML = list.length
    ? list.map(s=>`<button class="shot-mini" type="button" data-shot="${s.id}" title="${escHtml(s.note||s.pair)}"><img src="${s.turl}" alt="${escHtml(s.pair)}"></button>`).join('')
    : '<div class="detail-shots-empty">Скриншотов пока нет.</div>';
  wrap.querySelectorAll('[data-shot]').forEach(b=>b.addEventListener('click', ()=> openShotViewer(b.dataset.shot)));
}
document.getElementById('detailAddShot').addEventListener('click', ()=>{
  const t = trades.find(x=>x.id==editingTradeId); if(!t) return;
  closeModal();
  gotoView('screenshots');
  sfPair.value = t.pair;
  fillTradeSelect(sfTrade, t.pair, t.id);
});

function setTheme(name, silent){
  document.body.setAttribute('data-theme', name);
  buildCharts();
  setTimeout(()=>recalcAll(),20);
  if(!silent) saveState();
}
const themeToggleBtn = document.getElementById('themeToggle');
if(themeToggleBtn) themeToggleBtn.addEventListener('click',()=>{
  const cur = document.body.dataset.theme;
  setTheme(cur==='terminal' ? 'ledger' : 'terminal');
});

(async function init(){
  await loadState();
  await loadShots();
  refreshAccountSelect(); renderAccounts();
  buildCharts();
  renderJournal();
  recalcAll();
  updateDbCountNote();
  gotoView('home');
  if(STORAGE_ON && (trades.length || accounts.length)) showToast('Данные восстановлены');
})();
