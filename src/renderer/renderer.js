// ===== State =====
const state = {
  source: 'file',
  forceTranslate: false,   // kontrol cubugundaki tek-tik "altyazi + ceviri"
  aiJob: false,            // calisan is bir AI sorusu mu (sohbet / acikla)

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
  watchDir: null,       // izlenen klasör (yeni dosyalar kuyruğa eklenir)
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
    youtubeAudioLang: state.nextYoutubeAudioLang || '',
    youtubeCookieBrowser: $('youtubeCookieBrowser') ? $('youtubeCookieBrowser').value : '',
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
    snapToSpeech: $('snapToSpeech') ? $('snapToSpeech').checked : true,
    mergeShort: $('mergeShort').checked,
    mergeIncomplete: $('mergeIncomplete').checked,
    mergeContinuation: $('mergeContinuation') ? $('mergeContinuation').checked : false,
    continuationGap: $('continuationGap') ? parseFloat($('continuationGap').value) : 3.0,
    fixPunctuationCollapse: $('fixPunctuationCollapse').checked,
    confidenceReport: $('confidenceReport').checked,
    fixCommonErrors: $('fixCommonErrors').checked,
    dropRepeatedHallucinations: $('dropRepeatedHallucinations').checked,
    incompleteGap: parseFloat($('incompleteGap').value),
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
    // state.forceTranslate: kontrol cubugundaki tek-tik dugmesi. Kalici
    // ayari degistirmeden yalnizca o is icin ceviriyi acar.
    translate: $('translate').checked || !!state.forceTranslate,
    translateTo: $('translateTo').value,
    translateApiKey: $('translateApiKey').value.trim(),
    translateBaseUrl: $('translateEndpointPreset').value === 'custom'
      ? $('translateBaseUrl').value.trim()
      : $('translateEndpointPreset').value,
    translateModel: $('translateModel').value.trim(),
    translateWorkers: parseInt($('translateWorkers').value, 10),
    translateRegister: $('translateRegister').value,
    translateContext: $('translateContext') ? $('translateContext').value : '4',
    translateCache: $('translateCache') ? $('translateCache').checked : true,
    translateProfanity: $('translateProfanity').value,
    translateKeepSource: $('translateKeepSource').checked,
    translateRefine: $('translateRefine').checked,
    dualSubtitle: $('dualSubtitle').checked,
    audioPreprocess: $('audioPreprocess').value,
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

// Tekil baslatma ve KUYRUK ayni on kontrollerden gecer. Eskiden kuyruk
// dogrudan buildOptsFromUI() ile ekliyordu; anahtarsiz ceviri/LLM/diarization
// veya gecersiz kirpma araligiyla is eklenebiliyor, kullanici sorunu ancak
// gunlukten anliyordu.
function optsProblem(opts) {
  const a = parseClipInput(opts.clipStart);
  const b = parseClipInput(opts.clipEnd);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 'Zaman aralığı biçimi geçersiz. Örnek: 90 · 1:30 · 01:02:03';
  }
  if (a !== null && b !== null && b <= a) {
    return 'Zaman aralığı geçersiz: bitiş, başlangıçtan büyük olmalı.';
  }
  if (opts.translate && !opts.translateApiKey) {
    return 'Çeviri açık ama API anahtarı girilmemiş. Gelişmiş ayarlar → Çeviri → API Key.';
  }
  if (opts.diarize && !opts.hfToken) {
    return 'Konuşmacı tanıma açık ama HuggingFace token girilmemiş.';
  }
  if (opts.llmPostprocess && !opts.llmApiKey) {
    return 'LLM düzeltme açık ama API anahtarı girilmemiş.';
  }
  return null;
}

// IPC çağrısı Electron kapanışı, kanal hatası veya süreç çökmesi nedeniyle
// reddedilirse UI kilitli kalmasın. Tüm başlatma akışları aynı güvenli sonucu
// kullanır ve mevcut !result.ok hata yollarına düşer.
async function startTranscribeSafe(opts) {
  try {
    const result = await window.api.startTranscribe(opts);
    return result || { ok: false, error: 'Transkripsiyon başlatılamadı.' };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Transkripsiyon IPC çağrısı başarısız.' };
  }
}

function addToQueue(type, input) {
  if (!input) return;
  const opts = buildOptsFromUI();
  // Oynaticinin ses kilidi yalnizca bu tek ise aittir; ana ekrandaki sonraki
  // YouTube isi yanlislikla ayni dublaji devralmasin.
  state.nextYoutubeAudioLang = '';
  const problem = optsProblem(opts);
  if (problem) {
    logLine(`Kuyruğa eklenmedi — ${problem}`, 'error');
    return;
  }
  const id = ++_queueIdCounter;
  const label = type === 'youtube'
    ? input.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)
    : input.split(/[\\/]/).pop();
  // Ayarları EKLEME anında dondur: kuyruk işlenirken UI değişse bile bu iş eski ayarı kullanır
  state.queue.push({ id, type, input, label, status: 'pending', files: [], opts });
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
    // Uyarı özeti: toplu işlemde tek tek günlüğe bakmadan hangi dosya kontrol istiyor
    const warned = state.queue.filter(x => x.warnings && x.warnings.length);
    finalizeQueue();
    logLine('Kuyruk tamamlandı ✓', 'success');
    if (warned.length) {
      logLine(`⚠ ${warned.length} dosyada uyarı var — elle kontrol edin:`, 'warn');
      warned.forEach((x) => {
        const name = x.label || (x.input || '').split(/[\/]/).pop();
        x.warnings.forEach((w) => logLine(`   ${name}: ${w}`, 'warn'));
      });
    }
    notifyDone('Kuyruk tamamlandı',
      `${doneN} iş bitti${errN ? ` · ${errN} hata` : ''}${warned.length ? ` · ${warned.length} uyarı` : ''}`);
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

  const r = await startTranscribeSafe(opts);
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

// ===== File & folder selection =====
const dropZone = $('dropZone');
dropZone.addEventListener('click', async () => {
  const files = await window.api.selectVideo();
  if (!files || files.length === 0) return;
  if (files.length === 1 && state.queue.length === 0 && !state.running && !state.queueRunning) {
    setInputFile(files[0]);
  } else {
    // Birden çok dosya seçildi: hepsini kuyruğa ekle
    files.forEach((f) => addToQueue('file', f));
    logLine(`+ ${files.length} dosya kuyruğa eklendi`, 'success');
  }
});

// ===== Zaman aralığı (kırpma) =====
// "1:30", "90", "01:02:03" gibi girdileri saniyeye çevirir; geçersizse null.
function parseClipInput(value) {
  const v = (value || '').trim();
  if (!v) return null;
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(v)) return NaN;
  const parts = v.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function formatClipDur(sec) {
  const m = Math.floor(sec / 60), s2 = Math.round(sec % 60);
  return m ? `${m} dk ${s2} sn` : `${s2} sn`;
}

function updateClipHint() {
  const hint = $('clipHint');
  const clearBtn = $('clearClip');
  if (!hint) return;
  const rawS = $('clipStart').value.trim();
  const rawE = $('clipEnd').value.trim();
  if (clearBtn) clearBtn.style.display = (rawS || rawE) ? '' : 'none';
  const a = parseClipInput(rawS);
  const b = parseClipInput(rawE);
  hint.classList.remove('hint-error');
  if (Number.isNaN(a) || Number.isNaN(b)) {
    hint.textContent = '⚠ Geçersiz zaman biçimi. Örnek: 90 · 1:30 · 01:02:03';
    hint.classList.add('hint-error');
    return;
  }
  if (a !== null && b !== null && b <= a) {
    hint.textContent = '⚠ Bitiş, başlangıçtan büyük olmalı.';
    hint.classList.add('hint-error');
    return;
  }
  if (a === null && b === null) {
    hint.innerHTML = 'Yalnızca bir bölümü çevirmek için: <code>1:30</code> – <code>5:00</code> '
      + '(veya saniye: <code>90</code>). Zaman damgaları orijinal videoya göre hizalanır; '
      + "YouTube'da iki sınır da doluysa <strong>sadece o aralık indirilir</strong>.";
    return;
  }
  const from = a === null ? 'baştan' : formatClipDur(a);
  const to = b === null ? 'sona kadar' : formatClipDur(b);
  const len = (a !== null && b !== null) ? ` · seçili süre: ${formatClipDur(b - a)}` : '';
  hint.textContent = `⏱ Yalnızca ${from} → ${to} çevrilecek${len}`;
}

['clipStart', 'clipEnd'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('input', updateClipHint);
});
const clearClipBtn = $('clearClip');
if (clearClipBtn) {
  clearClipBtn.addEventListener('click', () => {
    $('clipStart').value = '';
    $('clipEnd').value = '';
    updateClipHint();
  });
}
updateClipHint();

// ===== Klasör izleme =====
// Yeni dosyalar kuyruğa eklenir; kuyruk çalışmıyorsa kendiliğinden başlatılır.
async function applyWatchState() {
  const on = $('watchEnabled') && $('watchEnabled').checked;
  if (on && state.watchDir) {
    const opts = buildOptsFromUI();
    const res = await window.api.startWatchFolder(state.watchDir, {
      formats: opts.formats,
      langSuffix: opts.langSuffix,
      outputDir: opts.outputDir,
      translateTo: opts.translateTo,
    });
    if (res && res.ok) logLine(`Klasör izleniyor: ${state.watchDir}`, 'success');
    else logLine(`Klasör izlenemedi: ${(res && res.error) || 'bilinmeyen hata'}`, 'error');
  } else {
    await window.api.stopWatchFolder();
    if (!on) logLine('Klasör izleme kapatıldı.', 'info');
  }
}

if ($('pickWatchDir')) {
  $('pickWatchDir').addEventListener('click', async () => {
    const dir = await window.api.selectFolder();
    if (!dir) return;
    state.watchDir = dir;
    $('watchDirPath').textContent = dir;
    saveAppSettings();
    applyWatchState();
  });
}
if ($('watchEnabled')) {
  $('watchEnabled').addEventListener('change', () => {
    if ($('watchEnabled').checked && !state.watchDir) {
      logLine('Önce izlenecek klasörü seç.', 'warn');
      $('watchEnabled').checked = false;
      return;
    }
    saveAppSettings();
    applyWatchState();
  });
}
// Klasör izleme açıkken çıktı biçimi/dil eki değişirse ana süreçteki tarama
// politikasını da güncelle; aksi halde yeni ayar ancak uygulama yeniden
// başlatıldığında devreye girer.
['formats', 'langSuffix'].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('change', () => {
    saveAppSettings();
    if ($('watchEnabled')?.checked && state.watchDir) applyWatchState();
  });
});
if (window.api.onWatchFiles) {
  window.api.onWatchFiles((files) => {
    if (!Array.isArray(files) || !files.length) return;
    files.forEach((f) => addToQueue('file', f));
    logLine(`Klasörde ${files.length} yeni dosya bulundu, kuyruğa eklendi.`, 'success');
    if (!state.queueRunning && !state.running) {
      logLine('Kuyruk otomatik başlatılıyor.', 'info');
      $('startQueueBtn').click();
    }
  });
}

const openLogFolderBtn = $('openLogFolder');
if (openLogFolderBtn) {
  openLogFolderBtn.addEventListener('click', async () => {
    const res = await window.api.openLogFolder();
    if (!res || !res.ok) logLine(`Günlük klasörü açılamadı: ${(res && res.error) || 'bilinmeyen hata'}`, 'error');
  });
}

const pickVideosBtn = $('pickVideosBtn');
if (pickVideosBtn) {
  pickVideosBtn.addEventListener('click', async () => {
    const files = await window.api.selectVideo();
    if (!files || files.length === 0) return;
    if (files.length === 1 && state.queue.length === 0 && !state.running && !state.queueRunning) {
      setInputFile(files[0]);
    } else {
      files.forEach((f) => addToQueue('file', f));
      logLine(`+ ${files.length} dosya kuyruğa eklendi`, 'success');
    }
  });
}

const pickFoldersBtn = $('pickFoldersBtn');
if (pickFoldersBtn) {
  pickFoldersBtn.addEventListener('click', async () => {
    const files = await window.api.selectFolders();
    if (!files || files.length === 0) {
      logLine('Seçilen klasör(ler)de desteklenen video veya ses dosyası bulunamadı.', 'warn');
      return;
    }
    if (files.length === 1 && state.queue.length === 0 && !state.running && !state.queueRunning) {
      setInputFile(files[0]);
    } else {
      files.forEach((f) => addToQueue('file', f));
      logLine(`+ ${files.length} bölüm/dosya kuyruğa eklendi`, 'success');
    }
  });
}

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

async function handleDropPayload(e) {
  // webUtils üzerinden gerçek disk yolu (Electron 32+'da file.path kaldırıldı)
  const paths = Array.from(e.dataTransfer.files)
    .map((f) => window.api.getFilePath(f))
    .filter(Boolean);

  if (paths.length > 0) {
    const mediaFiles = await window.api.scanMediaPaths(paths);
    if (!mediaFiles || mediaFiles.length === 0) {
      logLine('Bırakılan dosya veya klasörlerde desteklenen video/ses dosyası bulunamadı.', 'warn');
      return;
    }
    if (mediaFiles.length === 1 && state.queue.length === 0 && !state.running && !state.queueRunning) {
      setInputFile(mediaFiles[0]);
    } else {
      mediaFiles.forEach((f) => addToQueue('file', f));
      logLine(`+ ${mediaFiles.length} bölüm/dosya kuyruğa eklendi`, 'success');
    }
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
  ['incompleteGap', 'incompleteGapVal'],
  ['continuationGap', 'continuationGapVal'],
  ['llmWorkers', 'llmWorkersVal'],
  ['translateWorkers', 'translateWorkersVal'],
  ['subSize', 'subSizeVal'],
  ['subOffset', 'subOffsetVal'],
];


ranges.forEach(([input, label]) => {
  const el = $(input);
  const lbl = $(label);
  if (!el || !lbl) return;
  const update = () => {
    let v = el.value;
    if (input === 'subOffset') {
      v = parseFloat(v).toFixed(1);
    } else if (['vadThreshold', 'temperature', 'noSpeechThreshold', 'timingGap', 'incompleteGap', 'continuationGap'].includes(input)) {
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
    watchDir: state.watchDir || '',
    translate: {
      apiKey: $('translateApiKey') ? $('translateApiKey').value.trim() : '',
      endpointPreset: $('translateEndpointPreset') ? $('translateEndpointPreset').value : '',
      customBaseUrl: $('translateBaseUrl') ? $('translateBaseUrl').value.trim() : '',
      model: $('translateModel') ? $('translateModel').value.trim() : '',
    },
    llm: {
      apiKey: $('llmApiKey') ? $('llmApiKey').value.trim() : '',
      endpointPreset: $('llmEndpointPreset') ? $('llmEndpointPreset').value : '',
      customBaseUrl: $('llmBaseUrl') ? $('llmBaseUrl').value.trim() : '',
      model: $('llmModel') ? $('llmModel').value.trim() : '',
    },
    ui: collectUiSettings(),
    playerPositions: player.positions,
  });
}

// ===== Tüm UI ayarlarını kalıcı kıl (gizli anahtarlar hariç) =====
const PERSIST_VALUE_CONTROLS = [
  'model', 'engine', 'batchSize', 'language', 'task', 'formats', 'computeType', 'device',
  'beamSize', 'bestOf', 'vadThreshold', 'maxLineWidth', 'splitMode', 'timingGap',
  'wrapMode', 'hardMaxChars', 'maxCps', 'initialPrompt', 'incompleteGap', 'continuationGap', 'audioPreprocess',
  'temperature', 'patience', 'lengthPenalty', 'repetitionPenalty', 'noRepeatNgramSize',
  'compressionRatioThreshold', 'logProbThreshold', 'noSpeechThreshold',
  'vadMinSpeechMs', 'vadMinSilenceMs', 'vadSpeechPadMs', 'vadMaxSpeechS',
  'minSpeakers', 'maxSpeakers', 'llmWorkers',
  'translateTo', 'translateEndpointPreset', 'translateModel', 'translateWorkers',
  'translateRegister', 'translateProfanity', 'translateBaseUrl', 'translateContext',
  'subSize', 'subOffset', 'playerSpeed', 'playerVolume', 'youtubeCookieBrowser',
];
const PERSIST_CHECKBOX_CONTROLS = [
  'fixTimings', 'snapToSpeech', 'mergeShort', 'mergeIncomplete', 'mergeContinuation', 'fixPunctuationCollapse', 'confidenceReport', 'fixCommonErrors', 'dropRepeatedHallucinations', 'syncFixFramerate', 'syncPiecewise', 'dedupe', 'langSuffix', 'vadFilter', 'conditionOnPrevious', 'temperatureFallback',
  'qualityReport', 'notifyOnDone', 'resume',
  'diarize', 'labelSpeakers',
  'translate', 'translateKeepSource', 'translateRefine', 'translateCache', 'dualSubtitle', 'watchEnabled',
  'playerAutoNext',
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
    label: 'Film',
    // large-v3-turbo (en iyi denge) + faster. Cümle bazlı bölme (noktada böl) + kırma yok
    // = her cümle tek satırlık blok olur.
    // conditionOnPrevious KAPALI: uzun filmlerde Whisper bir kez noktalamayı bırakınca
    // bozuk metni bağlam olarak geri besleyip sona kadar noktasız devam ediyordu
    // (Popol Vuh vakası). Yedek olarak fixPunctuationCollapse yine de açık.
    values: {
      model: 'large-v3-turbo', engine: 'faster', beamSize: '5', bestOf: '5', computeType: 'float16',
      splitMode: 'sentence', wrapMode: 'none', maxLineWidth: '80', hardMaxChars: '220', maxCps: '20',
      // Filmde diyalog baglami kritik (sen/siz, cinsiyet, devam eden cumleler)
      translateContext: '6',
    },
    checks: {
      vadFilter: true, temperatureFallback: true, mergeShort: true, dedupe: true,
      snapToSpeech: true,
      fixTimings: true, conditionOnPrevious: false, mergeIncomplete: true,
      fixPunctuationCollapse: true, confidenceReport: true, fixCommonErrors: true,
    },
  },
  fast: {
    label: 'Hızlı',
    values: { model: 'large-v3-turbo', engine: 'faster-batched', batchSize: '16', beamSize: '1', bestOf: '1', computeType: 'float16', splitMode: 'sentence', wrapMode: 'none' },
    checks: { vadFilter: true, temperatureFallback: true },
  },
  balanced: {
    label: 'Dengeli',
    values: { model: 'large-v3-turbo', engine: 'faster', beamSize: '5', bestOf: '5', computeType: 'float16', splitMode: 'sentence', wrapMode: 'none' },
    checks: { vadFilter: true, temperatureFallback: true },
  },
  quality: {
    label: 'En iyi kalite',
    values: { model: 'large-v3', engine: 'faster', beamSize: '5', bestOf: '5', computeType: 'float16', splitMode: 'sentence', wrapMode: 'none' },
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

// Çeviri endpoint preset'i: "custom" seçilince özel URL alanı görünür
function updateTranslateEndpointUI() {
  const preset = $('translateEndpointPreset');
  const customField = $('translateCustomUrlField');
  if (!preset || !customField) return;
  customField.classList.toggle('hidden', preset.value !== 'custom');
}

if ($('translateEndpointPreset')) {
  $('translateEndpointPreset').addEventListener('change', () => {
    updateTranslateEndpointUI();
    saveAppSettings();
  });
  updateTranslateEndpointUI();
}

// API anahtarı yazılınca kaydet (gizli alanlar PERSIST listesinde değil)
['translateApiKey'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', saveAppSettings);
});
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
      if (s.playerPositions && typeof s.playerPositions === 'object') {
        player.positions = s.playerPositions;
      }
      if (s.watchDir) {
        state.watchDir = s.watchDir;
        if ($('watchDirPath')) $('watchDirPath').textContent = s.watchDir;
      }
      if (s.translate) {
        if (s.translate.apiKey && $('translateApiKey')) $('translateApiKey').value = s.translate.apiKey;
        if (s.translate.endpointPreset && $('translateEndpointPreset')) {
          $('translateEndpointPreset').value = s.translate.endpointPreset;
        }
        if (s.translate.customBaseUrl && $('translateBaseUrl')) {
          $('translateBaseUrl').value = s.translate.customBaseUrl;
        }
        if (s.translate.model && $('translateModel')) $('translateModel').value = s.translate.model;
        updateTranslateEndpointUI();
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
      if (env.gpuFeatures) {
        const featureLabel = (value) => String(value || 'bilinmiyor').replace(/_/g, ' ');
        const accelerated = [env.gpuFeatures.videoDecode, env.gpuFeatures.webgl,
          env.gpuFeatures.gpuCompositing].some((value) => String(value || '').startsWith('enabled'));
        logLine(`Tarayıcı GPU ${accelerated ? 'etkin' : 'sınırlı'} · video çözme: ${featureLabel(env.gpuFeatures.videoDecode)}`
          + ` · WebGL: ${featureLabel(env.gpuFeatures.webgl)}`
          + ` · kompozisyon: ${featureLabel(env.gpuFeatures.gpuCompositing)}`,
        accelerated ? 'success' : 'warn');
      }
      if (!env.venv) logLine('⚠ Python sanal ortamı bulunamadı — önce install.bat çalıştırın.', 'warn');
      if (!env.ffmpeg) logLine('⚠ ffmpeg bulunamadı — PATH\'e ekleyin veya backend/bin/ içine koyun.', 'warn');
    }
  } catch (_) {}
})();

// Seçili model+motor+batch+diarization için korumacı VRAM üst sınırı (MiB)
function estimateVramMib() {
  const model = $('model') ? $('model').value : 'large-v3';
  const ct = $('computeType') ? $('computeType').value : 'float16';
  const engine = $('engine') ? $('engine').value : 'faster';
  const batchSize = Math.max(1, Math.min(32, parseInt(($('batchSize') || {}).value, 10) || 1));
  // float16 taban tahminleri (MiB); int8 ~yarı, float32 ~iki kat
  const base = {
    'large-v3': 3100, 'large-v3-turbo': 1700, 'large-v2': 3100,
    'medium': 1600, 'small': 750, 'base': 400, 'tiny': 250,
  }[model] || 3100;
  let mult = 1.0;
  if (ct === 'int8' || ct === 'int8_float16') mult = 0.55;
  else if (ct === 'float32') mult = 1.9;
  let est = base * mult;
  if (engine === 'faster-batched' || engine === 'whisperx') {
    // Aktivasyon belleği batch ile artar; doğrusal katsayıyı üstten sınırlamak
    // rozeti kesin ölçüm gibi göstermeden yüksek batch değerlerini görünür kılar.
    const batchMultiplier = Math.min(1.35, 0.12 + Math.max(0, batchSize - 1) * 0.035);
    est += base * mult * batchMultiplier;
  }
  if (engine === 'whisperx') est += 1400; // wav2vec2 hizalama aşaması için güvenlik payı
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
      ? `Korumacı VRAM tahmini ~${est} MiB / ${state.gpuVramMib} MiB — yetersiz kalabilir (OOM). Batch boyutunu düşürün; daha küçük model, int8 veya diarization'ı kapatmayı deneyin.`
      : `Korumacı VRAM tahmini ~${est} MiB / ${state.gpuVramMib} MiB`;
  } else if (badge) {
    badge.classList.remove('vram-warn');
    badge.title = '';
  }
}
['device', 'computeType', 'model', 'engine', 'diarize'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', updateGpuBadge);
});
if ($('batchSize')) $('batchSize').addEventListener('input', updateGpuBadge);
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

  // On kontroller kuyrukla AYNI fonksiyondan gecer (ikisi ayrismasin diye)
  const problem = optsProblem(opts);
  if (problem) { logLine(problem, 'error'); return; }

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

  const result = await startTranscribeSafe(opts);
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
  // İptal sonrası gelebilecek hata/çıkış olayını önce exit handler'ının
  // görmesine izin ver; başarılı/normal tamamlanmada bayrağı temizle.
  if (success) state.cancelled = false;
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
// Oynaticidan baslatilan is: ilerleme SAG PANELDE gosterilir (ana pencere
// oynatici katmaninin altinda kaldigi icin oradaki cubuk gorunmuyor). Bitince
// uretilen altyazi otomatik yuklenir - ama YALNIZCA hala ayni videodaysak.
let _liveCueRenderTimer = null;
function scheduleLiveCueRender() {
  if (_liveCueRenderTimer) return;
  _liveCueRenderTimer = setTimeout(() => {
    _liveCueRenderTimer = null;
    renderCueList($('cueSearch') ? $('cueSearch').value : '');
    renderCue();
    if (typeof drawTimeline === 'function') drawTimeline();
  }, 140);
}

function liveSegments(event) {
  if (Array.isArray(event.segments)) return event.segments;
  if (event.type === 'segment' && event.text) {
    return [{ start: event.start, end: event.end, text: event.text,
      confidence: event.confidence, lowConfidenceWords: event.lowConfidenceWords || 0 }];
  }
  return [];
}

function cueKey(cue) {
  return `${Number(cue.start).toFixed(3)}|${Number(cue.end).toFixed(3)}`;
}

function mergeLiveCues(existing, incoming) {
  const byTime = new Map((existing || []).map((cue) => [cueKey(cue), cue]));
  (incoming || []).forEach((cue) => {
    const old = byTime.get(cueKey(cue));
    byTime.set(cueKey(cue), old
      ? { ...old, ...cue,
          confidence: cue.confidence === undefined ? old.confidence : cue.confidence,
          lowConfidenceWords: cue.lowConfidenceWords === undefined
            ? old.lowConfidenceWords : cue.lowConfidenceWords }
      : cue);
  });
  return [...byTime.values()].sort((a, b) => a.start - b.start);
}

function applyCueQuality(cues, qualityCues) {
  if (!qualityCues || !qualityCues.length) return cues;
  return cues.map((cue) => {
    let best = null, overlap = 0;
    for (const q of qualityCues) {
      if (q.start >= cue.end) break;
      const ov = Math.min(cue.end, q.end) - Math.max(cue.start, q.start);
      if (ov > overlap) { overlap = ov; best = q; }
    }
    return best && overlap > 0
      ? { ...cue, confidence: best.confidence, lowConfidenceWords: best.lowConfidenceWords || 0 }
      : cue;
  });
}

function progressiveRanges(duration, current, windowSec = 600) {
  if (!isFinite(duration) || duration <= 0) return [{ start: '', end: '' }];
  const start = Math.max(0, Math.min(duration, (Number(current) || 0) - 2));
  const firstEnd = Math.min(duration, start + windowSec);
  const ranges = [{ start, end: firstEnd }];
  if (firstEnd < duration - 0.5) ranges.push({ start: firstEnd, end: duration });
  if (start > 0.5) ranges.push({ start: 0, end: start });
  return ranges;
}

async function startProgressiveChunk(job) {
  if (!job || job !== player.job || job.mediaKey !== player.mediaKey) return;
  const range = job.ranges[job.rangeIndex];
  const opts = { ...job.baseOpts, clipStart: range.start, clipEnd: range.end,
    formats: 'srt', resume: false, skipHistory: job.rangeIndex < job.ranges.length - 1 };
  job.awaitingExit = false;
  job.running = true;
  const n = job.rangeIndex + 1;
  $('playerJobText').textContent = `Öncelikli altyazı bölümü ${n}/${job.ranges.length} hazırlanıyor…`;
  const result = await startTranscribeSafe(opts);
  if (job !== player.job || job.mediaKey !== player.mediaKey) return;
  if (!result || !result.ok) {
    job.running = false;
    state.running = false;
    $('startBtn').classList.remove('hidden');
    $('cancelBtn').classList.add('hidden');
    $('playerJobText').textContent = `Altyazı başlatılamadı: ${(result && result.error) || 'bilinmeyen hata'}`;
    logLine($('playerJobText').textContent, 'error');
  }
}

async function finishProgressiveJob(job) {
  if (!job || job !== player.job || job.mediaKey !== player.mediaKey) return;
  const source = mergeLiveCues([], job.liveSource || []);
  const translated = mergeLiveCues([], [...(job.liveTranslation || new Map()).values()]);
  player.cueQualitySource = source.slice();
  if (job.sourceFile && source.length) await window.api.writeSubtitle(job.sourceFile, cuesToSrt(source));
  if (job !== player.job || job.mediaKey !== player.mediaKey) return;
  if (job.translationFile && translated.length) {
    await window.api.writeSubtitle(job.translationFile, cuesToSrt(translated));
    if (job !== player.job || job.mediaKey !== player.mediaKey) return;
  }
  if (job.sourceFile) {
    addSubtitleOption(job.sourceFile, 'Whisper · aşamalı');
    $('playerSubSelect').value = job.sourceFile;
    await loadSubtitle(job.sourceFile);
    if (job !== player.job || job.mediaKey !== player.mediaKey) return;
  } else {
    player.cues = source;
    renderCueList();
    renderCue();
  }
  if (job.translationFile) {
    addSubtitleOption(job.translationFile, 'Çeviri · aşamalı');
    $('playerSubSelect2').value = job.translationFile;
    await loadSubtitle(job.translationFile, true);
    if (job !== player.job || job.mediaKey !== player.mediaKey) return;
  }
  job.running = false;
  state.running = false;
  state.forceTranslate = false;
  updateMakeTransState();
  updatePlayerAutoSyncState();
  $('startBtn').classList.remove('hidden');
  $('cancelBtn').classList.add('hidden');
  $('playerJobFill').style.width = '100%';
  $('playerJobText').textContent = `Altyazı hazır · ${source.length} blok`;
  setTimeout(() => $('playerJobBar').classList.add('hidden'), 4000);
  logLine(`Öncelikli altyazı üretimi tamamlandı: ${source.length} blok`, 'success');
  refreshHistory();
}

async function handleProgressiveTerminal(event, job) {
  if (event.type === 'done') {
    const files = (event.files || []).filter((f) => /\.srt$/i.test(f));
    const langSuffixed = (f) => /\.[a-z]{2,3}\.srt$/i.test(f);
    const src = files.find((f) => !langSuffixed(f) && !/\.dual\./i.test(f)) || files[0];
    const tr = files.find((f) => f !== src && langSuffixed(f) && !/\.dual\./i.test(f));
    if (src) job.sourceFile = src;
    if (tr) job.translationFile = tr;
    job.awaitingExit = true;
    job.running = true;
    return true;
  }
  if (event.type === 'exit' && job.awaitingExit) {
    // Hata olayı süreç kapanmadan önce gelebilir. Hata sonrası gelen exit'i
    // ana iş akışına sızdırma; aksi halde genel arayüz aynı işi ikinci kez
    // tamamlandı sanabilir.
    if (job.failed) {
      job.awaitingExit = false;
      return true;
    }
    if (event.code !== 0) {
      job.running = false; state.running = false;
      $('startBtn').classList.remove('hidden');
      $('cancelBtn').classList.add('hidden');
      $('playerJobText').textContent = 'Altyazı üretimi beklenmedik biçimde durdu.';
      return true;
    }
    job.awaitingExit = false;
    if (job.rangeIndex + 1 < job.ranges.length) {
      job.rangeIndex++;
      setTimeout(() => startProgressiveChunk(job), 80);
    } else {
      setTimeout(() => finishProgressiveJob(job), 80);
    }
    return true;
  }
  if (event.type === 'error') {
    job.failed = true;
    job.awaitingExit = true;
    job.running = false; state.running = false;
    $('startBtn').classList.remove('hidden');
    $('cancelBtn').classList.add('hidden');
    $('playerJobText').textContent = `Altyazı oluşturulamadı: ${friendlyYoutubeError(event.message || '').slice(0, 240)}`;
    logLine($('playerJobText').textContent, 'error');
    return true;
  }
  return false;
}

function playerJobEvent(event) {
  const job = player.job;
  if (!job || (!job.running && !job.awaitingExit)) return false;
  const bar = $('playerJobBar');
  const txt = $('playerJobText');
  const fill = $('playerJobFill');
  if (!bar) return false;

  // Iptal edilen oynatici isi kapanirken gec bir error/done uretebilir. Bunlar
  // ana ekranin transkripsiyon akimina sizmamali ve basarisizlik bildirimi
  // gostermemeli.
  if (job.cancelled) {
    if (event.type === 'exit') {
      job.awaitingExit = false;
      state.cancelled = false;
      if (player.job === job) player.job = null;
    }
    return event.type !== 'log';
  }

  if (job.kind === 'progressive' && ['done', 'exit', 'error'].includes(event.type)) {
    handleProgressiveTerminal(event, job);
    return true;
  }

  if (event.type === 'exit' && job.awaitingExit) {
    job.awaitingExit = false;
    state.aiJob = false;
    if (player.job === job) player.job = null;
    return true;
  }

  if ((event.type === 'chat' || event.type === 'explain') && job.mediaKey !== player.mediaKey) {
    job.running = false;
    job.awaitingExit = true;
    state.running = false;
    state.aiJob = false;
    bar.classList.add('hidden');
    logLine('AI yanıtı önceki videoya aitti; mevcut sohbete eklenmedi.', 'warn');
    return true;
  }

  const finish = (message, level) => {
    job.running = false;
    job.awaitingExit = true;
    state.running = false;         // oynaticidan baslatilan is bitti
    state.forceTranslate = false;
    $('startBtn').classList.remove('hidden');
    $('cancelBtn').classList.add('hidden');
    txt.textContent = message;
    updateMakeTransState();
    updatePlayerAutoSyncState();
    setTimeout(() => bar.classList.add('hidden'), 4000);
    if (level) logLine(message, level);
  };

  if (event.type === 'chat') {
    const bubble = job.bubble;
    if (bubble) {
      bubble.classList.remove('is-loading');
      renderAiText(bubble, event.text);
      $('aiChatLog').scrollTop = $('aiChatLog').scrollHeight;
    }
    player.chatHistory = player.chatHistory || [];
    player.chatHistory.push({ role: 'assistant', content: event.text });
    job.running = false;
    job.awaitingExit = true;
    state.running = false;
    state.aiJob = false;
    bar.classList.add('hidden');
    return true;
  }
  if (event.type === 'explain') {
    player.explainCache = player.explainCache || {};
    if (job.explainKey) player.explainCache[job.explainKey] = event.text;
    showAiAnswer(job.explainTitle || 'AI', event.text);
    job.running = false;
    job.awaitingExit = true;
    state.running = false;
    state.aiJob = false;
    bar.classList.add('hidden');
    return true;
  }
  if (event.type === 'status' && event.text) txt.textContent = event.text;
  if (event.type === 'segment') {
    job.liveSource = mergeLiveCues(job.liveSource || [], liveSegments(event));
    if (job.mediaKey === player.mediaKey && job.kind !== 'translate') {
      player.cues = job.liveSource.slice().sort((a, b) => a.start - b.start);
      player.activeIdx = -1;
      scheduleLiveCueRender();
    }
  } else if (event.type === 'preview_refresh') {
    const fresh = liveSegments(event);
    if (fresh.length) job.liveSource = mergeLiveCues(job.liveSource || [], fresh);
    if (fresh.length && job.mediaKey === player.mediaKey && job.kind !== 'translate') {
      player.cues = (job.liveSource || []).slice().sort((a, b) => a.start - b.start);
      player.activeIdx = -1;
      scheduleLiveCueRender();
    }
  } else if (event.type === 'translation_chunk') {
    job.liveTranslation = job.liveTranslation || new Map();
    liveSegments(event).forEach((s) => job.liveTranslation.set(
      job.kind === 'progressive' ? cueKey(s) : s.index, s));
    if (job.mediaKey === player.mediaKey) {
      player.cues2 = [...job.liveTranslation.values()].sort((a, b) => a.start - b.start);
      player.activeIdx2 = -1;
      scheduleLiveCueRender();
      scheduleBrowserOverlaySync();
    }
  } else if (event.type === 'translation_refresh') {
    const fresh = liveSegments(event);
    if (fresh.length && job.mediaKey === player.mediaKey) {
      if (job.kind === 'progressive') {
        fresh.forEach((s) => job.liveTranslation.set(cueKey(s), s));
        player.cues2 = [...job.liveTranslation.values()].sort((a, b) => a.start - b.start);
      } else {
        player.cues2 = fresh.slice().sort((a, b) => a.start - b.start);
      }
      player.activeIdx2 = -1;
      scheduleLiveCueRender();
      scheduleBrowserOverlaySync();
    }
  }
  else if (event.type === 'progress' && typeof event.percent === 'number') {
    const overall = job.kind === 'progressive'
      ? ((job.rangeIndex + event.percent / 100) / job.ranges.length) * 100
      : event.percent;
    fill.style.width = `${Math.min(100, overall)}%`;
    txt.textContent = job.kind === 'progressive'
      ? `İzleme konumundan hazırlanıyor · ${job.rangeIndex + 1}/${job.ranges.length} · %${event.percent.toFixed(0)}`
      : `Altyazı oluşturuluyor · %${event.percent.toFixed(0)}`;
  } else if (event.type === 'done' && (job.kind === 'explain' || job.kind === 'chat')) {
    job.running = false;
    state.running = false;
    bar.classList.add('hidden');
  } else if (event.type === 'done') {
    fill.style.width = '100%';
    const files = (event.files || []).filter((f) => /\.(srt|vtt)$/i.test(f));
    if (job.mediaKey !== player.mediaKey) {
      finish('Altyazı hazır ama başka videoya geçildi — yüklenmedi.', 'warn');
      refreshHistory();
      return true;
    }
    // "Ceviri olustur" isinde kaynak altyazi ZATEN yuklu; yalnizca ceviriyi
    // ikinci altyaziya koy. Aksi halde .dual.srt yanlislikla ana altyazi olurdu.
    const isTranslateJob = job.kind === 'translate';
    const isSyncJob = job.kind === 'sync';
    const langSuffixed = (f) => /\.[a-z]{2}\.(srt|vtt)$/i.test(f);
    const src = isTranslateJob
      ? null
      : (isSyncJob ? files.find((f) => /\.synced\.srt$/i.test(f))
        : (files.find((f) => !langSuffixed(f) && !/\.dual\./i.test(f)) || files[0]));
    const tr = files.find((f) => f !== src && langSuffixed(f) && !/\.dual\./i.test(f));
    if (src) {
      player.cueQualitySource = (job.liveSource || []).slice();
      addSubtitleOption(src);
      $('playerSubSelect').value = src;
      loadSubtitle(src);
    }
    if (tr) {
      addSubtitleOption(tr);
      $('playerSubSelect2').value = tr;
      loadSubtitle(tr, true);
    }
    if (isTranslateJob) {
      finish(tr ? 'Çeviri hazır ve ikinci altyazı olarak yüklendi.'
                : 'Çeviri bitti ama dosya bulunamadı.', tr ? 'success' : 'warn');
      if (job.browserTrackId) {
        const latestTrack = player.browserTracks.find((track) => track.id === job.browserTrackId);
        if (latestTrack && Number(latestTrack.cueCount || 0) > Number(job.browserSourceCueCount || 0)) {
          const added = Number(latestTrack.cueCount || 0) - Number(job.browserSourceCueCount || 0);
          setBrowserSignal(`Çeviri sırasında ${added} yeni altyazı satırı bulundu. Çeviriyi güncelleyebilirsiniz.`, true);
          logLine(`Web altyazısı çeviri sırasında ${added} satır büyüdü; kaynak güncellendi.`, 'warn');
        }
        if (latestTrack) scheduleActiveBrowserTrackRefresh(latestTrack);
      }
    } else if (isSyncJob) {
      finish(src ? 'Altyazı sese göre senkronlandı ve yüklendi.'
                 : 'Senkron bitti ama çıktı bulunamadı.', src ? 'success' : 'warn');
    } else {
      finish(src ? 'Altyazı hazır ve yüklendi.' : 'İş bitti ama altyazı dosyası bulunamadı.',
             src ? 'success' : 'warn');
    }
    refreshHistory();
  } else if (event.type === 'error' && job.kind === 'chat') {
    if (job.bubble) {
      job.bubble.classList.remove('is-loading');
      job.bubble.classList.add('ai-msg-err');
      job.bubble.textContent = (event.message || 'Cevap alınamadı.').slice(0, 300);
    }
    job.running = false;
    job.awaitingExit = true;
    state.running = false;
    state.aiJob = false;
    bar.classList.add('hidden');
  } else if (event.type === 'error') {
    finish(`Altyazı oluşturulamadı: ${friendlyYoutubeError(event.message || '').slice(0, 240)}`, 'error');
    refreshHistory();
  }
  // Oynatici isi icin status/progress/segment/terminal olaylari ana ekranin
  // asamalarini, onizlemesini ve sonuc modalini degistirmemeli. Yalniz log
  // satirlarini ortak gunlukte gostermeye devam et.
  return event.type !== 'log';
}

