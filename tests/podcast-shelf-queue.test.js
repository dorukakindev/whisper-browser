'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {isValidOutputNameSuffix,snapshotOptions}=require('../src/renderer/queue-lifecycle');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
function helpers(context){const start=source.indexOf('function podcastQueueOwnerCurrent(binding)'),end=source.indexOf('\nasync function releasePodcastQueueItem',start);vm.runInNewContext(source.slice(start,end)+';globalThis.persist=persistPodcastJobOutputs;',context);return context;}
function setup(){let snapshot={mediaKey:'shelf:A',generation:2,sourceVersion:'remote-A',sourceTrack:{id:'publisher-A',revision:'r1'}};const requests=[],paint=[];let starts=0;const ui={language:'auto',translateTo:'tr',translateModel:'model-A',translate:false};const state={queue:[],queueRunning:true,running:true};const context=helpers({window:{MediaShelfUI:{readSnapshot:()=>snapshot,applyPodcastOutput:async packet=>{paint.push(packet);return true;}},api:{readSubtitle:async()=>({ok:true,text:'00:00:01,000 --> 00:00:02,000\nTranslated'}),feedsRequest:async request=>{requests.push(request);return {ok:true};}}},state,player:{mediaKey:'unrelated-player',generation:99,cues:[{text:'do not borrow'}]},addToQueue(type,input,config){assert.equal(isValidOutputNameSuffix(config?.optionsOverride?.outputNameSuffix),true,'Podcast suffix must pass the main-process validator at enqueue');state.queue.push({id:state.queue.length+1,type,input,opts:snapshotOptions({...ui,...config?.optionsOverride})});return true;},renderQueue(){},startQueue(){starts++;},completedSubtitleOutputs:(_event,role)=>({[role]:{path:'managed-result.srt',status:'complete'}}),releasePodcastQueueItem:async()=>{}});return {context,state,ui,requests,paint,setSnapshot:value=>{snapshot=value;},get starts(){return starts;}};}
const binding={entryId:'feed-A',sourceVersion:'download-A',playbackSourceVersion:'remote-A',playbackOwner:'media-shelf',mediaKey:'shelf:A',generation:2,path:'managed-audio'};

test('exact receipt waits for persistence and reports saved-output errors instead of success',async()=>{
 const r=setup();r.context.interfaceChoice=(_tr,en)=>en;
 const own={id:'own',status:'done',podcastBinding:{...binding,persistence:'saving'}},other={id:'other',status:'running',podcastBinding:{...binding}};r.state.queue.push(own,other);r.state.currentQueueId='other';
 const expected={mediaKey:binding.mediaKey,generation:binding.generation,sourceVersion:'remote-A'};
 assert.equal(r.context.window.podcastQueueTaskState(expected,'own').state,'running');
 own.podcastBinding.persistence='failed';own.podcastBinding.persistenceError='Disk write failed';assert.equal(r.context.window.podcastQueueTaskState(expected,'own').state,'failed');
 own.podcastBinding.persistence='saved';assert.equal(r.context.window.podcastQueueTaskState(expected,'own').state,'complete');assert.equal(r.context.window.podcastQueueTaskState(expected,'missing').state,'idle');
 own.status='pending';own.podcastBinding.cancelRequested=true;own.podcastBinding.stopConfirmed=true;r.state.running=false;r.state.currentQueueId=null;assert.equal(r.context.window.podcastQueueTaskState(expected,'own').state,'stopped');
});

