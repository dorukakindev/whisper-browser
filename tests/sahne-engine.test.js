"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function mount(t,{prefs,identity='same-source',untimed=false,cinema=false,audio=false,empty=false,study=false,actions=[],sections=[],timingNotice='',save=false,processing=false}={}){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://test.invalid',pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window;
 w.UiLocale={get:()=> 'tr'};w.matchMedia=()=>({matches:true});w.Element.prototype.scrollTo=function(value){this.scrollTop=value.top;};
 let time=2,revision="r1",canSeek=true;const commands=[];const rows=untimed?[{id:'text',start:0,end:0,timed:false,src:'Yayıncı metni',trs:[],unc:[],words:null}]:[{id:'a',start:0,end:10,timed:true,src:'A source sentence',trs:['Birinci çeviri','İkinci çeviri'],unc:[],words:null},{id:'b',start:10,end:20,timed:true,src:'The next sentence',trs:[],unc:[],words:null}];
 const adapter={processing:processing?()=>({duration:30}):null,caps:{loop:true,cinema,study:true,save},identity:()=>identity,actions:()=>actions,info:()=>({audio,title:'Bölüm',langs:{src:'en',tr:'tr'},chapters:[{t:0,label:'Giriş'},{t:10,label:'İkinci bölüm'}],queue:[{index:1,title:'Sıradaki gerçek kayıt'}]}),state:()=>({time,duration:30,paused:true,rate:1,volume:.42,rows:empty?[]:rows,rev:revision,untimed,timingNotice,canSeek}),cmd:(...args)=>{commands.push(args);return Promise.resolve(args[0]==='wordInfo'?{ok:true,word:args[1].word,source:rows[args[1].row].src,translations:rows[args[1].row].trs,canSave:true,saved:false}:{ok:args[0]!=='loop',code:'busy'});},panel:()=>({sections,job:{state:'idle'}})};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/browser-study-view.js'),'utf8'));
 w.eval(fs.readFileSync(require.resolve('../src/renderer/podcast-task-scope.js'),'utf8'));
 w.eval(fs.readFileSync(require.resolve('../src/renderer/sahne.js'),'utf8'));
 const sh=new w.Sahne(w.document.getElementById('host'),adapter,{mode:cinema?'cinema':study?'study':'podcast',intro:false,prefs});
 t.after(()=>{sh.destroy();w.close();});return {w,sh,rows,commands,setTime:value=>time=value,setCanSeek:value=>canSeek=value,setRevision:value=>revision=value};
}
test('closing a cinema dock popup releases idle and native occlusion state',t=>{
 const f=mount(t,{cinema:true});f.sh.openDockPop('style');
 assert.equal(f.sh.dockPop,'style');assert.equal(f.sh.root.classList.contains('sh-pop-open'),true);
 assert.equal(f.sh.closeDockPops(),true);assert.equal(f.sh.dockPop,null);
 assert.equal(f.sh.root.classList.contains('sh-pop-open'),false);assert.equal(f.sh.closeDockPops(),false);
});

test('native subtitle appearance routes to the existing player settings rather than ineffective CSS controls',async t=>{
 const f=mount(t,{cinema:true}),info=f.sh.a.info;
 f.sh.a.info=()=>({...info(),native:true});
 f.sh.q('[data-a=substyle]').click();await new Promise(setImmediate);
 assert.equal(f.sh.q('[data-r=substylepop]').hidden,true);
 assert.equal(f.commands.at(-1)[0],'advanced');assert.match(f.sh.q('[data-r=toast]').textContent,/Native/);
});

test('all stage modes expose an assistant bubble in the top toolbar and use the current-media command',async t=>{
 for(const mode of [{cinema:true},{study:true},{}]){
  const f=mount(t,mode),button=f.sh.q('.sh-top-r [data-a=assistant]');
  assert(button,'assistant is reachable without opening Tasks or the transcript');
  assert.equal(button.getAttribute('aria-label'),'Asistanı aç');
  assert(button.querySelector('svg'),'the top entry has a conversation bubble');
  button.click();await new Promise(setImmediate);
  assert.deepEqual(f.commands.map(args=>args[0]),['assistant']);
  f.sh.a.identity=()=> 'other-source';button.click();await new Promise(setImmediate);
  assert.equal(f.commands.length,1,'an outdated toolbar does not open context for a different source');
 }
});

test('task categories preserve controls, active category and field focus through refresh',t=>{
 let merged=false;
 const sections=[{id:'captions',title:'Subtitles',items:[{id:'load',label:'Load'}]},{id:'fine',title:'Fine settings',items:[{id:'merge',type:'checkbox',label:'Merge sentences',value:false,onChange:value=>{merged=value;sections[1].items[0].value=value;}}]}];
 const f=mount(t,{sections});f.sh.togglePanel();const box=f.sh.q('[data-r=panel]');
 assert.equal(box.querySelectorAll('[role=tabpanel]:not([hidden])').length,1);
 assert.equal(box.querySelectorAll('[data-pid]').length,2,'all controls remain present');
 let tab=box.querySelectorAll('[role=tab]')[0];tab.focus();tab.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
 assert.equal(f.w.document.activeElement.textContent.trim(),'Fine settings');
 let input=box.querySelector('[data-pid=merge]');input.focus();input.click();assert.equal(merged,true);input=box.querySelector('[data-pid=merge]');assert.equal(f.w.document.activeElement,input);assert(input.checked);assert.equal(input.closest('[role=tabpanel]').hidden,false);
 f.sh.drawPanel(true);assert.equal(box.querySelector('[role=tab][aria-selected=true]').textContent.trim(),'Fine settings');
 f.sh.q('[data-pclose]').click();f.sh.togglePanel();assert.equal(box.querySelector('[role=tab][aria-selected=true]').textContent.trim(),'Fine settings');
 const caption=f.w.document.createElement('button');caption.dataset.captionEntry='';f.sh.q('[data-pclose]').click();f.sh.togglePanel(caption);assert.equal(box.querySelector('[role=tab][aria-selected=true]').textContent.trim(),'Subtitles');assert.equal(f.w.document.activeElement.dataset.pid,'action:load');
 assert.equal(f.commands.length,0,'navigation starts no media or production');
});
test('cinema and podcast progress expose measured and unknown progress without a false percentage',t=>{
 for(const cinema of [false,true]){const f=mount(t,{cinema}),bar=f.sh.q('[data-r=jobbar]');
  f.sh.drawJob({state:'running',progress:.4});assert.equal(bar.getAttribute('role'),'progressbar');assert.equal(bar.getAttribute('aria-valuenow'),'40');assert.equal(bar.firstElementChild.style.width,'40%');assert.equal(f.sh.q('[data-r=jobpercent]').textContent,'40%');assert.equal(f.sh.q('[data-r=jobpercent]').hidden,false);
  f.sh.drawJob({state:'running'});assert.equal(bar.hasAttribute('aria-valuenow'),false);assert.match(bar.getAttribute('aria-valuetext'),/bilinmiyor/);assert(bar.classList.contains('ind'));
  f.sh.drawJob({state:'done'});assert(bar.hidden);
 }
});
test('the next sentence button stays available for a cue starting less than ten milliseconds later', t => {
 const f = mount(t, {study:true});
 Object.assign(f.rows[0], {start:2, end:2.004});
 Object.assign(f.rows[1], {start:2.004, end:2.008});
 f.setTime(2.001);
 f.setRevision('short-cues');
 f.sh.tick();
 const next = f.sh.q('[data-a=next]');
 assert.equal(next.disabled, false);
 next.click();
 assert.equal(f.commands[0][0], 'nextCue');
});
for (const study of [false, true]) {
 test(`${study ? 'Bilingual' : 'Podcast'} scrub previews without changing the active cue until playback moves`, t => {
  const f = mount(t, {study, prefs:{disp:'tr'}}), wave = f.sh.q('[data-r=wave]');
  f.rows[1].trs = ['Sonraki cümle'];
  f.setRevision('with-translation');
  f.sh.tick();
  wave.setPointerCapture = () => {};
  wave.getBoundingClientRect = () => ({left:0, width:100});
  const pointer = (type, id=1) => {
   const event = new f.w.MouseEvent(type, {clientX:50, bubbles:true});
   Object.defineProperty(event, 'pointerId', {value:id});
   wave.dispatchEvent(event);
  };
  pointer('pointerdown');
  assert.equal(f.sh.q('[data-r=tip]').textContent,'0:15 · Sonraki cümle');
  assert.equal(f.sh.q('[data-r=t0]').textContent,'0:15');
  assert.equal(f.sh.cur,0);
  assert.match(f.sh.q('.sh-chapter-current').textContent,/Giriş/);
  pointer('pointerup',2);
  assert.equal(f.commands.length,0);
  pointer('lostpointercapture');
  assert.equal(f.sh.q('[data-r=t0]').textContent,'0:02');
  pointer('pointerdown');
  f.sh.a.identity = () => 'different-source';
  pointer('pointerup');
  assert.equal(f.commands.length,0);
  f.sh.a.identity = () => 'same-source';
  pointer('pointerdown');
  pointer('pointerup');
  assert.deepEqual(f.commands,[['seek',15,'with-translation']]);
  f.setTime(15);
  f.sh.tick();
  assert.equal(f.sh.cur,1);
 });
}
test('both shared modes select a rate directly and retain the confirmed rate on failure',async t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}), select=f.sh.q('[data-r=rate]');
  const state=f.sh.a.state;
  let rate=1.1;
  f.sh.a.state=()=>({...state(),rate});
  f.sh.a.cmd=(type,value)=>{
   f.commands.push([type,value]);
   if(value===2)return {ok:false};
   rate=value;
   return {ok:true};
  };
  f.sh.tick();
  assert.equal(select.value,'1.1');
  for(const [requested,actual] of [['1.5','1.5'],['2','1.5']]){
   select.value=requested;
   select.dispatchEvent(new f.w.Event('change'));
   await new Promise(setImmediate);
   assert.equal(select.value,actual);
  }
  assert.deepEqual(f.commands,[['rate',1.5],['rate',2]]);
 }
});

test('pending speed selection is visible, stays single-flight and returns to the confirmed rate',async t=>{
 const f=mount(t);let finish,calls=0;f.sh.a.cmd=()=>{calls++;return new Promise(r=>finish=r);};const select=f.sh.q('[data-r=rate]');select.value='1.5';select.dispatchEvent(new f.w.Event('change'));
 assert.equal(f.sh.q('[data-r=rateState]').hidden,false);assert.equal(select.value,'1');select.value='2';select.dispatchEvent(new f.w.Event('change'));assert.equal(calls,1);
 finish({ok:false});await new Promise(setImmediate);assert.equal(f.sh.q('[data-r=rateState]').hidden,true);assert.equal(select.hasAttribute('aria-busy'),false);assert.equal(select.value,'1');
});

test('pending speed change survives a same-source view handoff without a second request',async t=>{
 for(const ok of [true,false]){
  const f=mount(t);let finish,calls=0,confirmed=1;const state=f.sh.a.state;f.sh.a.state=()=>({...state(),rate:confirmed});f.sh.a.cmd=()=>{calls++;return new Promise(resolve=>finish=resolve);};
  const rate=f.sh.q('[data-r=rate]');rate.value='1.5';rate.dispatchEvent(new f.w.Event('change'));const prefs=f.sh.prefs(true);f.sh.destroy();
  const next=mount(t,{study:true,prefs}),nextState=next.sh.a.state,notices=[];next.sh.a.state=()=>({...nextState(),rate:confirmed});next.sh.a.cmd=()=>{calls++;return {ok:true};};next.sh.toast=message=>notices.push(message);next.sh.tick();
  const select=next.sh.q('[data-r=rate]');assert.equal(select.getAttribute('aria-busy'),'true');assert.equal(next.sh.q('[data-r=rateState]').hidden,false);select.value='2';select.dispatchEvent(new next.w.Event('change'));assert.equal(calls,1);
  const other=mount(t,{identity:'different',prefs});assert.equal(other.sh.q('[data-r=rate]').hasAttribute('aria-busy'),false);
  if(ok)confirmed=1.5;finish(ok?{ok:true}:{ok:false,message:'Speed rejected'});await new Promise(setImmediate);next.sh.tick();
  assert.equal(select.value,String(confirmed));assert.equal(select.hasAttribute('aria-busy'),false);assert.equal(next.sh.q('[data-r=rateState]').hidden,true);assert.deepEqual(notices,ok?[]:['Speed rejected']);
 }
});

test('sleep expiry reports confirmed pause only for the same live source',async t=>{
 const f=mount(t);f.sh.setSleep(15);f.sh.s.sleepAt=Date.now()-1;f.sh.tick();await new Promise(setImmediate);assert.match(f.sh.q('[data-r=toast]').textContent,/Uyku süresi doldu/);assert.equal(f.commands.filter(c=>c[0]==='pause').length,1);
 const late=mount(t);let finish;late.sh.a.cmd=()=>new Promise(r=>finish=r);late.sh.setSleep(15);late.sh.s.sleepAt=Date.now()-1;late.sh.tick();late.sh.a.identity=()=> 'new-source';finish({ok:true});await new Promise(setImmediate);assert.doesNotMatch(late.sh.q('[data-r=toast]').textContent,/Uyku süresi doldu/);
});
test('sentence loop discards stale completion and toggles on the selected row',async t=>{
 const f=mount(t,{study:true});
 let finish;
 f.sh.a.cmd=(...args)=>{
  f.commands.push(args);
  if(args[0]==='loop'&&args[1].on)return new Promise(resolve=>{finish=resolve;});
  return {ok:true};
 };
 const button=()=>f.sh.lines[1].querySelector('[data-act=loop]');
 button().click();
 button().click();
 f.setRevision('replacement');
 f.sh.tick();
 finish({ok:true});
 await new Promise(setImmediate);
 assert.deepEqual(structuredClone(f.commands),[['loop',{on:true,row:1},'r1']]);
 assert.equal(button().getAttribute('aria-pressed'),'false');
 button().click();
 finish({ok:true});
 await new Promise(setImmediate);
 assert.equal(button().getAttribute('aria-pressed'),'true');
 assert.deepEqual(f.commands.at(-1),['seekCue',1,'replacement']);
 button().click();
 await new Promise(setImmediate);
 assert.deepEqual(structuredClone(f.commands.at(-1)),['loop',{on:false},'replacement']);
 assert.equal(button().getAttribute('aria-pressed'),'false');
});
test('shared exact seek validates bounds, submits once and restores focus',async t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}), opener=f.sh.q('.sh-times [data-a=jump]'), input=f.sh.q('[data-r=jumpTime]'), form=f.sh.q('[data-r=jumpForm]');
  opener.click();
  assert.equal(f.w.document.activeElement,input);
  for(const invalid of ['0:99','31','-2','x']){
   input.value=invalid;await f.sh.seekTypedTime();
   assert.equal(input.getAttribute('aria-invalid'),'true');
  }
  assert.equal(f.commands.length,0);
  input.value='0:15';
  await Promise.all([f.sh.seekTypedTime(),f.sh.seekTypedTime()]);
  assert.deepEqual(f.commands.map(command=>command.slice(0,2)),[['seek',15]]);
  assert.equal(form.hidden,true);
  assert.equal(f.w.document.activeElement,opener);
  const focus=f.sh.q('[data-a=focus]');
  focus.click();
  assert.equal(focus.getAttribute('aria-pressed'),'true');
  assert(f.sh.root.classList.contains('sh-focus'));
 }
});
test('a delayed exact seek does not take focus from a newer reading action',async t=>{
 const f=mount(t),input=f.sh.q('[data-r=jumpTime]');let finish;
 f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);
 f.sh.q('.sh-times [data-a=jump]').click();input.value='0:12';const pending=f.sh.seekTypedTime();
 const search=f.sh.q('[data-r=q]');search.focus();search.value='next';search.dispatchEvent(new f.w.Event('input'));
 finish({ok:true});await pending;
 assert.equal(f.sh.q('[data-r=jumpForm]').hidden,true);assert.equal(f.w.document.activeElement,search);assert.equal(search.value,'next');
});

test('fullscreen Escape uses the owned command error path instead of a detached document promise',async t=>{
 const f=mount(t);let direct=0;Object.defineProperty(f.w.document,'fullscreenElement',{configurable:true,value:f.sh.root});f.w.document.exitFullscreen=()=>{direct++;return Promise.resolve();};
 f.sh.root.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await new Promise(setImmediate);
 assert.equal(direct,0);assert.equal(f.commands.at(-1)?.[0],'fullscreen');
});

test('Escape on native selectors remains owned by the selector',t=>{
 const f=mount(t);let closed=0;f.sh.o.onClose=()=>closed++;
 for(const selector of ['[data-r=rate]','[data-r=sleep]']){
  const select=f.sh.q(selector);select.focus();const event=new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});select.dispatchEvent(event);
  assert.equal(event.defaultPrevented,false);assert.equal(closed,0);assert.equal(f.w.document.activeElement,select);
 }
});

test('rate control reflects unavailable owner capability and recovers without dispatching a blocked change',async t=>{
 const f=mount(t),state=f.sh.a.state,select=f.sh.q('[data-r=rate]');let canRate=false;
 f.sh.a.state=()=>({...state(),canRate});f.sh.tick();assert.equal(select.disabled,true);assert.match(select.title,/henüz kullanılamıyor/);
 select.value='1.5';select.dispatchEvent(new f.w.Event('change'));await new Promise(setImmediate);assert.equal(f.commands.length,0);assert.equal(select.value,'1');
 canRate=true;f.sh.tick();assert.equal(select.disabled,false);assert.equal(select.title,'');select.value='1.5';select.dispatchEvent(new f.w.Event('change'));await new Promise(setImmediate);assert.equal(f.commands.length,1);
});

test('shared volume serializes updates and drops intermediate values',async t=>{
 const f=mount(t,{study:true}), slider=f.sh.q('.sh-local-volume');
 const sent=[];
 let release;
 f.sh.a.cmd=(name,value)=>{sent.push(value);return new Promise(resolve=>{release=resolve;});};
 for(const value of ['0.2','0.4','0.8']){
  slider.value=value;slider.dispatchEvent(new f.w.Event('input'));
 }
 assert.deepEqual(sent,[.2]);
 release({ok:true});await new Promise(setImmediate);
 assert.deepEqual(sent,[.2,.8]);
 release({ok:true});await new Promise(setImmediate);
 assert.equal(f.sh.volumePending,false);
});
test('same-source volume handoff keeps the latest queued value and uses the current adapter',async t=>{
 const f=mount(t),sent=[];let finish;f.sh.a.cmd=(name,value)=>{sent.push(['old',value]);return new Promise(resolve=>finish=resolve);};
 const input=f.sh.q('.sh-local-volume');for(const value of ['.2','.8']){input.value=value;input.dispatchEvent(new f.w.Event('input'));}
 const prefs=f.sh.prefs(true);assert.doesNotThrow(()=>JSON.stringify(prefs));f.sh.destroy();const next=mount(t,{study:true,prefs});let confirmed=.2;const state=next.sh.a.state;next.sh.a.state=()=>({...state(),volume:confirmed});next.sh.a.cmd=(name,value)=>{sent.push(['new',value]);confirmed=value;return {ok:true};};next.sh.tick();
 assert.equal(Number(next.sh.q('.sh-local-volume').value),.8);assert.equal(next.sh.volumePending,true);
 finish({ok:true});await new Promise(setImmediate);next.sh.tick();assert.deepEqual(sent,[['old',.2],['new',.8]]);assert.equal(Number(next.sh.q('.sh-local-volume').value),.8);assert.equal(next.sh.volumePending,false);
 const oldSource=mount(t);let release,oldCalls=0;oldSource.sh.a.cmd=()=>{oldCalls++;return new Promise(resolve=>release=resolve);};const oldSlider=oldSource.sh.q('.sh-local-volume');for(const value of ['.2','.8']){oldSlider.value=value;oldSlider.dispatchEvent(new oldSource.w.Event('input'));}
 const otherPrefs=oldSource.sh.prefs(true);oldSource.sh.destroy();const other=mount(t,{identity:'another-source',prefs:otherPrefs});oldSlider.value='.4';oldSlider.dispatchEvent(new oldSource.w.Event('input'));release({ok:false,message:'Old source volume failure'});await new Promise(setImmediate);
 assert.equal(oldCalls,1);assert.equal(other.commands.length,0);assert.equal(other.sh.volumePending,false);assert.equal(Number(other.sh.q('.sh-local-volume').value),.42);assert.doesNotMatch(other.sh.q('[data-r=toast]').textContent,/Old source/);
});

test('rapid volume and mute restore the latest audible choice instead of an older tick value',async t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}),slider=f.sh.q('.sh-local-volume'),mute=f.sh.q('[data-r=volumeIcon]');let finish;const values=[];
  f.sh.a.cmd=(type,value)=>{values.push(value);return new Promise(resolve=>finish=resolve);};
  slider.value='.8';slider.dispatchEvent(new f.w.Event('input'));mute.click();mute.click();
  assert.equal(slider.value,'0.8');assert.equal(f.sh.lastAudibleVolume,.8);
  finish({ok:true});await new Promise(setImmediate);assert.deepEqual(values,[.8,.8]);finish({ok:true});await new Promise(setImmediate);
 }
});

test('captured tracks replace the empty transcript prompt and open the caption section',t=>{
 const f=mount(t,{study:true,empty:true,actions:[{id:'whisper',label:'Whisper',run(){}}],sections:[{id:'captions',title:'Altyazı izleri',items:[{type:'button',label:'Mevcut izi yükle',run(){}}]}]});
 const info=f.sh.a.info;
 assert.equal(f.sh.q('[data-r=processing]').open,true);
 f.sh.a.info=()=>({...info(),captionTrackCount:2});
 f.sh.tick();
 assert.equal(f.sh.q('[data-r=processing]').open,false);
 const entry=f.sh.q('[data-caption-entry]');
 assert.match(entry.textContent,/Altyazı izi seç/);
 entry.click();
 assert.equal(f.w.document.activeElement,f.sh.q('[data-caption-section] button'));
 f.sh.q('[data-pclose]').click();
 assert.equal(f.w.document.activeElement,entry);
 assert.equal(f.commands.length,0);
});

