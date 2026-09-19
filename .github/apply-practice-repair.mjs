import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ts=createRequire(process.cwd()+'/package.json')('typescript');
const base='js/practiceLab/';
const names=['WeakKeys','AccuracyRecovery','CombinationRepair','ProblemWords','CommonWords','CustomText','PaceLadder','BurstSprints','Sustained','SpecialDomain'];
for(const name of names){
 const path=base+`practice${name}SessionHost.js`;
 let source=fs.readFileSync(path,'utf8');
 assert.ok(!source.includes('practiceSessionDom.js'),`${name} already patched`);
 const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const changes=[];
 const visit=node=>{
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&node.left.getText(ast)==='root.innerHTML') changes.push({start:node.getStart(ast),end:node.end,text:`renderPracticeSessionMarkup(root, ${node.right.getText(ast)})`});
  ts.forEachChild(node,visit);
 };
 visit(ast);
 assert.ok(changes.length>0,`${name}: no render sites`);
 for(const change of changes.sort((a,b)=>b.start-a.start)) source=source.slice(0,change.start)+change.text+source.slice(change.end);
 source='import { renderPracticeSessionMarkup, focusPracticeSessionInput } from "./practiceSessionDom.js";\n'+source;
 source=source.replace(/root\.querySelector\?\.\(([^\n;]+?)\)\?\.focus\?\.\(\{ preventScroll: true \}\)/g,(all,selector)=>selector.includes('-input')?`focusPracticeSessionInput(root, ${selector})`:all);
 source=source.replace(/else if \(action === "resume"\) void engine\.resume\(\);/g,'else if (action === "resume") void engine.resume().then(() => focusPracticeSessionInput(root, "[data-practice-session-capture]", { force: true }));');
 if(name==='CustomText'){
  source=source.replace('snapshot.metrics?.activeDurationMs ?? snapshot.activeElapsedMs ?? 0','snapshot.timing?.activeDurationMs ?? snapshot.metrics?.activeDurationMs ?? snapshot.activeElapsedMs ?? 0');
  source=source.replace('box.append(fragment);','box.replaceChildren(fragment);');
  source=source.replace('} else if (event.inputType === "deleteContentBackward")','} else if (["insertLineBreak", "insertParagraph"].includes(event.inputType)) engine.handleInput(normalizedInput("character", "\\n"));\n    else if (event.inputType === "deleteContentBackward")');
 }
 fs.writeFileSync(path,source);
 console.log(`${name}: ${changes.length} stable render sites`);
}
const index=fs.readFileSync('index.html','utf8');
assert.ok(index.includes('<link rel="stylesheet" href="practiceLabV20.css">'));
fs.writeFileSync('index.html',index.replace('<link rel="stylesheet" href="practiceLabV20.css">','<link rel="stylesheet" href="practiceLabPlayability.css?v=20260919a">\n    <link rel="stylesheet" href="practiceLabV20.css">'));