window.api.onEvent((event) => {
  const playerConsumed = playerJobEvent(event);
  if (playerConsumed) return;
  // AI isleri (sohbet / acikla) yalnizca oynatici tarafinda islenir. Backend
  // bunlarda da 'done' basiyor; asagidaki switch onu ALTYAZI isi sanip
  // "Altyazi hazir!" modalini acar, asamalari yesile boyar ve bildirim
  // gonderirdi. Cevap zaten playerJobEvent icinde balona/panele yazildi.
  if (state.aiJob && (event.type === 'done' || event.type === 'error' || event.type === 'exit')) {
    state.aiJob = false;
    state.forceTranslate = false;
    return;
  }
  if (event.type === 'done' || event.type === 'error' || event.type === 'exit') {
    // Tek-tik bayragi ISE OZELDIR: bir sonraki ise sizmasin.
    state.forceTranslate = false;
    if (event.type !== 'exit') refreshHistory();
  }
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

    case 'llm_progress': {
      setProgress(event.percent);
      // Ayni kanal hem LLM duzeltmesi hem ceviri icin kullaniliyor (stage ayirir)
      const _lbl = event.stage === 'translate' ? 'Çevriliyor' : 'LLM düzeltiyor';
      $('progressText').textContent = `${_lbl} ${event.percent.toFixed(1)}% (${event.done}/${event.total})`;
      if (event.failed) $('progressTime').textContent = `${event.failed} blokta hata`;
      break;
    }

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
          // Uyarıları sakla: kuyruk bitince hangi dosyaların elle kontrol gerektirdiğini özetle
          item.warnings = Array.isArray(event.warnings) ? event.warnings : [];
          renderQueue();
        }
        // Python stdout'taki done, işletim sistemi süreci kapanmadan gelebilir.
        // Sıradaki işi yalnız exit olayında başlat; activeJob o anda temizlenmiştir.
        setStatus('Tamamlandı · süreç kapanıyor');
      } else {
        // Tek seferlik mod — modal göster
        showResultModal(event);
        finishRun(true);
        notifyDone('Altyazı hazır', `${event.segments} segment · ${(event.files || []).length} dosya`);
      }
      break;
    }

    case 'error':
      // İptal ile yarışan geç hata olayını kullanıcıya gerçek hata gibi gösterme;
      // süreç kapanışında exit dalı iptal durumunu toparlar.
      if (state.cancelled) break;
      logLine('Hata: ' + (event.message || 'Bilinmeyen hata'), 'error');
      if (event.traceback) logLine(event.traceback, 'error');
      setStatus('Hata', 'error');

      if (state.queueRunning && state.currentQueueId !== null) {
        const item = state.queue.find(x => x.id === state.currentQueueId);
        if (item) {
          item.status = 'error';
          renderQueue();
        }
        // error olayından sonra da süreç kapanışını bekle (done ile aynı yarış).
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
      if (state.queueRunning && state.currentQueueId !== null) {
        const item = state.queue.find(x => x.id === state.currentQueueId);
        if (event.code !== 0 && item && item.status === 'running') item.status = 'error';
        if (event.code !== 0) {
          logLine(`İşlem çıkış kodu ${event.code} ile bitti.`, 'error');
          if (event.stderr) logLine(event.stderr, 'error');
          setStatus('Hata', 'error');
        } else {
          setStatus('Hazır');
        }
        renderQueue();
        state.currentQueueId = null;
        state.running = false;
        $('startBtn').classList.remove('hidden');
        $('cancelBtn').classList.add('hidden');
        setTimeout(processNextQueueItem, 250);
        break;
      }
      if (event.code !== 0 && state.running) {
        logLine(`İşlem çıkış kodu ${event.code} ile bitti.`, 'error');
        if (event.stderr) logLine(event.stderr, 'error');
        setStatus('Hata', 'error');

        finishRun(false);
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
  // Oynatıcı açıkken kısayollar oynatıcıya aittir (Esc işi iptal etmesin)
  const pl = $('playerLayer');
  if (pl && !pl.classList.contains('hidden')) return;
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
  if (r && r.ok) logLine(`Uygulama yedeği oluşturuldu: ${r.path}`, 'success');
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
  if (r.restored) {
    await Promise.all([refreshWatchLibrary(), loadBrowserPlaces()]);
    logLine(`Yedek geri yüklendi: ${r.restored.watchLibraryCount} izleme kaydı.`, 'success');
  } else {
    logLine('Eski ayar dosyası içe aktarıldı ve uygulandı.', 'success');
  }
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
  const r = await startTranscribeSafe(opts);
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
  opts.syncFixFramerate = $('syncFixFramerate') ? $('syncFixFramerate').checked : true;
  opts.syncPiecewise = $('syncPiecewise') ? $('syncPiecewise').checked : true;
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
  const r = await startTranscribeSafe(opts);
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


// ============================================================================
// PLAYER_START — Uygulama içi oynatıcı
// Videoyu (yerel dosya veya indirilen YouTube videosu) kendi altyazılarınla izler.
// Altyazı <track> yerine ÜSTTE ÇİZİLİR: file:// kaynaklı track'ler Electron'da
// engellenebiliyor ve stil kontrolü olmuyor; overlay tam ekranda da çalışıyor.
// ============================================================================
const player = {
  cues: [],          // [{start, end, text}]
  cues2: [],         // karşılaştırma altyazısı (ör. kaynak dil)
  activeIdx: -1,
  activeIdx2: -1,
  offset: 0,         // altyazı gecikmesi (sn)
  subtitles: [],     // seçilebilir altyazı dosyaları [{path, label}]
  cueQualitySource: [], // canli Whisper guveni; SRT yeniden okununca zamanla eslestirilir
  subPath: '',       // duzenleme kaydederken yazilacak dosya
  subFormat: 'srt',  // 'srt' | 'vtt' | 'ass' - kaydederken AYNI bicim korunur
  subRaw: '',        // dosyanin ham metni (ASS'te cerrahi duzenleme icin)
  subOrigins: {},    // { yol: 'YouTube' | 'Whisper' | 'Dosya' } - panelde gosterilir
  editing: false,
  autoPause: false,
  pausedAt: -1,
  ytInfo: null,
  chapters: [],
  hls: null,
  hlsMediaRecover: 0, // medya kurtarma denemeleri (kaynak degisince sifirlanir)
  hlsNetRecover: 0,   // ağ adresi yenileme denemeleri (kaynak degisince sifirlanir)
  hlsRecoveryTimer: null,
  isLive: false,
  downloading: false,
  mediaKey: '',      // konum hatirlamada KARARLI anahtar (bkz. mediaKeyFor)
  generation: 0,     // her kaynak degisiminde artar - eski asenkron sonuclari elemek icin
  originalUrl: '',   // kullanicinin girdigi kalici YouTube adresi (gecici HLS DEGIL)
  positions: {},     // { anahtar: {t, d, title, at} } - ayarlarda saklanir
  subsHidden: false,
  lastSubtitleMode: 'both', // V ile geri acarken son kaynak/ceviri secimini koru
  subStyle: null,        // gorunum ayarlari (renk/arka plan/kontur/yazi tipi)
  abA: null,             // A-B dongusu baslangici
  abB: null,             // A-B dongusu bitisi
  osdTimer: null,
  ambientOn: true,
  ambientTimer: null,
  holdSpeed: true,
  suppressClick: false,
  localPath: '',         // acik olan yerel video yolu
  subBottom: null,       // altyazinin dikey konumu (%, alttan) - kullanici surukler
  sub2Top: null,         // karsilastirma altyazisinin konumu (%, ustten)
  autoFollow: true,      // aktif satiri kendiliginden kaydir
  userScrolled: false,   // kullanici elle kaydirdi -> takip gecici durur
  savedCues: [],         // bu video icin kaydedilen cümle imzalari
  savedOnly: false,      // transcript filtresi: yalnizca kaydedilenler
  qualityOnly: false,    // transcript filtresi: yalnizca dusuk guvenli satirlar
  savedWords: [],        // kelime koleksiyonu: kelime + cümle baglami
  selectedWord: null,     // { word, cueIndex, source }
  viewMode: 'reading',
  job: null,             // oynaticidan baslatilan transkripsiyon isi
  audioLocks: {},        // video anahtari -> { lang, label }; oynatma/Whisper ayni ses
  timeline: { open: false, waveform: [], waveformDuration: 0, selected: -1,
    undo: [], drag: null, loading: false, drawPending: false },
  idleTimer: null,
  resumeOffered: false,
  playlist: [],       // yerel klasör/çoklu seçim sırası
  playlistIndex: -1,
  autoNext: true,
  watchSession: null,
  watchManualCompletedKey: '',
  watchManualCompleted: null,
  watchRemovedKey: '',
  watchSaveTick: 0,
  pendingLibrarySeek: null,
  pendingAutoOpen: null,
  openIntent: 0,
  probeSeq: 0,
  probeRequestSeq: 0,
  downloadIntent: 0,
  playerLibrarySearchSeq: 0,
  playbackAudioLang: '',
  workspaceMode: 'player', // 'player' | 'browser'
  browserTracks: [],
  browserPageUrl: '',
  browserPageTitle: '',
  browserTime: 0,
  browserDuration: 0,
  browserPaused: true,
  browserRate: 1,
  browserVolume: 1,
  browserMuted: false,
  browserProfileKey: '',
  browserPositionTick: 0,
  browserBoundsFrame: 0,
  browserBoundsObserver: null,
  browserOverlayTimer: null,
  browserTrackRefreshTimers: {},
  browserLoadedTrackId: '',
  browserLoadedTrackId2: '',
  browserDiagnostics: null,
  browserCaptureEnabled: true,
  browserPlaces: { history: [], bookmarks: [] },
  browserPlaceTab: 'bookmarks',
  browserPlacesSeq: 0,
  browserPrepareSeq: 0,
  browserTranslatePreparing: false,
  browserSignalVisible: true,
  browserChromeCollapsed: false,
};

try { player.audioLocks = JSON.parse(localStorage.getItem('playerAudioLocks') || '{}') || {}; }
catch (_) { player.audioLocks = {}; }

try {
  const savedWorkspace = localStorage.getItem('playerWorkspaceMode');
  if (savedWorkspace === 'browser' || savedWorkspace === 'player') player.workspaceMode = savedWorkspace;
  player.browserSignalVisible = localStorage.getItem('playerBrowserSignalVisible') !== 'false';
  player.browserChromeCollapsed = localStorage.getItem('playerBrowserChromeCollapsed') === 'true';
  player.browserCaptureEnabled = localStorage.getItem('playerBrowserCaptureEnabled') !== 'false';
} catch (_) {}

function browserSlotBounds() {
  const slot = $('browserViewSlot');
  if (!slot) return null;
  const rect = slot.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function scheduleBrowserBounds() {
  if (player.workspaceMode !== 'browser' || $('playerLayer')?.classList.contains('hidden')) return;
  cancelAnimationFrame(player.browserBoundsFrame);
  player.browserBoundsFrame = requestAnimationFrame(() => {
    player.browserBoundsFrame = 0;
    const bounds = browserSlotBounds();
    if (bounds && window.api.setBrowserBounds) window.api.setBrowserBounds(bounds).catch(() => {});
  });
}

function bindBrowserBoundsObserver() {
  const slot = $('browserViewSlot');
  if (!slot || typeof ResizeObserver !== 'function') return;
  if (player.browserBoundsObserver) player.browserBoundsObserver.disconnect();
  player.browserBoundsObserver = new ResizeObserver(() => scheduleBrowserBounds());
  player.browserBoundsObserver.observe(slot);
}

function setBrowserSignal(text, detected = false) {
  if ($('browserSignalText')) $('browserSignalText').textContent = text;
  $('browserSignal')?.classList.toggle('detected', detected);
}

function setBrowserSignalVisible(visible, persist = true) {
  player.browserSignalVisible = !!visible;
  $('browserWorkspace')?.classList.toggle('signal-collapsed', !player.browserSignalVisible);
  const button = $('browserSignalToggle');
  if (button) {
    button.classList.toggle('active', player.browserSignalVisible);
    button.setAttribute('aria-pressed', player.browserSignalVisible ? 'true' : 'false');
    button.title = player.browserSignalVisible ? 'Altyazı sinyalini gizle' : 'Altyazı sinyalini göster';
    button.setAttribute('aria-label', button.title);
  }
  if (!player.browserSignalVisible) {
    $('browserDiagnosticsPanel')?.classList.add('hidden');
    $('browserDiagnosticsToggle')?.setAttribute('aria-expanded', 'false');
  }
  if (persist) {
    try { localStorage.setItem('playerBrowserSignalVisible', player.browserSignalVisible ? 'true' : 'false'); } catch (_) {}
  }
  scheduleBrowserBounds();
}

function setBrowserCaptureEnabled(enabled, persist = true) {
  player.browserCaptureEnabled = !!enabled;
  const button = $('browserCaptureToggle');
  if (button) {
    button.textContent = player.browserCaptureEnabled ? 'Yakalama açık' : 'Yakalama kapalı';
    button.setAttribute('aria-pressed', player.browserCaptureEnabled ? 'true' : 'false');
    button.title = player.browserCaptureEnabled ? 'Altyazı yakalamayı durdur' : 'Altyazı yakalamayı başlat';
    button.setAttribute('aria-label', button.title);
  }
  if (player.workspaceMode === 'browser' && $('playerMeta')) {
    $('playerMeta').textContent = player.browserCaptureEnabled
      ? 'Web videosu · altyazı algılama açık'
      : 'Web videosu · altyazı yakalama kapalı';
  }
  if (persist) {
    try { localStorage.setItem('playerBrowserCaptureEnabled', player.browserCaptureEnabled ? 'true' : 'false'); } catch (_) {}
  }
}

function setBrowserChromeCollapsed(collapsed, persist = true) {
  player.browserChromeCollapsed = !!collapsed;
  const active = player.workspaceMode === 'browser' && player.browserChromeCollapsed;
  $('playerLayer')?.classList.toggle('browser-chrome-collapsed', active);
  const button = $('browserChromeToggle');
  if (button) {
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.title = active ? 'Üst araçları göster' : 'Sade izleme görünümüne geç';
    button.setAttribute('aria-label', button.title);
  }
  if (active) {
    setBrowserPlacesOpen(false);
    $('browserDiagnosticsPanel')?.classList.add('hidden');
    $('browserDiagnosticsToggle')?.setAttribute('aria-expanded', 'false');
  }
  if (persist) {
    try { localStorage.setItem('playerBrowserChromeCollapsed', player.browserChromeCollapsed ? 'true' : 'false'); } catch (_) {}
  }
  scheduleBrowserBounds();
}

function browserPlaceTitle(item) {
  if (item && item.title) return item.title;
  try { return new URL(item && item.url || '').hostname; } catch (_) { return item && item.url || 'Site'; }
}

function browserPlaceKey(raw) {
  try {
    const url = new URL(String(raw || ''));
    for (const key of [...url.searchParams.keys()]) {
      if (/^(token|access[_-]?token|id[_-]?token|jwt|sig|signature|auth|authorization|key|expires?|exp|credential|session|sid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.href;
  } catch (_) { return ''; }
}

function browserPlaceList() {
  const places = player.browserPlaces || { history: [], bookmarks: [] };
  return Array.isArray(places[player.browserPlaceTab]) ? places[player.browserPlaceTab] : [];
}

function updateBrowserBookmarkButton() {
  const button = $('browserBookmarkToggle');
  if (!button) return;
  const url = player.browserPageUrl || '';
  const key = browserPlaceKey(url);
  const active = !!(player.browserPlaces.bookmarks || []).some((item) => browserPlaceKey(item.url) === key);
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.title = active ? 'Bu siteyi yer imlerinden kaldır' : 'Bu siteyi yer imlerine ekle';
  button.setAttribute('aria-label', button.title);
}

function renderBrowserPlaces() {
  const list = $('browserPlacesList');
  const datalist = $('browserAddressSuggestions');
  const places = player.browserPlaces || { history: [], bookmarks: [] };
  if (datalist) {
    datalist.replaceChildren();
    const seen = new Set();
    [...(places.bookmarks || []), ...(places.history || [])].forEach((item) => {
      if (!item || !item.url || seen.has(item.url)) return;
      seen.add(item.url);
      const option = document.createElement('option');
      option.value = item.url;
      option.label = browserPlaceTitle(item);
      datalist.appendChild(option);
    });
  }
  updateBrowserBookmarkButton();
  document.querySelectorAll('[data-place-tab]').forEach((tab) => {
    const active = tab.dataset.placeTab === player.browserPlaceTab;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $('browserPlacesClear')?.classList.toggle('hidden', player.browserPlaceTab !== 'history');
  if (!list) return;
  list.replaceChildren();
  const entries = browserPlaceList();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'browser-place-empty';
    empty.textContent = player.browserPlaceTab === 'bookmarks'
      ? 'Henüz yer imi eklenmedi.' : 'Henüz ziyaret edilen site yok.';
    list.appendChild(empty);
    return;
  }
  entries.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'browser-place-row';
    const open = document.createElement('button');
    open.className = 'browser-place-open';
    open.type = 'button';
    open.dataset.placeOpen = item.url;
    const title = document.createElement('span');
    title.className = 'browser-place-title';
    title.textContent = browserPlaceTitle(item);
    const url = document.createElement('span');
    url.className = 'browser-place-url';
    url.textContent = item.url;
    open.append(title, url);
    const remove = document.createElement('button');
    remove.className = 'btn-icon browser-place-remove';
    remove.type = 'button';
    remove.dataset.placeRemove = item.url;
    remove.title = player.browserPlaceTab === 'history' ? 'Geçmişten kaldır' : 'Yer iminden kaldır';
    remove.setAttribute('aria-label', remove.title);
    remove.textContent = '×';
    row.append(open, remove);
    list.appendChild(row);
  });
}

async function loadBrowserPlaces() {
  if (!window.api.listBrowserPlaces) return;
  const seq = ++player.browserPlacesSeq;
  const result = await window.api.listBrowserPlaces().catch(() => null);
  if (seq === player.browserPlacesSeq && result && result.ok && result.places) {
    player.browserPlaces = result.places;
    renderBrowserPlaces();
  }
}

function setBrowserPlacesOpen(open) {
  const panel = $('browserPlacesPanel');
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  $('browserPlacesToggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    loadBrowserPlaces(); renderBrowserPlaces();
  }
}

function renderBrowserDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return;
  player.browserDiagnostics = diagnostics;
  const adapter = diagnostics.adapter || {};
  if ($('browserDiagnosticsService')) $('browserDiagnosticsService').textContent = adapter.label || 'Genel web videosu';
  if ($('browserDiagnosticsHelp')) $('browserDiagnosticsHelp').textContent = adapter.help
    || 'Videoyu başlatın ve varsa sitenin kendi altyazısını açın.';
  const counts = diagnostics.counts || {};
  const attempts = Number(counts.cdp || 0) + Number(counts.page || 0) + Number(counts.textTrack || 0);
  if ($('browserDiagnosticsSummary')) $('browserDiagnosticsSummary').textContent = attempts
    ? `${Number(counts.parsed || 0)} işlendi · ${Number(counts.rejected || 0)} elendi · ${Number(counts.errors || 0)} hata`
    : 'Henüz ağ izi yok';
  const recent = $('browserDiagnosticsRecent');
  if (!recent) return;
  recent.replaceChildren();
  const entries = Array.isArray(diagnostics.recent) ? diagnostics.recent.slice(0, 8) : [];
  if (!entries.length) {
    recent.textContent = 'Yakalanan altyazı adayları burada, hassas bağlantı parametreleri gizlenerek gösterilir.';
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = `browser-diagnostic-row is-${entry.outcome === 'parsed' ? 'parsed' : entry.outcome === 'error' ? 'error' : 'neutral'}`;
    const strategy = document.createElement('span');
    strategy.textContent = ({ cdp: 'AĞ', page: 'SAYFA', textTrack: 'İZ', manifest: 'AKIŞ' })[entry.strategy]
      || String(entry.strategy || '').toUpperCase();
    const result = document.createElement('span');
    result.textContent = entry.outcome === 'parsed' ? 'işlendi' : entry.outcome === 'error' ? 'hata' : 'elendi';
    const detail = document.createElement('span');
    detail.className = 'browser-diagnostic-url';
    detail.textContent = [entry.detail, entry.url].filter(Boolean).join(' · ') || entry.mime || 'altyazı adayı';
    detail.title = detail.textContent;
    row.append(strategy, result, detail);
    recent.appendChild(row);
  }
}

function clearBrowserTracks(message) {
  player.browserPrepareSeq += 1;
  player.browserTranslatePreparing = false;
  Object.values(player.browserTrackRefreshTimers).forEach((timer) => clearTimeout(timer));
  player.browserTrackRefreshTimers = {};
  player.browserLoadedTrackId = '';
  player.browserLoadedTrackId2 = '';
  player.browserTracks = [];
  const select = $('browserTrackSelect');
  if (select) select.innerHTML = '';
  const select2 = $('browserTrackSelect2');
  if (select2) select2.innerHTML = '<option value="">İkinci iz yok</option>';
  $('browserTrackActions')?.classList.add('hidden');
  setBrowserSignal(message || 'Sayfadaki video ve altyazı izleri burada algılanır.', false);
}

function renderBrowserTracks(selectedId) {
  const select = $('browserTrackSelect');
  const select2 = $('browserTrackSelect2');
  const actions = $('browserTrackActions');
  if (!select || !select2 || !actions) return;
  const previous = selectedId || select.value;
  const previous2 = select2.value;
  select.innerHTML = '';
  select2.innerHTML = '<option value="">İkinci iz yok</option>';
  player.browserTracks.forEach((track) => {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = `${track.language ? track.language.toUpperCase() + ' · ' : ''}${track.label} · ${track.cueCount} satır`;
    select.appendChild(option);
    select2.appendChild(option.cloneNode(true));
  });
  if (player.browserTracks.some((track) => track.id === previous)) select.value = previous;
  if (player.browserTracks.some((track) => track.id === previous2)) select2.value = previous2;
  actions.classList.toggle('hidden', player.browserTracks.length === 0);
  if (player.browserTracks.length) {
    const chosen = player.browserTracks.find((track) => track.id === select.value) || player.browserTracks[0];
    setBrowserSignal(`Altyazı bulundu${chosen.language ? ` (${chosen.language})` : ''}. Çevrilsin mi?`, true);
  }
}

function browserTrackSelection(secondary = false) {
  const id = $(secondary ? 'browserTrackSelect2' : 'browserTrackSelect')?.value;
  if (secondary && !id) return null;
  return player.browserTracks.find((track) => track.id === id) || (secondary ? null : player.browserTracks[0]) || null;
}

function browserTrackSourceLanguage(track) {
  const raw = normalizeAudioLang(track && track.language);
  const base = raw.split('-')[0];
  return /^[a-z]{2,3}$/.test(base) && !['und', 'mul', 'zxx'].includes(base) ? base : '';
}

async function waitForBrowserTrackStable(trackId, prepareSeq, quietMs = 1200, maxWaitMs = 5000) {
  const started = Date.now();
  let quietSince = started;
  let signature = '';
  let latest = null;
  while (Date.now() - started < maxWaitMs) {
    if (prepareSeq !== player.browserPrepareSeq) return null;
    latest = player.browserTracks.find((track) => track.id === trackId) || null;
    if (!latest) return null;
    const nextSignature = `${latest.cueCount || 0}:${latest.updatedAt || 0}`;
    if (nextSignature !== signature) {
      signature = nextSignature;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return latest;
}

async function useBrowserTrack(translate) {
  let track = browserTrackSelection();
  if (!track) return;
  if (state.running || state.queueRunning || player.browserTranslatePreparing) {
    setBrowserSignal('Başka bir iş çalışıyor; altyazı hazır tutuluyor.', true);
    logLine('Tarayıcı altyazısı bekliyor — çalışan iş bitince yeniden deneyin.', 'warn');
    return;
  }
  if (translate) {
    const prepareSeq = ++player.browserPrepareSeq;
    player.browserTranslatePreparing = true;
    if ($('browserTrackTranslate')) $('browserTrackTranslate').disabled = true;
    setBrowserSignal('Altyazı parçaları tamamlanıyor; son sürüm bekleniyor…', true);
    track = await waitForBrowserTrackStable(track.id, prepareSeq);
    player.browserTranslatePreparing = false;
    if ($('browserTrackTranslate')) $('browserTrackTranslate').disabled = false;
    if (!track || prepareSeq !== player.browserPrepareSeq) return;
  }
  addSubtitleOption(track.path, `Web · ${track.language || track.label}`);
  $('playerSubSelect').value = track.path;
  await loadSubtitle(track.path);
  if (player.subPath !== track.path) return;
  player.browserLoadedTrackId = track.id;
  setPlayerSidebarCollapsed(false);
  const contextLines = Number($('translateContext')?.value || 4);
  const sourceLanguage = browserTrackSourceLanguage(track);
  setBrowserSignal(translate
    ? `Altyazı yüklendi; ${sourceLanguage ? sourceLanguage.toUpperCase() + ' · ' : ''}önceki/sonraki ${contextLines} satırla çevriliyor…`
    : 'Altyazı çalışma alanına yüklendi.', true);
  if (translate) $('makeTransBtn')?.click();
}

async function useBrowserTrackPair() {
  const source = browserTrackSelection(false);
  const second = browserTrackSelection(true);
  if (!source || !second) {
    setBrowserSignal('İki altyazı için ikinci iz seçin.', false);
    return;
  }
  if (source.id === second.id) {
    setBrowserSignal('Birinci ve ikinci altyazı izi farklı olmalı.', false);
    return;
  }
  addSubtitleOption(source.path, `Web · ${source.language || source.label}`);
  addSubtitleOption(second.path, `Web · ${second.language || second.label}`);
  $('playerSubSelect').value = source.path;
  $('playerSubSelect2').value = second.path;
  await loadSubtitle(source.path);
  if (player.subPath !== source.path) return;
  await loadSubtitle(second.path, true);
  if (player.sub2Path !== second.path) return;
  player.browserLoadedTrackId = source.id;
  player.browserLoadedTrackId2 = second.id;
  setPlayerSidebarCollapsed(false);
  setSubtitleMode('both');
  setBrowserSignal('Kaynak ve ikinci altyazı birlikte yüklendi.', true);
}

async function loadManualBrowserSubtitle() {
  const path = await window.api.selectFile('subtitle').catch(() => null);
  if (!path) return;
  addSubtitleOption(path, `Dosya · ${String(path).split(/[\\/]/).pop()}`);
  $('playerSubSelect').value = path;
  await loadSubtitle(path);
  if (player.subPath !== path) return;
  player.browserLoadedTrackId = '';
  setPlayerSidebarCollapsed(false);
  setBrowserSignal('Dosyadaki altyazı web videosunun üzerine yüklendi.', true);
}

async function exportSelectedBrowserTrack() {
  const track = browserTrackSelection(false);
  let cues = [];
  let label = player.browserPageTitle || 'web-altyazi';
  if (track && track.path) {
    const result = await window.api.readSubtitle(track.path).catch(() => null);
    if (result && result.ok) {
      cues = parseSubtitles(result.text);
      label = `${label} ${track.language || track.label || ''}`.trim();
    }
  }
  if (!cues.length) cues = player.cues.slice();
  if (!cues.length) {
    setBrowserSignal('Dışa aktarılacak altyazı yüklenmedi.', false);
    return;
  }
  const format = $('browserExportFormat')?.value === 'vtt' ? 'vtt' : 'srt';
  const result = await window.api.exportBrowserSubtitle({ cues, title: label, format }).catch(() => null);
  if (result && result.ok) setBrowserSignal('Altyazı dosyası dışa aktarıldı.', true);
  else if (result && !result.canceled) setBrowserSignal(`Altyazı kaydedilemedi: ${result.error || 'bilinmeyen hata'}`, false);
}

function abSubtitleExcerpt() {
  if (player.abA === null || player.abB === null || player.abB <= player.abA) return [];
  const start = player.abA - player.offset;
  const end = player.abB - player.offset;
  const mode = browserSubtitleMode();
  const source = player.cues.filter((cue) => cue.end > start && cue.start < end);
  const translation = player.cues2.filter((cue) => cue.end > start && cue.start < end);
  const base = mode === 'translation' ? translation : (source.length ? source : translation);
  return base.map((cue) => {
    let text = cue.text;
    if (mode === 'both' && source.length && translation.length) {
      const middle = (cue.start + cue.end) / 2;
      const translated = translation.filter((item) => item.end > cue.start && item.start < cue.end)
        .map((item) => item.text).join(' / ');
      if (translated && !text.includes(translated)) text = `${text}\n${translated}`;
      else if (!translated) {
        const index = findCueAt(translation, middle, -1);
        if (index >= 0) text = `${text}\n${translation[index].text}`;
      }
    }
    return {
      start: Math.max(0, Math.max(cue.start, start) - start),
      end: Math.max(0.05, Math.min(cue.end, end) - start),
      text,
    };
  });
}

async function copyBrowserAbText() {
  const cues = abSubtitleExcerpt();
  if (!cues.length) {
    setBrowserSignal(player.abA === null || player.abB === null
      ? 'Önce oynatıcıdaki A-B düğmesiyle bir aralık belirleyin.'
      : 'A-B aralığında yüklü altyazı bulunamadı.', false);
    return;
  }
  await window.api.copyText(cuesToSrt(cues));
  setBrowserSignal(`${cues.length} altyazı satırı A-B aralığıyla panoya kopyalandı.`, true);
}

function scheduleActiveBrowserTrackRefresh(track, attempt = 0) {
  const primary = !!track && player.browserLoadedTrackId === track.id && player.subPath === track.path;
  const secondary = !!track && player.browserLoadedTrackId2 === track.id && player.sub2Path === track.path;
  if (!primary && !secondary) return;
  clearTimeout(player.browserTrackRefreshTimers[track.id]);
  player.browserTrackRefreshTimers[track.id] = setTimeout(async () => {
    delete player.browserTrackRefreshTimers[track.id];
    const latest = player.browserTracks.find((item) => item.id === track.id);
    const refreshPrimary = !!latest && player.browserLoadedTrackId === latest.id && player.subPath === latest.path;
    const refreshSecondary = !!latest && player.browserLoadedTrackId2 === latest.id && player.sub2Path === latest.path;
    if (!refreshPrimary && !refreshSecondary) return;
    if (state.running || state.queueRunning) {
      // Uzun film çevirileri iki dakikayı aşabilir. Eski 120 deneme sınırı,
      // iş bitince büyüyen kaynak altyazının bir daha yüklenmemesine yol açıyordu.
      scheduleActiveBrowserTrackRefresh(latest, attempt + 1);
      return;
    }
    if (refreshPrimary) {
      if ($('playerSubSelect')) $('playerSubSelect').value = latest.path;
      await loadSubtitle(latest.path, false, { silent: true, preserveInspector: true });
    }
    if (refreshSecondary) {
      if ($('playerSubSelect2')) $('playerSubSelect2').value = latest.path;
      await loadSubtitle(latest.path, true, { silent: true, preserveInspector: true });
    }
  }, attempt ? 1000 : 180);
}

function browserSubtitleMode() {
  const mode = currentSubtitleMode();
  return ['off', 'source', 'translation', 'both'].includes(mode) ? mode : 'both';
}

function scheduleBrowserOverlaySync() {
  clearTimeout(player.browserOverlayTimer);
  if (player.workspaceMode !== 'browser' || !window.api.setBrowserOverlay) return;
  player.browserOverlayTimer = setTimeout(() => {
    player.browserOverlayTimer = null;
    window.api.setBrowserOverlay({
      source: player.cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text })),
      translation: player.cues2.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text })),
      mode: browserSubtitleMode(),
      offset: player.offset,
    }).catch(() => {});
  }, 120);
}

function updateBrowserNavigation(data) {
  if (!data) return;
  const address = $('browserAddress');
  if (data.url && document.activeElement !== address) address.value = data.url;
  if ($('browserBack')) $('browserBack').disabled = !data.canGoBack;
  if ($('browserForward')) $('browserForward').disabled = !data.canGoForward;
  if ($('browserReload')) $('browserReload').classList.toggle('loading', !!data.loading);
  $('browserSecurityMark')?.classList.toggle('secure', /^https:/i.test(data.url || ''));
  $('browserEmpty')?.classList.toggle('hidden', !!data.url);
  if (data.url && data.url !== player.browserPageUrl) {
    // Anahtar degisimi eski kaydi diske yazar. Yeni URL'yi once state'e
    // koyarsak onceki sayfanin konumu yeni sayfanin basligi altinda kalir.
    setMediaKey(`browser:${browserPlaceKey(data.url) || data.url}`);
    player.browserPageUrl = data.url;
    player.browserPageTitle = data.title || '';
    player.browserTime = 0;
    player.browserDuration = 0;
    player.browserRate = 1;
    player.browserVolume = 1;
    player.browserMuted = false;
    player.browserProfileKey = '';
    player.browserPositionTick = 0;
    clearBrowserTracks(data.loading ? 'Sayfa açılıyor; altyazı izi bekleniyor…' : 'Video başlatıldığında altyazı izi aranacak.');
    try { localStorage.setItem('playerBrowserLastUrl', data.url); } catch (_) {}
    loadBrowserPlaces();
  }
  if (data.title) player.browserPageTitle = data.title;
  updateBrowserBookmarkButton();
  if (player.workspaceMode === 'browser') {
    $('playerTitle').textContent = player.browserPageTitle || 'Tarayıcı';
    $('playerMeta').textContent = data.loading ? 'Sayfa yükleniyor' : 'Web videosu · altyazı algılama açık';
  }
}

function renderBrowserCueAt(time, previousTime, paused = player.browserPaused) {
  const t = Number(time || 0) - player.offset;
  const previous = Number(previousTime);
  if (player.abA !== null && player.abB !== null && Number(time) >= player.abB
      && (!Number.isFinite(previous) || previous < player.abB)) {
    player.browserTime = player.abA;
    window.api.browserCommand('seek', player.abA).catch(() => {});
    return renderBrowserCueAt(player.abA, undefined, paused);
  }
  if (player.cues.length) {
    const index = findCueAt(player.cues, t, player.activeIdx);
    if (index !== player.activeIdx) {
      player.activeIdx = index;
      highlightCueRow();
    }
    const prev = previous - player.offset;
    const dt = Number.isFinite(prev) ? t - prev : -1;
    if (player.autoPause && !paused && dt > 0 && dt < 1) {
      const priorIndex = findCueAt(player.cues, prev, player.activeIdx);
      if (priorIndex >= 0 && prev < player.cues[priorIndex].end && t >= player.cues[priorIndex].end) {
        window.api.browserCommand('pause').catch(() => {});
      }
    }
  }
  if (player.cues2.length) player.activeIdx2 = findCueAt(player.cues2, t, player.activeIdx2);
  updateCueMeta();
  if (!$('aiChat')?.classList.contains('hidden')) aiChatCtxLabel();
}

async function showBrowserWorkspace() {
  const bounds = browserSlotBounds();
  if (!bounds || !window.api.showBrowser) return;
  if (window.api.setBrowserCaptureEnabled) {
    await window.api.setBrowserCaptureEnabled(player.browserCaptureEnabled).catch(() => {});
  }
  const result = await window.api.showBrowser(bounds);
  if (!result || !result.ok) {
    setBrowserSignal((result && result.error) || 'Tarayıcı alanı açılamadı.', false);
    return;
  }
  updateBrowserNavigation(result);
  if (typeof result.captureEnabled === 'boolean') setBrowserCaptureEnabled(result.captureEnabled, false);
  if (result.diagnostics) renderBrowserDiagnostics(result.diagnostics);
  if (result.places) { player.browserPlaces = result.places; renderBrowserPlaces(); }
  else loadBrowserPlaces();
  scheduleBrowserBounds();
  if (!result.hasPage) {
    const last = (() => { try { return localStorage.getItem('playerBrowserLastUrl') || ''; } catch (_) { return ''; } })();
    if (last && $('browserAddress') && !$('browserAddress').value) $('browserAddress').value = last;
    setTimeout(() => $('browserAddress')?.focus(), 0);
  }
}

