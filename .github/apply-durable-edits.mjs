import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_REF_NAME,'fix/practice-durable-storage');
const edits=JSON.parse(fs.readFileSync('.github/durable-edits.json','utf8'));
const hash=text=>crypto.createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
const staged=[];
for(const item of edits){
 assert.ok(/^(js\/practiceLab\/|tests\/|sw\.js$)/.test(item.path)&&!item.path.includes('..'));
 const before=fs.readFileSync(item.path,'utf8');assert.equal(hash(before),item.before,`Unexpected source: ${item.path}`);
 const lines=before.match(/[^\n]*\n|[^\n]+$/g)??[];
 for(const [start,end,text] of [...item.edits].sort((a,b)=>b[0]-a[0]))lines.splice(start,end-start,text);
 const after=lines.join('');assert.equal(hash(after),item.after,`Unexpected result: ${item.path}`);staged.push([item.path,after]);
}
for(const [file,content] of staged){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);console.log(file,hash(content));}
fs.unlinkSync('.github/durable-edits.json');fs.unlinkSync('.github/apply-durable-edits.mjs');
