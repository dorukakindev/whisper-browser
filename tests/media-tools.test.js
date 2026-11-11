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

test('Browser review bridge is caller-authorized and returns exact title-match status without exposing raw page HTML',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-browser-')),close=[];let reads=0;try{const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},owner:()=>null,dialog:{},authorized:e=>e.trusted,catalogStore:()=>({get:()=>({id:'film',kind:'film',title:'Film',year:2020,tmdbId:'movie:42'})}),readOpenReviews:async()=>{reads++;return {reviews:[{id:'1',text:'Exact source review text.'}],identity:{title:'Other',year:2021,tmdbId:'movie:99'},url:'https://letterboxd.com/film/other/reviews/'};}});assert.equal((await service.handle({}, {action:'reviews-browser',itemId:'film'})).ok,false);assert.equal(reads,0);const result=await service.handle({trusted:true},{action:'reviews-browser',itemId:'film'});assert(result.ok);assert.equal(result.match.state,'mismatch');assert.equal(result.html,undefined);}finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});

test('A review analysis cannot be saved against a different film identity after rematching',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'decision-identity-'));let item={id:'film',kind:'film',title:'Original',year:1999,tmdbId:'movie:1'};
 try{const service=tools.registerMediaTools({app:{getPath:()=>dir,on:()=>{}},ipcMain:{handle:()=>{}},authorized:()=>true,owner:()=>null,catalogStore:()=>({get:()=>item,list:()=>[item]}),dialog:{}});const snapshot={...item};item={...item,title:'Other film',year:2001,tmdbId:'movie:2'};
 const result=await service.handle({},{action:'decision-save',itemId:'film',itemIdentity:snapshot,reviews:[{id:'1',text:'Strong acting throughout.'}],analysis:{points:[{id:'1',quote:'Strong acting',reason:'Supported'}]}});assert.equal(result.ok,false);assert.match(result.error,/identity changed/);assert.equal((await service.handle({},{action:'decision-get',itemId:'film'})).value.history,undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Discovery review bridge resolves trusted metadata without requiring or writing a library item',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-review-')),close=[];let resolved=0;
 try{const svc=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:e=>e?.trusted===true,dialog:{},catalogStore:()=>({get:()=>{throw Error('No library item');}}),resolveDiscovery:async(e,d)=>{assert(e.trusted);resolved++;return {ok:true,item:{kind:d.kind,providerId:d.id,title:'Verified film',year:2026}};},readOpenReviews:async()=>({reviews:[],identity:{title:'Verified film',year:2026}})});
 // Full-text loading is asynchronous: re-resolve the same discovery identity after it finishes.
 const r=await svc.handle({trusted:true},{action:'reviews-browser',discovery:{kind:'film',id:'tt14173636'}});assert.equal(r.ok,true);assert.equal(resolved,2);
 const bad=await svc.handle({trusted:true},{action:'reviews-browser',discovery:{kind:'film',id:'https://private'}});assert.equal(bad.ok,false);assert.equal(resolved,2);
 const denied=await svc.handle({}, {action:'reviews-browser',discovery:{kind:'film',id:'tt14173636'}});assert.equal(denied.ok,false);assert.equal(resolved,2);
 }finally{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});}
});

