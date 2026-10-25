# 562 — Kitap rafından üretilmiş sesli kitabı açma

Mevcut M4B export yalnız dosya yolunu döndürüyordu; projede kayıt bulunmadığından bağlı kitap rafı çıktıyı açamıyordu. Yeni başarılı dışa aktarımlarda projeye son M4B'nin kimliği, yolu, boyut/zaman bilgisi, süresi ve kapsadığı bölüm/metin hash'leri kaydedilir. Güncel proje tekrar yüklenerek yazılır; export sırasında kaydedilen okuma konumu eski snapshot ile ezilmez.

Kitap kartında ve üretim alanında **M4B’yi dinle** eylemi uygulama oynatıcısını açar. Raf kartı bölüm sayısını gösterir; kısmi dışa aktarım tam kitap diye sunulmaz. Metin sonradan değişmişse önceki sürüm etiketi görünür; eski kayıt yine açıkça dinlenebilir. Dosya taşınmış/değişmişse düğme devre dışı ve açıklama görünür. Eski export kimliği, sembolik dosya ve değiştirilmiş boyut/zaman bilgisiyle playback izni verilmez. Toplu metadata sorgusu en fazla300 raf kimliğiyle sınırlı; proje/raf bağı doğrulanır, path verilmez, gezinme sonrası bayat UI yanıtı kullanılmaz.

Önceden dışa aktarılmış ve projede kaydı olmayan M4B'ler otomatik taranmaz. Bir kez yeniden M4B dışa aktarmak yeterli; mevcut onaylı bölüm sesleri kullanılır, TTS yeniden üretimi gerekmez. Son çıktı kaydı tutulur; çıktı geçmişi özelliği eklenmedi.

Doğrulama: hedefli11 sonuç geçti; gerçek FFmpeg iptal testi dahil. Metadata seçili bölüm, eski export kimliği, değiştirilmiş metin, değiştirilen/silinen dosya ve sorgu sınırı negatif kontrolleri geçti. Native Windows ayrı profil `.uiprev/book-reliability549-1792902998982`, exit0: gerçek2bölümlü M4B/FFprobe, raf kartındaki gerçek düğme, uygulama oynatıcısında readyState>=2 decode. EN/açık ve TR/koyu raf görüntüleri incelendi. Kontrollü sinüs ses kullanıldı; gerçek model kalitesi/GPU, kişisel start.bat, DRM/canlı sağlayıcı/CI doğrulanmadı.

Yeni bağımlılık yok. Proje version1'e opsiyonel `audiobook` alanı eklendi; eski projeler bunu gerektirmez. Yeni `book-audiobooks` ve `book-audiobook` eylemleri mevcut yetkili workflow IPC kanalı üzerinden çalışır. Ana dala merge yapılmadı.
