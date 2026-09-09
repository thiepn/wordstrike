"""UI6 Endless gameplay browser certification.

Exercises the real Endless shell/renderer, then pauses the loop only inside the harness so
presentation states can be certified deterministically without changing production mechanics.
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
ARTIFACTS = ROOT / "browser-artifacts" / "ui6-endless-gameplay"

SEED = """(() => {
  for (const [id, version] of Object.entries({
    general:3, campaign:1, typing:1, endless:1, boss:1, leaderboards:1, 'arcade-rush':1
  })) localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
  localStorage.setItem('wordstrike_save', JSON.stringify({
    currentFurthestLevel: 20,
    levels:{1:{grade:'A',bestWPM:82,bestAccuracy:98,bestScore:4000,completed:true}},
    settings:{strictMode:false,particles:true,screenShake:true,speedTestTimerPosition:'center',speedTestFontSize:'auto'}
  }));
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def open_endless(page, base, seed):
    page.goto(f"{base}?seed={seed}")
    page.locator('[data-action="modes"]').click()
    expect(page.locator('.mode-screen')).to_be_visible()
    page.locator('[data-mode-id="endless"]').click()
    expect(page.locator('.endless-ready-screen')).to_be_visible()
    page.locator('[data-action="endless-start"]').click()
    expect(page.locator('.endless-gameplay-screen')).to_be_visible(timeout=8000)
    expect(page.locator('.endless-gameplay-hud')).to_be_visible()
    expect(page.locator('.endless-core')).to_be_visible()


def seed_scene(page):
    page.evaluate("""async () => {
      const endless = await import('./js/endlessMode.js');
      const renderer = await import('./js/renderer.js');
      const ui = await import('./js/ui.js');
      endless.stopEndlessLoop();
      const game = endless.getCurrentEndless();
      const area = document.querySelector('#play-area');
      const cx = area.clientWidth / 2;
      const cy = area.clientHeight / 2;
      game.coreX = cx;
      game.coreY = cy;
      game.stage = 7;
      game.highestStage = 7;
      game.stageWordsCompleted = 8;
      game.totalWordsCompleted = 48;
      game.completedWordCount = 48;
      game.integrity = 1;
      game.elapsedMs = 75432;
      game.finalRollingWpm = 92;
      game.peakWpm = 101;
      game.combo = 14;
      game.score = 123456;
      game.difficulty = {...game.difficulty, activeWordCap: 8};
      game.activeTargetId = 9002;
      game.targetingState = {mode:'locked', prefix:'si', candidateIds:[9002], activeTargetId:9002, startedAtActiveMs:74000};
      const make = (id, text, typedIndex, x, y) => ({
        id, text, typedIndex, x, y, separationX:0, separationY:0,
        coreArrivalProcessed:false, missedCharactersRecorded:false
      });
      game.words = [
        make(9001, 'breach', 0, cx + 42, cy + 28),
        make(9002, 'signal', 2, cx - 260, cy - 130),
        make(9003, 'survive', 0, cx + 250, cy + 120),
        make(9004, 'tempo', 0, cx - 320, cy + 150),
        make(9005, 'focus', 0, cx + 300, cy - 160),
        make(9006, 'control', 0, cx - 180, cy + 190),
      ];
      renderer.clearWordElements();
      for (const word of game.words.slice(0, 3)) renderer.createWordElement(word);
      renderer.updateWordElement(game.words[0], false);
      renderer.updateWordElement(game.words[1], true);
      renderer.updateWordElement(game.words[2], false, {candidate:true, prefixLength:2});
      ui.updateEndlessHud(game);
      const banner = document.querySelector('#endless-stage-banner');
      banner.hidden = false;
      banner.textContent = 'STAGE 7';
      window.__ui6 = {endless, renderer, game};
    }""")
    page.wait_for_timeout(120)


def snapshot(page):
    return page.evaluate("""() => {
      const screen = document.querySelector('.endless-gameplay-screen');
      const hud = document.querySelector('.endless-gameplay-hud');
      const play = document.querySelector('#play-area');
      const core = document.querySelector('.endless-core');
      const progress = document.querySelector('[data-endless-stage-progress]');
      const trigger = document.querySelector('.endless-keyboard-trigger');
      const survivalMetric = document.querySelector('.endless-hud-survival');
      const pressureMetric = document.querySelector('.endless-hud-pressure');
      const triggerStyle = trigger ? getComputedStyle(trigger) : null;
      const triggerBox = trigger?.getBoundingClientRect();
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screenOverflow: screen.scrollWidth - screen.clientWidth,
        hudHeight: hud.getBoundingClientRect().height,
        playHeight: play.clientHeight,
        stageTier: screen.dataset.endlessStageTier,
        pressureTier: screen.dataset.endlessPressure,
        integrity: screen.dataset.endlessIntegrity,
        coreLabel: core.getAttribute('aria-label'),
        wpm: document.querySelector('[data-endless-wpm]')?.textContent,
        combo: document.querySelector('[data-endless-combo]')?.textContent,
        survival: document.querySelector('[data-endless-survival]')?.textContent,
        pressure: document.querySelector('[data-endless-pressure-value]')?.textContent,
        target: document.querySelector('[data-endless-target-state]')?.textContent,
        progressNow: progress?.getAttribute('aria-valuenow'),
        progressText: progress?.getAttribute('aria-valuetext'),
        progressHeight: progress?.getBoundingClientRect().height || 0,
        imminent: document.querySelectorAll('.endless-word-imminent').length,
        activeBoxes: getComputedStyle(document.querySelector('.word-visual.active')).borderTopWidth,
        bannerText: document.querySelector('#endless-stage-banner')?.textContent,
        survivalMetricHeight: survivalMetric?.getBoundingClientRect().height || 0,
        pressureMetricHeight: pressureMetric?.getBoundingClientRect().height || 0,
        keyboardText: trigger?.textContent?.trim() || null,
        keyboardDisplay: triggerStyle?.display || null,
        keyboardHeight: triggerBox?.height || 0,
      };
    }""")


def certify_desktop(browser, browser_name, base, evidence):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    open_endless(page, base, 701)
    seed_scene(page)
    state = snapshot(page)
    assert state["docOverflow"] <= 1 and state["screenOverflow"] <= 1, state
    assert state["playHeight"] > 600, state
    assert state["stageTier"] == "mid", state
    assert state["pressureTier"] == "high", state
    assert state["integrity"] == "1", state
    assert state["coreLabel"] == "Endless Core, integrity 1 of 3", state
    assert state["wpm"] == "92", state
    assert state["combo"] == "14", state
    assert state["survival"] == "01:15", state
    assert state["pressure"] == "6 / 8", state
    assert state["target"] == "TARGET LOCKED", state
    assert state["progressNow"] in {"53", "54"}, state
    assert "8 of 15 words completed in stage 7" in state["progressText"], state
    assert state["imminent"] >= 1, state
    assert state["activeBoxes"] == "0px", state
    assert state["bannerText"] == "STAGE 7", state
    assert state["keyboardDisplay"] == "none", state

    transient = page.evaluate("""() => {
      const visual = document.querySelector('[data-word-id="9002"] .word-visual');
      window.__ui6.renderer.flashWrong(9002);
      const wrong = {hasClass: visual.classList.contains('wrong'), animationName: getComputedStyle(visual).animationName};
      const area = document.querySelector('#play-area');
      window.__ui6.renderer.flashDamage(false);
      return {wrong, damageClass: area.classList.contains('damage-flash')};
    }""")
    assert transient["wrong"]["hasClass"] is True, transient
    assert "endless-word-error" in transient["wrong"]["animationName"], transient
    assert transient["damageClass"] is True, transient

    evidence.append({"browser": browser_name, "case": "desktop deterministic", **state, "transient": transient})
    context.close()


def certify_mobile(browser, browser_name, base, evidence):
    context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    open_endless(page, base, 702)
    seed_scene(page)
    state = snapshot(page)
    assert state["docOverflow"] <= 1 and state["screenOverflow"] <= 1, state
    assert state["playHeight"] > 500, state
    assert state["keyboardText"] == "KEYBOARD", state
    assert state["keyboardDisplay"] != "none", state
    assert state["keyboardHeight"] >= 44, state
    assert state["wpm"] == "92", state
    assert state["pressureTier"] == "high", state

    if browser_name == "chromium":
        page.set_viewport_size({"width": 390, "height": 360})
        page.wait_for_timeout(100)
        short = snapshot(page)
        assert short["docOverflow"] <= 1 and short["screenOverflow"] <= 1, short
        assert short["playHeight"] >= 180, short
        assert short["keyboardDisplay"] != "none", short
        assert short["keyboardHeight"] >= 44, short
        assert short["survivalMetricHeight"] <= 2, short
        assert short["pressureMetricHeight"] <= 2, short
        assert short["progressHeight"] >= 2, short
        evidence.append({"browser": browser_name, "case": "390x360", **short})

    evidence.append({"browser": browser_name, "case": "mobile", **state})
    context.close()


def certify_reduced_motion(browser, browser_name, base, evidence):
    context = browser.new_context(viewport={"width": 1280, "height": 720}, reduced_motion="reduce")
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    open_endless(page, base, 703)
    seed_scene(page)
    page.evaluate("""() => {
      const area = document.querySelector('#play-area');
      window.__ui6AnimateCalls = 0;
      area.animate = () => { window.__ui6AnimateCalls += 1; return {cancel(){}}; };
      window.__ui6.renderer.flashDamage(true);
    }""")
    calls = page.evaluate("window.__ui6AnimateCalls")
    radar_animation = page.locator('.endless-core-radar-a').evaluate("el => getComputedStyle(el).animationName")
    wrong_state = page.evaluate("""() => {
      const el = document.querySelector('[data-word-id="9002"] .word-visual');
      window.__ui6.renderer.flashWrong(9002);
      return {transform:getComputedStyle(el).transform, animation:getComputedStyle(el).animationName};
    }""")
    assert calls == 0, calls
    assert radar_animation == "none", radar_animation
    assert wrong_state["transform"] == "none", wrong_state
    evidence.append({"browser": browser_name, "case": "reduced motion", "animateCalls": calls, "radarAnimation": radar_animation, "wrong": wrong_state})
    context.close()


def certify_campaign_isolation(browser, base, evidence):
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    context.add_init_script(SEED)
    local_only(context, base)
    page = context.new_page()
    page.goto(f"{base}?seed=704")
    page.locator('[data-action="modes"]').click()
    page.locator('[data-mode-id="campaign"]').click()
    expect(page.locator('.campaign-progress-screen')).to_be_visible()
    page.locator('[data-level="1"]').click()
    expect(page.locator('.campaign-gameplay-screen')).to_be_visible()
    assert page.locator('.endless-gameplay-screen').count() == 0
    assert page.locator('.endless-gameplay-hud').count() == 0
    evidence.append({"browser": "chromium", "case": "campaign isolation", "endlessPresentationNodes": 0})
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
                certify_desktop(browser, browser_name, base, result["checks"])
                certify_mobile(browser, browser_name, base, result["checks"])
                certify_reduced_motion(browser, browser_name, base, result["checks"])
                if browser_name == "chromium": certify_campaign_isolation(browser, base, result["checks"])
                browser.close()
        result["success"] = True
        print(f"PASS: {len(result['checks'])} UI6 Endless gameplay checks across Chromium and Firefox.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "ui6-endless-gameplay.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
