# Rapor 679 — Müzik analizinden listeye birleşik çalışma akışı

Başlangıç master `eae5840a6a300c32ca7b7e1ec19b5103d0e1e54a`; ürün bitiş `993a72e688fc66290345a138d62c2d73242b32fc`; dal `codex/music-workflow679`. Önceki R674/R678 kalıcılık ve UI çalışmaları yeniden icat edilmedi; beş istek mevcut motor etrafında birleştirildi.

## Kullanım

1. **Müzik → Analiz geçmişi** veya analiz penceresindeki aynı düğme: parça/sanatçı arama, tarih, kayıtlı ölçüm/etiket/eşleşme türleri ve uygun kapak. Kapak yoksa boş resim yerine dalga simgesi vardır. **Sonuçları aç** mevcut sonuçları yükler. Yerel ses değişmişse eski sonucu farklı sese uygulamaz; yeniden seçim ister.
2. **Müziklerimden seç**: yerel dosyalar ve aktarılan Spotify listelerinden kutucuklarla 1–20 parça seç; **Seçilenleri analiz et**. İnternet sekmesinde mevcut 1–8 seçili önizleme için **Seçili önizlemeleri analiz et** bulunur. Bu DSP ölçüm kuyruğudur; etiket/CLAP modelini kendiliğinden indirmez veya her parçaya pahalı benzerlik taraması başlatmaz.
3. Kuyruk tek seferde bir kaynağı işler. Parça hatası sonrakini engellemez. **Kuyruğu durdur**, kalanları durduruldu olarak bırakır; **Başarısız / durdurulanları dene** tamamlanmış parçaları tekrar çalıştırmaz. Sonuçlar parça parça kalıcıdır, tamamlanan satırdan açılabilir. Kuyruk panel yaşamına aittir; uygulama kapandıktan sonra otomatik iş devamı vaat edilmez. Bitmiş analizler geçmişte kalır.
4. Bir ölçümü açıp geçmişten diğer ölçümde **Grafikleri karşılaştır**: A üstte, B altta aynı geçen-saniye ölçeğinde gösterilir. Bu zaman ölçeği karşılaştırmasıdır; müzikal beat/ton hizalama değildir. Mevcut grafik tooltip/seek/aralık sürükleme korunur. **Seçili aralığı dinle** başlangıçtan oynatır ve bitişte durur; A/B eşleşme dinleyicisi de korunur.
5. Asistana “analiz geçmişini aç”, gerçek kütüphane kimlikleriyle toplu analiz, kuyruk durumunu okuma/durdurma ve “beğendiklerimden liste oluştur” yolları verildi. Sonuncusu yalnız beğenilmiş **yerel** parçaları inceleme penceresine koyar; liste adı ve parçalar görünür, **Çalma listesini oluştur** tıklanınca kaydeder. Spotify beğenilerinden karma liste oluşturma bu özel yeni eylemin kapsamında değildir; mevcut karma oynatma kuyruğu ayrı kalır. Daha sakin benzerler için mevcut set_music_intent/find_local/select_match/propose_playlist araçları sürer; İngilizce pozitif ses tarifi, skorun olasılık olmadığı ve modelin sesi dinlemiş sayılmadığı sözleşmede korunur.

## Kod ve veri

| Dosya | Amaç |
|---|---|
| music-workspace-store.js | Geçmiş özetleri, güncel kaynak bağlantısı, eski kayıtları kaynak yeniden seçilince bağlama |
| music-analysis-service.js | Mevcut yetkili music-analysis:request üzerinden history/history-open/history-result; SHA256 doğrulamalı yeniden açma |
| music-remote-source.js | Spotify kimliği / Deezer katalog kimliğinin güvenli tekrar hazırlama bilgisi |
| renderer/music-analysis-ui.js/css | Geçmiş, çoklu seçim, sıralı kuyruk, hata/iptal/retry, seçili dinleme, hizalı grafik ve beğeni listesi incelemesi |
| renderer/music-online-ui.js | Seçili güncel katalog önizlemelerini kuyruğa verme |
| renderer/media-shelf-ui.js | Müzik sayfasından geçmiş girişi |
| assistant-capabilities.js | Beş yeni işlem ailesi, 1–20 benzersiz kimlik doğrulaması ve array argüman denetimi |
| renderer/assistant-music-actions.js | Gerektiğinde panel açma; accepted/completed ayrımı; beğeni bilgisi ve kuyruk bağlama |

Yeni runtime paketi veya IPC kanalı yok. Mevcut music-workspaces JSON'larına isteğe bağlı `location` alanı eklenir. **Yerel dosyanın yolu sadece kullanıcı veri dizinindeki bu özel kayıt içinde tutulur**; geçmişin renderer/assistant özetine verilmez. Uzak kaynak için süreli ses URL'si değil Spotify liste/parça kimliği veya doğrulanmış Deezer katalog kimliği saklanır. Dosya SHA256'sı tekrar kontrol edilir; ses değiştiğinde eski sonuç yeniden kullanılamaz. Eski location'sız kayıtlar listelenir fakat kullanıcı kaynağı bir kez yeniden seçene kadar doğrudan açma düğmesi kapalıdır. Bir sesin aynı baytları farklı katalog adlarıyla seçilirse içerik kimliği tek kayıttır; en son seçilen başlık/kaynak bağlantısı gösterilir. Sonuçlar sessizce silinmez; mevcut 5000 kayıt/512 MB sınırı korunur.

