"""P2 browser-history, canonical deep-link and reload qualification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "p2-navigation"
ONBOARDING = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:2, typing:1, endless:1, boss:1, leaderboards:1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, "seen");
})();"""
PUBLIC = (
    ("campaign", ".level-screen"),
    ("speed-test", ".speed-test-screen"),
    ("endless", ".endless-ready-screen"),
    ("practice", '.pl-navigation [data-route="skill-map"]'),
)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

def make_context(browser, base, mobile=False):
    dimensions = {"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900}
    context = browser.new_context(viewport=dimensions)
    context.add_init_script(ONBOARDING)
    context.route("**/*", lambda route: route.continue_()
                  if route.request.url.startswith(base) else route.abort())
    return context

def check_history(browser, base, browser_name, results, mobile=False):
    context = make_context(browser, base, mobile)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    expect(page.locator(".title-screen")).to_be_visible(timeout=15000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=10000)
    assert "screen=modes" in page.url, page.url

    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".level-screen")).to_be_visible(timeout=10000)
    assert "mode=campaign" in page.url, page.url
    assert page.evaluate("history.state?.__wordstrikeRouteV1") == "campaign"

    # Must restore the *actual UI*, not merely the address bar.
    page.go_back(wait_until="domcontentloaded")
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=15000)
    assert "screen=modes" in page.url, page.url
    page.go_forward(wait_until="domcontentloaded")
    expect(page.locator(".level-screen")).to_be_visible(timeout=15000)
    assert "mode=campaign" in page.url, page.url
    assert not errors, errors
    results.append({"case": "back-forward", "browser": browser_name, "mobile": mobile})
    context.close()

def check_direct_links(browser, base, browser_name, results):
    context = make_context(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    for mode, selector in PUBLIC:
        page.goto(f"{base}?mode={mode}", wait_until="domcontentloaded")
        expect(page.locator(selector)).to_be_visible(timeout=15000)
        assert f"mode={mode}" in page.url, (mode, page.url)
        page.evaluate("""() => localStorage.setItem("wordstrike-p2-no-data-loss",
          JSON.stringify({ historicSave: true, sample: [1, 2, 3] }))""")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(selector)).to_be_visible(timeout=15000)
        saved = page.evaluate("""() => JSON.parse(
          localStorage.getItem("wordstrike-p2-no-data-loss"))""")
        assert saved == {"historicSave": True, "sample": [1, 2, 3]}, saved
        assert page.evaluate("history.state?.__wordstrikeRouteV1") == mode
        results.append({"case": "link-and-reload", "browser": browser_name, "mode": mode})
    assert not errors, errors
    context.close()

def check_flow(browser, base, browser_name, results):
    context = make_context(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "?mode=flow&flowRelease=1&flowRun=1&flowSeed=p2-history-fixed",
              wait_until="domcontentloaded")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=20000)
    assert "mode=flow" in page.url, page.url
    assert "flowRelease=" not in page.url, page.url
    assert "flowRun=" not in page.url, page.url
    assert "flowSeed=p2-history-fixed" in page.url, page.url
    page.keyboard.press("Escape")
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=15000)
    assert "mode=flow" not in page.url, page.url
    assert "screen=modes" in page.url, page.url
    assert not errors, errors
    results.append({"case": "legacy-flow-and-exit", "browser": browser_name})
    context.close()

def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    result = {"sha": os.getenv("GITHUB_SHA"), "success": False, "checks": []}
    try:
        with sync_playwright() as playwright:
            for name in ("chromium", "firefox"):
                browser = getattr(playwright, name).launch()
                check_history(browser, base, name, result["checks"])
                check_direct_links(browser, base, name, result["checks"])
                check_flow(browser, base, name, result["checks"])
                if name == "chromium":
                    check_history(browser, base, name, result["checks"], mobile=True)
                browser.close()
        result["success"] = True
        print(f"PASS: {len(result['checks'])} P2 URL/history/reload browser checks", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "p2-navigation.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
