# Onaylı sinematik hareket paketi

Başlangıç: master f74f63df232146320228ff8f4cc766babbbb2b3c. Kapsam yalnız Home, Keşfet ve film sayfası. Kullanıcının hareketli v3 kompozisyonu ve son üst/alt bölüm düzeltme onayı esas alındı. RSS/browser/kitap yeni tasarım entegrasyonu bu paket değildir.

## Uygulama

- Ortak hareket tokenları, ambient renk örnekleme (64 kaynak önbelleği), durağan grain, Ken Burns/parallax, görünürlük/odak durdurma. Engellenen cross-origin canvas sıcak palete düşer.
- Home ve Keşfet: decoded görsel crossfade, aktif ilerleme, hover/focus durması, tıklanabilir nokta ve klavye okları; kaynak/süre ve raf okları.
- Film: kaynak durumuna uygun orijinal eylemler, tekrar etmeyen künye, kısa içerikte dengeli hikâye, okunaklı meta/rol, büyük fragman ve sağda iki görsel, tek biçimli teknik akordeon. Günlük ve izleme durumu yan yana; bütün orijinal form, ID ve onay sahipleri korunur.
- Ana ayarlar > Görünüm > Hareket: Otomatik / Tam / Azalt / Kapalı. Otomatik sistem reduced-motion ve Windows gerçek tasarruf bayrağını kullanır; bilinmeyen pil durumu uydurulmaz. Salt-okunur IPC; gizli PowerShell Win32 sorgusu 3 saniye sınır ve 30 saniye önbellekli.
- View Transitions afiş eşleştirmesi; destek yoksa mevcut fade. Tam ekran duplicate snapshot kaldırıldı, boşta filtre yok, scroll blur adımlı.
- Yeni bağımlılık/hesap/ücretli servis yok. Sahte yorum, kullanıcı puanı veya maket kontrolü üretime taşınmadı.

## Kanıt

[Yan yana galeri](comparison.html), [performans](PERFORMANCE.md). Native görüntüler 1440/1920 ve 480 dar ekran; TMDB var/yok, kayıtlı kontrollü analiz, kaynak alıntısına gitme, gerçek select-file/unowned CTA ve onay sahibi kontrolü. 41 hedefli test geçti. 22 JS syntax ve 5 CSS jsdom parse geçti. İlk sandbox test denemesi spawn EPERM nedeniyle koşmadı; yetkili son koşu geçti. Ayrı CSS parser paketleri bulunmadığından yeni bağımlılık kurulmadı, mevcut jsdom kullanıldı.

Native testler gerçek Windows main/preload/renderer kullanır; metadata/ağ ve kaydedilmiş analiz kontrollüdür. Thumbnail fixture'ı aynı test görselini farklı geçmiş öğelerinde tekrarlar; gerçek kişisel arşiv kanıtı değildir. Canlı TMDB/Letterboxd/AI çağrısı, kişisel profil ve video/ses üretimi sınanmadı.

## Açık sınırlar

**20 ms maksimum frame hedefi karşılanmadı.** p95 yaklaşık 7 ms olsa da ilk detay geçişinde maksimum 97,2 ms gözlendi; gizlenmedi. 60 saniye aktif hero CPU ortalamaları 1440'ta %1,404 ve 1920'de %2,485. Ölçüm yöntemleri ve karma film revizyonu PERFORMANCE.md'de. Bu paket kusursuz performans veya kompozisyonla piksel eşitliği olarak sunulmaz.

0/200/600/900 ms kareleri 1440 genişliktedir; native capture ve IPC süresi nedeniyle yaklaşık zaman etiketleridir, frame profiler kanıtı değildir. 1920 etkileşim frame aralıkları ayrı ham ölçümde vardır. Galerinin yanında gerçek uygulama etkileşimleri de incelendi; ileri teknik araçlar doğal form yerleşimiyle kompozisyondan içerik miktarınca uzar.

Kişisel açık uygulama kapatılmadı. Ana kopya teslimi sonrası mevcut açık pencerenin kendiliğinden yeni kodu yüklediği iddia edilmez. start.bat kaynak sürümünü yeniden açar; paketli EXE bu turda yeniden üretilmedi. Actions başlatılmadı; teslimler skip ci.
