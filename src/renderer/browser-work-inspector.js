(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BrowserWorkInspector = factory();
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  const count = value => Math.max(0, Math.trunc(Number(value) || 0));
  const busyCapture = value => ['running', 'refreshing', 'retry-wait'].includes(value);
  function ranges(input) {
    return (Array.isArray(input) ? input : []).slice(0, 100).filter(row =>
      Number.isFinite(row?.start) && Number.isFinite(row?.end) && row.start >= 0 && row.end > row.start)
      .map(row => ({ start: row.start, end: row.end }));
  }
  function capture(input = {}) {
    return {
      reviewId: typeof input.reviewId === 'string' ? input.reviewId.slice(0, 128) : '',
      canRetryMissing: input.canRetryMissing === true,
      missingRanges: ranges(input.missingRanges), unavailableRanges: ranges(input.unavailableRanges),
      missingRangeCount: count(input.missingRangeCount),
    };
  }
  function origin(track, en = false) {
    const t = (tr, eng) => en ? eng : tr;
    if (!track) return t('Seçilmedi', 'Not selected');
    // A language or a translation role alone cannot prove which layer produced it.
    const type = track.translatedByService ? t('Servis çevirisi', 'Service translation')
      : ['translation', 'app-translation'].includes(track.source) || track.format === 'translation' && !!track.sourceHash ? t('Uygulama çevirisi', 'Application translation')
        : ['live-asr', 'asr', 'whisper'].includes(track.source) ? t('ASR', 'ASR')
          : ['file', 'manual', 'local'].includes(track.source) ? t('Manuel dosya', 'Manual file')
            : track.automatic ? t('Servis otomatik altyazısı', 'Service automatic captions')
              : ['network', 'manifest', 'text-track'].includes(track.source) || track.captureKind === 'embedded-cea'
                ? t('Yayıncı metni', 'Publisher captions') : t('Köken doğrulanmadı', 'Origin unverified');
    return [type, String(track.language || '').toUpperCase(), track.sourceMismatch
      ? t('kaynak değişmiş', 'source changed') : track.updatedAt
        ? t('kayıt/okuma zamanı: ', 'record/read time: ') + (Number.isFinite(Number(track.updatedAt))
          ? new Date(Number(track.updatedAt)).toLocaleString(en ? 'en-US' : 'tr-TR') : String(track.updatedAt).slice(0, 40))
          + t(' · yayıncı güncelliği doğrulanmadı', ' · publisher freshness unverified')
        : t('güncellik bilinmiyor', 'freshness unknown')].filter(Boolean).join(' · ');
  }
  function channel(tab, secondary, tracks, live, generation) {
    const slot = secondary ? 'secondary' : 'primary', selection = tab.subtitleSelection || {};
    const id = selection[slot + 'Id'], file = selection[slot + 'File'];
    if (!id && !file) return { state: 'none', path: '', id: '' };
    const track = id ? tracks.find(row => row.id === id) : null;
    const path = track?.path || file || '';
    const receipt = tab.subtitleRestoreResults?.[slot];
    if (tab.missingSubtitleFiles?.includes(slot + 'File')) return { state: 'missing', path, id };
    if (receipt?.generation === generation && receipt.path === path && receipt.state === 'failed') return { state: 'failed', path, id };
    if (id && !track) return { state: 'waiting', path, id };
    if (track?.sourceMismatch) return { state: 'changed', path, id };
    const loadedPath = secondary ? live.sub2Path : live.subPath;
    const cues = secondary ? live.cues2 : live.cues;
    if (path && loadedPath === path && cues?.length) return { state: 'loaded', path, id };
    return { state: tab.subtitleSelectionLoading ? 'loading' : 'verify', path, id };
  }
  function clock(tab, mediaKey, generation, now) {
    const sample = tab.browserClockSample;
    if (!sample || !Number.isFinite(sample.at)) return { state: 'unknown', age: null };
    const age = Math.max(0, (now - sample.at) / 1000);
    const matches = !!mediaKey && sample.mediaKey === mediaKey && sample.generation === generation && !!sample.mediaToken;
    const state = !matches ? 'changed' : age > 3 ? 'stale' : tab.browserAdPlaying ? 'ad'
      : sample.live ? 'live' : sample.seeking ? 'seeking' : sample.waiting ? 'waiting' : 'verified';
    // The opaque token is compared, never exposed as a URL, key or credential.
    let hash = 2166136261;
    for (const char of String(sample.mediaToken || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return { state, age, time: Number.isFinite(sample.time) ? sample.time : null, type: sample.mediaType || '',
      stream: sample.mediaToken ? (hash >>> 0).toString(16).padStart(8, '0') : '' };
  }
  function summary(tab, { active = false, live = tab, job = null, approvals = null } = {}) {
    const c = active ? live.browserCeaCapture : tab.browserCeaCapture;
    const translating = !!live.browserTranslatePreparing || !!live.browserTranslationTrackId && tab.browserTranslationComplete === false;
    const jobOwned = !!job && job.browserTabId === tab.id && job.generation === (active ? live.generation : tab.workspaceGeneration)
      && (!job.mediaKey || job.mediaKey === live.mediaKey);
    return {
      capture: c?.state || 'unknown', capturing: busyCapture(c?.state), translating,
      failed: count(live.browserTranslationFailed), job: jobOwned ? job.kind : '',
      confirmation: tab.browserAutomationDecision?.state === 'requires_confirmation',
      approvals,
      error: String(live.browserTranslationLastError || tab.browserPageError || tab.browserMangaError
        || tab.diagnostics?.activity?.lastError?.message || '').slice(0, 400),
    };
  }
  return Object.freeze({ ranges, capture, origin, channel, clock, summary, busyCapture });
});
