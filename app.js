let trades = [];
let accounts = [];
let tradeSeq = 1, acctSeq = 1;
let editingTradeId = null;
let currentView = 'home';
const STORAGE_ON = typeof TradeDB !== 'undefined';

function pad(n){return n.toString().padStart(2,'0');}
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>el.classList.remove('show'), 1700);
}
function parseNum(str){
  if(str===null || str===undefined) return NaN;
  const s = String(str).trim().replace(',', '.');
  if(s==='') return NaN;
  return parseFloat(s);
}
function sessName(s){ return t('sess.'+s); }
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
    await TradeDB.set('settings', JSON.stringify({theme: document.body.dataset.theme, lang: currentLang, tradeSeq, acctSeq}));
  }catch(e){ console.warn('save failed', e); }
}
async function loadState(){
  if(!STORAGE_ON) return;
  try{
    const tr = await TradeDB.get('trades').catch(()=>null);
    if(tr && tr.value) trades = JSON.parse(tr.value);
    const a = await TradeDB.get('accounts').catch(()=>null);
    if(a && a.value) accounts = JSON.parse(a.value);
    const s = await TradeDB.get('settings').catch(()=>null);
    if(s && s.value){
      const parsed = JSON.parse(s.value);
      tradeSeq = parsed.tradeSeq || (trades.reduce((m,x)=>Math.max(m,x.id||0),0)+1);
      acctSeq = parsed.acctSeq || (accounts.reduce((m,x)=>Math.max(m,x.id||0),0)+1);
      if(parsed.lang && I18N[parsed.lang]) currentLang = parsed.lang;
      if(parsed.theme) document.body.setAttribute('data-theme', parsed.theme);
    }
  }catch(e){ console.warn('load failed', e); }
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
  const greet = h<6?t('greet.night'):(h<12?t('greet.morning'):(h<18?t('greet.day'):t('greet.evening')));
  document.getElementById('homeGreeting').textContent = greet;
  document.getElementById('homeDate').textContent = now.toLocaleDateString(locale(),{weekday:'long', year:'numeric', month:'long', day:'numeric'}).toUpperCase();
  document.getElementById('homeClock').textContent = pad(now.getHours())+' : '+pad(now.getMinutes())+' : '+pad(now.getSeconds());
  document.getElementById('dateStr').textContent = now.toLocaleDateString(locale(),{day:'2-digit',month:'long',year:'numeric'});
  document.getElementById('clockStr').textContent = pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
}

const tickerData = [
  {n:'EUR/USD', v:'1.06432', d:'-0.12%', up:false},
  {n:'GBP/USD', v:'1.2678', d:'+0.08%', up:true},
  {n:'Bitcoin', v:'26,611', d:'+0.11%', up:true},
  {n:'Ethereum', v:'1,594.9', d:'+0.05%', up:true},
  {n:'S&P 500', v:'4,320.6', d:'-0.13%', up:false},
  {n:'US 100', v:'14,707.8', d:'+0.18%', up:true},
  {n:'XAU/USD', v:'2,341.2', d:'+0.22%', up:true},
];
document.getElementById('homeTicker').innerHTML = [...tickerData,...tickerData].map(x=>
  `<div class="tk">${x.n} <b>${x.v}</b> <span class="${x.up?'up':'down'}">${x.d}</span></div>`).join('');

function updateTitles(){
  if(currentView==='home') return;
  const title = t('view.'+currentView);
  document.getElementById('pagetitle').textContent = title;
  document.getElementById('crumbs').textContent = 'Trading Journal / '+title;
}
function gotoView(name){
  currentView = name;
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
  updateTitles();
  setTimeout(()=>{
    Object.values(charts).forEach(c=>c&&c.resize());
    if(name==='forecast') renderForecast();
  },10);
}
document.querySelectorAll('[data-goto]').forEach(el=>el.addEventListener('click',()=>gotoView(el.dataset.goto)));
document.querySelectorAll('.nav-item[data-view]').forEach(el=>el.addEventListener('click',()=>gotoView(el.dataset.view)));

