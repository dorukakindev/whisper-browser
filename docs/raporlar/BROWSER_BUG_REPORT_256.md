# BROWSER_BUG_REPORT_256 — R307: Arka-plan sekme throttle/bellek denetimi

20'lik kuyruk maddesi 10 ("Renderer arka-plan sekmesi throttle/bellek").
Sekme yaşam döngüsü (background → unloaded → restore) ve arka-plan
durumunda çalışmaya devam eden yan etkiler denetlendi.

## Bug — Bellekten boşaltılan sekme tükenmiş retry/çökme bütçesini devralıyor

- **Kök neden:** `unloadBrowserTab` zamanlayıcıları temizliyor ama
  `tab.loadRetryAttempt`, `tab.loadRetryPendingNav` ve
  `tab.crashRecoveryAttempt` sayaçlarını sıfırlamıyordu. Sekme nesnesi
  unload'da yaşamaya devam eder; yeni `WebContentsView` dirildiğinde bu
  geçici hata durumları eski görünümden sızıyordu (R306'nın aynı sınıfı:
  durumun yanlış yaşam döngüsü sınırına bağlanması).
- **Senaryo A (retry):** Sekme A adresinde 3 denemeyi tüketir
  (`attempt=3`, terminal) → kullanıcı sekmeyi bellekten boşaltır →
  sekmeye geri döner (yeni görünüm) → restored URL'in ilk hatası
  `navigationRetryPolicy({attempt:3})` ile anında `retry-limit` diyaloğu
  açar — dirilen sayfa hiç yeniden denenmez. `loadRetryPendingNav`
  sarkarsa durum daha kötü: ilk gerçek gezinme bayrağı tüketip sayacı
  **sıfırlamaz**, bayat bütçe bir kez daha devredilir.
- **Senaryo B (çökme):** `crashRecoveryAttempt=1` olan sekme boşaltılıp
  dirilirse ilk çökmede `recreate-once` hakkı tükenmiş sayılır —
  otomatik diriliş yapılmaz, sekme doğrudan `restore_failed`'a düşer.
- **Düzeltme:** `unloadBrowserTab`'de zamanlayıcı temizliğiyle birlikte
  `loadRetryAttempt=0`, `loadRetryPendingNav=false`,
  `crashRecoveryAttempt=0`; ayrıca `clearBrowserCloudflareTimer(tab)`
  eklendi (callback görünüm kontrolüyle zaten tek tıkta ölüyordu ama
  temizlik noktası eksikti).

## Denetlenen ve temiz çıkan yüzeyler

- **Polling kapsamı:** `browserTrackTimer`/`browserCaptureTimer`/
  `browserMediaTimer` tek ve global; yalnız aktif sekme için çalışır,
  browser gizlenince/aktif değişince `stopBrowserPolling` durur.
  Arka-plan sekmesine özel poller yok.
- **Sekme geçişi:** aktif→arka plan geçişinde görünüm ekran dışına
  taşınır, debugger ayrılır, sayfa içi `video`/`audio` tüm shadow
  root'larda `pause()`'lanır (best-effort, düşman sayfa engelleyemez).
- **CDP/istek haritaları:** `browserPendingResponses`/`browserRequestRanges`
  global ama arka plan sekmesi beslemez (debugger ayrık); boyut sınırı ve
  TTL budaması var.
- **Cloudflare probu:** `scheduleBrowserCloudflareProbe` 1.5 sn aralıkla
  yeniden kurulur ama 240 kontrolde (~6 dk) `timedOut` ile durur —
  sınırlı maliyet; görünüm yoksa callback erken döner.
- **Unload koruma:** `browserTabUnloadDecision` aktif/pinned/keepAwake/
  medya/fullscreen/PiP/navigation/active_job/dirtyDraft/formOrLogin/
  unknown_state nedenlerini kapsar; `browserTabRuntimeState` JS ölçümü
  + capture-pending kontrolü üç aşamalı (initial → runtime → final).
- **Snapshot serileştirme:** `browserTabsSnapshot` her `tabs-changed`'de
  tüm sekmeleri serialize eder ama per-tab listeler sınırlı
  (`subtitleSyncRecords` ≤24/sekme, `resourceIpcTimestamps` ≤1200,
  `subtitleEdits`/`quarantine` normalize kapılarından geçer).
- **`backgroundThrottling: false`** bilinçli tercih (yakalama/çeviri
  arka planda sürsün) — değiştirilmedi; arka-plan sekmelerinin sayfa
  JS'i çalışmaya devam eder, bellek baskısında kullanıcı `Etkin olmayan
  sekmeyi bellekten boşalt` komutuyla `unloadBrowserTab`'a ulaşır.
  Otomatik bellek-baskısı boşaltma yok — özellik boşluğu, bug değil.

## Test

- `tests/browser-retry-state.test.js` genişletildi: `unloadBrowserTab`
  gövdesi vm'de gerçek kod olarak koşturulur; tükenmiş bütçe + sarkan
  bayrakla boşalt → sayaçlar sıfır → 'restoring' diriliş → ilk hata
  `retry` (attempt 1). Master'da kırmızı (regex + davranış), dalda yeşil.
- İlgili dosyalar: browser-tabs, browser-tab-resources,
  browser-lifecycle-policy, report-25-28, report-85, process-lifecycle,
  resource-leak-inventory — hepsi PASS.

## Doğrulanmayan

- Gerçek Windows'ta Bellek-yönetimi paneliyle elle unload→restore akışı
  (kod yolu platformdan bağımsız).
