'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
async function setup(t){
 const dom=new JSDOM('<button id="mediaCatalogOpen"></button><dialog id="mediaCatalogDialog"><div id="mediaCatalogRoot"></div></dialog>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 const rows=[{id:'old',kind:'film',title:'Zulu',year:2000,watchStatus:'unspecified'},{id:'watching',kind:'film',title:'Alpha',year:2023,watchStatus:'watching'},{id:'done',kind:'film',title:'Beta',year:2010,watchStatus:'completed'}],writes=[];
 w.IntersectionObserver=class{observe(){}unobserve(){}};w.WhisperTextFold={search:v=>String(v).toLowerCase()};w.UiLocale={get:()=> 'tr'};
 w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.getAnimations=()=>[];
 for(const [name,state]of [['showPopover','open'],['hidePopover','closed']])w.HTMLElement.prototype[name]=function(){const event=new w.Event('toggle');Object.defineProperty(event,'newState',{value:state});this.dispatchEvent(event);};
 w.document.querySelector('dialog').showModal=function(){this.open=true;};w.document.querySelector('dialog').close=function(){this.open=false;};
 w.api={mediaCatalog:async request=>{if(request.action==='save'){writes.push(request.item);Object.assign(rows.find(r=>r.id===request.item.id),request.item);}return {ok:true,items:rows};}};
 for(const file of ['../src/renderer/player-ui-kit','../src/catalog-conditions','../src/renderer/media-catalog'])w.eval(fs.readFileSync(require.resolve(file),'utf8'));
 await w.MediaCatalogUI.open();return {w,root:w.document.getElementById('mediaCatalogRoot'),writes};
}
test('approved catalog controls use existing watch state without resetting watching or completed',async t=>{
 const {w,root,writes}=await setup(t);
 assert.equal(root.querySelector('.mc-brand h2').textContent,'Film ve dizi kataloğu');
 assert.equal(root.querySelector('.mc-eyebrow').textContent,'FİLMLER VE DİZİLER');
 assert.equal(root.querySelector('.mc-close').getAttribute('aria-label'),'Kapat');
 assert.equal(root.querySelector('.mc-nav-count').textContent,'1');
 assert.equal(root.querySelectorAll('.mc-quick-filters .mk-picker').length,3);
 assert.equal(root.querySelector('.mc-result-count').textContent,'3 film');
 const cards=[...root.querySelectorAll('.mc-card')];
 assert.equal(cards[1].querySelector('.mc-card-save').disabled,true);assert.equal(cards[2].querySelector('.mc-card-save').disabled,true);
 cards[0].querySelector('.mc-card-save').click();await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(JSON.parse(JSON.stringify(writes)),[{id:'old',watchStatus:'planned'}]);
 const choose=label=>{root.querySelector('.mc-sort .mk-picker-trigger').click();const option=[...root.querySelectorAll('.mc-sort [role=option]')].find(n=>n.textContent.includes(label));assert.ok(option);option.click();};
 choose('Yıla göre');assert.deepEqual([...root.querySelectorAll('.mc-card-title')].map(n=>n.textContent),['Alpha','Beta','Zulu']);
 choose('Son eklenen');assert.deepEqual([...root.querySelectorAll('.mc-card-title')].map(n=>n.textContent),['Beta','Alpha','Zulu']);
 choose('Ada göre');
 assert.deepEqual([...root.querySelectorAll('.mc-card-title')].map(n=>n.textContent),['Alpha','Beta','Zulu']);
});
