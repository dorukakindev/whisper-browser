// renderer-helpers.js — renderer.js'ten çıkarılan yaprak/yardımcı işlevler.
// index.html'de renderer.js'ten ÖNCE yüklenir; üst düzey `function` bildirimleri
// klasik script'lerde paylaşılan global alana yazıldığı için çağrılar çalışma
// anında çözülür (iki dosya arasında import/export gerekmez).
// R153: renderer.js modülleştirmesinin ilk güvenli dilimi — bu dosyadaki her
// işlev, tests/ altındaki isim-slicing, gövde-metni, bölge-aralığı ve
// çağıran-zinciri kapsamının dışında doğrulandı; ayrıntı
// docs/raporlar/BROWSER_BUG_REPORT_151.md.
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

function syncJobsCenter() {
  $('jobsQueueBadge').textContent = String(state.queue.length);
  $('jobsHistoryBadge').textContent = String(historyCache.length);
  $('startQueueBtn').disabled = !state.queue.some((item) => item.status === 'pending') || state.queueRunning;
  $('clearQueue').disabled = !state.queue.some((item) => item.status !== 'running');
  renderReviewCenter();
  setJobsTab(_jobsTab);
}

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
    // Madde 31 — biten aşamanın gerçek süresi kalıcı geçmişe yazılır; sessiz
    // aşamaların ETA'sı bu medyana dayanır (ölçüm olmayana sahte ETA yok).
    const H = globalThis.JobTimingHelpers;
    if (H && typeof state === 'object' && state) {
      state.stageDurationHistory = H.recordStageDuration(
        state.stageDurationHistory, _activeStage, (now - _stageStart) / 1000);
      try { localStorage.setItem('whisper.stageStats', JSON.stringify(state.stageDurationHistory)); } catch (_) {}
    }
  }
  if (_activeStage !== stage) {
    _activeStage = stage;
    _stageStart = now;
  }
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

function formatClipDur(sec) {
  let m = Math.floor(sec / 60), s2 = Math.round(sec % 60);
  // Yuvarlama s2'yi 60'a taşıyabilir (119.9 sn → "1 dk 60 sn") — eldeyi üst basamağa ver.
  if (s2 === 60) { m += 1; s2 = 0; }
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
    hint.innerHTML = 'Örnek: <code>1:30</code> – <code>5:00</code>. Boş bırakırsan tüm dosya işlenir. '
      + "Zamanlar videoya göre korunur; YouTube'da iki sınır da girildiğinde yalnızca bu aralık indirilir.";
    return;
  }
  const from = a === null ? 'baştan' : formatClipDur(a);
  const to = b === null ? 'sona kadar' : formatClipDur(b);
  const len = (a !== null && b !== null) ? ` · seçili süre: ${formatClipDur(b - a)}` : '';
  hint.textContent = `⏱ Yalnızca ${from} → ${to} çevrilecek${len}`;
}

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

async function refreshRuntimeStatus() {
  for (const id of ['runtimePython', 'runtimeFfmpeg', 'runtimeYtdlp', 'runtimeGpu', 'runtimeDisk']) {
    runtimeState(id, interfaceChoice('Denetleniyor', 'Checking'), 'loading');
  }
  const [env] = await Promise.all([
    window.api.getEnvInfo().catch(() => null),
    refreshModelStatus().catch(() => null),
  ]);
  renderRuntimeStatus(env, modelStatusSnapshot);
  return env;
}

function providerSettingText(value) {
  return window.UiLocale?.t ? window.UiLocale.t(String(value || '')) : String(value || '');
}

function initializeProviderModelProfiles(settingsGroup = {}) {
  const api = window.WhisperProviderModels;
  providerModelProfiles = api
    ? api.normalizeProviderModelProfiles(settingsGroup.modelProfiles)
    : {};
  renderProviderModelChoices();
}

