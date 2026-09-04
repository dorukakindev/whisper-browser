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

// Kalıcı iş geçmişinin renderer önbelleği. İşler merkezi bu sayacı kuyruk
// yönetiminden önce de okuyabildiği için tek üst-seviye sahibi burada durur.
let historyCache = [];

// ===== Kuyruk yönetimi =====
let _queueIdCounter = 0;
let _queuePersistenceReady = false;
let _queuePersistTimer = null;
let _burninRecoveryPollTimer = null;
let _burninRecoveryPromptOpen = false;
let _burninRecoveryLoggedId = '';

function queueSnapshotPayload() {
  return {
    version: 1,
    queueRunning: state.queueRunning,
    currentQueueId: state.currentQueueId,
    items: state.queue.map((item) => ({
      id: item.id, type: item.type, input: item.input, label: item.label,
      status: item.status, files: item.files || [], warnings: item.warnings || [],
      opts: item.opts || {}, recovered: !!item.recovered,
    })),
  };
}

let queuePersistLastError = '';
async function persistQueueNow() {
  if (!_queuePersistenceReady || !window.api.saveQueueState) return false;
  clearTimeout(_queuePersistTimer);
  _queuePersistTimer = null;
  const result = await window.api.saveQueueState(queueSnapshotPayload()).catch(() => null);
  const error = result?.ok ? '' : (result?.error || 'Kuyruk kaydedilemedi. Mevcut disk kaydı korundu.');
  if (error && error !== queuePersistLastError) logLine(error, 'error');
  queuePersistLastError = error;
  return !!result?.ok;
}

function scheduleQueuePersist(delay = 80) {
  if (!_queuePersistenceReady || !window.api.saveQueueState) return;
  clearTimeout(_queuePersistTimer);
  _queuePersistTimer = setTimeout(persistQueueNow, Math.max(0, delay));
}

function queueSecretsFromCurrentUi(savedOptions = {}) {
  const current = buildOptsFromUI();
  const runtime = {
    hfToken: current.hfToken || '',
    translateApiKey: current.translateApiKey || '',
    llmApiKey: current.llmApiKey || '',
  };
  // Kimlik bilgisi taşıdığı için kuyruk diskinden çıkarılan özel endpoint'ler
  // işi yeniden başlatırken güncel UI'dan çalışma anında geri eklenir.
  for (const key of ['translateBaseUrl', 'llmBaseUrl']) {
    if (!savedOptions[key] && current[key]) runtime[key] = current[key];
  }
  return runtime;
}

async function restorePersistedQueue() {
  const restored = await window.api.loadQueueState?.().catch(() => null);
  if (restored?.ok && Array.isArray(restored.items)) {
    state.queue = restored.items;
    _queueIdCounter = state.queue.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const activeId = Number(restored.activeQueueItemId);
    const active = Number.isSafeInteger(activeId)
      ? state.queue.find((item) => item.id === activeId && item.status === 'running') : null;
    if (active) {
      state.queueRunning = true;
      state.currentQueueId = active.id;
      state.running = true;
      state.lastJobVideo = active.type === 'file' ? active.input : null;
      state.startTime = Date.now();
      setStatus('Çalışıyor', 'active');
      $('startBtn').classList.add('hidden');
      $('cancelBtn').classList.remove('hidden');
      logLine(`Çalışan kuyruk işine yeniden bağlanıldı: ${active.label}`, 'success');
    } else {
      state.queueRunning = false;
      state.currentQueueId = null;
      const recovered = Number(restored.recoveredCount) || state.queue.filter((item) => item.recovered).length;
      if (recovered) {
        setJobsTab('queue');
        logLine(`${recovered} yarım kuyruk işi kurtarıldı. Devam etmek için “Kuyruğu başlat”ı kullanın.`, 'warn');
      }
    }
    const invalid = Number(restored.invalidCount) || 0;
    if (invalid) {
      setJobsTab('queue');
      logLine(`${invalid} kuyruk işi bozuk veya güvenli boyut sınırını aştığı için yüklenemedi. Disk kaydı sessizce değiştirilmedi.`, 'error');
    }
  }
  _queuePersistenceReady = true;
  renderQueue();
}

async function offerBurnInRecovery() {
  if (!window.api.getBurnInRecovery) return;
  clearTimeout(_burninRecoveryPollTimer);
  _burninRecoveryPollTimer = null;
  const status = await window.api.getBurnInRecovery().catch(() => null);
  if (!status?.ok || !status.available || !status.recovery) {
    _burninRecoveryLoggedId = '';
    return;
  }
  const recovery = status.recovery;
  const videoName = recovery.videoPath.split(/[\\/]/).pop();
  if (status.externalRunning) {
    if (_burninRecoveryLoggedId !== recovery.id) {
      _burninRecoveryLoggedId = recovery.id;
      logLine(`Önceki gömme süreci hâlâ çalışıyor: ${videoName}. Bittiğinde çıktı otomatik denetlenecek.`, 'warn');
    }
    _burninRecoveryPollTimer = setTimeout(offerBurnInRecovery, 5000);
    return;
  }
  if (_burninRecoveryPromptOpen) return;
  _burninRecoveryPromptOpen = true;
  try {
  if (!status.inputReady && !status.canFinalize && !status.alreadyDone) {
    const discard = await openAppDialog({
      title: 'Yarım gömme işi kullanılamıyor',
      description: `${videoName} için kaynak video veya altyazı bulunamadı. Geçici kurtarma kaydı silinsin mi?`,
      confirmLabel: 'Kaydı sil',
    });
    if (discard) await window.api.discardBurnInRecovery?.(recovery.id).catch(() => null);
    return;
  }
  const accepted = await openAppDialog({
    title: status.alreadyDone ? 'Tamamlanan videoyu doğrula'
      : status.canFinalize ? 'Tamamlanan videoyu kurtar' : 'Yarım kalan gömmeyi sürdür',
    description: status.alreadyDone
      ? `${videoName} için nihai video tamamlanmış görünüyor. Kurtarma kaydı doğrulanıp temizlensin mi?`
      : status.canFinalize
      ? `${videoName} için tamamlanmış geçici çıktı bulundu. Son video dosyasına dönüştürülsün mü?`
      : `${videoName} gömme sırasında yarım kalmış. Güvenli biçimde baştan başlatılsın mı?`,
    confirmLabel: status.alreadyDone ? 'Doğrula ve temizle'
      : status.canFinalize ? 'Çıktıyı kurtar' : 'Baştan başlat',
    intent: 'primary',
  });
  if (!accepted) return;
  const result = await window.api.recoverBurnIn(recovery.id).catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok) {
    logLine(`Gömme kurtarılamadı: ${result?.error || 'bilinmeyen hata'}`, 'error');
    return;
  }
  if (result.recovered) {
    logLine(`Tamamlanmış gömme çıktısı kurtarıldı: ${result.file}`, 'success');
    window.api.showInFolder(result.file);
    return;
  }
  if (result.restart) {
    state.lastJobVideo = result.videoPath;
    if (!state.outputFiles.includes(result.subPath)) state.outputFiles.push(result.subPath);
    const started = await window.api.burnInStart(result.videoPath, result.subPath, result.recoveryId)
      .catch((error) => ({ ok: false, error: error.message }));
    if (!started?.ok) {
      logLine(`Gömme yeniden başlatılamadı: ${started?.error || 'bilinmeyen hata'}`, 'error');
      return;
    }
    setBurninRunningUi();
    logLine(`Yarım kalan gömme baştan yeniden başlatıldı: ${videoName}`, 'success');
  }
  } finally {
    _burninRecoveryPromptOpen = false;
  }
}

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
function optsProblemInfo(opts) {
  const a = parseClipInput(opts.clipStart);
  const b = parseClipInput(opts.clipEnd);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return { message: 'Zaman aralığı biçimi geçersiz. Örnek: 90 · 1:30 · 01:02:03', fieldId: Number.isNaN(a) ? 'clipStart' : 'clipEnd' };
  }
  if (a !== null && b !== null && b <= a) {
    return { message: 'Zaman aralığı geçersiz: bitiş, başlangıçtan büyük olmalı.', fieldId: 'clipEnd' };
  }
  if (opts.translate && !opts.translateApiKey) {
    return { message: 'Çeviri açık ama API anahtarı girilmemiş. Gelişmiş ayarlar → Çeviri → API Key.', fieldId: 'translateApiKey' };
  }
  if (opts.diarize && !opts.hfToken) {
    return { message: 'Konuşmacı tanıma açık ama HuggingFace token girilmemiş.', fieldId: 'hfToken' };
  }
  if (opts.llmPostprocess && !opts.llmApiKey) {
    return { message: 'LLM düzeltme açık ama API anahtarı girilmemiş.', fieldId: 'llmApiKey' };
  }
  return null;
}

function optsProblem(opts) {
  const problem = optsProblemInfo(opts);
  return problem ? problem.message : null;
}

let _validationTargetId = '';

function clearJobValidation() {
  const box = $('jobValidation');
  if (!box) return;
  box.classList.add('hidden');
  _validationTargetId = '';
  document.querySelectorAll('[aria-invalid="true"][data-job-validation]').forEach((el) => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('data-job-validation');
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== 'jobValidationText');
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  });
}

function showJobValidation(problem) {
  if (!problem) { clearJobValidation(); return; }
  clearJobValidation();
  const box = $('jobValidation');
  if (!box) return;
  $('jobValidationText').textContent = problem.message;
  _validationTargetId = problem.fieldId || '';
  const target = _validationTargetId ? $(_validationTargetId) : null;
  if (target) {
    target.setAttribute('aria-invalid', 'true');
    target.setAttribute('data-job-validation', 'true');
    const described = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    described.add('jobValidationText');
    target.setAttribute('aria-describedby', [...described].join(' '));
  }
  box.classList.remove('hidden');
  box.focus({ preventScroll: true });
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

function queueInputKey(type, input) {
  const value = String(input || '').trim();
  return type === 'file' ? value.replace(/\\/g, '/').toLowerCase() : value;
}

function addToQueue(type, input, { watchSource = false } = {}) {
  if (!input) return false;
  const inputKey = queueInputKey(type, input);
  const existing = state.queue.find((item) => ['pending', 'running'].includes(item.status)
    && queueInputKey(item.type, item.input) === inputKey);
  if (existing) {
    if (watchSource) existing.watchSource = true;
    return false;
  }
  const opts = buildOptsFromUI();
  // Oynaticinin ses kilidi yalnizca bu tek ise aittir; ana ekrandaki sonraki
  // YouTube isi yanlislikla ayni dublaji devralmasin.
  state.nextYoutubeAudioLang = '';
  const problemInfo = optsProblemInfo(opts);
  const problem = problemInfo && problemInfo.message;
  if (problem) {
    logLine(`Kuyruğa eklenmedi — ${problem}`, 'error');
    showJobValidation(problemInfo);
    return false;
  }
  clearJobValidation();
  const id = ++_queueIdCounter;
  const label = type === 'youtube'
    ? input.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)
    : input.split(/[\\/]/).pop();
  // Ayarları EKLEME anında dondur: kuyruk işlenirken UI değişse bile bu iş eski ayarı kullanır
  state.queue.push({ id, type, input, label, status: 'pending', files: [], opts, watchSource });
  setJobsTab('queue');
  renderQueue();
  return true;
}

function reportWatchQueueResult(item, status) {
  if (!item?.watchSource || item.watchReported === status || !window.api.reportWatchFile) return;
  item.watchReported = status;
  window.api.reportWatchFile(item.input, status).catch(() => {});
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
  done: 'Tamamlandı',
  error: 'Hata',
};

function renderQueue() {
  scheduleQueuePersist();
  const card = $('queueCard');
  const list = $('queueList');
  const count = $('queueCount');
  count.textContent = state.queue.length;
  list.innerHTML = '';
  if (state.queue.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'jobs-empty';
    empty.textContent = 'Kuyruk boş. Bir kaynak seçip “Kuyruğa” ile ekleyin.';
    list.appendChild(empty);
    syncJobsCenter();
    return;
  }
  state.queue.forEach((item) => {
    const div = document.createElement('div');
    div.className = `queue-item ${item.status}`;
    const icon = item.type === 'youtube'
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8A3 3 0 0 0 2.6 19.9C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const removable = item.status !== 'running';
    const retryable = item.status === 'error';
    const openable = item.status === 'done' && item.files && item.files.length > 0;
    div.innerHTML = `
      <span class="queue-icon">${icon}</span>
      <div class="queue-name" title="${escapeHtml(item.input)}">
        ${escapeHtml(item.label)}
        <small>${item.type === 'youtube' ? 'youtube' : 'dosya'}</small>
      </div>
      <span class="queue-status">${STATUS_TEXT[item.status] || item.status}</span>
      <span class="queue-actions">
        ${openable ? `<button class="queue-remove queue-open" data-open="${item.id}" title="Çıktı klasörünü aç" aria-label="${escapeHtml(item.label)} çıktısını klasörde göster"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h7l2 2h9v10H3z"/></svg></button>` : ''}
        ${retryable ? `<button class="queue-remove queue-retry" data-retry="${item.id}" title="Yeniden dene" aria-label="${escapeHtml(item.label)} işini yeniden dene"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9A7 7 0 0 1 18 6l2 1M18 15a7 7 0 0 1-11.9 3L4 17"/></svg></button>` : ''}
        ${removable ? `<button class="queue-remove" data-id="${item.id}" title="Kaldır" aria-label="${escapeHtml(item.label)} işini kuyruktan kaldır"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ''}
      </span>
    `;
    list.appendChild(div);
  });
  list.querySelectorAll('.queue-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.queue.find(x => x.id === parseInt(btn.dataset.open, 10));
      if (item && item.files && item.files[0]) window.api.showInFolder(item.files[0]);
    });
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
      logLine(`"${item.label}" yeniden kuyruğa alındı`, 'info');
    });
  });
  syncJobsCenter();
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
        const name = x.label || (x.input || '').split(/[\\/]/).pop();
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
  // Ana süreç başlatılmadan önce çalışan öğeyi diske geçir. Main süreç de
  // spawn sonrasında aynı durumu tekrar yazar; iki katmanlı kayıt renderer'ın
  // bu dar aralıkta yenilenmesi halinde işi kaybetmesini önler.
  if (!await persistQueueNow()) {
    next.status = 'pending';
    finalizeQueue();
    setStatus('Kuyruk kaydedilemedi', 'error');
    renderQueue();
    return;
  }

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
  const opts = next.opts ? { ...next.opts, ...queueSecretsFromCurrentUi(next.opts) } : buildOptsFromUI();
  opts.queueItemId = next.id;
  const problemInfo = optsProblemInfo(opts);
  if (problemInfo) {
    next.status = 'pending';
    state.queueRunning = false;
    state.currentQueueId = null;
    state.running = false;
    renderQueue();
    showJobValidation(problemInfo);
    logLine(`Kurtarılan kuyruk işi başlatılamadı — ${problemInfo.message}`, 'error');
    $('startBtn').classList.remove('hidden');
    $('cancelBtn').classList.add('hidden');
    return;
  }
  if (next.type === 'youtube') { opts.youtube = next.input; state.lastJobVideo = null; }
  else { opts.input = next.input; state.lastJobVideo = next.input; }

  logLine(`▶ Kuyruk: "${next.label}" başlıyor (${next.type})`);

  const r = await startTranscribeSafe(opts);
  if (!r.ok) {
    logLine(`✗ Kuyruk: "${next.label}" başlatılamadı — ${r.error}`, 'error');
    next.status = 'error';
    reportWatchQueueResult(next, 'error');
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

// ===== Ortak modal/dialog sahibi =====
let _activeModal = null;
let _modalReturnFocus = null;
let _queuedModalOpen = null;
let _dialogResolve = null;

function modalFocusable(modal) {
  return [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.classList.contains('hidden') && el.offsetParent !== null);
}

function setModalBackgroundInert(modal, inert) {
  const app = document.querySelector('.app');
  if (!app) return;
  [...app.children].forEach((child) => {
    if (child === modal) return;
    child.inert = inert;
  });
}

function syncBrowserOcclusion() {
  const places = $('browserPlacesPanel');
  const downloads = $('browserDownloadsPanel');
  const occluded = !!_activeModal || !!(places && !places.classList.contains('hidden'))
    || !!(downloads && !downloads.classList.contains('hidden'));
  if (window.api.setBrowserOccluded) window.api.setBrowserOccluded(occluded).catch(() => {});
}

function openManagedModal(modal, initialFocus, returnFocus = null) {
  if (!modal) return;
  // Açık bir onay diyaloğunu yeni bir sonuç penceresiyle sessizce kapatmak,
  // openAppDialog sözünü sonsuza dek beklemede bırakıyordu. İkinci modalı sıraya
  // al; kullanıcı mevcut diyaloğu bitirince en son bekleyen modalı göster.
  if (_activeModal && _activeModal !== modal) {
    _queuedModalOpen = { modal, initialFocus };
    return;
  }
  if (_activeModal === modal) return;
  _modalReturnFocus = returnFocus
    || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  _activeModal = modal;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  setModalBackgroundInert(modal, true);
  document.body.classList.add('modal-open');
  syncBrowserOcclusion();
  requestAnimationFrame(() => {
    const target = initialFocus || modalFocusable(modal)[0] || modal.querySelector('.modal-content');
    target?.focus();
  });
}

function closeManagedModal(modal, restoreFocus = true) {
  if (!modal) return;
  // Sıradaki/gizli modal kapanınca aktif diyaloğun odağını ve inert durumunu koru.
  if (_queuedModalOpen?.modal === modal) _queuedModalOpen = null;
  if (_activeModal !== modal) return;
  const wasActive = _activeModal === modal;
  const queued = wasActive ? _queuedModalOpen : null;
  if (wasActive) _queuedModalOpen = null;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  setModalBackgroundInert(modal, false);
  document.body.classList.remove('modal-open');
  if (wasActive) _activeModal = null;
  syncBrowserOcclusion();
  const restore = _modalReturnFocus;
  _modalReturnFocus = null;
  if (queued) {
    requestAnimationFrame(() => openManagedModal(queued.modal, queued.initialFocus, restore));
  } else if (restoreFocus && restore && document.contains(restore)) {
    requestAnimationFrame(() => restore.focus());
  }
}

document.addEventListener('keydown', (event) => {
  const modal = _activeModal;
  if (!modal) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (modal === $('appDialog')) resolveAppDialog(false);
    else closeManagedModal(modal);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = modalFocusable(modal);
  if (!focusable.length) { event.preventDefault(); modal.querySelector('.modal-content')?.focus(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}, true);

function resolveAppDialog(value) {
  const resolve = _dialogResolve;
  _dialogResolve = null;
  closeManagedModal($('appDialog'));
  if (resolve) resolve(value);
}

function openAppDialog({ title, description, confirmLabel, intent = 'danger', inputLabel = '', inputValue = '' }) {
  const modal = $('appDialog');
  const field = $('appDialogField');
  const input = $('appDialogInput');
  const confirm = $('appDialogConfirm');
  const hasInput = !!inputLabel;
  $('appDialogTitle').textContent = title;
  $('appDialogDescription').textContent = description;
  $('appDialogInputLabel').textContent = inputLabel || 'Değer';
  field.classList.toggle('hidden', !hasInput);
  input.value = hasInput ? inputValue : '';
  confirm.textContent = confirmLabel;
  confirm.className = `btn ${intent === 'danger' ? 'btn-danger' : 'btn-primary'}`;
  modal.setAttribute('role', hasInput ? 'dialog' : 'alertdialog');
  if (_dialogResolve) _dialogResolve(false);
  return new Promise((resolve) => {
    _dialogResolve = resolve;
    openManagedModal(modal, hasInput ? input : $('appDialogCancel'));
  });
}

$('appDialogCancel')?.addEventListener('click', () => resolveAppDialog(false));
$('appDialogConfirm')?.addEventListener('click', () => {
  const hasInput = !$('appDialogField').classList.contains('hidden');
  resolveAppDialog(hasInput ? $('appDialogInput').value : true);
});
$('appDialog')?.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => {
  if ($('appDialog').getAttribute('role') === 'dialog') resolveAppDialog(false);
});
$('appDialogInput')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    $('appDialogConfirm').click();
  }
});

// ===== Birleşik İşler merkezi =====
let _jobsTab = 'queue';

function setJobsTab(tab, focus = false) {
  if (!['queue', 'history', 'review'].includes(tab)) tab = 'queue';
  _jobsTab = tab;
  $$('.jobs-tab').forEach((button) => {
    const active = button.dataset.jobsTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  const panels = { queue: 'queueCard', history: 'historyCard', review: 'reviewCard' };
  Object.entries(panels).forEach(([name, id]) => $(id)?.classList.toggle('hidden', name !== tab));
  $('queueToolbar')?.classList.toggle('hidden', tab !== 'queue');
  $('historyToolbar')?.classList.toggle('hidden', tab !== 'history');
}

function reviewItems() {
  const items = [];
  state.queue.forEach((item) => {
    if (item.status === 'error') items.push({ tone: 'error', title: item.label, detail: 'İş tamamlanamadı; günlükten hatayı inceleyip yeniden deneyin.' });
    (item.warnings || []).forEach((warning) => items.push({ tone: 'warning', title: item.label, detail: warning }));
  });
  const qr = state.lastQualityReport;
  if (qr && qr.blocks) {
    const issueCount = Number(qr.cps_violations || 0) + Number(qr.overlaps || 0) + Number(qr.too_long || 0);
    if (issueCount) {
      items.push({ tone: 'warning', title: 'Son çıktı kalite raporu', detail: `${qr.cps_violations || 0} hızlı okuma · ${qr.overlaps || 0} çakışma · ${qr.too_long || 0} uzun blok` });
    }
  }
  return items;
}

function renderReviewCenter() {
  const list = $('reviewList');
  if (!list) return;
  const items = reviewItems();
  $('reviewCount').textContent = String(items.length);
  $('jobsReviewBadge').textContent = String(items.length);
  list.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'review-empty';
    empty.textContent = 'Şu anda elle kontrol isteyen iş yok.';
    list.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = `review-item ${item.tone === 'error' ? 'error' : ''}`;
    const mark = document.createElement('span');
    mark.className = 'review-item-mark';
    mark.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const title = document.createElement('strong');
    const detail = document.createElement('span');
    title.textContent = item.title || 'İş';
    detail.textContent = item.detail;
    body.append(title, detail);
    row.append(mark, body);
    list.appendChild(row);
  });
}

function syncJobsCenter() {
  $('jobsQueueBadge').textContent = String(state.queue.length);
  $('jobsHistoryBadge').textContent = String(historyCache.length);
  $('startQueueBtn').disabled = !state.queue.some((item) => item.status === 'pending') || state.queueRunning;
  $('clearQueue').disabled = !state.queue.some((item) => item.status !== 'running');
  renderReviewCenter();
  setJobsTab(_jobsTab);
}

