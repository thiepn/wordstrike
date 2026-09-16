"""Flow Phase 7 dedicated UI certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase7"

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


def ui_route(base, length="standard", category="mixed", difficulty="natural"):
    return (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1"
        + f"&flowLength={length}&flowCategory={category}&flowDifficulty={difficulty}&flowSeed=phase7-ui"
    )


def open_setup(page, base, **kwargs):
    page.goto(ui_route(base, **kwargs))
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-ui="setup"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-view="ready"]')).to_have_attribute('data-flow-ui-phase7', 'true')
    return page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')


def selected(page, group, value):
    return page.locator(f'[data-flow-choice-group="{group}"][data-flow-choice-value="{value}"]')


def certify_setup_and_run(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    initial = open_setup(page, base)
    assert initial['sessionLength'] == 'standard', initial
    assert initial['category'] == 'mixed', initial
    assert initial['difficulty'] == 'natural', initial

    assert page.locator('[data-flow-group="sessionLength"] [data-flow-choice-group]').count() == 3
    assert page.locator('[data-flow-group="category"] [data-flow-choice-group]').count() == 8
    assert page.locator('[data-flow-group="difficulty"] [data-flow-choice-group]').count() == 4
    expect(selected(page, 'sessionLength', 'standard')).to_have_attribute('aria-pressed', 'true')
    expect(selected(page, 'category', 'mixed')).to_have_attribute('aria-pressed', 'true')
    expect(selected(page, 'difficulty', 'natural')).to_have_attribute('aria-pressed', 'true')

    # Focused setup controls own Enter instead of triggering Flow's legacy
    # READY-screen global Enter shortcut.
    selected(page, 'category', 'mixed').focus()
    page.keyboard.press('Enter')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible()

    # Arrow-key navigation stays inside the choice group.
    page.keyboard.press('ArrowRight')
    expect(selected(page, 'category', 'everyday')).to_have_attribute('aria-pressed', 'true')

    # Stage a materially different run without reloading yet.
    selected(page, 'sessionLength', 'quick').click()
    selected(page, 'category', 'dialogue').click()
    selected(page, 'difficulty', 'advanced').click()
    expect(page.locator('[data-flow-setup-summary]')).to_contain_text('~3 min')
    expect(page.locator('[data-flow-setup-focus]')).to_have_text('Dialogue · Advanced')
    expect(page.locator('[data-flow-action="start"]')).to_have_text('START UPDATED RUN')
    assert page.locator('.flow-setup-itinerary .flow-itinerary-step').count() == 3

    # The inherited Phase 5 summary must reflect the same staged draft rather
    # than exposing the previously resolved Standard / Mixed / Natural plan.
    draft_summary = page.locator('[data-flow-view="ready"] .flow-phase1-brief')
    expect(draft_summary).to_have_attribute('aria-label', 'Selected Flow run setup')
    summary_text = draft_summary.inner_text()
    for expected_text in ('~3 min', '3 chapters', '6 passages', 'Dialogue', 'Advanced'):
        assert expected_text in summary_text, (expected_text, summary_text)
    assert 'Standard run' not in summary_text, summary_text
    assert page.locator('[data-flow-view="ready"] .flow-phase1-note').count() == 2
    assert page.locator('[data-flow-view="ready"] .flow-phase1-note:visible').count() == 0

    draft = page.evaluate('window.wordstrikeFlowUiPhase7.getDraft()')
    assert draft['sessionLength'] == 'quick', draft
    assert draft['category'] == 'dialogue', draft
    assert draft['difficulty'] == 'advanced', draft

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-setup.png'), full_page=True)

    # The setup handoff performs one canonical reload, then auto-starts the
    # re-planned run through the existing Flow controller.
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['sessionLength'] == 'quick', plan
    assert plan['category'] == 'dialogue', plan
    assert plan['difficulty'] == 'advanced', plan
    assert plan['chapterCount'] == 3, plan
    assert 'flowUiStart' not in page.url, page.url

    rail = page.locator('[data-flow-ui="session-rail"]')
    expect(rail).to_be_visible()
    assert rail.locator('.flow-itinerary-step').count() == 3
    assert rail.locator('.flow-itinerary-step[data-state="current"]').count() == 1
    expect(rail.locator('.flow-session-rail-copy')).to_contain_text('Settle In')

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-run-ui.png'), full_page=True)

    chapter_transitions = 0
    for index, segment in enumerate(plan['segments']):
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        active = page.evaluate('window.wordstrikeFlowPhase1.getActiveSegmentIndex()')
        assert active == index, (active, index)
        page.keyboard.type(segment['text'])

        if index == len(plan['segments']) - 1:
            break
        next_segment = plan['segments'][index + 1]
        if next_segment['chapterIndex'] != segment['chapterIndex']:
            chapter_transitions += 1
            expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
            chapter_rail = page.locator('[data-flow-view="chapter"] [data-flow-ui="session-rail"]')
            expect(chapter_rail).to_be_visible()
            current = chapter_rail.locator('.flow-itinerary-step[data-state="current"]')
            assert current.count() == 1
            if browser_name == 'chromium' and chapter_transitions == 1:
                page.screenshot(path=str(ARTIFACTS / 'chromium-chapter-ui.png'), full_page=True)
            page.locator('[data-flow-action="continue-chapter"]').click()

    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
    assert chapter_transitions == 2
    result_rail = page.locator('[data-flow-view="complete"] [data-flow-ui="session-rail"]')
    expect(result_rail).to_be_visible()
    assert result_rail.locator('.flow-itinerary-step[data-state="complete"]').count() == 3
    expect(page.locator('[data-flow-action="restart"]')).to_have_text('RUN AGAIN')
    setup_action = page.locator('[data-flow-ui-action="setup"]')
    expect(setup_action).to_have_text('CHANGE SETUP')

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-results-ui.png'), full_page=True)

    # Focused result action must win over the legacy COMPLETE-screen Enter shortcut.
    setup_action.focus()
    page.keyboard.press('Enter')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    expect(page.locator('[data-flow-ui="setup"]')).to_be_visible()
    expect(selected(page, 'sessionLength', 'quick')).to_have_attribute('aria-pressed', 'true')
    expect(selected(page, 'category', 'dialogue')).to_have_attribute('aria-pressed', 'true')
    expect(selected(page, 'difficulty', 'advanced')).to_have_attribute('aria-pressed', 'true')

    assert not errors, errors
    evidence.append({
        "browser": browser_name,
        "case": "setup → canonical handoff → run rail → chapter rail → results → setup",
        "chapters": plan['chapterCount'],
        "passages": plan['passageCount'],
        "transitions": chapter_transitions,
    })
    context.close()


def certify_phase_isolation(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()

    # Phase 6 developer route remains unchanged unless flowUi=1 is explicit.
    phase6_url = base + "?dev=1&mode=flow&flowRun=1&flowLength=quick&flowCategory=mixed&flowDifficulty=advanced&flowSeed=phase7-isolation"
    page.goto(phase6_url)
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    assert page.locator('[data-flow-ui="setup"]').count() == 0
    assert page.locator('[data-flow-ui="session-rail"]').count() == 0

    # Public Mode Select is still gated and never receives dedicated Flow UI.
    page.goto(base)
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    expect(flow).to_have_attribute('aria-disabled', 'true')
    assert page.locator('[data-flow-ui="setup"]').count() == 0

    evidence.append({"browser": browser_name, "case": "Phase 7 explicit gate preserves Phase 6 and public surfaces"})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_setup(page, base, length='quick', category='mixed', difficulty='natural')

    setup_geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      setupWidth: document.querySelector('[data-flow-ui="setup"]').getBoundingClientRect().width,
      choiceWidth: document.querySelector('[data-flow-choice-group="category"]').getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
    })""")
    assert setup_geometry['overflow'] <= 1, setup_geometry
    assert setup_geometry['setupWidth'] <= setup_geometry['viewport'], setup_geometry

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    rail_geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      railWidth: document.querySelector('[data-flow-ui="session-rail"]').getBoundingClientRect().width,
      passageWidth: document.querySelector('.flow-passage').getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
    })""")
    assert rail_geometry['overflow'] <= 1, rail_geometry
    assert rail_geometry['railWidth'] <= rail_geometry['viewport'], rail_geometry

    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-ui.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px setup and session rail", "setup": setup_geometry, "run": rail_geometry})
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
                certify_setup_and_run(browser, name, base, evidence)
                certify_phase_isolation(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 7 UI scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
