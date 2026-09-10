"""UI9 Arcade Rush unified-gameplay browser certification.

Exercises the real Rush runtime for ready/wave/input/pause/mobile behavior, then uses the
existing AR6 UI port for deterministic wave-transition and Core Breaker presentation checks.
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
ARTIFACTS = ROOT / "browser-artifacts" / "ui9-arcade-rush"

SEED_STORAGE = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel:10,
    levels:{1:{grade:'A',bestWPM:82,bestAccuracy:98.5,bestScore:4100,completed:true}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def new_context(browser, base, *, width=1440, height=900, mobile=False, reduced=False):
    options = {"viewport": {"width": width, "height": height}}
    if mobile:
        options["has_touch"] = True
        if browser.browser_type.name == "chromium":
            options["is_mobile"] = True
    if reduced:
        options["reduced_motion"] = "reduce"
    context = browser.new_context(**options)
    context.add_init_script(SEED_STORAGE)
    local_only(context, base)
    return context


def open_ready(page, base, seed=901):
    page.goto(f"{base}?dev=1&mode=arcade-rush&seed={seed}")
    expect(page.locator('[data-rush-view="ready"]')).to_be_visible(timeout=8000)
    expect(page.locator('.arcade-rush-route-visual')).to_be_attached(timeout=4000)


def ready_snapshot(page):
    return page.evaluate("""() => {
      const root = document.querySelector('[data-rush-view="ready"]');
      const card = document.querySelector('.arcade-rush-ready-card');
      const route = document.querySelector('.arcade-rush-route-visual');
      const start = document.querySelector('[data-rush-action="start"]');
      const back = document.querySelector('[data-rush-action="back"]');
      const style = getComputedStyle(card);
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rootOverflow: root.scrollWidth - root.clientWidth,
        cardBorder: style.borderTopWidth,
        cardBackground: style.backgroundColor,
        routeNodes: route?.querySelectorAll('.arcade-rush-route-node').length || 0,
        bossNodes: route?.querySelectorAll('.arcade-rush-route-boss').length || 0,
        startHeight: start?.getBoundingClientRect().height || 0,
        backHeight: back?.getBoundingClientRect().height || 0,
      };
    }""")


def gameplay_snapshot(page):
    return page.evaluate("""() => {
      const root = document.querySelector('[data-rush-view="gameplay"]');
      const hud = root?.querySelector('.arcade-rush-hud');
      const core = root?.querySelector('.arcade-rush-core');
      const word = root?.querySelector('.word-visual');
      const pause = root?.querySelector('[data-rush-action="pause"]');
      const score = root?.querySelector('[data-rush-role="score"]');
      const combo = root?.querySelector('[data-rush-role="combo"]');
      const coreMetric = root?.querySelector('[data-rush-role="core"]');
      const wave = root?.querySelector('[data-rush-role="wave"]');
      const waveName = root?.querySelector('.arcade-rush-wave-name');
      const keyboard = document.querySelector('.gameplay-keyboard-trigger');
      const rect = root?.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const visibleOverflow = rect
        ? Math.max(0, -rect.left, rect.right - viewportWidth)
        : 999;
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rootScrollDelta: root ? root.scrollWidth - root.clientWidth : 999,
        visibleOverflow,
        phase: root?.dataset.ui9Phase || null,
        wave: root?.dataset.ui9Wave || null,
        integrity: root?.dataset.ui9Integrity || null,
        comboTier: root?.dataset.ui9ComboTier || null,
        hudBorder: hud ? getComputedStyle(hud).borderBottomWidth : null,
        coreBorder: core ? getComputedStyle(core).borderTopWidth : null,
        coreBackground: core ? getComputedStyle(core).backgroundColor : null,
        coreRole: core?.getAttribute('role') || null,
        coreNow: core?.getAttribute('aria-valuenow') || null,
        coreMax: core?.getAttribute('aria-valuemax') || null,
        integritySegments: core?.querySelectorAll('.arcade-rush-core-integrity i').length || 0,
        wordBorder: word ? getComputedStyle(word).borderTopWidth : null,
        wordBackground: word ? getComputedStyle(word).backgroundColor : null,
        scoreVisible: !!score && getComputedStyle(score.parentElement).display !== 'none',
        comboVisible: !!combo && getComputedStyle(combo.parentElement).display !== 'none',
        coreVisible: !!coreMetric && getComputedStyle(coreMetric.parentElement).display !== 'none',
        waveVisible: !!wave && getComputedStyle(wave.parentElement).display !== 'none',
        waveName: waveName?.textContent?.trim() || null,
        pauseHeight: pause?.getBoundingClientRect().height || 0,
        keyboardDisplay: keyboard ? getComputedStyle(keyboard).display : null,
        keyboardHeight: keyboard?.getBoundingClientRect().height || 0,
      };
    }""")


def certify_real_runtime(browser, browser_name, base, checks):
    context = new_context(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_ready(page, base, 901)

    ready = ready_snapshot(page)
    assert ready["docOverflow"] <= 1 and ready["rootOverflow"] <= 1, ready
    assert ready["cardBorder"] == "0px", ready
    assert ready["cardBackground"] in {"rgba(0, 0, 0, 0)", "transparent"}, ready
    assert ready["routeNodes"] == 7 and ready["bossNodes"] == 1, ready
    assert ready["startHeight"] >= 44 and ready["backHeight"] >= 44, ready

    page.locator('[data-rush-action="start"]').click()
    expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible(timeout=8000)
    expect(page.locator('.gameplay-input-dock')).to_have_count(1)
    expect(page.locator('.arcade-rush-core-integrity i')).to_have_count(5, timeout=4000)
    word = page.locator('.word-position').first
    expect(word).to_be_attached(timeout=8000)
    text = word.get_attribute("aria-label")
    assert text, "real Rush runtime did not spawn a labelled word"

    initial = gameplay_snapshot(page)
    assert initial["docOverflow"] <= 1 and initial["visibleOverflow"] <= 1, initial
    assert initial["phase"] == "wave" and initial["wave"] == "1", initial
    assert initial["integrity"] == "5", initial
    assert initial["waveName"] == "IGNITION", initial
    assert initial["hudBorder"] == "0px", initial
    assert initial["coreBorder"] == "0px", initial
    assert initial["coreBackground"] in {"rgba(0, 0, 0, 0)", "transparent"}, initial
    assert initial["coreRole"] == "progressbar" and initial["coreNow"] == "5" and initial["coreMax"] == "5", initial
    assert initial["integritySegments"] == 5, initial
    assert initial["wordBorder"] == "0px", initial
    assert initial["wordBackground"] in {"rgba(0, 0, 0, 0)", "transparent"}, initial
    assert initial["pauseHeight"] >= 44, initial

    page.locator('.arcade-rush-word-layer').click(position={"x": 60, "y": 250})
    expect(page.locator('textarea.gameplay-input')).to_be_focused()
    page.keyboard.type(text[0])
    expect(page.locator('.word-visual.active')).to_have_count(1, timeout=2000)
    active = page.locator('.word-visual.active')
    typed = active.locator('.typed-letter').inner_text()
    assert typed.startswith(text[0]), (text, typed)
    feedback = active.evaluate("""el => ({
      border:getComputedStyle(el).borderTopWidth,
      background:getComputedStyle(el).backgroundColor,
      underline:getComputedStyle(el.querySelector('.word-text'),'::after').height
    })""")
    assert feedback["border"] == "0px", feedback
    assert feedback["background"] in {"rgba(0, 0, 0, 0)", "transparent"}, feedback
    assert feedback["underline"] != "0px", feedback

    next_expected = text[1].lower() if len(text) > 1 else None
    if next_expected:
        wrong = "z" if next_expected != "z" else "x"
        page.keyboard.type(wrong)
        expect(page.locator('.word-visual.active.wrong')).to_have_count(1, timeout=1000)

    pause = page.locator('[data-rush-action="pause"]')
    pause.click()
    expect(page.locator('[data-rush-role="pause-overlay"]')).to_be_visible()
    expect(page.locator('[data-rush-action="resume"]')).to_be_visible()
    assert page.locator('[data-rush-action="resume"]').evaluate("el => el.getBoundingClientRect().height") >= 44
    page.locator('[data-rush-action="resume"]').click()
    expect(page.locator('[data-rush-role="pause-overlay"]')).to_be_hidden()

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-desktop-wave.png"), full_page=True)
    checks.append({"browser": browser_name, "case": "ready + real wave runtime + input + pause", "ready": ready, "gameplay": initial})
    assert not errors, errors
    context.close()


def mount_synthetic_ui(page, base):
    page.goto(base)
    expect(page.locator('.title-screen')).to_be_visible(timeout=8000)
    page.evaluate("""async () => {
      const [{createArcadeRushDomUiController}, presentation] = await Promise.all([
        import('./js/arcadeRush/arcadeRushUi.js'),
        import('./js/arcadeRushGameplayPresentation.js'),
      ]);
      const root = document.querySelector('#app');
      window.__ui9Rush = createArcadeRushDomUiController({root, actions:{}});
      window.__ui9Enhance = presentation.enhanceCurrentArcadeRushView;
      window.__ui9Rush.renderHud({
        runState:'active', phase:'WAVE_3', currentWave:3, score:24850, combo:18, integrity:4
      });
      window.__ui9Enhance();
    }""")
    expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible()
    expect(page.locator('.arcade-rush-core-integrity i')).to_have_count(5, timeout=3000)


def certify_transition_and_boss(browser, browser_name, base, checks):
    context = new_context(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    mount_synthetic_ui(page, base)

    page.evaluate("""() => {
      window.__ui9Rush.renderWaveTransition({
        runState:'transitioning', phase:'WAVE_TRANSITION', currentWave:3, wavesCompleted:3,
        score:40200, combo:27, integrity:4, transitionRemainingMs:1800
      }, {clearedWave:3,nextWave:4,perfect:true});
      window.__ui9Enhance();
    }""")
    expect(page.locator('[data-rush-role="transition-overlay"]')).to_be_visible()
    transition = page.evaluate("""() => {
      const root = document.querySelector('[data-rush-view="gameplay"]');
      const card = root.querySelector('[data-rush-role="transition-overlay"] .arcade-rush-overlay-card');
      return {
        phase:root.dataset.ui9Phase,
        wave:root.dataset.ui9Wave,
        cardBorder:getComputedStyle(card).borderTopWidth,
        cardBackground:getComputedStyle(card).backgroundColor,
        title:card.querySelector('h2')?.textContent?.trim()
      };
    }""")
    assert transition["phase"] == "transition", transition
    assert transition["cardBorder"] == "0px", transition
    assert transition["cardBackground"] in {"rgba(0, 0, 0, 0)", "transparent"}, transition
    assert transition["title"] == "PERFECT WAVE", transition

    page.evaluate("""() => {
      window.__ui9Rush.renderBossIntro({
        runState:'boss-intro', phase:'BOSS_INTRO', currentWave:6, wavesCompleted:6,
        score:73500, combo:42, integrity:3, bossIntroRemainingMs:1900
      });
      window.__ui9Enhance();
    }""")
    expect(page.locator('[data-rush-role="transition-overlay"]')).to_be_visible()
    expect(page.locator('[data-rush-role="transition-overlay"] h2')).to_have_text("CORE BREAKER")

    page.evaluate("""() => {
      window.__ui9Rush.renderHud({
        runState:'boss-active', phase:'BOSS', currentWave:6, wavesCompleted:6,
        score:81250, combo:51, integrity:3,
        boss:{maxHp:8,hp:5,durationRemainingMs:27800,attackRemainingMs:6400,currentPhrase:'precision over pressure',typedIndex:9}
      });
      window.__ui9Enhance();
    }""")
    expect(page.locator('[data-rush-role="boss-panel"]')).to_be_visible()
    boss = page.evaluate("""() => {
      const root = document.querySelector('[data-rush-view="gameplay"]');
      const panel = root.querySelector('[data-rush-role="boss-panel"]');
      const meter = root.querySelector('.arcade-rush-boss-meter');
      const phrase = root.querySelector('[data-rush-role="boss-phrase"]');
      return {
        phase:root.dataset.ui9Phase,
        wave:root.dataset.ui9Wave,
        comboTier:root.dataset.ui9ComboTier,
        waveName:root.querySelector('.arcade-rush-wave-name')?.textContent?.trim(),
        panelLeftBorder:getComputedStyle(panel).borderLeftWidth,
        meterRole:meter.getAttribute('role'),
        meterNow:meter.getAttribute('aria-valuenow'),
        meterMax:meter.getAttribute('aria-valuemax'),
        typed:phrase.querySelector('.typed')?.textContent || '',
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
      };
    }""")
    assert boss["phase"] == "boss" and boss["wave"] == "boss", boss
    assert boss["comboTier"] == "overdrive", boss
    assert boss["waveName"] == "CORE BREAKER", boss
    assert boss["panelLeftBorder"] == "0px", boss
    assert boss["meterRole"] == "progressbar" and boss["meterNow"] == "5" and boss["meterMax"] == "8", boss
    assert boss["typed"] == "precision", boss
    assert boss["overflow"] <= 1, boss

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-core-breaker.png"), full_page=True)
    checks.append({"browser": browser_name, "case": "wave transition + boss intro + Core Breaker", "transition": transition, "boss": boss})
    assert not errors, errors
    context.close()


def certify_mobile(browser, browser_name, base, checks):
    if browser_name != "chromium":
        return
    context = new_context(browser, base, width=390, height=844, mobile=True)
    page = context.new_page()
    open_ready(page, base, 903)
    page.locator('[data-rush-action="start"]').click()
    expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible()
    expect(page.locator('.gameplay-keyboard-trigger')).to_be_visible()
    expect(page.locator('.arcade-rush-core-integrity i')).to_have_count(5, timeout=3000)
    normal = gameplay_snapshot(page)
    assert normal["docOverflow"] <= 1 and normal["visibleOverflow"] <= 1, normal
    assert normal["scoreVisible"] and normal["coreVisible"] and normal["waveVisible"], normal
    assert normal["pauseHeight"] >= 44, normal
    assert normal["keyboardDisplay"] != "none" and normal["keyboardHeight"] >= 44, normal
    page.screenshot(path=str(ARTIFACTS / "chromium-mobile-390x844.png"), full_page=True)

    page.set_viewport_size({"width": 390, "height": 360})
    page.wait_for_timeout(180)
    short = gameplay_snapshot(page)
    assert short["docOverflow"] <= 1 and short["visibleOverflow"] <= 1, short
    assert short["scoreVisible"] and short["coreVisible"] and short["waveVisible"], short
    assert short["comboVisible"] is False, short
    assert short["pauseHeight"] >= 44, short
    assert short["keyboardDisplay"] != "none" and short["keyboardHeight"] >= 44, short
    page.screenshot(path=str(ARTIFACTS / "chromium-mobile-390x360.png"), full_page=True)
    checks.append({"browser": browser_name, "case": "mobile + keyboard-height", "normal": normal, "short": short})
    context.close()


def certify_reduced_motion(browser, browser_name, base, checks):
    context = new_context(browser, base, width=1280, height=720, reduced=True)
    page = context.new_page()
    open_ready(page, base, 904)
    page.locator('[data-rush-action="start"]').click()
    expect(page.locator('[data-rush-view="gameplay"]')).to_be_visible()
    expect(page.locator('.arcade-rush-core-integrity i')).to_have_count(5, timeout=3000)
    reduced = page.evaluate("""() => {
      const root = document.querySelector('[data-rush-view="gameplay"]');
      const core = root.querySelector('.arcade-rush-core');
      const coreBefore = getComputedStyle(core,'::before');
      return {
        coreAnimation:coreBefore.animationName,
        rootTransform:getComputedStyle(root).transform,
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
      };
    }""")
    assert reduced["coreAnimation"] == "none", reduced
    assert reduced["rootTransform"] == "none", reduced
    assert reduced["overflow"] <= 1, reduced
    checks.append({"browser": browser_name, "case": "reduced motion", **reduced})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    result = {"sha": os.getenv("GITHUB_SHA"), "checks": [], "success": False}
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)
                certify_real_runtime(browser, browser_name, base, result["checks"])
                certify_transition_and_boss(browser, browser_name, base, result["checks"])
                certify_mobile(browser, browser_name, base, result["checks"])
                certify_reduced_motion(browser, browser_name, base, result["checks"])
                browser.close()
        result["success"] = True
        print(f"PASS: {len(result['checks'])} UI9 Arcade Rush checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui9-arcade-rush.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()