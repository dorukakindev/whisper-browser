# BROWSER_BUG_REPORT_475 — İkinci geniş tur, 10 ayrı düzeltme

Başlangıç: `bb633d43af1882a7f4f1332f044594a4be524007`.
Kod: `18f02dfee96cccf1ba764d9b3c10dec1451065bd`.
Rapor474'te teslim edilen 10 madde tekrar sayılmadı.

| No | Doğrulanan kök neden / önceki sonuç | Düzeltme |
|---|---|---|
| 475-01 | sanitizeDiagnosticsSecrets yalnız string içindeki token= kalıplarını tarıyordu; {apiKey: değer, password: değer} yapısındaki yalın değerler açık kalıyordu. | Ortak hassas anahtar sözlüğüyle nesne alanı bazlı gizleme; cookie başlıkları dahil. Genel tanı code/state/expiry metadatası korunur. Gerçek kişisel veri kullanılmadı. |
| 475-02 | URL matrix parametresinde percent-encoded ad (%74oken) ve SPA route matrix alanı redaksiyondan kaçıyordu. | Matrix adını güvenli decode et; hash route yolunu da aynı temizleyiciden geçir. safePlaceUrl ve redactUrlSensitiveParams ikisi de kapsandı; güvenli lang alanı kalır. |
| 475-03 | translationFor düz nesnede prototype üzerinden constructor gibi özellikleri çeviri sayıyordu. | Yalnız own-property değerleri kabul et; yapılmamış çeviri pending kalır. Map desteği korunur. |
| 475-04 | matchArchivedPage exact-ID eşleşmesinde boş çeviriyi de restored/exact sayıyordu; fallback zaten boş çeviriyi eliyordu. | İki yolda da boş çeviri eşleşmez; boş içerik tamamlanmış arşiv geri yüklemesi sayılmaz. |
| 475-05 | İki dosyanın pozitif boyutu farklı olsa bile yakın süre weak duplicate üretiyordu; yorumdaki boyut-bilinmiyor koşulu uygulanmıyordu. | Bilinen çelişen boyutlar eşleşmez; bilinmeyen boyutlu bir üye üzerinden aynı kümeye dolaylı katılım da engellenir. |
| 475-06 | Dışa aktarma metin doğrulayıcısı literal ters-bölü N'yi gerçek satır sonuna çevirip kaybı onaylayabiliyordu. | Parser'ın çözdüğü düz metni literal olarak karşılaştır; yalnız CRLF ve NFC normalizasyonunu koru. ASS literal escape round-trip eski testleri geçti. |
| 475-07 | Koleksiyon aynı ada yeniden adlandırıldığında order[next]=order[previous] ardından delete previous aynı anahtarı siliyordu. | Ad değişmiyorsa sıralama kaydı korunur; girdi nesnesi değiştirilmez. |
| 475-08 | Koleksiyon silme üyeliği kaldırıyor ama prefs.collectionOrder eski sırasını tutuyordu; aynı isim yeniden açılınca eski sıralama geri geliyordu. | Silinen koleksiyonun order alanını kopyada temizle; diğer prefs ve koleksiyon sıraları korunur. |
| 475-09 | Builder, doğrulayıcı ve main export/configured-save yollarında slice(0,20000) dosyanın sonunu sessizce atıyordu. | Kota aşımı açık hata olur, ilk 20000 tam dosya gibi sunulmaz. IPC export dosya seçicisinden önce reddeder; kaydetme yolu da tam listeyi builder'a verir. TR/EN hata karşılığı eklendi. |
| 475-10 | normalizeChapter {...raw} ile geçersiz end alanını yayıyor; sonra geçerli değilse alanı kaldırmak yerine hiç override etmiyordu. | Ham end'i yaymadan çıkar; yalnız sayısal end>start ekle. Bu, önceki 464-Y4 özetinde açık kalan maddeyi bu PR'da doğrulayıp kapatır. |

## Repro ve kontrol

`tests/report475-regressions.test.js`: ilk sağlamlaştırılmış fixture ile
10 FAIL → düzeltmeden sonra 10 PASS (yaklaşık 0,2 saniye). İlk literal-N
örneğinde fazladan boşluk bağımsız ret üretiyordu; sadece A\NB/A-LF-B
karşılaştırmasına düzeltilince gerçek hata da kırmızı olarak kanıtlandı.
475-09 gerçek IPC handler'ının başını VM'de çalıştırıp seçiciden önceki
ret yolunu ayrıca denetler. 20.001 sentetik cue; dosya/ağ/model yok.

Mevcut kontroller geçti: browser-diagnostics-export, browser-place-url,
browser-translation-archive, browser-library-tools, library-maintenance-21-25,
browser-subtitle-output, browser-chapters, report474-regressions, ui-locale,
ui-locale-dedupe, browser-translation-integrity, ci-determinism-ratchet,
package-integrity. Son iki testte eşik genişletilmedi. Ayrı
browser-sensitive-keys.test.js adı depoda bulunmadığından o komut çalışmadı;
bağımsız bir sözlük testi geçti iddiası yok.

9 değişen kaynakta node --check ve git diff --check temiz. Belge indeks
kontrolü teslimde yapılır. Yerel Windows Node kullanıldı. Tam npm test,
CI bekleme, start.bat/GUI/DPI, gerçek sağlayıcı/YouTube, GPU/model/donanım
çalıştırılmadı. Lokalizasyon yalnız mevcut hata çeviri tablosu; görsel
layout değişmedi. Paket/bağımlılık/kurulum/kalıcı şema değişmedi.
