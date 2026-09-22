// Performans gauntlet'i — T5: 10k cue render + eşzamanlı çeviri altında UI
// takılması (longtask p95/p99), bellek ve dosya büyümesi. Gerçek Electron.
// Sağlayıcı: kontrollü soak-provider.test mock'u (ücretli sağlayıcı yok).
// node_modules/.bin/electron tests/electron-perf-gauntlet.smoke.js
// Çıktılar .uiprev/perf-gauntlet/ altında.
const {app,BrowserWindow,session}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.PERF_E2E_OUT||path.join(root,'.uiprev','perf-gauntlet'));
fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.resolve(process.env.PERF_E2E_PROFILE||path.join(out,'profile-'+process.pid));
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,{recursive:true});
fs.writeFileSync(path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,'settings.json'),JSON.stringify({
  settingsVersion:3,
  translate:{apiKey:'controlled-test-value',endpointPreset:'custom',customBaseUrl:'https://soak-provider.test/v1',model:'controlled'},
  ui:{translateWorkers:1},
}));
let providerCalls=0;
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://soak-provider.test/'))return realFetch(url,options);
  providerCalls++;
  const body=JSON.parse(options.body),payload=JSON.parse(body.messages.at(-1).content);
  const content=JSON.stringify({parts:payload.parts.map(()=> 'Kontrollü çeviri cümlesi.')});
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'content-type':'application/json'}});
};
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');
assert.equal(app.getPath('userData'),process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label,ms=20000)=>{const end=Date.now()+ms;let last;while(Date.now()<end){last=await fn();if(last)return last;await wait(150)}throw Error(label+' zaman aşımı: '+JSON.stringify(last));};
const dirSize=dir=>{let sum=0;const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else try{sum+=fs.statSync(p).size}catch(_){}}};walk(dir);return sum};
const procBytes=()=>app.getAppMetrics().reduce((sum,m)=>sum+(m.memory?.workingSetSize||0),0);
const report={checks:[],ok:true,metrics:{}};
const check=(name,ok,detail)=>{report.checks.push({name,ok:!!ok,detail:detail||''});if(!ok)report.ok=false;};
const pct=(arr,p)=>{if(!arr.length)return 0;const s=[...arr].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(p/100*s.length)-1)];};

