const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ASSET_VERSION = 1;

function hash(value, length = 24) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, length);
}

function normalizeCues(rawCues) {
  return (Array.isArray(rawCues) ? rawCues : []).map((cue, index) => ({
    id: String(cue && (cue.id ?? cue.index ?? index)).slice(0, 180),
    start: Math.max(0, Number(cue && cue.start) || 0),
    end: Math.max(0, Number(cue && cue.end) || 0),
    text: String(cue && cue.text || '').replace(/\r\n/g, '\n').trim().slice(0, 12000),
  })).filter((cue) => cue.text && cue.end >= cue.start).sort((a, b) => a.start - b.start || a.end - b.end);
}

function srtTime(seconds) {
  const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
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
    `${index + 1}\r\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\r\n${cue.text}\r\n`
  )).join('\r\n');
}

function safeMeta(raw = {}) {
  const allowedSources = new Set(['text-track', 'network', 'manifest', 'persisted', 'manual', 'embedded', 'live-asr']);
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
      return { ok: true, document: { ...parsed, cues: normalizeCues(parsed.cues) }, ...paths };
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
}

module.exports = {
  ASSET_VERSION,
  BrowserAssetStore,
  cuesToSrt,
  normalizeCues,
  srtTime,
};
