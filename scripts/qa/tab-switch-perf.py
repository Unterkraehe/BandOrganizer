"""Tab tap → content with 300 songs at 4× CPU slowdown. Target: < 150 ms (R-UI-13)."""
from common import log, session

with session(query='?demo-songs=300', scheme='light', timeout=20000) as s:
    pg = s.pg
    cdp = s.cdp_session()
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
