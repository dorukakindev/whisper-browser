(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const modal = el('dubGeneratorDialog');
  let srt = '', cfg = null, current = null, output = null;
  let timer = null, logPath = null;
  let runtimePhases={},runtimeError='';
  const activeGroups=new Map();
  function showActivity(){const en=window.UiLocale?.get?.()==='en';el('dubGeneratorActivity').textContent=[...activeGroups.values()].map(g=>(en?'Group ':'Grup ')+g.group+' · '+(en?'attempt ':'deneme ')+g.attempt+' · '+Math.floor(g.elapsed)+' / '+g.limit+' s').join(' | ');}
  let plan = null, edits = {}, planning = false;
  let backgroundSource = '', choosing = false, configSequence = 0;
  let deliverySource = '';
  let lastRequest = null, lastReferenceQuality = null;
  const results = new Map();
  const resultOptions = new Map();
  const t = text => window.UiLocale?.t(text) || text;
  const presetSpecs = {
    Balanced: {profile:'quality', concurrency:'4', grouping:'akici', verification:'balanced', timingMode:'video', naturalSpeech:true, autoFit:true},
    Fast: {profile:'fast', concurrency:'4', grouping:'akici', verification:'fast', timingMode:'video', naturalSpeech:false, autoFit:false},
    Careful: {profile:'quality', concurrency:'4', grouping:'akici', verification:'detailed', timingMode:'video', naturalSpeech:true, autoFit:true},
  };
  function generationError(value) {
    const message=String(value||'');
    if(!/(?:GPU memory busy|KV cache calculation|no safe memory budget|CUDA.{0,30}out of memory|CUDA OOM)/i.test(message))return message;
    const advice=window.UiLocale?.get?.()==='en'
      ? 'A safe GPU memory budget could not be allocated. Finish another GPU job or close a GPU-heavy application, then retry with fewer parallel groups. Changing the voice reference is not required.'
      : 'GPU için güvenli bellek bütçesi ayrılamadı. Diğer GPU işinin bitmesini bekleyin veya GPU kullanan ağır uygulamayı kapatıp daha az paralel grupla yeniden deneyin. Referans sesi değiştirmeniz gerekmiyor.';
    return advice+'\n\n'+message;
  }
  function runtimeLabels(){const en=window.UiLocale?.get?.()==='en';el('dubKeepEngineLabel').textContent=en?'Keep the engine ready for 60 seconds after production':'Üretimden sonra motoru 60 saniye hazır tut';el('dubRuntimeHint').textContent=en?'GPU memory determines actual parallel capacity. Disabling keep-ready releases the previous engine when the next job starts; an idle engine closes automatically.':'Gerçek paralellik GPU belleğine göre belirlenir. Hazır tutmayı kapatınca önceki motor sonraki iş başlarken bırakılır; boşta kalan motor otomatik kapanır.';phaseSummary(runtimePhases);if(runtimeError)el('dubGeneratorDetails').textContent=generationError(runtimeError);}
  function phaseSummary(phases){runtimePhases=phases;const en=window.UiLocale?.get?.()==='en',labels={model_load:en?'Model':'Model',reference:en?'Reference':'Referans',synthesis:en?'Speech':'Ses',verification:en?'Verification':'Doğrulama',text_edit:en?'Text editing':'Metin düzenleme',placement:en?'Timing':'Zamanlama',file_write:en?'File writing':'Dosya yazımı',wall:en?'Total elapsed':'Geçen toplam'};el('dubPhaseSummary').textContent=Object.entries(labels).filter(([key])=>Number.isFinite(phases[key+'_seconds'])).map(([key,label])=>label+': '+phases[key+'_seconds'].toFixed(1)+' '+(en?'s':'sn')).join(' · ');}
  runtimeLabels();document.addEventListener('ui-locale-change',runtimeLabels);
  function refreshOverview() {
    const source = el('dubReadySource'), voice = el('dubReadyVoice'), range = el('dubReadyRange');
    source.textContent = srt ? basename(srt) : t('SRT seçilmedi'); source.dataset.ready = String(!!srt);
    voice.textContent = cfg?.reference ? basename(cfg.reference) : t('Ses seçilmedi'); voice.dataset.ready = String(!!cfg?.ready);
    range.textContent = !el('dubRangeEnabled').checked ? t('Altyazının tamamı') : `${el('dubRangeStart').value} → ${el('dubRangeEnd').value}`;
    let selected = '';
    for (const [name, settings] of Object.entries(presetSpecs)) {
      const matches = Object.entries(settings).every(([key,value]) => typeof value === 'boolean'
        ? el(`dub${key[0].toUpperCase()}${key.slice(1)}`).checked === value
        : el(`dub${key[0].toUpperCase()}${key.slice(1)}`).value === value);
      el(`dubPreset${name}`).setAttribute('aria-pressed', String(matches));
      if (matches) selected = name;
    }
    el('dubPresetSummary').textContent = t(selected === 'Fast' ? 'Hızlı profil: AI düzenlemesi kapalı; ses denetimiyle kısa bekleme.'
      : selected === 'Careful' ? 'Ayrıntılı profil: bütün parçalar metin denetiminden geçer; daha uzun sürer.'
      : selected === 'Balanced' ? 'Dengeli profil: akıcı bloklar, 15 adım ve konuşmayı koruyan zamanlama.'
      : 'Özel ayarlar etkin. Hazır profiller sesinizi ve seçili aralığı değiştirmez.');
  }
  function qualityInfo() {
    const row = results.get(el('dubQualityGroup').value);
    const labels = {ready:'Hazır',review:'Dinleyerek kontrol edin',failed:'Üretilemedi; bu bölüm sessiz',
      passed:'Metin doğrulandı',not_checked:'Metin denetlenmedi',unavailable:'Metin doğrulanamadı'};
    el('dubQualityInfo').textContent = row ? [t(labels[row.status]), t(labels[row.verification?.status] || 'Metin denetlenmedi'),
      row.rewritten ? t('Süreye göre düzenlendi') : row.naturalEdited ? t('Doğal konuşma için düzenlendi') : ''].filter(Boolean).join(' · ') : '';
  }
  function showResults() {
    const select = el('dubQualityGroup'), previous = select.value;
    select.replaceChildren(); resultOptions.clear();
    for (const row of [...results.values()].sort((a,b) => a.group - b.group)) {
      const option = document.createElement('option'); option.value = row.key;
      option.textContent = `${row.group} · ${t(row.status === 'failed' ? 'Üretilemedi; bu bölüm sessiz' : row.status === 'review' ? 'Dinleyerek kontrol edin' : 'Hazır')}`;
      select.append(option);
      resultOptions.set(row.key, option);
    }
    if (results.has(previous)) select.value = previous;
    qualityInfo();
    controls();
  }
  function updateResult(row) {
    results.set(row.key, row);
    let option = resultOptions.get(row.key);
    if (!option) { option = document.createElement('option'); option.value = row.key;
      el('dubQualityGroup').append(option); resultOptions.set(row.key, option); }
    option.textContent = `${row.group} · ${t(row.status === 'failed' ? 'Üretilemedi; bu bölüm sessiz' : row.status === 'review' ? 'Dinleyerek kontrol edin' : 'Hazır')}`;
    qualityInfo();
  }
  function referenceInfo(quality) {
    lastReferenceQuality = quality;
    const labels = {quiet:'Referans sesi çok kısık',clipping:'Referansta ses patlaması var',silence:'Referansta uzun sessizlik var',short:'Referans çok kısa'};
    el('dubReferenceQuality').textContent = quality ? (quality.warnings || []).map(w => t(labels[w] || w)).join(' · ') || t('Referansın ses düzeyi uygun; konuşmacı ve müziği dinleyerek kontrol edin.') : '';
  }
  const mediaIdentity = () => { const c = window.BrowserDubAudioUI?.context(); return JSON.stringify([c?.mode, c?.tabId, c?.mediaId || c?.mediaKey]); };
  let workspaceBusy = false, referenceBusy = false, rangeContextKey = null, mediaContextKey = null;
  const group = () => plan?.groups[Number(el('dubPlanGroup').value)];
  function timecode(value) {
    const text = value.trim();
    if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(text)) throw new Error('Geçersiz zaman aralığı.');
    return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  function selectedRange() {
    if (!el('dubRangeEnabled').checked) return null;
    const range = { start: timecode(el('dubRangeStart').value), end: timecode(el('dubRangeEnd').value) };
    if (range.end <= range.start || range.end > 86400) throw new Error('Geçersiz zaman aralığı.');
    return range;
  }
  function showGroup() {
    const g = group();
    el('dubPlanOriginal').value = g?.text || '';
    el('dubPlanText').value = g ? (edits[g.key] || g.text) : '';
    el('dubPlanInfo').textContent = g ? `${(g.start / 1000).toFixed(2)}–${(g.end / 1000).toFixed(2)} s · ${g.seconds.toFixed(2)} s · ${Object.keys(edits).length} ✓` : '';
  }
  function elapsed(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    el('dubGeneratorElapsed').textContent = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function stopTimer(seconds) {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (Number.isFinite(seconds)) elapsed(seconds);
  }
  const status = text => { el('dubGeneratorStatus').textContent = text; };
  const basename = name => String(name || '').split(/[\\/]/).pop();
  function controls() {
    const locked = !!current || referenceBusy || planning || choosing || workspaceBusy;
    for (const id of ['dubChooseSrt', 'dubChooseEngine', 'dubChooseVoice', 'dubChooseTranscript', 'dubSampleOnly', 'dubProfile', 'dubConcurrency', 'dubKeepEngine', 'dubTimingMode', 'dubVerification', 'dubAutoFit', 'dubNaturalSpeech']) el(id).disabled = locked;
    el('dubGrouping').disabled = locked;
    el('dubFollowDelivery').disabled = locked;
    el('dubDeliveryStrength').disabled = locked || !el('dubFollowDelivery').checked;
    el('dubChooseDeliverySource').disabled = el('dubResetDeliverySource').disabled = locked || !el('dubFollowDelivery').checked;
    el('dubExpression').disabled = locked || el('dubFollowDelivery').checked;
    el('dubRetryFailed').disabled = locked || !lastRequest || !cfg?.ready;
    el('dubRegenerateGroup').disabled = locked || !lastRequest || !results.size || !cfg?.ready;
    el('dubQualityGroup').disabled = locked || !results.size;
    el('dubGeneratorStart').disabled = locked || !srt || !cfg?.ready;
    el('dubPlanPrepare').disabled = locked || !srt;
    for (const id of ['dubPlanGroup', 'dubPlanText', 'dubPlanShorten', 'dubPlanApply', 'dubPlanReset']) el(id).disabled = locked || !plan;
    el('dubChooseSrt').disabled = locked;
    el('dubKeepBackground').disabled = locked;
    for (const id of ['dubChooseBackground','dubBackgroundReset']) el(id).disabled = locked || !el('dubKeepBackground').checked;
    el('dubRangeEnabled').disabled = locked;
    for (const id of ['dubRangeStart', 'dubRangeEnd', 'dubRangeNow']) el(id).disabled = locked || !el('dubRangeEnabled').checked;
    el('dubGeneratorCancel').disabled = !current;
    el('dubTextStudio').disabled = locked;
    for (const name of Object.keys(presetSpecs)) el(`dubPreset${name}`).disabled = locked;
    refreshOverview();
    window.dispatchEvent(new CustomEvent('dub-generator:busy',{detail:!!current||referenceBusy||planning||choosing}));
    el('browserDubGenerate')?.classList.toggle('active', !!current);
  }
  async function configure(kind) {
    const sequence = ++configSequence;
    const r = await window.api.dubConfig(kind).catch(() => null);
    if (sequence !== configSequence) return;
    if (!r?.ok) { cfg = null; controls(); status(r?.error || 'Ses ayarları yüklenemedi.'); return; }
    cfg = r;
    if(!current)el('dubKeepEngine').checked=r.keepEngine!==false;
    el('dubStorageOpen').disabled = !r.storageRoot;
    if (!current) { el('dubProfile').value = r.profile || 'quality'; el('dubConcurrency').value = String(r.concurrency || 4); }
    if (!current) el('dubTimingMode').value = r.timingMode || 'video';
    if (!current) el('dubExpression').value = r.expression || 'reference';
    if (!current) { el('dubFollowDelivery').checked = r.followDelivery === true; el('dubDeliveryStrength').value = r.deliveryStrength || 'balanced'; }
    if (!current && !plan) el('dubGrouping').value = r.grouping || 'akici';
    if (!current) { el('dubVerification').value = r.verification || 'detailed'; el('dubAutoFit').checked = r.autoFit !== false; el('dubNaturalSpeech').checked = r.naturalSpeech !== false; }
    el('dubEngineName').textContent = r.engine;
    el('dubVoiceName').textContent = basename(r.reference);
    el('dubTranscriptName').textContent = basename(r.transcript);
    if (!current && !r.ready) status('Motor veya referans eksik; ses ve motor ayarlarını kontrol edin.');
    controls();
  }
  function inheritSubtitleRange() {
    if (current || planning) return;
    const context = window.BrowserDubAudioUI?.context();
    const mediaKey = JSON.stringify([context?.mode, context?.tabId, context?.mediaId || context?.mediaKey]);
    if (mediaContextKey !== null && mediaContextKey !== mediaKey) {
      srt = ''; backgroundSource = ''; el('dubSrtName').textContent = '—'; el('dubBackgroundName').textContent = '';
      deliverySource='';el('dubDeliverySourceName').textContent='';
      lastRequest = null; results.clear(); showResults();
    }
    mediaContextKey = mediaKey;
    const range = context?.mode === 'browser' ? context.subtitleRange : null;
    const valid = range && Number.isFinite(range.start) && Number.isFinite(range.end)
      && range.start >= 0 && range.end > range.start && range.end <= 86400;
    const key = JSON.stringify([context?.mode, context?.tabId, context?.mediaId || context?.mediaKey, valid ? range : null]);
    if (rangeContextKey === key) return;
    const hadContext = rangeContextKey !== null; rangeContextKey = key;
    if (!valid && !hadContext) return;
    el('dubRangeEnabled').checked = !!valid;
    const format = seconds => { const ms = Math.round(seconds * 1000), rest = (ms % 60000) / 1000; return `${Math.floor(ms / 60000)}:${rest < 10 ? '0' : ''}${rest}`; };
    el('dubRangeStart').value = valid ? format(range.start) : '0:00';
    el('dubRangeEnd').value = valid ? format(range.end) : '1:00';
    invalidatePlan();
  }
  function preview(file) {
    stopGroupPreview();
    const audio = el('dubGeneratedPreview');
    if (file?.url) audio.src = file.url; else audio.removeAttribute('src');
    audio.classList.toggle('hidden', !file?.url); audio.load();
  }
  async function open() {
    inheritSubtitleRange();
    if (!modal.open) modal.showModal();
    syncBrowserOcclusion();
    await configure();
    if (!current && !output) {
      const r = await window.api.latestDub().catch(() => null);
      if (current || output || !r?.output) return;
      output = r.output; window.DubWorkspaceUI?.setOutput(output); logPath = output.logPath; preview(output);
      el('dubGeneratorOutput').classList.remove('hidden');
      el('dubGeneratorUse').classList.toggle('hidden', output.sample === true || output.syncInvalid === true);
      results.clear(); for (const row of output.quality?.groups || []) results.set(row.key, row); showResults();
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      el('dubGeneratedName').textContent = output.name;
      el('dubGeneratorProgress').value = 100;
      elapsed(output.elapsedSeconds || 0);
      if (output.timing) el('dubGeneratorTiming').textContent = `${output.timing.accelerated} / ${output.timing.clipped}`;
      status(output.syncInvalid ? 'Ses dosyası hazır; zaman haritası geçersiz. Videoyla senkron garanti edilemez.'
        : output.sample ? 'Kısa örnek hazır; tüm video için örnek seçimini kapatın.'
        : output.qualityUnavailable ? 'Ses hazır; kalite raporu okunamadı. Videoya bağlamadan önce sesi dinleyin.'
        : [...results.values()].some(row => row.status !== 'ready') ? 'Ses hazır; işaretli parçaları kontrol edin veya yeniden üretin.'
        : 'Son üretilen ses hazır. Sesi kullan ile açık videoya bağlayabilirsiniz.');
    }
  }
  el('browserDubGenerate').addEventListener('click', open);
  window.addEventListener('dub-workspace:busy', event => { workspaceBusy=!!event.detail; controls(); });
  window.addEventListener('voice-reference:changed', () => { void configure(); });
  window.addEventListener('voice-reference:busy', event => { referenceBusy = !!event.detail; controls(); });
  el('playerDubGenerate')?.addEventListener('click', () => { el('playerMore').open = false; void open(); });
  el('dubMainOpen').addEventListener('click', open);
  window.DubGeneratorUI = Object.freeze({ prepareCurrent: async () => {
    const identity = mediaIdentity();
    const candidate = player.sub2Role === 'translation' && player.sub2Path ? player.sub2Path : player.subPath;
    await open();
    if (identity !== mediaIdentity() || current || planning || srt) return;
    if (typeof candidate === 'string' && /\.srt$/i.test(candidate) && /^(?:[a-z]:[\\/]|[/\\])/i.test(candidate)) {
      srt = candidate; lastRequest = null; results.clear(); showResults(); invalidatePlan();
      el('dubSrtName').textContent = basename(candidate); refreshOverview();
      status('Hazır');
    }
  } });
  el('dubGeneratorClose').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => { el('dubGeneratedPreview').pause(); syncBrowserOcclusion(); });
  el('dubStorageOpen').addEventListener('click', () => { if (cfg?.storageRoot) void window.api.openPath(cfg.storageRoot); });
  async function chooseInput(kind) {
    if (choosing || current || referenceBusy || planning) return;
    const media = mediaIdentity(); choosing = true; controls();
    try {
      const result = kind === 'subtitle' ? await window.api.selectFile('subtitle')
        : kind === 'delivery' ? await window.api.selectVoiceReferenceSource() : await window.api.selectVideo();
      if (media !== mediaIdentity()) { inheritSubtitleRange(); status('Video değişti; dosyayı yeniden seçin.'); return; }
      if (kind === 'delivery') {
        if (result?.ok && !result.cancelled && result.path) {
          deliverySource=result.path;el('dubDeliverySourceName').textContent=basename(deliverySource);
        }
      } else if (kind === 'subtitle') {
        if (typeof result === 'string' && /\.srt$/i.test(result)) {
          srt = result; lastRequest = null; results.clear(); showResults(); invalidatePlan(); el('dubSrtName').textContent = basename(result); status('Hazır');
        } else if (result) status('Bir SRT altyazı dosyası seçin.');
      } else if (Array.isArray(result) && typeof result[0] === 'string') {
        backgroundSource = result[0]; el('dubBackgroundName').textContent = basename(backgroundSource);
      }
    } catch (_) { status('Dosya seçilemedi. Lütfen tekrar deneyin.'); }
    finally { choosing = false; controls(); }
  }
  el('dubChooseSrt').addEventListener('click', () => chooseInput('subtitle'));
  el('dubFollowDelivery').addEventListener('change',controls);
  el('dubChooseDeliverySource').addEventListener('click',()=>chooseInput('delivery'));
  el('dubResetDeliverySource').addEventListener('click',()=>{deliverySource='';el('dubDeliverySourceName').textContent='';});
  el('dubPlanPrepare').addEventListener('click', async () => {
    if (planning || current || referenceBusy || choosing || !srt) return;
    const media = mediaIdentity();
    planning = true; controls();
    try {
      const r = await window.api.planDub({ srt, range: selectedRange(), grouping: el('dubGrouping').value });
      if (media !== mediaIdentity()) { status('Video değişti; dosyayı yeniden seçin.'); return; }
      if (!r?.ok) throw new Error(r?.error || 'SRT planı okunamadı.');
      plan = r; edits = {}; el('dubPlanGroup').replaceChildren();
      r.groups.forEach((g, i) => { const option = document.createElement('option'); option.value = String(i);
        option.textContent = `${i + 1} · ${g.seconds.toFixed(1)} s · ${g.text.slice(0, 65)}`; el('dubPlanGroup').append(option); });
      showGroup();
      // Non-speech cues (music, applause, sound effects) are not spoken; say so.
      status(r.skipped > 0 ? `${t('Cümle grupları hazır')} · ${r.skipped} ${t('ses-dışı altyazı satırı atlandı')}` : 'Cümle grupları hazır');
    } catch (error) { el('dubGeneratorDetails').textContent = error.message; }
    finally { planning = false; inheritSubtitleRange(); controls(); }
  });
  function invalidatePlan() {
    plan = null; edits = {}; lastRequest = null; el('dubPlanGroup').replaceChildren(); showGroup(); controls();
  }
  for (const [name, settings] of Object.entries(presetSpecs)) el(`dubPreset${name}`).addEventListener('click', () => {
    if (current || planning || choosing || referenceBusy || workspaceBusy) return;
    if (plan && el('dubGrouping').value !== settings.grouping) {
      if (Object.keys(edits).length && !window.confirm(t('Gruplama değişince dublaj metni düzenlemeleri sıfırlanacak. Devam edilsin mi?'))) return;
      invalidatePlan();
    }
    for (const [key,value] of Object.entries(settings)) {
      const input = el(`dub${key[0].toUpperCase()}${key.slice(1)}`);
      if (typeof value === 'boolean') input.checked = value; else input.value = value;
    }
    controls();
  });
  for (const id of ['dubProfile','dubConcurrency','dubVerification','dubTimingMode','dubNaturalSpeech','dubAutoFit']) el(id).addEventListener('change', controls);
  for (const id of ['dubRangeEnabled', 'dubRangeStart', 'dubRangeEnd']) el(id).addEventListener('input', invalidatePlan);
  el('dubGrouping').addEventListener('change', () => {
    if (plan && Object.keys(edits).length && !window.confirm(window.UiLocale?.t('Gruplama değişince dublaj metni düzenlemeleri sıfırlanacak. Devam edilsin mi?') || 'Gruplama değişince dublaj metni düzenlemeleri sıfırlanacak. Devam edilsin mi?')) {
      el('dubGrouping').value = plan.grouping || cfg?.grouping || 'akici'; return;
    }
    invalidatePlan();
  });
  el('dubRangeNow').addEventListener('click', () => {
    el('dubRangeStart').value = String(Math.floor(Number(window.BrowserDubAudioUI?.context()?.currentTime) || 0));
    invalidatePlan();
  });
  el('dubPlanGroup').addEventListener('change', showGroup);
  el('dubKeepBackground').addEventListener('change',controls);
  el('dubChooseBackground').addEventListener('click', () => chooseInput('background'));
  el('dubBackgroundReset').addEventListener('click',()=>{backgroundSource='';el('dubBackgroundName').textContent='';});
  el('dubPlanApply').addEventListener('click', () => {
    const g = group(), text = el('dubPlanText').value.trim();
    if (!g || !text) return;
    if (text === g.text) delete edits[g.key]; else edits[g.key] = text;
    showGroup(); status('Dublaj metni uygulandı.');
  });
  el('dubPlanReset').addEventListener('click', () => { const g = group(); if (g) delete edits[g.key]; showGroup(); });
  el('dubPlanShorten').addEventListener('click', async () => {
    if (planning || current || referenceBusy || choosing) return;
    const g = group(); if (!g) return;
    const media = mediaIdentity(), requestedPlan = plan;
    planning = true; controls(); status('Kısaltma önerisi hazırlanıyor…');
    try {
      const r = await window.api.shortenDub(g.key);
      if (media !== mediaIdentity() || plan !== requestedPlan) { status('Video değişti; dosyayı yeniden seçin.'); return; }
      if (!r?.ok) throw new Error(r?.error || 'Uygun bir kısaltma alınamadı.');
      el('dubPlanText').value = r.text; status('Öneriyi kontrol edip Bu metni uygula düğmesine basın.');
    } catch (error) { el('dubGeneratorDetails').textContent = error.message; status('Kısaltma alınamadı; metni elle düzenleyebilirsiniz.'); }
    finally { planning = false; inheritSubtitleRange(); controls(); }
  });
  for (const [id, kind] of [['dubChooseEngine','engine'], ['dubChooseVoice','reference'], ['dubChooseTranscript','transcript']]) {
    el(id).addEventListener('click', async () => {
      if (choosing || current || referenceBusy || planning) return;
      choosing = true; controls();
      try { await configure(kind); } finally { choosing = false; controls(); }
    });
  }
  async function start(retry = false, forceGroups = []) {
    if (current || referenceBusy || planning || choosing || workspaceBusy || !srt || !cfg?.ready) return;
    let range;
    try { range = selectedRange(); } catch (error) { status(error.message); return; }
    current = { id: crypto.randomUUID(), context: window.BrowserDubAudioUI?.context(), sample: retry ? lastRequest?.sample : el('dubSampleOnly').checked };
    const pending = current;
    const started = performance.now();
    elapsed(0); stopTimer();activeGroups.clear();showActivity();
    timer = setInterval(() => elapsed((performance.now() - started) / 1000), 1000);
    logPath = null; el('dubGeneratorLog').classList.add('hidden');
    output = null; window.DubWorkspaceUI?.setOutput(null); preview(null); el('dubGeneratorOutput').classList.add('hidden');
    el('dubGeneratedName').textContent = '';
    el('dubGeneratorUse').classList.add('hidden');
    el('dubGeneratorDetails').textContent = ''; el('dubGeneratorCount').textContent = '';
    el('dubGeneratorTiming').textContent = '';
    el('dubGeneratorProgress').removeAttribute('value');
    runtimePhases={};runtimeError='';el('dubPhaseSummary').textContent='';
    status('Motor yükleniyor…'); controls();
    const payload = retry ? {...lastRequest, id:pending.id, forceGroups,
      dubText: plan ? {sourceHash:plan.sourceHash, edits:{...edits}} : lastRequest.dubText} : { id: pending.id, srt, sample: pending.sample,
      keepEngine:el('dubKeepEngine').checked, profile: el('dubProfile').value, concurrency: Number(el('dubConcurrency').value), grouping: el('dubGrouping').value,
      expression: el('dubExpression').value,
      followDelivery:el('dubFollowDelivery').checked, deliveryStrength:el('dubDeliveryStrength').value,
      prosodySource: deliverySource || pending.context?.backgroundSource || '',
      verification:el('dubVerification').value, autoFit:el('dubAutoFit').checked, naturalSpeech:el('dubNaturalSpeech').checked,
      keepBackground: el('dubKeepBackground').checked, backgroundSource: backgroundSource || pending.context?.backgroundSource || '',
      backgroundTab: pending.context ? {tabId:pending.context.tabId,generation:pending.context.generation,mediaId:pending.context.mediaId || ''} : null,
      timingMode: el('dubTimingMode').value, range, dubText: plan ? { sourceHash: plan.sourceHash, edits:{...edits} } : null };
    lastRequest = payload;
    if (!retry) { results.clear(); showResults(); }
    const r = await window.api.startDub(payload).catch(e => ({ ok:false,error:e.message }));
    if (!r?.ok && current === pending) {
      stopTimer((performance.now() - started) / 1000);
      current = null; el('dubGeneratorProgress').value = 0; status('Ses üretimi başarısız oldu.');
      el('dubGeneratorDetails').textContent = generationError(r?.error); controls();
    }
  }
  el('dubGeneratorStart').addEventListener('click', () => start());
  el('dubRetryFailed').addEventListener('click', () => start(true));
  el('dubRegenerateGroup').addEventListener('click', () => { const key = el('dubQualityGroup').value; if (key) void start(true, [key]); });
  el('dubQualityGroup').addEventListener('change',()=>{qualityInfo();const key=el('dubQualityGroup').value,index=plan?.groups.findIndex(g=>g.key===key);if(index>=0){el('dubPlanGroup').value=String(index);showGroup();el('dubPlanText').focus();}});
  const listenGroup=document.createElement('button');listenGroup.type='button';listenGroup.className='btn btn-secondary btn-sm';listenGroup.textContent=t('Bu grubu dinle');el('dubQualityInfo').after(listenGroup);
  let rangeEnd=null, groupPlayGeneration=0, cancelGroupMetadata=null;
  const groupAudio=el('dubGeneratedPreview');
  function stopGroupPreview() {
    groupPlayGeneration++;rangeEnd=null;
    cancelGroupMetadata?.();cancelGroupMetadata=null;
    groupAudio.pause();
  }
  function metadataReady() {
    if(groupAudio.readyState>=1)return Promise.resolve(true);
    return new Promise(resolve=>{
      let timer;
      const finish=value=>{clearTimeout(timer);groupAudio.removeEventListener('loadedmetadata',ready);groupAudio.removeEventListener('error',failed);if(cancelGroupMetadata===cancel)cancelGroupMetadata=null;resolve(value);};
      const ready=()=>finish(true),failed=()=>finish(false),cancel=()=>finish(false);
      cancelGroupMetadata=cancel;
      groupAudio.addEventListener('loadedmetadata',ready,{once:true});groupAudio.addEventListener('error',failed,{once:true});
      timer=setTimeout(failed,10000);
    });
  }
  groupAudio.addEventListener('timeupdate',()=>{if(rangeEnd!==null&&groupAudio.currentTime>=rangeEnd){groupAudio.pause();rangeEnd=null;}});
  groupAudio.addEventListener('emptied',stopGroupPreview);
  groupAudio.addEventListener('ended',()=>{rangeEnd=null;});
  groupAudio.addEventListener('error',stopGroupPreview);
  listenGroup.onclick=async()=>{
    if(current||workspaceBusy)return;
    stopGroupPreview();
    const row=results.get(el('dubQualityGroup').value),source=output;
    if(!source?.url||!Number.isFinite(row?.audioStart)||!Number.isFinite(row?.audioEnd)||row.audioStart<0||row.audioEnd<=row.audioStart){status('Önce üretimi tamamlayın.');return;}
    const generation=groupPlayGeneration;
    if(!await metadataReady())return;
    if(generation!==groupPlayGeneration||output!==source||!modal.open||current||workspaceBusy)return;
    if(!Number.isFinite(groupAudio.duration)||row.audioStart>=groupAudio.duration){status('Ses aralığı bu dosyada bulunamadı.');return;}
    try {
      rangeEnd=Math.min(row.audioEnd,groupAudio.duration);groupAudio.currentTime=row.audioStart;
      await groupAudio.play();
    } catch(error){if(generation===groupPlayGeneration){rangeEnd=null;status(error.message);}}
  };
  modal.addEventListener('close',stopGroupPreview);
  el('dubQualityGroup').addEventListener('change',stopGroupPreview);


  document.addEventListener('ui-locale-change', () => { showResults(); referenceInfo(lastReferenceQuality); });
  el('dubGeneratorCancel').addEventListener('click', async () => {
    const pending = current;
    if (!pending) return;
    el('dubGeneratorCancel').disabled = true;
    pending.stopping = true;
    status('Durduruluyor…');
    const r = await window.api.cancelDub().catch(() => null);
    if (current !== pending) return;
    if (!r?.ok && current) { current.stopping = false; status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); controls(); }
  });
  el('dubGeneratorOutput').addEventListener('click', () => { if (output) void window.api.openPath(output.path); });
  el('dubGeneratorUse').addEventListener('click', async () => {
    const selected = output;
    if (!selected || selected.sample || selected.syncInvalid) return;
    const context = window.BrowserDubAudioUI?.context();
    if (!context?.tabId || !context.hasMedia || !context.visible) {
      status('Ses eklemek için önce bir video açın.'); return;
    }
    el('dubGeneratedPreview').pause();
    el('dubGeneratorUse').disabled = true;
    try {
      const attached = await window.BrowserDubAudioUI.attachGenerated({ name: selected.name, url: selected.url, range: selected.range, sync: selected.sync, background: selected.background, ...window.DubWorkspaceUI?.attachment(selected) }, context);
      if (output === selected) status(attached ? 'Üretim tamamlandı; dublaj videoya bağlandı.' : 'Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.');
    } catch (_) { status('Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.'); }
    finally { el('dubGeneratorUse').disabled = false; }
  });
  el('dubTextStudio').addEventListener('click', async () => {
    const r = await window.api.openTextVoiceUI().catch(() => null);
    if (!r?.ok) { status('Metin stüdyosu açılamadı.'); el('dubGeneratorDetails').textContent = r?.error || ''; }
    else status('Metin stüdyosu açık. Metin yapıştırabilir veya TXT dosyası seçebilirsiniz.');
  });
  el('dubGeneratorLog').addEventListener('click', () => { if (logPath) void window.api.openPath(logPath); });
  window.api.onDubEvent(event => {
    if (event.type === 'studio_error') { status(event.error || 'Metin seslendirme stüdyosu başlatılamadı.'); return; }
    const job = current;
    if (!job || event.id !== job.id) return;
    if (job.stopping && !['done','error','cancelled'].includes(event.type)) return;
    if (event.type === 'progress') {
      status('Ses üretiliyor…'); el('dubGeneratorCount').textContent = `${event.done}/${event.total}`;
      el('dubGeneratorProgress').value = event.total ? event.done / event.total * 100 : 0;
    } else if(event.type==='activity'){if(Number.isInteger(event.group)&&event.group>0&&(activeGroups.size<8||activeGroups.has(event.group))){activeGroups.set(event.group,event);showActivity();}}
    else if (event.type === 'group') {activeGroups.delete(event.group.group);showActivity();updateResult(event.group);}
    else if(event.type==='phases')phaseSummary(event.phases);
    else if(event.type==='engine'){if(event.kind==='DUB_ENGINE'&&event.reused)status(window.UiLocale?.get?.()==='en'?'Using the ready voice engine…':'Hazır ses motoru kullanılıyor…');if(event.kind==='DUB_CAPACITY')el('dubGeneratorDetails').textContent=(window.UiLocale?.get?.()==='en'?'GPU free memory: ':'GPU boş bellek: ')+event.freeMiB+' MiB · '+event.concurrency+' / '+event.requested;}
    else if (event.type === 'reference_quality') referenceInfo(event.quality);
    else if (event.type === 'concurrency') { status('GPU belleği için paralel üretim azaltıldı.'); el('dubGeneratorDetails').textContent = `${event.concurrency} · ${t('Paralel üretim')}`; }
    else if (event.type === 'status') {if(event.stage==='engine_restart'){activeGroups.clear();showActivity();}status(event.text);}
    else if (event.type === 'warning') el('dubGeneratorDetails').textContent=event.text;
    else if (event.type === 'timing') el('dubGeneratorTiming').textContent = `${event.accelerated} / ${event.clipped}`;
    else if (['done','error','cancelled'].includes(event.type)) {
      activeGroups.clear();showActivity();
      stopTimer(event.elapsedSeconds);
      if (event.type !== 'done' && !el('dubGeneratorProgress').hasAttribute('value')) el('dubGeneratorProgress').value = 0;
      logPath = event.logPath;
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      if (event.logError) el('dubGeneratorDetails').textContent = event.logError;
      current = null; controls();
      if (event.type === 'done') {
        output = event; window.DubWorkspaceUI?.setOutput(output, job.context); preview(output); el('dubGeneratorProgress').value = 100;
        if (event.quality?.groups) { results.clear(); for (const row of event.quality.groups) results.set(row.key, row); showResults(); }
        const needsReview = event.qualityUnavailable === true || [...results.values()].some(row => row.status !== 'ready');
        el('dubGeneratedName').textContent = event.name;
        el('dubGeneratorOutput').classList.remove('hidden');
        el('dubGeneratorUse').classList.toggle('hidden', !!job.sample);
        status(event.qualityUnavailable ? 'Ses hazır; kalite raporu okunamadı. Videoya bağlamadan önce sesi dinleyin.' : needsReview ? 'Ses hazır; işaretli parçaları kontrol edin veya yeniden üretin.' : job.sample ? 'Kısa örnek hazır; tüm video için örnek seçimini kapatın.' : 'Ses hazır. Buradan dinleyebilir veya Sesi kullan ile videoya bağlayabilirsiniz.');
        if (!job.sample && !needsReview && job.context?.hasMedia) {
          void window.BrowserDubAudioUI.attachGenerated({ name:event.name, url:event.url, range:event.range, sync:event.sync, background:event.background, ...window.DubWorkspaceUI?.attachment(event) }, job.context)
            .then(attached => { if (attached && output === event) status('Üretim tamamlandı; dublaj videoya bağlandı.'); })
            .catch(() => { if (output === event) status('Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.'); });
        }
      } else if (event.type === 'cancelled') status('Durduruldu.');
      else {
        status('Ses üretimi başarısız oldu.'); runtimeError=event.error||'';el('dubGeneratorDetails').textContent = generationError(runtimeError);
        if (event.recoverablePath && event.recoverableUrl) {
          output = {path:event.recoverablePath,url:event.recoverableUrl,name:event.name,syncInvalid:true};
          preview(output); el('dubGeneratedName').textContent = event.name || basename(output.path);
          el('dubGeneratorOutput').classList.remove('hidden');
          el('dubGeneratorUse').classList.add('hidden');
        }
      }
    }
  });
  window.addEventListener('dub-workspace:media', () => {
    const c=window.BrowserDubAudioUI?.context();mediaContextKey=mediaIdentity();
    rangeContextKey=JSON.stringify([c?.mode,c?.tabId,c?.mediaId||c?.mediaKey,null]);
  });
  window.addEventListener('dub-workspace:loaded', event => {
    if(current || planning || referenceBusy || choosing) return;
    output=event.detail; preview(output); results.clear();
    for(const row of output.quality?.groups || []) results.set(row.key,row);
    showResults(); el('dubGeneratedName').textContent=output.name;
    el('dubGeneratorOutput').classList.remove('hidden');
    el('dubGeneratorUse').classList.toggle('hidden',output.sample===true || output.syncInvalid===true);
    // A project carries rendered media, not an executable engine request.
    srt=output.subtitle || ''; lastRequest=null; plan=null; edits={};
    el('dubRangeEnabled').checked=!!output.range;
    if(output.range){el('dubRangeStart').value=String(output.range.start);el('dubRangeEnd').value=String(output.range.end);}
    el('dubSrtName').textContent=basename(srt); controls();
    status(output.syncInvalid ? 'Ses dosyası hazır; zaman haritası geçersiz. Videoyla senkron garanti edilemez.'
      : output.qualityUnavailable ? 'Ses hazır; kalite raporu okunamadı. Videoya bağlamadan önce sesi dinleyin.'
      : 'Dublaj projesi açıldı. Videoyu kontrol edip Sesi kullan düğmesine basın.');
  });
  controls();
})();
