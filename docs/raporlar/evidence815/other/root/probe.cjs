'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.cwd(),base=path.resolve(process.env.R815_ROOT_OUT||'.tmp/next815-root/runs');fs.mkdirSync(base,{recursive:true});const out=fs.mkdtempSync(path.join(base,'run-'));
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8').replace(/\r\n/g,'\n');
const diag=require(path.join(root,'src/browser-diagnostics-export')),adapters=require(path.join(root,'src/browser-adapters')),profiles=require(path.join(root,'src/browser-site-profiles'));
const {atomicWriteFileSync}=require(path.join(root,'src/fsync-utils'));
function between(a,b){const i=main.indexOf(a),j=main.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return main.slice(i,j);}
async function diagnostic(label,message,cues=[]){
 const handlers=new Map(),tab={id:'fixture-tab'},events=[],target=path.join(out,label+'.json');
 const c={...diag,...adapters,app:{isPackaged:true,getVersion:()=> 'fixture',getLocale:()=> 'en'},process,
  browserDiagnostics:{operationId:'fixture-only',pageUrl:'https://fixture.invalid/',counts:{textTrack:0,errors:0},recent:[],activity:{}},browserGpuDiagnostics:null,browserAdblockController:null,browserTrackBuffers:new Map([['fixture-cues',cues.map(text=>({text}))]]),
  activeBrowserTab:()=>tab,isCurrentBrowserContext:()=>true,sendBrowserEvent:(_t,e)=>events.push(e),publishBrowserDiagnostics(){},
  authorizedBrowserSender:()=>true,ipcMain:{handle:(n,f)=>handlers.set(n,f)},path,mainWindow:null,
  dialog:{showSaveDialog:async()=>({canceled:false,filePath:target})},dt:(_tr,en)=>en,writeBufferAtomic:atomicWriteFileSync};
 vm.createContext(c);
 vm.runInContext(between('function noteBrowserCapture(','function noteBrowserDiagnosticActivity(')+between('function browserDiagnosticsExportSnapshot()','function normalizeBrowserUrl(')+between("ipcMain.handle('browser:diagnostics:preview'","ipcMain.handle('browser:clip:export'"),c);
 c.noteBrowserCapture('textTrack',{url:'https://fixture.invalid/captions.vtt'},'error',message);
 const preview=await handlers.get('browser:diagnostics:preview')({});assert.equal(preview.ok,true);
 const saved=await handlers.get('browser:diagnostics:export')({}, {json:preview.json});assert.equal(saved.ok,true);
 const disk=fs.readFileSync(target,'utf8');assert.equal(disk,preview.json);
 return {producerMessage:c.browserDiagnostics.activity.lastError.message,exported:JSON.parse(disk),previewMatchesDisk:true};
}
function pathRace(){
 const oldUrl='https://www.youtube.com/watch?v=abcdefghijk',newUrl='https://www.youtube.com/shorts/abcdefghijk';
 const registry=require(path.join(root,'src/browser-adapter-registry')).createBuiltinAdapterRegistry();
 assert.equal(registry.mediaIdentity(oldUrl).key,registry.mediaIdentity(newUrl).key);
 let url=oldUrl,places={siteProfiles:{},pathProfiles:{}},nav;
 const tab={id:'tab',generation:3,mediaId:registry.mediaIdentity(oldUrl).key};
 const handlers=new Map();const c={...profiles,tab,wc:{on:(_name,fn)=>nav=fn,getURL:()=>url,getTitle:()=> 'Synthetic same video'},
  ADAPTER_REGISTRY:registry,browserActiveTabId:'tab',browserNavigationStateForTab:()=>({url}),sendBrowserEvent(){},rememberBrowserVisit(){},syncBrowserTabCompatibilityForUrl(){},restoreBrowserMediaSubtitlePreference(){},applyStoredBrowserZoom(){},scheduleBrowserSessionSave(){},
  authorizedBrowserSender:()=>true,activeRequestedBrowserTab:()=>tab,browserTabSnapshot:()=>({url}),readBrowserPlaces:()=>JSON.parse(JSON.stringify(places)),setBrowserPlaces:p=>{places=p;},flushBrowserPlaces:()=>true,browserPlacesSnapshot:()=>places,browserTabs:new Map([['tab',tab]]),refreshBrowserYoutubeGuards(){},ipcMain:{handle:(n,f)=>handlers.set(n,f)}};
 vm.createContext(c);
 vm.runInContext(between("  wc.on('did-navigate-in-page'","  wc.on('page-title-updated'"),c);
 vm.runInContext(between("ipcMain.handle('browser:profile:update'","ipcMain.handle('browser:page:start'"),c);
 const handle=handlers.get('browser:profile:update');
 const request={tabId:tab.id,generation:3,origin:profiles.browserSiteOrigin(oldUrl),scope:'path',url:oldUrl,field:'subtitleMode',value:'both'};
 const stable=handle({},request);assert.equal(stable.ok,true);assert.equal(places.pathProfiles[profiles.browserPathKey(oldUrl)].subtitleMode,'both');
 places={siteProfiles:{},pathProfiles:{}};url=newUrl;nav({},newUrl,true);assert.equal(tab.generation,3);
 const stale=handle({},request);assert.equal(stale.ok,true);assert.equal(places.pathProfiles[profiles.browserPathKey(newUrl)].subtitleMode,'both');assert.equal(places.pathProfiles[profiles.browserPathKey(oldUrl)],undefined);
 const wrongGeneration=handle({}, {...request,generation:2});assert.equal(wrongGeneration.ok,false);
 return {request,oldMediaIdentity:registry.mediaIdentity(oldUrl),newMediaIdentity:registry.mediaIdentity(newUrl),generationAfterRealSpaCallback:tab.generation,stableSavedTo:profiles.browserPathKey(oldUrl),staleResult:stale,oldPathPresent:false,newPathSaved:true,wrongGenerationRejected:!wrongGeneration.ok,limits:'Actual original SPA callback and IPC, real registry/profile helpers; in-memory places/flush and window boundaries controlled. No real site loaded.'};
}
(async()=>{
 const secretMessage='Client rejected: clientSecret=FAKE_CLIENT_MARKER; accessToken=FAKE_ACCESS_MARKER; private_key=FAKE_PRIVATE_MARKER';
 const secret=await diagnostic('secret',secretMessage);const exported=JSON.stringify(secret.exported);
 for(const marker of ['FAKE_CLIENT_MARKER','FAKE_ACCESS_MARKER','FAKE_PRIVATE_MARKER'])assert(exported.includes(marker));
 const secretControl=await diagnostic('secret-control','Client rejected: api_key=FAKE_CLASSIC_MARKER');assert(!JSON.stringify(secretControl.exported).includes('FAKE_CLASSIC_MARKER'));
 const longCue='FAKE_PRIVATE_CUE_START '+Array.from({length:45},(_,i)=>'synthetic-word-'+i).join(' ')+'.';assert(longCue.length>400);
 const truncated=await diagnostic('cue-truncated','Provider echoed: '+longCue,[longCue]);
 assert.equal(truncated.producerMessage.length,160);assert(truncated.exported.recent[0].detail.includes('FAKE_PRIVATE_CUE_START'));assert(!truncated.exported.recent[0].detail.includes(diag.SUBTITLE_REDACTION));
 const shortCue='FAKE_SHORT_PRIVATE_CUE';const cueControl=await diagnostic('cue-control','Provider echoed: '+shortCue,[shortCue]);assert(!JSON.stringify(cueControl.exported).includes(shortCue));
 const sourceFiles=['src/main.js','src/renderer/renderer.js','src/browser-diagnostics-export.js','src/browser-adapters.js','src/browser-sensitive-keys.js','src/browser-site-profiles.js','src/browser-adapter-registry.js','src/fsync-utils.js'];
 const sourceSha256=Object.fromEntries(sourceFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
 const result={head:'6a789329d96c4f97cdc17bd9518df0b540b13444',sourceSha256,NR01:{secret,classicControl:secretControl.exported.recent[0].detail},NR02:{knownCueLength:longCue.length,truncatedProducerLength:truncated.producerMessage.length,exportedDetail:truncated.exported.recent[0].detail,previewMatchesDisk:truncated.previewMatchesDisk,shortCueControl:cueControl.exported.recent[0].detail},NR03:pathRace(),limits:'All secrets/cues are fake markers. Actual main producer/preview/export and real atomic filesystem writes in isolated fixtures; native dialog and external events controlled. No personal data, account, provider or network.'};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out,verified:['NR01','NR02','NR03'],sourceHashes:sourceFiles.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
