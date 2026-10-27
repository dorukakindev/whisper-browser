(() => {
  'use strict';
  const t = (en,tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
  const node = (tag,cls,text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const clock = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  let instance;
  async function api(action,payload={}) {
    const result=await window.api.musicAnalysis({action,...payload});
    if(!result?.ok){const parts=String(result?.error||'').split(' / ');throw Error(parts.length>1?t(parts[0],parts.slice(1).join(' / ')):parts[0]||t('Audio analysis failed.','Ses analizi başarısız.'));}
    return result;
  }
  function open(libraryId) {
    if(instance){instance.dialog.focus();return;}
    const dialog=node('dialog','music-lab media-surface');dialog.dataset.uiUntranslated='';
    const state={dialog,source:null,result:null,busy:false,jobId:null,closed:false,mode:'analyze',modelReady:false};instance=state;
    const button=(label,callback,cls='ml-button')=>{const b=node('button',cls,label);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(callback).catch(error=>{if(error.name!=='AbortError')message(error.message,true);}));return b;};
    const header=node('header','ml-header'),heading=node('div');
    const h=node('h1','',t('Listen closer','Sesi yakından tanı'));h.id='musicLabTitle';dialog.setAttribute('aria-labelledby',h.id);
    heading.append(h,node('p','',t('Explore the sound behind your music.','Müziğinin ses karakterini keşfet.')));
    const close=button('×',()=>{dialog.close();cleanup();},'ml-close');close.setAttribute('aria-label',t('Close analysis','Analizi kapat'));header.append(heading,close);
    const content=node('div','ml-content'),sourcePanel=node('section','ml-source');
    const sourceMark=node('div','ml-source-mark');sourceMark.setAttribute('aria-hidden','true');
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 32 32');icon.setAttribute('width','32');icon.setAttribute('height','32');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.8');
    const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d','M4 13v6m6-12v18m6-23v28m6-23v18m6-12v6');icon.append(line);sourceMark.append(icon);
    const sourceText=node('div','ml-source-copy'),sourceTitle=node('h2','',t('Choose your reference','Referansını seç'));
    const sourceDetail=node('p','',t('Open a track or choose Analyze in your music library.','Bir parça aç veya müzik arşivindeki Analiz et düğmesini kullan.'));
    sourceText.append(sourceTitle,sourceDetail);
    const choose=button(t('Choose audio','Ses dosyası seç'),()=>select('select'));
    sourcePanel.append(sourceMark,sourceText,choose);
    const controls=node('div','ml-controls'),rangeTitle=node('span','',t('Analysis range','Analiz aralığı'));
    const start=node('input'),end=node('input');
    for(const [input,label] of [[start,t('Start in seconds','Başlangıç, saniye')],[end,t('End in seconds','Bitiş, saniye')]]){input.type='number';input.min='0';input.step='.1';input.setAttribute('aria-label',label);}
    start.value='0';end.placeholder=t('Full track','Tüm parça');
    const run=button(t('Analyze sound','Sesi analiz et'),analyze,'ml-button ml-primary');run.disabled=true;
    const cancel=button(t('Cancel','Durdur'),()=>api('cancel'));cancel.hidden=true;
    controls.append(rangeTitle,start,node('span','','—'),end,node('span','ml-unit',t('seconds','saniye')),run,cancel);
    const status=node('p','ml-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const stages=node('div','ml-stages');stages.hidden=true;
    const steps=[['probe',t('Read source','Kaynağı oku')],['fingerprint',t('Check cache','Kaydı kontrol et')],['decode',t('Prepare audio','Sesi hazırla')],['measure',t('Measure sound','Sesi ölç')]];
    for(const [key,label] of steps){const item=node('span','',label);item.dataset.stage=key;stages.append(item);}
    const audio=node('audio','ml-audio');audio.controls=true;audio.preload='metadata';audio.hidden=true;
    const results=node('div','ml-results');
    const empty=node('div','ml-empty');empty.append(node('div','ml-empty-lines'),node('h2','',t('Every track has a shape','Her parçanın bir ses izi var')),node('p','',t('See its waveform, dynamics and frequency balance. Select a passage to look closer.','Dalga formunu, ses dinamiklerini ve frekans dengesini gör. Bir bölümü seçip yakından incele.')));results.append(empty);
    const tabs=node('div','ml-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',t('Music workspace','Müzik çalışma alanı'));
    const overviewTab=button(t('Sound analysis','Ses analizi'),()=>tab(false),'ml-tab'),similarTab=button(t('Similar in my library','Arşivimde benzerleri'),()=>tab(true),'ml-tab');
    for(const [b,id,panel] of [[overviewTab,'mlOverviewTab','mlOverview'],[similarTab,'mlSimilarTab','mlSimilar']]){b.id=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel);}
    const onlineTab=button(t('On the internet','İnternette'),()=>tab(false,true),'ml-tab');onlineTab.setAttribute('role','tab');onlineTab.id='mlOnlineTab';onlineTab.setAttribute('aria-controls','mlOnline');tabs.append(overviewTab,similarTab,onlineTab);results.id='mlOverview';results.setAttribute('role','tabpanel');results.setAttribute('aria-labelledby','mlOverviewTab');
    const similar=node('section','ml-similar');similar.id='mlSimilar';similar.setAttribute('role','tabpanel');similar.setAttribute('aria-labelledby','mlSimilarTab');similar.hidden=true;
    const searchHead=node('div','ml-search-heading'),searchCopy=node('div');searchCopy.append(node('h2','',t('Find the sound you came for','Aradığın sesi bul')),node('p','',t('Compare real audio excerpts from the tracks in your music library.','Müzik arşivindeki parçaların gerçek ses kesitlerini karşılaştır.')));
    const find=button(t('Find similar tracks','Benzer parçaları bul'),()=>launch('search'),'ml-button ml-primary');find.disabled=true;searchHead.append(searchCopy,find);
    const modelRow=node('div','ml-model-row'),modelLabel=node('span','',t('Checking audio model…','Ses modeli kontrol ediliyor…'));
    const prepare=button(t('Prepare CLAP · 615 MB','CLAP hazırla · 615 MB'),()=>launch('prepare'));prepare.hidden=true;modelRow.append(modelLabel,prepare);
    const excludeLabel=node('label','ml-exclude'),exclude=node('input');exclude.type='checkbox';exclude.disabled=true;excludeLabel.append(exclude,document.createTextNode(t('Exclude the same artist','Aynı sanatçıyı dışla')));
    const hits=node('div','ml-hits');hits.append(node('p','ml-search-empty',t('Add tracks to Music, choose a reference, then search. No audio is uploaded.','Müzik bölümüne parçalar ekle, referans seç ve ara. Sesler internete yüklenmez.')));
    const compare=node('section','ml-compare');compare.hidden=true;const compareName=node('strong'),compareAudio=node('audio');compareAudio.controls=true;compareAudio.preload='metadata';
    const matchLevel=node('input');matchLevel.type='checkbox';matchLevel.checked=true;const matchLabel=node('label');matchLabel.append(matchLevel,document.createTextNode(t('Match listening levels','Dinleme seviyelerini eşleştir')));
    let comparison=null,compareToken=0,previewA=false;
    function volumes(){audio.volume=1;compareAudio.volume=1;if(comparison&&matchLevel.checked){const level=Math.min(comparison.referenceDb,comparison.matchedDb);audio.volume=Math.min(1,10**((level-comparison.referenceDb)/20));compareAudio.volume=Math.min(1,10**((level-comparison.matchedDb)/20));}}
    const playA=button(t('A · Reference','A · Referans'),async()=>{if(!comparison)return;compareAudio.pause();volumes();audio.currentTime=comparison.referenceRange[0];previewA=true;await audio.play();});
    const playB=button(t('B · Match','B · Eşleşme'),async()=>{if(!comparison)return;audio.pause();volumes();compareAudio.currentTime=comparison.matchedRange[0];await compareAudio.play();});
    compare.append(compareName,playA,playB,matchLabel,compareAudio);matchLevel.addEventListener('change',volumes);
    compareAudio.addEventListener('play',()=>{audio.pause();document.getElementById('mediaShelfAudio')?.pause();document.getElementById('playerVideo')?.pause();});
    compareAudio.addEventListener('timeupdate',()=>{if(comparison&&compareAudio.currentTime>=comparison.matchedRange[1])compareAudio.pause();});
    compareAudio.addEventListener('error',()=>message(t('This matched file can no longer be played. Search again.','Eşleşen dosya artık oynatılamıyor. Yeniden ara.'),true));
    similar.append(searchHead,modelRow,excludeLabel,compare,hits);
    const onlinePanel=node('section','ml-online');onlinePanel.id='mlOnline';onlinePanel.setAttribute('role','tabpanel');onlinePanel.setAttribute('aria-labelledby','mlOnlineTab');onlinePanel.hidden=true;window.MusicOnlineUI.mount(onlinePanel);
    content.append(sourcePanel,controls,status,stages,audio,tabs,results,similar,onlinePanel);dialog.append(header,content);document.body.append(dialog);
    let pollTimer,observer,animation;
    const charts=[];
    function message(text,error=false){if(state.closed)return;status.textContent=text;status.classList.toggle('ml-error',error);}
    function busy(value){state.busy=value;dialog.setAttribute('aria-busy',String(value));choose.disabled=value;run.disabled=value||!state.source;find.disabled=value||!state.source||!state.modelReady;prepare.disabled=value;exclude.disabled=value||!state.source?.artist;start.disabled=value;end.disabled=value;cancel.hidden=!value;stages.hidden=!value;}
    function tab(isSimilar,internet=false){results.hidden=isSimilar||internet;similar.hidden=!isSimilar||internet;onlinePanel.hidden=!internet;for(const [b,selected] of [[overviewTab,!isSimilar&&!internet],[similarTab,isSimilar&&!internet],[onlineTab,internet]]){b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}repaint();}
    tabs.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const buttons=[overviewTab,similarTab,onlineTab],index=buttons.indexOf(document.activeElement),next=(index+(event.key==='ArrowRight'?1:2))%3;tab(next===1,next===2);buttons[next].focus();}});
    async function refreshModel(){const model=await api('model');if(state.closed)return;state.modelReady=model.ready&&model.runtimeReady;prepare.hidden=model.ready;modelLabel.textContent=!model.runtimeReady?t('Run install-music.bat to prepare the separate CPU environment.','Ayrı CPU ortamını hazırlamak için install-music.bat çalıştır.'):model.ready?t('CLAP ready · local CPU · six excerpts per track','CLAP hazır · yerel CPU · parça başına altı kesit'):t('One-time model download required. Your audio stays local.','Bir defalık model indirmesi gerekiyor. Sesin bilgisayarda kalır.');busy(state.busy);}
    function showHits(result){
      hits.replaceChildren();const summary=node('p','ml-hit-summary',t(`${result.indexed} tracks indexed · ${result.cached} reused · ${result.failed} unavailable`,`${result.indexed} parça indekslendi · ${result.cached} kayıt kullanıldı · ${result.failed} kullanılamadı`));hits.append(summary);
      const explanation=node('p','ml-search-explanation',t('CLAP audio similarity, not a probability or a rating. Long tracks are sampled at up to six 10-second passages.','CLAP ses benzerliğidir; olasılık veya beğeni puanı değildir. Uzun parçalarda en fazla altı 10 saniyelik bölüm örneklenir.'));hits.append(explanation);
      if(!result.results.length){hits.append(node('p','ml-search-empty',t('No comparable tracks. Add different tracks; exact copies of the reference are excluded.','Karşılaştırılabilir parça yok. Farklı parçalar ekle; referansın birebir kopyaları dışlanır.')));return;}
      result.results.forEach((hit,index)=>{
        const row=node('article','ml-hit'),number=node('span','ml-hit-number',String(index+1).padStart(2,'0')),copy=node('div','ml-hit-copy');copy.append(node('h3','',hit.title),node('p','',hit.artist||t('Unknown artist','Sanatçı bilinmiyor')),node('small','',t(`Audio compared · ${hit.samples} excerpts · match ${clock(hit.matchedRange[0])}–${clock(hit.matchedRange[1])}`,`Ses karşılaştırıldı · ${hit.samples} kesit · eşleşme ${clock(hit.matchedRange[0])}–${clock(hit.matchedRange[1])}`)));
        const score=node('div','ml-hit-score');score.append(node('strong','',hit.score.toFixed(3)),node('small','',t('similarity','benzerlik')));
        const listen=button(t('Compare A/B','A/B karşılaştır'),async()=>{const token=++compareToken;comparison=hit;audio.pause();compareAudio.pause();compareAudio.src=hit.url;compare.hidden=false;compareName.textContent=hit.title;volumes();await new Promise((resolve,reject)=>{const ready=()=>{clearTimeout(timeout);resolve();};const timeout=setTimeout(()=>reject(Error(t('Audio loading timed out.','Ses yükleme zaman aşımı.'))),10000);compareAudio.addEventListener('loadedmetadata',ready,{once:true});});if(token!==compareToken||state.closed)return;compareAudio.currentTime=hit.matchedRange[0];await compareAudio.play();compare.scrollIntoView({block:'nearest',behavior:'instant'});});
        row.append(number,copy,score,listen);hits.append(row);
      });
    }
    async function select(action,payload={}){
      const response=await api(action,payload);if(state.closed||response.canceled)return;
      state.source=response.source;onlinePanel.dispatchEvent(new CustomEvent('music-reference',{detail:response.source}));state.result=null;sourceTitle.textContent=response.source.title;sourceDetail.textContent=t('Local audio · measurements stay on this computer','Yerel ses · ölçümler bu bilgisayarda kalır');
      comparison=null;++compareToken;compareAudio.pause();compare.hidden=true;audio.volume=1;find.disabled=!state.modelReady;exclude.disabled=!response.source.artist;hits.replaceChildren(node('p','ml-search-empty',t('Reference changed. Search again for fresh matches.','Referans değişti. Güncel eşleşmeler için yeniden ara.')));
      audio.pause();audio.hidden=false;audio.src=response.source.url;start.value='0';end.value='';run.disabled=false;results.replaceChildren(empty);charts.length=0;
      message(t('Ready. Select a range or analyze the full track (up to 30 minutes).','Hazır. Aralık seç veya parçanın tamamını analiz et (en fazla 30 dakika).'));
    }
    async function analyze(){return launch('analyze');}
    async function launch(mode){
      if(state.busy||(!state.source&&mode!=='prepare'))return;
      const from=Number(start.value),to=end.value.trim()?Number(end.value):undefined;
      if(mode!=='prepare'&&(!Number.isFinite(from)||from<0||(to!==undefined&&(!Number.isFinite(to)||to-from<1||to-from>1800))))throw Error(t('Select a valid range of 1 second to 30 minutes.','1 saniye–30 dakika arasında geçerli bir aralık seç.'));
      state.mode=mode;busy(true);message(mode==='prepare'?t('Downloading the official audio model…','Resmî ses modeli indiriliyor…'):t('Reading audio…','Ses okunuyor…'));
      try{const range=to!==undefined?[from,to]:from>0?[from,audio.duration]:null;const response=await api('start',{sourceId:state.source?.id,start:from,end:to,mode,range,excludeArtist:exclude.checked});state.jobId=response.id;if(state.closed){await api('cancel');return;}await poll();}
      catch(error){busy(false);throw error;}
    }
    async function poll(){
      if(state.closed)return;
      try{
        const {job}=await api('status');if(state.closed)return;
        if(job.id!==state.jobId)throw Error(t('This analysis session changed. Start again.','Analiz oturumu değişti. Yeniden başlat.'));
        if(job.state==='running'){
          const current=steps.findIndex(([key])=>key===job.stage);
          stages.querySelectorAll('span').forEach((item,i)=>{item.classList.toggle('is-current',i===current);item.classList.toggle('is-done',i<current);});
          const labels={download:t('Downloading model','Model indiriliyor'),model:t('Loading CLAP on CPU','CLAP CPU üzerinde yükleniyor'),index:t('Comparing library audio','Arşiv sesleri karşılaştırılıyor'),rank:t('Ranking matches','Eşleşmeler sıralanıyor')};
          message((labels[job.stage]||steps[current]?.[1]||t('Working…','İşleniyor…'))+(Number.isFinite(job.total)?` · ${job.stage==='download'?Math.round(job.completed/1048576)+' / '+Math.round(job.total/1048576)+' MB':job.completed+' / '+job.total}`:'')+(job.title?` · ${job.title}`:''));pollTimer=setTimeout(poll,450);return;
        }
        busy(false);
        if(job.state==='completed'){
          if(state.mode==='prepare'){await refreshModel();message(t('Model ready. Choose a reference and search your library.','Model hazır. Referans seçip arşivinde ara.'));return;}
          if(job.result.sourceId!==state.source.id)throw Error(t('The source changed. Analyze again.','Kaynak değişti. Yeniden analiz et.'));
          if(state.mode==='search'){showHits(job.result);tab(true);message(t('Matches ready. Compare the highlighted passages by ear.','Eşleşmeler hazır. Seçilen kesitleri dinleyerek karşılaştır.'));return;}
          state.result=job.result;draw();message(job.result.silent?t('This selection is nearly silent; tempo cannot be estimated reliably.','Bu aralık neredeyse sessiz; tempo güvenilir biçimde tahmin edilemiyor.'):job.result.cached?t('Loaded saved measurements.','Kayıtlı ölçümler açıldı.'):t('Analysis ready. Click a graph to listen at that time.','Analiz hazır. O saniyeyi dinlemek için grafiğe tıkla.'));
        }else {const parts=String(job.error||'').split(' / ');message(parts.length>1?t(parts[0],parts.slice(1).join(' / ')):parts[0]||t('Analysis stopped.','Analiz durdu.'),job.state==='failed');}
      }catch(error){busy(false);message(error.message,true);}
    }
    function chart(parent,kind,label){
      const shell=node('div','ml-chart-shell'),canvas=node('canvas','ml-chart'),tooltip=node('output','ml-tooltip');
      canvas.tabIndex=0;canvas.setAttribute('role','slider');canvas.setAttribute('aria-label',label);canvas.setAttribute('aria-valuemin','0');
      const duration=state.result.duration;canvas.setAttribute('aria-valuemax',String(duration));
      shell.append(canvas,tooltip);parent.append(shell);let anchor=null;
      const local=event=>Math.max(0,Math.min(duration,(event.clientX-canvas.getBoundingClientRect().left)/canvas.getBoundingClientRect().width*duration));
      canvas.addEventListener('pointerdown',event=>{if(event.button!==0||state.busy)return;anchor=local(event);canvas.setPointerCapture(event.pointerId);});
      canvas.addEventListener('pointerup',event=>{
        if(anchor===null)return;const at=local(event);
        if(kind==='wave'&&Math.abs(at-anchor)>.4){start.value=(state.result.range.start+Math.min(at,anchor)).toFixed(1);end.value=(state.result.range.start+Math.max(at,anchor)).toFixed(1);message(t('Range selected. Analyze to measure this passage.','Aralık seçildi. Bu bölümü ölçmek için analiz et.'));}
        else audio.currentTime=state.result.range.start+at;
        anchor=null;redraw();
      });
      canvas.addEventListener('pointercancel',()=>{anchor=null;});
      canvas.addEventListener('pointermove',event=>{
        const at=local(event),data=state.result.points,point=data.reduce((best,p)=>Math.abs(p.time-at)<Math.abs(best.time-at)?p:best,data[0]);
        tooltip.textContent=`${clock(state.result.range.start+at)} · ${kind==='bands'?`${Math.round(point.low*100)} / ${Math.round(point.mid*100)} / ${Math.round(point.high*100)}%`:kind==='db'?`${point.db.toFixed(1)} dBFS`:t('Click to seek · drag to select','Gitmek için tıkla · seçmek için sürükle')}`;
        tooltip.hidden=false;tooltip.style.left=`${Math.max(0,Math.min(shell.clientWidth-240,event.clientX-shell.getBoundingClientRect().left))}px`;
      });
      canvas.addEventListener('pointerleave',()=>{tooltip.hidden=true;});tooltip.hidden=true;
      canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();audio.currentTime=Math.max(state.result.range.start,Math.min(state.result.range.end,event.key==='Home'?state.result.range.start:event.key==='End'?state.result.range.end:audio.currentTime+(event.key==='ArrowRight'?5:-5)));redraw();});
      charts.push({canvas,kind});
    }
    function draw(){
      charts.length=0;results.replaceChildren();const r=state.result;
      const wave=node('section','ml-wave');const waveHead=node('div','ml-section-heading');
      waveHead.append(node('h2','',t('Your selected sound','Seçtiğin ses')),node('span','',`${clock(r.range.start)} — ${clock(r.range.end)}`));wave.append(waveHead);chart(wave,'wave',t('Waveform. Drag to select a range.','Dalga formu. Aralık seçmek için sürükle.'));
      const ruler=node('div','ml-ruler');ruler.append(node('span','',clock(r.range.start)),node('span','',clock((r.range.start+r.range.end)/2)),node('span','',clock(r.range.end)));wave.append(ruler);
      const metrics=node('div','ml-metrics');
      for(const [label,value,detail] of [[t('Estimated tempo','Tahmini tempo'),r.tempo?`${r.tempo.value} BPM`:'—',t('Half / double tempo may also fit','Yarım / çift tempo da uygun olabilir')],[t('Average level','Ortalama seviye'),`${r.rmsDb} dBFS`,t('RMS · not perceived loudness (LUFS)','RMS · algılanan ses yüksekliği (LUFS) değildir')],[t('Peak level','Tepe seviye'),`${r.peakDb} dBFS`,t('Measured after mono conversion','Mono dönüşümden sonra ölçüldü')]]){const item=node('div');item.append(node('span','',label),node('strong','',value),node('small','',detail));metrics.append(item);}
      const grid=node('div','ml-analysis-grid'),dynamics=node('section','ml-analysis-panel'),bands=node('section','ml-analysis-panel');
      dynamics.append(node('h2','',t('Dynamics over time','Zaman içinde ses seviyesi')),node('p','ml-description',t('RMS level in dBFS · click to seek','dBFS cinsinden RMS seviyesi · gitmek için tıkla')));chart(dynamics,'db',t('Audio level over time','Zaman içinde ses seviyesi'));
      bands.append(node('h2','',t('Frequency balance','Frekans dengesi')),node('p','ml-description',t('Bass / mid / treble · relative spectral power','Bas / orta / tiz · göreli spektral güç')));chart(bands,'bands',t('Bass, mid and treble over time','Zaman içinde bas, orta ve tiz'));
      const legend=node('div','ml-legend');[t('Bass <250 Hz','Bas <250 Hz'),t('Mid 250–2000 Hz','Orta 250–2000 Hz'),t('Treble >2000 Hz','Tiz >2000 Hz')].forEach((label,i)=>{const n=node('span','ml-band-'+i,label);legend.append(n);});bands.append(legend);grid.append(dynamics,bands);
      const provenance=node('footer','ml-provenance');provenance.append(node('strong','',t('Measured from audio','Doğrudan sesten ölçüldü')),node('p','',t('Local CPU analysis. Find CLAP audio matches in the library tab. Mood and instrument recognition are not available; frequency bands do not identify instruments.','Yerel CPU analizi. Arşiv sekmesinde CLAP ses eşleşmelerini bulabilirsin. Duygu ve enstrüman tanıma henüz yok; frekans bantları enstrüman tanımaz.')));
      results.append(wave,metrics,grid,provenance);redraw();
    }
    function redraw(){
      if(state.closed||!state.result)return;
      const r=state.result,styles=getComputedStyle(dialog),accent=styles.getPropertyValue('--accent').trim()||'#d5a35c',dim=styles.getPropertyValue('--text-dim').trim()||'#9ca4ad',border=styles.getPropertyValue('--border').trim()||'#30353a';
      for(const {canvas,kind} of charts){
        const width=canvas.clientWidth,height=canvas.clientHeight;if(!width)continue;const ratio=window.devicePixelRatio||1;
        canvas.width=width*ratio;canvas.height=height*ratio;const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,width,height);
        ctx.strokeStyle=border;ctx.lineWidth=1;ctx.font='11px "IBM Plex Sans", sans-serif';ctx.fillStyle=dim;
        for(let i=1;i<4;i++){const y=kind==='wave'?height*i/4:12+(height-24)*i/4;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();if(kind==='db')ctx.fillText(String(-i*24)+' dB',6,y-5);if(kind==='bands')ctx.fillText(String(100-i*25)+'%',6,y-5);}
        if(kind==='wave'){
          ctx.strokeStyle=accent;ctx.globalAlpha=.8;ctx.beginPath();r.waveform.forEach(([lo,hi],i)=>{const x=i/(r.waveform.length-1)*width;ctx.moveTo(x,height*(.5-hi*.44));ctx.lineTo(x,height*(.5-lo*.44));});ctx.stroke();ctx.globalAlpha=1;
          const left=Math.max(0,(Number(start.value)-r.range.start)/r.duration*width),right=Math.min(width,((end.value?Number(end.value):r.range.end)-r.range.start)/r.duration*width);ctx.fillStyle=accent;ctx.globalAlpha=.12;ctx.fillRect(left,0,Math.max(0,right-left),height);ctx.globalAlpha=1;
        }else{
          const keys=kind==='bands'?['low','mid','high']:['db'];keys.forEach((key,index)=>{ctx.strokeStyle=[accent,dim,'#eee5d6'][index];ctx.lineWidth=1.8;ctx.setLineDash(index===2?[5,4]:[]);ctx.beginPath();r.points.forEach((p,i)=>{const x=p.time/r.duration*width,y=kind==='db'?12+(-p.db/96)*(height-24):12+(1-p[key])*(height-24);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();ctx.setLineDash([]);});
        }
        const position=Math.max(0,Math.min(r.duration,audio.currentTime-r.range.start));canvas.setAttribute('aria-valuenow',position.toFixed(1));canvas.setAttribute('aria-valuetext',clock(audio.currentTime));
        if(audio.currentTime>=r.range.start&&audio.currentTime<=r.range.end){ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(position/r.duration*width,0);ctx.lineTo(position/r.duration*width,height);ctx.stroke();}
      }
    }
    const repaint=()=>{cancelAnimationFrame(animation);animation=requestAnimationFrame(redraw);};
    audio.addEventListener('timeupdate',()=>{repaint();if(previewA&&comparison&&audio.currentTime>=comparison.referenceRange[1])audio.pause();});audio.addEventListener('pause',()=>{previewA=false;});start.addEventListener('input',repaint);end.addEventListener('input',repaint);
    audio.addEventListener('play',()=>{compareAudio.pause();document.getElementById('mediaShelfAudio')?.pause();document.getElementById('playerVideo')?.pause();});
    audio.addEventListener('error',()=>message(t('Audio could not be played. Select the source again.','Ses oynatılamadı. Kaynağı yeniden seç.'),true));
    function cleanup(){if(state.closed)return;state.closed=true;onlinePanel.dispatchEvent(new Event('music-dispose'));clearTimeout(pollTimer);cancelAnimationFrame(animation);observer?.disconnect();audio.pause();compareAudio.pause();++compareToken;audio.removeAttribute('src');audio.load();compareAudio.removeAttribute('src');compareAudio.load();if(state.busy)void api('cancel').catch(()=>{});dialog.remove();if(instance===state)instance=null;if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();}
    dialog.addEventListener('close',cleanup,{once:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();cleanup();});
    dialog.showModal();if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();observer=new ResizeObserver(repaint);observer.observe(results);
    tab(false);void refreshModel().catch(e=>message(e.message,true));
    if(libraryId)void select('library',{id:libraryId}).catch(e=>message(e.message,true));
    return dialog;
  }
  window.MusicAnalysisUI=Object.freeze({open});
})();
