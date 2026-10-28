# Rapor 727 — Kitap inceleme sahipliği ve okunur grup kartları

## Doğrulanan hata

Grup onayı öncesinde kitap/bölüm denetleniyordu; `book-approve` yanıtından sonra denetlenmeden paylaşılan `project` değiştiriliyordu. Onay beklerken başka kitaba geçildiğinde eski kitap yeniden açıldı. Üretim renderer'ını JSDOM'da çalıştıran regresyon önce `one !== two` hatası verdi. Düzeltme onay diyaloğu ve servis yanıtının iki yanında aynı pencere, bağlı satır, proje nesnesi, bölüm ve ses çıktısı sahipliğini denetler. Serviste yapılan geçerli onay geri alınmaz; eski UI yanıtı yeni bağlamı ele geçiremez.

## Tasarım ve kullanım

İnceleme alanında her grubun sıra numarası, dinlenebilir zaman aralığı ve durumu ayrı başlıkta; pasaj ve dört eylem ayrı bölümdedir. Ortak grafit/amber ve açık tema token'ları korunur. Dar genişlikte eylemler iki sütuna yerleşir; kısa ses aralıkları aynı saniyeye yuvarlanıp belirsizleşmez, milisaniyeyle gösterilir. Ekran okuyucu için adlandırılmış grup ve ses kontrolü vardır. Başarılı onaydan sonra odak sonraki inceleme grubuna, liste biterse bölüm metnine döner. Liste 25 grup/sayfa sınırını korur; bu tasarım bütün uygulamanın tamamlandığı anlamına gelmez.

## Değişen dosyalar

- `src/renderer/media-workflows-ui.js`: gecikmiş onay sahipliği, odak dönüşü, kart başlıkları/zaman/adlandırma ve eylem grubu.
- `src/renderer/media-workflows.css`: ortak token'larla kartlar, durum rozeti, dar eylem düzeni ve inceleme alanı yüksekliği.
- `tests/book-review-owner727.test.js`: gerçek renderer'da bekleyen onaydan sonra kitap değiştirme ve pencere kapatma.
- `tests/electron-book-quality636.smoke.js`: mevcut Windows kabulüne kısa aralık doğruluğu, gerçek fareyle onay, diskte manualApproval ve sonraki gruba odak kontrolü eklendi. Önceki dışa aktarma korumaları ve sayfalama korunur.

## Kanıt

12 hedefli Node testi geçti: sahiplik, önceki render yarışları, tekrarlanan pasaj seçimi ve grup/bölüm üretim isteği. Syntax ve diff kontrolü geçti. Windows Electron ayrı test profilinde sentetik PDF/WAV ile çalıştı: eksik doğrulamada M4B hâlâ engelli; 101 gruptan 25'i bağlı, son grup erişilebilir; gerçek fare onayı diske yazılır; odak sonraki gruptadır. Görüntüler geniş EN koyu ve 800px TR açık temada incelendi. Son koşum exit 0. Mevcut 11 before-quit listener uyarısı devam eder; eşik değiştirilmedi.

- [Geniş koyu tema](evidence727/review-en-dark.png)
- [Dar açık tema](evidence727/review-tr-light.png)

```powershell
node --test --test-isolation=none tests/book-review-owner727.test.js tests/book-render-owner644.test.js tests/book-review-selection690.test.js tests/book-regenerate-request.test.js
node --check src/renderer/media-workflows-ui.js
# Kendi sentetik profilini oluşturur; kişisel uygulamayı kullanmaz.
& 'D:\Whisper Local\node_modules\electron\dist\electron.exe' tests/electron-book-quality636.smoke.js
```

## Araştırma ve sınırlar

Mevcut kitap inceleme/sahiplik modülleri esas alındı. [Radix Dialog kaynak kodundaki](https://github.com/radix-ui/primitives/blob/main/packages/react/dialog/src/dialog.tsx) bağlı açıcıya odak dönüşü yaklaşımı ve [W3C modal diyalog örüntüsünün](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) açıcı kaldırıldığında mantıklı sonraki eyleme odak kuralı incelendi. Kod kopyalanmadı; React/Radix veya başka bağımlılık eklenmedi. frontend-design ve make-interfaces-feel-better rehberleri uygulandı.

Gerçek TTS yeniden üretim/insan dinlemesi, GPU, canlı sağlayıcı, tüm font/DPI/ekran okuyucu kombinasyonları, start.bat başlangıcı, tam paket ve CI sonucu bu turda doğrulanmadı. Kurulum, şema ve API değişmedi. P069/P092/P093/P098 yalnız bu inceleme alanında ilerledi; genel 90 hedef aktif. Müzik analizi kapsam dışı.