test('plain podcast translation receipt uses feed cancellation and never reads a subtitle file or seeks',async()=>{
 const r=setup();r.context.interfaceChoice=(_tr,en)=>en;r.context.document={getElementById:()=>({value:'tr'})};let resolve;const requests=[];
 r.context.window.api.feedsRequest=async request=>{requests.push(request);if(request.action==='cancel')return {ok:true};return new Promise(done=>resolve=done);};
 const captured={...binding,sourceVersion:'remote-A',sourceTranscriptText:'Publisher prose',track:{id:'publisher-A',revision:'r1',timed:false}};
 const receipt=await r.context.window.translatePodcastTextSource(captured),expected={...captured};
 assert(receipt.queued);assert.equal(r.context.window.podcastQueueTaskState(expected,receipt.id).state,'running');assert.equal(requests[0].expectedTranscriptText,'Publisher prose');
 resolve({ok:true,sourceTranscriptText:'Publisher prose',translation:{text:'Yayıncı metni'}});await new Promise(done=>setImmediate(done));
 assert.equal(r.context.window.podcastQueueTaskState(expected,receipt.id).state,'complete');assert.equal(r.paint[0].timed,false);assert.equal(r.paint[0].text,'Yayıncı metni');assert.equal(r.state.queue.length,0);
 const second=await r.context.window.translatePodcastTextSource(captured);assert.equal(r.context.window.cancelPodcastQueueTask(expected,second.id),true);resolve({ok:false,error:'Cancelled'});await new Promise(done=>setImmediate(done));assert.equal(r.context.window.podcastQueueTaskState(expected,second.id).state,'stopped');assert(requests.some(request=>request.action==='cancel'&&request.requestId===second.id));
});
test('Shelf audio enters the existing queue using shelf owner without borrowing main player',async()=>{const run=setup();await run.context.window.queuePodcastSource(binding);assert.equal(run.state.queue.length,1);assert.equal(run.state.queue[0].podcastBinding.sourceVersion,'download-A');assert.equal(run.starts,0);run.setSnapshot({mediaKey:'shelf:B',generation:3,sourceVersion:'B'});await assert.rejects(run.context.window.queuePodcastSource(binding),/changed/);assert.equal(run.state.queue.length,1);});
test('Shelf translation uses granted materialized path, frozen existing UI options and explicit track revision',async()=>{const run=setup();const translate={...binding,sourceVersion:'remote-A',materializedPath:'managed-publisher.srt',track:{id:'publisher-A',revision:'r1',timed:true,language:'en',cues:[{start:1,end:2,text:'source'}]}};await run.context.window.translatePodcastSource(translate);run.ui.translateTo='de';run.ui.translateModel='model-B';const job=run.state.queue[0];assert.equal(job.input,'managed-publisher.srt');assert.equal(job.opts.translateOnly,true);assert.equal(job.opts.translate,true);assert.equal(job.opts.translateTo,'tr');assert.equal(job.opts.translateModel,'model-A');assert.equal(job.opts.language,'en');assert.equal(job.podcastBinding.outputRole,'translation');assert.equal(job.podcastBinding.track.revision,'r1');await assert.rejects(run.context.window.translatePodcastSource({...translate,track:{...translate.track,revision:'r2'}}),/changed/);assert.equal(run.state.queue.length,1);});
test('A processing result persists to its registry and paints only the captured stream or exact source',async()=>{const run=setup();await run.context.persist({},binding);assert.equal(run.requests[0].entryId,'feed-A');assert.equal(run.requests[0].sourceVersion,'download-A');assert.equal(run.paint.length,1);run.setSnapshot({mediaKey:'shelf:A',generation:2,sourceVersion:'download-A'});await run.context.persist({},binding);assert.equal(run.paint.length,2);run.setSnapshot({mediaKey:'shelf:B',generation:3,sourceVersion:'download-A'});await run.context.persist({},binding);assert.equal(run.paint.length,2);assert.equal(run.requests.length,3);});

