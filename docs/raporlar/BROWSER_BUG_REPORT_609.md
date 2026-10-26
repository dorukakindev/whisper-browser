# Rapor609 — Sahne bağlamı, önizlemeli zaman ve uyumlu oynatma

Kullanıcı Rapor608'de önerilen üç geliştirmeyi yetkilendirdi. Üç ürün alanı uygulandı;bu bir sayısal bug taraması değildir. Başlangıç:`51486949c91a21cbfa9f80b5442dcf9b422fac5b`. Ürün bitişi:`933702c6533f5277f7c5318898051cef6178f63e`. Dal:codex/product609. Depo:https://github.com/dorukakindev/whisper-browser.

## 1. Sahne bağlamı
Oynatıcı→Zamanlama masası→Sahne bağlamı ve zaman önerileri paneli. Shift+tıkla seçilen cuearalığı veya analiz başlangıç/bitiş saniyeleri kullanılır. Sahne özeti,terimler ve karakter ilişkileri düzenlenebilir. Notlar100kayıtla sınırlı localStorage içinde kaynak kimliği,aralık ve cueiçerik revizyonuyla saklanır. Önce aralık notlarını yükle,sonra düzenle/kaydet/yeniden çevir. Yanlış kaynak/aralık notları sessizce gönderilmez.

Mevcut startRangeRetranslate/makeTransBtn akışı kullanılır;ikinci çeviri sistemi yok. Kaynak rolünde SRT gerekir. Aralık dışı mevcut çeviriyi koruma ve mevcut fark incelemesi sürer. Notlar yalnız translate-only ve cue-range işlerinde job-local JSON dosyasıyla backend'e verilir;alanlar2000/1500/1500karakterle sınırlıdır. Dosya mevcut iş tmpyaşam döngüsüne bağlıdır. İstem notları güvenilmez bağlam olarak sınırlar;kaynak ve sözlük önceliklidir. Refine geçişi de notları alır. Cache kimliği notları içerir;boş notta eski anahtar korunur.

Bu otomatik sahne özeti çıkarımı veya insan değerlendirmeli çeviri kalite garantisi değildir. Terim alanı mevcut sert kullanıcı sözlüğünün yerine geçmeyen sahne bağlamıdır. Notlar bu kuruluma yereldir;hesaplar arası senkron değildir.

## 2. Önizlemeli zaman önerileri
Yakın önceki kesime en fazla120ms başlangıç uzatma;3–11karelik mevcut boşluğu2kareye kapatacak son uzatma. FPS24/25/30/50/60. Konuşma penceresi kısaltılmaz,komşuya overlap üretilmez,aralık dışı cueya dokunulmaz;öneriyle7saniye üstüne çıkılmaz. Kurallar muhafazakâr ürün önerileridir,resmî standart uyumu iddiası değildir.

Önizlemede satır/metin/önceki ve sonraki saniyeler gösterilir;uygula açık eylemdir. Tek timeline undo snapshotı kullanılır. Kaynak,metin veya senkron dönüşümü değişirse eski öneri uygulanamaz. Video kesimleri subtitleSourceTime ile altyazı zamanına çevrilir. Dışa yazmak için mevcut Kopya olarak kaydet kullanılır;dosya sessizce değiştirilmez.

## 3. Codec oynatma desteği
Yerel decode/unsupported hatasında uyumlu kopya hazırlama diyaloğu. ffprobe ile codec ve süre doğrulanır. H.264 video kopyalanır,ilk ses izi AAC192k yapılır,MP4 hazırlanır. Orijinal dosya,kitaplık kimliği ve altyazı kaynağı korunur;yalnız videoelementi hazırlanmış kopyayı oynatır. Kaldığı saniye korunur. Çıktı doğrulandıktan sonra opaqueolmayan yerel grant mevcut yetki servisiyle verilir.

