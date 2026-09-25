# Bug Raporları Doğrulama Matrisi — 2026-09-26

**Amaç:** Depoda ve çalışma klasöründe birikmiş tüm bug/denetim raporlarının
bulgularını güncel koda karşı doğrulamak; her bulguyu **GERÇEK** veya
**FALSE POSITIVE** (ya da ara sınıflar) olarak dosyada işaretlemek.

**Dal:** `devin/repo-research-2026-09-25` · **HEAD:** `e6d83c0` (R124 raporu)
**Kapsam envanteri:** `docs/raporlar/` (≈90 dosya), kök dizin (≈45 rapor),
`docs/` stray'leri ve izlenmeyen çalışma-dizini raporları — toplam ~172
rapor-benzeri dosya. `git log --all` üzerinde yan dallardaki raporlar da
kapsandı (`haze/bug-report-2026-09-24`).

---

## 1. Durum lejantı

| İşaret | Anlam |
|---|---|
| **GERÇEK→DÜZELTİLDİ** | Bulgu doğruydu; düzeltme commit'i/testi mevcut |
| **GERÇEK→AÇIK** | Bulgu doğru ve güncel kodda hâlâ mevcut |
| **GERÇEK→ZARARSIZ** | Kod kusuru gerçek ama kullanıcı etkisi yok |
| **FALSE POSITIVE** | İddia güncel kod/çağrı zinciriyle çürütüldü |
| **KISMEN** | İç yardımcıda kusur var ama üretim yolu korumalı / kısmen doğru |
| **TEORİK-MANUEL** | Kanıt üretilemedi; gerçek ortam/hesap/GPU gerektirir |
| **ÖNERİ** | Hata iddiası değil; tasarım/polish önerisi |
| **BAYAT/TARİHSEL** | Eski sürüme ait; kod o zamandan beri yeniden yazıldı/düzeltildi |
| **DOĞRULANAMADI** | Bu oturumda karar verilemedi |

---

## 2. Kanıt düzeyleri (nasıl karar verildi)

1. **Doğrudan çalıştırma (bu oturum):** `node -e` / Python probe'ları ile
   güncel kaynakta yeniden üretim.
2. **Kanonik kapanış kararları:** `AUDIT-KAPANIS-MATRISI-2026-09-12.md` +
   `BROWSER-TUM-BULGULAR-DOGRULAMA-2026-09-12.md` (eski 355 maddelik
   birleşik küme ve adlandırılmış F/R/E/B/K/Y/T/BG/DS setleri) +
   `BROWSER_BUG_REPORT_89.md` (R92/R93/R95 kümesinin resmî yeniden
   doğrulaması) + `R58→R59→R60→R61` zinciri.
3. **Raporun kendi SONUÇ işareti:** `docs/raporlar/` serisinin çoğu
   `[SONUÇ: DOĞRULANDI · DÜZELTİLDİ]` / `[SONUÇ: REDDEDİLDİ]` satırları
   taşır; bunlar yazım anında doğrulanmış kararlardır ve matrise taşındı.
4. **Fix commit kanıtı:** `git log`'da bulgu kimliğine atıflı düzeltme
   commit'lerinin varlığı (örn. `b112a03`, `73d0ce8`, `850e927`).

Bu oturumda yapılan bağımsız doğrulamalar, R89'un kanonik kararlarıyla
**%100 uyumlu** çıktı (R95 kümesinin 17 maddesi ayrıca elden test edildi).

---

## 3. Bu oturumda doğrudan doğrulanan bulgular

### 3.1 PROGRAM_BUG_REPORT_83/84/85 hakemliği (kök dizin, izlenmeyen)

Üç rapor birbirini denetliyor; 84'ün FP kararları 85'te çürütülmeye
çalışılmıştı. Güncel kod + `b112a03` fix commit'i ile nihai karar:

| Bulgu | R83 iddiası | R84 kararı | R85 kararı | **NİHAİ KARAR** | Kanıt |
|---|---|---|---|---|---|
| 83-01 / R95-02 position clamp | Gerçek | DOĞRULANDI | DOĞRULANDI | **KISMEN→ZARARSIZ** | `60*60*1000` saniye = 1000 saatlik bilinçli gevşek sınır; `b112a03` sabiti adlandırdı, davranış değişmedi (R89 ile aynı) |
| 83-02 / R95-01 `normalizeBrowserEventContext(null)` | Throw | FALSE POSITIVE | DOĞRULANDI | **GERÇEK→DÜZELTİLDİ** | `b112a03` `source` guard'ı ekledi — fix'in varlığı kusurun gerçek olduğunu kanıtlar |
| 83-03 / R95-05 migration `version` | Güncellenmiyor | FALSE POSITIVE | DOĞRULANDI | **GERÇEK→DÜZELTİLDİ** | `b112a03` `source.version = BROWSER_SESSION_VERSION` ekledi |
| 83-04 / R95-06 `distributeTranslation` boş | Throw | KISMEN | DOĞRULANDI | **GERÇEK→DÜZELTİLDİ** | `b112a03` try/catch + trim guard ekledi |
| 83-05 / R95-07 `transcriptClock(Infinity)` | Bozuk string | DOĞRULANDI | DOĞRULANDI | **GERÇEK→DÜZELTİLDİ** | `b112a03` `Number.isFinite` guard'ı ekledi |

