(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const modal = el('dubGeneratorDialog');
  let srt = '', cfg = null, current = null, output = null;
  let timer = null, logPath = null;
  let plan = null, edits = {}, planning = false;
  let backgroundSource = '';
  let referenceBusy = false, rangeContextKey = null;
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
    const locked = !!current || referenceBusy || planning;
    for (const id of ['dubChooseSrt', 'dubChooseEngine', 'dubChooseVoice', 'dubChooseTranscript', 'dubSampleOnly', 'dubProfile', 'dubConcurrency', 'dubTimingMode']) el(id).disabled = locked;
    el('dubGeneratorStart').disabled = !!current || referenceBusy || planning || !srt || !cfg?.ready;
    el('dubPlanPrepare').disabled = locked || !srt;
    for (const id of ['dubPlanGroup', 'dubPlanText', 'dubPlanShorten', 'dubPlanApply', 'dubPlanReset']) el(id).disabled = locked || !plan;
    el('dubChooseSrt').disabled = locked;
    el('dubKeepBackground').disabled = locked;
    for (const id of ['dubChooseBackground','dubBackgroundReset']) el(id).disabled = locked || !el('dubKeepBackground').checked;
    el('dubRangeEnabled').disabled = locked;
    for (const id of ['dubRangeStart', 'dubRangeEnd', 'dubRangeNow']) el(id).disabled = locked || !el('dubRangeEnabled').checked;
    el('dubGeneratorCancel').disabled = !current;
    el('dubTextStudio').disabled = locked;
    el('browserDubGenerate')?.classList.toggle('active', !!current);
  }
  async function configure(kind) {
    const r = await window.api.dubConfig(kind).catch(() => null);
    if (!r?.ok) { status('Ses üretimi başarısız oldu.'); return; }
    cfg = r;
    el('dubStorageOpen').disabled = !r.storageRoot;
    if (!current) { el('dubProfile').value = r.profile || 'quality'; el('dubConcurrency').value = String(r.concurrency || 4); }
    if (!current) el('dubTimingMode').value = r.timingMode || 'video';
    el('dubEngineName').textContent = r.engine;
    el('dubVoiceName').textContent = basename(r.reference);
    el('dubTranscriptName').textContent = basename(r.transcript);
    if (!current && !r.ready) status('Motor veya referans eksik; ses ve motor ayarlarını kontrol edin.');
    controls();
  }
  function inheritSubtitleRange() {
    if (current || planning) return;
    const context = window.BrowserDubAudioUI?.context();
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
    const audio = el('dubGeneratedPreview'); audio.pause();
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
      output = r.output; logPath = output.logPath; preview(output);
      el('dubGeneratorOutput').classList.remove('hidden');
      el('dubGeneratorUse').classList.remove('hidden');
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      el('dubGeneratedName').textContent = output.name;
      el('dubGeneratorProgress').value = 100;
      elapsed(output.elapsedSeconds || 0);
      if (output.timing) el('dubGeneratorTiming').textContent = `${output.timing.accelerated} / ${output.timing.clipped}`;
      status('Son üretilen ses hazır. Sesi kullan ile açık videoya bağlayabilirsiniz.');
    }
  }
  el('browserDubGenerate').addEventListener('click', open);
  window.addEventListener('voice-reference:changed', () => { void configure(); });
  window.addEventListener('voice-reference:busy', event => { referenceBusy = !!event.detail; controls(); });
  el('playerDubGenerate')?.addEventListener('click', () => { el('playerMore').open = false; void open(); });
  el('dubMainOpen').addEventListener('click', open);
  el('dubGeneratorClose').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => { el('dubGeneratedPreview').pause(); syncBrowserOcclusion(); });
  el('dubStorageOpen').addEventListener('click', () => { if (cfg?.storageRoot) void window.api.openPath(cfg.storageRoot); });
  el('dubChooseSrt').addEventListener('click', async () => {
    const p = await window.api.selectFile('subtitle');
    if (typeof p === 'string' && /\.srt$/i.test(p)) {
      srt = p; plan = null; edits = {}; el('dubPlanGroup').replaceChildren(); showGroup();
      el('dubSrtName').textContent = basename(p); status('Hazır'); controls();
    } else if (p) status('Bir SRT altyazı dosyası seçin.');
  });
  el('dubPlanPrepare').addEventListener('click', async () => {
    planning = true; controls();
    try {
      const r = await window.api.planDub({ srt, range: selectedRange() });
      if (!r?.ok) throw new Error(r?.error || 'SRT planı okunamadı.');
      plan = r; edits = {}; el('dubPlanGroup').replaceChildren();
      r.groups.forEach((g, i) => { const option = document.createElement('option'); option.value = String(i);
        option.textContent = `${i + 1} · ${g.seconds.toFixed(1)} s · ${g.text.slice(0, 65)}`; el('dubPlanGroup').append(option); });
      showGroup(); status('Cümle grupları hazır');
    } catch (error) { el('dubGeneratorDetails').textContent = error.message; }
    finally { planning = false; controls(); }
  });
  function invalidatePlan() {
    plan = null; edits = {}; el('dubPlanGroup').replaceChildren(); showGroup(); controls();
  }
  for (const id of ['dubRangeEnabled', 'dubRangeStart', 'dubRangeEnd']) el(id).addEventListener('input', invalidatePlan);
  el('dubRangeNow').addEventListener('click', () => {
    el('dubRangeStart').value = String(Math.floor(Number(window.BrowserDubAudioUI?.context()?.currentTime) || 0));
    invalidatePlan();
  });
  el('dubPlanGroup').addEventListener('change', showGroup);
  el('dubKeepBackground').addEventListener('change',controls);
  el('dubChooseBackground').addEventListener('click',async()=>{
    const files=await window.api.selectVideo();
    if (Array.isArray(files) && typeof files[0]==='string') { backgroundSource=files[0]; el('dubBackgroundName').textContent=basename(backgroundSource); }
  });
  el('dubBackgroundReset').addEventListener('click',()=>{backgroundSource='';el('dubBackgroundName').textContent='';});
  el('dubPlanApply').addEventListener('click', () => {
    const g = group(), text = el('dubPlanText').value.trim();
    if (!g || !text) return;
    if (text === g.text) delete edits[g.key]; else edits[g.key] = text;
    showGroup(); status('Dublaj metni uygulandı.');
  });
  el('dubPlanReset').addEventListener('click', () => { const g = group(); if (g) delete edits[g.key]; showGroup(); });
  el('dubPlanShorten').addEventListener('click', async () => {
    const g = group(); if (!g) return;
    planning = true; controls(); status('Kısaltma önerisi hazırlanıyor…');
    try {
      const r = await window.api.shortenDub(g.key);
      if (!r?.ok) throw new Error(r?.error || 'Uygun bir kısaltma alınamadı.');
      el('dubPlanText').value = r.text; status('Öneriyi kontrol edip Bu metni uygula düğmesine basın.');
    } catch (error) { el('dubGeneratorDetails').textContent = error.message; status('Kısaltma alınamadı; metni elle düzenleyebilirsiniz.'); }
    finally { planning = false; controls(); }
  });
  for (const [id, kind] of [['dubChooseEngine','engine'], ['dubChooseVoice','reference'], ['dubChooseTranscript','transcript']]) {
    el(id).addEventListener('click', () => configure(kind));
  }
  el('dubGeneratorStart').addEventListener('click', async () => {
    if (current || referenceBusy || planning || !srt || !cfg?.ready) return;
    let range;
    try { range = selectedRange(); } catch (error) { status(error.message); return; }
    current = { id: crypto.randomUUID(), context: window.BrowserDubAudioUI?.context(), sample: el('dubSampleOnly').checked };
    const pending = current;
    const started = performance.now();
    elapsed(0); stopTimer();
    timer = setInterval(() => elapsed((performance.now() - started) / 1000), 1000);
    logPath = null; el('dubGeneratorLog').classList.add('hidden');
    output = null; preview(null); el('dubGeneratorOutput').classList.add('hidden');
    el('dubGeneratedName').textContent = '';
    el('dubGeneratorUse').classList.add('hidden');
    el('dubGeneratorDetails').textContent = ''; el('dubGeneratorCount').textContent = '';
    el('dubGeneratorTiming').textContent = '';
    el('dubGeneratorProgress').removeAttribute('value');
    status('Motor yükleniyor…'); controls();
    const r = await window.api.startDub({ id: pending.id, srt, sample: pending.sample,
      profile: el('dubProfile').value, concurrency: Number(el('dubConcurrency').value),
      keepBackground: el('dubKeepBackground').checked, backgroundSource: backgroundSource || pending.context?.backgroundSource || '',
      backgroundTab: pending.context ? {tabId:pending.context.tabId,generation:pending.context.generation} : null,
      timingMode: el('dubTimingMode').value, range, dubText: plan ? { sourceHash: plan.sourceHash, edits } : null }).catch(e => ({ ok:false,error:e.message }));
    if (!r?.ok && current === pending) {
      stopTimer((performance.now() - started) / 1000);
      current = null; el('dubGeneratorProgress').value = 0; status('Ses üretimi başarısız oldu.');
      el('dubGeneratorDetails').textContent = r?.error || ''; controls();
    }
  });
  el('dubGeneratorCancel').addEventListener('click', async () => {
    el('dubGeneratorCancel').disabled = true;
    if (current) current.stopping = true;
    status('Durduruluyor…');
    const r = await window.api.cancelDub().catch(() => null);
    if (!r?.ok && current) { current.stopping = false; status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); controls(); }
  });
  el('dubGeneratorOutput').addEventListener('click', () => { if (output) void window.api.openPath(output.path); });
  el('dubGeneratorUse').addEventListener('click', async () => {
    const selected = output;
    if (!selected) return;
    const context = window.BrowserDubAudioUI?.context();
    if (!context?.tabId || !context.hasMedia || !context.visible) {
      status('Ses eklemek için önce bir video açın.'); return;
    }
    el('dubGeneratedPreview').pause();
    el('dubGeneratorUse').disabled = true;
    try {
      const attached = await window.BrowserDubAudioUI.attachGenerated({ name: selected.name, url: selected.url, range: selected.range, sync: selected.sync, background: selected.background }, context);
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
    const job = current;
    if (!job || event.id !== job.id) return;
    if (job.stopping && !['done','error','cancelled'].includes(event.type)) return;
    if (event.type === 'progress') {
      status('Ses üretiliyor…'); el('dubGeneratorCount').textContent = `${event.done}/${event.total}`;
      el('dubGeneratorProgress').value = event.total ? event.done / event.total * 100 : 0;
    } else if (event.type === 'status') status(event.text);
    else if (event.type === 'warning') el('dubGeneratorDetails').textContent=event.text;
    else if (event.type === 'timing') el('dubGeneratorTiming').textContent = `${event.accelerated} / ${event.clipped}`;
    else if (['done','error','cancelled'].includes(event.type)) {
      stopTimer(event.elapsedSeconds);
      if (event.type !== 'done' && !el('dubGeneratorProgress').hasAttribute('value')) el('dubGeneratorProgress').value = 0;
      logPath = event.logPath;
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      if (event.logError) el('dubGeneratorDetails').textContent = event.logError;
      current = null; controls();
      if (event.type === 'done') {
        output = event; preview(output); el('dubGeneratorProgress').value = 100;
        el('dubGeneratedName').textContent = event.name;
        el('dubGeneratorOutput').classList.remove('hidden');
        el('dubGeneratorUse').classList.remove('hidden');
        status(job.sample ? 'Kısa örnek hazır; tüm video için örnek seçimini kapatın.' : 'Ses hazır. Buradan dinleyebilir veya Sesi kullan ile videoya bağlayabilirsiniz.');
        if (!job.sample && job.context?.hasMedia) {
          void window.BrowserDubAudioUI.attachGenerated({ name:event.name, url:event.url, range:event.range, sync:event.sync, background:event.background }, job.context)
            .then(attached => { if (attached && output === event) status('Üretim tamamlandı; dublaj videoya bağlandı.'); })
            .catch(() => { if (output === event) status('Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.'); });
        }
      } else if (event.type === 'cancelled') status('Durduruldu.');
      else { status('Ses üretimi başarısız oldu.'); el('dubGeneratorDetails').textContent = event.error || ''; }
    }
  });
  controls();
})();
