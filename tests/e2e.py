import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = 'http://localhost:4173/'
LAT, LON = 40.7895, 29.3990

def osrm(a, b):
    (lon1, lat1), (lon2, lat2) = a, b
    mid = [lon1, lat2]
    coords = [[lon1, lat1], mid, [lon2, lat2]]
    steps = [
        {'maneuver': {'type': 'depart', 'location': [lon1, lat1]}, 'name': 'Atatürk Caddesi', 'distance': 100},
        {'maneuver': {'type': 'turn', 'modifier': 'left', 'location': mid}, 'name': 'Okul Sokak', 'distance': 100},
        {'maneuver': {'type': 'arrive', 'modifier': 'right', 'location': [lon2, lat2]}, 'name': '', 'distance': 0},
    ]
    return {'code': 'Ok', 'routes': [{'geometry': {'type': 'LineString', 'coordinates': coords}, 'distance': 900, 'duration': 600, 'legs': [{'steps': steps}]}]}

async def main():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 880}, device_scale_factor=1, is_mobile=True, has_touch=True,
                                  geolocation={'latitude': LAT, 'longitude': LON, 'accuracy': 12}, permissions=['geolocation', 'camera'], locale='tr-TR')
        page = await ctx.new_page()
        page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {e}'))
        async def route_handler(route):
            url = route.request.url
            if 'route/v1' in url:
                part = url.split('/driving/')[1].split('?')[0]
                a, bb = [list(map(float, x.split(','))) for x in part.split(';')]
                await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(osrm(a, bb)))
            else:
                await route.abort()
        await page.route('https://routing.openstreetmap.de/**', route_handler)
        await page.route('https://router.project-osrm.org/**', route_handler)
        await page.route('https://tiles.openfreemap.org/**', lambda r: r.abort())
        await page.route('https://tile.openstreetmap.org/**', lambda r: r.abort())
        await page.goto(BASE)
        await page.wait_for_timeout(2500)
        await page.screenshot(path='/tmp/shots/01_onboarding.png')
        await page.fill('#onbNick', 'Bora')
        await page.click('#onbGo')
        await page.wait_for_timeout(800)
        await page.screenshot(path='/tmp/shots/02_home.png')
        # arama
        await page.fill('#q', 'beyran')
        await page.press('#q', 'Enter')
        await page.wait_for_timeout(900)
        await page.screenshot(path='/tmp/shots/03_beyran.png')
        await page.click('#sheetBody [data-r="0"]')
        await page.wait_for_timeout(700)
        await page.screenshot(path='/tmp/shots/04_offer.png')
        # teyit (konum kontrolü aktif: uzaksak modal)
        await page.click('#sheetBody [data-confirm]')
        await page.wait_for_timeout(600)
        await page.screenshot(path='/tmp/shots/05_confirm_or_geofence.png')
        gf = await page.query_selector('#gfOff')
        if gf:
            await gf.click()
            await page.wait_for_timeout(400)
            await page.click('#sheetBody [data-confirm]')
            await page.wait_for_timeout(600)
        await page.fill('#note', 'Sıcacık, bol tereyağlı')
        await page.screenshot(path='/tmp/shots/06_confirm_form.png')
        await page.click('#go')
        await page.wait_for_timeout(1200)
        await page.screenshot(path='/tmp/shots/07_after_confirm.png')
        # modal kapat
        for _ in range(4):
            m = await page.query_selector('.modal [data-close]')
            if m: 
                await m.click(); await page.wait_for_timeout(400)
        # puanla
        await page.click('#sheetBody [data-rate]')
        await page.wait_for_timeout(500)
        box = await page.query_selector('#rs')
        bb = await box.bounding_box()
        await page.mouse.click(bb['x'] + bb['width'] * 0.85, bb['y'] + bb['height'] / 2)
        await page.fill('#txt', 'Gaziantep usulü, ekmeği taze. Tavsiye ederim.')
        await page.screenshot(path='/tmp/shots/08_rate.png')
        await page.click('#go')
        await page.wait_for_timeout(1200)
        for _ in range(4):
            m = await page.query_selector('.modal [data-close]')
            if m:
                await m.click(); await page.wait_for_timeout(400)
        await page.screenshot(path='/tmp/shots/09_offer_after_rate.png')
        # cıvata arama + tahmin
        await page.fill('#q', "12'lik bronz cıvata")
        await page.press('#q', 'Enter')
        await page.wait_for_timeout(800)
        await page.screenshot(path='/tmp/shots/10_civata.png')
        await page.fill('#q', 'erik')
        await page.press('#q', 'Enter')
        await page.wait_for_timeout(800)
        await page.screenshot(path='/tmp/shots/11_erik.png')
        # dükkan
        await page.click('#sheetBody [data-r="0"]')
        await page.wait_for_timeout(600)
        await page.screenshot(path='/tmp/shots/11b_offer_erik.png')
        await page.click('#sheetBody [data-back]')
        await page.wait_for_timeout(600)
        await page.screenshot(path='/tmp/shots/12_place.png')
        # yol tarifi
        await page.click('#sheetBody [data-nav]')
        await page.wait_for_timeout(1500)
        await page.screenshot(path='/tmp/shots/13_nav.png')
        # varış simülasyonu: konumu hedefe taşı
        tgt = await page.evaluate("(() => { const p = window.__mudavim.App.selectedPlace; return [p.lat, p.lon]; })()")
        await ctx.set_geolocation({'latitude': tgt[0], 'longitude': tgt[1], 'accuracy': 8})
        await page.wait_for_timeout(2500)
        await page.screenshot(path='/tmp/shots/14_arrive.png')
        # AR
        await page.click('#sheetBody [data-ar]')
        await page.wait_for_timeout(1500)
        await ctx.set_geolocation({'latitude': tgt[0] - 0.0012, 'longitude': tgt[1] - 0.0004, 'accuracy': 8})
        await page.wait_for_timeout(500)
        await page.evaluate("""(() => { for (let i=0;i<30;i++){ const e = new Event('deviceorientationabsolute'); e.alpha = 350; e.beta = 88; e.gamma = 0; e.absolute = true; window.dispatchEvent(e);} })()""")
        await page.wait_for_timeout(800)
        await page.screenshot(path='/tmp/shots/15_ar.png')
        await page.click('#arClose')
        await page.wait_for_timeout(500)
        # yardım
        await page.click('#tabbar [data-tab="help"]')
        await page.wait_for_timeout(900)
        await page.screenshot(path='/tmp/shots/16_help.png')
        hs = await page.query_selector_all('#sheetBody [data-h]')
        print('help rows', len(hs))
        if hs:
            await hs[0].click()
            await page.wait_for_timeout(600)
            await page.screenshot(path='/tmp/shots/17_help_detail.png')
            know = await page.query_selector('#know')
            if know:
                await know.click(); await page.wait_for_timeout(600)
                await page.screenshot(path='/tmp/shots/18_answer_pick.png')
                rows = await page.query_selector_all('.page [data-p]')
                await rows[0].click(); await page.wait_for_timeout(400)
                await page.fill('#nt', 'Rafın altında')
                await page.click('#send'); await page.wait_for_timeout(800)
                await page.screenshot(path='/tmp/shots/19_answered.png')
                await page.wait_for_timeout(13000)
                await page.screenshot(path='/tmp/shots/20_resolved.png')
                for _ in range(4):
                    m = await page.query_selector('.modal [data-close]')
                    if m:
                        await m.click(); await page.wait_for_timeout(400)
        # kendi yardım çağrım
        await page.click('#fabHelp')
        await page.wait_for_timeout(500)
        await page.fill('#ht', 'Klima gider borusu 16mm')
        await page.click('#go')
        await page.wait_for_timeout(18000)
        await page.screenshot(path='/tmp/shots/21_my_help_answered.png')
        ok = await page.query_selector('#sheetBody [data-ok]')
        if ok:
            await ok.click(); await page.wait_for_timeout(1000)
            await page.screenshot(path='/tmp/shots/22_my_help_resolved.png')
            for _ in range(4):
                m = await page.query_selector('.modal [data-close]')
                if m:
                    await m.click(); await page.wait_for_timeout(400)
        # müdavimler
        await page.click('#tabbar [data-tab="board"]')
        await page.wait_for_timeout(900)
        await page.screenshot(path='/tmp/shots/23_board.png')
        # profil
        await page.click('#tabbar [data-tab="profile"]')
        await page.wait_for_timeout(900)
        await page.screenshot(path='/tmp/shots/24_profile.png', full_page=False)
        await page.click('#demo')
        await page.wait_for_timeout(600)
        await page.click('#algo')
        await page.wait_for_timeout(600)
        await page.screenshot(path='/tmp/shots/25_algo.png')
        await page.go_back(); await page.wait_for_timeout(300)
        await page.click('#lv5'); await page.wait_for_timeout(300)
        await page.go_back(); await page.wait_for_timeout(300)
        await page.go_back(); await page.wait_for_timeout(500)
        st = await page.evaluate("(() => ({tab: window.__mudavim.App.tab, pages: document.querySelectorAll('.page').length, xp: 0}))()")
        print('state after back', st)
        # reload persistence
        await page.reload(); await page.wait_for_timeout(2500)
        ev = await page.evaluate("window.__mudavim.S.events.length")
        print('events after reload', ev)
        await page.screenshot(path='/tmp/shots/26_reload.png')
        await b.close()
    print('ERRORS:', len(errors))
    for e in errors[:30]: print(' ', e[:300])

asyncio.run(main())
