import time
from playwright.sync_api import sync_playwright
base='http://localhost:4173/BandOrganizer/?demo-songs=300'
T=time.time()
def log(*a): print(round(time.time()-T,1), *a, flush=True)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
    pg=ctx.new_page(); pg.set_default_timeout(20000)
    cdp=ctx.new_cdp_session(pg)
    pg.on('pageerror', lambda e: log('PAGEERROR', str(e)[:200]))
    pg.goto(base); log('loaded')
    pg.get_by_role('button', name='Demo ausprobieren').click(); log('demo clicked')
    pg.get_by_role('textbox', name='Bandname').fill('Overload'); pg.get_by_role('button', name='Band einrichten').click()
    pg.get_by_role('textbox', name='Name').fill('Lisa'); pg.get_by_role('button', name="Los geht's").click(); log('setup done')
    pg.wait_for_timeout(1500)
    cdp.send('Emulation.setCPUThrottlingRate',{'rate':4}); log('throttled 4x')
    pg.evaluate("""() => { window.__lt=[]; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']}); }""")
    def go(name, sel):
        pg.evaluate("window.__lt.length=0")
        r=pg.evaluate("""async ([name, sel]) => {
          const link=[...document.querySelectorAll('nav a')].find(a=>a.textContent.trim().startsWith(name));
          const t0=performance.now(); link.click();
          const dl=t0+6000;
          while(!document.querySelector(sel) && performance.now()<dl) await new Promise(r=>requestAnimationFrame(r));
          const t1=performance.now();
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          return [Math.round(t1-t0), Math.round(performance.now()-t0)];
        }""",[name,sel])
        pg.wait_for_timeout(700)
        log(name,'DOM ready / painted ms:',r,'long tasks:',pg.evaluate("window.__lt.slice()"))
    for name,sel in [('Songs','main a[href*="/songs/"]'),('Kalender','h1'),('Songs','main a[href*="/songs/"]'),('Chat','h1'),('Songs','main a[href*="/songs/"]'),('Start','h1')]:
        go(name,sel)
    b.close()
