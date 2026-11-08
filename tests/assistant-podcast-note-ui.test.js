'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'../src/renderer',name),'utf8');
const tick=(ms=15)=>new Promise(resolve=>setTimeout(resolve,ms));
const card={id:'P'+'3'.repeat(8)+'-3333-3333-3333-'+'3'.repeat(12),kind:'podcast',show:'Show',episode:'Episode',role:'source',timed:true,seconds:12,end:15,quote:'The lighthouse blinks twice.',locator:{action:'podcast-search-resolve',query:'lighthouse',episode:'entry-A',token:'e'.repeat(64)},scope:{limit:6,more:false}};
function fixture(handler,locale='en'){
 const dom=new JSDOM('<body><button id="origin">origin</button></body>',{runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;this.dispatchEvent(new w.Event('close'));};
 let occlusion=0;
 Object.assign(w,{UiLocale:{get:()=>locale},AssistantAppActions:{snapshot:()=>({owner:'source',thread:'thread'})},syncBrowserOcclusion:()=>{occlusion++;},
  api:{assistantPodcastNote:async input=>{calls.push(input);return handler(input,calls);}}});
 w.eval(read('assistant-podcast-sources.js'));w.eval(read('assistant-podcast-note-ui.js'));
 const $=selector=>w.document.querySelector('dialog.assistant-note-dialog '+selector),wait=()=>new Promise(resolve=>setTimeout(resolve,15));
 return {w,calls,$,wait,occlusion:()=>occlusion,button:name=>[...w.document.querySelectorAll('dialog button')].find(b=>b.textContent===name),close:()=>w.close()};
}
const source=(extra={})=>({show:'Show',episode:'Episode',role:'source',timed:true,seconds:12,end:15,quote:card.quote,existing:null,...extra});
function service(overrides={}){
 let revision=0,saved=new Set();
 return (input)=>{
  if(overrides[input.action]){const r=overrides[input.action](input);if(r!==undefined)return r;}
  if(input.action==='draft')return {ok:true,draftId:'d1',annotationId:'a1',source:source(),targetRevision:'new'};
  if(input.action==='preview'){revision++;return {ok:true,revision,previewToken:'token'+revision,note:input.text,source:source(),annotationId:'a1'};}
  if(input.action==='save'){const replay=saved.has(input.previewToken);saved.add(input.previewToken);return {ok:true,created:true,...(replay?{replayed:true}:{}),annotationId:'a1'};}
  return {ok:true};
 };
}
test('The note dialog drafts, edits, previews and saves only the last previewed text, writing nothing before approval',async()=>{
 const h=fixture(service());try{
  const origin=h.w.document.getElementById('origin');origin.focus();
  const opened=h.w.AssistantPodcastNoteUI.open(card);await opened;await h.wait();
  assert.equal(h.calls[0].action,'draft');assert.deepEqual(h.calls[0].locator,card.locator);assert.equal(h.w.AssistantPodcastNoteUI.isOpen(),true);
  assert.equal(h.$('blockquote').textContent,card.quote,'the quote is text, taken from the verified source');
  assert.match(h.$('.note-source').textContent,/Show · Episode\nOriginal\n0:12–0:15/);assert.match(h.$('.note-access').textContent,/verified just now/);
  h.$('textarea').value='First draft';h.button('Preview note').click();await h.wait();
  assert.match(h.$('.note-preview-text').textContent,/First draft/);assert.equal(h.$('label').hidden,true,'the preview replaces the editor instead of repeating it');
  assert.deepEqual(h.calls.map(c=>c.action),['draft','preview'],'previewing does not save');
  h.button('Edit').click();assert.equal(h.$('label').hidden,false);h.$('textarea').value='Edited by hand';h.button('Preview note').click();await h.wait();
  h.button('Save note').click();await h.wait();
  assert.deepEqual(h.calls.map(c=>c.action),['draft','preview','preview','save']);assert.equal(h.calls.at(-1).previewToken,'token2','only the last preview is approved');
  assert.match(h.$('.note-status').textContent,/Note saved to your research notebook/);assert.equal(h.button('Save note').disabled,true);
  h.button('Close').click();await h.wait();
  assert.equal(h.w.document.querySelector('dialog'),null);assert.equal(h.w.AssistantPodcastNoteUI.isOpen(),false);assert.equal(h.w.document.activeElement,origin,'focus returns to the opener');assert(h.occlusion()>=2);
  assert.equal(h.calls.some(c=>c.action==='cancel'),false,'a saved draft is not cancelled');
 }finally{h.close();}
});
test('An unconfirmed save reports an unknown result and a retry of the same preview never saves twice',async()=>{
 let fail=true;const base=service();
 const h=fixture(input=>{if(input.action==='save'&&fail){fail=false;throw Error('IPC lost');}return base(input);});try{
  await h.w.AssistantPodcastNoteUI.open(card);await h.wait();h.button('Preview note').click();await h.wait();
  h.button('Save note').click();await h.wait();
  assert.match(h.$('.note-status').textContent,/The result is unknown/);assert.equal(h.button('Save note').disabled,false,'the same preview may be saved again');
  h.button('Save note').click();await h.wait();
  assert.match(h.$('.note-status').textContent,/Note saved/);
  const saves=h.calls.filter(c=>c.action==='save');assert.equal(saves.length,2);assert.equal(saves[0].previewToken,saves[1].previewToken);
 }finally{h.close();}
 const again=fixture(service({save:()=>({ok:true,replayed:true,annotationId:'a1'})}),'tr');try{
  await again.w.AssistantPodcastNoteUI.open(card);await again.wait();again.button('Notu önizle').click();await again.wait();again.button('Notu kaydet').click();await again.wait();
  assert.match(again.$('.note-status').textContent,/zaten kaydedilmişti; yeniden kaydedilmedi/);
 }finally{again.close();}
});
test('A removed or changed source blocks the note, keeps the quote visible and explains why; a switched conversation blocks saving',async()=>{
 const h=fixture(service({draft:()=>({ok:false,code:'source-changed',sourceChanged:true,error:'Changed. / Değişti.'})}));try{
  await h.w.AssistantPodcastNoteUI.open(card);await h.wait();
  assert.match(h.$('.note-access').textContent,/Source changed or removed/);assert.equal(h.$('blockquote').textContent,card.quote);
  assert.equal(h.$('textarea').disabled,false);assert.equal(h.button('Preview note').disabled,true);assert.match(h.$('.note-status').textContent,/kept as you saw it; nothing can be saved/);
 }finally{h.close();}
 const switched=fixture(service({save:()=>({ok:false,code:'owner-changed',error:'The conversation or source changed / Sohbet veya kaynak değişti.'})}));try{
  await switched.w.AssistantPodcastNoteUI.open(card);await switched.wait();switched.button('Preview note').click();await switched.wait();switched.button('Save note').click();await switched.wait();
  assert.match(switched.$('.note-access').textContent,/conversation or source changed/);assert.equal(switched.button('Save note').disabled,true);
 }finally{switched.close();}
 const outdated=fixture(service({save:()=>({ok:false,code:'target-changed',error:'The saved note changed after this preview; preview it again. / Kayıtlı not değişti.'})}));try{
  await outdated.w.AssistantPodcastNoteUI.open(card);await outdated.wait();outdated.button('Preview note').click();await outdated.wait();outdated.button('Save note').click();await outdated.wait();
  assert.equal(outdated.button('Preview note').hidden,false,'back to editing: the user must preview again');assert.match(outdated.$('.note-status').textContent,/preview it again/);
 }finally{outdated.close();}
});
test('a late source check or preview after a conversation switch never enables approval in the newer context',async()=>{
 for(const action of ['draft','preview']){
  let thread='first',release;
  const h=fixture(service({[action]:input=>new Promise(resolve=>{release=()=>resolve(action==='draft'?{ok:true,draftId:'held',source:source()}:{ok:true,previewToken:'held',note:input.text,source:source()});})}));
  h.w.AssistantAppActions.snapshot=()=>({owner:'source',thread});h.w.AssistantAppActions.current=owner=>owner.thread===thread;
  try{
   const opened=h.w.AssistantPodcastNoteUI.open(card);
   if(action==='preview'){await opened;h.$('textarea').value='Old note';h.button('Preview note').click();}
   await h.wait();assert.equal(typeof release,'function');thread='second';release();await opened;await h.wait();
   assert.match(h.$('.note-access').textContent,/conversation or source changed/);assert.equal(h.button('Save note').disabled,true);assert.equal(h.button('Preview note').disabled,true);
   assert.equal(h.calls.filter(c=>c.action==='save').length,0);
  }finally{h.close();}
 }
});

test('a save already dispatched reports its real receipt even if the conversation changes before the reply',async()=>{
 let thread='first',release;const h=fixture(service({save:()=>new Promise(resolve=>{release=()=>resolve({ok:true,created:true,annotationId:'saved'});})}));
 h.w.AssistantAppActions.snapshot=()=>({owner:'source',thread});h.w.AssistantAppActions.current=owner=>owner.thread===thread;
 try{
  await h.w.AssistantPodcastNoteUI.open(card);h.$('textarea').value='Already sent';h.button('Preview note').click();await h.wait();h.button('Save note').click();await h.wait();thread='second';release();await h.wait();
  assert.equal(h.$('h2').textContent,'Note saved');assert.match(h.$('.note-status').textContent,/saved to your research notebook/);assert.equal(h.calls.filter(c=>c.action==='save').length,1);
 }finally{h.close();}
});

test('Escape cannot close a saving dialog, late answers for a closed dialog change nothing, and typing never reaches player shortcuts',async()=>{
 let release;const base=service();
 const h=fixture(input=>input.action==='save'?new Promise(resolve=>{release=()=>resolve(base(input));}):base(input));try{
  let reached=0;h.w.document.addEventListener('keydown',()=>{reached++;});
  await h.w.AssistantPodcastNoteUI.open(card);await h.wait();
  const field=h.$('textarea');field.focus();field.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:' ',bubbles:true}));field.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(reached,0,'Space and Enter stay in the field');
  h.button('Preview note').click();await h.wait();h.button('Save note').click();await h.wait();
  const cancel=new h.w.Event('cancel',{cancelable:true});h.$('').dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true,'Escape is blocked while saving');
  release();await h.wait();assert.match(h.$('.note-status').textContent,/Note saved/);
  h.button('Close').click();await h.wait();assert.equal(h.w.document.querySelector('dialog'),null);
 }finally{h.close();}
 let late;const slow=fixture(input=>input.action==='draft'?new Promise(resolve=>{late=()=>resolve({ok:true,draftId:'d9',source:source(),targetRevision:'new'});}):{ok:true});try{
  const pending=slow.w.AssistantPodcastNoteUI.open(card);await slow.wait();slow.button('Close').click();await slow.wait();
  late();await pending;await slow.wait();assert.equal(slow.w.document.querySelector('dialog'),null,'a late draft cannot reopen or fill a closed dialog');
  assert.equal(slow.calls.some(c=>c.action==='cancel'),false,'no draft id was known to cancel');
 }finally{slow.close();}
});

