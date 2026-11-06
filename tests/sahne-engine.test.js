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
  Object.assign(f.rows[0], { translationCueIds: ['t1', 't2'], translationStarts: [2, 5] });
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
 }
});
test('independent translation follows its own clock in both shared modes', t => {
 for (const study of [false, true]) {
  const f = mount(t, { study, prefs: { disp: 'tr' } }), state = f.sh.a.state;
  f.rows.push({ id: 'gap', start: 22, end: 26, timed: true, src: '', trs: ['Ayrı çeviri'], unc: [],
   standaloneTranslation: true, translationCueIds: ['gap'], translationStart: 22 });
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
  f.rows[0].translationStart=4;
  f.setRevision('translated');f.sh.tick();
  const button=()=>f.sh.lines[0].querySelector('[data-a=cueSeek]');
  f.sh.q('[data-d=tr]').click();
  assert.match(button().textContent,/0:04/);
  button().click();
  assert.deepEqual(f.commands.at(-1).slice(0,2),['seekTranslation',0]);
  f.rows[0].translationStart=null;
  f.setRevision('unverified');f.sh.tick();
  assert.equal(button().disabled,true);
  f.sh.q('[data-d=both]').click();
  assert.equal(button().disabled,false);
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
test('untimed content is readable without a timestamp, active line, or seek command',t=>{
 const f=mount(t,{untimed:true}),row=f.sh.q('[data-i="0"]');assert(row.textContent.includes('Yayıncı metni'));assert.equal(row.hasAttribute('tabindex'),false);assert.equal(row.querySelector('.at'),null);assert.equal(f.sh.cur,-1);row.click();assert.equal(f.commands.length,0);
});

test('saved passage focus identifies a real timed line without changing playback or inventing an active line',t=>{
 const f=mount(t);f.sh.focusPassage(12);assert(f.sh.lines[1].classList.contains('sh-search-match'));assert.equal(f.sh.cur,0);assert.equal(f.commands.length,0);
 const plain=mount(t,{untimed:true});plain.sh.focusPassage(0);assert(!plain.sh.root.querySelector('.sh-search-match'));assert.equal(plain.sh.cur,-1);assert.equal(plain.commands.length,0);
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

test('an open word card is invalidated when its transcript revision changes',async t=>{
 const f=mount(t,{cinema:true});await f.sh.openWord(0,'source');assert.equal(f.sh.q('.sh-word-card').hidden,false);f.setRevision('r2');f.sh.tick();assert.equal(f.sh.q('.sh-word-card').hidden,true);assert.equal(f.sh.s.word,null);
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

test('untimed note editor has no return-time action and closes on transcript revision',t=>{
 const f=mount(t,{save:true,untimed:true});f.sh.q('[data-act=save]').click();const box=f.sh.q('.sh-note-card');assert.equal(box.hidden,false);assert.equal(box.querySelector('[data-a=noteSeek]'),null);assert.match(box.textContent,/Zamansız/);
 assert.equal(f.commands.length,0);f.setRevision('new');f.sh.tick();assert.equal(box.hidden,true);assert.equal(f.sh.s.note,null);
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
 const panel=f.sh.q('.sh-top [data-a=panel]');panel.focus();panel.click();
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
 seek.blur();f.sh.followAfterLayout();callback();assert.equal(calls,1);
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

test('shared transport enables only usable sentence tools and supports keyboard timeline bounds', t => {
  const plain = mount(t, { untimed: true });
  assert(plain.sh.q('[data-a=replay]').disabled);
  assert(plain.sh.q('[data-a=loop]').disabled);
  assert(!plain.sh.q('[data-a=back]').disabled);
  assert.match(plain.sh.q('[data-r=transportHint]').textContent, /zamanlı transkript/);

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
test('track rebuild preserves focus on the same independent translation when cue ids overlap', t => {
 const f=mount(t,{study:true,prefs:{disp:'tr'}});
 f.rows[1]={...f.rows[1],id:f.rows[0].id,src:'',trs:['Independent translation'],
  standaloneTranslation:true,translationCueIds:['independent'],translationStart:12};
 f.setRevision('independent-added');f.sh.tick();
 f.sh.lines[1].querySelector('[data-a=cueSeek]').focus();
 f.setRevision('new-revision');f.sh.tick();
 assert.equal(f.w.document.activeElement.closest('[data-i]').dataset.i,'1');
});
test('track rebuild preserves a translation sentence button through a part reorder', t => {
 const f=mount(t,{study:true,prefs:{disp:'tr'}});
 Object.assign(f.rows[0],{translationCueIds:['one','two'],translationStarts:[1,3]});
 f.setRevision('parts');f.sh.tick();
 f.sh.lines[0].querySelector('[data-a=translationSeek][data-part="1"]').focus();
 const state=f.sh.a.state;
 const rows=[{...f.rows[0],translationCueIds:['two','one'],translationStarts:[3,1],trs:['Second','First']},...f.rows.slice(1)];
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
  const scroll = study.sh.q('[data-r=scroll]');
  Object.defineProperty(scroll, 'clientHeight', { value: 300 });
  study.sh.q('.sh-transcript-toggle').click();
  assert.equal(scroll.scrollTop, 73);
  const other = mount(t, { study:true, prefs, identity:'different-source' });
  assert.equal(other.sh.q('[data-r=q]').value, '');
  assert.equal(other.sh.s.follow, true);
  assert.equal(other.sh.s.sleepAt, 0);
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
