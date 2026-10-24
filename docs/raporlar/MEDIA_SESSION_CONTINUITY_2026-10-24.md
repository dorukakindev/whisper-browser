# Ana sayfa / Browser / oynatıcı oturum sürekliliği

2026-10-24 Europe/Istanbul. Başlangıç `abc496ad71a9fdee9d0e57553429f9182c859a00`; bitiş ürün kodu `93e98c269f190c351be31b9520e61fdb03c713a6`. Dal `codex/luna-media-home532`, PR https://github.com/dorukakindev/whisper-browser/pull/482 .

## Yapılan iyileştirme

Kullanıcı bu turda önerdiğimiz uygulanabilir iyileştirmeler için yetki verdi. Kapsamı yeni motor/model eklemek yerine günlük medya geçişlerini güvenilir yapmak olarak seçtik:

- Yerel oynatıcı başlığındaki eski çıkış oku **Ana sayfa / Home** ev düğmesine dönüştürüldü. Backspace ve düğme aynı ortak dönüşe gider. Eski closePlayer temizleme yolu, yeni medya shell'i yoksa fallback olarak durur.
- Ana sayfada **Açık oturum · duraklatıldı** alanı başlığı/konumu, altyazı ve dublaj durumunu gösterir. **Oturuma dön** mevcut videoyu yeniden yüklemeden açar; **Ses hazırlığı** aynı kaynakla mevcut hazırlık ekranına gider.
- Browser'dan dönüş açık native videoya pause komutunu gönderir. Yerel video da pause edilir. Dublajın opaque descriptor'ı, miks ve offset kaydedilip mevcut güvenli stop yolu ile audio/timer'ları kapatılır; geri dönüşte aynı descriptor mevcut restore sınırından yüklenir. Gizli oturumda dublaj çalmaya devam etmez.
- Sekme/video/altyazı üretim durumuna dokunulmaz. Oturuma dönüş oynatmayı otomatik başlatmaz. Başka kaynak açılmışsa bayat oturum kartı temizlenir; geciken dönüş/yineleme yeni kaynağı gizlemez. Aynı tuşa hızlı tıklamalar tekilleştirilir.
- `setWorkspaceMode` başlığı dosya adına döndürebildiği için açık oturumun görünen başlığı ayrıca korunur.
- Alan EN/TR ve mevcut Luna renkleriyle çalışır; dar ekranda düğmeler düzgün sarılır. Yeni API key, bağımlılık, motor, şema veya launcher değişikliği yok.

## Doğrulanan kökler

1. Önceki Browser Home yalnız native görünümü gizliyor, sayfadaki gerçek videoya pause göndermiyordu. İzole gerçek Browser MP4 oynatıldı; yeni Home sonrası `paused===true` ve native view gizli. Aynı sayfa sentinel'i 42 kaldı, reload olmadı.
2. Yerel closePlayer yolu `cuesRaw`, wordSegments, edit/repeat state'i ve HLS oturumunu temizliyordu. Ortak Home bu temizlemeye uğramadan çalışma alanını saklar. Gerçek IPC testinde key/generation/currentSrc/cues/position/title aynı kaldı.
3. Dublaj controller görünmez context'i uyumsuz sayıp remove ettiği için yalnız gizleyerek ses bağlantısının sürmesini beklemek güvenilir değildi. Açıkça snapshot + stop + source-guarded restore mevcut sözleşmesini kullandık. Aynı opaque voice ID ve 0.2sn offset geri geldi; videonun/sesin pause durumu doğrulandı. TTS üretimi yapılmadı.

## Test/kanıt

- Gerçek Windows Electron `tests/electron-media-home.smoke.js` (`WHISPER_NATIVE_TEST=1`, mevcut ffmpeg/Python ve mpv): geçti. Sentetik yerel MP4 + ayrı sentetik m4a, altyazı ve 1.25x hız; Home sırasında sessizlik, aynı video/cue/generation/başlık/konum ve voice ID/offset dönüşü; önceki native mpv/dublaj/asset/relink akışları da geçti. Son kanıt `.uiprev/media-home-smoke/1792849283485-25192`.
- `tests/electron-media-discovery.smoke.js`: geçti. Gerçek Browser içindeki sentetik HTTPS MP4'ün Home'da pause edilmesi, native view gizlenmesi, aynı sekme/sentinel/cue/iş state'ine geri dönüş; 1440/TR ve 680/EN. Önceki Discover/asistan/Defuddle adımları geçti. Kanıt `.uiprev/media-discovery/1792849226378-18404-fixture`.
- `node tests/player-ui.test.js`: **153 geçti**. İlk koşuda iki eski test fixture'ı kırmızıydı: `type: browserMode` ifadesini birebir arayan regex yeni torrent/stream önceliğini tanımıyordu; yalnız VM'deki sahte document'ta body eksikti. Regex yerine gerçek tür ifadesi browser/torrent/stream/local için çalıştırıldı; fixture'a gerçek shell'de olan body eklendi. Eşik gevşetilmedi, davranış kontrolü korundu.
- `node tests/media-home-model.test.js`: **4 geçti**; `node tests/preload-sandbox.test.js` geçti.
- Değişen JS/test syntax ve diff kontrolü geçti. Sentetik [oturum alanı](assets/media-session-2026-10-24/session.png), [dar ekran](assets/media-session-2026-10-24/compact.png), [açık tema](assets/media-session-2026-10-24/light.png) doğrudan incelendi.

## Sınırlar

Bu kart **aynı uygulama oturumuna** aittir; yeniden başlatmada açık native medya nesnesini geri getiren yeni bir kalıcılık sistemi değildir. Yeniden açılış için mevcut izleme geçmişi/altyazı/dublaj descriptor kalıcılığı geçerlidir. Bu tur çeviri/TTS kalitesini veya timeout üretim hatalarını incelediğimizi iddia etmiyoruz; motorlar değişmedi. Gerçek sağlayıcı/model, canlı YouTube videosu, DRM/GPU ve OS PiP/fullscreen bu turda denenmedi. mpv geçişi ve sentetik medya kullanıldı. Tam test paketi/CI beklenmedi; kapatılmadı. Start.bat/install.bat değişmedi, otomasyon doğrudan Electron'dadır. Ana master'a merge yapılmadı; önceki Luna çalışmalarıyla aynı PR'dadır.
