# BROWSER BUG REPORT 301 — R334: Yerel kalite turu (kapsam haritası + gerçek bug)

**Tarih:** 2026-10-01 · **Dal:** `devin/1790820025-r334-coverage-audit` · **Bağlam:** GitHub hesabı spam-flag'de (404) — PR açma/merge bekliyor, işler yerel kollarda toplandı.

## Özet

GitHub engelini beklemeden yürütülen yerel doğrulama turu. Beş iş kalemi:

1. `npm test` tam tur — R332 commit'lerinin test-tarafı 4 kırılması (R332 dalında `760f7bf` ile düzeltildi, ayrı rapor 300).
2. Electron smoke `--all` — `NODE_V8_COVERAGE` ile birleşik koşu: hem geç/kal hem `main.js` blok kapsamı.
3. Backend `coverage.py` — `transcribe.py` ölü bölge analizi → yeni test dosyası + **1 gerçek bug**.
4. `main.js` V8 fonksiyon-kapsam haritası — 1503 hiç-çağrılmayan named fonksiyon, kümeler sınıflandırıldı.
5. `renderer.js` CDP precise-coverage + maymun-fuzz — 400 adım, **sıfır console hatası**.

## GERÇEK BUG (düzeltildi)

### B-334-01 · `recover_punctuation_collapse` sınır bandı mükerrer altyazı üretir (transcribe.py)

- **Kök neden:** Kabul penceresi `span_start − 0.25 ≤ center ≤ span_end + 0.25`, eski-blok silme penceresi ise kesin `[span_start, span_end]` — kabul bandı ±0.25 s daha geniş. Ayrıca `max(ns, span_start)` kırpması run-up'tan gelen yeni bloku bölge İÇİNE çeker. Bölge kenarına oturan hayatta kalan eski blokla (merkezi banda düşen) yeni blok aynı saniyede üst üste gösterilir.
- **Kanıt (kırmızı):** `test_split_deadzones.py::t_recover_boundary_no_duplicate` — span 50–150, hayatta kalan komşu `[49.4, 50.3]` (merkez 49.85 < 50), yeniden çeviri `[50.0, 50.4]` — eski kodda ikisi de listede (0.3 s çakışma). `git show HEAD~N` sürümüyle doğrulandı.
- **Düzeltme:** Survivor-overlap bekçisi — katı span dışında merkezi olan eski bloklar `survivors` olarak toplanır; kabul bandına düşen yeni bloklardan survivor'la >0.05 s çakışanlar düşürülür. `new_words` için de aynı bekçi (kelime listesinde aynı asimetri vardı).
- **Kilit:** yeni blok düşürüldüğü için `new_entries` boşalıyor → span atlanıyor, eski metin korunuyor (tasarımın "asla kötüleştirmez" sözleşmesiyle uyumlu).

## Kapsam haritaları

### Backend (`coverage.py`, 47 test dosyası subprocess)

`transcribe.py` 5217 stmt, %79 kapsam, 1077 eksik satır, **sıfır tamamen-ölü fonksiyon**. En derin ölü gövdeler (hepsi test kilitlendi veya env-gated sınıflandırıldı):

| Fonksiyon | Eksik | Durum |
|---|---|---|
| `recover_punctuation_collapse` | ~90% | **bug bulundu+düzeltildi**; FakeModel ile 4 senaryo kilitli |
| `split_segment_by_timing` / `split_segment_by_punctuation` | ~85% | 10 senaryo kilitli (passthrough sözleşmesi dahil) |
| `find_unpunctuated_spans` | çoğu | 4 senaryo kilitli (comma/cap/short-dur kapıları) |
| `sync_subtitles` (--sync-subs) | ~98% | env-gated (ffmpeg+numpy+gerçek medya) — test edilemedi |
| `resolve_device_and_compute` | ~90% | env-gated (GPU/CUDA yok) |
| `download_youtube` / `llm_translate` / `main` | kısmi | ağ/model-gated |