$$('.jobs-tab').forEach((button) => button.addEventListener('click', () => setJobsTab(button.dataset.jobsTab)));

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
  clearTimeout(_searchTimer);
  _searchTimer = null;
  previewFilter = '';
  if ($('previewSearch')) $('previewSearch').value = '';
  $('previewSearchClear')?.classList.add('hidden');
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
    (s) => !previewFilter || (s.text || '').toLocaleLowerCase('tr').includes(previewFilter)
  );
  if (segs.length === 0) {
    logLine('Kopyalanacak segment yok', 'warn');
    return;
  }
  const srt = segs
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`)
    .join('\n');
  try {
    await window.api.copyText(srt);
    logLine(`${segs.length} segment panoya kopyalandı (SRT biçimi)`, 'success');
  } catch (error) {
    logLine(`Panoya kopyalanamadı: ${error.message}`, 'error');
  }
});

// Önizleme metin filtresi — büyük transkriptlerde arama
let previewFilter = '';
let playerPreviewUnmatchedEdits = [];
$('copyPreviewEdits')?.addEventListener('click', async () => {
  await window.api.copyText(JSON.stringify(playerPreviewUnmatchedEdits, null, 2));
  logLine('Zaman aralığı değişen düzenlemelerin yedeği panoya kopyalandı.', 'success');
});

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
  $('previewSearchClear')?.classList.toggle('hidden', !$('previewSearch').value);
  _searchTimer = setTimeout(() => {
    previewFilter = $('previewSearch').value.trim().toLocaleLowerCase('tr');
    $$('#preview .segment').forEach(applySegmentFilter);
  }, 120);
});

$('previewSearchClear')?.addEventListener('click', () => {
  clearTimeout(_searchTimer);
  $('previewSearch').value = '';
  previewFilter = '';
  $$('#preview .segment').forEach(applySegmentFilter);
  $('previewSearchClear').classList.add('hidden');
  $('previewSearch').focus();
});

// Segment DOM elemanını üret (yan etkisiz) — hem akış hem toplu render kullanır.
// idx = state.previewSegs içindeki kalıcı indeks (düzenleme bu girdiyi günceller).
function createSegmentEl(seg, idx) {
  const el = document.createElement('div');
  el.className = 'segment';
  if (seg.previewEdited) el.classList.add('edited');
  el.dataset.text = (seg.text || '').toLocaleLowerCase('tr');
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
  textEl.textContent = newText;
  if (newText === entry.text) return;
  entry.text = newText;
  entry.previewEdited = true;
  segEl.dataset.text = newText.toLocaleLowerCase('tr');
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
  // DOM sınırından çıkan düzenlemeler de modelde saklanır. İndekse değil zaman
  // aralığına eşle; yeniden bölünmüş bir bloğa başka kullanıcının metnini taşıma.
  const focused = document.activeElement;
  if (focused?.matches?.('.segment-text[contenteditable="true"]') && preview.contains(focused)) commitSegmentEdit(focused);
  const oldEdits = state.previewSegs.filter(s => s.previewEdited);
  const edits = new Map();
  oldEdits.forEach(s => { const key = `${s.start}|${s.end}`; edits.set(key, edits.has(key) ? null : s); });
  const matched = new Set();
  const counts = new Map();
  segs.forEach(s => { const key = `${s.start}|${s.end}`; counts.set(key, (counts.get(key) || 0) + 1); });
  state.previewSegs = segs.map(s => {
    const key = `${s.start}|${s.end}`;
    const edited = counts.get(key) === 1 ? edits.get(key) : null;
    if (edited) matched.add(key);
    return edited ? { ...s, text: edited.text, previewEdited: true } : { ...s };
  });
  // Sınırları değişen kullanıcı düzenlemesini sessizce kaybetme: ayrı kopya.
  playerPreviewUnmatchedEdits = [...playerPreviewUnmatchedEdits,
    ...oldEdits.filter(s => !matched.has(`${s.start}|${s.end}`)).map(s => ({ ...s }))];
  if (playerPreviewUnmatchedEdits.length) {
    logLine(`${playerPreviewUnmatchedEdits.length} düzenlenmiş bloğun zaman aralığı değişti; kopyası “Düzenleme yedeği” ile alınabilir.`, 'warn');
  }
  $('copyPreviewEdits')?.classList.toggle('hidden', !playerPreviewUnmatchedEdits.length);
  const offset = segs.length > PREVIEW_DOM_CAP ? segs.length - PREVIEW_DOM_CAP : 0;
  const visible = state.previewSegs.slice(offset);
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
$$('.tab[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    activateTab(tab.dataset.tab);
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
    const added = files.reduce(
      (count, file) => count + (addToQueue('file', file, { watchSource: true }) ? 1 : 0), 0);
    if (added) logLine(`Klasörde ${added} yeni dosya bulundu, kuyruğa eklendi.`, 'success');
    if (added < files.length) {
      logLine(`${files.length - added} dosya zaten kuyrukta olduğu için yinelenmedi.`, 'info');
    }
    if (added && !state.queueRunning && !state.running) {
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
  let paths = Array.from(e.dataTransfer.files)
    .map((f) => window.api.getFilePath(f))
    .filter(Boolean);

  if (paths.length > 0) {
    const subtitlePaths = paths.filter((item) => /\.(?:srt|vtt|ass|ssa)$/i.test(item));
    const playerLayer = $('playerLayer');
    if (subtitlePaths.length && playerLayer && !playerLayer.classList.contains('hidden')) {
      const subtitlePath = subtitlePaths[0];
      addSubtitleOption(subtitlePath);
      if ($('playerSubSelect')) $('playerSubSelect').value = subtitlePath;
      await loadSubtitle(subtitlePath);
      logLine(`Altyazı oynatıcıya yüklendi: ${subtitlePath.split(/[\\/]/).pop()}`, 'success');
      paths = paths.filter((item) => !subtitlePaths.includes(item));
      if (!paths.length) return;
    }
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
  $$('.tab[data-tab]').forEach((t) => {
    const active = t.dataset.tab === target;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
    t.tabIndex = active ? 0 : -1;
  });
  $$('.tab-content[data-content]').forEach((c) => c.classList.toggle('hidden', c.dataset.content !== target));
  state.source = target;
  updateSignalDesk();
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
  if (_validationTargetId === 'dropZone') clearJobValidation();
  updateSignalDesk();
}

// Seçilen dosyanın ses kanallarını ffprobe ile listele; >1 kanal varsa dropdown göster.
// Kanal seçimi dosyaya özgüdür — kalıcı ayara yazılmaz.
let audioTrackProbeGeneration = 0;
function resetAudioTracks() {
  audioTrackProbeGeneration++;
  const field = $('audioTrackField');
  const sel = $('audioTrack');
  if (sel) sel.innerHTML = '<option value="-1">Otomatik (varsayılan kanal)</option>';
  if (field) field.classList.add('hidden');
}

async function refreshAudioTracks(filepath) {
  resetAudioTracks();
  const generation = audioTrackProbeGeneration;
  const field = $('audioTrackField');
  const sel = $('audioTrack');
  if (!field || !sel) return;
  try {
    const res = await window.api.probeTracks(filepath);
    if (generation !== audioTrackProbeGeneration) return;
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
  updateSignalDesk();
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

$$('.secret-toggle').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const input = $(button.dataset.secretTarget);
    if (!input) return;
    const show = input.type === 'password';
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', show ? 'true' : 'false');
    const label = button.getAttribute('aria-label') || 'Gizli değeri göster';
    button.setAttribute('aria-label', show
      ? label.replace(/ göster$/i, ' gizle')
      : label.replace(/ gizle$/i, ' göster'));
    button.title = button.getAttribute('aria-label');
    input.focus();
    if (Number.isInteger(start) && Number.isInteger(end)) input.setSelectionRange(start, end);
  });
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
  if (e.key === 'Enter' && !e.isComposing && !state.running) {
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

let _settingsSaveWarningShown = false;
function secretSettingValue(id) {
  const control = $(id);
  const value = control?.value.trim() || '';
  // Kasa açılamadığı için boş gelen alan, kullanıcının silme isteği değildir.
  return (value || control?.dataset.secretEdited === 'true') ? value : undefined;
}
document.addEventListener('change', (event) => {
  if (['hfToken', 'translateApiKey', 'mangaApiKey', 'llmApiKey'].includes(event.target.id)) {
    event.target.dataset.secretEdited = 'true';
  }
}, true);
async function saveAppSettings() {
  let saved;
  try {
    saved = await window.api.saveSettings(appSettingsPayload());
  } catch (_) {
    saved = false;
  }
  if (saved === false || saved?.ok === false) {
    if (!_settingsSaveWarningShown) {
      _settingsSaveWarningShown = true;
      const message = saved?.error
        || 'Ayarlar güvenli biçimde kaydedilemedi. Güvenli anahtar deposunu ve disk erişimini kontrol edin.';
      logLine(message, 'error');
      if (player.workspaceMode === 'browser') {
        setBrowserSignal(message, false,
          { priority: 100, holdMs: 8000 });
      }
    }
    return false;
  }
  _settingsSaveWarningShown = false;
  return true;
}

function appSettingsPayload() {
  return {
    glossary,
    hfToken: secretSettingValue('hfToken'),
    outputDir: state.outputDir || '',
    preset: $('presetSelect').value,
    presetReference: _presetReference,
    watchDir: state.watchDir || '',
    translate: {
      apiKey: secretSettingValue('translateApiKey'),
      endpointPreset: $('translateEndpointPreset') ? $('translateEndpointPreset').value : '',
      customBaseUrl: $('translateBaseUrl') ? $('translateBaseUrl').value.trim() : '',
      model: $('translateModel') ? $('translateModel').value.trim() : '',
    },
    manga: {
      apiKey: secretSettingValue('mangaApiKey'),
      endpointPreset: $('mangaEndpointPreset') ? $('mangaEndpointPreset').value : 'inherit',
      customBaseUrl: $('mangaBaseUrl') ? $('mangaBaseUrl').value.trim() : '',
      model: $('mangaModel') ? $('mangaModel').value.trim() : '',
      targetLanguage: $('browserMangaTarget')?.value || 'tr',
      workers: Number($('browserMangaWorkers')?.value) || 2,
      maxImages: Number($('browserMangaMaxImages')?.value) || 48,
      fontScale: (Number($('browserMangaFontScale')?.value) || 100) / 100,
      fontFamily: $('browserMangaFont')?.value || 'comic',
      autoTranslate: !!$('browserMangaAuto')?.checked,
      verticalText: !!$('browserMangaVertical')?.checked,
      sfxStyle: $('browserMangaSfx')?.checked !== false,
    },
    llm: {
      apiKey: secretSettingValue('llmApiKey'),
      endpointPreset: $('llmEndpointPreset') ? $('llmEndpointPreset').value : '',
      customBaseUrl: $('llmBaseUrl') ? $('llmBaseUrl').value.trim() : '',
      model: $('llmModel') ? $('llmModel').value.trim() : '',
    },
    ui: collectUiSettings(),
    playerPositions: player.positions,
  };
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
  'subSize', 'subOffset', 'playerSpeed', 'playerVolume', 'playerPlaybackPolicy', 'youtubeCookieBrowser',
  'browserMangaTarget', 'browserMangaFont', 'browserMangaWorkers', 'browserMangaMaxImages', 'browserMangaFontScale',
  'browserOverlayScale', 'browserOverlayOpacity', 'browserOverlayBottom', 'browserOverlayWidth', 'browserOverlayMaxLines',
];
const PERSIST_CHECKBOX_CONTROLS = [
  'fixTimings', 'snapToSpeech', 'mergeShort', 'mergeIncomplete', 'mergeContinuation', 'fixPunctuationCollapse', 'confidenceReport', 'fixCommonErrors', 'dropRepeatedHallucinations', 'syncFixFramerate', 'syncPiecewise', 'dedupe', 'langSuffix', 'vadFilter', 'conditionOnPrevious', 'temperatureFallback',
  'qualityReport', 'notifyOnDone', 'resume',
  'diarize', 'labelSpeakers',
  'translate', 'translateKeepSource', 'translateRefine', 'translateCache', 'dualSubtitle', 'watchEnabled',
  'playerAutoNext',
  'llmPostprocess', 'llmFixCensorship', 'llmFixHallucination',
  'llmFixPunctuation', 'llmFixConsistency',
  'browserMangaAuto', 'browserMangaVertical', 'browserMangaSfx', 'browserOverlaySourceFirst', 'browserHideSiteCaptions',
  'browserHardwareAcceleration',
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

let _presetReference = 'film';
const PRESET_CONTROL_LABELS = {
  model: 'Model', engine: 'Motor', batchSize: 'Batch', beamSize: 'Beam', bestOf: 'Best of',
  computeType: 'Hesaplama', splitMode: 'Bölme', wrapMode: 'Satır kırma', maxLineWidth: 'Satır genişliği',
  hardMaxChars: 'Blok sınırı', maxCps: 'KPS sınırı', translateContext: 'Çeviri bağlamı',
  vadFilter: 'VAD', temperatureFallback: 'Sıcaklık yedeği', mergeShort: 'Kısa blok birleştirme',
  dedupe: 'Tekrar temizleme', snapToSpeech: 'Konuşmaya yaslama', fixTimings: 'Zaman düzeltme',
  conditionOnPrevious: 'Önceki metin bağlamı', mergeIncomplete: 'Eksik cümle birleştirme',
  fixPunctuationCollapse: 'Noktalama savunması', confidenceReport: 'Güven raporu', fixCommonErrors: 'Yaygın hata düzeltme',
};

function presetControlValue(id) {
  const el = $(id);
  if (!el) return null;
  if (el.type === 'checkbox') return el.checked;
  return String(el.value);
}

function presetValueLabel(id, value) {
  const el = $(id);
  if (typeof value === 'boolean') return value ? 'Açık' : 'Kapalı';
  if (el && el.tagName === 'SELECT') {
    const option = [...el.options].find((item) => String(item.value) === String(value));
    if (option) return option.textContent.trim();
  }
  return String(value);
}

function currentPresetDiffs() {
  const preset = PRESETS[_presetReference] || PRESETS.film;
  const expected = { ...preset.values, ...preset.checks };
  return Object.entries(expected).flatMap(([id, value]) => {
    const current = presetControlValue(id);
    if (current === null || String(current) === String(value)) return [];
    return [{ id, label: PRESET_CONTROL_LABELS[id] || id, current: presetValueLabel(id, current), expected: presetValueLabel(id, value) }];
  });
}

function updatePresetDiff() {
  const preset = PRESETS[_presetReference] || PRESETS.film;
  const diffs = currentPresetDiffs();
  $('presetDiffLabel').textContent = `${preset.label} profili`;
  $('presetDiffCount').textContent = diffs.length ? `${diffs.length} fark` : 'Aynı';
  $('presetDiffCount').classList.toggle('is-dirty', diffs.length > 0);
  $('presetDiffIntro').textContent = diffs.length
    ? `Seçili ayarlar ${preset.label} profilinden ayrılıyor. İş bu görünür değerlerle çalışacak.`
    : `${preset.label} profilinin dokunduğu ayarlar değişmedi.`;
  const list = $('presetDiffList');
  list.innerHTML = '';
  diffs.slice(0, 8).forEach((diff) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const value = document.createElement('strong');
    label.textContent = diff.label;
    label.title = `Profil: ${diff.expected}`;
    value.textContent = diff.current;
    item.append(label, value);
    list.appendChild(item);
  });
}

function updateSignalDesk() {
  if (!$('signalDesk')) return;
  const source = state.source === 'youtube'
    ? ($('youtubeUrl').value.trim() ? 'YouTube bağlantısı' : 'YouTube bekleniyor')
    : (state.inputFile ? state.inputFile.split(/[\\/]/).pop() : 'Dosya bekleniyor');
  $('summarySource').textContent = source;
  $('summarySource').title = state.source === 'file' && state.inputFile ? state.inputFile : source;
  const engineOption = $('engine').selectedOptions[0];
  const engine = engineOption ? engineOption.textContent.split('(')[0].trim() : $('engine').value;
  $('summaryEngine').textContent = `${$('model').value} · ${engine}`;
  $('summaryOutput').textContent = $('formats').selectedOptions[0]?.textContent.trim() || $('formats').value.toUpperCase();
  const translation = $('translate').checked || state.forceTranslate;
  $('summaryTranslation').textContent = translation
    ? `Çeviri → ${$('translateTo').selectedOptions[0]?.textContent.trim() || $('translateTo').value}`
    : ($('task').value === 'translate' ? 'Whisper → İngilizce' : 'Kaynak altyazı');
  const estimate = estimateVramMib();
  const total = Number(state.gpuVramMib) || 0;
  const tight = total > 0 && estimate > total * .85;
  $('summaryVram').textContent = total ? `~${estimate} / ${total} MiB${tight ? ' · sınırda' : ''}` : `~${estimate} MiB tahmin`;
  $('summaryVram').classList.toggle('is-tight', tight);
  updatePresetDiff();
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  _presetReference = name;
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
  updateSignalDesk();
  logLine(`Ön ayar uygulandı: ${p.label} — model ${p.values.model}, motor ${p.values.engine}, beam ${p.values.beamSize}`, 'success');
  saveAppSettings();
}

$('presetSelect').addEventListener('change', () => {
  const v = $('presetSelect').value;
  if (v !== 'custom') applyPreset(v);
  else { updateSignalDesk(); saveAppSettings(); }
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
    updateSignalDesk();
  });
});

$('presetDiffBtn').addEventListener('click', () => {
  const expanded = $('presetDiffBtn').getAttribute('aria-expanded') === 'true';
  $('presetDiffBtn').setAttribute('aria-expanded', expanded ? 'false' : 'true');
  $('presetDiffPanel').classList.toggle('hidden', expanded);
});

$('jobValidationFix').addEventListener('click', () => {
  const target = _validationTargetId ? $(_validationTargetId) : null;
  if (!target) return;
  let parent = target.parentElement;
  while (parent) {
    if (parent.tagName === 'DETAILS') parent.open = true;
    parent = parent.parentElement;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  requestAnimationFrame(() => target.focus());
});

const SIGNAL_SUMMARY_CONTROLS = new Set([
  'model', 'engine', 'batchSize', 'computeType', 'device', 'diarize', 'formats', 'translate',
  'translateTo', 'task', ...PRESET_CONTROLS,
]);
document.addEventListener('change', (event) => {
  if (!SIGNAL_SUMMARY_CONTROLS.has(event.target.id)) return;
  updateSignalDesk();
  const problem = optsProblemInfo(buildOptsFromUI());
  if (!problem) clearJobValidation();
});
$('youtubeUrl').addEventListener('input', () => {
  if (_validationTargetId === 'youtubeUrl' && $('youtubeUrl').value.trim()) clearJobValidation();
  updateSignalDesk();
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
  const model = $('translateModel');
  if (!model) return;
  const current = model.value.trim();
  if (preset.value.includes('generativelanguage.googleapis.com')
      && (!current || ['gpt-4.1-mini', 'deepseek-chat'].includes(current))) {
    model.value = 'gemini-3.7-flash';
  }
}

if ($('translateEndpointPreset')) {
  $('translateEndpointPreset').addEventListener('change', () => {
    updateTranslateEndpointUI();
    saveAppSettings();
  });
  updateTranslateEndpointUI();
}

function updateMangaEndpointUI() {
  const preset = $('mangaEndpointPreset');
  const customField = $('mangaCustomUrlField');
  if (!preset || !customField) return;
  customField.classList.toggle('hidden', preset.value !== 'custom');
}

if ($('mangaEndpointPreset')) {
  $('mangaEndpointPreset').addEventListener('change', () => {
    updateMangaEndpointUI();
    saveAppSettings();
  });
  updateMangaEndpointUI();
}

// API anahtarı yazılınca kaydet (gizli alanlar PERSIST listesinde değil)
['translateApiKey', 'mangaApiKey'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', saveAppSettings);
});
['mangaBaseUrl', 'mangaModel'].forEach((id) => {
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
      if (s.manga) {
        if (s.manga.apiKey && $('mangaApiKey')) $('mangaApiKey').value = s.manga.apiKey;
        if (s.manga.endpointPreset && $('mangaEndpointPreset')) $('mangaEndpointPreset').value = s.manga.endpointPreset;
        if (s.manga.customBaseUrl && $('mangaBaseUrl')) $('mangaBaseUrl').value = s.manga.customBaseUrl;
        if (s.manga.model && $('mangaModel')) $('mangaModel').value = s.manga.model;
        updateMangaEndpointUI();
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
      if (s.presetReference && PRESETS[s.presetReference]) _presetReference = s.presetReference;
      else if (s.preset && PRESETS[s.preset]) _presetReference = s.preset;
    }
  } catch (_) {}
  await restorePersistedQueue();
  await offerBurnInRecovery();
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
  await refreshModelStatus();
  updateSignalDesk();
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

let modelStatusSnapshot = null;
let modelBenchmarkRunning = false;

function renderSelectedModelStatus() {
  const status = $('modelInstallStatus');
  if (!status) return;
  const selected = $('model')?.value || '';
  const entry = modelStatusSnapshot?.models?.find((item) => item.id === selected);
  status.textContent = !modelStatusSnapshot ? 'Önbellek denetlenmedi'
    : entry?.installed ? 'Bu cihazda hazır' : 'İlk kullanımda indirilecek';
  status.title = entry?.repository || status.textContent;
}

async function refreshModelStatus() {
  if (!window.api.getModelStatus) return;
  const result = await window.api.getModelStatus().catch(() => null);
  if (result?.ok) modelStatusSnapshot = result;
  renderSelectedModelStatus();
}

if ($('model')?.addEventListener) $('model').addEventListener('change', renderSelectedModelStatus);
if ($('modelStatusRefresh')?.addEventListener) $('modelStatusRefresh').addEventListener('click', refreshModelStatus);
if ($('modelBenchmark')?.addEventListener) $('modelBenchmark').addEventListener('click', async () => {
  const button = $('modelBenchmark');
  if (modelBenchmarkRunning) {
    await window.api.cancelModelBenchmark?.().catch(() => null);
    return;
  }
  modelBenchmarkRunning = true;
  if (button) button.textContent = 'Benchmarkı durdur';
  if ($('modelInstallStatus')) $('modelInstallStatus').textContent = 'Dosya seçimi bekleniyor…';
  const result = await window.api.benchmarkModel?.({
    model: $('model')?.value,
    device: $('device')?.value,
    computeType: $('computeType')?.value,
    language: $('language')?.value,
  }).catch((error) => ({ ok: false, error: error.message }));
  modelBenchmarkRunning = false;
  if (button) button.textContent = '30 sn benchmark';
  if (result?.canceled) {
    renderSelectedModelStatus();
    return;
  }
  if (result?.ok) {
    const message = `${result.model} · ${result.audioSeconds.toFixed(1)} sn ses · ${result.transcribeSeconds.toFixed(1)} sn işlem · ${result.speedX.toFixed(1)}× gerçek zaman`;
    if ($('modelInstallStatus')) $('modelInstallStatus').textContent = `${result.speedX.toFixed(1)}× gerçek zaman`;
    logLine(`Model benchmarkı: ${message}`, 'success');
    await refreshModelStatus();
  } else {
    if ($('modelInstallStatus')) $('modelInstallStatus').textContent = 'Benchmark tamamlanamadı';
    logLine(`Model benchmarkı: ${result?.error || 'bilinmeyen hata'}`, 'warn');
  }
});

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
  updateSignalDesk();
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
  const problemInfo = optsProblemInfo(opts);
  if (problemInfo) {
    logLine(problemInfo.message, 'error');
    showJobValidation(problemInfo);
    return;
  }

  if (state.source === 'youtube') {
    const url = $('youtubeUrl').value.trim();
    if (!url) {
      logLine('YouTube URL boş olamaz.', 'error');
      showJobValidation({ message: 'YouTube bağlantısını girin veya Dosya sekmesine geçin.', fieldId: 'youtubeUrl' });
      return;
    }
    opts.youtube = url;
    state.lastJobVideo = null;  // YouTube → burn-in için yerel video yok
  } else {
    if (!state.inputFile) {
      logLine('Lütfen bir dosya seç.', 'error');
      showJobValidation({ message: 'Başlatmadan önce bir video veya ses dosyası seçin.', fieldId: 'dropZone' });
      return;
    }
    opts.input = state.inputFile;
    state.lastJobVideo = state.inputFile;
  }
  clearJobValidation();

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
  const aiJob = state.aiJob && player.job && ['chat', 'explain'].includes(player.job.kind)
    ? player.job : null;
  if (aiJob) {
    aiJob.cancelled = true;
    aiJob.running = false;
    aiJob.awaitingExit = true;
    if (aiJob.bubble) {
      aiJob.bubble.classList.remove('is-loading');
      aiJob.bubble.classList.add('ai-msg-err');
      aiJob.bubble.textContent = 'İptal edildi.';
    } else if (aiJob.kind === 'explain') {
      showAiAnswer(aiJob.explainTitle || 'AI', 'İptal edildi.');
    }
    state.running = false;
    state.aiJob = false;
    $('startBtn').classList.remove('hidden');
    $('cancelBtn').classList.add('hidden');
    $('playerJobText').textContent = 'AI işi iptal edildi.';
    $('playerJobBar').classList.add('hidden');
  }
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
    if (aiJob && player.job === aiJob) player.job = null;
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
    loadLearningAnnotations();
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
  const ordered = [...qualityCues].sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0;
  let previousStart = -Infinity;
  return cues.map((cue) => {
    if (cue.start < previousStart) cursor = 0;
    previousStart = cue.start;
    while (cursor < ordered.length && ordered[cursor].end <= cue.start) cursor++;
    let best = null, overlap = 0;
    for (let index = cursor; index < ordered.length; index++) {
      const q = ordered[index];
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
      state.running = false;
      state.aiJob = false;
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
    if (job.bubble) {
      job.bubble.classList.remove('is-loading');
      job.bubble.classList.add('ai-msg-err');
      job.bubble.textContent = 'Video değiştiği için önceki videonun yanıtı bu sohbete eklenmedi.';
    }
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
    if (job.chatQuestion) {
      player.chatHistory.push({ role: 'user', content: job.chatQuestion });
    }
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
      if (isSyncJob) {
        player.offset = 0;
        if ($('subOffset')) {
          $('subOffset').value = '0';
          $('subOffset').dispatchEvent(new Event('input'));
        }
      }
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
  // Kuyruk durdurulmuş veya yeni bir tekil iş başlamış olsa bile eski Python
  // sürecinden geç gelen terminal/progress olayı yeni arayüz durumuna sızmasın.
  if (event.queueItemId != null && event.queueItemId !== state.currentQueueId) return;
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
      {
        const percent = Number.isFinite(Number(event.percent)) ? Number(event.percent) : 0;
        setProgress(percent);
        $('progressText').textContent = `İndiriliyor ${percent.toFixed(0)}%`;
      }
      break;

    case 'language':
      logLine(`Dil: ${event.code} (güven: ${(event.probability * 100).toFixed(1)}%) — süre: ${formatTime(event.duration)}`, 'success');
      break;

    case 'progress': {
      const percent = Number.isFinite(Number(event.percent)) ? Number(event.percent) : 0;
      setProgress(percent);
      $('progressText').textContent = `${percent.toFixed(1)}%`;
      const elapsed = (Date.now() - state.startTime) / 1000;
      // Hız (%/sn) üzerinde EMA — erken tahminlerdeki aşırı oynamayı yumuşatır
      const speed = elapsed > 0.1 ? percent / elapsed : 0;
      if (speed > 0) {
        state._speedEma = state._speedEma > 0 ? state._speedEma * 0.7 + speed * 0.3 : speed;
      }
      const remaining = state._speedEma > 0 ? (100 - percent) / state._speedEma : 0;
      $('progressTime').textContent = `${formatTime(event.current)} / ${formatTime(event.total)} · kalan ~${formatTime(remaining)}`;
      break;
    }

    case 'segment':
      if (state.cancelled) break;  // iptal sonrası gelen geç segmentleri yok say
      addSegment(event);
      break;

    case 'llm_progress': {
      const percent = Number.isFinite(Number(event.percent)) ? Number(event.percent) : 0;
      setProgress(percent);
      // Ayni kanal hem LLM duzeltmesi hem ceviri icin kullaniliyor (stage ayirir)
      const _lbl = event.stage === 'translate' ? 'Çevriliyor' : 'LLM düzeltiyor';
      $('progressText').textContent = `${_lbl} ${percent.toFixed(1)}% (${event.done}/${event.total})`;
      if (event.failed) $('progressTime').textContent = `${event.failed} blokta hata`;
      break;
    }

    case 'preview_refresh':
      // LLM/diarization metni değiştirdi — önizlemeyi nihai çıktıyla tek seferde tazele
      renderFinalPreview(event.segments || []);
      break;

    case 'quality_report':
      state.lastQualityReport = event;
      renderReviewCenter();
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
          reportWatchQueueResult(item, 'done');
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
      setStatus('Hata', 'error');

      if (state.queueRunning && state.currentQueueId !== null) {
        const item = state.queue.find(x => x.id === state.currentQueueId);
        if (item) {
          item.status = 'error';
          reportWatchQueueResult(item, 'error');
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
        if (event.code !== 0 && item && item.status === 'running') {
          item.status = 'error';
          reportWatchQueueResult(item, 'error');
        }
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
      const issueCount = Number(qr.cps_violations || 0) + Number(qr.overlaps || 0) + Number(qr.too_long || 0);
      $('qualityCps').textContent = String(qr.cps_violations || 0);
      $('qualityOverlap').textContent = String(qr.overlaps || 0);
      $('qualityLong').textContent = String(qr.too_long || 0);
      $('qualityMaxCps').textContent = String(Math.round(Number(qr.max_cps) || 0));
      $('qualityVerdict').textContent = issueCount ? 'Elle kontrol' : 'Sorunsuz';
      $('qualityVerdict').classList.toggle('needs-review', issueCount > 0);
      qEl.classList.remove('hidden');
    } else {
      qEl.classList.add('hidden');
    }
  }

  const filesEl = $('modalFiles');
  filesEl.innerHTML = '';
  (event.files || []).forEach((f) => {
    const button = document.createElement('button');
    button.className = 'modal-file-item';
    button.type = 'button';
    const name = f.split(/[\\/]/).pop();
    button.setAttribute('aria-label', `${name} dosyasını aç`);
    button.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <span class="modal-file-action">Aç</span>
    `;
    button.addEventListener('click', () => window.api.openPath(f));
    filesEl.appendChild(button);
  });

  // Araçları sıfırla: kaydırma + burn-in
  $('shiftSeconds').value = '0';
  $('burninProgress').classList.add('hidden');
  $('burnInCancel').classList.add('hidden');
  $('burnInBtn').classList.remove('hidden');
  // Burn-in yalnızca yerel video + SRT/ASS çıktısı varsa anlamlı
  const canBurn = !!state.lastJobVideo && !!pickOutput(['.srt', '.ass']);
  $('burninRow').classList.toggle('hidden', !canBurn);
  $('reviewOutput').disabled = !state.lastJobVideo;
  $('reviewOutput').title = state.lastJobVideo
    ? 'Videoyu son çıktıyla oynatıcıda aç'
    : 'YouTube işleri geçmişteki İzle eyleminden yeniden açılabilir';

  openManagedModal($('resultModal'), state.lastJobVideo ? $('reviewOutput') : $('openOutput'));
}

$('closeModal').addEventListener('click', () => {
  closeManagedModal($('resultModal'));
});

$('openOutput').addEventListener('click', () => {
  const f = state.outputFiles[0];
  if (f) window.api.showInFolder(f);
  closeManagedModal($('resultModal'));
});

$('reviewOutput').addEventListener('click', () => {
  if (!state.lastJobVideo) return;
  closeManagedModal($('resultModal'), false);
  openPlayer();
});

