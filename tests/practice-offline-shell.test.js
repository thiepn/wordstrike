import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const sandbox={self:{addEventListener(){}}};
vm.runInNewContext(source+'\nglobalThis.shell = APP_SHELL;',sandbox);
const shell=new Set(sandbox.shell);
assert.equal(shell.size,sandbox.shell.length,'No duplicate precache entries');
for(const entry of shell)assert.ok(fs.existsSync(path.join(root,entry.split('?')[0])),`Missing precache file: ${entry}`);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [,url] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
 if(url.startsWith('http')||url.startsWith('#')||!fs.existsSync(path.join(root,url.split('?')[0])))continue;
 assert.ok(shell.has('./'+url.replace(/^\.\//,'')),`Startup URL missing from offline shell: ${url}`);
}
for(const folder of ['js','styles']){
 for(const entry of fs.readdirSync(path.join(root,folder),{recursive:true})){
  if(!/\.(js|css)$/.test(entry))continue;
  assert.ok(shell.has(`./${folder}/${entry}`),`Runtime file missing from offline shell: ${folder}/${entry}`);
 }
}
for(const name of ['WS-READAHEAD-EN-1.forms.json','WS-READAHEAD-EN-1.manifest.json'])assert.ok(shell.has(`./data/practice/read-ahead/en-v1/${name}`));
console.log('Offline shell covers exact startup URLs, runtime modules/styles, and Read-Ahead content.');