function resetTranslationProviderProbe() {
  const output = $('translateProbeStatus');
  if (!output) return;
  output.dataset.state = 'idle';
  output.textContent = providerSettingText('Henüz test edilmedi.');
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

// LLM endpoint preset değişimi: "custom" seçilince url alanı görünür
function updateLlmEndpointUI() {
  const preset = $('llmEndpointPreset');
  const customField = $('llmCustomUrlField');
  if (!preset || !customField) return;
  customField.classList.toggle('hidden', preset.value !== 'custom');
}

async function refreshModelStatus() {
  if (!window.api.getModelStatus) return;
  const result = await window.api.getModelStatus().catch(() => null);
  if (result?.ok) modelStatusSnapshot = result;
  renderSelectedModelStatus();
}

function finishRunAwaitingProcessExit() {
  // Backend `done` olayını stdout'a süreç kapanmadan hemen önce yollar. Bu dar
  // aralıkta işi yeniden başlatılabilir göstermeyelim; aksi halde ikinci tık
  // ana süreçte hâlâ yaşayan işe çarpar ve kullanıcı çevirinin yeniden
  // başladığını sanabilir. Çeviri bitmiştir, yalnız süreç kapanışı beklenir.
  state.running = true;
  state.cancelled = false;
  $('startBtn').classList.add('hidden');
  $('cancelBtn').classList.add('hidden');
  setStatus('Tamamlandı · süreç kapanıyor', 'success');
  updatePlayerTaskCenter();
}

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

function updateSyncBtn() {
  const btn = $('syncBtn');
  if (btn) btn.disabled = !(state.syncVideo && state.syncSrt);
}

function currentBrowserWorkflowContext() {
  const tab = browserTabState();
  return tab ? { tabId: tab.id, generation: tab.generation, mediaId: tab.mediaId || '' } : null;
}

function browserWorkflowStepForCommand(command) {
  if (!command || command.recordable === false) return null;
  if (command.workflowStep) return command.workflowStep();
  return null;
}

function startBrowserWorkflowRecording() {
  if (!browserWorkflowRecorder || browserWorkflowPlayer?.playing) return;
  browserWorkflowRecorder.start(currentBrowserWorkflowContext(), browserTabState()?.title || 'Tarayıcı iş akışı');
  setBrowserSignal('Workflow kaydı başladı. Komut paletinden çalıştırdığınız uygun eylemler kaydedilecek.', true,
    { priority: 70, holdMs: 6000 });
}

function stopBrowserWorkflowRecording() {
  const workflow = browserWorkflowRecorder?.stop();
  if (!workflow) { setBrowserSignal('Kaydedilecek workflow adımı bulunamadı.', false); return; }
  browserWorkflowLibrary = window.BrowserWorkflowRecorder.normalizeWorkflowLibrary([...browserWorkflowLibrary, workflow]);
  scheduleSave();
  setBrowserSignal(`Workflow kaydedildi: ${workflow.steps.length} adım.`, true, { priority: 70, holdMs: 5000 });
}

async function playLastBrowserWorkflow() {
  const workflow = browserWorkflowLibrary[browserWorkflowLibrary.length - 1];
  if (!workflow || !browserWorkflowPlayer) return;
  setBrowserSignal(`Workflow çalışıyor: 0/${workflow.steps.length}`, true, { priority: 70, holdMs: 5000 });
  try {
    const result = await browserWorkflowPlayer.play(workflow, {
      getContext: currentBrowserWorkflowContext,
      execute: async (step, progress) => {
        setBrowserSignal(`Workflow çalışıyor: ${progress.index + 1}/${progress.total}`, true,
          { priority: 70, holdMs: 5000, force: true });
        await executeRecordedBrowserWorkflowStep(step);
      },
    });
    setBrowserSignal(`Workflow tamamlandı: ${result.completed}/${result.total} adım.`, true,
      { priority: 70, holdMs: 5000, force: true });
  } catch (error) {
    setBrowserSignal(`Workflow durduruldu: ${error.message}`, false,
      { priority: 90, holdMs: 7000, force: true });
  }
}

function renderBrowserCommandPalette() {
  const list = $('browserCommandPaletteList');
  if (!list) return;
  const context = browserTabState();
  browserCommandPaletteState.results = window.BrowserCommandPalette
    ? window.BrowserCommandPalette.rankBrowserCommands(browserCommandPaletteCommands(), browserCommandPaletteState.query, context || {})
    : browserCommandPaletteCommands();
  browserCommandPaletteState.selected = Math.max(0, Math.min(browserCommandPaletteState.selected, browserCommandPaletteState.results.length - 1));
  list.replaceChildren();
  if (!browserCommandPaletteState.results.length) {
    const empty = document.createElement('div'); empty.className = 'browser-command-item'; empty.textContent = window.UiLocale?.t('Eşleşen komut yok.') || 'Eşleşen komut yok.'; list.appendChild(empty); return;
  }
  browserCommandPaletteState.results.forEach((command, index) => {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'browser-command-item';
    item.setAttribute('role', 'option'); item.setAttribute('aria-selected', index === browserCommandPaletteState.selected ? 'true' : 'false');
    item.disabled = command.enabled === false;
    const title = document.createElement('span'); title.textContent = window.UiLocale?.t(command.title) || command.title;
    const category = document.createElement('small'); category.textContent = window.UiLocale?.t(command.category || '') || command.category || '';
    item.append(title, category);
    if (command.disabledReason) { const reason = document.createElement('em'); reason.textContent = window.UiLocale?.t(command.disabledReason) || command.disabledReason; item.appendChild(reason); }
    item.addEventListener('click', () => executeBrowserCommandPalette(index));
    list.appendChild(item);
  });
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function closeBrowserCommandPalette() {
  browserCommandPaletteState.open = false; browserCommandPaletteState.context = null; browserCommandPaletteState.results = [];
  const panel = $('browserCommandPalette');
  panel?.classList.add('hidden'); panel?.setAttribute('aria-hidden', 'true');
  syncBrowserOcclusion();
  const target = browserCommandPaletteState.returnFocus?.isConnected
    ? browserCommandPaletteState.returnFocus
    : $('browserMoreMenu')?.querySelector('summary');
  browserCommandPaletteState.returnFocus = null;
  target?.focus({ preventScroll: true });
}

async function executeBrowserCommandPalette(index = browserCommandPaletteState.selected) {
  const command = browserCommandPaletteState.results[index];
  if (!command || command.enabled === false) return;
  const recordedStep = browserWorkflowStepForCommand(command);
  // browserCommandContextMatches {tabId, generation, mediaId} bekler; ham sekme
  // nesnesinde `tabId` yok (`id` var). Eskiden ham nesne verildiği için eşleşme
  // her zaman başarısız oluyor ve paletten hiçbir komut çalışmıyordu.
  const current = currentBrowserWorkflowContext();
  const valid = window.BrowserCommandPalette?.browserCommandContextMatches
    ? window.BrowserCommandPalette.browserCommandContextMatches(browserCommandPaletteState.context, current)
    : !!current && current.tabId === browserCommandPaletteState.context?.tabId;
  if (!valid) { setBrowserSignal('Sekme veya medya değişti; komut yeniden seçilmeli.', false); closeBrowserCommandPalette(); return; }
  closeBrowserCommandPalette();
  try { await command.run(); }
  catch (error) { setBrowserSignal(`Komut çalıştırılamadı: ${error.message}`, false); return; }
  if (recordedStep && browserWorkflowRecorder?.recording) {
    try { browserWorkflowRecorder.record(recordedStep.command, recordedStep.args, currentBrowserWorkflowContext()); }
    catch (error) {
      const message = error?.code === 'EWORKFLOW_LIMIT'
        ? 'Komut çalıştı ancak workflow kayıt sınırı dolduğu için kaydedilmedi.'
        : `Komut çalıştı ancak workflow kaydına eklenemedi: ${error.message}`;
      setBrowserSignal(message, false);
    }
  }
}

// Sekme ses düğmesi: açıkken hoparlör+dalga, sessizde hoparlör+çarpı. Düz
// '♪/×' glifleri yazı tipine göre değişiyordu; vektör simge her platformda
// aynı görünür.
function browserTabAudioIcon(muted) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  body.setAttribute('d', 'M11 5 6.5 9H3v6h3.5L11 19V5Z');
  svg.appendChild(body);
  if (muted) {
    const cross = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cross.setAttribute('d', 'm16 9.5 5 5m0-5-5 5');
    svg.appendChild(cross);
  } else {
    const wave1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wave1.setAttribute('d', 'M15.2 9.7a3.4 3.4 0 0 1 0 4.6');
    const wave2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wave2.setAttribute('d', 'M17.8 7.4a6.8 6.8 0 0 1 0 9.2');
    svg.append(wave1, wave2);
  }
  return svg;
}

async function toggleBrowserReader() {
  const tab = browserTabState();
  if (!tab || !window.api.setBrowserReader) return;
  const result = await window.api.setBrowserReader(tab.id, 'toggle', tab.readerPreferences || {})
    .catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok) { setBrowserSignal(result?.error || 'Okuma görünümü açılamadı.', false); return; }
  tab.readerActive = !!result.active; tab.readerPreferences = result.preferences || tab.readerPreferences;
  syncBrowserReaderControl(tab);
}

function browserNtpNavigate(url) {
  const box = $('browserAddress');
  if (!url || !box) return;
  box.value = url;
  if (typeof updateBrowserAddressMirror === 'function') updateBrowserAddressMirror();
  void navigateBrowserFromAddress();
}

// Simge yoksa sonuç adresinin alan adının ilk harfi + renk tonu (sekme
// avatarıyla aynı özetleme); url'siz satırlar (hesap, kısayol…) işaret harfi
// kullanmaya devam eder.
function browserAddressResultHost(result) {
  const candidate = result.url || (result.action === 'tab' ? result.detail : '') || '';
  try {
    const host = new URL(candidate).hostname.replace(/^www\./, '');
    return host && /^[a-z0-9][a-z0-9.-]*$/i.test(host) ? host : '';
  } catch (_) { return ''; }
}

