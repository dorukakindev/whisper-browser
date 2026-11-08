'use strict';
// REAL: index.html DOM, dub-generator-ui.js, dub-runs-ui.js, DubGeneratorBridge (not replaced), registerDubService handlers
// (dub:config, dub:latest, dub:runs), the saved-output lookup, WAV validation, source identity and subtitle digest.
// CONTROLLED: the worker process (fake spawn), the media context (BrowserDubAudioUI), and the delays injected between DOM and handler.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{world,wav,outputOf}=require('./dub-run-world');
const read=name=>fs.readFileSync(path.join(__dirname,'../src/renderer',name),'utf8');
const clone=value=>value===undefined?value:JSON.parse(JSON.stringify(value));
const tick=(ms=12)=>new Promise(resolve=>setTimeout(resolve,ms));
const settle=async()=>{for(let i=0;i<5;i++)await tick(8);};

async function doneRun(w,svc,id,{source='media-A',range}={}){
 const index=w.spawns.length;assert.equal((await svc.call('dub:start',{...w.request(id),source,...(range?{range}:{})})).ok,true);
 fs.writeFileSync(outputOf(w.spawns[index]),wav(2));w.spawns[index].proc.exitCode=0;w.spawns[index].proc.emit('close',0);await tick();
 assert.equal(w.records().find(r=>r.id===id).result,'done',id);
}
test('REAL BRIDGE: a failed saved-output read stays unknown, is retryable and never claims a section mismatch',async()=>{
 const w=world();try{
  const svc=w.boot();await doneRun(w,svc,'prior-output');await doneRun(w,svc,'read-unavailable');const p=panel(w,svc),spawns=w.spawns.length;
  try{
   await p.open();p.state.source='media-A';await p.chooseSubtitle();await p.select('prior-output');await p.click('Bu bölüme yükle');assert.equal(p.win.DubGeneratorUI.experience().output.id,'prior-output');p.state.failLatest=true;await p.select('read-unavailable');
   assert.doesNotMatch(p.text(),/şu anki altyazı\/aralık\/kaynakla eşleşmiyor/);assert.match(p.text(),/eşleşmesi denetlenemedi/);assert(p.button('Eşleşmeyi yeniden denetle'));
   p.state.failLatest=false;await p.click('Eşleşmeyi yeniden denetle');assert(p.button('Bu bölüme yükle'));
   p.state.failLatest=true;await p.click('Bu bölüme yükle');assert.match(p.text(),/Sonuç okunamadı/);assert.doesNotMatch(p.text(),/Bu sonuç şu anki altyazı\/aralıkla eşleşmiyor/);assert.equal(p.win.DubGeneratorUI.experience().output.id,'prior-output','the previously loaded result is kept');
   p.state.failLatest=false;await p.click('Bu bölüme yükle');assert.equal(p.shown(),true);assert.equal(p.win.DubGeneratorUI.experience().output.id,'read-unavailable');assert.equal(p.state.attached.length,0);assert.match(p.text(),/çalmaya başlamadı/);assert.equal(w.spawns.length,spawns);
  }finally{p.close_();}
 }finally{w.close();}
});

