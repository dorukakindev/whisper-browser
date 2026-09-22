# Browser bug raporu 74 — uzun aradan sonra güncel ağaç doğrulaması

Tarih: 2026-09-19
Dal: `master`
Başlangıç ürün kodu: `d3a3ffa0e374ced26d8c6f05072d16cb5c095d7a`
Düzeltme commit'i: `49715fb927369b0145232f5c87b1ab81991ac562`

## Kapsam

Son güvenilir karşılaştırma noktası `c43842d` ile başlangıç HEAD'i arasında 66 dosya ve
14.195 eklenen / 127 silinen satır incelendi. Özellikle SmartTube/Invidious, sağlayıcı
çevirisi, browser altyazısı, medya denetleyicisi, yerelleştirme ve Electron kabul
testleri üzerinde duruldu. Kullanıcı profili, gerçek API anahtarları ve kişisel medya
verileri okunmadı.

## İyi uygulanmış ve korunan alanlar

- Güncel kaynak ağacında SmartTube/Invidious bağlantıları, OAuth sır izolasyonu,
  altyazı yakalama/çeviri yaşam döngüsü ve tanı redaksiyonu için geniş regresyon
  kapsamı bulunuyor.
- Başlangıçta `npm test`, Electron bridge ve tam soak ayrı ayrı geçti. Soak 400/400
  yakalama, 20 ısınma ve 50 hibernasyon çevrimini; 24 kaynak bütçesini ihlalsiz
  tamamladı.
- R62/R63 testleri; çeviri kimliği/iptal kuşağı, önbellek flush yarışı, CJK dağıtımı,
  OAuth sır redaksiyonu, IPv6 SSRF ve observer sınırı sözleşmelerini güncel kodda
  başarıyla doğruladı. Bunlar geçici dosya olarak bırakılmıştı; kalıcı regresyon
  testlerine dönüştürüldü.

## Doğrulanan ve düzeltilen ürün hataları

### R74-01 — P2 — Oynatma hızı korumasında aynı-görev yarışı

`src/browser-media-controller.js` içindeki `applyingRate` bayrağı etkinken gelen
`ratechange` olayı bütünüyle atılıyordu. Site, uygulamanın 1,75x yazımıyla aynı görevde
hızı 1x'e indirirse bayrak mikro-görevde kapanıyor fakat kaçırılan olay yeniden
değerlendirilmiyordu. Electron A3 kabul testi bunu `1 !== 1.75` olarak tekrar üretti.

Düzeltme: Bayrak etkinken olay mikro-görev sonuna ertelenerek tercih yeniden
doğrulanıyor. Kendi olayımızda değer eşleştiği için ek yazım yapılmıyor. Yeni birim
testi aynı görev yarışını deterministik kuruyor. Gerçek Electron A3 sonucu:
`rate=1.75`, `fightback=1.75`.

### R74-02 — P2 — Browser araç menüleri native video yüzeyinin arkasında kalabiliyor

Toolbar'ın ayrı katman/taşma sözleşmesi yoktu. Native browser yüzeyi açıkken sayfa
çevirisi ve “daha fazla” açılırları görünmez kalabiliyordu. Toolbar'a açık stacking
context ve görünür taşma verildi; smoke testi occlusion eşitlemesini bekleyip gerçek
ekran piksel farkını ölçüyor. Sonuç: çeviri menüsü 498.616, diğer menü 411.785 değişen
piksel ile görünür.

### R74-03 — P3 — Adres önerisi listbox ARIA sözleşmesi eksik

`role=option` verilen düğmeler etkileşimli rol çakışması yaratıyor; Home/End, Tab ile
kapatma ve `aria-activedescendant` yönetimi yoktu. Seçenekler gerçek listbox option
öğelerine çevrildi; kararlı kimlik, `aria-selected`, aktif descendant, kaydırma,
Home/End ve Tab davranışları eklendi. Beş erişilebilirlik regresyonu geçti.

### R74-04 — P3 — Açık tema normal metin kontrastı yetersiz

Dört renk/zemin çifti WCAG AA 4,5:1 eşiğinin altındaydı. Token düzeltmelerinden sonra:

