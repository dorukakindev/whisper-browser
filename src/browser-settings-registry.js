const CATEGORY_LABELS = Object.freeze({
  site: 'Site ve altyazı',
  translation: 'Çeviri ve manga',
  privacy: 'Gizlilik',
  session: 'Oturum',
  system: 'Sistem',
});

const entries = Object.freeze([
  {
    id: 'browserProfileScope',
    label: 'Ayar kapsamı',
    description: 'Değişiklikleri genel, siteye özel veya yalnız bu sekme için uygula.',
    category: 'site',
    keywords: ['profil', 'genel', 'site', 'sekme', 'kapsam'],
    scope: 'global',
  },
  {
    id: 'profile-targetLanguage',
    label: 'Altyazı hedef dili',
    description: 'Tarayıcı altyazılarının çevrileceği dili seç.',
    category: 'site',
    keywords: ['altyazı', 'çeviri', 'hedef', 'dil'],
    scope: 'site-profile',
  },
  {
    id: 'browserSubtitleAutomation',
    label: 'Altyazı otomasyonu',
    description: 'Bulunan altyazının sorularak veya otomatik çevrilmesini belirle.',
    category: 'site',
    keywords: ['altyazı', 'otomatik', 'sor', 'çevir'],
    scope: 'site-profile',
  },
  {
    id: 'browserPreferredSubtitleMode',
    label: 'Çeviri sonrası görünüm',
    description: 'Çeviri tamamlandığında kaynak ve çeviri satırlarının görünümünü seç.',
    category: 'site',
    keywords: ['altyazı', 'kaynak', 'çeviri', 'ikisi', 'görünüm'],
    scope: 'site-profile',
  },
  {
    id: 'browserSiteCompatibility',
    label: 'Site uyumluluk modu',
    description: 'Güvenlik doğrulaması sorunlarında bu alan adındaki sayfa enjeksiyonlarını kapat.',
    category: 'site',
    keywords: ['cloudflare', 'uyumluluk', 'güvenlik', 'enjeksiyon'],
    scope: 'site',
  },
  {
    id: 'browserPageTarget',
    label: 'Sayfa çeviri hedefi',
    description: 'Web sayfası metninin çevrileceği dili seç.',
    category: 'translation',
    keywords: ['sayfa', 'çeviri', 'hedef', 'dil'],
    scope: 'site-profile',
  },
  {
    id: 'browserPageMode',
    label: 'Sayfa çeviri görünümü',
    description: 'Kaynak metni çeviriyle birlikte göster veya çeviriyle değiştir.',
    category: 'translation',
    keywords: ['sayfa', 'iki dilli', 'kaynak', 'değiştir', 'görünüm'],
    scope: 'site-profile',
  },
  {
    id: 'browserPageAuto',
    label: 'Otomatik sayfa çevirisi',
    description: 'Geçerli sitedeki sayfaları açıldığında otomatik çevir.',
    category: 'translation',
    keywords: ['sayfa', 'otomatik', 'site', 'çeviri'],
    scope: 'site',
  },
  {
    id: 'browserMangaTarget',
    label: 'Manga hedef dili',
    description: 'Manga balonlarının çevrileceği dili seç.',
    category: 'translation',
    keywords: ['manga', 'balon', 'çeviri', 'hedef', 'dil'],
    scope: 'site-profile',
  },
  {
    id: 'browserMangaFont',
    label: 'Manga yazı tipi',
    description: 'Çevrilmiş manga balonlarında kullanılacak yazı tipini seç.',
    category: 'translation',
    keywords: ['manga', 'font', 'yazı', 'çizgi roman'],
    scope: 'global',
  },
  {
    id: 'browserMangaWorkers',
    label: 'Manga paralel istek sayısı',
    description: 'Aynı anda çevrilecek manga görseli sayısını ayarla.',
    category: 'translation',
    keywords: ['manga', 'paralel', 'işçi', 'hız', 'istek'],
    scope: 'global',
  },
  {
    id: 'browserMangaMaxImages',
    label: 'Azami manga görseli',
    description: 'Tek işte işlenecek en yüksek manga görseli sayısını sınırla.',
    category: 'translation',
    keywords: ['manga', 'görsel', 'sınır', 'azami'],
    scope: 'global',
  },
  {
    id: 'browserMangaFontScale',
    label: 'Manga yazı ölçeği',
    description: 'Çevrilmiş balon metninin boyutunu ayarla.',
    category: 'translation',
    keywords: ['manga', 'balon', 'yazı', 'boyut', 'ölçek'],
    scope: 'site-profile',
  },
  {
    id: 'browserMangaAuto',
    label: 'Otomatik manga çevirisi',
    description: 'Okuma sayfası algılandığında manga görsellerini otomatik çevir.',
    category: 'translation',
    keywords: ['manga', 'okuma', 'otomatik', 'çeviri'],
    scope: 'global',
  },
  {
    id: 'browserMangaVertical',
    label: 'Dikey manga metni',
    description: 'Dikey yazılmış manga metinlerini bu yönde işle.',
    category: 'translation',
    keywords: ['manga', 'dikey', 'metin', 'japonca'],
    scope: 'global',
  },
  {
    id: 'browserMangaSfx',
    label: 'Manga SFX stili',
    description: 'Ses efekti metinlerini diyaloglardan ayrı biçimlendir.',
    category: 'translation',
    keywords: ['manga', 'sfx', 'ses efekti', 'stil'],
    scope: 'global',
  },
  {
    id: 'browserAdblockEnabled',
    label: 'Tarayıcı reklam koruması',
    description: 'Web reklam isteklerini Ghostery filtreleriyle engelle.',
    category: 'privacy',
    keywords: ['reklam', 'engelleme', 'ghostery', 'youtube', 'gizlilik'],
    scope: 'global',
  },
  {
    id: 'browserAutoSkipAds',
    label: 'Video reklamlarını otomatik atla',
    description: 'Gömülü YouTube oynatıcısında algılanan video reklamlarını sessize alıp güvenle atla.',
    category: 'privacy',
    keywords: ['reklam', 'video reklamı', 'youtube', 'otomatik', 'atla', 'sessize al'],
    scope: 'global',
  },
  {
    id: 'browserPlayerResponseAdPrune',
    label: 'Reklamları oynatıcı yanıtından temizle (deneysel)',
    description: 'YouTube oynatıcı JSON yanıtındaki reklam alanlarını CDP üzerinden fail-open biçimde temizle.',
    category: 'privacy',
    keywords: ['reklam', 'youtube', 'oynatıcı', 'yanıt', 'json', 'cdp', 'deneysel', 'temizle'],
    scope: 'global',
  },
  {
    id: 'browserSponsorMode',
    label: 'SponsorBlock atlama modu',
    description: 'YouTube sponsor bölümlerini göster, sorarak atla veya otomatik atla.',
    category: 'privacy',
    keywords: ['sponsor', 'sponsorblock', 'atla', 'youtube'],
    scope: 'global',
  },
  {
    id: 'browserSponsorCategories',
    label: 'SponsorBlock kategorileri',
    description: 'Atlanacak sponsor, tanıtım, giriş ve diğer bölüm türlerini seç.',
    category: 'privacy',
    keywords: ['sponsor', 'kategori', 'tanıtım', 'giriş', 'kapanış'],
    scope: 'global',
  },
  {
    id: 'browserSessionExport',
    label: 'Oturumu dışa aktar',
    description: 'Sekmeleri, site görünümünü ve altyazı varyantlarını güvenli pakete yaz.',
    category: 'session',
    keywords: ['oturum', 'yedek', 'dışa aktar', 'kurtarma'],
    scope: 'session',
  },
  {
    id: 'browserSessionImport',
    label: 'Oturumu içe aktar',
    description: 'Daha önce dışa aktarılmış güvenli tarayıcı paketini geri yükle.',
    category: 'session',
    keywords: ['oturum', 'yedek', 'içe aktar', 'geri yükle'],
    scope: 'session',
  },
  {
    id: 'browserHardwareAcceleration',
    label: 'Donanım hızlandırma',
    description: 'Tarayıcı ve uygulama arayüzünde GPU hızlandırmasını aç veya kapat.',
    category: 'system',
    keywords: ['donanım', 'gpu', 'ekran kartı', 'performans', 'hızlandırma'],
    scope: 'system',
  },
]);