function panel(w,svc){
 const dom=new JSDOM(read('index.html'),{runScripts:'outside-only',pretendToBeVisual:true}),win=dom.window,el=id=>win.document.getElementById(id);
 const state={source:'media-Z',attached:[],holds:[],latest:[],lose:null};
 win.BrowserDubAudioUI={context:()=>({mode:'player',tabId:'tab-1',mediaKey:state.source,source:state.source,currentTime:0,backgroundSource:'',visible:true,hasMedia:true}),
  attachGenerated:async(file,context)=>{state.attached.push({file,context});return true;}};
 win.HTMLMediaElement.prototype.pause=win.HTMLMediaElement.prototype.load=()=>{};win.syncBrowserOcclusion=()=>{};
 const hold=(match)=>{const item={match,used:false};item.gate=new Promise(resolve=>{item.release=resolve;});item.reached=new Promise(resolve=>{item.reach=resolve;});state.holds.push(item);return item;};
 win.api={
  dubConfig:kind=>svc.call('dub:config',kind),selectFile:async()=>w.srt,listVoiceReferences:async()=>({ok:true,references:[]}),
  latestDub:async request=>{const req=clone(request);state.latest.push(req);if(state.failLatest)throw Error('IPC disconnected');const item=state.holds.find(h=>!h.used&&h.match(req));
   const result=await svc.call('dub:latest',req);if(item){item.used=true;item.reach();await item.gate;}return clone(result);},
  dubRuns:async request=>clone(await svc.call('dub:runs',clone(request))),onDubEvent:callback=>svc.on(callback),startDub:async request=>svc.call('dub:start',clone(request)),cancelDub:async()=>({ok:true})};
 el('dubGeneratorDialog').showModal=()=>{el('dubGeneratorDialog').open=true;};
 win.DubRunInfo=require('../src/renderer/dub-run-info');
 win.eval(read('dub-generator-ui.js')+'\n;0');win.eval(read('dub-runs-ui.js')+'\n;0');win.eval(read('assistant-voice-runs.js')+'\n;0');
 const section=el('dubRuns');
 return {win,el,state,hold,section,
  open:async()=>{el('playerDubGenerate').click();await settle();section.open=true;section.dispatchEvent(new win.Event('toggle'));await settle();},
  chooseSubtitle:async()=>{el('dubChooseSrt').click();await settle();},
  closeDialog:async()=>{el('dubGeneratorDialog').open=false;el('dubGeneratorDialog').removeAttribute('open');el('dubGeneratorDialog').dispatchEvent(new win.Event('close'));await settle();},
  row:id=>section.querySelector(`.dub-run[data-run="${id}"]`),
  select:async id=>{section.querySelector(`.dub-run[data-run="${id}"] .dub-run-main`).click();await settle();},
  button:text=>[...section.querySelectorAll('button')].find(b=>b.textContent.includes(text)),
  click:async text=>{const b=[...section.querySelectorAll('button')].find(item=>item.textContent.includes(text));assert(b,'button '+text);b.click();await settle();},
  text:()=>section.textContent,shown:()=>!el('dubPreviewCard').hidden,audio:()=>el('dubGeneratedPreview'),close_:()=>win.close()};
}

test('REAL BRIDGE: a bound completed run is loaded into the matching section through the real saved-output check, never plays or starts anything, and is usable through the existing "use" path',async()=>{
 const w=world();try{
  const svc=w.boot();await doneRun(w,svc,'run-a');const spawns=w.spawns.length,p=panel(w,svc);
  await p.open();p.state.source='media-A';await p.chooseSubtitle();await p.select('run-a');
  assert(p.button('Bu bölüme yükle'),'the real probe (real latestDub) found the run for this subtitle/source/range');
  assert.equal(p.shown(),false);await p.click('Bu bölüme yükle');
  assert.deepEqual(p.state.latest.at(-1).id,'run-a');assert.equal(p.state.latest.at(-1).source,'media-A');assert.equal(p.state.latest.at(-1).srt,w.srt);
  assert.equal(p.shown(),true,'the real generator shows the loaded output');assert.match(p.audio().getAttribute('src'),/run-a\.wav$/);
  assert.equal(p.audio().autoplay,false);assert.equal(p.audio().paused,true,'nothing plays');assert.equal(w.spawns.length,spawns,'loading starts no production');
  assert.match(p.text(),/çalmaya başlamadı/);
  // the loaded result is usable through the existing application path (the same button, the same attach function)
  assert.equal(p.el('dubGeneratorUse').classList.contains('hidden'),false);assert.equal(p.el('dubGeneratorUse').disabled,false);
  p.el('dubGeneratorUse').click();await settle();
  assert.equal(p.state.attached.length,1,'"use" reached the media attach function');assert.match(p.state.attached[0].file.path,/run-a\.wav$/);
  p.close_();
 }finally{w.close();}
});

