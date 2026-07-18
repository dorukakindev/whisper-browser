// ===== State =====
const state = {
  source: 'file',
  inputFile: null,
  outputDir: null,
  outputFiles: [],
  running: false,
  cancelled: false,
  startTime: 0,
  _speedEma: 0,
  // Kuyruk
  queue: [],            // [{id, type:'file'|'youtube', input, label, status, files}]
  queueRunning: false,  // tüm kuyruk işleniyor mu?
  currentQueueId: null, // şu an işlenen item ID'si
  stopAfterCurrent: false, // kuyruk: mevcut iş bitince dur
  previewSegs: [],      // önizlemedeki segmentler ({start, end, text}) — pano kopyası için
  gpuVramMib: null,     // toplam GPU VRAM (MiB) — yetersizlik uyarısı için
  lastJobVideo: null,   // son işin yerel video yolu (burn-in için; YouTube ise null)
  lastQualityReport: null, // son işin kalite raporu (sonuç modalında gösterilir)
  syncVideo: null,      // altyazı senkron aracı: referans video
  syncSrt: null,        // altyazı senkron aracı: hizalanacak SRT
};

// ===== Kuyruk yönetimi =====
let _queueIdCounter = 0;

function buildOptsFromUI() {
  // Mevcut UI ayarlarından opts oluştur (single ve kuyruk için ortak)
  return {
    model: $('model').value,
    engine: $('engine').value,
    batchSize: parseInt($('batchSize').value, 10),
    audioTrack: $('audioTrack') ? parseInt($('audioTrack').value, 10) : -1,
    qualityReport: $('qualityReport') ? $('qualityReport').checked : true,
    resume: $('resume') ? $('resume').checked : true,
    language: $('language').value,
    task: $('task').value,
    computeType: $('computeType').value,
    device: $('device').value,
    beamSize: parseInt($('beamSize').value, 10),
    bestOf: parseInt($('bestOf').value, 10),
    vadFilter: $('vadFilter').checked,
    vadThreshold: parseFloat($('vadThreshold').value),
    splitMode: $('splitMode').value,
    timingGap: parseFloat($('timingGap').value),
    wrapMode: $('wrapMode').value,
    hardMaxChars: parseInt($('hardMaxChars').value, 10),
    fixTimings: $('fixTimings').checked,
    mergeShort: $('mergeShort').checked,
    dedupe: $('dedupe').checked,
    maxCps: parseFloat($('maxCps').value),
    temperatureFallback: $('temperatureFallback').checked,
    temperature: parseFloat($('temperature').value),
    patience: parseFloat($('patience').value),
    lengthPenalty: parseFloat($('lengthPenalty').value),
    repetitionPenalty: parseFloat($('repetitionPenalty').value),
    noRepeatNgramSize: parseInt($('noRepeatNgramSize').value, 10),
    compressionRatioThreshold: parseFloat($('compressionRatioThreshold').value),
    logProbThreshold: parseFloat($('logProbThreshold').value),
    noSpeechThreshold: parseFloat($('noSpeechThreshold').value),
    vadMinSpeechMs: parseInt($('vadMinSpeechMs').value, 10),
    vadMinSilenceMs: parseInt($('vadMinSilenceMs').value, 10),
    vadSpeechPadMs: parseInt($('vadSpeechPadMs').value, 10),
    vadMaxSpeechS: parseFloat($('vadMaxSpeechS').value),
    conditionOnPrevious: $('conditionOnPrevious').checked,
    initialPrompt: $('initialPrompt').value.trim(),
    clipStart: $('clipStart').value.trim(),
    clipEnd: $('clipEnd').value.trim(),
    glossary: glossary.join('|'),
    formats: $('formats').value,
    langSuffix: $('langSuffix').checked,
    maxLineWidth: parseInt($('maxLineWidth').value, 10),
    maxLines: 2,
    maxChars: parseInt($('maxLineWidth').value, 10) * 2,
    outputDir: state.outputDir,
    diarize: $('diarize').checked,
    hfToken: $('hfToken').value.trim(),
    minSpeakers: parseInt($('minSpeakers').value, 10) || 0,
    maxSpeakers: parseInt($('maxSpeakers').value, 10) || 0,
    labelSpeakers: $('labelSpeakers').checked,
    llmPostprocess: $('llmPostprocess').checked,
    llmApiKey: $('llmApiKey').value.trim(),
    llmBaseUrl: $('llmEndpointPreset').value === 'custom'
      ? $('llmBaseUrl').value.trim()
      : $('llmEndpointPreset').value,
    llmModel: $('llmModel').value.trim() || 'deepseek-v4-flash',
    llmWorkers: parseInt($('llmWorkers').value, 10) || 4,
    llmFixCensorship: $('llmFixCensorship').checked,
    llmFixHallucination: $('llmFixHallucination').checked,
    llmFixPunctuation: $('llmFixPunctuation').checked,
    llmFixConsistency: $('llmFixConsistency').checked,
  };
}

function addToQueue(type, input) {
  if (!input) return;
  const id = ++_queueIdCounter;
  const label = type === 'youtube'
    ? input.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)
    : input.split(/[\\/]/).pop();
  // Ayarları EKLEME anında dondur: kuyruk işlenirken UI değişse bile bu iş eski ayarı kullanır
  state.queue.push({ id, type, input, label, status: 'pending', files: [], opts: buildOptsFromUI() });
  renderQueue();
}

function removeFromQueue(id) {
  // Çalışan item silinemez
  const item = state.queue.find(x => x.id === id);
  if (!item || item.status === 'running') return;
  state.queue = state.queue.filter(x => x.id !== id);
  renderQueue();
}

function clearQueue() {
  // Çalışanlar kalsın
  state.queue = state.queue.filter(x => x.status === 'running');
  renderQueue();
}

const STATUS_TEXT = {
  pending: 'Bekliyor',
  running: 'İşleniyor',
  done: 'Tamamlandı ✓',
  error: 'Hata ✗',
};

function renderQueue() {
  const card = $('queueCard');
  const list = $('queueList');
  const count = $('queueCount');
  count.textContent = state.queue.length;
  if (state.queue.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  list.innerHTML = '';
  state.queue.forEach((item) => {
    const div = document.createElement('div');
    div.className = `queue-item ${item.status}`;
    const icon = item.type === 'youtube'
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8A3 3 0 0 0 2.6 19.9C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const removable = item.status !== 'running';
    const retryable = item.status === 'error';
    const openable = item.status === 'done' && item.files && item.files.length > 0;
    if (openable) div.title = 'Çıktı klasörünü aç';
    div.innerHTML = `
      <span class="queue-icon">${icon}</span>
      <div class="queue-name" title="${escapeHtml(item.input)}">
        ${escapeHtml(item.label)}
        <small>${item.type === 'youtube' ? 'youtube' : 'dosya'}</small>
      </div>
      <span class="queue-status">${STATUS_TEXT[item.status] || item.status}</span>
      <span class="queue-actions">
        ${retryable ? `<button class="queue-remove queue-retry" data-retry="${item.id}" title="Yeniden dene">↻</button>` : ''}
        ${removable ? `<button class="queue-remove" data-id="${item.id}" title="Kaldır">×</button>` : ''}
      </span>
    `;
    if (openable) {
      div.classList.add('openable');
      div.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        window.api.showInFolder(item.files[0]);
      });
    }
    list.appendChild(div);
  });
  list.querySelectorAll('.queue-remove[data-id]').forEach(btn => {
    btn.addEventListener('click', () => removeFromQueue(parseInt(btn.dataset.id, 10)));
  });
  list.querySelectorAll('.queue-retry').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.queue.find(x => x.id === parseInt(btn.dataset.retry, 10));
      if (!item || item.status !== 'error') return;
      item.status = 'pending';
      renderQueue();
      logLine(`↻ "${item.label}" yeniden kuyruğa alındı`, 'info');
    });
  });
}

async function startQueue() {
  if (state.queueRunning) return;
  if (state.running) {
    logLine('Tek bir iş zaten çalışıyor — kuyruğu başlatmadan önce iptal et veya bitmesini bekle', 'warn');
    return;
  }
  const pendings = state.queue.filter(x => x.status === 'pending');
  if (pendings.length === 0) {
    logLine('Kuyrukta bekleyen iş yok', 'warn');
    return;
  }
  state.queueRunning = true;
  state.stopAfterCurrent = false;
  updateStopAfterBtn();
  logLine(`Kuyruk başladı — ${pendings.length} iş`, 'success');
  processNextQueueItem();
}

