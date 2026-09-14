'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.setPath('userData', path.resolve(__dirname, '../.uiprev/feature-lifecycle', `profile-${Date.now()}-${process.pid}`));
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(`
    document.body.innerHTML = '<button id="mediaCatalogOpen">Arşiv</button><dialog id="mediaCatalogDialog"><div id="mediaCatalogRoot"></div></dialog>';
    window.fixtureItems = [
      {id:'film',kind:'film',title:'Film',watchStatus:'planned',episodes:[]},
      ...['A','B'].map(id=>({id,kind:'series',title:id,watchStatus:'unspecified',episodes:[{id:'s1e1',season:1,number:1,title:'Bölüm',watchStatus:'planned'}]}))
    ];
    window.saveCalls=0;window.canceledTokens=[];
    window.api={mediaCatalog:async request=>{
      if(request.action==='list') {
        if(window.deferList) { window.deferList=false; return new Promise(resolve=>{window.releaseList=resolve}); }
        return {ok:true,items:fixtureItems};
      }
      if(request.action==='import-preview') return new Promise(resolve=>{window.releasePreview=resolve});
      if(request.action==='import-cancel') window.canceledTokens.push(request.token);
      if(request.action==='save') window.saveCalls++;
      return {ok:true,watchItem:{key:'fixture'}};
    }};
    window.openMediaCatalogPlayback=()=>new Promise(resolve=>{window.releasePlayback=resolve});
    void 0;
  `);
  await win.webContents.executeJavaScript(fs.readFileSync(path.resolve(__dirname, '../src/renderer/media-catalog.js'), 'utf8'));
  await win.webContents.executeJavaScript(`(async()=>{
    const assert=(value,message)=>{if(!value)throw Error(message)};
    const tick=()=>new Promise(r=>setTimeout(r,0));
    const click=text=>{const b=[...document.querySelectorAll('#mediaCatalogRoot button')].find(b=>b.textContent.trim()===text);assert(b&&!b.disabled,'Düğme kullanılamıyor: '+text);b.click()};
    const open=async()=>{document.getElementById('mediaCatalogOpen').click();await tick()};
    const close=async()=>{const d=document.getElementById('mediaCatalogDialog');const closed=new Promise(r=>d.addEventListener('close',r,{once:true}));d.close();await closed};
    const card=id=>document.querySelector('.mc-card[aria-label="'+id+' ayrıntılarını aç"]').click();
    await open();
    card('Film');
    document.querySelector('[data-source-url]').value='https://example.test/video';
    window.deferList=true;click('Adresi bağla');await tick();
    assert(typeof window.releaseList==='function','Kaynak sonrası liste beklemiyor');
    await close();await open();
    window.releaseList({ok:true,items:fixtureItems});await tick();
    assert(!!document.getElementById('mcGrid')&&!document.querySelector('.mc-detail'),'Eski kayıt işlemi yeni oturumu değiştirdi');
    card('Film');click('Oynat');await tick();
    assert(typeof window.releasePlayback==='function','Oynatma beklemiyor');
    await close();await open();window.releasePlayback();await tick();
    assert(document.getElementById('mediaCatalogDialog').open,'Eski oynatma yeni kataloğu kapattı');
    click('İzlenecekler');
    const filter=document.querySelector('select[aria-label="İzleme durumuna göre filtrele"]');
    filter.value='planned';filter.dispatchEvent(new Event('change'));
    assert(document.querySelectorAll('.mc-card').length===3,'Bölümü izlenecek olan dizi filtrede kayboldu');
    card('A');document.querySelector('.mc-episode-actions button:nth-child(2)').click();
    click('Bölümü sil');click('← Diziye dön');click('← Kataloğa dön');
    card('B');document.querySelector('.mc-episode-actions button:nth-child(2)').click();click('Bölümü sil');await tick();
    assert(window.saveCalls===0,'Başka dizinin bölüm silme onayı taşındı');
    await close();await open();
    click('Eski arşivi içe aktar');await tick();await close();await open();
    window.releasePreview({ok:true,token:'old-preview',items:[]});await tick();
    assert(window.canceledTokens.includes('old-preview'),'Kapanan oturumun geç önizleme tokenı bırakıldı');
    assert(!document.querySelector('.mc-import'),'Geç önizleme yeni oturumu değiştirdi');
    await close();
  })()`);
  await win.webContents.executeJavaScript(`
    document.body.innerHTML='<div id="browserVideoAnalysisTools"></div>'+['bvaCues','bvaIntroResults','bvaOcrStatus','bvaIntroStatus'].map(id=>'<div id="'+id+'"></div>').join('')+['bvaSaveSrt','bvaRunOcr','bvaDetectIntro','bvaSetStart','bvaSetEnd'].map(id=>'<button id="'+id+'"></button>').join('');
    window.analysisContext={tabId:1,generation:1,mediaId:'old'};window.skipSaves=0;window.seeks=0;
    window.browserCommand=async()=>{window.seeks++};
    window.BrowserAnalysisTools={context:()=>window.analysisContext,request:async action=>{
      if(action==='skip-save')window.skipSaves++;
      return {ok:true,candidates:[{start:5,end:20,score:0.9}]};
    }};
    void 0;
  `);
  await win.webContents.executeJavaScript(fs.readFileSync(path.resolve(__dirname, '../src/renderer/browser-video-analysis.js'), 'utf8'));
  await win.webContents.executeJavaScript(`(async()=>{
    document.getElementById('bvaDetectIntro').click();
    await new Promise(r=>setTimeout(r,0));
    const buttons=[...document.querySelectorAll('.bva-intro-result button')];
    if(buttons.length!==2)throw Error('Jenerik önerisi yok');
    window.analysisContext={tabId:1,generation:2,mediaId:'new'};
    buttons.forEach(b=>b.click());
    await new Promise(r=>setTimeout(r,0));
    if(window.skipSaves||window.seeks)throw Error('Eski jenerik önerisi yeni videoya uygulandı');
  })()`);
  console.log('feature-lifecycle: stale reload/playback, episode confirmation/filter and intro context passed');
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