function normalizeSearchText(value) {
  return String(value == null ? '' : value).toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
}

function list() {
  return entries.slice();
}

function categories() {
  const used = new Set(entries.map((entry) => entry.category));
  return Object.entries(CATEGORY_LABELS)
    .filter(([id]) => used.has(id))
    .map(([id, label]) => ({ id, label }));
}

function search(query) {
  const needle = normalizeSearchText(query);
  if (!needle) return list();
  return entries.filter((entry) => normalizeSearchText([
    entry.label,
    entry.description,
    entry.category,
    ...entry.keywords,
  ].join(' ')).includes(needle));
}

function browserSettingScopeStatus(scope, context = {}) {
  if (scope !== 'site-profile') return '';
  const selectedScope = ['general', 'site', 'tab'].includes(context.selectedScope)
    ? context.selectedScope : 'general';
  const origin = String(context.origin || '').trim();
  const value = context.value === undefined || context.value === null || context.value === ''
    ? '' : `: ${context.value}`;
  if (selectedScope === 'general') return `Genel değer${value}`;
  if (!origin) return 'Önce bir site açın';
  if (context.hasOverride) {
    return `${selectedScope === 'tab' ? 'Bu sekme' : 'Bu site'} için özel${value}`;
  }
  return `Varsayılanı izliyor${value}`;
}

const browserSettingsRegistryApi = Object.freeze({
  entries,
  list,
  categories,
  search,
  normalizeSearchText,
  browserSettingScopeStatus,
});

if (typeof window !== 'undefined') window.BrowserSettingsRegistry = browserSettingsRegistryApi;
if (typeof module !== 'undefined') module.exports = browserSettingsRegistryApi;
