# G2 — Eski denetimin güncel kodla karşılaştırılması

Taban: `3d0e80b49a939425b69581b74b9d21586cafa7ce`. Kullanıcının aktardığı bulgular kapsamdır; eksik Claude nihai yaması mevcut sayılmadı. Geçersiz INTERIM uygulanmadı.

| Alan | Güncel sonuç / kanıt | Sınır |
|---|---|---|
| F01 anahtar devralma | Önceki mevcut düzeltme korundu; sağlayıcı/rota ve açık inherit kontrolü, mocked fetch sınırı testleri | Gerçek ücretli istek yapılmadı |
| F02 olumsuzluk, F04 geçersiz cue, F07 ayrıştırma, D1 bozuk ses | Önceki güncel korumalar ve 17:30 kaydı geçerli; eski rapor yeni bulgu sayılmadı | Modelin ses kalitesi doğrulanmadı |
| F06 / C1 | Önceki ürün `3f68edeb`: belirsiz metni değiştirmeden sayısal kanıt; geç iptalde tamamlanmış WAV korunur | GPU kapanışı ölçülmedi |
| B çeviri sözleşmesi | Gerçek main validator ile podcast çıktı eki düzeltildi; enqueue öncesi seçenekler. UTF-8/BOM/UTF-16LE/1254 ve klip kelime ofseti sınırlı kontrolleri | Canlı kuyruk/model akışı doğrulanmadı |
| C/F worker ve referans | Sekiz kısa mevcut kontrol: tek worker sahibi, completion handshake, iptal temizliği, referans byte kimliği ve prompt/cache değişimi | Gerçek 60/61 GPU takılması, sürücü ve akustik kalite doğrulanamadı |
| E kitap/PDF | Geç açılışın yeni okuyucuyu kapatması, kapatılmış okuyucunun yeniden açılması, eski bölüm isteğinin yeni konuma yazması düzeltildi. Kaynak dosya değişince kayıt reddedilir | Gerçek Windows PDF çizimi bu tur yapılmadı |
| H asistan | İkinci altyazı kimliğindeki `subPath2` hatası `sub2Path` olarak düzeltildi; eski onay okuma/seek yapamaz | Gerçek sağlayıcı yanıtı sınanmadı |
| I TMDB/Letterboxd | Mevcut kimlik, onay, replay ve sandbox hedefli kontrolleri korundu | Canlı site, hesap ve büyük katalog sınanmadı |
| K dosya/anahtar | Mevcut grant ve recovery testleri; indirilmiş podcast sesinin desteklenen gerçek uzantıyla erişim sahibine bağlanması | Windows UNC/reparse ve OS safeStorage canlı doğrulanmadı |
| T1 renk testi | 668 sabit renk → 415/419; test/eşik değiştirilmedi. Ortak renk rolleri aynı RGB ve tam alfa oranlarını korur | Eski kontrast okuyucusunun token alias desteği eksikliği tabanda da var |
| Ayarlar | Renderer ile backend arasında eksik `uiMotion` persist/sanitize bağlantısı düzeltildi; geçici disclosure/iş kapsamı alanları tercihe çevrilmedi | Kişisel profil değiştirilmedi |

Doğrulama kısa ve davranış odaklıdır. Computer Use, erişim penceresi, genişlik matrisi, CPU/performans ölçümü ve toplu suite yok. Yukarıdaki canlı sınırlar başarısızlık gizlemek için test yerine mock kabulüyle kapatılmadı. Eski raporun eksik teslim belgelerini yeniden üretmek ürün hedefi değildir; güncel uygulama düzeltmeleri kaydedilir.
