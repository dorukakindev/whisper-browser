 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const source=require('../src/assistant-source-context');

test('active direct playback sends title, source position and duration without inventing unheard content',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),renderer=fs.readFileSync('src/renderer/renderer.js','utf8');
 const body=renderer.slice(renderer.indexOf('function aiChatContext() {'),renderer.indexOf('\nfunction aiTranscriptEvidence(',renderer.indexOf('function aiChatContext() {')));
 const nodes={playerTitle:{textContent:'Halloween'},playerLayer:{classList:{contains:()=>false}},playerVideo:{currentTime:341,duration:5472},aiTranscriptScope:{value:'watched'}};
 const player={workspaceMode:'player',mediaKey:'private-stream-key',generation:3,workKey:'work:stremio:'+'a'.repeat(64),cues:[],cues2:[]};
 const c=vm.createContext({window:{AssistantSourceContext:source},document:{getElementById:id=>nodes[id]},player,$:id=>nodes[id],globalAssistantContext:()=>null,subtitleSourceTime:n=>n,pSecToTime:n=>String(n),browserSubtitleRoleCues:()=>({source:player.cues,translation:[]}),subtitleContextLanguage:()=>'',AI_CHAT_CTX:4,translationsForCues:()=>[],translationFor:()=>''});
 vm.runInContext(body,c);const noSubs=c.aiChatContext();
 assert.equal(noSubs.video,'Halloween');assert.equal(noSubs.playback.position,341);assert.equal(noSubs.playback.duration,5472);assert.equal(noSubs.playback.workKey,player.workKey);assert.equal(noSubs.playback.hasTranscript,false);
 assert.match(noSubs.not,/No subtitles or transcript are attached/);assert.match(noSubs.not,/not received video frames or audio/);
 const safe=require('../src/assistant-context-manifest').sourceText(noSubs);assert.deepEqual(safe.playback,{position:341,duration:5472,hasTranscript:false,workKey:player.workKey});assert(!JSON.stringify(safe).includes('private-stream-key'));
 player.cues=[{start:330,end:340,text:'Past words'},{start:342,end:350,text:'FUTURE WORDS'}];
 const withSubs=c.aiChatContext();assert.equal(withSubs.playback.hasTranscript,true);assert.equal(withSubs.cumle,'Past words');assert(!JSON.stringify(withSubs).includes('FUTURE WORDS'));assert.match(withSubs.sinir,/Do not reveal events after/);
 player.workKey='https://secret.example/key';assert.equal(c.aiChatContext().playback.workKey,undefined);
});

test('active Stremio identity exposes only exact public film/episode metadata and cannot follow another source',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),code=fs.readFileSync('src/renderer/stremio-ui.js','utf8');
 const start=code.indexOf('  function assistantMetadata() {');assert(start>=0,'active Stremio metadata helper exists');
 const body=code.slice(start,code.indexOf('\n  window.StremioUI',start));
 const workKey='work:stremio:'+'b'.repeat(64),state={key:'stream:fixture',workKey,ctx:{type:'movie',id:'tt0077651',name:'Halloween',meta:{year:1978,description:'FUTURE SPOILER'}}};
 const player={workspaceMode:'player',mediaKey:state.key,workKey};const c=vm.createContext({session:state,player,sessionActive:()=>player.mediaKey===state.key,validWorkKey:v=>/^work:stremio:[a-f0-9]{64}$/.test(v||'')});vm.runInContext(body,c);
 const value=c.assistantMetadata();assert.equal(value.itemId,'discovery:film:tt0077651');assert.equal(value.year,1978);assert(!JSON.stringify(value).includes('FUTURE SPOILER'));
 state.ctx={...state.ctx,type:'series',id:'tt0944947',season:0,episode:0};assert.equal(c.assistantMetadata().itemId,'discovery:series:tt0944947');assert.equal(c.assistantMetadata().season,0);assert.equal(c.assistantMetadata().episode,0);
 const enriched=source.playbackContext({video:'Episode'},{metadata:c.assistantMetadata(),position:12,duration:90});
 const sent=require('../src/assistant-context-manifest').sourceText(enriched);assert.equal(sent.playback.itemId,'discovery:series:tt0944947');assert.equal(sent.playback.year,1978);assert.equal(sent.playback.season,0);
 state.ctx.id='https://private.example/key';assert.equal(c.assistantMetadata(),null);state.ctx.id='tt0944947';player.workKey='work:stremio:'+'c'.repeat(64);assert.equal(c.assistantMetadata(),null);player.workKey=workKey;player.mediaKey='other';assert.equal(c.assistantMetadata(),null);
 const malformed=require('../src/assistant-context-manifest').sourceText({playback:{itemId:'https://private.example/key',title:'Ignored metadata',year:1978}});assert.equal(malformed.playback.itemId,undefined);assert.equal(malformed.playback.title,undefined);
});