test('Identity-bound feedback shares the latest explicit assessment across surfaces and rejects a different film',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-feedback-link-')),close=[],item={id:'film',kind:'film',title:'Verified film',year:2026,imdbId:'tt14173636'};try{const svc=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,dialog:{},catalogStore:()=>({get:()=>item}),resolveDiscovery:async(_e,d)=>({ok:true,item:{kind:d.kind,providerId:d.id,title:'Verified film',year:2026}})}),call=v=>svc.handle({},v),discovery={kind:'film',id:'tt14173636'};assert((await call({action:'feedback-save',discovery,reaction:'like',note:'My discovery note'})).ok);const linked=await call({action:'decision-get',itemId:'film'});assert.equal(linked.value.feedback.note,'My discovery note');assert.equal(linked.value.feedbackSavedFrom,'discovery');item.imdbId='tt9999999';assert.equal((await call({action:'decision-get',itemId:'film'})).value.feedback,undefined);item.imdbId='tt14173636';assert((await call({action:'feedback-save',itemId:'film',reaction:'neutral',note:'My explicit local note'})).ok);assert.equal((await call({action:'decision-get',itemId:'film'})).value.feedback.note,'My explicit local note');assert.equal((await call({action:'decision-get',discovery})).value.feedback.note,'My explicit local note','A newer verified opinion is shared by the same film on both surfaces');}finally{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});}});

test('Browser and fetched review pages apply count, spoiler choice, duplicates and order honestly, and withhold another film',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-shape-')),close=[],film={id:'film',kind:'film',title:'Film',year:2020,tmdbId:'movie:42'};
 const rows=[{id:'1',text:'First distinct opinion about the film.',author:'A',authorId:'a'},{id:'2',text:'SPOILER_SENTENCE_ZEBRA the hero dies at the end.',author:'B',authorId:'b',spoiler:true},{id:'3',text:'First distinct opinion about the film.',author:'C',authorId:'c'},{id:'4',text:'Another opinion from the same author.',author:'A',authorId:'a'},{id:'5',text:'Second distinct opinion about the film.',author:'D',authorId:'d'},{id:'6',text:'Third distinct opinion about the film.',author:'E',authorId:'e'}];
 let identity={title:'Film',year:2020,tmdbId:'movie:42'};
 const page='<meta property="og:title" content="Reviews of Film (2020) • Letterboxd"><div data-tmdb-id="42"></div>'+[['Ann','Visible opinion number one is long enough.',''],['Bob','HIDDEN_SPOILER_SENTENCE the ending twist.',' contains-spoilers'],['Cy','Visible opinion number two is long enough.','']].map(([n,t,c])=>`<li class="film-detail${c}"><a class="name">${n}</a><div class="body-text js-review-body"><p>${t}</p></div></li>`).join('');
 try{
  const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},owner:()=>null,dialog:{},authorized:()=>true,catalogStore:()=>({get:()=>film}),
   readOpenReviews:async()=>({reviews:rows.map(row=>({...row})),identity,url:'https://letterboxd.com/film/film/reviews/',origin:'browser',excluded:{duplicate:0,unreadable:0}}),
   fetchImpl:async()=>({ok:true,body:(async function*(){yield Buffer.from(page);})()})});
  const browser=await service.handle({}, {action:'reviews-browser',itemId:'film',id:'b1',count:2,sort:'high',spoilers:false});
  assert(browser.ok);assert.deepEqual(browser.reviews.map(row=>[row.id,row.text]),[['1','First distinct opinion about the film.'],['2','Second distinct opinion about the film.']]);
  assert.equal(browser.excluded.spoiler,1);assert.equal(browser.excluded.duplicate,1);assert.equal(browser.excluded.author,1);assert.equal(browser.excluded.requested,1);
  assert.equal(browser.sampling.requested,2);assert.equal(browser.sampling.returned,2);assert.equal(browser.sampling.mode,'new');assert.equal(browser.sampling.requestedMode,'high');assert.equal(browser.sampling.orderApplied,false);
  assert(!JSON.stringify(browser).includes('ZEBRA'),'a spoiler review must not leave the service when spoilers are off');
  const matching=await service.handle({}, {action:'reviews-browser',itemId:'film',id:'b2',count:6,sort:'new',spoilers:true});
  assert.equal(matching.sampling.orderApplied,true);assert(matching.reviews.some(row=>row.spoiler&&/ZEBRA/.test(row.text)),'an explicit spoiler choice keeps the flagged review');
  const defaults=await service.handle({}, {action:'reviews-browser',itemId:'film',id:'b3'});assert.equal(defaults.sampling.requested,40);assert(!JSON.stringify(defaults).includes('ZEBRA'));
  identity={title:'Film',year:2021,tmdbId:'movie:99'};
  const other=await service.handle({}, {action:'reviews-browser',itemId:'film',id:'b4',count:6,spoilers:true});
  assert(other.ok);assert.equal(other.match.state,'mismatch');assert.deepEqual(other.reviews,[]);assert.equal(other.withheld,'mismatch');assert.equal(other.excluded.identity,6);
  const fetched=await service.handle({}, {action:'reviews-fetch',itemId:'film',id:'f1',url:'https://letterboxd.com/film/film/reviews/by/entry-rating/',count:1,sort:'high',spoilers:false});
  assert(fetched.ok);assert.equal(fetched.match.state,'matched');assert.equal(fetched.reviews.length,1);assert.match(fetched.reviews[0].text,/number one/);assert.equal(fetched.excluded.spoiler,1);assert.equal(fetched.excluded.requested,1);
  assert.equal(fetched.sampling.mode,'high');assert.equal(fetched.sampling.orderApplied,true);assert(!JSON.stringify(fetched).includes('HIDDEN_SPOILER'));
  const reordered=await service.handle({}, {action:'reviews-fetch',itemId:'film',id:'f2',url:'https://letterboxd.com/film/film/reviews/by/entry-rating/',count:2,sort:'low',spoilers:true});
  assert.equal(reordered.sampling.orderApplied,false);assert.equal(reordered.sampling.mode,'high');assert.equal(reordered.reviews.length,2);
 }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Reading or fetching reviews never writes catalog, watch, reaction or membership records',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-readonly-')),close=[],touched=[],film={id:'film',kind:'film',title:'Film',year:2020,tmdbId:'movie:42'};
 const store=new Proxy({get:()=>film},{get(target,key){if(key==='get')return target.get;if(typeof key==='symbol'||['then','toJSON','constructor'].includes(key))return undefined;return (...args)=>{touched.push(String(key));};}});
 const page='<meta property="og:title" content="Reviews of Film (2020) • Letterboxd"><div data-tmdb-id="42"></div><li class="film-detail"><a class="name">Ann</a><div class="body-text js-review-body"><p>A visible opinion that is long enough.</p></div></li>';
 try{
  const service=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},owner:()=>null,dialog:{},authorized:()=>true,catalogStore:()=>store,saveWatch:()=>touched.push('saveWatch'),
   readOpenReviews:async()=>({reviews:[{id:'1',text:'Open page review text here.',author:'A',authorId:'a'}],identity:{title:'Film',year:2020,tmdbId:'movie:42'},url:'https://letterboxd.com/film/film/reviews/',origin:'browser'}),
   fetchImpl:async()=>({ok:true,body:(async function*(){yield Buffer.from(page);})()})});
  const before=fs.readdirSync(dir).sort().join();
  assert((await service.handle({}, {action:'reviews-browser',itemId:'film',id:'r1',count:5})).ok);
  assert((await service.handle({}, {action:'reviews-fetch',itemId:'film',id:'r2',url:'https://letterboxd.com/film/film/reviews/',count:5})).ok);
  assert.deepEqual(touched,[],'no catalog, watch or membership write while reading reviews');assert.equal(fs.readdirSync(dir).sort().join(),before,'no file was created');
 }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});

