'use strict';
// Real DOM (the real markup from index.html + the real dub-runs-ui.js) → a bridge that structured-clones like IPC →
// the real registerDubService handlers → back into the DOM. Delays and lost replies are injected between DOM and handler.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{world,wav,outputOf,sha}=require('./dub-run-world'),{voiceStorage}=require('../src/voice-storage');
const read=name=>fs.readFileSync(path.join(__dirname,'../src/renderer',name),'utf8');
const runsHtml=read('index.html').match(/<details class="dub-card dub-runs"[\s\S]*?<\/details>/)[0];
const clone=value=>value===undefined?value:JSON.parse(JSON.stringify(value));
const tick=(ms=15)=>new Promise(resolve=>setTimeout(resolve,ms));
const settle=async()=>{for(let i=0;i<4;i++)await tick(8);};

test('closing the panel after restore approval leaves the single owned copy running and reopening shows the result',async()=>{
 const w=world(),originalCopy=fs.promises.copyFile;let page,release;
 try{
  const moved=path.join(w.root,'close-during-copy.wav'),svc=w.boot({dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[moved]})}});
  await svc.call('dub:start',w.request('close-restore'));const worker=w.spawns.at(-1),target=outputOf(worker);fs.writeFileSync(target,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);fs.renameSync(target,moved);
  page=ui(svc);await page.open();await page.select('close-restore');await page.click('WAV dosyasını bul');
  let reached,copies=0;const arrived=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  fs.promises.copyFile=async function(from,to){if(to===target){copies++;reached();await gate;}return originalCopy.apply(this,arguments);};
  page.button('Kopyalayarak geri yükle').click();await arrived;await page.close();assert(svc.service.running());release();
  for(let i=0;i<40&&svc.service.running();i++)await tick(10);assert(!svc.service.running());assert.equal(copies,1);assert(fs.existsSync(target));assert(fs.existsSync(moved));
  await page.open();assert.equal(page.state('close-restore'),'completed');assert.equal(page.section.querySelectorAll('audio[autoplay]').length,0);
 }finally{release?.();fs.promises.copyFile=originalCopy;page?.close_();w.close();}
});

test('temporary details load only on request, remain read-only and discard late answers after closing',async()=>{
 const w=world();let page;
 try{
  const svc=w.boot();await svc.call('dub:runs',{action:'list'});const name='.restore-'+'e'.repeat(32)+'.wav',file=path.join(w.out,name);fs.writeFileSync(file,wav(1));const hash=sha(fs.readFileSync(file));
  page=ui(svc);await page.open();assert(!page.log.some(row=>row[0]==='output-restore-files'));
  const held=page.hold(req=>req.action==='output-restore-files','after');page.button('Geçici dosya ayrıntıları').click();await held.reached;await page.click('Geçici dosya ayrıntılarını kapat');held.release();await settle();assert.equal(page.doc.getElementById('dubTemporaryFiles').hidden,true);
  await page.click('Geçici dosya ayrıntıları');assert(page.doc.getElementById('dubTemporaryFiles').textContent.includes(name));assert(page.doc.getElementById('dubTemporaryFiles').textContent.includes('salt okunur'));assert.equal(sha(fs.readFileSync(file)),hash);
  await page.close();assert.equal(page.doc.getElementById('dubTemporaryFiles').hidden,true);
 }finally{page?.close_();w.close();}
});

test('temporary-copy notice preserves files and record-write failure explains the already copied audio',async()=>{
 const w=world(),originalRename=fs.renameSync;let page;
 try{
  const moved=path.join(w.root,'preserved.wav'),svc=w.boot({dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[moved]})}});
  await svc.call('dub:start',w.request('record-fail-ui'));const worker=w.spawns.at(-1),file=outputOf(worker);fs.writeFileSync(file,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);const log=svc.events.at(-1).logPath;fs.renameSync(file,moved);
  const leftover=path.join(w.out,'.restore-'+'b'.repeat(32)+'.wav');fs.writeFileSync(leftover,wav(1));
  page=ui(svc);await page.open();assert(page.section.textContent.includes('etkin onaya bağlı değil'));assert(fs.existsSync(leftover));
  await page.select('record-fail-ui');await page.click('WAV dosyasını bul');
  fs.renameSync=function(from,to){if(to===log){const error=Error('Controlled ENOSPC');error.code='ENOSPC';throw error;}return originalRename.apply(this,arguments);};
  await page.click('Kopyalayarak geri yükle');fs.renameSync=originalRename;
  assert(page.section.textContent.includes('WAV kopyalandı ve doğrulandı'));assert(page.section.textContent.includes('üretim kaydı güncellenemedi'));assert(!page.section.textContent.includes('WAV geri yüklendi.'));assert(fs.existsSync(moved));assert(fs.existsSync(file));assert(fs.existsSync(leftover));
  assert(page.button('Dinle (yalnız inceleme)'));assert.equal(w.spawns.length,1);
 }finally{fs.renameSync=originalRename;page?.close_();w.close();}
});

