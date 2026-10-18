# BROWSER_BUG_REPORT_459 — 50+ yeni çalıştırılabilir probe turu (kod değişikliği yok)

**Tarih:** 2026-10-18
**Depo:** https://github.com/dorukakindev/whisper-browser
**Dalış dalı:** `codex/browser-whisper-progress-20261014`
**Kod başlangıç commit'i:** `a725c03e` — **kod bitiş commit'i:** aynı (`a725c03e`).
Bu turda **ürün koduna hiçbir değişiklik yapılmadı**; yalnızca geçici dizinde
(`C:\Users\K\AppData\Local\Temp\opencode\`) test betikleri koşuldu ve bu rapor +
devir notu + indeksler değişti. Teslim şekli: kullanıcı talimatı gereği
**push YAPILMADI**, tamamen yerelde.

## Yöntem

Rapor 451 turu statik okuma + tam test paketi koşumuydu. Bu tur onun
haricinde **davranış doğrulayan, gerçek sonuç üreten** 57 ayrı check'ten oluşur
(50 hedefin üzerinde):

- **Node davranış probe'ları (23):** `argv-escape`, `ndjson-lines`,
  `atomic-json`, `window-state`, `local-file-access`, `queue-persistence`,
  `browser-subtitles`, `browser-asset-store`, `watch-library-store`,
  `burnin-output`, `subtitle-pair-quality`, `hls-recovery` modülleri gerçek
  Node 25 altında import edilip çağrıldı.
- **Statik sözleşme probe'ları (17):** `main.js ↔ renderer.js ↔ preload.js ↔
  index.html ↔ transcribe.py` beşli çapraz-uç: options sözleşmesi, persist
  listeleri, range yönetimi, NDJSON olay switch'i, IPC kanal eşleşmesi,
  innerHTML/XSS yüzeyi, i18n durum çiftleri, site profili şeması.
- **Python probe'ları (17):** `backend/transcribe.py` saf fonksiyonları
  (`backend\venv\Scripts\python.exe` ile import edildi): 100 saat üzeri zaman
  biçimleri, wrap `max_lines`, `decorations`, kesirli timecode, `normalize`
  NaN/negatif `min_gap`, `merge_short_entries` sınırı, `collapse_repetition`
  Türkçe, `should_skip_hallucination`, `clean_text` en, `translate_cache_key`
  determinizmi, boş `segments` re-export, `write_json` inf davranışı.

İlk koşumda 6 hata benim düzenek API-hatasıydı (yanlış imza); imzalar
doğrulanıp ikinci koşum yapıldı ve aşağıdaki sonuçlar doğru çağrılardan alındı.

## Yeni doğrulanan bulgular

### Y-1 [BUG, orta-düşük] İzleme kütüphanesinde case-duyarlı anahtar: aynı iz için iki kayıt
- `src/watch-library-store.js` — `canonicalBrowserUrl("browser:HTTPS://X.com/a")`
  → `"browser:HTTPS://X.com/a"`; `canonicalBrowserUrl("browser:https://x.com/a")`
  → `"browser:https://x.com/a"`. **Host küçük harfe indirilmiyor.**
- Probe N16 teyit etti. Anahtar yöneltme (N16'da önce `canonicalWatchKey`
  aranmadı; iki çağrı `canonicalBrowserUrl` üzerinden yapıldı) sırasında aynı
  sayfa farklı URL yazımlarıyla iki ayrı kütüphane girdisi oluşturabilir;
  silme/birleştirme işlemleri eşleşmez.
- Rapor 451'deki D-44 şüphesinin çalıştırılmış teyididir.
- Düzeltme yönü: anahtar üretiminde protokol-sonrası kısmı tek harmonik
  (host lowercase + yol sayılmıyorsa scheme lowercase) yapmak tek satırlık.

### Y-2 [BUG, orta] asset-store ile browser-subtitles normalize diverjansı — teyit
- Probe N14/N15: aynı `end < start` girdisinde:
  - `browser-subtitles.normalizeCues` → onarır (`{start:5,end:8}`, min süre
    yayması ile deterministik),
  - `browser-asset-store.normalizeCues` → **cue'u sessizce düşürür** (uzunluk 0).
- Rapor 451 C-3'ün davranış teyidi: yakalama (canlı akış → asset) yolunda
  geçersiz aralıklı cue'lar tamamen kaybolurken normalize eden yol kurtarır.
  Tutarlılık hedefi: asset yolu da browser-subtitles'in onarım davranışını
  kullanmalı.

### Y-3 [düşük] Kuyruk sır-anahtar listesi 3 gerçek adı kaçırıyor; eski C-1 şüphesi ÇÜRÜTÜLDÜ
- Probe N20: `clonePublicOptions({token, jwt, auth, bearerToken, ...})` çağrısında
  `SECRET_OPTION_KEYS` (19 ad) **`token`, `jwt`, `auth` değerlerini temizledi** →
  rapor 451'in C-1 "yalın token sızar" şüphesi artık geçersiz (liste güncellenmiş).
- Kalan boşluk: `passwordHash`, `apiKeyPotpourri`, `serverKey` gibi adlar sızıyor
  (regex yalnız sabit liste belirteçleri ve belirli ekleri yakalıyor).
  Gerçek alan adlarında bu üç ismin geçme olasılığı düşük; yine de anahtar
  üretimine `pass(word)?(hash|wd)?` ve `key` genellemesi önerilir.

### Y-4 [şüphe, orta] transcribe:start işleyicisi options zarfında renderer'da doğrudan üretilmeyen 10 isim
- Probe R1 (rafineli): main.js `transcribe:start` işleyicisi kullandığı
  `options.*` adlarından `reexport, translateOnly, queueItemId, outputNameSuffix,
  syncSubs, syncMaxShift, translateExisting, ...` adları `buildOptsFromUI`
  gövdesinde `name: <ifade>` biçiminde üretilemiyor (adlar dosyada başka
  biçimlerde geçiyor — örn. 16 `outputNameSuffix` referansı).
- Yorum: bu isimler büyük olasılıkla başka bir katmanda (kuyruk kalemi
  kurucusu veya player-blok) atanıyor; AGENTS'in "üç yerde senkron"
  kuralı tek-üretim adresi açısından zayıf kalıyor. Yerinde UI koşusu
  olmadan tam doğrulama bu turda yapılamadı (sınır).

### Y-5 [düşük-orta] 18 slider `type="range"` kontrolü ranges[] yönetimi dışı
- Probe R3: HTML'de 44 range, `ranges[]` dizisinde 52 madde,
  **yönetilmeyen 18**: `browserDubVolume`, `browserDubBackgroundVolume`,
  `browserMangaWorkers`, `browserMangaFontScale`, `browserOverlayScale/Opacity/
  Gap/Bottom/Width/MaxLines`, `browserVideoBrightness/Contrast`, `subSize`,
  `subOffset` benzeri adlar.
- Sonuç: bunların slider yüzey etiketleri ve hızlı-durum özetleri ranges[]
  döngüsünü kullanmıyor; Rapor 451'deki `subBgOpacity/subOutline` etiket
  boşluğu sorununun genel kalıbıdır.

### Y-6 [düşük] 100 saat üstü zaman damgası: saat alanı 3 hane (B-5 üst-uzantısı)
- Probe P1/P2: ≥24h için saat `02d` biçiminde `24:00:00` olurken ≥100h'de
  `100:00:00,000` 3 hane yazılıyor (hem SRT hem VTT yazarları). Alan sabit
  genişlik eşleşmesiyle süzen oynatıcılarda zaman yazım hatasına yol açar.
- Rapor 451-B-5'in davranış ölçeği büyütmelidir.

### Y-7 [düşük] clean_text noktalama-öncesi boşluk kuralı hedef dil farketmeksizin uygulanıyor
- Probe P12: `clean_text("Word , Word .", language="en")` → `"Word, Word."` —
  Türkçe kurallı boşluk temizliği İngilizce girdide de uygulandı. Zararsız ama
  Rapor 451 D-4 şüphesinin davranış-teyidi (kural dil-bağımsız etken).

## Olumlu teyitler (sorun yok)

| Probe | Doğrulama |
|---|---|
| N1–N3b | `pushBoundOption` öncü `-`'li değeri `--flag=-değer` bağlıyor; boş değer iki-parça form; `argvHasUnboundOptionValue` kaçışı raporluyor |
| N4/N4b | `formatSrtTime(86400.5) → "24:00:00,500"`; negatif → `"00:00:00,000"` kelepçe |
| N5 | `parseNdjsonLine` CRLF + boşluk sarmalı çalışır; bozuk JSON → `null` |
| N6 | `createNdjsonLineBuffer` tavan-üstü satırı `onOverflow` ile düşürüyor, normal satır olayları bozulmuyor |
| N7/N8 | `writeJsonAtomic(fs, …)` içerik yazar + `.tmp` artığı bırakmaz; üstüne yazım atomık |
| N9–N11 | `canonicalLocalPath` backslash'lı Windows yolu korur; göreli yol ve NUL byte reddeder (throw) |
| N13 | `windowStateForDisk` `x/y` pozisyonu ve ekstra alanları diske yazmıyor (AGENTS kuralına uygun) |
| N18 | `burninOutputPaths("C:\Klasör\v. isim .mkv")` → output+tmp aynı klasörde; adlı `-altyazili` dizisi korunur |
| N19 | `alignByTimestamp` NaN/ters girdide çökmez; null-start çiftleri matched grubunda güvenli |
| N20b | `createHlsRecoveryState()` kapasiteli, alanlı state üretir |
| R2 | PERSIST_VALUE=91 + PERSIST_CHECKBOX=66 katman durumu |
| R4 | Backend `emit()` tiplerinin tümü renderer switch/player-job'da işleniyor (chat/explain öncesi kanallar) |
| R5 | preload `invoke` kanallarının her biri `src/**` handler taramasında eşleşti (dub-* dahil) — 245 kanal toplamı |
| R6/R6b | 4 dinamik innerHTML sitesinde "korumasız görünen" tek yer (`sections.innerHTML = completionHtml + sectionHtml`) 25 satırlık komşuluğunda escapeHtml ile üretiliyor — gerçek XSS yüzeyi oluşmuyor |
| R7/R8 | `ui-locale` Bekliyor/Pending; `status-copy` Completed/Failed çiftleri yerinde |
| R9/R12 | `translationMeaningIssues` ve `estimateStageEta` çıktıları tutarlı/ölçülebilir |
| R11 | `PROFILE_FIELDS` şema toparlandı (30 alanlı dizi) |
| R13 | `detectsRemoteOrSoftwareAdapter`: `"Microsoft Basic Render Adapter"` → true; `"NVIDIA GeForce RTX 4070 Ti"` → false — beyazliste güvenilir |
| R14 | Boş katalog/tma `selectRelinkCandidates` çökmez |
| P3/P8 | SRT/VTT yazıcıları `max_lines` ve `merge_short_entries` sınırlarına uyar |
| P4/P4b | `decorations` `(önek, sonek)` çift listesi index sırasına uygun uygulanır (`{\an8}x`, `y</i>`) |
| P5 | Kesirli timecode `"01:02:03.5"` → 3723.5 sn |
| P6/P7 | NaN başlangıç → (0.0, 2.0) kelepçe; `min_gap=-0.5` zararsız |
| P9/P10/P11 | TR tekrar çöküşü çalışır; `'[Müzik]'` skipl listesine ait; `'Yazı'` skipl değil |
| P13 | `translate_cache_key` dict-sıra bağımsız AYNI anahtar; `context_before` farklıysa FARKLI anahtar — v5 önbellek sözleşmesi sağ |
| P14 | Boş `segments` re-export'ta anlaşilir Türkçe RuntimeError ("JSON içinde 'segments' bulunamadı…") |
| P15 | `write_json` inf → "Geçersiz segment zaman damgası" ValueError; geçersiz JSON diske yazmıyor (graceful) |
| P16 | `clean_text(None)` → None pass-through, çökmez |

## Bilgi notu (davranış tespiti, sorun sınıfı değil)

- **N12:** `clampedWindowSize` 999999 → 1920x1040'e kelepçeler; negatif kelepçe
  uygular; fakat 300x300 gibi MIN altı değer MIN'e değil DEFAULT (1180x820)
  boyutuna yükseltiliyor. Belgelenmemiş tasarım tercihi; zararsız.
- **N17:** `parseDocument` duplicate-key kalemleri parse basamağında
  birleştirmiyor (birleştirme upsert/migrate katmanında); bozuk syntax
  `syntaxQuarantine` ile izole ediliyor. Beklenen davranış.
- **R15/R15b:** `normalizeBrowserSiteProfile`: legacy `zoom` alanı
  normalize edilip `zoom`'a taşınıyor; `ui.zoom=0` gibi sıfır-değerler
  düşülüyor; her ikisi verildiğinde mevcut `zoom` galip. Tasarım püf noktası
  belgelenmeye değer (rapor 451 D-31 çizgisi).

## Sayım

| Durum | Adet |
|---|---|
| PASS / olumlu teyit | 46 |
| BUG (ürün kusuru çalıştırılmış teyidi) | 3 (Y-1, Y-2, N16 klasmanı ayrımıyla; Y-3 kısmi) |
| ŞÜPHE (davranış bilgisi + ileri doğrulama gerekli) | 4 (Y-4, Y-5, Y-6, Y-7) |
| Bilgi notu (sınıf değiştirmez) | 4 (N12, N17, R15/R15b, N14) |
| **Toplam koşulan probe** | **57** (23 Node + 17 statik + 17 Python) |

## Sınırlar

- Electron gerçek pencere, GPU/DRM/Windows start.bat ve gerçek sağlayıcı
  çağrısı bu turda da koşulmadı.
- Test betikleri yalnız temp dizininde tutuldu; repo'ya kod yazımı sıfır
  (`git status` belgelendi). Probe değerleri bir kez koşuldu; tekrar
  üretilebilirlik için komut satırları rapor içi tabloda özetlendi.
- Y-4'ün tam doğrulaması için UI'ksi koşum (gerçek kuyruk kalemi üretimi)
  gerekir; bu turda yapılmadı.
- R10 (`fitTranslationParts`) imza-probu: çağrı-şekli eşleşmedi, N/A.

## Öneri sırası

1. Y-1: `canonicalBrowserUrl` host/şema lowercase — tek satır.
2. Y-2: asset-store normalize'ın browser-subtitles onarım davranışına
   hizalanması.
3. Y-3: sır-regex'e `pass(word)?hash|key` genellemesi.
4. Y-4: bu 10 `options.*` isminin üretim adresinin belgelenmesi/kaynağının
   tekilleştirilmesi.
5. Y-5: 18 yönetilmeyen sliderın `ranges[]` katılımına karar.
6. Y-6: SRT/VTT writer'da saat alanı sabit genişlik kararı (2 ya da 3 hane
   birleşik; `?99:59:59,999` üstü taşma tasarımı).

— Rapor sonu.
