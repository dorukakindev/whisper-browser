# R815 — Daha az incelenen kütüphane alanları

Ürün HEAD: `db65f2e7f6e7b50649c440cb183cb88863ebf241`. Dört yeni doğrulanmış P2 kök. Ürün/test/Git/docs değiştirilmedi. Sentetik dosyalar ve kontrollü bağımlılıklar kullanıldı; gerçek Python parser, servis handler ve ilgili renderer tüketicileri çalıştırıldı.

## Tekrar çalıştırma

Depo kökünden: `node .tmp/unseen815-library/probe.cjs`. Python alt süreci için mevcut ortamda sandbox dışı izin gerekti. `R815_LIBRARY_OUT` verilirse tüm runtime fixture ve results.json ayrı dizine yazılır; fixtures.py probe yanında bulunmalıdır. Yayın için yalnız probe.cjs, fixtures.py, results.json ve bulgu/kapsam dosyaları alınmalı; üretilen EPUB ve profil dizinleri alınmamalıdır.

## UL01 — Atom xml:base ile tanımlanan göreli medya bağlantıları içe alınamıyor (P2)

Kaynak: `backend/media_shelf.py:155`, `backend/media_shelf.py:164`, `backend/media_shelf.py:168`, `src/media-shelf-service.js:253`, `src/renderer/media-shelf-ui.js:368`.

1. probe.cjs UL01: xml:base=https://media.example/episodes/ içeren Atom beslemesini gerçek podcast-add tüketicisine ver.
2. Enclosure href=ep-a.mp3 ile ekle; aynı XML içinde href değerini mutlak URL yaparak yeniden ekle.

**Beklenen:** Atom taban URI kurallarına göre enclosure adresi çözümlenir ve bölüm kaydedilir.
**Gözlenen:** Göreli bağlantıda ok:false ve No audio/video enclosures found in RSS/Atom feed.; yalnız href mutlak yapıldığında ok:true.
**Kök neden:** Parser xml:base zincirini çözümlemeden ham href üzerinde http/https şeması arıyor.
**Etki:** Arayüzün desteklediğini belirttiği geçerli Atom beslemelerinin bir bölümü tamamen reddediliyor.
**Önceki kapsam ilişkisi:** Önceki 103 R815 bulgusunda bu kök yok. Night1000 F39 CSV/ZIP alan birleştirme ailesi; bu Atom taban-URI senaryosu yeni.
**Sınır:** Kontrollü fetch yanıtı ve gerçek Python parser/IPC handler kullanıldı; harici besleme veya medya indirilmedi. Atom base kalıtımının tüm varyantları test edilmedi.
**Kabul ölçütü:** Aynı göreli fixture mutlak fixture ile aynı bölüm URL’sini üretmeli; yalnız güvenli http/https nihai URL kabul edilmeli.

Kanıt: `{"id":"UL01","relativeAtomResult":{"ok":false,"error":"No audio/video enclosures found in RSS/Atom feed."},"absoluteHrefCounterexample":true}`

