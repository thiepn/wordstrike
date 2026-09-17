"""Flow Phase 10 adaptive weakness-training certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import quote
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase10"

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


def route(base, weaknesses="", autostart=False):
    url = (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1&flowAdaptive=1"
        + "&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=phase10-adaptive"
    )
    if weaknesses:
        url += "&flowWeaknesses=" + quote(weaknesses, safe="")
    if autostart:
        url += "&flowUiStart=1"
    return url


def open_calibration(page, base):
    page.goto(route(base), wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-adaptive="ready"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-adaptive="ready"]')).to_contain_text('Adaptive calibration')
    assert page.evaluate('window.wordstrikeFlowAdaptivePhase10.enabled') is True


def type_segment_with_pair_errors(page, text, remaining_errors):
    cursor = 0
    while remaining_errors > 0:
        index = text.find('e', cursor)
        if index < 0:
            break
        if index > cursor:
            page.keyboard.type(text[cursor:index])
        page.keyboard.type('r')
        page.keyboard.press('Backspace')
        page.keyboard.type('e')
        remaining_errors -= 1
        cursor = index + 1
    if cursor < len(text):
        page.keyboard.type(text[cursor:])
    return remaining_errors


def finish_quick_run_with_typo_pair(page, plan):
    remaining_errors = 2
    for index, segment in enumerate(plan['segments']):
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        remaining_errors = type_segment_with_pair_errors(page, segment['text'], remaining_errors)
        if index < len(plan['segments']) - 1:
            next_segment = plan['segments'][index + 1]
            if next_segment['chapterIndex'] != segment['chapterIndex']:
                expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
                page.locator('[data-flow-action="continue-chapter"]').click()
    assert remaining_errors == 0, "seeded quick run should contain at least two e characters"


def certify_learning_loop(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_calibration(page, base)

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-calibration.png'), full_page=True)

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['passageCount'] == 6, plan
    assert plan['adaptive']['enabled'] is False, plan

    finish_quick_run_with_typo_pair(page, plan)
    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-adaptive="results"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-weakness="typo-pair"]')).to_be_visible()
    profile = page.evaluate('window.wordstrikeFlowAdaptivePhase10.buildProfile()')
    typo = next(item for item in profile['weaknesses'] if item['key'] == 'typo-pair')
    assert typo['expected'] == 'e' and typo['actual'] == 'r', typo
    assert typo['errorCount'] == 2, typo

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-results.png'), full_page=True)

    page.locator('[data-flow-adaptive-next]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    assert 'flowWeaknesses=' in page.url, page.url
    adaptive_plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert adaptive_plan['adaptive']['enabled'] is True, adaptive_plan
    assert adaptive_plan['adaptive']['targetedPassageCount'] == 1, adaptive_plan
    assert adaptive_plan['adaptive']['normalPassageCount'] == 5, adaptive_plan
    focused = [segment for segment in adaptive_plan['segments'] if segment['adaptiveFocus']]
    assert len(focused) == 1, focused
    assert focused[0]['adaptiveFocus']['key'] == 'typo-pair', focused
    assert not errors, errors

    evidence.append({
        "browser": browser_name,
        "case": "calibration → repeated typo profile → adaptive next run",
        "weakness": typo['label'],
        "targeted": adaptive_plan['adaptive']['targetedPassageCount'],
        "normal": adaptive_plan['adaptive']['normalPassageCount'],
    })
    context.close()


def certify_preloaded_profile(browser, browser_name, base, evidence):
    profile = json.dumps([1, [["numbers", 84, None, None], ["apostrophes", 70, None, None]]], separators=(',', ':'))
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(route(base, profile), wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    ready = page.locator('[data-flow-adaptive="ready"]')
    expect(ready).to_be_visible(timeout=10000)
    expect(ready).to_contain_text('1 / 6 passages')
    expect(ready.locator('[data-flow-weakness="numbers"]')).to_be_visible()
    expect(ready.locator('[data-flow-weakness="apostrophes"]')).to_be_visible()
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['adaptive']['targetedPassageCount'] == 1, plan
    focus = next(segment for segment in plan['segments'] if segment['adaptiveFocus'])
    assert focus['adaptiveFocus']['key'] == 'numbers', focus

    evidence.append({"browser": browser_name, "case": "preloaded profile produces deterministic 80/20 focus slot"})
    context.close()


def certify_isolation_and_mobile(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    phase9 = (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1&flowModifiers=1"
        + "&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=phase10-isolation"
    )
    page.goto(phase9, wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    assert page.locator('[data-flow-adaptive]').count() == 0

    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    assert flow.get_attribute('aria-disabled') is None
    assert flow.evaluate('el => el.tagName') == 'BUTTON'
    assert page.locator('[data-flow-adaptive]').count() == 0
    context.close()

    if browser_name == 'chromium':
        profile = json.dumps([1, [["numbers", 84, None, None]]], separators=(',', ':'))
        mobile = context_for(browser, base, width=390, height=844)
        page = mobile.new_page()
        page.goto(route(base, profile), wait_until="domcontentloaded")
        expect(page.locator('[data-flow-adaptive="ready"]')).to_be_visible(timeout=10000)
        geometry = page.evaluate("""() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          adaptiveWidth: document.querySelector('[data-flow-adaptive="ready"]').getBoundingClientRect().width,
          viewport: document.documentElement.clientWidth,
        })""")
        assert geometry['overflow'] <= 1, geometry
        assert geometry['adaptiveWidth'] <= geometry['viewport'], geometry
        page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-ready.png'), full_page=True)
        evidence.append({"browser": browser_name, "case": "390px adaptive ready + Phase 9/release isolation", **geometry})
        mobile.close()
    else:
        evidence.append({"browser": browser_name, "case": "Phase 9/release isolation"})


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
                certify_learning_loop(browser, name, base, evidence)
                certify_preloaded_profile(browser, name, base, evidence)
                certify_isolation_and_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 10 adaptive scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
