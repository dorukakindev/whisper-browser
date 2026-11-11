# R855 — Carbon ile hedefli Stremio bug turu

2026-11-11 10:42 (Europe/Istanbul). Başlangıç/bitiş `master` / `a03e62451906698848982428b46946cdaa855d8a`. Yalnız inceleme/belge; ürün/test değişikliği, commit/push/PR/merge yok. Önceki ve eşzamanlı yerel farklar korundu.

## Sonuç

**İki aday: bir koşullu P2 işlev hatası doğrulandı, bir veri gözleminde kullanıcı etkisi doğrulanamadı.** Tüm program taranmadı. Son başarılı Carbon isteği yalnız `src/stremio-addons.js:394–469` kesitini kapsar; servis/renderer çağrı zincirini Codex yerelde inceledi.

### C855-01 / Carbon F1 — Eksik sezon/bölüm, gerçek sıfıra dönüşüyor (P2, yerelde düzeltildi)

Kaynak: `src/stremio-addons.js:452–453`. `Number(null)`, `Number('')` ve `Number(false)` sıfırdır; `Number.isInteger` bunları kabul eder. Atlanmış alan null kalırken açık null/boş değer 0 olur. Gerçek sezon 0 korunmalı; eksik bilgi ondan ayrılmalı.

Tetikleme: dizi eklentisi iki farklı video kimliğini `season: null, number: null` veya `season: '', episode: ''` ile döndürür. İki satır da sezon/bölüm `0:0` olur. Gerçek modülle inline assertion'larda iki satırın sayıları ve `videoKey` sonuçları `0:0` olarak doğrulandı. Alanları atlanan kontrol örneğinde iki alan da null kaldı. Node exit 0.

Kullanıcı etkisi: `stremio-ui.js` bölüm listesinin `season != null && episode != null` filtresi bunları kabul eder; liste ve ilerleme eşlemesi aynı sezon/bölüm çiftini kullanır. `baseCtx` aynı çiftte ilk videoyu bulur; kaynak isteği bu çifti servise taşır. `stremio-service.js` içindeki `videoIdFor` içerik kimliğine `:0:0` ekler. Bilinmeyen numara özel bölüm diye sunulabilir; ayrı satırların başlığı/izlendi durumu aynı anahtara bağlanabilir. Bu koşulun gerçek eklentilerde yaygınlığı ve canlı oynatma doğrulanmadı.

Carbon'un `videoKey` çakışması tek başına ürün etkisinin kanıtı değildir: helper'ın üretim çağrısı bulunmadı. P2 kararı renderer'ın mevcut sezon/bölüm zincirine dayanır. Düzeltme yapılmadı. Sonraki adım: mevcut Stremio testinde null/boş/boolean ile gerçek sayısal 0 ayrımını kanıtlayıp normalleştirmeyi düzelt; geçerli sayısal dizeleri koru.

### Carbon F2 — Eksik IMDb puanı 0 oluyor (bug sayılmadı)

`src/stremio-addons.js:439`: açık null/boş puan 0, atlanmış puan null olur; gerçek modülle tekrar üretildi. Ancak renderer puanı truthy kontrolüyle gösterir; minimum filtre `(m.imdbRating || 0)`, sıralama `v ?? 0` kullanır. İkisi bu yollarda aynı davranır. Kullanıcı etkisi doğrulanmadığından yalnız veri anlamı gözlemi olarak tutuldu; doğrulanmış ürün hatası sayılmadı.

## Model denemeleri ve kullanılabilirlik

Gateway `https://gateway.respan.ai/v1/`; istenen `gemini-4-carbon:free`, yanıtta `gemini-4-carbon`. Fiyat/ücretsiz kota doğrulanmadı. Anahtar kalıcı dosyaya yazılmadı.