function finalizeQueue() {
  state.queueRunning = false;
  state.stopAfterCurrent = false;
  state.currentQueueId = null;
  state.running = false;
  updateStopAfterBtn();
  $('startBtn').classList.remove('hidden');
  $('cancelBtn').classList.add('hidden');
  setStatus('Hazır');
  offerOpenLastOutput();
}

async function processNextQueueItem() {
  // Kuyruk iptal edildiyse (öğeler arası boşlukta zamanlanmış çağrı) yeniden başlatma
  if (!state.queueRunning) return;
  // Kullanıcı "mevcut iş bitince dur" dediyse sıradakini başlatma
  if (state.stopAfterCurrent) {
    logLine('Kuyruk istek üzerine durduruldu (mevcut iş tamamlandı).', 'warn');
    finalizeQueue();
    return;
  }
  // Sonraki bekleyen iş
  const next = state.queue.find(x => x.status === 'pending');
  if (!next) {
    const doneN = state.queue.filter(x => x.status === 'done').length;
    const errN = state.queue.filter(x => x.status === 'error').length;
    finalizeQueue();
    logLine('Kuyruk tamamlandı ✓', 'success');
    notifyDone('Kuyruk tamamlandı', `${doneN} iş bitti${errN ? ` · ${errN} hata` : ''}`);
    return;
  }
  next.status = 'running';
  state.currentQueueId = next.id;
  renderQueue();

  // Tek-iş arayüzünü güncelle: kuyruk item'i mevcut iş gibi göster
  resetStages();
  clearPreview();
  setProgress(0);
  $('progressText').textContent = '0%';
  $('progressTime').textContent = 'başlatılıyor...';
  setStatus('Çalışıyor', 'active');
  $('startBtn').classList.add('hidden');
  $('cancelBtn').classList.remove('hidden');
  state.running = true;
  state.cancelled = false;
  state._speedEma = 0;
  state.startTime = Date.now();
  state.outputFiles = [];
  state.lastQualityReport = null;

  // Eklenirken dondurulmuş ayarları kullan (yoksa mevcut UI'dan üret — geriye uyum)
  const opts = next.opts ? { ...next.opts } : buildOptsFromUI();
  if (next.type === 'youtube') { opts.youtube = next.input; state.lastJobVideo = null; }
  else { opts.input = next.input; state.lastJobVideo = next.input; }

  logLine(`▶ Kuyruk: "${next.label}" başlıyor (${next.type})`);

  const r = await window.api.startTranscribe(opts);
  if (!r.ok) {
    logLine(`✗ Kuyruk: "${next.label}" başlatılamadı — ${r.error}`, 'error');
    next.status = 'error';
    renderQueue();
    state.running = false;
    // Sonrakine geç
    setTimeout(processNextQueueItem, 100);
  }
  // Aksi halde event handler done/error event'inde sonrakini başlatacak
}

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function setStatus(text, type = '') {
  const pill = $('statusPill');
  pill.textContent = text;
  pill.className = 'status-pill' + (type ? ' ' + type : '');
  // İlerleme çubuğu shimmer'ı yalnızca iş çalışırken (active) dönsün
  const fill = $('progressFill');
  if (fill) fill.classList.toggle('running', type === 'active');
}

// İlerleme çubuğu genişliği + erişilebilirlik değeri tek noktadan
function setProgress(percent) {
  const p = Math.max(0, Math.min(100, percent));
  $('progressFill').style.width = `${p}%`;
  const bar = $('progressBar');
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(p)));
}

function markStagesDoneUpTo(stage) {
  const order = ['download', 'extract', 'load_model', 'transcribe', 'llm_postprocess', 'diarize', 'write'];
  const idx = order.indexOf(stage);
  if (idx < 0) return;
  order.forEach((s, i) => {
    const el = document.querySelector(`.stage[data-stage="${s}"]`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });
}

function resetStages() {
  $$('.stage').forEach((el) => {
    el.classList.remove('active', 'done');
    const d = el.querySelector('.stage-dur');
    if (d) d.remove();
  });
  _activeStage = null;
  _stageStart = 0;
}

// Aşama başına geçen süre: yeni aşamaya geçişte öncekinin süresini damgala
let _activeStage = null;
let _stageStart = 0;
function recordStageTiming(stage) {
  const now = Date.now();
  if (_activeStage && _activeStage !== stage && _stageStart) {
    const el = document.querySelector(`.stage[data-stage="${_activeStage}"]`);
    if (el && !el.querySelector('.stage-dur')) {
      const span = document.createElement('span');
      span.className = 'stage-dur';
      span.textContent = formatTime((now - _stageStart) / 1000);
      el.appendChild(span);
    }
  }
  if (_activeStage !== stage) {
    _activeStage = stage;
    _stageStart = now;
  }
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Kullanıcı yukarı kaydırmışsa zorla dibe çekme — sadece dipteyken takip et
function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
}

function logLine(message, level = 'info') {
  const log = $('log');
  const stick = isNearBottom(log);
  const line = document.createElement('div');
  line.className = `log-line log-${level}`;
  const t = new Date();
  const ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
  line.innerHTML = `<span class="log-time">${ts}</span>${escapeHtml(message)}`;
  log.appendChild(line);
  if (stick) log.scrollTop = log.scrollHeight;
  // Trim if too many lines
  while (log.children.length > 500) log.removeChild(log.firstChild);
  return line;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clearPreview() {
  state.previewSegs = [];
  _previewCapWarned = false;
  $('preview').innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 5h18M3 12h18M3 19h12"/></svg>
      <div>Transkripsiyon başladığında segmentler burada görünecek.</div>
    </div>
  `;
}

// SRT zaman biçimi: HH:MM:SS,mmm
function srtTime(seconds) {
  const msTotal = Math.max(0, Math.round((seconds || 0) * 1000));
  const h = Math.floor(msTotal / 3600000);
  const m = Math.floor((msTotal % 3600000) / 60000);
  const s = Math.floor((msTotal % 60000) / 1000);
  const ms = msTotal % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

$('copyPreview').addEventListener('click', async () => {
  // Arama filtresi aktifse yalnızca görünen segmentleri kopyala
  const segs = state.previewSegs.filter(
    (s) => !previewFilter || (s.text || '').toLowerCase().includes(previewFilter)
  );
  if (segs.length === 0) {
    logLine('Kopyalanacak segment yok', 'warn');
    return;
  }
  const srt = segs
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`)
    .join('\n');
  await window.api.copyText(srt);
  logLine(`${segs.length} segment panoya kopyalandı (SRT biçimi)`, 'success');
});

// Önizleme metin filtresi — büyük transkriptlerde arama
let previewFilter = '';

// Önizlemede en çok bu kadar DOM düğümü tutulur; veri (state.previewSegs) tam kalır
// (kopyalama tümünü içerir). Uzun videolarda kaydırma takılmasını/bellek şişmesini önler.
const PREVIEW_DOM_CAP = 1500;
let _previewCapWarned = false;

function applySegmentFilter(el) {
  if (!previewFilter) {
    el.classList.remove('filtered');
    return;
  }
  // Yalnızca altyazı metnine göre filtrele (zaman kodu/CPS değil) — "Kopyala" ile tutarlı
  const txt = el.dataset.text || '';
  el.classList.toggle('filtered', !txt.includes(previewFilter));
}

let _searchTimer = null;
$('previewSearch').addEventListener('input', () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    previewFilter = $('previewSearch').value.trim().toLowerCase();
    $$('#preview .segment').forEach(applySegmentFilter);
  }, 120);
});