Chart.defaults.font.family = "'JetBrains Mono', monospace";
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
    amber: cs.getPropertyValue('--amber').trim(),
    soft: cs.getPropertyValue('--text-soft').trim(),
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
    const k = Math.min(1, (now-start)/duration);
    const eased = 1-Math.pow(1-k,3);
    drawGaugeArc(fromVal + (toVal-fromVal)*eased, gMin, gMax);
    if(k<1) gaugeRAF = requestAnimationFrame(step);
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
  Object.keys(charts).forEach(k=>{ if(charts[k]) charts[k].destroy(); delete charts[k]; });

  charts.radar = new Chart(document.getElementById('radarChart'),{
    type:'radar',
    data:{labels:[t('radar.winrate'),t('radar.recovery'),t('radar.pf'),t('radar.consistency')],
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
  buildForecastCharts(c);
}

function refreshAccountSelect(){
  const sel = document.getElementById('f-acc');
  const cur = sel.value;
  sel.innerHTML = accounts.length ? accounts.map(a=>`<option>${escHtml(a.name)}</option>`).join('') : `<option value="">${escHtml(t('acc.none'))}</option>`;
  if(cur && accounts.some(a=>a.name===cur)) sel.value = cur;
  fillForecastAccounts();
}
document.getElementById('addAcctBtn').addEventListener('click',()=>{
  const name = document.getElementById('af-name').value.trim();
  if(!name){ document.getElementById('af-name').focus(); showToast(t('toast.acctName')); return; }
  const type = document.getElementById('af-type').value;
  const init = parseNum(document.getElementById('af-init').value)||0;
  const goal = parseNum(document.getElementById('af-goal').value)||0;
  accounts.push({id:acctSeq++, name, type, init, goal});
  document.getElementById('af-name').value=''; document.getElementById('af-init').value=''; document.getElementById('af-goal').value='';
  renderAccounts(); refreshAccountSelect(); recalcAll(); saveState();
  showToast(t('toast.acctAdded'));
});
function renderAccounts(){
  const grid = document.getElementById('acctGrid');
  const empty = document.getElementById('acctEmpty');
  grid.innerHTML=''; empty.style.display = accounts.length ? 'none':'block';
  accounts.forEach((a,i)=>{
    const accTrades = trades.filter(x=>x.acc===a.name);
    const net = accTrades.reduce((s,x)=>s+x.net,0);
    const bal = a.init + net;
    const won = accTrades.filter(x=>x.net>0).length;
    const total = accTrades.length;
    const wr = total ? Math.round(won/total*100) : 0;
    const pct = a.goal>0 ? Math.min(100, Math.max(0,(bal/a.goal)*100)) : 0;
    const card = document.createElement('div');
    card.className='acct-card';
    card.style.animationDelay = (i*40)+'ms';
    card.innerHTML = `
      <div class="acct-top"><div class="acct-name">${escHtml(a.name)}</div><div class="acct-type">${escHtml(a.type)}</div></div>
      <div class="acct-bal ${net<0?'neg':''}">$${bal.toFixed(2)}</div>
      <div class="acct-label">${escHtml(t('acc.balance'))}</div>
      <div class="acct-row"><span>Win rate</span><span>${total? wr+'%':'—'}</span></div>
      <div class="acct-row"><span>${escHtml(t('acc.goalRow'))}</span><span>$${bal.toFixed(0)} / ${a.goal?'$'+a.goal.toFixed(0):'—'}</span></div>
      <div class="bar-track"><div class="bar-fill" data-pct="${pct}" style="width:0"></div></div>
      <div style="text-align:right;margin-top:10px;"><button class="del-btn" data-del-acct="${a.id}">${escHtml(t('acc.del'))}</button></div>`;
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
  const accTrades = trades.filter(x=>x.acc===a.name).sort((x,y)=> new Date(y.close||y.open) - new Date(x.close||x.open));
  const net = accTrades.reduce((s,x)=>s+x.net,0);
  const bal = a.init + net;
  const balEl = document.getElementById('acctModalBalance');
  balEl.textContent = '$'+bal.toFixed(2);
  balEl.className = 'dsr-pnl'+(accTrades.length?(net>=0?' pos':' neg'):'');
  document.getElementById('acctModalCount').textContent = tp('cal.trades', accTrades.length);
  const list = document.getElementById('acctTradeList');
  const empty = document.getElementById('acctModalEmpty');
  list.innerHTML=''; empty.style.display = accTrades.length ? 'none':'block';
  accTrades.forEach((x,i)=>{
    const row = document.createElement('div');
    row.className='day-trade-row';
    row.style.animationDelay = (i*35)+'ms';
    row.innerHTML = `
      <div class="dtr-left">
        <span class="badge pair">${escHtml(x.pair)}</span>
        <span class="badge ${x.dir.toLowerCase()}">${x.dir}</span>
        <span>${fmtDT(x.close)}</span>
      </div>
      <div class="dtr-pnl" style="color:${x.net>=0?'var(--green)':'var(--red)'}">${x.net>=0?'+':''}$${x.net.toFixed(2)}</div>`;
    row.addEventListener('click', ()=>{ closeAccountModal(); openViewModal(x.id); });
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
  if(!confirm(t('acc.confirmDel'))) return;
  accounts = accounts.filter(a=>a.id != acctModalId);
  closeAccountModal();
  renderAccounts(); refreshAccountSelect(); recalcAll(); saveState();
  showToast(t('toast.acctDeleted'));
});

const overlay = document.getElementById('tradeModalOverlay');
const formWrap = document.getElementById('tradeFormWrap');
const detailWrap = document.getElementById('tradeDetailWrap');

function restrictNumericInput(id, allowNegative){
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', ()=>{
    const v = el.value;
    const neg = allowNegative && v.charAt(0)==='-';
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
  const tpv = parseNum(document.getElementById('f-tp').value);
  const grossVal = parseNum(document.getElementById('f-gross').value);
  const hint = document.getElementById('rrAutoHint');
  if(isNaN(entry) || isNaN(sl) || isNaN(tpv) || entry===sl){ if(hint) hint.textContent=' '; return; }
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tpv - entry);
  const rr = risk>0 ? (reward/risk) : 0;
  if(!rr){ if(hint) hint.textContent=' '; return; }
  const signedRR = (!isNaN(grossVal) && grossVal<0) ? -rr : rr;
  if(hint) hint.innerHTML = `${escHtml(t('t.rrByPrice'))} <span class="rr-auto-tag">${signedRR.toFixed(2)}</span> · <span style="text-decoration:underline;cursor:pointer;" id="rrUseSuggested">${escHtml(t('t.rrApply'))}</span>`;
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

function calcDelta(x){
  const entry = parseFloat(x.entry), exit = parseFloat(x.exit);
  if(isNaN(entry) || isNaN(exit) || entry===0) return null;
  const delta = exit-entry;
  const pct = (delta/Math.abs(entry))*100;
  return {delta, pct};
}

function showForm(){
  formWrap.style.display='block'; detailWrap.style.display='none';
  document.getElementById('tradeModalEdit').style.display='none';
  document.getElementById('tradeModalSave').style.display='inline-block';
}
function openAddModal(){
  editingTradeId = null;
  document.getElementById('tradeModalTitle').textContent = t('t.new');
  showForm();
  ['f-open','f-close','f-pair','f-entry','f-exit','f-sl','f-tp','f-gross','f-comm','f-risk','f-rr','f-setup','f-note'].forEach(id=>document.getElementById(id).value='');
  refreshAccountSelect();
  const hint = document.getElementById('rrAutoHint'); if(hint) hint.innerHTML='&nbsp;';
  overlay.classList.add('show');
}
function openEditModal(id){
  const x = trades.find(y=>y.id==id); if(!x) return;
  editingTradeId = id;
  document.getElementById('tradeModalTitle').textContent = t('t.edit');
  showForm();
  document.getElementById('f-open').value = x.open||'';
  document.getElementById('f-close').value = x.close||'';
  document.getElementById('f-pair').value = x.pair;
  refreshAccountSelect();
  document.getElementById('f-acc').value = x.acc||'';
  document.getElementById('f-entry').value = x.entry ?? '';
  document.getElementById('f-exit').value = x.exit ?? '';
  document.getElementById('f-sl').value = x.sl ?? '';
  document.getElementById('f-tp').value = x.tp ?? '';
  document.getElementById('f-gross').value = x.gross;
  document.getElementById('f-comm').value = x.comm;
  document.getElementById('f-risk').value = x.lot||'';
  document.getElementById('f-rr').value = x.rr||'';
  document.getElementById('f-setup').value = x.setup||'';
  document.getElementById('f-note').value = x.note||'';
  const hint = document.getElementById('rrAutoHint'); if(hint) hint.innerHTML='&nbsp;';
  suggestRR();
  overlay.classList.add('show');
}
function detailItem(label, value, style, span){
  return `<div class="detail-item"${span?' style="grid-column:span 2;"':''}><div class="dk">${escHtml(label)}</div><div class="dv"${style?` style="${style}"`:''}>${value}</div></div>`;
}
function openViewModal(id){
  const x = trades.find(y=>y.id==id); if(!x) return;
  editingTradeId = id;
  document.getElementById('tradeModalTitle').textContent = x.pair+' · '+x.dir;
  formWrap.style.display='none'; detailWrap.style.display='block';
  document.getElementById('tradeModalEdit').style.display='inline-block'; document.getElementById('tradeModalSave').style.display='none';
  const d = calcDelta(x);
  const col = v=> 'color:'+(v>=0?'var(--green)':'var(--red)');
  document.getElementById('detailGrid').innerHTML = [
    detailItem(t('t.open'), fmtDT(x.open)),
    detailItem(t('t.close'), fmtDT(x.close)),
    detailItem(t('t.account'), escHtml(x.acc||'—')),
    detailItem(t('d.session'), escHtml(sessName(x.sess))),
    detailItem(t('d.entry'), x.entry ?? '—'),
    detailItem(t('d.exit'), x.exit ?? '—'),
    detailItem('S/L', x.sl ?? '—'),
    detailItem('T/P', x.tp ?? '—'),
    detailItem('Gross P&L', (x.gross>=0?'+':'')+'$'+x.gross.toFixed(2), col(x.gross)),
    detailItem('Net P&L', (x.net>=0?'+':'')+'$'+x.net.toFixed(2), col(x.net)),
    detailItem(t('d.comm'), (x.comm>=0?'+':'')+'$'+x.comm.toFixed(2)),
    detailItem(t('d.lot'), escHtml(x.lot||'—')),
    detailItem('RR', x.rr||'—'),
    detailItem(t('d.move'), d ? (d.delta>=0?'+':'')+d.delta.toFixed(5)+' ('+(d.pct>=0?'+':'')+d.pct.toFixed(2)+'%)' : '—'),
    detailItem(t('d.setup'), escHtml(x.setup||'—'), null, true)
  ].join('');
  document.getElementById('detailNote').textContent = x.note ? x.note : t('d.noNotes');
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
  const val = id=>document.getElementById(id).value;
  const numOrNull = raw=> raw==='' ? null : parseNum(raw);
  const open = val('f-open');
  const close = val('f-close');
  const pair = val('f-pair').trim().toUpperCase();
  const acc = val('f-acc');
  const entry = numOrNull(val('f-entry'));
  const exit = numOrNull(val('f-exit'));
  const sl = numOrNull(val('f-sl'));
  const tpv = numOrNull(val('f-tp'));
  const gross = parseNum(val('f-gross'));
  const comm = parseNum(val('f-comm'))||0;
  const lot = val('f-risk').trim().replace(',', '.');
  const rr = parseNum(val('f-rr'))||0;
  const setup = val('f-setup').trim();
  const note = val('f-note').trim();
  if(!pair || isNaN(gross) || !close){ showToast(t('toast.fillTrade')); return; }
  const net = gross + comm;
  const dir = computeDir(entry, exit, net);
  const sess = computeSession(open || close);
  const rec = {open, close, pair, dir, sess, acc, entry, exit, sl, tp:tpv, gross, comm, net, lot, rr, setup, note};
  if(editingTradeId){
    Object.assign(trades.find(x=>x.id==editingTradeId), rec);
    showToast(t('toast.tradeUpdated'));
  } else {
    trades.push(Object.assign({id:tradeSeq++}, rec));
    showToast(t('toast.tradeAdded'));
  }
  closeModal();
  renderJournal(); renderAccounts(); recalcAll(); saveState();
});

function renderJournal(){
  const body = document.getElementById('journalBody');
  const empty = document.getElementById('journalEmpty');
  body.innerHTML='';
  document.getElementById('journalCount').textContent = tp('j.records', trades.length);
  empty.style.display = trades.length ? 'none':'block';
  const sorted = [...trades].sort((a,b)=> new Date(a.close||a.open) - new Date(b.close||b.open));
  sorted.forEach((x,i)=>{
    const tr = document.createElement('tr');
    tr.style.animationDelay = (i*25)+'ms';
    const notePreview = x.note ? (x.note.length>18 ? x.note.slice(0,18)+'…' : x.note) : '—';
    tr.innerHTML = `
      <td>${i+1}</td><td>${fmtDT(x.open)}</td><td>${fmtDT(x.close)}</td>
      <td><span class="badge pair">${escHtml(x.pair)}</span></td>
      <td><span class="badge ${x.dir.toLowerCase()}">${x.dir}</span></td>
      <td>${escHtml(sessName(x.sess))}</td><td>${escHtml(x.acc||'—')}</td>
      <td class="${x.gross>=0?'pnl-pos':'pnl-neg'}">${x.gross>=0?'+':''}$${x.gross.toFixed(2)}</td>
      <td>${x.comm>=0?'+':''}$${x.comm.toFixed(2)}</td>
      <td class="${x.net>=0?'pnl-pos':'pnl-neg'}">${x.net>=0?'+':''}$${x.net.toFixed(2)}</td>
      <td>${escHtml(x.lot||'—')}</td><td>${x.rr||'—'}</td>
      <td>${x.setup?'<span class="badge pair">'+escHtml(x.setup)+'</span>':'—'}</td>
      <td title="${escHtml(x.note||'')}">${escHtml(notePreview)}</td>
      <td>${shotFlagHtml(x.id)}<button class="del-btn" data-del-trade="${x.id}">×</button></td>`;
    tr.addEventListener('click', (e)=>{ if(e.target.closest('[data-del-trade]')) return; openViewModal(x.id); });
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-del-trade]').forEach(btn=>btn.addEventListener('click',(ev)=>{
    ev.stopPropagation();
    trades = trades.filter(x=>x.id != btn.dataset.delTrade);
    unlinkShotsFromTrade(btn.dataset.delTrade);
    renderJournal(); renderAccounts(); recalcAll(); saveState();
  }));
}
function fmtDT(s){ if(!s) return '—'; const d=new Date(s); if(isNaN(d)) return escHtml(s); return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }

let calCursor = new Date();
calCursor.setDate(1);
function weekdayNames(){
  return Array.from({length:7}, (_,i)=> new Date(2024,0,1+i).toLocaleDateString(locale(),{weekday:'short'}).replace('.',''));
}
function renderCalendar(){
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  document.getElementById('calMonthLabel').textContent = calCursor.toLocaleDateString(locale(),{month:'long', year:'numeric'});
  const dayMap = {};
  trades.forEach(x=>{
    if(!x.close) return;
    const d = new Date(x.close);
    if(d.getFullYear()===y && d.getMonth()===m){
      const day = d.getDate();
      if(!dayMap[day]) dayMap[day] = {pnl:0,count:0};
      dayMap[day].pnl += x.net; dayMap[day].count += 1;
    }
  });
  const grid = document.getElementById('calGrid'); grid.innerHTML='';
  weekdayNames().forEach(d=>{ const el=document.createElement('div'); el.className='cal-dow'; el.textContent=d; grid.appendChild(el); });
  const firstDay = new Date(y,m,1);
  const startOffset = (firstDay.getDay()+6)%7;
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
      el.innerHTML = `<div class="cal-daynum">${d}</div><div><div class="cal-pnl">${info.pnl>=0?'+':''}${info.pnl.toFixed(1)}</div><div class="cal-trades">${escHtml(tp('cal.trades', info.count))}</div></div>`;
    } else { el.innerHTML = `<div class="cal-daynum">${d}</div>`; }
    el.addEventListener('click', ()=> openDayModal(y, m, d));
    grid.appendChild(el);
  }
  const pnlHtml = `<span style="color:${total>=0?'var(--green)':'var(--red)'}">${total>=0?'+':''}$${total.toFixed(2)}</span>`;
  document.getElementById('calSummary').innerHTML = escHtml(t('cal.summary')).replace('{pnl}', pnlHtml).replace('{n}', tc);
}
document.getElementById('calPrev').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()-1); renderCalendar();});
document.getElementById('calNext').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()+1); renderCalendar();});

