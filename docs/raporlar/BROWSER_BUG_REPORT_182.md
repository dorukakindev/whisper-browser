# BROWSER_BUG_REPORT_182 — R223: #152 Devin Review triage + TM zehirlenmesi

Tarih: 2026-09-29 · Dal: `codex/r223-review-round-1790627000` · Taban: `origin/master` (16e0450)

## Kapsam

Merged PR #152 (R222 Electron çeviri düzeltmeleri) üzerindeki Devin Review job'u
`pr-review-job-e588af5e4dd1496ab6bf2f7235745bf2` (commit `c36f886`): 5 bug + 3 flag
bulgusu triage edildi. Ayrıca kendi denetimimde TM zehirlenmesi sınıfında bir
gerçek bug daha bulundu ve aynı turda düzeltildi.

## Doğrulanmış bug'lar → düzeltildi

| # | Bulgu | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| 1 | **TM zehirlenmesi** (kendi denetimi) | `accept_unchanged_echo` yankı-kabul satırlarını `stage_tm_rows` ile TM'e yazıyordu; `TranslationMemory.store()` yalnız `source.casefold()==target.casefold()` birebir eşitliği reddettiği için `'Wait!'→'Wait.'` gibi noktalama-benzek ekolar sqlite'a giriyordu. `lookup` (ratio≥0.85, context_key, len≥12, ±%25 boy, 240 satır) bunları sonraki dosyalarda "çeviri" diye döndürüp TÜM kalite kapılarını atlatıyordu. | `accept_unchanged_echo` artık TM'e yazmıyor; `stage_tm_rows` içine `translation_is_source_echo` bekçisi eklendi (normal yoldan gelen eko-benzeri satırlar da elenir). `unchanged_idx` yalnız gerçekten yazılan indeksleri işaretler (precompleted satırlar yankı-kabul diye etiketlenmez). Regresyon: `test_echo_accepted_never_seeds_translation_memory` — eko-kabul sonrası sqlite'ta "wait right there" satırı yok. |
| 2 | Journal'da kapasite kesimi diriliyor (review BUG_0002) | `set()` sınırı aşınca en eski kaydı `map.delete()` ile atıyordu ama journal'a silme yazılmıyordu; replay kesilen kaydı en yeni konuma oturtup yaşayan bir çeviriyi kesiyordu. | Kesimde pendingJournal'a mezar taşı `{k, v:'', t}` yazılır; replay `!value → map.delete(key)` uygular. Test: `evict.json` senaryosu. |
| 3 | Journal replay TTL filtrelemiyor (review BUG_0003) | TTL kontrolü yalnız temel dosya (entries) yüklemede vardı; süresi dolmuş journal satırları haritayı doldurup sıkıştırmada kalıcılaşıyordu. | Replay'de `Date.now()-updatedAt > ttlMs` satırlar atlanır (tombstone'dan sonra, dedup'tan önce). Test: `ttlj.json`. |
| 4 | `.bak` sıkıştırma-öncesi içerikti (review BUG_other_0004) | `compact()` `.bak` kopyasını rename'den ÖNCE alıyordu → yedek, journal'dan katlanan son kayıtları içermiyordu; birincil bozulunca geri dönüş veri kaybediyordu. | `.bak` kopyası rename SONRASINA taşındı (async + senkron yol) — yedek = sıkıştırılmış tam içerik. Test: `bakcomp.json`. |
| 5 | PDF durumu sağlayıcı değişiminde eziliyor (review BUG_0004) | `pdfTranslationStatePath` yalnız `sha256(pdfHash)` üretiyordu; endpoint'e göre taze başlayan iş aynı dosyaya yazıp önceki sağlayıcının sayfa çevirilerini siliyordu. | Dosya adı `sha256(pdfHash|endpoint)` (`pdfTranslationStateFileStem`, saf modüle taşındı); `pdfHash`-only eski dosyalar `pdfTranslationStateLegacyFileStem` ile okunmaya devam eder (normalize'ın endpoint kapısı uygun olanı geçirir). |

## needs_human / kapandı

- **BUG_0001** (eko-kabul satırları `completed` sayılıyor): tasarım gereği —
  kullanıcı spec'i "değişmeden kabul edildi diye işaretle ve önbelleğe yaz"
  diyor; satırlar `unchanged` statüsüne alınır, `completed`'e sayılmaz.
  Thread'de açıklandı.
- **FLAG_0001/0002** (eş-örtüşme eşleşmesi): çift-kenar durum analizi
  thread'de.
- **FLAG_0003** (coveredCueIds yayılmıyor): bayat — main.js:8595,
  integrity:23, scheduler:203 zaten taşıyor; thread'e kanıt yazıldı.

## Doğrulama

- `backend/test_sentence_distribution.py`: **40/40** (yeni TM testi dahil)
- `tests/browser-translation-cache.test.js`: **10/10**
- `tests/pdf-translate.test.js`: geçti (yeni stem testleri dahil)
- Komşu dosyalar: integrity 10, page-translate, page-translation-main,
  merged, reliability, archive — hepsi geçti
- `node --check` src/main.js, pdf-translate.js, browser-translation-cache.js ✓
- `py_compile` transcribe.py ✓

## Windows etkisi

- Durum dosyası anahtarı değişti: mevcut Windows profilindeki `pdf-translations/*.json`
  dosyaları legacy stem ile okunmaya devam eder (endpoint eşleşenler geçer);
  yeni yazımlar ayıraclı adla gider. Veri kaybı yok.
- Journal mezar taşı/`.bak` değişimi geriye dönük uyumlu: eski journal satırları
  (v:'') içermez, replay aynı davranır; yeni satırlar silme anlamı taşır.
- Dosya sistemi: `copyFile`'ın rename sonrasına taşınması Windows AV kilidi
  senaryosunda da doğru (kaynak dosya rename'den hemen sonra var).

## Sınırlar

- `pdfTranslationStateFileStem` saf modüle taşındı; main.js sarıcısı
  Electron gerektirdiği için birim testi stem fonksiyonları üzerinden.
- TM'de eski sürümlerden kalan zehirli satırlar bu PR'da temizlenmez;
  yeni zehir girişi kesildi (lookup yolu yeni ekoları artık üretmez;
  eski satırlar da echo bekçisiyle yeniden yazılmaz — lookup'ta dönen
  zehirli satır `translation_is_source_echo` ile görülünce depolanmaz).
