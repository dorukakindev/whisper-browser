# Rapor 596 — Claude ara-v3 test tesliminin kabul incelemesi

Tarih: 2026-10-26. Bu tur ürün kodu değiştirilmedi. Başlangıç ve bitiş ürün ağacı b03462ce09b9f497ad89871ba4a0729efc64e91e üzerinden aynıdır; son ürün commit'i 34185f96bcc5ca8c13b79be88678c3e852d36a5e. Yerel kişisel OFFLINE-MANIFEST değişikliği kapsam dışıdır.

## Paket ve sayım

Kullanıcının files (1).zip teslimi üç dosya içerir: audit-output-ara-v3-test-kosusu.zip, TEST-RUN-DETAILED-ara-v3.md, PER-TEST-RESULTS-ara-v3.csv. Dış/iç ZIP CRC kontrolü geçti; iç ZIP 818 kayıt içerir. CSV bağımsız ayrıştırıldı: 777 test DOSYASI kaydı, 747 PASS, 25 FAIL, 2 FAIL_PACKAGE_LIMITATION, 3 NOT_RUN. Bu sayılar assertion veya benzersiz ürün hatası sayısı değildir.

| Koşucu | Dosya | PASS | FAIL | Paket sınırı | Çalışmadı |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node | 570 | 568 | 0 | 2 | 0 |
| Python | 120 | 120 | 0 | 0 | 0 |
| Electron | 87 | 59 | 25 | 0 | 3 |

Harici koşum kaynak kimliği 2aac264de454a96e10f543f37de8bba995a48dc7. İnceleme anındaki güncel master b03462ce09b9f497ad89871ba4a0729efc64e91e; PR494/495 arayüz değişiklikleri harici snapshot sonrasıdır. Ubuntu24/1CPU/xvfb/Node22/Python3.12/Electron43.5 ortamı Windows start.bat doğrulaması değildir.

## Ham günlüklerden ayrıştırılanlar

- conflict-markers ve docs-index-integrity paket sınırlamasıdır: ZIP'te .git ve dışlanan tarihsel belgeler bulunmaması. Güncel kaynak hatası diye sayılmaz.
- browser-chrome-design: beklenen rgb(161,173,183), gerçek rgb(165,165,175). media-catalog: beklenen rgb(10,12,15), gerçek rgb(8,8,9). Salt RGB farkı açık tema veya görünmezlik kanıtı değildir; değişmiş tema sözleşmesiyle karşılaştırılmalıdır. ui-locale farkı eklenen “In progress” menü öğesidir; günlük görünür kalan Türkçe listelerini boş bildirir.
- browser-menu-visual desktopCapturer içinde uygulama penceresini bulamamış. subtitle-output alt Electron root/no-sandbox yüzünden başlamamış. journey-full model indirme DNS hatası almış. Bunlar aynı şekilde ürün bugı ilan edilemez.
- app-settings secure settings save, metadata-settings saved, book-assistant request5, gallery images, Discover wheel scroll ve media-polish search zaman aşımları gerçek başarısız koşumlardır; güncel Windows kök nedenleri bu paketten kanıtlanmaz. D-Bus uyarısı tek başına safeStorage başarısızlığı kanıtı değildir. P20 probe kaynak dosyası vardır; isEncryptionAvailable sonucunu gösteren bağımsız çıktı bu incelemede bulunmadı.
- ui-narrow-tr, 640px ve1.5 ölçeğinde #pdfReaderOpen öğesinin kırpıldığını bildirir. Güncel tasarımda yeniden koşulacak somut adaydır; eski snapshot görüntüsü güncel ürün kusurunun teyidi değildir.
- media-home eski gezinme beklentisinde, foursapi-provider-ui boolean kontrolünde; review-workflow Save failed ile kırmızı. book-reliability/browser-extras log sonlarında açıklayıcı assertion bulunmuyor. Bunlar kapatıldı veya yalnız ortam kaynaklı denmedi.
- 150sn dış limitinde -9 ile sonlandırılan işler normal test sonucu değildir. Bazı günlüklerde Update check error unhandled rejection var; sonlandırmanın kök nedeni bunun olduğu kanıtlanmadı. queue-cancel-mid logu doğru paused/3pending durumuna ulaşmış olsa da tüm senaryo geçti sayılamaz.
- Üç canlı sağlayıcı/site testi NOT_RUN. Gerçek model, GPU, ses doğallığı veya tüm siteler için başarı yok.

## Sürüm ayrımı ve önceki açık işler

İç pakette AUDIT-REPORT/RUN-LOG/FINDINGS v2 içeriği korunmuş; yeni TEST-RUN-DETAILED ve CSV v3 koşumunu anlatır. Eski “Electron çalışmadı” metni yeni87dosya koşumuyla karıştırılmamalı. Rapor593'te bağımsız teyit edilen anahtar devri, anlam tersine dönmesi, SRT ve sayı doğrulama sorunları hâlâ açık; bu yeni test koşumu bunların düzeldiği anlamına gelmez. Dış test kaydının PASS olması testin kapsamadığı bir hatayı çürütmez.

PR495 tesliminde güncel Windows app-settings ve book-assistant hedefli native senaryoları geçti (2026-10-26-0149/0151 devir notları). Bu tarihsel yerel kanıt, harici eski snapshot kırmızılarından ayrıdır; bu tur tekrar koşulmadı.

## Kabul ve sınırlar

Teslim test kanıtı olarak faydalıdır; uygulanacak ürün patch'i değildir. İçindeki scriptler çalıştırılmadı, hiçbir kaynak körlemesine değiştirilmedi. 25 FAIL'i 25 gerçek bug diye sunmuyoruz. Sıradaki verimli işler Rapor593'teki kanıtlı güvenlik/anlam sorunları ve güncel Windows'ta dar ekran, Discover kaydırma, kayıt ve arama adaylarının hedefli yeniden üretimidir. Tam suite tekrar edilmedi; yalnız arşiv/CSV/hamlog/içerik ve belge bütünlüğü incelendi. Bu tur yeni ürün hatası doğrulanmadı.
