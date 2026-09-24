"""Pass 7 release-wide adversarial browser stress.

Exercises production surfaces under corrupted storage, repeated navigation, repeated
Flow mount/unmount, native browser Back, duplicate Flow launch pressure, and
offline restart. Runs Chromium only because cross-browser surface coverage is
already provided by the existing release workflows.
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
ARTIFACTS = ROOT / "browser-artifacts" / "release-adversarial-pass7"

ONBOARDING_SEED = """() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:2, typing:1, endless:1, boss:1, leaderboards:1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
}"""

CORRUPT_STORAGE = """() => {
  localStorage.setItem('wordstrike_save', '{not-json');
  localStorage.setItem('wordstrike_mode_data_v2', '{"schemaVersion":2,"recentSessions":"bad"}');
  localStorage.setItem('wordstrike.pending-result-submission.v1', '{bad');
  localStorage.setItem('wordstrike.submission-outbox.v1', '{"not":"an-array"}');
  localStorage.setItem('wordstrike_flow_records_v3', '{bad');
  localStorage.setItem('wordstrike_flow_progression_v4', '[]');
  localStorage.setItem('wordstrike:flow-corpus-v2-history', '{"recentRuns":"bad"}');
  for (const [id, version] of Object.entries({
    general:3, campaign:2, typing:1, endless:1, boss:1, leaderboards:1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
}"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def make_context(browser, base, init_script=ONBOARDING_SEED):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(init_script)
    local_only(context, base)
    return context


def page_with_errors(context):
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return page, errors


def assert_single_surface(page):
    count = page.locator("#app > .screen").count()
    assert count == 1, f"expected one root screen, got {count}"


def corrupt_storage_bootstrap(browser, base, evidence):
    context = make_context(browser, base, CORRUPT_STORAGE)
    page, errors = page_with_errors(context)
    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    assert_single_surface(page)

    # Normal local settings remain usable even when unrelated persisted state
    # starts malformed. A successful write should replace the broken save.
    page.locator('[data-action="settings"]').click()
    expect(page.locator(".settings-screen")).to_be_visible()
    strict = page.locator('[data-setting="strictMode"]')
    strict.click()
    page.locator('[data-action="back"]').last.click()
    expect(page.locator(".title-screen")).to_be_visible()
    save_shape = page.evaluate("""() => {
      try {
        const value = JSON.parse(localStorage.getItem('wordstrike_save'));
        return {valid: Boolean(value && value.settings), strict: value?.settings?.strictMode};
      } catch { return {valid:false}; }
    }""")
    assert save_shape["valid"] is True, save_shape

    # Opening Profile forces mode/profile storage through its migration/sanitize
    # path; malformed mode data must not crash the surface.
    page.locator('[data-action="profile"]').click()
    expect(page.locator(".profile-stats-screen")).to_be_visible()
    assert_single_surface(page)
    page.locator('[data-stats-action="back"]').click()
    expect(page.locator(".title-screen")).to_be_visible()

    assert not errors, errors
    evidence.append({
        "case": "corrupt persisted state boots safely and normal writes recover",
        "save": save_shape,
    })
    context.close()


def rapid_surface_churn(browser, base, evidence):
    context = make_context(browser, base)
    page, errors = page_with_errors(context)
    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)

    for _ in range(20):
        page.locator('[data-action="modes"]').click()
        expect(page.locator(".mode-select-screen")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.locator(".title-screen")).to_be_visible()

        page.locator('[data-action="settings"]').click()
        expect(page.locator(".settings-screen")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.locator(".title-screen")).to_be_visible()

        page.locator('[data-action="profile"]').click()
        expect(page.locator(".profile-stats-screen")).to_be_visible()
        page.locator('[data-stats-action="back"]').click()
        expect(page.locator(".title-screen")).to_be_visible()

        page.locator('[data-action="open-leaderboards"]').click()
        expect(page.locator(".leaderboards-screen")).to_be_visible()
        page.locator('[data-action="leaderboard-main-menu"]').first.click()
        expect(page.locator(".title-screen")).to_be_visible()

        assert_single_surface(page)

    assert page.locator(".pause-overlay").count() == 0
    assert not errors, errors
    evidence.append({"case": "80 rapid top-level surface transitions", "cycles": 20})
    context.close()


def flow_reentry_and_back_stress(browser, base, evidence):
    context = make_context(browser, base)
    page, errors = page_with_errors(context)
    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-select-screen")).to_be_visible()
    baseline_nodes = page.locator("#app *").count()

    sessions = []
    for cycle in range(12):
        flow = page.locator('button[data-mode-id="flow"]')
        expect(flow).to_be_visible()

        if cycle == 0:
            # Multiple same-task clicks must coalesce into one public launch.
            flow.evaluate("(el) => { el.click(); el.click(); el.click(); }")
        else:
            flow.click()

        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
        assert page.locator(".flow-phase1-screen").count() == 1
        assert page.evaluate("window.wordstrikeFlowPhase1.isActive()") is True
        session_id = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
        assert session_id and session_id not in sessions, (cycle, session_id, sessions)
        sessions.append(session_id)

        if cycle % 3 == 0:
            plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
            page.keyboard.type(plan["fullText"][:24])
            assert page.evaluate("window.wordstrikeFlowPhase1.getSnapshot().currentIndex") == 24

        if cycle % 2 == 0:
            page.evaluate("history.back()")
        else:
            page.keyboard.press("Escape")

        expect(page.locator(".mode-select-screen")).to_be_visible(timeout=10000)
        assert page.evaluate("window.wordstrikeFlowPhase1.isActive()") is False
        assert page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()") is None
        assert "flowRelease=1" not in page.url, page.url
        assert page.locator(".flow-phase1-screen").count() == 0
        assert_single_surface(page)

    final_nodes = page.locator("#app *").count()
    assert final_nodes <= baseline_nodes + 40, (baseline_nodes, final_nodes)
    assert not errors, errors
    evidence.append({
        "case": "Flow duplicate launch plus 12 mount/unmount cycles with native Back",
        "sessions": len(sessions),
        "baselineNodes": baseline_nodes,
        "finalNodes": final_nodes,
    })
    context.close()


def offline_restart(browser, base, evidence):
    context = make_context(browser, base)
    page, errors = page_with_errors(context)
    page.goto(base, wait_until="load")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)

    ready = page.evaluate("""() => Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 30000))
    ])""")
    assert ready is True

    # Install waits for the complete release shell. Reload once to ensure the
    # newly active worker controls this document before disconnecting network.
    if not page.evaluate("Boolean(navigator.serviceWorker.controller)"):
        page.reload(wait_until="load")
        expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    assert page.evaluate("Boolean(navigator.serviceWorker.controller)") is True

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-select-screen")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator(".title-screen")).to_be_visible()
    assert not errors, errors
    evidence.append({"case": "service-worker controlled offline restart"})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://localhost:{server.server_port}/"
    evidence = []
    result = {"sha": os.getenv("GITHUB_SHA"), "success": False, "checks": evidence}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            corrupt_storage_bootstrap(browser, base, evidence)
            rapid_surface_churn(browser, base, evidence)
            flow_reentry_and_back_stress(browser, base, evidence)
            offline_restart(browser, base, evidence)
            browser.close()
        result["success"] = True
        print(f"PASS: {len(evidence)} Pass 7 adversarial release scenarios", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "release-adversarial-pass7.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