// Segment DOM elemanını üret (yan etkisiz) — hem akış hem toplu render kullanır.
// idx = state.previewSegs içindeki kalıcı indeks (düzenleme bu girdiyi günceller).
function createSegmentEl(seg, idx) {
  const el = document.createElement('div');
  el.className = 'segment';
  el.dataset.text = (seg.text || '').toLowerCase();
  if (idx !== undefined) el.dataset.idx = String(idx);
  const start = formatTime(seg.start);
  const end = formatTime(seg.end);
  // Okuma hızı (CPS) — limiti aşan altyazıları görsel olarak işaretle
  const dur = (seg.end || 0) - (seg.start || 0);
  const cps = dur > 0 ? (seg.text || '').length / dur : 0;
  const maxCpsEl = $('maxCps');
  const limit = maxCpsEl ? parseFloat(maxCpsEl.value) : 20;
  const fast = limit > 0 && cps > limit;
  if (fast) el.classList.add('segment-fast');
  el.innerHTML = `
    <span class="segment-time">${start} → ${end}${fast ? ` · ${cps.toFixed(0)} CPS` : ''}</span>
    <span class="segment-text" contenteditable="true" spellcheck="false" title="Düzenlemek için tıkla — Kopyala/JSON yeniden-üret bu metni kullanır">${escapeHtml(seg.text)}</span>
  `;
  return el;
}

// Düzenlenebilir segment metni: blur/Enter'da state.previewSegs[idx]'i güncelle
function commitSegmentEdit(textEl) {
  const segEl = textEl.closest('.segment');
  if (!segEl || segEl.dataset.idx === undefined) return;
  const idx = parseInt(segEl.dataset.idx, 10);
  const entry = state.previewSegs[idx];
  if (!entry) return;
  const newText = textEl.textContent.replace(/\s+/g, ' ').trim();
  if (newText === entry.text) return;
  entry.text = newText;
  segEl.dataset.text = newText.toLowerCase();
  segEl.classList.add('edited');
}

// Önizleme metni düzenleme olayları (delegasyon)
$('preview').addEventListener('blur', (e) => {
  if (e.target.classList && e.target.classList.contains('segment-text')) commitSegmentEdit(e.target);
}, true);
$('preview').addEventListener('keydown', (e) => {
  if (e.target.classList && e.target.classList.contains('segment-text') && e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
  }
});

// DOM düğüm sayısını sınırla — en eski görünür blokları at (veri korunur)
function enforcePreviewCap(preview) {
  let over = preview.childElementCount - PREVIEW_DOM_CAP;
  while (over-- > 0 && preview.firstElementChild) {
    preview.removeChild(preview.firstElementChild);
  }
  if (preview.childElementCount >= PREVIEW_DOM_CAP && !_previewCapWarned) {
    _previewCapWarned = true;
    logLine(`Önizleme ${PREVIEW_DOM_CAP} blokla sınırlı tutuluyor (performans). Kopyala/çıktı dosyası tümünü içerir.`, 'info');
  }
}

function addSegment(seg) {
  const idx = state.previewSegs.push({ start: seg.start, end: seg.end, text: seg.text }) - 1;
  const preview = $('preview');
  if (preview.querySelector('.empty-state')) preview.innerHTML = '';
  const stick = isNearBottom(preview);
  const el = createSegmentEl(seg, idx);
  applySegmentFilter(el);
  preview.appendChild(el);
  enforcePreviewCap(preview);
  if (stick) preview.scrollTop = preview.scrollHeight;
}

// Nihai segment listesini tek seferde göster — DocumentFragment ile (düğüm başına reflow yok)
function renderFinalPreview(segs) {
  const preview = $('preview');
  state.previewSegs = segs.map((s) => ({ start: s.start, end: s.end, text: s.text }));
  const offset = segs.length > PREVIEW_DOM_CAP ? segs.length - PREVIEW_DOM_CAP : 0;
  const visible = offset > 0 ? segs.slice(-PREVIEW_DOM_CAP) : segs;
  const frag = document.createDocumentFragment();
  visible.forEach((s, i) => {
    const el = createSegmentEl(s, offset + i);  // kalıcı previewSegs indeksi
    el.classList.add('no-anim');  // toplu render — düğüm başına slideIn animasyonu UI'ı dondurmasın
    applySegmentFilter(el);
    frag.appendChild(el);
  });
  preview.innerHTML = '';
  if (visible.length === 0) {
    clearPreview();
    return;
  }
  preview.appendChild(frag);
  preview.scrollTop = preview.scrollHeight;
  if (segs.length > PREVIEW_DOM_CAP) {
    logLine(`Önizlemede son ${PREVIEW_DOM_CAP}/${segs.length} blok gösteriliyor (kopyalama/çıktı tümünü içerir).`, 'info');
  }
}

// ===== Tabs =====
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('.tab-content').forEach((c) => {
      c.classList.toggle('hidden', c.dataset.content !== target);
    });
    state.source = target;
  });
});

// ===== File selection =====
const dropZone = $('dropZone');
dropZone.addEventListener('click', async () => {
  const files = await window.api.selectVideo();
  if (!files || files.length === 0) return;
  if (files.length === 1) {
    setInputFile(files[0]);
  } else {
    // Birden çok dosya seçildi: hepsini kuyruğa ekle
    files.forEach((f) => addToQueue('file', f));
    logLine(`+ ${files.length} dosya kuyruğa eklendi`, 'success');
  }
});

// Klavye erişimi: drop-zone bir <div> (role=button) — Enter/Space ile aç
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    dropZone.click();
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

function handleDropPayload(e) {
  // webUtils üzerinden gerçek disk yolu (Electron 32+'da file.path kaldırıldı)
  const paths = Array.from(e.dataTransfer.files)
    .map((f) => window.api.getFilePath(f))
    .filter(Boolean);
  if (paths.length === 1) {
    setInputFile(paths[0]);
    return;
  }
  if (paths.length > 1) {
    // Birden çok dosya: hepsini kuyruğa ekle
    paths.forEach((p) => addToQueue('file', p));
    logLine(`+ ${paths.length} dosya kuyruğa eklendi`, 'success');
    return;
  }
  // Dosya yok: tarayıcıdan sürüklenen bir link olabilir → YouTube sekmesine al
  const text = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').trim();
  const url = text.split(/\s+/)[0];
  if (/^https?:\/\//i.test(url)) {
    const ytTab = document.querySelector('.tab[data-tab="youtube"]');
    if (ytTab) ytTab.click();
    $('youtubeUrl').value = url;
    logLine(`Link YouTube sekmesine alındı: ${url.slice(0, 60)}`, 'success');
  }
}

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleDropPayload(e);
});

// Pencerenin tamamı bırakma hedefi. preventDefault olmadan Electron, bırakılan
// dosyaya file:// olarak NAVİGATE eder ve uygulama ekranı kaybolur.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  // dropZone kendi handler'ında işledi — çift işleme yapma
  if (e.target.closest && e.target.closest('#dropZone')) return;
  handleDropPayload(e);
});

function activateTab(target) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === target));
  $$('.tab-content').forEach((c) => c.classList.toggle('hidden', c.dataset.content !== target));
  state.source = target;
}

function setInputFile(filepath) {
  state.inputFile = filepath;
  // Başka sekmedeyken dosya bırakılırsa "Başlat" yanlışlıkla YouTube'u kullanmasın
  if (state.source !== 'file') activateTab('file');
  const name = filepath.split(/[\\/]/).pop();
  $('fileName').textContent = name;
  $('filePath').textContent = filepath;
  $('fileInfo').classList.remove('hidden');
  dropZone.classList.add('hidden');
  refreshAudioTracks(filepath);
}

// Seçilen dosyanın ses kanallarını ffprobe ile listele; >1 kanal varsa dropdown göster.
// Kanal seçimi dosyaya özgüdür — kalıcı ayara yazılmaz.
function resetAudioTracks() {
  const field = $('audioTrackField');
  const sel = $('audioTrack');
  if (sel) sel.innerHTML = '<option value="-1">Otomatik (varsayılan kanal)</option>';
  if (field) field.classList.add('hidden');
}

async function refreshAudioTracks(filepath) {
  resetAudioTracks();
  const field = $('audioTrackField');
  const sel = $('audioTrack');
  if (!field || !sel) return;
  try {
    const res = await window.api.probeTracks(filepath);
    if (!res || !res.ok || !Array.isArray(res.tracks) || res.tracks.length <= 1) return;
    res.tracks.forEach((t) => {
      const parts = [];
      if (t.lang) parts.push(t.lang.toUpperCase());
      if (t.title) parts.push(t.title);
      if (t.channels) parts.push(t.channels === 1 ? 'mono' : t.channels === 2 ? 'stereo' : `${t.channels} kanal`);
      if (t.codec) parts.push(t.codec);
      const opt = document.createElement('option');
      opt.value = String(t.index);
      opt.textContent = `#${t.index + 1} — ${parts.join(' · ') || 'ses'}`;
      sel.appendChild(opt);
    });
    field.classList.remove('hidden');
    logLine(`${res.tracks.length} ses kanalı bulundu — gerekirse "Ses kanalı" alanından seç`, 'info');
  } catch (_) {}
}