test('review comparison carries personal inference freshness and invalidates on corpus change without inventing quotes',()=>{const T=require('../src/media-taste'),first={title:'Earlier',year:2019,review:'I enjoy patient stories with convincing characters.'},added={title:'Later',year:2021,review:'I now prefer brisk pacing and short scenes.'},analysis=T.validateAnalysis({version:1,summary:'Patient pacing preference',insights:[{aspect:'pace',direction:'likes',reason:'Personal evidence',evidence:[{id:T.reviewId(first),quote:'patient stories with convincing characters'}]}]},[first]),current=T.profile([first],[],{analysis}),stale=T.profile([first,added],[],{analysis}),item={kind:'film',title:'Selected',year:2020},rows=[{id:'r',text:'Strong acting and thoughtful story.'}],a=model.decisionEvidence(item,rows,current).evidence,b=model.decisionEvidence(item,rows,stale).evidence;assert.equal(b.profile.analysisState,'stale');assert(b.profile.acceptedAnalysis);assert.equal(b.profile.acceptedAnalysis.historical,true);assert.equal(model.decisionFreshness({version:1,context:JSON.stringify(a),profile:a.profile},item,rows,stale),'stale');});

test('selectable evening plan uses real episode durations and remaining time, includes breaks and refuses unknown budget math',()=>{const items=[{id:'f',kind:'film',title:'Film',runtime:90,source:{type:'local',value:'film.mp4'}},{id:'s',kind:'series',title:'Series',episodes:[{id:'e1',season:1,number:1,runtime:25,source:{type:'local',value:'e1.mp4'}},{id:'e2',season:1,number:2,runtime:25,source:{type:'local',value:'e2.mp4'}},{id:'unknown',season:1,number:3,source:{type:'local',value:'e3.mp4'}}]}],history=[{key:'file:film.mp4',position:3600,duration:5400,lastWatched:1}],before=JSON.stringify({items,history}),first=model.eveningPlan(items,history,{minutes:60,breakMinutes:5}),selected=first.candidates.filter(r=>r.episodeId||r.itemId==='f').map(r=>r.key),plan=model.eveningPlan(items,history,{minutes:60,breakMinutes:5,selected});assert.equal(first.unknown,1);assert.equal(first.candidates.find(r=>r.itemId==='f').remainingSeconds,1800);assert.equal(plan.totalSeconds,90*60);assert.equal(plan.fits,false);const pair=model.eveningPlan(items,history,{minutes:60,breakMinutes:5,selected:selected.slice(-2)});assert.equal(pair.totalSeconds,55*60);assert.equal(pair.fits,true);assert.equal(JSON.stringify({items,history}),before);});

