"""Every control answers at once (R-UX-10): taps every button, link, tab, chip and menu item on every screen (phone,
demo mode with simulated HiDrive latency) and measures when the page first changes after the tap.

  ok    – something changed within 150 ms (pressed state aside: highlight, new screen, dialog, optimistic result, "Wird …")
  late  – the first change came only after the simulated HiDrive latency (the tap showed nothing while saving/loading)
  dead  – nothing changed within 1.5 s

Also lists controls the global touch pressed state (`base.css`, `:active`) doesn't reach.
Rows that repeat (song list, cards) are sampled. Skipped: Demo beenden, Abmelden, printing, microphone; file pickers are
listed as "manual" (a script can't open them). Usage: `feedback-check.py [latency_ms] [path filter]` (default 400, all screens)."""
import re
import sys

from common import log, nav, session

LATENCY = int(sys.argv[1]) if len(sys.argv) > 1 else 400
ONLY = sys.argv[2] if len(sys.argv) > 2 else ''  # e.g. "chat": only screens whose path contains it
FAST_MS, WAIT_MS = 150, 1500
SKIP = re.compile(r'Demo beenden|Abmelden|Verbindung trennen|Drucken|Sprachnotiz aufnehmen|Aufnahme', re.I)
MANUAL = re.compile(r'hochladen|Datei|Aus HiDrive wählen|Foto|Bild wählen|importieren', re.I)
PER_KEY = 2  # repeated rows: probe this many of each kind
# confirmations that would remove the seeded content for later screens: listed for review instead of tapped
DESTRUCTIVE = re.compile(r'^(Löschen|Entfernen|Archivieren|Zusammenführen|Absagen|Deaktivieren|Endgültig)', re.I)
OVERLAY = '[role=dialog], [role=alertdialog], [role=menu]'
BACK = re.compile(r'^(Zurück|Abbrechen)$')  # need a different previous screen to show their effect

MARK = """(scope) => {
  const SEL = 'button, a[href], [role=tab], [role=menuitem], summary, input[type=checkbox], input[type=radio]';
  const root = scope ? [...document.querySelectorAll(scope)].pop() : document;
  if (!root) return [];
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[aria-hidden=true], [inert]'); };
  const label = (el) => (el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent || el.title || '')
    .replace(/\\s+/g, ' ').trim().slice(0, 60);
  const cls = (el) => (typeof el.className === 'string' ? el.className.split(' ')[0] : '').replace(/_[a-z0-9]{5}_\\d+$/i, '');
  const pressed = (el) => el.matches('button, a[href], summary, [role=menuitem], input');
  const current = (el) => (el.type === 'radio' && el.checked) || (el.getAttribute('aria-current') || 'false') !== 'false' || el.getAttribute('aria-selected') === 'true';
  const out = [];
  document.querySelectorAll('[data-qa-i]').forEach((el) => el.removeAttribute('data-qa-i'));
  [...root.querySelectorAll(SEL)].filter(visible).filter((el) => scope || !el.closest('[role=dialog], [role=alertdialog], [role=menu]')).forEach((el, i) => {
    el.setAttribute('data-qa-i', i);
    const row = el.closest('li, [role=row]');
    const href = el.getAttribute('href') || '';
    const l = label(el);
    const key = [el.tagName, cls(el), row ? cls(row) : '', href.replace(/[a-z]_[A-Za-z0-9]+|\\d+/g, ':id'),
      row ? l.split(' ')[0] : l.replace(/\\d+/g, '#')].join('|');
    out.push({ i, label: l, key, current: current(el), pressed: pressed(el),
      external: el.tagName === 'A' && (el.origin !== location.origin || el.target === '_blank'),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true' });
  });
  return out;
}"""

PROBE = """async ({ i, label, wait }) => {
  const el = document.querySelector(`[data-qa-i="${i}"]`);
  if (!el) return { status: 'gone' };
  const now = (el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent || el.title || '')
    .replace(/\\s+/g, ' ').trim().slice(0, 60);
  if (now !== label) return { status: 'gone' };
  const url = location.href, checked = el.checked;
  let first = null;
  const t0 = performance.now();
  const mo = new MutationObserver((list) => {
    if (first === null && list.some((m) => !(m.type === 'attributes' && m.attributeName === 'data-qa-i'))) first = performance.now() - t0;
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  el.click();
  await new Promise((resolve) => {
    const tick = () => (first !== null || location.href !== url || el.checked !== checked || performance.now() - t0 > wait ? resolve() : setTimeout(tick, 10));
    tick();
  });
  mo.disconnect();
  const t = first ?? (location.href !== url || el.checked !== checked ? performance.now() - t0 : null);
  const around = el.closest('[role=region], li, section, form, main');  // what the user saw, for dead/late taps
  return { status: t === null ? 'dead' : t <= %d ? 'ok' : 'late', ms: t === null ? null : Math.round(t),
    context: around ? around.innerText.replace(/\\s+/g, ' ').trim().slice(0, 90) : '' };
}""" % FAST_MS

results = {'ok': 0, 'current': 0, 'late': [], 'dead': [], 'manual': [], 'nopress': []}


def here(pg):
    return pg.url.split('/BandOrganizer', 1)[1].lstrip('/')


def restore(pg, path):
    for _ in range(2):
        pg.keyboard.press('Escape')
    if '/BandOrganizer' not in pg.url:
        raise RuntimeError(f'left the app at {path}: {pg.url}')
    if here(pg) != path or pg.locator(OVERLAY).count():
        nav(pg, path, 500)