$('clearFile').addEventListener('click', () => {
  state.inputFile = null;
  $('fileInfo').classList.add('hidden');
  dropZone.classList.remove('hidden');
  resetAudioTracks();
});

// ===== Output folder =====
$('pickFolder').addEventListener('click', async (e) => {
  e.preventDefault();
  const folder = await window.api.selectFolder();
  if (folder) {
    state.outputDir = folder;
    $('outputDir').textContent = folder;
    saveAppSettings();
  }
});

$('resetFolder').addEventListener('click', (e) => {
  e.preventDefault();
  if (!state.outputDir) return;
  state.outputDir = null;
  $('outputDir').textContent = 'Video ile aynı klasör';
  saveAppSettings();
});

// ===== Range value display =====
const ranges = [
  ['beamSize', 'beamSizeVal'],
  ['bestOf', 'bestOfVal'],
  ['batchSize', 'batchSizeVal'],
  ['maxCps', 'maxCpsVal'],
  ['vadThreshold', 'vadThresholdVal'],
  ['maxLineWidth', 'maxLineWidthVal'],
  ['hardMaxChars', 'hardMaxCharsVal'],
  // Decoding
  ['temperature', 'temperatureVal'],
  ['patience', 'patienceVal'],
  ['lengthPenalty', 'lengthPenaltyVal'],
  ['repetitionPenalty', 'repetitionPenaltyVal'],
  ['noRepeatNgramSize', 'noRepeatNgramSizeVal'],
  ['compressionRatioThreshold', 'compressionRatioThresholdVal'],
  ['logProbThreshold', 'logProbThresholdVal'],
  ['noSpeechThreshold', 'noSpeechThresholdVal'],
  // Detaylı VAD
  ['vadMinSpeechMs', 'vadMinSpeechMsVal'],
  ['vadMinSilenceMs', 'vadMinSilenceMsVal'],
  ['vadSpeechPadMs', 'vadSpeechPadMsVal'],
  ['vadMaxSpeechS', 'vadMaxSpeechSVal'],
  ['timingGap', 'timingGapVal'],
  ['llmWorkers', 'llmWorkersVal'],
];


ranges.forEach(([input, label]) => {
  const el = $(input);
  const lbl = $(label);
  if (!el || !lbl) return;
  const update = () => {
    let v = el.value;
    if (['vadThreshold', 'temperature', 'noSpeechThreshold', 'timingGap'].includes(input)) {
      v = parseFloat(v).toFixed(2);
    } else if (['logProbThreshold', 'patience', 'lengthPenalty', 'repetitionPenalty', 'compressionRatioThreshold'].includes(input)) {
      v = parseFloat(v).toFixed(1);
    }
    lbl.textContent = v;
  };
  el.addEventListener('input', update);
  update();
});

// ===== Glossary (sözlük) yönetimi =====
let glossary = [];
const glossaryListEl = $('glossaryList');
const glossaryInputEl = $('glossaryInput');

function renderGlossary() {
  glossaryListEl.innerHTML = '';
  if (glossary.length === 0) {
    glossaryListEl.innerHTML = '<div class="glossary-empty">Henüz terim yok. İlk terimini ekle.</div>';
    return;
  }
  glossary.forEach((term, i) => {
    const tag = document.createElement('div');
    tag.className = 'glossary-tag';
    tag.innerHTML = `<span></span><button title="Sil">×</button>`;
    tag.querySelector('span').textContent = term;
    tag.querySelector('button').addEventListener('click', () => {
      glossary.splice(i, 1);
      saveAppSettings();
      renderGlossary();
    });
    glossaryListEl.appendChild(tag);
  });
}

function addGlossaryTerm() {
  const v = glossaryInputEl.value.trim();
  if (!v) return;
  // Birden çok terim virgülle ayrılırsa hepsini ekle
  v.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(term => {
    if (!glossary.includes(term)) glossary.push(term);
  });
  glossaryInputEl.value = '';
  saveAppSettings();
  renderGlossary();
}

$('glossaryAdd').addEventListener('click', addGlossaryTerm);
glossaryInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addGlossaryTerm(); }
});

// HF token yardımı
$('hfTokenHelp').addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openExternal('https://huggingface.co/settings/tokens');
});