test('matching moved WAV is previewed and copied only by explicit restore; closing a delayed picker discards approval',async()=>{
 const w=world();let page;
 try{
  const moved=path.join(w.root,'Taşınmış ses.wav');
  const svc=w.boot({dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[moved]})}});
  await svc.call('dub:start',w.request('moved-ui'));const worker=w.spawns.at(-1),file=outputOf(worker);fs.writeFileSync(file,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);fs.renameSync(file,moved);
  page=ui(svc);await page.open();await page.select('moved-ui');assert(page.button('WAV dosyasını bul'));
  const hold=page.hold(req=>req.action==='output-restore-preview','after');page.button('WAV dosyasını bul').click();await hold.reached;
  await page.close();hold.release();await settle();assert(!fs.existsSync(file));assert(!fs.readdirSync(w.out).some(name=>name.startsWith('.restore-')));
  await page.open();await page.select('moved-ui');await page.click('WAV dosyasını bul');assert(page.section.textContent.includes('Taşınmış ses.wav'));assert(page.button('Kopyalayarak geri yükle'));assert(!fs.existsSync(file));
  await page.click('Kopyalayarak geri yükle');assert(fs.existsSync(file));assert(fs.existsSync(moved));assert.equal(sha(fs.readFileSync(file)),sha(fs.readFileSync(moved)));assert(page.section.textContent.includes('WAV geri yüklendi'));
  assert.equal(w.spawns.length,1);assert.equal(page.section.querySelectorAll('audio[autoplay]').length,0);
 }finally{page?.close_();w.close();}
});

