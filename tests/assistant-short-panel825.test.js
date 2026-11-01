'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function fixture(t){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/assistant-overlay.html'),'utf8'),{runScripts:'outside-only',url:'https://fixture.invalid'}),w=dom.window,packets=[];
 let publish;w.assistant={subscribe:fn=>publish=fn,action:(...packet)=>packets.push(packet)};
 w.eval(fs.readFileSync(path.join(root,'src/renderer/assistant-overlay.js'),'utf8'));t.after(()=>w.close());
 const base={opened:true,locale:'en',sourceToken:'source:A',conversation:'conversation:A',transcriptScope:false,messages:[{id:'a',role:'ai',text:'Controlled answer'}],suggestions:[{id:'first',label:'Summarize',direct:true},{id:'second',label:'Translate',review:'Translate the attached source?'},{id:'third',label:'Compare',direct:true}]};
 return {w,packets,$:id=>w.document.getElementById(id),publish:value=>publish({...base,...value})};
}
test('overflow suggestions retain commands, review, focus return and EN/TR disclosure names',t=>{
 const h=fixture(t);h.publish({});assert.equal(h.$('primarySuggestion').querySelectorAll('button').length,1);assert.equal(h.$('suggestionOptions').querySelectorAll('button').length,2);
 h.$('suggestionMenu').open=true;h.$('suggestionOptions').querySelector('button').click();assert(!h.$('review').hidden);assert(h.$('suggestionMenu').open===false);assert(!h.packets.some(p=>p[0]==='suggestion'));
 h.$('reviewCancel').click();assert.equal(h.w.document.activeElement.id,'suggestionMenuLabel');
 h.$('suggestionMenu').open=true;h.$('suggestionOptions').lastElementChild.click();assert.deepEqual(JSON.parse(JSON.stringify(h.packets.at(-1))),['suggestion','third',{sourceToken:'source:A'}]);
 h.publish({locale:'tr'});assert.equal(h.$('suggestionMenuLabel').textContent,'Diğer öneriler');h.publish({locale:'en'});assert.equal(h.$('suggestionMenuLabel').textContent,'More suggestions');
});
test('busy suggestions take no interaction state away from the preserved draft and reappear ready',t=>{
 const h=fixture(t);h.publish({});h.$('text').value='Keep my long draft';h.$('text').dispatchEvent(new h.w.Event('input'));h.$('suggestionMenu').open=true;
 h.publish({busy:true,canCancel:true});assert(h.$('suggestions').hidden);assert(!h.$('suggestionMenu').open);assert(!h.$('cancel').hidden);assert.equal(h.$('text').value,'Keep my long draft');
 h.publish({busy:false});assert(!h.$('suggestions').hidden);assert(!h.$('primarySuggestion').firstElementChild.disabled);assert.equal(h.$('text').value,'Keep my long draft');
});
test('source changes invalidate reviewed overflow actions while full source evidence remains available',t=>{
 const h=fixture(t);h.publish({sourcePreview:{summary:'Selected passage',detail:'Only this passage is attached'},sourceDescription:'The selected source evidence'});
 assert.equal(h.$('sourcePreviewFull').textContent,'Selected passage');assert.equal(h.$('sourcePreviewDetail').textContent,'Only this passage is attached');
 h.$('suggestionOptions').firstElementChild.click();h.publish({sourceToken:'source:B'});assert(h.$('review').hidden);h.$('reviewConfirm').click();assert(!h.packets.some(p=>p[0]==='suggestion'));
});
