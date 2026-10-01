"""Voice notes (F4 §6.4a): record with Chromium's fake microphone, listen, save, play – and again after reopening
the song (file loaded from storage). Also: which format the browser records, and no sideways scrolling at 320 px."""
import sys

from playwright.sync_api import sync_playwright

from common import log, nav, open_demo

FIT = "() => document.documentElement.scrollWidth <= innerWidth"
ok = True
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    ctx = browser.new_context(viewport={'width': 320, 'height': 700}, has_touch=True, is_mobile=True, permissions=['microphone'])
    pg = ctx.new_page()
    pg.set_default_timeout(15000)
    pg.on('pageerror', lambda e: log('PAGEERROR', str(e)[:200]))
    open_demo(pg)
    log('recordable:', pg.evaluate("() => ['audio/mp4', 'audio/webm;codecs=opus'].filter(m => MediaRecorder.isTypeSupported(m))"))

    def open_notes():
        nav(pg, 'songs', wait=900)
        pg.get_by_role('link', name='Open Road', exact=False).first.click(); pg.wait_for_timeout(800)
        pg.get_by_role('tab', name='Notizen').click(); pg.wait_for_timeout(300)

    open_notes()
    pg.get_by_role('button', name='Sprachnotiz aufnehmen').click(); pg.wait_for_timeout(3200)
    ok &= pg.evaluate(FIT)
    pg.get_by_role('button', name='Aufnahme beenden').click(); pg.wait_for_timeout(800)
    duration = pg.evaluate("() => new Promise(r => { const a = document.querySelector('audio'); if (!a) return r(0); if (a.readyState >= 1) return r(a.duration); a.onloadedmetadata = () => r(a.duration); setTimeout(() => r(0), 3000); })")
    log('recorded seconds:', duration); ok &= 2.5 < duration < 5
    ok &= pg.evaluate(FIT)
    pg.get_by_role('button', name='Notiz speichern').click(); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='Sprachnotiz abspielen').click(); pg.wait_for_timeout(1500)
    playing = pg.get_by_role('button', name='Sprachnotiz anhalten').count() == 1
    log('plays after saving:', playing); ok &= playing

    open_notes()
    pg.get_by_role('button', name='Sprachnotiz abspielen').click(); pg.wait_for_timeout(1500)
    again = pg.get_by_role('button', name='Sprachnotiz anhalten').count() == 1 and pg.get_by_text('konnte nicht geladen').count() == 0
    log('plays after reopening (from storage):', again); ok &= again
    ok &= pg.evaluate(FIT)
    browser.close()

log('RESULT:', 'ok' if ok else 'FAILED')
sys.exit(0 if ok else 1)
