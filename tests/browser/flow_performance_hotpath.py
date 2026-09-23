"""Flow longform typing hot-path performance certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-performance"

ONBOARDING_SEED = """(() => {
  for (const [id, version] of Object.entries({general:3,campaign:2,typing:1,endless:1,boss:1,leaderboards:1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def route(base):
    return (
        base
        + "?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1"
        + "&flowModifiers=1&flowAdaptive=1&flowIntegration=1"
        + "&flowLength=quick&flowCategory=mixed&flowDifficulty=natural&flowSeed=flow-perf-hotpath"
    )



def certify_public_entry(browser_type, base, evidence):
    browser = browser_type.launch()
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(ONBOARDING_SEED)
    context.route("**/*", lambda req: req.continue_() if req.request.url.startswith(base) else req.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    page.goto(base)
    modes = page.locator('[data-action="modes"]')
    if modes.is_visible():
        modes.click()
    flow = page.locator('button[data-mode-id="flow"]')
    expect(flow).to_be_visible(timeout=15000)

    entry = page.evaluate("""() => {
      window.__flowEntryDocumentMarker = `flow-${Math.random()}`;
      window.__flowEntryStartedAt = performance.now();
      return window.__flowEntryDocumentMarker;
    }""")
    flow.click()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    result = page.evaluate("""entry => ({
      sameDocument: window.__flowEntryDocumentMarker === entry,
      elapsedMs: performance.now() - window.__flowEntryStartedAt,
      releaseRoute: new URL(location.href).searchParams.get('flowRelease') === '1',
      ready: Boolean(window.wordstrikeFlowPhase1?.isActive?.()),
    })""", entry)

    assert result["sameDocument"], result
    assert result["releaseRoute"], result
    assert result["ready"], result
    # Generous enough for CI cold caches; this guards multi-second startup
    # regressions while the same-document assertion catches reloads exactly.
    assert result["elapsedMs"] < 3000, result
    assert not errors, errors

    evidence.append({
        "browser": browser_type.name,
        "case": "public-entry",
        "sameDocument": result["sameDocument"],
        "elapsedMs": round(result["elapsedMs"], 2),
    })
    context.close()
    browser.close()

def certify(browser_type, base, evidence):
    browser = browser_type.launch()
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(ONBOARDING_SEED)
    context.route("**/*", lambda req: req.continue_() if req.request.url.startswith(base) else req.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    page.goto(route(base))
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=15000)
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=15000)

    plan = page.evaluate("window.wordstrikeFlowPhase1.getRunPlan()")
    text = plan["segments"][0]["text"]
    sample = text[: min(180, len(text))]
    assert len(sample) >= 120, len(sample)

    result = page.evaluate(
        """sample => {
          const input = document.querySelector('[data-flow-input]');
          const controller = window.wordstrikeFlowPhase1;
          const started = performance.now();
          for (const character of sample) {
            input.dispatchEvent(new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: character,
            }));
          }
          return {
            elapsedMs: performance.now() - started,
            currentIndex: controller.getSnapshot().currentIndex,
            stats: controller.getPerformanceStats(),
          };
        }""",
        sample,
    )

    assert result["currentIndex"] == len(sample), result
    # Incremental rendering should touch only the typed/current boundary rather
    # than every character in the long section for every keystroke.
    assert result["stats"]["characterNodeUpdates"] <= len(sample) * 3 + 8, result
    # A deliberately generous wall-clock ceiling catches catastrophic O(n^2)
    # regressions without making CI sensitive to runner noise.
    assert result["elapsedMs"] < 1500, result

    page.wait_for_timeout(260)
    settled = page.evaluate("window.wordstrikeFlowPhase1.getPerformanceStats()")
    assert settled["cadenceRefreshes"] <= 3, settled
    assert not errors, errors

    evidence.append({
        "browser": browser_type.name,
        "characters": len(sample),
        "elapsedMs": round(result["elapsedMs"], 2),
        "characterNodeUpdates": result["stats"]["characterNodeUpdates"],
        "cadenceRefreshesAfterSettle": settled["cadenceRefreshes"],
    })
    context.close()
    browser.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}/"
    evidence = []
    try:
        with sync_playwright() as p:
            certify_public_entry(p.chromium, base, evidence)
            certify(p.chromium, base, evidence)
            certify_public_entry(p.firefox, base, evidence)
            certify(p.firefox, base, evidence)
    finally:
        server.shutdown()
        server.server_close()

    (ARTIFACTS / "evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
