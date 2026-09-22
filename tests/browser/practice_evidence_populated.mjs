import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-evidence-populated');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  if(req.url==='/harness'){
    res.setHeader('Content-Type','text/html');
    const css=fs.readdirSync(root).filter(name=>/^practiceLab.*\.css$/.test(name)).map(name=>`<link rel="stylesheet" href="/${name}">`).join('');
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css">${css}<body><div id="app"></div></body></html>`);
    return;
  }
  const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
  try{
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
    res.end(fs.readFileSync(file));
  }catch{res.statusCode=404;res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));

const browser=await chromium.launch();
const report=[];
try{
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/harness`);

    await page.evaluate(async()=>{
      const [{renderPracticeEvidenceView},{buildPracticeTreatmentResponseViewModel},{renderPracticeTreatmentResponseProgress}]=await Promise.all([
        import('/js/practiceLab/practiceEvidenceViews.js'),
        import('/js/practiceLab/practiceTreatmentResponseViewModel.js'),
        import('/js/practiceLab/practiceLabRendererCurrent.js'),
      ]);
      const app=document.querySelector('#app');
      const skill={
        statId:'practice-stat_phase1',entityType:'key',entityKey:'e',priority:80,
        confidenceLevel:'high',confidenceScore:82,masteryState:'learning',
        lastObservedAt:'2026-09-20T12:00:00.000Z',
        evidence:{
          opportunities:{count:20,correctCount:18,errorCount:2,directTargetedCount:20,incidentalCount:0},
          timing:{fluentLatency:{count:12,meanMs:145.2,m2:0,minMs:100,maxMs:200,recentSamples:[]}},
        },
      };
      window.__phase1={
        renderSkill(){renderPracticeEvidenceView(app,'skill-map',{status:'ready',page:0,skills:[skill],reviews:[],sessions:[]});},
        renderReview(){renderPracticeEvidenceView(app,'review-queue',{status:'ready',page:0,skills:[],sessions:[],reviews:[{
          reviewItemId:'practice-review_phase1',entityType:'key',entityKey:'e',state:'active',
          dueAtUtc:'2020-01-03T00:00:00.000Z',minimumMatureAtUtc:'2020-01-02T00:00:00.000Z',
          intervalDays:1,cycle:{referenceAtUtc:'2020-01-01T00:00:00.000Z'},
          retention:{status:'verified',lastOutcome:'retained'},suspensionReason:null,
        }]});},
        renderHistory(){renderPracticeEvidenceView(app,'history',{status:'ready',page:0,skills:[],reviews:[],sessions:[{
          sessionId:'practice-session_phase1',experimentId:'weak-keys',status:'completed',
          completedAtUtc:'2026-09-20T12:00:00.000Z',wpm:72.4,accuracy:96.5,
          afterMetrics:{wpm:999,firstPassAccuracy:.8,accuracy:.8},
        }]});},
        renderTreatment(){
          const view=buildPracticeTreatmentResponseViewModel({
            states:[{
              treatmentResponseStateId:'response-1',profileId:'profile-1',contextId:'context-1',
              responseModelVersion:1,treatmentFamilyKey:'weak-keys:family',targetEntityType:'key',
              outcomeKey:'same-protocol-retest',delayBucket:'next-day',responseUnit:'quality-points',
              updatedAt:'2026-09-20T12:00:00.000Z',
              summary:{count:5,median:6.5,mad:1.2,positiveCount:4,negativeCount:0,deadbandCount:1,distinctDays:4,distinctTargets:2,manualCount:3,coachCount:2,contaminatedEpisodeCount:1,responsePattern:'positive-signal',evidenceDepth:'medium',practicalThreshold:5,hybridOnly:false},
            }],
            episodes:[{
              treatmentEpisodeId:'episode-1',assignmentKind:'manual',status:'closed',createdAt:'2026-09-18T10:00:00.000Z',updatedAt:'2026-09-20T12:00:00.000Z',
              treatment:{treatmentFamilyKey:'weak-keys:family',experimentId:'weak-keys',protocolVariant:'one-dose',targetEntityType:'key',targetEntityKey:'e',completedAt:'2026-09-18T10:10:00.000Z'},
              outcomes:[{outcomeKey:'same-protocol-retest',status:'observed'},{outcomeKey:'retention-review',status:'contaminated'}],
            }],
          });
          renderPracticeTreatmentResponseProgress(app,view);
        },
      };
    });

    const certify=async(name,action,checks,{openDetails=false}={})=>{
      await page.evaluate(action=>window.__phase1[action](),action);
      if(openDetails){
        const details=page.locator('details').first();
        await details.waitFor({state:'visible'});
        await details.evaluate(node=>{node.open=true;});
      }
      for(const check of checks)await page.getByText(check,{exact:false}).first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,`${name} overflows horizontally at ${width}px`);
      await page.screenshot({path:path.join(out,`${width}-${name}.png`),fullPage:true});
    };
    await certify('skill-map','renderSkill',['90%','145.2 ms','high confidence','learning'],{openDetails:true});
    await certify('review-queue','renderReview',['overdue','verified','retained'],{openDetails:true});
    await certify('history','renderHistory',['72.4 WPM','96.5% accuracy']);
    assert.equal(await page.getByText(/999 WPM|0\.8% accuracy/).count(),0,'History must not expose probe metrics as session metrics');
    await certify('treatment-response','renderTreatment',['Positive observed signal','+6.5 quality pts','Medium']);

    assert.deepEqual(errors,[]);
    report.push({width,status:'PASS',views:['skill-map','review-queue','history','treatment-response']});
    await context.close();
  }
}finally{
  await browser.close();server.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
}
assert.equal(report.length,2);
console.log(JSON.stringify(report));
