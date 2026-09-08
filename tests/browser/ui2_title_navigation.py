"""UI2 Title screen and global-navigation browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "ui2-title-navigation"

ONBOARDING_SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""

VIEWPORTS = [
    (1920, 1080, "wide-desktop"),
    (1440, 900, "desktop"),
    (1366, 768, "laptop"),
    (1280, 600, "short-desktop"),
    (768, 1024, "tablet"),
    (390, 844, "mobile"),
    (360, 800, "mobile-narrow"),
    (390, 360, "mobile-keyboard-height"),
]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route(
        "**/*",
        lambda route: route.continue_()
        if route.request.url.startswith(base)
        else route.abort(),
    )


def new_context(browser, base, width=1440, height=900, reduced_motion="no-preference"):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        reduced_motion=reduced_motion,
    )
    context.add_init_script(ONBOARDING_SEED)
    local_only(context, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return context, page, errors


def assert_no_errors(errors, label):
    assert not errors, f"{label}: page errors: {errors}"


def assert_title(page):
    expect(page.locator(".title-screen")).to_be_visible()
    expect(page.locator(".title-global-nav")).to_be_visible()
    assert page.locator(".ambient-word").count() == 0
    assert page.locator(".title-panel").count() == 0
    assert page.locator(".menu-list").count() == 0
    assert page.locator("[data-title-index]").count() == 4


def inspect_foundation(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base)
    page.goto(base)
    assert_title(page)

    values = page.evaluate("""() => {
      const start = document.querySelector('[data-title-index="0"]');
      const utility = document.querySelector('[data-title-index="1"]');
      const nav = document.querySelector('.title-global-nav');
      const shell = document.querySelector('.title-shell');
      const startStyle = getComputedStyle(start);
      const utilityStyle = getComputedStyle(utility);
      const navStyle = getComputedStyle(nav);
      const shellStyle = getComputedStyle(shell);
      return {
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        startHeight: start.getBoundingClientRect().height,
        utilityHeight: utility.getBoundingClientRect().height,
        startBackground: startStyle.backgroundColor,
        utilityBackground: utilityStyle.backgroundColor,
        utilityBorderTop: utilityStyle.borderTopWidth,
        navBorderLeft: navStyle.borderLeftWidth,
        shellWidth: shell.getBoundingClientRect().width,
        shellBorderTop: shellStyle.borderTopWidth,
        navLabel: nav.getAttribute('aria-label'),
      };
    }""")

    assert values["bodyOverflow"] <= 1, values
    assert values["startHeight"] >= 44, values
    assert values["utilityHeight"] >= 44, values
    assert values["navLabel"] == "Global navigation", values
    assert values["shellBorderTop"] == "0px", values
    assert values["utilityBorderTop"] == "1px", values

    labels = page.locator("[data-title-index]").evaluate_all(
        "els => els.map(el => el.textContent.replace(/\\s+/g, ' ').trim())"
    )
    assert labels[0].startswith("START"), labels
    assert "Leaderboards" in labels[1], labels
    assert "Profile & Stats" in labels[2], labels
    assert "Settings" in labels[3], labels

    page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui2-desktop.png"), full_page=True)
    evidence.append({"browser": browser_name, "case": "foundation", **values})
    assert_no_errors(errors, f"{browser_name} foundation")
    context.close()


def inspect_keyboard_and_routes(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base)
    page.goto(base)
    assert_title(page)

    def focused_index():
        return page.evaluate("document.activeElement?.dataset?.titleIndex || null")

    assert focused_index() == "0", focused_index()
    page.keyboard.press("ArrowDown")
    assert_title(page)
    assert focused_index() == "1", focused_index()
    expect(page.locator('[data-title-index="1"]')).to_have_class("title-nav-action selected")
    page.keyboard.press("ArrowDown")
    assert focused_index() == "2", focused_index()
    page.keyboard.press("ArrowDown")
    assert focused_index() == "3", focused_index()
    page.keyboard.press("ArrowDown")
    assert focused_index() == "0", focused_index()
    page.keyboard.press("ArrowUp")
    assert focused_index() == "3", focused_index()

    # Native Enter activation on the focused Settings button must still work.
    page.keyboard.press("Enter")
    expect(page.locator(".settings-screen")).to_be_visible()
    page.locator('[data-action="back"]').first.click()
    assert_title(page)

    page.locator('[data-action="profile"]').click()
    expect(page.locator(".profile-stats-screen")).to_be_visible()
    page.locator('[data-stats-action="back"]').click()
    assert_title(page)

    page.locator('[data-action="open-leaderboards"]').click()
    expect(page.locator(".leaderboards-screen")).to_be_visible()
    page.locator('[data-action="leaderboard-main-menu"]').click()
    assert_title(page)

    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-screen")).to_be_visible()

    evidence.append({"browser": browser_name, "case": "keyboard wrap and four route destinations"})
    assert_no_errors(errors, f"{browser_name} keyboard/routes")
    context.close()


def inspect_viewport_matrix(browser, base, browser_name, evidence):
    for width, height, label in VIEWPORTS:
        context, page, errors = new_context(browser, base, width, height)
        page.goto(base)
        assert_title(page)

        geometry = page.evaluate("""() => {
          const shell = document.querySelector('.title-shell').getBoundingClientRect();
          const start = document.querySelector('[data-title-index="0"]').getBoundingClientRect();
          const utilities = [...document.querySelectorAll('.title-nav-action')]
            .map(el => el.getBoundingClientRect());
          return {
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            shellLeft: shell.left,
            shellRight: shell.right,
            viewportWidth: innerWidth,
            startHeight: start.height,
            minUtilityHeight: Math.min(...utilities.map(r => r.height)),
          };
        }""")
        assert geometry["horizontalOverflow"] <= 1, (browser_name, label, geometry)
        assert geometry["shellLeft"] >= -1, (browser_name, label, geometry)
        assert geometry["shellRight"] <= width + 1, (browser_name, label, geometry)
        assert geometry["startHeight"] >= 44, (browser_name, label, geometry)
        assert geometry["minUtilityHeight"] >= 44, (browser_name, label, geometry)

        # Short screens may scroll vertically, but the final Settings action must be reachable.
        last_action = page.locator('[data-title-index="3"]')
        last_action.scroll_into_view_if_needed()
        page.wait_for_timeout(30)
        box = last_action.bounding_box()
        assert box is not None, (browser_name, label, "missing Settings box")
        assert box["y"] >= -1, (browser_name, label, box)
        assert box["y"] + box["height"] <= height + 1, (browser_name, label, box)

        scroll = page.evaluate("""() => ({
          top: document.scrollingElement?.scrollTop || 0,
          scrollHeight: document.scrollingElement?.scrollHeight || 0,
          clientHeight: document.scrollingElement?.clientHeight || 0
        })""")

        if browser_name == "chromium" and label in {"mobile", "mobile-keyboard-height"}:
            page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui2-{label}.png"), full_page=True)

        evidence.append({
            "browser": browser_name,
            "case": f"viewport-{label}",
            "width": width,
            "height": height,
            **geometry,
            "scroll": scroll,
        })
        assert_no_errors(errors, f"{browser_name} {label}")
        context.close()


def inspect_reduced_motion(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base, reduced_motion="reduce")
    page.goto(base)
    assert_title(page)
    action = page.locator('[data-title-index="1"]')
    action.hover()
    page.wait_for_timeout(40)
    transform = action.evaluate("el => getComputedStyle(el).transform")
    duration = action.evaluate("el => getComputedStyle(el).transitionDuration")
    assert transform == "none", transform
    assert duration in {"0s", "0.000001s", "1e-06s"}, duration
    evidence.append({"browser": browser_name, "case": "reduced-motion", "transform": transform, "duration": duration})
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
                inspect_foundation(browser, base, browser_name, evidence)
                inspect_keyboard_and_routes(browser, base, browser_name, evidence)
                inspect_viewport_matrix(browser, base, browser_name, evidence)
                inspect_reduced_motion(browser, base, browser_name, evidence)
                browser.close()
        result["success"] = True
        print(f"PASS: {len(evidence)} UI2 title/navigation browser checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui2-title-navigation.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
