# BROWSER_BUG_REPORT_194 — R237: tur-3 paketi bağımsız denetimi (3 kalıntı düzeltildi)

Tarih: 2026-09-29 · Dal: `fix/r237-tur3-residual` · Taban: master `99995fb4` (PR #173 sonrası)

## Kapsam

PR #172 ile gelen tur-3 paketinin squash diff'i (`44a3767`, 14 dosya, +856/−76)
satır satır bağımsız denetlendi — başka bir ajanın yazdığı 19 oynatıcı/PDF/kuyruk
düzeltmesi + site bazlı reklam koruması + yeni sekme sayfası. Yöntem: tüm diff
okundu, referans verilen her sembol (`watchItemByKey`, `browserTabAvatar`,
`effectiveBrowserProfile`, `cancelStUpNextCountdown`, `player.holdingSpeed`,
`player.learningBaseRate`, `player.openIntent`, `updateBrowserSiteProfile` IPC
anahtarları …) tanım yerlerinde doğrulandı, `browser:profile:update` handler'ı
(sekme/nesil/origin doğrulaması + flush başarısızlığında geri alma + adblock
`reloadRequired`) incelendi.

## Bulunan ve düzeltilen kalıntılar

### 1. Kütüphane aynı-dal tıklama yarışı (openIntent artırılmadan)
`openWatchLibraryItem`'ın yerel-medya (else) dalı `const intent = player.openIntent;`
diye yakalıyordu — artırmıyordu. Sonuç: kullanıcı A kaydına sonra B kaydına hızlı
tıklarsa iki bekleyiş aynı intent'i paylaşıyor; A'nın yetkisi geç dönerse geçerli
sanılıp kullanıcının son seçimi (B) eziliyordu. Paketin düzeltmesi yalnız
dal-değişimlerini (browser/youtube `++` artırıyor) karşılıyordu.
**Düzeltme:** `const intent = ++player.openIntent;` — her tıklama kendi neslini
alır, önceki bekleyişler geçersizleşir.

### 2. PDF çeviri düğmeleri okuyucu değişince kilitli kalıyor
`translateVisiblePdfPages`'ın çift-başlatma bekçisi (tur-3) düğmeleri kilitlerken
`finally`'de geri açmayı `player.pdfReader === reader` koşuluna bağlamıştı.
Eski belgenin çevirisi sürerken kullanıcı yeni bir PDF açarsa (ya da okuyucuyu
kapatıp yeniden açarsa) koşul boşverip düğmeler süresiz devre dışı kalıyordu.
**Düzeltme:** etkin okuyucu kendi çevirisini yürütmüyorsa (`!current || !current.translating`)
düğmeler geri açılır; yeni okuyucunun çevirisi kendi finally'siyle korunur.

### 3. Eski belgenin çeviri durumu yeni belgenin satırını eziyor
`translateVisiblePdfPagesNow` döngüsü `pdfHash` bekçisiyle eski belge değişince
kırılıyor ama toplu başına ilerleme yazısı ve son `pdfReaderSetStatus` bekçisizdi
— kapanan/değişen belgenin "Çeviri hazır/iptal" satırı yeni belgenin durum
alanına yazılabiliyordu.
**Düzeltme:** iki yazma da `player.pdfReader === reader` bekçisine bağlandı.

## Doğrulanan ve temiz çıkan yüzeyler

- `siteOverrides`: main.js'te yalnız okunuyor (hiç atanmıyor) — renderer'ın
  yerel kaldırma işlemi doğru ve yeterli; `isSitePaused` site-profili yolunu
  kullanır.
- `ratechange` süzgeci: `holdingSpeed`/`playbackPolicy`/`learningBaseRate`
  semantiği hem seçim (`playerSpeed` change → base'e eşit → senkron geçer)
  hem geçici hız (2× tutma, boşluk hızlandırma → fark → atlanır) yönünden doğru.
- `syncPlayerSpeedControl` özel hız seçeneğini ekler, [0.25,4] kelepçeler —
  `playerSpeed`'in enum'dan `UI_NUMERIC_RANGES`'e taşınmasıyla tutarlı.
- NTP işlevleri (`ntpQuickTiles`/`ntpContinueItems`/`ntpPlaceKey`) sınır
  koşulları güvenli; `browserNtpHiddenList` JSON/localStorage savunmalı; TDZ
  riski try/catch ile kapatılmış.
- `browser:profile:update` IPC: `scope:'site'` kabulü, origin/generation
  doğrulaması, disk-flush başarısızlığında önceki profile geri dönüş —
  sözleşme sağlam.
- `stopAfterCurrent` butonunun `<span>`'ı var — metin yazımı SVG'yi ezmez.
- `openPdfReader`'daki önceki-okuyucu `$('pdfReaderClose').click()` zinciri
  kapanış temizliğini (belge, gözlemci, durum) düzgün çalıştırır.

## Test kanıtı

- `tests/browser-ui-regressions-r3.test.js`: 3 yeni davranış kilidi —
  master'da **3/3 KIRMIZI**, bu dalda **15/15 yeşil**.
- Hedefli dosyalar: `pdf-translate`, `pdf-file-access`,
  `watch-library-concurrency` (12), `queue-persistence` (14),
  `browser-adblock`, `audit-tur5` — hepsi geçti.
- `node --check src/renderer/renderer.js` temiz.

## Windows etkisi

Yalnız renderer mantığı; Windows'a özgü davranış değişikliği yok. Elle doğrulama
önerisi: kütüphanede üst üste hızlı çift tıklama (son seçim kazanmalı);
PDF çevirisi sürerken ⋯ → PDF aç ile ikinci belge (düğmeler kullanılabilir
kalmalı); eski belgenin çeviri sonucu yeni belgeye yazılmamalı. Windows
doğrulama oturumu (devin-3c20a465…) tur-3 §4 listesini ayrıca koşuyor.

## Çalıştırılmayan kontroller

- Electron smoke'ları (başsız kutu `exit 9`), tam `npm test` (hedefli koşuldu).
