'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture(reduced = false, tokens = {}) {
  const events = {}, preference = { matches: reduced, addEventListener: (_, fn) => events.change = fn };
  const window = { matchMedia: () => preference, addEventListener: (name, fn) => events[name] = fn };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/ui-motion.js'), 'utf8'), {
    window, getComputedStyle: () => ({ opacity: '.82', translate: '0px 2px', getPropertyValue: name => tokens[name] || '' }),
  });
  const animations = [];
  const node = { isConnected: true, animate(frames, options) {
    let resolve;
    const animation = { frames, options, cancelled: false, finished: new Promise(r => resolve = r),
      cancel() { this.cancelled = true; resolve(); }, finish: () => resolve() };
    animations.push(animation); return animation;
  } };
  return { api: window.UiMotion, preference, events, node, animations };
}
test('rapid navigation replaces motion without leaving a stale animation in control', async () => {
  const f = fixture(); f.api.reveal(f.node); f.api.reveal(f.node);
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.animations[1].frames[0].opacity, '.82');
  await Promise.resolve();
  f.api.stop(f.node);
  assert.equal(f.animations[1].cancelled, true);
});
test('reduced motion skips animation and changing preference cancels existing motion', () => {
  const f = fixture(true); f.api.reveal(f.node); assert.equal(f.animations.length, 0);
  f.preference.matches = false; f.api.reveal(f.node);
  f.preference.matches = true; f.events.change();
  assert.equal(f.animations[0].cancelled, true);
});
test('detached content stays inactive and leaving the document cancels live motion', () => {
  const f = fixture(); f.node.isConnected = false; f.api.reveal(f.node); assert.equal(f.animations.length, 0);
  f.node.isConnected = true; f.api.reveal(f.node, 'panel');
  assert.equal(f.animations[0].frames[0].translate, 'none');
  f.events.pagehide(); assert.equal(f.animations[0].cancelled, true);
});


test('CSS motion tokens control finite section and panel entry without changing reentry origin', () => {
  const tokens = { '--ui-motion-surface': ' .24s ', '--ui-motion-panel': '120ms',
    '--ui-motion-section-offset': '3px', '--ui-motion-panel-offset': '1px',
    '--ui-motion-ease': 'cubic-bezier(0.1, 0.7, 0.2, 1)' };
  const f = fixture(false, tokens);
  f.api.reveal(f.node);
  assert.equal(f.animations[0].options.duration, 240);
  assert.equal(f.animations[0].options.easing, tokens['--ui-motion-ease']);
  assert.equal(f.animations[0].frames[0].translate, '0 3px');
  tokens['--ui-motion-panel'] = '140ms';
  f.api.reveal(f.node, 'panel');
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.animations[1].options.duration, 140);
  assert.equal(f.animations[1].frames[0].translate, '0px 2px');
  f.api.stop(f.node);
  f.api.reveal(f.node, 'panel');
  assert.equal(f.animations[2].frames[0].translate, '0 1px');
  f.preference.matches = true;
  f.events.change();
  assert.equal(f.animations[2].cancelled, true);
});

test('absent, malformed and unbounded CSS tokens use safe timing and offset defaults', () => {
  for (const tokens of [{}, { '--ui-motion-surface': '-10ms', '--ui-motion-panel': 'Infinityms',
    '--ui-motion-section-offset': 'calc(4px + 1em)', '--ui-motion-panel-offset': '100px',
    '--ui-motion-ease': 'cubic-bezier(2, 0, -1, 1)' },
    { '--ui-motion-surface': '99999s', '--ui-motion-panel': 'auto',
      '--ui-motion-section-offset': 'NaNpx', '--ui-motion-ease': 'not-an-easing' }]) {
    const f = fixture(false, tokens);
    f.api.reveal(f.node);
    assert.equal(f.animations[0].options.duration, 180);
    assert.equal(f.animations[0].options.easing, 'cubic-bezier(.2,.8,.2,1)');
    assert.equal(f.animations[0].frames[0].translate, '0 4px');
    f.api.stop(f.node);
    f.api.reveal(f.node, 'panel');
    assert.equal(f.animations[1].options.duration, 160);
    assert.equal(f.animations[1].frames[0].translate, 'none');
  }
});


