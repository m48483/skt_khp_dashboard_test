'use strict';
const A = window.Analytics;
let data = {source: 'Supabase', rows: [], summary: {start: '', end: ''}};
let loading = false;
const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat('ko-KR').format(Math.round(value));
const money = value => number(value) + '원';
const shortMoney = value => value >= 1e8 ? (value/1e8).toFixed(2) + '억' : value >= 1e4 ? number(value/1e4) + '만' : number(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors = {'기기':'#d88caf','5G요금제':'#a8a2d2','인터넷·TV':'#b18798','LTE요금제':'#d5bf8d','액세서리':'#b6cbd3'};
const state = {start:data.summary.start, end:data.summary.end, region:'', store:'', category:'', excludeDuplicates:false, grain:'day', query:'', sort:'date', direction:-1, page:1};
let filtered = [], tableRows = [], toastTimer;
const productColor = name => Object.hasOwn(colors, name) ? colors[name] : '#ba8fa9';
const empty = message => `<div class="empty-state"><span>◌</span>${esc(message)}</div>`;
function options(id, values, label) {
  $(id).innerHTML = `<option value="">${label}</option>` + [...new Set(values)].sort((a,b)=>a.localeCompare(b,'ko')).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
}
function updateStores() {
  options('store', data.rows.filter(r=>!state.region || r.region===state.region).map(r=>r.store),'전체 매장');
  if (![...$('store').options].some(o=>o.value===state.store)) state.store='';
  $('store').value=state.store;
}
function render() {
  const invalid = state.start > state.end;
  $('date-error').hidden=!invalid;
  filtered = invalid ? [] : A.filter(data.rows, state);
  const totals=A.summarize(filtered);
  $('period-label').textContent=state.start && state.end ? `${state.start.replaceAll('-','.')} — ${state.end.replaceAll('-','.')}` : '조회 기간 없음';
  $('filter-summary').textContent=`${state.region || '전체 지역'} · ${state.store || '전체 매장'} · ${number(totals.count)}건`;
  $('total-revenue').innerHTML=`${number(totals.revenue)}<small>원</small>`;
  $('total-quantity').innerHTML=`${number(totals.quantity)}<small>개</small>`;
  $('total-transactions').innerHTML=`${number(totals.count)}<small>건</small>`;
  $('total-stores').innerHTML=`${totals.stores}<small>개 매장</small>`;
  const days = invalid || !state.start || !state.end ? 0 : Math.round((new Date(state.end)-new Date(state.start))/864e5)+1;
  $('revenue-note').textContent=`일평균 ${days ? money(totals.revenue/days) : '—'} · 선택 기간 기준`;
  $('quantity-note').textContent=totals.missing ? `수량 미기재 ${totals.missing}건 제외` : '수량이 기재된 판매 기록 기준';
  $('transaction-note').textContent=`건당 평균 ${totals.count ? money(totals.revenue/totals.count) : '—'}`;
  $('store-note').textContent=`전체 ${new Set(data.rows.map(r=>r.store)).size}개 중 판매 기록이 있는 매장`;
  renderTrend();renderProduct();renderRanking();renderRegions();renderTable();
  const missing = filtered.filter(r=>r.quantity===null).length;
  const duplicates = filtered.filter(r=>r.duplicate).length;
  $('quality-summary').textContent=`현재 조회: 수량 미기재 ${missing}건 · 중복 의심 ${duplicates}건${state.excludeDuplicates?' · 중복 제외 적용 중':' 포함'}`;
  document.querySelectorAll('[data-month]').forEach(button=>{
    const month=button.dataset.month;
    const range = monthRange(month);
    const on=state.start===range.start && state.end===range.end;
    button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));
  });
}
function renderTrend() {
  if(!filtered.length) { $('trend-chart').innerHTML=empty('선택한 조건에 판매 기록이 없습니다');$('trend-caption').textContent='조회 조건을 변경해 주세요.';return; }
  const series=A.timeline(filtered,state.start,state.end,state.grain);
  const w=720,h=225,left=48,right=18,top=15,bottom=35,cw=w-left-right,ch=h-top-bottom;
  const max=Math.max(...series.map(s=>s.revenue),1), ceiling=Math.ceil(max/4/1e6)*4e6 || 4e6;
  const x=i=>left+(series.length===1?cw/2:i*cw/(series.length-1));
  const y=v=>top+ch-v/ceiling*ch;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${state.grain==='day'?'일별':'월별'} 매출 추이, ${series.length}개 구간"><defs><linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e6a5c4" stop-opacity=".33"/><stop offset="100%" stop-color="#fae7f0" stop-opacity=".06"/></linearGradient></defs>`;
  for(let i=0;i<=4;i++) {const value=ceiling*i/4; svg+=`<line x1="${left}" x2="${w-right}" y1="${y(value)}" y2="${y(value)}" stroke="#f1e9ec" stroke-dasharray="3 5"/><text x="${left-10}" y="${y(value)+3}" text-anchor="end" fill="#afa0a6" font-size="9">${number(value/1e6)}</text>`;}
  const points=series.map((s,i)=>`${x(i)},${y(s.revenue)}`);
  if(series.length>1) svg+=`<path d="M ${x(0)},${y(0)} L ${points.join(' L ')} L ${x(series.length-1)},${y(0)} Z" fill="url(#area-gradient)"/><polyline points="${points.join(' ')}" fill="none" stroke="#c65d90" stroke-width="2.3" stroke-linejoin="round"/>`;
  series.forEach((s,i)=>{
    if(series.length<10) svg+=`<circle class="data-point" cx="${x(i)}" cy="${y(s.revenue)}" r="4"/>`;
    const hit=Math.max(6,cw/series.length);
    svg+=`<rect class="hover-target" x="${Math.max(left,x(i)-hit/2)}" y="${top}" width="${hit}" height="${ch}"><title>${s.name}: ${money(s.revenue)} · ${number(s.count)}건</title></rect>`;
    const step=Math.max(1,Math.ceil(series.length/7));
    if(i%step===0 || i===series.length-1) {
      if(i!==series.length-1 || series.length<3 || (i-1)%step>1 || i%step===0) svg+=`<text x="${x(i)}" y="${h-12}" text-anchor="middle" fill="#a99aa0" font-size="9">${state.grain==='month'?Number(s.name.slice(5))+'월':s.name.slice(5).replace('-','/')}</text>`;
    }
  });
  $('trend-chart').innerHTML=svg+'</svg>';
  const best=[...series].sort((a,b)=>b.revenue-a.revenue)[0];
  $('trend-caption').innerHTML=`최고 매출 ${state.grain==='day'?'일':'월'} <strong>${esc(best.name.replaceAll('-','.'))}</strong> <span aria-hidden="true">·</span> <strong>${money(best.revenue)}</strong> <span aria-hidden="true">/</span> ${number(best.count)}건`;
}
function renderProduct() {
  const groups=A.group(filtered,'category'),total=A.sum(filtered,'revenue');
  if(!groups.length){$('product-chart').innerHTML=empty('상품 데이터가 없습니다');$('product-legend').innerHTML='';return;}
  let cursor=0;const stops=groups.map(g=>{const start=cursor;cursor+=total?g.revenue/total*100:0;return `${productColor(g.name)} ${start}% ${cursor}%`;});
  $('product-chart').innerHTML=`<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${total?stops.join(','):'#f1e8ec 0% 100%'})" role="img" aria-label="상품군 매출 비중: ${esc(groups.map(g=>g.name+' '+(total?g.revenue/total*100:0).toFixed(1)+'%').join(', '))}"></div><div class="donut-center"><span>매출 1위 상품군</span><strong>${esc(groups[0].name)}</strong><small>전체 매출의 ${total?(groups[0].revenue/total*100).toFixed(1):'0.0'}%</small></div></div>`;
  $('product-legend').innerHTML=groups.map(g=>`<div class="legend-row"><span><i class="legend-dot" style="background:${productColor(g.name)}"></i>${esc(g.name)}</span><span class="amount">${shortMoney(g.revenue)}원</span><span class="percent">${total?(g.revenue/total*100).toFixed(1):'0.0'}%</span></div>`).join('');
}
function renderRanking() {
  const groups=A.group(filtered,'store').slice(0,5);
  $('store-ranking').innerHTML=groups.length?groups.map((g,i)=>`<div class="rank-row"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-store">${esc(g.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${groups[0].revenue?g.revenue/groups[0].revenue*100:0}%"></div></div><span class="rank-amount" title="${money(g.revenue)}">${shortMoney(g.revenue)}원</span></div>`).join(''):empty('매장 데이터가 없습니다');
}
function renderRegions() {
  const groups=A.group(filtered,'region');$('region-count').textContent=groups.length+'개 지역';
  $('region-chart').innerHTML=groups.length?groups.map(g=>`<div class="region-row"><span>${esc(g.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${groups[0].revenue?g.revenue/groups[0].revenue*100:0}%"></div></div><span class="region-amount" title="${money(g.revenue)}">${shortMoney(g.revenue)}원</span><span class="region-count">${number(g.count)}건</span></div>`).join(''):empty('지역 데이터가 없습니다');
}
function renderTable() {
  tableRows=A.search(filtered,state.query).sort((a,b)=>state.direction*(state.sort==='date'?a.date.localeCompare(b.date):a.revenue-b.revenue) || a.id-b.id);
  const pages=Math.max(1,Math.ceil(tableRows.length/10));state.page=Math.min(state.page,pages);
  const offset=(state.page-1)*10;
  $('table-count').textContent=number(tableRows.length)+'건';
  const classes={'기기':'device','액세서리':'accessory','인터넷·TV':'internet'};
  $('sales-table').innerHTML=tableRows.length?tableRows.slice(offset,offset+10).map(r=>`<tr><td>${r.date.replaceAll('-','.')} ${r.duplicate?'<span class="duplicate-mark" title="동일 내용의 중복 의심 행 · 원본 유지" aria-label="중복 의심 행">*</span>':''}</td><td>${esc(r.region)}</td><td>${esc(r.store)}</td><td><span class="category-tag ${classes[r.category]||''}">${esc(r.category)}</span></td><td${r.plan?'':' class="missing"'}>${esc(r.plan||'미기재')}</td><td class="numeric">${r.quantity===null?'<span class="missing" title="수량 미기재">—</span>':number(r.quantity)}</td><td class="numeric">${money(r.revenue)}</td><td>${esc(r.manager)}</td></tr>`).join(''):'<tr><td colspan="8" class="empty-row">검색 조건에 해당하는 판매 기록이 없습니다.</td></tr>';
  $('page-info').textContent=tableRows.length?`총 ${number(tableRows.length)}건 중 ${offset+1}–${Math.min(offset+10,tableRows.length)}건`:'조회 결과 0건';
  $('page-number').textContent=state.page+' / '+pages;
  $('prev-page').disabled=state.page===1;$('next-page').disabled=state.page===pages;
  for(const key of ['date','revenue']) {
    $('sort-'+key).textContent=(key==='date'?'판매일':'매출액')+' '+(state.sort===key?(state.direction===1?'↑':'↓'):'↕');
    $('sort-'+key).parentElement.setAttribute('aria-sort',state.sort===key?(state.direction===1?'ascending':'descending'):'none');
  }
}
function setDates(start,end){state.start=start;state.end=end;$('start-date').value=start;$('end-date').value=end;}

