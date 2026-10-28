# Rapor706 — Gerçek çift sütun PDF'de dipnot kaybı ve sırası

Başlangıçmaster9274f1cf8cb33364d2871519759fbb05fa0b33f1. İki ilgili hata gerçek PDF.js→renderer→main text preparation→readerpreview yolunda ayrı aşamalarda doğrulandı.

## 706-A: Tekrarlanan numaralı dipnot metinden düşüyor

İki sayfanın altındaki küçük8pt `1 Footnote...` aynı metin olduğu için filterRepeatedMarginalLines bunu normal tekrarlanan footer sayıyordu. İlk native testte başlık/sol/sağ vardı fakat dipnot **tamamen eksikti**. Yeni koruma, mevcut alt%14/küçükfont/numara veya [numara] veya*/†/‡işaretli dipnotları tekrar temizliğinden ayırır. Normal repeatedfooter ve standalonepage sayıları hâlâ temizlenir. Kullanıcı metni sessizce kaybolmaz.

## 706-B: Dipnot sol sütun sonunda, sağ gövdeden önce okunuyor

Akoruması sonrası ikinci native koşu dipnotu geri getirdi ancak sıra `başlık→sol→dipnot→sağ` çıktı. Kısa notun yatay merkezi sol sütunda kaldığından genel columnsort bunu gövdeden önceye taşıyordu. Altbilgi-dipnot sınıflandırması ortak isFootnoteLine işlevine alındı; tablo hücresi olmayan bottomsmall-font notlar spanningseparator olarak tüm gövde sütunlarından sonra sıralanır. Paragraf kind de aynı classifier kullanır.

## Kabul

- Yeni2hedefli davranış kontrolü: numaralı tekrarlı dipnotlar korunur/iki sütundan sonra; normalheader/footer/pageindex temizliği sürer. Mevcut readingorder/translate/manga36–40ile **5Node raporlanmış test PASS** (wrapper iç kontrolleri ayrı sayılmadı). Syntax/diffPASS.
- Yeni `tests/electron-pdf-reading-order.smoke.js` gerçek2sayfaPDF üretir; her sayfa22ptbaşlık,12ptiki sütun4satır,8ptnumaralıdipnot. PDF.js gerçektextitems anaIPCile işlenir. Finalde her iki sayfa **başlık→sol1–4→sağ1–4→dipnot**, heading/footnotekind ve önizleme metin eşitliği PASS.
- İlk eksik metin ve ara yanlış sıra JSON'ları korunur; finalJSONve1400pxTRdarkekran incelendi. [Kanıt](PDFORDER706_2026-10-28/native.json). Ham kişiselPDF/profil/ses/API yok; fixturetestkaynağındatekrarüretilebilir.

## Kaynak ve sınırlar

MozillaPDF.js Apache2 [api.js](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js) getTextContent/streamTextContent gerçekkaynağı incelendi. PDF.js metin/geometry sağlar; semantik dipnot sırası uygulamanın sorumluluğudur. Mevcut geometrik çıkarıcı geliştirildi; dışkod/dependency/IPC/şema değişimi yok. Eski kaydedilmişprojelerin metni otomatik değiştirilmez; PDFyenidenhazırlanınca güncelçıkarım kullanılır.

Bu iki belirli font/geometri fixture'ı gerçekPDF'dir; bütünkitap/dergi/RTL/3sütun/rotasyon/dipnotbiçimleri için genel doğruluk iddiası değildir. Canlıçeviri/GPU/TTS/doğallık/start.bat/install/DRM yok.11before-quit warning açık;CIbeklenmez. P064numaralıdipnot/başlık,P065düzenliikicolumn kabulü ilerledi;100hedefbitmedi.
