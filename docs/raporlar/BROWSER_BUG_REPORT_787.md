# Rapor787 — Grup kaydı seçimi ve browser oturumunu sürdürme

Başlangıç:27880cc98050528e7a5eb7aeb0bfb17ff52d264f. Tasarım master ec573e2168546854657f5b4b86da30425d019155 entegrasyonu dahil bitiş kodu:2e195687d7f8184536a8fccce786a4e3a0aa7e1e. Dal codex/dub-take-selection785; eski785 numarası ayrılmıştı, yayımlanan rapor güncel seride787.

## Kullanım ve kök nedenler

- Dublaj kalite sonuçlarında grubu seç → Grup kayıtları → Önceki/Kullanılan kaydı dinle → Bu kaydı kullan. Ham kayıt seçimi zamanlama/normalizasyonu yeniden kurar. Diğer grupların hazır sesi kullanılır. Tek grup yenilemesi artık seçimi ilk gruba atlatmaz. Paneli kapatmak/üretime geçmek ham önizlemeyi durdurur; arayüz dili değişikliği aynı ses kaynağını sıfırlamaz.
- Browser sağ kenar çubuğuna **Uygulama ayarları** dişlisi eklendi. Ana AppSettingsUI penceresini açar; browser ayarlarıyla aynı eylem değildir. Modal açılınca native sayfa gizlenir, kapanınca geri gelir; düğmeye odak döner. EN/TR etiketleri var.
- Ana sayfadan Browser düğmesi doğrudan openPlayer() çağırıyor, state.lastJobVideo mevcutsa son Whisper videosunu yeniden açabiliyordu. Geçerli saklanmış browser oturumunda resumeWorkspace() kullanılır. Tab/medya kimliği korunur; video duraklatılmış konumunda bekler. Ana sayfaya gitmek translation scheduler'ı iptal etmez; ayrı native testte bekleyen sağlayıcı sonucu ana sayfadayken tamamlanır, ekranı geri açmaz ve dönüşte çeviri aynı sekmededir.

## Dosyalar ve güvenli sözleşme

`src/dub-group-takes.js`: tamamlanmış job receipt/manifest üzerinden en son200 kaydı, grup başına en çok20 benzersiz immutable kaydı tarar. SHA256, kaynak, SRT hash, aralık ve recipe cache_key eşleşir. Renderer'a rastgele dosya seçtirilmez; sender'a bağlı opaque token döner, sender kapanınca temizlenir. Toplam token2000 ile sınırlıdır. `src/dub-service.js`, `src/preload.js`: yetkili dub:groupTakes IPC; seçim job'a bağlanıp özel JSON dosyası olarak Python'a geçirilir, job artifact yaşam döngüsünde temizlenir. Force-all/aynı grubu force ile seçme çatışması reddedilir.

`tools/voxcpm2/dub_take_selection.py`, `altyazi_oku.py`: hesaplanan tam recipe anahtarı, immutable hash ve okunabilir ses yeniden doğrulanır. Seçilmiş quality/review kaydı korunur, diğer gruplar değişmez; manifestte canonical cache_key korunur. `dub-generator-ui.js`, `dub-workspace-ui.js`: son istek, seçili grup ve önceki hazır sonuç ile yeniden kurma. `dub-group-takes-ui.js`, `index.html`, `media-experience.css`: ortak grafit/amber arayüz ve tek sesli ham önizleme. `app-settings-ui.js`, `media-home.js`: ana ayar düğmesi ve oturum dönüşü.

## Kanıt

- Node8 dosya/12 test PASS: group-takes, service, warm-start, workspace model/UI, preload sandbox/usage ve IPC parity. Son browser eklemesinden sonra ilgili6 dosya tekrar PASS. IPC280handle/17on,0unguarded.
- Python selected take1test PASS; recipe değişikliği, force çatışması, değiştirilmiş byte reddi ve review korunumu. JS syntax/Python py_compile/diff PASS.
- `electron tests/electron-dub-takes785.smoke.js`: güncel tasarımla gerçek Windows main/preload/renderer ve RTX4070SUPER. İki grup ilküretim → yalnız2.grup force → önceki ham2.grubu dinleme/uygulama. Üç farklı çıktıID; yeniden oluşturulan TAM WAV ilk çıktıyla byte-hash eşit. TRkoyu1360, ENaçık800/%125; uygulama düğmesi45.2CSSpx ve görünür, yatay taşma yok, raw audio gerçekten decode/play. `.uiprev/take785-1793300322835-23748/result.json`, OSexit0. Fast10adım/sesdenetimi; ASR/insan kalite iddiası yok. Bu manuel GPU testi önceki sentetik `tmp/studio781/reference.wav/.txt` fixture'ını gerektirir; taşınabilir otomatik CI testi değildir.
- `electron tests/electron-browser-home787.smoke.js`: gerçek native WebM sayfa ve ana IPC; ana ayar aç/kapa, native occlusion/focus dönüşü, ENdar125taşma kontrolü PASS. Gerçek scheduler, kontrollü bekletilen çeviri callback'i; ana sayfada tamamlanma, sonucu taşıma ve eskiWhisperişvideosuna dönmeme PASS. Canlı sağlayıcı kullanılmadı. `.uiprev/browser-home787/result.json`.
- Mevcut MaxListenersExceededWarning gizlenmedi. Önceki native testlerin kör tekrarı yeni bug sayılmadı; yeni seçim ve son master entegrasyonu sınandı. Harici kod/dependency eklenmedi; mevcut R784 content-addressed snapshot altyapısı genişletildi.

## Sınırlar ve sonraki hedef

Tamamlanmış üretimlerdeki immutable sürümler listelenir; çok eski mutable-only çıktı sürüm varmış gibi gösterilmez. Uygulama yeniden açıldığında üretim isteği yeniden kurulmamışsa uygulama düğmesi etkin değildir; P030 bu yüzden tüm oturumlar için tamamlandı sayılmaz. Doğal60/61hang/OOM, uzunvideo, insan dinlemesi, canlıYouTube/Whisper'ı ana sayfada tamamlama ve start.bat bu turda doğrulanmadı. Video dönüşü otomatik oynatılmaz. Ana sayfaya dönüş pencereyi kapatmak değildir; uygulama kapatılınca iş devamı vaat edilmez. P081–090 kapsam dışı korunur;90hedef aktif. Sonraki somut kabul: gerçek browser Whisper işi başlatıp home geçişi sırasında ilerleme/terminal/aynısekme altyazı bağını doğrulamak ve eski üretim recipe restore akışını tamamlamak.

Ham profiller/ses/görüntüler Git'e eklenmez. Kod ve belgeler ayrıcommit, normal PR/merge/master; kişisel ana kopya dosyaları korunur. Uzun CI beklenmez, başarı iddiası yok.
