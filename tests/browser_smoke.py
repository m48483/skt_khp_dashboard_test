"""End-to-end smoke test; starts an isolated local server and closes it afterward."""
import csv
import functools
import io
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import threading
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT/'data/sales.js').read_text(encoding='utf-8')
data = json.loads(raw.removeprefix('window.SALES_DATA = ').rstrip(';\n'))
rows = data['rows']

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        executable=shutil.which('chromium') or shutil.which('google-chrome')
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},locale='ko-KR',accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        # Simulate the PostgREST contract. This is not a live Supabase assertion.
        requests=[]
        def api(route):
            query=parse_qs(urlparse(route.request.url).query)
            after=int(query['id'][0].split('.')[1])
            selected=[r for r in rows if r['id']>after]
            page_rows=selected[:int(query['limit'][0])]
            requests.append(route.request.url)
            route.fulfill(status=200, json=page_rows, headers={'Content-Range':f'0-{max(0,len(page_rows)-1)}/{len(selected)}', 'Access-Control-Expose-Headers':'Content-Range'})
        page.route('**/rest/v1/dashboard_sales?*',api)
        page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','ready')
        assert len(requests)==3, 'All 1,017 rows must be fetched over three pages'
        assert page.locator('script[src="data/sales.js"]').count()==0
        def total(expected):
            assert page.locator('#total-revenue').inner_text() == f'{expected:,}원'
        total(515999400)
        assert page.locator('#total-transactions').inner_text()=='1,017건'
        assert page.locator('#sales-table tr').count()==10
        print('PASS: mocked Supabase pagination, workbook totals and populated table')
        page.locator('[data-month="2026-08"]').click()
        page.select_option('#region','서울');page.select_option('#store','홍대점');page.select_option('#category','기기')
        expected=[r for r in rows if r['date'].startswith('2026-08') and r['region']=='서울' and r['store']=='홍대점' and r['category']=='기기']
        total(sum(r['revenue'] for r in expected))
        assert page.locator('#total-transactions').inner_text()==f'{len(expected)}건'
        assert page.locator('#store option').count()==5
        page.select_option('#region','부산')
        assert page.input_value('#store')==''
        assert page.locator('#store option').count()==3
        print('PASS: combined filters and dependent store choices')
        page.locator('#reset').click();total(515999400)
        page.locator('[data-grain="month"]').click()
        assert page.locator('#trend-chart svg').get_attribute('aria-label')=='월별 매출 추이, 3개 구간'
        page.locator('[data-grain="day"]').click()
        print('PASS: reset and chart aggregation controls')
        page.locator('#quality summary').click();page.locator('#exclude-duplicates').check()
        total(sum(r['revenue'] for r in rows if not r['duplicate']))
        assert page.locator('#total-transactions').inner_text()=='999건'
        page.locator('#exclude-duplicates').uncheck()
        print('PASS: duplicate option updates all records')
        page.locator('#search').fill('최유진')
        expected=[r for r in rows if r['manager']=='최유진']
        assert page.locator('#table-count').inner_text()==f'{len(expected)}건'
        page.locator('#sort-revenue').click()
        first=page.locator('#sales-table tr').first.locator('td').nth(6).inner_text()
        assert first==f"{max(r['revenue'] for r in expected):,}원"
        page.locator('#next-page').click();assert page.locator('#page-number').inner_text().startswith('2 /')
        with page.expect_download() as download:
            page.locator('#export').click()
        exported=list(csv.reader(io.StringIO(Path(download.value.path()).read_text(encoding='utf-8-sig'))))
        assert len(exported)==len(expected)+1
        assert sum(int(r[6]) for r in exported[1:])==sum(r['revenue'] for r in expected)
        assert all(r[7]=='최유진' for r in exported[1:])
        print('PASS: search, sorting, pagination, and filtered CSV contents')
        page.locator('#search').fill('존재하지않는매장')
        assert page.locator('#table-count').inner_text()=='0건'
        assert page.locator('#next-page').is_disabled()
        page.locator('#reset').click()
        page.locator('#start-date').fill('2026-09-30');page.locator('#start-date').dispatch_event('change')
        day=[r for r in rows if r['date']=='2026-09-30']
        total(sum(r['revenue'] for r in day))
        page.locator('#end-date').fill('2026-07-01');page.locator('#end-date').dispatch_event('change')
        assert page.locator('#date-error').is_visible();total(0)
        assert page.locator('#trend-chart .empty-state').count()==1
        page.locator('#reset').click()
        page.locator('#category').select_option('기기')
        page.locator('#start-date').fill('2026-07-25');page.locator('#start-date').dispatch_event('change')
        page.locator('#end-date').fill('2026-07-25');page.locator('#end-date').dispatch_event('change')
        total(sum(r['revenue'] for r in rows if r['date']=='2026-07-25' and r['category']=='기기'))
        print('PASS: no search results, invalid range, single-day range')
        page.locator('#reset').click()
        for width in [1440,1024,768,390,320]:
            page.set_viewport_size({'width':width,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'page overflow at {width}'
            assert page.locator('#total-revenue').evaluate('(el)=>el.scrollWidth<=el.clientWidth'),f'KPI overflow at {width}'
        print('PASS: desktop/tablet/mobile widths including 320px, no clipped revenue')
        assert not errors,errors
        print('PASS: no browser runtime errors')
        browser.close()
finally:
    server.shutdown();server.server_close()
