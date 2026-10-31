'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const page=require('../src/browser-page-translate');
const layout=require('../src/subtitle-sentence-layout');
const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
const start=main.indexOf('  const sentences = units.map((unit, unitIndex) => {');
const end=main.indexOf('  const scheduler = new BrowserTranslationScheduler({',start);
const sentenceProducer=main.slice(start,end);
const source=('Visitors can collect the daily schedule at the information desk before entering the exhibition. Please keep the entrance ticket available while moving between the main gallery and the garden. ').repeat(13)+'{{FINAL_RECEIPT}} must be retained after the visit.';
function makeDom(t,html='<article><p id="subject"></p></article>') {
 const dom=new JSDOM('<!doctype html>'+html,{url:'https://fixture.invalid/article',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window;
 w.Element.prototype.getClientRects=function(){return [{top:30,bottom:80,left:10,right:800,width:790,height:50}]};
 w.Element.prototype.getBoundingClientRect=function(){return {top:30,bottom:80,left:10,right:800,width:790,height:50}};
 w.scrollTo=()=>{};
 return {w,subject:w.document.getElementById('subject')};
}
for(const view of ['translation','both'])test('long paragraph tail reaches provider and is reassembled before '+view+' apply',t=>{
 const {w,subject}=makeDom(t);subject.textContent=source;
 const scan=w.eval(page.pageBlockScanScript({scope:'article',observe:false,visibleOnly:false}));
 assert.equal(scan.blocks.length,1);assert.equal(scan.overflow,false);assert.equal(scan.blocks[0].text,source);
 const normalized=page.normalizePageBlocks(scan.blocks),units=page.buildPageTranslationUnits(normalized,normalized);
 const sentences=vm.runInNewContext(sentenceProducer+'\nsentences;',{units,context:{},createHash:crypto.createHash,pageBlockCacheKey:page.pageBlockCacheKey});
 assert.equal(sentences.length,1);
 const request=JSON.parse(page.pageTranslationRequest(sentences[0]).payload);
 assert(request.targets.length>1);assert(request.targets.every(row=>row.text.length<=page.MAX_PAGE_BLOCK_TEXT));
 assert.equal(request.targets.map(row=>row.text).join(' '),source);
 assert(request.targets.at(-1).text.includes('{{FINAL_RECEIPT}}'));
 const translations=request.targets.map(row=>({id:row.id,translation:row.text.includes('{{FINAL_RECEIPT}}')?'Son makbuz {{FINAL_RECEIPT}} ziyaret sonrasında saklanmalıdır.':'Ziyaretçiler ana salona girmeden önce danışmadan günlük programı alabilir.'}));
 const decoded=page.decodePageTranslation({translations},sentences[0]);
 assert.equal(decoded.failedIds.length,0);assert.equal(decoded.parts.length,1);assert(decoded.parts[0].includes('{{FINAL_RECEIPT}}'));
 const accepted=layout.decodeSentenceTranslation(decoded,1,true);assert.deepEqual(layout.translationBlockingIssues(sentences[0].text,accepted.text,'tr'),[]);
 const applied=w.eval(page.pageApplyScript({mode:view==='both'?'bilingual':'replace',view,targetLanguage:'tr',translations:[{id:normalized[0].id,translation:decoded.parts[0]}]}));
 assert.equal(applied.applied,1);assert.equal(applied.partial,false);assert(subject.textContent.includes('{{FINAL_RECEIPT}}')||w.document.body.textContent.includes('{{FINAL_RECEIPT}}'));
 w.eval(page.pageRestoreScript());assert.equal(subject.textContent,source);
 // A partial chunk response is not accepted as a complete paragraph.
 assert.throws(()=>page.decodePageTranslation({translations:translations.slice(0,-1)},sentences[0]),/sayısıyla/);
});
test('paragraph beyond bounded request capacity remains visible and explicitly incomplete',t=>{
 const {w,subject}=makeDom(t,'<article><p id="subject"></p><p>Short text remains translatable.</p></article>');
 subject.textContent='a'.repeat(page.MAX_PAGE_SOURCE_BLOCK_TEXT+1);
 const scan=w.eval(page.pageBlockScanScript({scope:'article',observe:false,visibleOnly:false}));
 assert.equal(scan.blocks.length,1);assert.equal(scan.oversizedBlocks,1);assert.equal(scan.overflow,true);assert.equal(scan.stats.pending,1);assert.match(scan.warning,/özgün metinleri/);
 assert.equal(page.normalizePageBlocks([{id:'unsafe',text:subject.textContent}]).length,0);
 assert.throws(()=>page.pageTranslationRequest({pieces:[{cueId:'unsafe',text:subject.textContent}]}),/sınırını/);
 const a=main.indexOf('function pageTranslationCompletion('),b=main.indexOf('\nfunction browserPageTranslatedCount',a);
 const completion=vm.runInNewContext(main.slice(a,b)+'\npageTranslationCompletion',{browserPageExcludedIds:()=>new Set()});
 const state=completion({blocks:new Map([['short',{}]]),translations:new Map([['short','Kısa metin.']]),failures:new Map(),unsupportedBlocks:scan.oversizedBlocks});
 assert.equal(state.total,2);assert.equal(state.pending,1);assert.equal(state.translated,1);
 w.eval(page.pageApplyScript({view:'translation',targetLanguage:'tr',translations:[{id:scan.blocks[0].id,translation:'Kısa metin çevrildi.'}]}));
 assert.equal(subject.textContent,'a'.repeat(page.MAX_PAGE_SOURCE_BLOCK_TEXT+1));
});
test('chunk boundaries preserve surrogate pairs and avoid collisions with real block IDs',()=>{
 const id='paragraph',collision='page-part:'+JSON.stringify([id,0]);
 const text='A'.repeat(1999)+'😀'+'B'.repeat(80);
 const sentence={pieces:[{cueId:id,text},{cueId:collision,text:'Short.'}]};
 const request=JSON.parse(page.pageTranslationRequest(sentence).payload);
 assert.equal(new Set(request.targets.map(row=>row.id)).size,request.targets.length);
 assert.equal(request.targets.slice(0,-1).map(row=>row.text).join(''),text);
 assert(request.targets.every(row=>!/[\uD800-\uDBFF]$/u.test(row.text)&&!(/^[\uDC00-\uDFFF]/u.test(row.text))));
});

test('provider chunks keep protected URLs and placeholders intact',()=>{
 for(const token of ['https://example.invalid/'+ 'x'.repeat(150),'{{KEEP THIS WHOLE PLACEHOLDER}}','<span data-value="keep this attribute">','${KEEP THIS VALUE}','%123$s']) {
  const sentence={pieces:[{cueId:'protected',text:'A'.repeat(1990)+token+' end'}]};
  const request=JSON.parse(page.pageTranslationRequest(sentence).payload);
  assert(request.targets.every(row=>row.text.length<=2000));
  assert(request.targets.some(row=>row.text.includes(token)),token);
  const decoded=page.decodePageTranslation({translations:request.targets.map(row=>({id:row.id,translation:row.text}))},sentence);
  assert.deepEqual(decoded.failedIds,[]);
 }
 assert.throws(()=>page.pageTranslationRequest({pieces:[{cueId:'long-url',text:'https://example.invalid/'+'x'.repeat(2200)}]}),/belirteci.*sınırını/);
});

function mainFunction(name,isAsync=false) {
 const start=main.indexOf((isAsync?'async ':'')+'function '+name+'(');
 assert(start>=0,name);return main.slice(start,main.indexOf('\n}',start)+2);
}

test('actual endpoint fetch sends expanded targets and rejects partial provider results',async()=>{
 const sentence={kind:'page',text:source,pieces:[{cueId:'paragraph',text:source}]};
 let request,partial=false;
 const ctx={require:require('node:module').createRequire(require.resolve('../src/main.js')),AbortController,setTimeout,clearTimeout,Buffer,
  pageTranslationRequest:page.pageTranslationRequest,decodePageTranslation:page.decodePageTranslation,
  safeTranslationEndpoint:()=> 'https://fixture.invalid/v1/chat/completions',
  readJsonResponseLimited:async response=>response.json(),
  fetch:async(url,options)=>{
   request=JSON.parse(JSON.parse(options.body).messages.at(-1).content);
   const rows=request.targets.map(row=>({id:row.id,translation:row.text.includes('{{FINAL_RECEIPT}}')?'Son makbuz {{FINAL_RECEIPT}} saklanmalıdır.':'Ziyaretçiler günlük programı danışmadan alabilir.'}));
   if(partial)rows.pop();
   return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translations:rows})}}]})};
  }};
 vm.createContext(ctx);vm.runInContext(mainFunction('requestBrowserSentenceTranslationAtEndpoint',true),ctx);
 const config={apiKey:'fixture',glossary:[],targetLanguage:'tr',model:'fixture-model',terminologyEnabled:false};
 const result=await ctx.requestBrowserSentenceTranslationAtEndpoint(sentence,config,undefined,'https://fixture.invalid/v1');
 assert(request.targets.length>1);assert(request.targets.every(row=>row.text.length<=2000));
 assert.equal(result.parts.length,1);assert.equal(result.failedIds.length,0);assert(result.parts[0].includes('{{FINAL_RECEIPT}}'));
 partial=true;await assert.rejects(ctx.requestBrowserSentenceTranslationAtEndpoint(sentence,config,undefined,'https://fixture.invalid/v1'),/sayısıyla/);
});

