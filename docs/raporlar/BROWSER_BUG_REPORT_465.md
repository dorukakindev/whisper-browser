# Rapor465 — 463/464'ten bağımsız 50 görevlik ikinci derin tarama

**Tarih:** 2026-10-18
**Depo:** https://github.com/dorukakindev/whisper-browser
**Dal:** `codex/browser-whisper-progress-20261014`
**Ürün kodu:** Bu oturumda **değiştirilmedi**. Oturum başladığında çalışma ağacında
başka bir oturumdan gelen 10 dosyalık düzeltme seti vardı; bu sete dokunulmadı.
**Bu raporun kapsamı:** 463 ve 464'te işlenen bulguların tekrarı değil; dublaj,
sayfa arşivi, çeviri kalite devre kesicisi, bütünlük raporu, adres tamamlama,
medya geçici dosyaları, dublaj örnek planı ve PDF sayfa seçimi.

## Yönetici özeti

- İlk tam `npm test` (oturum başı): **549 dosya**, tek kırmızı
  `tests/docs-index-integrity.test.js` — `BROWSER_BUG_REPORT_464.md` INDEX'te yoktu.
  (Paralel oturum INDEX'e 464'ü ekledi; hedefli test geçti. Bu turda 465 de eklendi.)
- Hedefli testler: `subtitle-sentence-layout`, `settings-security`,
  `report456-regressions`, `browser-address-model`, `docs-index-integrity` → geçti.
- **Nihai tam `npm test`:** 549 dosya, **0 kırmızı**, "Tüm testler geçti".
- 8 yeni bulgu: 1 orta-yüksek, 2 orta, 2 düşük-orta, 3 düşük.
- En önemlisi: **dublaj/SRT araçları yalnız UTF-8 okuyor**; cp1254/UTF-16 Türkçe
  altyazıda metin U+FFFD'ye dönüşüyor ve TTS bozuk metni seslendiriyor.

## Yöntem ve 50 görev

| # | Görev | Sonuç |
|---|---|---|
| 1 | HEAD, dal, çalışma ağacı ve paralel düzeltme seti | 10 dosya değişik; dokunulmadı |
| 2 | Tam `npm test` ilk koşu | 1 dosya kırmızı (docs INDEX 464) |
| 3 | Hedefli testler (layout/settings/report456/address/docs) | Geçti |
| 4 | Sözdizimi (değişen JS/Python) | 0 hata |
| 5 | Test envanteri ve kapsam haritası | 549 dosya |
| 6 | Dublaj SRT kodlaması (cp1254/UTF-16) | 465-01 |
| 7 | Dublaj örnek (`sample`) planı ve düzenlemeleri | 465-07 |
| 8 | Dublaj arka plan aralık/limit | Temiz (mevcut testler) |
| 9 | Dublaj iptal/artefakt temizliği | Temiz (mevcut testler) |
| 10 | Dublaj TTS zamanlama/senkron | Temiz (`test_dub_timing`) |
| 11 | PDF sayfa seçimi | 465-08 |
| 12 | PDF durum kurtarma | Temiz |
| 13 | PDF OCR | Temiz |
| 14 | Manga görsel SSRF/DNS pinleme | Temiz |
| 15 | Manga OCR önbelleği | Temiz |
| 16 | YouTube hesap göçü | Temiz |
| 17 | YouTube TV modu | Temiz |
| 18 | YouTube reklam koruması | Temiz |
| 19 | SponsorBlock | Temiz |
| 20 | Tarayıcı indirmeleri | Temiz |
| 21 | Canlı ASR dil değişimi | Temiz |
| 22 | Canlı ASR RTF izleyicisi | Temiz |
| 23 | Worklet yeniden örnekleme | Temiz |
| 24 | CEA yakalama | Temiz |
| 25 | DASH/HLS yakalama | Temiz |
| 26 | İzleme kütüphanesi kapanış/eşzamanlılık | Temiz |
| 27 | Medya relink/mükerrer bulucu | Temiz (Türkçe İ durumu ayrıca elendi) |
| 28 | Medya kataloğu | Temiz |
| 29 | Geçmiş/kuyruk | Temiz |
| 30 | Notlar/okuma listesi | Temiz |
| 31 | Altyazı bul/değiştir | Temiz |
| 32 | Düzenleme geçmişi | Temiz |
| 33 | Timeline kurtarma | Temiz |
| 34 | Altyazı çifti kalitesi | Temiz |
| 35 | Dışa aktarma doğrulaması | Temiz |
| 36 | Sayfa çeviri arşivi URL kimliği | 465-02 |
| 37 | Tarayıcı oturum paketi | Temiz |
| 38 | Çalışma alanı paketi | Temiz |
| 39 | Oturum gizliliği | Temiz |
| 40 | Sekme kaynak bütçesi | Temiz |
| 41 | Model yöneticisi | Temiz |
| 42 | GPU tanılama | Temiz |
| 43 | Ağ bütçesi | Temiz |
| 44 | CSP/gezinme | Temiz |
| 45 | Unicode/Windows yolları | Temiz |
| 46 | Erişilebilirlik/i18n | Temiz (mevcut testler) |
| 47 | Fuzz/dayanıklılık | 465-03/04 |
| 48 | Performans | 465-05/08 |
| 49 | Nihai tam koşu | Rapor sonunda |
| 50 | Rapor + devir + INDEX | Tamamlandı |