// ===== Kuyruk buton event'leri =====
$('queueAddBtn').addEventListener('click', () => {
  if (state.source === 'youtube') {
    const url = $('youtubeUrl').value.trim();
    if (!url) {
      logLine('YouTube URL boş', 'warn');
      showJobValidation({ message: 'Kuyruğa eklemek için YouTube bağlantısını girin.', fieldId: 'youtubeUrl' });
      return;
    }
    addToQueue('youtube', url);
    $('youtubeUrl').value = '';
    logLine(`+ Kuyruğa eklendi: ${url.slice(0, 50)}...`);
  } else {
    if (!state.inputFile) {
      logLine('Önce bir dosya seç', 'warn');
      showJobValidation({ message: 'Kuyruğa eklemek için önce bir video veya ses dosyası seçin.', fieldId: 'dropZone' });
      return;
    }
    addToQueue('file', state.inputFile);
    logLine(`+ Kuyruğa eklendi: ${state.inputFile.split(/[\\/]/).pop()}`);
    // Dosyayı temizle (kuyruğa eklendi, bir sonrakini seçebilsin)
    state.inputFile = null;
    resetAudioTracks();
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

window.addEventListener('beforeunload', () => {
  clearTimeout(_saveTimer);
  _saveTimer = null;
  // Son kontrol değişikliği 400 ms debounce içindeyken pencere kapanırsa invoke
  // cevabı beklenemez. Yalnız kapanış anında kullanılan senkron köprü, ana
  // sürecin ayarı diske yazdığını renderer yok edilmeden önce doğrular.
  try { window.api.saveSettingsSync?.(appSettingsPayload()); } catch (_) {}
  // Kapanışta son kuyruk değişikliğini senkron onayla; normal kullanımda
  // kısa debounce ve ana sürecin iş yaşam döngüsü kayıtları devam eder.
  if (_queuePersistenceReady && window.api.saveQueueStateSync) {
    try { window.api.saveQueueStateSync(queueSnapshotPayload()); } catch (_) {}
  } else persistQueueNow();
});

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
  // Modalın capture dinleyicisi Escape/Tab'i yönetir. Diğer tuşların (özellikle
  // Ctrl+Enter) aşağıdaki genel iş kısayollarına sızmasına izin verme.
  if (_activeModal) return;
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
  if (s.translate) {
    if (s.translate.apiKey !== undefined && $('translateApiKey')) {
      $('translateApiKey').value = s.translate.apiKey || '';
    }
    if (s.translate.endpointPreset && $('translateEndpointPreset')) {
      $('translateEndpointPreset').value = s.translate.endpointPreset;
    }
    if (s.translate.customBaseUrl !== undefined && $('translateBaseUrl')) {
      $('translateBaseUrl').value = s.translate.customBaseUrl || '';
    }
    if (s.translate.model && $('translateModel')) $('translateModel').value = s.translate.model;
    updateTranslateEndpointUI();
  }
  if (s.manga) {
    if (s.manga.apiKey !== undefined && $('mangaApiKey')) $('mangaApiKey').value = s.manga.apiKey || '';
    if (s.manga.endpointPreset && $('mangaEndpointPreset')) $('mangaEndpointPreset').value = s.manga.endpointPreset;
    if (s.manga.customBaseUrl !== undefined && $('mangaBaseUrl')) $('mangaBaseUrl').value = s.manga.customBaseUrl || '';
    if (s.manga.model !== undefined && $('mangaModel')) $('mangaModel').value = s.manga.model || '';
    updateMangaEndpointUI();
  }
  if (s.ui) applyUiSettings(s.ui);
  if (s.preset && $('presetSelect').querySelector(`option[value="${s.preset}"]`)) $('presetSelect').value = s.preset;
  if (s.presetReference && PRESETS[s.presetReference]) _presetReference = s.presetReference;
  else if (s.preset && PRESETS[s.preset]) _presetReference = s.preset;
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

function setBurninRunningUi() {
  $('burninProgress').classList.remove('hidden');
  $('burnInBtn').classList.add('hidden');
  $('burnInCancel').classList.remove('hidden');
  $('burninFill').style.width = '0%';
  $('burninText').textContent = 'Gömülüyor… 0%';
}

$('burnInBtn').addEventListener('click', async () => {
  const sub = pickOutput(['.srt', '.ass']);
  if (!state.lastJobVideo) { logLine('Gömme yalnızca yerel video girdisinde mümkün (YouTube değil).', 'warn'); return; }
  if (!sub) { logLine('Gömülecek SRT/ASS çıktısı yok.', 'warn'); return; }
  const r = await window.api.burnInStart(state.lastJobVideo, sub);
  if (!r || !r.ok) { logLine('Gömme başlatılamadı: ' + ((r && r.error) || ''), 'error'); return; }
  setBurninRunningUi();
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
const { BrowserTabEventGate } = window.BrowserTabs;

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
  cueListPageStart: 0,
  cueListQueryKey: '',
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
  localSubtitleWorkspace: null,
  browserTabs: [],
  browserTabCreateBusy: false,
  browserClosingTabs: new Set(),
  browserActiveTabId: '',
  browserTabEventGate: new BrowserTabEventGate(),
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
  browserWorkspaceSeq: 0,
  browserOverlayTimer: null,
  browserTrackRefreshTimers: {},
  browserLoadedTrackId: '',
  browserLoadedTrackId2: '',
  browserDiagnostics: null,
  browserCaptureEnabled: true,
  browserPlaces: { history: [], bookmarks: [] },
  browserPlaceTab: 'bookmarks',
  browserPlacesSeq: 0,
  browserNavigateSeq: 0,
  browserPrepareSeq: 0,
  browserTranslatePreparing: false,
  browserDeferredTrackAction: null,
  browserDeferredTrackTimer: null,
  browserMangaBusy: false,
  browserMangaTranslated: 0,
  browserMangaVisible: false,
  browserMangaCompleted: 0,
  browserMangaTotal: 0,
  browserMangaFailed: 0,
  browserMangaEmpty: 0,
  browserMangaRetryable: 0,
  browserMangaError: '',
  browserMangaAutoUrl: '',
  browserMangaAutoTimer: null,
  browserMangaLookaheadBusy: false,
  browserTranslationTrackId: '',
  browserLiveTranslations: new Map(),
  settingsPage: 'source',
  browserSignalVisible: true,
  browserSignalState: null,
  browserSignalHistory: [],
  browserChromeCollapsed: false,
  browserLiveAsrActive: false,
  browserLiveAsrStream: null,
  browserLiveAsrCapture: null,
  browserLiveAsrStarting: false,
  embeddedSubtitleTracks: [],
  playbackPolicy: 'normal',
  learningBaseRate: 1,
  shadowResumeTimer: null,
  cueEditUndo: [],
  cueEditRedo: [],
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

function newBrowserTabState(snapshot = {}) {
  return {
    id: snapshot.id || '',
    generation: Math.max(0, Number(snapshot.generation) || 0),
    url: snapshot.url || '',
    title: snapshot.title || '',
    loading: !!snapshot.loading,
    canGoBack: !!snapshot.canGoBack,
    canGoForward: !!snapshot.canGoForward,
    captureEnabled: snapshot.captureEnabled !== false,
    pinned: !!snapshot.pinned,
    diagnostics: snapshot.diagnostics || null,
    error: '',
    errorKind: '', errorCode: '', errorUrl: '',
    browserTracks: [],
    browserTime: Number(snapshot.position) || 0,
    browserDuration: Number(snapshot.duration) || 0,
    browserPaused: true,
    browserRate: Number(snapshot.rate) || 1,
    browserVolume: Number.isFinite(Number(snapshot.volume)) ? Number(snapshot.volume) : 1,
    browserMuted: !!snapshot.muted,
    tabMuted: !!snapshot.tabMuted,
    audible: !!snapshot.audible,
    browserProfileKey: '',
    browserPositionTick: 0,
    browserLoadedTrackId: '',
    browserLoadedTrackId2: '',
    browserTranslationTrackId: snapshot.translationTrackId || '',
    browserLiveTranslations: [],
    browserMangaBusy: !!snapshot.mangaBusy,
    browserMangaTranslated: Number(snapshot.mangaTranslated) || 0,
    browserMangaVisible: !!snapshot.mangaVisible,
    browserMangaCompleted: 0, browserMangaTotal: 0, browserMangaFailed: 0,
    browserMangaEmpty: 0, browserMangaRetryable: 0, browserMangaError: '',
    mediaKey: snapshot.mediaId ? `browser:${snapshot.mediaId}`
      : snapshot.url ? `browser:${browserPlaceKey(snapshot.url) || snapshot.url}` : '',
    watchSession: null,
    watchManualCompletedKey: '',
    watchManualCompleted: null,
    watchRemovedKey: '',
    cues: [], cues2: [], subtitles: [], subOrigins: {},
    subPath: '', sub2Path: '', subFormat: 'srt', subRaw: '', offset: Number(snapshot.offset) || 0,
    mediaId: snapshot.mediaId || '', service: snapshot.service || '',
    viewMode: snapshot.viewMode || 'reading', targetLanguage: snapshot.targetLanguage || '',
    trackRefs: Array.isArray(snapshot.trackRefs) ? snapshot.trackRefs.slice() : [],
    resumePending: !!snapshot.resumePending,
  };
}

function browserTabState(tabId = player.browserActiveTabId) {
  return player.browserTabs.find((tab) => tab.id === tabId) || null;
}

function saveLocalSubtitleWorkspace() {
  player.localSubtitleWorkspace = {
    cues: player.cues.slice(), cues2: player.cues2.slice(),
    cuesRaw: (player.cuesRaw || player.cues).slice(), cues2Raw: (player.cues2Raw || player.cues2).slice(),
    subtitles: player.subtitles.map((item) => ({ ...item })),
    subOrigins: { ...player.subOrigins }, subPath: player.subPath,
    sub2Path: player.sub2Path, subFormat: player.subFormat, subRaw: player.subRaw,
    offset: player.offset,
  };
}

function restoreLocalSubtitleWorkspace() {
  const saved = player.localSubtitleWorkspace;
  if (!saved) return;
  player.cues = saved.cues.slice();
  player.cues2 = saved.cues2.slice();
  player.cuesRaw = (saved.cuesRaw || saved.cues).slice();
  player.cues2Raw = (saved.cues2Raw || saved.cues2).slice();
  player.subtitles = [];
  player.subOrigins = { ...saved.subOrigins };
  player.subPath = saved.subPath;
  player.sub2Path = saved.sub2Path;
  player.subFormat = saved.subFormat;
  player.subRaw = saved.subRaw;
  player.offset = saved.offset;
  for (const [id, path, emptyLabel] of [
    ['playerSubSelect', saved.subPath, 'Altyazı yok'],
    ['playerSubSelect2', saved.sub2Path, 'Kapalı'],
  ]) {
    const select = $(id);
    if (!select) continue;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = ''; empty.textContent = emptyLabel; select.appendChild(empty);
  }
  saved.subtitles.forEach((item) => addSubtitleOption(item.path, item.label));
  if ($('playerSubSelect')) $('playerSubSelect').value = saved.subPath;
  if ($('playerSubSelect2')) $('playerSubSelect2').value = saved.sub2Path;
  if ($('subOffset')) $('subOffset').value = String(saved.offset);
  if ($('subOffsetVal')) $('subOffsetVal').textContent = Number(saved.offset).toFixed(1);
  player.activeIdx = -1;
  player.activeIdx2 = -1;
  syncSubtitleModeUi();
  renderTranscript();
  renderCue();
  updateSubtitleChips();
}

function saveActiveBrowserTabWorkspace() {
  const tab = browserTabState();
  if (!tab) return;
  Object.assign(tab, {
    url: player.browserPageUrl,
    title: player.browserPageTitle,
    captureEnabled: player.browserCaptureEnabled,
    diagnostics: player.browserDiagnostics,
    browserTracks: player.browserTracks.slice(),
    browserTime: player.browserTime,
    browserDuration: player.browserDuration,
    browserPaused: player.browserPaused,
    browserRate: player.browserRate,
    browserVolume: player.browserVolume,
    browserMuted: player.browserMuted,
    browserProfileKey: player.browserProfileKey,
    browserPositionTick: player.browserPositionTick,
    browserLoadedTrackId: player.browserLoadedTrackId,
    browserLoadedTrackId2: player.browserLoadedTrackId2,
    browserTranslationTrackId: player.browserTranslationTrackId,
    browserLiveTranslations: [...player.browserLiveTranslations.values()],
    browserMangaBusy: player.browserMangaBusy,
    browserMangaTranslated: player.browserMangaTranslated,
    browserMangaVisible: player.browserMangaVisible,
    browserMangaCompleted: player.browserMangaCompleted,
    browserMangaTotal: player.browserMangaTotal,
    browserMangaFailed: player.browserMangaFailed,
    browserMangaEmpty: player.browserMangaEmpty,
    browserMangaRetryable: player.browserMangaRetryable,
    browserMangaError: player.browserMangaError,
    mediaKey: player.mediaKey,
    watchSession: player.watchSession ? { ...player.watchSession } : null,
    watchManualCompletedKey: player.watchManualCompletedKey,
    watchManualCompleted: player.watchManualCompleted,
    watchRemovedKey: player.watchRemovedKey,
    cues: player.cues.slice(), cues2: player.cues2.slice(),
    cuesRaw: (player.cuesRaw || player.cues).slice(), cues2Raw: (player.cues2Raw || player.cues2).slice(),
    subtitles: player.subtitles.map((item) => ({ ...item })),
    subOrigins: { ...player.subOrigins },
    subPath: player.subPath, sub2Path: player.sub2Path,
    subFormat: player.subFormat, subRaw: player.subRaw, offset: player.offset,
    viewMode: player.viewMode,
    targetLanguage: $('translateTo')?.value || tab.targetLanguage || '',
  });
  if (window.api.updateBrowserSessionTab) {
    const refs = [];
    if (player.browserLoadedTrackId) {
      const track = player.browserTracks.find((item) => item.id === player.browserLoadedTrackId);
      refs.push({ id: player.browserLoadedTrackId, assetId: track?.assetId || '', role: track?.role || 'source' });
    }
    if (player.browserLoadedTrackId2) {
      const track = player.browserTracks.find((item) => item.id === player.browserLoadedTrackId2);
      refs.push({ id: player.browserLoadedTrackId2, assetId: track?.assetId || '', role: 'secondary' });
    }
    window.api.updateBrowserSessionTab({
      id: tab.id, url: tab.url, title: tab.title,
      mediaId: tab.mediaId || '', service: tab.service || '',
      position: tab.browserTime, duration: tab.browserDuration,
      rate: tab.browserRate, volume: tab.browserVolume, muted: tab.browserMuted,
      offset: tab.offset, captureEnabled: tab.captureEnabled,
      viewMode: player.viewMode, targetLanguage: $('translateTo')?.value || '',
      trackRefs: refs,
    }).catch(() => {});
  }
}

function restoreActiveBrowserTabWorkspace(tab) {
  if (!tab) return;
  setMediaKey(tab.mediaKey || (tab.mediaId ? `browser:${tab.mediaId}`
    : tab.url ? `browser:${browserPlaceKey(tab.url) || tab.url}` : ''));
  player.browserPageUrl = tab.url || '';
  player.browserPageTitle = tab.title || '';
  player.browserCaptureEnabled = tab.captureEnabled !== false;
  player.browserDiagnostics = tab.diagnostics || null;
  player.browserTracks = (tab.browserTracks || []).slice();
  player.browserTime = Number(tab.browserTime) || 0;
  player.browserDuration = Number(tab.browserDuration) || 0;
  player.browserPaused = tab.browserPaused !== false;
  player.browserRate = Number(tab.browserRate) || 1;
  player.browserVolume = Number.isFinite(Number(tab.browserVolume)) ? Number(tab.browserVolume) : 1;
  player.browserMuted = !!tab.browserMuted;
  player.browserProfileKey = tab.browserProfileKey || '';
  player.browserPositionTick = Number(tab.browserPositionTick) || 0;
  player.browserLoadedTrackId = tab.browserLoadedTrackId || '';
  player.browserLoadedTrackId2 = tab.browserLoadedTrackId2 || '';
  player.browserTranslationTrackId = tab.browserTranslationTrackId || '';
  // Eski oturum kayıtlarında çeviri izi yüklü olsa da rol kimliği boş
  // kalabiliyordu. Kaydedilmiş izin rolünden güvenli biçimde yeniden çıkar;
  // böylece yeniden açılışta çeviri seçicisi devre dışı kalmaz.
  const restoredPrimaryTrack = player.browserTracks.find((track) =>
    track.id === player.browserLoadedTrackId && track.role === 'translation');
  if (!player.browserTranslationTrackId && restoredPrimaryTrack) {
    player.browserTranslationTrackId = restoredPrimaryTrack.id;
  }
  player.browserLiveTranslations = new Map((tab.browserLiveTranslations || []).map((cue) => [String(cue.id || `${cue.start}:${cue.end}`), cue]));
  player.browserMangaBusy = !!tab.browserMangaBusy;
  player.browserMangaTranslated = Number(tab.browserMangaTranslated) || 0;
  player.browserMangaVisible = !!tab.browserMangaVisible;
  player.browserMangaCompleted = Number(tab.browserMangaCompleted) || 0;
  player.browserMangaTotal = Number(tab.browserMangaTotal) || 0;
  player.browserMangaFailed = Number(tab.browserMangaFailed) || 0;
  player.browserMangaEmpty = Number(tab.browserMangaEmpty) || 0;
  player.browserMangaRetryable = Number(tab.browserMangaRetryable) || 0;
  player.browserMangaError = tab.browserMangaError || '';
  player.watchSession = tab.watchSession ? { ...tab.watchSession, lastClock: 0 } : null;
  player.watchManualCompletedKey = tab.watchManualCompletedKey || '';
  player.watchManualCompleted = tab.watchManualCompleted ?? null;
  player.watchRemovedKey = tab.watchRemovedKey || '';
  player.cues = (tab.cues || []).slice();
  player.cues2 = (tab.cues2 || []).slice();
  player.cuesRaw = (tab.cuesRaw || tab.cues || []).slice();
  player.cues2Raw = (tab.cues2Raw || tab.cues2 || []).slice();
  if (restoredPrimaryTrack && !player.browserLiveTranslations.size) {
    player.browserLiveTranslations = browserTranslationMapFromCues(player.cues);
  }
  const restoredSubtitles = (tab.subtitles || []).map((item) => ({ ...item }));
  player.subtitles = [];
  player.subOrigins = { ...(tab.subOrigins || {}) };
  player.subPath = tab.subPath || '';
  player.sub2Path = tab.sub2Path || '';
  player.subFormat = tab.subFormat || 'srt';
  player.subRaw = tab.subRaw || '';
  player.offset = Number(tab.offset) || 0;
  if ($('translateTo') && tab.targetLanguage) $('translateTo').value = tab.targetLanguage;
  ['playerSubSelect', 'playerSubSelect2'].forEach((id, index) => {
    const select = $(id);
    if (!select) return;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = ''; empty.textContent = index ? 'Kapalı' : 'Altyazı yok';
    select.appendChild(empty);
  });
  restoredSubtitles.forEach((item) => addSubtitleOption(item.path, item.label));
  if ($('playerSubSelect')) $('playerSubSelect').value = player.subPath;
  if ($('playerSubSelect2')) $('playerSubSelect2').value = player.sub2Path;
  updateBrowserTranslationExportButton();
  syncSubtitleModeUi();
  renderTranscript();
  updateSubtitleChips();
  renderBrowserTracks();
  if (browserPrimaryIsTranslation()) setSubtitleMode('translation', false);
  const savedTranslation = player.browserTracks.find((track) => track.role === 'translation' && track.autoLoad);
  if (savedTranslation && (!player.cues.length || player.browserLoadedTrackId !== savedTranslation.id)) {
    void loadPersistedBrowserTranslation(savedTranslation);
  }
  if (player.browserDiagnostics) renderBrowserDiagnostics(player.browserDiagnostics);
  setBrowserCaptureEnabled(player.browserCaptureEnabled, false);
  updateBrowserMangaButton();
  updateBrowserNavigation(tab, { preserveWorkspace: true });
  showBrowserErrorSurface(tab.error ? { kind: tab.errorKind, code: tab.errorCode, message: tab.error } : null);
  if (['cinema', 'reading', 'study'].includes(tab.viewMode)) setViewMode(tab.viewMode);
  void restoreBrowserTranslationSnapshot(tab);
}

function syncBrowserTabs(snapshots, activeTabId) {
  const previous = new Map(player.browserTabs.map((tab) => [tab.id, tab]));
  const next = [];
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const tab = previous.get(snapshot.id) || newBrowserTabState(snapshot);
    Object.assign(tab, {
      generation: Math.max(Number(tab.generation) || 0, Number(snapshot.generation) || 0),
      url: snapshot.url || '', title: snapshot.title || '', loading: !!snapshot.loading,
      canGoBack: !!snapshot.canGoBack, canGoForward: !!snapshot.canGoForward,
      captureEnabled: snapshot.captureEnabled !== false,
      pinned: snapshot.pinned !== undefined ? !!snapshot.pinned : !!tab.pinned,
      browserMangaBusy: !!snapshot.mangaBusy,
      browserMangaTranslated: Number(snapshot.mangaTranslated) || 0,
      browserMangaVisible: !!snapshot.mangaVisible,
      diagnostics: snapshot.diagnostics || tab.diagnostics,
      mediaId: snapshot.mediaId || tab.mediaId || '', service: snapshot.service || tab.service || '',
      browserTime: Number.isFinite(Number(snapshot.position)) ? Number(snapshot.position) : (tab.browserTime || 0),
      browserDuration: Number.isFinite(Number(snapshot.duration)) ? Number(snapshot.duration) : (tab.browserDuration || 0),
      browserRate: Number.isFinite(Number(snapshot.rate)) ? Number(snapshot.rate) : (tab.browserRate || 1),
      browserVolume: Number.isFinite(Number(snapshot.volume)) ? Number(snapshot.volume) : tab.browserVolume,
      browserMuted: snapshot.muted !== undefined ? !!snapshot.muted : tab.browserMuted,
      tabMuted: snapshot.tabMuted !== undefined ? !!snapshot.tabMuted : tab.tabMuted,
      audible: snapshot.audible !== undefined ? !!snapshot.audible : tab.audible,
      offset: Number.isFinite(Number(snapshot.offset)) ? Number(snapshot.offset) : (tab.offset || 0),
      viewMode: snapshot.viewMode || tab.viewMode || 'reading',
      targetLanguage: snapshot.targetLanguage || tab.targetLanguage || '',
      browserTranslationTrackId: snapshot.translationTrackId || tab.browserTranslationTrackId || '',
      trackRefs: Array.isArray(snapshot.trackRefs) ? snapshot.trackRefs.slice() : (tab.trackRefs || []),
      resumePending: !!snapshot.resumePending,
    });
    player.browserTabEventGate.open(tab.id, tab.generation, {
      mediaId: tab.mediaId || '', acquisitionId: snapshot.acquisitionId || '',
    });
    previous.delete(tab.id);
    next.push(tab);
  }
  for (const id of previous.keys()) player.browserTabEventGate.close(id);
  player.browserTabs = next;
  player.browserActiveTabId = activeTabId || (next[0] && next[0].id) || '';
  if (browserPageFind.tabId && browserPageFind.tabId !== player.browserActiveTabId) closeBrowserFind(false);
  renderBrowserTabs();
}

const browserPageFind = { tabId: '', token: 0, timer: null };
function closeBrowserFind(focusPage = true) {
  clearTimeout(browserPageFind.timer);
  const tabId = browserPageFind.tabId;
  browserPageFind.tabId = '';
  browserPageFind.token++;
  $('browserFindBar')?.classList.add('hidden');
  if (tabId) window.api.browserCommand(tabId, 'find-stop').catch(() => {});
  if (focusPage && tabId === player.browserActiveTabId) browserCommand('focus').catch(() => {});
  scheduleBrowserBounds();
}
function openBrowserFind() {
  if (player.workspaceMode !== 'browser' || !player.browserActiveTabId) return;
  browserPageFind.tabId = player.browserActiveTabId;
  $('browserFindBar').classList.remove('hidden');
  $('browserFindInput').focus();
  $('browserFindInput').select();
  scheduleBrowserBounds();
  runBrowserFind();
}
async function runBrowserFind(next = false, forward = true) {
  clearTimeout(browserPageFind.timer);
  const tabId = browserPageFind.tabId;
  if (!tabId || tabId !== player.browserActiveTabId) return;
  const token = ++browserPageFind.token;
  const text = $('browserFindInput').value;
  $('browserFindCount').textContent = text ? 'Aranıyor…' : 'Metin girin';
  try {
    const result = await browserCommand('find', { text, token, next, forward }, tabId);
    if (token !== browserPageFind.token || tabId !== browserPageFind.tabId) return;
    if (!result?.ok) $('browserFindCount').textContent = result?.error || 'Arama yapılamadı';
  } catch (_) {
    if (token === browserPageFind.token && tabId === browserPageFind.tabId) $('browserFindCount').textContent = 'Arama yapılamadı';
  }
}
function receiveBrowserFindEvent(event) {
  if (event.tabId !== player.browserActiveTabId) return;
  if (event.type === 'find-open') { openBrowserFind(); return; }
  if (event.type === 'find-reset') { closeBrowserFind(false); return; }
  if (event.token !== browserPageFind.token || event.tabId !== browserPageFind.tabId) return;
  const matches = Math.max(0, Number(event.matches) || 0);
  $('browserFindCount').textContent = matches ? `${Math.max(0, Number(event.activeMatch) || 0)} / ${matches}` : 'Eşleşme yok';
}
if ($('browserFindInput')) {
  $('browserFindInput').addEventListener('input', event => {
    clearTimeout(browserPageFind.timer);
    browserPageFind.token++; // Önceki sorgunun geciken sonucu debounce sırasında da eskidir.
    if (!event.isComposing) browserPageFind.timer = setTimeout(() => runBrowserFind(), 180);
  });
  $('browserFindInput').addEventListener('compositionend', () => runBrowserFind());
  $('browserFindBar').addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Enter' && event.target === $('browserFindInput')) { event.preventDefault(); event.stopPropagation(); runBrowserFind(true, !event.shiftKey); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeBrowserFind(); }
  });
  $('browserFindNext').addEventListener('click', () => runBrowserFind(true));
  $('browserFindPrevious').addEventListener('click', () => runBrowserFind(true, false));
  $('browserFindClose').addEventListener('click', () => closeBrowserFind());
}

function browserCommand(command, value, tabId = player.browserActiveTabId) {
  if (['play', 'pause', 'play-pause', 'seek', 'seek-relative'].includes(command)) {
    clearTimeout(player.shadowResumeTimer);
    player.shadowResumeTimer = null;
  }
  return window.api.browserCommand(tabId, command, value);
}

function navigateBrowser(url, tabId = player.browserActiveTabId) {
  return window.api.navigateBrowser(tabId, url);
}

function browserTabLabel(tab) {
  let label = '';
  if (tab && tab.title) label = tab.title;
  else try { label = new URL(tab && tab.url || '').hostname; } catch (_) { label = 'Yeni sekme'; }
  return label.length > 80 ? `${label.slice(0, 77)}…` : label;
}

function browserCloseIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm6 6 12 12M18 6 6 18');
  svg.appendChild(path);
  return svg;
}

function browserPinIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Zm4 11v7');
  svg.appendChild(path);
  return svg;
}

function renderBrowserTabs() {
  const strip = $('browserTabStrip');
  if (!strip) return;
  const focusedTabId = document.activeElement?.dataset?.browserTabActivate || '';
  strip.replaceChildren();
  let activeButton = null;
  for (const tab of player.browserTabs) {
    const item = document.createElement('div');
    item.className = `browser-tab${tab.id === player.browserActiveTabId ? ' active' : ''}${tab.loading ? ' loading' : ''}${tab.pinned ? ' pinned' : ''}`;
    item.dataset.browserTabId = tab.id;
    item.setAttribute('role', 'presentation');
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'browser-tab-open';
    open.dataset.browserTabActivate = tab.id;
    open.setAttribute('role', 'tab');
    open.setAttribute('aria-selected', tab.id === player.browserActiveTabId ? 'true' : 'false');
    open.setAttribute('aria-busy', tab.loading ? 'true' : 'false');
    open.tabIndex = tab.id === player.browserActiveTabId ? 0 : -1;
    open.textContent = browserTabLabel(tab);
    open.title = [tab.title, tab.url].filter(Boolean).join('\n') || 'Yeni sekme';
    const audio = document.createElement('button');
    audio.type = 'button'; audio.className = 'browser-tab-audio'; audio.dataset.browserTabMute = tab.id;
    audio.textContent = tab.tabMuted ? '×' : '♪'; audio.hidden = !tab.audible && !tab.tabMuted;
    audio.title = tab.tabMuted ? 'Sekmenin sesini aç' : 'Sekmeyi sessize al';
    audio.setAttribute('aria-label', audio.title); audio.setAttribute('aria-pressed', tab.tabMuted ? 'true' : 'false');
    const pin = document.createElement('button');
    pin.type = 'button'; pin.className = 'browser-tab-pin'; pin.dataset.browserTabPin = tab.id;
    pin.appendChild(browserPinIcon()); pin.title = tab.pinned ? 'Sekmenin sabitlemesini kaldır' : 'Sekmeyi sabitle';
    pin.setAttribute('aria-label', pin.title); pin.setAttribute('aria-pressed', tab.pinned ? 'true' : 'false');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'browser-tab-close';
    close.dataset.browserTabClose = tab.id;
    close.disabled = player.browserClosingTabs.has(tab.id) || !!tab.pinned;
    close.setAttribute('aria-busy', close.disabled ? 'true' : 'false');
    close.appendChild(browserCloseIcon()); close.title = tab.pinned ? 'Kapatmak için önce sabitlemeyi kaldır' : 'Sekmeyi kapat'; close.setAttribute('aria-label', close.title);
    item.append(open, audio, pin, close);
    strip.appendChild(item);
    if (tab.id === player.browserActiveTabId) activeButton = open;
  }
  const focusButton = focusedTabId
    ? [...strip.querySelectorAll('[data-browser-tab-activate]')]
      .find((button) => button.dataset.browserTabActivate === focusedTabId)
    : null;
  if (focusButton) focusButton.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    if (activeButton?.isConnected) activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  updateBrowserNewTabAvailability();
}

const MAX_BROWSER_TABS = Math.max(1, Number(window.api.browserLimits?.maxTabs) || 24);
function updateBrowserNewTabAvailability() {
  const button = $('browserTabNew');
  if (!button) return;
  const limitReached = player.browserTabs.length >= MAX_BROWSER_TABS;
  button.disabled = player.browserTabCreateBusy || limitReached;
  button.title = limitReached
    ? `En fazla ${MAX_BROWSER_TABS} sekme açılabilir; önce bir sekmeyi kapatın.`
    : (player.browserTabCreateBusy ? 'Yeni sekme açılıyor…' : 'Yeni sekme');
}

function updateBrowserTabPresentation(tab) {
  const strip = $('browserTabStrip');
  if (!strip || !tab) return;
  const item = [...strip.querySelectorAll('[data-browser-tab-id]')]
    .find((candidate) => candidate.dataset.browserTabId === tab.id);
  const open = item?.querySelector('[data-browser-tab-activate]');
  if (!item || !open) {
    renderBrowserTabs();
    return;
  }
  const label = browserTabLabel(tab);
  if (open.textContent !== label) open.textContent = label;
  open.title = [tab.title, tab.url].filter(Boolean).join('\n') || 'Yeni sekme';
  item.classList.toggle('loading', !!tab.loading);
  open.setAttribute('aria-busy', tab.loading ? 'true' : 'false');
  const audio = item.querySelector('[data-browser-tab-mute]');
  if (audio) {
    audio.hidden = !tab.audible && !tab.tabMuted; audio.textContent = tab.tabMuted ? '×' : '♪';
    audio.title = tab.tabMuted ? 'Sekmenin sesini aç' : 'Sekmeyi sessize al';
    audio.setAttribute('aria-label', audio.title); audio.setAttribute('aria-pressed', tab.tabMuted ? 'true' : 'false');
  }
  item.classList.toggle('pinned', !!tab.pinned);
  const pin = item.querySelector('[data-browser-tab-pin]');
  if (pin) {
    pin.title = tab.pinned ? 'Sekmenin sabitlemesini kaldır' : 'Sekmeyi sabitle';
    pin.setAttribute('aria-label', pin.title);
    pin.setAttribute('aria-pressed', tab.pinned ? 'true' : 'false');
  }
  const close = item.querySelector('[data-browser-tab-close]');
  if (close) {
    close.disabled = player.browserClosingTabs.has(tab.id) || !!tab.pinned;
    close.title = tab.pinned ? 'Kapatmak için önce sabitlemeyi kaldır' : 'Sekmeyi kapat';
    close.setAttribute('aria-label', close.title);
  }
}

async function activateBrowserTab(tabId) {
  if (!tabId || tabId === player.browserActiveTabId) return browserTabState(tabId);
  await flushWatchState(false, true);
  saveActiveBrowserTabWorkspace();
  const result = await window.api.activateBrowserTab(tabId).catch(() => null);
  if (!result || !result.ok) {
    setBrowserSignal(`Sekme açılamadı: ${(result && result.error) || 'bilinmeyen hata'}`, false);
    return null;
  }
  syncBrowserTabs(result.tabs, result.activeTabId);
  const tab = browserTabState();
  restoreActiveBrowserTabWorkspace(tab);
  if (typeof result.captureEnabled === 'boolean') setBrowserCaptureEnabled(result.captureEnabled, false);
  if (result.diagnostics) renderBrowserDiagnostics(result.diagnostics);
  updateBrowserNavigation({ ...tab, ...result }, { preserveWorkspace: true });
  scheduleBrowserBounds();
  scheduleBrowserOverlaySync();
  return tab;
}

async function createBrowserTab() {
  if (player.browserTabCreateBusy) return null;
  if (player.browserTabs.length >= MAX_BROWSER_TABS) {
    setBrowserSignal(`En fazla ${MAX_BROWSER_TABS} tarayıcı sekmesi açılabilir. Önce bir sekmeyi kapatın.`, false);
    updateBrowserNewTabAvailability();
    return null;
  }
  player.browserTabCreateBusy = true;
  updateBrowserNewTabAvailability();
  let result;
  try {
    await flushWatchState(false, true);
    saveActiveBrowserTabWorkspace();
    result = await window.api.createBrowserTab().catch(() => null);
  } finally {
    player.browserTabCreateBusy = false;
    updateBrowserNewTabAvailability();
  }
  if (!result || !result.ok) {
    setBrowserSignal(`Yeni sekme açılamadı: ${(result && result.error) || 'bilinmeyen hata'}`, false);
    return null;
  }
  syncBrowserTabs(result.tabs, result.activeTabId);
  const tab = browserTabState();
  restoreActiveBrowserTabWorkspace(tab);
  updateBrowserNavigation({ ...tab, ...result }, { preserveWorkspace: true });
  const createdTabId = tab?.id || '';
  setTimeout(() => {
    if (player.workspaceMode === 'browser' && createdTabId === player.browserActiveTabId) {
      $('browserAddress')?.focus();
    }
  }, 0);
  scheduleBrowserBounds();
  return tab;
}

async function closeBrowserTab(tabId) {
  if (!tabId || player.browserClosingTabs.has(tabId)) return;
  player.browserClosingTabs.add(tabId);
  const closeButton = $('browserTabStrip')?.querySelector(`[data-browser-tab-close="${CSS.escape(tabId)}"]`);
  if (closeButton) {
    closeButton.disabled = true;
    closeButton.setAttribute('aria-busy', 'true');
  }
  const wasActive = tabId === player.browserActiveTabId;
  try {
    if (wasActive) {
      await flushWatchState(false, true);
      saveActiveBrowserTabWorkspace();
    }
    let result = await window.api.closeBrowserTab(tabId, false).catch(() => null);
    if (result?.requiresConfirmation) {
      const reasons = [result.pinned ? 'Sekme sabitlenmiş.' : '', result.activeWork ? 'Sekmede devam eden çeviri veya manga işi var.' : '']
        .filter(Boolean).join(' ');
      const confirmed = await openAppDialog({
        title: 'Sekme korumalı',
        description: `${reasons} Kapatırsanız devam eden iş ve sayfadaki geçici durum kaybolabilir.`,
        confirmLabel: 'Yine de kapat',
      });
      if (!confirmed) return;
      result = await window.api.closeBrowserTab(tabId, true).catch(() => null);
    }
    if (result && result.canceled) return;
    if (!result || !result.ok) {
      setBrowserSignal(`Sekme kapatılamadı: ${(result && result.error) || 'bilinmeyen hata'}`, false);
      return;
    }
    player.browserTabEventGate.close(tabId);
    syncBrowserTabs(result.tabs, result.activeTabId);
    if (wasActive) {
      const tab = browserTabState();
      restoreActiveBrowserTabWorkspace(tab);
      updateBrowserNavigation({ ...tab, ...result }, { preserveWorkspace: true });
      scheduleBrowserOverlaySync();
    }
    scheduleBrowserBounds();
  } finally {
    player.browserClosingTabs.delete(tabId);
    const currentButton = $('browserTabStrip')?.querySelector(`[data-browser-tab-close="${CSS.escape(tabId)}"]`);
    if (currentButton) {
      currentButton.disabled = !!browserTabState(tabId)?.pinned;
      currentButton.setAttribute('aria-busy', 'false');
    }
  }
}

async function activateBrowserTabAndFocus(tabId) {
  const activated = await activateBrowserTab(tabId);
  if (!activated || activated.id !== tabId || player.browserActiveTabId !== tabId) return;
  const tab = [...($('browserTabStrip')?.querySelectorAll('[role="tab"]') || [])]
    .find((item) => item.dataset.browserTabActivate === tabId);
  tab?.focus();
}

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
    if (bounds && window.api.setBrowserBounds) {
      window.api.setBrowserBounds(player.browserActiveTabId, bounds).catch(() => {});
    }
  });
}

function bindBrowserBoundsObserver() {
  const slot = $('browserViewSlot');
  if (!slot || typeof ResizeObserver !== 'function') return;
  if (player.browserBoundsObserver) player.browserBoundsObserver.disconnect();
  player.browserBoundsObserver = new ResizeObserver(() => scheduleBrowserBounds());
  player.browserBoundsObserver.observe(slot);
}

function setBrowserSignal(text, detected = false, options = {}) {
  const message = String(text || '').trim();
  if (!message) return false;
  const now = Date.now();
  const priority = Math.max(0, Number(options.priority) || 10);
  const history = player.browserSignalHistory || (player.browserSignalHistory = []);
  if (history[history.length - 1]?.text !== message) {
    history.push({ text: message, at: now, priority });
    if (history.length > 8) history.splice(0, history.length - 8);
  }
  const prior = player.browserSignalState;
  const blocked = !options.force && prior && prior.until > now && priority < prior.priority;
  const historyElement = $('browserSignalHistory');
  if (historyElement) {
    const previous = history.slice(-3, -1).map((item) => item.text);
    historyElement.textContent = previous.join(' · ');
    historyElement.title = history.slice(0, -1).map((item) => item.text).join('\n');
  }
  if (blocked) return false;
  player.browserSignalState = {
    text: message, priority,
    until: now + Math.max(0, Number(options.holdMs) || 0),
  };
  if ($('browserSignalText')) $('browserSignalText').textContent = message;
  $('browserSignal')?.classList.toggle('detected', detected);
  const action = $('browserSignalTranslateAction');
  if (action) action.classList.toggle('hidden', options.action !== 'translate');
  return true;
}

function updateBrowserMangaButton() {
  const button = $('browserMangaTranslate');
  const label = $('browserMangaLabel');
  if (!button || !label) return;
  let state = 'idle';
  let text = 'Manga';
  let title = 'Sayfadaki manga ve webtoon görsellerini Türkçeye çevir';
  if (player.browserMangaBusy) {
    state = 'running';
    text = player.browserMangaTotal
      ? `${player.browserMangaTranslated} çevrildi` : 'Taranıyor';
    title = 'Manga çevirisini durdur';
  } else if (player.browserMangaError) {
    state = 'error'; text = 'Manga hata'; title = `${player.browserMangaError} · Yeniden denemek için tıkla`;
  } else if (player.browserMangaTotal > 0 && player.browserMangaTranslated === 0) {
    state = 'empty'; text = 'Metin yok'; title = 'Görseller tarandı ancak çevrilecek metin bulunamadı · Yeniden denemek için tıkla';
  } else if (player.browserMangaTranslated > 0 && player.browserMangaVisible) {
    state = 'ready'; text = 'Manga açık'; title = 'Gizle · Shift+tık: yeniden tara · Ctrl+tık: seçili bölgeyi yeniden çevir';
  } else if (player.browserMangaTranslated > 0) {
    state = 'hidden'; text = 'Manga kapalı'; title = 'Göster · Shift+tık: yeniden tara · Ctrl+tık: seçili bölgeyi yeniden çevir';
  }
  button.dataset.state = state;
  button.setAttribute('aria-pressed', state === 'ready' || state === 'running' ? 'true' : 'false');
  button.setAttribute('aria-label', title);
  button.title = title;
  label.textContent = text;
}