test('transcript task summary distinguishes missing, ready and pending text without hiding actions',async t=>{
 let finish;const f=mount(t,{empty:true,actions:[{id:'transcribe',label:'Whisper',run:()=>new Promise(r=>finish=r)}]});
 assert.equal(f.sh.q('[data-r=processingState]').textContent,'Transkript yok');
 const state=f.sh.a.state;f.sh.a.state=()=>({...state(),rows:f.rows});f.sh.tick();assert.equal(f.sh.q('[data-r=processingState]').textContent,'Zamanlı metin · Kaynak: 2 · Çeviri: 1/2');
 const pending=f.sh.startTask('transcribe');assert.equal(f.sh.q('[data-r=processingState]').textContent,'Hazırlanıyor…');finish({ok:true});await pending;assert.equal(f.sh.q('[data-r=processingState]').textContent,'Zamanlı metin · Kaynak: 2 · Çeviri: 1/2');
 assert.equal(f.sh.q('[data-task=transcribe]').disabled,false);
});
test('automatically expanded transcript tasks give reading space back when text arrives',t=>{
 const f=mount(t,{study:true,actions:[{id:'transcribe',label:'Whisper',run(){}}]});
 const state=f.sh.a.state;
 let loaded=false;
 f.sh.a.state=()=>({...state(),rows:loaded?f.rows:[],rev:loaded?'loaded':'empty'});
 f.sh.processingInitialized=false;
 f.sh.tick();
 const panel=f.sh.q('[data-r=processing]');
 assert.equal(panel.open,true);
 loaded=true;f.sh.tick();
 assert.equal(panel.open,false);
});
test('local bilingual captions and Podcast speech use both track offsets without timing an untimed track',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}), state=f.sh.a.state;
  const tracks=[
   {offsetSeconds:1,cues:[{id:'a',start:0,end:5,text:'Original'}]},
   {offsetSeconds:3,cues:[{id:'translation',start:0,end:5,text:'Çeviri'}]}
  ];
  f.rows[0].end=6;
  f.rows[0].translationCueIds=['translation'];
  f.setRevision('local-caption-tracks');
  f.sh.a.state=()=>({...state(),captionTracks:tracks});
  const source=f.sh.q(study?'[data-r=s]':'[data-r=liveSource]');
  const translation=f.sh.q(study?'[data-r=t]':'[data-r=liveTranslation]');
  f.setTime(2);f.sh.tick();
  assert.equal(source.textContent,'Original');assert.equal(translation.textContent,'');
  f.setTime(4);f.sh.tick();
  assert.equal(source.textContent,'Original');assert.equal(translation.textContent,'Çeviri');
  f.setTime(7);f.sh.tick();
  assert.equal(source.textContent,'');assert.equal(translation.textContent,'Çeviri');
  assert.equal(f.sh.lines[0].getAttribute('aria-current'),'true');
  assert.equal(f.sh.playbackIndex,-1);
  tracks[1].timed=false;f.sh.tick();assert.equal(translation.textContent,'');
 }
});
test('Podcast live speech follows independent subtitle times and skips ads',t=>{
 const f=mount(t), state=f.sh.a.state;
 let adPlaying=false;
 f.rows[0].translationCueIds=['t1'];
 f.setRevision('independent-cues');
 f.sh.a.state=()=>({...state(),adPlaying,canSeek:!adPlaying,captionTracks:[
  {cues:[{id:'a',start:0,end:10,text:'A source sentence'}]},
  {cues:[{id:'t1',start:4,end:12,text:'Canlı çeviri'}]}
 ]});
 f.sh.tick();
 assert.equal(f.sh.q('[data-r=liveSource]').textContent,'A source sentence');
 assert(f.sh.q('[data-r=liveTranslation]').hidden);
 f.sh.q('[data-d=tr]').click();
 f.sh.tick();
 assert.equal(f.sh.cur,-1);
 f.setTime(11);f.sh.tick();
 assert.equal(f.sh.cur,0);
 assert.equal(f.sh.playbackIndex,1);
 assert.equal(f.sh.q('[data-r=liveTranslation]').textContent,'Canlı çeviri');
 adPlaying=true;f.sh.tick();
 assert.equal(f.sh.cur,-1);
 assert(f.sh.q('[data-r=liveSpeech]').hidden);
 assert.match(f.sh.q('[data-r=transportHint]').textContent,/Reklam/);
 adPlaying=false;f.sh.tick();
 assert.equal(f.sh.cur,0);
});
test('browser presentation time can highlight the next cue before the next sample without changing playback commands',t=>{
 const f=mount(t), state=f.sh.a.state;
 f.setTime(9.8);
 f.sh.a.state=()=>({...state(),displayTime:10.2});
 f.sh.tick();
 assert.equal(f.sh.cur,1);
 assert.equal(f.sh.playbackIndex,0);
 assert.equal(f.sh.lines[1].getAttribute('aria-current'),'true');
 f.sh.q('[data-a=loop]').click();
 assert.equal(f.commands.at(-1)[1].row,0);
});
test('a translation spanning two originals follows the currently spoken original card', t => {
 for (const study of [false, true]) {
  const f = mount(t, { study, prefs: { disp: 'tr' } }), state = f.sh.a.state;
  for (const row of f.rows) {
   row.trs = ['Ortak çeviri'];
   row.translationCueIds = ['shared'];
  }
  f.sh.a.state = () => ({ ...state(), captionTracks: [null, { cues: [{ id: 'shared', start: 5, end: 15, text: 'Ortak çeviri' }] }] });
  f.setRevision('shared-translation');
  f.setTime(8);
  f.sh.tick();
  assert.equal(f.sh.lines[0].getAttribute('aria-current'), 'true');
  f.setTime(12);
  f.sh.tick();
  assert.equal(f.sh.lines[0].hasAttribute('aria-current'), false);
  assert.equal(f.sh.lines[1].querySelector('[data-translation-part]').getAttribute('aria-current'), 'true');
  assert.equal(f.sh.lines[1].getAttribute('aria-current'), 'true');
 }
});
test('paired translation sentences have independent controls and active markers', t => {
 for (const study of [false, true]) {
  const f = mount(t, { study, prefs: { disp: 'both' } }), state = f.sh.a.state;
  Object.assign(f.rows[0], { translationCueIds: ['t1', 't2'], translationRanges: [{start:2,end:5}, {start:5,end:8}] });
  f.sh.a.state = () => ({ ...state(), captionTracks: [null, { offsetSeconds: 2, cues: [
   { id: 't1', start: 0, end: 3, text: 'Birinci çeviri' },
   { id: 't2', start: 3, end: 6, text: 'İkinci çeviri' }
  ] }] });
  f.setRevision('paired');
  f.sh.tick();
  const parts = f.sh.lines[0].querySelectorAll('[data-translation-part]');
  f.sh.q('[data-d=tr]').click();
  const first = parts[0].querySelector('button'), second = parts[1].querySelector('button');
  first.focus();
  first.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert.equal(f.w.document.activeElement, second);
  assert.equal(parts[0].getAttribute('aria-current'), 'true');
  f.setTime(6);
  f.sh.tick();
  assert.equal(parts[0].hasAttribute('aria-current'), false);
  assert.equal(parts[1].getAttribute('aria-current'), 'true');
  parts[1].querySelector('button').click();
  assert.equal(f.commands.at(-1)[0], 'seekTranslation');
  assert.equal(f.commands.at(-1)[1].part, 1);
  f.setCanSeek(false);
  f.sh.tick();
  assert.equal(parts[1].querySelector('button').disabled, true);
  f.setCanSeek(true);
  f.rows[0].translationRanges[0] = {start:-2,end:-1};
  f.setRevision('translation-before-video');
  f.sh.tick();
  const buttons = f.sh.lines[0].querySelectorAll('[data-a=translationSeek]');
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
 }
});
test('independent translation follows its own clock in both shared modes', t => {
 for (const study of [false, true]) {
  const f = mount(t, { study, prefs: { disp: 'tr' } }), state = f.sh.a.state;
  f.rows.push({ id: 'gap', start: 22, end: 26, timed: true, src: '', trs: ['Ayrı çeviri'], unc: [],
   standaloneTranslation: true, translationCueIds: ['gap'], translationRange: {start:22,end:26} });
  f.sh.a.state = () => ({ ...state(), captionTracks: [null,
   { offsetSeconds: 2, cues: [{ id: 'gap', start: 20, end: 24, text: 'Ayrı çeviri' }] }] });
  f.setTime(23);
  f.setRevision('standalone');
  f.sh.tick();
  const line = f.sh.lines[2];
  assert.equal(line.getAttribute('aria-current'), 'true');
  assert.equal(line.style.getPropertyValue('--lp'), '25.0%');
  assert.match(line.textContent, /Bağımsız çeviri satırı/);
  line.querySelector('[data-a=cueSeek]').click();
  assert.deepEqual(f.commands.at(-1), ['seekTranslation', 2, 'standalone']);
  f.sh.q('[data-d=src]').click();
  f.sh.tick();
  assert.equal(line.hidden, true);
  assert.equal(f.sh.cur, -1);
 }
});
test('translation-only timestamps use the verified translation target in both shared modes',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study});
  f.rows[0].translationRange={start:4,end:6};
  f.setRevision('translated');f.sh.tick();
  const button=()=>f.sh.lines[0].querySelector('[data-a=cueSeek]');
  f.sh.q('[data-d=tr]').click();
  assert.match(button().textContent,/0:04/);
  button().click();
  assert.deepEqual(f.commands.at(-1).slice(0,2),['seekTranslation',0]);
  f.rows[0].translationRange=null;
  f.setRevision('unverified');f.sh.tick();
  assert.equal(button().disabled,true);
  f.sh.q('[data-d=both]').click();
  assert.equal(button().disabled,false);
 }
});
test('keyboard focus inside a transcript pauses automatic follow until explicit return, without moving playback or focus',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}),row=f.sh.lines[0].querySelector('[data-a=cueSeek]');
  assert.equal(f.sh.s.follow,true);row.focus();
  assert.equal(f.sh.s.follow,false);assert.equal(f.sh.q('[data-a=follow]').getAttribute('aria-pressed'),'false');
  assert.match(f.sh.q('[data-a=follow]').textContent,/Konuşmaya dön/);
  f.setTime(12);f.sh.tick();assert.equal(f.w.document.activeElement,row);assert.equal(f.commands.length,0);
  f.sh.q('[data-a=follow]').focus();f.sh.q('[data-a=follow]').click();assert.equal(f.sh.s.follow,true);assert.equal(f.commands.length,0);
 }
});

test('selecting transcript text suspends follow without cancelling selection or seeking',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}),source=f.sh.lines[0].querySelector('.src'),scroll=f.sh.q('[data-r=scroll]');
  scroll.scrollTop=40;
  const down=new f.w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0});source.dispatchEvent(down);
  assert.equal(f.sh.s.follow,false);assert.equal(down.defaultPrevented,false);
  const selection=f.w.getSelection(),range=f.w.document.createRange();range.selectNodeContents(source);selection.removeAllRanges();selection.addRange(range);
  f.setTime(12);f.sh.tick();assert.equal(selection.toString(),'A source sentence');assert.equal(scroll.scrollTop,40);assert.equal(f.commands.length,0);
  f.sh.q('[data-a=follow]').click();assert.equal(f.sh.s.follow,true);assert.equal(f.commands.length,0);
  const translation=f.sh.lines[0].querySelector('.tr span[dir]');
  translation.dispatchEvent(new f.w.MouseEvent('pointerdown',{bubbles:true,button:0}));assert.equal(f.sh.s.follow,false);
  f.sh.q('[data-a=follow]').click();
  source.dispatchEvent(new f.w.MouseEvent('pointerdown',{bubbles:true,button:2}));assert.equal(f.sh.s.follow,true,'context menu alone does not change follow');
 }
});

test('manual transcript browsing remains stopped; return follows without seeking',t=>{
 const f=mount(t),scroll=f.sh.q('[data-r=scroll]');
 let interrupted;
 scroll.scrollTop=23;
 scroll.scrollTo=options=>{interrupted=options;};
 scroll.dispatchEvent(new f.w.WheelEvent('wheel',{deltaY:-100}));
 assert.equal(interrupted.top,23);
 assert.equal(interrupted.behavior,'instant');
 assert.equal(f.sh.s.follow,false);
 f.setTime(12);f.sh.tick();assert.equal(f.sh.s.follow,false);assert.equal(f.sh.cur,1);
 f.sh.q('[data-a=follow]').click();assert.equal(f.sh.s.follow,true);assert.equal(f.commands.length,0);
 assert.equal(f.sh.rows[0].trs.length,2);
});
test('bilingual captions collapse when the selected track has no text at the current time',t=>{
 const f=mount(t,{study:true}), captions=f.sh.q('[data-r=subs]');
 f.setTime(12);
 f.sh.tick();
 assert.equal(captions.hidden,false);
 f.sh.q('[data-d=tr]').click();
 assert.equal(captions.hidden,true);
 f.setTime(2);
 f.sh.tick();
 assert.equal(captions.hidden,false);
 f.setTime(12);
 f.sh.tick();
 assert.equal(captions.hidden,true);
 f.sh.q('[data-d=both]').click();
 assert.equal(captions.hidden,false);
 assert.equal(f.commands.some(([type])=>type==='seek'||type==='seekCue'),false);
});
test('the active caption refreshes at the same index and clears through a silent gap',t=>{
 const f=mount(t,{study:true});
 assert.equal(f.sh.q('[data-r=s]').textContent,'A source sentence');
 f.rows[0].src='Edited source';f.rows[0].trs=['Yeni çeviri'];
 f.setRevision('r2');f.sh.tick();
 assert.equal(f.sh.q('[data-r=s]').textContent,'Edited source');
 assert.equal(f.sh.q('[data-r=t]').textContent,'Yeni çeviri');
 assert.equal(f.sh.lines[0].getAttribute('aria-current'),'true');
 f.setTime(24);f.sh.tick();
 assert.equal(f.sh.q('[data-r=s]').textContent,'');
 assert.equal(f.sh.q('[data-r=subs]').hidden,true);
 assert.equal(f.sh.lines[0].hasAttribute('aria-current'),false);
});
test('a single available language hides the redundant selector and two languages restore it',t=>{
 const f=mount(t,{study:true});
 const display=f.sh.q('.browser-study-display');
 assert.equal(display.hidden,false);
 for(const row of f.rows) row.src='';
 f.setRevision('single');f.sh.tick();
 assert.equal(display.hidden,true);
 assert.equal(f.sh.displayMode(),'tr');
 f.rows[0].src='Original';
 f.setRevision('pair');f.sh.tick();
 assert.equal(display.hidden,false);
 assert.equal(f.sh.displayMode(),'both');
});
test('the cinema language button keeps its preference while only one subtitle language is available', t => {
 const f = mount(t, {cinema:true, prefs:{disp:'tr'}});
 const display = f.sh.q('[data-a=display]');
 assert.equal(display.hidden, false);
 assert.equal(f.sh.displayMode(), 'tr');
 display.focus();
 const translations = f.rows[0].trs;
 f.rows[0].trs = [];
 f.setRevision('source-only'); f.sh.tick();
 assert.equal(display.hidden, true);
 assert.equal(f.w.document.activeElement, f.sh.q('[data-a=toggle]'));
 assert.equal(f.sh.displayMode(), 'src');
 display.click();
 f.rows[0].trs = translations;
 f.setRevision('restored-pair'); f.sh.tick();
 assert.equal(display.hidden, false);
 assert.equal(f.sh.displayMode(), 'tr');
 display.click();
 assert.equal(f.sh.displayMode(), 'both');
});
test('the three Stage decks prioritize listening, sentence work and basic playback', t => {
 const study=mount(t,{study:true}), cinema=mount(t,{cinema:true});
 assert.ok(study.sh.q('.sh-sentence-nav [data-a=loop]'));
 assert.ok(study.sh.q('.sh-dock [data-a=readCurrent]'));
 assert.deepEqual(Array.from(cinema.sh.q('.sh-cinema-transport').children,b=>b.dataset.a),['back','toggle','fwd']);
 cinema.sh.q('.sh-cinema-transport [data-a=fwd]').click();
 assert.deepEqual(cinema.commands[0].slice(0,2),['seekBy',10]);
 assert.ok(cinema.sh.q('.sh-cinema-sentences [data-a=replay]'));
});
test('the workbar yields a duplicate translation retry to the visible status action', t => {
 const retry = {id:'retry-translation', label:'Complete missing translation', primary:true};
 const f = mount(t, {actions:[retry, {id:'translate',label:'Translate'}], sections:[{title:'Subtitles',items:[retry]}]});
 const job = {state:'partial', retry:()=>{}, retryActionId:retry.id};
 f.sh.a.job = () => job;
 f.sh.q('[data-task=retry-translation]').focus();
 f.sh.tick();
 const statusRetry = f.sh.q('[data-a=jobretry]');
 assert.equal(statusRetry.hidden, false);
 assert.equal(f.w.document.activeElement, statusRetry);
 assert.equal(f.sh.q('[data-task=retry-translation]'), null);
 assert.ok(f.sh.q('[data-task=translate]'));
 job.state = 'idle';
 f.sh.tick();
 assert.equal(f.sh.q('[data-r=job]').hidden, true);
 assert.ok(f.sh.q('[data-task=retry-translation]'));
});
test('missing translation filter and next action reuse the timed sentence seek', t => {
 for (const mode of [{}, {study:true}, {cinema:true}]) {
  const f = mount(t, mode);
  assert.equal(f.sh.q('[data-r=missingTools]').hidden, true);
  f.rows[0].translationMissing = 'confirmed';
  f.rows[1].translationMissing = 'suspected';
  f.rows.push({id:'ready',start:20,end:30,timed:true,src:'Translated source',trs:['Hazır çeviri'],unc:[]});
  f.setRevision('missing'); f.sh.tick();
  const filter = f.sh.q('[data-a=missingFilter]'), next = f.sh.q('[data-a=missingNext]');
  assert.match(filter.textContent, /2/);
  filter.click();
  assert.deepEqual(Array.from(f.sh.lines, line => line.hidden), [false,false,true]);
  assert.match(f.sh.lines[1].textContent, /eksik olabilir/);
  next.click(); next.click(); next.click();
  assert.deepEqual(f.commands.map(([command,index])=>[command,index]), [['seekCue',0],['seekCue',1],['seekCue',0]]);
  f.sh.lines[0].querySelector('.src').click();
  assert.deepEqual(f.commands.at(-1).slice(0,2), ['seekCue',0]);
  assert.equal(f.sh.s.follow, false);
  f.setCanSeek(false); f.sh.tick();
  next.click();
  assert.equal(f.commands.length, 4);
  assert.ok(f.sh.lines[1].classList.contains('sh-missing-current'));
  filter.focus();
  f.rows.forEach(row => { delete row.translationMissing; });
  f.setRevision('repaired'); f.sh.tick();
  assert.equal(f.sh.q('[data-r=missingTools]').hidden, true);
  assert.equal(f.w.document.activeElement, f.sh.q('[data-r=q]'));
  assert.ok(f.sh.lines.every(line => !line.hidden));
 }
});
test('untimed content is readable without a timestamp, active line, or seek command',t=>{
 const f=mount(t,{untimed:true}),row=f.sh.q('[data-i="0"]');assert(row.textContent.includes('Yayıncı metni'));assert.equal(row.hasAttribute('tabindex'),false);assert.equal(row.querySelector('.at'),null);assert.equal(f.sh.cur,-1);row.click();assert.equal(f.commands.length,0);
});

test('saved passage focus identifies a real timed line without changing playback or inventing an active line',t=>{
 const f=mount(t);f.sh.focusPassage(12);assert(f.sh.lines[1].classList.contains('sh-search-match'));assert.equal(f.sh.cur,0);assert.equal(f.commands.length,0);
 const plain=mount(t,{untimed:true});plain.sh.focusPassage(0);assert(!plain.sh.root.querySelector('.sh-search-match'));assert.equal(plain.sh.cur,-1);assert.equal(plain.commands.length,0);
});
test('a saved translation passage reveals its independent row while the source is silent', t => {
 const f=mount(t,{study:true,prefs:{disp:'src'}}),state=f.sh.a.state;
 f.rows.push({id:'independent',start:22,end:26,timed:true,src:'',trs:['Saved translated passage'],unc:[],
   standaloneTranslation:true,translationCueIds:['translated-gap'],translationRange:{start:22,end:26}});
 f.sh.a.state=()=>({...state(),captionTracks:[null,{offsetSeconds:2,cues:[{id:'translated-gap',start:20,end:24,text:'Saved translated passage'}]}]});
 f.setRevision('saved-translation');f.sh.tick();
 f.sh.focusPassage(23,{role:'translation'});
 assert.equal(f.sh.lines[2].hidden,false);
 assert.equal(f.sh.lines[2].classList.contains('sh-search-match'),true);
 assert.equal(f.sh.s.follow,false);
 assert.equal(f.commands.some(command=>/seek|replay/.test(command[0])),false);
});
test('destroying an old Stage cannot clear the next source or next track loop',t=>{
 for(const change of ['source','track','none']){
  const f=mount(t);f.sh.s.loop=true;
  if(change==='source')f.sh.a.identity=()=> 'new-source';
  if(change==='track')f.setRevision('new-track');
  let releases=0;f.sh.a.releaseSlot=()=>releases++;
  f.sh.destroy();f.sh.destroy();assert.equal(releases,1);assert.equal(f.commands.filter(command=>command[0]==='loop').length,change==='none'?1:0,change);
  if(change==='none')assert.equal(f.commands.at(-1)[2],'r1');
 }
});

test('rejected loop never appears enabled; task drawer marks native occlusion immediately',async t=>{
 const f=mount(t,{study:true});f.sh.toggleLoop();await Promise.resolve();await Promise.resolve();assert.equal(f.sh.s.loop,false);
 f.sh.q('[data-a=panel]').click();assert.equal(f.sh.root.getAttribute('data-pw-occludes-native'),'true');f.sh.q('[data-pclose]').click();assert.equal(f.sh.root.hasAttribute('data-pw-occludes-native'),false);
});

test('local cinema uses real chapters/queue and the same transport commands',t=>{
 const f=mount(t,{cinema:true});assert(f.sh.root.classList.contains('sh-local'));assert.equal(f.sh.q('.sh-cinema-meta h1').textContent,'Bölüm');
 const chapters=f.sh.root.querySelectorAll('.sh-cinema-chapters .sh-chap');assert.equal(chapters.length,2);chapters[1].click();assert.equal(f.commands.at(-1)[0],'seek');assert.equal(f.commands.at(-1)[1],10);
 f.sh.q('.sh-next-item').click();assert.equal(f.commands.at(-1)[0],'openQueued');assert.equal(f.commands.at(-1)[1],1);
});