### 3.2 R95 (PROGRAM_BUG_REPORT_85) ek iddiaları — bağımsız test

| Bulgu | R85 iddiası | **NİHAİ KARAR** | Kanıt (bu oturum) |
|---|---|---|---|
| R95-03 / R95-11 gap boundary | `>` strict, sınırda böler | **FALSE POSITIVE** | Canlı test: `gap=0.5<1` birleşti, `gap==maxGap` birleşti, `gap=2>1` ayrıldı — sınır zaten dahil; önerilen `>=` düzeltmesi gerçek bug üretirdi. Scratch testinin oracle'ı yanlış (bitmiş cümle `sentenceEnded` ile bilerek flush'lanır) |
| R95-04 translate-only çakışması | Dosya ezebilir | **FALSE POSITIVE** | Raporun kendisi "BUG KANITI YOK" diyor; güncel kodda `.ceviri` qualifier + meta/cue-fingerprint resume + transaction koruması var (`translate_existing_subtitle`) |
| R95-08 IDN reddediliyor | `xn--example-9ua.com` reddi | **FALSE POSITIVE** | `new URL('https://xn--example-9ua.com')` Node'da WHATWG-Invalid — girdi bozuk punycode; geçerli IDN `müzik.example` → `xn--mzik-0ra.example` doğru normalize oluyor |
| R95-09 truthy toggle | `'yes'` toggle etmiyor | **FALSE POSITIVE** | `updateBrowserPlaybackState` yaratıldığından beri `playing === true` (commit `73d0ce8`, 7 Eylül); boolean sözleşme doğru davranış |
| R95-10 3-level secret merge | Derin yol başarısız | **FALSE POSITIVE** | `setPath` keyfi derinliği destekler; canlı testte `nested.deep.key` merge oldu. Prob sözleşmenin dışında obje beslemiş |
| R95-12 offset clamp 60 | Sabit 60 | **FALSE POSITIVE** | `MAX_ABS_OFFSET_SECONDS = 24*60*60 = 86400` (`browser-subtitle-sync.js:10`); test yanlış beklenti taşıyordu |
| R95-13 envelope fuzz | Throw | **GERÇEK→DÜZELTİLDİ** | null/ilkel context fuzz'i `b112a03` öncesi patlıyordu; şimdi tüm girdilerde güvenli (canlı doğrulandı) |
| R95-14 `splitBrowserBounds({})` | Default obje dönüyor | **FALSE POSITIVE** | Boş bounds minimum güvenli yerleşime normalize edilir; `null` yalnız bounds yokluğunda — sözleşme doğru |
| R95-15 `reorderIds` referans | Aynı ref | **FALSE POSITIVE** | Yeni `map(String)` dizisi dönüyor; dış mutasyonu engelleyen doğru davranış |
| R95-16 boş `mediaId` | — | **FALSE POSITIVE** | Kimlik URL/service/contentId üzerinden kanonik yeniden üretiliyor; fonksiyon güncel kodda yok |
| R95-17 `normalizeRecoveryJob` export değil | — | **FALSE POSITIVE (bug değil)** | İç şema yardımcısı; dışa açık API değil |

> **Özet:** R85'in "33 yeni doğrulanmış bug + 12 FP" iddiası abartılı;
> gerçekten doğrulananlar b112a03 ile zaten düzeltilmiş olanlardı. R84'ün
> `83-02`/`83-03` FP kararları ise fazla iyimserdi — fix commit'i
> sertleştirmenin gerekli olduğunu kanıtlıyor. Nihai otorite:
> `BROWSER_BUG_REPORT_89.md` (aynı sonuçlara bağımsız ulaştım).

### 3.3 `haze/bug-report-2026-09-24` dalındaki raporlar (R124/R125)

Bu dalda master'dan farklı bir R124 ve revert edilmiş bir R125 var.
Bulguları güncel kodda tek tek doğruladım:

| Bulgu | **KARAR** | Kanıt |
|---|---|---|
| R124-01 (haze) `_vtt_to_srt` kompakt VTT cue kaybı | **GERÇEK→AÇIK** | Canlı probe: boş satırsız `WEBVTT` girdisinde ilk cue düşüyor (`'1\n00:00:02,000 --> 00:00:03,000\nIkinci\n'`); boş satırlı girdi 2 cue üretiyor. `invidious.py:361` `cur` üzerine yazıyor |
| R124-02 (haze) `MAX_MEDIA_TIME_SECONDS` isim/birim | **GERÇEK→ZARARSIZ** | Sabit saniye cinsinden 1000 saat; yanıltıcı isim ama sınır bilinçli gevşek (b112a03 yorumu) |
| R124-03 (haze) zaman-grameri asimetrisi | **GERÇEK→ZARARSIZ** | Renderer regex `1e3`'ü reddeder, backend `float()` kabul eder; UI'dan ulaşamaz → sözleşme asimetrisi, kozmetik |
| R125-01 `safePageIndexUrl` sorgu+hash kesiyor | **GERÇEK→AÇIK** | `watch-index.js:38-47` `parsed.search=''`/`hash=''` + `pages.url UNIQUE` → `?v=A`/`?v=B` tek satıra çöker, saklanan URL ölü link; hash-SPA köke çöker. `safePlaceUrl` ailesi sorguyu koruyor — repo içi tutarsızlık |
| R125-02 `process-io.js` stderr drenajsız | **KISMEN (latent)** | Modül gerçekten `child.stderr`'i tüketmiyor; fakat yalnız `tests/process-io.test.js` kullanıyor. Üretim yolu `main.js:16777` yerel kopyası `p.stderr.resume()` ile drenaj yapıyor |
| R125-03 `canonicalWatchKey` file: lowercase | **GERÇEK→AÇIK** | `watch-library-store.js:56` `file:` yolunu `toLowerCase()` ediyor; case-sensitive FS'te (Linux dev ortamı) `Film-A.mkv`/`film-a.mkv` tek anahtara birleşir. Windows hedefinde görünmez |
| R125-04 `StatusCopy.clock` Infinity | **GERÇEK→AÇIK** | Canlı probe: `clock(Infinity)` → `"Infinity:NaN"`, `clock(1e308)` → `"1.6…e+306:56"`. R95-07 düzeltmesi `transcript-search.js`'teki kopyaya uygulandı, bu ikinci kopya atlandı |

