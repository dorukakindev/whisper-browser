"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function mount(t,{untimed=false,cinema=false,audio=false,empty=false,study=false,actions=[],timingNotice='',save=false}={}){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://test.invalid',pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window;
 w.UiLocale={get:()=> 'tr'};w.matchMedia=()=>({matches:true});w.Element.prototype.scrollTo=function(value){this.scrollTop=value.top;};
 let time=2,revision="r1";const commands=[];const rows=untimed?[{id:'text',start:0,end:0,timed:false,src:'Yayıncı metni',trs:[],unc:[],words:null}]:[{id:'a',start:0,end:10,timed:true,src:'A source sentence',trs:['Birinci çeviri','İkinci çeviri'],unc:[],words:null},{id:'b',start:10,end:20,timed:true,src:'The next sentence',trs:[],unc:[],words:null}];
 const adapter={caps:{loop:true,cinema,study:true,save},identity:()=> 'same-source',actions:()=>actions,info:()=>({audio,title:'Bölüm',langs:{src:'en',tr:'tr'},chapters:[{t:0,label:'Giriş'},{t:10,label:'İkinci bölüm'}],queue:[{index:1,title:'Sıradaki gerçek kayıt'}]}),state:()=>({time,duration:30,paused:true,rate:1,volume:.42,rows:empty?[]:rows,rev:revision,untimed,timingNotice,canSeek:true}),cmd:(...args)=>{commands.push(args);return Promise.resolve(args[0]==='wordInfo'?{ok:true,word:args[1].word,source:rows[args[1].row].src,translations:rows[args[1].row].trs,canSave:true,saved:false}:{ok:args[0]!=='loop',code:'busy'});},panel:()=>({sections:[],job:{state:'idle'}})};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/browser-study-view.js'),'utf8'));
 w.eval(fs.readFileSync(require.resolve('../src/renderer/sahne.js'),'utf8'));
 const sh=new w.Sahne(w.document.getElementById('host'),adapter,{mode:cinema?'cinema':study?'study':'podcast',intro:false});
 t.after(()=>{sh.destroy();w.close();});return {w,sh,commands,setTime:value=>time=value,setRevision:value=>revision=value};
}
test('manual transcript browsing remains stopped; return follows without seeking',t=>{
 const f=mount(t),scroll=f.sh.q('[data-r=scroll]');scroll.dispatchEvent(new f.w.WheelEvent('wheel',{deltaY:-100}));assert.equal(f.sh.s.follow,false);
 f.setTime(12);f.sh.tick();assert.equal(f.sh.s.follow,false);assert.equal(f.sh.cur,1);
 f.sh.q('[data-a=follow]').click();assert.equal(f.sh.s.follow,true);assert.equal(f.commands.length,0);
 assert.equal(f.sh.rows[0].trs.length,2);
});
test('untimed content is readable without a timestamp, active line, or seek command',t=>{
 const f=mount(t,{untimed:true}),row=f.sh.q('[data-i="0"]');assert(row.textContent.includes('Yayıncı metni'));assert.equal(row.hasAttribute('tabindex'),false);assert.equal(row.querySelector('.at'),null);assert.equal(f.sh.cur,-1);row.click();assert.equal(f.commands.length,0);
});
test('rejected loop never appears enabled; task drawer marks native occlusion immediately',async t=>{
 const f=mount(t);f.sh.toggleLoop();await Promise.resolve();await Promise.resolve();assert.equal(f.sh.s.loop,false);
 f.sh.q('[data-a=panel]').click();assert.equal(f.sh.root.getAttribute('data-pw-occludes-native'),'true');f.sh.q('[data-pclose]').click();assert.equal(f.sh.root.hasAttribute('data-pw-occludes-native'),false);
});

test('local cinema uses real chapters/queue and the same transport commands',t=>{
 const f=mount(t,{cinema:true});assert(f.sh.root.classList.contains('sh-local'));assert.equal(f.sh.q('.sh-cinema-meta h1').textContent,'Bölüm');
 const chapters=f.sh.root.querySelectorAll('.sh-cinema-chapters .sh-chap');assert.equal(chapters.length,2);chapters[1].click();assert.equal(f.commands.at(-1)[0],'seek');assert.equal(f.commands.at(-1)[1],10);
 f.sh.q('.sh-next-item').click();assert.equal(f.commands.at(-1)[0],'openQueued');assert.equal(f.commands.at(-1)[1],1);
});
test('word card contains actual subtitle context and marks itself as no definition',async t=>{
 const f=mount(t,{cinema:true});await f.sh.openWord(0,'source');const card=f.sh.q('.sh-word-card');assert.equal(card.hidden,false);assert(card.textContent.includes('A source sentence'));assert(card.textContent.includes('sözlük tanımı değildir'));assert.equal(f.sh.root.getAttribute('data-pw-occludes-native'),'true');f.sh.closeWord();assert.equal(card.hidden,true);
});

test('an open word card is invalidated when its transcript revision changes',async t=>{
 const f=mount(t,{cinema:true});await f.sh.openWord(0,'source');assert.equal(f.sh.q('.sh-word-card').hidden,false);f.setRevision('r2');f.sh.tick();assert.equal(f.sh.q('.sh-word-card').hidden,true);assert.equal(f.sh.s.word,null);
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
