'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),summary=require('../src/translation-review-summary');

test('untranslated warnings exclude names, short shared words, and Turkish sentences',()=>{
 const rows=['Newton','This is the story that they have told from the beginning.','Bu filmde the ve their sözcükleri açıklanıyor.','This is it.'].map(text=>({text}));
 assert.deepEqual(summary.untranslatedIndices([],rows,'tr'),[1]);assert.deepEqual(summary.untranslatedIndices([],rows,'en'),[]);
 const copy=[{text:'The pharaohs of Egypt and the rulers of this kingdom.'}];assert.deepEqual(summary.untranslatedIndices(copy,copy,'tr'),[0]);
 const short=[{text:'family that can be deities for a kingdom.'}];assert.deepEqual(summary.untranslatedIndices(short,short,'tr'),[0]);
 const mixed=['What is it?','I don’t know.','Marie Curie','New York','No problem','“I don’t know.”','Bu filmde “What is it?” deniyor.'].map(text=>({text}));
 assert.deepEqual(summary.untranslatedIndices(mixed,mixed,'tr'),[0,1]);
 assert.deepEqual(summary.untranslatedIndices([],mixed,'tr'),[]);
});

test('Tasks review requires approval and refuses a source changed during the approval dialog',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),begin=source.indexOf('window.SubtitleTranslationRepair='),end=source.indexOf('\nfunction showResultModal',begin);let approved=false,current=true,queued=0,dialog;
 const ctx={window:{api:{repairSubtitleTranslation:async request=>request.prepare?{ok:true,sourcePath:'s.srt',translationPath:'t.srt',targetLanguage:'tr',forSpeech:false}:{ok:true,canRepair:true,failed:1,fingerprint:'exact',mixed:true}}},interfaceChoice:(tr,en)=>tr,addToQueue:()=>{queued++;return true;},state:{running:true},startQueue:()=>{},openAppDialog:async args=>{dialog=args;return approved;}};
 vm.runInNewContext(source.slice(begin,end),ctx);
 const call=()=>ctx.window.SubtitleTranslationRepair.review('manual.partial.srt',{isCurrent:()=>current,allowMixed:true});
 await call();assert.equal(queued,0);assert.match(dialog.description,/Diğer satırlar ve tüm zamanlar korunur/);
 ctx.openAppDialog=async()=>{current=false;return true;};await call();assert.equal(queued,0);
 current=true;ctx.openAppDialog=async()=>true;await call();assert.equal(queued,1);
});

test('sentence merge control updates the existing processing and player controls together',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),begin=source.indexOf('window.SentenceMergeControl='),end=source.indexOf('window.SubtitleTranslationRepair=',begin),dom=new JSDOM('<input type="checkbox" id="mergeContinuation"><input type="checkbox" id="playerMergeCont">'),events=[];
 try{const ctx={window:dom.window,$:id=>dom.window.document.getElementById(id),Event:dom.window.Event,CustomEvent:dom.window.CustomEvent};for(const id of ['mergeContinuation','playerMergeCont'])ctx.$(id).addEventListener('change',()=>events.push(id));vm.runInNewContext(source.slice(begin,end),ctx);ctx.window.SentenceMergeControl.set(true);assert(ctx.$('mergeContinuation').checked);assert(ctx.$('playerMergeCont').checked);assert.deepEqual(events,['mergeContinuation','playerMergeCont']);ctx.window.SentenceMergeControl.set(false);assert(!ctx.$('mergeContinuation').checked);assert(!ctx.$('playerMergeCont').checked);}finally{dom.window.close();}
});

test('shelf approval portals above the isolated app and restores its node and background interactivity',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),dom=new JSDOM('<body class="shelf-sahne-on"><div class="app"><div id="content"></div><div id="modal" class="hidden"><button id="confirm">Confirm</button></div></div><div class="sh-shelf-host"></div></body>'),doc=dom.window.document,modal=doc.getElementById('modal'),home=modal.parentElement,host=doc.querySelector('.sh-shelf-host');
 const ctx={document:doc,HTMLElement:dom.window.HTMLElement,requestAnimationFrame:fn=>fn(),syncBrowserOcclusion:()=>{},modalFocusable:()=>[],console};
 const state=source.slice(source.indexOf('let _activeModal ='),source.indexOf('function modalFocusable(')),inert=source.slice(source.indexOf('function setModalBackgroundInert('),source.indexOf('function syncBrowserOcclusion(')),functions=source.slice(source.indexOf('function openManagedModal('),source.indexOf("document.addEventListener('keydown'",source.indexOf('function closeManagedModal(')));
 try{vm.runInNewContext(state+inert+functions,ctx);ctx.openManagedModal(modal,doc.getElementById('confirm'));assert.equal(modal.parentElement,doc.body);assert.equal(host.inert,true);assert.equal(doc.activeElement.id,'confirm');ctx.closeManagedModal(modal);assert.equal(modal.parentElement,home);assert.equal(host.inert,false);assert.equal(doc.getElementById('content').inert,false);}finally{dom.window.close();}
});

