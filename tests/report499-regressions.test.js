'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=process.env.REPORT499_BASE || path.resolve(__dirname,'..');
const mod=name=>require(path.join(root,'src',name));
const S=mod('browser-translation-scheduler'), P=mod('browser-subtitles'), O=mod('subtitle-output-contract');
const cue={start:1,end:3,text:'Hello.'};
test('499-01 translation retains canonical cue identity',()=>{
 assert.equal(S.normalizeCues([{...cue,cueId:'original',id:'legacy'}])[0].id,'original');
});
test('499-02 translation rejects coerced non-time values',()=>{
 for(const start of [null,false,[],{} ,'']) assert.equal(S.normalizeCues([{...cue,start}]).length,0);
 assert.equal(S.normalizeCues([{...cue,start:'1'}]).length,1);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function timedScheduler(){
 const file=path.join(root,'src/browser-translation-scheduler.js'), timers=new Map(); let id=0;
 const context={module:{exports:{}},require:createRequire(file),AbortController,console,
  setTimeout:(fn,ms)=>{const token=++id;timers.set(token,{fn,ms});return token;},clearTimeout:token=>timers.delete(token)};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const scheduler=new context.module.exports.BrowserTranslationScheduler({maxConcurrent:1,maxAttempts:2,
  translate:async()=>{throw Object.assign(new Error('busy'),{retryAfterMs:1e15});}});
 scheduler.setSentences(S.assembleCueSentences([cue]));return {scheduler,timers};
}
test('499-03 excessive Retry-After cannot overflow the native timer',async()=>{
 const {scheduler,timers}=timedScheduler();scheduler.completeAll();await tick();
 assert.equal(timers.size,1);assert.ok([...timers.values()][0].ms<=2147483647);scheduler.cancelAll();
});
test('499-04 replacing a failed cue clears its pending retry timer',async()=>{
 const {scheduler,timers}=timedScheduler();scheduler.completeAll();await tick();
 scheduler.reconcileSentences([]);assert.equal(timers.size,0);assert.equal(scheduler.retryTimers.size,0);await scheduler.whenIdle();
});
const json=value=>P.parseSubtitlePayload(JSON.stringify(value),'application/json','cues.json').cues;
test('499-05 malformed JSON3 rows and segments do not discard valid dialogue',()=>{
 const result=json({events:[null,{tStartMs:1000,dDurationMs:2000,segs:[null,{utf8:'Hello.'}]}]});
 assert.equal(result[0].text,'Hello.');assert.equal(result[0].start,1);
 assert.equal(json({events:[{tStartMs:1000,dDurationMs:2000,segs:[null,{utf8:'Still here'}]}]})[0].text,'Still here');
});
test('499-06 JSON cues preserve speaker and protected presentation metadata',()=>{
 const result=json({cues:[{...cue,speaker:'Alice',cueId:'a',region:'top',protected:true}]});
 assert.equal(result[0].speaker,'Alice');assert.equal(result[0].cueId,'a');assert.equal(result[0].region,'top');assert.equal(result[0].protected,true);
});
test('499-07 append captions belong to their own JSON3 window',()=>{
 const result=json({events:[{tStartMs:1000,dDurationMs:4000,wWinId:1,segs:[{utf8:'First'}]},
  {tStartMs:1000,dDurationMs:4000,wWinId:2,segs:[{utf8:'Other'}]},
  {tStartMs:2000,dDurationMs:1000,wWinId:1,aAppend:1,segs:[{utf8:' continued'}]}]});
 assert.deepEqual(result.map(c=>c.text),['First continued','Other']);
});
test('499-08 null caption metadata does not crash track capture',()=>{
 assert.equal(P.parseYoutubeCaptionMetadata('null').automatic,false);
});
test('499-09 malformed normalized cue rows do not prevent opening a track',()=>{
 assert.deepEqual(P.normalizeCues([null,undefined,cue]).map(c=>c.text),['Hello.']);
 assert.deepEqual(P.normalizeCues({}),[]);
});
test('499-10 missing and boolean cue starts do not create phantom captions at zero',()=>{
 for(const start of [null,false,[],{} ,'']) assert.equal(P.normalizeCues([{...cue,start}]).length,0);
 assert.equal(P.normalizeCues([{...cue,start:0}]).length,1);
});
test('499-11 output selection anchors lineage to the source rather than first translation',()=>{
 const r=O.selectOutputs({outputs:[{path:'old.tr.srt',role:'translation',sourceId:'old'},
  {path:'current.srt',role:'source',sourceId:'current'},{path:'current.tr.srt',role:'translation',sourceId:'current'}]});
 assert.equal(r.source.path,'current.srt');assert.equal(r.translation.path,'current.tr.srt');
});
test('499-12 translation-only outputs cannot combine different source revisions',()=>{
 const r=O.selectOutputs({outputs:[{path:'a.srt',role:'translation',sourceId:'a',sourceHash:'new'},
 {path:'b.srt',role:'dual',sourceId:'a',sourceHash:'old'}]});assert.equal(r.dual,null);
});
const {BrowserSubtitlePreferences:Prefs}=mod('browser-subtitle-preferences');
const row=(name='one')=>({mediaId:name,url:`https://video.test/${name}`,subtitleMode:'both',subtitleSelection:{primaryFile:'saved.srt'}});
test('499-16 newer preferences cannot be overwritten through fallback backup',()=>{
 let writes=0;const p=new Prefs({read:()=>({version:2,items:[]}),readBackup:()=>({version:1,items:[row()]}),write:()=>writes++});
 assert.throws(()=>p.put(row('two')));assert.equal(writes,0);
});
test('499-17 malformed preference selection restores the valid backup',()=>{
 const p=new Prefs({read:()=>({version:1,items:[{...row(),subtitleSelection:'bad'}]}),readBackup:()=>({version:1,items:[row()]}),write:()=>{}});
 assert.equal(p.recovery,'backup');assert.equal([...p.items.values()][0].subtitleSelection.primaryFile,'saved.srt');
});
test('499-18 duplicate canonical preferences cannot silently overwrite the original',()=>{
 const p=new Prefs({read:()=>({version:1,items:[row(),{...row(),subtitleSelection:{primaryFile:'wrong.srt'}}]}),
 readBackup:()=>({version:1,items:[row()]}),write:()=>{}});assert.equal(p.recovery,'backup');assert.equal([...p.items.values()][0].subtitleSelection.primaryFile,'saved.srt');
});
async function temp(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'wb499-'));try{await fn(d);}finally{fs.rmSync(d,{recursive:true,force:true});}}
const {PersistentTranslationCache:Cache}=mod('browser-translation-cache');
test('499-19 future cache schema remains untouched rather than archived and replaced',()=>temp(async d=>{
 const f=path.join(d,'cache.json'),body=JSON.stringify({version:3,entries:[['future',{value:'valuable'}]]});fs.writeFileSync(f,body);
 const c=new Cache(f);const accepted=c.set('new','value');clearTimeout(c.timer);const result=await c.flush();
 assert.equal(accepted,false);assert.equal(result.ok,false);assert.equal(fs.readFileSync(f,'utf8'),body);assert.equal(fs.readdirSync(d).length,1);
 fs.writeFileSync(f+'.bak',JSON.stringify({version:2,entries:[['saved',{value:'backup',updatedAt:Date.now()}]]}));
 fs.writeFileSync(f+'.journal','{future journal');const recovered=new Cache(f);
 assert.equal(recovered.get('saved'),'backup');assert.equal((await recovered.compact()).ok,false);
 assert.equal(fs.readFileSync(f+'.journal','utf8'),'{future journal');assert.equal(fs.readFileSync(f,'utf8'),body);
}));
test('499-20 invalid journal timestamps cannot revive stale cache values indefinitely',()=>temp(async d=>{
 const f=path.join(d,'cache.json');fs.writeFileSync(f,JSON.stringify({version:2,entries:[]}));
 fs.writeFileSync(f+'.journal',[{k:'timeless',v:'stale'},{k:'forever',v:'stale',t:Date.now()+1e15},
 {k:'valid',v:'good',t:Date.now()}].map(v=>JSON.stringify(v)).join('\n')+'\n');
 const c=new Cache(f);assert.equal(c.get('timeless'),undefined);assert.equal(c.get('forever'),undefined);assert.equal(c.get('valid'),'good');
}));
