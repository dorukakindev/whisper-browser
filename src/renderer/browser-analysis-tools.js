(() => {
  'use strict';
  const mount = document.getElementById('browserAnalysisTools');
  if (!mount) return;
  mount.innerHTML = `<summary>Senkron ve video önizlemesi</summary>
    <p>Dalga biçimi ve görüntü analizi için izlenen videoyla aynı sürümdeki yerel dosyayı seçin.</p>
    <div class="ba-actions"><button id="baReference" type="button">Referans video seç</button><span id="baReferenceName">Dosya seçilmedi</span></div>
    <div class="ba-status"><p id="baStatus" role="status" aria-live="polite"></p><button id="baCancel" type="button" disabled>İşlemi durdur</button></div>
    <div class="ba-actions"><button id="baWaveform" type="button">Ses dalgasıyla zamanlamayı aç</button></div>
    <div class="ba-preview-box"><label for="baSeek">Önizlemeli video konumu</label><input id="baSeek" type="range" min="0" max="1000" value="0" aria-describedby="baPreviewHint"/>
      <p id="baPreviewHint">Kare ve replik için çubuğun üzerinde gezinin. Konumu değiştirmek için tıklayın.</p>
      <div id="baThumb" class="hidden" role="status"><img id="baThumbImage" alt="Seçilen zamanın video karesi"/><span id="baThumbTime"></span><span id="baThumbCue"></span></div></div>
    <div class="ba-actions"><button id="baAlign" type="button">Referans altyazıyla parçalı senkron bul</button></div>
    <p>Yüklü ana altyazı için doğru zamanlı başka bir altyazı seçin. Sonuç önce karşılaştırma olarak gösterilir.</p>
    <div id="baAlignment" class="ba-results"></div><button id="baApply" type="button" disabled>Senkronu zamanlama taslağına uygula</button>`;
  const $ = id => document.getElementById(id);
  let currentKey = '', ref = null, busy = false, sequence = 0, preview = null, thumbSequence = 0, thumbTimer = null, dragging = false;
  function context() {
    const tab = browserTabState();
    return player.workspaceMode === 'browser' && tab ? { tabId: tab.id, generation: tab.generation, mediaId: tab.mediaId || '' } : null;
  }
  function signature() { const ctx = context(); return ctx ? JSON.stringify(ctx) : ''; }
  function message(text, error = false) { $('baStatus').textContent = text; $('baStatus').classList.toggle('ba-error', error); }
  function setBusy(value) {
    busy = value;
    for (const id of ['baReference', 'baWaveform', 'baAlign']) $(id).disabled = value;
    $('baCancel').disabled = !value;
  }
  function reset() {
    const key = signature();
    if (key === currentKey) return;
    currentKey = key; sequence++; thumbSequence++; clearTimeout(thumbTimer); ref = null; preview = null;
    setBusy(false); $('baApply').disabled = true; $('baAlignment').replaceChildren(); $('baThumb').classList.add('hidden');
    $('baReferenceName').textContent = 'Dosya seçilmedi'; message('');
    if (player.workspaceMode === 'browser') { player.timeline.waveform = []; player.timeline.waveformDuration = 0; }
    document.dispatchEvent(new CustomEvent('browser-analysis-contextchange', { detail: context() }));
  }
  async function request(action, payload = {}) {
    reset();
    const ctx = context(), key = signature();
    if (!ctx) { message('Önce tarayıcıda bir video açın.', true); return null; }
    if (busy) { message('Çalışan işlemin bitmesini bekleyin veya durdurun.'); return null; }
    const seq = ++sequence;
    setBusy(true); message(action === 'ocr-range' ? 'Seçilen aralıktaki yazılar okunuyor…' : 'İşleniyor…');
    try {
      const output = await window.api.browserExtras({ ...payload, action, ...ctx });
      if (seq !== sequence || key !== signature()) return null;
      if (!output?.ok) { message(output?.error || 'İşlem tamamlanamadı.', true); return null; }
      if (action === 'reference-open') {
        ref = { name: output.name, duration: output.duration }; $('baReferenceName').textContent = ref.name;
        preview = null; $('baApply').disabled = true; $('baAlignment').replaceChildren(); hidePreview();
        player.timeline.waveform = []; player.timeline.waveformDuration = 0;
        document.dispatchEvent(new CustomEvent('browser-analysis-contextchange', { detail: context() }));
      }
      message('Hazır.'); return output;
    } catch (error) { if (seq === sequence && key === signature()) message(error.message || 'İşlem tamamlanamadı.', true); return null; }
    finally { if (seq === sequence && key === signature()) setBusy(false); }
  }
  window.BrowserAnalysisTools = { request, context, signature, getReference: () => ref };
  $('baReference').addEventListener('click', () => request('reference-open'));
  $('baCancel').addEventListener('click', () => {
    const ctx = context(); sequence++; setBusy(false); message('İşlem durduruldu.');
    if (ctx) void window.api.browserExtras({ action: 'cancel', ...ctx }).catch(() => {});
  });
  $('baWaveform').addEventListener('click', async () => {
    if (!ref) { message('Önce referans video seçin.', true); return; }
    if (!player.cues.length) { message('Zamanlama için önce bir altyazı yükleyin.', true); return; }
    const output = await request('reference-waveform');
    if (!output) return;
    player.timeline.waveform = output.points; player.timeline.waveformDuration = output.duration;
    await openTimeline();
    $('timelineStatus').textContent = 'Referans video sesi — blokları sürükleyin, klavyeyle kaydırın veya kopya kaydedin.';
    drawTimeline();
  });
  function videoCues() { return player.cues.map(cue => ({ ...cue, start: subtitleVideoTime(cue.start, false), end: subtitleVideoTime(cue.end, false) })); }
  function sourceSignature() { return JSON.stringify(videoCues().map(cue => [cue.start, cue.end, cue.text])); }
  $('baAlign').addEventListener('click', async () => {
    if (busy) return;
    if (!player.cues.length) { message('Önce hizalanacak ana altyazıyı yükleyin.', true); return; }
    preview = null; $('baApply').disabled = true; $('baAlignment').replaceChildren();
    const source = sourceSignature(), key = signature();
    const output = await request('alignment-preview', { cues: videoCues() });
    if (!output) return;
    const box = $('baAlignment'); box.replaceChildren();
    if (source !== sourceSignature() || key !== signature()) { message('Altyazı değişti; yeniden senkron arayın.', true); return; }
    preview = { ...output, source, key };
    const label = document.createElement('p');
    const low = output.diagnostics?.confidence === 'low';
    label.textContent = `${output.changes.length} satır değişecek. ${low ? 'Kanıt yetersiz; uygulama kapalı.' : 'Zamanları önizleyip taslağa uygulayabilirsiniz.'}`;
    box.append(label);
    for (const change of output.changes.slice(0, 30)) {
      const row = document.createElement('button'); row.type = 'button';
      row.textContent = `${change.index + 1}. satır: ${pSecToTime(change.oldStart)} → ${pSecToTime(change.start)}`;
      row.addEventListener('click', () => { if (preview?.key === signature()) void browserCommand('seek', change.start); }); box.append(row);
    }
    if (output.changes.length > 30) { const hint = document.createElement('p'); hint.textContent = 'İlk 30 değişiklik gösteriliyor; taslak bütün satırları içerir.'; box.append(hint); }
    $('baApply').disabled = low || !output.changes.length;
  });
  $('baApply').addEventListener('click', async () => {
    if (!preview || preview.key !== signature() || preview.source !== sourceSignature() || preview.cues.length !== player.cues.length) {
      $('baApply').disabled = true; message('Altyazı veya senkron ayarı değişti; yeniden hesaplayın.', true); return;
    }
    const alignedCues = player.cues.map((cue, index) => ({ ...cue,
      start: subtitleSourceTime(preview.cues[index].start, false),
      end: subtitleSourceTime(preview.cues[index].end, false) }));
    if (alignedCues.some(cue => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start)) {
      message('Mevcut senkron ayarıyla geçersiz zamanlar oluşuyor. Senkron ayarını sıfırlayıp yeniden hesaplayın.', true); return;
    }
    timelinePushUndo();
    player.cues = alignedCues;
    clearCueWordData(player.cues); timelineMarkDirty('Parçalı senkron taslağı uygulandı. Geri alabilir veya kopya kaydedebilirsiniz.');
    preview = null; $('baApply').disabled = true; await openTimeline();
  });
  const seek = $('baSeek');
  function previewAt(time) {
    clearTimeout(thumbTimer);
    const seq = ++thumbSequence, key = signature(), ctx = context();
    if (!ref || !ctx) return;
    $('baThumb').classList.remove('hidden'); $('baThumbImage').hidden = true;
    $('baThumbTime').textContent = pSecToTime(time);
    $('baThumbCue').textContent = player.cues.find(cue => time >= subtitleVideoTime(cue.start, false) && time < subtitleVideoTime(cue.end, false))?.text || 'Bu zamanda replik yok';
    thumbTimer = setTimeout(async () => {
      try {
        const output = await window.api.browserExtras({ action: 'reference-thumbnail', time, ...ctx });
        if (seq !== thumbSequence || key !== signature()) return;
        if (output?.ok) { $('baThumbImage').src = output.image; $('baThumbImage').hidden = false; }
        else $('baThumbTime').textContent = output?.error || 'Kare alınamadı.';
      } catch { if (seq === thumbSequence) $('baThumbTime').textContent = 'Kare alınamadı.'; }
    }, 140);
  }
  function hidePreview() {
    clearTimeout(thumbTimer); thumbSequence++; $('baThumb').classList.add('hidden');
    const ctx = context(); if (ctx) void window.api.browserExtras({ action: 'thumbnail-cancel', ...ctx }).catch(() => {});
  }
  const duration = () => Number(player.browserDuration) || ref?.duration || 0;
  seek.addEventListener('pointermove', event => {
    const rect = seek.getBoundingClientRect(); previewAt(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration());
  });
  seek.addEventListener('pointerdown', () => { dragging = true; });
  for (const type of ['pointerup', 'pointercancel', 'blur']) seek.addEventListener(type, () => { dragging = false; });
  seek.addEventListener('pointerleave', hidePreview); seek.addEventListener('blur', hidePreview);
  seek.addEventListener('input', () => { const time = Number(seek.value) / 1000 * duration(); previewAt(time); });
  seek.addEventListener('change', () => { if (context() && duration()) void browserCommand('seek', Number(seek.value) / 1000 * duration()); });
  setInterval(() => { reset(); if (!dragging && document.activeElement !== seek && duration()) seek.value = Math.round(player.browserTime / duration() * 1000); }, 500);
  reset();
})();