const dayOverlay = document.getElementById('dayModalOverlay');
let dayModalDate = null;
function openDayModal(y, m, d){
  dayModalDate = new Date(y, m, d);
  document.getElementById('dayModalTitle').textContent = dayModalDate.toLocaleDateString(locale(),{day:'numeric', month:'long', year:'numeric'});
  const dayTrades = trades.filter(x=>{
    if(!x.close) return false;
    const dt = new Date(x.close);
    return dt.getFullYear()===y && dt.getMonth()===m && dt.getDate()===d;
  }).sort((a,b)=> new Date(a.close) - new Date(b.close));

  const pnl = dayTrades.reduce((s,x)=>s+x.net,0);
  const pnlEl = document.getElementById('dayModalPnl');
  pnlEl.textContent = (pnl>=0?'+':'')+'$'+pnl.toFixed(2);
  pnlEl.className = 'dsr-pnl'+(dayTrades.length?(pnl>=0?' pos':' neg'):'');
  document.getElementById('dayModalCount').textContent = tp('cal.trades', dayTrades.length);

  const list = document.getElementById('dayTradeList');
  const empty = document.getElementById('dayModalEmpty');
  list.innerHTML = '';
  empty.style.display = dayTrades.length ? 'none' : 'block';
  dayTrades.forEach((x,i)=>{
    const row = document.createElement('div');
    row.className = 'day-trade-row';
    row.style.animationDelay = (i*35)+'ms';
    row.innerHTML = `
      <div class="dtr-left">
        <span class="badge pair">${escHtml(x.pair)}</span>
        <span class="badge ${x.dir.toLowerCase()}">${x.dir}</span>
        <span>${fmtDT(x.close).split(' ')[1]||''}</span>
      </div>
      <div class="dtr-pnl" style="color:${x.net>=0?'var(--green)':'var(--red)'}">${x.net>=0?'+':''}$${x.net.toFixed(2)}</div>`;
    row.addEventListener('click', ()=>{ closeDayModal(); openViewModal(x.id); });
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
  const wins = trades.filter(x=>x.net>0), losses = trades.filter(x=>x.net<0);
  const winRate = n ? (wins.length/n*100) : 0;
  const totalPnL = trades.reduce((s,x)=>s+x.net,0);
  const grossProfit = wins.reduce((s,x)=>s+x.net,0);
  const grossLoss = Math.abs(losses.reduce((s,x)=>s+x.net,0));
  const profitFactor = grossLoss>0 ? grossProfit/grossLoss : (grossProfit>0?99:0);
  const totalInit = accounts.reduce((s,a)=>s+a.init,0);
  const returns = totalInit>0 ? (totalPnL/totalInit*100) : 0;

  const sorted = [...trades].sort((a,b)=> new Date(a.close||a.open) - new Date(b.close||b.open));
  let running = totalInit, peak = totalInit, maxDD = 0;
  const curve=[totalInit], labels=[''];
  growthMeta = [t('eq.start', {v:'$'+totalInit.toFixed(2)})];
  sorted.forEach((x,i)=>{
    running+=x.net; curve.push(running);
    const d = new Date(x.close||x.open);
    labels.push(isNaN(d)?'':(pad(d.getDate())+'.'+pad(d.getMonth()+1)));
    growthMeta.push(t('eq.trade', {n:i+1, p:x.pair}));
    if(running>peak) peak=running; const dd=peak-running; if(dd>maxDD) maxDD=dd;
  });
  const recoveryFactor = maxDD>0 ? totalPnL/maxDD : (totalPnL>0?10:0);
  const consistency = n<2 ? 0 : Math.max(0, 100 - (stdDev(sorted.map(x=>x.net)) / ((Math.abs(totalPnL)/n)||1) * 40));

  const wrTxt = n ? winRate.toFixed(1)+'%' : '—';
  const pnlTxt = n ? (totalPnL>=0?'+':'')+'$'+totalPnL.toFixed(2) : '—';
  const retTxt = totalInit>0 ? returns.toFixed(1)+'%' : '—';
  const pfTxt = n ? profitFactor.toFixed(2) : '—';
  const consTxt = n>=2 ? consistency.toFixed(0)+'%' : '—';

  animateValue(document.getElementById('a-winrate'), wrTxt, n>0);
  const pnlEl = document.getElementById('a-pnl');
  animateValue(pnlEl, pnlTxt, n>0); pnlEl.className = 'stat-value'+(n?(totalPnL>=0?' pos':' neg'):'');
  animateValue(document.getElementById('a-returns'), retTxt, totalInit>0);
  animateValue(document.getElementById('a-pf'), pfTxt, n>0);
  animateValue(document.getElementById('a-cons'), consTxt, n>=2);
  document.getElementById('a-winrate-ring').style.setProperty('--pct', n ? winRate.toFixed(1) : 0);

  document.getElementById('w-balance').textContent = '$'+(totalInit+totalPnL).toFixed(2);
  const wPnl = document.getElementById('w-pnl');
  wPnl.textContent = pnlTxt; wPnl.className = 'balance-sub-value'+(n?(totalPnL>=0?' pos':' neg'):'');

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

  document.getElementById('gaugeSubtitle').textContent = usePercent ? t('w.subReturns') : t('w.subPnl');

  const gaugeValueEl = document.getElementById('gaugeValue');
  const gaugeTxt = !n ? '—' : usePercent
    ? (returns>=0?'+':'')+returns.toFixed(1)+'%'
    : (totalPnL>=0?'+':'')+'$'+totalPnL.toFixed(2);
  animateValue(gaugeValueEl, gaugeTxt, n>0);
  gaugeValueEl.className = 'gauge-value'+(n?(gaugeTargetVal>=0?' pos':' neg'):'');

  document.getElementById('winrateCenter').textContent = n ? winRate.toFixed(0)+'%' : '0%';
  const cw = chartColors();
  charts.winrate.data.datasets[0].data = n ? [wins.length, losses.length] : [1,1];
  charts.winrate.data.datasets[0].backgroundColor = n ? [cw.green, cw.red] : [cw.border, cw.border];
  charts.winrate.update();

  const longs = trades.filter(x=>x.dir==='Long').length;
  const shorts = trades.filter(x=>x.dir==='Short').length;
  const totalDir = longs+shorts;
  const longPct = totalDir ? (longs/totalDir*100) : 50;
  const shortPct = 100-longPct;
  document.getElementById('ratioLongPct').textContent = longPct.toFixed(1)+'%';
  document.getElementById('ratioShortPct').textContent = shortPct.toFixed(1)+'%';
  document.getElementById('ratioBarLong').style.width = longPct+'%';
  document.getElementById('ratioBarShort').style.width = shortPct+'%';
  document.getElementById('ratioLongCount').textContent = longs;
  document.getElementById('ratioShortCount').textContent = shorts;

  const sidebarPnl = document.getElementById('sidebarPnl');
  sidebarPnl.textContent = (totalPnL>=0?'+':'')+'$'+totalPnL.toFixed(2);
  sidebarPnl.className = 'v'+(totalPnL<0?' neg':'');

  charts.radar.data.datasets[0].data = [Math.min(100,winRate), Math.min(100,Math.max(0,recoveryFactor*20)), Math.min(100,profitFactor*20), Math.min(100,consistency)];
  charts.radar.update();

  charts.growth.data.labels = labels; charts.growth.data.datasets[0].data = curve; charts.growth.update();
  document.getElementById('growthNote').textContent = n ? `$${totalInit.toFixed(0)} → $${running.toFixed(0)}` : t('common.noData');

  const sessAgg = {}; trades.forEach(x=>{ sessAgg[x.sess]=(sessAgg[x.sess]||0)+x.net; });
  const sessKeys = Object.keys(sessAgg);
  charts.session.data.labels = sessKeys.map(sessName);
  charts.session.data.datasets[0].data = sessKeys.map(k=>sessAgg[k]);
  charts.session.data.datasets[0].backgroundColor = sessKeys.map(k=> sessAgg[k]>=0?cw.green:cw.red);
  charts.session.update();

  charts.risk.data.labels = sorted.map(x=>{ const d=new Date(x.close||x.open); return isNaN(d)?'':(pad(d.getDate())+'.'+pad(d.getMonth()+1)); });
  charts.risk.data.datasets[0].data = sorted.map(x=> x.net>=0 ? (x.rr||1) : -(x.rr||1));
  charts.risk.data.datasets[0].backgroundColor = sorted.map(x=> x.net>=0?cw.green:cw.red);
  riskMeta = sorted.map((x,i)=>t('eq.trade', {n:i+1, p:x.pair}));
  charts.risk.update();

  renderCalendar();
  if(currentView==='forecast') renderForecast();
}

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
function tradeLabel(x){ return x.pair+' · '+x.dir+' · '+shortDT(x.close||x.open)+' · '+(x.net>=0?'+':'')+'$'+x.net.toFixed(2); }
function linkedTrade(s){ return s.tradeId!=null ? (trades.find(x=>x.id==s.tradeId)||null) : null; }
function shotsForTrade(id){ return screenshots.filter(s=>s.tradeId!=null && s.tradeId==id).sort((a,b)=>a.created.localeCompare(b.created)); }
function tradeDetailOpen(){ return overlay.classList.contains('show') && detailWrap.style.display!=='none' && !!editingTradeId; }
function shotFlagHtml(tradeId){
  const n = shotsForTrade(tradeId).length;
  return n ? `<span class="shot-flag" title="${escHtml(t('s.flag',{n}))}">${SHOT_ICON}${n}</span>` : '';
}

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

function fillTradeSelect(sel, pair, current){
  const list = [...trades].sort((a,b)=> new Date(b.close||b.open) - new Date(a.close||a.open));
  const p = (pair||'').trim().toUpperCase();
  const mine = p ? list.filter(x=>x.pair===p) : [];
  const rest = p ? list.filter(x=>x.pair!==p) : list;
  const opt = x=>`<option value="${x.id}">${escHtml(tradeLabel(x))}</option>`;
  let html = `<option value="">${escHtml(t('s.noLink'))}</option>`;
  if(mine.length) html += `<optgroup label="${escHtml(t('s.tradesFor',{p}))}">${mine.map(opt).join('')}</optgroup>`;
  if(rest.length) html += `<optgroup label="${escHtml(mine.length?t('s.otherTrades'):t('s.allTrades'))}">${rest.map(opt).join('')}</optgroup>`;
  sel.innerHTML = html;
  sel.value = current ? String(current) : '';
}
function wirePairTrade(pairEl, tradeEl){
  const onPair = ()=>{
    const p = pairEl.value.trim().toUpperCase();
    let cur = tradeEl.value;
    if(cur){ const x = trades.find(y=>y.id==cur); if(!x || x.pair!==p) cur = ''; }
    fillTradeSelect(tradeEl, p, cur);
  };
  pairEl.addEventListener('input', onPair);
  pairEl.addEventListener('change', onPair);
  tradeEl.addEventListener('change', ()=>{
    const x = trades.find(y=>y.id==tradeEl.value);
    if(x){ pairEl.value = x.pair; fillTradeSelect(tradeEl, x.pair, x.id); }
  });
}
attachPairAutocomplete(sfPair);
attachPairAutocomplete(svPair);
wirePairTrade(sfPair, sfTrade);
wirePairTrade(svPair, svTrade);

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
  if(!file || !file.type || !file.type.startsWith('image/')){ showToast(t('toast.needImage')); return; }
  try{
    const p = await processImageFile(file);
    clearPending();
    pendingShot = Object.assign({}, p, {url:URL.createObjectURL(p.blob)});
    renderPending();
    if(!sfPair.value.trim()) sfPair.focus();
  }catch(e){ console.warn(e); showToast(t('toast.badImage')); }
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
    if(pendingShot) showToast(t('toast.shotPasted'));
  }
});

