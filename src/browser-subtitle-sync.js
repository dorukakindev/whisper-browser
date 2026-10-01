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
  const MAX_POINTS = 8;

  function clean(value, max = 240) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  function hashText(value) {
    // Renderer ve Node'da ayni sonucu veren kucuk, kriptografik olmayan kimlik.
    // Gizlilik karari degil; cue/source revizyonlarini yanlis eslestirmemek icin.
    // Görünmez enjeksiyonlar (bidi kontrolleri, ZWSP/ZWNJ/ZWJ, WJ, gövde BOM'u)
    // kimliği bölmesin: gösterim metni korunur ama hash onlarsız hesaplanır.
    let hash = 0x811c9dc5;
    const text = String(value == null ? '' : value)
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u061C\uFEFF]/g, '')
      .normalize('NFC');
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
    let point1 = normalizePoint(first);
    let point2 = normalizePoint(second);
    if (point1.sourceTime > point2.sourceTime) [point1, point2] = [point2, point1];
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

  // Çok noktalı fit: N>=2 noktada en küçük kareler scale+offset.
  // Kesilmiş/reklam eklenmiş videoda tek iki nokta yanıltır; artık değerler
  // (residual) güven düzeyini ölçer ve sapan noktayı işaretler.
  function calculateMultiPointTransform(rawPoints) {
    const list = (Array.isArray(rawPoints) ? rawPoints : []).map(normalizePoint)
      .sort((a, b) => a.sourceTime - b.sourceTime);
    if (list.length < 2) throw new TypeError('En az iki eşleşme noktası gerekli.');
    const sourceSpan = list[list.length - 1].sourceTime - list[0].sourceTime;
    if (sourceSpan < MIN_POINT_SPAN_SECONDS) {
      throw new RangeError('Eşleşme noktaları aynı veya birbirine çok yakın.');
    }
    const n = list.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of list) { sx += p.sourceTime; sy += p.videoTime; sxx += p.sourceTime * p.sourceTime; sxy += p.sourceTime * p.videoTime; }
    const denom = n * sxx - sx * sx;
    if (denom <= 0) throw new RangeError('Eşleşme noktaları aynı kaynak zamanında yığılmış.');
    const scale = (n * sxy - sx * sy) / denom;
    const offsetSeconds = (sy - scale * sx) / n;
    const transform = normalizeTransform({ scale, offsetSeconds });
    const residuals = list.map((p) => p.videoTime - (p.sourceTime * transform.scale + transform.offsetSeconds));
    const rmsError = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n);
    const maxError = Math.max(...residuals.map(Math.abs));
    // Sapan nokta işaretleme: leave-one-out. Her nokta kalanlarla yeniden
    // fit edilir; noktanın o fit'e olan uzaklığı kalanların RMS'inden
    // belirgin büyükse outlier sayılır (3+ noktada anlamlı). Tek fit'in
    // RMS'i outlier tarafından şiştiği için onu gizleyemez.
    const fitOn = (subset) => {
      let fsx = 0, fsy = 0, fsxx = 0, fsxy = 0;
      for (const p of subset) { fsx += p.sourceTime; fsy += p.videoTime; fsxx += p.sourceTime * p.sourceTime; fsxy += p.sourceTime * p.videoTime; }
      const fdenom = subset.length * fsxx - fsx * fsx;
      if (fdenom <= 0) return null;
      const fscale = (subset.length * fsxy - fsx * fsy) / fdenom;
      return { scale: fscale, offset: (fsy - fscale * fsx) / subset.length };
    };
    const outliers = [];
    if (n >= 3) {
      list.forEach((point, i) => {
        const rest = list.filter((_, j) => j !== i);
        const fit = fitOn(rest);
        if (!fit) return;
        const restRms = Math.sqrt(rest.reduce((sum, p) => {
          const r = p.videoTime - (p.sourceTime * fit.scale + fit.offset);
          return sum + r * r;
        }, 0) / rest.length);
        const looResidual = Math.abs(point.videoTime - (point.sourceTime * fit.scale + fit.offset));
        if (looResidual > Math.max(.5, 3 * restRms)) outliers.push(i);
      });
    }
    const level = n === 2 ? 'exact' : rmsError <= .3 ? 'high' : rmsError <= 1 ? 'medium' : 'low';
    return { ...transform, points: list, residuals,
             confidence: { rmsError, maxError, outliers, level, count: n } };
  }

  function createSyncRecord(raw) {
    const mediaId = clean(raw && raw.mediaId, 240);
    const sourceTrackId = clean(raw && raw.sourceTrackId, 180);
    const sourceHash = clean(raw && raw.sourceHash, 128);
    if (!mediaId || !sourceTrackId || !sourceHash) throw new TypeError('Senkron kaydının medya, iz veya kaynak kimliği eksik.');
    const transform = normalizeTransform(raw);
    const points = Array.isArray(raw.points) ? raw.points.filter(Boolean).slice(0, MAX_POINTS).map(normalizePoint) : [];
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
    let invalidSkipped = 0;
    for (const cue of source) {
      const start = sourceToVideoTime(cue.start, normalized);
      const end = sourceToVideoTime(cue.end, normalized);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        invalidSkipped++;
        continue;
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
    if ((clamped || skipped || invalidSkipped) && typeof onWarning === 'function') {
      const details = [];
      if (clamped) details.push(`${clamped} altyazı video başlangıcında kırpıldı`);
      if (skipped) details.push(`${skipped} altyazı video başlamadan bittiği için atlandı`);
      if (invalidSkipped) details.push(`${invalidSkipped} altyazının zamanı geçersiz olduğu için atlandı`);
      onWarning(`${details.join('; ')}.`);
    }
    return output;
  }

  function createEditRecord(raw) {
    const timing = raw?.timingOverride;
    if (timing != null && (!Number.isFinite(timing.start) || !Number.isFinite(timing.end)
        || timing.start < 0 || timing.end - timing.start < .08)) {
      throw new TypeError('Altyazı bitişi başlangıçtan en az 0,08 saniye sonra olmalı.');
    }
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
      ...(timing != null ? { timingOverride: { start: timing.start, end: timing.end } } : {}),
      hasOverride: raw.hasOverride === true,
      userOverride: raw.hasOverride === true ? String(raw.userOverride ?? '') : null,
      revision: Math.max(1, Number(raw.revision) || 1),
      userEditedAt: Math.max(0, Number(raw.userEditedAt) || Date.now()),
    };
  }

  function editRecordMatches(record, context) {
    let item;
    try { item = createEditRecord(record); } catch (_) { return false; }
    return recordFieldsMatch(item, context);
  }

  function recordFieldsMatch(item, context) {
    return item.mediaId === clean(context?.mediaId, 240)
      && item.variantId === clean(context?.variantId, 180)
      && item.sourceHash === clean(context?.sourceHash, 128)
      && item.cueId === clean(context?.cueId, 180)
      && item.sourceCueHash === clean(context?.sourceCueHash, 64);
  }

  function applyEditRecord(modelCue, record, context) {
    // Eşleşme kontrolü kaydı zaten normalize eder; normalize edilmiş kaydı
    // ikinci kez derlemek (throw/catch yolu) kimliksiz edit yığınında ~2x
    // maliyet üretiyordu (PF2b).
    let item;
    try { item = createEditRecord(record); } catch (_) { return { ...modelCue }; }
    if (!recordFieldsMatch(item, context)) return { ...modelCue };
    return {
      ...modelCue,
      cueId: modelCue.cueId || context.cueId,
      sourceCueHash: modelCue.sourceCueHash || context.sourceCueHash,
      ...(item.timingOverride ? { cueId: modelCue.cueId || context.cueId,
        sourceStart: modelCue.sourceStart ?? modelCue.start, sourceEnd: modelCue.sourceEnd ?? modelCue.end,
        start: item.timingOverride.start, end: item.timingOverride.end } : {}),
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
    MAX_POINTS,
    MIN_SCALE,
    SYNC_RECORD_VERSION,
    applyEditRecord,
    calculateTwoPointTransform,
    calculateMultiPointTransform,
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
