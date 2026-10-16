"""Browser checks with mocked Supabase responses, including failure and refresh states."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import threading
import shutil
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'data/sales.js').read_text().removeprefix('window.SALES_DATA = ').rstrip(';\n'))['rows']
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1050})
        records=list(source)
        mode='hold'
        pending=[]
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        def api(route):
            if mode=='hold': pending.append(route); return
            if mode=='network':route.abort('failed'); return
            if mode=='denied':route.fulfill(status=403,json={'message':'permission denied'}); return
            params=parse_qs(urlparse(route.request.url).query)
            remaining=[r for r in records if r['id']>int(params['id'][0][3:])]
            selected=remaining[:500]
            route.fulfill(status=200,json=selected,headers={
                'Content-Range':f'0-{max(0,len(selected)-1)}/{len(remaining)}',
                'Access-Control-Expose-Headers':'Content-Range'})
        page.route('**/rest/v1/dashboard_sales?*',api)
        page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','loading')
        expect(page.locator('#export')).to_be_disabled()
        expect(page.locator('#total-revenue')).to_have_text('—')
        assert len(pending)==1
        pending.pop().fulfill(status=404,json={'code':'PGRST205'})
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','error')
        expect(page.locator('#connection-description')).to_contain_text('초기화 SQL')
        expect(page.locator('#total-revenue')).to_have_text('—')
        expect(page.locator('#export')).to_be_disabled()
        print('PASS: loading state and missing-table error; no workbook fallback')
        mode='success'
        page.locator('#refresh-data').click()
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','ready')
        expect(page.locator('#total-revenue')).to_have_text('515,999,400원')
        print('PASS: recovery after the table becomes available')
        records.append({**source[0],'id':2000,'date':'2027-01-03','region':'제주','store':'신규점','category':'신규 상품','manager':'<img src=x onerror=alert(1)>','revenue':200000})
        page.locator('#refresh-data').click()
        expect(page.locator('#total-transactions')).to_have_text('1,018건')
        assert page.input_value('#end-date')=='2027-01-03'
        page.locator('[data-month="2027-01"]').click()
        expect(page.locator('#total-revenue')).to_have_text('200,000원')
        assert page.locator('#product-chart').get_attribute('style') is None
        assert 'undefined' not in page.locator('#product-chart').inner_html()
        assert page.locator('#sales-table img').count()==0
        expect(page.locator('#sales-table')).to_contain_text('<img src=x onerror=alert(1)>')
        page.select_option('#region','제주')
        page.locator('#refresh-data').click()
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','ready')
        assert page.input_value('#region')=='제주'
        assert page.input_value('#start-date')=='2027-01-01'
        assert page.input_value('#end-date')=='2027-01-03'
        print('PASS: new DB dates/regions/categories, refresh filter preservation and escaped text')
        mode='denied'
        page.locator('#refresh-data').click()
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','error')
        expect(page.locator('#total-revenue')).to_have_text('—')
        expect(page.locator('#export')).to_be_disabled()
        expect(page.locator('#connection-description')).to_contain_text('권한')
        print('PASS: failed refresh clears stale totals and disables export')
        mode='success';records=[]
        page.locator('#refresh-data').click()
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','empty')
        expect(page.locator('#total-transactions')).to_have_text('0건')
        expect(page.locator('#export')).to_be_disabled()
        expect(page.locator('#connection-description')).to_contain_text('조회 권한')
        mode='network'
        page.locator('#refresh-data').click()
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','error')
        expect(page.locator('#connection-description')).to_contain_text('네트워크')
        mode='success';records=[{**source[0],'revenue':'bad'}]
        page.locator('#refresh-data').click()
        expect(page.locator('#connection-description')).to_contain_text('매출액 또는 수량')
        print('PASS: empty, network failure, and malformed-data states')
        records=list(source)
        page.locator('#refresh-data').click()
        expect(page.locator('#connection-panel')).to_have_attribute('data-state','ready')
        page.screenshot(path='/tmp/supabase-dashboard-desktop.png')
        for width in [1440,768,390,320]:
            page.set_viewport_size({'width':width,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path='/tmp/supabase-dashboard-mobile.png')
        assert not errors,errors
        print('PASS: responsive connection status and no browser runtime errors')
        browser.close()
finally:
    server.shutdown();server.server_close()
