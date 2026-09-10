"""UI5 Campaign gameplay browser certification.

Certifies ordinary Campaign HUD/Core/word presentation in Chromium and Firefox while
explicitly keeping Endless, Boss and Practice Lab outside UI5 ownership.
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
ARTIFACTS = ROOT / "browser-artifacts" / "ui5-campaign-gameplay"

SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel: 17,
    levels: {1:{grade:'A',bestWPM:84,bestAccuracy:98.2,bestScore:4100,completed:true}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def errors_for(page):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return errors


def assert_no_errors(errors, label):
    assert not errors, f"{label}: page errors: {errors}"


def duration_seconds(value):
    source = str(value).split(",")[0].strip().lower()
    if source.endswith("ms"):
        return float(source[:-2]) / 1000
    if source.endswith("s"):
        return float(source[:-1])
    return 0.0


def open_campaign_game(page, base, suffix="?dev=1&seed=501"):
    page.goto(base + suffix)
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible()
    page.locator('[data-level="1"]').click()
    expect(page.locator(".campaign-gameplay-screen")).to_be_visible(timeout=8000)
    expect(page.locator(".campaign-gameplay-hud")).to_be_visible()
    expect(page.locator(".campaign-core")).to_be_visible()


def inspect_desktop(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)
    open_campaign_game(page, base)

    for selector in ("#hud-level", "#hud-wpm", "#hud-accuracy", "#hud-lives", "#hud-score", "#hud-combo"):
        assert page.locator(selector).count() == 1, selector

    assert page.locator('.campaign-gameplay-screen .campaign-hud-primary').count() == 1
    assert page.locator('.campaign-gameplay-screen [data-campaign-progress][role="progressbar"]').count() == 1
    assert page.locator('.campaign-core-integrity [data-integrity-segment]').count() == 3
    assert page.locator('.campaign-hud-integrity-pips [data-integrity-segment]').count() == 3

    geometry = page.evaluate("""() => {
      const screen = document.querySelector('.campaign-gameplay-screen');
      const hud = document.querySelector('.campaign-gameplay-hud');
      const play = document.querySelector('#play-area');
      const core = document.querySelector('.campaign-core');
      const back = document.querySelector('.campaign-hud-back');
      const hudStyle = getComputedStyle(hud);
      const coreBox = core.getBoundingClientRect();
      const backBox = back.getBoundingClientRect();
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screenOverflow: screen.scrollWidth - screen.clientWidth,
        playWidth: play.clientWidth,
        playHeight: play.clientHeight,
        hudBorderBottom: hudStyle.borderBottomWidth,
        coreWidth: coreBox.width,
        coreHeight: coreBox.height,
        backWidth: backBox.width,
        backHeight: backBox.height
      };
    }""")
    assert geometry["docOverflow"] <= 1, geometry
    assert geometry["screenOverflow"] <= 1, geometry
    assert geometry["playWidth"] > 900 and geometry["playHeight"] > 500, geometry
    assert geometry["hudBorderBottom"] == "0px", geometry
    assert 56 <= geometry["coreWidth"] <= 60 and 56 <= geometry["coreHeight"] <= 60, geometry
    assert geometry["backWidth"] >= 44 and geometry["backHeight"] >= 44, geometry

    # Drive display-only state through the real authoritative game object and let UI5 derive presentation.
    state = page.evaluate("""async () => {
      const { appState } = await import('./js/state.js');
      const game = appState.game;
      game.completedWordCount = 3;
      game.missedWordCount = 1;
      game.lives = 1;
      game.comboCount = 7;
      game.targetingState = {
        mode:'ambiguous', prefix:'st', candidateIds:['ui5-a','ui5-b'], activeTargetId:null, startedAtActiveMs:null
      };
      document.querySelector('#hud-wpm').textContent = '82';
      document.querySelector('#hud-accuracy').textContent = '96%';
      document.querySelector('#hud-lives').textContent = '◆';
      document.querySelector('#hud-score').textContent = '1234';
      document.querySelector('#hud-combo').textContent = 'x1.4';
      return {total:game.config.wordCount};
    }""")
    page.wait_for_timeout(80)
    expect(page.locator('.campaign-gameplay-screen')).to_have_attribute("data-core-integrity", "1")
    expect(page.locator('.campaign-core')).to_have_attribute("data-integrity", "1")
    expect(page.locator('.campaign-core')).to_have_attribute("aria-label", "Campaign Core, integrity 1 of 3")
    expect(page.locator('[data-campaign-combo-count]')).to_have_text("7")
    expect(page.locator('[data-campaign-resolved]')).to_have_text(f"4 / {state['total']}")
    expect(page.locator('[data-campaign-target-state]')).to_have_text("2 CANDIDATES")
    depleted = page.locator('.campaign-core-integrity [data-integrity-segment].is-depleted').count()
    assert depleted == 2, depleted
    progress = page.locator('[data-campaign-progress]').get_attribute("aria-valuenow")
    assert progress is not None and float(progress) > 0, progress

    # Exercise the real renderer with synthetic words so every presentation state is deterministic.
    active = page.evaluate("""async () => {
      const renderer = await import('./js/renderer.js');
      const word = {id:'ui5-active', text:'neon', x:180, y:180, typedIndex:2, separationX:0, separationY:0};
      renderer.createWordElement(word);
      renderer.updateWordElement(word, true, null);
      const visual = document.querySelector('[data-word-id="ui5-active"] .word-visual');
      const typed = visual.querySelector('.typed-letter');
      const style = getComputedStyle(visual);
      return {border:style.borderTopWidth, background:style.backgroundColor, boxShadow:style.boxShadow, typedColor:getComputedStyle(typed).color};
    }""")
    assert active["border"] == "0px", active
    assert active["background"] in {"rgba(0, 0, 0, 0)", "transparent"}, active
    assert active["boxShadow"] == "none", active

    candidate = page.evaluate("""async () => {
      const renderer = await import('./js/renderer.js');
      const word = {id:'ui5-candidate', text:'storm', x:300, y:210, typedIndex:0, separationX:0, separationY:0};
      renderer.createWordElement(word);
      renderer.updateWordElement(word, false, {candidate:true,prefixLength:2});
      const visual = document.querySelector('[data-word-id="ui5-candidate"] .word-visual');
      const typed = visual.querySelector('.typed-letter');
      const style = getComputedStyle(visual);
      const after = getComputedStyle(visual, '::after');
      return {border:style.borderTopWidth, background:style.backgroundColor, boxShadow:style.boxShadow, typedColor:getComputedStyle(typed).color, underlineOpacity:after.opacity};
    }""")
    assert candidate["border"] == "0px", candidate
    assert candidate["background"] in {"rgba(0, 0, 0, 0)", "transparent"}, candidate
    assert candidate["boxShadow"] == "none", candidate
    assert float(candidate["underlineOpacity"]) > 0.5, candidate
    assert candidate["typedColor"] != active["typedColor"], (active, candidate)

    wrong = page.evaluate("""async () => {
      const renderer = await import('./js/renderer.js');
      renderer.flashWrong('ui5-candidate');
      const visual = document.querySelector('[data-word-id="ui5-candidate"] .word-visual');
      const style = getComputedStyle(visual);
      return {classed:visual.classList.contains('wrong'), border:style.borderTopWidth, animationName:style.animationName};
    }""")
    assert wrong["classed"] and wrong["border"] == "0px", wrong
    assert "campaign-word-error" in wrong["animationName"], wrong
    page.wait_for_timeout(220)
    assert not page.locator('[data-word-id="ui5-candidate"] .word-visual').evaluate("el => el.classList.contains('wrong')")

    burst = page.evaluate("""async () => {
      const renderer = await import('./js/renderer.js');
      const word = {id:'ui5-active', text:'neon', x:180, y:180, typedIndex:2, separationX:0, separationY:0};
      renderer.removeWordElement(word, true, true);
      const el = document.querySelector('.campaign-gameplay-screen .burst');
      return el ? {
        angle:el.style.getPropertyValue('--campaign-burst-angle'),
        reach:el.style.getPropertyValue('--campaign-burst-reach'),
        borderRadius:getComputedStyle(el).borderRadius
      } : null;
    }""")
    assert burst and burst["angle"].endswith("deg") and burst["reach"].endswith("px"), burst
    assert burst["borderRadius"] != "0px", burst

    damage = page.evaluate("""async () => {
      const renderer = await import('./js/renderer.js');
      renderer.flashDamage(false);
      const area = document.querySelector('#play-area');
      const overlay = getComputedStyle(area, '::after');
      return {active:area.classList.contains('damage-flash'), animationName:overlay.animationName, border:overlay.borderTopWidth};
    }""")
    assert damage["active"] and "campaign-damage-edge" in damage["animationName"], damage
    assert damage["border"] == "0px", damage

    page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui5-desktop.png"), full_page=True)
    evidence.append({"browser": browser_name, "case": "desktop HUD/Core/word states", **geometry})
    assert_no_errors(errors, f"{browser_name} desktop")
    context.close()


def inspect_mobile(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)
    open_campaign_game(page, base, "?dev=1&seed=502")

    mobile = page.evaluate("""() => {
      const screen = document.querySelector('.campaign-gameplay-screen');
      const hud = document.querySelector('.campaign-gameplay-hud');
      const play = document.querySelector('#play-area');
      const back = document.querySelector('.campaign-hud-back').getBoundingClientRect();
      const primary = getComputedStyle(document.querySelector('.campaign-hud-primary'));
      return {
        docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        screenOverflow:screen.scrollWidth-screen.clientWidth,
        playHeight:play.clientHeight,
        hudHeight:hud.getBoundingClientRect().height,
        backWidth:back.width,
        backHeight:back.height,
        rows:primary.gridTemplateRows
      };
    }""")
    assert mobile["docOverflow"] <= 1 and mobile["screenOverflow"] <= 1, mobile
    assert mobile["playHeight"] > 500, mobile
    assert mobile["backWidth"] >= 44 and mobile["backHeight"] >= 44, mobile

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-ui5-mobile.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 360})
        page.wait_for_timeout(120)
        short = page.evaluate("""() => {
          const screen = document.querySelector('.campaign-gameplay-screen');
          const hud = document.querySelector('.campaign-gameplay-hud');
          const play = document.querySelector('#play-area');
          const back = document.querySelector('.campaign-hud-back').getBoundingClientRect();
          return {
            docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
            screenOverflow:screen.scrollWidth-screen.clientWidth,
            hudHeight:hud.getBoundingClientRect().height,
            playHeight:play.clientHeight,
            backHeight:back.height
          };
        }""")
        assert short["docOverflow"] <= 1 and short["screenOverflow"] <= 1, short
        assert short["playHeight"] >= 180, short
        assert short["backHeight"] >= 44, short
        page.screenshot(path=str(ARTIFACTS / "chromium-ui5-mobile-keyboard-height.png"), full_page=True)
        evidence.append({"browser": browser_name, "case": "390x360 Campaign playfield", **short})

    evidence.append({"browser": browser_name, "case": "mobile Campaign HUD/playfield", **mobile})
    assert_no_errors(errors, f"{browser_name} mobile")
    context.close()


def inspect_reduced_motion(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 1366, "height": 768}, reduced_motion="reduce")
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)
    open_campaign_game(page, base, "?dev=1&seed=503")

    motion = page.evaluate("""async () => {
      const renderer = await import('./js/renderer.js');
      const area = document.querySelector('#play-area');
      let animateCalls = 0;
      area.animate = () => { animateCalls += 1; return {cancel(){}}; };
      renderer.flashDamage(true);
      const orbit = getComputedStyle(document.querySelector('.campaign-core-orbit-a'));
      const reactor = getComputedStyle(document.querySelector('.campaign-core-reactor'));
      const back = getComputedStyle(document.querySelector('.campaign-hud-back'));
      return {
        animateCalls,
        orbitAnimation:orbit.animationName,
        reactorAnimation:reactor.animationName,
        transitionDuration:back.transitionDuration
      };
    }""")
    assert motion["animateCalls"] == 0, motion
    assert motion["orbitAnimation"] == "none", motion
    assert motion["reactorAnimation"] == "none", motion
    assert duration_seconds(motion["transitionDuration"]) <= 0.00001, motion
    evidence.append({"browser": browser_name, "case": "reduced motion", **motion})
    assert_no_errors(errors, f"{browser_name} reduced motion")
    context.close()


def inspect_mode_isolation(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 1366, "height": 768})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)

    page.goto(base + "?dev=1&mode=endless&seed=504&stage=3")
    expect(page.locator(".endless-ready-screen")).to_be_visible()
    page.locator('[data-action="endless-start"]').click()
    expect(page.locator(".endless-screen")).to_be_visible()
    assert page.locator(".endless-screen.campaign-gameplay-screen").count() == 0
    assert page.locator(".endless-screen .campaign-gameplay-hud").count() == 0
    assert page.locator(".endless-screen .campaign-core").count() == 0

    page.goto(base + "?dev=1&seed=505")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible()
    page.locator('[data-level="10"]').click()
    expect(page.locator(".boss-screen")).to_be_visible()
    assert page.locator(".boss-screen.campaign-gameplay-screen").count() == 0
    assert page.locator(".boss-screen .campaign-gameplay-hud").count() == 0
    assert page.locator(".practice-lab-screen").count() == 0

    evidence.append({"browser": browser_name, "case": "Endless/Boss/Practice ownership boundary"})
    assert_no_errors(errors, f"{browser_name} mode isolation")
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    evidence = []
    result = {"sha": os.getenv("GITHUB_SHA"), "success": False, "checks": evidence}
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)
                inspect_desktop(browser, base, browser_name, evidence)
                inspect_mobile(browser, base, browser_name, evidence)
                inspect_reduced_motion(browser, base, browser_name, evidence)
                inspect_mode_isolation(browser, base, browser_name, evidence)
                browser.close()
        result["success"] = True
        print(f"PASS: {len(evidence)} UI5 Campaign gameplay browser checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui5-campaign-gameplay.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
