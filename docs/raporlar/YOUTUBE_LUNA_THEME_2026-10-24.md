# YouTube ana sayfası ve sol menü — Luna uyumu

2026-10-24, Europe/Istanbul. Başlangıç HEAD `83a5c9e008d1eb9c5fa16595b690791567844b91`; bitiş ürün kodu `c3ecec95e410a50f814a0b5b6c9f4c8f5f481b76`. Dal `codex/luna-media-home532`, PR https://github.com/dorukakindev/whisper-browser/pull/482 .

## Ürün değişikliği

Önceki YouTube görünümü Luna ana sayfasından ayrı `#0f0f0f`/Roboto/gri palet kullanıyor, kartları hover'da hareket ettiriyor ve native rich-grid içeriğine 2–5 sütunlu zorunlu grid uyguluyordu. Yeni görünüm Luna medya yüzeylerinin `#080809`, `#111113`, `#18181b`, `#28282d`, `#e8701a` değerlerini kullanır. Browser'ın dış kromu da yalnız Browser çalışma alanında aynı palete bağlandı; stüdyo/yerel oynatıcı paleti değişmedi.

YouTube başlık şeridi, arama alanı, kategori filtreleri, geniş sol menü, mini sol menü, açılır drawer, kart başlıkları, menü yüzeyleri ve klavye odakları uyumlu. Seçili menü satırında sıcak vurgu ve yumuşak zemin vardır. YouTube logo işaretinin kırmızısı korunur; suffix'li `youtube-paths_...` kelime logosu açık/koyu temada okunur. Güncel DOM'daki kendi rengini belirleyen `yt-formatted-string` ve mini `.title` etiketlerinin kontrastı ayrıca ele alındı.

Mevcut OFL lisanslı IBM Plex Sans 400/600 Latin/Latin-ext fontları diskten bir kez okunup data URL ile stile gömülür. CDN veya kişisel dosya URL'si kullanılmaz. Native YouTube sayfasında font yüklenmesi doğrulandı; font bulunamazsa sistem fontu kullanılır. Yeni bağımlılık veya font indirmesi yok.

Zorunlu grid ve hover transform kaldırıldı. Native feed yerleşimi/virtualization ve kartların tıklama alanı YouTube'a bırakıldı. Video oynatma, progress bar rengi, altyazı veya reklam engelleme mantığı bu temanın parçası değildir. Mevcut Shorts gizleme seçeneği ayrı kaldı.

Açık tema mevcut uygulama renklerini izler (`#f1ede5`, `#f7f4ed`, `#7f4c15`). Uygulama teması değişince sayfa reload olmadan yeniden stillenir; kullanıcı site profilinde açıkça koyu sayfa istiyorsa koyu tercih korunur. Mevcut **YouTube özel görünümünü kullan** kutusu varsayılan olarak açıktır; daha önce kapatılmış tercih zorla değiştirilmez.

## Doğrulanmış hata: kaldırılan user-origin stilin etkisinin kalması

Gerçek Windows Electron `43.5.0+wvcus` kontrolünde `insertCSS(...,{cssOrigin:'user'})` ardından `removeInsertedCSS(key)` başarılı dönse de görünüm kapalıyken gövde `rgb(8,8,9)` kaldı. Tüm ekleme/kaldırma anahtarları izlenerek başka Luna katmanı veya Dark Reader olmadığı ayırt edildi. Aynı fixture ve aynı CSS, **author origin** ile kaldırıldıktan sonra özgün `rgb(255,255,255)` değerine döndü. Bu gözlem bu kurulu build/senaryoyla sınırlıdır; tüm Electron sürümleri için genel hata iddiası değildir.

YouTube teması artık author-origin + sınırlı `!important` seçiciler kullanır. Tema değişiklikleri sekme başına sıraya alınır; generation/request kontrolleri eski istekleri reddeder ve geç gelen kendi CSS'ini temizler. Tema bilgisi cache signature'a dahildir; yalnız açık/koyu değişmesi de yeni stil üretir.

## Kontroller

- `node tests/browser-youtube-style.test.js`: host sınırı, görünüm/Shorts bağımsızlığı, font/palet ve native layout/progress koruması geçti.
- `node tests/browser-style-deadzone.test.js`: **9 senaryo**; stil signature/tema değişimi, nesil/yetim CSS korumaları dahil geçti.
- `node tests/package-integrity.test.js`: **9 test geçti**; yeni statik CSS require closure üzerinden paket kapsamındadır.
- `node tests/youtube-ad-guard.test.js`: initial data, JSON/fetch/XHR, SPA kartları, teardown ve host sınırı geçti. Bu sonuç canlı reklam engelleme garantisi değildir.
- `electron tests/electron-youtube-luna.smoke.js`: gerçek main/preload/native Browser, izole YouTube biçimli fixture'da koyu/açık tema, 1440/760 host genişliği, sayfa taşması, bundled font, native arama submit ve kart focus, video controls/paused özellikleri, uygulama teması değişiminde reload olmadan güncelleme, görünüm kapalıyken özgün CSS'e dönüş geçti.
- Fixture kanıtı: `.uiprev/youtube-luna/1792846870927-13928-fixture`; native sayfa genişlikleri 1370/709, scroll genişlikleri 1355/694. Host genişliği ile native sayfa genişliği yan panel nedeniyle aynı değildir.
- `WHISPER_YOUTUBE_STYLE_LIVE=1 electron tests/electron-youtube-luna.smoke.js`: **gerçek `https://www.youtube.com/?hl=tr`**, yeni ve oturumsuz profil ile açıldı. Geniş/mini/açılır sol menü ve açık/koyu temalar doğrudan görüntülendi. Son canlı kanıt `.uiprev/youtube-luna/1792846907148-23692-live`; 14 guide girdisi bulundu, consent engeli yoktu, seçili geniş guide rengi dark `rgb(232,112,26)`, light `rgb(127,76,21)` ölçüldü, font yüklendi. İçerik genişlikleri 1009/742 idi.
- Canlı oturumsuz ana sayfa **Başlamak için arama yapın** ekranını verdi, öneri kartı sayısı **0**. Dolu feed/poster karşılaştırması bu nedenle fixture ile doğrulandı; canlı dolu öneri akışı veya giriş yapılmış hesap doğrulanmış sayılmaz.
- JS syntax ve `git diff --check` geçti. Tam npm paketi/CI beklenmedi. Bu tur gerçek video oynatma, DRM/GPU, çeviri veya dublaj modeli üretmedi; tema bu motorları değiştirmez.

Görsel örnekler yalnız sentetik veridir: [koyu](assets/youtube-luna-2026-10-24/dark.png), [açık](assets/youtube-luna-2026-10-24/light.png), [dar mini menü](assets/youtube-luna-2026-10-24/compact.png). Canlı hesap/ham DOM/log veya kişisel profil Git'e konmadı.

## Kullanım ve sınır

Önizlemeyi kapatıp `preview-luna.bat` ile yeniden aç. Browser'da YouTube'u aç; Görünüm ayarlarındaki **YouTube özel görünümünü kullan** açık olduğunda uygulanır. Genel site CSS'i veya YouTube'un kendi tema tercihi değiştirilmez; stiller bu uygulamanın native sayfasına eklenir. YouTube DOM'u ileride değişebilir; kapsanmayan yeni view model'ler yeniden incelenmelidir. Mevcut Shorts/adblock/çeviri/dublaj ayarları, kullanıcının hesabı ve gerçek sekmeleri korunur. Start/install betikleri değiştirilmedi; bu tur otomasyon doğrudan Electron'da çalıştı, yeni start.bat/GPU kurulumu kanıtı değildir.