function setWorkspaceMode(mode, persist = true) {
  mode = mode === 'browser' ? 'browser' : 'player';
  if (mode !== player.workspaceMode) flushWatchState(false, true);
  if (mode === 'browser' && player.viewMode === 'cinema') setViewMode(player.lastSideMode || 'reading');
  player.workspaceMode = mode;
  const layer = $('playerLayer');
  layer?.classList.toggle('workspace-browser', mode === 'browser');
  layer?.classList.toggle('browser-chrome-collapsed', mode === 'browser' && player.browserChromeCollapsed);
  $('browserWorkspace')?.classList.toggle('hidden', mode !== 'browser');
  setBrowserSignalVisible(player.browserSignalVisible, false);
  setBrowserCaptureEnabled(player.browserCaptureEnabled, false);
  const playerButton = $('workspacePlayerMode');
  const browserButton = $('workspaceBrowserMode');
  if (playerButton) {
    playerButton.classList.toggle('active', mode === 'player');
    playerButton.setAttribute('aria-selected', mode === 'player' ? 'true' : 'false');
  }
  if (browserButton) {
    browserButton.classList.toggle('active', mode === 'browser');
    browserButton.setAttribute('aria-selected', mode === 'browser' ? 'true' : 'false');
  }
  if ($('makeSubsBtn')) {
    $('makeSubsBtn').disabled = mode === 'browser';
    $('makeSubsBtn').title = mode === 'browser'
      ? 'Tarayıcı modunda sayfanın mevcut altyazısı algılanir; Whisper için videoyu normal oynatıcıda açın.'
      : 'Bu video için altyazı oluştur';
  }
  if (mode === 'browser') {
    $('playerVideo')?.pause();
    $('playerTitle').textContent = player.browserPageTitle || 'Tarayıcı';
    $('playerMeta').textContent = 'Web videosu · altyazı algılama açık';
    requestAnimationFrame(() => showBrowserWorkspace());
    scheduleBrowserOverlaySync();
  } else {
    if (window.api.hideBrowser) window.api.hideBrowser().catch(() => {});
    $('playerTitle').textContent = player.localPath
      ? player.localPath.split(/[\\/]/).pop() : (player.ytInfo && player.ytInfo.title) || 'Oynatıcı';
    $('playerMeta').textContent = 'Çift dilli izleme ve çalışma alanı';
  }
  if (persist) {
    try { localStorage.setItem('playerWorkspaceMode', mode); } catch (_) {}
  }
  snapGridColumns();
  scheduleBrowserBounds();
}

async function navigateBrowserFromAddress() {
  const value = $('browserAddress')?.value.trim();
  if (!value || !window.api.navigateBrowser) {
    $('browserAddress')?.focus();
    return null;
  }
  setBrowserSignal('Sayfa açılıyor; altyazı izi bekleniyor…', false);
  let result;
  try {
    result = await window.api.navigateBrowser(value);
  } catch (error) {
    result = { ok: false, error: error && error.message ? error.message : 'Tarayıcı isteği tamamlanamadı.' };
  }
  if (!result || !result.ok) {
    setBrowserSignal(`Sayfa açılamadı: ${(result && result.error) || 'bilinmeyen hata'}`, false);
    if (player.workspaceMode === 'browser') $('playerMeta').textContent = 'Sayfa yüklenemedi';
    $('browserReload')?.classList.remove('loading');
    return result || null;
  }
  updateBrowserNavigation(result);
  return result;
}

if ($('workspacePlayerMode')) $('workspacePlayerMode').addEventListener('click', () => setWorkspaceMode('player'));
if ($('workspaceBrowserMode')) $('workspaceBrowserMode').addEventListener('click', () => setWorkspaceMode('browser'));
if ($('browserGo')) $('browserGo').addEventListener('click', navigateBrowserFromAddress);
if ($('browserAddress')) $('browserAddress').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); navigateBrowserFromAddress(); }
});
if ($('browserBookmarkToggle')) $('browserBookmarkToggle').addEventListener('click', async () => {
  if (!player.browserPageUrl || !window.api.toggleBrowserBookmark) return;
  const result = await window.api.toggleBrowserBookmark({
    url: player.browserPageUrl,
    title: player.browserPageTitle,
  }).catch(() => null);
  if (result && result.ok && result.places) {
    player.browserPlaces = result.places;
    renderBrowserPlaces();
    setBrowserSignal(result.bookmarked ? 'Site yer imlerine eklendi.' : 'Site yer imlerinden kaldırıldı.', result.bookmarked);
  }
});
if ($('browserPlacesToggle')) $('browserPlacesToggle').addEventListener('click', () => {
  const panel = $('browserPlacesPanel');
  setBrowserPlacesOpen(panel?.classList.contains('hidden'));
});
if ($('browserPlacesClose')) $('browserPlacesClose').addEventListener('click', () => setBrowserPlacesOpen(false));
if ($('browserPlacesClear')) $('browserPlacesClear').addEventListener('click', async () => {
  if (player.browserPlaceTab !== 'history' || !window.api.clearBrowserHistory) return;
  const result = await window.api.clearBrowserHistory().catch(() => null);
  if (result && result.ok && result.places) { player.browserPlaces = result.places; renderBrowserPlaces(); }
});
async function clearBrowserCookieScope(scope) {
  const site = player.browserPageUrl || '';
  const isSite = scope === 'site';
  if (isSite && !site) {
    setBrowserSignal('Önce bir site açın; temizlenecek site yok.', false);
    return;
  }
  const question = isSite
    ? 'Bu sitenin tüm çerezleri silinsin mi? Site oturumunuz kapanabilir.'
    : 'Uygulamadaki tüm web çerezleri silinsin mi? Açık site oturumları kapanabilir.';
  if (!confirm(question)) return;
  const apiCall = isSite
    ? window.api.clearBrowserSiteCookies?.(site)
    : window.api.clearBrowserCookies?.();
  const result = await (apiCall || Promise.resolve(null)).catch(() => null);
  if (!result || !result.ok) {
    setBrowserSignal(`Çerezler temizlenemedi: ${(result && result.error) || 'bilinmeyen hata'}`, false);
    return;
  }
  setBrowserPlacesOpen(false);
  const count = Number(result.removed) || 0;
  const failed = Number(result.failed) || 0;
  const suffix = failed ? ` ${failed} çerez silinemedi.` : '';
  setBrowserSignal(isSite
    ? `${result.host || 'Bu site'} çerezleri temizlendi (${count}). Sayfa yenileniyor.${suffix}`
    : `Tüm web çerezleri temizlendi (${count}). Sayfa yenileniyor.${suffix}`,
  true);
}
if ($('browserSiteCookiesClear')) $('browserSiteCookiesClear').addEventListener('click', () => clearBrowserCookieScope('site'));
if ($('browserCookiesClear')) $('browserCookiesClear').addEventListener('click', () => clearBrowserCookieScope('all'));
document.querySelectorAll('[data-place-tab]').forEach((tab) => tab.addEventListener('click', () => {
  player.browserPlaceTab = tab.dataset.placeTab === 'history' ? 'history' : 'bookmarks';
  renderBrowserPlaces();
}));
if ($('browserPlacesList')) $('browserPlacesList').addEventListener('click', async (event) => {
  const open = event.target.closest('[data-place-open]');
  if (open) {
    const url = open.dataset.placeOpen;
    setBrowserPlacesOpen(false);
    if ($('browserAddress')) $('browserAddress').value = url;
    const result = await window.api.navigateBrowser(url).catch(() => null);
    if (result && result.ok) updateBrowserNavigation(result);
    else if (result) setBrowserSignal(`Sayfa açılamadı: ${result.error || 'bilinmeyen hata'}`, false);
    return;
  }
  const remove = event.target.closest('[data-place-remove]');
  if (!remove || !window.api.removeBrowserPlace) return;
  const result = await window.api.removeBrowserPlace(player.browserPlaceTab, remove.dataset.placeRemove).catch(() => null);
  if (result && result.ok && result.places) { player.browserPlaces = result.places; renderBrowserPlaces(); }
});
if ($('browserBack')) $('browserBack').addEventListener('click', () => window.api.browserCommand('back'));
if ($('browserForward')) $('browserForward').addEventListener('click', () => window.api.browserCommand('forward'));
if ($('browserReload')) $('browserReload').addEventListener('click', () => window.api.browserCommand('reload'));
if ($('browserCaptureToggle')) $('browserCaptureToggle').addEventListener('click', async () => {
  const button = $('browserCaptureToggle');
  if (button.disabled) return;
  const next = !player.browserCaptureEnabled;
  button.disabled = true;
  const result = await (window.api.setBrowserCaptureEnabled
    ? window.api.setBrowserCaptureEnabled(next)
    : Promise.resolve(null)).catch(() => null);
  button.disabled = false;
  if (!result || !result.ok) {
    setBrowserSignal('Altyazı yakalama durumu değiştirilemedi.', false);
    return;
  }
  setBrowserCaptureEnabled(result.enabled !== false);
  setBrowserSignal(result.enabled ? 'Altyazı yakalama yeniden başlatıldı.' : 'Altyazı yakalama durduruldu; tarayıcı kullanımı devam ediyor.', false);
});
if ($('browserSignalToggle')) $('browserSignalToggle').addEventListener('click', () => {
  setBrowserSignalVisible(!player.browserSignalVisible);
});
if ($('browserSignalClose')) $('browserSignalClose').addEventListener('click', () => setBrowserSignalVisible(false));
if ($('browserChromeToggle')) $('browserChromeToggle').addEventListener('click', () => {
  setBrowserChromeCollapsed(!player.browserChromeCollapsed);
});
if ($('browserTrackLoad')) $('browserTrackLoad').addEventListener('click', () => useBrowserTrack(false));
if ($('browserTrackLoadPair')) $('browserTrackLoadPair').addEventListener('click', useBrowserTrackPair);
if ($('browserTrackTranslate')) $('browserTrackTranslate').addEventListener('click', () => useBrowserTrack(true));
if ($('browserTrackExport')) $('browserTrackExport').addEventListener('click', exportSelectedBrowserTrack);
if ($('browserManualSubtitle')) $('browserManualSubtitle').addEventListener('click', loadManualBrowserSubtitle);
if ($('browserCopyAb')) $('browserCopyAb').addEventListener('click', copyBrowserAbText);
if ($('browserTrackDismiss')) $('browserTrackDismiss').addEventListener('click', () => {
  $('browserTrackActions')?.classList.add('hidden');
  setBrowserSignal('Bildirim kapatıldı; altyazı izleme arka planda sürüyor.', false);
});
if ($('browserTrackSelect')) $('browserTrackSelect').addEventListener('change', () => renderBrowserTracks());
if ($('browserTrackSelect2')) $('browserTrackSelect2').addEventListener('change', () => renderBrowserTracks());
if ($('browserSessionReset')) $('browserSessionReset').addEventListener('click', async () => {
  const confirmed = confirm('Web oturumu sıfırlansın mı? Site girişleri, çerezler ve önbellek silinir. Yer imleri, geçmiş ve izleme kütüphanesi korunur.');
  if (!confirmed) return;
  await flushWatchState(false, true);
  const result = await window.api.resetBrowserSession().catch(() => null);
  if (!result || !result.ok) {
    setBrowserSignal(`Oturum sıfırlanamadı: ${(result && result.error) || 'bilinmeyen hata'}`, false);
    return;
  }
  setMediaKey('');
  player.browserPageUrl = '';
  player.browserPageTitle = '';
  player.browserTime = 0;
  player.browserDuration = 0;
  try { localStorage.removeItem('playerBrowserLastUrl'); } catch (_) {}
  if ($('browserAddress')) $('browserAddress').value = '';
  $('browserEmpty')?.classList.remove('hidden');
  clearBrowserTracks('Tarayıcı oturumu sıfırlandı; yer imleri ve geçmiş korundu.');
  if (result.places) { player.browserPlaces = result.places; renderBrowserPlaces(); }
  setBrowserPlacesOpen(false);
  showBrowserWorkspace();
});
if ($('browserDiagnosticsToggle')) $('browserDiagnosticsToggle').addEventListener('click', () => {
  const panel = $('browserDiagnosticsPanel');
  if (!panel) return;
  const open = panel.classList.toggle('hidden') === false;
  $('browserDiagnosticsToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && player.browserDiagnostics) renderBrowserDiagnostics(player.browserDiagnostics);
});

if (window.api.onBrowserEvent) window.api.onBrowserEvent((event) => {
  if (!event || !event.type) return;
  if (event.type === 'navigation') {
    updateBrowserNavigation(event);
  } else if (event.type === 'title') {
    player.browserPageTitle = event.title || '';
    if (player.workspaceMode === 'browser') $('playerTitle').textContent = player.browserPageTitle || 'Tarayıcı';
    loadBrowserPlaces();
  } else if (event.type === 'places' && event.places) {
    player.browserPlaces = event.places;
    renderBrowserPlaces();
  } else if (event.type === 'subtitle-found' && event.track) {
    const selectedBefore = $('browserTrackSelect')?.value || '';
    const index = player.browserTracks.findIndex((track) => track.id === event.track.id);
    if (index >= 0) player.browserTracks[index] = event.track;
    else player.browserTracks.push(event.track);
    renderBrowserTracks(selectedBefore || event.track.id);
    scheduleActiveBrowserTrackRefresh(event.track);
    if (index < 0) logLine(`Web altyazısı bulundu: ${event.track.label} · ${event.track.cueCount} satır`, 'success');
  } else if (event.type === 'media' && event.media) {
    const previousTime = player.browserTime;
    const wasPaused = player.browserPaused;
    player.browserTime = Number(event.media.currentTime) || 0;
    player.browserDuration = Number(event.media.duration) || 0;
    player.browserPaused = !!event.media.paused;
    player.browserVolume = Math.max(0, Math.min(1, Number(event.media.volume)));
    player.browserMuted = !!event.media.muted;
    const browserRate = Number(event.media.playbackRate);
    if (Number.isFinite(browserRate) && browserRate > 0) {
      player.browserRate = browserRate;
      if (player.workspaceMode === 'browser') syncPlayerSpeedControl(browserRate);
    }
    const now = Date.now();
    if (!player.browserPaused) {
      if (!player.watchSession) beginWatchSession();
      if (player.watchSession) {
        const last = player.watchSession.lastClock || now;
        const elapsed = (now - last) / 1000;
        if (elapsed > 0 && elapsed < 10) player.watchSession.watchSeconds += elapsed;
        player.watchSession.lastClock = now;
        player.watchSession.endPosition = player.browserTime;
      }
    } else if (!wasPaused) {
      if (player.watchSession) player.watchSession.lastClock = 0;
      savePlayerPosition();
      flushWatchState(false, true);
    }
    if (player.browserDuration > 0 && isFinite(player.browserDuration)) {
      if (player.browserProfileKey !== player.mediaKey) {
        player.browserProfileKey = player.mediaKey;
        restoreWatchProfile(player.mediaKey);
        maybeOfferResume();
      }
      const pendingSeek = player.pendingLibrarySeek;
      if (pendingSeek && pendingSeek.key === player.mediaKey
          && pendingSeek.generation === currentGeneration()) {
        const seekTo = Math.max(0, Math.min(player.browserDuration, Number(pendingSeek.seconds) || 0));
        player.pendingLibrarySeek = null;
        if (seekTo > 0) window.api.browserCommand('seek', seekTo).catch(() => {});
      }
      if (now - player.browserPositionTick > 5000) {
        player.browserPositionTick = now;
        savePlayerPosition();
      }
      if (now - player.watchSaveTick > 10000) {
        player.watchSaveTick = now;
        flushWatchState(false, false);
      }
    }
    if (player.workspaceMode === 'browser') renderBrowserCueAt(player.browserTime, previousTime, player.browserPaused);
  } else if (event.type === 'load-error') {
    updateBrowserNavigation({ ...event, loading: false });
    if (player.workspaceMode === 'browser') $('playerMeta').textContent = 'Sayfa yüklenemedi';
    setBrowserSignal(`Sayfa yüklenemedi: ${event.message || `hata ${event.code}`}`, false);
  } else if (event.type === 'capture-warning') {
    logLine(event.message || 'Web altyazısı ağdan izlenemedi; HTML5 izleri taranmaya devam ediyor.', 'warn');
  } else if (event.type === 'capture-enabled') {
    setBrowserCaptureEnabled(event.enabled !== false, false);
  } else if (event.type === 'capture-status' && event.diagnostics) {
    if (typeof event.diagnostics.captureEnabled === 'boolean') setBrowserCaptureEnabled(event.diagnostics.captureEnabled, false);
    renderBrowserDiagnostics(event.diagnostics);
  } else if (event.type === 'drm-status') {
    const message = event.supported
      ? 'Widevine modülü bulundu. Bu yalnızca teknik erişimi doğrular; Hulu, Discovery+ ve benzeri servisler ayrıca üretim lisansı/VMP imzası isteyebilir.'
      : 'Bu Electron derlemesinde Widevine kullanılamıyor; korumalı video oynatılamayabilir, ancak erişilebilen altyazı ağ izleri taranmaya devam eder.';
    setBrowserSignal(message, !!event.supported);
    logLine(message, event.supported ? 'info' : 'warn');
  } else if (event.type === 'drm-wait') {
    setBrowserSignal(event.message || (event.waiting ? 'DRM bileşeni hazırlanıyor…' : 'Sayfa açılıyor…'), false);
  } else if (event.type === 'popup-opened') {
    const message = `${event.host || 'Site'} için güvenli giriş penceresi açıldı.`;
    setBrowserSignal(message, false);
    logLine(message, 'info');
  } else if (event.type === 'drm-playback-error') {
    const message = `Korumalı video lisans aşamasında reddedildi: ${event.message || 'DRM hatası'}`;
    setBrowserSignal(message, false);
    logLine(message, 'warn');
  }
});

window.addEventListener('resize', scheduleBrowserBounds);
bindBrowserBoundsObserver();

function normalizeAudioLang(value) {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-');
}

function audioLanguagesMatch(a, b) {
  const left = normalizeAudioLang(a);
  const right = normalizeAudioLang(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const lBase = left.split('-')[0];
  const rBase = right.split('-')[0];
  return lBase === rBase && (!left.includes('-') || !right.includes('-'));
}

function currentAudioLock(key = player.mediaKey) {
  return player.audioLocks[key] || null;
}

function rememberAudioLock(lang, label, key = player.mediaKey) {
  lang = normalizeAudioLang(lang);
  if (!key || !lang) return;
  player.audioLocks[key] = { lang, label: label || lang, at: Date.now() };
  const keys = Object.keys(player.audioLocks).sort((a, b) =>
    (player.audioLocks[b].at || 0) - (player.audioLocks[a].at || 0));
  keys.slice(60).forEach((k) => delete player.audioLocks[k]);
  try { localStorage.setItem('playerAudioLocks', JSON.stringify(player.audioLocks)); } catch (_) {}
  updateAudioLockStatus();
}

function updateAudioLockStatus() {
  const status = $('playerAudioLockStatus');
  const enabled = !$('playerAudioLock') || $('playerAudioLock').checked;
  const lock = currentAudioLock();
  if (!status) return;
  status.textContent = !enabled ? 'Kapalı — Whisper kendi varsayılan sesini kullanır'
    : player.playbackAudioLang ? `Oynatılan ve Whisper sesi: ${player.playbackAudioLang}`
    : lock ? `Kilitli ses: ${lock.label || lock.lang}`
      : 'Ses seçilince otomatik eşleştirilir';
}

function pSecToTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
           : `${m}:${String(s).padStart(2, '0')}`;
}

// Kayitli cümleler video degisse bile karismasin. Indeks yerine zaman+metin
// imzasi kullanilir; altyazi yeniden üretildiginde ayni satir mümkün oldugunca
// korunur, baska videoda eski favoriler görünmez.
function cueSignature(cue) {
  if (!cue) return '';
  return `${Number(cue.start || 0).toFixed(3)}|${Number(cue.end || 0).toFixed(3)}|${String(cue.text || '').trim()}`;
}

function savedCueStorageKey() {
  return player.mediaKey ? `whisper-player-saved:${player.mediaKey}` : '';
}

function loadSavedCues() {
  player.savedCues = [];
  const key = savedCueStorageKey();
  if (!key) return;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(raw)) player.savedCues = raw.filter((x) => typeof x === 'string').slice(-500);
  } catch (_) {}
}

function persistSavedCues() {
  const key = savedCueStorageKey();
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(player.savedCues.slice(-500))); } catch (_) {}
}

function isCueSaved(index) {
  return index >= 0 && !!player.cues[index]
    && player.savedCues.includes(cueSignature(player.cues[index]));
}

function updateCueMeta() {
  const total = player.cues.length;
  const position = $('cuePosition');
  const fill = $('cueProgressFill');
  if (position) {
    position.textContent = total && player.activeIdx >= 0
      ? `${String(player.activeIdx + 1).padStart(3, '0')} / ${String(total).padStart(3, '0')}`
      : (total ? `000 / ${String(total).padStart(3, '0')}` : '— / —');
  }
  if (fill) {
    const pct = total > 1 && player.activeIdx >= 0
      ? (player.activeIdx / (total - 1)) * 100 : 0;
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
  const save = $('cueSaveBtn');
  if (save) {
    const saved = isCueSaved(player.activeIdx);
    save.classList.toggle('is-saved', saved);
    save.title = saved ? 'Aktif cümleyi kayıtlardan çıkar (K)' : 'Aktif cümleyi kaydet (K)';
    const label = save.querySelector('span:last-child');
    if (label) label.textContent = saved ? 'Kayıtlı' : 'Kaydet';
  }
  const headSave = $('playerBookmark');
  if (headSave) {
    const saved = isCueSaved(player.activeIdx);
    headSave.classList.toggle('active', saved);
    headSave.setAttribute('aria-pressed', saved ? 'true' : 'false');
    headSave.title = saved ? 'Aktif cümleyi kayıtlardan çıkar (K)' : 'Aktif cümleyi kaydet (K)';
  }
  const savedFilter = $('savedOnlyBtn');
  if (savedFilter) {
    savedFilter.classList.toggle('active', player.savedOnly);
    const savedCount = player.savedCues.length;
    savedFilter.title = player.savedOnly
      ? 'Tüm cümleleri göster'
      : `Kaydedilen cümleleri göster (${savedCount})`;
    savedFilter.setAttribute('aria-pressed', player.savedOnly ? 'true' : 'false');
  }
  const qualityFilter = $('qualityOnlyBtn');
  if (qualityFilter) {
    qualityFilter.classList.toggle('active', player.qualityOnly);
    const lowCount = player.cues.filter((c) => Number(c.lowConfidenceWords) > 0
      || (c.confidence !== undefined && Number(c.confidence) < 0.6)).length;
    qualityFilter.title = player.qualityOnly
      ? 'Tüm cümleleri göster'
      : `Düşük güvenli cümleleri göster (${lowCount})`;
    qualityFilter.setAttribute('aria-pressed', player.qualityOnly ? 'true' : 'false');
  }
  const clear = $('clearCueSearch');
  if (clear) clear.classList.toggle('hidden', !$('cueSearch')?.value);
}

function savedWordStorageKey() {
  return player.mediaKey ? `whisper-player-words:${player.mediaKey}` : '';
}

function wordRecordKey(word, cueIndex, source = 'source') {
  const cue = player.cues[cueIndex];
  return `${String(word || '').trim().toLocaleLowerCase('tr')}|${cueSignature(cue)}|${source}`;
}

function loadSavedWords() {
  player.savedWords = [];
  const key = savedWordStorageKey();
  if (!key) return;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(raw)) {
      player.savedWords = raw.filter((x) => x && typeof x.key === 'string').slice(-1000);
    }
  } catch (_) {}
}

function persistSavedWords() {
  const key = savedWordStorageKey();
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(player.savedWords.slice(-1000))); } catch (_) {}
}

function isWordSaved(word, cueIndex, source = 'source') {
  return !!word && player.savedWords.some((x) => x.key === wordRecordKey(word, cueIndex, source));
}

function updateWordInspector() {
  const panel = $('wordInspector');
  const selected = player.selectedWord;
  if (!panel || !selected) return;
  const cue = player.cues[selected.cueIndex];
  if (!cue) { panel.classList.add('hidden'); return; }
  const word = String(selected.word || '').trim();
  const saved = isWordSaved(word, selected.cueIndex, selected.source);
  const wordEl = $('wordInspectorWord');
  const metaEl = $('wordInspectorMeta');
  const contextEl = $('wordInspectorContext');
  if (wordEl) wordEl.textContent = word;
  if (metaEl) metaEl.textContent = `${selected.source === 'translation' ? 'Çeviri' : 'Kaynak'} · ${pSecToTime(cue.start)}`;
  if (contextEl) {
    const translated = translationFor(cue);
    contextEl.textContent = translated
      ? `${cue.text}\n${translated}`
      : cue.text;
  }
  const save = $('wordSaveBtn');
  if (save) {
    save.classList.toggle('is-saved', saved);
    save.title = saved ? 'Kelimeyi koleksiyondan çıkar (W)' : 'Kelimeyi koleksiyona ekle (W)';
    const label = save.querySelector('span:last-child');
    if (label) label.textContent = saved ? 'Kayıtlı' : 'Kelimeyi kaydet';
  }
}

function showWordInspector(word, cueIndex, source = 'source') {
  const cue = player.cues[cueIndex];
  if (!cue || !String(word || '').trim()) return;
  player.selectedWord = { word: String(word).trim(), cueIndex, source };
  const panel = $('wordInspector');
  if (panel) panel.classList.remove('hidden');
  updateWordInspector();
}

function hideWordInspector() {
  player.selectedWord = null;
  const panel = $('wordInspector');
  if (panel) panel.classList.add('hidden');
  setWordHighlight('picked', null);
}

// Kelimeler DUZ METIN olarak yazilir. Eskiden her kelime ayri bir <button> ve
// 3 olay dinleyicisiydi; 4000 bloklu (8 saatlik) bir videoda bu 56.000 dugme,
// 72.000 DOM dugumu ve ~168.000 dinleyici demekti. Olculen bedel: liste cizimi
// 21 ms yerine 426 ms, aramada HER TUS VURUSUNDA 336 ms donma.
// Kelime tiklama/vurgulama artik imlec konumundan (caretRangeFromPoint) tespit
// ediliyor: tek delege dinleyici, sifir ek DOM. Ozellik aynen duruyor.
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;

function appendInteractiveText(el, text, q, _cueIndex, _source) {
  appendHighlighted(el, text, q);
}

