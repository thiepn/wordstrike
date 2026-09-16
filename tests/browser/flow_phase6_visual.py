"""Flow Phase 6 Quiet Signal visual certification."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "flow-phase6"

ONBOARDING_SEED = """(() => {
  for (const [id, version] of Object.entries({general:3,campaign:2,typing:1,endless:1,boss:1,leaderboards:1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def context_for(browser, base, width=1440, height=900, reduced_motion="no-preference"):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        reduced_motion=reduced_motion,
    )
    context.add_init_script(ONBOARDING_SEED)
    local_only(context, base)
    return context


def route(base):
    return base + "?dev=1&mode=flow&flowRun=1&flowLength=quick&flowCategory=mixed&flowDifficulty=advanced&flowSeed=phase6-visual"


def settle_visual(page):
    # Phase 6 reveal motion lasts 520 ms; screenshots should represent the settled UI.
    page.wait_for_timeout(650)


def open_ready(page, base):
    page.goto(route(base))
    expect(page.locator('[data-flow-view="ready"]')).to_be_visible(timeout=10000)
    expect(page.locator('.flow-phase1-screen')).to_have_attribute('data-flow-visual', 'quiet-signal')
    return page.evaluate('window.wordstrikeFlowPhase1.getRunPlan()')


def style_snapshot(page):
    return page.evaluate("""() => {
      const ready = document.querySelector('[data-flow-view="ready"]');
      const title = ready?.querySelector('h1');
      const button = ready?.querySelector('.ui-button--primary');
      const shell = ready?.querySelector('.flow-phase1-shell');
      const brief = ready?.querySelector('.flow-phase1-brief');
      return {
        screenBackground: ready ? getComputedStyle(ready).backgroundImage : '',
        titleFont: title ? getComputedStyle(title).fontFamily : '',
        titleWeight: title ? getComputedStyle(title).fontWeight : '',
        buttonRadius: button ? getComputedStyle(button).borderRadius : '',
        shellDisplay: shell ? getComputedStyle(shell).display : '',
        briefBorder: brief ? getComputedStyle(brief).borderLeftWidth : '',
      };
    }""")


def finish_quick_run_from_second_chapter(page, plan):
    page.locator('[data-flow-action="continue-chapter"]').click()
    for index in range(2, len(plan['segments'])):
        segment = plan['segments'][index]
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        page.keyboard.type(segment['text'])
        if index == len(plan['segments']) - 1:
            break
        next_segment = plan['segments'][index + 1]
        if next_segment['chapterIndex'] != segment['chapterIndex']:
            expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
            page.locator('[data-flow-action="continue-chapter"]').click()


def certify_visual_language(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    plan = open_ready(page, base)
    settle_visual(page)

    ready_style = style_snapshot(page)
    assert 'serif' in ready_style['titleFont'].lower() or 'georgia' in ready_style['titleFont'].lower(), ready_style
    assert ready_style['buttonRadius'] == '0px', ready_style
    assert ready_style['shellDisplay'] == 'grid', ready_style
    assert ready_style['briefBorder'] == '1px', ready_style
    assert 'radial-gradient' in ready_style['screenBackground'], ready_style

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-ready.png'), full_page=True)

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()
    settle_visual(page)

    run_geometry = page.evaluate("""() => {
      const passage = document.querySelector('.flow-passage');
      const meter = document.querySelector('[data-flow-meter]');
      const copy = document.querySelector('.flow-run-copy');
      const hud = document.querySelector('.flow-gameplay-hud');
      return {
        passageWidth: passage.getBoundingClientRect().width,
        passageFont: getComputedStyle(passage).fontFamily,
        passageFontSize: parseFloat(getComputedStyle(passage).fontSize),
        passageLineHeight: parseFloat(getComputedStyle(passage).lineHeight),
        meterHeight: meter.getBoundingClientRect().height,
        meterBorderTop: getComputedStyle(meter).borderTopWidth,
        copyWidth: copy.getBoundingClientRect().width,
        hudBorderRadius: getComputedStyle(hud).borderRadius,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }""")
    assert run_geometry['passageWidth'] <= 900, run_geometry
    assert run_geometry['passageFontSize'] >= 20, run_geometry
    assert run_geometry['passageLineHeight'] / run_geometry['passageFontSize'] >= 1.55, run_geometry
    assert 'serif' in run_geometry['passageFont'].lower() or 'georgia' in run_geometry['passageFont'].lower(), run_geometry
    assert run_geometry['meterHeight'] <= 3, run_geometry
    assert run_geometry['meterBorderTop'] == '0px', run_geometry
    assert run_geometry['hudBorderRadius'] == '0px', run_geometry
    assert run_geometry['overflow'] <= 1, run_geometry

    # Build enough Flow to exercise the state-aware signal hook.
    first = plan['segments'][0]
    page.keyboard.type(first['text'][:90])
    meter_band = page.locator('[data-flow-meter]').get_attribute('data-flow-band')
    assert meter_band in ('mid', 'high'), meter_band

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-run.png'), full_page=True)

    # Finish first chapter and certify the typographic chapter transition.
    remaining_first = first['text'][90:]
    if remaining_first:
        page.keyboard.type(remaining_first)
    second = plan['segments'][1]
    expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
    page.keyboard.type(second['text'])
    expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
    expect(page.locator('.flow-chapter-index')).to_have_text('02')
    settle_visual(page)
    chapter_style = page.evaluate("""() => {
      const index = document.querySelector('.flow-chapter-index');
      const transition = document.querySelector('.flow-chapter-transition');
      return {
        indexSize: parseFloat(getComputedStyle(index).fontSize),
        indexColor: getComputedStyle(index).color,
        display: getComputedStyle(transition).display,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }""")
    assert chapter_style['indexSize'] >= 100, chapter_style
    assert chapter_style['display'] == 'grid', chapter_style
    assert chapter_style['overflow'] <= 1, chapter_style

    if browser_name == 'chromium':
        page.screenshot(path=str(ARTIFACTS / 'chromium-chapter.png'), full_page=True)
        finish_quick_run_from_second_chapter(page, plan)
        expect(page.locator('[data-flow-view="complete"]')).to_be_visible(timeout=10000)
        settle_visual(page)
        result_style = page.evaluate("""() => {
          const score = document.querySelector('.flow-final-score strong');
          const metrics = document.querySelector('.flow-result-metrics');
          const analysis = document.querySelector('.flow-natural-analysis');
          return {
            scoreFont: getComputedStyle(score).fontFamily,
            scoreSize: parseFloat(getComputedStyle(score).fontSize),
            metricsDisplay: getComputedStyle(metrics).display,
            metricsRadius: getComputedStyle(metrics).borderRadius,
            analysisRadius: getComputedStyle(analysis).borderRadius,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        }""")
        assert 'serif' in result_style['scoreFont'].lower() or 'georgia' in result_style['scoreFont'].lower(), result_style
        assert result_style['scoreSize'] >= 60, result_style
        assert result_style['metricsDisplay'] == 'grid', result_style
        assert result_style['metricsRadius'] == '0px', result_style
        assert result_style['analysisRadius'] == '0px', result_style
        assert result_style['overflow'] <= 1, result_style
        page.screenshot(path=str(ARTIFACTS / 'chromium-results.png'), full_page=True)
    else:
        result_style = None

    assert not errors, errors
    evidence.append({
        "browser": browser_name,
        "case": "Quiet Signal ready/run/chapter/results visual hierarchy",
        "ready": ready_style,
        "run": run_geometry,
        "chapter": chapter_style,
        "results": result_style,
    })
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, width=390, height=844)
    page = context.new_page()
    plan = open_ready(page, base)
    settle_visual(page)
    ready = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      titleSize: parseFloat(getComputedStyle(document.querySelector('.flow-ready-screen h1')).fontSize),
      shellWidth: document.querySelector('.flow-phase1-shell').getBoundingClientRect().width,
    })""")
    assert ready['overflow'] <= 1, ready
    assert ready['shellWidth'] <= 390, ready

    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()
    mobile_run = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      passageWidth: document.querySelector('.flow-passage').getBoundingClientRect().width,
      passageSize: parseFloat(getComputedStyle(document.querySelector('.flow-passage')).fontSize),
      meterWidth: document.querySelector('[data-flow-meter]').getBoundingClientRect().width,
    })""")
    assert mobile_run['overflow'] <= 1, mobile_run
    assert mobile_run['passageWidth'] <= 362, mobile_run
    assert mobile_run['passageSize'] >= 18, mobile_run

    for segment in plan['segments'][:2]:
        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=10000)
        page.keyboard.type(segment['text'])
    expect(page.locator('[data-flow-view="chapter"]')).to_be_visible(timeout=10000)
    settle_visual(page)
    chapter = page.evaluate("""() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      indexSize: parseFloat(getComputedStyle(document.querySelector('.flow-chapter-index')).fontSize),
      columns: getComputedStyle(document.querySelector('.flow-chapter-transition')).gridTemplateColumns,
    })""")
    assert chapter['overflow'] <= 1, chapter
    assert chapter['indexSize'] >= 80, chapter
    page.screenshot(path=str(ARTIFACTS / 'chromium-mobile-chapter.png'), full_page=True)
    evidence.append({"browser": browser_name, "case": "390px Quiet Signal composition", "ready": ready, "run": mobile_run, "chapter": chapter})
    context.close()


