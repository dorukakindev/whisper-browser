const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const relink=require('../src/media-relink-matcher');
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'r479-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function loadMedia(name,{endThrows=false}={}){
 const children=[],timers=new Set(),source=path.join(__dirname,'../src',name),module={exports:{}};
 const spawn=()=>{const c=new EventEmitter();for(const k of ['stdin','stdout','stderr']){c[k]=new EventEmitter();c[k].setEncoding=()=>{};}
  c.stdin.end=()=>{if(endThrows)throw Error('fixture write failure');};c.kill=()=>{c.killed=true;return true;};children.push(c);return c;};
 vm.runInNewContext(fs.readFileSync(source,'utf8')+'\nmodule.exports.__run = run;',{
  module,exports:module.exports,require:n=>n==='node:child_process'?{spawn}:n==='./settings-security'?{withoutSecretEnv:v=>v}:n==='./process-lifecycle'?require('../src/process-lifecycle'):require(n),
  __dirname:path.dirname(source),Buffer,process:{env:{},once(){}},
  setTimeout:()=>{const x={unref(){}};timers.add(x);return x;},clearTimeout:x=>timers.delete(x)});
 return {...module.exports,children,timers};
}
test('479-01: conflicting size cannot produce a unique relink recommendation',()=>{
 const r=relink.selectRelinkCandidates({localPath:'C:/old/movie.mp4',sizeBytes:100},[{path:'D:/new/movie.mp4',sizeBytes:999}]);
 assert.notEqual(r.status,'unique');
});
test('479-02: merging stale session snapshots preserves recorded watch time',()=>{
 const merged=relink.mergeWatchItems({key:'file:source',sessions:[{id:'same',watchSeconds:120,endedAt:20}]},{key:'file:target',sessions:[{id:'same',watchSeconds:10,endedAt:5}]});
 assert.equal(merged.totalWatchSeconds,120);assert.equal(merged.sessions[0].endedAt,20);
});
test('479-03: synchronous media stdin failure kills the child and clears the watchdog',async()=>{
 const f=loadMedia('browser-media-tools.js',{endThrows:true});
 await assert.rejects(f.run('fixture',[],'input'),/fixture write failure/);
 assert.equal(f.children[0].killed,true);assert.equal(f.timers.size,0);
});
test('479-04: destroyed download getters cannot prevent terminal resource release',()=>{
 const released=[],session=new EventEmitter();let destroyed=false;
 const item=new EventEmitter();item.setSaveDialogOptions=()=>{};item.getFilename=()=> 'video.mp4';
 for(const name of ['getReceivedBytes','getTotalBytes','getSavePath'])item[name]=()=>{if(destroyed)throw Error('Object has been destroyed');return name==='getSavePath'?'':0;};
 item.isPaused=()=>false;
 const manager=require('../src/browser-downloads').createBrowserDownloads({scheduler:{enqueue:()=> 'running',release:id=>released.push(id)}});
 manager.attach(session);session.emit('will-download',{preventDefault(){}},item);destroyed=true;
 assert.doesNotThrow(()=>item.emit('done',{},'cancelled'));assert.equal(manager.activeCount(),0);assert.equal(released.length,1);
});
test('479-05: duplicate cue IDs do not pause an overlapping speaker',()=>{
 const {playbackLearningAction:act}=require('../src/playback-policy');
 const cues=[{id:'1',start:0,end:1,text:'first'},{id:'1',start:.5,end:2,text:'still speaking'}];
 assert.equal(act(cues,1.1,.9,'normal',{autoPause:true}).type,'set-rate');
 assert.equal(act(cues,1.1,.9,'loop-cue',{}).type,'set-rate');
});
test('479-06: incomplete episode numbers cannot silently become season zero',()=>{
 const {itemOf}=require('../src/media-catalog-store');
 assert.throws(()=>itemOf({kind:'series',title:'Example',episodes:[{season:null,number:1}]}));
 assert.throws(()=>itemOf({kind:'series',title:'Example',episodes:[{season:1,number:true}]}));
 assert.equal(itemOf({kind:'series',title:'Example',episodes:[{season:'0',number:'1'}]}).episodes[0].season,0);
});
test('479-07: deleting a catalog item while poster picker is open leaves no orphan poster',async t=>{
 const root=temp(t),handlers={};let pick;
 const poster=path.join(root,'fixture.png');fs.writeFileSync(poster,'image');
 const image={isEmpty:()=>false,resize(){return this;},toDataURL:()=> 'data:image/png;base64,eA==',toPNG:()=>Buffer.from('image')};
 require('../src/media-catalog-service').registerMediaCatalogService({ipcMain:{handle:(n,fn)=>handlers[n]=fn},
  dialog:{showOpenDialog:()=>new Promise(resolve=>{pick=resolve;})},owner:()=>null,authorized:()=>true,userData:()=>root,pythonPath:()=>'',watchItems:()=>[],
  nativeImage:{createFromPath:()=>image,createFromDataURL:()=>image}});
 const invoke=r=>handlers['media-catalog:request']({sender:{id:1}},r);
 const made=await invoke({action:'save',item:{kind:'film',title:'Example'}});
 const pending=invoke({action:'poster-file',id:made.item.id});await new Promise(setImmediate);
 await invoke({action:'remove',id:made.item.id});pick({canceled:false,filePaths:[poster]});
 assert.equal((await pending).ok,false);
 const folder=path.join(root,'catalog-posters');assert.equal(fs.existsSync(folder)?fs.readdirSync(folder).length:0,0);
});
test('479-08: normalized catalog IDs cannot create duplicate records',t=>{
 const store=require('../src/media-catalog-store').createMediaCatalogStore({filePath:path.join(temp(t),'catalog.json')});
 store.upsert({id:'movie',kind:'film',title:'First'});
 store.upsert({id:' movie ',kind:'film',title:'Updated'});
 assert.equal(store.list().length,1);assert.equal(store.get('movie').title,'Updated');
});
test('479-09: null realtime factor cannot claim that a slow model caught up',()=>{
 const s=require('../src/live-asr-realtime').createLiveAsrRealtimeMonitor({slowStreak:1});
 assert.equal(s.observe({rtf:2,audio_seconds:3}).level,'warn');
 assert.equal(s.observe({rtf:null,audio_seconds:3}),null);assert.equal(s.snapshot().warned,true);
});
test('479-10: video analysis rejects a broken input pipe immediately',async()=>{
 const f=loadMedia('browser-video-analysis.js');let rejected=false;
 const pending=f.__run('fixture',[],'input');pending.catch(()=>{rejected=true;});
 f.children[0].stdin.emit('error',Error('fixture EPIPE'));await Promise.resolve();
 const immediate=rejected;f.children[0].emit('close',1);await assert.rejects(pending);
 assert.equal(immediate,true);assert.equal(f.children[0].killed,true);
});
