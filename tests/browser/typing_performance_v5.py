"""Browser certification for Typing Performance Timeline V5."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import re
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
    expect(page.locator('[data-speed-performance-v4]')).to_be_visible(timeout=5000)
    expect(page.locator('[data-speed-performance-v5]')).to_be_visible(timeout=5000)


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
                context = browser.new_context(
                    viewport={'width': width, 'height': height},
                    has_touch=touch,
                    **({'is_mobile': True} if touch else {}),
                )
                context.route('**/*', lambda route: route.continue_()
                              if route.request.url.startswith(base) else route.abort())
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base + '?dev=1&mode=speed-test&seed=519')
                expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                complete_words_test(page, delay=18 if touch else 24)

                v5 = page.locator('[data-speed-performance-v5]')
                expect(v5).to_have_attribute('data-performance-version', '5')
                expect(page.locator('link[data-speed-performance-v5-style]')).to_have_count(1)
                assert v5.locator('.speed-performance-v5-metrics > div').count() == 4
                assert v5.locator('.speed-performance-v5-trend-card').count() == 2
                assert v5.locator('.speed-performance-v5-card').count() == 2
                expect(v5).to_contain_text('Baseline & recurring weaknesses')
                expect(v5).to_contain_text('Baseline building')

                focus_button = v5.locator('[data-v5-copy-focus]')
                expect(focus_button).to_be_visible()
                focus_text = focus_button.get_attribute('data-focus-text')
                assert focus_text and focus_text.strip(), focus_text
                focus_button.click(force=True)
                expect(v5.locator('[data-v5-copy-status]')).to_have_text(
                    re.compile(r'(Focus words copied|Copy unavailable)')
                )

                overflow = page.evaluate("""() => ({
                  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  panel: document.querySelector('.speed-results-panel').scrollWidth
                    - document.querySelector('.speed-results-panel').clientWidth,
                  v5: document.querySelector('[data-speed-performance-v5]').scrollWidth
                    - document.querySelector('[data-speed-performance-v5]').clientWidth,
                })""")
                assert overflow['page'] <= 1, overflow
                assert overflow['panel'] <= 1, overflow
                assert overflow['v5'] <= 1, overflow

                page.screenshot(
                    path=str(ARTIFACTS / f'typing-performance-v5-{width}x{height}.png'),
                    full_page=True,
                )
                assert not errors, errors
                report['checks'].append({
                    'viewport': f'{width}x{height}',
                    'touch': touch,
                    'focus_words': focus_text,
                    'overflow': overflow,
                })
                context.close()
            browser.close()
        report['success'] = True
        print('PASS: Typing Performance Timeline V5 certified on desktop and mobile.', flush=True)
    except Exception:
        report['error'] = traceback.format_exc()
        print(report['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-performance-v5.json').write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
