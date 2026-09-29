import time, json
from playwright.sync_api import sync_playwright
base='http://localhost:4173/BandOrganizer/'
T=time.time()
def log(*a): print(round(time.time()-T,1), *a, flush=True)
INSTALL = """() => { window.__ls=[]; new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__ls.push({v:e.value, s:(e.sources||[]).map(s=>{const n=s.node; return n ? (n.tagName||'#text')+'.'+(String(n.className||'').toString().slice(0,40)) : '?'}).slice(0,3)}); } }).observe({type:'layout-shift', buffered:true}); }"""
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
    pg=ctx.new_page(); pg.set_default_timeout(15000)
    pg.on('pageerror', lambda e: log('PAGEERROR', str(e)[:200]))
    pg.goto(base+'?demo-songs=40')
    pg.get_by_role('button', name='Demo ausprobieren').click()
    pg.get_by_role('textbox', name='Bandname').fill('Overload'); pg.get_by_role('button', name='Band einrichten').click()
    pg.get_by_role('textbox', name='Name').fill('Lisa'); pg.get_by_role('button', name="Los geht's").click()
    pg.wait_for_timeout(1500)
    # some data: an event, a chat message
    pg.get_by_role('link', name='Kalender').first.click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Termin anlegen').first.click(); pg.get_by_role('button', name='Probe').click()
    pg.get_by_role('button', name='Speichern').click(); pg.wait_for_timeout(600)
    pg.get_by_role('link', name='Chat').first.click(); pg.wait_for_timeout(300)
    pg.get_by_role('textbox', name='Nachricht an die Band …').fill('Test'); pg.get_by_role('button', name='Senden').click(); pg.wait_for_timeout(500)
    pg.evaluate(INSTALL)
    def visit(name, click):
        pg.evaluate("window.__ls.length=0")
        click(); pg.wait_for_timeout(2200)
        ls=pg.evaluate("window.__ls")
        tot=round(sum(x['v'] for x in ls),4)
        log(f'{name:28s} CLS={tot}', json.dumps(ls[:3]) if tot>0.001 else '')
    nav=lambda n: (lambda: pg.locator('nav').get_by_role('link', name=n).first.click())
    for n in ['Start','Songs','Kalender','Chat','Mehr','Start','Songs']:
        visit('tab '+n, nav(n))
    # play a song -> mini player appears
    pg.evaluate("window.__ls.length=0")
    pg.get_by_role('button', name='Abspielen', exact=False).first.click(); pg.wait_for_timeout(1800)
    ls=pg.evaluate("window.__ls"); log('start playback (mini player)', round(sum(x['v'] for x in ls),4), json.dumps(ls[:3]))
    for n in ['Kalender','Chat','Start','Songs']:
        visit('with player: tab '+n, nav(n))
    visit('song detail', lambda: pg.get_by_role('link', name='Open Road', exact=False).first.click())
    visit('practice view', lambda: pg.get_by_role('button', name='Übungsansicht').first.click())
    b.close()