### 3.4 Kök `BROWSER_BUG_REPORT_76/77/78` (19 Eylül) — örnekleme

| Bulgu | **KARAR** | Kanıt |
|---|---|---|
| R76 F1 transkript `İ` katlama | **GERÇEK→DÜZELTİLDİ** | `browser-transcript-search.js:10` `.replace(/[Iİı]/g,'i')` artık İ/ı→i katlıyor |
| R76/77 smoke flake (`--all` yük altında) | **GERÇEK→DOĞRULANDI-ORTAMSAL** | Raporun kendisi tekil koşuda geçtiğini belgeliyor; R113 hardening turu sonrası stabilize edildi |
| R78-01 21 gizli URL parametresi | **KISMEN→AÇIK-KALAN** | `auth_token`/`oauth_*`/`secret` artık redakte (`browser-sensitive-keys.js`); ama `PHPSESSID`, `JSESSIONID`, `AWSAccessKeyId`, `api_token`, `pwd`, `x-auth-token`, `secret_key` **hâlâ geçiyor** (canlı test) |
| R78-02 `;jsessionid=` yol-içi sızıntı | **GERÇEK→AÇIK** | `redactUrlSensitiveParams('…/shop;jsessionid=XYZ?x=1')` → değer korunuyor; yalnız query/hash temizleniyor |
| R78-04 `code`/`state`/`client_id` aşırı redaksiyon | **GERÇEK davranış — kasıtlı tasarım** | Kayıtlı adreslerin agresif temizliği kapanış matrisince bilinçli bırakıldı; ürün kararı, bug değil |

### 3.5 `docs/` stray ve eski-dönem raporları

| Dosya | **KARAR** | Kanıt |
|---|---|---|
| `docs/BROWSER_BUG_REPORT_29.md` (izlenmeyen, 18 Eylül) | **ÖNERİ sınıfı** | 10 madde hep "Düşük" iyileştirme/okuma notu; rapor kendisi "kod yalnız okundu, çalıştırılmadı" diyor — doğrulanmış bug değil |
| `docs/BUG_RAPORU.md` (25 Temmuz) | **BAYAT** | C1 `resolvePython` 'py' ölü-kod iddiası güncel kodda düzeltilmiş (`main.js:18061` artık `spawnSync` ile `python/py/python3` yokluyor). 80+ bulgu refactor öncesi kod içindi |
| `docs/BUG_REPORT.md` (25 Temmuz) | **BAYAT** | Aynı dönem; B-serisi bulgular sonraki dalgalarda kapatıldı |
| `docs/KOD_DENETIM_VE_BUG_RAPORU_2026.md` (31 Ağustos) | **KISMEN DÜZELTİLDİ** | `TARAYICI_IZLEME` (1 Eylül) kendi durum tablosunda P-8, A-B, B-3, B-4'ü "Düzeltildi", B-5'i "Kısmen" işaretliyor |
| `docs/TARAYICI_IZLEME_BUG_RAPORU_2026-09-01.md` | **BAYAT→DÜZELTİLDİ** | Y-2 captureBusy kilidi iddiası — güncel kod `browserCaptureFlushPromise` + `withTimeout(4000)` kullanıyor; yakalama mimarisi yeniden yazıldı |
| `docs/security-audit-report-2026-09.md` (18 Eylül) | **KISMEN→FP ağırlıklı** | Başlık SSRF iddiası hatalı önerme: `200.2.x.x` public IPv4'tür (6to4 `2002::/16`'dir, IPv4 değil); Teredo/6to4 gömülü IPv4'ler `browser-manga.js:302-306`'da zaten bloklu. R63 sızıntı maddeleri R63 raporunda düzeltildi |
| `docs/BROWSER_SESSION_BUG_REPORT.md` (18 Eylül) | **BAYAT→büyük kısmı kapsandı** | Oturum/izin bulguları sonraki R73–R89 dalgalarında düzeltildi; kalan ayrıntılar R89 matrisinde |
| `docs/ADVERSARIAL_DOGRULAMA_2026-09-03.md` | **Kanonik karar** | A-01..A-13 tablosu zaten "gerçek/kısmen/false" kararlarını taşıyor — otorite bu dosya |
| `docs/AUDIT_*` (3–4 Eylül: FOLLOWUP, REPORT25, SENTENCE_RETRY, TUR3/4/5, BROWSER_DOWNLOADS, BROWSER_FIND, BROWSER_MEDIA_LIFECYCLE) | **Düzeltme/uygulama kayıtları** | O dönemin fix logları; bulgular o turda kapatıldı |
| `docs/electronegativity-2026-09-07.md`, `WIDEVINE_GEO_DIAGNOSTIC_MATRIX.md`, `streaming-subtitle-research-2026-09-14.md`, `browser-text-stability-measurement-2026-09-07.md` | araştırma/matriks | Bug raporu değil — tarama/diyagnostik belgeleri |
| `docs/BROWSER_BUG_REPORT_70.md` | **İÇERİK YOK** | "yanlışlıkla oluşturuldu" notu; kök `BROWSER_BUG_REPORT_73.md`'ye işaret ediyor |
| `YOUTUBE_REKLAM_ENGELLEME_DEVIR_RAPORU.md` | **Tasarım notu** | Bug raporu değil |

