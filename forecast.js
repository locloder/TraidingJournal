let fcSeed = 20240607;
let fcDemo = false;
let fcDemoCache = null;
const FC_MIN_TRADES = 5;

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function fcMoney(v, signed){
  const sign = v<0 ? '-' : (signed && v>0 ? '+' : '');
  return sign + '$' + Math.abs(v).toFixed(2);
}
function fcShort(v){
  const a = Math.abs(v), s = v<0 ? '-' : '';
  if(a>=1e6) return s+'$'+(a/1e6).toFixed(2)+'M';
  if(a>=1e4) return s+'$'+(a/1e3).toFixed(1)+'k';
  return s+'$'+a.toFixed(0);
}
function fcNum(v, d){ return (Math.abs(v)<1e-12 ? 0 : v).toFixed(d==null?2:d); }

function demoSample(){
  if(fcDemoCache) return fcDemoCache;
  const rnd = mulberry32(42);
  const nets = [];
  for(let i=0;i<60;i++){
    const win = rnd() < 0.52;
    nets.push(win ? +(50 + rnd()*150).toFixed(2) : -(+(45 + rnd()*110).toFixed(2)));
  }
  fcDemoCache = {nets, start:10000};
  return fcDemoCache;
}

function fcSource(){
  if(fcDemo) return demoSample();
  const accName = document.getElementById('fcAccount').value;
  const list = trades
    .filter(x=> !accName || x.acc===accName)
    .sort((a,b)=> new Date(a.close||a.open) - new Date(b.close||b.open));
  const start = accName
    ? ((accounts.find(a=>a.name===accName)||{}).init || 0)
    : accounts.reduce((s,a)=>s+a.init,0);
  return {nets:list.map(x=>x.net), start};
}

function linearRegression(ys){
  const n = ys.length;
  const xMean = (n-1)/2;
  const yMean = ys.reduce((s,v)=>s+v,0)/n;
  let sxy = 0, sxx = 0, sst = 0;
  for(let i=0;i<n;i++){
    sxy += (i-xMean)*(ys[i]-yMean);
    sxx += (i-xMean)*(i-xMean);
    sst += (ys[i]-yMean)*(ys[i]-yMean);
  }
  const b = sxx>0 ? sxy/sxx : 0;
  const a = yMean - b*xMean;
  let sse = 0;
  for(let i=0;i<n;i++){ const e = ys[i]-(a+b*i); sse += e*e; }
  const r2 = sst>0 ? 1 - sse/sst : 0;
  return {a, b, r2};
}

function quantile(sorted, q){
  const pos = (sorted.length-1)*q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi]-sorted[lo])*(pos-lo);
}

function monteCarlo(nets, start, horizon, sims, seed){
  const rnd = mulberry32(seed);
  const n = nets.length;
  const w = horizon+1;
  const paths = new Float64Array(sims*w);
  const maxDD = new Float64Array(sims);
  for(let s=0;s<sims;s++){
    let bal = start, peak = start, dd = 0;
    const off = s*w;
    paths[off] = start;
    for(let k=1;k<=horizon;k++){
      bal += nets[Math.floor(rnd()*n)];
      paths[off+k] = bal;
      if(bal>peak) peak = bal;
      if(peak-bal>dd) dd = peak-bal;
    }
    maxDD[s] = dd;
  }
  const bands = {p5:[], p25:[], p50:[], p75:[], p95:[]};
  const col = new Float64Array(sims);
  for(let k=0;k<=horizon;k++){
    for(let s=0;s<sims;s++) col[s] = paths[s*w+k];
    col.sort();
    bands.p5.push(quantile(col,.05));
    bands.p25.push(quantile(col,.25));
    bands.p50.push(quantile(col,.5));
    bands.p75.push(quantile(col,.75));
    bands.p95.push(quantile(col,.95));
  }
  const finals = Float64Array.from(col);
  let profitable = 0;
  for(let s=0;s<sims;s++) if(paths[s*w+horizon] > start) profitable++;
  maxDD.sort();
  return {bands, finals, probProfit: profitable/sims, dd95: quantile(maxDD,.95), dd50: quantile(maxDD,.5)};
}

