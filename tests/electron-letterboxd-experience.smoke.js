'use strict';
// Real native renderer, trusted bridge, catalog, review parser and decision store.
// Public HTML and assistant completion are explicitly controlled fixtures.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','letterboxd-experience',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const films=[{kind:'film',providerId:'tt14173636',title:'Controlled Discovery Film',year:2026},{kind:'film',providerId:'tt76543210',title:'Controlled Library Film',year:2025}];
const discovery=film=>({...film,id:'discovery:film:'+film.providerId,imdbId:film.providerId,discovery:{kind:'film',id:film.providerId}});
let fetchMode='normal';const reads=[];
global.fetch=async(url)=>{
 const u=new URL(url);if(u.hostname!=='letterboxd.com')throw Error('Acceptance external fetch disabled');reads.push(u.href);
 if(fetchMode==='error'){await new Promise(resolve=>setTimeout(resolve,900));return new Response('Controlled access failure',{status:403});}
 const film=films.find(row=>u.pathname.includes(row.providerId))||films.find(row=>u.pathname.includes(row===films[0]?'controlled-discovery':'controlled-library'));assert(film,'Unknown controlled source '+url);
 const slug=film===films[0]?'controlled-discovery':'controlled-library';
 if(/^\/(imdb|tmdb)\//.test(u.pathname))return new Response(null,{status:302,headers:{location:'https://letterboxd.com/film/'+slug+'/'}});
 const html='<meta property="og:title" content="Reviews of '+film.title+' ('+film.year+') • Letterboxd"><div data-imdb-id="'+film.providerId+'"></div>'+Array.from({length:12},(_,i)=>'<article><a class="name">controlled-author-'+i+'</a><div class="js-review-body">Excellent acting in controlled review '+i+'. The careful framing supports the performances, although the measured pacing will divide viewers.</div><a href="/controlled-author-'+i+'/film/'+slug+'/"><time datetime="2026-10-30T12:00:00Z">30 October</time></a><span class="rating rated-8">★★★★</span></article>').join('');
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
};
const detail=input=>{const film=films.find(row=>row.providerId===input.id);assert(film);return {ok:true,item:{...film}};};
const originalHandle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>originalHandle(name,name==='media-discovery:request'?async(_event,input)=>{assert.equal(input.action,'detail');return detail(input);}:handler);
const service=require('../src/media-tools-service'),register=service.registerMediaTools;service.registerMediaTools=options=>register({...options,resolveDiscovery:async(_event,input)=>detail(input)});
require('../src/main');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await pause(60);}throw Error('Timeout: '+label);}
let win,run;const evidence={nativeApp:true,publicHtml:'controlled fixture',analysis:'controlled fixture',cases:[],screenshots:[]};
async function open(item){await run('MediaToolsUI.open("decision",'+JSON.stringify(item)+');return true');await until(()=>run('return !!document.querySelector(".mrv-source")'),'review panel');}
async function shot(name,selector='.mrv-source'){
 await run((selector?'document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"start"});':'')+'await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true');
 const metrics=await run('const d=document.getElementById("mediaToolsDialog"),s=document.querySelector(".mrv-source");return {width:innerWidth,height:innerHeight,dialogOverflow:d.scrollWidth>d.clientWidth+1,sourceOverflow:s.scrollWidth>s.clientWidth+1};');
 assert(!metrics.dialogOverflow&&!metrics.sourceOverflow,JSON.stringify(metrics));fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());evidence.screenshots.push({name,...metrics});
}
async function analyzeAndSave(item){
 await open(item);await run('document.querySelector("[name=letterboxd-sample-count]").value="12";document.querySelector("[data-review-action=auto]").click();return true');
 await until(()=>run('return document.querySelector(".mrv-job")?.dataset.state==="ready"'),'review sample loaded');
 assert(await run('const n=document.querySelector(".mrv-loaded-sample");return !!n&&n.getBoundingClientRect().height>0;'));
 await run('document.querySelector(".mrv-loaded-reader").open=true;return true');assert.equal(await run('return document.querySelectorAll(".mrv-loaded-reader article").length'),12);await shot(item.discovery?'loaded-discovery-reader':'loaded-library-reader','.mrv-loaded-sample');await run('document.querySelector(".mrv-loaded-reader").open=false;return true');
 await run('document.querySelector("[data-review-action=preview]").click();return true');await until(()=>run('return !!document.querySelector(".mrv-sample")'),'preview');
 assert(await run('return document.querySelector("[name=review-title-confirmed]").checked'));
 await run(`translationEndpointReady=()=>true;aiChatSend=async()=>{const sent=JSON.parse(globalAssistantContext().excerpt);window.controlledEvidenceSent=sent;document.dispatchEvent(new CustomEvent('assistant-answer',{detail:{context:globalAssistantContext(),text:JSON.stringify({summary:'Controlled fixture: this selected sample praises performances and mentions divisive pacing; it does not establish consensus.',fit:'Controlled fixture: no explicit personal taste evidence is supplied.',points:[{id:sent.reviews[0].id,quote:'Excellent acting',reason:'Controlled fixture interpretation of the quoted performance praise.',kind:'praise'}]})}}));};document.querySelector('.mrv-preview-actions .mh-primary').click();return true`);
 await until(()=>run('return document.querySelector(".mrv-job")?.dataset.state==="result"'),'controlled verified analysis');
 await run(`[...document.querySelectorAll('.mrv-output button')].find(n=>/Verify quotes|Alıntıları doğrula/.test(n.textContent)).click();return true`);
 await until(()=>run('return !!document.querySelector(".mtx-history")'),'saved analysis');
 const saved=await run('return api.mediaTools('+JSON.stringify({action:'decision-get',itemId:item.id,...(item.discovery?{discovery:item.discovery}:{})})+')');assert(saved.ok);assert.equal(saved.value.history.length,1);
 const entry=saved.value.history[0];assert(entry.evidenceSnapshot?.context);const context=JSON.parse(entry.evidenceSnapshot.context);assert.equal(context.identity.imdbId,item.imdbId);assert(entry.reviews.every(row=>row.source?.url.includes('letterboxd.com')&&row.authorId));assert.equal(entry.analysis.points[0].quote,'Excellent acting');return entry;
}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main app');win.setMinimumSize(400,500);win.setContentSize(1280,900);win.showInactive();run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run('await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");return true');
 const a=discovery(films[0]),b=discovery(films[1]);
 for(const mode of [{locale:'tr',theme:'dark',width:1280},{locale:'en',theme:'light',width:720}]){
  win.setContentSize(mode.width,900);await run('UiLocale.set('+JSON.stringify(mode.locale)+',false);applyUiTheme('+JSON.stringify(mode.theme)+');return true');await open(mode.locale==='tr'?a:b);
  assert.equal(await run('return document.querySelectorAll(".mtx-history").length'),0);await shot(mode.locale+'-'+mode.width+'-empty');
  fetchMode='error';await run('document.querySelector("[data-review-action=auto]").click();return true');await until(()=>run('return document.querySelector(".mrv-job")?.dataset.state==="reading"'),'loading');await shot(mode.locale+'-'+mode.width+'-loading');
  await until(()=>run('return document.querySelector(".mrv-job")?.dataset.state==="failed"'),'controlled fetch failure');assert(await run('return [...document.querySelectorAll(".mrv-job button")].some(n=>/Retry reading|Yorumları yeniden getir/.test(n.textContent));'));await shot(mode.locale+'-'+mode.width+'-error');fetchMode='normal';
 }
 await run('UiLocale.set("tr",false);applyUiTheme("dark");return true');win.setContentSize(1280,900);
 await analyzeAndSave(a);assert.equal((await run('return api.mediaCatalog({action:"list"})')).items.length,0);
 assert((await run('return api.mediaTools('+JSON.stringify({action:'feedback-save',itemId:a.id,discovery:a.discovery,reaction:'like',note:'Controlled discovery-only personal feedback',aspects:['characters']})+')')).ok);
 const localAResult=await run('return api.mediaCatalog('+JSON.stringify({action:'save',item:{kind:'film',title:films[0].title,year:films[0].year,imdbId:films[0].providerId}})+')');assert(localAResult.ok);const localA=localAResult.item;assert(!localA.id.startsWith('discovery:'));
 const crossA=await run('return api.mediaTools('+JSON.stringify({action:'decision-get',itemId:localA.id})+')');assert(crossA.ok);assert.equal(crossA.value.history[0].savedFrom,'discovery');assert.equal(crossA.value.feedback,undefined);evidence.cases.push('discovery analysis visible under real catalog ID; feedback stays on discovery');
 const unrelated=await run('return api.mediaCatalog('+JSON.stringify({action:'save',item:{kind:'film',title:films[0].title,year:films[0].year,imdbId:'tt99999999'}})+')');assert(unrelated.ok);
 const unrelatedNotes=await run('return api.mediaTools('+JSON.stringify({action:'decision-get',itemId:unrelated.item.id})+')');assert(unrelatedNotes.ok);assert.equal((unrelatedNotes.value.history||[]).length,0);assert.equal(unrelatedNotes.value.feedback,undefined);evidence.cases.push('same title/year with unrelated provider identity receives no saved analysis or feedback');
 const localBResult=await run('return api.mediaCatalog('+JSON.stringify({action:'save',item:{kind:'film',title:films[1].title,year:films[1].year,imdbId:films[1].providerId}})+')');assert(localBResult.ok);const localB=localBResult.item;await analyzeAndSave(localB);
 assert((await run('return api.mediaTools('+JSON.stringify({action:'feedback-save',itemId:localB.id,reaction:'dislike',note:'Controlled library-only personal feedback',aspects:['pace']})+')')).ok);
 const crossB=await run('return api.mediaTools('+JSON.stringify({action:'decision-get',itemId:b.id,discovery:b.discovery})+')');assert(crossB.ok);assert.equal(crossB.value.history.length,1);assert.equal(crossB.value.history[0].savedFrom,'library');assert.equal(crossB.value.feedback,undefined);assert.equal(crossB.value.history[0].identity.imdbId,films[1].providerId);evidence.cases.push('library analysis visible in discovery; unrelated movie excluded and feedback remains library-only');
 for(const [item,origin]of [[localA,'discovery'],[b,'library']])for(const mode of [{locale:'tr',theme:'dark',width:1280},{locale:'en',theme:'light',width:720}]){
  win.setContentSize(mode.width,900);await run('UiLocale.set('+JSON.stringify(mode.locale)+',false);applyUiTheme('+JSON.stringify(mode.theme)+');return true');await open(item);
  assert.equal(await run('return document.querySelectorAll(".mtx-history").length'),1);assert.equal(await run('return document.querySelector("[data-saved-origin]")?.dataset.savedOrigin'),origin);
  assert(await run('const n=document.querySelector("details.mrv-personal-feedback");return !!n&&!n.open&&!n.querySelector("textarea").value;'));
  await shot(mode.locale+'-'+mode.width+'-'+origin+'-populated','.mrv-saved-analyses');
  await run('document.querySelector(".mtx-history").open=true;const n=[...document.querySelectorAll(".mtx-history button")].find(n=>/Reuse this saved sample|Bu kayıtlı örneği kullan/.test(n.textContent));if(!n)throw Error("Reuse control missing");n.focus();return true');
  win.focus();win.webContents.focus();await pause(100);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await until(()=>run('return document.querySelector(".mrv-job")?.dataset.state==="ready"'),'keyboard reused sample');assert.deepEqual(await run('return JSON.parse(document.querySelector("[name=review-text]").value)'),(origin==='discovery'?crossA:crossB).value.history[0].reviews,'Reuse must restore the exact saved bounded sample');
  assert(await run('return document.activeElement===document.querySelector("[data-review-action=preview]")'),'Keyboard reuse must focus the next preview action');
  const focusVisibility=await run('const n=document.activeElement,r=n.getBoundingClientRect(),d=n.closest("dialog").getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,visible:r.top>=Math.max(0,d.top)&&r.bottom<=Math.min(innerHeight,d.bottom)&&r.left>=Math.max(0,d.left)&&r.right<=Math.min(innerWidth,d.right),hit:hit===n||n.contains(hit)};');
  assert(focusVisibility.visible&&focusVisibility.hit,'Focused preview must be fully visible and hittable: '+JSON.stringify(focusVisibility));
  (evidence.keyboardFocus||=[]).push({locale:mode.locale,width:mode.width,origin,...focusVisibility});
  assert(await run('const n=document.querySelector(".mrv-loaded-sample");return !!n&&n.getBoundingClientRect().height>0;'));assert(await run('return document.querySelector(".mrv-provenance").dataset.state==="matched"'));
  await shot(mode.locale+'-'+mode.width+'-'+origin+'-reused',null);
  await run('document.querySelector("[data-review-action=preview]").click();return true');await until(()=>run('return !!document.querySelector(".mrv-sample")'),'reused preview');assert(await run('return document.querySelector("[name=review-title-confirmed]").checked'));
 }
 evidence.cases.push('saved origin labels, collapsed separate feedback, keyboard reuse, source match and populated/empty/loading/error at 1280 dark TR and 720 light EN');
 evidence.reads=reads;evidence.limits='Controlled public HTML and assistant completion; no live Letterboxd, paid provider, personal profile, real media playback, or model-quality claim.';
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({ok:true,...evidence},null,2));console.log(JSON.stringify({ok:true,out,...evidence}));app.exit(0);
}).catch(async error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.message,...evidence},null,2));try{if(run)await shot('failure');}catch{}app.exit(1);});setTimeout(()=>app.exit(2),150000).unref();
