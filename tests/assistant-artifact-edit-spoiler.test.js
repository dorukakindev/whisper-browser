'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerAssistantArtifacts,validateEnvelope}=require('../src/assistant-artifact-service');
const {exportArtifact}=require('../src/assistant-artifact-export');
const {createArtifactStore}=require('../src/assistant-artifact-store');

test('private manual text-cell edits stay out of every export while spoiler is closed',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-private-text-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const rows=[{id:'one',title:'One',kind:'film'},{id:'two',title:'Two',kind:'film'}];
 const handle=registerAssistantArtifacts({app:{getPath:()=>root},ipcMain:{handle(){}},authorized:()=>true,catalogStore:()=>({list:()=>rows})}).handle;
 const created=await handle({}, {action:'save',ids:['one','two']});const id=created.doc.id,key='cell:kind:one';
 assert.equal((await handle({}, {action:'edit',id,expectedRevision:1,key,value:'PRIVATE USER EDIT'})).ok,true);
 assert.equal((await handle({}, {action:'spoiler',id,expectedRevision:2,key,value:'closed'})).ok,true);
 const got=await handle({}, {action:'get',id});assert.equal(got.body.cells.find(c=>c.rowId==='kind'&&c.colId==='one').value,'PRIVATE USER EDIT');
 for(const format of ['csv','json','markdown','html'])assert.ok(!exportArtifact({doc:got.doc,format,expectedRevision:3}).content.includes('PRIVATE USER EDIT'));
});

test('persistent matrix edits and spoiler layer survive refresh, restore and every export projection',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-spoiler-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const rows=[{id:'one',title:'One',kind:'film',year:2001},{id:'two',title:'Two',kind:'film',year:2002}];
 const handle=registerAssistantArtifacts({app:{getPath:()=>root},ipcMain:{handle(){}},authorized:()=>true,catalogStore:()=>({list:()=>rows})}).handle;
 let saved=await handle({}, {action:'save',ids:['one','two']});
 const id=saved.doc.id,key='cell:year:one';
 saved=await handle({}, {action:'edit',id,expectedRevision:1,key,value:'1999'});
 assert.equal(saved.doc.revision,2);
 saved=await handle({}, {action:'spoiler',id,expectedRevision:2,key,value:'closed'});
 assert.equal(saved.doc.revision,3);
 rows[0].year=2003;
 saved=await handle({}, {action:'save',id,expectedRevision:3,ids:['one','two']});
 assert.equal(saved.doc.revision,4);
 let got=await handle({}, {action:'get',id});
 assert.equal(got.body.cells[0].value,'1999');
 assert.equal(got.body.cells[0].spoiler,'closed');
 assert.equal((await handle({}, {action:'spoiler',id,expectedRevision:3,key,value:'open'})).code,'revision-conflict');
 for(const format of ['csv','json','markdown','html']){
  const exported=exportArtifact({doc:got.doc,format,expectedRevision:4});
  assert.ok(exported.ok);assert.ok(!exported.content.includes('1999'));assert.ok(!exported.content.includes('2003'));
 }
 saved=await handle({}, {action:'restore',id,expectedRevision:4,revision:2});
 assert.equal(saved.doc.revision,5);
 got=await handle({}, {action:'get',id});
 assert.equal(got.body.cells[0].value,'1999');
 assert.notEqual(got.body.cells[0].spoiler,'closed');
 assert.doesNotThrow(()=>validateEnvelope(JSON.parse(fs.readFileSync(path.join(root,'assistant-artifacts.json'),'utf8'))));
});

test('closed dossier/timeline cannot leak source snapshots or extension metadata in any default export',async()=>{
 for(const type of ['dossier','timeline']){
  const entry=type==='dossier'?{id:'p0',text:'SECRET VALUE'}:{id:'p0',time:3,label:'SECRET VALUE'};
  Object.assign(entry,{spoiler:'closed',claims:[{sourceId:'s',quote:'SECRET QUOTE'}],privateMetadata:'SECRET META'});
  const body={type,title:'Safe title',evidence:[{sourceId:'s',text:'SECRET EVIDENCE'}],origin:{sourceKey:'SECRET ORIGIN'}};
  if(type==='dossier')body.sections=[{heading:'Section',passages:[entry]}];else body.nodes=[entry];
  const data=new Map(),store=createArtifactStore({storage:{get:id=>data.get(id),set:(id,doc)=>data.set(id,doc)}});
  const {doc}=await store.create({body});
  for(const format of ['csv','json','markdown','html']){
   const exported=exportArtifact({doc,format,expectedRevision:1});
   assert.ok(exported.ok);assert.ok(!exported.content.includes('SECRET'),type+' '+format);
  }
  assert.ok(exportArtifact({doc,format:'json',expectedRevision:1,includeClosedSpoilers:true}).content.includes('SECRET VALUE'));
 }
});
