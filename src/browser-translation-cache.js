const fs = require('fs');
const path = require('path');

class PersistentTranslationCache {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.limit = Math.max(100, Number(options.limit) || 50000);
    this.fs = options.fsModule || fs;
    this.map = new Map();
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
      const entries = parsed && parsed.version === 1 && Array.isArray(parsed.entries) ? parsed.entries : [];
      this.map = new Map(entries.filter((entry) => Array.isArray(entry) && entry.length === 2)
        .map(([key, value]) => [String(key), String(value)]).slice(-this.limit));
    } catch (_) { this.map = new Map(); }
  }

  get(key) {
    const normalized = String(key || '');
    if (!this.map.has(normalized)) return undefined;
    const value = this.map.get(normalized);
    this.map.delete(normalized);
    this.map.set(normalized, value);
    return value;
  }

  set(key, value) {
    const normalized = String(key || '');
    if (!normalized || !String(value || '').trim()) return false;
    this.map.delete(normalized);
    this.map.set(normalized, String(value));
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
    this.scheduleFlush();
    return true;
  }

  scheduleFlush(delay = 500) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const dir = path.dirname(this.filePath);
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      this.fs.mkdirSync(dir, { recursive: true });
      this.fs.writeFileSync(temp, `${JSON.stringify({ version: 1, entries: [...this.map] })}\n`, 'utf8');
      this.fs.renameSync(temp, this.filePath);
      return { ok: true, count: this.map.size };
    } catch (error) {
      try { if (this.fs.existsSync(temp)) this.fs.unlinkSync(temp); } catch (_) {}
      return { ok: false, error: error.message };
    }
  }
}

module.exports = { PersistentTranslationCache };
