const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8');
const health=new Function(source.slice(source.indexOf('function browserSubtitleHealth('),source.indexOf('function renderBrowserVideoSubtitles('))+';return browserSubtitleHealth;')();
const base={url:'https://video.test',capture:true,mode:'both',cues:0,tracks:0};
for(const [input,state,action] of [[{},'searching',''],[{searchDone:true},'missing','file'],[{capture:false},'paused','capture'],[{tracks:2},'language','select'],[{tracks:2,targetAvailable:true},'select','select'],[{ceaAvailable:true,ceaState:'ready'},'capture-ready','capture-full'],[{ceaAvailable:true,ceaState:'running',ceaMessage:'906 segment getiriliyor.'},'capture-running',''],[{ceaAvailable:true,ceaState:'partial'},'capture-partial','capture-full'],[{ceaAvailable:true,ceaState:'complete',translationError:'Canlı web çevirisi için seçili sağlayıcının API anahtarı girilmemiş.'},'translation-error','translation-settings'],[{ceaAvailable:true,ceaState:'complete',translationError:'Geçici sağlayıcı hatası.'},'translation-error','translate'],[{ceaAvailable:true,ceaState:'complete',translationError:'Ağ zaman aşımı.'},'translation-error','translate'],[{ceaAvailable:true,ceaState:'complete',directTranslate:true,ceaCueCount:560},'translation-ready','translate'],[{ceaAvailable:true,ceaState:'complete',directTranslate:true,ceaCueCount:560,cues:560},'translation-ready','translate'],[{ceaAvailable:true,ceaState:'complete',cues:12},'ready',''],[{cues:12},'ready',''],[{cues:12,mode:'off'},'hidden','show'],[{busy:true},'translating',''],[{busy:true,online:false},'offline',''],[{failed:2},'translation-error','retry'],[{fileError:true},'file-error','locate'],[{saveError:true},'save-error','save']]){const result=health({...base,...input});assert.equal(result.state,state);assert.equal(result.action,action);}
assert.match(source,/case 'capture-full': await toggleBrowserCeaFullCapture\(\)/);
assert.match(source,/case 'translate': await translateBrowserSubtitleFromHealth\(\)/);
assert.match(source,/case 'translation-settings': toggleDrawerAt\(null, '#translateApiKey'\)/);
const translationReady=health({...base,ceaAvailable:true,ceaState:'complete',directTranslate:true,ceaCueCount:560});
assert.equal(translationReady.label,'Çevir ve göster');assert.match(translationReady.text,/560 satırlık kaynak altyazı hazır/);
assert.equal(health({...base,translationError:'Geçici sağlayıcı hatası.'}).dismissible,true);
assert.notEqual(health({...base,failed:2}).dismissible,true,'başarısız blok sayacı hata metni gibi kapatılmamalı');
assert.match(html,/id="browserSubtitleHealthClear"/);
assert.match(source,/clearBrowserTranslationError\(\{ announce: true \}\)/);
console.log('Subtitle health: distinct states and actionable recovery passed.');

const vm=require('node:vm');let callback, notices=0;
const ctx={player:{workspaceMode:'browser',browserPageUrl:'https://video.test',browserTracks:[],cues:[{text:'Manuel'}],cues2:[]},clearTimeout(){},setTimeout(fn){callback=fn;return 1},browserTabState:()=>({loading:false}),setBrowserSignal(){notices++}};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function scheduleBrowserNoTrackSuggestion('),source.indexOf('async function toggleBrowserTabPinned(')),ctx);
ctx.scheduleBrowserNoTrackSuggestion('https://video.test');callback();assert.equal(notices,0,'Manuel altyazı açıkken bulunamadı bildirimi çıkmamalı');
ctx.player.cues=[];callback();assert.equal(notices,1);

let healthRenders=0;const tabError={browserTranslationLastError:'old'};const clearSignals=[];
const clearCtx={player:{browserTranslationLastError:'API anahtarı girilmemiş.'},browserTabState:()=>tabError,renderBrowserSubtitleHealth:()=>{healthRenders++;},setBrowserSignal:(...args)=>clearSignals.push(args)};
vm.createContext(clearCtx);vm.runInContext(source.slice(source.indexOf('function clearBrowserTranslationError('),source.indexOf('async function saveTranslationProviderSettings(')),clearCtx);
clearCtx.clearBrowserTranslationConfigError();assert.equal(clearCtx.player.browserTranslationLastError,'');assert.equal(tabError.browserTranslationLastError,'');assert.equal(healthRenders,1);
clearCtx.player.browserTranslationLastError='Ağ zaman aşımı.';clearCtx.clearBrowserTranslationConfigError();assert.equal(clearCtx.player.browserTranslationLastError,'Ağ zaman aşımı.');
clearCtx.clearBrowserTranslationError({announce:true});assert.equal(clearCtx.player.browserTranslationLastError,'');assert.equal(tabError.browserTranslationLastError,'');assert.equal(clearSignals.length,1);assert.match(clearSignals[0][0],/temizlendi/);
const clearTracks=source.slice(source.indexOf('function clearBrowserTracks('),source.indexOf('function renderBrowserResources('));
assert.match(clearTracks,/player\.browserTranslationLastError = ''/);assert.match(clearTracks,/tab\.browserTranslationLastError = ''/);
const restore=source.slice(source.indexOf('function restoreActiveBrowserTabWorkspace('),source.indexOf('function syncBrowserTabs('));
assert.match(restore,/player\.browserTranslationLastError = String\(tab\.browserTranslationLastError \|\| ''\)/);
