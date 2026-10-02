# BROWSER_BUG_REPORT_389 — 50'lik kuyruk batch 6: browser akışları (maddeler 26–30)

Tarih: 2026-10-02 · Dal: `devin/1790920201-b6-browser-flows` · Başlangıç: `fcba638` · Bitiş kod: `eb6dbf2`

## Madde sonuçları

### 26 — Site desteği açıklaması (tamamlandı)
`browserSubtitleHealth` 'missing' durumu artık `player.browserDiagnostics` adapter'ını ve
yakalama aşama sonuçlarını açıklar: genel-olmayan adapter adı ("Site profili: YouTube"),
"Denenip bulunamadı:" listesi (Bulunamadı/Atlandı aşamaları, ≤4 ad) ve adapter'ın `help`
metni temel cümleye eklenir. `!capture` (duraklatıldı) dalı da adapter adını parantezle
gösterir. Yeni `info` dönüş alanı → sağlık kutusunda "Ayrıntılar" düğmesi görünür;
tıklayınca mevcut `browser-diagnostics` ayar sayfası açılır (alternatif akış oradadır).
Saf mantık: `browserMissingDetail` (browser-flow-helpers.js).

### 27 — Yakalama inceleme önizlemesi (tamamlandı)
İz listesi araç çubuğuna "İncele" düğmesi (`browserTrackPreviewToggle`, aria-pressed)
ve `<pre id="browserTrackPreview">` önizleme kutusu eklendi. `renderBrowserTrackPreview`
seçili izin rol/dil/varyant/satır sayısını, `timeTransform` (±sn + eşleşme + güven),
yarım-yakalama ilerlemesi ve `sourceMismatch` durumunu `browserTrackReviewMeta` ile
özetler; ardından `api.readSubtitle(track.path)` + `parseSubtitles` ile ilk 5 satırı
`pSecToTime` damgalı gösterir. `player.browserTrackPreviewSeq` üretim-sayısı geç
gelen okuma sonucunun iz değiştikten sonra yazılmasını engeller. Kullanıcı yanlış izi
önden fark edip seçimi değiştirebilir — var olan select akışı zaten seçimi uygular.

### 28 — Seçili videolar için işlem listesi (tamamlandı)
Kütüphane satırlarına koşullu "Kuyruğa ekle" eylemi: `watchItemQueueTarget`
youtube→`sourceRef` (youtube işi), local→`localPath||sourceRef` (file işi),
browser türü/ boş kaynak → düğme gösterilmez. Handler `addToQueue` çağırır; her
videonun durumu ve çıktısı mevcut kuyruk listesinde (ikon/meta/hata/aç-tekrar)
ayrı izlenir. Başarısızlık/başarı `logLine`'a iki dilli yazılır.

### 29 — Çalışma alanı eksik-kaynak raporu (tamamlandı)
`browser:workspace:open` artık `missing[]` döndürür: `workspaceMissingResources`
açılan sekmelerin `trackRefs[].assetId`'lerini `browserAssetStore().getTrack`
ile, `recoveryJobs[].outputPath`'lerini `fs.existsSync` ile yoklar (20 kayıt
sınırı). Renderer sonucu `openAppDialog` ile gösterir: sekme adı + eksik kaynak
(iz etiketi/dili veya yol) — sekme yine açılır, kullanıcı neyin yeniden
üretilmesi gerektiğini bilir.

### 30 — Profil sınırları görünür (tamamlandı)
Araç çubuğuna profil çipi (`browserProfileChip`): `browserProfileActiveScope`
`effectiveBrowserProfile().sources` üzerinden en özel kapsamı seçer
(tab>path>site>general) ve "Sekme profili / Yol profili / Site profili /
Genel profil" etiketini gösterir; tıklayınca site-profil ayarları açılır.
Ayrıca "Sıfırla" öncesi önizleme: `browserProfileBoundaryCopy` kapsamdaki
özelleştirme sayısı+adlarını ve etkilenmeyen sınırı ("Tarayıcı çerezleri,
oturumlar ve sayfa oturumu etkilenmez") onay diyaloğunda listeler; genel
kapsamda diyalog atlanır.

## Bulunan ve düzeltilen kusurlar
- `browserMissingDetail(null)` TypeError — varsayılan parametre yalnız `undefined`'ı
  yakalıyor; nesne kapısı eklendi (test 26.1 kırmızı yakaladı).
- `browserTrackReviewMeta()` girdi yokken sahte "Kaynak · 0 satır" üretiyordu —
  boş-nesne kapısı eklendi.

## Testler
- Yeni `tests/browser-flows-26-30.test.js`: 22/22 PASS (5 madde + kenarlar).
- İlişkili: ui-locale×4 (dedupe/dynamic/userdata/base), browser-subtitle-health×2,
  browser-subtitle-menu, watch-experience-16-20, browser-site-profiles,
  queue-persistence, workspace-restore-regressions, dialog-locale — tamamı yeşil.
- `node --check`: main.js, renderer.js, ui-locale.js, browser-flow-helpers.js ✓
- CI: kapalı (Actions kullanıcı düzeyinde devre dışı — depolama %90 notu korunur).

## Windows etkisi
- UI-değişimi + main IPC dönüş alanı; yeni Win-özgü yol davranışı yok
  (existsSync çağrısı Node tarafında, Win'de aynı sözleşme). Windows'ta
  doğrulanmadı: profil çipi araç çubuğu yerleşimi (dar pencere), önizleme
  `<pre>` taşması, diyalog metin kaydırmaları.
