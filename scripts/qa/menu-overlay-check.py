"""⋯ menus: drawn above everything, fully on screen, also for the last row (archive section) – phone, both themes."""
import sys

from common import log, nav, session

ok = True
for scheme in ['dark', 'light']:
    with session(query='', scheme=scheme) as s:
        pg = s.pg
        nav(pg, 'songs'); pg.wait_for_selector('text=Slow Burn (Probe)')
        pg.get_by_role('button', name='Weitere Aktionen für Slow Burn (Probe)').click(); pg.get_by_role('menuitem', name='Archivieren').click(); pg.wait_for_timeout(500)
        pg.get_by_role('button', name='Archivierte Songs anzeigen', exact=False).click(); pg.wait_for_timeout(400)
        pg.mouse.wheel(0, 2000); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='Weitere Aktionen für Slow Burn (Probe)').click(); pg.wait_for_timeout(300)
        box = pg.get_by_role('menu').bounding_box()
        vw, vh = pg.evaluate('[innerWidth, innerHeight]')
        on_screen = box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= vw and box['y'] + box['height'] <= vh
        on_top = pg.evaluate(f"document.elementFromPoint({box['x'] + box['width'] / 2},{box['y'] + box['height'] / 2})?.closest('[role=menu]') !== null")
        log(scheme, 'menu box', {k: round(v) for k, v in box.items()}, 'on screen:', on_screen, 'on top:', on_top)
        ok = ok and on_screen and on_top
sys.exit(0 if ok else 1)
