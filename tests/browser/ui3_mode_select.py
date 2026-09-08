"""UI3 Mode Select browser certification across Chromium and Firefox."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "ui3-mode-select"

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

ACTIVE_IDS = ["campaign", "speed-test", "endless", "arcade-rush"]


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


def open_modes(page, base):
    page.goto(base)
    expect(page.locator(".title-screen")).to_be_visible()
    page.locator('[data-action="modes"]').click()
    assert_mode_select(page)


def assert_mode_select(page):
    expect(page.locator(".mode-select-screen")).to_be_visible()
    expect(page.locator(".mode-select-shell")).to_be_visible()
    expect(page.locator(".mode-showcase")).to_be_visible()
    expect(page.locator(".mode-options")).to_be_visible()
    assert page.locator("[data-mode-index]").count() == 5
    active = page.locator("button.mode-option.available").evaluate_all(
        "els => els.map(el => el.dataset.modeId)"
    )
    assert active == ACTIVE_IDS, active
    practice = page.locator('article[data-mode-id="practice"]')
    assert practice.count() == 1
    assert practice.get_attribute("aria-disabled") == "true"
    assert page.locator('[data-mode-home-index="5"]').count() == 1
    assert page.locator(".mode-panel").count() == 0
    assert page.locator(".mode-grid").count() == 0
    assert page.locator(".mode-card").count() == 0


def focused_index(page):
    return page.evaluate("""() => {
      const active = document.activeElement;
      return active?.dataset?.modeIndex ?? active?.dataset?.modeHomeIndex ?? null;
    }""")


def inspect_foundation(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base)
    open_modes(page, base)

    initial = page.evaluate("""() => {
      const shell = document.querySelector('.mode-select-shell').getBoundingClientRect();
      const showcase = document.querySelector('.mode-showcase').getBoundingClientRect();
      const option = document.querySelector('button.mode-option.available').getBoundingClientRect();
      const home = document.querySelector('[data-mode-home-index]').getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        shellLeft: shell.left,
        shellRight: shell.right,
        shellWidth: shell.width,
        showcaseHeight: showcase.height,
        optionHeight: option.height,
        homeHeight: home.height,
        modeNavLabel: document.querySelector('.mode-options').getAttribute('aria-label'),
      };
    }""")
    assert initial["horizontalOverflow"] <= 1, initial
    assert initial["shellLeft"] >= -1, initial
    assert initial["shellRight"] <= 1441, initial
    assert initial["optionHeight"] >= 44, initial
    assert initial["homeHeight"] >= 44, initial
    assert initial["modeNavLabel"] == "Game modes", initial
    assert focused_index(page) == "0", focused_index(page)
    expect(page.locator(".mode-showcase-heading h2")).to_have_text("Campaign")
    assert page.locator(".mode-motif-campaign").count() == 1

    # Hover selection updates the shared state and therefore the large stage.
    page.locator('[data-mode-id="speed-test"]').hover()
    expect(page.locator(".mode-showcase-heading h2")).to_have_text("Typing Test")
    assert page.locator(".mode-motif-typing").count() == 1
    page.locator('[data-mode-id="arcade-rush"]').hover()
    expect(page.locator(".mode-showcase-heading h2")).to_have_text("Arcade Rush")
    assert page.locator(".mode-motif-rush").count() == 1
    page.locator('article[data-mode-id="practice"]').hover()
    expect(page.locator(".mode-showcase-heading h2")).to_have_text("Practice Lab")
    assert page.locator(".mode-motif-neutral").count() == 1
    expect(page.locator(".mode-showcase-command")).to_contain_text("Not available yet")

    # Return to a production-active visual before capturing evidence.
    page.locator('[data-mode-id="campaign"]').hover()
    expect(page.locator(".mode-showcase-heading h2")).to_have_text("Campaign")
    page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui3-desktop.png"), full_page=True)

    evidence.append({"browser": browser_name, "case": "foundation and visual identity", **initial})
    assert_no_errors(errors, f"{browser_name} foundation")
    context.close()


def inspect_keyboard_and_routes(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base)
    open_modes(page, base)

    assert focused_index(page) == "0", focused_index(page)
    expected = [
        ("ArrowRight", "1", "Typing Test"),
        ("ArrowDown", "2", "Endless"),
        ("ArrowRight", "3", "Arcade Rush"),
        ("ArrowDown", "4", "Practice Lab"),
        ("ArrowRight", "5", "Main Menu"),
        ("ArrowDown", "0", "Campaign"),
    ]
    for key, index, title in expected:
        page.keyboard.press(key)
        assert_mode_select(page)
        assert focused_index(page) == index, (key, focused_index(page), index)
        expect(page.locator(".mode-showcase-heading h2")).to_have_text(title)

    page.keyboard.press("ArrowLeft")
    assert focused_index(page) == "5", focused_index(page)
    expect(page.locator('[data-mode-home-index="5"]')).to_have_class("mode-home-action selected")
    page.keyboard.press("Enter")
    expect(page.locator(".title-screen")).to_be_visible()

    route_expectations = {
        "campaign": ".level-screen",
        "speed-test": ".speed-test-screen",
        "endless": ".endless-ready-screen",
        "arcade-rush": '[data-rush-view="ready"]',
    }
    for mode_id, destination in route_expectations.items():
        open_modes(page, base)
        page.locator(f'[data-mode-id="{mode_id}"]').click()
        expect(page.locator(destination)).to_be_visible()

    evidence.append({
        "browser": browser_name,
        "case": "six-position keyboard wrap and four public route destinations",
        "activeModes": ACTIVE_IDS,
    })
    assert_no_errors(errors, f"{browser_name} keyboard/routes")
    context.close()


def inspect_viewport_matrix(browser, base, browser_name, evidence):
    for width, height, label in VIEWPORTS:
        context, page, errors = new_context(browser, base, width, height)
        open_modes(page, base)

        geometry = page.evaluate("""() => {
          const shell = document.querySelector('.mode-select-shell').getBoundingClientRect();
          const active = [...document.querySelectorAll('button.mode-option.available')]
            .map(el => el.getBoundingClientRect());
          const home = document.querySelector('[data-mode-home-index]').getBoundingClientRect();
          return {
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            shellLeft: shell.left,
            shellRight: shell.right,
            viewportWidth: innerWidth,
            minActiveHeight: Math.min(...active.map(r => r.height)),
            homeHeight: home.height,
          };
        }""")
        assert geometry["horizontalOverflow"] <= 1, (browser_name, label, geometry)
        assert geometry["shellLeft"] >= -1, (browser_name, label, geometry)
        assert geometry["shellRight"] <= width + 1, (browser_name, label, geometry)
        assert geometry["minActiveHeight"] >= 44, (browser_name, label, geometry)
        assert geometry["homeHeight"] >= 44, (browser_name, label, geometry)

        # Constrained heights must scroll to the sixth keyboard action rather than crush it.
        home = page.locator('[data-mode-home-index="5"]')
        home.scroll_into_view_if_needed()
        page.wait_for_timeout(30)
        box = home.bounding_box()
        assert box is not None, (browser_name, label, "missing Main Menu box")
        assert box["y"] >= -1, (browser_name, label, box)
        assert box["y"] + box["height"] <= height + 1, (browser_name, label, box)

        scroll = page.evaluate("""() => ({
          top: document.scrollingElement?.scrollTop || 0,
          scrollHeight: document.scrollingElement?.scrollHeight || 0,
          clientHeight: document.scrollingElement?.clientHeight || 0,
        })""")

        if browser_name == "chromium" and label in {"mobile", "mobile-keyboard-height"}:
            page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui3-{label}.png"), full_page=True)

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


def duration_seconds(value):
    source = str(value).strip().lower().split(",")[0]
    if source.endswith("ms"):
        return float(source[:-2]) / 1000
    if source.endswith("s"):
        return float(source[:-1])
    raise AssertionError(f"unsupported CSS duration: {value}")


def inspect_reduced_motion(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base, reduced_motion="reduce")
    open_modes(page, base)
    option = page.locator('[data-mode-id="speed-test"]')
    transition = option.evaluate("el => getComputedStyle(el).transitionDuration")
    motif = page.locator(".mode-motif-campaign .trajectory").first
    animation = motif.evaluate("el => getComputedStyle(el, '::before').animationDuration")
    assert duration_seconds(transition) <= 0.00001, transition
    assert duration_seconds(animation) <= 0.00001, animation
    option.hover()
    page.wait_for_timeout(30)
    transform = option.evaluate("el => getComputedStyle(el).transform")
    assert transform == "none", transform
    evidence.append({
        "browser": browser_name,
        "case": "reduced motion",
        "transition": transition,
        "animation": animation,
        "transform": transform,
    })
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
        print(f"PASS: {len(evidence)} UI3 Mode Select browser checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui3-mode-select.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