// Ekran koordinatindaki kelimeyi bulur: {word, node, start, end}
function wordAtPoint(x, y) {
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); }
  }
  if (!range) return null;
  const node = range.startContainer;
  if (!node || node.nodeType !== 3) return null;
  const text = node.textContent || '';
  const off = range.startOffset;
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (off >= m.index && off <= m.index + m[0].length) {
      return { word: m[0], node, start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

// Vurgulama DOM'a dokunmadan CSS Custom Highlight API ile yapilir.
const _hl = (typeof Highlight !== 'undefined' && window.CSS && CSS.highlights)
  ? { hover: new Highlight(), picked: new Highlight() } : null;
if (_hl) {
  CSS.highlights.set('cue-word-hover', _hl.hover);
  CSS.highlights.set('cue-word-picked', _hl.picked);
}

function setWordHighlight(which, hit) {
  if (!_hl) return;
  _hl[which].clear();
  if (!hit) return;
  try {
    const r = document.createRange();
    r.setStart(hit.node, hit.start);
    r.setEnd(hit.node, hit.end);
    _hl[which].add(r);
  } catch (_) {}
}

// Tek delege dinleyici: kart tiklamasi, cift tiklama ve kelime secimi
function bindCueListDelegation() {
  const box = $('cueList');
  if (!box) return;
  const cardIndex = (e) => {
    const card = e.target.closest ? e.target.closest('.cue-card') : null;
    return card ? parseInt(card.dataset.idx, 10) : NaN;
  };
  box.addEventListener('click', (e) => {
    const i = cardIndex(e);
    if (isNaN(i)) return;
    if (e.target.closest && e.target.closest('.cue-confidence')) {
      e.preventDefault();
      seekToCue(i);
      const video = $('playerVideo');
      if (video) video.play().catch(() => {});
      return;
    }
    if (player.timeline.open) { player.timeline.selected = i; drawTimeline(); }
    const inSrc = e.target.closest('.cue-card-src');
    const inTr = e.target.closest('.cue-card-tr');
    const hit = (inSrc || inTr) ? wordAtPoint(e.clientX, e.clientY) : null;
    if (player.activeIdx !== i) seekToCue(i);
    if (hit) {
      setWordHighlight('picked', hit);
      showWordInspector(hit.word, i, inTr ? 'translation' : 'source');
    }
  });
  box.addEventListener('dblclick', (e) => {
    const i = cardIndex(e);
    if (isNaN(i)) return;
    if (player.timeline.open) { player.timeline.selected = i; drawTimeline(); }
    e.preventDefault();
    seekToCue(i);
    openCueEditor();
  });
  let moveTick = 0;
  box.addEventListener('mousemove', (e) => {
    if (!_hl) return;
    const now = Date.now();
    if (now - moveTick < 60) return;          // kisitla: her piksel icin hesaplama
    moveTick = now;
    const on = e.target.closest('.cue-card-src, .cue-card-tr');
    setWordHighlight('hover', on ? wordAtPoint(e.clientX, e.clientY) : null);
  }, { passive: true });
  box.addEventListener('mouseleave', () => setWordHighlight('hover', null));
}

// ASS/SSA ayrıştırma — indirilmiş altyazılarda yaygın. Dialogue satırlarındaki
// zaman ve metin alınır; {\...} biçim etiketleri ve \N satır sonu çevrilir.
function parseAss(text) {
  const out = [];
  const srcLines = String(text).split(/\r?\n/);
  let lineNo = -1;
  const toSec = (t) => {
    const m = String(t).trim().match(/(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/);
    if (!m) return null;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / (m[4].length === 2 ? 100 : 1000);
  };
  for (const line of srcLines) {
    lineNo++;
    if (!/^Dialogue\s*:/i.test(line)) continue;
    // Dialogue: Layer,Start,End,Style,Name,ML,MR,MV,Effect,Text  (metin virgül içerebilir)
    const parts = line.slice(line.indexOf(':') + 1).split(',');
    if (parts.length < 10) continue;
    const start = toSec(parts[1]);
    const end = toSec(parts[2]);
    if (start === null || end === null) continue;
    const rawBody = parts.slice(9).join(',');
    // Bastaki bicim/konum etiketleri ({\\pos(960,100)} gibi) DUZENLEMEDE KORUNUR:
    // kullanici bir kelimeyi duzeltince konumlandirma/stil silinmesin.
    const lead = (rawBody.match(/^(?:\{[^}]*\})+/) || [''])[0];
    const body = rawBody
      .replace(/\{[^}]*\}/g, '')       // {\i1} gibi biçim etiketleri
      .replace(/\\[Nn]/g, '\n')        // ASS satır sonu
      .replace(/\\h/g, ' ')
      .trim();
    // Metnin ORTASINDA kalan etiket duzenlemede kaybolur - kullaniciyi uyar
    const hadInner = /\{[^}]*\}/.test(rawBody.slice(lead.length));
    // line: kaynak dosyadaki satir numarasi - duzenleme kaydinda O satirin metin
    // alani degistirilir, dosyanin geri kalanina (stiller, konumlar) dokunulmaz.
    if (body) out.push({ start, end, text: body, line: lineNo, assLead: lead, assInner: hadInner });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// SRT/VTT ayrıştırma — write_srt çıktımızla birebir uyumlu (BOM ve \r\n dahil)
function parseSubtitles(text) {
  if (/^\s*(\[Script Info\]|\[V4\+? Styles\])/im.test(text) || /^Dialogue\s*:/im.test(text)) {
    return parseAss(text);
  }
  const out = [];
  const clean = String(text || '').replace(/\r/g, '').replace(/^\uFEFF/, '');
  // WebVTT bir saatin altinda HH alanini atlayabilir (MM:SS.mmm). SRT'nin
  // HH:MM:SS,mmm bicimini de kabul eden tek ifade kullan.
  const re = /(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})/;
  for (const block of clean.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;
    const idx = lines.findIndex((l) => re.test(l));
    if (idx === -1) continue;
    const m = lines[idx].match(re);
    const start = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0')) / 1000;
    const end = (+(m[5] || 0)) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8].padEnd(3, '0')) / 1000;
    const body = lines.slice(idx + 1).join('\n').trim();
    if (body) out.push({ start, end, text: body });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// Altyazi metnini kutulu bir span icine yazar (arka plan yalnizca metnin
// arkasinda dursun, satirin tamami boyunca degil) ve degisince animasyon tetikler.
function setOverlayText(el, text) {
  if (!el) return;
  const cur = el.firstChild && el.firstChild.textContent;
  if (cur === text) return;                  // ayni metin: animasyonu tekrarlama
  el.textContent = '';
  if (!text) return;
  const span = document.createElement('span');
  span.className = 'subtitle-overlay-inner';
  span.textContent = text;
  el.appendChild(span);
}

// Aktif blok genelde bir öncekinin komşusudur — baştan aramak yerine oradan ilerle
function findCueAt(cues, t, hint) {
  let i = hint;
  if (i >= 0 && i < cues.length && cues[i].start <= t && cues[i].end >= t) return i;
  return cues.findIndex((c) => c.start <= t && c.end >= t);
}

function renderCue() {
  const video = $('playerVideo');
  const overlay = $('subtitleOverlay');
  const overlay2 = $('subtitleOverlay2');
  if (!video || !overlay) return;
  const t = video.currentTime - player.offset;

  if (player.cues.length) {
    const i = findCueAt(player.cues, t, player.activeIdx);
    if (i !== player.activeIdx) {
      player.activeIdx = i;
      highlightCueRow();
    }
    updateCueMeta();
    if (!$('aiChat').classList.contains('hidden')) aiChatCtxLabel();
    // Düzenleme açıkken metni değiştirme — kullanıcı yazarken altından kaymasın
    if (!player.editing) setOverlayText(overlay, i >= 0 ? player.cues[i].text : '');

    // Her blok sonunda duraklat (Voracious'taki çalışma modu).
    // GECIS yakalanir: onceki zaman blok sonundan kucuk, simdiki buyuk/esit.
    // Eskiden "t >= end - 0.05" penceresine bakiliyordu; timeupdate ~250 ms'de bir
    // tetiklendigi icin 50 ms'lik pencere cogu blok sonunda ISKALANIYORDU (ve blok
    // bittikten sonra findCueAt -1 dondugu icin kosul hic calismiyordu).
    // dt korumasi: ileri/geri sarmada (buyuk sicrama) duraklatma tetiklenmesin -
    // yalnizca normal oynatma adimi (0 < dt < 1 sn) gecis sayilir.
    const dt = player.lastT === undefined ? -1 : t - player.lastT;
    if (player.autoPause && !video.paused && dt > 0 && dt < 1.0) {
      // Bitisini gectigimiz blogu HER ZAMAN onceki zamana gore bul.
      // Eskiden `i >= 0 ? i : ...` yaziyordu: tik boslugu atlayip sonraki
      // blogun icine dustugunde (250 ms tik / 80 ms bosluk -> cogu zaman)
      // gecis YANLIS blogun sonuna gore sinaniyor ve duraklatma kaciriliyordu.
      const j = findCueAt(player.cues, player.lastT, player.activeIdx);
      if (j >= 0 && player.lastT < player.cues[j].end && t >= player.cues[j].end) {
        video.pause();
        // Kullanici geri sarip ayni blogu tekrar dinlerse YINE dursun diye
        // isaretlemeye gerek yok: gecis mantigi kendini tekrarlamaz.
      }
    }
    player.lastT = t;
  } else {
    setOverlayText(overlay, '');
    updateCueMeta();
  }

  if (overlay2) {
    if (player.cues2.length) {
      const j = findCueAt(player.cues2, t, player.activeIdx2);
      player.activeIdx2 = j;
      setOverlayText(overlay2, j >= 0 ? player.cues2[j].text : '');
    } else {
      setOverlayText(overlay2, '');
    }
  }
  scheduleTimelineDraw();
}

// ---- Altyazı listesi (LLPlayer'daki "subtitles sidebar" fikri) ----
// Tüm blokları listeler; tıklayınca o ana atlar, aktif blok vurgulanır ve
// görünür alana kaydırılır. Uzun filmde altyazı denetimini kolaylaştırır.
// Kaynak ve ceviri AYRI zaman cizelgeleri olabilir (ceviri baska bir dosyadan
// gelmis olabilir). Eslesme zaman ORTUSMESINE gore yapilir: kaynak blogunun
// suresiyle en cok ortusen ceviri blogu secilir.
function translationFor(cue) {
  if (!player.cues2.length) return '';
  let best = null;
  let bestOverlap = 0;
  for (const t of player.cues2) {
    if (t.start >= cue.end) break;               // cues2 zaman sirali
    const ov = Math.min(cue.end, t.end) - Math.max(cue.start, t.start);
    if (ov > bestOverlap) { bestOverlap = ov; best = t; }
  }
  // Ortusme cok kucukse eslestirme (yanlis satir gostermektense bos birak)
  return bestOverlap > Math.min(0.4, (cue.end - cue.start) * 0.25) ? best.text : '';
}

// Aramada eslesen kismi vurgula (metin duz eklenir, XSS yok)
function appendHighlighted(el, text, q) {
  const flat = text.replace(/\n/g, ' ');
  if (!q) { el.textContent = flat; return; }
  const low = flat.toLocaleLowerCase('tr');
  let from = 0;
  let at = low.indexOf(q);
  if (at < 0) { el.textContent = flat; return; }
  while (at >= 0) {
    el.appendChild(document.createTextNode(flat.slice(from, at)));
    const m = document.createElement('mark');
    m.textContent = flat.slice(at, at + q.length);
    el.appendChild(m);
    from = at + q.length;
    at = low.indexOf(q, from);
  }
  el.appendChild(document.createTextNode(flat.slice(from)));
}

function renderCueList(filter = '') {
  const box = $('cueList');
  if (!box) return;
  const q = filter.trim().toLocaleLowerCase('tr');
  box.innerHTML = '';
  updateCueMeta();
  if (!player.cues.length) {
    box.innerHTML = '<div class="cue-list-empty">Altyazı yüklenince satırlar burada akar.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  let shown = 0;
  player.cues.forEach((c, i) => {
    const tr = translationFor(c);
    if (q && !c.text.toLocaleLowerCase('tr').includes(q)
        && !tr.toLocaleLowerCase('tr').includes(q)) return;
    if (player.savedOnly && !isCueSaved(i)) return;
    const lowConfidence = Number(c.lowConfidenceWords) > 0
      || (c.confidence !== undefined && Number(c.confidence) < 0.6);
    if (player.qualityOnly && !lowConfidence) return;
    shown++;
    const card = document.createElement('div');
    card.className = 'cue-card';
    card.classList.toggle('saved', isCueSaved(i));
    card.classList.toggle('low-confidence', lowConfidence);
    card.dataset.idx = String(i);

    const time = document.createElement('div');
    time.className = 'cue-card-time';
    time.textContent = pSecToTime(c.start);
    if (lowConfidence) {
      const confidence = document.createElement('button');
      confidence.type = 'button';
      confidence.className = 'cue-confidence';
      confidence.title = `Düşük güven${c.confidence !== undefined
        ? ` · %${Math.round(Number(c.confidence) * 100)}` : ''} — sesi tekrar dinle`;
      confidence.setAttribute('aria-label', confidence.title);
      confidence.textContent = '!';
      time.appendChild(confidence);
    }

    const body = document.createElement('div');
    const src = document.createElement('div');
    src.className = 'cue-card-src';
    appendInteractiveText(src, c.text, q, i, 'source');
    body.appendChild(src);
    if (tr) {
      const trEl = document.createElement('div');
      trEl.className = 'cue-card-tr';
      appendInteractiveText(trEl, tr, q, i, 'translation');
      body.appendChild(trEl);
    }

    card.appendChild(time);
    card.appendChild(body);
    // tiklama/cift tiklama listeye DELEGE edilir (bkz. bindCueListDelegation)
    frag.appendChild(card);
  });
  if (!shown) {
    box.innerHTML = '<div class="cue-list-empty">Eşleşen satır yok.</div>';
    return;
  }
  box.appendChild(frag);
  setWordHighlight('hover', null);
  setWordHighlight('picked', null);   // eski aralikler yeniden cizimde gecersiz
  highlightCueRow();
}

function highlightCueRow() {
  const box = $('cueList');
  if (!box) return;
  updateCueMeta();
  const prev = box.querySelector('.cue-card.active');
  if (prev) prev.classList.remove('active');
  if (player.activeIdx < 0) {
    // Altyazi bosluklarinda (sessiz bolumler) aktif satir yoktur. Kullanici elle
    // kaydirmissa "Aktif satira don" dugmesi KAYBOLMAMALI - yoksa geri donus
    // yolunu kaybediyor.
    const b = $('backToActive');
    if (b) b.classList.toggle('hidden', !(player.userScrolled && player.cues.length));
    return;
  }
  const row = box.querySelector(`.cue-card[data-idx="${player.activeIdx}"]`);
  if (!row) return;
  row.classList.add('active');
  const rb = row.getBoundingClientRect();
  const bb = box.getBoundingClientRect();
  const visible = rb.top >= bb.top && rb.bottom <= bb.bottom;

  // Kullanici elle kaydirdiysa takip GECICI olarak durur; "Aktif satıra dön"
  // dugmesi cikar. Aksi halde aktif satir panelin ORTASINA yakin tutulur -
  // okurken bir sonraki cumleyi de gormek icin.
  if (!player.autoFollow || player.userScrolled) {
    const btn = $('backToActive');
    if (btn) btn.classList.toggle('hidden', visible);
    return;
  }
  // RECT FARKI: offsetTop, offsetParent .player-side oldugu icin kaydirma
  // kutusuna gore DEGILDI ve satir hic ortalanmiyordu.
  const delta = (rb.top + rb.height / 2) - (bb.top + bb.height / 2);
  if (Math.abs(delta) > 2) {
    const top = Math.max(0, box.scrollTop + delta);
    box.scrollTop = top;
    player.expectedScroll = box.scrollTop;   // tarayicinin kirptigi degeri al
  }
  const btn = $('backToActive');
  if (btn) btn.classList.add('hidden');
}

// Kullanicinin kendi kaydirmasi ile bizim otomatik kaydirmamizi ayirmak icin
// bayrak kullanilir (scroll olayi ikisinde de tetiklenir).
function bindTranscriptScroll() {
  const box = $('cueList');
  if (!box) return;
  // ZAMAN penceresi kirilgandi: kullanici kaydirdiktan hemen sonra gelen otomatik
  // kaydirma onun olayini maskeliyordu. Bunun yerine BEKLENEN KONUM tutulur -
  // gozlenen konum bizim yazdigimizdan farkliysa kaydiran kullanicidir.
  window.__markAutoScroll = () => { player.expectedScroll = undefined; };
  const userIntent = () => {
    player.userScrolled = true;
    player.expectedScroll = undefined;
  };
  box.addEventListener('wheel', userIntent, { passive: true });
  box.addEventListener('touchmove', userIntent, { passive: true });
  box.addEventListener('scroll', () => {
    const expected = player.expectedScroll;
    if (expected !== undefined && Math.abs(box.scrollTop - expected) <= 4) return;  // bizim
    player.userScrolled = true;
    const btn = $('backToActive');
    if (btn && player.activeIdx >= 0) {
      const row = box.querySelector(`.cue-card[data-idx="${player.activeIdx}"]`);
      if (row) {
        const rb = row.getBoundingClientRect();
        const bb = box.getBoundingClientRect();
        btn.classList.toggle('hidden', rb.top >= bb.top && rb.bottom <= bb.bottom);
      }
    }
  }, { passive: true });
}

// ---- blok gezinme (Voracious: "navigate forward and back by subtitle") ----
function seekToCue(i) {
  const video = $('playerVideo');
  if (i < 0 || i >= player.cues.length) return;
  const target = Math.max(0, player.cues[i].start + player.offset + 0.01);
  if (player.workspaceMode === 'browser' && window.api.browserCommand) {
    player.browserTime = target;
    window.api.browserCommand('seek', target).catch(() => {});
    renderBrowserCueAt(target);
  } else {
    if (!video) return;
    video.currentTime = target;
  }
  player.activeIdx = i;
  if (player.workspaceMode !== 'browser') renderCue();
  highlightCueRow();
}

function stepCue(delta) {
  if (!player.cues.length) return;
  const video = $('playerVideo');
  const t = (player.workspaceMode === 'browser' ? player.browserTime : (video && video.currentTime) || 0) - player.offset;
  let i = player.activeIdx;
  if (i < 0) {
    if (delta < 0) {
      i = player.cues.length - 1;
      while (i > 0 && player.cues[i].end > t) i--;
    } else {
      i = player.cues.findIndex((c) => c.start > t);
      if (i < 0) i = player.cues.length - 1;
    }
  } else {
    i += delta;
  }
  seekToCue(Math.min(player.cues.length - 1, Math.max(0, i)));
}

function replayCue() {
  if (player.activeIdx >= 0) seekToCue(player.activeIdx);
  if (player.workspaceMode === 'browser') {
    if (window.api.browserCommand) window.api.browserCommand('play').catch(() => {});
    return;
  }
  const video = $('playerVideo');
  if (video && video.paused) video.play();
}

function copyCue() {
  if (player.activeIdx < 0) return;
  window.api.copyText(player.cues[player.activeIdx].text);
  logLine('Altyazı satırı panoya kopyalandı.', 'success');
}

function toggleCueSaved() {
  if (player.activeIdx < 0 || !player.cues[player.activeIdx]) {
    logLine('Kaydetmek için önce bir altyazı satırına gel.', 'warn');
    return;
  }
  const sig = cueSignature(player.cues[player.activeIdx]);
  const at = player.savedCues.indexOf(sig);
  if (at >= 0) {
    player.savedCues.splice(at, 1);
    osd('Cümle kayıtlardan çıkarıldı');
  } else {
    player.savedCues.push(sig);
    osd('Cümle kaydedildi');
  }
  persistSavedCues();
  renderCueList($('cueSearch') ? $('cueSearch').value : '');
  updateCueMeta();
}

function toggleSavedOnly() {
  player.savedOnly = !player.savedOnly;
  renderCueList($('cueSearch') ? $('cueSearch').value : '');
  updateCueMeta();
}

function toggleQualityOnly() {
  player.qualityOnly = !player.qualityOnly;
  renderCueList($('cueSearch') ? $('cueSearch').value : '');
  updateCueMeta();
}

function toggleWordSaved() {
  const selected = player.selectedWord;
  const cue = selected && player.cues[selected.cueIndex];
  if (!selected || !cue) return;
  const key = wordRecordKey(selected.word, selected.cueIndex, selected.source);
  const at = player.savedWords.findIndex((x) => x.key === key);
  if (at >= 0) {
    player.savedWords.splice(at, 1);
    osd('Kelime koleksiyondan çıkarıldı');
  } else {
    player.savedWords.push({
      key,
      word: selected.word,
      source: selected.source,
      cue: cue.text,
      translation: translationFor(cue),
      start: cue.start,
    });
    osd('Kelime koleksiyona eklendi');
  }
  persistSavedWords();
  updateWordInspector();
}

function copySelectedWord() {
  if (!player.selectedWord) return;
  window.api.copyText(player.selectedWord.word);
  osd('Kelime panoya kopyalandı');
}

// Kelime aramasi uygulamadan DISARI cikan tek islemdir: secilen kelime varsayilan
// tarayicida acilan sozluk adresine gider. Bu yuzden hem dugme ipucunda hem
// gunlukte acikca belirtilir. Turkce kullanici icin Google'in "define X" aramasi
// zayif kaliyordu; EN-TR sozlukler varsayilan yapildi.
const WORD_LOOKUP_SOURCES = {
  tureng: { ad: 'Tureng', url: (w) => `https://tureng.com/tr/turkce-ingilizce/${encodeURIComponent(w)}` },
  wiktionary: { ad: 'Vikisözlük', url: (w) => `https://tr.wiktionary.org/wiki/${encodeURIComponent(w)}` },
  cambridge: { ad: 'Cambridge', url: (w) => `https://dictionary.cambridge.org/dictionary/english-turkish/${encodeURIComponent(w)}` },
  google: { ad: 'Google', url: (w) => `https://www.google.com/search?q=${encodeURIComponent('define ' + w)}` },
};

function lookupSelectedWord() {
  if (!player.selectedWord) return;
  const sel = $('wordLookupSource');
  const key = (sel && WORD_LOOKUP_SOURCES[sel.value]) ? sel.value : 'tureng';
  const src = WORD_LOOKUP_SOURCES[key];
  const word = player.selectedWord.word;
  logLine(`"${word}" ${src.ad} sözlüğünde açılıyor (tarayıcıda, uygulama dışında).`, 'info');
  window.api.openExternal(src.url(word));
}

// Blokları tekrar SRT'ye çevir (izlerken yapılan düzeltmeyi kaydetmek için)
function cuesToSrt(cues) {
  // ONCE tam milisaniyeye yuvarla, SONRA parcala. Ayri yuvarlamada 1.9996 gibi
  // degerler ms=1000 uretip "00:00:01,1000" gibi gecersiz zaman kodu yaziyordu.
  const fmt = (sec) => {
    const t = Math.max(0, Math.round(sec * 1000));
    const p = (x, w = 2) => String(x).padStart(w, '0');
    return `${p(Math.floor(t / 3600000))}:${p(Math.floor((t % 3600000) / 60000))}:`
         + `${p(Math.floor((t % 60000) / 1000))},${p(t % 1000, 3)}`;
  };
  return cues.map((c, i) =>
    `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n');
}

// ---- Dalga biçimli zamanlama masası ----
function timelineDuration() {
  const video = $('playerVideo');
  return Math.max(1, Number(video && video.duration) || 0,
    player.cues.length ? player.cues[player.cues.length - 1].end : 0,
    player.timeline.waveformDuration || 0);
}

function timelineWindow() {
  const duration = timelineDuration();
  const zoom = Number($('timelineZoom') ? $('timelineZoom').value : 60);
  if (!zoom || zoom >= duration) return { start: 0, end: duration };
  const video = $('playerVideo');
  const selected = player.cues[player.timeline.selected];
  const center = player.timeline.drag ? player.timeline.drag.center
    : (selected ? (selected.start + selected.end) / 2 : Number(video && video.currentTime) || 0);
  const start = Math.max(0, Math.min(duration - zoom, center - zoom / 2));
  return { start, end: start + zoom };
}

function timelineMarkDirty(message) {
  const drawer = $('timelineDrawer');
  if (drawer) drawer.classList.add('dirty');
  if ($('timelineStatus')) $('timelineStatus').textContent = message || 'Kaydedilmemiş zamanlama değişiklikleri';
  if ($('timelineUndo')) $('timelineUndo').disabled = !player.timeline.undo.length;
  renderCueList($('cueSearch') ? $('cueSearch').value : '');
  renderCue();
  drawTimeline();
}

function timelinePushUndo() {
  player.timeline.undo.push(player.cues.map((c) => ({ ...c })));
  if (player.timeline.undo.length > 30) player.timeline.undo.shift();
  if ($('timelineUndo')) $('timelineUndo').disabled = false;
}

function drawTimeline() {
  const canvas = $('timelineCanvas');
  const drawer = $('timelineDrawer');
  if (!canvas || !drawer || drawer.classList.contains('hidden')) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  const view = timelineWindow();
  const span = Math.max(.01, view.end - view.start);
  const xFor = (t) => (t - view.start) / span * w;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, w, h);

  // Zaman cetveli
  ctx.strokeStyle = '#252528'; ctx.fillStyle = '#737378'; ctx.font = '10px Segoe UI';
  const tick = span <= 35 ? 5 : span <= 130 ? 15 : span <= 320 ? 60 : Math.max(60, Math.round(span / 8 / 60) * 60);
  for (let t = Math.ceil(view.start / tick) * tick; t <= view.end; t += tick) {
    const x = xFor(t); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.fillText(pSecToTime(t), x + 4, 13);
  }

  // Gerçek yerel dalga biçimi. YouTube akışında dosya yoksa blok yoğunluğu yine görünür.
  const points = player.timeline.waveform;
  if (points.length) {
    ctx.strokeStyle = '#4d7270'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const t = view.start + px / w * span;
      const idx = Math.max(0, Math.min(points.length - 1,
        Math.floor(t / Math.max(.01, player.timeline.waveformDuration) * points.length)));
      const amp = points[idx] * 38;
      if (px === 0) ctx.moveTo(px, 52 - amp); else ctx.lineTo(px, 52 - amp);
      ctx.lineTo(px, 52 + amp);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#333337'; ctx.beginPath(); ctx.moveTo(0, 52); ctx.lineTo(w, 52); ctx.stroke();
  }

  const chosen = player.timeline.selected >= 0 ? player.timeline.selected : player.activeIdx;
  player.cues.forEach((cue, i) => {
    if (cue.end < view.start || cue.start > view.end) return;
    const x1 = Math.max(0, xFor(cue.start));
    const x2 = Math.min(w, xFor(cue.end));
    const lowConfidence = Number(cue.lowConfidenceWords) > 0 ||
      (cue.confidence !== undefined && Number(cue.confidence) < 0.6);
    ctx.fillStyle = i === chosen ? 'rgba(243,189,79,.62)'
      : lowConfidence ? 'rgba(196,91,72,.42)' : 'rgba(155,215,208,.30)';
    ctx.strokeStyle = i === chosen ? '#f3bd4f' : lowConfidence ? '#c45b48' : '#5f8d89';
    ctx.fillRect(x1, 82, Math.max(3, x2 - x1), 33);
    ctx.strokeRect(x1 + .5, 82.5, Math.max(2, x2 - x1 - 1), 32);
    if (x2 - x1 > 38) {
      ctx.save(); ctx.beginPath(); ctx.rect(x1 + 4, 84, x2 - x1 - 8, 28); ctx.clip();
      ctx.fillStyle = i === chosen ? '#17130b' : '#c8d8d6'; ctx.font = '10px Segoe UI';
      ctx.fillText(cue.text.replace(/\n/g, ' '), x1 + 6, 102); ctx.restore();
    }
  });
  const video = $('playerVideo');
  const now = Number(video && video.currentTime) || 0;
  if (now >= view.start && now <= view.end) {
    const x = xFor(now); ctx.strokeStyle = '#f4f4f6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, 121); ctx.stroke();
  }
}

function scheduleTimelineDraw() {
  if (!player.timeline.open || player.timeline.drawPending) return;
  player.timeline.drawPending = true;
  requestAnimationFrame(() => { player.timeline.drawPending = false; drawTimeline(); });
}

async function openTimeline() {
  if (!player.cues.length) { logLine('Zamanlama için önce bir altyazı yükleyin.', 'warn'); return; }
  player.timeline.open = true;
  if ($('playerVideo')) $('playerVideo').pause();
  player.timeline.selected = player.activeIdx >= 0 ? player.activeIdx : 0;
  $('timelineDrawer').classList.remove('hidden');
  $('timelineToggle').classList.add('active');
  drawTimeline();
  if (!player.timeline.waveform.length && player.localPath && !player.timeline.loading) {
    const waveformPath = player.localPath;
    const waveformGen = currentGeneration();
    player.timeline.loading = true;
    $('timelineStatus').textContent = 'Ses dalga biçimi hazırlanıyor…';
    let result;
    try { result = await window.api.getWaveform(waveformPath); }
    catch (err) { result = { ok: false, error: err && err.message }; }
    if (staleGeneration(waveformGen) || player.localPath !== waveformPath) return;
    player.timeline.loading = false;
    if (result && result.ok && player.timeline.open) {
      player.timeline.waveform = result.points || [];
      player.timeline.waveformDuration = result.duration || 0;
      $('timelineStatus').textContent = 'Dalga biçimi hazır — bir bloğu seçip sürükleyin';
    } else if (player.timeline.open) {
      $('timelineStatus').textContent = 'Dalga biçimi yok — altyazı blokları yine düzenlenebilir';
    }
    drawTimeline();
  } else if (!player.localPath) {
    $('timelineStatus').textContent = 'YouTube akışında blok zamanlaması düzenlenebilir';
  }
}

function closeTimeline() {
  player.timeline.open = false;
  player.timeline.drag = null;
  if ($('timelineDrawer')) $('timelineDrawer').classList.add('hidden');
  if ($('timelineToggle')) $('timelineToggle').classList.remove('active');
}

function timelineNudge(delta) {
  const i = player.timeline.selected;
  if (i < 0 || !player.cues[i]) return;
  timelinePushUndo();
  const c = player.cues[i];
  const shift = Math.max(-c.start, delta);
  c.start += shift; c.end += shift;
  timelineMarkDirty(`${i + 1}. blok ${delta < 0 ? 'geri' : 'ileri'} kaydırıldı`);
}

function timelineSplitCue() {
  const video = $('playerVideo');
  const at = Number(video && video.currentTime);
  const i = player.timeline.selected;
  const cue = player.cues[i];
  if (!cue || !(at > cue.start + .2 && at < cue.end - .2)) {
    logLine('Oynatma noktası seçili bloğun en az 200 ms içinde olmalı.', 'warn'); return;
  }
  const words = cue.text.split(/\s+/);
  if (words.length < 2) {
    logLine('Tek kelimelik altyazı metni iki anlamlı parçaya bölünemez.', 'warn');
    return;
  }
  timelinePushUndo();
  const cut = Math.max(1, Math.min(words.length - 1,
    Math.round(words.length * (at - cue.start) / (cue.end - cue.start))));
  const left = { ...cue, end: at, text: words.slice(0, cut).join(' ') || cue.text };
  const right = { ...cue, start: at, text: words.slice(cut).join(' ') || cue.text };
  player.cues.splice(i, 1, left, right);
  timelineMarkDirty(`${i + 1}. blok oynatma noktasında bölündü`);
}

function timelineMergeCue() {
  const i = player.timeline.selected;
  if (i < 0 || i >= player.cues.length - 1) return;
  timelinePushUndo();
  const a = player.cues[i], b = player.cues[i + 1];
  player.cues.splice(i, 2, { ...a, end: b.end, text: `${a.text} ${b.text}`.trim() });
  timelineMarkDirty(`${i + 1}. blok sonrakiyle birleştirildi`);
}

async function saveTimelineCopy() {
  if (!player.cues.length) return;
  const result = await window.api.saveSubtitleCopy(player.subPath || 'altyazi.srt', cuesToSrt(player.cues));
  if (!result || !result.ok) {
    if (!(result && result.canceled)) logLine(`Zamanlama kopyası kaydedilemedi: ${(result && result.error) || 'bilinmeyen hata'}`, 'error');
    return;
  }
  $('timelineDrawer').classList.remove('dirty');
  $('timelineStatus').textContent = `Kopya kaydedildi: ${result.path.split(/[\\/]/).pop()}`;
  logLine(`Düzeltilmiş altyazı kopyası kaydedildi: ${result.path}`, 'success');
}

if (typeof $ === 'function') {
if ($('timelineToggle')) $('timelineToggle').addEventListener('click', () =>
  player.timeline.open ? closeTimeline() : openTimeline());
if ($('timelineClose')) $('timelineClose').addEventListener('click', closeTimeline);
if ($('timelineZoom')) $('timelineZoom').addEventListener('change', drawTimeline);
if ($('timelineBack')) $('timelineBack').addEventListener('click', () => timelineNudge(-.1));
if ($('timelineForward')) $('timelineForward').addEventListener('click', () => timelineNudge(.1));
if ($('timelineSplit')) $('timelineSplit').addEventListener('click', timelineSplitCue);
if ($('timelineMerge')) $('timelineMerge').addEventListener('click', timelineMergeCue);
if ($('timelineSave')) $('timelineSave').addEventListener('click', saveTimelineCopy);
if ($('timelineUndo')) $('timelineUndo').addEventListener('click', () => {
  const prior = player.timeline.undo.pop();
  if (!prior) return;
  player.cues = prior;
  player.timeline.selected = Math.min(player.timeline.selected, player.cues.length - 1);
  $('timelineUndo').disabled = !player.timeline.undo.length;
  timelineMarkDirty('Son zamanlama değişikliği geri alındı');
});

if ($('timelineCanvas')) {
  const canvas = $('timelineCanvas');
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const view = timelineWindow();
    const span = view.end - view.start;
    const x = e.clientX - rect.left;
    const at = view.start + x / rect.width * span;
    const edgeSec = Math.max(.08, span * 8 / rect.width);
    let hit = e.offsetY >= 76 && e.offsetY <= 122
      ? player.cues.findIndex((c) => c.start <= at && c.end >= at) : -1;
    if (hit < 0 && e.offsetY >= 76 && e.offsetY <= 122) {
      hit = player.cues.findIndex((c) => Math.min(Math.abs(at - c.start), Math.abs(at - c.end)) <= edgeSec);
    }
    if (hit < 0) {
      const video = $('playerVideo');
      if (video) video.currentTime = Math.max(0, Math.min(timelineDuration(), at));
      drawTimeline();
      return;
    }
    player.timeline.selected = hit;
    player.activeIdx = hit;
    const cue = player.cues[hit];
    const mode = Math.abs(at - cue.start) <= edgeSec ? 'start'
      : Math.abs(at - cue.end) <= edgeSec ? 'end' : 'move';
    timelinePushUndo();
    player.timeline.drag = { index: hit, mode, x, start: cue.start, end: cue.end,
      center: (cue.start + cue.end) / 2, changed: false };
    canvas.setPointerCapture(e.pointerId);
    drawTimeline();
  });
  canvas.addEventListener('pointermove', (e) => {
    const drag = player.timeline.drag;
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const view = timelineWindow();
    const delta = (e.clientX - rect.left - drag.x) / rect.width * (view.end - view.start);
    const cue = player.cues[drag.index];
    if (!cue) return;
    if (drag.mode === 'start') cue.start = Math.max(0, Math.min(cue.end - .15, drag.start + delta));
    else if (drag.mode === 'end') cue.end = Math.max(cue.start + .15, drag.end + delta);
    else {
      const duration = drag.end - drag.start;
      cue.start = Math.max(0, Math.min(timelineDuration() - duration, drag.start + delta));
      cue.end = cue.start + duration;
    }
    drag.changed = true;
    if ($('timelineStatus')) $('timelineStatus').textContent =
      `${drag.index + 1}. blok · ${pSecToTime(cue.start)} – ${pSecToTime(cue.end)}`;
    drawTimeline();
  });
  const endTimelineDrag = () => {
    const drag = player.timeline.drag;
    if (!drag) return;
    player.timeline.drag = null;
    if (!drag.changed) player.timeline.undo.pop();
    else timelineMarkDirty(`${drag.index + 1}. bloğun zamanlaması değiştirildi`);
    if ($('timelineUndo')) $('timelineUndo').disabled = !player.timeline.undo.length;
  };
  canvas.addEventListener('pointerup', endTimelineDrag);
  canvas.addEventListener('pointercancel', endTimelineDrag);
}
}
if (typeof window !== 'undefined') window.addEventListener('resize', scheduleTimelineDraw);

// ---- geçmiş (kütüphane) ----
// "Bu videoyu daha once cevirmis miydim, hangi modelle, ciktilar nerede?"
// Kayitlar main tarafinda tutulur (userData/history.json) - renderer yeniden
// yuklendiginde de, uygulama kapanip acildiginda da durur.
let historyCache = [];

function historyWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const gun = Math.floor((Date.now() - d.getTime()) / 86400000);
  const saat = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (gun === 0) return `bugün ${saat}`;
  if (gun === 1) return `dün ${saat}`;
  if (gun < 7) return `${gun} gün önce`;
  return d.toLocaleDateString('tr-TR');
}

function historyDur(sec) {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} sa ${m} dk` : `${m || 1} dk`;
}

function historyLine(h) {
  const parts = [];
  if (h.model) parts.push(h.model);
  if (h.engine && h.engine !== 'faster') parts.push(h.engine);
  if (h.perf && h.perf.rtf) parts.push(`${h.perf.rtf}x`);
  if (h.perf && h.perf.mediaSeconds) parts.push(historyDur(h.perf.mediaSeconds));
  if (h.segments) parts.push(`${h.segments} blok`);
  parts.push(historyWhen(h.at));
  return parts.filter(Boolean).join(' · ');
}

function renderHistory() {
  const card = $('historyCard');
  const list = $('historyList');
  if (!card || !list) return;
  const q = ($('historySearch')?.value || '').toLocaleLowerCase('tr');
  const items = q
    ? historyCache.filter((h) => (h.title || '').toLocaleLowerCase('tr').includes(q))
    : historyCache;
  $('historyCount').textContent = String(historyCache.length);
  card.classList.toggle('hidden', historyCache.length === 0);
  list.innerHTML = '';
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'history-empty';
    e.textContent = q ? 'Eşleşen kayıt yok.' : 'Henüz iş yok.';
    list.appendChild(e);
    return;
  }
  items.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'history-item' + (h.ok ? '' : ' error');
    row.dataset.id = h.id;

    const main = document.createElement('div');
    const t = document.createElement('div');
    t.className = 'history-title';
    t.textContent = h.title || 'İsimsiz';
    t.title = h.input || '';
    const m = document.createElement('div');
    m.className = 'history-meta';
    const badge = document.createElement('span');
    badge.className = 'history-badge';
    badge.textContent = h.source === 'youtube' ? 'YouTube' : 'Dosya';
    m.appendChild(badge);
    m.appendChild(document.createTextNode(h.ok ? historyLine(h) : (h.error || 'Hata')));
    main.appendChild(t);
    main.appendChild(m);

    const acts = document.createElement('div');
    acts.className = 'history-actions';
    const mk = (act, label, title, cls) => {
      const b = document.createElement('button');
      b.className = cls || 'link-btn';
      b.dataset.act = act;
      b.textContent = label;
      b.title = title;
      return b;
    };
    if (h.ok && (h.files || []).length) {
      acts.appendChild(mk('play', 'İzle', 'Videoyu ve bu işin altyazısını oynatıcıda aç'));
      acts.appendChild(mk('folder', 'Klasör', 'Çıktı klasörünü aç'));
    }
    acts.appendChild(mk('del', '×', 'Bu kaydı listeden sil (dosyalar silinmez)'));
    row.appendChild(main);
    row.appendChild(acts);
    list.appendChild(row);
  });
}

async function refreshHistory() {
  try {
    historyCache = (await window.api.listHistory()) || [];
  } catch (_) {
    historyCache = [];
  }
  renderHistory();
}

// ---- izleme kütüphanesi ----
// İş geçmişi yalnızca çıktı üretimini anlatır. Bu katman gerçek izleme davranışını
// tutar: kaldığın yer, video bazlı tercihler, koleksiyon ve altyazı içi arama.
let watchLibraryCache = [];
let playerLibraryResults = [];
let playerLibrarySearchTimer = null;

function watchProgress(item) {
  const d = Number(item && item.duration) || 0;
  const t = Number(item && item.position) || 0;
  return d > 0 ? Math.max(0, Math.min(100, (t / d) * 100)) : 0;
}

function watchCompletionReached(position, duration) {
  const d = Number(duration) || 0;
  const t = Number(position) || 0;
  if (d <= 0 || !isFinite(d)) return false;
  // Uzun videolarda son 30 saniye, kisa videolarda ise son %10. Eski
  // `duration - 30` kosulu 30 saniyeden kisa her videoyu 0:00'da bitmis
  // sayiyordu.
  const margin = Math.min(30, d * 0.1);
  return t >= d - margin;
}

function watchItemByKey(key) {
  return watchLibraryCache.find((item) => item.key === key) || null;
}

function syncPlayerSpeedControl(rawRate) {
  const select = $('playerSpeed');
  const parsed = Number(rawRate);
  if (!select || !Number.isFinite(parsed) || parsed <= 0) return null;
  const rate = Math.max(.25, Math.min(4, parsed));
  let exact = Array.from(select.options).find((option) => Math.abs(Number(option.value) - rate) < 1e-6);
  for (const option of Array.from(select.options)) {
    if (option.dataset && option.dataset.customRate === 'true' && option !== exact) option.remove();
  }
  if (!exact) {
    exact = document.createElement('option');
    exact.value = String(rate);
    exact.textContent = `${Number(rate.toFixed(3))}×`;
    exact.dataset.customRate = 'true';
    select.appendChild(exact);
  }
  select.value = exact.value;
  return rate;
}

function steppedPlaybackRate(options, currentRate, direction) {
  const current = Number(currentRate);
  const rates = [...new Set(Array.from(options || [])
    .map((option) => Number(option && option.value !== undefined ? option.value : option))
    .filter((rate) => Number.isFinite(rate) && rate > 0)
    .concat(Number.isFinite(current) && current > 0 ? [current] : []))]
    .sort((a, b) => a - b);
  if (!rates.length) return 1;
  let index = rates.findIndex((rate) => Math.abs(rate - current) < 1e-6);
  if (index < 0) index = rates.reduce((best, rate, i) => (
    Math.abs(rate - current) < Math.abs(rates[best] - current) ? i : best), 0);
  return rates[Math.max(0, Math.min(rates.length - 1, index + Math.sign(direction || 0)))];
}

function captureWatchPrefs() {
  const video = $('playerVideo');
  const browserMode = player.workspaceMode === 'browser';
  return {
    speed: browserMode ? player.browserRate : (video ? video.playbackRate : 1),
    volume: browserMode ? player.browserVolume : (video ? video.volume : 1),
    muted: browserMode ? player.browserMuted : (video ? video.muted : false),
    viewMode: player.viewMode,
    offset: player.offset,
    autoPause: player.autoPause,
    autoFollow: player.autoFollow,
    showSource: $('showSource') ? $('showSource').checked : true,
    showTranslation: $('showTranslation') ? $('showTranslation').checked : true,
    mergeContinuation: !!player.mergeCont,
    subStyle: player.subStyle ? { ...player.subStyle } : null,
    subBottom: player.subBottom,
    sub2Top: player.sub2Top,
    selectedSubPath: player.subPath || '',
    secondSubPath: player.sub2Path || '',
    audioLang: $('playerAudioLang') ? $('playerAudioLang').value : '',
  };
}

function beginWatchSession() {
  if (!player.mediaKey) return;
  const video = $('playerVideo');
  const position = player.workspaceMode === 'browser'
    ? Number(player.browserTime) || 0
    : (video ? Number(video.currentTime) || 0 : 0);
  const now = Date.now();
  player.watchSession = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now,
    endedAt: now,
    watchSeconds: 0,
    startPosition: position,
    endPosition: position,
    lastClock: 0,
  };
}

function currentWatchPatch(completed) {
  const video = $('playerVideo');
  const browserMode = player.workspaceMode === 'browser' && player.mediaKey.startsWith('browser:');
  if (!player.mediaKey || (!browserMode && (!video || player.isLive))) return null;
  if (player.watchRemovedKey === player.mediaKey) return null;
  const duration = browserMode ? Number(player.browserDuration) : Number(video.duration);
  if (!duration || !isFinite(duration)) return null;
  const position = completed ? duration : (browserMode ? Number(player.browserTime) : Number(video.currentTime)) || 0;
  const session = player.watchSession ? { ...player.watchSession, endedAt: Date.now(), endPosition: position } : null;
  if (session) delete session.lastClock;
  const manualCompleted = player.watchManualCompletedKey === player.mediaKey
    ? player.watchManualCompleted : null;
  return {
    key: player.mediaKey,
    type: browserMode ? 'browser' : (player.mediaKey.startsWith('youtube:') ? 'youtube' : 'local'),
    title: $('playerTitle') ? $('playerTitle').textContent : '',
    sourceRef: browserMode ? browserPlaceKey(player.browserPageUrl) : player.mediaKey.startsWith('youtube:')
      ? ((player.ytInfo && player.ytInfo.sourceUrl) || player.originalUrl || '')
      : player.localPath,
    localPath: player.localPath || '',
    duration: Math.round(duration),
    position: Math.round(position),
    completed: manualCompleted === null
      ? (!!completed || watchCompletionReached(position, duration)) : manualCompleted,
    lastWatched: Date.now(),
    subtitlePaths: [player.subPath, player.sub2Path, ...player.subtitles.map((s) => s.path)].filter(Boolean),
    prefs: captureWatchPrefs(),
    session,
  };
}

async function flushWatchState(completed = false, refresh = false) {
  const patch = currentWatchPatch(completed);
  if (!patch || !window.api.updateWatchItem) return;
  try {
    const res = await window.api.updateWatchItem(patch);
    if (res && res.ok && res.item) {
      const i = watchLibraryCache.findIndex((x) => x.key === res.item.key);
      if (i >= 0) watchLibraryCache.splice(i, 1);
      watchLibraryCache.unshift(res.item);
      if (refresh) renderPlayerLibrary();
    }
  } catch (_) {}
}

async function restoreWatchProfile(key) {
  const gen = currentGeneration();
  let item = watchItemByKey(key);
  if (!item && window.api.listWatchLibrary) {
    try {
      const loaded = (await window.api.listWatchLibrary()) || [];
      if (staleGeneration(gen) || player.mediaKey !== key) return;
      watchLibraryCache = loaded;
      item = watchItemByKey(key);
    } catch (_) {}
  }
  // Kutuphane okumasi surerken baska videoya gecilmis olabilir. Eski videonun
  // hizi, sesi ve altyazisi yeni videoya uygulanmasin.
  if (!item || staleGeneration(gen) || player.mediaKey !== key) return;
  const prefs = item.prefs || {};
  const video = $('playerVideo');
  const browserMode = player.workspaceMode === 'browser' && key.startsWith('browser:');
  if (browserMode && window.api.browserCommand) {
    const stillCurrent = () => !staleGeneration(gen) && player.mediaKey === key;
    if (prefs.speed) {
      await window.api.browserCommand('speed', Math.max(.25, Math.min(4, Number(prefs.speed) || 1))).catch(() => null);
      if (!stillCurrent()) return;
    }
    if (prefs.volume !== undefined) {
      const target = Math.max(0, Math.min(1, Number(prefs.volume)));
      await window.api.browserCommand('volume-set', target).catch(() => null);
      if (!stillCurrent()) return;
    }
    if (prefs.muted !== undefined && !!prefs.muted !== player.browserMuted) {
      await window.api.browserCommand('mute').catch(() => null);
      if (!stillCurrent()) return;
    }
  } else {
    if (video && prefs.speed) video.playbackRate = Math.max(.25, Math.min(4, Number(prefs.speed) || 1));
    if (video && prefs.volume !== undefined) video.volume = Math.max(0, Math.min(1, Number(prefs.volume)));
    if (video && prefs.muted !== undefined) video.muted = !!prefs.muted;
  }
  if (prefs.speed) syncPlayerSpeedControl(prefs.speed);
  if ($('playerVolume') && prefs.volume !== undefined) {
    $('playerVolume').value = String(Math.round(Number(prefs.volume) * 100));
    syncVolumeFill();
  }
  if (prefs.viewMode && !browserMode) setViewMode(prefs.viewMode);
  if (prefs.offset !== undefined) {
    player.offset = Number(prefs.offset) || 0;
    if ($('subOffset')) $('subOffset').value = String(player.offset);
    if ($('subOffsetVal')) $('subOffsetVal').textContent = player.offset.toFixed(1);
  }
  const checks = [
    ['autoPauseCue', 'autoPause'], ['autoFollow', 'autoFollow'],
    ['showSource', 'showSource'], ['showTranslation', 'showTranslation'],
    ['playerMergeCont', 'mergeContinuation'],
  ];
  checks.forEach(([id, name]) => {
    if (prefs[name] === undefined || !$(id)) return;
    $(id).checked = !!prefs[name];
    $(id).dispatchEvent(new Event('change'));
  });
  if (prefs.subStyle && typeof prefs.subStyle === 'object') {
    player.subStyle = { ...SUB_STYLE_DEFAULTS, ...prefs.subStyle };
    applySubtitleStyle();
  }
  if (prefs.subBottom !== undefined) player.subBottom = prefs.subBottom;
  if (prefs.sub2Top !== undefined) player.sub2Top = prefs.sub2Top;
  applySubtitlePos();
  if (prefs.audioLang && $('playerAudioLang') && !browserMode) $('playerAudioLang').value = prefs.audioLang;
  const remembered = [prefs.selectedSubPath, prefs.secondSubPath].filter(Boolean);
  remembered.forEach((p) => addSubtitleOption(p));
  if (prefs.selectedSubPath) {
    $('playerSubSelect').value = prefs.selectedSubPath;
    await loadSubtitle(prefs.selectedSubPath);
    if (staleGeneration(gen) || player.mediaKey !== key) return;
  }
  if (prefs.secondSubPath) {
    $('playerSubSelect2').value = prefs.secondSubPath;
    await loadSubtitle(prefs.secondSubPath, true);
    if (staleGeneration(gen) || player.mediaKey !== key) return;
  }
}

