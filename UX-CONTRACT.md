# Whisper Local UX Sözleşmesi

Sürüm: 1.0
Görsel sözleşme: `UI-DESIGN-SYSTEM.md`
Çalışan yüzey: `src/renderer/index.html`, `src/renderer/renderer.js`, `src/renderer/styles.css`

Bu dosya Whisper Local'in ekranlar arası davranışını korur. İş kuralları ve IPC
protokolü için `AGENTS.md` ile backend/main sözleşmesi kanoniktir; burada yalnız
kullanıcının gözlemlediği sonuçlar tanımlanır.

## 1. İş akışı

| İşlem | Tetikleyici | Bekleyen durum | Başarı | Hata | Odak sonucu |
|---|---|---|---|---|---|
| Tek iş başlat | `Altyazıyı Çıkar` | Ana eylem gizlenir, İptal ve aşamalar görünür | Sonuç masası açılır | İş özetinde kalıcı düzeltme mesajı + günlük | İlk hatalı alan veya sonuç eylemi |
| Kuyruğa ekle | `Kuyruğa` | Ayarlar ekleme anında dondurulur | Kuyruk sekmesinde yeni satır | İş özetinde düzeltme mesajı | Kuyruk sekmesi |
| Kuyruğu çalıştır | `Kuyruğu başlat` | Bir iş `İşleniyor`, diğerleri `Bekliyor` | İş bazında sonuç, toplu bitiş özeti | Hatalı iş `Kontrol` sekmesinde kalır | Mevcut İşler bağlamı |
| Geçmişten aç | `İzle` / `Klasör` | Kısa yerel yükleme | Oynatıcı veya klasör | Günlükte açıklama | Açılan bağlam |
| Kalıcı kayıt kaldır | Açık nesne fiili | Uygulama dialogu | Liste ve sayaç güncellenir | Dialog/bağlam korunur | Tetikleyici veya yaşayan komşu |

Tek iş ve kuyruk aynı `optsProblemInfo` doğrulama sahibini kullanır. Bir ayarın
geçersizliği yalnız kırmızı sınır veya günlük satırıyla anlatılmaz.

## 2. Durum modeli

- İş: `bekliyor`, `işleniyor`, `tamamlandı`, `hata`; uyarılar ayrıca elle
  kontrol durumudur.
- Uzun çalışma: yüzde anlamlıysa determinate progress, ayrıca adlandırılmış
  aşama ve süre gösterilir. Sahte yüzde üretilmez.
- Kuyrukta `done/error` backend `done` olayıyla kaydedilir; sıradaki süreç yalnız
  işletim sistemi `exit` olayından sonra başlar. Bu yarış sözleşmesi korunur.
- Boş kuyruk, boş geçmiş, arama sonucu yok ve kontrol gerektirmeyen durumlar
  birbirinden farklı metin taşır; panel geometrisi kaybolmaz.
- Arka plan işi tamamlandığında odak çalınmaz. Tek iş sonucu kullanıcıya ait
  modal karar yüzeyi olarak açılabilir.

## 3. İşler merkezi

`Kuyruk`, `Geçmiş` ve `Kontrol`, aynı iş bağlamının eş sekmeleridir. Sol/sağ ok
sekmeler arasında döner; Home/End sınırlara gider. Her sekme kendi araç çubuğunu,
boş durumunu ve kaydırma sahibini taşır.

- Kuyruk satırı oluşturulurken ayarlar dondurulur.
- Geçmiş araması yereldir; doluyken görünür temizleme düğmesi vardır.
- `Kontrol`, başarısız işleri, backend uyarılarını ve son kalite raporundaki
  hızlı okuma/çakışma/uzun blok sorunlarını toplar.
- Geçmiş kaydı silme dosyaları silmez. Tüm geçmişi temizleme geri alınamaz ve
  nesne/sayı/sonuç belirten uygulama dialogu ister.

## 4. Dialog ve yıkıcı eylem

Ürün akışında `alert`, `confirm` veya `prompt` kullanılmaz. Ortak uygulama
dialogu:

- erişilebilir başlık ve açıklama sağlar;
- arka planı `inert` yapar, odağı içinde tutar ve Escape'i Vazgeç sayar;
- kapanınca odağı tetikleyiciye döndürür;
- ciddi sonuçta ilk odağı güvenli eyleme verir;
- `Onayla` yerine `Geçmişi temizle`, `Çerezleri sil` gibi gerçek fiil kullanır.

Çerez/oturum temizliği site girişini düşürebilir ve tehlike niyeti taşır.
Koleksiyon adı düzenleme yıkıcı değildir; aynı dialogun metin girişi varyantını
kullanır.

## 5. Form, arama ve seçim

- Native `<select>` popup'ı Windows/Chromium'a aittir; tetikleyici görünümü,
  etiket, odak ve kapalı durum uygulamaya aittir. Bu bilinçli `native` sahipliktir.
- Arama doluyken yerelleştirilmiş, klavyeyle erişilebilir temizleme düğmesi
  görünür; temizleme anlıktır, bekleyen aramayı geçersiz kılar ve odağı input'a
  döndürür.
- Uzak/IPC araması debounce edilir, IME composition sırasında çalışmaz ve eski
  sonuç yeni sorguyu ezemez.
- Secret alanlar maskeli kalır ve değerler log, URL, toast veya dialog metnine
  yazılmaz.
- Textarea kullanıcı tarafından yeniden boyutlandırılmaz; uzun girişler mevcut
  auto-grow veya iç kaydırma davranışını kullanır.

## 6. Erişilebilirlik ve hareket

- Hedef WCAG 2.2 AA'dır; normal küçük metin en az 4.5:1 kontrast hedefler.
- Sekmeler `tablist/tab/tabpanel`, seçili durum, roving tabindex ve ok/Home/End
  davranışını birlikte uygular.
- Yalnız ikonlu düğmeler Türkçe erişilebilir ada sahiptir; ikon dekoratif SVG'dir.
- Global scrollbar teması standart özellikleri ve WebKit fallback'ini birlikte
  kullanır; forced-colors modunda sistem kontrastı korunur.
- Hareket işlevseldir. `prefers-reduced-motion` altında döngüler ve anlam taşımayan
  transform geçişleri kapanır; bilgi kaybolmaz.

## 7. Kaynak izlenebilirliği

| Konu | Kanonik kaynak | UI sonucu |
|---|---|---|
| Kuyruk ayarlarının dondurulması | `AGENTS.md` Kuyruk | İş özeti + kuyruk satırı ekleme anındaki ayarı temsil eder |
| Backend aşamaları | `AGENTS.md` NDJSON protokolü | Sinyal zinciri backend stage değerlerini yeniden adlandırmadan görselleştirir |
| Gizli anahtarlar | `AGENTS.md` Gizli anahtarlar | Anahtar değerleri özet, log ve dialogda gösterilmez |
| Görsel tokenlar | `UI-DESIGN-SYSTEM.md` | Grafit/amber/camgöbeği, tek primary eylem ve Signal Desk |
| Oynatıcı düzenleri | `UI-DESIGN-SYSTEM.md` + mevcut renderer | Sinema / Okuma / Çalışma adları ve aynı davranış |
