"""Browser certification for Typing Performance Timeline V2."""
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


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def complete_words_test(page, delay=24):
    page.locator('[data-speed-category="words"]').evaluate("element => element.click()")
    expect(page.locator('[data-speed-config="words-10"]')).to_be_visible()
    page.locator('[data-speed-config="words-10"]').evaluate("element => element.click()")
    page.locator('#speed-test-word-viewport').click(position={'x': 20, 'y': 20}, force=True)
    expect(page.locator('textarea.gameplay-input')).to_be_focused()
    words = page.evaluate("""async () => {
      const { getCurrentSpeedTest } = await import('./js/speedTest.js');
      return getCurrentSpeedTest().words.slice(0, 10);
    }""")
    first = words[0]
    wrong = 'z' if first[0].lower() != 'z' else 'x'
    page.keyboard.type(wrong, delay=delay)
    page.keyboard.press('Backspace')
    page.keyboard.type(first, delay=delay)
    page.keyboard.press('Space')
    page.keyboard.type(' '.join(words[1:]), delay=delay)
    expect(page.locator('.speed-results-screen')).to_be_visible(timeout=10000)
    expect(page.locator('[data-speed-results-v6]')).to_be_visible(timeout=10000)
    page.locator('[data-v6-tab="timeline"]').click()
    expect(page.locator('[data-speed-performance]')).to_be_visible(timeout=5000)
    expect(page.locator('[data-speed-performance-v2]')).to_be_visible(timeout=5000)


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    report = {'sha': os.getenv('GITHUB_SHA'), 'checks': [], 'success': False}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            for width, height, touch in [(1280, 800, False), (390, 844, True)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch, **({'is_mobile': True} if touch else {}))
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base + '?dev=1&mode=speed-test&seed=119')
                expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                complete_words_test(page)

                v2 = page.locator('[data-speed-performance-v2]')
                expect(v2).to_have_attribute('data-performance-version', '2')
                assert v2.locator('.speed-performance-segment').count() == 3
                expect(page.locator('[data-speed-performance-sustained]')).to_have_count(1)
                assert page.locator('[data-performance-layer]').count() == 3
                expect(page.locator('[data-speed-performance-compare]')).to_be_visible()
                expect(page.locator('link[data-speed-performance-v2-style]')).to_have_count(1)

                raw_toggle = page.locator('[data-performance-layer="raw"]')
                raw_toggle.click()
                graph_class = page.locator('[data-speed-performance]').get_attribute('class') or ''
                assert 'hide-raw' in graph_class, graph_class
                expect(raw_toggle).to_have_attribute('aria-pressed', 'false')

                overflow = page.evaluate("""() => ({
                  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  panel: document.querySelector('.speed-results-panel').scrollWidth - document.querySelector('.speed-results-panel').clientWidth,
                  segments: document.querySelectorAll('.speed-performance-segment').length,
                  version: document.querySelector('[data-speed-performance]')?.dataset.performanceVersion,
                })""")
                assert overflow['page'] <= 1, overflow
                assert overflow['panel'] <= 1, overflow
                assert overflow['segments'] == 3, overflow
                assert overflow['version'] == '2', overflow
                page.screenshot(path=str(ARTIFACTS / f'typing-performance-v2-{width}x{height}.png'), full_page=True)
                assert not errors, errors
                report['checks'].append({'viewport': f'{width}x{height}', 'touch': touch, 'overflow': overflow})
                context.close()
            browser.close()
        report['success'] = True
        print('PASS: Typing Performance Timeline V2 certified on desktop and mobile.', flush=True)
    except Exception:
        report['error'] = traceback.format_exc()
        print(report['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-performance-v2.json').write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