async function attachFileToTrade(file, tradeId){
  const x = trades.find(y=>y.id==tradeId); if(!x) return;
  if(!SHOTS_ON){ showToast(t('toast.noShotStorage')); return; }
  try{
    const p = await processImageFile(file);
    await addShot(Object.assign({}, p, {pair:x.pair, tradeId:x.id, note:''}));
    renderShots(); renderJournal();
    if(tradeDetailOpen() && editingTradeId==tradeId) renderTradeShots(tradeId);
    showToast(t('toast.shotAttached'));
  }catch(e){ console.warn(e); showToast(t('toast.shotSaveFail')); }
}

document.getElementById('shotSaveBtn').addEventListener('click', async ()=>{
  if(!SHOTS_ON){ showToast(t('toast.noShotStorage')); return; }
  if(!pendingShot){ showToast(t('toast.pasteFirst')); return; }
  const pair = sfPair.value.trim().toUpperCase();
  if(!pair){ sfPair.focus(); showToast(t('toast.enterPair')); return; }
  const tradeId = sfTrade.value ? Number(sfTrade.value) : null;
  try{
    await addShot({blob:pendingShot.blob, thumb:pendingShot.thumb, w:pendingShot.w, h:pendingShot.h, pair, tradeId, note:sfNote.value.trim()});
  }catch(e){ console.warn(e); showToast(t('toast.shotSaveFail')); return; }
  clearPending();
  sfPair.value = ''; sfNote.value = '';
  fillTradeSelect(sfTrade, '', '');
  renderShots(); renderJournal();
  showToast(t('toast.shotSaved'));
});

