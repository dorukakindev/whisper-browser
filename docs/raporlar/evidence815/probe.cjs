'use strict';
// Report-only probes. Product sources are loaded without modification.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),{JSDOM}=require(path.join(root,'node_modules/jsdom'));
const observations=[];
function readerFixture(saved={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{url:'https://audit.invalid/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=id=>w.document.getElementById(id);
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 if(Object.keys(saved).length)w.localStorage.setItem('pdf-reading-preferences-v1',JSON.stringify(saved));
 const reader={pdfHash:'controlled-pdf',currentPage:1,pdf:{numPages:3},pages:new Map(),state:{pages:{}}},calls=[],opened=[];
 Object.assign(w,{player:{pdfReader:reader},UiLocale:{get:()=> 'en'},api:{mediaWorkflows:async args=>{calls.push(args);return {ok:true,project:{id:'controlled-project'}};}},MediaWorkflowsUI:{openProject:async(id,options)=>opened.push({id,options})},matchMedia:()=>({matches:false}),extractPdfReaderPage:async page=>[{id:'p'+page,source:'Controlled source page '+page+'.'}]});
 w.eval(fs.readFileSync(path.join(root,'src/renderer/pdf-reader-experience.js'),'utf8'));
 return {w,$,reader,calls,opened,close:()=>w.close()};
}
async function main(){
 {
  const h=readerFixture({font:28,width:1000,spacing:2.1});try{
   const before=h.$('pdfReader').style.getPropertyValue('--pdf-reader-font');
   h.w.PdfReaderExperience.opened();
   const after=h.$('pdfReader').style.getPropertyValue('--pdf-reader-font'),selected=h.$('pdfReadingfont').value;
   assert.equal(before,'28px');assert.equal(after,'');assert.equal(selected,'28');
   observations.push({id:'R815-B01',savedFont:28,beforeOpen:before,afterOpen:after,selector:selected,cssFallbackPx:21});
  }finally{h.close();}
 }
 {
  const h=readerFixture();try{
   h.w.PdfReaderExperience.opened();h.$('pdfVoiceFrom').value='1';h.$('pdfVoiceTo').value='1';h.$('pdfVoiceText').value='source';
   let release;h.w.api.mediaWorkflows=async args=>{h.calls.push(args);return new Promise(done=>release=done);};
   const pending=h.$('pdfVoicePrepare').onclick();await new Promise(setImmediate);assert.equal(typeof release,'function');
   const controlsEnabled=!h.$('pdfVoiceFrom').disabled&&!h.$('pdfVoiceText').disabled;
   h.$('pdfVoiceFrom').value='2';h.$('pdfVoiceTo').value='2';h.$('pdfVoiceText').value='translation';
   h.$('pdfVoiceFrom').dispatchEvent(new h.w.Event('input'));h.$('pdfVoiceText').dispatchEvent(new h.w.Event('input'));
   release({ok:true,project:{id:'old-page-one'}});await pending;
   assert.equal(h.opened[0]?.id,'old-page-one');assert.equal(h.$('pdfVoiceListen').disabled,false);
   observations.push({id:'R815-B03',controlsEnabled,visibleRange:[2,2],visibleMode:'translation',importedPages:h.calls[0].pages,opened:h.opened,status:h.$('pdfVoiceStatus').textContent});
  }finally{h.close();}
 }
 {
  const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
  const code=source.slice(source.indexOf('async function translateVisiblePdfPages('),source.indexOf('async function openPdfReader('));
  assert(code.includes('const PDF_TRANSLATE_ALL_CONFIRM_PAGES'));
  const reader={pdf:{numPages:6},pdfHash:'controlled-pdf',currentPage:1,pages:new Map(),state:{pages:{}}};
  const elements=new Map(['pdfTargetLanguage','pdfTranslateVisible','pdfTranslateAll','pdfTranslateCancel'].map(id=>[id,{value:id==='pdfTargetLanguage'?'tr':'',disabled:false}]));
  const calls=[],states={},rendered=[],statuses=[];let release;
  const ctx={player:{pdfReader:reader},$:id=>elements.get(id),interfaceChoice:(tr,en)=>en,pdfReaderSetStatus:text=>statuses.push(text),renderPdfReaderPage:async()=>{},extractPdfReaderPage:async p=>reader.pages.set(p,{blocks:[{source:'Page '+p}],items:[]}),renderPdfTranslation:(p,rows)=>rendered.push({page:p,target:rows[0].translation}),updatePdfReaderProgress:()=>{}};
  ctx.window={api:{translatePdfPages:async args=>{
   calls.push({targetLanguage:args.targetLanguage,pages:args.pages.map(p=>p.pageNumber)});
   if(calls.length===1)await new Promise(done=>release=done);
   states[args.targetLanguage]||={};for(const p of args.pages)states[args.targetLanguage][p.pageNumber]=[{source:'Page '+p.pageNumber,translation:args.targetLanguage,status:'translated'}];
   return {ok:true,state:{targetLanguage:args.targetLanguage,pages:JSON.parse(JSON.stringify(states[args.targetLanguage]))}};
  }}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const pending=ctx.translateVisiblePdfPages(true);await new Promise(setImmediate);assert.equal(typeof release,'function');
  const targetEnabled=!elements.get('pdfTargetLanguage').disabled;elements.get('pdfTargetLanguage').value='de';release();await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{targetLanguage:'tr',pages:[1,2,3]},{targetLanguage:'de',pages:[4,5,6]}]);assert.equal(statuses.at(-1),'Çeviri hazır');
  observations.push({id:'R815-B02',targetEnabled,calls,rendered,finalStateLanguage:reader.state.targetLanguage,finalStatePages:Object.keys(reader.state.pages),status:statuses.at(-1),completed:reader.translationCompleted});
 }
 const head=process.argv[2];assert.match(head||'',/^[a-f0-9]{40}$/);
 const sources=['src/renderer/pdf-reader-experience.js','src/renderer/renderer.js','src/renderer/pdf-reader.css','src/main.js'];
 const sourceSha256=Object.fromEntries(sources.map(name=>[name,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
 const result={head,sourceSha256,node:process.version,platform:process.platform,method:'Full PDF experience module in JSDOM; exact unmodified PDF translation functions in VM; controlled async IPC boundaries. No GPU, provider, real PDF render or personal profile.',observations};
 fs.writeFileSync(path.join(__dirname,'observations.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
