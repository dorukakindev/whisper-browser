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
    // Aktif çeviri sırasında her ~3 sn'de 13 MB'lık dosyanın tamamı ana
    // süreçte yeniden yazılıyordu (~60 ms donma). Artımlı yazımlar
    // yalnız değişen kayıtları .journal dosyasının sonuna ekler; eşiğe
    // ulaşınca tek tam sıkıştırma yapılır.
    this.journalPath = `${this.filePath}.journal`;
    this.pendingJournal = [];
    this.journalBytes = 0;
    this.journalFlushes = 0;
    this.lastCompactAt = Date.now();
    this.journalMaxBytes = Math.max(1024, Number(options.journalMaxBytes) || 1024 * 1024);
    this.journalMaxFlushes = Math.max(1, Number(options.journalMaxFlushes) || 40);
    this.journalMaxAgeMs = Math.max(60_000, Number(options.journalMaxAgeMs) || 10 * 60 * 1000);
    this.baseFileWritten = false;
    this.load();
    try { this.baseFileWritten = this.fs.existsSync(this.filePath); } catch (_) {}
  }

  load() {
    const loadFile = (filePath) => JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
    const parseCache = (filePath) => {
      const parsed = loadFile(filePath);
      // Geçerli JSON tek başına güvenilir cache anlamına gelmez. Şema bozuksa
      // sağlam .bak dosyasına düşebilmek için bunu açıkça hata olarak bildir.
      if (!parsed || ![1, 2].includes(parsed.version) || !Array.isArray(parsed.entries)) {
        throw new Error('Çeviri önbelleği şeması geçersiz.');
      }
      return parsed;
    };
    const archiveCorrupt = (filePath) => {
      try {
        if (!this.fs.existsSync(filePath)) return;
        const archive = `${filePath}.corrupt-${process.pid}-${Date.now()}`;
        this.fs.renameSync(filePath, archive);
      } catch (_) { /* Kurtarma başarısız olsa bile bellekte temiz cache ile devam et. */ }
      // Bozuk arşivler teşhis için tutulur ama sınırsız birikmez — dosya adına
      // yazan zaman damgasına göre en yeni 5 kopya korunur (B83-N3).
      try {
        const dir = path.dirname(filePath);
        const prefix = path.basename(filePath) + '.corrupt-';
        const archives = this.fs.readdirSync(dir)
          .filter((name) => name.startsWith(prefix))
          .sort();
        for (const stale of archives.slice(0, Math.max(0, archives.length - 5))) {
          try { this.fs.unlinkSync(path.join(dir, stale)); } catch (_) {}
        }
      } catch (_) {}
    };
    try {
      let parsed;
      try { parsed = parseCache(this.filePath); }
      catch (error) {
        const primaryExists = this.fs.existsSync(this.filePath);
        try {
          parsed = parseCache(`${this.filePath}.bak`);
          if (primaryExists) archiveCorrupt(this.filePath);
        } catch (backupError) {
          if (primaryExists) archiveCorrupt(this.filePath);
          archiveCorrupt(`${this.filePath}.bak`);
          throw backupError;
        }
      }
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
    // Sona-eklenen artımlı kayıtları temel dosyanın üstüne tekrar uygula.
    try {
      if (this.fs.existsSync(this.journalPath)) {
        const stat = this.fs.statSync(this.journalPath);
        this.journalBytes = Number(stat?.size) || 0;
        const raw = String(this.fs.readFileSync(this.journalPath, 'utf8'));
        for (const line of raw.split('\n')) {
          if (!line) continue;
          try {
            const row = JSON.parse(line);
            const key = String(row?.k || '');
            const value = String(row?.v || '');
            const updatedAt = Number(row?.t) || Date.now();
            if (!key || !value) continue;
            this.map.delete(key);
            this.map.set(key, { value, updatedAt });
          } catch (_) { /* Bozuk journal satırı atlanır; tam sıkıştırma kurtarır. */ }
        }
        this.map = new Map([...this.map].slice(-this.limit));
      }
    } catch (_) { /* Journal okunamadıysa temel dosya yeterlidir. */ }
  }

  get(key) {
    const normalized = String(key || '');
    if (!this.map.has(normalized)) return undefined;
    const record = this.map.get(normalized);
    if (!record || Date.now() - record.updatedAt > this.ttlMs) {
      this.map.delete(normalized);
      this.version += 1;
      // Süresi dolmuş bir kaydın okunması sıcak yolda disk yazımı başlatmasın.
      // Sürüm artışı değişikliği korur; sonraki set/silme ya da kapanış flush'ı
      // temizlenmiş haritayı kalıcılaştırır.
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
    const record = { value: String(value), updatedAt: Date.now() };
    this.map.delete(normalized);
    this.map.set(normalized, record);
    this.version += 1;
    this.pendingJournal.push({ k: normalized, v: record.value, t: record.updatedAt });
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
    this.scheduleFlush();
    return true;
  }

  scheduleFlush(delay = 500) {
    clearTimeout(this.timer);
    const dueIn = Math.max(Number(delay) || 0, this.minFlushIntervalMs - (Date.now() - this.lastFlushAt));
    this.timer = setTimeout(() => { void this.flush(); }, Math.max(0, dueIn));
  }

  needsCompaction() {
    return !this.baseFileWritten
      || this.journalBytes >= this.journalMaxBytes
      || this.journalFlushes >= this.journalMaxFlushes
      || Date.now() - this.lastCompactAt >= this.journalMaxAgeMs;
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.flushPromise) return this.flushPromise;
    const dir = path.dirname(this.filePath);
    const promises = this.fs.promises;
    this.flushPromise = (async () => {
      const flushedVersion = this.version;
      try {
        // 1) Artımlı kayıtlar: yalnız değişen satırlar journal'ın sonuna.
        // Temel dosya henüz yoksa journal'ı atlayıp doğrudan sıkıştır —
        // .bak zinciri ilk tam yazımla kurulur.
        if (this.pendingJournal.length && this.baseFileWritten) {
          // Await sırasında gelen set()'ler yeni diziye düşsün diye diziyi
          // önce atomik olarak değiştir.
          const rows = this.pendingJournal;
          this.pendingJournal = [];
          const lines = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
          if (promises) {
            await promises.mkdir(dir, { recursive: true });
            await promises.appendFile(this.journalPath, lines, 'utf8');
          } else {
            this.fs.mkdirSync(dir, { recursive: true });
            this.fs.appendFileSync(this.journalPath, lines, 'utf8');
          }
          this.journalBytes += Buffer.byteLength(lines, 'utf8');
          this.journalFlushes += 1;
          // .bak zinciri sıkıştırmalarda kurulur; ilk journal turunda yedek
          // henüz yoksa bozuk temel dosyadan geri dönüş imkânsız kalır — bir
          // kez ucuz kopyayla kur.
          try {
            const bak = `${this.filePath}.bak`;
            if (promises) {
              if (!this.fs.existsSync(bak)) await promises.copyFile(this.filePath, bak);
            } else if (!this.fs.existsSync(bak)) this.fs.copyFileSync(this.filePath, bak);
          } catch (_) {}
        }
        // 2) Journal eşiği aşınca temel dosyayı tek seferde sıkıştır.
        if (this.needsCompaction()) await this.compact();
        this.lastFlushAt = Date.now();
        return { ok: true, count: this.map.size };
      } catch (error) {
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

  async compact() {
    const dir = path.dirname(this.filePath);
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const promises = this.fs.promises;
    const pendingCount = this.pendingJournal.length;
    const payload = `${JSON.stringify({ version: 2, entries: [...this.map] })}\n`;
    try {
      if (promises) {
        await promises.mkdir(dir, { recursive: true });
        await promises.writeFile(temp, payload, 'utf8');
        try { await promises.copyFile(this.filePath, `${this.filePath}.bak`); } catch (_) {}
        await promises.rename(temp, this.filePath);
        try { await promises.unlink(this.journalPath); } catch (_) {}
      } else {
        this.fs.mkdirSync(dir, { recursive: true });
        this.fs.writeFileSync(temp, payload, 'utf8');
        try { this.fs.copyFileSync(this.filePath, `${this.filePath}.bak`); } catch (_) {}
        this.fs.renameSync(temp, this.filePath);
        try { this.fs.unlinkSync(this.journalPath); } catch (_) {}
      }
      this.journalBytes = 0;
      this.journalFlushes = 0;
      this.lastCompactAt = Date.now();
      this.baseFileWritten = true;
      // Sıkıştırma başlangıcındaki bekleyen satırlar temel dosyaya yazıldı;
      // yazma sürerken eklenenler dizide kalsın (bir sonraki journal turuna).
      this.pendingJournal.splice(0, pendingCount);
      return { ok: true };
    } catch (error) {
      try {
        if (promises) await promises.unlink(temp);
        else if (this.fs.existsSync(temp)) this.fs.unlinkSync(temp);
      } catch (_) {}
      return { ok: false, error: error.message };
    }
  }
}

module.exports = { PersistentTranslationCache };
