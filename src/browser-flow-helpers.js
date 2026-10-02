// Madde 26-30 — browser kullanıcı akışı yardımcıları (saf fonksiyonlar).
// Kuyruk-50 maddeleri: site desteği açıklaması, yakalama inceleme, seçili
// videolar işlem listesi, çalışma alanı eksik-kaynak raporu, profil sınırları.

'use strict';

// Madde 26 — 'missing' durumunda adapter + aşama sonucu açıklaması.
// input: { adapter: {id,label,help}, acquisition: {stages}, en }
// stages: [{stage:'textTrack'|'manifest'|'cdp'|'page'|..., status:'Bulundu'|'Bulunamadı'|'Atlandı'|'Sırada'|'Aranıyor'|'Onay gerekiyor'}]
// Döndürür: { detail: '...', showInfo: true|false }
function browserMissingDetail(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const adapter = source.adapter && typeof source.adapter === 'object' ? source.adapter : null;
  const label = String(adapter?.label || '').slice(0, 80);
  const help = String(adapter?.help || '').slice(0, 240);
  const parts = [];
  if (label && label !== 'Genel web videosu') {
    parts.push(source.en ? `Site profile: ${label}.` : `Site profili: ${label}.`);
  }
  const stages = Array.isArray(source.acquisition?.stages) ? source.acquisition.stages : [];
  const failed = stages.filter((stage) => ['Bulunamadı', 'Atlandı'].includes(String(stage?.status || '')));
  if (failed.length) {
    const names = failed.map((stage) => String(stage?.label || stage?.stage || '').slice(0, 40)).filter(Boolean).slice(0, 4);
    if (names.length) {
      parts.push(source.en
        ? `Checked and not found: ${names.join(', ')}.`
        : `Denenip bulunamadı: ${names.join(', ')}.`);
    }
  }
  if (help) parts.push(help);
  return {
    detail: parts.filter(Boolean).join(' '),
    // Tanı bağlantısı: sayfası-yakalama teşhis paneli kullanıcıya hangi aşamanın
    // neden boş döndüğünü ve alternatifi gösterir.
    showInfo: !!(label || failed.length),
  };
}

// Madde 27 — iz inceleme satırı: dil, biçim/kaynak, satır sayısı, zaman
// dönüşümü ve senkron bilgisi tek satırda özetlenir.
function browserTrackReviewMeta(track = {}, en = false) {
  if (!track || typeof track !== 'object' || !Object.keys(track).length) return '';
  const parts = [];
  const role = track.role === 'translation' ? (en ? 'Translation' : 'Çeviri')
    : (en ? 'Source' : 'Kaynak');
  parts.push(role);
  if (track.language) parts.push(String(track.language).toUpperCase());
  const variant = track.role === 'translation'
    ? [track.provider, track.model].filter(Boolean).join(' / ')
    : (track.format || track.source || '');
  if (variant) parts.push(String(variant).slice(0, 60));
  const cueCount = Math.max(0, Number(track.cueCount) || 0);
  parts.push(en ? `${cueCount} cues` : `${cueCount} satır`);
  const transform = track.timeTransform && typeof track.timeTransform === 'object' ? track.timeTransform : null;
  if (transform) {
    const offset = Number(transform.offsetSeconds) || 0;
    const matches = Math.max(0, Math.trunc(Number(transform.matches) || 0));
    const confidence = String(transform.confidence || '').slice(0, 20);
    const offsetText = `${offset >= 0 ? '+' : ''}${offset.toFixed(2)}s`;
    parts.push(en
      ? `time shift ${offsetText} (${matches} matches${confidence ? `, ${confidence}` : ''})`
      : `zaman dönüşümü ${offsetText} (${matches} eşleşme${confidence ? `, ${confidence}` : ''})`);
  }
  if (track.captureComplete === false && Math.max(0, Number(track.captureTotal) || 0) > cueCount) {
    parts.push(en
      ? `capture in progress ${cueCount}/${Math.trunc(Number(track.captureTotal))}`
      : `yakalama sürüyor ${cueCount}/${Math.trunc(Number(track.captureTotal))}`);
  }
  if (track.sourceMismatch) {
    parts.push(en ? 'belongs to a different source track' : 'farklı bir kaynak ize ait');
  }
  return parts.join(' · ');
}

// Madde 28 — kütüphane satırı kuyruğa eklenebilir mi; eklenecek girdi nedir?
// 'browser' türü sayfa URL'si transkripsiyon girdisi değildir → null döner.
function watchItemQueueTarget(item = {}) {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'youtube') {
    const input = String(item.sourceRef || '').trim();
    return input ? { type: 'youtube', input } : null;
  }
  if (item.type === 'local') {
    const input = String(item.localPath || item.sourceRef || '').trim();
    return input ? { type: 'file', input } : null;
  }
  return null;
}

