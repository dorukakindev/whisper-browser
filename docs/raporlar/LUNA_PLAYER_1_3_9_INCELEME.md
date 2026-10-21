# Luna Player v1.3.9 — Whisper Browser için alınabilecek fikirler

2026-10-21. Kullanıcının verdiği [v1.3.9 sürümü](https://github.com/Nothingman333/Luna-Player/releases/tag/v1.3.9) incelendi. Açık GitHub API'si sürüm adını1.3.9CC ve yayın zamanını2026-10-21T11:48:15Z olarak verdi. Web aracı doğrudan sayfaları açamadığı için GitHub API/raw kaynakları kimlik bilgisi olmadan salt okunur kullanıldı. v1.3.9 etiketi sabitlendi; main'deki olası sonraki değişiklikler sürüm özelliği diye sunulmadı.

## Somut adaylar

| Öncelik | Luna'da gözlenen | Bizim projeye uyarlama |
|---|---|---|
|1|[SubTimeline.tsx](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src/SubTimeline.tsx):40sn görsel cue şeridi, sürükleme,±50/500ms ve sıradaki repliği oynatma kafasına hizalama|Bizdeki mevcut altyazı senkron altyapısını daha görünür tek panelde toplamak. Kaynak altyazı,çeviri,dublaj gecikmeleri ayrı tutulmalı; dublajın değişken zaman haritası tek sabit offset'e indirgenmemeli.|
|2|[App.tsx](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src/App.tsx):Esc önce açık oynatıcı panellerini kapatıyor, sonra filmden çıkıyor; release panel çakışmalarını düzeltiyor|Bizde çok sayıda ayrı Escape listener var. Açık panel/modal/menü önceliğini tek sözleşmeyle yönetip odağı geri vermek. Luna'nın kodu gerçek LIFO katman yığını değil; oyuncu içindeki panel bayraklarını topluca kapatıyor. Daha güçlü bir yönetimi kendi kodumuzda tasarlamak gerekir.|
|3|[README](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/README.md):asistan film/şarkı/kitap bağlamını biliyor, çoklu bağlamda kullanıcıya soruyor|Bizde açık video,seçili altyazı,dublaj işi ve referans ses bağlamlarını ID ile açıkça seçen asistan. “Bu bölümü seslendir”,“şu cümleyi doğal çevir” gibi görevler; yanlış sekme/medya üzerinde çalışmayı önleme. README davranışı; asistan iç mimarisi bu tur tam denetlenmedi.|
|4|[preview.rs](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src-tauri/src/preview.rs):gizli ikinci mpv aynı dosyayı açık tutup keyframe JPEG üretiyor|Oynatma çubuğunda sahne önizlemesi. Bizdeki sahne/thumbnail araçlarıyla tekrar etmeyen birleştirme.12GBGPU'da TTS ile ek decoder çakışmasın:isteğe bağlı/lazy worker,debounce,cache ve işlem bitince release. Kaynaktaki60–80ms yorumu bizim donanım ölçümümüz değildir.|
|5|[Backup.tsx](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src/Backup.tsx):tek dosyada kütüphane/not/ayar; medya ve API anahtarları dahil değil|Bizdeki mevcut güvenli settings export'u üzerine “ses projesi paketi”:SRT,düzenlenmiş metin,ayar,kalite raporu,sync haritası ve kullanıcı seçerse WAV/referans. Bu geniş ses paketi Luna'da var diye söylenmiyor; bizim ürüne öneridir.|
|6|[App.tsx](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src/App.tsx):ses/altyazı gecikmesini dosyaya göre saklama,ekran üstü hız/ses/atlama geri bildirimi;space350ms basılı tutulunca2x,bırakınca geri alma|Mevcut oynatıcı işlevlerini daha anlaşılır kontrollerde birleştirmek. Dublaj adaptif oynatma hızıyla çakışmayı önlemek; basılı hız çarpanı seek/blur/medya değişiminde geri alınmalı.|
|7|[Tour.tsx](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src/Tour.tsx) ve README:ilk açılış turu ve eksik bileşen yönlendirmesi|VoxCPM2/GPU/Whisper/ffmpeg durumunu tek ekranda,gerektiğinde kısa örnek üretimle göstermek. Bizim mevcut ortam bilgisi altyapısı üzerinde; model klasörlerini veya kişisel ayarları değiştirmeden tanı.|
|8|[update.rs](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src-tauri/src/update.rs):Tauri updater imzası,stable/beta,kurulu/portable ayrımı|İleride paketli Windows sürümüne güvenilir uygulama güncellemesi. TTS/çeviri çalışırken güncelleme uygulanmamalı; ayar/model/output saklanmalı. Rust/Tauri updater'ı Electron'a doğrudan taşıyamayız. Güncelleme paket imzası ile Windows Authenticode sertifikası farklıdır; README SmartScreen notu da bunu ayırmayı gerektirir.|

## Mimari ve lisans

[app/package.json](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/package.json) React19/TypeScript/Vite; [Cargo.toml](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src-tauri/Cargo.toml) Rust/Tauri2; oynatma mpv tabanlı. Biz Electron/Node/Python kullanıyoruz. Davranışı kendi yapımıza uyarlamak, arayüz dosyalarını yapıştırmaktan daha uygun.

Luna'nın [LICENSE](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/LICENSE) dosyası GPL-3.0, bizim LICENSE ve package.json MIT. Kaynak kodu kopyalayıp yalnız MIT etiketiyle geçmek uygun bir teslim yaklaşımı değil; doğrudan kod uyarlaması yapılırsa GPL koşulları/dağıtım kapsamı ayrıca ele alınmalı. Bu tur hiçbir kaynak kodu,logo,asset veya bağımlılık ürüne alınmadı; fikirler ve davranışlar için bağımsız uygulama önerildi.

## Şimdilik önermediklerim

- Film önerileri/Letterboxd,radyo,podcast,EPUB/CBZ ve torrent alanları mevcut video/altyazı/dublaj önceliğini genişletiyor; bu kullanıcı isteğinde bunları eklemedik.
- [tts.rs](https://github.com/Nothingman333/Luna-Player/blob/v1.3.9/app/src-tauri/src/tts.rs) Microsoft Edge read-aloud çevrimiçi servisine gidiyor. Yerel kendi-sesimizle VoxCPM2 üretimi yerine geçmez; araştırılmış bir ses klonlama/ton sürekliliği onarımı değildir.
- Lossless Scaling entegrasyonu ayrı ücretli uygulamaya bağlı; yeni zorunlu gereksinim yapmaya gerek yok. Kodda upscaler var diye mevcut12GBGPU için hız/kalite üstünlüğü iddia edilmedi.
- Bizde zaten olan yerel medya,altyazı seçme/gecikme,izleme kaydı vempv araçlarını sıfırdan “yeni özellik” diye çoğaltmamak gerekir.

## Sınır

Seçili12kaynak dosyası,README,LICENSE,release ve dosya ağacı okundu. Luna yüklenip çalıştırılmadı,ekran görüntüleri görsel olarak incelenmedi,tam kaynak güvenlik/performans denetimi yapılmadı. Dolayısıyla görünüm/doğruluk için çalışır ürün onayı verilmiyor. Whisper ürün kodu değişmedi; belge/diff/bağlantı yolu kontrolü yeterli, ürün testleri gerekmiyor. Önerilen başlangıç sırası:panel/Esc → görsel senkron → ses proje paketi → bağlamı açık asistan.