test('RSS saved-source translation uses the existing queue and rejects source text changed before enqueue or completion',async()=>{
 const r=setup(),player=r.context.player;Object.assign(player,{mediaKey:'rss:A',generation:2,workspaceAudio:{entryId:'A',sourceVersion:'download-A'}});let text='saved source';
 r.context.window.api.feedsRequest=async request=>{r.requests.push(request);return {ok:true,sourceVersion:'download-A',workspace:{transcript:{state:'timed',status:'complete',text}}};};
 const b={entryId:'A',sourceVersion:'download-A',playbackOwner:'player',mediaKey:'rss:A',generation:2,materializedPath:'owned-hash.srt',sourceTranscriptText:'saved source',track:{id:'saved',revision:'download-A',timed:true}};
 await r.context.window.translatePodcastSource(b);assert.equal(r.state.queue[0].opts.translateOnly,true);assert.equal(r.state.queue[0].input,'owned-hash.srt');
 text='replacement';await assert.rejects(r.context.window.translatePodcastSource(b),/changed/);await assert.rejects(r.context.persist({},r.state.queue[0].podcastBinding),/changed/);assert.equal(r.state.queue.length,1);assert.equal(r.requests.some(request=>request.action==='podcast-save-transcript'),false);
});

test('readonly shelf translation validates immutable registry source and paints only captured playback binding',async()=>{const r=setup();let text='saved source';r.context.window.api.feedsRequest=async req=>{r.requests.push(req);return {ok:true,sourceVersion:'download-A',workspace:{transcript:{state:'timed',status:'complete',text}}};};const b={...binding,sourceTranscriptText:text,materializedPath:'immutable.srt',track:{id:'publisher-A',revision:'r1',timed:true}};await r.context.window.translatePodcastSource(b);assert.equal(r.state.queue.length,1);await r.context.persist({},r.state.queue[0].podcastBinding);assert.equal(r.paint.length,1);text='changed source';await assert.rejects(r.context.window.translatePodcastSource(b),/changed/);await assert.rejects(r.context.persist({},r.state.queue[0].podcastBinding),/changed/);assert.equal(r.paint.length,1);assert.equal(r.state.queue.length,1);});

test('Podcast queue progress and stop are scoped to playback identity and exact running item',async()=>{
 const r=setup(),expected={mediaKey:binding.mediaKey,generation:binding.generation,sourceVersion:'remote-A'};
 assert.equal(r.context.window.podcastQueueTaskState(expected).state,'idle');
 await r.context.window.queuePodcastSource(binding);const item=r.state.queue[0];item.status='running';r.state.currentQueueId=item.id;r.state.activeOutputJob={podcastBinding:item.podcastBinding,stage:'Whisper source A',percent:42};
 const status=r.context.window.podcastQueueTaskState(expected);assert.equal(status.state,'running');assert.equal(status.text,'Whisper source A');assert.equal(status.progress,.42);assert.equal(status.cancellable,true);
 assert.equal(r.context.window.podcastQueueTaskState({...expected,sourceVersion:'other-stream'}).state,'idle');
 let cancelled=0;r.context.document={getElementById:()=>({click(){cancelled++;},disabled:false})};
 assert.equal(r.context.window.cancelPodcastQueueTask(expected,item.id),true);assert.equal(cancelled,1);
 r.state.currentQueueId='another-job';assert.equal(r.context.window.cancelPodcastQueueTask(expected,item.id),false);assert.equal(cancelled,1);
 r.state.currentQueueId=item.id;r.state.activeOutputJob.podcastBinding={...binding,mediaKey:'unrelated'};assert.equal(r.context.window.cancelPodcastQueueTask(expected,item.id),false);assert.equal(cancelled,1);
});

test('Translation cancellation during final registry validation cannot enqueue late work',async()=>{
 const r=setup();Object.assign(r.context.player,{mediaKey:'rss:A',generation:2,workspaceAudio:{entryId:'A',sourceVersion:'download-A'}});let resolve,cancelled=false;
 r.context.window.api.feedsRequest=()=>new Promise(done=>resolve=done);
 const b={entryId:'A',sourceVersion:'download-A',playbackOwner:'player',mediaKey:'rss:A',generation:2,materializedPath:'owned.srt',sourceTranscriptText:'source',track:{id:'saved',revision:'download-A',timed:true}};
 const request=r.context.window.translatePodcastSource(b,{isCancelled:()=>cancelled});cancelled=true;resolve({ok:true,sourceVersion:'download-A',workspace:{transcript:{state:'timed',status:'complete',text:'source'}}});await assert.rejects(request,/changed/);assert.equal(r.state.queue.length,0);
});