test('A durability warning is reported as saved-with-a-caveat, a busy passage waits, a vanished draft is explained, and a late answer for a closed dialog never touches the next one',async()=>{
 const base=service();
 const warned=fixture(service({save:()=>({ok:true,created:true,durable:false,annotationId:'a1'})}),'tr');try{
  await warned.w.AssistantPodcastNoteUI.open(card);await warned.wait();warned.button('Notu önizle').click();await warned.wait();warned.button('Notu kaydet').click();await warned.wait();
  assert.match(warned.$('.note-status').textContent,/Not kaydedildi, ancak uygulama diske yazıldığını doğrulayamadı/);assert.equal(warned.button('Notu kaydet').disabled,true,'it is saved: a second press is not offered');
 }finally{warned.close();}
 const busy=fixture(service({save:()=>({ok:false,code:'target-busy',pending:true,error:'Another note for this passage is being saved. Try again in a moment. / Bu pasaj için başka bir not kaydediliyor. Birazdan yeniden dene.'})}));try{
  await busy.w.AssistantPodcastNoteUI.open(card);await busy.wait();busy.button('Preview note').click();await busy.wait();busy.button('Save note').click();await busy.wait();
  assert.match(busy.$('.note-status').textContent,/Another note for this passage is being saved/);assert.equal(busy.button('Save note').disabled,false,'the same preview can be saved again once the other save finished');
 }finally{busy.close();}
 const gone=fixture(service({save:()=>({ok:false,code:'expired',error:'This note draft expired; open it again. / Not taslağı eskidi; yeniden aç.'})}));try{
  await gone.w.AssistantPodcastNoteUI.open(card);await gone.wait();gone.button('Preview note').click();await gone.wait();gone.button('Save note').click();await gone.wait();
  assert.match(gone.$('.note-access').textContent,/no longer available/);assert.match(gone.$('.note-status').textContent,/expired/);assert.equal(gone.button('Save note').disabled,true);
 }finally{gone.close();}
 let release;const slow=fixture(input=>input.action==='save'?new Promise(resolve=>{release=()=>resolve(base(input));}):base(input));try{
  await slow.w.AssistantPodcastNoteUI.open(card);await slow.wait();slow.button('Preview note').click();await slow.wait();slow.button('Save note').click();await slow.wait();
  slow.w.document.querySelector('dialog').close();await slow.wait();assert.equal(slow.w.document.querySelector('dialog'),null,'the first dialog was removed while its save was still pending');
  assert(slow.calls.some(c=>c.action==='cancel'),'closing asks the app to cancel the draft');
  await slow.w.AssistantPodcastNoteUI.open(card);await slow.wait();const status=slow.$('.note-status').textContent,access=slow.$('.note-access').textContent;
  release();await slow.wait();
  assert.equal(slow.$('.note-status').textContent,status,'the late save answer did not change the new dialog');assert.equal(slow.$('.note-access').textContent,access);assert.equal(slow.button('Save note').hidden,true,'the new dialog is still in its editing step');
 }finally{slow.close();}
});

