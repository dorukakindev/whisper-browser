'use strict';
// Controlled public Letterboxd HTML and provider reply; production native app,
// parser, lookup, review selection, source ownership, save and history UI.
const {app,BrowserWindow,session,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','letterboxd-evidence',Date.now()+'-'+process.pid),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const identity={kind:'film',providerId:'tt14173636',title:'Controlled Evidence Film',year:2026};
const selected={...identity,id:'discovery:film:'+identity.providerId,imdbId:identity.providerId,discovery:{kind:'film',id:identity.providerId}};
let wrong=false;const reads=[];
function html(url){const u=new URL(url),sort=u.pathname.includes('entry-rating-lowest')?'low':u.pathname.includes('entry-rating')?'high':u.pathname.includes('activity')?'popular':'new';
 return '<!doctype html><meta property="og:title" content="Reviews of '+(wrong?'Wrong Film':'Controlled Evidence Film')+' (2026) • Letterboxd"><div data-imdb-id="'+(wrong?'tt99999999':identity.providerId)+'"></div>'+Array.from({length:5},(_,i)=>{
  const author=i===0?'repeated-author':sort+'-author-'+i;
  return '<article><a class="name">'+author+'</a><div class="js-review-body">Excellent acting in this '+sort+' review '+i+'. The pacing deserves discussion and the framing feels careful.</div><a href="/'+author+'/film/controlled-evidence/'+(i===0?'2/':'')+'"><time datetime="2026-10-30T12:00:00Z">30 October</time></a><span class="rating rated-'+(sort==='low'?3:9)+'">★★★★½</span></article>';
 }).join('');
}
global.fetch=async(url)=>{const u=new URL(url);if(u.hostname!=='letterboxd.com')throw Error('Native evidence acceptance: external fetch disabled');reads.push(u.href);if(/^\/(?:imdb|tmdb)\//.test(u.pathname))return new Response(null,{status:302,headers:{location:'https://letterboxd.com/film/controlled-evidence/'}});return new Response(html(u.href),{headers:{'content-type':'text/html; charset=utf-8'}});};
// Discovery metadata is controlled, with real IPC dispatch and real decision
// service revalidation. No library title is inserted for the discovery route.
const originalHandle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>originalHandle(name,name==='media-discovery:request'?async(_event,input)=>{assert.equal(input.action,'detail');assert.equal(input.id,identity.providerId);return {ok:true,item:{...identity}};}:handler);
const service=require('../src/media-tools-service'),register=service.registerMediaTools;service.registerMediaTools=options=>register({...options,resolveDiscovery:async(_event,input)=>{assert.equal(input.id,identity.providerId);return {ok:true,item:{...identity}};}});
require('../src/main');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await pause(70);}throw Error('Timeout: '+label);}
let win,run;const evidence={nativeApp:true,publicHtml:'controlled fixture',analysis:'controlled fixture',discoveryWithoutCatalog:true,cases:[]};
async function shot(name,selector){if(selector)await run('document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"start"});return true');await run('await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true');await pause(120);const metrics=await run(`const d=document.getElementById('mediaToolsDialog');return d?{overflow:d.scrollWidth>d.clientWidth+1,width:innerWidth,height:innerHeight}:{};`);assert(!metrics.overflow,JSON.stringify(metrics));fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await session.fromPartition('persist:whisper-browser').protocol.handle('https',request=>new Response(html(request.url),{headers:{'content-type':'text/html; charset=utf-8'}}));
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main app');win.setMinimumSize(400,500);win.setContentSize(1280,900);win.showInactive();run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run('await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");window.fixtureEvidenceItem='+JSON.stringify(selected)+';MediaToolsUI.open("decision",fixtureEvidenceItem);return true');await until(()=>run('return !!document.querySelector(".mrv-source")'),'discovery review form');await shot('review-default-controls','.mrv-source');
 await run(`[...document.querySelectorAll('.mrv-source button')].find(n=>n.textContent==='Bu filmi Browser’da aç').click();return true`);
 await until(()=>run('return !!player.browserActiveTabId&&!player.browserWorkspaceShowBusy'),'browser opened');
 await run(`return api.navigateBrowser(player.browserActiveTabId,'https://letterboxd.com/film/controlled-evidence/reviews/by/entry-rating-lowest/')`);
 await until(()=>run(`return player.browserPageUrl.includes('/reviews/by/entry-rating-lowest/')&&!player.browserLoading&&!!document.getElementById('reviewBrowserReturn')`),'loaded review page and return handoff');
 await run(`document.querySelector('#reviewBrowserReturn .mh-primary').click();return true`);
 await until(()=>run(`return document.querySelector('.mrv-provenance')?.dataset.state==='matched'&&document.querySelector('.mrv-job')?.dataset.state==='ready'`),'discovery reviews return through actual Browser');
 assert.equal((await run('return api.mediaCatalog({action:"list"})')).items.length,0,'Discovery review return must not create a library item');evidence.cases.push('discovery Browser handoff without catalog insertion');
 const browserRows=await run('return JSON.parse(document.querySelector("[name=review-text]").value)');assert(browserRows.every(row=>row.source.sort==='low'));assert(browserRows.every(row=>row.source.url.includes('entry-rating-lowest')));await shot('discovery-browser-sample','.mrv-provenance');
 // The automatic request uses actual identifier redirects, parser and all four
 // verified sort pools. Changing the selector is the real UI event path.
 await run(`const sort=document.querySelector('[name=letterboxd-review-sort]');if(!sort)throw Error('Review sort control missing');sort.value='balanced';sort.dispatchEvent(new Event('change'));document.querySelector('[name=letterboxd-sample-count]').value='12';document.querySelector('[data-review-action=auto]').click();return true`);
 await until(()=>run(`return document.querySelector('.mrv-job')?.dataset.state==='ready'&&JSON.parse(document.querySelector('[name=review-text]').value).length===12`),'balanced review sample');
 const balanced=await run(`return JSON.parse(document.querySelector('[name=review-text]').value)`);assert.deepEqual([...new Set(balanced.map(row=>row.source.sort))].sort(),['high','low','new','popular']);assert.equal(new Set(balanced.map(row=>row.authorId)).size,balanced.length);evidence.cases.push('balanced verified sort pools and independent authors');
 await run(`document.querySelector('[data-review-action=preview]').click();return true`);await until(()=>run('return !!document.querySelector(".mrv-sample")'),'review preview');
 assert(await run(`return document.querySelector('[name=review-title-confirmed]').checked`));await shot('balanced-preview','.mrv-sample');
 await run(`translationEndpointReady=()=>true;aiChatSend=async()=>{window.fixtureEvidenceSent=JSON.parse(globalAssistantContext().reviewAnalysis||globalAssistantContext().excerpt);const first=fixtureEvidenceSent.reviews[0];document.dispatchEvent(new CustomEvent('assistant-answer',{detail:{context:globalAssistantContext(),text:JSON.stringify({summary:'Seçilen örnekte oyunculuk övülüyor; bu, genel izleyici kanaati değildir.',fit:'Açık kişisel tercih kaydı yok; kesin uygunluk çıkarılamaz.',points:[{id:first.id,quote:'Excellent acting',quoteTr:'Oyunculuk çok başarılı.',reason:'Bu yorumcu oyunculuğu açıkça övüyor.',kind:'praise'}]})}}));};document.querySelector('.mrv-preview-actions .mh-primary').click();return true`);
 await until(()=>run(`return document.querySelector('.mrv-job')?.dataset.state==='result'`),'verified controlled result');
 const output=await run('return document.querySelector(".mrv-output").textContent');assert.match(output,/Oyunculuk çok başarılı/);assert.match(output,/Excellent acting/);assert.match(output,/Türkçe|çeviri|anlam/i);
 await run(`document.querySelector('.mrv-output .mrv-evidence').open=true;return true`);assert.equal(await run(`return document.querySelector('.mrv-output .mrv-quote-tr').dataset.quoteKind`),'paraphrase');await shot('turkish-quote-result','.mrv-output .mrv-point');
 await run(`[...document.querySelectorAll('.mrv-output button')].find(n=>/Alıntıları doğrula/.test(n.textContent)).click();return true`);await until(()=>run('return !!document.querySelector(".mtx-history")'),'saved verified analysis');
 const record=await run('return api.mediaTools({action:"decision-get",itemId:fixtureEvidenceItem.id,discovery:fixtureEvidenceItem.discovery})');const entry=record.value.history[0];assert(entry.evidenceSnapshot?.context);assert.equal(entry.analysis.points[0].quote,'Excellent acting');assert.equal(entry.analysis.points[0].quoteTr,'Oyunculuk çok başarılı.');assert(entry.reviews.every(row=>row.source&&row.authorId));evidence.cases.push('original quote plus labeled Turkish paraphrase and saved provenance');
 const preferences={weights:{story:1,characters:1,pace:5,visuals:1,sound:1,emotion:1},avoid:['pace'],note:'Controlled changed preference'};
 assert((await run('return api.mediaShelf({action:"taste-preferences",preferences:'+JSON.stringify(preferences)+'})')).ok);
 await run('MediaToolsUI.open("decision",fixtureEvidenceItem);return true');await until(()=>run('return !!document.querySelector(".mtx-history [data-freshness=stale]")'),'profile change marks old analysis stale');
 await shot('profile-changed-stale','.mtx-history');evidence.cases.push('profile change makes saved analysis stale');
 // A wrong-film import cannot destroy the matched cached draft.
 const before=await run('return document.querySelector("[name=review-text]").value');
 const sourceView=win.contentView.children.find(view=>view.webContents?.getURL().includes('letterboxd.com/film/controlled-evidence/reviews/'));assert(sourceView);
 await sourceView.webContents.executeJavaScript(`document.querySelector('meta[property="og:title"]').content='Reviews of Wrong Film (2026) • Letterboxd';document.querySelector('[data-imdb-id]').setAttribute('data-imdb-id','tt99999999');true`,true);
 await run(`[...document.querySelectorAll('.mrv-source button')].find(n=>/Açık Browser sayfasındaki yorumları kullan/.test(n.textContent)).click();return true`);
 await until(()=>run(`return document.querySelector('.mrv-job')?.dataset.state==='failed'`),'wrong-title source rejected');assert.equal(await run('return document.querySelector("[name=review-text]").value'),before);wrong=false;evidence.cases.push('wrong title preserves cached sample');
 for(const mode of [{locale:'tr',theme:'dark',width:1280},{locale:'tr',theme:'light',width:720},{locale:'en',theme:'dark',width:1280},{locale:'en',theme:'light',width:720}]){
  win.setContentSize(mode.width,850);await run('UiLocale.set('+JSON.stringify(mode.locale)+',false);applyUiTheme('+JSON.stringify(mode.theme)+');return true');
  await until(()=>run('return !!document.querySelector(".mtx-history")'),'localized history');
  await run(`const box=document.querySelector('.mtx-history');box.open=true;box.querySelector('.mrv-evidence').open=true;return true`);
  const detail=await run(`const box=document.querySelector('.mtx-history');return {label:box.querySelector('.mrv-quote-tr strong').textContent,kind:box.querySelector('.mrv-quote-tr').dataset.quoteKind,quote:box.querySelector('blockquote').textContent,metadata:box.querySelector('.mrv-review-meta').textContent};`);
  assert.equal(detail.kind,'paraphrase');assert.equal(detail.quote,'Excellent acting');assert.match(detail.metadata,mode.locale==='tr'?/Yorum etkinliği · sayfa 1/:/Review activity · page 1/);assert.equal(detail.label,mode.locale==='tr'?'Türkçe açıklama · AI anlatımı':'Turkish explanation · AI paraphrase');
  await shot(mode.locale+'-'+mode.width+'-'+mode.theme+'-quote-history','.mtx-history .mrv-point');
 }
 // Existing global settings are reached through the actual native overlay,
 // without sending a provider request or changing stored preferences.
 await run("document.getElementById('mediaToolsDialog').close();return true");
 const assistant=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(assistant);
 const overlay=code=>assistant.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 for(const mode of [{locale:'tr',theme:'dark',width:1280},{locale:'en',theme:'light',width:720}]){
  win.setContentSize(mode.width,850);await run('UiLocale.set('+JSON.stringify(mode.locale)+',false);applyUiTheme('+JSON.stringify(mode.theme)+');return true');
  await until(()=>overlay('return document.documentElement.lang==='+JSON.stringify(mode.locale)),'assistant locale');
  await overlay("if(document.getElementById('panel').hidden)document.getElementById('bubble').click();document.getElementById('sourceBox').open=true;return true");
  await until(()=>overlay("return !document.getElementById('panel').hidden&&document.getElementById('assistantSettings').getBoundingClientRect().height>0"),'advanced assistant settings control');
  const control=await overlay("await document.fonts.ready;const n=document.getElementById('assistantSettings'),r=n.getBoundingClientRect();return {label:document.getElementById('sourceLabel').textContent,text:n.textContent,reachable:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};");
  assert(control.reachable);assert.match(control.label,mode.locale==='tr'?/model/:/model/i);await pause(150);
  fs.writeFileSync(path.join(out,'assistant-source-'+mode.locale+'-'+mode.width+'.png'),(await assistant.webContents.capturePage()).toPNG());
  await overlay("document.getElementById('assistantSettings').click();return true");
  await until(()=>run("return !!document.querySelector('dialog[open] [data-app-settings=ai][aria-current=page]')"),'existing assistant settings opened');
  await shot('assistant-settings-'+mode.locale+'-'+mode.width);await run('AppSettingsUI.close();return true');
 }
 evidence.cases.push('native assistant model disclosure and existing settings shortcut at normal/narrow widths');
 evidence.reads=reads;evidence.reviewCount=balanced.length;evidence.limits='Controlled public HTML and assistant completion; no live Letterboxd, paid model, personal profile or claim of translation/model quality.';fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({ok:true,...evidence},null,2));console.log(JSON.stringify({ok:true,out,...evidence}));app.exit(0);
}).catch(async error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.message,...evidence},null,2));try{if(run)await shot('failure');}catch{}app.exit(1);});setTimeout(()=>app.exit(2),100000).unref();
