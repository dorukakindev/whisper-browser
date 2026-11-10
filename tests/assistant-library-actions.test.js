'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
function setup(){const dom=new JSDOM('<select id="uiTheme"><option>system</option><option>dark</option><option>light</option></select><select id="uiLocale"><option>en</option><option>tr</option></select><select id="browserSponsorMode"><option>off</option><option>ask</option><option>auto</option></select>',{runScripts:'outside-only'}),w=dom.window;let state=true,payloads=[];w.AssistantAppActions={current:()=>state};w.UiLocale={get:()=> 'en'};w.saveAppSettings=async()=>true;w.api={mediaCatalog:async()=>({ok:true,items:Array.from({length:20},(_,i)=>({id:'real-'+i,title:'Film '+i,kind:'film',synopsis:'s'.repeat(4000),source:{value:'C:\\private'},collections:[]}))}),assistantCollections:async input=>(payloads.push(input),{ok:true,plan:{id:'plan'}})};w.eval(fs.readFileSync(path.join(__dirname,'../src/text-fold.js'),'utf8'));let retainedReview;w.AssistantFilmActions={handles:()=>false,rememberReviewEvidence:(_item,result)=>{retainedReview=result;},reviewEvidenceResult:async()=>({film:{analysis:retainedReview?.analysis,sourceCount:retainedReview?.reviews?.length||0}})};w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/assistant-library-actions.js'),'utf8'));return {dom,w,run:(name,args={})=>w.AssistantLibraryActions.execute(name,args,{}),stale:()=>state=false,payloads};}
test('Library evidence is bounded and strips filesystem paths',async()=>{const h=setup();try{const r=await h.run('search_library');assert.equal(r.count,20);assert.equal(r.items.length,8);assert(JSON.stringify(r).length<16000);assert(!JSON.stringify(r).includes('private'));assert.equal((await h.run('get_title_details',{item_id:'catalog:real-1'})).item.title,'Film 1');await assert.rejects(h.run('get_title_details',{item_id:'catalog:invented'}));await assert.rejects(h.run('plan_library_collection',{name:'Plan',ids:'discovery:film:tt1234567'}));assert.equal(h.payloads.length,0);h.stale();await assert.rejects(h.run('search_library'),/changed/);}finally{h.dom.window.close();}});
test('Only normal preferences are read; undo refuses later manual edits',async()=>{const h=setup();try{const before=await h.run('get_app_preferences');assert.deepEqual(Object.keys(before.preferences),['theme','language','sponsorMode']);await h.run('set_app_preferences',{theme:'dark'});assert.equal((await h.run('get_app_preferences')).canUndo,true);await h.run('undo_app_preferences');assert.equal(h.w.document.getElementById('uiTheme').value,'system');await h.run('set_app_preferences',{theme:'dark'});h.w.document.getElementById('uiLocale').value='tr';await assert.rejects(h.run('undo_app_preferences'),/changed/);}finally{h.dom.window.close();}});

test('Playback commands refuse parked media and use only the existing current browser bridge',async()=>{const h=setup();try{let calls=[];h.w.player={workspaceMode:'browser'};h.w.browserCommand=async(name,value)=>(calls.push({name,value}),{ok:true});h.w.BrowserDubAudioUI={context:()=>({hasMedia:true,visible:false})};await assert.rejects(h.run('playback_control',{operation:'play'}));assert.equal(calls.length,0);h.w.BrowserDubAudioUI.context=()=>({hasMedia:true,visible:true});assert.equal((await h.run('playback_control',{operation:'speed',value:1.25})).status,'completed');assert.equal(calls[0].name,'speed');assert.equal(calls[0].value,1.25);}finally{h.dom.window.close();}});

test('Library pages enumerate all matching IDs without repeats or private fields',async()=>{const h=setup();try{const ids=[];let offset=0;do{const r=await h.run('search_library',{offset});assert.equal(r.offset,offset);assert.equal(r.count,20);ids.push(...r.items.map(i=>i.id));offset=r.nextOffset;}while(offset!==null);assert.equal(ids.length,20);assert.equal(new Set(ids).size,20);await assert.rejects(h.run('search_library',{offset:1.5}));}finally{h.dom.window.close();}});

test('Discovery review loading uses a verified discovery key, returns ten bounded reviews and never adds a library title',async()=>{
 const h=setup();try{const item={kind:'film',providerId:'tt14173636',title:'The Invite',year:2026};const requests=[];let draft;
 h.w.api.mediaDiscovery=async r=>{assert.equal(r.action,'detail');return {ok:true,item};};
 h.w.api.mediaTools=async r=>{requests.push(r);return {ok:true,match:{state:'matched'},reviews:Array.from({length:12},(_,i)=>({id:String(i),author:'Reader',text:'Review '.repeat(160)}))};};
 h.w.MediaToolsUI={keepReviewSample:(i,r)=>{draft={i,r};}};
 const result=await h.run('load_title_reviews',{item_id:'discovery:film:tt14173636',source:'automatic'});
 assert.equal(result.status,'completed');assert.equal(result.film.sourceCount,12);assert.equal(requests[0].discovery.id,item.providerId);assert.equal(requests[0].itemId,undefined);assert.equal(requests[0].count,40);assert.equal(requests[0].sort,'popular');assert.equal(result.loadedCount,12);assert.equal(draft.i.id,'discovery:film:tt14173636');assert.equal(draft.i.discovery.id,item.providerId);assert.equal(draft.r.reviews.length,12);assert(JSON.stringify(result).length<16000);
 h.w.api.mediaTools=async()=>({ok:true,match:{state:'mismatch'},reviews:[]});await assert.rejects(h.run('load_title_reviews',{item_id:'discovery:film:tt14173636',source:'automatic'}),/did not match/);
 }finally{h.dom.window.close();}
});

test('Playback reads visible source state and sets volume through the existing media command',async()=>{const h=setup();try{const calls=[];h.w.player={workspaceMode:'browser',browserTime:12,browserDuration:90,browserRate:1.25,browserVolume:.8,browserPaused:false};h.w.browserCommand=async(name,value)=>(calls.push({name,value}),{ok:true});h.w.BrowserDubAudioUI={context:()=>({hasMedia:true,visible:true})};assert.equal((await h.run('get_playback_state')).playback.position,12);await h.run('playback_control',{operation:'volume',value:.4});assert.equal(calls[0].name,'volume-set');assert.equal(calls[0].value,.4);}finally{h.dom.window.close();}});

test('Discovery review analysis opens and previews the same draft without adding a library title',async()=>{
 const h=setup();try{const item={kind:'film',providerId:'tt14173636',title:'The Invite',year:2026},opened=[],previews=[];h.w.api.mediaDiscovery=async()=>({ok:true,item});h.w.MediaToolsUI={open:(page,row)=>opened.push({page,row}),previewReviewAnalysis:(row,analysis)=>previews.push({row,analysis})};
  await h.run('open_review_analysis',{item_id:'discovery:film:tt14173636'});await h.run('preview_title_review_analysis',{item_id:'discovery:film:tt14173636',analysis:'{"summary":"A controlled preview"}'});assert.equal(opened.length,1);assert.equal(opened[0].row.id,'discovery:film:tt14173636');assert.equal(opened[0].row.discovery.id,item.providerId);assert.equal(previews[0].row.id,opened[0].row.id);assert.equal(previews[0].analysis.summary,'A controlled preview');assert.equal(h.payloads.length,0);
 }finally{h.dom.window.close();}
});
test('Combined review request forwards arbitrary count and returns bounded analysis without opening another assistant or adding title',async()=>{
 const h=setup();try{let request;h.w.api.mediaDiscovery=async()=>({ok:true,item:{kind:'film',providerId:'tt14173636',title:'The Invite',year:2026}});h.w.api.mediaTools=async input=>{request=input;return {ok:true,requestedCount:37,loadedCount:30,analyzedCount:30,analysis:{summary:'Sample praise',fit:'No personal evidence',points:[{id:'R30',quote:'A memorable performance',reason:'Acting is praised.',kind:'praise'}]}};};const r=await h.run('analyze_title_reviews',{item_id:'discovery:film:tt14173636',count:37});assert.equal(request.action,'reviews-analyze');assert.equal(request.count,37);assert.equal(r.loadedCount,30);assert.equal(r.analysis.points[0].id,'R30');assert.equal(r.saved,false);assert(JSON.stringify(r).length<16000);assert.equal(h.payloads.length,0);}finally{h.dom.window.close();}
});
test('Assistant can read a verified director filmography and exact library matches without adding titles',async()=>{const h=setup();try{const req=[];h.w.api.mediaCatalog=async p=>{req.push(p);if(p.action==='list')return {ok:true,items:[{id:'real-1',kind:'film',title:'Film 1',tmdbId:'movie:42'}]};assert.equal(p.action,'metadata-film-person');assert.equal(p.personId,8);return {ok:true,person:{id:8,name:'Director',biography:'Known biography',films:[{kind:'film',tmdbId:'movie:42',title:'Film 1',year:2020},{kind:'film',tmdbId:'movie:99',title:'Other',year:2021}]}};};const r=await h.run('get_film_person_info',{item_id:'catalog:real-1',person_id:8});assert.equal(r.person.filmography[0].item_id,'catalog:real-1');assert.equal(r.person.filmography[1].inLibrary,false);assert.equal(req.some(p=>p.action==='save'||p.action==='metadata-add-recommendation'),false);assert(JSON.stringify(r).length<16000);}finally{h.dom.window.close();}});

test('Discovery saves report the requested provider target and actual saved catalog identity',async()=>{
 const h=setup();try{const calls=[];let existing=false;
  h.w.api.mediaDiscovery=async packet=>{calls.push(packet);return packet.action==='detail'?{ok:true,item:{providerId:'tt14173636',title:'Same title',kind:'film'}}:{ok:true,item:{id:'saved-42',imdbId:'tt14173636',title:'Same title',kind:'film'},existing};};
  let result=await h.run('add_discovery_title',{item_id:'discovery:film:tt14173636'});
  assert.equal(result.requested_item_id,'discovery:film:tt14173636');assert.equal(result.item_id,'catalog:saved-42');assert.equal(result.existing,false);assert.equal(result.item.id,result.item_id);
  existing=true;result=await h.run('add_discovery_title',{item_id:'discovery:film:tt14173636'});assert.equal(result.existing,true);assert.equal(calls.filter(c=>c.action==='add').length,2);
 }finally{h.dom.window.close();}
});


test('Taste reads preserve explicit versus observed evidence and stale analysis without private fields',async()=>{
 const h=setup();try{h.w.api.mediaShelf=async()=>({ok:true,taste:{rated:2,preferencesConfigured:false,preferences:{weights:{story:3},note:'A saved note'},preferencesRevision:'prefs-1',evidenceRevision:'evidence-1',coverage:{ratedTitles:2,missingMetadata:1,limitations:['Small sample'],privatePath:'private'},signals:{genres:[{name:'Drama',direction:'positive',count:2,confidence:'limited',evidence:[{title:'Film',rating:4,itemId:'real-1',path:'private'}]}]},analysisState:'stale',analysis:{summary:'Past interpretation'},reviews:[{id:'r1',title:'Film',text:'x'.repeat(2000)}]}});
 const r=await h.run('get_taste_profile');assert.equal(r.profile.preferencesConfigured,false);assert.equal(r.profile.signals.genres[0].evidence[0].item_id,'catalog:real-1');assert.equal(r.profile.coverage.missingMetadata,1);assert.equal(r.profile.acceptedAnalysis.historical,true);assert.equal(r.profile.reviews[0].text.length,800);assert(!JSON.stringify(r).includes('private'));
 }finally{h.dom.window.close();}
});
test('Taste recommendations forward explicit constraints and return bounded real catalog evidence without writes',async()=>{
 const h=setup();try{const calls=[];h.w.api.mediaShelf=async p=>{calls.push(p);return {ok:true,evidenceRevision:'e1',preferencesRevision:'p1',coverage:{missingMetadata:2},recommendations:Array.from({length:8},(_,i)=>({itemId:'real-'+i,title:'Film '+i,reasons:['Rated genre'],confidence:'limited',evidence:[{title:'Known film',rating:4}],limitations:['Small sample']}))};};
 const r=await h.run('recommend_from_taste',{kind:'film',max_duration_minutes:90,exploration:true,limit:2});assert.equal(calls.length,1);assert.equal(calls[0].action,'taste-recommendations');assert.equal(calls[0].maxDuration,90);assert.equal(calls[0].exploration,true);assert.equal(r.recommendations.length,2);assert.equal(r.recommendations[0].item_id,'catalog:real-0');assert.equal(r.coverage.missingMetadata,2);h.stale();await assert.rejects(h.run('recommend_from_taste'),/changed/);
 }finally{h.dom.window.close();}
});
test('General taste writes require the exact reviewed proposal and revision, and preserve explicit patch scope',async()=>{
 const h=setup();try{const calls=[],args={story:5,avoid:['pace'],note:'Explicit global request'};let revision='p1';const profile=()=>({preferencesRevision:revision,preferences:{weights:{story:5}},preferencesConfigured:true});h.w.api.mediaShelf=async p=>{calls.push(p);if(p.action==='list')return {ok:true,taste:profile()};return {ok:true,taste:profile()};};
 await assert.rejects(h.run('update_taste_preferences',args),/reviewed/);assert.equal(calls.length,0);
 const expectedSettings={kind:'taste-preferences',revision:'p1',args:JSON.stringify(args)};
 let r=await h.w.AssistantLibraryActions.execute('update_taste_preferences',args,{}, {expectedSettings});assert.equal(r.status,'completed');const write=calls.find(p=>p.action==='taste-preferences');assert.equal(write.expectedPreferencesRevision,'p1');assert.deepEqual(JSON.parse(JSON.stringify(write.patch)),{weights:{story:5},avoid:['pace'],note:'Explicit global request'});
 calls.length=0;revision='p2';r=await h.w.AssistantLibraryActions.execute('update_taste_preferences',args,{}, {expectedSettings});assert.equal(r.stale,true);assert.equal(calls.length,1);await assert.rejects(h.w.AssistantLibraryActions.execute('update_taste_preferences',{story:4},{},{expectedSettings}),/reviewed/);
 }finally{h.dom.window.close();}
});


test('assistant recommendation reasons retain bounded source evidence and counterevidence without private fields',async()=>{
 const h=setup();try{const e={title:'Rated film',year:2000,rating:4,itemId:'real-1',ratingSource:'diary',ratingDate:'2026-11-01',path:'PRIVATE_PATH'};
 h.w.api.mediaShelf=async()=>({ok:true,recommendations:[{itemId:'real-2',title:'Candidate',reasonDetails:[{kind:'genre',name:'Drama',evidence:[e],evidenceCount:8}],counterEvidence:[{kind:'genre',name:'Horror',direction:'dislikes',evidence:[{...e,rating:1}],evidenceCount:1}],evidence:[e]}]});
 const r=await h.run('recommend_from_taste'),pick=r.recommendations[0];assert.equal(pick.reasonDetails[0].source,'saved-personal-ratings');assert.equal(pick.reasonDetails[0].evidence[0].ratingSource,'diary');assert.equal(pick.reasonDetails[0].evidence[0].ratingDate,'2026-11-01');assert.equal(pick.reasonDetails[0].evidenceTruncated,true);assert.equal(pick.counterEvidence[0].evidence[0].rating,1);assert(!JSON.stringify(r).includes('PRIVATE_PATH'));
 }finally{h.dom.window.close();}
});

test('opening a recommended title reports completion only for a matching successful UI receipt',async()=>{
 const h=setup();try{h.w.MediaTitleUI={open:async()=>({ok:false,error:'Could not load title'})};const failed=await h.run('open_library_title',{item_id:'catalog:real-1'});assert.equal(failed.status,'failed');
 h.w.MediaTitleUI.open=async()=>({ok:true,itemId:'different'});assert.equal((await h.run('open_library_title',{item_id:'catalog:real-1'})).status,'failed');
 h.w.MediaTitleUI.open=async()=>({ok:true,itemId:'real-1'});const ok=await h.run('open_library_title',{item_id:'catalog:real-1'});assert.equal(ok.status,'completed');assert.equal(ok.playbackStarted,false);assert.equal(h.payloads.length,0);
 }finally{h.dom.window.close();}
});


test('accepted review analysis retains source quotes separately from explicit preferences',async()=>{
 const h=setup();try{h.w.api.mediaShelf=async()=>({ok:true,taste:{preferencesConfigured:false,analysisState:'stale',analysis:{summary:'Historical interpretation',insights:[{aspect:'pace',direction:'dislikes',reason:'A saved model interpretation',evidence:[{id:'review-1',quote:'An actual accepted source quote',path:'PRIVATE_PATH'}]}]}}});
 const r=await h.run('get_taste_profile');assert.equal(r.profile.preferencesSource,'defaults-not-explicit');assert.equal(r.profile.acceptedAnalysis.source,'accepted-review-analysis');assert.equal(r.profile.acceptedAnalysis.historical,true);assert.equal(r.profile.acceptedAnalysis.insights[0].evidence[0].review_id,'review-1');assert.equal(r.profile.acceptedAnalysis.insights[0].evidence[0].quote,'An actual accepted source quote');assert(!JSON.stringify(r).includes('PRIVATE_PATH'));
 }finally{h.dom.window.close();}
});


test('actual title UI receipt stays failed after render failure and retries instead of claiming cached success',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/renderer/media-title.js'),'utf8'),start=source.indexOf('  async function open(id)'),end=source.indexOf("  document.addEventListener('ui-locale-change'",start),dom=new JSDOM('<body class="media-home-active"><div id="playerLayer" class="hidden"></div></body>');
 try{const document=dom.window.document;let reads=0;const env={document,Event:dom.window.Event,dialog:null,item:null,selected:null,opener:null,copyChoice:null,window:{},syncBrowserOcclusion(){},cancelStory(){},t:(en)=>en,el:(tag,cls,text)=>{const n=document.createElement(tag);n.textContent=text||'';return n;},button:()=>document.createElement('button'),createPage:()=>{const n=document.createElement('section');n.open=true;n.restorePosition=()=>{};document.body.append(n);return n;},close:()=>{env.dialog?.remove();env.dialog=null;},reload:async()=>{reads++;env.item={id:'id'};if(reads===1)throw Error('Controlled render failure');}};
 vm.runInNewContext(source.slice(start,end)+';globalThis.show=open;',env);assert.equal((await env.show('id')).ok,false);assert.equal((await env.show('id')).ok,true);assert.equal(reads,2);assert.equal((await env.show('id')).ok,true);assert.equal(reads,2);
 }finally{dom.window.close();}
});


