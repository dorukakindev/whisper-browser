# Luna görünümü, müzik/kitap/podcast ve Letterboxd uyarlaması

Kullanıcı ilk ana sayfanın Luna'ya yeterince benzemediğini ve normal ana kopyada hâlâ Whisper formu gördüğünü bildirdi. Önceki PR482 henüz master'a alınmadığı için `D:/Whisper Local/start.bat` eski ana kopyayı açıyordu. Bu bir başlangıçta DOM hatasıymış gibi sunulmadı. Bu tur görünüm somut olarak yeniden düzenlendi; normal ana kopya otomatik değiştirilmeden ayrı, tıklanabilir önizleme başlatıcısı hazırlandı.

## Görünüm ve kullanım

Luna 1.6.7 kaynak düzeni ve gerçek `home.jpg` ekranıyla karşılaştırma yapıldı. `frontend-design`, `luna-ui-design` ve web arayüz yönergeleri kullanıldı. Üstte Film/Müzik/Kitaplar seçimi, kompakt yatay gezinme, yuvarlak düğmeler, siyaha yakın yüzeyler, turuncu vurgu, geniş yuvarlatılmış kapak alanı ve daha dar afiş rafları eklendi. 1920px'de tek satır menü; daraldıkça erişilebilir ek satıra dönüşür. Eski Whisper stüdyo/browser paleti değiştirilmedi; yeni tema ana sayfayla sınırlıdır. Marka ve mevcut motorlar Whisper olarak kalır. Luna'nın GPL kodu/film görselleri kopyalanmadı; özgün Electron kodu kullanıldı.

Yeni görünümü incelemek için dalda **`preview-luna.bat`** bulunur. Bu bilgisayarda ayrıca **`D:/Whisper Local/Luna Onizleme.bat`** yerel kısayolu oluşturuldu; `tmp/audit470/preview-luna.bat` çağırır. Normal ana `start.bat` değiştirilmedi. Önizleme gerçek `start.bat` → `npm start` → Electron akışıyla açıldı; `tmp/luna-preview-profile` ayrı profil kullanır. Bu nedenle normal hesap/çerez/kitaplık verileri bu önizlemeye kendiliğinden kopyalanmaz. Boş raflar veri kaybı değildir.

## Çalışan özellikler

- **Müzik kitaplığı:** yerel dosyalar veya klasör içe aktarma, gerçek ffprobe etiketlerinden başlık/sanatçı/albüm/süre; sanatçı-albüm filtresi ve arama. Tek seferde 500 dosya, toplam 5.000 kayıt; klasör taraması symlink izlemez. Üç sınırlı probe işçisi; import iptali sonuçları kaydetmeden durur. Kaynak sesler taşınmaz/değiştirilmez.
- **Çalma listeleri ve mini oynatıcı:** seçilen parçalarla kalıcı liste, sıra/önceki/sonraki, hız, uyku zamanlayıcısı, konum kaydı. İstenirse mevcut büyük oynatıcıda açılır. Mevcut oynatıcı/başka ses önizlemesi açıldığında mini ses duraklar.
- **Radyo ve podcast:** kullanıcı doğrudan radyo URL'si veya RSS/Atom beslemesi ekler; gerçek enclosure alanlarından en fazla 200 bölüm okunur. Besleme yenilemesi bölüm konumlarını korur. HTTP isteği 15sn, gövde 2MB, Python ayrıştırıcı 30sn sınırındadır. Kullanıcı hesabı/anahtarı gönderilmez. Hassas imzalı/token'lı adresler kalıcı listeye alınmaz; herkese açık yayın adresi gerekir.
- **Kitap rafı:** EPUB/PDF/TXT seçimi, başlık/yazar/uygun kapak, yerel kaynak dosyası; yeni PDF motoru yerine mevcut okuyucu kullanılır. EPUB manifest/spine sırasıyla güvenli düz metne çevrilir; kitabın script/CSS/uzak kaynakları çalıştırılmaz. EPUB 2/3 akış metni, 900.000 karakter ve 1.000 bölüm sınırı; DRM/sabit düzen için tam sadakat iddiası yok.
- **Metin okuyucu:** bölüm seçimi, yazı boyutu, kaydedilen konum, yer imleri/seçilmiş metinden alıntılar; bölüm kopyalama ve mevcut ses stüdyosuna giriş. Bölümün otomatik TTS işine gönderildiği iddiası yok; metin kopyalanıp mevcut stüdyoda kullanılabilir.
- **Letterboxd CSV:** UTF-8/UTF-16/cp1254, tırnaklı/virgüllü başlık; önce kayıt sayısı/eşleşme/yeni yapım/belirsiz/korunacak puan önizlemesi, sonra açık Uygula eylemi. Mevcut kişisel puan ezilmez, aynı başlık/yıl belirsizse atlanır. Yılı olmayan başlıkta birden fazla film varsa rastgele eşleştirilmez. Yeni yapımlar mevcut film kataloğuna yazılır. Bu bir web hesabı entegrasyonu veya canlı Letterboxd API bağlantısı değildir.
- **Yerel zevk özeti:** içe aktarılan/puanlanan sayı, ortalama ve dönem dağılımı; ücretli AI çağrısı yapmaz. Gelişmiş AI zevk/DNA/arkadaş uyumu veya tüm Luna öneri sistemi taşındı iddiası yok.
- Kitap/müzik/radyo/podcast/listeden kaldırma yalnız kaydı kaldırır; kaynak dosyayı silmez ve önce onay ister.

## Kalıcılık ve korunma

