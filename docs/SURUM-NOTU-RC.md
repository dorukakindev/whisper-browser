# Sürüm Adayı Teslim Notu — v0.9.0-beta.2 (aday)

Oluşturulma: 2026-10-01 · Temel sürüm: `v0.9.0-beta.1` sonrası ~480 commit
Etiketleme/yayın kararı kullanıcıdadır — bu not etiket değildir.

## Kabul kampanyası özeti

`tools/release-acceptance.js` kontrollü korpus koşusu (rapor 362):
transkripsiyon 7.2 s / 955 MiB tepe RSS / 63 cue doğru zamanlama;
çeviri final `.tr.srt` %92 kapsama (kalanlar bilinçli korunan özel adlar ve
ayna-dil satırlar — madde 1 analizi ayrıldı); düzenleme→kayıt→yeniden açma
sadık. Ek Electron doğrulama seti 61/61 yeşil.

## Bu sürümde öne çıkanlar (50 görev kampanyası)

- **Altyazı editörü:** ses dalga biçimi timeline, sürüklenebilir cue
  kenarları, CPS/sorun haritası, sorunlar paneli, kaydedilmemiş
  düzenleme kurtarma.
- **Çeviri inceleme:** seçili satır yeniden çeviri (elle düzenlemeyi
  korur), proje sözlüğü, kör A/B karşılaştırma, maliyet/süre görünümü,
  açıklanabilir kalite uyarıları.
- **İzleme:** çift altyazı karşılaştırma, medya-kimlikli dil tercihleri,
  dizi düzeyi ayarlar, bölüm–transkript bağlantısı, klasör eşleştirme.
- **Kütüphane:** artımlı klasör taraması, mükerrer kayıt birleştirme
  önizlemesi, devam görünümü, toplu yol yeniden bağlama, proje taşıma.
- **Browser:** site desteği açıklaması, yakalama inceleme ekranı,
  çalışma alanı kaydetme, profil sınırları görünürlüğü.
- **Kaynak/performans:** aşama bazlı kalan süre, donanım rehberi, ağ
  bütçesi, önbellek yönetim ekranı, iş kaynak zaman çizelgesi.
- **PDF/manga:** kaynak–çeviri çift görünüm, tablo eşleştirme, sayfa
  seçimi, OCR düzeltme koruması.
- **Veri koruma:** kapsamlı yedekleme/içe aktarma diff'i, dış dosya
  değişikliği algılama, disk ön kontrolü, çevrimdışı rozet, kurtarma
  merkezi.
- **Kurulum/sürüm:** yükseltme öncesi otomatik userData yedeği, çevrimdışı
  kurulum manifesti, güncelleme ön kontrolü, Windows sorun giderme rehberi.

## Bilinen sınırlar (dürüst liste)

- GPU/CUDA yolu bu build makinesinde yok — CUDA hız/bellek karşılaştırması
  Windows'ta (RTX 4070 Ti) bekliyor.
- Canlı sağlayıcı doğrulaması kontrollü stub'larla; gerçek OpenAI/ücretli
  API kalitesi kapsam dışı.
- DRM imzalı Castlabs akışı gerçek hesap gerektirir — doğrulanmadı.
- GitHub Actions bu hesapta devre dışı (flag süreci); doğrulama yerel
  `npm test` (tam paket yeşil) + Electron smoke'larla yapıldı.
- WhisperX/diarize betikleri Windows-only; Ubuntu'da `install.sh`
  karşılığı var.

## Windows doğrulama durumu

Elle Windows oturumlarında (devin-3c20a465 vb.) doğrulananlar:
NTP imleç davranışı, PDF açma, `D:\Whisper Local` boşluklu yol, dosya
seçici, `start.bat` akışı. Bekleyen liste `docs/ACIK-KARARLAR.md` ve
suspend oturumda.

## Etiketleme önerisi

Kod tabanı `v0.9.0-beta.1`den beri ~480 commit değişti; RC etiketi için
`v0.9.0-beta.2` önerilir. Karar ve etiket oluşturma kullanıcıya aittir.
