# Rapor501 — Ayarlı ses stüdyosu ve bütünlüklü konuşma blokları

2026-10-21. Dal `codex/broad-bugs499`.
Başlangıç HEAD: `bd10e8f3a4436fe071cf81470db8754724da3fa5`.
Bitiş ürün commit: `5815cf91f53d306eeca06f488c74303436d803bf`.
Başlangıçta önceki yerel referans/stüdyo işi ve 499/500 belgeleri çalışma ağacındaydı;
kullanıcının kendi dosyaları değiştirilmeden bu devam işine dahil edildi.

## Doğrulanan durum

- Önceki stüdyo tek sütunlu, az seçenekliydi; Hi-Fi zorunluydu ve dökümsüz
  klonlama/motor/son işlem/önizleme/parça boyutu seçimi yoktu.
- Model kelime kelime üretmiyor. Eski okuyucudaki kelime vurgusu, ses üretimi
  sonrası kelime hizalama/oynatım özelliğidir. Bu ayrım arayüzde açıklandı.
- Dublajın eski cümle gruplama kuralı tamamlanmış cümle sonrası sonraki satır
  24 karakterden uzunsa grubu bitiriyor; 250 karakter sınırı da bağlamı kısaltıyordu.
  Bu her zaman bug değildir, senkrona yönelik eski tasarımdır. Yeni seçenek
  akıcılık için daha uzun bağlam sunar; gerçek ses kalitesinde artış ölçülmüş sayılmaz.

## Yapılanlar

### Masaüstü

Repo içindeki `text_studio_window.py` iki sütunlu koyu grafit/amber düzendir.
Solda kayıtlı sesler ve yerel WAV, döküm, otomatik/Hi-Fi/basit klonlama, hızlı
nano-vLLM veya uyumlu PyTorch, adım/CFG/temperature/paralellik/durak/parça boyutu/seed;
son işlemde ses dengeleme, geçiş yumuşatma, isteğe bağlı hizalama ve kısa örnek.
Dar/yüksek DPI ekranda sol ayarlar kaydırılabilir. Sağda geniş metin, TXT açma,
çıktı adı, temizleme onayı, karakter sayacı ve günlük; altta üret/durdur/dinle/klasör
ve ilerleme. Ctrl+Enter üretir. Düğmeler iş sırasında kilitlenir.

Metin planı v2 ve 600 karakter varsayılan; 300/900/1200 seçilebilir. Tam cümleler
yakın bağlamda üretilir, uzun tek cümle/metin motorun güvenli sınırında bölünebilir.
Görsel satır kayması ses üretim sınırı değildir. Durak alanı saniye değil mevcut
okuyucunun çarpanıdır; eski stüdyo değerinden yeni sürüme geçişte 1 olarak düzeltilir.
Hizalama varsayılan kapalıdır; istenirse açılır, bu üretim parçalama seçeneği değildir.

Komut oluşturucu dökümsüz clone/auto ve dökümlü Hi-Fi'yi ayırır. PyTorch'a
nano'ya özgü temperature/batch argümanları gönderilmez. Sayısal ayarlar doğrulanır.
Örnek çıktı adına `-ornek` eklenir. Girdi/ayar/iş günlükleri ve benzersiz WAV,
önceki Sesler düzeninde korunur. Motor ağırlıkları, eski dış arayüz, okuyucular,
kişisel referans dosyaları değiştirilmedi; yeni bağımlılık indirilmedi.

### Browser ve oynatıcı

**Konuşma gruplama** üç seçenek sunar:

- Akıcı konuşma blokları (yeni varsayılan): 550 karakter/24 saniye kaynak penceresi,
  en fazla 600 ms ara; kısa tamamlanmış cümleler bağlamla birlikte okunabilir.
- Cümle grupları: önceki 250 karakter/12 saniyelik davranış.
- Her altyazı satırı ayrı: bağımsız satır davranışı.

Görünen konuşmacı değişimi, önceki diyalog işaretli satır, çakışma ve uzun
boşluklar akıcı modda grupları ayırır. Kaynak cue kimlikleri ve seçili zaman aralığı
korunur. Plan CLI ve gerçek üretim aynı mod/boyut/süre ile çalışır. Farklı gruplama
planına ait düzenleme reddedilir. Kullanıcı düzenlemeleri varken mod değiştirmede
sıfırlama onayı gerekir. Video yavaşlatma haritası ve mevcut ses kalite hattı korunur.
Bu blok senkronudur; birleştirilen her kelimenin eski cue saniyesine birebir
oturması garantisi yoktur. Uzun gruplar bazı sahnelerde daha fazla video yavaşlatabilir.

## Kanıt

- `backend/test_text_studio.py`: gerçek argv, dökümsüz klonlama, Hi-Fi dökümü,
  PyTorch/nano argüman ayrımı, parça sınırı, örnek, son işlem ve bozuk değer reddi geçti.
- `backend/test_dub_flowing_groups.py`: kısa tamamlanmış üç cümle 3 eski gruptan
  1 akıcı gruba iner; metin/kimlikler eksiksiz. Konuşmacı/boşluk/boyut/süre
  sınırları ve 2–6 saniye aralığında özgün cue kimlikleri geçti (3 test).
- `backend/test_text_studio_layout.py`: gerçek Tk pencere oluşturma; 20'den fazla
  kontrol, 500 px üzeri metin alanı, 300 px üzeri metin yüksekliği, sayaç ve üretim
  kilidi geçti. İlk testte yalnız update_idletasks kullanımı widget ölçülerini
  1 px verdi; gerçek update olayıyla ölçüldü, eşikler gevşetilmedi.
- `tests/dub-service.test.js`: plan/üretim gruplama, 550/24 parametreleri ve
  stüdyo yol/config/motor aktarımı geçti. `dub-generator-ui` akıcı mod isteğini doğrular.
- voice-reference, voice-reference-ui, dub-workspace, dub-workspace-ui,
  ui-locale, ui-locale-dedupe, preload-sandbox, preload-usage-ratchet,
  report498-regressions ve report499-regressions geçti.
- Değişen JS `node --check`; Python `py_compile`; `git diff --check` geçti.

## Gerçek Windows/görsel sınırı

İzole yollarla yeni gerçek Tk penceresi açıldı; kişisel profil ve GPU üretimi
kullanılmadı. computer-use becerisiyle pencere bulundu. İlk ekran yakalama
`FrameArrived timed out`, yeniden seçip bir kez denenen yakalama `window capture
timed out` döndürdü. Görsel inceleme veya screenshot başarısı iddia edilmez.
Yalnız bu testlere ait `tmp/studio-preview` süreçleri kapatıldı. Gerçek widget
oluşturma/ölçü testi başarılıdır; bu renk/kontrast veya tüm DPI görsel onayı değildir.

Gerçek GPU/model/Whisper/TTS ses üretimi, dinleyerek A/B kalite ölçümü, canlı
YouTube/DRM, start.bat/install.bat tam akışı ve Ubuntu test edilmedi. Tam npm test
tekrarlanmadı. CI etkin kalır, sonucu beklenmez. Ana master checkout'u
güncellenmedi; bağımsız stüdyo çalışma kopyasındaki ses-studyosu.bat ile açılabilir.
