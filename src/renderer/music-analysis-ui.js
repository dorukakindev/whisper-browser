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
    if(instance){instance.dialog.focus();if(libraryId)void instance.selectReference(libraryId).catch(e=>instance.message(e.message,true));return;}
    const dialog=node('dialog','music-lab media-surface');dialog.dataset.uiUntranslated='';
    const state={dialog,source:null,result:null,busy:false,jobId:null,closed:false,mode:'analyze',modelReady:false,references:[],hidden:[],mixVersion:0,submittedMixVersion:0};instance=state;
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
    sourcePanel.append(sourceMark,sourceText,button(t('Choose from music','Müziklerimden seç'),pickSource,'ml-button ml-pick-source'),choose);
    const controls=node('div','ml-controls'),rangeTitle=node('span','',t('Analysis range','Analiz aralığı'));
    const start=node('input'),end=node('input');
    for(const [input,label] of [[start,t('Start in seconds','Başlangıç, saniye')],[end,t('End in seconds','Bitiş, saniye')]]){input.type='number';input.min='0';input.step='.1';input.setAttribute('aria-label',label);}
    start.value='0';end.placeholder=t('Full track','Tüm parça');
    const run=button(t('Analyze sound','Sesi analiz et'),analyze,'ml-button ml-primary');run.disabled=true;
    const cancel=button(t('Cancel','Durdur'),()=>api('cancel'));cancel.classList.add('ml-cancel');cancel.hidden=true;
    const tags=button(t('Explore sound tags','Ses etiketlerini keşfet'),()=>launch('tags'));tags.disabled=true;const prepareTags=button(t('Prepare label resources · 2 MB','Etiket kaynaklarını hazırla · 2 MB'),()=>launch('prepare-tags'));
    controls.append(rangeTitle,start,node('span','','—'),end,node('span','ml-unit',t('seconds','saniye')),run,tags,prepareTags,cancel);
    const taste=node('section','ml-taste'),tasteHead=node('div','ml-taste-head'),seeds=node('div','ml-seeds');
    const addSeed=button(t('Add this passage','Bu kesiti ekle'),addReference);addSeed.disabled=true;
    tasteHead.append(node('strong','',t('Reference mix','Referans karışımı')),addSeed);
    const tasteHint=node('p','ml-description',t('Optional: combine up to three passages. Scores are the equal-weight average of their audio similarities. Without a mix, the selected source is used.','İsteğe bağlı: en fazla üç kesiti birleştir. Puan, bu kesitlere ses benzerliğinin eşit ağırlıklı ortalamasıdır. Karışım boşsa seçili kaynak kullanılır.'));
    const hiddenDetails=node('details','ml-hidden-preferences'),hiddenSummary=node('summary'),hiddenList=node('div');hiddenDetails.append(hiddenSummary,hiddenList);taste.append(tasteHead,tasteHint,seeds,hiddenDetails);
    function addReference(){
      if(!state.source||state.busy)throw Error(t('Choose an idle reference first.','Önce boşta bir referans seç.'));
      if(state.references.length>=3)throw Error(t('Use up to three references.','En fazla üç referans kullan.'));
      const from=Number(start.value),to=end.value.trim()?Number(end.value):Number(audio.duration);
      if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to-from<1||to-from>1800)throw Error(t('Choose a valid reference range.','Geçerli bir referans aralığı seç.'));
      const row={...state.source,range:[from,to]};
      if(state.references.some(r=>r.url===row.url&&JSON.stringify(r.range)===JSON.stringify(row.range)))throw Error(t('This passage is already in the mix.','Bu kesit zaten karışımda.'));
      state.references.push(row);invalidateMix();
    }
    function paintTaste(){seeds.replaceChildren();for(const row of state.references){const chip=node('div','ml-seed');chip.append(node('span','',`${row.title} · ${clock(row.range[0])}–${clock(row.range[1])}`),button('×',()=>{state.references=state.references.filter(r=>r!==row);invalidateMix();}));chip.lastChild.setAttribute('aria-label',t('Remove reference '+row.title,'Referansı kaldır '+row.title));chip.lastChild.disabled=state.busy;seeds.append(chip);}addSeed.disabled=state.busy||!state.source||state.references.length>=3;
      hiddenSummary.textContent=t(`Hidden tracks (${state.hidden.length})`,`Gizlenen parçalar (${state.hidden.length})`);hiddenList.replaceChildren();for(const row of state.hidden){const item=node('div','ml-hidden-row');item.append(node('span','',row.title),button(t('Restore','Geri al'),()=>feedback(row.provider,row.id,false)));item.lastChild.disabled=state.busy;hiddenList.append(item);}}
    async function feedback(provider,id,hidden){if(state.busy)throw Error('A music job is running / Bir müzik işi çalışıyor');const response=await api('feedback',{provider,id,hidden});if(state.closed)return;state.hidden=response.hidden;comparison=null;alternateReference.pause();compareAudio.pause();compare.hidden=true;paintTaste();if(state.lastSearch)showHits(state.lastSearch);onlinePanel.dispatchEvent(new Event('music-feedback'));}
    const intentPanel=node('section','ml-intent'),intentLabel=node('label','',t('Describe the sound you want','Aradığın sesi tarif et')),intent=node('input');intent.id='mlMusicIntent';intent.maxLength=300;intent.placeholder=t('Optional English description, e.g. calm acoustic guitar','İsteğe bağlı İngilizce tarif: calm acoustic guitar');intentLabel.htmlFor=intent.id;
    const presets=node('select'),weight=node('select');presets.setAttribute('aria-label',t('Sound direction','Ses yönü'));weight.setAttribute('aria-label',t('Description influence','Tarifin etkisi'));
    for(const [en,tr,value] of [['Reference only','Yalnız referans',''],['Calmer, gentle','Daha sakin, yumuşak','Calm gentle relaxing music'],['Acoustic guitar','Akustik gitar','Gentle acoustic guitar music'],['Energetic rhythm','Enerjik ritim','Energetic rhythmic music'],['Instrumental','Enstrümantal','Instrumental music']]){const option=node('option','',t(en,tr));option.value=value;presets.append(option);}
    for(const [en,tr,value] of [['Subtle','Hafif',.15],['Balanced','Dengeli',.35],['Strong','Güçlü',.6]]){const option=node('option','',t(en,tr));option.value=String(value);weight.append(option);}weight.value='0.35';
    const customOption=node('option','',t('Custom description','Özel tarif'));customOption.value='__custom__';presets.append(customOption);
    const syncPreset=()=>{presets.value=[...presets.options].some(o=>o.value===intent.value)?intent.value:'__custom__';};
    const diverse=node('input');diverse.type='checkbox';const diverseLabel=node('label','ml-exclude');diverseLabel.append(diverse,document.createTextNode(t('Artist variety · up to two tracks per artist','Sanatçı çeşitliliği · sanatçı başına en fazla iki parça')));
    intentPanel.append(intentLabel,presets,intent,weight,diverseLabel,node('p','ml-description',t('Experimental English text–audio matching. Use positive sound descriptions; complex negation is unreliable. A description blends with reference similarity and applies to local and preview ranking.','Deneysel İngilizce metin–ses eşleştirmesi. Olumlu ses tarifleri kullan; karmaşık olumsuz ifadeler güvenilir değildir. Tarif, yerel ve önizleme sıralamasında referans benzerliğiyle birleştirilir.')));
    presets.addEventListener('change',()=>{if(presets.value!=='__custom__')intent.value=presets.value;invalidateMix();});intent.addEventListener('input',syncPreset);for(const control of [intent,weight,diverse])control.addEventListener('change',invalidateMix);
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
    const alternateReference=node('audio','ml-alternate-reference');alternateReference.hidden=true;alternateReference.preload='metadata';
    function referencePlayer(hit){if(!hit?.referenceUrl||hit.referenceUrl===state.source?.url)return audio;if(alternateReference.src!==hit.referenceUrl)alternateReference.src=hit.referenceUrl;return alternateReference;}
    let comparison=null,compareToken=0,previewA=false;
    function volumes(){audio.volume=1;alternateReference.volume=1;compareAudio.volume=1;if(comparison&&matchLevel.checked){const level=Math.min(comparison.referenceDb,comparison.matchedDb);referencePlayer(comparison).volume=Math.min(1,10**((level-comparison.referenceDb)/20));compareAudio.volume=Math.min(1,10**((level-comparison.matchedDb)/20));}}
    const playA=button(t('A · Reference','A · Referans'),async()=>{if(!comparison)return;compareAudio.pause();volumes();const a=referencePlayer(comparison);a.currentTime=comparison.referenceRange[0];await a.play();previewA=true;});
    const playB=button(t('B · Match','B · Eşleşme'),async()=>{if(!comparison)return;audio.pause();alternateReference.pause();volumes();compareAudio.currentTime=comparison.matchedRange[0];await compareAudio.play();});
    compare.append(compareName,playA,playB,matchLabel,compareAudio);matchLevel.addEventListener('change',volumes);
    compareAudio.addEventListener('play',()=>{audio.pause();alternateReference.pause();document.getElementById('mediaShelfAudio')?.pause();document.getElementById('playerVideo')?.pause();});
    compareAudio.addEventListener('timeupdate',()=>{if(comparison&&compareAudio.currentTime>=comparison.matchedRange[1])compareAudio.pause();});
    compareAudio.addEventListener('error',()=>message(t('This matched file can no longer be played. Search again.','Eşleşen dosya artık oynatılamıyor. Yeniden ara.'),true));
    const blind=node('section','ml-blind');blind.hidden=true;let blindSession=null,blindToken=0;
    const blindAudio=node('audio','ml-blind-audio');blindAudio.hidden=true;blindAudio.preload='metadata';blindAudio.addEventListener('pause',()=>blind.querySelectorAll('.is-playing').forEach(c=>c.classList.remove('is-playing')));
    function stopBlind(){++blindToken;blindSession=null;blindAudio.pause();blindAudio.removeAttribute('src');blindAudio.load();blind.hidden=true;hits.hidden=false;}
    function beginBlind(){
      const pair=(state.lastSearch?.results||[]).filter(r=>selectedMatches.has(r.id));
      if(pair.length!==2)throw Error(t('Select exactly two matches.','Tam iki eşleşme seç.'));
      stopBlind();audio.pause();alternateReference.pause();compareAudio.pause();compare.hidden=true;
      if(crypto.getRandomValues(new Uint8Array(1))[0]&1)pair.reverse();
      const session={pair,jobId:state.jobId,heard:new Set(),saved:false};blindSession=session;blind.replaceChildren();blind.hidden=false;hits.hidden=true;
      blind.append(node('span','ml-blind-eyebrow',t('LISTEN FIRST','ÖNCE DİNLE')),node('h2','',t('Which sound belongs with your reference?','Referansına hangi ses daha yakın?')),node('p','ml-description',t('Random A/B order. Names and scores stay hidden until your choice. Listen to both passages, then decide. RMS levels are matched; this is not a loudness or scientific ABX test.','A/B sırası rastgele. Tercihine kadar adlar ve puanlar gizlenir. İki kesiti de dinle, sonra karar ver. RMS seviyeleri eşleştirilir; bu bir LUFS veya bilimsel ABX testi değildir.')));
      const cards=node('div','ml-blind-cards'),votes=node('div','ml-blind-votes'),progress=node('p','ml-description');progress.setAttribute('role','status');
      const voteButtons=[];let current=null,heardSeconds=0,lastTime=null;
      const setProgress=()=>{progress.textContent=t(`${session.heard.size}/2 passages listened`,`${session.heard.size}/2 kesit dinlendi`);voteButtons.forEach(b=>b.disabled=session.heard.size!==2||session.saved);};
      async function play(index){
        const token=++blindToken;blindAudio.pause();audio.pause();alternateReference.pause();compareAudio.pause();const hit=pair[index];current=index;heardSeconds=0;lastTime=null;
        blindAudio.src=hit.url;
        await new Promise((resolve,reject)=>{const done=error=>{clearTimeout(timer);blindAudio.removeEventListener('loadedmetadata',ready);blindAudio.removeEventListener('error',fail);error?reject(error):resolve();};const ready=()=>done(),fail=()=>done(Error(t('Audio unavailable.','Ses kullanılamıyor.'))),timer=setTimeout(()=>done(Error(t('Audio loading timed out.','Ses yükleme zaman aşımı.'))),10000);blindAudio.addEventListener('loadedmetadata',ready,{once:true});blindAudio.addEventListener('error',fail,{once:true});blindAudio.load();});
        if(token!==blindToken||state.closed||blindSession!==session)return;
        const db=Math.min(...pair.map(r=>r.matchedDb));blindAudio.volume=pair.every(r=>Number.isFinite(r.matchedDb))?Math.min(1,10**((db-hit.matchedDb)/20)):1;
        blindAudio.currentTime=hit.matchedRange[0];await blindAudio.play();cards.querySelectorAll('.ml-blind-card').forEach((c,i)=>c.classList.toggle('is-playing',i===index));if(token!==blindToken||state.closed)blindAudio.pause();
      }
      blindAudio.ontimeupdate=()=>{if(blindSession!==session||current===null||blindAudio.paused)return;const hit=pair[current],now=blindAudio.currentTime;if(lastTime!==null&&now>lastTime&&now-lastTime<1)heardSeconds+=now-lastTime;lastTime=now;if(heardSeconds>=Math.min(2,(hit.matchedRange[1]-hit.matchedRange[0])*.7)){session.heard.add(current);setProgress();}if(now>=hit.matchedRange[1])blindAudio.pause();};
      ['A','B'].forEach((letter,i)=>{const card=node('div','ml-blind-card');card.append(node('span','ml-blind-letter',letter),button(t('Play passage','Kesiti dinle'),()=>play(i),'ml-button ml-blind-play'),node('small','',t('Identity hidden','Kimlik gizli')));cards.append(card);});
      for(const [choice,en,tr] of [['a','A is closer','A daha yakın'],['b','B is closer','B daha yakın'],['tie','Equally close','İkisi de yakın'],['neither','Neither fits','Hiçbiri uygun değil']]){const b=button(t(en,tr),async()=>{if(session.saved||session.heard.size!==2)return;voteButtons.forEach(n=>n.disabled=true);try{await api('listening-save',{jobId:session.jobId,ids:pair.map(r=>r.id),choice});if(blindSession!==session||state.closed)return;session.saved=true;blindAudio.pause();progress.textContent=t('Choice saved on this computer. Ranking is unchanged.','Tercih bu bilgisayara kaydedildi. Sıralama değiştirilmedi.');[...cards.children].forEach((card,i)=>{card.lastChild.textContent=pair[i].title+' · '+pair[i].score.toFixed(3);});}catch(e){setProgress();throw e;}},'ml-button ml-blind-vote');voteButtons.push(b);votes.append(b);}
      blind.append(button(t('Listen to reference passage','Referans kesitini dinle'),()=>{blindAudio.pause();comparison=pair[0];playA.click();}),cards,votes,progress,button(t('Back to results','Sonuçlara dön'),stopBlind));setProgress();blind.scrollIntoView({block:'nearest'});
    }
    const history=node('details','ml-listening-history'),historyTitle=node('summary','',t('My listening choices','Dinleme tercihlerim')),historyBody=node('div');history.append(historyTitle,historyBody);
    history.addEventListener('toggle',async()=>{if(!history.open)return;try{const result=await api('listening-history');if(state.closed)return;historyBody.replaceChildren();const choices={a:t('A closer','A yakın'),b:t('B closer','B yakın'),tie:t('Tie','Eşit'),neither:t('Neither','Hiçbiri')};if(!result.trials.length)historyBody.append(node('p','ml-description',t('No listening choices saved yet.','Henüz dinleme tercihi kaydedilmedi.')));for(const trial of result.trials.slice(-20).reverse()){const item=node('p','ml-description');item.textContent=trial.candidates.map((r,i)=>(i?'B: ':'A: ')+r.title).join(' · ')+' — '+(choices[trial.choice]||trial.choice);historyBody.append(item);}}catch(error){message(error.message,true);}});
    similar.append(searchHead,modelRow,excludeLabel,compare,blind,blindAudio,hits,history);
    const onlinePanel=node('section','ml-online');onlinePanel.id='mlOnline';onlinePanel.setAttribute('role','tabpanel');onlinePanel.setAttribute('aria-labelledby','mlOnlineTab');onlinePanel.hidden=true;window.MusicOnlineUI.mount(onlinePanel,{rank:ids=>launch('online',{trackIds:ids}),referenceAudio:audio,alternateReference,referencePlayer,useSource:row=>selectReference({kind:'deezer',id:row.id}),feedback:id=>feedback('deezer',id,true),isHidden:id=>state.hidden.some(r=>r.provider==='deezer'&&r.id===id)});
    const advanced=node('details','ml-advanced'),advancedTitle=node('summary','',t('Sound direction and reference mix','Ses yönü ve referans karışımı'));advanced.append(advancedTitle,taste,intentPanel);content.append(sourcePanel,controls,status,stages,audio,alternateReference,tabs,advanced,results,similar,onlinePanel);dialog.append(header,content);document.body.append(dialog);paintTaste();void api('preferences').then(r=>{if(!state.closed){state.hidden=r.hidden;paintTaste();onlinePanel.dispatchEvent(new Event('music-feedback'));}}).catch(e=>message(e.message,true));
    let pollTimer,observer,animation;
    const charts=[];
    function invalidateMix(){stopBlind();state.playlistDraft=null;selectedMatches=new Set();state.mixVersion++;state.lastSearch=null;state.matches=[];comparison=null;alternateReference.pause();compareAudio.pause();compare.hidden=true;hits.replaceChildren(node('p','ml-search-empty',t('Reference mix changed. Search again to compare these passages.','Referans karışımı değişti. Bu kesitleri karşılaştırmak için yeniden ara.')));onlinePanel.dispatchEvent(new Event('music-mix-changed'));paintTaste();}
    function message(text,error=false){if(state.closed)return;status.textContent=text;status.classList.toggle('ml-error',error);}
    function busy(value){state.busy=value;dialog.querySelector('.ml-pick-source').disabled=value;for(const c of [intent,presets,weight,diverse])c.disabled=value;tags.disabled=value||!state.source||!state.modelReady;prepareTags.disabled=value||!state.modelReady;paintTaste();hits.querySelectorAll("button").forEach(b=>b.disabled=value);dialog.setAttribute('aria-busy',String(value));choose.disabled=value;run.disabled=value||!state.source;find.disabled=value||!state.source||!state.modelReady;prepare.disabled=value;exclude.disabled=value||!(state.source?.artist||state.references.some(r=>r.artist));start.disabled=value;end.disabled=value;cancel.hidden=!value;stages.hidden=!value;onlinePanel.dispatchEvent(new CustomEvent('music-busy',{detail:{busy:value,ready:!!state.source&&state.modelReady}}));}
    function tab(isSimilar,internet=false){if(!isSimilar||internet)stopBlind();results.hidden=isSimilar||internet;similar.hidden=!isSimilar||internet;onlinePanel.hidden=!internet;for(const [b,selected] of [[overviewTab,!isSimilar&&!internet],[similarTab,isSimilar&&!internet],[onlineTab,internet]]){b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}repaint();}
    tabs.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const buttons=[overviewTab,similarTab,onlineTab],index=buttons.indexOf(document.activeElement),next=(index+(event.key==='ArrowRight'?1:2))%3;tab(next===1,next===2);buttons[next].focus();}});
    async function refreshModel(){const model=await api('model');if(state.closed)return;state.modelReady=model.ready&&model.runtimeReady;prepare.hidden=model.ready;modelLabel.textContent=!model.runtimeReady?t('Run install-music.bat to prepare the separate CPU environment.','Ayrı CPU ortamını hazırlamak için install-music.bat çalıştır.'):model.ready?t('CLAP ready · local CPU · six excerpts per track','CLAP hazır · yerel CPU · parça başına altı kesit'):t('One-time model download required. Your audio stays local.','Bir defalık model indirmesi gerekiyor. Sesin bilgisayarda kalır.');busy(state.busy);}
    let selectedMatches=new Set();
    function showHits(input){stopBlind();state.playlistDraft=null;selectedMatches=new Set();state.lastSearch=input;const result={...input,results:input.results.filter(r=>!state.hidden.some(h=>h.provider==='local'&&h.id===r.id))};state.matches=result.results.map(r=>({id:r.id,title:r.title,artist:r.artist,score:r.score,matchedRange:r.matchedRange,evidence:'local-clap',...(Number.isFinite(r.intentScore)?{intentScore:r.intentScore,audioScore:r.audioScore}:{}),referenceTitle:r.referenceTitle,referenceScores:r.referenceScores}));
      hits.replaceChildren();const summary=node('p','ml-hit-summary',t(`${result.indexed} tracks indexed · ${result.cached} reused · ${result.failed} unavailable`,`${result.indexed} parça indekslendi · ${result.cached} kayıt kullanıldı · ${result.failed} kullanılamadı`));hits.append(summary);
      const explanation=node('p','ml-search-explanation',t('CLAP audio similarity, not a probability or a rating. Long tracks are sampled at up to six 10-second passages.','CLAP ses benzerliğidir; olasılık veya beğeni puanı değildir. Uzun parçalarda en fazla altı 10 saniyelik bölüm örneklenir.'));hits.append(explanation);if(result.diverse)hits.append(node('p','ml-search-explanation',t('Artist variety: at most two tracks per known artist.','Sanatçı çeşitliliği: bilinen sanatçı başına en fazla iki parça.')));if(result.intent)hits.append(node('p','ml-search-explanation',t('Description: ','Tarif: ')+result.intent+' · '+Math.round(result.intentWeight*100)+'% '+t('description / remainder audio score','tarif / kalanı ses puanı')));
      const playlistButton=button(t('Review selected playlist','Seçilen listeyi incele'),()=>reviewPlaylist());playlistButton.classList.add('ml-playlist-propose');playlistButton.disabled=true;hits.append(playlistButton,button(t('Blind compare · select two','Kör karşılaştır · iki parça seç'),beginBlind,'ml-button ml-blind-start'));
      if(!result.results.length&&input.results.length){hits.append(node('p','ml-search-empty',t('All these matches are hidden. Restore a track above to show it.','Bu eşleşmelerin tümü gizli. Göstermek için yukarıdan bir parçayı geri al.')));return;}
      if(!result.results.length){hits.append(node('p','ml-search-empty',t('No comparable tracks. Add different tracks; exact copies of the reference are excluded.','Karşılaştırılabilir parça yok. Farklı parçalar ekle; referansın birebir kopyaları dışlanır.')));return;}
      result.results.forEach((hit,index)=>{
        const row=node('article','ml-hit'),check=node('input');check.type='checkbox';check.className='ml-match-select';check.setAttribute('aria-label',t('Select ','Seç ')+hit.title);check.addEventListener('change',()=>{check.checked?selectedMatches.add(hit.id):selectedMatches.delete(hit.id);playlistButton.disabled=!selectedMatches.size;});row.append(check);const number=node('span','ml-hit-number',String(index+1).padStart(2,'0')),copy=node('div','ml-hit-copy');copy.append(node('h3','',hit.title),node('p','',hit.artist||t('Unknown artist','Sanatçı bilinmiyor')),node('small','',t(`Audio compared · ${hit.samples} excerpts · match ${clock(hit.matchedRange[0])}–${clock(hit.matchedRange[1])}`,`Ses karşılaştırıldı · ${hit.samples} kesit · eşleşme ${clock(hit.matchedRange[0])}–${clock(hit.matchedRange[1])}`)));
        const score=node('div','ml-hit-score');score.append(node('strong','',hit.score.toFixed(3)),node('small','',Number.isFinite(hit.intentScore)?t('combined score','birleşik puan'):t('similarity','benzerlik')));
        const listen=button(t('Compare A/B','A/B karşılaştır'),async()=>{const token=++compareToken;comparison=hit;audio.pause();alternateReference.pause();compareAudio.pause();compareAudio.src=hit.url;compare.hidden=false;compareName.textContent=hit.title+(hit.referenceTitle?' · '+hit.referenceTitle:'');volumes();await new Promise((resolve,reject)=>{const ready=()=>{clearTimeout(timeout);resolve();};const timeout=setTimeout(()=>reject(Error(t('Audio loading timed out.','Ses yükleme zaman aşımı.'))),10000);compareAudio.addEventListener('loadedmetadata',ready,{once:true});});if(token!==compareToken||state.closed)return;compareAudio.currentTime=hit.matchedRange[0];await compareAudio.play();compare.scrollIntoView({block:'nearest',behavior:'instant'});});
        if(Number.isFinite(hit.intentScore))copy.append(node('small','ml-match-reason',t('Audio / description: ','Ses / tarif: ')+hit.audioScore.toFixed(3)+' / '+hit.intentScore.toFixed(3)));
        if(hit.referenceScores?.length)copy.append(node('small','ml-match-reason',t('Equal-weight mean: ','Eşit ağırlıklı ortalama: ')+hit.referenceScores.map(r=>`${r.title}${r.range?' ('+r.range.map(n=>n.toFixed(1)).join('–')+' '+t('s','sn')+')':''} ${r.score.toFixed(3)}`).join(' · ')));row.append(number,copy,score,listen,button(t('Not for me','Beğenmedim'),()=>feedback('local',hit.id,true))); hits.append(row);
      });
    }
    function reviewPlaylist(name=''){
      const rows=(state.lastSearch?.results||[]).filter(r=>selectedMatches.has(r.id)&&!state.hidden.some(h=>h.provider==='local'&&h.id===r.id));if(!rows.length)throw Error(t('Select current matches first.','Önce güncel eşleşmeleri seç.'));
      state.playlistDraft={status:'review',name,ids:rows.map(r=>r.id)};hits.querySelector('.ml-playlist-review')?.remove();const review=node('section','ml-playlist-review');review.append(node('h3','',t('Review before creating','Oluşturmadan önce incele')));const nameInput=node('input');nameInput.maxLength=120;nameInput.value=name;nameInput.placeholder=t('Playlist name','Çalma listesi adı');nameInput.setAttribute('aria-label',nameInput.placeholder);nameInput.addEventListener('input',()=>{if(state.playlistDraft?.status==='review')state.playlistDraft.name=nameInput.value;});review.append(nameInput);
      const list=node('ol');rows.forEach(r=>list.append(node('li','',r.title+' · '+(r.artist||''))));review.append(list);
      const save=button(t('Create playlist','Çalma listesini oluştur'),async()=>{if(!nameInput.value.trim())throw Error(t('Enter a playlist name.','Çalma listesi adı yaz.'));if(rows.some(r=>!state.lastSearch?.results.some(now=>now.id===r.id)||state.hidden.some(h=>h.provider==='local'&&h.id===r.id)))throw Error(t('Results changed. Review again.','Sonuçlar değişti. Yeniden incele.'));save.disabled=true;try{const response=await window.api.mediaShelf({action:'playlist-save',name:nameInput.value.trim(),ids:rows.map(r=>r.id)});if(!response?.ok)throw Error(response?.error||'Playlist failed');state.playlistDraft={status:'created',id:response.id,name:nameInput.value.trim(),ids:rows.map(r=>r.id)};review.replaceChildren(node('p','',t('Playlist created. Find it in Music.','Çalma listesi oluşturuldu. Müzik bölümünde bulabilirsin.')));}catch(e){save.disabled=false;throw e;}},'ml-button ml-primary');review.append(save,button(t('Cancel','Vazgeç'),()=>{state.playlistDraft=null;review.remove();}));hits.append(review);review.scrollIntoView({block:'nearest'});
    }
    async function pickSource(){
      const response=await window.api.mediaShelf({action:'list'});if(!response?.ok)throw Error(response?.error||'Music library unavailable');if(state.closed)return;
      const discoveries=await api('online',{op:'list'});if(state.closed)return;
      const rows=[...response.music.map(r=>({title:r.title,artist:r.artist,group:t('Local library','Yerel arşiv'),source:r.id})),...(response.linkedPlaylists||[]).flatMap(p=>p.tracks.map(r=>({title:r.title,artist:r.artist,group:p.name,source:{kind:'spotify',playlistId:p.id,id:r.id}}))),...(discoveries.results||[]).map(r=>({title:r.title,artist:r.artist,group:t('Saved discoveries','Kaydedilen keşifler'),source:{kind:'deezer',id:r.id}}))];
      const picker=node('dialog','ml-source-picker media-surface');picker.dataset.uiUntranslated='';const h=node('h2','',t('Choose a music reference','Müzik referansı seç'));h.id='mlPickerTitle';picker.setAttribute('aria-labelledby',h.id);const query=node('input');query.placeholder=t('Track, artist, playlist or saved discovery','Parça, sanatçı, liste veya kaydedilen keşif');query.setAttribute('aria-label',query.placeholder);const list=node('div','ml-source-options');
      function paint(){list.replaceChildren();const q=query.value.toLocaleLowerCase();const matches=rows.filter(r=>[r.title,r.artist,r.group].join(' ').toLocaleLowerCase().includes(q));for(const row of matches.slice(0,100)){const b=button(row.title+' · '+row.artist+' — '+row.group,async()=>{picker.close();await selectReference(row.source);},'ml-button ml-source-option');list.append(b);}if(!matches.length)list.append(node('p','ml-description',t('No tracks. Import a Spotify list or add local music first.','Parça yok. Önce Spotify listesi aktar veya yerel müzik ekle.')));if(matches.length>100)list.append(node('p','ml-description',t('First 100 shown; narrow your search.','İlk 100 gösteriliyor; aramayı daralt.')));}
      picker.append(h,query,list,button(t('Cancel','Vazgeç'),()=>picker.close()));picker.addEventListener('close',()=>picker.remove(),{once:true});query.addEventListener('input',paint);dialog.append(picker);paint();picker.showModal();query.focus();
    }
    async function selectReference(value){if(state.busy)throw Error(t('Wait for the current operation.','Mevcut işlemi bekle.'));const remote=value&&typeof value==='object';busy(true);message(remote?t('Preparing a bounded audio excerpt…','Sınırlı ses kesiti hazırlanıyor…'):t('Selecting source…','Kaynak seçiliyor…'));try{await select(remote?'remote-source':'library',remote?value:{id:value});if(!state.closed){busy(false);await launch('analyze');tab(false);}}catch(e){if(!state.closed)busy(false);throw e;}}
    state.selectReference=selectReference;state.message=message;
    async function select(action,payload={}){
      stopBlind();
      const response=await api(action,payload);if(state.closed||response.canceled)return;
      state.playlistDraft=null;selectedMatches=new Set();state.tags=null;state.lastSearch=null;state.matches=[];state.source=response.source;onlinePanel.dispatchEvent(new CustomEvent('music-reference',{detail:response.source}));state.result=null;sourceTitle.textContent=response.source.title;sourceDetail.textContent=response.source.origin==='deezer-preview'?t('Deezer preview · up to 30 seconds · not the full song','Deezer önizlemesi · en fazla 30 saniye · şarkının tamamı değil'):response.source.origin==='spotify-youtube-excerpt'?t('Spotify selection · reviewed YouTube version · first 90 seconds at most','Spotify seçimi · incelenmiş YouTube sürümü · ilk en fazla 90 saniye'):t('Local audio · measurements stay on this computer','Yerel ses · ölçümler bu bilgisayarda kalır');
      comparison=null;++compareToken;alternateReference.pause();compareAudio.pause();compare.hidden=true;audio.volume=1;find.disabled=!state.modelReady;exclude.disabled=!response.source.artist;hits.replaceChildren(node('p','ml-search-empty',t('Reference changed. Search again for fresh matches.','Referans değişti. Güncel eşleşmeler için yeniden ara.')));
      audio.pause();audio.hidden=false;audio.src=response.source.url;start.value='0';end.value='';end.placeholder=response.source.origin==='local'?t('Full track','Tüm parça'):t('Whole excerpt','Tüm kesit');run.disabled=false;results.replaceChildren(empty);charts.length=0;
      busy(state.busy);message(t('Ready. Select a range or analyze the full track (up to 30 minutes).','Hazır. Aralık seç veya parçanın tamamını analiz et (en fazla 30 dakika).'));
    }
    async function analyze(){return launch('analyze');}
    async function launch(mode,extra={}){
      if(state.busy||(!state.source&&!['prepare','prepare-tags'].includes(mode)))return;
      if(mode==='online'&&!state.modelReady)throw Error(t('Prepare CLAP in the library tab first.','Önce arşiv sekmesinde CLAP hazırla.'));
      const from=Number(start.value),to=end.value.trim()?Number(end.value):undefined;
      if(!['prepare','prepare-tags'].includes(mode)&&(!Number.isFinite(from)||from<0||(to!==undefined&&(!Number.isFinite(to)||to-from<1||to-from>1800))))throw Error(t('Select a valid range of 1 second to 30 minutes.','1 saniye–30 dakika arasında geçerli bir aralık seç.'));
      stopBlind();state.mode=mode;state.submittedMixVersion=state.mixVersion;busy(true);message(mode==='prepare'?t('Downloading the official audio model…','Resmî ses modeli indiriliyor…'):t('Reading audio…','Ses okunuyor…'));
      try{const range=to!==undefined?[from,to]:from>0?[from,audio.duration]:null;const response=await api('start',{...extra,...(['search','online'].includes(mode)?{intent:intent.value.trim(),intentWeight:Number(weight.value),diverse:diverse.checked}:{}),sourceId:state.source?.id,start:from,end:to,mode,range,...(['search','online'].includes(mode)&&state.references.length?{references:state.references.map(r=>({id:r.id,range:r.range}))}:{}),excludeArtist:mode==='online'?false:exclude.checked});state.jobId=response.id;if(state.closed){await api('cancel');return;}await poll();}
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
          const labels={preview:t('Reading internet previews','İnternet önizlemeleri okunuyor'),download:t('Downloading model','Model indiriliyor'),model:t('Loading CLAP on CPU','CLAP CPU üzerinde yükleniyor'),index:t('Comparing audio excerpts','Ses kesitleri karşılaştırılıyor'),rank:t('Ranking matches','Eşleşmeler sıralanıyor')};
          message((labels[job.stage]||steps[current]?.[1]||t('Working…','İşleniyor…'))+(Number.isFinite(job.total)?` · ${job.stage==='download'?Math.round(job.completed/1048576)+' / '+Math.round(job.total/1048576)+' MB':job.completed+' / '+job.total}`:'')+(job.title?` · ${job.title}`:''));pollTimer=setTimeout(poll,450);return;
        }
        busy(false);
        if(job.state==='completed'){
          if(state.mode==='prepare-tags'){message(t('Label resources ready. Choose a source and explore its tags.','Etiket kaynakları hazır. Kaynak seçip etiketlerini keşfet.'));return;}
          if(state.mode==='prepare'){await refreshModel();message(t('Model ready. Choose a reference and search your library.','Model hazır. Referans seçip arşivinde ara.'));return;}
          if(job.result.sourceId!==state.source.id)throw Error(t('The source changed. Analyze again.','Kaynak değişti. Yeniden analiz et.'));
          if(state.mode==='tags'){showTags(job.result);tab(false);message(t('Experimental label similarities ready. These are not confirmed classifications.','Deneysel etiket benzerlikleri hazır. Bunlar doğrulanmış sınıflandırma değildir.'));return;}
          if(state.mode==='online'){onlinePanel.dispatchEvent(new CustomEvent('music-ranked',{detail:job.result}));tab(false,true);message(t('Internet previews compared. Listen to the matched passages.','İnternet önizlemeleri karşılaştırıldı. Eşleşen kesitleri dinle.'));return;}
          if(state.mode==='search'){showHits(job.result);tab(true);message(t('Matches ready. Compare the highlighted passages by ear.','Eşleşmeler hazır. Seçilen kesitleri dinleyerek karşılaştır.'));return;}
          state.result=job.result;draw();message(job.result.silent?t('This selection is nearly silent; tempo cannot be estimated reliably.','Bu aralık neredeyse sessiz; tempo güvenilir biçimde tahmin edilemiyor.'):job.result.cached?t('Loaded saved measurements.','Kayıtlı ölçümler açıldı.'):t('Analysis ready. Click a graph to listen at that time.','Analiz hazır. Dinlemek istediğin noktayı grafikte seç.'));
        }else {const parts=String(job.error||'').split(' / ');message(parts.length>1?t(parts[0],parts.slice(1).join(' / ')):parts[0]||t('Analysis stopped.','Analiz durdu.'),job.state==='failed');}
      }catch(error){busy(false);message(error.message,true);}
    }
    function showTags(r){state.tags=r;
      state.result=null;charts.length=0;results.replaceChildren();
      results.append(node('h2','',t('Sound hypotheses','Ses tahminleri')),node('p','ml-description',t('Experimental CLAP audio–text similarity (−1 to 1), not a probability. Only sampled passages are analyzed. Labels depend on the candidate descriptions; they do not establish the listener’s feelings or instrument presence. Click a cell to hear the passage.','Deneysel CLAP ses–metin benzerliği (−1 ile 1); olasılık değildir. Yalnız örneklenen kesitler incelenir. Etiketler aday açıklamalara bağlıdır; dinleyicinin duygusunu veya enstrüman varlığını kesinleştirmez. Kesiti dinlemek için hücreye tıkla.')));
      const translations={'genre':'Tür','jazz':'Caz','classical':'Klasik','electronic':'Elektronik','folk':'Folk','country':'Country','mood':'Atmosfer','instrument':'Enstrüman adayı','voice':'Vokal adayı','calm':'Sakin','energetic':'Enerjik','sad':'Hüzünlü','happy':'Neşeli','dark':'Karanlık','romantic':'Romantik','tense':'Gergin','dreamy':'Düşsel','piano':'Piyano','acoustic guitar':'Akustik gitar','electric guitar':'Elektro gitar','bass guitar':'Bas gitar','drums':'Davul','trumpet':'Trompet','saxophone':'Saksafon','violin':'Keman','flute':'Flüt','organ':'Org','synthesizer':'Sentezleyici','harmonica':'Armonika','singing vocals':'Şarkı vokali','instrumental music without singing':'Vokalsiz müzik'};
      for(const group of r.groups){const section=node('section','ml-tag-section');section.append(node('h2','',t(group.id,translations[group.id]||group.id)));const ordered=[...group.labels].sort((a,b)=>b.mean-a.mean);if(ordered.length>1&&ordered[0].mean-ordered[1].mean<.03)section.append(node('p','ml-description',t('Weak separation between leading candidates; do not treat the first label as a conclusion.','Önde gelen adaylar arasındaki ayrım zayıf; ilk etiketi kesin sonuç kabul etme.')));const grid=node('div','ml-tag-grid');grid.style.setProperty('--tag-columns',r.segments.length);grid.append(node('span','',t('Candidate / mean','Aday / ortalama')));for(const segment of r.segments)grid.append(node('span','',clock(segment[0])+'–'+clock(segment[1])));
        for(const label of [...group.labels].sort((a,b)=>b.mean-a.mean).slice(0,3)){grid.append(node('strong','',t(label.id,translations[label.id]||label.id)+' · '+label.mean.toFixed(3)));label.segments.forEach((score,i)=>{const cell=button(score.toFixed(3),async()=>{audio.currentTime=r.segments[i][0];await audio.play();},'ml-tag-cell');cell.style.setProperty('--tag-fill',((score+1)*50).toFixed(2)+'%');cell.setAttribute('aria-label',t(label.id,translations[label.id]||label.id)+' '+clock(r.segments[i][0])+' '+score.toFixed(3));grid.append(cell);});}
        section.append(grid);results.append(section);
      }
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
    audio.addEventListener('timeupdate',()=>{repaint();if(previewA&&comparison&&audio.currentTime>=comparison.referenceRange[1])audio.pause();});audio.addEventListener('pause',()=>{previewA=false;});alternateReference.addEventListener('timeupdate',()=>{if(previewA&&comparison&&alternateReference.currentTime>=comparison.referenceRange[1])alternateReference.pause();});alternateReference.addEventListener('pause',()=>{previewA=false;});alternateReference.addEventListener('play',()=>document.querySelectorAll('audio,video').forEach(n=>{if(n!==alternateReference)n.pause();}));start.addEventListener('input',repaint);end.addEventListener('input',repaint);
    audio.addEventListener('play',()=>{blindAudio.pause();alternateReference.pause();compareAudio.pause();document.getElementById('mediaShelfAudio')?.pause();document.getElementById('playerVideo')?.pause();});
    audio.addEventListener('error',()=>message(t('Audio could not be played. Select the source again.','Ses oynatılamadı. Kaynağı yeniden seç.'),true));
    function cleanup(){if(state.closed)return;stopBlind();state.closed=true;onlinePanel.dispatchEvent(new Event('music-dispose'));clearTimeout(pollTimer);cancelAnimationFrame(animation);observer?.disconnect();audio.pause();alternateReference.pause();alternateReference.removeAttribute("src");alternateReference.load();compareAudio.pause();++compareToken;audio.removeAttribute('src');audio.load();compareAudio.removeAttribute('src');compareAudio.load();if(state.busy)void api('cancel').catch(()=>{});void api('release-remote').catch(()=>{});dialog.remove();if(instance===state)instance=null;if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();}
    dialog.addEventListener('close',cleanup,{once:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();cleanup();});
    dialog.showModal();if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();observer=new ResizeObserver(repaint);observer.observe(results);
    state.read=async()=>{const {job}=await api('status');return {open:true,source:state.source?{id:state.source.id,title:state.source.title,artist:state.source.artist,origin:state.source.origin||'local',excerptSeconds:state.source.excerptSeconds||null}:null,range:{start:Number(start.value),end:end.value?Number(end.value):null},job:{id:job.id,state:job.state,stage:job.stage,mode:job.mode,sourceMatches:!!state.source&&job.result?.sourceId===state.source.id,referenceMixMatches:!['search','online'].includes(job.mode)||state.mixVersion===state.submittedMixVersion},references:state.references.map(r=>({id:r.id,title:r.title,range:r.range})),hiddenTracks:state.hidden.slice(0,50),hiddenTrackCount:state.hidden.length,resultIntent:state.lastSearch?{description:state.lastSearch.intent||'',weight:state.lastSearch.intentWeight||0,diverse:state.lastSearch.diverse===true}:null,playlistDraft:state.playlistDraft||null,selectedMatches:[...selectedMatches],soundTags:state.tags||null,searchIntent:{description:intent.value,weight:Number(weight.value),diverse:diverse.checked},localMatches:state.matches||[],catalogMatches:onlinePanel.musicAgent.read(),modelReady:state.modelReady};};
    state.execute=async args=>{
     const op=args.operation;
     if(state.busy&&op!=='cancel')throw Error('Music analysis is busy');
     if(op==='choose_file')await select('select');
     else if(op==='select_library')await select('library',{id:args.library_id});
     else if(op==='cancel'){const {job}=await api('status');if(job.id!==args.job_id||job.state!=='running')throw Error('This exact music job is not running');await api('cancel');}
     else if(['add_reference','remove_reference','clear_references'].includes(op)){if(op==='clear_references')state.references=[];else if(op==='remove_reference'){if(!state.references.some(r=>r.id===args.source_id))throw Error('Unknown reference');state.references=state.references.filter(r=>r.id!==args.source_id||args.start!==undefined&&(r.range[0]!==args.start||r.range[1]!==args.end));}else{if(args.source_id!==state.source?.id)throw Error('The selected music source changed');if(args.start!==undefined){start.value=String(args.start);end.value=String(args.end);}addReference();return state.read();}invalidateMix();}
     else if(['hide_match','restore_match'].includes(op)){if(op==='hide_match'&&args.provider==='deezer'&&!onlinePanel.musicAgent.read().some(r=>r.id===args.track_id))throw Error('Unknown current catalog result');if(op==='hide_match'&&args.provider==='local'&&!state.matches?.some(r=>r.id===args.track_id))throw Error('Unknown music result');await feedback(args.provider,args.track_id,op==='hide_match');}
     else if(op==='set_music_intent'){intent.value=args.query||'';syncPreset();weight.value=String(args.weight??.35);diverse.checked=args.diverse===true;invalidateMix();}
     else if(op==='select_match'){if(!state.matches?.some(r=>r.id===args.track_id))throw Error('Unknown current match');const nodes=[...hits.querySelectorAll('.ml-hit')],at=state.matches.findIndex(r=>r.id===args.track_id),control=nodes[at]?.querySelector('.ml-match-select');if(!control)throw Error('Match selection unavailable');control.checked=args.selected!==false;control.dispatchEvent(new Event('change'));}
     else if(op==='propose_playlist')reviewPlaylist(args.name||'');
     else if(op==='prepare_model')await launch('prepare');
     else if(op==='rank_online'){if(args.source_id!==state.source?.id)throw Error('The selected music source changed');if(args.start!==undefined){start.value=String(args.start);end.value=String(args.end);}tab(false,true);await onlinePanel.musicAgent.execute(op,args);}
     else if(['select_online_match','use_online_reference','search_online','discover_online','save_discovery'].includes(op)){tab(false,true);await onlinePanel.musicAgent.execute(op,args);}
     else if(['analyze','find_local','analyze_tags'].includes(op)){
      if(args.source_id!==state.source?.id)throw Error('The selected music source changed');
      if(args.start!==undefined){start.value=String(args.start);end.value=String(args.end);}
      if(args.exclude_artist!==undefined)exclude.checked=args.exclude_artist;
      await launch(op==='analyze'?'analyze':op==='analyze_tags'?'tags':'search');
     }else throw Error('Unknown music operation');
     return state.read();
    };
    tab(false);void refreshModel().catch(e=>message(e.message,true));
    if(libraryId&&typeof libraryId==='object')void selectReference(libraryId).catch(e=>message(e.message,true));else if(libraryId)void select('library',{id:libraryId}).catch(e=>message(e.message,true));
    return dialog;
  }
  window.MusicAnalysisUI=Object.freeze({open,read:()=>instance?.read?instance.read():Promise.resolve({open:false}),execute:args=>{if(!instance?.execute)throw Error('Open music analysis first');return instance.execute(args);}});
})();
