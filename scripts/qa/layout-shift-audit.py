"""Layout shifts (CLS) on every main screen, incl. shifts right after taps. Target: ≈ 0 everywhere (R-UI-11)."""
import json
from common import log, session

INSTALL = """() => { window.__ls=[]; new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__ls.push({v:e.value, s:(e.sources||[]).map(s=>{const n=s.node; return n ? (n.tagName||'#text')+'.'+(String(n.className||'').toString().slice(0,40)) : '?'}).slice(0,3)}); } }).observe({type:'layout-shift', buffered:true}); }"""

with session(query='?demo-songs=40', scheme='light') as s:
    pg = s.pg
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
