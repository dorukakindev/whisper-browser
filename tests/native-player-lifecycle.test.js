'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function setup(){
 let resolveSource, windows=0;
 const app=new EventEmitter(); app.getPath=()=>'/synthetic';
 const fakeFs={existsSync:()=>true,statSync:()=>({size:9000})};
 const file=path.join(__dirname,'../src/native-player.js');
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,process:{platform:'win32',env:{LOCALAPPDATA:'/synthetic'}},
  require(name){if(name==='node:fs')return fakeFs;if(name==='./process-lifecycle')return require('../src/process-lifecycle');if(name==='./settings-security')return {withoutSecretEnv:x=>x};return require(name);},
  setTimeout,clearTimeout,setInterval,clearInterval,Buffer},{filename:file});
 const source=new Promise(resolve=>{resolveSource=resolve;});
 const player=module.exports.registerNativePlayer({app,ipcMain:{handle(){}},owner:()=>null,authorized:()=>true,
  authorizeMedia:()=>source,BrowserWindow:class {constructor(){windows++;throw Error('Unexpected native window after cancellation');}},
  torrents:{},dialog:{}});
 return {app,player,resolveSource,windows:()=>windows};
}
for(const action of ['quit','public-stop','ipc-stop'])test(`pending native authorization cannot restart after ${action}`,async()=>{
 const f=setup();
 const pending=f.player.handler({}, {action:'start',path:'synthetic.mp4'});
 if(action==='quit')f.app.emit('before-quit');
 else if(action==='public-stop')await f.player.stop();
 else assert.equal((await f.player.handler({}, {action:'stop'})).ok,true);
 f.resolveSource('synthetic.mp4');
 const result=await pending;
 assert.equal(f.windows(),0);
 assert.equal(result.ok,false);
 assert.match(result.error,/superseded/);
});
test('a new explicit request after a canceled start still reaches normal startup',async()=>{
 const f=setup();
 const old=f.player.handler({}, {action:'start',path:'old.mp4'});
 await f.player.stop();
 const current=f.player.handler({}, {action:'start',path:'current.mp4'});
 f.resolveSource('synthetic.mp4');
 assert.match((await old).error,/superseded/);
 assert.match((await current).error,/Unexpected native window/);
 assert.equal(f.windows(),1);
});
