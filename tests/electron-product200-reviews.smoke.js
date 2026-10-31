'use strict';
// Native production main/preload/UI, isolated profile. Public reviews and analysis are synthetic fixtures; no model or network request.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','product200-reviews',Date.now()+'-'+process.pid);
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
global.fetch=async()=>{throw Error('Product200 review fixture smoke does not permit external fetch.');};
const fixtureTitle='Synthetic Letterboxd Review Fixture';
const firstText='Excellent acting and carefully composed visuals, with a slow middle section.';
const fixtureHtml='<meta property="og:title" content="Reviews of '+fixtureTitle+' (2026) • Letterboxd"><div data-tmdb-id="42"></div>'+[
 '<article><a class="name">Fixture reviewer Ada</a><div class="js-review-body">'+firstText+'</div><a href="/fixture-ada/film/product200-fixture/"><time datetime="2026-10-30T12:00:00Z">30 October</time></a><span class="rating rated-9">★★★★½</span></article>',
 '<article><a class="name">Fixture reviewer Bora</a><div class="js-review-body">'+('&quot;'.repeat(4000))+'</div></article>',
 '<article><div class="js-review-body">A later loaded opinion that cannot fit the bounded analysis sample.</div></article>',
 '<article class="contains-spoilers"><div class="js-review-body">SECRET FIXTURE ENDING MUST NEVER APPEAR IN PREVIEW</div></article>',
 '<article><div class="js-review-body">'+firstText+'</div></article>',
 '<article><div class="js-review-body">tiny</div></article>'
].join('');
const parsed=require('../src/letterboxd-reviews').parseLetterboxdReviews(fixtureHtml);
const tools=require('../src/media-tools-service'),register=tools.registerMediaTools;let fixtureReads=0;
tools.registerMediaTools=options=>register({...options,readOpenReviews:async()=>{fixtureReads++;return {...parsed,url:'https://letterboxd.com/film/product200-fixture/reviews/',origin:'synthetic-service-fixture'};}});
require('../src/main');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await pause(80);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,done)=>done({cancel:true}));
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'production window');
 assert.equal(path.resolve(app.getPath('userData')),path.resolve(process.env.WHISPER_RESOURCE_SOAK_USER_DATA));
 const run=async code=>{try{return await win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);}catch(error){throw Error(error.message+'\nRenderer check: '+code.slice(0,600));}},captures=[];
 win.setMinimumSize(400,500);win.setContentSize(1440,1000);win.showInactive();
 await until(()=>run('return !!window.MediaReviewDecision&&!!window.MediaToolsUI'),'review scripts');
 await run('await initialSettingsReady;return true');
 const saved=await run('return window.api.mediaCatalog({action:"save",item:'+JSON.stringify({title:fixtureTitle,year:2026,kind:'film',tmdbId:'movie:42',synopsis:'Controlled fixture data. No live Letterboxd or AI response.'})+'})');assert(saved.ok,saved.error);
 const id=JSON.stringify(saved.item.id);
 async function openPanel(locale,theme){
  await run('document.getElementById("mediaToolsDialog")?.close();return true');await until(()=>run('return !document.getElementById("mediaToolsDialog")'),'previous dialog removed');
  await run('window.UiLocale.set('+JSON.stringify(locale)+',false);applyUiTheme('+JSON.stringify(theme)+');window.MediaToolsUI.open("decision",'+JSON.stringify(saved.item)+');return true');
  await until(()=>run('return !!document.querySelector(".mrv-source")'),'review form');
 }
 async function capture(name,target){
  await run('const target=document.querySelector('+JSON.stringify(target)+');target.scrollIntoView({block:"start"});await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');await pause(160);
  const metrics=await run(`const d=document.getElementById('mediaToolsDialog'),target=document.querySelector(${JSON.stringify(target)}),r=d.getBoundingClientRect(),v=target.getBoundingClientRect();
   const overflow=[...target.querySelectorAll('article,p,strong,summary,a,button')].filter(n=>n.getClientRects().length&&n.getBoundingClientRect().width>0).filter(n=>{const a=n.getBoundingClientRect();return a.left<r.left-1||a.right>r.right+1;}).map(n=>n.tagName+':'+n.className);
   const audit=document.querySelector('.mrv-selection-audit'),list=document.querySelector('.mrv-sample-list');
   const buttons=[...document.querySelectorAll('.mrv-preview-actions button')].map(n=>n.getBoundingClientRect());
   return {viewport:[innerWidth,innerHeight],dialog:[r.x,r.y,r.width,r.height],horizontalOverflow:d.scrollWidth>d.clientWidth+1,overflow,targetVisible:v.top<r.bottom&&v.bottom>r.top,auditBeforeList:!audit||!list||audit.getBoundingClientRect().bottom<=list.getBoundingClientRect().top+1,actionGap:buttons.length===2?(buttons[1].top>=buttons[0].bottom?buttons[1].top-buttons[0].bottom:buttons[1].left-buttons[0].right):null};`);
  assert(!metrics.horizontalOverflow,JSON.stringify(metrics));assert.deepEqual(metrics.overflow,[]);assert(metrics.targetVisible,JSON.stringify(metrics));assert(metrics.dialog[3]<=metrics.viewport[1],JSON.stringify(metrics));assert(metrics.auditBeforeList,JSON.stringify(metrics));if(metrics.actionGap!==null)assert(metrics.actionGap>=9,JSON.stringify(metrics));
  const file=path.join(out,name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());captures.push({file,...metrics});
 }
 for(const mode of [{locale:'tr',theme:'dark',width:1440,height:1000},{locale:'en',theme:'light',width:760,height:900}]){
  win.setContentSize(mode.width,mode.height);await openPanel(mode.locale,mode.theme);
  if(!fixtureReads){await run('[...document.querySelectorAll(".mrv-source button")].find(b=>/Açık Browser sayfasındaki yorumları kullan|Use reviews from open Browser/.test(b.textContent)).click();return true');await until(()=>run('return document.querySelector(".mrv-job")?.dataset.state==="ready"'),'fixture source loaded');}
  assert.equal(await run('return document.querySelector(".mrv-provenance").dataset.state'),'matched');
  await run('document.querySelector("[data-review-action=preview]").click();return true');await until(()=>run('return !!document.querySelector(".mrv-sample")'),'real sample preview');
  const preview=await run(`const p=document.querySelector('.mrv-sample'),a=p.querySelector('.mrv-selection-audit');a.open=true;return {text:p.textContent,audit:a.textContent,rows:p.querySelectorAll('.mrv-sample-list article[data-included=true]').length,link:p.querySelector('.mrv-review-meta a')?.href,included:[...a.querySelectorAll('[data-included]')].map(n=>n.dataset.included),confirmed:p.querySelector('[name=review-title-confirmed]').checked};`);
  assert.equal(preview.rows,2);assert.deepEqual(preview.included,['true','true','false','false']);assert(preview.confirmed);assert.equal(preview.link,'https://letterboxd.com/fixture-ada/film/product200-fixture/');assert.match(preview.text,/2026-10-30 · 4.5\/5/);assert.doesNotMatch(preview.text,/SECRET FIXTURE ENDING/);
  assert.match(preview.audit,mode.locale==='tr'?/Metin kısaltılarak dahil/:/Included with shortened text/);assert.match(preview.audit,mode.locale==='tr'?/Dışarıda: örnek boyutu sınırı/:/Excluded: sample size limit/);assert.match(preview.audit,mode.locale==='tr'?/Dışarıda: spoiler seçimi kapalı/:/Excluded: spoilers disabled/);assert.match(preview.audit,mode.locale==='tr'?/tekrar metin/:/duplicate texts/);
  await capture(mode.locale+'-'+mode.width+'-'+mode.theme+'-inclusion','.mrv-selection-audit');
  await capture(mode.locale+'-'+mode.width+'-'+mode.theme+'-metadata','.mrv-review-meta');
  const selection=await run(`window.product200RawSample=document.querySelector('[name=review-text]').value;document.querySelector('[data-review-pick="2"]').click();return {ids:[...document.querySelectorAll('.mrv-review-choice[data-included=true]')].map(n=>n.dataset.reviewId),audit:document.querySelector('.mrv-selection-audit').textContent,spoilerDisabled:document.querySelector('[data-review-pick="4"]').disabled,raw:document.querySelector('[name=review-text]').value};`);
  assert.deepEqual(selection.ids,['1','3']);assert(selection.spoilerDisabled);assert.equal(selection.raw,JSON.stringify(parsed.reviews));assert.match(selection.audit,mode.locale==='tr'?/Senin seçiminle dışarıda/:/Excluded by you/);
  await capture(mode.locale+'-'+mode.width+'-'+mode.theme+'-selected','.mrv-selection-audit');
  assert.deepEqual(await run(`document.querySelector('[data-review-pick="2"]').click();return [...document.querySelectorAll('.mrv-review-choice[data-included=true]')].map(n=>n.dataset.reviewId);`),['1','2']);
  if(mode.locale==='en')await run('document.querySelector("[data-review-pick=\\"2\\"]").click();return true');
 }
 // Controlled completion goes through the real preview Send, quote verification, and Save controls.
 await run(`translationEndpointReady=()=>true;aiChatSend=async()=>{window.product200SentEvidence=JSON.parse(globalAssistantContext().excerpt);document.dispatchEvent(new CustomEvent('assistant-answer',{detail:{context:globalAssistantContext(),text:JSON.stringify({summary:'Synthetic fixture: acting is praised; this is one opinion.',fit:'Synthetic fixture: insufficient personal evidence.',points:[{id:'1',quote:'Excellent acting',reason:'Synthetic fixture: direct praise of the performance.',kind:'praise'}]})}}));};document.querySelector('.mrv-preview-actions .mh-primary').click();return true;`);
 await until(()=>run('return document.querySelector(".mrv-job")?.dataset.state==="result"'),'controlled analysis result');
 const sent=await run('return {ids:window.product200SentEvidence.reviews.map(n=>n.id),rawUnchanged:document.querySelector("[name=review-text]").value===window.product200RawSample}');assert.deepEqual(sent.ids,['1','3']);assert(sent.rawUnchanged);
 await run('[...document.querySelectorAll(".mrv-output button")].find(n=>n.textContent==="Verify quotes & save").click();return true');await until(()=>run('return !!document.querySelector(".mtx-history")'),'save through production UI');
 const record=await run('return window.api.mediaTools({action:"decision-get",itemId:'+id+'})');assert.equal(record.value.history[0].reviews[0].permalink,parsed.reviews[0].permalink);assert.equal(record.value.history[0].reviews[0].date,'2026-10-30');assert.equal(record.value.history[0].reviews[0].rating,4.5);
 assert.deepEqual(record.value.history[0].reviews.map(n=>n.id),['1','3']);assert(!record.value.history[0].reviews.some(n=>n.id==='2'||n.id==='4'));
 await openPanel('en','light');await until(()=>run('return !!document.querySelector(".mtx-history")'),'saved review history');
 await run('document.querySelector(".mtx-history .mrv-evidence").open=true;document.querySelector(".mtx-history .mrv-full-source").open=true;return true');assert.equal(await run('return document.querySelector(".mtx-history .mrv-full-source p").textContent'),firstText);
 await capture('en-760-light-saved-evidence','.mtx-history .mrv-point');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,fixture:'Synthetic HTML + controlled source bridge + controlled analysis; production main/preload/parser/preview/save/history UI. No model request or live website.',fixtureReads,captures},null,2));
 console.log(JSON.stringify({ok:true,out,captures:captures.map(c=>c.file)}));app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.stack||String(error)},null,2));console.error(error);app.exit(1);});
setTimeout(()=>{console.error('Product200 native review smoke exceeded 90 seconds');app.exit(2);},90000).unref();
