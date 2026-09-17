"""Flow Phase 5 run structure and chapter browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase5"

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


def run_url(base):
    return base + "?dev=1&mode=flow&flowRun=1&flowLength=quick&flowCategory=mixed&flowDifficulty=advanced&flowSeed=phase5-browser"


def open_ready(page, base):
    page.goto(run_url(base))
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['sessionLength'] == 'quick', plan
    assert plan['targetMinutes'] == 3, plan
    assert plan['chapterCount'] == 3, plan
    assert plan['passageCount'] == 6, plan
    assert [chapter['title'] for chapter in plan['chapters']] == ['Settle In', 'Precision', 'Final Flow'], plan
    return plan


def certify_run(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    plan = open_ready(page, base)
    page.locator('[data-flow-action="start"]').click()

    chapter_transitions = 0
    for index, segment in enumerate(plan['segments']):
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        active_index = page.evaluate('window.wordstrikeFlowPhase1.getActiveSegmentIndex()')
        assert active_index == index, (active_index, index)
        visible_text = page.locator('[data-flow-passage]').get_attribute('aria-label')
        assert visible_text == segment['text'], (visible_text, segment)
        chapter = plan['chapters'][segment['chapterIndex']]
        expect(page.locator('[data-flow-chapter]')).to_contain_text(chapter['title'])
        page.keyboard.type(segment['text'])

        if index == len(plan['segments']) - 1:
            break
        next_segment = plan['segments'][index + 1]
        if next_segment['chapterIndex'] != segment['chapterIndex']:
            chapter_transitions += 1
            expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
            next_chapter = plan['chapters'][next_segment['chapterIndex']]
            expect(page.locator('.flow-chapter-transition h1')).to_have_text(next_chapter['title'])
            page.wait_for_timeout(650)
            page.locator('[data-flow-action="continue-chapter"]').click()
        else:
            expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)

    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
    snapshot = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    assert snapshot['phase'] == 'complete', snapshot
    assert snapshot['currentIndex'] == len(plan['fullText']), snapshot
    assert snapshot['gameplay']['score'] > 0, snapshot

    # Browser scheduling can introduce unrelated stalls during synthetic ultra-fast
    # typing. The contract is that passage/chapter boundaries themselves never
    # become cadence pauses.
    boundary_indexes = set(plan['cadenceExcludedAfterIndexes'])
    for pause in snapshot['cadence']['pauseEvents']:
        assert pause['fromIndex'] not in boundary_indexes, (pause, boundary_indexes)

    assert snapshot['cadence']['typingDurationMs'] > 0, snapshot['cadence']
    assert chapter_transitions == 2, chapter_transitions
    assert not errors, errors

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-complete.png'), full_page=True)
    evidence.append({
        "browser": browser_name,
        "case": "quick run completes across chapters",
        "chapters": plan['chapterCount'],
        "passages": plan['passageCount'],
        "transitions": chapter_transitions,
        "schedulerPauses": snapshot['cadence']['pauseCount'],
        "score": snapshot['gameplay']['score'],
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
    evidence.append({"browser": browser_name, "case": "released public Flow is available without auto-launching Phase 5"})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    plan = open_ready(page, base)
    geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      width: document.querySelector('[data-flow-view="ready"]').getBoundingClientRect().width
    })""")
    assert geometry['overflow'] <= 1, geometry
    page.locator('[data-flow-action="start"]').click()
    for segment in plan['segments'][:2]:
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        page.keyboard.type(segment['text'])
    expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
    chapter_geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      width: document.querySelector('.flow-chapter-transition').getBoundingClientRect().width
    })""")
    assert chapter_geometry['overflow'] <= 1, chapter_geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-chapter.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px ready and chapter transition", **chapter_geometry})
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
                certify_run(browser, name, base, evidence)
                certify_public_gate(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 5 browser scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
