"""Browser certification for Typing Performance Timeline V4."""
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


def complete_words_test(page, delay=28):
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
    expect(page.locator('[data-speed-performance-v3]')).to_be_visible(timeout=5000)
    expect(page.locator('[data-speed-performance-v4]')).to_be_visible(timeout=5000)


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
                page.goto(base + '?dev=1&mode=speed-test&seed=419')
                expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                complete_words_test(page, delay=18 if touch else 24)

                v4 = page.locator('[data-speed-performance-v4]')
                expect(v4).to_have_attribute('data-performance-version', '4')
                expect(page.locator('link[data-speed-performance-v4-style]')).to_have_count(1)
                assert v4.locator('.speed-performance-v4-metrics > div').count() == 4
                markers = v4.locator('[data-v4-word]')
                assert markers.count() == 10
                expect(v4.locator('.speed-performance-v4-inspector')).to_be_visible()
                expect(v4.locator('.speed-performance-v4-card').first).to_be_visible()
                expect(v4.locator('.speed-performance-v4-mistakes')).to_have_count(1)

                markers.nth(1).click(force=True)
                expect(v4.locator('[data-v4-inspector]')).to_contain_text('Word 2')
                marker_class = markers.nth(1).get_attribute('class') or ''
                assert 'is-selected' in marker_class, marker_class

                profile = page.evaluate("""async () => {
                  const { getCurrentSpeedTest } = await import('./js/speedTest.js');
                  const { finalizeCurrentSpeedTestWordProfile } = await import('./js/speedTestWordProfileV4.js');
                  const profile = finalizeCurrentSpeedTestWordProfile(getCurrentSpeedTest());
                  return profile ? {
                    words: profile.words.length,
                    clean: profile.words.filter(word => word.clean).length,
                    corrections: profile.words.reduce((sum, word) => sum + word.backspaces + word.wordDeletes, 0),
                  } : null;
                }""")
                assert profile and profile['words'] == 10, profile
                assert profile['corrections'] >= 1, profile

                overflow = page.evaluate("""() => ({
                  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  panel: document.querySelector('.speed-results-panel').scrollWidth
                    - document.querySelector('.speed-results-panel').clientWidth,
                  v4: document.querySelector('[data-speed-performance-v4]').scrollWidth
                    - document.querySelector('[data-speed-performance-v4]').clientWidth,
                  wordMap: document.querySelector('.speed-performance-word-map').scrollWidth
                    - document.querySelector('.speed-performance-word-map').clientWidth,
                })""")
                assert overflow['page'] <= 1, overflow
                assert overflow['panel'] <= 1, overflow
                assert overflow['v4'] <= 1, overflow
                assert overflow['wordMap'] <= 1, overflow

                page.screenshot(
                    path=str(ARTIFACTS / f'typing-performance-v4-{width}x{height}.png'),
                    full_page=True,
                )
                assert not errors, errors
                report['checks'].append({
                    'viewport': f'{width}x{height}',
                    'touch': touch,
                    'profile': profile,
                    'overflow': overflow,
                })
                context.close()
            browser.close()
        report['success'] = True
        print('PASS: Typing Performance Timeline V4 certified on desktop and mobile.', flush=True)
    except Exception:
        report['error'] = traceback.format_exc()
        print(report['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-performance-v4.json').write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
