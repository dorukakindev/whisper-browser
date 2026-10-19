# Rapor464 — Daha derin koşulabilir denetim turu (131 koşum: Node davranış/fuzz + Python saf-fonksiyon matrisleri + gerçek-konuşma uçtan uca + tam paket envanteri)

Tarih: 2026-10-18 · Başlangıç kodu: `7eb6a5b7` · Bitiş kodu: (dokümantasyon commit'i sonrası devir notunda) · Kod değişimi: **yok** (yalnız `docs/raporlar/` + sayaç + devir notu)

> **Numaralandırma kaydı:** Bu tur sırasında paralel bir oturum 463 numarasını `a196064c`+`7eb6a5b7` ("salt-okuma 50-görev denetim + 16 bulgu") aldı. Çakışmayı önlemek için bu rapor **464** olarak yazıldı. İki raporun bulgu alanları çoğunlukla ayrıktır; ortak kök olan test kırmızısı (aşağıda Y-1) 463-01'e **ek kanıt** düzeyinde referans verir.

## Yönetici özeti

Ürün kodunu değiştirmeden **131 koşulabilir probe** koşuldu: Node davranış/fuzz (78), Python saf-fonksiyon ve sınırlama matrisleri (46), gerçek-konuşma klipli uçtan uca backend koşum + CLI sözleşmesi (4), tam `npm test` envanteri (1), doğrulama/yalıtım (repro) zinciri (2). Sonuç:

| Sınıf | Adet |
|---|---|
| KESİN ürün bulgusu (düzeltme ister) | **1** (Y-1) |
| DÜŞÜK-ORTA bulgu (kesin davranış riski) | **1** (Y-2) |
| DÜŞÜK tekil davranış | **5** (Y-3, Y-4, Y-7, Y-9, Y-10) |
| BİLGİ / teyit (sözleşme-tasarım katkısı) | **5** (Y-5, Y-6, Y-8, Y-11, Y-12) |
| Olumlu teyit | 20 kalem (§ F) |

Tam `npm test`: **549 dosya (478 Node + 71 Python), 1 kırmızı** — `tests/subtitle-sentence-layout.test.js` ("Zero duration" fixture'ı, Y-1). 451 turundaki 11 başarısız dosya envanterine göre: **10 başarısızlığı bu arada başka oturumlarca düzeltildi**; kalan tek kırmızı yeni (Y-1).

## Yöntem

| Betik (yalnız temp, repo-dışı) | İçerik | Koşum |
|---|---|---|
| `_d3_node.js` | Node modül davranış/fuzz: normalizeCues property-fuzz (800 girdi), canonicalLocalPath kenar tablosu, atomic-json io-hata enjeksiyonu, queue-persistence kaba-fuzz, window-state fuzz, yt/korpus/alignment/chapters/note-store vb. | 54 |
| `_d3b_node.js` | Node rafineler: escapeHtml bağlam sayımı, stableJson sıra duyarlılığı, compound redaction, session tab reddi, scanFolder/session gerçek yazım, calibrateCueTimeline, normalizeCues drop katalogu | 16 |
| `_d3c_node.js`, `_d3d_node.js`, `_d3e_node.js` | C serisi: movieHash ilk koşum, session şekil, vm buildOptsFromUI ilk deneme, ndjson ilk çözüm + `_d3d` ndjson-buffer tür düzeltmesi + `_d3e` Y-4 kontrat yeniden sayımı | 6 |
| `_d1_py.py` | Python boru-hattı derinlik: wrap/split/normalize/merge çoğul-fuzz, yazıcılar (ASS/VTT/SRT), cache-key, reexport, emit sözleşmesi, 5 ton/audio CLI koşumu (E2–E6) | 21 |
| `_d1b_py.py` | Python rafineler: gerçek imza keşfi (inspect), cache-key yeniden tasarım, reexport determinizmi, subprocess-düzgün takip | 8 |
| `_d1c_py.py` | wrap ihlal ornekleme, split imza tablosu, uçtan uca kök-sebep ayrıntısı, perf, idempotans | 10 |
| `_d1d_py.py` | segment-nesnesi gerçek koşum, wrap mod-farkı, çift-koşum idempotans ölçümü, NUL passthrough, repo içi konuşma-fabrikası arama | 7 |
| `_d1e_py.py`, `_d1f_py.py`, `_d1g_py.py` | gerçek konuşma `clip.mp4` e2e serisi: formatlar, geçerli/geçersiz suffix, determinizm, clip-offset | 4 |
| inline teyitler | movieHash spec-eşleşme (bağımsız hesap `00407fc00040f007`), sessionTab URL-variant tablosu (`browser:` → 0 sekme, düz `https` → 1) | 2 |
| `_r_zero2.js` + fixture çıkarımı | "Zero duration" yalıtım + izole repro + kontrol varyantı | 2 |
| `npm test` (tam paket) | 549 dosya envanteri (478 Node + 71 Python) | 1 |
| | **Toplam** | **131** |

Sabitler: deterministik PRNG (seed 4601/4603/4607/4609/46011), kanıt klasörleri `C:\Users\K\AppData\Local\Temp\wbd*` ve `wbx461-rXA6ci`, **repo'ya test yazımı yok**.

## A. Gerçek-konuşma uçtan uca doğrulama

Kaynak: `docs/raporlar/r114-evidence/a-real-transcribe/clip.mp4` (30,95 s konuşma).

| Sınama | Sonuç | Kanıt |
|---|---|---|
| G1 determinizm: aynı argümanla iki koşum | **byte-aynı** (553 B) — SRT çıktısı deterministik | `clip-whisper-abcd.srt` iki-klasör |
| G2 dil algılama | `en` p=0,997; `duration: 30.95` doğru | `language` olayı |
| G2 SRT biçemi | BOM mevcut; zaman satırı örneği `00:00:00,224 --> 00:00:06,760` | G1/Parser |
| G3 clip `0.8–1.8` kesmesi | segment `start: 0.8` — **time_offset kesin uygulandı** | `clip.json` |
| Performans | 30,95 s ses → ~2,0 s işlem (tiny CPU, ~15,3× reel-zaman) | `perf` alanı |
| NDJSON → Node sözleşmesi | üretim `createNdjsonLineBuffer` ile 29 olay / 8 tip (log 13, status 4, language 1, segment 5, progress 3, preview_refresh 1, quality_report 1, done 1) | `A.stdout.txt` |

Ayrıca: geriletilmiş `--output-name-suffix=-dbl` girişi "Geçersiz aşamalı çıktı kimliği" hatasını verir (Y-10); geçerli biçim (`-whisper-abcd`) ile 4 format (srt/vtt/json/ass) + düşük-güven raporu (`clip-whisper-abcd.dl-guven.txt`) üretildi.

## B. Python boru-hattı derinlemesi

- `wrap_text(text, max_line_width=20..60, max_lines=1..3, language='tr', wrap_mode='char|sentence')` — 640 fuzz'ta satır-sayısı ihlali 0; genişlik **fail-open** (Y-9).
- Split imza tablosu: `split_segment_by_punctuation(segment, max_chars=84)`, `split_segment_by_timing(segment, min_gap=0.5, target_chars=110, hard_max_chars=200, max_words=22)`, `split_segment_sentence(segment, hard_max_chars=220, soft_max_chars=84, **kwargs)`, `split_subtitle_language_suffix(stem)` — **nesne `segment.start/.end/.text` bekliyor**; pozisyonel `(start, end, text)` çağıran her harici test TypeError alır (bu turda — bizim ilkel sayımlar da).
- `normalize_timings` 150 seçmeli-fuzz: çıktı sıralı, `end≥start`, `start≥0`; NaN/negatif pivotlar içsel çözülür (min_gap=0,08).
- `parse_timecode`: `'' → None` (sessiz, raise yok); `1:02→62.0`, `01:02:03.5→3723.5`, `90→90.0` doğru; `1:2:3.4.5`, `abc` → ValueError. Boş-kalır-asimetri Y-12.
- `format_srt_time` uçlar: `-0,001 → 00:00:00,000` (sıkıştırma), `359999,5 → 99:59:59,500` (yuvariama), `86400 → 24:00:00,000`.
- `merge_short_entries` idempotent (D5 PASS); ama `normalize_timings`+`merge_short_entries` **çift koşum idempotent değil** (Y-3).
- `collapse_repetition` idempotans uyumu: 150 fuzz'ta `has_repetition_loop(collapse(x))` kalanı < %4.
- `translate_cache_key`: 200 tekil metin → 200 benzersiz anahtar; `context_before/after` değişimi anahtar değişimi üretir (463-11/463-12'den bağımsız yol).
- `reexport_from_json`: `SimpleNamespace` tam alan diziniyle **iki koşum byte-aynı**; ters-zaman segmenti `RuntimeError("JSON'da yazılabilir segment yok.")` ile reddedilir (sessiz kabul yok).
- Yazıcılar: `write_ass` başlık `[script info]` + `[v4+ styles]` + `alignment`; `write_vtt` `WEBVTT` üstbilgi blok-yapı — sağlıklı.
- Perf: 4000 segment normalize+merge **0,01 s**; gerçek klip tiny CPU ~15,3× RTF.
- Y-11: CLI iki-parça (`--output-name-suffix -dbl`) → argparse "expected one argument" (exit 2); bağlı biçim (`--flag=değer`) geçer. main.js `pushBoundOption` gerekçesinin CLI-düzeyde **doğrudan teyidi** (451-N1 izi).

## C. Node modül derinlemesine

- atomic-json io-hata enjeksiyonu (bizim io stub'ı): `writeFileSync→EACCES` → temiz fail; hedef dosya ve `.tmp` artığı **yok** (X4). `renameSync→EXDEV` dışarı fırlar — `renameSyncResilient` yalnız paylaşım/hata-yeniden-denenme yollarını kapsıyor (Y-8).
- queue-persistence: `normalizeQueueItem` bozuk 5 şeklin tümünü `null`'a indirir (X9); gelecekteki `version: 999999` → `version=1, items=0` dönüşümü (X47); `validateQueueOptions` 2 MiB seçenek-değerini sessiz kabul eder (MAX_QUEUE_OPTIONS_BYTES=524288 kısıtı bu kapıdan zorlanmadı — bildirimin diskeye geçiş kapısı ayrı, kaynak kapısı boş).
- window-state: `windowStateForDisk`/`clampedWindowSize` 8 başarısız girdi (null/NaN/1e9/dize) — 0 throw (X6).
- `canonicalLocalPath` kenar tablosu: UNC (`\\server\pay\…`) → redd; drive-göreli `C:foo.srt` → redd; `mix`/300+ karakter/`isim..srt` → normalizes/kabul; derin `..` zinciri `D:\x.srt`'e daralır.
- ipcMain **231 kanalın tümü tekil** (tekrarlı kayıt yok, X45); renderer `index.html` **inline `on*= 0` + CSP etiketi** (X38).
- `assertSafeJsonFile` yalnız yol-politikası (mutlak `.json`, symlink reddi). **Proto-zinciri savunması `scanJsonShape`'te** (`DANGEROUS_KEYS` `__proto__/prototype/constructor`, settings-security.js:165-177) — B8 başlıklı erken alarmim hedef-tutarsızlıktı; kesin durum PASS (savunma gerçekte import zincirinde).
- `normalizeSessionTab`: `browser:`-şemalı URL'ler `safePlaceUrl`'den (yalnız http/https) geçemez → sekme düşer. **Disk formatı asla `browser:` öneki taşımaz** (main.js `browserTabSnapshot` WC.getURL yolu) → tutarlı sanitizasyon; C2/B6b göstergeleri ve inline variant tablosu ile çözümlendi (Y-14 bilgi — raporda kayıtlı, kusur değil).
- Diğer kapsamlar: `scanFolder` gerçek temp ağacı (S01E01 adlandırma) beklenen sekme; `calibrateCueTimeline` 2-cue uyumda `accepted:true offset:0.5 matches:2 spread:0`; `mergeBrowserChapters` sıralı çıkış; `candidateSignals` ilgisiz aday için 0 skor; `mergeWatchItems` birleştirmede `firstWatched` küçük, `lastWatched` büyük, başlık yeni taraftan, oturumlar birleşik (X36).

## D. 459-Y-4 kapanış kanıtı (vm buildOptsFromUI + tam kontrat)

Renderer'daki `buildOptsFromUI` gerçek gövdesi (ReferenceError/TypeError otomatik-stub döngüsü) vm'de koşuldu: **90 anahtar üretti**. `main.js` `transcribe:start` bloğunun okuduğu `options.*` ad sayısı **109**:

- Handler'da okunan ama buildOptsFromUI'nin üretmediği **22 ad**; bu 22'nin **14 adı renderer.js metninde aslında hiç geçmiyor** (kesin liste):
  `explainIndex, explainKind, explainTranslation, explainWord, jobId, outputNameSuffix, queueItemId, reexport, syncMaxShift, syncSubs, translateCueRange, translateExisting, translateOnly, translateVariantLabel`
- Kalan 8 ad (`chat, explain, input, skipHistory, syncFixFramerate, syncPiecewise, syncSrt, youtube`) renderer'da başka gönderim yollarından gelir (chat/açıklama diyaloğu, senkron diyaloğu, YouTube akışı, kuyruk zarfı).

**Sonuç (459-Y-4 kesin kapanış):** çok-kanal gönderim **tasarımla var**; adresi belirsiz option riski yok. `jobId/queueItemId/reexport/translateOnly/sync*/explainIndex/explainKind/translateVariantLabel/outputNameSuffix` main veya arka-plan işleyici katmanı üretiyor.

## E. Bulgu tablosu (numaralar bu raporun alanıdır; 459-Y serisinden bağımsız)

| # | Özet bulgu satırı | Şiddet | Kanıt |
|---|---|---|---|
| Y-1 | **`browser-translation-scheduler.normalizeCues` ms-yuvarlama filtresi sıfır-süreli cue'ları tümüyle düşürüyor; `assembleCueSentences` gruplaması eski sözleşmeden sapıyor.** 451-envanterine göre yeni kırmızı; 463-01 ile aynı kök — bize ilaveten: filtre satırı (`Math.round(end*1000) > Math.round(start*1000)`), giriciliği `6b713240` (2026-10-18), izole repro: `entries [[0,1,'a'],[1,1,'b'],[1,2,'c.']]` → gruplar `[[0,2]]` (beklenen `[[0],[1],[2]]`); 1 ms'lik süre değişimi tüm üçünü birleştirir `[[0,1,2]]` → grup/birleşme eşiği ms-düzenleme sınıfından kaynaklanıyor | **KESİN** | npm test + `_r_zero2.js` |
| Y-2 | **`clean_text` NUL (`\u0000`) ve ZWNJ (`\u200b`) karakterlerini temizlemez → NUL `write_srt` çıktısına passthrough** — bozuk veri/LLM çıktısında oynatıcı bozulması riski. Yalnız NBSP temizleniyor | DÜŞÜK-ORTA | T6, U4 |
| Y-3 | `normalize_timings`+`merge_short_entries` çift koşum idempotent değil: 200-segment zincirinde item#49 start `80.95 → 82.80` (+1,85 s). Ürün akışı çift koşum yapmaz (tek geçiş) — sözleşme zayıflığı | DÜŞÜK | U3 |
| Y-4 | `normalizeChapter({start:1,end:0.5})` ters aralığı **kabul ediyor ve koruyor**; `mergeBrowserChapters` sıralı yayımlıyor. Cue-yaşamında (browser-subtitles) `end<start` onarması var, bölüm-tarafında yok — tutarsızlık sınıfı (459-Y-2 kuzeni) | DÜŞÜK | B5 |
| Y-5 | `escapeHtml("javascript:alert(1)")` giriş metnini **değiştirmeden** döndürür. Renderer'da `href/src/anchor` öznitelik bağlamında escapeHtml **0 kullanım** + CSP `script-src 'self'` ikinci savunma → bugün zarar yolu yok; ileride `href=${escapeHtml(url)` deseni yazılırsa kapı açılır — önleyici `escapeHtmlUrl` sapı önerilir | BİLGİ (gelecek-kapanış) | B1 |
| Y-6 | `watch-library-store.stableJson` adına rağmen **key-sıra duyarlı** (`{b:1,a:2}` ≠ `{a:2,b:1}` bytes). Kodda kullanımı aynı-nesne transform-karşılaştırması (drift) — anlık zarar yok; **adlandırma yanıltıcı** | BİLGİ | B2 |
| Y-7 | 9693e9f1 sonrası URL-**değer** içinde `api_key` query-paramı temizlenir (B4 PASS); ama fabrika-adı listesi dışı **`authorizationHeader`, `credentialsBlob`, `someTokenPlain`, `urlQueryToken`** gibi uydurma adlar redaksiyon dışında kalıyor (gerçek üretim adları kapsamda) — ileri-dönem koruması için compound-ad kuralını genişlet | DÜŞÜK | B4/B4b |
| Y-8 | atomic-json `renameSync` `EXDEV` (farklı hacim) hatasını dışarı fırlatır; yeniden-denenme yok (`renameSyncResilient` yalnız paylaşım/erişim hatalarını dener). Windows mirror-backup aynı-hacimde olduğu için pratikte nadir | BİLGİ | X4b |
| Y-9 | `wrap_text` genişlik **fail-open**: sığmadığında geniş taşma satırı bırakır — `max_lines=1` + w=47 için üretilen satır **176 karakter**; 240 fuzz'ta 158 genişlik ihlali. Üst katman (split) genel sözcük/char sınırını taşır; yalnız aşırı uzun girdide tek-geniş-satır riski | DÜŞÜK | T1/U2 |
| Y-10 | CLI `--output-name-suffix` biçim gerektirisi **`-whisper-[a-z0-9-]{4,48}`**; dışı herhangi değer "Geçersiz aşamalı çıktı kimliği" hata-olayı üretir ve mesaj **biçim gereksinimini açıklamaz** (`-dbl` gibi kısa değerlerin reddi DX yüküdür) | DÜŞÜK (teşhis/dx) | d1e/d1f repro |
| Y-11 | CLI iki-parça (`--flag değer`) formu argparse'ta `expected one argument` (exit 2); bağlı form (`--flag=değer`) geçer. JS tarafı `pushBoundOption` ile korumalı (451-N1 izi) | BİLGİ/teyit | E4 |
| Y-12 | `parse_timecode('') → None` sessiz; diğer bozuk dize girdileri raise — boşluk-yolu (varsayılan `clip-start/clip-end`) ile uyumlu ama asimetri kayda değer | BİLGİ | S4 |

**Y-1 (KESİN) düzeltme önerisi:** ms-yuvarlama filtresini `≥ ...` eşitlikten geçiren (sıfır-süreli koru) ya da sıfır-süreli cue'ları tamamen reddeden TUTARLI bir politika + `distributeTranslation` tarafında düşme-sayımını gösterecek uyarı. 463-01 aynı kökü işaret ediyor; bu rapor yalnız **girici commit (`6b713240`) ve 1 ms-kontrast repro** ekliyor.

## F. Olumlu/sağlamlık teyitleri

| Alan | Beklenti | Kanıt |
|---|---|---|
| movieHash (opensubtitles) | spec-eşleşme: 100 KiB+7 bayt dosya, **`00407fc00040f007` = bağımsız hesapla aynı** | C1b |
| reexport determinizmi | iki koşum byte-aynı | S6 |
| gerçek klip determinizmi | iki koşum byte-aynı + BOM + dil `en` + ~15,3× RTF | G1/G2 |
| clip time_offset | 0,8–1,8 → segment start 0,8 tam | G3 |
| cache-key tasarımı | 200 tekil metin → 200 benzersiz anahtar + bağlam parametresi duyarlılığı | S5 |
| `merge_short_entries` idempotans | ikinci koşum sabit | D5 |
| `collapse_repetition` | `has_repetition_loop(collapse(x))` < %4/150 | D6 |
| 4 ton/BOŞ girdi CLI koşumu | hata yok, hallucination referansı yok | E5/T3 |
| geçersiz model CLI | temiz hata-eventi, **traceback sızımı yok** | E6 |
| ters-zaman reexport | `RuntimeError` reddi (sessiz kabul yok) | D16 |
| atomic-json EACCES | temiz fail; hedef+`.tmp` artığı yok | X4 |
| window-state fuzz | 8 başarısız girdide 0 throw | X6 |
| `normalizeQueueItem` bozuk şekiller | 5/5 → `null` reddi | X9 |
| gelecek sürüm queue snapshot | `version→1` dönüşümü (kabul politikası) | X47 |
| ipcMain kanalları | 231 kanal tekil | X45 |
| `index.html` | inline handler **0** + CSP etiketi var | X38 |
| proto-zinciri savunması | `scanJsonShape` DANGEROUS_KEYS ile import zincirinde | settings-security.js:165-177 |
| normalizeSessionTab | `browser:`-reddi disk-format tutarlılığı (WC.getURL https) | C2 + inline variant |
| `calibrateCueTimeline` | 2 uyumlu cue → accepted, offset 0,5 | B10 |
| subtitle-pair-quality | fluency matrix + benzerlik karşılaştırması çalışıyor | X29/X29b |
| URL-değer redaksiyonu (9693e9f1) | `api_key` query-paramı değerden temizlenir | B4 |

## G. Tam `npm test` envanteri

- **549 dosya (478 Node + 71 Python), tek koşum; başarısız 1 dosya** — `tests/subtitle-sentence-layout.test.js` ("Zero duration", Y-1/463-01). Zaman: ~10 dakika.
- **451 envanterine göre pozitif kayıt:** 451'deki 11 başarısız dosyadan **10'u artık geçiyor** (audit-tur4, browser-create-translate-default, browser-youtube-whisper, validation, browser-store-deadzone, misc-exports-deadzone, ci-determinism-ratchet, coverage-map, unicode-paths, report73-player-ab-search — ipc-parity dahil). Yani bu arada aracı oturumlar 10 boyı düzeltmiş; yenisi yalnız Y-1.

## H. Sınırlar (koşulmayanlar)

- Electron gerçek pencere, GPU/CUDA/DRM, Windows `start.bat`/PowerShell akışı — koşulmadı (backend CLI voltajı doğrudan koşuldu).
- preload-stub API envanteri (`_d4_preload.js` taslak) koşum penceresi kapandı — 451 turundaki 245-invoke sayımı hâlâ geçerli sayılıyor; bu turda yeni ölçüm yok.
- Gerçek sağlayıcı çağrısı (LLM/HF/embedding) yok; mock-başarı kalite-kanıtı değildir (AGENTS kuralı).
- Ton/sessiz-audio e2e'leri yalnız **boş-koruma kolu**; mesajlar gerçek-konuşma girdisiyle anlam taşır.
- `npm run test:electron-bridge` ve soak test paketleri bu turda koşulmadı.

## I. Önerilen düzeltme sırası (uygulanmadı — sıradaki oturumlara)

1. **Y-1** `browser-translation-scheduler.normalizeCues` filtresi ve gruplama sözleşmesi (463-01 ile birlikte; küçük diff).
2. **Y-2** `clean_text` kontrol-aralığı (\u0000–\u0008, \u000b–\u001f, ZWNJ, soft-hyphen) + `write_srt`/`write_vtt`/`write_ass` güvenlik filtresi.
3. **Y-10** suffix format hata mesajına izinli desen bilgisi ekleme (tek satırlık dx).
4. **Y-7** `SECRET_OPTION_KEYS` compound-ad genişletmesi (kural tek doğrulamalı).
5. **Y-4** `normalizeChapter` `end<start` sıkıştırma/kural belgelemesi.
6. **Y-3 / Y-8 / Y-9 / Y-6** davranış kararı + belge satırı (düşük).

## Ek — kanıt komutları

```bat
:: Python: saf-fonksiyon + uçtan uca
backend\venv\Scripts\python.exe -X utf8 C:\Users\K\AppData\Local\Temp\opencode\_d1_py.py
backend\venv\Scripts\python.exe -X utf8 C:\Users\K\AppData\Local\Temp\opencode\_d1d_py.py
backend\venv\Scripts\python.exe -X utf8 C:\Users\K\AppData\Local\Temp\opencode\_d1g_py.py
:: Node: modül davranış/fuzz
node C:\Users\K\AppData\Local\Temp\opencode\_d3_node.js
node C:\Users\K\AppData\Local\Temp\opencode\_d3b_node.js
node C:\Users\K\AppData\Local\Temp\opencode\_r_zero2.js
:: Tam paket
npm test
```

Kanıt dizinleri: `C:\Users\K\AppData\Local\Temp\wbx461-rXA6ci\` (X), `wbd461-eelwekji\` (D/E), `wbd463-HBwVHE\` (B), `wbd463-lzib5agq\` (S), `wbd463c-fkwdf87a\` (T), `wbd463d-mta59636\` (U), `wbd-g-xbec0vr4 + wbd-h-b6rq7voe + wbd-i-9z16f9_7\` (G), `wbd463n-dXcw80\` (C), `wbd463e-mj1str1x\` (suffix sözleşme), `wbd463f-exhux177\` (keşfi).

Devir kaydı: `docs/devir/2026-10-18-0615.md`.
