# Rapor458 — Shadow medya keşfi ve Python test envanteri

2026-10-18. Eski Rapor451'in açık kalan iki iddiası mevcut kodda yeniden
incelendi; rapordaki diğer iddialar bu tur yeniden doğrulanmış sayılmaz.

## 1. Gözlemci sınırından sonraki shadow kökte yeni medya kaçırılıyor

**Doğrulandı, düzeltildi.** `src/browser-media-controller.js` 128 gözlemciden
sonra yeni köke gözlemci bağlamıyor. Başlangıç taraması mevcut videoyu bulsa
da gözlemlenmeyen köke daha sonra eklenen video `select()` tarafından
bulunamıyordu. Deterministik VM regresyonu eski kodda `null` döndürdü.

Sınır aşıldığında controller medya seçimi sırasında en fazla saniyede bir
keşif taraması yapıyor. Tarama öncesinde ayrılan kökler bırakılıyor; boşalan
gözlemci kapasitesi bekleyen köklere ayrılıyor. Tüm kökler gözlemlenebilir
olunca ek tarama duruyor. Sürekli yeni timer veya sınırsız gözlemci eklenmedi.

Regresyon: document dahil 128 slot dolu, son açık shadow kök gözlemlenmiyor;
bu köke video eklenince sonraki uygun seçim videoyu buluyor. Aynı zaman
anındaki 100 seçim yeniden taramıyor. Bir host ayrılınca bekleyen kök
gözlemleniyor ve toplam sınır korunuyor.

Sınır: ek keşif yalnız medya seçimi çağrıldığında çalışır; en sık bir saniye
aralıklıdır. Mevcut açık shadow DOM ve derinlik sınırları korunur; kapalı
shadow DOM veya bütün siteler için keşif garantisi verilmez.

## 2. Dört Python regresyon dosyası ana test komutuna dahil değil

**Doğrulandı, düzeltildi.** `tests/run-all.js` yalnız `backend/test_*.py`
dosyalarını çalıştırıyordu. `tests/` altındaki dublaj zamanlaması, plan,
background cache ve browser alignment regresyonları sessizce dışarıda kalıyordu.

Ortak `findPythonTestFiles()` iki klasördeki gerçek `test_*.py` dosyalarını
sıralı keşfediyor. Ana runner bu listeyi çalıştırıyor. VM runner testi iki
klasörün çağrılmasını ve Python hatasının toplam çıkış koduna yansımasını
doğruluyor. SoundFile 0.14.0 CI bağımlılık listesine eklendi; mevcut Windows
backend test venv'ine aynı sürüm kuruldu. Üretim/GPU kurulum akışı değişmedi.

## Doğrulama

- Yedi Node test dosyası geçti: report458-regressions (3 yeni test),
  browser-media-controller, browser-media-selection, browser-media,
  python-runtime, coverage-map, ci-determinism-ratchet.
- Dört Python dosyası / 30 test geçti: test_dub_timing (12),
  test_dub_plan_regressions (5), test_background_cache_regressions (10),
  test_browser_align_validation444 (3).
- Electron trusted bridge smoke geçti; gerçek Electron medya/shadow/iframe
  yaşam döngüsü fixture'ları dahil.
- Değişen JS dosyaları ve main/preload/renderer syntax kontrolleri,
  backend/transcribe.py py_compile ve git diff --check geçti.

Tam `npm test`, gerçek YouTube, GPU, kullanıcı hesabı ve normal `start.bat`
açılışı çalıştırılmadı. CI incelemesini bırakma talimatı korundu; uzaktaki
Windows CI sonucu beklenmedi ve başarılı olduğu iddia edilmiyor. Görsel
düzen veya kullanıcı profili değişmedi.
