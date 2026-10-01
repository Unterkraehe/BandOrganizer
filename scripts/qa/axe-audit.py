"""Accessibility audit with axe-core (WCAG 2 A/AA + best practices) on the main screens, phone dark + desktop light.

Exit code 1 if anything other than the intentional "zoom disabled" finding (meta-viewport) is reported.
Needs `npm install` (axe-core is a dev dependency).
"""
import pathlib
import sys

from common import log, nav, session

AXE = (pathlib.Path(__file__).resolve().parents[2] / 'node_modules/axe-core/axe.min.js').read_text()
SCREENS = ['', 'songs', 'songs/new', 'calendar', 'calendar/new?type=rehearsal', 'chat', 'setlists', 'search?q=open', 'settings', 'members', 'calendar/subscribe']
INTENTIONAL = {'meta-viewport'}  # pinch zoom is disabled on purpose; the text size setting compensates
RUN = """async () => { const r = await axe.run(document, { runOnly: ['wcag2a','wcag2aa','best-practice'] });
  return r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, n: v.nodes.length,
    where: v.nodes.slice(0, 4).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\\n').slice(1, 2).join(''))})); }"""

findings = {}
for label, kw in [('phone-dark', dict(scheme='dark')), ('desktop-light', dict(scheme='light', width=1280, height=900, mobile=False))]:
    with session(query='?demo-songs=10', **kw) as s:
        pg = s.pg
        nav(pg, 'calendar/new?type=gig'); pg.get_by_label('Titel').fill('Stadtfest'); pg.get_by_role('button', name='Speichern').click(); pg.wait_for_timeout(500)
        nav(pg, 'chat'); pg.get_by_role('textbox', name='Nachricht an die Band …').fill('Hallo'); pg.get_by_role('button', name='Senden').click(); pg.wait_for_timeout(400)
        pg.evaluate(AXE)
        for path in SCREENS:
            nav(pg, path, wait=900)
            for v in pg.evaluate(RUN):
                f = findings.setdefault(v['id'], {'impact': v['impact'], 'help': v['help'], 'where': []})
                f['where'].append(f"{label} /{path} ({v['n']}): " + ' | '.join(v['where'])[:400])
    log('done', label)

bad = {k: v for k, v in findings.items() if k not in INTENTIONAL}
for k, v in sorted(findings.items()):
    print(f"{'(intentional) ' if k in INTENTIONAL else ''}{k} [{v['impact']}] {v['help']}")
    for w in v['where'][:6]:
        print('   ', w)
print('RESULT:', 'no findings except intentional ones' if not bad else f'{len(bad)} rule(s) violated')
sys.exit(1 if bad else 0)