test('REAL BRIDGE: a result of another source or range is not loadable and stays open for safe listening only',async()=>{
 const w=world();try{
  const svc=w.boot();await doneRun(w,svc,'run-a',{source:'media-A'});const p=panel(w,svc);
  await p.open();p.state.source='media-B';await p.chooseSubtitle();await p.select('run-a');
  assert.equal(p.button('Bu bölüme yükle'),undefined);assert.match(p.text(),/eşleşmiyor; yalnız dinlenebilir/);assert(p.button('Dinle (yalnız inceleme)'));
  const direct=await p.win.DubGeneratorBridge.load('run-a');assert.deepEqual([direct.ok,direct.code],[false,'not-this-section']);assert.equal(p.shown(),false,'nothing was adopted');
  p.state.source='media-A';p.el('dubRangeEnabled').checked=true;p.el('dubRangeEnabled').dispatchEvent(new p.win.Event('input'));p.el('dubRangeStart').value='5';p.el('dubRangeEnd').value='20';
  assert.equal((await p.win.DubGeneratorBridge.load('run-a')).ok,false,'a different range does not match the pinned one');assert.equal(p.shown(),false);
  p.close_();
 }finally{w.close();}
});

test('REAL BRIDGE: a file that disappears or changes between the probe and the load is an explained error, never a false success',async()=>{
 const w=world();try{
  const svc=w.boot();await doneRun(w,svc,'run-a');const p=panel(w,svc);await p.open();p.state.source='media-A';await p.chooseSubtitle();await p.select('run-a');
  assert(p.button('Bu bölüme yükle'));
  const file=path.join(w.out,'run-a.wav');fs.writeFileSync(file,wav(2).subarray(0,3000));          // truncated after the probe
  await p.click('Bu bölüme yükle');
  assert.equal(p.shown(),false,'no output was shown');assert.match(p.text(),/liste yüklendikten sonra değişti veya kayboldu/);assert.match(p.text(),/Listeyi yenile/);assert.doesNotMatch(p.text(),/Bu bölüme yüklendi/);
  fs.rmSync(file);await p.click('Yenile');assert.match(p.row('run-a').textContent,/Çıktı eksik|ses yok/);
  p.close_();
 }finally{w.close();}
});

test('REAL BRIDGE RACES: an old probe, an old load, a closed and reopened panel on another source, and reversed loads never put an old result into a new section',async()=>{
 const w=world();try{
  const svc=w.boot();await doneRun(w,svc,'run-a');await doneRun(w,svc,'run-b');
  // (1) a probe waits while the section changes: the stale probe must not offer a load
  let p=panel(w,svc);await p.open();p.state.source='media-A';await p.chooseSubtitle();
  const probeHold=p.hold(r=>r.id==='run-a'),selecting=p.select('run-a');await probeHold.reached;
  p.state.source='media-B';probeHold.release();await selecting;await settle();
  assert.equal(p.button('Bu bölüme yükle'),undefined,'a probe answered for the old section is discarded');p.close_();
  // (2) a load waits while another run is selected: nothing is adopted for a selection that is no longer current
  p=panel(w,svc);await p.open();p.state.source='media-A';await p.chooseSubtitle();await p.select('run-a');
  const loadHold=p.hold(r=>r.id==='run-a'&&p.state.holds.every(h=>h.used||h===loadHold)),clicking=p.button('Bu bölüme yükle');
  clicking.click();await loadHold.reached;await p.select('run-b');loadHold.release();await settle();
  assert.equal(p.shown(),false,'the old load was dropped because the selection moved on');p.close_();
  // (3) the panel is closed and reopened on another source while a load waits; the old answer completes afterwards
  p=panel(w,svc);await p.open();p.state.source='media-A';await p.chooseSubtitle();await p.select('run-a');
  const late=p.hold(r=>r.id==='run-a'&&!p.state.holds.some(h=>h.used&&h!==late)&&true);p.button('Bu bölüme yükle').click();await late.reached;
  await p.closeDialog();p.state.source='media-Z';await p.open();p.state.source='media-B';await p.chooseSubtitle();late.release();await settle();
  assert.equal(p.shown(),false,'the late answer never reaches the reopened panel');assert.equal(p.el('dubGeneratedName').textContent.includes('run-a'),false);p.close_();
  // (4) two loads finishing in reverse order: only the newest may show
  p=panel(w,svc);await p.open();p.state.source='media-A';await p.chooseSubtitle();
  const first=p.hold(r=>r.id==='run-a'),a=p.win.DubGeneratorBridge.load('run-a');await first.reached;
  const b=await p.win.DubGeneratorBridge.load('run-b');first.release();const oldResult=await a;
  assert.equal(b.ok,true);assert.deepEqual([oldResult.ok,oldResult.code],[false,'stale'],'the older load answered last and was refused');
  assert.match(p.audio().getAttribute('src'),/run-b\.wav$/,'run-b stays; run-a did not overwrite it');p.close_();
 }finally{w.close();}
});

