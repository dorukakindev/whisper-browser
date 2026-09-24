# BROWSER_BUG_REPORT_98 — T1: Altyazı↔görünür katman zaman doğruluğu

Tarih: 2026-09-22 (Europe/Istanbul). Dal `devin/t1-timing-oracle`, taban `origin/master@4453ae0` (PR #16/R97 merge'inden sonra). Görev: zaman-oraklı yerel fixture ile kaynak/çeviri SRT, oynatıcı video zamanı ve **gerçekten görünen overlay metni** aynı zaman çizgisinde ölçülsün; üretim hataları kırmızı testten sonra düzeltilecek.

## Ölçüm altyapısı

- `tests/browser-overlay-timing.test.js` — gerçek `buildBrowserOverlayScript` çıktısını vm bağlamında çalıştıran sahte-DOM harness. Sanal saat + 50 ms örnekleme ile **görünen metin** (`textContent`) oynatma anında orakla karşılaştırılır; `wrongCueMs`, `missingMs`, `correctionLatencyMs` dağılımı raporlanır.
- `tests/electron-overlay-timing.smoke.js` — gerçek Electron: ffmpeg ile üretilen 60 sn'lik `timing-oracle.mp4` (testsrc2) yerel HTTP sunucusundan açılır; oynatma sürerken geriye seek yapılır ve görünür overlay metni ~200 ms arayla örneklenir. Controller teşhisi izole dünya 999 üzerinden okunur.
- Teşhis genişletmesi (`src/browser-overlay-controller.js` `diagnostics()`): `fallbackRenders`, `lastRenderVideoTime`, `armedBoundary/armedDelayMs/armedAt`, `frameKind`, `mediaTime`, `timerProbeDelayMs` — hata ayıklamada sınır zincirinin hangi aşamada takıldığını gösterir.

## Kabul eşiği ve gerekçesi

- Sanal saat (deterministik): `wrongCueMs = 0`, `missingMs = 0`, düzeltme gecikmesi p95 ≤ 150 ms. Medya olayları ve timer sıfır gecikmeyle işlendiğinde ürün mantığı sapma üretmemeli; 150 ms payı yalnız hızlandırılmış oran sınırına toleranstır.
- Gerçek Electron: seek olayı → `seeked` → render → boya zinciri için 400 ms post-seek esnek pencere (Chromium kare teslimi); ardından örneklenen **23 örnekte 0 uyumsuz** (`~0 ms yanlış cue`). Eşik büyütülmedi; bayatlık kalırsa test kırmızı kalır.

## Bulgular

### F-98-1 — Seek/ratechange sonrası bayat sınır zamanlayıcısı yeni çizgiyi kilitliyor — FAIL→DÜZELTİLDİ

- **Kod yolu:** `queueFrame()` — `boundaryTimer` zaten kuruluysa erken dönerdi; seek/ratechange sonrası gelen render yeni video çizgisine göre sınırı yeniden planlayamaz, eski çizginin sınırına dek (saniyelerce) yanlış cue görünürdü.
- **Erişilebilirlik:** oynatma sırasında ileri/geri seek veya hız değişimi — sıradan kullanıcı etkileşimi.
- **Önce kırmızı:** `browser-overlay-timing.test.js` "geriye seek" testi — eski kodda bekleyen timer gecikmesi ≈3988 ms kalıyordu (yeni sınır ~500 ms olmalıydı).
- **Düzeltme:** `queueFrame` başında `boundaryTimer` temizlenip sınırlar güncel `currentTime`/`playbackRate`'e göre yeniden hesaplanıyor.
- **Son kanıt:** vm testi yeşil (delay ≈ 0-500 ms); gerçek Electron'da seek sonrası 23 örnek 0 uyumsuz (eski kodda aynı koşu 10 uyumsuz / ~2000 ms yanlış cue veriyordu).

### F-98-2 — requestVideoFrameCallback açlığı sınır çizimini kilitliyor — FAIL→DÜZELTİLDİ

- **Kod yolu:** sınır zamanlayıcısı `frameToken = media.requestVideoFrameCallback(callback)` kurar. Sayfa kare üretmiyorsa (kaplama yapılmayan webview, boşta compositor) vfc düşmez → `frameToken` takılı kalır → `queueFrame` erken döner → overlay cue değiştirmez.
- **Önce kırmızı:** gerçek Electron'da seek sonrası ~2 sn bayat metin (`pendingFrames:1`, `boundaryCallbacks` donuk).
- **Düzeltme:** sınır callback'i artık 400 ms emniyet zamanlayıcısı (`frameFallbackTimer`) kurar; vfc/rAF gelmezse kare callback'i iptal edilip doğrudan `render()` çağrılır (`frameKind:'fallback'`). `cancelFrame` her iki zamanlayıcıyı da temizler.
- **Son kanıt:** 4 ardışık Electron koşusunda 0 uyumsuz; kare teslimi varken `fallbackRenders=0` kalıyor (fallback gereksiz ateşlenmiyor).

### F-98-3 — Sınır epsiloni + erken ateşleme tüm cue aralığını atlıyor — FAIL→DÜZELTİLDİ

- **Kod yolu:** `collectBoundaries` `value > videoTime + .003` koşuluyla sınır seçiyor ve `delayMs` hesabında 12 ms erken ateşleme payı vardı. Çizim sınırdan 3 ms'den az önce düşerse (ör. t=11.998, sınır 12) sınır "geçmiş" sayılıyor, sonraki sınır (ör. 16) kuruluyordu → `[12,16)` aralığı boyunca eski cue.
- **Kanıt zinciri (gerçek Electron):** `armedAt:11.998 → armedBoundary:14` gözlendi; görünür metin t≈13.06'da hâlâ `cue-10-12` idi (~1 sn bayat). Zamanlayıcı probu (~100 ms) ortam gecikmesini dışladı — hata üründeydi.
- **Önce kırmızı:** yeni test "sınırdan hemen önce çizim" — t=11.997'de render sonrası kurulan zamanlayıcı delay=3991 ms (sınır 12 atlanmış).
- **Düzeltme:** epsilon kaldırıldı (`value > videoTime`); zamanlayıcı sınıra zamanında planlanıyor (`-12 ms` payı kaldırıldı). Erken düşen nadir bir çizimde `queueFrame` aynı sınırı ~0 ms gecikmeyle yeniden kurar; video ilerledikçe kendini düzeltir — aralık atlanamaz.
- **Son kanıt:** vm testi yeşil; Electron smoke arka arkaya 4/4 PASS, sınır geçişleri ~60-80 ms'de doğru cue.

## Çalıştırılan testler

| Test | Sonuç |
|---|---|
| `node tests/browser-overlay-timing.test.js` (yeni, 5 senaryo + ölçüm) | PASS — red→green kanıtlı (3991 ms→0 ms; seek/ratechange/pause senaryoları) |
| `electron tests/electron-overlay-timing.smoke.js` (yeni, gerçek Electron) | PASS ×4 ardışık — 23 örnek 0 uyumsuz; seek öncesi/sonrası sağlık |
| `npm test` (tam paket, 192 node + python suite'leri) | PASS — düzeltmeler sonrası temiz |
| `npm run test:electron-bridge` | PASS (dbus hataları Linux ortam gürültüsü) |
| Eski kod karşıt-kanıt | `git stash` ile eski `queueFrame`/epsilon sürümünde Electron smoke 10 uyumsuz → bug'ın üründe olduğu doğrulandı |

## Yalancı-pozitif kontrolü

- Overlay metni DOM'dan okunur (üç ağaç gezintisi, `data-whisper-browser-overlay` kökü); sadece cue dizisi değil, görünen `textContent` karşılaştırılır.
- Harness kendi çıktısını kopyalamaz: cue arama render içindeki üretim `findCues` yolundan geçer; test fixture'ı yalnız gerçek `buildBrowserOverlayScript` script'ini ve gerçek sayfadaki video'yu kullanır.
- Eşikler 400 ms post-seek penceresi dışında sıfır tolerans; yanlış cue üreten koşu testte kırmızı kalıyor (koşu başına örnek listesi rapora yazılır).

## Yeni bağımlılıklar

Yok. ffmpeg zaten ortamda (`/usr/bin/ffmpeg`); fixture her koşuda `.uiprev/` (gitignore) altına üretilir — 60 sn, ~1 MB, lisanssız sentetik.

## Açık sınırlar

- HLS/DASH/CEA-608 protokol fixture'ları ve 30 dk'lık drift ölçümü T2 kapsamında (ayrı dal/PR). Bu görev medya-cue sınır planlamasının ürün tarafındaki hatalarını kapattı.
- `document.hidden` sayfada overlay çizimi bilinçli durur (ürün tasarımı); boyanmayan sayfada son durum korunur, görünür olunca `visibilitychange` dışında ilk medya olayında tazelenir.
- Timer probu telemetrisi `diagnostics()` çağrısıyla 100 ms'lik tek atışlık ölçüm yapar; üretim maliyeti önemsiz.
