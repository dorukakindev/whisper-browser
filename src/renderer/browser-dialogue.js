(() => {
  'use strict';
  const tools = window.BrowserAnalysisTools, root = document.getElementById('browserFeatures');
  if (!tools || !root) return;
  const box = document.createElement('details'); box.className = 'bf-section';
  box.innerHTML = `<summary>Zor replikleri konuşmayı ayırarak çöz</summary><div class="bf-group-body">
    <p>Önce Senkron ve video önizlemesi alanından referans video seçin. Bu deneysel işlem yalnız siz başlatınca çalışır; ilk kullanımda modeller indirilir. Müzik veya efekt ayrımı her kayıtta iyileşme sağlamayabilir.</p>
    <div class="bf-grid"><label>Başlangıç (saniye)<input id="bdStart" type="number" min="0" value="0" step="0.1"></label><label>Bitiş (en fazla 60 sn)<input id="bdEnd" type="number" min="0" value="15" step="0.1"></label>
    <label>Whisper modeli<select id="bdModel"><option value="tiny">Tiny · hızlı</option><option value="base" selected>Base · dengeli</option><option value="small">Small · daha yavaş</option></select></label><label>Dil kodu (boş: otomatik)<input id="bdLanguage" maxlength="2" placeholder="tr / en"></label></div>
    <div class="bf-inline"><button id="bdRun" type="button">Konuşmayı ayır ve altyazı çıkar</button><button id="bdCancel" type="button" disabled>Durdur</button></div>
    <p id="bdStatus" role="status" aria-live="polite"></p><label>Kontrol edilebilir SRT sonucu<textarea id="bdText" rows="10"></textarea></label><button id="bdSave" type="button" disabled>SRT kopyasını kaydet</button></div>`;
  (root.querySelector('.bf-workspace') || root).append(box);
  const $ = id => document.getElementById(id); let sequence = 0, busy = false, key = tools.signature();
  const status = text => { $('bdStatus').textContent = text; };
  function reset() { sequence++; busy = false; $('bdRun').disabled = false; $('bdCancel').disabled = true; $('bdSave').disabled = true; $('bdText').value = ''; status(''); key = tools.signature(); }
  $('bdRun').addEventListener('click', async () => {
    if (busy) return; const ctx = tools.context(); if (!ctx || !tools.getReference()) { status('Önce bu video için yerel referans dosyası seçin.'); return; }
    const currentKey = tools.signature(), seq = ++sequence; busy = true; $('bdRun').disabled = true; $('bdCancel').disabled = false; $('bdSave').disabled = true;
    status('Konuşma ayrılıyor ve çözümleniyor. İlk model indirmesi veya CPU işlemi birkaç dakika sürebilir.');
    try {
      const result = await window.api.browserExtras({ ...ctx, action: 'dialogue-transcribe', start: Number($('bdStart').value), end: Number($('bdEnd').value), model: $('bdModel').value, language: $('bdLanguage').value.trim().toLowerCase() });
      if (seq !== sequence || currentKey !== tools.signature()) return;
      if (!result?.ok) { status(result?.error || 'Konuşma işlemi tamamlanamadı.'); return; }
      $('bdText').value = cuesToSrt(result.cues || []); $('bdSave').disabled = !(result.cues || []).length;
      status(result.cues?.length ? `${result.cues.length} replik çıkarıldı. Zamanlar özgün videoya hizalı; metni kontrol ederek kaydedin.` : 'Konuşma bulunamadı. Başka aralık deneyin.');
    } catch (error) { if (seq === sequence) status(error.message || 'İşlem başarısız.'); }
    finally { if (seq === sequence) { busy = false; $('bdRun').disabled = false; $('bdCancel').disabled = true; } }
  });
  $('bdCancel').addEventListener('click', () => { const ctx = tools.context(); reset(); status('İşlem durduruldu.'); if (ctx) void window.api.browserExtras({ ...ctx, action: 'cancel' }).catch(() => {}); });
  $('bdSave').addEventListener('click', async () => { const text = $('bdText').value; if (!text.trim()) { status('Kaydedilecek altyazı yok.'); return; } const result = await window.api.saveSubtitleCopy('konusma.srt', text).catch(() => null); if (result?.ok) status('SRT kaydedildi.'); else if (!result?.canceled) status('SRT kaydedilemedi.'); });
  document.addEventListener('browser-analysis-contextchange', reset);
  setInterval(() => { if (key !== tools.signature()) reset(); }, 1000);
})();