### 3.6 `BROWSER_BUG_REPORT_108_LOCAL_BROWSER_AUDIT.md` (22–23 Eylül, 3 tur)

33 maddelik derin denetim; rapor kendi içinde sonradan FP çürütmeleri de
yapıyor (B-108-12 v1, B-108-15, B-108-19→29, B-108-27 yinelenen).
Güncel kodda yeniden doğrulanan kritik maddeler:

| Bulgu | **KARAR** | Kanıt |
|---|---|---|
| B-108-03 `decideUrlPolicy` iç ağ host körü (SSRF) | **FALSE POSITIVE (kasıtlı sözleşme)** | Adres çubuğu LAN hostlarına kasıtlı `http` sunar — `main.js:4728` yorumu: "192.168.1.1 yazan kullanıcıya https zorlaması bağlantı hatası gösteriyordu". Bu bir tarayıcı; modem/NAS sayfası açmak meşru kullanım |
| B-108-11/30 `feature-services.data()` bozuk JSON | **KISMEN→AÇIK (P3)** | Bozuk `browser-skip-segments.json` ilk okumada `{}`→normalize olur; sonraki `save()` bozuk dosyayı `.bak`'sız ezer (`browser-feature-services.js:31-46`). B-108-30'un "bellekteki kayıtlar sıfırlanır" iddiası YANLIŞ — `if (!skipData)` erken-dönüşü korumalı |
| B-108-12 [P1] `translatedByService` hiç set edilmiyor | **BAYAT (refactor)** | `normalizeTab` artık yok; alan `browser-capture-provenance.js:19`, `browser-asset-store.js:36/78`, `browser-subtitles.js:1505` akışında set ediliyor |
| B-108-16/31 `translationSchedulerBusy` retryTimers körü | **GERÇEK→DÜZELTİLDİ** | `retryTimers` artık busy/idle kontrollerinde (`browser-translation-scheduler.js:676,682`) ve cancel'da temizleniyor (647,667) |
| B-108-32 `SafeSecretStore.save()` partial-decrypt ezmesi | **GERÇEK→DÜZELTİLDİ** | `saveFromSettings` `current.partial`'ı reddedip kasayı koruyor (`secret-store.js:206-213`) |
| B-108-01/02/04–10/13/14/17–28 + 3. tur maddeleri | **GERÇEK→çoğu DÜZELTİLDİ / kalan P3** | Raporun kendi 2./3. tur bölümleri düzeltmeleri belgeliyor; kalan P3 perf/edge maddeleri R109+ turlarına devredildi |

---

## 4. `docs/raporlar/` numaralı seri — dosya dosya kararlar

Karar kaynakları: her raporun kendi SONUÇ/kapanış bölümü + bu oturumdaki
ek dosya okumaları. "Doğrulama kaydı" işaretli raporlar bug envanteri değil,
düzeltme/test raporudur (bulguları düzeltildiği için raporlanmıştır).

