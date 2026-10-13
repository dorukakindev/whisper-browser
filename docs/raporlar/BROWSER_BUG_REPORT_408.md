# Rapor 408 — Son tamamlanan Whisper + çeviri çıktısının denetimi

Tarih: 2026-10-14. İncelenen kaynak kodu: `2cc5f3fad1004e5340aab4403da489cc5fa1af96`;
başlangıç repo HEAD: `59d23c62cf4b9dc35e96a0a445b7d41710db2f92`.
Salt okunur denetim; kullanıcı dosyaları veya kod değiştirilmedi.

## Çalışma sonucu

Son yerel iş 01:42:51'de çıkış kodu 0 ile bitmiş. Kaynak ve Türkçe çıktı 196'şar
blok içeriyor. Gerçek dosyalar `subtitle-pair-quality` ile okundu: 196/196 zaman
damgası birebir eşleşiyor; eksik/fazla/boş blok ve zaman uyuşmazlığı yok.
Python son kalite denetimi de boş/zaman uyuşmazlığı sayısını 0 buldu.

Çeviri özeti: 157.4 saniye, 10 toplu istek, 0 kurtarma isteği, 0 geçersiz toplu
yanıt. İlk indirme→çeviri başlangıcı yaklaşık 25 saniye; günlük performansı
yaklaşık 182 saniye toplam işlem bildiriyor. Kaynak ses yaklaşık 671 saniye.
Bu tamamlanmış iş önceki 252 blokluk yarım günlükten farklıdır.

Kaynak kalite raporunda 44 hızlı okuma bloğu, 0 çakışma var. Bu 44 sayısı kaynak
çıktının okunabilirlik uyarısıdır; doğrudan çeviri anlam hatası sayısı değildir.
Düşük güvenli sözcükler de işaretlenmiş. Konuşma/video dinlenerek doğrulanmadı.

## Bulgular

**R408-1 — Son kalite kapısında satır yerel yanlış pozitifler (P2).**

LLM döngüsü 196 blok üretmesine rağmen son `compute_translation_quality_report`
kontrolü 12 bloğu işaretlemiş. `transcribe()` kalite indekslerini
`provisional_completed` kümesinden çıkararak 184/196 tamamlandı, 12 yeniden
denenecek sonucu ve `.tr.partial.srt` dosya adı üretmiş.

İşaretlenen bloklar (1 tabanlı): 16, 21, 55, 65, 73, 94, 97, 105, 108, 112, 164,
196. Kaynak/hedef ve komşu bloklar elle okununca birçok uyarı gerçek eksik çeviri
değil:

- 65 ve 94: olumsuzluk/anlam komşu bloklara taşınarak bütün cümlede korunmuş.
- 55, 73, 97, 164: Türkçe eşdeğer olumsuzluk/deyim yapıları uyarıya takılmış;
  örneğin “hangi sürümü … oynarsanız oynayın” anlamını koruyor.
- 16, 21, 112: Türkçe cümle sonraki blokta devam ediyor; tek bloğa uygulanan
  kesik-cümle kontrolü bağlamı hesaba katmıyor.
- 105: bölünmüş bir kurum adının ikinci parçası aynen korunmuş; “kaynak yankısı”
  işareti burada tek başına çevirisizlik kanıtı değil.
- 196: sayı eki/zar temennisi anlamca korunmuş görünmesine rağmen işaretlenmiş.
- 108: kaynakta kısaltılmış/ambiguous tarih hedefte 2023 olarak açılmış. Bağlamda
  makul görünür; ses/orijinal bilgi doğrulanmadan doğru tarih kabul edilmemeli.

Bu inceleme tüm çevirinin kusursuz veya bütün uyarıların yanlış olduğunu
kanıtlamaz. Ancak 12 “eksik” göstergesini 12 kayıp/çevrilmemiş satır olarak
sunmak yanıltıcıdır. Satırlar dosyada mevcut. Gevşek modda üretilen şüpheli
satırların kullanıcıya inceleme uyarısı olarak mı yoksa başarısız blok olarak mı
sunulacağı, tamamlanmış cümle grubu ve bilinçli özel ad korumasıyla birlikte
ele alınmalıdır. Bu turda kalite kapısı gevşetilmedi veya çıktı düzenlenmedi.

Bağımsız Node denetimi 3 otomatik blocking işareti ve 14 advisory buldu
(2 sourceEcho, 1 sayı farkı; 11 olumsuzluk incelemesi, 1 kaynak belirsizliği,
2 akıcılık incelemesi). Bunlar da otomatik adaylardır; komşu cümle incelemesi
olmadan kesin semantik hata sayısı olarak kullanılmamalıdır.

**R408-2 — Özel ad tutarlılığı uyarıları (inceleme).**

Günlük üç ad varyasyonu bildiriyor. Çok sözcüklü kurum adının parçalarını ayrı
sayma bazı uyarıları şişirebilir; bir ürün/başlık adının özgün ve Türkçeleştirilmiş
biçimleri de karışıyor. Tek biçim isteniyorsa sözlük kararı gerekir. Otomatik
uyarı tek başına üç kesin anlam hatası kanıtı değildir.

## Kanıt / sınırlar

`tmp/audit-latest-subtitles.js` gerçek dosyaları mevcut Node denetleyicisiyle;
`tmp/audit-latest-subtitles.py` mevcut Python kalite denetleyicisiyle okudu.
Komşu bloklar yalnız yerelde incelendi. Ham altyazı, başlık, dosya yolu, URL,
günlük veya kişisel profil Git'e alınmadı. API çağrısı, yeniden çeviri, ücretli
istek, kullanıcı dosyasına yazım yapılmadı. Ürün kodu değişmedi; ürün regresyon
testleri tekrar koşulmadı. Belge diff/içerik kontrolü yapıldı. GitHub Actions
hesap engeli önceki teslimden biliniyor; bu belgede Windows CI başarısı iddiası yok.
