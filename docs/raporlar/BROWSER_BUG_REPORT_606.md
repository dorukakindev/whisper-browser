# Rapor 606 — İncelenen paketlerden güvenli ürün entegrasyonu

## Kapsam ve kanıt
Kullanıcı, Rapor604'te önerilenleri ve Rapor605'teki dört doğrulanmış bulguyu uygulamayı istedi. Eski paket patch'leri körlemesine uygulanmadı; güncel boru hattı korundu. Dört bulgu onarımı ve beş entegrasyon alanı teslim edildi; bunlar dokuz bağımsız bug diye sayılmıyor.

Başlangıç: `7350393c8224f3fdcecf2e2718292cc7273bd9af`. Ürün commit'i: `225a1d0069d354c202d06d0f432a7ca6d5e00379`. Dal: `codex/integration606`. Depo: https://github.com/dorukakindev/whisper-browser.

## Dört bulgu
1. Arama kutusu: EN/TR yer tutucusu için220px alan ve sağ iç boşluk; yerel temizleme kontrolü korunuyor.940px TR ve1280px EN gerçek Windows görüntüleri incelendi.
2. Ülke komutları: Türkçe I/ı katlaması, büyük harfli İngilizce ülke adları ve ABD eşanlamlısı. Olumsuz/soru komutlarının eyleme dönüşmemesi korunuyor.
3. Açık anahtar silme: şifreli kurtarma aynasından da yalnız silinen alanlar çıkarılıyor. Normal düzenlemenin önceki geçerli değeri kurtarma davranışı korunuyor. Ayna yazılamazsa başarı dönmüyor ve asıl kasa değiştirilmeden hata bildiriliyor.
4. Keşfet: bağlantı hatası, sıfır sonuç ve filtre eşleşmemesi ayrı. Kontrollü fetch hatasında yerelleştirilmiş mesaj ve yeniden deneme düğmesi; ham ağ hatası ve yanlış 'eşleşme yok' mesajı gösterilmiyor.

## Alınan özellikler
- M1: Electron Session başına tek gerçek webRequest dinleyicisi; sahiplikli slotlar, callback-once, iptal/redirect sonlandırması, başlıkların sırayla birleştirilmesi. Ghostery aç/kapat yalnız kendi slotunu kaldırır. YouTube medya başlıkları aynı mux'a bağlıdır.
- M3: mevcut JS/Python çeviri hattında HTML/ASS/♪ biçim belirteçlerinin sıra/sayı koruması; parça kayması ve bozuk cache kontrolü. Yeni çevirmen veya ASS yeniden kurucusu eklenmedi; mevcut güvenli ASS geri kurma korunur. Mevcut lenient/forceAccept politikaları uyarılı kabul yapabilir; mutlak kusursuzluk iddiası yoktur.
- M4: mevcut zaman çizelgesinde isteğe bağlı TR diyalog17, çocuk13, SDH20 CPS;42karakter, süre ve FPS bazlı iki kare boşluk incelemesi. Bunlar ürün profilleridir; Netflix sertifikasyonu değildir. Resmî Netflix sayfalarına bu ortamda erişilemedi.
- M5: yerel medyanın seçili en fazla30dakikalık aralığında dalga biçimi ve ffmpeg0.3eşikli sahne kesimi; kaynak saniyelerine geri hizalama,0tabanlı ses izi, iptal, sınırlı önbellek. Ses izi yoksa sahne verisi korunur ve uyarı gösterilir. Sahne kesimi anlamsal sahne analizi değildir. Altyazı zamanları otomatik değiştirilmez.
- M6: ana sayfa genel aramasında mevcut kayıtlı altyazı indeksi; eşleşen metin/saniye ve doğrudan oynatma. İkinci veri tabanı/embedding/model yok. SQLite araması karma I/ı için en fazla6konum/64varyant ve12sözcük ile sınırlıdır; mevcut dosya taraması sürer.

