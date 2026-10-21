# Rapor502 — Varsayılanları güçlü, daha kullanışlı iki ses çalışma alanı

2026-10-21; `codex/broad-bugs499`.
Başlangıç: `c309463d1210b1065da2594f19215208d1cae6f9`.
Ürün arayüz commit'i: `46807f38e3ce79c3d6e819c868751b63a11424bb`.
Bitiş kod/test commit'i: `acfbbb3dd16b1c94b7933f28cef784e0cc1eb895`.
Bu bir tasarım/iş akışı geliştirmesidir; yeni bug sayısını artırma çalışması değildir.

## Browser/oynatıcı

- Uzun tek sütunlu modal, iki sütunlu ve yüksekliği sınırlı bir stüdyoya çevrildi.
  Başlık/kapatma, etkin altyazı/ses/aralık özeti ve üretim eylemleri görünür kalır;
  içerik kendi içinde kayar. Dar ekranda tek sütuna döner. Ana üretim kontrolleri
  ve çıktı sonrası Sesi kullan düğmesi alt çubuktadır.
- Altyazı/kapsam, üretim tercihi ve referans kartları; gelişmiş kalite/AI, metin
  editörü, proje/mikser ve müzik ayrı açılır bölümlerde. Var olan bütün id'ler
  korunur; alanlar başka üretim hattına taşınmadı.
- Dengeli: 15 adım/4 paralel/akıcı blok/dengeli doğrulama/video yavaşlatma;
  önceki doğal konuşma ve süre düzenleme seçenekleri açık. Hızlı deneme: 10
  adım, ses doğrulaması, AI düzenlemeleri kapalı. Ayrıntılı: 15 adım ve bütün
  parçalarda metin doğrulaması. CPU/AI maliyet açıklamaları korunur.
- Hazır profil ses dosyasını, altyazıyı, seçili aralığı, klonlama kaynağını veya
  müzik ayırma seçimini değiştirmez. Aktif işte kilitlenir. Gruplama değişecekse
  mevcut uygulanmış metin düzenlemelerini sıfırlamak için kullanıcı onayı gerekir.
- Eşleşen profil aria-pressed ile gösterilir; manuel ayar özel profil olarak
  açıklanır. Eski kaydedilmiş tercihler açılışta korunur, önerilen profil düğmeyle
  geri yüklenebilir. Sıfırdan backend varsayılanları değişmedi.
- EN/TR karşılıkları, klavye odak çizgisi, tema token'ları, taşmayan dosya adları.
  Dar ekranda başlangıç/bitiş etiket ve girdileri iki sütunda eşleştirildi.

## Bağımsız stüdyo

- Üstte Dengeli/Kitap anlatımı/Hızlı deneme profilleri. Varsayılan 15 adım, 4
  paralel ve 600 karakter; anlatım 900 karakter ve 1.5 durak çarpanı. Profiller
  mevcut motor, ses, döküm, klonlama modu ve metni korur; yalnız okuma ayarlarını değiştirir.
- Temel kalite/paralellik/blok uzunluğu görünür; CFG/temperature/durak/seed/motor
  klasörü gelişmiş bölümdedir. Uyumlu PyTorch seçilince uygulanmayan temperature
  ve paralellik alanları devre dışı bırakılır; CLI bunları zaten göndermiyordu.
- Referans sesi dinleme ve tek tık kısa örnek. Kısa örnek eylemi kalıcı preview
  tercihini değiştirmez; işin kendi settings.json kaydında örnek olduğu korunur.
- Alt durum alanı gerçek genişliğine göre sarılır, var olan ilerleme/günlük,
  durdurma/dinleme ve kayıtlı referanslar korunur. Dış VoxCPM2 arayüzüne dokunulmadı.

## Doğrulama ve görsel kanıt

`node tools/audit-ui.mjs --strict --surface voice-studio --widths 1200,420 --out tmp/report502/visual`
kontrollü Chromium fixture'ında EN/TR, açık/koyu ve iki genişlikte 8 görünüm üretti:
**0 kontrast ihlali, 0 script hatası**. İlk görüntü incelemesinde alt bar gereğinden
yüksekti ve mobil zaman etiketleri girdilerinden ayrılıyordu; bar sıkıştırılıp
etiketler eşleştirildi. Son dar ekran `--widths 420 --out tmp/report502/mobile-final`
ile 4 durumda tekrar geçti. Son geniş ekran `--widths 1200 --out tmp/report502/wide-final`
ile 4 görünümde 0 kontrast/0 script hatasıyla ayrıca kaydedildi. Özel test profili
ve sahte altyazı/ses adları kullanıldı; kişisel oturum, localhost cloud önizlemesi
ve gerçek sağlayıcı/GPU kullanılmadı.

Kontroller: dub-generator-ui (profil/özellik aktarımı, aralık/ses ayırma seçimi
koruma, aktif iş kilidi), dub-workspace-ui, voice-reference-ui, ui-locale,
ui-locale-dedupe, preload-sandbox, preload-usage-ratchet geçti.
Python text_studio argv ve gerçek Tk layout kontrolü geçti; yeni testler profilin
ses/metin/modu korumasını, gelişmiş bölümün kapalı başlangıcını, PyTorch'ta
uygulanmayan alanların kilidini ve önerilen değerlere dönüşü doğrular.
node --check, py_compile ve git diff --check geçti.

İlk yeni UI testindeki dosya adı varsayımı fixture.srt iken gerçek fixture
test.srt idi; doğru fixture'a göre düzeltildi. Statik yerelleştirme testinde
dekoratif 1/3 sayıları yeni çevrilmeyen metin sayıldı; metin yerine aria-hidden
CSS data-step işareti kullanıldı. Test beklentileri/eşikleri gevşetilmedi.
Tk bulunmayan ortamda yalnız isteğe bağlı desktop layout testi açık nedenle skip
eder; Windows'ta gerçek Tk8.6 ile çalışıp geçti, skip başarı diye sunulmaz.

## Sınırlar

Browser görselleri gerçek Chromium renderer çıktısıdır, Electron native video/
YouTube/DRM/GPU doğrulaması değildir. Masaüstü Tk widget oluşturma/ölçü ve davranış
kontrolü yapıldı; native screenshot önceki turda başarısız olduğundan bu turda
Tk görünümü görsel onaylandı denmez. Gerçek TTS/dinleme A-B yapılmadı; tasarım
tek başına ses kalitesinde ölçülmüş iyileşme değildir. Model, bağımlılık ve üretim
kalite algoritması değişmedi. Tam npm test tekrarlanmadı; CI etkin, sonucu beklenmez.
Ana master checkout'u güncellenmedi; PR471 aynı teslim dalından güncellenir.
