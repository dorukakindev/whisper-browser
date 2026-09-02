const fs = require('fs');
const path = require('path');

class PersistentTranslationCache {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.limit = Math.max(100, Number(options.limit) || 50000);
    this.ttlMs = Math.max(60_000, Number(options.ttlMs) || 30 * 24 * 60 * 60 * 1000);
    this.fs = options.fsModule || fs;
    this.map = new Map();
    this.timer = null;
    this.flushPromise = null;
    this.lastFlushAt = 0;
    this.minFlushIntervalMs = Math.max(500, Number(options.minFlushIntervalMs) || 3000);
    this.version = 0;
    this.load();
  }

  load() {
    const loadFile = (filePath) => JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
    try {
      let parsed;
      try { parsed = loadFile(this.filePath); }
      catch (error) { parsed = loadFile(`${this.filePath}.bak`); }
      const entries = parsed && [1, 2].includes(parsed.version) && Array.isArray(parsed.entries) ? parsed.entries : [];
      const now = Date.now();
      this.map = new Map(entries.filter((entry) => Array.isArray(entry) && entry.length === 2)
        .map(([key, raw]) => {
          const record = parsed.version === 1
            ? { value: String(raw), updatedAt: now }
            : { value: String(raw && raw.value || ''), updatedAt: Number(raw && raw.updatedAt) || 0 };
          return [String(key), record];
        })
        .filter(([, record]) => record.value && now - record.updatedAt <= this.ttlMs)
        .slice(-this.limit));
    } catch (_) { this.map = new Map(); }
  }

  get(key) {
    const normalized = String(key || '');
    if (!this.map.has(normalized)) return undefined;
    const record = this.map.get(normalized);
    if (!record || Date.now() - record.updatedAt > this.ttlMs) {
      this.map.delete(normalized);
      this.version += 1;
      this.scheduleFlush();
      return undefined;
    }
    this.map.delete(normalized);
    this.map.set(normalized, record);
    // Okuma LRU'yu bellekte günceller; salt bir get() disk yazımı başlatmaz.
    // Bir sonraki gerçek set/silme veya uygulama kapanışındaki flush güncel
    // sırayı da kalıcılaştırır.
    return record.value;
  }

  set(key, value) {
    const normalized = String(key || '');
    if (!normalized || !String(value || '').trim()) return false;
    this.map.delete(normalized);
    this.map.set(normalized, { value: String(value), updatedAt: Date.now() });
    this.version += 1;
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
    this.scheduleFlush();
    return true;
  }

  scheduleFlush(delay = 500) {
    clearTimeout(this.timer);
    const dueIn = Math.max(Number(delay) || 0, this.minFlushIntervalMs - (Date.now() - this.lastFlushAt));
    this.timer = setTimeout(() => { void this.flush(); }, Math.max(0, dueIn));
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.flushPromise) return this.flushPromise;
    const dir = path.dirname(this.filePath);
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const promises = this.fs.promises;
    this.flushPromise = (async () => {
      const flushedVersion = this.version;
      try {
        const payload = `${JSON.stringify({ version: 2, entries: [...this.map] })}\n`;
        if (promises) {
          await promises.mkdir(dir, { recursive: true });
          await promises.writeFile(temp, payload, 'utf8');
          try { await promises.copyFile(this.filePath, `${this.filePath}.bak`); } catch (_) {}
          await promises.rename(temp, this.filePath);
        } else {
          this.fs.mkdirSync(dir, { recursive: true });
          this.fs.writeFileSync(temp, payload, 'utf8');
          try { this.fs.copyFileSync(this.filePath, `${this.filePath}.bak`); } catch (_) {}
          this.fs.renameSync(temp, this.filePath);
        }
        this.lastFlushAt = Date.now();
        return { ok: true, count: this.map.size };
      } catch (error) {
        try {
          if (promises) await promises.unlink(temp);
          else if (this.fs.existsSync(temp)) this.fs.unlinkSync(temp);
        } catch (_) {}
        return { ok: false, error: error.message };
      } finally {
        this.flushPromise = null;
        // Yazma sürerken set() geldiyse bu flush'ı sonsuz bir döngüye sokma;
        // yeni sürümü ayrı ve birleştirilebilir bir yazım olarak planla.
        if (flushedVersion !== this.version) this.scheduleFlush();
      }
    })();
    return this.flushPromise;
  }
}

module.exports = { PersistentTranslationCache };
