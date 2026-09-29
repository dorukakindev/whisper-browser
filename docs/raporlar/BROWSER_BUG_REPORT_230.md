# BROWSER_BUG_REPORT_230 — SponsorBlock önbellek TTL + anahtar-çakışması stresi (R280)

Tarih: 2026-09-30 · Dal: `fix/r280-cache-ttl` · Kapsam: `fetchSponsorBlockSegments`/`fetchDeArrowBranding`/`fetchYouTubeDislikes` (`src/main.js`), `SponsorBlockCache` + yardımcılar (`src/browser-sponsorblock.js`).

## Bulgular

### BUG — düzeltildi: SponsorBlock fetch'i gövde-ortası askıda sonsuza dek takılıyordu

`fetchSponsorBlockSegments` zaman aşımı sayacını yanıt **başlıkları** geldiği anda iptal ediyordu (`request.on('response')` → `clearTimeout`) ve yanıtta `error`/`aborted` dinleyicisi yoktu. Başlıkları gönderip akışı durduran bir sunucu (yarı-TCP kapanma, aracı kilitlenmesi) karşısında:

1. Promise asla çözülmez → `browser:sponsorBlock:get` IPC'si sonsuza dek bekler.
2. `.finally` asla çalışmaz → `sponsorBlockInFlight` girişi kalıcıdır → **aynı video+kategori için sonraki tüm çağrılar aynı asılı promise'e bağlanır** — o videonun SponsorBlock yolu tamamen ölür (uygulama yeniden başlatılana dek).

Aynı dosyada DeArrow ve RYD fetch'leri bu senaryo için açık yorumla güçlendirilmişti (`done` yardımcısı, sayaç gövde bitene dek, `error`/`aborted` dinleyicileri) — asimetrik sertleştirme kalıntısıydı.

**Düzeltme:** DeArrow/RYD kalıbı birebir uygulandı — `done` tek çıkış noktası (sayacı çözümde iptal eder), sayaç gövde `end`/`error`/`aborted`'a dek canlı, yanıt `error`/`aborted` olayları `errorKind:'network'` ile kapanır.

**Kırmızı kanıtı:** `tests/sponsorblock-fetch-resilience.test.js`'in askı senaryosu master'da FAIL (`askı gövdesi zaman aşımıyla çözülür` — promise çözülmedi), dalda PASS.

### Temiz çıkan yüzeyler (stres + statik inceleme)

- **Anahtar uzayı:** `key(videoId, kategori[], aksiyon)` — kategori sırası normalize/sort edilir, bilinmeyen kategori süzülür, videoId/kategori-seti/aksiyon ayrımıyla 5 farklı anahtar çakışmaz. videoId yalnız `[A-Za-z0-9_-]{11}` kabul ettiğinden sınırlayıcı enjeksiyonu imkânsız.
- **TTL:** pozitif 30 dk / negatif 2 dk sınırları doğru (`>` karşılaştırması — sınır değeri geçerli); negatif→pozitif geçişi `at`'i yenileyip pozitif TTL kazandırır; DeArrow/RYD örnekleri kendi TTL'leriyle ayrı cache örneklerinde çakışmaz (`branding`/`votes` aksiyonları).
- **LRU:** `get` delete+set ile tazeler; `set` en eski kaydı atar; tazelenen kayıt tahliyeden korunur.
- **In-flight dedupe:** eşzamanlı çağrılar tek `net.request`'te birleşir; kilit çözümden sonra temizlenir (askı yolu dışında).
- **404/5xx ayrımı:** 404 negatif kayıt (2 dk) ile önbelleklenir; 5xx önbelleğe yazılmaz — her çağrı yeni istek yapar (geri çekilme politikasına uygun).
- **`filterForDuration`:** önbellek ham sonucu saklar, kırpma çağrı anında — eksik süreyle cache'lenen kayıtlar sonradan öğrenilen gerçek süreyi kaybetmez (kodda doğrulandı, yorumuyla).

## Bilinen dar sınır (raporlanan, bug değil)

İn-flight paylaşımı ilk çağıranın `duration`'ını uygular; aynı video için eşzamanlı iki çağrıda ikinci çağrı ilk çağrının süre kırpmasını paylaşır. Gerçek akışta aynı video aynı süreyle çağrılır — teorik kenar, değişiklik yapılmadı.

## Testler

| Dosya | Sonuç |
| --- | --- |
| `tests/sponsorblock-fetch-resilience.test.js` (yeni, 25 kontrol) | PASS — master'da askı senaryosu FAIL (kırmızı kanıt) |
| `tests/browser-sponsorblock.test.js` | PASS |
| `tests/browser-video-extras.test.js` | PASS |
| `node --check src/main.js` | OK |

## Doğrulanamayan sınırlar

- Gerçek `net.request` yarı-kapanma davranışı Electron ağ yığınına bağlı — test sahte akışla sözleşme düzeyinde kilitler; canlı sponsor.ajay.app davranışı doğrulanmadı.