test('podcast keeps the native page hidden and language selection reaches the caption owner',t=>{
 const f=mount(t);
 assert.equal(f.sh.root.getAttribute('data-pw-occludes-native'),'true');
 f.sh.q('[data-d=tr]').click();
 assert.deepEqual(f.commands.at(-1).slice(0,2),['display','tr']);
 assert.equal(f.sh.q('[data-r=subs]').hidden,true);
 f.sh.q('[data-a=panel]').click();f.sh.q('[data-pclose]').click();
 assert.equal(f.sh.root.getAttribute('data-pw-occludes-native'),'true');
});
test('word card contains actual subtitle context and marks itself as no definition',async t=>{
 const f=mount(t,{cinema:true});await f.sh.openWord(0,'source');const card=f.sh.q('.sh-word-card');assert.equal(card.hidden,false);assert(card.textContent.includes('A source sentence'));assert(card.textContent.includes('sözlük tanımı değildir'));assert.equal(f.sh.root.getAttribute('data-pw-occludes-native'),'true');f.sh.closeWord();assert.equal(card.hidden,true);
});

test('late word context preserves a newer search focus and revision changes reject word actions before the next tick',async t=>{
 const f=mount(t);let resolve;f.sh.a.cmd=()=>new Promise(done=>resolve=done);
 const pending=f.sh.openWord(0,'source'),search=f.sh.q('[data-r=q]');search.focus();search.value='next';search.dispatchEvent(new f.w.Event('input'));
 resolve({ok:true,word:'source',source:f.rows[0].src,translations:[],canSave:true,saved:false});await pending;
 assert.equal(f.w.document.activeElement,search);assert.equal(search.value,'next');
 let calls=0;f.sh.a.cmd=()=>{calls++;return {ok:true};};f.setRevision('changed-before-tick');await f.sh.runWordAction(f.sh.q('[data-a=wordSave]'));assert.equal(calls,0);
});

test('a word action completion cannot update a revised transcript before the next tick',async t=>{
 const f=mount(t);await f.sh.openWord(0,'source');let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);
 const pending=f.sh.runWordAction(f.sh.q('[data-a=wordSave]'));f.setRevision('new-revision');finish({ok:true,saved:true});await pending;
 assert.notEqual(f.sh.s.word?.saved,true);
});

test('word actions expose pending state without removing focus or dispatching twice',async t=>{
 const f=mount(t);await f.sh.openWord(0,'source');let finish,calls=0;f.sh.a.cmd=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const button=f.sh.q('[data-a=wordSave]');button.focus();const pending=f.sh.runWordAction(button);
 assert.equal(f.sh.q('.sh-word-card').getAttribute('aria-busy'),'true');assert.equal(button.getAttribute('aria-disabled'),'true');assert.equal(f.w.document.activeElement,button);assert.match(f.sh.q('[data-r=wordState]').textContent,/İşleniyor/);
 await f.sh.runWordAction(button);assert.equal(calls,1);finish({ok:false,message:'Controlled failure'});await pending;
 assert.equal(button.getAttribute('aria-disabled'),'false');assert.equal(f.sh.q('[data-r=wordState]').hidden,true);assert.equal(f.sh.s.word.saved,false);
 const body=f.sh.q('.sh-word-body');body.focus();const event=new f.w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});body.dispatchEvent(event);assert.equal(event.defaultPrevented,false);assert.equal(calls,1,'reading the scrollable context never toggles playback');
});

test('an open word card is invalidated when its transcript revision changes',async t=>{
 const f=mount(t,{cinema:true});await f.sh.openWord(0,'source');assert.equal(f.sh.q('.sh-word-card').hidden,false);f.setRevision('r2');f.sh.tick();assert.equal(f.sh.q('.sh-word-card').hidden,true);assert.equal(f.sh.s.word,null);
});

test('a delayed task retry failure cannot overwrite the status of a newer job on the same media',async t=>{
 const f=mount(t);let reject;let job={id:'old-job',state:'failed',retry:()=>new Promise((_,fail)=>reject=fail)};
 f.sh.a.panel=()=>({sections:[],job});f.sh.drawJob();f.sh.q('[data-a=jobretry]').click();
 job={id:'new-job',state:'running',text:'New transcription in progress'};f.sh.drawJob();reject(new Error('Old retry failed'));await new Promise(setImmediate);
 assert.doesNotMatch(f.sh.q('[data-r=toast]').textContent,/Old retry failed/);assert.equal(f.sh.q('[data-r=jobt]').textContent,'New transcription in progress');
});

test('a newer job can retry while an old retry is pending without the old result unlocking it',async t=>{
 for(const action of ['retry','cancel']){
 let finishA,finishB;const f=mount(t),toasts=[];f.sh.toast=message=>toasts.push(message);
 let job={id:'A',state:action==='retry'?'failed':'running',[action]:()=>new Promise(resolve=>finishA=resolve)};f.sh.a.panel=()=>({sections:[],job});f.sh.drawJob();
 const retry=f.sh.q('[data-a=job'+action+']'),old=f.sh.runStatusAction(retry,job[action]);assert.equal(retry.disabled,true);
 job={id:'B',state:job.state,[action]:()=>new Promise(resolve=>finishB=resolve)};f.sh.drawJob();assert.equal(retry.disabled,false,'the new job does not inherit the old request lock');
 const current=f.sh.runStatusAction(retry,job[action]);finishA({ok:false,message:'Old retry failed'});await old;
 assert.equal(retry.disabled,true,'old completion cannot release the current retry');assert.equal(retry.getAttribute('aria-busy'),'true');assert.deepEqual(toasts,[]);
 finishB({ok:true});await current;assert.equal(retry.disabled,false);assert.equal(retry.hasAttribute('aria-busy'),false);
 }
});

test('shared retry suppresses a second click and shows an async failure',async t=>{
 const f=mount(t,{study:true});
 let calls=0, reject;
 f.sh.a.panel=()=>({sections:[],job:{state:'failed',retry:()=>{calls++;return new Promise((_,fail)=>{reject=fail;});}}});
 f.sh.tick();
 const retry=f.sh.q('[data-a=jobretry]');
 retry.click();retry.click();
 assert.equal(calls,1);
 reject(new Error('Kaynak hazır değil'));
 await new Promise(setImmediate);
 assert.equal(retry.disabled,false);
 assert.equal(f.sh.q('[data-r=toast]').textContent,'Kaynak hazır değil');
});
test('shared task status distinguishes unknown progress, measured progress and failure',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study});
  const status=f.sh.q('[data-r=jobt]'), bar=f.sh.q('[data-r=jobbar]'), percent=f.sh.q('[data-r=jobpercent]');
  let job={state:'running',text:'Altyazı hazırlanıyor',progress:null};
  f.sh.a.panel=()=>({job,sections:[]});
  f.sh.tick();
  assert.equal(percent.hidden,true);
  assert.equal(bar.hasAttribute('aria-valuenow'),false);
  const node=status.firstChild;
  job={...job,progress:.42};
  f.sh.tick();
  assert.equal(status.firstChild,node);
  assert.equal(bar.getAttribute('aria-valuenow'),'42');
  assert.equal(percent.hidden,false);
  assert.equal(percent.textContent,'42%');
  job={state:'failed',text:'Kaynağa ulaşılamadı',retry:()=>{}};
  f.sh.tick();
  assert.equal(status.textContent,job.text);
  assert.equal(bar.hidden,true);
  assert.equal(percent.hidden,true);
  assert.equal(f.sh.q('[data-a=jobretry]').hidden,false);
 }
});
test('shared volume reconciles a rejected change even while the slider has focus',async t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}), input=f.sh.q('.sh-volume input');
  const state=f.sh.a.state;
  let volume=0;
  f.sh.a.state=()=>({...state(),volume});
  f.sh.a.cmd=()=>({ok:false});
  input.focus();
  f.sh.tick();
  assert.equal(input.value,'0');
  assert.equal(f.sh.q('[data-r=volumeIcon]').dataset.glyph,'volumeZero');
  input.value='.7';
  input.dispatchEvent(new f.w.Event('input'));
  await new Promise(setImmediate);
  assert.equal(input.value,'0');
  volume=.4;
  f.sh.tick();
  assert.equal(input.getAttribute('aria-valuetext'),'40%');
  assert.equal(f.sh.q('.sh-volume output').textContent,'40%');
 }
});
test('audio study retains identity and exposes volume without an empty caption box',t=>{
 const f=mount(t,{audio:true,empty:true,study:true});
 assert.equal(f.sh.q('.sh-audio-summary h1').textContent,'Bölüm');assert(f.sh.root.classList.contains('sh-audio'));
 assert.equal(f.sh.q('[data-r=subs]').hidden,true);const volume=f.sh.q('.sh-volume input');assert.equal(volume.value,'0.42');
 volume.value='.7';volume.dispatchEvent(new f.w.Event('input'));assert.deepEqual(f.commands.at(-1).slice(0,2),['volume',.7]);assert.equal(f.sh.q('.sh-volume output').textContent,'70%');
});
test('visible podcast task buttons invoke the existing task service only once while pending',async t=>{
 let accept,calls=0;const f=mount(t,{audio:true,empty:true,actions:[{id:'transcribe-translate',label:'Yazıya dök ve çevir',primary:true,run:()=>{calls++;return new Promise(resolve=>accept=resolve);}}]});
 const button=f.sh.q('[data-task="transcribe-translate"]');assert.equal(button.disabled,false);button.click();button.click();assert.equal(calls,1);
 assert.equal(f.sh.q('[data-task="transcribe-translate"]').disabled,true);accept({queued:true,id:'existing-job'});await new Promise(resolve=>setImmediate(resolve));assert(f.sh.q('[data-r=toast]').textContent.includes('kuyruğa'));
});

test('podcast and bilingual use one browser study surface with the same media and transcript controls',t=>{
 const podcast=mount(t),study=mount(t,{study:true});
 for(const {sh}of [podcast,study]){
  assert(sh.root.classList.contains('sh-browser-study'));
  assert(sh.q('.browser-study-media [data-r=slot]'));
  assert(sh.q('.browser-study-panel.bp-panel [data-r=scroll]'));
  assert(sh.q('.bp-search [data-r=q]'));
  assert.equal(sh.root.querySelectorAll('[data-r=disp] [data-d]').length,3);
  assert.equal(sh.root.querySelectorAll('.cue-card').length,2);
  assert.equal(sh.q('.sh-deck,.sh-lyrics,.sh-mini'),null);
  assert.equal(sh.root.querySelectorAll('[id]').length,0);
  sh.q('[data-a=assistant]').click();assert.equal((sh===podcast.sh?podcast:study).commands.at(-1)[0],'assistant');
 }
});

test('shared transcript keeps search and stopped follow through transcript updates',t=>{
 const f=mount(t),search=f.sh.q('[data-r=q]');
 search.value='next';search.dispatchEvent(new f.w.Event('input'));
 assert.equal(f.sh.s.follow,false);assert.equal(f.sh.lines[0].hidden,true);assert.equal(f.sh.lines[1].hidden,false);
 f.setRevision('r2');f.sh.tick();assert.equal(f.sh.lines[0].hidden,true);assert.equal(f.sh.lines[1].hidden,false);
 f.sh.q('[data-a=follow]').click();assert.equal(search.value,'');assert(f.sh.lines.every(row=>!row.hidden));assert.equal(f.commands.length,0);
 f.sh.q('[data-a=follow]').click();assert.equal(f.sh.s.follow,false);assert.equal(f.sh.q('[data-a=follow]').getAttribute('aria-pressed'),'false');
});


test('untimed audio keeps its transcript readable without an empty subtitle trough',t=>{
 const f=mount(t,{audio:true,untimed:true,study:true,timingNotice:'Open audio timing is unverified'});assert(f.sh.q('[data-r=subs]').hidden);assert.equal(f.sh.q('.sh-note').textContent,'Open audio timing is unverified');assert.match(f.sh.q('[data-r=scroll]').textContent,/Yayıncı metni/);assert.equal(f.sh.cur,-1);
});


test('sentence note editor saves entered note and return uses a real timed cue',async t=>{
 const f=mount(t,{save:true});f.sh.q('[data-i="0"] [data-act=save]').click();const box=f.sh.q('.sh-note-card');assert.equal(box.hidden,false);
 box.querySelector('[data-a=noteSeek]').click();assert.deepEqual(f.commands.at(-1).slice(0,2),['seekCue',0]);
 box.querySelector('textarea').value='Remember this';box.querySelector('[data-a=noteSave]').click();await Promise.resolve();await Promise.resolve();
 const save=f.commands.find(c=>c[0]==='save');assert.equal(save[1].row,0);assert.equal(save[1].note,'Remember this');assert.equal(save[2],'r1');
});

test('untimed note editor keeps its draft on revision change without inventing a return-time action',t=>{
 const f=mount(t,{save:true,untimed:true});f.sh.q('[data-act=save]').click();const box=f.sh.q('.sh-note-card');assert.equal(box.hidden,false);assert.equal(box.querySelector('[data-a=noteSeek]'),null);assert.match(box.textContent,/Zamansız/);
 assert.equal(f.commands.length,0);f.setRevision('new');f.sh.tick();assert.equal(box.hidden,false);assert.equal(f.sh.s.note.stale,true);assert.equal(box.querySelector('[data-a=noteSeek]'),null);assert.equal(box.querySelector('[data-a=noteSave]').disabled,true);
});


test('note editor captures only a source-row text selection and omits unrelated translation',async t=>{
 const f=mount(t,{save:true}),source=f.sh.q('[data-i="0"] .src'),range=f.w.document.createRange();range.setStart(source.firstChild,2);range.setEnd(source.firstChild,8);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);
 f.sh.openNote(0);assert.equal(f.sh.s.note.excerpt,'source');assert.equal(f.sh.q('.sh-note-card .sh-word-context').textContent,'source');assert.equal(f.sh.q('.sh-note-card .sh-word-translation'),null);
 await f.sh.saveNote();const saved=f.commands.find(c=>c[0]==='save');assert.equal(saved[1].excerpt,'source');assert.equal(saved[2],'r1');
 const translation=f.sh.q('[data-i="0"] .tr');range.selectNodeContents(translation);selection.removeAllRanges();selection.addRange(range);f.sh.openNote(0);assert.equal(f.sh.s.note.excerpt,undefined);assert.equal(f.sh.q('.sh-note-card .sh-word-context').textContent,'A source sentence');
});


test('podcast interval control previews duration, freezes scope and never falls back on invalid input',async t=>{
 const calls=[],f=mount(t,{study:true,processing:true,actions:[{id:'transcribe-translate',label:'Yazıya dök ve çevir',run:async config=>{calls.push(config);return {queued:true};}}]});
 assert.equal(f.sh.scopeBox.querySelector('.sh-seg').children.length,2);assert.match(f.sh.scopeBox.textContent,/Bölümün tamamı/);assert.match(f.sh.scopeBox.querySelector('.sh-scope-summary').textContent,/0:30/);
 f.sh.scopeBox.querySelector('[data-scope=range]').click();assert.equal(f.sh.scopeBox.querySelector('[data-scope=range]').getAttribute('aria-selected'),'true');f.sh.scopeBox.querySelector('[data-scope-time=start]').value='0:05';f.sh.scopeBox.querySelector('[data-scope-time=end]').value='0:17';f.sh.updateScope();assert.match(f.sh.scopeBox.querySelector('.sh-scope-summary').textContent,/0:12/);
 await f.sh.startTask('transcribe-translate');assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].range)),{start:5,end:17});assert(Object.isFrozen(calls[0].range));
 f.sh.scopeBox.querySelector('[data-scope-time=end]').value='0:99';await f.sh.startTask('transcribe-translate');assert.equal(calls.length,1);
 f.sh.scopeBox.querySelector('[data-scope=full]').click();await f.sh.startTask('transcribe-translate');assert.equal(calls[1].range,null);
});


test('Tasks panel uses the same scoped task path and prevents duplicate range jobs',async t=>{
 let resolve;const calls=[],action={id:'transcribe-translate',label:'Scoped Whisper',run:config=>{calls.push(config);return new Promise(r=>resolve=r);}};
 const f=mount(t,{processing:true,actions:[action]});f.sh.a.panel=()=>({sections:[{title:'Tasks',items:[action]}]});
 f.sh.scopeMode='range';f.sh.scopeBox.querySelector('[data-scope-time=start]').value='0:05';f.sh.scopeBox.querySelector('[data-scope-time=end]').value='0:12';f.sh.s.panel=true;f.sh.drawPanel(true);
 f.sh.q('.sh-pbtn').click();f.sh.q('[data-task="transcribe-translate"]').click();f.sh.tick();f.sh.q('.sh-pbtn').click();
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].range)),{start:5,end:12});assert.equal(f.sh.q('.sh-pbtn').disabled,true);
 resolve({queued:true});await new Promise(setImmediate);f.sh.tick();assert.equal(f.sh.q('.sh-pbtn').disabled,false);
});

test('transport and panel failures stay visible and never leave rejected click promises',async t=>{
 const f=mount(t);f.sh.a.cmd=()=>Promise.reject(Error('Media unavailable'));const r=await f.sh.run('toggle');assert.equal(r.ok,false);assert.match(f.sh.q('[data-r=toast]').textContent,/Media unavailable/);
 f.sh.a.cmd=()=>{throw Error('Source changed now');};assert.equal((await f.sh.run('seek',3)).ok,false);assert.match(f.sh.q('[data-r=toast]').textContent,/Source changed now/);
 f.sh.a.panel=()=>({sections:[{title:'Tools',items:[{type:'button',label:'Failed tool',run:()=>Promise.reject(Error('Tool unavailable'))}]}]});f.sh.s.panel=true;f.sh.drawPanel(true);f.sh.q('.sh-pbtn').click();await new Promise(setImmediate);assert.match(f.sh.q('[data-r=toast]').textContent,/Tool unavailable/);assert.equal(f.sh.q('.sh-pbtn').disabled,false);
});

test('Sahne shortcuts preserve input, task opener and focused transcript row',t=>{
 const f=mount(t,{study:true}),key=(node,key)=>node.dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 const panel=f.sh.q('.sh-top-r [data-a=panel]');panel.focus();panel.click();
 assert.equal(f.w.document.activeElement,f.sh.q('[data-pclose]'));
 key(f.w.document.activeElement,'Escape');assert.equal(f.w.document.activeElement,panel);
 const transcript=f.sh.q('[data-a=transcript]');transcript.focus();transcript.click();
 const search=f.sh.q('[data-r=q]');assert.equal(f.w.document.activeElement,search);
 key(search,' ');assert.equal(f.commands.length,0);
 key(search,'Escape');assert.equal(f.w.document.activeElement,transcript);
 const seek=()=>f.sh.lines[0].querySelector('[data-a=cueSeek]');
 seek().focus();f.setTime(12);f.sh.tick();assert.equal(f.w.document.activeElement,seek());
 f.setRevision('r2');f.sh.tick();assert.equal(f.w.document.activeElement,seek());
 f.sh.lines[0].querySelector('.src').click();assert.equal(f.commands.length,0);
 key(seek(),'ArrowDown');
 const next=f.sh.lines[1].querySelector('[data-a=cueSeek]');
 assert.equal(f.w.document.activeElement,next);assert.equal(f.commands.length,0);
 next.click();assert.deepEqual(f.commands.at(-1).slice(0,2),['seekCue',1]);
});

test('chapter navigation preserves transcript filters and restores the narrow drawer opener',t=>{
 const f=mount(t,{study:true});
 f.w.innerWidth=900;
 const entry=f.sh.q('.sh-chapter-entry'), list=f.sh.q('[data-r=chaps]');
 const search=f.sh.q('[data-r=q]'), scroll=f.sh.q('[data-r=scroll]');
 search.value='source';
 search.dispatchEvent(new f.w.Event('input'));
 scroll.scrollTop=70;
 entry.click();
 assert.equal(list.hidden,false);
 assert.equal(f.w.document.activeElement,list.querySelector('[aria-current=true]'));
 assert.equal(f.sh.root.hasAttribute('data-pw-occludes-native'),false);
 f.w.innerWidth=740;
 f.w.dispatchEvent(new f.w.Event('resize'));
 assert.equal(f.sh.root.hasAttribute('data-pw-occludes-native'),true);
 f.w.innerWidth=900;
 f.w.dispatchEvent(new f.w.Event('resize'));
 assert.equal(f.sh.root.hasAttribute('data-pw-occludes-native'),false);
 assert.equal(f.commands.length,0);
 f.sh.q('[data-a=reading]').click();
 assert.equal(list.hidden,true);
 assert.equal(search.value,'source');
 assert.equal(scroll.scrollTop,70);
 f.sh.q('.browser-study-transcript-close').click();
 assert.equal(f.w.document.activeElement,entry);
 assert.equal(f.sh.root.hasAttribute('data-pw-occludes-native'),false);
 f.sh.focusPassage(12);
 assert.equal(f.sh.s.transcript,true);
 assert.equal(search.value,'');
 assert.equal(f.sh.lines[1].hidden,false);
 assert.equal(f.sh.lines[1].classList.contains('sh-search-match'),true);
 assert.equal(f.sh.s.follow,false);
 assert.equal(f.commands.length,0);
});
test('same-media mode changes preserve the reading pane and chapter view',t=>{
 const podcast=mount(t);
 podcast.sh.showReading(true);
 podcast.sh.s.transcript=true;
 const prefs=podcast.sh.prefs(true), next=mount(t,{study:true,prefs});
 assert.equal(next.sh.s.transcript,true);
 assert(next.sh.root.classList.contains('sh-chapters-open'));
 const other=mount(t,{study:true,prefs,identity:'other-source'});
 assert.equal(other.sh.s.transcript,false);
 assert(!other.sh.root.classList.contains('sh-chapters-open'));
});
test('chapter metadata refresh preserves reading position and keyboard ownership',t=>{
 const f=mount(t),list=f.sh.q('[data-r=chaps]');f.sh.showReading(true);
 const query=f.sh.q('[data-r=chapterSearch]');query.value='bölüm';query.dispatchEvent(new f.w.Event('input'));
 const second=list.querySelectorAll('button')[1];second.focus();list.scrollTop=65;
 f.sh.drawChapters([{t:0,label:'Giriş güncellendi'},{t:10,label:'İkinci bölüm'},{t:20,label:'Son bölüm'}]);
 assert.equal(f.w.document.activeElement.textContent,'0:10İkinci bölüm');assert.equal(list.scrollTop,65);assert.equal(query.value,'bölüm');assert.equal(f.commands.length,0);
 f.sh.drawChapters([{t:0,label:'Giriş güncellendi'},{t:20,label:'Son bölüm'}]);
 assert.match(f.w.document.activeElement.textContent,/Son bölüm/);
 query.focus();f.sh.drawChapters([{t:20,label:'Son bölüm güncellendi'}]);assert.equal(f.w.document.activeElement,query);
 list.querySelector('button').focus();f.sh.drawChapters([]);assert.equal(f.w.document.activeElement,f.sh.q('[data-r=q]'));
});

