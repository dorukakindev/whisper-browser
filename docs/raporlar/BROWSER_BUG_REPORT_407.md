# Rapor 407 — Browser Whisper + çeviri ilerlemesi ve süre tanısı

Tarih: 2026-10-14. Başlangıç: master `5386420ed80464c46719d4fd3df56013e1e2e958`.

## Doğrulanan kusurlar

1. R406 `llm_progress` olaylarını progressive işte işliyordu, ancak `playerJobBar`
   hâlâ `sentenceTools` içindeydi. Browser görünümü/kapalı altyazı yan paneli bu
   alanı gizleyebiliyor; doğru yüzde kullanıcıya ulaşmıyordu. Tek bar `playerLayer`
   altında, browser gövdesinden önce gösteriliyor; mevcut iptal kontrolü korunuyor.
2. Transkripsiyon %100 olduktan sonra yeni aşama ilerlemeyi sıfırlamıyordu.
   Çeviri başlangıcında aşama değişimi eski yüzdeyi temizliyor; backend ilk
   sağlayıcı isteğinden önce gerçek tamamlanan/toplam sayısıyla olay yayınlıyor.
3. İlk sağlayıcı kontrolü senkrondu; sonraki havuz da bir paket bitene kadar
   bekliyordu. Uzun HTTP/kurtarma bekleyişinde hiçbir ilerleme olayı gelmeyebiliyordu.
   İlk kontrol ve paralel havuz bekleyişinde 5 saniyelik durum olayları eklendi.
   Yüzde yapay artırılmıyor; blok sayısı, yanıt bekleme durumu ve çeviri aşamasının
   geçen süresi gösteriliyor. Ek API isteği açılmıyor.
4. `.progress-track` yüksekliği tanımlı değildi; görsel kontrolde yüzde metni
   görünürken çubuğun yüksekliği sıfırdı. Üst durum alanına 6px yükseklik ve mevcut
   amber token'ını kullanan dolgu sağlandı. Yeni dinamik metinler EN/TR destekli.

## Uzun süre: kanıt ve sınır

Son yerel işin yalnız zamanlama/ayar tanıları incelendi; ham günlük, video adı,
URL, profil veya altyazı metni rapora alınmadı. Yaklaşık 958 saniyelik videoda:

- İndirme başlangıcı 23:36:14, model hazır 23:36:23, çeviri başlangıcı 23:36:43.
  İndirme/ses çıkarma/model/Whisper yolu yaklaşık 29 saniye.
- 252 blok, 8 işçi üst sınırı, çeviri refine kapalı, gevşek kabul açık.
- 23:39:49'da 20–39 paketinin 18/20 blok kabulü ve eksik iki blok için bir
  cümle grubunu kurtarma kaydı var. Çeviri aşaması en az 186 saniye sürmüş.
- Günlük `llm_progress`/`translation_chunk` olaylarını saklamıyor (`LOG_SKIP`).
  Dolayısıyla ilk API yanıtının süresi, bitiş zamanı ve tek tek istek süreleri
  bu kayıttan çıkarılamaz. Kayıt işin tamamlandığını göstermiyor.

Kodda önce tek paketle kimlik/kota/ağ kontrolü yapılır; başarıdan sonra kalan
paketler paralellenir. Her HTTP isteğinin timeout'u 180 saniye; geçici hatalarda
ana paket en çok üç deneme, kurtarma en çok iki deneme kullanır; yedek rotalar da
süreyi uzatabilir. Yapısal olarak eksik yanıtlar gevşek modda da yeniden denenir.
Bu mekanizmalar gecikmenin olası katkılarıdır; bu işte timeout/rota tekrarının
gerçekleştiği kanıtlanmadı. GPU yalnız Whisper yolunu hızlandırır, uzaktaki
çeviri sağlayıcısının yanıt süresini belirlemez. Sağlayıcı performansı veya model
kalitesi için canlı ölçüm yapılmadı; bu düzeltme hız artışı iddiası taşımaz.

## Doğrulama

- Browser YouTube Whisper regresyonu: bar tek ve yan panel dışında; aşama reset,
  blok sayıları, bekleme metni ve başka sekmenin olay yalıtımı geçti.
- `player-ui`: 153/153. `ui-locale` ve innerHTML ratchet geçti; ratchet'in yalnız
  taşınan satır numaraları güncellendi, güvenlik izinleri genişletilmedi.
- Python döngü kesicileri: 4/4; yavaş kontrollü sağlayıcıda ilk ve paralel
  bekleme olayları, doğru sayaçlar ve 60 blok için hâlâ yalnız 3 istek doğrulandı.
- Kurtarma bütçesi: 4/4; çeviri audit regresyonları: 17/17.
- Main/preload/renderer sözdizimi ve Python derleme kontrolü geçti.
- Windows Electron trusted bridge geçti. İlk sandbox koşusu erişim engeline
  takıldı; izinli tekrar başarılı oldu.
- Windows Chrome üzerinde gerçek renderer/CSS + kontrollü API ile boş/yüklü
  sekmede 1400 ve 720px görsel kontrol geçti. Dolgu yüksekliği 6px, durum barı
  native browser slotunun üstünde, renderer hata listesi boş. Ekran görüntüleri
  `tmp/progress-visual/` altında, Git dışında; fixture gerçek YouTube değildir.

Tam `npm test`, canlı ücretli sağlayıcı, gerçek YouTube + CUDA + `start.bat`
uçtan uca işi ve native video/DPI/DRM doğrulanmadı. `start.bat`, `install.bat`,
Windows dosya seçici/yol ve GPU bağımlılıkları değişmedi; yeni bağımlılık yok.