function rememberBrowserFavicon(url, favicon) {
  const origin = globalThis.BrowserAddressModel?.originOf(url);
  // Simge gövdesi omurga yardımcısında da kapılanır; burada yine süzülmesi
  // helpers'ın bağımsız kullanıldığı bağlamlarda (vm testleri, gelecekteki
  // çağıranlar) şema dışı dizgilerin haritaya girmesini engeller.
  if (origin && /^data:image\//i.test(favicon)) rememberBrowserFaviconByOrigin(origin, favicon);
}

function browserFaviconFor(url) {
  const origin = globalThis.BrowserAddressModel?.originOf(url);
  if (!origin) return '';
  const tab = (player.browserTabs || []).find((item) => item.favicon && globalThis.BrowserAddressModel.originOf(item.url) === origin);
  return tab?.favicon || browserFaviconByOrigin.get(origin) || '';
}

function applyBrowserAddressInlineCompletion(event) {
  const input = $('browserAddress');
  player.browserAddressCompletion = null;
  if (!input || !globalThis.BrowserAddressModel) return;
  // Silme/yapıştırma/IME sırasında tamamlama yapılmaz (Chrome davranışı).
  if (event?.inputType !== 'insertText' || event.isComposing) return;
  const value = input.value;
  if (input.selectionStart !== value.length) return;
  const places = player.browserPlaces || {};
  const completion = globalThis.BrowserAddressModel.inlineCompletion(value,
    [...(places.bookmarks || []), ...(places.history || [])]);
  if (!completion) return;
  // prefix = adayın katlanmış sorguyu karşılayan özgün başı; sorgu görünmez
  // karakter veya aksan farkı içeriyorsa yazılan metin adayın kendi başıyla
  // değiştirilir — tamamlanan adrese karakter sızmaz.
  const prefix = typeof completion.prefix === 'string' ? completion.prefix : value;
  if (!completion.text.toLowerCase().startsWith(prefix.toLowerCase())) return;
  if (prefix === value) {
    input.value = value + completion.text.slice(value.length);
    input.setSelectionRange(value.length, input.value.length, 'forward');
  } else {
    input.value = completion.text;
    input.setSelectionRange(prefix.length, input.value.length, 'forward');
  }
  player.browserAddressCompletion = { ...completion, text: input.value };
}

async function useBrowserAddressResult(index) {
  const result = player.browserAddressResults[index];
  if (!result) return;
  closeBrowserAddressResults();
  if (result.action === 'calc') {
    const copied = await window.api.copyText?.(result.value).catch(() => null);
    setBrowserSignal(copied === true
      ? `Sonuç panoya kopyalandı: ${result.value}`
      : 'Sonuç panoya kopyalanamadı.', copied === true, { priority: 50, holdMs: 3500 });
    return;
  }
  if (result.action === 'tab') await activateBrowserTab(result.id);
  else if (result.action === 'unified') await openUnifiedLibraryResult(result.result);
  else {
    $('browserAddress').value = result.url || result.value || '';
    if (typeof updateBrowserAddressMirror === 'function') updateBrowserAddressMirror();
    await navigateBrowserFromAddress();
  }
}

function browserDiagnosticsCopyText(diagnostics) {
  const counts = diagnostics?.counts || {};
  const translation = diagnostics?.translation || {};
  const operationId = String(diagnostics?.operationId || 'yok');
  const recent = Array.isArray(diagnostics?.recent) ? diagnostics.recent.slice(0, 100) : [];
  const lines = [
    `Whisper Local tarayıcı tanısı`,
    `İşlem kimliği: ${operationId}`,
    `Sayfa: ${String(diagnostics?.pageUrl || 'yok')}`,
    `Sayfa durumu: ${String(diagnostics?.responsiveness?.message || 'ölçülmedi')}`,
    `Sonuç: ${Number(counts.parsed || 0)} işlendi · ${Number(counts.rejected || 0)} elendi · ${Number(counts.errors || 0)} hata`,
    `Çeviri: ${Number(translation.sourceCues || 0)} kaynak · ${Number(translation.submittedSentences || 0)} gönderilen cümle · ${Number(translation.translatedCues || 0)} çıktı · ${Number(translation.missingCues || 0)} eksik`,
    'Son olaylar:',
    ...recent.slice(0, 30).map((entry) => [entry.strategy, entry.outcome, entry.detail, entry.url].filter(Boolean).join(' · ')),
  ];
  return lines.join('\n');
}

// Yan panel ikon rayı: videosuz sayfada panel 48 px ikon rayına daralir;
// video gorulunce kullanici kapatmadiysa acilir. Tercih site basina saklanir.
function browserSideRailHost() {
  try { return new URL(player.browserPageUrl || '').host || ''; } catch (_) { return ''; }
}

function readBrowserSideRailPrefs() {
  try { return JSON.parse(localStorage.getItem('browserSideRail') || '{}') || {}; } catch (_) { return {}; }
}

function setBrowserSideRailPref(mode) {
  const host = browserSideRailHost();
  if (!host) {
    // Adressiz durumda (yeni sekme) tercih yalniz oturum icin tutulur.
    player.browserSideRailNoHost = mode === 'rail' || mode === 'panel' ? mode : null;
    updateBrowserSideRail();
    return;
  }
  const map = readBrowserSideRailPrefs();
  if (mode === 'rail' || mode === 'panel') map[host] = mode;
  else delete map[host];
  try { localStorage.setItem('browserSideRail', JSON.stringify(map)); } catch (_) {}
  updateBrowserSideRail();
}

function updateBrowserLiveAsrButton(message = '') {
  const button = $('browserLiveAsr');
  if (!button) return;
  button.setAttribute('aria-pressed', player.browserLiveAsrActive ? 'true' : 'false');
  button.textContent = player.browserLiveAsrActive ? 'Canlı Whisper’ı durdur' : 'Canlı Whisper';
  if (message) button.title = message;
}

function syncBrowserLiveAsrClock() {
  const capture = player.browserLiveAsrCapture;
  if (!capture?.node || capture.stopping) return;
  // Reklam oynarken medya saati reklamın kendi saatidir (0-30 sn). Sistem sesi
  // yakalanmaya devam ederse reklamdaki konuşma asıl videonun ilk saniyelerine
  // canlı altyazı olarak yazılır ve izi kalıcı olarak kirletir. Reklam süresince
  // yakalamayı duraklatılmış say; reklam bitince saat sıçraması flush tetikler.
  capture.node.port.postMessage({ type: 'sync', time: Number(player.browserTime) || 0,
    contextTime: capture.context.currentTime,
    paused: !!player.browserPaused || !!player.browserAdPlaying, rate: player.browserRate || 1 });
}

function browserPageHost(url = player.browserPageUrl) {
  try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; }
}

function browserSettingsScopeContext(entry) {
  const selectedScope = $('browserProfileScope')?.value || 'general';
  let effective = null;
  try { effective = effectiveBrowserProfile(); } catch (_) {}
  const profileControl = browserProfileControls()
    .find(([field, id]) => id === entry?.id || `profile-${field}` === entry?.id);
  if (!profileControl || !effective) {
    return { selectedScope, origin: effective?.origin || '', hasOverride: false };
  }
  const [field, id, , fallback, scale = 1] = profileControl;
  const rawValue = effective.values[field];
  let value = rawValue;
  if (typeof fallback === 'boolean') value = rawValue ? 'Açık' : 'Kapalı';
  else if (typeof fallback === 'number') value = scale === 100
    ? `%${Math.round(Number(rawValue) * scale)}` : String(rawValue);
  else {
    const original = $(id);
    value = [...(original?.options || [])]
      .find((option) => option.value === String(rawValue))?.textContent || String(rawValue || '');
  }
  return {
    selectedScope,
    origin: effective.origin || '',
    hasOverride: effective.sources[field] === selectedScope,
    value,
  };
}

function renderBrowserSettingsSearchResults(matches, query) {
  const host = $('browserSettingsResults');
  const registry = browserSettingsRegistry();
  if (!host || !registry) return;
  host.replaceChildren();
  host.classList.toggle('hidden', !query);
  if (!query) return;
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'browser-settings-results-empty';
    empty.textContent = window.UiLocale?.t('Eşleşen ayar bulunamadı.') || 'Eşleşen ayar bulunamadı.';
    host.appendChild(empty);
    return;
  }
  for (const entry of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'browser-settings-result';
    button.dataset.browserSettingOpen = entry.id;
    const title = document.createElement('strong');
    title.textContent = window.UiLocale?.t(entry.label) || entry.label;
    const description = document.createElement('span');
    description.textContent = window.UiLocale?.t(entry.description) || entry.description;
    const scope = document.createElement('small');
    scope.textContent = registry.browserSettingScopeStatus(
      entry.scope, browserSettingsScopeContext(entry));
    button.append(title, description);
    if (scope.textContent) button.appendChild(scope);
    host.appendChild(button);
  }
}

function closeBrowserPermissionPrompt(requestId = '') {
  if (requestId && player.browserPermissionRequest?.requestId !== requestId) return;
  player.browserPermissionRequest = null;
  $('browserPermissionPrompt')?.classList.add('hidden');
  syncBrowserOcclusion();
}

async function respondToBrowserPermission(decision) {
  const request = player.browserPermissionRequest;
  if (!request?.requestId || !window.api.respondBrowserPermission) return;
  closeBrowserPermissionPrompt(request.requestId);
  const result = await window.api.respondBrowserPermission(request.requestId, decision)
    .catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok && !result?.stale) {
    setBrowserSignal(result?.error || 'Site izin isteği yanıtlanamadı.', false);
  }
  if (decision === 'allow' || decision === 'block') void renderBrowserPermissions();
}