function makeWatchAction(label, action, key, extra) {
  const button = document.createElement('button');
  button.className = 'link-btn';
  button.textContent = label;
  button.dataset.watchAction = action;
  button.dataset.key = key;
  if (extra !== undefined) button.dataset.seconds = String(extra);
  return button;
}

function renderPlayerLibrary() {
  const panel = $('playerLibraryPanel');
  const list = $('playerLibraryList');
  const status = $('playerLibraryStatus');
  if (!panel || !list || !status) return;
  const searching = !!($('playerLibrarySearch') && $('playerLibrarySearch').value.trim());
  const filter = $('playerLibraryFilter') ? $('playerLibraryFilter').value : 'all';
  let items = searching ? playerLibraryResults : watchLibraryCache;
  if (filter === 'continue') items = items.filter((x) => !x.completed && watchProgress(x) > 0);
  else if (filter === 'completed') items = items.filter((x) => x.completed);
  else if (filter.startsWith('collection:')) items = items.filter((x) => (x.collections || []).includes(filter.slice(11)));
  const matches = items.reduce((sum, item) => sum + (item.matches || []).length, 0);
  status.textContent = !watchLibraryCache.length
    ? 'Bir video oynattığında kaldığın yer burada görünecek.'
    : searching ? `${items.length} video · ${matches} altyazı eşleşmesi`
      : `${items.length} video · ${watchLibraryCache.filter((x) => !x.completed && watchProgress(x) > 0).length} devam eden`;
  list.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'player-library-empty';
    empty.textContent = searching ? 'Aramana uyan video veya altyazı bulunamadı.' : 'Bu filtrede video yok.';
    list.appendChild(empty);
  }
  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'player-library-item';
    const head = document.createElement('div');
    head.className = 'player-library-item-head';
    const title = document.createElement('strong');
    title.textContent = item.title || 'İsimsiz video';
    const time = document.createElement('span');
    time.textContent = item.completed ? 'Tamamlandı' : `${pSecToTime(item.position || 0)} / ${pSecToTime(item.duration || 0)}`;
    head.append(title, time);
    const progress = document.createElement('div');
    progress.className = 'watch-progress';
    const fill = document.createElement('i');
    fill.style.width = `${watchProgress(item)}%`;
    progress.appendChild(fill);
    const meta = document.createElement('div');
    meta.className = 'player-library-meta';
    meta.textContent = [item.type === 'youtube' ? 'YouTube' : item.type === 'browser' ? 'Web' : 'Yerel', historyWhen(item.lastWatched), ...(item.collections || [])].join(' · ');
    const hits = document.createElement('div');
    hits.className = 'player-library-hits';
    (item.matches || []).forEach((match) => {
      const hit = makeWatchAction(`${pSecToTime(match.seconds)} · ${match.snippet}`, 'hit', item.key, match.seconds);
      hit.className = 'watch-hit';
      hits.appendChild(hit);
    });
    const actions = document.createElement('div');
    actions.className = 'player-library-actions';
    actions.append(
      makeWatchAction(item.completed ? 'Baştan izle' : 'Devam et', item.completed ? 'restart' : 'open', item.key, item.completed ? 0 : item.position || 0),
      makeWatchAction('Koleksiyon', 'collection', item.key),
      makeWatchAction('Kaldır', 'remove', item.key),
    );
    row.append(head, progress, meta);
    if (hits.childElementCount) row.appendChild(hits);
    row.appendChild(actions);
    list.appendChild(row);
  });
  updateCollectionOptions();
}

function updateCollectionOptions() {
  const names = [...new Set(watchLibraryCache.flatMap((x) => x.collections || []))].sort((a, b) => a.localeCompare(b, 'tr'));
  ['playerLibraryFilter'].forEach((id) => {
    const select = $(id);
    if (!select) return;
    const current = select.value;
    [...select.options].slice(3).forEach((o) => o.remove());
    names.forEach((name) => {
      const option = document.createElement('option');
      option.value = `collection:${name}`;
      option.textContent = name;
      select.appendChild(option);
    });
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  });
}

async function refreshWatchLibrary() {
  player.playerLibrarySearchSeq++;
  try { watchLibraryCache = (await window.api.listWatchLibrary()) || []; }
  catch (_) { watchLibraryCache = []; }
  playerLibraryResults = watchLibraryCache;
  renderPlayerLibrary();
}

async function setLocalPlaylistAround(filePath, explicitFiles, intent) {
  let files = Array.isArray(explicitFiles) && explicitFiles.length ? explicitFiles.slice() : [];
  if (!files.length && window.api.listMediaFolder) {
    try { files = (await window.api.listMediaFolder(filePath)) || []; } catch (_) {}
  }
  if (intent !== undefined && intent !== player.openIntent) return false;
  player.playlist = files;
  player.playlistIndex = files.findIndex((p) => mediaKeyFor('local', p) === mediaKeyFor('local', filePath));
  updatePlaylistButtons();
  return true;
}

function updatePlaylistButtons() {
  const prev = $('playerPrevMedia');
  const next = $('playerNextMedia');
  if (prev) prev.disabled = player.playlistIndex <= 0;
  if (next) next.disabled = player.playlistIndex < 0 || player.playlistIndex >= player.playlist.length - 1;
}

async function openLocalMedia(filePath, seconds, explicitFiles) {
  if (!filePath) return;
  const intent = ++player.openIntent;
  player.probeRequestSeq++;
  player.pendingAutoOpen = null;
  $('playerLayer').classList.remove('hidden');
  $('playerVideoPath').textContent = filePath;
  const playlistReady = await setLocalPlaylistAround(filePath, explicitFiles, intent);
  // Klasor taramasi surerken baska bir kaynak acildiysa gec kalan A istegi B'yi
  // tekrar ezmesin.
  if (!playlistReady || intent !== player.openIntent) return;
  setPlayerSource(pathToFileUrl(filePath), filePath.split(/[\\/]/).pop(), mediaKeyFor('local', filePath), { localPath: filePath });
  player.pendingLibrarySeek = {
    key: player.mediaKey,
    generation: currentGeneration(),
    seconds: Number(seconds) || 0,
  };
  attachSiblingSubtitles(filePath);
}

async function openWatchLibraryItem(item, seconds) {
  if (!item) return;
  if (item.type === 'browser') {
    $('playerLayer').classList.remove('hidden');
    setWorkspaceMode('browser');
    if ($('browserAddress')) $('browserAddress').value = item.sourceRef || '';
    const result = await navigateBrowserFromAddress();
    if (result && result.ok && player.mediaKey === item.key) {
      player.pendingLibrarySeek = { key: item.key, generation: currentGeneration(), seconds: Number(seconds) || 0 };
    }
  } else if (item.type === 'youtube') {
    const intent = ++player.openIntent;
    $('playerLayer').classList.remove('hidden');
    player.pendingLibrarySeek = { key: item.key, generation: null, seconds: Number(seconds) || 0 };
    player.pendingAutoOpen = { key: item.key, intent };
    openYoutubePanelAndProbe(item.sourceRef);
  } else {
    openLocalMedia(item.localPath || item.sourceRef, seconds);
  }
}

function openHistoryItem(h) {
  const subs = (h.files || []).filter((f) => /\.(srt|vtt|ass|ssa)$/i.test(f));
  if (h.source === 'youtube') {
    const intent = ++player.openIntent;
    // Yayin acilinca altyazi baglansin diye ONCE bekleyen listeye koy.
    player.pendingSubs = { key: mediaKeyFor('youtube', h.input), files: subs };
    player.pendingAutoOpen = { key: mediaKeyFor('youtube', h.input), intent };
    $('playerLayer').classList.remove('hidden');
    openYoutubePanelAndProbe(h.input);
    logLine('YouTube videosu ve bu işin altyazısı hazırlanıyor.', 'info');
    return;
  }
  state.lastJobVideo = h.video || null;
  state.outputFiles = (h.files || []).slice();
  openPlayer();
}

// ---- izlerken cumle birlestirme (CANLI) ----
// Backend'deki merge_continuation_lines ile AYNI kurallar, ama burada yuklu
// altyaziya aninda uygulanir ve DOSYA degismez. Oynatirken acip kapatarak
// farki gorebilmek icin ham hali saklanir.
const CONT_MARKS = ['…', '...'];

function stripCont(t, atStart) {
  let s = String(t || '').trim();
  for (;;) {
    if (atStart && s.startsWith('...')) s = s.slice(3).trimStart();
    else if (atStart && s.startsWith('…')) s = s.slice(1).trimStart();
    else if (!atStart && s.endsWith('...')) s = s.slice(0, -3).trimEnd();
    else if (!atStart && s.endsWith('…')) s = s.slice(0, -1).trimEnd();
    else return s;
  }
}

function endsSentence(t) {
  return /[.!?…。！？]["'”’)\]]*$/.test(String(t || '').trim());
}

function mergeCueContinuation(cues, maxGap = 3.0) {
  if (!Array.isArray(cues) || cues.length < 2) return cues;
  const DIALOG = ['-', '—', '–', '[', '(', '♪', '*'];
  const out = [];
  for (const c of cues) {
    const txt = String(c.text || '').trim();
    if (!txt) continue;
    if (!out.length) { out.push({ ...c, text: txt }); continue; }
    const prev = out[out.length - 1];
    const gap = c.start - prev.end;
    const devam = CONT_MARKS.some((m) => txt.startsWith(m))
      || CONT_MARKS.some((m) => prev.text.endsWith(m));
    const yarim = !endsSentence(prev.text);
    const kuyruk = stripCont(txt, true);
    const birlesik = `${stripCont(prev.text, false)} ${kuyruk}`.trim();
    const kisaKuyruk = kuyruk.length <= 45;
    const ustKrk = kisaKuyruk ? 170 : 120;
    const ustSure = kisaKuyruk ? 13 : 10;
    if ((devam || yarim)
        && !DIALOG.some((d) => txt.startsWith(d))
        && !DIALOG.some((d) => prev.text.startsWith(d))
        && gap >= -0.05 && gap <= maxGap
        && birlesik.length <= ustKrk
        && (c.end - prev.start) <= ustSure) {
      prev.end = c.end;
      prev.text = birlesik;
    } else {
      out.push({ ...c, text: txt });
    }
  }
  return out;
}

function resetCueRaw() {
  player.cuesRaw = null;
  player.cues2Raw = null;
  player.cueQualitySource = [];
}

function applyCueMerge() {
  const on = !!player.mergeCont;
  if (!player.cuesRaw) player.cuesRaw = player.cues;
  if (!player.cues2Raw) player.cues2Raw = player.cues2;
  player.cues = on ? mergeCueContinuation(player.cuesRaw) : player.cuesRaw;
  player.cues2 = on ? mergeCueContinuation(player.cues2Raw) : player.cues2Raw;
  player.activeIdx = -1;
  player.activeIdx2 = -1;
  renderCueList();
  renderCue();
  updateCueMeta();
  scheduleBrowserOverlaySync();
}

// ---- AI sohbet (yan panel sekmesi) ----
// --explain sabit uc soru turuyle sinirliydi; burada kullanici ne isterse
// sorabiliyor ve konusma cok turlu ilerliyor. Baglam yine RAG'siz: o anki
// satir, cevirisi, komsulari, zaman ve video basligi zaten elimizde.
const AI_CHAT_CTX = 3;             // kac onceki/sonraki satir gonderilsin

function aiChatContext() {
  const cues = player.cues || [];
  const now = (player.workspaceMode === 'browser'
    ? player.browserTime : (($('playerVideo') || {}).currentTime || 0)) - player.offset;
  let i = player.activeIdx;
  if (i < 0 && cues.length) {
    i = cues.length - 1;
    while (i >= 0 && cues[i].end > now) i--;
  }
  const ctx = {
    video: (document.getElementById('playerTitle') || {}).textContent || '',
    zaman: pSecToTime(player.workspaceMode === 'browser'
      ? player.browserTime : (($('playerVideo') || {}).currentTime || 0)),
  };
  if (i >= 0 && cues[i]) {
    ctx.cumle = cues[i].text;
    ctx.mevcut_ceviri = translationFor(cues[i]) || '';
    ctx.onceki = cues.slice(Math.max(0, i - AI_CHAT_CTX), i)
      .map((c) => ({ zaman: pSecToTime(c.start), metin: c.text }));
    ctx.sonraki = cues.slice(i + 1, i + 1 + AI_CHAT_CTX)
      .map((c) => ({ zaman: pSecToTime(c.start), metin: c.text }));
  } else if (cues.length) {
    ctx.not = 'Su an aktif bir altyazi satiri yok.';
  } else {
    ctx.not = 'Bu video icin yuklu altyazi yok.';
  }
  return ctx;
}

function aiChatCtxLabel() {
  const el = $('aiChatCtx');
  if (!el) return;
  const now = (player.workspaceMode === 'browser'
    ? player.browserTime : (($('playerVideo') || {}).currentTime || 0)) - player.offset;
  let i = player.activeIdx;
  if (i < 0 && player.cues.length) {
    i = player.cues.length - 1;
    while (i >= 0 && player.cues[i].end > now) i--;
  }
  el.textContent = (i >= 0 && player.cues[i])
    ? `Bağlam: ${pSecToTime(player.cues[i].start)} · ${player.cues[i].text.slice(0, 46)}`
    : 'Bağlam: altyazı yok — genel soru sorabilirsin';
}

function aiTimeToSeconds(value) {
  const parts = String(value || '').split(':').map(Number);
  if (parts.some((n) => !isFinite(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function renderAiText(el, text) {
  if (!el) return;
  el.textContent = '';
  const raw = String(text || '');
  const re = /(^|[^\d])((?:\d{1,2}:)?[0-5]?\d:[0-5]\d)(?!\d)/g;
  let last = 0, match;
  while ((match = re.exec(raw))) {
    const prefixEnd = match.index + match[1].length;
    el.appendChild(document.createTextNode(raw.slice(last, prefixEnd)));
    const seconds = aiTimeToSeconds(match[2]);
    if (seconds === null) {
      el.appendChild(document.createTextNode(match[2]));
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-time-link';
      button.textContent = match[2];
      button.title = `${match[2]} konumuna git`;
      button.addEventListener('click', () => {
        const video = $('playerVideo');
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(Number(video.duration) || seconds, seconds));
        showControls();
        renderCue();
      });
      el.appendChild(button);
    }
    last = re.lastIndex;
  }
  el.appendChild(document.createTextNode(raw.slice(last)));
}

function aiChatAdd(role, text, cls) {
  const log = $('aiChatLog');
  if (!log) return null;
  const bos = $('aiChatEmpty');
  if (bos) bos.classList.add('hidden');
  const d = document.createElement('div');
  d.className = `ai-msg ai-msg-${role}${cls ? ' ' + cls : ''}`;
  if (role === 'ai' && !cls?.includes('is-loading')) renderAiText(d, text);
  else d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

async function aiChatSend(soru) {
  const q = String(soru || '').trim();
  if (!q) return;
  if (state.running || state.queueRunning) {
    aiChatAdd('ai', 'Şu an başka bir iş çalışıyor — bitmesini bekleyin.', 'ai-msg-err');
    return;
  }
  const opts = buildOptsFromUI();
  opts.translate = true;                      // anahtar dogrulamasi icin
  // KOPYA gonderilir: asagida ayni diziye yeni soru ekleniyor; referans
  // gecilseydi soru modele hem 'gecmis'in son turu hem de 'soru' olarak
  // IKI KEZ giderdi.
  opts.chat = { question: q, history: (player.chatHistory || []).slice(), context: aiChatContext() };
  opts.input = player.subPath || 'chat';      // argparse girdi bekliyor; sohbette kullanilmaz
  delete opts.youtube;
  if (!opts.translateApiKey) {
    aiChatAdd('ai', 'Çeviri/AI için API anahtarı gerekli: Gelişmiş ayarlar → Çeviri → API Key.', 'ai-msg-err');
    return;
  }

  aiChatAdd('user', q);
  const bekleyen = aiChatAdd('ai', 'Düşünüyor…', 'is-loading');
  $('aiChatText').value = '';
  autoGrowChatBox();

  player.chatHistory = player.chatHistory || [];
  player.chatHistory.push({ role: 'user', content: q });
  state.running = true;
  state.aiJob = true;
  player.job = { running: true, mediaKey: player.mediaKey, kind: 'chat', bubble: bekleyen };

  const r = await startTranscribeSafe(opts);
  if (!r || !r.ok) {
    state.running = false;
    state.aiJob = false;
    player.job = null;
    bekleyen.classList.remove('is-loading');
    bekleyen.classList.add('ai-msg-err');
    bekleyen.textContent = (r && r.error) || 'Cevap alınamadı.';
  }
}

function autoGrowChatBox() {
  const t = $('aiChatText');
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(120, t.scrollHeight) + 'px';
}

function setSideTab(tab) {
  const ai = tab === 'ai';
  const library = tab === 'library';
  $('playerSide').classList.toggle('ai-mode', ai);
  $('playerSide').classList.toggle('library-mode', library);
  $('aiChat').classList.toggle('hidden', !ai);
  if ($('playerLibraryPanel')) $('playerLibraryPanel').classList.toggle('hidden', !library);
  $$('.side-tab').forEach((b) => {
    const on = b.dataset.stab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (ai) { aiChatCtxLabel(); $('aiChatText')?.focus(); }
  if (library) {
    refreshWatchLibrary();
    $('playerLibrarySearch')?.focus();
  }
}

// ---- bağlamlı AI açıklaması ----
// RAG/embedding YOK: dogru baglam zaten elimizde (blogun kendisi, komsulari,
// mevcut cevirisi, zamani). Uzun videoda tum transcript'i modele gondermek hem
// pahali hem gereksiz. Model KAYNAK metni ve MEVCUT CEVIRIYI birlikte gorur -
// yalnizca Turkceyi gorseydi ceviri hatasini gercek bilgi sanabilirdi.
function showAiAnswer(title, text, loading) {
  const box = $('aiAnswer');
  if (!box) return;
  box.classList.remove('hidden');
  $('aiAnswerTitle').textContent = title;
  const body = $('aiAnswerBody');
  if (loading) body.textContent = text;
  else renderAiText(body, text);
  body.classList.toggle('is-loading', !!loading);
  const panel = $('wordInspector');
  if (panel) panel.classList.remove('hidden');
}

function explainCacheKey(kind, index, word) {
  return `${player.subPath}|${kind}|${index}|${word || ''}`;
}

async function askExplain(kind, index, word) {
  if (!player.subPath || !player.cues.length) {
    logLine('Önce bir altyazı yükleyin.', 'error');
    return;
  }
  if (state.running || state.queueRunning) {
    logLine('Zaten bir iş çalışıyor — bitmesini bekleyin.', 'warn');
    return;
  }
  const key = explainCacheKey(kind, index, word);
  player.explainCache = player.explainCache || {};
  if (player.explainCache[key]) {                 // ayni soruyu tekrar sorma
    showAiAnswer(EXPLAIN_TITLES[kind] || 'AI', player.explainCache[key]);
    return;
  }
  const opts = buildOptsFromUI();
  opts.explain = true;
  opts.explainIndex = index;
  opts.explainKind = kind;
  opts.explainWord = word || '';
  opts.input = player.subPath;
  opts.explainTranslation = player.sub2Path || '';
  opts.translate = true;                          // anahtar dogrulamasi icin
  delete opts.youtube;
  const problem = optsProblem(opts);
  if (problem) { logLine(problem, 'error'); setSettingsDrawer(true); return; }

  state.running = true;
  state.aiJob = true;
  player.job = { running: true, mediaKey: player.mediaKey, kind: 'explain',
                 explainKey: key, explainTitle: EXPLAIN_TITLES[kind] || 'AI' };
  showAiAnswer(EXPLAIN_TITLES[kind] || 'AI', 'Düşünüyor…', true);
  const r = await startTranscribeSafe(opts);
  if (!r || !r.ok) {
    state.running = false;
    state.aiJob = false;
    player.job = null;
    showAiAnswer('Hata', (r && r.error) || 'Açıklama alınamadı.');
  }
}

const EXPLAIN_TITLES = {
  sentence: 'Cümle açıklaması',
  word: 'Kelime açıklaması',
  better: 'Çeviri değerlendirmesi',
};

// ---- ortam ışığı (ambient) ----
// Videonun 32x18'lik kucuk bir kopyasi arkaya cizilir ve CSS ile asiri
// bulaniklastirilip buyutulur; boylece renk siyah kenarlara tasar. Maliyeti
// ihmal edilebilir (saniyede ~4 kare, 576 piksel).
function startAmbient() {
  stopAmbient();
  const cv = $('ambientGlow');
  const v = $('playerVideo');
  const stage = $('playerStage');
  if (!cv || !v || !stage || !player.ambientOn) return;
  const ctx = cv.getContext('2d', { willReadFrequently: false });
  ctx.clearRect(0, 0, cv.width, cv.height);
  stage.classList.add('ambient-on');
  const paint = () => {
    if (v.paused || v.readyState < 2 || !v.videoWidth) return;
    try { ctx.drawImage(v, 0, 0, cv.width, cv.height); } catch (_) {}
  };
  // Oynatma olayı ilk gerçek kareden hemen önce gelebilir. Hazır kare varsa
  // gecikmeden çiz; ardından düşük maliyetli 4 fps güncelleme sürsün.
  paint();
  player.ambientTimer = setInterval(paint, 250);
}

function stopAmbient() {
  clearInterval(player.ambientTimer);
  player.ambientTimer = null;
  const stage = $('playerStage');
  if (stage) stage.classList.remove('ambient-on');
  const cv = $('ambientGlow');
  if (cv) {
    const ctx = cv.getContext('2d', { willReadFrequently: false });
    try { ctx.clearRect(0, 0, cv.width, cv.height); } catch (_) {}
  }
}

function setAmbient(on) {
  player.ambientOn = !!on;
  try { localStorage.setItem('ambientMode', on ? '1' : '0'); } catch (_) {}
  if (on) startAmbient(); else stopAmbient();
}

// ---- sağda basılı tutunca hızlan (YouTube'daki gibi) ----
// Sahnenin SAG YARISINDA basili tutulunca oynatma 2x olur, birakinca eski
// hizina doner. Kisa tiklama etkilenmez (oynat/duraklat calismaya devam eder).
function bindHoldToSpeed() {
  const stage = $('playerStage');
  const v = $('playerVideo');
  if (!stage || !v) return;
  let timer = null;
  let prevRate = 1;
  let active = false;

  const stop = () => {
    clearTimeout(timer);
    timer = null;
    if (active) {
      active = false;
      v.playbackRate = prevRate;
      stage.classList.remove('holding');
      player.suppressClick = true;          // birakinca duraklatma tetiklenmesin
      setTimeout(() => { player.suppressClick = false; }, 120);
    }
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !player.holdSpeed || player.editing) return;
    // Kontrol cubugu, altyazi ve panellerde degil; YALNIZCA videonun sag yarisi
    if (e.target.closest('.player-controls, .subtitle-overlay, .settings-drawer, .shortcut-help')) return;
    const r = stage.getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) return;
    if (v.paused) return;                   // duraklatilmisken anlamsiz
    timer = setTimeout(() => {
      active = true;
      prevRate = v.playbackRate;
      v.playbackRate = 2;
      stage.classList.add('holding');
      showControls();
    }, 350);                                 // 350 ms basili tutunca devreye girer
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
    stage.addEventListener(ev, stop);
  });
}

// ---- ekran bildirimi (OSD) ----
// Klavyeyle yapilan degisiklikler (hiz, ses, gecikme) icin gorsel geri bildirim:
// gunluge bakmak zorunda kalmadan ne oldugunu goruyorsun.
function osd(text, ms) {
  const el = $('playerOsd');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(player.osdTimer);
  player.osdTimer = setTimeout(() => el.classList.remove('show'), ms || 900);
}

// ---- A-B döngüsü ----
// Bir cumleyi/bolumu tekrar tekrar dinlemek icin (dil calismasi, zor aksan).
function toggleAbLoop() {
  const v = $('playerVideo');
  if (!v) return;
  const currentTime = player.workspaceMode === 'browser' ? player.browserTime : v.currentTime;
  if (player.abA === null) {
    player.abA = currentTime;
    osd(`A: ${pSecToTime(player.abA)}`);
  } else if (player.abB === null) {
    const b = currentTime;
    if (b <= player.abA + 0.2) { osd('B, A’dan sonra olmalı'); return; }
    player.abB = b;
    osd(`A-B döngüsü: ${pSecToTime(player.abA)} → ${pSecToTime(player.abB)}`, 1400);
  } else {
    player.abA = null;
    player.abB = null;
    osd('A-B döngüsü kapalı');
  }
  renderAbMarkers();
  const btn = $('abLoopBtn');
  if (btn) btn.classList.toggle('active', player.abA !== null);
}

function renderAbMarkers() {
  const box = $('seekMarkers');
  const v = $('playerVideo');
  const duration = player.workspaceMode === 'browser' ? player.browserDuration : (v && v.duration);
  if (!box || !v || !duration) return;
  box.querySelectorAll('.ab-marker, .ab-range').forEach((e) => e.remove());
  const pct = (t) => (t / duration) * 100;
  if (player.abA !== null) {
    const a = document.createElement('div');
    a.className = 'ab-marker';
    a.style.left = `${pct(player.abA)}%`;
    box.appendChild(a);
  }
  if (player.abA !== null && player.abB !== null) {
    const r = document.createElement('div');
    r.className = 'ab-range';
    r.style.left = `${pct(player.abA)}%`;
    r.style.width = `${pct(player.abB) - pct(player.abA)}%`;
    box.appendChild(r);
    const b = document.createElement('div');
    b.className = 'ab-marker';
    b.style.left = `${pct(player.abB)}%`;
    box.appendChild(b);
  }
}

// ---- ekran görüntüsü ----
// Videonun o anki karesini + ekrandaki altyaziyi PNG olarak kaydeder.
async function capturePlayerFrame() {
  const v = $('playerVideo');
  if (!v || !v.videoWidth) { logLine('Ekran görüntüsü için önce video yüklensin.', 'warn'); return; }
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const ctx = c.getContext('2d');
  try {
    ctx.drawImage(v, 0, 0, c.width, c.height);
  } catch (err) {
    logLine(`Ekran görüntüsü alınamadı: ${(err && err.message) || 'video karesi okunamadı'}`, 'error');
    return;
  }

  // Altyaziyi da cizelim (goruntude gorunsun)
  const text = player.subsHidden ? '' : (player.activeIdx >= 0 && player.cues[player.activeIdx]
    ? player.cues[player.activeIdx].text : '');
  if (text) {
    const st = player.subStyle || {};
    const size = Math.round(c.height * 0.055);
    ctx.font = `${st.weight || 600} ${size}px ${'Segoe UI, system-ui, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const lines = String(text).split(/\n/);
    let y = c.height - Math.round(c.height * 0.06);
    for (let i = lines.length - 1; i >= 0; i--) {
      const w = ctx.measureText(lines[i]).width;
      if ((st.bg || 0) > 0) {
        ctx.fillStyle = `rgba(0,0,0,${(st.bg / 100).toFixed(2)})`;
        ctx.fillRect(c.width / 2 - w / 2 - 14, y - size - 6, w + 28, size + 14);
      }
      ctx.lineWidth = Math.max(2, size * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(lines[i], c.width / 2, y);
      ctx.fillStyle = st.color || '#fff';
      ctx.fillText(lines[i], c.width / 2, y);
      y -= size * (st.lineHeight || 1.35);
    }
  }

  let dataUrl;
  try {
    dataUrl = c.toDataURL('image/png');
  } catch (_) {
    logLine('Bu çevrimiçi video ekran görüntüsü alınmasına izin vermiyor. Videoyu indirip yeniden deneyin.', 'warn');
    return;
  }
  const name = `${(player.mediaKey || 'kare').replace(/[^a-z0-9]+/gi, '_').slice(-40)}`
    + `_${Math.round(v.currentTime)}s.png`;
  if (window.api.saveImage) {
    const res = await window.api.saveImage({ dataUrl, suggestedName: name });
    if (res && res.ok) { osd('Ekran görüntüsü kaydedildi'); logLine(`Ekran görüntüsü: ${res.path}`, 'success'); }
    else if (res && res.error) logLine(`Ekran görüntüsü kaydedilemedi: ${res.error}`, 'error');
  }
}

// ---- altyazı görünümü (renk, arka plan, kontur, yazı tipi) ----
// Hepsi CSS degiskenleriyle uygulanir; boylece ana ve karsilastirma altyazisi
// ayni ayarlari paylasir ve tam ekranda da gecerlidir.
const SUB_STYLE_KEY = 'subtitleStyle';
const SUB_STYLE_DEFAULTS = {
  size: 28,          // px (pencere); tam ekranda vw ile olceklenir
  color: '#ffffff',
  bg: 45,            // arka plan saydamligi % (0 = yok)
  outline: 70,       // kontur/golge gucu %
  font: 'system',
  weight: 600,
  lineHeight: 1.35,
};
const SUB_FONTS = {
  system: "'Segoe UI', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Cascadia Mono', Consolas, monospace",
  rounded: "'Segoe UI Variable', 'Trebuchet MS', sans-serif",
};

function applySubtitleStyle() {
  const st = player.subStyle;
  const stage = $('playerStage');
  if (!stage) return;
  const a = Math.max(0, Math.min(100, st.bg)) / 100;
  const o = Math.max(0, Math.min(100, st.outline)) / 100;
  stage.style.setProperty('--sub-size', `${st.size}px`);
  stage.style.setProperty('--sub-color', st.color);
  stage.style.setProperty('--sub-bg', a ? `rgba(0,0,0,${a.toFixed(2)})` : 'transparent');
  stage.style.setProperty('--sub-pad', a ? '4px 12px' : '0');
  stage.style.setProperty('--sub-font', SUB_FONTS[st.font] || SUB_FONTS.system);
  stage.style.setProperty('--sub-weight', String(st.weight));
  stage.style.setProperty('--sub-line', String(st.lineHeight));
  stage.style.setProperty('--sub-shadow', o
    ? `0 0 ${(4 * o).toFixed(1)}px rgba(0,0,0,${(0.9 * o).toFixed(2)}),`
      + ` 0 2px ${(6 * o).toFixed(1)}px rgba(0,0,0,${(0.9 * o).toFixed(2)}),`
      + ` 0 0 ${(14 * o).toFixed(1)}px rgba(0,0,0,${(0.7 * o).toFixed(2)})`
    : 'none');
}

function loadSubtitleStyle() {
  player.subStyle = Object.assign({}, SUB_STYLE_DEFAULTS);
  try {
    const raw = localStorage.getItem(SUB_STYLE_KEY);
    if (raw) Object.assign(player.subStyle, JSON.parse(raw) || {});
  } catch (_) {}
  // Kontrolleri duruma esitle
  const map = { subSize: 'size', subColor: 'color', subBgOpacity: 'bg',
                subOutline: 'outline', subFont: 'font', subWeight: 'weight' };
  Object.entries(map).forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = player.subStyle[key] >= 700;
    else el.value = String(player.subStyle[key]);
    const lbl = $(id + 'Val');
    if (lbl) lbl.textContent = String(player.subStyle[key]);
  });
  applySubtitleStyle();
}

function saveSubtitleStyle() {
  try { localStorage.setItem(SUB_STYLE_KEY, JSON.stringify(player.subStyle)); } catch (_) {}
}

function bindSubtitleStyleControls() {
  const bind = (id, key, transform) => {
    const el = $(id);
    if (!el) return;
    const handler = () => {
      const raw = el.type === 'checkbox' ? (el.checked ? 700 : 600) : el.value;
      player.subStyle[key] = transform ? transform(raw) : raw;
      const lbl = $(id + 'Val');
      if (lbl) lbl.textContent = String(player.subStyle[key]);
      applySubtitleStyle();
      saveSubtitleStyle();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  };
  bind('subSize', 'size', (v) => parseInt(v, 10));
  bind('subColor', 'color');
  bind('subBgOpacity', 'bg', (v) => parseInt(v, 10));
  bind('subOutline', 'outline', (v) => parseInt(v, 10));
  bind('subFont', 'font');
  bind('subWeight', 'weight', (v) => parseInt(v, 10));
  $$('.sub-color-swatch').forEach((b) => {
    b.addEventListener('click', () => {
      player.subStyle.color = b.dataset.color;
      if ($('subColor')) $('subColor').value = b.dataset.color;
      applySubtitleStyle();
      saveSubtitleStyle();
    });
  });
  const reset = $('subStyleReset');
  if (reset) {
    reset.addEventListener('click', () => {
      player.subStyle = Object.assign({}, SUB_STYLE_DEFAULTS);
      saveSubtitleStyle();
      loadSubtitleStyle();
      logLine('Altyazı görünümü varsayılana döndü.', 'info');
    });
  }
}

// ---- altyazıyı sürükleyerek konumlandırma ----
// Kullanici altyaziyi basili tutup dikeyde tasiyabilir. Konum YUZDE olarak
// saklanir; boylece pencere boyutu degisse de tam ekrana gecilse de ayni yerde
// durur. Yatay konum degismez (altyazi ortali kalmali).
const SUB_POS_KEY = 'subtitlePos';

function applySubtitlePos() {
  const ov = $('subtitleOverlay');
  const ov2 = $('subtitleOverlay2');
  const stage = $('playerStage');
  if (ov && player.subBottom != null) {
    // Inline 'bottom' YERINE degisken: boylece CSS, kontroller gorunurken
    // max() ile cubugun ustune cikarabiliyor.
    ov.style.bottom = '';
    if (stage) {
      stage.style.setProperty('--sub-user-bottom', `${player.subBottom}%`);
      stage.classList.add('sub-moved');
    }
  }
  if (ov2 && player.sub2Top != null) ov2.style.top = `${player.sub2Top}%`;
}

function loadSubtitlePos() {
  try {
    const raw = localStorage.getItem(SUB_POS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (typeof p.bottom === 'number') player.subBottom = p.bottom;
    if (typeof p.top2 === 'number') player.sub2Top = p.top2;
  } catch (_) {}
  applySubtitlePos();
}

function saveSubtitlePos() {
  try {
    localStorage.setItem(SUB_POS_KEY, JSON.stringify({
      bottom: player.subBottom, top2: player.sub2Top,
    }));
  } catch (_) {}
}

// el: 'bottom' (ana altyazi, alttan olculur) | 'top' (karsilastirma, ustten)
function makeSubtitleDraggable(el, edge) {
  if (!el) return;
  let dragging = false;
  let startY = 0;
  let startPct = 0;
  let moved = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || player.editing) return;
    const stage = $('playerStage');
    if (!stage) return;
    const h = stage.getBoundingClientRect().height || 1;
    const r = el.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    startPct = edge === 'bottom'
      ? (player.subBottom != null ? player.subBottom : ((sr.bottom - r.bottom) / h) * 100)
      : ((r.top - sr.top) / h) * 100;
    startY = e.clientY;
    dragging = true;
    moved = false;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}   // yakalanamayabilir
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    // 4 px esigi: kisa tiklamayi surukleme sayma
    if (!moved && Math.abs(dy) < 4) return;
    if (!moved) { moved = true; el.classList.add('dragging'); showControls(); }
    const stage = $('playerStage');
    const h = stage.getBoundingClientRect().height || 1;
    // asagi surukleme: alttan olculen deger AZALIR, ustten olculen ARTAR
    const delta = (dy / h) * 100 * (edge === 'bottom' ? -1 : 1);
    const pct = Math.max(1, Math.min(88, startPct + delta));
    if (edge === 'bottom') {
      player.subBottom = pct;
      stage.style.setProperty('--sub-user-bottom', `${pct}%`);
      stage.classList.add('sub-moved');
    } else {
      player.sub2Top = pct;
      el.style.top = `${pct}%`;
      el.style.bottom = 'auto';
    }
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      saveSubtitlePos();
      logLine(`Altyazı konumu kaydedildi (${edge === 'bottom' ? 'alt' : 'üst'}: `
        + `%${Math.round(edge === 'bottom' ? player.subBottom : player.sub2Top)})`, 'info');
    } else {
      // Suruklenmedi: sade tiklama -> videoya ilet (tam ekranda oynat/duraklat
      // davranisi kaybolmasin). Cift tiklama duzenleyiciyi acmaya devam eder.
      const v = $('playerVideo');
      if (v && !player.editing) { v.paused ? v.play().catch(() => {}) : v.pause(); }
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ---- kontrollerin boşta gizlenmesi (film izlerken imleç/çubuk yolu kapatmasın) ----
function showControls() {
  const stage = $('playerStage');
  const video = $('playerVideo');
  if (!stage) return;
  stage.classList.remove('idle');
  clearTimeout(player.idleTimer);
  // Duraklatılmışken veya düzeltme yaparken gizleme
  if (!video || video.paused || player.editing) return;
  player.idleTimer = setTimeout(() => stage.classList.add('idle'), 2500);
}

// ---- zaman çubuğu görselleri: oynanan + tamponlanan ----
function updateSeekVisuals() {
  const video = $('playerVideo');
  const played = $('seekPlayed');
  const buf = $('seekBuffered');
  if (!video || !played || !video.duration) return;
  const pct = (video.currentTime / video.duration) * 100;
  played.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (buf && video.buffered && video.buffered.length) {
    // İmlecin bulunduğu aralığın sonu — HLS'te ne kadar ileri yüklendiğini gösterir
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
        end = video.buffered.end(i);
        break;
      }
      end = Math.max(end, video.buffered.end(i));
    }
    buf.style.width = `${Math.max(0, Math.min(100, (end / video.duration) * 100))}%`;
  }
}

// ---- zaman çubuğundaki işaretler: altyazıda arama yapınca eşleşmeler burada belirir ----
// Arama aktifse eslesmeler, degilse bolumler gosterilir (ayni katman).
function defaultMarkers() {
  return (player.chapters || []).map((c) => c.start);
}

function renderSeekMarkers(times) {
  const box = $('seekMarkers');
  const video = $('playerVideo');
  if (!box) return;
  box.innerHTML = '';
  if (!video || !video.duration || !times || !times.length) return;
  // Sure disina dusenler cizilmez (negatif gecikme veya baska videonun bolumleri)
  times.filter((t) => t >= 0 && t <= video.duration).slice(0, 400).forEach((t) => {
    const el = document.createElement('div');
    el.className = 'seek-marker';
    el.style.left = `${(t / video.duration) * 100}%`;
    box.appendChild(el);
  });
}

// ---- bölümler (YouTube) ----
// Belgesellerde bölüm başlıkları gezinmeyi çok kolaylaştırıyor: hem açılır
// listeden atlanır hem de zaman çubuğunda işaret olarak görünür.
function setChapters(chapters) {
  player.chapters = Array.isArray(chapters) ? chapters : [];
  const panel = $('playerChaptersPanel');
  const sel = $('playerChapters');
  if (!panel || !sel) return;
  sel.innerHTML = '';
  if (!player.chapters.length) {
    panel.classList.add('hidden');
    renderSeekMarkers([]);
    return;
  }
  const head = document.createElement('option');
  head.value = '';
  head.textContent = `${player.chapters.length} bölüm — atlamak için seç`;
  sel.appendChild(head);
  player.chapters.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${pSecToTime(c.start)} · ${c.title || 'Bölüm ' + (i + 1)}`;
    sel.appendChild(o);
  });
  panel.classList.remove('hidden');
  renderSeekMarkers(player.chapters.map((c) => c.start));
}

// ---- kaldığın yerden devam ----
// Uzun filmde en çok işe yarayan şey bu: konum ayarlarda saklanır, aynı videoyu
// tekrar açınca "Devam et" rozeti çıkar. Otomatik atlamaz — yanlış videoda
// sıçramasın diye kullanıcı onaylar.
// Ayni videonun farkli adresleri (youtu.be/ID, watch?v=ID&t=30, paylasim
// parametreleri) AYNI kayda dusmeli; ham URL anahtar olarak kullanilinca izleme
// gecmisi parcalaniyordu.
function youtubeVideoId(url) {
  const u = String(url || '');
  // Tek dev regex yerine sirayla dene - okunur ve kirilgan degil
  let m = u.match(/[?&]v=([\w-]{6,})/);                    // watch?v=ID
  if (m) return m[1];
  m = u.match(/youtu\.be\/([\w-]{6,})/i);                // youtu.be/ID
  if (m) return m[1];
  m = u.match(/\/(?:embed|shorts|live|v)\/([\w-]{6,})/i); // /embed|shorts|live/ID
  return m ? m[1] : '';
}

function mediaKeyFor(kind, ref) {
  if (kind === 'youtube') {
    const id = youtubeVideoId(ref);
    return id ? `youtube:${id}` : `youtube:${String(ref || '').trim()}`;
  }
  // Yerel dosya: ayrac ve buyuk/kucuk harf farki ayni dosyayi bolmesin (Windows)
  return 'file:' + String(ref || '').replace(/\\/g, '/').toLowerCase();
}

function playerPositionKey() {
  return player.mediaKey || '';
}

function savePlayerPosition() {
  const video = $('playerVideo');
  const key = playerPositionKey();
  const browserMode = player.workspaceMode === 'browser' && key.startsWith('browser:');
  // Canli yayinda "kaldigin yer" anlamsiz: pencere kayiyor, sure Infinity olabilir
  if (!browserMode && player.isLive) return;
  const duration = browserMode ? Number(player.browserDuration) : Number(video && video.duration);
  if (!key || !duration || !isFinite(duration)) return;
  const t = browserMode ? Number(player.browserTime) || 0 : Number(video.currentTime) || 0;
  // Tamamlanma esigi izleme kutuphanesiyle ayni olmali. Sabit 60 saniye,
  // 90 saniyelik bir videoda neredeyse tum devam kaydini siliyordu.
  if (watchCompletionReached(t, duration)) {
    delete player.positions[key];
  } else if (t < 30) {
    // Videonun basi. SILME: video yeni yuklendiginde de currentTime 0'dir ve
    // timeupdate/pause olaylari buraya dusuyor; silseydik "Devam et" rozetine
    // basmadan kayit yok olurdu (testte tam olarak bu oldu). Sadece guncelleme.
    return;
  } else {
    player.positions[key] = {
      t: Math.round(t),
      d: Math.round(duration),
      title: $('playerTitle') ? $('playerTitle').textContent : '',
      at: Date.now(),
    };
  }
  // En son 60 video tutulur (ayar dosyası şişmesin)
  const keys = Object.keys(player.positions);
  if (keys.length > 60) {
    keys.sort((a, b) => (player.positions[a].at || 0) - (player.positions[b].at || 0));
    keys.slice(0, keys.length - 60).forEach((k) => delete player.positions[k]);
  }
  scheduleSave();
}

function maybeOfferResume() {
  const chip = $('resumeChip');
  const saved = player.positions[playerPositionKey()];
  if (!chip) return;
  if (!saved || player.resumeOffered || saved.t < 30) { chip.classList.add('hidden'); return; }
  player.resumeOffered = true;
  $('resumeChipText').textContent = `Kaldığın yer: ${pSecToTime(saved.t)}`;
  chip.classList.remove('hidden');
  clearTimeout(player._resumeTimer);
  player._resumeTimer = setTimeout(() => chip.classList.add('hidden'), 12000);
}

// Yeni bir videoya gecerken ONCEKI videoya ait her sey temizlenmeli. Eskiden
// yalnizca kaynak degisiyordu; A videosunun altyazilari B'nin uzerinde gorunmeye
// devam ediyor, ustelik attachSiblingSubtitles "cues doluysa yukleme" dedigi icin
// B'nin kendi altyazisi otomatik acilmiyordu. Bolum isaretleri de kaliyordu.
function resetMediaBoundState(options = {}) {
  closeTimeline();
  player.cues = [];
  player.cues2 = [];
  player.cuesRaw = null;
  player.cues2Raw = null;
  player.activeIdx = -1;
  player.activeIdx2 = -1;
  player.subPath = '';
  player.subRaw = '';
  player.sub2Path = '';
  player.subOrigins = {};
  player.subFormat = 'srt';
  player.pausedAt = -1;
  player.chapters = [];
  player.savedCues = [];
  player.savedOnly = false;
  player.qualityOnly = false;
  player.savedWords = [];
  player.cueQualitySource = [];
  player.selectedWord = null;
  player.abA = null;
  player.abB = null;
  player.chatHistory = [];
  player.timeline.waveform = [];
  player.timeline.waveformDuration = 0;
  player.timeline.selected = -1;
  player.timeline.undo = [];
  player.timeline.loading = false;
  player.editing = false;
  if ($('timelineDrawer')) $('timelineDrawer').classList.remove('dirty');
  $('playerStage')?.classList.remove('editing');
  $('subtitleEdit')?.classList.add('hidden');
  if ($('abLoopBtn')) $('abLoopBtn').classList.remove('active');
  const chatLog = $('aiChatLog');
  if (chatLog) [...chatLog.querySelectorAll('.ai-msg')].forEach((e) => e.remove());
  $('aiChatEmpty')?.classList.remove('hidden');
  $('aiAnswer')?.classList.add('hidden');

  const ov = $('subtitleOverlay');
  const ov2 = $('subtitleOverlay2');
  if (ov) ov.textContent = '';
  if (ov2) ov2.textContent = '';
  setSubtitlesVisible(true);       // yeni videoda altyazi GORUNUR baslar

  // Altyazi secicileri ve liste bosaltilir (dosyalar onceki videoya aitti)
  player.subtitles = [];
  ['playerSubSelect', 'playerSubSelect2'].forEach((id, idx) => {
    const sel = $(id);
    if (!sel) return;
    sel.innerHTML = '';
    const o = document.createElement('option');
    o.value = '';
    o.textContent = idx === 0 ? 'Altyazı yok' : 'Kapalı';
    sel.appendChild(o);
  });
  if ($('cueSearch')) $('cueSearch').value = '';
  if (!options.preserveInspector) hideWordInspector();
  renderCueList('');
  updateSubtitleChips();
  updateMakeTransState();
  updatePlayerAutoSyncState();
  if ($('playerStreamAudioField')) $('playerStreamAudioField').classList.add('hidden');
  if ($('playerChaptersPanel')) $('playerChaptersPanel').classList.add('hidden');
  if ($('playerChapters')) $('playerChapters').innerHTML = '';
  renderSeekMarkers([]);
  // Gecikme ONCEKI dosyaya gore ayarlanmisti; yeni videoda anlamsiz - sifirla.
  // (Eskiden yalnizca "dosyaya isle" dugmesi gizleniyordu; +2.3 sn'lik bir
  // duzeltme sonraki butun videolara tasiniyordu.)
  player.offset = 0;
  const offEl = $('subOffset');
  if (offEl && offEl.value !== '0') {
    offEl.value = '0';
    if ($('subOffsetVal')) $('subOffsetVal').textContent = '0.0';
    scheduleSave();
  }
  if ($('applyOffsetToFile')) $('applyOffsetToFile').classList.add('hidden');
}

// Kaynak degisiminde kusak artar. Devam eden her asenkron is (altyazi okuma,
// kardes tarama, YouTube altyazi indirme) basladigi kusagi hatirlar ve sonuc
// geldiginde kusak degistiyse sonucu ATAR - eski videonun altyazisi yenisine
// baglanmasin diye.
// Altyazi gorunurlugu TEK YERDEN yonetilir. CC menusu ve sag paneldeki
// Kaynak/Ceviri anahtarlari ayni secimi degistirir; biri digerini ezmez.
function subtitleTrackState() {
  return {
    source: $('showSource') ? $('showSource').checked : true,
    translation: $('showTranslation') ? $('showTranslation').checked : true,
  };
}

function applySubtitleTrackSelection(source, translation) {
  if ($('showSource')) $('showSource').checked = !!source;
  if ($('showTranslation')) $('showTranslation').checked = !!translation;
  const layer = $('playerLayer');
  if (layer) {
    layer.classList.toggle('hide-src', !source);
    layer.classList.toggle('hide-tr', !translation);
  }
  scheduleBrowserOverlaySync();
}

function currentSubtitleMode() {
  const tracks = subtitleTrackState();
  if (player.subsHidden || (!tracks.source && !tracks.translation)) return 'off';
  if (tracks.source && !tracks.translation) return 'source';
  if (!tracks.source && tracks.translation) return 'translation';
  return 'both';
}

function syncSubtitleModeUi() {
  const mode = currentSubtitleMode();
  const labels = {
    off: 'Altyazılar kapalı',
    source: 'Yalnızca kaynak altyazı gösteriliyor',
    translation: 'Yalnızca çeviri gösteriliyor',
    both: 'Kaynak ve çeviri gösteriliyor',
  };
  const btn = $('subToggle');
  if (btn) {
    btn.classList.toggle('off', mode === 'off');
    btn.dataset.mode = mode;
    btn.title = `${labels[mode]} — seçenekler için tıkla (V: aç/kapat)`;
    btn.setAttribute('aria-label', labels[mode]);
  }
  $$('#subtitleModeMenu [data-subtitle-mode]').forEach((item) => {
    const active = item.dataset.subtitleMode === mode;
    item.classList.toggle('active', active);
    item.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  const hint = $('subHiddenHint');
  if (hint) hint.classList.toggle('hidden', mode !== 'off');
}

function setSubtitlesVisible(visible) {
  if (visible) {
    const tracks = subtitleTrackState();
    if (!tracks.source && !tracks.translation) {
      const restore = player.lastSubtitleMode === 'translation' ? 'translation' : 'source';
      applySubtitleTrackSelection(restore === 'source', restore === 'translation');
    }
  }
  player.subsHidden = !visible;
  const ov = $('subtitleOverlay');
  const ov2 = $('subtitleOverlay2');
  if (ov) ov.style.visibility = visible ? '' : 'hidden';
  if (ov2) ov2.style.visibility = visible ? '' : 'hidden';
  syncSubtitleModeUi();
  scheduleBrowserOverlaySync();
}

function setSubtitleMode(mode, announce = true) {
  if (mode === 'off') {
    setSubtitlesVisible(false);
  } else if (mode === 'source' || mode === 'translation') {
    applySubtitleTrackSelection(mode === 'source', mode === 'translation');
    player.lastSubtitleMode = mode;
    setSubtitlesVisible(true);
  } else {
    return;
  }
  setSubtitleModeMenuOpen(false);
  if (announce) {
    const text = mode === 'off' ? 'Altyazılar kapatıldı'
      : mode === 'source' ? 'Yalnızca kaynak altyazı'
      : 'Yalnızca çeviri';
    osd(text);
    logLine(text, 'info');
  }
}

function setSubtitleModeMenuOpen(open) {
  const menu = $('subtitleModeMenu');
  const btn = $('subToggle');
  if (!menu || !btn) return;
  menu.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    syncSubtitleModeUi();
    const selected = menu.querySelector('.active') || menu.querySelector('button');
    if (selected) selected.focus();
  } else if (document.activeElement && menu.contains(document.activeElement)) {
    btn.focus();
  }
}

function setMediaKey(key) {
  // Eski medyanın son konumunu ve tercihlerini anahtar değişmeden yakala.
  flushWatchState(false, true);
  const nextKey = key || '';
  if (!String(nextKey).startsWith('youtube:')) {
    player.ytInfo = null;
    player.originalUrl = '';
    $('playerYtInfo')?.classList.add('hidden');
    $('playerYtSubField')?.classList.add('hidden');
    $('playerYtSubGet')?.classList.add('hidden');
    $('playerStream')?.classList.add('hidden');
    $('playerAudioField')?.classList.add('hidden');
    $('playerStreamAudioField')?.classList.add('hidden');
  }
  player.mediaKey = nextKey;
  if (player.pendingLibrarySeek && player.pendingLibrarySeek.key !== player.mediaKey) {
    player.pendingLibrarySeek = null;
  }
  player.localPath = '';
  player.generation++;
  player.hlsMediaRecover = 0;
  player.hlsNetRecover = 0;
  clearTimeout(player.hlsRecoveryTimer);
  player.hlsRecoveryTimer = null;
  player.isLive = false;
  player.playbackAudioLang = '';
  player.resumeOffered = false;
  player.watchSession = null;
  player.watchManualCompletedKey = '';
  player.watchManualCompleted = null;
  player.watchRemovedKey = '';
  if ($('resumeChip')) $('resumeChip').classList.add('hidden');
  resetMediaBoundState();
  // Gecmisten "Izle" ile gelindiyse o isin altyazilari, kaynak acildiktan
  // SONRA baglanir: setMediaKey medyaya bagli her seyi sifirlar, once
  // eklenseydi burada silinirdi. Anahtar kontrolu, kullanici arada baska bir
  // video acarsa yanlis altyazinin yapismasini onler.
  const pend = player.pendingSubs;
  if (pend && pend.key === player.mediaKey) {
    const pendGen = currentGeneration();
    player.pendingSubs = null;
    setTimeout(() => {
      if (player.mediaKey !== pend.key || currentGeneration() !== pendGen) return;
      pend.files.forEach((f) => addSubtitleOption(f));
      if (pend.files.length) {
        const sel = $('playerSubSelect');
        if (sel) sel.value = pend.files[0];
        loadSubtitle(pend.files[0]);
      }
    }, 0);
  } else if (pend) {
    player.pendingSubs = null;
  }
  loadSavedCues();
  loadSavedWords();
  updateCueMeta();
}

function currentGeneration() {
  return player.generation;
}

function staleGeneration(gen) {
  return gen !== player.generation;
}

// VTT yazici — SRT'den farki: WEBVTT basligi ve ms ayraci olarak nokta.
// (Eskiden .vtt duzenleyince dosyaya SRT yaziliyor, WEBVTT basligi kayboluyordu.)
function cuesToVtt(cues) {
  const NL = '\n';
  // bkz. cuesToSrt: once tam ms'ye yuvarla, sonra parcala
  const fmt = (sec) => {
    const t = Math.max(0, Math.round(sec * 1000));
    const p = (x, w = 2) => String(x).padStart(w, '0');
    return `${p(Math.floor(t / 3600000))}:${p(Math.floor((t % 3600000) / 60000))}:`
         + `${p(Math.floor((t % 60000) / 1000))}.${p(t % 1000, 3)}`;
  };
  return 'WEBVTT' + NL + NL
    + cues.map((c) => `${fmt(c.start)} --> ${fmt(c.end)}${NL}${c.text}${NL}`).join(NL);
}

// VTT: dosyayi yeniden URETMEK yerine yalnizca hedef cue'nun METIN satirlarini
// degistiririz. Yeniden uretim cue kimliklerini, satir ayarlarini (align,
// position, line, size), STYLE / REGION / NOTE bloklarini ve baslik
// metadatasini yok ederdi.
function replaceVttCueText(rawText, cue, newText) {
  const lines = String(rawText).split(/\r?\n/);
  const toSec = (t) => {
    const m = String(t).match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
    if (!m) return null;
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3])
      + (+String(m[4]).padEnd(3, '0')) / 1000;
  };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('-->')) continue;
    const half = lines[i].split('-->');
    const st = toSec(half[0]);
    const en = toSec(half[1]);
    if (st === null || en === null) continue;
    if (Math.abs(st - cue.start) > 0.002 || Math.abs(en - cue.end) > 0.002) continue;
    // Metin satirlari: zaman satirindan sonra bos satira kadar
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '') j++;
    lines.splice(i + 1, j - (i + 1), ...String(newText).split(/\n/));
    return lines.join('\n');
  }
  return null;
}

