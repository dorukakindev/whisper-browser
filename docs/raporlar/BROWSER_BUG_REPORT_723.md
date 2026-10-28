# Rapor 723 — Metin, kitap ve dublaj için ortak yerel referans

## Doğrulanan kopukluk ve çözüm
R722 metin stüdyosunda yerel WAV kullanımı yalnız pencerenin geçici seçimi olarak kalıyordu. Kullanıcı bu sesi kitap/dublaj ortak listesine ad vererek alamıyordu. **Diğer alanlarda kullan → Referans adı → Ortak listeye kaydet** artık WAV ve düzenlenen dökümün ayrı bir kopyasını Downloads/Sesler/Ses referansları/<UUID> altına kaydeder. Özgün yerel dosyalar korunur. Kaydetmek varsayılanı değiştirmez; ayrı **Varsayılan ses yap** eylemi mevcut yetkili referenceUse yolunu kullanır. Kitaba özel tercihler korunur.

## Kod ve davranış
- `src/dub-service.js`: mevcut referenceName/referencePaths/referenceEntry doğrulamasıyla kopya içe aktarma. Geçerli WAV/64MiB sınırı,160 karakter isim/8000 karakter döküm; UUID klasörü, COPYFILE_EXCL, metadata en son. Hatalı kopya kendi dosyalarını temizler; kaynak taşınmaz. Manuel döküm ASR baseline'ı diye kaydedilmez, quality/baseline unknown kalır.
- `src/text-voice-studio.js`: mevcut dub:textVoice içinde save-reference; yalnız göndericiye bağlı seçim kimliği veya doğrulanmış ortak UUID. Üretim sırasında kayıt reddi. Config varsa gerçek ortak libraryId döndürür; varsayılanın geçici kimlik ve ortak kimlikle iki kez görünmesi önlenir.
- `src/renderer/text-voice-studio.js`/CSS: adlandırma, kaydetme, açık varsayılan eylemi; EN/TR, mevcut tema, uzun düğmeler alt alta. Native dosya seçiminde I/O kilidi; metin/ayarlar bekleyen picker sırasında üretime kaçamaz. Refresh güncel ortak listeyi yeniden kurar, silinmiş ortak girdiyi eski seçenek olarak biriktirmez; kullanıcı döküm taslağı korunur.
- `src/renderer/media-workflows-ui.js`/CSS: kitapta Referans sesleri yönet düğmesi aynı stüdyoyu açar. Tek ortak event listener ve render/iş/sequence kontrolüyle seçenekler güncellenir; kitap editörü yeniden kurulmaz. Kitaba özel referenceId ve kaydedilmemiş metin korunur. Ses seçimi/üretim alanları/varsayılan araçları ayrıldı; yuvarlatılmış40+px kontroller ve ortak IBM Plex Sans yazı tipi.
- İki mevcut test dosyası genişletildi; yeni kanal/paket/ücretli istek yok. Var olan referans klasör şeması kullanılır; metadata source='local-copy' yalnız bilgi alanıdır.

## Doğrulama ve kanıt
`node --test --test-isolation=none tests/text-voice-studio.test.js tests/voice-reference.test.js tests/voice-reference-ui.test.js tests/book-reliability.test.js tests/book-render-owner644.test.js tests/ipc-parity.test.js`:15 alt test PASS. Kopya byte eşitliği, özgün TXT korunumu, manuelbaseline null, varsayılanın yalnız açık eylemle değişmesi, sahte kimlik/boş ad/busy reddi, aynı referansla metin üretim/iptal sözleşmesi ve kitap render regresyonları. Son odaklı11alt test tekrarı da PASS. JS syntax ve diff kontrolü PASS.

`tests/electron-text-voice.smoke.js --shared-references --reference <sentetik WAV> --transcript <sentetik TXT> --engine <kurulu motor>` gerçek Windows ana süreç/preload/renderer ile PASS. Yerel seçim native picker dönüşü kontrollü sağlandı; filesystem/IPC/ortak liste gerçek. A kaydı → kitaba A seçimi → metin taslağı → yönetim düğmesi → B kaydı → varsayılan B → kitap A ve kaydedilmemiş metin aynı → dublaj listesinde B senaryosu geçti. Kitap tekrar açılışında EN görüntü ve taslak devamı da assert edildi. Yeni TTS/ASR/GPU üretimi bu pakette çalıştırılmadı; R722'nin gerçek üretimi yeni doğrulama diye sayılmadı.

[Native kısa sonuç](evidence/R723/acceptance.json), [ortak referans kaydı](evidence/R723/shared-voice-tr.png), [kitap koyuTR](evidence/R723/book-shared-voices-tr.png), [kitap açıkEN125%](evidence/R723/book-shared-voices-en-light-125.png). Görüntüler açılıp incelendi; ilk iki sütunlu dar kaydet düğmesi alt alta alındı; kitap ayarlarının eski flex yerleşimi ve kare kontrolleri düzenlendi.1360×1000TR koyu ve1000×950/%125→800CSS EN açık yatay taşmasız.

## Tasarım / kapsam sınırı
Full inceleme yalnız referans alt bölümü ve kitap ses ayarlarına aittir: tipografi ortak font, renk/yüzey mevcut token, yerleşim alanlara ayrılmış, etkileşim40+px/focus ve yerinde güncelleme. Ek dekoratif animasyon eklenmedi; mevcut geçiş/reduced-motion mekanizması korunur. Yavaş hareket/ekran okuyucu/fiziksel dosya seçici/kontrast ölçümü bu pakette yapılmadı. İngilizce kitap ekranı dil değişiminden sonra normal openProject ile tekrar çizilerek doğrulandı; açık kitabın bütün metinlerinin anında dil değiştirmesi iddiası yok.

Kullanıcı uygulaması, engine kaynakları, hesaplar ve kişisel sesler kullanılmadı. Tam start.bat/install/GPU/YouTube/ücretliAPI/uzunCI çalışmadı; CI beklenmedi. Mevcut11before-quit listener uyarısı açık.64MiB sınırı süre/konuşmacı/temizlik kalitesi ölçümü değildir; uzun/müzikli kaydı otomatik iyi referans yapmaz. Ses dosyasını dinleme ve doğru döküm sorumluluğu UI'da korunur.

Mevcut repository referans koleksiyonu ve güvenli seçim desenleri yeniden kullanıldı. Node [copyFileSync](https://nodejs.org/api/fs.html#fscopyfilesyncsrc-dest-mode) ve Electron [native dialog](https://www.electronjs.org/docs/latest/api/dialog#dialogshowopendialogbrowserwindow-options) birincil belgeleri kontrol edildi; dış repo kodu kopyalanmadı, yeni lisans/bağımlılık yok.

P035/P092/P094 ek kısmi kanıt; bütün90hedef tamamlanmadı. Müzik kapsamı yok.
