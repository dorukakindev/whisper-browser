# Sıralı hedefler — kullanıcı kararı, 2026-11-04

Bu kayıt önceki erken tamamlandı iddiasını düzeltir. Önceki hedef kapanmadan sonraki alana geçilmez. Tek aktif hedef vardır. User/legacy ZIP belgeleri öneridir; yeni kullanıcı kararı önceliklidir.

## Tamamlanan taban

PR809 native tasarım ve PR810 podcast ilk bağlantıları/browser menüsü/dublaj düzeltmeleri master ve ana kopyaya alındı; son doğrulanmış taban `ef5e9bdd57c087b1e24b675d62c46fb8a6a5f5bb`. Bu, podcast teknik planının tamamının kapandığı anlamına gelmez.

| Sıra | Hedef | Durum | Bitiş şartı |
|---|---|---|---|
| G1 | PODCAST_TEKNIK_PLAN_2026-11-04 P1–P6 tamamlaması | KAPANDI — PR812 / 3d0e80b4 | Aşağıdaki kod bağlantıları tamam, kısa hedefli kontroller geçer, kalan canlı sınırlar açık yazılır; ürün commit/merge/ana kopya doğrulanır. |
| G2 | Önceki denetimin açık işlerini karşılaştırıp giderme | KAPANDI — PR813 / fd91f015 | B–K kapsamındaki aktarılmış iddialar güncel kodda incelenir; zaten düzelmiş/teyitli açık/doğrulanamayan ayrılır. Teyitli açıklar düzeltilir; eksik dış patch varmış gibi uygulanmaz. |
| G3 | Eski tasarım/düzeltme ZIP'lerinden yararlı parçalar | KOD TAMAM — entegrasyon | Her öneri güncel uygulamayla karşılaştırılır; uyumlu faydalı düzeltme alınır, yeni tasarım/eski özellik kaybı yaratılmaz. Başlamış yerel farklar korunup ayrı tutulur. |
| G4 | Uçtan uca kısa bug ve tasarım iyileştirme turu | BEKLİYOR | Browser, asistan, ana sayfa, Keşfet, podcast dinleme/okuma ve oynatıcıda anlamlı bozukluklar/akışlar giderilir; grafit/amber ve mevcut kontroller korunur. |
| G5 | Son bütünlük ve teslim | BEKLİYOR | Her hedefin durumu dürüst, ürün/belge commitleri ayrı, PR/master/ana kopya aynı sürümde, kişisel dosyalar korunmuş; hiçbir yarım iş tamamlandı diye sunulmaz. |

## G1 açık kontrol listesi

- [x] P1: bölüm kimliği ile fiziksel kaynak sürümü ayrılır; bilinen etag/length/hash/probe kaydedilir, bilinmeyen unknown; RSS ve shelf ortak sözleşme kullanır. Değişen sürüm eski konum/metni uygulamaz.
- [x] P2: shelf/player/native/browser mevcut sahibinin snapshot/subscribe/command adaptörü; görünüm değişimi src/play/ASR başlatmaz, ikinci motor/ikinci saat yok.
- [x] P3: gerçek shelf ve feed descriptor/dil/zamanlılık bağlantıları; güvenli fetch; zamanlı ve düz metin ayrımı; sessiz yanlış dil seçimi yok.
- [x] P4: mevcut kuyruk/Whisper/çeviri sahipleri; enqueue seçenekleri sabit; iptal/partial/retry ve eski bölüm sonucu yeni bölüme uygulanmama.
- [x] P5: asistan soru anında episode/sourceVersion/generation/track/time bağını dondurur; bu ana kadar kapsamına gelecekteki veya zamansız metin sızmaz.
- [x] P6: takip/elle okuma/dönüş; bölüm değişimi ve canlı epoch cleanup; disk kalıcılığı/yeniden açma/export/restore.
- [x] Podcast araçları ve dinleme/okuma görünümü gerçek sahiplere bağlı, mevcut tasarım bileşenleriyle kullanılabilir.
- [x] Kısa kod kontrolleri ve açık canlı sınırlar kaydedildi; merge ve ana kopya kimliği doğrulandı.

## Değişmez çalışma sınırları

Computer Use yok; erişim onay penceresi açan test yok; CPU/frame ölçümü, genişlik matrisi, yüzlerce çekim veya bütün suite yok. Yalnız değişen davranışa kısa anlamlı kontroller. Yeni hesap/ücretli bağımlılık yok. Korunan envelope dosyalarına ve kişisel değişikliklere dokunma. GitHub Actions başlatma, `[skip ci]` kullan. Kullanıcı sürekli merge yetkisi verdi; tekrar onay sorma.