### main.js (V8, 39 smoke süreci birleşik)

4579 fonksiyon bloğunda 1503 named fonksiyon hiç çağrılmadı (%58 blok). Kümeler:

- **Smoke-dışı özellikler:** manga hattı (`startBrowserManga`, `translateMangaCandidate`, `requestMangaTranslationAtEndpoint`, `fetchMangaImageSource`…), canlı ASR (`startBrowserLiveAsr`), sayfa çevirisi blok hattı (`runBrowserPageTranslationBlocks`, `acceptDynamicBrowserPageBlocks`, `flushBrowserPageApply`).
- **Ağ/canlı-gated:** `fetchSponsorBlockSegments`, `fetchDeArrowBranding`, `fetchYouTubeDislikes` (deterministik set ağı dışarıda bırakır).
- **İç araçlar:** `resourceSoakCycle`, `runResourceSoakSession`, `collectResourceSoakSnapshot`, `resourceSoakHibernationSession` (CLI-flag araçları).
- **Kenar-yaşamdöngüsü:** `unloadBrowserTab`, `openYoutubeTvWindow`, `restorePersistedBrowserTracks`, `runAnkiExport`, `reportBrowserDrmSupport`.
- **Bakım/sweep yolları:** `pruneOldLogs`, `sweepStaleChatFiles`, `sweepOrphanOutputTransactions` (zamanlama-gated).

Şüpheli **ölü kod bulunamadı** — hepsi tetiklenmemiş-yol sınıfında; kapsam haritası gelecek test yazarlığı için kullanılabilir.

### renderer.js (CDP precise-coverage + 400 adım maymun-fuzz)

Derleyiciye ulaşan 801 blokta 295'i çalışmadı; named-fonksiyon olarak **yalnız 19 hiç-çağrılmayan** — çoğu maymunun ulaşamayacağı özellik yüzeyleri (`toggleQueue`, `openMenu`, `goChannel`, `showError` hata görünümü). **Sıfır console hatası.**

## Smoke sonucu

`xvfb-run -a node tests/run-electron-smokes.js --all` (NODE_V8_COVERAGE): tek düşüş `electron-browser-menu-visual` — `desktopCapturer` pencere listelemesi başsız Xvfb'de çalışmaz (compositor yok). **Ortam sınırlaması**, ürün regresyonu değil; R328-1'de aynı sınıf belgelenmişti.

## Yeni test dosyası

`backend/test_split_deadzones.py` — 17 senaryo / 24 kontrol, hepsi yeşil: timing big-pause/bağlaç/hard_max/max_words/None-zamanlı kelime/words=None; punctuation cümle-sonu/soft-70%/passthrough; find_unpunctuated_spans 4 kapı; recover_punctuation_collapse replace/keep/sınır-bandı 4 senaryo.

## Yeni araçlar

- `tools/ui-fuzz-coverage.js` — Electron sürücüsü: `webContents.debugger` + `Profiler.startPreciseCoverage`, deterministik yüzey turu + seeded mulberry32 maymun-fuzz (400 adım: %70 tıklama, %20 tuş, %10 metin), console-hata hasadı (`ERROR_ALLOW=/Autofill/i`), kapsam JSON'a yazılır.
- Çıktı: `/home/ubuntu/fuzzcov/renderer-coverage.json` (repo dışı artefakt).

## Sınırlar

- `desktopCapturer` sınıfı smoke'lar gerçek Windows/compositor bekler.
- GPU/CUDA/network-gated fonksiyonlar (`resolve_device_and_compute`, `download_youtube`, `sync_subtitles`, `llm_translate` canlı yolu) bu turda da doğrulanamadı — aynı sınıf daha önceki raporlarda tanımlı.
- V8/CDP kapsamı yalnız derlenmiş fonksiyonları sayar; tembel-parse'lı iç fonksiyonlar sayılmaz — "hiç çalışmadı" listesi üst sınır tahminidir.
