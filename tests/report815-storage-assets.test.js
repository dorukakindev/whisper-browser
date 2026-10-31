'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),cp=require('child_process');
const root=process.cwd(); const head=String(process.env.R815_STORAGE_HEAD||'');

const base=path.resolve(root,'tmp/audit-fixes/storage-regression');
const out=path.resolve(process.env.R815_STORAGE_OUT||path.join(base,'run-'+Date.now()));
assert(out.startsWith(base+path.sep),'output must be inside own fixture tree');fs.mkdirSync(out,{recursive:true});
const {BrowserAssetStore}=require(path.join(root,'src/browser-asset-store'));
const {WatchIndex}=require(path.join(root,'src/watch-index'));
const {collectTrackAssetRefs,pruneAndSweepTracks}=require(path.join(root,'src/browser-asset-gc'));
const {BrowserTranslationArchive}=require(path.join(root,'src/browser-translation-archive'));
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const files=['src/main.js','src/browser-asset-store.js','src/browser-asset-gc.js','src/watch-index.js','src/browser-translation-archive.js','src/browser-capture-recovery.js','src/job-timing-helpers.js','src/renderer/renderer.js','src/preload.js'];
const result={head,platform:process.platform,node:process.version,sourceSha256:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),checks:{},limits:['Synthetic files under own fixture tree only; no personal stores, browser UI, live network or providers.','Actual unchanged source function bodies run in VM with explicit boundary facades.']};
function take(start,end){const a=main.indexOf(start),b=main.indexOf(end,a+start.length);assert(a>=0&&b>a);return main.slice(a,b);}
function size(dir){let n=0;try{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);n+=e.isDirectory()?size(p):fs.statSync(p).size;}}catch{}return n;}
(async()=>{
const userData=path.join(out,'userData');fs.mkdirSync(userData,{recursive:true});
const store=new BrowserAssetStore({rootDir:path.join(userData,'browser-assets')});
const index=new WatchIndex(path.join(userData,'index.sqlite'));
let handler;const events=[];const tabs=new Map();const session={tabs:[]};const places={workspaces:[]};
const env={ipcMain:{handle:(name,fn)=>{assert.equal(name,'cache:clear');handler=fn;}},authorizedBrowserSender:e=>e.authorized===true,cacheBusyGuardError:()=>'',app:{getPath:()=>userData},path,fs,browserTabs:tabs,readBrowserSessionWithStatus:()=>({session}),browserSessionPath:()=>path.join(userData,'session.json'),browserPlacesSnapshot:()=>places,browserAssetStore:()=>store,collectTrackAssetRefs,directorySizeBytes:size,browserWatchMediaId:t=>t.mediaId,watchIndex:()=>index,createHash:crypto.createHash,scheduleBrowserSessionSave:()=>{},sendBrowserEvent:(tab,event)=>events.push(event),browserTranslationArchive:()=>{throw Error('No translation archive expected');}};
vm.createContext(env);
vm.runInContext(take("ipcMain.handle('cache:clear',",'// Madde 33'),env);
vm.runInContext(take('function persistBrowserTrack(', 'function restorePersistedBrowserTracks(')+take('function restorePersistedBrowserTracks(', 'function browserTrackPublicationNeedsMetadataRefresh('),env);
function tab(mediaId){return {mediaId,trackRefs:[],acquisitionPlan:{start(){},finish(){}}};}
const producer=tab('fixture:index-only');const persisted=env.persistBrowserTrack(producer,{id:'track-1',language:'en',label:'Saved captions'},[{id:'1',start:1,end:2,text:'Stored fixture caption'}]);assert(persisted.persisted);
const indexedAsset=persisted.assetId;
const workspaceAsset=store.putTrack({mediaId:'fixture:workspace',trackId:'track-2',cues:[{start:1,end:2,text:'Workspace caption'}]});assert(workspaceAsset.ok);
places.workspaces.push({tabs:[{trackRefs:[{assetId:workspaceAsset.assetId}]}]});
const orphan=store.putTrack({mediaId:'fixture:orphan',trackId:'track-3',cues:[{start:1,end:2,text:'Unreferenced fixture'}]});assert(orphan.ok);
const startupKeep=collectTrackAssetRefs(...[...places.workspaces.map(w=>w.tabs)]);pruneAndSweepTracks(index,store,startupKeep);
assert(store.getTrack(indexedAsset).ok,'startup GC protects recent SQLite track');
const restoreBefore=env.restorePersistedBrowserTracks(tab('fixture:index-only'));assert.equal(restoreBefore,1);
const denied=await handler({authorized:false},{kind:'assets'});assert.equal(denied.ok,false);assert(store.getTrack(indexedAsset).ok);
const clear=await handler({authorized:true},{kind:'assets'});assert.equal(clear.ok,true);assert.equal(clear.removed,2);
const restoreAfter=env.restorePersistedBrowserTracks(tab('fixture:index-only'));
assert.equal(restoreAfter,1);assert.equal(index.listTracks('fixture:index-only').length,1);assert.equal(store.getTrack(indexedAsset).ok,true);assert(store.getTrack(workspaceAsset.assetId).ok);assert.equal(store.getTrack(orphan.assetId).ok,false);
const cacheUi=require(path.join(root,'src/job-timing-helpers')); const cacheRow=cacheUi.cacheStatRows({assets:{bytes:1}},true).find(r=>r.kind==='assets'); assert.equal(cacheRow.detail,'only unreferenced files are cleared'); assert(cacheUi.cacheClearGuard('assets',{jobActive:false}).ok);
result.checks.indexOnlyAssetClear={uiDetail:cacheRow.detail,uiClearable:cacheRow.clearable,restoreBefore,restoreAfter,clear,indexRowsAfter:index.listTracks('fixture:index-only').length,sqliteCueCount:index.db.prepare('SELECT COUNT(*) n FROM cues').get().n,workspaceStillReadable:store.getTrack(workspaceAsset.assetId).ok,orphanGone:!store.getTrack(orphan.assetId).ok,unauthorizedRejected:!denied.ok};
env.watchIndex=()=>null;
const unavailable=await handler({authorized:true},{kind:'assets'});
assert.equal(unavailable.ok,false);assert(store.getTrack(indexedAsset).ok);
index.close();
const blocks=[{id:'one',text:'A short article.',tag:'p',section:'Intro'}];const translations=new Map([['one','Kısa bir makale.']]);
function page(dir,title,again){const a=new BrowserTranslationArchive(path.join(out,dir));const raw={url:'https://fixture.invalid/article',targetLanguage:'tr',scope:'article',complete:true,blocks,translations,title};const first=a.savePage(raw);assert(first.ok);assert(a.findPage(raw));const second=a.savePage({...raw,title:again});assert(second.ok);const entry=a.listPages()[0];return {firstOk:first.ok,secondOk:second.ok,entries:a.listPages().length,jsonExists:fs.existsSync(path.join(a.rootDir,entry.jsonPath)),mdExists:fs.existsSync(second.path),restorable:!!a.findPage(raw),indexTitle:entry.title};}
const casePage=page('page-case','Fixture Article','fixture article');const samePage=page('page-same','Fixture Article','Fixture Article');const differentPage=page('page-different','Fixture Article','Another Article');
assert.equal(casePage.jsonExists,true);assert.equal(casePage.mdExists,true);assert.equal(casePage.restorable,true);assert(samePage.restorable);assert(differentPage.restorable);
function subtitle(dir,title,again){const a=new BrowserTranslationArchive(path.join(out,dir));const raw={mediaId:'fixture:video',trackId:'tr',sourceHash:'a'.repeat(64),targetLanguage:'tr',title,cues:[{start:1,end:2,text:'Bir altyazı.'}]};a.saveSubtitle(raw);const r=a.saveSubtitle({...raw,title:again});const entry=JSON.parse(fs.readFileSync(a.indexPath,'utf8')).entries[0];return {secondOk:r.ok,jsonExists:fs.existsSync(path.join(a.rootDir,entry.jsonPath)),srtExists:fs.existsSync(r.path)};}
const caseSub=subtitle('subtitle-case','Fixture Video','fixture video');const sameSub=subtitle('subtitle-same','Fixture Video','Fixture Video');const diffSub=subtitle('subtitle-different','Fixture Video','Another Video');assert(caseSub.secondOk&&caseSub.jsonExists&&caseSub.srtExists);assert(sameSub.jsonExists&&sameSub.srtExists);assert(diffSub.jsonExists&&diffSub.srtExists);
result.checks.caseAliasArchive={casePage,samePage,differentPage,caseSub,sameSub,diffSub};

const pageArchive=new BrowserTranslationArchive(path.join(out,'page-main-consumer'));
const archEnv={Map,Set,browserTranslationArchive:()=>pageArchive,browserPageUrl:t=>t.restoredUrl,pageTranslationCompletion:()=>({failed:0,pending:0}),browserPageExcludedIds:()=>new Set(),loadSettings:()=>({ui:{browserPageTarget:'tr'}}),prepareBrowserPageInstrumentation:async()=>({}),executeBrowserTrustedMain:async(_v,script)=>script.kind==='scan'?[{blocks}]:[{applied:script.translations.length}],pageBlockScanScript:()=>({kind:'scan'}),normalizePageBlocks:b=>b,browserPageTranslationConfig:c=>c,createTerminologyMap:()=>({}),browserPageMemoryVersion:()=>'',pageTranslationSectionProgress:()=>[],browserPageTerminologySuggestions:()=>[],sendBrowserEvent:()=>{},pageApplyScript:c=>c,setTimeout:fn=>{fn();return 1;}};
vm.createContext(archEnv);vm.runInContext(take('function persistBrowserPageTranslationArchive(', 'function scheduleArchivedBrowserPageTranslationRestore('),archEnv);
function pageTab(title){return {restoredTitle:title,restoredUrl:'https://fixture.invalid/main-article',generation:1,view:{webContents:{isDestroyed:()=>false}}};}
const sess={translations,blocks:new Map(blocks.map(b=>[b.id,b])),config:{targetLanguage:'tr'},scope:'article',mode:'bilingual'};
assert(archEnv.persistBrowserPageTranslationArchive(pageTab('Fixture Article'),sess).ok);
const mainBefore=await archEnv.restoreArchivedBrowserPageTranslation(pageTab('Fixture Article'));assert(mainBefore.restored);
assert(archEnv.persistBrowserPageTranslationArchive(pageTab('fixture article'),sess).ok);
const mainAfter=await archEnv.restoreArchivedBrowserPageTranslation(pageTab('fixture article'));assert(mainAfter.restored&&mainAfter.ok);
result.checks.caseAliasArchive.mainProducerConsumer={before:mainBefore,after:mainAfter,positiveApplyCount:mainBefore.translated};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,out,checks:result.checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});
