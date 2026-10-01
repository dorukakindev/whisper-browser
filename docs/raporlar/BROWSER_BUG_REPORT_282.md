# BROWSER BUG REPORT 282 — R324-3 timer/interval envanteri + ratchet

**Tarih:** 2026-09-30 · **Dal:** `devin/<ts>-r324-3-interval-ratchet` · **Tür:** statik envanter + ratchet (temiz)

## Kapsam

R324-3: `src/` + `src/renderer/` altındaki tüm `setInterval` kullanımlarının
handle-çifti envanteri. R163'ün main.js-only ratchet'ının genişletilmiş hali.

## Envanter sonucu

**Handle'lı interval'ler (hepsi eşli):**
- `main.js`: `watchTimer` (2 clear noktası + unload), `browserTrackTimer`,
  `browserMediaTimer`, `browserCaptureTimer` (`stopBrowserPolling` üçlüsü).
- `browser-media-controller.js`: `graph.timer` (silence monitor, satır 43).
- `renderer.js`: `player.browserMangaLookaheadTimer`, `player.ambientTimer`,
  `playerTaskPulseTimer`, `stUpNextCountdown.timer` (nesne-literal handle),
  `_ytCodeTimer`.

**Handle'siz singleton'lar (modül-init IIFE, ömür boyu — bilinçli):**
- `browser-analysis-tools.js:153`, `browser-dialogue.js:32`,
  `browser-features.js:345`, `browser-series-context.js:116`,
  `browser-video-analysis.js:169` — hepsi signature/context guard'lı.
- `renderer.js:23504` `checkPlayerSleepTimer` — renderer ömrü boyunca tek.

## Bulgular

**Gerçek bug yok.** Tüm handle'lı interval'ler aynı dosyada `clearInterval`
eşi taşıyor; bare interval'lerin tümü init-singleton.

Ratchet hazırlığında iki tarayıcı kusuru düzeltildi: `prop: setInterval`
nesne-literal handle formu tanımlandı; `vendor/` dizini taramadan çıkarıldı
(`hls.min.js` üçüncü-taraf, kapsam dışı).

## Eklenen ratchet

`tests/interval-inventory.test.js` (2 test):

- Tüm `src/**/*.js` dosyaları taranır: her handle'lı `setInterval` için aynı
  dosyada `clearInterval(<handle>)` metin eşi zorunlu; bare çağrılar ancak
  whitelist'teki dosya sayısı kadar olabilir — yeni bare interval ya bilinçli
  listeye eklenir ya da CI düşer.
- Bayat-whitelist koruması: whitelist dosyaları beklenen sayıda bare interval
  içermezse düşer (silinebilir kayıtlar tazeliği).

## Doğrulama

- `node tests/interval-inventory.test.js` → 2/2 PASS.

## Windows etkisi

Yok — test-only.

## Doğrulanmayan sınırlar

Statik metin eşi semantik değil (bir dosya `clearInterval(x)` yazıp hiç
çağrılmayabilir); davranışsal kanıt R324-5 listener-çifti süpürmesinde
açıklanır. `setTimeout` uzun-yaşam riski taşımaz (tek-atış), envanter
dışı bırakıldı.
