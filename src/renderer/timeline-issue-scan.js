// Zamanlama masası saf yardımcıları — DOM/renderer bağımsız, Node testlerinde
// doğrudan require edilebilir (status-copy.js ile aynı UMD kalıbı).
(function initTimelineIssueScan(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TimelineIssueScan = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  // CPS şeridi: 0 → limit, 1 → limit*1.6 ve üzeri. drawTimeline renk dönüşümü
  // için 0..1 kesir döner; kırmızı eşiği ayrıca cpsLimit kontrolüyle çizilir.
  function cpsOf(cue) {
    const dur = Math.max(.05, (Number(cue?.end) || 0) - (Number(cue?.start) || 0));
    return String(cue?.text || '').trim().length / dur;
  }
  function cpsTier(cue, cpsLimit) {
    const limit = Number(cpsLimit) > 0 ? Number(cpsLimit) : 20;
    return Math.min(1, cpsOf(cue) / (limit * 1.6));
  }

  // Sorun taraması: boş metin, aşırı kısa süre (<1s), komşu çakışması,
  // CPS limiti aşımı, satır kırılması (3+ satır veya satır genişliği aşımı).
  // Çakışma bir SONRAKİ bloğa atanır (i-1.end > i.start).
  const KINDS = ['empty', 'short', 'overlap', 'fast', 'lines', 'invalid'];
  function scan(cues, options = {}) {
    const cpsLimit = Number(options.cpsLimit) > 0 ? Number(options.cpsLimit) : 20;
    const lineLimit = Number(options.lineLimit) > 0 ? Number(options.lineLimit) : 80;
    const issues = [];
    const list = Array.isArray(cues) ? cues : [];
    let previousEnd = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const c = list[i] || {};
      if (![c.start, c.end].every(value => typeof value === 'number' && Number.isFinite(value)) || c.start < 0 || c.end <= c.start) {
        issues.push({ i, kind: 'invalid' }); continue;
      }
      const start = Number(c.start) || 0;
      const end = Number(c.end) || 0;
      const text = String(c.text || '').trim();
      const dur = Math.max(0, end - start);
      if (!text) issues.push({ i, kind: 'empty' });
      else {
        if (dur < 1) issues.push({ i, kind: 'short' });
        if (text.length / Math.max(.1, dur) > cpsLimit) issues.push({ i, kind: 'fast' });
        const lines = String(c.text).split('\n');
        if (lines.length > 3 || lines.some((l) => l.length > lineLimit)) issues.push({ i, kind: 'lines' });
      }
      if (previousEnd > start + .01) issues.push({ i, kind: 'overlap' });
      previousEnd = Math.max(previousEnd, end);
    }
    return issues;
  }

  // Kurtarma kaydı taban imzası: aynı kaynak aynı içerikle açılırsa kaydedilen
  // imzayla eşleşir; dosya/kaynak değiştiyse farklılık uygulanamaz durumu gösterir.
  function cueSignature(cues) {
    const list = Array.isArray(cues) ? cues : [];
    if (!list.length) return '#0#0#0';
    // Two independent 32-bit rolling hashes include every cue's full content.
    let a=2166136261, b=5381;
    for (const c of list) for (const ch of JSON.stringify([c?.start,c?.end,String(c?.text || '')])) {
      const n=ch.codePointAt(0); a=Math.imul(a^n,16777619); b=Math.imul(b,33)^n;
    }
    return `v2:${list.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
  }

  return { KINDS, scan, cpsOf, cpsTier, cueSignature };
}));