| Deneme | Sonuç |
|---|---|
| İlk gönderim hazırlığı | Otomatik onay olası yerel/hassas değişiklik aktarımı gerekçesiyle reddetti; API isteği çalışmadı |
| Üç açık kaynak dosyası, ilk istek | Sonucu bekleyen araç 1 saniyelik timeout ile kernel'i sıfırladı; sunucu sonucu/kullanımı alınamadı |
| Aynı yaklaşık 99 bin karakterlik paket | 180 saniyelik istemci timeout; rapor yok |
| Tek modül, 12.465 girdi tokenı, 4.000 çıktı sınırı | HTTP 200; 51,9 sn; 3.997 düşünme tokenı; görünür içerik boş; `finish_reason: length` |
| 76 satır, 2.261 girdi tokenı, 10.000 çıktı sınırı | HTTP 200; 86,4 sn; 8.202 çıktı tokenı (7.572 düşünme), iki aday; `finish_reason: stop` |

Ham yanıtlar: [tek modül](carbon-review-20261111/response-small.json), [başarılı kesit](carbon-review-20261111/response-focused.json). İlk büyük isteklerin kullanımı bilinmiyor; toplam maliyet/token iddiası yok. Ham yanıtlar erişim anahtarı içermez.

Bu küçük örnekte Carbon gerçek bir normalleştirme sorununa işaret edebildi. Geniş kapsamlı hızlı bug tarayıcısı olarak başarı kanıtlanmadı; küçük kesit ve bağımsız doğrulama gerekiyor. İki adayın ikisini de bug saymak yanlış olur.

## Kapsam ve doğrulama

- [Önceki kapsam kaydı](../audits/deepseek-night1000-20261027/README.md), registry'de Stremio/torrent/native-player eşleşmeleri ve güncel R853/R854/Fable takibi kontrol edildi. Eski raporlar topluca açılmadı. Bu adaylar için güncel raporlarda karşılık bulunmadı. Bilinen URL gizliliği/kapasite görünürlüğü başlıkları modele yeni bulgu saymaması için bildirildi.
- İlk ret sonrası üç dosya GitHub raw URL'lerinden kimliksiz HTTP 200 ile alındı; HEAD/index'te değişmemiş ve yayımlanmış metinle CRLF/LF normalize edilince aynıydı. Sonraki isteklerde yalnız bu yayımlanmış kopyalar kullanıldı. Yerel fark, kişisel profil/medya gönderilmedi.
- Yayımlanmış SHA-256: servis `fc8464e57a5f9a262f5be4e5cc610a7e7c3c04b20dc9473e57cef284acdd450e`; addons `8b1d56d50d46073959f5124acacbb1978194761bacb257f7164771e871a1b557`; test `4fcc6319b381ede2994f2cb06da0b3070590cb683ffb9445f89775d489f64274`.
- `node tests/stremio-addons.test.js`: exit 0, OK. İki aday için gerçek modülle inline assertion'lar exit 0. Yeni kalıcı test dosyası üretilmedi.
- Computer Use/dosya seçici/açık uygulama/kişisel profil, gerçek addon/torrent oynatma, Electron/start.bat, GPU/ASR/dublaj ve GitHub Actions yok. Mevcut testin geçmesi adayın yokluğunu kanıtlamaz.
- Tur sırasında diğer yerel Fable grubu 10:36 devriyle ilerledi; onun değişiklikleri bu tur yapılmış sayılmadı. Güncel sıra OYN-14 → AST-01 → ALT-04; C855-01 ayrı açık kayıt.

## Sonraki adımlar

1. C855-01'i mevcut testte regresyonla onar; gerçek sıfırı koru.
2. Kişisel veri içermeyen metadata fixture'ında bölüm/kaynak sorgusunu doğrula; canlı kabulü ayrı tut.
3. Carbon tekrar kullanılacaksa küçük kod kesiti ve yeterli çıktı payıyla başla. Önceki Fable sırası ayrı korunur; Git teslimi için açık komut beklenir.

## Uygulama — 2026-11-11-1206

C855-01 yerelde düzeltildi. Type guard ile null/blank/bool/object/array bilinmeyen kalır; gerçek0/sayısal dize korunur. Mevcut testte önce başarısız regresyon sonra geçti. Sentetik gerçek servis→renderer akışı unknown için Sezon0 üretmez; gerçek0 özel bölüm `tt1:0:0` isteğine gider. İki Stremio kontrolü, üç ilgili JS syntax/diff temiz. Canlı addon sonucu değildir; eski inceleme/Carbon koşu kayıtları tarihsel kalır. Git teslimi yok. [Devir](../devir/2026-11-11-1206.md).
