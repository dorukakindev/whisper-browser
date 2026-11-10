'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerAssistantThreads,cleanThread}=require('../src/assistant-thread-store');
const thread=(id='one',sourceKey='source-A')=>({id,sourceKey,title:'İstanbul',headId:'answer',messages:[{id:'question',parentId:null,role:'user',text:'Merhaba'},{id:'answer',parentId:'question',role:'assistant',text:'Partial',status:'streaming'}],revision:0});
test('Persistent threads preserve partial output, source isolation, conflict rejection and disk integrity',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-threads-'));
 try{
  const {handle}=registerAssistantThreads({app:{getPath:()=>dir},ipcMain:{handle(){}},authorized:event=>event==='owner'});
  assert.equal((await handle('foreign',{action:'save',sourceKey:'source-A',thread:thread()})).ok,false);
  const saved=await handle('owner',{action:'save',sourceKey:'source-A',thread:thread()});assert(saved.ok);assert.equal(saved.thread.revision,1);
  const reopen=await handle('owner',{action:'list',sourceKey:'source-A'});assert.equal(reopen.threads[0].messages[1].status,'stopped');assert.equal(reopen.threads[0].messages[1].text,'Partial');
  assert.equal((await handle('owner',{action:'list',sourceKey:'source-B'})).threads.length,0);
  assert.equal((await handle('owner',{action:'save',sourceKey:'source-B',thread:{...saved.thread,sourceKey:'source-B'}})).ok,false);
  assert.equal((await handle('owner',{action:'save',sourceKey:'source-A',thread:thread()})).ok,false,'Stale revision cannot overwrite newer text');
  const file=path.join(dir,'assistant-conversations.json'),before=fs.readFileSync(file,'utf8');
  assert.equal((await handle('owner',{action:'delete',sourceKey:'source-B',id:'one'})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),before);
  fs.writeFileSync(file,'broken fixture');assert.equal((await handle('owner',{action:'save',sourceKey:'source-A',thread:thread('two')})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),'broken fixture','Corrupt file is not silently replaced');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Parent ordering, branch references and cycle rejection preserve a valid history',()=>{
 const t=thread();t.messages.reverse();assert.equal(cleanThread(t).messages[0].id,'question');
 t.messages[1].parentId='answer';assert.throws(()=>cleanThread(t),/cycle|parent/);
 const duplicate=thread();duplicate.messages[1].id='question';assert.throws(()=>cleanThread(duplicate));
});
test('Workspace backup includes conversations and rejects a malformed archive before changing originals',()=>{
 const {exportPackage,readPackage,restorePackage,describePackage}=require('../src/workspace-package');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-backup-'));
 try{
  const file=path.join(dir,'assistant-conversations.json'),original=JSON.stringify({version:1,threads:[cleanThread(thread())]});fs.writeFileSync(file,original);
  const output=path.join(dir,'fixture.wbp');exportPackage(dir,output);const data=readPackage(output);assert.equal(describePackage(data).assistantConversations,1);
  const broken=structuredClone(data);broken.files.find(row=>row.name==='assistant-conversations.json').data=Buffer.from('{"version":1,"threads":[{}]}').toString('base64');
  assert.throws(()=>restorePackage(dir,broken));assert.equal(fs.readFileSync(file,'utf8'),original);
  fs.writeFileSync(file,JSON.stringify({version:1,threads:[]}));restorePackage(dir,data);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).threads[0].title,'İstanbul');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('persisted book citations keep bounded original page identities',()=>{
 const t=thread();t.messages[1].citations=[{id:'B3-0',page:3,sourceId:'pdf-hash',kind:'page',text:'quote'},{id:'forged',page:999,sourceId:'other'}];
 const cleaned=cleanThread(t);assert.deepEqual(cleaned.messages[1].citations,[{id:'B3-0',page:3,sourceId:'pdf-hash',kind:'page',text:'quote'}]);
 assert.deepEqual(cleanThread(cleaned).messages[1].citations,cleaned.messages[1].citations);
});

test('thread persistence keeps valid saved-podcast source cards and drops malformed ones or unexpected fields',()=>{
 const id=n=>'P'+String(n).repeat(8)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(12);
 const card=(n,extra={})=>({id:id(n),kind:'podcast',usage:'cited',show:'Coastal',episode:'Episode',role:'source',timed:false,seconds:null,end:null,quote:'The lighthouse.',locator:{action:'podcast-search-resolve',query:'lighthouse',episode:'entry',token:'c'.repeat(64)},scope:{limit:6,more:true},...extra});
 const base=thread(),rows=cleanThread({...base,messages:[base.messages[0],{id:'answer',parentId:'question',role:'assistant',text:'x',status:'complete',citations:[
  card(1),card(2,{id:'P-bad'}),card(3,{locator:{...card(3).locator,token:'short'}}),card(4,{role:'narrator'}),card(5,{quote:' '}),
  card(6,{html:'<script>x</script>',url:'file:///c:/secret',locator:{...card(6).locator,path:'C:\\secret',url:'https://evil.example'}})]}]}).messages[1].citations;
 assert.deepEqual(rows.map(row=>row.id),[id(1),id(6)]);
 assert.equal(rows[1].html,undefined);assert.equal(rows[1].url,undefined);assert.deepEqual(Object.keys(rows[1].locator).sort(),['action','episode','query','token']);
 assert.deepEqual(rows[0].scope,{limit:6,more:true});
});

test('thread persistence keeps an unknown approval result and its note',()=>{
 const base=thread(),action={kind:'app_action',proposalId:'proposal-1',tool:'open_settings',label:'Open settings',summary:'x',resultStatus:'unknown',resultText:'Check the current state.'};
 const row=cleanThread({...base,messages:[base.messages[0],{id:'answer',parentId:'question',role:'assistant',text:'x',status:'complete',actions:[action]}]}).messages[1].actions[0];
 assert.deepEqual([row.resultStatus,row.resultText],['unknown','Check the current state.']);
});

test('thread persistence keeps a bounded count of unverified references',()=>{
 const base=thread(),rows=cleanThread({...base,messages:[base.messages[0],{id:'answer',parentId:'question',role:'assistant',text:'x',status:'complete',basis:{unverified:2,extra:'x'}},{id:'two',parentId:'answer',role:'assistant',text:'y',basis:{unverified:-4}}]}).messages;
 assert.deepEqual(rows[1].basis,{unverified:2});assert.equal(rows[2].basis,null);
});

test('R31 continued reply keeps the ninth live card and rejects capacity overflow without rewriting the archive',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-cards-'));try{const service=registerAssistantThreads({app:{getPath:()=>dir},ipcMain:{handle(){}},authorized:()=>true}),t=thread(),card=i=>({kind:'app_action',proposalId:'card-'+i,tool:'navigate_workspace',label:'Card '+i,resultStatus:i<9?'stopped':''});t.messages[1].actions=Array.from({length:9},(_,i)=>card(i+1));let r=await service.handle({},{action:'save',sourceKey:t.sourceKey,thread:t});assert.equal(r.ok,true,r.error);const listed=await service.handle({},{action:'list',sourceKey:t.sourceKey});assert.equal(listed.threads[0].messages[1].actions.at(-1).proposalId,'card-9');assert.equal(listed.threads[0].messages[1].actions.length,9);const before=fs.readFileSync(path.join(dir,'assistant-conversations.json'),'utf8');r.thread.messages[1].actions=Array.from({length:65},(_,i)=>card(i+1));const over=await service.handle({},{action:'save',sourceKey:t.sourceKey,thread:r.thread});assert.equal(over.ok,false);assert.match(over.error,/capacity|limit|sınır/i);assert.equal(fs.readFileSync(path.join(dir,'assistant-conversations.json'),'utf8'),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
