(() => {
  'use strict';
  const el = id => document.getElementById(id), api = window.api;
  if (!api.prepareVoiceReference) return;
  const panel = el('voiceReferenceRecorder');
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
  function controls() {
    for (const id of ['voiceReferencePrepare','voiceReferenceStart','voiceReferenceEnd','voiceReferenceSearch','voiceReferenceSelect','voiceReferenceText','voiceReferenceName']) el(id).disabled = !!active || applying || selectingSource;
    el('voiceReferenceCancel').disabled = !active || stopping;
    const generating = !el('dubGeneratorCancel').disabled;
    el('voiceReferencePrepare').disabled = !!active || applying || generating || selectingSource;
    el('voiceReferenceLocal').disabled = !!active || applying || generating || selectingSource;
    el('voiceReferenceVideo').disabled = !!active || applying || generating || selectingSource;
    el('voiceReferenceUse').disabled = !!active || applying || generating || !selected() || !el('voiceReferenceText').value.trim();
    el('voiceReferenceRename').disabled = !!active || applying || generating || !selected() || !el('voiceReferenceName').value.trim();
    el('voiceReferenceFolder').disabled = !folder;
  }
  function show() {
    const item = selected(), audio = el('voiceReferencePreview');
    audio.pause();
    if (item) audio.src = item.url; else audio.removeAttribute('src');
    audio.classList.toggle('hidden', !item); audio.load();
    const draft = item && drafts.get(item.id);
    el('voiceReferenceName').value = draft?.name ?? item?.name ?? '';
    el('voiceReferenceText').value = draft?.text ?? item?.text ?? ''; controls();
    const quality = item?.quality;
    const labels = {quiet:'Referans sesi çok kısık',clipping:'Referansta ses patlaması var',silence:'Referansta uzun sessizlik var',short:'Referans çok kısa'};
    el('voiceReferenceQuality').textContent = quality ? [
      ...(quality.warnings || []).map(w => t(labels[w] || w)),
      t('Ses düzeyi önerisi; müzik ve konuşmacıyı dinleyerek kontrol edin.'),
      `${t('Kayıt içinde önerilen aralık')}: ${quality.suggested_start}–${quality.suggested_end} s`
    ].join(' · ') : '';
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
  document.addEventListener('ui-locale-change', () => renderReferences());
  async function refresh(preferred) {
    const sequence = ++refreshSequence;
    const result = await api.listVoiceReferences().catch(() => null);
    if (sequence !== refreshSequence) return false;
    if (!result?.ok) { if (preferred) { el('voiceReferenceSelect').value = ''; show(); } status('Referans sesler okunamadı.'); return false; }
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
  el('voiceReferenceFolder').addEventListener('click', () => { if (folder) void api.openPath(folder); });
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
  el('dubGeneratorDialog').addEventListener('close', () => el('voiceReferencePreview').pause());
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
