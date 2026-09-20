import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-weak-keys-alphabet');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  try{res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));

const browser=await chromium.launch();
const report={status:'FAIL',letters:[],errors:[]};
try{
  const width=Number(process.env.PRACTICE_WIDTH??1280);
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,serviceWorkers:'block'});
  await context.addInitScript(()=>{
    localStorage.setItem('wordstrike.onboarding.general.v3','seen');
    let i=0;
    for(const size of [131072,32768,8192,2048,512,128,16,1])for(let j=0;j<200;j++){
      try{localStorage.setItem('practice-alphabet-quota-'+i,'q'.repeat(size));i++;}
      catch(error){if(error.name!=='QuotaExceededError')throw error;break;}
    }
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="modes"]').click();
  await page.locator('[data-mode-id="practice"]').click();
  await page.locator('[data-lab-drill="weak-keys"] button').click();
  await page.locator('[data-lab-letter="a"]').waitFor();

  for(const letter of 'abcdefghijklmnopqrstuvwxyz'){
    const button=page.locator(`[data-lab-letter="${letter}"]`);
    const start=page.locator('[data-practice-action="start-weak-keys"]');
    const before=Date.now();
    await button.click();
    await page.waitForFunction(value=>document.querySelector('[data-weak-key-target]')?.value===value,letter);
    await page.waitForTimeout(50);
    try{
      await start.locator(':scope:enabled').waitFor({timeout:30000});
      assert.equal(await button.getAttribute('aria-pressed'),'true');
      report.letters.push({letter,status:'ready',elapsedMs:Date.now()-before});
    }catch(error){
      const notice=await page.locator('.practice-weak-key-detail .practice-lab-notice').last().innerText().catch(()=>'');
      report.letters.push({letter,status:'FAIL',elapsedMs:Date.now()-before,notice});
      throw new Error(`Weak Keys ${letter.toUpperCase()} unavailable: ${notice}\n${error.message}`);
    }
  }

  // Exercise the exact reported B case, including real typing and correction.
  await page.locator('[data-lab-letter="b"]').click();
  await page.locator('[data-practice-action="start-weak-keys"]:enabled').waitFor({timeout:30000});
  await page.locator('[data-practice-action="start-weak-keys"]').click();
  const input=page.locator('[data-weak-keys-input]');await input.waitFor({state:'visible'});
  assert.ok(await input.evaluate(el=>el===document.activeElement),'B session did not receive typing focus');
  await input.evaluate(el=>window.__weakCapture=el);
  let sawVisibleWhitespaceCaret=false;
  for(let i=0;i<40;i++){
    const current=page.locator('.is-current').first();
    await current.waitFor({state:'attached'});
    const raw=await current.textContent();
    const expected=raw.replaceAll('\u00a0',' ');
    if(expected===' '){
      const geometry=await current.evaluate(el=>{
        const rect=el.getBoundingClientRect();
        const passage=el.closest('.practice-weak-key-typing');
        const clip=passage?.getBoundingClientRect();
        const style=getComputedStyle(el);
        return {
          width:rect.width,height:rect.height,top:rect.top,bottom:rect.bottom,
          clipTop:clip?.top??null,clipBottom:clip?.bottom??null,
          display:style.display,minWidth:style.minWidth,minInlineSize:style.minInlineSize,
          scrollTop:passage?.scrollTop??null,scrollHeight:passage?.scrollHeight??null,clientHeight:passage?.clientHeight??null,
          visible:Boolean(clip)&&rect.width>0&&rect.height>0&&rect.bottom>clip.top&&rect.top<clip.bottom,
        };
      });
      assert.ok(geometry.visible,`Active Weak Keys whitespace caret must remain visible: ${JSON.stringify(geometry)}`);
      sawVisibleWhitespaceCaret=true;
    }
    await page.keyboard.insertText(expected);
  }
  assert.equal(sawVisibleWhitespaceCaret,true,'B regression passage must certify at least one active whitespace caret');
  const currentBefore=await page.locator('.is-current').first().textContent();
  await page.keyboard.insertText(currentBefore==='x'?'z':'x');
  await page.keyboard.press('Backspace');
  assert.ok(await input.evaluate(el=>el===window.__weakCapture&&el===document.activeElement),'B typing input was replaced or lost focus');
  const pause=page.locator('[data-weak-keys-session-action="pause"]');
  await pause.click();
  const resume=page.locator('[data-weak-keys-session-action="resume"]');await resume.waitFor();
  assert.ok(await resume.evaluate(el=>el===document.activeElement),'Pause control lost focus to the typing capture');
  await resume.click();
  assert.ok(await input.evaluate(el=>el===document.activeElement),'Resume did not restore typing focus');
  await page.screenshot({path:path.join(out,'weak-keys-b-active.png'),fullPage:true});
  await page.locator('[data-weak-keys-session-action="abandon"]').click();
  await page.locator('[data-practice-action="start-weak-keys"]').waitFor();
  assert.deepEqual(report.errors,[]);
  report.status='PASS';
  await context.close();
} catch(error){
  report.error=String(error);
  throw error;
} finally{
  await browser.close();server.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
assert.equal(report.status,'PASS');