test('chapter highlights and jumps use timed buttons only',t=>{
 const f=mount(t);f.setTime(12);f.sh.tick();
 const active=f.sh.q('.sh-chap[aria-current=true]');
 assert.match(active.textContent,/İkinci bölüm/);
 active.click();assert.equal(f.commands.at(-1)[1],10);
 f.sh.drawChapters([{label:'Only prose',t:null}]);
 assert.equal(f.sh.q('button.sh-chap'),null);assert.match(f.sh.q('.sh-chaps').textContent,/salt okunur/);
});


test('follow positions an active row relative to its scrolling pane without moving focus',t=>{
 const f=mount(t,{study:true}),scroll=f.sh.q('[data-r=scroll]'),line=f.sh.lines[0],search=f.sh.q('[data-r=q]');
 scroll.scrollTop=200;scroll.getBoundingClientRect=()=>({top:400});line.getBoundingClientRect=()=>({top:600});
 Object.defineProperty(scroll,'clientHeight',{value:300});Object.defineProperty(line,'offsetHeight',{value:90});
 search.focus();f.sh.scrollToActive(true);assert.equal(scroll.scrollTop,330);assert.equal(f.w.document.activeElement,search);
});


test('layout follow respects manual browsing and focused transcript controls',t=>{
 const f=mount(t,{study:true});let callback,calls=0;
 f.w.requestAnimationFrame=fn=>{callback=fn;return 999;};
 f.sh.scrollToActive=()=>{calls++;};
 f.sh.s.follow=false;f.sh.followAfterLayout();callback();assert.equal(calls,0);
 const seek=f.sh.lines[0].querySelector('[data-a=cueSeek]');
 f.sh.s.follow=true;seek.focus();f.sh.followAfterLayout();callback();assert.equal(calls,0);
 seek.blur();f.sh.followAfterLayout();callback();assert.equal(calls,0,'leaving keyboard reading never silently resumes follow');
 f.sh.s.follow=true;f.sh.followAfterLayout();callback();assert.equal(calls,1);
 f.sh.destroy();callback();assert.equal(calls,1);
});


for (const study of [false,true]) {
 test(`${study?'Bilingual':'Podcast'} reading controls navigate matches, preserve text size and restore audio`,async t=>{
  const f=mount(t,{study}), q=f.sh.q('[data-r=q]');
  q.value='sentence';q.dispatchEvent(new f.w.Event('input'));
  f.sh.q('[data-a=matchNext]').click();
  assert.equal(f.sh.q('[data-r=searchCount]').textContent,'1 / 2');
  assert(f.sh.lines[0].classList.contains('sh-query-match'));
  f.sh.q('[data-a=matchNext]').click();
  assert.equal(f.sh.q('[data-r=searchCount]').textContent,'2 / 2');
  assert.equal(f.sh.q('[data-a=matchNext]').getAttribute('aria-disabled'),'true');
  f.sh.q('[data-a=matchPrev]').click();
  assert(f.sh.lines[0].classList.contains('sh-query-match'));
  assert.equal(f.commands.length,0);
  const size=f.sh.q('[data-r=readingSize]');
  size.value='large';size.dispatchEvent(new f.w.Event('change'));
  assert.equal(f.sh.root.dataset.readingSize,'large');
  const restored=mount(t,{study:!study,prefs:f.sh.prefs(true)});
  assert.equal(restored.sh.q('[data-r=readingSize]').value,'large');
  f.sh.q('.sh-chapter-entry').click();
  const chapter=f.sh.q('[data-r=chapterSearch]');
  chapter.value='İkinci';chapter.dispatchEvent(new f.w.Event('input'));
  assert.equal(f.sh.q('[data-r=chapterCount]').textContent,'1 başlık');
  assert(f.sh.q('button.sh-chap').hidden);
  f.sh.q('[data-a=currentChapter]').click();
  assert.equal(chapter.value,'');
  assert.equal(f.w.document.activeElement,f.sh.q('button.sh-chap'));
  assert.equal(f.commands.length,0);
  const state=f.sh.a.state, cmd=f.sh.a.cmd;
  let volume=.42;
  f.sh.a.state=()=>({...state(),volume});
  f.sh.a.cmd=(...args)=>{if(args[0]==='volume')volume=args[1];return cmd(...args);};
  const mute=f.sh.q('[data-a=mute]');
  mute.click();await new Promise(setImmediate);
  assert.equal(mute.getAttribute('aria-pressed'),'true');
  mute.click();await new Promise(setImmediate);
  assert.equal(volume,.42);
  assert.equal(mute.getAttribute('aria-pressed'),'false');
 });
}
test('shared search matches individual visible texts and starts a new query at the top',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}), input=f.sh.q('[data-r=q]'), scroll=f.sh.q('[data-r=scroll]');
  const search=value=>{
   input.value=value;
   input.dispatchEvent(new f.w.Event('input'));
  };
  scroll.scrollTop=150;
  search('sentence Birinci');
  assert.equal(scroll.scrollTop,0);
  assert.equal(f.sh.q('[data-r=searchEmpty]').hidden,false);
  search('birinci   çeviri');
  assert.equal(f.sh.lines[0].hidden,false);
  f.rows[0].trs=['İSTANBUL IŞIK'];
  f.setRevision('turkish-search');
  f.sh.tick();
  search('istanbul ışık');
  assert.equal(f.sh.lines[0].hidden,false);
  scroll.scrollTop=44;
  f.setRevision('same-matches');
  f.sh.tick();
  assert.equal(scroll.scrollTop,44);
  assert.equal(f.commands.length,0);
 }
});
test('transcript search explains language-specific no matches and clears without playback or follow',t=>{
 const f=mount(t,{study:true}),q=f.sh.q('[data-r=q]'),clear=f.sh.q('[data-r=clearSearch]');
 assert.equal(clear.hidden,true);assert.equal(f.sh.q('[data-r=searchCount]').hidden,true);
 q.value='next';q.dispatchEvent(new f.w.Event('input'));
 assert.match(f.sh.q('[data-r=searchCount]').textContent,/1 satır/);assert.equal(clear.hidden,false);
 f.sh.q('[data-d=tr]').click();assert.equal(f.sh.q('[data-r=searchEmpty]').hidden,false);assert.match(f.sh.q('[data-r=searchCount]').textContent,/0 satır/);
 f.rows[1].trs=['next translation'];f.setRevision('translation-added');f.sh.tick();assert.equal(f.sh.q('[data-r=searchEmpty]').hidden,true);
 const before=f.commands.length;clear.click();assert.equal(q.value,'');assert.equal(f.w.document.activeElement,q);assert.equal(f.sh.s.follow,false);assert.equal(f.commands.length,before);assert.equal(clear.hidden,true);
});


test('long note excerpt stays complete in a keyboard-readable region without toggling playback',t=>{
 const f=mount(t,{study:true,save:true}),text='A long original passage. '.repeat(240);
 f.rows[0].src=text;f.setRevision('long-note');f.sh.tick();
 f.sh.openNote(0,f.sh.lines[0].querySelector('[data-act=save]'));
 const region=f.sh.q('.sh-note-excerpt');assert.equal(region.querySelector('.sh-word-context').textContent,text);assert.equal(region.tabIndex,0);
 assert(f.sh.q('.sh-note-card header [data-a=noteClose]'));assert(f.sh.q('.sh-note-card footer [data-a=noteSave]'));
 region.focus();const before=f.commands.length;region.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));assert.equal(f.commands.length,before);
 f.sh.q('[data-a=noteClose]').click();assert.equal(f.sh.s.note,null);assert.equal(f.w.document.activeElement,f.sh.lines[0].querySelector('[data-act=save]'));
});


test('task volume shows its actual value and timing groups retain separate callbacks',t=>{
 const changes=[],offsets=[],f=mount(t,{study:true,sections:[{title:'Timing',items:[{type:'offset',label:'Original',text:'1 s early',run:v=>offsets.push(['source',v])},{type:'offset',label:'Translation',text:'2 s late',run:v=>offsets.push(['translation',v])},{type:'range',label:'Volume',value:.49,onChange:v=>changes.push(v)}]}]});
 f.sh.q('[data-a=panel]').click();const groups=f.sh.root.querySelectorAll('.sh-offset');assert.equal(groups[0].getAttribute('aria-label'),'Original');
 groups[1].querySelectorAll('button')[2].click();assert.deepEqual(offsets,[['translation',null]]);
 const input=f.sh.q('.sh-prange input');assert.equal(f.sh.q('.sh-prange output').textContent,'49%');input.value='.73';input.dispatchEvent(new f.w.Event('input'));assert.equal(f.sh.q('.sh-prange output').textContent,'73%');assert.deepEqual(changes,[.73]);
});

test('task panel rebinds unchanged-looking timing controls after a subtitle revision',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}),calls=[];
  f.sh.a.panel=()=>{const revision=f.sh.a.state().rev;return {sections:[{title:'Timing',items:[{type:'offset',label:'Original',text:'0 s',run:delta=>{if(revision===f.sh.a.state().rev)calls.push([revision,delta]);}}]}],job:{state:'idle'}};};
  f.sh.togglePanel();const old=f.sh.q('.sh-offset button');old.focus();
  f.setRevision('replacement-track');f.sh.tick();
  const current=f.sh.q('.sh-offset button');assert.notEqual(current,old,'same timing label still needs a current track callback');
  assert.equal(f.w.document.activeElement,current);old.click();assert.deepEqual(calls,[],'detached control stays inert');
  current.click();assert.deepEqual(calls,[['replacement-track',-.1]]);
 }
});

test('task panel fields reject changed-source and detached controls',t=>{
 const calls=[],items=[{type:'offset',label:'Timing',text:'0 s',run:v=>calls.push(['offset',v])},{type:'range',label:'Volume',value:.5,onChange:v=>calls.push(['volume',v])},{type:'select',label:'Track',value:'a',options:[],onChange:v=>calls.push(['track',v])}];
 const f=mount(t,{sections:[{title:'Controls',items}]});let choose;
 f.w.PlayerUiKit={select:options=>{choose=options.onChange;const div=f.w.document.createElement('div');div.trigger=f.w.document.createElement('button');div.append(div.trigger);return div;}};
 f.sh.q('[data-a=panel]').click();
 const offset=f.sh.q('.sh-offset button'),range=f.sh.q('.sh-prange input'),oldChoice=choose;
 f.sh.a.identity=()=> 'new-source';offset.click();range.value='.7';range.dispatchEvent(new f.w.Event('input'));choose('b');
 assert.deepEqual(calls,[]);
 f.sh.a.identity=()=> 'same-source';f.sh.drawPanel(true);
 offset.click();range.dispatchEvent(new f.w.Event('input'));oldChoice('b');assert.deepEqual(calls,[]);
 f.sh.q('.sh-offset button').click();f.sh.q('.sh-prange input').dispatchEvent(new f.w.Event('input'));choose('b');assert.equal(calls.length,3);
 f.sh.togglePanel();choose('a');assert.equal(calls.length,3);
});

test('malformed cue intervals remain readable but cannot expose a loop action',async t=>{
 for(const [start,end]of [[NaN,10],[0,Infinity],[4,4],[5,3]]){
  const f=mount(t,{study:true});Object.assign(f.rows[0],{start,end});f.setRevision('malformed-times');f.sh.tick();
  const loop=f.sh.lines[0].querySelector('[data-act=loop]');assert.equal(loop.disabled,true);assert(f.sh.lines[0].textContent.includes('A source sentence'));loop.click();assert.equal(f.commands.length,0);
  assert.equal(f.sh.lines[0].querySelector('[data-a=cueSeek]').disabled,true);await f.sh.setSentenceLoop(true,0);assert.equal(f.commands.length,0);
 }
});

test('sentence seek availability follows duration changes even without a transcript revision',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study}),state=f.sh.a.state;let duration=10.2;
  f.sh.a.state=()=>({...state(),duration});f.sh.tick();const button=f.sh.lines[1].querySelector('[data-a=cueSeek]');assert.equal(button.disabled,false);
  duration=9.8;f.sh.tick();assert.equal(f.sh.lines[1].querySelector('[data-a=cueSeek]'),button);assert.equal(button.disabled,true);assert.match(button.getAttribute('aria-label'),/doğrulanamadı/);assert.equal(f.sh.lines[1].querySelector('[data-act=loop]').disabled,true);assert.equal(f.sh.q('[data-a=next]').disabled,true);button.click();assert.equal(f.commands.length,0);
  duration=10.2;f.sh.tick();assert.equal(button.disabled,false);button.click();assert.equal(f.commands.at(-1)[0],'seekCue');
 }
});

test('shared transport enables only usable sentence tools and supports keyboard timeline bounds', t => {
  const plain = mount(t, { untimed: true });
  assert(plain.sh.q('[data-a=replay]').disabled);
  assert(plain.sh.q('[data-a=loop]').disabled);
  assert(!plain.sh.q('[data-a=back]').disabled);
  assert.match(plain.sh.q('[data-a=replay]').title, /zamanlı transkript/);   // kalıcı uyarı satırı yok; açıklama tooltip

  const study = mount(t, { study: true });
  assert(!study.sh.q('[data-a=replay]').disabled);
  study.setTime(25);
  study.sh.tick();
  assert(study.sh.q('[data-a=replay]').disabled);
  assert(study.sh.q('[data-a=next]').disabled);
  const timeline = study.sh.q('[data-r=wave]');
  for (const key of ['Home', 'End']) {
    timeline.dispatchEvent(new study.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  assert.deepEqual(study.commands.map(command => command.slice(0, 2)), [['seek', 0], ['seek', 30]]);
  study.setCanSeek(false);
  study.sh.tick();
  assert(study.sh.q('[data-a=back]').disabled);
  assert.equal(study.sh.lines[0].hasAttribute('tabindex'), false);
  assert(study.sh.lines[0].querySelector('[data-act=loop]').disabled);
  study.sh.lines[0].click();
  assert.equal(study.commands.length, 2);
  study.setCanSeek(true);
  study.sh.tick();
  assert.equal(study.sh.lines[0].hasAttribute('role'),false);
  assert(!study.sh.lines[0].querySelector('[data-a=cueSeek]').disabled);
  assert(!study.sh.lines[0].querySelector('[data-act=loop]').disabled);
});

test('playback recovery hands keyboard focus back to transport without stealing it from other controls', async t => {
 const f=mount(t,{study:true}), retry=f.sh.q('[data-a=playbackRetry]'), play=f.sh.q('[data-a=toggle]');
 const search=f.sh.q('[data-r=q]');
 let finish;
 const error={message:'Playback failed',label:'Retry',run:()=>new Promise(resolve=>{finish=resolve;})};
 let recovery=error;
 f.sh.a.recovery=()=>recovery;
 f.sh.drawJob();
 retry.focus();
 const pending=f.sh.runStatusAction(retry,error.run);
 assert.equal(f.w.document.activeElement,play);
 search.focus();
 recovery=null;
 f.sh.drawJob();
 finish();
 await pending;
 assert.equal(f.w.document.activeElement,search);
 assert.equal(retry.closest('[data-r=recovery]').hidden,true);
 recovery=error;
 f.sh.drawJob();
 retry.focus();
 recovery=null;
 f.sh.drawJob();
 assert.equal(f.w.document.activeElement,play);
 recovery=error;
 f.sh.drawJob();
 retry.focus();
 const interrupted=f.sh.runStatusAction(retry,error.run);
 play.blur();
 finish();
 await interrupted;
 assert.equal(f.w.document.activeElement,play);
});

test('Full sentence opens the current transcript row without issuing a playback command', t => {
 const f=mount(t,{study:true}), button=f.sh.q('[data-a=readCurrent]');
 const query=f.sh.q('[data-r=q]');
 query.value='no matching sentence';
 query.dispatchEvent(new f.w.Event('input'));
 assert.equal(f.sh.lines[0].hidden,true);
 button.click();
 assert.equal(f.sh.s.transcript,true);
 assert.equal(f.sh.lines[0].hidden,false);
 assert.equal(f.w.document.activeElement,f.sh.lines[0]);
 assert.equal(f.commands.length,0);
 f.sh.q('.browser-study-transcript-close').click();
 assert.equal(f.w.document.activeElement,button);
});
test('Full sentence brings the active translation into view inside a tall transcript card', t => {
 const f=mount(t,{study:true}), scroll=f.sh.q('[data-r=scroll]'), line=f.sh.lines[0];
 const part=line.querySelectorAll('[data-translation-part]')[1];
 f.sh.livePart=part;
 Object.defineProperty(scroll,'clientHeight',{value:180});
 Object.defineProperty(line,'offsetHeight',{value:360});
 Object.defineProperty(part,'offsetHeight',{value:40});
 scroll.getBoundingClientRect=()=>({top:100});
 line.getBoundingClientRect=()=>({top:120});
 part.getBoundingClientRect=()=>({top:390});
 const frames=[];
 f.w.requestAnimationFrame=callback=>frames.push(callback);
 f.sh.q('[data-a=readCurrent]').click();
 frames.at(-1)();
 assert.equal(scroll.scrollTop,220);
 assert.equal(f.w.document.activeElement,line);
 assert.equal(f.commands.length,0);
});
test('track rebuild preserves focus on the same independent translation when cue ids overlap', t => {
 const f=mount(t,{study:true,prefs:{disp:'tr'}});
 f.rows[1]={...f.rows[1],id:f.rows[0].id,src:'',trs:['Independent translation'],
  standaloneTranslation:true,translationCueIds:['independent'],translationRange:{start:12,end:16}};
 f.setRevision('independent-added');f.sh.tick();
 f.sh.lines[1].querySelector('[data-a=cueSeek]').focus();
 f.setRevision('new-revision');f.sh.tick();
 assert.equal(f.w.document.activeElement.closest('[data-i]').dataset.i,'1');
});
test('track rebuild preserves a translation sentence button through a part reorder', t => {
 const f=mount(t,{study:true,prefs:{disp:'tr'}});
 Object.assign(f.rows[0],{translationCueIds:['one','two'],translationRanges:[{start:1,end:3},{start:3,end:6}]});
 f.setRevision('parts');f.sh.tick();
 f.sh.lines[0].querySelector('[data-a=translationSeek][data-part="1"]').focus();
 const state=f.sh.a.state;
 const rows=[{...f.rows[0],translationCueIds:['two','one'],translationRanges:[{start:3,end:6},{start:1,end:3}],trs:['Second','First']},...f.rows.slice(1)];
 f.sh.a.state=()=>({...state(),rows});
 f.setRevision('reordered');f.sh.tick();
 assert.equal(f.w.document.activeElement.dataset.a,'translationSeek');
 assert.equal(f.w.document.activeElement.dataset.part,'0');
});
test('closing Full sentence restores follow and resuming from a search uses the current cue', t => {
 const f=mount(t,{study:true}), button=f.sh.q('[data-a=readCurrent]');
 button.click();
 assert.equal(f.sh.s.follow,false);
 f.setTime(12);
 f.sh.tick();
 f.sh.q('.browser-study-transcript-close').click();
 assert.equal(f.sh.s.follow,true);
 button.click();
 const query=f.sh.q('[data-r=q]');
 query.value='source';
 query.dispatchEvent(new f.w.Event('input'));
 assert.equal(f.sh.lines[1].hidden,true);
 f.sh.q('[data-a=follow]').click();
 assert.equal(query.value,'');
 assert.equal(f.sh.s.follow,true);
 assert.equal(f.sh.cur,1);
 assert.equal(f.sh.lines[1].hidden,false);
 assert.equal(f.commands.length,0);
});
test('empty YouTube Stage offers the browser CC path until a track arrives', t => {
 const f=mount(t,{study:true,empty:true}), info=f.sh.a.info;
 let count=0, closed=0;
 f.sh.a.info=()=>({...info(),youtubeCaptions:true,captionTrackCount:count});
 f.sh.o.onClose=()=>closed++;
 f.sh.tick();
 f.sh.q('.sh-empty [data-a=close]').click();
 assert.equal(closed,1);
 assert.equal(f.commands.length,0);
 count=1;
 f.sh.tick();
 assert.equal(f.sh.q('.sh-empty [data-a=close]'),null);
 assert(f.sh.q('.sh-empty [data-caption-entry]'));
});
test('empty transcript drawer focuses its visible close button and returns to its opener', t => {
  const f = mount(t, { study: true, empty: true });
  const open = f.sh.q('.sh-transcript-toggle');
  const close = f.sh.q('.browser-study-transcript-close');
  open.focus();
  open.click();
  assert.equal(f.w.document.activeElement, close);
  assert.equal(open.getAttribute('aria-expanded'), 'true');
  close.click();
  assert.equal(f.w.document.activeElement, open);
  assert.equal(open.getAttribute('aria-expanded'), 'false');
});

for (const study of [false,true]) {
 test(`${study?'Bilingual':'Podcast'} timer, search keyboard and seek availability stay bound to the active source`, t=>{
  const f=mount(t,{study}), sleep=f.sh.q('[data-r=sleep]'), search=f.sh.q('[data-r=q]'), wave=f.sh.q('[data-r=wave]');
  const choose=value=>{sleep.value=value;sleep.dispatchEvent(new f.w.Event('change'));};
  const key=(target,key)=>target.dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  assert.deepEqual([...sleep.options].map(option=>option.value),['0','15','30','60']);
  choose('60');
  assert.match(sleep.selectedOptions[0].textContent,/60 dk kaldı/);
  assert(sleep.parentElement.classList.contains('active'));
  choose('0');
  assert.equal(f.sh.s.sleepAt,0);
  choose('15');
  f.sh.s.sleepAt=Date.now()-1;
  f.sh.tick();
  assert.equal(sleep.value,'0');
  assert.equal(f.commands.filter(([name])=>name==='pause').length,1);
  f.sh.tick();
  assert.equal(f.commands.filter(([name])=>name==='pause').length,1);
  search.focus();
  search.value='next';
  search.dispatchEvent(new f.w.Event('input'));
  key(search,'Enter');
  assert.equal(f.w.document.activeElement,f.sh.lines[1].querySelector('[data-a=cueSeek]'));
  search.focus();
  key(search,'Escape');
  assert.equal(search.value,'');
  assert.equal(f.w.document.activeElement,search);
  assert(!f.commands.some(([name])=>name.startsWith('seek')));
  f.setTime(100);
  f.sh.tick();
  assert.equal(wave.getAttribute('aria-valuenow'),'30');
  f.setCanSeek(false);
  f.sh.tick();
  assert.equal(wave.tabIndex,-1);
  choose('15');
  f.sh.s.sleepAt=Date.now()-1;
  f.sh.a.identity=()=> 'other-source';
  Object.defineProperty(f.w.document,'hidden',{value:true});
  f.sh.tick();
  assert.equal(f.commands.filter(([name])=>name==='pause').length,1);
 });
}
test('mode handoff preserves same-source reading and sleep but rejects another media identity', t => {
  const podcast = mount(t);
  const search = podcast.sh.q('[data-r=q]');
  search.value = 'next';
  search.dispatchEvent(new podcast.w.Event('input'));
  const timer=podcast.sh.q('[data-r=sleep]');
  timer.value='30';timer.dispatchEvent(new podcast.w.Event('change'));
  podcast.sh.q('[data-r=scroll]').scrollTop = 73;
  const prefs = podcast.sh.prefs(true);
  const study = mount(t, { study:true, prefs });
  assert.equal(study.sh.q('[data-r=q]').value, 'next');
  assert.equal(study.sh.s.follow, false);
  assert.equal(study.sh.s.sleepAt, podcast.sh.s.sleepAt);
  assert.equal(study.sh.lines[0].hidden, true);
  assert.equal(study.sh.q('.sh-transcript-toggle').getAttribute('aria-expanded'), 'true');
  const scroll = study.sh.q('[data-r=scroll]');
  Object.defineProperty(scroll, 'clientHeight', { value: 300 });
  study.sh.tick();
  assert.equal(scroll.scrollTop, 73);
  const other = mount(t, { study:true, prefs, identity:'different-source' });
  assert.equal(other.sh.q('[data-r=q]').value, '');
  assert.equal(other.sh.s.follow, true);
  assert.equal(other.sh.s.sleepAt, 0);
});

test('copy with an empty acknowledgement explains uncertainty and never reports success in another source',async t=>{
 const f=mount(t),messages=[];f.sh.toast=text=>messages.push(text);
 for(const result of [undefined,{}]){f.sh.a.cmd=()=>result;f.sh.act('copy',0);await new Promise(setImmediate);assert.match(messages.at(-1),/Kopyalama doğrulanamadı/);}
 let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);const count=messages.length;f.sh.act('copy',0);f.sh.a.identity=()=> 'new-source';finish({ok:true});await new Promise(setImmediate);assert.equal(messages.length,count);
});

test('shared row copy sends only the visible language once and confirms the write', async t => {
  const f = mount(t, { study: true });
  const copy = f.sh.lines[0].querySelector('[data-act=copy]');
  assert.equal(copy.title, 'Görünen metni kopyala');
  for (const [mode, expected] of [
    ['src', 'A source sentence'],
    ['tr', 'Birinci çeviri\nİkinci çeviri'],
    ['both', 'A source sentence\nBirinci çeviri\nİkinci çeviri']
  ]) {
    f.sh.q('[data-d=' + mode + ']').click();
    copy.click();
    assert.deepEqual(f.commands.at(-1).slice(0, 2), ['copy', expected]);
  }
  assert.equal(f.commands.filter(([type]) => type === 'copy').length, 3);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(f.sh.q('[data-r=toast]').textContent, /Metin kopyalandı/);
});

for(const disp of ['src','both','tr'])test(`no transcript card with text is blank in "${disp}" display, including source-only and translation-only rows`,t=>{
 const f=mount(t,{study:true,prefs:{disp}});
 f.rows[0]={id:'a',start:0,end:10,timed:true,src:'Only source here',trs:[],unc:[],words:null};
 f.rows[1]={id:'b',start:10,end:20,timed:true,src:'',trs:['Sadece çeviri var'],unc:[],words:null};
 f.setRevision('blank-'+disp);f.sh.tick();
 const cards=[...f.sh.root.querySelectorAll('.sh-cards [data-i]')];
 assert.equal(cards.length,2);
 for(const card of cards)assert.notEqual(card.textContent.replace(/\d+:\d{2}/,'').replace(/\s+/g,' ').trim(),'','metni olan satır boş görünmemeli');
 assert.match(cards[0].textContent,/Only source here/);assert.match(cards[1].textContent,/Sadece çeviri var/);
});


test('invalid processing interval identifies the field and stable ticks do not repeat live announcements',async t=>{
 let started=0;const f=mount(t,{processing:true,actions:[{id:'transcribe',label:'Whisper',run:()=>{started++;return {queued:true};}}]}),box=f.sh.scopeBox;box.querySelector('[data-scope=range]').click();
 const start=box.querySelector('[data-scope-time=start]'),end=box.querySelector('[data-scope-time=end]'),apply=box.querySelector('[data-scope-apply]');
 start.value='bad';start.dispatchEvent(new f.w.Event('input'));apply.focus();apply.click();
 assert.equal(start.getAttribute('aria-invalid'),'true');assert.equal(f.w.document.activeElement,start);assert.equal(end.hasAttribute('aria-invalid'),false);
 start.value='0:10';end.value='0:40';end.dispatchEvent(new f.w.Event('input'));apply.click();assert.equal(end.getAttribute('aria-invalid'),'true');assert.equal(f.w.document.activeElement,end);
 end.value='0:20';end.dispatchEvent(new f.w.Event('input'));assert.equal(start.hasAttribute('aria-invalid'),false);assert.equal(end.hasAttribute('aria-invalid'),false);
 const mutations=[],observer=new f.w.MutationObserver(records=>mutations.push(...records));observer.observe(box.querySelector('.sh-scope-summary'),{childList:true,subtree:true,characterData:true});
 f.sh.updateScope();f.sh.updateScope();await Promise.resolve();observer.disconnect();assert.equal(mutations.length,0);assert.equal(f.commands.length,0);
 f.sh.a.processing=()=>({duration:15});f.sh.tick();assert.equal(end.getAttribute('aria-invalid'),'true');await f.sh.startTask('transcribe');assert.equal(started,0,'a shortened source never falls back to whole-episode processing');
});

test('same-source mode handoff preserves explicit processing scope including an invalid draft, never another source',t=>{
 const f=mount(t,{processing:true});f.sh.scopeBox.querySelector('[data-scope=range]').click();f.sh.scopeBox.querySelector('[data-scope-time=start]').value='0:05.125';f.sh.scopeBox.querySelector('[data-scope-time=end]').value='0:12.875';f.sh.updateScope();
 const prefs=f.sh.prefs(true),next=mount(t,{study:true,processing:true,prefs});assert.deepEqual(structuredClone(next.sh.scopeRange()),{start:5.125,end:12.875});assert.equal(next.commands.length,0);
 f.sh.scopeBox.querySelector('[data-scope-time=end]').value='invalid';f.sh.updateScope();const invalid=mount(t,{study:true,processing:true,prefs:f.sh.prefs(true)});assert.equal(invalid.sh.scopeMode,'range');assert.throws(()=>invalid.sh.scopeRange());assert.equal(invalid.sh.scopeBox.querySelector('[data-scope-time=end]').value,'invalid');
 const other=mount(t,{processing:true,identity:'other-source',prefs});assert.equal(other.sh.scopeMode,'full');assert.equal(other.sh.scopeRange(),null);
});

test('Escape from the open interval trigger closes only its fields and preserves the draft',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study,processing:true});let closed=0;f.sh.o.onClose=()=>closed++;
  const range=f.sh.scopeBox.querySelector('[data-scope=range]'),fields=f.sh.scopeBox.querySelector('.sh-scope-fields'),start=fields.querySelector('input');
  range.focus();range.click();start.value='0:05.125';f.sh.updateScope();
  const event=new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});range.dispatchEvent(event);
  assert.equal(closed,0);assert.equal(fields.hidden,true);assert.equal(f.w.document.activeElement,range);assert.equal(event.defaultPrevented,true);
  assert.equal(start.value,'0:05.125');assert.equal(f.sh.scopeMode,'range');assert.equal(f.commands.length,0);
  range.click();assert.equal(fields.hidden,false);assert.equal(start.value,'0:05.125');
 }
});