function ui(svc,{locale='tr',loadable=false}={}){
 const dom=new JSDOM(`<body><dialog id="dubGeneratorDialog">${runsHtml}</dialog></body>`,{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,log=[],holds=[];
 const bridge={holds,lose:null,failList:false,busyEvents:[]};
 Object.assign(w,{UiLocale:{get:()=>locale},DubGeneratorBridge:{probe:async()=>loadable,load:async id=>{log.push(['load',id]);return {ok:true};}},
  api:{dubRuns:async request=>{
    const req=clone(request);log.push([req.action,req.runId||req.settings||'']);
    if(req.action==='list'&&bridge.failList)throw Error('IPC down');
    const hold=holds.find(item=>!item.used&&item.match(req));
    if(hold&&hold.phase==='before'){hold.used=true;hold.reach();await hold.gate;}
    const result=await svc.call('dub:runs',req);
    if(hold&&hold.phase==='after'){hold.used=true;hold.reach();await hold.gate;}
    if(bridge.lose&&!bridge.lose.used&&bridge.lose.match(req)){bridge.lose.used=true;throw Error('reply lost');}
    return clone(result);
   },latestDub:async request=>clone(await svc.call('dub:latest',clone(request))),onDubEvent:callback=>svc.on(callback)}});
 w.addEventListener('dub-runs:busy',event=>bridge.busyEvents.push(event.detail));
 w.eval(read('dub-runs-ui.js'));
 const doc=w.document,dialog=doc.getElementById('dubGeneratorDialog'),section=doc.getElementById('dubRuns');
 const hold=(match,phase='before')=>{const item={match,phase,used:false};item.gate=new Promise(resolve=>{item.release=resolve;});item.reached=new Promise(resolve=>{item.reach=resolve;});holds.push(item);return item;};
 return {w,doc,log,bridge,hold,section,
  open:async()=>{dialog.setAttribute('open','');section.open=true;section.dispatchEvent(new w.Event('toggle'));await settle();},
  close:async()=>{dialog.removeAttribute('open');await settle();},
  rows:()=>[...doc.querySelectorAll('.dub-run')],row:id=>doc.querySelector(`.dub-run[data-run="${id}"]`),
  state:id=>doc.querySelector(`.dub-run[data-run="${id}"]`)?.dataset.state,
  button:text=>[...section.querySelectorAll('button')].find(item=>item.textContent.includes(text)),
  click:async text=>{const target=[...section.querySelectorAll('button')].find(item=>item.textContent.includes(text));assert(target,'button: '+text);target.click();await settle();},
  select:async id=>{doc.querySelector(`.dub-run[data-run="${id}"] .dub-run-main`).click();await settle();},
  text:()=>section.textContent,count:action=>log.filter(item=>item[0]===action).length,close_:()=>w.close()};
}
const failRun=async(w,svc,id,extra={})=>{const index=w.spawns.length;assert.equal((await svc.call('dub:start',{...w.request(id),...extra})).ok,true);const proc=w.spawns[index].proc;proc.stderr.emit('data','worker exploded');proc.exitCode=1;proc.emit('close',1);await tick();};
test('assistant result opening cannot report another selected run audio as its own success',async()=>{
 const w=world();try{
  await interrupted(w,'run-a');await interrupted(w,'run-b');const svc=w.boot(),page=ui(svc);await page.open();
  const slow=page.hold(req=>req.action==='review'&&req.runId==='run-a');
  const first=page.w.DubRunsUI.focusRun('run-a','result');await slow.reached;
  assert.equal((await page.w.DubRunsUI.focusRun('run-b','result')).ok,true);
  slow.release();const old=await first;assert.equal(old.ok,false);assert.equal(page.w.DubRunsUI.state().selected,'run-b');
  page.close_();
 }finally{w.close();}
});
const interrupted=async(w,id,{evidence=true,audio=true}={})=>{ // a run whose app died; returns the lease edit so a new "app" sees a dead instance
 const first=w.boot(),index=w.spawns.length;assert.equal((await first.call('dub:start',w.request(id))).ok,true);
 const output=outputOf(w.spawns[index]);if(audio)fs.writeFileSync(output,wav(2));if(audio&&evidence)w.spawns[index].proc.stdout.emit('data','Tamamlandi: '+output+'\n');
 const leaseDir=path.join(w.logs,'instances');for(const name of fs.readdirSync(leaseDir)){const file=path.join(leaseDir,name),lease=JSON.parse(fs.readFileSync(file,'utf8'));if(lease.activeRunId===id)fs.writeFileSync(file,JSON.stringify({...lease,pid:2147483000}));}
 return w.spawns[index].proc;
};

test('recent runs: every state is distinct, unreadable records are announced, selecting never starts or recovers anything, a failed refresh keeps the last list',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-failed');
  await interrupted(w,'run-cut');
  const crafted=w.ledger('X',1),file=path.join(w.logs,'run-done-1.json');crafted.begin({summaryPath:file,id:'run-done',startedAt:new Date().toISOString(),label:'Bölüm 3',pinned:{profile:'quality',subtitleHash:sha('fixture'),range:{start:0,end:90}}});crafted.settle(file,{id:'run-done',result:'done',startedAt:new Date().toISOString()});crafted.end('run-done');fs.writeFileSync(path.join(w.out,'run-done.wav'),wav(3));
  fs.writeFileSync(path.join(w.logs,'torn-1.json'),'{"id":"torn","res');fs.writeFileSync(path.join(w.out,'stray.wav'),wav(1));
  const svc=w.boot(),page=ui(svc);await page.open();
  assert.deepEqual([page.state('run-failed'),page.state('run-cut'),page.state('run-done')],['failed','interrupted','completed']);
  assert.match(page.row('run-cut').textContent,/Kesilmiş/);assert.match(page.row('run-done').textContent,/Bölüm 3/);assert.match(page.row('run-done').textContent,/0:00–1:30/);assert.match(page.row('run-done').textContent,/ses 0:03/);
  assert.match(page.text(),/1 kayıt okunamadı; dosyalar korunuyor, diğer çalışmalar kullanılabilir/);assert.match(page.text(),/1 ses dosyasının iş kaydı yok/);
  const spawnsBefore=w.spawns.length;await page.select('run-cut');
  assert.equal(page.count('recover'),0,'selecting a recoverable run does not recover it');assert.equal(page.count('retry-approve'),0);assert.equal(w.spawns.length,spawnsBefore);
  const cutFile=path.join(w.logs,fs.readdirSync(w.logs).find(n=>n.startsWith('run-cut')));assert.equal(JSON.parse(fs.readFileSync(cutFile,'utf8')).result,'running','the record is untouched by selection');
  page.bridge.failList=true;await page.click('Yenile');
  assert.match(page.text(),/Liste yenilenemedi; son geçerli liste gösteriliyor/);assert.equal(page.rows().length,3,'the earlier valid list stays');
  page.close_();
 }finally{w.close();}
});

