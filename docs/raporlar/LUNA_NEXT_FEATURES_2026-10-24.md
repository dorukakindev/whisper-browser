# Luna v1.6.7 — sonraki anlamlı aktarımlar

24 Ekim 2026, kaynak karşılaştırması; ürün değişikliği veya yeni bug teyidi değildir.

## Kaynak ve yöntem

GitHub resmi releases API bu turda Python urllib ile okundu: en yeni prerelease v1.6.7, yayımlanma 2026-10-22T23:01:09Z; kaynak 3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6. Daha eski v1.6.5/v1.6.3/v1.6.0 ile tarih karşılaştırıldı. Yerel doğrulanmış kaynak ZIP'inden ilgili TSX ve model dosyaları okundu. Bu çalışma Luna'nın gerçek çalışan servislerinin uçtan uca doğrulaması değildir.

Sürüm: https://github.com/Nothingman333/Luna-Player/releases/tag/v1.6.7

## Öncelik sırası

1. **Film bazında yorum analizi ve karar ekranı.** Bizde kişisel Letterboxd CSV/ZIP yorumlarından zevk profili var. Luna FilmReviewAi.tsx ise seçilen eser için Letterboxd yorumlarını getirip ortak düşünce, ayrışma, övgü/eleştiri ve kişisel uyumu analiz ediyor; spoiler düğmesi ve durdurma var. FilmDecision.tsx ayrıca yerel yorum içe aktarma, önceki analizler ve izledikten sonra gerekçeli beğeni kaydı sunuyor. Bunlar mevcut profil aktarımıyla aynı özellik değil. Bizde uygulanacak sürüm kaynak alıntıları, doğru film/yıl/film-dizi kimliği, sınırlı istek, önbellek, iptal ve profil onayı taşımalı. Yerel anahtar sözcük puanı gerçek AI sonucu veya beğenme olasılığı gibi sunulmamalı. Dış site erişiminin değişebileceği hesaba katılmalı.
2. **Birleşik medya yedeği ve geri yükleme önizlemesi.** Luna Backup.tsx günlük/haftalık seçili klasör yedeği, saklama sınırı ve geri yükleme farklarını gösteriyor. Bizde workspace-package.js mevcut altyazı/katalog dosyalarını paketliyor ancak yeni medya rafı/zevk profili/kütüphane klasörleri ve torrent indekslerinin tamamını kapsamıyor. Yeni kayıtları sürümlü pakete almak, önce güvenlik kopyası ve geri yükleme farkı göstermek gerekir. Anahtarları başka endpoint ile eşlememek; medya dosyası yedeği ile kayıt yedeğini ayırmak şart.
3. **Kütüphane sağlığı.** Luna LibraryHealth.tsx kayıp yollar, kopya dosyalar, sample klipler, eşleşmeyen başlıklar ve yanında altyazı bulunmayan filmleri tarıyor. Bizde klasör taraması ve sürüm gruplama var; bunlar bütünlük raporunun yerini tutmuyor. Bizim sürüm gömülü altyazıyı da kontrol etmeli, tarama iptal edilebilmeli; silmek yerine önce rapor/klasörde göster ve seçili dosyalarda mevcut Whisper kuyruğuna gönder sunmalı.
4. **Kendi arşivinden bu akşam seçimi.** TonightPicker.tsx zaman bütçesi, ruh hali, izlenmeyen film/sıradaki bölüm ve son önerileri tekrarlamama içeriyor. Bizde Keşfet ve sıradaki bölüm var, zaman/ruh haliyle kendi arşivinden açıklamalı seçim yok. Sonuç açıklaması ve süre verisi belirsizliği görünür olmalı; zorunlu AI çağrısı gerekmiyor.
5. **Asistanın konuşma araçları.** AssistantTools.tsx konuşma içinde arama, yanıt sabitleme, düzenle-yeniden gönder, kod/metin kopyalama, Markdown/TXT dışa aktarma ve kurtarma sunuyor. Bizde ortak asistan/balon ve kaynak bağlamı var. Bunların üstüne araçları eklemek daha doğru; mevcut bağlam ve sağlayıcı güvenliğini Luna motoruyla değiştirmemek gerekir. Ayrı panel kopyaları yerine aynı konuşma kimliği korunmalı.
6. **Ses profillerini tüm oynatıcılarda tutarlı yapmak.** PlaybackExtras.tsx film/müzik için ayrı profil, gece modu, normalizasyon, konuşma belirginliği ve EQ sunuyor. Bizde benzer browser ses özellikleri mevcut; bunları yeniden özellik diye saymıyorum. Eksik entegrasyonlar ölçülerek native mpv ve dublaj dinleme tarafında ortak profil/ayar açıklaması düşünülebilir. EQ, TTS'nin duygu veya telaffuz üretimini düzeltmiş sayılmaz.

## Alınmayacak veya tekrar edilmeyecek parçalar

Whisper transcribe, ses için çeviri, VoxCPM2, referans ses ve dublaj senkron motoru korunmalı. Browser, torrent, yerel dosya, global asistan, tür temelli Keşfet ve kişisel zevk profili zaten PR482 kapsamında var; yeniden eksik diye sayılmamalı. ClipMaker tek başına yeni özellik değil; bizde klip dışa aktarma var. Eğitim/Anki kelime ezberi kapsam dışı. Trakt gibi hesap yazımları ayrıca açık kullanıcı talebi ve hesap bağlantısı olmadan açılmamalı.

Luna GPLv3 kaynakları ile bu projenin lisansı farklıdır. Bu rapor ürün kodu kopyalama teslimi değildir; bağımsız uyarlama ve entegrasyon tasarımı önerir. Kod yeniden kullanımı ayrıca lisans açısından değerlendirilmeli.

## Doğrudan kaynaklar

Tüm yollar https://github.com/Nothingman333/Luna-Player/blob/v1.6.7/app/src/ altında:
- FilmReviewAi.tsx, FilmDecision.tsx, filmReviewModel.ts
- Backup.tsx, backupModel.ts
- LibraryHealth.tsx, healthModel.ts
- TonightPicker.tsx
- AssistantTools.tsx
- PlaybackExtras.tsx, playbackExtrasModel.ts

Bizde karşılaştırılanlar: src/workspace-package.js, src/renderer/media-home.js, src/renderer/assistant-overlay.js, src/renderer/global-assistant.js ve 24 Ekim 1529/1642 devir notları. Kişisel medya, gerçek dış yorum servisi ve canlı sağlayıcı çağrısı kullanılmadı. Ürün kodu değişmedi; ürün testi gerekmiyor.

## Uygulama güncellemesi — 24 Ekim 2026, 17:18

Altı öncelik bağımsız kodla eklendi. [Kullanım, gerçek kapsam ve Windows kanıtları](LUNA_MEDIA_TOOLS_2026-10-24.md). Önceki maddeler araştırma anını anlatır; uygulanmış özellikleri yeniden eksik saymayın. Özellikle normal Chromium video ses yolu, canlı yorum sitesi/model kalitesi ve yedek dışı WAV/medya dosyası sınırları teslim raporunda açık.