test('ASSISTANT → PANEL (real generator + runs UI + assistant executor): the panel state keeps the selected run and the open media apart; "open result" selects and prepares a paused review; "retry preview" only opens the preview; nothing starts',async()=>{
 const w=world();try{
  const svc=w.boot();await doneRun(w,svc,'run-a');{const index=w.spawns.length;assert.equal((await svc.call('dub:start',{...w.request('run-f'),source:'media-A'})).ok,true);w.spawns[index].proc.exitCode=1;w.spawns[index].proc.emit('close',1);await tick();}
  const spawns=w.spawns.length,p=panel(w,svc);
  p.win.document.getElementById('playerTitle').textContent='Film now playing';
  await p.open();p.state.source='media-A';await p.chooseSubtitle();
  const before=p.win.AssistantVoiceRuns.panel();assert.deepEqual([before.panelOpen,before.selectedRunId,before.openSource,before.media?.title],[true,null,'media-A','Film now playing']);
  const result=await p.win.AssistantVoiceRuns.open({run_id:'run-a',target:'result'});
  assert.deepEqual([result.status,result.selected,result.audio_ready_paused],['completed',true,true]);
  const during=p.win.AssistantVoiceRuns.panel();assert.equal(during.selectedRunId,'run-a','the selected record is reported...');assert.equal(during.media.title,'Film now playing','...separately from the open media');
  const audio=p.section.querySelector('audio.dub-run-audio');assert(audio);assert.equal(audio.paused,true);assert.equal(audio.autoplay,false);
  await assert.rejects(()=>p.win.AssistantVoiceRuns.open({run_id:'run-a',target:'retry_preview'}),/cannot be retried|yeniden denenemez/);
  const retry=await p.win.AssistantVoiceRuns.open({run_id:'run-f',target:'retry_preview'});assert.equal(retry.preview_ready,true);assert(p.section.querySelector('[data-preview="pinned"]'));
  assert.equal(p.section.querySelector('[data-preview="pinned"] button[data-mode]').disabled,false,'the approval button exists but was not pressed');
  assert.equal(w.spawns.length,spawns,'opening a run or its retry preview started no production');
  await assert.rejects(()=>p.win.AssistantVoiceRuns.open({run_id:'run-unknown',target:'result'}),/no longer in the list/);
  p.close_();
 }finally{w.close();}
});

