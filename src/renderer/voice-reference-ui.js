(() => {
  'use strict';
  const el = id => document.getElementById(id), api = window.api;
  if (!api.prepareVoiceReference) return;
  const panel = el('voiceReferenceRecorder');
  let activeReferenceId='',appliedReferenceText='';const selectionStatus=document.createElement('p');selectionStatus.className='voice-selection-status';selectionStatus.id='voiceReferenceSelectionStatus';selectionStatus.setAttribute('role','status');el('voiceReferenceUse').parentElement.after(selectionStatus);

  const comparison = window.VoiceReferenceCompare?.mount(el('voiceReferenceAB'), {
    onUse: id => window.VoiceReferenceUI.use(id),
    onError: error => status(error.message),
    otherAudio: () => el('voiceReferencePreview'),
  });
  el('voiceReferencePreview').addEventListener('play', () => comparison?.stop());

  let active = null, stopping = false, references = [], folder = '', applying = false;
  let localSource = '', selectingSource = false;
  let refreshSequence = 0;
  const drafts = new Map();
  const rememberDraft = () => { const item = selected(); if (item) drafts.set(item.id, { name: el('voiceReferenceName').value, text: el('voiceReferenceText').value }); };
  const t = value => window.UiLocale?.t(value) || value;
  const status = value => { el('voiceReferenceStatus').textContent = t(value); };
  const failure = error => {
    status('Referans hazırlanamadı; kaynağı ve konuşma aralığını kontrol edin.');
    const messages = {
      'Audio server connection failed. Check your network or proxy.': 'Ses sunucusuna bağlanılamadı. Ağ veya proxy bağlantısını kontrol edin.',
      'YouTube rejected the audio connection; retry or use a local video.': 'YouTube ses bağlantısını reddetti. Yeniden deneyin veya yerel video kullanın.',
      'No clear speech found; select a single speaker without music.': 'Net konuşma bulunamadı. Tek konuşmacılı ve müziksiz bir bölüm seçin.',
      'The selected interval is outside the available audio.': 'Seçilen aralık mevcut sesin dışında.',
      'Open the YouTube video first.': 'Önce YouTube videosunu açın.'
    };
    if (typeof error === 'string' && error.trim()) el('voiceReferenceStatus').textContent += ' ' + t(messages[error] || error.slice(0, 500));
  };
  const selected = () => references.find(item => item.id === el('voiceReferenceSelect').value);
  function transcriptComparison() {
    const item=selected(),baseline=item?.transcriptBaseline;
    const en=window.UiLocale?.get?.()==='en',has=typeof baseline==='string'&&!!baseline.trim();
    const normalize=text=>String(text||'').normalize('NFC').replace(/\s+/g,' ').trim();
    const changed=has&&normalize(baseline)!==normalize(el('voiceReferenceText').value);
    el('voiceReferenceComparison').hidden=!item;
    el('voiceReferenceComparisonTitle').textContent=!has?(en?'No original transcript to compare':'Karşılaştırılacak ilk döküm yok'):changed?(en?'Transcript edited · compare changes':'Döküm düzenlendi · farkları karşılaştır'):(en?'Matches the first automatic transcript':'İlk otomatik dökümle aynı');
    el('voiceReferenceComparisonHint').textContent=has?(en?'Compared with the automatic transcript captured for this audio. Recognition can be wrong; listen before using it. Your corrections are allowed.':'Bu ses için alınan ilk otomatik dökümle karşılaştırılır. Tanıma hatalı olabilir; kullanmadan önce dinleyin. Metni düzeltebilirsiniz.'):(en?'This recording has no audio-matched original transcript. It has not been checked. Prepare it again to create a comparison baseline.':'Bu kaydın sesle eşleşen ilk dökümü yok; uyumu kontrol edilmiş sayılmaz. Karşılaştırma için referansı yeniden hazırlayın.');
    el('voiceReferenceComparisonColumns').hidden=!has;
    el('voiceReferenceRestoreTranscript').hidden=!has;
    el('voiceReferenceRestoreTranscript').disabled=!changed||!!active||applying||selectingSource;
    el('voiceReferenceRestoreTranscript').textContent=en?'Restore first transcript to editor':'İlk dökümü düzenleyiciye getir';
    el('voiceReferenceOriginalLabel').textContent=en?'First automatic transcript':'İlk otomatik döküm';
    el('voiceReferenceEditedLabel').textContent=en?'Current text':'Düzenlenen metin';
    // Reference transcripts are plain text, not subtitle markup. Keep literal
    // tags visible rather than letting the subtitle diff's normalizer strip them.
    const edited=el('voiceReferenceText').value;
    const literalMarkup=/[<>]|\{\\/.test(String(baseline||'')+edited);
    const parts=has&&window.TranslationDiff?.wordParts&&!literalMarkup?window.TranslationDiff.wordParts(baseline,edited):has?{before:[{text:baseline,kind:changed?'del':'same'}],after:[{text:edited,kind:changed?'add':'same'}]}:null;
    for(const [id,values] of [['voiceReferenceOriginal',parts?.before],['voiceReferenceEdited',parts?.after]]){
      const target=el(id);target.replaceChildren();
      for(const part of values||[]){const span=document.createElement('span');span.textContent=part.text+' ';if(part.kind!=='same')span.className='reference-diff-'+part.kind;target.append(span);}
    }
  }
  function controls() {
    const chosen=selected(),en=window.UiLocale?.get?.()==='en',changed=chosen?.id===activeReferenceId&&String(el('voiceReferenceText').value)!==appliedReferenceText;
    selectionStatus.textContent=!chosen?(en?'Choose a reference voice.':'Referans ses seçin.'):chosen.id!==activeReferenceId?(en?'Selected, not applied — use this voice to activate it.':'Seçildi, uygulanmadı — etkinleştirmek için Bu sesi kullan.'):changed?(en?'Transcript changes are not applied yet.':'Döküm değişiklikleri henüz uygulanmadı.'):(en?'This reference is active.':'Bu referans etkin.');
    selectionStatus.dataset.state=chosen&&(chosen.id!==activeReferenceId||changed)?'pending':'active';

    for (const id of ['voiceReferencePrepare','voiceReferenceStart','voiceReferenceEnd','voiceReferenceSearch','voiceReferenceSelect','voiceReferenceText','voiceReferenceName']) el(id).disabled = !!active || applying || selectingSource;
    el('voiceReferenceCancel').disabled = !active || stopping;
    const generating = !el('dubGeneratorCancel').disabled;
    el('voiceReferencePrepare').disabled = !!active || applying || generating || selectingSource;
    el('voiceReferenceLocal').disabled = !!active || applying || generating || selectingSource;
    el('voiceReferenceVideo').disabled = !!active || applying || generating || selectingSource;
    el('voiceReferenceUse').disabled = !!active || applying || generating || !selected() || !el('voiceReferenceText').value.trim();
    el('voiceReferenceRename').disabled = !!active || applying || generating || !selected() || !el('voiceReferenceName').value.trim();
    el('voiceReferenceFolder').disabled = !folder;
    comparison?.update(references, { busy: !!active || applying || generating || selectingSource, selectedId: selected()?.id });
    transcriptComparison();
    referenceDetails();
  }
  function show() {
    const item = selected(), audio = el('voiceReferencePreview');
    audio.pause();
    if (item) audio.src = item.url; else audio.removeAttribute('src');
    audio.classList.toggle('hidden', !item); audio.load();
    const draft = item && drafts.get(item.id);
    el('voiceReferenceName').value = draft?.name ?? item?.name ?? '';
    el('voiceReferenceText').value = draft?.text ?? item?.text ?? ''; controls();
  }
  function referenceDetails() {
    const item=selected(),quality=item?.quality,audio=item?.audio,en=window.UiLocale?.get?.()==='en';
    const node=el('voiceReferenceQuality'),parts=[];
    if(audio&&Number.isFinite(audio.seconds)&&Number.isFinite(audio.sampleRate)&&Number.isInteger(audio.channels)){
      parts.push((en?'Prepared recording: ':'Hazırlanan kayıt: ')+audio.seconds.toFixed(2)+(en?' s':' sn')+' · '+(audio.sampleRate/1000)+' kHz · '+(audio.channels===1?'Mono':audio.channels===2?'Stereo':audio.channels+(en?' channels':' kanal')));
    }
    const labels={quiet:en?'Reference is very quiet':'Referans sesi çok kısık',clipping:en?'Reference has clipping':'Referansta ses patlaması var',silence:en?'Reference has long silence':'Referansta uzun sessizlik var',short:en?'Reference is too short':'Referans çok kısa'};
    if(quality){parts.push(...(quality.warnings||[]).filter(w=>labels[w]).map(w=>labels[w]));if(Number.isFinite(quality.suggested_start)&&Number.isFinite(quality.suggested_end))parts.push((en?'Suggested segment: ':'Önerilen kesit: ')+quality.suggested_start+'–'+quality.suggested_end+(en?' s':' sn'));}
    if(item)parts.push(en?'Listen for one clear speaker without music. A different reference language can change pronunciation; voice likeness and naturalness are not guaranteed.':'Müziksiz, tek ve net konuşmacı olduğunu dinleyerek kontrol edin. Referansın farklı dilde olması telaffuzu etkileyebilir; ses benzerliği ve doğallık garanti edilmez.');
    node.textContent=parts.join(' · ');node.dataset.uiUntranslated='';
  }

  const folded = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i');
  function renderReferences(prior = el('voiceReferenceSelect').value, allowFallback = false) {
    const select = el('voiceReferenceSelect'), query = folded(el('voiceReferenceSearch').value.trim());
    const matches = references.filter(item => folded(item.name+' '+(drafts.get(item.id)?.name||'')).includes(query));
    select.replaceChildren();
    const option = item => {
      const n=document.createElement('option');n.value=item.id;n.textContent=item.name;n.setAttribute('data-ui-untranslated','');return n;
    };
    const pinned=references.find(item=>item.id===prior);
    if (query && pinned && !matches.includes(pinned)) {
      const group=document.createElement('optgroup');group.label=t('Seçili referans');group.append(option(pinned));select.append(group);
    }
    for (const item of matches) select.append(option(item));
    if (pinned) select.value=prior;
    else if (!allowFallback) select.value='';
    const en=window.UiLocale?.get?.()==='en';
    el('voiceReferenceCount').textContent=query
      ? (en?`${matches.length} / ${references.length} matches · selection stays unchanged`:`${matches.length} / ${references.length} eşleşme · seçili ses değişmez`)
      : (en?`${references.length} saved references`:`${references.length} kayıtlı referans`);
  }
  const revealPicker = () => el('voiceReferencePicker').scrollIntoView?.({block:'nearest',behavior:'auto'});
  el('voiceReferenceSearch').addEventListener('focus', revealPicker);
  el('voiceReferenceSearch').addEventListener('input', () => { rememberDraft();renderReferences();controls();revealPicker(); });
  document.addEventListener('ui-locale-change', () => {renderReferences();controls();});
  async function refresh(preferred) {
    const sequence = ++refreshSequence;
    const result = await api.listVoiceReferences().catch(() => null);
    if (sequence !== refreshSequence) return false;
    if (!result?.ok) { if (preferred) { el('voiceReferenceSelect').value = ''; show(); } status('Referans sesler okunamadı.'); return false; }
    activeReferenceId=result.activeId||'';appliedReferenceText=String(result.references?.find(item=>item.id===activeReferenceId)?.text||'');
    const prior = preferred || el('voiceReferenceSelect').value || result.activeId;
    folder = result.folder; references = result.references;
    renderReferences(prior, !preferred);
    if (preferred && !references.some(item => item.id === preferred)) el('voiceReferenceSelect').value = '';
    show();
    return !preferred || !!selected();
  }
  function open(trigger) {
    el(trigger).click(); panel.open = true;
    requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest' }));
  }
  el('browserVoiceReferenceOpen').addEventListener('click', () => { el('browserTranslateMenu').open = false; open('browserDubGenerate'); });
  el('playerVoiceReferenceOpen').addEventListener('click', () => open('playerDubGenerate'));
  panel.addEventListener('toggle', () => { if (panel.open && !active && !applying) void refresh(); });
  el('voiceReferenceSelect').addEventListener('change', () => { renderReferences();show(); });
  el('voiceReferenceName').addEventListener('input', () => { rememberDraft(); controls(); });
  el('voiceReferenceRename').addEventListener('click', async () => {
    const item = selected(); if (!item || active || applying) return;
    applying = true; ++refreshSequence; controls();
    try {
      const result = await api.renameVoiceReference({ id: item.id, name: el('voiceReferenceName').value });
      if (!result?.ok) { status('Referans adı kaydedilemedi.'); return; }
      item.name = result.name; el('voiceReferenceName').value = result.name; rememberDraft();
      const option = el('voiceReferenceSelect').selectedOptions[0];
      if (option) option.textContent = result.name;renderReferences(item.id);
      status('Referans adı kaydedildi.');
    } catch (_) { status('Referans adı kaydedilemedi.'); }
    finally { applying = false; controls(); }
  });
  el('voiceReferenceText').addEventListener('input', () => { rememberDraft(); controls(); });
  el('voiceReferenceRestoreTranscript').addEventListener('click',()=>{
    const item=selected();if(active||applying||selectingSource||typeof item?.transcriptBaseline!=='string')return;
    el('voiceReferenceText').value=item.transcriptBaseline;rememberDraft();controls();
  });
  el('voiceReferenceFolder').addEventListener('click', async () => {
    const target=folder,sequence=refreshSequence;if(!target)return;
    let failed=false;try{const result=await api.openPath(target);failed=typeof result==='string'?!!result:result?.ok===false;}catch{failed=true;}
    if(failed&&sequence===refreshSequence&&!active&&!applying&&!selectingSource&&folder===target&&el('dubGeneratorDialog').open)status(window.UiLocale?.get?.()==='en'?'Could not open the reference folder. Check that it still exists and that opening was allowed.':'Referans klasörü açılamadı. Hâlâ yerinde olduğunu ve açma iznini kontrol edin.');
  });
  const seconds = raw => {
    const value = raw.trim();
    if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(value)) throw new Error();
    return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  };
  async function chooseLocal(isCancelled=()=>false) {
    if (active || applying || selectingSource) return;
    selectingSource = true; controls();
    try {
      const result = await api.selectVoiceReferenceSource();
      if (!result?.ok) { failure(result?.error); return; }
      if (result.cancelled) return {ok:false,cancelled:true};
      if(isCancelled())return {ok:false,cancelled:true};
      localSource = result.path;
      panel.open = true;
      el('voiceReferenceSourceName').textContent = localSource.split(/[\\/]/).pop();
      el('voiceReferenceStart').value = '0:00'; el('voiceReferenceEnd').value = '0:20';
      status('Yerel ses seçildi. Konuşma aralığını ayarlayıp Referans sesi hazırla düğmesine basın.');
    } catch (error) { failure(error?.message);return {ok:false}; }
    finally { selectingSource = false; controls(); }
    return {ok:!!localSource};
  }
  el('voiceReferenceLocal').addEventListener('click',()=>void chooseLocal());
  el('voiceReferenceVideo').addEventListener('click', () => {
    if (active || applying || selectingSource) return;
    localSource = ''; el('voiceReferenceSourceName').textContent = '';
    panel.open = true;
    status('Referans kaynağı açık video olarak seçildi.');
  });
  async function prepare(isCancelled=()=>false) {
    if(isCancelled())return {ok:false,cancelled:true};
    if (active || applying || selectingSource) return;
    const context = window.BrowserDubAudioUI?.context();
    if (!localSource && (!context?.hasMedia || !context.visible)) { status('Ses eklemek için önce bir video açın.'); return; }
    let start, end;
    try {
      start = seconds(el('voiceReferenceStart').value); end = seconds(el('voiceReferenceEnd').value);
      if (end > 86400 || end - start < 3 || end - start > 30) throw new Error();
    } catch (_) { status('Referans için 3–30 saniyelik geçerli bir aralık seçin.'); return; }
    const id = crypto.randomUUID(); active = id; stopping = false; controls();
    window.dispatchEvent(new CustomEvent('voice-reference:busy', { detail: true }));
    status('Referans ses hazırlanıyor…');
    try {
      const result = await api.prepareVoiceReference({ id, name: el('voiceReferenceName').value.trim(), range: { start, end },
        source: localSource || (context?.mode === 'player' ? context.backgroundSource : ''),
        context: { tabId: context?.tabId, generation: context?.generation, mediaId: context?.mediaId } });
      if (!result?.ok) { if (result?.cancelled) status('Durduruldu.'); else failure(result?.error); return; }
      if(isCancelled())return {ok:false,cancelled:true};
      const loaded = await refresh(result.reference.id);
      status(loaded ? 'Referans hazır. Dökümü kontrol edip Bu sesi kullan düğmesine basın.' : 'Ses üretildi ancak referans listesi yenilenemedi. Paneli yeniden açın.');
      return {ok:!!loaded,referenceId:result.reference.id};
    } catch (_) { failure(); }
    finally {
      active = null; stopping = false; controls();
      window.dispatchEvent(new CustomEvent('voice-reference:busy', { detail: false }));
    }
  }
  el('voiceReferencePrepare').addEventListener('click',()=>void prepare());
  el('voiceReferenceCancel').addEventListener('click', async () => {
    const pending = active;
    if (!pending) return; stopping = true; controls(); status('Durduruluyor…');
    const result = await api.cancelDub().catch(() => null);
    if (active !== pending) return;
    if (!result?.ok && active) { stopping = false; controls(); status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); }
  });
  async function useSelected() {
    const item = selected(); if (!item || active) return;
    applying = true; ++refreshSequence; controls();
    try {
      const result = await api.useVoiceReference({ id: item.id, text: el('voiceReferenceText').value });
      if (!result?.ok) { status('Referans sesi uygulanamadı.'); return; }
      activeReferenceId=item.id;appliedReferenceText=el('voiceReferenceText').value;
      if(Object.hasOwn(result,'transcriptBaseline'))item.transcriptBaseline=result.transcriptBaseline;
      item.text = el('voiceReferenceText').value; rememberDraft();
      window.dispatchEvent(new CustomEvent('voice-reference:changed'));
      status('Referans ses ve dökümü güncellendi.');
      return {ok:true};
    } catch (_) { status('Referans sesi uygulanamadı.'); }
    finally { applying = false; controls(); }
  }
  el('voiceReferenceUse').addEventListener('click',()=>void useSelected());
  api.onDubEvent(event => {
    if (event.id !== active) { controls(); return; }
    if (event.type !== 'reference_status' || stopping) return;
    const stages = { stopping: 'Durduruluyor…', stop_failed: 'İptal doğrulanamadı; işlem izlenmeye devam ediyor.', download: 'Video sesi alınıyor…', extract: 'Seçilen aralık kesiliyor…',
      transcribe_cuda: 'Referans dökümü hazırlanıyor · GPU…', transcribe_cpu: 'Referans dökümü hazırlanıyor · CPU…' };
    if (stages[event.stage]) status(stages[event.stage]);
  });
  el('dubGeneratorDialog').addEventListener('close', () => { el('voiceReferencePreview').pause(); comparison?.stop(); });
  panel.addEventListener('toggle', () => { if (!panel.open) comparison?.stop(); });
  window.VoiceReferenceUI=Object.freeze({
    chooseLocal,
    use:async(id,isCancelled=()=>false)=>{if(active||applying||selectingSource||isCancelled())return {ok:false};if(!await refresh(id)||isCancelled())return {ok:false};return useSelected();},
    prepare:async(args,isCancelled=()=>false)=>{
      if(active||applying||selectingSource||isCancelled())return {ok:false};
      if(args.source==='video'){const c=window.BrowserDubAudioUI?.context();if(!c?.hasMedia||!c.visible)return {ok:false};localSource='';}
      else if(!localSource)return {ok:false};
      panel.open=true;el('voiceReferenceStart').value=String(args.start);el('voiceReferenceEnd').value=String(args.end);if(args.name!==undefined)el('voiceReferenceName').value=args.name;
      return prepare(isCancelled);
    }
  });
  controls();
})();
