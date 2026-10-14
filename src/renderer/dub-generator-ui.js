(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const modal = el('dubGeneratorDialog');
  let srt = '', cfg = null, current = null, output = null;
  let timer = null, logPath = null;
  let plan = null, edits = {}, planning = false;
  const group = () => plan?.groups[Number(el('dubPlanGroup').value)];
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
    for (const id of ['dubChooseSrt', 'dubChooseEngine', 'dubChooseVoice', 'dubChooseTranscript', 'dubSampleOnly', 'dubProfile', 'dubConcurrency']) el(id).disabled = !!current;
    el('dubGeneratorStart').disabled = !!current || planning || !srt || !cfg?.ready;
    el('dubPlanPrepare').disabled = !!current || planning || !srt;
    for (const id of ['dubPlanGroup', 'dubPlanText', 'dubPlanShorten', 'dubPlanApply', 'dubPlanReset']) el(id).disabled = !!current || planning || !plan;
    el('dubChooseSrt').disabled = !!current || planning;
    el('dubGeneratorCancel').disabled = !current;
    el('dubTextStudio').disabled = !!current;
    el('browserDubGenerate')?.classList.toggle('active', !!current);
  }
  async function configure(kind) {
    const r = await window.api.dubConfig(kind).catch(() => null);
    if (!r?.ok) { status('Ses üretimi başarısız oldu.'); return; }
    cfg = r;
    if (!current) { el('dubProfile').value = r.profile || 'quality'; el('dubConcurrency').value = String(r.concurrency || 4); }
    el('dubEngineName').textContent = r.engine;
    el('dubVoiceName').textContent = basename(r.reference);
    el('dubTranscriptName').textContent = basename(r.transcript);
    if (!current && !r.ready) status('Motor veya referans eksik; ses ve motor ayarlarını kontrol edin.');
    controls();
  }
  async function open() {
    if (!modal.open) modal.showModal();
    syncBrowserOcclusion();
    await configure();
    if (!current && !output) {
      const r = await window.api.latestDub().catch(() => null);
      if (current || output || !r?.output) return;
      output = r.output; logPath = output.logPath;
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
  el('dubMainOpen').addEventListener('click', open);
  el('dubGeneratorClose').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => syncBrowserOcclusion());
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
      const r = await window.api.planDub({ srt });
      if (!r?.ok) throw new Error(r?.error || 'SRT planı okunamadı.');
      plan = r; edits = {}; el('dubPlanGroup').replaceChildren();
      r.groups.forEach((g, i) => { const option = document.createElement('option'); option.value = String(i);
        option.textContent = `${i + 1} · ${g.seconds.toFixed(1)} s · ${g.text.slice(0, 65)}`; el('dubPlanGroup').append(option); });
      showGroup(); status('Cümle grupları hazır');
    } catch (error) { el('dubGeneratorDetails').textContent = error.message; }
    finally { planning = false; controls(); }
  });
  el('dubPlanGroup').addEventListener('change', showGroup);
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
    if (current || !srt || !cfg?.ready) return;
    current = { id: crypto.randomUUID(), context: window.BrowserDubAudioUI?.context(), sample: el('dubSampleOnly').checked };
    const pending = current;
    const started = performance.now();
    elapsed(0); stopTimer();
    timer = setInterval(() => elapsed((performance.now() - started) / 1000), 1000);
    logPath = null; el('dubGeneratorLog').classList.add('hidden');
    output = null; el('dubGeneratorOutput').classList.add('hidden');
    el('dubGeneratedName').textContent = '';
    el('dubGeneratorUse').classList.add('hidden');
    el('dubGeneratorDetails').textContent = ''; el('dubGeneratorCount').textContent = '';
    el('dubGeneratorTiming').textContent = '';
    el('dubGeneratorProgress').removeAttribute('value');
    status('Motor yükleniyor…'); controls();
    const r = await window.api.startDub({ id: pending.id, srt, sample: pending.sample,
      profile: el('dubProfile').value, concurrency: Number(el('dubConcurrency').value),
      dubText: plan ? { sourceHash: plan.sourceHash, edits } : null }).catch(e => ({ ok:false,error:e.message }));
    if (!r?.ok && current === pending) {
      stopTimer((performance.now() - started) / 1000);
      current = null; status('Ses üretimi başarısız oldu.');
      el('dubGeneratorDetails').textContent = r?.error || ''; controls();
    }
  });
  el('dubGeneratorCancel').addEventListener('click', async () => {
    el('dubGeneratorCancel').disabled = true;
    const r = await window.api.cancelDub().catch(() => null);
    if (!r?.ok) { status('İptal doğrulanamadı; işlem izlenmeye devam ediyor.'); controls(); }
  });
  el('dubGeneratorOutput').addEventListener('click', () => { if (output) void window.api.openPath(output.path); });
  el('dubGeneratorUse').addEventListener('click', async () => {
    const selected = output;
    if (!selected) return;
    const context = window.BrowserDubAudioUI?.context();
    if (!context?.tabId || context.mode !== 'browser' || !context.visible) {
      status('Dublaj için önce browser videosunu açın.'); return;
    }
    el('dubGeneratorUse').disabled = true;
    try {
      const attached = await window.BrowserDubAudioUI.attachGenerated({ name: selected.name, url: selected.url }, context);
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
    if (event.type === 'progress') {
      status('Ses üretiliyor…'); el('dubGeneratorCount').textContent = `${event.done}/${event.total}`;
      el('dubGeneratorProgress').value = event.total ? event.done / event.total * 100 : 0;
    } else if (event.type === 'status') status(event.text);
    else if (event.type === 'timing') el('dubGeneratorTiming').textContent = `${event.accelerated} / ${event.clipped}`;
    else if (['done','error','cancelled'].includes(event.type)) {
      stopTimer(event.elapsedSeconds);
      logPath = event.logPath;
      el('dubGeneratorLog').classList.toggle('hidden', !logPath);
      if (event.logError) el('dubGeneratorDetails').textContent = event.logError;
      current = null; controls();
      if (event.type === 'done') {
        output = event; el('dubGeneratorProgress').value = 100;
        el('dubGeneratedName').textContent = event.name;
        el('dubGeneratorOutput').classList.remove('hidden');
        el('dubGeneratorUse').classList.remove('hidden');
        status(job.sample ? 'Kısa örnek hazır; tüm video için örnek seçimini kapatın.' : 'Ses hazır. Ses ekle düğmesinden bu dosyayı seçebilirsiniz.');
        if (!job.sample && job.context?.mode === 'browser') {
          void window.BrowserDubAudioUI.attachGenerated({ name:event.name, url:event.url }, job.context)
            .then(attached => { if (attached && output === event) status('Üretim tamamlandı; dublaj videoya bağlandı.'); })
            .catch(() => { if (output === event) status('Ses bağlanamadı; videoyu kontrol edip tekrar deneyin.'); });
        }
      } else if (event.type === 'cancelled') status('İptal edildi.');
      else { status('Ses üretimi başarısız oldu.'); el('dubGeneratorDetails').textContent = event.error || ''; }
    }
  });
  controls();
})();
