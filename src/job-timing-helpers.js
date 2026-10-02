'use strict';
// 50'lik kuyruk batch 7 (maddeler 31–35) — saf mantık: aşama ETA öğrenimi,
// donanım rehberi, ağ bütçesi çözümlemesi, önbellek satırları, kaynak
// zaman çizelgesi. Pencere/DOM/IPC bağımsız; renderer'da <script> ile
// globalThis üzerinden, testlerde require ile kullanılır.

// ---------- Madde 31: aşama bazlı kalan süre ----------

const STAGE_ORDER = ['download', 'extract', 'load_model', 'transcribe', 'llm_postprocess', 'diarize', 'write'];
const STAGE_HISTORY_CAP = 8;

// Geçmiş işlerden ölçülen aşama süreleri: { stage: [seconds...] }.
// En son ölçüm sonda durur; liste STAGE_HISTORY_CAP ile sınırlı.
function recordStageDuration(history, stage, seconds) {
  const out = { ...(history && typeof history === 'object' ? history : {}) };
  const key = String(stage || '');
  const value = Number(seconds);
  if (!key || !Number.isFinite(value) || value <= 0) return out;
  const list = Array.isArray(out[key]) ? out[key].filter(Number.isFinite) : [];
  out[key] = [...list, value].slice(-STAGE_HISTORY_CAP);
  return out;
}

