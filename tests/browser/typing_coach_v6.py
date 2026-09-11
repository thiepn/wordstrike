"""Browser certification for Typing Coach & Results 2.0 V6."""
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


def current_words(page, count=10):
    return page.evaluate("""async (count) => {
      const { getCurrentSpeedTest } = await import('./js/speedTest.js');
      return getCurrentSpeedTest().words.slice(0, count);
    }""", count)


def type_current_words(page, make_first_mistake=False, delay=18):
    page.locator('#speed-test-word-viewport').click(position={'x': 20, 'y': 20}, force=True)
    expect(page.locator('textarea.gameplay-input')).to_be_focused()
    words = current_words(page, 10)
    if make_first_mistake:
        first = words[0]
        wrong = 'z' if first[0].lower() != 'z' else 'x'
        page.keyboard.type(wrong, delay=delay)
        page.keyboard.press('Backspace')
        page.keyboard.type(first, delay=delay)
        page.keyboard.press('Space')
        page.keyboard.type(' '.join(words[1:]), delay=delay)
    else:
        page.keyboard.type(' '.join(words), delay=delay)
    expect(page.locator('.speed-results-screen')).to_be_visible(timeout=10000)
    expect(page.locator('[data-speed-results-v6]')).to_be_visible(timeout=10000)
    return words


def start_words_10(page, delay=18):
    page.locator('[data-speed-category="words"]').evaluate("element => element.click()")
    expect(page.locator('[data-speed-config="words-10"]')).to_be_visible()
    page.locator('[data-speed-config="words-10"]').evaluate("element => element.click()")
    return type_current_words(page, make_first_mistake=True, delay=delay)


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
                page.goto(base + '?dev=1&mode=speed-test&seed=619')
                expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                first_words = start_words_10(page, delay=14 if touch else 18)

                shell = page.locator('[data-speed-results-v6]')
                expect(shell).to_have_attribute('data-performance-version', '6')
                expect(page.locator('link[data-typing-coach-v6-style]')).to_have_count(1)
                assert shell.locator('[role="tab"]').count() == 5
                expect(shell.locator('[data-v6-panel="overview"]')).to_be_visible()
                expect(shell).to_contain_text('Recommended next step')

                timeline_tab = shell.locator('[data-v6-tab="timeline"]')
                timeline_tab.click()
                expect(shell.locator('[data-v6-panel="timeline"]')).to_be_visible()
                expect(shell.locator('[data-speed-performance]')).to_be_visible()

                words_tab = shell.locator('[data-v6-tab="words"]')
                words_tab.focus()
                page.keyboard.press('ArrowRight')
                expect(shell.locator('[data-v6-tab="progress"]')).to_have_attribute('aria-selected', 'true')
                page.keyboard.press('End')
                expect(shell.locator('[data-v6-tab="practice"]')).to_have_attribute('aria-selected', 'true')
                practice_panel = shell.locator('[data-v6-panel="practice"]')
                expect(practice_panel).to_be_visible()
                assert practice_panel.locator('[data-coach-practice-type]').count() >= 2
                expect(practice_panel).to_contain_text('Personalized training')

                primary = practice_panel.locator('.typing-coach-drill-card.is-primary [data-coach-practice-type]')
                expect(primary).to_have_count(1)
                primary.evaluate('element => element.click()')
                overlay = page.locator('[data-typing-coach-practice-overlay]')
                expect(overlay).to_be_visible(timeout=5000)
                expect(overlay.locator('[data-coach-practice-root] .practice-lab-shell')).to_be_visible(timeout=10000)
                active_cycle = page.evaluate("""async () => {
                  const { loadActiveTypingCoachCycle } = await import('./js/speedTestCoachV6.js');
                  return loadActiveTypingCoachCycle();
                }""")
                assert active_cycle and active_cycle['drill']['target'], active_cycle

                overlay.locator('.typing-coach-practice-chrome [data-coach-retest-original]').click()
                expect(page.locator('#speed-test-word-viewport')).to_be_visible(timeout=5000)
                config_id = page.evaluate("""async () => {
                  const { getCurrentSpeedTest } = await import('./js/speedTest.js');
                  return getCurrentSpeedTest().config.configId;
                }""")
                assert config_id == 'words-10', config_id
                retest_words = type_current_words(page, make_first_mistake=False, delay=10 if touch else 14)
                assert len(retest_words) == 10
                expect(page.locator('[data-typing-coach-comparison]').first).to_be_visible(timeout=10000)
                expect(page.locator('[data-typing-coach-comparison]').first).to_contain_text('Before → retest')

                overflow = page.evaluate("""() => ({
                  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  panel: document.querySelector('.speed-results-panel').scrollWidth
                    - document.querySelector('.speed-results-panel').clientWidth,
                  v6: document.querySelector('[data-speed-results-v6]').scrollWidth
                    - document.querySelector('[data-speed-results-v6]').clientWidth,
                })""")
                assert overflow['page'] <= 1, overflow
                assert overflow['panel'] <= 1, overflow
                assert overflow['v6'] <= 1, overflow

                page.screenshot(
                    path=str(ARTIFACTS / f'typing-coach-v6-{width}x{height}.png'),
                    full_page=True,
                )
                assert not errors, errors
                report['checks'].append({
                    'viewport': f'{width}x{height}',
                    'touch': touch,
                    'first_word': first_words[0],
                    'practice_target': active_cycle['drill']['target'],
                    'overflow': overflow,
                })
                context.close()
            browser.close()
        report['success'] = True
        print('PASS: Typing Coach & Results 2.0 V6 certified on desktop and mobile.', flush=True)
    except Exception:
        report['error'] = traceback.format_exc()
        print(report['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-coach-v6.json').write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