test('repair offer asks first, snapshots the file and queues only a strict missing-cue translation',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),begin=source.indexOf('window.SubtitleTranslationRepair='),end=source.indexOf('\nfunction showResultModal',begin);
 const dom=new JSDOM('<div id="offer"></div>'),container=dom.window.document.getElementById('offer'),requests=[],queued=[];let current=true,started=0;
 const ctx={window:{api:{repairSubtitleTranslation:async request=>{requests.push(request);return request.prepare?{ok:true,sourcePath:'source.srt',translationPath:'repair.srt',targetLanguage:'tr',forSpeech:false,repairInputProof:{source:'a'.repeat(64),translation:'b'.repeat(64)},playbackContext:{mediaPath:'C:/movie.mp4',range:{start:2,end:10},mediaStat:{size:24,mtimeMs:1}}}:{ok:true,canRepair:true,failed:2,fingerprint:'exact'};}}},document:dom.window.document,interfaceChoice:(tr,en)=>tr,addToQueue:(...args)=>{queued.push(args);return true;},state:{running:false,queueRunning:false},startQueue:()=>{started++;}};
 try{
  vm.runInNewContext(source.slice(begin,end),ctx);await ctx.window.SubtitleTranslationRepair.offer('output.srt',container,{isCurrent:()=>current,allowMixed:true});
  assert.equal(requests.length,1);assert.equal(requests[0].allowMixed,true);assert.equal(queued.length,0);assert.match(container.textContent,/çevrilsin mi/);
  await container.querySelector('button').onclick();assert.equal(started,1);assert.equal(queued.length,1);
  assert.equal(requests[1].expectedHash,'exact');assert.equal(requests[1].allowMixed,true);const opts=queued[0][2].optionsOverride;
  assert.equal(opts.translateRetryOnly,true);assert.equal(opts.translateExisting,'repair.srt');assert.equal(opts.translateTo,'tr');assert.equal(opts.mergeContinuation,false);
  assert.equal(opts.repairInputProof.source,'a'.repeat(64));assert.equal(opts.repairInputProof.translation,'b'.repeat(64));assert.equal(opts.formats,'srt');assert.equal(opts.dualSubtitle,false);assert.equal(opts.subtitlePlayback.mediaPath,'C:/movie.mp4');assert.equal(opts.subtitlePlayback.range.start,2);assert.equal(opts.translateCueRange,'','clip provenance must not limit which missing cues are repaired');
  const old=container.querySelector('button');
  await ctx.window.SubtitleTranslationRepair.offer('new-output.srt',container,{isCurrent:()=>current});
  assert.equal(container.children.length,1);assert.notEqual(container.querySelector('button'),old);
  await old.onclick();assert.equal(queued.length,1);
  current=false;
  const opening=ctx.window.SubtitleTranslationRepair.offer('other.srt',container,{isCurrent:()=>current});
  current=true;await opening;
  assert.equal(container.children.length,1,'the result modal may become visible while inspection is pending');
  current=false;await ctx.window.SubtitleTranslationRepair.offer('stale.srt',container,{isCurrent:()=>current});assert.equal(container.children.length,0);
 }finally{dom.window.close();}
});
test('queued repair only loads its exact result on the reviewed source and keeps the verified range',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
 const begin=source.indexOf('window.SubtitleTranslationRepair='),end=source.indexOf('\nfunction showResultModal',begin);
 const contract=require('../src/subtitle-output-contract');
 const dom=new JSDOM('');
 const registered=[],loads=[];
 const owner={mode:'browser',visible:true,hasMedia:true,tabId:'A',mediaKey:'episode',generation:1,mediaToken:'audio-A',subtitleTrack:{path:'partial.srt'},subtitleRange:{start:2,end:10}};
 const player={generation:1,subPath:'source.srt',subRole:'source',sub2Path:'partial.srt',sub2Role:'translation',sub2Raw:'reviewed',cues2Raw:[{start:2,end:10,text:'reviewed'}]};
 const tab={};
 let release;
 const context={window:{BrowserDubAudioUI:{context:()=>owner}},player,browserQuickEditor:null,
  state:{queue:[]},interfaceChoice:(_tr,en)=>en,subtitleOutputContract:contract,
  parseSubtitles:()=>[{start:2,end:10}],
  browserTabState:()=>tab,currentBrowserWhisperAudio:()=>({mediaToken:owner.mediaToken}),
  registerCompletedBrowserOutputs:(...args)=>registered.push(args),setSubtitleMode(){},
  loadSubtitle:async(path,secondary,opts)=>{
   loads.push({path,secondary});
   await new Promise(resolve=>{release=resolve;});
   if(!opts.isCancelled()){opts.beforeCommit();player.sub2Path=path;return {ok:true,loaded:true};}
  }};
 try{
  vm.runInNewContext(source.slice(begin,end),context);
  const repair=context.window.SubtitleTranslationRepair;
  const resultPath='C:/result.srt';
  const item={status:'done',opts:{translateTo:'tr',translateRetryOnly:true},files:[resultPath],repairOwner:repair.captureOwner('partial.srt')};
  context.state.queue.push(item);
  repair.recordResult(item,{files:item.files});
  assert.equal(item.repairOutput,null,'legacy file lists cannot prove an on-screen result');
  repair.recordResult(item,{outputs:[{path:resultPath,role:'translation',language:'tr',total:3,completed:2,failed:1,subtitleHash:'a'.repeat(64)}]});
  assert.equal(item.repairOutput.status,'partial');
  context.browserQuickEditor={};
  assert.match(await repair.loadResult(item),/Close the open subtitle editor/);
  context.browserQuickEditor=null;
  player.cues2Raw[0].text='manual edit';
  assert.match(await repair.loadResult(item),/media or selected subtitle changed/);
  assert.equal(loads.length,0,'a closed in-memory edit still belongs to the user');
  player.cues2Raw[0].text='reviewed';
  const stale=repair.loadResult(item);
  assert.equal(item.repairLoading,true);
  player.generation++;release();
  assert.match(await stale,/media or selected subtitle changed/);
  assert.equal(player.sub2Path,'partial.srt');
  assert.equal(registered.length,0);
  const ready=repair.loadResult(item);release();
  assert.match(await ready,/Partial SRT loaded/);
  assert.equal(player.sub2Path,resultPath);
  assert.equal(player.subPath,'source.srt');
  assert.equal(player.translationRetryAvailable,1);
  assert.equal(player.browserTranslationFailed,1);
  assert.equal(tab.browserTranslationFailed,1);
  assert.deepEqual(JSON.parse(JSON.stringify(registered.at(-1)[1].clipRange)),{start:2,end:10});
  assert.equal(loads.length,2);
 }finally{dom.window.close();}
});
test('Meaning and coverage flags prevent a layout-only clean verdict without inventing acoustic quality',()=>{
 const r=summary.summarize({translation_blocks:10,translation_failed:2,translation_number_mismatch_indices:[0,0,-1,'2'],translation_negation_mismatch_indices:[4]},[6]);
 assert(r.needsReview);assert.equal(r.ready,8);assert.equal(r.failed,2);assert.deepEqual(r.rows,[0,4,6]);assert.equal(r.layout,0);assert.equal(r.groups.length,3);
 assert.equal(summary.summarize({translation_blocks:2}).needsReview,false);assert.equal(summary.summarize({translation_issues:1}).needsReview,true);
 assert.equal(summary.summarize({translation_blocks:2,translation_failed:999}).failed,2);
});

