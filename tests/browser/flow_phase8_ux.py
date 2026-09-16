"""Flow Phase 8 UX testing and refinement certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase8"

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


def ux_route(base, length="standard", category="mixed", difficulty="natural"):
    return (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1"
        + f"&flowLength={length}&flowCategory={category}&flowDifficulty={difficulty}&flowSeed=phase8-ux"
    )


def selected(page, group, value):
    return page.locator(f'[data-flow-choice-group="{group}"][data-flow-choice-value="{value}"]')


def wait_settled(page):
    page.wait_for_timeout(650)


def open_setup(page, base):
    page.goto(ux_route(base), wait_until="domcontentloaded")
    screen = page.locator('[data-flow-view="ready"]')
    expect(screen).to_be_visible(timeout=10000)
    expect(screen).to_have_attribute('data-flow-ui-phase7', 'true')
    expect(screen).to_have_attribute('data-flow-ux-phase8', 'true')
    expect(page.locator('[data-flow-ux="setup-action-dock"]')).to_be_visible()
    return page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')


def assert_roving_group(page, group, expected):
    buttons = page.locator(f'[data-flow-choice-group="{group}"]')
    count = buttons.count()
    assert count > 0
    tabbable = 0
    pressed = 0
    for index in range(count):
        item = buttons.nth(index)
        if item.get_attribute('tabindex') == '0':
            tabbable += 1
        if item.get_attribute('aria-pressed') == 'true':
            pressed += 1
    assert tabbable == 1, (group, "tabbable", tabbable)
    assert pressed == 1, (group, "pressed", pressed)
    expect(selected(page, group, expected)).to_have_attribute('tabindex', '0')
    expect(selected(page, group, expected)).to_have_attribute('aria-pressed', 'true')


def certify_setup(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    initial = open_setup(page, base)
    assert initial['sessionLength'] == 'standard'
    assert initial['category'] == 'mixed'
    assert initial['difficulty'] == 'natural'

    assert_roving_group(page, 'sessionLength', 'standard')
    assert_roving_group(page, 'category', 'mixed')
    assert_roving_group(page, 'difficulty', 'natural')

    dock = page.locator('[data-flow-ux="setup-action-dock"]')
    dock_box = dock.bounding_box()
    assert dock_box is not None
    assert dock_box['y'] + dock_box['height'] <= 900 + 1, dock_box
    expect(page.locator('.flow-phase1-brief')).to_have_attribute('aria-live', 'polite')

    # Arrow navigation updates both semantic selection and roving tab stop.
    selected(page, 'category', 'mixed').focus()
    page.keyboard.press('ArrowRight')
    assert_roving_group(page, 'category', 'everyday')

    # Stage the target usability-test session.
    selected(page, 'sessionLength', 'quick').click()
    selected(page, 'category', 'dialogue').click()
    selected(page, 'difficulty', 'advanced').click()
    assert_roving_group(page, 'sessionLength', 'quick')
    assert_roving_group(page, 'category', 'dialogue')
    assert_roving_group(page, 'difficulty', 'advanced')
    expect(page.locator('[data-flow-ux-setup-selection]')).to_have_text('Quick · Dialogue · Advanced')
    expect(page.locator('[data-flow-action="start"]')).to_have_text('START UPDATED RUN')

    if browser_name == 'chromium':
        wait_settled(page)
        page.screenshot(path=str(ARTIFACTS / 'chromium-setup.png'), full_page=True)

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['sessionLength'] == 'quick', plan
    assert plan['category'] == 'dialogue', plan
    assert plan['difficulty'] == 'advanced', plan
    assert 'flowUiStart' not in page.url
    assert not errors, errors
    context.close()
    evidence.append({"browser": browser_name, "case": "setup friction + roving focus + always-visible primary action"})


def run_quick_session(page, plan, screenshot_browser=False):
    chapter_count = 0
    for index, segment in enumerate(plan['segments']):
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        page.keyboard.type(segment['text'])
        if index == len(plan['segments']) - 1:
            break
        next_segment = plan['segments'][index + 1]
        if next_segment['chapterIndex'] != segment['chapterIndex']:
            chapter_count += 1
            chapter = page.locator('[data-flow-view="chapter"]')
            expect(chapter).to_be_visible(timeout=10000)
            expect(chapter).to_have_attribute('data-flow-ux-phase8', 'true')
            actions = chapter.locator('[data-flow-ux="chapter-actions"]')
            expect(actions).to_be_visible()
            expect(actions.locator('.flow-ux-key-hint')).to_have_text('Enter to continue')
            assert actions.locator('[data-flow-action="continue-chapter"]').count() == 1
            if screenshot_browser and chapter_count == 1:
                wait_settled(page)
                page.screenshot(path=str(ARTIFACTS / 'chromium-chapter.png'), full_page=True)
            page.locator('[data-flow-action="continue-chapter"]').click()
    return chapter_count


def certify_run_and_results(browser, browser_name, base, evidence):
    context = context_for(browser, base, width=780, height=620)
    page = context.new_page()
    page.goto(ux_route(base, length='quick', category='dialogue', difficulty='advanced'), wait_until='domcontentloaded')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    page.locator('[data-flow-action="start"]').click()
    run = page.locator('[data-flow-view="run"]')
    expect(run).to_be_visible(timeout=10000)
    expect(run).to_have_attribute('data-flow-ux-phase8', 'true')

    # Upcoming text must remain readable rather than disappearing into the background.
    opacity = float(page.evaluate("parseFloat(getComputedStyle(document.querySelector('.flow-char--pending')).opacity)"))
    assert opacity >= 0.50, opacity

    # Losing the hidden capture focus provides an explicit recovery affordance.
    page.locator('.screen-back-button').focus()
    expect(page.locator('[data-flow-ux="focus-hint"]')).to_be_visible(timeout=2000)
    page.locator('.flow-run-copy').click(position={"x": 20, "y": 20})
    active_label = page.evaluate("document.activeElement?.getAttribute('data-flow-input') !== null")
    assert active_label is True
    expect(page.locator('[data-flow-ux="focus-hint"]')).to_be_hidden()

    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')

    # Type deep enough into the first passage to exercise caret auto-visibility.
    first = plan['segments'][0]
    cut = max(1, int(len(first['text']) * 0.78))
    page.keyboard.type(first['text'][:cut])
    page.wait_for_timeout(250)
    caret = page.locator('.flow-char--current')
    if caret.count():
        box = caret.bounding_box()
        assert box is not None
        assert box['y'] + box['height'] <= 620 + 2, box
        assert box['y'] >= -2, box
    page.keyboard.type(first['text'][cut:])

    # Continue the remaining segments manually because segment 0 is already done.
    chapter_count = 0
    for index in range(1, len(plan['segments'])):
        segment = plan['segments'][index]
        previous = plan['segments'][index - 1]
        if segment['chapterIndex'] != previous['chapterIndex']:
            chapter_count += 1
            chapter = page.locator('[data-flow-view="chapter"]')
            expect(chapter).to_be_visible(timeout=10000)
            expect(chapter.locator('[data-flow-ux="chapter-actions"]')).to_be_visible()
            if browser_name == 'chromium' and chapter_count == 1:
                wait_settled(page)
                page.screenshot(path=str(ARTIFACTS / 'chromium-chapter.png'), full_page=True)
            chapter.locator('[data-flow-action="continue-chapter"]').click()
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        page.keyboard.type(segment['text'])

    complete = page.locator('[data-flow-view="complete"]')
    expect(complete).to_be_visible(timeout=10000)
    expect(complete).to_have_attribute('data-flow-ux-phase8', 'true')
    primary = complete.locator('[data-flow-ux="primary-results"]')
    expect(primary).to_be_visible()
    assert primary.locator('.flow-ux-primary-metric').count() == 4
    for label in ['WPM', 'Accuracy', 'Cadence', 'Avg Flow']:
        expect(primary).to_contain_text(label)

    details = complete.locator('[data-flow-ux="details"]')
    expect(details).to_be_visible()
    assert details.evaluate('el => el.open') is False
    # Primary actions must appear before detailed analysis in document order.
    order_ok = page.evaluate("""() => {
      const actions=document.querySelector('.flow-complete-actions');
      const details=document.querySelector('[data-flow-ux="details"]');
      return !!actions && !!details && !!(actions.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING);
    }""")
    assert order_ok is True
    details.locator('summary').click()
    assert details.evaluate('el => el.open') is True
    expect(details.locator('.flow-natural-analysis')).to_be_visible()

    if browser_name == 'chromium':
        wait_settled(page)
        page.screenshot(path=str(ARTIFACTS / 'chromium-results.png'), full_page=True)

    evidence.append({
        "browser": browser_name,
        "case": "readable run + focus recovery + caret visibility + compact chapters + progressive results",
        "chapters": plan['chapterCount'],
        "transitions": chapter_count,
    })
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    page.goto(ux_route(base, length='quick', category='everyday', difficulty='natural'), wait_until='domcontentloaded')
    setup = page.locator('[data-flow-view="ready"]')
    expect(setup).to_be_visible(timeout=10000)
    expect(setup).to_have_attribute('data-flow-ux-phase8', 'true')
    geometry = page.evaluate("""() => {
      const dock=document.querySelector('[data-flow-ux="setup-action-dock"]');
      const button=dock?.querySelector('[data-flow-action="start"]');
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        dockBottom: dock ? dock.getBoundingClientRect().bottom : 9999,
        dockWidth: dock ? dock.getBoundingClientRect().width : 9999,
        buttonHeight: button ? button.getBoundingClientRect().height : 0,
        viewport:document.documentElement.clientWidth,
      };
    }""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['dockBottom'] <= 844 + 1, geometry
    assert geometry['dockWidth'] <= 390, geometry
    assert geometry['buttonHeight'] >= 42, geometry

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    opacity = float(page.evaluate("parseFloat(getComputedStyle(document.querySelector('.flow-char--pending')).opacity)"))
    assert opacity >= 0.60, opacity
    if browser_name == 'chromium':
        wait_settled(page)
        page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-run.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px persistent action + readable passage", "geometry": geometry})
    context.close()


def certify_isolation(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    phase7 = base + '?dev=1&mode=flow&flowRun=1&flowUi=1&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=phase8-isolation'
    page.goto(phase7, wait_until='domcontentloaded')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    assert page.locator('[data-flow-ux-phase8="true"]').count() == 0
    assert page.locator('[data-flow-ux="setup-action-dock"]').count() == 0

    page.goto(base, wait_until='domcontentloaded')
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    expect(flow).to_have_attribute('aria-disabled', 'true')
    assert page.locator('[data-flow-ux-phase8="true"]').count() == 0
    evidence.append({"browser": browser_name, "case": "Phase 8 is explicit and public Flow remains gated"})
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
                certify_setup(browser, name, base, evidence)
                certify_run_and_results(browser, name, base, evidence)
                certify_isolation(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 8 UX scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