test('detail races: a late detail answer for run A never replaces the selection of run B, and a closed panel stays unchanged',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-a');await failRun(w,a,'run-b');
  const svc=w.boot(),page=ui(svc);await page.open();
  const slow=page.hold(request=>request.action==='detail'&&request.runId==='run-a'),pendingA=page.select('run-a');await slow.reached;
  await page.select('run-b');assert.equal(page.row('run-b').dataset.selected,'true');
  slow.release();await pendingA;await settle();
  assert.equal(page.row('run-b').dataset.selected,'true');assert.equal(page.row('run-a').dataset.selected,undefined);assert.equal(page.doc.querySelectorAll('.dub-run-detail').length,1);
  // a detail answer arriving after the panel was closed changes nothing
  const late=page.hold(request=>request.action==='detail'&&request.runId==='run-a'),pending=page.select('run-a');await late.reached;
  await page.close();late.release();await pending;await settle();
  assert.equal(page.doc.querySelectorAll('.dub-run-detail').length,0,'no detail resurfaces after closing');
  page.close_();
 }finally{w.close();}
});

test('two retry previews stay separate: each confirm button approves only its own option package, a double click starts one generation, and the reply is "started", never "finished"',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-f',{profile:'fast'});
  fs.writeFileSync(path.join(w.root,'dub-settings.json'),JSON.stringify({timingMode:'clip',keepEngine:false,profile:'quality',autoFit:false,naturalSpeech:false}));
  const svc=w.boot(),page=ui(svc);await page.open();await page.select('run-f');
  await page.click('Sabitlenmiş seçeneklerle yeniden dene');await page.click('Güncel ayarlarla yeni üretim');
  const panels=[...page.section.querySelectorAll('.dub-run-preview')];assert.deepEqual(panels.map(p=>p.dataset.mode),['pinned','current']);
  assert.match(panels[0].textContent,/Özgün işin seçenekleriyle yeni bir üretim/);assert.match(panels[1].textContent,/bugünkü ayarlarla/);
  assert.match(panels[1].textContent,/Ses kalitesi: Kaliteli \(kullanılacak\) · Hızlı \(özgün\)/,'the meaningful difference is shown in words, not hashes');assert.doesNotMatch(page.text(),/[a-f0-9]{40,}/,'no hash pile is shown');
  assert.match(panels[0].textContent,/aynı sesin üretileceği anlamına gelmez/);
  const [pinnedConfirm,currentConfirm]=panels.map(p=>p.querySelector('button[data-mode]'));assert.notEqual(pinnedConfirm.textContent,currentConfirm.textContent);
  const before=w.spawns.length;currentConfirm.click();currentConfirm.click();await settle();
  assert.equal(w.spawns.length,before+1,'a double click starts exactly one generation');
  assert.equal(w.spawns.at(-1).args[w.spawns.at(-1).args.indexOf('--steps')+1],'15','the CURRENT option package (quality) ran, not the pinned one');
  assert.match(page.text(),/Üretim başlatıldı; henüz tamamlanmadı/);assert.doesNotMatch(page.text(),/Üretim tamamlandı/);
  assert.equal(page.doc.querySelector('[data-preview="pinned"]'),null,'the sibling preview is closed once a generation started');
  assert.match(page.row(w.records().find(r=>r.retryOf==='run-f').id).textContent,/Çalışıyor/);assert.equal(page.bridge.busyEvents.at(-1),true,'the panel tells the generator that a production is running');
  page.close_();
 }finally{w.close();}
});

