'use strict';

// B22 — Çevrimdışı okuma listesi: sayfanın o anki halini MHTML olarak uygulamanın
// yönettiği dizine kaydeder (kullanıcıya dosya yolu sordurmaz) ve kayıtları
// index.json'da tutar. Bu, "Sayfayı arşivle" dışa aktarımından farklıdır:
// kopya uygulama dizininde kalır ve liste içinden açılır/silinir/yenilenir.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalPageUrl } = require('./browser-translation-archive');

const INDEX_LIMIT = 200;
const MAX_URL_LENGTH = 8192;

function hash(value, length = 16) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, length);
}

function safeName(value, fallback) {
  const normalized = String(value || '').normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/[ .]+$/g, '').slice(0, 80);
  return normalized || fallback;
}

class BrowserReadingList {
  constructor(rootDir, fsImpl = fs) {
    this.rootDir = path.resolve(rootDir);
    this.fileName = 'index.json';
    this.fs = fsImpl;
  }

  get indexPath() {
    return path.join(this.rootDir, this.fileName);
  }

  ensure() {
    this.fs.mkdirSync(this.rootDir, { recursive: true });
    return this.rootDir;
  }

  _readIndex() {
    try {
      const data = JSON.parse(this.fs.readFileSync(this.indexPath, 'utf8'));
      return Array.isArray(data?.entries) ? data.entries : [];
    } catch (_) {
      return [];
    }
  }

  _writeIndex(entries) {
    this.ensure();
    const trimmed = entries.slice(0, INDEX_LIMIT);
    const target = this.indexPath;
    const temp = `${target}.tmp`;
    this.fs.writeFileSync(temp, `${JSON.stringify({ version: 1, entries: trimmed }, null, 2)}\n`);
    this.fs.renameSync(temp, target);
    return trimmed;
  }

  // Dizin dışına yazmayı ve dizin dışındaki dosyaları silmeyi engeller.
  _safeFilePath(fileName) {
    const name = path.basename(String(fileName || ''));
    if (!name || name !== String(fileName || '') || !name.endsWith('.mhtml')) return '';
    const target = path.resolve(this.rootDir, name);
    return target.startsWith(this.rootDir + path.sep) ? target : '';
  }

  list() {
    return this._readIndex()
      .slice()
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
      .map((entry) => ({ ...entry }));
  }

  // Kayıt planı döndürür; MHTML henüz yazılmadı — savePage başarılı olursa
  // çağıran taraf commit() ile indeksi günceller.
  prepare(raw = {}) {
    const url = canonicalPageUrl(raw.url);
    if (!url || url.length > MAX_URL_LENGTH) return { ok: false, error: 'Arşivlenecek geçerli bir http/https adresi yok.' };
    const title = safeName(raw.title, 'Sayfa');
    const existing = this._readIndex().find((entry) => entry.url === url);
    const id = existing?.id || `rl-${Date.now().toString(36)}-${hash(url, 8)}`;
    const fileName = `${title}-${id.slice(-10)}.mhtml`;
    const filePath = this._safeFilePath(fileName);
    if (!filePath) return { ok: false, error: 'Okuma listesi dosya adı üretilemedi.' };
    return { ok: true, entry: {
      id, url, title: String(raw.title || title).slice(0, 200),
      createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(),
      fileName, sizeBytes: Number(existing?.sizeBytes) || 0,
    }, filePath, refreshed: !!existing };
  }

  // savePage başarısından sonra çağrılır; dosya boyutunu indekse işler.
  commit(entry) {
    if (!entry?.id || !entry?.fileName) return { ok: false, error: 'Eksik okuma kaydı.' };
    const filePath = this._safeFilePath(entry.fileName);
    if (!filePath) return { ok: false, error: 'Okuma listesi dosyası doğrulanamadı.' };
    try { entry.sizeBytes = this.fs.statSync(filePath).size; } catch (_) { entry.sizeBytes = 0; }
    const entries = this._readIndex().filter((item) => item.id !== entry.id);
    entries.unshift({ ...entry });
    this._writeIndex(entries);
    return { ok: true, entry: { ...entry } };
  }

  get(rawId) {
    const id = String(rawId || '').slice(0, 80);
    const entry = this._readIndex().find((item) => item.id === id);
    if (!entry) return null;
    const filePath = this._safeFilePath(entry.fileName);
    if (!filePath || !this.fs.existsSync(filePath)) return null;
    return { entry: { ...entry }, filePath };
  }

  remove(rawId) {
    const id = String(rawId || '').slice(0, 80);
    const entries = this._readIndex();
    const entry = entries.find((item) => item.id === id);
    if (!entry) return { ok: false, error: 'Kayıt bulunamadı.' };
    const filePath = this._safeFilePath(entry.fileName);
    try { if (filePath && this.fs.existsSync(filePath)) this.fs.unlinkSync(filePath); } catch (_) {}
    this._writeIndex(entries.filter((item) => item.id !== id));
    return { ok: true };
  }

  // Yenileme: aynı kaydın dosya yolunu döndürür; canlı sayfanın entry.url ile
  // aynı kanonik adreste olması koşulu çağıran tarafta doğrulanır.
  refreshTarget(rawId, rawUrl) {
    const found = this.get(rawId);
    if (!found) return { ok: false, error: 'Kayıt veya dosyası bulunamadı.' };
    if (canonicalPageUrl(rawUrl) !== found.entry.url) {
      return { ok: false, error: 'Yenileme için önce kaydın canlı sayfasını açın.' };
    }
    return { ok: true, entry: found.entry, filePath: found.filePath };
  }
}

module.exports = { BrowserReadingList, INDEX_LIMIT };
