'use strict';
// Actual production config/request functions, synthetic fetch boundary only.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
function fn(name,async=false){const start=source.indexOf(`${async?'async ':''}function ${name}(`);assert(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
let settings,capture;
const ctx={loadSettings:()=>settings,AbortController,setTimeout,clearTimeout,Buffer,
 safeTranslationEndpoint:base=>base+'/chat/completions',mangaGenerationParameters:()=>({}),resolveTranslationEndpoints:base=>[base],buildMangaPrompt:()=>'',
 extractJsonPayload:JSON.parse,normalizeMangaRegions:x=>x.regions,
 readJsonResponseLimited:async()=>({choices:[{message:{content:'{"regions":[]}'}}]}),
 fetch:async(url,options)=>{capture={url,authorization:options.headers.Authorization};return{ok:true};}};
vm.createContext(ctx);vm.runInContext([fn('browserTranslationConfig'),fn('browserMangaTranslationConfig'),fn('requestMangaTranslationAtEndpoint',true)].join('\n'),ctx);
(async()=>{
 for(const [preset,address,key,expected] of [['custom','https://manga.invalid/v1','',''],['custom','https://translate.invalid/other','',''],['custom','https://manga.invalid/v1','own-fixture','own-fixture'],['inherit','','','translate-fixture']]) {
  settings={translate:{endpointPreset:'https://translate.invalid/v1',apiKey:'translate-fixture'},manga:{endpointPreset:preset,customBaseUrl:address,apiKey:key},ui:{}};
  const config=ctx.browserMangaTranslationConfig();
  capture=null;
  const request=()=>ctx.requestMangaTranslationAtEndpoint({mimeType:'image/png',buffer:Buffer.from([0])},config,'fixture',undefined,config.endpoint);
  if(!expected){await assert.rejects(request,/API/);assert.equal(capture,null,'Missing own credential must stop before fetch');}
  else {await request();assert.equal(capture.authorization,'Bearer '+expected);}
 }
 console.log('manga-provider-isolation597: config to actual fetch authorization boundary passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
