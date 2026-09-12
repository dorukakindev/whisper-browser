const DEFAULT_AUTOMATION_LIMITS = Object.freeze({
  maxSourceCharacters: 200000,
  maxSessionJobs: 10,
  maxLiveCharacters: 300000,
});

function clean(value, max = 240) { return String(value == null ? '' : value).trim().slice(0, max); }

function stableOperationHash(value) {
  let left = 2166136261, right = 2246822519;
  for (const char of String(value || '')) {
    const code = char.codePointAt(0);
    left = Math.imul(left ^ code, 16777619) >>> 0;
    right = Math.imul(right ^ code, 3266489917) >>> 0;
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
}

function browserAutomationOperationKey(input = {}) {
  const stable = [
    clean(input.ruleId || 'site-subtitle'), clean(input.ruleRevision || '1'),
    clean(input.mediaId), clean(input.sourceLineage || input.sourceFingerprint),
    clean(input.targetLanguage).toLowerCase(), clean(input.translationProfile || input.promptVersion),
  ].join('\n');
  return stableOperationHash(stable);
}

function browserAutomationDecision(input = {}) {
  const mode = ['off', 'ask', 'auto'].includes(input.mode) ? input.mode : 'off';
  if (mode === 'off') return decision('unsupported', 'automation_off', 'Bu site için otomatik altyazı çevirisi kapalı.');
  if (!input.tabCurrent) return decision('unsupported', 'stale_tab', 'Sekme değiştiği için otomatik işlem başlatılmadı.');
  if (!clean(input.mediaId)) return decision('awaiting_identity', 'identity_missing', 'Video kimliği henüz doğrulanamadı.');
  if (input.advertisementUncertain) return decision('unsupported', 'advertisement_uncertain', 'Reklam ile ana içerik ayırt edilemediği için otomatik işlem başlatılmadı.');
  if (!input.sourceReady) return decision('awaiting_source', 'source_missing', 'Kaynak altyazı bekleniyor.');
  if (input.completed) return decision('already_completed', 'translation_found', 'Bu içerik için uyumlu çeviri zaten hazır.');
  if (input.running) return decision('already_running', 'job_running', 'Bu altyazının çevirisi zaten sürüyor.');
  if (input.canceled || input.declined) return decision('unsupported', input.canceled ? 'canceled' : 'declined',
    'Bu içerikte otomatik işlem daha önce durduruldu. Yeniden başlatmak için açık eylemi kullanın.');
  const limits = { ...DEFAULT_AUTOMATION_LIMITS, ...(input.limits || {}) };
  const sourceCharacters = Math.max(0, Number(input.sourceCharacters) || 0);
  const parsedNewCharacters = Number(input.newCharacters);
  const newCharacters = Math.max(0, Number.isFinite(parsedNewCharacters) ? parsedNewCharacters : sourceCharacters);
  const parsedLiveCharacters = Number(input.liveCharacters);
  const liveCharacters = Math.max(0, Number.isFinite(parsedLiveCharacters) ? parsedLiveCharacters : 0);
  if (sourceCharacters > limits.maxSourceCharacters) return decision('blocked_by_limit', 'limit_reached',
    `Kaynak altyazı sınırı aşıldı (${sourceCharacters}/${limits.maxSourceCharacters} karakter). Kullanıcı onayı gerekiyor.`);
  if (Number(input.sessionJobs) >= limits.maxSessionJobs) return decision('blocked_by_limit', 'limit_reached',
    `Oturum otomasyon sınırına ulaşıldı (${Number(input.sessionJobs) || 0}/${limits.maxSessionJobs} iş). Kullanıcı onayı gerekiyor.`);
  if (liveCharacters + newCharacters > limits.maxLiveCharacters) return decision('blocked_by_limit', 'limit_reached',
    `Canlı çeviri sınırı aşıldı (${liveCharacters + newCharacters}/${limits.maxLiveCharacters} karakter). Kullanıcı onayı gerekiyor.`);
  return mode === 'ask'
    ? decision('requires_confirmation', 'confirmation_required', 'Altyazı bulundu. Çeviri başlatılsın mı?')
    : decision('eligible', 'eligible', 'Altyazı bulundu; bu site kuralına göre çeviri başlatılabilir.');
}

function decision(state, reason, message) { return { state, reason, message }; }

function createBrowserAutomationGate(historyLimit = 1000) {
  const started = new Set();
  const stopped = new Set();
  const completed = new Set();
  const limit = Math.max(1, Math.min(10000, Math.trunc(Number(historyLimit) || 1000)));
  const remember = (collection, value) => {
    if (!value) return;
    collection.delete(value);
    collection.add(value);
    while (collection.size > limit) collection.delete(collection.keys().next().value);
  };
  return {
    claim(key) {
      const cleanKey = clean(key, 128);
      if (!cleanKey || started.has(cleanKey) || stopped.has(cleanKey) || completed.has(cleanKey)) return false;
      started.add(cleanKey); return true;
    },
    finish(key) { started.delete(clean(key, 128)); },
    complete(key) { const value = clean(key, 128); started.delete(value); remember(completed, value); },
    cancel(key) { const value = clean(key, 128); started.delete(value); remember(stopped, value); },
    allowAgain(key) { const value = clean(key, 128); stopped.delete(value); completed.delete(value); },
    state(key) { const value = clean(key, 128); return { running: started.has(value), canceled: stopped.has(value), completed: completed.has(value) }; },
  };
}

const browserAutomationRulesApi = {
  DEFAULT_AUTOMATION_LIMITS,
  browserAutomationDecision,
  browserAutomationOperationKey,
  createBrowserAutomationGate,
};
if (typeof module !== 'undefined' && module.exports) module.exports = browserAutomationRulesApi;
if (typeof window !== 'undefined') window.BrowserAutomationRules = browserAutomationRulesApi;