test('personal watchlist preview displays translated state without applying it',async()=>{
 const h=setup();try{const calls=[];h.w.api.personalMedia=async p=>{calls.push(p);return {ok:true,token:'review',item:{revision:'r1'},preview:{title:'Film 1'}};};h.w.UiLocale={get:()=> 'tr'};
 const r=await h.w.AssistantLibraryActions.execute('propose_personal_media_update',{item_id:'catalog:real-1',watch_status:'planned',reaction:'like'},{owner:'source',thread:'thread'});
 assert.equal(r.operation,'preview');assert.match(r.summary,/İzlenme: İzlenecek/);assert.match(r.summary,/Tepki: Beğendim/);assert(!r.summary.includes('planned'));assert.deepEqual(calls.map(p=>p.action),['preview']);
 }finally{h.dom.window.close();}
});

test('assistant series recommendations use the real series taste pool through the shelf handler',async()=>{const h=setup(),os=require('node:os'),root=fs.mkdtempSync(path.join(os.tmpdir(),'series-domain-'));try{const handlers=new Map(),rows=[{id:'liked-series',kind:'series',title:'Liked series',genres:['Drama'],watchStatus:'completed',ratings:{personal:'9'}},{id:'new-series',kind:'series',title:'New series',genres:['Drama'],watchStatus:'planned',ratings:{}},{id:'film',kind:'film',title:'Other pool',genres:['Drama'],ratings:{personal:'1'}}];require('../src/media-shelf-service').registerMediaShelf({ipcMain:{handle:(k,v)=>handlers.set(k,v)},authorized:()=>true,userData:()=>root,catalogView:()=>rows});h.w.api.mediaShelf=args=>handlers.get('media-shelf:request')({sender:{id:1}},args);const actual=await h.run('recommend_from_taste',{kind:'series'});assert.equal(actual.recommendations[0]?.item_id,'catalog:new-series');const bad=await h.w.api.mediaShelf({action:'taste-recommendations',kind:'series',domain:'film'});assert.equal(bad.ok,false);}finally{h.dom.window.close();fs.rmSync(root,{recursive:true,force:true});}});
