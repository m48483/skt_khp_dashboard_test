const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const client = require('../supabase-client.js');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/sales.js'), 'utf8'), context);
const rows = JSON.parse(JSON.stringify(context.window.SALES_DATA.rows));
const config = {url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test', table: 'dashboard_sales'};
const response = (body, count, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type':'application/json', 'Content-Range':`0-${Math.max(0,body.length-1)}/${count}`}
});

test('all 1,017 rows are paginated with publishable apikey and no JWT header', async () => {
  let requests = 0;
  const data = await client.load(config, {fetchImpl: async (address, options) => {
    requests++;
    assert.equal(options.headers.apikey, config.publishableKey);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.cache,'no-store');
    const url = new URL(address);
    assert.equal(url.searchParams.get('order'), 'id.asc');
    const remaining = rows.filter(r => r.id > Number(url.searchParams.get('id').slice(3)));
    return response(remaining.slice(0,500), remaining.length);
  }});
  assert.equal(requests,3);
  assert.deepEqual(data.summary, {rows:1017,revenue:515999400,quantity:1722,missingQuantity:5,duplicateRows:18,start:'2026-07-01',end:'2026-09-30'});
});

test('a server row cap below page size never silently truncates totals', async () => {
  let requests=0;
  const data = await client.load(config, {fetchImpl: async address => {
    requests++;
    const after=Number(new URL(address).searchParams.get('id').slice(3));
    const remaining=rows.filter(r=>r.id>after);
    return response(remaining.slice(0,100),remaining.length);
  }});
  assert.equal(requests,11);assert.equal(data.rows.length,1017);
});

test('empty database returns an empty dataset without the workbook fallback', async () => {
  const data=await client.load(config,{fetchImpl:async()=>response([],0)});
  assert.equal(data.rows.length,0);assert.equal(data.summary.start,'');
});

test('missing tables and denied reads produce actionable errors', async () => {
  for (const status of [401,403,404,500]) {
    await assert.rejects(client.load(config,{fetchImpl:async()=>response({},0,status)}),
      status===404 ? /초기화 SQL/ : status===500 ? /HTTP 500/ : /권한/);
  }
});

test('network failures and timeouts do not claim successful reads', async () => {
  await assert.rejects(client.load(config,{fetchImpl:async()=>{throw new TypeError('Failed to fetch');}}),/연결할 수 없습니다/);
  await assert.rejects(client.load(config,{timeoutMs:5,fetchImpl:(_,options)=>new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));
  })}),/시간이 초과/);
});

test('partial, inconsistent or unordered responses fail instead of publishing partial KPIs', async () => {
  await assert.rejects(client.load(config,{fetchImpl:async()=>response([],1017)}),/끝까지/);
  await assert.rejects(client.load(config,{fetchImpl:async()=>response([rows[1],rows[0]],2)}),/순서/);
  let call=0;
  await assert.rejects(client.load(config,{fetchImpl:async()=>++call===1 ? response(rows.slice(0,500),1017) : response(rows.slice(500),518)}),/변경/);
  await assert.rejects(client.load(config,{fetchImpl:async()=>new Response('[]')}),/건수/);
});

test('invalid database values and duplicate IDs fail explicitly', () => {
  for (const patch of [{date:'2026-02-30'}, {date:'garbage'}, {revenue:'100'}, {quantity:-1}, {manager:''}, {id:1.5}, {plan:5}]) {
    assert.throws(()=>client.dataset([{...rows[0],...patch}]));
  }
  assert.throws(()=>client.dataset([rows[0],rows[0]]),/ID/);
});

test('new DB dates, categories and regions are accepted; normalized duplicates are recomputed', () => {
  const source={...rows[0],id:3000,date:'2027-02-01',category:'새 상품',region:'서울특별시',duplicate:false};
  const data=client.dataset([source,{...source,id:3001,region:'서울'}]);
  assert.equal(data.summary.end,'2027-02-01');assert.equal(data.summary.duplicateRows,1);
  assert.equal(data.rows[0].region,'서울');assert.equal(data.rows[0].category,'새 상품');
});

test('invalid configuration and excessive data are rejected', async () => {
  await assert.rejects(client.load({...config,publishableKey:'service_role_key'}),/설정/);
  await assert.rejects(client.load({...config,url:'http://example.com'}),/설정/);
  await assert.rejects(client.load(config,{fetchImpl:async()=>response([],100001)}),/100,000/);
});
