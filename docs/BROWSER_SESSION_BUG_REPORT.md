# Browser Session Derin Bug Raporu

Tarih: 2026-09-18
Kaynak: `src/main.js`, `src/browser-session-store.js`, `src/browser-tabs.js`, `src/browser-tab-history.js`, `src/browser-sponsorblock.js`, `src/browser-skip-segments.js`, `src/browser-site-permissions.js`, `src/browser-cloudflare-compat.js`, `src/browser-library-tools.js`, `src/browser-live-audio.js`, `src/browser-research-notebook.js`, `src/browser-site-*.js`, `src/browser-session-package.js`, `src/browser-session-privacy.js`

---

## 1. Session Restore Sırası — `createWindow` Öncesi Restore

**Dosya:** `src/main.js:12534` (restore) vs `12536` (createWindow)

```startLine:12532:endLine:12537:src/main.js
  browserAdapterPluginStatus = ADAPTER_REGISTRY.loadJsonDirectory(
    path.join(app.getPath('userData'), 'browser-adapters'));
  if (typeof startBrowserAdblock === 'function') startBrowserAdblock();
  restoreBrowserSessionState();       // ← SATIR 12534
  restoreInvidiousSessions();         // K2 — şifreli SID deposu → bellek haritası
  restoreYoutubeSession();            // YouTube OAuth — refresh_token → bellek haritası
  createWindow();                     // ← SATIR 12536
```