function applyBrowserMangaState(event = {}) {
  player.browserMangaBusy = event.state === 'running';
  if (event.state === 'error') {
    player.browserMangaError = String(event.message || event.error || 'Manga çevirisi başarısız oldu.');
    player.browserMangaAutoUrl = '';
  }
  else if (['running', 'ready', 'idle', 'empty'].includes(event.state)) player.browserMangaError = '';
  if (event.translated !== undefined) player.browserMangaTranslated = Math.max(0, Number(event.translated) || 0);
  if (event.visible !== undefined) player.browserMangaVisible = !!event.visible;
  else if (event.state === 'ready') player.browserMangaVisible = player.browserMangaTranslated > 0;
  else if (event.state === 'idle' || event.state === 'error' || event.state === 'empty') player.browserMangaVisible = false;
  player.browserMangaCompleted = Math.max(0, Number(event.completed) || 0);
  player.browserMangaTotal = Math.max(0, Number(event.total) || 0);
  player.browserMangaFailed = Math.max(0, Number(event.failed) || 0);
  player.browserMangaEmpty = Math.max(0, Number(event.empty) || 0);
  if (event.retryable !== undefined) player.browserMangaRetryable = Math.max(0, Number(event.retryable) || 0);
  else if (event.state === 'idle') player.browserMangaRetryable = 0;
  const tab = browserTabState();
  if (tab) Object.assign(tab, {
    browserMangaBusy: player.browserMangaBusy,
    browserMangaTranslated: player.browserMangaTranslated,
    browserMangaVisible: player.browserMangaVisible,
    browserMangaCompleted: player.browserMangaCompleted,
    browserMangaTotal: player.browserMangaTotal,
    browserMangaFailed: player.browserMangaFailed,
    browserMangaEmpty: player.browserMangaEmpty,
    browserMangaRetryable: player.browserMangaRetryable,
    browserMangaError: player.browserMangaError,
  });
  updateBrowserMangaButton();
  const retry = $('browserMangaRetryFailed');
  if (retry) {
    retry.disabled = player.browserMangaBusy || player.browserMangaRetryable < 1;
    retry.textContent = player.browserMangaRetryable > 0
      ? `Başarısızları yeniden dene (${player.browserMangaRetryable})` : 'Başarısızları yeniden dene';
  }
  if ($('browserMangaSummary')) {
    $('browserMangaSummary').textContent = player.browserMangaTotal
      ? `Toplam ${player.browserMangaTotal} · çevrilen ${player.browserMangaTranslated} · metinsiz ${player.browserMangaEmpty} · hatalı ${player.browserMangaFailed} · yeniden denenebilir ${player.browserMangaRetryable}`
      : 'Henüz manga işi çalıştırılmadı.';
  }
  if (event.message) setBrowserSignal(event.message, event.state === 'ready' && !event.error,
    { priority: event.state === 'error' ? 90 : 30, holdMs: event.state === 'error' ? 6000 : 1200 });
  else if (event.state === 'running') {
    setBrowserSignal(`Manga görselleri işlendi: ${player.browserMangaCompleted}/${player.browserMangaTotal} · çevrilen ${player.browserMangaTranslated} · atlanan ${player.browserMangaFailed + player.browserMangaEmpty}`, true,
      { priority: 25 });
  }
}