test('real season metadata retains per-episode runtime through catalog persistence into the local plan',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'episode-runtime-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const client=require('../src/catalog-discovery').createMetadataClient(async()=>new Response(JSON.stringify({episodes:[{episode_number:1,name:'Known',runtime:26},{episode_number:2,name:'Unknown',runtime:null}]}))),episodes=await client.season({kind:'series',tmdbId:'tv:42'},1,'synthetic-key-not-a-real-key');assert.equal(episodes[0].runtime,26);const file=path.join(dir,'catalog.json'),make=()=>require('../src/media-catalog-store').createMediaCatalogStore({filePath:file}),store=make();store.upsert({kind:'series',title:'Series',episodes:episodes.map((e,i)=>({...e,source:{type:'local',value:path.join(dir,'e'+i+'.mp4')}}))});const reopened=make().list(),plan=model.eveningPlan(reopened,[],{minutes:60});assert.equal(reopened[0].episodes[0].runtime,26);assert.equal(plan.candidates[0].remainingSeconds,26*60);assert.equal(plan.unknown,1);});


test('R853 G08 review checkpoint persists across service reopen, guards revision and preserves personal notes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r853-review-draft-')),close=[],item={id:'film',kind:'film',title:'Example',year:2020,imdbId:'tt1234567'};
 const file=path.join(dir,'media-enrichment.json'),previous={version:1,titles:{film:{feedback:{reaction:'dislike',note:'private fixture'},history:[]}},audio:{film:'night'}};
 const open=()=>tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},dialog:{},authorized:()=>true,catalogStore:()=>({get:()=>item})});
 const url='https://letterboxd.com/film/example/reviews/by/activity/page/3/',value={identity:item,reviews:JSON.stringify([{id:'1',author:'Fixture',authorId:'fixture',text:'A full review fixture.',source:{url,sort:'popular',page:3}}]),pages:[url],url,sort:'popular',partial:true};
 try{
  fs.writeFileSync(file,JSON.stringify(previous));const service=open(),first=await service.handle({}, {action:'reviews-draft-get',itemId:'film'});assert.equal(first.value,null);
  const saved=await service.handle({}, {action:'reviews-draft-save',itemId:'film',revision:first.revision,value});assert.equal(saved.ok,true,saved.error);
  const loaded=await open().handle({}, {action:'reviews-draft-get',itemId:'film'});assert.deepEqual(loaded.value,saved.value);assert.equal(model.reviewContinuation(loaded.value),'https://letterboxd.com/film/example/reviews/by/activity/page/4/');
  assert.equal((await service.handle({}, {action:'reviews-draft-save',itemId:'film',revision:first.revision,value})).ok,false);
  assert.equal((await service.handle({}, {action:'reviews-draft-save',itemId:'film',revision:loaded.revision,value:{...value,identity:{...item,imdbId:'tt9999999'}}})).ok,false);
  const data=JSON.parse(fs.readFileSync(file));assert.deepEqual(data.titles,previous.titles);assert.deepEqual(data.audio,previous.audio);assert.equal(data.reviewDrafts.length,1);
  const pkg=require('../src/workspace-package'),target=path.join(dir,'copy.wbp');pkg.exportPackage(dir,target);const restored=path.join(dir,'restored');fs.mkdirSync(restored);pkg.restorePackage(restored,pkg.readPackage(target));const roundtrip=JSON.parse(fs.readFileSync(path.join(restored,'media-enrichment.json')));assert.deepEqual(roundtrip.reviewDrafts[0].value,saved.value);assert.deepEqual(roundtrip.titles,previous.titles);
 }finally{for(const fn of close)fn();fs.rmSync(dir,{recursive:true,force:true});}
});
test('R853 G08 continuation respects sort, incomplete page, URL bounds and mixed samples',()=>{
 const item={kind:'film',title:'Example',year:2020,imdbId:'tt1234567'},url='https://letterboxd.com/film/example/reviews/by/activity/page/3/';
 const base={identity:item,reviews:JSON.stringify([{text:'Full fixture review.'}]),pages:[url],url,sort:'popular',incomplete:true};
 assert.equal(model.reviewContinuation(model.reviewCheckpoint(item,base)),url);
 assert.equal(model.reviewContinuation({...base,sort:'balanced'}),null);
 assert.throws(()=>model.reviewCheckpoint(item,{...base,pages:['https://letterboxd.com/film/another/reviews/']}),/source/i);
 assert.throws(()=>model.reviewCheckpoint(item,{...base,url:'https://letterboxd.com/film/example/reviews/?token=secret'}),/source/i);
});
test('R853 G09 sample comparison uses source identity rather than positional IDs, keeps full text and unknown authors',()=>{
 const old={id:'1',author:'Alice',text:'Original complete review.',permalink:'https://letterboxd.com/alice/film/example/',source:{url:'https://letterboxd.com/film/example/reviews/'}};
 const next={...old,id:'7',author:'New display name',text:'Changed complete review.',source:{url:'https://letterboxd.com/film/example/reviews/page/2/'}};
 const changes=model.compareReviewSamples([old,{id:'2',author:'',text:'Unidentified first review.'}],[next,{id:'2',author:'',text:'Unidentified other review.'}]);
 assert.deepEqual(changes.map(r=>r.kind),['changed','added','removed']);assert.equal(changes[0].before.text,old.text);assert.equal(changes[0].after.text,next.text);assert.equal(changes[1].after.author,'');
 assert.equal(model.compareReviewSamples([old],[{...old,id:'99'}])[0].kind,'unchanged');
});

