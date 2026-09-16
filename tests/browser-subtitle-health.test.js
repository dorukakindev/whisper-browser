const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
const health=new Function(source.slice(source.indexOf('function browserSubtitleHealth('),source.indexOf('function renderBrowserVideoSubtitles('))+';return browserSubtitleHealth;')();
const base={url:'https://video.test',capture:true,mode:'both',cues:0,tracks:0};
for(const [input,state,action] of [[{},'searching',''],[{searchDone:true},'missing','file'],[{capture:false},'paused','capture'],[{tracks:2},'language','select'],[{tracks:2,targetAvailable:true},'select','select'],[{ceaAvailable:true,ceaState:'ready'},'capture-ready','capture-full'],[{ceaAvailable:true,ceaState:'running',ceaMessage:'906 segment getiriliyor.'},'capture-running',''],[{ceaAvailable:true,ceaState:'partial'},'capture-partial','capture-full'],[{ceaAvailable:true,ceaState:'complete',cues:12},'ready',''],[{cues:12},'ready',''],[{cues:12,mode:'off'},'hidden','show'],[{busy:true},'translating',''],[{busy:true,online:false},'offline',''],[{failed:2},'translation-error','retry'],[{fileError:true},'file-error','locate'],[{saveError:true},'save-error','save']]){const result=health({...base,...input});assert.equal(result.state,state);assert.equal(result.action,action);}
assert.match(source,/case 'capture-full': await toggleBrowserCeaFullCapture\(\)/);
console.log('Subtitle health: distinct states and actionable recovery passed.');

const vm=require('node:vm');let callback, notices=0;
const ctx={player:{workspaceMode:'browser',browserPageUrl:'https://video.test',browserTracks:[],cues:[{text:'Manuel'}],cues2:[]},clearTimeout(){},setTimeout(fn){callback=fn;return 1},browserTabState:()=>({loading:false}),setBrowserSignal(){notices++}};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function scheduleBrowserNoTrackSuggestion('),source.indexOf('async function toggleBrowserTabPinned(')),ctx);
ctx.scheduleBrowserNoTrackSuggestion('https://video.test');callback();assert.equal(notices,0,'Manuel altyazı açıkken bulunamadı bildirimi çıkmamalı');
ctx.player.cues=[];callback();assert.equal(notices,1);
