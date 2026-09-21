import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { chromium } from "playwright";

const root=path.resolve(import.meta.dirname,"../..");
const out=path.join(root,"browser-artifacts/practice-pwa-upgrade");
fs.mkdirSync(out,{recursive:true});
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
const baseSw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
let revision=1;

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/__upgrade"){
    revision=2;
    res.setHeader("Cache-Control","no-store");
    res.end("ok");
    return;
  }
  if(revision===2&&url.pathname==="/data/practice/research-holdout/en-v1.json"){
    res.writeHead(404);
    res.end();
    return;
  }
  if(url.pathname==="/sw.js"){
    const nextName='const CACHE_NAME = CACHE_PREFIX + "phase7-upgrade-r'+revision+'";';
    const source=baseSw.replace(/const CACHE_NAME = CACHE_PREFIX \+ "[^"]+";/,nextName);
    res.setHeader("Content-Type","text/javascript");
    res.setHeader("Cache-Control","no-store");
    res.end(source);
    return;
  }
  let file=path.resolve(root,"."+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){
    res.writeHead(403);res.end();return;
  }
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,"index.html");
  try{
    res.setHeader("Content-Type",mime[path.extname(file)]??"application/octet-stream");
    res.end(fs.readFileSync(file));
  }catch{
    res.writeHead(404);res.end();
  }
}).listen(0,"127.0.0.1");
await new Promise(resolve=>server.once("listening",resolve));

const profileDir=fs.mkdtempSync(path.join(os.tmpdir(),"wordstrike-phase7-pwa-"));
const report={status:"FAIL",checks:[]};
const check=value=>{report.checks.push(value);console.log(value);};
let context=null;

try{
  context=await chromium.launchPersistentContext(profileDir,{headless:true,serviceWorkers:"allow"});
  await context.addInitScript(()=>localStorage.setItem("wordstrike.onboarding.general.v3","seen"));
  let page=await context.newPage();
  page.setDefaultTimeout(30000);
  const base="http://127.0.0.1:"+server.address().port+"/";
  await page.goto(base,{waitUntil:"domcontentloaded"});

  await page.evaluate(async()=>{
    await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller){
      await new Promise(resolve=>navigator.serviceWorker.addEventListener("controllerchange",resolve,{once:true}));
    }
  });
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.waitForFunction(async()=> (await caches.keys()).includes("wordstrike-pwa-phase7-upgrade-r1"),null,{timeout:60000});
  check("revision 1 installed and controls the page");

  const saved=await page.evaluate(async()=>{
    const mod=await import("./js/practiceLab/practiceCustomTextRuntime.js");
    const runtime=mod.createPracticeCustomTextRuntime();
    const workspace=await runtime.getWorkspaceState();
    const record=await runtime.createCustomText({
      title:"Phase 7 durable note",
      sourceText:"This local text must survive a service-worker upgrade.",
      dataLocale:workspace.dataLocale,
    });
    runtime.close();
    return {customTextId:record.customTextId,profileId:workspace.profileId,sourceText:record.sourceText};
  });
  check("durable IndexedDB Practice data created before upgrade");

  await page.evaluate(()=>fetch("./__upgrade",{cache:"no-store"}));
  await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    await reg.update();
  });
  await page.waitForFunction(async()=>{
    const keys=await caches.keys();
    return keys.includes("wordstrike-pwa-phase7-upgrade-r2")&&!keys.includes("wordstrike-pwa-phase7-upgrade-r1");
  },null,{timeout:60000});
  check("revision 2 activated despite one optional precache asset returning 404");

  const after=await page.evaluate(async id=>{
    const mod=await import("./js/practiceLab/practiceCustomTextRuntime.js");
    const runtime=mod.createPracticeCustomTextRuntime();
    const record=await runtime.getCustomText(id);
    runtime.close();
    return record;
  },saved.customTextId);
  assert.equal(after?.sourceText,saved.sourceText);
  assert.equal(after?.profileId,saved.profileId);
  check("IndexedDB Practice data survived service-worker replacement");

  await context.close();
  context=await chromium.launchPersistentContext(profileDir,{headless:true,serviceWorkers:"allow"});
  await context.setOffline(true);
  page=await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator(".menu-screen").waitFor();
  await page.locator('[data-action="modes"]').click();
  await page.locator('button[data-mode-id="practice"]').click();
  await page.locator(".pl-studio-home").waitFor();

  const offlineRecord=await page.evaluate(async id=>{
    const mod=await import("./js/practiceLab/practiceCustomTextRuntime.js");
    const runtime=mod.createPracticeCustomTextRuntime();
    const record=await runtime.getCustomText(id);
    runtime.close();
    return record;
  },saved.customTextId);
  assert.equal(offlineRecord?.sourceText,saved.sourceText);
  check("upgraded app shell survives browser restart, boots offline and reads pre-upgrade Practice data");

  report.status="PASS";
  await page.screenshot({path:path.join(out,"upgrade-offline.png"),fullPage:true});
  await context.close();
  context=null;
}catch(error){
  report.error=String(error);
  throw error;
}finally{
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(context) await context.close().catch(()=>{});
  fs.rmSync(profileDir,{recursive:true,force:true});
  server.close();
}
