"""Cross-mode browser regressions for active WordStrike surfaces except Practice Lab.

Run with:
  pip install -r tests/browser/requirements.txt
  python -m playwright install chromium firefox
  python tests/browser/non_practice_regressions.py
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
ARTIFACTS = ROOT / "browser-artifacts" / "non-practice"

SEED_STORAGE = """() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:2, typing:1, endless:1, boss:1, leaderboards:1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  if (!localStorage.getItem('wordstrike_save')) localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel: 10,
    levels: {1:{grade:'A',bestWPM:81,bestAccuracy:98.5,bestScore:3100}},
    settings: {strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
} """


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def overflow(page, selector=".screen"):
    return page.locator(selector).evaluate("el => el.scrollWidth - el.clientWidth")


def new_page(browser, base, *, mobile=False, width=1440, height=900, seed=True):
    options = {"viewport": {"width": width, "height": height}}
    if mobile:
        options.update({"has_touch": True})
        if browser.browser_type.name == "chromium":
            options["is_mobile"] = True
    context = browser.new_context(**options)
    if seed:
        context.add_init_script(f"({SEED_STORAGE})();")
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return context, page, errors


def assert_no_errors(errors, label):
    assert not errors, f"{label}: page errors: {errors}"


def title_and_shell_checks(browser, base, browser_name, checks):
    context, page, errors = new_page(browser, base)
    page.goto(base)
    expect(page.locator(".menu-screen")).to_be_visible()
    assert overflow(page) <= 1
    meta = page.locator('meta[name="description"]').get_attribute("content")
    og = page.locator('meta[property="og:description"]').get_attribute("content")
    assert "Flow" in meta and "Arcade Rush" not in meta and "Daily Strike" not in meta
    assert "Flow" in og and "Arcade Rush" not in og and "Daily Strike" not in og
    manifest = page.evaluate("async()=>await (await fetch('./manifest.webmanifest')).json()")
    assert "Flow" in manifest["description"] and "Arcade Rush" not in manifest["description"]
    assert "daily" not in manifest["description"].lower()
    expect(page.locator(".title-description")).to_contain_text("Flow")
    expect(page.locator(".title-description")).not_to_contain_text("Arcade Rush")
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()
    active = page.locator("button.mode-option.available").evaluate_all("els => els.map(e => e.dataset.modeId)")
    assert active == ["campaign", "speed-test", "endless", "flow", "practice"], active
    assert page.locator('[data-mode-id="arcade-rush"]').count() == 0
    flow = page.locator('button[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    assert flow.get_attribute("aria-disabled") is None
    practice = page.locator('button[data-mode-id="practice"]')
    expect(practice).to_be_enabled()
    assert overflow(page) <= 1
    checks.append({"browser": browser_name, "case": "Flow release metadata and five-mode public navigation"})
    assert_no_errors(errors, "title/modes")
    context.close()


def settings_profile_leaderboards(browser, base, browser_name, checks):
    context, page, errors = new_page(browser, base)
    page.goto(base)
    page.locator('[data-action="settings"]').click()
    expect(page.locator(".settings-screen")).to_be_visible()
    assert page.locator('[data-tutorial-id="arcade-rush"]').count() == 0
    assert page.locator('[data-tutorial-id="daily"]').count() == 0
    strict = page.locator('[data-setting="strictMode"]')
    before = strict.inner_text()
    strict.click()
    after = strict.inner_text()
    assert before != after
    page.reload()
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="settings"]').click()
    assert page.locator('[data-setting="strictMode"]').inner_text() == after
    page.locator('[data-action="back"]').first.click()
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="profile"]').click()
    expect(page.locator(".profile-stats-screen")).to_be_visible()
    tabs = page.locator("[data-stats-tab]").evaluate_all("els => els.map(e => e.textContent.trim())")
    assert "ARCADE RUSH" not in tabs and all("DAILY" not in label for label in tabs)
    assert overflow(page, ".profile-stats-screen") <= 1
    page.locator('[data-stats-action="back"]').click()
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="open-leaderboards"]').click()
    expect(page.locator(".leaderboards-screen")).to_be_visible()
    labels = page.locator(".leaderboard-tabs button").evaluate_all("els => els.map(e => e.textContent.trim())")
    assert labels == ["CAMPAIGN", "TYPING TEST", "ENDLESS", "FLOW"], labels
    assert page.locator('[data-action="leaderboard-select-arcade-rush"]').count() == 0
    assert overflow(page, ".leaderboards-screen") <= 1
    checks.append({"browser": browser_name, "case": "settings persistence plus retired-mode profile and leaderboard suppression"})
    assert_no_errors(errors, "settings/profile/leaderboards")
    context.close()


def campaign_and_boss(browser, base, browser_name, checks):
    context, page, errors = new_page(browser, base)
    page.goto(base + "?dev=1&seed=33")
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".level-screen")).to_be_visible()
    assert page.locator('[data-level="10"]:not(:disabled)').count() == 1
    page.locator('[data-level="1"]').click()
    expect(page.locator(".game-screen")).to_be_visible()
    expect(page.locator(".gameplay-input-dock")).to_have_count(1)
    page.locator('[data-gameplay-action="pause"]').click()
    expect(page.locator(".pause-overlay")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator(".pause-overlay")).to_have_count(0)
    page.keyboard.press("Escape")
    expect(page.locator(".pause-overlay")).to_be_visible()
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    page.locator('[data-level="10"]').click()
    expect(page.locator(".boss-screen")).to_be_visible()
    expect(page.locator(".gameplay-input-dock")).to_have_count(1)
    page.locator('[data-gameplay-action="pause"]').click()
    expect(page.locator(".pause-overlay")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator(".pause-overlay")).to_have_count(0)
    checks.append({"browser": browser_name, "case": "campaign and boss start, pause/resume and shared input lifecycle"})
    assert_no_errors(errors, "campaign/boss")
    context.close()


def endless(browser, base, browser_name, checks):
    context, page, errors = new_page(browser, base)
    page.goto(base + "?dev=1&mode=endless&seed=44&stage=3")
    expect(page.locator(".endless-ready-screen")).to_be_visible()
    page.locator('[data-action="endless-start"]').click()
    expect(page.locator(".endless-screen")).to_be_visible()
    expect(page.locator(".gameplay-input-dock")).to_have_count(1)
    expect(page.locator("#endless-stage")).to_have_text("3")
    page.locator('[data-gameplay-action="pause"]').click()
    expect(page.locator(".pause-overlay")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator(".pause-overlay")).to_have_count(0)
    assert overflow(page, ".endless-screen") <= 1
    checks.append({"browser": browser_name, "case": "Endless developer start, input dock and pause/resume"})
    assert_no_errors(errors, "endless")
    context.close()


def mobile_campaign_input(browser, base, browser_name, checks):
    if browser_name != "chromium":
        return
    context, page, errors = new_page(browser, base, mobile=True, width=390, height=844)
    page.goto(base + "?dev=1&seed=66")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    page.locator('[data-level="1"]').click()
    expect(page.locator(".game-screen")).to_be_visible()
    expect(page.locator(".gameplay-keyboard-trigger")).to_be_visible()
    page.locator("#play-area").tap(position={"x": 30, "y": 160})
    expect(page.locator("textarea.gameplay-input")).to_be_focused()
    page.locator("textarea.gameplay-input").evaluate("(el, data) => el.dispatchEvent(new InputEvent(\"beforeinput\", {bubbles:true,cancelable:true,inputType:\"insertText\",data}))", "a")
    assert overflow(page, ".game-screen") <= 1
    checks.append({"browser": browser_name, "case": "mobile Campaign soft-keyboard input"})
    assert_no_errors(errors, "campaign mobile")
    context.close()



def firefox_storage_fallback(browser, base, browser_name, checks):
    if browser_name != "firefox":
        return

    context = browser.new_context(viewport={"width": 1280, "height": 800})
    context.add_init_script("""(() => {
      const local = window.localStorage;
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function(...args) {
          if (this === local) {
            throw new DOMException('Firefox storage access blocked for certification', 'SecurityError');
          }
          return original.apply(this, args);
        };
      }
    })();""")
    local_only(context, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    page.goto(base)
    expect(page.locator(".menu-screen")).to_be_visible(timeout=10000)

    result = page.evaluate("""async () => {
      const storageModule = await import('./js/storage.js');
      const modeModule = await import('./js/modeStorage.js');
      const speedModule = await import('./js/speedTest.js');
      const configModule = await import('./js/speedTestConfig.js');
      const authStorageModule = await import('./js/supabaseClient.js');

      const campaign = storageModule.createDefaultSave();
      const campaignSaved = storageModule.saveGame(campaign);
      const campaignProgressSaved = storageModule.updateLevelResult(campaign, 1, {
        grade: 'A',
        accuracy: 98,
        wpm: 72,
        score: 1400,
        maxCombo: 12,
        timeRemaining: 4,
        isBoss: false,
      });

      const mode = modeModule.createDefaultModeData();
      mode.totals.completedSessions = 4;
      const modeSaved = modeModule.saveModeData(mode);

      const authStorage = authStorageModule.createAuthStorageAdapter();
      authStorage?.setItem('wordstrike-firefox-auth-cert', 'persisted-auth');

      const speed = speedModule.startSpeedTest({
        config: configModule.getSpeedTestConfig('words-10'),
        wordPool: ['cat', 'word', 'type', 'fast', 'test', 'code', 'line', 'data'],
        attemptSeed: 9191,
      });
      speed.words.splice(0, speed.words.length, ...Array(9).fill('cat'), 'word');
      speed.currentWordIndex = 9;
      const start = performance.now();
      for (const [index, key] of [...'word'].entries()) {
        speedModule.handleCurrentSpeedTestKey({
          key,
          preventDefault() {},
          ctrlKey: false,
          metaKey: false,
          altKey: false,
        }, start + index + 1);
      }

      return {
        campaignSaved,
        campaignProgressSaved,
        modeSaved,
        typingStatus: speed.result?.localPersistence?.status ?? null,
        typingWarning: speed.result?.localPersistence?.warning ?? null,
        sessionCampaign: Boolean(sessionStorage.getItem('wordstrike_save')),
        sessionMode: Boolean(sessionStorage.getItem('wordstrike_mode_data_v2')),
        sessionAuth: sessionStorage.getItem('wordstrike-firefox-auth-cert'),
        fallbackMarker: sessionStorage.getItem('wordstrike.browser-storage-fallback-keys.v1'),
      };
    }""")

    assert result["campaignSaved"] is True, result
    assert result["campaignProgressSaved"] is True, result
    assert result["modeSaved"] is True, result
    assert result["typingStatus"] == "saved", result
    assert result["typingWarning"] is None, result
    assert result["sessionCampaign"] is True and result["sessionMode"] is True, result
    assert result["sessionAuth"] == "persisted-auth", result
    assert "wordstrike_save" in (result["fallbackMarker"] or ""), result
    assert "wordstrike_mode_data_v2" in (result["fallbackMarker"] or ""), result
    assert "wordstrike-firefox-auth-cert" in (result["fallbackMarker"] or ""), result

    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".menu-screen")).to_be_visible(timeout=10000)
    restored = page.evaluate("""async () => {
      const storageModule = await import('./js/storage.js');
      const modeModule = await import('./js/modeStorage.js');
      const campaign = storageModule.loadSave();
      const mode = modeModule.loadModeData();
      return {
        campaignFurthestLevel: campaign.campaignFurthestLevel,
        level1Wpm: campaign.levels?.['1']?.bestWPM ?? null,
        completedSessions: mode.totals.completedSessions,
      };
    }""")
    assert restored["campaignFurthestLevel"] >= 2, restored
    assert restored["level1Wpm"] == 72, restored
    assert restored["completedSessions"] >= 4, restored
    assert_no_errors(errors, "firefox blocked-localStorage fallback")

    checks.append({
      "browser": browser_name,
      "case": "blocked localStorage fallback survives reload",
      **restored,
    })
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    checks = []
    result = {"sha": os.getenv("GITHUB_SHA"), "checks": checks, "success": False}
    try:
        with sync_playwright() as playwright:
            for browser_name in os.getenv("BROWSERS", "chromium,firefox").split(","):
                browser = getattr(playwright, browser_name).launch(headless=True)
                title_and_shell_checks(browser, base, browser_name, checks)
                settings_profile_leaderboards(browser, base, browser_name, checks)
                campaign_and_boss(browser, base, browser_name, checks)
                endless(browser, base, browser_name, checks)
                mobile_campaign_input(browser, base, browser_name, checks)
                firefox_storage_fallback(browser, base, browser_name, checks)
                browser.close()
        result["success"] = True
        print(f"PASS: {len(checks)} non-Practice browser scenarios; all assertions passed.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "non-practice-regressions.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
