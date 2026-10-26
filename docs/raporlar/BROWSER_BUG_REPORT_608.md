# Rapor608 — Dış repo önerilerinin güncel ürünle karşılaştırılması

Kaynak kodu: `735e4e9786b9113b2c3951089edd5dcf04b54795`. Kullanıcının paylaştığı araştırma metni okundu; bu turda dış repolar yeniden indirilmedi, sürüm/lisans iddiaları doğrulanmış sayılmadı. Ürün kodu değiştirilmedi ve yeni bug iddia edilmiyor. Değerlendirme dosya/sembol incelemesidir, gerçek kullanım testi değildir.

## Son teslimde eklenenler
- M1 ortak webRequest: src/session-webrequest-mux.js;src/browser-adblock.js ve main.js entegrasyonu. Ghostery zaten vardı;dinleyici sahipliği eklendi.
- M3 biçim koruması: src/subtitle-sentence-layout.js,browser-translation-scheduler.js;backend/sentence_translation.py ve transcribe.py. Dış translate_guard.py aynen alınmadı;tag sırası zayıflığı nedeniyle mevcut hatta güvenli kontrol eklendi.
- M4 kalite profilleri: src/renderer/timeline-issue-scan.js ve renderer/index.html. TR diyalog/çocuk/SDH;CPS,süre,satır ve boşluk incelemesi. BBC veya resmî Netflix uyumluluğu iddiası yok.
- M5 aralık dalga/sahne: src/media-analysis.js. Peaks.js veya PySceneDetect bağımlılığı değil;mevcut ffmpeg üzerinden yerel seçili aralık analizi.
- M6 altyazı araması: src/watch-index.js,renderer/media-search-ui.js ve main.js. Mevcut SQLite indeksi ve Türkçe katlama;sqlite-vec/embedding/RRF yok.

## Önceden var olanlar
- JASSUB: package.json ve renderer/vendor/browser-ass;ASS.js ile ikinci renderer kurulmadı.
- Altyazısız aralık atlama: src/playback-policy.js,skip-gaps. Dış condensed-playback.js ayrıca eklenmedi.
- Parçalı senkron: backend/browser_align.py ve main.js sync-piecewise aktarımı. Bu, bütün alass/AutoSubSync/Bazarr motorlarının eklendiği anlamına gelmez.
- Bağlam/sözlük: browser-terminology.js,browser-site-terminology.js;backend/transcribe.py extract_auto_glossary/build_translate_prompt. Kullanıcı tarafından düzenlenen sahne özeti paneliyle aynı şey değildir.
- İkinci çeviri iyileştirme geçişi: backend/transcribe.py build_refine_prompt. Her düşük güvenli satır için tüm önerilen UX ve seçim politikasının tamamlandığı anlamına gelmez.
- Sayfa çevirisi: browser-page-translate.js;asistan sayfa komutları mevcut. Read Frog kodu alınmış değildir.
- OpenAI uyumlu sağlayıcı altyapısı: provider-model-profiles.js,translation-provider-probe.js ve mevcut endpoint akışları. Yerel model kurulması zorunlu değil;TranslateGemma kurulduğu iddia edilmiyor.
- Altyazı bulma: browser-subtitle-search.js OpenSubtitles API ve Stremio alternatifi;opensubtitles-hash.js. Tüm Bazarr sağlayıcıları yok.
- PDF/manga çevirisi: pdf-translate.js,browser-manga.js,manga-geometry.js. Tam düzen koruyan çift dilli PDF/katmanlı PSD motoru doğrulanmadı.
- VoxCPM2 dublaj/sesli kitap zaten ürünün parçası. Piper/Kokoro ile değiştirilmedi.
- Komut paleti/sekme kaynak yönetimi: browser-command-palette.js,browser-tab-resources.js.
- Anki: backend/export_anki.py ve main/preload browser:research:exportAnki mevcut;bu turda kullanılabilirliği çalıştırılmadı. Geniş dil öğrenme akışı ürün önceliği değil.

## Kısmi veya bu incelemede tamamlandığı doğrulanmayanlar
- Düzenlenebilir sahne özeti + terim paneli + seçili sahne/partiyi yeniden çevirme birleşik akışı.
- Codec uyumsuzluğunda otomatik video-copy/audio-AAC kurtarma ve güvenli önbellek. backend/media.py indirme remuxu tek başına yerel oynatıcı kurtarmasının kanıtı değil.
- Cueyu kesime yaslama ve boşluğu kapatma için önce/sonra önizleme/onay. Mevcut kesim işareti bunu otomatik yapmaz.
- SQLite-vec semantik hibrit arama;COMET/XCOMET;Bergamot/TranslateLocally;Chrome Translator;Chrome uzantı katmanı;gömülü Python.
- Tam hashli transitif Python kilidi ve Electronegativity/pip-audit güvenlik iş akışı. requirements-core.lock doğrudan sürümleri sabitler;her bağımlılığı hash ile sabitlemiş sayılmaz. Mevcut CI genel test/arayüz kontrolleridir.
- Tek şemadan üretilen tüm UI/IPC/backend seçenekleri:bu çapta bir dönüşüm tamamlandı diye sunulmamalı.

## Önerdiğim üç ürün geliştirmesi
1. Düzenlenebilir sahne bağlamı:özet/terimler ve karakter ilişkileri,kaynak kapsamı ve revizyonu belli olacak;yalnız seçili sahne/parça yeniden çevrilecek. Mevcut sözlük/cache/refine korunmalı. Otomatik uzun özetlerin yanlış bağlam üretmesi ve API maliyeti sınırlanmalı.
2. Önizlemeli zaman düzeltme:mevcut dalga/kesim üstünde yakın kesime yasla/boşluğu düzelt önerisi;konuşma kesilmesi veya overlap olmadan önce/sonra göster,tek geri al. Altyazıları sessizce toplu kaydırma.
3. Oynatılamayan yerel dosyayı kurtarma:önce gerçek codec hatası ve ffprobe kanıtı;uygunsa videoyu kopyalayıp sesi AACye dönüştür,iptal ve disk sınırı,orijinal dosyayı koru. Mevcut eşdeğer akış varsa onu tamamla,yeni rakip servis kurma.

Büyük yerel model,Anki genişletmesi,OCR ve Chrome uzantısını şu an önceliklendirmiyorum. Kullanıcı dış API ve VoxCPM2 akışını tercih ediyor;ikinci TTS veya geniş çeviri motoru eklemek mevcut kaliteyi kendiliğinden artırmaz. Harici kod alınmadan önce ilgili sabit commit ve gerçek lisans/bağımlılık uyumu ayrıca incelenmeli.

Bu tur yalnız karşılaştırma:ürün,UI/GPU/model testleri çalıştırılmadı. Önceki Rapor606 testleri tarihsel kanıttır;bu incelemeye yeni başarı diye yazılmaz.