// Geçmiş medyan: tek örnekte de döner (geçmişin en iyi tahmini odur).
function stageMedian(history, stage) {
  const list = Array.isArray(history?.[stage]) ? history[stage].filter((v) => Number.isFinite(v) && v > 0) : [];
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Aşama ETA tahmini. Öncelik: canlı ölçüm (ctx.rate → hız; ctx.done/total
// → oran), yoksa geçmiş medyan. Hiç veri yoksa null döner — bilinmeyen
// aşamaya uydurma süre yazılmaz.
// ctx: { percentDone, elapsedSec, done, total, history }
function estimateStageEta(stage, ctx = {}) {
  const elapsed = Number(ctx.elapsedSec);
  const safeElapsed = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;

  const percent = Number(ctx.percentDone);
  if (Number.isFinite(percent) && percent > 0.5 && percent < 100 && safeElapsed > 0) {
    const rate = percent / safeElapsed; // %/sn
    if (rate > 0) return { seconds: Math.max(0, (100 - percent) / rate), basis: 'measured' };
  }

  const done = Number(ctx.done);
  const total = Number(ctx.total);
  if (Number.isFinite(done) && Number.isFinite(total) && done > 0 && total > done && safeElapsed > 0) {
    const rate = done / safeElapsed; // adet/sn
    if (rate > 0) return { seconds: Math.max(0, (total - done) / rate), basis: 'measured' };
  }

  const median = stageMedian(ctx.history, stage);
  if (median != null) {
    // Geçmiş süreden kalanı verir; geçmiş süreyi aşan aşama "biraz daha"
    // anlamında küçük pozitif bir artık döner (0'a kilitlenmez).
    return { seconds: Math.max(0, median - safeElapsed), basis: 'history' };
  }
  return null;
}

const STAGE_LABEL = {
  download: { tr: 'İndirme', en: 'Download' },
  extract: { tr: 'Ses ayırma', en: 'Audio extraction' },
  load_model: { tr: 'Model yükleme', en: 'Model load' },
  transcribe: { tr: 'Transkripsiyon', en: 'Transcription' },
  llm_postprocess: { tr: 'Çeviri/LLM', en: 'Translation/LLM' },
  translate: { tr: 'Çeviri', en: 'Translation' },
  diarize: { tr: 'Konuşmacı tanıma', en: 'Diarization' },
  write: { tr: 'Yazma', en: 'Write' },
};

function stageLabel(stage, en) {
  const row = STAGE_LABEL[String(stage || '')];
  if (!row) return String(stage || '');
  return en ? row.en : row.tr;
}

// progressTime satırında gösterilecek ETA parçası. basis 'history' ise
// metin bunu açıkça söyler; ölçüm yoksa boş dize (sahte ETA yok).
function formatStageEta(eta, en) {
  if (!eta || !Number.isFinite(eta.seconds)) return '';
  const sec = Math.max(0, eta.seconds);
  const approx = sec >= 0.5 ? `~${Math.round(sec)}sn` : '~1sn';
  if (eta.basis === 'history') {
    return en ? ` · est. ${approx} (past jobs)` : ` · tahmini ${approx} (geçmiş işler)`;
  }
  return en ? ` · est. ${approx}` : ` · tahmini ${approx}`;
}

// ---------- Madde 32: donanım rehberi ----------

const MODEL_VRAM_BASE = {
  'tiny': 250, 'base': 400, 'small': 750, 'medium': 1600,
  'large-v3-turbo': 1700, 'large-v2': 3100, 'large-v3': 3100,
};
const MODEL_ORDER = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v2', 'large-v3'];
const COMPUTE_MULT = { 'int8': 0.55, 'int8_float16': 0.55, 'float16': 1.0, 'float32': 1.9 };
const DIARIZE_OVERHEAD = 2500; // pyannote
const WHISPERX_OVERHEAD = 1400;

function modelVramNeed(model, computeType, opts = {}) {
  const base = MODEL_VRAM_BASE[model] || MODEL_VRAM_BASE['large-v3'];
  const mult = COMPUTE_MULT[String(computeType || 'float16')] ?? 1.0;
  let est = base * mult;
  const batch = Math.max(1, Math.min(32, Number(opts.batchSize) || 1));
  if (opts.engine === 'faster-batched' || opts.engine === 'whisperx') {
    est += base * mult * Math.min(1.35, 0.12 + Math.max(0, batch - 1) * 0.035);
  }
  if (opts.engine === 'whisperx') est += WHISPERX_OVERHEAD;
  if (opts.diarize) est += DIARIZE_OVERHEAD;
  return Math.round(est);
}

// Her model için mevcut VRAM'e göre uygunluk satırı.
// ctx: { vramMib|null, computeType, engine, batchSize, diarize }
function hardwareGuideRows(ctx = {}) {
  const vram = Number(ctx.vramMib);
  const hasVram = Number.isFinite(vram) && vram > 0;
  const compute = String(ctx.computeType || 'float16');
  const opts = { engine: ctx.engine, batchSize: ctx.batchSize, diarize: ctx.diarize };
  return MODEL_ORDER.map((id) => {
    const need = modelVramNeed(id, compute, opts);
    let state = 'unknown';
    if (hasVram) {
      if (need <= vram * 0.85) state = 'fits';
      else if (need <= vram) state = 'tight';
      else state = 'over';
    }
    return { id, need, state };
  });
}

// Donanıma göre önerilen ayar. GPU yoksa CPU önerisi; VRAM kısıtlıysa
// daha küçük model + int8. Dönen alanlar UI select'lerine doğrudan uygulanır.
// ctx: { gpuName, vramMib, totalMemMib, diarize, engine }
function recommendedHardwareConfig(ctx = {}) {
  const vram = Number(ctx.vramMib) || 0;
  const ram = Number(ctx.totalMemMib) || 0;
  const hasGpu = !!ctx.gpuName && vram > 0;
  const rec = {
    device: hasGpu ? 'cuda' : 'cpu',
    computeType: hasGpu ? 'float16' : 'int8',
    model: 'large-v3',
    engine: ctx.engine === 'whisperx' ? 'whisperx' : 'faster-batched',
    batchSize: 16,
    notes: [],
  };
  const en = ctx.en === true;
  if (!hasGpu) {
    rec.model = 'small';
    rec.engine = 'faster';
    rec.batchSize = 1;
    rec.notes.push(en ? 'No NVIDIA GPU detected — CPU + int8 + small model is the safe combination.' : 'NVIDIA GPU algılanmadı — CPU + int8 + küçük model güvenli kombinasyondur.');
    return rec;
  }
  // VRAM'e sığan en büyük modeli seç (diarize kapalıyken ölçülür).
  const fit = MODEL_ORDER.filter((id) => modelVramNeed(id, 'float16', { engine: rec.engine, batchSize: rec.batchSize }) <= vram * 0.85);
  rec.model = fit.length ? fit[fit.length - 1] : 'tiny';
  if (!fit.length) {
    rec.computeType = 'int8';
    const fitInt8 = MODEL_ORDER.filter((id) => modelVramNeed(id, 'int8', { engine: rec.engine, batchSize: rec.batchSize }) <= vram * 0.85);
    rec.model = fitInt8.length ? fitInt8[fitInt8.length - 1] : 'tiny';
    rec.notes.push(en ? 'VRAM is tight — int8 quantization is recommended.' : 'VRAM kısıtlı — int8 hesaplama önerilir.');
  }
  if (ctx.diarize) {
    const need = modelVramNeed(rec.model, rec.computeType, { engine: rec.engine, batchSize: rec.batchSize, diarize: true });
    if (need > vram * 0.85) {
      rec.notes.push(en ? 'Speaker recognition adds ~2.4 GiB; consider a smaller model or turn it off for long files.' : 'Konuşmacı tanıma ~2,4 GiB ekler; uzun dosyalarda küçük model veya kapalı tutmayı düşünün.');
    }
  }
  if (ram > 0 && ram < 8192) {
    rec.notes.push(en ? 'System RAM is limited — close other apps during large jobs.' : 'Sistem belleği sınırlı — büyük işlerde diğer uygulamaları kapatın.');
  }
  return rec;
}

function formatMib(mib, en) {
  const value = Number(mib);
  if (!Number.isFinite(value) || value <= 0) return en ? 'unknown' : 'bilinmiyor';
  return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`;
}

// ---------- Madde 33: ağ kullanım bütçesi ----------

const NET_BUDGET_PRESETS = {
  full: { dlRateKbps: 0, translateWorkers: 6, pageWorkers: 4 },
  balanced: { dlRateKbps: 8192, translateWorkers: 3, pageWorkers: 2 },
  saver: { dlRateKbps: 2048, translateWorkers: 1, pageWorkers: 1 },
};

function resolveNetworkBudget(value) {
  const key = String(value || 'full');
  const preset = NET_BUDGET_PRESETS[key];
  if (!preset) return { key: 'full', ...NET_BUDGET_PRESETS.full };
  return { key, ...preset };
}

// Çalışan scheduler'a uygulanacak üst sınır — tür farkı (page vs track)
// bütçe alanıyla çözülür; uygun değer 1..6 aralığına kilitlenir.
function budgetWorkerCap(budgetKey, kind) {
  const preset = resolveNetworkBudget(budgetKey);
  const raw = kind === 'page' ? preset.pageWorkers : preset.translateWorkers;
  return Math.max(1, Math.min(6, raw));
}

function netBudgetLabel(value, en) {
  const key = String(value || 'full');
  const labels = {
    full: { tr: 'Sınırsız (tam hız)', en: 'Unlimited (full speed)' },
    balanced: { tr: 'Dengeli — izleme için alan bırakır', en: 'Balanced — leaves room for playback' },
    saver: { tr: 'Tasarruf — en düşük ağ kullanımı', en: 'Saver — lowest network use' },
  };
  return (labels[key] || labels.full)[en ? 'en' : 'tr'];
}

// ---------- Madde 34: önbellek yönetim satırları ----------

function formatBytesForUi(bytes, en) {
  if (bytes === null || bytes === undefined) return '—';
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1073741824) return `${(value / 1073741824).toFixed(1)} GB`;
  if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}

// stats: { modelsBytes, modelsFree, translationCache {bytes,count}, mangaBytes, tmpBytes, assetsBytes, logsBytes }
function cacheStatRows(stats, en) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const t = en
    ? { models: 'Whisper models', translation: 'Translation cache', manga: 'Manga/OCR cache', tmp: 'Temporary files', assets: 'Captured media assets', logs: 'Job logs' }
    : { models: 'Whisper modelleri', translation: 'Çeviri önbelleği', manga: 'Manga/OCR önbelleği', tmp: 'Geçici dosyalar', assets: 'Yakalanan medya varlıkları', logs: 'İş günlükleri' };
  const row = (kind, bytes, extra) => ({
    kind,
    label: t[kind],
    bytes: Number.isFinite(Number(bytes)) ? Number(bytes) : null,
    detail: extra || '',
    clearable: bytes != null,
  });
  const trCount = s.translation && Number.isFinite(Number(s.translation.count))
    ? `${s.translation.count} ${en ? 'entries' : 'kayıt'}`
    : '';
  const modelsDetail = s.models
    ? (en
      ? `${s.models.installed ?? 0} installed · ${formatBytesForUi(s.models.freeBytes, en)} free`
      : `${s.models.installed ?? 0} kurulu · ${formatBytesForUi(s.models.freeBytes, en)} boş`)
    : '';
  return [
    row('models', s.models?.bytes, modelsDetail),
    row('translation', s.translation?.bytes, trCount),
    row('manga', s.manga?.bytes, s.manga && Number.isFinite(Number(s.manga.count)) ? `${s.manga.count} ${en ? 'entries' : 'kayıt'}` : ''),
    row('tmp', s.tmp?.bytes, en ? 'safe to clear when no job runs' : 'iş yokken güvenle temizlenir'),
    row('assets', s.assets?.bytes, en ? 'only unreferenced files are cleared' : 'yalnız referanssız dosyalar temizlenir'),
    row('logs', s.logs?.bytes, ''),
  ];
}

// Temizlik koruması: çalışan iş dosyaya ihtiyaç duyarken reddedilir.
function cacheClearGuard(kind, ctx = {}) {
  const jobActive = !!(ctx.jobActive || ctx.jobsRunning);
  const k = String(kind || '');
  if (['models', 'tmp'].includes(k) && jobActive) {
    return { ok: false, reason: ctx.en ? 'Clearing is blocked while a job is running.' : 'Bir iş çalışırken temizlik engellendi.' };
  }
  return { ok: true };
}

// ---------- Madde 35: kaynak zaman çizelgesi ----------

const RESOURCE_SERIES_CAP = 480; // ~40 dk @5sn

function appendResourceSample(series, sample, cap = RESOURCE_SERIES_CAP) {
  const list = Array.isArray(series) ? series.slice() : [];
  const s = sample && typeof sample === 'object' ? sample : {};
  if (!Number.isFinite(Number(s.t))) return list;
  list.push({
    t: Number(s.t),
    stage: String(s.stage || ''),
    sysMemPct: Number.isFinite(Number(s.sysMemPct)) ? Number(s.sysMemPct) : null,
    gpuMemMb: Number.isFinite(Number(s.gpuMemMb)) ? Number(s.gpuMemMb) : null,
    diskFreeMb: Number.isFinite(Number(s.diskFreeMb)) ? Number(s.diskFreeMb) : null,
    cpuLoad: Number.isFinite(Number(s.cpuLoad)) ? Number(s.cpuLoad) : null,
  });
  return list.length > cap ? list.slice(list.length - cap) : list;
}

// SVG polyline noktaları — renderer sparkline için.
function resourceSparkPoints(series, key, width = 300, height = 40) {
  const list = (Array.isArray(series) ? series : [])
    .filter((s) => Number.isFinite(Number(s[key])) && Number.isFinite(Number(s.t)));
  if (list.length < 2) return '';
  const tMin = list[0].t;
  const tSpan = Math.max(1e-6, list[list.length - 1].t - tMin);
  const vMin = Math.min(...list.map((s) => s[key]));
  const vMax = Math.max(...list.map((s) => s[key]));
  const vSpan = Math.max(1e-6, vMax - vMin);
  return list.map((s) => {
    const x = ((s.t - tMin) / tSpan) * width;
    const y = height - ((s[key] - vMin) / vSpan) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

// Kişisel içerik içermeyen markdown özet — tanı raporuna aktarım için.
// Dosya adı, URL, başlık YAZILMAZ; sadece aşama adları ve sayısal ölçümler.
function formatResourceReport(series, opts = {}) {
  const en = opts.en === true;
  const list = (Array.isArray(series) ? series : []).filter((s) => Number.isFinite(Number(s.t)));
  if (!list.length) return en ? 'No samples.' : 'Ölçüm yok.';
  const maxOf = (key) => {
    const vals = list.map((s) => s[key]).filter(Number.isFinite);
    return vals.length ? Math.max(...vals) : null;
  };
  const minDisk = list.map((s) => s.diskFreeMb).filter(Number.isFinite).reduce((a, b) => Math.min(a, b), Infinity);
  const stageSpans = [];
  let spanStart = list[0].t;
  let lastStage = String(list[0].stage || '');
  for (const s of list.slice(1)) {
    if (String(s.stage || '') !== lastStage) {
      stageSpans.push({ stage: lastStage, from: spanStart, to: s.t });
      spanStart = s.t;
      lastStage = String(s.stage || '');
    }
  }
  stageSpans.push({ stage: lastStage, from: spanStart, to: list[list.length - 1].t });
  const t0 = Number(list[0].t);
  const durationS = Math.round((Number(list[list.length - 1].t) - t0) / 1000);
  const relSec = (v) => `+${Math.max(0, Math.round((Number(v) - t0) / 1000))}s`;
  const lines = [];
  lines.push(en ? '## Job resource timeline' : '## İş kaynak zaman çizelgesi');
  lines.push('');
  lines.push(en
    ? `Duration: ${durationS}s (${list.length} samples)`
    : `Süre: ${durationS}s (${list.length} örnek)`);
  const peakMem = maxOf('sysMemPct');
  if (peakMem != null) lines.push(en ? `Peak system memory: ${peakMem.toFixed(0)}%` : `Tepe sistem belleği: %${peakMem.toFixed(0)}`);
  const peakGpu = maxOf('gpuMemMb');
  if (peakGpu != null) lines.push(en ? `Peak GPU memory: ${Math.round(peakGpu)} MB` : `Tepe GPU belleği: ${Math.round(peakGpu)} MB`);
  if (Number.isFinite(minDisk)) lines.push(en ? `Lowest free disk: ${formatBytesForUi(minDisk * 1048576, en)}` : `En düşük boş disk: ${formatBytesForUi(minDisk * 1048576, en)}`);
  lines.push('');
  lines.push(en ? '| Stage | From | To |' : '| Aşama | Başlangıç | Bitiş |');
  lines.push('|---|---|---|');
  for (const span of stageSpans) {
    lines.push(`| ${span.stage || '—'} | ${relSec(span.from)} | ${relSec(span.to)} |`);
  }
  return lines.join('\n');
}

const jobTimingHelpersApi = {
  STAGE_ORDER,
  STAGE_HISTORY_CAP,
  recordStageDuration,
  stageMedian,
  estimateStageEta,
  stageLabel,
  formatStageEta,
  MODEL_VRAM_BASE,
  MODEL_ORDER,
  modelVramNeed,
  hardwareGuideRows,
  recommendedHardwareConfig,
  formatMib,
  NET_BUDGET_PRESETS,
  resolveNetworkBudget,
  budgetWorkerCap,
  netBudgetLabel,
  formatBytesForUi,
  cacheStatRows,
  cacheClearGuard,
  RESOURCE_SERIES_CAP,
  appendResourceSample,
  resourceSparkPoints,
  formatResourceReport,
};

if (typeof module !== 'undefined' && module.exports) module.exports = jobTimingHelpersApi;
if (typeof globalThis !== 'undefined') globalThis.JobTimingHelpers = jobTimingHelpersApi;