def open_overlay(pg, opener):
    """Taps the control labelled `opener` on the screen; True when a dialog or menu is open afterwards."""
    for c in pg.evaluate(MARK, None):
        if c['label'] == opener:
            pg.evaluate("(i) => document.querySelector(`[data-qa-i=\"${i}\"]`).click()", c['i'])
            pg.wait_for_timeout(LATENCY + 300)
            return pg.locator(OVERLAY).count() > 0
    return False


def probe_all(pg, path, label, opener=None):
    """Probes every control on the screen, or inside the overlay that `opener` opens. Returns labels of openers."""
    restore(pg, path)
    if opener and not open_overlay(pg, opener):
        return []
    scope = OVERLAY if opener else None
    where = f'{label} › {opener}' if opener else label
    seen, openers, probed = {}, [], 0
    for c in pg.evaluate(MARK, scope):
        if c['disabled']:
            continue
        if not c['pressed']:
            results['nopress'].append(f"{where}: {c['label']!r}")
        seen[c['key']] = seen.get(c['key'], 0) + 1
        if seen[c['key']] > PER_KEY or SKIP.search(c['label']) or c['external']:  # external links would end the demo
            continue
        if c['current']:
            results['current'] += 1
            continue
        if MANUAL.search(c['label']) or (opener and DESTRUCTIVE.search(c['label'])):
            results['manual'].append(f"{where}: {c['label']!r}")
            continue
        if not opener and BACK.search(c['label']):
            nav(pg, 'more', 300)
            nav(pg, path, 600)
        restore(pg, path)
        if opener and not open_overlay(pg, opener):
            break
        pg.evaluate(MARK, scope)
        r = pg.evaluate(PROBE, {'i': c['i'], 'label': c['label'], 'wait': WAIT_MS})
        probed += 1
        if r['status'] == 'ok':
            results['ok'] += 1
            if not opener and pg.locator(OVERLAY).count():
                openers.append(c['label'])
        elif r['status'] in ('late', 'dead'):
            entry = f"{where}: {c['label']!r}" + (f" ({r['ms']} ms)" if r['ms'] else '') + (f" – shown: {r['context']!r}" if r.get('context') else '')
            results[r['status']].append(entry)
            log(r['status'].upper(), entry)
        pg.wait_for_timeout(LATENCY + 100)  # let a running save finish before the next tap
    log(f'{where[:60]:60} {probed} probed')
    return openers


def check_screen(pg, path):
    label = '/' + path
    nav(pg, path, 900)
    for opener in probe_all(pg, path, label):
        probe_all(pg, path, label, opener)
    restore(pg, path)


def seed(pg):
    """An event, a setlist, a note and a chat message, so their screens have content. Returns their paths."""
    nav(pg, 'calendar/new?type=gig')
    pg.get_by_label('Titel').fill('Stadtfest')
    pg.get_by_role('button', name='Speichern').click()
    pg.wait_for_url(re.compile(r'/calendar/e_'), timeout=10000)
    event = here(pg)
    nav(pg, 'songs', 900)
    pg.locator('a[href*="/songs/"]').first.click()
    pg.wait_for_url(re.compile(r'/songs/[^/?]+$'), timeout=10000)
    song = here(pg)
    nav(pg, 'setlists', 600)
    pg.get_by_role('button', name='Neue Setlist').first.click()
    pg.get_by_role('dialog').get_by_role('button', name='Neue Setlist').click()
    pg.wait_for_url(re.compile(r'/edit'), timeout=10000)
    pg.get_by_role('button', name='Songs hinzufügen').first.click()
    pg.get_by_role('dialog').get_by_role('checkbox').first.check()
    pg.get_by_role('dialog').get_by_role('button', name='Hinzufügen (1)', exact=True).click()
    pg.get_by_role('dialog').get_by_role('button', name='Schließen').click()
    pg.get_by_role('button', name='Speichern').click()
    pg.wait_for_url(re.compile(r'/setlists/s_[^/]+$'), timeout=10000)
    setlist = here(pg)
    nav(pg, 'chat', 800)
    pg.get_by_role('textbox', name='Nachricht an die Band …').fill('Hallo Band')
    pg.get_by_role('button', name='Senden').click()  # Enter adds a line on phones
    pg.wait_for_timeout(4 * LATENCY + 500)
    return event, song, setlist


with session(query=f'?demo-songs=12&demo-latency={LATENCY}') as s:
    pg = s.pg
    event, song, setlist = seed(pg)
    for path in ['', 'songs', song, f'{song}?tab=notes', f'{song}?tab=versions', f'{song}?tab=infos', f'{song}/edit',
                 f'{song}/lyrics', 'songs/new', 'calendar', 'calendar/new', event, f'{event}/edit', 'chat', 'setlists', setlist,
                 f'{setlist}/edit', f'{setlist}/stage', 'more', 'settings', 'settings/band', 'settings/tags', 'members',
                 'profile', 'calendar/subscribe', 'search']:
        if ONLY in path:
            check_screen(pg, path)
    # the player opens from the mini player
    nav(pg, song, 900)
    pg.get_by_role('button', name='Abspielen').first.click()
    pg.wait_for_timeout(800)
    check_screen(pg, 'player')

print()
print(f"ok: {results['ok']}  already selected: {results['current']}  late: {len(results['late'])}  dead: {len(results['dead'])}  "
      f"manual: {len(results['manual'])}  without touch pressed state: {len(results['nopress'])}")
for kind in ('late', 'dead', 'manual', 'nopress'):
    if results[kind]:
        print(f'\n{kind}:')
        for line in dict.fromkeys(results[kind]):
            print('  ', line)
