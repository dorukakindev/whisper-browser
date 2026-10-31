'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const out=path.resolve(process.env.AUDIT822_OUT||path.join(root,'.uiprev/audit822-sidecars'));fs.mkdirSync(out,{recursive:true});
const {createRequire}=require('node:module');
const readAdjacentWordSegments=require(path.join(root,'src/subtitle-word-sidecar')).readAdjacentWordSegments;
const {decodeSubtitleBuffer}=require(path.join(root,'src/browser-textutil'));
let read;
const c={fs,require:createRequire(path.join(root,'src/main.js')),authorizedBrowserSender:()=>true,authorizeSubtitleFile:async file=>file,decodeSubtitleBuffer,readAdjacentWordSegments,loadHistory:()=>[],ipcMain:{handle:(name,handler)=>{read=handler;}}};
vm.createContext(c);
const mainSlice=main.slice(main.indexOf("ipcMain.handle('media:readSubtitle'"),main.indexOf('// Oynatıcıda düzeltilen altyazıyı',main.indexOf("ipcMain.handle('media:readSubtitle'")));
vm.runInContext(mainSlice,c);
const r={player:{wordHighlightEnabled:true,editing:false,subsHidden:false,activeWordIndex:-1},_hl:{},calls:[],setWordHighlight:(...args)=>r.calls.push(args),resetActiveWordHighlight:()=>r.calls.push(['reset'])};
vm.createContext(r);
vm.runInContext(renderer.slice(renderer.indexOf('function decodeSubtitleEntities('),renderer.indexOf('// Altyazi metnini kutulu bir span')),r);
vm.runInContext(renderer.slice(renderer.indexOf('function renderActiveCueWord('),renderer.indexOf('// Tek delege dinleyici:',renderer.indexOf('function renderActiveCueWord('))),r);
(async()=>{
 const results=[];
 for(const name of ['touching','near','separated']){
  const response=await read({},path.join(out,name+'.srt'));
  assert.equal(response.ok,true);
  const cues=r.parseSubtitles(response.text);
  const stats=r.attachTimedWordsToCues(cues,response.wordSegments);
  r.calls=[];
  for(let i=0;i<cues.length;i++)r.renderActiveCueWord(i,cues[i],i===0?.5:cues[i].start+.3,{firstChild:{firstChild:{nodeType:3}}});
  results.push({name,accepted:true,producerWords:JSON.parse(fs.readFileSync(path.join(out,name+'.json'))).segments.map(s=>s.words.map(w=>w.word)),stats,cues,highlightCalls:r.calls});
 }
 assert.equal(results[0].stats.matched,0);assert.equal(results[1].stats.matched,0);assert.equal(results[2].stats.matched,2);
 assert.deepEqual(results[0].highlightCalls,[['reset'],['reset']]);
 assert.equal(results[2].highlightCalls.filter(x=>x[0]==='active').length,2);
 const registry=JSON.parse(fs.readFileSync(path.join(root,'docs/audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json')));
 const reviewed=registry.scenarios.filter(x=>['F11','F16','F18','F48'].includes(x.family));
 fs.writeFileSync(path.join(out,'registry-reviewed.json'),JSON.stringify(reviewed,null,2));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({head:'b821da96edd7b10c6a5d2dcc03b353192394f5eb',cases:results,registryRows:reviewed.length,limits:['Synthetic timing/text input to real writers; no natural ASR quality claim.','Real media:readSubtitle handler with authorization and history stubs; renderer real parse/attach/render functions extracted unmodified.','No Electron launch, real video, live site, native CSS Highlight measurement, user settings or profile.']},null,2));
 console.log(JSON.stringify(results.map(x=>({name:x.name,stats:x.stats,highlightCalls:x.highlightCalls.map(y=>y[0])}))));
})().catch(e=>{console.error(e);process.exitCode=1;});
