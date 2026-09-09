"""UI7 clean player-facing Boss visual certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "ui7-boss-gameplay"

SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel: 10,
    levels:{1:{grade:'A',bestWPM:82,bestAccuracy:98,bestScore:4000,completed:true}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def open_boss(page, base, seed):
    page.goto(f"{base}?seed={seed}")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator('.campaign-progress-screen')).to_be_visible()
    page.locator('[data-level="10"]').click()
    expect(page.locator('.boss-gameplay-screen')).to_be_visible(timeout=8000)
    expect(page.locator('.boss-gameplay-hud')).to_be_visible()
    assert page.locator('.dev-mode-indicator').count() == 0
    assert page.locator('.dev-runtime-panel').count() == 0
    assert page.locator('.dev-session-diagnostics').count() == 0


def set_scene(page, phase="ACTIVE", intro_ms=0, remaining_ms=18500):
    page.evaluate(
        """async ({phase, introMs, remainingMs}) => {
          const bossLoop = await import('./js/bossLoop.js');
          const state = await import('./js/state.js');
          const renderer = await import('./js/renderer.js');
          const ui = await import('./js/ui.js');
          bossLoop.stopBossLoop();
          const game = state.appState.game;
          game.phrases = ['signal focus', 'precision control', 'tempo survive'];
          game.segments = [...game.phrases];
          game.currentPhrase = game.phrases[1];
          game.phraseIndex = 1;
          game.displayedSequenceNumber = 2;
          game.phrasesCompleted = 1;
          game.phraseCharIndex = 10;
          game.phase = phase;
          game.introElapsedMs = introMs;
          game.transitionElapsedMs = 0;
          game.remainingMs = remainingMs;
          game.elapsedMs = 60000;
          game.score = 123456;
          game.combo = 14;
          game.correctKeystrokes = 300;
          game.totalKeystrokes = 310;
          game.correctCharacters = 300;
          game.missedCharacters = 0;
          game.config = {...game.config, segmentCount:3, totalWordCount:6};
          renderer.renderBossPhrase(game);
          ui.updateBossHud(game);
        }""",
        {"phase": phase, "introMs": intro_ms, "remainingMs": remaining_ms},
    )
    page.wait_for_timeout(120)


def geometry(page):
    return page.evaluate("""() => {
      const screen = document.querySelector('.boss-gameplay-screen');
      const hud = document.querySelector('.boss-gameplay-hud');
      const arena = document.querySelector('.boss-arena');
      const frame = document.querySelector('.boss-combat-frame');
      const frameBox = frame?.getBoundingClientRect();
      const trigger = document.querySelector('.boss-keyboard-trigger');
      const triggerStyle = trigger ? getComputedStyle(trigger) : null;
      const triggerBox = trigger?.getBoundingClientRect();
      const current = document.querySelector('.boss-current');
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screenOverflow: screen.scrollWidth - screen.clientWidth,
        hudHeight: hud.getBoundingClientRect().height,
        arenaHeight: arena.getBoundingClientRect().height,
        frameWidth: frameBox?.width || 0,
        frameBorder: frame ? getComputedStyle(frame).borderTopWidth : null,
        phase: screen.dataset.bossPhase,
        timeTier: screen.dataset.bossTimeTier,
        resolve: document.querySelector('[data-boss-resolve-value]')?.textContent,
        timer: document.querySelector('#boss-timer')?.textContent,
        sequenceText: document.querySelector('.boss-hud-sequence')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        currentBackground: current ? getComputedStyle(current).backgroundColor : null,
        keyboardDisplay: triggerStyle?.display || null,
        keyboardHeight: triggerBox?.height || 0,
        keyboardText: trigger?.textContent?.trim() || null,
      };
    }""")


def assert_sequence_label(metrics):
    assert metrics["sequenceText"].count("SEQUENCE") == 1, metrics
    assert "2 / 3" in metrics["sequenceText"], metrics


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
                open_boss(desktop, base, 811)

                if browser_name == "chromium":
                    set_scene(desktop, phase="INTRO", intro_ms=1400, remaining_ms=30000)
                    expect(desktop.locator('.boss-cinematic-intro')).to_be_visible()
                    desktop.screenshot(path=str(ARTIFACTS / "chromium-ui7-boss-intro.png"), full_page=True)

                set_scene(desktop, phase="ACTIVE", remaining_ms=18500)
                desktop_metrics = geometry(desktop)
                assert desktop_metrics["docOverflow"] <= 1 and desktop_metrics["screenOverflow"] <= 1, desktop_metrics
                assert desktop_metrics["arenaHeight"] > 650, desktop_metrics
                assert desktop_metrics["frameBorder"] == "0px", desktop_metrics
                assert desktop_metrics["phase"] == "active", desktop_metrics
                assert desktop_metrics["resolve"] in {"53%", "52%"}, desktop_metrics
                assert desktop_metrics["keyboardDisplay"] == "none", desktop_metrics
                assert desktop_metrics["currentBackground"] in {"rgba(0, 0, 0, 0)", "transparent"}, desktop_metrics
                assert_sequence_label(desktop_metrics)
                desktop.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui7-boss-player-desktop.png"), full_page=True)
                result["checks"].append({"browser": browser_name, "case": "player desktop", **desktop_metrics})
                desktop_context.close()

                mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
                mobile_context.add_init_script(SEED)
                local_only(mobile_context, base)
                mobile = mobile_context.new_page()
                open_boss(mobile, base, 812)
                set_scene(mobile, phase="ACTIVE", remaining_ms=9000)
                mobile_metrics = geometry(mobile)
                assert mobile_metrics["docOverflow"] <= 1 and mobile_metrics["screenOverflow"] <= 1, mobile_metrics
                assert mobile_metrics["arenaHeight"] > 650, mobile_metrics
                assert mobile_metrics["frameWidth"] <= 390, mobile_metrics
                assert mobile_metrics["keyboardText"] == "KEYBOARD", mobile_metrics
                assert mobile_metrics["keyboardDisplay"] != "none", mobile_metrics
                assert mobile_metrics["keyboardHeight"] >= 44, mobile_metrics
                assert_sequence_label(mobile_metrics)
                mobile.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui7-boss-player-mobile.png"), full_page=True)
                result["checks"].append({"browser": browser_name, "case": "player mobile", **mobile_metrics})

                if browser_name == "chromium":
                    mobile.set_viewport_size({"width": 390, "height": 360})
                    mobile.wait_for_timeout(120)
                    short_metrics = geometry(mobile)
                    assert short_metrics["docOverflow"] <= 1 and short_metrics["screenOverflow"] <= 1, short_metrics
                    assert short_metrics["arenaHeight"] >= 250, short_metrics
                    assert short_metrics["frameWidth"] <= 390, short_metrics
                    assert short_metrics["keyboardDisplay"] != "none", short_metrics
                    assert short_metrics["keyboardHeight"] >= 44, short_metrics
                    assert_sequence_label(short_metrics)
                    mobile.screenshot(path=str(ARTIFACTS / "chromium-ui7-boss-keyboard-height.png"), full_page=True)
                    result["checks"].append({"browser": browser_name, "case": "player 390x360", **short_metrics})

                mobile_context.close()
                browser.close()

        result["success"] = True
        print(f"PASS: {len(result['checks'])} clean UI7 player-facing visual checks.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui7-boss-player-visual.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