## A. Bulgular

### 465-01 — [ORTA-YÜKSEK] Dublaj/SRT araçları yalnız UTF-8 okuyor; cp1254 ve UTF-16 bozuluyor

**Konum:** `tools/voxcpm2/dub_plan.py:16-19` (`parse_srt`), kullanım
`tools/voxcpm2/altyazi_oku.py:337-338`, `tools/voxcpm2/prepare_background.py:55`;
karşılaştırma: `backend/transcribe.py:9224` (`read_subtitle_text`, utf-8-sig →
cp1254 → latin-1 + onarım).

**Ne oluyor:** `parse_srt` yalnız `data.decode("utf-8-sig", errors="replace")`
kullanıyor. cp1254 Türkçe SRT'de ş/ğ/ı/ü baytları geçersiz UTF-8 olduğu için
U+FFFD'ye dönüşüyor. Aynı dosya normal altyazı yolunda `read_subtitle_text` ile
doğru okunuyor; dublaj yolu bu onarımı kullanmıyor. UTF-16 BOM'lu SRT de aynı
şekilde çözülemiyor.

**Kanıt (cp1254 baytları, gerçek `parse_srt`):**

```text
1
00:00:01,000 --> 00:00:02,000
Merhaba dünya. Çalışma

parse_srt -> [(1000, 2000, 'Merhaba d[U+FFFD]nya. [U+FFFD]al[U+FFFD][U+FFFD]ma')]
UTF-16LE BOM'lu aynı SRT -> []   (zaman satırı bile bulunamıyor)
```

**Etki:** Türkçe eski altyazıyla dublaj planı/TTS bozuk metin üretir; kullanıcı
hata görmez. Arka plan ayırmada yalnız zamanlar kullanıldığı için ses tarafı
etkilenmez, fakat dublaj metni ve TTS telaffuzu bozulur.

**Öneri (uygulanmadı):** `parse_srt` okumasını `transcribe.read_subtitle_text`
ile aynı kodlama sırasına/onarıma bağla; en azından cp1254 ve UTF-16 BOM desteği ekle.

### 465-02 — [ORTA] Sayfa çeviri arşivi hash-route'ları ayırt etmiyor; çeviri kayboluyor

**Konum:** `src/browser-translation-archive.js:28-44` (`canonicalPageUrl`),
`:249-250` (`savePage`), `:295-296` (`findPage`).