function fillForecastAccounts(){
  const sel = document.getElementById('fcAccount');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">${escHtml(t('f.allAccounts'))}</option>` +
    accounts.map(a=>`<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`).join('');
  sel.value = accounts.some(a=>a.name===cur) ? cur : '';
}

function buildForecastCharts(c){
  const legendLabels = {
    color: c.soft, boxWidth: 14, boxHeight: 3, padding: 14,
    filter: item => item.text !== ''
  };
  charts.forecast = new Chart(document.getElementById('forecastChart'),{
    type:'line',
    data:{labels:[], datasets:[
      {label:t('f.band90'), data:[], borderWidth:0, pointRadius:0, backgroundColor:c.accent+'1f', fill:'+1', tension:.25},
      {label:'', data:[], borderWidth:0, pointRadius:0, fill:false, tension:.25},
      {label:t('f.band50'), data:[], borderWidth:0, pointRadius:0, backgroundColor:c.accent+'38', fill:'+1', tension:.25},
      {label:'', data:[], borderWidth:0, pointRadius:0, fill:false, tension:.25},
      {label:t('f.medianLine'), data:[], borderColor:c.accent, borderWidth:2, borderDash:[6,4], pointRadius:0, fill:false, tension:.25},
      {label:t('f.trend'), data:[], borderColor:c.amber, borderWidth:1.6, borderDash:[3,3], pointRadius:0, fill:false},
      {label:t('f.history'), data:[], borderColor:c.soft, borderWidth:2, pointRadius:0, pointHoverRadius:4, fill:false, tension:.2}
    ]},
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:500, easing:'easeOutCubic'},
      interaction:{mode:'index', intersect:false},
      scales:{
        x:{grid:{color:c.border}, ticks:{maxRotation:0, autoSkip:true, maxTicksLimit:12}, title:{display:true, text:t('f.xTrade'), color:c.faint}},
        y:{grid:{color:c.border}, ticks:{callback:v=>fcShort(v)}}
      },
      plugins:{
        legend:{display:true, position:'bottom', labels:legendLabels},
        tooltip:{
          filter: item => item.raw!=null && item.dataset.label!=='',
          callbacks:{
            title: items => t('f.xTrade')+' '+items[0].label,
            label: item => {
              const ds = item.chart.data.datasets;
              const i = item.dataIndex;
              if(item.datasetIndex===0) return t('f.band90')+': '+fcShort(ds[1].data[i])+' … '+fcShort(item.raw);
              if(item.datasetIndex===2) return t('f.band50')+': '+fcShort(ds[3].data[i])+' … '+fcShort(item.raw);
              return item.dataset.label+': '+fcMoney(item.raw);
            }
          }
        }
      }}
  });
  charts.dist = new Chart(document.getElementById('distChart'),{
    type:'bar',
    data:{labels:[], datasets:[{data:[], backgroundColor:[], borderRadius:4, barPercentage:.95, categoryPercentage:.95}]},
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:500, easing:'easeOutCubic'},
      scales:{x:{grid:{display:false}, ticks:{maxRotation:0, autoSkip:true, maxTicksLimit:7}}, y:{grid:{color:c.border}, title:{display:true, text:t('f.freq'), color:c.faint}}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{title:items=>items[0].label, label:item=>item.raw+' / '+document.getElementById('fcSims').value}}}}
  });
}

function setFcStat(id, value, cls, sub){
  const el = document.getElementById(id);
  el.textContent = value;
  el.className = 'stat-value'+(cls?' '+cls:'');
  if(sub!==undefined) document.getElementById(id+'-sub').textContent = sub;
}

function methodBlock(title, desc, lines){
  return `<div class="fc-method"><div class="fc-method-title">${escHtml(title)}</div><div class="fc-method-desc">${escHtml(desc)}</div><div class="fc-formula">${lines.map(l=>`<div>${l}</div>`).join('')}</div></div>`;
}

