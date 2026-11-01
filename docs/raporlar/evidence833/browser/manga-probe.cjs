'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../..'),out=process.env.AUDIT833_OUT||path.join(root,'.uiprev/audit833-browser-manga-probe-'+Date.now());fs.mkdirSync(out,{recursive:true});
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const term=require(path.join(root,'src/browser-terminology')),site=require(path.join(root,'src/browser-site-terminology')),manga=require(path.join(root,'src/browser-manga'));
const {JSDOM}=require('jsdom'),profiles=require(path.join(root,'src/browser-site-profiles'));
const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
function section(a,b){const i=main.indexOf(a),j=main.indexOf(b,i);assert(i>=0&&j>i,a);return main.slice(i,j);}
async function scenario(kind){
 let url='https://manga-a.invalid/chapter1',language='tr',calls=[],places={siteTerminology:{}},cache=new Map(),events=[];
 const candidates=[1,2].map(i=>({id:'img'+i,url:'https://image.invalid/page'+i+'.png',width:1000,height:1600}));
 const tab={id:'tab1',generation:1,view:{webContents:{getURL:()=>url,getTitle:()=> 'Synthetic chapter',isDestroyed:()=>false}},mangaAttempted:new Set(),mangaPages:new Map(),mangaFailures:[],mangaTranslated:0};let activeTab=tab;const handlers={};
 const ctx=vm.createContext({console,URL,Map,Set,Buffer,AbortController,Date,Math,Number,String,Object,Array,JSON,Promise,setTimeout,clearTimeout,
 ...term,...site,...manga,randomUUID:crypto.randomUUID,browserActiveTabId:'tab1',browserPageUrl:()=>url,
 readBrowserPlaces:()=>structuredClone(places),setBrowserPlaces:p=>{places=structuredClone(p);return true;},
 loadSettings:()=>({}),browserTranslationConfig:()=>({endpoint:'http://127.0.0.1/fixture',model:'fixture-model',workers:1,maxImages:2}),
 ipcMain:{handle:(key,fn)=>handlers[key]=fn},authorizedBrowserSender:e=>e.authorized===true,activeRequestedBrowserTab:id=>id===activeTab.id?activeTab:null,browserTabById:id=>id===activeTab.id?activeTab:null,
 safeTranslationEndpoint:s=>s,resolveTranslationEndpoints:s=>[s],browserMangaCache:()=>cache,
 fetchMangaImage:async c=>({mimeType:'image/png',buffer:Buffer.from(c.id)}),
 mangaCacheKey:(b,c)=>'result:'+b+':'+c.targetLanguage,legacyMangaCacheKey:(b,c)=>'legacy:'+b+':'+c.targetLanguage,mangaOcrCacheKey:b=>'ocr:'+b,
 decorateMangaRegionColors:(_i,r)=>r,restoreBrowserMangaPosition:async()=>{},sendBrowserEvent:(_t,e)=>events.push(e),
 mangaJobIsCurrent:(t,j)=>t.mangaJob===j&&!j.controller.signal.aborted&&t.generation===j.generation,
 waitForMangaRetry:async()=>{},supportedMangaDataUrl:()=>false,isSafeMangaImageUrl:()=>true,
 mangaClearScript:()=> 'clear',mangaCandidateScanScript:()=> 'scan',mangaOverlayScript:()=> 'overlay',
 executeBrowserTrustedMain:async(_v,s)=>s==='scan'?[candidates]:[true],
 mangaRetryableDownloadError:()=>false,mangaResultState:r=>r.resultState,mangaFailureState:()=> 'request_failed',
 fetch:async(_endpoint,opts)=>{const body=JSON.parse(opts.body);calls.push({language,body});return{ok:true,status:200};},
 readJsonResponseLimited:async()=>({choices:[{message:{content:JSON.stringify({regions:[{text_box:[100,100,200,200],bubble_box:[80,80,230,230],source:'Iron Dragon',translation:language==='tr'?'Demir Ejderha':'Iron Dragon',kind:'speech',shape:'ellipse'}]})}}]}),
 readResponseBufferLimited:async()=>Buffer.alloc(0),extractJsonPayload:JSON.parse,
 requestBrowserSentenceTranslation:async(_input,config)=>{calls.push({language,textRoute:true,config});return{text:language==='tr'?'Demir Ejderha':'Iron Dragon'};},
 });
 vm.runInContext(section('function browserMangaTranslationConfig(', 'function safeTranslationEndpoint('),ctx);
 vm.runInContext(section('function stopBrowserManga(', 'const MAX_MANGA_IMAGE_BYTES'),ctx);
 vm.runInContext(section('async function requestMangaTranslationAtEndpoint(', 'function fatalMangaBatchError('),ctx);
 vm.runInContext(section('function fatalMangaBatchError(', 'function nearestMangaRegion('),ctx);
 vm.runInContext(section('async function startBrowserManga(', 'function retryFailedBrowserManga('),ctx);
 vm.runInContext(section("ipcMain.handle('browser:manga:start'", "ipcMain.handle('browser:manga:retrySelected'"),ctx);
 const dom=new JSDOM('<select id="browserProfileScope"><option selected>tab</option></select><div id="browserProfileStatus"></div>'),player={browserPageUrl:url,browserActiveTabId:'tab1',browserMangaBusy:false,browserMangaTranslated:0};
 const rc=vm.createContext({player,$:id=>dom.window.document.getElementById(id),browserTabState:()=>activeTab,effectiveBrowserProfile:()=>({values:{mangaTargetLanguage:activeTab.siteOverrides?.mangaTargetLanguage||'tr'}}),saveAppSettings:async()=>true,
  applyBrowserMangaState:e=>{if(e.translated!==undefined)player.browserMangaTranslated=e.translated;player.browserMangaBusy=e.state==='running';},setBrowserSignal:()=>{},logLine:()=>{},renderBrowserSiteProfile:()=>{},scheduleBrowserOverlaySync:()=>{},scheduleBrowserMediaPreferenceSync:()=>{},scheduleBrowserDarkModeSync:()=>{},
  window:{BrowserSiteProfiles:profiles,api:{clearBrowserManga:id=>handlers['browser:manga:clear']({authorized:true},{tabId:id}),startBrowserManga:async(id,payload)=>{const r=await handlers['browser:manga:start']({authorized:true},{...payload,tabId:id});player.browserMangaBusy=false;player.browserMangaTranslated=r.translated;return r;}}}});
 const rs=renderer.indexOf('async function handleBrowserMangaAction('),re=renderer.indexOf('function setBrowserSignalVisible(',rs);vm.runInContext(renderer.slice(rs,re),rc);
 const us=renderer.indexOf('async function updateBrowserProfileField('),ue=renderer.indexOf('async function loadBrowserPlaces(',us);vm.runInContext(renderer.slice(us,ue),rc);
 await rc.handleBrowserMangaAction({});const first={ok:player.browserMangaTranslated===2,translated:player.browserMangaTranslated};assert.equal(first.ok,true);
 const firstScope=site.siteTerminologyScope(url,'tr');assert.equal(places.siteTerminology[firstScope][0].target,'Demir Ejderha');
 const firstRequests=calls.length;let secondTab=tab;language=kind==='same-scope'?'tr':'en';
 if(kind==='new-origin')url='https://manga-b.invalid/chapter2';
 else url='https://manga-a.invalid/chapter2';
 if(kind==='new-tab'){secondTab={...tab,mangaTerminologyMap:undefined,mangaTerminologySeededScopes:undefined,mangaJob:null,mangaAttempted:new Set(),mangaPages:new Map()};}
 activeTab=secondTab;activeTab.id='tab1';player.browserPageUrl=url;
 await rc.updateBrowserProfileField('mangaTargetLanguage',language);
 assert.equal(activeTab.siteOverrides.mangaTargetLanguage,language);
 const mapBeforeClear=activeTab.mangaTerminologyMap;
 await rc.handleBrowserMangaAction({shiftKey:true});const second={ok:player.browserMangaTranslated===2,translated:player.browserMangaTranslated};assert.equal(second.ok,true);
 const secondScope=site.siteTerminologyScope(url,language),secondRequests=calls.slice(firstRequests);
 const promptLeak=secondRequests.some(c=>JSON.stringify(c).includes('Demir Ejderha'));
 assert.equal(promptLeak,!['new-tab','same-scope'].includes(kind));
 if(kind==='same-scope')assert.equal(secondRequests.length,0);
 const persisted=places.siteTerminology[secondScope]||[];
 if(kind!=='new-tab')assert.equal(persisted[0].target,'Demir Ejderha');
 const detail={kind,first,second,settingStatus:dom.window.document.getElementById('browserProfileStatus').textContent,realClearPreservedMap:mapBeforeClear===activeTab.mangaTerminologyMap,firstScope,secondScope,promptLeak,persisted,secondRequests,firstRequests,events:events.map(e=>({state:e.state,translated:e.translated}))};dom.window.close();return detail;
}
(async()=>{const scenarios=[];for(const k of ['new-language','new-origin','same-scope','new-tab'])scenarios.push(await scenario(k));fs.writeFileSync(path.join(out,'manga-result.json'),JSON.stringify({head:process.env.AUDIT833_HEAD||'1b211e4ed37f622dcc3e2144517590ae7aff9cee',scenarios,limits:'Actual unchanged startBrowserManga, translateMangaCandidate, request wrapper, endpoint body/parser, terminology seed/learn/persist; real prompt/region normalizers. Controlled image/candidate/native overlay/config/cache/HTTP response adapters. No external network, real model quality, or visible native UI.'},null,2));console.log(JSON.stringify({ok:true,scenarios:scenarios.length}));})().catch(e=>{console.error(e);process.exitCode=1;});
