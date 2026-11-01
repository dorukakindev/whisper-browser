'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const ROOT=path.resolve(__dirname,'../../../..'),OUT=process.env.AUDIT833_OUT||path.join(ROOT,'.uiprev/audit833-browser-probe-'+Date.now());fs.mkdirSync(OUT,{recursive:true});
const main=fs.readFileSync(path.join(ROOT,'src/main.js'),'utf8');
function section(a,b){const i=main.indexOf(a),j=main.indexOf(b,i);assert(i>=0&&j>i,a);return main.slice(i,j);}
const hints=require(path.join(ROOT,'src/browser-link-hints'));
const terminology=require(path.join(ROOT,'src/browser-terminology'));
const sites=require(path.join(ROOT,'src/browser-site-terminology'));
const manga=require(path.join(ROOT,'src/browser-manga'));
const result={head:process.env.AUDIT833_HEAD||'1b211e4ed37f622dcc3e2144517590ae7aff9cee',limits:'JSDOM actual generated hints with fixture geometry; VM unchanged main functions, real terminology and prompt. No native site, model quality or HTTP request.',hints:[],terminology:[]};
const rect={x:10,y:10,left:10,top:10,right:110,bottom:40,width:100,height:30};
async function hintScenario(type){
 const html=type==='button'?'<button id="target">Go</button>':type==='text'?'<input id="target" type="text">':type==='submit'?'<form><input id="target" type="submit"></form>':`<input id="target" type="${type}">`;
 const dom=new JSDOM('<style>*{opacity:1}</style>'+html,{url:'https://fixture.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,el=w.document.getElementById('target');el.getBoundingClientRect=()=>rect;
 let clicks=0,changes=0,submits=0;el.addEventListener('click',()=>clicks++);el.addEventListener('change',()=>changes++);w.document.querySelector('form')?.addEventListener('submit',e=>{submits++;e.preventDefault();});
 const install=w.eval(hints.buildBrowserLinkHintsScript({session:'fixture-session',prefix:'a'}));assert.equal(install.count,1);
 const code=w.document.querySelector('[data-whisper-link-hints] span').textContent.toLowerCase();
 for(const key of code){w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,5));}
 const afterHint={clicks,changes,submits,checked:el.checked,focused:w.document.activeElement===el,layer:!!w.document.querySelector('[data-whisper-link-hints]')};
 if(['checkbox','radio','submit'].includes(type)){assert.equal(clicks,0);assert.equal(changes,0);assert.equal(submits,0);el.click();assert.equal(clicks,1);if(type!=='submit')assert.equal(el.checked,true);else assert.equal(submits,1);}
 else if(type==='button')assert.equal(clicks,1);else assert.equal(afterHint.focused,true);
 result.hints.push({type,code,install,afterHint,afterNativeClickControl:{clicks,changes,submits,checked:el.checked}});w.close();
}
function mangaScenario(kind){
 let url='https://manga-a.invalid/chapter/1';let places={siteTerminology:{}};
 const ctx=vm.createContext({console,URL,Map,Set,Buffer,AbortController,Date,Math,Number,String,Object,Array,JSON,...terminology,...sites,
  browserPageUrl:()=>url,readBrowserPlaces:()=>structuredClone(places),setBrowserPlaces:p=>{places=structuredClone(p);return true;}});
 vm.runInContext(section('function mangaTerminologySeed(', 'async function translateMangaCandidate('),ctx);
 const tab={id:'tab1',generation:1};
 const first=ctx.mangaTerminologySeed(tab,{targetLanguage:'tr'});const job={terminologyMap:first};
 const regions=[{source:'Iron Dragon',translation:'Demir Ejderha'}];
 ctx.mangaLearnRegions(job,regions,'page1');ctx.mangaLearnRegions(job,regions,'page2');
 ctx.persistMangaSiteTerminology(tab,{targetLanguage:'tr'});
 const oldScope=sites.siteTerminologyScope(url,'tr');assert.equal(places.siteTerminology[oldScope][0].target,'Demir Ejderha');
 let nextTab=tab,targetLanguage='en';
 if(kind==='same-scope'){url='https://manga-a.invalid/chapter/2';targetLanguage='tr';}
 if(kind==='new-origin')url='https://manga-b.invalid/chapter/1';
 if(kind==='new-tab')nextTab={id:'tab2',generation:1};
 const second=ctx.mangaTerminologySeed(nextTab,{targetLanguage});
 const text=terminology.terminologyPrompt(second);
 const prompt=manga.buildMangaPrompt({targetLanguage,terminologyText:text,pageTitle:'Synthetic manga'});
 ctx.persistMangaSiteTerminology(nextTab,{targetLanguage});
 const nextScope=sites.siteTerminologyScope(url,targetLanguage);
 const leaked=text.includes('Demir Ejderha');assert.equal(leaked,kind!=='new-tab');
 if(kind!=='new-tab')assert.equal(places.siteTerminology[nextScope][0].target,'Demir Ejderha');
 assert.equal(prompt.includes('Demir Ejderha'),leaked);
 result.terminology.push({kind,targetLanguage,oldScope,nextScope,sameMap:first===second,terminologyText:text,promptHasTurkishTarget:prompt.includes('Demir Ejderha'),persistedNextScope:places.siteTerminology[nextScope]||[],prompt});
}
(async()=>{for(const type of ['checkbox','radio','submit','button','text'])await hintScenario(type);for(const k of ['new-language','new-origin','same-scope','new-tab'])mangaScenario(k);fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,hints:result.hints.length,terminology:result.terminology.length}));})().catch(e=>{console.error(e);process.exitCode=1;});
