import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium, webkit } from "playwright";

const root=path.resolve(import.meta.dirname,"../..");
const out=path.join(root,"browser-artifacts/practice-device-acceptance");
fs.mkdirSync(out,{recursive:true});
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,"index.html");
  try{res.setHeader("Content-Type",mime[path.extname(file)]??"application/octet-stream");res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
}).listen(0,"127.0.0.1");
await new Promise(resolve=>server.once("listening",resolve));

const browserName=process.env.PRACTICE_BROWSER??"chromium";
const browser=await ({chromium,webkit}[browserName]).launch();
const report={browser:browserName,status:"FAIL",checks:[]};
const check=value=>{report.checks.push(value);console.log(value);};

try{
  const ua=browserName==="webkit"
    ?"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
    :"Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36";
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    hasTouch:true,
    isMobile:true,
    userAgent:ua,
    serviceWorkers:"block",
  });
  await context.addInitScript(()=>localStorage.setItem("wordstrike.onboarding.general.v3","seen"));
  const page=await context.newPage();
  page.setDefaultTimeout(30000);
  const base="http://127.0.0.1:"+server.address().port+"/";
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator('[data-action="modes"]').click();
  await page.locator('button[data-mode-id="practice"]').click();
  await page.locator(".pl-studio-home").waitFor();

  const manifest=await page.evaluate(async()=>await (await fetch("./manifest.webmanifest")).json());
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.orientation,"any");
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content"),"yes");
  check("standalone metadata supports portrait and landscape mobile use");

  const topTargets=await page.locator(".pl-topbar-actions button").evaluateAll(nodes=>nodes.map(node=>{
    const rect=node.getBoundingClientRect();
    return {w:rect.width,h:rect.height,text:node.textContent.trim()};
  }));
  assert.deepEqual(topTargets.filter(item=>item.w<44||item.h<44),[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  check("portrait Studio has 44px controls and no page-level overflow");

  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(80);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  assert.equal(await page.locator(".pl-navigation").count(),1);
  check("orientation change keeps Studio navigation usable");

  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-lab-drill="problem-words"] button').click();
  await page.locator("[data-problem-word-target]").fill("the");
  await page.locator('[data-practice-action="start-problem-words"]:enabled').click();

  const input=page.locator("[data-problem-words-input]");
  await input.waitFor({state:"visible"});
  assert.equal(await input.getAttribute("inputmode"),"text");
  assert.equal(await input.getAttribute("autocapitalize"),"off");
  assert.equal(await input.getAttribute("autocorrect"),"off");
  check("typing capture exposes software-keyboard-safe attributes");

  await page.keyboard.type("x");
  await page.keyboard.press("Backspace");

  const hidden=await page.evaluate(()=>{
    window.__phase7Visibility="hidden";
    try{
      Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.__phase7Visibility});
    }catch{}
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  });
  assert.equal(hidden,"hidden");
  await page.getByRole("button",{name:"RESUME",exact:true}).waitFor();
  assert.match(await page.locator(".practice-lab-screen").innerText(),/Paused/i);
  check("ordinary target practice pauses when backgrounded");

  const visible=await page.evaluate(()=>{
    window.__phase7Visibility="visible";
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  });
  assert.equal(visible,"visible");
  assert.equal(await page.getByRole("button",{name:"RESUME",exact:true}).count(),1);
  check("foreground return does not auto-resume ordinary target practice");

  await page.setViewportSize({width:844,height:390});
  assert.equal(await page.locator("[data-problem-words-input]").count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:"RESUME",exact:true}).click();
  await page.locator("[data-problem-words-input]").waitFor();
  assert.ok(await input.evaluate(node=>node===document.activeElement));
  check("session survives background and orientation changes, then resumes explicitly");

  report.status="PASS";
  await page.screenshot({path:path.join(out,browserName+"-portrait.png"),fullPage:false});
  await context.close();
}catch(error){
  report.error=String(error);
  throw error;
}finally{
  fs.writeFileSync(path.join(out,browserName+"-report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  await browser.close();
  server.close();
}
