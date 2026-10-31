'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),out=path.resolve(process.env.AUDIT823_OUT||path.join(root,'.uiprev/audit823-memory-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const {registerBrowserFeatureServices}=require(path.join(root,'src/browser-feature-services'));
const callbacks=new Map(), tab={id:'synthetic-tab',generation:1,mediaId:'ep1',view:{webContents:{getURL:()=> 'https://series.example/watch/1',isDestroyed:()=>false}}};
const features=registerBrowserFeatureServices({app:{getPath:()=>out},ipcMain:{handle:(k,v)=>callbacks.set(k,v)},BrowserWindow:function(){},getTab:()=>tab,activeTab:()=>tab,context:t=>t,authorized:e=>e.authorized});
const call=(action,data={})=>callbacks.get('browser:extras')({authorized:true},{action,tabId:tab.id,generation:tab.generation,mediaId:tab.mediaId,...data});
const requests=[];
const start=main.indexOf('async function requestBrowserSentenceTranslationAtEndpoint('),end=main.indexOf('\nasync function requestBrowserSentenceTranslation(',start);
assert(start>=0&&end>start);
const translate=vm.runInNewContext(main.slice(start,end)+'\nrequestBrowserSentenceTranslationAtEndpoint',{
 require:n=>n==='./subtitle-sentence-layout'?require(path.join(root,'src/subtitle-sentence-layout')):require(n),AbortController,setTimeout,clearTimeout,Buffer,
 safeTranslationEndpoint:u=>u,browserGlossaryTruncationNotified:false,terminologyPrompt:()=>'',sendEvent(){},writeJobLog(){},readJsonResponseLimited:async r=>r.json(),
 fetch:async(url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);return new Response(JSON.stringify({choices:[{message:{content:'Kapit\u00e4n, warten Sie.'}}]}),{headers:{'Content-Type':'application/json'}});}
});
const injection=main.slice(main.indexOf('  try { config.seriesContext = browserExtras?.translationContext(tab)'),main.indexOf('  config.terminologyMap =',main.indexOf('  try { config.seriesContext = browserExtras?.translationContext(tab)')));
assert(injection.includes('config.glossary = [...config.seriesContext.terms, ...config.glossary]'));
const configStart=main.indexOf('function browserTranslationConfig(overrides = {}) {'), configEnd=main.indexOf('\nfunction browserMangaTranslationConfig(',configStart); assert(configStart>=0&&configEnd>configStart);
const makeConfig=vm.runInNewContext(main.slice(configStart,configEnd)+'\nbrowserTranslationConfig',{loadSettings:()=>({translate:{endpointPreset:'custom',customBaseUrl:'http://127.0.0.1:7654/v1/chat/completions',model:'synthetic'},ui:{translateTo:'tr'}}),require});
const ipcStart=main.indexOf("ipcMain.handle('browser:translation:start',"),ipcEnd=main.indexOf("\nipcMain.handle('browser:translation:displayed'",ipcStart);assert(ipcStart>=0&&ipcEnd>ipcStart);
let captured;vm.runInNewContext(main.slice(ipcStart,ipcEnd),{ipcMain:{handle:(k,v)=>captured=v},authorizedBrowserSender:e=>e.authorized,activeRequestedBrowserTab:()=>tab,startBrowserTranslation:(t,cues,opts)=>opts});
async function config(lang){const forwarded=await captured({authorized:true},{tabId:tab.id,targetLanguage:lang,sourceLanguage:'en',cues:[{start:0,end:2,text:'Captain, wait.'}]});const value=makeConfig(forwarded);vm.runInNewContext(injection,{config:value,browserExtras:features,tab,noteBrowserDiagnosticActivity(){}});return value;}
(async()=>{
 const selectedAtSave=await config('tr'); assert.equal(selectedAtSave.targetLanguage,'tr');
 const saved=await call('series-context:save',{seriesName:'SyntheticShow',profile:{terms:[{source:'Captain',target:'Kaptan'}]}});assert(saved.ok);
 const tr=await config('tr'),de=await config('de');
 await translate({text:'Captain, wait.',contextBefore:[],contextAfter:[]},tr,undefined,'http://127.0.0.1:7654/v1/chat/completions');
 await translate({text:'Captain, wait.',contextBefore:[],contextAfter:[]},de,undefined,'http://127.0.0.1:7654/v1/chat/completions');
 const review=await call('series-context:check',{cues:[{start:0,end:2,text:'Captain, wait.'}],translations:[{start:0,end:2,text:'Kapit\u00e4n, warten Sie.'}]});
 const trReview=await call('series-context:check',{cues:[{start:0,end:2,text:'Captain, wait.'}],translations:[{start:0,end:2,text:'Kaptan, bekleyin.'}]});
 const trPrompt=requests[0].messages[0].content,dePrompt=requests[1].messages[0].content;
 assert.equal(tr.targetLanguage,'tr');assert.equal(de.targetLanguage,'de');
 assert(trPrompt.includes('tr diline'));assert(dePrompt.includes('de diline'));assert(/Zorunlu s[^:]+: Captain=Kaptan/.test(dePrompt));assert.equal(review.issues.length,1);assert.equal(trReview.issues.length,0);
 const unauthorized=await callbacks.get('browser:extras')({authorized:false},{action:'series-context:get',tabId:tab.id});assert.equal(unauthorized.ok,false);
 tab.mediaId='unbound';assert.equal(features.translationContext(tab),null);tab.mediaId='ep1';
 const stored=JSON.parse(fs.readFileSync(path.join(out,'browser-series-context.json'),'utf8'));assert(!JSON.stringify(stored).includes('sourceLanguage'));assert(!JSON.stringify(stored).includes('targetLanguage'));
 const result={head:'ccc8927a03be4bd4fda91246e7f55d5ecfc2171a',candidate:'browser-series-profile-without-language-pair',saved:saved.ok,selectedAtSave:selectedAtSave.targetLanguage,selectedAtNextTranslation:de.targetLanguage,trGlossary:tr.glossary,deGlossary:de.glossary,trPrompt,dePrompt,germanReview:review,turkishControl:trReview,unauthorizedRejected:!unauthorized.ok,unboundControl:null,requestCount:requests.length,stored,limits:['Actual browser feature handler and series store; injected authorization/tab context and app path.','Actual main profile-injection slice and provider request function; fetch controlled, no HTTP or live model.','No native UI; returned German provider fixture is not model quality evidence.']};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,germanIssues:review.issues.length,turkishIssues:trReview.issues.length,requests:requests.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