function renderShots(){
  const grid = document.getElementById('shotGrid');
  const empty = document.getElementById('shotEmpty');
  const pairSel = document.getElementById('shotFilterPair');
  const linkSel = document.getElementById('shotFilterLink');
  const pairs = [...new Set(screenshots.map(s=>s.pair))].sort();
  const curPair = pairSel.value;
  pairSel.innerHTML = `<option value="">${escHtml(t('s.allPairs'))}</option>`+pairs.map(p=>`<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');
  pairSel.value = pairs.includes(curPair) ? curPair : '';

  const list = screenshots
    .filter(s=> (!pairSel.value || s.pair===pairSel.value) && (linkSel.value==='all' || (linkSel.value==='linked')===!!linkedTrade(s)))
    .sort((a,b)=> b.created.localeCompare(a.created));

  document.getElementById('shotCount').textContent = tp('s.count', list.length);
  grid.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';
  empty.textContent = screenshots.length ? t('s.emptyFilter') : t('s.empty');

  list.forEach((s,i)=>{
    const x = linkedTrade(s);
    const card = document.createElement('div');
    card.className = 'shot-card';
    card.style.animationDelay = Math.min(i,12)*30+'ms';
    card.innerHTML = `
      <div class="shot-thumb"><img src="${s.turl}" alt="${escHtml(s.pair)}" loading="lazy"></div>
      <div class="shot-meta">
        <div class="shot-meta-row"><span class="badge pair">${escHtml(s.pair)}</span><span class="shot-date">${shortDT(s.created)}</span></div>
        <div class="shot-link ${x?'linked':''}">${x ? `${escHtml(t('s.cardTrade'))} · <span style="color:${x.net>=0?'var(--green)':'var(--red)'}">${x.net>=0?'+':''}$${x.net.toFixed(2)}</span>` : escHtml(t('s.cardNoTrade'))}</div>
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
  if(!SHOTS_ON) showToast(t('toast.noShotStorage'));
}

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
  const x = linkedTrade(s);
  const alreadyThere = x && tradeDetailOpen() && editingTradeId==x.id;
  document.getElementById('shotViewOpenTrade').style.display = (x && !alreadyThere) ? 'inline-block' : 'none';
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
  if(!pair){ svPair.focus(); showToast(t('toast.enterPair')); return; }
  s.pair = pair;
  s.tradeId = svTrade.value ? Number(svTrade.value) : null;
  s.note = svNote.value.trim();
  try{ await persistShot(s); }catch(e){ console.warn(e); showToast(t('toast.changesFail')); return; }
  closeShotViewer(); afterShotChange();
  showToast(t('toast.changesSaved'));
});
document.getElementById('shotViewDelete').addEventListener('click', async ()=>{
  const s = screenshots.find(x=>x.id==viewShotId); if(!s) return;
  if(!confirm(t('confirm.delShot'))) return;
  try{ await ShotDB.delete(s.id); }catch(e){ console.warn(e); showToast(t('toast.shotDelFail')); return; }
  URL.revokeObjectURL(s.url); URL.revokeObjectURL(s.turl);
  screenshots = screenshots.filter(x=>x.id!==s.id);
  closeShotViewer(); afterShotChange();
  showToast(t('toast.shotDeleted'));
});
document.getElementById('shotViewOpenTrade').addEventListener('click', ()=>{
  const s = screenshots.find(x=>x.id==viewShotId); if(!s || s.tradeId==null) return;
  const tid = s.tradeId;
  closeShotViewer();
  openViewModal(tid);
});