test('User content is always text and never translated: quote and note render without markup, and the dialog carries the real translator\'s exclusion marker',async()=>{
 const html='<img src=x onerror="window.pwned=1"> <b>bold</b>',noteText='<script>window.pwned=2</script>Kaynağı kontrol et';
 const h=fixture(service({draft:()=>({ok:true,draftId:'d1',annotationId:'a1',source:source({quote:html,show:'<i>Show</i>',episode:'Episode'}),targetRevision:'new'})}),'tr');try{
  await h.w.AssistantPodcastNoteUI.open(card);await h.wait();
  const dialog=h.w.document.querySelector('dialog.assistant-note-dialog');
  assert.equal(h.$('blockquote').textContent,html);assert.equal(dialog.querySelector('img,b,i,script'),null,'no element was created from source text');
  h.$('textarea').value=noteText;h.button('Notu önizle').click();await h.wait();
  assert.equal(h.$('.note-preview-text').textContent,noteText);assert.equal(dialog.querySelector('script'),null);assert.equal(h.w.pwned,undefined);
  assert.equal(dialog.hasAttribute('data-ui-untranslated'),true);
  const translator=fs.readFileSync(path.join(__dirname,'../src/renderer/app-settings-ui.js'),'utf8');assert.match(translator,/\[data-ui-untranslated\]/,'the product translator skips this marker');
 }finally{h.close();}
});

