"""Flow Phase 1 browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase1"

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


def open_flow(page, base):
    page.goto(base + '?dev=1&mode=flow')
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    assert page.evaluate('window.wordstrikeFlowPhase1.developerRouteEnabled') is True
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()


def certify_engine(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_flow(page, base)

    passage = page.locator('[data-flow-passage]').get_attribute('aria-label')
    assert passage and len(passage) >= 200, len(passage or "")
    assert all(token in passage for token in ['7:30', '"', "don't", ';', '3', ',', '.', '-'])

    # Correct first character, deliberate error, correction, then complete the passage.
    page.keyboard.type(passage[0])
    page.keyboard.type('x' if passage[1] != 'x' else 'z')
    expect(page.locator('[data-flow-char="1"]')).to_have_attribute('data-status', 'incorrect')
    page.keyboard.press('Backspace')
    expect(page.locator('[data-flow-unresolved]')).to_have_text('0')
    expect(page.locator('[data-flow-corrected]')).to_have_text('1')
    page.keyboard.type(passage[1:])
    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)

    snapshot = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    assert snapshot['phase'] == 'complete', snapshot
    assert snapshot['currentIndex'] == len(passage), snapshot
    assert snapshot['correctedErrors'] == 1, snapshot
    assert snapshot['uncorrectedErrors'] == 0, snapshot
    assert len(snapshot['rawKeystrokes']) >= len(passage) + 2, snapshot
    assert len(snapshot['wordTimings']) > 10, snapshot
    assert len(snapshot['sentenceTimings']) >= 3, snapshot
    assert len(snapshot['correctionTimings']) == 1, snapshot
    assert not errors, errors

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-complete.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "developer route full passage + error correction + telemetry", "length": len(passage)})
    context.close()


def certify_public_gate(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(base)
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-select-screen')).to_be_visible()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    expect(flow).to_have_attribute('aria-disabled', 'true')
    assert page.locator('[data-flow-view="ready"]').count() == 0
    evidence.append({"browser": browser_name, "case": "public Phase 1 Flow remains gated"})
    context.close()


def certify_mobile_wrap(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    open_flow(page, base)
    geometry = page.evaluate("""() => {
      const screen=document.querySelector('.flow-run-screen');
      const passage=document.querySelector('.flow-passage');
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        screenWidth:screen.getBoundingClientRect().width,
        passageWidth:passage.getBoundingClientRect().width,
        passageHeight:passage.getBoundingClientRect().height,
        lineHeight:parseFloat(getComputedStyle(passage).lineHeight),
      };
    }""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['passageHeight'] > geometry['lineHeight'] * 3, geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-run.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px passage wrapping", **geometry})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}/"
    evidence = []
    try:
        with sync_playwright() as p:
            for browser_type in (p.chromium, p.firefox):
                browser = browser_type.launch()
                name = browser_type.name
                certify_engine(browser, name, base, evidence)
                certify_public_gate(browser, name, base, evidence)
                certify_mobile_wrap(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 1 browser scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
