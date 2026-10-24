'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const tools=require('../src/media-tools-service'), model=require('../src/renderer/media-tools-model');
test('Review evidence keeps IDs after spoiler filtering, rejects fabricated quotes and duplicate IDs',()=>{
  for(const api of [tools,model]){
    const rows=api.reviewRows(JSON.stringify([{id:'2',text:'The acting is wonderful.'}]));assert.equal(rows[0].id,'2');
    assert.equal(api.verifyDecision({points:[{id:'2',quote:'acting is wonderful',reason:'Acting'}]},rows).points.length,1);
    assert.throws(()=>api.verifyDecision({points:[{id:'2',quote:'invented praise'}]},rows),/verified/);
    assert.throws(()=>api.reviewRows(JSON.stringify([{id:'1',text:'First full review'},{id:'1',text:'Second full review'}])),/unique/);
    assert.throws(()=>api.reviewRows('x'.repeat(120001)),/120,000/);
  }
});
test('Tonight excludes completed/imported/unknown durations under a time limit and sorts numeric episodes',()=>{
  const src={type:'local',value:'film.mp4',watchKey:'film'};
  const items=[{id:'a',kind:'film',title:'Comedy',runtime:90,genres:['Comedy'],source:src},{id:'b',kind:'film',title:'Unknown',source:{...src,watchKey:'b'}},{id:'c',kind:'film',title:'Imported',runtime:50,source:{...src,imported:true}},{id:'s',kind:'series',title:'Series',episodes:[{id:'10',season:1,number:10,source:{...src,watchKey:'e10'}},{id:'2',season:1,number:2,source:{...src,watchKey:'e2'}}]}];
  assert.deepEqual(tools.tonight(items,[],{minutes:100}).map(r=>r.itemId),['a']);
  assert.equal(tools.tonight(items,[],{}).find(r=>r.itemId==='s').episodeId,'2');
  assert(!tools.tonight(items,[{key:'film',completed:true}],{}).some(r=>r.itemId==='a'));
  assert.deepEqual(tools.tonight(items,[],{mood:'light'}),model.tonight(items,[],{mood:'light'}));
});
test('Tonight budgets remaining playback time and matches Windows history with the newest record',()=>{
  const items=[{id:'long',kind:'film',title:'Long film',runtime:150,source:{type:'local',value:'C:\\Films\\Long.mp4'}},
    {id:'unknown',kind:'film',title:'Unknown',source:{type:'local',value:'C:\\Films\\Unknown.mp4'}}];
  const history=[{key:'file:c:/films/long.mp4',duration:7200,position:4200,lastWatched:20},
    {key:'file:C:\\Films\\Long.mp4',duration:9000,position:0,lastWatched:10}];
  for(const api of [tools,model]){
    const rows=api.tonight(items,history,{minutes:50});assert.equal(rows.length,1);assert.equal(rows[0].itemId,'long');
    assert.equal(rows[0].remaining,50);assert.equal(rows[0].runtime,120,'Actual observed duration takes precedence over catalog estimate');assert.equal(rows[0].position,4200);
    assert.equal(api.tonight(items,history,{minutes:49}).length,0);
    assert.equal(api.tonight(items,[{...history[0],position:7200}],{minutes:50}).length,0,'No zero-minute completed candidates');
    assert.equal(api.tonight(items,[{...history[0],duration:Infinity,position:NaN}],{minutes:50}).length,0,'Nonfinite progress cannot manufacture a short remaining duration');
  }
});
test('Service isolates callers, keeps feedback and analyses separate, exports new roots without credentials',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'media-tools-')),picked=path.join(dir,'backup.wbp'),handlers=new Map(),close=[];
  try{
    const svc=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle:(k,fn)=>handlers.set(k,fn)},authorized:e=>e?.trusted===true,owner:()=>null,catalogStore:()=>({get:id=>id==='film'?{id,title:'Fixture'}:null,list:()=>[]}),dialog:{showSaveDialog:async()=>({filePath:picked}),showOpenDialog:async()=>({canceled:true})},ffprobe:()=>'',fetchImpl:()=>{throw Error('No live requests');}});
    const call=(action,values={})=>svc.handle({trusted:true},{action,...values});
    assert.equal((await svc.handle({}, {action:'audio-get'})).ok,false);
    assert.equal((await call('reviews-fetch',{itemId:'film',id:'req',url:'https://127.0.0.1/film/x/reviews/'})).ok,false);
    assert.equal((await call('feedback-save',{itemId:'film',reaction:'like',note:'My own note.'})).ok,true);
    assert.equal((await call('decision-save',{itemId:'film',reviews:[{id:'5',text:'Excellent acting throughout.'}],analysis:{summary:'Acting',points:[{id:'5',quote:'Excellent acting',reason:'Evidence'}]}})).ok,true);
    const value=(await call('decision-get',{itemId:'film'})).value;assert.equal(value.feedback.note,'My own note.');assert.equal(value.history.length,1);
    fs.writeFileSync(path.join(dir,'media-shelf.json'),JSON.stringify({version:1,music:[],books:[],stations:[],podcasts:[],playlists:[],diary:[]}));fs.writeFileSync(path.join(dir,'settings.json'),'SECRET_API_KEY');
    assert.equal((await call('backup-export')).ok,true);const pkg=require('../src/workspace-package').readPackage(picked);assert(pkg.files.some(r=>r.name==='media-shelf.json'));assert(pkg.files.some(r=>r.name==='media-enrichment.json'));assert(!JSON.stringify(pkg).includes('SECRET_API_KEY'));assert(!pkg.files.some(r=>r.name==='settings.json'));
    const scope=require('../src/workspace-package').describePackage(pkg,dir);assert.equal(scope.titleDecisions,1);assert(scope.changes.unchanged>=2);
  }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Restored followed folders are paused; a corrupt new media file cannot partly restore prior records',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'media-restore-'));try{
    const pkg=require('../src/workspace-package'),encode=(name,value)=>({name,data:Buffer.from(JSON.stringify(value)).toString('base64')});
    pkg.restorePackage(dir,{format:'whisper-workspace',version:1,created:new Date().toISOString(),sourceRoot:'{{ROOT}}',mappings:[],files:[encode('media-folder-watches.json',[{id:'f',path:'C:\\Films',enabled:true}])]});
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'media-folder-watches.json')))[0].enabled,false);
    assert.throws(()=>pkg.restorePackage(dir,{format:'whisper-workspace',version:1,sourceRoot:'{{ROOT}}',mappings:[],files:[encode('media-enrichment.json',{version:7})]}),/Invalid media notes/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Public review reader decodes split UTF-8 and cancellation cannot leave an active request',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-reader-')),close=[];let fetches=0;
  try{
    const html=Buffer.from('<div class="body-text js-review-body"><p>İstanbul’da oyunculuk güçlü ve özgün.</p></div>');
    const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},owner:()=>null,dialog:{},authorized:()=>true,catalogStore:()=>({get:()=>({id:'film'})}),fetchImpl:async(url,options)=>{
      fetches++;assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert(!options.headers?.Authorization);
      if(fetches===1)return {ok:true,body:(async function*(){for(let i=0;i<html.length;i++)yield html.subarray(i,i+1);})()};
      return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})),{once:true}));
    }});
    const response=await service.handle({}, {action:'reviews-fetch',itemId:'film',id:'first',url:'https://letterboxd.com/film/example/reviews/'});assert.equal(response.ok,true);assert.match(response.reviews[0].text,/İstanbul’da oyunculuk güçlü/);
    const pending=service.handle({}, {action:'reviews-fetch',itemId:'film',id:'second',url:'https://letterboxd.com/film/example/reviews/'});await new Promise(r=>setImmediate(r));await service.handle({}, {action:'reviews-stop',id:'second'});assert.equal((await pending).ok,false);
    assert.equal((await service.handle({}, {action:'audio-get'})).ok,true);
  }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Automatic backups retain seven owned files and leave unrelated files untouched',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'media-auto-')),backups=path.join(dir,'backups'),close=[];fs.mkdirSync(backups);
  try{
    for(let day=1;day<=8;day++)fs.writeFileSync(path.join(backups,`whisper-auto-2025-01-0${day}T00-00-00-000Z.wbp`),'owned fixture');
    fs.writeFileSync(path.join(backups,'my-personal-backup.wbp'),'must remain');
    const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,catalogStore:()=>({}),dialog:{showOpenDialog:async()=>({filePaths:[backups]})}});
    const result=await service.handle({}, {action:'backup-schedule',every:'daily'});assert.equal(result.ok,true);assert(result.value.last>0);
    assert.equal(fs.readdirSync(backups).filter(n=>n.startsWith('whisper-auto-')).length,7);assert.equal(fs.readFileSync(path.join(backups,'my-personal-backup.wbp'),'utf8'),'must remain');
    assert.equal((await service.handle({}, {action:'backup-schedule',every:'off'})).ok,true);assert.equal((await service.handle({}, {action:'backup-status'})).value.every,'off');
  }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Health scan skips unverified imports and compares distinct physical files once',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'media-health-')),close=[];
  try{
    const a=path.join(dir,'a.mp4'),b=path.join(dir,'b.mp4');for(const file of [a,b]){fs.writeFileSync(file,'same contents');fs.writeFileSync(file.replace('.mp4','.tr.srt'),'subtitle');}
    const row=(id,value,imported=false)=>({id,title:id,imdbId:'tt1234567',source:{type:'local',value,imported}});
    const items=[row('a',a),row('alias',a),row('b',b),row('unverified',path.join(dir,'not-approved.mp4'),true),row('missing',path.join(dir,'gone.mp4')),row('directory',dir)];
    const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,dialog:{},catalogStore:()=>({list:()=>items})});
    const started=await service.handle({}, {action:'health-start'});let result;
    const deadline=Date.now()+3000;do{result=await service.handle({}, {action:'health-status',id:started.id});if(result.state!=='running')break;await new Promise(r=>setTimeout(r,10));}while(Date.now()<deadline);
    assert.equal(result.state,'done');assert.equal(result.done,6);assert.equal(result.hashTotal,2,'Alias record must not trigger a third full-file hash');assert.equal(result.hashed,2);
    for(const id of ['a','alias','b'])assert.deepEqual(result.rows.find(r=>r.id===id).issues,['duplicate']);
    assert.deepEqual(result.rows.find(r=>r.id==='unverified').issues,['unverified']);assert(result.rows.find(r=>r.id==='missing').issues.includes('missing'));assert.deepEqual(result.rows.find(r=>r.id==='directory').issues,['probe-failed']);
  }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});
