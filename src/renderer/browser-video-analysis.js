(() => {
  'use strict';
  const root = document.getElementById('browserVideoAnalysisTools');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const tools = window.BrowserAnalysisTools;
  let sequence = 0;
  let contextKey = '';
  let cues = [];
  let busy = false;
  const signature = () => {
    const ctx = tools?.context?.();
    return ctx ? JSON.stringify([ctx.tabId, ctx.generation, ctx.mediaId]) : '';
  };
  const status = (id, message, error = false) => {
    const element = $(id);
    element.textContent = message;
    element.classList.toggle('bva-error', error);
  };
  function invalidate() {
    sequence++;
    contextKey = signature();
    cues = [];
    $('bvaCues').replaceChildren();
    $('bvaIntroResults').replaceChildren();
    $('bvaSaveSrt').disabled = true;
    status('bvaOcrStatus', ''); status('bvaIntroStatus', '');
    setBusy(false);
  }
  function setBusy(value) {
    busy = value;
    $('bvaRunOcr').disabled = value;
    $('bvaDetectIntro').disabled = value;
  }
  function currentTime() {
    return Math.max(0, Number(player?.browserTime) || 0);
  }
  function number(id) {
    const value = $(id).value.trim();
    return value === '' ? NaN : Number(value);
  }
  function crop() {
    const [x, y, width, height] = ['bvaCropX', 'bvaCropY', 'bvaCropW', 'bvaCropH'].map(number);
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) {
      throw new Error('OCR bölgesi yüzdelerini 0–100 arasında geçerli girin.');
    }
    return { x: x / 100, y: y / 100, width: width / 100, height: height / 100 };
  }
  async function request(action, payload, statusId) {
    if (!tools?.request || !signature()) { status(statusId, 'Önce tarayıcıda bir video açın.', true); return null; }
    const ctx = signature(); const seq = ++sequence;
    setBusy(true);
    status(statusId, 'İşleniyor…');
    try {
      const result = await tools.request(action, payload);
      if (seq !== sequence || ctx !== signature()) return null;
      if (!result || result.ok === false) { status(statusId, result?.error || 'İşlem tamamlanamadı; üstteki durum mesajına bakın.', true); return null; }
      return result;
    } catch (error) {
      if (seq === sequence && ctx === signature()) status(statusId, error?.message || 'İşlem tamamlanamadı.', true);
      return null;
    } finally {
      if (seq === sequence && ctx === signature()) setBusy(false);
    }
  }
  function makeInput(value, label, handler, type = 'text') {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.value = value;
    input.addEventListener('input', () => handler(input.value));
    wrap.append(input);
    return wrap;
  }
  function renderCues() {
    const list = $('bvaCues'); list.replaceChildren();
    cues.forEach((cue, index) => {
      const row = document.createElement('div'); row.className = 'bva-cue';
      const heading = document.createElement('strong'); heading.textContent = `${index + 1}. blok`; row.append(heading);
      const times = document.createElement('div'); times.className = 'bva-cue-times';
      times.append(makeInput(String(cue.start), 'Başlangıç', value => { cue.start = value.trim() ? Number(value) : NaN; }, 'number'));
      times.append(makeInput(String(cue.end), 'Bitiş', value => { cue.end = value.trim() ? Number(value) : NaN; }, 'number'));
      row.append(times);
      row.append(makeInput(cue.text, 'Metin', value => { cue.text = value; }, 'textarea'));
      list.append(row);
    });
    $('bvaSaveSrt').disabled = !cues.length;
  }
  async function runOcr() {
    if (busy) return;
    const start = number('bvaStart'), end = number('bvaEnd'), interval = number('bvaInterval');
    if (![start, end, interval].every(Number.isFinite) || start < 0 || end <= start || end - start > 60 || interval < 0.5 || interval > 5) {
      status('bvaOcrStatus', 'En fazla 60 saniyelik geçerli bir aralık ve 0,5–5 saniye örnekleme seçin.', true); return;
    }
    let region;
    try { region = crop(); } catch (error) { status('bvaOcrStatus', error.message, true); return; }
    cues = []; $('bvaCues').replaceChildren(); $('bvaSaveSrt').disabled = true;
    const result = await request('ocr-range', { start, end, crop: region, interval }, 'bvaOcrStatus');
    if (!result) return;
    cues = (Array.isArray(result.cues) ? result.cues : []).slice(0, 120).map(cue => ({ start: Number(cue.start), end: Number(cue.end), text: String(cue.text || '') }));
    renderCues();
    status('bvaOcrStatus', cues.length ? `${cues.length} metin bloğu bulundu. Zamanları ve metni düzeltip SRT olarak kaydedin.` : 'Bu aralıkta okunabilir yazı bulunamadı.');
  }
  async function saveSrt() {
    if (!cues.length || typeof cuesToSrt !== 'function') return;
    if (!contextKey || signature() !== contextKey) { invalidate(); status('bvaOcrStatus', 'Video değişti; OCR sonucunu yeniden oluşturun.', true); return; }
    if (cues.some(cue => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || !cue.text.trim())) {
      status('bvaOcrStatus', 'Kaydetmeden önce her bloğun zamanını ve metnini düzeltin.', true); return;
    }
    const seq = sequence;
    $('bvaSaveSrt').disabled = true;
    try {
      const result = await window.api.saveSubtitleCopy('ocr.srt', cuesToSrt(cues));
      if (seq !== sequence || signature() !== contextKey) return;
      if (result?.ok) status('bvaOcrStatus', 'Düzeltilmiş SRT kaydedildi.');
      else if (!result?.canceled) status('bvaOcrStatus', result?.error || 'SRT kaydedilemedi.', true);
    } catch (error) {
      if (seq === sequence && signature() === contextKey) status('bvaOcrStatus', error?.message || 'SRT kaydedilemedi.', true);
    } finally {
      if (seq === sequence) $('bvaSaveSrt').disabled = !cues.length;
    }
  }
  function seek(time) {
    if (typeof browserCommand === 'function') browserCommand('seek', time).catch(() => status('bvaIntroStatus', 'Öneri başlangıcına gidilemedi.', true));
  }
  async function detectIntro() {
    if (busy) return;
    $('bvaIntroResults').replaceChildren();
    const result = await request('intro-detect', {}, 'bvaIntroStatus');
    if (!result) return;
    const candidateContext = signature();
    const candidateIsCurrent = item => {
      if (item.isConnected && candidateContext === signature()) return true;
      status('bvaIntroStatus', 'Video veya analiz değişti; jenerik önerisini yeniden oluşturun.', true);
      return false;
    };
    const rows = Array.isArray(result.candidates) ? result.candidates.slice(0, 3) : [];
    if (!rows.length) { status('bvaIntroStatus', 'Yeterince benzer bir jenerik bölümü bulunamadı.'); return; }
    status('bvaIntroStatus', `${rows.length} olası jenerik aralığı. Ses benzerliği öneridir; kaydetmeden önce izleyin.`);
    for (const candidate of rows) {
      const start = Number(candidate.start), end = Number(candidate.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;
      const item = document.createElement('div'); item.className = 'bva-intro-result';
      const label = document.createElement('p'); label.textContent = `${start.toFixed(1)}–${end.toFixed(1)} sn · benzerlik ${Math.round(Number(candidate.score) * 100)}%`;
      const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Başlangıca git'; play.addEventListener('click', () => { if (candidateIsCurrent(item)) seek(start); });
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Jenerik aralığı olarak kaydet';
      save.addEventListener('click', async () => {
        if (!candidateIsCurrent(item) || busy) return;
        const result = await request('skip-save', { record: { id: `intro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'intro', scope: 'media', start, end, autoSkip: false } }, 'bvaIntroStatus');
        if (result) { status('bvaIntroStatus', 'Jenerik aralığı kaydedildi. Otomatik atlama kapalı.'); save.disabled = true; }
      });
      item.append(label, play, save); $('bvaIntroResults').append(item);
    }
  }
  $('bvaSetStart').addEventListener('click', () => {
    $('bvaStart').value = currentTime().toFixed(1);
    if (!Number.isFinite(number('bvaEnd')) || number('bvaEnd') <= number('bvaStart')) $('bvaEnd').value = (currentTime() + 15).toFixed(1);
  });
  $('bvaSetEnd').addEventListener('click', () => { $('bvaEnd').value = currentTime().toFixed(1); });
  $('bvaRunOcr').addEventListener('click', runOcr);
  $('bvaSaveSrt').addEventListener('click', saveSrt);
  $('bvaDetectIntro').addEventListener('click', detectIntro);
  document.addEventListener('browser-analysis-contextchange', invalidate);
  setInterval(() => { if (signature() !== contextKey) invalidate(); }, 1000);
  contextKey = signature();
})();
