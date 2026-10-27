# Rapor 675 — Güncel Luna karşılaştırması: karışık müzik kuyrukları

Başlangıç master `341ada22659e0e6e9081318673766a74a27f942a`; ürün bitiş `4b0bb819a1525bbb38aaca6d1710a4c28a4afa59`; dal `codex/luna-music675`.

## Güncel sürüm ve kaynak incelemesi

Resmî GitHub releases API ve Git etiketleri doğrulandı: en yeni yayımlanan sürüm **[v2.7.5](https://github.com/Nothingman333/Luna-Player/releases/tag/v2.7.5), Luna Player2.7.5CC(beta)**,2026-10-27T10:35:42Z; etiket ve main kimliği `859b0925ad51d878293377353476e7957eb8bc91`. beta-1.0.1dalı daha eski3d2ffc85; onu esas almadık. Webaracı APIURL'sini açamadı; doğrudan resmî API+gitfetch ile veri alındı.

Music.tsx, MusicPlaylistTools.tsx, musicWorkspaceModel.ts, LibrarySavedViews.tsx, LibraryCompare.tsx ve releaseHistory.ts okundu. Görsel kaynak olarak mevcut Music/QueueTools stilleri ve kendi gerçekWindows çıktımız kullanıldı; Luna'nın paketlenmiş beta ikilisi çalıştırılıp ekran görüntüsü alınmadı. Kaynak ekranı ile çalışanLuna ekranını eş saymıyoruz. Luna GPL3, bizimrepoMIT: **kaynak kopyalanmadı**; mevcut IPC/kimlik/atomikyazıcı/tema üzerinde bağımsız uygulama. Yeni bağımlılık yok.

## Karşılaştırma ve bu turdaki teslim

| Alan | Bizdeki durum / sonuç |
|---|---|
| Kuyruk açma, yukarı/aşağıtaşıma, kaldırma, karıştırma, tekrar | Önceden var; yeniden eklenmedi. |
| Spotifyparçasını sıradaki çal / kuyruğaekle | Eksikti; satırdaki erişilebilir üçnokta menüsüne eklendi. Mevcut yerel oynatmayı kesmez. |
| Karışık yerel+Spotifykuyruğunu kaydet | Eksikti; kuyruk penceresinde Listeolarakkaydet, sıra ve tekrarları aynen saklar. |
| Kayıtlı karışık listeyi açma/adlandırma/kaldırma | Yeni Kaydedilenkuyrukların kartları; mevcut kimliklerle çözümleme. Eksik kaynakta kullanılabilir/kayıtlısayısı açık; kaynak sessizce başka sese eşleştirilmez. |
| Spotifylistelerinde arama | Üst arama yerel parçaları süzüyor, ithalSpotifylistelerini süzmüyordu. Listeadı/başlık/sanatçıya göre artık süzülür; ListeyiOynat yalnız görünenleri alır. |
| Kozmetik | Kayıtlılistede isim/sayı sol, işlemgrubu sağ; darpencerede saran eylemler, amberodak/azaltılmışhareket, ayrı kuyrukkayıtbildirimi. Önceki kapaklı liste tasarımı korunur. |

Yeni `media-shelf.json.queuePlaylists` opsiyonel alanı; schema1uyumlu. Sadece `{kind,id,playlistId?}` tanımları saklanır; sesyolu, signedURLveya key saklanmaz. Mainprocess bilinen yerel/ithalSpotifykaydıyla doğrular; rastgeleURLve kaldırılmışkimlikreddi. Enfazla100liste/5000girdi, mevcut16MBshelf sınırı ve atomikyazım geçerli. Aynıadı yenidenkullanırsan `(2)`eklenir. Kaydetmek çalmayıbaşlatmaz/kesmez; listedenOynat açık kullanıcıeylemidir. KaynakSpotifylistesini kaldırırsan ona bağlı kimlik eksikgörünür; ses indirilipkalıcı tutulmaz.

## Sonraki adaylar — bu turda yapılmış sayılmıyor

1. Luna LibrarySavedViews'teki isimli filtre raflarını bizim film/dizi filtre yetenekleriyle eşleştirmek; önce yeterli ortak filtre sözleşmesi belirlenmeli.
2. LibraryCompare'taki yan yana yapım karşılaştırması: bizde yorum/zevkprofili analizivar; görsel iki-yapım karşılaştırmasının kapsamı ayrıca incelenmeli.
3. MusicPlaylistTools JSONimport/export/duplicate: karışıkkuyruk kayıtları bu turtemeli; taşınabilir dosyadan gelen kimlikleri mevcutkaynağa güvenle bağlamadan import eklenmedi.
4. Kayıtlıkarışıklistede parçaekle/çıkar ve sürükle/klavyesıralama; kuyruk zaten düzenleniyor, liste editörü ayrı.
5. releaseHistory'deki yenilik zamançizelgesi; yalnız gerçekyayımlanmış değişiklikleri bizim changelog'abağlayarak düşünülebilir.
6. Beta2.7.5webdock/minivideo geçişini gerçekLunaçalıştırarak bizim nativebrowserocclusion/fullscreen davranışıyla karşılaştırma. Kaynak incelemesi tekbaşına aynıözelliğin güvenle taşındığını kanıtlamaz.

Kitap/PDF/asistan/Letterboxd/metadata alanlarının önemli parçaları bizde zaten var; bu tur tüm özelliklerin eksiksiz eşdeğerliği denetlenmedi. Yukarıdaki adaylar otomatik gerçekbug sayılmadı. İstenen çalışma tekpakette bütünLuna'yı kopyalamak diye sunulmaz.

## Kanıt ve sınırlar

Hedefli `music-playlists675`, `media-shelf-service`, `music-results674`: **6PASS**; `music-queue.test.js` de mevcut standalonekontrolüyle0exit. İlk sandboxkoşumunda ilgili shelfregresyonu `Python required` ilekaldi; değiştirmeden mevcut `WHISPER_TEST_PYTHON=D:\Whisper Local\backend\venv\Scripts\python.exe` ile yenidenkoşuldu vegeçti. Ürün testisilme/eşikgevşetme yok. Değişen4JSgirişsyntax ve diffcheckPASS.

NativeWindows `electron tests/electron-music675.smoke.js`, sonkoşum1793145059363: gerçekyerelsesçalarken Spotifyplaynext/enqueue, mevcutçalmanınkorunması,5öğekarışıkkuyrukta tekrarlıSpotifykimliği/sırası, formdankaydetme/diskkaydı, yenidenaçma, Spotifyarama/temizleme,1440ve800CSSpxgörünüm PASS. [Sonuç](LUNA_MUSIC675_2026-10-28/result.json) · [geniş](LUNA_MUSIC675_2026-10-28/music-wide.png) · [dar](LUNA_MUSIC675_2026-10-28/music-narrow.png) · [kayıtlı kuyruk](LUNA_MUSIC675_2026-10-28/queue-saved.png). KapakpublicRickAstley; parçaadlarıyla eşleşme kalite kanıtı değildir, yalnızgörselfixture. Üçyerelaudio fixture dosyası kullanıldı, kişiseldosya yok.

Tamnpm/CIsonucu/temizstart.bat/GPU/DRM/Spotifyözelhesabı/canlıLLM/Lunabetaikilisi/diğerprogramsayfaları doğrulanmadı. KuyruktakiSpotifykaydı bu testte çalınmadı; yalnızyerelsesgerçekçalarken kuyrukişlemi doğrulandı. CIaçık ve beklenmiyor. Kişisel430untracked/OFFLINE-MANIFEST/INDEX516/silinmişstart.sh korunur.