test('applying a Podcast interval returns keyboard focus to the visible interval control',t=>{
 const f=mount(t,{processing:true,actions:[{id:'transcribe',label:'Whisper',run:async()=>({queued:true})}]});
 const range=f.sh.scopeBox.querySelector('[data-scope=range]');range.click();
 const apply=f.sh.scopeBox.querySelector('[data-scope-apply]');apply.focus();apply.click();
 assert.equal(f.sh.scopeBox.querySelector('.sh-scope-fields').hidden,true);assert.equal(f.w.document.activeElement,range);
});

test('a late shared command failure cannot notify the next source',async t=>{
 const f=mount(t),toasts=[];let finish;f.sh.toast=text=>toasts.push(text);f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);
 const pending=f.sh.run('seek',8);f.sh.a.identity=()=> 'another-source';finish({ok:false,message:'Old source failure'});
 assert.equal((await pending).code,'stale-source');assert.deepEqual(toasts,[]);
});

test('preparing a transcript task names the pending action and exposes its busy state',async t=>{
 let finish;const f=mount(t,{processing:true,actions:[{id:'transcribe',label:'Whisper',run:()=>new Promise(resolve=>finish=resolve)}]});
 const pending=f.sh.startTask('transcribe'),button=f.sh.q('[data-task=transcribe]');
 assert.equal(button.getAttribute('aria-busy'),'true');assert.match(button.textContent,/Hazırlanıyor/);assert.equal(button.disabled,true);assert.equal(f.sh.scopeBox.querySelector('[data-scope=range]').disabled,true,'queued scope cannot be changed while preparation is pending');
 finish({queued:true});await pending;assert.equal(f.sh.q('[data-task=transcribe]').getAttribute('aria-busy'),'false');
});

test('an explicitly selected source passage stays bound to its transcript revision',t=>{
 const f=mount(t),source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.setStart(source.firstChild,2);range.setEnd(source.firstChild,8);const selected=f.w.getSelection();selected.removeAllRanges();selected.addRange(range);
 let publications=0;f.w.document.addEventListener('media-context-changed',()=>publications++);const claim=f.sh.captureAssistantPassage();assert.equal(publications,1,'a paused source must publish the new attachment without waiting for playback');assert.equal(claim.text,'source');assert.equal(claim.timed,true);
 selected.removeAllRanges();assert.equal(f.sh.assistantPassage().text,'source','overlay focus need not keep a DOM selection alive');
 f.setRevision('changed');assert.equal(f.sh.assistantPassage(),null,'editing the track invalidates the attachment');
});


test('selected passage context is explicit, temporary and cannot expand a so-far question',t=>{
 const f=mount(t),source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.sh.captureAssistantPassage();
 const context={workspace:'podcast',title:'Episode'};const attached=f.sh.assistantContext(context);assert.equal(attached.selectedText,'A source sentence');assert.equal(f.sh.assistantContext(attached),attached,'repeated preview does not duplicate the attachment');
 for(const question of ['Bu ana kadar özetle','Summarize so far'])assert.equal(f.sh.assistantContext(context,question).selectedText,undefined);
 assert.equal(f.sh.assistantContext({workspace:'book-page'}).selectedText,undefined,'a selected video passage cannot contaminate book context');
 const translated=f.sh.lines[0].querySelector('.tr');range.selectNodeContents(translated);selection.removeAllRanges();selection.addRange(range);assert.equal(f.sh.captureAssistantPassage(),null,'an unaligned translation is not claimed as a source passage');
});

test('panel actions discard late errors after another episode takes over',async t=>{
 let finish;const f=mount(t,{sections:[{title:'Existing task',items:[{type:'button',label:'Open saved output',run:()=>new Promise(resolve=>finish=resolve)}]}]}),toasts=[];
 f.sh.toast=message=>toasts.push(message);f.sh.togglePanel();f.sh.q('.sh-pbtn').click();f.sh.a.identity=()=> 'next-episode';finish({ok:false,message:'Old episode failed'});await new Promise(setImmediate);assert.deepEqual(toasts,[]);
});

test('same-source view handoff retains a pending panel action and reports its failure once',async t=>{
 let finish,calls=0;const items=[{id:'open-result',type:'button',label:'Open saved output',run:()=>{calls++;return new Promise(resolve=>finish=resolve);}}],sections=[{title:'Results',items}];
 const first=mount(t,{sections});first.sh.togglePanel();first.sh.q('.sh-pbtn').click();
 const prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs,sections}),notices=[];next.sh.toast=message=>notices.push(message);next.sh.togglePanel();
 assert.equal(next.sh.q('.sh-pbtn').disabled,true);next.sh.q('.sh-pbtn').click();assert.equal(calls,1);
 const other=mount(t,{identity:'another-source',prefs,sections});other.sh.togglePanel();assert.equal(other.sh.q('.sh-pbtn').disabled,false,'another source does not inherit the lock');
  const serialized=mount(t,{prefs:JSON.parse(JSON.stringify(prefs)),sections});serialized.sh.togglePanel();assert.equal(serialized.sh.q('.sh-pbtn').disabled,false,'serialized preferences cannot revive an in-memory pending operation');
 finish({ok:false,message:'Saved output unavailable'});await new Promise(setImmediate);next.sh.tick();
 assert.equal(next.sh.q('.sh-pbtn').disabled,false);assert.deepEqual(notices,['Saved output unavailable']);next.sh.tick();assert.equal(notices.length,1);
});

test('pending unnamed panel action stays locked when another option is inserted above it',async t=>{
 for(const study of [false,true]){
  let finish,calls=0;const action={type:'button',label:'Open saved output',run:()=>{calls++;return new Promise(resolve=>finish=resolve);}},items=[action];
  const f=mount(t,{study,sections:[{title:'Results',items}]});f.sh.togglePanel();f.sh.q('.sh-pbtn').click();
  items.unshift({type:'button',label:'Inspect source',run:()=>{}});f.sh.drawPanel(false);
  const buttons=[...f.sh.root.querySelectorAll('.sh-pbtn')],pending=buttons.find(b=>b.textContent.includes('Open saved output')),other=buttons.find(b=>b.textContent.includes('Inspect source'));
  assert.equal(pending.disabled,true);assert.equal(other.disabled,false);pending.click();assert.equal(calls,1);
  finish({ok:true});await new Promise(setImmediate);
  assert.equal([...f.sh.root.querySelectorAll('.sh-pbtn')].find(b=>b.textContent.includes('Open saved output')).disabled,false);
 }
});

test('pending panel actions remain locked after redraw and explain the wait',async t=>{
 let finish,calls=0;const item={id:'open-result',type:'button',label:'Open saved output',run:()=>{calls++;return new Promise(resolve=>finish=resolve);}};
 const f=mount(t,{sections:[{title:'Results',items:[item]}]});f.sh.togglePanel();f.sh.q('.sh-pbtn').click();
 f.sh.drawPanel(true);const pending=f.sh.q('.sh-pbtn');assert.equal(pending.disabled,true);assert.equal(pending.getAttribute('aria-busy'),'true');assert.match(pending.textContent,/Bekleyin/);pending.click();assert.equal(calls,1);
 finish({ok:true});await new Promise(setImmediate);assert.equal(f.sh.q('.sh-pbtn').disabled,false);assert.equal(f.sh.q('.sh-pbtn').getAttribute('aria-busy'),'false');
});

test('Enter applies the interval without starting playback and composing keys do not switch modes',t=>{
 const f=mount(t,{processing:true,actions:[{id:'transcribe',label:'Whisper',run:async()=>({queued:true})}]});f.sh.scopeBox.querySelector('[data-scope=range]').click();const input=f.sh.scopeBox.querySelector('[data-scope-time=start]');input.focus();input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(f.sh.scopeBox.querySelector('.sh-scope-fields').hidden,true);assert.equal(f.commands.length,0);
 const tab=f.sh.q('[role=tab][data-mode]');let clicks=0;f.sh.root.querySelectorAll('[role=tab][data-mode]').forEach(button=>button.addEventListener('click',()=>clicks++));tab.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,bubbles:true}));assert.equal(clicks,0);
});


test('same-source mode handoff keeps a selected source passage and unsaved note text',t=>{
 const f=mount(t,{save:true}),source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.sh.captureAssistantPassage();
 f.sh.openNote(0);const input=f.sh.q('[data-note-text]');input.value='Keep this draft';input.dispatchEvent(new f.w.Event('input'));
 const next=mount(t,{study:true,save:true,prefs:f.sh.prefs(true)});
 assert.equal(next.sh.assistantPassage()?.text,'A source sentence');assert.equal(next.sh.q('[data-note-text]')?.value,'Keep this draft');
 const other=mount(t,{study:true,save:true,identity:'other-source',prefs:f.sh.prefs(true)});assert.equal(other.sh.assistantPassage(),null);assert.equal(other.sh.s.note,undefined);
});

test('a transcript refresh preserves a note draft but blocks saving it against changed evidence',async t=>{
 const f=mount(t,{save:true});f.sh.openNote(0);const input=f.sh.q('[data-note-text]');input.value='My own correction';input.dispatchEvent(new f.w.Event('input'));
 f.rows[0].src='Changed source';f.setRevision('updated');f.sh.tick();assert.equal(f.sh.q('[data-note-text]')?.value,'My own correction');assert.equal(f.sh.q('[data-a=noteSave]').disabled,true);assert.match(f.sh.q('.sh-note-card').textContent,/değişti/);
 await f.sh.saveNote();assert.equal(f.commands.filter(c=>c[0]==='save').length,0);
});

test('an in-flight note save shared across a mode change cannot be sent twice',async t=>{
 const f=mount(t,{save:true});let finish,commits=0;f.sh.a.cmd=()=>{commits++;return new Promise(resolve=>finish=resolve);};f.sh.openNote(0);const input=f.sh.q('[data-note-text]');input.value='One note';input.dispatchEvent(new f.w.Event('input'));const pending=f.sh.saveNote();
 const next=mount(t,{study:true,save:true,prefs:f.sh.prefs(true)});f.sh.destroy();await next.sh.saveNote();assert.equal(commits,1);assert.equal(next.sh.q('[data-a=noteSave]').disabled,true);
 finish({ok:true,annotation:{id:'saved-note'}});await pending;next.sh.tick();assert.equal(next.sh.s.note,null);assert.match(next.sh.q('[data-r=toast]').textContent,/kaydedildi/);
});

test('stopped or partially recoverable jobs keep a truthful visible result state',t=>{
 const f=mount(t);let job={state:'stopped',text:'',progress:null};f.sh.a.panel=()=>({sections:[],job});f.sh.tick();assert.equal(f.sh.q('[data-r=job]').hidden,false);assert.match(f.sh.q('[data-r=job]').textContent,/Durduruldu/);assert.equal(f.sh.q('[data-r=jobbar]').hidden,true);
 job={state:'partial',text:'3 / 5 ready; stored lines remain available',progress:null};f.sh.tick();assert.match(f.sh.q('[data-r=job]').textContent,/3 \/ 5 ready/);assert.equal(f.sh.q('[data-a=jobcancel]').hidden,true);
 job={state:'done',text:'Subtitle loaded',progress:1,cancel:()=>assert.fail('completed job is not cancellable')};f.sh.tick();
 assert.equal(f.sh.q('[data-r=job]').dataset.state,'done');assert.match(f.sh.q('[data-r=job]').textContent,/Tamamlandı/);
 assert.equal(f.sh.q('[data-r=jobbar]').hidden,true);assert.equal(f.sh.q('[data-a=jobcancel]').hidden,true);
});


test('a translation inserted above the reading position keeps the same source passage in view',t=>{
 const f=mount(t);f.rows.push({id:'c',start:20,end:25,timed:true,src:'Reading anchor',trs:[],unc:[],words:null},{id:'d',start:25,end:30,timed:true,src:'Later',trs:[],unc:[],words:null});f.setRevision('long');f.sh.tick();f.sh.s.follow=false;
 const scroll=f.sh.q('[data-r=scroll]');scroll.scrollTop=250;Object.defineProperty(scroll,'clientHeight',{value:200});scroll.getBoundingClientRect=()=>({top:0,bottom:200});
 const box=f.w.Element.prototype.getBoundingClientRect;f.w.Element.prototype.getBoundingClientRect=function(){if(this.parentElement===scroll&&this.matches('[data-i]')){let top=-scroll.scrollTop;for(const row of scroll.children){if(row===this)break;top+=row.textContent.includes('Inserted translation')?180:100;}const height=this.textContent.includes('Inserted translation')?180:100;return {top,bottom:top+height,height};}return box.call(this);};
 const before=f.sh.lines[2].getBoundingClientRect().top;f.rows[0].trs.push('Inserted translation');f.setRevision('translated');f.sh.tick();assert.equal(f.sh.lines[2].getBoundingClientRect().top,before,'the reader must not jump backward when earlier cards grow');assert.equal(scroll.scrollTop,330);
});


test('rebinding a stale note requires an explicit action, preserves the draft and previews current evidence',async t=>{
 const f=mount(t,{save:true});f.sh.openNote(0);const input=f.sh.q('[data-note-text]');input.value='My note';input.dispatchEvent(new f.w.Event('input'));f.rows[0].src='New evidence';f.setRevision('new');f.sh.tick();
 f.sh.q('[data-a=noteRebind]').click();assert.equal(f.sh.q('.sh-word-context').textContent,'New evidence');assert.equal(f.sh.q('[data-note-text]').value,'My note');assert.equal(f.commands.length,0,'rebinding is not a save');assert.equal(f.sh.q('[data-a=noteSave]').disabled,false);
 await f.sh.saveNote();assert.equal(f.commands[0][2],'new');assert.equal(f.commands[0][1].note,'My note');
});

test('opening another note cannot silently discard an existing draft',t=>{
 const f=mount(t,{save:true});f.sh.openNote(0);f.sh.q('[data-note-text]').value='Unsaved first note';f.sh.q('[data-note-text]').dispatchEvent(new f.w.Event('input'));f.sh.openNote(1);assert.equal(f.sh.s.note.rowId,'a');assert.equal(f.sh.q('[data-note-text]').value,'Unsaved first note');
 f.sh.q('[data-a=noteDiscard]').click();f.sh.openNote(1);assert.equal(f.sh.s.note.rowId,'b');assert.equal(f.sh.q('[data-note-text]').value,'');
});

