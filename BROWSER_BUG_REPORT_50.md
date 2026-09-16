# BROWSER BUG REPORT 50 — Bağlamsal çeviride cue sahipliği

Tarih: 2026-09-16  
Durum: **DOĞRULANDI VE DÜZELTİLDİ**

## Ayrıntılı bulgu

Canlı 4SAPI / Gemini 3.8 Flash karşılaştırmasında model, bütün cümlenin anlamını doğru kurmasına rağmen `since October of 2012` parçasındaki `2012` sayısını önceki cue'nun çevirisine taşımıştı. Sonuç dil bakımından akıcıydı; fakat sayı kaynak cue'dan ayrıldığı için:

- ekrandaki bilgi yanlış zamanda görünebiliyor,
- cue-bazlı sayı/anlam kapısı çeviriyi reddedip yeniden deneme ve token tüketebiliyor,
- kaynak–çeviri satır eşlemesi bozulabiliyor.

Kök neden, promptun doğal Türkçe için cümle içi yeniden sıralamaya izin verirken sayı, tarih ve özel adların **hangi cue'ya ait olduğunu** açık bir değişmez olarak tanımlamamasıydı. Ayrıca tek cue'lu cümlelerde komşu repliklerin bağlam olarak kesintisiz okunması açıkça zorunlu değildi.

## Düzeltme

Dosya ve tarayıcı çevirisinin her iki prompt sözleşmesine şu kurallar eklendi:

1. Tek bloklu cümleler dahil komşu cue'lar, anlama/terim/zamir çözümü için kesintisiz konuşma akışı gibi birlikte okunur.
2. Bağlam kullanımı cue sahipliğini, cue sayısını, sırasını veya zaman kodlarını değiştirmez.
3. Sayı, tarih, miktar, kod ve özel ad kaynakta hangi cue/part içindeyse hedefte de aynı cue/part içinde kalır.
4. Doğal Türkçe söz dizimi bu sabit anlam çapalarının çevresinde kurulur; diğer sözcükler anlam kaybı olmadan yeniden sıralanabilir.

Bu davranış, arayüzdeki transkripsiyon amaçlı “yarım kalmış cümleleri birleştir” seçeneğinden bağımsızdır. Seçenek kapalı olsa da çeviri bağlamı birleşik okunur; altyazı blokları fiziksel olarak birleşmez.

## Ret gerekçeleri

- **Cue'ları gerçekten birleştirmek reddedildi:** zaman kodlarını, cue kimliğini ve ekrandaki senkronu bozar.
- **Sayı/özel adı cümle içinde başka cue'ya taşımaya izin vermek reddedildi:** görsel zamanlama ve cue-bazlı anlam kapısıyla çelişir.
- **Her cue'yu bağlamsız, bağımsız çevirmek reddedildi:** zamir, terim, hitap ve cümle devamlarında kelime-kelime/çeviri kokan sonuç üretir.
- **Bütün sözcük sırasını kaynak cue'ya kilitlemek reddedildi:** Türkçenin doğal söz dizimini gereksiz yere bozar. Yalnız anlam çapalarının sahipliği sabittir.

## Doğrulama dökümü

### Canlı aynı-korpus karşılaştırması

Önceki koşu, 4SAPI Gemini 3.8 Flash:

- 16/16 çıktı
- 7.495 sn
- sağlayıcının bildirdiği 2.359 toplam token
- 1 sayı/cue sahipliği uyuşmazlığı: `2012` önceki cue'ya taşındı

Yeni kuralla aynı 16 İngilizce altyazı parçası:

- 16/16 çıktı
- 9.692 sn
- sağlayıcının bildirdiği 3.456 toplam token; bunun 2.326'sı reasoning
- engelleyici: 0
- uyarı: 0
- kaynak yankısı: 0
- sayı uyuşmazlığı: 0
- `Ekim 2012` doğru kaynak cue'da kaldı

Yeni çıktı ilgili satırları:

- önceki cue: `Belgede Alex'in ... görev yaptığı yazıyor,`
- kaynak cue: `Ekim 2012'den bu yana.`

Tek koşudaki token farkı fiyat veya kalıcı tüketim tahmini değildir; sağlayıcı reasoning miktarı koşudan koşuya değişebilir. Bu ölçüm yalnız daha önce tekrarlanmış somut cue-sahipliği hatasının aynı korpusta giderildiğini kanıtlar.

### Otomatik kontroller

- `node tests/subtitle-sentence-layout.test.js` — geçti
- hedefli Python prompt sözleşmesi testi — geçti
- `npm test` — geçti; backend 180/180, tam paket yeşil
- `npm run test:electron-bridge` — geçti
- `backend\venv\Scripts\python.exe -m py_compile backend\transcribe.py` — geçti
- `node --check src\main.js` — geçti
- `node --check src\subtitle-sentence-layout.js` — geçti
- `git diff --check` — geçti

### Sınır

Canlı A/B kanıtı tek sağlayıcı, tek model ve 16 parçalık sabit korpus içindir. Kural dosya çevirisi ve tarayıcı çevirisi yollarında uygulanmış ve sözleşme testleriyle korunmuştur; her modelin bütün içeriklerde aynı üslup kalitesini vereceği iddia edilmez.
