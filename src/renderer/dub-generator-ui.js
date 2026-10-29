(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const modal = el('dubGeneratorDialog');
  let srt = '', cfg = null, current = null, output = null;
  let timer = null, logPath = null;
  let previousOutput=null,previousMedia=null,previousRangeEnd=null;
  let runtimePhases={},runtimeError='';
  const activeGroups=new Map();
  function showActivity(){const en=window.UiLocale?.get?.()==='en';el('dubGeneratorActivity').textContent=[...activeGroups.values()].map(g=>(en?'Group ':'Grup ')+g.group+' · '+(en?'attempt ':'deneme ')+g.attempt+' · '+Math.floor(g.elapsed)+' / '+g.limit+' s').join(' | ');}
  let plan = null, edits = {}, planning = false;
  let backgroundSource = '', choosing = false, configSequence = 0;
  let deliverySource = '';
  let lastRequest = null, lastReferenceQuality = null, lastReferenceIdentity = null, referenceQualityPendingReset = false;
  const results = new Map();
  const resultOptions = new Map();
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
  function refreshOverview() {
    editorProviderHint();
    const notice=el('dubInputNotice');
    if(notice){const partial=/\.partial\.srt$/i.test(srt);notice.hidden=!partial;notice.textContent=partial?(window.UiLocale?.get?.()==='en'?'This is a partial translation. Untranslated lines may be read in their original language; complete the translation for consistent dubbing.':'Bu kısmi bir çeviri. Çevrilmeyen satırlar özgün dilinde okunabilir; tutarlı dublaj için önce çeviriyi tamamlayın.'):'';}
    const source = el('dubReadySource'), voice = el('dubReadyVoice'), range = el('dubReadyRange');
    source.textContent = srt ? basename(srt) : t('SRT seçilmedi'); source.dataset.ready = String(!!srt);
    const activeVoice=current?.voice||cfg;
    voice.textContent = activeVoice?.reference ? basename(activeVoice.reference) : t('Ses seçilmedi'); voice.dataset.ready = String(!!current||!!cfg?.ready);
    const en=window.UiLocale?.get?.()==='en', submitted=current?.settings;
    const grouping={akici:en?'Flowing blocks':'Akıcı bloklar',cumle:en?'Sentence groups':'Cümle grupları',satir:en?'Subtitle rows':'Altyazı satırları'}[submitted?.grouping||el('dubGrouping').value];
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
    const recognized=typeof v.recognizedText==='string'?v.recognizedText.slice(0,8000):'';
    el('dubQualityExpectedLabel').textContent=en?'Expected text':'Beklenen metin';
    el('dubQualityRecognized').hidden=!recognized;
    el('dubQualityRecognizedLabel').textContent=en?'Automatic transcript (ASR) — may contain recognition errors':'Otomatik döküm (ASR) — tanıma hatası içerebilir';
    el('dubQualityRecognizedText').textContent=recognized;
    const similarity=Number.isFinite(v.similarity)&&v.similarity>=0&&v.similarity<=1 ? Math.round(v.similarity*100) : null;
    el('dubQualitySimilarity').textContent=recognized&&similarity!==null ? (en?`Text match (ASR): ${similarity}% · Not a naturalness score.`:`Metin eşleşmesi (ASR): %${similarity} · Doğallık puanı değildir.`) : '';

    for(const [flag,label]of [['spoken_number_mismatch',['Spoken quantity differs','Söylenen sayı farklı']],['lost_negation',['Negation','Olumsuzluk']],['added_negation',['Added negation','Eklenen olumsuzluk']],['semantic_mismatch',['Meaning markers','Anlam işaretleri']],['unit_mismatch',['Units','Birim']],['sign_mismatch',['Number sign','Sayı işareti']],['repetition',['Repetition','Tekrar']]])if(v[flag])reasons.push(label[en?0:1]);
    for(const [key,label]of [['missing_numbers',['Missing number','Eksik sayı']],['added_numbers',['Added number','Ek sayı']],['missing_names',['Name recognition','Özel ad tanıma']],['omission_spans',['Potential omission','Olası atlama']],['insertion_spans',['Potential extra speech','Olası ek konuşma']]])if(v[key]?.length)reasons.push(label[en?0:1]);
    el('dubQualityReasons').textContent=reasons.length?reasons.join(' · ')+(en?' — ASR can be wrong; listen before editing.':' — Otomatik tanıma yanılabilir; düzenlemeden önce dinle.'):row?.status==='review'?(en?'Acoustic or verification check needs listening.':'Ses veya doğrulama kontrolü dinleme gerektiriyor.'):(v.status==='passed' ? (en?'No issue flagged by these checks. This is not a naturalness score.':'Bu kontrollerde işaret yok. Bu bir doğallık puanı değildir.') : (en?'No text comparison is available. Listen before judging completeness or pronunciation.':'Metin karşılaştırması mevcut değil. Eksiksizlik ve telaffuz için dinleyerek kontrol edin.'));
    el('dubQualityExpected').textContent=String(row?.text||row?.displayText||'').slice(0,8000);
    const pronunciation=typeof row?.pronunciationText==='string'?row.pronunciationText.slice(0,8000):'';
    el('dubQualityPronunciation').hidden=!pronunciation||pronunciation===row?.text;
    el('dubQualityPronunciation').textContent=pronunciation?(en?'Pronunciation used for synthesis: ':'Üretimde kullanılan okunuş: ')+pronunciation:'';
  }
  function showResults() {
    const select = el('dubQualityGroup'), previous = select.value;
    select.replaceChildren(); resultOptions.clear();
    for (const row of [...results.values()].sort((a,b) => a.group - b.group)) {
      const option = document.createElement('option'); option.value = row.key;
      option.textContent = `${row.group} · ${t(row.status === 'failed' ? 'Üretilemedi; bu bölüm sessiz' : row.status === 'review' ? 'Dinleyerek kontrol edin' : 'Hazır')}`;
      select.append(option);
      resultOptions.set(row.key, option);
    }
    if (results.has(previous)) select.value = previous;
    qualityInfo();
    controls();
  }
  function updateResult(row) {
    results.set(row.key, row);
    let option = resultOptions.get(row.key);
    if (!option) { option = document.createElement('option'); option.value = row.key;
      el('dubQualityGroup').append(option); resultOptions.set(row.key, option); }
    option.textContent = `${row.group} · ${t(row.status === 'failed' ? 'Üretilemedi; bu bölüm sessiz' : row.status === 'review' ? 'Dinleyerek kontrol edin' : 'Hazır')}`;
    qualityInfo();
  }
  function referenceInfo(quality) {
    lastReferenceQuality = quality;
    lastReferenceIdentity = quality ? current?.voice?.reference || cfg?.reference || null : null;
    const labels = {quiet:'Referans sesi çok kısık',clipping:'Referansta ses patlaması var',silence:'Referansta uzun sessizlik var',short:'Referans çok kısa'};
    el('dubReferenceQuality').textContent = quality ? (quality.warnings || []).map(w => t(labels[w] || w)).join(' · ') || t('Referansın ses düzeyi uygun; konuşmacı ve müziği dinleyerek kontrol edin.') : '';
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
  function selectedRange() {
    if (!el('dubRangeEnabled').checked) return null;
    const range = { start: timecode(el('dubRangeStart').value), end: timecode(el('dubRangeEnd').value) };
    if (range.end <= range.start || range.end > 86400) throw new Error('Geçersiz zaman aralığı.');
    return range;
  }
  function showGroup() {
    const g = group();
    el('dubPlanOriginal').value = g?.text || '';
    el('dubPlanText').value = g ? (edits[g.key] || g.text) : '';
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
  function controls() {
    retryLabel();
    const voice = current?.voice || cfg;
    el('dubEngineName').textContent = voice?.engine || '';
    el('dubVoiceName').textContent = basename(voice?.reference || '');
    el('dubTranscriptName').textContent = basename(voice?.transcript || '');
    if (!current && (referenceQualityPendingReset || lastReferenceQuality && lastReferenceIdentity !== cfg?.reference)) { referenceInfo(null); referenceQualityPendingReset=false; }
    const locked = !!current || referenceBusy || planning || choosing || workspaceBusy;
    for (const id of ['dubChooseSrt', 'dubChooseEngine', 'dubChooseVoice', 'dubChooseTranscript', 'dubSampleOnly', 'dubProfile', 'dubConcurrency', 'dubKeepEngine', 'dubTimingMode', 'dubVerification', 'dubAutoFit', 'dubNaturalSpeech']) el(id).disabled = locked;
    el('dubGrouping').disabled = locked;
    el('dubFollowDelivery').disabled = locked;
    el('dubDeliveryStrength').disabled = locked || !el('dubFollowDelivery').checked;
    el('dubChooseDeliverySource').disabled = el('dubResetDeliverySource').disabled = locked || !el('dubFollowDelivery').checked;
    el('dubExpression').disabled = locked || el('dubFollowDelivery').checked;
    el('dubRetryFailed').disabled = locked || !lastRequest || !cfg?.ready;
    el('dubRegenerateGroup').disabled = locked || !lastRequest || !results.size || !cfg?.ready;
    el('dubQualityGroup').disabled = locked || !results.size;
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
    el('dubPronunciations').disabled = locked; el('dubPronunciationSave').disabled = locked;
    for (const name of Object.keys(presetSpecs)) el(`dubPreset${name}`).disabled = locked;
    refreshOverview();
    window.dispatchEvent(new CustomEvent('dub-generator:busy',{detail:!!current||referenceBusy||planning||choosing}));
    window.dispatchEvent(new Event('dub-takes:context'));
    el('browserDubGenerate')?.classList.toggle('active', !!current);
  }
  const pronunciationLabels = () => {
    const en = document.documentElement.lang !== 'tr';
    el('dubPronunciationTitle').textContent = en ? 'Pronunciation dictionary' : 'Telaffuz sözlüğü';
    el('dubPronunciationHelp').textContent = en ? 'One case-sensitive entry per line: Newton = Nyutın. Applies only to speech; subtitles stay unchanged.' : 'Her satıra bir eşleşme: Newton = Nyutın. Büyük/küçük harf duyarlıdır. Yalnız üretilen sese uygulanır; altyazı değişmez.';
    el('dubPronunciationSave').textContent = en ? 'Save pronunciations' : 'Telaffuzları kaydet';
    if (el('dubPronunciationStatus').dataset.saved) el('dubPronunciationStatus').textContent=en?'Saved. Applies to the next generation.':'Kaydedildi. Sonraki ses üretiminde uygulanır.';
  };
  el('dubPronunciationSave').addEventListener('click', async () => {
    if (current || planning || referenceBusy || choosing || workspaceBusy) return;
    const en = document.documentElement.lang !== 'tr';
    try {
      const entries=el('dubPronunciations').value.split(/\r?\n/).filter(line=>line.trim()).map(line=>{
        const index=line.indexOf('=');
        if(index<1) throw new Error(en?'Use: word = pronunciation':'Biçim: sözcük = okunuş');
        return {from:line.slice(0,index).trim(),to:line.slice(index+1).trim()};
      });
      const result=await window.api.saveDubPronunciations(entries);
      if(!result?.ok) throw new Error(result?.error || 'Save failed');
      cfg.pronunciations=result.pronunciations; el('dubPronunciationStatus').dataset.saved='true';
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
    if (!current && !preserveOptions) el('dubPronunciations').value = (r.pronunciations || []).map(row => `${row.from} = ${row.to}`).join('\n');
    if(!current && !preserveOptions)el('dubKeepEngine').checked=r.keepEngine!==false;
    el('dubStorageOpen').disabled = !r.storageRoot;
    if (!current && !preserveOptions) { el('dubProfile').value = r.profile || 'quality'; el('dubConcurrency').value = String(r.concurrency || 4); }
    if (!current && !preserveOptions) el('dubTimingMode').value = r.timingMode || 'video';
    if (!current && !preserveOptions) el('dubExpression').value = r.expression || 'reference';
    if (!current && !preserveOptions) { el('dubFollowDelivery').checked = r.followDelivery === true; el('dubDeliveryStrength').value = r.deliveryStrength || 'balanced'; }
    if (!current && !preserveOptions && !plan) el('dubGrouping').value = r.grouping || 'akici';
    if (!current && !preserveOptions) { el('dubVerification').value = r.verification || 'detailed'; el('dubAutoFit').checked = r.autoFit !== false; el('dubNaturalSpeech').checked = r.naturalSpeech !== false; }
    if (!current && kind === 'reference') referenceInfo(null);
    if (!current && !r.ready) status('Motor veya referans eksik; ses ve motor ayarlarını kontrol edin.');
    controls();
  }
  function inheritSubtitleRange() {
    if (current || planning) return;
    const context = window.BrowserDubAudioUI?.context();
    const mediaKey = JSON.stringify([context?.mode, context?.tabId, context?.mediaId || context?.mediaKey]);
    if (mediaContextKey !== null && mediaContextKey !== mediaKey) {
      srt = ''; backgroundSource = ''; el('dubSrtName').textContent = '—'; el('dubBackgroundName').textContent = '';
      deliverySource='';el('dubDeliverySourceName').textContent='';
      lastRequest = null; results.clear(); showResults();
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
    stopGroupPreview();
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
    el('dubGeneratedName').textContent=output.name||basename(output.path||'');
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
    srt = candidate; lastRequest = null; results.clear(); showResults(); invalidatePlan();
    el('dubSrtName').textContent = basename(candidate); refreshOverview(); status('Hazır');
  }
  async function open() {
    inheritSubtitleRange();
    const candidate = currentSubtitle();
    if (!modal.open) modal.showModal();
    syncBrowserOcclusion();
    const openedMedia=requestIdentity();
    await configure();
    if (openedMedia !== requestIdentity()) return;
    if (candidate === currentSubtitle()) adoptCurrentSubtitle(candidate);
    if (!current && !output) {
      const selection = () => JSON.stringify([srt,el('dubRangeEnabled').checked,el('dubRangeStart').value,el('dubRangeEnd').value]);
      const requestedSelection = selection();
      const lookup = {source:window.BrowserDubAudioUI?.context()?.source || window.BrowserDubAudioUI?.context()?.mediaKey || ''};
      if (srt) { try { lookup.srt=srt; lookup.range=selectedRange(); } catch (_) { return; } }
      const r = await window.api.latestDub(lookup).catch(() => null);
      if (openedMedia !== requestIdentity() || requestedSelection !== selection() || current || output || !r?.output) return;
      output = r.output;
      if (!srt) {
        el('dubRangeEnabled').checked=!!output.range;
        if(output.range){const format=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;el('dubRangeStart').value=format(output.range.start);el('dubRangeEnd').value=format(output.range.end);}
      }
      controls(); window.DubWorkspaceUI?.setOutput(output); logPath = output.logPath; preview(output);
      el('dubGeneratorOutput').classList.remove('hidden');
      el('dubGeneratorUse').classList.toggle('hidden', output.sample === true || output.syncInvalid === true);
      results.clear(); for (const row of output.quality?.groups || []) results.set(row.key, row); showResults();
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      el('dubGeneratedName').textContent = output.name;
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
  window.DubGeneratorUI = Object.freeze({ prepareCurrent: open, takeContext:()=>({id:output?.id||'',key:el('dubQualityGroup').value,owner:mediaIdentity(),busy:!!current||referenceBusy||planning||choosing||workspaceBusy,recipeReady:!!lastRequest}), useTake:(key,token)=>start(true,[],{[key]:token}), assistant:Object.freeze({state:voiceState,configure:voiceConfigure,start:voiceStart,group:voiceGroup,use:voiceUse,refreshReference:()=>configure(undefined,true)}) });
  el('dubGeneratorClose').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => { el('dubGeneratedPreview').pause(); syncBrowserOcclusion(); });
  el('dubStorageOpen').addEventListener('click', () => { if (cfg?.storageRoot) void window.api.openPath(cfg.storageRoot); });
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
          srt = result; lastRequest = null; results.clear(); showResults(); invalidatePlan(); el('dubSrtName').textContent = basename(result); status('Hazır');
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
  el('dubResetDeliverySource').addEventListener('click',()=>{deliverySource='';el('dubDeliverySourceName').textContent='';});
  async function preparePlan() {
    if (planning || current || referenceBusy || choosing || !srt) return;
    const media = requestIdentity();
    planning = true; controls();
    try {
      const r = await window.api.planDub({ srt, range: selectedRange(), grouping: el('dubGrouping').value });
      if (media !== requestIdentity()) return;
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
    for (const [key,value] of Object.entries(settings)) {
      const input = el(`dub${key[0].toUpperCase()}${key.slice(1)}`);
      if (typeof value === 'boolean') input.checked = value; else input.value = value;
    }
    controls();
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
    const g = group(), text = el('dubPlanText').value.trim();
    if (!g || !text) return;
    if (text === g.text) delete edits[g.key]; else edits[g.key] = text;
    showGroup(); status('Dublaj metni uygulandı.');
  });
  el('dubPlanReset').addEventListener('click', () => { const g = group(); if (g) delete edits[g.key]; showGroup(); });
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
  async function start(retry = false, forceGroups = [], takeChoices = null) {
    if (current || referenceBusy || planning || choosing || workspaceBusy || !srt || !cfg?.ready) return;
    let range;
    try { range = selectedRange(); } catch (error) { status(error.message); return; }
    current = { id: crypto.randomUUID(), qualityKey:retry?el('dubQualityGroup').value:'', voice:{reference:cfg.reference,transcript:cfg.transcript,engine:cfg.engine}, context: window.BrowserDubAudioUI?.context(), sample: retry ? lastRequest?.sample : el('dubSampleOnly').checked };
    const pending = current;
    pending.fallback=output?.url?{output,rows:[...results.values()],media:mediaIdentity(),srt,sample:el('dubGeneratorUse').classList.contains('hidden')}:null;
    const started = performance.now();
    elapsed(0); stopTimer();activeGroups.clear();showActivity();
    timer = setInterval(() => elapsed((performance.now() - started) / 1000), 1000);
    logPath = null; el('dubGeneratorLog').classList.add('hidden');
    if(output?.url){if(lastRequest?.srt===srt){previousOutput=output;previousMedia=mediaIdentity();}else resetComparison();}
    output = null; window.DubWorkspaceUI?.setOutput(null); preview(null); el('dubGeneratorOutput').classList.add('hidden');
    el('dubGeneratedName').textContent = '';
    el('dubGeneratorUse').classList.add('hidden');
    el('dubGeneratorDetails').textContent = ''; el('dubGeneratorCount').textContent = '';
    el('dubGeneratorTiming').textContent = '';
    el('dubGeneratorProgress').removeAttribute('value');
    runtimePhases={};runtimeError='';el('dubPhaseSummary').textContent='';
    status('Motor yükleniyor…'); controls();
    const payload = retry ? {...lastRequest, id:pending.id, forceGroups,
      dubText: plan ? {sourceHash:plan.sourceHash, edits:{...edits}} : lastRequest.dubText} : { id: pending.id, srt, sample: pending.sample,
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
    pending.settings={...payload};refreshOverview();
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
  el('dubQualityGroup').addEventListener('change',()=>{qualityInfo();const key=el('dubQualityGroup').value,index=plan?.groups.findIndex(g=>g.key===key);if(index>=0){el('dubPlanGroup').value=String(index);showGroup();for(let node=el('dubPlanText');node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;el('dubPlanText').focus();el('dubPlanText').scrollIntoView?.({block:'center'});}});
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
    const r = await window.api.cancelDub().catch(() => null);
    if (current !== pending) return;
    if (!r?.ok && current) { current.stopping = false; status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); controls(); }
  });
  el('dubGeneratorOutput').addEventListener('click', () => { if (output) void window.api.openPath(output.path); });
  el('dubGeneratorUse').addEventListener('click', async () => {
    const selected = output;
    if (!selected || selected.sample || selected.syncInvalid) return;
    const context = window.BrowserDubAudioUI?.context();
    if (!context?.tabId || !context.hasMedia || !context.visible) {
      status('Ses eklemek için önce bir video açın.'); return;
    }
    el('dubGeneratedPreview').pause();
    el('dubGeneratorUse').disabled = true;
    try {
      const attached = await window.BrowserDubAudioUI.attachGenerated({ name: selected.name, url: selected.url, range: selected.range, sync: selected.sync, background: selected.background, ...window.DubWorkspaceUI?.attachment(selected) }, context);
      if (output === selected) status(attached ? 'Üretim tamamlandı; dublaj videoya bağlandı.' : 'Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.');
    } catch (_) { status('Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.'); }
    finally { el('dubGeneratorUse').disabled = false; }
  });
  el('dubTextStudio').addEventListener('click', async () => {
    const r = await window.api.openTextVoiceUI().catch(() => null);
    if (!r?.ok) { status('Metin stüdyosu açılamadı.'); el('dubGeneratorDetails').textContent = r?.error || ''; }
    else status('Metin stüdyosu açık. Metin yapıştırabilir veya TXT dosyası seçebilirsiniz.');
  });
  el('dubGeneratorLog').addEventListener('click', () => { if (logPath) void window.api.openPath(logPath); });
  window.api.onDubEvent(event => {
    if (event.type === 'studio_error') { status(event.error || 'Metin seslendirme stüdyosu başlatılamadı.'); return; }
    const job = current;
    if (!job || event.id !== job.id) return;
    if (job.stopping && !['done','error','cancelled'].includes(event.type)) return;
    if (event.type === 'progress') {
      status('Ses üretiliyor…'); el('dubGeneratorCount').textContent = `${event.done}/${event.total}`;
      el('dubGeneratorProgress').value = event.total ? event.done / event.total * 100 : 0;
    } else if(event.type==='activity'){if(Number.isInteger(event.group)&&event.group>0&&(activeGroups.size<8||activeGroups.has(event.group))){activeGroups.set(event.group,event);showActivity();}}
    else if (event.type === 'group') {activeGroups.delete(event.group.group);showActivity();updateResult(event.group);}
    else if(event.type==='phases')phaseSummary(event.phases);
    else if(event.type==='engine'){if(event.kind==='DUB_ENGINE'&&event.reused)status(window.UiLocale?.get?.()==='en'?'Using the ready voice engine…':'Hazır ses motoru kullanılıyor…');if(event.kind==='DUB_CAPACITY')el('dubGeneratorDetails').textContent=(window.UiLocale?.get?.()==='en'?'GPU free memory: ':'GPU boş bellek: ')+event.freeMiB+' MiB · '+event.concurrency+' / '+event.requested;}
    else if (event.type === 'voice') {
      if (typeof event.reference === 'string' && typeof event.transcript === 'string' && typeof event.engine === 'string') {
        if (job.voice?.reference !== event.reference) referenceInfo(null);
        job.voice={reference:event.reference,transcript:event.transcript,engine:event.engine};controls();
      }
    }
    else if (event.type === 'reference_quality') referenceInfo(event.quality);
    else if (event.type === 'concurrency') { status('GPU belleği için paralel üretim azaltıldı.'); el('dubGeneratorDetails').textContent = `${event.concurrency} · ${t('Paralel üretim')}`; }
    else if (event.type === 'status') {if(event.stage==='engine_restart'){activeGroups.clear();showActivity();}status(event.text);}
    else if (event.type === 'warning') {
      const en=window.UiLocale?.get?.()==='en',reasons={configuration:en?'Check the translation provider settings.':'Çeviri sağlayıcısı ayarlarını kontrol edin.',authentication:en?'The translation provider rejected authentication.':'Çeviri sağlayıcısı kimlik doğrulamayı reddetti.',rate_limit:en?'The provider rate limit was reached.':'Sağlayıcı istek sınırına ulaşıldı.',timeout:en?'The text editor timed out.':'Metin düzenleyicisi zaman aşımına uğradı.',output_limit:en?'The editor response exceeded its output budget.':'Düzenleme yanıtı çıktı sınırında kesildi.',empty_reply:en?'The editor returned no text.':'Düzenleyici metin döndürmedi.',meaning_guard:en?'The proposed wording did not pass the meaning check.':'Önerilen metin anlam denetiminden geçmedi.',provider:en?'The translation provider could not complete the request.':'Çeviri sağlayıcısı isteği tamamlayamadı.'};
      el('dubGeneratorDetails').textContent=t(event.text)+(reasons[event.reason]?' '+reasons[event.reason]:'');
    }
    else if (event.type === 'timing') el('dubGeneratorTiming').textContent = `${event.accelerated} / ${event.clipped}`;
    else if (['done','error','cancelled'].includes(event.type)) {
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
        el('dubGeneratedName').textContent = event.name;
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
          preview(output); el('dubGeneratedName').textContent = event.name || basename(output.path);
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
    showResults(); el('dubGeneratedName').textContent=output.name;
    el('dubGeneratorOutput').classList.remove('hidden');
    el('dubGeneratorUse').classList.toggle('hidden',output.sample===true || output.syncInvalid===true);
    // A project carries rendered media, not an executable engine request.
    srt=output.subtitle || ''; lastRequest=null; plan=null; edits={};
    el('dubRangeEnabled').checked=!!output.range;
    if(output.range){el('dubRangeStart').value=String(output.range.start);el('dubRangeEnd').value=String(output.range.end);}
    el('dubSrtName').textContent=basename(srt); controls();
    status(output.syncInvalid ? 'Ses dosyası hazır; zaman haritası geçersiz. Videoyla senkron garanti edilemez.'
      : output.qualityUnavailable ? qualityWarning(output)
      : 'Dublaj projesi açıldı. Videoyu kontrol edip Sesi kullan düğmesine basın.');
  });

  function voiceSettings(){return {profile:el('dubProfile').value,concurrency:Number(el('dubConcurrency').value),grouping:el('dubGrouping').value,verification:el('dubVerification').value,timingMode:el('dubTimingMode').value,expression:el('dubExpression').value,keepBackground:el('dubKeepBackground').checked,followDelivery:el('dubFollowDelivery').checked,deliveryStrength:el('dubDeliveryStrength').value,sample:el('dubSampleOnly').checked};}
  function voiceState(query={}){
    if(mediaContextKey!==null&&mediaContextKey!==mediaIdentity())return {opened:modal.open,busy:!!current||planning||referenceBusy||choosing||workspaceBusy,sourceChanged:true,subtitleReady:false,engineAndReferenceReady:false,output:null,groups:[],counts:{total:0,review:0,failed:0},note:'Voice preparation belongs to another source. Open the current video voice panel / Ses hazırlığı başka kaynağa ait. Güncel videonun ses panelini aç.'};
    let range=null,invalidRange=false;try{range=selectedRange();}catch(_){invalidRange=true;}
    const groups=[...results.values()].sort((a,b)=>Number(a.status==='ready')-Number(b.status==='ready')||a.group-b.group);
    const offset=query.offset??0;if(!Number.isInteger(offset)||offset<0||offset>10000)throw Error('Invalid voice group offset.');
    const visible=query.group_id?groups.filter(row=>row.key===query.group_id):groups.slice(offset,offset+30),nextOffset=!query.group_id&&offset+30<groups.length?offset+30:null;
    return {opened:modal.open,busy:!!current||referenceBusy||planning||choosing||workspaceBusy,subtitleReady:!!srt,engineAndReferenceReady:!!cfg?.ready,
      settings:voiceSettings(),range,invalidRange,canRegenerate:!!lastRequest&&!!cfg?.ready,
      output:output?{id:output.id,sample:output.sample===true,syncInvalid:output.syncInvalid===true,qualityUnavailable:output.qualityUnavailable===true}:null,
      counts:{total:groups.length,review:groups.filter(row=>row.status==='review').length,failed:groups.filter(row=>row.status==='failed').length},
      groups:visible.map(row=>({id:row.key,number:row.group,status:row.status,text:String(row.text||row.displayText||'').slice(0,220),verification:String(row.verification?.status||'not_checked')})),groupOffset:offset,nextOffset,groupsTruncated:nextOffset!==null};
  }
  async function ensureVoice(isCancelled){
    if(!modal.open)await window.DubGeneratorUI.prepareCurrent();else if(!cfg)await configure();
    if(isCancelled())throw Error('The source changed / Kaynak değişti.');
    if(current||referenceBusy||planning||choosing||workspaceBusy)throw Error('Voice controls are busy / Ses kontrolleri meşgul.');
  }
  async function voiceConfigure(args,isCancelled){
    await ensureVoice(isCancelled);
    const values={profile:'dubProfile',concurrency:'dubConcurrency',grouping:'dubGrouping',verification:'dubVerification',timingMode:'dubTimingMode',expression:'dubExpression',deliveryStrength:'dubDeliveryStrength'};
    const checks={keepBackground:'dubKeepBackground',followDelivery:'dubFollowDelivery',sample:'dubSampleOnly'};
    for(const [key,id] of Object.entries(values))if(args[key]!==undefined)el(id).value=String(args[key]);
    for(const [key,id] of Object.entries(checks))if(args[key]!==undefined)el(id).checked=args[key];
    if(args.start!==undefined){el('dubRangeEnabled').checked=true;el('dubRangeStart').value=String(args.start);el('dubRangeEnd').value=String(args.end);}
    if(args.grouping!==undefined||args.start!==undefined)invalidatePlan();controls();refreshOverview();return {ok:true};
  }
  async function voiceStart(args,isCancelled){
    await ensureVoice(isCancelled);if(args.sample!==undefined)el('dubSampleOnly').checked=args.sample;
    if(!srt||!cfg?.ready)return {ok:false};return start();
  }
  async function voiceGroup(args,isCancelled){
    await ensureVoice(isCancelled);const row=results.get(args.group_id);if(!row)return {ok:false};
    if(args.operation==='open'&&!plan){await preparePlan();if(isCancelled())return {ok:false};}
    el('dubQualityGroup').value=args.group_id;el('dubQualityGroup').dispatchEvent(new Event('change'));
    if(args.operation==='regenerate'){if(!lastRequest)return {ok:false};return start(true,[args.group_id]);}
    if(args.operation==='listen')return {ok:await listenSelectedGroup()===true};
    return {ok:!!plan?.groups.some(group=>group.key===args.group_id)};
  }
  async function voiceUse(id,isCancelled){
    await ensureVoice(isCancelled);const selected=output,context=window.BrowserDubAudioUI?.context();
    if(!selected||selected.id!==id||selected.sample||selected.syncInvalid||!context?.hasMedia||!context.visible)return {ok:false};
    // A source+ID query proves both against the main log, rather than trusting
    // a renderer/project's most recently displayed output from another video.
    const proof=await window.api.latestDub({id,source:context.source||context.mediaKey});
    if(isCancelled()||output!==selected||!proof?.ok||proof.output?.id!==id||proof.output.sample||proof.output.syncInvalid)return {ok:false};
    el('dubGeneratedPreview').pause();
    return {ok:await window.BrowserDubAudioUI.attachGenerated({...proof.output,...window.DubWorkspaceUI?.attachment(selected)},context)===true};
  }
  controls();
})();
