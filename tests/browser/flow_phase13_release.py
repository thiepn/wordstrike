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
    assert 'dev=1' not in page.url, page.url
    assert page.evaluate('window.wordstrikeFlowReleasePhase13.isReleaseRoute()') is True
    assert page.evaluate('window.wordstrikeFlowReleasePhase13.runtimeReady()') is True
    expect(page.locator('.flow-phase1-screen[data-flow-ui-phase7="true"]')).to_be_visible()
    expect(page.locator('[data-flow-integration-profile]')).to_be_visible(timeout=10000)


def make_quick_sprint(page, seed):
    page.goto(page.evaluate("""seed => {
      const url = new URL(location.href);
      url.searchParams.set('flowLength', 'quick');
      url.searchParams.set('flowCategory', 'mixed');
      url.searchParams.set('flowDifficulty', 'natural');
      url.searchParams.set('flowModifierIds', 'sprint');
      url.searchParams.set('flowSeed', seed);
      return url.href;
    }""", seed), wait_until='domcontentloaded')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    assert 'dev=1' not in page.url, page.url
    onboarding = page.locator('[data-flow-integration-onboarding-done]')
    if onboarding.count():
        onboarding.click()
    plan = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')
    assert plan['sessionLength'] == 'quick', plan
    assert plan['modifiers'] == ['sprint'], plan
    assert plan['passageCount'] == 3, plan
    return plan


def finish_run(page, plan):
    page.locator('[data-flow-action="start"]').click()
    for index, segment in enumerate(plan['segments']):
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        page.keyboard.type(segment['text'])
        if index < len(plan['segments']) - 1:
            expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
            page.locator('[data-flow-action="continue-chapter"]').click()
    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
    expect(page.locator('[data-flow-integration-complete]')).to_be_visible(timeout=10000)


def certify_public_journey(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    open_modes(page, base)
    active = page.locator('button.mode-option.available').evaluate_all('els => els.map(el => el.dataset.modeId)')
    assert active == ['campaign', 'speed-test', 'endless', 'flow'], active
    assert page.locator('article[data-mode-id="practice"][aria-disabled="true"]').count() == 1
    assert page.locator('[data-mode-id="arcade-rush"]').count() == 0

    launch_public_flow(page)
    plan = make_quick_sprint(page, f'phase13-public-{browser_name}')
    finish_run(page, plan)

    summary = page.evaluate('window.wordstrikeFlowIntegrationPhase11.getSummary()')
    assert summary['progress']['completedRuns'] == 1, summary
    assert summary['generic']['completedSessions'] == 1, summary
    assert summary['recent'][0]['modeId'] == 'flow', summary
    assert 'dev=1' not in page.url, page.url

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-public-results.png'), full_page=True)

    # Escape from results restores the exact Mode Select surface saved underneath Flow.
    page.keyboard.press('Escape')
    expect(page.locator('.mode-select-screen')).to_be_visible(timeout=10000)
    assert 'flowRelease=1' not in page.url, page.url
    assert 'flowRun=1' not in page.url, page.url
    expect(page.locator('button[data-mode-id="flow"]')).to_be_visible()

    # A second release launch after clean exit must still work.
    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    assert 'flowRelease=1' in page.url and 'dev=1' not in page.url, page.url

    assert not errors, errors
    evidence.append({
        'browser': browser_name,
        'case': 'public Mode Select → persisted Flow run → clean exit → relaunch',
        'completedRuns': summary['progress']['completedRuns'],
        'canonicalSessions': summary['generic']['completedSessions'],
    })
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_modes(page, base)
    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewport: document.documentElement.clientWidth,
      screen: document.querySelector('.flow-phase1-screen').getBoundingClientRect().width,
      setup: document.querySelector('[data-flow-ui="setup"]')?.getBoundingClientRect().width || 0,
    })""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['screen'] <= geometry['viewport'] + 1, geometry
    assert geometry['setup'] <= geometry['viewport'] + 1, geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-public-mobile.png'), full_page=True)
    evidence.append({'browser': browser_name, 'case': '390px public Flow entry/setup', **geometry})
    context.close()


def certify_offline(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(base, wait_until='load')
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.evaluate('navigator.serviceWorker.ready.then(() => true)')
    cache_result = page.evaluate('window.wordstrikeFlowReleasePhase13.offlineReady()')
    assert cache_result['supported'] is True, cache_result
    assert cache_result['cached'] == page.evaluate('window.wordstrikeFlowReleasePhase13.offlineAssetCount'), cache_result
    assert cache_result['cached'] >= 30, cache_result

    cached = page.evaluate("""async () => {
      const keys = await caches.keys();
      const name = keys.find(key => key.startsWith('wordstrike-pwa-'));
      const cache = await caches.open(name);
      const targets = [
        './js/flow/flowRuntimeLoader.js?v=20260916a',
        './js/flow/flowContentExpansion.js',
        './js/flow/flowIntegrationPhase11.js?v=20260916a',
        './styles/screens/flow-integration-phase11.css?v=20260916a',
      ];
      const results = [];
      for (const target of targets) results.push(Boolean(await cache.match(new URL(target, location.href).href)));
      return results;
    }""")
    assert all(cached), cached

    # Give clients.claim() a chance to attach the freshly installed worker.
    if not page.evaluate('Boolean(navigator.serviceWorker.controller)'):
        page.reload(wait_until='load')
        expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    assert page.evaluate('Boolean(navigator.serviceWorker.controller)') is True

    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-select-screen')).to_be_visible()
    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    assert 'dev=1' not in page.url, page.url
    context.set_offline(False)

    evidence.append({
        'browser': browser_name,
        'case': 'PWA cache warm-up and offline public Flow relaunch',
        'cachedAssets': cache_result['cached'],
    })
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_port}/'
    evidence = []
    try:
        with sync_playwright() as p:
            for browser_type in (p.chromium, p.firefox):
                browser = browser_type.launch()
                name = browser_type.name
                certify_public_journey(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                certify_offline(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f'PASS: {len(evidence)} Flow Phase 13 public release scenarios')
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
