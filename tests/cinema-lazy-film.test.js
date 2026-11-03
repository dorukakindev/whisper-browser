'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
for(const [name,file,apiName,mountName,event]of [['watch','film-watch-ui.js','FilmWatchUI','mount','fw-dispose'],['journal','media-daily-ui.js','MediaDailyUI','mountTitle','daily-dispose']]){
 test(name+' does not fetch or build the closed workspace; first open starts once, dispose cancels pending result',async()=>{
  const dom=new JSDOM('<section class="cn-film-page"><details><summary>Open</summary><div class="cn-advanced-body"></div></details><details class="film-decision-profile"><summary>Taste</summary></details></section>',{runScripts:'outside-only'}),w=dom.window,page=w.document.querySelector('section'),details=page.querySelector('details');page.open=true;let calls=0;const completions=[];
  w.api={mediaTools:()=>{calls++;return new Promise(resolve=>completions.push(resolve));}};
  try{w.eval(fs.readFileSync('src/renderer/'+file,'utf8'));const host=w[apiName][mountName](page,{id:'film-a'},{deferUntilOpen:true});details.querySelector('div').append(host);page.dispatchEvent(new w.Event('cinema-film-ready'));assert.equal(calls,0);assert.equal(host.querySelectorAll('input,select').length,0);
   details.open=true;details.dispatchEvent(new w.Event('toggle'));const firstOpenCalls=calls;assert(firstOpenCalls>0);details.dispatchEvent(new w.Event('toggle'));assert.equal(calls,firstOpenCalls);
   host.dispatchEvent(new w.Event(event));completions.forEach(complete=>complete({ok:false,error:'Controlled failure'}));await new Promise(r=>setImmediate(r));assert.equal(host.textContent.includes('Controlled failure'),false);
  }finally{dom.window.close();}
 });
}
