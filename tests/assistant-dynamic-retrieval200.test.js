'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events'),{JSDOM}=require('jsdom');
const {register}=require('../src/assistant-agent-service');
function renderer(){
 const dom=new JSDOM('<div id="aiChatLog"></div><div id="aiChatEmpty"></div><video id="playerVideo"></video><select id="aiTranscriptScope"><option value="full">Full</option><option value="watched">Watched</option><option value="nearby">Nearby</option></select>',{url:'https://fixture.invalid',runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;w.player={workspaceMode:'player',cues:Array.from({length:6005},(_,i)=>({start:i*2,end:i*2+1,text:i===3997?' \n\t'+'Prefix! '.repeat(750)+'İSTANBUL çığ':'ordinary dialogue '+i})),cues2:[]};w.UiLocale={get:()=> 'en'};
 w.globalAssistantContext=()=>null;w.aiSourceScope=()=> 'source';w.aiChatPreparing=false;w.subtitleSourceTime=n=>n;w.subtitleVideoTime=n=>n;w.currentBrowserYoutubeUrl=()=>'';w.browserTabState=()=>null;
 w.browserSubtitleRoleCues=()=>({source:w.player.cues,translation:w.player.cues2});w.translationsForCues=source=>source.map(()=> '');w.AssistantSourceContext={conversation:()=> 'source'};for(const file of ['assistant-context-manifest.js','assistant-capabilities.js','browser-transcript-search.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'));
 const disk=new Map();w.api={assistantThreads:async input=>{if(input.action==='list')return {ok:true,threads:[]};const thread={...input.thread,revision:(disk.get(input.thread.id)?.revision||0)+1,updatedAt:Date.now()};disk.set(thread.id,thread);return {ok:true,thread};}};
 for(const file of ['assistant-workspace.js','assistant-app-actions.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8'));
 return {w,close:()=>w.close()};
}
function service(fetchImpl){
 const handlers=new Map(),ipcMain=new EventEmitter(),app=new EventEmitter(),sender=new EventEmitter(),events=[],state={valid:true};sender.id=7;sender.isDestroyed=()=>false;sender.send=(channel,packet)=>events.push(packet);ipcMain.handle=(name,fn)=>handlers.set(name,fn);
 const event={sender,senderFrame:'main'};register({app,ipcMain,authorized:e=>e.sender===sender&&e.senderFrame==='main',validateOwner:()=>state.valid,getConfig:()=>({endpoint:'https://fixture.invalid/v1',model:'fixture'}),fetchImpl});
 return {app,sender,events,state,call:(name,data)=>handlers.get('assistant:'+name)(event,data)};
}
const response=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
const tool=(name,args={})=>response({role:'assistant',tool_calls:[{id:name,function:{name,arguments:JSON.stringify(args)}}]});

test('dynamic retrieval finds an unsampled tail cue and its U ID remains navigable',async()=>{
 const r=renderer();let turn=0,retrieved;
 const h=service(async(_url,options)=>{const body=JSON.parse(options.body);turn++;if(turn===1)return tool('search_subtitles',{query:'istanbul cig'});if(turn===2){retrieved=JSON.parse(body.messages.filter(message=>message.role==='tool').at(-1).content);return tool('seek_to_time',{source_id:'U3997'});}return response({role:'assistant',content:'Review this matching source.'});});
 try{
  await r.w.AssistantWorkspace.prepare();const owner=r.w.AssistantAppActions.snapshot(),pool=r.w.AssistantWorkspace.toolContext().rows;
  assert(!pool.some(row=>row.id==='U3997'),'the regression must exercise a row omitted by initial sampling');
  h.sender.send=(_channel,packet)=>{h.events.push(packet);if(packet.type==='action')queueMicrotask(async()=>{let result;try{result=await r.w.AssistantAppActions.execute(packet.name,packet.args,packet.owner);}catch(error){result={status:'failed',error:error.message};}await h.call('agentResult',{callId:packet.callId,result});});};
  const result=await h.call('agentRun',{requestId:'dynamic-search',question:'Find Istanbul and show the scene',owner,pool,context:{}});
  assert(result.ok);assert.equal(retrieved.status,'completed');assert.equal(retrieved.searchedCues,6005);assert.equal(retrieved.matches[0].id,'U3997');assert.match(retrieved.matches[0].text,/İSTANBUL çığ/);assert(retrieved.matches[0].text.length<=700);assert(retrieved.matches[0].textOffset>0);assert.equal(retrieved.matches[0].textTruncated,true);assert.equal(retrieved.matches[0].text,r.w.player.cues[3997].text.slice(retrieved.matches[0].textOffset,retrieved.matches[0].textOffset+retrieved.matches[0].text.length));
  assert(h.events.some(packet=>packet.type==='proposal'&&packet.action.tool==='seek_to_time'));
  await r.w.AssistantAppActions.execute('seek_to_time',{source_id:'U3997'},owner);assert.equal(r.w.document.getElementById('playerVideo').currentTime,7994);
  r.w.openCueEditor=()=>r.w.player.cueEditTarget={};await r.w.AssistantAppActions.execute('open_subtitle_editor',{source_id:'U3997'},owner);assert.equal(r.w.player.activeIdx,3997);
 }finally{h.app.emit('will-quit');r.close();}
});

test('renderer enforces live watched/nearby scopes, bounds, stable IDs, and track ownership',async()=>{
 const r=renderer();try{
  await r.w.AssistantWorkspace.prepare();const owner=r.w.AssistantAppActions.snapshot(),scope=r.w.document.getElementById('aiTranscriptScope'),video=r.w.document.getElementById('playerVideo');
  await assert.rejects(r.w.AssistantAppActions.execute('search_subtitles',{query:'x'},owner),/searchable keyword/);
  for(const mode of ['watched','nearby']){scope.value=mode;const result=await r.w.AssistantAppActions.execute('search_subtitles',{query:'istanbul cig'},owner);assert.equal(result.matches.length,0);assert.equal(r.w.AssistantWorkspace.subtitleById('U3997',owner),undefined);}
  scope.value='full';const result=await r.w.AssistantAppActions.execute('search_subtitles',{query:'ordinary'},owner);assert.equal(result.matches.length,8);assert(JSON.stringify(result).length<16000);
  video.currentTime=7994.5;const current=await r.w.AssistantAppActions.execute('get_current_subtitle',{},owner);assert.equal(current.matches[0].id,'U3997');assert.equal(current.position,7994.5);
  r.w.player.cues[3997]={start:7994,end:7995,text:'Replaced track content'};
  await assert.rejects(r.w.AssistantAppActions.execute('search_subtitles',{query:'replaced'},owner),/subtitle track changed/);
  await assert.rejects(r.w.AssistantAppActions.execute('get_current_subtitle',{},owner),/subtitle track changed/);
  assert.equal(r.w.AssistantWorkspace.subtitleById('U3997',owner),undefined);
 }finally{r.close();}
});

test('browser retrieval uses video-time rows and returns bounded matching translations',async()=>{
 const r=renderer();try{
  r.w.player.workspaceMode='browser';r.w.player.browserTime=200;r.w.player.browserPageUrl='https://fixture.invalid/video';r.w.browserTabState=()=>({id:'tab',generation:1});r.w.AssistantSourceContext.pageKey=()=> 'page';
  r.w.aiVideoRows=()=>r.w.player.cues.map((row,i)=>({...row,start:row.start+200,end:row.end+200,translation:i===3997?'Çeviri! '.repeat(750)+'eşsiz hedef':''}));
  await r.w.AssistantWorkspace.prepare();const owner=r.w.AssistantAppActions.snapshot();
  let result=await r.w.AssistantAppActions.execute('search_subtitles',{query:'essiz hedef'},owner);assert.equal(result.matches[0].id,'U3997');assert.equal(result.matches[0].start,8194);assert.match(result.matches[0].translation,/eşsiz hedef/);assert(result.matches[0].translation.length<=700);assert(result.matches[0].translationOffset>0);
  result=await r.w.AssistantAppActions.execute('get_current_subtitle',{},owner);assert.equal(result.matches[0].id,'U0');assert.equal(result.position,200);
  r.w.document.getElementById('aiTranscriptScope').value='watched';result=await r.w.AssistantAppActions.execute('search_subtitles',{query:'essiz hedef'},owner);assert.equal(result.matches.length,0);
 }finally{r.close();}
});

test('a renderer retrieval failure never silently falls back to the sampled subtitle pool',async()=>{
 let turn=0,receipt;const h=service(async(_url,options)=>{if(++turn===1)return tool('search_subtitles',{query:'old sample'});receipt=JSON.parse(options.body).messages.filter(message=>message.role==='tool').at(-1).content;return response({role:'assistant',content:'Search failed.'});});
 h.sender.send=(_channel,packet)=>{h.events.push(packet);if(packet.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:packet.callId,result:{status:'failed',error:'Track unavailable'}}));};
 try{const result=await h.call('agentRun',{requestId:'failed-search',question:'Find old sample',owner:{kind:'video',owner:'source',thread:'thread'},pool:[{id:'U0',start:0,end:2,text:'old sample',translation:''}]});assert(result.ok);assert.match(receipt,/Track unavailable/);assert.equal(result.execution.blockedOrFailed,1);assert(!h.events.some(packet=>packet.type==='evidence'));}finally{h.app.emit('will-quit');}
});