**Ne oluyor:** `canonicalPageUrl` `url.hash = ''` yapıyor. SPA hash-route'ları
(`https://example.com/#/watch/1`, `#/watch/2`) aynı `https://example.com/`
kimliğine çöküyor. Oysa `src/browser-media-identity.js` ve oturum geri yükleme
hash-route'u içerik kimliği olarak koruyor.

**Kanıt (gerçek sınıf, geçici dizin):**

```text
savePage(#/watch/1, "Merhaba bir.")
savePage(#/watch/2, "Merhaba iki.")
findPage(#/watch/1) -> translation "Merhaba iki."
listPages().length -> 1
```

**Etki:** Aynı alan adındaki iki farklı SPA video/bölümü tek arşiv kaydını
paylaşır; ikinci kayıt birincinin çevirisini ezer, yanlış çeviri yüklenir.

**Öneri (uygulanmadı):** `#/` veya `#!/` ile başlayan hash-route'u kimliğe dahil
et; yalnız düz sayfa çapalarını at.

### 465-03 — [ORTA] Önbellek isabeti kalite devre kesicisini sıfırlamıyor; bozuk çeviri erken kabul ediliyor

**Konum:** `src/browser-translation-scheduler.js:620-650` (cache hit ve kalite
kapısı), `:661` (sağlayıcı başarısında `consecutiveQualityFailures = 0`),
`:760-763` (eşik aşılınca `qualityAutoLenient`).

**Ne oluyor:** Sağlayıcıdan gelen temiz çeviri sayacı sıfırlıyor; önbellekten
gelen temiz çeviri sıfırlamıyor. Araya giren cache hit, önceki kalite
hatalarını “temiz” saymıyor; sonraki hata eşiği erken aşıyor ve scheduler
`qualityAutoLenient` moduna geçip sayı kaybı içeren çevirileri kabul ediyor.