test('Tasks refresh keeps the focused action by identity when its priority changes',t=>{
 const items=[{id:'transcribe',label:'Transcribe'},{id:'translate',label:'Translate'}];
 const f=mount(t,{study:true,sections:[{title:'Tasks',items}]});f.sh.togglePanel();
 const panel=f.sh.q('[data-r=panel]');[...panel.querySelectorAll('.sh-pbtn')].find(b=>b.textContent==='Translate').focus();
 items.reverse();f.sh.drawPanel(false);
 assert.equal(f.w.document.activeElement.textContent,'Translate');
 assert.equal(f.w.document.activeElement.dataset.pid,'action:translate');
});

test('a retired job action returns focus to transport without stealing external focus',t=>{
 const f=mount(t,{study:true}),play=f.sh.q('[data-a=toggle]'),search=f.sh.q('[data-r=q]');let job={state:'failed',retry:()=>{}};
 f.sh.a.panel=()=>({sections:[],job});f.sh.drawJob();f.sh.q('[data-a=jobretry]').focus();
 job={state:'running',cancel:()=>{}};f.sh.drawJob();assert.equal(f.w.document.activeElement,play,'hidden retry cannot retain keyboard focus');
 f.sh.q('[data-a=jobcancel]').focus();job={state:'done'};f.sh.drawJob();assert.equal(f.w.document.activeElement,play,'the entire retired job returns focus');
 search.focus();job={state:'failed'};f.sh.drawJob();job=null;f.sh.drawJob();assert.equal(f.w.document.activeElement,search);
});

test('closing a draft after transcript refresh returns to the same passage save action',t=>{
 const f=mount(t,{study:true,save:true});f.sh.openNote(1,f.sh.lines[1].querySelector('[data-act=save]'));
 f.rows[0].trs=['Updated translation'];f.setRevision('new-translation');f.sh.tick();
 f.sh.q('[data-a=noteClose]').click();assert.equal(f.w.document.activeElement,f.sh.lines[1].querySelector('[data-act=save]'));
});

test('Tasks and note panels share one working surface while keeping the draft discoverable',t=>{
 const f=mount(t,{study:true,save:true});f.sh.openNote(0);const input=f.sh.q('[data-note-text]');input.value='Kept while using Tasks';input.dispatchEvent(new f.w.Event('input'));
 f.sh.togglePanel();assert.equal(f.sh.q('.sh-note-card').hidden,true);assert.equal(f.sh.noteDraft.text,'Kept while using Tasks');
 const reopen=f.sh.lines[0].querySelector('[data-act=save]');assert.equal(reopen.getAttribute('data-note-draft'),'true');assert.match(reopen.title,/taslağ/);
 reopen.click();assert.equal(f.sh.q('[data-r=panel]').hidden,true);assert.equal(f.sh.q('[data-note-text]').value,'Kept while using Tasks');
 f.sh.q('[data-a=noteDiscard]').click();assert.equal(reopen.hasAttribute('data-note-draft'),false);
});

test('a note draft never marks or rebinds a different track row with the same cue id',t=>{
 const f=mount(t,{study:true,save:true,prefs:{disp:'both'}});
 f.rows[1]={...f.rows[1],id:f.rows[0].id,src:'',trs:['Independent translation'],standaloneTranslation:true};f.setRevision('overlapping-ids');f.sh.tick();
 f.sh.openNote(1,f.sh.lines[1].querySelector('[data-act=save]'));f.sh.q('[data-note-text]').value='Translation-specific note';f.sh.q('[data-note-text]').dispatchEvent(new f.w.Event('input'));f.sh.closeNote();
 assert.equal(f.sh.lines[0].querySelector('[data-act=save]').hasAttribute('data-note-draft'),false);assert.equal(f.sh.lines[1].querySelector('[data-act=save]').dataset.noteDraft,'true');
 f.rows[1].trs=['Revised independent translation'];f.setRevision('edited');f.sh.tick();f.sh.openNote(1);f.sh.q('[data-a=noteRebind]').click();
 assert.equal(f.sh.s.note.row,1);assert.equal(f.sh.s.note.source,'');assert.deepEqual(Array.from(f.sh.s.note.translations),['Revised independent translation']);
 assert.equal(f.sh.q('[data-note-text]').value,'Translation-specific note');assert.equal(f.commands.length,0);
});

test('refusing another note does not replace the original draft focus return target',t=>{
 const f=mount(t,{study:true,save:true});const first=f.sh.lines[0].querySelector('[data-act=save]'),second=f.sh.lines[1].querySelector('[data-act=save]');
 f.sh.openNote(0,first);f.sh.q('[data-note-text]').value='Keep me';f.sh.q('[data-note-text]').dispatchEvent(new f.w.Event('input'));f.sh.openNote(1,second);f.sh.q('[data-a=noteClose]').click();
 assert.equal(f.w.document.activeElement,first);
});

test('note refresh returns disabled action focus to a usable control without stealing external focus',async t=>{
 for(const study of [false,true]){
  const f=mount(t,{study,save:true});f.sh.openNote(0);
  f.sh.q('[data-a=noteSeek]').focus();f.setRevision('changed');f.sh.tick();
  assert.equal(f.w.document.activeElement,f.sh.q('[data-note-text]'),'a disabled stale action returns to the retained draft');
  f.sh.q('[data-a=noteRebind]').click();let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);
  f.sh.q('[data-a=noteSave]').focus();const pending=f.sh.saveNote();
  assert.equal(f.w.document.activeElement,f.sh.q('[data-a=noteClose]'),'a pending save leaves focus on the available close action');
  const search=f.sh.q('[data-r=q]');search.focus();finish({ok:false,message:'Retry later'});await pending;
  assert.equal(f.w.document.activeElement,search,'a late save failure must not steal newer focus');
 }
});

test('a stale note sentence action stays visibly disabled through transport refreshes',t=>{
 const f=mount(t,{study:true,save:true});f.sh.openNote(0);f.setRevision('changed');f.sh.tick();f.sh.tick();
 const seek=f.sh.q('[data-a=noteSeek]');assert.equal(seek.disabled,true);seek.click();assert.equal(f.commands.length,0);
});

test('a note cannot rebind to the same cue id belonging to a different subtitle track',t=>{
 const f=mount(t,{save:true});f.rows[0].trackId='track-A';f.setRevision('track-A');f.sh.tick();f.sh.openNote(0);f.sh.q('[data-note-text]').value='Keep original note';f.sh.q('[data-note-text]').dispatchEvent(new f.w.Event('input'));
 f.rows[0].trackId='track-B';f.rows[0].src='Different track with repeated cue id';f.setRevision('track-B');f.sh.tick();
 assert.equal(f.sh.q('[data-a=noteRebind]').disabled,true);assert.equal(f.sh.q('[data-a=noteSave]').disabled,true);assert.equal(f.sh.q('[data-note-text]').value,'Keep original note');
});

test('a failed cover falls back to the current title and a late old image error cannot replace a newer cover',t=>{
 const f=mount(t),info=f.sh.a.info;let cover='https://images.invalid/old.png';const fallbackCover='https://images.invalid/show.png';f.sh.a.info=()=>({...info(),cover,fallbackCover});f.sh.tick();const old=f.sh.q('[data-r=cover] img');
 cover='https://images.invalid/new.png';f.sh.tick();const current=f.sh.q('[data-r=cover] img');old.dispatchEvent(new f.w.Event('error'));assert.equal(f.sh.q('[data-r=cover] img'),current);
 current.dispatchEvent(new f.w.Event('error'));assert.equal(current.getAttribute('src'),fallbackCover);
 current.dispatchEvent(new f.w.Event('error'));assert.equal(f.sh.q('[data-r=cover] img'),null);assert(f.sh.q('[data-r=cover]').textContent.trim());
});

test('transcript revisions keep the cover node and metadata updates keep the selected transcript DOM',t=>{
 const f=mount(t),info=f.sh.a.info;let title='Original title',cover='https://images.invalid/cover.png';f.sh.a.info=()=>({...info(),title,cover});f.sh.tick();const image=f.sh.q('[data-r=cover] img');
 f.rows[0].src='Updated transcript';f.setRevision('translated');f.sh.tick();assert.equal(f.sh.q('[data-r=cover] img'),image);
 const source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);
 title='Updated metadata title';cover='https://images.invalid/updated-cover.png';f.sh.tick();assert.equal(f.sh.lines[0].querySelector('.src'),source);assert.equal(selection.toString(),'Updated transcript');assert.equal(f.sh.q('[data-r=title]').textContent,title);
});

test('chapter metadata updates waveform marks without replacing transcript text or density bars',t=>{
 const f=mount(t),info=f.sh.a.info,source=f.sh.lines[0].querySelector('.src'),bar=f.sh.q('[data-r=bars]').firstChild;
 f.sh.a.info=()=>({...info(),chapters:[{t:0,label:'Opening'},{t:20,label:'Later chapter'}]});f.sh.tick();assert.equal(f.sh.lines[0].querySelector('.src'),source);assert.equal(f.sh.q('[data-r=bars]').firstChild,bar);assert(Math.abs(parseFloat(f.sh.q('.sh-wave .mark').style.left)-20/30*100)<.001);
});

test('clearing an unsuccessful search returns to the same reading position without seeking',t=>{
 const f=mount(t),scroll=f.sh.q('[data-r=scroll]'),query=f.sh.q('[data-r=q]');f.sh.s.follow=false;scroll.scrollTop=180;
 query.value='unmatched phrase';query.dispatchEvent(new f.w.Event('input'));assert.equal(scroll.scrollTop,0);assert.equal(f.sh.q('[data-r=searchEmpty]').hidden,false);
 f.sh.q('[data-a=clearSearch]').click();assert.equal(scroll.scrollTop,180);assert.equal(f.w.document.activeElement,query);assert.equal(f.commands.length,0);
});

test('clearing search after the transcript changes does not restore an old track scroll position',t=>{
 const f=mount(t),scroll=f.sh.q('[data-r=scroll]'),query=f.sh.q('[data-r=q]');f.sh.s.follow=false;scroll.scrollTop=180;query.value='missing';query.dispatchEvent(new f.w.Event('input'));
 f.setRevision('another-track');f.sh.tick();f.sh.q('[data-a=clearSearch]').click();assert.equal(scroll.scrollTop,0);assert.equal(f.commands.length,0);
});

test('a same-source view handoff preserves the reading position from before the search',t=>{
 const f=mount(t),scroll=f.sh.q('[data-r=scroll]'),q=f.sh.q('[data-r=q]');f.sh.s.follow=false;scroll.scrollTop=180;q.value='unmatched';q.dispatchEvent(new f.w.Event('input'));
 const next=mount(t,{study:true,prefs:f.sh.prefs(true)});next.sh.q('[data-a=clearSearch]').click();assert.equal(next.sh.q('[data-r=scroll]').scrollTop,180);assert.equal(next.commands.length,0);
 const other=mount(t,{study:true,identity:'different',prefs:f.sh.prefs(true)});assert.equal(other.sh.q('[data-r=q]').value,'');assert.equal(other.sh.searchReadingAnchor,undefined);
});

test('a failed note keeps its explanation and draft when closed and reopened',async t=>{
 const f=mount(t,{save:true});f.sh.a.cmd=async()=>({ok:false,message:'Storage unavailable. Retry after restoring access.'});f.sh.openNote(0);f.sh.q('[data-note-text]').value='My retained note';await f.sh.saveNote();
 const error=f.sh.q('.sh-note-state').textContent;assert.match(error,/Storage unavailable/);f.sh.closeNote();f.sh.openNote(0);assert.equal(f.sh.q('.sh-note-state').textContent,error);assert.equal(f.sh.q('[data-note-text]').value,'My retained note');assert.equal(f.sh.q('[data-a=noteSave]').textContent,'Kaydetmeyi yeniden dene');
});

test('a note retry clears the old error, stays single-flight and closes only after confirmed save',async t=>{
 const f=mount(t,{save:true});let finish,calls=0;f.sh.a.cmd=()=>{calls++;return calls===1?Promise.resolve({ok:false,message:'Temporary failure'}):new Promise(r=>finish=r);};f.sh.openNote(0);await f.sh.saveNote();
 const retry=f.sh.q('[data-a=noteSave]');retry.click();retry.click();assert.equal(calls,2);assert.equal(f.sh.s.note.error,'');assert.equal(f.sh.q('[data-a=noteSave]').disabled,true);
 finish({ok:true});await new Promise(setImmediate);assert.equal(f.sh.s.note,null);assert.equal(f.sh.noteDraft,null);
});

test('a refreshed track picker returns nested search focus to the current track trigger',t=>{
 for(const study of [false,true]){
  const f=mount(t,{study});f.w.HTMLElement.prototype.showPopover=function(){};f.w.HTMLElement.prototype.hidePopover=function(){};
  f.w.eval(fs.readFileSync(require.resolve('../src/renderer/player-ui-kit.js'),'utf8'));
  let selected='a';const changes=[];
  f.sh.a.panel=()=>({sections:[{title:'Tracks',items:[{type:'select',label:'Source',value:selected,options:[{value:'a',label:'Track A'},{value:'b',label:'Track B'}],onChange:value=>changes.push(value)}]}]});
  f.sh.togglePanel();const old=f.sh.q('.mk-picker-trigger');old.click();const search=f.sh.q('.mk-menu-search');search.value='Track';search.focus();
  const panel=f.sh.q('[data-r=panel]');panel.scrollTop=120;
  selected='b';f.setRevision('track-replaced');f.sh.tick();
  assert.equal(f.w.document.activeElement,f.sh.q('.mk-picker-trigger'),'nested picker focus stays with its track control');
  assert.equal(search.isConnected,false);assert.equal(f.sh.q('.mk-picker-label').textContent,'Track B');assert.deepEqual(changes,[],'refresh does not apply a selection');assert.equal(panel.scrollTop,120);assert.equal(f.commands.length,0);
  const external=f.sh.q('[data-r=q]');external.focus();selected='a';f.setRevision('another-revision');f.sh.tick();assert.equal(f.w.document.activeElement,external);
 }
});

test('Escape in an open track picker closes that picker before the Stage task panel',t=>{
 const f=mount(t);f.w.HTMLElement.prototype.showPopover=function(){this.dispatchEvent(new f.w.Event('toggle'));};f.w.HTMLElement.prototype.hidePopover=function(){this.dispatchEvent(new f.w.Event('toggle'));};
 f.w.eval(fs.readFileSync(require.resolve('../src/renderer/player-ui-kit.js'),'utf8'));
 f.sh.a.panel=()=>({sections:[{title:'Tracks',items:[{type:'select',label:'Source',value:'a',options:[{value:'a',label:'Track A'}],onChange(){}}]}]});
 f.sh.togglePanel();const picker=f.sh.q('.mk-picker-trigger');picker.click();const search=f.sh.q('.mk-menu-search');search.focus();search.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(f.sh.s.panel,true);assert.equal(f.w.document.activeElement,picker);
});

test('cancelled Stage tasks expose the existing safe retry action',t=>{
 const f=mount(t);let retried=0;
 f.sh.a.panel=()=>({job:{state:'cancelled',retry:()=>{retried++;}}});f.sh.drawJob();
 const retry=f.sh.q('[data-a=jobretry]');assert.equal(retry.hidden,false);retry.click();assert.equal(retried,1);
});

test('same-source search handoff keeps the selected result only for the same transcript revision',t=>{
 const f=mount(t),query=f.sh.q('[data-r=q]');query.value='sentence';query.dispatchEvent(new f.w.Event('input'));f.sh.moveMatch(1);f.sh.moveMatch(1);assert.equal(f.sh.q('[data-r=searchCount]').textContent,'2 / 2');
 const prefs=f.sh.prefs(true),next=mount(t,{study:true,prefs});assert.equal(next.sh.matchLine,next.sh.lines[1]);assert.equal(next.sh.q('[data-r=searchCount]').textContent,'2 / 2');assert.equal(next.commands.length,0);
 const stalePrefs={...prefs,reading:{...prefs.reading,searchMatch:{...prefs.reading.searchMatch,rev:'different-track-version'}}};const stale=mount(t,{prefs:stalePrefs});assert.equal(stale.sh.matchLine==null,true);
 const other=mount(t,{identity:'another-source',prefs});assert.equal(other.sh.matchLine==null,true);
});

test('moving an active search into the player keeps its result and opens the transcript drawer',t=>{
 const from=mount(t,{study:true});
 const query=from.sh.q('[data-r=q]');
 query.value='sentence';
 query.dispatchEvent(new from.w.Event('input'));
 from.sh.moveMatch(1);
 const next=mount(t,{cinema:true,prefs:from.sh.prefs(true)});
 assert.equal(next.sh.root.classList.contains('transcript-open'),true);
 assert.equal(next.sh.q('[data-r=q]').value,'sentence');
 assert.equal(next.sh.matchLine,next.sh.lines[0]);
 assert.deepEqual(next.commands,[]);
});

test('search selection follows real row identity through translation updates and drops removed or hidden matches',t=>{
 const f=mount(t),q=f.sh.q('[data-r=q]');q.value='sentence';q.dispatchEvent(new f.w.Event('input'));f.sh.moveMatch(1);f.sh.moveMatch(1);
 const selected=f.rows[1];f.sh.a.state=(()=>{const state=f.sh.a.state;return ()=>({...state(),rows:[selected,{...f.rows[0],trs:['Yeni çeviri sentence']}],rev:'reordered'});})();f.sh.tick();
 assert.equal(f.sh.matchLine,f.sh.lines[0]);assert.equal(f.sh.q('[data-r=searchCount]').textContent,'1 / 2');assert.equal(f.commands.length,0);
 f.sh.q('[data-d=tr]').click();assert.equal(f.sh.matchLine==null,true);assert.equal(f.sh.q('[data-r=searchCount]').textContent,'1 satır');
 f.sh.moveMatch(1);assert(f.sh.matchLine);const state=f.sh.a.state;f.sh.a.state=()=>({...state(),rows:[selected],rev:'removed-translation'});f.sh.tick();assert.equal(f.sh.matchLine==null,true);assert.equal(f.sh.q('[data-r=q]').value,'sentence');
 assert.equal(f.commands.filter(command=>/seek|replay|Cue/.test(command[0])).length,0);
});

test('filtered match navigation never seeks until selected and keeps real row identities for repeat',t=>{
 const f=mount(t);f.rows[0].src='needle first';f.rows[1].src='other';f.rows.push({id:'third',start:20,end:25,timed:true,src:'needle third',trs:[],unc:[],words:null});f.setRevision('filtered');f.sh.tick();
 const q=f.sh.q('[data-r=q]');q.value='needle';q.dispatchEvent(new f.w.Event('input'));
 f.sh.moveMatch(1,true);f.sh.moveMatch(1,true);assert.equal(f.sh.matchLine,f.sh.lines[2]);assert.equal(f.commands.length,0);
 f.sh.lines[2].querySelector('[data-a=cueSeek]').click();assert.equal(f.commands.at(-1)[0],'seekCue');assert.equal(f.commands.at(-1)[1],2);
 const target=f.sh.lines[2].querySelector('[data-a=cueSeek]');
 target.focus();
 const scroll=f.sh.q('[data-r=scroll]');scroll.scrollTop=42;
 target.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(f.w.document.activeElement,q);
 assert.equal(q.value,'needle');
 assert.equal(scroll.scrollTop,42);
 assert.equal(f.sh.matchLine,f.sh.lines[2]);
 assert.equal(f.commands.length,1);
 f.sh.moveMatch(-1,true);assert.equal(f.sh.matchLine,f.sh.lines[0]);assert.equal(q.value,'needle');
 f.sh.navigateSentence('replay');assert.equal(f.commands.at(-1)[0],'replay');assert.equal(f.sh.lines[1].hidden,true);
});

test('starting text selection stops follow without cancelling the native selection',t=>{
 const f=mount(t),source=f.sh.lines[0].querySelector('.src');
 assert.equal(f.sh.s.follow,true);
 assert(source.dispatchEvent(new f.w.Event('selectstart',{bubbles:true,cancelable:true})));
 assert.equal(f.sh.s.follow,false);
 f.sh.q('[data-a=follow]').click();
 assert.equal(f.sh.s.follow,true);
 assert.equal(f.commands.length,0);
});

test('pending recovery and job controls survive same-source views with one failure notice',async t=>{
 for(const action of ['playbackRetry','jobretry','jobcancel'])for(const replaceOwner of [false,true]){
  const first=mount(t);let finish;const operation=()=>new Promise(resolve=>finish=resolve);
  const recovery={ownerToken:'failure-A',message:'Playback failed',label:'Retry',run:operation},job={id:'job-A',state:action==='jobcancel'?'running':'failed',[action==='jobcancel'?'cancel':'retry']:operation};
  const bind=f=>{f.sh.a.recovery=()=>action==='playbackRetry'?recovery:null;f.sh.a.panel=()=>({sections:[],job:action==='playbackRetry'?{state:'idle'}:job});f.sh.drawJob();};
  bind(first);const pending=first.sh.runStatusAction(first.sh.q('[data-a='+action+']'),operation),prefs=first.sh.prefs(true);first.sh.destroy();if(action==='playbackRetry')first.sh.a.recovery=()=>null;
  const next=mount(t,{study:true,prefs}),notices=[];next.sh.toast=message=>notices.push(message);bind(next);
  if(replaceOwner){next.sh.a.recovery=()=>({...recovery,ownerToken:'failure-B'});next.sh.a.panel=()=>({sections:[],job:{...job,id:'job-B'}});next.sh.drawJob();}
  assert.equal(next.sh.q('[data-a='+action+']').disabled,!replaceOwner,'only the same source and action owner retain the lock');
  const other=mount(t,{identity:'different-source',prefs});bind(other);assert.equal(other.sh.q('[data-a='+action+']').disabled,false);
  finish({ok:false,message:'Controlled failure after handoff'});await pending;next.sh.tick();assert.equal(next.sh.q('[data-a='+action+']').disabled,false);assert.deepEqual(notices,replaceOwner?[]:['Controlled failure after handoff']);next.sh.tick();assert.equal(notices.length,replaceOwner?0:1);
 }
});

