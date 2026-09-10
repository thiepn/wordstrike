"""Browser certification for the Typing Test performance timeline V1."""
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


def timeline_snapshot(page):
    return page.evaluate("""async () => {
      const { getCurrentSpeedTest } = await import('./js/speedTest.js');
      const state = getCurrentSpeedTest();
      const timeline = state?.result?.modeData?.performanceTimeline;
      return timeline ? {
        points: timeline.points.length,
        mistakes: timeline.mistakes.length,
        errors: timeline.points.reduce((sum, point) => sum + point.errors, 0),
        backspaces: timeline.points.reduce((sum, point) => sum + point.backspaces, 0),
        peakWpm: timeline.analysis?.peakWpm,
        fastest5sWpm: timeline.analysis?.fastest5sWpm,
        duration: timeline.activeDurationMs,
      } : null;
    }""")


def complete_words_test(page, delay=22):
    # Configuration interaction itself is covered by the existing Typing regressions.
    # Invoke the same DOM handlers directly here so this graph-focused certification
    # is not coupled to compact/mobile topbar hit-testing.
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
    expect(page.locator('[data-speed-performance]')).to_be_visible(timeout=5000)


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
                page.goto(base + '?dev=1&mode=speed-test&seed=91')
                expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                complete_words_test(page)

                timeline = timeline_snapshot(page)
                assert timeline is not None, 'completed result must retain timeline data'
                assert timeline['points'] >= 1, timeline
                assert timeline['mistakes'] >= 1, timeline
                assert timeline['errors'] >= 1, timeline
                assert timeline['backspaces'] >= 1, timeline
                assert timeline['peakWpm'] >= 0, timeline
                assert timeline['duration'] > 0, timeline

                expect(page.locator('.speed-performance-line--wpm')).to_have_count(1)
                expect(page.locator('.speed-performance-line--raw')).to_have_count(1)
                expect(page.locator('.speed-performance-error-marker')).not_to_have_count(0)
                expect(page.locator('.speed-performance-average')).to_have_count(1)

                chart = page.locator('[data-speed-performance-svg]')
                expect(chart).to_be_visible()
                box = chart.bounding_box()
                assert box and box['width'] <= width + 1, box

                if touch:
                    chart.tap(position={'x': box['width'] * 0.55, 'y': box['height'] * 0.45}, force=True)
                else:
                    chart.hover(position={'x': box['width'] * 0.55, 'y': box['height'] * 0.45})
                expect(page.locator('[data-speed-performance-tooltip]')).to_be_visible()
                expect(page.locator('[data-speed-performance-crosshair]')).to_have_attribute('visibility', 'visible')

                if not touch:
                    chart.focus()
                    page.keyboard.press('Home')
                    page.keyboard.press('ArrowRight')
                    expect(page.locator('[data-speed-performance-tooltip]')).to_be_visible()

                overflow = page.evaluate("""() => ({
                  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  panel: document.querySelector('.speed-results-panel').scrollWidth
                    - document.querySelector('.speed-results-panel').clientWidth,
                  stored: JSON.parse(localStorage.getItem('wordstrike_speed_test_timelines_v1') || '[]').length,
                })""")
                assert overflow['page'] <= 1, overflow
                assert overflow['panel'] <= 1, overflow
                assert overflow['stored'] >= 1, overflow

                page.screenshot(path=str(ARTIFACTS / f'typing-performance-v1-{width}x{height}.png'), full_page=True)
                assert not errors, errors
                report['checks'].append({
                    'viewport': f'{width}x{height}',
                    'touch': touch,
                    'timeline': timeline,
                    'overflow': overflow,
                })
                context.close()
            browser.close()
        report['success'] = True
        print('PASS: Typing Performance Timeline V1 certified on desktop and mobile.', flush=True)
    except Exception:
        report['error'] = traceback.format_exc()
        print(report['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-performance-v1.json').write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