function isWordSaved(word, cueIndex, source = 'source') {
  return !!word && player.savedWords.some((x) => x.key === wordRecordKey(word, cueIndex, source));
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

function browserRecoveryLabel(job) {
  if (job.kind === 'subtitle-translation') return 'Altyazı çevirisi';
  if (job.kind === 'manga') return 'Manga çevirisi';
  return 'Sayfa çevirisi';
}

async function completeBrowserRecovery(tab, kind, trackId = '') {
  if (!tab?.id || !Array.isArray(tab.recoveryJobs)) return;
  const matches = tab.recoveryJobs.filter((job) => job.kind === kind
    && (!trackId || !job.trackId || job.trackId === trackId));
  if (!matches.length) return;
  tab.recoveryJobs = tab.recoveryJobs.filter((job) => !matches.includes(job));
  for (const job of matches) {
    await window.api.dismissBrowserRecovery?.(tab.id, job.id).catch(() => null);
  }
  renderBrowserRecoveryList();
  updatePlayerTaskCenter();
}

// Form kontrollerinde ok/Home/End tuşları yerleşik anlam taşır (select'te
// seçenek değişimi, range/number'da değer ayarı, metin/textarea'da imleç):
// menü ok gezintisi bu davranışı ezmesin — kontrol odaklıyken tuşlar kendisine
// kalsın. Aksi halde ⋯/sinyal menüsündeki ~50 denetimde her ok basımı odağı
// başka öğeye kaydırıyordu.
function detailsNavSkipsControl(target) {
  return !!target?.closest?.('input, select, textarea');
}

function wireDetailsMenuNav(details) {
  details.addEventListener('keydown', (event) => {
    if (!details.open) return;
    if (detailsNavSkipsControl(event.target)) return;
    const items = detailsMenuFocusable(details);
    if (!items.length) return;
    const current = document.activeElement;
    const idx = items.indexOf(current);
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      items[(idx + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    }
  });
}

function setBrowserQrOpen(open) {
  const panel = $('browserQrPanel');
  if (!panel) return;
  if (open) { setBrowserPlacesOpen(false); setBrowserDownloadsOpen(false); }
  panel.classList.toggle('hidden', !open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  syncBrowserOcclusion();
  if (!open && panel.contains(document.activeElement)) $('browserMoreMenu')?.querySelector('summary')?.focus({ preventScroll: true });
  // Odak panele taşınmazsa panelin kendi Esc dinleyicisi hiç çalışmıyordu
  // (odak kapanmış ⋯ menüsündeki öğede kalıyordu).
  if (open) requestAnimationFrame(() => $('browserQrClose')?.focus({ preventScroll: true }));
}

// Mod değişiminde / oynatıcı kapanırken geçici tarayıcı panellerinin hepsi
// kapanır. Eskiden yalnız İndirmeler kapanıyordu; Yer imleri, QR ve komut paleti
// (eski sekme bağlamıyla) açık kalıp geri dönüşte yeniden beliriyordu.
function closeBrowserTransientPanels() {
  setBrowserDownloadsOpen(false);
  setBrowserPlacesOpen(false);
  setBrowserQrOpen(false);
  if (browserCommandPaletteState.open) closeBrowserCommandPalette();
}

async function showBrowserQrPanel() {
  const panel = $('browserQrPanel');
  const canvas = $('browserQrCanvas');
  const urlEl = $('browserQrUrl');
  if (!panel || !canvas || !urlEl) return;
  const url = player.browserPageUrl || '';
  urlEl.textContent = url;
  setBrowserQrOpen(true);
  if (!url || typeof globalThis.QRCode?.toCanvas !== 'function') {
    setBrowserSignal('QR kodu için geçerli bir sayfa adresi yok.', false, { priority: 60, holdMs: 4000 });
    return;
  }
  try {
    await globalThis.QRCode.toCanvas(canvas, url, { errorCorrectionLevel: 'M', margin: 1, width: 168 });
  } catch {
    setBrowserSignal('QR kodu üretilemedi.', false, { priority: 60, holdMs: 4000 });
  }
}

function browserPagePrefsKey() {
  const host = browserPageHost(player.browserPageUrl || '');
  return host ? 'browserPagePrefs:' + host : '';
}

async function startBrowserPageTranslationFromPrefs() {
  if (!player.browserActiveTabId || !player.browserPageUrl) return;
  const prefs = loadBrowserPagePrefs();
  const profile = effectiveBrowserProfile().values;
  applyBrowserPageTranslationState({ state: 'running', translated: 0, failed: 0, sections: [], failures: [], completion: null });
  const result = await window.api.startBrowserPageTranslation?.(player.browserActiveTabId, {
    targetLanguage: profile.pageTargetLanguage ?? 'tr', mode: profile.pageMode ?? 'bilingual',
    view: player.browserPageView === 'original' ? (profile.pageMode === 'replace' ? 'translation' : 'both') : player.browserPageView,
    scope: player.browserPageScope || 'article', autoContinue: player.browserPageAutoContinue !== false,
    workers: 2, lockedTerms: prefs.lockedTerms, excludedSections: prefs.excludedSections, excludedSelectors: prefs.excludedSelectors, pageCharacterBudget: prefs.pageCharacterBudget,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok && !result?.partial) applyBrowserPageTranslationState({ state: 'error', message: result?.error || 'Sayfa çevirisi başlatılamadı.' });
}

function pdfReaderSetStatus(message, error = false) {
  const node = $('pdfReaderStatus');
  if (node) { node.textContent = message; node.style.color = error ? '#e48a74' : ''; }
  updatePdfReaderProgress();
  if (typeof updatePlayerTaskCenter === 'function') updatePlayerTaskCenter();
}

async function extractPdfReaderPage(pageNumber) {
  const reader = player.pdfReader;
  if (!reader?.pdf) return null;
  const existing = reader.pages.get(pageNumber);
  if (existing?.blocks && existing?.items) return existing.blocks;
  const page = await reader.pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const pageViewport = page.getViewport({ scale: 1 });
  const pageHeight = pageViewport.height;
  const pageWidth = pageViewport.width;
  const items = (content.items || []).map((item) => ({
    str: String(item.str || ''),
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    transform: Array.isArray(item.transform) ? item.transform.slice(0, 6) : [],
    hasEOL: item.hasEOL === true,
  }));
  let blocks = [];
  let lines = [];
  const flushLines = () => {
    if (!lines.length) return;
    // Madde 36 — karşılık vurgusu: blok konumu (PDF koordinatları, y alttan)
    // çift görünümde kaynak sayfa üzerinde işaret çizgisi için saklanır.
    blocks.push({
      id: `${pageNumber}:${blocks.length}`,
      source: lines.map((line) => line.text).join(' '),
      top: Math.max(...lines.map((line) => line.y)),
      bottom: Math.min(...lines.map((line) => line.y - line.height)),
      left: Math.min(...lines.map((line) => line.x)),
      right: Math.max(...lines.map((line) => line.x + line.width)),
    });
    lines = [];
  };
  for (const item of items) {
    const text = String(item.str || '').trim(); if (!text) continue;
    lines.push({ text, x: item.transform?.[4] || 0, y: item.transform?.[5] || 0, width: item.width || 0, height: item.height || 1 });
    if (item.hasEOL) flushLines();
  }
  flushLines();
  // Madde 37 — metin katmanı OLMAYAN sayfalarda OCR yedeği; metin katmanı
  // olan sayfalar (items.length > 0) gereksiz OCR'dan geçirilmez.
  let ocr = null;
  if (!items.length) {
    try {
      ocr = await ocrPdfPage(page, pageNumber, reader, pageWidth, pageHeight);
      if (ocr?.blocks?.length) blocks = ocr.blocks;
    } catch (error) {
      ocr = { failed: true, error: String(error?.message || error) };
    }
  }
  reader.pages.set(pageNumber, {
    blocks, items, pageHeight, pageWidth,
    viewportTransform: Array.isArray(pageViewport.transform) ? pageViewport.transform.slice(0, 6) : [],
    ocr, article: null, translation: null,
  });
  return blocks;
}

// Görüntü tabanlı sayfayı ayrı tuvalde çözünürlüğü sınırlı render edip
// yerel OCR'dan geçirir; motor yokluğu ve dil paketi raporu açık döner.
async function ocrPdfPage(page, pageNumber, reader, pageWidth, pageHeight) {
  if (!window.api.ocrStatus || !window.api.ocrFrame) return null;
  reader.ocrStatusPromise ||= window.api.ocrStatus()
    .then((result) => (result && result.ok === false ? { available: false, error: result.error } : result?.status || result))
    .catch((error) => ({ available: false, error: error.message }));
  const status = await reader.ocrStatusPromise;
  if (!status?.available) return { unavailable: true, status };
  const scale = Math.min(2, 2048 / Math.max(pageWidth, pageHeight, 1));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvas, viewport, intent: 'print' }).promise;
  const result = await window.api.ocrFrame({ imageBase64: canvas.toDataURL('image/png') })
    .catch((error) => ({ ok: false, error: error.message }));
  if (!result?.ok) return { failed: true, error: result?.error || 'OCR başarısız.' };
  const lines = (result.lines || []).filter((line) => line && typeof line.text === 'string' && line.text.trim())
    .map((line) => ({ text: line.text.trim(), score: Number(line.score) || 0, box: line.box || null }));
  const meanScore = lines.length ? lines.reduce((sum, line) => sum + line.score, 0) / lines.length : 0;
  return {
    lines, blocks: ocrLinesToBlocks(lines, pageNumber),
    meanScore, lowConfidence: lines.length > 0 && meanScore < 0.6,
    languageNote: status.languageNote || '', engine: status.engine || '',
  };
}

// OCR satırlarını dikey aralığa göre paragraf bloklarına gruplar — çeviri
// hattı bu blokları metin katmanlı sayfayla aynı sözleşmeyle tüketir.
function ocrLinesToBlocks(lines, pageNumber) {
  const sorted = [...lines].sort((a, b) => (a.box?.top ?? 0) - (b.box?.top ?? 0)
    || (a.box?.left ?? 0) - (b.box?.left ?? 0));
  const heights = sorted.map((line) => Math.max(1, (line.box?.bottom ?? 0) - (line.box?.top ?? 0)))
    .sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 10;
  const groups = [];
  let current = null;
  for (const line of sorted) {
    const top = line.box?.top ?? 0;
    if (current && top - current.bottom > medianH * 1.6) { groups.push(current); current = null; }
    if (!current) current = { texts: [], scores: [], bottom: top };
    current.texts.push(line.text);
    current.scores.push(line.score);
    current.bottom = Math.max(current.bottom, line.box?.bottom ?? top);
  }
  if (current) groups.push(current);
  return groups.map((group, index) => ({
    id: `${pageNumber}:ocr:${index}`,
    source: group.texts.join(' '),
    score: group.scores.reduce((sum, value) => sum + value, 0) / Math.max(1, group.scores.length),
  }));
}

// Madde 37 — sayfa başına OCR durum rozeti: motor yokluğu, düşük güven ve
// dil paketi notu açık gösterilir; metin katmanlı sayfada not üretilmez.
function renderPdfOcrNote(pageNumber, entry) {
  if (!entry?.translation || !entry.ocr) return;
  entry.translation.querySelector('.pdf-ocr-note')?.remove();
  const note = document.createElement('div');
  note.className = 'pdf-ocr-note';
  const ocr = entry.ocr;
  const percent = Math.round((ocr.meanScore || 0) * 100);
  if (ocr.unavailable) {
    note.classList.add('pdf-ocr-warn');
    note.textContent = interfaceChoice(
      `OCR motoru kurulu değil: ${ocr.status?.error || 'RapidOCR bulunamadı'} — backend/requirements-browser-tools.txt paketlerini kurun.`,
      `OCR engine unavailable: ${ocr.status?.error || 'RapidOCR not found'} — install backend/requirements-browser-tools.txt.`);
  } else if (ocr.failed) {
    note.classList.add('pdf-ocr-warn');
    note.textContent = interfaceChoice(`OCR başarısız: ${ocr.error}`, `OCR failed: ${ocr.error}`);
  } else if (!ocr.lines?.length) {
    note.textContent = interfaceChoice(
      'Bu sayfada metin katmanı yok; OCR da metin bulamadı.',
      'No text layer on this page; OCR found no text.');
  } else if (ocr.lowConfidence) {
    note.classList.add('pdf-ocr-warn');
    note.textContent = interfaceChoice(
      `OCR düşük güven (%${percent}) — ${ocr.languageNote || 'sonucu gözden geçirin.'}`,
      `Low OCR confidence (${percent}%) — ${ocr.languageNote || 'review the result.'}`);
  } else {
    note.textContent = interfaceChoice(
      `OCR ile ${ocr.lines.length} satır çıkarıldı (güven %${percent}).`,
      `OCR extracted ${ocr.lines.length} lines (${percent}% confidence).`);
  }
  entry.translation.querySelector('h3')?.after(note) || entry.translation.prepend(note);
}

function renderPdfTranslation(pageNumber, blocks) {
  const entry = player.pdfReader?.pages.get(pageNumber); if (!entry) return;
  if (!entry.translation) return;
  entry.translation.querySelectorAll('p, .pdf-pair').forEach((node) => node.remove());
  for (const block of blocks || []) {
    // Madde 36 — kaynak/hedef eşleşmesi: her blok kaynak metni (küçük,
    // soluk) ve çevirisiyle çift olarak çizilir; tür (başlık/dipnot/tablo)
    // sınıf olarak taşınır. Eskiden yalnız çeviri gösteriliyordu.
    const pair = document.createElement('div');
    pair.className = 'pdf-pair';
    pair.dataset.blockId = block.id || '';
    pair.tabIndex = 0;
    if (block.kind) pair.classList.add(`pdf-kind-${block.kind}`);
    if (block.orderAmbiguous) pair.classList.add('pdf-pair-ambiguous');
    const src = document.createElement('p');
    src.className = 'pdf-pair-source';
    src.textContent = block.source || '';
    const tgt = document.createElement('p');
    tgt.className = 'pdf-pair-target';
    // Madde 37 — kullanıcı düzeltmesi makine çevirisinin üstünde gösterilir;
    // kaynak metin küçük satırda kalır, düzeltme işareti verilir.
    tgt.textContent = block.userText || block.translation || block.source || '';
    if (block.userText) {
      pair.classList.add('pdf-pair-edited');
      const note = document.createElement('span');
      note.className = 'pdf-pair-editnote';
      note.textContent = interfaceChoice('✎ düzeltildi', '✎ edited');
      tgt.appendChild(note);
      tgt.title = block.translation || '';
    }
    if (!block.translation && !block.userText) tgt.classList.add('pdf-pair-pending');
    if (block.orderAmbiguous) {
      const marker = document.createElement('span');
      marker.className = 'pdf-pair-ambiguous-note';
      marker.textContent = interfaceChoice('sıra belirsiz', 'order uncertain');
      src.appendChild(marker);
    }
    pair.append(src, tgt);
    // Madde 36 — tek tık/Enter/Space: çift görünümde kaynak sayfadaki
    // karşılığa kayan işaret + odak halkası. İki görünüm aynı sırada ilerler.
    pair.addEventListener('click', () => focusPdfCounterpart(pageNumber, block.id, pair));
    pair.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusPdfCounterpart(pageNumber, block.id, pair); }
    });
    // Madde 36 — çift tıklayınca hedef metin düzeltme diyaloğu açılır;
    // düzeltme pdf:editBlock ile kalıcı yazılır.
    pair.addEventListener('dblclick', () => editPdfBlockPair(pageNumber, block, pair).catch((error) => logLine(error?.message || error, 'error')));
    entry.translation.appendChild(pair);
  }
}