async function handleBrowserMangaAction(clickEvent) {
  if (!player.browserPageUrl || !player.browserActiveTabId) {
    setBrowserSignal('Manga çevirmek için önce bir okuma sayfası açın.', false);
    return;
  }
  if (player.browserMangaBusy) {
    const stopped = await window.api.clearBrowserManga?.(player.browserActiveTabId).catch(() => null);
    if (!stopped?.ok) setBrowserSignal(stopped?.error || 'Manga çevirisi durdurulamadı.', false);
    return;
  }
  if (player.browserMangaTranslated > 0 && (clickEvent?.ctrlKey || clickEvent?.metaKey)) {
    await saveAppSettings();
    const retried = await window.api.retrySelectedBrowserManga?.(player.browserActiveTabId)
      .catch((error) => ({ ok: false, error: error.message }));
    if (!retried?.ok) setBrowserSignal(retried?.error || 'Seçili manga bölgesi yeniden çevrilemedi.', false);
    return;
  }
  if (player.browserMangaTranslated > 0 && clickEvent?.shiftKey) {
    const cleared = await window.api.clearBrowserManga?.(player.browserActiveTabId).catch(() => null);
    if (!cleared?.ok) {
      setBrowserSignal(cleared?.error || 'Manga katmanı temizlenemedi.', false);
      return;
    }
    applyBrowserMangaState({ state: 'idle', translated: 0, visible: false });
  } else if (player.browserMangaTranslated > 0) {
    const result = await window.api.toggleBrowserManga?.(
      player.browserActiveTabId, !player.browserMangaVisible).catch(() => null);
    if (!result?.ok) {
      if (result?.stale) applyBrowserMangaState({ state: 'idle', translated: 0, visible: false });
      setBrowserSignal(result?.error || 'Manga katmanı değiştirilemedi.', false);
      return;
    }
    applyBrowserMangaState({ state: 'ready', translated: result.translated, visible: result.visible });
    return;
  }
  // Yeni girilen ayrı manga anahtarı/modeli blur-save yarışına takılmadan
  // ana sürecin okuyacağı ayar dosyasına ulaşsın.
  await saveAppSettings();
  applyBrowserMangaState({ state: 'running', completed: 0, total: 0, translated: 0 });
  const result = await window.api.startBrowserManga?.(player.browserActiveTabId, {
    targetLanguage: $('browserMangaTarget')?.value || $('translateTo')?.value || 'tr',
    maxImages: Number($('browserMangaMaxImages')?.value) || 48,
    workers: Number($('browserMangaWorkers')?.value) || 2,
    fontScale: (Number($('browserMangaFontScale')?.value) || 100) / 100,
    fontFamily: $('browserMangaFont')?.value || 'comic',
    verticalText: !!$('browserMangaVertical')?.checked,
    sfxStyle: $('browserMangaSfx')?.checked !== false,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok && !result?.canceled) {
    logLine(`Manga çevirisi: ${result?.error || 'bilinmeyen hata'}`, 'error');
    applyBrowserMangaState({ state: 'error', translated: 0, visible: false,
      message: result?.error || 'Manga görselleri çevrilemedi.' });
  }
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
  if (persist) {
    try { localStorage.setItem('playerBrowserSignalVisible', player.browserSignalVisible ? 'true' : 'false'); } catch (_) {}
  }
  scheduleBrowserBounds();
}

function setBrowserCaptureEnabled(enabled, persist = true) {
  player.browserCaptureEnabled = !!enabled;
  const tab = browserTabState();
  if (tab) tab.captureEnabled = player.browserCaptureEnabled;
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
    setBrowserDownloadsOpen(false);
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
  return window.BrowserPlaceUrl.safePlaceUrl(raw);
}

function browserPlaceList() {
  const places = player.browserPlaces || { history: [], bookmarks: [] };
  const query = String($('browserPlacesSearch')?.value || '').trim().toLocaleLowerCase('tr');
  const folder = $('browserPlacesFolder')?.value || '';
  return (Array.isArray(places[player.browserPlaceTab]) ? places[player.browserPlaceTab] : []).filter(item => {
    if (folder && item.folder !== folder) return false;
    return !query || `${browserPlaceTitle(item)} ${item.url} ${item.folder || ''}`.toLocaleLowerCase('tr').includes(query);
  });
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
  const folderSelect = $('browserPlacesFolder');
  if (folderSelect) {
    const selected = folderSelect.value;
    const folders = [...new Set((places.bookmarks || []).map(item => item.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    folderSelect.replaceChildren(new Option('Tüm klasörler', ''), ...folders.map(folder => new Option(folder, folder)));
    folderSelect.value = folders.includes(selected) ? selected : '';
    folderSelect.classList.toggle('hidden', player.browserPlaceTab !== 'bookmarks');
  }
  const workspaceSelect = $('browserWorkspaceSelect');
  if (workspaceSelect) {
    const selected = workspaceSelect.value;
    const workspaces = places.workspaces || [];
    workspaceSelect.replaceChildren(new Option(workspaces.length ? 'Bir çalışma alanı seçin' : 'Henüz kayıt yok', ''),
      ...workspaces.map(item => new Option(`${item.name} · ${item.tabs.length} sekme`, item.name)));
    workspaceSelect.value = workspaces.some(item => item.name === selected) ? selected : '';
  }
  document.querySelectorAll('[data-place-tab]').forEach((tab) => {
    const active = tab.dataset.placeTab === player.browserPlaceTab;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
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
    remove.appendChild(browserCloseIcon());
    if (player.browserPlaceTab === 'bookmarks') {
      const folder = document.createElement('button');
      folder.type = 'button'; folder.className = 'browser-place-folder'; folder.dataset.placeFolder = item.url;
      folder.title = item.folder ? `Klasör: ${item.folder}` : 'Klasöre taşı'; folder.textContent = item.folder || 'Klasör';
      row.append(open, folder, remove);
    } else row.append(open, remove);
    list.appendChild(row);
  });
}

async function loadBrowserPlaces() {
  if (!window.api.listBrowserPlaces) return;
  const seq = ++player.browserPlacesSeq;
  const result = await window.api.listBrowserPlaces().catch(() => null);
  if (seq === player.browserPlacesSeq && result && result.ok && result.places) {
    if (result.warning && result.warning !== player.browserPlacesLoadWarning) logLine(result.warning, 'warn');
    player.browserPlacesLoadWarning = result.warning || '';
    player.browserPlaces = result.places;
    renderBrowserPlaces();
  }
}

function setBrowserPlacesOpen(open) {
  const panel = $('browserPlacesPanel');
  if (!panel) return;
  if (open) setBrowserDownloadsOpen(false);
  panel.classList.toggle('hidden', !open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  syncBrowserOcclusion();
  $('browserPlacesToggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    loadBrowserPlaces(); renderBrowserPlaces();
    requestAnimationFrame(() => $('browserPlacesSearch')?.focus({ preventScroll: true }));
  } else if (panel.contains(document.activeElement)) {
    $('browserPlacesToggle')?.focus({ preventScroll: true });
  }
}

const browserDownloadState = { revision: -1, items: [], active: 0, message: '', rows: new Map() };

function browserDownloadBytes(value) {
  if (!(value > 0)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** power).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${units[power]}`;
}

function receiveBrowserDownloads(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.revision < browserDownloadState.revision) return;
  Object.assign(browserDownloadState, snapshot);
  const badge = $('browserDownloadsBadge');
  if (badge) { badge.textContent = snapshot.active || ''; badge.classList.toggle('hidden', !snapshot.active); }
  const title = snapshot.active ? `Tarayıcı indirmeleri (${snapshot.active} sürüyor)` : 'Tarayıcı indirmeleri';
  $('browserDownloadsToggle')?.setAttribute('aria-label', title);
  $('browserDownloadsToggle')?.setAttribute('title', title);
  if (!$('browserDownloadsPanel')?.classList.contains('hidden')) renderBrowserDownloads();
}

function renderBrowserDownloads() {
  const list = $('browserDownloadsList'), status = $('browserDownloadsStatus');
  if (!list || !status) return;
  status.textContent = browserDownloadState.message || (browserDownloadState.active
    ? `${browserDownloadState.active} indirme sürüyor.` : browserDownloadState.items.length
      ? 'Devam eden indirme yok.' : 'Henüz indirme yok. Bir web sayfasındaki indirme bağlantısını kullanın.');
  const ids = new Set(browserDownloadState.items.map(item => item.id));
  for (const [id, row] of browserDownloadState.rows) {
    if (!ids.has(id)) { row.root.remove(); browserDownloadState.rows.delete(id); }
  }
  for (const item of [...browserDownloadState.items].reverse()) {
    let row = browserDownloadState.rows.get(item.id);
    if (!row) {
      const root = document.createElement('article'); root.className = 'browser-download-row';
      const name = document.createElement('h4'); name.className = 'browser-download-name'; name.dir = 'auto';
      const info = document.createElement('p'); info.className = 'browser-download-note';
      const progress = document.createElement('progress'); progress.max = 100; progress.setAttribute('aria-label', 'İndirme ilerlemesi');
      const saved = document.createElement('span'); saved.className = 'browser-download-path'; saved.dir = 'auto';
      const actions = document.createElement('div'); actions.className = 'browser-download-actions';
      const buttons = {};
      for (const [command, label] of [['cancel', 'İptal et'], ['resume', 'Devam et'], ['reveal', 'Klasörde göster']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost btn-sm'; button.textContent = label;
        button.addEventListener('click', async () => {
          button.disabled = true;
          const result = await window.api.browserDownloads(command, item.id).catch(() => ({ ok: false, error: 'İndirme işlemi gerçekleştirilemedi.' }));
          button.disabled = false;
          if (!result?.ok) status.textContent = result?.error || 'İşlem gerçekleştirilemedi.';
        });
        actions.appendChild(button); buttons[command] = button;
      }
      root.append(name, info, progress, saved, actions); list.prepend(root);
      row = { root, name, info, progress, saved, buttons }; browserDownloadState.rows.set(item.id, row);
    }
    row.name.textContent = item.filename;
    const label = item.state === 'completed' ? 'Tamamlandı' : item.state === 'cancelled' ? 'İptal edildi'
      : item.state === 'interrupted' ? (item.active ? 'Bağlantı kesildi' : 'İndirme başarısız') : 'İndiriliyor';
    row.info.textContent = `${label} · ${browserDownloadBytes(item.received)}${item.total ? ` / ${browserDownloadBytes(item.total)}` : ' (toplam boyut bilinmiyor)'}`;
    row.progress.hidden = !item.active;
    if (item.total > 0) row.progress.value = Math.min(100, item.received / item.total * 100);
    else row.progress.removeAttribute('value');
    row.saved.textContent = item.path || 'Kaydetme konumu henüz seçilmedi.';
    row.buttons.cancel.classList.toggle('hidden', !item.active);
    row.buttons.resume.classList.toggle('hidden', !item.canResume);
    row.buttons.reveal.classList.toggle('hidden', item.state !== 'completed' || !item.path);
  }
}

function setBrowserDownloadsOpen(open) {
  const panel = $('browserDownloadsPanel');
  if (!panel) return;
  if (open) setBrowserPlacesOpen(false);
  panel.classList.toggle('hidden', !open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  $('browserDownloadsToggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  syncBrowserOcclusion();
  if (open) {
    renderBrowserDownloads();
    $('browserDownloadsClose')?.focus({ preventScroll: true });
    window.api.browserDownloads('list').then(result => {
      if (result?.ok) receiveBrowserDownloads(result.downloads);
    }).catch(() => { $('browserDownloadsStatus').textContent = 'İndirme listesi alınamadı.'; });
  } else if (panel.contains(document.activeElement)) $('browserDownloadsToggle')?.focus({ preventScroll: true });
}

$('browserDownloadsToggle')?.addEventListener('click', () => setBrowserDownloadsOpen($('browserDownloadsPanel').classList.contains('hidden')));
$('browserDownloadsClose')?.addEventListener('click', () => setBrowserDownloadsOpen(false));
$('browserDownloadsPanel')?.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setBrowserDownloadsOpen(false); }
});

function renderBrowserDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return;
  player.browserDiagnostics = diagnostics;
  const tab = browserTabState();
  if (tab) tab.diagnostics = diagnostics;
  const adapter = diagnostics.adapter || {};
  if ($('browserDiagnosticsService')) $('browserDiagnosticsService').textContent = adapter.label || 'Genel web videosu';
  if ($('browserDiagnosticsHelp')) $('browserDiagnosticsHelp').textContent = adapter.help
    || 'Videoyu başlatın ve varsa sitenin kendi altyazısını açın.';
  const counts = diagnostics.counts || {};
  const attempts = Number(counts.cdp || 0) + Number(counts.page || 0) + Number(counts.textTrack || 0);
  if ($('browserDiagnosticsSummary')) $('browserDiagnosticsSummary').textContent = attempts
    ? `${Number(counts.parsed || 0)} işlendi · ${Number(counts.rejected || 0)} elendi · ${Number(counts.errors || 0)} hata`
    : 'Henüz ağ izi yok';
  renderBrowserAcquisition(diagnostics.acquisition);
  renderBrowserCapabilityMatrix(diagnostics.capabilityMatrix);
  const pluginStatus = diagnostics.adapterPlugins || {};
  if ($('browserAdapterPluginStatus')) {
    const loaded = Array.isArray(pluginStatus.loaded) ? pluginStatus.loaded.length : 0;
    const errors = Array.isArray(pluginStatus.errors) ? pluginStatus.errors.length : 0;
    $('browserAdapterPluginStatus').textContent = loaded
      ? `${loaded} kullanıcı adaptörü yüklendi${errors ? ` · ${errors} hata` : ''}`
      : errors ? `${errors} adaptör yüklenemedi` : 'Kullanıcı adaptörü yok';
    $('browserAdapterPluginStatus').title = (pluginStatus.errors || []).join('\n');
  }
  if ($('browserAdapterPluginErrors')) {
    const errors = Array.isArray(pluginStatus.errors) ? pluginStatus.errors.filter(Boolean).slice(0, 4) : [];
    $('browserAdapterPluginErrors').textContent = errors.join('\n');
    $('browserAdapterPluginErrors').classList.toggle('hidden', errors.length === 0);
  }
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

function renderBrowserCapabilityMatrix(matrix) {
  const body = $('browserCapabilityRows');
  if (!body) return;
  body.replaceChildren();
  const statusLabels = { verified: 'Doğrulandı', partial: 'Kısmi', unverified: 'Doğrulanmadı' };
  const yesNo = (value) => value ? 'Var' : 'Yok';
  for (const entry of Array.isArray(matrix) ? matrix : []) {
    const row = document.createElement('tr');
    const values = [
      entry.label || entry.service || 'Servis',
      yesNo(entry.captionDetection), yesNo(entry.dualTrack), yesNo(entry.overlay),
      yesNo(entry.fullscreen), yesNo(entry.translation),
      `${statusLabels[entry.verificationStatus] || 'Doğrulanmadı'}${entry.verifiedAt ? ` · ${entry.verifiedAt}` : ''}`,
    ];
    values.forEach((value, index) => {
      const cell = document.createElement(index ? 'td' : 'th');
      if (!index) cell.scope = 'row';
      cell.textContent = value;
      row.appendChild(cell);
    });
    body.appendChild(row);
  }
  if (!body.children.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = 'Henüz servis tanımı yok.';
    row.appendChild(cell);
    body.appendChild(row);
  }
}

function renderBrowserAcquisition(acquisition) {
  const list = $('browserAcquisitionStages');
  const summary = $('browserAcquisitionSummary');
  if (!list || !summary) return;
  list.replaceChildren();
  const stages = Array.isArray(acquisition && acquisition.stages) ? acquisition.stages : [];
  const labels = {
    waiting: 'Sırada', running: 'Aranıyor', success: 'Bulundu', failed: 'Bulunamadı',
    skipped: 'Atlandı', blocked: 'Onay gerekiyor',
  };
  if (!stages.length) {
    summary.textContent = 'Kaynak bekleniyor';
    return;
  }
  const winner = stages.find((stage) => stage.status === 'success');
  const running = stages.find((stage) => stage.status === 'running');
  summary.textContent = winner ? `${winner.label} bulundu`
    : running ? `${running.label} aranıyor`
      : acquisition.needsConsent && acquisition.needsConsent.length ? 'Ek yöntemler onay bekliyor' : 'Kaynak bekleniyor';
  for (const stage of stages) {
    const item = document.createElement('li');
    item.className = 'browser-acquisition-stage';
    item.dataset.status = stage.status || 'waiting';
    if (stage.status === 'running') item.setAttribute('aria-current', 'step');
    const name = document.createElement('span');
    name.className = 'browser-acquisition-name';
    name.textContent = stage.label || 'Altyazı kaynağı';
    const status = document.createElement('span');
    status.className = 'browser-acquisition-status';
    status.textContent = labels[stage.status] || labels.waiting;
    if (stage.reason) item.title = stage.reason;
    item.append(name, status);
    list.appendChild(item);
  }
}

function clearBrowserTracks(message) {
  clearDeferredBrowserTrackAction();
  if (player.browserTranslationTrackId && window.api.stopBrowserTranslation) {
    window.api.stopBrowserTranslation(player.browserActiveTabId).catch(() => {});
  }
  player.browserPrepareSeq += 1;
  player.browserTranslatePreparing = false;
  Object.values(player.browserTrackRefreshTimers).forEach((timer) => clearTimeout(timer));
  player.browserTrackRefreshTimers = {};
  player.browserLoadedTrackId = '';
  player.browserLoadedTrackId2 = '';
  player.browserTranslationTrackId = '';
  player.browserLiveTranslations = new Map();
  player.browserTracks = [];
  player.cues = [];
  player.cues2 = [];
  player.subPath = '';
  player.sub2Path = '';
  player.subRaw = '';
  player.activeIdx = -1;
  player.activeIdx2 = -1;
  const select = $('browserTrackSelect');
  if (select) select.innerHTML = '';
  const select2 = $('browserTrackSelect2');
  if (select2) select2.innerHTML = '<option value="">İkinci iz yok</option>';
  $('browserTrackActions')?.classList.add('hidden');
  updateBrowserTranslationExportButton();
  syncSubtitleModeUi();
  setBrowserSignal(message || 'Sayfadaki video ve altyazı izleri burada algılanır.', false);
}

async function toggleBrowserTabPinned(tabId) {
  const tab = browserTabState(tabId);
  if (!tab || !window.api.setBrowserTabPinned) return;
  const result = await window.api.setBrowserTabPinned(tabId, !tab.pinned).catch(() => null);
  if (!result?.ok) {
    setBrowserSignal(`Sekme sabitlenemedi: ${result?.error || 'bilinmeyen hata'}`, false);
    return;
  }
  syncBrowserTabs(result.tabs, result.activeTabId);
  setBrowserSignal(result.pinned ? 'Sekme sabitlendi; yanlışlıkla kapatmaya karşı korundu.' : 'Sekme sabitlemesi kaldırıldı.', true);
}

function clearDeferredBrowserTrackAction() {
  if (player.browserDeferredTrackTimer) clearTimeout(player.browserDeferredTrackTimer);
  player.browserDeferredTrackTimer = null;
  player.browserDeferredTrackAction = null;
}

function scheduleDeferredBrowserTrackAction() {
  if (player.browserDeferredTrackTimer || !player.browserDeferredTrackAction) return;
  player.browserDeferredTrackTimer = setTimeout(async () => {
    player.browserDeferredTrackTimer = null;
    const pending = player.browserDeferredTrackAction;
    if (!pending) return;
    const trackExists = player.browserTracks.some((track) => track.id === pending.trackId);
    if (pending.tabId !== player.browserActiveTabId || !trackExists) {
      clearDeferredBrowserTrackAction();
      return;
    }
    if (state.running || state.queueRunning || player.browserTranslatePreparing) {
      scheduleDeferredBrowserTrackAction();
      return;
    }
    player.browserDeferredTrackAction = null;
    await useBrowserTrack(pending.translate, pending.trackId);
  }, 750);
}

function renderBrowserTracks(selectedId) {
  const select = $('browserTrackSelect');
  const select2 = $('browserTrackSelect2');
  const actions = $('browserTrackActions');
  if (!select || !select2 || !actions) return;
  const previous = selectedId || select.value;
  const previous2 = select2.value;
  // Yakalanan web izleri yalnızca tarayıcı şeridinde değil, oynatıcı ayar
  // panelindeki genel altyazı seçimlerinde de kullanılabilmeli.
  for (const track of player.browserTracks) {
    if (!track?.path) continue;
    const role = track.role === 'translation' ? 'Çeviri' : 'Web';
    addSubtitleOption(track.path, `${role} · ${track.language || track.label || 'altyazı'}`);
  }
  const syncOptions = (target, includeEmpty) => {
    const validIds = new Set(player.browserTracks.map((track) => String(track.id)));
    for (const option of [...target.options]) {
      if (includeEmpty && option.value === '') continue;
      if (!validIds.has(option.value)) option.remove();
    }
    if (includeEmpty && !target.querySelector('option[value=""]')) {
      const empty = document.createElement('option');
      empty.value = ''; empty.textContent = 'İkinci iz yok';
      target.prepend(empty);
    }
    for (const track of player.browserTracks) {
      let option = [...target.options].find((item) => item.value === String(track.id));
      if (!option) {
        option = document.createElement('option');
        option.value = track.id;
      }
      const roleLabel = track.role === 'translation' ? 'Çeviri · ' : '';
      const label = `${roleLabel}${track.language ? track.language.toUpperCase() + ' · ' : ''}${track.label} · ${track.cueCount} satır`;
      if (option.textContent !== label) option.textContent = label;
      target.appendChild(option);
    }
  };
  syncOptions(select, false);
  syncOptions(select2, true);
  if (player.browserTracks.some((track) => track.id === previous)) select.value = previous;
  if (player.browserTracks.some((track) => track.id === previous2)) select2.value = previous2;
  actions.classList.toggle('hidden', player.browserTracks.length === 0);
  if (player.browserTracks.length) {
    const chosen = player.browserTracks.find((track) => track.id === select.value) || player.browserTracks[0];
    setBrowserSignal(`Altyazı bulundu${chosen.language ? ` (${chosen.language})` : ''}. Çevrilsin mi?`, true,
      { priority: 45, holdMs: 4000, action: 'translate' });
  }
}

async function loadPersistedBrowserTranslation(track) {
  const tab = browserTabState();
  if (!tab || !track?.path || track.role !== 'translation' || tab.persistedTranslationLoading) return;
  if (player.browserLoadedTrackId === track.id && player.cues.length) return;
  const tabId = tab.id;
  tab.persistedTranslationLoading = true;
  try {
    addSubtitleOption(track.path, `Çeviri · ${track.language || track.label}`);
    if ($('playerSubSelect')) $('playerSubSelect').value = track.path;
    await loadSubtitle(track.path, false, { silent: true, preserveInspector: true });
    if (player.browserActiveTabId !== tabId || player.subPath !== track.path) return;
    player.browserLoadedTrackId = track.id;
    player.browserLoadedTrackId2 = '';
    if ($('browserTrackSelect2')) $('browserTrackSelect2').value = '';
    // Kalıcı çeviri birincil kanala yüklense de rolünü kaybetmemeli; aksi
    // halde ayarlardaki "Yalnızca çeviri" seçeneği devre dışı kalır.
    player.browserTranslationTrackId = track.id;
    player.browserLiveTranslations = new Map();
    player.cues2 = [];
    tab.browserLoadedTrackId = track.id;
    tab.browserLoadedTrackId2 = '';
    tab.browserTranslationTrackId = track.id;
    player.browserLiveTranslations = browserTranslationMapFromCues(player.cues);
    tab.browserLiveTranslations = [...player.browserLiveTranslations.values()];
    tab.cues = player.cues.slice();
    tab.cues2 = [];
    tab.subPath = player.subPath;
    tab.sub2Path = '';
    tab.subtitles = player.subtitles.map((item) => ({ ...item }));
    tab.subOrigins = { ...player.subOrigins };
    setSubtitleMode('translation', false);
    updateSubtitleChips();
    updateBrowserTranslationExportButton();
    renderBrowserTracks(track.id);
    scheduleBrowserOverlaySync();
    renderTranscript();
    setBrowserSignal(`${track.language ? track.language.toUpperCase() + ' ' : ''}çevirisi bulundu ve ana altyazı olarak yüklendi.`, true,
      { priority: 70, holdMs: 5000 });
  } finally {
    const current = browserTabState(tabId);
    if (current) current.persistedTranslationLoading = false;
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

async function useBrowserTrack(translate, requestedTrackId = '') {
  let track = requestedTrackId
    ? player.browserTracks.find((item) => item.id === requestedTrackId)
    : browserTrackSelection();
  if (!track) return;
  if (translate && track.role === 'translation') {
    await loadPersistedBrowserTranslation(track);
    return;
  }
  if (state.running || state.queueRunning || player.browserTranslatePreparing) {
    player.browserDeferredTrackAction = {
      tabId: player.browserActiveTabId,
      trackId: track.id,
      translate: !!translate,
    };
    scheduleDeferredBrowserTrackAction();
    setBrowserSignal('Başka bir iş çalışıyor; bu iş bitince altyazı otomatik yüklenecek.', true);
    logLine('Tarayıcı altyazısı beklemeye alındı — çalışan iş bitince otomatik devam edecek.', 'info');
    return;
  }
  clearDeferredBrowserTrackAction();
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
  const sourceLanguage = browserTrackSourceLanguage(track);
  setBrowserSignal(translate
    ? `Altyazı yüklendi; ${sourceLanguage ? sourceLanguage.toUpperCase() + ' · ' : ''}oynatma kafasının ilerisi çevriliyor…`
    : 'Altyazı çalışma alanına yüklendi.', true);
  if (translate) await startBrowserLiveTranslation(track, sourceLanguage);
}

async function completeSelectedBrowserTranslation() {
  const selected = browserTrackSelection(false);
  // Devam eden aynı izin scheduler'ını yeniden kurmak hazır sonuç Map'ini
  // sıfırlıyor ve bazı cümleleri API'ye ikinci kez gönderiyordu. Yalnız yeni
  // bir iz seçildiyse çeviri oturumunu başlat.
  if (!selected || player.browserTranslationTrackId !== selected.id) {
    await useBrowserTrack(true);
  }
  if (!player.browserTranslationTrackId) return;
  const result = await window.api.completeBrowserTranslation?.(player.browserActiveTabId).catch(() => null);
  if (!result?.ok) {
    setBrowserSignal(result?.error || 'Tüm iz çeviri kuyruğuna alınamadı.', false);
    return;
  }
  setBrowserSignal(`${Number(result.remaining || 0)} cümle arka planda tamamlanacak; oynatma çevresi öncelikli kalacak.`, true);
}

async function startBrowserLiveTranslation(track, sourceLanguage = '') {
  if (!window.api.startBrowserTranslation || !track || !player.cues.length) return;
  player.browserTranslationTrackId = track.id;
  player.browserLiveTranslations = new Map();
  player.cues2 = [];
  updateBrowserTranslationExportButton();
  syncSubtitleModeUi();
  const result = await window.api.startBrowserTranslation(player.browserActiveTabId, {
    trackId: track.id,
    cues: player.cues.map((cue, index) => ({
      id: cue.id ?? index, start: cue.start, end: cue.end, text: cue.text,
    })),
    targetLanguage: $('translateTo')?.value || 'tr',
    sourceLanguage,
    register: $('translateRegister')?.value || 'documentary',
    profanity: $('translateProfanity')?.value || 'medium',
    completeTrack: true,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (!result || !result.ok) {
    player.browserTranslationTrackId = '';
    updateBrowserTranslationExportButton();
    syncSubtitleModeUi();
    setBrowserSignal(`Canlı çeviri başlatılamadı: ${result?.error || 'bilinmeyen hata'}`, false);
    return;
  }
  setSubtitleMode('both', false);
  setBrowserSignal(`${result.sentenceCount} cümlenin tamamı kuyruğa alındı; oynatma çevresi öncelikli hazırlanıyor.`, true);
}

function browserTranslationCueKey(cue) {
  const raw = cue?.cueId ?? cue?.id ?? `${cue?.start}:${cue?.end}`;
  return String(raw).replace(/^web-tr-/, '');
}

function browserTranslationMapFromCues(cues) {
  const map = new Map();
  for (const cue of Array.isArray(cues) ? cues : []) {
    const text = String(cue?.text || '').trim();
    if (!text) continue;
    const key = browserTranslationCueKey(cue);
    map.set(key, { ...cue, id: cue.id || `web-tr-${key}`, text });
  }
  return map;
}

function mergeBrowserTranslationCues(target, cues) {
  for (const cue of Array.isArray(cues) ? cues : []) {
    const text = String(cue?.text || '').trim();
    if (!text) continue;
    const key = browserTranslationCueKey(cue);
    target.set(key, {
      id: `web-tr-${key}`, start: Number(cue.start) || 0,
      end: Number(cue.end) || Number(cue.start) || 0, text,
    });
  }
  return target;
}

async function restoreBrowserTranslationSnapshot(tab) {
  if (!tab?.id || !tab.browserTranslationTrackId || !window.api.getBrowserTranslationSnapshot) return;
  const tabId = tab.id;
  const result = await window.api.getBrowserTranslationSnapshot(tabId).catch(() => null);
  const current = browserTabState(tabId);
  if (!result?.ok || !current || player.browserActiveTabId !== tabId
      || result.trackId !== current.browserTranslationTrackId
      || Number(result.generation) < Number(current.generation || 0)) return;
  const translated = mergeBrowserTranslationCues(
    new Map((current.browserLiveTranslations || []).map((cue) => [browserTranslationCueKey(cue), cue])),
    result.results);
  if (Array.isArray(result.sourceCues) && result.sourceCues.length) {
    player.cues = result.sourceCues.map((cue, index) => ({
      id: cue.id ?? index, start: Number(cue.start) || 0,
      end: Number(cue.end) || Number(cue.start) || 0, text: String(cue.text || ''),
    }));
    current.cues = player.cues.slice();
    if (!current.browserLoadedTrackId) current.browserLoadedTrackId = result.trackId;
    if (!player.browserLoadedTrackId) player.browserLoadedTrackId = result.trackId;
  }
  current.browserLiveTranslations = [...translated.values()];
  player.browserTranslationTrackId = result.trackId;
  player.browserLiveTranslations = translated;
  player.cues2 = [...translated.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  updateBrowserTranslationExportButton();
  syncSubtitleModeUi();
  if (result.state?.total && Number(result.state.completed) >= Number(result.state.total)) {
    setSubtitleMode('translation', false);
  }
  scheduleBrowserOverlaySync();
  if (player.workspaceMode === 'browser') {
    renderTranscript();
    renderBrowserCueAt(player.browserTime, player.browserTime, player.browserPaused);
  }
}

function applyBrowserTranslationResult(event) {
  if (!event.result || event.trackId !== player.browserTranslationTrackId) return;
  if (event.result.error) {
    logLine(`Canlı web çevirisi: ${event.result.error}`, 'warn');
    return;
  }
  mergeBrowserTranslationCues(player.browserLiveTranslations, event.result.cues);
  player.cues2 = [...player.browserLiveTranslations.values()]
    .filter((cue) => cue.text).sort((a, b) => a.start - b.start || a.end - b.end);
  updateBrowserTranslationExportButton();
  syncSubtitleModeUi();
  const tab = browserTabState();
  if (tab) {
    tab.browserTranslationTrackId = player.browserTranslationTrackId;
    tab.browserLiveTranslations = [...player.browserLiveTranslations.values()];
  }
  scheduleBrowserOverlaySync();
  if (player.workspaceMode === 'browser') renderBrowserCueAt(player.browserTime, player.browserTime, player.browserPaused);
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

function updateBrowserTranslationExportButton() {
  const button = $('browserTranslationExport');
  if (!button) return;
  const count = player.browserLiveTranslations?.size || player.cues2.length || 0;
  button.disabled = count === 0;
  button.title = count
    ? `${count} çevrilmiş altyazı satırını dışa aktar`
    : 'Çeviri satırları hazır olduğunda kullanılabilir';
}

async function exportBrowserTranslation() {
  const liveCues = [...(player.browserLiveTranslations?.values?.() || [])];
  const cues = (liveCues.length ? liveCues : player.cues2)
    .filter((cue) => String(cue.text || '').trim())
    .sort((a, b) => Number(a.start) - Number(b.start) || Number(a.end) - Number(b.end));
  if (!cues.length) {
    setBrowserSignal('Dışa aktarılacak canlı çeviri henüz hazır değil.', false);
    return;
  }
  const format = $('browserExportFormat')?.value === 'vtt' ? 'vtt' : 'srt';
  const language = $('translateTo')?.value || 'tr';
  const result = await window.api.exportBrowserSubtitle({
    cues, title: `${player.browserPageTitle || 'web-altyazi'}-${language}-ceviri`, format,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (result?.ok) setBrowserSignal(`Çeviri dışa aktarıldı: ${result.path}`, true);
  else if (!result?.canceled) setBrowserSignal(`Çeviri dışa aktarılamadı: ${result?.error || 'bilinmeyen hata'}`, false);
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
  try {
    await window.api.copyText(cuesToSrt(cues));
    setBrowserSignal(`${cues.length} altyazı satırı A-B aralığıyla panoya kopyalandı.`, true);
  } catch (error) {
    setBrowserSignal(`Panoya kopyalanamadı: ${error.message}`, false);
  }
}

function queueCurrentBrowserPage() {
  const tab = browserTabState();
  const protectedServices = new Set(['netflix', 'disney', 'max', 'discovery', 'hulu', 'prime-video']);
  if (!player.browserPageUrl) {
    setBrowserSignal('Kuyruğa eklemek için önce bir video sayfası açın.', false);
    return;
  }
  if (protectedServices.has(tab?.service || '')) {
    setBrowserSignal('Bu DRM korumalı servis indirme/transkripsiyon kuyruğuna eklenemez; yakalanan altyazıyı dışa aktarabilirsiniz.', false);
    return;
  }
  addToQueue('youtube', player.browserPageUrl);
  setBrowserSignal('Açık sayfa mevcut ayarlarla transkripsiyon kuyruğuna eklendi.', true);
}

async function exportBrowserAbClip() {
  if (player.abA === null || player.abB === null || player.abB <= player.abA) {
    setBrowserSignal('Klip için önce A-B aralığı belirleyin.', false);
    return;
  }
  const result = await window.api.exportBrowserClip({
    url: player.browserPageUrl, title: player.browserPageTitle || 'web-klip',
    start: player.abA, end: player.abB,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (result?.type === 'clip' || result?.ok) {
    setBrowserSignal('A-B klibi dışa aktarıldı.', true);
    const clipPath = result.path || result.data?.path;
    if (clipPath) logLine(`Klip hazır: ${clipPath}`, 'success');
  } else if (!result?.canceled) {
    setBrowserSignal(`Klip oluşturulamadı: ${result?.error || result?.message || 'bilinmeyen hata'}`, false);
  }
}

function updateBrowserLiveAsrButton(message = '') {
  const button = $('browserLiveAsr');
  if (!button) return;
  button.setAttribute('aria-pressed', player.browserLiveAsrActive ? 'true' : 'false');
  button.textContent = player.browserLiveAsrActive ? 'Canlı Whisper’ı durdur' : 'Canlı Whisper';
  if (message) button.title = message;
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function syncBrowserLiveAsrClock() {
  const capture = player.browserLiveAsrCapture;
  if (!capture?.node || capture.stopping) return;
  capture.node.port.postMessage({ type: 'sync', time: Number(player.browserTime) || 0,
    contextTime: capture.context.currentTime, paused: !!player.browserPaused, rate: player.browserRate || 1 });
}

async function startBrowserLiveAsrCapture(stream, tabId, sessionId) {
  const context = new AudioContext({ sampleRate: 16000 });
  const capture = { context, tabId, sessionId, pending: new Set(), stopping: false };
  player.browserLiveAsrCapture = capture;
  await context.audioWorklet.addModule('live-asr-worklet.js');
  if (player.browserLiveAsrCapture !== capture || !player.browserLiveAsrActive) { await context.close(); return; }
  capture.node = new AudioWorkletNode(context, 'whisper-pcm-capture');
  capture.source = context.createMediaStreamSource(stream);
  capture.node.port.onmessage = ({ data }) => {
    if (data.type === 'flushed') { capture.resolveFlush?.(); return; }
    if (data.type !== 'chunk' || player.browserLiveAsrCapture !== capture) return;
    if (capture.pending.size >= 8) {
      setBrowserSignal('Canlı Whisper kuyruğu doldu; ses parçası atlandı. Daha küçük bir model seçin.', false);
      return;
    }
    const task = (async () => {
      const base64 = await blobToBase64(new Blob([data.pcm]));
      const result = await window.api.sendBrowserLiveAsrChunk(tabId,
        { base64, offset: data.offset, rate: data.rate, format: 'pcm16', sessionId }).catch((error) => ({ ok: false, error: error.message }));
      if (!result?.ok) setBrowserSignal(`Canlı Whisper: ${result?.error || 'Ses gönderilemedi.'}`, false);
    })();
    capture.pending.add(task);
    task.finally(() => capture.pending.delete(task));
  };
  capture.node.onprocessorerror = () => stopBrowserLiveAsrCapture(true, 'Ses işleyicisi durdu; canlı Whisper yeniden başlatılmalı.');
  for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => {
    if (player.browserLiveAsrCapture === capture && !capture.stopping) stopBrowserLiveAsrCapture(true, 'Sistem sesi akışı sona erdi.');
  }, { once: true });
  capture.source.connect(capture.node);
  // The worklet writes no output: connecting keeps capture alive without echo.
  capture.node.connect(context.destination);
  syncBrowserLiveAsrClock();
  await context.resume();
}

async function stopBrowserLiveAsrCapture(notifyMain = true, message = 'Canlı Whisper durduruldu.') {
  player.browserLiveAsrActive = false;
  const capture = player.browserLiveAsrCapture;
  if (capture) {
    if (capture.stopping) return;
    capture.stopping = true;
    if (capture.node) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 750);
        capture.resolveFlush = () => { clearTimeout(timeout); resolve(); };
        capture.node.port.postMessage({ type: 'flush' });
      });
      await Promise.allSettled([...capture.pending]);
      capture.node.disconnect(); capture.node.port.close();
    }
    capture.source?.disconnect();
    await capture.context.close().catch(() => null);
    if (player.browserLiveAsrCapture === capture) player.browserLiveAsrCapture = null;
  }
  for (const track of player.browserLiveAsrStream?.getTracks() || []) track.stop();
  player.browserLiveAsrStream = null;
  if (notifyMain) await window.api.stopBrowserLiveAsr?.().catch(() => null);
  updateBrowserLiveAsrButton(message);
  setBrowserSignal(message, false);
}

async function toggleBrowserLiveAsr() {
  if (player.browserLiveAsrStarting || player.browserLiveAsrCapture?.stopping) return;
  if (player.browserLiveAsrActive) return stopBrowserLiveAsrCapture(true);
  const accepted = await openAppDialog({
    title: 'Sistem sesini canlı yazıya çevir',
    description: 'Bu özellik yalnız bu oturumda sistem sesini yakalar ve seçili yerel Whisper modeline gönderir. Mikrofon kullanılmaz; durdurduğunuzda yakalama kapanır.',
    confirmLabel: 'Sistem sesini başlat', intent: 'primary',
  });
  if (!accepted) return;
  player.browserLiveAsrStarting = true;
  const tabId = player.browserActiveTabId;
  const started = await window.api.startBrowserLiveAsr(tabId, {
    language: $('language')?.value || '', model: $('model')?.value || 'small',
  }).catch((error) => ({ ok: false, error: error.message }));
  if (!started?.ok) {
    player.browserLiveAsrStarting = false;
    setBrowserSignal(`Canlı Whisper başlatılamadı: ${started?.error || 'bilinmeyen hata'}`, false);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (tabId !== player.browserActiveTabId) { for (const track of stream.getTracks()) track.stop(); throw new Error('Aktif sekme değişti.'); }
    for (const track of stream.getVideoTracks()) track.stop();
    if (!stream.getAudioTracks().length) throw new Error('Sistem sesi paylaşılmadı.');
    player.browserLiveAsrStream = stream;
    player.browserLiveAsrActive = true;
    updateBrowserLiveAsrButton('Sistem sesi yakalanıyor; durdurmak için tıklayın.');
    setBrowserSignal(`Canlı Whisper başlatıldı · ${started.model}; ilk cümle bekleniyor…`, true);
    await startBrowserLiveAsrCapture(stream, tabId, started.sessionId);
  } catch (error) {
    await stopBrowserLiveAsrCapture(true);
    setBrowserSignal(`Sistem sesi başlatılamadı: ${error.message}`, false);
  } finally { player.browserLiveAsrStarting = false; }
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
      if (player.browserTranslationTrackId === latest.id) {
        await startBrowserLiveTranslation(latest, browserTrackSourceLanguage(latest));
      }
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

function browserPrimaryIsTranslation() {
  if (player.workspaceMode !== 'browser' || player.cues2.length) return false;
  const id = player.browserTranslationTrackId;
  return !!id && player.browserLoadedTrackId === id
    && player.browserTracks.some((track) => track.id === id && track.role === 'translation');
}

function scheduleBrowserOverlaySync() {
  clearTimeout(player.browserOverlayTimer);
  if (player.workspaceMode !== 'browser' || !window.api.setBrowserOverlay) return;
  player.browserOverlayTimer = setTimeout(() => {
    player.browserOverlayTimer = null;
    window.api.setBrowserOverlay(player.browserActiveTabId, {
      source: (browserPrimaryIsTranslation() ? [] : player.cues)
        .map((cue) => ({ start: cue.start, end: cue.end, text: cue.text })),
      translation: (browserPrimaryIsTranslation() ? player.cues : player.cues2)
        .map((cue) => ({ start: cue.start, end: cue.end, text: cue.text })),
      mode: browserSubtitleMode(),
      offset: player.offset,
      style: {
        scale: (Number($('browserOverlayScale')?.value) || 100) / 100,
        opacity: (Number($('browserOverlayOpacity')?.value) || 100) / 100,
        bottomOffset: Number($('browserOverlayBottom')?.value) || 0,
        width: Number($('browserOverlayWidth')?.value) || 86,
        maxLines: Number($('browserOverlayMaxLines')?.value) || 3,
        sourceFirst: $('browserOverlaySourceFirst')?.checked !== false,
        hideSiteCaptions: !!$('browserHideSiteCaptions')?.checked,
      },
    }).catch(() => {});
  }, 120);
}

function setBrowserLoadingState(loading, updateTab = true) {
  const active = !!loading;
  const reload = $('browserReload');
  if (reload) {
    reload.classList.toggle('loading', active);
    reload.setAttribute('aria-busy', active ? 'true' : 'false');
    reload.title = active ? 'Yüklemeyi durdur' : 'Yenile';
    reload.setAttribute('aria-label', reload.title);
  }
  if (updateTab) {
    const tab = browserTabState();
    if (tab) {
      tab.loading = active;
      updateBrowserTabPresentation(tab);
    }
  }
}

function updateBrowserNavigation(data, options = {}) {
  if (!data) return;
  if (data.tabId && (data.tabId !== player.browserActiveTabId || !player.browserTabEventGate.accept(data))) return false;
  const tab = browserTabState();
  const previousMediaId = tab?.mediaId || '';
  const nextMediaId = data.mediaId !== undefined ? (data.mediaId || '') : previousMediaId;
  const nextMediaKey = nextMediaId
    ? `browser:${nextMediaId}`
    : `browser:${browserPlaceKey(data.url) || data.url || ''}`;
  const pageChanged = !!data.url && data.url !== player.browserPageUrl;
  // Aynı video içindeki hash/query/pushState geçişleri yalnız adresi günceller;
  // altyazı çalışma alanını ancak kararlı medya kimliği değiştiğinde sıfırla.
  const mediaChanged = pageChanged && (!previousMediaId || !nextMediaId || previousMediaId !== nextMediaId);
  if (tab) {
    tab.generation = Math.max(Number(tab.generation) || 0, Number(data.generation) || 0);
    if (data.url !== undefined) tab.url = data.url || '';
    if (data.title !== undefined) tab.title = data.title || '';
    if (data.loading !== undefined) tab.loading = !!data.loading;
    if (data.canGoBack !== undefined) tab.canGoBack = !!data.canGoBack;
    if (data.canGoForward !== undefined) tab.canGoForward = !!data.canGoForward;
    if (data.mediaId !== undefined) tab.mediaId = data.mediaId || '';
    if (data.service !== undefined) tab.service = data.service || '';
  }
  const address = $('browserAddress');
  if (data.url && document.activeElement !== address) address.value = data.url;
  if ($('browserBack')) $('browserBack').disabled = !data.canGoBack;
  if ($('browserForward')) $('browserForward').disabled = !data.canGoForward;
  setBrowserLoadingState(!!data.loading, false);
  const securityMark = $('browserSecurityMark');
  if (securityMark) {
    const secure = /^https:/i.test(data.url || '');
    const securityText = secure ? 'Güvenli HTTPS bağlantısı'
      : (data.url ? 'Şifrelenmemiş HTTP bağlantısı' : 'Adres bekleniyor');
    securityMark.classList.toggle('secure', secure);
    securityMark.title = securityText;
    securityMark.setAttribute('aria-label', securityText);
  }
  $('browserEmpty')?.classList.toggle('hidden', !!data.url);
  if (!options.preserveWorkspace && mediaChanged) {
    // Anahtar degisimi eski kaydi diske yazar. Yeni URL'yi once state'e
    // koyarsak onceki sayfanin konumu yeni sayfanin basligi altinda kalir.
    setMediaKey(nextMediaKey);
    player.browserPageTitle = data.title || '';
    player.browserTime = 0;
    player.browserDuration = 0;
    player.browserRate = 1;
    player.browserVolume = 1;
    player.browserMuted = false;
    player.browserProfileKey = '';
    player.browserPositionTick = 0;
    applyBrowserMangaState({ state: 'idle', translated: 0, visible: false });
    clearBrowserTracks(data.loading ? 'Sayfa açılıyor; altyazı izi bekleniyor…' : 'Video başlatıldığında altyazı izi aranacak.');
    scheduleBrowserOverlaySync();
  }
  if (data.loading) {
    if (tab) { tab.error = ''; tab.errorKind = ''; tab.errorCode = ''; tab.errorUrl = ''; }
    showBrowserErrorSurface(null);
  }
  if (pageChanged) {
    player.browserPageUrl = data.url;
    try { localStorage.setItem('playerBrowserLastUrl', data.url); } catch (_) {}
    loadBrowserPlaces();
  }
  if (data.title) player.browserPageTitle = data.title;
  if (tab) {
    tab.url = player.browserPageUrl || data.url || '';
    tab.title = player.browserPageTitle || data.title || '';
  }
  if (tab) updateBrowserTabPresentation(tab);
  updateBrowserBookmarkButton();
  if (player.workspaceMode === 'browser') {
    $('playerTitle').textContent = player.browserPageTitle || 'Tarayıcı';
    $('playerMeta').textContent = data.loading ? 'Sayfa yükleniyor' : 'Web videosu · altyazı algılama açık';
  }
  if (data.loading === false && data.url && $('browserMangaAuto')?.checked
      && player.browserMangaAutoUrl !== data.url && !player.browserMangaBusy) {
    clearTimeout(player.browserMangaAutoTimer);
    const expectedUrl = data.url;
    player.browserMangaAutoTimer = setTimeout(() => {
      player.browserMangaAutoTimer = null;
      if (player.browserPageUrl !== expectedUrl || !$('browserMangaAuto')?.checked || player.browserMangaBusy) return;
      player.browserMangaAutoUrl = expectedUrl;
      handleBrowserMangaAction().catch(() => {});
    }, 1300);
  }
  return true;
}

function renderBrowserCueAt(time, previousTime, paused = player.browserPaused) {
  const t = Number(time || 0) - player.offset;
  const previous = Number(previousTime);
  applyPlaybackLearningPolicy(time, previousTime, paused, true);
  if (player.abA !== null && player.abB !== null && Number(time) >= player.abB
      && (!Number.isFinite(previous) || previous < player.abB)) {
    player.browserTime = player.abA;
    browserCommand('seek', player.abA).catch(() => {});
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
        browserCommand('pause').catch(() => {});
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
  const workspaceSeq = ++player.browserWorkspaceSeq;
  const stillCurrent = () => workspaceSeq === player.browserWorkspaceSeq && player.workspaceMode === 'browser';
  const previousActive = player.browserActiveTabId;
  const result = await window.api.showBrowser(player.browserActiveTabId, bounds).catch(() => null);
  if (!stillCurrent()) {
    if (player.workspaceMode !== 'browser') window.api.hideBrowser?.().catch(() => {});
    return;
  }
  if (!result || !result.ok) {
    setBrowserSignal((result && result.error) || 'Tarayıcı alanı açılamadı.', false);
    return;
  }
  if (result.tabs) syncBrowserTabs(result.tabs, result.activeTabId);
  if ($('browserSessionRestore') && typeof result.restoreEnabled === 'boolean') {
    $('browserSessionRestore').checked = result.restoreEnabled;
  }
  if (!previousActive && player.browserActiveTabId) restoreActiveBrowserTabWorkspace(browserTabState());
  if (window.api.setBrowserCaptureEnabled && typeof result.captureEnabled === 'boolean'
      && result.captureEnabled !== player.browserCaptureEnabled) {
    const captureResult = await window.api.setBrowserCaptureEnabled(
      player.browserActiveTabId, player.browserCaptureEnabled).catch(() => null);
    if (!stillCurrent()) return;
    if (captureResult && typeof captureResult.enabled === 'boolean') result.captureEnabled = captureResult.enabled;
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
    setTimeout(() => {
      if (stillCurrent()) $('browserAddress')?.focus();
    }, 0);
  }
}

function setWorkspaceMode(mode, persist = true) {
  mode = mode === 'browser' ? 'browser' : 'player';
  const previousMode = player.workspaceMode;
  if (mode !== previousMode) player.browserWorkspaceSeq += 1;
  if (mode !== previousMode) {
    closeBrowserFind(false);
    setBrowserDownloadsOpen(false);
    player.abA = null;
    player.abB = null;
    $('abLoopBtn')?.classList.remove('active');
    renderAbMarkers();
    if (_liveCueRenderTimer) {
      clearTimeout(_liveCueRenderTimer);
      _liveCueRenderTimer = null;
    }
  }
  if (mode !== player.workspaceMode) flushWatchState(false, true);
  if (mode === 'browser' && previousMode !== 'browser') saveLocalSubtitleWorkspace();
  if (mode !== 'browser' && previousMode === 'browser') saveActiveBrowserTabWorkspace();
  if (mode === 'browser' && player.viewMode === 'cinema') setViewMode(player.lastSideMode || 'reading');
  if (mode !== 'browser' && player.settingsPage !== 'source') setSettingsPage('source');
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
    playerButton.tabIndex = mode === 'player' ? 0 : -1;
  }
  if (browserButton) {
    browserButton.classList.toggle('active', mode === 'browser');
    browserButton.setAttribute('aria-selected', mode === 'browser' ? 'true' : 'false');
    browserButton.tabIndex = mode === 'browser' ? 0 : -1;
  }
  if ($('makeSubsBtn')) {
    $('makeSubsBtn').disabled = mode === 'browser';
    $('makeSubsBtn').title = mode === 'browser'
      ? 'Tarayıcı modunda sayfanın mevcut altyazısı algılanir; Whisper için videoyu normal oynatıcıda açın.'
      : 'Bu video için altyazı oluştur';
  }
  if ($('shotBtn')) {
    $('shotBtn').disabled = false;
    $('shotBtn').title = mode === 'browser' ? 'Tarayıcı sayfasının ekran görüntüsünü al (S)' : 'Ekran görüntüsü al (S)';
  }
  if (mode === 'browser') {
    $('playerVideo')?.pause();
    $('playerTitle').textContent = player.browserPageTitle || 'Tarayıcı';
    $('playerMeta').textContent = 'Web videosu · altyazı algılama açık';
    requestAnimationFrame(() => showBrowserWorkspace());
    scheduleBrowserOverlaySync();
  } else {
    if (window.api.hideBrowser) window.api.hideBrowser().catch(() => {});
    if (previousMode === 'browser') restoreLocalSubtitleWorkspace();
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
  const navigateSeq = ++player.browserNavigateSeq;
  const tabId = player.browserActiveTabId;
  setBrowserSignal('Sayfa açılıyor; altyazı izi bekleniyor…', false);
  setBrowserLoadingState(true);
  let result;
  try {
    result = await navigateBrowser(value, tabId);
  } catch (error) {
    result = { ok: false, error: error && error.message ? error.message : 'Tarayıcı isteği tamamlanamadı.' };
  }
  if (navigateSeq !== player.browserNavigateSeq || tabId !== player.browserActiveTabId) return result || null;
  // Eski loadURL isteğinin iptali, açılmış yeni belgeyi başarısız yapmaz.
  // Yükleme durumunu güncel navigation olayları belirlesin.
  if (result?.aborted) return result;
  if (!result || !result.ok) {
    setBrowserSignal(`Sayfa açılamadı: ${(result && result.error) || 'bilinmeyen hata'}`, false);
    if (player.workspaceMode === 'browser') $('playerMeta').textContent = 'Sayfa yüklenemedi';
    setBrowserLoadingState(false);
    return result || null;
  }
  updateBrowserNavigation(result);
  return result;
}

if ($('workspacePlayerMode')) $('workspacePlayerMode').addEventListener('click', () => setWorkspaceMode('player'));
if ($('workspaceBrowserMode')) $('workspaceBrowserMode').addEventListener('click', () => setWorkspaceMode('browser'));
if ($('browserTabNew')) $('browserTabNew').addEventListener('click', createBrowserTab);
if ($('browserTabStrip')) $('browserTabStrip').addEventListener('click', async (event) => {
  const pin = event.target.closest('[data-browser-tab-pin]');
  if (pin) { await toggleBrowserTabPinned(pin.dataset.browserTabPin); return; }
  const mute = event.target.closest('[data-browser-tab-mute]');
  if (mute) {
    const tabId = mute.dataset.browserTabMute;
    const result = window.api.muteBrowserTab
      ? await window.api.muteBrowserTab(tabId).catch(() => null) : null;
    const tab = browserTabState(tabId);
    if (result?.ok && tab) { Object.assign(tab, result); updateBrowserTabPresentation(tab); }
    else if (tab) setBrowserSignal(`Sekme sesi değiştirilemedi: ${result?.error || 'bilinmeyen hata'}`, false);
    return;
  }
  const close = event.target.closest('[data-browser-tab-close]');
  if (close) { closeBrowserTab(close.dataset.browserTabClose); return; }
  const open = event.target.closest('[data-browser-tab-activate]');
  if (open) activateBrowserTabAndFocus(open.dataset.browserTabActivate);
});
if ($('browserTabStrip')) $('browserTabStrip').addEventListener('auxclick', (event) => {
  if (event.button !== 1) return;
  const item = event.target.closest('[data-browser-tab-id]');
  if (!item) return;
  event.preventDefault();
  closeBrowserTab(item.dataset.browserTabId);
});
if ($('browserTabStrip')) $('browserTabStrip').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...$('browserTabStrip').querySelectorAll('[role="tab"]')];
  if (!tabs.length) return;
  const current = Math.max(0, tabs.indexOf(document.activeElement));
  let next = current;
  if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  event.preventDefault();
  activateBrowserTabAndFocus(tabs[next].dataset.browserTabActivate);
});
if ($('browserGo')) $('browserGo').addEventListener('click', navigateBrowserFromAddress);
if ($('browserMangaTranslate')) $('browserMangaTranslate').addEventListener('click', handleBrowserMangaAction);
setInterval(async () => {
  if (document.hidden || player.workspaceMode !== 'browser' || !$('browserMangaAuto')?.checked
      || player.browserMangaBusy || player.browserMangaLookaheadBusy || player.browserMangaTranslated <= 0
      || !player.browserMangaVisible) return;
  player.browserMangaLookaheadBusy = true;
  try {
    await window.api.startBrowserManga?.(player.browserActiveTabId, {
      incremental: true, targetLanguage: $('browserMangaTarget')?.value || 'tr',
      maxImages: Number($('browserMangaMaxImages')?.value) || 48,
      workers: Number($('browserMangaWorkers')?.value) || 2,
      fontScale: (Number($('browserMangaFontScale')?.value) || 100) / 100,
      fontFamily: $('browserMangaFont')?.value || 'comic',
      verticalText: !!$('browserMangaVertical')?.checked, sfxStyle: $('browserMangaSfx')?.checked !== false,
    });
  } finally { player.browserMangaLookaheadBusy = false; }
}, 5000);
const browserRangeOutputs = {
  browserMangaWorkers: ['browserMangaWorkersVal', (value) => String(value)],
  browserMangaFontScale: ['browserMangaFontScaleVal', (value) => `%${value}`],
  browserOverlayScale: ['browserOverlayScaleVal', (value) => `%${value}`],
  browserOverlayOpacity: ['browserOverlayOpacityVal', (value) => `%${value}`],
  browserOverlayBottom: ['browserOverlayBottomVal', (value) => `%${value}`],
  browserOverlayWidth: ['browserOverlayWidthVal', (value) => `%${value}`],
};
for (const [id, [outputId, format]] of Object.entries(browserRangeOutputs)) {
  const control = $(id);
  if (!control) continue;
  const refresh = () => { if ($(outputId)) $(outputId).textContent = format(control.value); };
  control.addEventListener('input', () => { refresh(); if (id.startsWith('browserOverlay')) scheduleBrowserOverlaySync(); });
  refresh();
}
for (const id of ['browserOverlayMaxLines', 'browserOverlaySourceFirst', 'browserHideSiteCaptions']) {
  $(id)?.addEventListener('change', scheduleBrowserOverlaySync);
}
$('browserMangaRetryFailed')?.addEventListener('click', async () => {
  const result = await window.api.retryFailedBrowserManga?.(player.browserActiveTabId)
    .catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok && !result?.canceled) setBrowserSignal(result?.error || 'Başarısız manga sayfaları yeniden denenemedi.', false);
});
for (const [id, format] of [['browserMangaExportJson', 'json'], ['browserMangaExportImage', 'png']]) {
  $(id)?.addEventListener('click', async () => {
    const result = await window.api.exportBrowserManga?.(player.browserActiveTabId, format)
      .catch((error) => ({ ok: false, error: error.message }));
    if (result?.ok) logLine(`Manga ${format === 'json' ? 'verisi' : 'görseli'} kaydedildi: ${result.path}`, 'success');
    else if (!result?.canceled) setBrowserSignal(result?.error || 'Manga dışa aktarılamadı.', false);
  });
}
$('browserPiP')?.addEventListener('click', () => {
  browserCommand('pip').then((result) => {
    if (!result?.ok) setBrowserSignal(result?.error || 'Resim içinde resim açılamadı.', false);
  }).catch(() => {});
});
if ($('browserAddress')) $('browserAddress').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); navigateBrowserFromAddress(); }
  else if (event.key === 'Escape') {
    event.preventDefault();
    $('browserAddress').value = player.browserPageUrl || '';
    $('browserAddress').select();
  }
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
  } else {
    setBrowserSignal(`Yer imi değiştirilemedi: ${(result && result.error) || 'bilinmeyen hata'}`, false);
  }
});
if ($('browserPlacesToggle')) $('browserPlacesToggle').addEventListener('click', () => {
  const panel = $('browserPlacesPanel');
  setBrowserPlacesOpen(panel?.classList.contains('hidden'));
});
if ($('browserPlacesClose')) $('browserPlacesClose').addEventListener('click', () => setBrowserPlacesOpen(false));
$('browserPlacesPanel')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  setBrowserPlacesOpen(false);
});
if ($('browserPlacesClear')) $('browserPlacesClear').addEventListener('click', async () => {
  if (player.browserPlaceTab !== 'history' || !window.api.clearBrowserHistory) return;
  const confirmed = await openAppDialog({
    title: 'Tarayıcı geçmişini temizle',
    description: 'Whisper içindeki web gezinme geçmişi kaldırılacak. Yer imleri ve izleme kütüphanesi korunur.',
    confirmLabel: 'Geçmişi temizle',
  });
  if (!confirmed) return;
  const result = await window.api.clearBrowserHistory().catch(() => null);
  if (result && result.ok && result.places) {
    player.browserPlaces = result.places;
    renderBrowserPlaces();
    setBrowserSignal('Tarayıcı geçmişi temizlendi.', true);
  } else {
    setBrowserSignal(`Tarayıcı geçmişi temizlenemedi: ${(result && result.error) || 'bilinmeyen hata'}`, false);
  }
});
async function clearBrowserCookieScope(scope) {
  const site = player.browserPageUrl || '';
  const isSite = scope === 'site';
  if (isSite && !site) {
    setBrowserSignal('Önce bir site açın; temizlenecek site yok.', false);
    return;
  }
  const confirmed = await openAppDialog({
    title: isSite ? 'Bu sitenin verilerini sil' : 'Tüm web çerezlerini sil',
    description: isSite
      ? 'Bu siteye ait çerezler, yerel depolama, IndexedDB ve service worker verileri silinecek; sayfa yenilenecek. Site oturumunuz kapanabilir. HTTP önbelleği silinmez; genel önbellek temizliği ayrı oturum sıfırlama işlemindedir.'
      : 'Whisper içindeki tüm web çerezleri silinecek. Açık site oturumlarınız kapanabilir.',
    confirmLabel: isSite ? 'Site verilerini sil' : 'Çerezleri sil',
  });
  if (!confirmed) return;
  const apiCall = isSite
    ? window.api.clearBrowserSiteCookies?.(site)
    : window.api.clearBrowserCookies?.();
  const result = await (apiCall || Promise.resolve(null)).catch(() => null);
  if (!result || !result.ok) {
    const prefix = result?.partial
      ? `Kısmen temizlendi (${Number(result.removed) || 0} çerez, ${Number(result.failed) || 0} hata)`
      : `${isSite ? 'Site verileri' : 'Çerezler'} temizlenemedi`;
    setBrowserSignal(`${prefix}: ${(result && result.error) || 'bilinmeyen hata'}`, false);
    return;
  }
  setBrowserPlacesOpen(false);
  const count = Number(result.removed) || 0;
  const failed = Number(result.failed) || 0;
  const suffix = failed ? ` ${failed} veri öğesi temizlenemedi.` : '';
  setBrowserSignal(isSite
    ? `${result.host || 'Bu site'} verileri temizlendi (${count} çerez). Sayfa yenileniyor.${suffix}`
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
  const folder = event.target.closest('[data-place-folder]');
  if (folder) {
    const item = (player.browserPlaces.bookmarks || []).find(entry => entry.url === folder.dataset.placeFolder);
    const value = await openAppDialog({ title: 'Yer imi klasörü', description: 'Boş bırakırsanız yer imi klasörden çıkarılır.',
      inputLabel: 'Klasör adı', inputValue: item?.folder || '', confirmLabel: 'Kaydet', intent: 'primary' });
    if (value === false) return;
    const result = await window.api.setBrowserBookmarkFolder(folder.dataset.placeFolder, value).catch(() => null);
    if (result?.ok) { player.browserPlaces = result.places; renderBrowserPlaces(); }
    else setBrowserSignal(`Yer imi klasörü kaydedilemedi: ${result?.error || 'bilinmeyen hata'}`, false);
    return;
  }
  const open = event.target.closest('[data-place-open]');
  if (open) {
    const url = open.dataset.placeOpen;
    setBrowserPlacesOpen(false);
    if ($('browserAddress')) $('browserAddress').value = url;
    await navigateBrowserFromAddress();
    return;
  }
  const remove = event.target.closest('[data-place-remove]');
  if (!remove || !window.api.removeBrowserPlace) return;
  const result = await window.api.removeBrowserPlace(player.browserPlaceTab, remove.dataset.placeRemove).catch(() => null);
  if (result && result.ok && result.places) { player.browserPlaces = result.places; renderBrowserPlaces(); }
  else setBrowserSignal(`Kayıt kaldırılamadı: ${(result && result.error) || 'bilinmeyen hata'}`, false);
});
for (const id of ['browserPlacesSearch', 'browserPlacesFolder']) $(id)?.addEventListener(id.endsWith('Search') ? 'input' : 'change', renderBrowserPlaces);
$('browserWorkspaceSave')?.addEventListener('click', async () => {
  const name = await openAppDialog({ title: 'Çalışma alanını kaydet', description: 'Açık tarayıcı sekmeleri bu adla kaydedilir.',
    inputLabel: 'Çalışma alanı adı', confirmLabel: 'Kaydet', intent: 'primary' });
  if (name === false) return;
  const result = await window.api.saveBrowserWorkspace(name).catch(() => null);
  if (result?.ok) {
    player.browserPlaces = result.places;
    renderBrowserPlaces();
    setBrowserSignal(`“${String(name).trim()}” çalışma alanı kaydedildi.`, true);
  }
  else setBrowserSignal(result?.error || 'Çalışma alanı kaydedilemedi.', false);
});
$('browserWorkspaceOpen')?.addEventListener('click', async () => {
  const name = $('browserWorkspaceSelect')?.value; if (!name) return;
  const button = $('browserWorkspaceOpen');
  if (button.disabled) return;
  button.disabled = true;
  const beforeCount = player.browserTabs.length;
  try {
    const result = await window.api.openBrowserWorkspace(name).catch(() => null);
    if (!result?.ok) {
      setBrowserSignal(result?.error || 'Çalışma alanı açılamadı.', false);
      return;
    }
    syncBrowserTabs(result.tabs, result.activeTabId);
    setBrowserPlacesOpen(false);
    const added = Math.max(0, player.browserTabs.length - beforeCount);
    if (result.firstTabId) await activateBrowserTabAndFocus(result.firstTabId);
    setBrowserSignal(`“${name}” çalışma alanından ${added} sekme açıldı.`, true);
  } finally {
    button.disabled = false;
  }
});
$('browserWorkspaceRemove')?.addEventListener('click', async () => {
  const name = $('browserWorkspaceSelect')?.value; if (!name) return;
  const accepted = await openAppDialog({ title: 'Çalışma alanını sil', description: `“${name}” kaydı silinsin mi? Açık sekmeler kapanmaz.`, confirmLabel: 'Kaydı sil' });
  if (!accepted) return;
  const result = await window.api.removeBrowserWorkspace(name).catch(() => null);
  if (result?.ok) {
    player.browserPlaces = result.places;
    renderBrowserPlaces();
    setBrowserSignal(`“${name}” çalışma alanı kaydı silindi.`, true);
  } else {
    setBrowserSignal(result?.error || 'Çalışma alanı kaydı silinemedi.', false);
  }
});
async function runBrowserChromeCommand(command) {
  const result = await browserCommand(command).catch(() => null);
  if (!result?.ok) setBrowserSignal(`Tarayıcı komutu tamamlanamadı: ${result?.error || 'bilinmeyen hata'}`, false);
  return result;
}
if ($('browserBack')) $('browserBack').addEventListener('click', () => runBrowserChromeCommand('back'));
if ($('browserForward')) $('browserForward').addEventListener('click', () => runBrowserChromeCommand('forward'));
if ($('browserReload')) $('browserReload').addEventListener('click', () => {
  runBrowserChromeCommand($('browserReload').classList.contains('loading') ? 'stop' : 'reload');
});
if ($('browserErrorRetry')) $('browserErrorRetry').addEventListener('click', () => {
  const tab = browserTabState();
  const url = tab?.errorUrl || player.browserPageUrl;
  if (url && $('browserAddress')) {
    $('browserAddress').value = url;
    navigateBrowserFromAddress();
  }
});
if ($('browserErrorBack')) $('browserErrorBack').addEventListener('click', () => {
  if (!browserTabState()?.canGoBack) {
    setBrowserSignal('Bu sekmede geri dönülecek bir sayfa yok.', false);
    return;
  }
  showBrowserErrorSurface(null);
  runBrowserChromeCommand('back');
});
if ($('browserCaptureToggle')) $('browserCaptureToggle').addEventListener('click', async () => {
  const button = $('browserCaptureToggle');
  if (button.disabled) return;
  const next = !player.browserCaptureEnabled;
  button.disabled = true;
  const result = await (window.api.setBrowserCaptureEnabled
    ? window.api.setBrowserCaptureEnabled(player.browserActiveTabId, next)
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
if ($('browserSignalTranslateAction')) $('browserSignalTranslateAction').addEventListener('click', () => useBrowserTrack(true));
if ($('browserTrackTranslateAll')) $('browserTrackTranslateAll').addEventListener('click', completeSelectedBrowserTranslation);
if ($('browserTrackExport')) $('browserTrackExport').addEventListener('click', exportSelectedBrowserTrack);
if ($('browserTranslationExport')) $('browserTranslationExport').addEventListener('click', exportBrowserTranslation);
if ($('browserQueuePage')) $('browserQueuePage').addEventListener('click', queueCurrentBrowserPage);
if ($('browserExportClip')) $('browserExportClip').addEventListener('click', exportBrowserAbClip);
if ($('browserLiveAsr')) $('browserLiveAsr').addEventListener('click', toggleBrowserLiveAsr);
if ($('browserManualSubtitle')) $('browserManualSubtitle').addEventListener('click', loadManualBrowserSubtitle);
if ($('browserCopyAb')) $('browserCopyAb').addEventListener('click', copyBrowserAbText);
if ($('browserTrackDismiss')) $('browserTrackDismiss').addEventListener('click', () => {
  $('browserTrackActions')?.classList.add('hidden');
  setBrowserSignal('Bildirim kapatıldı; altyazı izleme arka planda sürüyor.', false);
});
if ($('browserTrackSelect')) $('browserTrackSelect').addEventListener('change', () => renderBrowserTracks());
if ($('browserTrackSelect2')) $('browserTrackSelect2').addEventListener('change', () => renderBrowserTracks());
if ($('browserSessionReset')) $('browserSessionReset').addEventListener('click', async () => {
  const confirmed = await openAppDialog({
    title: 'Web oturumunu sıfırla',
    description: 'Site girişleri, çerezler ve önbellek silinecek. Yer imleri, geçmiş ve izleme kütüphanesi korunur.',
    confirmLabel: 'Oturumu sıfırla',
  });
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
  syncBrowserTabs(result.tabs || [], result.activeTabId || '');
  try { localStorage.removeItem('playerBrowserLastUrl'); } catch (_) {}
  if ($('browserAddress')) $('browserAddress').value = '';
  $('browserEmpty')?.classList.remove('hidden');
  clearBrowserTracks('Tarayıcı oturumu sıfırlandı; yer imleri ve geçmiş korundu.');
  if (result.places) { player.browserPlaces = result.places; renderBrowserPlaces(); }
  setBrowserPlacesOpen(false);
  showBrowserWorkspace();
});
if ($('browserSessionRestore')) $('browserSessionRestore').addEventListener('change', async () => {
  const checkbox = $('browserSessionRestore');
  checkbox.disabled = true;
  const result = await window.api.setBrowserSessionRestore(checkbox.checked).catch(() => null);
  checkbox.disabled = false;
  if (!result?.ok) {
    checkbox.checked = !checkbox.checked;
    setBrowserSignal('Oturum geri yükleme tercihi kaydedilemedi.', false);
    return;
  }
  setBrowserSignal(result.enabled
    ? 'Son sekmeler uygulama açılışında geri yüklenecek.'
    : 'Son sekmeler güvenli kapanış için saklanacak ancak açılışta geri yüklenmeyecek.', false);
});
if ($('browserDiagnosticsToggle')) $('browserDiagnosticsToggle').addEventListener('click', () => {
  toggleSettingsPage('browser-diagnostics');
  if (player.browserDiagnostics) renderBrowserDiagnostics(player.browserDiagnostics);
});
if ($('browserAdapterFolder')?.addEventListener) $('browserAdapterFolder').addEventListener('click', async () => {
  const result = await window.api.openBrowserAdapterFolder?.().catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok) logLine(`Adaptör klasörü açılamadı: ${result?.error || 'bilinmeyen hata'}`, 'warn');
});

if (window.api.onBrowserEvent) window.api.onBrowserEvent((event) => {
  if (!event || !event.type) return;
  // İndirme oturum genelindedir; kaynak sekme kapansa bile sonucu göster.
  if (event.type === 'downloads') { receiveBrowserDownloads(event.downloads); return; }
  // Arama olayları altyazı edinme kuşağına bağlı değil; kendi istek token'ını taşır.
  if (['find-open', 'find-result', 'find-reset'].includes(event.type)) { receiveBrowserFindEvent(event); return; }
  if (event.type === 'tabs-changed') {
    const previousActiveId = player.browserActiveTabId;
    saveActiveBrowserTabWorkspace();
    syncBrowserTabs(event.tabs || [], event.activeTabId || '');
    if (previousActiveId === player.browserActiveTabId) return;
    const tab = browserTabState();
    if (tab) {
      restoreActiveBrowserTabWorkspace(tab);
      updateBrowserNavigation(tab, { preserveWorkspace: true });
      scheduleBrowserBounds();
    }
    return;
  }
  // ASR tek, uygulama-geneli bir kaynaktır. Durdurma olayı kapanmış/eski bir
  // sekmenin kimliğini taşısa bile aktif-sekme kapısında kaybolmamalı.
  if (event.type === 'live-asr-state' && event.active === false) {
    if (player.browserLiveAsrActive) {
      stopBrowserLiveAsrCapture(false, event.message || 'Canlı Whisper durduruldu.');
    } else if (event.message) {
      updateBrowserLiveAsrButton(event.message);
    }
    return;
  }
  if (event.tabId) {
    const tab = browserTabState(event.tabId);
    if (!tab || !player.browserTabEventGate.accept(event)) return;
    tab.generation = Math.max(Number(tab.generation) || 0, Number(event.generation) || 0);
    if (event.tabId !== player.browserActiveTabId) {
      if (event.type === 'navigation') {
        if (event.url && event.url !== tab.url) {
          const fresh = newBrowserTabState({ ...event, id: tab.id, captureEnabled: tab.captureEnabled, pinned: tab.pinned });
          Object.assign(tab, fresh);
        }
        Object.assign(tab, {
          url: event.url || '', title: event.title || tab.title || '', loading: !!event.loading,
          canGoBack: !!event.canGoBack, canGoForward: !!event.canGoForward,
        });
      } else if (event.type === 'title') {
        tab.title = event.title || '';
      } else if (event.type === 'subtitle-found' && event.track) {
        const index = tab.browserTracks.findIndex((track) => track.id === event.track.id);
        if (index >= 0) tab.browserTracks[index] = event.track; else tab.browserTracks.push(event.track);
      } else if (event.type === 'media' && event.media) {
        const backgroundTime = Number(event.media.currentTime);
        const backgroundDuration = Number(event.media.duration);
        tab.browserTime = Number.isFinite(backgroundTime) ? Math.max(0, backgroundTime) : 0;
        tab.browserDuration = Number.isFinite(backgroundDuration) ? Math.max(0, backgroundDuration) : 0;
        tab.browserPaused = !!event.media.paused;
      } else if (event.type === 'tab-audio') {
        tab.audible = !!event.audible;
        tab.tabMuted = !!event.tabMuted;
      } else if (event.type === 'capture-status') {
        tab.diagnostics = event.diagnostics || null;
      } else if (event.type === 'translation-result' && event.result && !event.result.error) {
        const translated = mergeBrowserTranslationCues(
          new Map((tab.browserLiveTranslations || []).map((cue) => [browserTranslationCueKey(cue), cue])),
          event.result.cues);
        tab.browserTranslationTrackId = event.trackId || tab.browserTranslationTrackId;
        tab.browserLiveTranslations = [...translated.values()];
      } else if (event.type === 'capture-enabled') {
        tab.captureEnabled = event.enabled !== false;
      } else if (event.type === 'manga-state') {
        tab.browserMangaBusy = event.state === 'running';
        if (event.translated !== undefined) tab.browserMangaTranslated = Math.max(0, Number(event.translated) || 0);
        if (event.visible !== undefined) tab.browserMangaVisible = !!event.visible;
        else if (event.state === 'idle' || event.state === 'error') tab.browserMangaVisible = false;
        tab.browserMangaCompleted = Math.max(0, Number(event.completed) || 0);
        tab.browserMangaTotal = Math.max(0, Number(event.total) || 0);
        tab.browserMangaFailed = Math.max(0, Number(event.failed) || 0);
        tab.browserMangaEmpty = Math.max(0, Number(event.empty) || 0);
        if (event.retryable !== undefined) tab.browserMangaRetryable = Math.max(0, Number(event.retryable) || 0);
        tab.browserMangaError = event.state === 'error' ? String(event.message || event.error || '') : '';
      } else if (event.type === 'load-error' || event.type === 'security-error' || event.type === 'drm-playback-error') {
        tab.error = event.message || 'Tarayıcı hatası';
        tab.errorKind = event.type === 'security-error' ? 'certificate' : 'connection';
        tab.errorCode = event.code || '';
        tab.errorUrl = event.url || tab.url || '';
      }
      updateBrowserTabPresentation(tab);
      return;
    }
  }
  if (event.type === 'navigation') {
    updateBrowserNavigation(event);
  } else if (event.type === 'title') {
    player.browserPageTitle = event.title || '';
    const tab = browserTabState();
    if (tab) tab.title = player.browserPageTitle;
    if (tab) updateBrowserTabPresentation(tab);
    if (player.workspaceMode === 'browser') $('playerTitle').textContent = player.browserPageTitle || 'Tarayıcı';
    loadBrowserPlaces();
  } else if (event.type === 'places' && event.places) {
    player.browserPlaces = event.places;
    renderBrowserPlaces();
  } else if (event.type === 'places-save-error') {
    const message = event.message || 'Tarayıcı geçmişi ve yer imleri kaydedilemedi.';
    setBrowserSignal(message, false, 10000);
    logLine(`${message}${event.detail ? ` · ${event.detail}` : ''}`, 'warn');
  } else if (event.type === 'tab-audio') {
    const tab = browserTabState();
    if (tab) { tab.audible = !!event.audible; tab.tabMuted = !!event.tabMuted; updateBrowserTabPresentation(tab); }
  } else if (event.type === 'subtitle-found' && event.track) {
    const selectedBefore = $('browserTrackSelect')?.value || '';
    const index = player.browserTracks.findIndex((track) => track.id === event.track.id);
    if (index >= 0) player.browserTracks[index] = event.track;
    else player.browserTracks.push(event.track);
    const tab = browserTabState();
    if (tab) tab.browserTracks = player.browserTracks.slice();
    renderBrowserTracks(selectedBefore || event.track.id);
    scheduleActiveBrowserTrackRefresh(event.track);
    if (event.track.role === 'translation' && event.track.autoLoad) {
      void loadPersistedBrowserTranslation(event.track);
    }
    if (index < 0) logLine(`${event.track.role === 'translation' ? 'Web çevirisi' : 'Web altyazısı'} bulundu: ${event.track.label} · ${event.track.cueCount} satır`, 'success');
  } else if (event.type === 'media' && event.media) {
    const previousTime = player.browserTime;
    const wasPaused = player.browserPaused;
    const currentTime = Number(event.media.currentTime);
    const duration = Number(event.media.duration);
    player.browserTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
    player.browserDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    player.browserPaused = !!event.media.paused;
    const nextVolume = Number(event.media.volume);
    if (Number.isFinite(nextVolume)) player.browserVolume = Math.max(0, Math.min(1, nextVolume));
    player.browserMuted = !!event.media.muted;
    const tab = browserTabState();
    if (tab) Object.assign(tab, {
      browserTime: player.browserTime, browserDuration: player.browserDuration,
      browserPaused: player.browserPaused, browserVolume: player.browserVolume,
      browserMuted: player.browserMuted,
    });
    const browserRate = Number(event.media.playbackRate);
    if (Number.isFinite(browserRate) && browserRate > 0) {
      player.browserRate = browserRate;
      if (tab) tab.browserRate = browserRate;
      if (player.workspaceMode === 'browser') syncPlayerSpeedControl(browserRate);
    }
    syncBrowserLiveAsrClock();
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
        if (seekTo > 0) browserCommand('seek', seekTo).catch(() => {});
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
  } else if (event.type === 'load-error' || event.type === 'security-error') {
    const tab = browserTabState();
    if (tab) {
      tab.error = event.message || `hata ${event.code}`;
      tab.errorKind = event.type === 'security-error' ? 'certificate' : 'connection';
      tab.errorCode = event.code || '';
      tab.errorUrl = event.url || tab.url || player.browserPageUrl || '';
    }
    updateBrowserNavigation({ ...event, loading: false });
    if (player.workspaceMode === 'browser') $('playerMeta').textContent = 'Sayfa yüklenemedi';
    showBrowserErrorSurface({ kind: tab?.errorKind, code: event.code, message: event.message || `hata ${event.code}` });
    setBrowserSignal(`Sayfa yüklenemedi: ${event.message || `hata ${event.code}`}`, false,
      { priority: 100, holdMs: 7000 });
  } else if (event.type === 'notice') {
    setBrowserSignal(event.message || 'İşlem tamamlandı.', !!event.success);
  } else if (event.type === 'capture-warning') {
    logLine(event.message || 'Web altyazısı ağdan izlenemedi; HTML5 izleri taranmaya devam ediyor.', 'warn');
  } else if (event.type === 'capture-enabled') {
    setBrowserCaptureEnabled(event.enabled !== false, false);
  } else if (event.type === 'capture-status' && event.diagnostics) {
    if (typeof event.diagnostics.captureEnabled === 'boolean') setBrowserCaptureEnabled(event.diagnostics.captureEnabled, false);
    renderBrowserDiagnostics(event.diagnostics);
  } else if (event.type === 'manga-state') {
    applyBrowserMangaState(event);
  } else if (event.type === 'translation-result') {
    applyBrowserTranslationResult(event);
  } else if (event.type === 'translation-state' && event.trackId === player.browserTranslationTrackId) {
    const progress = event.state || {};
    const estimate = progress.remaining
      ? ` · ~${Number(progress.remaining)} istek / ~${Number(progress.estimatedTokens || 0).toLocaleString('tr-TR')} token`
      : '';
    if (progress.pending || progress.queued) {
      setBrowserSignal(`Canlı çeviri: ${Number(progress.completed || 0)}/${Number(progress.total || 0)} cümle hazır · ${Number(progress.pending || 0)} çalışıyor${estimate}`, true,
        { priority: 60 });
    } else if (progress.total && Number(progress.completed) >= Number(progress.total)) {
      setSubtitleMode('translation', false);
      updateBrowserTranslationExportButton();
      setBrowserSignal(`Canlı çeviri hazır: ${Number(progress.completed)}/${Number(progress.total)} cümle. Çeviri ana altyazı olarak gösteriliyor.`, true,
        { priority: 65, holdMs: 4000 });
    } else if (progress.total && progress.failed) {
      updateBrowserTranslationExportButton();
      setBrowserSignal(`Canlı çeviri tamamlanamadı: ${Number(progress.completed || 0)}/${Number(progress.total)} cümle hazır · ${Number(progress.failed)} hata.`, false,
        { priority: 90, holdMs: 6000 });
    } else if (progress.total) {
      setBrowserSignal(`Canlı çeviri hazır: ${Number(progress.completed || 0)}/${Number(progress.total || 0)} cümle.`, true);
    }
  } else if (event.type === 'overlay-style') {
    const bottomOffset = Number(event.style?.bottomOffset);
    const control = $('browserOverlayBottom');
    if (control && Number.isFinite(bottomOffset)) {
      control.value = String(Math.max(0, Math.min(75, bottomOffset)));
      if ($('browserOverlayBottomVal')) $('browserOverlayBottomVal').textContent = `%${Math.round(Number(control.value))}`;
      scheduleSave();
    }
  } else if (event.type === 'live-asr-state') {
    updateBrowserLiveAsrButton(event.message || 'Canlı Whisper');
    if (event.message) setBrowserSignal(event.message, !!event.active);
  } else if (event.type === 'live-asr-warning') {
    logLine(`Canlı Whisper: ${event.message || 'ses parçası işlenemedi'}`, 'warn');
  } else if (event.type === 'drm-status') {
    const message = event.supported
      ? 'Widevine modülü bulundu. Bu yalnızca teknik erişimi doğrular; Hulu, Discovery+ ve benzeri servisler ayrıca üretim lisansı/VMP imzası isteyebilir.'
      : 'Bu Electron derlemesinde Widevine kullanılamıyor; korumalı video oynatılamayabilir, ancak erişilebilen altyazı ağ izleri taranmaya devam eder.';
    setBrowserSignal(message, !!event.supported, { priority: event.supported ? 35 : 75, holdMs: 5000 });
    logLine(message, event.supported ? 'info' : 'warn');
  } else if (event.type === 'drm-wait') {
    setBrowserSignal(event.message || (event.waiting ? 'DRM bileşeni hazırlanıyor…' : 'Sayfa açılıyor…'), false);
  } else if (event.type === 'popup-opened') {
    const message = `${event.host || 'Site'} için yeni pencere açıldı. Bu pencerede altyazı yakalama ve çeviri çalışmaz; videoyu ana sekmede açın.`;
    setBrowserSignal(message, false, { priority: 70, holdMs: 5000 });
    logLine(message, 'warn');
  } else if (event.type === 'drm-playback-error') {
    const tab = browserTabState();
    if (tab) tab.error = event.message || 'DRM hatası';
    const message = `Korumalı video lisans aşamasında reddedildi: ${event.message || 'DRM hatası'}`;
    setBrowserSignal(message, false, { priority: 100, holdMs: 7000 });
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
    const savedSet = new Set(player.savedCues);
    const savedCount = player.cues.filter(cue => savedSet.has(cueSignature(cue))).length;
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

function migrateSavedCueAssociation(before, after) {
  const oldKey = cueSignature(before), nextKey = cueSignature(after);
  if (!oldKey || oldKey === nextKey) return;
  player.savedCues = [...new Set(player.savedCues.map(key => key === oldKey ? nextKey : key))];
  player.savedWords.forEach(record => {
    const marker = `|${oldKey}|`;
    if (record.key.includes(marker)) {
      record.key = record.key.replace(marker, `|${nextKey}|`);
      record.cue = after.text;
    }
  });
  persistSavedCues();
  persistSavedWords();
}

function migrateTimelineAssociations() {
  const before = player.timeline.annotationSnapshot || [];
  player.timeline.annotationSnapshot = null;
  const oldByText = new Map(), newByText = new Map();
  // Yinelenen/bölünmüş metinde tahmin yapma: eski kaydı koru.
  for (const [list, map] of [[before, oldByText], [player.cues, newByText]]) {
    for (const cue of list) map.set(cue.text, map.has(cue.text) ? null : cue);
  }
  for (const [text, oldCue] of oldByText) {
    const next = newByText.get(text);
    if (oldCue && next) migrateSavedCueAssociation(oldCue, next);
  }
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
  if (panel) {
    if (panel.classList.contains('hidden')) player.wordInspectorReturnFocus = document.activeElement;
    panel.classList.remove('hidden');
    panel.focus();
  }
  updateWordInspector();
}

function hideWordInspector() {
  player.selectedWord = null;
  const panel = $('wordInspector');
  if (panel) {
    const restore = panel.contains(document.activeElement);
    panel.classList.add('hidden');
    if (restore && player.wordInspectorReturnFocus?.isConnected) player.wordInspectorReturnFocus.focus();
  }
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
    const pageAction = e.target.closest?.('[data-cue-page]')?.dataset.cuePage;
    if (pageAction) {
      player.cueListPageStart += pageAction === 'next' ? 500 : -500;
      player.cueListPageStart = Math.max(0, player.cueListPageStart);
      renderCueList($('cueSearch')?.value || '');
      box.scrollTop = 0;
      return;
    }
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
  let inEvents = false;
  let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  const toSec = (t) => {
    const m = String(t).trim().match(/(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/);
    if (!m) return null;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / (10 ** m[4].length);
  };
  for (const line of srcLines) {
    lineNo++;
    const section = line.trim().match(/^\[([^\]]+)\]$/);
    if (section) {
      inEvents = section[1].trim().toLowerCase() === 'events';
      continue;
    }
    if (inEvents && /^Format\s*:/i.test(line)) {
      const parsedFields = line.slice(line.indexOf(':') + 1)
        .split(',').map((field) => field.trim().toLowerCase()).filter(Boolean);
      if (parsedFields.includes('start') && parsedFields.includes('end') && parsedFields.includes('text')) {
        fields = parsedFields;
      }
      continue;
    }
    if (!/^Dialogue\s*:/i.test(line)) continue;
    // [Events] Format satırındaki alan sırasını izle. Text son alandır ve virgül
    // içerebildiği için kalan parçalar tekrar birleştirilir.
    const parts = line.slice(line.indexOf(':') + 1).split(',');
    const startIndex = fields.indexOf('start');
    const endIndex = fields.indexOf('end');
    const textIndex = fields.indexOf('text');
    if (startIndex < 0 || endIndex < 0 || textIndex < 0 || textIndex >= parts.length) continue;
    const start = toSec(parts[startIndex]);
    const end = toSec(parts[endIndex]);
    if (start === null || end === null) continue;
    const rawBody = parts.slice(textIndex).join(',');
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
    if (body) out.push({ start, end, text: body, line: lineNo, assLead: lead,
      assInner: hadInner, assTextIndex: textIndex, assFieldCount: fields.length,
      assStartIndex: startIndex, assEndIndex: endIndex });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// SRT/VTT ayrıştırma — write_srt çıktımızla birebir uyumlu (BOM ve \r\n dahil)
function parseSubtitles(text) {
  if (/^\s*(\[Script Info\]|\[V4\+? Styles\]|\[Events\])/im.test(text)
      || /^Dialogue\s*:\s*[^,\r\n]*,\s*\d+:\d{2}:\d{2}\.\d+,/im.test(text)) {
    return parseAss(text);
  }
  const out = [];
  const clean = String(text || '').replace(/\r/g, '').replace(/^\uFEFF/, '');
  // WebVTT bir saatin altinda HH alanini atlayabilir (MM:SS.mmm). SRT'nin
  // HH:MM:SS,mmm bicimini de kabul eden tek ifade kullan.
  const re = /(?:(\d+):)?(\d{1,3}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,3}):(\d{2})[,.](\d{1,3})/;
  const lines = clean.split('\n');
  const indices = lines.flatMap((line, index) => re.test(line) ? [index] : []);
  for (let position = 0; position < indices.length; position++) {
    const idx = indices[position];
    const m = lines[idx].match(re);
    const start = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0')) / 1000;
    const end = (+(m[5] || 0)) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8].padEnd(3, '0')) / 1000;
    let until = indices[position + 1] ?? lines.length;
    if (position + 1 < indices.length && /^\d+$/.test(lines[until - 1]?.trim())) until--;
    const body = lines.slice(idx + 1, until).join('\n').trim();
    if (body) out.push({ start, end, text: body, sourceStart: start, sourceEnd: end });
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

function applyPlaybackLearningPolicy(time, previousTime, paused, browserMode) {
  if (player.editing || player.holdingSpeed || $('playerVideo')?.seeking) return;
  if (player.playbackPolicy === 'normal' || !player.cues.length || !window.WhisperPlaybackPolicy) return;
  const action = window.WhisperPlaybackPolicy.playbackLearningAction(
    player.cues, Number(time) - player.offset, Number(previousTime) - player.offset,
    player.playbackPolicy,
    { baseRate: player.learningBaseRate, gapRate: Math.max(2, player.learningBaseRate), minGap: 2, lead: .15 },
  );
  if (!action) return;
  if (action.type === 'seek') {
    const target = action.time + player.offset;
    if (browserMode) browserCommand('seek', target).catch(() => {});
    else if ($('playerVideo')) $('playerVideo').currentTime = target;
  } else if (action.type === 'set-rate') {
    const current = browserMode ? player.browserRate : Number($('playerVideo')?.playbackRate || 1);
    if (Math.abs(current - action.rate) < .01) return;
    if (browserMode) browserCommand('speed', action.rate).then((result) => {
      if (result?.ok) player.browserRate = Number(result.media?.playbackRate) || action.rate;
    }).catch(() => {});
    else if ($('playerVideo')) $('playerVideo').playbackRate = action.rate;
  } else if (action.type === 'pause-for-shadowing' && !paused && !player.shadowResumeTimer) {
    const generation = currentGeneration();
    if (browserMode) browserCommand('pause').catch(() => {});
    else $('playerVideo')?.pause();
    player.shadowResumeTimer = setTimeout(() => {
      player.shadowResumeTimer = null;
      if (generation !== currentGeneration() || player.playbackPolicy !== 'shadowing' || player.editing) return;
      if (browserMode) browserCommand('play').catch(() => {});
      else $('playerVideo')?.play().catch(() => {});
    }, action.durationMs);
    osd(`Tekrar et · ${Math.round(action.durationMs / 1000)} sn`, 1000);
  }
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
    applyPlaybackLearningPolicy(video.currentTime,
      player.lastT === undefined ? NaN : player.lastT + player.offset, video.paused, false);
    if (player.autoPause && !video.paused && !video.seeking && dt > 0 && dt < 1.0) {
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

function translationsForCues(cues, translations) {
  const matches = new Array(cues.length).fill('');
  if (!translations.length) return matches;
  let cursor = 0;
  cues.forEach((cue, cueIndex) => {
    while (cursor < translations.length && translations[cursor].end <= cue.start) cursor++;
    let best = null;
    let bestOverlap = 0;
    for (let index = cursor; index < translations.length; index++) {
      const translated = translations[index];
      if (translated.start >= cue.end) break;
      const overlap = Math.min(cue.end, translated.end) - Math.max(cue.start, translated.start);
      if (overlap > bestOverlap) { bestOverlap = overlap; best = translated; }
    }
    if (best && bestOverlap > Math.min(0.4, (cue.end - cue.start) * 0.25)) {
      matches[cueIndex] = best.text;
    }
  });
  return matches;
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

function cueHasLowConfidence(cue) {
  return Number(cue && cue.lowConfidenceWords) > 0
    || (cue && cue.confidence !== undefined && Number(cue.confidence) < 0.6);
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
  const translations = translationsForCues(player.cues, player.cues2);
  const indexes = [];
  player.cues.forEach((c, i) => {
    const tr = translations[i];
    if (q && !c.text.toLocaleLowerCase('tr').includes(q)
        && !tr.toLocaleLowerCase('tr').includes(q)) return;
    if (player.savedOnly && !isCueSaved(i)) return;
    const lowConfidence = cueHasLowConfidence(c);
    if (player.qualityOnly && !lowConfidence) return;
    indexes.push(i);
  });
  if (!indexes.length) {
    box.innerHTML = '<div class="cue-list-empty">Eşleşen satır yok.</div>';
    return;
  }
  const pageSize = 500;
  const queryKey = `${q}|${player.savedOnly ? 1 : 0}|${player.qualityOnly ? 1 : 0}|${player.cues.length}|${player.cues2.length}`;
  if (queryKey !== player.cueListQueryKey) {
    player.cueListQueryKey = queryKey;
    player.cueListPageStart = 0;
  }
  if (!q && !player.savedOnly && !player.qualityOnly && player.activeIdx >= 0
      && (player.activeIdx < player.cueListPageStart
        || player.activeIdx >= player.cueListPageStart + pageSize)) {
    player.cueListPageStart = Math.floor(player.activeIdx / pageSize) * pageSize;
  }
  const maxStart = Math.max(0, Math.floor((indexes.length - 1) / pageSize) * pageSize);
  player.cueListPageStart = Math.max(0, Math.min(maxStart, player.cueListPageStart));
  const visibleIndexes = indexes.slice(player.cueListPageStart, player.cueListPageStart + pageSize);
  const frag = document.createDocumentFragment();
  visibleIndexes.forEach((i) => {
    const c = player.cues[i];
    const tr = translations[i];
    const lowConfidence = cueHasLowConfidence(c);
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
  if (indexes.length > pageSize) {
    const nav = document.createElement('div');
    nav.className = 'cue-list-pagination';
    const previous = document.createElement('button');
    previous.type = 'button'; previous.className = 'link-btn'; previous.dataset.cuePage = 'previous';
    previous.textContent = 'Önceki satırlar'; previous.disabled = player.cueListPageStart === 0;
    const status = document.createElement('span');
    status.textContent = `${player.cueListPageStart + 1}–${Math.min(indexes.length, player.cueListPageStart + pageSize)} / ${indexes.length}`;
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'link-btn'; next.dataset.cuePage = 'next';
    next.textContent = 'Sonraki satırlar'; next.disabled = player.cueListPageStart >= maxStart;
    nav.append(previous, status, next);
    box.appendChild(nav);
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
  if (!row && player.autoFollow && !player.userScrolled
      && !($('cueSearch')?.value || '').trim() && !player.savedOnly && !player.qualityOnly) {
    player.cueListPageStart = Math.floor(player.activeIdx / 500) * 500;
    renderCueList('');
    return;
  }
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
    browserCommand('seek', target).catch(() => {});
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
    if (window.api.browserCommand) browserCommand('play').catch(() => {});
    return;
  }
  const video = $('playerVideo');
  if (video && video.paused) video.play();
}

async function copyCue() {
  if (player.activeIdx < 0) return;
  try {
    await window.api.copyText(player.cues[player.activeIdx].text);
    logLine('Altyazı satırı panoya kopyalandı.', 'success');
  } catch (error) {
    logLine(`Panoya kopyalanamadı: ${error.message}`, 'error');
  }
}

function syncLearningAnnotation(type, cue, saved, options = {}) {
  if (!window.api.toggleLearningAnnotation || !player.mediaKey || !cue) return;
  window.api.toggleLearningAnnotation({
    type,
    mediaId: player.mediaKey,
    start: Number(cue.start) || 0,
    end: Number(cue.end) || Number(cue.start) || 0,
    source: String(options.source ?? cue.text ?? ''),
    translation: String(options.translation ?? translationFor(cue) ?? ''),
    note: String(options.note || ''),
    status: options.status || (type === 'word' ? 'learning' : 'new'),
  }, saved).catch(() => {});
}

async function loadLearningAnnotations() {
  if (!window.api.listLearningAnnotations || !player.mediaKey) return;
  const key = player.mediaKey;
  const generation = currentGeneration();
  const result = await window.api.listLearningAnnotations(key).catch(() => null);
  if (!result?.ok || staleGeneration(generation) || player.mediaKey !== key) return;
  for (const annotation of result.annotations || []) {
    if (annotation.type === 'quote') {
      const cue = player.cues.find((item) => Math.abs(item.start - annotation.start) < .05);
      const signature = cue ? cueSignature(cue)
        : `${Number(annotation.start).toFixed(3)}|${Number(annotation.end).toFixed(3)}|${annotation.source}`;
      if (!player.savedCues.includes(signature)) player.savedCues.push(signature);
    } else if (annotation.type === 'word') {
      const cue = player.cues.find((item) => Math.abs(item.start - annotation.start) < .05);
      if (!cue) continue;
      const keyValue = wordRecordKey(annotation.source, player.cues.indexOf(cue), 'source');
      if (!player.savedWords.some((item) => item.key === keyValue)) {
        player.savedWords.push({ key: keyValue, word: annotation.source, source: 'source',
          cue: cue.text, translation: annotation.translation, start: cue.start });
      }
    }
  }
  persistSavedCues();
  persistSavedWords();
  updateCueMeta();
}

async function saveCueNote() {
  const cue = player.cues[player.activeIdx];
  if (!cue || !player.mediaKey) {
    logLine('Not eklemek için önce bir altyazı satırına gel.', 'warn');
    return;
  }
  const note = await openAppDialog({
    title: 'Cümleye not ekle',
    description: `${pSecToTime(cue.start)} zamanındaki cümleye bağlı kalıcı bir not yaz.`,
    confirmLabel: 'Notu kaydet', intent: 'primary', inputLabel: 'Not', inputValue: '',
  });
  if (note === false || !String(note).trim()) return;
  syncLearningAnnotation('note', cue, true, { note: String(note).trim() });
  osd('Zaman bağlı not kaydedildi');
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
    syncLearningAnnotation('quote', player.cues[player.activeIdx], false);
    osd('Cümle kayıtlardan çıkarıldı');
  } else {
    player.savedCues.push(sig);
    syncLearningAnnotation('quote', player.cues[player.activeIdx], true);
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
    syncLearningAnnotation('word', cue, false, { source: selected.word, translation: translationFor(cue) });
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
    syncLearningAnnotation('word', cue, true, { source: selected.word, translation: translationFor(cue) });
    osd('Kelime koleksiyona eklendi');
  }
  persistSavedWords();
  updateWordInspector();
}

async function copySelectedWord() {
  if (!player.selectedWord) return;
  try {
    await window.api.copyText(player.selectedWord.word);
    osd('Kelime panoya kopyalandı');
  } catch (error) {
    osd(`Panoya kopyalanamadı: ${error.message}`);
  }
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
    `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${String(c.text || '').replace(/\r?\n[ \t]*\r?\n+/g, '\n')}\n`).join('\n');
}

// ---- Dalga biçimli zamanlama masası ----
function timelineDuration() {
  const video = $('playerVideo');
  return Math.max(1,
    player.workspaceMode === 'browser' ? Number(player.browserDuration) || 0 : Number(video && video.duration) || 0,
    player.cues.length ? player.cues[player.cues.length - 1].end + player.offset : 0,
    player.timeline.waveformDuration || 0);
}

function timelinePlaybackTime() {
  const video = $('playerVideo');
  return player.workspaceMode === 'browser'
    ? Number(player.browserTime) || 0
    : Number(video && video.currentTime) || 0;
}

function timelineWindow() {
  const duration = timelineDuration();
  const zoom = Number($('timelineZoom') ? $('timelineZoom').value : 60);
  if (!zoom || zoom >= duration) return { start: 0, end: duration };
  const selected = player.cues[player.timeline.selected];
  const center = player.timeline.drag ? player.timeline.drag.center
    : (selected ? (selected.start + selected.end) / 2 + player.offset : timelinePlaybackTime());
  const start = Math.max(0, Math.min(duration - zoom, center - zoom / 2));
  return { start, end: start + zoom };
}

function timelineMarkDirty(message) {
  migrateTimelineAssociations();
  const drawer = $('timelineDrawer');
  if (drawer) drawer.classList.add('dirty');
  if ($('timelineStatus')) $('timelineStatus').textContent = message || 'Kaydedilmemiş zamanlama değişiklikleri';
  if ($('timelineUndo')) $('timelineUndo').disabled = !player.timeline.undo.length;
  if ($('timelineRedo')) $('timelineRedo').disabled = !player.timeline.redo?.length;
  const selectedCue = player.cues[player.timeline.selected];
  player.cues.sort((a, b) => a.start - b.start || a.end - b.end);
  if (selectedCue) player.timeline.selected = player.cues.indexOf(selectedCue);
  player.cuesRaw = player.cues.map(c => ({ ...c }));
  player.activeIdx = -1;
  scheduleBrowserOverlaySync();
  renderCueList($('cueSearch') ? $('cueSearch').value : '');
  renderCue();
  drawTimeline();
}

function timelinePushUndo() {
  player.timeline.annotationSnapshot = player.cues.map(c => ({ ...c }));
  player.timeline.redo = [];
  if ($('timelineRedo')) $('timelineRedo').disabled = true;
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
    const mediaStart = cue.start + player.offset;
    const mediaEnd = cue.end + player.offset;
    if (mediaEnd < view.start || mediaStart > view.end) return;
    const x1 = Math.max(0, xFor(mediaStart));
    const x2 = Math.min(w, xFor(mediaEnd));
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
  const now = timelinePlaybackTime();
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
  if (player.workspaceMode === 'browser' && window.api.browserCommand) {
    browserCommand('pause').catch(() => {});
  } else if ($('playerVideo')) {
    $('playerVideo').pause();
  }
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
  const canvas = $('timelineCanvas');
  const drag = player.timeline.drag;
  player.timeline.drag = null;
  if (drag && canvas?.hasPointerCapture?.(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
  if (drag?.changed) timelineMarkDirty('Sürüklenen bloğun zamanlaması korundu');
  player.timeline.open = false;
  player.timeline.drag = null;
  if ($('timelineDrawer')) $('timelineDrawer').classList.add('hidden');
  if ($('timelineToggle')) $('timelineToggle').classList.remove('active');
}

function timelineNudge(delta) {
  const i = player.timeline.selected;
  if (i < 0 || !player.cues[i] || !Number.isFinite(delta)) return;
  const c = player.cues[i];
  const shift = Math.max(-c.start, delta);
  if (!shift) return;
  timelinePushUndo();
  c.start += shift; c.end += shift;
  timelineMarkDirty(`${i + 1}. blok ${delta < 0 ? 'geri' : 'ileri'} kaydırıldı`);
}

function timelineSplitCue() {
  const at = timelinePlaybackTime() - player.offset;
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
  // Zamanlama düzenleyicisi biçimsel ASS stillerini yeniden üretemez. SRT
  // içeriğini ASS/VTT uzantısına yazmak yerine dönüşümü dosya adında açıkla.
  const copyPath = (player.subPath || 'altyazi.srt').replace(/\.(?:srt|vtt|ass|ssa)$/i, '.srt');
  const result = await window.api.saveSubtitleCopy(copyPath, cuesToSrt(player.cues));
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
  (player.timeline.redo ||= []).push(player.cues.map(c => ({ ...c })));
  player.timeline.annotationSnapshot = player.cues.map(c => ({ ...c }));
  player.cues = prior;
  player.timeline.selected = Math.min(player.timeline.selected, player.cues.length - 1);
  $('timelineUndo').disabled = !player.timeline.undo.length;
  timelineMarkDirty('Son zamanlama değişikliği geri alındı');
});
if ($('timelineRedo')) $('timelineRedo').addEventListener('click', () => {
  const next = player.timeline.redo?.pop();
  if (!next) return;
  player.timeline.undo.push(player.cues.map(c => ({ ...c })));
  player.timeline.annotationSnapshot = player.cues.map(c => ({ ...c }));
  player.cues = next;
  timelineMarkDirty('Zamanlama değişikliği yinelendi');
});

if ($('timelineCanvas')) {
  const canvas = $('timelineCanvas');
  canvas.addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return;
    if (!player.cues.length) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      player.timeline.selected = Math.max(0, Math.min(player.cues.length - 1,
        player.timeline.selected + (e.key === 'ArrowDown' ? 1 : -1)));
      drawTimeline();
    } else if (e.key === 'Enter') {
      const cue = player.cues[player.timeline.selected];
      if (cue) {
        const target = Math.max(0, cue.start + player.offset);
        if (player.workspaceMode === 'browser') browserCommand('seek', target).catch(() => {});
        else if ($('playerVideo')) $('playerVideo').currentTime = target;
      }
    } else timelineNudge((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : .1));
  });
  canvas.addEventListener('wheel', e => {
    if (!e.ctrlKey) return; // Normal sayfa kaydırması korunur.
    const zoom = $('timelineZoom');
    if (!zoom) return;
    e.preventDefault();
    zoom.selectedIndex = Math.max(0, Math.min(zoom.options.length - 1, zoom.selectedIndex + Math.sign(e.deltaY)));
    drawTimeline();
  }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const view = timelineWindow();
    const span = view.end - view.start;
    const x = e.clientX - rect.left;
    const at = view.start + x / rect.width * span;
    const cueAt = at - player.offset;
    const edgeSec = Math.max(.08, span * 8 / rect.width);
    let hit = e.offsetY >= 76 && e.offsetY <= 122
      ? player.cues.findIndex((c) => c.start <= cueAt && c.end >= cueAt) : -1;
    if (hit < 0 && e.offsetY >= 76 && e.offsetY <= 122) {
      hit = player.cues.findIndex((c) => Math.min(
        Math.abs(cueAt - c.start), Math.abs(cueAt - c.end)) <= edgeSec);
    }
    if (hit < 0) {
      const target = Math.max(0, Math.min(timelineDuration(), at));
      if (player.workspaceMode === 'browser' && window.api.browserCommand) {
        player.browserTime = target;
        browserCommand('seek', target).catch(() => {});
        renderBrowserCueAt(target);
      } else {
        const video = $('playerVideo');
        if (video) video.currentTime = target;
      }
      drawTimeline();
      return;
    }
    player.timeline.selected = hit;
    player.activeIdx = hit;
    const cue = player.cues[hit];
    const mode = Math.abs(cueAt - cue.start) <= edgeSec ? 'start'
      : Math.abs(cueAt - cue.end) <= edgeSec ? 'end' : 'move';
    player.timeline.drag = { index: hit, mode, x, start: cue.start, end: cue.end,
      pointerId: e.pointerId, center: (cue.start + cue.end) / 2 + player.offset, changed: false };
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
    if (!Number.isFinite(delta) || Math.abs(delta) < .001) return;
    if (!drag.changed) timelinePushUndo();
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
    if (drag.changed) timelineMarkDirty(`${drag.index + 1}. bloğun zamanlaması değiştirildi`);
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
  $('jobsHistoryBadge').textContent = String(historyCache.length);
  $('historySearchClear')?.classList.toggle('hidden', !q);
  if ($('historyClear')) $('historyClear').disabled = historyCache.length === 0;
  list.innerHTML = '';
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'jobs-empty';
    e.textContent = q ? 'Aramayla eşleşen iş yok. Aramayı temizleyip tüm kayıtları gösterebilirsiniz.' : 'Henüz tamamlanmış iş yok.';
    list.appendChild(e);
    syncJobsCenter();
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
      b.type = 'button';
      b.setAttribute('aria-label', title);
      return b;
    };
    if (h.ok && (h.files || []).length) {
      acts.appendChild(mk('play', 'İzle', 'Videoyu ve bu işin altyazısını oynatıcıda aç'));
      acts.appendChild(mk('folder', 'Klasör', 'Çıktı klasörünü aç'));
    }
    const remove = mk('del', '', 'Bu iş kaydını geçmişten kaldır (çıktı dosyaları korunur)');
    remove.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    acts.appendChild(remove);
    row.appendChild(main);
    row.appendChild(acts);
    list.appendChild(row);
  });
  syncJobsCenter();
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
    playbackPolicy: player.playbackPolicy,
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
      await browserCommand('speed', Math.max(.25, Math.min(4, Number(prefs.speed) || 1))).catch(() => null);
      if (!stillCurrent()) return;
    }
    if (prefs.volume !== undefined) {
      const target = Math.max(0, Math.min(1, Number(prefs.volume)));
      await browserCommand('volume-set', target).catch(() => null);
      if (!stillCurrent()) return;
    }
    if (prefs.muted !== undefined && !!prefs.muted !== player.browserMuted) {
      await browserCommand('mute').catch(() => null);
      if (!stillCurrent()) return;
    }
  } else {
    if (video && prefs.speed) video.playbackRate = Math.max(.25, Math.min(4, Number(prefs.speed) || 1));
    if (video && prefs.volume !== undefined) video.volume = Math.max(0, Math.min(1, Number(prefs.volume)));
    if (video && prefs.muted !== undefined) video.muted = !!prefs.muted;
  }
  if (prefs.speed) syncPlayerSpeedControl(prefs.speed);
  if (prefs.speed) player.learningBaseRate = Math.max(.25, Math.min(4, Number(prefs.speed) || 1));
  if ($('playerVolume') && prefs.volume !== undefined) {
    $('playerVolume').value = String(Math.round(Number(prefs.volume) * 100));
    syncVolumeFill();
  }
  if (prefs.viewMode) setViewMode(prefs.viewMode);
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
  if (prefs.playbackPolicy && $('playerPlaybackPolicy')) {
    $('playerPlaybackPolicy').value = prefs.playbackPolicy;
    $('playerPlaybackPolicy').dispatchEvent(new Event('change'));
  }
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
      makeWatchAction(item.completed ? 'Tamamlanmadı' : 'Tamamlandı', 'complete', item.key),
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
  refreshEmbeddedSubtitleTracks(filePath);
}

function resetEmbeddedSubtitleTracks() {
  player.embeddedSubtitleTracks = [];
  $('playerEmbeddedSubField')?.classList.add('hidden');
  if ($('playerEmbeddedSubSelect')) $('playerEmbeddedSubSelect').replaceChildren();
}

async function refreshEmbeddedSubtitleTracks(filePath) {
  resetEmbeddedSubtitleTracks();
  if (!window.api.probeTracks || !filePath) return;
  const generation = currentGeneration();
  const result = await window.api.probeTracks(filePath).catch(() => null);
  if (!result?.ok || staleGeneration(generation) || player.localPath !== filePath) return;
  player.embeddedSubtitleTracks = Array.isArray(result.subtitleTracks) ? result.subtitleTracks : [];
  if (!player.embeddedSubtitleTracks.length) return;
  const select = $('playerEmbeddedSubSelect');
  for (const track of player.embeddedSubtitleTracks) {
    const option = document.createElement('option');
    option.value = String(track.streamIndex);
    option.textContent = `${track.label || `Altyazı ${track.subtitleIndex + 1}`}${track.requiresOcr ? ' · görüntü tabanlı' : ''}`;
    option.disabled = !track.extractable;
    select.appendChild(option);
  }
  $('playerEmbeddedSubField')?.classList.remove('hidden');
  const textCount = player.embeddedSubtitleTracks.filter((track) => track.extractable).length;
  const bitmapCount = player.embeddedSubtitleTracks.filter((track) => track.requiresOcr).length;
  $('playerEmbeddedSubHint').textContent = textCount
    ? `${textCount} hazır metin izi bulundu${bitmapCount ? `; ${bitmapCount} görüntü izi metin olarak desteklenmiyor` : ''}.`
    : `${bitmapCount} görüntü tabanlı iz bulundu; bu izler metin olarak desteklenmiyor.`;
  $('playerEmbeddedSubLoad').disabled = !textCount;
}

async function loadSelectedEmbeddedSubtitle() {
  const select = $('playerEmbeddedSubSelect');
  const track = player.embeddedSubtitleTracks.find((item) => String(item.streamIndex) === select?.value);
  if (!track || !player.localPath) return;
  const button = $('playerEmbeddedSubLoad');
  if (button) button.disabled = true;
  const result = await window.api.extractSubtitleTrack(player.localPath, track).catch((error) => ({ ok: false, error: error.message }));
  if (button) button.disabled = false;
  if (!result?.ok) {
    logLine(`Gömülü altyazı çıkarılamadı: ${result?.error || 'bilinmeyen hata'}`, 'error');
    return;
  }
  addSubtitleOption(result.path, `Gömülü · ${result.label || track.label}`);
  $('playerSubSelect').value = result.path;
  await loadSubtitle(result.path);
  logLine('Gömülü altyazı çıkarıldı ve oynatıcıya yüklendi; Whisper çalıştırılmadı.', 'success');
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
        if (player.workspaceMode === 'browser' && window.api.browserCommand) {
          player.browserTime = Math.max(0, seconds);
          browserCommand('seek', player.browserTime).catch(() => {});
          renderBrowserCueAt(player.browserTime);
          showControls();
          return;
        }
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
  opts.chat = { question: q, history: (player.chatHistory || []).slice(-8), context: aiChatContext() };
  delete opts.youtube;
  if (!opts.translateApiKey) {
    aiChatAdd('ai', 'Çeviri/AI için API anahtarı gerekli: Gelişmiş ayarlar → Çeviri → API Key.', 'ai-msg-err');
    return;
  }

  aiChatAdd('user', q);
  const bekleyen = aiChatAdd('ai', 'Düşünüyor…', 'is-loading');
  $('aiChatText').value = '';
  autoGrowChatBox();

  state.running = true;
  state.aiJob = true;
  player.job = {
    running: true, mediaKey: player.mediaKey, kind: 'chat', bubble: bekleyen,
    chatQuestion: q,
  };

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
    b.tabIndex = on ? 0 : -1;
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
  const cue = player.cues[index];
  const material = [
    player.subPath || '', kind, index, word || '',
    cue ? `${cue.start}|${cue.end}|${cue.text}` : '',
    cue ? translationFor(cue) || '' : '',
  ].join('\u241f');
  // Dosya ayni yolda yeniden uretildiginde eski AI aciklamasi sessizce
  // kullanilmasin. FNV-1a burada guvenlik degil, kisa bir icerik parmak izidir.
  let hash = 2166136261;
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${player.subPath}|${kind}|${index}|${word || ''}|${(hash >>> 0).toString(36)}`;
}

function showBrowserErrorSurface(error) {
  const surface = $('browserErrorSurface');
  if (!surface) return;
  const visible = !!(error && error.message);
  surface.classList.toggle('hidden', !visible);
  if (!visible) return;
  const secure = error.kind === 'certificate';
  if ($('browserErrorKicker')) $('browserErrorKicker').textContent = secure ? 'Güvenlik bağlantısı engellendi' : 'Bağlantı kurulamadı';
  if ($('browserErrorTitle')) $('browserErrorTitle').textContent = secure ? 'Sertifika doğrulanamadı' : 'Sayfa açılamadı';
  if ($('browserErrorMessage')) $('browserErrorMessage').textContent = error.message;
  if ($('browserErrorCode')) $('browserErrorCode').textContent = error.code ? `Hata: ${error.code}` : '';
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
      player.holdingSpeed = false;
      v.playbackRate = prevRate;
      stage.classList.remove('holding');
      player.suppressClick = true;          // birakinca duraklatma tetiklenmesin
      setTimeout(() => { player.suppressClick = false; }, 120);
    }
  };

  player.cancelHoldSpeed = stop;
  window.addEventListener('blur', stop);
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !player.holdSpeed || player.editing) return;
    // Kontrol cubugu, altyazi ve panellerde degil; YALNIZCA videonun sag yarisi
    if (e.target.closest('.player-controls, .subtitle-overlay, .settings-drawer, .shortcut-help')) return;
    const r = stage.getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) return;
    if (v.paused) return;                   // duraklatilmisken anlamsiz
    timer = setTimeout(() => {
      active = true;
      player.holdingSpeed = true;
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
  if (!box) return;
  box.querySelectorAll('.ab-marker, .ab-range').forEach((e) => e.remove());
  if (!v || !duration) return;
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
  if (player.workspaceMode === 'browser') {
    const result = await window.api.captureBrowserPage?.(player.browserActiveTabId)
      .catch((error) => ({ ok: false, error: error.message }));
    if (result?.ok) logLine(`Tarayıcı ekran görüntüsü kaydedildi: ${result.path}`, 'success');
    else if (!result?.canceled) logLine(result?.error || 'Tarayıcı ekran görüntüsü alınamadı.', 'warn');
    return;
  }
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
  // A-B döngüsünün işaretleri aynı kapsayıcıda; yalnız bölüm işaretlerini yenile.
  box.querySelectorAll('.seek-marker').forEach((el) => el.remove());
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
  player.cancelHoldSpeed?.();
  player.lastT = undefined;
  player.holdingSpeed = false;
  closeTimeline();
  resetEmbeddedSubtitleTracks();
  clearTimeout(player.shadowResumeTimer);
  player.shadowResumeTimer = null;
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
  player.timeline.redo = [];
  player.cueEditUndo = [];
  player.cueEditRedo = [];
  updateCueEditHistoryButtons();
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
  syncSubtitleModeUi();
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
  renderAbMarkers(); // Medya değişince artık korunmaması gereken eski A-B işaretlerini temizle.
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
    // Kalıcı web çevirisi birincil kanala yüklenebilir. Bu durumda görsel
    // birincil overlay çeviri rolünü taşır; kaynak/çeviri anahtarlarını yine
    // doğru katmana bağla ve boş ikinci overlay'i göstermeye çalışma.
    const primaryTranslation = browserPrimaryIsTranslation();
    layer.classList.toggle('hide-src', !(primaryTranslation ? translation : source));
    layer.classList.toggle('hide-tr', !(primaryTranslation ? source : translation));
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
  const display = $('playerSubtitleDisplay');
  if (display) {
    const primaryTranslation = browserPrimaryIsTranslation();
    const hasSource = player.cues.length > 0 && !primaryTranslation;
    const hasTranslation = player.cues2.length > 0 || primaryTranslation;
    for (const option of display.options) {
      if (option.value === 'source') option.disabled = !hasSource;
      else if (option.value === 'translation') option.disabled = !hasTranslation;
      else if (option.value === 'both') option.disabled = !hasSource || !hasTranslation;
    }
    display.value = mode;
  }
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
  if (mode === 'source' && browserPrimaryIsTranslation()) mode = 'translation';
  if (mode === 'off') {
    setSubtitlesVisible(false);
  } else if (mode === 'source' || mode === 'translation') {
    applySubtitleTrackSelection(mode === 'source', mode === 'translation');
    player.lastSubtitleMode = mode;
    setSubtitlesVisible(true);
  } else if (mode === 'both') {
    applySubtitleTrackSelection(true, true);
    setSubtitlesVisible(true);
  } else {
    return;
  }
  setSubtitleModeMenuOpen(false);
  if (announce) {
    const text = mode === 'off' ? 'Altyazılar kapatıldı'
      : mode === 'source' ? 'Yalnızca kaynak altyazı'
      : mode === 'translation' ? 'Yalnızca çeviri'
      : 'Kaynak ve çeviri';
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
  // Devam eden sürüklemeyi eski medya anahtarı hâlâ geçerliyken tamamla;
  // kayıtlı cümle/kelime göçü yeni videonun deposuna yazılmamalı.
  closeTimeline();
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
    + cues.map((c) => `${fmt(c.start)} --> ${fmt(c.end)}${NL}${String(c.text || '').replace(/\r?\n[ \t]*\r?\n+/g, '\n')}${NL}`).join(NL);
}

// VTT: dosyayi yeniden URETMEK yerine yalnizca hedef cue'nun METIN satirlarini
// degistiririz. Yeniden uretim cue kimliklerini, satir ayarlarini (align,
// position, line, size), STYLE / REGION / NOTE bloklarini ve baslik
// metadatasini yok ederdi.
function replaceVttCueText(rawText, cue, newText) {
  const source = String(rawText);
  const NL = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const toSec = (t) => {
    const m = String(t).match(/(?:(\d+):)?(\d+):(\d{2})[.,](\d{1,3})/);
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
    const sourceStart = Number.isFinite(cue.sourceStart) ? cue.sourceStart : cue.start;
    const sourceEnd = Number.isFinite(cue.sourceEnd) ? cue.sourceEnd : cue.end;
    if (Math.abs(st - sourceStart) > 0.002 || Math.abs(en - sourceEnd) > 0.002) continue;
    // Metin satirlari: zaman satirindan sonra bos satira kadar
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '') j++;
    // Boş bir satır WebVTT'de cue sınırıdır. Düzenleme kutusundan gelen art
    // arda satır sonlarını tek satır sonuna indirerek metnin yeni bir sahte cue
    // oluşturmasını engelle; dosyanın özgün CRLF/LF biçimini de koru.
    const safeLines = String(newText).replace(/\r\n?/g, '\n')
      .replace(/\n[ \t]*\n+/g, '\n').split('\n');
    lines.splice(i + 1, j - (i + 1), ...safeLines);
    return lines.join(NL);
  }
  return null;
}

// ASS/SSA: dosyayi yeniden URETMEK yerine ilgili Dialogue satirinin METIN alanini
// degistiririz. Yeniden uretim stilleri, konumlari, efektleri ve konusmaci
// adlarini yok ederdi (eskiden .ass dosyasina duz SRT yaziliyordu).
function replaceAssDialogueText(rawText, lineNo, newText, lead, textIndex = 9, fieldCount = 10,
                                expectedStart = null, expectedEnd = null,
                                startIndex = 1, endIndex = 2) {
  const source = String(rawText);
  const NL = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  if (!(lineNo >= 0) || lineNo >= lines.length) return null;
  const line = lines[lineNo];
  if (!/^Dialogue\s*:/i.test(line)) return null;
  // Alan sırası [Events] Format satırından gelir. Text pratik ASS/SSA
  // sözleşmesindeki gibi son alan değilse virgüllü metni güvenle ayıramayız.
  const colon = line.indexOf(':');
  const parts = line.slice(colon + 1).split(',');
  if (!(textIndex >= 0) || textIndex >= parts.length || textIndex !== fieldCount - 1
      || parts.length < fieldCount) return null;
  // Satır numarası, dışarıdan gelen bir yeniden yükleme sonrasında başka bir
  // Dialogue satırını gösterebilir. Beklenen zamanlar uyuşmuyorsa yanlış satırı
  // değiştirmek yerine güvenli biçimde vazgeç.
  if (Number.isFinite(expectedStart) && Number.isFinite(expectedEnd)) {
    const toSec = (value) => {
      const match = String(value).trim().match(/(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/);
      return match ? (+match[1]) * 3600 + (+match[2]) * 60 + (+match[3])
        + (+match[4]) / (10 ** match[4].length) : null;
    };
    const start = toSec(parts[startIndex]);
    const end = toSec(parts[endIndex]);
    if (start === null || end === null || Math.abs(start - expectedStart) > 0.002
        || Math.abs(end - expectedEnd) > 0.002) return null;
  }
  // ASS, süslü parantez içini libass komutu sayar. Kullanıcının yazdığı gerçek
  // parantezleri görünür tam-genişlikli karşılıklarına çevirerek komut enjeksiyonu
  // ve metnin kaybolmasını önle.
  const safeText = String(newText).replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]*\n+/g, '\n').replace(/\{/g, '｛').replace(/\}/g, '｝');
  const body = (lead || '') + safeText.replace(/\n/g, '\\' + 'N');
  lines[lineNo] = line.slice(0, colon + 1) + parts.slice(0, textIndex).join(',') + ',' + body;
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
  const primaryTranslation = browserPrimaryIsTranslation();
  if (src) {
    const l = langFromPath(player.subPath);
    src.textContent = l ? `${primaryTranslation ? 'Çeviri' : 'Kaynak'} · ${l}` : (primaryTranslation ? 'Çeviri' : 'Kaynak');
    // Birincil kanala yüklenen kalıcı çeviri de bir dil rozeti göstermeli;
    // aksi halde iki rozet birden kaybolup hangi izin açık olduğu belirsizleşir.
    src.classList.toggle('hidden', !player.cues.length);
  }
  if (tr) {
    const l2 = langFromPath(player.sub2Path);
    tr.textContent = l2 ? `${primaryTranslation ? 'Kaynak' : 'Çeviri'} · ${l2}` : (primaryTranslation ? 'Kaynak' : 'Çeviri');
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
      player.cues2Raw = null;
      player.activeIdx2 = -1;
      player.sub2Path = '';
      const ov2 = $('subtitleOverlay2');
      if (ov2) ov2.textContent = '';
      if (player.workspaceMode === 'browser') {
        player.browserLoadedTrackId2 = '';
        const tab = browserTabState();
        if (tab) tab.browserLoadedTrackId2 = '';
      }
    } else {
      player.cues = [];
      player.cuesRaw = null;
      player.activeIdx = -1;
      player.subPath = '';
      player.subRaw = '';
      renderSeekMarkers(defaultMarkers());
      if ($('applyOffsetToFile')) $('applyOffsetToFile').classList.add('hidden');
      if (player.workspaceMode === 'browser') {
        player.browserLoadedTrackId = '';
        const tab = browserTabState();
        if (tab) tab.browserLoadedTrackId = '';
      }
      // Birincil web izi kaldırıldığında kalıcı çeviri kimliği boşta kalırsa
      // sonraki kaynak seçimi yanlışlıkla eski çeviri olarak sınıflanabilir.
      // İkinci kanalda gerçek bir iz varsa onu koru; yoksa sekme eşleşmesini
      // birlikte temizle.
      if (!player.cues2.length) {
        player.browserLoadedTrackId = '';
        player.browserTranslationTrackId = '';
        player.browserLiveTranslations = new Map();
        const tab = browserTabState();
        if (tab) {
          tab.browserLoadedTrackId = '';
          tab.browserTranslationTrackId = '';
          tab.browserLiveTranslations = [];
        }
      }
    }
    renderCueList($('cueSearch') ? $('cueSearch').value : '');
    updateSubtitleChips();
    updateMakeTransState();
    renderCue();
    if (secondary) setSubtitleMode(player.cues.length ? 'source' : 'off', false);
    else setSubtitleMode(player.cues2.length ? 'translation' : 'off', false);
    return;
  }
  const gen = currentGeneration();
  const previousPrimaryPath = player.subPath;
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
    const browserTrack = player.workspaceMode === 'browser'
      ? player.browserTracks.find((track) => track.path === path) : null;
    if (browserTrack) {
      player.browserLoadedTrackId2 = browserTrack.id;
      const tab = browserTabState();
      if (tab) tab.browserLoadedTrackId2 = browserTrack.id;
      if ($('browserTrackSelect2')) $('browserTrackSelect2').value = browserTrack.id;
    } else if (player.workspaceMode === 'browser') {
      player.browserLoadedTrackId2 = '';
      const tab = browserTabState();
      if (tab) tab.browserLoadedTrackId2 = '';
    }
    renderCueList($('cueSearch') ? $('cueSearch').value : '');   // kartlara ceviri satiri gelsin
  } else {
    if (previousPrimaryPath && previousPrimaryPath !== path) {
      player.cueEditUndo = [];
      player.cueEditRedo = [];
      updateCueEditHistoryButtons();
    }
    player.cuesRaw = cues;
    player.cues = player.mergeCont ? mergeCueContinuation(cues) : cues;
    player.activeIdx = -1;
    player.subPath = path;
    player.subRaw = res.text;
    player.subFormat = /\.(ass|ssa)$/i.test(path) ? 'ass'
                     : /\.vtt$/i.test(path) ? 'vtt' : 'srt';
    const browserTrack = player.workspaceMode === 'browser'
      ? player.browserTracks.find((track) => track.path === path) : null;
    const previousTranslation = player.browserTracks.find((track) =>
      track.id === player.browserTranslationTrackId && track.role === 'translation');
    if (player.workspaceMode === 'browser') {
      player.browserLoadedTrackId = browserTrack?.id || '';
      const tab = browserTabState();
      if (tab) tab.browserLoadedTrackId = browserTrack?.id || '';
      if (browserTrack && $('browserTrackSelect')) $('browserTrackSelect').value = browserTrack.id;
    }
    if (browserTrack?.role === 'translation') {
      player.browserLoadedTrackId = browserTrack.id;
      player.browserTranslationTrackId = browserTrack.id;
      player.browserLiveTranslations = new Map();
      player.cues2 = [];
      player.cues2Raw = null;
      player.sub2Path = '';
      if ($('browserTrackSelect2')) $('browserTrackSelect2').value = '';
      const tab = browserTabState();
      if (tab) {
        tab.browserLoadedTrackId = browserTrack.id;
        tab.browserLoadedTrackId2 = '';
        tab.browserTranslationTrackId = browserTrack.id;
        tab.browserLiveTranslations = [];
        tab.cues2 = [];
        tab.sub2Path = '';
      }
      // Ayarlar panelinden çevri izini tek başına seçince mevcut görünüm
      // modu kaynakta kalıp boş bir katman göstermesin.
      setSubtitleMode('translation', false);
    } else if (previousTranslation && browserTrack?.id !== previousTranslation.id) {
      player.browserTranslationTrackId = '';
      player.browserLiveTranslations = new Map();
      const tab = browserTabState();
      if (tab) {
        tab.browserTranslationTrackId = '';
        tab.browserLiveTranslations = [];
      }
      // Kaynak izine geri dönüldüğünde, artık mevcut olmayan çeviri modu
      // yüzünden ekranın boş kalmasını önle.
      setSubtitleMode('source', false);
    }
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
  closeBrowserFind(false);
  setBrowserDownloadsOpen(false);
  player.cancelHoldSpeed?.();
  const video = $('playerVideo');
  player.seekDragging = false;
  clearTimeout(player.shadowResumeTimer);
  player.shadowResumeTimer = null;
  clearTimeout(_liveCueRenderTimer);
  _liveCueRenderTimer = null;
  // Kapanirken suren klasor/probe istekleri katmani yeniden acmasin.
  player.openIntent++;
  player.probeRequestSeq++;
  player.pendingAutoOpen = null;
  player.pendingLibrarySeek = null;
  player.pendingSubs = null;
  stopAmbient();
  if (video) video.pause();
  flushWatchState(false, true);
  destroyHls();
  if (window.api.hideBrowser) window.api.hideBrowser().catch(() => {});
  $('playerLayer').classList.add('hidden');
}

function setShortcutHelpOpen(open) {
  const panel = $('shortcutHelp');
  if (!panel) return;
  if (open) {
    player.helpReturnFocus = document.activeElement;
    panel.classList.remove('hidden');
    $('shortcutHelpClose')?.focus();
  } else {
    panel.classList.add('hidden');
    if (player.helpReturnFocus?.isConnected) player.helpReturnFocus.focus();
  }
}

document.addEventListener('keydown', event => {
  const panel = $('shortcutHelp');
  if (!panel || panel.classList.contains('hidden')) return;
  event.stopImmediatePropagation();
  if (event.key === 'Escape') { event.preventDefault(); setShortcutHelpOpen(false); }
  if (event.key === 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); $('shortcutHelpClose')?.focus(); }
}, true);