test('Deliberate page navigation has a distinct motion role and retains rapid-navigation and reduced-motion safeguards',async()=>{
 const f=fixture(false,{'--ui-motion-page':'360ms','--ui-motion-page-offset':'12px','--ui-motion-surface':'220ms'});f.api.reveal(f.node,'page');assert.equal(f.animations[0].options.duration,360);assert.equal(f.animations[0].frames[0].translate,'0 12px');assert.equal(f.animations[0].frames[0].opacity,.18);f.api.reveal(f.node,'page');assert(f.animations[0].cancelled);assert.equal(f.animations[1].frames[0].translate,'0px 2px');f.preference.matches=true;f.events.change();assert(f.animations[1].cancelled);f.api.reveal(f.node,'page');assert.equal(f.animations.length,2);await Promise.resolve();
});


function mediaFixture(){
 const events={},preference={matches:false,addEventListener:(_,fn)=>events.change=fn},images=[],animations=[],observers=[];
 const document={body:{append(node){images.push(node);}},createElement(){const n={style:{},dataset:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},remove(){const i=images.indexOf(this);if(i>=0)images.splice(i,1);},animate(frames,options){let resolve,reject;const a={frames,options,cancelled:false,finished:new Promise((r,j)=>{resolve=r;reject=j;}),cancel(){this.cancelled=true;reject(Error('cancelled'));},finish(){resolve();}};animations.push(a);return a;}};return n;}};
 class Observer{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const window={matchMedia:()=>preference,addEventListener:(name,fn)=>events[name]=fn};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/ui-motion.js'),'utf8'),{window,document,MutationObserver:Observer,getComputedStyle:()=>({borderRadius:'12px',getPropertyValue:()=>''})});
 const source={tagName:'IMG',isConnected:true,complete:true,naturalWidth:640,currentSrc:'data:image/png;base64,AA==',getBoundingClientRect:()=>({x:40,y:120,width:160,height:240})};
 const target={isConnected:true,style:{opacity:'.8'},getBoundingClientRect:()=>({x:200,y:180,width:120,height:180})};return{api:window.UiMotion,source,target,images,animations,observers,preference,events};
}
test('Shared media capture rejects missing or unloaded artwork and transfer hides only its target while preserving input routing',async()=>{
 const f=mediaFixture();f.source.complete=false;assert.equal(f.api.captureMedia(f.source),null);f.source.complete=true;const snapshot=f.api.captureMedia(f.source);assert.equal(snapshot.width,160);f.api.mediaTransfer(snapshot,f.target);assert.equal(f.images.length,1);assert.equal(f.target.style.opacity,'0');assert.equal(f.images[0].attributes['aria-hidden'],'true');assert.equal(f.images[0].style.pointerEvents,'none');assert.equal(f.animations[0].options.duration,420);assert.match(f.animations[0].frames[1].transform,/translate\(160px,60px\) scale\(0.75,0.75\)/);f.animations[0].finish();await Promise.resolve();assert.equal(f.images.length,0);assert.equal(f.target.style.opacity,'.8');
});
test('Shared media motion cleans up and restores artwork on rapid navigation, target removal, reduced motion and page leave',async()=>{
 const f=mediaFixture(),snapshot=f.api.captureMedia(f.source);f.api.mediaTransfer(snapshot,f.target);f.api.mediaTransfer(snapshot,f.target);assert(f.animations[0].cancelled);assert.equal(f.images.length,1);f.target.isConnected=false;f.observers.at(-1).fn();await Promise.resolve();assert.equal(f.images.length,0);assert.equal(f.target.style.opacity,'.8');f.target.isConnected=true;f.api.mediaTransfer(snapshot,f.target);f.preference.matches=true;f.events.change();await Promise.resolve();assert.equal(f.images.length,0);assert.equal(f.target.style.opacity,'.8');f.api.mediaTransfer(snapshot,f.target);assert.equal(f.images.length,0);f.preference.matches=false;f.api.mediaTransfer(snapshot,f.target);f.events.pagehide();await Promise.resolve();assert.equal(f.images.length,0);assert.equal(f.target.style.opacity,'.8');
});
