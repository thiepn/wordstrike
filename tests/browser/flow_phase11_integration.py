"""Flow Phase 11 progression and integration certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase11"

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


def integrated_route(base, explicit=True):
    route = (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1&flowIntegration=1"
        + "&flowModifiers=1&flowAdaptive=1"
    )
    if explicit:
        route += "&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=phase11-integration&flowModifierIds=sprint"
    return route


def type_segment_with_pair_errors(page, text, error_state):
    chunk = []
    for character in text:
        if character == 'e' and error_state[0] < 2:
            if chunk:
                page.keyboard.type(''.join(chunk))
                chunk = []
            page.keyboard.type('r')
            page.keyboard.press('Backspace')
            page.keyboard.type('e')
            error_state[0] += 1
        else:
            chunk.append(character)
    if chunk:
        page.keyboard.type(''.join(chunk))


def finish_run(page, plan):
    errors = [0]
    for index, segment in enumerate(plan['segments']):
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        type_segment_with_pair_errors(page, segment['text'], errors)
        if index < len(plan['segments']) - 1:
            expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
            page.locator('[data-flow-action="continue-chapter"]').click()
    assert errors[0] == 2, "calibration run must create the repeated e → r pattern"
    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)


def certify_progression(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    page.goto(integrated_route(base), wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-integration-profile]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-integration-onboarding]')).to_be_visible()
    expect(page.locator('[data-flow-integration-profile]')).to_contain_text('0/9 milestones')
    assert page.evaluate('window.wordstrikeFlowIntegrationPhase11.enabled') is True

    page.locator('[data-flow-integration-onboarding-done]').click()
    expect(page.locator('[data-flow-integration-onboarding]')).to_have_count(0)

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['sessionLength'] == 'quick', plan
    assert plan['passageCount'] == 3, plan
    assert plan['modifiers'] == ['sprint'], plan

    finish_run(page, plan)
    expect(page.locator('[data-flow-integration-complete]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-integration-complete]')).to_contain_text('Run 1')
    expect(page.locator('[data-flow-integration-complete]')).to_contain_text('First Flow')

    summary = page.evaluate('window.wordstrikeFlowIntegrationPhase11.getSummary()')
    assert summary['progress']['completedRuns'] == 1, summary
    assert len(summary['progress']['history']) == 1, summary
    assert summary['generic']['completedSessions'] == 1, summary
    assert summary['recent'][0]['modeId'] == 'flow', summary
    weakness = summary['progress']['lastWeaknessProfile'][0]
    assert weakness['key'] == 'typo-pair', weakness
    assert weakness['expected'] == 'e' and weakness['actual'] == 'r', weakness
    assert summary['progress']['lastSetup']['modifiers'] == ['sprint'], summary

    # Repeated DOM work must not duplicate canonical or Flow-specific history.
    page.evaluate("document.querySelector('[data-flow-integration-complete]').setAttribute('data-probe','1')")
    page.wait_for_timeout(100)
    again = page.evaluate('window.wordstrikeFlowIntegrationPhase11.getSummary()')
    assert again['progress']['completedRuns'] == 1, again
    assert again['generic']['completedSessions'] == 1, again

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-results.png'), full_page=True)

    # Last setup is restored before the run plan resolves when config is omitted.
    page.goto(integrated_route(base, explicit=False), wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    restored = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert restored['sessionLength'] == 'quick', restored
    assert restored['category'] == 'mixed', restored
    assert restored['difficulty'] == 'natural', restored
    assert restored['modifiers'] == ['sprint'], restored
    assert restored['passageCount'] == 3, restored
    assert page.locator('[data-flow-integration-onboarding]').count() == 0
    profile_text = page.locator('[data-flow-integration-profile]').inner_text()
    assert '/9 milestones' in profile_text, profile_text
    expect(page.locator('[data-flow-integration-profile]')).to_contain_text('Quick · Natural')
    expect(page.locator('[data-flow-integration-resume]')).to_be_visible()

    # Persisted weakness context can resume an adaptive plan across navigation.
    page.locator('[data-flow-integration-resume]').click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    adaptive = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert adaptive['adaptive']['enabled'] is True, adaptive
    assert adaptive['adaptive']['targetedPassageCount'] == 1, adaptive
    assert adaptive['adaptive']['weaknesses'][0]['key'] == 'typo-pair', adaptive

    assert not errors, errors
    evidence.append({
        "browser": browser_name,
        "case": "canonical persistence → progression → default restore → persistent adaptive resume",
        "completedRuns": summary['progress']['completedRuns'],
        "canonicalSessions": summary['generic']['completedSessions'],
        "weakness": weakness['label'],
    })
    context.close()


def certify_isolation(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()

    phase10 = (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1&flowAdaptive=1"
        + "&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=phase11-isolation"
    )
    page.goto(phase10, wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    assert page.locator('[data-flow-integration-profile]').count() == 0
    assert page.locator('[data-flow-integration-onboarding]').count() == 0

    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    expect(flow).to_have_attribute('aria-disabled', 'true')
    assert page.locator('[data-flow-integration-profile]').count() == 0

    evidence.append({"browser": browser_name, "case": "Phase 11 gate preserves Phase 10 and public Flow"})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    page.goto(integrated_route(base), wait_until="domcontentloaded")
    expect(page.locator('[data-flow-integration-profile]')).to_be_visible(timeout=10000)
    geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      profileWidth: document.querySelector('[data-flow-integration-profile]').getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
      onboardingWidth: document.querySelector('[data-flow-integration-onboarding]').getBoundingClientRect().width,
    })""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['profileWidth'] <= geometry['viewport'], geometry
    assert geometry['onboardingWidth'] <= geometry['viewport'], geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-ready.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px progression and onboarding", **geometry})
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
                certify_progression(browser, name, base, evidence)
                certify_isolation(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 11 progression/integration scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