// Yalnız kullanıcı eylemleri shadowing'in bekleyen otomatik devamını iptal eder.
document.addEventListener('keydown', event => {
  if ([' ', 'e', 'E'].includes(event.key)) {
    clearTimeout(player.shadowResumeTimer); player.shadowResumeTimer = null;
  }
}, true);
document.addEventListener('pointerdown', event => {
  if (event.target.closest?.('#playPause, #playerVideo, #subtitleEditBox, #playerSeek')) {
    clearTimeout(player.shadowResumeTimer); player.shadowResumeTimer = null;
  }
}, true);

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
    $('helpBtn').addEventListener('click', () => setShortcutHelpOpen($('shortcutHelp').classList.contains('hidden')));
  }
  if ($('shortcutHelp')) {
    $('shortcutHelp').addEventListener('click', () => setShortcutHelpOpen(false));
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
const SETTINGS_PAGE_TITLES = {
  source: 'Kaynak ve altyazı ayarları',
  'browser-view': 'Görünüm ve manga',
  'browser-diagnostics': 'Yakalama ayrıntıları',
};

function initializeSettingsPages() {
  const view = $('browserViewSettings');
  const diagnostics = $('browserDiagnosticsPanel');
  if (view && $('settingsPageBrowserView') && view.parentElement !== $('settingsPageBrowserView')) {
    view.open = true;
    $('settingsPageBrowserView').appendChild(view);
  }
  if (diagnostics && $('settingsPageBrowserDiagnostics')
      && diagnostics.parentElement !== $('settingsPageBrowserDiagnostics')) {
    diagnostics.classList.remove('hidden');
    $('settingsPageBrowserDiagnostics').appendChild(diagnostics);
  }
  setSettingsPage(player.settingsPage || 'source');
}

function setSettingsPage(page) {
  const next = SETTINGS_PAGE_TITLES[page] ? page : 'source';
  player.settingsPage = next;
  $$('[data-settings-page-panel]').forEach((panel) => {
    const active = panel.dataset.settingsPagePanel === next;
    panel.classList.toggle('hidden', !active);
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  $$('.drawer-page-tab[data-settings-page]').forEach((button) => {
    const active = button.dataset.settingsPage === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  if ($('settingsDrawerTitle')) $('settingsDrawerTitle').textContent = SETTINGS_PAGE_TITLES[next];
}

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
  const viewOpen = open && player.settingsPage === 'browser-view';
  const diagnosticsOpen = open && player.settingsPage === 'browser-diagnostics';
  for (const id of ['browserViewSettingsToggle']) {
    const button = $(id);
    if (button) {
      button.classList.toggle('active', viewOpen);
      button.setAttribute('aria-expanded', viewOpen ? 'true' : 'false');
    }
  }
  for (const id of ['browserDiagnosticsToggle', 'browserDiagnosticsToolbar']) {
    const button = $(id);
    if (button) {
      button.classList.toggle('active', diagnosticsOpen);
      button.setAttribute('aria-expanded', diagnosticsOpen ? 'true' : 'false');
    }
  }
}

function toggleSettingsPage(page) {
  if (drawerIsOpen() && player.settingsPage === page) {
    setSettingsDrawer(false);
    return;
  }
  setSettingsPage(page);
  setSettingsDrawer(true);
}

initializeSettingsPages();

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
  const hedefteyiz = player.settingsPage === 'source'
    && (!tabName || (tab && tab.classList.contains('active')));
  if (drawerIsOpen() && hedefteyiz) { setSettingsDrawer(false); return; }
  setSettingsPage('source');
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
if ($('browserViewSettingsToggle')) {
  $('browserViewSettingsToggle').addEventListener('click', () => toggleSettingsPage('browser-view'));
}
if ($('browserDiagnosticsToolbar')) {
  $('browserDiagnosticsToolbar').addEventListener('click', () => {
    toggleSettingsPage('browser-diagnostics');
    if (player.browserDiagnostics) renderBrowserDiagnostics(player.browserDiagnostics);
  });
}
$$('.drawer-page-tab[data-settings-page]').forEach((button) => {
  button.addEventListener('click', () => {
    setSettingsPage(button.dataset.settingsPage);
    setSettingsDrawer(true);
    if (button.dataset.settingsPage === 'browser-diagnostics' && player.browserDiagnostics) {
      renderBrowserDiagnostics(player.browserDiagnostics);
    }
  });
});
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
if ($('cueNoteBtn')) $('cueNoteBtn').addEventListener('click', saveCueNote);
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
  const job = player.job;
  state.cancelled = true;
  job.cancelled = true;
  job.running = false;
  job.awaitingExit = true;
  if (job.bubble) {
    job.bubble.classList.remove('is-loading');
    job.bubble.classList.add('ai-msg-err');
    job.bubble.textContent = 'İptal edildi.';
  } else if (job.kind === 'explain') {
    showAiAnswer(job.explainTitle || 'AI', 'İptal edildi.');
  }
  state.aiJob = false;
  const cancelResult = await window.api.cancelTranscribe();
  if (!cancelResult || !cancelResult.ok) {
    job.awaitingExit = false;
    job.cancelled = false;
    state.cancelled = false;
    if (player.job === job) player.job = null;
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
      const confirmed = await openAppDialog({
        title: 'İş kaydını kaldır',
        description: `“${h.title || 'İsimsiz iş'}” geçmişten kaldırılacak. Üretilmiş altyazı dosyaları silinmez.`,
        confirmLabel: 'Geçmişten kaldır',
      });
      if (!confirmed) return;
      await window.api.removeHistory(id);
      refreshHistory();
    }
  });
}
renderQueue();
refreshHistory();
let historySearchTimer = null;
if ($('historySearch')) $('historySearch').addEventListener('input', e => {
  clearTimeout(historySearchTimer);
  if (!e.isComposing) historySearchTimer = setTimeout(renderHistory, 120);
});
if ($('historySearchClear')) {
  $('historySearchClear').addEventListener('click', () => {
    $('historySearch').value = '';
    renderHistory();
    $('historySearch').focus();
  });
}
if ($('historyClear')) {
  $('historyClear').addEventListener('click', async () => {
    if (!historyCache.length) return;
    const confirmed = await openAppDialog({
      title: 'İş geçmişini temizle',
      description: `${historyCache.length} iş kaydı geçmişten kaldırılacak. Çıktı dosyaları korunur; bu liste geri alınamaz.`,
      confirmLabel: 'Geçmişi temizle',
    });
    if (!confirmed) return;
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
    const name = await openAppDialog({
      title: 'Koleksiyonları düzenle',
      description: 'Birden çok koleksiyon adını virgülle ayırın. Alanı boş bırakırsanız video tüm koleksiyonlardan çıkarılır.',
      confirmLabel: 'Koleksiyonları kaydet',
      intent: 'primary',
      inputLabel: 'Koleksiyon adları',
      inputValue: (item.collections || []).join(', '),
    });
    if (name === false) return;
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
    const confirmed = await openAppDialog({
      title: 'Kütüphane kaydını kaldır',
      description: `“${item.title || 'Bu video'}” izleme kütüphanesinden kaldırılacak. Video ve altyazı dosyaları silinmez.`,
      confirmLabel: 'Kütüphaneden kaldır',
    });
    if (!confirmed) return;
    if (player.mediaKey === item.key) player.watchRemovedKey = item.key;
    const removed = await window.api.removeWatchItem(item.key).catch(error => ({ ok: false, error: error.message }));
    if (!removed?.ok) {
      player.watchRemovedKey = '';
      logLine(`Kütüphane kaydı kaldırılamadı: ${removed?.error || 'bilinmeyen hata'}`, 'error');
      return;
    }
    if (removed.keptAnnotations) logLine('Kayıt kaldırıldı; notlar ve kelime kartları korundu.', 'info');
    refreshWatchLibrary();
  }
}

refreshWatchLibrary();
if ($('playerLibraryPanel')) $('playerLibraryPanel').addEventListener('click', handleWatchLibraryAction);
if ($('playerLibraryFilter')) $('playerLibraryFilter').addEventListener('change', renderPlayerLibrary);
if ($('playerLibrarySearch')) {
  $('playerLibrarySearch').addEventListener('input', (e) => {
    $('playerLibrarySearchClear')?.classList.toggle('hidden', !e.target.value);
    if (e.isComposing) return;
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
  $('playerLibrarySearch').addEventListener('compositionend', (e) => {
    e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
if ($('playerLibrarySearchClear')) {
  $('playerLibrarySearchClear').addEventListener('click', () => {
    clearTimeout(playerLibrarySearchTimer);
    player.playerLibrarySearchSeq++;
    $('playerLibrarySearch').value = '';
    playerLibraryResults = watchLibraryCache;
    renderPlayerLibrary();
    $('playerLibrarySearchClear').classList.add('hidden');
    $('playerLibrarySearch').focus();
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
    if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) { e.preventDefault(); aiChatSend(e.target.value); }
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
    if (player.job?.running && player.job.kind === 'chat') {
      aiChatAdd('ai', 'Yanıt hazırlanırken sohbet temizlenemez. Önce işlemi iptal edin veya yanıtın bitmesini bekleyin.', 'ai-msg-err');
      return;
    }
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
      if (!player.seekDragging) seek.value = String((video.currentTime / video.duration) * 1000);
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
    const fraction = Number(e.target.value) / 1000;
    if (Number.isFinite(video.duration) && video.duration > 0 && Number.isFinite(fraction)) {
      video.currentTime = Math.max(0, Math.min(1, fraction)) * video.duration;
    }
    updateSeekVisuals();
  });
  $('playerSeek').addEventListener('pointerdown', () => { player.seekDragging = true; });
  for (const type of ['pointerup', 'pointercancel', 'blur']) {
    $('playerSeek').addEventListener(type, () => { player.seekDragging = false; });
  }
  video.addEventListener('seeking', () => { player.lastT = undefined; });
  video.addEventListener('seeked', () => { player.lastT = undefined; });
  for (const type of ['play', 'pause', 'emptied']) video.addEventListener(type, () => {
    const button = $('playPause');
    if (!button) return;
    button.innerHTML = video.paused
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    button.setAttribute('aria-label', video.paused ? 'Videoyu oynat' : 'Videoyu duraklat');
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
        const result = await browserCommand('speed', rate).catch(() => null);
        if (!result || !result.ok) {
          e.target.value = String(player.browserRate || 1);
          osd('Web video hızı değiştirilemedi');
          return;
        }
        player.browserRate = Number(result.media && result.media.playbackRate) || rate;
      } else {
        video.playbackRate = rate;
      }
      player.learningBaseRate = rate;
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
    $('subtitleModeMenu').addEventListener('keydown', e => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const items = [...e.currentTarget.querySelectorAll('button:not(:disabled)')];
      if (!items.length) return;
      e.preventDefault(); e.stopPropagation();
      const current = items.indexOf(document.activeElement);
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
        : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[index].focus();
    });
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
        browserCommand('seek', saved.t).then(() => browserCommand('play')).catch(() => {});
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
    if (player.workspaceMode === 'browser') {
      browserCommand('fullscreen').then((result) => {
        if (!result?.ok) setBrowserSignal(result?.error || 'Web videosu tam ekrana geçirilemedi.', false);
      }).catch(() => {});
      return;
    }
    const stage = $('playerStage');
    if (!document.fullscreenElement) stage.requestFullscreen();
    else document.exitFullscreen();
  });
}

// Klavye: oynatıcı açıkken boşluk/ok/F/Esc
document.addEventListener('keydown', (e) => {
  const layer = $('playerLayer');
  if (!layer || layer.classList.contains('hidden')) return;
  const modifier = e.ctrlKey || e.metaKey;
  if (player.workspaceMode === 'browser' && modifier && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'f') { e.preventDefault(); openBrowserFind(); return; }
    if (key === 'l') {
      e.preventDefault();
      $('browserAddress')?.focus();
      $('browserAddress')?.select();
      return;
    }
    if (key === 't') { e.preventDefault(); createBrowserTab(); return; }
    if (key === 'w') { e.preventDefault(); closeBrowserTab(player.browserActiveTabId); return; }
    if (e.key === 'Tab') {
      const tabs = player.browserTabs || [];
      if (tabs.length > 1) {
        e.preventDefault();
        const current = Math.max(0, tabs.findIndex((tab) => tab.id === player.browserActiveTabId));
        const direction = e.shiftKey ? -1 : 1;
        const next = tabs[(current + direction + tabs.length) % tabs.length];
        activateBrowserTab(next.id);
      }
      return;
    }
    const zoomCommand = key === '0' ? 'zoom-reset'
      : (key === '+' || key === '=' ? 'zoom-in' : (key === '-' || key === '_' ? 'zoom-out' : ''));
    if (zoomCommand) {
      e.preventDefault();
      browserCommand(zoomCommand).then((result) => {
        if (result?.ok) osd(`Sayfa yakınlaştırma %${Math.round((Number(result.zoom) || 1) * 100)}`);
      }).catch(() => {});
      return;
    }
  }
  const video = $('playerVideo');
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button'
      || tag === 'a' || tag === 'summary' || e.target.isContentEditable
      || e.target.closest?.('[contenteditable="true"]')) return;
  if (player.editing) return;
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); openCueEditor(); return; }
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); stepCue(-1); return; }
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); stepCue(1); return; }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replayCue(); return; }
  if (e.key === 'c' || e.key === 'C') { e.preventDefault(); copyCue(); return; }
  if (e.key === 'k' || e.key === 'K') { e.preventDefault(); toggleCueSaved(); return; }
  if ((e.key === 'w' || e.key === 'W') && player.selectedWord) { e.preventDefault(); toggleWordSaved(); return; }
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    e.preventDefault(); setShortcutHelpOpen($('shortcutHelp').classList.contains('hidden')); return;
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
    else if (e.key === 'f' || e.key === 'F') command = 'fullscreen';
    else if (e.key === 'p' || e.key === 'P') command = 'pip';
    if (command) {
      e.preventDefault();
      browserCommand(command, value).then((result) => {
        if (!result?.ok) return;
        const media = result.media || {};
        if (command === 'seek-relative') osd(`${value > 0 ? '+' : ''}${value} sn`);
        else if (command === 'volume-relative') osd(`Ses %${Math.round((Number(media.volume) || 0) * 100)}`);
        else if (command === 'mute') osd(media.muted ? 'Ses kapalı' : 'Ses açık');
        else if (command === 'play-pause') osd(media.paused ? 'Duraklatıldı' : 'Oynatılıyor');
        else if (command === 'fullscreen') osd('Video tam ekran');
        else if (command === 'pip') osd('Resim içinde resim');
      }).catch(() => {});
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      const subMenu = $('subtitleModeMenu');
      const places = $('browserPlacesPanel');
      const downloads = $('browserDownloadsPanel');
      if (downloads && !downloads.classList.contains('hidden')) setBrowserDownloadsOpen(false);
      else if (places && !places.classList.contains('hidden')) setBrowserPlacesOpen(false);
      else if (subMenu && !subMenu.classList.contains('hidden')) setSubtitleModeMenuOpen(false);
      else if (player.selectedWord) hideWordInspector();
      else if (!$('shortcutHelp')?.classList.contains('hidden')) setShortcutHelpOpen(false);
      else if (!$('settingsDrawer')?.classList.contains('hidden')) setSettingsDrawer(false);
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
    if (help && !help.classList.contains('hidden')) { setShortcutHelpOpen(false); return; }
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
  const result = await browserCommand('frame-step', Number(dir || 0) / 25).catch(() => null);
  if (!result || !result.ok) {
    osd('Web videoda kare adımı uygulanamadı', 900);
    return;
  }
  if (result.media) {
    const currentTime = Number(result.media.currentTime);
    if (Number.isFinite(currentTime)) player.browserTime = Math.max(0, currentTime);
  }
  osd(dir > 0 ? 'Kare ileri' : 'Kare geri', 600);
  showControls();
}

