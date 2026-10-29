# Rapor773 — Bölüm gezinmesinin kitap sahipliği

## Doğrulanan veri/görünüm riski

Kitap bölüm düğmesi saveChapter await sonrasında koşulsuz chapter=c.id yapıyordu. Kullanıcı/asistan bu sırada başka kitap açarsa, eski kitaptaki bölüm numarası yeni kitaba uygulanıyordu. Kontrollü iki-bölümlü eski kitap ve tek-bölümlü yeni kitapta eski kayıt cevabı serbest bırakılınca yeni editor tamamen kayboldu. Parent87c8e5fb üzerinde `New book editor must remain rendered` FAIL. Bu R772 kayıtlı proje select cevabı hatasından farklı, bölüm düğmesinin bekleyen save sonrası devamıdır.

`src/renderer/media-workflows-ui.js`: bölüm gezinmesi ortak projectOpenRequest sayacından kimlik alır; başlangıçta busy/dialog/bodyVersion, save sonrası istek/dialog/açıklık/bodyVersion/projectId kontrolü yapar. Eski bölüme ait devam yeni kitabı render etmez. Save kendi proje nesnesini değiştirebildiği için yalnız object identity karşılaştırılmadı. Mevcut openProject sahiplik yaklaşımı genişletildi; dış kod, yeni bağımlılık/ayar/IPC/CSS yok.

`tests/book-review-owner727.test.js`: mevcut fixture'a opsiyonel saveGate ve eski kitaba ikinci bölüm ekleme yeteneği; yeni regression gerçek renderer callback'ini çalıştırır. Bekleyen save→başka kitap aç→eski cevabı çöz; editor yeni projectId/tamchapter0 ve asistan yeni kitapta kalır.

## Kabul ve sınırlar

`node --test tests/book-review-owner727.test.js tests/book-review-selection690.test.js tests/book-review-revision728.test.js`:10PASS. Parent yeni1FAIL→finalPASS. İki değişen JS syntax ve diffcheckPASS. Kontrollü jsdom/IPC; gerçek Windows Electron, fiziksel dosya kaydı, ses/model/GPU/kişisel start.bat doğrulaması değildir. UI şekli/etiket/tema değişmedi, yeni görsel kabul yok. Tam npm/uzun CI beklenmedi. Kişisel dosyalar teslim dışında. P006/P063/P069/P079 kısmi ilerleme;90aktifhedef sürer.
