# BROWSER_BUG_REPORT_152 — R171: T2 derin zamanlama denetimi (DASH/HLS/overlay/ASR)

Tarih: 2026-09-27 · Dal: `codex/t2-timing-audit-1790523983` · Temel: master `677ac32`

Kapsam: `browser-subtitles.js` (DASH/HLS manifest → segment/cue zamanı), `browser-subtitle-sync.js`, `browser-overlay-controller.js` (sınır zamanlayıcı + rVFC), `browser-cea-captions.js`, `browser-dash-capture.js`, `browser-media-controller.js`, `renderer.js` medya işleyici + `subtitleSourceTime`/`findCueAt`/`renderBrowserCueAt`/`applyPlaybackLearningPolicy`, `live-asr-worklet.js`, `hls-recovery.js`, `browser-live-audio.js`, `browser-cea-checkpoint.js`.

## Doğrulanmış bulgular ve düzeltmeler

### B1 — Canlı DASH `$Time$` kalıp-eşleştirici PTO'yu atlıyor (HIGH, zaman ekseni kayması)

`parseDashSubtitleMatchers` sınırsız canlı şablonlar (`r="-1"` veya bitmeyen SegmentTimeline) için kalıp-eşleştirici üretir ama `presentationTimeOffset` alanını taşımıyordu. `dashSegmentOffset`'in `variable === 'time'` dalı da `value / timescale` hesaplıyordu — `presentationTimeOffset` düşülmüyordu.

Üretim: `timescale=10, presentationTimeOffset=1000`, `text/1040.vtt` → beklenen `(1040−1000)/10 = 4` sn, dönen **104 sn**. Canlı yayınlarda PTO tipik olarak saatler büyüklüğünde → altyazı cue'ları saatlerce öteye yerleşir, overlay'de hiç görünmez.

Düzeltme: eşleştiriciye `presentationTimeOffset` alanı + `time` dalına `(value − offset) / timescale` dönüşümü (üstteki segmentTime dalıyla aynı formül). Regresyon testi: `tests/browser-dash-capture.test.js` yeni vaka — 104 → 4.

### B2 — Gözlenen `playbackRate` kontrol sınırına (4x) kelepçeleniyordu (MEDIUM)

`probeActiveBrowserMedia` sitenin gerçek hızını `Math.min(4, playbackRate)` ile kesti. Kontrol sınırı 4x ama siteler/medya öğeleri daha hızlı oynayabilir (recap/atlama senaryoları, site hız ayarları). Kelepçe sonucu renderer `naturalStep = max(4.5, rate*1.75)` tahminini küçültür → gerçek drift > tahmin → her media olayında `jumpedForward` → A-B döngüsü ve öğrenme modları bir daha hiç devreye girmez.

Düzeltme: gözlenen hız `[0.0625, 16]` aralığına genişletildi (yalnız sayısal sağlık). Kontrol tarafı (`browser-media-controller.js` 'speed' komutu `[0.25,4]`) kasıtlı olarak değişmedi — kullanıcı 4x üstü ayarlayamaz ama sitenin >4x oynatması doğru gözlenir.

### B3 — Live-ASR worklet saat kelepçesi aynı 4x sınırında (MEDIUM, B2 bağımlılığı)

`live-asr-worklet.js` sync mesajındaki `rate`'i `[0.25,4]`'e kesiyordu. B2 düzeltmesiyle renderer artık 16x'e dek gerçek hız gönderir; worklet 4x'e keserse `predicted = time + ΔcontextTime * rate` tahmini sapar → `Math.abs(next.time − predicted) > .75` her sync'te tetiklenir → sürekli flush + cue zaman damgaları (`offset`) sıkışmış hesaplanır.

Düzeltme: worklet kelepçesi `[0.0625,16]`.

### B4 — `hls-recovery.js` `plausibleJump` aynı kelepçe sınıfı (LOW-MEDIUM)