- muted / bg-3: 5,23:1
- accent / bg-3: 5,58:1
- accent-dim / bg-1: 6,24:1
- accent-dim / bg-3: 5,37:1

### R74-05 — P3 — İngilizce varsayılan oynatıcıda statik Türkçe açıklama

`#playerMeta` çalışma anında medya adı/bağlamı taşıdığı için genel yerelleştirici
tarafından kasıtlı olarak atlanıyor, fakat HTML varsayılanı Türkçeydi. Statik başlangıç
metni `Bilingual viewing workspace` yapıldı ve EN smoke'una regresyon eklendi.

## Test altyapısı borçları ve düzeltmeleri

- `run-electron-smokes --all` daha önce canlı sağlayıcı anahtarını/profilini kullanabilen
  ve dış ağa çıkan testleri de çalıştırıyordu. `--all` artık deterministik; dış ağ
  `--network`, gerçek sağlayıcı/API `--live` altında açıkça ayrıldı.
- İki katalog smoke'u Türkçe metin ararken ürünün yeni İngilizce varsayılanına
  güveniyordu. Testler aradıkları dili açıkça seçiyor.
- Sahne çıkarma smoke'u kesme noktası olmayan videoda sahte 0:00 sahnesi bekliyordu;
  üretim sözleşmesi bilinçli olarak boş liste döndürüyor. Test gerçek sözleşmeye
  uyarlandı, sahne varsa thumbnail biçimini doğrulamaya devam ediyor.
- R64 testleri hatanın varlığını başarı sayan ters beklentiler içeriyordu. Artık hatanın
  geri dönmesini engelleyen pozitif regresyon testleri.

## Yanlış pozitif / ürün hatası olmayan gözlemler

- Kesme algılanmayan videoda boş sahne dizisi tasarım gereğidir; sahte kare üretmemek
  doğru davranıştır.
- `electron-page-translation-live` ve sağlayıcı smoke'larının API/ağ başarısızlığı
  deterministik ürün kabulü değildir; açıkça `--live` kapsamına taşındı.
- `electron-browser-public-sites` gerçek internet ve uzak site zamanlamasına bağlıdır;
  `--network` altında tutuldu, temel kabul kapısı yapılmadı.
- Önceki bir toplu Electron koşusunda A3 bir kez Chromium CDP `Promise was collected`
  protokol dalgalanması yaşadı. A3 tekil koşuda ve son temiz 20-test toplu koşusunda
  geçti; bu nedenle ürün regresyonu olarak sınıflandırılmadı.

## Doğrulama kanıtı

- `npm test` — geçti; tüm Node test dosyaları ve backend Python testleri, `test_transcribe.py`
  içinde 192/192 dahil.
- `npm run test:electron-bridge` — geçti.
- `npm run test:soak` — geçti; 400/400 + 20 + 50, 24/24 bütçe sınır içinde.
- `node tests/run-electron-smokes.js a3-acceptance` — geçti; 7 kabul yolu ve manga
  stale-edit rollback.
- `node tests/run-electron-smokes.js cea-full-ui` — geçti.
- `node tests/run-electron-smokes.js --all` — 20/20 deterministik Electron smoke'u
  geçti; menü, katalog, media catalog, browser extras ve locale yüzeyleri dahil.
- `node --check` (`main.js`, `preload.js`, `renderer.js`, medya denetleyicisi ve smoke
  runner) — geçti.
- `python -m py_compile backend/transcribe.py` — geçti.

## Açık sınırlar

- Canlı sağlayıcı/API smoke'ları bilinçli olarak çalıştırılmadı; gerçek anahtar harcaması
  ve dış servis değişkenliği bu denetimin kapsamı değildi.
- Public-site smoke'u deterministik kabul kapısından ayrıldı; gerektiğinde `--network`
  ile ayrıca çalıştırılabilir.
- `_repro/` ve `docs/devir/2026-09-19-1040.md`,
  `docs/devir/2026-09-19-1100.md` önceki modellerin yerel/yarım çıktılarıdır; bu teslimde
  değiştirilmedi veya Git'e eklenmedi.
