import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPracticeAssessmentInput } from '../js/practiceLab/practiceAssessmentInput.js';
function fixture() {
  const calls = [], focus = [];
  const input = new EventTarget(); input.value = ''; input.focusCount = 0;
  input.focus = () => { input.focusCount++; input.dispatchEvent(new Event('focus')); };
  const passage = new EventTarget();
  let active = true;
  const controller = bindPracticeAssessmentInput({ input, passage, send: (...args) => calls.push(args), isActive: () => active, onFocusChange: value => focus.push(value) });
  const emit = (name, values = {}, target = input) => {
    const event = new Event(name, {cancelable:values.cancelable !== false});
    for(const [key, value] of Object.entries(values)) if(key !== 'cancelable') Object.defineProperty(event,key,{value});
    target.dispatchEvent(event); return event;
  };
  return {input,passage,calls,focus,controller,emit,deactivate:()=>{active=false;}};
}
test('clicking the displayed passage focuses the real capture',()=>{
 const f=fixture();f.emit('click',{},f.passage);assert.equal(f.input.focusCount,1);assert.deepEqual(f.focus,[true]);f.controller.dispose();
 f.emit('click',{},f.passage);assert.equal(f.input.focusCount,1);
});
test('normal typing, spaces, both newline events and correction commands are routed once',()=>{
 const f=fixture();
 for(const [inputType,data] of [['insertText','ab '],['insertParagraph',null],['insertLineBreak',null],['deleteContentBackward',null],['deleteWordBackward',null]])assert.equal(f.emit('beforeinput',{inputType,data}).defaultPrevented,true);
 assert.deepEqual(f.calls,[['character','a'],['character','b'],['space',' '],['character','\n'],['character','\n'],['backspace',''],['word-delete','']]);
 assert.equal(f.input.value,'');f.controller.dispose();
});
test('uncancelable and input-only edits use native value fallback, not duplicate beforeinput data',()=>{
 const f=fixture();f.emit('beforeinput',{inputType:'insertText',data:'e\u0301',cancelable:false});assert.equal(f.calls.length,0);
 f.input.value='e\u0301';f.emit('input',{inputType:'insertText'});assert.deepEqual(f.calls,[['character','é']]);assert.equal(f.input.value,'');
 f.input.value='xy';f.emit('input',{inputType:'insertText'});assert.deepEqual(f.calls.slice(1),[['character','x'],['character','y']]);f.controller.dispose();
});
test('IME intermediate text is not scored and the committed grapheme is scored once',()=>{
 const f=fixture();f.emit('compositionstart');
 f.emit('beforeinput',{inputType:'insertCompositionText',data:'ㄱ',isComposing:true,cancelable:false});f.input.value='ㄱ';f.emit('input',{inputType:'insertCompositionText',isComposing:true});
 f.emit('beforeinput',{inputType:'insertCompositionText',data:'가',isComposing:true,cancelable:false});f.input.value='가';f.emit('input',{inputType:'insertCompositionText',isComposing:true});
 assert.equal(f.calls.length,0);f.emit('compositionend',{data:'가'});assert.deepEqual(f.calls,[['character','가']]);
 assert.equal(f.emit('beforeinput',{inputType:'insertFromComposition',data:'가'}).defaultPrevented,true);
 f.input.value='가';f.emit('input',{inputType:'insertFromComposition'});assert.equal(f.calls.length,1);
 f.emit('keydown',{key:'a'});f.emit('beforeinput',{inputType:'insertText',data:'a'});assert.deepEqual(f.calls.at(-1),['character','a']);f.controller.dispose();
});
test('cancelled composition, paste, drop and undo never become assessment keystrokes',()=>{
 const f=fixture();f.emit('compositionstart');f.emit('compositionend',{data:''});
 for(const type of ['paste','drop'])assert.equal(f.emit(type).defaultPrevented,true);
 for(const inputType of ['insertFromPaste','insertFromDrop','historyUndo']){
  assert.equal(f.emit('beforeinput',{inputType,data:'copied text'}).defaultPrevented,true);
  f.input.value='copied text';f.emit('input',{inputType});
 }
 assert.equal(f.calls.length,0);assert.equal(f.input.value,'');f.controller.dispose();
});
test('retired blocks cannot retain listeners, accept typing or steal focus',()=>{
 const f=fixture();f.deactivate();f.controller.focus();f.emit('beforeinput',{inputType:'insertText',data:'a'});
 assert.equal(f.input.focusCount,0);assert.equal(f.calls.length,0);f.controller.dispose();f.controller.dispose();
 f.emit('beforeinput',{inputType:'insertText',data:'b'});assert.equal(f.calls.length,0);
});
