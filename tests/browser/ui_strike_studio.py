"""Strike Studio: real public routes, responsive screenshots and offline UI assets."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'browser-artifacts' / 'ui-strike-studio'
SEED = """for (const [id,v] of Object.entries({general:3,campaign:2,typing:1,endless:1,boss:1,leaderboards:1})) localStorage.setItem(`wordstrike.onboarding.${id}.v${v}`,'seen');"""
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

def capture(page, name, evidence):
    page.evaluate("""async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('img')].filter(img => img.getBoundingClientRect().width > 0)
        .map(img => img.decode().catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }""")
    geometry = page.evaluate('''() => ({width: innerWidth, overflow: document.documentElement.scrollWidth-innerWidth})''')
    assert geometry['overflow'] <= 1, (name, geometry)
    page.screenshot(path=str(OUT / f'{name}.png'), full_page=True)
    evidence.append({'screen': name, **geometry})

def home(page, base):
    page.goto(base, wait_until='domcontentloaded')
    expect(page.locator('.title-screen[data-studio-ready="true"]')).to_be_visible(timeout=15000)

def certify(kind, base, evidence):
    browser = kind.launch()
    try:
        for width, height in [(1440,900),(390,844),(360,800)]:
            context = browser.new_context(viewport={'width':width,'height':height}, reduced_motion='reduce')
            context.add_init_script(SEED)
            context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
            page = context.new_page(); errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            prefix = f'{kind.name}-{width}'
            home(page, base)
            assert page.locator('.studio-headline').count() == 1
            assert page.locator('[data-title-index]').count() == 4
            reduced_transition_ms = page.locator('.title-start-button').evaluate("""el => Math.max(...getComputedStyle(el).transitionDuration.split(',').map(value => {
              const part = value.trim();
              return part.endsWith('ms') ? parseFloat(part) : parseFloat(part) * 1000;
            }))""")
            assert reduced_transition_ms <= 0.00101, reduced_transition_ms
            page.wait_for_function("document.querySelector('.title-brand-label img').naturalWidth > 0")
            capture(page, prefix+'-home', evidence)
            page.keyboard.press('ArrowDown')
            assert page.evaluate('document.activeElement.dataset.titleIndex') == '1'
            assert page.locator('.studio-headline').count() == 1
            page.keyboard.press('ArrowUp')
            page.locator('[data-action="modes"]').click()
            expect(page.locator('.studio-mode-art')).to_be_visible()
            for mode_id, index in [('campaign',0),('speed-test',1),('endless',2),('flow',3),('practice',4)]:
                if index: page.keyboard.press('ArrowDown')
                expect(page.locator('.mode-select-screen')).to_have_attribute('data-studio-mode',mode_id)
                assert page.locator('.studio-mode-art').count() == 1
                assert page.locator('.studio-mode-icon').count() == 5
                capture(page, prefix+'-mode-'+mode_id, evidence)
            page.locator('[data-mode-id="practice"]').click()
            expect(page.locator('[data-route="skill-map"]')).to_be_visible(timeout=15000)
            capture(page, prefix+'-practice', evidence)
            for label, action, target in [('profile','profile','.profile-stats-screen'),('settings','settings','.settings-screen'),('leaderboards','open-leaderboards','.leaderboards-screen')]:
                home(page,base);page.locator(f'[data-action="{action}"]').click()
                expect(page.locator(target)).to_be_visible(timeout=15000)
                capture(page,prefix+'-'+label,evidence)
            home(page,base);page.locator('[data-action="modes"]').click();page.locator('[data-mode-id="flow"]').click()
            expect(page.locator('[data-flow-integration-profile]')).to_be_visible(timeout=15000)
            expect(page.locator('[aria-label="Selected Flow run setup"]')).to_contain_text('3 sections')
            expect(page.locator('[aria-label="Selected Flow run setup"]')).to_contain_text('~5 min')
            capture(page,prefix+'-flow-setup',evidence)
            page.locator('[data-flow-action="start"]').click()
            expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
            sample=page.evaluate('window.wordstrikeFlowPhase1.getRunPlan().segments[0].text.slice(0,80)')
            page.keyboard.type(sample,delay=5)
            assert page.evaluate('window.wordstrikeFlowPhase1.getSnapshot().currentIndex') == len(sample)
            capture(page,prefix+'-flow-typing',evidence)
            assert not errors, (prefix,errors)
            context.close()
        # Real service worker + cold UI asset warmup + offline navigation.
        context=browser.new_context(viewport={'width':1280,'height':900})
        context.add_init_script(SEED)
        # Do not intercept same-origin requests: the browser must exercise its own SW fetch path.
        page=context.new_page();home(page,base)
        page.evaluate('navigator.serviceWorker.register("./sw.js")')
        page.evaluate('navigator.serviceWorker.ready')
        assert page.evaluate('''async () => {
          const ui=await import('./js/strikeStudioPresentation.js?v=20260918a');
          return ui.warmStudioAssets();
        }''') is True
        await_assets=page.evaluate('''async () => {
          const c=await caches.open('wordstrike-ui-studio-20260918a');
          return (await c.keys()).map(r=>r.url);
        }''')
        assert len(await_assets)==2, await_assets
        page.reload(wait_until='domcontentloaded');expect(page.locator('.studio-headline')).to_be_visible(timeout=15000)
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        assert page.evaluate("async () => Boolean(await caches.match(new URL('./index.html', location.href).href))")
        context.set_offline(True);page.reload(wait_until='domcontentloaded')
        expect(page.locator('.studio-headline')).to_be_visible(timeout=15000)
        assert page.evaluate("getComputedStyle(document.querySelector('.studio-headline')).fontWeight")=='900'
        evidence.append({'screen':kind.name+'-offline','assets':await_assets,'passed':True})
        context.close()
    finally:
        browser.close()

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/';evidence=[]
    try:
        with sync_playwright() as p:
            for kind in (p.chromium,p.firefox): certify(kind,base,evidence)
    finally:
        server.shutdown();server.server_close()
        (OUT/'evidence.json').write_text(json.dumps(evidence,indent=2))
    print(f'PASS: {len(evidence)} visual/public-route/offline checks')

if __name__=='__main__': main()