test('R853 G08/G09 editor requires explicit save/restore and clears spoiler previews when spoilers turn off',async t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main/>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.HTMLElement.prototype.scrollIntoView=function(){};w.UiLocale={get:()=> 'en'};w.player={};
 w.MediaToolsModel=model;w.LetterboxdReviews=require('../src/letterboxd-reviews');const item={id:'film',kind:'film',title:'Example',year:2020,imdbId:'tt1234567'},url='https://letterboxd.com/film/example/reviews/',calls=[],errors=[];
 const draft={reviews:JSON.stringify([{id:'1',author:'Fixture',text:'SPOILER_FIXTURE hidden review text.',spoiler:true}]),spoiler:true,source:{identity:item,url,pages:[url],sampling:{mode:'new'},match:{state:'matched'}}};let saved=null;
 w.api={mediaShelf:async()=>({ok:true,taste:{}}),mediaTools:async input=>{calls.push(input);if(input.action==='reviews-draft-get')return {ok:true,value:saved,revision:'r1'};if(input.action==='reviews-draft-save'){saved=input.value;return {ok:true,value:saved,revision:'r2'};}throw Error(input.action);}};
 w.eval(fs.readFileSync('src/renderer/review-decision-ui.js','utf8'));const dispose=w.MediaReviewDecision.mount(w.document.querySelector('main'),item,{},draft,{current:()=>true,redraw(){},status:value=>errors.push(value)});
 const click=label=>{const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);assert(b,label);b.click();};const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
 assert.equal(calls.length,0);click('Preview saved draft');await settle();click('Save current sample locally');await settle();assert(saved);click('Preview saved draft');await settle();assert(w.document.body.textContent.includes('SPOILER_FIXTURE'));
 click('Restore this saved sample');assert.equal(draft.reviews,saved.reviews);const spoiler=w.document.querySelector('[name=review-spoilers]');assert(spoiler);spoiler.checked=false;spoiler.dispatchEvent(new w.Event('change'));assert(!w.document.body.textContent.includes('SPOILER_FIXTURE'));assert.deepEqual(calls.map(r=>r.action),['reviews-draft-get','reviews-draft-save','reviews-draft-get']);assert.equal(errors.length,0);dispose();
});

