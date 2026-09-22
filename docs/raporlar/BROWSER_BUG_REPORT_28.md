# BROWSER BUG REPORT 28 — Canlı DASH, TTML/IMSC-STPP ve altyazı bütünlüğü

Tarih: 2026-09-15
Başlangıç ürün commit'i: 0dd183f56c81d0c3cc8244a7b3e2f560c2b0766e
Teslim tabanı: cf69b208663246b7486c914f45f747ab3d5815a7 (arada yalnız belge commitleri)
Kapsam: canlı DASH sürekliliği, beklenen/yakalanan segment kapsamı, TTML/IMSC sunum kalıtımı, STPP zaman doğrulaması, gerçek Electron TextTrack/seek/EME olayları ve kaynak → çeviri → dosya → ekran bütünlüğü.

## Sonuç

Beş ürün kusuru doğrulandı ve düzeltildi. Bir Electron test varsayımı ürün kusuru olarak reddedildi; test gerçek MP4 byte-range sunumuyla düzeltildi. Gerçek sağlayıcı çağrısı yapılmadı ve DRM çözme/atlatma denenmedi.

## Bulgular ve düzeltmeler

### BUG-28-01 — Sonlu canlı DASH SegmentTimeline genişletilmiyordu [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

Durum: DÜZELTİLDİ · Önem: P1

Dinamik MPD için tüm SegmentTemplate genişletmesi kapalıydı. Açıkça listelenmiş sonlu canlı pencerelerde manifestte ilan edilen fakat ağda henüz görülmeyen altyazı parçaları kaçabiliyordu.

Sonlu canlı SegmentTimeline tespiti eklendi. Sonu açık r=-1 şablonları tahmin edilmiyor; sonraki açık t ile sınırı hesaplanabilen veya tamamen sonlu pencereler genişletiliyor. Pencere yenilenmesinde yalnız yeni segment indiriliyor.

Kanıt: browser-dash-capture 11/11; 240 parçalık 40 dakika senaryosu; 100/102/104 → 102/104/106 canlı pencere devri; eski pencereye seek sırasında yeniden indirme yok; açık uçlu r=-1 URL tahmini yok.

### BUG-28-02 — Kapsama haritasında beklenen segment aralıkları yoktu [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

Durum: DÜZELTİLDİ · Önem: P1

Harita başarılı aralık ve ağ hatası tutuyor, fakat manifestin beklenen aralıklarını bilmediği için geciken/hiç dönmeyen segmenti sessiz eksiklik olarak gösteremiyordu.

CaptureCoverageMap.expect ve beklenen-kapsanan aralık çıkarımı eklendi. DASH indirme grubu öncesinde segment zamanları beklenen aralık olarak kaydediliyor; missingRanges tanıda ayrı tutuluyor.

Kanıt: 0–18 beklenen aralıkta yakalanmayan 12–18 boşluğu doğrulandı; geciken segment tamamlandı sayılmadı ve yalnız eksik segment yeniden denendi.

### BUG-28-03 — TTML/IMSC stil kalıtımı ve ruby temizliği eksikti [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

Durum: DÜZELTİLDİ · Önem: P2

Çoklu/zincirli style referansları ile body/div sunum kalıtımı p cue'larına taşınmıyordu. direction ve unicodeBidi cue uyumluluk anahtarında yoktu. Ruby rt/rp okunuşu düz diyaloga karışıyordu.

Döngü korumalı zincirli stil çözümleme, body/div/p sunum bağlamı, region kalıtımı, direction/unicodeBidi metadata'sı ve rt/rp temizliği eklendi.

Kanıt: browser-subtitle-standards 9/9; imscJS karşılaştırması; zincirli stil, üst öğe region'u, RTL, dikey yazım ve ruby fixture'ı; browser-subtitles 79/79; MP4Box ile wvtt ve stpp tfdt/trun zaman diferansiyeli.

### BUG-28-04 — Bütünlük tanısı dosya ve ekran kaybını ayıramıyordu [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

Durum: DÜZELTİLDİ · Önem: P1

Tanı yalnız kaynak cue ve sağlayıcı sonucunu karşılaştırıyordu. Yakalama boşluğu, sağlayıcı hatası, sonuç boşluğu, doğrulanmış dosya eksikliği ve renderer'a uygulanmayan cue ayrışmıyordu.

Model capture-gap, provider-failure, output-gap, file-gap ve display-gap nedenlerini ayırıyor. Renderer uygulanan cue kimliklerini yetkili gönderici + aktif tab + doğru track kontrollü IPC ile bildiriyor. Dışa aktarılan dosya atomik yazımdan sonra tekrar okunup doğrulandığında dosya cue kimlikleri tanıya ekleniyor. web-tr- öneki normalize ediliyor.