| Rapor | Nitelik | Karar özeti |
|---|---|---|
| R25 | bulgu+düzeltme | B1–B4,B6 **GERÇEK→DÜZELTİLDİ**; B5 **FALSE POSITIVE** (`SONUÇ: REDDEDİLDİ · ÜRÜN HATASI DEĞİL`) |
| R26 | bulgu+düzeltme | B7–B11 **GERÇEK→DÜZELTİLDİ** |
| R27 | bulgu+düzeltme | B12–B14 **GERÇEK→DÜZELTİLDİ**; B15 **FALSE POSITIVE** |
| R28 | bulgu+düzeltme | BUG-28-01…05 **GERÇEK→DÜZELTİLDİ**; RET-28-01 **FALSE POSITIVE** |
| R29 | bulgu+düzeltme | B16–B26 **GERÇEK→DÜZELTİLDİ** |
| R30 | bulgu+düzeltme | 42 **GERÇEK→DÜZELTİLDİ** + 5 **KISMEN→SERTLEŞTİRİLDİ** + 2 **FALSE POSITIVE** (kendi SONUÇ işaretleri) |
| R31 | bulgu+düzeltme | B76–B91 **GERÇEK→DÜZELTİLDİ** |
| R32 | test-hakemliği | 1 **GERÇEK→DÜZELTİLDİ** + 3 **FALSE POSITIVE** (test düzeltildi) |
| R33 | denetim | çoğu **FALSE POSITIVE/temiz** |
| R34 | denetim | temiz — bulgu yok |
| R35 | bulgu+düzeltme | **GERÇEK→DÜZELTİLDİ** ağırlıklı, 1 ret |
| R36–R50 | spekülatif denetim turları | çoğu **FALSE POSITIVE/temiz** (örn. R49: 5/5 ret, R50: 4/4 ret, R52: 4/4 ret, R53: temiz) — düşük sinyal oranlı dönem |
| R51 | denetim | bulgular R83+ kapanışlarına devredildi; `.wbp` path-rewrite B109'a yinelenen |
| R55 | düzeltme kaydı | F-01..F-03 **GERÇEK→DÜZELTİLDİ** (progressive-boundary overlap, atomik refresh) — `npm test` yeşil kayıtlı |
| R58 | kesin-bulgu standardı | R58-01…15: 15 **GERÇEK** → R59'da tümü **DÜZELTİLDİ** |
| R59 | düzeltme kaydı | 15/15 düzeltme + regresyon testleri |
| R60 | kalıntı denetimi | R58-14 **GERÇEK** → R61'de düzeltildi |
| R61 | düzeltme kaydı | `apply_piecewise` eş-başlangıç kusuru **GERÇEK→DÜZELTİLDİ** (bu oturum canlı doğrulandı: `None` dönüyor) |
| R64 | statik-iz denetimi | R64-01…~30: kod-doğrulanmış ama runtime-repro'suz; koşullu maddeler (mediaKeySystem vb.) **KISMEN**; o an ağaçta kırmızı suite WIP refactor'dandı |
| R66 | salt-okunur audit | R66-01…25+: P1 üçlüsü (R66-01/02/03) **GERÇEK** olarak devredildi; R66-08 `SENSITIVE_KEY_NAMES` genişletme önerisi → R78-01 kalıntısıyla ilişkili (§5 AÇIK-7) |
| R67 | SmartTube/Invidious düzeltme turu | R67-01…24 **GERÇEK→DÜZELTİLDİ**; o an kalan 3 kırmızı test = başka iş akışının commit'siz WIP'i (ürün kusuru değil) |
| R68 | v2 derin denetim | **34 FALSE POSITIVE** + 1 düzeltme + 5 temiz — en düşük sinyal oranlı rapor |
| R69 | KRİTİK/ORTA uygulama turu | **12 bulgu düzeltildi, 11 false-positive/zaten-doğru, 13 iyileştirme ertelendi** (raporun kendi özeti) |
| R70 | YouTube OAuth | **GERÇEK→DÜZELTİLDİ** |
| R71 | çeviri-güvenilirlik düzeltmesi | devre-kesici/Retry-After dahil **GERÇEK→DÜZELTİLDİ**; canlı sağlayıcı mock düzeyinde |
| R72 | SmartTube turu | 2 SID-leak regresyonu dahil **GERÇEK→DÜZELTİLDİ**; boot smoke geçti |
| R73 | K/Y/O/D serisi | 3 **GERÇEK→DÜZELTİLDİ** + 9 temiz + **2 FALSE POSITIVE** |
| R74 | R74-01…05 | **GERÇEK→DÜZELTİLDİ** ağırlıklı; **1 FALSE POSITIVE** |
| R79 | SmartTube device-flow | 4 **GERÇEK→DÜZELTİLDİ** (delayed-code Electron probe dahil); gerçek hesap akışı manuel açık |
| R80 | SmartTube browse/fallback | **GERÇEK→DÜZELTİLDİ**; canlı Invidious anonim probeli, hesap akışı mock |
| R83 | 39-maddelik envanter (B83-01…39) | Karışık envanter + önceki raporlarla yinelenenler ayrıklandı; kararlar → R84/R85 kanonik hakemliğine devredildi |
| R84 | hakemlik matrisi | R76–R83 + PROGRAM 79–82'yi harf-sınıfıyla sınıflandırdı (D=doğrulandı, K=koşullu, M=manuel, B=belirsiz, Ç=çözüldü); R85 tarafından daraltıldı/düzeltildi |
| R85 | **kanonik 126-satır hakemlik** | R84'ü geçersiz kılan nihai kararlar; açık "yanlış-pozitif/geçersiz repro" listesi (B83-37 repro yanlış yorum, PROGRAM-81 "8/8" fazla güçlü, P79-02 invariant değil) |
| R86 | `bee53b8` paket kararı | "kısmen başarılı, ek düzeltme gerekli" → R86-01…06 **GERÇEK** iş listesi |
| R87 | karar tablosu | "Tasarlanmış / Erişilemez yol / Repro yok / Bakım borcu / Kozmetik-acceptable" verdict'leri; B83-37 verilen repro **geçersiz** (doğru kanıt yanlış yorum) |
| R88 | test-yeniden-yazım kaydı | "Windows-only failures were test-harness artifacts, confirmed" → önceki Windows kırmızıları **FALSE POSITIVE (harness)** |
| R89 | R92/R93/R95 hakemliği | **9 düzeltildi + 15 yanlış pozitif** — bu matrisin de karar kaynağı |
| R94 | OAuth-geri-alma + düzeltme | **GERÇEK→DÜZELTİLDİ**; mock ≠ gerçek hesap notu |
| R95 | QA matrisi A–G | 4 ürün hatası bulunup düzeltildi (F1 FAIL-FIXED + F2/F3/F4/F5); T1–T5 harness hatası ayrı |
| R96 | subtitle gauntlet + 34dk soak | doğrulama kaydı; F-96-1 hls.js `data:` track çöküşü **GERÇEK→DÜZELTİLDİ** |
| R97 | kapsam kapatma | test-kapsamı açığı **GERÇEK→DÜZELTİLDİ**; worktree'deki `npm test` kırmızıları ortamsal |
| R98 | medya-cue sınır planlaması | F-98-1…3 **GERÇEK→DÜZELTİLDİ** |
| R99 | HLS/CEA resume fixture | 2 **GERÇEK→DÜZELTİLDİ** + boundary-spanning caption kaybı **TEORİK** (kanıtlanamadı, checkpoint-replay telafi ediyor) |
| R100 | sayı-kapısı/çeviri | düzeltmeler + kendi "yanlış-pozitif kontrolü" (altın korpus 0 bayrak) |
| R101 | YouTube OAuth smoke | F-101-1 **GERÇEK→DÜZELTİLDİ**; gerçek hesap/safeStorage-Win sınırı açık |
| R102 | crash-integrity | düzeltmeler + FP kontrolü: `settings.json.<pid>.tmp` yetimi **doğru davranış** (bug sayılmadı), PF1–PF3 performans sınırları bug değil |
| R103 | install.sh onarımı | **GERÇEK→DÜZELTİLDİ**; Windows `.exe` launcher yeniden-üretimi CI'a devredildi |
| R104 | kullanım-matrisi turu | 4 **GERÇEK→DÜZELTİLDİ** (E FAIL-FIXED F-104-4 dahil) |
| R105 | T/Y/X/D iddia doğrulaması | 10 iddianın 9'u **GERÇEK→DÜZELTİLDİ**, 1 **KISMEN**; kapamadığı maddeler açıkça listeli |
| R106 | translation-diff incelemesi | doğrulama kaydı; bir smoke ortamda bekledi — regresyon kanıtı yok |
| R107 | youtube-tv-mode | doğrulama kaydı; gerçek TV kodu hesabı manuel |
| R108 | TR cümle-grup dağıtım kapıları | doğrulama kaydı — canlı sağlayıcı koşuluyla gate'ler eklendi; ürün bug'ı değil sağlamlaştırma |
| R108_LOCAL_BROWSER_AUDIT | B-108-01…33 (3 tur) | §3.6 — karışık: çoğu **GERÇEK→DÜZELTİLDİ**, kendi içinde ~6 FP çürütmesi, B-108-03 **FALSE POSITIVE** (kasıtlı LAN), B-108-11 **AÇIK P3** |
| R109 | BUG-109-08/09 | **GERÇEK→DÜZELTİLDİ** |
| R110 | SDH sayımı | **GERÇEK→DÜZELTİLDİ** (`850e927`) |
| R111 | SDH echo | **GERÇEK→DÜZELTİLDİ** (`850e927`) |
| R112 | R112-01/02 | 2 **GERÇEK→DÜZELTİLDİ** (`b5dfc35`) |
| R113 | test-altyapı | 2 **GERÇEK→DÜZELTİLDİ** |
| R114 | E2E kaydı | ürün bug'ı yok — gerçek canlı-yayın fixture PASS |
| R115 | 12 UI bulgusu | 11 **GERÇEK→DÜZELTİLDİ** |
| R116 | watch-in-player | 3 **GERÇEK→DÜZELTİLDİ** (özellik+iyileştirme) |
| R117 | UI test turu | F1–F3 + 2 `ReferenceError` **GERÇEK→DÜZELTİLDİ** |
| R118 | T4 fatal | **GERÇEK→DÜZELTİLDİ** (`90564c1`) |
| R119 | BUG-117-01…07 + F4/F6 | 9 **GERÇEK→DÜZELTİLDİ** (`d888f80`/`dff919f`); F5 EN-i18n kalan dizgiler kapsam kararıyla ayrı turda |
| R120 | catalog-merge regresyonları | 4 **GERÇEK→DÜZELTİLDİ**; ilk Windows CI kırmızısı doğrulanamadı, sonraki run iki platformda yeşil |
| R121 | worktree triyajı | bug raporu değil — "dosyaları taşıma" envanter kararı; sıfır yeni ürün kodu |
| R122 | YouTube çoklu hesap | **GERÇEK→DÜZELTİLDİ** (`0937c7f`) |
| R123 | R123-01 refresh-yarışı | **GERÇEK→DÜZELTİLDİ** (`fbcdeae`) — deterministik kırmızı testle kanıtlı |
| R124 (devin) | `preview_refresh` boşluğu + boş `--sync-srt` | **GERÇEK→AÇIK** (`e6d83c0`) |
| R124/R125 (haze dalı) | §3.3 | 4 **GERÇEK→AÇIK/ZARARSIZ** + 1 latent |

