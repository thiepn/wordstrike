"""Flow Phase 2 content-system browser certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase2"

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


def open_ready(page, base, query):
    page.goto(base + "?dev=1&mode=flow&" + query)
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    return page.evaluate('window.wordstrikeFlowPhase1.getSelection()')


def certify_filtered_selection(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    query = "flowCatalog=1&flowCategory=professional&flowDifficulty=advanced&flowSeed=phase2-browser"
    selection = open_ready(page, base, query)
    assert selection['source'] == 'catalog-filter', selection
    assert selection['category'] == 'professional', selection
    assert selection['difficulty'] == 'advanced', selection
    assert selection['matchCount'] >= 2, selection
    assert selection['passage']['category'] == 'professional', selection
    assert selection['passage']['difficulty'] == 'advanced', selection
    selected_id = selection['passage']['id']
    expect(page.locator('[data-flow-passage-id]')).to_have_text(selected_id)

    page.reload()
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    repeated = page.evaluate('window.wordstrikeFlowPhase1.getSelection()')
    assert repeated['passage']['id'] == selected_id, (selected_id, repeated)

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()
    passage = page.locator('[data-flow-passage]').get_attribute('aria-label')
    assert passage == selection['passage']['text'], (passage, selection)
    page.keyboard.type(passage)
    expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
    snapshot = page.evaluate('window.wordstrikeFlowPhase1.getSnapshot()')
    assert snapshot['phase'] == 'complete', snapshot
    assert snapshot['currentIndex'] == len(passage), snapshot
    assert snapshot['uncorrectedErrors'] == 0, snapshot
    assert not errors, errors

    evidence.append({
        "browser": browser_name,
        "case": "filtered deterministic catalog selection",
        "passageId": selected_id,
        "matches": selection['matchCount'],
    })
    context.close()


def certify_exact_and_missing(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()

    exact = open_ready(page, base, "flowPassage=numbers-symbols-expert-01")
    assert exact['source'] == 'catalog-id', exact
    assert exact['passage']['id'] == 'numbers-symbols-expert-01', exact
    assert exact['passage']['category'] == 'numbers-symbols', exact
    assert exact['passage']['difficulty'] == 'expert', exact
    assert '€' in exact['passage']['text'] and '%' in exact['passage']['text'] and '@' in exact['passage']['text'], exact

    page.goto(base + "?dev=1&mode=flow&flowPassage=does-not-exist")
    expect(page.locator('[data-flow-view="missing"]')).to_be_visible(timeout=10000)
    expect(page.locator('h1')).to_have_text('NO PASSAGE')

    evidence.append({"browser": browser_name, "case": "exact id and invalid-id failure state"})
    context.close()


def certify_mobile_catalog_wrap(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    selection = open_ready(page, base, "flowPassage=everyday-expert-01")
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()
    geometry = page.evaluate("""() => {
      const passage=document.querySelector('.flow-passage');
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        height:passage.getBoundingClientRect().height,
        lineHeight:parseFloat(getComputedStyle(passage).lineHeight),
      };
    }""")
    assert geometry['overflow'] <= 1, geometry
    assert geometry['height'] > geometry['lineHeight'] * 3, geometry
    page.screenshot(path=str(ARTIFACTS / 'chromium-catalog-mobile.png'), full_page=True)
    evidence.append({
        "browser": browser_name,
        "case": "catalog passage 390px wrapping",
        "passageId": selection['passage']['id'],
        **geometry,
    })
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
                certify_filtered_selection(browser, name, base, evidence)
                certify_exact_and_missing(browser, name, base, evidence)
                certify_mobile_catalog_wrap(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 2 browser scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