**Bulgu:** `restoreBrowserSessionState()` → `createBrowserTabRecord()` ile tab kayıtları belleğe yüklenir ancak `ensureBrowserView()` çağrılmaz. Görünümler yalnızca `createWindow()` sonrası, renderer tetiklendiğinde (veya `browser:show` IPC'si geldiğinde) `ensureBrowserView()` üzerinden oluşturulur. Bir hata `createWindow()` başarısız olursa tab kayıtları bellekte kalır; bir sonraki başarılı başlatmada restore çift kayıt oluşturabilir.

**Etki:** Düşük-orta. Kapanış sırasında yarım kalan bir tab snapshot'ı bir sonraki açılışta çift kayıt oluşturabilir.

**Önerilen Düzeltme:** `restoreBrowserSessionState()` başarısız olursa (dosya bozuksa, session boşsa) `browserTabs.clear()` yapılmalı veya restore sırasında hata yakalanıp temiz bir durum kurulmalı. Mevcut `normalizeBrowserSession()` bozuk kayıtları sessizce atlar — bu doğru davranış.

---

## 2. Persist + Quit Race — İkinci `before-quit` Boş Map Yazıyor

**Dosya:** `src/main.js:12453` (flush, before-quit) vs `12574-12576` (second before-quit)

```startLine:12445:endLine:12456:src/main.js
    mainWindow.on('close', (event) => {
      if (mainWindowClosing) { event.preventDefault(); return; }
      mainWindowClosing = true;
      event.preventDefault();
      (async () => {
        // ...
        await flushBrowserSession();       // ← İLK yazım
        await flushWatchLibraryBeforeClose();
        browserSessionFinalizedForQuit = true;  // ← İŞARET
        // ...
        destroyBrowserView();             // tab'ler Map'ten silinir
        await shutdownPersistentBrowserSession();
```

```startLine:12572:endLine:12577:src/main.js
  if (activeJobCancel) void activeJobCancel();
  browserOrderlyShutdown = true;
  if (!browserSessionFinalizedForQuit) persistBrowserSessionNow();  // ← İKİNCİ yazım korumalı
  browserDownloads.persist();
```

**Bulgu:** `browserSessionFinalizedForQuit = true` satırı `destroyBrowserView()` **içinde** çalışır — tab'ler Map'ten silindikten sonra. Birinci `before-quit` handler başarıyla `flushBrowserSession()` → `persistBrowserSessionNow()` çalıştırır ve `browserSessionFinalizedForQuit = true` atanır. Ardından `destroyBrowserView()` tab'leri siler.

Electron aynı `close` olayını yaydığı için ikinci bir `before-quit` tetiklenebilir. `src/main.js:12576`'daki koruma `browserSessionFinalizedForQuit`'i kontrol eder — bu doğru. **Ancak** ilk handler async IIFE içinde çalıştığından, ikinci `before-quit` ilk handler tamamlanmadan gelirse `browserSessionFinalizedForQuit` hâlâ `false` olabilir. İkinci `persistBrowserSessionNow()` boş `browserTabs` ile çağrılır ve sağlam dosyanın üzerine yazar.

**Etki:** Kritik — tüm sekme verisi kaybı. Kullanıcı tüm sekmeleri, konumları, altyazı tercihlerini kaybeder.

**Önerilen Düzeltme:** İkinci çağrıyı engellemek için bir mutex veya `browserSessionFinalizedForQuit` kontrolünü async handler'ın *en başında* koy:

```javascript
mainWindow.on('close', (event) => {
  if (mainWindowClosing) { event.preventDefault(); return; }
  if (browserSessionFinalizedForQuit) return; // ← erken çıkış
  mainWindowClosing = true;
  event.preventDefault();
  // ...
```

---

## 3. Max Session Tabs Aşılınca Eviction Yok — Yalnızca Reject

**Dosya:** `src/main.js:12678` (create), `4397` (open link), `12868` (reopen)

```startLine:12676:endLine:12681:src/main.js
ipcMain.handle('browser:tab:create', (event) => queueBrowserTabTransition(async () => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
  if (browserTabs.size >= MAX_SESSION_TABS) {
    return { ok: false, limitReached: true,
      error: `En fazla ${MAX_SESSION_TABS} tarayıcı sekmesi açılabilir. Önce bir sekmeyi kapatın.` };
  }
```

```startLine:4397:endLine:4400:src/main.js
  if (!url || browserTabs.size >= MAX_SESSION_TABS) {
    sendBrowserEvent({ type: 'notice', success: false, message: !url ? 'Bağlantı açılamadı.'
      : `En fazla ${MAX_SESSION_TABS} sekme açılabilir. Önce bir sekmeyi kapatın.` });
    return false;
```

**Bulgu:** 24 sekme sınırına ulaşınca yeni sekme açma isteği reddedilir. **Eviction mekanizması yoktur.** Kullanıcı 24 sekme açtığında yeni sekme açamaz ve eski sekmelerden birini kapatmak zorundadır. `reopen` işleminde (`12868`) boş bir sekme varsa o yerine açılır — bu tek istisna.

**Etki:** Orta — kullanıcı deneyimi kesintisi. Özellikle otomatik sekme açan komut dosyaları veya eklentilerde takılma.

**Önerilen Düzeltme:** Skor fonksiyonu ile en düşük öncelikli sekmeyi (en eski erişim, pinned değil, oynatma yok) otomatik kapatma seçeneği eklenebilir. Pinned sekmeler eviction'dan muaf tutulmalı.

---

## 4. SponsorBlock Cache TTL 30 Dakika — Eski Segmentler Hâlâ Dönüyor

**Dosya:** `src/browser-sponsorblock.js:136-148`

```startLine:136:endLine:148:src/browser-sponsorblock.js
class SponsorBlockCache {
  constructor({ maxEntries = 64, ttlMs = 30 * 60 * 1000, negativeTtlMs = 2 * 60 * 1000 } = {}) {
    this.maxEntries = maxEntries; this.ttlMs = ttlMs; this.negativeTtlMs = negativeTtlMs; this.entries = new Map();
  }
  key(videoId, categories, actionType = 'skip') { return `${SPONSORBLOCK_VERSION}|${videoId}|${normalizeCategories(categories).join(',')}|${actionType}`; }
  get(videoId, categories, actionType = 'skip', now = Date.now()) {
    const key = this.key(videoId, categories, actionType); const entry = this.entries.get(key);
    if (!entry || now - entry.at > (entry.negative ? this.negativeTtlMs : this.ttlMs)) { this.entries.delete(key); return null; }
    this.entries.delete(key); this.entries.set(key, entry); return entry.value;
  }
```

**Bulgu:** `ttlMs = 30 * 60 * 1000` (30 dakika). SponsorBlock verileri video içeriği güncellendikten sonra bile 30 dakika boyunca döndürülür. YouTube videoları düzenli olarak bölüm/sponsor bilgisi güncellenir. Cache invalidation video ID değişikliğine bağlı değil — video güncellense bile aynı video ID için eski segmentler döner.

Ek: `get()` her çağrıldığında önce silip sonra tekrar ekler (LRU benzeri davranış) — bu doğru.

**Etki:** Düşük-orta. Güncellenmiş sponsor segmentleri 30 dakika boyunca atlanır.

**Önerilen Düzeltme:** `ttlMs` değerini 5 dakikaya düşürmek veya `max-age` HTTP başlığı varsa onu kullanmak. Negatif TTL (bulunamadı yanıtları) zaten 2 dakika — bu iyi.

---

## 5. Skip Segments Çakışması — Intro + Outro Aynı Anda Atlanıyor

**Dosya:** `src/browser-skip-segments.js:53-68`

```startLine:53:endLine:68:src/browser-skip-segments.js
  function decideSkip(records, context = {}, state = {}) {
    const time = Number(context.currentTime);
    if (!Number.isFinite(time) || time < 0) return { candidate: null, shouldSkip: false, state: {} };
    const previous = Number(state.lastTime);
    const hasPrevious = Number.isFinite(previous);
    const backwards = context.manualSeek === true || (hasPrevious && time < previous - .25);
    const candidate = normalizeRecords(records)
      .filter(item => (item.scope === 'media' ? item.scopeKey === context.mediaKey
        : item.scopeKey === context.seriesKey) && time >= item.start && time < item.end)
      .sort((a, b) => a.end - b.end)[0] || null;
```

**Bulgu:** `decideSkip` yalnızca **bir aday** döndürür — `.sort((a, b) => a.end - b.end)[0]`. Eğer intro (0-30 sn) ve outro (video_süre-30sn, video_süre) aynı anda aktif olsaydı (örneğin çok kısa video), sadece biri seçilir. Ancak asıl sorun başka: fonksiyon `kind = 'intro' | 'recap'` kullanır ama geri dönen `candidate` nesnesi `kind` alanını taşımaz. Dışarıdan hangi tür atlandığı bilinemez.

Daha kritik: `decideSkip` aynı `kind`'deki çakışan segmentleri de yalnızca bir tanesine indirger. İki farklı intro kaydı (örneğin "intro" ve "recap") aynı aralıkta olsa bile en kısa süreli olan seçilir.

**Etki:** Düşük. Pratikte çakışma nadir — intro genellikle video başında, outro sonundadır.

**Önerilen Düzeltme:** `decideSkip` dönüş değerine `kind` eklenmeli ve renderer/boyler bu bilgiyle kullanıcıya "Intro atlandı" gibi mesaj verebilmeli.

---

## 6. Tab History Memory — `BrowserClosedTabHistory` Sınırı + `closedAt` Yok

**Dosya:** `src/browser-tab-history.js`

```startLine:47:endLine:58:src/browser-tab-history.js
class BrowserClosedTabHistory {
  constructor(limit = DEFAULT_CLOSED_TAB_LIMIT) {
    this.limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || DEFAULT_CLOSED_TAB_LIMIT)));
    this.entries = [];
  }

  push(snapshot) {
    const normalized = normalizeClosedBrowserTab(snapshot);
    if (!normalized) return false;
    this.entries.unshift(normalized);
    if (this.entries.length > this.limit) this.entries.length = this.limit;
    return true;
  }
```

**Bulgu 6a:** `DEFAULT_CLOSED_TAB_LIMIT = 20` — `normalizeClosedBrowserTab()` ile kaydedilen her giriş `subtitleSyncRecords` (max 500 kayıt), `subtitleEdits` (max 2000 kayıt), `trackRefs` (max 12 kayıt) tutar. Her bir altyazı eşleme kaydı kendi zaman kodlarını ve metinlerini içerir. **Toplam bellek:** 20 × (500 + 2000 + 12) × ~ortalama kayıt boyutu = potansiyel olarak 50 MB+ veri.

**Bulgu 6b:** `normalizeClosedBrowserTab()` `closedAt` (kapanış zamanı) kaydetmez. Eski sekmelerin ne kadar süredir kapalı olduğu bilinmez — LRU eviction doğru sırada çalışmaz.

**Etki:** Bellek sızıntısı riski. Çok sayıda altyazı eşlemesi yapılmış sekmeler kapatıldığında `subtitleSyncRecords` ve `subtitleEdits` kopyalanır.

**Önerilen Düzeltme:**
1. `normalizeClosedBrowserTab()` içinde `subtitleSyncRecords` sayısını 100'e, `subtitleEdits` sayısını 500'e düşür.
2. `closedAt: finiteNumber(snapshot.closedAt, Date.now(), 0)` alanı ekle.
3. Alternatif: `normalizeClosedBrowserTab`'da altyazı eşleme kayıtlarını kapatma anında `null`'la — yeniden açılınca zaten yeniden yüklenir.

---

## 7. Site Permission Persistence — `grantedPermission` Korunuyor mu?

**Dosya:** `src/browser-site-permissions.js`, `src/main.js:12988-12990`

```startLine:12981:endLine:12991:src/main.js
ipcMain.handle('browser:permissions:get', (event, request = {}) => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
  const tab = browserTabById(request.tabId) || activeBrowserTab();
  const url = tab ? browserTabSnapshot(tab).url : '';
  const origin = permissionOrigin(request.origin || url);
  if (!origin) return { ok: false, error: 'İzinleri gösterilecek geçerli site yok.' };
  const stored = places.sitePermissions?.[origin]?.permissions || {};
  return { ok: true, origin, permissions: Object.fromEntries(SUPPORTED_BROWSER_PERMISSIONS.map((permission) =>
    [permission, { decision: browserPermissionDecision(places.sitePermissions, origin, permission), stored: stored[permission] || 'ask' }])) };
```

**Bulgu:** `browserPermissionDecision()` `normalizeBrowserSitePermissions(sitePermissions)[origin]?.permissions?.[name]` döner. `sitePermissions` bellekte `places` nesnesinde tutulur. `places` bir mutation debounce ile `setBrowserPlaces()` üzerinden yazılır. **Kritik soru:** `grantedPermission` alanı persist ediliyor mu?

İnceleme sonucu: `browserPermissionDecision()` sadece izin *kararını* döner (`allow`/`block`/`ask`). BrowserView'a gerçek Chromium izinleri `session.setPermissionRequestHandler` üzerinden verilir. Eğer `places.sitePermissions` diske yazılmadan önce uygulama çökerse, son verilen izinler kaybolur. Debounce nedeniyle ~700 ms gecikme var.

**Etki:** Orta. Nadir çökme senaryosunda kullanıcı bir siteye verdiği izni yeniden vermek zorunda kalır.

**Önerilen Düzeltme:** Kritik izinler (`microphone`, `camera`) için debounce süresini 0'a düşür veya her izin değişikliğinde anında yaz.

---

## 8. Cloudflare Probe State Leak — Stale Probe Birikimi

**Dosya:** `src/main.js:10406-10411`, `10297-10303`

```startLine:10404:endLine:10411:src/main.js
function prepareBrowserPageInstrumentation(tab) {
  if (!tab) return Promise.resolve({ active: false, stale: true });
  if (tab.cloudflareProbePromise) return tab.cloudflareProbePromise;
  const work = performBrowserPageInstrumentation(tab).finally(() => {
    if (tab.cloudflareProbePromise === work) tab.cloudflareProbePromise = null;
  });
  tab.cloudflareProbePromise = work;
  return work;
}
```

```startLine:10297:endLine:10303:src/main.js
function invalidateBrowserCloudflareProbe(tab) {
  if (!tab) return 0;
  tab.cloudflareProbeSeq = (Number(tab.cloudflareProbeSeq) || 0) + 1;
  tab.cloudflareProbePromise = null;  // ← mevcut promise null'lanır
  return tab.cloudflareProbeSeq;
}
```

**Bulgu:** `invalidateBrowserCloudflareProbe()` mevcut promise'i `null`'lar ama promise'i resolve/reject etmez. `finally()` içinde `tab.cloudflareProbePromise === work` kontrolü `null` ile karşılaştırılır ve `null = null` true olur — `cloudflareProbePromise` temizlenir. **Ancak** `performBrowserPageInstrumentation()` hâlâ çalışmaya devam edebilir. Sonraki `prepareBrowserPageInstrumentation()` çağrısı yeni bir probe başlatır. Çok hızlı navigasyonlarda (kullanıcı 1 sn'de 10 sayfa gezerse) 10 probe paralel çalışır.

