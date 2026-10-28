# Rapor 725 — Yerel dublajın ana ses kontrolü ve dört katman

## Doğrulanan kök neden
Yerel oynatıcı dublajı açarken özgün video `muted=true` yapılır. Ana mute düğmesi ve M kısayolu ise doğrudan `video.muted=!video.muted` çalıştırıyordu; dublaj açıkken kullanıcının sessize alma isteği özgün sesi açabiliyordu. Ana ses çubuğu da yalnız susturulmuş video.volume'u değiştiriyordu, dublaj katmanları bundan etkilenmiyordu. Bunlar aynı yanlış ana-ses yönlendirmesinin etkileridir; ayrı bug sayısı şişirilmez.

## Düzeltme ve dosyalar
- `src/renderer/browser-dub-audio.js`: yerel oturum ana düzeyi/ana sessizliği. Başlangıçta videonun volume/mute tercihini devralır. Konuşma/arka plan/müzik/ortam ayrı miks oranları korunur; çıkış=katman×ducking×ana düzey. Sessizlik dört audio elementine uygulanır. Kullanıcı mute tercihi kaynak geri yükleme tercihine de aktarılır.
- `src/renderer/browser-dub-ui.js`: bağlamdaki gerçekvideo.volume, sınırlı master okuma/ayar API'si, aynı medya kimliği kontrolü; ana ses durumu ve oynatma tercihleri değişim olayları. Browser sekmesi davranışı ayrı mevcut yoldadır; bu düzeltme yerel player ana kontrollerine aittir.
- `src/renderer/renderer.js`: ana düğme ve M ortak togglePlayerMute fonksiyonuna gider. Aktif yerel dublaj varsa onun ana sessizliği, yoksa eski video davranışı. Slider ve ok tuşlarının kullandığı setPlayerVolume her katmanı ölçekler; mute simgesi zorunlu susturulmuş kaynak yerine gerçek dublaj ana durumunu gösterir.
- `tests/player-dub-ui.test.js`: katman ölçekleri, mute/unmute sırasında özgün video susturma ve durdurmada geri yükleme.
- Yeni `tests/electron-dub-mix.smoke.js`: gerçek FFmpeg MP4/AAC ve12sPCM WAV, dört gerçek HTMLAudioElement, gerçek katalog/player/preload, native pencere; yalnız dosya seçici dönüşü kontrollüdür. Medya tamamen sessizdir, kullanıcıya ses çalınmaz.

Yeni bağımlılık, kalıcı şema veya IPC kanalı yok. Mevcut mix ayarları değiştirilmez. Ana volume mevcut player tercihiyle kalır; browser sekmelerinin mute IPC yoluna yeni davranış eklenmedi.

## Kanıt
`node --test --test-isolation=none tests/browser-dub-audio.test.js tests/player-dub-ui.test.js tests/dub-sync-map.test.js`:3test dosyası PASS. JS syntax/diff PASS. Mevcut geçplaypromise/iptal/kaynakdeğişimi/adaptivemap regresyonları yeniden geçti; bunlar yeni bug sayılmadı.

Windows native test PASS:
- Başlangıç master0.5, voice0.8→0.4, background0.6→0.3, music0.4→0.2, ambience0.2→0.1.
- Ana mute düğmesi özgün videoyu susturulmuş tutar; dört katman muted=true, simge aria-pressed=true.
- Unmute ve slider25: kaynak muted=true, katmanlar açık; düzeyler0.2/0.15/0.1/0.05. Ayrı miks oranları korunur.
- Duck etkin: arka katmanlar ayrıca0.35ile çarpılır; konuşma0.2kalır. Native gerçek element volume değerleri ölçüldü.
- M ile mute/unmute aynı dört katmanı yönetir. Gerçek4audio birlikteplay; pause/seek sonrası yerel6s'e±0.3s içinde gelir.
- Seçili2–10s dublaj aralığının dışında özgün video unmute, içeride tekrar mute; Stop özgün sesi geri getirir.

[Makine kabulü](evidence/R725/acceptance.json), [sessiz simge](evidence/R725/master-muted.png), [ana ses25](evidence/R725/master-volume.png). Gerçek ekranlar açılıp incelendi. Görsel kapsam yalnız mevcut ana mute simgesi/slider/dublaj şerididir; yeni geniş UI tasarımı iddiası yok.

## Kaynak ve sınırlar
Mevcut BrowserDubAudio/Mix/player kontrolü yeniden kullanıldı. [HTMLMediaElement.volume](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume) ve [muted](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/muted) birincil davranış sözleşmeleri kontrol edildi; dış repo kodu kopyalanmadı, paket/lisans değişikliği yok.

Bu test gerçek decoder/oynatım/DOM durumlarını kanıtlar; sessiz fixture donanımda işitme, miksin müzikal kalitesi veya ayırıcının konuşmayı temizlemesi kanıtı değildir. Canlı YouTube/browser webContents mute, GPU/TTS, yeniayırma, DRM, tamBAT/install, EN/darDPI görünüm, ekran okuyucu ve tamnpmtest/CI bu pakette koşulmadı. CI beklenmedi; mevcut11before-quit listener uyarısı açık. Harici ağ ve kişisel hesap/medya kullanılmadı.

P057/P058/P059 ek yerel-player kanıtı; bütün90hedef tamamlanmadı. Müzik analizi kapsamına iş eklenmedi; bu dublaj oynatım katmanıdır.