test('dynamic supported paragraph growing oversized retires its old ID and can return',async t=>{
 const {w,subject}=makeDom(t);subject.textContent='Original source paragraph.';
 const messages=[];let onUpdate;
 w.__whisperTrustedBridgeSend=(type,payload)=>{messages.push({type,payload});if(Array.isArray(payload?.blocks))onUpdate?.(payload);};
 const nextUpdate=mutate=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{onUpdate=null;reject(new Error('Mutation observer did not publish the next page scan.'));},3000);
  onUpdate=payload=>{clearTimeout(timer);onUpdate=null;resolve(payload);};
  mutate();
 });
 const scan=w.eval(page.pageBlockScanScript({scope:'article',bridgeToken:'fixture',visibleOnly:false}));
 const oldId=scan.blocks[0].id;
 w.eval(page.pageApplyScript({view:'both',mode:'bilingual',targetLanguage:'tr',translations:[{id:oldId,translation:'Eski çeviri görünmemeli.'}]}));
 assert(w.document.body.textContent.includes('Eski çeviri görünmemeli.'));
 const update=await nextUpdate(()=>{subject.firstChild.nodeValue='x'.repeat(6001);});assert(update);
 assert.equal(update.oversizedBlocks,1);assert.equal(update.blocks.length,0);
 assert(update.replacedIds.includes(oldId));assert.match(update.warning,/özgün metinleri/);
 assert.equal(subject.textContent,'x'.repeat(6001));
 assert(!w.document.body.textContent.includes('Eski çeviri görünmemeli.'));
 const staleApply=w.eval(page.pageApplyScript({view:'translation',translations:[{id:oldId,translation:'Stale response.'}]}));
 assert.equal(staleApply.applied,0);assert.equal(subject.textContent,'x'.repeat(6001));
 const restored=await nextUpdate(()=>{subject.firstChild.nodeValue='Original source paragraph.';});
 assert.equal(restored.oversizedBlocks,0);assert.equal(restored.blocks.length,1);assert.equal(restored.blocks[0].id,oldId);
});