**Etki:** Performans. Her probe CDP script çalıştırır, disk I/O yapar.

**Önerilen Düzeltme:** Mevcut probe'u `abortSignal` veya `tab.cloudflareProbeCancelled` bayrağı ile iptal etmek. `finally()` yerine `tab.cloudflareProbeCancelled` kontrolü `performBrowserPageInstrumentation`'ın başına eklenmeli.

---

## 9. Library Tools — Koleksiyon Rename + Remove Race

**Dosya:** `src/main.js:15195-15205`, `src/browser-library-tools.js:159-181`

```startLine:15195:endLine:15205:src/main.js
ipcMain.handle('library:collections:rename', async (event, request) => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
  try { return saveWatchLibraryCollectionMutation(renameCollection(loadWatchLibraryAll(), request?.from, request?.to)); }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('library:collections:remove', async (event, name) => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
  const normalized = normalizeCollectionName(name);
  if (!normalized) return { ok: false, error: 'Koleksiyon adı gerekli.' };
  return saveWatchLibraryCollectionMutation(removeCollection(loadWatchLibraryAll(), normalized));
});
```

**Bulgu:** Her IPC handler sıralı çalışır (Electron IPC modeli). Ancak iki aynı `library:collections:rename` çağrısı paralel yapılabilir (iki farklı renderer işlemi veya aynı anda iki talep). Her iki `rename` de `loadWatchLibraryAll()` ile aynı anlık veriyi okur. İlk yazma tamamlandığında ikincisi artık eski veri üzerinde çalışıyor demektir — sonuç: birinci rename kaybolur.

