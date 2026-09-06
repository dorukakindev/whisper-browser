function clean(value, max = 240) { return String(value == null ? '' : value).trim().slice(0, max); }

function browserTabProtectionReasons(tab = {}, { activeTabId = '' } = {}) {
  const reasons = [];
  if (tab.id && tab.id === activeTabId) reasons.push('active');
  if (tab.pinned) reasons.push('pinned');
  if (tab.keepAwake) reasons.push('keep_awake');
  if (tab.audible || tab.mediaPlaying) reasons.push('media_playing');
  if (tab.fullscreen || tab.pictureInPicture) reasons.push('fullscreen_or_pip');
  if (tab.loading || tab.restoringPage) reasons.push('navigation');
  if (tab.mangaJob || tab.pageTranslateJob || tab.translationScheduler || tab.downloadActive) reasons.push('active_job');
  if (tab.dirtyDraft) reasons.push('unsaved_draft');
  if (tab.formOrLogin) reasons.push('form_or_login');
  if (tab.stateKnown === false) reasons.push('unknown_state');
  return [...new Set(reasons)];
}

function browserTabUnloadDecision(tab, context = {}) {
  if (!tab || !tab.id) return { allowed: false, reason: 'missing', message: 'Sekme bulunamadı.' };
  if (tab.lifecycle === 'unloaded') return { allowed: false, reason: 'already_unloaded', message: 'Sekme zaten bellekten boşaltılmış.' };
  const reasons = browserTabProtectionReasons(tab, context);
  if (reasons.length) return { allowed: false, reason: reasons[0], reasons,
    message: browserProtectionMessage(reasons[0]) };
  return { allowed: true, reason: '', reasons: [], message: 'Sekme güvenli biçimde bellekten boşaltılabilir.' };
}

function browserProtectionMessage(reason) {
  return ({
    active: 'Etkin sekme bellekten boşaltılamaz.', pinned: 'Sabitlenmiş sekme korunuyor.',
    keep_awake: 'Kullanıcı bu sekmeyi uyanık tutuyor.', media_playing: 'Sekmede ses veya video oynuyor.',
    fullscreen_or_pip: 'Tam ekran veya resim içinde resim açık.', navigation: 'Sayfa yükleniyor veya geri getiriliyor.',
    active_job: 'Sekmede devam eden bir altyazı, manga, sayfa veya indirme işi var.',
    unsaved_draft: 'Sekmede kaydedilmemiş bir düzenleme var.',
    form_or_login: 'Sekmede doldurulmuş form veya giriş alanı bulundu.',
    unknown_state: 'Sekmenin güvenli durumu doğrulanamadı.',
  })[reason] || 'Sekmenin güvenli durumu doğrulanamadı.';
}

function groupBrowserProcessMetrics(tabs = [], appMetrics = []) {
  const metricByPid = new Map((Array.isArray(appMetrics) ? appMetrics : []).map((metric) => [Number(metric?.pid), metric]));
  const processTabs = new Map();
  for (const tab of tabs || []) {
    const pid = Number(tab?.processId) || 0;
    if (!pid) continue;
    if (!processTabs.has(pid)) processTabs.set(pid, []);
    processTabs.get(pid).push(clean(tab.id, 128));
  }
  return (tabs || []).map((tab) => {
    const pid = Number(tab?.processId) || 0;
    const metric = metricByPid.get(pid);
    const sharedTabs = pid ? processTabs.get(pid) || [] : [];
    const workingSetSize = Number(metric?.memory?.workingSetSize);
    return {
      ...tab,
      processId: pid,
      processShared: sharedTabs.length > 1,
      sharedTabIds: sharedTabs,
      memoryKiB: Number.isFinite(workingSetSize) ? Math.max(0, workingSetSize) : null,
      cpuPercent: Number.isFinite(Number(metric?.cpu?.percentCPUUsage)) ? Number(metric.cpu.percentCPUUsage) : null,
    };
  });
}

module.exports = {
  browserProtectionMessage,
  browserTabProtectionReasons,
  browserTabUnloadDecision,
  groupBrowserProcessMetrics,
};