// ASS/SSA: dosyayi yeniden URETMEK yerine ilgili Dialogue satirinin METIN alanini
// degistiririz. Yeniden uretim stilleri, konumlari, efektleri ve konusmaci
// adlarini yok ederdi (eskiden .ass dosyasina duz SRT yaziliyordu).
function replaceAssDialogueText(rawText, lineNo, newText, lead) {
  const NL = '\n';
  const lines = String(rawText).split(/\r?\n/);
  if (!(lineNo >= 0) || lineNo >= lines.length) return null;
  const line = lines[lineNo];
  if (!/^Dialogue\s*:/i.test(line)) return null;
  // "Dialogue:" sonrasi ilk 9 alan korunur, 10.'su (Text) degistirilir
  const colon = line.indexOf(':');
  const parts = line.slice(colon + 1).split(',');
  if (parts.length < 10) return null;
  const body = (lead || '') + String(newText).replace(/\n/g, '\\' + 'N');
  lines[lineNo] = line.slice(0, colon + 1) + parts.slice(0, 9).join(',') + ',' + body;
  return lines.join(NL);
}

function setPlayerSource(src, title, key, meta) {
  const video = $('playerVideo');
  if (!video) return;
  setWorkspaceMode('player');
  if (player.ambientOn) startAmbient();
  setMediaKey(key || src);
  // Yerel yol AYRICA saklanir: 'Altyazi olustur' bunu kullanir. Eskiden
  // state.lastJobVideo'ya dusuyordu ve o ONCEKI ise ait olabiliyordu -
  // oynaticida B videosu acikken A transkribe edilebilirdi.
  player.localPath = (meta && meta.localPath) || player.localPath || '';
  updatePlayerAutoSyncState();
  if (meta && meta.chapters) setChapters(meta.chapters);
  destroyHls();
  video.src = src;
  video.load();
  $('playerEmpty').classList.add('hidden');
  if (title) $('playerTitle').textContent = title;
  const metaEl = $('playerMeta');
  if (metaEl) metaEl.textContent = meta && meta.isLive ? 'Canlı yayın · yerel oynatma' : 'Yerel video · çift dilli çalışma';
  beginWatchSession();
  restoreWatchProfile(player.mediaKey);
}

// ---- HLS ile indirmeden izleme ----
// YouTube 1080p+ icin video ve sesi AYRI verir; duz <video> bunlari birlestiremez.
// Ama YouTube ayni zamanda bir HLS manifesti sunuyor (tum cozunurlukler + ayri ses).
// hls.js bunu MSE ile birlestirip oynatiyor: indirme yok, ileri-geri sarma calisiyor.
function destroyHls() {
  clearTimeout(player.hlsRecoveryTimer);
  player.hlsRecoveryTimer = null;
  if (player.hls) {
    try { player.hls.destroy(); } catch (_) {}
    player.hls = null;
  }
}

// key: YouTube linki verilir — manifest URL'si zaman asimina ugradigi icin
// konum hatirlamada anahtar olarak kullanilamaz.
// meta: kaynak sifirlandiktan SONRA uygulanacak probe metadatasi (bolumler vb.).
// Eskiden bolumler probe sirasinda yukleniyor, oynatma baslayinca
// setMediaKey -> resetMediaBoundState onlari siliyordu: kullanici bolumleri
// goruyor, "Izle"ye basinca kayboluyorlardi.
function setPlayerHls(manifestUrl, title, key, meta, preserveMediaState = false) {
  setWorkspaceMode('player');
  const video = $('playerVideo');
  if (!video) return false;
  if (typeof Hls === 'undefined' || !Hls.isSupported()) {
    logLine('HLS oynatici yuklenemedi — indirerek izleyebilirsin.', 'error');
    return false;
  }
  // Gecici YouTube manifesti yenilenirken bu HALA AYNI videodur. Medya
  // anahtarini yeniden kurmak altyazilari, ceviriyi, zamanlama masasini ve
  // tercihlerı siler. Yalniz ilk acilista medyaya bagli durumu sifirla.
  if (!preserveMediaState) setMediaKey(key || manifestUrl);
  if (meta && meta.chapters) setChapters(meta.chapters);
  if (meta && meta.isLive) player.isLive = true;
  const parseStatus = $('playerParseStatus');
  const parseText = $('playerParseText');
  if (parseStatus) parseStatus.classList.remove('hidden');
  if (parseText) parseText.textContent = 'Yayın hazırlanıyor…';
  destroyHls();
  video.removeAttribute('src');
  const hls = new Hls({ maxBufferLength: 30, enableWorker: true });
  player.hls = hls;
  // Ses parcalari (dublaj) - yalnizca birden fazlaysa gosterilir.
  let loggedAudioTrackCount = null;
  const syncAudioTracks = () => {
    const field = $('playerStreamAudioField');
    const sel = $('playerStreamAudio');
    if (!field || !sel) return;
    const tracks = hls.audioTracks || [];
    if (tracks.length < 2) {
      loggedAudioTrackCount = tracks.length;
      field.classList.add('hidden');
      return;
    }
    sel.innerHTML = '';
    tracks.forEach((t, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = t.name || t.lang || `Parça ${i + 1}`;
      sel.appendChild(o);
    });
    const lock = currentAudioLock();
    const lockedIndex = lock ? tracks.findIndex((t) => audioLanguagesMatch(t.lang, lock.lang)) : -1;
    if (lockedIndex >= 0 && $('playerAudioLock') && $('playerAudioLock').checked) {
      hls.audioTrack = lockedIndex;
    }
    const activeIndex = hls.audioTrack >= 0 ? hls.audioTrack : (lockedIndex >= 0 ? lockedIndex : 0);
    sel.value = String(activeIndex);
    const activeTrack = tracks[activeIndex];
    player.playbackAudioLang = normalizeAudioLang(activeTrack && activeTrack.lang);
    updateAudioLockStatus();
    field.classList.remove('hidden');
    if (loggedAudioTrackCount !== tracks.length) {
      logLine(`${tracks.length} ses parçası bulundu (dublaj seçilebilir).`, 'info');
      loggedAudioTrackCount = tracks.length;
    }
  };
  hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudioTracks);
  hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
    const sel = $('playerStreamAudio');
    if (sel && hls.audioTrack >= 0) sel.value = String(hls.audioTrack);
    const track = (hls.audioTracks || [])[hls.audioTrack];
    player.playbackAudioLang = normalizeAudioLang(track && track.lang);
    updateAudioLockStatus();
  });

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    syncAudioTracks();
    if (parseStatus) parseStatus.classList.add('hidden');
    // Kalite listesini HLS seviyeleriyle doldur (Otomatik + her cozunurluk)
    const sel = $('playerQuality');
    if (sel) {
      sel.innerHTML = '';
      const auto = document.createElement('option');
      auto.value = 'auto';
      auto.textContent = 'Otomatik';
      sel.appendChild(auto);
      // DEGER HER ZAMAN GERCEK YUKSEKLIK olur; HLS seviye indeksi dataset'te
      // saklanir. Eskiden deger indeks oluyordu ve "Indir ve izle" bunu piksel
      // yuksekligi sanip backend'e height=2 gibi bir sey gonderebiliyordu.
      hls.levels.forEach((lvl, i) => {
        const o = document.createElement('option');
        o.value = String(lvl.height);
        o.dataset.level = String(i);
        o.textContent = `${lvl.height}p`;
        sel.appendChild(o);
      });
      // 1080p varsa onu, yoksa altindaki en yuksegi sec
      let pick = -1;
      hls.levels.forEach((lvl, i) => {
        if (lvl.height <= 1080 && (pick < 0 || lvl.height > hls.levels[pick].height)) pick = i;
      });
      if (pick >= 0) {
        sel.value = String(hls.levels[pick].height);
        hls.currentLevel = pick;
      }
    }
    video.play().catch(() => {});
    logLine(`Yayin basladi (indirilmedi) — ${hls.levels.length} kalite mevcut`, 'success');
  });
  // Olumcul hatada hemen pes etme. YouTube'un HLS adresi GECICIDIR (birkac saat);
  // suresi dolunca ag hatasi gelir. Once hls.js'in kendi kurtarmalarini dene,
  // olmazsa ORIJINAL YouTube adresiyle yeniden probe yapip yeni adresi ayni
  // konumdan yukle. Medya ve ağ hatalarının ayrı ayrı en fazla 2 kurtarma
  // denemesi vardır; başarılı oynatma sonrasında sayaçlar temizlenir.
  hls.on(Hls.Events.ERROR, async (_e, data) => {
    if (!data || !data.fatal) return;
    const at = video.currentTime || 0;
    const wasPlaying = !video.paused;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && player.hlsMediaRecover < 2) {
      player.hlsMediaRecover++;
      logLine('Görüntü hatası — kurtarılıyor...', 'warn');
      try { hls.recoverMediaError(); return; } catch (_) {}
    }
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && player.hlsNetRecover < 2) {
      player.hlsNetRecover++;
      const info = player.ytInfo;
      if (info && info.sourceUrl) {
        logLine('Yayın bağlantısı koptu (adres zaman aşımına uğramış olabilir) — yenileniyor...', 'warn');
        const gen = currentGeneration();
        const res = await window.api.probeYoutube(info.sourceUrl, youtubeCookieBrowser());
        if (staleGeneration(gen)) return;               // baska videoya gecilmis
        if (res && res.ok && res.data && res.data.hls) {
          const fresh = res.data;
          fresh.sourceUrl = info.sourceUrl;
          fresh.videoKey = info.videoKey;
          player.ytInfo = fresh;
          destroyHls();
          if (setPlayerHls(fresh.hls, fresh.title, fresh.videoKey, fresh, true)) {
            const resume = () => {
              video.removeEventListener('loadedmetadata', resume);
              if (at > 0) video.currentTime = at;
              if (wasPlaying) video.play().catch(() => {});
            };
            video.addEventListener('loadedmetadata', resume);
            logLine(`Yayın yenilendi — ${pSecToTime(at)} konumundan devam.`, 'success');
            return;
          }
        }
      }
    }
    logLine(`Yayın hatası (${data.type}) — indirerek izlemeyi deneyebilirsin.`, 'error');
    destroyHls();
  });
  hls.loadSource(manifestUrl);
  hls.attachMedia(video);
  $('playerEmpty').classList.add('hidden');
  if (title) $('playerTitle').textContent = title;
  const metaEl = $('playerMeta');
  if (metaEl) metaEl.textContent = meta && meta.isLive ? 'Canlı yayın · HLS akışı' : 'YouTube · indirmeden oynatma';
  if (!preserveMediaState) {
    beginWatchSession();
    restoreWatchProfile(player.mediaKey);
  }
  return true;
}

// Whisper GORUNTUDEKI yaziyi okuyamaz, yalnizca sesi dinler. Bu yuzden altyazinin
// NEREDEN geldigi panelde acikca yazar: YouTube'un hazir altyazisi mi, bizim
// Whisper ciktimiz mi, yoksa disaridan acilan bir dosya mi.
function subtitleOrigin(path, label) {
  if (/^YouTube/i.test(label || '')) return 'YouTube';
  if ((state.outputFiles || []).includes(path)) return 'Whisper';
  return 'Dosya';
}

