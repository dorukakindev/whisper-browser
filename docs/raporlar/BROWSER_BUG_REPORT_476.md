# BROWSER_BUG_REPORT_476 — Kurtarma ve süreç yaşamında 10 düzeltme

Başlangıç: `ceab80e04c1bff2f61b71bc7eebfcc5b9840ee7a`.
Kod: `7c73ac661732495d3b45586e0cf6b9ffeaac9400`.
Önceki 474/475 maddeleri tekrar sayılmadı.

| No | Doğrulanan hata | Düzeltme / kanıt |
|---|---|---|
| 476-01 | Windows taskkill exit=0 gelince watchdog kaldırılıyordu; hedef çocuk kapanmamışsa başka müdahale kalmıyordu. | Başarılı taskkill sonrası watchdog çocuk close'una kadar yaşar; süre dolarsa tek SIGKILL yedeği. Fake timer kontrolü ve gerçek Windows parent/grandchild testi geçti. |
| 476-02 | Boş ID'li restore sekmeleri tekilleştirmeden geçiyordu; aktif sekme ve sonraki başvurular boş kalıyordu. | Özgün kimlikleri çalmayan deterministik restored-N kimliği; çakışan uzun kimlikte suffix dahil 128 sınırı. Tekrar normalize etmek kimliği değiştirmez. |
| 476-03 | Aktif ID yokken ilk sekmeye düşülüyor ama split kontrolü eski aktif ID ile yapılıyordu; iki panel aynı sekmeyi alabiliyordu. | İkincil ID'yi sonuçta seçilen aktif ID'ye karşı doğrula. v8 fixture'da gone→one fallback ve secondary=one temizlenir. |
| 476-04 | BOM'lu UTF-8 session JSON JSON.parse'a doğrudan verilince geçerli kayıt bozuk sanılıp geri yüklenmiyordu. | Okuma ve eski kaydı backup'a alma doğrulamasında yalnız baştaki BOM'u sıyır. Sentetik BOM oturumu 1 sekmeyle kurtarılır. |
| 476-05 | null readerPreferences normalizer'da property erişimi fırlatıyordu ve normalizeSessionTab kesiliyordu. | Null/skaler/dizi ayarı varsayılan nesneye indir; sekme kurtarma devam eder. |
| 476-06 | Infinity/NaN split bounds sayıya çevrildikten sonra Electron'a geçebiliyordu; geçersiz native rectangle riski. | x/y/width/height verilen alanları finite doğrula; olmayan x/y varsayılanı korunur. Dört alan fixture'ı. |
| 476-07 | İçe aktarılan pakette null altyazı varyantı sanitizeVariant erişimini çökertip sağlam sekmeleri de iptal ediyordu. | Nesne olmayan varyant null döner; inspect mevcut bozuk-kayıt uyarısını ekleyip geçerli sekmeleri korur. Checksum geçerli fixture. |
| 476-08 | Manga geri-açma taraması await olurken iptal edilirse geç found sonucu başarı sayılıyordu. | scan await'inden sonra tekrar iptal kontrolü; eski içerikte kaydırma için found dönmez. |
| 476-09 | DownloadItem kayıt öncesinde yok olmuşsa setSaveDialogOptions/getFilename hatası event callback'ten kaçıyor ve scheduler admission serbest kalmıyordu. | Bu native kurulum çağrılarını yakala; admission cancel, preventDefault ve mevcut hata mesajı. Aktif iş/kayıt bırakılmaz. |
| 476-10 | Kapalı sekme snapshot'ı yalnız üst düzey kopyalanıyordu; nested timingOverride/points canlı nesneyle ortak kalıyordu. | Seçim/iz/senkron/edit/quarantine kayıtlarında structuredClone. Canlı timing.start=99 değişince kapanmış kayıt 1 olarak kalır. |

## Doğrulama

`tests/report476-regressions.test.js`: güncel v8 restore fixture'larıyla
10 FAIL → 10 PASS, yaklaşık 15 ms. İlk split örneği sürüm belirtmediği için
migrasyon split'i zaten temizliyordu; v8 verilince gerçek hata da kırmızı
oldu. İptal/timer örnekleri uyku kullanmaz. Gerçek kullanıcı dosyası yok.

Mevcut hedefli dosyalar geçti: process-lifecycle (10; gerçek Windows çocuk
ve torun dahil), browser-downloads, browser-session-package,
browser-session-corrupt (426), browser-session-privacy (18),
session-restore-matrix (1000 tohum), browser-subtitle-session,
browser-library-tools, history, session-map-bounds, browser-experience,
browser-nine-features, browser-report126-regressions,
browser-report85-regressions, browser-view-visibility,
report63-secret-redaction, report89-audit-regressions,
ci-determinism-ratchet. Determinizm eşiği değişmedi. Syntax ve diff temiz.

Süreç testi ilk sandbox denemesinde spawn EPERM aldı; yalnız fixture'ın
oluşturduğu Node parent/grandchild süreçleri için sandbox dışı tekrar
çalıştırıldı, geçti. Başka kullanıcı süreci sonlandırılmadı.

## Mevcut testte bağımsız onarım

report89 IDN örneğinde geçerli `xn--example-9ua.com` boş origin bekliyordu;
permissionOrigin ve bu test başlangıç HEAD'te aynıydı. Geçerli adres için
standart canonical origin beklentisi düzeltildi; negatif kontrol gerçekten
geçersiz `xn--%.com` ile korundu. Önce denenmiş `xn--a.com` mevcut Node'da
kabul edildiğinden negatif örnek olarak kullanılmadı. Güvenlik davranışı
gevşetilmedi, ürün permissionOrigin kodu değişmedi. Bu, 10 ürün hatasına
11. ürün hatası diye eklenmedi; fixture düzeltmesidir.

## Sınırlar

Windows Node ve küçük kontrollü süreç testi dışında start.bat/gerçek GUI,
DPI/native split görünümü, YouTube, GPU/model ve ses donanımı denenmedi.
Tam npm test ve CI bekleme kullanıcı tercihiyle yapılmadı. UI görünümü,
bağımlılık/kurulum ve kalıcı şema değişmedi. structuredClone desteklenen
Node >=22 çalışma zamanında yerleşiktir, yeni paket gerektirmez.
