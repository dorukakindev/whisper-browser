const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ASSET_VERSION = 1;

function hash(value, length = 24) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, length);
}

function normalizeCues(rawCues) {
  return (Array.isArray(rawCues) ? rawCues : []).map((cue, index) => {
    const start = Number(cue && cue.start);
    const end = Number(cue && cue.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return {
      id: String(cue && (cue.id ?? cue.index ?? index)).slice(0, 180),
      start: Math.max(0, start),
      end: Math.max(0, end),
      text: String(cue && cue.text || '').replace(/\r\n/g, '\n').trim().slice(0, 12000),
    };
  }).filter((cue) => cue && cue.text && cue.end >= cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end).slice(-20000);
}

function srtTime(seconds) {
  const value = Number(seconds);
  const totalMs = Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const sec = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const min = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function cuesToSrt(cues) {
  return normalizeCues(cues).map((cue, index) => (
    `${index + 1}\r\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\r\n${cue.text.replace(/\r/g, '').replace(/\n(?:[ \t]*\n)+/g, '\n')}\r\n`
  )).join('\r\n');
}

function safeMeta(raw = {}) {
  const allowedSources = new Set(['text-track', 'network', 'manifest', 'persisted', 'manual', 'embedded', 'live-asr', 'translation']);
  return {
    mediaId: String(raw.mediaId || '').slice(0, 240),
    trackId: String(raw.trackId || raw.id || '').slice(0, 180),
    language: String(raw.language || '').toLowerCase().slice(0, 24),
    label: String(raw.label || '').slice(0, 240),
    role: ['source', 'translation', 'secondary'].includes(raw.role) ? raw.role : 'source',
    source: allowedSources.has(raw.source) ? raw.source : 'manual',
  };
}

class BrowserAssetStore {
  constructor(options = {}) {
    if (!options.rootDir) throw new TypeError('rootDir gerekli.');
    this.rootDir = path.resolve(options.rootDir);
    this.fs = options.fsModule || fs;
  }

  assetPaths(assetId) {
    const match = String(assetId || '').match(/^([a-f0-9]{24}):([a-f0-9]{32})$/);
    if (!match) return null;
    const dir = path.join(this.rootDir, match[1]);
    return {
      dir,
      jsonPath: path.join(dir, `${match[2]}.json`),
      srtPath: path.join(dir, `${match[2]}.srt`),
    };
  }

  putTrack(raw = {}) {
    const meta = safeMeta(raw);
    if (!meta.mediaId) return { ok: false, error: 'Medya kimliği yok.' };
    const cues = normalizeCues(raw.cues);
    if (!cues.length) return { ok: false, error: 'Kaydedilecek altyazı bloğu yok.' };
    const mediaHash = hash(meta.mediaId, 24);
    const contentHash = hash(JSON.stringify({ meta, cues }), 32);
    const assetId = `${mediaHash}:${contentHash}`;
    const paths = this.assetPaths(assetId);
    const document = {
      version: ASSET_VERSION,
      assetId,
      ...meta,
      cueCount: cues.length,
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Date.now(),
      cues,
    };
    const tempJson = `${paths.jsonPath}.${process.pid}.${Date.now()}.tmp`;
    const tempSrt = `${paths.srtPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      this.fs.mkdirSync(paths.dir, { recursive: true });
      this.fs.writeFileSync(tempJson, `${JSON.stringify(document)}\n`, 'utf8');
      this.fs.writeFileSync(tempSrt, `\uFEFF${cuesToSrt(cues)}`, 'utf8');
      this.fs.renameSync(tempJson, paths.jsonPath);
      this.fs.renameSync(tempSrt, paths.srtPath);
      return { ok: true, assetId, jsonPath: paths.jsonPath, srtPath: paths.srtPath, document };
    } catch (error) {
      for (const temp of [tempJson, tempSrt]) {
        try { if (this.fs.existsSync(temp)) this.fs.unlinkSync(temp); } catch (_) {}
      }
      return { ok: false, error: error.message };
    }
  }

  getTrack(assetId) {
    const paths = this.assetPaths(assetId);
    if (!paths) return { ok: false, error: 'Geçersiz altyazı varlık kimliği.' };
    try {
      const parsed = JSON.parse(this.fs.readFileSync(paths.jsonPath, 'utf8'));
      if (!parsed || parsed.version !== ASSET_VERSION || parsed.assetId !== assetId) {
        return { ok: false, error: 'Altyazı varlığı biçimi desteklenmiyor.' };
      }
      const cues = normalizeCues(parsed.cues);
      if (!cues.length) return { ok: false, error: 'Altyazı varlığında geçerli blok yok.' };
      // JSON sağlamken SRT'nin elle veya eski bir sweep tarafından silinmesi
      // dışa aktarma yolunu ölü bırakmasın; türetilebilir dosyayı geri kur.
      if (!this.fs.existsSync(paths.srtPath)) {
        const tempSrt = `${paths.srtPath}.${process.pid}.${Date.now()}.tmp`;
        this.fs.writeFileSync(tempSrt, `\uFEFF${cuesToSrt(cues)}`, 'utf8');
        this.fs.renameSync(tempSrt, paths.srtPath);
      }
      return { ok: true, document: { ...parsed, cues }, ...paths };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  removeTrack(assetId) {
    const paths = this.assetPaths(assetId);
    if (!paths) return { ok: false, error: 'Geçersiz altyazı varlık kimliği.' };
    try {
      for (const filePath of [paths.jsonPath, paths.srtPath]) {
        if (this.fs.existsSync(filePath)) this.fs.unlinkSync(filePath);
      }
      try { this.fs.rmdirSync(paths.dir); } catch (_) {}
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  sweepTempFiles(maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now()) {
    let removed = 0;
    const visit = (directory) => {
      let entries = [];
      try { entries = this.fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return; }
      for (const entry of entries) {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(filePath);
          continue;
        }
        if (!entry.name.endsWith('.tmp')) continue;
        try {
          if (now - this.fs.statSync(filePath).mtimeMs >= maxAgeMs) {
            this.fs.unlinkSync(filePath);
            removed += 1;
          }
        } catch (_) {}
      }
    };
    visit(this.rootDir);
    return removed;
  }

  sweepOrphans(referencedAssetIds = new Set(), maxAgeMs = 30 * 24 * 60 * 60 * 1000, now = Date.now()) {
    const referenced = referencedAssetIds instanceof Set
      ? referencedAssetIds : new Set(referencedAssetIds || []);
    let removed = 0;
    let entries = [];
    try { entries = this.fs.readdirSync(this.rootDir, { withFileTypes: true }); } catch (_) { return removed; }
    for (const directory of entries) {
      if (!directory.isDirectory() || !/^[a-f0-9]{24}$/i.test(directory.name)) continue;
      const dirPath = path.join(this.rootDir, directory.name);
      let files = [];
      try { files = this.fs.readdirSync(dirPath, { withFileTypes: true }); } catch (_) { continue; }
      const names = new Set(files.filter((entry) => entry.isFile()).map((entry) => entry.name));
      const stems = new Set([...names].map((name) => name.match(/^([a-f0-9]{32})\.(?:json|srt)$/i)?.[1]).filter(Boolean));
      for (const stem of stems) {
        const assetId = `${directory.name.toLowerCase()}:${stem.toLowerCase()}`;
        if (referenced.has(assetId)) continue;
        const pair = [path.join(dirPath, `${stem}.json`), path.join(dirPath, `${stem}.srt`)];
        let newest = 0;
        for (const filePath of pair) {
          try { newest = Math.max(newest, this.fs.statSync(filePath).mtimeMs); } catch (_) {}
        }
        if (!newest || now - newest < maxAgeMs) continue;
        for (const filePath of pair) {
          try { if (this.fs.existsSync(filePath)) { this.fs.unlinkSync(filePath); removed += 1; } } catch (_) {}
        }
      }
      try { this.fs.rmdirSync(dirPath); } catch (_) {}
    }
    return removed;
  }
}

module.exports = {
  ASSET_VERSION,
  BrowserAssetStore,
  cuesToSrt,
  normalizeCues,
  srtTime,
};