Kanıt: browser-translation-integrity 10/10; browser-subtitle-actions gönderilen tab/track/cue argümanlarını doğruluyor; tam npm test paketi geçti.

### BUG-28-05 — Kimliği olan boş sonuç çevrilmiş sayılabiliyordu [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

Durum: DÜZELTİLDİ · Önem: P1

Genişletilmiş aşama eşleyicisinin ilk sürümünde cue kimliği olup text alanı olmayan/boş sonuç çevrilmiş kabul edilebiliyordu.

Her aşamada metnin string ve trim sonrasında dolu olması zorunlu kılındı. Boş, whitespace ve kimlik-only regresyonları eksik cue olarak kalıyor.

## Ret gerekçesi

### RET-28-01 — WAV bağlı video, güvenilir cue/seek zaman testi değildir [SONUÇ: REDDEDİLDİ · TEST VARSAYIMI]

Karar: ÜRÜN HATASI DEĞİL; TEST HARNESS DÜZELTİLDİ

İlk harness WAV ses kaynağını video öğesine bağlayıp cue ortasına seek ediyordu. Chromium VTT'yi yükleyip iki cue'yu ayrıştırsa da audio-only akışta medya zaman yürüyüşü kararlı değildi. Bir kez geçen kısa oynatma darbesi sonraki koşularda başarısız olduğundan kabul edilmedi. Görünür pencere ve arka plan anahtarları da kök neden çıkmadı; geri alındı.

Nihai harness backend/bin/ffmpeg.exe ile sistem geçici klasöründe 4 saniyelik gerçek MP4 üretiyor. Yerel HTTP sunucusu Range isteklerine 206, Accept-Ranges ve Content-Range ile yanıt veriyor. Test cue sınırının önüne seek edip gerçek currentTime sınırı geçene kadar bekliyor. Fixture finally içinde yalnız kendi geçici klasöründen siliniyor.

Kanıt: Nihai Electron köprü testi tek koşu ve ardından art arda 3/3 geçti. VTT yükleme, addtrack, seeked, activeCues, cuechange, cue sonrası boşluk, encrypted/waitingforkey ve geçersiz EME key-system reddi doğrulandı.

## Ayrıntılı doğrulama dökümü

- node tests/browser-subtitles.test.js: 79/79 GEÇTİ
- node tests/browser-dash-capture.test.js: 11/11 GEÇTİ
- node tests/browser-capture-provenance.test.js: GEÇTİ
- node tests/browser-subtitle-standards.test.js: 9/9 GEÇTİ
- node tests/browser-translation-integrity.test.js: 10/10 GEÇTİ
- node tests/browser-subtitle-actions.test.js: GEÇTİ
- npm test: GEÇTİ; son satır “Tüm testler geçti”
- npm run test:electron-bridge: nihai sürüm tek koşu + art arda 3/3 GEÇTİ
- backend/venv/Scripts/python.exe -m py_compile backend/transcribe.py: GEÇTİ
- npm run test:soak: GEÇTİ
  - yakalama 400/400
  - hibernasyon 50/50
  - işlenmeyen Promise reddi 0
  - listener delta 0
  - ana/renderer timer delta 0
  - GPU süreç delta 0
  - overlay ortalama 0,033 ms; maksimum 0,100 ms
  - 24/24 kaynak bütçesi sınır içinde
- Değişen ürün/test dosyalarında node --check: GEÇTİ
- git diff --check: GEÇTİ

## Sınırlar

- Gerçek ücretli çeviri sağlayıcısı çağrılmadı.
- EME olay/hata sözleşmesi doğrulandı; korumalı içeriğin şifresini çözme veya DRM atlatma yapılmadı.
- Canlı DASH deterministik yerel fixture ile test edildi; bütün üçüncü taraf siteler için başarı iddiası değildir.
- Yeni bağımlılık veya kalıcı veri şeması eklenmedi.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

- BUG-28-01–05: Beş ürün kusurunun düzeltme, dosya ve hedefli test kanıtları yukarıdaki bulgu başlıklarının altında yer alıyor; güncel kaynakta korunuyor.
- RET-28-01: WAV bağlı video varsayımı ürün hatası değildi. Gerçek MP4, byte-range HTTP ve zaman sınırı geçişi kullanan harness ile değiştirildi.
- Doğrulama: DASH, altyazı standartları, capture provenance, bütünlük, subtitle actions, tam npm, Electron köprüsü ve soak sonuçları yukarıdaki ayrıntılı listede kayıtlıdır.
- Sınır: gerçek ücretli sağlayıcı ve DRM çözme/atlatma kapsam dışıdır; sentetik canlı DASH doğrulaması bütün siteler için başarı iddiası değildir.
