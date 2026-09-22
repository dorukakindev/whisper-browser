# PROGRAM_BUG_REPORT_79 — Program geneli derin denetim + performans (2026-09-19 ~14:05)

R78 (tarayıcı tarafı) sonrası kapsam **tüm programa** genişletildi: `backend/*.py` (43 dosya,
19.5k satır), tarayıcı-dışı `src/*.js` (49 modül) ve `src/main.js`. Ürün/test kodunda
**hiçbir değişiklik yapılmadı**; tüm sayılar gerçek modüller koşturularak ölçüldü.

## 0. Özet

| # | Bulgu | Tür | Şiddet/Etki | Kanıt |
|---|-------|-----|-------------|-------|
| P79‑01 | `subtitle_sdh.is_sdh_descriptor` her çağrıda iki sözlüğü + 65 terimlik normalize kümesini yeniden kuruyor: **çağrı başına 66 `_key()`**, 103 µs → 10 µs | Perf | Vardiya başına binlerce çağrı; tek satırlık düzeltmeyle **~10×** | Ölçüm (aşağıda) |
| P79‑02 | `TranslationMemory.lookup` her cümle için **241 `SequenceMatcher.ratio()`**; tek arama **19.5 ms** → 2500 cümlelik işte **~49 s** yalnız hafıza arama | Perf | CPU + gecikme; ucuz ön-kapı ile büyük kazanç | Ölçüm |
| P79‑03 | `fitTranslationParts` DP'si izin verilen en büyük girdide (400 kelime/12 parça) **50–90 ms/çağrı**; işaretçi DP 1.36–1.39× (aynı çıktı), pencereli DP 2.1–2.7× (çıktı değişebilir) | Perf | Yedek (plain-text sağlayıcı) yolu; jank riski | Ölçüm |
| P79‑04 | Anlamsal altyazı araması **her istek için yeni Python süreci** açar ve `SentenceTransformer` modelini **sıfırdan yükler** | Perf | Sorgu başına model yükleme (~saniyeler, yüzlerce MB) | Kod yolu: `browser-media-tools.js:57` + `browser_media_tools.py:main()` |
| C79‑01 | **Test kapsamı:** `backend/` 22 modülün **8'i** hiçbir testte anılmıyor (3'ü alt süreç olarak, doğrulama mantığıyla çalışıyor) | Kapsam | Regresyon körlüğü | Envanter koşumu |
| D79‑01 | R78‑01'in **etki ifadesi düzeltildi** (kapalı sekme geçmişi bellektedir; diske yazan yüzeyler oturum deposu + oturum paketi) ve `browser-sensitive-keys.js:64` → `:67` atıf hatası | Düzeltme | Rapor doğruluğu | Kod izleme (aşağıda) |

**Test durumu:** `npm test` → **GEÇTİ** (Node + Python, `EXIT:0`, kanıt `.tmp/npm-test-r79.log`).

Yeni **işlevsel hata bulunamadı**: bu turda kovalanan 8 adayın tamamı ya kanıtla elendi ya da
kapsam notu olarak bırakıldı (§3). Rapor bu yüzden "bulunan hata" değil "ölçülen darboğaz +
elenen yanlış pozitifler" ağırlıklıdır — bu bilinçli bir tercih.

---

## 1. Ölçülen performans bulguları

### P79‑01 — `is_sdh_descriptor` çağrı başına 66 normalizasyon (backend/subtitle_sdh.py:30)

```python
def is_sdh_descriptor(value):
    key = _key(value)
    if not key or key in _SPEAKER: return False
    normalized_terms = {_key(term) for term in _SDH}      # <-- her çağrıda 65 × NFKD + regex
    if key in normalized_terms: return True
    modifiers = { "soft", ... }                            # <-- her çağrıda yeniden kuruluyor
```

**Ölçüm** (`python _repro/perf-r79_python_hotpaths.py`):

```
'[Music]'      ->  66 _key() cagrisi      (beklenen: 1)
'distant thunder' -> 66 _key() cagrisi
20000 cagri: mevcut 2064.9 ms | hoislanmis 200.4 ms | hiz kazanci 10.31x
is_sdh_descriptor: cagri basina 103.2 us (hoislanmis 10.0 us)
```

**Neden sıcak yol:** `is_structural_sdh_cue` her cue için (`backend/transcribe.py:2015, 2035`),
`strip_sdh_descriptors` ise parantez grubu başına (`:2099` ve tarayıcı yakalama yolunda `:6836`)
çağırır. 2000 cue × (kutu başına 1 grup) ≈ 0.2 s; kutu yoğun içerikte 10 grup/cue ≈ 2 s saf CPU.

