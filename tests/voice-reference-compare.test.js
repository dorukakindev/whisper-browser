const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function fixture(t){
 const dom=new JSDOM('<body><div id="host"></div></body>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;let locale='en',used=[],loads=0;const pauses=[];
 w.UiLocale={get:()=>locale};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLMediaElement.prototype.load=function(){loads++;};w.HTMLMediaElement.prototype.pause=function(){pauses.push(this);};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/voice-reference-compare'),'utf8'));
 const component=w.VoiceReferenceCompare.mount(w.document.getElementById('host'),{onUse:async id=>{used.push(id);return {ok:true};}});
 const refs=[{id:'one',name:'Voice <A>',url:'file:///first.wav'},{id:'two',name:'Voice B',url:'file:///second.wav'}];
 return {w,component,refs,used,pauses,get loads(){return loads;},locale(value){locale=value;w.document.dispatchEvent(new w.Event('ui-locale-change'));}};
}
test('comparison selects two references without applying either and preserves playback on metadata refresh',async t=>{
 const f=fixture(t);f.component.update(f.refs,{selectedId:'two'});
 const selects=[...f.w.document.querySelectorAll('select')],audios=[...f.w.document.querySelectorAll('audio')];
 assert.deepEqual(selects.map(s=>s.value),['two','one']);assert.equal(f.used.length,0);assert.equal(f.w.document.querySelectorAll('option b').length,0);
 const loaded=f.loads;audios[0].currentTime=2;f.component.update(f.refs);assert.equal(f.loads,loaded);assert.equal(audios[0].currentTime,2);
 audios[0].dispatchEvent(new f.w.Event('play'));assert.equal(f.pauses.at(-1),audios[1]);
 f.w.document.querySelector('.reference-ab-card button').click();await new Promise(setImmediate);assert.deepEqual(f.used,['two']);assert.match(f.w.document.querySelector('.reference-ab-notice').textContent,/Voice selected/);
 f.locale('tr');assert.match(f.w.document.querySelector('.reference-ab h2').textContent,/İki referans/);assert.equal(audios[0].currentTime,2);
});
test('production locks selection/use and removed references cannot stay attached to an audio source',async t=>{
 const f=fixture(t);f.component.update(f.refs,{busy:true});
 assert([...f.w.document.querySelectorAll('.reference-ab-card select,.reference-ab-card button')].every(n=>n.disabled));
 f.w.document.querySelector('.reference-ab-card button').click();assert.equal(f.used.length,0);
 f.component.update([]);assert([...f.w.document.querySelectorAll('audio')].every(a=>a.hidden&&!a.getAttribute('src')));
 assert([...f.w.document.querySelectorAll('.reference-ab-card button')].every(b=>b.disabled));
 f.component.dispose();assert.equal(f.w.document.querySelector('.reference-ab'),null);
});