test('dynamic oversized-only update warns and archives remaining translations as incomplete',()=>{
 const events=[],saved=[];
 const session={generation:1,unsupportedBlocks:0,blocks:new Map([['old',{id:'old',text:'Old text.'}],['kept',{id:'kept',text:'Kept text.'}]]),translations:new Map([['old','Eski metin.'],['kept','Kalan metin.']]),failures:new Map(),config:{targetLanguage:'tr'},scope:'article'};
 const tab={generation:1,bridgeToken:'fixture',pageTranslateSession:session};
 const ctx={normalizePageBlocks:page.normalizePageBlocks,browserPageExcludedIds:()=>new Set(),browserPageUrl:()=> 'https://fixture.invalid/article',
  browserTranslationArchive:()=>({savePage:record=>saved.push(record)}),sendBrowserEvent:(tab,event)=>events.push(event),
  pageTranslationSectionProgress:()=>[],browserPageTerminologySuggestions:()=>[],MAX_AUTO_CONTINUE_SESSION_BLOCKS:20000,MAX_PENDING_DYNAMIC_BLOCKS:3000};
 vm.createContext(ctx);vm.runInContext(['pruneReplacedBrowserPageBlocks','pageTranslationCompletion','browserPageTranslatedCount','browserPageFailedCount','persistBrowserPageTranslationArchive','acceptDynamicBrowserPageBlocks'].map(name=>mainFunction(name)).join('\n'),ctx);
 ctx.acceptDynamicBrowserPageBlocks(tab,{bridgeToken:'fixture',blocks:[],replacedIds:['old'],oversizedBlocks:1,warning:'Long paragraph skipped.'});
 assert.equal(session.blocks.has('old'),false);assert.equal(session.translations.has('old'),false);
 assert.equal(tab.pageTranslateCompletion.pending,1);assert.equal(tab.pageTranslateCompletion.total,2);
 assert(events.some(event=>event.state==='warning'&&event.message==='Long paragraph skipped.'));
 assert.equal(saved.length,1);assert.equal(saved[0].complete,false);assert.equal(saved[0].translations.size,1);
 ctx.acceptDynamicBrowserPageBlocks(tab,{bridgeToken:'fixture',blocks:[],oversizedBlocks:0});
 assert.equal(tab.pageTranslateCompletion.pending,0);assert.equal(saved.at(-1).complete,true);
});