**Düzeltme (davranış değişmez, 2 satır):** `_NORMALIZED_TERMS = frozenset(_key(term) for term in _SDH)`
ve `_MODIFIERS = frozenset({...})` modül düzeyine taşınır. Bu dosyada zaten `_FORMAT_TAG`,
`_GROUP`, `_MUSIC` derlenmiş durumda; tek eksik bu iki küme.

### P79‑02 — `TranslationMemory.lookup` cümle başına 241 benzerlik hesabı

`backend/translation_memory.py:169`: aday kümesi `LIMIT 240` ile sınırlandıktan sonra her aday
için `SequenceMatcher(None, kaynak, aday).ratio()` çalışır; eşiği geçen aday **ayrıca**
`fuzzy_semantically_compatible` (tokenizasyon + 5–6 regex taraması + değişen token başına ikinci
bir SequenceMatcher) ile denetlenir.

**Ölçüm** (240 satır aynı `scope`+`context_key`, aynı uzunluk penceresi):

```
tek lookup: 241 SequenceMatcher.ratio() cagrisi | sonuc=MISS
50 lookup: 976.0 ms | lookup basina 19.5 ms
2500 cumlelik bir is icin tahmini: 48.8 s (yalniz hafiza arama)
```

Yani **kaçırılan** bir arama bile 19.5 ms harcıyor (tüm karşılaştırmalar boşa). Öneriler:
1. `ratio()`'dan **önce** ucuz kapılar: token sayısı eşitliği (`fuzzy_semantically_compatible`
   zaten `len(left) != len(right)` istiyor → token sayısı farklı aday baştan elenebilir),
   karakter çoklu-kümesi/Jaccard, ilk-son token eşleşmesi.
2. Şemaya normalize edilmiş token imzası (`source_sig`) ekleyip SQL tarafında filtrelemek;
   `tm_scope_length` indeksi zaten `length(source)` üzerinde.
3. `ORDER BY created_at DESC LIMIT 240` seçiminin en iyi eşleşmeyi kaçırabildiğini belgelemek.

### P79‑03 — `fitTranslationParts` en büyük izinli girdide 50–90 ms

`src/subtitle-sentence-layout.js:248` (yalnız düz metin sağlayıcılarında yedek yol).

**Ölçüm** (`node _repro/perf-r79_js_hotpaths.js`, `node _repro/perf-r79_dp_vs_pointer.js`):

```
  60 kelime /  3 parca ->     1.3 ms
 120 kelime /  6 parca ->     4.5 ms
 280 kelime /  6 parca ->    14.2 ms
 400 kelime / 12 parca ->    89.1 ms   (ikinci koşuda 51–53 ms; makine yüküne duyarlı)

  mevcut (cuts kopyali)   53.3 ms | isaretci (parent) DP 38.2 ms -> 1.39x, cikti AYNI
                                 | pencere (windowed) DP  19.8 ms -> 2.69x, cikti FARKLI
```

**Öneri:** izin verilen üst sınır (`words.length > 400 || count > 12` reddediliyor) korunurken
(a) durum uzayını hedef konum çevresine pencereli sınırlamak 2–2.7× kazandırır ama bölütlemeyi
değiştirebilir → **altın korpus testi olmadan yapılmamalı**; (b) işaretçi (parent) DP 1.36–1.39×
kazanır ve çıktı bit düzeyinde aynıdır → güvenli ilk adım.

### P79‑04 — Anlamsal arama her istekte modeli yeniden yüklüyor

* `src/browser-media-tools.js:57`: `run(pythonPath, [script], input, …)` → `createBrowserMediaTools.python()`
  her çağrıda **yeni süreç** açar (timeout: semantic 300 s).
* `backend/browser_media_tools.py:main()` tek istek okur ve çıkar; `semantic_search` içinde
  `model = SentenceTransformer(MODEL, device="cpu")` **istek başına** kurulur.

Sonuç: her anlamsal sorgu model indirme/yükleme maliyeti + yüzlerce MB bellek. Öneri: NDJSON
protokolü zaten var (`backend/transcribe.py:emit`, `backend/live_asr.py`'nin stdin/stdout NDJSON
döngüsü) → aynı desenle tek süreç + istek döngüsü, ya da en azından model nesnesini süreç içinde
tutup ikinci isteği aynı süreçte karşılamak. (Not: OCR yolu için model yükleme yok; sorun yalnız
`semantic` işleminde.)

---