// Madde 36/37 — çift tıklanan çiftin hedefini düzeltme diyaloğu; boş
// metin girilirse düzeltme kaldırılır. userText kalıcı state'e yazılır
// ve yeniden işlemelerde korunur.
async function editPdfBlockPair(pageNumber, block, pair) {
  const reader = player.pdfReader;
  if (!reader?.pdfHash || !window.api.editPdfBlock) return;
  const current = block.userText || block.translation || '';
  const value = await openAppDialog({
    title: interfaceChoice('Çeviriyi düzelt', 'Edit translation'),
    description: interfaceChoice('Elle düzeltilen metin kalıcıdır ve yeniden çeviride korunur. Boş bırakırsan makine çevirisine döner.', 'Your edit is stored and kept across re-runs. Leave empty to restore the machine translation.'),
    confirmLabel: interfaceChoice('Kaydet', 'Save'),
    intent: 'primary',
    inputLabel: interfaceChoice('Hedef metin', 'Target text'),
    inputValue: current,
    inputMaxLength: 24000,
  });
  if (value === false) return;
  const result = await window.api.editPdfBlock(reader.pdfHash, pageNumber, block.id, String(value || ''), $('pdfTargetLanguage')?.value || 'tr');
  if (!result?.ok) { logLine(`PDF düzeltme yazılamadı: ${result?.error || 'bilinmeyen hata'}`, 'error'); return; }
  Object.assign(block, result.block);
  const pages = reader.state?.pages || {};
  const list = pages[String(pageNumber)] || [];
  const index = list.findIndex((row) => row.id === block.id);
  if (index >= 0) list[index] = result.block;
  renderPdfTranslation(pageNumber, list.length ? list : [result.block]);
}

