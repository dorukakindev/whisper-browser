'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function ui(t,locale='tr'){
 const dom=new JSDOM('<body></body>',{url:'https://fixture.example/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.UiLocale={get:()=>locale};w.syncBrowserOcclusion=()=>{};w.MediaSearchModel=require('../src/renderer/media-search-model');
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.api={mediaCatalog:async()=>({ok:true,items:[]}),mediaShelf:async()=>({ok:true,books:[],music:[]}),listWatchLibrary:async()=>[],searchWatchLibrary:async()=>[],mediaDiscovery:async()=>({ok:false,error:'Unauthorized request.',errorCode:'unauthorized'})};
 const helper=path.join(__dirname,'../src/renderer/media-discovery-errors.js');if(fs.existsSync(helper))w.eval(fs.readFileSync(helper,'utf8'));
 w.eval(fs.readFileSync(require.resolve('../src/renderer/media-search-ui'),'utf8'));return w;
}
test('remote add errors show actionable Turkish instead of raw authorization diagnostics',async t=>{
 const w=ui(t);w.api.mediaDiscovery=async r=>r.action==='list'?{ok:true,rows:r.kind==='film'?[{kind:'film',providerId:'tt1234567',title:'Witness'}]:[]}:{ok:false,error:'Unauthorized request.',errorCode:'unauthorized'};
 await w.MediaSearchUI.open('Witness');await w.document.querySelector('.mhs-dialog>.mh-action').onclick();
 await w.document.querySelector('.mhs-remote .mhs-row').onclick();const status=w.document.querySelector('.mh-status').textContent;
 assert.match(status,/izin|yetki/i);assert(!status.includes('Unauthorized'));assert.match(status,/yeniden|aç/i);
});
test('both online failures explain failure and allow retry instead of implying partial success',async t=>{
 const w=ui(t);await w.MediaSearchUI.open('Witness');const button=w.document.querySelector('.mhs-dialog>.mh-action');await button.onclick();
 const status=w.document.querySelector('.mh-status').textContent;assert.match(status,/Çevrimiçi arama tamamlanamadı/);assert(!status.includes('eşleşme yok'));assert.equal(button.disabled,false);
 w.api.mediaDiscovery=async()=>({ok:true,rows:[]});await button.onclick();assert.match(w.document.querySelector('.mh-status').textContent,/eşleşme yok/);
});
test('one failed source identifies a partial result and preserves successful film matches',async t=>{
 const w=ui(t);w.api.mediaDiscovery=async r=>r.kind==='film'?{ok:true,rows:[{title:'Witness',kind:'film',providerId:'tt1234567'}]}:{ok:false,error:'Discovery HTTP 503',errorCode:'unavailable'};
 await w.MediaSearchUI.open('Witness');await w.document.querySelector('.mhs-dialog>.mh-action').onclick();
 assert.equal(w.document.querySelectorAll('.mhs-remote .mhs-row').length,1);assert.match(w.document.querySelector('.mh-status').textContent,/dizi.*alınamadı/i);assert.match(w.document.querySelector('.mh-status').textContent,/1/);
});
test('main discovery failures include stable codes while preserving its legacy diagnostic field',async()=>{
 let handler;const {registerMediaDiscovery}=require('../src/media-discovery-service');
 registerMediaDiscovery({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:e=>e.allowed,catalogStore:()=>({list:()=>[]}),fetchImpl:async()=>new Response('busy',{status:429})});
 assert.equal((await handler({allowed:false},{action:'list'})).errorCode,'unauthorized');
 const invalid=await handler({allowed:true},{action:'list',skip:-1});assert.equal(invalid.errorCode,'invalid_filter');
 const limited=await handler({allowed:true},{action:'list'});assert.equal(limited.errorCode,'rate_limit');assert.match(limited.error,/limit/);
});
test('HTTP, timeout, network and invalid-filter failures preserve codes and offer EN/TR recovery guidance',async()=>{
 const errors=require('../src/renderer/media-discovery-errors');const {registerMediaDiscovery}=require('../src/media-discovery-service');
 for(const [kind,expected] of [['http503','unavailable'],['timeout','timeout'],['network','network'],['json','invalid_data']]){
  let handler;registerMediaDiscovery({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:()=>true,catalogStore:()=>({list:()=>[]}),fetchImpl:async()=>{
   if(kind==='timeout')throw Object.assign(Error('fixture expired'),{name:'TimeoutError'});
   if(kind==='network')throw TypeError('fetch failed');
   return new Response(kind==='json'?'not JSON':'private upstream diagnostic',{status:kind==='http503'?503:200});
  }});
  const result=await handler({},{action:'list'});assert.equal(result.errorCode,expected);
  for(const locale of ['tr','en']){const text=errors.message(result,locale);assert.match(text,locale==='tr'?/yeniden|kontrol/i:/try again|check/i);assert(!text.includes('private'));assert(!text.includes('fixture'));}
  for(const query of [{skip:-1},{mode:'year',year:1800},{genre:'unknown genre'}])assert.equal((await handler({},{action:'list',...query})).errorCode,'invalid_filter');
 }
 assert(!errors.message({errorCode:'__proto__',error:'https://private.example/token-secret'},'tr').includes('private'));
});
test('rejected late search errors cannot overwrite a new local query',async t=>{
 const w=ui(t),waiting=[];w.api.mediaDiscovery=()=>new Promise((_resolve,reject)=>waiting.push(reject));
 await w.MediaSearchUI.open('Witness');const pending=w.document.querySelector('.mhs-dialog>.mh-action').onclick();
 const input=w.document.querySelector('input');input.value='Changed';input.dispatchEvent(new w.Event('input'));
 for(const reject of waiting)reject(Error('late private error'));await pending;
 assert.equal(w.document.querySelector('.mhs-remote').textContent,'');assert(!w.document.querySelector('.mh-status').textContent.includes('late private'));
});
