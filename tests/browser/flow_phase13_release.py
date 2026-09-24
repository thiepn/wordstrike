"""Flow V3 instant-play public release certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase13"

ONBOARDING_SEED = """(() => {
  for (const [id, version] of Object.entries({general:3,campaign:2,typing:1,endless:1,boss:1,leaderboards:1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def context_for(browser, base, width=1440, height=900):
    context = browser.new_context(viewport={"width": width, "height": height})
    context.add_init_script(ONBOARDING_SEED)
    local_only(context, base)
    return context


def open_modes(page, base):
    page.goto(base, wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=10000)


def launch_public_flow(page):
    flow = page.locator('button[data-mode-id="flow"]')
    expect(flow).to_be_visible(timeout=10000)
    flow.click()

    # V3 has no public setup/Ready gate: clicking the mode is the start action.
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    assert page.locator('[data-flow-view="ready"]').count() == 0
    assert page.locator('[data-flow-ui="setup"]').count() == 0
    assert page.locator('[data-flow-game-length]').count() == 0
    assert page.locator('[data-flow-choice-group]').count() == 0

    assert "flowRelease=1" in page.url, page.url
    assert "dev=1" not in page.url, page.url
    assert page.evaluate("window.wordstrikeFlowReleasePhase13.runtimeReady()") is True
    assert page.evaluate("window.wordstrikeFlowReleasePhase13.isReleaseRoute()") is True

    plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    assert plan["gameplayVersion"] == 3, plan
    assert plan["structure"] == "continuous-stream", plan
    assert plan["sessionLength"] == "flow", plan
    assert plan["theme"] == "mixed", plan
    assert plan["documentCount"] == 10, plan
    assert plan["paragraphCount"] >= 50, plan
    assert plan["wordCount"] >= 4500, plan
    assert plan["stream"] is True, plan

    labels = page.locator(".flow-game-v2-hud > div > span").all_text_contents()
    assert labels == ["Score", "WPM", "Accuracy", "Words"], labels
    expect(page.locator('[data-flow-theme-select]')).to_be_visible()
    expect(page.locator(".flow-v3-tab-hint")).to_contain_text("TAB")
    return plan


def type_prefix(page, plan, characters=320):
    text = plan["fullText"][:characters]
    page.keyboard.type(text)
    snapshot = page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()")
    assert snapshot["currentIndex"] == len(text), snapshot
    assert snapshot["gameplay"]["accuracyPercent"] == 100, snapshot
    return text


def certify_public_journey(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    open_modes(page, base)
    active = page.locator("button.mode-option.available").evaluate_all(
        "els => els.map(el => el.dataset.modeId)"
    )
    assert active == ["campaign", "speed-test", "endless", "flow", "practice"], active
    assert page.locator('[data-mode-id="arcade-rush"]').count() == 0

    first_plan = launch_public_flow(page)
    first_session = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    first_seed = first_plan["seed"]
    typed = type_prefix(page, first_plan)

    # Tab is the central Flow loop: record the attempt, reroll, continue immediately.
    page.keyboard.press("Tab")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    second_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    second_session = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    previous_result = page.evaluate("window.wordstrikeFlowPhase1.getPublicResult()")
    assert second_session != first_session, (first_session, second_session)
    assert second_plan["seed"] != first_seed, (first_seed, second_plan["seed"])
    assert second_plan["id"] != first_plan["id"], (first_plan["id"], second_plan["id"])
    assert previous_result["variantId"] == "flow-v3", previous_result
    assert previous_result["rulesVersion"] == 3, previous_result
    assert previous_result["endedReason"] == "reset", previous_result
    assert previous_result["correctCharacters"] == len(typed), previous_result
    assert previous_result["wordsCompleted"] == len(typed) // 5, previous_result
    assert previous_result["score"] > 0, previous_result
    assert page.locator('[data-flow-view="complete"]').count() == 0

    # Phase 7A: the next run is already live while the previous run summary is visible.
    session_state = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionState()")
    micro = page.evaluate("window.wordstrikeFlowPhase1.getPublicMicroResult()")
    assert session_state["runCount"] == 1, session_state
    assert session_state["totalWords"] == previous_result["wordsCompleted"], session_state
    assert session_state["totalScore"] == previous_result["score"], session_state
    assert session_state["bestRun"]["score"] == previous_result["score"], session_state
    assert micro["title"] == "NEW SESSION BEST", micro
    assert micro["score"] == previous_result["score"], micro
    expect(page.locator('[data-flow-micro-result]')).to_be_visible()
    expect(page.locator('[data-flow-session-run]')).to_have_text("2")
    expect(page.locator('[data-flow-session-words]')).to_have_text(str(previous_result["wordsCompleted"]))

    live_prefix = second_plan["fullText"][:20]
    page.keyboard.type(live_prefix)
    live_snapshot = page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()")
    assert live_snapshot["currentIndex"] == len(live_prefix), live_snapshot

    # Optional text-kind filtering is secondary and never returns to a setup screen.
    page.locator('[data-flow-theme-select]').select_option("science")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    themed_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    assert themed_plan["theme"] == "science", themed_plan
    assert all(doc["theme"] == "science" for doc in themed_plan["documents"]), themed_plan
    assert "flowTheme=science" in page.url, page.url
    assert page.locator('[data-flow-view="ready"]').count() == 0

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-instant-flow.png"), full_page=True)

    page.keyboard.press("Escape")
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=10000)
    assert "flowRelease=1" not in page.url, page.url
    assert "flowTheme=" not in page.url, page.url
    assert page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionState()") is None
    assert not errors, errors

    evidence.append({
        "browser": browser_name,
        "case": "instant Flow launch, Tab reroll, optional theme filter, clean exit",
        "firstSeed": first_seed,
        "secondSeed": second_plan["seed"],
        "typedCharacters": len(typed),
        "score": previous_result["score"],
        "theme": themed_plan["theme"],
    })
    context.close()


def certify_fresh_default(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    open_modes(page, base)
    plan = launch_public_flow(page)
    assert plan["theme"] == "mixed", plan
    assert page.locator('[data-flow-theme-select]').input_value() == "mixed"
    assert page.locator('[data-flow-view="ready"]').count() == 0
    assert page.locator('[data-flow-action="start"]').count() == 0

    first_document = plan["documents"][0]["documentId"]
    first_session = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    page.keyboard.press("Tab")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    rerolled = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    rerolled_session = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    assert rerolled_session != first_session, (first_session, rerolled_session)
    assert rerolled["documents"][0]["documentId"] != first_document, (
        first_document,
        rerolled["documents"][0]["documentId"],
    )
    assert page.locator('[data-flow-view="ready"]').count() == 0
    assert page.locator('[data-flow-view="complete"]').count() == 0

    evidence.append({
        "browser": browser_name,
        "case": "fresh Flow click enters immediately and empty Tab rerolls source",
        "documents": plan["documentCount"],
        "paragraphs": plan["paragraphCount"],
        "wordsAvailable": plan["wordCount"],
        "firstDocument": first_document,
        "nextDocument": rerolled["documents"][0]["documentId"],
    })
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != "chromium":
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_modes(page, base)
    plan = launch_public_flow(page)

    geometry = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewport: document.documentElement.clientWidth,
      screen: document.querySelector('.flow-phase1-screen').getBoundingClientRect().width,
      hud: document.querySelector('.flow-game-v2-hud').getBoundingClientRect().width,
      passage: document.querySelector('[data-flow-longform="true"]').getBoundingClientRect().width,
      theme: document.querySelector('[data-flow-theme-select]').getBoundingClientRect().width,
    })""")
    assert geometry["overflow"] <= 1, geometry
    assert geometry["screen"] <= geometry["viewport"] + 1, geometry
    assert geometry["hud"] <= geometry["viewport"] + 1, geometry
    assert geometry["passage"] <= geometry["viewport"] + 1, geometry
    assert geometry["theme"] <= geometry["viewport"], geometry

    page.keyboard.type(plan["fullText"][:80])
    page.keyboard.press("Tab")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    page.screenshot(path=str(ARTIFACTS / "chromium-instant-flow-mobile.png"), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px instant Flow and Tab reroll", **geometry})
    context.close()


def bounded_service_worker_ready(page, timeout_ms=30000):
    return page.evaluate("""timeoutMs => Promise.race([
      navigator.serviceWorker.ready.then(() => ({ ready: true })),
      new Promise(resolve => setTimeout(
        () => resolve({ ready: false, reason: 'service-worker-ready-timeout' }),
        timeoutMs,
      )),
    ])""", timeout_ms)


def bounded_offline_ready(page, timeout_ms=30000):
    return page.evaluate("""timeoutMs => Promise.race([
      window.wordstrikeFlowReleasePhase13.offlineReady(),
      new Promise(resolve => setTimeout(
        () => resolve({ supported: true, cached: 0, timeout: true }),
        timeoutMs,
      )),
    ])""", timeout_ms)


def certify_offline(browser, browser_name, base, evidence):
    if browser_name != "chromium":
        return
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(base, wait_until="load")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)

    sw_ready = bounded_service_worker_ready(page)
    assert sw_ready["ready"] is True, sw_ready
    cache_result = bounded_offline_ready(page)
    assert cache_result.get("timeout") is not True, cache_result
    assert cache_result["supported"] is True, cache_result
    assert cache_result["cached"] == page.evaluate(
        "window.wordstrikeFlowReleasePhase13.offlineAssetCount"
    ), cache_result
    assert cache_result["cached"] >= 70, cache_result

    cached = page.evaluate("""async () => {
      const targets = [
        './js/flow/flowRuntimeLoader.js?v=20260924b',
        './js/flow/flowPhase1.js?v=20260924a',
        './js/flow/flowCadence.js?v=20260924a',
        './js/flow/flowStreamPlanV3.js?v=20260923b',
        './js/flow/flowScoreV3.js?v=20260923a',
        './js/flow/flowRecordsV3.js?v=20260923a',
        './js/leaderboardService.js',
        './js/leaderboardSubmissionService.js',
        './js/submissionOutbox.js',
        './js/supabaseClient.js',
        './styles/screens/flow-game-mode-v2.css?v=20260923d',
      ];
      const results = [];
      for (const target of targets) {
        results.push(Boolean(await caches.match(new URL(target, location.href).href)));
      }
      return results;
    }""")
    assert all(cached), cached

    if not page.evaluate("Boolean(navigator.serviceWorker.controller)"):
        page.reload(wait_until="load")
        expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    assert page.evaluate("Boolean(navigator.serviceWorker.controller)") is True

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator(".mode-select-screen")).to_be_visible()
    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    offline_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    assert offline_plan["gameplayVersion"] == 3, offline_plan
    assert offline_plan["structure"] == "continuous-stream", offline_plan

    evidence.append({
        "browser": browser_name,
        "case": "offline instant Flow relaunch",
        "cachedAssets": cache_result["cached"],
        "cacheName": cache_result["cacheName"],
    })
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://localhost:{server.server_port}/"
    evidence = []
    try:
        with sync_playwright() as p:
            for browser_type in (p.chromium, p.firefox):
                browser = browser_type.launch()
                name = browser_type.name
                certify_public_journey(browser, name, base, evidence)
                certify_fresh_default(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                certify_offline(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / "evidence.json").write_text(
            json.dumps(evidence, indent=2),
            encoding="utf-8",
        )
        print(f"PASS: {len(evidence)} Flow V3 instant-play release scenarios", flush=True)
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
