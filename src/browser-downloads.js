const { randomUUID } = require('node:crypto');
const path = require('node:path');

// Only the dedicated browser partition is attached. No URLs/cookies are kept.
// Terminal records retain plain metadata, never DownloadItem/WebContents objects.
function createBrowserDownloads({ publish, canStart = () => true, exists, reveal,
  loadRecords, saveRecords, maxActive = 8, maxRecords = 100, delay = 250 } = {}) {
  const sessions = new WeakSet();
  const records = new Map();
  const live = new Map();
  let timer = null, revision = 0, message = '';
  const bytes = value => Number.isFinite(value) && value >= 0 ? value : 0;
  const terminalState = value => ['completed', 'cancelled', 'interrupted'].includes(value) ? value : 'interrupted';
  const sanitizeRecord = raw => {
    if (!raw || typeof raw !== 'object' || raw.active === true) return null;
    const id = String(raw.id || '').slice(0, 128);
    if (!id) return null;
    return { id, filename: String(raw.filename || 'Dosya').slice(0, 300),
      state: terminalState(raw.state), received: bytes(Number(raw.received)), total: bytes(Number(raw.total)),
      path: String(raw.path || '').slice(0, 32768), active: false, paused: false,
      canPause: false, canResume: false, createdAt: bytes(Number(raw.createdAt)),
      completedAt: bytes(Number(raw.completedAt)) };
  };
  try {
    const restored = typeof loadRecords === 'function' ? loadRecords() : [];
    for (const raw of (Array.isArray(restored) ? restored : []).slice(-maxRecords)) {
      const row = sanitizeRecord(raw); if (row) records.set(row.id, row);
    }
  } catch (_) {}
  function persistTerminal() {
    if (typeof saveRecords !== 'function') return;
    try { saveRecords([...records.values()].filter(row => !row.active).slice(-maxRecords).map(row => ({ ...row }))); }
    catch (_) { message = 'İndirme geçmişi diske kaydedilemedi; dosyalar korunuyor.'; }
  }
  function snapshot() {
    return { revision, message, active: live.size, items: [...records.values()].reverse().map(row => ({ ...row })) };
  }
  function changed(immediate = false) {
    revision++;
    if (immediate) { clearTimeout(timer); timer = null; publish?.(snapshot()); }
    else if (!timer) timer = setTimeout(() => { timer = null; publish?.(snapshot()); }, delay);
  }
  function trim() {
    for (const [id] of records) {
      if (records.size <= maxRecords) break;
      if (!live.has(id)) records.delete(id);
    }
  }
  function accept(event, item) {
    if (!canStart() || live.size >= maxActive) {
      event.preventDefault();
      message = !canStart() ? 'Uygulama kapanırken yeni indirme başlatılamaz.'
        : `Aynı anda en fazla ${maxActive} dosya indirilebilir. Diğer indirmelerin bitmesini bekleyin.`;
      changed(true);
      return;
    }
    // Do not setSavePath: keep Electron's native save dialog and overwrite consent.
    item.setSaveDialogOptions({ title: 'İndirilen dosyayı kaydet', buttonLabel: 'Kaydet' });
    const id = randomUUID();
    const row = { id, filename: String(item.getFilename() || 'Dosya').slice(0, 300),
      state: 'progressing', received: 0, total: 0, path: '', active: true,
      paused: false, canPause: true, canResume: false, createdAt: Date.now(), completedAt: 0 };
    records.set(id, row);
    live.set(id, item);
    message = '';
    function read(state) {
      row.state = state;
      row.received = bytes(item.getReceivedBytes());
      row.total = bytes(item.getTotalBytes());
      row.path = String(item.getSavePath() || '');
      if (row.path) row.filename = path.basename(row.path).slice(0, 300);
      row.paused = row.active && !!item.isPaused?.();
      row.canPause = row.active && !row.paused && state === 'progressing';
      row.canResume = row.active && (row.paused || (state === 'interrupted' && item.canResume()));
    }
    function updated(_event, state) { read(state); changed(); }
    function done(_event, state) {
      row.active = false;
      read(state);
      row.completedAt = Date.now();
      live.delete(id);
      // A previous concurrency warning is no longer actionable once a slot is
      // free; do not leave the panel claiming the limit is still reached.
      message = '';
      item.removeListener('updated', updated);
      trim();
      persistTerminal();
      changed(true);
    }
    item.on('updated', updated);
    item.once('done', done);
    read('progressing');
    trim();
    changed(true);
  }
  function action(id, command) {
    const row = typeof id === 'string' && records.get(id);
    if (!row) return { ok: false, error: 'İndirme kaydı bulunamadı.' };
    const item = live.get(id);
    try {
      if (command === 'cancel' && item) item.cancel();
      else if (command === 'pause' && item && row.canPause) {
        item.pause();
        row.paused = true;
        row.canPause = false;
        row.canResume = true;
        changed(true);
      } else if (command === 'resume' && item && row.canResume) {
        item.resume();
        row.paused = false;
        row.canPause = true;
        row.canResume = false;
        changed(true);
      }
      else if (command === 'reveal' && row.state === 'completed' && row.path) {
        if (!exists(row.path)) return { ok: false, error: 'Dosya taşınmış veya silinmiş. Kayıtlı konumda bulunamadı.' };
        reveal(row.path);
      } else if (command === 'open-player' && row.state === 'completed' && row.path) {
        if (!exists(row.path)) return { ok: false, error: 'Dosya taşınmış veya silinmiş. Kayıtlı konumda bulunamadı.' };
        if (!/\.(?:mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|3gp|mp3|wav|m4a|aac|flac|ogg|opus|wma)$/i.test(row.path)) {
          return { ok: false, error: 'Bu dosya yerel oynatıcıda desteklenen bir medya türü değil.' };
        }
        return { ok: true, path: row.path };
      } else if (command === 'clear' && !item) {
        records.delete(id);
        persistTerminal();
        changed(true);
      } else return { ok: false, error: 'Bu indirme için işlem artık kullanılamıyor.' };
      return { ok: true };
    } catch (_) { return { ok: false, error: 'İndirme işlemi gerçekleştirilemedi.' }; }
  }
  return {
    snapshot, action,
    activeCount: () => live.size,
    attach(browserSession) {
      if (sessions.has(browserSession)) return;
      sessions.add(browserSession);
      browserSession.on('will-download', accept);
    },
    cancelAll() {
      for (const item of [...live.values()]) { try { item.cancel(); } catch (_) {} }
      clearTimeout(timer); timer = null;
    },
    persist: persistTerminal,
  };
}

module.exports = { createBrowserDownloads };