// Madde 29 — çalışma alanı açılışında eksik kaynaklar: iz varlığı (asset
// deposunda yoksa) ve kurtarma çıktısı (diskte yoksa) sekme bazında raporlanır.
// deps: { getTrack(assetId)->track|null, exists(path)->bool }
function workspaceMissingResources(tabs, deps = {}) {
  const getTrack = typeof deps.getTrack === 'function' ? deps.getTrack : () => null;
  const exists = typeof deps.exists === 'function' ? deps.exists : () => true;
  const missing = [];
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    const tabTitle = String(tab?.title || tab?.url || '').slice(0, 120);
    for (const ref of Array.isArray(tab?.trackRefs) ? tab.trackRefs : []) {
      const assetId = String(ref?.assetId || '');
      if (!assetId) continue;
      if (!getTrack(assetId)) {
        missing.push({ kind: 'track', tab: tabTitle,
          detail: String(ref.label || ref.language || ref.id || assetId).slice(0, 120) });
      }
    }
    for (const job of Array.isArray(tab?.recoveryJobs) ? tab.recoveryJobs : []) {
      const outputPath = String(job?.outputPath || '');
      if (!outputPath) continue;
      if (!exists(outputPath)) {
        missing.push({ kind: 'recovery-output', tab: tabTitle,
          detail: outputPath.slice(0, 200) });
      }
    }
    if (missing.length >= 20) return missing.slice(0, 20);
  }
  return missing;
}

// Madde 30 — etkin profil kapsamı etiketi. effective.sources alanı her kontrol
// için 'general'|'site'|'path'|'tab' kaynağını verir; en özel etkin kapsam
// gösterilir. Hiçbiri yoksa 'general'.
function browserProfileActiveScope(effective = {}) {
  const sources = effective.sources && typeof effective.sources === 'object' ? effective.sources : {};
  const used = Object.values(sources);
  if (used.includes('tab')) return 'tab';
  if (used.includes('path')) return 'path';
  if (used.includes('site')) return 'site';
  return 'general';
}

// Madde 30 — kapsam çipi metni ve sıfırlama önizlemesi.
// Döndürür: { scope, label, overrideCount, description }
function browserProfileBoundaryCopy(effective = {}, scope = 'general', en = false) {
  const sources = effective.sources && typeof effective.sources === 'object' ? effective.sources : {};
  const titles = effective.fieldTitles && typeof effective.fieldTitles === 'object' ? effective.fieldTitles : {};
  const overrides = Object.keys(sources).filter((field) => sources[field] === scope);
  const names = overrides.slice(0, 6).map((field) => titles[field] || field);
  const scopeLabel = {
    general: en ? 'Default' : 'Genel',
    site: en ? 'Site profile' : 'Site profili',
    path: en ? 'Path profile' : 'Yol profili',
    tab: en ? 'Tab profile' : 'Sekme profili',
  }[scope] || scope;
  const origin = String(effective.origin || '').slice(0, 80);
  const list = names.join(', ') + (overrides.length > names.length ? ` +${overrides.length - names.length}` : '');
  const description = scope === 'general' ? ''
    : overrides.length
      ? (en
        ? `${overrides.length} ${scope === 'tab' ? 'tab' : scope === 'path' ? 'path' : 'site'} override${overrides.length > 1 ? 's' : ''} will be reset${list ? ` (${list})` : ''}. Browser cookies, logins and the page session are not affected.`
        : `${overrides.length} ${scope === 'tab' ? 'sekme' : scope === 'path' ? 'yol' : 'site'} özelleştirmesi sıfırlanacak${list ? ` (${list})` : ''}. Tarayıcı çerezleri, oturumlar ve sayfa oturumu etkilenmez.`)
      : (en ? 'No overrides exist at this scope.' : 'Bu kapsamda özelleştirme yok.');
  return { scope, scopeLabel, origin, overrideCount: overrides.length, description };
}

const browserFlowHelpersApi = {
  browserMissingDetail,
  browserTrackReviewMeta,
  watchItemQueueTarget,
  workspaceMissingResources,
  browserProfileActiveScope,
  browserProfileBoundaryCopy,
};
if (typeof module !== 'undefined' && module.exports) module.exports = browserFlowHelpersApi;
if (typeof window !== 'undefined') window.BrowserFlowHelpers = browserFlowHelpersApi;
