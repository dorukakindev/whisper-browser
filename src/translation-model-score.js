// Çeviri modeli uyum karnesi: backend her çeviri işinin sonunda
// `translation_quality` olayı basar (toplu istek, geçersiz yanıt, ret nedenleri).
// Model başına son MAX_RUNS iş saklanır; ayarlarda model alanının altında
// "bu model paketlerin %N'ini bozuyor" uyarısı gösterilir. DOM'suz ve saf.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TranslationModelScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_RUNS = 10;
  const MAX_MODELS = 40;
  const REASON_LABELS = {
    kimlik_araligi_disinda: 'blok numaralarını kaydırdı',
    kaynak_yankisi: 'kaynağı çevirmeden geri döndürdü',
    partlar_tam_cumleyi_olusturmuyor: 'cümle parçalarını tutarsız böldü',
    eksik_tam_cumle: 'tam cümleyi eksik bıraktı',
  };

  function modelKey(model) {
    return String(model || '').trim().toLowerCase().slice(0, 120);
  }

  function recordRun(store, event, now = Date.now()) {
    const next = store && typeof store === 'object' && !Array.isArray(store) ? { ...store } : {};
    const key = modelKey(event?.model);
    const batches = Math.max(0, Math.floor(Number(event?.batches) || 0));
    if (!key || !batches) return next;
    const rejections = {};
    for (const [reason, count] of Object.entries(event?.rejections || {})) {
      if (/^[\w:.-]{1,64}$/.test(reason)) rejections[reason] = Math.max(0, Math.floor(Number(count) || 0));
    }
    const run = { at: now, batches, invalid: Math.min(batches, Math.max(0, Math.floor(Number(event?.invalid_batches) || 0))), rejections };
    next[key] = [...(Array.isArray(next[key]) ? next[key] : []), run].slice(-MAX_RUNS);
    if (Object.keys(next).length > MAX_MODELS) {
      const newest = Object.entries(next)
        .sort(([, a], [, b]) => (b[b.length - 1]?.at || 0) - (a[a.length - 1]?.at || 0))
        .slice(0, MAX_MODELS);
      return Object.fromEntries(newest);
    }
    return next;
  }

  function summarize(store, model) {
    const runs = Array.isArray(store?.[modelKey(model)]) ? store[modelKey(model)] : [];
    const batches = runs.reduce((sum, run) => sum + (run.batches || 0), 0);
    const invalid = runs.reduce((sum, run) => sum + (run.invalid || 0), 0);
    const reasons = {};
    for (const run of runs) for (const [reason, count] of Object.entries(run.rejections || {})) reasons[reason] = (reasons[reason] || 0) + count;
    const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const ratio = batches ? invalid / batches : 0;
    const level = !runs.length ? 'unknown' : batches < 3 ? 'few' : ratio >= 0.25 ? 'poor' : ratio >= 0.1 ? 'fair' : 'good';
    return { runs: runs.length, batches, invalid, ratio, topReason, level };
  }

  const REASON_LABELS_EN = {
    kimlik_araligi_disinda: 'shifted block numbers',
    kaynak_yankisi: 'echoed the source untranslated',
    partlar_tam_cumleyi_olusturmuyor: 'split sentence parts inconsistently',
    eksik_tam_cumle: 'left the full sentence missing',
  };

  function describe(store, model, lang = 'tr') {
    const summary = summarize(store, model);
    if (summary.level === 'unknown') return { level: 'unknown', text: '' };
    const en = lang === 'en';
    const percent = Math.round(summary.ratio * 100);
    const base = en
      ? `Invalid batch replies in the last ${summary.runs} jobs: ${percent}% (${summary.invalid}/${summary.batches}).`
      : `Son ${summary.runs} işte geçersiz toplu yanıt oranı %${percent} (${summary.invalid}/${summary.batches}).`;
    if (summary.level === 'few') return { level: 'few', text: `${base} ${en ? 'Not enough data yet.' : 'Karar için henüz az veri var.'}` };
    if (summary.level === 'good') return { level: 'good', text: `${base} ${en ? 'This model follows the format.' : 'Bu model biçime uyuyor.'}` };
    const label = (en ? REASON_LABELS_EN : REASON_LABELS)[summary.topReason];
    const why = label ? (en ? ` Most common issue: ${label}.` : ` En sık sorun: ${label}.`) : '';
    return summary.level === 'poor'
      ? { level: 'poor', text: `${base}${why} ${en ? 'Recovery requests raise the cost; try a more stable model.' : 'Kurtarma istekleri maliyeti artırıyor; daha kararlı bir model deneyin.'}` }
      : { level: 'fair', text: `${base}${why}` };
  }

  return { recordRun, summarize, describe, MAX_RUNS };
});
