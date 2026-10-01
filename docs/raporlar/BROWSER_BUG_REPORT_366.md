# BROWSER_BUG_REPORT_366 — 100-kuyruk batch 4 (maddeler 31–40): çeviri sözleşmesi/kalite + kalıcılık süpürmesi

Tarih: 2026-10-01 UTC · Dal: devin/1790896901-batch4-translation-persistence · Başlangıç: d734ebd

## Kapsam

Çeviri boru hattı sözleşmesi ve kalite yüzeylerinin derin denetimi + batch-1'de başlayan fsync-envanterinin kalan bakiyesi.

## Doğrulanmış kusurlar (düzeltildi)

### B-366-01 — Dil değişiminde bayat kalan dinamik yüzeyler
`UiLocale.scan()` yalnız sözlükteki statik metin düğümlerini çevirir; `interfaceChoice()`/`describe()` ile üretilen dinamik metinler dil değişiminde eski dilde kalıyordu. `ui-locale-change` dinleyicisi artık sekiz yüzeyi yeniden çizer: `renderTranslationModelScore`, `updateGpuBadge`, `renderIntegrityResults`, `renderRuntimeStatus` (yeni `lastRuntimeStatusEnv` önbelleği — IPC turu gerekmez), `renderBrowserDiagnostics`, `renderBrowserPlaybackDiagnostics`, `renderBrowserPageReport`. Ayrıca `recordTranslationModelScore` `score.describe()`'a geçerli locale'i geçirir (önceden her zaman TR).

### B-366-02 — Çeviri arşivi yazıcıları fsync'siz
`browser-translation-archive.js` `_writeText` (kullanıcının dışa aktardığı SRT/TXT/MD/HTML) ve `_saveIndex` temp+rename kullanıyor ama dosya/dizin fsync töreni yoktu — B-363-01 ile aynı sınıf. İkisi de `atomicWriteFileSync`'e bağlandı (aynı-içerik atlama korundu).

### B-366-03 — Dışa aktarma uyarısı sabit Türkçe
`buildPageTranslationExport` kısmi çeviri bildirimi ("KISMİ ÇEVİRİ: …") `raw.lang`'ı yok sayıyordu; EN arabirimde Türkçe çıkıyordu. Artık `lang==='en'` için "PARTIAL TRANSLATION: …" üretilir; `main.js` sayfa-export anlık görüntüsüne `lang: browserUiLocale()` geçirildi.

### B-366-04 — fsync dizisi kalan modüllerde eksik
Kullanıcı verisi yazan 7 modül + 2 merkezi yardımcı temp+rename yapıyor ama fsync çağırmıyordu (güç kesintisinde rename kaybı):
- `browser-cea-checkpoint.js` (kurtarma noktası — tam da çökmeye karşı korunan veri)
- `browser-element-rules.js` `_write`
- `browser-feature-services.js` `save` + `writeOwnedSubtitle`
- `browser-reading-list.js` `_writeIndex`
- `browser-series-context.js` `commit` (seri bağlam hafızası)
- `browser-translation-cache.js` (senkron + asenkron kompaktleme)
- `burnin-output.js` `replaceBurninOutput`
- `atomic-json.js` `writeJsonAtomic` / `writeMirroredJsonAtomic` — merkezi yardımcı; `flush:true` dosya fsync'i yapıyordu ama rename sonrası dizin fsync'i yoktu
- `main.js` yerel `writeJsonAtomic` + `writeBufferAtomic` — aynı boşluk

Her siteye `fsyncFile(geçici, io)` + `fsyncDirectory(dir, io)` eklendi; bayraklar (0o600 gizlilik, `wx`, BOM) korundu. `main.js`'e `fsync-utils` importu eklendi.

### B-366-05 — EN sözlükte eksik iki anahtar
`i18n-coverage` ratchet'i iki ana-bellek hata dizgisini yakaladı: `Tanı paketi çok büyük.` ve `Önizlenen tanı paketi okunamadı.` Sözlüğe EN karşılıkları eklendi.

## Doğrulanan-temiz yüzeyler (kanıt okuması, kusur yok)

- `browser-translation-scheduler.js` cümle birleştirme (`joinCompleteTrackFragments`, `shouldJoinEnglishFragments`, EN bağımlı-başlangıç/sahipli-liste kapıları), `assembleCueSentences` kaynak-tamamlanma kapısı, `graphemes` ZWJ/birleştirici işleme — mevcut davranış testleriyle kilitli (subtitle-sentence-layout, subtitle-gauntlet).
- `distributeTranslation` — merged/parts/text üç yolu, boşluksuz-yazı grapheme dağıtımı, az-kelime birleştirme — `browser-subtitle-gauntlet` ile kapsalı.
- `translation-diff.js` — matchBefore/LCS/changedTerms/revert/applyReviewChoice — `translation-review-tools` 8/8.
- `browser-translation-integrity.js` `summarizeTranslationIntegrity` — reason/status matrisi doğru; `message` alanı UI'da tüketilmiyor (panel yapılandırılmış sayıları gösterir) — kusur yok.
- `translation-endpoints.js` Shuai routeKey/alias failover, `browser-translation-provider-error.js` kanal-yok sınıflandırması — mevcut kilitlerle uyumlu.
- `browser-translation-archive.js` kalanı: `matchArchivedPage`, `safeName`, `canonicalPageUrl`, `list`/`get` — mevcut test yeşil.

## Test kanıtı

- `node --check`: değişen 12 dosyanın tamamı temiz.
- `renderer-edge-ratchet`: 25 kontrol (yeni locale-yüzey listesi dahil).
- `i18n-coverage`: 0 eksik (2 yeni EN girişiyle).
- `queue-opts-roundtrip`: 61.388 kontrol (VM sandbox'a `fsyncDirectory` bağımlılığı eklendi).
- `browser-translation-archive`, `browser-translation-cache` (12), `browser-cea-checkpoint`, `browser-config-deadzone` (12), `browser-feature-services`, `browser-reading-list`, `browser-series-context`, `browser-series-translation`, `browser-parti6/7`, `persist-paths-deadzone` (8), `pdf-state-deadzone` (5), `browser-favicon-cache` (37), `browser-report86-regressions` (44/44), `auth-io-deadzone` (18), `crash-integrity`, `atomic-write-kill` (201), `browser-store-deadzone` (11), `history` (13), `queue-lifecycle` (21), `queue-persistence` (14), `watch-library` (8), `validation` (27), `userdata-corruption-matrix`, `ipc-parity` (0 unguarded) — tamamı yeşil.
- Çalıştırılmayanlar: tam `npm test` paketi bu turda kökten koşulmadı (hedefli koşu); Electron smoke koşulmadı (UI değişikliği davranışsal — renderer.js yalnız yeniden-çizim çağrıları).
- Windows etkisi: fsync zinciri POSIX'te doğrulandı; `fsyncDirectory` Windows'ta açılım reddedince sessizce tolerans eder (fsync-utils FSYNC_DIR_TOLERATED) — davranış eşdeğer. `flush:true`/rename Windows'ta geçerli.

## Kalan/bekleyen

- `devin_review_manage` hâlâ 404 — report_triage toplu bildirimi askıda (`/home/ubuntu/review-batch-r331.txt`).
- Açık kararlar: `docs/ACIK-KARARLAR.md`.
- Windows el-kontrolü: devin-3c20a465 askıda.