function renderForecast(){
  if(!charts.forecast) return;
  const horizon = +document.getElementById('fcHorizon').value;
  const sims = +document.getElementById('fcSims').value;
  document.getElementById('fcHorizonVal').textContent = horizon;
  document.getElementById('fcDemoChip').style.display = fcDemo ? 'inline-flex' : 'none';
  document.getElementById('fcAccount').disabled = fcDemo;

  const src = fcSource();
  const nets = src.nets;
  const n = nets.length;
  document.getElementById('fcSample').textContent = t('f.sample', {x:tp('cal.trades', n)});
  const enough = n >= FC_MIN_TRADES;
  document.getElementById('fcEmpty').style.display = enough ? 'none' : 'flex';
  document.getElementById('fcContent').style.display = enough ? 'block' : 'none';
  if(!enough) return;

  const start = src.start;
  const equity = [start];
  nets.forEach(v=> equity.push(equity[equity.length-1]+v));
  const current = equity[n];

  const wins = nets.filter(v=>v>0), losses = nets.filter(v=>v<0);
  const p = wins.length/n;
  const avgW = wins.length ? wins.reduce((s,v)=>s+v,0)/wins.length : 0;
  const avgL = losses.length ? Math.abs(losses.reduce((s,v)=>s+v,0)/losses.length) : 0;
  const mu = nets.reduce((s,v)=>s+v,0)/n;
  const sigma = Math.sqrt(nets.reduce((s,v)=>s+(v-mu)*(v-mu),0)/(n-1));
  const expectancy = p*avgW - (1-p)*avgL;
  const R = avgL>0 ? avgW/avgL : Infinity;
  const kelly = avgL>0 ? p - (1-p)/R : (p>0 ? 1 : 0);

  const reg = linearRegression(equity);
  const trendEnd = reg.a + reg.b*(n+horizon);

  const mc = monteCarlo(nets, current, horizon, sims, fcSeed);
  const median = mc.bands.p50[horizon];
  const clt = {lo: current + horizon*mu - 1.96*sigma*Math.sqrt(horizon), hi: current + horizon*mu + 1.96*sigma*Math.sqrt(horizon)};

  setFcStat('fc-exp', fcMoney(expectancy, true), expectancy>=0?'pos':'neg', t('f.subExp', {s:fcMoney(sigma)}));
  setFcStat('fc-med', fcShort(median), median>=current?'pos':'neg', t('f.subMedian', {n:horizon, v:fcShort(current)}));
  setFcStat('fc-prob', (mc.probProfit*100).toFixed(1)+'%', mc.probProfit>=.5?'pos':'neg', t('f.subProb', {s:sims}));
  document.getElementById('fc-prob-ring').style.setProperty('--pct', (mc.probProfit*100).toFixed(1));
  const ddPct = current>0 ? t('f.ofBal', {p:(mc.dd95/current*100).toFixed(1)+'%'})+' · ' : '';
  setFcStat('fc-dd', '-'+fcShort(mc.dd95), 'neg', ddPct+t('f.subDd', {v:'-'+fcShort(mc.dd50)}));
  const kellyPct = Math.max(-100, Math.min(100, kelly*100));
  setFcStat('fc-kelly', kellyPct.toFixed(1)+'%', kelly>0?'pos':'neg', t('f.subKelly', {v:(Math.max(0,kellyPct)/2).toFixed(1)+'%'}));

  const total = n+horizon;
  const labels = Array.from({length:total+1}, (_,i)=> String(i));
  const pad0 = arr => Array(n).fill(null).concat(arr);
  const ds = charts.forecast.data.datasets;
  charts.forecast.data.labels = labels;
  ds[0].data = pad0(mc.bands.p95);
  ds[1].data = pad0(mc.bands.p5);
  ds[2].data = pad0(mc.bands.p75);
  ds[3].data = pad0(mc.bands.p25);
  ds[4].data = pad0(mc.bands.p50);
  ds[5].data = labels.map((_,i)=> +(reg.a + reg.b*i).toFixed(2));
  ds[6].data = equity.concat(Array(horizon).fill(null));
  charts.forecast.update();
  document.getElementById('fcMainNote').textContent = 'P5 '+fcShort(mc.bands.p5[horizon])+' · P50 '+fcShort(median)+' · P95 '+fcShort(mc.bands.p95[horizon]);

  const finals = mc.finals;
  const fMin = finals[0], fMax = finals[finals.length-1];
  const bins = 24;
  const width = (fMax-fMin)/bins || 1;
  const counts = new Array(bins).fill(0);
  for(let i=0;i<finals.length;i++){
    const b = Math.min(bins-1, Math.floor((finals[i]-fMin)/width));
    counts[b]++;
  }
  const cc = chartColors();
  charts.dist.data.labels = counts.map((_,i)=> fcShort(fMin + width*(i+.5)));
  charts.dist.data.datasets[0].data = counts;
  charts.dist.data.datasets[0].backgroundColor = counts.map((_,i)=> (fMin + width*(i+.5)) >= current ? cc.green : cc.red);
  charts.dist.update();
  document.getElementById('fcDistNote').textContent = t('f.subProb', {s:sims});

  const v = s => `<b>${s}</b>`;
  const blocks = [
    methodBlock(t('f.m1.title'), t('f.m1.desc'), [
      'y = a + b·x',
      'b = Σ(xᵢ − x̄)(yᵢ − ȳ) / Σ(xᵢ − x̄)²,  a = ȳ − b·x̄',
      `b = ${v(fcNum(reg.b))} ${escHtml(t('f.unitTrade'))} · a = ${v(fcNum(reg.a))} · R² = ${v(fcNum(reg.r2,3))}`,
      `${escHtml(t('f.m1.res', {n:horizon}))}: ${v(fcMoney(trendEnd))}`
    ]),
    methodBlock(t('f.m2.title'), t('f.m2.desc'), [
      'E = p·W̄ − (1 − p)·L̄',
      `p = ${v(fcNum(p,3))} · W̄ = ${v(fcMoney(avgW))} · L̄ = ${v(fcMoney(avgL))}`,
      `E = ${v(fcMoney(expectancy, true))}`
    ]),
    methodBlock(t('f.m3.title'), t('f.m3.desc', {s:sims, n:horizon}), [
      'B<sub>k</sub> = B<sub>0</sub> + Σ r<sub>i</sub>,  r<sub>i</sub> ∈ {r<sub>1</sub> … r<sub>n</sub>}',
      'P(profit) = #(B<sub>N</sub> &gt; B<sub>0</sub>) / S',
      `P5 = ${v(fcShort(mc.bands.p5[horizon]))} · P50 = ${v(fcShort(median))} · P95 = ${v(fcShort(mc.bands.p95[horizon]))}`,
      `P(profit) = ${v((mc.probProfit*100).toFixed(1)+'%')}`
    ]),
    methodBlock(t('f.m4.title'), t('f.m4.desc'), [
      'B<sub>N</sub> ≈ B<sub>0</sub> + N·μ ± 1.96·σ·√N',
      `μ = ${v(fcMoney(mu, true))} · σ = ${v(fcMoney(sigma))} · N = ${v(horizon)}`,
      `95%: [ ${v(fcShort(clt.lo))} ; ${v(fcShort(clt.hi))} ]`
    ]),
    methodBlock(t('f.m5.title'), t('f.m5.desc'), [
      'f* = p − (1 − p) / R,  R = W̄ / L̄',
      `R = ${v(isFinite(R)?fcNum(R):'∞')} → f* = ${v(kellyPct.toFixed(1)+'%')}`
    ].concat(kelly<=0 ? [`<span class="fc-warn">${escHtml(t('f.m5.neg'))}</span>`] : []))
  ];
  document.getElementById('fcMethods').innerHTML = blocks.join('');
}

document.getElementById('fcHorizon').addEventListener('input', ()=>{
  document.getElementById('fcHorizonVal').textContent = document.getElementById('fcHorizon').value;
});
document.getElementById('fcHorizon').addEventListener('change', renderForecast);
document.getElementById('fcSims').addEventListener('change', renderForecast);
document.getElementById('fcAccount').addEventListener('change', renderForecast);
document.getElementById('fcRecalc').addEventListener('click', ()=>{
  fcSeed = (Math.random()*0xFFFFFFFF) >>> 0;
  renderForecast();
});
document.getElementById('fcDemoOn').addEventListener('click', ()=>{ fcDemo = true; renderForecast(); });
document.getElementById('fcDemoOff').addEventListener('click', ()=>{ fcDemo = false; renderForecast(); });
