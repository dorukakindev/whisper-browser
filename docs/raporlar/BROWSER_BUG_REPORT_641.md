# Rapor 641 — Whisper hazır çıktı seçiminin doğruluğu

Başlangıç `19d5fb49cf543892da8aecad50190d451bf297f7`; iki ilişkili hazır çıktı hatası doğrulandı.

## Hatalar

- `startBrowserYoutubeWhisper` kaynak izinin yalnız path/role/generatedBy/aralığına bakıyordu. `status:partial`, `failed>0` veya `captureComplete:false` bir izde bile transcription completed/reused dönüyordu. Bu izler artık tamamlanmış sayılmaz; gerçek Whisper yolu çalışır. Eski durum metadatası olmayan izlerin geriye uyumu korunur; açık başarısızlık kanıtı asla yok sayılmaz.
- Normal altyazı çevirisinde seçilmiş model/sağlayıcı kontrolü yalnız `forSpeech` içinde yapılıyordu. Yeni model/sağlayıcı seçilse bile eski çeviri reused oluyordu. Kontrol bütün çevirilere uygulanır. Yeni çeviri gerekirse mevcut sağlam kaynak yeniden transcribe edilmez. Normal çıktı kaydında da dondurulmuş işin model/endpoint bilgisi korunur; o anda değişmiş olabilecek UI değerleri kullanılmaz. Bilinmeyen eski çeviri kimliği seçilmiş sağlayıcıyla aynıymış gibi varsayılmaz.

## Kanıt ve sınırlar

`browser-whisper-reuse641.test.js` gerçek renderer fonksiyonlarını çalıştırır. İlk iki senaryo eski kodda reused:true yüzünden kırmızı; düzeltmeden sonra kısmi/başarısız/eksik capture kaynakları Whisper'a gider. Model veya endpoint değişimi yalnız çeviri işini başlatır; tam eşleşme/trailing slash hâlâ reuse eder. Normal çıktı kaydı dondurulmuş ayarları korur.

`browser-youtube-whisper.test.js`, `subtitle-output-contract.test.js`, yeni regresyon: 5/5 test girdisi geçti; mevcut kapsam çok sayıda assertion içerir, bunlar ayrı bug sayılmaz. Önceki asistan kabul testleriyle birlikte ilk kontrol8/8 idi. Syntax/diff temiz. UI markup, bağımlılık ve kalıcı şema değişmedi; yeni ekran görüntüsü alınmadı. Gerçek YouTube, model/GPU, paid API veya start.bat doğrulaması değildir. CI arka planda kalır, beklenmez.