Standart: [birincil kaynak](https://www.rfc-editor.org/rfc/rfc4287#section-2).

## UL02 — Podcast yenilemesi aynı GUID için değişen medya adresinde dinleme konumunu siliyor (P2)

Kaynak: `backend/media_shelf.py:170`, `src/media-shelf-service.js:263`, `src/renderer/media-shelf-ui.js:373`, `src/renderer/media-shelf-ui.js:379`.

1. probe.cjs UL02: sabit GUID ve episode-v1.mp3 enclosure ile beslemeyi ekle.
2. listen-progress ile 45 saniyeyi kaydet; ok:true ve gerçek media-shelf.json konumunun 45 olduğunu doğrula.
3. Aynı URL ile yenile; diskte 45 korunur. Aynı GUID/title ile enclosure adresini episode-v2.mp3 yapıp yenile.

**Beklenen:** Aynı bölümün kalıcı kimliği korunarak medya adresi güncellenir; kayıtlı 45 saniye kaybolmaz.
**Gözlenen:** Aynı abonelik ID’si korunmasına rağmen gerçek disk konumu 0 oluyor. Aynı URL karşı kontrolünde 45 korunuyor.
**Kök neden:** Parser GUID alanını atıyor; yenileme önceki bölümü yalnız enclosure URL eşitliğiyle buluyor.
**Etki:** Yayıncı CDN veya dosya yolunu değiştirdiğinde kaydedilmiş dinleme konumu sessizce kayboluyor.
**Önceki kapsam ilişkisi:** Önceki 103 içinde bu yenileme/kalıcı bölüm kimliği kökü yok. B102/B103 oynatıcı kuyruk yaşam döngüsüyle ilgilidir; burada kayıp podcast-add disk birleştirmesinde oluşur.
**Sınır:** Aynı GUID tek bölümün kimliği olarak kullanıldı; RSS standardının GUID için zorunlu bir eşleştirme algoritması getirdiği iddia edilmiyor. Gerçek ses çalınmadı.
**Kabul ölçütü:** Aynı GUID ile değişen enclosure güncellenirken konum 45 kalmalı; aynı URL karşı kontrolü de geçmeli.

Kanıt: `{"id":"UL02","unchangedGuid":"urn:episode:fixed-guid","progressSaveConfirmed":true,"positionBeforeRefresh":45,"sameURLRefreshPosition":45,"positionOnDiskAfterRefresh":0,"updatedMediaURL":"https://media.example/episode-v2.mp3"}`

Standart: [birincil kaynak](https://www.rssboard.org/rss-specification#ltguidgtSubelementOfLtitemgt).

## UL03 — EPUB içindeki normal hidden öğeler okuyucuda görünür metne dönüştürülüyor (P2)

Kaynak: `backend/media_shelf.py:40`, `backend/media_shelf.py:44`, `backend/media_shelf.py:81`, `src/media-shelf-service.js:211`, `src/renderer/media-shelf-ui.js:268`.

1. fixtures.py ile normal hidden="hidden" paragrafı içeren sentetik EPUB üret.
2. Gerçek book-import ve book-open yollarını çalıştır; gerçek MediaShelfUI.openBook tüketicisini JSDOM içinde aç.
3. Orijinal HTML paragrafının display:none olduğunu, raf okuyucusunda EDITOR ONLY HIDDEN SENTENCE metninin bulunduğunu doğrula.

**Beklenen:** Normal hidden durumundaki içerik güvenli metin dönüşümünde görünür bölüm metnine dahil edilmez.
**Gözlenen:** Orijinal paragraf display:none iken parser çıktısı ve .ms-prose okuyucu metni gizli cümleyi içeriyor.
**Kök neden:** Prose bastırma kararı etiket ve epub:type=noteref alanına bakıyor; standart hidden niteliğini dikkate almıyor.
**Etki:** Kitabın görünmemesi gereken yardımcı veya editoryal içeriği okuma metnine karışıyor; alıntı ve metin işlemlerinin girdisi de bozuluyor.
**Önceki kapsam ilişkisi:** R612 metadata/nav/noteref bastırması ve açık dipnot koruması ilişkili önceki kapsamdır; bu sıradan hidden niteliği, dipnot semantiğinden farklıdır. R815 önceki 103 içinde bu kök yok.
**Sınır:** CSS ile hidden görünürlüğünü geçersiz kılan kural yok; hidden-until-found veya özel dipnot semantiği kullanılmadı. Gerçek TTS üretimi ya da gizlilik sızıntısı iddia edilmiyor. JSDOM tüketici doğrulaması gerçek Windows görsel testi değildir.
**Kabul ölçütü:** Bu EPUB görünür başlangıç/son metnini korurken gizli paragrafı bölüm ve okuyucu metninden çıkarmalı; açık dipnot davranışı ayrıca korunmalı.

Kanıt: `{"id":"UL03","originalHiddenDisplay":"none","importedChapterContainsHidden":true,"readerVisibleText":"Visible chapterVisible story sentence.EDITOR ONLY HIDDEN SENTENCE.Visible ending."}`

Standart: [birincil kaynak](https://html.spec.whatwg.org/multipage/interaction.html#the-hidden-attribute).

## UL04 — Boştaki Spotify içe aktarma penceresini kapatmak kayıtlı parçanın hazırlanmasını iptal ediyor (P2)

Kaynak: `src/renderer/spotify-import-ui.js:15`, `src/media-shelf-service.js:133`, `src/media-shelf-service.js:143`, `src/spotify-import.js:34`, `src/spotify-import.js:64`, `src/spotify-import.js:69`.

1. probe.cjs UL04: geçerli biçimli kayıtlı eşleşme için gerçek spotify-play handler yolunu başlat; kontrollü musicRun çözümlemesini AbortSignal beklemesinde tut.
2. Hiç okuma/eşleştirme başlatmadan gerçek SpotifyImportUI penceresini aç ve kapatma düğmesine bas.

**Beklenen:** İşi olmayan içe aktarma penceresini kapatmak başka tüketicinin kayıtlı oynatma çözümlemesini etkilemez.
**Gözlenen:** Kayıtlı parçanın çözümleme AbortSignal’i tetikleniyor; spotify-play ok:false ile dönüyor. İçe aktarma penceresi tamamen boştaydı.
**Kök neden:** Modal close koşulsuz spotify-cancel gönderiyor; servis içe aktarma/eşleştirme/kayıtlı stream için tek ortak controller kullanıyor ve iptali sahiplikle sınırlandırmıyor.
**Etki:** Kullanıcı parçanın hazırlanması sırasında içe aktarma penceresini açıp kapatırsa seçtiği parça başlayamıyor.
**Önceki kapsam ilişkisi:** R699 kayıtlı yeniden eşleştirme kimlik korumaları ilişkili kapsamdır. R815 B103 oynatıcı Close sonrası eski callback yarışıdır; bu farklı bileşenin ortak abort sahipliği köküdür.
**Sınır:** Yalnız bekleyen stream çözümlemesinin iptali doğrulandı; başlamış sesin kesildiği iddia edilmiyor. Sentetik kayıt, gerçek servis/controller ve JSDOM modalı kullanıldı; Spotify hesabı, ağ, yt-dlp süreci veya müzik analizi yok.
**Kabul ölçütü:** Boştaki modal kapatıldığında kayıtlı stream sinyali iptal edilmemeli; modalın kendi etkin işi için iptal davranışı korunmalı.

Kanıt: `{"id":"UL04","importerWasIdle":true,"unrelatedSavedPlaybackResolutionAborted":true,"playbackResult":{"ok":false,"error":"Synthetic unrelated stream cancelled"}}`

## Kapsam matrisi

- **RSS/Atom ekleme ve yenileme:** Atom xml:base ve GUID sabitken enclosure değişimi; gerçek Python + handler + disk. Önceki: Night1000 F39 CSV/ZIP alan birleştirme; backend/test_media_shelf.py mutlak RSS olağan akışı. Sınır: Harici feed/CDN ve ses oynatma yok. Kaynak: backend/media_shelf.py, src/media-shelf-service.js, src/renderer/media-shelf-ui.js.
- **EPUB metin çıkarma ve okuyucu:** Normal hidden niteliği; gerçek ZIP/parser/import/open ve JSDOM okuyucu. Önceki: F39 CSV/ZIP alan birleştirme; R612 metadata/nav/noteref ve açık dipnot testleri. Sınır: DRM/fixed-layout/CSS kaskadı ve native görsel kontrol yok. Kaynak: backend/media_shelf.py, src/renderer/media-shelf-ui.js.
- **Kayıtlı Spotify eşleşmesinin olağan oynatımı ve modal iptal sahipliği:** Boştaki modalın başka tüketicinin bekleyen stream işini iptali. Önceki: R699 yeniden eşleştirme korumaları; eski 103 içinde farklı oynatıcı yaşam döngüsü bulguları. Sınır: Hesap/abonelik, canlı metadata indirme ve müzik analizi açılmadı. Kaynak: src/spotify-import.js, src/renderer/spotify-import-ui.js, src/media-shelf-service.js.
- **İzlenen klasör:** Salt okunur inceleme; yeni strict bulgu yok. Önceki: R66-03 ve R73 çıktı algılama/yeniden kuyruk döngüleri. Sınır: Önceki kökler tekrar sayılmadı; boyut kararlılığı politikası bug sayılmadı. Kaynak: src/watch-folder.js, src/main.js.
- **Radyo URL kaydı ve klasör müzik içe aktarma sınırları:** Salt okunur inceleme. Önceki: F39 CSV/ZIP alan birleştirme ailesi. Sınır: Yeni somut disk/tüketici kanıtı olmayan adaylar sayılmadı. Kaynak: src/media-shelf-service.js.

## Sayılmayanlar

- Önceki 103 R815 bulgusu tekrar sayılmadı.
- Müzik analizi P081–P090 kapsam dışı.
- Tam 500 dosya klasör sınırı adayı çalıştırılmadı ve bug sayılmadı.
- Canlı sağlayıcı/hesap/native Windows UI başarısı iddia edilmedi.

## Kaynak SHA-256

- `backend/media_shelf.py`: `f74f159b2b6049f0354fb9293003d15c2e1c8781123c9045b5d10e6083420d32`
- `src/media-shelf-service.js`: `7c5d32ed27522fc1906c3d5343dd772441b057159abbf1a97b38ba66237327b1`
- `src/renderer/media-shelf-ui.js`: `40223222eeff8b79cdffe4be5497dae3de53f016229667c328bf055267772707`
- `src/spotify-import.js`: `07aa688141561a721f9d9da013b3e31c0cf1f55d516e68cabfd90814becd0337`
- `src/renderer/spotify-import-ui.js`: `aabdd2c8856642d5ebc36ccbae013d0bb4c2e34d86dd13f5ccdfeaca7caeb05f`
- `src/watch-folder.js`: `7843089e3682fa9f7e968463f4ff8712c6b64e98372b8bcd1d7698d985519e65`
- `src/main.js`: `93f0b76d0f463599bea346e9e0b4fd2714ab2bfa4b0bd9c265e94e02908a514b`
