'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createBrowserAlignment}=require('../src/browser-alignment');
const tick=()=>new Promise(setImmediate);
for(const reason of ['abort','overflow'])test(`alignment ${reason} retains ownership and temp files until child close`,async()=>{
 const child=Object.assign(new EventEmitter(),{pid:123,stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),kill(){return true;}}),controller=new AbortController();let temp='',stops=0,settled=false;
 const spawnFixture=(_exe,_args,options)=>{temp=options.env.WHISPER_ALIGN_TMPDIR;return child;};
 const alignment=createBrowserAlignment({pythonPath:process.execPath,spawnImpl:spawnFixture,terminate:()=>{stops++;}});
 const cues=[0,1,2].map(i=>({start:i*3,end:i*3+1,text:'Synthetic cue '+i}));
 const promise=alignment.align({referenceCues:cues,targetCues:cues},{signal:controller.signal});
 const outcome=promise.then(value=>{settled=true;return {value};},error=>{settled=true;return {error};});
 if(reason==='abort')controller.abort();else child.stdout.write('x'.repeat(2*1024*1024+1));
 await tick();assert.equal(settled,false,'A cancellation request is not child closure');assert(fs.existsSync(temp));assert.equal(stops,1);
 child.stdout.write(JSON.stringify({ok:true,times:[[0,1],[3,4],[6,7]]}));child.emit('close',0);const result=await outcome;
 assert(result.error);assert(!result.value,'Late successful JSON cannot override a stop');assert.equal(fs.existsSync(temp),false);
});
