"""Cross-mode browser regression sweep. Practice Lab is intentionally excluded."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "non-practice"
SEED_STORAGE = """() => {
  for (const [id, version] of Object.entries({general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1})) {
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  }
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel:20,
    levels:{1:{grade:'A',bestWPM:82,bestScore:3200}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
}"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def overflow(page, selector='.screen'):
    return page.locator(selector).evaluate("el => ({x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight})")


def wait_title(page):
    expect(page.locator('.menu-screen')).to_be_visible()
    expect(page.locator('[data-action="modes"]')).to_be_visible()


def assert_no_horizontal_overflow(page, selector='.screen'):
    value = overflow(page, selector)
    assert value['x'] <= 1, (selector, value, page.viewport_size)


def close_tutorial(page, tutorial_id):
    dialog = page.locator(f'.onboarding-dialog[data-tutorial-id="{tutorial_id}"]')
    expect(dialog).to_be_visible()
    page.locator('[data-onboarding-action="close"]').click()
    expect(dialog).to_have_count(0)


def open_modes(page):
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-screen')).to_be_visible()


def return_from_paused_to_modes(page, rush=False):
    if rush:
        page.locator('[data-rush-role="pause-overlay"] [data-rush-action="mode-select"]').click()
    else:
        page.locator('.pause-overlay [data-action="modes"]').click()
    expect(page.locator('.mode-screen')).to_be_visible()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    checks = []
    result = {'sha': os.getenv('GITHUB_SHA'), 'checks': checks, 'success': False}
    try:
        with sync_playwright() as playwright:
            for browser_name in os.getenv('BROWSERS', 'chromium,firefox').split(','):
                browser = getattr(playwright, browser_name).launch(headless=True)
                context = browser.new_context(viewport={'width': 1440, 'height': 900})
                context.add_init_script(f'({SEED_STORAGE})();')
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base)
                wait_title(page)
                assert_no_horizontal_overflow(page)
                title_text = page.locator('.menu-screen').inner_text()
                assert 'Daily Strike' not in title_text
                assert page.locator('.menu-list .arcade-button').count() == 4
                checks.append({'browser': browser_name, 'case': 'title boots offline and has four working top-level actions'})

                # Settings: every replay button must resolve to a real tutorial.
                page.locator('[data-action="settings"]').click()
                expect(page.locator('.settings-screen')).to_be_visible()
                ids = page.locator('[data-tutorial-id]').evaluate_all("els => els.map(el => el.dataset.tutorialId)")
                assert ids == ['general', 'campaign', 'typing', 'endless', 'boss', 'leaderboards'], ids
                for tutorial_id in ids:
                    page.locator(f'[data-tutorial-id="{tutorial_id}"]').click()
                    close_tutorial(page, tutorial_id)
                for key in ['strictMode', 'particles', 'screenShake']:
                    button = page.locator(f'[data-setting="{key}"]')
                    before = button.inner_text()
                    button.click()
                    after = page.locator(f'[data-setting="{key}"]').inner_text()
                    assert before != after, (key, before, after)
                assert_no_horizontal_overflow(page)
                page.locator('[data-action="back"]').first.click()
                wait_title(page)
                checks.append({'browser': browser_name, 'case': 'settings controls and every tutorial replay action work'})

                # Profile: all public tabs render, including Arcade Rush, without stale Daily tab.
                page.locator('[data-action="profile"]').click()
                expect(page.locator('.profile-stats-screen')).to_be_visible()
                labels = page.locator('[data-stats-tab]').evaluate_all("els => els.map(el => el.textContent.trim())")
                assert labels == ['OVERVIEW', 'CAMPAIGN', 'TYPING TEST', 'ENDLESS', 'ARCADE RUSH', 'RECENT', 'PROFILE'], labels
                for index, label in enumerate(labels):
                    page.locator(f'[data-stats-tab="{index}"]').click()
                    expect(page.locator('.profile-tab-panel')).to_have_attribute('data-active-tab', label)
                assert 'DAILY' not in page.locator('.profile-stats-screen').inner_text().upper()
                assert_no_horizontal_overflow(page)
                page.locator('[data-stats-action="back"]').click()
                wait_title(page)
                checks.append({'browser': browser_name, 'case': 'all profile/statistics tabs render and retired Daily tab is absent'})

                # Leaderboards degrade to local/offline operation and all current tabs remain switchable.
                page.locator('[data-action="open-leaderboards"]').click()
                expect(page.locator('.leaderboards-screen')).to_be_visible()
                expect(page.locator('.leaderboard-content')).to_be_visible()
                board_labels = page.locator('.leaderboard-tabs [role="tab"]').evaluate_all("els => els.map(el => el.textContent.trim())")
                assert board_labels == ['CAMPAIGN', 'TYPING TEST', 'ENDLESS', 'ARCADE RUSH'], board_labels
                for action in ['leaderboard-select-campaign', 'leaderboard-select-typing', 'leaderboard-select-endless', 'leaderboard-select-arcade-rush']:
                    page.locator(f'[data-action="{action}"]').click()
                    page.wait_for_timeout(50)
                assert 'Daily Strike' not in page.locator('.leaderboards-screen').inner_text()
                assert_no_horizontal_overflow(page)
                page.locator('[data-action="leaderboard-main-menu"]').first.click()
                wait_title(page)
                checks.append({'browser': browser_name, 'case': 'leaderboards remain usable offline and expose current four boards'})

                # Mode registry, Campaign run and pause lifecycle.
                open_modes(page)
                enabled = page.locator('.mode-card.available').evaluate_all("els => els.map(el => el.dataset.modeId)")
                assert enabled == ['campaign', 'speed-test', 'endless', 'arcade-rush'], enabled
                assert page.locator('[data-mode-id="practice"][aria-disabled="true"]').count() == 1
                assert page.locator('[data-mode-id="daily"]').count() == 0
                page.locator('[data-mode-id="campaign"]').click()
                expect(page.locator('.level-screen')).to_be_visible()
                page.locator('[data-level="1"]').click()
                expect(page.locator('.game-screen')).to_be_visible()
                assert page.locator('.gameplay-input-dock').count() == 1
                page.keyboard.press('Escape')
                expect(page.locator('.pause-overlay')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.locator('.pause-overlay')).to_have_count(0)
                page.keyboard.press('Escape')
                return_from_paused_to_modes(page)
                checks.append({'browser': browser_name, 'case': 'Campaign launch, input mount, pause/resume and mode exit'})

                # Endless lifecycle.
                page.locator('[data-mode-id="endless"]').click()
                expect(page.locator('.endless-ready-screen')).to_be_visible()
                page.locator('[data-action="endless-start"]').click()
                expect(page.locator('.endless-screen')).to_be_visible()
                assert page.locator('.gameplay-input-dock').count() == 1
                page.keyboard.press('Escape')
                expect(page.locator('.pause-overlay')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.locator('.pause-overlay')).to_have_count(0)
                page.keyboard.press('Escape')
                return_from_paused_to_modes(page)
                checks.append({'browser': browser_name, 'case': 'Endless launch, input mount, pause/resume and mode exit'})

                # Arcade Rush lifecycle: shared input must be mounted even on desktop, then pause/resume/exit.
                page.locator('[data-mode-id="arcade-rush"]').click()
                expect(page.locator('[data-rush-view="ready"]')).to_be_visible()
                page.locator('[data-rush-action="start"]').click()
                expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible()
                assert page.locator('.gameplay-input-dock').count() == 1
                page.keyboard.press('Escape')
                pause = page.locator('[data-rush-role="pause-overlay"]')
                expect(pause).to_be_visible()
                page.keyboard.press('Escape')
                expect(pause).to_be_hidden()
                page.keyboard.press('Escape')
                expect(pause).to_be_visible()
                return_from_paused_to_modes(page, rush=True)
                checks.append({'browser': browser_name, 'case': 'Arcade Rush launch, shared input mount, pause/resume and mode exit'})

                # Typing remains reachable after cross-mode navigation.
                page.locator('[data-mode-id="speed-test"]').click()
                expect(page.locator('.speed-test-screen')).to_be_visible()
                assert page.locator('.gameplay-input-dock').count() == 1
                page.keyboard.press('Escape')
                page.locator('.pause-overlay [data-action="modes"]').click()
                expect(page.locator('.mode-screen')).to_be_visible()
                checks.append({'browser': browser_name, 'case': 'Typing remains reachable after other mode lifecycles'})

                assert not errors, errors
                context.close()

                # Developer boss route exercises the other gameplay shell.
                context = browser.new_context(viewport={'width': 1440, 'height': 900})
                context.add_init_script(f'({SEED_STORAGE})();')
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base + '?dev=1&seed=19')
                wait_title(page)
                open_modes(page)
                page.locator('[data-mode-id="campaign"]').click()
                expect(page.locator('.level-screen.dev-enabled')).to_be_visible()
                page.locator('[data-dev-level="10"]').click()
                expect(page.locator('.boss-screen')).to_be_visible()
                assert page.locator('.gameplay-input-dock').count() == 1
                page.keyboard.press('Escape')
                expect(page.locator('.pause-overlay')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.locator('.pause-overlay')).to_have_count(0)
                assert not errors, errors
                checks.append({'browser': browser_name, 'case': 'Boss dev launch and pause/resume lifecycle'})
                context.close()

                # Responsive product shell. Touch/mobile checks run in Chromium where Playwright emulates mobile/coarse pointer.
                if browser_name == 'chromium':
                    for width, height in [(390, 844), (844, 390), (320, 568)]:
                        context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True, is_mobile=True)
                        context.add_init_script(f'({SEED_STORAGE})();')
                        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                        page = context.new_page()
                        errors = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.goto(base)
                        wait_title(page)
                        assert_no_horizontal_overflow(page)
                        for action, screen in [('settings', '.settings-screen'), ('profile', '.profile-stats-screen')]:
                            page.locator(f'[data-action="{action}"]').click()
                            expect(page.locator(screen)).to_be_visible()
                            assert_no_horizontal_overflow(page)
                            back = '[data-action="back"]' if action == 'settings' else '[data-stats-action="back"]'
                            page.locator(back).first.click()
                            wait_title(page)
                        page.locator('[data-action="open-leaderboards"]').click()
                        expect(page.locator('.leaderboards-screen')).to_be_visible()
                        assert_no_horizontal_overflow(page)
                        page.locator('[data-action="leaderboard-main-menu"]').first.click()
                        wait_title(page)
                        open_modes(page)
                        assert_no_horizontal_overflow(page)

                        # Rush must expose the software-keyboard bridge and fit the actual mobile viewport.
                        page.locator('[data-mode-id="arcade-rush"]').click()
                        page.locator('[data-rush-action="start"]').click()
                        expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible()
                        expect(page.locator('.gameplay-keyboard-trigger')).to_be_visible()
                        rush_view = page.locator('[data-rush-view="gameplay"]')
                        rush_box = rush_view.bounding_box()
                        # Tap a non-control gameplay point.
                        rush_view.tap(position={'x': max(5, rush_box['width'] / 2), 'y': max(120, rush_box['height'] * .65)})
                        expect(page.locator('textarea.gameplay-input')).to_be_focused()
                        page.wait_for_function("async()=>{const {appState}=await import('./js/state.js');return (appState.game?.words?.length||0)>0}", timeout=5000)
                        target = page.evaluate("async()=>{const {appState}=await import('./js/state.js');return appState.game.words.find(w=>!w.resolved)?.text||''}")
                        assert target, 'Arcade Rush should spawn a target word'
                        page.locator('textarea.gameplay-input').evaluate("""(el, value) => {
                          const before = new InputEvent('beforeinput', {
                            bubbles: true, cancelable: true, inputType: 'insertText', data: value,
                          });
                          el.dispatchEvent(before);
                          el.dispatchEvent(new InputEvent('input', {
                            bubbles: true, inputType: 'insertText', data: value,
                          }));
                        }""", target[0])
                        prefix = page.evaluate("async()=>{const {appState}=await import('./js/state.js');return appState.game?.targetingState?.prefix||''}")
                        assert prefix == target[0].lower(), (target, prefix)
                        # Interactive Pause must remain clickable and not be swallowed by keyboard focus handling.
                        page.locator('[data-rush-action="pause"]').click()
                        expect(page.locator('[data-rush-role="pause-overlay"]')).to_be_visible()
                        dims = page.evaluate("() => ({innerHeight, doc: document.documentElement.scrollHeight, body: document.body.scrollHeight})")
                        assert dims['doc'] <= dims['innerHeight'] + 2, dims
                        assert not errors, errors
                        page.screenshot(path=str(ARTIFACTS / f'chromium-mobile-{width}x{height}.png'))
                        checks.append({'browser': browser_name, 'case': f'mobile shell + Rush software input {width}x{height}', **dims})
                        context.close()
                browser.close()
        result['success'] = True
        print(f"PASS: {len(checks)} non-Practice browser scenarios; all assertions passed.", flush=True)
    except Exception:
        result['error'] = traceback.format_exc()
        print(result['error'], flush=True)
        raise
    finally:
        (ARTIFACTS / 'non-practice-regressions.json').write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