### Meta-doğrulama raporları (kendi içlerinde kanonik)

- `BROWSER-TUM-BULGULAR-DOGRULAMA-2026-09-12.md` — 355 eski bulgunun
  kapanış raporu (düzeltme/ret/tasarım/manual dağılımı).
- `AUDIT-KAPANIS-MATRISI-2026-09-12.md` — F1–F10, R1–R7, E1–E13, B-01…06,
  BT-*, K-*, Y-*, T-*, BG-*, DS-* maddelerinin tek tek kararları.
- `BROWSER_BUG_REPORT_89.md` — R92/R93/R95 kümesinin yeniden doğrulaması.
- `BROWSER-RAPORLARI-DOGRULAMA-VE-DUZELTME-2026-09-11.md`,
  `TUM-ONERILER-UYGULAMA-DOGRULAMA-2026-09-12.md`,
  `ALTYAZI-UCDAN-UCA-SERTLESTIRME-DOGRULAMA-2026-09-13.md` — uygulama
  doğrulama kayıtları.
- `KABUL_MATRISI_2026-09-20.md`, `SERVIS_YETENEK_MATRISI_2026-09-20.md`,
  `PUBLIC_HISTORY_AUDIT_2026-09-20.md` — kapı/matris belgeleri.

---

## 5. Kök dizin raporları ("Hata N" serisi + PROGRAM serisi)

