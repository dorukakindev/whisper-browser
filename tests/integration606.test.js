'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {SafeSecretStore}=require('../src/secret-store');
const {sessionMux,ownedSession}=require('../src/session-webrequest-mux');
const {markupPreserved,translationBlockingIssues}=require('../src/subtitle-sentence-layout');
const {range,analyze}=require('../src/media-analysis');
const temporary=t=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'integration606-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;};
test('country intents recognize mixed language casing without enabling negative commands',()=>{
 const {match,selectedRequest}=require('../src/assistant-media-command');
 for(const [country,region]of [['Italy','IT'],['INDIA','IN'],['UNITED STATES','US'],['SPAIN','ES'],['Ingiltere','GB'],['ABD','US']])assert.equal(match(`Where can I watch this film in ${country}?`).region,region);
 assert.equal(match('BU FILM ITALYA DA NEREDE IZLENIR').region,'IT');
 for(const q of ['BUNU IZLEME LISTEME EKLEME','NEDEN BU FILMI EKLE','how do you add this'])assert.equal(match(q),null,q);
 assert(selectedRequest('Italy benzer filmler',''));assert(selectedRequest('KIRMIZI ODA hakkında','Kırmızı Oda'));
});
test('deletion sanitizes recovery mirror, edits preserve old recovery, mirror errors are not success',t=>{
 const dir=temporary(t),file=path.join(dir,'safe.json'),crypt={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>String(b)};
 const store=new SafeSecretStore({filePath:file,safeStorage:crypt,fields:['key','keep']});assert(store.save({key:'SENTINEL-OLD',keep:'KEEP'}).ok);assert(store.save({key:'SENTINEL-NEW',keep:'KEEP'}).ok);
 assert.equal(new SafeSecretStore({filePath:file+'.bak',safeStorage:crypt,fields:['key','keep']}).load().secrets.key,'SENTINEL-OLD');
 assert(store.save({keep:'KEEP'},{dropFields:['key']}).ok);assert(!Object.hasOwn(JSON.parse(fs.readFileSync(file+'.bak')).entries,'key'));
 fs.writeFileSync(file,'invalid');assert.equal(store.load().secrets.key,undefined);assert.equal(store.load().secrets.keep,'KEEP');
 const badfile=path.join(dir,'fail.json'),wrapped=Object.create(fs);wrapped.writeFileSync=(p,...args)=>{if(String(p).endsWith('.tmp.bak'))throw Error('Controlled backup write failure');return fs.writeFileSync(p,...args);};
 const bad=new SafeSecretStore({filePath:badfile,safeStorage:crypt,fields:['key'],fsModule:wrapped});assert(bad.save({key:'OLD'}).ok);assert.equal(bad.save({},{dropFields:['key']}).ok,false);assert.equal(bad.load().secrets.key,'OLD');
});
test('network owners coexist, remove independently, callback-after-throw finishes once',()=>{
 const listeners={},s={webRequest:{onHeadersReceived:fn=>listeners.headers=fn,onBeforeRequest:fn=>listeners.before=fn}};
 const mux=sessionMux(s);mux.set('youtube','onHeadersReceived',{urls:['*://*.googlevideo.com/*']},(d,cb)=>cb({responseHeaders:{...d.responseHeaders,Cors:['yes']}}));
 const proxy=ownedSession(s);proxy.webRequest.onHeadersReceived({urls:['<all_urls>']},(d,cb)=>{cb({responseHeaders:{...d.responseHeaders,Block:['yes']}});throw Error('after');});
 let count=0,result;listeners.headers({url:'https://a.googlevideo.com/test',responseHeaders:{}},r=>{count++;result=r;});assert.equal(count,1);assert.deepEqual(result.responseHeaders,{Cors:['yes'],Block:['yes']});
 proxy.webRequest.onHeadersReceived(null);listeners.headers({url:'https://a.googlevideo.com/test',responseHeaders:{}},r=>result=r);assert.deepEqual(result.responseHeaders,{Cors:['yes']});
 mux.set('first','onBeforeRequest',null,(d,cb)=>cb({cancel:true}));mux.set('second','onBeforeRequest',null,()=>assert.fail('cancel must stop'));listeners.before({url:'https://test/'},r=>assert.equal(r.cancel,true));
});
test('tag sequence, ASS positioning and music markers survive translation',()=>{
 for(const [a,b]of [['<i>Hello</i>','<i>Merhaba</i>'],['{\\an8}Hello','{\\an8}Merhaba'],['♪Sing♪','♪Şarkı♪']])assert(markupPreserved(a,b));
 for(const b of ['Merhaba','</i>Merhaba<i>','<i>Merhaba<i>','<i>Merhaba</i></i>'])assert(translationBlockingIssues('<i>Hello</i>',b).includes('markup_mismatch'));
 assert(markupPreserved('plain source','normal çeviri'));
});
test('QC profiles use frame rate and selected scene cuts without modifying cues',()=>{
 const scan=require('../src/renderer/timeline-issue-scan').scan,cues=[{start:0,end:8,text:'x'.repeat(43)},{start:8.04,end:8.7,text:'A'}],before=JSON.stringify(cues);
 const issues=scan(cues,{profile:'tr-dialogue',fps:25,shots:[4]});for(const kind of ['long','lines','gap','shot','short'])assert(issues.some(i=>i.kind===kind),kind);assert.equal(JSON.stringify(cues),before);
});
test('analysis validates interval and uses real ffmpeg cuts and nonempty waveform with source offsets',async t=>{
 assert.throws(()=>range({start:0,end:1801}));assert.throws(()=>range({start:0,end:1,track:100}));
 const dir=temporary(t),file=path.join(dir,'Türkçe clip.mkv'),ffmpeg=process.platform==='win32'?'C:\\ffmpeg\\bin\\ffmpeg.exe':'ffmpeg';
 const generated=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=320x180:r=24:d=2','-f','lavfi','-i','color=c=white:s=320x180:r=24:d=2','-f','lavfi','-i','sine=frequency=440:duration=4','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','mpeg4','-c:a','pcm_s16le','-y',file],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 const r=await analyze(file,{start:1,end:3},{ffmpeg});assert(r.waveform.points.some(v=>v>.01));assert.equal(r.waveform.start,1);assert(Math.abs(r.waveform.duration-2)<.1);assert(r.shots.some(v=>Math.abs(v-2)<.1),JSON.stringify(r.shots));
 const partial=await analyze(file,{start:1,end:3,track:12},{ffmpeg});assert.equal(partial.waveform,null);assert(partial.warnings.length);assert(partial.shots.length);
 const controller=new AbortController();controller.abort();await assert.rejects(analyze(file,{start:0,end:4},{ffmpeg,signal:controller.signal}),/Cancelled/);
});

test('persisted subtitle index folds Turkish dotted and dotless spelling without external models',t=>{
 const dir=temporary(t),{WatchIndex}=require('../src/watch-index'),index=new WatchIndex(path.join(dir,'index.db'));try{
 index.upsertMedia({id:'m',title:'Fixture',url:'https://example.test/video'});index.upsertTrack({id:'t',mediaId:'m',role:'source'});index.replaceTrackCues('t',[{id:'a',start:12,end:14,text:'Işık İstanbul üzerinden yükseliyor.'}]);
 for(const q of ['isik','ışık','ISIK','istanbul']){const hits=index.searchCues(q);assert.equal(hits.length,1,q);assert.equal(hits[0].start,12);}
 }finally{index.close();}
});