test('missing-line review follows raw translation times through merged rows and rejects edits or stale media',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),begin=source.indexOf('window.SubtitleTranslationRepair='),end=source.indexOf('\nfunction showResultModal',begin);
 const raw=[{start:0,end:3,text:'ready'},{start:3,end:5,text:'missing one'},{start:5,end:7,text:'missing two'}];
 const player={generation:1,subPath:'translation.srt',subRole:'translation',subRaw:'loaded',cuesRaw:raw,cues:[{start:0,end:7,text:'merged'}],subtitleRecovery:{completed:[true,false,false]},savedOnly:true,qualityOnly:true};
 const owner={mode:'player',visible:true,hasMedia:true,mediaKey:'movie',generation:1,source:'movie.mp4'},video={currentTime:0,paused:true},search={value:'hidden search'};
 const c={player,browserQuickEditor:null,window:{BrowserDubAudioUI:{context:()=>owner}},interfaceChoice:(_tr,en)=>en,$:id=>id==='playerVideo'?video:id==='cueSearch'?search:null,subtitleVideoTime:start=>start-.7,renderCueList(){},renderCue(){player.activeIdx=0;},highlightCueRow(){}};
 vm.runInNewContext(source.slice(begin,end),c);const repair=c.window.SubtitleTranslationRepair;player.subtitleRecoveryProof=repair.channelProof(false);
 const review=repair.missingReview();assert(review.review);assert.match(review.detail,/2 lines/);review.actions[0].run();assert(Math.abs(video.currentTime-2.31)<.0001);assert.equal(video.paused,true);assert.equal(search.value,'');assert.equal(player.savedOnly,false);
 review.actions[0].run();assert(Math.abs(video.currentTime-4.31)<.0001);
 raw[1].text='edited';assert.equal(repair.missingReview(),null);review.actions[0].run();assert(Math.abs(video.currentTime-4.31)<.0001);raw[1].text='missing one';
 owner.generation=2;review.actions[0].run();assert(Math.abs(video.currentTime-4.31)<.0001);
});