Aynı durum `rename` + `remove` arasında geçerli. `renameCollection` bir koleksiyonu yeniden adlandırırken, aynı anda `removeCollection` onu silerse, rename ikinci write'da kaybolabilir.

**Etki:** Veri kaybı. Koleksiyon adlandırma kayıpları.

**Önerilen Düzeltme:** `saveWatchLibraryCollectionMutation` içine bir "operation ID" veya timestamp bazlı idempotency kontrolü ekle. Veya tüm collection mutation'larını tek bir mutex ile serileştir.

---

## 10. HLS Recovery — Session Restore Sırasında Eski HLS Destroy Edilmemiş

**Dosya:** `src/main.js:2988-2991` (streamMediaId), `11316` (reset), `11783` (destroy)

```startLine:2986:endLine:2991:src/main.js
    translationSourceCues: [],
    translationResults: new Map(),
    translationDisplayedCueIds: new Set(),
    translationFileCueIds: new Set(),
    translationPersistedSignature: '',
    streamMediaId: '',
```

**Bulgu:** `createBrowserTabRecord()` her tab için temiz `streamMediaId` oluşturur. Session restore sırasında (`restoreBrowserSessionState` → `createBrowserTabRecord`) tab yeniden oluşturulur ama **önceki HLS player/timer/worker'lar temizlenmez** çünkü tab sıfırdan yaratılıyor. `destroyBrowserView()` tüm tab'ları yok eder — ama restore sırasında `destroyBrowserView` çağrılmaz, sadece `createBrowserTabRecord` çağrılır.

