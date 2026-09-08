"""UI1 design-system browser certification.

Exercises computed typography/effect contracts and the requested responsive matrix
without entering or modifying Practice Lab.
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
ARTIFACTS = ROOT / "browser-artifacts" / "ui1-design-system"

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


def page_errors(page):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return errors


def assert_no_errors(errors, label):
    assert not errors, f"{label}: page errors: {errors}"


def duration_seconds(value):
    source = str(value).strip().lower()
    if source.endswith("ms"):
        return float(source[:-2]) / 1000
    if source.endswith("s"):
        return float(source[:-1])
    raise AssertionError(f"unsupported CSS duration: {value}")


def inspect_foundation(browser, base, browser_name, evidence):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(ONBOARDING_SEED)
    local_only(context, base)
    page = context.new_page()
    errors = page_errors(page)
    page.goto(base)
    expect(page.locator(".menu-screen")).to_be_visible()

    computed = page.evaluate("""() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const screen = document.querySelector('.menu-screen');
      const wordProbe = document.createElement('span');
      wordProbe.className = 'speed-test-word';
      wordProbe.textContent = 'precision';
      document.body.append(wordProbe);
      const gameFont = getComputedStyle(wordProbe).fontFamily;
      wordProbe.remove();
      return {
        bodyFont: body.fontFamily,
        gameFont,
        scanlineDisplay: getComputedStyle(screen, '::after').display,
        accent: root.getPropertyValue('--color-accent').trim(),
        special: root.getPropertyValue('--color-special').trim(),
        surface1: root.getPropertyValue('--color-surface-1').trim(),
        motionFast: root.getPropertyValue('--motion-fast').trim(),
        radius: root.getPropertyValue('--radius-md').trim(),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }""")

    assert "Inter" in computed["bodyFont"], computed
    assert "JetBrains Mono" in computed["gameFont"], computed
    assert computed["scanlineDisplay"] == "none", computed
    assert computed["accent"].lower() == "#00fff2", computed
    assert computed["special"].lower() == "#ff3cac", computed
    assert computed["motionFast"] == "140ms", computed
    assert computed["radius"] == "6px", computed
    assert computed["horizontalOverflow"] <= 1, computed

    # Production-only screenshot: fixture primitives are injected only after visual evidence.
    page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui1-desktop.png"), full_page=True)

    page.evaluate("""() => {
      const host = document.createElement('div');
      host.id = 'ui1-browser-fixture';
      host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9999;display:grid;gap:8px';
      host.innerHTML = `
        <button class="ui-button ui-button--primary">Start</button>
        <button class="ui-icon-button" aria-label="Pause"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M8 6v12M16 6v12"/></svg></button>
        <div class="ui-metric ui-metric--accent"><span class="ui-metric-label">WPM</span><strong class="ui-metric-value">87</strong></div>
        <div class="ui-segmented" role="tablist"><button aria-selected="true">15</button><button aria-selected="false">60</button></div>
        <div class="ui-tabs" role="tablist"><button aria-selected="true">Overview</button><button aria-selected="false">Campaign</button></div>`;
      document.body.append(host);
    }""")

    fixture = page.evaluate("""() => {
      const button = document.querySelector('#ui1-browser-fixture .ui-button');
      const iconButton = document.querySelector('#ui1-browser-fixture .ui-icon-button');
      const metric = document.querySelector('#ui1-browser-fixture .ui-metric-value');
      const segment = document.querySelector('#ui1-browser-fixture .ui-segmented button');
      const tab = document.querySelector('#ui1-browser-fixture .ui-tabs button');
      return {
        primaryMinHeight: parseFloat(getComputedStyle(button).minHeight),
        iconWidth: parseFloat(getComputedStyle(iconButton).width),
        metricFont: getComputedStyle(metric).fontFamily,
        segmentColor: getComputedStyle(segment).color,
        tabColor: getComputedStyle(tab).color,
      };
    }""")
    assert fixture["primaryMinHeight"] >= 44, fixture
    assert fixture["iconWidth"] >= 44, fixture
    assert "JetBrains Mono" in fixture["metricFont"], fixture

    # UI1 owns the reusable secondary-button interaction primitive, not any
    # later phase's screen-specific button markup.
    page.evaluate("""() => {
      const button = document.createElement('button');
      button.id = 'ui1-secondary-hover-probe';
      button.className = 'arcade-button';
      button.textContent = 'Probe';
      document.body.append(button);
    }""")
    ordinary = page.locator("#ui1-secondary-hover-probe")
    ordinary.hover()
    page.wait_for_timeout(180)
    transform = ordinary.evaluate("""el => {
      const value = getComputedStyle(el).transform;
      if (value === 'none') return {x:0,y:0,value};
      const matrix = new DOMMatrixReadOnly(value);
      return {x:matrix.m41,y:matrix.m42,value};
    }""")
    assert abs(transform["x"]) < 0.1, transform
    assert -1.1 <= transform["y"] <= 0.1, transform

    evidence.append({"browser": browser_name, "case": "foundation", **computed, **fixture, "hoverTransform": transform})
    assert_no_errors(errors, f"{browser_name} foundation")
    context.close()


def inspect_responsive_matrix(browser, base, browser_name, evidence):
    for width, height, label in VIEWPORTS:
        context = browser.new_context(viewport={"width": width, "height": height})
        context.add_init_script(ONBOARDING_SEED)
        local_only(context, base)
        page = context.new_page()
        errors = page_errors(page)
        page.goto(base)
        expect(page.locator(".menu-screen")).to_be_visible()
        menu_overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert menu_overflow <= 1, (browser_name, label, menu_overflow)

        page.locator('[data-action="modes"]').click()
        expect(page.locator(".mode-screen")).to_be_visible()
        mode_overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert mode_overflow <= 1, (browser_name, label, mode_overflow)

        geometry = page.locator(".mode-screen > :first-child").evaluate("""el => {
          const r = el.getBoundingClientRect();
          return {left:r.left,right:r.right,width:r.width,viewport:innerWidth};
        }""")
        assert geometry["left"] >= -1, (browser_name, label, geometry)
        assert geometry["right"] <= geometry["viewport"] + 1, (browser_name, label, geometry)

        if browser_name == "chromium" and label in {"mobile", "mobile-keyboard-height"}:
            page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui1-{label}.png"), full_page=True)

        # UI1 certifies that a migrated screen may own vertical scrolling without
        # breaking the global responsive foundation. Exact final-action reachability
        # belongs to the screen phase that owns that composition (UI3 for Mode Select).
        scroll_state = page.locator(".mode-screen").evaluate("""el => ({
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          scrollTop: el.scrollTop,
          overflowY: getComputedStyle(el).overflowY,
          documentScrollTop: document.scrollingElement?.scrollTop || 0,
          documentScrollHeight: document.scrollingElement?.scrollHeight || 0,
          documentClientHeight: document.scrollingElement?.clientHeight || 0
        })""")
        if scroll_state["scrollHeight"] > scroll_state["clientHeight"] + 1:
            assert scroll_state["overflowY"] in {"auto", "scroll"}, (browser_name, label, scroll_state)

        evidence.append({
            "browser": browser_name,
            "case": f"responsive-{label}",
            "width": width,
            "height": height,
            "menuOverflow": menu_overflow,
            "modeOverflow": mode_overflow,
            "modeScroll": scroll_state,
        })
        assert_no_errors(errors, f"{browser_name} {label}")
        context.close()


def inspect_reduced_motion(browser, base, browser_name, evidence):
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        reduced_motion="reduce",
    )
    context.add_init_script(ONBOARDING_SEED)
    local_only(context, base)
    page = context.new_page()
    errors = page_errors(page)
    page.goto(base)
    page.evaluate("""() => {
      const button = document.createElement('button');
      button.id = 'reduced-motion-probe';
      button.className = 'ui-button';
      button.textContent = 'Probe';
      document.body.append(button);
    }""")
    probe = page.locator("#reduced-motion-probe")
    transition = probe.evaluate("el => getComputedStyle(el).transitionDuration")
    probe.hover()
    page.wait_for_timeout(40)
    transform = probe.evaluate("el => getComputedStyle(el).transform")
    assert duration_seconds(transition) <= 0.00001, transition
    assert transform == "none", transform
    evidence.append({"browser": browser_name, "case": "reduced-motion", "transition": transition, "transform": transform})
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
                inspect_responsive_matrix(browser, base, browser_name, evidence)
                inspect_reduced_motion(browser, base, browser_name, evidence)
                browser.close()
        result["success"] = True
        print(f"PASS: {len(evidence)} UI1 browser checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui1-design-system.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