test('local subtitle time conversion uses the selected channel offset in both directions',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),begin=source.indexOf('function subtitleSourceTime('),end=source.indexOf('function browserTransformForRole(',begin);
 const c={player:{workspaceMode:'player',offset:.7,offset2:-.4}};vm.runInNewContext(source.slice(begin,end),c);
 assert.equal(c.subtitleVideoTime(3,false),3.7);assert.equal(c.subtitleVideoTime(3,true),2.6);
 assert.equal(c.subtitleSourceTime(3.7,false),3);assert.equal(c.subtitleSourceTime(2.6,true),3);
});
test('Result modal shows numbered meaning failures and partial translation in both languages',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=source.indexOf('  const qr = state.lastQualityReport;',source.indexOf('function showResultModal(')),end=source.indexOf('  const filesEl =',start);assert(start>0&&end>start);
 for(const locale of ['en','tr']){const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8')),el=id=>dom.window.document.getElementById(id),ctx={state:{lastQualityReport:{blocks:10,translation_blocks:10,translation_failed:2,translation_issues:2,translation_number_mismatch_indices:[0],translation_negation_mismatch_indices:[4]},speechCoverageIndices:[6]},window:{TranslationReviewSummary:summary},document:dom.window.document,$:el,interfaceChoice:(tr,en)=>locale==='tr'?tr:en};
 try{vm.runInNewContext(source.slice(start,end),ctx);assert(el('qualityVerdict').classList.contains('needs-review'));assert(!el('modalTranslationReview').classList.contains('hidden'));assert.match(el('modalTranslationReview').textContent,/8\/10/);assert.match(el('modalTranslationReview').textContent,locale==='tr'?/Olumlu\/olumsuz/:/Negation/);assert.match(el('modalTranslationReview').textContent,/1/);assert.match(el('modalTranslationReview').textContent,/5/);assert.match(el('modalTranslationReview').textContent,/7/);}finally{dom.window.close();}}
});

test('app confirmation is hosted in the native modal top layer and restored before its owner closes',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),dom=new JSDOM('<body><div class="app"><div id="appDialog" class="hidden"><button id="confirm">Confirm</button></div><main id="content"></main></div><dialog id="addons" open></dialog></body>'),doc=dom.window.document,modal=doc.getElementById('appDialog'),home=modal.parentElement,host=doc.getElementById('addons');
 let cancelled=false;const ctx={window:dom.window,document:doc,HTMLElement:dom.window.HTMLElement,requestAnimationFrame:fn=>fn(),syncBrowserOcclusion(){},modalFocusable:()=>[doc.getElementById('confirm')],$:id=>doc.getElementById(id),resolveAppDialog:()=>{cancelled=true;ctx.closeManagedModal(modal);}};
 const state=source.slice(source.indexOf('let _activeModal ='),source.indexOf('function modalFocusable(')),inert=source.slice(source.indexOf('function setModalBackgroundInert('),source.indexOf('function syncBrowserOcclusion(')),functions=source.slice(source.indexOf('function openManagedModal('),source.indexOf("document.addEventListener('keydown'",source.indexOf('function closeManagedModal(')));
 try{vm.runInNewContext(state+inert+functions,ctx);host.addEventListener('close',()=>host.remove());ctx.openManagedModal(modal,doc.getElementById('confirm'));assert.equal(modal.parentElement,host,'plain app confirmation must enter the native top layer');assert.notEqual(host.inert,true);assert.equal(doc.activeElement.id,'confirm');host.dispatchEvent(new dom.window.Event('close'));assert(cancelled);assert.equal(modal.parentElement,home);assert.equal(doc.getElementById('content').inert,false);assert(modal.classList.contains('hidden'));}finally{dom.window.close();}
});
