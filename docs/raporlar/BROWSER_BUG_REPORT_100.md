# BROWSER_BUG_REPORT_100 — T3: Türkçe çeviri kalitesi + yeniden-çeviri maliyeti

**Dal:** `devin/t3-translation-quality`
**Başlangıç SHA:** `4453ae003ee092b33d06a802535b65b460169e31` (origin/master)
**Kapsam:** Sabit altın korpus, deterministik mock sağlayıcı, yeniden-çeviri sayaçları, kalite kapısı denetimi.

## Bulgular

### F-100-1 — FAIL-FIXED: TR birleşik sayı öbeği sert sayı kapısını atlıyor

- **Dosya:** `backend/sentence_translation.py::_number_preserved` ve aynası `src/subtitle-sentence-layout.js::translationMeaningIssues`
- **Ulaşılabilir yol:** Kaynak `"We need 40 bags."`; sağlayıcı `"Kırk beş çuval gerekiyor."` (45) döndürürse `kırk` kelimesi substring eşleştiği için `number_mismatch` üretilmez → hatalı çeviri `translation_blocking_issues` (sert kapı) ve cache kaydını geçer; `.tr.srt`'ye yazılır.
- **Kullanıcı etkisi:** Yanlış sayı değeri taşıyan çeviri sessizce kalıcı önbelleğe ve kullanıcıya ulaşır — hem pass-1 hem indirilen dosya.
- **Kök neden:** Kelime-formu sayı kontrolü tek kelime regex'iyle yapılıyordu; `"kırk beş"` gibi birleşik sayı öbeği kısmi eşleşme üretiyor.
- **Kırmızı test:** `backend/test_golden_corpus.py::test_defects_detected_at_declared_layer` — num-06 `blocking` katmanında yakalanamıyordu (`found=[]`); ayrıca doğrudan `assert _number_preserved('40','Kırk beş çuval gerekiyor.','tr') is False` kırmızıydı.
- **Düzeltme:** Kelime eşleşmesinden sonra gelen ilk kelime başka bir TR sayı kelimesiyse eşleşme sayılmaz (`_TR_NUMBER_CONT` / JS `TR_NUMBER_WORDS` devam kontrolü). İki tarafta da.
- **Yeşil kanıt:** `"Kırk beş"` artık `number_mismatch`; `"Kırk çuval"`, `"On iki numune"`, `"815"`, `"2,4 milyon"` hâlâ temiz (mevcut 120-çift korpus + layout testleri geçti).

### F-100-2 — FAIL-FIXED: Maliyet sayaçları tanıya ve sinyal satırına ulaşmıyordu

- **Dosya:** `src/browser-translation-scheduler.js`, `src/browser-translation-integrity.js`, `src/renderer/renderer.js`
- **Yol:** `İzi seç ve çevir` → scheduler çalışır; istek/isabet/ıskak sayısı hiçbir yüzeye taşınmıyordu — T3'ün "istek sayısı doğrulanabilsin" şartı ve sahte-yeşil riskini kapatmak için.
- **Düzeltme:** `stats={providerRequests,cacheHits,cacheMisses}` `translateShared`/`start` yolunda artırılır; `emitState`/`snapshot`/`summarizeTranslationIntegrity`/`browser:translation:snapshot` ve kalıcı `diagnostics.translation`'a taşınır; renderer sinyaline `· önbellek H/L · N API çağrısı` (EN: `cache`/`API calls`) eklendi.
- **Yeşil kanıt (gerçek Electron):** `electron-browser-subtitle-gauntlet.smoke.js` içinde `browserTabState().diagnostics.translation` — `providerRequests=1` = sahte sağlayıcı HTTP isteği=1, `cacheMisses=1` (ilk tur). `.uiprev/subtitle-gauntlet/report.json`.

## Yeniden-çeviri maliyeti sayımları (deterministik mock)

`tests/browser-translation-retranslation-count.test.js`:

| Senaryo | Sonuç |
|---|---|
| 10 cümle → `completeAll` | 10 istek, 0 hit, 10 miss |
| Uygulama yeniden açılış (disk `PersistentTranslationCache`) | 0 istek, 10/10 hit |
| Aynı cue listesi `reconcileSentences` ile tekrar | +0 istek (toplam 6) |
| Sağlayıcı hatası s3 + `retryFailed` | s3 toplam 2 istek; sağlam cümleler 0 ek istek (toplam 5) |
| İki eşzamanlı aynı-anahtar istek | 1 sağlayıcı çağrısı (single-flight) |

Büyüyen-altyazı/cue-düzeltmesi/model-lang-provider anahtar geçersizliği sayımları R96'nın `tests/browser-subtitle-gauntlet.test.js`'inde zaten kapalı (100→+20→5-düzeltme: yalnız yeni/değişen gönderiliyor) — tekrarlanmadı.

## Altın korpus

`backend/golden-corpus-tr.json` — 56 girdi / 60 cue, elde yazılmış sentetik EN→TR çiftler (lisans yükümlülüğü yok). Kategoriler: özel ad (isim listesi + `name_map` transliterasyonu), sayı, olumsuzluk, zamir, hitap/register (regex marker), cümle sınırı (çok-parçalı), SDH, CPS/satır bütçesi, bağlam (aynı kaynak iki kez: ctx-01/02, ctx-03/04), modal, para birimi, birim, tarih.

`backend/test_golden_corpus.py`:
- Altın çiftlerde **yanlış pozitif = 0** (tüm denetim katmanları).
- Bozuk varyantlar beyan edilen katmanda yakalanır; kategori başına metrik basılır.
- Bağlam ayrımı: `translate_cache_key` bağlam alanlarıyla iki `"Right."` farklı anahtar üretir.
- Tam boru: `llm_translate` + sahte OpenAI → 0 ret, çıktılar hedefe eşit, istek sayısı = parça sayısı (3).
- Dürüstlük: yalnız `blocking`+`boundary` kusurları bloke olur; `meaning/register/names/sdh/budget/context` kusurları çıktıya geçer (belgelenmiş geçiş davranışı — sert kapı bilinçli dar tutulur).

## Açık sınırlar / FAIL-OPEN

- **Zamir takası ve yanlış-bağlam kusurları hiçbir kapıda yakalanmıyor** (pronouns 0/4, context 0/4). Korpus bu boşluğu ölçülebilir kılıyor; yakalama iddiası YOK.
- Modal kapısı nazik-komut çevirisinde (`Could you please...` → `"imzalar mısınız"`) modal marker arıyor — yalnız uyarı metriği, bloke yok; korpus altını `"imzalayabilir misiniz"` ile temiz tuttu.
- Canlı ücretli sağlayıcı kalitesi ölçülmedi — "çeviri kalitesi arttı" iddiası YOK; yalnız deterministik kapı/maliyet davranışı doğrulandı.

## Çalıştırılanlar

- `node --test tests/browser-translation-retranslation-count.test.js` — 5/5
- `python3 -m unittest test_golden_corpus` — 6/6
- `npm test` — tüm node + python paketleri geçti (korpus ve sayaç testleri dahil)
- `npm run test:electron-bridge` — geçti
- `electron tests/electron-browser-subtitle-gauntlet.smoke.js` (DISPLAY=:0, gerçek Electron) — PASS; `diagnostics.translation` sayaçları doğrulandı, ekran görüntüleri `.uiprev/subtitle-gauntlet/`
- `node --check` değişen tüm JS dosyaları; `py_compile` backend dosyaları

**Çalıştırılmadı:** canlı sağlayıcı E2E (anahtar yok — bilinçli); CEA/seek gibi R96/T1/T2 kapsamı (bu dalın konusu değil).

## Yanlış-pozitif kontrolü

- Altın korpus 0 bayrak (yukarı).
- Sayı kapısı düzeltmesi: `12000`→`"on iki bin"` korunurken `"12"`→`"on iki bin"` reddedilir (ters yönde de sıkı).

## Yeni bağımlılık

Yok (mevcut `node:test`, `unittest`, mevcut fixture sunucuları).
