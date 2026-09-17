"""Flow Phase 9 modifier certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase9"

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


def route(base, modifiers=""):
    url = (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1&flowModifiers=1"
        + "&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=phase9-modifiers"
    )
    if modifiers:
        url += f"&flowModifierIds={modifiers}"
    return url


def choice(page, modifier_id):
    return page.locator(f'[data-flow-modifier-id="{modifier_id}"]')


def open_setup(page, base, modifiers=""):
    page.goto(route(base, modifiers), wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-modifier-setup]')).to_be_visible(timeout=10000)
    assert page.evaluate('window.wordstrikeFlowModifiersPhase9.enabled') is True


def certify_setup_and_rules(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_setup(page, base)

    assert page.locator('[data-flow-modifier-id]').count() == 8

    # Conflicts are replacement groups, not invalid states.
    choice(page, 'calm').click()
    expect(choice(page, 'calm')).to_have_attribute('aria-pressed', 'true')
    choice(page, 'precision').click()
    expect(choice(page, 'calm')).to_have_attribute('aria-pressed', 'false')
    expect(choice(page, 'precision')).to_have_attribute('aria-pressed', 'true')

    choice(page, 'dialogue').click()
    choice(page, 'symbols').click()
    expect(choice(page, 'dialogue')).to_have_attribute('aria-pressed', 'false')
    expect(choice(page, 'symbols')).to_have_attribute('aria-pressed', 'true')

    choice(page, 'longform').click()
    choice(page, 'sprint').click()
    expect(choice(page, 'longform')).to_have_attribute('aria-pressed', 'false')
    expect(choice(page, 'sprint')).to_have_attribute('aria-pressed', 'true')

    choice(page, 'no-backspace').click()
    choice(page, 'clean-run').click()
    draft = page.evaluate('window.wordstrikeFlowModifiersPhase9.getDraft()')
    assert draft == ['precision', 'symbols', 'sprint', 'no-backspace', 'clean-run'], draft
    expect(page.locator('[data-flow-modifier-selection]')).to_contain_text('5 active')
    expect(page.locator('[data-flow-modifier-dock]')).to_have_text('5 modifiers')
    expect(page.locator('[data-flow-action="start"]')).to_have_text('START UPDATED RUN')

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-setup.png'), full_page=True)

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)

    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['modifiers'] == draft, plan
    assert plan['chapterCount'] == 3, plan
    assert plan['passageCount'] == 3, plan
    assert plan['targetMinutes'] == 2, plan
    assert 'flowUiStart' not in page.url, page.url

    strip = page.locator('[data-flow-modifier-strip]')
    expect(strip).to_be_visible()
    assert strip.locator('strong').count() == 5

    # No Backspace is an engine rule, not a cosmetic button state.
    first = plan['segments'][0]['text'][0]
    page.keyboard.type(first)
    before = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    page.keyboard.press('Backspace')
    after = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    assert after['currentIndex'] == before['currentIndex'] == 1, (before, after)
    assert after['blockedBackspaces'] == 1, after
    expect(page.locator('[data-flow-modifier-status]')).to_have_text('Backspace disabled')

    # Finish the sprint run without raw mistakes so Clean Run is earned.
    for index, segment in enumerate(plan['segments']):
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        text = segment['text']
        if index == 0:
            text = text[1:]
        page.keyboard.type(text)
        if index < len(plan['segments']) - 1:
            expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
            expect(page.locator('[data-flow-modifier-strip]')).to_be_visible()
            page.locator('[data-flow-action="continue-chapter"]').click()

    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-modifier-results]')).to_be_visible()
    expect(page.locator('[data-flow-modifier-score-line]')).to_contain_text('modifiers')
    snapshot = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    breakdown = snapshot['gameplay']['scoreBreakdown']
    assert abs(breakdown['modifierMultiplier'] - 1.8362) < 0.0001, breakdown
    clean = next(entry for entry in breakdown['modifierEntries'] if entry['id'] == 'clean-run')
    assert clean['achieved'] is True, clean
    assert clean['appliedMultiplier'] == 1.2, clean
    assert not errors, errors

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-results.png'), full_page=True)

    evidence.append({
        "browser": browser_name,
        "case": "conflicts → canonical handoff → sprint → no-backspace → clean-run results",
        "modifiers": draft,
        "passages": plan['passageCount'],
        "modifierMultiplier": breakdown['modifierMultiplier'],
    })
    context.close()


def certify_isolation(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()

    # Phase 8 remains unchanged without the explicit modifier gate.
    phase8 = (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1"
        + "&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=phase9-isolation"
    )
    page.goto(phase8, wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    assert page.locator('[data-flow-modifier-setup]').count() == 0
    assert page.locator('[data-flow-modifier-strip]').count() == 0

    # Released public Flow is available, but Mode Select alone must not mount modifiers.
    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    assert flow.get_attribute('aria-disabled') is None
    assert flow.evaluate('el => el.tagName') == 'BUTTON'
    assert page.locator('[data-flow-modifier-setup]').count() == 0

    evidence.append({"browser": browser_name, "case": "Phase 9 developer gate preserves Phase 8 while released Flow is available"})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_setup(page, base)
    geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      setupWidth: document.querySelector('[data-flow-modifier-setup]').getBoundingClientRect().width,
      buttonWidth: document.querySelector('[data-flow-modifier-id]').getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
    })""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['setupWidth'] <= geometry['viewport'], geometry
    assert geometry['buttonWidth'] <= geometry['viewport'], geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-setup.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px modifier setup", **geometry})
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
                certify_setup_and_rules(browser, name, base, evidence)
                certify_isolation(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 9 modifier scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
