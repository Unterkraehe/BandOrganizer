"""Phone behaviour: swipe tabs, answer buttons stay put, pinned chat input, dialog on top, zoom guards."""
import json
from common import log, session

with session(query='?demo-songs=40', scheme='dark') as s:
    pg, ctx = s.pg, s.ctx
    cdp = s.cdp_session()
    def swipe(x0,x1,y=420):
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x0,'y':y}]})
        for i in range(1,7):
            cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x0+(x1-x0)*i/6,'y':y+i}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        pg.wait_for_timeout(500)
    title=lambda: pg.evaluate("document.querySelector('main h1')?.textContent")
    log('start on', title())
    swipe(300,80);  log('after swipe left  ->', title(), pg.evaluate('location.pathname'))
    swipe(300,80);  log('after swipe left  ->', pg.evaluate('location.pathname'))
    swipe(80,300);  log('after swipe right ->', pg.evaluate('location.pathname'))
    swipe(8,250);   log('edge swipe (must stay) ->', pg.evaluate('location.pathname'))

    # calendar: event + answer buttons must not move
    pg.locator('nav').get_by_role('link', name='Kalender').first.click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Termin anlegen').first.click(); pg.get_by_role('button', name='Probe').click()
    pg.get_by_role('button', name='Speichern').click(); pg.wait_for_timeout(500)
    pg.locator('nav').get_by_role('link', name='Kalender').first.click(); pg.wait_for_timeout(500)
    pg.get_by_role('radio', name='Liste').check(force=True); pg.wait_for_timeout(300)
    pos=lambda: pg.evaluate("(()=>{const b=[...document.querySelectorAll('main [role=group] button[aria-pressed]')].filter(x=>/dabei|Vielleicht|nicht/i.test(x.getAttribute('aria-label')||'')); return b.slice(0,3).map(x=>Math.round(x.getBoundingClientRect().top)+':'+Math.round(x.getBoundingClientRect().left))})()")
    before=pos()
    pg.get_by_role('button', name='Ich bin dabei').first.click(); pg.wait_for_timeout(500)
    after1=pos()
    pg.get_by_role('button', name='Vielleicht').first.click(); pg.wait_for_timeout(500)
    after2=pos()
    log('answer buttons before/after tap:', before, after1, after2, 'STABLE' if before==after1==after2 else 'MOVED')
    pg.screenshot(path='/tmp/v-calendar.png')

    # chat: pinned composer, mini player present
    pg.locator('nav').get_by_role('link', name='Songs').first.click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Abspielen', exact=False).first.click(); pg.wait_for_timeout(1500)
    pg.locator('nav').get_by_role('link', name='Chat').first.click(); pg.wait_for_timeout(500)
    box=pg.get_by_role('textbox', name='Nachricht an die Band …')
    for i in range(14):
        box.fill(f'Nachricht Nummer {i} '+'lang '*(i%5*6)); pg.get_by_role('button', name='Senden').click(); pg.wait_for_timeout(120)
    pg.wait_for_timeout(600)
    comp=lambda: pg.evaluate("(()=>{const t=document.querySelector('textarea'); const r=t.getBoundingClientRect(); const nav=document.querySelector('nav').getBoundingClientRect(); const mini=document.querySelector('[aria-label=\"Läuft gerade\"]'); const m=mini?mini.getBoundingClientRect():null; return {textareaBottom:Math.round(r.bottom), navTop:Math.round(nav.top), miniTop:m?Math.round(m.top):null, miniBottom:m?Math.round(m.bottom):null, scrollY:Math.round(scrollY)}})()")
    log('composer at bottom of chat:', comp())
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(300)
    log('composer after scrolling to TOP:', comp())
    pg.screenshot(path='/tmp/v-chat-top.png')
    # attachment menu / dialog
    pg.get_by_role('button', name='Anhängen').click(); pg.get_by_role('menuitem', name='Song teilen').click(); pg.wait_for_timeout(400)
    dlg=pg.get_by_role('dialog').first.bounding_box(); log('share dialog box:', dlg, 'nav top', pg.evaluate("Math.round(document.querySelector('nav').getBoundingClientRect().top)"))
    top=pg.evaluate("(()=>{const d=document.querySelector('[role=dialog]').getBoundingClientRect(); const el=document.elementFromPoint(d.left+d.width/2, d.bottom-10); return el && el.closest('[role=dialog]') ? 'dialog is on top' : 'COVERED by '+(el&&el.tagName)})()")
    log('dialog stacking:', top)
    pg.screenshot(path='/tmp/v-share.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # zoom / font sizes
    log('viewport meta:', pg.evaluate("document.querySelector('meta[name=viewport]').content"))
    log('smallest input font-size:', pg.evaluate("Math.min(...[...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea,select')].map(e=>parseFloat(getComputedStyle(e).fontSize)))"))