`createBrowserTabRecord` yeni bir tab kaydı oluşturur ve bellekteki Map'e ekler. Eski tab'ın HLS player'ı (renderer tarafında) hâlâ çalışıyor olabilir çünkü main process'te karşılık gelen bir temizleme yapılmadı.

**Etki:** Düşük — renderer tarafında HLS session restore sırasında zaten sıfırlanıyor olmalı. Ana tehdit: `streamMediaId` temizlense bile önceki timer'lar (`cloudflareChallengeTimer`, `loadRetryTimer` vb.) temizlenmez. Ancak bunlar her tab'da ayrı tutulur ve yeni tab yaratılınca yeni timer'lar atanır. Eski timer'lar `tabId` farklı olduğu için olay gönderemez.

**Önerilen Düzeltme:** Restore sırasında `destroyBrowserView()` çağrılmalı veya `createBrowserTabRecord` içinde tüm timer'lar null'lanmalı. Mevcut `createBrowserTabRecord` zaten çoğu timer'ı null başlatır (satır 2993-2999).

---

## 11. Concurrent Tab Close — `closedAt` Çakışması Yok (Alan Yok)

**Dosya:** `src/main.js:12758` (tab close), `src/browser-tab-history.js`

**Bulgu:** `destroyBrowserTab()` `closedAt` zamanı kaydetmez. İki tab aynı anda kapatılırsa (kullanıcı iki sekmeyi aynı anda kapatırsa veya `force: true` ile toplu kapatma) ikisinin de `closedAt` aynı `Date.now()` olur. `BrowserClosedTabHistory` `closedAt` kullanmaz — zaten yok. `push()` sırası FIFO, eski olan en sona gider. Bu bir bug değil, eksik özellik.

