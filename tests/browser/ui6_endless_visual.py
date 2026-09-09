"""UI6 clean player-facing Endless visual certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "ui6-endless-gameplay"

SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel: 20,
    levels:{1:{grade:'A',bestWPM:82,bestAccuracy:98,bestScore:4000,completed:true}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def open_endless(page, base, seed):
    page.goto(f"{base}?seed={seed}")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="endless"]').click()
    expect(page.locator('.endless-ready-screen')).to_be_visible()
    page.locator('[data-action="endless-start"]').click()
    expect(page.locator('.endless-gameplay-screen')).to_be_visible(timeout=8000)
    expect(page.locator('.endless-gameplay-hud')).to_be_visible()
    assert page.locator('.dev-mode-indicator').count() == 0
    assert page.locator('.dev-runtime-panel').count() == 0
    assert page.locator('.dev-session-diagnostics').count() == 0


def seed_scene(page):
    page.evaluate("""async () => {
      const endless = await import('./js/endlessMode.js');
      const renderer = await import('./js/renderer.js');
      const ui = await import('./js/ui.js');
      endless.stopEndlessLoop();
      const game = endless.getCurrentEndless();
      const area = document.querySelector('#play-area');
      const cx = area.clientWidth / 2;
      const cy = area.clientHeight / 2;
      game.coreX = cx;
      game.coreY = cy;
      game.stage = 7;
      game.highestStage = 7;
      game.stageWordsCompleted = 8;
      game.totalWordsCompleted = 48;
      game.completedWordCount = 48;
      game.integrity = 2;
      game.elapsedMs = 75432;
      game.finalRollingWpm = 92;
      game.peakWpm = 101;
      game.combo = 14;
      game.score = 123456;
      game.difficulty = {...game.difficulty, activeWordCap: 8};
      game.activeTargetId = 9102;
      game.targetingState = {mode:'locked', prefix:'si', candidateIds:[9102], activeTargetId:9102, startedAtActiveMs:74000};
      const make = (id, text, typedIndex, x, y) => ({id,text,typedIndex,x,y,separationX:0,separationY:0,coreArrivalProcessed:false,missedCharactersRecorded:false});
      game.words = [
        make(9101, 'breach', 0, cx + 76, cy + 36),
        make(9102, 'signal', 2, cx - 275, cy - 130),
        make(9103, 'survive', 2, cx + 255, cy + 118),
        make(9104, 'tempo', 0, cx - 330, cy + 150),
        make(9105, 'focus', 0, cx + 305, cy - 165),
        make(9106, 'control', 0, cx - 190, cy + 188),
      ];
      renderer.clearWordElements();
      for (const word of game.words) renderer.createWordElement(word);
      renderer.updateWordElement(game.words[0], false);
      renderer.updateWordElement(game.words[1], true);
      renderer.updateWordElement(game.words[2], false, {candidate:true, prefixLength:2});
      for (const word of game.words.slice(3)) renderer.updateWordElement(word, false);
      ui.updateEndlessHud(game);
      window.__ui6Visual = {endless, renderer, game};
    }""")
    page.wait_for_timeout(180)


def geometry(page):
    return page.evaluate("""() => {
      const screen = document.querySelector('.endless-gameplay-screen');
      const hud = document.querySelector('.endless-gameplay-hud');
      const play = document.querySelector('#play-area');
      const trigger = document.querySelector('.endless-keyboard-trigger');
      const triggerBox = trigger?.getBoundingClientRect();
      const triggerStyle = trigger ? getComputedStyle(trigger) : null;
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screenOverflow: screen.scrollWidth - screen.clientWidth,
        hudHeight: hud.getBoundingClientRect().height,
        playHeight: play.clientHeight,
        stageTier: screen.dataset.endlessStageTier,
        pressureTier: screen.dataset.endlessPressure,
        wpm: document.querySelector('[data-endless-wpm]')?.textContent,
        survival: document.querySelector('[data-endless-survival]')?.textContent,
        keyboardText: trigger?.textContent?.trim() || null,
        keyboardDisplay: triggerStyle?.display || null,
        keyboardHeight: triggerBox?.height || 0,
        imminent: document.querySelectorAll('.endless-word-imminent').length
      };
    }""")


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    result = {"sha": os.getenv("GITHUB_SHA"), "success": False, "checks": []}
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)

                desktop_context = browser.new_context(viewport={"width": 1440, "height": 900})
                desktop_context.add_init_script(SEED)
                local_only(desktop_context, base)
                desktop = desktop_context.new_page()
                open_endless(desktop, base, 711)
                seed_scene(desktop)
                desktop_metrics = geometry(desktop)
                assert desktop_metrics["docOverflow"] <= 1 and desktop_metrics["screenOverflow"] <= 1, desktop_metrics
                assert desktop_metrics["playHeight"] > 600, desktop_metrics
                assert desktop_metrics["stageTier"] == "mid", desktop_metrics
                assert desktop_metrics["pressureTier"] == "high", desktop_metrics
                assert desktop_metrics["wpm"] == "92", desktop_metrics
                assert desktop_metrics["survival"] == "01:15", desktop_metrics
                assert desktop_metrics["imminent"] >= 1, desktop_metrics
                assert desktop_metrics["keyboardDisplay"] == "none", desktop_metrics
                desktop.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui6-player-desktop.png"), full_page=True)
                result["checks"].append({"browser": browser_name, "case": "player desktop", **desktop_metrics})
                desktop_context.close()

                mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
                mobile_context.add_init_script(SEED)
                local_only(mobile_context, base)
                mobile = mobile_context.new_page()
                open_endless(mobile, base, 712)
                seed_scene(mobile)
                mobile_metrics = geometry(mobile)
                assert mobile_metrics["docOverflow"] <= 1 and mobile_metrics["screenOverflow"] <= 1, mobile_metrics
                assert mobile_metrics["playHeight"] > 500, mobile_metrics
                assert mobile_metrics["keyboardText"] == "KEYBOARD", mobile_metrics
                assert mobile_metrics["keyboardDisplay"] != "none", mobile_metrics
                assert mobile_metrics["keyboardHeight"] >= 44, mobile_metrics
                mobile.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui6-player-mobile.png"), full_page=True)
                result["checks"].append({"browser": browser_name, "case": "player mobile", **mobile_metrics})

                if browser_name == "chromium":
                    mobile.set_viewport_size({"width": 390, "height": 360})
                    mobile.wait_for_timeout(120)
                    short_metrics = geometry(mobile)
                    assert short_metrics["docOverflow"] <= 1 and short_metrics["screenOverflow"] <= 1, short_metrics
                    assert short_metrics["playHeight"] >= 180, short_metrics
                    assert short_metrics["keyboardDisplay"] != "none", short_metrics
                    assert short_metrics["keyboardHeight"] >= 44, short_metrics
                    mobile.screenshot(path=str(ARTIFACTS / "chromium-ui6-player-keyboard-height.png"), full_page=True)
                    result["checks"].append({"browser": browser_name, "case": "player 390x360", **short_metrics})

                mobile_context.close()
                browser.close()

        result["success"] = True
        print(f"PASS: {len(result['checks'])} clean UI6 player-facing visual checks.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui6-endless-player-visual.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
