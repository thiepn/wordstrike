"""UI5 clean player-facing visual certification.

Captures ordinary Campaign without developer diagnostics and freezes the mobile HUD/input
composition that screenshot review uses for release approval.
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
    levels:{1:{grade:'A',bestWPM:84,bestAccuracy:98.2,bestScore:4100,completed:true}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def open_campaign(page, base, seed):
    page.goto(f"{base}?seed={seed}")
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-screen')).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator('.campaign-progress-screen')).to_be_visible()
    page.locator('[data-level="1"]').click()
    expect(page.locator('.campaign-gameplay-screen')).to_be_visible(timeout=8000)
    expect(page.locator('.campaign-gameplay-hud')).to_be_visible()
    expect(page.locator('.campaign-core')).to_be_visible()
    assert page.locator('.dev-mode-indicator').count() == 0
    assert page.locator('.dev-runtime-panel').count() == 0
    assert page.locator('.dev-session-diagnostics').count() == 0


def geometry(page):
    return page.evaluate("""() => {
      const screen = document.querySelector('.campaign-gameplay-screen');
      const hud = document.querySelector('.campaign-gameplay-hud');
      const play = document.querySelector('#play-area');
      const pace = document.querySelector('.campaign-hud-pace');
      const accuracy = document.querySelector('#hud-accuracy')?.closest('.campaign-hud-metric');
      const trigger = document.querySelector('.campaign-keyboard-trigger');
      const triggerBox = trigger?.getBoundingClientRect();
      const triggerStyle = trigger ? getComputedStyle(trigger) : null;
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screenOverflow: screen.scrollWidth - screen.clientWidth,
        hudHeight: hud.getBoundingClientRect().height,
        playHeight: play.clientHeight,
        paceArea: pace ? getComputedStyle(pace).gridArea : null,
        accuracyArea: accuracy ? getComputedStyle(accuracy).gridArea : null,
        keyboardText: trigger?.textContent?.trim() || null,
        keyboardHeight: triggerBox?.height || 0,
        keyboardDisplay: triggerStyle?.display || null,
        keyboardBorder: triggerStyle?.borderTopWidth || null,
        keyboardBackground: triggerStyle?.backgroundColor || null,
        integrity: screen.dataset.coreIntegrity || null
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
                open_campaign(desktop, base, 601)
                desktop.wait_for_timeout(180)
                desktop_metrics = geometry(desktop)
                assert desktop_metrics["docOverflow"] <= 1 and desktop_metrics["screenOverflow"] <= 1, desktop_metrics
                assert desktop_metrics["playHeight"] > 500, desktop_metrics
                assert desktop_metrics["integrity"] == "3", desktop_metrics
                assert desktop_metrics["keyboardText"] == "KEYBOARD", desktop_metrics
                assert desktop_metrics["keyboardHeight"] == 0, desktop_metrics
                assert desktop_metrics["keyboardDisplay"] == "none", desktop_metrics
                desktop.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui5-player-desktop.png"), full_page=True)
                result["checks"].append({"browser": browser_name, "case": "player desktop", **desktop_metrics})
                desktop_context.close()

                mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
                mobile_context.add_init_script(SEED)
                local_only(mobile_context, base)
                mobile = mobile_context.new_page()
                open_campaign(mobile, base, 602)
                mobile.wait_for_timeout(180)
                mobile_metrics = geometry(mobile)
                assert mobile_metrics["docOverflow"] <= 1 and mobile_metrics["screenOverflow"] <= 1, mobile_metrics
                assert mobile_metrics["playHeight"] > 500, mobile_metrics
                assert mobile_metrics["paceArea"] == "pace", mobile_metrics
                assert mobile_metrics["accuracyArea"] == "acc", mobile_metrics
                assert mobile_metrics["keyboardText"] == "KEYBOARD", mobile_metrics
                assert mobile_metrics["keyboardDisplay"] != "none", mobile_metrics
                assert mobile_metrics["keyboardHeight"] >= 44, mobile_metrics
                assert mobile_metrics["keyboardBorder"] == "0px", mobile_metrics
                mobile.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui5-player-mobile.png"), full_page=True)
                result["checks"].append({"browser": browser_name, "case": "player mobile", **mobile_metrics})

                if browser_name == "chromium":
                    mobile.set_viewport_size({"width": 390, "height": 360})
                    mobile.wait_for_timeout(120)
                    short_metrics = geometry(mobile)
                    assert short_metrics["docOverflow"] <= 1 and short_metrics["screenOverflow"] <= 1, short_metrics
                    assert short_metrics["playHeight"] >= 180, short_metrics
                    assert short_metrics["paceArea"] == "pace", short_metrics
                    assert short_metrics["accuracyArea"] == "acc", short_metrics
                    assert short_metrics["keyboardText"] == "KEYBOARD", short_metrics
                    assert short_metrics["keyboardDisplay"] != "none", short_metrics
                    assert short_metrics["keyboardHeight"] >= 44, short_metrics
                    mobile.screenshot(path=str(ARTIFACTS / "chromium-ui5-player-keyboard-height.png"), full_page=True)
                    result["checks"].append({"browser": browser_name, "case": "player 390x360", **short_metrics})

                mobile_context.close()
                browser.close()

        result["success"] = True
        print(f"PASS: {len(result['checks'])} clean UI5 player-facing visual checks.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui5-campaign-player-visual.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
