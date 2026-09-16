export function renderPracticePreviewProtocolSetup(root,experimentId){
  const doc=root.ownerDocument,readAhead=experimentId==='read-ahead';
  const node=(tag,text)=>{const e=doc.createElement(tag);if(text)e.textContent=text;return e;};
  const section=node('section');section.className='screen practice-lab-screen';const main=node('main');main.className='practice-lab-shell practice-lab-detail';section.append(main);
  const back=node('button','← Back to Practice Lab');back.type='button';back.dataset.practiceAction='back';main.append(back,node('h1',readAhead?'Read-Ahead':'Metronome'));
  main.append(node('p',readAhead?'Type naturally, then compare one, two and four future words. The last block restores unrestricted preview. Hidden words are excluded from the rendered passage.':'Begin at your natural pace. Your silent baseline sets one fixed visual rhythm, alternating with silent blocks. A four-beat count-in is excluded from typing time. The final block is silent.'));
  main.append(node('p','These are descriptive experiments. They do not measure eye movements or establish a causal benefit. Leaving the page ends the session.'));
  const label=node('label','Session length '),select=node('select');select.dataset.protocolDuration='';for(const minutes of readAhead?[3,6,10]:[2,5,8]){const option=node('option',`${minutes} minutes`);option.value=String(minutes*60000);select.append(option);}label.append(select);main.append(label);
  const start=node('button','START SESSION');start.type='button';start.dataset.practiceAction='start-preview-protocol';start.dataset.experimentId=experimentId;main.append(start);root.replaceChildren(section);
}