test('a replaced playback recovery has its own lock and ignores the previous failure',async t=>{
 const f=mount(t),toasts=[];f.sh.toast=message=>toasts.push(message);let finishA,finishB;
 let recovery={ownerToken:'error-A',message:'A failed',label:'Retry A',run:()=>new Promise(resolve=>finishA=resolve)};
 f.sh.a.recovery=()=>recovery;f.sh.drawJob();const button=f.sh.q('[data-a=playbackRetry]'),old=f.sh.runStatusAction(button,recovery.run);
 recovery={ownerToken:'error-B',message:'B failed',label:'Retry B',run:()=>new Promise(resolve=>finishB=resolve)};f.sh.drawJob();assert.equal(button.disabled,false);assert.equal(button.textContent,'Retry B');
 const pending=f.sh.runStatusAction(button,recovery.run);finishA({ok:false,message:'Old recovery failed'});await old;
 assert.equal(button.disabled,true);assert.equal(f.sh.q('[data-r=recovery]').getAttribute('aria-busy'),'true');assert.deepEqual(toasts,[]);
 finishB({ok:false,message:'Current recovery failed'});await pending;assert.equal(button.disabled,false);assert.deepEqual(toasts,['Current recovery failed']);
});

test('playback recovery shows its pending action and explains an unsuccessful empty reply',async t=>{
 const f=mount(t);let finish,calls=0;
 f.sh.a.recovery=()=>({message:'Audio could not play.',label:'Retry playback',run:()=>{calls++;return new Promise(resolve=>finish=resolve);}});f.sh.drawJob();
 const button=f.sh.q('[data-a=playbackRetry]');button.click();f.sh.drawJob();
 assert.equal(button.disabled,true);assert.equal(f.sh.q('[data-r=recovery]').getAttribute('aria-busy'),'true');assert.match(button.textContent,/Bekleyin/);
 button.click();assert.equal(calls,1);finish({ok:false});await new Promise(setImmediate);
 assert.equal(button.disabled,false);assert.equal(f.sh.q('[data-r=recovery]').getAttribute('aria-busy'),'false');assert.match(f.sh.q('[data-r=toast]').textContent,/uygulanamadı/);
});

for(const study of [false,true]){
 test(`${study?'Bilingual':'Podcast'} pending sleep pause and its outcome survive a same-source view handoff`,async t=>{
  for(const ok of [true,false]){
   const first=mount(t,{study});let finish,calls=0;first.sh.a.cmd=()=>{calls++;return new Promise(resolve=>finish=resolve);};
   first.sh.setSleep(15);first.sh.s.sleepAt=Date.now()-1;first.sh.tick();
   const prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:!study,prefs}),notices=[];next.sh.toast=message=>notices.push(message);
   const timer=next.sh.q('[data-r=sleep]');timer.focus();assert.equal(timer.getAttribute('aria-busy'),'true');assert.match(timer.selectedOptions[0].textContent,/Duraklatılıyor/);
   next.sh.tick();assert.equal(calls,1);finish(ok?{ok:true}:{ok:false,message:'Pause refused'});await new Promise(setImmediate);next.sh.tick();
   assert.equal(timer.hasAttribute('aria-busy'),false);assert.equal(next.w.document.activeElement,timer);assert.deepEqual(notices,ok?['Uyku süresi doldu; oynatma duraklatıldı.']:['Pause refused']);next.sh.tick();assert.equal(notices.length,1);
  }
 });
}
test('sleep pause completion cannot report into a new timer, another source or a closed view',async t=>{
 for(const change of ['timer','source','closed']){
  const first=mount(t);let finish;first.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);first.sh.setSleep(15);first.sh.s.sleepAt=Date.now()-1;first.sh.tick();
  const prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs,identity:change==='source'?'another-source':'same-source'}),notices=[];next.sh.toast=message=>notices.push(message);
  if(change==='timer')next.sh.setSleep(30);if(change==='closed')next.sh.destroy();
  finish({ok:true});await new Promise(setImmediate);next.sh.tick();assert.deepEqual(notices,[]);if(change==='timer')assert.equal(next.sh.s.sleep,30);
 }
});
test('a retained sleep control cannot change the live handoff timer', t=>{
 const first=mount(t);first.sh.setSleep(15);const prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs});next.sh.setSleep(30);
 const revision=next.sh.sleepWork?.revision;first.sh.setSleep(0);assert.equal(next.sh.s.sleep,30);assert.equal(next.sh.sleepWork?.revision,revision);
});

test('sleep pause result is delivered once to the current same-source view',async t=>{
 const first=mount(t);let finish;first.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);first.sh.setSleep(15);first.sh.s.sleepAt=Date.now()-1;first.sh.tick();
 const prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs}),notices=[];next.sh.toast=message=>notices.push(message);
 finish({ok:true});await new Promise(setImmediate);next.sh.tick();assert.deepEqual(notices,['Uyku süresi doldu; oynatma duraklatıldı.']);next.sh.tick();assert.equal(notices.length,1);
});

test('sleep pause failures and unconfirmed results are visible, with EN pending copy and no false success',async t=>{
 for(const outcome of ['throw','reject','unconfirmed']){
  const f=mount(t);f.w.UiLocale.get=()=> 'en';const notices=[];f.sh.toast=message=>notices.push(message);
  f.sh.a.cmd=()=>{if(outcome==='throw')throw Error('Pause denied');if(outcome==='reject')return Promise.reject(Error('Pause denied'));return Promise.resolve(undefined);};
  f.sh.setSleep(15);f.sh.s.sleepAt=Date.now()-1;f.sh.tick();
  if(outcome!=='throw')assert.match(f.sh.q('[data-r=sleep]').selectedOptions[0].textContent,/Pausing/);
  await new Promise(setImmediate);f.sh.tick();assert.equal(notices.length,1);assert.doesNotMatch(notices[0],/playback paused/);assert.match(notices[0],outcome==='unconfirmed'?/pause was not confirmed/:/Pause denied/);assert.equal(f.sh.q('[data-r=sleep]').hasAttribute('aria-busy'),false);
 }
});

for(const study of [false,true]){
 test(`${study?'Bilingual':'Podcast'} seek failure survives same-source view handoff exactly once`,async t=>{
  for(const type of ['seek','seekBy','seekCue']){
   const first=mount(t,{study});let finish;first.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);const pending=first.sh.run(type,5),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:!study,prefs}),notices=[];next.sh.toast=message=>notices.push(message);
   finish({ok:false,message:'Seek refused'});await pending;next.sh.tick();assert.deepEqual(notices,['Seek refused']);next.sh.tick();assert.equal(notices.length,1);
  }
 });
}
test('an older seek cannot replace the outcome of a newer seek, including a view handoff',async t=>{
 const first=mount(t),replies=[];first.sh.a.cmd=()=>new Promise(resolve=>replies.push(resolve));const old=first.sh.run('seekBy',10),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs}),notices=[];next.sh.toast=message=>notices.push(message);next.sh.a.cmd=()=>new Promise(resolve=>replies.push(resolve));const latest=next.sh.run('seek',20);
 replies[0]({ok:false,message:'Obsolete seek failure'});await old;next.sh.tick();assert.deepEqual(notices,[]);replies[1]({ok:false,message:'Current seek failure'});await latest;next.sh.tick();assert.deepEqual(notices,['Current seek failure']);
});

test('a late seek rejection reaches only the same live source, never a new source or newer successful seek',async t=>{
 for(const change of ['same','source','success']){
  const first=mount(t);let reject;first.sh.a.cmd=()=>new Promise((_,fail)=>reject=fail);const pending=first.sh.run('seek',12),prefs=first.sh.prefs(true);first.sh.destroy();first.sh.a.identity=()=>undefined;
  const next=mount(t,{study:true,prefs,identity:change==='source'?'new-source':'same-source'}),notices=[];next.sh.toast=message=>notices.push(message);
  if(change==='success')await next.sh.run('seek',20);reject(Error('Delayed seek rejected'));await pending;next.sh.tick();assert.deepEqual(notices,change==='same'?['Delayed seek rejected']:[]);
 }
});
test('failed seek handoff does not move keyboard focus or retry the command',async t=>{
 const first=mount(t);let finish,calls=0;first.sh.a.cmd=()=>{calls++;return new Promise(resolve=>finish=resolve);};const pending=first.sh.run('seekBy',10),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs}),input=next.sh.q('[data-r=q]');input.focus();finish({ok:false,message:'Seek refused'});await pending;next.sh.tick();assert.equal(next.w.document.activeElement,input);assert.equal(calls,1);assert.equal(next.commands.length,0);
});

for(const study of [false,true]){
 test(`${study?'Bilingual':'Podcast'} transcript refresh preserves note editor scroll and selection direction`,t=>{
  const f=mount(t,{study,save:true});f.sh.openNote(0);const input=f.sh.q('[data-note-text]');input.value='A long note line.\n'.repeat(70);input.dispatchEvent(new f.w.Event('input'));input.focus();input.setSelectionRange(80,120,'backward');input.scrollTop=240;input.scrollLeft=12;f.sh.q('.sh-note-card').scrollTop=90;
  f.setRevision('changed-note-source');f.sh.tick();const next=f.sh.q('[data-note-text]');assert.equal(next.value,input.value);assert.equal(next.scrollTop,240);assert.equal(next.scrollLeft,12);assert.equal(next.selectionStart,80);assert.equal(next.selectionEnd,120);assert.equal(next.selectionDirection,'backward');assert.equal(f.w.document.activeElement,next);assert.equal(f.sh.q('[data-a=noteSave]').disabled,true);
 });
}
test('note excerpt refresh retains reading focus and scroll instead of jumping into editing',t=>{
 const f=mount(t,{save:true});f.rows[0].src='Source passage '.repeat(100);f.setRevision('long-source');f.sh.tick();f.sh.openNote(0);const excerpt=f.sh.q('.sh-note-excerpt');excerpt.focus();excerpt.scrollTop=130;f.setRevision('source-updated');f.sh.tick();assert.equal(f.w.document.activeElement,f.sh.q('.sh-note-excerpt'));assert.equal(f.sh.q('.sh-note-excerpt').scrollTop,130);assert.equal(f.commands.length,0);
});
test('same-source note view handoff retains editing location and another source gets none of it',t=>{
 const first=mount(t,{save:true});first.sh.openNote(0);const input=first.sh.q('[data-note-text]');input.value='My long note.\n'.repeat(60);input.dispatchEvent(new first.w.Event('input'));input.setSelectionRange(55,95,'backward');input.scrollTop=170;const prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,save:true,prefs}),current=next.sh.q('[data-note-text]');assert.equal(current.scrollTop,170);assert.equal(current.selectionStart,55);assert.equal(current.selectionEnd,95);assert.equal(current.selectionDirection,'backward');const other=mount(t,{save:true,identity:'another',prefs});assert.equal(other.sh.s.note,undefined);
});

test('failed note save and close-reopen retain editing location without pulling external focus',async t=>{
 const f=mount(t,{save:true});f.sh.openNote(0);let input=f.sh.q('[data-note-text]');input.value='Retained note.\n'.repeat(60);input.dispatchEvent(new f.w.Event('input'));input.setSelectionRange(44,92,'backward');input.scrollTop=150;let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);const pending=f.sh.saveNote();const search=f.sh.q('[data-r=q]');search.focus();finish({ok:false,message:'Retry later'});await pending;input=f.sh.q('[data-note-text]');assert.equal(f.w.document.activeElement,search);assert.equal(input.scrollTop,150);assert.equal(input.selectionStart,44);assert.equal(input.selectionEnd,92);assert.equal(input.selectionDirection,'backward');
 f.sh.closeNote();f.sh.openNote(0);input=f.sh.q('[data-note-text]');assert.equal(input.scrollTop,150);assert.equal(input.selectionStart,44);assert.equal(input.selectionEnd,92);assert.equal(input.selectionDirection,'backward');assert.equal(input.value,'Retained note.\n'.repeat(60));
});


for(const study of [false,true])test(`${study?'Bilingual':'Podcast'} removed chapter metadata returns hidden search focus to transcript`,t=>{
 const f=mount(t,{study});f.sh.showReading(true);const query=f.sh.q('[data-r=chapterSearch]');query.value='old chapter';query.focus();f.sh.drawChapters([]);assert.equal(f.w.document.activeElement,f.sh.q('[data-r=q]'));assert.equal(f.sh.q('[data-r=chaps]').hidden,true);assert.equal(f.commands.length,0);
});

test('up-next metadata refresh preserves its control focus and falls back when the queue empties',t=>{
 const f=mount(t),info=f.sh.a.info;let queue=[{index:1,title:'Next episode',queueKey:'next'}];f.sh.a.info=()=>({...info(),queue});f.sh.tick();f.sh.q('[data-a=queue]').focus();queue=[{index:1,title:'Next episode updated',queueKey:'next'}];f.sh.tick();assert.equal(f.w.document.activeElement,f.sh.q('[data-a=queue]'));assert.match(f.w.document.activeElement.textContent,/updated/);
 queue=[];f.sh.tick();assert.equal(f.w.document.activeElement,f.sh.q('[data-a=toggle]'));assert.equal(f.sh.q('[data-r=upnext]').hidden,true);assert.equal(f.commands.length,0);
});

test('chapter and queue metadata refresh never pulls focus from transcript search',t=>{
 const f=mount(t),query=f.sh.q('[data-r=q]'),info=f.sh.a.info;query.focus();f.sh.drawChapters([]);f.sh.a.info=()=>({...info(),queue:[]});f.sh.tick();assert.equal(f.w.document.activeElement,query);assert.equal(f.commands.length,0);
});


test('failed loop reply follows its same-source view handoff once without retrying',async t=>{
 const first=mount(t);let finish;first.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);const pending=first.sh.run('loop',{on:true,row:0}),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs}),query=next.sh.q('[data-r=q]');query.focus();finish({ok:false,message:'Loop could not be confirmed'});await pending;next.sh.tick();assert.match(next.sh.q('[data-r=toast]').textContent,/Loop could not be confirmed/);assert.equal(next.w.document.activeElement,query);assert.equal(next.commands.length,0);next.sh.q('[data-r=toast]').textContent='';next.sh.tick();assert.equal(next.sh.q('[data-r=toast]').textContent,'');
});


for(const study of [false,true])test(`${study?'Bilingual':'Podcast'} language filter keeps a still-matching search selection and reading position`,t=>{
 const f=mount(t,{study});f.rows.splice(0,f.rows.length,...Array.from({length:40},(_,i)=>({id:'row-'+i,start:i*.5,end:(i+1)*.5,timed:true,src:'needle source '+i,trs:['needle translation '+i],unc:[],words:null})));f.setRevision('long-search');f.sh.tick();const query=f.sh.q('[data-r=q]');query.value='needle';query.dispatchEvent(new f.w.Event('input'));for(let i=0;i<29;i++)f.sh.moveMatch(1);const selected=f.sh.matchLine,scroll=f.sh.q('[data-r=scroll]');scroll.scrollTop=320;const filter=f.sh.q('[data-d=tr]');filter.focus();filter.click();assert.equal(f.sh.matchLine,selected);assert.equal(f.sh.q('[data-r=searchCount]').textContent,'29 / 40');assert.equal(scroll.scrollTop,320);assert.equal(f.w.document.activeElement,filter);assert.equal(query.value,'needle');assert.equal(f.commands.filter(c=>/seek|Cue|replay/.test(c[0])).length,0);
 query.value='different';query.dispatchEvent(new f.w.Event('input'));assert.equal(f.sh.matchLine,null);assert.equal(scroll.scrollTop,0);
});


for(const study of [false,true])test(`${study?'Bilingual':'Podcast'} exact seek preserves a new time draft written while the previous seek is pending`,async t=>{
 const f=mount(t,{study});let finish;f.sh.a.cmd=(...args)=>{f.commands.push(args);return new Promise(resolve=>finish=resolve);};const input=f.sh.q('[data-r=jumpTime]'),form=f.sh.q('[data-r=jumpForm]');f.sh.toggleJump();input.value='0:12';const pending=f.sh.seekTypedTime();input.value='0:18';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));finish({ok:true});await pending;assert.equal(form.hidden,false);assert.equal(input.value,'0:18');assert.equal(f.w.document.activeElement,input);assert.equal(form.hasAttribute('aria-busy'),false);assert.equal(f.commands.length,1);
});

test('correcting an invalid exact time clears the old validation state before retry',async t=>{
 const f=mount(t),input=f.sh.q('[data-r=jumpTime]'),error=f.sh.q('[data-r=jumpError]');f.sh.toggleJump();input.value='wrong';await f.sh.seekTypedTime();assert.equal(input.getAttribute('aria-invalid'),'true');let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);input.value='0:12';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));const pending=f.sh.seekTypedTime();assert.equal(input.hasAttribute('aria-invalid'),false);assert.equal(error.hidden,true);finish({ok:false,message:'Controlled refusal'});await pending;assert.equal(f.sh.q('[data-r=jumpForm]').hidden,false);assert.equal(input.value,'0:12');
});


test('exact seek pending lock follows the same source view and releases for an explicit retry',async t=>{
 const first=mount(t);let finish;first.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);first.sh.toggleJump();first.sh.q('[data-r=jumpTime]').value='0:12';const pending=first.sh.seekTypedTime(),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs});next.sh.toggleJump();next.sh.q('[data-r=jumpTime]').value='0:18';await next.sh.seekTypedTime();assert.equal(next.commands.length,0);assert.equal(next.sh.q('[data-r=jumpForm]').getAttribute('aria-busy'),'true');assert.equal(next.sh.q('[data-r=jumpForm] [type=submit]').disabled,true);finish({ok:true});await pending;next.sh.tick();assert.equal(next.sh.q('[data-r=jumpForm] [type=submit]').disabled,false);await next.sh.seekTypedTime();assert.deepEqual(next.commands.map(c=>c.slice(0,2)),[['seek',18]]);
});

test('another source does not inherit an exact seek pending lock or lose its newer form state',async t=>{
 const first=mount(t);let finish;first.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);first.sh.toggleJump();first.sh.q('[data-r=jumpTime]').value='0:12';const pending=first.sh.seekTypedTime(),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs,identity:'different'});next.sh.toggleJump();next.sh.q('[data-r=jumpTime]').value='0:18';await next.sh.seekTypedTime();assert.equal(next.commands.length,1);finish({ok:false,message:'Old source error'});await pending;next.sh.tick();assert.doesNotMatch(next.sh.q('[data-r=toast]').textContent,/Old source error/);
});


test('pending sentence-loop action stays single-flight and visible across same-source view changes',async t=>{
 const first=mount(t);let finish,calls=0;first.sh.a.cmd=()=>{calls++;return new Promise(resolve=>finish=resolve);};const pending=first.sh.setSentenceLoop(true,0),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{study:true,prefs});await next.sh.setSentenceLoop(true,1);assert.equal(next.commands.length,0);assert.equal(next.sh.q('[data-a=loop]').disabled,true);assert.equal(next.sh.lines[1].querySelector('[data-act=loop]').disabled,true);assert.match(next.sh.q('[data-a=loop]').textContent,/Döngü ayarlanıyor|Updating loop/);finish({ok:true});await pending;next.sh.tick();assert.equal(next.sh.q('[data-a=loop]').disabled,false);assert.equal(next.sh.q('[data-a=loop]').hasAttribute('aria-busy'),false);assert.equal(calls,1);
});

test('another source has independent loop controls while an old loop reply is pending',async t=>{
 const first=mount(t);let finish;first.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);const pending=first.sh.setSentenceLoop(true,0),prefs=first.sh.prefs(true);first.sh.destroy();const next=mount(t,{identity:'replacement',prefs});assert.equal(next.sh.q('[data-a=loop]').disabled,false);await next.sh.setSentenceLoop(true,1);assert.equal(next.commands.length,1);finish({ok:false,message:'Obsolete loop error'});await pending;next.sh.tick();assert.doesNotMatch(next.sh.q('[data-r=toast]').textContent,/Obsolete loop error/);
});


for(const location of ['row','transport'])test('pending loop retains keyboard ownership from '+location+' without stealing later reading focus',async t=>{
 const f=mount(t);let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);const button=location==='row'?f.sh.lines[0].querySelector('[data-act=loop]'):f.sh.q('[data-a=loop]');button.focus();const pending=f.sh.setSentenceLoop(true,0);const target=location==='row'?f.sh.lines[0]:f.sh.q('[data-a=toggle]');assert.equal(f.w.document.activeElement,target);assert.equal(button.disabled,true);const search=f.sh.q('[data-r=q]');search.focus();finish({ok:false,message:'Controlled loop refusal'});await pending;assert.equal(f.w.document.activeElement,search);assert.equal(button.disabled,false);assert.equal(f.sh.loopPending,false);
});


test('sleep control explains pause deadline, cancellation and pending outcome in both interface languages',async t=>{
 for(const locale of ['tr','en']){
  const f=mount(t);f.w.UiLocale.get=()=>locale;const control=f.sh.q('[data-r=sleep]');f.sh.setSleep(15);const deadline=new Date(f.sh.s.sleepAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'});assert(control.title.includes(deadline));assert.match(control.getAttribute('aria-label'),locale==='tr'?/15 dk.*duraklat/:/15 min.*pause/i);f.sh.setSleep(0);assert.doesNotMatch(control.title,/\d{2}:\d{2}/);assert.match(control.title,locale==='tr'?/süre sonunda/:/after the selected duration/i);
  let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);f.sh.setSleep(15);f.sh.s.sleepAt=Date.now()-1;f.sh.tick();assert.match(control.title,locale==='tr'?/doğrulanıyor/:/confirming/i);finish({ok:true});await new Promise(setImmediate);assert.match(control.title,locale==='tr'?/süre sonunda/:/after the selected duration/i);assert.equal(control.hasAttribute('aria-busy'),false);
 }
});


for(const olderFails of [false,true])test('latest copy result owns feedback even when older reply arrives last, olderFails='+olderFails,async t=>{
 const f=mount(t),replies=[],messages=[];f.sh.toast=message=>messages.push(message);f.sh.a.cmd=(...args)=>{f.commands.push(args);return new Promise(resolve=>replies.push(resolve));};f.sh.act('copy',0);f.sh.act('copy',1);assert.equal(replies.length,2);replies[1](olderFails?{ok:true}:{ok:false,message:'Latest copy failed'});await new Promise(setImmediate);const latest=[...messages];assert.equal(latest.length,1);assert.match(latest[0],olderFails?/kopyalandı/:/Latest copy failed/);replies[0](olderFails?{ok:false,message:'Obsolete copy failed'}:{ok:true});await new Promise(setImmediate);assert.deepEqual(messages,latest);assert.equal(f.commands.length,2);
});


