"""Flow V3 instant-play public release certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import re
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
    assert plan["sessionPreset"] == "standard", plan
    assert plan["targetMinutes"] == 3, plan
    assert plan["targetDurationMs"] == 180000, plan
    assert plan["theme"] == "mixed", plan
    assert plan["documentCount"] == 10, plan
    assert plan["paragraphCount"] >= 50, plan
    assert plan["wordCount"] >= 4500, plan
    assert plan["stream"] is True, plan

    labels = page.locator(".flow-game-v2-hud > div > span").all_text_contents()
    assert labels == ["Score", "WPM", "Accuracy", "Words"], labels
    expect(page.locator('[data-flow-theme-select]')).to_be_visible()
    expect(page.locator('[data-flow-session-preset]')).to_be_visible()
    assert page.locator('[data-flow-session-preset]').input_value() == "standard"
    expect(page.locator('[data-flow-session-remaining]')).to_have_text("3:00")
    expect(page.locator(".flow-v3-tab-hint")).to_contain_text("NEXT TEXT")
    expect(page.locator('[data-flow-identity]')).to_be_visible()
    expect(page.locator('[data-flow-source-title]')).to_have_text(plan["documents"][0]["title"])
    expect(page.locator('[data-flow-source-position]')).to_contain_text("Text 1 /")
    expect(page.locator('[data-flow-hud-v5="true"]')).to_be_visible()
    expect(page.locator('[data-flow-progression]')).to_be_visible()
    progression = page.evaluate("window.wordstrikeFlowPhase1.getPublicProgressionState()")
    assert progression["summary"]["totalMilestones"] == 25, progression
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
    scroll_before = page.evaluate("window.scrollY")
    typed = type_prefix(page, first_plan)
    page.wait_for_timeout(180)
    scroll_after = page.evaluate("window.scrollY")
    assert abs(scroll_after - scroll_before) <= 1, (scroll_before, scroll_after)

    typing_geometry = page.evaluate("""() => {
      const viewport = document.querySelector('.flow-passages');
      const passage = document.querySelector('[data-flow-passage]');
      const current = document.querySelector('.flow-char--current');
      const caret = document.querySelector('[data-flow-live-caret]');
      const vr = viewport.getBoundingClientRect();
      const cr = current.getBoundingClientRect();
      const caretRect = caret.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(passage).lineHeight);
      const progress = parseFloat(
        document.querySelector('[data-flow-session-progress-fill]').style.width
      ) || 0;
      return {
        viewportHeight: vr.height,
        lineHeight,
        caretDx: Math.abs(caretRect.left - cr.left),
        caretDy: Math.abs(caretRect.top - cr.top),
        timerProgress: progress,
      };
    }""")
    assert 2.8 <= typing_geometry["viewportHeight"] / typing_geometry["lineHeight"] <= 3.2, typing_geometry
    assert typing_geometry["caretDx"] <= 3, typing_geometry
    assert typing_geometry["caretDy"] <= 5, typing_geometry
    assert typing_geometry["timerProgress"] > 0, typing_geometry

    # Tab changes text inside the same timed run. It must not end, score, or reset the session.
    before_segment = page.evaluate("window.wordstrikeFlowPhase1.getActiveSegmentIndex()")
    page.keyboard.press("Tab")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    second_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    second_session = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    after_segment = page.evaluate("window.wordstrikeFlowPhase1.getActiveSegmentIndex()")
    previous_result = page.evaluate("window.wordstrikeFlowPhase1.getPublicResult()")
    assert second_session == first_session, (first_session, second_session)
    assert second_plan["seed"] == first_seed, (first_seed, second_plan["seed"])
    assert second_plan["id"] == first_plan["id"], (first_plan["id"], second_plan["id"])
    assert after_segment == before_segment + 1, (before_segment, after_segment)
    assert previous_result is None, previous_result
    assert page.locator('[data-flow-view="complete"]').count() == 0
    assert page.locator('[data-flow-micro-result]').count() == 0

    session_state = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionState()")
    progression = page.evaluate("window.wordstrikeFlowPhase1.getPublicProgressionState()")
    assert session_state["runCount"] == 0, session_state
    assert progression["progression"]["totals"]["runs"] == 0, progression
    expect(page.locator('[data-flow-session-run]')).to_have_text("1")
    expect(page.locator('[data-flow-progression-count]')).to_contain_text("/ 25")

    live_prefix = second_plan["segments"][after_segment]["text"][:20]
    live_start = second_plan["segments"][after_segment]["startIndex"]
    page.keyboard.type(live_prefix)
    live_snapshot = page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()")
    assert live_snapshot["currentIndex"] == live_start + len(live_prefix), live_snapshot
    assert live_snapshot["totalInsertedCharacters"] == len(typed) + len(live_prefix), live_snapshot

    # Optional text-kind filtering is secondary and never returns to a setup screen.
    page.locator('[data-flow-theme-select]').select_option("science")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    themed_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    assert themed_plan["theme"] == "science", themed_plan
    assert all(doc["theme"] == "science" for doc in themed_plan["documents"]), themed_plan
    assert "flowTheme=science" in page.url, page.url
    assert page.evaluate("localStorage.getItem('wordstrike_flow_theme_preference_v1')") == "science"
    expect(page.locator('[data-flow-source-title]')).to_have_text(themed_plan["documents"][0]["title"])
    expect(page.locator('[data-flow-source-meta]')).to_contain_text("Science")
    assert page.locator('[data-flow-view="ready"]').count() == 0

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-instant-flow.png"), full_page=True)

    page.keyboard.press("Escape")
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=10000)
    assert "flowRelease=1" not in page.url, page.url
    assert "flowTheme=" not in page.url, page.url
    assert page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionState()") is None

    # Phase 7C: the text mix is a preference, not a one-run query option.
    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    reentry_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    assert reentry_plan["theme"] == "science", reentry_plan
    assert page.locator('[data-flow-theme-select]').input_value() == "science"
    expect(page.locator('[data-flow-source-title]')).to_have_text(reentry_plan["documents"][0]["title"])

    # Browser/OS Back must be owned by Flow before the underlying MODE_SELECT
    # app state. Otherwise the DOM can leave Flow while its key handler remains active.
    page.evaluate("history.back()")
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=10000)
    assert page.evaluate("window.wordstrikeFlowPhase1.isActive()") is False
    assert page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()") is None
    assert "flowRelease=1" not in page.url, page.url
    assert not errors, errors

    evidence.append({
        "browser": browser_name,
        "case": "timed Flow launch, in-run Tab skip, optional theme filter, clean exit",
        "seed": first_seed,
        "typedCharactersBeforeSkip": len(typed),
        "segmentBefore": before_segment,
        "segmentAfter": after_segment,
        "timerProgress": typing_geometry["timerProgress"],
        "caretDx": typing_geometry["caretDx"],
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
    fresh_progression = page.evaluate("window.wordstrikeFlowPhase1.getPublicProgressionState()")
    assert fresh_progression["summary"]["earnedCount"] == 0, fresh_progression
    assert fresh_progression["summary"]["tier"]["name"] == "Open Current", fresh_progression
    expect(page.locator('[data-flow-progression-count]')).to_have_text("0 / 25")

    first_session = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    first_seed = plan["seed"]
    assert page.locator('[data-flow-session-preset]').input_value() == "standard"
    expect(page.locator('[data-flow-session-remaining]')).to_have_text("3:00")

    page.keyboard.press("Tab")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    skipped_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    skipped_session = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    assert skipped_session == first_session, (first_session, skipped_session)
    assert skipped_plan["seed"] == first_seed, (first_seed, skipped_plan["seed"])
    assert page.evaluate("window.wordstrikeFlowPhase1.getActiveSegmentIndex()") == 1
    assert page.evaluate("window.wordstrikeFlowPhase1.getPublicResult()") is None
    assert page.locator('[data-flow-view="ready"]').count() == 0
    assert page.locator('[data-flow-view="complete"]').count() == 0
    expect(page.locator('[data-flow-session-remaining]')).to_have_text("3:00")

    evidence.append({
        "browser": browser_name,
        "case": "fresh Flow defaults to three minutes and empty Tab skips in-run",
        "documents": plan["documentCount"],
        "paragraphs": plan["paragraphCount"],
        "wordsAvailable": plan["wordCount"],
        "sessionPreset": plan["sessionPreset"],
        "activeSegment": 1,
    })
    context.close()


def certify_theme_stream_integrity(browser, browser_name, base, evidence):
    if browser_name != "chromium":
        return

    context = context_for(browser, base)
    context.add_init_script(
        "localStorage.setItem('wordstrike_flow_theme_preference_v1', 'future-theme');"
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    open_modes(page, base)
    plan = launch_public_flow(page)

    assert plan["theme"] == "mixed", plan
    assert "flowTheme=mixed" in page.url, page.url
    assert "future-theme" not in page.url, page.url
    assert page.locator('[data-flow-theme-select]').input_value() == "mixed"

    next_document_segment = next(
        (segment for segment in plan["segments"] if segment["documentIndex"] == 1),
        None,
    )
    assert next_document_segment is not None, plan
    target_index = next_document_segment["startIndex"] + 1
    prefix = plan["fullText"][:target_index]
    page.locator("[data-flow-input]").evaluate(
        """(el, value) => el.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: value,
          bubbles: true,
          cancelable: true,
        }))""",
        prefix,
    )
    snapshot = page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()")
    assert snapshot["currentIndex"] == target_index, (snapshot["currentIndex"], target_index)
    expect(page.locator("[data-flow-source-title]")).to_have_text(plan["documents"][1]["title"])
    expect(page.locator("[data-flow-source-position]")).to_contain_text("Text 2 /")

    for _ in range(12):
        page.keyboard.press("Tab")
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        assert page.locator('[data-flow-view="ready"]').count() == 0
        assert page.locator('[data-flow-view="complete"]').count() == 0

    page.keyboard.press("Escape")
    expect(page.locator(".mode-select-screen")).to_be_visible(timeout=10000)
    assert page.evaluate("window.wordstrikeFlowPhase1.isActive()") is False
    assert "flowRelease=1" not in page.url, page.url

    page.locator('button[data-mode-id="flow"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)
    reentry_plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    assert reentry_plan["theme"] == "mixed", reentry_plan
    assert page.locator('[data-flow-view="ready"]').count() == 0
    assert not errors, errors

    evidence.append({
        "browser": browser_name,
        "case": "Flow V4 theme and stream integrity stress",
        "documentTransitionIndex": target_index,
        "textSkips": 12,
    })
    context.close()


def certify_word_recovery(browser, browser_name, base, evidence):
    if browser_name != "chromium":
        return

    context = context_for(browser, base)
    page = context.new_page()
    open_modes(page, base)
    plan = launch_public_flow(page)
    segment = plan["segments"][0]
    text = segment["text"]
    words = list(re.finditer(r"\S+", text))

    chosen = None
    for index in range(len(words) - 2):
        first = words[index]
        second = words[index + 1]
        if second.start() - first.end() != 1 or len(first.group()) < 4 or len(second.group()) < 3:
            continue
        omit = next(
            (pos for pos in range(1, len(first.group()) - 1)
             if first.group()[pos] != first.group()[pos + 1]),
            None,
        )
        if omit is not None:
            chosen = (first, second, omit)
            break
    assert chosen is not None, text[:180]
    first, second, omit = chosen

    prefix = text[:first.start()]
    page.keyboard.type(prefix)
    damaged = first.group()[:omit] + first.group()[omit + 1:]
    page.keyboard.type(damaged + " ")

    second_start = segment["startIndex"] + second.start()
    snapshot = page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()")
    assert snapshot["currentIndex"] == second_start, (snapshot, first.group(), damaged, second.group())

    error_index = segment["startIndex"] + first.start() + omit
    error_node = page.locator(f'[data-flow-char="{error_index}"]')
    assert "flow-char--incorrect" in (error_node.get_attribute("class") or "")
    assert error_node.text_content() == first.group()[omit], {
        "expectedGlyph": first.group()[omit],
        "rendered": error_node.text_content(),
    }

    page.keyboard.type(second.group())
    second_end = segment["startIndex"] + second.end()
    snapshot = page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()")
    assert snapshot["currentIndex"] == second_end, snapshot
    statuses = page.locator(
        f'[data-flow-char][data-status="correct"]'
    ).evaluate_all(
        """(els, range) => els
          .filter(el => Number(el.dataset.flowChar) >= range.start && Number(el.dataset.flowChar) < range.end)
          .map(el => Number(el.dataset.flowChar))""",
        {"start": second_start, "end": second_end},
    )
    assert len(statuses) == second_end - second_start, (statuses, second.group())

    boundary = page.locator(f'[data-flow-char="{second_end}"]')
    width_before = boundary.evaluate("el => el.getBoundingClientRect().width")
    page.keyboard.type("x")
    snapshot = page.evaluate("window.wordstrikeFlowPhase1.getSnapshot()")
    assert snapshot["currentIndex"] == second_end, snapshot
    width_after = boundary.evaluate("el => el.getBoundingClientRect().width")
    assert boundary.text_content() == " "
    assert boundary.get_attribute("data-flow-extra") == "x"
    assert abs(width_after - width_before) <= 0.1, (width_before, width_after)

    page.keyboard.press("Backspace")
    assert boundary.get_attribute("data-flow-extra") is None
    assert page.evaluate("window.wordstrikeFlowPhase1.getSnapshot().currentIndex") == second_end

    evidence.append({
        "browser": browser_name,
        "case": "word mistakes recover on Space without reflow",
        "damagedWord": first.group(),
        "nextWord": second.group(),
        "boundaryWidthBefore": width_before,
        "boundaryWidthAfter": width_after,
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
      session: document.querySelector('[data-flow-session-strip]').getBoundingClientRect().width,
      progression: document.querySelector('[data-flow-progression]').getBoundingClientRect().width,
      identity: document.querySelector('[data-flow-identity]').getBoundingClientRect().width,
      source: document.querySelector('[data-flow-source]').getBoundingClientRect().width,
      passage: document.querySelector('[data-flow-longform="true"]').getBoundingClientRect().width,
      timer: document.querySelector('[data-flow-session-clock]').getBoundingClientRect().width,
      sessionPreset: document.querySelector('[data-flow-session-preset]').getBoundingClientRect().width,
      theme: document.querySelector('[data-flow-theme-select]').getBoundingClientRect().width,
    })""")
    assert geometry["overflow"] <= 1, geometry
    assert geometry["screen"] <= geometry["viewport"] + 1, geometry
    assert geometry["hud"] <= geometry["viewport"] + 1, geometry
    assert geometry["session"] <= geometry["viewport"] + 1, geometry
    assert geometry["progression"] <= geometry["viewport"] + 1, geometry
    assert geometry["identity"] <= geometry["viewport"] + 1, geometry
    assert geometry["source"] <= geometry["viewport"] + 1, geometry
    assert geometry["passage"] <= geometry["viewport"] + 1, geometry
    assert geometry["timer"] <= geometry["viewport"] + 1, geometry
    assert geometry["sessionPreset"] <= geometry["viewport"], geometry
    assert geometry["theme"] <= geometry["viewport"], geometry

    session_before = page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()")
    page.keyboard.type(plan["fullText"][:80])
    page.keyboard.press("Tab")
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    assert page.evaluate("window.wordstrikeFlowPhase1.getPublicSessionId()") == session_before
    assert page.locator('[data-flow-micro-result]').count() == 0
    expect(page.locator('[data-flow-session-clock]')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / "chromium-timed-flow-mobile.png"), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px timed Flow and in-run Tab skip", **geometry})
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
        './js/flow/flowRuntimeLoader.js?v=20260925g',
        './js/flow/flowPhase1.js?v=20260925g',
        './js/flow/flowSessionV4.js?v=20260924a',
        './js/flow/flowProgressionV4.js?v=20260924a',
        './js/flow/flowIdentityV1.js?v=20260924b',
        './styles/screens/flow-session-v4.css?v=20260924c',
        './js/flow/flowCadence.js?v=20260925b',
        './js/flow/flowStreamPlanV3.js?v=20260925b',
        './js/flow/flowScoreV3.js?v=20260925d',
        './js/flow/flowRecordsV3.js?v=20260923a',
        './js/leaderboardService.js',
        './js/leaderboardSubmissionService.js',
        './js/submissionOutbox.js',
        './js/supabaseClient.js',
        './styles/screens/flow-game-mode-v2.css?v=20260925d',
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
                certify_theme_stream_integrity(browser, name, base, evidence)
                certify_word_recovery(browser, name, base, evidence)
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