app.whenReady().then(async()=>{
 try{
  const mediaHost='perf-e2e.test';
  session.fromPartition('persist:whisper-browser').protocol.handle('https',req=>{
    const url=new URL(req.url);
    if(url.hostname!==mediaHost)return new Response('yok',{status:404});
    return new Response('<!doctype html><meta charset=utf-8><title>Perf fixture</title><body>10k cue perf fixture</body>',{headers:{'Content-Type':'text/html'}});
  });
  const win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading()),'Pencere');
  const run=code=>win.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
  await run('await initialSettingsReady');
  win.setContentSize(1440,960);

  // Longtask gözlemcisi + rAF örnekleyici — tüm run boyunca toplanır.
  await run(`globalThis.__longtasks=[];globalThis.__rafDeltas=[];
    new PerformanceObserver(list=>{for(const e of list.getEntries())__longtasks.push(e.duration)}).observe({entryTypes:['longtask']});
    let last=performance.now();const pump=t=>{__rafDeltas.push(t-last);last=t;requestAnimationFrame(pump)};requestAnimationFrame(pump);`);

  const memBefore=procBytes();
  const filesBefore=dirSize(process.env.WHISPER_RESOURCE_SOAK_USER_DATA);

  // --- Aşama 1: tarayıcı alanı + çoklu sekme -----------------------------------
  await run(`openPlayer();setWorkspaceMode('browser',false);setBrowserCaptureEnabled(true,false)`);
  const shown=await run(`return await window.api.showBrowser('',browserSlotBounds())`);
  assert.equal(shown.ok,true);
  const tab1=shown.activeTabId;
  const t2=await run(`return await window.api.createBrowserTab()`);
  const t3=await run(`return await window.api.createBrowserTab()`);
  const tab2Id=t2&&t2.activeTabId;
  check('multi-tab',t2&&t2.ok===true&&t3&&t3.ok===true&&Array.isArray(t3.tabs)&&t3.tabs.length>=3,
    'sekme sayısı='+(t3&&t3.tabs?t3.tabs.length:'?'));
  await run(`return await window.api.activateBrowserTab(${JSON.stringify(tab1)})`);

  // --- Aşama 2: 10k cue render takılması ----------------------------------------
  const renderStats=await run(`
    __longtasks.length=0;
    const cues=Array.from({length:10000},(_,i)=>({id:'c'+i,start:i*2,end:i*2+1.6,text:'Ölçüm cümlesi '+i+' — Türkçe karakterler: şğüçöı.'}));
    player.cues=cues;player.cues2=cues.map(c=>({...c,text:'TR '+c.text}));
    const t0=performance.now();
    renderCueList('');
    const renderMs=performance.now()-t0;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {renderMs,longtasks:[...__longtasks],nodes:document.querySelectorAll('.cue-card').length,cueLen:player.cues.length};
  `);
  report.metrics.render10k={renderMs:Math.round(renderStats.renderMs),
    longtaskCount:renderStats.longtasks.length,
    longtaskP95:Math.round(pct(renderStats.longtasks,95)),
    longtaskMax:Math.round(Math.max(0,...renderStats.longtasks)),
    renderedNodes:renderStats.nodes,cueLen:renderStats.cueLen};
  check('render-10k',renderStats.renderMs<8000,`render=${Math.round(renderStats.renderMs)}ms p95LT=${Math.round(pct(renderStats.longtasks,95))}ms nodes=${renderStats.nodes}`);

  // --- Aşama 3: eşzamanlı çeviri altında UI duyarlılığı --------------------------
  {
    const started=await run(`
      __longtasks.length=0;__rafDeltas.length=0;
      return await window.api.startBrowserTranslation(player.browserActiveTabId,{
        trackId:'perf-track',targetLanguage:'tr',completeTrack:true,
        cues:Array.from({length:10000},(_,i)=>({id:'tc'+i,start:i*2,end:i*2+1.6,text:'Sentence number '+i+' for the perf run.'}))});
    `);
    assert.equal(started.ok,true,JSON.stringify(started).slice(0,300));
    report.metrics.translationStart={sentenceCount:started.sentenceCount||0};

    // Çeviri sürerken UI yükü: sekme geçişleri + render döngüsü ölç.
    const phases=[];
    for(let i=0;i<6;i++){
      await run(`renderCueList('')`);
      if(tab2Id&&i===2)await run(`return await window.api.activateBrowserTab(${JSON.stringify(tab2Id)})`).catch(()=>{});
      if(tab2Id&&i===4)await run(`return await window.api.activateBrowserTab(${JSON.stringify(tab1)})`).catch(()=>{});
      phases.push(await run(`return {lt:[...__longtasks],raf:[...__rafDeltas.slice(-60)]}`));
      await wait(900);
    }
    const ltAll=phases.flatMap(p=>p.lt);
    const rafAll=phases.flatMap(p=>p.raf).filter(d=>d>0&&d<2000);
    report.metrics.translationUi={
      longtaskCount:ltAll.length,longtaskP95:Math.round(pct(ltAll,95)),
      longtaskP99:Math.round(pct(ltAll,99)),longtaskMax:Math.round(Math.max(0,...ltAll)),
      rafP95:Math.round(pct(rafAll,95)),rafP99:Math.round(pct(rafAll,99)),
    };
    // Çeviri işi ilerliyor mu — sağlayıcı çağrısı ve/veya sonuç birikimi.
    const progress=await run(`return {calls:undefined,results:(browserTabState()?.translationJob?.liveTranslation?.size)||0}`);
    report.metrics.translationUi.providerCalls=providerCalls;
    report.metrics.translationUi.liveResults=progress.results;
    check('translation-progresses',providerCalls>0||progress.results>0,`providerCalls=${providerCalls} results=${progress.results}`);
    check('no-runaway-jank',Math.max(0,...ltAll)<3000,`max longtask=${Math.round(Math.max(0,...ltAll))}ms`);
  }

  // --- Aşama 4: bellek ve dosya büyümesi -----------------------------------------
  const memAfter=procBytes();
  const filesAfter=dirSize(process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
  report.metrics.memory={beforeKiB:memBefore,afterKiB:memAfter,deltaKiB:memAfter-memBefore};
  report.metrics.files={beforeBytes:filesBefore,afterBytes:filesAfter,deltaBytes:filesAfter-filesBefore};
  check('memory-sane',memAfter-memBefore<500*1024,`Δ=${Math.round((memAfter-memBefore)/1024)}MB`);
  check('files-sane',filesAfter-filesBefore<200*1024*1024,`Δ=${Math.round((filesAfter-filesBefore)/1024)}KB`);

  await win.webContents.capturePage().then(img=>fs.writeFileSync(path.join(out,'perf-gauntlet.png'),img.toPNG()));
  fs.writeFileSync(path.join(out,'perf-gauntlet-report.json'),JSON.stringify(report,null,2));
  console.log('PERF-GAUNTLET '+(report.ok?'PASS':'FAIL'));
  console.log(JSON.stringify(report.metrics,null,2));
  for(const c of report.checks)console.log(` ${c.ok?'✓':'✗'} ${c.name}${c.detail?' — '+c.detail:''}`);
  app.exit(report.ok?0:1);
 }catch(error){
  report.ok=false;report.fatal=String(error&&error.stack||error);
  fs.writeFileSync(path.join(out,'perf-gauntlet-report.json'),JSON.stringify(report,null,2));
  console.error('PERF-GAUNTLET FATAL',error);
  app.exit(1);
 }
});
setTimeout(()=>{console.error('PERF-GAUNTLET watchdog timeout');try{fs.writeFileSync(path.join(out,'perf-gauntlet-report.json'),JSON.stringify({ok:false,fatal:'watchdog 300s'},null,2));}catch(_){}app.exit(1);},300000);
