'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {createGroupTakes}=require('../src/dub-group-takes');
test('saved group recordings remain bound to source, slot, sender and immutable bytes',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'dub-take785-')),output=path.join(base,'downloads','Sesler','Çıktı'),logs=path.join(base,'profile','dub-logs');fs.mkdirSync(path.join(output,'_dub_takes_v1'),{recursive:true});fs.mkdirSync(logs,{recursive:true});
 const source='synthetic:video',subtitleHash='a'.repeat(64),slot='b'.repeat(64),sender=new EventEmitter(),other=new EventEmitter(),grants=[];
 const api=createGroupTakes({app:{getPath:key=>path.join(base,key==='userData'?'profile':'downloads')},grantMedia:file=>grants.push(file)});
 const write=(id,clock,body,recipe=slot,extra={})=>{const sha=crypto.createHash('sha256').update(body).digest('hex');fs.writeFileSync(path.join(output,'_dub_takes_v1',sha+'.wav'),body);const row={group:1,key:'1',text:'Synthetic words.',status:'ready',verification:{status:'not_checked'},continuity:{status:'measured',levelDb:-18,wordsPerSecond:2,gainDb:2,warnings:[]},sourceStart:0,sourceEnd:1,audioStart:0,audioEnd:1};fs.writeFileSync(path.join(logs,id+'-'+clock+'.json'),JSON.stringify({id,result:'done',path:path.join(output,id+'.wav'),sourceIdentity:source,subtitleHash,range:null,quality:{version:1,groups:[row]},...extra}));fs.writeFileSync(path.join(output,id+'.zamanlama.json'),JSON.stringify({segments:[{source_ids:[1],cache_key:recipe,sha256:sha,text:row.text}]}));return sha;};
 try{
  const old=write('old',1,'old audio'),fresh=write('fresh',2,'fresh audio');write('different',3,'different recipe','c'.repeat(64));
  const result=await api.list(sender,'fresh','1');assert.equal(result.choices.length,3);assert.equal(result.choices[0].levelDb,-18,'raw level excludes final render gain');assert.equal(result.choices.find(r=>r.current).sha256,fresh);assert.equal(grants.length,3);assert.equal(result.choices[0].metrics.verification,'not_checked');assert.equal(result.choices[0].metrics.sourceSeconds,1);assert.equal(result.choices[0].metrics.renderedSeconds,1);assert.equal(result.choices[0].metrics.referenceMatch,'unavailable');
  write('sampleA',4,'sample A',slot,{sample:true});write('sampleB',5,'sample B',slot,{sample:true});const samples=await api.list(sender,'sampleB','1');assert.equal(samples.choices.length,2);assert(samples.choices.every(c=>c.metrics.scope==='sample'));await assert.rejects(api.resolve(sender,{'1':samples.choices[0].token},{subtitleHash,sourceIdentity:source,range:null}),/no longer match/);assert((await api.resolve(sender,{'1':samples.choices[0].token},{subtitleHash,sourceIdentity:source,range:null,sample:true}))['1']);assert.equal((await api.list(sender,'fresh','1')).choices.length,3);
  const selected=result.choices.find(r=>r.sha256===old),scope={subtitleHash,sourceIdentity:source,range:null};
  const compare=result.choices.find(r=>r.compareOnly);assert(compare,'changed recipe can be listened to');await assert.rejects(api.resolve(sender,{'1':compare.token},scope),/no longer match/);

  const resolved=await api.resolve(sender,{'1':selected.token},scope);assert.equal(resolved['1'].sha256,old);assert(!('file'in resolved['1']));
  await assert.rejects(api.resolve(other,{'1':selected.token},scope),/no longer match/);
  await assert.rejects(api.resolve(sender,{'1':selected.token},{...scope,subtitleHash:'d'.repeat(64)}),/no longer match/);
  await assert.rejects(api.resolve(sender,{'1':selected.token},scope,['1']),/no longer match/);
  fs.writeFileSync(path.join(output,'_dub_takes_v1',old+'.wav'),'changed');await assert.rejects(api.resolve(sender,{'1':selected.token},scope),/changed/);
  sender.emit('destroyed');await assert.rejects(api.resolve(sender,{'1':selected.token},scope),/no longer match/);
  await assert.rejects(api.list(sender,'../escape','1'),/Invalid/);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('dub candidate comparison shows recorded evidence and unknown metrics without autoplay or generation',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM(fs.readFileSync('src/renderer/index.html','utf8'),{runScripts:'outside-only'}),w=dom.window;let plays=0,requests=0;
 try{w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.play=async function(){plays++;};w.HTMLElement.prototype.scrollIntoView=function(){};w.document.getElementById('dubGeneratorDialog').open=true;w.UiLocale={get:()=> 'en'};w.DubGeneratorUI={takeContext:()=>({id:'take',key:'1',owner:'fixture',busy:false,recipeReady:false})};w.api={dubGroupTakes:async()=>{requests++;return {ok:true,choices:[{token:'a',current:true,url:'file:///fixture-a.wav',text:'Words',metrics:{scope:'sample',sourceSeconds:2,renderedSeconds:2.3,verification:'not_checked',referenceMatch:'unavailable',recipeMatch:true}},{token:'b',url:'file:///fixture-b.wav',text:'Words',compareOnly:true,metrics:{scope:'sample',sourceSeconds:2,renderedSeconds:2.1,verification:'review',referenceMatch:'different',recipeMatch:false}}]};}};w.eval(fs.readFileSync('src/renderer/dub-group-takes-ui.js','utf8'));w.dispatchEvent(new w.Event('dub-takes:open'));await new Promise(setImmediate);await new Promise(setImmediate);const table=w.document.getElementById('dubTakeMetrics');assert.match(table.textContent,/Short sample/);assert.match(table.textContent,/Not checked/);assert.match(table.textContent,/Review required/);assert.match(table.textContent,/Unknown/);assert.equal(w.document.getElementById('dubTakeApply').disabled,true);assert.equal(plays,0);assert.equal(requests,1);
 }finally{w.close();}
});