// Dil kodunu dosya adindan cikar: "film.tr.srt" -> TR
function langFromPath(path) {
  const m = String(path || '').match(/\.([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  return m ? m[1].toUpperCase() : '';
}

function updateSubtitleChips() {
  const src = $('srcLangChip');
  const tr = $('trLangChip');
  const org = $('subOrigin');
  if (src) {
    const l = langFromPath(player.subPath);
    src.textContent = l ? `Kaynak · ${l}` : 'Kaynak';
    src.classList.toggle('hidden', !player.cues.length);
  }
  if (tr) {
    const l2 = langFromPath(player.sub2Path);
    tr.textContent = l2 ? `Çeviri · ${l2}` : 'Çeviri';
    tr.classList.toggle('hidden', !player.cues2.length);
  }
  if (org) org.textContent = player.subPath ? (player.subOrigins[player.subPath] || 'Dosya') : '';
}

function addSubtitleOption(path, label) {
  if (!path) return;
  if (player.subtitles.some((x) => x.path === path)) return;
  player.subtitles.push({ path, label: label || path.split(/[\\/]/).pop() });
  player.subOrigins[path] = subtitleOrigin(path, label);
  const name = label || path.split(/[\\/]/).pop();
  ['playerSubSelect', 'playerSubSelect2'].forEach((id) => {
    const sel = $(id);
    if (!sel) return;
    const opt = document.createElement('option');
    opt.value = path;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

async function loadSubtitle(path, secondary = false, options = {}) {
  if (!path) {
    // Altyazi kapatilinca LISTE de temizlenmeli. Eskiden yalnizca overlay
    // siliniyordu; sagda 29 kart oldugu gibi kaliyor, tiklaninca hicbir sey
    // olmuyordu (hayalet liste).
    if (secondary) {
      player.cues2 = [];
      player.activeIdx2 = -1;
      player.sub2Path = '';
      const ov2 = $('subtitleOverlay2');
      if (ov2) ov2.textContent = '';
    } else {
      player.cues = [];
      player.activeIdx = -1;
      player.subPath = '';
      player.subRaw = '';
      renderSeekMarkers(defaultMarkers());
      if ($('applyOffsetToFile')) $('applyOffsetToFile').classList.add('hidden');
    }
    renderCueList($('cueSearch') ? $('cueSearch').value : '');
    updateSubtitleChips();
    updateMakeTransState();
    renderCue();
    return;
  }
  const gen = currentGeneration();
  const res = await window.api.readSubtitle(path);
  // Okuma sirasinda baska videoya gecildiyse sonucu AT (eski altyazi yenisine
  // baglanmasin). Ayni video icinde iki altyazi hizli secilirse de gec gelen
  // ilk okuma sonuncuyu ezmesin diye yol karsilastirilir.
  if (staleGeneration(gen)) return;
  if (!res || !res.ok) {
    logLine(`Altyazı okunamadı: ${(res && res.error) || 'bilinmeyen hata'}`, 'error');
    return;
  }
  const selNow = secondary ? $('playerSubSelect2') : $('playerSubSelect');
  // Bos secim de bilincli bir secimdir ("Altyazi yok" / "Kapali"). Okuma
  // surerken temizlendiyse gec kalan dosyayi tekrar yukleme.
  if (selNow && selNow.value !== path) return;
  let cues = parseSubtitles(res.text);
  if (!secondary) cues = applyCueQuality(cues, player.cueQualitySource);
  if (res.note) logLine(`Altyazı kodlaması: ${res.note}`, 'warn');
  hideWordInspector();
  if (secondary) {
    player.cues2Raw = cues;                 // ham hali: birlestirme kapatilinca geri donulur
    player.cues2 = player.mergeCont ? mergeCueContinuation(cues) : cues;
    player.activeIdx2 = -1;
    player.sub2Path = path;
    renderCueList($('cueSearch') ? $('cueSearch').value : '');   // kartlara ceviri satiri gelsin
  } else {
    player.cuesRaw = cues;
    player.cues = player.mergeCont ? mergeCueContinuation(cues) : cues;
    player.activeIdx = -1;
    player.subPath = path;
    player.subRaw = res.text;
    player.subFormat = /\.(ass|ssa)$/i.test(path) ? 'ass'
                     : /\.vtt$/i.test(path) ? 'vtt' : 'srt';
    renderCueList($('cueSearch') ? $('cueSearch').value : '');
  }
  // Kullanici altyaziyi acikca yukledi; gizliyken sessizce gizli kalmasi
  // "ekledim ama gorunmuyor" sikayetinin ta kendisiydi.
  if (player.subsHidden) {
    setSubtitlesVisible(true);
    logLine('Altyazı gizliydi — otomatik açıldı.', 'warn');
  }
  updateSubtitleChips();
  updateMakeTransState();
  updatePlayerAutoSyncState();
  renderCue();
  scheduleBrowserOverlaySync();
  if (!options.silent) {
    logLine(`${secondary ? 'Karşılaştırma altyazısı' : 'Altyazı'} yüklendi: `
      + `${path.split(/[\\/]/).pop()} (${cues.length} blok)`, 'success');
  }
}

// Videonun yanindaki altyazilari bul, listeye ekle, ilkini otomatik yukle.
// Boylece video secince altyazi zaten ekranda olur.
async function attachSiblingSubtitles(videoPath, autoLoad = true) {
  if (!videoPath || !window.api.findSiblingSubs) return;
  const gen = currentGeneration();
  const res = await window.api.findSiblingSubs(videoPath);
  if (staleGeneration(gen)) return;      // bu arada baska videoya gecilmis
  const files = (res && res.files) || [];
  if (!files.length) return;
  files.forEach((f) => addSubtitleOption(f));
  if (autoLoad && !player.cues.length) {
    $('playerSubSelect').value = files[0];
    await loadSubtitle(files[0]);
  }
  if (files.length > 1) {
    logLine(`${files.length} altyazı bulundu (ikinci altyazı listesinden seçebilirsin).`, 'info');
  }
}

function openPlayer() {
  $('playerLayer').classList.remove('hidden');
  setWorkspaceMode(player.workspaceMode, false);
  // SIRA ONEMLI: once kaynak acilir (bu, medyaya bagli durumu SIFIRLAR), sonra
  // altyazilar iliskilendirilir. Ters sirada, az once eklenen "son isin ciktilari"
  // hemen siliniyordu ve cikti baska klasordeyse hic gorunmuyordu.
  if (state.lastJobVideo) {
    player.openIntent++;
    player.pendingAutoOpen = null;
    $('playerVideoPath').textContent = state.lastJobVideo;
    setPlayerSource(pathToFileUrl(state.lastJobVideo),
                    state.lastJobVideo.split(/[\\/]/).pop(),
                    mediaKeyFor('local', state.lastJobVideo),
                    { localPath: state.lastJobVideo });
  }
  const outputs = (state.outputFiles || []).filter((f) => /\.(srt|vtt|ass|ssa)$/i.test(f));
  outputs.forEach((f) => addSubtitleOption(f));
  // Is ciktisi varsa onu deterministik olarak birincil tut. Klasor taramasi
  // asenkron tamamlanip cues henuz bosken kardes dosyayi secerek cikti yuklemesini
  // yarista iptal etmesin; bu durumda kardesler yalnizca seceneklere eklenir.
  if (state.lastJobVideo) attachSiblingSubtitles(state.lastJobVideo, outputs.length === 0);
  // Isin kendi ciktisi varsa onu birincil altyaziya yukle (kardes taramasi
  // asenkron; o da bosalti doldurmaya calisir, ikisi ayni dosyayi bulur)
  if (outputs.length && !player.cues.length) {
    $('playerSubSelect').value = outputs[0];
    loadSubtitle(outputs[0]);
  }
}

function closePlayer() {
  const video = $('playerVideo');
  // Kapanirken suren klasor/probe istekleri katmani yeniden acmasin.
  player.openIntent++;
  player.probeRequestSeq++;
  player.pendingAutoOpen = null;
  player.pendingLibrarySeek = null;
  player.pendingSubs = null;
  if (video) video.pause();
  flushWatchState(false, true);
  destroyHls();
  if (window.api.hideBrowser) window.api.hideBrowser().catch(() => {});
  $('playerLayer').classList.add('hidden');
}

async function playPlaylistDelta(delta) {
  const nextIndex = player.playlistIndex + delta;
  if (nextIndex < 0 || nextIndex >= player.playlist.length) return false;
  const files = player.playlist.slice();
  const target = files[nextIndex];
  await openLocalMedia(target, 0, files);
  const video = $('playerVideo');
  if (video) video.play().catch(() => {});
  return true;
}

function pathToFileUrl(p) {
  const norm = String(p).replace(/\\/g, '/');
  return 'file:///' + encodeURI(norm).replace(/^file:\/\/\//, '').replace(/#/g, '%23');
}

// ---- gorunum modlari: Sinema / Okuma / Calisma ----
// Ayni oynatici, farkli hiyerarsi: sinemada panel kapali, okumada ~%38,
// calismada ~%48 ve daha buyuk metin.
const VIEW_MODES = { cinema: '0%', reading: '38%', study: '48%' };

// Grid sutun SEKLI degistiginde (mod gecisi, panel daraltma) gecisi tek kare
// kapat: Chrome farkli bicimdeki track listelerini interpolate edemiyor ve
// gecis baslangic degerinde takiliyor - panel 0 genislikte kaliyordu.
function snapGridColumns() {
  const body = document.querySelector('.player-body');
  if (!body) return;
  body.classList.add('no-grid-anim');
  void body.offsetWidth;                    // reflow: yeni deger gecissiz uygulansin
  setTimeout(() => body.classList.remove('no-grid-anim'), 50);
}

function setViewMode(mode) {
  if (!VIEW_MODES[mode]) mode = 'reading';
  player.viewMode = mode;
  const layer = $('playerLayer');
  layer.classList.remove('mode-cinema', 'mode-reading', 'mode-study');
  layer.classList.add(`mode-${mode}`);
  if (mode !== 'cinema') {
    layer.style.setProperty('--side-w', VIEW_MODES[mode]);
    // Sinemadan cikarken hangi duzene donecegimizi bilelim
    player.lastSideMode = mode;
    try { localStorage.setItem('playerLastSideMode', mode); } catch (_) {}
  }
  snapGridColumns();
  scheduleBrowserBounds();
  $$('.view-modes .vm').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  const sidebarButton = $('playerSidebarToggle');
  if (sidebarButton) {
    const shown = sidebarIsVisible();
    sidebarButton.classList.toggle('active', shown);
    sidebarButton.setAttribute('aria-pressed', shown ? 'true' : 'false');
    sidebarButton.title = shown ? 'Altyazı panelini gizle' : 'Altyazı panelini göster';
  }
  try { localStorage.setItem('playerViewMode', mode); } catch (_) {}
  // Mod degisince panel genisligi degisir; aktif satiri yeniden ortala
  setTimeout(highlightCueRow, 60);
}

function setSideWidth(px) {
  const layer = $('playerLayer');
  const total = layer.getBoundingClientRect().width || window.innerWidth;
  // Rapordaki sinirlar: en az 420px, en cok ~720px (ve videoya yer kalsin)
  const w = Math.max(420, Math.min(720, Math.min(px, total - 360)));
  layer.style.setProperty('--side-w', `${w}px`);
  scheduleBrowserBounds();
  try { localStorage.setItem('playerSideWidth', String(w)); } catch (_) {}
}

// ---- olay bağlantıları ----
// Gorunum modu dugmeleri + kalici genislik
$$('.view-modes .vm').forEach((b) => {
  b.addEventListener('click', () => setViewMode(b.dataset.mode));
});
(function initPlayerLayout() {
  let mode = 'reading';
  let width = 0;
  try {
    mode = localStorage.getItem('playerViewMode') || 'reading';
    width = parseInt(localStorage.getItem('playerSideWidth') || '0', 10);
    // Sinema modunda kapatilip acildiysa: yan panel dugmesi hangi duzene
    // donecegini bilsin, yoksa hep 'reading'e duserdi
    player.lastSideMode = localStorage.getItem('playerLastSideMode') || 'reading';
  } catch (_) {}
  setViewMode(mode);
  if (width) setSideWidth(width);
  bindTranscriptScroll();
  bindCueListDelegation();
  updateMakeTransState();
  const lookupSel = $('wordLookupSource');
  if (lookupSel) {
    try {
      const saved = localStorage.getItem('wordLookupSource');
      if (saved && WORD_LOOKUP_SOURCES[saved]) lookupSel.value = saved;
    } catch (_) {}
    lookupSel.addEventListener('change', () => {
      try { localStorage.setItem('wordLookupSource', lookupSel.value); } catch (_) {}
    });
  }
  loadSubtitleStyle();
  bindSubtitleStyleControls();
  // Ortam isigi ve basili-tut-hizlan tercihleri
  try {
    player.ambientOn = localStorage.getItem('ambientMode') !== '0';
    player.holdSpeed = localStorage.getItem('holdSpeed') !== '0';
  } catch (_) {}
  if ($('ambientMode')) {
    $('ambientMode').checked = player.ambientOn;
    $('ambientMode').addEventListener('change', (e) => setAmbient(e.target.checked));
  }
  if ($('holdSpeedOn')) {
    $('holdSpeedOn').checked = player.holdSpeed;
    $('holdSpeedOn').addEventListener('change', (e) => {
      player.holdSpeed = e.target.checked;
      try { localStorage.setItem('holdSpeed', e.target.checked ? '1' : '0'); } catch (_) {}
    });
  }
  bindHoldToSpeed();
  if ($('abLoopBtn')) $('abLoopBtn').addEventListener('click', toggleAbLoop);
  if ($('shotBtn')) $('shotBtn').addEventListener('click', capturePlayerFrame);
  if ($('helpBtn')) {
    $('helpBtn').addEventListener('click', () => $('shortcutHelp').classList.toggle('hidden'));
  }
  if ($('shortcutHelp')) {
    $('shortcutHelp').addEventListener('click', () => $('shortcutHelp').classList.add('hidden'));
  }
  makeSubtitleDraggable($('subtitleOverlay'), 'bottom');
  makeSubtitleDraggable($('subtitleOverlay2'), 'top');
  loadSubtitlePos();
})();

// Panel genisligini surukleyerek ayarla
if ($('sideResizer')) {
  const rz = $('sideResizer');
  let dragging = false;
  rz.addEventListener('mousedown', (e) => {
    dragging = true;
    rz.classList.add('dragging');
    // Surukleme sirasinda grid gecis animasyonu kapatilir, yoksa el takip etmez
    const body = document.querySelector('.player-body');
    if (body) body.classList.add('resizing');
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const layer = $('playerLayer').getBoundingClientRect();
    setSideWidth(layer.right - e.clientX);
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    rz.classList.remove('dragging');
    const body = document.querySelector('.player-body');
    if (body) body.classList.remove('resizing');
    highlightCueRow();
  });
}

// Ayar cekmecesi
function setSettingsDrawer(open) {
  const d = $('settingsDrawer');
  if (!d) return;
  const layer = $('playerLayer');
  if (open) hideWordInspector();
  // Panel daraltilmisken ayarlari acmak ARTIK paneli zorla acmiyor: cekmece
  // (sinema modundaki gibi) videonun ustunde bagimsiz bir katman olarak cikar.
  // Eskiden 'sidebar-collapsed' kaldiriliyordu ve dislye basinca arkada
  // istenmeden transkript paneli de aciliyordu.
  d.classList.toggle('hidden', !open);
  if (layer) layer.classList.toggle('settings-open', open);
  const g = $('toggleSettings');
  if (g) g.classList.toggle('active', open);
  const head = $('playerHeadSettings');
  if (head) {
    head.classList.toggle('active', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  const layout = $('playerLayoutQuick');
  if (layout) layout.setAttribute('aria-expanded', open ? 'true' : 'false');
}

if ($('toggleSettings')) {
  $('toggleSettings').addEventListener('click', () => {
    setSettingsDrawer($('settingsDrawer').classList.contains('hidden'));
  });
}
if ($('closeSettings')) $('closeSettings').addEventListener('click', () => setSettingsDrawer(false));

// Trancy tarzı üst hızlı eylemler: aynı oynatıcı yeteneklerini daha görünür
// noktalara taşır; mevcut alt araçlar ve klavye kısayolları aynen çalışmaya devam eder.
//
// Bu ucu ANAHTAR gibi davranir. Onceden hepsi setSettingsDrawer(TRUE) cagiriyordu:
// panel bir kez acildiktan sonra ayni dugmeye basmak hicbir sey yapmiyordu, dugme
// da "aktif" kalip acikmis gibi duruyordu - kullanicida "ayarlar tusu calismiyor"
// olarak gorunuyordu. Artik hedefe atlar, zaten hedefteyse kapatir.
function drawerIsOpen() {
  const d = $('settingsDrawer');
  return !!d && !d.classList.contains('hidden');
}

function toggleDrawerAt(tabName, focusSel) {
  const tab = tabName ? document.querySelector(`.tabs .tab[data-ptab="${tabName}"]`) : null;
  const hedefteyiz = !tabName || (tab && tab.classList.contains('active'));
  if (drawerIsOpen() && hedefteyiz) { setSettingsDrawer(false); return; }
  setSettingsDrawer(true);
  if (tab) tab.click();
  if (focusSel) document.querySelector(focusSel)?.focus();
}

if ($('playerHeadSettings')) {
  $('playerHeadSettings').addEventListener('click', () => toggleDrawerAt(null, null));
}
if ($('playerLayoutQuick')) {
  $('playerLayoutQuick').addEventListener('click', () => {
    toggleDrawerAt(null, '.player-layout-section .vm');
  });
}
// Panel GERCEKTEN gorunuyor mu? Sinema modunda CSS `display:none` veriyor;
// yalnizca 'sidebar-collapsed' sinifina bakmak yaniltir.
function sidebarIsVisible() {
  const layer = $('playerLayer');
  if (!layer) return false;
  return player.viewMode !== 'cinema' && !layer.classList.contains('sidebar-collapsed');
}

function setPlayerSidebarCollapsed(collapsed) {
  const layer = $('playerLayer');
  const button = $('playerSidebarToggle');
  if (!layer) return;
  const next = !!collapsed;
  layer.classList.toggle('sidebar-collapsed', next);
  snapGridColumns();
  scheduleBrowserBounds();
  if (button) {
    const shown = sidebarIsVisible();
    button.classList.toggle('active', shown);
    button.setAttribute('aria-pressed', shown ? 'true' : 'false');
    button.title = shown ? 'Altyazı panelini gizle' : 'Altyazı panelini göster';
  }
  if (next) setSettingsDrawer(false);
  setTimeout(highlightCueRow, 80);
}
if ($('playerSidebarToggle')) {
  $('playerSidebarToggle').addEventListener('click', () => {
    if (sidebarIsVisible()) { setPlayerSidebarCollapsed(true); return; }
    // Sinema modunda panel CSS ile gizli: sinifi temizlemek YETMEZ, moddan
    // cikmak gerekir. Eskiden dugme sinifi bir acip bir kapatiyor ama ekranda
    // hicbir sey degismiyordu - kullanici paneli geri getiremiyordu.
    if (player.viewMode === 'cinema') setViewMode(player.lastSideMode || 'reading');
    setPlayerSidebarCollapsed(false);
  });
}
if ($('playerHeadFullscreen')) {
  $('playerHeadFullscreen').addEventListener('click', () => $('fullscreenBtn')?.click());
}
if ($('playerBookmark')) {
  $('playerBookmark').addEventListener('click', toggleCueSaved);
}
if ($('playerQuickDownload')) {
  $('playerQuickDownload').addEventListener('click', () => toggleDrawerAt('yt', '#playerDownload'));
}
function openYoutubePanelAndProbe(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) {
    logLine("YouTube URL'si boş.", 'warn');
    $('playerQuickYtUrl')?.focus();
    return;
  }
  const hiddenUrl = $('playerYtUrl');
  if (hiddenUrl) hiddenUrl.value = url;
  const tab = document.querySelector('.tabs .tab[data-ptab="yt"]');
  if (tab) tab.click();
  setSettingsDrawer(true);
  const requestSeq = ++player.probeRequestSeq;
  const launch = () => {
    if (requestSeq !== player.probeRequestSeq) return;
    const probe = $('playerProbe');
    if (!probe) return;
    if (probe.disabled) {
      setTimeout(launch, 80);
      return;
    }
    if (hiddenUrl) hiddenUrl.value = url;
    probe.click();
  };
  launch();
}
if ($('playerQuickYtLoad')) {
  $('playerQuickYtLoad').addEventListener('click', () => openYoutubePanelAndProbe($('playerQuickYtUrl')?.value));
}
if ($('playerQuickYtUrl')) {
  $('playerQuickYtUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openYoutubePanelAndProbe(e.currentTarget.value);
    }
  });
}
if ($('sideSubtitleLayout')) {
  $('sideSubtitleLayout').addEventListener('click', () => {
    setPlayerSidebarCollapsed(false);
    setSettingsDrawer(true);
  });
}
if ($('sideSubtitleExport')) {
  $('sideSubtitleExport').addEventListener('click', async () => {
    if (!player.subPath) {
      logLine('Önce bir altyazı dosyası yükle.', 'warn');
      setSettingsDrawer(true);
      return;
    }
    const result = await window.api.openPath(player.subPath);
    if (result) logLine(`Altyazı açılamadı: ${result}`, 'error');
  });
}

// Alt arac cubugu — mevcut kisayollarin gorunur karsiliklari
if ($('cuePrevBtn')) $('cuePrevBtn').addEventListener('click', () => stepCue(-1));
if ($('cueNextBtn')) $('cueNextBtn').addEventListener('click', () => stepCue(1));
if ($('cueReplayBtn')) $('cueReplayBtn').addEventListener('click', replayCue);
if ($('cueCopyBtn')) $('cueCopyBtn').addEventListener('click', copyCue);
if ($('cueSaveBtn')) $('cueSaveBtn').addEventListener('click', toggleCueSaved);
if ($('savedOnlyBtn')) $('savedOnlyBtn').addEventListener('click', toggleSavedOnly);
if ($('qualityOnlyBtn')) $('qualityOnlyBtn').addEventListener('click', toggleQualityOnly);
if ($('clearCueSearch')) $('clearCueSearch').addEventListener('click', () => {
  const search = $('cueSearch');
  if (!search) return;
  search.value = '';
  search.dispatchEvent(new Event('input'));
  search.focus();
});
if ($('closeWordInspector')) $('closeWordInspector').addEventListener('click', hideWordInspector);
if ($('wordSaveBtn')) $('wordSaveBtn').addEventListener('click', toggleWordSaved);
if ($('wordCopyBtn')) $('wordCopyBtn').addEventListener('click', copySelectedWord);
if ($('wordLookupBtn')) $('wordLookupBtn').addEventListener('click', lookupSelectedWord);

if ($('autoFollow')) {
  $('autoFollow').addEventListener('change', (e) => {
    player.autoFollow = e.target.checked;
    player.userScrolled = false;
    if (player.autoFollow) highlightCueRow();
  });
}
if ($('backToActive')) {
  $('backToActive').addEventListener('click', () => {
    player.userScrolled = false;
    highlightCueRow();
    $('backToActive').classList.add('hidden');
  });
}
// Kaynak/Ceviri anahtarlari sinifi KATMANA koyar. Eskiden yalnizca
// #playerSide'a konuyordu: soldaki listede satir gizleniyor ama VIDEO
// uzerindeki altyazi olduğu gibi kaliyordu - "kaynagi kapattim, hala
// gorunuyor" sikayeti tam olarak buydu.
function onSubtitleTrackToggle() {
  const tracks = subtitleTrackState();
  applySubtitleTrackSelection(tracks.source, tracks.translation);
  if (tracks.source || tracks.translation) {
    player.lastSubtitleMode = tracks.source && tracks.translation ? 'both'
      : tracks.source ? 'source' : 'translation';
    setSubtitlesVisible(true);
  } else {
    setSubtitlesVisible(false);
  }
}
if ($('showSource')) $('showSource').addEventListener('change', onSubtitleTrackToggle);
if ($('showTranslation')) $('showTranslation').addEventListener('change', onSubtitleTrackToggle);

async function startProgressivePlayerTranscription() {
  if (state.running || state.queueRunning) {
    logLine('Zaten bir iş çalışıyor — bitmesini bekleyin.', 'warn');
    return;
  }
  const opts = buildOptsFromUI();
  const key = player.mediaKey || '';
  if (key.startsWith('youtube:')) {
    const url = (player.ytInfo && player.ytInfo.sourceUrl) || $('playerYtUrl').value.trim();
    if (!url) { logLine('YouTube adresi yok — önce videoyu yükleyin.', 'error'); return; }
    opts.youtube = url;
    delete opts.input;
    const lock = $('playerAudioLock') && $('playerAudioLock').checked ? currentAudioLock() : null;
    opts.youtubeAudioLang = $('playerAudioLock') && $('playerAudioLock').checked
      ? (player.playbackAudioLang || (lock && lock.lang) || '') : '';
  } else {
    const path = player.localPath || ($('playerVideoPath') ? $('playerVideoPath').textContent : '');
    if (!path || path === 'Seçilmedi') { logLine('Önce bir video aç.', 'error'); return; }
    opts.input = path;
    delete opts.youtube;
  }
  // Oynatici icin SRT zorunlu: farkli zaman araliklari en sonda tek, atomik
  // dosyada birlestirilir. Kullanici ana ekrandaki kalici format secimini kaybetmez.
  opts.formats = 'srt';
  opts.clipStart = '';
  opts.clipEnd = '';
  const problem = optsProblem(opts);
  if (problem) { logLine(problem, 'error'); return; }

  const video = $('playerVideo');
  const ranges = progressiveRanges(Number(video && video.duration), Number(video && video.currentTime));
  player.job = { running: true, mediaKey: player.mediaKey, kind: 'progressive',
    ranges, rangeIndex: 0, baseOpts: opts, liveSource: [], liveTranslation: new Map(),
    sourceFile: '', translationFile: '', awaitingExit: false };
  state.running = true;
  state.cancelled = false;
  state.startTime = Date.now();
  state.outputFiles = [];
  $('startBtn').classList.add('hidden');
  $('cancelBtn').classList.remove('hidden');
  $('playerJobBar').classList.remove('hidden');
  $('playerJobFill').style.width = '0%';
  $('playerJobText').textContent = ranges.length > 1
    ? 'Önce izlediğin bölüm hazırlanıyor…' : 'Altyazı hazırlanıyor…';
  logLine(`Altyazı izleme konumundan başlatıldı · ${ranges.length} aşama`, 'info');
  await startProgressiveChunk(player.job);
}

// "Altyazı oluştur": ilk olarak oynatma konumunun onundeki 10 dakikayi işler;
// izleyici beklemeden devam ederken kalan kisimlar arkada tamamlanir.
if ($('makeSubsBtn')) {
  $('makeSubsBtn').addEventListener('click', startProgressivePlayerTranscription);
}

if ($('playerJobCancel')) $('playerJobCancel').addEventListener('click', async () => {
  if (!player.job || !state.running) return;
  state.cancelled = true;
  player.job.cancelled = true;
  player.job.running = false;
  player.job.awaitingExit = true;
  const cancelResult = await window.api.cancelTranscribe();
  if (!cancelResult || !cancelResult.ok) {
    player.job.awaitingExit = false;
    player.job.cancelled = false;
    state.cancelled = false;
    player.job = null;
    logLine(`İptal isteği tamamlanamadı: ${(cancelResult && cancelResult.error) || 'çalışan süreç yok'}`, 'warn');
  }
  state.running = false;
  state.forceTranslate = false;
  $('startBtn').classList.remove('hidden');
  $('cancelBtn').classList.add('hidden');
  $('playerJobText').textContent = 'Altyazı işi iptal edildi.';
  setTimeout(() => $('playerJobBar').classList.add('hidden'), 2000);
});

// "Ceviri olustur": EKRANDA YUKLU altyaziyi cevirir. Ses indirme ve Whisper
// calismaz; zaman kodlarina dokunulmaz. Sonuc ikinci altyazi olarak yuklenir.
function updateMakeTransState() {
  const btn = $('makeTransBtn');
  if (!btn) return;
  const ok = !!player.subPath && player.cues.length > 0;
  btn.disabled = !ok;
  btn.title = ok
    ? 'Yüklü altyazıyı çevirir — Whisper yeniden çalışmaz, zaman kodları korunur'
    : 'Önce bir altyazı yükleyin (soldaki listeden veya dosyadan)';
}

function updatePlayerAutoSyncState() {
  const btn = $('playerAutoSync');
  const hint = $('playerAutoSyncHint');
  if (!btn) return;
  const ready = !!player.localPath && !!player.subPath && player.cues.length > 0;
  btn.disabled = !ready || state.running;
  btn.title = ready
    ? 'Ses ritmini analiz eder; sabit kaymayı ve zamanla büyüyen sürüklenmeyi düzeltir'
    : 'Otomatik senkron için yerel video ve kaynak altyazı gerekli';
  if (hint) hint.textContent = ready
    ? 'Özgün dosyayı değiştirmez; .synced.srt kopyası oluşturup otomatik yükler.'
    : 'YouTube akışında önce videoyu indir; yerel video ve altyazı hazır olunca kullanılabilir.';
}

if ($('playerAutoSync')) $('playerAutoSync').addEventListener('click', async () => {
  if (state.running || state.queueRunning) { logLine('Bir iş çalışırken senkronlama yapılamaz.', 'warn'); return; }
  if (!player.localPath || !player.subPath) { updatePlayerAutoSyncState(); return; }
  const opts = buildOptsFromUI();
  opts.input = player.localPath;
  delete opts.youtube;
  opts.syncSubs = true;
  opts.syncSrt = player.subPath;
  opts.syncFixFramerate = true;
  opts.syncPiecewise = true;
  opts.translate = false;
  opts.llmPostprocess = false;
  opts.diarize = false;
  state.running = true;
  state.cancelled = false;
  state.startTime = Date.now();
  player.job = { running: true, mediaKey: player.mediaKey, kind: 'sync', liveSource: [] };
  $('playerJobBar').classList.remove('hidden');
  $('playerJobFill').style.width = '0%';
  $('playerJobText').textContent = 'Ses ritmi analiz ediliyor…';
  updatePlayerAutoSyncState();
  const result = await startTranscribeSafe(opts);
  if (!result || !result.ok) {
    state.running = false;
    player.job = null;
    $('playerJobText').textContent = `Senkron başlatılamadı: ${(result && result.error) || 'bilinmeyen hata'}`;
    logLine($('playerJobText').textContent, 'error');
    updatePlayerAutoSyncState();
  }
});

if ($('makeTransBtn')) {
  $('makeTransBtn').addEventListener('click', async () => {
    if (state.running || state.queueRunning) {
      logLine('Zaten bir iş çalışıyor — bitmesini bekleyin.', 'warn');
      return;
    }
    if (!player.subPath || !player.cues.length) {
      logLine('Önce bir altyazı yükleyin.', 'error');
      return;
    }
    const opts = buildOptsFromUI();
    opts.translateOnly = true;
    opts.translate = true;
    opts.input = player.subPath;
    delete opts.youtube;
    const browserTrack = player.browserTracks.find((track) =>
      track.id === player.browserLoadedTrackId && track.path === player.subPath) || null;
    const browserLanguage = browserTrackSourceLanguage(browserTrack);
    // Tarayıcı altyazısının kendi dil bilgisi, ana ekranda önceki işten kalmış
    // dil seçiminden daha güvenilirdir. Yanlış kaynak dil promptu özellikle kısa
    // repliklerde yanlış anlam ve hitap seçimine yol açıyordu.
    if (browserLanguage) opts.language = browserLanguage;
    const problem = optsProblem(opts);
    if (problem) { logLine(problem, 'error'); setSettingsDrawer(true); return; }

    state.running = true;
    state.cancelled = false;
    state.outputFiles = [];
    player.job = { running: true, mediaKey: player.mediaKey, kind: 'translate',
      liveSource: player.cues.slice(), liveTranslation: new Map(),
      browserTrackId: browserTrack ? browserTrack.id : '',
      browserSourceCueCount: browserTrack ? Number(browserTrack.cueCount || 0) : 0 };
    const bar = $('playerJobBar');
    if (bar) {
      bar.classList.remove('hidden');
      $('playerJobFill').style.width = '0%';
      $('playerJobText').textContent = `Çeviri başlatılıyor · önceki/sonraki ${Number(opts.translateContext || 0)} satır`;
    }
    logLine(`Çeviri başlatıldı: ${player.subPath.split(/[\\/]/).pop()} → `
      + `${opts.translateTo || 'tr'} · kaynak ${opts.language || 'otomatik'} · `
      + `bağlam ±${Number(opts.translateContext || 0)} satır`, 'info');
    const r = await startTranscribeSafe(opts);
    if (!r || !r.ok) {
      state.running = false;
      player.job = null;
      if (bar) bar.classList.add('hidden');
      logLine(`Çeviri başlatılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'error');
    }
  });
}

// Tek tikla "altyazi + ceviri": kullanicinin istedigi tek adim. Ayri ayri
// "Altyazi olustur" sonra "Ceviri olustur" yapmak yerine tek iste ikisi de
// uretilir; biten iste zaten kaynak birincil, ceviri ikincil altyazi olarak
// yukleniyor (playerJobEvent 'done' dali).
if ($('quickSubsBtn')) {
  $('quickSubsBtn').addEventListener('click', () => {
    if (state.running || state.queueRunning) {
      logLine('Zaten bir iş çalışıyor — bitmesini bekleyin.', 'warn');
      osd('Bir iş zaten çalışıyor');
      return;
    }
    if (!$('translateApiKey') || !$('translateApiKey').value.trim()) {
      logLine('Çeviri için API anahtarı gerekli. Gelişmiş ayarlar → Çeviri → API Key.', 'error');
      osd('Çeviri API anahtarı yok');
      toggleDrawerAt(null, '#translateApiKey');
      return;
    }
    // Kullanicinin kalici ayarina DOKUNMA: yalnizca bu is icin ceviriyi ac.
    state.forceTranslate = true;
    osd('Altyazı + çeviri hazırlanıyor…', 1600);
    $('makeSubsBtn').click();
    // Dogrulama takilip is HIC baslamadiysa bayragi hemen geri al; yoksa
    // kullanicinin ceviri kapali oldugu bir sonraki iste sessizce ceviri calisir.
    // (startBtn, ilk await'ten once state.running'i senkron kuruyor.)
    if (!state.running && !state.queueRunning) state.forceTranslate = false;
  });
}

if ($('historyList')) {
  $('historyList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.history-item')?.dataset.id;
    const h = historyCache.find((x) => x.id === id);
    if (!h) return;
    if (btn.dataset.act === 'play') openHistoryItem(h);
    else if (btn.dataset.act === 'folder') {
      const f = (h.files || [])[0];
      if (f) window.api.openPath(f.replace(/[\\/][^\\/]+$/, ''));
    } else if (btn.dataset.act === 'del') {
      await window.api.removeHistory(id);
      refreshHistory();
    }
  });
}
refreshHistory();
if ($('historySearch')) $('historySearch').addEventListener('input', renderHistory);
if ($('historyClear')) {
  $('historyClear').addEventListener('click', async () => {
    if (!historyCache.length) return;
    await window.api.clearHistory();
    refreshHistory();
  });
}

async function handleWatchLibraryAction(e) {
  const button = e.target.closest('[data-watch-action]');
  if (!button) return;
  const item = watchItemByKey(button.dataset.key);
  if (!item) return;
  const action = button.dataset.watchAction;
  if (action === 'open' || action === 'hit' || action === 'restart') {
    openWatchLibraryItem(item, Number(button.dataset.seconds) || 0);
    if ($('sideTabSubs')) setSideTab('subs');
  } else if (action === 'collection') {
    const name = window.prompt('Koleksiyon adları (virgülle ayırın)', (item.collections || []).join(', '));
    if (name === null) return;
    const collections = [...new Set(name.split(',').map((x) => x.trim()).filter(Boolean))];
    await window.api.updateWatchItem({ key: item.key, collections, lastWatched: item.lastWatched });
    refreshWatchLibrary();
  } else if (action === 'complete') {
    if (player.mediaKey === item.key) {
      player.watchManualCompletedKey = item.key;
      player.watchManualCompleted = !item.completed;
    }
    await window.api.updateWatchItem({
      key: item.key,
      completed: !item.completed,
      position: item.completed ? 0 : item.duration,
      lastWatched: Date.now(),
    });
    refreshWatchLibrary();
  } else if (action === 'remove') {
    if (player.mediaKey === item.key) player.watchRemovedKey = item.key;
    await window.api.removeWatchItem(item.key);
    refreshWatchLibrary();
  }
}

refreshWatchLibrary();
if ($('playerLibraryPanel')) $('playerLibraryPanel').addEventListener('click', handleWatchLibraryAction);
if ($('playerLibraryFilter')) $('playerLibraryFilter').addEventListener('change', renderPlayerLibrary);
if ($('playerLibrarySearch')) {
  $('playerLibrarySearch').addEventListener('input', (e) => {
    clearTimeout(playerLibrarySearchTimer);
    const seq = ++player.playerLibrarySearchSeq;
    const q = e.target.value.trim();
    if (!q) {
      playerLibraryResults = watchLibraryCache;
      renderPlayerLibrary();
      return;
    }
    $('playerLibraryStatus').textContent = 'Başlıklar ve altyazılar aranıyor...';
    playerLibrarySearchTimer = setTimeout(async () => {
      let results = [];
      try { results = (await window.api.searchWatchLibrary(q)) || []; }
      catch (_) { results = []; }
      if (seq !== player.playerLibrarySearchSeq || ($('playerLibrarySearch')?.value || '').trim() !== q) return;
      playerLibraryResults = results;
      renderPlayerLibrary();
    }, 280);
  });
}

// --- arac cubugu gizle/goster ---
if ($('toolsToggle')) {
  const uygula = (acik) => {
    $('toolsToggle').setAttribute('aria-expanded', acik ? 'true' : 'false');
    document.querySelector('.side-bottom')?.classList.toggle('tools-collapsed', !acik);
    try { localStorage.setItem('playerToolsOpen', acik ? '1' : '0'); } catch (_) {}
    setTimeout(highlightCueRow, 60);
  };
  let acik = true;
  try { acik = localStorage.getItem('playerToolsOpen') !== '0'; } catch (_) {}
  uygula(acik);
  $('toolsToggle').addEventListener('click', () => {
    uygula($('toolsToggle').getAttribute('aria-expanded') !== 'true');
  });
}

// --- izlerken cumle birlestirme ---
if ($('playerMergeCont')) {
  try { player.mergeCont = localStorage.getItem('playerMergeCont') === '1'; } catch (_) {}
  $('playerMergeCont').checked = !!player.mergeCont;
  $('playerMergeCont').addEventListener('change', (e) => {
    player.mergeCont = e.target.checked;
    try { localStorage.setItem('playerMergeCont', player.mergeCont ? '1' : '0'); } catch (_) {}
    applyCueMerge();
    osd(player.mergeCont ? 'Cümleler birleştirildi' : 'Cümle birleştirme kapalı');
  });
}

// --- AI sohbet dinleyicileri ---
$$('.side-tab').forEach((b) => b.addEventListener('click', () => setSideTab(b.dataset.stab)));
if ($('aiChatSend')) $('aiChatSend').addEventListener('click', () => aiChatSend($('aiChatText').value));
if ($('aiChatText')) {
  $('aiChatText').addEventListener('input', autoGrowChatBox);
  $('aiChatText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiChatSend(e.target.value); }
  });
}
if ($('aiChatLog')) {
  $('aiChatLog').addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-chip');
    if (chip) aiChatSend(chip.dataset.ask);
  });
}
if ($('aiChatClear')) {
  $('aiChatClear').addEventListener('click', () => {
    player.chatHistory = [];
    const log = $('aiChatLog');
    [...log.querySelectorAll('.ai-msg')].forEach((e) => e.remove());
    $('aiChatEmpty')?.classList.remove('hidden');
  });
}

if ($('cueExplainBtn')) {
  $('cueExplainBtn').addEventListener('click', () => {
    if (player.activeIdx < 0) { logLine('Önce bir altyazı satırına gelin.', 'warn'); return; }
    askExplain('sentence', player.activeIdx, '');
  });
}
if ($('cueBetterBtn')) {
  $('cueBetterBtn').addEventListener('click', () => {
    if (player.activeIdx < 0) { logLine('Önce bir altyazı satırına gelin.', 'warn'); return; }
    askExplain('better', player.activeIdx, '');
  });
}
if ($('wordExplainBtn')) {
  $('wordExplainBtn').addEventListener('click', () => {
    const sel = player.selectedWord;
    if (!sel) { logLine('Önce bir kelimeye tıklayın.', 'warn'); return; }
    askExplain('word', sel.cueIndex, sel.word);
  });
}
if ($('aiAnswerClose')) {
  $('aiAnswerClose').addEventListener('click', () => $('aiAnswer').classList.add('hidden'));
}

if ($('openPlayer')) $('openPlayer').addEventListener('click', openPlayer);
if ($('closePlayer')) $('closePlayer').addEventListener('click', closePlayer);
if ($('playerBack')) $('playerBack').addEventListener('click', closePlayer);

if ($('playerVideo')) {
  const video = $('playerVideo');
  let _posTick = 0;
  video.addEventListener('timeupdate', () => {
    renderCue();
    const seek = $('playerSeek');
    if (player.isLive || !isFinite(video.duration)) {
      // Canli: toplam sure yok; gecen sureyi ve CANLI rozetini goster
      $('playerTime').textContent = `${pSecToTime(video.currentTime)} · CANLI`;
    } else if (video.duration) {
      seek.value = String((video.currentTime / video.duration) * 1000);
      $('playerTime').textContent = `${pSecToTime(video.currentTime)} / ${pSecToTime(video.duration)}`;
      updateSeekVisuals();
    }
    // Konumu 5 saniyede bir kaydet (her timeupdate'te yazmak ayar dosyasını yorar)
    const now = Date.now();
    if (!video.paused && player.watchSession) {
      const last = player.watchSession.lastClock || now;
      const elapsed = (now - last) / 1000;
      if (elapsed > 0 && elapsed < 10) player.watchSession.watchSeconds += elapsed;
      player.watchSession.lastClock = now;
      player.watchSession.endPosition = video.currentTime || 0;
    }
    if (now - _posTick > 5000) { _posTick = now; savePlayerPosition(); }
    if (now - player.watchSaveTick > 10000) {
      player.watchSaveTick = now;
      flushWatchState(false, false);
    }
  });
  video.addEventListener('progress', updateSeekVisuals);
  // A-B dongusu: B'ye gelince A'ya don
  video.addEventListener('timeupdate', () => {
    if (player.abA !== null && player.abB !== null && video.currentTime >= player.abB) {
      video.currentTime = player.abA;
    }
  });
  // Yukleniyor halkasi: tamponlama veya acilis sirasinda
  const spin = (on) => { const s = $('playerSpinner'); if (s) s.classList.toggle('hidden', !on); };
  video.addEventListener('waiting', () => spin(true));
  video.addEventListener('stalled', () => spin(true));
  video.addEventListener('loadstart', () => spin(true));
  video.addEventListener('playing', () => {
    spin(false);
    if (player.hls) {
      const activeHls = player.hls;
      clearTimeout(player.hlsRecoveryTimer);
      player.hlsRecoveryTimer = setTimeout(() => {
        if (player.hls === activeHls && !video.paused) {
          player.hlsMediaRecover = 0;
          player.hlsNetRecover = 0;
        }
      }, 10000);
    }
  });
  video.addEventListener('canplay', () => spin(false));
  video.addEventListener('error', () => spin(false));
  video.addEventListener('loadedmetadata', () => {
    if (player.isLive || !isFinite(video.duration)) {
      $('playerTime').textContent = '0:00 · CANLI';
      return;
    }
    $('playerTime').textContent = `0:00 / ${pSecToTime(video.duration)}`;
    updateSeekVisuals();
    maybeOfferResume();
    const pendingSeek = player.pendingLibrarySeek;
    if (pendingSeek && pendingSeek.key === player.mediaKey
        && pendingSeek.generation === currentGeneration()) {
      const seekTo = Math.max(0, Math.min(video.duration || 0, Number(pendingSeek.seconds) || 0));
      player.pendingLibrarySeek = null;
      if (seekTo > 0) video.currentTime = seekTo;
    }
    // Bölümler probe'dan gelmişti ama süre o an bilinmiyordu — şimdi çizilebilir
    const q = $('cueSearch') ? $('cueSearch').value.trim() : '';
    if (!q) renderSeekMarkers(defaultMarkers());
  });
  video.addEventListener('play', () => {
    showControls();
    if (player.ambientOn) startAmbient();
    if (!player.watchSession) beginWatchSession();
    if (player.watchSession) player.watchSession.lastClock = Date.now();
  });
  video.addEventListener('pause', () => {
    clearTimeout(player.idleTimer);
    $('playerStage').classList.remove('idle');
    savePlayerPosition();
    if (player.watchSession) player.watchSession.lastClock = 0;
    flushWatchState(false, true);
  });
  video.addEventListener('ended', async () => {
    await flushWatchState(true, true);
    if (player.autoNext) await playPlaylistDelta(1);
  });
  video.addEventListener('error', () => {
    logLine('Video açılamadı (format desteklenmiyor olabilir).', 'error');
  });

  $('playPause').addEventListener('click', () => {
    if (video.paused) video.play(); else video.pause();
  });
  $('playerSeek').addEventListener('input', (e) => {
    if (video.duration) video.currentTime = (e.target.value / 1000) * video.duration;
    updateSeekVisuals();
  });
  $('playerVolume').addEventListener('input', (e) => {
    video.volume = e.target.value / 100;
    syncVolumeFill();
  });
  syncVolumeFill();
  $('muteBtn').addEventListener('click', () => { video.muted = !video.muted; });

  // Hız: belgesellerde 1.25x, ağır aksanda 0.75x
  if ($('playerSpeed')) {
    $('playerSpeed').addEventListener('change', async (e) => {
      const rate = parseFloat(e.target.value) || 1;
      if (player.workspaceMode === 'browser' && window.api.browserCommand) {
        const result = await window.api.browserCommand('speed', rate).catch(() => null);
        if (!result || !result.ok) {
          e.target.value = String(player.browserRate || 1);
          osd('Web video hızı değiştirilemedi');
          return;
        }
        player.browserRate = Number(result.media && result.media.playbackRate) || rate;
      } else {
        video.playbackRate = rate;
      }
      scheduleSave();
    });
  }

  // CC: kaynak, ceviri veya kapali secimi. V kisayolu menuyu acmaz; son secilen
  // altyazi turunu hizlica gizleyip geri getirir.
  if ($('subToggle')) {
    $('subToggle').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('subtitleModeMenu');
      setSubtitleModeMenuOpen(!!menu && menu.classList.contains('hidden'));
    });
  }
  if ($('subtitleModeMenu')) {
    $('subtitleModeMenu').addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('[data-subtitle-mode]');
      if (item) setSubtitleMode(item.dataset.subtitleMode);
    });
  }
  document.addEventListener('click', (e) => {
    const wrap = $('subtitleModeWrap');
    if (wrap && !wrap.contains(e.target)) setSubtitleModeMenuOpen(false);
  });

  // Sahnede fare hareketi -> kontroller görünür, 2.5 sn sonra kaybolur
  const stage = $('playerStage');
  stage.addEventListener('mousemove', showControls);
  stage.addEventListener('mouseleave', () => {
    if (!video.paused && !player.editing) stage.classList.add('idle');
  });
  // Videoya tıkla: oynat/duraklat — çift tıkla: tam ekran
  video.addEventListener('click', () => {
    if (player.suppressClick) return;      // 2x basili tutmadan sonra gelen tik
    video.paused ? video.play() : video.pause();
  });
  video.addEventListener('dblclick', () => $('fullscreenBtn').click());

  // Zaman çubuğunda imleç: o andaki zaman + o anda ne söyleniyor
  const wrap = $('seekWrap');
  if (wrap) {
    wrap.addEventListener('mousemove', (e) => {
      if (!video.duration) return;
      const r = wrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const t = ratio * video.duration;
      const tip = $('seekTip');
      const i = findCueAt(player.cues, t - player.offset, -1);
      tip.textContent = i >= 0
        ? `${pSecToTime(t)} · ${player.cues[i].text.replace(/\n/g, ' ').slice(0, 60)}`
        : pSecToTime(t);
      tip.style.left = `${ratio * 100}%`;
      tip.classList.remove('hidden');
    });
    wrap.addEventListener('mouseleave', () => $('seekTip').classList.add('hidden'));
  }

  if ($('resumeGo')) {
    $('resumeGo').addEventListener('click', () => {
      const saved = player.positions[playerPositionKey()];
      if (saved && player.workspaceMode === 'browser') {
        window.api.browserCommand('seek', saved.t).then(() => window.api.browserCommand('play')).catch(() => {});
      } else if (saved) {
        video.currentTime = saved.t;
        video.play().catch(() => {});
      }
      $('resumeChip').classList.add('hidden');
    });
  }
  if ($('resumeDismiss')) {
    $('resumeDismiss').addEventListener('click', () => $('resumeChip').classList.add('hidden'));
  }
  $('fullscreenBtn').addEventListener('click', () => {
    const stage = $('playerStage');
    if (!document.fullscreenElement) stage.requestFullscreen();
    else document.exitFullscreen();
  });
}

// Klavye: oynatıcı açıkken boşluk/ok/F/Esc
document.addEventListener('keydown', (e) => {
  const layer = $('playerLayer');
  if (!layer || layer.classList.contains('hidden')) return;
  const video = $('playerVideo');
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (player.editing) return;
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); openCueEditor(); return; }
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); stepCue(-1); return; }
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); stepCue(1); return; }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replayCue(); return; }
  if (e.key === 'c' || e.key === 'C') { e.preventDefault(); copyCue(); return; }
  if (e.key === 'k' || e.key === 'K') { e.preventDefault(); toggleCueSaved(); return; }
  if ((e.key === 'w' || e.key === 'W') && player.selectedWord) { e.preventDefault(); toggleWordSaved(); return; }
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    e.preventDefault(); $('shortcutHelp').classList.toggle('hidden'); return;
  }
  if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleAbLoop(); return; }
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); capturePlayerFrame(); return; }
  if (player.workspaceMode === 'browser' && window.api.browserCommand) {
    if ((e.key === ',' || e.key === '.') && player.browserPaused) {
      e.preventDefault();
      stepBrowserFrame(e.key === '.' ? 1 : -1);
      return;
    }
    if (e.key === '<' || e.key === ',') { e.preventDefault(); nudgeSpeed(-1); return; }
    if (e.key === '>' || e.key === '.') { e.preventDefault(); nudgeSpeed(1); return; }
    let command = '', value;
    if (e.key === ' ') command = 'play-pause';
    else if (e.key === 'ArrowRight') { command = 'seek-relative'; value = 5; }
    else if (e.key === 'ArrowLeft') { command = 'seek-relative'; value = -5; }
    else if (e.key === 'j' || e.key === 'J') { command = 'seek-relative'; value = -10; }
    else if (e.key === 'l' || e.key === 'L') { command = 'seek-relative'; value = 10; }
    else if (e.key === 'm' || e.key === 'M') command = 'mute';
    else if (e.key === 'ArrowUp') { command = 'volume-relative'; value = .05; }
    else if (e.key === 'ArrowDown') { command = 'volume-relative'; value = -.05; }
    if (command) {
      e.preventDefault();
      window.api.browserCommand(command, value).catch(() => {});
      return;
    }
  }
  // Kare kare gezinme (duraklatilmisken) - altyazi sinirini ayarlarken ise yarar
  if ((e.key === ',' || e.key === '.') && video.paused) {
    e.preventDefault();
    video.currentTime += (e.key === '.' ? 1 : -1) / 25;      // ~1 kare (25 fps varsayimi)
    osd(e.key === '.' ? 'Kare ileri' : 'Kare geri', 600);
    return;
  }
  if (e.key === 'j' || e.key === 'J') { e.preventDefault(); video.currentTime -= 10; showControls(); osd('-10 sn'); return; }
  if (e.key === 'l' || e.key === 'L') { e.preventDefault(); video.currentTime += 10; showControls(); osd('+10 sn'); return; }
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); video.muted = !video.muted; showControls();
    osd(video.muted ? 'Ses kapalı' : 'Ses açık'); return; }
  if (e.key === 'v' || e.key === 'V') {
    e.preventDefault();
    setSubtitleModeMenuOpen(false);
    setSubtitlesVisible(player.subsHidden);       // tersine cevir
    const text = player.subsHidden ? 'Altyazılar kapatıldı' : 'Altyazılar gösteriliyor';
    osd(text);
    logLine(text, 'info');
    return;
  }
  // Altyazi gecikmesini izlerken ayarla — G geri, H ileri (0.1 sn adim)
  if (e.key === 'g' || e.key === 'G') { e.preventDefault(); nudgeOffset(-0.1); return; }
  if (e.key === 'h' || e.key === 'H') { e.preventDefault(); nudgeOffset(0.1); return; }
  if (e.key === '<' || e.key === ',') { e.preventDefault(); nudgeSpeed(-1); return; }
  if (e.key === '>' || e.key === '.') { e.preventDefault(); nudgeSpeed(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); setPlayerVolume(video.volume + 0.05); showControls();
    osd(`Ses %${Math.round(video.volume * 100)}`); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); setPlayerVolume(video.volume - 0.05); showControls();
    osd(`Ses %${Math.round(video.volume * 100)}`); return; }
  if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (e.key === 'ArrowRight') { video.currentTime += 5; showControls(); }
  else if (e.key === 'ArrowLeft') { video.currentTime -= 5; showControls(); }
  else if (e.key === 'f' || e.key === 'F') $('fullscreenBtn').click();
  else if (e.key === 'Escape') {
    const subMenu = $('subtitleModeMenu');
    if (subMenu && !subMenu.classList.contains('hidden')) { setSubtitleModeMenuOpen(false); return; }
    if (player.selectedWord) { hideWordInspector(); return; }
    const help = $('shortcutHelp');
    if (help && !help.classList.contains('hidden')) { help.classList.add('hidden'); return; }
    const drawer = $('settingsDrawer');
    if (drawer && !drawer.classList.contains('hidden')) { setSettingsDrawer(false); return; }
    if (document.fullscreenElement) document.exitFullscreen();
    else closePlayer();
  }
});

// Gecikme/hiz/ses: hem kontrolden hem klavyeden ayni yoldan degissin
function nudgeOffset(delta) {
  const el = $('subOffset');
  if (!el) return;
  const v = Math.max(-10, Math.min(10, (parseFloat(el.value) || 0) + delta));
  el.value = String(v);
  el.dispatchEvent(new Event('input'));
  scheduleSave();
  osd(`Gecikme ${v > 0 ? '+' : ''}${v.toFixed(1)} sn`);
  showControls();
}

async function stepBrowserFrame(dir) {
  const result = await window.api.browserCommand('frame-step', Number(dir || 0) / 25).catch(() => null);
  if (!result || !result.ok) {
    osd('Web videoda kare adımı uygulanamadı', 900);
    return;
  }
  if (result.media) player.browserTime = Number(result.media.currentTime) || player.browserTime;
  osd(dir > 0 ? 'Kare ileri' : 'Kare geri', 600);
  showControls();
}

async function nudgeSpeed(dir) {
  const sel = $('playerSpeed');
  const video = $('playerVideo');
  if (!sel || !video) return;
  const target = steppedPlaybackRate(sel.options, sel.value, dir);
  if (player.workspaceMode === 'browser' && window.api.browserCommand) {
    const result = await window.api.browserCommand('speed', target).catch(() => null);
    if (!result || !result.ok) {
      osd('Web video hızı değiştirilemedi', 900);
      return;
    }
    player.browserRate = Number(result.media && result.media.playbackRate) || target;
  } else {
    video.playbackRate = target;
  }
  sel.value = String(target);
  scheduleSave();
  osd(`${target}× hız`);
  showControls();
}

// Ses cubugu ozel cizildigi icin dolgu yuzdesini CSS'e biz veriyoruz.
function syncVolumeFill() {
  const el = $('playerVolume');
  if (el) el.style.setProperty('--vol', `${el.value}%`);
}

function setPlayerVolume(v) {
  const video = $('playerVideo');
  const el = $('playerVolume');
  if (!video) return;
  video.volume = Math.max(0, Math.min(1, v));
  if (el) { el.value = String(Math.round(video.volume * 100)); syncVolumeFill(); scheduleSave(); }
}

// Kaynak sekmeleri
$$('.tab[data-ptab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab[data-ptab]').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.ptab-content').forEach((c) => {
      c.classList.toggle('hidden', c.dataset.pcontent !== tab.dataset.ptab);
    });
  });
});

if ($('playerPickVideo')) {
  $('playerPickVideo').addEventListener('click', async () => {
    const files = await window.api.selectVideo();
    if (!files || !files.length) return;
    const f = files[0];
    openLocalMedia(f, 0, files);
  });
}

if ($('playerPickFolder')) {
  $('playerPickFolder').addEventListener('click', async () => {
    const files = await window.api.selectFolders();
    if (!files || !files.length) return;
    openLocalMedia(files[0], 0, files);
  });
}

if ($('playerPrevMedia')) $('playerPrevMedia').addEventListener('click', () => playPlaylistDelta(-1));
if ($('playerNextMedia')) $('playerNextMedia').addEventListener('click', () => playPlaylistDelta(1));
if ($('playerAutoNext')) {
  player.autoNext = $('playerAutoNext').checked;
  $('playerAutoNext').addEventListener('change', (e) => {
    player.autoNext = e.target.checked;
    scheduleSave();
  });
}

if ($('playerPickSub')) {
  $('playerPickSub').addEventListener('click', async () => {
    const p = await window.api.selectFile('subtitle');
    if (!p) return;
    addSubtitleOption(p);
    $('playerSubSelect').value = p;
    loadSubtitle(p);
  });
}

if ($('playerSubSelect')) {
  $('playerSubSelect').addEventListener('change', (e) => loadSubtitle(e.target.value));
}
if ($('playerSubSelect2')) {
  $('playerSubSelect2').addEventListener('change', (e) => loadSubtitle(e.target.value, true));
}

// ---- izlerken düzeltme ----
function openCueEditor() {
  if (player.activeIdx < 0 || !player.cues.length) {
    logLine('Düzeltmek için altyazının göründüğü bir ana gel.', 'warn');
    return;
  }
  if (!player.subPath) {
    logLine('Düzeltme kaydedilemez: altyazı bir dosyadan yüklenmemiş.', 'warn');
    return;
  }
  const cue = player.cues[player.activeIdx];
  player.editing = true;
  $('playerStage').classList.add('editing');
  $('playerVideo').pause();
  $('subtitleEdit').classList.remove('hidden');
  $('subtitleEditBox').value = cue.text;
  $('subtitleEditHint').textContent =
    `${pSecToTime(cue.start)} – ${pSecToTime(cue.end)} · ${player.subPath.split(/[\\/]/).pop()}`;
  $('subtitleEditBox').focus();
  $('subtitleEditBox').select();
}

function closeCueEditor() {
  player.editing = false;
  $('playerStage').classList.remove('editing');
  $('subtitleEdit').classList.add('hidden');
  renderCue();
}

async function saveCueEdit() {
  const i = player.activeIdx;
  if (i < 0) return closeCueEditor();
  const text = $('subtitleEditBox').value.trim();
  if (!text) { logLine('Boş altyazı kaydedilmez.', 'warn'); return; }
  // player.cues DISKE YAZMA BASARILI OLANA KADAR degistirilmez. Eskiden once
  // bellek guncelleniyordu; yazma hata verirse dosya eski, ekran yeni kaliyor,
  // kullanici kaydin gectigini saniyordu (sonraki kayit da onu tasiyordu).
  // DOSYA BICIMINI KORU. Eskiden her bicim cuesToSrt ile yazilirdi: .ass dosyasina
  // duz SRT yaziliyor (stiller, konumlar, konusmaci adlari yok oluyor), .vtt de
  // WEBVTT basligini kaybediyordu.
  const cue = player.cues[i];
  const targetPath = player.subPath;
  const targetKey = player.mediaKey;
  const targetGen = currentGeneration();
  let payload;
  if (player.subFormat === 'ass') {
    payload = replaceAssDialogueText(player.subRaw, cue.line, text, cue.assLead);
    if (payload === null) {
      logLine('ASS satırı bulunamadı — dosya biçimi bozulmasın diye kaydedilmedi.', 'error');
      return;
    }
    if (cue.assInner) {
      logLine('Uyarı: bu satırın metin içindeki biçim etiketleri (italik vb.) kaldırıldı.', 'warn');
    }
  } else if (player.subFormat === 'vtt') {
    payload = replaceVttCueText(player.subRaw, cue, text);
    if (payload === null) {
      logLine('VTT bloğu bulunamadı — dosya metadatası bozulmasın diye kaydedilmedi.', 'error');
      return;
    }
  } else {
    // SRT'de korunacak metadata yok; blok listesinden yeniden uretmek guvenli
    const draft = player.cues.map((c, k) => (k === i ? { ...c, text } : c));
    payload = cuesToSrt(draft);
  }

  let res;
  try { res = await window.api.writeSubtitle(targetPath, payload); }
  catch (err) { res = { ok: false, error: err && err.message }; }
  if (!res || !res.ok) {
    logLine(`Altyazı kaydedilemedi: ${(res && res.error) || 'bilinmeyen hata'}`, 'error');
    return;
  }
  if (staleGeneration(targetGen) || player.mediaKey !== targetKey
      || player.subPath !== targetPath || player.cues[i] !== cue) {
    logLine('Düzenleme önceki altyazı dosyasına kaydedildi; mevcut videoya uygulanmadı.', 'warn');
    return;
  }
  cue.text = text;                            // ANCAK yazma basarili olduysa
  if (player.subFormat !== 'srt') player.subRaw = payload;
  logLine(`Altyazı güncellendi (blok ${i + 1}) → ${player.subPath.split(/[\\/]/).pop()}`, 'success');
  renderCueList($('cueSearch') ? $('cueSearch').value : '');
  closeCueEditor();
}

if ($('cueSearch')) {
  // Arama yalniz listeyi degil zaman cubugunu da isaretler: "Kombai" yazinca
  // filmde nerelerde geciyorsa cubukta gorunur, tiklayip atlarsin.
  $('cueSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    renderCueList(e.target.value);
    renderSeekMarkers(q
      ? player.cues.filter((c) => c.text.toLocaleLowerCase('tr').includes(q)
          || translationFor(c).toLocaleLowerCase('tr').includes(q))
          .map((c) => c.start + player.offset)
      : defaultMarkers());
  });
}
if ($('autoPauseCue')) {
  $('autoPauseCue').addEventListener('change', (e) => {
    player.autoPause = e.target.checked;
    player.pausedAt = -1;
  });
}
if ($('subtitleOverlay')) {
  $('subtitleOverlay').addEventListener('dblclick', openCueEditor);
}
if ($('subtitleEditSave')) $('subtitleEditSave').addEventListener('click', saveCueEdit);
if ($('subtitleEditCancel')) $('subtitleEditCancel').addEventListener('click', closeCueEditor);
if ($('subtitleEditBox')) {
  $('subtitleEditBox').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeCueEditor(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveCueEdit(); }
  });
}

if ($('subSize')) {
  $('subSize').addEventListener('input', (e) => {
    $('subSizeVal').textContent = e.target.value;
    $('subtitleOverlay').style.fontSize = `${e.target.value}px`;
  });
}
if ($('subOffset')) {
  $('subOffset').addEventListener('input', (e) => {
    player.offset = parseFloat(e.target.value);
    $('subOffsetVal').textContent = player.offset.toFixed(1);
    player.activeIdx = -1;
    renderCue();
    // Dosyaya isleme yalnizca gercekten bir gecikme varken VE dosya SRT/VTT iken
    // anlamli - backend ASS/SSA kaydirmayi kabul etmiyor (dugme gorunup hata
    // vermesin diye burada gizlenir).
    const btn = $('applyOffsetToFile');
    if (btn) {
      const shiftable = player.subFormat === 'srt' || player.subFormat === 'vtt';
      btn.classList.toggle('hidden', !player.offset || !player.subPath || !shiftable);
    }
  });
}

// ---- YouTube ----
function youtubeCookieBrowser() {
  return ($('playerCookieBrowser') && $('playerCookieBrowser').value)
    || ($('youtubeCookieBrowser') && $('youtubeCookieBrowser').value)
    || '';
}

function friendlyYoutubeError(raw) {
  const message = String(raw || '');
  if (/confirm you(?:'|’)re not a bot|use --cookies/i.test(message)) {
    return 'YouTube bu video için oturum doğrulaması istedi. YouTube oturumu alanından giriş yaptığın tarayıcıyı seçip yeniden dene.';
  }
  if (/could not copy.*cookie|cookie database/i.test(message)) {
    return 'Tarayıcı oturumu okunamadı. Tarayıcıyı tamamen kapatıp yeniden dene veya Firefox seç.';
  }
  return message || 'bilinmeyen hata';
}

// Ana ekrandaki ve oynatıcıdaki seçim aynı ayardır. Cookie içeriği okunmaz;
// yalnızca yt-dlp'ye hangi tarayıcı profilini kullanacağı söylenir.
if ($('youtubeCookieBrowser') && $('playerCookieBrowser')) {
  const syncCookieBrowser = (from, to) => {
    to.value = from.value;
    scheduleSave();
  };
  $('youtubeCookieBrowser').addEventListener('change', (e) => syncCookieBrowser(e.target, $('playerCookieBrowser')));
  $('playerCookieBrowser').addEventListener('change', (e) => syncCookieBrowser(e.target, $('youtubeCookieBrowser')));
  setTimeout(() => { $('playerCookieBrowser').value = $('youtubeCookieBrowser').value; }, 0);
}

if ($('playerProbe')) {
  $('playerProbe').addEventListener('click', async () => {
    const url = $('playerYtUrl').value.trim();
    player.probeRequestSeq++;
    const probeSeq = ++player.probeSeq;
    const probeGen = currentGeneration();
    if (!url) { logLine('YouTube linki boş.', 'error'); return; }
    $('playerProbe').disabled = true;
    $('playerProbe').textContent = 'Bilgi alınıyor...';
    const parseStatus = $('playerParseStatus');
    const parseText = $('playerParseText');
    if (parseStatus) parseStatus.classList.remove('hidden');
    if (parseText) parseText.textContent = 'Video bilgisi alınıyor…';
    let res;
    try {
      res = await window.api.probeYoutube(url, youtubeCookieBrowser());
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : 'IPC çağrısı başarısız' };
    }
    $('playerProbe').disabled = false;
    $('playerProbe').textContent = 'Bilgi al';
    if (parseStatus) parseStatus.classList.add('hidden');
    if (probeSeq !== player.probeSeq || staleGeneration(probeGen)
        || ($('playerYtUrl')?.value || '').trim() !== url) {
      logLine('YouTube bilgisi güncelliğini yitirdi; eski probe sonucu uygulanmadı.', 'warn');
      return;
    }
    if (!res || !res.ok) {
      const message = friendlyYoutubeError((res && res.error) || 'bilinmeyen hata');
      logLine(`Video bilgisi alınamadı: ${message}`, 'error');
      if (/oturum|tarayıcı/i.test(message)) toggleDrawerAt(null, '#playerCookieBrowser');
      return;
    }
    const info = res.data;
    // Probe sonucu HANGI adres icin alindi? Sonraki islemler URL kutusunu degil
    // bunu kullanir; kullanici kutuyu degistirip yeniden probe yapmadan izlemeye
    // basarsa A'nin akisini B'nin anahtariyla kaydetmis oluyorduk.
    info.sourceUrl = url;
    info.videoKey = mediaKeyFor('youtube', url);
    player.ytInfo = info;
    player.originalUrl = url;
    $('playerYtInfo').classList.remove('hidden');
    $('playerYtTitle').textContent = `${info.title} · ${pSecToTime(info.duration)}`;

    // Kalite listesi: 1080p ve altı öne alınır (üstü de seçilebilir)
    const q = $('playerQuality');
    q.innerHTML = '';
    const heights = (info.heights || []).slice().sort((a, b) => b - a);
    heights.forEach((h) => {
      const o = document.createElement('option');
      o.value = String(h);
      o.textContent = `${h}p`;
      if (h === 1080 || (h < 1080 && !heights.includes(1080) && h === heights.find((x) => x <= 1080))) {
        o.selected = true;
      }
      q.appendChild(o);
    });

    // Ses dilleri yalnızca birden fazlaysa gösterilir
    const langs = info.audioLangs || [];
    const af = $('playerAudioField');
    const asel = $('playerAudioLang');
    asel.innerHTML = '';
    if (langs.length > 1) {
      langs.forEach((l) => {
        const o = document.createElement('option');
        o.value = l.code;
        o.textContent = `${l.code}${l.label && l.label !== l.code ? ' · ' + l.label : ''}`;
        asel.appendChild(o);
      });
      const saved = currentAudioLock(info.videoKey);
      const preferred = saved && langs.some((l) => audioLanguagesMatch(l.code, saved.lang))
        ? saved.lang : (info.originalLanguage || langs[0].code);
      const option = langs.find((l) => audioLanguagesMatch(l.code, preferred)) || langs[0];
      asel.value = option.code;
      rememberAudioLock(option.code, option.label || option.code, info.videoKey);
      af.classList.remove('hidden');
    } else {
      af.classList.add('hidden');
      if (langs.length === 1) rememberAudioLock(langs[0].code, langs[0].label || langs[0].code, info.videoKey);
    }

    // Bölümler (varsa) — zaman çubuğuna işaret, panele liste
    setChapters(info.chapters);
    if (info.isLive) {
      logLine('Bu bir CANLI yayın — süre ve kaldığın yer bilgisi çalışmaz, '
        + 'altyazı için önce yayının bitmesini beklemek gerekir.', 'warn');
    }
    if ((info.chapters || []).length) {
      logLine(`${info.chapters.length} bölüm bulundu.`, 'info');
    }

    // YouTube'un hazır altyazıları: elle yazılanlar önce, sonra otomatikler.
    // tr ve en öne alınır (156 otomatik dil geliyor, hepsi listede ama üstte
    // işine yarayacaklar olsun).
    const subs = info.subtitleLangs || [];
    const subField = $('playerYtSubField');
    const subSel = $('playerYtSubLang');
    const subBtn = $('playerYtSubGet');
    subSel.innerHTML = '';
    if (subs.length) {
      const rank = (x) => (x.auto ? 100 : 0) + (x.code === 'tr' ? -3 : x.code === 'en' ? -2 : 0);
      subs.slice().sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code))
        .forEach((x) => {
          const o = document.createElement('option');
          o.value = `${x.code}|${x.auto ? '1' : '0'}`;
          o.textContent = `${x.code}${x.auto ? ' (otomatik)' : ' (elle yazılmış)'}`;
          subSel.appendChild(o);
        });
      subField.classList.remove('hidden');
      subBtn.classList.remove('hidden');
    } else {
      subField.classList.add('hidden');
      subBtn.classList.add('hidden');
    }

    // "İndirmeden izle": önce HLS (1080p+ ses dahil), yoksa birleşik format (360p)
    const streamBtn = $('playerStream');
    if (info.hls) {
      streamBtn.classList.remove('hidden');
      streamBtn.textContent = 'İndirmeden izle (1080p’ye kadar)';
      streamBtn.dataset.mode = 'hls';
    } else if (info.stream && info.stream.url) {
      streamBtn.classList.remove('hidden');
      streamBtn.textContent = `İndirmeden izle (${info.stream.height}p)`;
      streamBtn.dataset.mode = 'progressive';
    } else {
      streamBtn.classList.add('hidden');
      logLine('Bu videoda doğrudan izlenebilir akış yok — indirerek izleyebilirsin.', 'warn');
    }
    const pendingOpen = player.pendingAutoOpen;
    if (pendingOpen && pendingOpen.key === info.videoKey
        && pendingOpen.intent === player.openIntent
        && !streamBtn.classList.contains('hidden')) {
      player.pendingAutoOpen = null;
      streamBtn.click();
    }
  });
}

if ($('playerStream')) {
  $('playerStream').addEventListener('click', () => {
    const info = player.ytInfo;
    if (!info) return;
    // URL kutusu probe'dan sonra degistiyse eski akisi yeni adresle oynatma
    const boxUrl = $('playerYtUrl').value.trim();
    if (boxUrl && mediaKeyFor('youtube', boxUrl) !== info.videoKey) {
      logLine('URL değişti — önce "Bilgi al" ile yeni videoyu yükleyin.', 'warn');
      return;
    }
    const ytKey = info.videoKey;
    player.openIntent++;
    if (info.hls && setPlayerHls(info.hls, info.title, ytKey, info)) {
      if (player.pendingLibrarySeek && player.pendingLibrarySeek.key === player.mediaKey) {
        player.pendingLibrarySeek.generation = currentGeneration();
      }
      return;
    }
    if (info.stream && info.stream.url) {
      setPlayerSource(info.stream.url, info.title, ytKey, info);
      // Progressive URL tek bir gomulu ses tasir; secici sonradan o sesi
      // degistiremez. Whisper kilidini gercekte oynayan dile bagla.
      player.playbackAudioLang = normalizeAudioLang(info.stream.audioLang || info.originalLanguage);
      const actualOption = $('playerAudioLang') && [...$('playerAudioLang').options].find((o) =>
        audioLanguagesMatch(o.value, player.playbackAudioLang));
      if (actualOption && $('playerAudioLock') && $('playerAudioLock').checked) {
        $('playerAudioLang').value = actualOption.value;
        rememberAudioLock(actualOption.value, actualOption.textContent, ytKey);
      }
      updateAudioLockStatus();
      if (player.pendingLibrarySeek && player.pendingLibrarySeek.key === player.mediaKey) {
        player.pendingLibrarySeek.generation = currentGeneration();
      }
      logLine(`Yayın açıldı (${info.stream.height}p) — bağlantı geçici, kopabilir.`, 'info');
    }
  });
}

// Kalite değişimi: HLS akışında anında seviye değiştir (yeniden yükleme yok)
// Ses parcasi degistirme: SES secimi ile ALTYAZI/kalite secimi birbirinden
// bagimsizdir; biri digerini sifirlamaz.
if ($('playerStreamAudio')) {
  $('playerStreamAudio').addEventListener('change', (e) => {
    if (!player.hls) return;
    const i = parseInt(e.target.value, 10);
    if (isNaN(i)) return;
    const t = (player.hls.audioTracks || [])[i];
    player.hls.audioTrack = i;
    player.playbackAudioLang = normalizeAudioLang(t && t.lang);
    updateAudioLockStatus();
    if ($('playerAudioLock') && $('playerAudioLock').checked && t && t.lang) {
      rememberAudioLock(t.lang, t.name || t.lang);
      const asel = $('playerAudioLang');
      const matching = asel && [...asel.options].find((o) =>
        audioLanguagesMatch(o.value, t.lang));
      if (matching) asel.value = matching.value;
    }
    osd(`Ses: ${(t && (t.name || t.lang)) || 'parça ' + (i + 1)}`);
    logLine(`Ses parçası: ${(t && (t.name || t.lang)) || i}`, 'info');
  });
}

if ($('playerAudioLang')) {
  $('playerAudioLang').addEventListener('change', (e) => {
    const option = e.target.selectedOptions[0];
    const key = player.ytInfo && player.ytInfo.videoKey ? player.ytInfo.videoKey : player.mediaKey;
    rememberAudioLock(e.target.value, option ? option.textContent : e.target.value, key);
    if (player.hls && $('playerAudioLock') && $('playerAudioLock').checked) {
      const idx = (player.hls.audioTracks || []).findIndex((t) =>
        audioLanguagesMatch(t.lang, e.target.value));
      if (idx >= 0) {
        player.hls.audioTrack = idx;
        player.playbackAudioLang = normalizeAudioLang(player.hls.audioTracks[idx].lang);
        updateAudioLockStatus();
      }
    }
  });
}

if ($('playerAudioLock')) {
  $('playerAudioLock').addEventListener('change', () => {
    if ($('playerAudioLock').checked && $('playerAudioLang') && $('playerAudioLang').value) {
      const option = $('playerAudioLang').selectedOptions[0];
      rememberAudioLock($('playerAudioLang').value, option ? option.textContent : '');
      if (player.hls) {
        const idx = (player.hls.audioTracks || []).findIndex((t) =>
          audioLanguagesMatch(t.lang, $('playerAudioLang').value));
        if (idx >= 0) {
          player.hls.audioTrack = idx;
          player.playbackAudioLang = normalizeAudioLang(player.hls.audioTracks[idx].lang);
        }
      }
    }
    updateAudioLockStatus();
  });
  updateAudioLockStatus();
}

if ($('playerQuality')) {
  $('playerQuality').addEventListener('change', (e) => {
    if (!player.hls) return;                      // akis yoksa deger indirme yuksekligidir
    const opt = e.target.selectedOptions[0];
    const v = e.target.value;
    if (v === 'auto') {
      player.hls.currentLevel = -1;
      logLine('Kalite: otomatik', 'info');
      return;
    }
    const level = opt && opt.dataset.level !== undefined ? parseInt(opt.dataset.level, 10) : -1;
    if (level >= 0) {
      player.hls.currentLevel = level;
      logLine(`Kalite: ${v}p`, 'info');
    }
  });
}

if ($('playerDownload')) {
  $('playerDownload').addEventListener('click', async () => {
    const info = player.ytInfo;
    const url = (info && info.sourceUrl) || $('playerYtUrl').value.trim();
    if (!url) return;
    const boxUrl2 = $('playerYtUrl').value.trim();
    if (info && boxUrl2 && mediaKeyFor('youtube', boxUrl2) !== info.videoKey) {
      logLine('URL değişti — önce "Bilgi al" ile yeni videoyu yükleyin.', 'warn');
      return;
    }
    // Deger her zaman gercek yukseklik (bkz. kalite secici yorumu)
    const height = parseInt($('playerQuality').value, 10) || 1080;
    const audioLang = $('playerAudioField').classList.contains('hidden')
      ? '' : $('playerAudioLang').value;
    const intent = ++player.openIntent;
    player.downloadIntent = intent;
    player.pendingAutoOpen = null;
    player.downloading = true;
    $('playerDownload').disabled = true;
    $('playerCancelDl').classList.remove('hidden');
    $('playerDlProgress').classList.remove('hidden');
    $('playerDlFill').style.width = '0%';
    $('playerDlText').textContent = '0%';

    let res;
    try {
      res = await window.api.downloadYoutube({
        url, height, audioLang,
        cookieBrowser: youtubeCookieBrowser(),
        outputDir: state.outputDir || undefined,
      });
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : 'IPC çağrısı başarısız' };
    }

    player.downloading = false;
    $('playerDownload').disabled = false;
    $('playerCancelDl').classList.add('hidden');
    $('playerDlProgress').classList.add('hidden');
    if (!res || !res.ok) {
      logLine(`İndirme başarısız: ${(res && res.error) || 'bilinmeyen hata'}`, 'error');
      return;
    }
    // Indirme surerken kullanici baska bir video actiysa biten eski indirme
    // yeni kaynagi zorla ezmesin. Dosya diskte kalir ve gecmisten acilabilir.
    if (intent !== player.openIntent) {
      logLine('İndirme tamamlandı; bu sırada başka video açıldığı için oynatıcı değiştirilmedi.', 'info');
      return;
    }
    const p = res.data.path;
    $('playerVideoPath').textContent = p;
    setPlayerSource(pathToFileUrl(p), res.data.title, mediaKeyFor('local', p),
                    Object.assign({ localPath: p }, player.ytInfo || {}));
    logLine(`İndirildi ve oynatılıyor: ${p}`, 'success');
    attachSiblingSubtitles(p);
  });
}

// Bölüm seçimi -> o ana atla
if ($('playerChapters')) {
  $('playerChapters').addEventListener('change', (e) => {
    const i = parseInt(e.target.value, 10);
    const video = $('playerVideo');
    if (!video || isNaN(i) || !player.chapters[i]) return;
    video.currentTime = player.chapters[i].start;
    video.play().catch(() => {});
    logLine(`Bölüm: ${player.chapters[i].title || i + 1}`, 'info');
  });
}

// YouTube'un hazır altyazısını indir — bizimkiyle karşılaştırmak veya ikinci
// altyazı olarak göstermek için (otomatik olanlar noktalamasızdır).
if ($('playerYtSubGet')) {
  $('playerYtSubGet').addEventListener('click', async () => {
    const url = $('playerYtUrl').value.trim();
    const val = $('playerYtSubLang').value || 'en|0';
    if (!url) return;
    const [lang, auto] = val.split('|');
    const requestKey = mediaKeyFor('youtube', url);
    const btn = $('playerYtSubGet');
    btn.disabled = true;
    btn.textContent = 'İndiriliyor...';
    const gen = currentGeneration();
    let res;
    try {
      res = await window.api.downloadYoutubeSubs({
        url, lang, auto: auto === '1', cookieBrowser: youtubeCookieBrowser(),
        outputDir: state.outputDir || undefined,
      });
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : 'IPC çağrısı başarısız' };
    }
    btn.disabled = false;
    btn.textContent = 'Bu altyazıyı indir';
    if (staleGeneration(gen) || mediaKeyFor('youtube', ($('playerYtUrl')?.value || '').trim()) !== requestKey
        || !player.ytInfo || player.ytInfo.videoKey !== requestKey) {
      logLine('Altyazı indi ama bu arada başka videoya geçildi — yüklenmedi.', 'warn');
      return;
    }
    if (!res || !res.ok) {
      logLine(`YouTube altyazısı alınamadı: ${(res && res.error) || 'bilinmeyen hata'}`, 'error');
      return;
    }
    const p = res.data.path;
    addSubtitleOption(p, `YouTube ${lang}${auto === '1' ? ' (otomatik)' : ''}`);
    // Ana altyazı boşsa oraya, doluysa karşılaştırma altyazısına koy
    if (!player.cues.length) {
      $('playerSubSelect').value = p;
      loadSubtitle(p);
    } else {
      $('playerSubSelect2').value = p;
      loadSubtitle(p, true);
      logLine('YouTube altyazısı karşılaştırma altyazısı olarak yüklendi.', 'success');
    }
  });
}

// Kaydırıcıyla bulunan gecikmeyi altyazı DOSYASINA kalıcı işle
if ($('applyOffsetToFile')) {
  $('applyOffsetToFile').addEventListener('click', async () => {
    if (!player.subPath) { logLine('Önce bir altyazı dosyası yükle.', 'warn'); return; }
    const targetPath = player.subPath;
    const targetKey = player.mediaKey;
    const targetGen = currentGeneration();
    const off = player.offset;
    if (!off) { logLine('Gecikme sıfır — işlenecek bir şey yok.', 'warn'); return; }
    let res;
    try {
      res = await window.api.shiftSubs(targetPath, off);
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : 'IPC çağrısı başarısız' };
    }
    if (!res || !res.ok) {
      logLine(`Gecikme işlenemedi: ${(res && res.error) || 'bilinmeyen hata'}`, 'error');
      return;
    }
    if (staleGeneration(targetGen) || player.mediaKey !== targetKey || player.subPath !== targetPath) {
      logLine('Gecikme eski altyazı dosyasına işlendi; bu sırada başka videoya geçildi.', 'warn');
      return;
    }
    logLine(`${off > 0 ? '+' : ''}${off.toFixed(1)} sn dosyaya işlendi: `
      + `${targetPath.split(/[\\/]/).pop()}`, 'success');
    // Dosya artık kaymış durumda; ekrandaki gecikmeyi sıfırla ve yeniden yükle
    $('subOffset').value = '0';
    $('subOffset').dispatchEvent(new Event('input'));
    await loadSubtitle(targetPath);
  });
}

if ($('playerCancelDl')) {
  $('playerCancelDl').addEventListener('click', async () => {
    await window.api.cancelYoutubeDownload();
    logLine('İndirme iptal edildi.', 'warn');
  });
}

if (window.api.onMediaEvent) {
  window.api.onMediaEvent((ev) => {
    if (!ev) return;
    if (ev.type === 'download_progress' && player.downloading
        && player.downloadIntent === player.openIntent) {
      const pct = Math.min(100, ev.percent || 0);
      $('playerDlFill').style.width = `${pct}%`;
      $('playerDlText').textContent = `${pct.toFixed(0)}%`;
    } else if (ev.type === 'log') {
      logLine(ev.message, ev.level || 'info');
    }
  });
}
// PLAYER_END
