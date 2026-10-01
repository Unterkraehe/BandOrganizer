"""Optimistic updates: with every storage call taking 250 ms the UI must still react at once; no sideways scrolling on the song page."""
import sys

from common import log, nav, session

with session(query='?demo-latency=250') as s:
    pg = s.pg
    pg.wait_for_timeout(2500)
    nav(pg, 'songs'); pg.wait_for_selector('text=Midnight Engine', timeout=30000); pg.wait_for_timeout(1500)
    pg.get_by_role('link', name='Midnight Engine', exact=False).first.click(timeout=30000); pg.wait_for_timeout(2500)
    pg.get_by_role('tab', name='Versionen').click(); pg.wait_for_timeout(500)  # song page tabs (v0.17.0)
    ms = pg.evaluate("""async () => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Als Version hinzufügen'));
      if (!b) return -1;
      const t0 = performance.now(); b.click();
      while (document.body.innerText.includes('Als Version hinzufügen') && performance.now() - t0 < 5000) await new Promise(r => requestAnimationFrame(r));
      return Math.round(performance.now() - t0); }""")
    log('version suggestion gone after (ms):', ms)
    pg.evaluate("""() => { const sel = document.querySelector('select'); if (sel) { const o = document.createElement('option'); o.textContent = '01-Holy Diver Intro edit 05 ohne Intro – extra long version name for testing.mp3'; sel.appendChild(o); } }""")
    pg.wait_for_timeout(300)
    width, inner = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]')
    log('page width vs viewport with a very long option:', width, inner)
    sys.exit(0 if 0 <= ms < 300 and width <= inner else 1)
