# Rapor 673 — Küçük resmi olmayan kayıtları ana sayfada göstermeme

Başlangıç master `290b8631a2a908d946bc4f8c7342ae01fdf57d89`; ürün bitiş `bb1f4f955c2d685d96b5491d58394057c890dde1`; dal `codex/home-thumbnails673`.

## Kök neden ve davranış

Ana sayfa, devam edilebilir her geçmiş kaydını görseli olup olmadığına bakmadan büyük alana ve rafa alıyordu. YouTube arama/kanal sayfasında veya özel TikTok sayfasında video kimliği yok; bunlardan güvenilir küçük resim türetilemiyor. Geçerli resim adresi de 404/ağ hatası verebiliyor; eski akış simgeli boş kutuyu bırakıyordu. Yalnız URL bulunması, resmin yüklendiğini kanıtlamıyordu.

- Ana sayfa büyük alanı, devam et rafı ve film/dizi vitrinleri artık önce doğrulanabilir YouTube kimliği veya kayıtlı afişi olan adayları seçer. Kart, gerçek `load`/`naturalWidth` doğrulamasından sonra görünür. Resmi olmayan/bozulan aday gizlenir. Başarısız raf öğesinin yerine ilk12sınırından sonraki sıradaki aday denenir; tamamen boş bölüm başlığı bırakılmaz.
- YouTube hqdefault başarısızsa mqdefault denenir. HTTP200 ile dönen120pxgenel bulunamadı görseli de geçerli kapak sayılmaz. Gizli/özel video için sahte görsel veya başka bir videonun resmi üretilmez.
- Büyük alandaki başarısız aday atlanır; gezinme ve sayaç kalan adaylarla çalışır. Resim gelene kadar boş hero gösterilmez. Başarısızlık bellekte60s tutulur; daha sonraki ana sayfa yenilemesinde tekrar denenebilir. Poster IPC kuyruğunun3eşzamanlı iş sınırı korunur; gizli kartlarda lazy-load kilidi oluşmaması için gereken resim eager yüklenir.
- **Hiçbir geçmiş veya kütüphane kaydı silinmez.** Son oynatılanlar/film/dizi ayrıntılı ekranlarında kayıtlar erişilebilir kalır. Kaynak kimliği olmayan eski sayfalar otomatik başka videoya eşleştirilmez; gelecekte doğru video açıldığında mevcut kimlik temelli resim yolu kullanılabilir.

## Kod ve kaynaklar

`media-home-model.js`: hasArtwork uygunluğu; `media-home.js`: gerçek görsel yükleme/alternatif kalite/başarısızlık, gizlenen kartı doldurma ve hero ileri geçişi; `media-home.css`: hidden durumunun kart/hero/bölüm displaykurallarınca ezilmesini önleme. `media-home-model.test.js` geçmiş korunumu, `electron-home-thumbnails673.smoke.js` gerçek Windows/Electron kabulü.

Mevcut Whisper afiş kuyruğu ve doğrulanmış YouTube kimliği kullanıldı. Önceki incelenmiş Luna main859b0925 kaynak yapısında uygun ayrı küçük-resim çözümü aranıp hazır yardımcı bulunmadı; GPLkod kopyalanmadı, bağımlılık eklenmedi. [MDN naturalWidth](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/naturalWidth) ve [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) yüklenmiş görsel/odak/görünüm kontrolüne kaynak oldu. Yeni IPC/şema/anahtar/kurulum yok.

## Doğrulama

`node --test --test-isolation=none tests/media-home-model.test.js`: **8 PASS**. Değişen3JSdosyası `node --check`; `git diff --check` PASS.

`D:\Whisper Local\node_modules\electron\dist\electron.exe tests/electron-home-thumbnails673.smoke.js`: ayrı sentetik profilde gerçek Windows. İki uygun,14bozuk görsel ve iki kimliksiz sayfa dahil18kayıt. 404, HTTP200küçükgenelgörsel, alternatifmqkurtarma, ilk12sonrası raf doldurma, hero ok/sayaç, dar görünüm ve18geçmiş kaydının korunması PASS. Sonrasında gerçek ağla public YouTube küçük resmi hemrafta hemhero'da yüklendi. Sonkoşum `home673-1793142284383`; [otomatik sonuç](HOME_THUMBNAILS_2026-10-28/result.json), [canlı küçük resimli geniş görünüm](HOME_THUMBNAILS_2026-10-28/home-live.png), [kontrollü dar görünüm](HOME_THUMBNAILS_2026-10-28/home-controlled-narrow.png). Ekrandaki iki renkli kapak kontrollü test görselidir; kullanıcının kütüphanesi değildir. Canlı kapak Rick Astley public YouTube kaydına aittir.

Kişisel uygulama kapatılmadı; kişisel geçmiş salt okunur teşhiste incelendi, içeriği/başlıkları/adresleri/profili Git'e alınmadı. Asıl profil değiştirilmedi. Tam npm paketi/uzunCI, temizstart.bat, GPU/DRM ve her sitenin resim çıkarması denenmedi. Bu paket TikTok özel hesaplarını aşmaz ve tüm geçmişe kapak buldu iddiası taşımaz. CI açık kalır, sonucu beklenmez.
