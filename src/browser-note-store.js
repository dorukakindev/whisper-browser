const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { normalizeAnnotation } = require('./browser-learning');
const { foldSearchText } = require('./watch-index');
const { filterResearchAnnotations } = require('./browser-research-notebook');

const NOTE_STORE_VERSION = 1;
const DEFAULT_MAX_NOTES = 50000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

function normalizeStoredAnnotation(raw = {}) {
  const normalized = normalizeAnnotation({
    ...raw,
    mediaId: raw.mediaId ?? raw.media_id,
    screenshotRef: raw.screenshotRef ?? raw.screenshot_ref,
    audioRef: raw.audioRef ?? raw.audio_ref,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  });
  return {
    ...normalized,
    mediaTitle: String(raw.mediaTitle ?? raw.title ?? '').trim().slice(0, 500),
    mediaType: String(raw.mediaType ?? raw.service ?? '').trim().slice(0, 40),
    mediaUrl: String(raw.mediaUrl ?? raw.url ?? '').trim().slice(0, 2000),
  };
}

function validDocument(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && Number(raw.version) === NOTE_STORE_VERSION && Array.isArray(raw.annotations);
}

class BrowserNoteStore {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.backupPath = `${this.filePath}.bak`;
    this.maxNotes = Math.max(100, Number(options.maxNotes) || DEFAULT_MAX_NOTES);
    this.annotations = new Map();
    this.recoveredFromBackup = false;
    this.needsLegacyImport = false;
    this.migrationError = '';
    this.loadError = '';
    this.recoveryWriteError = '';
    this.loaded = false;
    this.load();
  }

  readDocument(candidate) {
    if (!fs.existsSync(candidate)) return null;
    const stat = fs.statSync(candidate);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    return validDocument(parsed) ? parsed : null;
  }

  load() {
    if (this.loaded) return;
    const hadPrimary = fs.existsSync(this.filePath);
    const hadBackup = fs.existsSync(this.backupPath);
    let document = null;
    try { document = this.readDocument(this.filePath); } catch (_) {}
    if (!document) {
      try {
        document = this.readDocument(this.backupPath);
        this.recoveredFromBackup = !!document;
      } catch (_) {}
    }
    if (!document && (hadPrimary || hadBackup)) {
      this.loadError = 'Not deposu ve yedeği doğrulanamadı; dosyalar korunarak yazma durduruldu.';
    }
    this.needsLegacyImport = !document;
    const rows = document ? document.annotations : [];
    for (const row of rows.slice(-this.maxNotes)) {
      const annotation = normalizeStoredAnnotation(row);
      if (annotation.id && annotation.mediaId) this.annotations.set(annotation.id, annotation);
    }
    this.loaded = true;
    if (this.recoveredFromBackup) {
      try {
        this.flush({ preserveBackup: true });
      } catch (error) {
        // Sağlam yedek bellekte kullanilabilir durumda. Kurtarma yazimi
        // basarisiz olsa bile butun not ozelligini konstruktor asamasinda oldurme.
        this.recoveryWriteError = 'Not yedekten kurtarıldı ancak ana dosya yenilenemedi: ' + error.message;
      }
    }
  }

  snapshot() {
    return {
      version: NOTE_STORE_VERSION,
      updatedAt: Date.now(),
      annotations: [...this.annotations.values()]
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt)),
    };
  }

  flush(options = {}) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const suffix = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    const temporary = `${this.filePath}.${suffix}.tmp`;
    try {
      if (!options.preserveBackup && !options.mirrorBackup && fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, this.backupPath);
      }
      const payload = JSON.stringify(this.snapshot(), null, 2);
      if (Buffer.byteLength(payload, 'utf8') > MAX_FILE_BYTES) {
        throw new Error('Not deposu güvenli boyut sınırını aştı; eski notlar silinmedi.');
      }
      fs.writeFileSync(temporary, payload, { encoding: 'utf8', flush: true });
      fs.renameSync(temporary, this.filePath);
      // mirrorBackup (R83-34): silme yazımında eski nesil yedekte kalmasın —
      // yedek doğrulanmış güncel duruma çekilir. Diğer yazımlarda .bak bir
      // önceki geçerli ana dosyayı tutar; yoksa ilk yazımda oluşturulur.
      if (options.mirrorBackup || !fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.filePath, this.backupPath);
      }
      this.needsLegacyImport = false;
      this.recoveryWriteError = '';
    } catch (error) {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) {}
      throw error;
    }
  }

  list(mediaId = '') {
    const key = String(mediaId || '');
    return [...this.annotations.values()]
      .filter((annotation) => !key || annotation.mediaId === key)
      .sort((a, b) => a.start - b.start || a.createdAt - b.createdAt)
      .map((annotation) => ({ ...annotation }));
  }

  get(id) {
    const annotation = this.annotations.get(String(id || ''));
    return annotation ? { ...annotation } : null;
  }

  upsert(raw) {
    if (this.loadError) throw new Error(this.loadError);
    const annotation = normalizeStoredAnnotation(raw);
    if (!annotation.id || !annotation.mediaId) throw new TypeError('Not ve medya kimliği gerekli.');
    const previous = this.annotations.get(annotation.id);
    if (previous) {
      annotation.createdAt = previous.createdAt;
      // Model/altyazı katmanı kaynak ve çeviri bağlamını yenileyebilir; kullanıcı
      // notu ancak çağıran açıkça `note` alanı gönderdiğinde değiştirilebilir.
      if (!Object.prototype.hasOwnProperty.call(raw || {}, 'note')) annotation.note = previous.note;
    }
    this.annotations.set(annotation.id, annotation);
    if (this.annotations.size > this.maxNotes) {
      if (previous) this.annotations.set(previous.id, previous);
      else this.annotations.delete(annotation.id);
      throw new Error('Not sayısı güvenli sınırı aştı; eski notlar silinmedi.');
    }
    try {
      this.flush();
    } catch (error) {
      if (previous) this.annotations.set(previous.id, previous);
      else this.annotations.delete(annotation.id);
      throw error;
    }
    return { ...annotation };
  }

  remove(id) {
    if (this.loadError) throw new Error(this.loadError);
    const key = String(id || '');
    const previous = this.annotations.get(key);
    if (!previous) return null;
    this.annotations.delete(key);
    try {
      this.flush({ mirrorBackup: true });
    } catch (error) {
      this.annotations.set(key, previous);
      throw error;
    }
    return { ...previous };
  }

  importMissing(rows) {
    if (this.loadError) throw new Error(this.loadError);
    let count = 0;
    const added = [];
    for (const raw of Array.isArray(rows) ? rows : []) {
      const annotation = normalizeStoredAnnotation(raw);
      if (!annotation.id || !annotation.mediaId || this.annotations.has(annotation.id)) continue;
      this.annotations.set(annotation.id, annotation);
      added.push(annotation.id);
      count++;
    }
    try {
      if (this.annotations.size > this.maxNotes) {
        throw new Error('Not sayısı güvenli sınırı aştı; eski notlar silinmedi.');
      }
      if (count || this.needsLegacyImport) this.flush();
      this.needsLegacyImport = false;
    } catch (error) {
      for (const id of added) this.annotations.delete(id);
      throw error;
    }
    return count;
  }

  search(query, limit = 50) {
    const folded = foldSearchText(String(query || '').trim());
    if (!folded) return [];
    return [...this.annotations.values()]
      .filter((annotation) => foldSearchText([
        annotation.source, annotation.translation, annotation.note,
        annotation.mediaTitle, ...(annotation.tags || []),
        ...(annotation.links || []).flatMap((link) => [link.label, link.url]),
      ].join(' ')).includes(folded))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)))
      .map((annotation) => ({ ...annotation }));
  }

  filter(filters = {}, limit = 500) {
    return filterResearchAnnotations([...this.annotations.values()], filters)
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
      .slice(0, Math.max(1, Math.min(5000, Number(limit) || 500)))
      .map((annotation) => ({ ...annotation }));
  }
}

module.exports = {
  BrowserNoteStore,
  NOTE_STORE_VERSION,
  normalizeStoredAnnotation,
};
