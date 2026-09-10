"""UI4 Campaign progression browser certification.

Certifies the real Campaign route surface in Chromium and Firefox without entering Practice Lab.
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
ARTIFACTS = ROOT / "browser-artifacts" / "ui4-campaign-progression"

SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel: 17,
    levels: {
      1:{grade:'S',bestWPM:92.4,bestAccuracy:99.1,bestScore:4800,completed:true},
      2:{grade:'A',bestWPM:86.2,bestAccuracy:97.8,bestScore:4200,completed:true},
      3:{grade:'A',bestWPM:84.8,bestAccuracy:97.1,bestScore:4100,completed:true},
      10:{grade:'B',bestWPM:78.6,bestAccuracy:94.2,bestScore:3900,completed:true},
      11:{grade:'A',bestWPM:83.0,bestAccuracy:96.4,bestScore:4050,completed:true}
    },
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


def open_campaign(page, base, suffix=""):
    page.goto(base + suffix)
    expect(page.locator(".menu-screen")).to_be_visible()
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator(".campaign-progress-screen")).to_be_visible()


def selected_level(page):
    return page.locator('.campaign-node[aria-current="true"]').get_attribute("data-level")


def duration_seconds(value):
    source = str(value).split(",")[0].strip().lower()
    if source.endswith("ms"):
        return float(source[:-2]) / 1000
    if source.endswith("s"):
        return float(source[:-1])
    return 0.0


def inspect_desktop(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)
    open_campaign(page, base)

    assert page.locator("[data-campaign-sector]").count() == 10
    assert page.locator(".campaign-node").count() == 100
    assert page.locator('[data-level="17"]:not(:disabled)').count() == 1
    assert page.locator('[data-level="18"]:disabled').count() == 1
    assert page.locator('[data-level="10"].is-boss').count() == 1
    assert page.locator('[data-level="20"].is-boss:disabled').count() == 1
    expect(page.locator('[data-level="1"] .campaign-node-state')).to_have_text("S")
    expect(page.locator(".campaign-progress-count strong")).to_have_text("17")
    expect(page.locator(".campaign-mission-heading strong")).to_have_text("LEVEL 01")
    expect(page.locator(".campaign-mission-metric").first.locator("strong")).to_have_text("S")

    geometry = page.evaluate("""() => ({
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      screenOverflow: document.querySelector('.campaign-progress-screen').scrollWidth - document.querySelector('.campaign-progress-screen').clientWidth,
      routeClientHeight: document.querySelector('[data-campaign-route-scroll]').clientHeight,
      routeScrollHeight: document.querySelector('[data-campaign-route-scroll]').scrollHeight
    })""")
    assert geometry["docOverflow"] <= 1, geometry
    assert geometry["screenOverflow"] <= 1, geometry
    assert geometry["routeClientHeight"] > 100, geometry
    assert geometry["routeScrollHeight"] > geometry["routeClientHeight"], geometry

    node_box = page.locator('[data-level="1"]').bounding_box()
    assert node_box and node_box["width"] >= 44 and node_box["height"] >= 44, node_box

    assert selected_level(page) == "1"
    page.keyboard.press("ArrowRight")
    assert selected_level(page) == "2"
    page.keyboard.press("ArrowDown")
    assert selected_level(page) == "12", selected_level(page)
    page.keyboard.press("ArrowUp")
    assert selected_level(page) == "2"

    # Move to the furthest unlocked mission and ensure self-scroll keeps focus visible.
    page.keyboard.press("ArrowDown")  # 12
    for _ in range(5):
        page.keyboard.press("ArrowRight")
    assert selected_level(page) == "17"
    visibility = page.locator('[data-level="17"]').evaluate("""el => {
      const owner = document.querySelector('[data-campaign-route-scroll]');
      const r = el.getBoundingClientRect();
      const o = owner.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,ownerTop:o.top,ownerBottom:o.bottom,scrollTop:owner.scrollTop};
    }""")
    assert visibility["top"] >= visibility["ownerTop"] - 1, visibility
    assert visibility["bottom"] <= visibility["ownerBottom"] + 1, visibility
    assert visibility["scrollTop"] >= 0, visibility

    page.keyboard.press("ArrowRight")
    assert selected_level(page) == "17", selected_level(page)
    page.keyboard.press("Enter")
    expect(page.locator(".game-screen")).to_be_visible()

    if browser_name in {"chromium", "firefox"}:
        page.goto(base)
        open_campaign(page, base)
        page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui4-desktop.png"), full_page=True)

    evidence.append({"browser": browser_name, "case": "desktop route, state, keyboard and launch", **geometry})
    assert_no_errors(errors, f"{browser_name} desktop")
    context.close()


def inspect_mobile(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)
    open_campaign(page, base)

    columns = page.locator(".campaign-sector-track").first.evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
    assert columns == 5, columns
    assert selected_level(page) == "1"
    page.keyboard.press("ArrowDown")
    assert selected_level(page) == "6", selected_level(page)
    page.keyboard.press("ArrowRight")
    assert selected_level(page) == "7"
    page.keyboard.press("ArrowUp")
    assert selected_level(page) == "2"

    node_box = page.locator('[data-level="2"]').bounding_box()
    assert node_box and node_box["width"] >= 52 and node_box["height"] >= 54, node_box
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, overflow

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-ui4-mobile.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 360})
        page.wait_for_timeout(80)
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(80)
        short = page.evaluate("""() => {
          const owner = document.querySelector('[data-campaign-route-scroll]');
          const selected = document.querySelector('.campaign-node[aria-current="true"]');
          const o = owner.getBoundingClientRect();
          const s = selected.getBoundingClientRect();
          return {
            level:selected.dataset.level,
            clientHeight:owner.clientHeight,
            scrollHeight:owner.scrollHeight,
            visible:s.top >= o.top - 1 && s.bottom <= o.bottom + 1,
            overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
          };
        }""")
        assert short["clientHeight"] > 70, short
        assert short["scrollHeight"] > short["clientHeight"], short
        assert short["visible"], short
        assert short["overflow"] <= 1, short
        page.screenshot(path=str(ARTIFACTS / "chromium-ui4-mobile-keyboard-height.png"), full_page=True)
        evidence.append({"browser": browser_name, "case": "mobile keyboard-height reachability", **short})

    evidence.append({"browser": browser_name, "case": "mobile five-column navigation and targets", "columns": columns, "overflow": overflow})
    assert_no_errors(errors, f"{browser_name} mobile")
    context.close()


def inspect_dev_and_back(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 1366, "height": 768})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)
    open_campaign(page, base, "?dev=1&seed=41")
    expect(page.locator(".dev-panel")).to_be_attached()
    assert page.locator('[data-level="100"]:not(:disabled)').count() == 1
    assert page.locator('[data-level="100"].dev-access.is-boss').count() == 1
    page.keyboard.press("Escape")
    expect(page.locator(".mode-screen")).to_be_visible()
    assert page.locator(".practice-lab-screen").count() == 0
    evidence.append({"browser": browser_name, "case": "developer access and Escape boundary"})
    assert_no_errors(errors, f"{browser_name} dev/back")
    context.close()


def inspect_reduced_motion(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    errors = errors_for(page)
    open_campaign(page, base)
    computed = page.locator('[data-level="17"] .campaign-node-marker').evaluate("""el => ({
      animationDuration:getComputedStyle(el).animationDuration,
      transitionDuration:getComputedStyle(el).transitionDuration
    })""")
    assert duration_seconds(computed["animationDuration"]) <= 0.00001, computed
    assert duration_seconds(computed["transitionDuration"]) <= 0.00001, computed
    evidence.append({"browser": browser_name, "case": "reduced motion", **computed})
    assert_no_errors(errors, f"{browser_name} reduced motion")
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
                inspect_dev_and_back(browser, base, browser_name, evidence)
                inspect_reduced_motion(browser, base, browser_name, evidence)
                browser.close()
        result["success"] = True
        print(f"PASS: {len(evidence)} UI4 Campaign progression browser checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui4-campaign-progression.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