test('main rejects malformed, duplicate, out-of-scope and non-current renderer evidence',async()=>{
 const good={status:'completed',matches:[{id:'U100',start:100,end:101,text:'Exact needle',translation:''}],transcriptScope:'full',position:0,searchedCues:200};
 for(const [name,result]of [['search_subtitles',{...good,matches:[{...good.matches[0],id:'arbitrary'}]}],['search_subtitles',{...good,matches:[good.matches[0],good.matches[0]]}],['search_subtitles',{...good,transcriptScope:'watched'}],['search_subtitles',{...good,transcriptScope:'nearby',position:1000}],['get_current_subtitle',good]]){
  let turn=0,receipt;const h=service(async(_url,options)=>{if(++turn===1)return tool(name,{...(name==='search_subtitles'?{query:'needle'}:{})});receipt=JSON.parse(options.body).messages.filter(message=>message.role==='tool').at(-1).content;return response({role:'assistant',content:'Invalid evidence rejected.'});});
  h.sender.send=(_channel,packet)=>{h.events.push(packet);if(packet.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:packet.callId,result}));};
  try{const run=await h.call('agentRun',{requestId:'invalid-read',question:'Find needle',owner:{kind:'video',owner:'source',thread:'thread'},pool:[{id:'U0',start:0,end:2,text:'source',translation:''}]});assert(run.ok);assert.match(receipt,/Invalid subtitle retrieval evidence/);assert(!h.events.some(packet=>packet.type==='evidence'));}finally{h.app.emit('will-quit');}
 }
});

test('main rechecks source ownership after awaiting renderer retrieval',async()=>{
 const h=service(async()=>tool('search_subtitles',{query:'needle'}));h.sender.send=(_channel,packet)=>{h.events.push(packet);if(packet.type==='action')queueMicrotask(()=>{h.call('agentResult',{callId:packet.callId,result:{status:'completed',matches:[],transcriptScope:'full',position:0,searchedCues:1}});h.state.valid=false;});};
 try{const result=await h.call('agentRun',{requestId:'stale-read',question:'Find needle',owner:{kind:'video',owner:'source',thread:'thread'},pool:[{id:'U0',start:0,end:2,text:'source',translation:''}]});assert.equal(result.ok,false);assert(!h.events.some(packet=>packet.type==='evidence'));}finally{h.app.emit('will-quit');}
});
