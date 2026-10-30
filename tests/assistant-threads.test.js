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