Kökte kalan dosyalar kullanıcıya ait tarihsel artefaktlardır (R121 triyajı:
"ürün kodu olarak güvenli kabul edilemez, silinmezler de"). Taşınmazlar;
kararları bu dosyada işaretlenir.

| Dosya | Nitelik | Karar |
|---|---|---|
| `BROWSER_BUG_REPORT.md` + `BROWSER_BUG_REPORT_2.md`…`_24.md` (kök) | eski "Hata N" serisi (Hata 57–~355) | **BAYAT→KAPALI** — tamamı `BROWSER-TUM-BULGULAR-DOGRULAMA-2026-09-12` + `AUDIT-KAPANIS-MATRISI-2026-09-12` ile karara bağlandı: düzeltilenler fix commit'li; reddedilenler FP/tasarım/manual olarak işaretli. Örneklem doğrulaması (Hata 340/341) kapanış kararını bu oturumda teyit etti |
| `BROWSER_BUG_REPORT_107_196.md` (kök) | 6–11 no'lu raporların konsolidasyonu (Hata 107–196) | **YİNELENEN** — aynı 355-küme kapanışının parçası |
| `BROWSER_BUG_REPORT_54.md` (kök) | eski denetim | **BAYAT→KAPALI** — R58 "rapor 54'ün kesin bulguları" olarak güncel ağaçta yeniden doğrulandı; R59'da düzeltildi |
| `BROWSER_BUG_REPORT_56/57.md` (kök) | denetim | **BAYAT→KAPALI** — 355-küme kapanışı + R58–R61 zinciri |
| `BROWSER_BUG_REPORT_62/63.md` (kök) | translation-deep / secret+SSRF denetimi | **GERÇEK→DÜZELTİLDİ** — `report62-translation-deep-fix`, `report63-secret-redaction` (19/19), `report63-ssrf-observer` (7/7) testleri R69'da yeşil doğrulandı |
| `BROWSER_BUG_REPORT_76/77/78.md` (kök, 19 Eylül) | derin denetim | §3.4 — F1 düzeltildi; R78-01 **KISMEN→AÇIK-KALAN**, R78-02 **GERÇEK→AÇIK**, R78-04 kasıtlı tasarım; R84/R85 kanonik harf-kararlarına devredilmiş |
| `BROWSER_BUG_REPORT_106/107.md` (kök, 22 Eylül) | SmartTube denetimi | `docs/raporlar/` _106/_107'den farklı içerik; bulgular R109+ turlarında kapatıldı → **KAPALI** |
| `BROWSER_BUG_REPORT.md` (en eski) `resolvePython` iddiası | — | **FALSE POSITIVE (bayat)** — güncel `main.js` `['python','py','python3']` sırasıyla `spawnSync('--version')` yapıyor |
| `docs/raporlar/PROGRAM_BUG_REPORT_79.md` | performans denetimi | Fonksiyonel bug iddiası yok; kendi elenmiş FP'leri belgeli. P79-02 "her zaman 241" invariant'ı R85 tarafından **FALSE POSITIVE** ilan edildi |
| `docs/raporlar/PROGRAM_BUG_REPORT_80.md` | B80-01/02 | B80-01 settings yedeğinde URL-sırrı **GERÇEK** (R84: D); B80-02 stderr-pipe **KISMEN/latent** (R84: K — normal ffmpeg çağrısında kilit kanıtlanmadı) |
| `docs/raporlar/PROGRAM_BUG_REPORT_81.md` | D81-01…05 + SL | "8/8 doğru" toplu hükmü **R85'te daraltıldı**; D81-01 i18n boşluğu kısmen gerçek ("262 metin" sayısı mekanik tarama, DOM kanıtı değil) |
| `docs/raporlar/PROGRAM_BUG_REPORT_82.md` | B82-01 Invidious parola argv'de | **GERÇEK** (R84: D; R85 öncelik listesinde) |
| `PROGRAM_BUG_REPORT_83/84/85.md` (kök) | hakemlik üçlüsü | §3.1/§3.2 — nihai kararlar R89 + bu oturumun bağımsız testleriyle birebir |
| `DEEP_ANALYSIS_REPORT.md` (kök) | erken-dönem derin analiz | **BAYAT** — Temmuz/Ağustos öncesi refactor; bulgular sonraki turlarda kapandı |
| `tests/r92-deep/`, `_repro/` vb. | prob betikleri | R121: "kırmızı prob sonuçlarının bir kısmı geçersiz varsayımlardı" — test değil, artefakt |

