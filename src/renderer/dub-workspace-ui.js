(() => {
  'use strict';
  const el=id=>document.getElementById(id), Model=window.DubWorkspaceModel;
  const t=text=>window.UiLocale?.t(text)||text;
  let output=null,layers={},mix=Model.mix(),selected=null,busy=false,lastPath='',context=null,limit=null;
  const voice=el('dubGeneratedPreview');
  const layerAudio={background:el('dubMixBackgroundAudio'),music:el('dubMixMusicAudio'),ambience:el('dubMixAmbienceAudio')};
  const controls={voice:'dubMixVoice',background:'dubMixBackground',music:'dubMixMusic',ambience:'dubMixAmbience',duckAmount:'dubMixDuckAmount'};
  let generationBusy=false;
  let rows=[],mixPlaying=false,previewTimer=null;
  const note=text=>{el('dubWorkspaceStatus').textContent=t(text);};
  function stop(){mixPlaying=false;limit=null;clearInterval(previewTimer);previewTimer=null;voice.pause();for(const a of Object.values(layerAudio))a.pause();}
  function readMix(){for(const [key,id] of Object.entries(controls))mix[key]=Number(el(id).value);mix.duck=el('dubMixDuck').checked;mix=Model.mix(mix);return mix;}
  function showMix(){for(const [key,id] of Object.entries(controls))el(id).value=String(mix[key]);el('dubMixDuck').checked=mix.duck;}
  function buttons(){
    for(const id of ['dubProjectOpen','dubProjectVideoOpen','dubProjectVideo','dubMusicChoose','dubAmbienceChoose','dubLayersReset','dubExportKind'])el(id).disabled=busy||generationBusy;
    for(const id of ['dubProjectSave','dubWorkspaceExport','dubMixPreview'])el(id).disabled=busy||generationBusy||!output;
    el('dubTimelineListen').disabled=busy||!selected;el('dubTimelineVideo').disabled=busy||!selected;
    el('dubWorkspaceCancel').disabled=!busy;
    el('dubWorkspaceProgress').classList.toggle('hidden',!busy);
    window.dispatchEvent(new CustomEvent('dub-workspace:busy',{detail:busy}));
  }
  function label(row){return t(row.status==='failed'?'Üretilemedi; bu bölüm sessiz':row.status==='review'?'Dinleyerek kontrol edin':'Hazır');}
  function choose(row,seek=false){
    selected=row;
    for(const button of el('dubTimeline').children)button.setAttribute('aria-pressed',String(button.dataset.key===row.key));
    el('dubTimelineInfo').textContent=`${row.sourceStart.toFixed(2)}–${row.sourceEnd.toFixed(2)} s · ${label(row)} · ${row.stretch.toFixed(2)}×\n${row.text}`;
    const select=el('dubQualityGroup');if([...select.options].some(o=>o.value===row.key)){select.value=row.key;select.dispatchEvent(new Event('change'));}
    if(seek)void window.BrowserDubAudioUI?.seekSource(row.sourceStart,context).then(ok=>{if(!ok)note('Video değişti; önce doğru videoyu açın.');});
    buttons();
  }
  function timeline(){
    const host=el('dubTimeline');host.replaceChildren();
    const visible=rows.filter(row=>el('dubTimelineFilter').value!=='review'||row.status!=='ready');
    for(const row of visible){
      const button=document.createElement('button');button.type='button';button.className='dub-timeline-block';button.dataset.status=row.status;button.dataset.key=row.key;
      button.setAttribute('aria-pressed',String(selected?.key===row.key));
      const time=document.createElement('strong');time.textContent=`${Math.floor(row.sourceStart/60)}:${String(Math.floor(row.sourceStart%60)).padStart(2,'0')} · ${label(row)}`;
      const text=document.createElement('span');text.textContent=row.text;button.append(time,text);
      button.addEventListener('click',()=>choose(row,true));host.append(button);
    }
    if(!rows.length)el('dubTimelineInfo').textContent=t('Bu eski çıktıda cümle zamanları yok. Yeni üretimde zaman çizelgesi oluşur.');
  }
  function setOutput(value,expected){
    stop();output=value;selected=null;context=expected||window.BrowserDubAudioUI?.context();layers=value?.layers||{};mix=Model.mix(value?.mix);showMix();
    try{rows=Model.groups(value?.quality?.groups||value?.rows||[]);}catch(_){rows=[];}
    if(value?.url)voice.src=value.url;
    for(const [key,a] of Object.entries(layerAudio)){const f=key==='background'?value?.background:layers[key];if(f?.url)a.src=f.url;else a.removeAttribute('src');a.load();}
    el('dubProjectVideoOpen').classList.toggle('hidden',!value?.video);el('dubProjectVideo').checked=!!value?.video;
    layerNames();timeline();buttons();if(rows.length)choose(rows[0]);
  }
  function layerNames(){el('dubLayerNames').textContent=Object.entries(layers).filter(([,v])=>v).map(([k,v])=>`${t(k==='music'?'Müzik':'Ortam')}: ${v.name||''}`).join(' · ');}
  function attachment(value){return {mix:readMix(),layers,rows:value?.quality?.groups||value?.rows||[]};}
  async function action(fn,working){
    if(busy||generationBusy)return;busy=true;stop();buttons();note(working);el('dubWorkspaceProgress').removeAttribute('value');
    try{const r=await fn();if(r?.cancelled){note('İşlem iptal edildi.');return;}if(!r?.ok)throw new Error(r?.error||t('İşlem başarısız.'));
      if(r.output){setOutput(r.output);window.dispatchEvent(new CustomEvent('dub-workspace:loaded',{detail:r.output}));note('Dublaj projesi açıldı. Videoyu kontrol edip Sesi kullan düğmesine basın.');}
      else {lastPath=r.path;el('dubWorkspaceReveal').classList.remove('hidden');note('Kaydedildi.');}
    }catch(e){el('dubWorkspaceStatus').textContent=`${t('İşlem başarısız.')}: ${t(e.message)}`;}
    finally{busy=false;buttons();}
  }
  el('dubProjectOpen').addEventListener('click',()=>action(()=>window.api.openDubProject(),'Proje açılıyor…'));
  el('dubProjectVideoOpen').addEventListener('click',()=>{if(!output?.video||busy)return;stop();window.BrowserDubAudioUI?.openProjectVideo(output.video.path,output.subtitle);context=window.BrowserDubAudioUI?.context();el('dubGeneratorDialog').close();});
  el('dubProjectSave').addEventListener('click',()=>{if(output)void action(()=>window.api.saveDubProject({path:output.path,mix:readMix(),layers,includeVideo:el('dubProjectVideo').checked}),'Proje kaydediliyor…');});
  el('dubWorkspaceExport').addEventListener('click',()=>{if(output)void action(()=>window.api.exportDubWorkspace({path:output.path,mix:readMix(),layers,kind:el('dubExportKind').value}),'Dışa aktarılıyor…');});
  el('dubWorkspaceCancel').addEventListener('click',async()=>{el('dubWorkspaceCancel').disabled=true;const r=await window.api.cancelDubWorkspace().catch(()=>null);note(r?.ok?'Durduruluyor…':'İptal doğrulanamadı; işlem izlenmeye devam ediyor.');if(!r?.ok)el('dubWorkspaceCancel').disabled=false;});
  el('dubWorkspaceReveal').addEventListener('click',()=>{if(lastPath)void window.api.openPath(lastPath);});
  el('dubTimelineFilter').addEventListener('change',timeline);
  el('dubTimelineVideo').addEventListener('click',async()=>{if(selected && await window.BrowserDubAudioUI?.seekSource(selected.sourceStart,context))el('dubGeneratorDialog').close();else note('Video değişti; önce doğru videoyu açın.');});
  el('dubTimelineListen').addEventListener('click',()=>{if(!selected)return;stop();voice.currentTime=selected.audioStart;limit=selected.audioEnd;void voice.play().catch(()=>note('Ses başlatılamadı.'));});
  async function chooseLayer(kind){
    if(busy||generationBusy)return;busy=true;buttons();
    try{const chosen=await window.api.selectVideo();if(!Array.isArray(chosen)||!chosen[0])return;
      const r=await window.api.dubWorkspaceAsset(chosen[0]);if(!r?.ok)throw new Error(r?.error||'Invalid audio.');
      stop();layers={...layers,[kind]:r.asset};layerAudio[kind].src=r.asset.url;layerAudio[kind].load();layerNames();window.BrowserDubAudioUI?.setMix(readMix(),layers,output?.url);
    }catch(e){note(e.message);}finally{busy=false;buttons();}
  }
  for(const kind of ['music','ambience'])el(kind==='music'?'dubMusicChoose':'dubAmbienceChoose').addEventListener('click',()=>chooseLayer(kind));
  el('dubLayersReset').addEventListener('click',()=>{stop();layers={};for(const kind of ['music','ambience']){layerAudio[kind].removeAttribute('src');layerAudio[kind].load();}layerNames();window.BrowserDubAudioUI?.setMix(readMix(),layers,output?.url);});
  function sourceAt(time){
    if(!output?.sync)return {time,factor:1};
    let a=0,b=output.sync.videoDuration;
    for(let i=0;i<36;i++){const mid=(a+b)/2;if(window.DubSyncMap.at(output.sync,mid).time<time)a=mid;else b=mid;}
    const local=(a+b)/2;return {time:local,factor:window.DubSyncMap.at(output.sync,local).factor};
  }
  function syncPreview(){
    const value=readMix();voice.volume=value.voice;
    if(limit!==null && voice.currentTime>=limit){stop();return;}
    if(!mixPlaying || voice.paused)return;
    const source=sourceAt(voice.currentTime),duck=value.duck?1-(1-value.duckAmount)*Model.duckAt(rows,voice.currentTime):1;
    for(const [key,a] of Object.entries(layerAudio)){
      a.volume=value[key]*duck;if(!a.getAttribute('src') || a.readyState<1)continue;
      a.playbackRate=Math.max(.0625,Math.min(16,voice.playbackRate/source.factor));
      if(Math.abs(a.currentTime-source.time)>.15)a.currentTime=source.time;
      if(a.paused && source.time<a.duration)void a.play().catch(()=>{stop();note('Arka plan sesi başlatılamadı.');});
    }
  }
  for(const id of [...Object.values(controls),'dubMixDuck'])el(id).addEventListener('input',()=>{syncPreview();window.BrowserDubAudioUI?.setMix(readMix(),layers,output?.url);});
  el('dubMixPreview').addEventListener('click',()=>{if(!output)return;stop();window.BrowserDubAudioUI?.stop();voice.currentTime=selected?.audioStart||0;mixPlaying=true;void voice.play().catch(()=>{stop();note('Ses başlatılamadı.');});});
  el('dubMixStop').addEventListener('click',stop);
  voice.addEventListener('play',()=>{void window.BrowserDubAudioUI?.pauseSource?.(context);window.BrowserDubAudioUI?.stop();clearInterval(previewTimer);previewTimer=setInterval(syncPreview,80);syncPreview();});
  voice.addEventListener('pause',()=>{clearInterval(previewTimer);previewTimer=null;for(const a of Object.values(layerAudio))a.pause();});
  voice.addEventListener('seeking',syncPreview);voice.addEventListener('ended',stop);
  el('dubGeneratorDialog').addEventListener('close',stop);
  window.addEventListener('beforeunload',stop);
  document.addEventListener('ui-locale-change',()=>{timeline();if(selected)choose(selected);});
  window.addEventListener('dub-audio:attached',event=>{if(output?.url===event.detail?.url)context=event.detail.context;});
  window.addEventListener('dub-mix:changed',event=>{if(output?.url===event.detail?.url){mix=Model.mix(event.detail.mix);showMix();}});
  window.addEventListener('dub-generator:busy',event=>{if(generationBusy===!!event.detail)return;generationBusy=!!event.detail;buttons();});
  window.DubWorkspaceUI={setOutput,attachment};buttons();
})();
