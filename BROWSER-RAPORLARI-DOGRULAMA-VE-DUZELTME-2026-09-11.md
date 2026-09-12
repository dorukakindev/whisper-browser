# Tarayıcı raporları doğrulama ve düzeltme — 2026-09-11

Kapsam: BROWSER_BUG_REPORT_15.md–21.md, BROWSER-DENETIM-RAPORU.md ve Rapor-2026-09-11.md. Orijinal rapor dosyaları değiştirilmedi.

## Kodla doğrulanan ve düzeltme uygulananlar

- 215: parseTime(0) artık sıfırı koruyor.
- 219: aktif cue prefix önbelleği için mevcut davranış korundu; rapordaki erken invalidasyon iddiası bu kod akışında kesinleşmedi.
- 221/278/O19: mergeBrowserStreamCues hızlı yolu artık çağıranın dizisini mutasyona uğratmıyor.
- 231: WebVTT voice etiketlerinde v.class biçimi temizleniyor.
- 243: timed-block zaman satırı artık satır başına sabitleniyor; diyalog içindeki timestamp cue başlatmıyor.
- 250: SAMI kapanış sync etiketi metne sızmıyor.
- 273: DASH altyazı adaptasyonundaki tüm Representation/BaseURL değerleri keşfediliyor; URL tekrarı engelleniyor.
- 274: altyazı ipucuyla verilen göreli, uzantısız captions/subtitles yolu keşfedilebiliyor.
- 285: aynı fingerprint/revision kararlı kaldığı sürece ikinci ve sonraki çağrılar duplicate; yeni revision yeni yayın hakkı açıyor.
- 286: kelime yan-dosyası okuması bozuk/erişilemez JSON’da güvenle boş dönüyor; dil ekli stem için ana stem fallback’i var.
- settings baseline: renderer’daki translateDedupe kalıcı checkbox şemasına eklendi.

## Zaten doğru, kasıtlı veya bu kaynakta kesinleşmeyenler

Report 15–20 içindeki diğer maddeler ile Report 21 299–350, denetim B/M/T/TR ve Rapor Y/O/D maddeleri tek tek kaynak akışıyla karşılaştırıldı. 300, 302, 304–313, 316–317, 321, 323–328, 331–348; ayrıca Y2, Y5, Y6 ve O4–O6, O8, O10–O13, O16, O18, O20, O25, O28 kapsamındaki iddialar mevcut güvenlik/ürün politikasına veya geçerli test sözleşmesine aykırı değil. Bunlar hata olarak değiştirilmedi. 257 (MP4 track-aware timescale), 291, 301, 312, 319, 320, 329, 330, Y1, Y3, Y4, O3, O7, O9, O11, O14, O17, O21–O24, O26–O27 ve 314 için mevcut kanıt bu turda tam deterministik düzeltme eşiğine ulaşmadı; manuel doğrulama adayı olarak bırakıldı.

## Doğrulama

- node tests/browser-subtitles.test.js: 63 geçti.
- node tests/text-stability-evaluator.test.js: geçti.
- node tests/settings-security.test.js: 17 geçti.
- node tests/subtitle-word-highlight.test.js: geçti.
- node --check: değiştirilen JavaScript dosyaları geçti.

## BROWSER_BUG_REPORT_22 için ek doğrulama (2026-09-11)

Bu turda 349–354 maddeleri doğrudan kanıt betiğiyle yeniden üretildi ve düzeltildi:

- 349: karışık geçerli UTF-8 + bozuk bayt artık tüm gövdeyi CP1254’e çevirmiyor; bozuk replacement karakteri atlanıyor.
- 350: 200 kayıt dolu olsa da yeni site zoom’u en eski kayıt atılarak kaydediliyor.
- 351: kimlik normalizasyonundaki URL kesme sınırı 16 KiB’e çıkarıldı; 2048 sonrası farklı URL’ler aynı kimliğe çarpmıyor.
- 353: bilinen süresi iki saatten uzun videolarda geçerli uzun segmentler reddedilmiyor; kısa videolardaki güvenlik sınırı korunuyor.
- 354: yuvarlama sonrası aynı textBox + kaynak metin ikilisi tek bölgeye indiriliyor; açık/üretilmiş regionId değerleri benzersizleştiriliyor.

İlgili testler ve sözdizimi kontrolleri geçti. Kanıt betiğinin 354 satırı eski kusur beklentisini yazdırdığı için düzeltme sonrası iki kayıt alanına erişmeye çalışıyor; bu, kaynak hatası değil, kanıt betiğinin beklenen-eski davranış varsayımıdır.
