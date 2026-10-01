"""Shared helpers for the phone/browser checks in this folder.

Needs: `npm run build`, `node scripts/serve.mjs start` (serves http://localhost:4173/BandOrganizer/),
`pip install playwright pillow` and `playwright install chromium`.
Override the address with the environment variable QA_URL.
"""
import os
import time
from contextlib import contextmanager
from types import SimpleNamespace

from playwright.sync_api import sync_playwright

BASE = os.environ.get('QA_URL', 'http://localhost:4173/BandOrganizer/')
_T0 = time.time()


def log(*args):
    print(round(time.time() - _T0, 1), *args, flush=True)


def nav(pg, path, wait=600):
    """Client-side navigation without reloading (history + popstate, like a link tap)."""
    pg.evaluate(f"history.pushState({{}},'', '/BandOrganizer/{path}'); dispatchEvent(new PopStateEvent('popstate'))")
    pg.wait_for_timeout(wait)


def open_demo(pg, query='', band='Overload', member='Lisa', settle=1500):
    """Welcome → demo → band setup → first profile; leaves the app on the start screen."""
    pg.goto(BASE + query)
    pg.get_by_role('button', name='Demo ausprobieren').click()
    pg.get_by_role('textbox', name='Bandname').fill(band)
    pg.get_by_role('button', name='Band einrichten').click()
    # exact=True: "Name" also matches the substring of "Bandname" in Playwright
    pg.get_by_role('textbox', name='Name', exact=True).fill(member)
    pg.get_by_role('button', name="Los geht's").click()
    pg.wait_for_timeout(settle)


@contextmanager
def session(query='?demo-songs=40', scheme='dark', width=390, height=844, mobile=True, demo=True,
            timeout=15000, channel=None, user_agent=None, permissions=None, origin=None):
    """Browser + page (phone-sized by default) with the demo already entered.

    Yields an object with .browser .ctx .pg and .cdp_session() (Chrome DevTools session, created on first use).
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=channel) if channel else p.chromium.launch()
        options = {'viewport': {'width': width, 'height': height}, 'color_scheme': scheme}
        if mobile:
            options.update(has_touch=True, is_mobile=True)
        if user_agent:
            options['user_agent'] = user_agent
        ctx = browser.new_context(**options)
        if permissions:
            ctx.grant_permissions(permissions, origin=origin)
        pg = ctx.new_page()
        pg.set_default_timeout(timeout)
        pg.on('pageerror', lambda e: log('PAGEERROR', str(e)[:200]))
        s = SimpleNamespace(browser=browser, ctx=ctx, pg=pg, _cdp=None)

        def cdp():
            if s._cdp is None:
                s._cdp = ctx.new_cdp_session(pg)
            return s._cdp

        s.cdp_session = cdp
        if demo:
            open_demo(pg, query)
        try:
            yield s
        finally:
            browser.close()
