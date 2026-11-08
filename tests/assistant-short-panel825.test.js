'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function fixture(t){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/assistant-overlay.html'),'utf8'),{runScripts:'outside-only',url:'https://fixture.invalid'}),w=dom.window,packets=[];
 let publish;w.assistant={subscribe:fn=>publish=fn,action:(...packet)=>packets.push(packet)};
 w.eval(fs.readFileSync(path.join(root,'src/renderer/assistant-overlay.js'),'utf8'));t.after(()=>w.close());
 const base={opened:true,locale:'en',sourceToken:'source:A',conversation:'conversation:A',transcriptScope:false,messages:[{id:'a',role:'ai',text:'Controlled answer'}],suggestions:[{id:'first',label:'Summarize',direct:true},{id:'second',label:'Translate',review:'Translate the attached source?'},{id:'third',label:'Compare',direct:true},{id:'fourth',label:'Explain',direct:true},{id:'fifth',label:'Search',direct:true}]};
 return {w,packets,$:id=>w.document.getElementById(id),publish:value=>publish({...base,...value})};
}
test('overflow suggestions retain commands, review, focus return and EN/TR disclosure names',t=>{
 const h=fixture(t);h.publish({});assert.equal(h.$('primarySuggestion').querySelectorAll('button').length,1);assert.equal(h.$('suggestionOptions').querySelectorAll('button').length,4);
 h.$('suggestionMenu').open=true;h.$('suggestionOptions').querySelector('button').click();assert(!h.$('review').hidden);assert(h.$('suggestionMenu').open===false);assert(!h.packets.some(p=>p[0]==='suggestion'));
 h.$('reviewCancel').click();assert.equal(h.w.document.activeElement.id,'suggestionMenuLabel');
 h.$('suggestionMenu').open=true;[...h.$('suggestionOptions').querySelectorAll('button')].find(b=>b.textContent==='Compare').click();assert.deepEqual(JSON.parse(JSON.stringify(h.packets.at(-1))),['suggestion','third',{sourceToken:'source:A'}]);
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

test('Up to four context suggestions are all visible as chips, each running its own command; the menu appears only beyond that',t=>{
 const h=fixture(t);h.publish({suggestions:[{id:'first',label:'Summarize so far',direct:true},{id:'second',label:'Explain this sentence',direct:true},{id:'third',label:'Find this phrase in my podcasts',direct:true}]});
 assert.equal(h.$('primarySuggestion').querySelectorAll('button').length,3);assert.equal(h.$('suggestionOptions').querySelectorAll('button').length,0);assert.equal(h.$('suggestionMenu').hidden,true);
 h.$('primarySuggestion').querySelectorAll('button')[2].click();assert.deepEqual(JSON.parse(JSON.stringify(h.packets.at(-1))),['suggestion','third',{sourceToken:'source:A'}]);
 h.publish({locale:'tr'});assert.equal(h.$('scopeLabel').textContent,'Bağlam kapsamı');h.publish({locale:'en'});assert.equal(h.$('scopeLabel').textContent,'Context scope');
});
test('Every action card carries a status that follows its real result',t=>{
 const h=fixture(t),card=value=>{h.publish({messages:[{id:'a',role:'ai',text:'Answer',status:'complete',actions:[{id:'p1',kind:'app_action',label:'Open the passage',...value}]}]});return h.w.document.querySelector('.tool-card');};
 for(const [value,status,text] of [[{},'pending',/Waiting for your approval/],[{resultStatus:'completed'},'completed',/Applied/],[{resultStatus:'failed'},'failed',/Failed/],[{resultStatus:'failed',refreshable:true},'failed',/Source or settings changed/],[{resultStatus:'stopped'},'stopped',/Stopped/]]){const c=card(value);assert.equal(c.dataset.status,status);assert.match(c.querySelector('.tool-status').textContent,text);}
});

test('Podcast scope is visible, localized and explains the frozen heard boundary; non-transcript sources leave no orphan scope label',t=>{
 const h=fixture(t);h.publish({locale:'tr',transcriptScope:true,sourceTarget:{kind:'podcast'},scope:'watched'});
 assert.equal(h.$('tools').hidden,false);assert.equal(h.$('scope').selectedOptions[0].textContent,'Bu ana kadar dinlenen');assert.match(h.$('scopeHint').textContent,/soru anına kadar biten/);assert.equal(h.$('sourceLabel').textContent,'Podcast metni ve model');
 h.$('scope').value='nearby';h.$('scope').dispatchEvent(new h.w.Event('change'));assert.equal(h.packets.at(-1)[0],'scope');assert.equal(h.packets.at(-1)[1],'nearby');
 h.publish({locale:'en',transcriptScope:true,sourceTarget:{kind:'podcast'},scope:'full'});assert.equal(h.$('scope').selectedOptions[0].textContent,'Saved transcript');assert.match(h.$('scopeHint').textContent,/may be shortened/);
 h.publish({transcriptScope:false});assert.equal(h.$('tools').hidden,true);
});


test('source disclosure presents the actual passage before model configuration and keeps user markup as text',t=>{
 const h=fixture(t),passage='<img src=x onerror=bad()> A real selected passage';h.publish({sourceDescription:passage});
 const content=h.$('sourceBox').querySelector('.source-detail-content');assert.equal(content.firstElementChild.className,'source-detail-description');assert.equal(h.$('sourceDescription').textContent,passage);assert.equal(h.$('sourceDescription').querySelector('img'),null);assert(content.contains(h.$('assistantSettings')));
});