test('After a save, Edit edits the saved note (an update), the explanation matches the result, Close becomes the main action, and reopening shows the saved note without a second record',async()=>{
 let revision=0,store=null;const h=fixture(input=>{
  if(input.action==='draft')return {ok:true,draftId:'d'+(++revision),annotationId:'a1',source:source({existing:store?{note:store,updatedAt:1}:null}),targetRevision:store?'r1':'new'};
  if(input.action==='preview')return {ok:true,revision:++revision,previewToken:'t'+revision,note:input.text,source:source({existing:store?{note:store,updatedAt:1}:null}),annotationId:'a1'};
  if(input.action==='save'){const created=store===null;store=h.lastText;return {ok:true,created,annotationId:'a1'};}
  return {ok:true};
 });
 try{
  const origin=h.w.document.getElementById('origin');origin.focus();
  await h.w.AssistantPodcastNoteUI.open(card);await h.wait();h.$('textarea').value='First note';h.lastText='First note';h.button('Preview note').click();await h.wait();
  assert.match(h.$('.note-preview-meta').textContent,/creates one new note/,'before saving it says what saving will do');
  h.button('Save note').click();await h.wait();
  assert.match(h.$('.note-status').textContent,/Note saved/);assert.equal(h.$('.note-preview-meta').hidden,true,'after saving the "will create" explanation is gone; the status line is the single message');
  assert.equal(h.$('h2').textContent,'Note saved','the title follows the outcome');assert.equal(h.button('Save note').hidden,true);assert.equal(h.button('Edit this note').hidden,false);assert.equal(h.button('Close').className,'btn btn-primary');
  h.button('Edit this note').click();await h.wait();
  assert.equal(h.$('textarea').value,'First note','Edit loads the saved note, not an empty draft');assert.match(h.$('.note-existing').textContent,/Editing the note you just saved/);assert.equal(h.button('Preview note').hidden,false);
  h.$('textarea').value='Second version';h.lastText='Second version';h.button('Preview note').click();await h.wait();h.button('Save note').click();await h.wait();
  assert.match(h.$('.note-status').textContent,/Note saved|updated/);assert.deepEqual(h.calls.filter(c=>c.action==='save').length,2);assert.equal(store,'Second version');
  h.button('Close').click();await h.wait();assert.equal(h.w.document.activeElement,origin,'focus returns to the opener');assert.equal(h.calls.some(c=>c.action==='cancel'),false,'a saved draft is not cancelled');
  // reopening: the saved note is loaded and saving is an update of the one record
  await h.w.AssistantPodcastNoteUI.open(card);await h.wait();assert.equal(h.$('textarea').value,'Second version');assert.match(h.$('.note-existing').textContent,/already exists/);
 }finally{h.close();}
});

