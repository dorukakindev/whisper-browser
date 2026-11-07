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

test('keep-open EOF emits one owner-scoped end and rearms after a seek leaves EOF',()=>{
 const source=fs.readFileSync(require.resolve('../src/native-player'),'utf8'),socket=new EventEmitter(),sent=[],s={socket,pending:new Map(),state:{},key:'A',generation:2};
 const context={s,session:s,owner:()=>({isDestroyed:()=>false,webContents:{send:(_name,row)=>sent.push(row)}}),clearTimeout,JSON,Error};
 const sendStart=source.indexOf(' function send('),sendEnd=source.indexOf(' async function command(',sendStart),start=source.indexOf("    let buffer='';s.socket.on('error'"),end=source.indexOf("    await command(s,['set_property','http-header-fields'",start);assert(start>=0&&end>start);vm.runInNewContext(source.slice(sendStart,sendEnd)+source.slice(start,end),context);
 const emit=row=>socket.emit('data',Buffer.from(JSON.stringify(row)+'\n'));
 emit({event:'property-change',name:'eof-reached',data:false});assert.equal(sent.length,0);emit({event:'property-change',name:'eof-reached',data:true});emit({event:'end-file',reason:'eof'});emit({event:'property-change',name:'eof-reached',data:true});assert.equal(sent.length,1);assert.equal(sent[0].type,'ended');assert.equal(sent[0].generation,2);
 emit({event:'property-change',name:'eof-reached',data:false});emit({event:'property-change',name:'eof-reached',data:true});assert.equal(sent.length,2);context.session={key:'B',generation:3};emit({event:'property-change',name:'eof-reached',data:false});emit({event:'property-change',name:'eof-reached',data:true});assert.equal(sent.length,2);
});

test('mpv file errors stop an active session once and fail startup without emitting an ended event',()=>{
 const source=fs.readFileSync(require.resolve('../src/native-player'),'utf8');
 const sendStart=source.indexOf(' function send('),sendEnd=source.indexOf(' async function command(',sendStart);
 const start=source.indexOf("    let buffer='';s.socket.on('error'");
 const end=source.indexOf("    await command(s,['set_property','http-header-fields'",start);
 for(const ready of [false,true]){
  const socket=new EventEmitter(),sent=[],s={socket,pending:new Map(),state:{},key:'A',generation:2,ready};
  let stopped=0;
  const context={s,session:s,stop:async()=>{stopped++;},owner:()=>({isDestroyed:()=>false,webContents:{send:(_name,row)=>sent.push(row)}}),clearTimeout,JSON,Error};
  vm.runInNewContext(source.slice(sendStart,sendEnd)+source.slice(start,end),context);
  const failed=Buffer.from(JSON.stringify({event:'end-file',reason:'error'})+'\n');
  socket.emit('data',failed);
  socket.emit('data',failed);
  assert.match(s.loadError,/could not play/);
  assert.equal(stopped,ready?1:0);
  assert.deepEqual(sent.map(row=>[row.type,row.key,row.generation]),ready?[['error','A',2]]:[]);
 }
});

test('HTTP EOF well before known duration recovers instead of completing',()=>{
 const source=fs.readFileSync(require.resolve('../src/native-player'),'utf8');
 const sendStart=source.indexOf(' function send('),sendEnd=source.indexOf(' async function command(',sendStart);
 const start=source.indexOf("    let buffer='';s.socket.on('error'");
 const end=source.indexOf("    await command(s,['set_property','http-header-fields'",start);
 for(const [network,time,duration,expected] of [
  [true,13,30,'error'],[true,29.8,30,'ended'],[true,13,0,'ended'],[false,13,30,'ended'],
 ]){
  const socket=new EventEmitter(),sent=[],s={socket,pending:new Map(),state:{},key:'A',generation:2,ready:true,network};
  let stopped=0;
  const context={s,session:s,stop:async()=>{stopped++;},owner:()=>({isDestroyed:()=>false,webContents:{send:(_name,row)=>sent.push(row)}}),clearTimeout,JSON,Error};
  vm.runInNewContext(source.slice(sendStart,sendEnd)+source.slice(start,end),context);
  const emit=row=>socket.emit('data',Buffer.from(JSON.stringify(row)+'\n'));
  emit({event:'property-change',name:'duration',data:duration});
  emit({event:'property-change',name:'time-pos',data:time});
  emit({event:'property-change',name:'time-pos'});
  emit({event:'property-change',name:'eof-reached',data:true});
  emit({event:'end-file',reason:'eof'});
  assert.deepEqual(sent.map(row=>[row.type,row.time]),[[expected,time]]);
  assert.equal(stopped,expected==='error'?1:0);
 }
});