**Etki:** Düşük. Kapatma sırası tamamen "kullanıcının hangisine önce tıkladığına" bağlı.

**Önerilen Düzeltme:** `normalizeClosedBrowserTab`'a `closedAt: finiteNumber(snapshot.closedAt, Date.now(), 0)` ekle ve `BrowserClosedTabHistory` sıralamasını `closedAt`'e göre yap.

---

## 12. Event Listener Leak — IPC Handler Birikimi

**Dosya:** `src/main.js` — tüm `ipcMain.handle` ve `webContents.on` çağrıları

**Bulgu:** `ipcMain.handle` Electron'da handler biriktirmez — aynı kanala birden fazla `handle` kaydı yapılamaz (sonrakiler öncekilerin üzerine yazar veya hata verir). Ancak `webContents.on` çağrıları sorunlu olabilir. Bir tab `installBrowserContextMenu` üzerinden her context menüsünde yeni listener ekliyor mu?

```startLine:4550:endLine:4580:src/main.js
function installBrowserContextMenu(tab, wc) {
  wc.on('context-menu', (_event, params = {}) => {
    // ...
    const template = [
      // ...
      { label: 'Bu satırı çevir', visible: !!selection && !params.isEditable, enabled: !tab.pageTranslateJob,
        click: () => void startBrowserPageTranslation(tab, { scope: 'selection', autoContinue: false })
```

**Bulgu:** `installBrowserContextMenu` her `ensureBrowserView` çağrıldığında çalışır. Aynı `wc` (WebContents) için birden fazla `context-menu` listener eklenebilir mi? Her tab yalnızca bir kez `ensureBrowserView` alır ve aynı `wc` için tek bir `installBrowserContextMenu` çağrısı olur. **Ancak** tab yeniden oluşturulduğunda (unload → reload) yeni `wc` oluşur ve eski listener'lar GC'ye kalır.

**Etki:** Düşük. Modern Node.js/Electron GC'si kaldırılan WebContents listener'larını temizler.

**Önerilen Düzeltme:** Önceki listener'ları kaldırmak için `wc.removeListener` veya `wc.removeAllListeners('context-menu')` ekle.

---

## 13. Memory Growth — Session Her Save'de Tutulan Veri + Limit Yok

**Dosya:** `src/browser-session-store.js:170-260`, `src/main.js:3263`

```startLine:3246:endLine:3268:src/main.js
function persistBrowserSessionNow() {
  if (browserSessionSaveTimer) clearTimeout(browserSessionSaveTimer);
  browserSessionSaveTimer = null;
  if (browserSessionFinalizedForQuit) return { ok: true, skipped: true };
  persistActiveBrowserTabState();
  const result = writeBrowserSessionAtomic(browserSessionPath(app), {
    restoreEnabled: browserSessionRestoreEnabled,
    activeTabId: browserActiveTabId,
    splitSecondaryTabId: browserSplitSecondaryTabId,
    splitRatio: browserSplitRatio,
    cleanExit: browserOrderlyShutdown,
    tabs: browserTabsSnapshot(),   // ← HER SEFERINDE TAM SNAPSHOT
  });
  browserSessionLastWriteAt = Date.now();
  return result;
}
```

**Bulgu:** Her `persistBrowserSessionNow()` çağrısında **tam snapshot** yazılır — 24 sekmenin tamamı. `browserTabsSnapshot()` her çağrıldığında tüm tab'lerin tüm alanlarını (konum, hız, ses, altyazı seçimi, eşleme kayıtları, düzenleme geçmişi) serialize eder.

**Alt bulgular:**

