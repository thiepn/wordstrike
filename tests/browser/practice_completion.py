"""Canonical Practice controller journeys; static localhost assets, real IndexedDB and input."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'browser-artifacts'/'practice-completion'
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if self.path=='/practice-harness.html':
            css=''.join(f'<link rel="stylesheet" href="/{p.name}">' for p in ROOT.glob('practiceLab*.css'))
            body=('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Practice journeys</title>'+css+'<body><div id="app"></div></body></html>').encode()
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(body)
        else: super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),lambda *a,**k:Handler(*a,directory=str(ROOT),**k));Thread(target=server.serve_forever,daemon=True).start()
OUT.mkdir(parents=True,exist_ok=True)
report=[]
try:
 with sync_playwright() as p:
  for name,kind in [('chromium',p.chromium),('firefox',p.firefox),('webkit',p.webkit)]:
   browser=kind.launch()
   try:
    for width,height in [(1280,900),(390,844)]:
     context=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
     page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(f'http://127.0.0.1:{server.server_port}/practice-harness.html')
     page.evaluate('''async()=>{const [{createPracticeLabController},{createPracticeFeatureGate},{createPracticeExperimentRegistry}]=await Promise.all([import('/js/practiceLab/practiceLabController.js'),import('/js/practiceLab/practiceFeatureGate.js'),import('/js/practiceLab/practiceExperimentRegistry.js')]);const gate=createPracticeFeatureGate({developerMode:true});window.lab=createPracticeLabController({root:document.querySelector('#app'),featureGate:gate,experimentRegistry:createPracticeExperimentRegistry({featureGate:gate})});lab.mount();}''')
     page.locator('[data-route="skill-map"]').click();page.get_by_text('No skill evidence yet',exact=True).wait_for();page.screenshot(path=str(OUT/f'{name}-{width}-skills.png'))
     page.locator('[data-practice-action="back"]').click();page.locator('[data-route="review-queue"]').click();page.get_by_text('No reviews scheduled',exact=True).wait_for()
     page.locator('[data-practice-action="back"]').click();page.locator('[data-route="progress"]').click();page.get_by_text('No training history',exact=True).wait_for()
     page.evaluate("lab.navigate({name:'experiment-detail',params:{experimentId:'full-assessment'}})")
     page.locator('[data-practice-action="start-assessment"][data-assessment-depth="quick"]:enabled').wait_for()
     page.screenshot(path=str(OUT/f'{name}-{width}-assessment.png'))
     page.locator('[data-practice-action="start-assessment"][data-assessment-depth="quick"]').click();page.locator('[data-assessment-action="next"]').click();page.locator('[data-assessment-input]').wait_for()
     page.locator('[data-assessment-input]').press_sequentially('A short browser test',delay=20)
     assert page.locator('[data-assessment-text] span').count()<=500
     page.locator('[data-assessment-action="exit"]').click();page.locator('[data-practice-action="start-assessment"]').first.wait_for()
     page.evaluate("lab.navigate({name:'experiment-detail',params:{experimentId:'real-text'}})")
     page.locator('[data-practice-action="start-real-text-natural"]:enabled').wait_for()
     page.locator('[data-practice-action="start-real-text-natural"]').click();page.locator('[data-real-text-input]').wait_for();page.locator('[data-real-text-input]').press_sequentially('Natural text',delay=20)
     assert page.locator('.practice-real-text-char').count()<=680
     page.locator('[data-real-text-session-action="stop"]').click()
     page.evaluate("lab.navigate({name:'experiment-detail',params:{experimentId:'pace-ladder'}})");page.get_by_text('Reference',exact=True).wait_for()
     overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
     assert not overflow, f'{name} {width} horizontal overflow'
     assert not errors, errors
     page.evaluate('lab.unmount()')
     report.append({'browser':name,'viewport':[width,height],'status':'PASS','errors':errors,'horizontalOverflow':overflow})
     context.close()
   finally: browser.close()
finally:
 server.shutdown();(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
