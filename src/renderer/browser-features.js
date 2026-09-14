(() => {
  'use strict';
  const root = document.getElementById('browserFeatures');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  let sequence = 0;
  let busy = false;
  let frameImage = null;
  let skipRecords = [];
  let skipKeys = { mediaKey: '', seriesKey: '' };
  let skipState = {};
  let contextKey = '';
  let candidateKey = '';

  function context() {
    const tab = typeof browserTabState === 'function' ? browserTabState() : null;
    if (player.workspaceMode !== 'browser' || !tab) return null;
    return { tabId: tab.id, generation: tab.generation, mediaId: tab.mediaId || '' };
  }
  function signature(ctx) { return ctx ? `${ctx.tabId}|${ctx.generation}|${ctx.mediaId}` : ''; }
  function current(ctx, seq) { return seq === sequence && signature(context()) === signature(ctx); }
  function status(message, isError = false) { $('bfStatus').textContent = message; $('bfStatus').classList.toggle('bf-error', isError); }
  function clear(node) { node.replaceChildren(); }
  function node(tag, text, className) {
    const item = document.createElement(tag);
    item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function val(id) { return $(id).value.trim(); }
  function credentials() { return { apiKey: val('bfApiKey'), username: val('bfUsername'), password: val('bfPassword') }; }
  function setBusy(value) {
    busy = value;
    root.classList.toggle('bf-busy', value);
    for (const button of root.querySelectorAll('button[data-bf-action]')) {
      if (button.dataset.bfAction !== 'cancel') button.disabled = value;
    }
    root.querySelector('[data-bf-action="cancel"]').disabled = !value;
  }
  async function call(action, payload = {}) {
    const ctx = context();
    if (!ctx) { status('Önce tarayıcıda bir video açın.', true); return null; }
    if (typeof window.api.browserExtras !== 'function') { status('Bu araç henüz kullanılamıyor.', true); return null; }
    const seq = ++sequence;
    setBusy(true);
    status(action === 'semantic-search' ? 'Anlamsal model ilk kullanımda indirilebilir; arama birkaç dakika sürebilir.' : 'İşleniyor…');
    try {
      const result = await window.api.browserExtras({ action, ...ctx, ...payload });
      if (!current(ctx, seq)) return null;
      if (!result || result.ok === false) {
        status(result?.error || (result?.stale ? 'Video değişti; sonucu yeniden isteyin.' : 'İşlem tamamlanamadı.'), true);
        return null;
      }
      status('Hazır.');
      return result;
    } catch (error) {
      if (current(ctx, seq)) status(error?.message || 'İşlem tamamlanamadı.', true);
      return null;
    } finally {
      if (current(ctx, seq)) setBusy(false);
    }
  }
  function seek(time) {
    const seconds = Number(time);
    if (!Number.isFinite(seconds) || seconds < 0) return;
    if (player.workspaceMode === 'browser') browserCommand('seek', seconds).catch(() => status('Sahneye gidilemedi.', true));
  }
  async function openSubtitleCopy(filePath) {
    const key = signature(context());
    addSubtitleOption(filePath, `Dosya · ${String(filePath).split(/[\\/]/).pop()}`);
    $('playerSubSelect').value = filePath;
    await loadSubtitle(filePath);
    if (key !== signature(context()) || player.subPath !== filePath) { status('Altyazı açılamadı veya video değişti.', true); return false; }
    player.browserLoadedTrackId = '';
    saveActiveBrowserTabWorkspace();
    return true;
  }
  function timeText(value) {
    const seconds = Math.max(0, Number(value) || 0);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  async function searchSubtitles() {
    if (!val('bfTitle')) { status('Yapım adını yazın.', true); $('bfTitle').focus(); return; }
    const result = await call('subtitle-search', {
      query: val('bfTitle'), season: val('bfSeason') || undefined, episode: val('bfEpisode') || undefined,
      language: val('bfLanguage') || undefined, release: val('bfRelease') || undefined,
      config: credentials(),
    });
    if (!result) return;
    const list = $('bfSubtitleResults'); clear(list);
    const rows = Array.isArray(result.results) ? result.results.slice(0, 50) : [];
    if (!rows.length) { list.append(node('p', 'Eşleşen altyazı bulunamadı. Başlığı veya dili değiştirin.')); return; }
    list.append(node('p', `${rows.length} aday · puan yalnız başlık, bölüm, dil ve sürüm bilgilerinin eşleşmesidir.`, 'bf-note'));
    for (const row of rows) {
      const item = node('div', '', 'bf-result');
      item.append(node('strong', `${row.title || row.fileName || 'Altyazı'} · ${row.language || '—'}`));
      item.append(node('span', `${row.release || 'Sürüm bilgisi yok'} · eşleşme ${Number(row.matchScore) || 0} puan`, 'bf-meta'));
      const button = node('button', 'İndir ve aç'); button.type = 'button';
      button.addEventListener('click', async () => {
        const downloaded = await call('subtitle-download', { fileId: row.fileId, config: credentials() });
        if (!downloaded) return;
        if (!downloaded.filePath) { status('İndirme dosya yolu döndürmedi.', true); return; }
        if (!await openSubtitleCopy(downloaded.filePath)) return;
        status('Altyazı açıldı. Senkronu videoda kontrol edin.');
      });
      item.append(button); list.append(item);
    }
  }

  async function semanticSearch() {
    const query = val('bfSemanticQuery');
    if (!query) { status('Aranacak sahneyi tarif edin.', true); return; }
    if ((player.cues || []).length > 10000) { status('Anlamsal arama bu videoda en çok 10000 repliği tarayabilir; altyazıyı kısaltın.', true); return; }
    const cues = (player.cues || []).map((cue) => ({
      start: Number(cue.start) || 0, end: Number(cue.end) || 0,
      text: String(cue.text || '').slice(0, 1000),
      translation: '',
    }));
    const result = await call('semantic-search', { query, cues });
    if (!result) return;
    const list = $('bfSemanticResults'); clear(list);
    const hits = Array.isArray(result.hits) ? result.hits.slice(0, 30) : [];
    if (!hits.length) { list.append(node('p', 'Eşleşme bulunamadı. Daha farklı bir ifade deneyin.')); return; }
    for (const hit of hits) {
      const button = node('button', `${timeText(hit.start)}  ${String(hit.text || hit.translation || '').slice(0, 220)}`, 'bf-hit');
      button.type = 'button'; button.addEventListener('click', () => seek(hit.start)); list.append(button);
    }
  }

  async function ocrFrame() {
    const result = await call('ocr-frame');
    if (!result) return;
    const image = result.image || result.data;
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image || '')) { status('Video karesi alınamadı.', true); return; }
    frameImage = image;
    const box = $('bfOcrFrame'); clear(box);
    const img = document.createElement('img'); img.src = image; img.alt = 'Okunacak video karesi'; img.draggable = false;
    box.append(img); box.classList.add('bf-has-image');
    status('Kare üzerinde yazı bölgesini sürükleyerek seçin.');
  }
  async function ocrAll() {
    if (!frameImage) { status('Önce videodan bir kare alın.', true); return; }
    const result = await call('ocr-read', { crop: { x: 0, y: 0, width: 1, height: 1 } });
    if (result) $('bfOcrResult').textContent = result.text || (result.lines || []).map((line) => typeof line === 'string' ? line : line.text).join('\n') || 'Bu karede yazı bulunamadı.';
  }
  let selection = null;
  function paintSelection(box) {
    let marker = box.querySelector('.bf-selection');
    if (!marker) { marker = document.createElement('div'); marker.className = 'bf-selection'; box.append(marker); }
    const x = Math.min(selection.start.x, selection.end.x), y = Math.min(selection.start.y, selection.end.y);
    Object.assign(marker.style, { left: `${x * 100}%`, top: `${y * 100}%`,
      width: `${Math.abs(selection.end.x - selection.start.x) * 100}%`,
      height: `${Math.abs(selection.end.y - selection.start.y) * 100}%` });
  }
  $('bfOcrFrame').addEventListener('pointerdown', (event) => {
    if (!frameImage) return;
    const box = event.currentTarget;
    const rect = box.getBoundingClientRect();
    const point = (e) => ({ x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) });
    selection = { start: point(event), end: point(event), key: signature(context()) };
    box.setPointerCapture(event.pointerId);
    paintSelection(box);
  });
  $('bfOcrFrame').addEventListener('pointermove', (event) => {
    if (!selection) return;
    const rect = event.currentTarget.getBoundingClientRect();
    selection.end = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    paintSelection(event.currentTarget);
  });
  $('bfOcrFrame').addEventListener('pointerup', async (event) => {
    if (!selection) return;
    const rect = event.currentTarget.getBoundingClientRect();
    selection.end = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    const crop = { x: Math.min(selection.start.x, selection.end.x), y: Math.min(selection.start.y, selection.end.y),
      width: Math.abs(selection.end.x - selection.start.x), height: Math.abs(selection.end.y - selection.start.y) };
    const key = selection.key; selection = null;
    event.currentTarget.querySelector('.bf-selection')?.remove();
    if (key !== signature(context()) || crop.width < .02 || crop.height < .02) return;
    const result = await call('ocr-read', { crop });
    if (!result) return;
    $('bfOcrResult').textContent = result.text || (result.lines || []).map((line) => typeof line === 'string' ? line : line.text).join('\n') || 'Bu bölgede yazı bulunamadı.';
  });
  $('bfOcrFrame').addEventListener('pointercancel', (event) => {
    selection = null; event.currentTarget.querySelector('.bf-selection')?.remove();
  });

  async function scenes() {
    const result = await call('scenes');
    if (!result) return;
    const list = $('bfScenes'); clear(list);
    const rows = Array.isArray(result.scenes) ? result.scenes.slice(0, 100) : [];
    if (!rows.length) { list.append(node('p', 'Sahne bulunamadı. Yerel bir video seçin.')); return; }
    for (const scene of rows) {
      const button = node('button', timeText(scene.time), 'bf-scene'); button.type = 'button';
      if (/^data:image\/(png|jpeg|webp);base64,/.test(scene.thumbnail || '')) {
        const img = document.createElement('img'); img.src = scene.thumbnail; img.alt = `${timeText(scene.time)} sahnesi`; button.prepend(img);
      }
      button.addEventListener('click', () => seek(scene.time)); list.append(button);
    }
  }

  function renderSkips() {
    const list = $('bfSkipRecords'); clear(list);
    if (!skipRecords.length) { list.append(node('p', 'Bu video veya dizi için kayıtlı aralık yok.')); return; }
    for (const record of skipRecords) {
      const item = node('div', '', 'bf-result');
      item.append(node('strong', `${record.kind === 'recap' ? 'Özet' : 'Jenerik'} · ${timeText(record.start)}–${timeText(record.end)}`));
      item.append(node('span', `${record.scope === 'series' ? 'Dizi' : 'Bu video'} · ${record.autoSkip ? 'otomatik atlama açık' : 'elle atlama'}`, 'bf-meta'));
      const remove = node('button', 'Sil'); remove.type = 'button';
      remove.addEventListener('click', async () => { const result = await call('skip-delete', { id: record.id }); if (result) await listSkips(); });
      item.append(remove); list.append(item);
    }
  }
  function applySkips(result) {
    if (!result) return;
    skipKeys = { mediaKey: result.mediaKey || '', seriesKey: result.seriesKey || '' };
    skipRecords = window.WhisperBrowserSkipSegments.normalizeRecords(result.records).filter((record) =>
      record.scope === 'media' ? record.scopeKey === skipKeys.mediaKey : record.scopeKey === skipKeys.seriesKey);
    skipState = {}; candidateKey = ''; renderSkips();
  }
  async function listSkips() {
    const result = await call('skip-list');
    applySkips(result);
  }
  async function linkSeries() {
    if (!val('bfSeriesName')) { status('Önce dizi adını girin.', true); $('bfSeriesName').focus(); return; }
    const result = await call('skip-list', { seriesName: val('bfSeriesName') });
    if (result) { applySkips(result); status('Bu video dizi aralıklarına bağlandı.'); }
  }
  async function backgroundSkips(ctx, key) {
    if (!window.api.browserExtras) return;
    try {
      const result = await window.api.browserExtras({ action: 'skip-list', ...ctx });
      if (key === signature(context()) && result?.ok) applySkips(result);
    } catch { /* Arka plan listesi yeniden açıldığında tekrar istenebilir. */ }
  }
  async function saveSkip() {
    const start = Number(val('bfSkipStart')), end = Number(val('bfSkipEnd'));
    if (!val('bfSkipStart') || !val('bfSkipEnd') || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      status('Geçerli başlangıç ve bitiş saniyelerini girin.', true); return;
    }
    const scope = val('bfSkipScope');
    if (scope === 'series' && !val('bfSeriesName')) { status('Dizi kapsamı için dizi adını girin.', true); return; }
    const result = await call('skip-save', { seriesName: val('bfSeriesName') || undefined,
      record: { id: `skip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        scope, kind: val('bfSkipKind'), start, end, autoSkip: $('bfSkipAuto').checked } });
    if (result) await listSkips();
  }
  function tick() {
    const ctx = context(); const key = signature(ctx);
    if (key !== contextKey) {
      contextKey = key; sequence++; setBusy(false); frameImage = null; skipRecords = []; skipState = {}; candidateKey = '';
      skipKeys = { mediaKey: '', seriesKey: '' };
      for (const id of ['bfSubtitleResults', 'bfSemanticResults', 'bfOcrFrame', 'bfOcrResult', 'bfScenes', 'bfSkipRecords', 'bfSkipCandidate']) clear($(id));
      $('bfOcrFrame').classList.remove('bf-has-image');
      $('bfTitle').value = ctx ? String(player.browserPageTitle || '').slice(0, 160) : '';
      $('bfSeriesName').value = '';
      if (ctx) void backgroundSkips(ctx, key);
    }
    $('browserFeaturesContext').textContent = ctx ? `Etkin video · ${player.browserPageTitle || 'Başlık bilinmiyor'}` : 'Tarayıcıda video açın.';
    const box = $('bfSkipCandidate');
    if (!ctx || !skipRecords.length) { if (candidateKey) { clear(box); candidateKey = ''; } return; }
    const result = window.WhisperBrowserSkipSegments.decideSkip(skipRecords, {
      currentTime: player.browserTime, mediaKey: skipKeys.mediaKey, seriesKey: skipKeys.seriesKey,
      playing: !player.browserPaused,
    }, skipState);
    skipState = result.state;
    if (!result.candidate) { if (candidateKey) { clear(box); candidateKey = ''; } return; }
    if (result.shouldSkip) { seek(result.candidate.end); return; }
    if (candidateKey === result.candidate.id) return;
    clear(box); candidateKey = result.candidate.id;
    const button = node('button', `${result.candidate.kind === 'recap' ? 'Özeti' : 'Jeneriği'} atla → ${timeText(result.candidate.end)}`);
    button.type = 'button'; button.addEventListener('click', () => seek(result.candidate.end)); box.append(button);
  }
  root.addEventListener('click', async (event) => {
    const action = event.target.closest('button[data-bf-action]')?.dataset.bfAction;
    if (!action) return;
    if (action === 'cancel') {
      sequence++; setBusy(false); status('İşlem durduruluyor…');
      const ctx = context(); if (ctx) window.api.browserExtras({ action: 'cancel', ...ctx }).catch(() => {});
      return;
    }
    if (busy) return;
    if (action === 'subtitle-search') await searchSubtitles();
    else if (action === 'semantic-search') await semanticSearch();
    else if (action === 'ocr-frame') await ocrFrame();
    else if (action === 'ocr-all') await ocrAll();
    else if (action === 'scenes') await scenes();
    else if (action === 'skip-list') await listSkips();
    else if (action === 'skip-link-series') await linkSeries();
    else if (action === 'skip-save') await saveSkip();
    else if (action === 'encoding-preview') {
      const result = await call(action); if (!result) return;
      const box = $('bfEncodingPreview'); box.replaceChildren();
      const label = node('label', 'Karakter kodlaması '), select = document.createElement('select');
      for (const candidate of result.candidates) { const option = node('option', candidate.encoding === 'auto' ? 'Otomatik onarım' : candidate.encoding); option.value = candidate.encoding; select.append(option); }
      label.append(select); const pre = node('pre', result.candidates[0]?.text || '');
      select.addEventListener('change', () => { pre.textContent = result.candidates.find(c => c.encoding === select.value)?.text || ''; });
      const apply = node('button', 'Bu kodlamayla kopyasını aç'); apply.type = 'button';
      apply.addEventListener('click', async () => { if (busy) return; const output = await call('encoding-apply', { token: result.token, encoding: select.value }); if (output && await openSubtitleCopy(output.filePath)) { box.replaceChildren(); status('Düzeltilmiş kopya açıldı. Özgün dosya korundu.'); } });
      box.append(label, pre, apply);
    }
    else { const result = await call(action); if (result && action.startsWith('ass-load')) status(`ASS görünümü açıldı · ${result.fontCount || 0} ek font.`); }
  });
  root.addEventListener('toggle', () => { if (root.open && context()) void listSkips(); });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    if (event.target.id === 'bfSemanticQuery') { event.preventDefault(); void semanticSearch(); }
    if (event.target.id === 'bfTitle') { event.preventDefault(); void searchSubtitles(); }
  });
  setBusy(false);
  setInterval(tick, 1000);
  tick();
})();