async function nudgeSpeed(dir) {
  const sel = $('playerSpeed');
  const video = $('playerVideo');
  if (!sel || !video) return;
  const target = steppedPlaybackRate(sel.options, sel.value, dir);
  if (player.workspaceMode === 'browser' && window.api.browserCommand) {
    const result = await browserCommand('speed', target).catch(() => null);
    if (!result || !result.ok) {
      osd('Web video hızı değiştirilemedi', 900);
      return;
    }
    player.browserRate = Number(result.media && result.media.playbackRate) || target;
  } else {
    video.playbackRate = target;
  }
  player.learningBaseRate = target;
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
function setPlayerSourcePanel(target) {
  $$('.tab[data-ptab]').forEach((tab) => {
    const active = tab.dataset.ptab === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
  });
  $$('.ptab-content').forEach((content) => {
    content.classList.toggle('hidden', content.dataset.pcontent !== target);
  });
}

$$('.tab[data-ptab]').forEach((tab) => {
  tab.addEventListener('click', () => setPlayerSourcePanel(tab.dataset.ptab));
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
if ($('playerEmbeddedSubLoad')) {
  $('playerEmbeddedSubLoad').addEventListener('click', loadSelectedEmbeddedSubtitle);
}

if ($('playerSubSelect')) {
  $('playerSubSelect').addEventListener('change', (e) => loadSubtitle(e.target.value));
}
if ($('playerSubSelect2')) {
  $('playerSubSelect2').addEventListener('change', (e) => loadSubtitle(e.target.value, true));
}
if ($('playerSubtitleDisplay')) {
  $('playerSubtitleDisplay').addEventListener('change', (e) => setSubtitleMode(e.target.value));
}

// ---- izlerken düzeltme ----
function openCueEditor() {
  clearTimeout(player.shadowResumeTimer);
  player.shadowResumeTimer = null;
  if (player.activeIdx < 0 || player.activeIdx >= player.cues.length || !player.cues.length) {
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
  if (player.workspaceMode === 'browser') browserCommand('pause').catch(() => {});
  else $('playerVideo').pause();
  $('subtitleEdit').classList.remove('hidden');
  $('subtitleEditBox').value = cue.text;
  $('subtitleEditHint').textContent =
    `${pSecToTime(cue.start)} – ${pSecToTime(cue.end)} · ${player.subPath.split(/[\\/]/).pop()}`;
  $('subtitleEditBox').focus();
  updateCueEditHistoryButtons();
  $('subtitleEditBox').select();
}

function closeCueEditor() {
  player.editing = false;
  $('playerStage').classList.remove('editing');
  $('subtitleEdit').classList.add('hidden');
  renderCue();
}

function updateCueEditHistoryButtons() {
  if ($('subtitleEditUndo')) $('subtitleEditUndo').disabled = !player.cueEditUndo.length;
  if ($('subtitleEditRedo')) $('subtitleEditRedo').disabled = !player.cueEditRedo.length;
}

async function applyCueEditHistory(direction) {
  const source = direction === 'undo' ? player.cueEditUndo : player.cueEditRedo;
  const target = direction === 'undo' ? player.cueEditRedo : player.cueEditUndo;
  const entry = source[source.length - 1];
  if (!entry || entry.path !== player.subPath || entry.mediaKey !== player.mediaKey) return;
  const payload = direction === 'undo' ? entry.before : entry.after;
  const generation = currentGeneration();
  const oldCue = player.cues[entry.index] ? { ...player.cues[entry.index] } : null;
  const result = await window.api.writeSubtitle(entry.path, payload, {
    action: direction, cueIndex: entry.index, start: entry.start,
    before: direction === 'undo' ? entry.afterText : entry.beforeText,
    after: direction === 'undo' ? entry.beforeText : entry.afterText,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok) {
    logLine(`Düzenleme ${direction === 'undo' ? 'geri alınamadı' : 'yinelenemedi'}: ${result?.error || 'bilinmeyen hata'}`, 'error');
    return;
  }
  if (staleGeneration(generation) || entry.path !== player.subPath || entry.mediaKey !== player.mediaKey) return;
  source.pop();
  target.push(entry);
  if (result.warning) logLine(result.warning, 'warn');
  await loadSubtitle(entry.path, false, { silent: true, preserveInspector: true });
  if (staleGeneration(generation) || entry.path !== player.subPath || entry.mediaKey !== player.mediaKey) return;
  if (oldCue && player.cues[entry.index]) migrateSavedCueAssociation(oldCue, player.cues[entry.index]);
  player.activeIdx = Math.max(0, Math.min(player.cues.length - 1, entry.index));
  updateCueEditHistoryButtons();
  renderCueList($('cueSearch')?.value || '');
  renderCue();
  osd(direction === 'undo' ? 'Düzenleme geri alındı' : 'Düzenleme yinelendi');
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
  const savedSignature = cueSignature(cue);
  const wasSaved = player.savedCues.includes(savedSignature);
  const targetPath = player.subPath;
  const targetKey = player.mediaKey;
  const targetGen = currentGeneration();
  let payload;
  if (player.subFormat === 'ass') {
    payload = replaceAssDialogueText(player.subRaw, cue.line, text, cue.assLead,
      cue.assTextIndex, cue.assFieldCount,
      Number.isFinite(cue.sourceStart) ? cue.sourceStart : cue.start,
      Number.isFinite(cue.sourceEnd) ? cue.sourceEnd : cue.end,
      cue.assStartIndex, cue.assEndIndex);
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
    if (player.mergeCont && player.cuesRaw && player.cuesRaw.length !== player.cues.length) {
      logLine('Birleştirilmiş görünümde düzenleme kaynak bloklarını belirsizleştirir. Önce “Cümleleri birleştir” seçeneğini kapatın.', 'warn');
      return;
    }
    // SRT'de korunacak metadata yok; blok listesinden yeniden uretmek guvenli
    const draft = player.cues.map((c, k) => (k === i ? { ...c, text } : c));
    payload = cuesToSrt(draft);
  }

  let res;
  try { res = await window.api.writeSubtitle(targetPath, payload, {
    action: 'edit', cueIndex: i, start: cue.start, before: cue.text, after: text,
  }); }
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
  const beforeCue = { ...cue };
  if (res.warning) logLine(res.warning, 'warn');
  cue.text = text;                            // ANCAK yazma basarili olduysa
  migrateSavedCueAssociation(beforeCue, cue);
  player.cueEditUndo.push({
    path: targetPath, mediaKey: targetKey, index: i, start: cue.start,
    before: player.subRaw, after: payload, beforeText: savedSignature.split('|').slice(2).join('|'),
    afterText: text, at: Date.now(),
  });
  player.cueEditUndo = player.cueEditUndo.slice(-100);
  player.cueEditRedo = [];
  if (wasSaved) {
    const at = player.savedCues.indexOf(savedSignature);
    if (at >= 0) player.savedCues[at] = cueSignature(cue);
    persistSavedCues();
  }
  player.subRaw = payload;
  updateCueEditHistoryButtons();
  logLine(`Altyazı güncellendi (blok ${i + 1}) → ${player.subPath.split(/[\\/]/).pop()}`, 'success');
  renderCueList($('cueSearch') ? $('cueSearch').value : '');
  closeCueEditor();
}

if ($('cueSearch')) {
  // Arama yalniz listeyi degil zaman cubugunu da isaretler: "Kombai" yazinca
  // filmde nerelerde geciyorsa cubukta gorunur, tiklayip atlarsin.
  $('cueSearch').addEventListener('input', (e) => {
    if (e.isComposing) return;
    const q = e.target.value.trim().toLocaleLowerCase('tr');
    renderCueList(e.target.value);
    if (q) {
      const translations = translationsForCues(player.cues, player.cues2);
      renderSeekMarkers(player.cues.filter((c, index) =>
        c.text.toLocaleLowerCase('tr').includes(q)
          || translations[index].toLocaleLowerCase('tr').includes(q))
        .map((c) => c.start + player.offset));
    } else renderSeekMarkers(defaultMarkers());
  });
}
if ($('autoPauseCue')) {
  $('autoPauseCue').addEventListener('change', (e) => {
    player.autoPause = e.target.checked;
    player.pausedAt = -1;
  });
}
if ($('playerPlaybackPolicy')) {
  $('playerPlaybackPolicy').addEventListener('change', (event) => {
    clearTimeout(player.shadowResumeTimer);
    player.shadowResumeTimer = null;
    player.playbackPolicy = event.target.value || 'normal';
    player.learningBaseRate = Number($('playerSpeed')?.value)
      || (player.workspaceMode === 'browser' ? player.browserRate : Number($('playerVideo')?.playbackRate)) || 1;
    if (player.playbackPolicy === 'normal') {
      if (player.workspaceMode === 'browser') browserCommand('speed', player.learningBaseRate).catch(() => {});
      else if ($('playerVideo')) $('playerVideo').playbackRate = player.learningBaseRate;
    }
    scheduleSave();
  });
}
if ($('subtitleOverlay')) {
  $('subtitleOverlay').addEventListener('dblclick', openCueEditor);
}
if ($('subtitleEditSave')) $('subtitleEditSave').addEventListener('click', saveCueEdit);
if ($('subtitleEditCancel')) $('subtitleEditCancel').addEventListener('click', closeCueEditor);
if ($('subtitleEditUndo')) $('subtitleEditUndo').addEventListener('click', () => applyCueEditHistory('undo'));
if ($('subtitleEditRedo')) $('subtitleEditRedo').addEventListener('click', () => applyCueEditHistory('redo'));
if ($('subtitleEditBox')) {
  $('subtitleEditBox').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeCueEditor(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveCueEdit(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault(); applyCueEditHistory('undo');
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault(); applyCueEditHistory('redo');
    }
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

// Tüm uygulama içi gerçek sekmeler aynı WAI-ARIA klavye modelini kullanır.
// Paneller yerel ve anlık olduğu için okla odaklama otomatik etkinleştirir.
function setupRovingTablists() {
  $$('[role="tablist"]').forEach((tablist) => {
    if (tablist.dataset.keyboardReady === 'true') return;
    tablist.dataset.keyboardReady = 'true';
    tablist.addEventListener('keydown', (event) => {
      if (event.defaultPrevented) return; // Özel sekme işleyicisi zaten etkinleştirdi.
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...tablist.querySelectorAll('[role="tab"]:not(:disabled)')];
      if (!tabs.length) return;
      const current = Math.max(0, tabs.indexOf(document.activeElement));
      let next = current;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else next = (current - 1 + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  });
}

setupRovingTablists();
// PLAYER_END
