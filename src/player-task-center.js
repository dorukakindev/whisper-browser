(function initPlayerTaskCenterModel(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlayerTaskCenterModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function progressOf({ completed = 0, total = 0, percent } = {}) {
    const done = Math.max(0, Number(completed) || 0);
    const count = Math.max(0, Number(total) || 0);
    const explicit = Number(percent);
    const value = Number.isFinite(explicit)
      ? clamp(explicit, 0, 100)
      : count > 0 ? clamp(done / count * 100, 0, 100) : null;
    return { completed: done, total: count, percent: value, indeterminate: value === null };
  }

  function browserJobDescriptor(job = {}) {
    const kind = String(job.kind || '');
    const status = String(job.status || job.state || 'waiting');
    const labels = {
      download: 'İndirme',
      manga: 'Manga çevirisi',
      'page-translation': 'Sayfa çevirisi',
      'subtitle-capture': 'Tam altyazı yakalama',
      'subtitle-translation': 'Altyazı çevirisi',
    };
    const stages = {
      running: kind === 'subtitle-capture' ? 'Video parçaları taranıyor' : 'İşleniyor',
      paused: 'Duraklatıldı',
      offline: 'Ağ bağlantısı bekleniyor',
      interrupted: 'Yarım kaldı',
      partial: 'Eksikler tamamlanmayı bekliyor',
      retrying: 'Yeniden deneniyor',
      'retry-wait': 'Yeniden deneme bekleniyor',
      refreshing: 'Kaynak yenileniyor',
      cancelled: 'Durduruldu',
      failed: 'Başarısız',
      completed: 'Tamamlandı',
    };
    const actions = Array.isArray(job.actions) ? job.actions.map(String) : [];
    return {
      id: String(job.id || ''),
      kind,
      label: labels[kind] || 'Arka plan işi',
      stage: String(job.stage || stages[status] || status),
      context: String(job.title || ''),
      status,
      failed: Math.max(0, Number(job.failed) || 0),
      queued: Math.max(0, Number(job.queued) || 0),
      pending: Math.max(0, Number(job.pending) || 0),
      progress: progressOf(job),
      actions,
      recoverable: actions.includes('resume') || actions.includes('restart'),
      dismissable: actions.includes('dismiss'),
      active: ['running', 'paused', 'offline', 'retrying', 'retry-wait', 'refreshing'].includes(status),
    };
  }

  function elapsedLabel(startedAt, now = Date.now()) {
    const seconds = Math.max(0, Math.floor((Number(now) - Number(startedAt)) / 1000));
    if (!Number.isFinite(seconds) || !startedAt) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
      : `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  return { progressOf, browserJobDescriptor, elapsedLabel };
});