## Dosya sorumlulukları
- `src/session-webrequest-mux.js`: ağ dinleyicisi sahipliği ve tek callback.
- `src/browser-adblock.js`, `src/main.js`: Ghostery adaptörü, YouTube başlıkları, analiz IPC ve arama katlaması.
- `src/media-analysis.js`: aralık/iz doğrulama, kaynak kimliği, iptal, kısmi sonuç ve dört kayıtlık bellek cache.
- `src/browser-reference-media.js`: mevcut güvenli süreç okuyucusuna akış stderr tüketicisi; gizli ortam temizliği ve süreç kapanış teyidi korunur.
- `src/preload.js`: analiz/iptal köprüsü.
- `src/watch-index.js`: Türkçe SQLite arama varyantları.
- `src/assistant-media-command.js`, `src/secret-store.js`: ülke ve açık anahtar silme onarımları.
- `src/subtitle-sentence-layout.js`, `src/browser-translation-scheduler.js`, `backend/sentence_translation.py`, `backend/transcribe.py`: biçim bütünlüğü ve istem sözleşmesi.
- `src/renderer/media-search-ui.js`, `media-discovery-ui.js`, `media-home.css`: altyazı sonuçları, ağ hata durumu, arama alanı.
- `src/renderer/timeline-issue-scan.js`, `index.html`, `renderer.js`, `styles.css`: profiller, aralık analiz kontrolleri, sahne/dalga çizimi ve çakışmayan panel düzeni; EN/TR etiketleri.
- `tests/integration606.test.js`, `tests/test_markup606.py`, `tests/electron-integration606.smoke.js`: davranış, gerçek ffmpeg/SQLite ve izole Windows Electron kabulü.
- `tests/settings-security.test.js`: mevcut spawnImpl çağrısını statik güvenlik kontrolüne dahil eder; ortam temizliği şartı kaldırılmadı.

## Doğrulama
-23hedefli komutun tamamı exit0: ilgili Node testleri, Python biçim ve altın derlem testleri,125kontrollü çeviri denetimi, değişen JS sözdizimi ve Python derleme kontrolleri. Ham yerel günlük: `tmp/integration606-final-results.json` (Git'e alınmadı).
- Ek hedefli kasa kurtarma25, watch-index20 ve Electron bridge kontrolleri geçti.
- Son gerçek Windows Electron koşumu: `node_modules/.bin/electron.cmd tests/electron-integration606.smoke.js --disable-gpu`, exit0. Görüntü/kanıt `.uiprev/integration606-1793020219660` (Git'e alınmadı).
- Gerçek ffmpeg: sentetik siyah→beyaz video,1–3sn analizi, kaynak2sn sahne kesimi; eksik ses izi, iptal ve kaynak zamanı.
- Gerçek SQLite: isik/ışık/ISIK ve istanbul sorguları; Electron'da eşleşmeden gerçek yerel videonun1sn konumuna geçiş.
- Gerçek Ghostery ayrı oturum ağ testi: enable/disable boyunca diğer sahibin başlığı korunur; callback sonrası throw çift sonuç üretmez. İkinci kozmetik global IPC örneği açılmadı; test ağ katmanına odaklıdır.

## Sınırlar ve bilinçli kapsam
Tam npm test ve uzun CI beklenmedi; CI kapatılmadı. Kişisel start.bat oturumu kapatılmadı/yeniden açılmadı. start.bat/install.bat ve bağımlılık kilitleri değişmedi. Gerçek CUDA/TTS, DRM, canlı YouTube, ücretli sağlayıcı ve tüm sitelerde reklam engelleme doğrulanmadı. GPU veya insan benzeri ses kalitesinde ilerleme iddiası yok. Yeni bağımlılık, kurulum veya kalıcı şema göçü yok.

Zaten mevcut parça senkronu/JASSUB/boşluk oynatımı tekrar eklenmedi. Anki, gömülü Python ve rapor taşıma script'i kapsam dışı. Task04 dış paketindeki çalıştırılmamış11senaryo bu teslimle çalıştırılmış sayılmıyor.