def certify_reduced_motion(browser, browser_name, base, evidence):
    if browser_name != 'chromium':
        return
    context = context_for(browser, base, reduced_motion='reduce')
    page = context.new_page()
    open_ready(page, base)
    page.locator('[data-flow-action="start"]').click()
    expect(page.locator('[data-flow-view="run"]')).to_be_visible()
    animation = page.evaluate("getComputedStyle(document.querySelector('.flow-run-copy')).animationName")
    assert animation == 'none', animation
    evidence.append({"browser": browser_name, "case": "reduced motion disables Flow reveal animation"})
    context.close()


def certify_public_gate(browser, browser_name, base, evidence):
    context = context_for(browser, base)
    page = context.new_page()
    page.goto(base)
    expect(page.locator('.title-screen')).to_be_visible(timeout=10000)
    page.locator('[data-action="modes"]').click()
    flow = page.locator('[data-mode-id="flow"]')
    expect(flow).to_be_visible()
    expect(flow).to_have_attribute('aria-disabled', 'true')
    assert page.locator('[data-flow-visual="quiet-signal"]').count() == 0
    evidence.append({"browser": browser_name, "case": "public Flow remains gated after visual redesign"})
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
                certify_visual_language(browser, name, base, evidence)
                certify_public_gate(browser, name, base, evidence)
                certify_mobile(browser, name, base, evidence)
                certify_reduced_motion(browser, name, base, evidence)
                browser.close()
        (ARTIFACTS / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(f"PASS: {len(evidence)} Flow Phase 6 visual scenarios")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