test('R853 L02 coverage separates pools/pages, unique known authors, unknown metadata and actual send counts',()=>{
 const popular='https://letterboxd.com/film/example/reviews/by/activity/',low='https://letterboxd.com/film/example/reviews/by/entry-rating-lowest/',rows=[{id:'1',authorId:'alice',text:'First full review.',source:{url:popular}},{id:'2',authorId:'alice',text:'Another full review.',source:{url:low}},{id:'3',text:'An imported review.'}];
 const c=model.reviewCoverage(rows,{pages:[popular,low],sampling:{requested:40},excluded:{duplicate:2,incomplete:1}},[rows[0],rows[2]]);assert.equal(c.visible,3);assert.equal(c.identifiedAuthors,1);assert.equal(c.unknownAuthors,1);assert.equal(c.unknownSources,1);assert.equal(c.visitedPages,2);assert.equal(c.sent,2);assert.equal(c.requestedLast,40);assert.equal(c.groups.length,3);assert.equal(c.groups.find(g=>g.pool==='low').sent,0);assert.equal(c.sourceExcluded.incomplete,1);assert.equal(model.reviewCoverage(rows).sent,null);
});
test('R853 L08 feedback belongs to the exact saved analysis, persists across reopen and preserves personal state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r853-analysis-feedback-')),close=[],item={id:'film',kind:'film',title:'Fixture',year:2020,imdbId:'tt1234567'},file=path.join(dir,'media-enrichment.json');
 const open=()=>tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,dialog:{},catalogStore:()=>({get:()=>item})});
 try{
  const service=open(),saved=await service.handle({}, {action:'decision-save',itemId:'film',reviews:[{id:'1',text:'Excellent acting throughout.'}],analysis:{summary:'Fixture analysis',points:[{id:'1',quote:'Excellent acting',reason:'Evidence'}]}});assert(saved.ok,saved.error);
  const data=JSON.parse(fs.readFileSync(file));data.titles.film.feedback={reaction:'dislike',note:'Private fixture reaction'};data.audio={film:'night'};fs.writeFileSync(file,JSON.stringify(data));
  const loaded=await service.handle({}, {action:'decision-get',itemId:'film'}),entry=loaded.value.history[0],analysisBefore=JSON.stringify(data.titles.film.history[0]),changed=await service.handle({}, {action:'decision-analysis-feedback',itemId:'film',analysisKey:entry.analysisKey,revision:entry.analysisFeedbackRevision,kind:'narrow-sample'});assert(changed.ok,changed.error);
  const reopened=await open().handle({}, {action:'decision-get',itemId:'film'});assert.equal(reopened.value.history[0].analysisKey,entry.analysisKey);assert.equal(reopened.value.history[0].analysisFeedback.kind,'narrow-sample');
  const stored=JSON.parse(fs.readFileSync(file)),{analysisFeedback,...unchanged}=stored.titles.film.history[0];assert.equal(JSON.stringify(unchanged),analysisBefore);assert.deepEqual(stored.titles.film.feedback,data.titles.film.feedback);assert.deepEqual(stored.audio,data.audio);
  const pkg=require('../src/workspace-package'),archive=path.join(dir,'analysis.wbp'),restored=path.join(dir,'restored');fs.mkdirSync(restored);pkg.exportPackage(dir,archive);pkg.restorePackage(restored,pkg.readPackage(archive));assert.equal(JSON.parse(fs.readFileSync(path.join(restored,'media-enrichment.json'))).titles.film.history[0].analysisFeedback.kind,'narrow-sample');
  assert.equal((await service.handle({}, {action:'decision-analysis-feedback',itemId:'film',analysisKey:entry.analysisKey,revision:entry.analysisFeedbackRevision,kind:'useful'})).ok,false);
  const cleared=await service.handle({}, {action:'decision-analysis-feedback',itemId:'film',analysisKey:entry.analysisKey,revision:changed.revision,kind:null});assert(cleared.ok);assert(!JSON.parse(fs.readFileSync(file)).titles.film.history[0].analysisFeedback);
  item.imdbId='tt9999999';assert.equal((await service.handle({}, {action:'decision-analysis-feedback',itemId:'film',analysisKey:entry.analysisKey,revision:cleared.revision,kind:'useful'})).ok,false);
  assert.throws(()=>model.validateAnalysisFeedback({kind:'dislike',at:1}),/Invalid analysis feedback/);
 }finally{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});}
});