## Doğrulama

- `node --test --test-isolation=none tests/music-workflow679.test.js tests/music-results674.test.js tests/music-analysis.test.js tests/music-online.test.js tests/music-remote671.test.js tests/assistant-music.test.js`: **17 PASS**. Kimlik sınırları, yetkisiz istek reddi, özel yolun özetlere geçmemesi, eski sonuçların servis yeniden yaratılınca yüklenmesi, güncel kaynak başlığı ve typed assistant kabulü dahil.
- `tests/electron-music679.smoke.js`, gerçek Windows Electron, ayrı profil: iki NumPy WAV + bozuk WAV ile 2 başarı/1 hata; kaynak onarılınca yalnız başarısızı tekrar deneme; geçmişi kapat/aç, hizalı grafik, seçili aralık dinleme ve bitişte durma; kuyruk iptali; beğeni listesinin incelemede yazılmaması, onayda gerçek tracks kaydı PASS.
- Aynı native koşuda Spotify/YouTube ve Deezer ağ yanıtları kontrollü fixture ile karşılandı; **gerçek ffmpeg decode, süre sınırlama, dosya/cache ve UI** çalıştı. Her iki uzak kuyruk geçti. Geçici sesleri serbest bırakıp paneli yeniden açtıktan sonra uzak geçmiş sonucu yeniden hazırlandı ve kaydedilmiş ölçümler yüklendi. Canlı sağlayıcı erişimi veya doğru şarkı eşleştirmesi kanıtı değildir.
- İlk genişletilmiş testte playlist şemasını ids yerine tracks olarak beklemek gerekti; ürün kaydı doğruydu. Spotify fixture satırları eklenince eski toplam 3 seçici beklentisi 5'e güncellendi ve yerel/uzak seçimler ayrıldı. Bu test beklentileri ürün bugı diye sayılmadı. İlk erken screenshot açılma karesini yakalıyordu; arka plan/opacity ölçülüp sabit görüntü tekrar alındı.
- Değişen tüm JS dosyaları node --check ve git diff --check geçti. Native koşularda mevcut before-quit 11 listener uyarısı sürüyor; sınır yükseltilerek gizlenmedi. Tam npm test/uzun CI beklenmedi.

[Geniş geçmiş](MUSIC679_2026-10-28/history-wide.png), [açık/dar geçmiş](MUSIC679_2026-10-28/history-light.png), [kaynak seçimi](MUSIC679_2026-10-28/source-multiselect.png), [aynı saniye ölçeği](MUSIC679_2026-10-28/aligned-graphs.png), [beğeni listesi incelemesi](MUSIC679_2026-10-28/liked-review.png), [sonuçlar](MUSIC679_2026-10-28/results.json). Görüntüler tek tek incelendi; kişisel profil/anahtar/ses kullanılmadı. Kapaklı geçmişin canlı CDN görüntü kalitesi bu fixture'da doğrulanmadı; kapaksız satırların simge görünümü görüldü.

## Açık kaynak incelemesi ve sınırlar

[p-queue kaynak kodu](https://github.com/sindresorhus/p-queue/blob/main/source/index.ts) (MIT) ve [WaveSurfer Regions](https://github.com/katspaugh/wavesurfer.js/blob/main/src/plugins/regions.ts) (BSD-3-Clause) okundu: sınırlı eşzamanlılık/iptal durumlarını ayırma ve bölge başlangıç/bitişini açık taşıma yaklaşımları esas alındı. Paketler eklenmedi veya kod kopyalanmadı; mevcut tek-iş main servisi ve canvas korunarak bağımsız uygulandı. frontend-design/make-interfaces rehberindeki sakin hiyerarşi ve mevcut tema kullanıldı; grafik rengi veri serisi içindir, temel UI amber kalır.

start.bat/install.bat/Python motoru ve CUDA bağımlılıkları değişmedi. Native testler GPU kapalı kontrollü ortamdadır; temiz start.bat kurulumu, canlı Spotify/YouTube/Deezer, ücretli asistan/model kalitesi, gerçek CLAP sıralama kalitesi veya müziğin kulağa daha iyi geldiği bu tur doğrulanmadı. Asistanın araç yürütmesi kontrollü olarak sınandı; doğal dil modelinin her istekte doğru aracı seçeceği garantisi yok. Tamamlanmış sonuçların kalıcılığı ile çalışmakta olan kuyruğun uygulama yeniden açılışında devamı birbirinden ayrıdır.
