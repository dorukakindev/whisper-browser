# Rapor553 — Okuyucuda bayat yanıt, metin kaydı ve grup dinleme

2026-10-25 06:56 Europe/Istanbul; repo https://github.com/dorukakindev/whisper-browser, dal codex/book-reliability549, PR487. Başlangıç9d9ac8a9893769fd782d05d7e85f040de74b590e; bitiş ürün18630529c54c793ad2dae3b7bfeb41c6b4aae122. Yedek/kurtarma paketi yapılmadı.

- `src/renderer/media-workflows-ui.js`: readChapter istekleri sıra kimliği taşır; geç gelen eski chapter yanıtı son seçimi ezmez, kapatılmış reader'a içerik dönmez. closeReader istek kimliğini geçersizleştirir. Eski audio metadata/ended callbackleri bağlı olmayan kaynaktan autoplay/sonraki bölüm başlatmaz.
- Aynı dosya saveChapter artık proje/bölüm/draft anahtarını IPC öncesi yakalar. Başka projeye geçildiyse eski yanıt onu değiştirmez; silinen draft yalnız kaydedilen eski anahtar olabilir. IPC beklerken bağlı textarea'da yazılan yeni metin draftta korunur. Bu otomatik disk kaydı değildir; mevcut Kaydet iş akışı korunur.
- Kitap Review grup dinleme: sayısal/pozitif aralık kontrolü, eski isteği iptal, metadata handlerını src atamadan önce kurma, panel/proje/bölüm değişince geç sesi başlatmama. Cleanup, kapatmada pending handlerı kaldırır. Onay popupı açılırken proje/bölüm/output yakalanır, değişirse onay farklı gruba uygulanmaz.
- `src/media-workflows.js`: negatif başlangıçlı review grubu manuel ready yapılamaz; symlink ses yerine gerçek dosya gerekir. Failed statüsü zaten reddediliyordu; bu negatif örnek de sınandı.
- `tests/reader-navigation-races.test.js`: gerçek save/read fonksiyonları kontrollü ters sıralı IPC yanıtlarıyla çalıştırılır; draft/proje/son gezinme/kapanış. `tests/book-reliability.test.js`: failed/negatif zaman grubu reddi, mevcut pozitif onay ve export akışı.

Hedefli7dosya `tmp/final553.log`:19PASS/0FAIL. Native Windows Electron `tests/electron-book-reliability.smoke.js` exit0; `.uiprev/book-reliability549-1792900582370` gerçek PDF/Review/M4B/EN-TR açık-koyu akışı. Görünüm değişmedi. Aralıklı native approval timeoutın kök nedeni kesinleştirilmedi; tek başarılı koşumla tamamen çözüldü denmez. Yeni dinleme uçları için JSDOM/VM kanıtı gerçek codec/GPU/YouTube yerine geçmez. Syntax/diff geçti; yeni bağımlılık/kurulum/şema yok. Kişiselstart.bat/DRM/liveAPI/CI beklenmedi. Bilinen fixed-sleep26>21 açık.

Sonraki odak: dublaj oturum değişimi ve kalite-plan kimliği, ardından ses için çeviride anlam kaybı/timing. Daha önceki yedek denemesi tmp'de ertelenmiş, otomatik uygulanmaz. Ana master ve kişisel dosyalar korunur.
