# Rapor 699 — Spotify eşleşmesini yerinde değiştirme

Başlangıç master `cf62a81307c97d9dcee2c4d98adcfac7d9f6949b`. Ürün `14bb5852bd12942bd1895ae37afd76452bb2a89f`. Dal `codex/spotify-rematch699`.

## Eksik akış ve kullanım
R698 sürüm farkını gösteriyordu; ancak kayıtlı parçanın YouTube eşleşmesini yerinde değiştiren kullanıcı yolu yoktu. Şimdi müzik satırındaki **⋯ → YouTube sürümünü değiştir** veya analiz kaynak kartındaki **Eşleşen sürümü değiştir** ile inceleme açılır. Eski kayıt başlığı/süresi ve yeni adaylar aynı pencerede gösterilir. Mevcut önizleme düğmesi korunur. Kullanıcı açıkça **İncelenen eşleşmeyle değiştir** demeden dosya yazılmaz.

- `spotify-import.readSaved`, kayıtlı Spotify kimliği ve metadatasından owner/expiry bağlı inceleme oluşturur; tekrar Spotify sayfası indirmez. Mevcut yt-dlp üç aday araması ve bilinen seçenek doğrulaması kullanılır. Arbitrary URL eklenmez.
- Main `spotify-rematch-read/save` alt eylemleri kayıtlı hedefi sunucu tarafında incelemeye bağlar. Başka pencerenin token'ı, bilinmeyen video seçimi, silinen parça veya inceleme sırasında değişen eski URL reddedilir. Rematch token'ı normal yeni-liste kaydında kullanılamaz.
- Yalnız youtubeUrl/youtubeTitle/youtubeDuration güncellenir. Parça ID, sıra, Spotify bilgisi, beğeni, konum, kişisel alanlar ve diğer listeler aynen kalır. Başarılı inceleme tüketilir; ikinci kez uygulanmaz.
- Analizde kaynak kimliği aynıysa yeni eşleşme tekrar hazırlanıp analiz edilir; R691'in URL'yi içeren remote cache anahtarı eski WAV'ı kullanmaz. Kullanıcı kaynak değiştirmiş/kapatmışsa geç callback eski kaynak üzerine yazmaz. Analiz/kuyruk çalışırken değiştirme düğmesi kilitlidir.
- UI callback yenilemesi başarısız olsa bile başarılı kayıttan sonra inceleme penceresi finally ile kapanır; tüketilmiş token ile kaydet düğmesi açık kalmaz. Eski Spotify metadatası eksikse anlamlı kimlik hatasıyla durur; sahte arama yapılmaz.

## Doğrulama
- Yeni Node main IPC testi owner, bilinmeyen seçenek, yanlış kayıt eylemi, veri korunması, tüketilmiş token, eşzamanlı değişiklik ve silinen hedef kapılarını çalıştırır. İlgili Spotify import, remote cache, source version, karma liste ve kalıcı sonuç dosyalarıyla14 kontrol PASS; i18n-coverage PASS. Son save/cache alt kümesi tekrar PASS. Syntax/diff PASS.
- `electron-spotify-rematch.smoke.js`, gerçek Windows renderer/preload/main/atomic save/FFmpeg/DSP ile çalışır. Katalog/YouTube stream çözümü kontrollüdür; iki sentetik220Hz/660Hz kaynak vardır. Önce eski ses analiz edilir; TR koyu800x900125% incelemede iptal → disk ve aktif kaynak değişmez. EN açık1200x900100% incelemede açık save → tek kayıt kimliği/beğeni korunur; farklı URL için ikinci stream/ayrı ses hazırlanır, yeni ölçüm tamamlanır ve gerçekten oynatılır. Müzik listesi menüsü de açılıp iptal edilir; yeni kayıt korunur.
- Native teslim commit'iyle exit0. İki gerçek Windows görüntüsü incelendi; dar dialog yatay taşmaz. Önizleme düğmesinden canlı YouTube streaming bu testte denenmedi; yeni hazırlanmış yerel kesit decoder'ı gerçekten oynadı.
- Kanıt `REMATCH699_2026-10-28`; ham WAV ve profiller yayımlanmadı.

## Kaynak, Windows ve sınırlar
Mevcut yt-dlp YouTube çıkarıcısının canonical ID/title/duration yolu ve Unlicense (R698 kaynak incelemesi) esas alındı. Yeni matcher/model/paket eklenmedi; kullanıcı incelemesi mevcut olgun Spotify import bileşenine bağlandı. Ek kurulum/DB şeması yok, mevcut media-shelf IPC'sine iki doğrulanan alt eylem eklendi.

Tam CI beklenmedi; temiz start.bat, GPU, canlı Spotify/YouTube arama uygunluğu veya insan müzikal tercih kabulü bu tur yapılmadı. Bilinen11before-quit uyarısı açık. Launcher/CUDA değişmedi. P083 bu kullanıcı değiştirme yolu+R691 cache korumasıyla tamamlandı; aday araması üç öneriyle sınırlıdır, her şarkıda doğru kayıt bulunacağı iddia edilmez. Ürün100 devam eder.

Ek kabul: Yeni sürüm düğmesi ilk kilitleme taslağında batchRunning bayrağıyla kalıcı devre dışı kalabiliyordu. Batch zaten içerik alanını inert yaptığı için düğme kilidi yalnız gerçek meşgul durumuna bağlandı. Teslim öncesi electron-music679 gerçek Windows batch koşusu ve “tamamlanan batch düğmeyi serbest bırakır” assertionı PASS. Bu geliştirme sırasında yakalanan taslak hatası yeni kullanıcı bugı diye sayılmadı. Son ürün commit yukarıda.
