"""P3 final integration/visual certification for WordStrike customization.

This suite intentionally tests representative cross-product combinations rather than
all mathematical combinations (P1/P2 already cover those exhaustive contracts). It
adds player-facing screenshot evidence and actual viewport-bound checks so clipped
controls cannot pass merely because document scrollWidth is unchanged.
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
ARTIFACTS = ROOT / "browser-artifacts" / "customization-p3-release"
MIN_TARGET = 44 - 0.01

SEED = """(() => {
  for (const [id,v] of Object.entries({general:3,campaign:1,typing:1,endless:1,boss:1,leaderboards:1,'arcade-rush':1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${v}`,'seen');
  if (!localStorage.getItem('wordstrike_save')) localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel:10,
    levels:{1:{grade:'A',bestAccuracy:97,bestWPM:72,bestScore:4000}},
    settings:{screenShake:true,particles:true,strictMode:false,soundEffects:false,
      speedTestTimerPosition:'top',speedTestFontSize:'auto',
      theme:'wordstrike',accent:'cyan',effectsIntensity:'standard',
      typingTest:{hudLayout:'balanced',textSize:'auto',liveStats:true},
      gameplayHud:'standard',actionModeIntensity:'full'}
  }));
})();"""

CLEAN_EVIDENCE_CSS = """
#speed-test-dev,
[class$='-debug'], [class*='-debug '], [class^='debug-'], [data-debug], [data-dev-only] {
  display:none !important;
}
"""

REPRESENTATIVE = [
    ("wordstrike", "cyan", "standard"),
    ("oled", "magenta", "reduced"),
    ("midnight", "blue", "cinematic"),
    ("monochrome", "orange", "standard"),
]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def context_for(browser, base, width=1440, height=900, touch=False, seed=SEED):
    context = browser.new_context(viewport={"width": width, "height": height}, has_touch=touch)
    context.add_init_script(seed)
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
    return context


def clean(page):
    page.add_style_tag(content=CLEAN_EVIDENCE_CSS)


def no_horizontal_overflow(page, include_screen=True):
    values = page.evaluate("""() => ({
      root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      screen: (() => { const s=document.querySelector('#app > .screen'); return s ? s.scrollWidth-s.clientWidth : 0; })()
    })""")
    # Dynamic game objects may intentionally cross a clipped arena edge. Root/body
    # overflow is always forbidden; inner-screen overflow is checked where meaningful.
    relevant = values.values() if include_screen else (values["root"], values["body"])
    assert max(relevant) <= 1, values
    return values


def assert_inside_viewport(page, locator, label, tolerance=1.0):
    locator.scroll_into_view_if_needed()
    box = locator.bounding_box()
    assert box, f"{label}: missing box"
    width = page.viewport_size["width"]
    assert box["x"] >= -tolerance, (label, box, width)
    assert box["x"] + box["width"] <= width + tolerance, (label, box, width)
    return box


def assert_target(locator, label):
    box = locator.bounding_box()
    assert box and box["height"] >= MIN_TARGET, (label, box)


def screenshot(page, name):
    clean(page)
    page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=True, animations="disabled", caret="hide")


def open_title(page, base, dev=False):
    page.goto(base + ("?dev=1&seed=903" if dev else "?seed=903"))
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)


def open_settings(page, base=None):
    if base and not page.locator(".title-screen").count():
        open_title(page, base)
    page.locator('[data-action="settings"]').click()
    expect(page.locator(".settings-screen")).to_be_visible()
    expect(page.locator("[data-customization-settings]")).to_have_count(1)


def set_appearance(page, theme, accent, effects):
    page.locator('[data-appearance-setting="theme"]').select_option(theme)
    page.locator('[data-appearance-setting="accent"]').select_option(accent)
    page.locator('[data-appearance-setting="effectsIntensity"]').select_option(effects)
    expect(page.locator("html")).to_have_attribute("data-theme", theme)
    expect(page.locator("html")).to_have_attribute("data-accent", accent)
    expect(page.locator("html")).to_have_attribute("data-effects", effects)


def mode_panel(page, mode, location="ready"):
    return page.locator(f'[data-mode-presentation="{mode}"][data-presentation-location="{location}"]')


def open_panel(page, mode, location="ready"):
    panel = mode_panel(page, mode, location)
    expect(panel).to_be_attached()
    if panel.get_attribute("open") is None:
        panel.locator("summary").click()
    return panel


def select_mode(panel, field, value):
    panel.locator(f'[data-mode-setting="{field}"]').select_option(str(value).lower() if isinstance(value, bool) else value)


def certify_settings_combinations(browser, engine, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    open_title(page, base)
    open_settings(page)
    semantics = page.evaluate("""() => {
      const s=getComputedStyle(document.documentElement);
      return ['--color-danger','--color-warning','--color-success','--color-special'].map(k=>s.getPropertyValue(k).trim());
    }""")
    for theme, accent, effects in REPRESENTATIVE:
        set_appearance(page, theme, accent, effects)
        current = page.evaluate("""() => {
          const s=getComputedStyle(document.documentElement);
          return ['--color-danger','--color-warning','--color-success','--color-special'].map(k=>s.getPropertyValue(k).trim());
        }""")
        assert current == semantics, (theme, accent, effects, current, semantics)
        no_horizontal_overflow(page)
        for control in page.locator('[data-appearance-setting], [data-reset-appearance]').all():
            assert_target(control, "appearance control")
            assert_inside_viewport(page, control, "appearance control")
        if engine == "chromium":
            screenshot(page, f"settings-{theme}-{accent}-{effects}")
    assert not errors, errors
    checks.append({"browser": engine, "case": "4 representative global combinations + semantic colors + control bounds"})
    context.close()


def certify_typing_views(browser, engine, base, checks):
    for hud in ("focus", "balanced", "data"):
        context = context_for(browser, base)
        page = context.new_page()
        page.goto(base + "?dev=1&mode=speed-test&seed=904")
        expect(page.locator(".speed-test-screen")).to_be_visible()
        panel = open_panel(page, "typing")
        # Set the saved live-stat choice before Focus disables that selector.
        select_mode(panel, "typingTest.liveStats", True)
        select_mode(panel, "typingTest.hudLayout", hud)
        panel.locator("summary").click()
        expect(page.locator(".speed-test-screen")).to_have_attribute("data-typing-hud", hud)
        expect(page.locator("#speed-test-primary")).to_be_visible()
        if hud == "focus":
            expect(page.locator("#speed-test-wpm")).not_to_be_visible()
            expect(page.locator("#speed-test-accuracy")).not_to_be_visible()
        elif hud == "balanced":
            expect(page.locator("#speed-test-wpm")).to_be_visible()
            expect(page.locator("#speed-test-words")).not_to_be_visible()
        else:
            expect(page.locator("#speed-test-wpm")).to_be_visible()
            expect(page.locator("#speed-test-words")).to_be_visible()
            expect(page.locator("#speed-test-errors")).to_be_visible()
        no_horizontal_overflow(page)
        if engine == "chromium": screenshot(page, f"typing-{hud}-desktop")
        context.close()

    for width, height in ((320,720),(390,360),(390,844)):
        context = context_for(browser, base, width, height, True)
        page = context.new_page()
        page.goto(base + "?dev=1&mode=speed-test&seed=905")
        panel = open_panel(page, "typing")
        select_mode(panel, "typingTest.hudLayout", "data")
        trigger = panel.locator("summary")
        body = panel.locator(".mode-presentation-panel")
        assert_target(trigger, "typing presentation trigger")
        assert_inside_viewport(page, trigger, "typing presentation trigger")
        assert_inside_viewport(page, body, "typing presentation panel")
        for control in panel.locator("select").all():
            assert_target(control, "typing presentation select")
            assert_inside_viewport(page, control, "typing presentation select")
        no_horizontal_overflow(page)
        if engine == "chromium": screenshot(page, f"typing-presentation-{width}x{height}")
        checks.append({"browser": engine, "case": "typing panel actual viewport bounds", "viewport": [width,height]})
        context.close()
    checks.append({"browser": engine, "case": "Typing Focus/Balanced/Data player-facing states"})


def route_campaign(page, base, dev=False):
    open_title(page, base, dev)
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible()


def certify_campaign_endless(browser, engine, base, checks):
    # Campaign route customization itself, including the previously fragile 390x360 case.
    for width, height in ((1440,900),(390,360)):
        context = context_for(browser, base, width, height, width < 769)
        page = context.new_page()
        route_campaign(page, base)
        panel = open_panel(page, "campaign")
        assert_inside_viewport(page, panel.locator("summary"), "campaign presentation trigger")
        assert_inside_viewport(page, panel.locator(".mode-presentation-panel"), "campaign presentation panel")
        for control in panel.locator("select").all():
            assert_target(control, "campaign presentation select")
            assert_inside_viewport(page, control, "campaign presentation select")
        no_horizontal_overflow(page)
        if engine == "chromium": screenshot(page, f"campaign-presentation-{width}x{height}")
        context.close()

    for mode in ("campaign", "endless"):
        for hud in ("standard", "minimal"):
            context = context_for(browser, base)
            page = context.new_page()
            if mode == "campaign":
                route_campaign(page, base)
                panel = open_panel(page, "campaign")
                select_mode(panel, "gameplayHud", hud)
                panel.locator("summary").click()
                page.locator('[data-level="1"]').click()
                screen = page.locator(".campaign-gameplay-screen")
            else:
                open_title(page, base)
                page.locator('[data-action="modes"]').click()
                page.locator('[data-mode-id="endless"]').click()
                expect(page.locator(".endless-ready-screen")).to_be_visible()
                panel = open_panel(page, "endless")
                select_mode(panel, "gameplayHud", hud)
                page.locator('[data-action="endless-start"]').click()
                screen = page.locator(".endless-gameplay-screen")
            expect(screen).to_be_visible()
            expect(screen).to_have_attribute("data-gameplay-hud", hud)
            expect(screen.locator(f".{mode}-hud-integrity")).to_be_visible()
            expect(screen.locator(f".{mode}-hud-secondary")).to_be_visible()
            metric = screen.locator(f".{mode}-hud-metric").first
            expect(metric).to_be_visible() if hud == "standard" else expect(metric).not_to_be_visible()
            no_horizontal_overflow(page)
            if engine == "chromium": screenshot(page, f"{mode}-{hud}-desktop")
            context.close()
    checks.append({"browser": engine, "case": "Campaign/Endless standard+minimal and route bounds"})


def certify_action_modes(browser, engine, base, checks):
    for intensity in ("focused", "full"):
        context = context_for(browser, base)
        page = context.new_page()
        route_campaign(page, base, dev=True)
        panel = open_panel(page, "campaign")
        select_mode(panel, "actionModeIntensity", intensity)
        panel.locator("summary").click()
        page.locator('[data-level="10"]').click()
        boss = page.locator(".boss-screen")
        expect(boss).to_be_visible()
        expect(boss).to_have_attribute("data-action-intensity", intensity)
        expect(page.locator("#boss-timer")).to_be_visible()
        expect(page.locator(".boss-threat-sigil")).to_be_attached()
        if intensity == "focused":
            assert page.locator(".boss-sigil-ring-a").evaluate("e=>getComputedStyle(e).animationName") == "none"
        no_horizontal_overflow(page)
        if engine == "chromium": screenshot(page, f"boss-{intensity}-desktop")
        context.close()

        context = context_for(browser, base)
        page = context.new_page()
        open_title(page, base)
        page.locator('[data-action="modes"]').click()
        page.locator('[data-mode-id="arcade-rush"]').click()
        expect(page.locator('[data-rush-view="ready"]')).to_be_visible()
        panel = open_panel(page, "arcade-rush")
        select_mode(panel, "actionModeIntensity", intensity)
        page.locator('[data-rush-action="start"]').click()
        rush = page.locator('[data-rush-view="gameplay"]')
        expect(rush).to_be_visible()
        expect(rush).to_have_attribute("data-action-intensity", intensity)
        expect(page.locator('[data-rush-role="core"]')).to_be_visible()
        expect(page.locator('[data-rush-role="wave"]')).to_be_visible()
        if intensity == "focused":
            expect(rush).to_have_attribute("data-effective-effects", "reduced")
        # Rush words deliberately enter/leave through arena edges. The gameplay shell
        # must clip them, while the real document/body must never become scrollable.
        assert rush.evaluate("e => getComputedStyle(e).overflowX") in ("hidden", "clip")
        no_horizontal_overflow(page, include_screen=False)
        if engine == "chromium": screenshot(page, f"arcade-rush-{intensity}-desktop")
        context.close()
    checks.append({"browser": engine, "case": "Boss/Rush focused+full player-facing states"})


def certify_cross_feature_edges(browser, engine, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    open_title(page, base)
    open_settings(page)
    set_appearance(page, "midnight", "blue", "cinematic")
    page.evaluate("""async () => {
      const {appState}=await import('./js/state.js');
      const {updateModeCustomizationSetting}=await import('./js/storage.js');
      updateModeCustomizationSetting(appState.save,'typingTest.hudLayout','data');
      updateModeCustomizationSetting(appState.save,'typingTest.liveStats',false);
      updateModeCustomizationSetting(appState.save,'gameplayHud','minimal');
      updateModeCustomizationSetting(appState.save,'actionModeIntensity','focused');
    }""")
    # Appearance reset must not erase mode-local preferences.
    page.locator('[data-reset-appearance]').click()
    saved = page.evaluate("JSON.parse(localStorage.wordstrike_save).settings")
    assert saved["theme"] == "wordstrike" and saved["accent"] == "cyan" and saved["effectsIntensity"] == "standard"
    assert saved["typingTest"]["hudLayout"] == "data" and saved["typingTest"]["liveStats"] is False
    assert saved["gameplayHud"] == "minimal" and saved["actionModeIntensity"] == "focused"
    # Full settings reset restores every presentation default but preserves progress.
    page.evaluate("""async () => {
      const {appState}=await import('./js/state.js');
      const {resetSettings}=await import('./js/storage.js');
      resetSettings(appState.save);
      document.dispatchEvent(new CustomEvent('wordstrike:settings-changed'));
    }""")
    saved = page.evaluate("JSON.parse(localStorage.wordstrike_save)")
    assert saved["currentFurthestLevel"] == 10
    assert saved["settings"]["theme"] == "wordstrike"
    assert saved["settings"]["typingTest"] == {"hudLayout":"balanced","textSize":"auto","liveStats":True}
    assert saved["settings"]["gameplayHud"] == "standard"
    assert saved["settings"]["actionModeIntensity"] == "full"

    # Cinematic/full can never defeat system reduced motion.
    set_appearance(page, "midnight", "blue", "cinematic")
    page.emulate_media(reduced_motion="reduce")
    expect(page.locator("html")).to_have_attribute("data-effective-effects", "reduced")
    page.emulate_media(reduced_motion="no-preference")
    expect(page.locator("html")).to_have_attribute("data-effective-effects", "cinematic")

    # Practice remains a hard styling/control boundary.
    page.evaluate("document.querySelector('#app').innerHTML='<section class=\"screen practice-lab-screen\"><p>Practice boundary probe</p></section>'")
    expect(page.locator("html")).to_have_attribute("data-customization-active", "false")
    expect(page.locator("[data-mode-presentation]")).to_have_count(0)
    checks.append({"browser": engine, "case": "appearance/full resets + reduced-motion precedence + Practice boundary"})
    context.close()

    # Malformed/unknown saved preferences normalize without losing progress.
    corrupt = """(() => {
      for (const [id,v] of Object.entries({general:3,campaign:1,typing:1,endless:1,boss:1,leaderboards:1,'arcade-rush':1}))
        localStorage.setItem(`wordstrike.onboarding.${id}.v${v}`,'seen');
      localStorage.setItem('wordstrike_save', JSON.stringify({currentFurthestLevel:7,levels:{1:{bestWPM:81}},settings:{
        theme:'unknown',accent:17,effectsIntensity:'warp',gameplayHud:'dense',actionModeIntensity:'max',
        speedTestFontSize:'huge',typingTest:{hudLayout:'x',textSize:'tiny',liveStats:'yes'}
      }}));
    })();"""
    context = context_for(browser, base, seed=corrupt)
    page = context.new_page()
    open_title(page, base)
    expect(page.locator("html")).to_have_attribute("data-theme", "wordstrike")
    expect(page.locator("html")).to_have_attribute("data-accent", "cyan")
    normalized = page.evaluate("JSON.parse(localStorage.wordstrike_save)")
    assert normalized["currentFurthestLevel"] == 7 and normalized["levels"]["1"]["bestWPM"] == 81
    s = normalized["settings"]
    assert s["theme"] == "wordstrike" and s["accent"] == "cyan" and s["effectsIntensity"] == "standard"
    assert s["gameplayHud"] == "standard" and s["actionModeIntensity"] == "full"
    assert s["typingTest"] == {"hudLayout":"balanced","textSize":"auto","liveStats":True}
    checks.append({"browser": engine, "case": "malformed preference migration preserves progress"})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    report = {"sha": os.getenv("GITHUB_SHA"), "checks": [], "success": False}
    try:
        with sync_playwright() as playwright:
            for engine in ("chromium", "firefox"):
                browser = getattr(playwright, engine).launch(headless=True)
                certify_settings_combinations(browser, engine, base, report["checks"])
                certify_typing_views(browser, engine, base, report["checks"])
                certify_campaign_endless(browser, engine, base, report["checks"])
                certify_action_modes(browser, engine, base, report["checks"])
                certify_cross_feature_edges(browser, engine, base, report["checks"])
                browser.close()
        report["success"] = True
        print(f"PASS: {len(report['checks'])} grouped P3 release checks across Chromium and Firefox.")
    except Exception:
        report["error"] = traceback.format_exc()
        print(report["error"])
        raise
    finally:
        (ARTIFACTS / "customization-p3-release.json").write_text(json.dumps(report, indent=2))
        server.shutdown(); server.server_close()


if __name__ == "__main__":
    main()
