'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const repo=path.resolve(__dirname,'..'),base=process.env.REPORT498_BASE || repo;
function load(name,overrides={}){
 const relative='src/'+name+'.js',actual=path.join(repo,relative),file=path.join(base,relative),req=createRequire(file),module={exports:{}};
 vm.runInThisContext('(function(require,module,exports,__dirname,__filename){'+fs.readFileSync(file,'utf8')+'\n})',{filename:file})
  (key=>Object.hasOwn(overrides,key)?overrides[key]:req(key),module,module.exports,path.dirname(actual),actual);
 return module.exports;
}
async function temp(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report498-'));try{return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function child(){const c=new EventEmitter();c.pid=54321;c.exitCode=null;c.signalCode=null;c.kill=()=>true;c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();return c;}
test('498-01 a failed probe stops collecting and terminating on late stdout',async()=>{
 const c=child();let kills=0;
 const P=load('process-io',{'child_process':{spawn:()=>c},'./process-lifecycle':{terminateProcessTree:()=>{kills++;}}});
 const promise=P.probeCommand('fixture',[],{maxChars:128});
 c.stdout.emit('data','x'.repeat(129));await promise;c.stdout.emit('data','y'.repeat(129));
 assert.equal(kills,1);
});
test('498-02 media stderr without line endings is bounded and rejected promptly',async()=>{
 const c=child();const M=load('browser-media-tools',{'node:child_process':{spawn:()=>c},'./process-lifecycle':{terminateProcessTree:()=>{}}});
 const result=M.run('fixture',[],'',null,1000,()=>{}).then(()=>null,e=>e);
 c.stderr.write('x'.repeat(1024*1024+1));c.emit('close',0);
 assert.match((await result)?.message || '',/çok büyük/);
});
test('498-03 split UTF-8 stderr does not corrupt Turkish diagnostic lines',async()=>{
 const c=child(),lines=[];const M=load('browser-media-tools',{'node:child_process':{spawn:()=>c}});
 const result=M.run('fixture',[],'',null,1000,line=>lines.push(line));
 const bytes=Buffer.from('İşlem hazır\n');c.stderr.write(bytes.subarray(0,1));c.stderr.write(bytes.subarray(1));c.emit('close',0);await result;
 assert.deepEqual(lines,['İşlem hazır']);
});
test('498-04 cancelling a media tool terminates the process tree',async()=>{
 const c=child();let killed=0;const M=load('browser-media-tools',{'node:child_process':{spawn:()=>c},'./process-lifecycle':{terminateProcessTree:p=>{assert.equal(p,c);killed++;}}});
 const controller=new AbortController(),result=M.run('fixture',[],'',controller.signal).catch(e=>e);controller.abort();await result;
 assert.equal(killed,1);
});
const enc=text=>Buffer.from('enc:'+text).toString('base64');
const vault=(file,fields=['apiKey'])=>new (load('secret-store').SafeSecretStore)({filePath:file,fields,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('enc:'+s),decryptString:b=>String(b).replace(/^enc:/,'')}});
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
test('498-05 a readable old backup cannot authorize overwriting a future vault',()=>temp(dir=>{
 const file=path.join(dir,'keys.json'),future={version:99,entries:{apiKey:enc('future')}};write(file,future);write(file+'.bak',{version:1,entries:{apiKey:enc('old')}});
 assert.equal(vault(file).saveFromSettings({apiKey:'new'}).ok,false);assert.deepEqual(JSON.parse(fs.readFileSync(file)),future);
}));
test('498-06 saving after backup recovery retains unknown encrypted fields',()=>temp(dir=>{
 const file=path.join(dir,'keys.json');fs.writeFileSync(file,'broken');write(file+'.bak',{version:1,entries:{apiKey:enc('old'),futureField:enc('opaque')}});
 assert.equal(vault(file).saveFromSettings({apiKey:'new'}).ok,true);
 assert.equal(JSON.parse(fs.readFileSync(file)).entries.futureField,enc('opaque'));
}));
test('498-07 an array cannot masquerade as an empty valid secret envelope',()=>temp(dir=>{
 const file=path.join(dir,'keys.json');write(file,{version:1,entries:[]});write(file+'.bak',{version:1,entries:{apiKey:enc('keep')}});
 assert.equal(vault(file).load().secrets.apiKey,'keep');
}));
const catalog=file=>load('media-catalog-store').createMediaCatalogStore({filePath:file});
const movie=(id,title=id)=>({id,kind:'film',title});
test('498-08 catalogue writes preserve future-version primary and backup data',()=>temp(dir=>{
 const file=path.join(dir,'catalog.json'),future={version:99,items:[movie('future')]};write(file,future);write(file+'.bak',{version:1,items:[movie('old')]});
 assert.throws(()=>catalog(file).upsert(movie('new')));assert.deepEqual(JSON.parse(fs.readFileSync(file)),future);
}));
test('498-09 removed catalogue records cannot resurrect from backup',()=>temp(dir=>{
 const file=path.join(dir,'catalog.json'),store=catalog(file);store.upsert(movie('keep'));store.upsert(movie('remove'));store.remove('remove');
 fs.writeFileSync(file,'broken');assert.deepEqual(catalog(file).list().map(i=>i.id),['keep']);
}));
test('498-10 duplicate catalogue IDs trigger intact backup recovery',()=>temp(dir=>{
 const file=path.join(dir,'catalog.json');write(file,{version:1,items:[movie('same','First'),movie('same','Second')]});write(file+'.bak',{version:1,items:[movie('safe')]});
 assert.deepEqual(catalog(file).list().map(i=>i.id),['safe']);
}));
test('498-11 importing a reused episode ID cannot merge different episodes',()=>temp(dir=>{
 const file=path.join(dir,'catalog.json'),store=catalog(file);
 store.upsert({id:'series',kind:'series',title:'Show',imdbId:'tt1234567',episodes:[{id:'shared',season:1,number:1,title:'One'}]});
 const result=store.mergeImport([{kind:'series',title:'Show',imdbId:'tt1234567',episodes:[{id:'shared',season:1,number:2,title:'Two'}]}]);
 assert.equal(result.conflicts.length,1);assert.equal(store.get('series').episodes[0].number,1);
}));
function catalogService(dir){let handler;load('media-catalog-service').registerMediaCatalogService({ipcMain:{handle:(_n,f)=>handler=f},authorized:()=>true,
 userData:()=>dir,watchItems:()=>[],dialog:{},owner:()=>null,pythonPath:()=>'',inspectMedia:p=>p,grantMedia:()=>true});return request=>handler({sender:{id:1}},request);}
