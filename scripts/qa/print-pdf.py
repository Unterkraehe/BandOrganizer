"""Builds a sample setlist in the demo (blocks, announcements, DIREKT arrows, pause box) and prints it to a PDF.

  python3 scripts/qa/print-pdf.py [out.pdf]        (default: /tmp/setlist.pdf)

Look at the PDF with `pdftoppm -r 70 -png out.pdf page` – the printed layout (docs/features/16-setlists.md) can only be judged visually.
"""
import sys

from common import log, nav, session

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/setlist.pdf'
with session(query='?demo-songs=40', scheme='dark', width=1280, height=900, mobile=False) as s:
    pg = s.pg
    # artists for a few songs (printed in the "Interpret" column)
    for title, artist in [('Open Road', 'Accept'), ('Rust and Thunder', 'Kiss'), ('Midnight Engine', 'Saxon'), ('Slow Burn (Probe)', 'Guns’n Roses')]:
        nav(pg, 'songs'); pg.get_by_role('link', name=title, exact=False).first.click(); pg.wait_for_timeout(400)
        pg.get_by_role('button', name='Bearbeiten').first.click(); pg.wait_for_timeout(300)
        pg.get_by_label('Interpret').fill(artist); pg.get_by_role('button', name='Speichern').click(); pg.wait_for_timeout(400)
    nav(pg, 'setlists'); pg.get_by_role('button', name='Neue Setlist').first.click()
    dlg = pg.get_by_role('dialog'); dlg.get_by_role('textbox', name='Name').fill('Beimerstetten'); dlg.get_by_role('button', name='Neue Setlist').click(); pg.wait_for_timeout(600)
    pg.get_by_label('Name des Blocks').first.fill('Block 1')
    used = set()

    def add(names):
        for n in names:
            pg.get_by_role('checkbox', name=f'{n} auswählen').check()
        pg.get_by_role('button', name=f'Hinzufügen ({len(names)})', exact=True).click(); pg.wait_for_timeout(200)

    def add_any(k):
        boxes = pg.get_by_role('checkbox', name='auswählen')
        n = 0
        for i in range(boxes.count()):
            label = boxes.nth(i).get_attribute('aria-label')
            if label in used or 'Demo' in label or 'Live' in label:
                continue
            boxes.nth(i).check(); used.add(label); n += 1
            if n == k:
                break
        pg.get_by_role('button', name=f'Hinzufügen ({k})', exact=True).click(); pg.wait_for_timeout(200)

    def interlude(text, note):
        pg.get_by_role('button', name='Zwischenpunkt').last.click()
        pg.get_by_role('textbox', name='Zwischenpunkt').last.fill(text)
        pg.get_by_role('textbox', name='Info / Bemerkung').last.fill(note)

    def segue(indices):
        for i in indices:
            pg.locator('[data-entry-id]').nth(i).get_by_role('button', name='Aktionen').click()
            item = pg.get_by_role('menuitem', name='Direkt weiter')
            item.click() if item.count() else pg.keyboard.press('Escape')
            pg.wait_for_timeout(150)

    add(['Open Road', 'Rust and Thunder', 'Midnight Engine'])
    interlude('Begrüßung', '')
    add(['Slow Burn (Probe)', 'Neon Nights (Demo)', 'Midnight Engine (Live)'])
    interlude('Ansage', 'Overload_Logo')
    add_any(1)
    segue([0, 1])
    pg.locator('[data-entry-id]').nth(1).locator('button').nth(1).click(); pg.wait_for_timeout(150)
    pg.get_by_role('textbox', name='Info / Bemerkung').first.fill('KISS_Video')
    pg.get_by_role('button', name='Block hinzufügen').click(); pg.wait_for_timeout(300)
    pg.get_by_role('textbox', name='Text für die Pause').first.fill('Pausenmusik!!!')
    pg.get_by_label('Name des Blocks').last.fill('Block 2')
    for k, text, note in [(3, 'Ansage', 'Overload_Logo.JPG'), (5, 'Ansage', ''), (5, 'Ansage', 'Overload_Logo.JPG'), (2, 'Ansage', '')]:
        add_any(k); interlude(text, note)
    add_any(1)
    segue([8, 9, 12])
    pg.get_by_role('button', name='Speichern').click(); pg.wait_for_timeout(700)
    nav(pg, pg.evaluate('location.pathname').replace('/edit', '/print').replace('/BandOrganizer/', ''), wait=800)
    pg.emulate_media(media='print', color_scheme='light')
    pg.pdf(path=out, format='A4', print_background=True, prefer_css_page_size=True)
    log('PDF written:', out)
