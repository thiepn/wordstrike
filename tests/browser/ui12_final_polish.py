"""UI12 final motion, audio, and global-consistency browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "ui12-final-polish"

ONBOARDING_SEED = """(() => {
  for (const [id, version] of Object.entries({general:3,campaign:1,typing:1,endless:1,boss:1,leaderboards:1,'arcade-rush':1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""

AUDIO_STUB = """(() => {
  window.__ui12AudioStats = {contexts:0, oscillators:0, starts:0, resumes:0, suspends:0};
  class Param {
    setValueAtTime() { return this; }
    exponentialRampToValueAtTime() { return this; }
  }
  class Oscillator {
    constructor() { this.frequency = new Param(); this.type = 'sine'; window.__ui12AudioStats.oscillators += 1; }
    connect() { return this; }
    start() { window.__ui12AudioStats.starts += 1; }
    stop() {}
  }
  class Gain { constructor() { this.gain = new Param(); } connect() { return this; } }
  class FakeAudioContext {
    constructor() { this.state='running'; this.currentTime=0; this.destination={}; window.__ui12AudioStats.contexts += 1; }
    createOscillator() { return new Oscillator(); }
    createGain() { return new Gain(); }
    resume() { this.state='running'; window.__ui12AudioStats.resumes += 1; return Promise.resolve(); }
    suspend() { this.state='suspended'; window.__ui12AudioStats.suspends += 1; return Promise.resolve(); }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = undefined;
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def new_context(browser, base, width=1440, height=900, reduced=False, legacy_save=False):
    options = {"viewport": {"width": width, "height": height}}
    if reduced:
        options["reduced_motion"] = "reduce"
    context = browser.new_context(**options)
    context.add_init_script(ONBOARDING_SEED)
    context.add_init_script(AUDIO_STUB)
    if legacy_save:
        context.add_init_script("""(() => {
          if (localStorage.getItem('wordstrike_save') != null) return;
          localStorage.setItem('wordstrike_save', JSON.stringify({
            currentFurthestLevel: 1, levels: {}, settings: {screenShake:true,particles:true,strictMode:false,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
          }));
        })();""")
    local_only(context, base)
    return context


def open_title(page, base):
    page.goto(base)
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    expect(page.locator(".title-screen")).to_have_attribute("data-ui12-polished", "true")


def audio_stats(page):
    return page.evaluate("window.__ui12AudioStats")


def certify_audio(browser, browser_name, base, evidence):
    context = new_context(browser, base, legacy_save=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_title(page, base)

    # Existing/legacy saves migrate silently; loading the page never constructs AudioContext.
    migrated = page.evaluate("JSON.parse(localStorage.getItem('wordstrike_save')).settings.soundEffects")
    assert migrated is False, migrated
    assert page.get_attribute("body", "data-ui12-audio-enabled") == "false"
    assert audio_stats(page)["contexts"] == 0, audio_stats(page)

    page.locator('[data-action="settings"]').click()
    expect(page.locator(".settings-screen")).to_be_visible()
    sound = page.locator("[data-ui12-sound-toggle]")
    expect(sound).to_be_visible()
    expect(sound).to_have_attribute("role", "switch")
    expect(sound).to_have_attribute("aria-checked", "false")
    assert sound.bounding_box()["height"] >= 44
    assert audio_stats(page)["contexts"] == 0, audio_stats(page)

    sound.click()
    expect(sound).to_have_attribute("aria-checked", "true")
    expect(sound.locator("strong")).to_have_text("ON")
    persisted = page.evaluate("JSON.parse(localStorage.getItem('wordstrike_save')).settings.soundEffects")
    assert persisted is True
    after_enable = audio_stats(page)
    assert after_enable["contexts"] == 1 and after_enable["starts"] >= 1, after_enable

    # An ordinary utility action reuses the same context and produces a short interface tone.
    starts_before_back = after_enable["starts"]
    page.locator('.settings-screen .screen-back-button').click()
    expect(page.locator(".title-screen")).to_be_visible()
    after_back = audio_stats(page)
    assert after_back["contexts"] == 1 and after_back["starts"] > starts_before_back, after_back

    # Reload preserves opt-in but remains silent until another user interaction.
    page.reload()
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    assert page.get_attribute("body", "data-ui12-audio-enabled") == "true"
    assert audio_stats(page)["contexts"] == 0, audio_stats(page)
    page.keyboard.press("ArrowDown")
    expect(page.locator('[data-title-index="1"]')).to_be_focused()
    after_keyboard = audio_stats(page)
    assert after_keyboard["contexts"] == 1 and after_keyboard["starts"] >= 1, after_keyboard

    # Practice remains silent even while the preference is enabled.
    starts_before_practice = after_keyboard["starts"]
    page.evaluate("""() => { document.querySelector('#app').innerHTML = '<section class="screen practice-lab-screen"><button id="ui12-practice-probe">PRACTICE</button></section>'; }""")
    page.locator("#ui12-practice-probe").click()
    assert audio_stats(page)["starts"] == starts_before_practice, audio_stats(page)

    evidence.append({"browser": browser_name, "case": "opt-in lazy audio + persistence + Practice isolation", "stats": audio_stats(page)})
    assert not errors, errors
    context.close()


def certify_interaction_consistency(browser, browser_name, base, evidence):
    context = new_context(browser, base)
    page = context.new_page()
    open_title(page, base)

    # Keyboard focus must remain structurally visible on migrated utility actions.
    page.keyboard.press("Tab")
    focus = page.evaluate("""() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return {tag:el?.tagName, outline:style.outlineStyle, outlineWidth:style.outlineWidth, height:el?.getBoundingClientRect().height || 0};
    }""")
    assert focus["tag"] in {"BUTTON", "A"}, focus
    assert focus["outline"] != "none" and float(focus["outlineWidth"].replace("px", "") or 0) >= 1, focus
    assert focus["height"] >= 44, focus

    page.locator('[data-action="settings"]').click()
    expect(page.locator(".ui12-audio-setting")).to_be_visible()
    geometry = page.evaluate("""() => ({
      horizontalOverflow: document.documentElement.scrollWidth-document.documentElement.clientWidth,
      soundHeight: document.querySelector('[data-ui12-sound-toggle]').getBoundingClientRect().height,
      hint: document.querySelector('.settings-panel > .footer-hint')?.textContent || ''
    })""")
    assert geometry["horizontalOverflow"] <= 1, geometry
    assert geometry["soundHeight"] >= 44, geometry
    assert "TAB ALL CONTROLS" in geometry["hint"], geometry

    evidence.append({"browser": browser_name, "case": "focus + utility interaction baseline", **geometry})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    context = new_context(browser, base, width=390, height=360)
    page = context.new_page()
    open_title(page, base)
    page.locator('[data-action="settings"]').click()
    expect(page.locator(".settings-screen")).to_be_visible()
    sound = page.locator("[data-ui12-sound-toggle]")
    sound.scroll_into_view_if_needed()
    box = sound.bounding_box()
    mobile = page.evaluate("""() => ({
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      scrollHeight:document.scrollingElement.scrollHeight,
      clientHeight:document.scrollingElement.clientHeight
    })""")
    assert mobile["overflow"] <= 1, mobile
    assert box is not None and box["height"] >= 44, box
    assert box["x"] >= -1 and box["x"] + box["width"] <= 391, box
    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-ui12-settings-390x360.png"), full_page=True)
    evidence.append({"browser": browser_name, "case": "390x360 settings audio", **mobile, "sound": box})
    context.close()


def certify_reduced_motion(browser, browser_name, base, evidence):
    context = new_context(browser, base, reduced=True)
    page = context.new_page()
    open_title(page, base)
    motion = page.locator(".title-start-button").evaluate("""el => ({
      animation:getComputedStyle(el).animationDuration,
      transition:getComputedStyle(el).transitionDuration,
      scroll:getComputedStyle(el).scrollBehavior
    })""")
    accepted = {"0s", "0.001ms", "1e-06s", "0.000001s"}
    assert motion["animation"] in accepted, motion
    assert all(part.strip() in accepted for part in motion["transition"].split(",")), motion
    assert motion["scroll"] == "auto", motion
    evidence.append({"browser": browser_name, "case": "global reduced-motion safety net", "motion": motion})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    result = {"sha": os.getenv("GITHUB_SHA"), "checks": [], "success": False}
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)
                certify_audio(browser, browser_name, base, result["checks"])
                certify_interaction_consistency(browser, browser_name, base, result["checks"])
                certify_mobile(browser, browser_name, base, result["checks"])
                certify_reduced_motion(browser, browser_name, base, result["checks"])
                browser.close()
        result["success"] = True
        print(f"PASS: {len(result['checks'])} UI12 final polish checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui12-final-polish.json").write_text(json.dumps(result, indent=2))
        server.shutdown(); server.server_close()


if __name__ == "__main__":
    main()