## 2. Düzeltme: R78 raporundaki iki yanlış ifade (adversarial öz-denetim)

1. **Etki ifadesi.** R78‑01 "kapalı sekme geçmişi + **diske yazılan** oturum" diyordu. Gerçek:
   kapalı sekme geçmişi **yalnız bellekte** (`src/main.js:461` `new BrowserClosedTabHistory(20)`,
   `src/browser-tab-history.js`; `closedTabs` hiçbir modülde serileştirilmiyor). Diske/ paylaşıma
   giden sızıntı **iki başka yol** üzerinden:
   * `src/browser-session-store.js:174` `safePlaceUrl(raw.url)` → `:310` `fsModule.writeFileSync`
     (kalıcı sekmeler),
   * `src/browser-session-package.js:44` `safePlaceUrl(item?.url)` → `src/main.js:13741-13748`
     `dialog.showSaveDialog` + `fs.writeFileSync` (kullanıcıya "dışa aktar" dedirtilen paket).
   **Şiddet (P1) değişmiyor**; yalnız sorumlu yüzeyler düzeltildi.
2. **Atıf.** `startsWithSensitivePrefix` içindeki önek regex'i `browser-sensitive-keys.js:67`'de
   (belirtilen `:64` fonksiyon tanımı satırıydı).

**Ek olarak doğrulanan (yanlış pozitif elenen) iddialar:**
* Overlay `update(value)` durumu **bütünüyle değiştiriyor** (`src/browser-overlay-controller.js:581`
  `state = value || {}`), payload her IPC çağrısında yeni dizi getiriyor → `browserActiveCuesAt`
  önek önbelleğinin bayat yolu **erişilemez** (R78 §3 iddiası doğrulandı).
