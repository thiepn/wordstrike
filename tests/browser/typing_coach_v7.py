"""Browser certification for Typing Coach V7 adaptive training plans."""
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
    expect(page.locator('[data-typing-coach-v7]')).to_be_attached(timeout=10000)
    return words


def start_words_10(page, delay=18):
    page.locator('[data-speed-category="words"]').evaluate("element => element.click()")
    expect(page.locator('[data-speed-config="words-10"]')).to_be_visible()
    page.locator('[data-speed-config="words-10"]').evaluate("element => element.click()")
    return type_current_words(page, make_first_mistake=True, delay=delay)


def complete_current_v7_practice(page):
    completed = page.evaluate("""async () => {
      const v6 = await import('./js/speedTestCoachV6.js');
      const v7 = await import('./js/speedTestCoachV7.js');
      const cycle = v6.loadActiveTypingCoachCycle();
      if (!cycle?.drill) return null;
      const plan = v7.markTypingCoachV7PracticeCompleted({
        sourceSessionId: cycle.sourceSessionId,
        drillType: cycle.drill.type,
        target: cycle.drill.target,
      });
      document.querySelector('[data-coach-close-practice]')?.click();
      return { drillType: cycle.drill.type, target: cycle.drill.target, plan };
    }""")
    assert completed and completed['plan'], completed
    expect(page.locator('[data-typing-coach-practice-overlay]')).to_have_count(0, timeout=5000)
    return completed


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
                page.goto(base + '?dev=1&mode=speed-test&seed=731')
                expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                first_words = start_words_10(page, delay=14 if touch else 18)

                shell = page.locator('[data-speed-results-v6]')
                expect(page.locator('link[data-typing-coach-v7-style]')).to_have_count(1)
                overview_action = shell.locator('[data-v7-open-plan]')
                expect(overview_action).to_be_visible()
                expect(overview_action).to_have_text('OPEN TRAINING PLAN')
                overview_action.click()
                expect(shell.locator('[data-v6-tab="practice"]')).to_have_attribute('aria-selected', 'true')

                panel = shell.locator('[data-v6-panel="practice"]')
                coach = panel.locator('[data-typing-coach-v7]')
                expect(coach).to_be_visible()
                expect(coach).to_contain_text('Adaptive Training Plan')
                expect(coach).to_contain_text("Today's plan")
                expect(coach.locator('[data-v7-step]')).to_have_count(3)
                expect(coach.locator('[data-v7-step="focus"] [data-v7-start-step]')).to_be_enabled()
                expect(coach.locator('[data-v7-step="reinforce"] [data-v7-start-step]')).to_be_disabled()
                expect(coach.locator('[data-v7-retest]')).to_be_disabled()

                coach.locator('[data-v7-step="focus"] [data-v7-start-step]').click()
                overlay = page.locator('[data-typing-coach-practice-overlay]')
                expect(overlay).to_be_visible(timeout=5000)
                expect(overlay.locator('[data-coach-practice-root] .practice-lab-shell')).to_be_visible(timeout=10000)
                first_drill = complete_current_v7_practice(page)
                expect(coach.locator('[data-v7-step="focus"]')).to_contain_text('Complete')
                expect(coach.locator('[data-v7-step="reinforce"] [data-v7-start-step]')).to_be_enabled()

                coach.locator('[data-v7-step="reinforce"] [data-v7-start-step]').click()
                expect(overlay).to_be_visible(timeout=5000)
                expect(overlay.locator('[data-coach-practice-root] .practice-lab-shell')).to_be_visible(timeout=10000)
                second_drill = complete_current_v7_practice(page)
                expect(coach.locator('[data-v7-step="reinforce"]')).to_contain_text('Complete')
                expect(coach.locator('[data-v7-retest]')).to_be_enabled()

                coach.locator('[data-v7-retest]').click()
                expect(page.locator('#speed-test-word-viewport')).to_be_visible(timeout=5000)
                config_id = page.evaluate("""async () => {
                  const { getCurrentSpeedTest } = await import('./js/speedTest.js');
                  return getCurrentSpeedTest().config.configId;
                }""")
                assert config_id == 'words-10', config_id
                type_current_words(page, make_first_mistake=False, delay=10 if touch else 14)
                expect(page.locator('[data-typing-coach-v7-complete]')).to_be_visible(timeout=10000)
                expect(page.locator('[data-typing-coach-v7-complete]')).to_contain_text('Baseline → retest')

                stored = page.evaluate("""async () => {
                  const v7 = await import('./js/speedTestCoachV7.js');
                  return { plan: v7.loadTypingCoachV7Plan(), history: v7.getTypingCoachV7History() };
                }""")
                assert stored['plan']['status'] == 'completed', stored
                assert stored['plan']['retestSessionId'], stored
                assert len(stored['history']) >= 1, stored

                overflow = page.evaluate("""() => ({
                  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  panel: document.querySelector('.speed-results-panel').scrollWidth
                    - document.querySelector('.speed-results-panel').clientWidth,
                  v7: document.querySelector('[data-typing-coach-v7]').scrollWidth
                    - document.querySelector('[data-typing-coach-v7]').clientWidth,
                })""")
                assert overflow['page'] <= 1, overflow
                assert overflow['panel'] <= 1, overflow
                assert overflow['v7'] <= 1, overflow

                page.screenshot(
                    path=str(ARTIFACTS / f'typing-coach-v7-{width}x{height}.png'),
                    full_page=True,
                )
                assert not errors, errors
                report['checks'].append({
                    'viewport': f'{width}x{height}',
                    'touch': touch,
                    'first_word': first_words[0],
                    'first_drill': first_drill['drillType'],
                    'second_drill': second_drill['drillType'],
                    'overflow': overflow,
                })
                context.close()
            browser.close()
        report['success'] = True
        print('PASS: Typing Coach V7 adaptive training plan certified on desktop and mobile.', flush=True)
    except Exception:
        report['error'] = traceback.format_exc()
        print(report['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-coach-v7.json').write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
