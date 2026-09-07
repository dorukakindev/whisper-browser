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

function updateBrowserPlaybackState(tab, playing) {
  if (!tab || typeof tab !== 'object') return false;
  tab.mediaPlaying = playing === true;
  return tab.mediaPlaying;
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

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
}

function normalizeBrowserPageResourceMetrics(value = {}) {
  const measured = value && value.measured !== false;
  return {
    measured,
    activeTimers: measured ? (finiteCount(value.activeTimers) ?? 0) : null,
    observerCount: measured ? (finiteCount(value.observerCount) ?? 0) : null,
    mutationObservers: measured ? (finiteCount(value.mutationObservers) ?? 0) : null,
    resizeObservers: measured ? (finiteCount(value.resizeObservers) ?? 0) : null,
    mediaListeners: measured ? (finiteCount(value.mediaListeners) ?? 0) : null,
    overlayNodes: measured ? (finiteCount(value.overlayNodes) ?? 0) : null,
    pendingFrames: measured ? (finiteCount(value.pendingFrames) ?? 0) : null,
    ipcPerMinute: finiteCount(value.ipcPerMinute),
  };
}

function summarizeBrowserResourceBudgets(tabs = [], globals = {}) {
  const rows = Array.isArray(tabs) ? tabs : [];
  const sum = (key) => rows.reduce((total, tab) => {
    const value = finiteCount(tab?.resources?.[key]);
    return total + (value == null ? 0 : value);
  }, 0);
  return {
    activeTimers: (finiteCount(globals.activeTimers) ?? 0) + sum('activeTimers'),
    observerCount: sum('observerCount'),
    overlayNodes: sum('overlayNodes'),
    ipcPerMinute: sum('ipcPerMinute'),
    networkSubscriptions: finiteCount(globals.networkSubscriptions) ?? 0,
    pendingResponses: finiteCount(globals.pendingResponses) ?? 0,
    bufferedCues: finiteCount(globals.bufferedCues) ?? 0,
    networkCaptureActive: !!globals.networkCaptureActive,
  };
}

module.exports = {
  browserProtectionMessage,
  browserTabProtectionReasons,
  browserTabUnloadDecision,
  groupBrowserProcessMetrics,
  normalizeBrowserPageResourceMetrics,
  summarizeBrowserResourceBudgets,
  updateBrowserPlaybackState,
};
