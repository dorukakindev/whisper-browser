# Bilinen güncel durum — eski bulguyu tekrar yeni keşif sayma

Bu paket SNAPSHOT.json'daki sabit Git kimliğinden üretildi. PR496/497/498 dahil; önceki ab2fad0a/2aac264d kaynak paketleriyle karıştırma. Rapor597/598/599 ve50maddelik liste kaynak paketinde mevcut.

## Son kapanan veya geliştirilenler

- Manga için ayrı endpoint+boş anahtarda çeviri key'i devralınmaz; açık inherit ayrı politikadır. Kendi key'i korunur. Fetch sınırı kontrollü testli.
- Türkçe negatif fiil kökleri JS/Python tarafından ortak JSON listesinden alınır; -meden/-madan,-meksizin/-maksızın,-meyince/-mayınca son PR'da eklendi. Bu tam morfoloji/semantik garantisi değildir; yeni karşı örnek yararlıdır.
- Binlik miktarlar yalnız bağlama duyarlı; işaret/para/yüzde ve leading-zero koruması var. 0.500kg'nin noktasının silinmesi kapatıldı. SPOKEN_TEXT_VERSION v6; eski cache dosyası silinmez.
- Ters süreli veya bozuk timestamp'li konuşma sessizce düşürülmez; plan açık hata verir. Dış eski patch'in uyarıyla atlama politikası kabul edilmedi.
- Kompakt SRT find aramaları cue penceresine sınırlı; eski O(N²) bulguyu yalnız eski kod ölçerek yeni hata sayma.
- Cache WAV örnekleri65536framebloklarla taranır; NaN/Inf/dijital sessizlik speech cache'i değildir. Failed timeline placeholderı oynatılabilir olsa da başarılı speech sayılmaz.
- Worker stdin sınırlı okunur; id/args doğrulanır. start sırasında await rezervasyonu var; doğrulanmış terminate aktif run'ı tek kez bitirir. CUDA/Python runtime env kimliği warm reuse'a dahil.
- Aynı yerel ses seçimi aynı opaque playback ID'sini kullanır; indeks şeması/limit ve grant kapıları var.
- USA/UK regex'indeki gerçek backspace ve English I/ı intent sorunu kapatıldı.
- Hero gezinme,gereksiz Keşfet başlığının kaldırılması,oturum kartının yalnız ana sayfada oluşu,kompakt PDF/EPUB/ayar araçları ve galeri yeniden çizim odağı önceki PR'larda var.

## Eski test beklentileri

Keşfet `.md-heading h1` artık yok. Tab fontu IBM Plex Sans; olmayan başlıkta Sora beklemek ürün kusuru değildir. Bazı asistan özet/açıklama eylemleri kullanıcı tıklamasıyla doğrudan çalışır; eski ikinci onay beklentisi güncel kaynakla karşılaştırılmalı. Kütüphaneye eklenen keşif kaydı yeni MediaTitleUI ayrıntısında açılır, eski yönetim diyaloğu beklenmemeli. Tema RGB değerinin değişmesi tek başına okunmazlık kanıtı değil; gerçek kontrast/etkileşim ölç.

## Açık araştırma alanları

Video sonuna taşan son cue için tolerans/konuşmayı koruma politikası; doğrulanmış cache ile metadata/kimlik/bozuk sesin tüm yaşam döngüsü; iptal-tamamlanma yarışlarının kalan bileşimleri; aynı kaynak içinde metin/bölüm/araç revizyonları; semantik korumada henüz kapsanmayan küçük anlam farkları; gerçek model işitsel kalitesi ve site/DRM davranışı. Bunlar kesin bug iddiası değildir. Bazıları önceki raporda SUSPECTED veya yalnız statik kanıttır.

## Ortam sınırı

Bu paket kişisel anahtar/profil/model içermez. Önceki Windows hedefli kontroller tarihsel kanıttır; kendi ortamında tekrar doğrula. Gerçek GPU/TTS/Cloudflare/hesap/DRM kabulü model-free teste eş değildir. Sonuca ulaşmak için ürün güvenliğini veya test eşiklerini gevşetme.
