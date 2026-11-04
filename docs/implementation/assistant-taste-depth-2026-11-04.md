# Asistan ve zevk profili — uygulama planı

Başlangıç: `fa3faf170986c8afaa99017d34cdf25d9d663190`. Electron/vanilla JS ve mevcut IPC/oynatma/kalıcılık sahipleri korunur. Kullanıcının sürekli uygulama/merge yetkisiyle soru ve yeni maket onayı beklenmez. Önceki işler birleştirildi; bu kayıt yeni kapsamdır.

## Hedef ve görsel kompozisyon

Profil, yalnız histogram ve ayar formu olmaktan çıkar: kullanıcının açık tercihleri, puanlardan desteklenen eğilimler, karşıt kanıt ve eksik veri birlikte anlaşılır olur. Asistan bu özeti koşullu öneriler ve açıklamalar için okur; özel not/yorum içeriği talimat sayılmaz, izlemek veya yazı okumak beğeniye çevrilmez.

Grafit/amber ve IBM Plex Sans; üstte mevcut profil kimliği ve gerçek kapsam özeti, altında ortak SegmentedControl ile **Özet / Tercihler / Yorumlar ve kanıtlar**. Özetin ana alanı kanıtlı eğilimler ve açıklamalı kütüphane önerileri, yan alanı kullanıcının açık öncelikleri ve verinin sınırları. Formlar Tercihler'e, yorumlar/analiz/alıntı kanıtları üçüncü sekmeye taşınır; hiçbir mevcut kontrol silinmez. Dar görünüm tek sütun; sekme ve kaynak açma hareketleri ortak kısa transform/opacity, azaltılmış hareket ayarı korunur. Yeni sahte afiş/puan/yüzde veya fixture ürün verisi yok.

## Sıralı teslimler

- [x] A — Profil motoru: kararlı tercih/kanıt kimlikleri, veri kapsamı, puan temelli olumlu/olumsuz eğilim ve küçük örnek uyarıları, doğrulanmış analiz güncelliği; gerçek katalogdan açıklamalı ve deterministik öneriler. Okuma/izleme tek başına beğeni sayılmaz.
- [x] B — Asistan bağlantısı: mevcut get_taste_profile sözleşmesini zenginleştir; gerçek kütüphane önerilerini kanıt/eksik veri/koşullarla okuyabilen araç. Genel tercih değişikliği eklenirse mevcut açık önizleme/onay kapısından geçer; sessiz mutasyon yok. Profilin soruya dayalı sabit verisiyle çalış; yanlış kesinlik/olasılık üretme.
- [x] C — Profil ve asistan arayüzü: tam kompozisyonu mevcut tasarımda uygula, sekmeler, okunabilir kaynak ve güven etiketleri, öneriden film detayı/asistan bağlantısı; mevcut quiz/import/weights/avoid/note/reviews/analiz/export erişimi korunur. Kaydedilmemiş tercih taslağını ve geç sonuçları koru.
- [x] D — Kısa davranış testleri, bir geniş/bir dar izole Electron görüntüsü ve kod incelemesi; ürün/belge commitleri ayrı, PR/master/ana kopya kimliği doğrulaması.

Dosya sınırları: profil hesabı `src/media-taste.js`; sözleşme/kalıcılık `src/media-shelf-service.js`; asistan yetenekleri ve library adapter; UI `src/renderer/media-taste-ui.js` ve CSS. Yeni bağımlılık/hesap yok. Geçerli tercih verileri kaybolmaz. Kişisel dosyalar ve korunan envelope dosyaları stage edilmez. Computer Use, dosya izin penceresi, CPU/matris/tam suite yok; yalnız anlamlı kısa kontroller. `[skip ci]`.

## Gerçekleşen sözleşme ve sınırlar

Profil; preferencesRevision/evidenceRevision/coverage/signals/analysisState ve en fazla6 açıklamalı öneri döndürür. Doğrudan film+dizi puanları, tekrar saymama, güncel kişisel tepki/oynatma projeksiyonu korunur. Tür/yönetmen metadatası hikâye/oyunculuk kalitesini ölçmez; öncelikler bu sıralamada ölçülmüş gibi sunulmaz. recommend_from_taste salt okunur; update_taste_preferences mevcut uygulama onay kartı + revizyon kontrolünden geçer. Profil UI sekmeleri aynı taslak DOM’unu tutar. Son kayıt: `docs/devir/2026-11-04-2341.md`; son uzak/yerel kimlik merge sonrasında okunur.
