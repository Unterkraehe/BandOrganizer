"""No sideways scrolling on phones (R-UI-14): on a 360 px wide phone (or `overflow-check.py 320`), no screen and no scroll area inside it may be wider
than the screen. Long texts are simulated (a very long option in every <select>, e.g. a long recording file name).
Intentional sideways scrollers (filter/tab rows, PDF pages) are marked with `data-scroll-x` and skipped."""
import re
import sys

from common import log, nav, session

LONG = '2026-09-12 Probe im Proberaum – Mix final v3 mit extra langem Dateinamen zum Testen.wav'
CHECK = """(long) => {
  for (const sel of document.querySelectorAll('select')) {
    if (sel.dataset.qaLong) continue;
    const o = document.createElement('option'); o.textContent = long; sel.appendChild(o); sel.value = o.value; sel.dataset.qaLong = '1';
  }
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')
    + (el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : '');
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page ${document.documentElement.scrollWidth} > ${innerWidth}`);
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-scroll-x]')) continue;
    const ox = getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push(`${name(el)} scrolls sideways ${el.scrollWidth} > ${el.clientWidth}`);
  }
  return out;
}"""

SCREENS = ['', 'songs', 'calendar', 'calendar/new', 'chat', 'setlists', 'more', 'settings', 'settings/band', 'members', 'search']
problems = 0


def check(pg, label):
    global problems
    found = pg.evaluate(CHECK, LONG)
    log(f'{label:28}', 'ok' if not found else f'{len(found)} problem(s)')
    for f in found:
        log('   ', f)
    problems += len(found)


with session(width=int(sys.argv[1]) if len(sys.argv) > 1 else 360, height=740) as s:
    pg = s.pg
    for path in SCREENS:
        nav(pg, path, wait=900)
        check(pg, f'/{path}')
    # song screen (v1.1.0: song page and player in one) with a long recording name
    nav(pg, 'songs', wait=900)
    pg.get_by_role('link', name='Midnight Engine', exact=False).first.click(); pg.wait_for_timeout(1200)
    # infos panel; a second version → the version dropdown appears at the bottom
    pg.get_by_role('button', name='Infos zum Song').click(); pg.wait_for_timeout(400)
    check(pg, 'song screen: Infos')
    pg.get_by_role('button', name='Als Version hinzufügen').first.click(); pg.wait_for_timeout(1500)
    pg.get_by_role('dialog', name='Infos').get_by_role('button', name='Schließen').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Abspielen', exact=True).click(); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='A setzen').click(); pg.wait_for_timeout(2500)
    pg.get_by_role('button', name='B setzen').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Notiz hinzufügen').click(); pg.wait_for_timeout(300)
    for view in ['Üben', 'Songtext']:
        pg.get_by_text(view, exact=True).first.click(); pg.wait_for_timeout(500)
        check(pg, f'song screen: {view}')
    # the playable setlist (v1.2.0): setlist page with a song playing, own note with a long text, and the same list as a panel
    nav(pg, 'setlists', wait=600)
    pg.get_by_role('button', name='Neue Setlist').first.click()
    pg.get_by_role('dialog').get_by_role('button', name='Neue Setlist').click(); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Songs hinzufügen').click(); pg.wait_for_timeout(400)
    for box in pg.get_by_role('dialog', name='Songs hinzufügen').get_by_role('checkbox').all()[:3]:
        box.click()
    pg.get_by_role('dialog', name='Songs hinzufügen').get_by_role('button', name='Hinzufügen (3)', exact=True).click()
    pg.get_by_role('dialog', name='Songs hinzufügen').get_by_role('button', name='Schließen').click()
    pg.get_by_role('button', name='Speichern').click()
    pg.wait_for_url(re.compile(r'/setlists/s_[^/]+$'), timeout=10000)
    pg.locator('button[class*=modeMain]').nth(1).click(); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name=re.compile('^Aktionen für ')).nth(1).click()
    pg.get_by_role('menuitem', name='Meine Notiz').click()
    pg.get_by_role('dialog', name='Meine Notiz').get_by_role('textbox').fill(LONG[:80])
    pg.get_by_role('dialog', name='Meine Notiz').get_by_role('button', name='Speichern').click(); pg.wait_for_timeout(500)
    check(pg, 'setlist page: playing')
    pg.get_by_role('button', name='Fortsetzen').click(); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name=re.compile('^Setlist anzeigen')).click(); pg.wait_for_timeout(500)
    check(pg, 'song screen: setlist panel')

log('problems:', problems)
sys.exit(1 if problems else 0)
