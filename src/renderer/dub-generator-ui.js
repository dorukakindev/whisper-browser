(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const modal = el('dubGeneratorDialog');
  const inputColumn=document.createElement('div');inputColumn.className='dub-input-column';
  const sourceCard=modal.querySelector('.dub-source-card');sourceCard.before(inputColumn);
  inputColumn.append(sourceCard);
  el('voiceReferenceLocal').parentElement.append(el('voiceReferenceFolder'));

  // Elapsed time belongs to production details, not the always-visible action bar.
  const runDetails=modal.querySelector('.dub-run-details');
  runDetails.querySelector('.dub-run-details-body').prepend(modal.querySelector('.dub-job-meta>p'));
  runDetails.addEventListener('keydown',event=>{if(event.key==='Escape'&&runDetails.open){runDetails.open=false;runDetails.querySelector('summary').focus();event.preventDefault();event.stopPropagation();}});

  function fileName(id,value){const node=el(id);node.textContent=String(value||'');node.title=node.textContent;}
  let srt = '', cfg = null, current = null, output = null;
  let timer = null, logPath = null;
  let previousOutput=null,previousMedia=null,previousRangeEnd=null;
  let runtimePhases={},runtimeError='',runtimeMetrics=null,artifactOpenVersion=0;
  const cacheInfo=document.createElement('p');cacheInfo.id='dubCacheInfo';cacheInfo.dataset.uiUntranslated='';el('dubPhaseSummary').before(cacheInfo);
  const savedRecipe=document.createElement('details');savedRecipe.id='dubSavedRecipe';savedRecipe.className='dub-saved-recipe';savedRecipe.dataset.uiUntranslated='';el('dubPreviewCard').append(savedRecipe);
  const verificationSummary=document.createElement('p');verificationSummary.id='dubVerificationSummary';verificationSummary.className='hint';verificationSummary.dataset.uiUntranslated='';verificationSummary.hidden=true;el('dubNaturalReview').after(verificationSummary);
  const pronunciationAction=document.createElement('button');pronunciationAction.id='dubEditPronunciation';pronunciationAction.type='button';pronunciationAction.className='btn btn-ghost btn-sm';pronunciationAction.dataset.uiUntranslated='';pronunciationAction.hidden=true;el('dubQualityPronunciation').after(pronunciationAction);
  function runInfo(){
    const en=window.UiLocale?.get?.()==='en';cacheInfo.textContent=window.DubRunInfo.counts(runtimeMetrics,en);cacheInfo.hidden=!cacheInfo.textContent;
    const rows=window.DubRunInfo.recipe(output,en);savedRecipe.hidden=!rows.length;savedRecipe.replaceChildren();
    if(!rows.length)return;const summary=document.createElement('summary');summary.textContent=en?'Saved production recipe':'Kaydedilen üretim tarifi';const list=document.createElement('dl');
    for(const [label,value]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;list.append(dt,dd);}savedRecipe.append(summary,list);
  }
  document.addEventListener('ui-locale-change',runInfo);
  const activeGroups=new Map();
  function showActivity(){const en=window.UiLocale?.get?.()==='en';el('dubGeneratorActivity').replaceChildren(...[...activeGroups.values()].map(g=>{const node=document.createElement('span');node.className='dub-activity-chip';node.textContent=(en?'Group ':'Grup ')+g.group+' · '+(g.stage==='verification'?(en?'Text check':'Metin denetimi'):(en?'Speech':'Ses'))+' · '+(en?'attempt ':'deneme ')+g.attempt+' · '+Math.floor(g.elapsed)+(en?' s elapsed':' sn geçti')+' · '+(en?'timeout ':'zaman aşımı ')+g.limit+(en?' s':' sn');return node;}));if(activeGroups.size&&current&&!current.stopping)status(en?'Processing speech and text checks…':'Konuşma ve metin denetimleri işleniyor…');}
  let plan = null, edits = {}, planning = false;
  let backgroundSource = '', choosing = false, configSequence = 0;
  let deliverySource = '', resultMode = 'natural';
  let lastRequest = null, lastReferenceQuality = null, lastReferenceIdentity = null, referenceQualityPendingReset = false;
  const results = new Map();
  const resultOptions = new Map();
  let qualityFilter='all';
  const preparationActions=[];
  const filterBar=document.createElement('div');filterBar.className='dub-review-filters';filterBar.dataset.uiUntranslated='';filterBar.setAttribute('role','group');
  for(const kind of ['all','review','failed','ready']){const button=document.createElement('button');button.type='button';button.className='btn btn-ghost btn-sm';button.dataset.qualityFilter=kind;button.onclick=()=>{qualityFilter=kind;showResults();syncQualityPlan(false);};filterBar.append(button);}
  el('dubQualitySummary').after(filterBar);
  const previousFlagged=document.createElement('button');previousFlagged.id='dubPreviousFlagged';previousFlagged.dataset.uiUntranslated='';previousFlagged.type='button';previousFlagged.className='btn btn-ghost btn-sm';const navigation=document.createElement('div');navigation.className='dub-review-navigation';el('dubNextFlagged').before(navigation);navigation.append(previousFlagged,el('dubNextFlagged'));
  const qualityRows=()=>[...results.values()].sort((a,b)=>a.group-b.group).filter(row=>qualityFilter==='all'||row.status===qualityFilter);
  function selectQuality(key){if(!resultOptions.has(key)){qualityFilter='all';showResults();}el('dubQualityGroup').value=key;el('dubQualityGroup').dispatchEvent(new Event('change'));}
  function navigateFlagged(direction){if(current||planning||referenceBusy||choosing||workspaceBusy)return;const rows=[...results.values()].sort((a,b)=>a.group-b.group),at=rows.findIndex(row=>row.key===el('dubQualityGroup').value);for(let offset=1;offset<=rows.length;offset++){const row=rows[((at<0?(direction<0?0:-1):at)+direction*offset+rows.length*2)%rows.length];if(row.status!=='ready'){selectQuality(row.key);break;}}}

  const t = text => window.UiLocale?.t(text) || text;
  const qualityWarning=file=>file?.qualityIncomplete?(window.UiLocale?.get?.()==='en'?'Audio is available, but some quality groups are missing. Listen before attaching it to the video.':'Ses hazır; bazı grupların kalite bilgisi eksik. Videoya bağlamadan önce dinleyin.') :t('Ses hazır; kalite raporu okunamadı. Videoya bağlamadan önce sesi dinleyin.');
  const presetSpecs = {
    Balanced: {profile:'quality', concurrency:'4', grouping:'akici', verification:'balanced', timingMode:'video', naturalSpeech:true, autoFit:true},
    Fast: {profile:'fast', concurrency:'4', grouping:'akici', verification:'fast', timingMode:'video', naturalSpeech:false, autoFit:false},
    Careful: {profile:'quality', concurrency:'4', grouping:'akici', verification:'detailed', timingMode:'video', naturalSpeech:true, autoFit:true},
  };
  function generationError(value) {
    const message=String(value||'');
    if(!/(?:GPU memory busy|KV cache calculation|no safe memory budget|CUDA.{0,30}out of memory|CUDA OOM)/i.test(message))return message;
    const advice=window.UiLocale?.get?.()==='en'
      ? 'A safe GPU memory budget could not be allocated. Finish another GPU job or close a GPU-heavy application, then retry with fewer parallel groups. Changing the voice reference is not required.'
      : 'GPU için güvenli bellek bütçesi ayrılamadı. Diğer GPU işinin bitmesini bekleyin veya GPU kullanan ağır uygulamayı kapatıp daha az paralel grupla yeniden deneyin. Referans sesi değiştirmeniz gerekmiyor.';
    return advice+'\n\n'+message;
  }
  function runtimeLabels(){const en=window.UiLocale?.get?.()==='en';el('dubKeepEngineLabel').textContent=en?'Keep the engine ready for 60 seconds after production':'Üretimden sonra motoru 60 saniye hazır tut';el('dubRuntimeHint').textContent=en?'GPU memory determines actual parallel capacity. Disabling keep-ready releases the previous engine when the next job starts; an idle engine closes automatically.':'Gerçek paralellik GPU belleğine göre belirlenir. Hazır tutmayı kapatınca önceki motor sonraki iş başlarken bırakılır; boşta kalan motor otomatik kapanır.';phaseSummary(runtimePhases);if(runtimeError)el('dubGeneratorDetails').textContent=generationError(runtimeError);}
  function phaseSummary(phases){runtimePhases=phases;const en=window.UiLocale?.get?.()==='en',labels={model_load:en?'Model':'Model',reference:en?'Reference':'Referans',synthesis:en?'Speech':'Ses',verification:en?'Verification':'Doğrulama',text_edit:en?'Text editing':'Metin düzenleme',placement:en?'Timing':'Zamanlama',normalization:en?'Loudness':'Ses dengeleme',file_write:en?'File writing':'Dosya yazımı',wall:en?'Total elapsed':'Geçen toplam'};el('dubPhaseSummary').textContent=Object.entries(labels).filter(([key])=>Number.isFinite(phases[key+'_seconds'])).map(([key,label])=>label+': '+phases[key+'_seconds'].toFixed(1)+' '+(en?'s':'sn')).join(' · ');}
  runtimeLabels();document.addEventListener('ui-locale-change',runtimeLabels);
  function editorProviderHint(){
    const node=el('dubEditorProviderHint');if(!node)return;
    const model=el('translateModel')?.value?.trim(),en=window.UiLocale?.get?.()==='en';
    node.textContent=(en?'Text editing uses the translation model, independently of the assistant: ':'Metin düzenlemesi asistandan bağımsız olarak çeviri modelini kullanır: ')+(model||(en?'not configured':'ayarlanmadı'));
  }
  el('translateModel')?.addEventListener('input',editorProviderHint);
  el('translateModel')?.addEventListener('change',editorProviderHint);
  document.addEventListener('ui-locale-change',editorProviderHint);
  const decodingInfo=document.createElement('p');decodingInfo.id='dubPlanDecoding';decodingInfo.className='dub-dictionary-preview';decodingInfo.hidden=true;decodingInfo.dataset.uiUntranslated='';el('dubPlanPrepare').parentElement.after(decodingInfo);
  function naturalOverview() {
    const en=window.UiLocale?.get?.()==='en', submitted=current?.settings;
    for(const node of modal.querySelectorAll('[data-tr][data-en]')){node.dataset.uiUntranslated='';node.textContent=en?node.dataset.en:node.dataset.tr;}
    const recommended=(submitted?.resultMode||resultMode)==='natural';
    el('dubNaturalTitle').textContent=recommended?(en?'Natural dubbing (recommended)':'Doğal dublaj (önerilen)'):(en?'Custom settings':'Özel ayarlar');
    el('dubNaturalSummary').textContent=en?'Your subtitles are prepared with the selected voice.':'Altyazı, seçtiğiniz sesle hazırlanır.';
    el('dubNaturalState').textContent=recommended?(en?'Your selected voice and text are preserved.':'Seçtiğiniz ses ve metin korunur.'):(en?'Your custom production choices are active.':'Özel üretim seçimleriniz etkin.');
    el('dubNaturalRecommend').hidden=recommended;el('dubNaturalRecommend').disabled=!!current||planning||choosing||referenceBusy||workspaceBusy;
    el('dubNaturalRecommend').textContent=en?'Use natural dubbing':'Doğal dublajı kullan';
    const follows=submitted?.followDelivery??el('dubFollowDelivery').checked;
    el('dubNaturalDelivery').textContent=recommended&&!follows?(en?'Source delivery is followed automatically when usable audio is available; otherwise the selected voice is preserved.':'Kaynak uygunsa söyleyiş otomatik izlenir; değilse seçilen ses korunur.'):follows?(en?'Source delivery analysis is requested and needs usable source audio. Unclear sections keep the reference tone.':'Kaynak anlatımı analizi istendi; uygun kaynak sesi gerekir. Belirsiz bölümlerde referans tonu korunur.'):(en?'Source delivery analysis is off. The reference voice guides the tone; source emotion is not being transferred.':'Kaynak anlatımı analizi kapalı. Tonu referans ses belirler; kaynaktaki duygu aktarılmaz.');
    el('dubNaturalReview').textContent=window.DubRunInfo?.speechResult?.(output,en)||(en?'You can listen or compare individual groups if you want to review the result.':'İsterseniz sonucu dinleyebilir veya tek tek grupları karşılaştırabilirsiniz.');
    verificationSummary.textContent=window.DubRunInfo?.verificationSummary?.(output,en)||'';verificationSummary.hidden=!verificationSummary.textContent;
    el('dubNaturalReviewOpen').textContent=en?'Review groups and compare takes':'Grupları dinle ve kayıtları karşılaştır';
    el('dubNaturalReviewOpen').disabled=!!current||!results.size;
  }
  function refreshOverview() {
    modal.dataset.running=String(!!current);
    editorProviderHint();naturalOverview();
    const decoding=plan?.sourceDecoding;decodingInfo.hidden=!decoding;decodingInfo.textContent=decoding?(window.UiLocale?.get?.()==='en'?'Text read using '+decoding.encoding+(decoding.repaired?' · automatic text repair applied':'')+'. Check characters before generating speech. Source file unchanged.':'Metin '+decoding.encoding+' ile okundu'+(decoding.repaired?' · otomatik metin onarımı uygulandı':'')+'. Ses üretmeden önce harfleri kontrol et. Kaynak dosya değiştirilmedi.'):'';
    for(const id of ['dubSrtName','dubGeneratedName','dubVoiceName']){const node=el(id);if(node)node.title=node.textContent;}
    const notice=el('dubInputNotice');
    if(notice){const partial=/\.partial\.srt$/i.test(srt);notice.hidden=!partial;notice.textContent=partial?(window.UiLocale?.get?.()==='en'?'This is a partial translation. Untranslated lines may be read in their original language; complete the translation for consistent dubbing.':'Bu kısmi bir çeviri. Çevrilmeyen satırlar özgün dilinde okunabilir; tutarlı dublaj için önce çeviriyi tamamlayın.'):'';}
    for(const {button,kind}of preparationActions){button.disabled=!!current||planning||referenceBusy||choosing||workspaceBusy;button.title=kind==='source'?(window.UiLocale?.get?.()==='en'?'Choose or change subtitles':'Altyazı seç veya değiştir'):kind==='voice'?(window.UiLocale?.get?.()==='en'?'Go to reference voice':'Referans sese git'):(window.UiLocale?.get?.()==='en'?'Scope and short preview':'Kapsam ve kısa örnek');}
    const source = el('dubReadySource'), voice = el('dubReadyVoice'), range = el('dubReadyRange');
    source.textContent = srt ? basename(srt) : t('SRT seçilmedi'); source.dataset.ready = String(!!srt);
    const activeVoice=current?.voice||cfg;
    const currentVoice=el('dubCurrentVoiceName'),currentVoiceHint=el('dubCurrentVoiceHint');
    currentVoice.textContent=activeVoice?.reference?basename(activeVoice.reference):(window.UiLocale?.get?.()==='en'?'Choose a voice':'Ses seçin');
    currentVoice.title=currentVoice.textContent;
    currentVoiceHint.textContent=activeVoice?.reference?(window.UiLocale?.get?.()==='en'?'This voice will be used. Change it only if you want a different narrator.':'Bu ses kullanılacak. Yalnız farklı bir anlatıcı istiyorsanız değiştirin.'):(window.UiLocale?.get?.()==='en'?'Add a local recording or choose a saved reference.':'Yerel bir kayıt ekleyin veya kayıtlı referans seçin.');

    voice.textContent = activeVoice?.reference ? basename(activeVoice.reference) : t('Ses seçilmedi'); voice.dataset.ready = String(!!current||!!cfg?.ready);
    source.title=source.textContent;voice.title=voice.textContent;
    const en=window.UiLocale?.get?.()==='en', submitted=current?.settings;
    const grouping={anlatim:en?'Sentence flow':'Cümle akışı',akici:en?'Flowing blocks':'Akıcı bloklar',cumle:en?'Sentence groups':'Cümle grupları',satir:en?'Subtitle rows':'Altyazı satırları'}[submitted?.grouping||el('dubGrouping').value];
    const verification={fast:en?'Audio checks':'Ses denetimi',balanced:en?'Selective text checks':'Seçili metin denetimi',detailed:en?'Full text checks':'Tam metin denetimi'}[submitted?.verification||el('dubVerification').value];
    const timing=(submitted?.timingMode||el('dubTimingMode').value)==='video'?(en?'Keep full speech':'Konuşmayı koru'):(en?'Fixed video; overflow may be cut':'Sabit video; taşan ses kesilebilir');
    el('dubReadySettings').textContent=[grouping,((submitted?.profile||el('dubProfile').value)==='fast'?10:15)+(en?' steps':' adım'),verification,timing,(en?'Requested parallel groups: ':'İstenen paralel grup: ')+(submitted?.concurrency||el('dubConcurrency').value)].join(' · ');
    const format=seconds=>{const ms=Math.round(seconds*1000),rest=(ms%60000)/1000;return `${Math.floor(ms/60000)}:${rest<10?'0':''}${rest}`;};
    range.textContent = submitted ? (submitted.range ? `${format(submitted.range.start)} → ${format(submitted.range.end)}` : t('Altyazının tamamı')) : !el('dubRangeEnabled').checked ? t('Altyazının tamamı') : `${el('dubRangeStart').value} → ${el('dubRangeEnd').value}`;
    let selected = '';
    for (const [name, settings] of Object.entries(presetSpecs)) {
      const matches = Object.entries(settings).every(([key,value]) => typeof value === 'boolean'
        ? el(`dub${key[0].toUpperCase()}${key.slice(1)}`).checked === value
        : el(`dub${key[0].toUpperCase()}${key.slice(1)}`).value === value);
      el(`dubPreset${name}`).setAttribute('aria-pressed', String(matches));
      if (matches) selected = name;
    }
    el('dubPresetSummary').textContent = t(selected === 'Fast' ? 'Hızlı profil: AI düzenlemesi kapalı; ses denetimiyle kısa bekleme.'
      : selected === 'Careful' ? 'Ayrıntılı profil: bütün parçalar metin denetiminden geçer; daha uzun sürer.'
      : selected === 'Balanced' ? 'Dengeli profil: akıcı bloklar, 15 adım ve konuşmayı koruyan zamanlama.'
      : 'Özel ayarlar etkin. Hazır profiller sesinizi ve seçili aralığı değiştirmez.');
  }
  const reviewHeadline=document.createElement('p');reviewHeadline.className='dub-review-headline';reviewHeadline.dataset.uiUntranslated='';reviewHeadline.hidden=true;el('dubQualityInfo').after(reviewHeadline);
  const readabilityNote=document.createElement('p');readabilityNote.className='dub-readability-note';readabilityNote.dataset.uiUntranslated='';el('dubPlanText').after(readabilityNote);
  function readablePreview(){const data=window.DubExperienceModel?.readability(el('dubPlanText').value),en=window.UiLocale?.get?.()==='en';readabilityNote.hidden=!data?.words;if(!data?.words)return;readabilityNote.textContent=(en?`${data.words} words · longest sentence ${data.longestSentence} words.`:`${data.words} sözcük · en uzun cümle ${data.longestSentence} sözcük.`)+(data.long?(en?' Long sentence: listen for breath and clarity.':' Uzun cümle: nefes ve anlaşılırlığı dinleyerek kontrol edin.'):data.fragment?(en?' Short unfinished fragment: sentence-flow grouping may help.':' Kısa yarım ifade: cümle akışı gruplaması yardımcı olabilir.'):'')+(en?' Text is unchanged; this is a reading cue, not a quality score.':' Metin değiştirilmez; bu bir okuma ipucu, kalite puanı değildir.');}
  el('dubPlanText').addEventListener('input',readablePreview);document.addEventListener('ui-locale-change',readablePreview);
  for(const [id,kind]of [['dubReadySource','source'],['dubReadyVoice','voice'],['dubReadyRange','scope']]){
    const box=el(id).parentElement,button=document.createElement('button');
    button.type='button';button.className='dub-readiness-action';button.append(...box.childNodes);box.append(button);preparationActions.push({button,kind});
    button.addEventListener('click',()=>{
      if(current||planning||referenceBusy||choosing||workspaceBusy)return;
      if(kind==='source'){el('dubChooseSrt').click();return;}
      const target=el(kind==='voice'?(el('voiceReferenceLibrary')?.hidden?'voiceReferenceLocal':'voiceReferenceSelect'):'dubSampleOnly');
      for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
      target.scrollIntoView?.({block:'center',behavior:'auto'});target.focus({preventScroll:true});
    });
  }
  function qualityInfo() {
    Promise.resolve().then(()=>window.dispatchEvent(new Event('dub-takes:context')));
    const row = results.get(el('dubQualityGroup').value);
    const labels = {ready:'Hazır',review:'Dinleyerek kontrol edin',failed:'Üretilemedi; bu bölüm sessiz',
      passed:'Metin doğrulandı',not_checked:'Metin denetlenmedi',unavailable:'Metin doğrulanamadı'};
    el('dubQualityInfo').textContent = row ? [...new Set([t(labels[row.status]), t(labels[row.verification?.status] || 'Metin denetlenmedi'),
      row.rewritten ? t('Süreye göre düzenlendi') : row.naturalEdited ? t('Doğal konuşma için düzenlendi') : ''].filter(Boolean))].join(' · ') : '';
    const evidence=el('dubQualityEvidence');evidence.hidden=!row;
    const previous=previousOutput?.quality?.groups?.find(value=>value.key===row?.key);
    el('dubListenPrevious').hidden=!!current||!output||!previousOutput||previousMedia!==mediaIdentity()||previousOutput.url===output.url||!Number.isFinite(previous?.audioStart)||!Number.isFinite(previous?.audioEnd)||previous.audioEnd<=previous.audioStart;
    el('dubListenPrevious').textContent=window.UiLocale?.get?.()==='en'?'Listen to previous group':'Önceki grubu dinle';
    const currentButton=el('dubListenCurrent');if(currentButton)currentButton.textContent=el('dubListenPrevious').hidden?t('Bu grubu dinle'):(window.UiLocale?.get?.()==='en'?'Listen to new group':'Yeni grubu dinle');
    const en=window.UiLocale?.get?.()==='en';
    el('dubQualityEvidenceTitle').textContent=row?.status==='review'||row?.status==='failed' ? (en?'Why is this group flagged?':'Bu grup neden işaretlendi?') : (en?'Check details':'Kontrol ayrıntıları');
    const v=row?.verification||{},reasons=[];
    const primary=verificationReasons(row,en)[0];reviewHeadline.hidden=!row||row.status==='ready';
    reviewHeadline.textContent=row?.status==='failed'?(en?'This group has no generated speech. Regenerate it to fill the silence.':'Bu grupta üretilmiş konuşma yok. Sessizliği tamamlamak için yeniden üretin.'):
      (primary?(en?'Listen for: ':'Dinlerken kontrol et: ')+primary.replace(/[.!?]$/,'')+'.':(en?'Listen to this group before changing it.':'Değiştirmeden önce bu grubu dinleyin.'))+
      (en?' Automatic text recognition can mishear speech; this flag does not confirm an error.':' Otomatik döküm konuşmayı yanlış duyabilir; bu işaret kesin hata anlamına gelmez.');
    const recognized=typeof v.recognizedText==='string'?v.recognizedText.slice(0,8000):'';
    el('dubQualityExpectedLabel').textContent=en?'Expected text':'Beklenen metin';
    el('dubQualityRecognized').hidden=!recognized;
    el('dubQualityRecognizedLabel').textContent=en?'Automatic transcript (ASR) — may contain recognition errors':'Otomatik döküm (ASR) — tanıma hatası içerebilir';
    el('dubQualityRecognizedText').textContent=recognized;
    const similarity=Number.isFinite(v.similarity)&&v.similarity>=0&&v.similarity<=1 ? Math.round(v.similarity*100) : null;
    el('dubQualitySimilarity').textContent=recognized&&similarity!==null ? (en?`Text match (ASR): ${similarity}% · Not a naturalness score.`:`Metin eşleşmesi (ASR): %${similarity} · Doğallık puanı değildir.`) : '';

    reasons.push(...verificationReasons(row,en));
    el('dubQualityReasons').textContent=reasons.length?reasons.join(' · ')+(en?' — Automatic checks can be wrong; listen before editing.':' — Otomatik kontroller yanılabilir; düzenlemeden önce dinle.'):row?.status==='review'?(en?'Acoustic or verification check needs listening.':'Ses veya doğrulama kontrolü dinleme gerektiriyor.'):(v.status==='passed' ? (en?'No issue flagged by these checks. This is not a naturalness score.':'Bu kontrollerde işaret yok. Bu bir doğallık puanı değildir.') : (en?'No text comparison is available. Listen before judging completeness or pronunciation.':'Metin karşılaştırması mevcut değil. Eksiksizlik ve telaffuz için dinleyerek kontrol edin.'));
    el('dubQualityExpected').textContent=String(row?.text||row?.displayText||'').slice(0,8000);
    const pronunciation=typeof row?.pronunciationText==='string'?row.pronunciationText.slice(0,8000):'';
    el('dubQualityPronunciation').hidden=!pronunciation||pronunciation===row?.text;
    el('dubQualityPronunciation').textContent=pronunciation?(en?'Pronunciation used for synthesis: ':'Üretimde kullanılan okunuş: ')+pronunciation:'';
    pronunciationAction.hidden=!row||!v.missing_names?.length;pronunciationAction.disabled=!!current||planning||referenceBusy||choosing||workspaceBusy;
    pronunciationAction.textContent=en?'Edit name pronunciation':'Adın okunuşunu düzenle';
  }
  function showResults() {
    const select = el('dubQualityGroup'), previous = select.value;
    if(!results.size)qualityFilter='all';
    select.replaceChildren(); resultOptions.clear();
    for (const row of qualityRows()) {
      const option = document.createElement('option'); option.value = row.key;
      option.textContent = `${row.group} · ${t(row.status === 'failed' ? 'Üretilemedi; bu bölüm sessiz' : row.status === 'review' ? 'Dinleyerek kontrol edin' : 'Hazır')}`;
      option.title=verificationReasons(row,window.UiLocale?.get?.()==='en').join(' · ');
      select.append(option);
      resultOptions.set(row.key, option);
    }
    if (resultOptions.has(previous)) select.value = previous;
    else {const flagged=qualityRows().find(row=>row.status!=='ready');if(flagged)select.value=flagged.key;}
    if(!select.options.length&&results.size){const empty=document.createElement('option');empty.value='';empty.textContent=window.UiLocale?.get?.()==='en'?'No groups in this filter':'Bu filtrede grup yok';empty.disabled=true;select.append(empty);}
    qualitySummary();
    qualityInfo();
    controls();
  }
  function updateResult(row) {
    results.set(row.key, row);
    if(qualityFilter!=='all'){showResults();return;}
    let option = resultOptions.get(row.key);
    if (!option) { option = document.createElement('option'); option.value = row.key;
      el('dubQualityGroup').append(option); resultOptions.set(row.key, option); }
    option.textContent = `${row.group} · ${t(row.status === 'failed' ? 'Üretilemedi; bu bölüm sessiz' : row.status === 'review' ? 'Dinleyerek kontrol edin' : 'Hazır')}`;
    qualitySummary();
    qualityInfo();
  }
  function qualitySummary(){
    const en=window.UiLocale?.get?.()==='en',rows=[...results.values()],counts={ready:0,review:0,failed:0};
    for(const row of rows)if(Object.hasOwn(counts,row.status))counts[row.status]++;
    const node=el('dubQualitySummary');node.hidden=!rows.length;
    node.replaceChildren(...Object.entries(counts).map(([kind,count])=>{const chip=document.createElement('span');chip.dataset.state=kind;chip.textContent=count+' '+({ready:en?'ready':'hazır',review:en?'to review':'inceleme',failed:en?'failed':'üretilemedi'}[kind]);return chip;}));
    el('dubNextFlagged').textContent=en?'Next flagged group':'Sonraki işaretli grup';
    el('dubEditSelected').textContent=en?'Edit group text':'Metni düzenle';
    el('dubEditSelected').disabled=!!current||planning||referenceBusy||choosing||workspaceBusy||!results.size;
    el('dubPhaseHint').textContent=en?'Speech and verification times add parallel work across groups; they can exceed elapsed time.':'Ses ve doğrulama süreleri paralel gruplardaki işlerin toplamıdır; geçen süreden uzun olabilir.';
    el('dubOpenQuality').textContent=(en?'Review groups':'Grupları kontrol et')+(counts.review+counts.failed?' · '+(counts.review+counts.failed):'');
    el('dubOpenQuality').hidden=!rows.length;
    el('dubNextFlagged').disabled=previousFlagged.disabled=!!current||planning||referenceBusy||choosing||workspaceBusy||!(counts.review+counts.failed);
    previousFlagged.textContent=en?'Previous flagged group':'Önceki işaretli grup';
    for(const button of filterBar.children){const key=button.dataset.qualityFilter;button.textContent=({all:en?'All':'Tümü',review:en?'Review':'İnceleme',failed:en?'Failed':'Üretilemedi',ready:en?'Ready':'Hazır'}[key])+' · '+(key==='all'?rows.length:counts[key]);button.setAttribute('aria-pressed',String(key===qualityFilter));button.disabled=!!current||planning||referenceBusy||choosing||workspaceBusy;}

  }
  function referenceInfo(quality) {
    lastReferenceQuality = quality;
    lastReferenceIdentity = quality ? current?.voice?.reference || cfg?.reference || null : null;
    const labels = {quiet:'Referans sesi çok kısık',clipping:'Referansta ses patlaması var',silence:'Referansta uzun sessizlik var',short:'Referans çok kısa'};
    el('dubReferenceQuality').textContent = quality ? (quality.warnings || []).map(w => w==='downmix-cancellation'?(window.UiLocale?.get?.()==='en'?'Stereo channels cancel when mixed to mono; choose a clearer reference.':'Stereo kanallar mono karışımda birbirini zayıflatıyor; daha net bir referans seçin.'):t(labels[w] || w)).join(' · ') || t('Referansın ses düzeyi uygun; konuşmacı ve müziği dinleyerek kontrol edin.') : '';
  }
  const mediaIdentity = () => { const c = window.BrowserDubAudioUI?.context(); return JSON.stringify([c?.mode, c?.tabId, c?.mediaId || c?.mediaKey]); };
  // Persistent media identity permits intentional reuse after reload; in-flight requests do not.
  const requestIdentity = () => { const c=window.BrowserDubAudioUI?.context(); return JSON.stringify([mediaIdentity(),c?.generation]); };
  let workspaceBusy = false, referenceBusy = false, rangeContextKey = null, mediaContextKey = null;
  const group = () => plan?.groups[Number(el('dubPlanGroup').value)];
  function timecode(value) {
    const text = value.trim();
    if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(text)) throw new Error('Geçersiz zaman aralığı.');
    return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  function syncQualityPlan(openEditor=false){const key=el('dubQualityGroup').value,index=plan?.groups.findIndex(g=>g.key===key);if(!(index>=0))return;el('dubPlanGroup').value=String(index);showGroup();if(openEditor){for(let node=el('dubPlanText');node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;el('dubPlanText').focus();el('dubPlanText').scrollIntoView?.({block:'center'});}}
  function selectedRange() {
    if (!el('dubRangeEnabled').checked) return null;
    const range = { start: timecode(el('dubRangeStart').value), end: timecode(el('dubRangeEnd').value) };
    if (range.end <= range.start || range.end > 86400) throw new Error('Geçersiz zaman aralığı.');
    return range;
  }
  const pronunciationNote=document.createElement('p');pronunciationNote.id='dubPlanPronunciationPreview';pronunciationNote.className='dub-pronunciation-preview';pronunciationNote.dataset.uiUntranslated='';pronunciationNote.hidden=true;el('dubPlanText').after(pronunciationNote);
  function previewPronunciation(){const text=el('dubPlanText').value;let rendered=text;try{rendered=window.DubPronunciation?.apply(text,cfg?.pronunciations||[])||text;}catch{}pronunciationNote.hidden=!text||rendered===text;pronunciationNote.textContent=(window.UiLocale?.get?.()==='en'?'Saved dictionary preview (speech only): ':'Kayıtlı sözlük önizlemesi (yalnız ses): ')+rendered;}
  el('dubPlanText').addEventListener('input',previewPronunciation);
  function showGroup() {
    queueMicrotask(readablePreview);
    const g = group();
    el('dubPlanOriginal').value = g?.text || '';
    el('dubPlanText').value = g ? (edits[g.key] || g.text) : '';
    previewPronunciation();
    el('dubPlanInfo').textContent = g ? `${(g.start / 1000).toFixed(2)}–${(g.end / 1000).toFixed(2)} s · ${g.seconds.toFixed(2)} s · ${Object.keys(edits).length} ✓` : '';
  }
  function elapsed(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    el('dubGeneratorElapsed').textContent = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function stopTimer(seconds) {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (Number.isFinite(seconds)) elapsed(seconds);
  }
  const status = text => { el('dubGeneratorStatus').textContent = text; };
  const basename = name => String(name || '').split(/[\\/]/).pop();
  const flaggedKeys = () => [...results.values()].filter(row => row.status === 'failed' || row.status === 'review').map(row => row.key);
  function retryLabel() {
    const count=flaggedKeys().length,en=window.UiLocale?.get?.()==='en',button=el('dubRetryFailed');
    button.textContent=count ? (en ? `Regenerate flagged groups · ${count}` : `İşaretli grupları yeniden üret · ${count}`) : t('Eksik parçaları tamamla');
    button.title=count ? (en ? 'Only flagged groups are regenerated. Ready groups stay cached; the previous generation settings are used.' : 'Yalnız işaretli gruplar yeniden üretilir. Hazır gruplar önbellekte korunur; önceki üretim ayarları kullanılır.') : (en ? 'Resume missing audio using the previous generation settings. Completed groups stay cached.' : 'Önceki üretim ayarlarıyla eksik sesleri tamamlar. Hazır gruplar önbellekte korunur.');
  }
  const rangeNote=document.createElement('p');rangeNote.id='dubRangeOrigin';rangeNote.className='dub-range-origin';rangeNote.dataset.uiUntranslated='';rangeNote.hidden=true;el('dubRangeEnd').closest('.dub-generator-row').after(rangeNote);
  function controls() {
    retryLabel();
    const inherited=window.BrowserDubAudioUI?.context()?.subtitleRange;let matches=false;try{matches=!!inherited&&el('dubRangeEnabled').checked&&timecode(el('dubRangeStart').value)===inherited.start&&timecode(el('dubRangeEnd').value)===inherited.end;}catch{}rangeNote.hidden=!matches;rangeNote.textContent=window.UiLocale?.get?.()==='en'?'Range inherited from the current subtitle.':'Aralık güncel altyazıdan alındı.';
    previewPronunciation();
    qualitySummary();
    const voice = current?.voice || cfg;
    el('dubEngineName').textContent = voice?.engine || '';
    fileName('dubVoiceName',basename(voice?.reference || ''));
    el('dubTranscriptName').textContent = basename(voice?.transcript || '');
    if (!current && (referenceQualityPendingReset || lastReferenceQuality && lastReferenceIdentity !== cfg?.reference)) { referenceInfo(null); referenceQualityPendingReset=false; }
    const locked = !!current || referenceBusy || planning || choosing || workspaceBusy;
    el('dubGeneratorUse').disabled = locked;
    for (const id of ['dubChooseSrt', 'dubChooseEngine', 'dubChooseVoice', 'dubChooseTranscript', 'dubSampleOnly', 'dubProfile', 'dubConcurrency', 'dubKeepEngine', 'dubTimingMode', 'dubVerification', 'dubAutoFit', 'dubNaturalSpeech']) el(id).disabled = locked;
    el('dubGrouping').disabled = locked;
    el('dubFollowDelivery').disabled = locked;
    el('dubDeliveryStrength').disabled = locked || !el('dubFollowDelivery').checked;
    el('dubChooseDeliverySource').disabled = el('dubResetDeliverySource').disabled = locked || !el('dubFollowDelivery').checked;
    el('dubExpression').disabled = locked || el('dubFollowDelivery').checked;
    el('dubRetryFailed').disabled = locked || !lastRequest || !cfg?.ready;
    el('dubRegenerateGroup').disabled = locked || !lastRequest || !results.size || !cfg?.ready;
    if(el('dubSaveRegenerate'))el('dubSaveRegenerate').disabled=locked||!lastRequest||!plan||!cfg?.ready;
    el('dubQualityGroup').disabled = locked || !el('dubQualityGroup').value;
    el('dubGeneratorStart').disabled = locked || !srt || !cfg?.ready;
    const requirement=el('dubStartRequirement'),en=window.UiLocale?.get?.()==='en';
    if(requirement){requirement.hidden=locked||!!srt&&!!cfg?.ready;requirement.textContent=!srt&&!cfg?.ready?(en?'Choose subtitles and an active voice to begin.':'Başlamak için altyazı ve etkin ses seçin.'):!srt?(en?'Choose an SRT subtitle file to begin.':'Başlamak için SRT altyazısı seçin.'):(en?'Choose an active reference voice to begin.':'Başlamak için etkin referans ses seçin.');}

    el('dubPlanPrepare').disabled = locked || !srt;
    for (const id of ['dubPlanGroup', 'dubPlanText', 'dubPlanShorten', 'dubPlanApply', 'dubPlanReset']) el(id).disabled = locked || !plan;
    el('dubChooseSrt').disabled = locked;
    el('dubKeepBackground').disabled = locked;
    for (const id of ['dubChooseBackground','dubBackgroundReset']) el(id).disabled = locked || !el('dubKeepBackground').checked;
    el('dubRangeEnabled').disabled = locked;
    for (const id of ['dubRangeStart', 'dubRangeEnd', 'dubRangeNow']) el(id).disabled = locked || !el('dubRangeEnabled').checked;
    el('dubGeneratorCancel').disabled = !current;
    el('dubTextStudio').disabled = locked; el('dubListenPrevious').disabled=locked;
    el('dubPronunciations').disabled = locked||pronunciationLoading; el('dubPronunciationSave').disabled = locked||pronunciationLoading || (el('dubPronunciationScope').value==='source'&&!srt);el('dubPronunciationScope').disabled=locked||pronunciationLoading;
    for (const name of Object.keys(presetSpecs)) el(`dubPreset${name}`).disabled = locked;
    refreshOverview();
    window.dispatchEvent(new CustomEvent('dub-generator:busy',{detail:!!current||referenceBusy||planning||choosing}));
    window.dispatchEvent(new Event('dub-takes:context'));
    el('browserDubGenerate')?.classList.toggle('active', !!current);
  }
  const pronunciationLabels = () => {
    const en = document.documentElement.lang !== 'tr';
    el('dubPronunciationTitle').textContent = en ? 'Pronunciation dictionary' : 'Telaffuz sözlüğü';
    el('dubPronunciationScopeLabel').textContent=en?'Apply to':'Kullanım alanı';
    el('dubPronunciationScope').options[0].textContent=en?'This video / subtitle':'Bu video / altyazı';el('dubPronunciationScope').options[1].textContent=en?'Global dictionary':'Genel sözlük';
    el('dubPronunciationHelp').textContent = en ? 'One case-sensitive entry per line: Newton = Nyutın. Applies only to speech; subtitles stay unchanged.' : 'Her satıra bir eşleşme: Newton = Nyutın. Büyük/küçük harf duyarlıdır. Yalnız üretilen sese uygulanır; altyazı değişmez.';
    el('dubPronunciationSave').textContent = el('dubPronunciationScope').value==='source'?(en?'Save for this source':'Bu kaynağa kaydet'):(en?'Save global dictionary':'Genel sözlüğü kaydet');
    if (el('dubPronunciationStatus').dataset.saved) el('dubPronunciationStatus').textContent=en?'Saved. Applies to the next generation.':'Kaydedildi. Sonraki ses üretiminde uygulanır.';
  };
  let pronunciationSequence=0,pronunciationLoading=false;
  const pronunciationSource=()=>{const c=window.BrowserDubAudioUI?.context();return c?.source||c?.mediaKey||'';};
  async function loadPronunciations(preserveDraft=false){
    const sequence=++pronunciationSequence,selected=srt,scope=el('dubPronunciationScope').value,source=pronunciationSource();
    pronunciationLoading=false;
    pronunciationLabels();delete el('dubPronunciationStatus').dataset.saved;
    if(!cfg)return;
    if(scope==='global'){
      cfg.pronunciations=cfg.globalPronunciations||[];if(!preserveDraft)el('dubPronunciations').value=cfg.pronunciations.map(row=>`${row.from} = ${row.to}`).join('\n');el('dubPronunciationStatus').textContent='';previewPronunciation();controls();return;
    }
    if(!preserveDraft)el('dubPronunciations').value='';cfg.pronunciations=cfg.globalPronunciations||[];previewPronunciation();controls();
    if(!selected){el('dubPronunciationStatus').textContent=window.UiLocale?.get?.()==='en'?'Choose subtitles first.':'Önce altyazı seçin.';return;}
    pronunciationLoading=true;controls();
    try{
      const result=await window.api.saveDubPronunciations({action:'get',srt:selected,source});
      if(sequence!==pronunciationSequence||srt!==selected||source!==pronunciationSource()||scope!==el('dubPronunciationScope').value)return;
      if(!result?.ok)throw Error(result?.error||'Pronunciation load failed');
      cfg.pronunciations=result.pronunciations;if(!preserveDraft)el('dubPronunciations').value=(result.entries||[]).map(row=>`${row.from} = ${row.to}`).join('\n');
      el('dubPronunciationStatus').textContent=window.UiLocale?.get?.()==='en'?'Source entries override matching global entries; other global entries still apply.':'Bu kaynağın eşleşmeleri genel sözlüğün önüne geçer; diğer genel eşleşmeler uygulanır.';previewPronunciation();
    }catch(error){if(sequence===pronunciationSequence&&srt===selected)el('dubPronunciationStatus').textContent=error.message;}
    finally{if(sequence===pronunciationSequence){pronunciationLoading=false;controls();}}
  }
  el('dubPronunciationScope').addEventListener('change',()=>{void loadPronunciations();});
  pronunciationAction.addEventListener('click',async()=>{
    if(current||planning||referenceBusy||choosing||workspaceBusy)return;
    const owner=requestIdentity();
    if(el('dubPronunciationScope').value!=='source'){el('dubPronunciationScope').value='source';await loadPronunciations();}
    if(owner!==requestIdentity())return;
    for(let node=el('dubPronunciations');node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
    el('dubPronunciationTitle').scrollIntoView?.({block:'center'});el('dubPronunciations').focus({preventScroll:true});
  });
  el('dubPronunciationSave').addEventListener('click', async () => {
    if (current || planning || referenceBusy || choosing || workspaceBusy || pronunciationLoading) return;
    const en = document.documentElement.lang !== 'tr';
    try {
      const entries=el('dubPronunciations').value.split(/\r?\n/).filter(line=>line.trim()).map(line=>{
        const index=line.indexOf('=');
        if(index<1) throw new Error(en?'Use: word = pronunciation':'Biçim: sözcük = okunuş');
        return {from:line.slice(0,index).trim(),to:line.slice(index+1).trim()};
      });
      const selected=srt,source=pronunciationSource(),scope=el('dubPronunciationScope').value,sequence=++pronunciationSequence;
      const result=await window.api.saveDubPronunciations(scope==='source'?{action:'save',srt:selected,source,entries}:entries);
      if(sequence!==pronunciationSequence||srt!==selected||source!==pronunciationSource()||scope!==el('dubPronunciationScope').value)return;
      if(!result?.ok) throw new Error(result?.error || 'Save failed');
      cfg.pronunciations=result.pronunciations;if(scope==='global')cfg.globalPronunciations=result.pronunciations;previewPronunciation(); el('dubPronunciationStatus').dataset.saved='true';
      el('dubPronunciationStatus').textContent=en?'Saved. Applies to the next generation.':'Kaydedildi. Sonraki ses üretiminde uygulanır.';
    } catch(error) {delete el('dubPronunciationStatus').dataset.saved;el('dubPronunciationStatus').textContent=error.message;}
  });
  async function configure(kind, preserveOptions = false) {
    pronunciationLabels();
    const sequence = ++configSequence;
    const r = await window.api.dubConfig(kind).catch(() => null);
    if (sequence !== configSequence) return;
    if (!r?.ok) { cfg = null; controls(); status(r?.error || 'Ses ayarları yüklenemedi.'); return; }
    cfg = r;
    cfg.globalPronunciations=r.pronunciations||[];
    if (!current && !preserveOptions) el('dubPronunciations').value = (r.pronunciations || []).map(row => `${row.from} = ${row.to}`).join('\n');
    if(!current && !preserveOptions)el('dubKeepEngine').checked=r.keepEngine!==false;
    el('dubStorageOpen').disabled = !r.storageRoot;
    if (!current && !preserveOptions) { el('dubProfile').value = r.profile || 'quality'; el('dubConcurrency').value = String(r.concurrency || 4); }
    if (!current && !preserveOptions) el('dubTimingMode').value = r.timingMode || 'video';
    if (!current && !preserveOptions) el('dubExpression').value = r.expression || 'reference';
    if (!current && !preserveOptions) { el('dubFollowDelivery').checked = r.followDelivery === true; el('dubDeliveryStrength').value = r.deliveryStrength || 'balanced'; }
    if (!current && !preserveOptions && !plan) el('dubGrouping').value = r.grouping || 'akici';
    if (!current && !preserveOptions) { el('dubVerification').value = r.verification || 'detailed'; el('dubAutoFit').checked = r.autoFit !== false; el('dubNaturalSpeech').checked = r.naturalSpeech !== false; }
    if (!current && !preserveOptions) {
      const recommended=el('dubProfile').value==='quality'&&el('dubVerification').value==='detailed'&&el('dubNaturalSpeech').checked&&el('dubAutoFit').checked&&el('dubTimingMode').value==='video';
      resultMode=r.resultMode==='custom'||!recommended?'custom':'natural';
    }
    if (!current && kind === 'reference') referenceInfo(null);
    if (!current && !r.ready) status('Motor veya referans eksik; ses ve motor ayarlarını kontrol edin.');
    controls();
    if(!current)void loadPronunciations(preserveOptions);
  }
  function inheritSubtitleRange() {
    if (current || planning) return;
    const context = window.BrowserDubAudioUI?.context();
    const mediaKey = JSON.stringify([context?.mode, context?.tabId, context?.mediaId || context?.mediaKey]);
    if (mediaContextKey !== null && mediaContextKey !== mediaKey) {
      srt = ''; backgroundSource = ''; fileName('dubSrtName','—'); el('dubBackgroundName').textContent = '';
      deliverySource='';el('dubDeliverySourceName').textContent='';
      lastRequest = null;qualityFilter='all'; results.clear(); showResults();
      resetComparison(); output=null; window.DubWorkspaceUI?.setOutput(null); preview(null);
      el('dubGeneratorOutput').classList.add('hidden'); el('dubGeneratorUse').classList.add('hidden');
    }
    mediaContextKey = mediaKey;
    const range = ['browser','player'].includes(context?.mode) ? context.subtitleRange : null;
    const valid = range && Number.isFinite(range.start) && Number.isFinite(range.end)
      && range.start >= 0 && range.end > range.start && range.end <= 86400;
    const key = JSON.stringify([context?.mode, context?.tabId, context?.mediaId || context?.mediaKey, valid ? range : null]);
    if (rangeContextKey === key) return;
    const hadContext = rangeContextKey !== null; rangeContextKey = key;
    if (!valid && !hadContext) return;
    el('dubRangeEnabled').checked = !!valid;
    const format = seconds => { const ms = Math.round(seconds * 1000), rest = (ms % 60000) / 1000; return `${Math.floor(ms / 60000)}:${rest < 10 ? '0' : ''}${rest}`; };
    el('dubRangeStart').value = valid ? format(range.start) : '0:00';
    el('dubRangeEnd').value = valid ? format(range.end) : '1:00';
    invalidatePlan();
  }
  function preview(file) {
    stopGroupPreview();runInfo();
    const audio = el('dubGeneratedPreview');
    if (file?.url) audio.src = file.url; else audio.removeAttribute('src');
    el('dubPreviewCard').hidden=!file?.url;
    audio.classList.toggle('hidden', !file?.url); audio.load();
  }
  function restoreReadyOutput(job) {
    const saved=job?.fallback;
    if(!saved?.output?.url||saved.media!==mediaIdentity()||saved.srt!==srt)return false;
    output=saved.output;results.clear();for(const row of saved.rows)results.set(row.key,row);
    window.DubWorkspaceUI?.setOutput(output,job.context,job.qualityKey);preview(output);showResults();
    fileName('dubGeneratedName',output.name||basename(output.path||''));
    el('dubGeneratorOutput').classList.remove('hidden');
    el('dubGeneratorUse').classList.toggle('hidden',saved.sample||output.syncInvalid===true);
    status(window.UiLocale?.get?.()==='en'?'The new attempt did not finish. Your previous audio is still available.':'Yeni deneme tamamlanmadı. Önceki sesiniz hâlâ hazır.');
    controls();return true;
  }
  function currentSubtitle() {
    const context = window.BrowserDubAudioUI?.context();
    if (!['browser','player'].includes(context?.mode) || typeof player === 'undefined') return '';
    const candidate = player.sub2Role === 'translation' && player.sub2Path ? player.sub2Path : player.subPath;
    if (typeof candidate !== 'string' || !/\.srt$/i.test(candidate) || !/^(?:[a-z]:[\\/]|[/\\])/i.test(candidate)) return '';
    // Browser tracks belong to the active tab. Never adopt a leftover player path.
    if (context.mode === 'browser' && !(player.browserTracks || []).some(track => track.path === candidate)) return '';
    return candidate;
  }
  function adoptCurrentSubtitle(candidate) {
    if (!candidate || srt || current || planning || choosing || workspaceBusy) return;
    srt = candidate; lastRequest = null;qualityFilter='all'; results.clear(); showResults(); invalidatePlan();
    void loadPronunciations();
    fileName('dubSrtName',basename(candidate)); refreshOverview(); status('Hazır');
  }
  async function open() {
    inheritSubtitleRange();
    const candidate = currentSubtitle();
    if (!modal.open) modal.showModal();
    syncBrowserOcclusion();
    const openedMedia=requestIdentity();
    await configure();
    if (openedMedia !== requestIdentity()) return;
    await window.VoiceReferenceUI?.refresh();
    if (openedMedia !== requestIdentity()) return;
    if (candidate === currentSubtitle()) adoptCurrentSubtitle(candidate);
    if (!current && !output) {
      const selection = () => JSON.stringify([srt,el('dubRangeEnabled').checked,el('dubRangeStart').value,el('dubRangeEnd').value]);
      const requestedSelection = selection();
      const lookup = {source:window.BrowserDubAudioUI?.context()?.source || window.BrowserDubAudioUI?.context()?.mediaKey || ''};
      if (srt) { try { lookup.srt=srt; lookup.range=selectedRange(); } catch (_) { return; } }
      const r = await window.api.latestDub(lookup).catch(() => null);
      if (openedMedia !== requestIdentity() || requestedSelection !== selection() || current || output || !r?.output) return;
      output = r.output;runtimeMetrics=output.metrics||null;runInfo();
      if (!srt) {
        el('dubRangeEnabled').checked=!!output.range;
        if(output.range){const format=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;el('dubRangeStart').value=format(output.range.start);el('dubRangeEnd').value=format(output.range.end);}
      }
      controls(); window.DubWorkspaceUI?.setOutput(output); logPath = output.logPath; preview(output);
      el('dubGeneratorOutput').classList.remove('hidden');
      el('dubGeneratorUse').classList.toggle('hidden', output.sample === true || output.syncInvalid === true);
      results.clear(); for (const row of output.quality?.groups || []) results.set(row.key, row); showResults();
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      fileName('dubGeneratedName',output.name);
      el('dubGeneratorProgress').value = 100;
      elapsed(output.elapsedSeconds || 0);
      if (output.timing) el('dubGeneratorTiming').textContent = `${output.timing.accelerated} / ${output.timing.clipped}`;
      status(output.syncInvalid ? 'Ses dosyası hazır; zaman haritası geçersiz. Videoyla senkron garanti edilemez.'
        : output.sample ? 'Kısa örnek hazır; tüm video için örnek seçimini kapatın.'
        : output.qualityUnavailable ? qualityWarning(output)
        : [...results.values()].some(row => row.status !== 'ready') ? 'Ses hazır; işaretli parçaları kontrol edin veya yeniden üretin.'
        : 'Son üretilen ses hazır. Sesi kullan ile açık videoya bağlayabilirsiniz.');
    }
  }
  el('browserDubGenerate').addEventListener('click', open);
  window.addEventListener('dub-workspace:busy', event => { workspaceBusy=!!event.detail; controls(); });
  window.addEventListener('voice-reference:changed', () => { if(current)referenceQualityPendingReset=true;else referenceInfo(null);void configure(undefined,true); });
  window.addEventListener('voice-reference:busy', event => { referenceBusy = !!event.detail; controls(); });
  el('playerDubGenerate')?.addEventListener('click', () => { el('playerMore').open = false; void open(); });
  el('dubMainOpen').addEventListener('click', open);
  async function editPlanGroup(key){
    if(!plan)await preparePlan();const index=plan?.groups.findIndex(g=>g.key===key);if(!(index>=0))return false;
    el('dubPlanGroup').value=String(index);showGroup();for(let node=el('dubPlanText');node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;el('dubPlanText').scrollIntoView({block:'center'});el('dubPlanText').focus();return true;
  }
  async function inspectProduction(){
    const owner=mediaIdentity(),file=srt;
    if(!plan)await preparePlan();
    if(!plan||owner!==mediaIdentity()||file!==srt)return null;
    if(!lastReferenceQuality&&window.api.listVoiceReferences){const reference=cfg?.reference;const catalog=await window.api.listVoiceReferences().catch(()=>null);const active=catalog?.references?.find(r=>r.id===catalog.activeId);if(reference===cfg?.reference&&active?.path===reference&&active.quality)referenceInfo(active.quality);}
    if(owner!==mediaIdentity()||file!==srt)return null;
    return window.DubExperienceModel.preflight(plan.groups,{edits,reference:lastReferenceQuality,timingMode:el('dubTimingMode').value,pronunciations:cfg?.pronunciations});
  }
  function preparePronunciations(terms,expectedOwner,expectedSrt){
    if(current||planning||referenceBusy||choosing||workspaceBusy||pronunciationLoading||!srt||expectedOwner!==mediaIdentity()||expectedSrt!==srt)return false;
    // Preparing a draft never changes dictionary scope or persists a mapping. Keep unsaved edits.
    const input=el('dubPronunciations'),existing=new Set(input.value.split(/\r?\n/).map(line=>line.split('=')[0].trim()));
    const additions=(Array.isArray(terms)?terms:[]).filter(term=>typeof term==='string'&&/^[\p{L}]{3,32}$/u.test(term)&&!existing.has(term)).slice(0,20);
    if(additions.length)input.value=[input.value.trimEnd(),...additions.map(term=>term+' = '+term)].filter(Boolean).join('\n');
    delete el('dubPronunciationStatus').dataset.saved;
    el('dubPronunciationStatus').textContent=window.UiLocale?.get?.()==='en'?'Draft only. Replace the right-hand text with the pronunciation you want, then save. Original spellings are not pronunciation corrections.':'Yalnız taslak. Sağ taraftaki metni istediğiniz okunuşla değiştirip kaydedin. Özgün yazımlar telaffuz düzeltmesi değildir.';
    for(let node=input;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
    input.scrollIntoView?.({block:'center'});input.focus({preventScroll:true});return true;
  }
  async function editAtCurrent(time){
    const context=window.BrowserDubAudioUI?.context();
    if(mediaContextKey!==null&&mediaContextKey!==mediaIdentity())return false;
    if(!output||output.sample||!context?.visible||!context.hasMedia||lastRequest?.source!==(context.source||context.mediaKey||''))return false;
    const target=window.DubExperienceModel.locate([...results.values()],time??context.currentTime);
    if(!target||current)return false;
    if(!modal.open)await open();
    if(!plan)await preparePlan();
    if(!plan?.groups.some(g=>g.key===target.key))return false;
    selectQuality(target.key);syncQualityPlan(true);
    el('dubPlanText').focus();return true;
  }
  window.DubGeneratorUI = Object.freeze({ selectQuality,editPlanGroup,inspectProduction,preparePronunciations,editAtCurrent,experience:()=>({owner:mediaIdentity(),srt,plan,edits:{...edits},groups:[...results.values()],output,source:lastRequest?.source||'',busy:!!current||planning||referenceBusy||choosing||workspaceBusy}),prepareCurrent: open, takeContext:()=>({id:output?.id||'',key:el('dubQualityGroup').value,owner:mediaIdentity(),busy:!!current||referenceBusy||planning||choosing||workspaceBusy,recipeReady:!!lastRequest}), useTake:(key,token)=>start(true,[],{[key]:token}), assistant:Object.freeze({state:voiceState,configure:voiceConfigure,start:voiceStart,group:voiceGroup,use:voiceUse,refreshReference:()=>configure(undefined,true)}) });
  el('dubGeneratorClose').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => { artifactOpenVersion++;el('dubGeneratedPreview').pause(); syncBrowserOcclusion(); });
  async function openArtifact(file,isCurrent=()=>true){
    const owner=requestIdentity(),ticket=++artifactOpenVersion;let failed=false;
    try{const result=await window.api.openPath(file);failed=typeof result==='string'?!!result:result?.ok===false;}catch{failed=true;}
    if(failed&&ticket===artifactOpenVersion&&modal.open&&owner===requestIdentity()&&isCurrent())status(window.UiLocale?.get?.()==='en'?'Could not open the file or folder. Check that it still exists and that opening was allowed.':'Dosya veya klasör açılamadı. Hâlâ yerinde olduğunu ve açma iznini kontrol edin.');
  }
  el('dubStorageOpen').addEventListener('click', () => { const folder=cfg?.storageRoot;if(folder)void openArtifact(folder,()=>cfg?.storageRoot===folder); });
  async function chooseInput(kind) {
    if (choosing || current || referenceBusy || planning) return;
    const media = requestIdentity(), source = mediaIdentity(); choosing = true; controls();
    try {
      const result = kind === 'subtitle' ? await window.api.selectFile('subtitle')
        : kind === 'delivery' ? await window.api.selectVoiceReferenceSource() : await window.api.selectVideo();
      if (media !== requestIdentity()) { inheritSubtitleRange(); if(source!==mediaIdentity())status('Video değişti; dosyayı yeniden seçin.'); return; }
      if (kind === 'delivery') {
        if (result?.ok && !result.cancelled && result.path) {
          deliverySource=result.path;el('dubDeliverySourceName').textContent=basename(deliverySource);
        }
      } else if (kind === 'subtitle') {
        if (typeof result === 'string' && /\.srt$/i.test(result)) {
          srt = result; lastRequest = null;qualityFilter='all'; results.clear(); showResults(); invalidatePlan();void loadPronunciations(); fileName('dubSrtName',basename(result)); status('Hazır');
        } else if (result) status('Bir SRT altyazı dosyası seçin.');
      } else if (Array.isArray(result) && typeof result[0] === 'string') {
        backgroundSource = result[0]; el('dubBackgroundName').textContent = basename(backgroundSource);
      }
    } catch (_) { if(media===requestIdentity())status('Dosya seçilemedi. Lütfen tekrar deneyin.'); }
    finally { choosing = false; controls(); }
  }
  el('dubChooseSrt').addEventListener('click', () => chooseInput('subtitle'));
  el('dubFollowDelivery').addEventListener('change',controls);
  el('dubChooseDeliverySource').addEventListener('click',()=>chooseInput('delivery'));
  el('dubResetDeliverySource').addEventListener('click',()=>{deliverySource='';el('dubDeliverySourceName').textContent='';refreshOverview();});
  async function preparePlan() {
    if (planning || current || referenceBusy || choosing || !srt) return;
    const media = requestIdentity(), selection = planSelection();
    planning = true; controls();
    try {
      const r = await window.api.planDub({ srt, range: selectedRange(), grouping: el('dubGrouping').value });
      if (media !== requestIdentity() || selection !== planSelection()) return;
      if (!r?.ok) throw new Error(r?.error || 'SRT planı okunamadı.');
      plan = r; edits = {}; el('dubPlanGroup').replaceChildren();
      r.groups.forEach((g, i) => { const option = document.createElement('option'); option.value = String(i);
        option.textContent = `${i + 1} · ${g.seconds.toFixed(1)} s · ${g.text.slice(0, 65)}`; el('dubPlanGroup').append(option); });
      showGroup();
      // Non-speech cues (music, applause, sound effects) are not spoken; say so.
      status(r.skipped > 0 ? `${t('Cümle grupları hazır')} · ${r.skipped} ${t('ses-dışı altyazı satırı atlandı')}` : 'Cümle grupları hazır');
    } catch (error) { if(media===requestIdentity())el('dubGeneratorDetails').textContent = error.message; }
    finally { planning = false; inheritSubtitleRange(); controls(); }
  }
  el('dubPlanPrepare').addEventListener('click',()=>void preparePlan());
  function invalidatePlan() {
    plan = null; edits = {}; lastRequest = null; el('dubPlanGroup').replaceChildren(); showGroup(); controls();
  }
  for (const [name, settings] of Object.entries(presetSpecs)) el(`dubPreset${name}`).addEventListener('click', () => {
    if (current || planning || choosing || referenceBusy || workspaceBusy) return;
    if (plan && el('dubGrouping').value !== settings.grouping) {
      if (Object.keys(edits).length && !window.confirm(t('Gruplama değişince dublaj metni düzenlemeleri sıfırlanacak. Devam edilsin mi?'))) return;
      invalidatePlan();
    }
    resultMode='custom';
    for (const [key,value] of Object.entries(settings)) {
      const input = el(`dub${key[0].toUpperCase()}${key.slice(1)}`);
      if (typeof value === 'boolean') input.checked = value; else input.value = value;
    }
    controls();
  });
  el('dubNaturalRecommend').addEventListener('click',()=>{
    if(current||planning||choosing||referenceBusy||workspaceBusy)return;
    // The recommendation changes quality choices only; voice, scope, grouping,
    // concurrency and authored text remain untouched.
    for(const key of ['profile','verification','naturalSpeech','autoFit','timingMode']){
      const input=el(`dub${key[0].toUpperCase()}${key.slice(1)}`),value=presetSpecs.Careful[key];
      if(typeof value==='boolean')input.checked=value;else input.value=value;
    }
    resultMode='natural';
    controls();
  });
  el('dubNaturalReviewOpen').addEventListener('click',()=>{
    const flagged=[...results.values()].sort((a,b)=>a.group-b.group).find(row=>row.status!=='ready');
    if(flagged){qualityFilter='all';showResults();selectQuality(flagged.key);}
    el('dubQualityResults').open=true;el('dubQualityResults').scrollIntoView?.({block:'center'});el('dubQualityGroup').focus({preventScroll:true});
  });
  for(const id of ['dubProfile','dubConcurrency','dubKeepEngine','dubGrouping','dubVerification','dubTimingMode','dubNaturalSpeech','dubAutoFit','dubFollowDelivery','dubDeliveryStrength','dubExpression'])el(id).addEventListener('change',()=>{
    if(current||planning||choosing||referenceBusy||workspaceBusy)return;
    resultMode='custom';refreshOverview();
  });
  for (const id of ['dubProfile','dubConcurrency','dubVerification','dubTimingMode','dubNaturalSpeech','dubAutoFit']) el(id).addEventListener('change', controls);
  for (const id of ['dubRangeEnabled', 'dubRangeStart', 'dubRangeEnd']) el(id).addEventListener('input', invalidatePlan);
  el('dubGrouping').addEventListener('change', () => {
    if (plan && Object.keys(edits).length && !window.confirm(window.UiLocale?.t('Gruplama değişince dublaj metni düzenlemeleri sıfırlanacak. Devam edilsin mi?') || 'Gruplama değişince dublaj metni düzenlemeleri sıfırlanacak. Devam edilsin mi?')) {
      el('dubGrouping').value = plan.grouping || cfg?.grouping || 'akici'; return;
    }
    invalidatePlan();
  });
  el('dubRangeNow').addEventListener('click', () => {
    el('dubRangeStart').value = String(Math.floor(Number(window.BrowserDubAudioUI?.context()?.currentTime) || 0));
    invalidatePlan();
  });
  el('dubPlanGroup').addEventListener('change', showGroup);
  el('dubKeepBackground').addEventListener('change',controls);
  el('dubChooseBackground').addEventListener('click', () => chooseInput('background'));
  el('dubBackgroundReset').addEventListener('click',()=>{backgroundSource='';el('dubBackgroundName').textContent='';});
  el('dubPlanApply').addEventListener('click', () => {
    if(current||planning||referenceBusy||choosing||workspaceBusy)return;
    const g = group(), text = el('dubPlanText').value.trim();
    if (!g || !text) return;
    if (text === g.text) delete edits[g.key]; else edits[g.key] = text;
    showGroup(); status('Dublaj metni uygulandı.');
  });
  const repairActions=document.createElement('div');repairActions.className='fw-repair-actions';const repairSave=document.createElement('button'),repairAB=document.createElement('button');repairSave.id='dubSaveRegenerate';repairSave.type=repairAB.type='button';repairSave.className='btn btn-secondary';repairAB.className='btn btn-ghost';const repairLabels=()=>{repairSave.textContent=window.UiLocale?.get?.()==='tr'?'Metni kaydet · yalnız bu grubu üret':'Save text · regenerate only this group';repairAB.textContent=window.UiLocale?.get?.()==='tr'?'Önceki ve yeni kaydı karşılaştır':'Compare previous and current takes';};repairLabels();document.addEventListener('ui-locale-change',repairLabels);repairActions.append(repairSave,repairAB);el('dubPlanApply').after(repairActions);controls();
  repairSave.onclick=async()=>{if(current||planning||referenceBusy||choosing||workspaceBusy||!lastRequest)return;const g=group(),text=el('dubPlanText').value.trim();if(!g||!text)return;if(text===g.text)delete edits[g.key];else edits[g.key]=text;showGroup();repairSave.disabled=true;try{await start(true,[g.key]);}finally{repairSave.disabled=false;}};
  repairAB.onclick=()=>{const g=group();if(!g)return;selectQuality(g.key);window.dispatchEvent(new Event('dub-takes:open'));};
  el('dubPlanReset').addEventListener('click', () => { if(current||planning||referenceBusy||choosing||workspaceBusy)return;const g = group(); if (g) delete edits[g.key]; showGroup(); });
  el('dubPlanShorten').addEventListener('click', async () => {
    if (planning || current || referenceBusy || choosing) return;
    const g = group(); if (!g) return;
    const media = requestIdentity(), requestedPlan = plan, draft = el('dubPlanText').value;
    planning = true; controls(); status('Kısaltma önerisi hazırlanıyor…');
    try {
      const r = await window.api.shortenDub({key:g.key,sourceHash:requestedPlan.sourceHash,text:draft});
      if (media !== requestIdentity() || plan !== requestedPlan || el('dubPlanText').value !== draft) return;
      if (!r?.ok) throw new Error(r?.error || 'Uygun bir kısaltma alınamadı.');
      el('dubPlanText').value = r.text; status('Öneriyi kontrol edip Bu metni uygula düğmesine basın.');
    } catch (error) { if(media===requestIdentity()&&plan===requestedPlan&&el('dubPlanText').value===draft){el('dubGeneratorDetails').textContent = error.message; status('Kısaltma alınamadı; metni elle düzenleyebilirsiniz.');} }
    finally { planning = false; inheritSubtitleRange(); controls(); }
  });
  for (const [id, kind] of [['dubChooseEngine','engine'], ['dubChooseVoice','reference'], ['dubChooseTranscript','transcript']]) {
    el(id).addEventListener('click', async () => {
      if (choosing || current || referenceBusy || planning) return;
      choosing = true; controls();
      try { await configure(kind); } finally { choosing = false; controls(); }
    });
  }
  function planSelection() {
    return JSON.stringify([srt,el('dubRangeEnabled').checked,el('dubRangeStart').value,el('dubRangeEnd').value,el('dubGrouping').value]);
  }
  function startSelection() {
    return JSON.stringify([planSelection(),voiceSettings(),el('dubKeepEngine').checked,el('dubNaturalSpeech').checked,el('dubAutoFit').checked,backgroundSource,deliverySource,cfg,edits]);
  }
  async function start(retry = false, forceGroups = [], takeChoices = null, job = {}) {
    if (current || referenceBusy || planning || choosing || workspaceBusy || !srt || !cfg?.ready) return;
    artifactOpenVersion++;
    // A one-job override never writes retained controls. Reject an obsolete
    // preflight rather than borrowing options edited while its plan was loading.
    const sourceBefore=requestIdentity(),selectionBefore=startSelection();
    const obsolete=()=>sourceBefore!==requestIdentity()||selectionBefore!==startSelection()||job.isCancelled?.();
    if(!retry&&!plan){await preparePlan();if(!plan||obsolete()||current)return {ok:false};}
    if(obsolete())return {ok:false};
    window.dispatchEvent(new Event('dub-preflight-ready'));
    if(obsolete()||current||referenceBusy||planning||choosing||workspaceBusy)return {ok:false};
    let range;
    try { range = selectedRange(); } catch (error) { status(error.message); return; }
    current = { id: crypto.randomUUID(), qualityKey:retry?el('dubQualityGroup').value:'', voice:{reference:cfg.reference,transcript:cfg.transcript,engine:cfg.engine}, context: window.BrowserDubAudioUI?.context(), sample: retry ? lastRequest?.sample : job.sample ?? el('dubSampleOnly').checked };
    const pending = current;
    pending.fallback=output?.url?{output,rows:[...results.values()],media:mediaIdentity(),srt,sample:el('dubGeneratorUse').classList.contains('hidden')}:null;
    const started = performance.now();
    elapsed(0); stopTimer();activeGroups.clear();showActivity();
    timer = setInterval(() => elapsed((performance.now() - started) / 1000), 1000);
    logPath = null; el('dubGeneratorLog').classList.add('hidden');
    if(output?.url){if(lastRequest?.srt===srt){previousOutput=output;previousMedia=mediaIdentity();}else resetComparison();}
    output = null; window.DubWorkspaceUI?.setOutput(null); preview(null); el('dubGeneratorOutput').classList.add('hidden');
    fileName('dubGeneratedName','');
    el('dubGeneratorUse').classList.add('hidden');
    el('dubGeneratorDetails').textContent = ''; el('dubGeneratorCount').textContent = '';
    el('dubGeneratorTiming').textContent = '';
    el('dubGeneratorProgress').removeAttribute('value');
    runtimePhases={};runtimeError='';runtimeMetrics=null;runInfo();el('dubPhaseSummary').textContent='';
    status('Motor yükleniyor…'); controls();
    const payload = retry ? {...lastRequest, id:pending.id, forceGroups,
      dubText: plan ? {sourceHash:plan.sourceHash, edits:{...edits}} : lastRequest.dubText} : { id: pending.id, srt, resultMode, sample: pending.sample,
      keepEngine:el('dubKeepEngine').checked, profile: el('dubProfile').value, concurrency: Number(el('dubConcurrency').value), grouping: el('dubGrouping').value,
      expression: el('dubExpression').value,
      followDelivery:el('dubFollowDelivery').checked, deliveryStrength:el('dubDeliveryStrength').value,
      prosodySource: deliverySource || pending.context?.backgroundSource || '',
      verification:el('dubVerification').value, autoFit:el('dubAutoFit').checked, naturalSpeech:el('dubNaturalSpeech').checked,
      keepBackground: el('dubKeepBackground').checked, backgroundSource: backgroundSource || pending.context?.backgroundSource || '',
      backgroundTab: pending.context ? {tabId:pending.context.tabId,generation:pending.context.generation,mediaId:pending.context.mediaId || ''} : null,
      timingMode: el('dubTimingMode').value, range, dubText: plan ? { sourceHash: plan.sourceHash, edits:{...edits} } : null };
    if(retry){
      payload.groupTakes={...(lastRequest.groupTakes||{}),...(takeChoices||{})};
      for(const key of forceGroups)delete payload.groupTakes[key];
    }
    payload.source = pending.context?.source || pending.context?.mediaKey || '';
    if(Number.isFinite(pending.context?.duration)&&pending.context.duration>0&&pending.context.duration<=86400)payload.sourceDuration=pending.context.duration;
    pending.settings={...payload};refreshOverview();
    window.MediaExperience?.trackVoice?.(pending.id,pending.context);
    lastRequest = payload;
    if (!retry) { results.clear(); showResults(); }
    const r = await window.api.startDub(payload).catch(e => ({ ok:false,error:e.message }));
    if (!r?.ok && current === pending) {
      stopTimer((performance.now() - started) / 1000);
      current = null; el('dubGeneratorProgress').value = 0; status('Ses üretimi başarısız oldu.');
      el('dubGeneratorDetails').textContent = generationError(r?.error); controls();
      restoreReadyOutput(pending);
    }
    return {ok:!!r?.ok,id:pending.id};
  }
  el('dubGeneratorStart').addEventListener('click', () => start());
  el('dubRetryFailed').addEventListener('click', () => start(true, flaggedKeys()));
  el('dubRegenerateGroup').addEventListener('click', () => { const key = el('dubQualityGroup').value; if (key) void start(true, [key]); });
  el('dubOpenQuality').addEventListener('click',()=>{const panel=el('dubQualityResults');for(let node=panel;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;panel.scrollIntoView?.({block:'start'});el('dubQualityGroup').focus();});
  el('dubEditSelected').addEventListener('click',async()=>{if(current||planning||referenceBusy||choosing||workspaceBusy)return;const selected=el('dubQualityGroup').value,owner=requestIdentity();if(!plan)await preparePlan();if(owner!==requestIdentity()||current||el('dubQualityGroup').value!==selected)return;if(plan?.groups.some(g=>g.key===selected))syncQualityPlan(true);});
  el('dubNextFlagged').addEventListener('click',()=>navigateFlagged(1));
  previousFlagged.addEventListener('click',()=>navigateFlagged(-1));
  document.addEventListener('keydown',event=>{if(!modal.open||!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||!['ArrowUp','ArrowDown'].includes(event.key)||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)||event.target.isContentEditable)return;event.preventDefault();navigateFlagged(event.key==='ArrowUp'?-1:1);});
  el('dubQualityGroup').addEventListener('change',()=>{qualityInfo();syncQualityPlan(false);});
  const listenGroup=document.createElement('button');listenGroup.type='button';listenGroup.className='btn btn-secondary btn-sm';listenGroup.id='dubListenCurrent';listenGroup.textContent=t('Bu grubu dinle');el('dubListenActions').prepend(listenGroup);
  let rangeEnd=null, groupPlayGeneration=0, cancelGroupMetadata=null;
  const previousAudio=el('dubPreviousPreview');
  function resetComparison(){stopGroupPreview();previousOutput=null;previousMedia=null;previousAudio.removeAttribute('src');previousAudio.classList.add('hidden');el('dubListenPrevious').hidden=true;}
  const groupAudio=el('dubGeneratedPreview');
  function stopGroupPreview() {
    groupPlayGeneration++;rangeEnd=null;previousRangeEnd=null;previousAudio.pause();previousAudio.classList.add('hidden');
    cancelGroupMetadata?.();cancelGroupMetadata=null;
    groupAudio.pause();el('dubTakePreview')?.pause();
  }
  function metadataReady(audio=groupAudio) {
    if(audio.readyState>=1)return Promise.resolve(true);
    return new Promise(resolve=>{
      let timer;
      const finish=value=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',ready);audio.removeEventListener('error',failed);if(cancelGroupMetadata===cancel)cancelGroupMetadata=null;resolve(value);};
      const ready=()=>finish(true),failed=()=>finish(false),cancel=()=>finish(false);
      cancelGroupMetadata=cancel;
      audio.addEventListener('loadedmetadata',ready,{once:true});audio.addEventListener('error',failed,{once:true});
      timer=setTimeout(failed,10000);
    });
  }
  groupAudio.addEventListener('timeupdate',()=>{if(rangeEnd!==null&&groupAudio.currentTime>=rangeEnd){groupAudio.pause();rangeEnd=null;}});
  groupAudio.addEventListener('emptied',stopGroupPreview);
  groupAudio.addEventListener('ended',()=>{rangeEnd=null;});
  groupAudio.addEventListener('error',stopGroupPreview);
  async function listenSelectedGroup(){
    if(current||workspaceBusy)return;
    stopGroupPreview();
    const row=results.get(el('dubQualityGroup').value),source=output;
    if(!source?.url||!Number.isFinite(row?.audioStart)||!Number.isFinite(row?.audioEnd)||row.audioStart<0||row.audioEnd<=row.audioStart){status('Önce üretimi tamamlayın.');return;}
    const generation=groupPlayGeneration;
    if(!await metadataReady())return;
    if(generation!==groupPlayGeneration||output!==source||!modal.open||current||workspaceBusy)return;
    if(!Number.isFinite(groupAudio.duration)||row.audioStart>=groupAudio.duration){status('Ses aralığı bu dosyada bulunamadı.');return;}
    try {
      rangeEnd=Math.min(row.audioEnd,groupAudio.duration);groupAudio.currentTime=row.audioStart;
      await groupAudio.play();
      return generation===groupPlayGeneration&&output===source&&modal.open&&!current&&!workspaceBusy;
    } catch(error){if(generation===groupPlayGeneration){rangeEnd=null;status(error.message);}}
    return false;
  }
  listenGroup.onclick=()=>void listenSelectedGroup();
  el('dubListenPrevious').addEventListener('click',async()=>{
    if(current||workspaceBusy||previousMedia!==mediaIdentity())return;
    stopGroupPreview();const source=previousOutput,row=source?.quality?.groups?.find(value=>value.key===el('dubQualityGroup').value),latest=output;
    if(!source?.url||!latest||!Number.isFinite(row?.audioStart)||!Number.isFinite(row?.audioEnd)||row.audioStart<0||row.audioEnd<=row.audioStart)return;
    const generation=groupPlayGeneration;
    if(previousAudio.getAttribute('src')!==source.url){previousAudio.src=source.url;previousAudio.load();}
    if(!await metadataReady(previousAudio))return;
    if(generation!==groupPlayGeneration||previousOutput!==source||output!==latest||!modal.open||current)return;
    if(!Number.isFinite(previousAudio.duration)||row.audioStart>=previousAudio.duration)return;
    previousRangeEnd=Math.min(row.audioEnd,previousAudio.duration);previousAudio.currentTime=row.audioStart;previousAudio.classList.remove('hidden');
    try{await previousAudio.play();}catch(error){if(generation===groupPlayGeneration){previousRangeEnd=null;status(error.message);}}
  });
  previousAudio.addEventListener('timeupdate',()=>{if(previousRangeEnd!==null&&previousAudio.currentTime>=previousRangeEnd){previousAudio.pause();previousRangeEnd=null;}});
  previousAudio.addEventListener('error',stopGroupPreview);
  previousAudio.addEventListener('ended',()=>{previousRangeEnd=null;});
  modal.addEventListener('close',stopGroupPreview);
  el('dubQualityGroup').addEventListener('change',stopGroupPreview);


  document.addEventListener('ui-locale-change', () => { pronunciationLabels(); showResults(); referenceInfo(lastReferenceQuality); refreshOverview(); });
  el('dubGeneratorCancel').addEventListener('click', async () => {
    const pending = current;
    if (!pending) return;
    el('dubGeneratorCancel').disabled = true;
    pending.stopping = true;
    status('Durduruluyor…');
    const r = await window.api.cancelDub({id:pending.id}).catch(() => null);
    if (current !== pending) return;
    if (!r?.ok && current) { current.stopping = false; status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); controls(); }
  });
  el('dubGeneratorOutput').addEventListener('click', () => { const file=output;if(file)void openArtifact(file.path,()=>output===file); });
  async function attachSelectedOutput(selected,isCancelled=()=>false) {
    const context=window.BrowserDubAudioUI?.context(),owner=requestIdentity();
    if(!selected||selected.sample||selected.syncInvalid||!context?.tabId||!context.hasMedia||!context.visible)return false;
    // Generated audio belongs to its recorded source, even when its job
    // finishes after the user has opened another video. Imported projects have
    // no production id and remain an intentional manual attachment.
    let file=selected;
    if(selected.id){
      const proof=await window.api.latestDub({id:selected.id,source:context.source||context.mediaKey}).catch(()=>null);
      if(!proof?.ok||proof.output?.id!==selected.id||proof.output.sample||proof.output.syncInvalid)return false;
      file=proof.output;
    }
    if(isCancelled()||output!==selected||current||owner!==requestIdentity())return false;
    el('dubGeneratedPreview').pause();
    return await window.BrowserDubAudioUI.attachGenerated({...file,...window.DubWorkspaceUI?.attachment(selected)},context)===true;
  }
  el('dubGeneratorUse').addEventListener('click', async () => {
    const selected = output,owner=requestIdentity();
    if (!selected || selected.sample || selected.syncInvalid) return;
    const context = window.BrowserDubAudioUI?.context();
    if (!context?.tabId || !context.hasMedia || !context.visible) {
      status('Ses eklemek için önce bir video açın.'); return;
    }
    el('dubGeneratedPreview').pause();
    el('dubGeneratorUse').disabled = true;
    try {
      const attached = await attachSelectedOutput(selected);
      if (output === selected && !current && owner===requestIdentity()) status(attached ? 'Üretim tamamlandı; dublaj videoya bağlandı.' : 'Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.');
    } catch (_) { if(output===selected && !current && owner===requestIdentity())status('Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.'); }
    finally { controls(); }
  });
  el('dubTextStudio').addEventListener('click', async () => {
    const r = await window.api.openTextVoiceUI().catch(() => null);
    if (!r?.ok) { status('Metin stüdyosu açılamadı.'); el('dubGeneratorDetails').textContent = r?.error || ''; }
    else status('Metin stüdyosu açık. Metin yapıştırabilir veya TXT dosyası seçebilirsiniz.');
  });
  el('dubGeneratorLog').addEventListener('click', () => { const file=logPath;if(file)void openArtifact(file,()=>logPath===file); });
  window.api.onDubEvent(event => {
    if (event.type === 'studio_error') { status(event.error || 'Metin seslendirme stüdyosu başlatılamadı.'); return; }
    const job = current;
    if (!job || event.id !== job.id) return;
    if (job.stopping && !['done','error','cancelled'].includes(event.type)) return;
    if (event.type === 'progress') {
      if(!Number.isSafeInteger(event.done)||!Number.isSafeInteger(event.total)||event.total<=0||event.done<0||event.done>event.total)return;
      status(event.done===event.total?(window.UiLocale?.get?.()==='en'?'Finishing audio and checks…':'Ses ve son denetimler tamamlanıyor…'):'Ses üretiliyor…'); el('dubGeneratorCount').textContent = `${event.done}/${event.total}`;
      el('dubGeneratorProgress').value = Math.min(99,event.done / event.total * 100);
    } else if(event.type==='activity'){if(Number.isInteger(event.group)&&event.group>0&&(activeGroups.size<8||activeGroups.has(event.group))){if(event.finished){const active=activeGroups.get(event.group);if(active?.stage===event.stage&&active?.attempt===event.attempt)activeGroups.delete(event.group);}else activeGroups.set(event.group,event);showActivity();}}
    else if (event.type === 'group') {activeGroups.delete(event.group.group);showActivity();updateResult(event.group);}
    else if(event.type==='phases')phaseSummary(event.phases);
    else if(event.type==='engine'){if(event.kind==='DUB_ENGINE'&&event.reused)status(window.UiLocale?.get?.()==='en'?'Using the ready voice engine…':'Hazır ses motoru kullanılıyor…');if(event.kind==='DUB_CAPACITY')el('dubGeneratorDetails').textContent=(window.UiLocale?.get?.()==='en'?'GPU free memory: ':'GPU boş bellek: ')+event.freeMiB+' MiB · '+event.concurrency+' / '+event.requested;}
    else if (event.type === 'voice') {
      if (typeof event.reference === 'string' && typeof event.transcript === 'string' && typeof event.engine === 'string') {
        if (job.voice?.reference !== event.reference) referenceInfo(null);
        job.voice={reference:event.reference,transcript:event.transcript,engine:event.engine};controls();
      }
    }
    else if(event.type==='metrics'){runtimeMetrics=event.metrics;runInfo();}
    else if (event.type === 'reference_quality') referenceInfo(event.quality);
    else if (event.type === 'concurrency') { status('GPU belleği için paralel üretim azaltıldı.'); el('dubGeneratorDetails').textContent = `${event.concurrency} · ${t('Paralel üretim')}`; }
    else if (event.type === 'status') {if(event.stage==='engine_restart'){activeGroups.clear();showActivity();}status(event.text);}
    else if (event.type === 'warning') {
      const en=window.UiLocale?.get?.()==='en',reasons={configuration:en?'Check the translation provider settings.':'Çeviri sağlayıcısı ayarlarını kontrol edin.',authentication:en?'The translation provider rejected authentication.':'Çeviri sağlayıcısı kimlik doğrulamayı reddetti.',rate_limit:en?'The provider rate limit was reached.':'Sağlayıcı istek sınırına ulaşıldı.',timeout:en?'The text editor timed out.':'Metin düzenleyicisi zaman aşımına uğradı.',output_limit:en?'The editor response exceeded its output budget.':'Düzenleme yanıtı çıktı sınırında kesildi.',empty_reply:en?'The editor returned no text.':'Düzenleyici metin döndürmedi.',meaning_guard:en?'The proposed wording did not pass the meaning check.':'Önerilen metin anlam denetiminden geçmedi.',provider:en?'The translation provider could not complete the request.':'Çeviri sağlayıcısı isteği tamamlayamadı.'};
      el('dubGeneratorDetails').textContent=t(event.text)+(reasons[event.reason]?' '+reasons[event.reason]:'');
    }
    else if (event.type === 'timing') el('dubGeneratorTiming').textContent = `${event.accelerated} / ${event.clipped}`;
    else if (['done','error','cancelled'].includes(event.type)) {
      runtimeMetrics=event.metrics||runtimeMetrics;runInfo();
      activeGroups.clear();showActivity();
      stopTimer(event.elapsedSeconds);
      if (event.type !== 'done' && !el('dubGeneratorProgress').hasAttribute('value')) el('dubGeneratorProgress').value = 0;
      logPath = event.logPath;
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      if (event.logError) el('dubGeneratorDetails').textContent = event.logError;
      current = null; controls();
      if (event.type === 'done') {
        output = event; window.DubWorkspaceUI?.setOutput(output, job.context, job.qualityKey); preview(output); el('dubGeneratorProgress').value = 100;
        if (event.quality?.groups) { results.clear(); for (const row of event.quality.groups) results.set(row.key, row); showResults(); }
        const needsReview = event.qualityUnavailable === true || [...results.values()].some(row => row.status !== 'ready');
        fileName('dubGeneratedName',event.name);
        el('dubGeneratorOutput').classList.remove('hidden');
        el('dubGeneratorUse').classList.toggle('hidden', !!job.sample);
        status(event.qualityUnavailable ? qualityWarning(event) : needsReview ? 'Ses hazır; işaretli parçaları kontrol edin veya yeniden üretin.' : job.sample ? 'Kısa örnek hazır; tüm video için örnek seçimini kapatın.' : 'Ses hazır. Buradan dinleyebilir veya Sesi kullan ile videoya bağlayabilirsiniz.');
        if (!job.sample && !needsReview && job.context?.hasMedia) {
          void window.BrowserDubAudioUI.attachGenerated({ name:event.name, url:event.url, range:event.range, sync:event.sync, background:event.background, ...window.DubWorkspaceUI?.attachment(event) }, job.context)
            .then(attached => { if (attached && output === event) status('Üretim tamamlandı; dublaj videoya bağlandı.'); })
            .catch(() => { if (output === event) status('Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.'); });
        }
      } else if (event.type === 'cancelled') {status('Durduruldu.');restoreReadyOutput(job);}
      else {
        status('Ses üretimi başarısız oldu.'); runtimeError=event.error||'';el('dubGeneratorDetails').textContent = generationError(runtimeError);
        if (event.recoverablePath && event.recoverableUrl) {
          output = {path:event.recoverablePath,url:event.recoverableUrl,name:event.name,syncInvalid:true};
          preview(output); fileName('dubGeneratedName',event.name || basename(output.path));
          el('dubGeneratorOutput').classList.remove('hidden');
          el('dubGeneratorUse').classList.add('hidden');
        }else restoreReadyOutput(job);
      }
    }
  });
  window.addEventListener('dub-workspace:media', () => {
    const c=window.BrowserDubAudioUI?.context();mediaContextKey=mediaIdentity();
    rangeContextKey=JSON.stringify([c?.mode,c?.tabId,c?.mediaId||c?.mediaKey,null]);
  });
  window.addEventListener('dub-workspace:loaded', event => {
    if(current || planning || referenceBusy || choosing) return;
    resetComparison();output=event.detail; preview(output); results.clear();
    for(const row of output.quality?.groups || []) results.set(row.key,row);
    showResults(); fileName('dubGeneratedName',output.name);
    el('dubGeneratorOutput').classList.remove('hidden');
    el('dubGeneratorUse').classList.toggle('hidden',output.sample===true || output.syncInvalid===true);
    // A project carries rendered media, not an executable engine request.
    srt=output.subtitle || ''; lastRequest=null; plan=null; edits={};void loadPronunciations();
    el('dubRangeEnabled').checked=!!output.range;
    if(output.range){el('dubRangeStart').value=String(output.range.start);el('dubRangeEnd').value=String(output.range.end);}
    fileName('dubSrtName',basename(srt)); controls();
    status(output.syncInvalid ? 'Ses dosyası hazır; zaman haritası geçersiz. Videoyla senkron garanti edilemez.'
      : output.qualityUnavailable ? qualityWarning(output)
      : 'Dublaj projesi açıldı. Videoyu kontrol edip Sesi kullan düğmesine basın.');
  });

  function verificationReasons(row,en){
    const v=row?.verification||{},reasons=[];
    for(const [flag,label]of [['spoken_number_mismatch',['Spoken quantity differs','Söylenen sayı farklı']],['lost_negation',['Negation may sound different','Olumsuzluk farklı duyulmuş olabilir']],['added_negation',['Added negation','Eklenen olumsuzluk']],['semantic_mismatch',['Meaning markers','Anlam işaretleri']],['unit_mismatch',['Unit may sound different','Birim farklı duyulmuş olabilir']],['sign_mismatch',['Number sign','Sayı işareti']],['repetition',['Repetition','Tekrar']]])if(v[flag])reasons.push(label[en?0:1]);
    for(const [key,label]of [['missing_numbers',['Number not recognized','Sayı tanınamadı']],['added_numbers',['Added number','Ek sayı']],['missing_names',['Name recognition','Özel ad tanıma']],['omission_spans',['Words may be missing','Bazı sözcükler eksik duyulmuş olabilir']],['insertion_spans',['Potential extra speech','Olası ek konuşma']]])if(v[key]?.length){const values=['missing_numbers','added_numbers','missing_names'].includes(key)?v[key].slice(0,5).map(value=>String(value).slice(0,60)).join(', '):'';reasons.push(label[en?0:1]+(values?': '+values:''));}
    const measured=window.DubExperienceModel?.continuity(row?.continuity);
    const labels={'level-jump':['Adjacent groups differ in level','Komşu gruplarda seviye farkı'],'pace-jump':['Adjacent groups differ in pace','Komşu gruplarda konuşma hızı farkı'],'long-edge-pause':['Long pause at a group boundary','Grup sınırında uzun durak'],'level-correction-unavailable':['Level adjustment was unavailable','Seviye düzeltmesi uygulanamadı']};
    for(const code of measured?.warnings||[])reasons.push(labels[code][en?0:1]);
    return reasons;
  }
  function voiceSettings(){return {resultMode,profile:el('dubProfile').value,concurrency:Number(el('dubConcurrency').value),grouping:el('dubGrouping').value,verification:el('dubVerification').value,timingMode:el('dubTimingMode').value,expression:el('dubExpression').value,keepBackground:el('dubKeepBackground').checked,followDelivery:el('dubFollowDelivery').checked,deliveryStrength:el('dubDeliveryStrength').value,sample:el('dubSampleOnly').checked};}
  function voiceState(query={}){
    if(mediaContextKey!==null&&mediaContextKey!==mediaIdentity())return {opened:modal.open,busy:!!current||planning||referenceBusy||choosing||workspaceBusy,sourceChanged:true,subtitleReady:false,engineAndReferenceReady:false,output:null,groups:[],counts:{total:0,review:0,failed:0},note:'Voice preparation belongs to another source. Open the current video voice panel / Ses hazırlığı başka kaynağa ait. Güncel videonun ses panelini aç.'};
    let range=null,invalidRange=false;try{range=selectedRange();}catch(_){invalidRange=true;}
    const groups=[...results.values()].sort((a,b)=>Number(a.status==='ready')-Number(b.status==='ready')||a.group-b.group);
    const offset=query.offset??0;if(!Number.isInteger(offset)||offset<0||offset>10000)throw Error('Invalid voice group offset.');
    const visible=query.group_id?groups.filter(row=>row.key===query.group_id):groups.slice(offset,offset+30),nextOffset=!query.group_id&&offset+30<groups.length?offset+30:null;
    return {playingGroup:!groupAudio.paused?el('dubQualityGroup').value:null,currentJobId:current?.id||null,opened:modal.open,busy:!!current||referenceBusy||planning||choosing||workspaceBusy,subtitleReady:!!srt,engineAndReferenceReady:!!cfg?.ready,
      reference:{ready:!!cfg?.ready,name:cfg?.ready?basename(cfg.reference).slice(0,100):''},
      settings:voiceSettings(),range,invalidRange,canRegenerate:!!lastRequest&&!!cfg?.ready,
      output:output?{id:output.id,sample:output.sample===true,syncInvalid:output.syncInvalid===true,qualityUnavailable:output.qualityUnavailable===true}:null,
      counts:{total:groups.length,review:groups.filter(row=>row.status==='review').length,failed:groups.filter(row=>row.status==='failed').length},
      groups:visible.map(row=>({id:row.key,number:row.group,status:row.status,text:String(row.text||row.displayText||'').slice(0,220),verification:String(row.verification?.status||'not_checked'),reviewReasons:verificationReasons(row,window.UiLocale?.get?.()==='en'),needsListening:row.status==='review'||row.status==='failed'||!!window.DubExperienceModel?.continuity(row.continuity)?.warnings.length,continuity:window.DubExperienceModel?.continuity(row.continuity)||null,qualityEvidence:'automatic_checks_only'})),groupOffset:offset,nextOffset,groupsTruncated:nextOffset!==null};
  }
  async function ensureVoice(isCancelled){
    if(!modal.open)await window.DubGeneratorUI.prepareCurrent();else if(!cfg)await configure();
    if(isCancelled())throw Error('The source changed / Kaynak değişti.');
    if(current||referenceBusy||planning||choosing||workspaceBusy)throw Error('Voice controls are busy / Ses kontrolleri meşgul.');
  }
  async function voiceConfigure(args,isCancelled,expectedSettings){
    const requestedSelection=()=>{
      const settings=voiceSettings();
      return JSON.stringify([Object.keys(args).filter(key=>key in settings).map(key=>[key,settings[key]]),args.start===undefined?null:[el('dubRangeEnabled').checked,el('dubRangeStart').value,el('dubRangeEnd').value]]);
    };
    const before=requestedSelection();
    await ensureVoice(isCancelled);
    const staleSettings=()=>({ok:false,stale:true,error:'Settings changed; refresh and review / Ayarlar değişti; yenileyip tekrar inceleyin.'});
    if(before!==requestedSelection())return staleSettings();
    if(expectedSettings!==undefined){
      const approved=expectedSettings?.values,prototype=approved&&typeof approved==='object'?Object.getPrototypeOf(approved):undefined;
      const plain=approved&&typeof approved==='object'&&!Array.isArray(approved)&&(prototype===null||Object.getPrototypeOf(prototype)===null&&Object.hasOwn(prototype,'constructor')&&prototype.constructor?.name==='Object');
      const supported=['profile','concurrency','grouping','verification','timingMode','expression','deliveryStrength','keepBackground','followDelivery','sample','start','end'];
      const requested=Object.keys(args),keys=plain?Object.keys(approved):[];
      if(expectedSettings?.kind!=='voice'||!plain||!requested.length||keys.length!==requested.length||requested.some(key=>!supported.includes(key)||!Object.hasOwn(approved,key)))return staleSettings();
      let range;try{range=selectedRange();}catch(_){return staleSettings();}
      const actual={...voiceSettings(),start:range?.start??null,end:range?.end??null};
      for(const key of keys)if(actual[key]!==approved[key])return staleSettings();
    }
    const values={profile:'dubProfile',concurrency:'dubConcurrency',grouping:'dubGrouping',verification:'dubVerification',timingMode:'dubTimingMode',expression:'dubExpression',deliveryStrength:'dubDeliveryStrength'};
    const checks={keepBackground:'dubKeepBackground',followDelivery:'dubFollowDelivery',sample:'dubSampleOnly'};
    for(const [key,id] of Object.entries(values))if(args[key]!==undefined)el(id).value=String(args[key]);
    for(const [key,id] of Object.entries(checks))if(args[key]!==undefined)el(id).checked=args[key];
    if(args.start!==undefined){el('dubRangeEnabled').checked=true;el('dubRangeStart').value=String(args.start);el('dubRangeEnd').value=String(args.end);}
    if(args.grouping!==undefined||args.start!==undefined)invalidatePlan();controls();refreshOverview();return {ok:true};
  }
  async function voiceStart(args,isCancelled){
    await ensureVoice(isCancelled);
    if(!srt||!cfg?.ready)return {ok:false};return start(false,[],null,{sample:args.sample,isCancelled});
  }
  async function voiceGroup(args,isCancelled){
    await ensureVoice(isCancelled);const row=results.get(args.group_id);if(!row)return {ok:false};
    if(args.operation==='open'&&!plan){await preparePlan();if(isCancelled())return {ok:false};}
    el('dubQualityGroup').value=args.group_id;el('dubQualityGroup').dispatchEvent(new Event('change'));
    if(args.operation==='regenerate'){if(!lastRequest)return {ok:false};return start(true,[args.group_id],null,{isCancelled});}
    if(args.operation==='listen')return {ok:await listenSelectedGroup()===true};
    return {ok:!!plan?.groups.some(group=>group.key===args.group_id)};
  }
  async function voiceUse(id,isCancelled){
    await ensureVoice(isCancelled);const selected=output,context=window.BrowserDubAudioUI?.context();
    if(!selected||selected.id!==id||selected.sample||selected.syncInvalid||!context?.hasMedia||!context.visible)return {ok:false};
    return {ok:await attachSelectedOutput(selected,isCancelled)};
  }
  controls();
})();
