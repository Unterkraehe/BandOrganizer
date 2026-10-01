"""No sideways scrolling on phones (R-UI-14): on a 360 px wide phone (or `overflow-check.py 320`), no screen and no scroll area inside it may be wider
than the screen. Long texts are simulated (a very long option in every <select>, e.g. a long recording file name).
Intentional sideways scrollers (filter/tab rows, PDF pages) are marked with `data-scroll-x` and skipped."""
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
    # song page + practice view with a long recording name (the practice controls only show while playing)
    nav(pg, 'songs', wait=900)
    pg.get_by_role('link', name='Midnight Engine', exact=False).first.click(); pg.wait_for_timeout(1200)
    # a second version → the version dropdown appears (song page and practice view)
    pg.get_by_role('button', name='Als Version hinzufügen').first.click(); pg.wait_for_timeout(1500)
    check(pg, 'song page')
    nav(pg, pg.url.split('/BandOrganizer/')[1] + '/practice', wait=1500)
    pg.get_by_role('button', name='Abspielen').first.click(); pg.wait_for_timeout(1500)
    check(pg, 'practice view (playing)')

log('problems:', problems)
sys.exit(1 if problems else 0)