for(const handoff of [false,true])test('a note saved after its window closes clears the completed draft, handoff='+handoff,async t=>{
 const first=mount(t,{save:true});let finish,calls=0;first.sh.a.cmd=()=>{calls++;return new Promise(resolve=>finish=resolve);};first.sh.openNote(0);first.sh.q('[data-note-text]').value='Saved while reading';const pending=first.sh.saveNote();first.sh.closeNote();let live=first;if(handoff){const prefs=first.sh.prefs(true);first.sh.destroy();live=mount(t,{save:true,study:true,prefs});}const query=live.sh.q('[data-r=q]');query.focus();finish({ok:true});await pending;live.sh.tick();assert.equal(live.sh.noteDraft,null);assert.equal(live.sh.q('.sh-note-card').hidden,true);assert.equal(live.w.document.activeElement,query);assert.match(live.sh.q('[data-r=toast]').textContent,/Araştırma defterine kaydedildi/);live.sh.openNote(1);assert.equal(live.sh.s.note.rowId,'b');assert.equal(calls,1);
});

test('a failed save after closing the note retains its error without reopening or stealing focus',async t=>{
 const f=mount(t,{save:true});let finish;f.sh.a.cmd=()=>new Promise(resolve=>finish=resolve);f.sh.openNote(0);f.sh.q('[data-note-text]').value='Retained closed note';const pending=f.sh.saveNote();f.sh.closeNote();const query=f.sh.q('[data-r=q]');query.focus();finish({ok:false,message:'Closed note write failed'});await pending;f.sh.tick();assert.equal(f.sh.q('.sh-note-card').hidden,true);assert.equal(f.w.document.activeElement,query);assert.equal(f.sh.noteDraft.error,'Closed note write failed');assert.equal(f.sh.noteDraft.text,'Retained closed note');f.sh.openNote(0);assert.match(f.sh.q('.sh-note-state').textContent,/Closed note write failed/);assert.match(f.sh.q('[data-a=noteSave]').textContent,/yeniden dene/);
});


for(const protectedDraft of [false,true])test('a new explicit excerpt on the same sentence respects an existing typed draft='+protectedDraft,async t=>{
 const f=mount(t,{save:true});const select=(start,end)=>{const text=f.sh.lines[0].querySelector('.src').firstChild,range=f.w.document.createRange();range.setStart(text,start);range.setEnd(text,end);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);};select(2,8);f.sh.openNote(0);assert.equal(f.sh.s.note.excerpt,'source');if(protectedDraft){const input=f.sh.q('[data-note-text]');input.value='Keep my evidence';input.dispatchEvent(new f.w.Event('input'));}f.sh.closeNote();select(9,17);f.sh.openNote(0);
 if(protectedDraft){assert.equal(f.sh.s.note.excerpt,'source');assert.equal(f.sh.q('[data-note-text]').value,'Keep my evidence');assert.match(f.sh.q('[data-r=toast]').textContent,/Önce açık taslağı/);}else{assert.equal(f.sh.s.note.excerpt,'sentence');assert.equal(f.sh.q('.sh-word-context').textContent,'sentence');await f.sh.saveNote();assert.equal(f.commands[0][1].excerpt,'sentence');}assert.equal(f.commands.length,protectedDraft?0:1);
});

test('reopening a selected excerpt without a new source selection keeps it unchanged',t=>{
 const f=mount(t,{save:true}),source=f.sh.lines[0].querySelector('.src').firstChild,range=f.w.document.createRange();range.setStart(source,2);range.setEnd(source,8);f.w.getSelection().addRange(range);f.sh.openNote(0);f.sh.closeNote();f.w.getSelection().removeAllRanges();f.sh.openNote(0);assert.equal(f.sh.s.note.excerpt,'source');assert.equal(f.sh.q('.sh-word-context').textContent,'source');assert.equal(f.commands.length,0);
});


for(const kind of ['note','word'])for(const study of [false,true])test(`${study?'Bilingual':'Podcast'} ${kind} card closes to a visible control after its opening row is filtered out`,async t=>{
 const f=mount(t,{study,save:true}),opener=f.sh.lines[0].querySelector(kind==='note'?'[data-act=save]':'[data-a=cueSeek]');opener.focus();if(kind==='note')f.sh.openNote(0,opener);else await f.sh.openWord(0,'source');const close=f.sh.q(kind==='note'?'[data-a=noteClose]':'[data-a=wordClose]');close.focus();const query=f.sh.q('[data-r=q]');query.value='next';f.sh.filterRows();assert.equal(f.sh.lines[0].hidden,true);if(kind==='note')f.sh.closeNote();else f.sh.closeWord();assert.equal(f.w.document.activeElement,query);assert.equal(query.value,'next');assert.equal(f.commands.filter(c=>/seek|replay|Cue/.test(c[0])).length,0);
});


test('selected search result is explicitly labelled without changing the playback current row or copying the label',async t=>{
 for(const locale of ['tr','en']){
  const f=mount(t);f.w.UiLocale.get=()=>locale;const query=f.sh.q('[data-r=q]');query.value='sentence';query.dispatchEvent(new f.w.Event('input'));f.sh.moveMatch(1);f.sh.moveMatch(1);assert.equal(f.sh.root.querySelectorAll('.sh-query-position').length,1);assert.equal(f.sh.lines[1].querySelector('.sh-query-position').textContent,(locale==='tr'?'Aramada seçili':'Selected search result')+' · 2 / 2');assert.equal(f.sh.lines[0].getAttribute('aria-current'),'true');assert.equal(f.sh.lines[1].hasAttribute('aria-current'),false);f.sh.act('copy',1);await new Promise(setImmediate);assert.equal(f.commands[0][1],'The next sentence');query.value='unmatched';query.dispatchEvent(new f.w.Event('input'));assert.equal(f.sh.root.querySelector('.sh-query-position'),null);assert.equal(f.commands.filter(c=>/seek|Cue|replay/.test(c[0])).length,0);
 }
});


test('an oversized explicit source selection cannot silently fall back to general assistant context',t=>{
 const f=mount(t);f.rows[0].src='Long source evidence '.repeat(250);f.setRevision('long-evidence');f.sh.tick();const range=f.w.document.createRange();range.selectNodeContents(f.sh.lines[0].querySelector('.src'));const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.sh.q('[data-a=assistant]').click();assert.equal(f.commands.length,0);assert.equal(f.sh.assistantPassage(),null);assert.match(f.sh.q('[data-r=toast]').textContent,/4000/);
 const source=f.sh.lines[0].querySelector('.src').firstChild;range.setStart(source,0);range.setEnd(source,20);selection.removeAllRanges();selection.addRange(range);f.sh.q('[data-a=assistant]').click();assert.equal(f.commands.length,1);assert.equal(f.commands[0][0],'assistant');assert.equal(f.sh.assistantPassage().text,'Long source evidence');
});

test('search labels never become explicit assistant evidence or note excerpts',t=>{
 const f=mount(t,{save:true}),query=f.sh.q('[data-r=q]');query.value='sentence';query.dispatchEvent(new f.w.Event('input'));f.sh.moveMatch(1);const source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);assert.equal(f.sh.captureAssistantPassage().text,'A source sentence');f.sh.openNote(0);assert.equal(f.sh.s.note.excerpt,'A source sentence');assert.doesNotMatch(f.sh.assistantContext({workspace:'podcast'}).selectedText,/Aramada seçili/);assert.equal(f.commands.length,0);
});


test('explicit assistant evidence is inspectable, clearable and source-bound across views',t=>{
 const f=mount(t,{save:true}),source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.sh.captureAssistantPassage();assert.equal(f.sh.q('[data-r=assistantSelection]').hidden,false);assert.equal(f.sh.q('[data-r=assistantExcerpt]').textContent,'A source sentence');f.sh.openNote(0);f.sh.q('[data-note-text]').value='Preserved note';f.sh.q('[data-note-text]').dispatchEvent(new f.w.Event('input'));f.sh.closeNote();const prefs=f.sh.prefs(true);f.sh.destroy();const next=mount(t,{study:true,save:true,prefs});assert.equal(next.sh.q('[data-r=assistantSelection]').hidden,false);const clear=next.sh.q('[data-a=clearAssistantSelection]');clear.focus();clear.click();assert.equal(next.sh.assistantPassage(),null);assert.equal(next.sh.q('[data-r=assistantSelection]').hidden,true);assert.equal(next.w.document.activeElement,next.sh.q('[data-a=assistant]'));assert.equal(next.sh.noteDraft.text,'Preserved note');assert.equal(next.commands.length,0);const other=mount(t,{prefs,identity:'other-source'});assert.equal(other.sh.q('[data-r=assistantSelection]').hidden,true);
});

test('clear assistant selection removes the local DOM selection and revision changes hide the attached excerpt',t=>{
 const f=mount(t),source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.sh.captureAssistantPassage();f.sh.clearAssistantSelection();assert.equal(selection.rangeCount,0);assert.equal(f.sh.captureAssistantPassage(),null);selection.addRange(range);f.sh.captureAssistantPassage();f.setRevision('edited-source');f.sh.tick();assert.equal(f.sh.q('[data-r=assistantSelection]').hidden,true);assert.equal(f.sh.q('[data-r=assistantExcerpt]').textContent,'');assert.equal(f.commands.length,0);
});


test('a visible attached assistant passage survives reopening after DOM selection is gone',t=>{
 const f=mount(t),source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.sh.captureAssistantPassage();selection.removeAllRanges();f.sh.q('[data-a=assistant]').click();assert.equal(f.sh.assistantPassage()?.text,'A source sentence');assert.equal(f.sh.q('[data-r=assistantSelection]').hidden,false);assert.equal(f.commands.length,1);const prefs=f.sh.prefs(true);f.sh.destroy();const next=mount(t,{study:true,prefs});next.sh.q('[data-a=assistant]').click();assert.equal(next.sh.assistantPassage()?.text,'A source sentence');assert.equal(next.commands.length,1);next.sh.clearAssistantSelection();next.sh.q('[data-a=assistant]').click();assert.equal(next.sh.assistantPassage(),null);assert.equal(next.sh.q('[data-r=assistantSelection]').hidden,true);assert.equal(next.commands.length,2);
});

test('a retained assistant passage cannot survive a transcript revision or acquire another source identity',t=>{
 const f=mount(t),source=f.sh.lines[0].querySelector('.src'),range=f.w.document.createRange();range.selectNodeContents(source);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.sh.captureAssistantPassage();selection.removeAllRanges();f.setRevision('changed');assert.equal(f.sh.captureAssistantPassage(),null);assert.equal(f.sh.q('[data-r=assistantSelection]').hidden,true);
});

for(const reverse of [false,true])test('view handoff keeps the visible reading row across different row heights, reverse='+reverse,t=>{
 const f=mount(t,{study:reverse});f.sh.s.follow=false;const sc=f.sh.q('[data-r=scroll]');Object.defineProperty(sc,'clientHeight',{value:200});sc.scrollTop=180;sc.getBoundingClientRect=()=>({top:100,bottom:300});f.sh.lines[0].getBoundingClientRect=()=>({top:-100,bottom:90});f.sh.lines[1].getBoundingClientRect=()=>({top:90,bottom:350});const prefs=f.sh.prefs(true);f.sh.destroy();const next=mount(t,{study:!reverse,prefs}),dest=next.sh.q('[data-r=scroll]');Object.defineProperty(dest,'clientHeight',{value:200});dest.getBoundingClientRect=()=>({top:100,bottom:300});next.sh.lines[1].getBoundingClientRect=()=>({top:410-dest.scrollTop,bottom:600-dest.scrollTop});next.sh.q('[data-r=q]').focus();next.sh.restoreReadingPosition();assert.equal(dest.scrollTop,320);assert.equal(next.w.document.activeElement,next.sh.q('[data-r=q]'));assert.equal(next.commands.length,0);
});
test('reading row anchor never applies to a different transcript revision',t=>{
 const f=mount(t);f.sh.s.follow=false;const sc=f.sh.q('[data-r=scroll]');Object.defineProperty(sc,'clientHeight',{value:200});sc.getBoundingClientRect=()=>({top:100,bottom:300});f.sh.lines[0].getBoundingClientRect=()=>({top:90,bottom:200});sc.scrollTop=80;const prefs=f.sh.prefs(true),next=mount(t,{study:true,prefs});next.setRevision('replacement-track');next.sh.tick();const dest=next.sh.q('[data-r=scroll]');Object.defineProperty(dest,'clientHeight',{value:200});dest.getBoundingClientRect=()=>({top:100,bottom:300});next.sh.lines[0].getBoundingClientRect=()=>({top:900,bottom:1000});next.sh.restoreReadingPosition();assert.equal(dest.scrollTop,80);assert.equal(next.commands.length,0);
});

test('clearing search after a view handoff restores the original reading row in the new layout',t=>{
 const f=mount(t);f.sh.s.follow=false;const sc=f.sh.q('[data-r=scroll]');Object.defineProperty(sc,'clientHeight',{value:200});sc.scrollTop=180;sc.getBoundingClientRect=()=>({top:100,bottom:300});f.sh.lines[0].getBoundingClientRect=()=>({top:-100,bottom:90});f.sh.lines[1].getBoundingClientRect=()=>({top:90,bottom:350});const query=f.sh.q('[data-r=q]');query.value='missing';query.dispatchEvent(new f.w.Event('input'));const prefs=f.sh.prefs(true);f.sh.destroy();const next=mount(t,{study:true,prefs}),dest=next.sh.q('[data-r=scroll]');Object.defineProperty(dest,'clientHeight',{value:200});dest.getBoundingClientRect=()=>({top:100,bottom:300});next.sh.lines[1].getBoundingClientRect=()=>({top:410-dest.scrollTop,bottom:600-dest.scrollTop});next.sh.q('[data-a=clearSearch]').click();assert.equal(dest.scrollTop,320);assert.equal(next.w.document.activeElement,next.sh.q('[data-r=q]'));assert.equal(next.commands.length,0);
});

test('reading layout settlement follows resolved geometry and yields to manual scrolling',t=>{
 const f=mount(t);f.sh.s.follow=false;const sc=f.sh.q('[data-r=scroll]');Object.defineProperty(sc,'clientHeight',{value:200});sc.getBoundingClientRect=()=>({top:100,bottom:300});let top=410,settle,cancelled;f.sh.lines[1].getBoundingClientRect=()=>({top:top-sc.scrollTop,bottom:top-sc.scrollTop+190,height:190});f.w.requestAnimationFrame=fn=>{settle=fn;return 123;};f.w.cancelAnimationFrame=id=>{if(id===123)cancelled=true;};const reading={scrollTop:180,viewportAnchor:{rev:'r1',id:'b',standaloneTranslation:false,offset:-10}};f.sh.applyReadingPosition(reading);assert.equal(sc.scrollTop,320);top=490;settle();assert.equal(sc.scrollTop,400);assert.equal(f.sh.lines[1].style.contentVisibility,'visible');f.sh.applyReadingPosition(reading);cancelled=false;sc.dispatchEvent(new f.w.WheelEvent('wheel'));assert.equal(cancelled,true);assert.equal(f.commands.length,0);f.sh.destroy();assert.equal(f.sh.lines[1].style.contentVisibility,'');
});

for(const action of ['next-match','changed-source'])test('pending reading settlement yields to '+action,t=>{
 const f=mount(t);f.sh.s.follow=false;const sc=f.sh.q('[data-r=scroll]');Object.defineProperty(sc,'clientHeight',{value:200});sc.getBoundingClientRect=()=>({top:100,bottom:300});f.sh.lines[0].getBoundingClientRect=()=>({top:410-sc.scrollTop,bottom:600-sc.scrollTop,height:190});let callback,cancelled=false;f.w.requestAnimationFrame=fn=>{callback=fn;return 987;};f.w.cancelAnimationFrame=id=>{if(id===987)cancelled=true;};const q=f.sh.q('[data-r=q]');q.value='sentence';q.dispatchEvent(new f.w.Event('input'));f.sh.applyReadingPosition({scrollTop:180,viewportAnchor:{rev:'r1',id:'a',standaloneTranslation:false,offset:-10}});if(action==='next-match'){f.sh.moveMatch(1);assert.equal(cancelled,true,'explicit match navigation cancels pending restoration');}else{f.sh.a.identity=()=> 'different-source';sc.scrollTop=50;callback();assert.equal(sc.scrollTop,50,'source change before the next tick must block layout work');}assert.equal(f.commands.length,0);
});

test('manual reading keeps its visible sentence when font size changes',t=>{
 const f=mount(t);f.sh.s.follow=false;const sc=f.sh.q('[data-r=scroll]');Object.defineProperty(sc,'clientHeight',{value:200});sc.scrollTop=180;sc.getBoundingClientRect=()=>({top:100,bottom:300});f.sh.lines[0].getBoundingClientRect=()=>({top:-100,bottom:90});f.sh.lines[1].getBoundingClientRect=()=>{const large=f.sh.readingSize==='large',top=(large?610:270)-sc.scrollTop;return {top,bottom:top+190,height:190};};const size=f.sh.q('[data-r=readingSize]');size.value='large';size.dispatchEvent(new f.w.Event('change'));assert.equal(sc.scrollTop,520);assert.equal(f.sh.root.dataset.readingSize,'large');assert.equal(f.commands.length,0);
});
for(const action of ['language','chapters'])test('pending reading layout yields to '+action+' controls',t=>{
 const f=mount(t);f.sh.s.follow=false;let cancelled=false;f.sh.readingLayoutRaf=456;f.w.cancelAnimationFrame=id=>{if(id===456)cancelled=true;};if(action==='language')f.sh.q('[data-d=tr]').click();else f.sh.showReading(true);assert.equal(cancelled,true);assert.equal(f.commands.some(c=>/seek/.test(c[0])),false);
});

for(const handoff of [false,true])test('chapter return preserves the transcript row after layout change, handoff='+handoff,t=>{
 const f=mount(t);f.sh.s.follow=false;const sc=f.sh.q('[data-r=scroll]');Object.defineProperty(sc,'clientHeight',{value:200,configurable:true});sc.scrollTop=180;sc.getBoundingClientRect=()=>({top:100,bottom:300});f.sh.lines[0].getBoundingClientRect=()=>({top:-100,bottom:90});f.sh.lines[1].getBoundingClientRect=()=>({top:90,bottom:350,height:260});f.sh.showReading(true);let current=f;if(handoff){const prefs=f.sh.prefs(true);f.sh.destroy();current=mount(t,{study:true,prefs});}const dest=current.sh.q('[data-r=scroll]');Object.defineProperty(dest,'clientHeight',{value:200,configurable:true});dest.getBoundingClientRect=()=>({top:100,bottom:300});current.sh.lines[1].getBoundingClientRect=()=>({top:610-dest.scrollTop,bottom:800-dest.scrollTop,height:190});current.sh.showReading(false);assert.equal(dest.scrollTop,520);assert.equal(current.commands.length,0);
});

for(const handoff of [false,true])test('dragging volume to zero restores the latest audible input, handoff='+handoff,async t=>{
 const first=mount(t);let finish;const sent=[];first.sh.a.cmd=(name,value)=>{sent.push(value);return new Promise(resolve=>finish=resolve);};const slider=first.sh.q('.sh-local-volume');for(const value of ['.8','0']){slider.value=value;slider.dispatchEvent(new first.w.Event('input'));}let live=first;if(handoff){const prefs=first.sh.prefs(true);first.sh.destroy();live=mount(t,{study:true,prefs});live.sh.a.cmd=(name,value)=>{sent.push(value);return {ok:true};};}live.sh.q('[data-r=volumeIcon]').click();assert.equal(Number(live.sh.q('.sh-local-volume').value),.8);finish({ok:true});await new Promise(setImmediate);assert.deepEqual(sent,[.8,.8]);
});

for(const action of ['passage','full-sentence'])test('explicit passage reading wins over the chapter return position, action='+action,t=>{
 const f=mount(t);f.sh.s.follow=false;f.sh.showReading(true);let cancelled=false;f.sh.applyReadingPosition=()=>{f.sh.readingLayoutRaf=678;};f.w.cancelAnimationFrame=id=>{if(id===678)cancelled=true;};if(action==='passage')f.sh.focusPassage(12);else f.sh.readCurrentSentence(f.sh.q('[data-a=readCurrent]'));assert.equal(cancelled,true);assert.equal(f.sh.root.classList.contains('sh-chapters-open'),false);assert.equal(f.commands.length,0);
});


test('Tasks sentence checkbox is keyboard-native, keeps focus and rejects an obsolete source',t=>{
 const values=[],item={type:'checkbox',id:'sentence-merge',label:'Cümleleri birleştir',value:false,onChange:value=>{values.push(value);item.value=value;}};
 const f=mount(t,{sections:[{title:'Altyazı ve Whisper',items:[item]}]});f.sh.togglePanel();
 let input=f.sh.q('[data-pid="sentence-merge"]');assert.equal(input.type,'checkbox');input.focus();input.click();
 assert.deepEqual(values,[true]);input=f.sh.q('[data-pid="sentence-merge"]');assert(input.checked);assert.equal(f.w.document.activeElement,input);
 f.sh.a.identity=()=> 'other-source';input.click();assert.deepEqual(values,[true]);
});


test('R854 G17/G19/G22 text focus is visual only, translation readiness counts real channels and task context states its effects',t=>{
 const h=mount(t,{study:true,audio:true,processing:true,actions:[{id:'translate',label:'Translate'}],sections:[{id:'captions',title:'Subtitles',items:[]}]});h.sh.tick();const button=h.sh.root.querySelector('[data-a=textfirst]');assert(button);button.click();assert(h.sh.root.classList.contains('sh-text-first'));assert.equal(h.commands.length,0);const state=h.sh.root.querySelector('[data-r=processingState]');assert.match(state.textContent,/Kaynak: 2.*Çeviri: 1\/2/);h.sh.togglePanel();assert.match(h.sh.root.querySelector('.sh-panel-context').textContent,/Bölüm.*Dosya değişiklikleri.*onay/);assert.equal(h.commands.length,0);
});

test('cinema keyboard: arrows seek, F fullscreen, arrow volume and M mute use the transport owners', t => {
  const c = mount(t, { cinema: true }), press = (key, extra = {}) => c.sh.root.dispatchEvent(new c.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
  press('ArrowRight'); assert.deepEqual(c.commands.at(-1).slice(0, 2), ['seekBy', 5]);
  press('ArrowLeft', { shiftKey: true }); assert.deepEqual(c.commands.at(-1).slice(0, 2), ['seekBy', -10]);
  press('f'); assert.equal(c.commands.at(-1)[0], 'fullscreen');
  assert.ok(c.sh.q('[data-a=mute]'), 'mute button replaces the dead Volume label');
});
