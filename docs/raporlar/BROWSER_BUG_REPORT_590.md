# Okuma-yalnız bug taraması ve test triyajı — 25 Ekim 2026

Bu belge yalnız okuma/test çalıştırması ile hazırlanmıştır; **ürün kodu değiştirilmemiştir**. `master` başlangıç/bitiş ürün kodu `263d72c9c619630b9e193fd50cdbb8c0a32e1264` aynıdır. Daha önceki Rapor587 geniş yol haritasıdır; bu rapor mevcut test suite ve hedefli kontrollerin somut sonuçlarını kaydeder.

## 1. Çalıştırılan doğrulama

- `npm test` tamamlandı: **exit 1**, 7 test dosyası başarısız.
- Başarısız dosyalar hedefli olarak yeniden koşuldu.
- Statik taramada proje kodunda `eval()`/`new Function()` kullanımına rastlanmadı; `innerHTML` kullanımları çoğunlukla şablon render içindir ve güvenli kaçış noktaları ayrıca denetlenmelidir.
- Canlı sağlayıcı, gerçek GPU, DRM ve temiz Windows kurulumu bu turda denenmedi.

## 2. Başarısız test dosyaları

| Test dosyası | Hata özeti | Sınıflandırma |
| --- | --- | --- |
| `tests/ci-determinism-ratchet.test.js` | uyku-bekleme sayısı 27 > baseline 21 | Yeni kodda `setTimeout`/bekleme artışı; determinizm regresyonu olabilir. |
| `tests/coverage-map.test.js` | yeni kapsamsız modül `src/book-voice-takes.js` | Test sözleşmesi kayması; modül için test referansı eksik. |
| `tests/css-hardcoded-colors.test.js` | sabit renk ratchet’i başarısız | Yeni stillerde tasarım token’larına uyumsuzluk. |
| `tests/i18n-coverage.test.js` | yeni İngilizce dizeler çevrilmedi (örn. telaffuz sözlüğü) | Yerelleştirme sözleşmesi kayması. |
| `tests/reader-navigation-races.test.js` | `ReferenceError: status is not defined` test VM diliminde | Test dilimi `status` fonksiyonunu içermiyor; ürün kodu modül kapsamında tanımlı. Büyük olasılıkla test sözleşmesi kayması. |
| `tests/ui-locale.test.js` | 128+ eksik çeviri anahtarı | Yerelleştirme sözleşmesi kayması. |
| `tests/test_dub_generation_quality.py` | `test_stalled_last_request_keeps_completed_cache_for_same_reference`: `0.wav` geçerli ses değil | **Gerçek ürün davranış riski**: takılan son istekten sonra tamamlanmış cache korunmuyor olabilir. |

## 3. En önemli bulgu

`tests/test_dub_generation_quality.py` içindeki `test_stalled_last_request_keeps_completed_cache_for_same_reference` testi, `EngineStalled` sonrası aynı referansla yeniden üretime geçildiğinde ilk cue sesinin (`0.wav`) geçerli kalmasını bekliyor. Bu koşul sağlanmadı. Bu durum kullanıcı verisini doğrudan etkileyebilir: uzun dublajda takılan son grup daha önce tamamlanmış sesi bozabilir veya gereksiz yeniden üretim zorlayabilir.

İlgili kod yolu:
- `tools/voxcpm2/altyazi_oku.py` (üretim orkestrasyonu)
- `tools/voxcpm2/dub_quality.py` (`valid_audio`, `generation_status`)
- `tools/voxcpm2/dub_lifecycle.py` (`EngineStalled`)
- `tools/voxcpm2/dub_finish.py` (`finish_audio`, `spoken_text`)

Öneri: Önce bu testi tek başına çalıştırıp hangi aşamada `0.wav` bozulduğunu belirle. Cache koruma invariantını ürün kodunda açıkça doğrula; yalnız testi gevşetme.

## 4. Diğer bulgular

### 4.1 Yeni telaffuz sözlüğü yerelleştirme ve CSS token uyumu tamamlanmamış

Yeni `Newton = Nyutın` özelliği İngilizce/Türkçe arayüz sözleşmesini bozuyor. Bu yalnız metin sorunu değil; aynı zamanda kullanıcı arayüzünün dil değiştirme davranışını ve tasarım token tutarlılığını etkiliyor.

İlgili kod:
- `src/renderer/renderer.js` (yeni sözlük UI ve i18n anahtarları)
- `src/renderer/styles.css` (sabit renkler)
- `src/renderer/ui-locale.js` (çeviri anahtarları)

### 4.2 Determinizm ratchet’inde bekleme sayısı arttı

Ratchet, koşul yoklaması yerine `setTimeout`/uyku kullanımının arttığını tespit etti. Bu performans veya zamanlama tutarsızlığına yol açabilir; ancak ratchet’in baseline güncellemesi mi, gerçekten yeni bekleme mi olduğunu ayırmak gerekir.

İlgili alan:
- `src/renderer/renderer.js`
- `src/main.js`
- kuyruk/iptal/zamanlama yolları

### 4.3 Kapsam haritası ve modül referansı eksik

`src/book-voice-takes.js` için test referansı yok. Bu modülün davranışını açıkça test etmek veya bilinçli olarak whitelist’e almak gerekir.

### 4.4 Reader navigation testi ürün kod hatası değildir, fakat test dilimi güncellenmeli

`readChapter` içinde `status("")` çağrısı modül kapsamında tanımlıdır. Test yalnız fonksiyon dilimini çalıştırdığı için `status` tanımsız görünür. Bu, ürün kodundaki global/module-scope bağımlılığını da görünür kılıyor; refactor sırasında dikkat edilmelidir.

## 5. Sınırlar

- Bu rapor kod değişikliği yapmadı.
- 7 başarısız testin hepsi ürün hatası değildir; bazıları ratchet/test sözleşmesi kaymasıdır.
- Testlerin tam listesi ve kalan 7 dosyanın kök nedenleri raporda ayrıştırıldı; diğer yüzeylerde derin statik denetim yapılmadı.
- Mock/fixture sonuçları gerçek model kalitesi olarak sunulmamalıdır.

## 6. Önerilen sonraki adım

1. `tests/test_dub_generation_quality.py` tek başına koş ve `0.wav` bozulma noktasını bul.
2. Yeni telaffuz UI için EN/TR anahtarlarını ve CSS token’larını tamamla.
3. Sleep ratchet artışının kaynağını belirle; gerekirse koşul yoklamasına çevir.
4. `src/book-voice-takes.js` için test referansı veya bilinçli whitelist kararı ekle.
5. Hiçbir adım testi gevşetmeden yapılmalı.