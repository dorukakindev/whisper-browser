'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 let resolveClose,calls=0,quits=0,prevented=0;
 const app=new EventEmitter();app.getPath=()=>'/synthetic';app.quit=()=>quits++;
 const module={exports:{}},source=fs.readFileSync(require.resolve('../src/native-player'),'utf8').replace('return {stop:requestStop,handler};','return {stop:requestStop,handler,testOwn:s=>{session=s;}};');
 vm.runInNewContext(source,{module,process:{platform:'win32',env:{}},Buffer,setTimeout,clearTimeout,setInterval,clearInterval,require(name){if(name==='node:fs')return {existsSync:()=>false};if(name==='./settings-security')return {withoutSecretEnv:x=>x};if(name==='./process-lifecycle')return {terminateProcessTreeAndWait:()=>{calls++;return new Promise(resolve=>resolveClose=resolve);}};return require(name);}});
 const player=module.exports.registerNativePlayer({app,ipcMain:{handle(){}},owner:()=>null,authorized:()=>true,authorizeMedia:async()=>'',BrowserWindow:class{},dialog:{},torrents:{}});
 const proc=new EventEmitter();proc.kill=()=>{throw Error('Unconfirmed direct kill must not be used');};const host={dead:false,isDestroyed(){return this.dead;},destroy(){this.dead=true;}};
 player.testOwn({proc,host,owner:new EventEmitter(),reposition(){},pending:new Map(),state:{}});
 return {player,host,resolve:value=>resolveClose(value),quit:()=>app.emit('before-quit',{preventDefault(){prevented++;}}),get calls(){return calls;},get quits(){return quits;},get prevented(){return prevented;}};
}
const tick=()=>new Promise(setImmediate);
test('Stop does not finish before process closure and coalesces callers',async()=>{const h=setup();let finished=false;const a=h.player.stop().then(()=>finished=true),b=h.player.stop();await tick();assert.equal(h.calls,1);const status=await h.player.handler({},{action:'status'});assert.equal(status.active,true);assert.equal(status.stopping,true);assert(!finished);assert(h.host.dead);h.resolve(true);await Promise.all([a,b]);assert(finished);});
test('Failed shutdown remains owned and permits an explicit retry',async()=>{const h=setup();const first=h.player.stop();await tick();h.resolve(false);await assert.rejects(first,/confirmed/);const retry=h.player.stop();await tick();assert.equal(h.calls,2);h.resolve(true);await retry;assert.equal((await h.player.stop()).ok,true);});
test('Quit is held until closure and repeated quit shares one stop',async()=>{const h=setup();h.quit();h.quit();await tick();assert.equal(h.prevented,2);assert.equal(h.calls,1);assert.equal(h.quits,0);h.resolve(true);await tick();assert.equal(h.quits,1);});
test('Failed quit cannot exit and is retryable',async()=>{const h=setup();h.quit();await tick();h.resolve(false);await tick();assert.equal(h.quits,0);h.quit();await tick();assert.equal(h.calls,2);h.resolve(true);await tick();assert.equal(h.quits,1);});
