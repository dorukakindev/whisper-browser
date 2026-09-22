# BROWSER_BUG_REPORT_110 — R109 yerel kabul notu

Tarih: 2026-09-23. Başlangıç dalı `codex/catalog-sync` (`322a952867336969e27ebe055fde06da61485d2e`), karşılaştırılan uzak dal `origin/master` (`d81d48f`). Birleşik yerel kod commit'i: `ec4231d1e89fbaaa700ad87034bd19ea3e2857bf`.

## Kabul edilen kısım

PR #32 (`a9164c8`) master'a alınmıştı. Birleşim yalnız `DEVIR-NOTU.md` ve `backend/transcribe.py` import listesinde çakıştı; yerel `reply_id_range_issue` ile master'ın yeni parça kapıları birlikte korundu. Birleşik ağaçta `backend/test_sentence_distribution.py` 34/34, `backend/test_golden_corpus.py` 6/6, `tests/player-ui.test.js` 148/148, `tests/youtube-tv-mode.test.js` 7/7, `tests/report70-youtube-oauth.test.js` 25/25 ve `tests/translation-review-tools.test.js` 6/6 geçti. Değişen Python dosyaları `py_compile`, `src/main.js` ve `src/renderer/renderer.js` `node --check` ile temiz. Tam `npm test` kullanıcı tercihi gereği çalıştırılmadı.

## Açık gerçek kusur: R110-01 — eksik SDH işareti sayı hesabından dolayı geri gelmiyor

`backend/subtitle_sdh.py` içindeki `restore_sdh_markers` çıkarılmış kaynak işaretlerini metin/kimliklerine göre eşleştirmek yerine yalnız hedefteki toplam işaret sayısını çıkarıyor ve `removed[:missing_count]` seçiyor. Kaynakta iki farklı işaret olup hedefte yalnız ikincisinin çevrilmiş biçimi kaldığında yanlış işaretin zaten var sayılmasına ve ilkinin çiftlenmesine yol açabilir; ters durumda eksik işaret hiç geri gelmez.

Deterministik örnek: `restore_sdh_markers('[GUNFIRE] (glass shatters) Run!', '[SİLAH SESLERİ] Kaç!')` çağrısı yalnız `[SİLAH SESLERİ] Kaç!` döndürüyor; `(glass shatters)` kayboluyor. `translate_existing_subtitle` sonuçları bu fonksiyondan geçtiği için kullanıcı çıktısı etkilenir. R109 raporundaki C16 "iki SDH'den biri düşmez" sonucu bu örnek için geçerli değil.

Önerilen iş: Kaynak marker sırası/türü ile çevrilmiş marker'ların eşleşmesini parça bazında belirle; farklı türleri yalnız sayı olarak birbirinin yerine koyma. Önce bu örneği ve iki işaretten ilkinin/ikincisinin eksildiği karşı örnekleri kırmızı regresyon olarak ekle. Var olan doğru yerelleştirilmiş işareti tekrar ekleme; eşleşme güvenilir değilse kaybı açık kalite uyarısı yap. Devin'in ayrı PR'ında düzeltme ve hedefli test yeterli.

## Kanıt sınırı

R109'un Ubuntu ekran görüntüleri, 30 dakika soak CSV'si ve `/home/ubuntu/qa-109` altındaki fixture/log dosyaları depoya eklenmemiş. Raporu tarihsel gözlem olarak okuduk; bunları Windows'ta yeniden üretmedik. Sınırlı hedefli regresyonlar, iki somut UI düzeltmesinin uygulanmış olduğunu destekliyor. Gerçek sağlayıcı, YouTube hesabı ve CEA/HLS canlı site sonuçları bu yerel kabulde yeniden doğrulanmadı.
