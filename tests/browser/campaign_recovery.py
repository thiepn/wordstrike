"""Campaign regression recovery certification.

Covers the player-reported failure cluster: route reset/tutorial recurrence, persistent
progress, Campaign account state, placement entry, live score, readable incoming words,
and visible typed-prefix feedback.
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
ARTIFACTS = ROOT / "browser-artifacts" / "campaign-recovery"

SEED = """(() => {
  localStorage.setItem('wordstrike.onboarding.general.v3', 'seen');
  const levels = {};
  for (let level = 1; level <= 16; level += 1) {
    levels[level] = {
      grade:'A',bestWPM:78+level/10,bestAccuracy:97.4,
      bestScore:4000+level,maxCombo:12,bestTimeRemaining:0,bossCleared:level%10===0
    };
  }
  localStorage.setItem('wordstrike_save', JSON.stringify({
    campaignFurthestLevel:17,
    currentFurthestLevel:17,
    levels,
    settings:{
      strictMode:false,particles:true,screenShake:true,soundEffects:false,
      speedTestTimerPosition:'center',speedTestFontSize:'auto',
      gameplayHud:'minimal',actionModeIntensity:'full'
    }
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def open_campaign(page, base):
    page.goto(base)
    expect(page.locator(".menu-screen")).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible(timeout=10000)


def certify(browser_type, browser_name, base, evidence):
    context = browser_type.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    # An established Campaign must not become a fresh Campaign merely because
    # the Campaign tutorial key is missing.
    open_campaign(page, base)
    assert page.locator(".onboarding-tutorial-campaign").count() == 0
    expect(page.locator('.campaign-node[aria-current="true"]')).to_have_attribute("data-level", "17")
    expect(page.locator(".campaign-progress-count strong")).to_have_text("17")
    expect(page.locator(".campaign-placement-strip")).to_be_visible()
    expect(page.locator("[data-campaign-placement]")).to_be_visible()
    expect(page.locator("[data-campaign-account-state]")).to_be_visible()
    page.wait_for_timeout(150)
    assert page.locator('[data-campaign-account="sign-in"]').count() <= 1

    # Re-entering in the same runtime must resume the frontier, not Level 1.
    page.locator(".campaign-progress-screen .screen-back-button").click()
    expect(page.locator(".mode-screen")).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible()
    expect(page.locator('.campaign-node[aria-current="true"]')).to_have_attribute("data-level", "17")
    assert page.locator(".onboarding-tutorial-campaign").count() == 0

    # A full page reload must keep that same frontier.
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible()
    expect(page.locator('.campaign-node[aria-current="true"]')).to_have_attribute("data-level", "17")

    # Minimal HUD may hide secondary telemetry, but live Campaign score is essential.
    page.locator('[data-level="17"]').click()
    expect(page.locator(".campaign-gameplay-screen")).to_be_visible(timeout=10000)
    expect(page.locator(".campaign-typing-readout")).to_be_visible()
    score = page.locator(".campaign-hud-score")
    expect(score).to_be_visible()
    score_state = score.evaluate("""el => ({
      display:getComputedStyle(el).display,
      value:document.querySelector('#hud-score')?.textContent?.trim(),
      color:getComputedStyle(document.querySelector('#hud-score')).color
    })""")
    assert score_state["display"] != "none", score_state
    assert score_state["value"] is not None, score_state

    # Renderer readability: the moving word has a dark backing and high-contrast
    # glyphs; typed prefix is separately emphasized.
    readable = page.evaluate("""async () => {
      const renderer = await import('./js/renderer.js');
      const word = {id:'campaign-recovery-word',text:'visibility',x:260,y:220,typedIndex:4,separationX:0,separationY:0};
      renderer.createWordElement(word);
      renderer.updateWordElement(word,true,null);
      const visual=document.querySelector('[data-word-id="campaign-recovery-word"] .word-visual');
      const text=visual.querySelector('.word-text');
      const typed=visual.querySelector('.typed-letter');
      const remaining=visual.querySelector('.remaining-letter');
      return {
        wordColor:getComputedStyle(visual).color,
        textBackground:getComputedStyle(text).backgroundColor,
        typedColor:getComputedStyle(typed).color,
        typedBackground:getComputedStyle(typed).backgroundColor,
        typedBorder:getComputedStyle(typed).borderBottomWidth,
        typedWeight:getComputedStyle(typed).fontWeight,
        remainingColor:getComputedStyle(remaining).color
      };
    }""")
    assert readable["textBackground"] not in {"rgba(0, 0, 0, 0)", "transparent"}, readable
    assert readable["typedBackground"] not in {"rgba(0, 0, 0, 0)", "transparent"}, readable
    assert float(readable["typedBorder"].replace("px", "")) >= 2, readable
    assert int(readable["typedWeight"]) >= 700, readable

    # Drive the real Campaign targeting state and confirm the fixed readout shows
    # exactly what the player has already typed plus what remains.
    page.evaluate("""async () => {
      const [{appState},{updateHud}]=await Promise.all([
        import('./js/state.js'),
        import('./js/ui.js'),
      ]);
      const game=appState.game;
      game.words.push({id:'readout-target',text:'strike',typedIndex:3,x:420,y:220,separationX:0,separationY:0});
      game.activeTargetId='readout-target';
      game.targetingState={mode:'locked',prefix:'str',candidateIds:['readout-target'],activeTargetId:'readout-target',startedAtActiveMs:0};
      game.score=4321;
      updateHud(game);
    }""")
    page.wait_for_timeout(100)
    expect(page.locator("[data-campaign-typing-readout-typed]")).to_have_text("str")
    expect(page.locator("[data-campaign-typing-readout-remaining]")).to_have_text("ike")
    expect(page.locator("#hud-score")).to_have_text("4,321")

    page.screenshot(path=str(ARTIFACTS / f"{browser_name}-campaign-gameplay.png"), full_page=True)

    # Placement is a real route again and launches the canonical 60-second test.
    page.keyboard.press("Escape")
    expect(page.locator(".pause-overlay")).to_be_visible()
    page.locator('.pause-overlay [data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible(timeout=10000)
    page.locator("[data-campaign-placement]").click()
    expect(page.locator(".speed-test-screen")).to_be_visible(timeout=10000)
    expect(page.locator('[data-speed-config="time-60"]')).to_be_visible()
    snapshot = page.evaluate("""async () => {
      const {getCurrentSpeedTest}=await import('./js/speedTest.js');
      return getCurrentSpeedTest()?.configId;
    }""")
    assert snapshot == "time-60", snapshot

    alternate = page.locator('[data-speed-config="time-15"]')
    if alternate.count():
        alternate.click()
        page.wait_for_timeout(50)
        locked_snapshot = page.evaluate("""async () => {
          const {getCurrentSpeedTest}=await import('./js/speedTest.js');
          return {configId:getCurrentSpeedTest()?.configId, source:getCurrentSpeedTest()?.sessionSource};
        }""")
        assert locked_snapshot == {"configId": "time-60", "source": "campaign-placement"}, locked_snapshot

    assert not errors, f"{browser_name} page errors: {errors}"
    evidence.append({
      "browser": browser_name,
      "frontier": 17,
      "scoreVisible": True,
      "placementLaunch": "time-60",
      "readout": "str|ike",
      **readable,
    })
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    evidence = []
    report = {"sha": os.getenv("GITHUB_SHA"), "success": False, "checks": evidence}
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "firefox"):
                browser_type = getattr(playwright, browser_name).launch(headless=True)
                certify(browser_type, browser_name, base, evidence)
                browser_type.close()
        report["success"] = True
        print(f"PASS: Campaign recovery certified in {len(evidence)} browsers.", flush=True)
    except Exception:
        report["error"] = traceback.format_exc()
        print(report["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "campaign-recovery.json").write_text(json.dumps(report, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
