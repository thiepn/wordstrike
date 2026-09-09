"""P2: real mode controls, keyboard isolation, HUD geometry, and screenshot evidence.

This suite is a release gate, not a substitute for physical-device testing. It must
pass alongside the existing P1, Typing/UI8, and full non-Practice browser workflows.
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
ARTIFACTS = ROOT / "browser-artifacts" / "customization-p2"
SEED = """(() => {
  for (const [id,v] of Object.entries({general:3,campaign:1,typing:1,endless:1,boss:1,leaderboards:1,'arcade-rush':1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${v}`,'seen');
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def context_for(browser, base, width=1440, height=900, touch=False):
    context = browser.new_context(viewport={"width": width, "height": height}, has_touch=touch)
    context.add_init_script(SEED)
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
    return context


def no_overflow(page):
    state = page.evaluate("""() => ({
      document:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      screen:(()=>{const s=document.querySelector('#app > .screen');return s ? s.scrollWidth-s.clientWidth : 0})()
    })""")
    assert max(state.values()) <= 1, state
    return state


def controls(page, mode, location="ready"):
    return page.locator(f'[data-mode-presentation="{mode}"][data-presentation-location="{location}"]')


def open_controls(page, mode, location="ready"):
    details = controls(page, mode, location)
    expect(details).to_be_attached()
    if details.get_attribute("open") is None:
        details.locator("summary").click()
    return details


def select(details, field, value):
    details.locator(f'[data-mode-setting="{field}"]').select_option(str(value).lower() if isinstance(value, bool) else value)


def screenshot(page, name):
    page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=True, animations="disabled", caret="hide")


def typing_state(page):
    return page.evaluate("""async () => {
      const {getCurrentSpeedTest,getSpeedTestActiveDuration}=await import('./js/speedTest.js');
      const s=getCurrentSpeedTest();
      return {config:JSON.stringify(s.config), seed:s.attemptSeed, words:s.words.slice(),
        phase:s.phase, started:s.activeStartedAtMs, buffer:s.typedBuffer,
        errors:s.metrics.incorrectKeystrokes, completed:s.metrics.wordsCompleted,
        duration:getSpeedTestActiveDuration(s,performance.now())};
    }""")


def certify_typing(browser, name, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "?dev=1&mode=speed-test&seed=171")
    details = open_controls(page, "typing")
    original = typing_state(page)
    details.locator("summary").focus()
    page.keyboard.press("ArrowRight")
    assert typing_state(page)["config"] == original["config"]
    assert typing_state(page)["started"] is None
    # Escape closes the panel without pausing the test.
    page.keyboard.press("Escape")
    assert details.get_attribute("open") is None
    assert typing_state(page)["phase"] == "PREPARING"

    for hud in ("focus", "balanced", "data"):
        for live in (True, False):
            details = open_controls(page, "typing")
            select(details, "typingTest.hudLayout", "balanced")
            select(details, "typingTest.liveStats", live)
            select(details, "typingTest.hudLayout", hud)
            expect(page.locator(".speed-test-screen")).to_have_attribute("data-live-stats", str(live and hud != "focus").lower())
            expect(details.locator('[data-mode-setting="typingTest.liveStats"]')).to_be_disabled() if hud == "focus" else expect(details.locator('[data-mode-setting="typingTest.liveStats"]')).to_be_enabled()
            details.locator("summary").click()
            for size, px in (("auto", None), ("small", 28), ("medium", 34), ("large", 42)):
                page.locator("select[data-speed-font-size]").select_option(size)
                if px:
                    actual = page.locator("#speed-test-word-flow").evaluate("el => parseFloat(getComputedStyle(el).fontSize)")
                    assert actual == px, (size, actual)
                current = typing_state(page)
                assert current["started"] is None and current["config"] == original["config"] and current["words"] == original["words"]
                assert page.locator("#speed-test-primary").is_visible()
                assert page.locator("#speed-test-wpm").is_visible() == (live and hud != "focus")
                assert page.locator("#speed-test-accuracy").is_visible() == (live and hud != "focus")
                assert page.locator("#speed-test-words").is_visible() == (live and hud == "data")
                no_overflow(page)
            if live:
                screenshot(page, f"{name}-typing-{hud}")
    details = open_controls(page, "typing")
    select(details, "typingTest.hudLayout", "data")
    select(details, "typingTest.liveStats", True)
    details.locator("summary").click()
    page.locator("#speed-test-word-viewport").click(position={"x": 15, "y": 15})
    wrong = "x" if original["words"][0].startswith("z") else "z"
    page.keyboard.type(wrong)
    expect(page.locator(".speed-test-screen")).to_have_class(__import__('re').compile("typing-active"))
    state = typing_state(page)
    assert page.locator("#speed-test-errors").inner_text() == str(state["errors"])
    assert not details.is_visible()
    page.keyboard.press("Backspace")
    page.keyboard.press("Escape")
    expect(page.locator(".pause-overlay")).to_be_visible()
    paused = typing_state(page)
    pause = open_controls(page, "typing", "pause")
    select(pause, "typingTest.hudLayout", "focus")
    select(pause, "typingTest.textSize", "medium")
    changed = typing_state(page)
    assert changed["phase"] == "PAUSED" and changed["config"] == paused["config"]
    assert changed["words"] == paused["words"] and changed["duration"] == paused["duration"]
    pause.locator("summary").focus()
    page.keyboard.press("Escape")  # Close customization, not the pause overlay.
    expect(page.locator(".pause-overlay")).to_be_visible()
    page.keyboard.press("Escape")  # Native navigation is not trapped on summary.
    expect(page.locator(".pause-overlay")).to_have_count(0)
    assert typing_state(page)["phase"] == "ACTIVE"
    page.reload()
    expect(page.locator(".speed-test-screen")).to_have_attribute("data-typing-hud", "focus")
    expect(page.locator("select[data-speed-font-size]")).to_have_value("medium")
    assert typing_state(page)["started"] is None
    # Complete a real short test with stats hidden; the complete result must remain visible.
    page.locator('[data-speed-category="words"]').click()
    page.locator('[data-speed-config="words-10"]').click()
    words = typing_state(page)["words"]
    page.locator("#speed-test-word-viewport").click(position={"x": 15, "y": 15})
    page.keyboard.type(" ".join(words))
    expect(page.locator(".speed-results-screen")).to_be_visible()
    expect(page.locator(".speed-result-headline")).to_be_visible()
    page.locator('.speed-results-panel [data-action="retry"]').click()
    expect(page.locator(".speed-test-screen")).to_have_attribute("data-typing-hud", "focus")
    assert typing_state(page)["started"] is None
    assert not errors, errors
    checks.append({"browser": name, "case": "24 HUD/live/size combinations, native keyboard, pause, persistence, real completion"})
    context.close()


def arena(page):
    return page.evaluate("""() => {
      const box=el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10)};
      return {area:box(document.querySelector('.play-area')),core:box(document.querySelector('.play-area .core'))};
    }""")


def certify_combat(browser, name, base, checks, width=1440, height=900):
    context = context_for(browser, base, width, height, width < 769)
    page = context.new_page()
    for mode in ("campaign", "endless"):
        if mode == "campaign":
            page.goto(base + "?dev=1&seed=331")
            page.locator('[data-action="modes"]').click()
            page.locator('[data-mode-id="campaign"]').click()
            settings = open_controls(page, "campaign")
            select(settings, "gameplayHud", "standard")
            settings.locator("summary").click()
            page.locator('[data-level="1"]').click()
        else:
            page.goto(base + "?dev=1&mode=endless&seed=331")
            settings = open_controls(page, "endless")
            expect(settings.locator('[data-mode-setting="gameplayHud"]')).to_have_value("minimal")
            select(settings, "gameplayHud", "standard")
            page.locator('[data-action="endless-start"]').click()
        expect(page.locator(f".{mode}-gameplay-screen")).to_be_visible()
        expect(page.locator(f".{mode}-hud-primary")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.locator(".pause-overlay")).to_be_visible()
        before = arena(page)
        settings = open_controls(page, mode, "pause")
        select(settings, "gameplayHud", "minimal")
        expect(page.locator(f".{mode}-gameplay-screen")).to_have_attribute("data-gameplay-hud", "minimal")
        assert arena(page) == before, (mode, width, before, arena(page))
        assert not page.locator(f".{mode}-hud-metric").first.is_visible()
        assert page.locator(f".{mode}-hud-integrity").is_visible()
        assert page.locator(f".{mode}-hud-secondary").is_visible()
        page.locator('.pause-panel [data-action="resume"]').click()
        no_overflow(page)
        screenshot(page, f"{name}-{mode}-minimal-{width}x{height}")
    checks.append({"browser": name, "case": "shared combat preference, pause/resume, identical arena/Core geometry", "viewport": [width, height]})
    context.close()


def certify_action(browser, name, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(base + "?dev=1&seed=91")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    details = open_controls(page, "campaign")
    select(details, "actionModeIntensity", "focused")
    details.locator("summary").click()
    page.locator('[data-level="10"]').click()
    expect(page.locator(".boss-screen")).to_have_attribute("data-action-intensity", "focused")
    expect(page.locator(".boss-threat-sigil")).to_be_attached()
    expect(page.locator("#boss-timer")).to_be_visible()
    assert page.locator(".boss-sigil-ring-a").evaluate("e=>getComputedStyle(e).animationName") == "none"
    page.keyboard.press("Escape")
    details = open_controls(page, "boss", "pause")
    select(details, "actionModeIntensity", "full")
    expect(page.locator(".boss-screen")).to_have_attribute("data-effective-effects", "standard")
    page.emulate_media(reduced_motion="reduce")
    expect(page.locator(".boss-screen")).to_have_attribute("data-effective-effects", "reduced")
    page.emulate_media(reduced_motion="no-preference")
    expect(page.locator(".boss-screen")).to_have_attribute("data-effective-effects", "standard")
    page.goto(base + "?dev=1&mode=arcade-rush&seed=92")
    details = open_controls(page, "arcade-rush")
    expect(details.locator('[data-mode-setting="actionModeIntensity"]')).to_have_value("full")
    select(details, "actionModeIntensity", "focused")
    page.locator('[data-rush-action="start"]').click()
    expect(page.locator('[data-rush-view="gameplay"]')).to_have_attribute("data-effective-effects", "reduced")
    expect(page.locator('[data-rush-role="core"]')).to_be_visible()
    expect(page.locator('[data-rush-role="wave"]')).to_be_visible()
    assert page.locator(".arcade-rush-core").evaluate("e=>getComputedStyle(e,'::before').animationName") == "none"
    page.locator('[data-rush-action="pause"]').click()
    details = open_controls(page, "arcade-rush", "pause")
    select(details, "actionModeIntensity", "full")
    expect(page.locator('[data-rush-view="gameplay"]')).to_have_attribute("data-effective-effects", "standard")
    page.locator('[data-rush-action="resume"]').click()
    screenshot(page, f"{name}-rush-full")
    checks.append({"browser": name, "case": "shared Boss/Rush intensity, pause controls, system-motion precedence"})
    context.close()


def certify_responsive(browser, name, base, checks):
    for width, height in ((320,720),(360,640),(390,360),(390,844),(768,1024),(1024,768)):
        context = context_for(browser, base, width, height, width < 769)
        page = context.new_page()
        page.goto(base + "?dev=1&mode=speed-test&seed=171")
        details = open_controls(page, "typing")
        select(details, "typingTest.hudLayout", "data")
        for select_box in details.locator("select").all():
            rect = select_box.bounding_box()
            # Browser device-pixel rounding can report 43.99999 for a CSS 44px box.
            assert rect and rect["height"] >= 43.99, rect
        no_overflow(page)
        screenshot(page, f"{name}-typing-controls-{width}x{height}")
        details.locator("summary").click()
        expect(page.locator("#speed-test-errors")).to_be_visible()
        no_overflow(page)
        checks.append({"browser": name, "case": "responsive Data HUD and 44px controls", "viewport": [width,height]})
        context.close()


def certify_lifecycle(browser, name, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(base + "?dev=1&mode=speed-test&seed=171")
    expect(controls(page, "typing")).to_be_attached()
    page.evaluate("""async () => {
      const {startModeCustomizationPresentation}=await import('./js/modeCustomizationPresentation.js');
      const {appState}=await import('./js/state.js');
      window.__p2Applies=0;
      for(let i=0;i<3;i++) window.__p2Stop=startModeCustomizationPresentation({getSave:()=>appState.save,onTypingPreferences:()=>window.__p2Applies++});
      window.__p2Writes=0;const set=Storage.prototype.setItem;
      Storage.prototype.setItem=function(...args){window.__p2Writes++;return set.apply(this,args)};
    }""")
    details = open_controls(page, "typing")
    select(details, "typingTest.hudLayout", "data")
    assert page.evaluate("window.__p2Writes") == 1
    details.locator("summary").click()
    before = page.evaluate("window.__p2Applies")
    page.locator("#speed-test-word-viewport").click(position={"x":15,"y":15})
    page.keyboard.type("word word word ")
    assert page.evaluate("window.__p2Applies") == before, "The controller must not observe per-character DOM updates"
    page.keyboard.press("Escape")
    details = open_controls(page, "typing", "pause")
    page.evaluate("() => { Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError')}; }")
    select(details, "typingTest.hudLayout", "focus")
    expect(details.locator('[data-mode-presentation-status]')).to_contain_text("could not be saved")
    page.evaluate("window.__p2Stop()")
    expect(page.locator("[data-mode-presentation]")).to_have_count(0)
    page.evaluate("document.querySelector('#app').innerHTML='<section class=\"screen practice-lab-screen\"></section>'")
    expect(page.locator("[data-mode-presentation]")).to_have_count(0)
    checks.append({"browser": name, "case": "idempotent initialization, single writes, no keystroke observers, storage errors and cleanup"})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(QuietHandler,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    base=f"http://127.0.0.1:{server.server_port}/"
    report={"sha":os.getenv("GITHUB_SHA"),"checks":[],"success":False}
    try:
        with sync_playwright() as playwright:
            for name in ("chromium","firefox"):
                browser=getattr(playwright,name).launch(headless=True)
                certify_typing(browser,name,base,report["checks"])
                certify_combat(browser,name,base,report["checks"])
                certify_combat(browser,name,base,report["checks"],390,360)
                certify_action(browser,name,base,report["checks"])
                certify_responsive(browser,name,base,report["checks"])
                certify_lifecycle(browser,name,base,report["checks"])
                browser.close()
        report["success"]=True
        print(f"PASS: {len(report['checks'])} grouped P2 browser checks across Chromium and Firefox.")
    except Exception:
        report["error"]=traceback.format_exc()
        print(report["error"])
        raise
    finally:
        (ARTIFACTS/"customization-p2.json").write_text(json.dumps(report,indent=2))
        server.shutdown();server.server_close()


if __name__=="__main__":
    main()