test('film tools can use the active verified Stremio identity only when no other selection is open',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),code=fs.readFileSync('src/renderer/assistant-film-actions.js','utf8'),start=code.indexOf(' function selectedTitleId(){'),body=code.slice(start,code.indexOf('\n function currentId()',start));let selection=null,metadata={itemId:'discovery:film:tt0077651'};
 const c=vm.createContext({window:{StremioUI:{assistantMetadata:()=>metadata}},globalAssistantContext:()=>selection});vm.runInContext(body,c);
 assert.equal(c.selectedTitleId(),'discovery:film:tt0077651');selection={type:'book-page'};assert.equal(c.selectedTitleId(),null);selection={type:'discovery-title',id:'discovery:film:tt0111161'};assert.equal(c.selectedTitleId(),selection.id);selection=null;metadata.itemId='https://secret.example/key';assert.equal(c.selectedTitleId(),null);
});

test('floating assistant recognizes active local/direct playback with no transcript and explains its evidence limit',async t=>{
 const fs=require('node:fs'),{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="aiChatLog"></div><div id="playerLayer"></div><div id="playerTitle">Halloween</div><select id="aiTranscriptScope"><option value="watched">Watched</option></select>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let snapshot;
 Object.assign(w,{UiLocale:{get:()=> 'en'},player:{workspaceMode:'player',mediaKey:'private-source-key',cues:[]},globalAssistantContext:()=>null,aiSourceScope:()=> 'scope',subtitleSourceTime:n=>n,subtitleContextLanguage:()=>'',assistantProviderSelection:()=>({model:'fixture'}),buildOptsFromUI:()=>({}),aiChatPreparing:null,aiChatRetryPacket:null,AssistantSourceContext:source,AssistantSourcePreview:require('../src/assistant-source-preview'),api:{updateAssistant:value=>snapshot=value,onAssistantCommand(){}},AssistantRunSteps:require('../src/assistant-run-steps')});
 w.eval(fs.readFileSync('src/renderer/global-assistant.js','utf8'));await new Promise(resolve=>setTimeout(resolve,90));
 assert.equal(snapshot.sourcePreview.attached,true);assert.equal(snapshot.context,'Halloween');assert.match(snapshot.sourcePreview.summary,/no captions attached/);assert.match(snapshot.sourceDescription,/frames or audio/);assert(!snapshot.sourceDescription.includes('Uses subtitle context'));
 assert(!JSON.stringify({description:snapshot.sourceDescription,preview:snapshot.sourcePreview}).includes('private-source-key'));
});
test('context preview accepts all current media pools without merging taste evidence across domains',()=>{
 const M=require('../src/assistant-context-manifest'),base={id:'R'+'a'.repeat(16),nodeId:'collection:fixture',title:'Fixture',text:'Quoted source',scope:'metadata',revision:'r',reactionRevision:'rating',tasteEligible:true};for(const domain of require('../src/media-domains').DOMAINS){const result=M.sourceText({type:'recall-sources',recallAnalysis:{mode:'taste',sources:[{...base,domain}]}});assert.equal(result.recallAnalysis.sources[0].domain,domain);}assert.throws(()=>M.sourceText({type:'recall-sources',recallAnalysis:{mode:'taste',sources:[{...base,domain:'anime'},{...base,id:'R'+'b'.repeat(16),domain:'film'}]}}),/one domain/i);
});
test('send preview freezes the actual attachment, hides private owner tokens and blocks a stale confirmation',async t=>{
 const fs=require('node:fs'),{JSDOM}=require('jsdom'),dom=new JSDOM('<main/>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.UiLocale={get:()=> 'en'};w.AssistantContextManifest=require('../src/assistant-context-manifest');w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.eval(fs.readFileSync('src/renderer/assistant-safety-ui.js','utf8'));let current=true;const packet={question:'Explain',context:{excerpt:'Original quote'},pool:[],history:[]},owner={kind:'book',owner:'private-owner-token',title:'Fixture'};const result=w.AssistantSendPreview.review({packet,owner,isCurrent:()=>current});packet.context.excerpt='Changed after preview';assert(w.document.querySelector('pre').textContent.includes('Original quote'));assert(!w.document.querySelector('pre').textContent.includes('private-owner-token'));current=false;[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Send this request').click();assert(w.document.querySelector('[role=status]').textContent.includes('Source changed'));w.document.querySelector('dialog').close();assert.equal(await result,null);
 const second=w.AssistantSendPreview.review({packet,owner,isCurrent:()=>true});[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Send this request').click();assert.equal((await second).context.excerpt,'Changed after preview');w.AssistantActionReceipts.record({proposalId:'p',tool:'start_whisper',label:'Whisper',summary:'Only selected range'},{status:'accepted',jobId:'job'});const host=w.document.querySelector('main');w.AssistantActionReceipts.render(host);assert(host.textContent.includes('not completed'));assert(!host.textContent.includes('Applied'));
});
test('Non-video pages have independent conversations; return/reload keeps the matching page history without storing credentials',()=>{
 const p={workspaceMode:'browser',mediaKey:'',browserActiveTabId:'one',browserPageUrl:'https://news.test/article/one?api_key=PRIVATE',generation:1};const key=source.conversation(p);assert(!key.includes('PRIVATE'));assert.notEqual(source.conversation({...p,browserPageUrl:'https://news.test/article/two'}),key);assert.equal(source.conversation({...p,browserActiveTabId:'two',generation:2}),key);
 assert.equal(source.pageKey('https://news.test/a?utm_source=feed#top'),source.pageKey('https://news.test/a'));assert.notEqual(source.pageKey('https://site.test/#/watch/1'),source.pageKey('https://site.test/#/watch/2'));
});
test('Page navigation, reload generation and changed title metadata invalidate in-flight context',()=>{
 const p={workspaceMode:'browser',browserActiveTabId:'one',mediaKey:'same',generation:1,browserPageUrl:'https://news.test/a'};const a=source.scope(p,null,{generation:1});assert.notEqual(source.scope(p,null,{generation:2}),a);assert.notEqual(source.scope({...p,browserPageUrl:'https://news.test/b'},null,{generation:1}),a);const selection={id:'film',workspace:'media-selection',title:'Old',synopsis:'Old plot'};assert.notEqual(source.scope(p,selection),source.scope(p,{...selection,synopsis:'New plot'}));assert.equal(source.conversation(p,selection),source.conversation(p,{...selection,synopsis:'New plot'}));
});

test('Existing media conversations retain their persisted key while non-media pages remain distinct',()=>{const p={workspaceMode:'browser',mediaKey:'youtube:fixture',browserMediaSeen:true,browserPageUrl:'https://www.youtube.com/watch?v=fixture'};assert.equal(source.conversation(p),JSON.stringify(['browser','youtube:fixture']));assert.notEqual(source.conversation({...p,browserMediaSeen:false}),source.conversation(p));});

test('Tool source carries a validated film item_id while excluding filesystem and person identifiers',()=>{const manifest=require('../src/assistant-context-manifest');assert.equal(manifest.sourceText({type:'discovery-title',id:'discovery:film:tt0112471'}).item_id,'discovery:film:tt0112471');assert.equal(manifest.sourceText({type:'library-title',id:'decision-job',catalogId:'saved-film'}).item_id,'saved-film');assert.equal(manifest.sourceText(manifest.sourceText({type:'discovery-title',id:'discovery:film:tt0112471'})).item_id,'discovery:film:tt0112471');for(const id of ['discovery:film:123','person:7','C:\\private\\film.mp4','https://secret.test/a','bad id'])assert.equal(manifest.sourceText({type:'library-title',id}).item_id,undefined);assert.equal(manifest.sourceText({type:'page',id:'some-page'}).item_id,undefined);});

test('read-only podcast supplies reading evidence only for explicit full scope and keeps workflow tools available',()=>{
 const snap={episodeIdentity:'A',sourceVersion:'stream',generation:1,mediaKey:'shelf:A',time:20,title:'Episode'};
 const tracks=[{role:'source',id:'source-A',revision:'r1',timed:false,text:'Real reading transcript',recordedCues:[{start:0,end:10,text:'Stored words'}]}];
 const watched=source.freezePodcast(snap,tracks,'watched'),full=source.freezePodcast(snap,tracks,'full');
 assert.equal(watched.excerpt,undefined);assert.equal(watched.transcript_evidence.evidence.length,0);
 assert.equal(full.excerpt,'Real reading transcript');assert.equal(full.transcript_evidence.evidence.length,0);
 assert.match(full.note,/get_workflow_settings/);assert.match(full.note,/mergeContinuation/);assert.match(full.note,/open_voice_preparation/);
});

test('R853 initial packet selection removes only selected source material and preserves separate production range',async t=>{
 const fs=require('node:fs'),{JSDOM}=require('jsdom'),dom=new JSDOM('<body/>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.UiLocale={get:()=> 'en'};w.AssistantContextManifest=require('../src/assistant-context-manifest');w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.eval(fs.readFileSync('src/renderer/assistant-safety-ui.js','utf8'));const packet={question:'Compare',context:{watched_cutoff:1800,comparisonSources:[{id:'P-real',kind:'podcast',revision:'v1',role:'translation',text:'Saved translation'},{id:'N-real',kind:'research-note',revision:'v2',text:'Exact original'}]},pool:[],history:[{role:'user',content:'Old question'}]},owner={kind:'video',title:'Fixture',range:{start:300,end:330}};const waiting=w.AssistantSendPreview.review({packet,owner,isCurrent:()=>true});const checks=w.document.querySelectorAll('input[type=checkbox]');assert.equal(checks.length,3);checks[0].checked=false;checks[0].dispatchEvent(new w.Event('change'));assert(!w.document.querySelector('pre').textContent.includes('Saved translation'));assert(w.document.querySelector('pre').textContent.includes('1800'));assert(w.document.querySelector('pre').textContent.includes('330'));[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Send this request').click();const sent=await waiting;assert.equal(sent.context.comparisonSources.length,1);assert.equal(sent.context.comparisonSources[0].id,'N-real');assert.equal(packet.context.comparisonSources.length,2);
 const manifest=require('../src/assistant-context-manifest'),once=manifest.sourceText({comparisonSources:Array.from({length:8},(_,i)=>({id:'P'+i,revision:'v1',role:'translation',text:'x'.repeat(2000),personalNote:'My interpretation'}))});assert.equal(once.comparisonSources.length,8);assert.equal(once.comparisonSources[0].role,'translation');assert(once.comparisonSources[0].shortened);assert(manifest.sourceText(once).sourceTruncated);
});
