"""Flow Phase 4 cadence and natural-typing browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase4"

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


def open_flow(page, base, passage="dialogue-natural-01"):
    page.goto(base + f'?dev=1&mode=flow&flowPassage={passage}')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()


def type_character(page, character):
    page.keyboard.type(character)


def certify_cadence(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_flow(page, base)

    passage = page.locator('[data-flow-passage]').get_attribute('aria-label')
    assert passage and len(passage) > 70

    # Establish a personal baseline, then create one clear relative pause.
    for character in passage[:12]:
        type_character(page, character)
        page.wait_for_timeout(45)
    expect(page.locator('[data-flow-cadence]')).not_to_have_text('—')
    page.wait_for_timeout(650)
    type_character(page, passage[12])

    # Create one repaired mistake. Its repair gap must be correction cost, not
    # another cadence pause.
    wrong = 'x' if passage[13] != 'x' else 'z'
    type_character(page, wrong)
    page.wait_for_timeout(140)
    page.keyboard.press('Backspace')
    page.wait_for_timeout(140)
    type_character(page, passage[13])

    for character in passage[14:]:
        type_character(page, character)
        page.wait_for_timeout(18)

    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=15000)
    snapshot = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    cadence = snapshot['cadence']
    assert cadence['cadenceScore'] is not None, cadence
    assert 0 <= cadence['cadenceScore'] <= 100, cadence
    assert cadence['baselineIntervalMs'] > 0, cadence
    assert cadence['pauseThresholdMs'] >= 500, cadence
    assert cadence['pauseCount'] >= 1, cadence
    assert cadence['correctionCost']['count'] == 1, cadence
    assert cadence['correctionCost']['totalMs'] >= 100, cadence
    assert cadence['rawWpm'] > 0 and cadence['finalWpm'] > 0, cadence
    assert len(cadence['featureLatencies']) >= 4, cadence
    assert len(cadence['slowestHesitations']) > 0, cadence
    assert snapshot['gameplay']['score'] > 0, snapshot['gameplay']
    assert not errors, errors

    expect(page.locator('.flow-natural-analysis')).to_be_visible()
    expect(page.locator('.flow-natural-analysis')).to_contain_text('Baseline key interval')
    expect(page.locator('[data-flow-final-score]')).to_be_visible()

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-results.png'), full_page=True)
    evidence.append({
        'browser': browser_name,
        'case': 'relative cadence + pause + correction + natural-language hesitation',
        'cadenceScore': cadence['cadenceScore'],
        'pauseCount': cadence['pauseCount'],
        'correctionMs': cadence['correctionCost']['totalMs'],
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
    assert page.locator('[data-flow-view="ready"]').count() == 0
    evidence.append({'browser': browser_name, 'case': 'released public Flow is available without auto-launching Phase 4'})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_flow(page, base, 'everyday-natural-01')
    passage = page.locator('[data-flow-passage]').get_attribute('aria-label')
    for character in passage[:14]:
        type_character(page, character)
        page.wait_for_timeout(25)
    geometry = page.evaluate("""() => {
      const hud = document.querySelector('.flow-gameplay-hud');
      const cadence = document.querySelector('.flow-cadence-block');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        hudRight: hud.getBoundingClientRect().right,
        viewport: document.documentElement.clientWidth,
        cadenceWidth: cadence.getBoundingClientRect().width,
      };
    }""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['hudRight'] <= geometry['viewport'] + 1, geometry
    assert geometry['cadenceWidth'] > 0, geometry
    expect(page.locator('[data-flow-cadence]')).not_to_have_text('—')
    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-cadence.png'), full_page=True)
    evidence.append({'browser': browser_name, 'case': '390px live cadence HUD', **geometry})
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
                certify_cadence(browser, name, base, evidence)
                certify_public_gate(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 4 browser scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
