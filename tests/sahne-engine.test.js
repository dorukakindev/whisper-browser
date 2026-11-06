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
test('manual transcript browsing remains stopped; return follows without seeking',t=>{
 const f=mount(t),scroll=f.sh.q('[data-r=scroll]');scroll.dispatchEvent(new f.w.WheelEvent('wheel',{deltaY:-100}));assert.equal(f.sh.s.follow,false);
 f.setTime(12);f.sh.tick();assert.equal(f.sh.s.follow,false);assert.equal(f.sh.cur,1);
 f.sh.q('[data-a=follow]').click();assert.equal(f.sh.s.follow,true);assert.equal(f.commands.length,0);
 assert.equal(f.sh.rows[0].trs.length,2);
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
 const row=f.sh.lines[0];row.focus();f.setTime(12);f.sh.tick();assert.equal(f.w.document.activeElement,row);
 f.setRevision('r2');f.sh.tick();assert.equal(f.w.document.activeElement,f.sh.lines[0]);
 key(f.sh.lines[0],' ');assert.equal(f.commands.at(-1)[0],'seekCue');
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
 f.sh.s.follow=true;f.sh.lines[0].focus();f.sh.followAfterLayout();callback();assert.equal(calls,0);
 f.sh.lines[0].blur();f.sh.followAfterLayout();callback();assert.equal(calls,1);
 f.sh.destroy();callback();assert.equal(calls,1);
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
  assert.equal(study.sh.lines[0].tabIndex, 0);
  assert(!study.sh.lines[0].querySelector('[data-act=loop]').disabled);
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

test('mode handoff preserves same-source reading and sleep but rejects another media identity', t => {
  const podcast = mount(t);
  const search = podcast.sh.q('[data-r=q]');
  search.value = 'next';
  search.dispatchEvent(new podcast.w.Event('input'));
  podcast.sh.q('[data-a=sleep]').click();
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
