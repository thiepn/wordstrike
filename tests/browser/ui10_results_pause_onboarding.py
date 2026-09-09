"""UI10 shared Results, Pause, and onboarding browser certification.

Uses the real UI renderers/controllers so visual normalization is checked without replacing
or simulating their result, pause, or tutorial state machines.
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
ARTIFACTS = ROOT / "browser-artifacts" / "ui10-results-pause-onboarding"

SEED_STORAGE = """(() => {
  for (const [id, version] of Object.entries({general:3,campaign:1,typing:1,endless:1,boss:1,leaderboards:1,'arcade-rush':1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def local_only(context, base):
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())


def context_for(browser, base, width=1440, height=900, reduced=False):
    options = {"viewport": {"width": width, "height": height}}
    if reduced:
        options["reduced_motion"] = "reduce"
    context = browser.new_context(**options)
    context.add_init_script(SEED_STORAGE)
    local_only(context, base)
    return context


def open_shell(page, base):
    page.goto(base)
    expect(page.locator("#app")).to_be_attached(timeout=8000)


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")


def mount_campaign_results(page):
    page.evaluate("""async () => {
      const ui = await import('./js/ui.js');
      window.__ui10 = ui;
      window.__ui10Action = null;
      ui.renderResults({
        grade:'A', levelNumber:22, isBoss:false, wpm:84.4, accuracy:97.8,
        maxCombo:31, score:42850, livesRemaining:3, startingLives:5
      }, 0, {
        next:()=>window.__ui10Action='next', retry:()=>window.__ui10Action='retry',
        levels:()=>window.__ui10Action='levels', title:()=>window.__ui10Action='title'
      });
    }""")


def result_snapshot(page, kind):
    selector = {
        "campaign": ".results-panel",
        "typing": ".speed-results-panel",
        "endless": ".endless-results-panel",
        "rush": ".arcade-rush-results-card",
    }[kind]
    return page.evaluate("""({selector,kind}) => {
      const panel = document.querySelector(selector);
      const firstAction = panel?.querySelector('.menu-list .arcade-button, .arcade-rush-actions .arcade-rush-action');
      const style = panel ? getComputedStyle(panel) : null;
      const sizes = kind === 'campaign'
        ? [panel?.querySelector('.grade')]
        : kind === 'typing'
          ? [...panel.querySelectorAll('.speed-result-headline strong')]
          : kind === 'endless'
            ? [...panel.querySelectorAll('.endless-result-headline strong')]
            : [panel?.querySelector('.arcade-rush-result-score'), panel?.querySelector('.arcade-rush-stat strong')];
      return {
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth,
        panelBorder: style?.borderTopWidth,
        panelBackground: style?.backgroundColor,
        firstActionHeight: firstAction?.getBoundingClientRect().height || 0,
        fontSizes: sizes.filter(Boolean).map(el=>parseFloat(getComputedStyle(el).fontSize)),
        actionLabels: [...panel.querySelectorAll('.menu-list .arcade-button, .arcade-rush-actions .arcade-rush-action')].map(el=>el.textContent.trim()),
      };
    }""", {"selector": selector, "kind": kind})


def certify_results(browser, browser_name, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_shell(page, base)

    mount_campaign_results(page)
    campaign = result_snapshot(page, "campaign")
    assert campaign["overflow"] <= 1 and campaign["panelBorder"] == "0px", campaign
    assert campaign["panelBackground"] in {"rgba(0, 0, 0, 0)", "transparent"}, campaign
    assert campaign["fontSizes"][0] >= 64 and campaign["firstActionHeight"] >= 44, campaign
    assert campaign["actionLabels"] == ["NEXT LEVEL", "RETRY", "LEVEL SELECT", "MAIN MENU"], campaign
    page.locator('.results-panel > .menu-list .arcade-button').first.click()
    assert page.evaluate("window.__ui10Action") == "next"

    page.evaluate("""() => {
      window.__ui10.renderSpeedTestResults({
        variantId:'time', wpm:102.4, accuracy:98.7, activeDurationMs:60000,
        characters:{correct:500,incorrect:5,missed:2},
        modeData:{durationSeconds:60,targetWordCount:null,rawWpm:108.1,exactWords:96,incorrectWords:4,extraCharacters:2,backspaces:8,wordDeletes:1}
      }, {newWpmRecord:true,newAccuracyRecord:false}, 0, {
        retry:()=>window.__ui10Action='typing-retry', change:()=>{}, modes:()=>{}, title:()=>{}
      });
    }""")
    typing = result_snapshot(page, "typing")
    assert typing["overflow"] <= 1 and typing["panelBorder"] == "0px", typing
    assert typing["firstActionHeight"] >= 44, typing
    assert len(typing["fontSizes"]) == 3 and typing["fontSizes"][0] > typing["fontSizes"][1] > typing["fontSizes"][2], typing
    assert typing["actionLabels"] == ["RETRY TEST", "NEXT TEST", "MODE SELECT", "MAIN MENU"], typing

    page.evaluate("""() => window.__ui10.renderEndlessResults({
      score:76500,wpm:78.4,accuracy:96.2,
      modeData:{highestStage:12,finalStage:12,survivalTimeMs:184500,wordsCompleted:147,stageProgress:7,
        peakWpm:121.5,finalRollingWpm:86.2,maximumCombo:34,maximumPerfectStreak:18,coreHits:3,coreBreaches:2,
        attemptSeed:991,survivalPoints:20000,wordPoints:41000,stageBonusPoints:15500}
    },0,{select:()=>{}})""")
    endless = result_snapshot(page, "endless")
    assert endless["overflow"] <= 1 and endless["panelBorder"] == "0px", endless
    assert endless["fontSizes"][0] > endless["fontSizes"][1], endless
    assert endless["actionLabels"] == ["RETRY", "MODE SELECT", "MAIN MENU"], endless

    page.evaluate("""async () => {
      const {createArcadeRushDomUiController} = await import('./js/arcadeRush/arcadeRushUi.js');
      window.__rush10 = createArcadeRushDomUiController({root:document.querySelector('#app'),actions:{'play-again':()=>window.__ui10Action='rush-retry'}});
      window.__rush10.renderResults({
        success:true,score:128400,wpm:91.2,accuracy:97.4,activeDurationMs:246000,combo:{maximum:63},
        modeData:{wavesCompleted:6,finalWave:6,integrityRemaining:3,wordPoints:60000,waveClearBonus:26000,perfectWaveBonus:12000,bossBonus:18000,integrityBonus:7000,accuracyBonus:3000,timeBonus:2400}
      },{isPersonalBest:true,leaderboardAvailable:true});
    }""")
    expect(page.locator('.arcade-rush-results-card')).to_be_visible()
    rush = result_snapshot(page, "rush")
    assert rush["overflow"] <= 1 and rush["panelBorder"] == "0px", rush
    assert rush["fontSizes"][0] > rush["fontSizes"][1], rush
    assert rush["actionLabels"] == ["Play Again", "Mode Select", "Main Menu", "View Leaderboard"], rush

    if browser_name == "chromium":
        page.screenshot(path=str(ARTIFACTS / "chromium-rush-results.png"), full_page=True)
    checks.append({"browser":browser_name,"case":"all result families","campaign":campaign,"typing":typing,"endless":endless,"rush":rush})
    assert not errors, errors
    context.close()


def certify_pause(browser, browser_name, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    open_shell(page, base)
    page.evaluate("""async () => {
      const ui = await import('./js/ui.js');
      window.__ui10 = ui;
      window.__ui10Action = null;
      document.querySelector('#app').innerHTML='<section class="screen game-screen"><div class="play-area"></div></section>';
      ui.showPauseOverlay(0,{
        resume:()=>window.__ui10Action='resume',retry:()=>{},modes:()=>{},title:()=>{},select:()=>{}
      });
    }""")
    expect(page.locator('.game-screen > .pause-overlay')).to_be_visible()
    snap = page.evaluate("""() => {
      const panel=document.querySelector('.pause-panel');
      const buttons=[...panel.querySelectorAll('.arcade-button')];
      return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        borderLeft:getComputedStyle(panel).borderLeftWidth,borderTop:getComputedStyle(panel).borderTopWidth,
        labels:buttons.map(x=>x.textContent.trim()),heights:buttons.map(x=>x.getBoundingClientRect().height)};
    }""")
    assert snap["overflow"] <= 1 and snap["borderLeft"] == "0px", snap
    assert snap["labels"] == ["RESUME","RETRY","MODE SELECT","MAIN MENU"], snap
    assert min(snap["heights"]) >= 44, snap
    page.locator('[data-action="resume"]').click()
    assert page.evaluate("window.__ui10Action") == "resume"

    page.evaluate("""() => {
      document.querySelector('#app').innerHTML='<section class="screen speed-test-screen"></section>';
      window.__ui10.showSpeedTestPauseOverlay(0,{resume:()=>{},restart:()=>{},modes:()=>{},title:()=>{},select:()=>{}});
    }""")
    typing_labels = page.locator('.pause-panel .arcade-button').all_text_contents()
    assert [x.strip() for x in typing_labels] == ["RESUME","RESTART TEST","MODE SELECT","MAIN MENU"]

    page.evaluate("""() => {
      document.querySelector('#app').innerHTML='<section class="screen endless-screen"></section>';
      window.__ui10.showEndlessPauseOverlay(0,{resume:()=>{},restart:()=>{},modes:()=>{},title:()=>{},select:()=>{}});
    }""")
    endless_labels = page.locator('.pause-panel .arcade-button').all_text_contents()
    assert [x.strip() for x in endless_labels] == ["RESUME","RESTART","MODE SELECT","MAIN MENU"]

    page.evaluate("""async () => {
      const {createArcadeRushDomUiController}=await import('./js/arcadeRush/arcadeRushUi.js');
      document.querySelector('#app').innerHTML='';
      window.__rushPauseClicks=0;
      window.__rush10=createArcadeRushDomUiController({root:document.querySelector('#app'),actions:{resume:()=>window.__rushPauseClicks++}});
      window.__rush10.renderHud({runState:'paused',phase:'WAVE_2',currentWave:2,score:1200,combo:4,integrity:5});
    }""")
    expect(page.locator('[data-rush-role="pause-overlay"]')).to_be_visible()
    rush_heights = page.locator('[data-rush-role="pause-overlay"] .arcade-rush-action').evaluate_all("els=>els.map(e=>e.getBoundingClientRect().height)")
    assert min(rush_heights) >= 44, rush_heights
    page.locator('[data-rush-action="resume"]').click()
    assert page.evaluate("window.__rushPauseClicks") == 1
    checks.append({"browser":browser_name,"case":"pause families","shared":snap})
    context.close()


def certify_onboarding(browser, browser_name, base, checks):
    context = context_for(browser, base)
    page = context.new_page()
    open_shell(page, base)
    page.evaluate("""async () => {
      const {createOnboardingController}=await import('./js/onboarding.js');
      const {createOnboardingView}=await import('./js/onboardingView.js');
      window.__onboarding10=createOnboardingController();
      window.__onboardingView10=createOnboardingView(window.__onboarding10,{root:document});
      window.__onboarding10.open('general',{source:'help'});
    }""")
    dialog = page.locator('.onboarding-dialog')
    expect(dialog).to_be_visible()
    expect(dialog).to_have_attribute('role','dialog')
    expect(dialog).to_have_attribute('aria-modal','true')
    expect(page.locator('[data-onboarding-action="primary"]')).to_be_focused()
    initial = page.evaluate("""() => ({
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      dialogBorder:getComputedStyle(document.querySelector('.onboarding-dialog')).borderTopWidth,
      closeHeight:document.querySelector('.onboarding-close').getBoundingClientRect().height,
      progress:document.querySelectorAll('.onboarding-progress > span').length,
      active:document.querySelectorAll('.onboarding-progress > span.active').length,
      step:window.__onboarding10.getState().currentStep
    })""")
    assert initial["overflow"] <= 1 and initial["dialogBorder"] != "0px", initial
    assert initial["closeHeight"] >= 44 and initial["progress"] >= 2 and initial["active"] == 1, initial
    page.keyboard.press("ArrowRight")
    assert page.evaluate("window.__onboarding10.getState().currentStep") == initial["step"] + 1
    page.keyboard.press("Escape")
    expect(page.locator('.onboarding-dialog')).to_have_count(0)
    assert page.evaluate("window.__onboarding10.getState()") is None

    if browser_name == "chromium":
        page.evaluate("window.__onboarding10.open('general',{source:'help'})")
        page.screenshot(path=str(ARTIFACTS / "chromium-onboarding.png"), full_page=True)
    checks.append({"browser":browser_name,"case":"onboarding semantics + focus + keyboard","snapshot":initial})
    context.close()


def certify_mobile_and_reduced(browser, browser_name, base, checks):
    if browser_name != "chromium":
        return
    context = context_for(browser, base, 390, 844)
    page = context.new_page()
    open_shell(page, base)
    mount_campaign_results(page)
    normal = result_snapshot(page,"campaign")
    assert normal["overflow"] <= 1 and normal["firstActionHeight"] >= 44, normal
    page.set_viewport_size({"width":390,"height":360})
    page.evaluate("""() => {
      document.querySelector('#app').innerHTML='<section class="screen game-screen"></section>';
      window.__ui10.showPauseOverlay(0,{resume:()=>{},retry:()=>{},modes:()=>{},title:()=>{},select:()=>{}});
    }""")
    short = page.evaluate("""() => ({
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      buttons:[...document.querySelectorAll('.pause-panel .arcade-button')].map(x=>({h:x.getBoundingClientRect().height,b:x.getBoundingClientRect().bottom})),
      scrollHeight:document.querySelector('.pause-overlay').scrollHeight,
      clientHeight:document.querySelector('.pause-overlay').clientHeight
    })""")
    assert short["overflow"] <= 1 and min(x["h"] for x in short["buttons"]) >= 44, short
    page.screenshot(path=str(ARTIFACTS / "chromium-short-pause-390x360.png"), full_page=True)
    context.close()

    reduced_context = context_for(browser, base, 1280, 720, reduced=True)
    reduced_page = reduced_context.new_page()
    open_shell(reduced_page, base)
    reduced_page.evaluate("""async () => {
      const {createOnboardingController}=await import('./js/onboarding.js');
      const {createOnboardingView}=await import('./js/onboardingView.js');
      const c=createOnboardingController(); createOnboardingView(c,{root:document}); c.open('general',{source:'help'});
    }""")
    motion = reduced_page.locator('.onboarding-dialog').evaluate("el=>({animation:getComputedStyle(el).animationName,transition:getComputedStyle(el).transitionDuration})")
    assert motion["animation"] == "none" and motion["transition"] in {"0s","0.001ms"}, motion
    checks.append({"browser":"chromium","case":"mobile short-height + reduced motion","mobile":normal,"short":short,"motion":motion})
    reduced_context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1",0), partial(QuietHandler,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    base=f"http://127.0.0.1:{server.server_port}/"
    result={"sha":os.getenv("GITHUB_SHA"),"checks":[],"success":False}
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium","firefox"):
                browser=getattr(playwright,browser_name).launch(headless=True)
                certify_results(browser,browser_name,base,result["checks"])
                certify_pause(browser,browser_name,base,result["checks"])
                certify_onboarding(browser,browser_name,base,result["checks"])
                certify_mobile_and_reduced(browser,browser_name,base,result["checks"])
                browser.close()
        result["success"]=True
        print(f"PASS: {len(result['checks'])} UI10 shared Results/Pause/Onboarding checks across Chromium and Firefox.",flush=True)
    except Exception:
        result["error"]=traceback.format_exc()
        print(result["error"],flush=True)
        raise
    finally:
        (ARTIFACTS/"ui10-results-pause-onboarding.json").write_text(json.dumps(result,indent=2))
        server.shutdown(); server.server_close()


if __name__ == "__main__":
    main()