test('pinned retry carries the pinned options; a lost reply is reported as unknown and the same approval replays without a second generation',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-f',{profile:'fast'});fs.writeFileSync(path.join(w.root,'dub-settings.json'),JSON.stringify({timingMode:'clip',keepEngine:false,profile:'quality',autoFit:false,naturalSpeech:false}));
  const svc=w.boot(),page=ui(svc);await page.open();await page.select('run-f');await page.click('Sabitlenmiş seçeneklerle yeniden dene');
  page.bridge.lose={used:false,match:request=>request.action==='retry-approve'};const before=w.spawns.length;
  await page.click('Sabit seçeneklerle başlat');
  assert.equal(w.spawns.length,before+1,'the service started it although the reply was lost');
  assert.equal(w.spawns.at(-1).args[w.spawns.at(-1).args.indexOf('--steps')+1],'10','the pinned profile (fast) reached the worker');
  assert.match(page.text(),/Sonuç bilinmiyor/);assert.match(page.text(),/başarılı da başarısız da sayılmadı/i);
  await page.click('Aynı onayı yeniden gönder');
  assert.match(page.text(),/zaten kullanılmıştı: aynı üretim, yeniden başlatılmadı/);assert.equal(w.spawns.length,before+1,'the replay starts nothing');
  page.close_();
 }finally{w.close();}
});

test('closing the panel while an approval is sent: the generation continues, the late reply changes nothing, and reopening or reloading shows the one running run without a second start',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-f');
  const svc=w.boot(),page=ui(svc);await page.open();await page.select('run-f');await page.click('Sabitlenmiş seçeneklerle yeniden dene');
  const slow=page.hold(request=>request.action==='retry-approve','after'),before=w.spawns.length;
  page.button('Sabit seçeneklerle başlat').click();await slow.reached;
  await page.close();assert.equal(page.doc.querySelectorAll('.dub-run-preview').length,0);
  slow.release();await settle();assert.equal(page.doc.querySelectorAll('.dub-run-preview').length,0,'a reply for a closed panel changes nothing');
  await page.open();const retry=w.records().find(r=>r.retryOf==='run-f');
  assert.equal(page.state(retry.id),'running');assert.equal(w.spawns.length,before+1);
  // renderer reload: a brand new page over the same running backend
  const reloaded=ui(svc);await reloaded.open();assert.equal(reloaded.state(retry.id),'running');assert.equal(reloaded.bridge.busyEvents.at(-1),true);assert.equal(w.spawns.length,before+1,'a reload never starts a second production');
  assert.equal(reloaded.button('Yeniden dene'),undefined,'no retry is offered while a production is running');
  page.close_();reloaded.close_();
 }finally{w.close();}
});

test('a consumed or refused approval gives a new-preview path with the reason; the dead button is not reusable',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-f');const svc=w.boot(),page=ui(svc);await page.open();await page.select('run-f');await page.click('Sabitlenmiş seçeneklerle yeniden dene');
  fs.rmSync(path.join(voiceStorage(w.app).input,'run-f'),{recursive:true});   // the stored input disappears between preview and approval
  const before=w.spawns.length;await page.click('Sabit seçeneklerle başlat');
  assert.equal(w.spawns.length,before);assert.match(page.text(),/kayıtlı girdisi yok/);assert.match(page.text(),/yeni önizleme gerekir/);
  assert.equal(page.section.querySelector('button[data-mode]').disabled,true,'the used-up approval cannot be pressed again');
  await page.click('Yeni önizleme');assert.match(page.text(),/Kaynağı aç ve yeni bir üretim başlat/,'the new preview explains the safe next step');
  page.close_();
 }finally{w.close();}
});

test('voice: a changed reference file under the same name blocks the pinned retry, a missing reference blocks both, and the current-settings preview names the difference',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-f');const svc=w.boot(),page=ui(svc);await page.open();await page.select('run-f');
  fs.writeFileSync(path.join(w.engine,'anlatici_ham.wav'),'same name, different content');
  await page.click('Sabitlenmiş seçeneklerle yeniden dene');assert.match(page.text(),/Ses referansı bu işten sonra değişti/);assert.match(page.text(),/Güncel sesle yeniden dene/);
  await page.click('Güncel ayarlarla yeni üretim');assert.match(page.section.querySelector('[data-preview="current"]').textContent,/Ses: referans değişti/);
  fs.rmSync(path.join(w.engine,'anlatici_ham.wav'));
  page.section.querySelector('[data-preview="current"]').querySelectorAll('button')[1].click();await settle();assert.match(page.section.querySelector('[data-preview="current"]').textContent,/Kayıtlı ses referansı yok veya okunamıyor/);
  page.close_();
 }finally{w.close();}
});

