(() => {
  'use strict';
  const el = id => document.getElementById(id), api = window.api;
  if (!api.prepareVoiceReference) return;
  const panel = el('voiceReferenceRecorder');
  let active = null, stopping = false, references = [], folder = '', applying = false;
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
    for (const id of ['voiceReferencePrepare','voiceReferenceStart','voiceReferenceEnd','voiceReferenceSelect','voiceReferenceText']) el(id).disabled = !!active || applying;
    el('voiceReferenceCancel').disabled = !active || stopping;
    const generating = !el('dubGeneratorCancel').disabled;
    el('voiceReferencePrepare').disabled = !!active || applying || generating;
    el('voiceReferenceUse').disabled = !!active || applying || generating || !selected() || !el('voiceReferenceText').value.trim();
    el('voiceReferenceFolder').disabled = !folder;
  }
  function show() {
    const item = selected(), audio = el('voiceReferencePreview');
    audio.pause();
    if (item) audio.src = item.url; else audio.removeAttribute('src');
    audio.classList.toggle('hidden', !item); audio.load();
    el('voiceReferenceText').value = item?.text || ''; controls();
  }
  async function refresh(preferred) {
    const result = await api.listVoiceReferences().catch(() => null);
    if (!result?.ok) { status('Referans sesler okunamadı.'); return; }
    const prior = preferred || el('voiceReferenceSelect').value || result.activeId;
    folder = result.folder; references = result.references;
    el('voiceReferenceSelect').replaceChildren();
    for (const item of references) {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.name;
      option.setAttribute('data-ui-untranslated', ''); el('voiceReferenceSelect').append(option);
    }
    if (references.some(item => item.id === prior)) el('voiceReferenceSelect').value = prior;
    show();
  }
  function open(trigger) {
    el(trigger).click(); panel.open = true;
    requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest' }));
  }
  el('browserVoiceReferenceOpen').addEventListener('click', () => { el('browserTranslateMenu').open = false; open('browserDubGenerate'); });
  el('playerVoiceReferenceOpen').addEventListener('click', () => open('playerDubGenerate'));
  panel.addEventListener('toggle', () => { if (panel.open && !active) void refresh(); });
  el('voiceReferenceSelect').addEventListener('change', show);
  el('voiceReferenceText').addEventListener('input', controls);
  el('voiceReferenceFolder').addEventListener('click', () => { if (folder) void api.openPath(folder); });
  const seconds = raw => {
    const value = raw.trim();
    if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(value)) throw new Error();
    return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  };
  el('voiceReferencePrepare').addEventListener('click', async () => {
    if (active) return;
    const context = window.BrowserDubAudioUI?.context();
    if (!context?.hasMedia || !context.visible) { status('Ses eklemek için önce bir video açın.'); return; }
    let start, end;
    try {
      start = seconds(el('voiceReferenceStart').value); end = seconds(el('voiceReferenceEnd').value);
      if (end > 86400 || end - start < 3 || end - start > 30) throw new Error();
    } catch (_) { status('Referans için 3–30 saniyelik geçerli bir aralık seçin.'); return; }
    const id = crypto.randomUUID(); active = id; stopping = false; controls();
    window.dispatchEvent(new CustomEvent('voice-reference:busy', { detail: true }));
    status('Referans ses hazırlanıyor…');
    try {
      const result = await api.prepareVoiceReference({ id, range: { start, end },
        source: context.mode === 'player' ? context.backgroundSource : '',
        context: { tabId: context.tabId, generation: context.generation, mediaId: context.mediaId } });
      if (!result?.ok) { if (result?.cancelled) status('Durduruldu.'); else failure(result?.error); return; }
      await refresh(result.reference.id);
      status('Referans hazır. Dökümü kontrol edip Bu sesi kullan düğmesine basın.');
    } catch (_) { failure(); }
    finally {
      active = null; stopping = false; controls();
      window.dispatchEvent(new CustomEvent('voice-reference:busy', { detail: false }));
    }
  });
  el('voiceReferenceCancel').addEventListener('click', async () => {
    if (!active) return; stopping = true; controls(); status('Durduruluyor…');
    const result = await api.cancelDub().catch(() => null);
    if (!result?.ok && active) { stopping = false; controls(); status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); }
  });
  el('voiceReferenceUse').addEventListener('click', async () => {
    const item = selected(); if (!item || active) return;
    applying = true; controls();
    try {
      const result = await api.useVoiceReference({ id: item.id, text: el('voiceReferenceText').value });
      if (!result?.ok) { status('Referans sesi uygulanamadı.'); return; }
      item.text = el('voiceReferenceText').value;
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
