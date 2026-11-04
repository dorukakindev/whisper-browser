const test=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body><div id="root"></div>',{pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.Node=dom.window.Node;
dom.window.HTMLElement.prototype.showPopover=function(){this.dataset.open='true';};dom.window.HTMLElement.prototype.hidePopover=function(){this.dataset.open='false';};
const Kit=require('../src/renderer/player-ui-kit');
test('known citations are controls; model HTML remains text and Unicode is preserved',()=>{
 const root=document.getElementById('root');let sought=0;
 root.replaceChildren(Kit.richText('**Birinci cümle:** Fener Mektupları [T1] <img src=x onerror=alert(1)>',{citations:new Map([['T1',()=>Kit.h('button',{text:'T1',on:{click:()=>sought++}})]])}));
 assert.equal(root.querySelector('strong').textContent,'Birinci cümle:');assert.equal(root.querySelector('img'),null);
 assert.match(root.textContent,/Fener Mektupları/);assert.doesNotMatch(root.textContent,/\*\*|MektuplarÄ/);
 root.querySelector('button').click();assert.equal(sought,1);
});
test('search picker retains source identity, keyboard escape and change events',()=>{
 const seen=[];const picker=Kit.select({label:'Yönetmen',value:'person:1',options:[{value:'person:1',label:'Celine Song'},{value:'person:2',label:'Wong Kar-wai'}],searchable:true,onChange:value=>seen.push(value)});document.body.append(picker);
 picker.trigger.click();const search=picker.querySelector('input');search.value='Wong';search.dispatchEvent(new dom.window.Event('input'));
 assert.equal(picker.querySelectorAll('[role=option]').length,1);picker.querySelector('[role=option]').click();assert.equal(picker.value,'person:2');assert.deepEqual(seen,['person:2']);
 picker.trigger.click();picker.querySelector('[popover]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(document.activeElement,picker.trigger);
});
test('display titles preserve Turkish dotted and dotless letters without changing stored names',()=>{
 const originals=['sintel-trailer.mp4','kıyı-mektupları.mp4','istanbul_ışığı.MKV','İzmir...ıhlamur.mp4'];
 assert.deepEqual(originals.map(Kit.displayTitle),['Sintel Trailer','Kıyı Mektupları','İstanbul Işığı','İzmir Ihlamur']);
 assert.equal(originals[1],'kıyı-mektupları.mp4');
 assert.equal(Kit.languageName('tr'),'Türkçe');
});
