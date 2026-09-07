(function exposeBrowserSubtitleSync(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrowserSubtitleSync = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const SYNC_RECORD_VERSION = 1;
  const EDIT_RECORD_VERSION = 1;
  const MAX_ABS_OFFSET_SECONDS = 24 * 60 * 60;
  const MIN_SCALE = .25;
  const MAX_SCALE = 4;
  const MIN_POINT_SPAN_SECONDS = 1;

  function clean(value, max = 240) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  function hashText(value) {
    // Renderer ve Node'da ayni sonucu veren kucuk, kriptografik olmayan kimlik.
    // Gizlilik karari degil; cue/source revizyonlarini yanlis eslestirmemek icin.
    let hash = 0x811c9dc5;
    const text = String(value == null ? '' : value).normalize('NFC');
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function cueKey(cue, index = 0) {
    const explicit = clean(cue && (cue.cueId ?? cue.id), 180).replace(/^web-tr-/, '');
    if (explicit) return explicit;
    return `cue-${index}-${hashText(`${Number(cue?.start)}|${Number(cue?.end)}|${cue?.text || ''}`)}`;
  }

  function cueSourceHash(cue, index = 0) {
    return hashText(`${cueKey(cue, index)}|${Number(cue?.start)}|${Number(cue?.end)}|${cue?.sourceText ?? cue?.text ?? ''}`);
  }

  function cuePrefixHash(cues, limit = 32) {
    const list = Array.isArray(cues) ? cues.slice(0, Math.max(1, limit)) : [];
    return hashText(list.map((cue, index) => `${cueKey(cue, index)}:${cueSourceHash(cue, index)}`).join('\n'));
  }

  function normalizeTransform(raw = {}) {
    const scale = raw.scale === undefined ? 1 : Number(raw.scale);
    const offsetSeconds = Number(raw.offsetSeconds ?? raw.offset ?? 0);
    if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
      throw new TypeError('Senkron ölçeği 0,25× ile 4× arasında olmalı.');
    }
    if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > MAX_ABS_OFFSET_SECONDS) {
      throw new TypeError('Senkron kaydırması geçersiz veya güvenli aralığın dışında.');
    }
    return { scale, offsetSeconds };
  }

  function sourceToVideoTime(sourceTime, transform) {
    const source = Number(sourceTime);
    if (!Number.isFinite(source)) throw new TypeError('Kaynak zamanı geçersiz.');
    const normalized = normalizeTransform(transform);
    return source * normalized.scale + normalized.offsetSeconds;
  }

  function videoToSourceTime(videoTime, transform) {
    const video = Number(videoTime);
    if (!Number.isFinite(video)) throw new TypeError('Video zamanı geçersiz.');
    const normalized = normalizeTransform(transform);
    return (video - normalized.offsetSeconds) / normalized.scale;
  }

  function normalizePoint(raw) {
    const sourceTime = Number(raw && raw.sourceTime);
    const videoTime = Number(raw && raw.videoTime);
    if (!Number.isFinite(sourceTime) || !Number.isFinite(videoTime) || sourceTime < 0 || videoTime < 0) {
      throw new TypeError('Eşleşme noktası geçersiz.');
    }
    return { sourceTime, videoTime, cueId: clean(raw && raw.cueId, 180) };
  }

  function calculateTwoPointTransform(first, second, minimumSpan = MIN_POINT_SPAN_SECONDS) {
    const point1 = normalizePoint(first);
    const point2 = normalizePoint(second);
    const sourceSpan = point2.sourceTime - point1.sourceTime;
    const videoSpan = point2.videoTime - point1.videoTime;
    // Bir saniyeden kisa iki tik, kullanicinin kare/tik hassasiyetini yuzlerce
    // dakikaya buyutebilir. Clamp etmek yerine sonucu acikca reddediyoruz.
    if (sourceSpan < minimumSpan || videoSpan <= 0) {
      throw new RangeError('İki eşleşme aynı, ters sıralı veya birbirine çok yakın.');
    }
    const scale = videoSpan / sourceSpan;
    const offsetSeconds = point1.videoTime - point1.sourceTime * scale;
    const transform = normalizeTransform({ scale, offsetSeconds });
    return { ...transform, points: [point1, point2] };
  }

  function createSyncRecord(raw) {
    const mediaId = clean(raw && raw.mediaId, 240);
    const sourceTrackId = clean(raw && raw.sourceTrackId, 180);
    const sourceHash = clean(raw && raw.sourceHash, 128);
    if (!mediaId || !sourceTrackId || !sourceHash) throw new TypeError('Senkron kaydının medya, iz veya kaynak kimliği eksik.');
    const transform = normalizeTransform(raw);
    const points = Array.isArray(raw.points) ? raw.points.filter(Boolean).slice(0, 2).map(normalizePoint) : [];
    return {
      version: SYNC_RECORD_VERSION,
      mediaId,
      sourceTrackId,
      sourceHash,
      sourcePrefixHash: clean(raw.sourcePrefixHash, 64),
      sourcePrefixCount: Math.max(0, Math.min(32, Number(raw.sourcePrefixCount) || 0)),
      scale: transform.scale,
      offsetSeconds: transform.offsetSeconds,
      points,
      updatedAt: Math.max(0, Number(raw.updatedAt) || Date.now()),
    };
  }

  function syncRecordMatches(record, context) {
    let item;
    try { item = createSyncRecord(record); } catch (_) { return false; }
    if (item.mediaId !== clean(context?.mediaId, 240)
        || item.sourceTrackId !== clean(context?.sourceTrackId, 180)) return false;
    const currentHash = clean(context?.sourceHash, 128);
    if (currentHash && item.sourceHash === currentHash) return true;
    // Canli izlerde tam hash yeni cue ile degisir. Yalniz ayni lineage ve ilk
    // cue kimlikleri birebir korunuyorsa append-only uyumluluga izin ver.
    const recordedCount = item.sourcePrefixCount;
    const currentPrefix = clean(context?.sourcePrefixHashes?.[recordedCount]
      || context?.sourcePrefixHash, 64);
    return !!item.sourcePrefixHash && item.sourcePrefixCount > 0
      && item.sourcePrefixHash === currentPrefix
      && Number(context?.sourcePrefixCount) >= recordedCount;
  }

  function transformCuesForExport(cues, transform, onWarning) {
    const normalized = normalizeTransform(transform);
    const source = Array.isArray(cues) ? cues : [];
    const output = [];
    let clamped = 0;
    let skipped = 0;
    for (const cue of source) {
      const start = sourceToVideoTime(cue.start, normalized);
      const end = sourceToVideoTime(cue.end, normalized);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new RangeError('Senkron uygulanınca geçersiz altyazı zamanı oluştu.');
      }
      if (end <= 0) {
        skipped++;
        continue;
      }
      if (start < 0) clamped++;
      output.push({ ...cue, start: Math.max(0, start), end });
    }
    if (source.length && !output.length) {
      throw new RangeError('Senkron uygulanınca dışa aktarılacak geçerli altyazı kalmadı.');
    }
    if ((clamped || skipped) && typeof onWarning === 'function') {
      const details = [];
      if (clamped) details.push(`${clamped} altyazı video başlangıcında kırpıldı`);
      if (skipped) details.push(`${skipped} altyazı video başlamadan bittiği için atlandı`);
      onWarning(`${details.join('; ')}.`);
    }
    return output;
  }

  function createEditRecord(raw) {
    const mediaId = clean(raw?.mediaId, 240);
    const variantId = clean(raw?.variantId, 180);
    const sourceHash = clean(raw?.sourceHash, 128);
    const cueId = clean(raw?.cueId, 180);
    const sourceCueHash = clean(raw?.sourceCueHash, 64);
    if (!mediaId || !variantId || !sourceHash || !cueId || !sourceCueHash) {
      throw new TypeError('Kullanıcı düzeltmesinin kalıcı kimliği eksik.');
    }
    return {
      version: EDIT_RECORD_VERSION,
      mediaId, variantId, sourceHash, cueId, sourceCueHash,
      baseTranslation: String(raw.baseTranslation ?? ''),
      hasOverride: raw.hasOverride === true,
      userOverride: raw.hasOverride === true ? String(raw.userOverride ?? '') : null,
      revision: Math.max(1, Number(raw.revision) || 1),
      userEditedAt: Math.max(0, Number(raw.userEditedAt) || Date.now()),
    };
  }

  function editRecordMatches(record, context) {
    let item;
    try { item = createEditRecord(record); } catch (_) { return false; }
    return item.mediaId === clean(context?.mediaId, 240)
      && item.variantId === clean(context?.variantId, 180)
      && item.sourceHash === clean(context?.sourceHash, 128)
      && item.cueId === clean(context?.cueId, 180)
      && item.sourceCueHash === clean(context?.sourceCueHash, 64);
  }

  function applyEditRecord(modelCue, record, context) {
    if (!editRecordMatches(record, context)) return { ...modelCue };
    const item = createEditRecord(record);
    return {
      ...modelCue,
      text: item.hasOverride ? item.userOverride : String(modelCue?.text ?? ''),
      baseTranslation: String(modelCue?.text ?? ''),
      userOverride: item.hasOverride ? item.userOverride : null,
      userRevision: item.revision,
    };
  }

  return {
    EDIT_RECORD_VERSION,
    MAX_ABS_OFFSET_SECONDS,
    MAX_SCALE,
    MIN_POINT_SPAN_SECONDS,
    MIN_SCALE,
    SYNC_RECORD_VERSION,
    applyEditRecord,
    calculateTwoPointTransform,
    createEditRecord,
    createSyncRecord,
    cueKey,
    cuePrefixHash,
    cueSourceHash,
    editRecordMatches,
    hashText,
    normalizeTransform,
    sourceToVideoTime,
    syncRecordMatches,
    transformCuesForExport,
    videoToSourceTime,
  };
}));
