# Rapor 410 — Browser videosunda yerel dublaj sesi

2026-10-14. Kullanıcı hazır SRT'den kendi sesiyle ürettiği yerel ses dosyasını
browser videosunun orijinal sesi yerine oynatmak istedi. TTS/mux üretimi istenmedi.

## Uygulama

Araç çubuğunda “Ses ekle / Add audio” düğmesi; yerel audio dosya seçimi.
Audio Blob URL ile yalnız renderer'da çalınır; sunucuya yüklenmez, kaynak dosya
değişmez. Dublaj boyunca ilgili webContents sekmesi açıkça muted=true yapılır.
Eski mute API'sinin parametresiz toggle davranışı korunur; bool parametre
idempotent set sağlar. Yetkisiz renderer isteği yine reddedilir.

Audio, browser medya olaylarının saatine göre play/pause/seek/playbackRate
takip eder; 200ms kontrolde 250ms üstü kayma düzeltilir. Reklam, spinner,
readyState<3 ve 2.2sn'den uzun saat kaybında durur. Sesin sonuna gelince durum
gösterilir. Sekme/video/generation/workspace değişimi veya ana oynatıcı kapatma
yerel oturumu sonlandırır. Kaynak mute ayarı geri yüklenir, Blob URL boşaltılır.
İlk mute isteği gecikirken kaldırma, dosya değiştirme, önceden muted sekme ve
autoplay/codec hatalarında cleanup gözetilir. Ses kaldırılınca dosya kaydı kalmaz.

Üst dublaj satırında dosya adı (UI çevirisine girmez), ses düzeyi, ±60sn kayma
ve kaldırma var. Pozitif kayma dublajı geciktirir. EN/TR metinler; amber tasarım
token'ları; dar ekranda ikon düğme, satırların sarılması. Kullanıcı ses seçmeden
orijinal oynatma değişmez. Oturum geçicidir; yeniden başlatmada dosya seçilmelidir.

## Doğrulama

- Yeni `tests/browser-dub-audio.test.js`: sync, pause/seek, rate, offset,
  reklam/buffering/saat kaybı, video değişimi, Blob cleanup, önceden muted ses,
  dosya değişimi, mute gecikmesinde iptal, başarısız mute ve autoplay reddi geçti.
- Aynı test gerçek main IPC handler'ında açık mute'un idempotent olduğunu,
  eski toggle'ın çalıştığını ve yetkisiz isteğin reddini doğruluyor.
- ui-locale, innerHTML ratchet, preload usage ratchet, browser-youtube-whisper
  geçti; player-ui 153/153. Ratchet'in sadece kaymış satır numaraları güncellendi.
- Main/preload/renderer ve iki yeni JS dosyası sözdizimi; `git diff --check` geçti.
- Windows Chrome gerçek renderer + gerçek 12sn PCM WAV, fixture browser saatleri:
  dosya input değişimiyle UI'dan attach, decode, play@3sn, pause/seek@8sn ve
  offset+1→7sn doğrulandı. Boş/yüklü sekmede 1400/720px görsel kontrol, mute=true
  ve kaldırmada mute=false doğrulandı. `tmp/build-dub-visual.py` / `tmp/dub-visual/`
  kişisel içerik içermeyen yerel kanıtlar; Git dışında. Ses hoparlörden dinlenmedi.

Gerçek YouTube/CDN/DRM videosuyla tam senkron, 22dk kişisel WAV, start.bat yeni
koşusu ve tüm Windows codec/DPI senaryoları doğrulanmadı. Tam test paketi
çalıştırılmadı. Audio autoplay reddi sessiz çift ses yerine dublajı kaldırır.
Tarayıcı saat olaylarının gecikmesi senkronu sınırlar; örnek/kelime düzeyinde
kesin hizalama iddiası yok. Destek Chromium audio codec'lerine bağlıdır.
Kısa ses biterse kaynak video muted kalır; kullanıcı “Sesi kaldır” ile döner.

Başlangıç/kurulum/GPU/TTS bağımlılıkları değişmedi; yeni bağımlılık yok. Yerel
File picker kullanılıyor, Node dosya okuma yetkisi genişletilmedi. NDJSON,
kalıcı profil/ayar şeması ve özel anahtar alanları değişmedi. Actions hesap
engeli önceki turda doğrulandı; uzak Windows CI başarısı iddiası yok.