for(const id of ['start-date','end-date']) {
  $(id).addEventListener('change',()=>{
    const start=$('start-date').value||data.summary.start,end=$('end-date').value||data.summary.end;
    setDates(start<data.summary.start?data.summary.start:start>data.summary.end?data.summary.end:start,end>data.summary.end?data.summary.end:end<data.summary.start?data.summary.start:end);
    state.page=1;render();
  });
}
for(const id of ['region','store','category']) $(id).addEventListener('change',()=>{state[id]=$(id).value;state.page=1;if(id==='region')updateStores();render();});
document.querySelector('.period-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-month]');
  if (!button || loading || button.disabled) return;
  const range = monthRange(button.dataset.month);
  setDates(range.start, range.end); state.page = 1; render();
});
document.querySelectorAll('[data-grain]').forEach(button=>button.addEventListener('click',()=>{state.grain=button.dataset.grain;document.querySelectorAll('[data-grain]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});renderTrend();}));
$('reset').addEventListener('click',()=>{Object.assign(state,{region:'',store:'',category:'',query:'',excludeDuplicates:false,page:1,sort:'date',direction:-1});setDates(data.summary.start,data.summary.end);$('region').value='';$('category').value='';$('search').value='';$('exclude-duplicates').checked=false;updateStores();render();});
$('exclude-duplicates').addEventListener('change',()=>{state.excludeDuplicates=$('exclude-duplicates').checked;state.page=1;render();});
$('search').addEventListener('input',()=>{state.query=$('search').value;state.page=1;renderTable();});
for(const key of ['date','revenue']) $('sort-'+key).addEventListener('click',()=>{state.direction=state.sort===key?-state.direction:-1;state.sort=key;state.page=1;renderTable();});
$('prev-page').addEventListener('click',()=>{state.page--;renderTable();});$('next-page').addEventListener('click',()=>{state.page++;renderTable();});
$('export').addEventListener('click',()=>{
  const blob=new Blob([A.csv(tableRows)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`매장판매실적_${state.start}_${state.end}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('toast').textContent=`현재 조회·검색 결과 ${number(tableRows.length)}건을 다운로드했습니다.`;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);
});
document.querySelectorAll('.nav-item').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(l=>l.classList.toggle('active',l===link));}));

function monthRange(month) {
  if (month === 'all') return {start: data.summary.start, end: data.summary.end};
  const [year, number] = month.split('-').map(Number);
  const start = month + '-01';
  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return {start: start < data.summary.start ? data.summary.start : start,
    end: end > data.summary.end ? data.summary.end : end};
}

function initializeFilters(previous = null) {
  options('region', data.rows.map(row => row.region), '전체 지역');
  options('category', data.rows.map(row => row.category), '전체 상품군');
  for (const key of ['region', 'category']) {
    if (![...$(key).options].some(option => option.value === state[key])) state[key] = '';
    $(key).value = state[key];
  }
  updateStores();
  const months = [...new Set(data.rows.map(row => row.date.slice(0, 7)))].sort();
  const multipleYears = new Set(months.map(month => month.slice(0, 4))).size > 1;
  document.querySelector('.period-tabs').innerHTML = '<button data-month="all" aria-pressed="false">전체 기간</button>'
    + months.map(month => `<button data-month="${month}" aria-pressed="false">${multipleYears ? month.slice(0, 4) + '.' : ''}${Number(month.slice(5))}월</button>`).join('');
  for (const id of ['start-date', 'end-date']) {
    $(id).min = data.summary.start; $(id).max = data.summary.end;
  }
  const usedAll = !previous || !previous.start || (state.start === previous.start && state.end === previous.end);
  let start = usedAll ? data.summary.start : [state.start, data.summary.start].sort().at(-1);
  let end = usedAll ? data.summary.end : [state.end, data.summary.end].sort()[0];
  if (!start || !end || start > end) {start = data.summary.start; end = data.summary.end;}
  setDates(start, end);
  state.page = 1;
}

function setControlsEnabled(enabled) {
  document.querySelectorAll('.filters button, .filters input, .filters select, .segmented button, #quality input, #transactions input, #transactions button, #export')
    .forEach(control => {control.disabled = !enabled;});
}

function connection(status, title, description) {
  $('connection-panel').dataset.state = status;
  $('connection-panel').setAttribute('aria-busy', String(status === 'loading'));
  $('connection-title').textContent = title;
  $('connection-description').textContent = description;
  $('sidebar-status').textContent = status === 'ready' ? 'Supabase 연결됨' : status === 'loading' ? 'DB 연결 중' : status === 'empty' ? '조회 결과 없음' : 'DB 연결 확인 필요';
}

async function refreshData() {
  if (loading) return;
  loading = true;
  setControlsEnabled(false);
  $('refresh-data').disabled = true;
  $('refresh-data').textContent = '불러오는 중…';
  connection('loading', '판매 데이터를 불러오는 중입니다', 'Supabase에서 최신 판매 기록을 조회하고 있습니다.');
  const previous = data.summary;
  // Clear the old values while loading; a failed request never masquerades as live data.
  data = {source: 'Supabase', rows: [], summary: {start: '', end: ''}};
  render();
  document.querySelectorAll('.kpi-value').forEach(el => {el.textContent = '—';});
  for (const id of ['revenue-note', 'quantity-note', 'transaction-note', 'store-note']) $(id).textContent = 'DB 조회 대기 중';
  $('source-description').textContent = '판매 기록을 불러오고 있습니다';
  $('source-period').textContent = 'Supabase';
  $('source-caption').textContent = '출처: Supabase · 금액 단위: 원';
  try {
    data = await window.SupabaseSales.load(window.SUPABASE_CONFIG);
    initializeFilters(previous);
    if (data.rows.length) {
      setControlsEnabled(true);
      render();
      const time = new Date().toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit', hour12: false});
      connection('ready', `Supabase 연결됨 · ${number(data.rows.length)}건`, `${time} 조회 완료 · DB에서 변경한 판매 기록은 새로고침하면 반영됩니다.`);
      $('source-description').textContent = `${data.summary.start} ~ ${data.summary.end}`;
      $('source-period').textContent = `${data.summary.start.slice(0, 7).replace('-', '.')} – ${data.summary.end.slice(0, 7).replace('-', '.')}`;
      $('source-caption').textContent = `출처: Supabase · ${time} 조회 · 금액 단위: 원`;
    } else {
      render(); setControlsEnabled(false);
      connection('empty', '조회 가능한 판매 기록이 없습니다', 'Supabase의 판매 테이블과 조회 권한을 확인한 뒤 다시 불러와 주세요.');
      $('source-description').textContent = '조회 가능한 판매 기록 0건';
    }
    $('refresh-data').textContent = '새로고침';
  } catch (error) {
    data = {source: 'Supabase', rows: [], summary: {start: '', end: ''}};
    initializeFilters(); render(); setControlsEnabled(false);
    document.querySelectorAll('.kpi-value').forEach(el => {el.textContent = '—';});
    for (const id of ['revenue-note', 'quantity-note', 'transaction-note', 'store-note']) $(id).textContent = '데이터 조회 실패';
    connection('error', '판매 데이터를 불러오지 못했습니다', error.message || '잠시 후 다시 시도해 주세요.');
    $('source-description').textContent = '다시 불러오기가 필요합니다';
    $('refresh-data').textContent = '다시 불러오기';
  } finally {
    loading = false;
    $('refresh-data').disabled = false;
  }
}
$('refresh-data').addEventListener('click', refreshData);
refreshData();
