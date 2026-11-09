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
 const ctx={window:{api:{repairSubtitleTranslation:async request=>{requests.push(request);return request.prepare?{ok:true,sourcePath:'source.srt',translationPath:'repair.srt',targetLanguage:'tr',forSpeech:false}:{ok:true,canRepair:true,failed:2,fingerprint:'exact'};}}},document:dom.window.document,interfaceChoice:(tr,en)=>tr,addToQueue:(...args)=>{queued.push(args);return true;},state:{running:false,queueRunning:false},startQueue:()=>{started++;}};
 try{
  vm.runInNewContext(source.slice(begin,end),ctx);await ctx.window.SubtitleTranslationRepair.offer('output.srt',container,{isCurrent:()=>current});
  assert.equal(requests.length,1);assert.equal(queued.length,0);assert.match(container.textContent,/çevrilsin mi/);
  await container.querySelector('button').onclick();assert.equal(started,1);assert.equal(queued.length,1);
  assert.equal(requests[1].expectedHash,'exact');const opts=queued[0][2].optionsOverride;
  assert.equal(opts.translateRetryOnly,true);assert.equal(opts.translateExisting,'repair.srt');assert.equal(opts.translateTo,'tr');assert.equal(opts.mergeContinuation,false);
  current=false;await ctx.window.SubtitleTranslationRepair.offer('other.srt',container,{isCurrent:()=>current});assert.equal(container.children.length,1);
 }finally{dom.window.close();}
});
test('Meaning and coverage flags prevent a layout-only clean verdict without inventing acoustic quality',()=>{
 const r=summary.summarize({translation_blocks:10,translation_failed:2,translation_number_mismatch_indices:[0,0,-1,'2'],translation_negation_mismatch_indices:[4]},[6]);
 assert(r.needsReview);assert.equal(r.ready,8);assert.equal(r.failed,2);assert.deepEqual(r.rows,[0,4,6]);assert.equal(r.layout,0);assert.equal(r.groups.length,3);
 assert.equal(summary.summarize({translation_blocks:2}).needsReview,false);assert.equal(summary.summarize({translation_issues:1}).needsReview,true);
 assert.equal(summary.summarize({translation_blocks:2,translation_failed:999}).failed,2);
});
test('Result modal shows numbered meaning failures and partial translation in both languages',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=source.indexOf('  const qr = state.lastQualityReport;',source.indexOf('function showResultModal(')),end=source.indexOf('  const filesEl =',start);assert(start>0&&end>start);
 for(const locale of ['en','tr']){const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8')),el=id=>dom.window.document.getElementById(id),ctx={state:{lastQualityReport:{blocks:10,translation_blocks:10,translation_failed:2,translation_issues:2,translation_number_mismatch_indices:[0],translation_negation_mismatch_indices:[4]},speechCoverageIndices:[6]},window:{TranslationReviewSummary:summary},document:dom.window.document,$:el,interfaceChoice:(tr,en)=>locale==='tr'?tr:en};
 try{vm.runInNewContext(source.slice(start,end),ctx);assert(el('qualityVerdict').classList.contains('needs-review'));assert(!el('modalTranslationReview').classList.contains('hidden'));assert.match(el('modalTranslationReview').textContent,/8\/10/);assert.match(el('modalTranslationReview').textContent,locale==='tr'?/Olumlu\/olumsuz/:/Negation/);assert.match(el('modalTranslationReview').textContent,/1/);assert.match(el('modalTranslationReview').textContent,/5/);assert.match(el('modalTranslationReview').textContent,/7/);}finally{dom.window.close();}}
});