test('A save whose answer never arrives does not lock the dialog: it is reported as unknown, can be sent again, and a late answer for a closed dialog changes nothing',async()=>{
 let hold,answer=0;const base=service(),h=fixture(input=>input.action==='save'&&++answer===1?new Promise(resolve=>{hold=()=>resolve({ok:true,created:true,annotationId:'a1'});}):base(input));
 try{
  h.w.AssistantPodcastNoteUI.open(card,{timeoutMs:40});await h.wait();h.button('Preview note').click();await h.wait();h.button('Save note').click();await tick(120);
  assert.match(h.$('.note-status').textContent,/The result is unknown/);assert.equal(h.button('Save note').disabled,false,'the dialog is usable again');assert.equal(h.button('Close').disabled,false,'and can be closed');
  h.button('Save note').click();await h.wait();assert.match(h.$('.note-status').textContent,/Note saved/);
  hold();await h.wait();assert.match(h.$('.note-status').textContent,/Note saved/,'the late answer of the first attempt changed nothing');
 }finally{h.close();}
});

test('Escape closes only the note dialog (the opener key handler never sees it) and focus returns to the opener',async()=>{
 const h=fixture(service());try{
  let opener=0;h.w.document.addEventListener('keydown',event=>{if(event.key==='Escape')opener++;});
  const origin=h.w.document.getElementById('origin');origin.focus();await h.w.AssistantPodcastNoteUI.open(card);await h.wait();
  const field=h.$('textarea');field.focus();field.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(opener,0,'the surface behind the dialog never receives Escape');
  h.$('').dispatchEvent(new h.w.Event('cancel',{cancelable:true}));h.$('').close();await h.wait();
  assert.equal(h.w.document.querySelector('dialog'),null);assert.equal(h.w.document.activeElement,origin);
 }finally{h.close();}
});

