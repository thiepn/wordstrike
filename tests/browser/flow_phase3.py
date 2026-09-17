"""Flow Phase 3 gameplay browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase3"

ONBOARDING_SEED = """(() => {
  for (const [id, version] of Object.entries({general:3,campaign:2,typing:1,endless:1,boss:1,leaderboards:1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def context_for(browser, base, width=1440, height=900):
    context = browser.new_context(viewport={"width": width, "height": height})
    context.add_init_script(ONBOARDING_SEED)
    local_only(context, base)
    return context


def open_run(page, base):
    page.goto(base + '?dev=1&mode=flow')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()
    return page.locator('[data-flow-passage]').get_attribute('aria-label')


def certify_gameplay(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    passage = open_run(page, base)
    assert passage and len(passage) > 100

    expect(page.locator('[data-flow-value]')).to_have_text('60')
    expect(page.locator('[data-flow-momentum]')).to_have_text('×1.0')
    expect(page.locator('[data-flow-score]')).to_have_text('0')
    expect(page.locator('[data-flow-meter]')).to_have_attribute('aria-valuenow', '60')

    prefix = passage[:25]
    page.keyboard.type(prefix)
    clean = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot().gameplay')
    assert clean['flowValue'] > 60, clean
    assert clean['momentum'] >= 1.2, clean
    assert clean['score'] > 0, clean
    assert clean['accuracyPercent'] == 100, clean

    wrong = 'x' if passage[25] != 'x' else 'z'
    page.keyboard.type(wrong)
    damaged = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot().gameplay')
    assert damaged['flowValue'] < clean['flowValue'], (clean, damaged)
    assert damaged['momentumCharge'] < clean['momentumCharge'], (clean, damaged)
    assert damaged['accuracyPercent'] < 100, damaged
    assert damaged['score'] < clean['score'], (clean, damaged)

    page.keyboard.press('Backspace')
    recovered = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot().gameplay')
    assert recovered['flowValue'] > damaged['flowValue'], (damaged, recovered)
    assert recovered['flowValue'] < clean['flowValue'], (clean, recovered)
    assert recovered['momentumCharge'] > damaged['momentumCharge'], (damaged, recovered)

    page.keyboard.type(passage[25])
    retyped = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot().gameplay')
    assert retyped['flowValue'] == recovered['flowValue'], (recovered, retyped)
    assert retyped['momentumCharge'] == recovered['momentumCharge'], (recovered, retyped)

    page.keyboard.type(passage[26:])
    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
    snapshot = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    gameplay = snapshot['gameplay']
    breakdown = gameplay['scoreBreakdown']
    assert gameplay['score'] > 0, gameplay
    assert gameplay['finalFlow'] == gameplay['flowValue'], gameplay
    assert gameplay['finalMomentum'] == gameplay['momentum'], gameplay
    assert gameplay['peakMomentum'] >= 1.2, gameplay
    assert gameplay['accuracyPercent'] < 100, gameplay
    recomputed = round(
        breakdown['characterBase']
        * breakdown['difficultyMultiplier']
        * breakdown['accuracyMultiplier']
        * breakdown['flowMultiplier']
        * breakdown['averageMomentum']
    )
    assert recomputed == gameplay['score'], (breakdown, gameplay['score'], recomputed)
    expect(page.locator('[data-flow-final-score]')).to_have_text(f"{gameplay['score']:,}")
    assert not errors, errors

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-results.png'), full_page=True)
    evidence.append({
        'browser': browser_name,
        'case': 'Flow Meter + Momentum recovery + transparent score',
        'score': gameplay['score'],
        'averageFlow': gameplay['averageFlow'],
        'peakMomentum': gameplay['peakMomentum'],
    })
    context.close()


def certify_public_gate(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(base)
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    assert flow.get_attribute('aria-disabled') is None
    assert flow.evaluate('el => el.tagName') == 'BUTTON'
    assert page.locator('[data-flow-view]').count() == 0
    evidence.append({'browser': browser_name, 'case': 'released public Flow is available without auto-launching Phase 3'})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_run(page, base)
    geometry = page.evaluate("""() => {
      const hud=document.querySelector('.flow-gameplay-hud');
      const meter=document.querySelector('[data-flow-meter]');
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        hudWidth:hud.getBoundingClientRect().width,
        meterWidth:meter.getBoundingClientRect().width,
        meterNow:meter.getAttribute('aria-valuenow'),
        meterMax:meter.getAttribute('aria-valuemax'),
      };
    }""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['hudWidth'] <= 390, geometry
    assert geometry['meterWidth'] > 100, geometry
    assert geometry['meterNow'] == '60' and geometry['meterMax'] == '100', geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-hud.png'), full_page=True)
    evidence.append({'browser': browser_name, 'case': '390px gameplay HUD', **geometry})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}/"
    evidence = []
    try:
        with sync_playwright() as p:
            for browser_type in (p.chromium, p.firefox):
                browser = browser_type.launch()
                name = browser_type.name
                certify_gameplay(browser, name, base, evidence)
                certify_public_gate(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 3 browser scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
