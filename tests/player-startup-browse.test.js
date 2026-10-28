'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=source.indexOf('function showHomeWhenNoVideo()'),end=source.indexOf('// ----- Sol kenar',start);assert(start>=0&&end>start);
function fixture(){let listener,timer;const calls=[],context={state:{running:false},player:{mediaKey:''},setSmartTubeVisible:value=>calls.push(value),document:{addEventListener:(type,fn)=>{assert.equal(type,'DOMContentLoaded');listener=fn}},setTimeout:(fn,ms)=>{assert.equal(ms,100);timer=fn}};vm.createContext(context);vm.runInContext(source.slice(start,end),context);listener();return {context,calls,fire:()=>timer()};}
test('late startup browse does not cover a video or running job opened before its timer',()=>{
 for(const change of [c=>c.player.mediaKey='local:opened-video',c=>c.player.mediaKey='browser:opened-page',c=>c.state.running=true]){const f=fixture();change(f.context);f.fire();assert.deepEqual(f.calls,[]);}
});
test('idle startup retains the YouTube browse entry',()=>{const f=fixture();f.fire();assert.deepEqual(f.calls,[true]);});
