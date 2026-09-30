# BROWSER_BUG_REPORT_261 — R312: PDF çeviri büyük-belge sınır davranışı

- Tarih: 2026-09-30
- Dal: devin/1790749573-pdf-large-doc → master
- Kuyruk maddesi: 15. PDF çeviri >50MB sınırı

## Denetim kapsamı

- `src/local-file-access.js` — `PdfFileAccess` kapısı: uzantı + 300 MB tavan + `%PDF-` imzası + gerçek yol çözümlemesi (symlink/ADS dahil). Sağlam.
- `src/main.js` — `inspectPdfDocument` karma planı yalnız baş+son parça okur (sınırlı), kaynak kimliği oturum nonce'u ile türetilir (R247); `preparePdfPageRequests` paket başına ≤3 sayfa, ≤8.000 öğe/≤2.000 blok sayfa, ≤16.000 öğe/≤400.000 karakter paket; `translatePdfPage` blok başına 12.000 karakter keser.
- `src/renderer/renderer.js` — `openPdfReader` bütün dosyayı tek `arrayBuffer`'a çeker (300 MB'a kadar tek kopya; pdf.js worker'a aktarılır — tasarım kararı, `whisper-pdf://` Range destekliyor ama worker içi özel-protokol fetch doğrulanmadı, açık sınır olarak not edildi).
- `extractPdfReaderPage` (renderer-helpers) sayfa metnini `reader.pages` Map'ine kalıcı yazar.

## Doğrulanan hatalar

1. **Tüm-kitap çevirisi önce TÜM sayfaların metnini çıkarıyordu.** `translateVisiblePdfPagesNow(all)` çeviriye başlamadan önce `numPages`'ın tamamı için `extractPdfReaderPage` çağırıyordu. 500+ sayfalık belgede: dakikalarca ilerleme/iptal olmayan çıkarma faslı + tüm metin `reader.pages`'ta birikir (iptal düğmesi ancak çıkarma bittikten sonra etkinleşiyordu). 50 MB+ belgelerde Map'teki metin kopyaları yüzlerce MB'a ulaşabilir.
   - Düzeltme: çıkarma paket başına tembelleştirildi (her 3 sayfalık paket kendi metnini istek anında çıkarır).
2. **Çevrilen sayfaların metin kopyası sonsuza dek Map'te kalıyordu.** Çizilmemiş sayfanın `blocks`/`items`'i çeviri sonrası bir daha kullanılmaz ama entry hiç silinmiyordu.
   - Düzeltme: paket tamamlanınca `article`/`translation` taşımayan girişler (çizilmemiş sayfalar) `reader.pages`'ten silinir.
3. **Devasa belgede sessiz maliyet.** "Tüm kitap" binlerce sayfalık belgede yüzlerce API paketini onaysız başlatıyordu.
   - Düzeltme: `all && pages > 40` durumunda sayfa sayısı + maliyet uyarısıyla `openAppDialog` onayı (EN/TR).

## Kanıt

- `tests/pdf-translate-depth.test.js` (yeni, 6 senaryo): tembel çıkarma sırası (ilk çeviriden önce ≤3 sayfa), 50 sayfa = 17 paket, tahliye sonrası `pages.size===0`, >40 sayfada onay/red, küçük belgede onay yok, görünen-yol tahliye yok.
- Kırmızı kanıtı: master'da 4/6 FAIL, dalda 6/6 PASS.

## Doğrulanmayan / açık sınırlar

- `openPdfReader`'ın dosyanın tamamını belleğe alması bilinçli tasarım; pdf.js range-akışına geçiş (`whisper-pdf://` 206 destekli) ayrı bir turda değerlendirilmeli — worker içi özel-protokol fetch'i bu kutuda doğrulanmadı.
- Gerçek 300 MB PDF ile Electron'da elle bellek gözlemi yapılmadı (fixture'sız davranış testleri).

## Windows notu

Platformdan bağımsız renderer mantığı; Windows'a özgü risk yok. Bellek baskısı düşük RAM'li makinelerde de azalır.