test('Overlay focus return: the control that opened the dialog is focused again when the overlay is shown, found by key after a re-render, and nothing else is focused',()=>{
 const dom=new JSDOM('<body><button id="other">other</button><div id="list"><button data-note-control="open" data-note-key="P1" id="one">one</button></div></body>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(read('assistant-focus-return.js'));
 w.AssistantFocusReturn.mark('P1');w.document.getElementById('list').innerHTML='<button data-note-control="open" data-note-key="P1" id="fresh">fresh</button>';   // the list was re-rendered
 w.dispatchEvent(new w.Event('focus'));assert.equal(w.document.activeElement.id,'fresh');assert.equal(w.AssistantFocusReturn.pending(),null,'one restore per opening');
 w.document.getElementById('other').focus();w.dispatchEvent(new w.Event('focus'));assert.equal(w.document.activeElement.id,'other','without a pending opener nothing is moved');
 w.AssistantFocusReturn.mark('GONE');w.dispatchEvent(new w.Event('focus'));assert.equal(w.document.activeElement.id,'other','a vanished opener never steals focus');
 w.close();
});

test('research draft UI keeps late previews off newer typing, reuses a lost-response confirmation and returns focus',async()=>{
 const dom=new JSDOM('<button id="origin">Open</button>',{runScripts:'outside-only'}),w=dom.window;try{
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let current=true,finish,previews=0,saves=0;const tokens=[];w.UiLocale={get:()=> 'en'};w.AssistantAppActions={snapshot:()=>({owner:'a',thread:'one'}),current:()=>current};
  w.api={assistantResearchNotes:async input=>{
   if(input.action==='get')return {ok:true,draft:{text:'Model draft'},sources:[{title:'<img src=x>',text:'Real quote',personalNote:'Personal interpretation'}]};
   if(input.action==='preview'){previews++;if(previews===1)return new Promise(r=>finish=r);return {ok:true,token:'exact-token',text:input.text};}
   if(input.action==='save'){tokens.push(input.token);return ++saves===1?{ok:false,error:'Result unknown; retry this same confirmation.'}:{ok:true};}
  }};w.eval(read('assistant-research-notes-ui.js'));w.document.getElementById('origin').focus();await w.AssistantResearchNotesUI.open({kind:'research-draft',draftId:'draft'});assert.equal(w.document.querySelector('img'),null);
  const editor=w.document.querySelector('dialog textarea'),button=text=>[...w.document.querySelectorAll('dialog button')].find(b=>b.textContent===text);button('Preview this draft').click();editor.value='My newer text';editor.dispatchEvent(new w.Event('input'));finish({ok:true,token:'old',text:'Model draft'});await tick();assert.equal(button('Confirm & save new note').hidden,true);assert.equal(editor.value,'My newer text');
  button('Preview this draft').click();await tick();button('Confirm & save new note').click();await tick();assert.match(w.document.querySelector('[role=status]').textContent,/Result unknown/);button('Confirm & save new note').click();await tick();assert.deepEqual(tokens,['exact-token','exact-token']);assert.match(w.document.querySelector('h2').textContent,/Note saved/);button('Close').click();assert.equal(w.document.activeElement.id,'origin');
  await w.AssistantResearchNotesUI.open({kind:'research-draft',draftId:'draft'});current=false;button('Preview this draft').click();await tick();assert.match(w.document.querySelector('[role=status]').textContent,/Conversation or source changed/);assert.equal(previews,2);
 }finally{dom.window.close();}
});
