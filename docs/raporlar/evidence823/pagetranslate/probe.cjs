'use strict';
const fs=require('fs'); const path=require('path'); const assert=require('assert/strict'); const vm=require('vm'); const crypto=require('crypto'); const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../../../..');
const out=path.resolve(process.env.AUDIT823_OUT||path.join(root,'.uiprev/audit823-pagetranslate-'+Date.now()));fs.mkdirSync(out,{recursive:true});
const page=require(path.join(root,'src/browser-page-translate'));
const layout=require(path.join(root,'src/subtitle-sentence-layout'));
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const start=main.indexOf('  const sentences = units.map((unit, unitIndex) => {');
const end=main.indexOf('  const scheduler = new BrowserTranslationScheduler({',start);
assert(start>0&&end>start);
const sentenceProducer=main.slice(start,end);
function makeDom(source){
 const dom=new JSDOM('<!doctype html><html><head></head><body><article><p id="subject"></p></article></body></html>',{url:'https://audit.invalid/article',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window; w.document.getElementById('subject').textContent=source;
 w.Element.prototype.getClientRects=function(){return [{top:30,bottom:80,left:10,right:800,width:790,height:50}]};
 w.Element.prototype.getBoundingClientRect=function(){return {top:30,bottom:80,left:10,right:800,width:790,height:50}};
 w.scrollTo=()=>{};
 return dom;
}
function runCase(label,source,view){
 const dom=makeDom(source), w=dom.window, subject=w.document.getElementById('subject');
 const initial=w.eval(page.pageBlockScanScript({scope:'article',observe:false,visibleOnly:false}));
 assert.equal(initial.blocks.length,1);
 const normalized=page.normalizePageBlocks(initial.blocks);
 const units=page.buildPageTranslationUnits(normalized,normalized);
 const sandbox={units,context:{},createHash:crypto.createHash,pageBlockCacheKey:page.pageBlockCacheKey};
 const sentences=vm.runInNewContext(sentenceProducer+'\nsentences;',sandbox);
 const request=page.pageTranslationRequest(sentences[0]); const payload=JSON.parse(request.payload);
 // Controlled provider response; no network or language-quality claim.
 const translation=source.length <= 2000 ? 'Ziyaretçiler bileti danışmadan alabilir. Son makbuz ziyaretten sonra saklanmalıdır.' : ('Ziyaretçiler ana salona girdikten sonra danışma masasından güncel programı alabilir. ').repeat(24).trim();
 const decoded=page.decodePageTranslation(JSON.stringify({translations:[{id:normalized[0].id,translation}]}),sentences[0]);
 assert.equal(decoded.failedIds.length,0);
 const schedulerDecoded=layout.decodeSentenceTranslation(decoded,sentences[0].pieces.length,true);
 const qualityIssues=layout.translationBlockingIssues(sentences[0].text,schedulerDecoded.text,'tr');
 const markupPreserved=schedulerDecoded.parts.every((part,i)=>layout.markupPreserved(sentences[0].pieces[i].text,part));
 assert.deepEqual(qualityIssues,[]); assert.equal(markupPreserved,true);
 const applied=w.eval(page.pageApplyScript({mode:view==='both'?'bilingual':'replace',view,targetLanguage:'tr',translations:[{id:normalized[0].id,translation:decoded.parts[0]}]}));
 const ref=w.__whisperPageTranslateState.refs.get(normalized[0].id);
 const after=subject.textContent;
 const afterScan=w.__whisperPageTranslateState.scan();
 const both=w.eval(page.pageViewScript('both'));
 const originalVisible=subject.firstChild.nodeValue;
 const restore=w.eval(page.pageRestoreScript());
 const restored=subject.textContent;
 const result={label,sourceCharacters:source.length,sourceContainsTail:source.includes('FINAL RECEIPT MUST BE RETAINED'),scanCharacters:initial.blocks[0].text.length,scanNodeLengths:Array.from(initial.blocks[0].nodes),scanOverflow:initial.overflow,scanWarning:initial.warning,scanPending:initial.stats.pending,requestCharacters:payload.targets[0].text.length,requestContainsTail:payload.targets[0].text.includes('FINAL RECEIPT MUST BE RETAINED'),decodedFailures:decoded.failedIds.length,qualityIssues,markupPreserved,applied:JSON.parse(JSON.stringify(applied)),refOriginalCharacters:ref.originals.join('').length,viewAfterCharacters:after.length,viewAfterContainsTail:after.includes('FINAL RECEIPT MUST BE RETAINED'),rescanBlocks:afterScan.blocks.length,rescanPending:afterScan.stats.pending,bothShowsFullOriginal:originalVisible===source,restoreReturned:restore,restoredExactly:restored===source};
 assert.equal(applied.applied,1); assert.equal(result.restoredExactly,true); assert.equal(result.bothShowsFullOriginal,true);
 if(source.length>2000){ assert.equal(result.scanCharacters,2000); assert.equal(result.requestContainsTail,false); assert.equal(result.scanOverflow,false); assert.equal(result.scanPending,0); assert.equal(result.rescanBlocks,0); if(view==='translation')assert.equal(result.viewAfterContainsTail,false); else assert.equal(result.viewAfterContainsTail,true); }
 else {assert.equal(result.requestCharacters,source.length);assert.equal(result.requestContainsTail,true);}
 dom.window.close(); return result;
}
const sentence='Visitors can collect the daily schedule at the information desk before entering the exhibition. Please keep the entrance ticket available while moving between the main gallery and the garden. ';
const longSource=(sentence.repeat(13)+'FINAL RECEIPT MUST BE RETAINED after the visit because it is required for the reimbursement request.');
const shortSource='Visitors can collect their ticket at the desk. FINAL RECEIPT MUST BE RETAINED after the visit.';
const cases=[runCase('long-replace',longSource,'translation'),runCase('long-bilingual-control',longSource,'both'),runCase('short-replace-control',shortSource,'translation')];
const result={head:process.env.AUDIT823_HEAD || 'not-supplied',node:process.version,jsdom:require('jsdom/package.json').version,sourceFiles:{page:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/browser-page-translate.js'))).digest('hex'),main:crypto.createHash('sha256').update(main).digest('hex')},mainSentenceProducer:{startLine:main.slice(0,start).split('\n').length,endLine:main.slice(0,end).split('\n').length},cases};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
