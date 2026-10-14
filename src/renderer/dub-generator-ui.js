(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const modal = el('dubGeneratorDialog');
  let srt = '', cfg = null, current = null, output = null;
  let timer = null, logPath = null;
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
    el('dubGeneratorStart').disabled = !!current || !srt || !cfg?.ready;
    el('dubGeneratorCancel').disabled = !current;
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
  }
  el('browserDubGenerate').addEventListener('click', open);
  el('dubMainOpen').addEventListener('click', open);
  el('dubGeneratorClose').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => syncBrowserOcclusion());
  el('dubChooseSrt').addEventListener('click', async () => {
    const p = await window.api.selectFile('subtitle');
    if (typeof p === 'string' && /\.srt$/i.test(p)) {
      srt = p; el('dubSrtName').textContent = basename(p); status('Hazır'); controls();
    } else if (p) status('Bir SRT altyazı dosyası seçin.');
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
    el('dubGeneratorDetails').textContent = ''; el('dubGeneratorCount').textContent = '';
    el('dubGeneratorTiming').textContent = '';
    el('dubGeneratorProgress').removeAttribute('value');
    status('Motor yükleniyor…'); controls();
    const r = await window.api.startDub({ id: pending.id, srt, sample: pending.sample,
      profile: el('dubProfile').value, concurrency: Number(el('dubConcurrency').value) }).catch(e => ({ ok:false,error:e.message }));
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
        el('dubGeneratorOutput').classList.remove('hidden');
        status(job.sample ? 'Kısa örnek hazır; tüm video için örnek seçimini kapatın.' : 'Ses hazır. Ses ekle düğmesinden bu dosyayı seçebilirsiniz.');
        if (!job.sample && job.context?.mode === 'browser') {
          void window.BrowserDubAudioUI.attachGenerated({ name:event.name, url:event.url }, job.context)
            .then(attached => { if (attached && output === event) status('Üretim tamamlandı; dublaj videoya bağlandı.'); });
        }
      } else if (event.type === 'cancelled') status('İptal edildi.');
      else { status('Ses üretimi başarısız oldu.'); el('dubGeneratorDetails').textContent = event.error || ''; }
    }
  });
  controls();
})();
