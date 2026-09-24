# BROWSER_BUG_REPORT_106 — 2026-09-22 paket denetimi ve yerel bütünleştirme

## Kapsam

`whisper-browser-paket-2026-09-22` içindeki doğrulanmış Git bundle, `origin/master`
`583b15a` tabanından başlayan 17 commit olarak ayrı bir inceleme dalında açıldı. Paket doğrudan
çalışma ağacına kopyalanmadı. Kod, test, CI, rapor taşıma ve ekran görüntüsü değişiklikleri
incelendikten sonra yerel `codex/catalog-sync` dalına çakışmasız birleştirildi.

Paket bütünlüğü: `git bundle verify` başarılı; paket ucu `dcbdb95d2289839eaf730ce781fb413549bce74f`.

## Sonuç

- Paketteki çeviri, adres çubuğu, oturum çapasını koruma, sayfa çevirisi, görsel kaydetme,
  yerelleştirme ve tema değişiklikleri ilgili regresyon testleriyle doğrulandı.
- 103 tarihsel raporun `docs/raporlar/` altına taşınması gerçek Git rename olarak uygulandı;
  içerik kaybı veya kopya kök rapor oluşturulmadı.
- UI denetimi `--strict` kipinde 52 yüzeyi ölçtü; betik hatası ve kontrast hatası yoktu.
- Electron köprü testi gerçek Electron sürecinde geçti.

## Denetimde bulunan ve düzeltilen ek hata: R106-01

**Etki:** Yeniden çeviri fark penceresi açıkken aynı çeviri izi yeniden yüklenir veya kullanıcı
tarafından düzenlenirse, “Seçilenleri eski hâline getir” eylemi yalnız dosya yolunu denetliyordu.
Aynı yol altında daha yeni metin bulunmasına rağmen eski fark anlık görüntüsü uygulanarak güncel
satır sessizce ezilebilirdi.

**Kök neden:** `openRetranslationReview()` yol eşitliğini tazelik kanıtı sayıyor;
seçilen cue'nun başlangıç/bitiş/metin üçlüsünü fark penceresinin açıldığı yeni sürümle
karşılaştırmıyordu.

**Düzeltme:** `TranslationDiff.selectedChangesStillMatch()` eklendi. Seçilen her satırın
zamanları ve güncel metni incelenen `after` sürümüyle aynı değilse işlem hiçbir dosyaya yazmadan
uyarıyla kapanıyor.

**Regresyon testi:** `tests/translation-review-tools.test.js` içinde metin veya zaman değişmiş
satırın reddedildiği doğrulandı; test düzeltmeden önce `TypeError` ile kırmızı, sonra yeşildi.

## Hedefli doğrulama

- `tests/audit-2026-09-22-browser-translate.test.js`: 18/18
- `tests/browser-address-model.test.js`: 6/6
- `tests/browser-recovery-tools.test.js`: 3/3
- `tests/translation-review-tools.test.js`: 6/6
- `tests/i18n-coverage.test.js`: geçti, eksik sinyal 0/0
- `tests/css-hardcoded-colors.test.js`: 470/470
- `backend/test_translation_audit_2026_09_22.py`: 11/11 (`unittest` ile doğrudan)
- `node --check`: `main.js`, `preload.js`, `renderer.js`, `translation-diff.js` temiz
- `git diff --check`: temiz
- `npm run test:electron-bridge`: paket inceleme dalında geçti
- `npm run audit:ui -- --strict`: paket inceleme dalında 0 kontrast hatası

## Sınırlar

- Kullanıcının token/çıktı maliyeti uyarısı üzerine bütün test paketi tekrar tekrar koşulmadı;
  değişen alanlara ait dar testler kullanıldı.
- Birleşik Electron smoke sırasındaki `electron-media-catalog.smoke.js` bu Windows inceleme
  ortamında çıktı vermeden bekledi ve elle sonlandırıldı. Bunun paket regresyonu olduğuna dair
  kanıt yoktur; diğer seçili `ui-locale`, `ui-scale-matrix`, `browser-chrome-design`,
  `browser-menu-visual` ve `smarttube-usage-matrix` smoke yolları geçti.
- Gerçek ücretli çeviri sağlayıcısı çağrısı ve kullanıcı profili kullanılmadı.