test('R853 L02/L08 editor shows scoped coverage and saves/clears analysis feedback without invoking AI',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r853-review-feedback-ui-')),close=[],item={id:'film',kind:'film',title:'Fixture',year:2020,imdbId:'tt1234567'},toolsApi=tools.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,dialog:{},catalogStore:()=>({get:()=>item})});t.after(()=>{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});});
 const source='https://letterboxd.com/film/fixture/reviews/',reviews=[{id:'1',authorId:'fixture',text:'Excellent acting throughout.',source:{url:source}}];assert((await toolsApi.handle({}, {action:'decision-save',itemId:'film',reviews,analysis:{summary:'Fixture analysis',points:[{id:'1',quote:'Excellent acting',reason:'Evidence'}]}})).ok);
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main/>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.HTMLElement.prototype.scrollIntoView=function(){};w.UiLocale={get:()=> 'en'};w.player={};w.MediaToolsModel=model;w.LetterboxdReviews=require('../src/letterboxd-reviews');const actions=[];w.api={mediaShelf:async input=>{assert.equal(input.action,'taste-profile');return {ok:true,taste:{}};},mediaTools:async input=>{actions.push(input.action);return toolsApi.handle({},input);}};w.eval(fs.readFileSync('src/renderer/review-decision-ui.js','utf8'));
 const saved=(await toolsApi.handle({}, {action:'decision-get',itemId:'film'})).value,draft={reviews:JSON.stringify(reviews),source:{identity:item,pages:[source],url:source,sampling:{mode:'new',requested:40},match:{state:'matched'}}},dispose=w.MediaReviewDecision.mount(w.document.querySelector('main'),item,saved,draft,{current:()=>true,redraw(){},status(){}});t.after(dispose);
 const box=w.document.querySelector('.mrv-analysis-feedback');assert(box);assert(w.document.querySelector('.mrv-sample-coverage').textContent.includes('last requested 40'));const select=box.querySelector('select');assert.equal(select.value,'');select.value='quote-issue';const buttons=box.querySelectorAll('button');buttons[0].click();for(let i=0;i<5;i++)await new Promise(setImmediate);assert.equal((await toolsApi.handle({}, {action:'decision-get',itemId:'film'})).value.history[0].analysisFeedback.kind,'quote-issue');buttons[1].click();for(let i=0;i<5;i++)await new Promise(setImmediate);assert(!(await toolsApi.handle({}, {action:'decision-get',itemId:'film'})).value.history[0].analysisFeedback);assert.deepEqual(actions,['decision-analysis-feedback','decision-analysis-feedback']);
});

test('R853 G10/L07 counts independent author IDs per theme, leaves uncovered themes unknown and maps only embedded exact quotes',()=>{
 const reviews=[{id:'a',authorId:'same',text:'Strong acting and slow pacing.'},{id:'b',authorId:'same',text:'The acting works very well.'},{id:'c',text:'Another view about acting.'}],analysis={summary:'Review says: Strong acting.',fit:'You might like it.',points:[{id:'a',topic:'characters',kind:'praise',quote:'Strong acting'},{id:'a',topic:'characters',kind:'praise',quote:'Strong acting'},{id:'b',topic:'characters',kind:'praise',quote:'acting works'},{id:'a',topic:'characters',kind:'criticism',quote:'slow pacing'},{id:'c',topic:'characters',kind:'praise',quote:'view about acting'},{id:'a',topic:'sound',kind:'praise',quote:'Invented quotation'}]};
 const topics=model.reviewTopicEvidence(analysis,reviews),characters=topics.find(row=>row.topic==='characters');assert.equal(characters.kinds.praise.reviews,3);assert.equal(characters.kinds.praise.authors.length,1);assert.equal(characters.kinds.praise.unknownReviews,1);assert.equal(characters.overlappingAuthors.length,1);assert.equal(topics.find(row=>row.topic==='sound').covered,false);assert.equal(topics.find(row=>row.topic==='pace').covered,false);
 const synthesis=model.synthesisEvidence(analysis,reviews);assert.equal(synthesis[0].exactQuotes.length,1);assert.equal(synthesis[1].exactQuotes.length,0);assert.equal(synthesis[1].kind,'fit');
});

