(async()=>{
const { JSDOM } = require('jsdom'); const fs=require('fs'); const assert=require('assert');
const dom=new JSDOM('<body><div id="playerLayer"><video id="playerVideo"></video><div id="playerControls"><details id="playerMore"></details></div></div></body>',{runScripts:'outside-only',url:'https://x.invalid'});
const w=dom.window; w.UiLocale={get:()=>'tr'}; w.eval('var player={mediaKey:"k1",offset:0,workspaceMode:"player"};var offsetCalls=[];function nudgeOffset(d){player.offset=Math.round((player.offset+d)*100)/100;offsetCalls.push(d);}');
w.eval(fs.readFileSync(require('path').join(__dirname, '../src/renderer/player-pro.js'), 'utf8'));
const v=w.document.getElementById('playerVideo'); Object.defineProperty(v,'videoWidth',{value:1920});Object.defineProperty(v,'videoHeight',{value:1080});
assert(w.document.getElementById('playerProBtn'),'button');
w.PlayerPro.open('video'); assert(w.document.querySelector('.pp-panel'));
w.PlayerPro.set({brightness:20,contrast:10,gamma:30,zoom:1,fit:'16:9'});
assert(/brightness\(1\.200\)/.test(v.style.filter) && /url\(#ppFx\)/.test(v.style.filter),'filter '+v.style.filter);
assert(/scale\(2\.000\)/.test(v.style.transform),'transform '+v.style.transform);
assert(w.localStorage.getItem('pp.v.k1'),'remembered');
w.PlayerPro.reset(); assert(v.style.filter===''&&v.style.transform==='','reset clears'); assert(!w.localStorage.getItem('pp.v.k1'),'default not stored');
w.PlayerPro.set({saturation:-100}); w.eval('player.mediaKey="k2"'); v.dispatchEvent(new w.Event('loadedmetadata')); assert(v.style.filter==='','other media starts clean');
w.eval('player.mediaKey="k1"'); v.dispatchEvent(new w.Event('loadedmetadata')); assert(/saturate\(0\.000\)/.test(v.style.filter),'k1 restored: '+v.style.filter);
w.PlayerPro.open('sync'); [...w.document.querySelectorAll('.pp-btn')].find(b=>b.textContent==='+0.5').click(); assert(w.player.offset===0.5);
w.PlayerPro.open('info'); assert(w.document.querySelector('.pp-stats dt'),'stats');
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'z',bubbles:true})); assert(w.PlayerPro.state().fit==='cover','Z cycles fit');
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'x',bubbles:true})); assert(!w.document.querySelector('.pp-panel'),'X toggles');

let isNative=false;const commands=[];w.NativePlayerUI={active:()=>isNative,command:async(command,value)=>{commands.push({command,value});return {ok:true};},layout(){}};
w.PlayerPro.set({brightness:17,audioDelay:.25});isNative=true;v.dispatchEvent(new w.Event('loadedmetadata'));await new Promise(setImmediate);assert(commands.some(q=>q.command==='vprop'&&q.value.name==='brightness'&&q.value.value===17));assert(commands.some(q=>q.value.name==='audio-delay'&&q.value.value===.25));assert.equal(v.style.filter,'');isNative=false;w.document.dispatchEvent(new w.CustomEvent('native-player-state-changed',{detail:{key:'k1',generation:w.player.generation,active:false}}));assert.match(v.style.filter,/brightness\(1\.170\)/);
w.PlayerPro.set({zoom:Infinity,brightness:999,fit:'arbitrary'});assert.equal(w.PlayerPro.state().zoom,0);assert.equal(w.PlayerPro.state().brightness,100);assert.equal(w.PlayerPro.state().fit,'contain');
w.PlayerPro.open('video');assert(!w.document.querySelector('.pp-tabs .pp-close'));w.player.workspaceMode='browser';w.PlayerPro.workspaceChanged();assert(!w.document.querySelector('.pp-panel'));assert(w.document.getElementById('playerProBtn').disabled);w.PlayerPro.open('info');assert(!w.document.querySelector('.pp-panel'));
console.log('player-pro.test.js: OK');dom.window.close();


})().catch(error=>{console.error(error);process.exitCode=1;});
