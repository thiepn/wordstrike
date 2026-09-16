"""Browser certification for Typing Performance Timeline V3."""
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


def complete_words_test(page, delay=14):
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
    page.locator('[data-v6-tab="progress"]').click()
    expect(page.locator('[data-speed-performance-v3]')).to_be_visible(timeout=5000)


def seed_previous_pb(page):
    return page.evaluate("""async () => {
      const { getCurrentSpeedTest } = await import('./js/speedTest.js');
      const { loadModeData, saveModeData } = await import('./js/modeStorage.js');
      const { persistSpeedTestTimeline } = await import('./js/speedTestTimeline.js');
      const result = getCurrentSpeedTest()?.result;
      const timeline = result?.modeData?.performanceTimeline;
      if (!result || !timeline) return false;
      const data = loadModeData();
      const mode = data.modes?.['speed-test'];
      const wordSetId = result.modeData.wordSetId;
      const configId = result.modeData.configId;
      const record = mode?.wordSetRecords?.[wordSetId]?.[configId];
      if (!record) return false;
      const seededId = 'v3-seeded-pb';
      record.bestWpm = result.wpm;
      record.bestRawWpm = result.modeData.rawWpm;
      record.bestAccuracy = result.accuracy;
      record.bestResultAt = result.endedAt - 1000;
      record.sessionId = seededId;
      record.tieAccuracy = result.accuracy;
      record.tieRawWpm = result.modeData.rawWpm;
      data.recentSessions = [{
        sessionId: seededId,
        modeId: 'speed-test',
        variantId: result.variantId,
        endedAt: result.endedAt - 1000,
        success: true,
        score: null,
        grade: null,
        accuracy: result.accuracy,
        wpm: result.wpm,
        activeDurationMs: result.activeDurationMs,
        modeData: {
          configId,
          wordSetId,
          wordSetName: result.modeData.wordSetName,
          wordSetVersion: result.modeData.wordSetVersion,
          wordSetWordCount: result.modeData.wordSetWordCount,
          metricVersion: result.modeData.metricVersion,
          rawWpm: result.modeData.rawWpm,
          correctTestCharacters: result.modeData.correctTestCharacters,
          rawTestCharacters: result.modeData.rawTestCharacters,
          correctSpaces: result.modeData.correctSpaces,
          validSpaces: result.modeData.validSpaces,
          backspaces: result.modeData.backspaces,
          wordDeletes: result.modeData.wordDeletes,
          completedWordCount: result.modeData.completedWordCount,
        },
      }];
      const saved = saveModeData(data);
      const timelineSaved = persistSpeedTestTimeline(seededId, timeline, result.endedAt - 1000);
      return saved && timelineSaved;
    }""")


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
                page.goto(base + '?dev=1&mode=speed-test&seed=319')
                expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                complete_words_test(page, delay=8 if not touch else 15)

                v3 = page.locator('[data-speed-performance-v3]')
                expect(v3).to_have_attribute('data-performance-version', '3')
                assert v3.locator('.speed-performance-zone-labels span').count() == 4
                assert v3.locator('.speed-performance-v3-metrics > div').count() == 4
                expect(page.locator('link[data-speed-performance-v3-style]')).to_have_count(1)
                trend = page.locator('[data-v3-trend-count]')
                expect(trend).to_have_attribute('data-v3-trend-count', '1')

                overflow = page.evaluate("""() => ({
                  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  panel: document.querySelector('.speed-results-panel').scrollWidth - document.querySelector('.speed-results-panel').clientWidth,
                  v3: document.querySelector('[data-speed-performance-v3]').scrollWidth - document.querySelector('[data-speed-performance-v3]').clientWidth,
                  zones: document.querySelectorAll('.speed-performance-zone-labels span').length,
                })""")
                assert overflow['page'] <= 1, overflow
                assert overflow['panel'] <= 1, overflow
                assert overflow['v3'] <= 1, overflow
                assert overflow['zones'] == 4, overflow

                if not touch:
                    assert seed_previous_pb(page), 'Failed to seed a local PB timeline for comparison'
                    page.locator('[data-action="retry"]').click(force=True)
                    expect(page.locator('#speed-test-word-viewport')).to_be_visible()
                    complete_words_test(page, delay=34)
                    v3 = page.locator('[data-speed-performance-v3]')
                    expect(v3.locator('[data-v3-trend-count]')).to_have_attribute('data-v3-trend-count', '2')
                    expect(v3.locator('[data-v3-pb-comparison]')).to_be_visible()
                    assert v3.locator('.speed-performance-mini-line--pb').count() == 1
                    assert v3.locator('.speed-performance-mini-line--current').count() >= 2

                page.screenshot(path=str(ARTIFACTS / f'typing-performance-v3-{width}x{height}.png'), full_page=True)
                assert not errors, errors
                report['checks'].append({'viewport': f'{width}x{height}', 'touch': touch, 'overflow': overflow})
                context.close()
            browser.close()
        report['success'] = True
        print('PASS: Typing Performance Timeline V3 certified on desktop and mobile.', flush=True)
    except Exception:
        report['error'] = traceback.format_exc()
        print(report['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'typing-performance-v3.json').write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
