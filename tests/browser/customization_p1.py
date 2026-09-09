"""P1 appearance regression matrix. Static frontend; external requests blocked.

Run against both real browser engines. BASELINE_DIR optionally enables byte-for-byte
screenshots against the pre-customization release, using the same browser/fonts.
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
ARTIFACTS = ROOT / "browser-artifacts" / "customization-p1"
THEMES = {"wordstrike": "#0a0e14", "oled": "#000000", "midnight": "#080e20", "monochrome": "#111111"}
ACCENTS = {"cyan": "#00fff2", "blue": "#70a7ff", "violet": "#b2a0ff", "magenta": "#ff80cf", "orange": "#ffb470", "green": "#70e1b2"}
SEED = """(() => {
 for (const [id,version] of Object.entries({general:3,campaign:1,typing:1,endless:1,boss:1,leaderboards:1,'arcade-rush':1}))
  localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
 if (!localStorage.getItem('wordstrike_save')) localStorage.setItem('wordstrike_save', JSON.stringify({
  currentFurthestLevel:10,levels:{1:{grade:'A',bestAccuracy:97,bestWPM:72,bestScore:4000}},
  settings:{screenShake:false,particles:false,strictMode:false,soundEffects:false,speedTestTimerPosition:'top',speedTestFontSize:'large'}
 }));
})();"""

class Quiet(SimpleHTTPRequestHandler):
 def log_message(self, *_args): pass

def server_for(root):
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
 Thread(target=server.serve_forever,daemon=True).start()
 return server,f'http://127.0.0.1:{server.server_port}/'

def context_for(browser,base,width=1440,height=900):
 context=browser.new_context(viewport={"width":width,"height":height})
 context.add_init_script(SEED)
 context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base) else route.abort())
 return context

def open_title(page,base):
 page.goto(base+'?seed=711')
 expect(page.locator('.title-screen')).to_be_visible(timeout=10000)

def open_settings(page):
 page.locator('[data-action="settings"]').click()
 expect(page.locator('[data-customization-settings]')).to_have_count(1)

def select(page,field,value):
 page.locator(f'[data-appearance-setting="{field}"]').select_option(value)
 attr={'effectsIntensity':'effects'}.get(field,field)
 expect(page.locator('html')).to_have_attribute('data-'+attr,value)

def snapshot(page):
 return page.evaluate("""() => {
 const root=getComputedStyle(document.documentElement);
 const select=document.querySelector('#appearance-theme');
 const style=select ? getComputedStyle(select) : null;
 const accent=document.querySelector('.appearance-preview-state');
 const preview=document.querySelector('.appearance-preview');
 return {
  bg:root.getPropertyValue('--color-bg').trim().toLowerCase(),
  accent:root.getPropertyValue('--color-accent').trim().toLowerCase(),
  danger:root.getPropertyValue('--color-danger').trim(),
  success:root.getPropertyValue('--color-success').trim(),
  warning:root.getPropertyValue('--color-warning').trim(),
  special:root.getPropertyValue('--color-special').trim(),
  overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  selectHeight:select?.getBoundingClientRect().height,
  selectColor:style?.color,selectBackground:style?.backgroundColor,
  accentColor:accent ? getComputedStyle(accent).color : null,
  accentBackground:preview ? getComputedStyle(preview).backgroundColor : null,
  effects:document.documentElement.dataset.effectiveEffects,
 };
 }""")

def contrast(fg,bg):
 import re
 def luminance(rgb):
  channels=[float(x)/255 for x in re.findall(r'[\d.]+',rgb)[:3]]
  linear=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in channels]
  return sum(x*w for x,w in zip(linear,[.2126,.7152,.0722]))
 a,b=sorted([luminance(fg),luminance(bg)])
 return (b+.05)/(a+.05)

def matrix(browser,name,base,checks):
 context=context_for(browser,base);page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 open_title(page,base)
 expect(page.locator('html')).to_have_attribute('data-theme','wordstrike')
 open_settings(page)
 baseline=snapshot(page); semantics={k:baseline[k] for k in ['danger','success','warning','special']}
 for theme,bg in THEMES.items():
  select(page,'theme',theme)
  for accent,color in ACCENTS.items():
   select(page,'accent',accent)
   state=snapshot(page)
   assert state['bg']==bg and state['accent']==color,state
   assert {k:state[k] for k in semantics}==semantics,state
   assert state['overflow']<=1 and state['selectHeight']>=44,state
   assert contrast(state['selectColor'],state['selectBackground'])>=4.5,state
   assert contrast(state['accentColor'],state['accentBackground'])>=4.5,state
   for effects in ['reduced','standard','cinematic']:
    select(page,'effectsIntensity',effects)
    assert page.locator('html').get_attribute('data-effective-effects')==effects
   checks.append({'browser':name,'theme':theme,'accent':accent,'case':'palette + 3 effects + semantics + contrast'})
  select(page,'effectsIntensity','standard')
  if name=='chromium':
   select(page,'accent',{'wordstrike':'cyan','oled':'magenta','midnight':'blue','monochrome':'orange'}[theme])
   page.screenshot(path=str(ARTIFACTS/f'{name}-settings-{theme}.png'),full_page=True,animations='disabled')
 # OS preference wins without overwriting saved Cinematic.
 select(page,'effectsIntensity','cinematic');page.emulate_media(reduced_motion='reduce')
 expect(page.locator('html')).to_have_attribute('data-effective-effects','reduced')
 expect(page.locator('#appearance-effects')).to_have_value('cinematic')
 expect(page.locator('#appearance-motion-note')).to_contain_text('System reduced motion is active')
 page.emulate_media(reduced_motion='no-preference')
 expect(page.locator('html')).to_have_attribute('data-effective-effects','cinematic')
 # Reload and destructive-state isolation.
 select(page,'theme','midnight');select(page,'accent','violet')
 page.reload();expect(page.locator('.title-screen')).to_be_visible()
 expect(page.locator('html')).to_have_attribute('data-theme','midnight')
 open_settings(page)
 before=page.evaluate('JSON.parse(localStorage.wordstrike_save)')
 assert before['currentFurthestLevel']==10 and before['settings']['speedTestFontSize']=='large',before
 assert before['settings']['typingTest']['textSize']=='large',before
 assert before['settings']['particles'] is False and before['settings']['screenShake'] is False,before
 page.locator('[data-reset-appearance]').click()
 after=page.evaluate('JSON.parse(localStorage.wordstrike_save)')
 assert before['levels']==after['levels'] and before['currentFurthestLevel']==after['currentFurthestLevel']
 for k in ['particles','screenShake','strictMode','soundEffects','speedTestFontSize','speedTestTimerPosition','typingTest']:
  assert before['settings'][k]==after['settings'][k],k
 expect(page.locator('#appearance-theme')).to_have_value('wordstrike')
 expect(page.locator('#appearance-accent')).to_have_value('cyan')
 expect(page.locator('#appearance-effects')).to_have_value('standard')
 # Native keyboard selection cannot trigger the old arrow-key Settings router.
 page.locator('#appearance-theme').focus();page.keyboard.press('ArrowDown')
 expect(page.locator('.settings-screen')).to_be_visible()
 expect(page.locator('#appearance-theme')).to_be_focused()
 # Exercise the real Campaign renderer without changing the scoring state.
 select(page,'theme','midnight');select(page,'accent','violet');select(page,'effectsIntensity','reduced')
 page.locator('.settings-screen .screen-back-button').click()
 page.locator('[data-action="modes"]').click();page.locator('[data-mode-id="campaign"]').click()
 expect(page.locator('.campaign-progress-screen')).to_be_visible()
 page.locator('[data-level="1"]').click();expect(page.locator('.campaign-gameplay-screen')).to_be_visible()
 effects_probe=page.evaluate("""async () => {
 const loop=await import('./js/gameLoop.js');loop.stopGameLoop();
 const r=await import('./js/renderer.js');const area=document.querySelector('#play-area');
 let animations=0;area.animate=()=>{animations++;return {}};
 r.flashDamage(true);
 const word={id:999999,text:'focus',typedIndex:0,x:100,y:100};r.createWordElement(word);r.removeWordElement(word,true,true);
 return {animations,bursts:area.querySelectorAll('.burst').length,damage:area.classList.contains('damage-flash')};
 }""")
 assert effects_probe=={'animations':0,'bursts':0,'damage':True},effects_probe
 if name=='chromium':page.screenshot(path=str(ARTIFACTS/'campaign-midnight-violet-reduced.png'),animations='disabled')
 # Changing route to Practice removes palette/effects; returning restores preferences.
 page.evaluate("document.querySelector('#app').innerHTML='<section class=\"screen practice-lab-screen\"><button>Practice probe</button></section>'")
 expect(page.locator('html')).to_have_attribute('data-customization-active','false')
 practice=snapshot(page)
 assert practice['bg']=='#0a0e14' and practice['accent']=='#00fff2',practice
 open_title(page,base)
 expect(page.locator('html')).to_have_attribute('data-customization-active','true')
 expect(page.locator('html')).to_have_attribute('data-accent','violet')
 open_settings(page)
 # Storage failure is visible; the selection still applies for the current visit.
 page.evaluate("Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError')}")
 select(page,'theme','oled')
 expect(page.locator('[data-appearance-status]')).to_contain_text('could not be saved')
 assert not errors,errors
 checks.append({'browser':name,'case':'migration + reload + resets + keyboard + effects precedence + Practice + storage failure'})
 context.close()

def responsive(browser,name,base,checks):
 for w,h in [(360,640),(390,360),(768,1024),(1280,600),(320,720)]:
  context=context_for(browser,base,w,h);page=context.new_page();open_title(page,base);open_settings(page)
  select(page,'theme','oled');select(page,'accent','magenta')
  state=snapshot(page)
  assert state['overflow']<=1 and state['selectHeight']>=44,state
  for control in page.locator('[data-appearance-setting], [data-reset-appearance]').all():
   control.scroll_into_view_if_needed();box=control.bounding_box()
   assert box and box['height']>=44 and box['x']>=-1 and box['x']+box['width']<=w+1,box
  if name=='chromium':
   page.locator('[data-customization-settings]').scroll_into_view_if_needed()
   page.screenshot(path=str(ARTIFACTS/f'settings-{w}x{h}.png'),full_page=True,animations='disabled')
  checks.append({'browser':name,'case':'responsive controls','viewport':[w,h]})
  context.close()

def default_equivalence(browser,name,base,baseline_base,checks):
 if not baseline_base:return
 outputs=[]
 for origin in [baseline_base,base]:
  context=context_for(browser,origin);page=context.new_page();open_title(page,origin)
  # The new preference feature deliberately adds no pixels outside Settings by default.
  title=page.screenshot(animations='disabled',caret='hide')
  page.locator('[data-action="modes"]').click();expect(page.locator('.mode-select-screen')).to_be_visible()
  modes=page.screenshot(animations='disabled',caret='hide')
  page.locator('[data-mode-id="campaign"]').click();expect(page.locator('.campaign-progress-screen')).to_be_visible()
  campaign=page.screenshot(animations='disabled',caret='hide')
  outputs.append([title,modes,campaign]);context.close()
 for i,label in enumerate(['title','mode-select','campaign-route']):
  (ARTIFACTS/f'{name}-default-{label}-before.png').write_bytes(outputs[0][i])
  (ARTIFACTS/f'{name}-default-{label}-after.png').write_bytes(outputs[1][i])
  assert outputs[0][i]==outputs[1][i],f'{name}: default {label} changed pixels'
 checks.append({'browser':name,'case':'default screenshot equivalence','screens':['title','mode-select','campaign-route']})

def main():
 ARTIFACTS.mkdir(parents=True,exist_ok=True)
 server,base=server_for(ROOT);baseline_server=None;baseline_base=None
 if os.getenv('BASELINE_DIR'):
  baseline_server,baseline_base=server_for(Path(os.environ['BASELINE_DIR']))
 result={'sha':os.getenv('GITHUB_SHA'),'success':False,'checks':[]}
 try:
  with sync_playwright() as pw:
   for name in ['chromium','firefox']:
    browser=getattr(pw,name).launch(headless=True)
    default_equivalence(browser,name,base,baseline_base,result['checks'])
    matrix(browser,name,base,result['checks'])
    responsive(browser,name,base,result['checks'])
    browser.close()
  result['success']=True
  print(f"PASS: {len(result['checks'])} P1 browser checks; 144 effect combinations across Chromium and Firefox.",flush=True)
 except Exception:
  result['error']=traceback.format_exc();print(result['error'],flush=True);raise
 finally:
  (ARTIFACTS/'customization-p1.json').write_text(json.dumps(result,indent=2))
  server.shutdown();server.server_close()
  if baseline_server:baseline_server.shutdown();baseline_server.server_close()

if __name__=='__main__':main()
