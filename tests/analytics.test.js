const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../analytics.js');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../data/sales.js'),'utf8'),context);
const data=JSON.parse(JSON.stringify(context.window.SALES_DATA));
const rows=data.rows;
test('workbook totals are preserved including all source records',()=>{
  assert.deepEqual(A.summarize(rows),{revenue:515999400,quantity:1722,count:1017,stores:13,missing:5});
  assert.equal(new Set(rows.map(r=>r.id)).size,1017);
  assert.equal(new Set(rows.map(r=>r.region)).size,7);
  assert(rows.every(r=>/^2026-0[789]-\d\d$/.test(r.date)));
});
test('combined filters respect dates, region, store, and product',()=>{
  const state={start:'2026-08-01',end:'2026-08-31',region:'서울',store:'홍대점',category:'기기'};
  const found=A.filter(rows,state);
  assert(found.length>0);
  assert(found.every(r=>r.date.startsWith('2026-08') && r.region==='서울' && r.store==='홍대점' && r.category==='기기'));
  assert.equal(A.filter(rows,{...state,region:'부산'}).length,0);
});
test('duplicate exclusion is opt-in and keeps the first normalized record',()=>{
  assert.equal(A.filter(rows,{}).length,1017);
  const unique=A.filter(rows,{excludeDuplicates:true});
  assert.equal(unique.length,999);
  assert.equal(new Set(unique.map(({id,duplicate,...r})=>JSON.stringify(r))).size,999);
  assert.equal(A.sum(rows,'revenue')-A.sum(unique,'revenue'),A.sum(rows.filter(r=>r.duplicate),'revenue'));
});
test('missing quantities do not remove revenue or invent quantities',()=>{
  const missing=rows.filter(r=>r.quantity===null);
  assert.equal(A.summarize(missing).quantity,0);
  assert.equal(A.summarize(missing).count,5);
  assert(A.summarize(missing).revenue>0);
});
test('all independent groupings reconcile to the revenue total',()=>{
  for(const key of ['category','region','store','manager']) assert.equal(A.sum(A.group(rows,key),'revenue'),515999400);
});
test('timeline covers 92 days, reconciles to monthly totals, and fills zero days',()=>{
  const day=A.timeline(rows,'2026-07-01','2026-09-30','day');
  const month=A.timeline(rows,'2026-07-01','2026-09-30','month');
  assert.equal(day.length,92);assert.equal(month.length,3);
  assert.equal(A.sum(day,'revenue'),515999400);assert.equal(A.sum(month,'revenue'),515999400);
  const empty=A.timeline([],'2026-07-01','2026-07-03','day');
  assert.equal(empty.length,3);assert(empty.every(r=>r.revenue===0));
  assert.equal(A.timeline(rows,'2026-08-01','2026-07-01','day').length,0);
});
test('search matches staff, store, plan and handles an empty result',()=>{
  const found=A.search(rows,'  최유진  ');assert(found.length>0);assert(found.every(r=>r.manager==='최유진'));
  assert.equal(A.search(rows,'존재하지않음').length,0);
  assert.equal(A.search(rows,'미기재').length,197);
});
test('CSV has BOM, quoted values, missing quantities and formula protection',()=>{
  const output=A.csv([{date:'2026-07-01',region:'서울',store:'=1+1',category:'기기',plan:'a,"b"',quantity:null,revenue:100,manager:'김'}]);
  assert(output.startsWith('\uFEFF'));assert(output.includes('"\'=1+1"'));assert(output.includes('"a,""b"""'));assert(output.includes(',"","100",'));
  assert.equal(A.csv(rows).split('\r\n').length,1018);
});
