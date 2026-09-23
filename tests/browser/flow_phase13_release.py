"""Flow Phase 13 public release-candidate certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase13"

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


def open_modes(page, base):
    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-select-screen')).to_be_visible(timeout=10000)


def launch_public_flow(page):
    flow = page.locator('button[data-mode-id="flow"]')
    expect(flow).to_be_visible(timeout=10000)
    expect(flow).to_contain_text('Flow')
    flow.click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    assert 'flowRelease=1' in page.url, page.url
    assert page.evaluate('window.wordstrikeFlowReleasePhase13.runtimeReady()') is True
    assert 'dev=1' not in page.url, page.url
    assert page.evaluate('window.wordstrikeFlowReleasePhase13.isReleaseRoute()') is True
    expect(page.locator('.flow-phase1-screen[data-flow-ui-phase7="true"][data-flow-game-mode-v2="true"]')).to_be_visible()
    expect(page.locator('[data-flow-game-home]')).to_be_visible(timeout=10000)
    assert page.locator('[data-flow-choice-group="category"]').count() == 0
    assert page.locator('[data-flow-choice-group="difficulty"]').count() == 0
    assert page.locator('[data-flow-modifier-id]').count() == 0


def make_quick_run(page, seed):
    page.evaluate("""seed => {
      const url = new URL(location.href);
      url.searchParams.set('flowSeed', seed);
      history.replaceState(null, '', url.href);
    }""", seed)
    expect(page.locator('[data-flow-game-length="quick"]')).to_be_visible(timeout=10000)
    page.locator('[data-flow-game-length="quick"]').click()
    expect(page.locator('[data-flow-game-length="quick"]')).to_have_attribute('aria-pressed', 'true')
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['sessionLength'] == 'quick', plan
    assert plan['modifiers'] == [], plan
    assert plan['category'] == 'mixed', plan
    assert plan['difficulty'] == 'natural', plan
    assert plan['passageCount'] == 3, plan
    assert plan['paragraphCount'] == 3, plan
    assert plan['documentCount'] == 1, plan
    assert plan['targetMinutes'] == 3, plan
    return plan


def finish_run(page, plan):
    if page.locator('[data-flow-view="ready"]').is_visible():
        page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"][data-flow-longform-v2="true"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-longform="true"]')).to_be_visible(timeout=10000)
    assert page.locator('[data-flow-paragraph]').count() == plan['paragraphCount']
    assert page.locator('[data-flow-view="chapter"]').count() == 0
    hud_labels = page.locator('.flow-game-v2-hud > div > span').all_text_contents()
    assert hud_labels == ['Score', 'WPM', 'Accuracy', 'Progress'], hud_labels
    page.keyboard.type(plan['fullText'])
    assert page.locator('[data-flow-view="chapter"]').count() == 0
    expect(page.locator('[data-flow-view="complete"][data-flow-score-v2="true"]')).to_be_visible(timeout=10000)
    expect(page.locator('.flow-v2-final-score')).to_be_visible(timeout=10000)
    metrics = page.locator('.flow-v2-result-metrics > div > span').all_text_contents()
    assert metrics == ['WPM', 'Accuracy', 'Consistency'], metrics
    assert page.locator('.flow-complete-screen').get_by_text('Momentum', exact=True).count() == 0
    assert page.locator('.flow-complete-screen').get_by_text('Cadence', exact=True).count() == 0
    # Legacy integration recording remains active for compatibility, but its
    # old progression card must not render on the competitive V2 result screen.
    page.wait_for_timeout(50)
    assert page.locator('[data-flow-integration-complete]').count() == 0


def certify_public_journey(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    open_modes(page, base)
    active = page.locator('button.mode-option.available').evaluate_all('els => els.map(el => el.dataset.modeId)')
    assert active == ['campaign', 'speed-test', 'endless', 'flow', 'practice'], active
    assert page.locator('button[data-mode-id="practice"]:enabled').count() == 1
    assert page.locator('[data-mode-id="arcade-rush"]').count() == 0

    launch_public_flow(page)
    plan = make_quick_run(page, f'phase13-public-{browser_name}')
    finish_run(page, plan)

    public_result = page.evaluate('window.wordstrikeFlowPhase1.getPublicResult()')
    record_state = page.evaluate('window.wordstrikeFlowPhase1.getPublicRecordState()')
    assert public_result['rulesVersion'] == 2, public_result
    assert public_result['metricVersion'] == 1, public_result
    assert public_result['boardKey'] == 'flow-quick-v1', public_result
    assert public_result['score'] > 0, public_result
    assert public_result['accuracy'] == 100, public_result
    assert public_result['recordEligible'] is True, public_result
    assert record_state['recorded'] is True, record_state
    assert record_state['isPersonalBest'] is True, record_state
    assert record_state['personalBest']['score'] == public_result['score'], record_state

    summary = page.evaluate('window.wordstrikeFlowIntegrationPhase11.getSummary()')
    assert summary['progress']['completedRuns'] == 1, summary
    assert summary['generic']['completedSessions'] == 1, summary
    assert summary['recent'][0]['modeId'] == 'flow', summary
    assert 'dev=1' not in page.url, page.url

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-public-results.png'), full_page=True)

    page.keyboard.press('Escape')
    expect(page.locator('.mode-select-screen')).to_be_visible(timeout=10000)
    assert 'flowRelease=1' not in page.url, page.url
    assert 'flowRun=1' not in page.url, page.url
    flow = page.locator('button[data-mode-id="flow"]')
    expect(flow).to_be_visible()

    flow.focus()
    page.keyboard.press('Enter')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    assert page.evaluate('window.wordstrikeFlowReleasePhase13.runtimeReady()') is True
    assert 'flowRelease=1' in page.url and 'dev=1' not in page.url, page.url

    persisted_plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    expect(page.locator('[data-flow-game-best]')).to_have_text(f"{public_result['score']:,}")
    expect(page.locator('[data-flow-game-recent]')).to_contain_text(f"{public_result['score']:,}")
    assert persisted_plan['sessionLength'] == 'quick', persisted_plan
    assert persisted_plan['modifiers'] == [], persisted_plan
    assert persisted_plan['passageCount'] == 3, persisted_plan
    assert persisted_plan['paragraphCount'] == 3, persisted_plan
    assert not errors, errors
    context.close()

    fresh_context = context_for(browser, base)
    fresh_page = fresh_context.new_page()
    fresh_errors = []
    fresh_page.on('pageerror', lambda error: fresh_errors.append(str(error)))
    open_modes(fresh_page, base)
    launch_public_flow(fresh_page)

    default_plan = fresh_page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert default_plan['sessionLength'] == 'standard', default_plan
    assert default_plan['modifiers'] == [], default_plan
    assert default_plan['coherent'] is True, default_plan
    assert default_plan['continuous'] is True, default_plan
    assert default_plan['passageCount'] == 5, default_plan
    assert default_plan['paragraphCount'] == 5, default_plan
    assert default_plan['documentCount'] == 1, default_plan
    assert default_plan['targetMinutes'] == 6, default_plan
    assert default_plan['chapterCount'] == 1, default_plan
    assert default_plan['seriesTitle'], default_plan
    assert all('"' not in segment['text'] for segment in default_plan['segments']), default_plan
    assert all(32 <= ord(char) <= 126 for segment in default_plan['segments'] for char in segment['text']), default_plan
    assert not fresh_errors, fresh_errors

    evidence.append({
        'browser': browser_name,
        'case': 'public Flow remembers only run length while a fresh profile starts coherent Standard',
        'completedRuns': summary['progress']['completedRuns'],
        'canonicalSessions': summary['generic']['completedSessions'],
        'persistedLength': persisted_plan['sessionLength'],
        'persistedModifiers': persisted_plan['modifiers'],
        'defaultStory': default_plan['seriesTitle'],
        'defaultSections': default_plan['passageCount'],
    })
    fresh_context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_modes(page, base)
    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    assert page.evaluate('window.wordstrikeFlowReleasePhase13.runtimeReady()') is True
    geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewport: document.documentElement.clientWidth,
      screen: document.querySelector('.flow-phase1-screen').getBoundingClientRect().width,
      setup: document.querySelector('[data-flow-game-home]')?.getBoundingClientRect().width || 0,
    })""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['screen'] <= geometry['viewport'] + 1, geometry
    assert geometry['setup'] <= geometry['viewport'] + 1, geometry

    page.locator('[data-flow-game-length="quick"]').click()
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"][data-flow-longform-v2="true"]')).to_be_visible(timeout=10000)
    gameplay_geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hud: document.querySelector('.flow-game-v2-hud').getBoundingClientRect().width,
      passage: document.querySelector('[data-flow-longform="true"]').getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
      paragraphs: document.querySelectorAll('[data-flow-paragraph]').length,
    })""")
    assert gameplay_geometry['overflow'] <= 1, gameplay_geometry
    assert gameplay_geometry['hud'] <= gameplay_geometry['viewport'] + 1, gameplay_geometry
    assert gameplay_geometry['passage'] <= gameplay_geometry['viewport'] + 1, gameplay_geometry
    assert gameplay_geometry['paragraphs'] == 3, gameplay_geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-public-mobile.png'), full_page=True)
    evidence.append({'browser': browser_name, 'case': '390px public Flow entry/setup', **geometry})
    context.close()