// Madde 36 — çift görünümde seçili bloğun kaynak taraftaki karşılığı:
// tabIndex ile klavye odağı alınır; Enter/Space ile de tetiklenir.
function focusPdfCounterpart(pageNumber, blockId, pair) {
  const reader = player.pdfReader;
  const entry = reader?.pages.get(pageNumber);
  if (!entry?.article) return;
  entry.article.querySelectorAll('.pdf-pair-focus').forEach((node) => node.classList.remove('pdf-pair-focus'));
  pair.classList.add('pdf-pair-focus');
  const source = entry.article.querySelector('.pdf-page-source');
  if (!source) return;
  source.querySelectorAll('.pdf-source-marker').forEach((node) => node.remove());
  const blocks = (reader.state?.pages?.[String(pageNumber)] || reader.pages.get(pageNumber)?.blocks) || [];
  const block = blocks.find((row) => row.id === blockId);
  if (!block?.box || !entry.pageHeight) return;
  const canvas = source.querySelector('canvas');
  if (!canvas) return;
  const fracTop = 1 - (block.box.top / entry.pageHeight);
  const fracBottom = 1 - (block.box.bottom / entry.pageHeight);
  const marker = document.createElement('div');
  marker.className = 'pdf-source-marker';
  marker.style.top = `${Math.max(0, Math.min(1, fracTop)) * 100}%`;
  marker.style.height = `${Math.max(0.01, fracBottom - fracTop) * 100}%`;
  source.style.position = 'relative';
  source.appendChild(marker);
  marker.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// Madde 38 — sayfa seçimi: "1-4, 8" aralığı, yalnız başarısız sayfalar veya
// henüz çevrilmemiş sayfalar. pdf-translate.js'in parsePdfPageSelection'ı
// renderer yolunu karşılamaz çünkü o modül renderer'da require edilemez;
// burada aynı sözleşmenin tarayıcı kopyası tutulur (ratchet testi
// metin eşleşmesiyle ikisini bağlar).
function parsePdfPageSelectionInput(input, numPages) {
  const limit = Math.max(0, Math.trunc(Number(numPages) || 0));
  const text = String(input ?? '').trim();
  if (!text) return { pages: [], scope: 'all' };
  const pages = new Set();
  for (const part of text.split(',')) {
    const piece = part.trim();
    const match = /^(\d{1,7})(?:\s*-\s*(\d{1,7}))?$/.exec(piece);
    if (!match) return null;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < start || (limit && end > limit)) return null;
    for (let page = start; page <= end; page += 1) {
      if (!limit || page <= limit) pages.add(page);
    }
  }
  return { pages: [...pages].sort((a, b) => a - b), scope: 'range' };
}

// Madde 38 — başarısız sayfalar: blocks dizisinde en az bir status==='failed'
// veya çeviri hiç kaydedilmeden istek gönderilmiş sayfalar (sayfa state'te
// yok ama önceki koşuda istendi → failedPages kümesi).
function pdfFailedPages(reader) {
  const numPages = Number(reader?.pdf?.numPages) || 0;
  const failed = new Set();
  const statePages = reader?.state?.pages || {};
  for (let page = 1; page <= numPages; page += 1) {
    const blocks = statePages[String(page)];
    if (Array.isArray(blocks) && blocks.some((block) => block?.status === 'failed')) failed.add(page);
  }
  for (const page of reader?.lastFailedPages || []) failed.add(page);
  return [...failed].sort((a, b) => a - b);
}

// Madde 38 — çevrilmemiş sayfalar: state kaydında eksik olan VEYA içindeki
// blokların tamamı translated/skipped olmayan sayfalar.
function pdfUntranslatedPages(reader) {
  const numPages = Number(reader?.pdf?.numPages) || 0;
  const statePages = reader?.state?.pages || {};
  const list = [];
  for (let page = 1; page <= numPages; page += 1) {
    const blocks = statePages[String(page)];
    const complete = Array.isArray(blocks) && blocks.length > 0
      && blocks.every((block) => block?.status === 'translated' || block?.status === 'skipped');
    if (!complete) list.push(page);
  }
  return list;
}

// Madde 38 — "Sayfa seç" diyaloğu: aralık girdisi + kapsam seçeneği
// (aralık / yalnız başarısızlar / çevrilmemişler). Sonuç sıralı sayfa
// listesi döner veya iptalde null.
async function choosePdfPageScope(reader) {
  const failed = pdfFailedPages(reader);
  const untranslated = pdfUntranslatedPages(reader);
  const numPages = Number(reader?.pdf?.numPages) || 0;
  const result = await openAppDialog({
    title: interfaceChoice('Çevrilecek sayfaları seç', 'Select pages to translate'),
    description: interfaceChoice(
      `${numPages} sayfalık belge — ${failed.length} başarısız, ${untranslated.length} çevrilmemiş.`,
      `${numPages}-page document — ${failed.length} failed, ${untranslated.length} untranslated.`),
    confirmLabel: interfaceChoice('Çevir', 'Translate'),
    intent: 'primary',
    inputLabel: interfaceChoice('Sayfa aralığı (örn. 1-4, 8, 12-15)', 'Page range (e.g. 1-4, 8, 12-15)'),
    inputValue: '',
    inputMaxLength: 400,
    choices: [
      { value: 'range', label: interfaceChoice('Aralık', 'Range') },
      { value: 'failed', label: interfaceChoice(`Başarısızlar (${failed.length})`, `Failed (${failed.length})`) },
      { value: 'untranslated', label: interfaceChoice(`Çevrilmemiş (${untranslated.length})`, `Untranslated (${untranslated.length})`) },
    ],
    choiceLabel: interfaceChoice('Kapsam', 'Scope'),
    choiceValue: 'range',
  });
  if (result === false || result == null) return null;
  const choice = typeof result === 'object' ? result.choice : 'range';
  if (choice === 'failed') {
    if (!failed.length) { pdfReaderSetStatus(interfaceChoice('Başarısız sayfa yok.', 'No failed pages.')); return []; }
    return failed;
  }
  if (choice === 'untranslated') {
    if (!untranslated.length) { pdfReaderSetStatus(interfaceChoice('Tüm sayfalar çevrilmiş.', 'All pages are translated.')); return []; }
    return untranslated;
  }
  const text = typeof result === 'object' ? result.text : '';
  const parsed = parsePdfPageSelectionInput(text, numPages);
  if (!parsed || !parsed.pages.length) {
    pdfReaderSetStatus(interfaceChoice(
      `Geçersiz sayfa aralığı: "${text}" — örn. 1-4, 8, 12-15`,
      `Invalid page range: "${text}" — e.g. 1-4, 8, 12-15`), true);
    return null;
  }
  return parsed.pages;
}