`playbackProgress` içinde `rate = min(4, max(0.1, |rate|))`. 18x oynatmada medya adımı 0.25 sn'de 4.5 sn, `plausibleJump` 4 sn'de kalırdı → her örnek "sıçrama" → `elapsedMs` hiç 10 sn'ye ulaşamaz → kurtarma hakları sonsuza dek sıfırlanmaz.

Düzeltme: `[0.0625, 16]`. Regresyon testi: 18x gerçek ilerleme kararlı pencereyi tamamlıyor (`progressFor(machine, 10000, 250, 18)` → reset:true, bütçe sıfırlanıyor). Not: `progressFor` yardımcısı yalnız son çağrının sonucunu döndürür — pencere tamamlanınca `elapsedMs` sıfırlanıp saymaya devam ettiği için eşiğin tamamını aşan süreler yanlış negatif verir; test 10 sn'ye tam oturtuldu.

## Temiz çıkan yüzeyler (kanıt)

- `dashTemplateTimeline`/`dashListTimeline`: `S@t/d/r` (r=−1 dahil), 10k-segment tavanı, `presentationTimeOffset` segmentTime dalında doğru.
- `matchDashSubtitleUrl`: capture-group → `segmentValue`; `number` dalında `(value−startNumber)·duration/timescale` doğru.
- `browserActiveCuesAt`: prefix-max + WeakMap önbellek, yarı-açık `[start,end)` aralık doğru.
- MP4 `tfdt`/`trun`/`compositionStart`: sınır kontrollü.
- `browser-subtitle-sync.js`: `MIN/MAX_SCALE`, iki-nokta doğrulama, `timingOverride ≥ 0.08` — temiz.
- `browser-cea-captions.js`: discontinuity reset, Content-Range yetkili bayt-aralığı eşleşmesi, SERVICE→CC708 haritası, AES-128 IV türetimi — temiz.
- `browser-overlay-controller.js`: sınır zamanlayıcı + rVFC + 400ms fallback, `seeked`/`ratechange` dinleyicileri, tam ekran geçişi, mutation observer — temiz.
- `browser-live-audio.js`/`startBrowserLiveAsrCapture`: kuşak kontrolleri, pending ≤8 kuyruk, flush el sıkışması, `pcm16Wav` ≤16000·2·9 bayt kapısı — temiz.
- `hls-recovery.js` kalan mantık: epoch/token geçersizleştirme, tür-bağımsız bütçe, arka-plan throttle'da medya-ilerlemesiyle sınırlı sayım — temiz.
- `parseHlsSegments`: `EXT-X-SKIP` delta, `MAP@BYTERANGE` örtük devam, DISCONTINUITY-SEQUENCE, GAP — temiz.

## Sınırlar / doğrulanamayanlar

- `$SubNumber$` tek başına kullanılan şablonlarda yakalanan değer segment numarası olarak yorumlanır (SIDX nadir, altyazılarda pratikte görülmedi) — bilinen sınır olarak notlandı.
- `findCueAt` ipucu ıskalayınca doğrusal tarama yapar; 10k+ cue izlerinde tik başına O(n) — perf notu, bug değil.
- Gerçek canlı yayın (sürekli güncellenen MPD + PTO saatleri) Windows'ta el kontrolü önerilir; burada fixture MPD + ayrıştırıcı düzeyinde doğrulandı.
- Hız >4x senaryosu UI'da erişilemez (kontrol 4x'te kesilir); yalnız sitenin kendi oynatma hızıyla mümkün — gerçek cihazda site hızını >4x'e çıkarıp gözlem önerilir.

## Testler

- `node tests/browser-dash-capture.test.js` — 12/12 (yeni PTO vakası dahil)
- `node tests/hls-recovery.test.js` — 14/14 (yeni 18x kararlılık vakası)
- `node tests/player-ui.test.js` — 13/13 (yeni prob-kelepçe sözleşmesi)
- `node --check` src/browser-subtitles.js, src/main.js, src/hls-recovery.js, src/renderer/live-asr-worklet.js — temiz
- Windows CI bekleniyor.