**Kanıt (gerçek scheduler, 3 cümle; B cache'ten, A/C sayı kaybı):**

```text
qualityBreakerThreshold=2, maxAttempts=1, lenient=false
A: "Rate 5%." -> "Oran 5."   (kalite hatası)
B: "Hello."   -> cache "Merhaba."
C: "Rate 6%." -> "Oran 6."   (kalite hatası)

snapshot: qualityAutoLenient=true, consecutiveQualityFailures=2,
results: ["Merhaba.", "Oran 5.", "Oran 6."]
```

Cache hit olmasaydı ikinci hata da sayılır ve eşik yine aşılırdı; ancak
**cache hit'ten sonra** sayaç sıfırlanmadığı için tek hata eşiği tamamlıyor.
Temiz bir cache sonucu güvenilir başarı sayılmalı.

**Etki:** Kalite kapısı erken gevşiyor; yüzde/sayı kaybeden çeviriler “kabul”
edilerek ekrana yazılıyor. Oturum başına yalnız bir kez olur ama etkisi kalıcıdır.

**Öneri (uygulanmadı):** Cache hit başarısında da `consecutiveQualityFailures=0`
yap; `qualityAutoLenient` yalnız sağlayıcı hatalarıyla tetiklensin.

### 465-04 — [ORTA-DÜŞÜK] Bütünlük raporu yinelenen cue kimliğinde eksik çeviriyi gizliyor

**Konum:** `src/browser-translation-integrity.js:7-9` (`cueIdentity`),
`:35-37` (`sourceIds` Set), `:100-106` (durum seçimi).

**Ne oluyor:** Kaynak cue'lar `cueId` ile tekilleştiriliyor. Aynı `cueId`'yi
taşıyan iki farklı cue varsa `sourceIds` boyutu 1'e düşüyor; tek çeviri
“tüm cue'lar çevrildi” sayılıyor.

**Kanıt:**

```text
sourceCues: [{cueId:'x',start:0,end:1},{cueId:'x',start:2,end:3}]
results:    [{cueId:'x',start:0,end:1,text:'A'}]
state:      {total:2, completed:2}

-> status="complete", translatedCues=1, missingCues=0,
   message="2/2 kaynak altyazı çevrildi."
```

**Etki:** Canlı sağlayıcı aynı cue kimliğini yeniden kullandığında (veya bir
birleştirme iki kaydı aynı id ile bıraktığında) bütünlük paneli yeşil kalır;
eksik çeviri kullanıcıya gösterilmez.

**Öneri (uygulanmadı):** Kimliği `cueId + start + end` (veya benzersiz bir
sıra numarası) üzerinden kur; Set yerine çoklu kümeyle eksikleri say.

### 465-05 — [DÜŞÜK] Adres tamamlamada `…` genişlemesi ofsetleri kaydırıyor

**Konum:** `src/browser-address-model.js:82-127` (`foldSearchIndex`),
`:207-208` (`inlineCompletion` ön ek kesimi).

**Ne oluyor:** `PUNCT_FOLD` `…` karakterini `...` (3 karakter) yapıyor; map
girdileri katlanmış ofsetle tutuluyor, ön ek ise özgün URL'den kesiliyor.
URL'de literal `…` varsa tamamlama ön eki yanlış karakterleri içeriyor veya
tamamlama kayboluyor.

**Kanıt:**

```text
item: https://example.com/a…bc
"example.com/a"    -> prefix "example.com/a"
"example.com/a."   -> prefix "example.com/a…"     (yazılan "." kayboldu)
"example.com/a.."  -> prefix "example.com/a…b"    (fazladan b)
"example.com/a..." -> null
```

**Etki:** Adres çubuğunda literal üç nokta içeren nadir URL'lerde vurgu/tamamlama
kayması. Düşük sıklık.

### 465-06 — [DÜŞÜK-ORTA] İndirme geçici dosyaları artık hiç süpürülmüyor

**Konum:** `backend/media.py:387-392` (eski `*.invtmp-*` süpürmesi kaldırıldı),
`:468-471` (yalnız normal yolda kendi dosyalarını siler).

**Ne oluyor:** 463-16'da eşzamanlı indirmeyi korumak için toplu süpürme
kaldırıldı ve dosya adları token'landı. Ancak süreç sert öldürülürse (kill -9,
güç kesintisi, uygulama çökmesi) `name.invtmp-<token>-video/audio` kalıntıları
hiçbir sonraki indirme tarafından temizlenmiyor.

**Etki:** Zamanla çıktı klasöründe büyük yarım dosyalar birikir; kullanıcıya
görünür bir temizlik yolu yok. Düşük-orta (disk).

**Öneri (uygulanmadı):** Yaş tabanlı (örn. 24 saat) süpürme; yalnız `invtmp`
kalıbı ve eski mtime ile, çalışan token'ları koru.

### 465-07 — [DÜŞÜK] Örnek dublajda 11. gruptan sonraki metin düzenlemeleri sessizce yok sayılıyor

**Konum:** `src/dub-service.js:349` (`--limit 11`), `tools/voxcpm2/altyazi_oku.py:347-350`
(`make_groups(..., limit)` sonra `apply_edits`), `tools/voxcpm2/dub_plan.py:41-49`.

**Ne oluyor:** `dub:plan` tüm grupları döndürür; kullanıcı “yalnız örnek”i
işaretleyip 12. veya sonraki grubun metnini düzenleyebilir. Üretimde
`make_groups` yalnız ilk 11 grubu üretir; `apply_edits` bu gruplar üzerinde
dolaştığı için 11 sonrası anahtarlar hiç uygulanmaz. UI “✓” sayısını ve düzenlemeyi
gösterir, uyarı yoktur.

**Etki:** Kullanıcı örnek üretimde düzenlediği metnin uygulandığını sanır; ses
eski metinle üretilir. Düşük ama kafa karıştırıcı.