test('498-12 catalogue video routes do not persist fragment credentials',()=>temp(async dir=>{
 catalog(path.join(dir,'media-catalog.json')).upsert(movie('item'));
 const result=await catalogService(dir)({action:'source-url',id:'item',url:'https://example.test/#/watch/1?token=PRIVATE&id=2'});
 assert.equal(result.ok,true,result.error);assert.doesNotMatch(JSON.stringify(result.item.source),/PRIVATE/);assert.match(result.item.source.value,/watch\/1/);
 const source=load('media-catalog-store').sourceOf({type:'browser',value:'https://example.test/#/watch/1?token=PRIVATE',watchKey:'browser:https://example.test/?token=PRIVATE'});
 assert.doesNotMatch(JSON.stringify(source),/PRIVATE/);
}));
test('498-13 changing an episode position does not transfer its old video',()=>temp(async dir=>{
 catalog(path.join(dir,'media-catalog.json')).upsert({id:'series',kind:'series',title:'Show',episodes:[{id:'e',season:1,number:1,source:{type:'local',value:'C:\\Movies\\one.mp4'}}]});
 const result=await catalogService(dir)({action:'save',item:{id:'series',episodes:[{id:'e',season:1,number:2}]}});
 assert.equal(result.ok,true,result.error);assert.equal(result.item.episodes[0].source,null);
}));
test('498-14 reopening a closed tab retains its viewing and grouping preferences',()=>{
 const H=load('browser-tab-history').BrowserClosedTabHistory,h=new H();
 h.push({url:'https://example.test',group:{name:'Films',color:'cyan'},keepAwake:true,compatibilityMode:true,readerPreferences:{fontSize:24}});
 const result=h.pop();assert.equal(result.group?.name,'Films');assert.equal(result.keepAwake,true);assert.equal(result.compatibilityMode,true);assert.ok(result.readerPreferences);
});
const integrity=input=>load('browser-translation-integrity').summarizeTranslationIntegrity(input);
test('498-15 null output timestamps do not falsely cover time zero',()=>{
 const result=integrity({sourceCues:[{start:0,end:1,text:'Source'}],results:[{start:null,end:1,text:'Different'}]});
 assert.equal(result.translatedCues,0);
});
test('498-16 stale source hashes cannot count as a current translation',()=>{
 const result=integrity({sourceCues:[{cueId:'a',sourceCueHash:'new',start:1,end:2,text:'New'}],results:[{cueId:'a',sourceCueHash:'old',text:'Old translation'}]});
 assert.equal(result.translatedCues,0);
 assert.equal(integrity({sourceCues:[{cueId:'a',sourceCueHash:'one'},{cueId:'b',sourceCueHash:'two'}],
  results:[{cueId:'a',sourceCueHash:'one',coveredCueIds:['a','b'],text:'Merged translation'}]}).translatedCues,2);
});
test('498-17 indistinguishable duplicate IDs cannot prove both cues are translated',()=>{
 const sourceCues=[{cueId:'a',start:1,end:2,text:'One'},{cueId:'a',start:1,end:2,text:'Two'}];
 const result=integrity({sourceCues,results:[{cueId:'a',coveredCueIds:['a'],start:1,end:2,text:'One translation'}],state:{total:1,completed:1}});
 assert.equal(result.translatedCues,0);assert.notEqual(result.status,'complete');
});
async function dubbing(dir,options={}){
 const engine=path.join(dir,'desktop/Ses/VoxCPM2');fs.mkdirSync(path.join(engine,'.venv/Scripts'),{recursive:true});
 for(const file of ['kitap_ortak.py','anlatici_ham.wav','anlatici_ham.txt','.venv/Scripts/python.exe'])fs.writeFileSync(path.join(engine,file),'fixture');
 const srt=path.join(dir,'fixture.srt');fs.writeFileSync(srt,'fixture');const app=new EventEmitter();app.getPath=n=>n==='desktop'?path.join(dir,'desktop'):dir;
 const handlers={},sender=new EventEmitter();sender.id=1;sender.isDestroyed=()=>false;sender.send=()=>{};let proc;
 const service=load('dub-service',options.overrides).registerDubService({app,ipcMain:{handle:(n,f)=>handlers[n]=f},dialog:options.dialog||{},owner:()=>null,authorized:()=>true,
 authorizeSubtitle:async p=>p,grantMedia:()=>true,busy:()=>false,environment:()=>({}),spawn:()=>{proc=child();return proc;},terminate:()=>true});
 await handlers['dub:config']({sender});return {call:(name,...args)=>handlers[name]({sender},...args),srt,service,proc:()=>proc};
}
test('498-18 a file picker cannot change voice settings after generation starts',()=>temp(async dir=>{
 let finish;const picking=new Promise(r=>finish=r),d=await dubbing(dir,{dialog:{showOpenDialog:()=>picking}});
 const pending=d.call('dub:config','reference');await new Promise(r=>setImmediate(r));
 assert.equal((await d.call('dub:start',{id:'active',srt:d.srt})).ok,true);
 finish({filePaths:[path.join(dir,'other.wav')]});assert.equal((await pending).ok,false);d.proc().emit('close',1);
}));
function savedOutput(dir){const folder=path.join(dir,'Sesler/Çıktı');fs.mkdirSync(folder,{recursive:true});const output=path.join(folder,'saved.wav');fs.writeFileSync(output,'fixture');const logs=path.join(dir,'dub-logs');fs.mkdirSync(logs);const log=path.join(logs,'saved.json');return {output,logs,log};}
test('498-19 restored dubbing must validate saved quality rows before claiming readiness',()=>temp(async dir=>{
 const d=await dubbing(dir),f=savedOutput(dir);write(f.log,{id:'saved',result:'done',path:f.output,quality:{version:1,groups:[{key:'1',status:'ready'}]}});
 const result=await d.call('dub:latest');assert.equal(result.output.qualityUnavailable,true);assert.equal(result.output.quality,null);
}));
test('498-20 a single unreadable job log cannot hide all previous dubbing output',()=>temp(async dir=>{
 const f=savedOutput(dir);write(f.log,{id:'saved',result:'done',path:f.output});const broken=path.join(f.logs,'broken.json');fs.writeFileSync(broken,'fixture');
 const io={...fs,statSync:(p,...args)=>{if(p===broken)throw Object.assign(new Error('permission'),{code:'EACCES'});return fs.statSync(p,...args);}};
 const d=await dubbing(dir,{overrides:{'node:fs':io}});const result=await d.call('dub:latest');assert.equal(result.ok,true);assert.equal(result.output.path,f.output);
}));
