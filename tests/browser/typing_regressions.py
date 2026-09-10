"""Browser regressions against the real static app, with optional online services disabled.
Run: pip install -r tests/browser/requirements.txt && python -m playwright install chromium firefox
Then: python tests/browser/typing_regressions.py
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts"
SEED_STORAGE = """() => {
  for (const [id, version] of Object.entries({general:3, typing:1, campaign:1, endless:1, boss:1})) {
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  }
  if (!localStorage.getItem('wordstrike_save')) localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel:9, levels:{1:{bestWPM:85,bestScore:3400}}, settings:{speedTestTimerPosition:'center'}
  }));
}"""
SNAPSHOT = """async () => {
  const {getCurrentSpeedTest} = await import('./js/speedTest.js');
  const {appState} = await import('./js/state.js');
  const s = getCurrentSpeedTest();
  return {screen:appState.screen, phase:s?.phase, buffer:s?.typedBuffer, index:s?.currentWordIndex,
    started:s?.activeStartedAtMs, deadline:s?.deadlineMs, config:s?.config.configId, font:s?.fontSize,
    docks:document.querySelectorAll('.gameplay-input-dock').length};
}"""
GEOMETRY = """() => {
  const screen = document.querySelector('.speed-test-screen');
  const viewport = document.querySelector('#speed-test-word-viewport');
  const flow = document.querySelector('#speed-test-word-flow');
  const box = viewport.getBoundingClientRect();
  const tops = [];
  for (const word of flow.children) {
    const rect = word.getBoundingClientRect();
    if (rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5
        && !tops.some(top => Math.abs(top - rect.top) < 1)) tops.push(rect.top);
  }
  const active = flow.querySelector('[aria-current=true]')?.getBoundingClientRect();
  return {font:parseFloat(getComputedStyle(flow).fontSize), lines:tops.length, width:box.width,
    short:document.body.classList.contains('gameplay-viewport-short'),
    overflow:screen.scrollWidth-screen.clientWidth,
    activeVisible:!!active && active.top >= box.top - 1 && active.bottom <= box.bottom + 1,
    bottom:box.bottom, screenBottom:screen.getBoundingClientRect().bottom};
}"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    checks = []
    result = {'sha': os.getenv('GITHUB_SHA'), 'checks': checks, 'success': False}
    try:
        with sync_playwright() as playwright:
            for browser_name in os.getenv('BROWSERS', 'chromium,firefox').split(','):
                browser = getattr(playwright, browser_name).launch(headless=True)
                cases = [(1440, 900, False), (1366, 768, False), (1280, 480, False), (1024, 350, False)]
                if browser_name == 'chromium':
                    cases += [(390, 844, True), (844, 390, True), (390, 340, True), (320, 568, True)]
                for width, height, touch in cases:
                    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch,
                                                  **({'is_mobile': touch} if browser_name == 'chromium' else {}))
                    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base + '?dev=1&mode=speed-test&seed=17')
                    expect(page.locator('#speed-test-word-flow')).to_be_visible()
                    page.wait_for_timeout(100)
                    geometry = page.evaluate(GEOMETRY)
                    assert geometry['lines'] == (2 if touch else 3), geometry
                    assert geometry['overflow'] <= 1, geometry
                    assert geometry['activeVisible'], geometry
                    if not touch:
                        assert not geometry['short'], geometry
                        assert geometry['font'] >= 28, geometry
                        assert geometry['width'] <= 1248.5, geometry
                    for selector in ['.speed-test-controls-wrap', '[data-speed-config="time-60"]',
                                     '[data-speed-timer-position="center"]', 'select[data-speed-font-size]']:
                        expect(page.locator(selector)).to_be_visible()
                    page.screenshot(path=str(ARTIFACTS / f'{browser_name}-{width}x{height}.png'))
                    assert not errors, errors
                    checks.append({'browser': browser_name, 'case': f'layout {width}x{height}', **geometry})
                    context.close()

                # Production navigation, storage and keyboard routing, not a synthetic renderer.
                context = browser.new_context(viewport={'width': 1440, 'height': 900})
                context.add_init_script(f'({SEED_STORAGE})();')
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))

                def open_typing():
                    page.goto(base)
                    page.locator('[data-action="modes"]').click()
                    page.locator('[data-mode-id="speed-test"]').click()
                    expect(page.locator('.speed-test-screen')).to_be_visible()

                def snapshot():
                    return page.evaluate(SNAPSHOT)

                def focus_words():
                    page.locator('#speed-test-word-viewport').click(position={'x': 20, 'y': 20})
                    expect(page.locator('textarea.gameplay-input')).to_be_focused()

                open_typing()
                for seconds in [15, 30, 60, 120]:
                    page.locator(f'[data-speed-config="time-{seconds}"]').click()
                    assert snapshot()['config'] == f'time-{seconds}'
                page.locator('[data-speed-category="words"]').click()
                for count in [10, 25, 50, 100]:
                    page.locator(f'[data-speed-config="words-{count}"]').click()
                    assert snapshot()['config'] == f'words-{count}'
                page.locator('[data-speed-category="time"]').click()
                checks.append({'browser': browser_name, 'case': 'all duration and word-count controls'})

                for _ in range(5):
                    focus_words()
                    page.keyboard.type('hello')
                    assert snapshot()['buffer'] == 'hello'
                    page.keyboard.press('Tab')
                    s = snapshot()
                    assert s['phase'] == 'PREPARING' and s['buffer'] == '' and s['index'] == 0 and s['docks'] == 1, s
                focus_words()
                page.keyboard.type('word')
                page.keyboard.press('Escape')
                assert snapshot()['screen'] == 'PAUSED'
                page.keyboard.press('Escape')
                assert snapshot()['phase'] == 'ACTIVE' and snapshot()['buffer'] == 'word'
                focus_words()
                deadline = snapshot()['deadline']
                page.keyboard.press('Shift+Tab')
                assert snapshot()['buffer'] == 'word' and snapshot()['deadline'] == deadline
                focus_words()
                for extra in [{'ctrlKey': True}, {'altKey': True}, {'metaKey': True}, {'repeat': True}, {'isComposing': True}]:
                    page.locator('textarea.gameplay-input').dispatch_event('keydown', {'key': 'Tab', **extra})
                    assert snapshot()['buffer'] == 'word'
                checks.append({'browser': browser_name, 'case': 'Tab, Escape, repeated resets, Shift+Tab, modifiers and IME'})

                for position in ['top', 'center', 'top', 'center']:
                    old = snapshot()
                    page.locator(f'[data-speed-timer-position="{position}"]').click()
                    now = snapshot()
                    for key in ['index', 'buffer', 'deadline', 'started']:
                        assert now[key] == old[key], (key, old, now)
                    assert now['docks'] == 1
                    focus_words()
                    page.keyboard.type('a')
                    assert snapshot()['buffer'] == old['buffer'] + 'a', snapshot()
                checks.append({'browser': browser_name, 'case': 'timer changes retain attempt and connected input'})

                for size, pixels in [('small', 28), ('medium', 34), ('large', 42), ('auto', None), ('large', 42)]:
                    old = snapshot()
                    page.locator('select[data-speed-font-size]').select_option(size)
                    page.wait_for_timeout(100)
                    now = snapshot()
                    for key in ['index', 'buffer', 'deadline', 'started']:
                        assert now[key] == old[key]
                    g = page.evaluate(GEOMETRY)
                    if pixels is not None:
                        assert abs(g['font'] - pixels) < 0.1, g
                    assert g['lines'] == 3 and g['activeVisible'], g
                page.screenshot(path=str(ARTIFACTS / f'{browser_name}-large-text.png'))
                open_typing()  # Reload the real app and validate the persisted selection.
                expect(page.locator('select[data-speed-font-size]')).to_have_value('large')
                saved = page.evaluate("JSON.parse(localStorage.getItem('wordstrike_save'))")
                assert saved['currentFurthestLevel'] == 9 and saved['levels']['1']['bestScore'] == 3400
                checks.append({'browser': browser_name, 'case': 'font size, live reflow, persistence and existing data'})

                focus_words()
                words = page.evaluate("async()=>{const {getCurrentSpeedTest}=await import('./js/speedTest.js');return getCurrentSpeedTest().words.slice(0,60)}")
                page.keyboard.type(' '.join(words) + ' ', delay=1)
                page.wait_for_timeout(150)
                assert snapshot()['index'] == 60, snapshot()
                assert page.evaluate(GEOMETRY)['activeVisible']
                page.set_viewport_size({'width': 1280, 'height': 480})
                page.wait_for_timeout(150)
                g = page.evaluate(GEOMETRY)
                assert g['lines'] == 3 and g['activeVisible'] and not g['short'], g
                page.keyboard.press('Tab')
                assert snapshot()['index'] == 0 and snapshot()['phase'] == 'PREPARING'
                checks.append({'browser': browser_name, 'case': 'rolling rows, live resize and clean restart'})

                page.locator('[data-speed-category="words"]').click()
                page.locator('[data-speed-config="words-10"]').click()
                focus_words()
                words = page.evaluate("async()=>{const {getCurrentSpeedTest}=await import('./js/speedTest.js');return getCurrentSpeedTest().words.slice(0,10)}")
                page.keyboard.type(' '.join(words) + ' ', delay=2)
                expect(page.locator('.speed-results-screen')).to_be_visible()
                assert snapshot()['docks'] == 0
                page.wait_for_timeout(250)
                page.keyboard.press('Tab')
                expect(page.locator('.speed-test-screen')).to_be_visible()
                assert snapshot()['phase'] == 'PREPARING' and snapshot()['docks'] == 1
                checks.append({'browser': browser_name, 'case': 'completion, Results Tab retry and listener cleanup'})
                assert not errors, errors
                context.close()

                if browser_name == 'chromium':
                    context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
                    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                    page = context.new_page()
                    page.goto(base + '?dev=1&mode=speed-test&seed=17')
                    expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                    page.locator('#speed-test-word-viewport').tap(position={'x': 20, 'y': 20})
                    page.keyboard.type('hello')
                    page.set_viewport_size({'width': 390, 'height': 340})
                    page.wait_for_timeout(250)
                    g = page.evaluate(GEOMETRY)
                    assert g['lines'] == 2 and g['activeVisible'] and g['bottom'] <= g['screenBottom'] + 1, g
                    assert page.evaluate(SNAPSHOT)['buffer'] == 'hello'
                    page.screenshot(path=str(ARTIFACTS / 'chromium-keyboard-shrink.png'))
                    checks.append({'browser': browser_name, 'case': 'software-keyboard viewport shrink preserves both rows', **g})
                    context.close()
                browser.close()
        result['success'] = True
        print(f'PASS: {len(checks)} browser scenarios; all assertions passed.', flush=True)
    except Exception:
        result['error'] = traceback.format_exc()
        print(result['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-regressions.json').write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
