# BROWSER BUG REPORT 280 — R324-1 sekme×görünüm yarış matrisi

**Tarih:** 2026-09-30 · **Dal:** `devin/<ts>-r324-1-unload-fuzz` · **Tür:** derin okuma + hostile-durum fuzz (temiz)

## Kapsam

50-maddelik gece kuyruğu R324 grubu madde 1: sekme/görünüm yaşam döngüsünün
yarışa en açık karar noktası — bellekten-boşaltma kapısı
(`src/browser-tab-resources.js`) ve main.js `unloadBrowserTab` /
`activateBrowserTab` akışları.

## Denetlenen yüzey

- `browserTabUnloadDecision` / `browserTabProtectionReasons`: 10 koruma
  nedeni (active, pinned, keep_awake, media_playing, fullscreen_or_pip,
  navigation, active_job, unsaved_draft, form_or_login, unknown_state).
- `unloadBrowserTab` çift-kapı TOCTOU deseni: karar → `browserTabRuntimeState`
  (sayfa içi ölçüm) → yeniden karar → `resourceActionSeq` sayacı → son kontrol.
  Pending yakalama ölçümü sırasında `resourceActionSeq` değişirse işlem
  iptal edilir ve sayfa 'background'a döner — doğru desen.
- `browserTabRuntimeState`: `stateKnown` yalnız strict `false`/`true` üretir;
  `=== false` kontrolü için falsy-ama-false-olmayan kaçak yok (doğrulandı).
- `translationSchedulerBusy` fail-closed: `snapshot()` fırlatırsa busy sayılır.
- `activateBrowserTab`: önceki sekmenin media pause'i, debugger detach,
  split-secondary takası ve `pageFind.stop()` sıralaması.

## Bulgular

**Gerçek bug yok.** Denetimde kapı mantığı bütün koruma alanlarını kapsıyor;
yarış pencereleri sıra sayacı (`resourceActionSeq`) ve yeniden-karar ile
kapanıyor.

Fuzz turunda yakalanan tek kusur testin kendisindeydi: oracle'ın scheduler
stub'ı `snapshot()` içinde `rand()` çağırıyordu — iki çağrı farklı sonuç
verdiği için sahte uyumsuzluk üretti. Deterministik hale getirildi (üretim
kodu etkilenmedi).

## Eklenen ratchet

`tests/unload-decision-fuzz.test.js` (9 test):

- Her koruma bayrağı tek başına kendi nedenini üretir (tek-bayrak haritası).
- 2000 tohumlu hostile matris: rastgele bayrak kombinasyonları + yaşam
  döngüsü + scheduler varyantlarında `allowed ⇒ reasons boş`, `reasons ⇒
  allowed değil`, `reasons` tekil ve `reason === reasons[0]`.
- `translationSchedulerBusy` fail-closed sözleşmesi.
- `groupBrowserProcessMetrics`: NaN/negatif pid, workingSet kelepçesi,
  `sharedTabIds` ↔ `processShared` tutarlılığı (800 tohum).
- `normalizeBrowserPageResourceMetrics`: `measured:false ⇒ null` alanlar,
  negatif/NaN kırpma (500 tohum).
- `summarizeBrowserResourceBudgets`: çıktılar sonlu/≥0/`networkCaptureActive`
  boolean (500 tohum).

## Doğrulama

- `node tests/unload-decision-fuzz.test.js` → 9/9 PASS.

## Windows etkisi

Yok — yalnızca test dosyası eklendi; ürün kodu değişmedi. Windows'ta
`npm test` kapsamına otomatik girer.

## Doğrulanmayan sınırlar

Kapının arkasındaki gerçek Electron yarışı (view destroy ↔ karar anı) VM'de
koşulamaz; üretim yolu `resourceActionSeq` + son kontrolle zaten korunuyor.