test('R853 G10/L07 UI links actual quotations while uncovered topics and unverified synthesis stay explicit',t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main/>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.UiLocale={get:()=> 'en'};w.MediaToolsModel=model;w.HTMLElement.prototype.scrollIntoView=function(){};let opened=0;w.api={openExternal:()=>opened++};w.eval(fs.readFileSync('src/renderer/review-decision-ui.js','utf8'));const reviews=[{id:'a',authorId:'fixture',text:'Strong acting throughout.'}],analysis={summary:'Strong acting throughout.',fit:'You may appreciate this film.',points:[{id:'a',topic:'characters',kind:'praise',quote:'Strong acting',reason:'A cited observation.'}]},before=JSON.stringify(analysis),host=w.document.querySelector('main');w.MediaReviewDecision.resultView(host,analysis,reviews,{preferencesConfigured:true,preferences:{weights:{characters:1}}});assert(host.querySelector('.mrv-topic-evidence').textContent.includes('No verified cited observation'));assert(host.querySelector('.mrv-topic-evidence').textContent.includes('1 known authors / 1 reviews'));const claims=host.querySelectorAll('.mrv-synthesis-claim');assert.equal(claims[0].querySelectorAll('a').length,1);assert(claims[1].textContent.includes('semantic support remains unverified'));claims[0].querySelector('a').click();assert(w.document.activeElement.classList.contains('mrv-point'));assert.equal(opened,0);assert.equal(JSON.stringify(analysis),before);
});

test('R853 refreshed review identity requires canonical author and permalink; sample absence is never called website deletion',()=>{
 const model=require('../src/renderer/media-tools-model'),before=[{permalink:'https://letterboxd.com/a/film/film/',authorId:'a',text:'Original'},{permalink:'https://letterboxd.com/b/film/film/',authorId:'b',text:'Another'}];const rows=model.refreshReviewDiff(before,[{...before[0],text:'Changed'},{...before[1],authorId:'other'}],{sameFilm:true});assert.equal(rows[0].kind,'changed');assert.equal(rows[1].kind,'unmatched');assert.equal(rows[2].kind,'absent-from-refreshed-sample');assert.throws(()=>model.refreshReviewDiff(before,before),/exact film/);assert(!rows.some(r=>r.kind==='deleted'));
});

test('R853 explicit exact review refresh distinguishes changed text, unavailable permalink and access failure without rewriting snapshots',async()=>{
 const {refresh}=require('../src/review-source-refresh'),item={kind:'film',title:'Film',year:2020,tmdbId:'movie:42'},permalink='https://letterboxd.com/ann/film/film/',before={id:'1',author:'Ann',authorId:'ann',permalink,text:'Original source review text.'},entries=[{identity:{title:'Film',year:2020,tmdbId:'movie:42'},reviews:[before]}],base={item,entries,permalink,authorId:'ann',oldText:before.text},snapshot=JSON.stringify(entries);const html='<meta property="og:title" content="Reviews of Film (2020) • Letterboxd"><div data-tmdb-id="42"></div><li class="film-detail"><a class="name" href="/ann/">Ann</a><a href="/ann/film/film/">Review</a><div class="body-text js-review-body"><p>Changed source review text.</p></div></li>';let calls=0;const changed=await refresh({...base,fetchImpl:async(url,options)=>{calls++;assert.equal(url,permalink);assert.equal(options.credentials,'omit');return new Response(html);}});assert.equal(changed.status,'changed');assert.equal(changed.after.authorId,'ann');assert.equal(calls,1);assert.equal((await refresh({...base,fetchImpl:async()=>new Response('',{status:404})})).status,'permalink-unavailable');assert.equal((await refresh({...base,fetchImpl:async()=>new Response('',{status:403})})).status,'access-unverified');await assert.rejects(refresh({...base,authorId:'other',fetchImpl:async()=>{throw Error('must not fetch');}}),/canonical/);assert.equal(JSON.stringify(entries),snapshot);
});
