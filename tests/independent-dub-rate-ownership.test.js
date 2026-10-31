'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const media=require('../src/browser-media-controller');
const {rankBrowserMediaCandidates}=require('../src/browser-media');
const {withTimeout}=require('../src/async-timeout');
const source=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
const begin=source.indexOf('  setRate: async request => {',source.indexOf('const dubService ='));
const end=source.indexOf('\n  editorIdentity:',begin);
assert(begin>0&&end>begin);
const callback=source.slice(begin,end).trim().replace(/^setRate:\s*/,'').replace(/,$/,'');
function page(t,width=400){
 const dom=new JSDOM('<video></video>',{url:'https://fixture.invalid',runScripts:'outside-only',pretendToBeVisual:true});
 t.after(()=>dom.window.close());const w=dom.window,v=w.document.querySelector('video');v.src='https://fixture.invalid/original.mp4';
 Object.defineProperties(v,{clientWidth:{value:width},clientHeight:{value:200},duration:{value:30},paused:{value:false},readyState:{value:4}});
 v.getBoundingClientRect=()=>({width,height:200,top:0,bottom:200,left:0,right:width});
 const frame={executeJavaScript:async script=>w.eval(script)};
 return {w,v,frame,probe:()=>w.eval(media.buildBrowserMediaProbeScript())};
}
function harness(frames){
 const dubRateTargets=new Map(),tab={id:'tab',generation:1,mediaId:'media-A',view:{webContents:{isDestroyed:()=>false}}};
 const context={dubRateTargets,browserTabById:id=>id==='tab'?tab:null,browserFrames:()=>frames,
  rankBrowserMediaCandidates,...media,withTimeout:(task,ms,message)=>withTimeout(task,Math.min(ms,15),message)};
 const setRate=vm.runInNewContext('('+callback+')',context);
 const request={tabId:'tab',generation:1,mediaId:'media-A',rate:.8,baseRate:1};
 const cache=page=>dubRateTargets.set('tab',{frame:page.frame,token:page.probe().docToken,generation:1,view:tab.view,mediaId:'media-A'});
 return {dubRateTargets,tab,setRate,request,cache};
}

test('cached stale release cannot restore a replacement source or another iframe',async t=>{
 const original=page(t),other=page(t,900),h=harness([original.frame,other.frame]);
 h.cache(original);original.v.src='https://fixture.invalid/replacement.mp4';original.v.playbackRate=1.9;other.v.playbackRate=1.7;
 const result=await h.setRate({...h.request,release:true});
 assert.equal(result.stale,true);assert.equal(original.v.playbackRate,1.9);assert.equal(other.v.playbackRate,1.7);
 assert.equal(h.dubRateTargets.has('tab'),false);
});

test('release without an owned target is a no-op and never discovers arbitrary current media',async t=>{
 const current=page(t),h=harness([current.frame]);current.v.playbackRate=1.7;
 const result=await h.setRate({...h.request,release:true});
 assert.equal(result.ok,true);assert.equal(current.v.playbackRate,1.7);
});

test('timed-out cached mutation cannot fall through and later releases the same owned frame',async t=>{
 const original=page(t),other=page(t,900),h=harness([original.frame,other.frame]);h.cache(original);other.v.playbackRate=1.7;
 const direct=original.frame.executeJavaScript;let complete;
 original.frame.executeJavaScript=script=>new Promise(resolve=>{complete=()=>Promise.resolve(direct(script)).then(resolve);});
 const result=await h.setRate(h.request);
 assert.equal(result.ok,false);assert.equal(result.timedOut,true);assert.equal(other.v.playbackRate,1.7);
 await complete();assert.equal(original.v.playbackRate,.8);
 original.frame.executeJavaScript=direct;
 assert.equal((await h.setRate({...h.request,release:true})).ok,true);
 assert.equal(original.v.playbackRate,1);assert.equal(other.v.playbackRate,1.7);
});

test('fresh candidate changing between probe and command cannot redirect into next iframe',async t=>{
 const original=page(t,900),other=page(t),h=harness([original.frame,other.frame]);other.v.playbackRate=1.7;
 const direct=original.frame.executeJavaScript;
 original.frame.executeJavaScript=async script=>{
  const value=await direct(script);
  if(script===media.buildBrowserMediaProbeScript())original.v.src='https://fixture.invalid/replacement.mp4';
  return value;
 };
 const result=await h.setRate(h.request);
 assert.equal(result.stale,true);assert.equal(result.ok,false);assert.equal(other.v.playbackRate,1.7);
});

test('successful owned rate and release preserve existing normal flow',async t=>{
 const original=page(t),h=harness([original.frame]);
 assert.equal((await h.setRate(h.request)).ok,true);assert.equal(original.v.playbackRate,.8);
 assert.equal(h.dubRateTargets.size,1);
 assert.equal((await h.setRate({...h.request,release:true})).ok,true);assert.equal(original.v.playbackRate,1);
 assert.equal(h.dubRateTargets.size,0);
});

test('navigation while a successful command reply is pending cannot install a stale cached target',async t=>{
 const original=page(t),h=harness([original.frame]);const direct=original.frame.executeJavaScript;
 let finish;
 original.frame.executeJavaScript=async script=>{
  const value=await direct(script);
  if(script===media.buildBrowserMediaProbeScript())return value;
  return new Promise(resolve=>{finish=()=>resolve(value);});
 };
 const pending=h.setRate(h.request);while(!finish)await new Promise(setImmediate);
 h.tab.generation=2;h.tab.mediaId='media-B';finish();
 const result=await pending;
 assert.equal(result.stale,true);assert.equal(result.ok,false);assert.equal(h.dubRateTargets.size,0);
});

test('a stale old release cannot discard the new source ownership record',async t=>{
 const original=page(t),h=harness([original.frame]);h.tab.generation=2;h.tab.mediaId='media-B';
 const next={frame:original.frame,token:original.probe().docToken,generation:2,view:h.tab.view,mediaId:'media-B'};
 h.dubRateTargets.set('tab',next);original.v.playbackRate=1.7;
 const result=await h.setRate({...h.request,release:true});
 assert.equal(result.ok,true);assert.equal(result.stale,true);assert.equal(h.dubRateTargets.get('tab'),next);
 assert.equal(original.v.playbackRate,1.7);
});

test('first acquisition timeout retains exact owner for later cleanup',async t=>{
 const original=page(t),other=page(t,200),h=harness([original.frame,other.frame]);other.v.playbackRate=1.7;
 const direct=original.frame.executeJavaScript;let complete;
 original.frame.executeJavaScript=script=>script===media.buildBrowserMediaProbeScript()?direct(script):new Promise(resolve=>{complete=()=>Promise.resolve(direct(script)).then(resolve);});
 assert.equal((await h.setRate(h.request)).timedOut,true);
 assert.equal(h.dubRateTargets.get('tab').frame,original.frame);assert.equal(other.v.playbackRate,1.7);
 await complete();original.frame.executeJavaScript=direct;
 assert.equal((await h.setRate({...h.request,release:true})).ok,true);assert.equal(original.v.playbackRate,1);
});

test('normal first acquisition uses actual ranking and mutates exactly one frame',async t=>{
 const small=page(t,200),large=page(t,900),h=harness([small.frame,large.frame]);
 assert.equal((await h.setRate(h.request)).ok,true);
 assert.equal(small.v.playbackRate,1);assert.equal(large.v.playbackRate,.8);
 assert.equal(h.dubRateTargets.get('tab').frame,large.frame);
});
