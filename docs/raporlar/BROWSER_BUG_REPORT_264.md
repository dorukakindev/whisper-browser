# BROWSER_BUG_REPORT_264 — R315: Ayarlar UI→persist→restart tam tur denetimi

Tarih: 2026-09-30 · Dal: `devin/1790752000-settings-roundtrip` · Kod commit'i: `ebc2a67`

## Kapsam ve yöntem

`index.html`'deki tüm form kontrolleri (217 id) tek tek sınıflandırıldı ve
persist listeleri (`PERSIST_VALUE_CONTROLS` + `PERSIST_CHECKBOX_CONTROLS`,
hem `src/settings-security.js` hem `src/renderer/renderer.js` kopyası)
ile karşılaştırıldı. Kaydetme yolu `scheduleSave → collectUiSettings →
saveAppSettings(appSettingsPayload) → sanitizeUiSettings`; geri yükleme
`applyUiSettings`. `sanitizeUiSettings` listede olmayan `ui` anahtarını
sessizce düşürür — yani listede olmayan kontrol asla kalıcı değildir.

## Doğrulanan bulgular

- **B1 — 12 kontrol hiçbir zaman kalıcı değildi** (kullanıcı değiştirir,
  400 ms debounce ile yazılır ama sanitize'da düşer; restart'ta varsayılana
  döner): `browserSponsorCategories`, `timelineZoom`, `aiTranscriptScope`,
  `browserPageScope`, `browserExportFormat`, `browserExportTiming`,
  `browserPageExportFormat`, `pdfExportFormat`, `pdfTargetLanguage`,
  `subtitleFindCase`, `subtitleFindWhole`.
- **B2 — `select[multiple]` için collect yanlış değer üretiyordu:**
  `el.value` yalnız ilk seçili option'u döner; geri yükleme de tek değer
  atardı. `browserSponsorCategories` persist edilse bile yalnız ilk
  kategori hayatta kalırdı.
- **B3 — `browserPageAutoSites` hidden input'u ölü kod:** hiçbir JS
  referansı yok; gerçek kalıcılık `browserPageAutoHosts` localStorage
  anahtarında. Dokunulmadı (ayrı temizlik konusu).

## Gerçek bug olmayanlar (denetimde temiz çıktı)

- ~160 diğer kontrol ya başka depoda kalıcı (altyazı stili `SUB_STYLE_KEY`,
  oynatıcı tercihleri playerPrefs, sayfa-çevirisi prefs, workspace/places,
  site-uyumluluk IPC, secret/kasa kanalı, youtubeSession, seri-bağlam
  deposu, ayna kontroller) ya kasıtlı geçici (arama kutuları, menü
  `<details>` öğeleri, diyalog alanları, çalışma argümanları). Tam liste
  `tests/settings-ui-persist-roundtrip.test.js` içinde OTHER_STORE /
  TRANSIENT kümelerinde sabitlendi.
- İki persist-liste kopyası denetim anında birebir aynıydı (kayma yok).

## Düzeltmeler

- `src/settings-security.js`: 12 yeni persist id; `UI_MULTI_VALUE_ENUMS`
  (SponsorBlock kategori enum'u); `UI_ENUMS`'e 8 yeni enum; sanitize'a
  çok-seçim dizi dalı — strict modda dizi-olmayan tip ve bilinmeyen üye
  `SettingsValidationError` fırlatır, en çok 16 üye tutulur.
- `src/renderer/renderer.js`: aynı id'ler renderer kopyasına;
  `collectUiSettings` çok-seçimde tüm `selectedOptions`'u toplar;
  `applyUiSettings` çok-seçimde `option.selected` kümesini kurar ve
  `change` tetikler.
- `tests/settings-ui-persist-roundtrip.test.js` (yeni, 5 kontrol):
  iki persist listesinin birebir parite ratchet'i; index.html kontrollerinin
  persist/diğer-depo/geçici sınıflandırma kapsama ratchet'i (sınıflandırılmamış
  yeni kontrol → test düşer); çok-seçim collect→apply tam turu; strict
  sanitize reddi; yeni enum'ların tam-tur kayıpsızlığı.
- `tests/settings-roundtrip.test.js`, `tests/settings-security.test.js`:
  tam-tur değer tabloları yeni id'lerle genişletildi.
- `tests/dom-innerhtml-ratchet.test.js`: izin listesi satır numaraları
  renderer'a eklenen satırlarla kaymıştı — güncellendi.

## Doğrulama

- Yeni ratchet master'da 4/5 FAIL (kırmızı kanıt), dalda 5/5 PASS.
- `settings-security.test.js` 23/23, `settings-roundtrip.test.js` 10/10,
  `settings-ui-persist-roundtrip.test.js` 5/5; tam `npm test` paketinde
  tek düşüş kayan ratchet satırlarıydı, düzeltildi — kalan tüm dosyalar yeşil.
- `node --check src/renderer/renderer.js` + `src/settings-security.js` temiz.

## Windows etkisi ve sınırlar

Salt veri-şekli değişikliği; yol/DPI/özel pencere davranışı yok. Windows'ta
ayrı risk görünmüyor; gerçek UI'da SponsorBlock çok-seçiminin elle turu
doğrulanmadı (başsız kutu) — davranış vm-dilim testiyle kilitlendi.

## Kalan / izleme

- `browserPageAutoSites` ölü hidden input — ayrı temizlik adayı.
- Sınıflandırma kümeleri (OTHER_STORE/TRANSIENT) yeni kontrol
  eklendikçe bilinçli güncellenmeli — ratchet bunu zorunlu kılıyor.
