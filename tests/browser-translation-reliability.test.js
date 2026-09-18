const assert=require('node:assert/strict');
const {BrowserTranslationScheduler}=require('../src/browser-translation-scheduler');
const sentence=(id,start)=>({id,start,end:start+1,text:'Hello.',pieces:[{cueId:id,start,end:start+1,text:'Hello.'}]});
const tick=()=>new Promise(r=>setTimeout(r,10));
(async()=>{
 const calls=[],results=[];
 const scheduler=new BrowserTranslationScheduler({maxConcurrent:1,lookAhead:5,lookBehind:1,translate:(sentence,context)=>new Promise(resolve=>calls.push({id:sentence.id,resolve,context})),onResult:r=>results.push(r)});
 scheduler.setSentences([sentence('early',0),sentence('late',3600)]);scheduler.updatePlayhead(0);
 await tick();assert.equal(calls[0].id,'early');
 scheduler.updatePlayhead(3600);await tick();assert.equal(calls[1].id,'late','Seek yeni bölgeye öncelik vermeli');
 calls[0].resolve(JSON.stringify({text:'Eski yanıt.'}));calls[1].resolve(JSON.stringify({text:'Merhaba.'}));
 await scheduler.whenIdle();assert.deepEqual(results.map(r=>r.sentenceId),['late'],'Geç gelen iptal edilmiş yanıt gösterilmemeli');
 let count=0;
 const retry=new BrowserTranslationScheduler({paused:true,maxConcurrent:1,maxAttempts:2,retryBaseMs:10,translate:async()=>{count++;if(count<=2)throw Error('Kontrollü bağlantı kesintisi');return JSON.stringify({text:'Merhaba.'});}});
 retry.setSentences([sentence('recover',0)]);retry.completeAll();await tick();assert.equal(count,0);
 retry.setPaused(false);await retry.whenIdle();assert.equal(retry.snapshot().failures.length,1);
 retry.retryFailed();await retry.whenIdle();assert.equal(retry.snapshot().completed,1);assert.equal(count,3);
 scheduler.cancelAll();retry.cancelAll();assert.equal(scheduler.pending.size,0);assert.equal(retry.retryTimers.size,0);
 // Devre kesici: arka arkaya gelen 5xx'lerde kalan cümleler fırtına yerine kesilir.
 const uniq=(id,start)=>({id,start,end:start+1,text:'Hello '+id,pieces:[{cueId:id,start,end:start+1,text:'Hello '+id}]});
 let storm=0;
 const trip=new BrowserTranslationScheduler({maxConcurrent:2,maxAttempts:5,retryBaseMs:5,providerFailureThreshold:4,translate:async()=>{storm++;const e=new Error('HTTP 502');e.httpStatus=502;throw e;}});
 trip.setSentences([uniq('s0',0),uniq('s1',1),uniq('s2',2),uniq('s3',3),uniq('s4',4),uniq('s5',5)]);
 trip.completeAll();await trip.whenIdle();
 assert.equal(storm,4,'Eşik sonrası kalan cümleler denenmemeli');
 assert.equal(trip.snapshot().failures.length,6,'Tüm cümleler sonuçsuz işaretlenmeli');
 assert.ok(trip.providerFailure.includes('arka arkaya'));
 // Başarı ardışık sayacı sıfırlar: kesikli hatalar devre kesiciyi tetiklemez.
 let flaky=0;
 const mixed=new BrowserTranslationScheduler({maxConcurrent:1,maxAttempts:1,providerFailureThreshold:3,translate:async()=>{flaky++;if(flaky%2)throw Object.assign(new Error('HTTP 503'),{httpStatus:503});return JSON.stringify({text:'Merhaba.'});}});
 mixed.setSentences([uniq('m0',0),uniq('m1',1),uniq('m2',2),uniq('m3',3)]);
 mixed.completeAll();await mixed.whenIdle();
 assert.equal(flaky,4,'Ard arda olmayan hatalar kuyruğu kesmemeli');
 // Retry-After: sunucunun istediği bekleme süresi uygulanır.
 let raCalls=0;
 const ra=new BrowserTranslationScheduler({maxConcurrent:1,maxAttempts:2,retryBaseMs:5,translate:async()=>{raCalls++;const e=new Error('HTTP 429');e.httpStatus=429;e.retryAfterMs=80;throw e;}});
 ra.setSentences([sentence('ra',0)]);ra.completeAll();
 const raStart=Date.now();await ra.whenIdle();
 assert.equal(raCalls,2);assert.ok(Date.now()-raStart>=70,'Retry-After bekleme uygulanmalı');
 console.log('Kontrollü sağlayıcı: seek, geç yanıt, offline, retry, devre kesici ve Retry-After geçti.');
})().catch(e=>{console.error(e);process.exitCode=1});