function renderTradeShots(tradeId){
  const wrap = document.getElementById('detailShots');
  const list = shotsForTrade(tradeId);
  wrap.innerHTML = list.length
    ? list.map(s=>`<button class="shot-mini" type="button" data-shot="${s.id}" title="${escHtml(s.note||s.pair)}"><img src="${s.turl}" alt="${escHtml(s.pair)}"></button>`).join('')
    : `<div class="detail-shots-empty">${escHtml(t('s.detailEmpty'))}</div>`;
  wrap.querySelectorAll('[data-shot]').forEach(b=>b.addEventListener('click', ()=> openShotViewer(b.dataset.shot)));
}
document.getElementById('detailAddShot').addEventListener('click', ()=>{
  const x = trades.find(y=>y.id==editingTradeId); if(!x) return;
  closeModal();
  gotoView('screenshots');
  sfPair.value = x.pair;
  fillTradeSelect(sfTrade, x.pair, x.id);
});

function setTheme(name){
  document.body.setAttribute('data-theme', name);
  buildCharts();
  setTimeout(()=>recalcAll(),20);
  saveState();
}
document.getElementById('themeToggle').addEventListener('click',()=>{
  const cur = document.body.dataset.theme;
  setTheme(cur==='terminal' ? 'ledger' : 'terminal');
});

function renderAll(){
  applyI18n();
  tickClock();
  updateTitles();
  refreshAccountSelect();
  renderAccounts();
  buildCharts();
  renderJournal();
  renderShots();
  fillTradeSelect(sfTrade, sfPair.value, sfTrade.value);
  recalcAll();
}
function setLang(lang){
  if(!I18N[lang] || lang===currentLang) return;
  currentLang = lang;
  renderAll();
  if(tradeDetailOpen()) openViewModal(editingTradeId);
  saveState();
}
document.querySelectorAll('.lang-switch [data-lang]').forEach(b=>b.addEventListener('click', ()=> setLang(b.dataset.lang)));

(async function init(){
  await loadState();
  await loadShots();
  renderAll();
  setInterval(tickClock,1000);
  gotoView('home');
  if(STORAGE_ON && (trades.length || accounts.length)) showToast(t('toast.restored'));
})();