test('recovery is explicit and shows the real service result; unproven audio is not recoverable; nothing plays or attaches; concurrent clicks give one consistent result',async()=>{
 const w=world();try{
  await interrupted(w,'run-proof');await interrupted(w,'run-maybe',{evidence:false});await interrupted(w,'run-none',{audio:false});
  const svc=w.boot(),page=ui(svc,{loadable:true});await page.open();
  await page.select('run-proof');assert.match(page.text(),/İşçi bittiğini bildirdi ve ses dosyası WAV denetimini geçiyor/,'the user can see WHY it is recoverable');
  assert(page.button('Çıktıyı kurtar'));await page.select('run-maybe');
  assert.equal(page.button('Çıktıyı kurtar'),undefined,'unproven audio offers no recovery');assert.match(page.text(),/tamamlandığı kanıtlı değil/);assert(page.button('Dinle'),'it can still be listened to for inspection');
  await page.select('run-none');assert.equal(page.button('Çıktıyı kurtar'),undefined);assert.equal(page.button('Dinle'),undefined,'no audio, no listening action');
  await page.select('run-proof');const spawns=w.spawns.length;
  const recoverButton=page.button('Çıktıyı kurtar');recoverButton.click();recoverButton.click();await settle();
  assert.equal(w.records().find(r=>r.id==='run-proof').result,'done');assert.equal(page.count('recover'),1,'the second click was absorbed');
  assert.match(page.text(),/Kurtarıldı\. Hiçbir bölüme bağlanmadı ve çalmadı/);assert.equal(page.doc.querySelectorAll('audio').length,0,'recovery never plays');assert.equal(page.log.filter(i=>i[0]==='load').length,0,'recovery never attaches to a section');
  assert.match(page.row('run-proof').textContent,/Tamamlandı/);assert.match(page.row('run-proof').textContent,/kurtarıldı/);assert.equal(w.spawns.length,spawns);
  page.close_();
 }finally{w.close();}
});

test('listening: listening-only is labelled as such, a file that changed after the list is an explained error with a next step, and loading into a section goes through the saved-output check',async()=>{
 const w=world();try{
  await interrupted(w,'run-proof');await interrupted(w,'run-maybe',{evidence:false});
  const svc=w.boot(),page=ui(svc);await page.open();
  await page.select('run-maybe');await page.click('Dinle');
  assert(page.doc.querySelector('audio.dub-run-audio'));assert.equal(page.doc.querySelector('audio').autoplay,false);assert.match(page.text(),/Yalnız dinleme: kaynağa ve zaman eksenine bağlı değil, senkron kullanılamaz/);
  // the file disappears between listing and opening
  await page.select('run-proof');fs.rmSync(path.join(w.out,'run-proof.wav'));await page.click('Dinle');
  assert.match(page.text(),/liste yüklendikten sonra değişti veya kayboldu/);assert.match(page.text(),/Listeyi yenile/);assert.equal(page.state('run-proof'),'interrupted');assert.match(page.row('run-proof').textContent,/ses yok/);
  page.close_();
 }finally{w.close();}
 const w2=world();try{
  const crafted=w2.ledger('X',1),file=path.join(w2.logs,'run-done-1.json');crafted.begin({summaryPath:file,id:'run-done',startedAt:new Date().toISOString(),label:'Bölüm',pinned:{profile:'quality',subtitleHash:sha('fixture'),range:{start:0,end:60},sourceIdentity:'media-x'}});crafted.settle(file,{id:'run-done',result:'done',startedAt:new Date().toISOString()});crafted.end('run-done');fs.mkdirSync(w2.out,{recursive:true});fs.writeFileSync(path.join(w2.out,'run-done.wav'),wav(2));
  const svc=w2.boot();
  const yes=ui(svc,{loadable:true});await yes.open();await yes.select('run-done');
  assert(yes.button('Bu bölüme yükle'),'a bound, matching result can be loaded');await yes.click('Bu bölüme yükle');assert.deepEqual(yes.log.filter(i=>i[0]==='load'),[['load','run-done']]);assert.match(yes.text(),/çalmaya başlamadı/);
  const no=ui(svc,{loadable:false});await no.open();await no.select('run-done');
  assert.equal(no.button('Bu bölüme yükle'),undefined);assert.match(no.text(),/şu anki altyazı\/aralık\/kaynakla eşleşmiyor; yalnız dinlenebilir/);assert(no.button('Dinle'));
  yes.close_();no.close_();
 }finally{w2.close();}
});