`userData/media-shelf.json` yeni sürüm1 yerel kayıt dosyasıdır; en fazla 16MB. Atomik/fsync yazımı kullanır. Bozuk dosya tespit edilirse boş veriyle üzerine yazılmaz. Bu dosya mevcut `.wbp` çalışma paketi kapsamına henüz eklenmedi; normal profil/manuel dosya yedeğinde ayrıca tutulmalı. Orijinal kitap/ses dosyaları pakete kopyalanmaz.

Katalog için ikinci bağımsız cache oluşturulmadı: yeni servis, mevcut `media-catalog-service` içindeki aynı store nesnesini kullanır. Aksi halde CSV içe aktarımı diske yazılsa bile açık katalog eski listeyi gösterebilirdi. Yeni `upsertMany` tüm patch'leri doğruladıktan sonra tek atomik katalog yazımı yapar; bozuk satır yarım güncelleme bırakmaz. `media-shelf.json` ve katalog iki ayrı dosyadır; ikisini kapsayan tek disk işlemi garantisi yoktur. Katalog sonrası özet dosyası yazılamazsa hata döner; tekrar önizleme eşleşmeleri yeniden hesaplar ve kişisel puanları korur.

Besleme getirilirken eski state tutulup ağ yanıtıyla diğer kütüphane değişikliklerinin ezilmesi önlendi: yazımdan hemen önce son state tekrar okunur. Podcast yenilemede eski bölüm konumu korunur. Mini oynatıcıda `pause/timeupdate/ended` sırasında kayıt yapılır; zorla süreç öldürülürse son 10 saniye kaybolabilir. Kitap kapatma kaydı başarısızsa okuyucu hatayı gösterir, sessizce kapanmaz.

## Doğrulama

- Beş hedefli Node dosyası: shelf hizmeti, home modeli, mevcut katalog store/hizmet ve sandbox preload — geçti (runner 10 sonuç). Yetkisiz IPC, key yerine rastgele yerel yol reddi, bozuk dosyayı koruma, CSV önizleme, kişisel puan koruma, tek kullanımlık onay token'ı, katalog cache görünürlüğü, toplu işlemin atomik başarısızlığı ve podcast konumu kapsandı.
- `backend/test_media_shelf.py`: altı test geçti. EPUB spine sırası/boş ilk başlık/Unicode/tek geçiş entity, script temizliği, ZIP yol kaçışı reddi, DTD reddi, RSS/Atom enclosure, CSV tırnaklama/geçersiz puan ve cp1254/UTF-16 metin.
- `tests/electron-media-home.smoke.js`: Windows gerçek main/preload, sentetik dosyalar ve ayrı profil ile geçti. Önceki film/resume/browser/dublaj geçişleri yanında gerçek etiketli m4a dosyası import/çalma, liste oluşturma, metin okuyucuda script etiketinin metin kalması, yer imi kaydı ve onaylı CSV importu UI üzerinden doğrulandı.
- 1920/1440/940/680 mantıksal piksel, TR/EN, koyu/açık ekranlar alındı ve görsel olarak incelendi. Masaüstü DPI3 kaydı ekran dosyalarında daha yüksek fiziksel çözünürlük üretir. Afişler sentetik tek renk test görselidir; kullanıcı filmi kopyalanmadı. `.uiprev/media-home-smoke/1792830625776-16052/` ignored kanıt dizinidir.
- Önceki bağımsız `electron-media-catalog.smoke.js` bu tekrarında birkaç dakika içinde sonuç döndürmedi; yalnız bu testin bilinen 21496 PID'li Electron süreci sonlandırıldı. **Bu tur o test geçti denmez.** Önceki teslimdeki geçiş tarihsel kanıttır. Yeni home smoke'un mevcut katalog/oynatıcı ve yeni özellik akışları geçti; takılan eski smoke'un kökü ayrıca incelenebilir. Kullanıcının uygulaması/önizleme kapatılmadı.
- Değişen JS dosyaları `node --check`, Python `py_compile`, `git diff --check` geçti. Altı Python testi uyarısız sonlandı. Tam test/CI bitişi beklenmedi; CI kapatılmadı.

Gerçek internet radyo/podcast yayını, canlı sağlayıcı, uzun kitap, görsel EPUB, MP3/FLAC tüm codec çeşitleri, fiziksel ses donanımından öznel dinleme, GPU/TTS, DRM ve kullanıcı hesapları bu tur doğrulanmadı. Podcast ana servis testi kontrollü RSS yanıtı kullanır; gerçek yayın kalitesi kanıtı değildir. Müzik smoke gerçek AAC/M4A dosyası/Chromium readyState ile çalışır.

## Kaynaklar

- [Luna beta 1.6.7](https://github.com/Nothingman333/Luna-Player/releases/tag/v1.6.7); yayımlanmamış son paket kimliği önceki [ana sayfa raporunda](LUNA_MEDIA_HOME_2026-10-24.md).
- [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/): manifest/spine ve kitap kapsayıcı yapısı.
- [RSS 2.0 specification](https://www.rssboard.org/rss-specification): enclosure tabanlı bölüm kaynağı.
- [Letterboxd importing format](https://letterboxd.com/about/importing-data/): CSV başlık ve puan biçimleri. Bu uygulamada Name/Title, Year, Rating ve Watched Date/WatchedDate alt kümesi uygulanır; tüm resmî kolonlar/ZIP arşivi desteği iddia edilmez.

Önceki ses PR481 ve mevcut master korunmuştur. PR482 dalında devam edilir; kullanıcı incelemesi olmadan master'a merge yapılmaz. Ana kopyadaki tek ek, yerel ve commit dışı `Luna Onizleme.bat` kısayoludur. Geliştirme checkout'unda mevcut venv/bin/node_modules için ignored junction'lar kullanıldı; hedef bağımlılıklar değiştirilmedi, yeni npm/Python paketi indirilmedi.