H.264 dışı video otomatik ağır transcode edilmez;anlaşılır açıklamayla durur. İlk ses izi kullanılır,embeddedsub/audio diğer izler hazırlanmış kopyaya taşınmaz;özgün dosya ve orijinal iz hizmetleri korunur. Süre6saat,cache4GB ve disk payı256MBkontrolleri var. Cache kaynak yol/boyut/mtime ile ayrılır;bozuk çıktı yeniden üretilir. Kullanıcı dosyası silinmez;cache dolunca işlem reddedilir,otomatik agresif temizlik yapılmaz. İptal/senderdestroy/quit çocuğu mevcut güvenli süreç yordamıyla durdurur;partialdosya temizlenir.15dakika timeout. Navigasyon sonrası geç çıktı yeni kaynağa uygulanmaz.

## Değişen dosyalar
- src/scene-timing-tools.js:sınırlı notlar,imza ve değişmez muhafazakâr zaman önerisi motoru.
- src/media-compatibility.js:probe,codec/alan kontrolleri,atomik cache doğrulama,iptal ve yetkili IPC.
- src/main.js:servis kaydı,işe özel not dosyası ve staging hata temizliği.
- src/preload.js:prepare/cancel köprüsü.
- backend/transcribe.py:argparse/iş notlarını yükleme,ana/refine istemi ve cache kimliği.
- src/renderer/index.html,styles.css:katlanır panel,üç alan,önizleme ve ortalanmış modal;940pxaltında tek kolon,mevcut amber/grafit tokenları.
- src/renderer/renderer.js:not saklama/bağlama,mevcut aralık çevirisine aktarım,önizle/uygula/undo,codec hata diyaloğu ve bayat sonuç koruması;EN/TR.
- tests/product609.test.js:konuşma koruma/idempotans/aralık,alan sınırı,gerçek ffmpeg/ffprobe/cache/iptal/unsupported codec.
- tests/test_scene609.py:cache ayrımı ve kontrollü sağlayıcının gerçek llm_translate isteminde notları görmesi.
- tests/electron-product609.smoke.js:izole gerçek Windows arayüz kabulü,önceki606kabul akışlarıyla beraber.

## Kanıt ve sınırlar
12hedefli komut exit0:ilgili Node grubu22sonuç,ikiPython sahne testi,markupregresyonu,125kontrollüçeviri denetimi,JScheck vePythoncompile. Ham yerel kayıt tmp/product609-checks.json. Son değişiklik sonrası yeni ürün testleri ve native smoke tekrar geçti.

Son native Windows koşumu:`node_modules/.bin/electron.cmd tests/electron-product609.smoke.js --disable-gpu`,exit0. Yerel görüntüler .uiprev/product609-1793022858551;önceki aynı son düzen nativegörüntüleri product609-1793022761783. ENpanel/TR940px ve ortalanmış codecmodal görüntüleri elle incelendi. Not kaydetme,önizle/uygula/undo,5sn offsette doğru kesim ve önizleme sonrası offsetdeğişiminde red;gerçekIPC ile hazırlanan kopyanın videoelementine bağlanması ve özgün localPath kimliği koruması geçti.

Gerçek ffmpeg sentetik H.264+PCM→MP4AAC,cachehit,bozuk cacheyenidenüretim,pre-abort,unsupportedMPEG4 red ve özgün dosya byteeşitliği geçti. Kontrollü LLM bağımlılığı gerçek ücretli model değildir;doğal çeviri/duygu/dublajkalitesi test edildi denmiyor. Tam npmtest,uzunCI,CUDATTS,canlıYouTube,DRM,kişiselstart.bat yeniden açılışı yapılmadı. CI açık ve beklenmedi. install.bat/start.bat ve bağımlılıklar değişmedi. Yeni paket/kurulum yok;yerel scene-context-v1 localStorage kaydı ve uygulama userData cache/media-compatibility klasörü eklendi. Kişisel uygulama kapatılmadı. Geçmiş kişisel OFFLINE-MANIFEST/INDEX516 ve115untracked dosya teslim kapsamı dışında.
