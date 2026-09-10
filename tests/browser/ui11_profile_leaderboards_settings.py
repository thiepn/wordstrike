"""UI11 Profile, Leaderboards, and Settings browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "ui11-profile-leaderboards-settings"

ONBOARDING_SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""


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


def open_profile(page):
    page.goto(page.url or "about:blank") if False else None
    expect(page.locator(".title-screen")).to_be_visible()
    page.locator('[data-action="profile"]').click()
    expect(page.locator('.profile-stats-screen[data-ui11-surface="profile"]')).to_be_visible()


def open_leaderboards(page):
    expect(page.locator(".title-screen")).to_be_visible()
    page.locator('[data-action="open-leaderboards"]').click()
    expect(page.locator('.leaderboards-screen[data-ui11-surface="leaderboards"]')).to_be_visible()


def open_settings(page):
    expect(page.locator(".title-screen")).to_be_visible()
    page.locator('[data-action="settings"]').click()
    expect(page.locator('.settings-screen[data-ui11-surface="settings"]')).to_be_visible()


def inspect_profile(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base)
    page.goto(base)
    open_profile(page)

    values = page.evaluate("""() => {
      const screen = document.querySelector('.profile-stats-screen');
      const shell = document.querySelector('.profile-stats-shell');
      const tabs = document.querySelector('.profile-tabs');
      const panel = document.querySelector('.profile-tab-panel');
      const back = document.querySelector('[data-stats-action="back"]');
      const metric = document.querySelector('.profile-metric');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        shellBorder: getComputedStyle(shell).borderTopWidth,
        shellBackground: getComputedStyle(shell).backgroundColor,
        tabRole: tabs.getAttribute('role'),
        tabLabel: tabs.getAttribute('aria-label'),
        panelRole: panel.getAttribute('role'),
        panelLabelledBy: panel.getAttribute('aria-labelledby'),
        activeTabs: tabs.querySelectorAll('[role="tab"][aria-selected="true"]').length,
        tabCount: tabs.querySelectorAll('[role="tab"]').length,
        backHeight: back.getBoundingClientRect().height,
        metricBackground: metric ? getComputedStyle(metric).backgroundColor : null,
        surface: screen.dataset.ui11Surface,
      };
    }""")
    assert values["overflow"] <= 1, values
    assert values["shellBorder"] == "0px", values
    assert values["tabRole"] == "tablist", values
    assert values["tabLabel"] == "Profile and statistics sections", values
    assert values["panelRole"] == "tabpanel", values
    assert values["panelLabelledBy"], values
    assert values["activeTabs"] == 1, values
    assert values["tabCount"] == 7, values
    assert values["backHeight"] >= 44, values

    # The existing tab controller remains authoritative while UI11 supplies semantics.
    page.locator('[data-stats-tab="5"]').click()
    expect(page.locator('[data-stats-tab="5"]')).to_have_class("active")
    expect(page.locator('[data-stats-tab="5"]')).to_have_attribute("aria-selected", "true")
    expect(page.locator(".recent-filters")).to_have_attribute("aria-label", "Recent session filters")
    assert page.locator('.recent-filters button[aria-pressed="true"]').count() == 1

    page.locator('[data-stats-tab="6"]').click()
    expect(page.locator('[data-stats-tab="6"]')).to_have_attribute("aria-selected", "true")
    edit = page.locator('[data-stats-action="edit-name"]')
    if edit.count():
        edit.click()
        expect(page.locator("#profile-name-input")).to_be_visible()
        page.locator('[data-stats-action="cancel-name"]').click()

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-ui11-profile.png"), full_page=True)

    evidence.append({"browser": browser_name, "case": "profile", **values})
    assert_no_errors(errors, f"{browser_name} profile")
    context.close()


def inspect_leaderboards(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base)
    page.goto(base)
    open_leaderboards(page)

    values = page.evaluate("""() => {
      const panel = document.querySelector('.leaderboards-panel');
      const tabs = document.querySelector('.leaderboard-tabs');
      const back = document.querySelector('.leaderboards-panel > .screen-back-button');
      const content = document.querySelector('.leaderboard-content');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panelBorder: getComputedStyle(panel).borderTopWidth,
        panelBackground: getComputedStyle(panel).backgroundColor,
        selectedTabs: tabs.querySelectorAll('[role="tab"][aria-selected="true"]').length,
        tabCount: tabs.querySelectorAll('[role="tab"]').length,
        backHeight: back.getBoundingClientRect().height,
        live: content.getAttribute('aria-live'),
      };
    }""")
    assert values["overflow"] <= 1, values
    assert values["panelBorder"] == "0px", values
    assert values["selectedTabs"] == 1, values
    assert values["tabCount"] == 4, values
    assert values["backHeight"] >= 44, values
    assert values["live"] == "polite", values

    # Existing category routing remains live and the selected state remains semantic.
    page.locator('[data-action="leaderboard-select-typing"]').click()
    expect(page.locator('[data-action="leaderboard-select-typing"]')).to_have_attribute("aria-selected", "true")
    expect(page.locator(".leaderboard-duration-tabs")).to_be_visible()
    page.locator('[data-action="leaderboard-select-arcade-rush"]').click()
    expect(page.locator('[data-action="leaderboard-select-arcade-rush"]')).to_have_attribute("aria-selected", "true")

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-ui11-leaderboards.png"), full_page=True)

    evidence.append({"browser": browser_name, "case": "leaderboards", **values})
    assert_no_errors(errors, f"{browser_name} leaderboards")
    context.close()


def inspect_settings(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base)
    page.goto(base)
    open_settings(page)

    switches = page.locator('.settings-screen button.toggle[role="switch"]')
    expect(switches).to_have_count(3)
    values = page.evaluate("""() => {
      const panel = document.querySelector('.settings-panel');
      const screen = document.querySelector('.settings-screen');
      const switches = [...document.querySelectorAll('button.toggle[role="switch"]')];
      const back = document.querySelector('.settings-panel > .screen-back-button');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panelBorder: getComputedStyle(panel).borderTopWidth,
        panelBackground: getComputedStyle(panel).backgroundColor,
        switchCount: switches.length,
        switchStateMatches: switches.every(el => el.getAttribute('aria-checked') === String(el.classList.contains('on'))),
        labelledSwitches: switches.filter(el => el.getAttribute('aria-label')).length,
        backHeight: back.getBoundingClientRect().height,
        accountSection: Boolean(document.querySelector('[data-ui11-section="account"]')),
        tutorialSection: Boolean(document.querySelector('[data-ui11-section="tutorials"]')),
        surface: screen.dataset.ui11Surface,
      };
    }""")
    assert values["overflow"] <= 1, values
    assert values["panelBorder"] == "0px", values
    assert values["switchCount"] == 3, values
    assert values["switchStateMatches"], values
    assert values["labelledSwitches"] == 3, values
    assert values["backHeight"] >= 44, values
    assert values["accountSection"], values
    assert values["tutorialSection"], values

    # Clicking a real existing setting still changes the underlying setting and rerenders the switch state.
    strict = page.locator('[data-setting="strictMode"]')
    before = strict.get_attribute("aria-checked")
    strict.click()
    expect(page.locator('[data-setting="strictMode"]')).not_to_have_attribute("aria-checked", before)

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-ui11-settings.png"), full_page=True)

    evidence.append({"browser": browser_name, "case": "settings", **values, "strictBefore": before})
    assert_no_errors(errors, f"{browser_name} settings")
    context.close()


def inspect_constrained_layouts(browser, base, browser_name, evidence):
    for width, height, label in ((390, 844, "mobile"), (390, 360, "short-mobile")):
        for surface, action, selector, final_selector in (
            ("profile", "profile", '.profile-stats-screen[data-ui11-surface="profile"]', '[data-stats-tab="6"]'),
            ("leaderboards", "open-leaderboards", '.leaderboards-screen[data-ui11-surface="leaderboards"]', '.leaderboard-actions [data-action="leaderboard-main-menu"]'),
            ("settings", "settings", '.settings-screen[data-ui11-surface="settings"]', '.settings-panel > .menu-list [data-action="back"]'),
        ):
            context, page, errors = new_context(browser, base, width, height)
            page.goto(base)
            page.locator(f'[data-action="{action}"]').click()
            expect(page.locator(selector)).to_be_visible()

            geometry = page.evaluate("""() => ({
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              viewport: innerWidth,
              bodyWidth: document.documentElement.scrollWidth,
            })""")
            assert geometry["overflow"] <= 1, (browser_name, label, surface, geometry)

            target = page.locator(final_selector).last
            target.scroll_into_view_if_needed()
            page.wait_for_timeout(30)
            box = target.bounding_box()
            assert box is not None, (browser_name, label, surface, "missing target")
            assert box["x"] >= -1 and box["x"] + box["width"] <= width + 1, (browser_name, label, surface, box)
            assert box["height"] >= 40, (browser_name, label, surface, box)

            if browser_name == "chromium" and label == "short-mobile":
                page.screenshot(path=str(ARTIFACTS / f"chromium-ui11-{surface}-short.png"), full_page=True)

            evidence.append({
                "browser": browser_name,
                "case": f"{surface}-{label}",
                "width": width,
                "height": height,
                **geometry,
                "target": box,
            })
            assert_no_errors(errors, f"{browser_name} {surface} {label}")
            context.close()


def inspect_reduced_motion(browser, base, browser_name, evidence):
    context, page, errors = new_context(browser, base, reduced_motion="reduce")
    page.goto(base)
    open_settings(page)
    toggle = page.locator('[data-setting="strictMode"]')
    duration = toggle.evaluate("el => parseFloat(getComputedStyle(el).transitionDuration) || 0")
    transform = toggle.evaluate("el => getComputedStyle(el).transform")
    assert duration <= 0.00001, duration
    assert transform == "none", transform
    evidence.append({"browser": browser_name, "case": "reduced-motion", "duration": duration, "transform": transform})
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
                inspect_profile(browser, base, browser_name, evidence)
                inspect_leaderboards(browser, base, browser_name, evidence)
                inspect_settings(browser, base, browser_name, evidence)
                inspect_constrained_layouts(browser, base, browser_name, evidence)
                inspect_reduced_motion(browser, base, browser_name, evidence)
                browser.close()
        result["success"] = True
        print(f"PASS: {len(evidence)} UI11 Profile/Leaderboards/Settings browser checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui11-profile-leaderboards-settings.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
