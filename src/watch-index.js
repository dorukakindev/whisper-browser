const path = require('path');

const WATCH_INDEX_VERSION = 2;

function databaseConstructor() {
  try { return require('node:sqlite').DatabaseSync; }
  catch (_) { return null; }
}

function json(value, fallback = {}) {
  try { return JSON.stringify(value == null ? fallback : value); }
  catch (_) { return JSON.stringify(fallback); }
}

function ftsQuery(raw) {
  const tokens = String(raw || '').normalize('NFKC').match(/[\p{L}\p{N}_'-]+/gu) || [];
  return tokens.slice(0, 12).map((token) => `"${token.replace(/"/g, '""')}"*`).join(' AND ');
}

function foldSearchText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('tr-TR');
}

class WatchIndex {
  constructor(filePath, options = {}) {
    const DatabaseSync = options.DatabaseSync || databaseConstructor();
    if (!DatabaseSync) throw new Error('Bu Node/Electron sürümünde node:sqlite kullanılamıyor.');
    this.filePath = path.resolve(filePath);
    this.db = new DatabaseSync(this.filePath);
    this.hasTurkishFold = typeof this.db.function === 'function';
    if (this.hasTurkishFold) {
      this.db.function('tr_fold', { deterministic: true }, foldSearchText);
    }
    this.initialize();
  }

  initialize() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO meta(key, value) VALUES('schema_version', '${WATCH_INDEX_VERSION}')
        ON CONFLICT(key) DO UPDATE SET value=excluded.value;

      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        service TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        duration REAL NOT NULL DEFAULT 0,
        position REAL NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        last_watched INTEGER NOT NULL DEFAULT 0,
        prefs_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'source',
        language TEXT NOT NULL DEFAULT '',
        label TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        hash TEXT NOT NULL DEFAULT '',
        asset_path TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS tracks_media_idx ON tracks(media_id);

      CREATE TABLE IF NOT EXISTS cues (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        cue_id TEXT NOT NULL,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        start REAL NOT NULL DEFAULT 0,
        end REAL NOT NULL DEFAULT 0,
        source_text TEXT NOT NULL DEFAULT '',
        translation_text TEXT NOT NULL DEFAULT '',
        UNIQUE(track_id, cue_id)
      );
      CREATE INDEX IF NOT EXISTS cues_track_time_idx ON cues(track_id, start);

      CREATE VIRTUAL TABLE IF NOT EXISTS cue_fts USING fts5(
        source_text,
        translation_text,
        content='cues',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS cues_ai AFTER INSERT ON cues BEGIN
        INSERT INTO cue_fts(rowid, source_text, translation_text)
        VALUES (new.rowid, new.source_text, new.translation_text);
      END;
      CREATE TRIGGER IF NOT EXISTS cues_ad AFTER DELETE ON cues BEGIN
        INSERT INTO cue_fts(cue_fts, rowid, source_text, translation_text)
        VALUES ('delete', old.rowid, old.source_text, old.translation_text);
      END;
      CREATE TRIGGER IF NOT EXISTS cues_au AFTER UPDATE ON cues BEGIN
        INSERT INTO cue_fts(cue_fts, rowid, source_text, translation_text)
        VALUES ('delete', old.rowid, old.source_text, old.translation_text);
        INSERT INTO cue_fts(rowid, source_text, translation_text)
        VALUES (new.rowid, new.source_text, new.translation_text);
      END;

      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'note',
        start REAL NOT NULL DEFAULT 0,
        end REAL NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT '',
        translation TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        screenshot_ref TEXT NOT NULL DEFAULT '',
        audio_ref TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS annotations_media_time_idx ON annotations(media_id, start);
    `);
    const trackColumns = new Set(this.db.prepare('PRAGMA table_info(tracks)').all().map((row) => row.name));
    if (!trackColumns.has('model')) this.db.exec("ALTER TABLE tracks ADD COLUMN model TEXT NOT NULL DEFAULT ''");
    if (!trackColumns.has('provider')) this.db.exec("ALTER TABLE tracks ADD COLUMN provider TEXT NOT NULL DEFAULT ''");
    if (!trackColumns.has('source_track_id')) this.db.exec("ALTER TABLE tracks ADD COLUMN source_track_id TEXT NOT NULL DEFAULT ''");
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  upsertMedia(item = {}) {
    if (!item.id) throw new TypeError('Medya kimliği gerekli.');
    this.db.prepare(`
      INSERT INTO media(id, service, title, url, duration, position, completed, last_watched, prefs_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        service=excluded.service, title=excluded.title, url=excluded.url,
        duration=excluded.duration, position=excluded.position, completed=excluded.completed,
        last_watched=excluded.last_watched, prefs_json=excluded.prefs_json
    `).run(
      String(item.id), String(item.service || ''), String(item.title || ''), String(item.url || ''),
      Math.max(0, Number(item.duration) || 0), Math.max(0, Number(item.position) || 0), item.completed ? 1 : 0,
      Number(item.lastWatched || item.last_watched) || Date.now(), json(item.prefs),
    );
    return this.getMedia(item.id);
  }

  getMedia(id) {
    const row = this.db.prepare('SELECT * FROM media WHERE id = ?').get(String(id || ''));
    if (!row) return null;
    try { row.prefs = JSON.parse(row.prefs_json || '{}'); } catch (_) { row.prefs = {}; }
    delete row.prefs_json;
    row.completed = !!row.completed;
    return row;
  }

  listMedia(limit = 100, offset = 0) {
    return this.db.prepare('SELECT * FROM media ORDER BY last_watched DESC LIMIT ? OFFSET ?')
      .all(Math.max(1, Math.min(1000, Number(limit) || 100)), Math.max(0, Number(offset) || 0));
  }

  removeMedia(id) {
    return this.db.prepare('DELETE FROM media WHERE id = ?').run(String(id || ''));
  }

  upsertTrack(track = {}) {
    if (!track.id || !track.mediaId) throw new TypeError('İz ve medya kimliği gerekli.');
    this.db.prepare(`
      INSERT INTO tracks(id, media_id, role, language, label, source, hash, asset_path, updated_at, model, provider, source_track_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        media_id=excluded.media_id, role=excluded.role, language=excluded.language,
        label=excluded.label, source=excluded.source, hash=excluded.hash,
        asset_path=excluded.asset_path, updated_at=excluded.updated_at,
        model=excluded.model, provider=excluded.provider, source_track_id=excluded.source_track_id
    `).run(
      String(track.id), String(track.mediaId), String(track.role || 'source'), String(track.language || ''),
      String(track.label || ''), String(track.source || ''), String(track.hash || ''),
      String(track.assetPath || ''), Number(track.updatedAt) || Date.now(), String(track.model || ''),
      String(track.provider || ''), String(track.sourceTrackId || ''),
    );
    return this.db.prepare('SELECT * FROM tracks WHERE id = ?').get(String(track.id));
  }

  getTrack(id) {
    return this.db.prepare('SELECT * FROM tracks WHERE id = ?').get(String(id || '')) || null;
  }

  listTracks(mediaId) {
    return this.db.prepare('SELECT * FROM tracks WHERE media_id = ? ORDER BY updated_at DESC')
      .all(String(mediaId || ''));
  }

  listTrackAssetPaths() {
    return this.db.prepare("SELECT asset_path FROM tracks WHERE asset_path <> ''")
      .all().map((row) => String(row.asset_path || '')).filter(Boolean);
  }

  pruneTracks(options = {}) {
    const maxTracks = Math.max(100, Number(options.maxTracks) || 3000);
    const maxAgeMs = Math.max(24 * 60 * 60 * 1000, Number(options.maxAgeMs) || 180 * 24 * 60 * 60 * 1000);
    const cutoff = Date.now() - maxAgeMs;
    const rows = this.db.prepare(`
      SELECT id, asset_path, updated_at FROM tracks
      ORDER BY updated_at DESC
    `).all();
    const removed = rows.filter((row, index) => index >= maxTracks || Number(row.updated_at) < cutoff);
    const remove = this.db.prepare('DELETE FROM tracks WHERE id = ?');
    this.transaction(() => { for (const row of removed) remove.run(String(row.id)); });
    return removed;
  }

  replaceTrackCues(trackId, rawCues) {
    const cues = Array.isArray(rawCues) ? rawCues : [];
    return this.transaction(() => {
      this.db.prepare('DELETE FROM cues WHERE track_id = ?').run(String(trackId));
      const insert = this.db.prepare(`
        INSERT INTO cues(cue_id, track_id, start, end, source_text, translation_text)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (let index = 0; index < cues.length; index++) {
        const cue = cues[index] || {};
        insert.run(
          String(cue.id ?? index), String(trackId), Math.max(0, Number(cue.start) || 0),
          Math.max(0, Number(cue.end) || 0), String(cue.sourceText ?? cue.text ?? ''),
          String(cue.translationText ?? cue.translation ?? ''),
        );
      }
      return cues.length;
    });
  }

  searchCues(query, limit = 50) {
    const match = ftsQuery(query);
    if (!match) return [];
    return this.db.prepare(`
      SELECT m.id AS media_id, m.service, m.title, m.url,
             t.id AS track_id, t.language, t.role, t.model, t.provider, t.source_track_id, t.updated_at,
             c.cue_id, c.start, c.end, c.source_text, c.translation_text,
              snippet(cue_fts, -1, '[', ']', ' … ', 18) AS snippet
      FROM cue_fts
      JOIN cues c ON c.rowid = cue_fts.rowid
      JOIN tracks t ON t.id = c.track_id
      JOIN media m ON m.id = t.media_id
      WHERE cue_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(match, Math.max(1, Math.min(200, Number(limit) || 50)));
  }

  upsertAnnotation(annotation = {}) {
    if (!annotation.id || !annotation.mediaId) throw new TypeError('Not ve medya kimliği gerekli.');
    this.db.prepare(`
      INSERT INTO annotations(id, media_id, type, start, end, source, translation, note, status,
                              screenshot_ref, audio_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        media_id=excluded.media_id, type=excluded.type, start=excluded.start, end=excluded.end,
        source=excluded.source, translation=excluded.translation, note=excluded.note,
        status=excluded.status, screenshot_ref=excluded.screenshot_ref,
        audio_ref=excluded.audio_ref, updated_at=excluded.updated_at
    `).run(
      String(annotation.id), String(annotation.mediaId), String(annotation.type || 'note'),
      Math.max(0, Number(annotation.start) || 0), Math.max(0, Number(annotation.end) || 0),
      String(annotation.source || ''), String(annotation.translation || ''), String(annotation.note || ''),
      String(annotation.status || 'new'), String(annotation.screenshotRef || ''), String(annotation.audioRef || ''),
      Number(annotation.createdAt) || Date.now(), Number(annotation.updatedAt) || Date.now(),
    );
    return this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(String(annotation.id));
  }

  listAnnotations(mediaId) {
    return this.db.prepare('SELECT * FROM annotations WHERE media_id = ? ORDER BY start, created_at')
      .all(String(mediaId || ''));
  }

  listAllAnnotations(limit = 50000) {
    return this.db.prepare(`
      SELECT a.*, m.service, m.title, m.url
      FROM annotations a JOIN media m ON m.id = a.media_id
      ORDER BY a.updated_at DESC LIMIT ?
    `).all(Math.max(1, Math.min(50000, Number(limit) || 50000)));
  }

  removeAnnotation(id) {
    return this.db.prepare('DELETE FROM annotations WHERE id = ?').run(String(id || ''));
  }

  searchAnnotations(query, limit = 50) {
    const value = String(query || '').trim();
    if (!value) return [];
    const folded = foldSearchText(value);
    const capped = Math.max(1, Math.min(200, Number(limit) || 50));
    if (this.hasTurkishFold) {
      return this.db.prepare(`
        SELECT a.*, m.service, m.title, m.url
        FROM annotations a JOIN media m ON m.id = a.media_id
        WHERE instr(tr_fold(a.source), ?) > 0
           OR instr(tr_fold(a.translation), ?) > 0
           OR instr(tr_fold(a.note), ?) > 0
        ORDER BY a.updated_at DESC LIMIT ?
      `).all(folded, folded, folded, capped);
    }
    const rows = this.db.prepare(`
      SELECT a.*, m.service, m.title, m.url
      FROM annotations a JOIN media m ON m.id = a.media_id
      ORDER BY a.updated_at DESC LIMIT 5000
    `).all();
    return rows.filter((row) => (
      foldSearchText(row.source).includes(folded)
      || foldSearchText(row.translation).includes(folded)
      || foldSearchText(row.note).includes(folded)
    )).slice(0, capped);
  }

  migrateLegacyWatchLibrary(items) {
    let count = 0;
    this.transaction(() => {
      for (const item of Array.isArray(items) ? items : []) {
        if (!item || !item.key) continue;
        this.upsertMedia({
          id: item.key,
          service: item.type || '',
          title: item.title || '',
          url: item.sourceRef || '',
          duration: item.duration,
          position: item.position,
          completed: item.completed,
          lastWatched: item.lastWatched,
          prefs: item.prefs,
        });
        count++;
      }
    });
    return count;
  }

  close() {
    if (this.db) this.db.close();
  }
}

module.exports = {
  WATCH_INDEX_VERSION,
  WatchIndex,
  databaseConstructor,
  foldSearchText,
  ftsQuery,
};