async function chooseCollectionName(title, initial = '') {
  const value = await openAppDialog({
    title, description: 'Koleksiyon adı en fazla 80 karakter olabilir.', confirmLabel: 'Uygula',
    intent: 'primary', inputLabel: 'Koleksiyon adı', inputValue: initial,
  });
  return value === false ? '' : String(value || '').trim();
}

async function selectedCollectionName() {
  const filter = $('playerLibraryFilter')?.value || '';
  if (filter.startsWith('collection:')) return filter.slice(11);
  const names = [...new Set(watchLibraryCache.flatMap((item) => item.collections || []))];
  if (!names.length) return '';
  const value = await openAppDialog({
    title: 'Koleksiyon seç', description: 'İşlem yapılacak koleksiyonun adını yazın.', confirmLabel: 'Seç',
    intent: 'primary', inputLabel: 'Koleksiyon adı', inputValue: names[0],
  });
  return value === false ? '' : String(value || '').trim();
}

async function applyCollectionResult(result, successText) {
  if (!result?.ok) {
    logLine(`Koleksiyon güncellenemedi: ${result?.error || 'bilinmeyen hata'}`, 'error');
    return false;
  }
  playerLibrarySelected.clear();
  await refreshWatchLibrary();
  osd(successText);
  return true;
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

function sourceSnapshotMatches(snapshot,side) {
  const stored=readSourceEdits();
  return !snapshot || Object.entries(snapshot[side]).every(([key,value])=>JSON.stringify(stored[key]||[])===JSON.stringify(value));
}

function revertBrowserCueToModel() {
  const context = player.browserCueEditContext;
  const track = browserLoadedTrack(!!context?.secondary);
  const before = browserEditRecord(context);
  if (!context || !track || !before?.hasOverride) return;
  replaceBrowserEditRecord(context, null);
  player.cueEditUndo.push({ kind: 'browser-override', mediaKey: player.mediaKey, trackId: track.id,
    identity: { ...context }, before: { ...before }, after: null, at: Date.now() });
  player.cueEditUndo = player.cueEditUndo.slice(-100);
  player.cueEditRedo = [];
  refreshBrowserEditedChannel(track.id);
  saveActiveBrowserTabWorkspace();
  updateCueEditHistoryButtons();
  closeCueEditor();
  osd('Model çevirisine dönüldü');
}

// --- Tarayıcı sekme şeridi yardımcıları (R153 dilim-2) ------------------

function browserTabLabel(tab) {
  let label = '';
  if (tab && tab.title) label = tab.title;
  else try { label = new URL(tab && tab.url || '').hostname; } catch (_) { label = interfaceChoice('Yeni sekme', 'New tab'); }
  return label.length > 80 ? `${label.slice(0, 77)}…` : label;
}

function syncBrowserTabAudioButton(audio, tab) {
  if (!audio) return;
  audio.hidden = !tab.audible && !tab.tabMuted;
  const muted = !!tab.tabMuted;
  if (audio.dataset.muted !== String(muted) || !audio.firstChild) {
    audio.dataset.muted = String(muted);
    audio.replaceChildren(browserTabAudioIcon(muted));
  }
  audio.title = tab.tabMuted ? 'Sekmenin sesini aç' : 'Sekmeyi sessize al';
  audio.setAttribute('aria-label', audio.title);
  audio.setAttribute('aria-pressed', tab.tabMuted ? 'true' : 'false');
}

function browserTabActivity(tab) {
  const tasks = [];
  if (tab?.loading) tasks.push(interfaceChoice('Sayfa yükleniyor', 'Page loading'));
  if (tab?.browserMangaBusy) tasks.push(interfaceChoice('Manga çevirisi', 'Manga translation'));
  if (tab?.browserPageTranslateBusy) tasks.push(interfaceChoice('Sayfa çevirisi', 'Page translation'));
  if (tab?.browserTranslationTrackId && tab?.browserTranslationComplete === false) tasks.push(interfaceChoice('Altyazı çevirisi', 'Subtitle translation'));
  return { busy: tasks.length > 0, label: tasks.join(' · ') };
}

function closeBrowserTabMenu() {
  const wasOpen = !!browserTabMenuEl;
  browserTabMenuEl?.remove();
  browserTabMenuEl = null;
  if (wasOpen) syncBrowserOcclusion();
  document.removeEventListener('mousedown', browserTabMenuOutside, true);
}

function browserTabMenuOutside(e) {
  if (browserTabMenuEl && !browserTabMenuEl.contains(e.target)) closeBrowserTabMenu();
}

async function duplicateBrowserTab(tab) {
  if (!tab) return;
  const created = await createBrowserTab();
  const url = String(tab.url || '');
  if (created && url && /^https?:\/\//i.test(url)) {
    await window.api.navigateBrowser?.(created.id, url).catch(() => null);
  }
}

async function closeOtherBrowserTabs(keepId) {
  for (const t of player.browserTabs.slice()) {
    if (t.id !== keepId && !t.pinned) await closeBrowserTab(t.id);
  }
}

// Ekrandaki sıra: grup üyeleri grubun ilk üyesinin yerinde bir arada çizilir
// (browserTabDisplayRows ile aynı kural), katlanmış grupların sekmeleri dahil.
// Ham player.browserTabs sırası gruplar varken ekrandan farklı olabiliyordu;
// "Sağdaki sekmeleri kapat" soldakileri kapatabiliyor ya da yanlışlıkla pasif kalıyordu.
function browserTabsInScreenOrder() {
  const keyOf = (tab) => {
    const group = window.BrowserTabLayout?.normalizeTabGroup(tab.group);
    return group ? `${group.name.toLowerCase()}|${group.color}` : '';
  };
  const ordered = [];
  const emitted = new Set();
  for (const tab of player.browserTabs) {
    const key = keyOf(tab);
    if (!key) { ordered.push(tab); continue; }
    if (emitted.has(key)) continue;
    emitted.add(key);
    for (const member of player.browserTabs) if (keyOf(member) === key) ordered.push(member);
  }
  return ordered;
}

function browserTabsRightOf(tabId) {
  const ordered = browserTabsInScreenOrder();
  const idx = ordered.findIndex((t) => t.id === tabId);
  return idx < 0 ? [] : ordered.slice(idx + 1).filter((t) => !t.pinned);
}

async function closeRightBrowserTabs(tabId) {
  for (const t of browserTabsRightOf(tabId)) await closeBrowserTab(t.id);
}

function showBrowserTabPreview(tabId, anchor) {
  const tab = browserTabState(tabId);
  if (!tab || !anchor) return;
  hideBrowserTabPreview();
  const card = document.createElement('div');
  card.className = 'browser-tab-preview';
  card.setAttribute('role', 'tooltip');
  const title = document.createElement('div');
  title.className = 'browser-tab-preview-title';
  title.textContent = tab.title || window.UiLocale?.t('Yeni sekme') || interfaceChoice('Yeni sekme', 'New tab');
  const url = document.createElement('div');
  url.className = 'browser-tab-preview-url';
  url.textContent = tab.url || '';
  card.append(title, url);
  const chips = [];
  if (tab.pinned) chips.push(window.UiLocale?.t('Sabit') || 'Sabit');
  if (tab.loading) chips.push(window.UiLocale?.t('Yükleniyor') || 'Yükleniyor');
  if (tab.tabMuted) chips.push(window.UiLocale?.t('Sessiz') || 'Sessiz');
  else if (tab.audible) chips.push('♪');
  if (chips.length) {
    const row = document.createElement('div');
    row.className = 'browser-tab-preview-chips';
    row.textContent = chips.join(' · ');
    card.appendChild(row);
  }
  document.body.appendChild(card);
  browserTabPreviewEl = card;
  let cw = card.offsetWidth;
  let ch = card.offsetHeight;
  const rect = anchor.getBoundingClientRect();
  // Native WebContentsView renderer DOM'unun üstünde durur — kartın alt kenarı
  // sayfa yüzeyinin başladığı çizgiyi geçerse kırpılmış görünür. Bu yüzden üst
  // sınır pencere yüksekliği değil, slot'un üst kenarıdır.
  const slotTop = $('browserViewSlot')?.getBoundingClientRect?.().top;
  const topLimit = Number.isFinite(slotTop) && slotTop > 0 ? Math.min(window.innerHeight, slotTop) : window.innerHeight;
  // Tam kart krom şeridinden uzunsa içerik sırıtırdı; tek satırlık kompakt
  // varyanta düşüp yeniden ölç (url/rozet satırları CSS ile gizlenince kart
  // daralır — genişlik de yeniden ölçülür, yoksa hizalama bayat kalır).
  if (ch > topLimit - 8) {
    card.className += ' is-compact';
    cw = card.offsetWidth;
    ch = card.offsetHeight;
  }
  card.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - cw - 4))}px`;
  card.style.top = `${Math.max(4, Math.min(rect.bottom + 6, topLimit - ch - 4))}px`;
  // Kart krom alanından uzunsa kendi içinde kırpılır — native yüzeyin altına
  // taşan kısım hiçbir zaman görünmez; sınırı aşan içerik yerine kartı küçült.
  card.style.maxHeight = `${Math.max(16, topLimit - 8)}px`;
}

// --- R153 dilim-3: kuyruk / hesap / menü yardımcıları ---

function scheduleQueuePersist(delay = 80) {
  if (!_queuePersistenceReady || !window.api.saveQueueState) return;
  clearTimeout(_queuePersistTimer);
  _queuePersistTimer = setTimeout(persistQueueNow, Math.max(0, delay));
}

function removeFromQueue(id) {
  // Çalışan item silinemez
  const item = state.queue.find(x => x.id === id);
  if (!item || item.status === 'running') return;
  const buttons = [...document.querySelectorAll('.queue-remove[data-id]')];
  const removedIndex = buttons.findIndex((button) => Number(button.dataset.id) === id);
  state.queue = state.queue.filter(x => x.id !== id);
  renderQueue();
  const remaining = [...document.querySelectorAll('.queue-remove[data-id]')];
  remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)]?.focus?.();
}

function moveQueueItem(id, delta) {
  // Yalnız bekleyen işler yeniden sıralanır — çalışan/terminal öğelerin dizi
  // konumu dokunulmaz; işlem sırası 'pending' öğelerin göreli dizilimidir.
  const pendingIdx = state.queue
    .map((item, index) => (item.status === 'pending' ? index : -1))
    .filter((index) => index >= 0);
  const slot = pendingIdx.indexOf(state.queue.findIndex((entry) => entry.id === id));
  const neighbor = slot + (delta < 0 ? -1 : 1);
  if (slot < 0 || neighbor < 0 || neighbor >= pendingIdx.length) return;
  const queue = state.queue.slice();
  const a = pendingIdx[slot]; const b = pendingIdx[neighbor];
  [queue[a], queue[b]] = [queue[b], queue[a]];
  state.queue = queue;
  renderQueue();
}

function queueItemMeta(item) {
  const opts = item?.opts && typeof item.opts === 'object' ? item.opts : {};
  const source = item?.type === 'youtube' ? 'YouTube' : 'Dosya';
  const model = String(opts.model || 'varsayılan').trim().slice(0, 40);
  const engine = String(opts.engine || 'faster').trim().slice(0, 32);
  const formats = String(opts.formats || 'srt').split(',').map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z0-9+_-]{1,12}$/.test(value)).join('+') || 'SRT';
  const language = opts.translate ? 'Çeviri ' + String(opts.translateTo || 'tr').trim().slice(0, 12).toUpperCase() : 'Kaynak ' + String(opts.language || 'otomatik').trim().slice(0, 12);
  return [source, model, engine, formats, language].filter(Boolean).join(' · ');
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function detailsMenuFocusable(menu) {
  return Array.from(menu.querySelectorAll('button, select, summary, [role="menuitem"]'))
    .filter((el) => !el.disabled && el.offsetParent !== null && !el.closest('summary'));
}

async function switchYoutubeAccount(id) {
  const res = await window.api.youtubeAccountSwitch(id).catch(() => null);
  if (!res || !res.ok) {
    osd((res && res.error) || 'Hesap değiştirilemedi.', 4000);
    return;
  }
  syncYoutubeSessionFromPayload(res.data);
  const as = $('ytLoggedAs');
  if (as) as.textContent = (window.UiLocale?.t('Hesap:') || 'Hesap:') + ' ' + (youtubeUserName || 'YouTube');
  renderYoutubeAccounts(res.data.accounts);
  osd(`YouTube${youtubeUserName ? `: ${youtubeUserName}` : ''}`);
  if (['home', 'subscriptions', 'history'].includes(stCurrentSection)) {
    renderSmartTubeSection(stCurrentSection, { force: true });
  }
}

async function removeYoutubeAccount(id) {
  const res = await window.api.youtubeAccountRemove(id).catch(() => null);
  if (!res || !res.ok) {
    osd((res && res.error) || 'Hesap çıkarılamadı.', 4000);
    return;
  }
  syncYoutubeSessionFromPayload(res.data);
  const as = $('ytLoggedAs');
  if (as) as.textContent = (window.UiLocale?.t('Hesap:') || 'Hesap:') + ' ' + (youtubeUserName || 'YouTube');
  renderYoutubeAccounts(res.data.accounts);
  if (!youtubeLoggedIn) {
    // Son hesap da çıkarıldı — giriş ekranına dön.
    closeYoutubeLogin();
  }
  const message = res.remoteOk === false
    ? 'Hesap çıkarıldı; Google erişimi kaldırılamadı.'
    : 'Hesap çıkarıldı';
  osd(window.UiLocale?.t(message) || message, res.remoteOk === false ? 6000 : 2000);
  if (['home', 'subscriptions', 'history'].includes(stCurrentSection)) {
    renderSmartTubeSection(stCurrentSection, { force: true });
  }
}

// Bırakılan link metninden güvenli hedef URL seçimi (R323-7).
// text/uri-list spec'inde '#' ile başlayan satırlar yorumdur; düz metin
// yedeğinde de aynı süzgeç uygulanır. Yalnız http/https kabul edilir —
// file:, javascript:, data:, chrome: gibi şemalar ve şemasız girişler null
// döner, böylece çağıran taraf alanı boş bırakır.
function pickDroppedLink(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  for (const rawLine of text.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    for (const token of line.split(/\s+/)) {
      if (/^https?:\/\//i.test(token)) return token;
    }
  }
  return null;
}
