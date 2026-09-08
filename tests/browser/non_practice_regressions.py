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
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
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
    assert "Arcade Rush" in meta and "Daily Strike" not in meta
    assert "Arcade Rush" in og and "Daily Strike" not in og
    manifest = page.evaluate("async()=>await (await fetch('./manifest.webmanifest')).json()")
    assert "Arcade Rush" in manifest["description"] and "daily" not in manifest["description"].lower()
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()
    active = page.locator("button.mode-card.available").evaluate_all("els => els.map(e => e.dataset.modeId)")
    assert active == ["campaign", "speed-test", "endless", "arcade-rush"], active
    assert overflow(page) <= 1
    checks.append({"browser": browser_name, "case": "title metadata and active mode navigation"})
    assert_no_errors(errors, "title/modes")
    context.close()


def settings_profile_leaderboards(browser, base, browser_name, checks):
    context, page, errors = new_page(browser, base)
    page.goto(base)
    page.locator('[data-action="settings"]').click()
    expect(page.locator(".settings-screen")).to_be_visible()
    expect(page.locator('[data-tutorial-id="arcade-rush"]')).to_be_visible()
    assert page.locator('[data-tutorial-id="daily"]').count() == 0
    assert "DAILY STRIKE" not in page.locator(".settings-panel").inner_text().upper()
    strict = page.locator('[data-setting="strictMode"]')
    before = strict.inner_text()
    strict.click()
    after = strict.inner_text()
    assert before != after
    page.reload()
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="settings"]').click()
    assert page.locator('[data-setting="strictMode"]').inner_text() == after
    page.locator('[data-tutorial-id="arcade-rush"]').click()
    dialog = page.locator('.onboarding-dialog[data-tutorial-id="arcade-rush"]')
    expect(dialog).to_be_visible()
    assert "ARCADE RUSH GUIDE" in dialog.inner_text()
    page.locator('[data-onboarding-action="close"]').click()
    expect(dialog).to_have_count(0)
    page.locator('[data-action="back"]').first.click()
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="profile"]').click()
    expect(page.locator(".profile-stats-screen")).to_be_visible()
    tabs = page.locator("[data-stats-tab]").evaluate_all("els => els.map(e => e.textContent.trim())")
    assert "ARCADE RUSH" in tabs and all("DAILY" not in label for label in tabs)
    assert overflow(page, ".profile-stats-screen") <= 1
    page.locator('[data-stats-action="back"]').click()
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="open-leaderboards"]').click()
    expect(page.locator(".leaderboards-screen")).to_be_visible()
    labels = page.locator(".leaderboard-tabs button").evaluate_all("els => els.map(e => e.textContent.trim())")
    assert labels == ["CAMPAIGN", "TYPING TEST", "ENDLESS", "ARCADE RUSH"], labels
    expect(page.locator('[data-action="leaderboard-select-arcade-rush"]')).to_be_visible()
    assert overflow(page, ".leaderboards-screen") <= 1
    checks.append({"browser": browser_name, "case": "settings persistence, Rush guide, profile and offline leaderboards"})
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


def arcade_rush_desktop(browser, base, browser_name, checks):
    context, page, errors = new_page(browser, base)
    page.goto(base + "?dev=1&mode=arcade-rush&seed=55")
    expect(page.locator('[data-rush-view="ready"]')).to_be_visible()
    page.locator('[data-rush-action="start"]').click()
    expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible()
    expect(page.locator(".gameplay-input-dock")).to_have_count(1)
    assert page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 1
    pause = page.locator('[data-rush-action="pause"]')
    expect(pause).to_be_visible()
    pause.click()
    expect(page.locator('[data-rush-role="pause-overlay"]')).to_be_visible()
    page.locator('[data-rush-action="resume"]').click()
    expect(page.locator('[data-rush-role="pause-overlay"]')).to_be_hidden()
    checks.append({"browser": browser_name, "case": "Arcade Rush start, shared input and pause control layering"})
    assert_no_errors(errors, "arcade rush desktop")
    context.close()


def mobile_shared_inputs(browser, base, browser_name, checks):
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
    assert_no_errors(errors, "campaign mobile")
    context.close()

    context, page, errors = new_page(browser, base, mobile=True, width=390, height=844)
    page.goto(base + "?dev=1&mode=arcade-rush&seed=67")
    page.locator('[data-rush-action="start"]').click()
    expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible()
    expect(page.locator(".gameplay-input-dock")).to_have_count(1)
    expect(page.locator(".gameplay-keyboard-trigger")).to_be_visible()
    layer = page.locator(".arcade-rush-word-layer")
    layer.tap(position={"x": 60, "y": 250})
    expect(page.locator("textarea.gameplay-input")).to_be_focused()
    word = page.locator(".word-position").first
    expect(word).to_be_attached(timeout=7000)
    text = word.get_attribute("aria-label")
    assert text
    page.locator("textarea.gameplay-input").evaluate("(el, data) => el.dispatchEvent(new InputEvent(\"beforeinput\", {bubbles:true,cancelable:true,inputType:\"insertText\",data}))", text[0])
    page.wait_for_timeout(80)
    typed = page.locator(".typed-letter").filter(has_text=text[0]).count()
    assert typed >= 1, f"Arcade Rush did not consume soft input for {text!r}"
    page.set_viewport_size({"width": 390, "height": 360})
    page.wait_for_timeout(150)
    geom = page.locator(".arcade-rush-gameplay").evaluate("el => ({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,short:document.body.classList.contains('gameplay-viewport-short'),docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})")
    assert geom["docOverflow"] <= 1, geom
    page.locator('[data-rush-action="pause"]').click()
    expect(page.locator('[data-rush-role="pause-overlay"]')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / "chromium-arcade-rush-mobile.png"))
    checks.append({"browser": browser_name, "case": "mobile Campaign and Arcade Rush soft-keyboard input", **geom})
    assert_no_errors(errors, "arcade rush mobile")
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
                arcade_rush_desktop(browser, base, browser_name, checks)
                mobile_shared_inputs(browser, base, browser_name, checks)
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