* `findSubtitleUrls` kırpma yolu: 600 elemanlı dizi + 80 adres girdisiyle koşturuldu → TDZ hatası
  yok, uyarı basılıyor, 64 sınırı uygulanıyor. (Kozmetik: hiç aday yokken "0 adaydan ilk 64
  döndürülüyor" yazıyor — kapsam dışı, dokunulmadı.)

---

## 3. Kovalanıp **elenen** adaylar (yanlış pozitif yapmama kaydı)

| Aday | Neden hata değil |
|------|------------------|
| `browser-translation-cache.js` yazıcı `version: 2`, okuyucu `version === 1` gibi göründü | Okuyucu `[1, 2].includes(parsed.version)` ve v1/v2 kayıt şeklini ayrı ele alıyor (`:19-25`, `:55-60`) → tutarlı; kısmi grep yanılttı |
| `browser-media-tools.py` hata durumunda `exit 0` | Çağıran `result.ok` alanını denetliyor (`browser-media-tools.js:60`) → sözleşme sağlam |
| `live_asr.py:119 emit("stopped")` tüketicisi yok | `proc.on('close')` zaten `live-asr-state {active:false}` yayıyor (`main.js:7745-7757`); bilinmeyen tip sessizce atlanıyor → davranış kaybı yok (ölü protokol yüzeyi, nit) |
| `watch-index.foldSearchText` Türkçe İ/ı sorunu | `NFKC + toLocaleLowerCase('tr-TR') + ı→i` → `İ/I/ı/i` dördü de `i`'ye katlanıyor; R76'nın açtığı sorun bu modülde kapalı |
| `settings-registry.normalizeSearchText` NFKC yapmıyor | Yalnız 26 kayıtlık ayar listesinde kullanılıyor; tam genişlik/ligatür girdi gerçekçi değil → **hata değil**, tutarlılık önerisi (§4/3) |
| `transcribe.py` içinde "hot path'te re.compile" (20 eşleşme) | Hepsi modül düzeyindeki `HALLUCINATION_PATTERNS` listesinin elemanları; bir kez derleniyor |
| `mangaCacheKey` / `legacyMangaCacheKey` sürüm karışıklığı | Yeni anahtar + tek seferlik göç okuması bilinçli (`main.js:6792-6799`), göçte yeniden yazılıyor |
| `pipeline_control.OutputTransaction` rollback/journal | Backup→replace sırası, `existed` ayrımı, `deferred` yolu ve `.tmp` adlandırması tutarlı; kurtarma yalnız doğrulanmış yerel yollara dokunuyor |

---

## 4. Geliştirme önerileri (program geneli)

1. **Kapsam testleri (C79‑01).** Hiçbir testte anılmayan 8 backend modülü:
   `browser_align.py`, `browser_media_tools.py`, `browser_video_analysis.py`, `catalog_scan.py`,
   `ndjson_utils.py`, `nmdb_catalog_import.py`, `separate_dialogue.py`, `workspace_video_package.py`.
   Bunlardan üçü doğrudan güvenlik doğrulaması yapıyor (OCR crop sınırları, base64/8 MB sınırı,
   `valid_cues` zaman aralıkları, `referenceCues` eşlemesi) ve alt süreç olarak çalışıyor →
   en az `ocr_frame` sınırları, `valid_cues` ve `overlap_score` için doğrudan birim testi.
   Öneri: `src/browser-*.js` için zaten kurduğumuz "test referansı yok mu" kontrolünü
   `backend/*.py` ve tarayıcı-dışı `src/*.js` için de CI'da zorunlu kıl.
2. **Ortak "fold" sözleşmesi.** Programda üç farklı arama katlaması var
   (`watch-index` NFKC+tr, `subtitle-find-replace` NFKC+tr ama ı/i kimliğini korur,
   `settings-registry` NFKC'siz + aksan sadeleştirme). Farklar bilinçli olsa da
   tek bir `fold(value, {diacritics, turkishIdentity})` API'si + ortak tablo testi
   sapmayı ve gelecekteki sessiz tutarsızlıkları önler. Ayrıca `settings` yolunun NFKC
   eklemesi tek satırlık iyileştirmedir.
3. **Sıcak yolda sabit küme derlemesi.** P79‑01'in genel dersi: `_SDH`/`_PRONOUNS`/`_MODALS`
   gibi sözlüklerin türevleri fonksiyon içinde kurulmamalı. Aynı taramayı `backend/` genelinde
   otomatikleştirmek için basit bir kural: `def` içinde `{f(x) for x in MODULE_SET}` deseni
   aramak (bu turdaki tek gerçek isabet `subtitle_sdh` idi).
4. **Uzun ömürlü Python işçisi (P79‑04).** Ağır modeller (SentenceTransformer, faster-whisper)
   istek başına yükleniyor; NDJSON işçi deseni zaten mevcut → aynı desenle tek süreç, istek
   kuyruğu ve model önbelleği. Kazanç: sorgu başına saniyeler ve yüzlerce MB.
5. **Benzerlik aramasında ucuz-kapı sırası (P79‑02).** `ratio()` → `fuzzy_semantically_compatible`
   sırası tersine çevrilebilir: önce token sayısı Jaccard'ı yüksek olanlar, sonra `SequenceMatcher`.
   Aynı kalite, çok daha az CPU.
6. **Ölçüm tabanlı bütçe testi.** `fitTranslationParts` için altın korpus (girdi → beklenen
   bölütleme) + süre bütçesi testi; pencere optimizasyonu ancak bu test yeşilse uygulanabilir.

---

## 5. Kapsam ve sınırlar

* Electron smoke/soak seti bu turda koşulmadı (R77'deki ortam `ELECTRON_RUN_AS_NODE` sızıntısı +
  `-smoke.js` envanter boşluğu hâlâ açık).
* `backend/transcribe.py` (8169 satır) tam okunmadı; hedefli taramalar (emit protokolü, re.compile
  yerleşimi, SDH çağrı noktaları, `json.dump(..., allow_nan=False)`) yapıldı.
* `backend/invidious.py`, `backend/youtube.py`, `backend/media.py` bu turda yalnız grep düzeyinde
  tarandı (mevcut test dosyaları geniş: 566/254 satır).
* R76/R77'den hâlâ açık: DRM `mediaKeySystem` izin zinciri, `details.mediaTypes`, `'ask'` üç
  durumlu kontrol işleyici, smoke envanteri, çeviri kanalı senkron yarışı.
* Çalışma ağacında başka oturumların dosyaları var (`DEVIR-NOTU.md`, `_repro/` artıkları dahil);
  hiçbirine dokunulmadı, hiçbir şey stage edilmedi.

## 6. Yazılan dosyalar

* `PROGRAM_BUG_REPORT_79.md` (bu rapor)
* `_repro/perf-r79_python_hotpaths.py` — SDH + çeviri hafızası ölçümü
* `_repro/perf-r79_js_hotpaths.js` — `fitTranslationParts` maliyeti + bul/değiştir invaryantları
* `_repro/perf-r79_dp_vs_pointer.js` — işaretçi/pencere DP karşılaştırması (çıktı eşitliği dahil)
* `docs/devir/2026-09-19-1405.md` — devir notu
* `.tmp/npm-test-r79.log` — tam test koşumu kanıtı (`EXIT:0`)