## 6. Şu an AÇIK olan GERÇEK bulgular (konsolide liste)

| # | Bulgu | Kaynak | Seviye |
|---|---|---|---|
| AÇIK-1 | `preview_refresh` koşulu `fix_common_errors`/`drop_repeated_hallucinations`/`snap_to_speech`/dedupe'u kapsamıyor → bayat `previewSegs` → yanlış çeviri iliştirme + hayalet satır + progressive çıktı kirliliği | devin R124-01 | P2 |
| AÇIK-2 | boş `--sync-srt` → `Path('')`=`.` dizin okuma hatası (UI yolu korumalı; el-IPC/CLI savunma notu) | devin R124-02 | P3 |
| AÇIK-3 | `_vtt_to_srt` boş-satırsız kompakt WEBVTT'de cue düşürüyor (Invidious altyazı indirme) | haze R124-01 | P2 |
| AÇIK-4 | `safePageIndexUrl` sorgu+hash'i atıyor → `youtube.com/watch?v=…` ayrımı yok, saklanan URL ölü link | haze R125-01 | P2 |
| AÇIK-5 | `canonicalWatchKey` `file:` yolunu lowercase'liyor → case-sensitive FS'te farklı dosyalar birleşir | haze R125-03 | P3 (Windows'ta görünmez) |
| AÇIK-6 | `StatusCopy.clock(Infinity)` → `"Infinity:NaN"` (burn-in ilerleme etiketi) | haze R125-04 | P3 |
| AÇIK-7 | URL redaksiyonunda `PHPSESSID`, `JSESSIONID`, `AWSAccessKeyId`, `api_token`, `pwd`, `x-auth-token`, `secret_key` hâlâ geçiyor; `;jsessionid=` yol-içi sızıntı | R78-01 kalıntı + R78-02 | P2 |
| AÇIK-8 | Bozuk `browser-skip-segments.json` ilk `data()` çağrısında sessizce `{}`'a düşer; sonraki `save()` bozuk dosyayı `.bak` kopyası olmadan ezer | B-108-11/30 (108_LOCAL) | P3 |

> Not: R125-02 (`process-io.js` stderr) latent kalıyor ama yalnız test
> kullanıyor — üretim yolu `main.js`'in yerel `probeCommand`'ı drenajlı.
> Listeye alınmadı.

## 7. En büyük FALSE-POSITIVE kümeleri (rapor bazında)

| Rapor | FP sayısı/oranı | Not |
|---|---|---|
| `docs/raporlar/BROWSER_BUG_REPORT_68.md` | **34 FP** | En kötü sinyal oranı — v2 derin denetim iddialarının çoğu çürütüldü |
| `docs/raporlar/BROWSER_BUG_REPORT_108_LOCAL_BROWSER_AUDIT.md` | **~17 FP kendi işaretli** | "İncelenen ama yanlış pozitif" (4) + "Yanlış pozitif veya zaten düzeltilmiş" (12) + B-108-19 |
| kök `PROGRAM_BUG_REPORT_85.md` (R95 kümesi) | **9 FP** | R95-03/08/09/10/12/14/15/16/17 bu oturumda bağımsız testlerle de çürütüldü; R89 ile birebir aynı karar |
| `docs/raporlar/BROWSER_BUG_REPORT_69.md` | **11 FP/zaten-doğru** | Raporun kendi özeti: "12 düzeltildi, 11 false-positive/zaten-doğru, 13 ertelendi" |
| `docs/raporlar/BROWSER_BUG_REPORT_49/50/52` | 5+4+4 | Spekülatif turlar; hepsi reddedildi |
| `docs/raporlar/BROWSER_BUG_REPORT_88.md` | — | "Windows-only failures were test-harness artifacts" — ortam FP'si kaydı |
| Eski "Hata N" kök serisi (57–355) | çok | Kapanış matrisi dağılımı: düzeltildi / yinelenen / yanlış-pozitif / tasarım / manuel — madde bazında `AUDIT-KAPANIS-MATRISI` kanonik |
| `docs/security-audit-report-2026-09.md` | başlık iddiası FP | `200.2.x.x` public IPv4 — "6to4 SSRF bypass" önermesi yanlış; gömülü-v4 blokları zaten `browser-manga.js`'te var |

---

## 8. Güvenilirlik notu

Bu matris üç kanıt kaynağını birleştirir: (1) bu oturumdaki canlı probe'lar,
(2) fix commit'lerinin varlığı, (3) önceki kanonik doğrulama raporları.
**Her satırda en az bir kanıt yolu gösterilmiştir.** Kendi SONUÇ işareti
olmayan ve bu oturumda da doğrulanamayan bulgular "BAYAT/DOĞRULANAMADI"
olarak işaretlendi — "gerçek" demek yerine.

---

*Üretim: Devin · `devin/repo-research-2026-09-25` · 26 Eylül 2026*