test('CHAIN B (real DOM → real generator + runs UI → real handlers): recent runs → interrupted and uncertain records → service verification → recovery → review → safe load in the same source → retry preview → approval → one production → real state update',async()=>{
 const w=world();try{
  const first=w.boot();
  let index=w.spawns.length;assert.equal((await first.call('dub:start',{...w.request('run-fail'),source:'media-A'})).ok,true);w.spawns[index].proc.stderr.emit('data','worker exploded');w.spawns[index].proc.exitCode=1;w.spawns[index].proc.emit('close',1);await tick();
  index=w.spawns.length;assert.equal((await first.call('dub:start',{...w.request('run-cut'),source:'media-A'})).ok,true);
  const output=outputOf(w.spawns[index]);fs.writeFileSync(output,wav(2));w.spawns[index].proc.stdout.emit('data','Tamamlandi: '+output+'\n');
  for(const name of fs.readdirSync(path.join(w.logs,'instances'))){const f=path.join(w.logs,'instances',name),lease=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...lease,pid:2147483000}));}
  // an uncertain record: another app instance whose process answers but whose heartbeat stopped
  const other=w.ledger('STALE',process.pid),file=path.join(w.logs,'run-unc-1.json');other.begin({summaryPath:file,id:'run-unc',startedAt:new Date().toISOString(),label:'Belirsiz',pinned:{profile:'quality',subtitleHash:require('./dub-run-world').sha('fixture'),sourceIdentity:'x'}});other.mark(file,{workerCompleted:true});
  fs.writeFileSync(path.join(w.out,'run-unc.wav'),wav(1));const lease=path.join(w.logs,'instances','STALE.json');fs.writeFileSync(lease,JSON.stringify({...JSON.parse(fs.readFileSync(lease,'utf8')),heartbeatAt:Date.now()-300000}));
  const svc=w.boot(),p=panel(w,svc);await p.open();p.state.source='media-A';await p.chooseSubtitle();
  assert.deepEqual([p.row('run-cut').dataset.state,p.row('run-unc').dataset.state,p.row('run-fail').dataset.state],['interrupted','uncertain','failed'],'service verification classified each record');
  await p.select('run-unc');assert.match(p.text(),/bildirim durdu/);assert.equal(p.button('Çıktıyı kurtar'),undefined);assert.equal(p.button('Sabitlenmiş seçeneklerle'),undefined);
  await p.select('run-cut');assert.match(p.text(),/İşçi bittiğini bildirdi/);const spawns=w.spawns.length;await p.click('Çıktıyı kurtar');
  assert.match(p.text(),/Kurtarıldı\. Hiçbir bölüme bağlanmadı ve çalmadı/);assert.equal(p.row('run-cut').dataset.state,'completed');assert.equal(p.shown(),false,'recovery did not put the result into the section');assert.equal(p.section.querySelectorAll('audio').length,0);
  await p.click('Dinle (yalnız inceleme)');const audio=p.section.querySelector('audio.dub-run-audio');assert(audio);assert.equal(audio.paused,true);
  assert(p.button('Bu bölüme yükle'),'the recovered, bound result matches this source');await p.click('Bu bölüme yükle');assert.equal(p.shown(),true);assert.match(p.audio().getAttribute('src'),/run-cut\.wav$/);assert.equal(p.audio().paused,true);
  p.el('dubGeneratorUse').click();await settle();assert.equal(p.state.attached.length,1);assert.match(p.state.attached[0].file.path,/run-cut\.wav$/);
  assert.equal(w.spawns.length,spawns,'recovery, review and load started no production');
  await p.select('run-fail');await p.click('Sabitlenmiş seçeneklerle yeniden dene');const confirm=p.button('Sabit seçeneklerle başlat');confirm.click();confirm.click();await settle();
  assert.equal(w.spawns.length,spawns+1,'one approval, one production');const retry=w.records().find(r=>r.retryOf==='run-fail');assert(retry);assert.equal(p.row(retry.id).dataset.state,'running');assert.match(p.text(),/henüz tamamlanmadı/);
  const proc=w.spawns.at(-1).proc;fs.writeFileSync(outputOf(w.spawns.at(-1)),wav(2));proc.exitCode=0;proc.emit('close',0);await tick(400);await p.click('Yenile');
  assert.equal(p.row(retry.id).dataset.state,'completed','the real state moved from running to completed');assert.equal(p.row('run-fail').dataset.state,'failed','the earlier failed record is unchanged');
  p.close_();
 }finally{w.close();}
});