test('a late close from an older run never changes a newer running run, and English labels are used when the locale is English',async()=>{
 const w=world();try{
  const a=w.boot();await failRun(w,a,'run-f');const old=w.spawns[0].proc;
  const svc=w.boot(),page=ui(svc,{locale:'en'});await page.open();await page.select('run-f');await page.click('Retry with the pinned options');
  await page.click('Start with pinned options');const retry=w.records().find(r=>r.retryOf==='run-f');
  old.emit('close',1);old.emit('close',0);await tick(300);await page.click('Refresh');
  assert.equal(page.state(retry.id),'running');assert.equal(w.records().find(r=>r.id==='run-f').result,'error');assert.match(page.text(),/Running/);assert.match(page.text(),/not finished yet/);
  page.close_();
 }finally{w.close();}
});

test('Assistant source return reveals the current media without opening or selecting a production run',async()=>{
 const dom=new JSDOM('<dialog id="dubGeneratorDialog" open></dialog><h1 id="playerTitle">Episode</h1>',{runScripts:'outside-only'}),w=dom.window;let opened=0,selected=0,closed=0;
 const d=w.document.getElementById('dubGeneratorDialog');d.close=()=>{d.open=false;closed++;};w.UiLocale={get:()=> 'en'};w.BrowserDubAudioUI={context:()=>({visible:true,hasMedia:true,source:'media-A'})};w.DubGeneratorBridge={openPanel:async()=>opened++};w.DubRunsUI={focusRun:async()=>{selected++;return {ok:true};}};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-voice-runs.js'),'utf8'));
 try{const result=await w.AssistantVoiceRuns.open({run_id:'run-A',target:'source'});assert.equal(result.status,'completed');assert.equal(closed,1);assert.equal(opened,0);assert.equal(selected,0);await assert.rejects(w.AssistantVoiceRuns.open({run_id:'run-A',target:'source'},{stale:()=>true}),/changed/);}finally{w.close();}
});


test('loading a saved result exposes one busy action and allows retry after a refusal',async()=>{
 const w=world();try{
  const svc=w.boot();assert.equal((await svc.call('dub:start',w.request('load-once'))).ok,true);
  fs.writeFileSync(outputOf(w.spawns[0]),wav(2));w.spawns[0].proc.exitCode=0;w.spawns[0].proc.emit('close',0);await tick();
  const page=ui(svc,{loadable:true});try{
   await page.open();await page.click('Yenile');assert.equal(page.section.open,true,'heading refresh must not collapse the history');await page.select('load-once');let release,loads=0;
   page.w.DubGeneratorBridge.load=()=>{loads++;return new Promise(resolve=>release=resolve);};
   page.button('Bu bölüme yükle').click();await settle();
   const busy=page.button('Yükleniyor');assert(busy,'loading has a visible, specific action');assert.equal(busy.disabled,true);assert.equal(busy.getAttribute('aria-busy'),'true');busy.click();assert.equal(loads,1);
   release({ok:false,code:'busy'});await settle();assert.equal(page.button('Bu bölüme yükle').disabled,false,'a refused load remains retryable');
  }finally{page.close_();}
 }finally{w.close();}
});

test('a rejected saved-result load keeps the result, explains failure and can be retried',async()=>{
 const w=world();try{
  const svc=w.boot();assert.equal((await svc.call('dub:start',w.request('load-rejected'))).ok,true);fs.writeFileSync(outputOf(w.spawns[0]),wav(2));w.spawns[0].proc.exitCode=0;w.spawns[0].proc.emit('close',0);await tick();
  const page=ui(svc,{loadable:true});try{
   await page.open();await page.select('load-rejected');let attempts=0;page.w.DubGeneratorBridge.load=async()=>{attempts++;if(attempts===1)throw Error('Bridge closed');return {ok:true};};
   const unhandled=[];page.w.addEventListener('unhandledrejection',event=>{unhandled.push(event.reason);event.preventDefault();});
   page.button('Bu bölüme yükle').focus();await page.click('Bu bölüme yükle');assert.match(page.text(),/doğrulanamadı.*yeniden dene/is);assert.equal(page.button('Bu bölüme yükle').disabled,false);assert.equal(page.state('load-rejected'),'completed');
   assert.equal(page.doc.activeElement.closest('[data-run]')?.dataset.run,'load-rejected','status updates keep focus inside the selected run');
   await page.click('Bu bölüme yükle');assert.equal(attempts,2);assert.match(page.text(),/çalmaya başlamadı/);assert.equal(unhandled.length,0);
  }finally{page.close_();}
 }finally{w.close();}
});
