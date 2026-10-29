'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {createGroupTakes}=require('../src/dub-group-takes');
test('saved group recordings remain bound to source, slot, sender and immutable bytes',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'dub-take785-')),output=path.join(base,'downloads','Sesler','Çıktı'),logs=path.join(base,'profile','dub-logs');fs.mkdirSync(path.join(output,'_dub_takes_v1'),{recursive:true});fs.mkdirSync(logs,{recursive:true});
 const source='synthetic:video',subtitleHash='a'.repeat(64),slot='b'.repeat(64),sender=new EventEmitter(),other=new EventEmitter(),grants=[];
 const api=createGroupTakes({app:{getPath:key=>path.join(base,key==='userData'?'profile':'downloads')},grantMedia:file=>grants.push(file)});
 const write=(id,clock,body,recipe=slot)=>{const sha=crypto.createHash('sha256').update(body).digest('hex');fs.writeFileSync(path.join(output,'_dub_takes_v1',sha+'.wav'),body);const row={group:1,key:'1',text:'Synthetic words.',status:'ready',verification:{status:'not_checked'},sourceStart:0,sourceEnd:1,audioStart:0,audioEnd:1};fs.writeFileSync(path.join(logs,id+'-'+clock+'.json'),JSON.stringify({id,result:'done',path:path.join(output,id+'.wav'),sourceIdentity:source,subtitleHash,range:null,quality:{version:1,groups:[row]}}));fs.writeFileSync(path.join(output,id+'.zamanlama.json'),JSON.stringify({segments:[{source_ids:[1],cache_key:recipe,sha256:sha,text:row.text}]}));return sha;};
 try{
  const old=write('old',1,'old audio'),fresh=write('fresh',2,'fresh audio');write('different',3,'different recipe','c'.repeat(64));
  const result=await api.list(sender,'fresh','1');assert.equal(result.choices.length,2);assert.equal(result.choices.find(r=>r.current).sha256,fresh);assert.equal(grants.length,2);
  const selected=result.choices.find(r=>r.sha256===old),scope={subtitleHash,sourceIdentity:source,range:null};
  const resolved=await api.resolve(sender,{'1':selected.token},scope);assert.equal(resolved['1'].sha256,old);assert(!('file'in resolved['1']));
  await assert.rejects(api.resolve(other,{'1':selected.token},scope),/no longer match/);
  await assert.rejects(api.resolve(sender,{'1':selected.token},{...scope,subtitleHash:'d'.repeat(64)}),/no longer match/);
  await assert.rejects(api.resolve(sender,{'1':selected.token},scope,['1']),/no longer match/);
  fs.writeFileSync(path.join(output,'_dub_takes_v1',old+'.wav'),'changed');await assert.rejects(api.resolve(sender,{'1':selected.token},scope),/changed/);
  sender.emit('destroyed');await assert.rejects(api.resolve(sender,{'1':selected.token},scope),/no longer match/);
  await assert.rejects(api.list(sender,'../escape','1'),/Invalid/);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
