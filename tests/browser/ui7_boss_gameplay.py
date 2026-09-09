"""UI7 Boss cinematic/gameplay browser certification.

Uses the real level-10 Boss route, then pauses the Boss loop only inside the harness so
intro, active, transition, timer and phrase presentation can be tested deterministically.
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
ARTIFACTS = ROOT / "browser-artifacts" / "ui7-boss-gameplay"

SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel: 10,
    levels:{1:{grade:'A',bestWPM:82,bestAccuracy:98,bestScore:4000,completed:true}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def open_boss(page, base, seed):
    page.goto(f"{base}?seed={seed}")
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-screen')).to_be_visible()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator('.campaign-progress-screen')).to_be_visible()
    page.locator('[data-level="10"]').click()
    expect(page.locator('.boss-gameplay-screen')).to_be_visible(timeout=8000)
    expect(page.locator('.boss-gameplay-hud')).to_be_visible()
    expect(page.locator('.boss-threat-sigil')).to_be_attached()


def prepare_deterministic_boss(page, *, phase="ACTIVE", remaining_ms=9000, intro_ms=0):
    page.evaluate(
        """async ({phase, remainingMs, introMs}) => {
          const bossLoop = await import('./js/bossLoop.js');
          const state = await import('./js/state.js');
          const renderer = await import('./js/renderer.js');
          const ui = await import('./js/ui.js');
          bossLoop.stopBossLoop();
          const game = state.appState.game;
          game.phrases = ['signal focus', 'precision control', 'tempo survive'];
          game.segments = [...game.phrases];
          game.currentPhrase = game.phrases[1];
          game.phraseIndex = 1;
          game.displayedSequenceNumber = 2;
          game.phrasesCompleted = 1;
          game.phraseCharIndex = 10;
          game.phase = phase;
          game.introElapsedMs = introMs;
          game.transitionElapsedMs = phase === 'TRANSITION' ? 120 : 0;
          game.remainingMs = remainingMs;
          game.elapsedMs = 60000;
          game.score = 123456;
          game.combo = 14;
          game.correctKeystrokes = 300;
          game.totalKeystrokes = 310;
          game.correctCharacters = 300;
          game.missedCharacters = 0;
          game.completedWordCount = 2;
          game.config = {...game.config, bossIndex:8, segmentCount:3, totalWordCount:6};
          renderer.renderBossPhrase(game);
          ui.updateBossHud(game);
          window.__ui7 = {bossLoop, state, renderer, ui, game};
        }""",
        {"phase": phase, "remainingMs": remaining_ms, "introMs": intro_ms},
    )
    page.wait_for_timeout(80)


def snapshot(page):
    return page.evaluate("""() => {
      const screen = document.querySelector('.boss-gameplay-screen');
      const hud = document.querySelector('.boss-gameplay-hud');
      const arena = document.querySelector('.boss-arena');
      const frame = document.querySelector('.boss-combat-frame');
      const resolve = document.querySelector('[data-boss-resolve]');
      const sequence = document.querySelector('.boss-sequence-progress');
      const trigger = document.querySelector('.boss-keyboard-trigger');
      const triggerStyle = trigger ? getComputedStyle(trigger) : null;
      const triggerBox = trigger?.getBoundingClientRect();
      const backBox = document.querySelector('.boss-hud-back')?.getBoundingClientRect();
      const current = document.querySelector('.boss-current');
      const currentStyle = current ? getComputedStyle(current) : null;
      const currentAfter = current ? getComputedStyle(current, '::after') : null;
      const frameBox = frame?.getBoundingClientRect();
      const scoreBox = document.querySelector('.boss-hud-score')?.getBoundingClientRect();
      const resolveTrackBox = document.querySelector('.boss-resolve-track')?.getBoundingClientRect();
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screenOverflow: screen.scrollWidth - screen.clientWidth,
        hudHeight: hud.getBoundingClientRect().height,
        arenaHeight: arena.getBoundingClientRect().height,
        frameWidth: frameBox?.width || 0,
        phase: screen.dataset.bossPhase,
        tier: screen.dataset.bossTier,
        introStep: screen.dataset.bossIntroStep,
        timeTier: screen.dataset.bossTimeTier,
        timer: document.querySelector('#boss-timer')?.textContent,
        wpm: document.querySelector('#boss-wpm')?.textContent,
        accuracy: document.querySelector('#boss-accuracy')?.textContent,
        resolveValue: document.querySelector('[data-boss-resolve-value]')?.textContent,
        resolveNow: resolve?.getAttribute('aria-valuenow'),
        resolveText: resolve?.getAttribute('aria-valuetext'),
        sequenceNow: sequence?.getAttribute('aria-valuenow'),
        sequenceText: sequence?.getAttribute('aria-valuetext'),
        framePhase: document.querySelector('[data-boss-frame-phase]')?.textContent,
        currentBackground: currentStyle?.backgroundColor || null,
        currentUnderlineHeight: currentAfter?.height || null,
        currentUnderlineColor: currentAfter?.backgroundColor || null,
        keyboardText: trigger?.textContent?.trim() || null,
        keyboardDisplay: triggerStyle?.display || null,
        keyboardHeight: triggerBox?.height || 0,
        backHeight: backBox?.height || 0,
        scoreWidth: scoreBox?.width || 0,
        resolveTrackHeight: resolveTrackBox?.height || 0,
      };
    }""")


def certify_intro_and_active(browser, browser_name, base, evidence):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    open_boss(page, base, 801)

    intro_steps = []
    for elapsed, expected in ((500, "arrival"), (1400, "identified"), (2050, "countdown"), (2700, "engage")):
        prepare_deterministic_boss(page, phase="INTRO", remaining_ms=30000, intro_ms=elapsed)
        step = page.locator('.boss-gameplay-screen').get_attribute('data-boss-intro-step')
        assert step == expected, (elapsed, step, expected)
        intro_steps.append({"elapsed": elapsed, "step": step})

    prepare_deterministic_boss(page, phase="ACTIVE", remaining_ms=9000)
    state = snapshot(page)
    assert state["docOverflow"] <= 1 and state["screenOverflow"] <= 1, state
    assert state["arenaHeight"] > 650, state
    assert state["phase"] == "active", state
    assert state["tier"] == "apex", state
    assert state["timeTier"] == "warning", state
    assert state["timer"] == "9.0", state
    assert state["wpm"] == "60", state
    assert state["accuracy"].startswith("96."), state
    assert state["resolveValue"] in {"53%", "52%"}, state
    assert state["resolveNow"] in {"53", "52"}, state
    assert "boss encounter completed" in state["resolveText"].lower(), state
    assert state["sequenceNow"] in {"59", "58"}, state
    assert "current sequence completed" in state["sequenceText"].lower(), state
    assert state["framePhase"] == "ENGAGED", state
    assert state["currentBackground"] in {"rgba(0, 0, 0, 0)", "transparent"}, state
    assert state["currentUnderlineHeight"] == "2px", state
    assert state["keyboardDisplay"] == "none", state
    assert state["backHeight"] >= 44, state

    critical = page.evaluate("""() => {
      const game = window.__ui7.game;
      game.remainingMs = 4000;
      window.__ui7.ui.updateBossHud(game);
      return true;
    }""")
    assert critical is True
    page.wait_for_timeout(40)
    assert page.locator('.boss-gameplay-screen').get_attribute('data-boss-time-tier') == "critical"
    expect(page.locator('#boss-timer')).to_have_text("4.0")

    transient = page.evaluate("""() => {
      const frame = document.querySelector('.boss-combat-frame');
      window.__ui7.renderer.flashBossWrong();
      return {
        wrong: frame.classList.contains('wrong'),
        animation: getComputedStyle(frame).animationName
      };
    }""")
    assert transient["wrong"] is True, transient
    assert "boss-ui-wrong" in transient["animation"], transient

    page.evaluate("""() => {
      const game = window.__ui7.game;
      game.phase = 'TRANSITION';
      game.transitionElapsedMs = 100;
      window.__ui7.ui.updateBossHud(game);
    }""")
    page.wait_for_timeout(40)
    transition = snapshot(page)
    assert transition["phase"] == "transition", transition
    assert transition["framePhase"] == "SEQUENCE BREACHED", transition
    assert page.locator('.boss-combat-frame.transition').count() == 1

    evidence.append({"browser": browser_name, "case": "intro + active + critical + transition", "introSteps": intro_steps, **state, "wrong": transient})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    open_boss(page, base, 802)
    prepare_deterministic_boss(page, phase="ACTIVE", remaining_ms=9000)
    state = snapshot(page)
    assert state["docOverflow"] <= 1 and state["screenOverflow"] <= 1, state
    assert state["arenaHeight"] > 650, state
    assert state["frameWidth"] <= 390, state
    assert state["keyboardText"] == "KEYBOARD", state
    assert state["keyboardDisplay"] != "none", state
    assert state["keyboardHeight"] >= 44, state
    assert state["backHeight"] >= 44, state

    if browser_name == "chromium":
        page.set_viewport_size({"width": 390, "height": 360})
        page.wait_for_timeout(100)
        short = snapshot(page)
        assert short["docOverflow"] <= 1 and short["screenOverflow"] <= 1, short
        assert short["arenaHeight"] >= 250, short
        assert short["frameWidth"] <= 390, short
        assert short["keyboardDisplay"] != "none" and short["keyboardHeight"] >= 44, short
        assert short["backHeight"] >= 44, short
        assert short["scoreWidth"] <= 2, short
        assert 1 <= short["resolveTrackHeight"] <= 3, short
        evidence.append({"browser": browser_name, "case": "390x360", **short})

    evidence.append({"browser": browser_name, "case": "mobile", **state})
    context.close()


def certify_reduced_motion(browser, browser_name, base, evidence):
    context = browser.new_context(viewport={"width": 1280, "height": 720}, reduced_motion="reduce")
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    open_boss(page, base, 803)
    prepare_deterministic_boss(page, phase="INTRO", remaining_ms=4000, intro_ms=1400)
    ring_animation = page.locator('.boss-sigil-ring-a').evaluate("el => getComputedStyle(el).animationName")
    timer_animation = page.locator('#boss-timer').evaluate("el => getComputedStyle(el).animationName")
    prepare_deterministic_boss(page, phase="ACTIVE", remaining_ms=4000)
    wrong = page.evaluate("""() => {
      const frame = document.querySelector('.boss-combat-frame');
      window.__ui7.renderer.flashBossWrong();
      return {transform:getComputedStyle(frame).transform, filter:getComputedStyle(frame).filter};
    }""")
    assert ring_animation == "none", ring_animation
    assert timer_animation == "none", timer_animation
    assert wrong["transform"] == "none", wrong
    assert wrong["filter"] == "none", wrong
    evidence.append({"browser": browser_name, "case": "reduced motion", "ringAnimation": ring_animation, "timerAnimation": timer_animation, "wrong": wrong})
    context.close()


def certify_mode_isolation(browser, base, evidence):
    # Campaign ordinary level remains UI5-owned.
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    page.goto(f"{base}?seed=804")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    page.locator('[data-level="1"]').click()
    expect(page.locator('.campaign-gameplay-screen')).to_be_visible()
    assert page.locator('.boss-gameplay-screen').count() == 0
    context.close()

    # Endless remains UI6-owned.
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    page.goto(f"{base}?seed=805")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="endless"]').click()
    page.locator('[data-action="endless-start"]').click()
    expect(page.locator('.endless-gameplay-screen')).to_be_visible()
    assert page.locator('.boss-gameplay-screen').count() == 0
    evidence.append({"browser": "chromium", "case": "Campaign/Endless isolation", "bossPresentationNodes": 0})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    result = {"sha": os.getenv("GITHUB_SHA"), "success": False, "checks": []}
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)
                certify_intro_and_active(browser, browser_name, base, result["checks"])
                certify_mobile(browser, browser_name, base, result["checks"])
                certify_reduced_motion(browser, browser_name, base, result["checks"])
                if browser_name == "chromium": certify_mode_isolation(browser, base, result["checks"])
                browser.close()
        result["success"] = True
        print(f"PASS: {len(result['checks'])} UI7 Boss gameplay checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui7-boss-gameplay.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