def bounded_service_worker_ready(page, timeout_ms=30000):
    return page.evaluate("""timeoutMs => Promise.race([
      navigator.serviceWorker.ready.then(() => ({ ready: true })),
      new Promise(resolve => setTimeout(
        () => resolve({ ready: false, reason: 'service-worker-ready-timeout' }),
        timeoutMs,
      )),
    ])""", timeout_ms)


def bounded_offline_ready(page, timeout_ms=30000):
    return page.evaluate("""timeoutMs => Promise.race([
      window.wordstrikeFlowReleasePhase13.offlineReady(),
      new Promise(resolve => setTimeout(
        () => resolve({ supported: true, cached: 0, timeout: true }),
        timeoutMs,
      )),
    ])""", timeout_ms)


def certify_offline(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base)
    page = context.new_page()
    print('Phase 13 offline: loading PWA origin', flush=True)
    page.goto(base, wait_until='load')
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)

    print('Phase 13 offline: awaiting service worker registration', flush=True)
    sw_ready = bounded_service_worker_ready(page)
    assert sw_ready['ready'] is True, sw_ready

    print('Phase 13 offline: awaiting Flow cache warm-up', flush=True)
    cache_result = bounded_offline_ready(page)
    assert cache_result.get('timeout') is not True, cache_result
    assert cache_result['supported'] is True, cache_result
    assert cache_result['cached'] == page.evaluate('window.wordstrikeFlowReleasePhase13.offlineAssetCount'), cache_result
    assert cache_result['cached'] >= 30, cache_result
    assert cache_result['cacheName'] == page.evaluate('window.wordstrikeFlowReleasePhase13.offlineCacheName'), cache_result

    cached = page.evaluate("""async () => {
      const targets = [
        './js/flow/flowRuntimeLoader.js?v=20260923d',
        './js/flow/flowLongformContent.js',
        './js/flow/flowGameModeV2.js?v=20260923c',
        './js/flow/flowScoreV2.js?v=20260923a',
        './js/flow/flowRecordsV2.js?v=20260923a',
        './js/flow/flowUiPhase7KeyboardGuard.js?v=20260923a',
        './js/flow/flowIntegrationPhase11.js?v=20260923b',
        './styles/screens/flow-integration-phase11.css?v=20260916a',
      ];
      const results = [];
      for (const target of targets) {
        results.push(Boolean(await caches.match(new URL(target, location.href).href)));
      }
      return results;
    }""")
    assert all(cached), cached

    if not page.evaluate('Boolean(navigator.serviceWorker.controller)'):
        print('Phase 13 offline: reloading once for service-worker control', flush=True)
        page.reload(wait_until='load')
        expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    assert page.evaluate('Boolean(navigator.serviceWorker.controller)') is True

    print('Phase 13 offline: exercising true offline reload', flush=True)
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-select-screen')).to_be_visible()
    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    assert page.evaluate('window.wordstrikeFlowReleasePhase13.runtimeReady()') is True
    assert 'dev=1' not in page.url, page.url
    offline_plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert offline_plan['coherent'] is True, offline_plan
    assert offline_plan['passageCount'] == 5, offline_plan
    assert offline_plan['paragraphCount'] == 5, offline_plan
    context.set_offline(False)

    evidence.append({
        'browser': browser_name,
        'case': 'PWA cache warm-up and offline coherent Flow relaunch',
        'cachedAssets': cache_result['cached'],
        'cacheName': cache_result['cacheName'],
    })
    print('Phase 13 offline: certification passed', flush=True)
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://localhost:{server.server_port}/'
    evidence = []
    try:
        with sync_playwright() as p:
            for browser_type in (p.chromium, p.firefox):
                browser = browser_type.launch()
                name = browser_type.name
                print(f'Phase 13 browser: {name} public journey', flush=True)
                certify_public_journey(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                certify_offline(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f'PASS: {len(evidence)} Flow Phase 13 public release scenarios', flush=True)
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