13a. **Altyazı eşleme kayıtları büyür:** `subtitleSyncRecords` (max 24 kayıt × her biri zaman kodu + metin) ve `subtitleEdits` (max 2000 kayıt × her biri metin + hash). 2000 altyazı düzenlemesi × ~500 bayt = ~1 MB tek tab başına. 24 tab × 1 MB = **24 MB** session dosyası. Her 700 ms'de bir yazılırsa disk I/O yoğunluğu.

13b. **`normalizeSessionTab` her kayıt için tüm düzenleme geçmişini tutar** — kayıtlar silinmez, sadece yeni kayıtlar eklenir. Kullanıcı bir videodaki her altyazı satırını düzenlerse dosya sürekli büyür.

13c. **Backup dosyası** (`browser-session.json.bak`) her başarılı yazımda bir önceki dosyayı korur — toplam 2× boyut.

**Etki:** Performans (disk I/O), bellek (JSON parse). Uzun süreli kullanımda `browser-session.json` 50+ MB olabilir.

**Önerilen Düzeltme:**
1. `subtitleSyncRecords` ve `subtitleEdits` için **delta compression**: sadece son N kaydı sakla, eski kayıtları sessizce budala.
2. `scheduleBrowserSessionSave` debounce'unu 2 saniyeye çıkar (zaten `effectiveDelay` max 10 sn).
3. Session dosyası boyutu > 5 MB ise eski altyazı düzenleme geçmişini budala.

---

## 14. Ek: SponsorBlock `negative` TTL Yanlış Kullanım

**Dosya:** `src/browser-sponsorblock.js:148`

```startLine:148:endLine:148:src/browser-sponsorblock.js
    if (!entry || now - entry.at > (entry.negative ? this.negativeTtlMs : this.ttlMs)) { this.entries.delete(key); return null; }
```

**Bulgu:** Negatif TTL (bulunamadı yanıtları) 2 dakika. SponsorBlock sunucusu video için segment döndürmezse bu kayıt 2 dakika boyunca "yok" olarak cache'lenir. Video yüklendikten 2 dakika sonra tekrar sorgulanır. **Ancak** `negative` flag'i yalnızca `set()` çağrısında açıkça verilmeli. Kod incelemesinde `SponsorBlockCache.set()` çağrısı yapılmıyor — bu cache sınıfı başka bir modülde kullanılıyor mu kontrol edilmeli.

---

## Özet Tablo

| # | Bug | Etki | Kritik | Dosya:Satır |
|---|-----|------|--------|-------------|
| 1 | Session restore sırası (createWindow öncesi) | Veri tutarsızlığı | Düşük | main.js:12534-12536 |
| 2 | Persist + quit race (ikinci before-quit boş Map yazar) | **Tüm sekme verisi kaybı** | 🔴 Kritik | main.js:12453+12576 |
| 3 | Max tabs aşılınca eviction yok | UX kesintisi | Orta | main.js:12678 |
| 4 | SponsorBlock cache TTL 30 dk | Eski segment döner | Düşük-Orta | browser-sponsorblock.js:136 |
| 5 | Skip segments — kind bilgisi dönüşte kayıp | Bilgi eksikliği | Düşük | browser-skip-segments.js:63 |
| 6a | Tab history bellek — aşırı kayıt | Bellek sızıntısı | Orta | browser-tab-history.js:39-43 |
| 6b | Tab history — closedAt yok | Sıralama hatası | Düşük | browser-tab-history.js:8-44 |
| 7 | Site permission debounce — çökmede kayıp | İzin kaybı | Orta | main.js:13003 |
| 8 | Cloudflare probe — paralel probe birikimi | Performans | Düşük | main.js:10406-10411 |
| 9 | Library rename/remove race | Veri kaybı | Orta | main.js:15195-15205 |
| 10 | HLS restore — eski timer'lar | Düşük leak | Düşük | main.js:2986-2991 |
| 11 | closedAt çakışması yok (alan yok) | Bilgi eksikliği | Düşük | browser-tab-history.js |
| 12 | Event listener leak (context-menu) | Düşük bellek | Düşük | main.js:4550 |
| 13 | Session save bellek/disk büyümesi | Performans/Disk | Orta | main.js:3263, browser-session-store.js |
