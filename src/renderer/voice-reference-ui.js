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
    for (const id of ['voiceReferencePrepare','voiceReferenceStart','voiceReferenceEnd','voiceReferenceSelect','voiceReferenceText','voiceReferenceName']) el(id).disabled = !!active || applying || selectingSource;
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
  async function refresh(preferred) {
    const sequence = ++refreshSequence;
    const result = await api.listVoiceReferences().catch(() => null);
    if (sequence !== refreshSequence) return false;
    if (!result?.ok) { if (preferred) { el('voiceReferenceSelect').value = ''; show(); } status('Referans sesler okunamadı.'); return false; }
    const prior = preferred || el('voiceReferenceSelect').value || result.activeId;
    folder = result.folder; references = result.references;
    el('voiceReferenceSelect').replaceChildren();
    for (const item of references) {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.name;
      option.setAttribute('data-ui-untranslated', ''); el('voiceReferenceSelect').append(option);
    }
    if (references.some(item => item.id === prior)) el('voiceReferenceSelect').value = prior;
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
  el('voiceReferenceSelect').addEventListener('change', show);
  el('voiceReferenceName').addEventListener('input', () => { rememberDraft(); controls(); });
  el('voiceReferenceRename').addEventListener('click', async () => {
    const item = selected(); if (!item || active || applying) return;
    applying = true; ++refreshSequence; controls();
    try {
      const result = await api.renameVoiceReference({ id: item.id, name: el('voiceReferenceName').value });
      if (!result?.ok) { status('Referans adı kaydedilemedi.'); return; }
      item.name = result.name; el('voiceReferenceName').value = result.name; rememberDraft();
      const option = el('voiceReferenceSelect').selectedOptions[0];
      if (option) option.textContent = result.name;
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
  el('voiceReferenceLocal').addEventListener('click', async () => {
    if (active || applying || selectingSource) return;
    selectingSource = true; controls();
    try {
      const result = await api.selectVoiceReferenceSource();
      if (!result?.ok) { failure(result?.error); return; }
      if (result.cancelled) return;
      localSource = result.path;
      panel.open = true;
      el('voiceReferenceSourceName').textContent = localSource.split(/[\\/]/).pop();
      el('voiceReferenceStart').value = '0:00'; el('voiceReferenceEnd').value = '0:20';
      status('Yerel ses seçildi. Konuşma aralığını ayarlayıp Referans sesi hazırla düğmesine basın.');
    } catch (error) { failure(error?.message); }
    finally { selectingSource = false; controls(); }
  });
  el('voiceReferenceVideo').addEventListener('click', () => {
    if (active || applying || selectingSource) return;
    localSource = ''; el('voiceReferenceSourceName').textContent = '';
    panel.open = true;
    status('Referans kaynağı açık video olarak seçildi.');
  });
  el('voiceReferencePrepare').addEventListener('click', async () => {
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
      const loaded = await refresh(result.reference.id);
      status(loaded ? 'Referans hazır. Dökümü kontrol edip Bu sesi kullan düğmesine basın.' : 'Ses üretildi ancak referans listesi yenilenemedi. Paneli yeniden açın.');
    } catch (_) { failure(); }
    finally {
      active = null; stopping = false; controls();
      window.dispatchEvent(new CustomEvent('voice-reference:busy', { detail: false }));
    }
  });
  el('voiceReferenceCancel').addEventListener('click', async () => {
    const pending = active;
    if (!pending) return; stopping = true; controls(); status('Durduruluyor…');
    const result = await api.cancelDub().catch(() => null);
    if (active !== pending) return;
    if (!result?.ok && active) { stopping = false; controls(); status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); }
  });
  el('voiceReferenceUse').addEventListener('click', async () => {
    const item = selected(); if (!item || active) return;
    applying = true; ++refreshSequence; controls();
    try {
      const result = await api.useVoiceReference({ id: item.id, text: el('voiceReferenceText').value });
      if (!result?.ok) { status('Referans sesi uygulanamadı.'); return; }
      item.text = el('voiceReferenceText').value; rememberDraft();
      window.dispatchEvent(new CustomEvent('voice-reference:changed'));
      status('Referans ses ve dökümü güncellendi.');
    } catch (_) { status('Referans sesi uygulanamadı.'); }
    finally { applying = false; controls(); }
  });
  api.onDubEvent(event => {
    if (event.id !== active) { controls(); return; }
    if (event.type !== 'reference_status' || stopping) return;
    const stages = { download: 'Video sesi alınıyor…', extract: 'Seçilen aralık kesiliyor…',
      transcribe_cuda: 'Referans dökümü hazırlanıyor · GPU…', transcribe_cpu: 'Referans dökümü hazırlanıyor · CPU…' };
    if (stages[event.stage]) status(stages[event.stage]);
  });
  el('dubGeneratorDialog').addEventListener('close', () => el('voiceReferencePreview').pause());
  controls();
})();
