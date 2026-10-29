# Rapor739 — Ses stüdyosunda okunabilir hata ayrıntıları ve tema geçişi

## İyileştirme ve gerçek tasarım bulgusu
Üretim hatasının ham teknik metni alt çubuktaki 72px kaydırmalı durum alanına ekleniyordu. Metin gizlice kaybolmuyordu, ancak kısa kullanıcı durumu ile uzun motor kanıtı aynı yerdeydi ve ayrı ayrıntı/kopyalama akışı yoktu. Bu durum, düğmeler tamamen kayboluyor şeklinde abartılmadı. Yeni hata deneyimi bu kullanım eksikliğini giderir.

Görsel incelemede açık temaya geçerken TXT aç ve ayrıntı kopyala düğmelerinde koyu zeminde koyu yazı görüldü. İlk anda kalıcı kontrast sorunu sanıldı; 500ms sonrası ölçüm bunun geçiş sorunu olduğunu gösterdi. [Önceki geçiş görüntüsü](evidence739/theme-transition-before.png). Tema rengi değişirken eski düğme zemini ile yeni yazı kısa süre birlikte kalıyordu.

## Kod ve kullanım
- `src/renderer/text-voice-studio.js`: alt çubuk kısa yerelleştirilmiş durumu gösterir. Ayrıntı varsa Ayrıntıları göster düğmesi, gövdedeki ortak temalı disclosure'ı açıp başlığına odak verir. Hatanın gelişi odağı otomatik değiştirmez. Teknik içerik textContent olarak aynen kalır; HTML çalışmaz. Açık ayrıntı ve içerik dil değişiminde korunur. Yeni deneme eski ayrıntıyı temizler; metin/ref/döküm/ayarları değiştirmez. Kopyalama mevcut API ile, açık tıklamada yapılır; başarısız kopya üretim durumunu ezmeden açıklanır. Geç kopyalama yanıtı yeni bildirime taşınmaz.
- Aynı dosyada yalnız açık stüdyo için ui-theme-change dinleyicisi: bir render adımında foreground/background çözülürken hover renk geçişleri kaldırılır, ardından tekrar açılır. Ekran/pencere/oynatıcı yeniden kurulmaz. Global tema veya kullanıcının ayarları değiştirilmez.
- `src/renderer/text-voice-studio.css`: grafit/amber ve açık tema tokenları, sınırlı yükseklikte kaydırılabilir kanıt, okunur satır sarma, kompakt kopya eylemi, görünür odak. Ana düğmeler korunur. `!important`, yeni font/CDN veya süslü bekleme animasyonu yok.
- `tests/electron-text-voice.smoke.js`: uzun çok satırlı/boşluksuz motor ayrıntısı, HTML metni, doğru kısa footer, klavye odağı, tam içerik kopyası, kopyalama hatası ve yeniden deneme, aynı metin/ref/döküm/ayarlarla tekrar, eski hata temizliği, EN/TR ve açık/dar görünüm. Clipboard IPC'si kontrollü bellek hedefine gider; kişisel Windows panosu değiştirilmez.

## Kanıt
- Parent sözleşme kontrolü exit1: uzun teknik metin footer durumuna ekleniyordu. Yeni ayrıntı deneyimiyle native exit0. [Önce özeti](evidence739/before.txt).
- Final gerçek Windows Electron arayüz/köprü, ayrı profil ve kontrollü3başlangıç/1iptal; gerçek TTS/GPU yok. [Ölçüm](evidence739/acceptance.json).
- [EN koyu](evidence739/studio-owned-error-en.png), [EN açık %125](evidence739/studio-en-light-125.png), [TR480CSSpx %125](evidence739/studio-tr-narrow-125.png) görüntüleri gerçekten açılarak incelendi. Dar ekran taşması yok; ayrıntı kendi içinde kayar; ana eylemler44px ve footer görünür. Final EN açık görüntüsü iki renk eşzamanlaması düzeltmesinden sonra tekrar incelendi.
- İki ikincil düğmede tema değişiminin hemen ardından zemin hedef bg3 ile eşit, kontrast12.18457:1. Önceki anlık ölçüm eski renkleri13.78:1 gösteriyordu; tek bir doğru kontrast anı geçişteki kusuru dışlamadığı için renk-token eşitliği de kontrol edildi. 500ms beklemek ürün düzeltmesi yerine geçirilmedi.
- `node --test --test-isolation=none tests/text-voice-studio.test.js tests/preload-sandbox.test.js`:3PASS/0skip. Değişen JS syntax ve git diff kontrolleri geçti. Tüm npm/CI beklenmedi; CI kapatılmadı.

## Kaynak ve sınırlar
frontend-design ve make-interfaces-feel-better becerileri uygulandı. [W3C APG uyarı ilkeleri](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) önemli mesajın kullanıcı odağını kesmemesi yönünden incelendi; mevcut role=status korundu, otomatik odak taşınmadı. Mevcut native details ve copyText köprüsü kullanıldı; üçüncü taraf kod/yeni bağımlılık/yeni IPC/şema/motor değişikliği yok.

İnsan ekran okuyucu, bütün OS reduced-motion kombinasyonları, yeni gerçek GPU/TTS/API, fiziksel dosya seçici ve start.bat etkileşimli kabulü bu turda yapılmadı. Mevcut11before-quit listener uyarısı sürer. Testte dış ağ bilerek kapalıdır. R738 iş sahipliği tekrar yeni bug sayılmadı. P092/P093/P094/P097/P098 kısmi ilerleme; tüm90hedef bitmedi, müzik kapsam dışı.