// yt-dlp güncelleme — YouTube indirme hataları çoğunlukla eski sürümden kaynaklanır
$('updateYtdlp').addEventListener('click', async () => {
  const btn = $('updateYtdlp');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'güncelleniyor...';
  logLine('yt-dlp güncelleniyor (pip install --upgrade yt-dlp)...');
  try {
    const r = await window.api.updateYtdlp();
    if (r.ok) logLine(`✓ ${r.message}`, 'success');
    else logLine(`yt-dlp güncellenemedi: ${r.error}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "yt-dlp'yi güncelle";
  }
});

// YouTube URL alanında Enter → başlat
$('youtubeUrl').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !state.running) {
    e.preventDefault();
    $('startBtn').click();
  }
});

// Tek tıkla tekrar-döngüsü koruması: rep_penalty 1.15 + no-repeat 3
$('applyAntiRepeat').addEventListener('click', () => {
  const rp = $('repetitionPenalty');
  const ng = $('noRepeatNgramSize');
  rp.value = '1.15';
  ng.value = '3';
  [rp, ng].forEach((el) => {
    el.dispatchEvent(new Event('input'));   // slider etiketini tazele
    el.dispatchEvent(new Event('change'));  // kalıcı kaydet
  });
  logLine('Tekrar-döngüsü koruması uygulandı: repetition_penalty=1.15, no_repeat_ngram_size=3', 'success');
});

async function saveAppSettings() {
  await window.api.saveSettings({
    glossary,
    hfToken: $('hfToken').value.trim(),
    outputDir: state.outputDir || '',
    preset: $('presetSelect').value,
    llm: {
      apiKey: $('llmApiKey') ? $('llmApiKey').value.trim() : '',
      endpointPreset: $('llmEndpointPreset') ? $('llmEndpointPreset').value : '',
      customBaseUrl: $('llmBaseUrl') ? $('llmBaseUrl').value.trim() : '',
      model: $('llmModel') ? $('llmModel').value.trim() : '',
    },
    ui: collectUiSettings(),
  });
}

// ===== Tüm UI ayarlarını kalıcı kıl (gizli anahtarlar hariç) =====
const PERSIST_VALUE_CONTROLS = [
  'model', 'engine', 'batchSize', 'language', 'task', 'formats', 'computeType', 'device',
  'beamSize', 'bestOf', 'vadThreshold', 'maxLineWidth', 'splitMode', 'timingGap',
  'wrapMode', 'hardMaxChars', 'maxCps', 'initialPrompt',
  'temperature', 'patience', 'lengthPenalty', 'repetitionPenalty', 'noRepeatNgramSize',
  'compressionRatioThreshold', 'logProbThreshold', 'noSpeechThreshold',
  'vadMinSpeechMs', 'vadMinSilenceMs', 'vadSpeechPadMs', 'vadMaxSpeechS',
  'minSpeakers', 'maxSpeakers', 'llmWorkers',
];
const PERSIST_CHECKBOX_CONTROLS = [
  'fixTimings', 'mergeShort', 'dedupe', 'langSuffix', 'vadFilter', 'conditionOnPrevious', 'temperatureFallback',
  'qualityReport', 'notifyOnDone', 'resume',
  'diarize', 'labelSpeakers',
  'llmPostprocess', 'llmFixCensorship', 'llmFixHallucination',
  'llmFixPunctuation', 'llmFixConsistency',
];

function collectUiSettings() {
  const ui = {};
  PERSIST_VALUE_CONTROLS.forEach((id) => { const el = $(id); if (el) ui[id] = el.value; });
  PERSIST_CHECKBOX_CONTROLS.forEach((id) => { const el = $(id); if (el) ui[id] = el.checked; });
  return ui;
}

let _applyingSettings = false;
function applyUiSettings(ui) {
  if (!ui || typeof ui !== 'object') return;
  _applyingSettings = true;
  try {
    PERSIST_VALUE_CONTROLS.forEach((id) => {
      if (ui[id] === undefined) return;
      const el = $(id);
      if (!el) return;
      el.value = ui[id];
      el.dispatchEvent(new Event('input'));   // range etiketlerini tazele
      el.dispatchEvent(new Event('change'));  // bağımlı UI (GPU rozeti vb.)
    });
    PERSIST_CHECKBOX_CONTROLS.forEach((id) => {
      if (ui[id] === undefined) return;
      const el = $(id);
      if (!el) return;
      el.checked = !!ui[id];
      el.dispatchEvent(new Event('change'));
    });
  } finally {
    _applyingSettings = false;
  }
  updateGpuBadge();
}

let _saveTimer = null;
function scheduleSave() {
  if (_applyingSettings) return;  // yükleme sırasında geri kaydetme
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveAppSettings, 400);
}

[...PERSIST_VALUE_CONTROLS, ...PERSIST_CHECKBOX_CONTROLS].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', scheduleSave);
});

// ===== Hazır ayar profilleri =====
// Hız/kalite çekirdeğini değiştirir (model, motor, beam...). "Film" ayrıca film
// için ideal altyazı düzenini de kurar (cümle bazlı bölme, VAD, tam cümle blokları)
// — böylece ayarları kurcaladıktan sonra tek tıkla film moduna dönülebilir.
// Diğer preset'ler bölme/format tercihlerini korur.
const PRESETS = {
  film: {
    label: '🎬 Film',
    // large-v3 (en iyi kalite) + faster (önceki bağlamı kullanır → tutarlı noktalama).
    // Cümle bazlı bölme + yüksek sert sınır = cümleler asla ortadan kesilmez.
    values: {
      model: 'large-v3', engine: 'faster', beamSize: '5', bestOf: '5', computeType: 'float16',
      splitMode: 'sentence', wrapMode: 'balanced', maxLineWidth: '42', hardMaxChars: '220', maxCps: '20',
    },
    checks: {
      vadFilter: true, temperatureFallback: true, mergeShort: true, dedupe: true,
      fixTimings: true, conditionOnPrevious: true,
    },
  },
  fast: {
    label: '⚡ Hızlı',
    values: { model: 'large-v3-turbo', engine: 'faster-batched', batchSize: '16', beamSize: '1', bestOf: '1', computeType: 'float16' },
    checks: { vadFilter: true, temperatureFallback: true },
  },
  balanced: {
    label: '⚖️ Dengeli',
    values: { model: 'large-v3-turbo', engine: 'faster', beamSize: '5', bestOf: '5', computeType: 'float16' },
    checks: { vadFilter: true, temperatureFallback: true },
  },
  quality: {
    label: '💎 En iyi kalite',
    values: { model: 'large-v3', engine: 'faster', beamSize: '5', bestOf: '5', computeType: 'float16' },
    checks: { vadFilter: true, temperatureFallback: true },
  },
};

// Preset'in dokunduğu kontrollerden biri elle değişirse seçim "Özel"e döner
const PRESET_CONTROLS = new Set(
  Object.values(PRESETS).flatMap((p) => [...Object.keys(p.values), ...Object.keys(p.checks)])
);

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  _applyingSettings = true;
  try {
    Object.entries(p.values).forEach(([id, v]) => {
      const el = $(id);
      if (!el) return;
      el.value = v;
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    });
    Object.entries(p.checks).forEach(([id, v]) => {
      const el = $(id);
      if (!el) return;
      el.checked = v;
      el.dispatchEvent(new Event('change'));
    });
  } finally {
    _applyingSettings = false;
  }
  updateGpuBadge();
  logLine(`Ön ayar uygulandı: ${p.label} — model ${p.values.model}, motor ${p.values.engine}, beam ${p.values.beamSize}`, 'success');
  saveAppSettings();
}

$('presetSelect').addEventListener('change', () => {
  const v = $('presetSelect').value;
  if (v !== 'custom') applyPreset(v);
  else saveAppSettings();
});

PRESET_CONTROLS.forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('change', () => {
    if (_applyingSettings) return;
    if ($('presetSelect').value !== 'custom') {
      $('presetSelect').value = 'custom';
      scheduleSave();
    }
  });
});

['hfToken'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', saveAppSettings);
});

// LLM endpoint preset değişimi: "custom" seçilince url alanı görünür
function updateLlmEndpointUI() {
  const preset = $('llmEndpointPreset');
  const customField = $('llmCustomUrlField');
  if (!preset || !customField) return;
  customField.classList.toggle('hidden', preset.value !== 'custom');
}

if ($('llmEndpointPreset')) {
  $('llmEndpointPreset').addEventListener('change', () => {
    updateLlmEndpointUI();
    saveAppSettings();
  });
}
['llmApiKey', 'llmBaseUrl', 'llmModel'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', saveAppSettings);
});

// "Anahtar yardımı" linki
if ($('deepseekKeyHelp')) {
  $('deepseekKeyHelp').addEventListener('click', (e) => {
    e.preventDefault();
    window.api.openExternal('https://platform.deepseek.com/api_keys');
  });
}

// Başlangıçta ayarları yükle
(async () => {
  try {
    const s = await window.api.loadSettings();
    if (s) {
      glossary = Array.isArray(s.glossary) ? s.glossary : [];
      if (s.hfToken) $('hfToken').value = s.hfToken;
      if (s.outputDir) {
        state.outputDir = s.outputDir;
        $('outputDir').textContent = s.outputDir;
      }
      if (s.llm) {
        if (s.llm.apiKey && $('llmApiKey')) $('llmApiKey').value = s.llm.apiKey;
        if (s.llm.endpointPreset && $('llmEndpointPreset')) {
          $('llmEndpointPreset').value = s.llm.endpointPreset;
        }
        if (s.llm.customBaseUrl && $('llmBaseUrl')) $('llmBaseUrl').value = s.llm.customBaseUrl;
        if (s.llm.model && $('llmModel')) $('llmModel').value = s.llm.model;
      }
      if (s.ui) applyUiSettings(s.ui);
      // Preset seçimini geri yükle (değerler zaten ui'dan geldi — yeniden uygulama yok)
      if (s.preset && ($('presetSelect').querySelector(`option[value="${s.preset}"]`))) {
        $('presetSelect').value = s.preset;
      }
    }
  } catch (_) {}
  renderGlossary();
  updateLlmEndpointUI();

  // Ortam kontrolü: GPU adı + venv/ffmpeg uyarıları
  try {
    const env = await window.api.getEnvInfo();
    if (env) {
      if (env.gpu) {
        // "NVIDIA GeForce RTX 4070 Ti, 12282 MiB" → rozette "RTX 4070 Ti"
        state.gpuName = env.gpu.split(',')[0].trim()
          .replace(/^NVIDIA\s+/i, '')
          .replace(/^GeForce\s+/i, '');
        state.gpuVramMib = env.vramMib || null;
        updateGpuBadge();
        logLine(`GPU: ${env.gpu.trim()}`, 'info');
      }
      if (!env.venv) logLine('⚠ Python sanal ortamı bulunamadı — önce install.bat çalıştırın.', 'warn');
      if (!env.ffmpeg) logLine('⚠ ffmpeg bulunamadı — PATH\'e ekleyin veya backend/bin/ içine koyun.', 'warn');
    }
  } catch (_) {}
})();

// Seçili model+compute+diarization için kaba VRAM tahmini (MiB)
function estimateVramMib() {
  const model = $('model') ? $('model').value : 'large-v3';
  const ct = $('computeType') ? $('computeType').value : 'float16';
  // float16 taban tahminleri (MiB); int8 ~yarı, float32 ~iki kat
  const base = {
    'large-v3': 3100, 'large-v3-turbo': 1700, 'large-v2': 3100,
    'medium': 1600, 'small': 750, 'base': 400, 'tiny': 250,
  }[model] || 3100;
  let mult = 1.0;
  if (ct === 'int8' || ct === 'int8_float16') mult = 0.55;
  else if (ct === 'float32') mult = 1.9;
  let est = base * mult;
  if ($('diarize') && $('diarize').checked) est += 2500;  // pyannote
  return Math.round(est);
}

// ===== GPU rozeti — seçili cihaz/compute tipini yansıt + VRAM yetersizlik uyarısı =====
function updateGpuBadge() {
  const el = $('gpuBadgeText');
  if (!el) return;
  const dev = $('device') ? $('device').value : 'cuda';
  const ct = $('computeType') ? $('computeType').value : 'float16';
  // CPU seçiliyken GPU adı göstermek yanıltıcı olur
  const devLabel = dev === 'cpu' ? 'CPU' : (state.gpuName || (dev === 'cuda' ? 'CUDA' : 'Otomatik'));
  el.textContent = `${devLabel} · ${ct}`;
  // VRAM uyarısı: tahmin toplam VRAM'in %85'ini aşıyorsa rozeti vurgula
  const badge = $('gpuBadge');
  if (badge && dev !== 'cpu' && state.gpuVramMib) {
    const est = estimateVramMib();
    const tight = est > state.gpuVramMib * 0.85;
    badge.classList.toggle('vram-warn', tight);
    badge.title = tight
      ? `Tahmini VRAM ~${est} MiB / ${state.gpuVramMib} MiB — yetersiz kalabilir (OOM). Daha küçük model, int8 veya diarization'ı kapatmayı deneyin.`
      : `Tahmini VRAM ~${est} MiB / ${state.gpuVramMib} MiB`;
  } else if (badge) {
    badge.classList.remove('vram-warn');
    badge.title = '';
  }
}
['device', 'computeType', 'model', 'diarize'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', updateGpuBadge);
});
updateGpuBadge();

// ===== Clear buttons =====
$('clearPreview').addEventListener('click', clearPreview);
$('clearLog').addEventListener('click', () => { $('log').innerHTML = ''; });

// ===== Start / cancel =====
$('startBtn').addEventListener('click', async () => {
  if (state.running) return;
  // Kuyruk çalışırken (öğeler arası boşluk dahil) tekil iş başlatma — çakışmayı önle
  if (state.queueRunning) {
    logLine('Kuyruk çalışıyor — tekil iş başlatmadan önce kuyruğu iptal et veya bitmesini bekle.', 'warn');
    return;
  }

  const opts = buildOptsFromUI();

  if (state.source === 'youtube') {
    const url = $('youtubeUrl').value.trim();
    if (!url) {
      logLine('YouTube URL boş olamaz.', 'error');
      return;
    }
    opts.youtube = url;
    state.lastJobVideo = null;  // YouTube → burn-in için yerel video yok
  } else {
    if (!state.inputFile) {
      logLine('Lütfen bir dosya seç.', 'error');
      return;
    }
    opts.input = state.inputFile;
    state.lastJobVideo = state.inputFile;
  }

  // Diarization seçilmişse HF token kontrolü
  if (opts.diarize && !opts.hfToken) {
    logLine('Konuşmacı tanıma açık ama HuggingFace token girilmemiş. Gelişmiş ayarlar → Konuşmacı tanıma → Token alanını doldurun.', 'error');
    return;
  }

  // LLM açıksa API key kontrolü
  if (opts.llmPostprocess && !opts.llmApiKey) {
    logLine('LLM düzeltme açık ama API anahtarı girilmemiş. Gelişmiş ayarlar → 🤖 LLM ile düzeltme → API Key.', 'error');
    return;
  }

  // Reset UI
  state.running = true;
  state.cancelled = false;
  state._speedEma = 0;
  state.startTime = Date.now();
  state.outputFiles = [];
  state.lastQualityReport = null;
  $('startBtn').classList.add('hidden');
  $('cancelBtn').classList.remove('hidden');
  setProgress(0);
  $('progressText').textContent = '0%';
  $('progressTime').textContent = 'başlatılıyor…';
  resetStages();
  clearPreview();
  setStatus('Çalışıyor', 'active');
  logLine('Altyazı çıkarma başlatıldı', 'info');

  const result = await window.api.startTranscribe(opts);
  if (!result.ok) {
    logLine('Hata: ' + result.error, 'error');
    finishRun(false);
  }
});

$('cancelBtn').addEventListener('click', async () => {
  // Kuyruk öğeleri arası boşlukta running=false ama queueRunning=true olabilir — yine de iptal et
  if (!state.running && !state.queueRunning) return;
  state.cancelled = true;
  const r = await window.api.cancelTranscribe();
  if (state.queueRunning) {
    // Kuyruk modunda iptal → tüm kuyruğu durdur
    state.queueRunning = false;
    // Çalışan item'ı tekrar "pending" yap ki kullanıcı yeniden başlatabilsin
    const cur = state.queue.find(x => x.id === state.currentQueueId);
    if (cur && cur.status === 'running') cur.status = 'pending';
    state.currentQueueId = null;
    renderQueue();
    logLine('İptal — kuyruk durduruldu. Bekleyen işler "Başlat" ile yeniden başlatılabilir.', 'warn');
  } else {
    logLine('İptal isteği gönderildi.', 'warn');
  }
  if (!r || !r.ok) {
    // Backend'de çalışan iş yoktu → 'exit' event'i gelmeyecek; UI'i kendimiz toparla
    state.cancelled = false;
    finishRun(false);
  }
});

function finishRun(success) {
  state.running = false;
  $('startBtn').classList.remove('hidden');
  $('cancelBtn').classList.add('hidden');
  if (success) setStatus('Tamamlandı', 'success');
  else setStatus('Hazır');
}

function notifyDone(title, body) {
  // Kullanıcı kapatmışsa bildirim gösterme; ayrıca yalnızca pencere odakta
  // değilken bildir (odaktaysa UI zaten görünüyor)
  try {
    const cb = $('notifyOnDone');
    if (cb && !cb.checked) return;
    if (!document.hasFocus()) window.api.notify(title, body || '');
  } catch (_) {}
}

// ===== Event handler =====
window.api.onEvent((event) => {
  switch (event.type) {
    case 'log':
      logLine(event.message, event.level || 'info');
      break;

    case 'status':
      recordStageTiming(event.stage);
      markStagesDoneUpTo(event.stage);
      if (event.text) {
        logLine(event.text);
        $('progressTime').textContent = event.text;
      }
      break;

    case 'download_progress':
      setProgress(event.percent);
      $('progressText').textContent = `İndiriliyor ${event.percent.toFixed(0)}%`;
      break;

    case 'language':
      logLine(`Dil: ${event.code} (güven: ${(event.probability * 100).toFixed(1)}%) — süre: ${formatTime(event.duration)}`, 'success');
      break;

    case 'progress': {
      setProgress(event.percent);
      $('progressText').textContent = `${event.percent.toFixed(1)}%`;
      const elapsed = (Date.now() - state.startTime) / 1000;
      // Hız (%/sn) üzerinde EMA — erken tahminlerdeki aşırı oynamayı yumuşatır
      const speed = elapsed > 0.1 ? event.percent / elapsed : 0;
      if (speed > 0) {
        state._speedEma = state._speedEma > 0 ? state._speedEma * 0.7 + speed * 0.3 : speed;
      }
      const remaining = state._speedEma > 0 ? (100 - event.percent) / state._speedEma : 0;
      $('progressTime').textContent = `${formatTime(event.current)} / ${formatTime(event.total)} · kalan ~${formatTime(remaining)}`;
      break;
    }

    case 'segment':
      if (state.cancelled) break;  // iptal sonrası gelen geç segmentleri yok say
      addSegment(event);
      break;

    case 'llm_progress':
      setProgress(event.percent);
      $('progressText').textContent = `LLM düzeltiyor ${event.percent.toFixed(1)}% (${event.done}/${event.total})`;
      if (event.failed) $('progressTime').textContent = `${event.failed} blokta hata`;
      break;

    case 'preview_refresh':
      // LLM/diarization metni değiştirdi — önizlemeyi nihai çıktıyla tek seferde tazele
      renderFinalPreview(event.segments || []);
      break;

    case 'quality_report':
      state.lastQualityReport = event;
      break;

    case 'done': {
      // Kullanıcı iptal ettiyse, kill ile yarışan geç 'done' başarı modalı göstermesin
      if (state.cancelled) break;
      recordStageTiming('__done__');  // son aktif aşamanın (yazma) süresini damgala
      markStagesDoneUpTo('write');
      $$('.stage').forEach((el) => {
        el.classList.remove('active');
        el.classList.add('done');
      });
      state.outputFiles = event.files || [];
      setProgress(100);
      $('progressText').textContent = '100%';
      const elapsed = (Date.now() - state.startTime) / 1000;
      $('progressTime').textContent = `tamamlandı · ${formatTime(elapsed)}`;
      logLine(`✓ ${event.segments} segment yazıldı`, 'success');
      if (Array.isArray(event.warnings) && event.warnings.length) {
        event.warnings.forEach((w) => logLine(w, 'warn'));
      }

      // Kuyruk modu: aktif iş tamamlandı, sıradakine geç
      if (state.queueRunning && state.currentQueueId !== null) {
        const item = state.queue.find(x => x.id === state.currentQueueId);
        if (item) {
          item.status = 'done';
          item.files = event.files || [];
          renderQueue();
        }
        state.currentQueueId = null;
        state.running = false;
        $('startBtn').classList.remove('hidden');
        $('cancelBtn').classList.add('hidden');
        setStatus('Hazır');
        // Sonrakine geç (kısa bekleme)
        setTimeout(processNextQueueItem, 500);
      } else {
        // Tek seferlik mod — modal göster
        showResultModal(event);
        finishRun(true);
        notifyDone('Altyazı hazır', `${event.segments} segment · ${(event.files || []).length} dosya`);
      }
      break;
    }

    case 'error':
      logLine('Hata: ' + (event.message || 'Bilinmeyen hata'), 'error');
      if (event.traceback) logLine(event.traceback, 'error');
      setStatus('Hata', 'error');

      if (state.queueRunning && state.currentQueueId !== null) {
        const item = state.queue.find(x => x.id === state.currentQueueId);
        if (item) {
          item.status = 'error';
          renderQueue();
        }
        state.currentQueueId = null;
        state.running = false;
        $('startBtn').classList.remove('hidden');
        $('cancelBtn').classList.add('hidden');
        setTimeout(processNextQueueItem, 500);
      } else {
        finishRun(false);
        notifyDone('Altyazı çıkarma başarısız', event.message || 'Bilinmeyen hata');
      }
      break;

    case 'exit':
      if (state.cancelled) {
        // Kullanıcı iptal etti — hata gibi gösterme
        state.cancelled = false;
        state.running = false;
        state.currentQueueId = null;
        $('startBtn').classList.remove('hidden');
        $('cancelBtn').classList.add('hidden');
        setStatus('İptal edildi');
        break;
      }
      if (event.code !== 0 && state.running) {
        logLine(`İşlem çıkış kodu ${event.code} ile bitti.`, 'error');
        if (event.stderr) logLine(event.stderr, 'error');
        setStatus('Hata', 'error');

        if (state.queueRunning && state.currentQueueId !== null) {
          const item = state.queue.find(x => x.id === state.currentQueueId);
          if (item && item.status === 'running') {
            item.status = 'error';
            renderQueue();
          }
          state.currentQueueId = null;
          state.running = false;
          $('startBtn').classList.remove('hidden');
          $('cancelBtn').classList.add('hidden');
          setTimeout(processNextQueueItem, 500);
        } else {
          finishRun(false);
        }
      }
      break;
  }
});

// ===== Result modal =====
function showResultModal(event) {
  let stats;
  if (event.sync_offset !== undefined) {
    const o = event.sync_offset;
    stats = `Senkronlandı · kayma ${o >= 0 ? '+' : ''}${o}s uygulandı · ${event.segments} blok`;
  } else {
    stats = `${event.segments} segment · dil: ${event.language || 'bilinmeyen'}`;
  }
  if (Array.isArray(event.warnings) && event.warnings.length) {
    stats += ` · ${event.warnings.length} uyarı (Günlük'e bakın)`;
  }
  $('modalStats').textContent = stats;

  // Kalite raporu satırı (varsa)
  const qr = state.lastQualityReport;
  const qEl = $('modalQuality');
  if (qEl) {
    if (qr && qr.blocks) {
      const issues = [];
      if (qr.cps_violations) issues.push(`${qr.cps_violations} hızlı okuma`);
      if (qr.overlaps) issues.push(`${qr.overlaps} çakışma`);
      if (qr.too_long) issues.push(`${qr.too_long} çok uzun blok`);
      const health = issues.length ? `⚠ ${issues.join(' · ')}` : '✓ Zamanlama sorunsuz';
      qEl.textContent = `${health} · en uzun blok ${qr.longest_dur}s · en yüksek ${Math.round(qr.max_cps)} KPS`;
      qEl.classList.remove('hidden');
    } else {
      qEl.classList.add('hidden');
    }
  }

  const filesEl = $('modalFiles');
  filesEl.innerHTML = '';
  (event.files || []).forEach((f) => {
    const div = document.createElement('div');
    div.className = 'modal-file-item';
    const name = f.split(/[\\/]/).pop();
    div.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <span style="opacity:.6">aç →</span>
    `;
    div.addEventListener('click', () => window.api.openPath(f));
    filesEl.appendChild(div);
  });

  // Araçları sıfırla: kaydırma + burn-in
  $('shiftSeconds').value = '0';
  $('burninProgress').classList.add('hidden');
  $('burnInCancel').classList.add('hidden');
  $('burnInBtn').classList.remove('hidden');
  // Burn-in yalnızca yerel video + SRT/ASS çıktısı varsa anlamlı
  const canBurn = !!state.lastJobVideo && !!pickOutput(['.srt', '.ass']);
  $('burninRow').classList.toggle('hidden', !canBurn);

  $('resultModal').classList.remove('hidden');
}

$('closeModal').addEventListener('click', () => {
  $('resultModal').classList.add('hidden');
});

$('openOutput').addEventListener('click', () => {
  const f = state.outputFiles[0];
  if (f) window.api.showInFolder(f);
  $('resultModal').classList.add('hidden');
});

// ===== Kuyruk buton event'leri =====
$('queueAddBtn').addEventListener('click', () => {
  if (state.source === 'youtube') {
    const url = $('youtubeUrl').value.trim();
    if (!url) {
      logLine('YouTube URL boş', 'warn');
      return;
    }
    addToQueue('youtube', url);
    $('youtubeUrl').value = '';
    logLine(`+ Kuyruğa eklendi: ${url.slice(0, 50)}...`);
  } else {
    if (!state.inputFile) {
      logLine('Önce bir dosya seç', 'warn');
      return;
    }
    addToQueue('file', state.inputFile);
    logLine(`+ Kuyruğa eklendi: ${state.inputFile.split(/[\\/]/).pop()}`);
    // Dosyayı temizle (kuyruğa eklendi, bir sonrakini seçebilsin)
    state.inputFile = null;
    $('fileInfo').classList.add('hidden');
    dropZone.classList.remove('hidden');
  }
});

$('clearQueue').addEventListener('click', () => {
  if (state.queueRunning) {
    logLine('Kuyruk çalışırken temizlenemez. Önce iptal et.', 'warn');
    return;
  }
  clearQueue();
});

$('startQueueBtn').addEventListener('click', startQueue);

// "Sırada dur" düğmesi: kuyruk çalışırken görünür; mevcut iş bitince durdurur
function updateStopAfterBtn() {
  const btn = $('stopAfterCurrent');
  if (!btn) return;
  btn.classList.toggle('hidden', !state.queueRunning);
  btn.classList.toggle('armed', !!state.stopAfterCurrent);
  btn.textContent = state.stopAfterCurrent ? '⏸ Sırada durulacak' : '⏸ Sırada dur';
}
$('stopAfterCurrent').addEventListener('click', () => {
  if (!state.queueRunning) return;
  state.stopAfterCurrent = !state.stopAfterCurrent;
  updateStopAfterBtn();
  logLine(state.stopAfterCurrent
    ? 'Kuyruk mevcut iş bittikten sonra duracak.'
    : 'Kuyruk durdurma iptal edildi — devam edecek.', 'info');
});

// Kuyruk bitince son tamamlanan işin klasörünü açma kısayolu (günlüğe tıklanabilir buton)
function offerOpenLastOutput() {
  const lastDone = [...state.queue].reverse().find(x => x.status === 'done' && x.files && x.files.length);
  if (!lastDone) return;
  const line = logLine('Son çıktı hazır.', 'success');
  if (!line) return;
  const btn = document.createElement('button');
  btn.className = 'link-btn';
  btn.textContent = 'Klasörü aç →';
  btn.style.marginLeft = '8px';
  btn.addEventListener('click', () => window.api.showInFolder(lastDone.files[0]));
  line.appendChild(btn);
}

// ===== Klavye kısayolları =====
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!state.running) $('startBtn').click();
  } else if (e.key === 'Escape') {
    const modal = $('resultModal');
    if (modal && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    } else if (state.running || state.queueRunning) {
      $('cancelBtn').click();
    }
  }
});

// ===== Ayarları dışa/içe aktar =====
$('exportSettings').addEventListener('click', async () => {
  await saveAppSettings();  // önce mevcut UI'yi diske yaz
  const r = await window.api.exportSettings();
  if (r && r.ok) logLine(`Ayarlar dışa aktarıldı: ${r.path}`, 'success');
  else if (r && r.error) logLine('Dışa aktarma başarısız: ' + r.error, 'error');
});

$('importSettings').addEventListener('click', async () => {
  const r = await window.api.importSettings();
  if (!r || !r.ok) {
    if (r && r.error) logLine('İçe aktarma başarısız: ' + r.error, 'error');
    return;
  }
  const s = r.settings || {};
  glossary = Array.isArray(s.glossary) ? s.glossary : glossary;
  if (s.hfToken !== undefined) $('hfToken').value = s.hfToken || '';
  if (s.outputDir) { state.outputDir = s.outputDir; $('outputDir').textContent = s.outputDir; }
  if (s.llm) {
    if (s.llm.apiKey !== undefined && $('llmApiKey')) $('llmApiKey').value = s.llm.apiKey || '';
    if (s.llm.endpointPreset && $('llmEndpointPreset')) $('llmEndpointPreset').value = s.llm.endpointPreset;
    if (s.llm.customBaseUrl !== undefined && $('llmBaseUrl')) $('llmBaseUrl').value = s.llm.customBaseUrl || '';
    if (s.llm.model && $('llmModel')) $('llmModel').value = s.llm.model;
  }
  if (s.ui) applyUiSettings(s.ui);
  if (s.preset && $('presetSelect').querySelector(`option[value="${s.preset}"]`)) $('presetSelect').value = s.preset;
  renderGlossary();
  updateLlmEndpointUI();
  updateGpuBadge();
  logLine('Ayarlar içe aktarıldı ve uygulandı.', 'success');
});

// ===== JSON'dan yeniden dışa aktarma =====
$('reexportJson').addEventListener('click', async () => {
  if (state.running) { logLine('Bir iş çalışırken yeniden üretilemez.', 'warn'); return; }
  const jsonPath = await window.api.selectFile('json');
  if (!jsonPath) return;
  const opts = buildOptsFromUI();
  opts.input = jsonPath;
  opts.reexport = true;
  // re-export'ta YouTube/transkripsiyon yok; mevcut format + satır kaydırma ayarları kullanılır
  resetStages();
  clearPreview();
  setStatus('Çalışıyor', 'active');
  state.running = true;
  state.cancelled = false;
  state.startTime = Date.now();
  state.outputFiles = [];
  state.lastQualityReport = null;
  state.lastJobVideo = null;
  $('startBtn').classList.add('hidden');
  $('cancelBtn').classList.remove('hidden');
  logLine(`JSON'dan yeniden üretiliyor: ${jsonPath.split(/[\\/]/).pop()}`, 'info');
  const r = await window.api.startTranscribe(opts);
  if (!r.ok) { logLine('Hata: ' + r.error, 'error'); finishRun(false); }
});

// ===== Altyazı senkronlama aracı =====
function updateSyncBtn() {
  const btn = $('syncBtn');
  if (btn) btn.disabled = !(state.syncVideo && state.syncSrt);
}

$('pickSyncVideo').addEventListener('click', async () => {
  const files = await window.api.selectVideo();
  if (files && files[0]) {
    state.syncVideo = files[0];
    $('syncVideoPath').textContent = files[0];
    updateSyncBtn();
  }
});

$('pickSyncSrt').addEventListener('click', async () => {
  const p = await window.api.selectFile('subtitle');
  if (p) {
    state.syncSrt = p;
    $('syncSrtPath').textContent = p;
    updateSyncBtn();
  }
});

$('syncBtn').addEventListener('click', async () => {
  if (state.running) { logLine('Bir iş çalışırken senkronlama yapılamaz.', 'warn'); return; }
  if (!state.syncVideo || !state.syncSrt) return;
  const opts = buildOptsFromUI();
  opts.input = state.syncVideo;
  opts.syncSubs = true;
  opts.syncSrt = state.syncSrt;
  // Transkripsiyon boru hattını yeniden kullan (ilerleme/günlük/sonuç)
  resetStages();
  clearPreview();
  setStatus('Çalışıyor', 'active');
  state.running = true;
  state.cancelled = false;
  state.startTime = Date.now();
  state.outputFiles = [];
  state.lastQualityReport = null;
  state.lastJobVideo = state.syncVideo;
  $('startBtn').classList.add('hidden');
  $('cancelBtn').classList.remove('hidden');
  logLine(`Senkronlanıyor: ${state.syncSrt.split(/[\\/]/).pop()} ↔ ${state.syncVideo.split(/[\\/]/).pop()}`, 'info');
  const r = await window.api.startTranscribe(opts);
  if (!r.ok) { logLine('Hata: ' + r.error, 'error'); finishRun(false); }
});

// ===== Sonuç modalı araçları: zaman kaydır + videoya göm =====
function pickOutput(exts) {
  return (state.outputFiles || []).find(f => exts.includes(f.slice(f.lastIndexOf('.')).toLowerCase()));
}

$('applyShift').addEventListener('click', async () => {
  const target = pickOutput(['.srt', '.vtt']);
  if (!target) { logLine('Kaydırılacak SRT/VTT çıktısı yok.', 'warn'); return; }
  const off = parseFloat($('shiftSeconds').value);
  if (!isFinite(off) || off === 0) { logLine('Geçerli bir kaydırma değeri girin (sn).', 'warn'); return; }
  const r = await window.api.shiftSubs(target, off);
  if (r && r.ok) logLine(`Zaman kaydırıldı (${off > 0 ? '+' : ''}${off}s): ${target.split(/[\\/]/).pop()}`, 'success');
  else logLine('Kaydırma başarısız: ' + ((r && r.error) || ''), 'error');
});

$('burnInBtn').addEventListener('click', async () => {
  const sub = pickOutput(['.srt', '.ass']);
  if (!state.lastJobVideo) { logLine('Gömme yalnızca yerel video girdisinde mümkün (YouTube değil).', 'warn'); return; }
  if (!sub) { logLine('Gömülecek SRT/ASS çıktısı yok.', 'warn'); return; }
  const r = await window.api.burnInStart(state.lastJobVideo, sub);
  if (!r || !r.ok) { logLine('Gömme başlatılamadı: ' + ((r && r.error) || ''), 'error'); return; }
  $('burninProgress').classList.remove('hidden');
  $('burnInBtn').classList.add('hidden');
  $('burnInCancel').classList.remove('hidden');
  $('burninFill').style.width = '0%';
  $('burninText').textContent = 'Gömülüyor… 0%';
});

$('burnInCancel').addEventListener('click', () => window.api.burnInCancel());

window.api.onBurnInEvent((ev) => {
  if (ev.type === 'progress') {
    $('burninFill').style.width = `${ev.percent}%`;
    $('burninText').textContent = `Gömülüyor… ${ev.percent.toFixed(0)}%`;
  } else if (ev.type === 'done') {
    $('burninFill').style.width = '100%';
    $('burninText').textContent = 'Tamamlandı ✓';
    $('burnInCancel').classList.add('hidden');
    $('burnInBtn').classList.remove('hidden');
    logLine(`Videoya gömüldü: ${ev.file}`, 'success');
    window.api.showInFolder(ev.file);
  } else if (ev.type === 'error') {
    $('burninProgress').classList.add('hidden');
    $('burnInCancel').classList.add('hidden');
    $('burnInBtn').classList.remove('hidden');
    logLine('Gömme hatası: ' + (ev.message || ''), 'error');
  }
});

// ===== Initial log =====
logLine('Whisper Altyazı hazır. (Ctrl+Enter: başlat · Esc: iptal)', 'success');