test('A late backup folder picker cannot re-enable a disabled schedule; future timestamps recover',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'media-schedule-')),close=[];let finishPicker;
  try{
    fs.writeFileSync(path.join(dir,'media-backup-schedule.json'),JSON.stringify({every:'daily',dir,last:Date.now()+86400000000}));
    const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,catalogStore:()=>({}),dialog:{showOpenDialog:()=>new Promise(resolve=>{finishPicker=resolve;})}});
    assert.equal((await service.handle({}, {action:'backup-status'})).value.last,0);
    const pending=service.handle({}, {action:'backup-schedule',every:'weekly'});
    await service.handle({}, {action:'backup-schedule',every:'off'});finishPicker({filePaths:[dir]});assert.equal((await pending).canceled,true);
    assert.equal((await service.handle({}, {action:'backup-status'})).value.every,'off');
    assert.equal(fs.readdirSync(dir).filter(n=>n.endsWith('.wbp')).length,0);
  }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Blocked Letterboxd access reports the fallback and releases the request lock',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-blocked-')),close=[];try{const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},owner:()=>null,dialog:{},authorized:()=>true,catalogStore:()=>({get:()=>({id:'film'})}),fetchImpl:async()=>({ok:false,status:403})});for(const id of ['one','two']){const result=await service.handle({}, {action:'reviews-fetch',itemId:'film',id,url:'https://letterboxd.com/film/example/reviews/'});assert.equal(result.ok,false);assert.match(result.error,/403/);assert.match(result.error,/paste or import/);assert.doesNotMatch(result.error,/already running/);}}finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});