**Öneri (uygulanmadı):** Örnek modunda planı da 11 grupla sınırla veya 11
sonrası düzenlemeler için açık uyarı ver.

### 465-08 — [DÜŞÜK] `numPages=0` iken PDF sayfa seçimi milyonlarca sayfa üretebiliyor

**Konum:** `src/pdf-translate.js:698-715`.

**Ne oluyor:** `limit` 0 ise `end > limit` kontrolü devre dışı kalıyor; 7 haneli
aralık (`1-9999999`) milyonlarca elemanlı Set üretiyor. Normal PDF'de `numPages`
> 0 olduğu için sınır çalışır; hasarlı/0 sayfalı PDF'de UI donabilir.

**Kanıt:** `parsePdfPageSelection('1-2000000', 0)` → 2.000.000 sayfa, ~163 ms;
10 milyon sayfa için bellek/CPU artışı doğrusal.

**Etki:** Düşük olasılıklı, hasarlı PDF'de arayüz donması.

## B. Test ve doğrulama

- İlk tam `npm test`: 549 dosya, 1 kırmızı (`docs-index-integrity`: 464 INDEX'te
  yoktu). Paralel oturum 464'ü INDEX'e ekledi; hedefli test geçti.
- Hedefli: `subtitle-sentence-layout`, `settings-security` (23 test),
  `report456-regressions` (6), `browser-address-model` (9),
  `docs-index-integrity` (675 devir + 424 rapor) → geçti.
- Sözdizimi: değişen `main.js`, `settings-security.js`, `browser-translation-scheduler.js`,
  `backend/{transcribe,sentence_translation,media}.py` → 0 hata.
- Nihai tam `npm test`: 549 dosya, 0 kırmızı, "Tüm testler geçti".

## C. Temiz bulunan alanlar

- Dublaj iptal/artefakt sahipliği, background range/limit, TTS timing testleri.
- PDF durum kurtarma, OCR, manga DNS pinleme/SSRF, manga OCR cache.
- YouTube hesap göçü, TV modu, reklam koruması, SponsorBlock, indirmeler.
- Canlı ASR dil değişimi/RTF, worklet, CEA/DASH/HLS yakalama.
- İzleme kütüphanesi kapanış/eşzamanlılık, relink, katalog, notlar, okuma listesi.
- Bul/değiştir, düzenleme geçmişi, timeline kurtarma, çift kalitesi, dışa aktarma.
- Oturum/çalışma alanı paketleri, gizlilik, sekme kaynakları.
- Model/GPU/ağ bütçesi, CSP/gezinme, Unicode/Windows, a11y/i18n.

## D. Sınırlar

- Gerçek GPU/CUDA, gerçek model, canlı sağlayıcı ve YouTube testi yapılmadı.
- Electron smoke/soak envanterinin tamamı koşulmadı.
- 465-06 sert kill/güç kesintisiyle üretilmedi; kod yolu kanıtıdır.
- 465-07 statik akış kanıtıdır; gerçek TTS çalıştırılmadı.
- 465-08 yalnız sentetik `numPages=0` ile ölçüldü.

## E. Öneri sırası (uygulanmadı)

1. 465-01 (Türkçe dublaj verisi), 465-02 (yanlış çeviri yükleme), 465-03 (kalite kapısı).
2. 465-04, 465-06, 465-07.
3. 465-05, 465-08.

## Ek — kanıt komutları

```powershell
npm test
node tests/subtitle-sentence-layout.test.js
node tests/settings-security.test.js
node tests/browser-address-model.test.js
node tests/docs-index-integrity.test.js
node --check src/main.js
& backend\venv\Scripts\python.exe -m py_compile backend\transcribe.py
```

Ürün kaynaklarında bu oturum tarafından yapılmış değişiklik yoktur; çalışma
ağacındaki 10 dosyalık düzeltme seti oturum başında mevcuttu.
