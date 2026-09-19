# BROWSER_BUG_REPORT_73 — Salt-Okunur Derin Bug Avı (R68/R69/R72 sonrası YENİ Bulgular)

**Tarih:** 2026-09-19
**Başlangıç commit:** `master @ 31ee1fb` (R68 düzeltmelerinin base'i)
**Bitiş commit:** `master @ f9eee65` (R72 düzeltmeleri sonrası — en güncel HEAD)
**Mod:** Salt-okunur. Kod değişikliği yapılmadı.

> **NOT — Dosya adı:** Kullanıcının orijinal talebi `BROWSER_BUG_REPORT_69.md` istemişti, ancak bu dosya kök dizinde zaten **önceki R69 audit raporu olarak izlenmiş durumda** (commit `087aadc`). Üzerine yazmak o raporu yok ederdi. Sıradaki sıra numarası olan **R73** (untracked `tests/report73-player-ab-search.test.js` ile tutarlı) kullanıldı. Eğer kullanıcı yine de R69 adını istiyorsa, R73 içeriği `BROWSER_BUG_REPORT_69.md`'a taşınır ve eski R69 audit raporu `BROWSER_BUG_REPORT_69_audit_2026-09-18.md`'e adlandırılabilir.

## Kapsam

Önceki raporlar (R68, R69, R72) tarafından düzeltilen 30 + 12 + 31 = 73 bulgu üzerine ek olarak, R68/R69/R72'nin kapsamadığı alanlardaki **yeni** bulgular:

- Quick Edit undo/redo davranışı (`src/renderer/renderer.js` 21500-21800 bandı)
- PDF okuyucu + manga çeviri IPC validasyonu (`src/main.js` 14042-14120)
- Note editor draft storage + periyodik temizlik (`src/renderer/renderer.js` 13137-13180)
- Sponsor exemption storage büyüme kontrolü (`src/renderer/renderer.js` 9877-9896)
- Browser state persistence (`browser:session:updateTab`, `normalizeSessionTab`)
- HLS yenileme + video element listener'ları (`src/renderer/renderer.js` 16542-16735)
- Watch-folder browser mode + history tutarsızlıkları
- IPC validation eksikleri (`browser:command`, `browser:session:updateTab`, `browser:tab:setPinned`)
- Browser event listener birikimi (`browserOverlayController`, `attachNavigationGuard`)
- Memory leak'ler (`browser-translation-archive.js _saveIndex` orphan files)
- Mevcut testlerde kapsanmamış alanlar (`tests/` klasörü)

## Öncelik tablosu

- **K** (Kritik): Veri kaybı, güvenlik açığı, çökme, session bozulması
- **Y** (Yüksek): Yanlış davranış, sessiz hata yutma, kullanıcı fark etmeden veri kaybı
- **O** (Orta): UX bozukluğu, yanlış feedback, kaynak tüketimi
- **D** (Düşük): Stil, küçük tutarsızlık, ileride ölçeklenebilir sorun

---

## KRİTİK (K) — 4 bulgu

### K1. `cleanNoteDrafts` backward iterasyon + `removeItem` → kullanıcı not taslağı kaybolabilir

**Dosya:** `src/renderer/renderer.js:13139-13153`

```javascript
for (let index = localStorage.length - 1; index >= 0; index--) {
  const key = localStorage.key(index);
  if (!key?.startsWith('browser-note-draft:') && !key?.startsWith('browser-note-edit-draft:')) continue;
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem(key) || ''); } catch (_) {}
  if (!parsed || typeof parsed !== 'object' || typeof parsed.value !== 'string'
      || !Number.isFinite(parsed.at) || now - parsed.at > NOTE_DRAFT_MAX_AGE_MS) {
    localStorage.removeItem(key);  // ← BU SATIRDAN SONRA INDEKS KAYAR
    continue;
  }
  entries.push([key, parsed.at]);
}
```

**Bulgu:** `localStorage.removeItem(key)` çağrıldığında sonraki elemanlar indeksi bir aşağı kayar. `for` döngüsü `index--` ile manuel azaltır, ama `localStorage.key(index)` artık **shift sonrası** indeksteki öğeyi döndürür. Net etki: ardışık öğelerden biri atlanır.

En ciddi senaryo: eğer eski taslak `NOTE_DRAFT_MAX_AGE_MS` (30 gün) sınırını aşmış ama yeni taslak hâlâ geçerliyse, eskisi silinir ve sonraki `localStorage.key(index)` artık eski sıradaki **geçerli** taslağı atlayabilir → geçerli taslak limit dışı kalır, sonraki temizlikte silinir.

**Üretim:**
1. 50 tane geçerli not taslağı biriktir
2. 30 gün boyunca düzenleme yapma
3. Yeni bir taslak yaz (`writeNoteDraft`) → `cleanNoteDrafts` çağrılır
4. 30 günden eski taslaklar silinir (ama iterasyon sırası bozulur)
5. Limit dışı kalan geçerli taslak bir sonraki okuma çağrısında kaybolur

**Etki:** Kullanıcının önemli not taslağı, beklenmedik zamanlama ile kaybolabilir.

**Önerilen Düzeltme:**
```javascript
const keys = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key?.startsWith('browser-note-draft:') || key?.startsWith('browser-note-edit-draft:')) keys.push(key);
}
for (const key of keys) { /* aynı temizlik */ }
```

**Öncelik:** **K** — Kullanıcı verisi sessizce kaybolabilir.

---

### K2. `setPlayerHls` HLS yenileme sonrası eski `loadedmetadata` listener'ı sızıntı yapıyor

**Dosya:** `src/renderer/renderer.js:16714-16725`

```javascript
const refreshedHls = player.hls;
player.hlsRecovery.completeRecovery(attempt.token);
const resume = () => {
  video.removeEventListener('loadedmetadata', resume);
  if (player.hls !== refreshedHls || staleGeneration(gen)) return;
  if (at > 0) video.currentTime = at;
  if (wasPlaying) video.play().catch(() => {});
};
video.addEventListener('loadedmetadata', resume);
```

**Bulgu:** `loadedmetadata` listener'ı sadece olay ATEŞLENDİĞİNDE kendini kaldırır. `destroyHls()` hls instance'ını yok eder ama `video` elementi üzerindeki dinleyiciyi kaldırmaz. Eğer kullanıcı yenileme tamamlanmadan farklı bir video yüklerse, video elementi yeniden kullanılır → eski listener hâlâ takılı → yeni kaynağın `loadedmetadata`'sında eski `at` ile `currentTime`'ı geriye sarar.

**Üretim:**
1. YouTube videosunu HLS ile aç
2. Yayın bağlantısı kopup `hls.on(ERROR)` → `probeWithActiveSource` → `setPlayerHls` (yenileme)
3. Yenileme `loadedmetadata`'yı beklerken başka bir video seç (`setMediaKey`)
4. Yeni video `loadedmetadata` → eski listener ateşlenir → eski `at` ile seek

**Etki:** Yanlış pozisyona atlama, oynatma karışıklığı.

**Önerilen Düzeltme:** AbortSignal ile cleanup:
```javascript
const abortResume = () => video.removeEventListener('loadedmetadata', resume);
video.addEventListener('loadedmetadata', resume);
// hlsRecovery complete/timeout/abort edildiğinde abortResume çağrısı
```

**Öncelik:** **K** — Doğrudan kullanıcı deneyimi bozulması.

---

### K3. `portableSessionTab` import döngüsünde tabs array DoS

**Dosya:** `src/browser-session-package.js:145-150`

```javascript
const rawSession = migrated.payload.session && typeof migrated.payload.session === 'object'
  ? migrated.payload.session : {};
const tabs = [];
for (const [index, candidate] of (Array.isArray(rawSession.tabs) ? rawSession.tabs : []).entries()) {
  const tab = portableSessionTab(candidate);
  if (tab) tabs.push(tab);
  else warnings.push(`Sekme ${index + 1} geçersiz olduğu için atlandı.`);
}
```

**Bulgu:** `rawSession.tabs` için `.slice(0, MAX_TABS)` YOK. Saldırgan, 1 milyon sekme içeren bir paket gönderebilir. Her sekme için `portableSessionTab` → `normalizeSessionTab` çağrılır; her birinde trackRefs/recoveryJobs/subtitleSyncRecords için ayrı `.slice(0, MAX)` yapılır → O(N × M) işlem.

`normalizeBrowserSession` sonradan `slice(0, MAX_SESSION_TABS)` uygular ama o noktada tüm sekmeler zaten `normalizeSessionTab`'tan geçmiştir.

**Üretim:**
1. Saldırgan `inspectBrowserSessionPackage` çağrısı tetikler (kullanıcı dosya açarsa)
2. 1M tabs içeren JSON yüklenir
3. Ana süreç saniyelerce donar, sonra düşük RAM uyarısı

**Etki:** DoS, ana süreç donması.

**Önerilen Düzeltme:**
```javascript
const rawTabs = Array.isArray(rawSession.tabs) ? rawSession.tabs.slice(0, MAX_TABS) : [];
for (const [index, candidate] of rawTabs.entries()) { ... }
```

`MAX_TABS` değeri `src/browser-session-store.js` içinde `MAX_SESSION_TABS` adıyla mevcut — import edilip kullanılabilir.

**Öncelik:** **K** — DoS vektörü.

---

### K4. `browserSponsorExemptions` Map kalıcılık için disk'e serialize edildiğinde 100'den fazla video sessizce kırpılır

**Dosya:** `src/renderer/renderer.js:2148-2152`

```javascript
records.sort((left, right) => right[1].updatedAt - left[1].updatedAt);
return Object.fromEntries(records.slice(0, 100));
```

**Bulgu:** `normalizeBrowserSponsorExemptions` Map'i 100 entry ile sınırlar. Ancak `persistBrowserSponsorExemption` (line 9887) her ekleme SONRASINDA normalize çağırır. Eğer kullanıcının `browserSponsorExemptions` Map'inde 100 video varsa ve yeni bir video için exemption eklenirse, **en eski video'nun exemptions'ı sessizce silinir**. Kullanıcı geri dönüp o videoyu açtığında, eskiden "Bu sponsor bölümünü atla" dediği segmentler yeniden atlanır.

**Üretim:**
1. 100 farklı YouTube videosunda sponsor exemption işaretle
2. 101. videoda exemption ekle
3. 1. videonun exemption Map'ten düştüğünü gör
4. 1. videoya dön → eski işaretlemeler yok

**Etki:** Kullanıcı bilinçli tercihi sessizce kaybolur.

**Önerilen Düzeltme:** LRU eviction politika belgesinde açıkça belgelenmeli; UI tarafında kullanıcıya "Eski tercihler bu sınırı aştığı için kaldırıldı" bildirimi gösterilmeli.

**Öncelik:** **K** — Veri kaybı (kullanıcı bilinçli tercihi).

---

## YÜKSEK (Y) — 8 bulgu

### Y1. `hasConfiguredWatchOutput` partial format başarısında sonsuz kuyruk döngüsü

**Dosya:** `src/watch-folder.js:46-64`, kullanım: `src/main.js:1839, 1920, 1928`

```javascript
return normalized.formats.every((format) => {
  const exact = [stem, ...].map((name) => path.join(outputDir, `${name}.${format}`));
  if (exact.some(exists)) return true;
  if (!normalized.langSuffix) return false;
  const pattern = new RegExp(`^${escapedStem}\\.[a-z]{2,3}(?:-[a-z]{2,4})?\\.${format}$`, 'i');
  return entries.some((entry) => pattern.test(entry));
});
```

**Bulgu:** `every()` → eğer kullanıcı birden fazla format yapılandırmışsa (`srt,vtt,ass`) ve bunlardan biri başarısız olursa (örn. disk dolu, izin hatası), `hasOutput` false döner → dosya yeniden kuyruğa alınır. Sonraki taramada aynı format yine başarısız olur → sonsuz döngü.

**Etki:** Watch folder sonsuza dek aynı dosyayı işlemeye çalışır; CPU/IO tüketimi, log spam.

**Önerilen Düzeltme:**
```javascript
// En az bir format üretildiyse "hasOutput = true" kabul et.
// Eksik formatlar loglanır ama kuyruk tekrarı önlenir.
const produced = normalized.formats.filter((format) => { /* same probe */ });
if (produced.length === 0) return false;       // hiçbiri yok → tekrar dene
if (produced.length < normalized.formats.length) logOnce(`Format eksik: ${normalized.formats.filter(f => !produced.includes(f)).join(', ')}`);
return true;                                   // en az biri var → tamamlandı say
```

**Öncelik:** **Y** — Sonsuz döngü potansiyeli.

---

### Y2. `browser:command` zoom-set NaN fallback yanlış zoom hesaplıyor

**Dosya:** `src/main.js:13305-13312`

```javascript
const zoom = command === 'zoom-reset' ? 1
  : command === 'zoom-set' && Number.isFinite(requested) ? Math.max(0.5, Math.min(3, requested))
    : Math.max(0.5, Math.min(3, current + (command === 'zoom-in' ? 0.1 : -0.1)));
```

**Bulgu:** `value` undefined veya sayı olarak parse edilemiyorsa `Number.isFinite(requested) === false`. `zoom-set` komutu bu durumda else branch'ine düşer ve `current + (command === 'zoom-in' ? 0.1 : -0.1)` hesaplanır — yani zoom-set komutu zoom-in gibi davranır! Komutun "set" semantiği yok olur.

**Etki:** Yanlış zoom seviyesi, kullanıcı fark etmeden yakınlaştırma/uzaklaştırma tetiklenir.

**Önerilen Düzeltme:**
```javascript
if (command === 'zoom-set') {
  if (!Number.isFinite(requested)) return { ok: false, error: 'Geçersiz yakınlaştırma değeri.' };
  zoom = Math.max(0.5, Math.min(3, requested));
} else if (command === 'zoom-in' || command === 'zoom-out') {
  zoom = Math.max(0.5, Math.min(3, current + (command === 'zoom-in' ? 0.1 : -0.1)));
} else { /* zoom-reset */ }
```

**Öncelik:** **Y** — Komut semantiği bozuk.

---

### Y3. `decideSkip` çakışan kayıtlarda autoSkip=true önceliği yok

**Dosya:** `src/browser-skip-segments.js:57-60`

```javascript
const candidate = normalizeRecords(records)
  .filter(item => (item.scope === 'media' ? item.scopeKey === context.mediaKey
    : item.scopeKey === context.seriesKey) && time >= item.start && time < item.end)
  .sort((a, b) => a.end - b.end)[0] || null;
```

**Bulgu:** Sıralama yalnızca `end`'e göre yapılır. Eğer A=[0-30s, autoSkip=true] ve B=[5-25s, autoSkip=false] varsa ve kullanıcı 10. saniyede ise, B seçilir (end=25 < 30) → atlanmaz, A ise tercih edilmesi gerekirdi (kullanıcı bilinçli olarak "autoSkip atlanabilir intro" işaretlemiş).

**Önerilen Düzeltme:**
```javascript
.sort((a, b) => {
  if (a.autoSkip !== b.autoSkip) return a.autoSkip ? -1 : 1; // autoSkip önce
  return a.end - b.end;
})[0]
```

**Öncelik:** **Y** — Kullanıcının bilinçli tercihi yok sayılıyor.

---

### Y4. `decideSkip` `context.ended` / `scrubbing` / `buffering` flag'lerini dikkate almıyor

**Dosya:** `src/browser-skip-segments.js:65-66`

**Bulgu:** `shouldSkip` hesaplanırken:
- `context.ended === true` (video bitti) kontrolü yok — kullanıcı sona geldiğinde intro kaydı varsa yanlışlıkla başa sarar
- `context.scrubbing === true` (zaman çubuğu sürükleniyor) kontrolü yok — her `timeupdate`'te scrub sırasında skip tetiklenir
- `context.buffering === true` (video buffering) kontrolü yok

**Önerilen Düzeltme:**
```javascript
const shouldSkip = !!candidate?.autoSkip && !backwards
  && context.adPlaying !== true
  && context.ended !== true
  && context.scrubbing !== true
  && context.buffering !== true
  && suppressedId !== candidate.id
  && context.playing !== false;
```

**Öncelik:** **Y** — Garip UX, video sonu/scrubbing sırasında sıçrama.

---

### Y5. `applyBrowserSponsorSkip` video sonu kontrolü eksik

**Dosya:** `src/renderer/renderer.js:10012-10037` (`applyBrowserSponsorSkip`)

**Bulgu:** Sponsor segment tespit edildiğinde `applyBrowserSponsorSkip` çağrılır. `paused` kontrolü var ama `video.ended === true` veya `currentTime >= duration - 0.1` kontrolü YOK. Video sonu (örn. intro [0-5s], video 4.9 saniye) ile sponsor segment çakışıyorsa kullanıcı sona geldiğinde sponsor skip tetiklenip videoyu yeniden başa atabilir.

**Önerilen Düzeltme:**
```javascript
if (paused || mode === 'off' || player.browserSponsorTemporaryDisabled || player.browserAdPlaying
    || (player.abA !== null && player.abB !== null) || !player.browserSponsorSegments.length
    || !Number.isFinite(player.browserDuration) || player.browserDuration <= 0
    || (player.browserVideo?.ended ?? false)
    || (player.browserTime >= player.browserDuration - 0.5)) return false;
```

**Öncelik:** **Y** — Garip UX, kullanıcı videoyu bitiremez.

---

### Y6. `browser-translation-archive._saveIndex` orphan file birikimi

**Dosya:** `src/browser-translation-archive.js:222-242`

```javascript
this.fs.writeFileSync(temp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
this.fs.renameSync(temp, this.indexPath);
// Index atomik olarak yeni revizyona gectikten sonra yalniz ayni mantiksal
// kaydin eski dosyalarini ve yalniz arsiv kokunun icinde sil.
for (const field of ['jsonPath', 'displayPath']) {
  const relative = String(previous?.[field] || '');
  if (!relative || relative === entry[field]) continue;
  const target = path.resolve(this.rootDir, relative);
  ...
  try { if (this.fs.existsSync(target)) this.fs.unlinkSync(target); } catch (_) {}
}
```

**Bulgu:** Yeni index **ÖNCE** yazılır, sonra eski dosyalar silinir. Silme başarısız olursa (try/catch sessiz), orphan dosyalar diskte kalır. Index onları referans etmiyor, ama disk kullanımı sürekli artar. 1000 sayfa çevirisi güncellendiğinde 2000 orphan dosya birikebilir.

**Önerilen Düzeltme:**
1. Eski dosyaları **ÖNCE** sil (veya `.trash` alt klasörüne taşı)
2. Yeni dosyaları yaz
3. Index'i güncelle
4. Veya: başarısız silmeleri bir sonraki `_saveIndex` çağrısında telafi et

**Öncelik:** **Y** — Uzun süreli disk dolma riski.

---

### Y7. `browser:session:updateTab` trackRefs IPC validation eksik

**Dosya:** `src/main.js:13607-13650`

**Bulgu:** `raw.trackRefs` dizisi sınırlandırılmadan `normalizeSessionTab`'a geçiriliyor. `normalizeSessionTab` sonunda `.slice(0, MAX_TRACK_REFS)` uygular AMA her trackRef için `normalizeTrackRef` çağırılır. 1M trackRef içeren bir IPC mesajı → 1M `normalizeTrackRef` çağrısı (her biri String(), slice, vs.). `Object.assign(tab, { trackRefs: normalized.trackRefs, ... })` ise sonradan bounded listeyi alır.

Renderer'dan kötü amaçlı veya buggy bir IPC mesajı DoS yaratabilir.

**Önerilen Düzeltme:**
```javascript
const safeRaw = raw && typeof raw === 'object' ? raw : {};
const safeTrackRefs = Array.isArray(safeRaw.trackRefs) ? safeRaw.trackRefs.slice(0, 1000) : [];
const safeRecoveryJobs = Array.isArray(safeRaw.recoveryJobs) ? safeRaw.recoveryJobs.slice(0, 100) : [];
const normalized = normalizeSessionTab({
  ...safeRaw,
  trackRefs: safeTrackRefs,
  recoveryJobs: safeRecoveryJobs,
  id: tab.id,
  url: liveUrl || safeRaw.url || tab.restoredUrl,
});
```

**Öncelik:** **Y** — IPC DoS koruması.

---

### Y8. `browser:tab:setPinned` `rawId` tip doğrulaması yok

**Dosya:** `src/main.js:12740-12748`

```javascript
ipcMain.handle('browser:tab:setPinned', (event, rawId, pinned) => queueBrowserTabTransition(async () => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
  const tab = browserTabById(rawId);
  if (!tab) return { ok: false, error: 'Tarayıcı sekmesi bulunamadı.' };
  tab.pinned = !!pinned;
  ...
}));
```

**Bulgu:** `rawId` herhangi bir tipte olabilir (object, array, vb.). `browserTabById` → `normalizeBrowserTabId` → `String(value || '').trim()` → regex test. Çoğu geçersiz girişi reddeder AMA `pinned` parametresi doğrudan `!!pinned`'a gidiyor — boolean dönüşümü OK. Ancak `queueBrowserTabTransition` herhangi bir obje tipindeki `rawId`'i kuyruğa alabilir.

Daha ciddi sorun: `rawId` çok büyük bir string (1MB) olabilir → IPC kuyruğunda bellek yutar.

**Önerilen Düzeltme:**
```javascript
if (typeof rawId !== 'string' || rawId.length > 128) {
  return { ok: false, error: 'Geçersiz sekme kimliği.' };
}
```

Aynı kalıp `browser:tab:activate` (line 12730) ve `browser:tab:unload` (line 12792) için de geçerli.

**Öncelik:** **Y** — IPC validasyon eksikliği, defensive programming.

---

## ORTA (O) — 7 bulgu

### O1. `setPlayerHls` `preserveMediaState=true` iken `player.hlsQualityPreference` sıfırlanmıyor

**Dosya:** `src/renderer/renderer.js:16566-16568`

**Bulgu:** `setPlayerHls(..., preserveMediaState=true)` kullanıldığında `setMediaKey` çağrılmaz. Bu, manifest yenileme sırasında bilinçli olarak yapılır (yorumda açıklanmış). AMA `player.hlsQualityPreference = null` da atlanır — eski kalite tercihi sıfırlanmaz. Yeni manifest farklı kalite listesi gösteriyorsa, "Otomatik" yerine kullanıcının eski tercihi kullanılır.

**Önerilen Düzeltme:** `preserveMediaState` ile çağrılan yenilemede kalite tercihi de korunmalı (zaten öyle); yenilemede farklı liste gelirse kullanıcıya bilgi verilmeli.

**Öncelik:** **O**

---

### O2. `browser-translation-scheduler.setSentences` eski job'ları cancel etmiyor → bandwidth waste

**Dosya:** `src/browser-translation-scheduler.js:252-255`

```javascript
this.generation += 1;
this.failures.clear();
```

**Bulgu:** `setSentences` çağrıldığında sadece generation artırılır ve `failures.clear()` edilir. AMA mevcut `pending` ve `inFlightByCacheKey` job'ları cancel EDİLMEZ. Bu job'lar hâlâ HTTP istekleri yapıyor — bandwidth israfı + provider API quota tüketimi + sonuçlar generation mismatch ile yoksayılsa bile provider'a ödeme yapılır.

`cancelAll` çağrılsa `controller.signal.aborted = true` olur ve `try/catch` ile fetch iptal edilir.

**Önerilen Düzeltme:** `setSentences` ilk satırında `this.cancelAll('Yeni cümleler geldi')`.

**Öncelik:** **O** — Bandwidth/API quota israfı.

---

### O3. `browser-overlay-controller` LRU eviction bilgilendirme mesajı yok (R69 düzeltmesinin devamı)

**Dosya:** `src/browser-overlay-controller.js` (LRU tahliyesi R69'da eklendi)

**Bulgu:** R69 düzeltmesi ile LRU eviction eklendi ama eviction olduğunda kullanıcıya log/feedback YOK. Kullanıcı "neden bu overlay beklediğim gibi davranmıyor?" diye düşünür.

**Önerilen Düzeltme:**
```javascript
if (evicted.length) logLine(`${evicted.length} eski overlay gözlemcisi kaldırıldı (limit: 128)`, 'info');
```

**Öncelik:** **O** — UX, kullanıcı farkındalığı.

---

### O4. `loadSubtitle` aynı mediaKey için farklı dosya yüklenirse undo/redo history kayboluyor

**Dosya:** `src/renderer/renderer.js:17041-17044`

```javascript
if (previousPrimaryPath && previousPrimaryPath !== path) {
  player.cueEditUndo = [];
  player.cueEditRedo = [];
  updateCueEditHistoryButtons();
}
```

**Bulgu:** Aynı video için farklı dilde altyazı yüklenirse (örn. `film.en.srt` → `film.tr.srt`), undo/redo stack'leri sıfırlanır. Kullanıcı İngilizce altyazıda 5 düzenleme yaptıysa ve Türkçe'ye geçtiğinde undo yapamaz. Doğru davranış muhtemelen "farklı dosya = farklı history" — ama UX tarafında kullanıcıya bilgi verilmiyor.

**Önerilen Düzeltme:** Subtitle değişiminde undo history "mediaKey+path" bazlı ayrı tutulmalı; veya kullanıcıya bilgi verilmeli.

**Öncelik:** **O** — UX, undo beklentisi.

---

### O5. `scanWatchFolder` her 5 saniyede senkron `readdirSync` çağırıyor → ana süreç bloklaması

**Dosya:** `src/main.js:1800-1810, 1937`

```javascript
watchTimer = setInterval(scanWatchFolder, WATCH_INTERVAL);
```

**Bulgu:** `scanWatchFolder` her 5 saniyede `fs.readdirSync(watchDir)` ve alt klasörler için de `fs.readdirSync` çağırır (senkron). 10K dosyalık klasörde 100-500ms blok. Ana süreç IPC'leri bu sürede bekler. Watch klasörü büyükse (ör. tüm film koleksiyonu tek klasörde) kullanıcı "uygulama donuyor" deneyimi yaşar.

**Önerilen Düzeltme:** `fs.promises.readdir` (async) kullan, veya klasör büyüklüğüne göre interval uzat.

**Öncelik:** **O** — Performans, ana süreç bloklaması.

---

### O6. `browser-overlay-controller` LRU eviction disconnect eksik olabilir

**Dosya:** `src/browser-overlay-controller.js`

**Bulgu:** LRU eviction'da `observer.disconnect()` çağrılıp çağrılmadığı doğrulanmalı. Eğer eviction disconnect'i atlarsa, GC tarafından observer'a bağlı DOM referansları temizlenmez → memory leak. R69'da düzeltildiği varsayılıyor ama runtime doğrulaması yok.

**Önerilen Düzeltme:** Test ekleme:
```javascript
// test: evict 129 gözlemci, 1. gözlemcinin disconnect() çağrıldığını doğrula
```

**Öncelik:** **O** — Önceki rapor ile bağlantılı, defensive.

---

### O7. `pdf:translatePages` `pdfTranslationJobs.has` + `set` race (gelecekte await eklenirse latent)

**Dosya:** `src/main.js:14798-14801`

```javascript
if (pdfTranslationJobs.has(document.pdfHash)) return { ok: false, busy: true, ... };
...
const job = { controller: new AbortController(), schedulers: new Set() };
pdfTranslationJobs.set(document.pdfHash, job);
```

**Bulgu:** Şu anda synchronous, ama ileride `await` eklenirse (hazırlık adımları için) race koşulu açığa çıkar. İki eşzamanlı `pdf:translatePages` çağrısı iki ayrı job oluşturur ve birinin reference'ı kaybolur.

**Önerilen Düzeltme:** Atomic check-and-set veya Map'in `get` ile başlat mantığı:
```javascript
let job = pdfTranslationJobs.get(document.pdfHash);
if (job) return { ok: false, busy: true, job };
job = { controller: new AbortController(), schedulers: new Set() };
pdfTranslationJobs.set(document.pdfHash, job);
```

**Öncelik:** **O** — Önleyici düzeltme.

---

## DÜŞÜK (D) — 7 bulgu

### D1. `installYoutubeStreamHeaders` CORS başlığı `Access-Control-Allow-Origin: *` + `Allow-Headers: *` çok geniş

**Dosya:** `src/main.js:2860-2875`

**Bulgu:** Hem `ACAO: *` hem `ACAH: *` ayarlanıyor. Sadece googlevideo için geçerli olsa da, gelecekte bu mekanizma başka origin'leri kapsayacak şekilde genişletilirse güvenlik riski oluşur. Ayrıca `Cross-Origin-Resource-Policy` her zaman siliniyor — eğer bir sayfa CORP ile korunuyorsa, bu kaldırma istenmeyen olabilir.

**Önerilen Düzeltme:** Yorum satırında "bilinçli olarak geniş, yalnızca googlevideo için" uyarısı korunsun; gelecekte `ACAO: 'https://www.youtube.com'` yapılabilir.

**Öncelik:** **D** — Bilinçli tasarım kararı, dökümante edilmeli.

---

### D2. `browserNote` periyodik autosave interval yok → 30 günlük taslaklar birikir

**Dosya:** `src/renderer/renderer.js` (ara: `setInterval(cleanNoteDrafts`)

**Bulgu:** `cleanNoteDrafts` sadece `readNoteDraft`/`writeNoteDraft` çağrıldığında çalışır. Uzun süre not düzenlemesi yapılmazsa eski taslaklar silinmez. `NOTE_DRAFT_MAX_AGE_MS = 30 gün` — bu süre sonunda otomatik temizlik yok.

**Önerilen Düzeltme:**
```javascript
// index.html veya renderer.js init'te
setInterval(cleanNoteDrafts, 60 * 60 * 1000); // saatlik
```

**Öncelik:** **D** — Temizlik eksikliği, lokal storage şişmesi.

---

### D3. `pdf:export` HTML escape fonksiyonu inline

**Dosya:** `src/main.js:14843-14847`

**Bulgu:** `escapeHtml` fonksiyonu her export çağrısında yeniden tanımlanıyor. Tekrar kullanılabilir utility olarak `src/util/html.js`'e taşınabilir.

**Öncelik:** **D** — Code organization.

---

### D4. `cleanNoteDrafts` exceptions tamamen yutuluyor

**Dosya:** `src/renderer/renderer.js:13155`

```javascript
} catch (_) {}
```

**Bulgu:** Temizlik sırasında herhangi bir hata olursa (quota exceeded, parse error) sessizce yutulur.

**Önerilen Düzeltme:**
```javascript
} catch (error) { console.warn('Note draft cleanup failed:', error); }
```

**Öncelik:** **D** — Diagnostic.

---

### D5. `player.cueEditUndo` boyut sınırı 100, ama her entry büyük olabilir

**Dosya:** `src/renderer/renderer.js:21674`

```javascript
player.cueEditUndo = player.cueEditUndo.slice(-100);
```

**Bulgu:** 100 entry × bulk file içerikleri (her dosya 100KB+) = 10MB+ RAM. Sınır 100 yerine 20 olmalı veya toplam byte sınırı konmalı.

**Öncelik:** **D** — Bellek optimizasyonu.

---

### D6. `browserAssetStore.safeMeta` `language` alanında validation yok

**Dosya:** `src/browser-asset-store.js:65-83`

```javascript
language: String(raw.language || '').toLowerCase().slice(0, 24),
```

**Bulgu:** `raw.language` bir sayı ise (`5`), `String(5) = '5'` olarak saklanır. ISO 639-1 standardı kontrolü yok. Browser subtitle provider'dan gelen yanlış formatlı language tag'i (örn. `en_US_POSIX`) olduğu gibi saklanır.

**Önerilen Düzeltme:**
```javascript
const lang = String(raw.language || '').toLowerCase().slice(0, 24);
const validLang = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/.test(lang) ? lang : '';
```

**Öncelik:** **D** — Veri kalitesi.

---

### D7. `safeFilterRule` `gizlendi` placeholder tutarsız dili

**Dosya:** `src/browser-adblock.js:48`

**Bulgu:** Filter rule redaction'da `[gizlendi]` kullanılıyor. Diğer redaction'larda `[redakte edildi]` veya `[gizli]` kullanılıyor olabilir.

**Öncelik:** **D** — Görsel tutarlılık.

---

## TEST KAPSAMASI TESPİT EDİLEN BOŞLUKLAR

Mevcut testler (`tests/*.test.js` — 223 dosya) şu alanları kapsıyor:
- `browser-subtitles`, `browser-adblock`, `browser-manga`, `browser-skip-segments` ✓
- `pdf-translate`, `settings-security`, `popup-auth-protocol-security` ✓
- `report63-ssrf-observer`, `report63-secret-redaction` (R69 düzeltmeleri) ✓
- `report67-smarttube-wiring`, `report70-youtube-oauth` (R67/R70 düzeltmeleri) ✓
- `report64-address-listbox`, `report64-contrast` (R64 düzeltmeleri) ✓
- `report73-player-ab-search` (zaten var) ✓

Tespit edilen **kapsam boşlukları** (test yok):

| Bulgu | Test Adı Önerisi |
|-------|-------------------|
| K1 cleanNoteDrafts | `tests/browser-note-storage-cleanup.test.js` |
| K2 setPlayerHls listener | `tests/hls-recovery-listener-cleanup.test.js` |
| K3 portableSessionTab DoS | `tests/browser-session-package-import-bound.test.js` |
| K4 sponsor exemption LRU | `tests/browser-sponsor-exemption-eviction.test.js` |
| Y1 watch-folder partial format | `tests/watch-folder-partial-completion.test.js` |
| Y2 zoom-set NaN | `tests/browser-command-zoom-validation.test.js` |
| Y3-Y4 decideSkip priority | `tests/browser-skip-segments-priority.test.js` (kısmen var) |
| Y5 applyBrowserSponsorSkip ended | `tests/browser-sponsor-skip-ended.test.js` |
| Y6 translation-archive orphans | `tests/browser-translation-archive-orphan.test.js` |
| Y7 updateTab trackRefs DoS | `tests/browser-session-updateTab-dos.test.js` |
| Y8 setPinned rawId validation | `tests/browser-tab-pinned-validation.test.js` |
| O2 setSentences bandwidth | `tests/browser-translation-scheduler-bandwidth.test.js` |
| O5 watch scan blocking | `tests/watch-folder-scan-blocking.test.js` |

---

## ÖZET TABLOSU

| # | Seviye | Dosya:Satır | Bulgu |
|---|--------|-------------|-------|
| K1 | K | renderer.js:13139-13153 | cleanNoteDrafts backward iter + removeItem → not taslağı kaybolabilir |
| K2 | K | renderer.js:16714-16725 | HLS yenileme sonrası loadedmetadata listener sızıntısı |
| K3 | K | browser-session-package.js:145-150 | portableSessionTab import tabs array DoS |
| K4 | Y | renderer.js:2148-2152 | sponsor exemption LRU sessiz veri kaybı |
| Y1 | Y | watch-folder.js:46-64 + main.js:1839 | partial format → sonsuz kuyruk |
| Y2 | Y | main.js:13305-13312 | zoom-set NaN fallback yanlış zoom |
| Y3 | Y | browser-skip-segments.js:57-60 | decideSkip autoSkip önceliği yok |
| Y4 | Y | browser-skip-segments.js:65-66 | ended/scrubbing/buffering kontrolü eksik |
| Y5 | Y | renderer.js:10012 | applyBrowserSponsorSkip video.ended eksik |
| Y6 | Y | browser-translation-archive.js:222-242 | _saveIndex orphan file birikimi |
| Y7 | Y | main.js:13607-13650 | updateTab trackRefs DoS (raw.slice eksik) |
| Y8 | Y | main.js:12740-12748 | setPinned rawId tip validation yok |
| O1 | O | renderer.js:16566-16568 | hlsQualityPreference preserveMediaState'te sıfırlanmıyor |
| O2 | O | browser-translation-scheduler.js:252-255 | setSentences eski job'ları cancel etmiyor |
| O3 | O | browser-overlay-controller.js | LRU eviction log/feedback yok |
| O4 | O | renderer.js:17041-17044 | subtitle değişiminde undo history kayıp |
| O5 | O | main.js:1800-1810 | scanWatchFolder sync readdir ana süreç bloklar |
| O6 | O | browser-overlay-controller.js | LRU disconnect doğrulama eksik |
| O7 | O | main.js:14798-14801 | pdfTranslationJobs latent race |
| D1 | D | main.js:2860-2875 | CORS başlığı çok geniş (bilinçli tasarım) |
| D2 | D | renderer.js (ara) | cleanNoteDrafts periyodik interval yok |
| D3 | D | main.js:14843-14847 | pdf:export escapeHtml inline |
| D4 | D | renderer.js:13155 | cleanNoteDrafts exception swallowing |
| D5 | D | renderer.js:21674 | cueEditUndo toplam boyut sınırı yok |
| D6 | D | browser-asset-store.js:65-83 | safeMeta.language ISO 639 validation yok |
| D7 | D | browser-adblock.js:48 | safeFilterRule placeholder tutarsız dili |

**Toplam: 4 Kritik + 8 Yüksek + 7 Orta + 7 Düşük = 26 yeni bulgu + 13 test kapsamı boşluğu.**

---

## ÖNERİLEN ÖNCELİKLENDİRİLMİŞ AKSİYON PLANI

1. **K1, K2** — Veri kaybı ve kullanıcı deneyimi bozulması (1 PR, ~2-3 saat)
2. **K3, K4** — DoS ve veri kaybı (1 PR, ~2 saat)
3. **Y1-Y5** — Edge case ve performans (1-2 PR, ~4-6 saat)
4. **Y6-Y8** — Validation ve temizlik (1 PR, ~2 saat)
5. **O\*, D\*** — Polish sprint (1 PR, ~2-3 saat)
6. **Test kapsamı** — 13 yeni test dosyası (1 PR, paralel PR olarak)

---

## DOĞRULANMAMIŞ BULGULAR

Aşağıdaki bulgular kod okumasından çıkarıldı ancak runtime'da doğrulanmadı (test ortamı yok):
- Y6 orphan file birikimi — gerçek disk kullanımı ölçülmedi
- O5 scanWatchFolder ana süreç bloklaması — gerçek dosya sayısı test edilmedi
- K1'in pratik sıklığı — yalnızca 50+ taslak biriktiğinde ortaya çıkar
- K2'nin gerçek sıklığı — yalnızca HLS yenileme + kullanıcı navigasyon yarışı durumunda

Doğrulama için Playwright/electron e2e testleri ve uzun süreli profiling gerekli.

---

## BU RAPOR NEREYE KAYIT EDİLDİ

Bu rapor `BROWSER_BUG_REPORT_73.md` (kök dizin) olarak kaydedildi. Kullanıcının orijinal talebi `BROWSER_BUG_REPORT_69.md` istemişti; ancak o dosya kök dizinde izlenmiş R69 audit raporu olarak zaten mevcut. Üzerine yazmak o raporu yok edeceği için R73 numarası seçildi (`tests/report73-player-ab-search.test.js` ile tutarlı). Eğer kullanıcı dosya adı R69 olsun isterse: bu rapor içeriği `BROWSER_BUG_REPORT_69.md`'a taşınır, eski R69 audit raporu `BROWSER_BUG_REPORT_69_audit_2026-09-18.md`'e taşınır. Tek komutla yapılabilir.

**Push yapılmadı** — salt-okunur çalışma. Commit/push kararı kullanıcı talimatına bağlıdır.

---

# DOĞRULAMA TURU (2026-09-19, ikinci oturum)

Yukarıdaki 36 bulgu kaynakta tek tek doğrulandı; ayrıca aynı oturumda bağımsız
denetimle 4 ek bug bulundu ve düzeltildi. Sonuç: **3 gerçek bug + 4 ek bug
düzeltildi**, 16 bulgu yanlış pozitif/tasarım olarak elendi, kalan O/D
maddeleri polish düzeyinde.

## DOĞRULANAN VE DÜZELTİLENLER

| # | Bulgu | Doğrulama | Düzeltme | Test |
|---|-------|-----------|----------|------|
| K5 | `zoom-set` geçersiz `value`'da else dalına düşüp `current - 0.1` uyguluyor — "set" komutu zoom-OUT gibi davranıyor | **GERÇEK** — `main.js:13309` | Geçersiz değerde `{ok:false}` dönüyor | R73-06 |
| K4 | `browserQuickHistory` dirty editörde sessiz no-op — undo/redo "bozuk" görünüyor | **GERÇEK** (şiddet: O, K değil) — `renderer.js:21690` | Dirty'de status mesajı: "Kaydedilmemiş değişiklikler var — önce kaydedin veya 'Taslağı sil' ile geri alın." | R73-05 |
| Y1 | `decideSkip` çakışan kayıtlarda yalnız end-sıralı — kısa autoSkip'siz kayıt geniş autoSkip bölgesini gölgeliyor | **GERÇEK** — `browser-skip-segments.js:61` | Sıralama `autoSkip` önce, sonra end | `browser-skip-segments.test.js` genişletildi |
| R73-E1 | Native A-B: seek tamamlanan `timeupdate` `seeked`'den ÖNCE gelir — B ötesi atlama "kesiş" sanılıp A'ya sarılıyordu | **GERÇEK** (kendi bulgum) — `renderer.js:20589` | `video.seeking` koruması + `seeked`'de `_abPrevT` güncellemesi | R73-02a-d |
| R73-E2 | Browser A-B: kullanıcı/site seek'i B ötesine inerken döngüleniyordu; sabit 4.5s eşiği de 4x hızda doğal ilerlemeyi seek sanıyordu | **GERÇEK** (kendi bulgum) — `renderer.js:10076` | `_ownSeekAt` işareti + hıza ölçekli `naturalStep` + `browserAdPlaying` koruması + `resetMediaBoundState`'te sıfırlama | R73-01a-f |
| R73-E3 | `player.lastT` altyazı-zamanında saklanıp `+player.offset` geri çevriliyordu — offset değişiminde "önceki konum" delta kadar kayıyordu | **GERÇEK** (kendi bulgum) — `renderer.js:12700` | `lastT` video-zamanında saklanıp doğrudan geçiliyor | R73-03 |
| R73-E4 | `stSelectSection` uçuştaki arama isteğini düşürmüyordu — bölüm değişince geç dönen sonuç gizli grid'e yazabiliyordu | **GERÇEK** (kendi bulgum) — `renderer.js:22406` | `stSearchSeq++` ile kuşak geçersizleştirme | R73-04 |

## YANLIŞ POZİTİFLER (elde edildi — düzeltme YAPILMADI)

| # | İddia | Neden yanlış |
|---|-------|--------------|
| K1 / Y10 | `loadedmetadata` listener sızıntısı → eski `at` ile seek | Listener içinde `staleGeneration(gen)` + `player.hls !== refreshedHls` koruması var; yeni medya kuşağı değiştirir → seek engellenir. Listener ilk metadata'da kendini kaldırır — kalıcı sızıntı değil. |
| K2 | `trackRefs` assetId validation eksik → lokal dosya numaralandırma | `assetId` `^([a-f0-9]{24}):([a-f0-9]{32})$` formatına kilitli; yollar yalnız `rootDir/<hash>/<hash>.{json,srt}` — traversal yok. Yetkili parça listesi watch-index (`listTracks`); session export eksik ref'i oradan telafi eder. |
| K3 | `cleanNoteDrafts` backward-iter + removeItem → eleman atlama | Geriye iterasyon silmeyle GÜVENLİDİR: indeks `i`'de silince `i`'den sonraki öğeler kayar ama onlar zaten işlendi; `i-1` etkilenmez. Raporun önerdiği "önce topla" eşdeğerdir. |
| Y2 | `applyBrowserSponsorSkip` video-sonu kontrolü yok | Video sonunda `paused=true` olur; en üstteki `paused` koruması yakalar. |
| Y3 | İlk `decideSkip` çağrısında segment içindeysen yanlış skip | Bilinçli tasarım: `autoSkip` kullanıcı opt-in'i; mevcut test (`browser-skip-segments.test.js:29-30`) ilk-çağrı atlamayı açıkça bekliyor. SponsorBlock da aynı davranır. |
| Y4 | `scrubbing`/`buffering` context yok | `manualSeek` bayrağı geri sarmayı bastırmak için var; ileri seek ile segmente girişte autoSkip'in ateşlemesi istenen davranış. Browser modunda sürükleme durumu yok — seek'ler ayrık komutlar. |
| Y5 | Kısmi format başarısında sonsuz kuyruk | `prev.queued` bayrağı `advanceWatchStability`'de erken dönüş yapar — dosya asla yeniden kuyruğa girmez. Gerçek (marjinal) boşluk tersi: kısmi çıktılı dosya sessizce atlanır, retry yok. |
| Y6 | `pdfTranslationJobs` has+set yarışı | `has`(14802) → `set`(14811) arası tamamen senkron; await yok → JS tek iş parçacığında atomik. |
| Y7 | `setSentences` eski job'ları cancel etmiyor | `setSentences` ilk satırında `cancelAll('Kaynak altyazı değişti.')` çağırıyor (`browser-translation-scheduler.js:251`) — raporun önerdiği düzeltme zaten mevcut. |
| Y8 | Sponsor exemption Map sınırsız büyüme | `normalizeBrowserSponsorExemptions` her persist'te 100 medya anahtarı / anahtar başına 200 id ile sınırlıyor. |
| Y9 | `trackRefs` array sınırsız | `normalizeSessionTab`'de `.slice(0, MAX_TRACK_REFS)` var (`browser-session-store.js:184`). |
| Y11 | `safeFilterRule` `domain=` redaksiyonu eksik | Filtre kuralları herkese açık liste kuralları; `domain=` seçeneği domain adı taşır, kimlik bilgisi değil. Sırlar `?param=`/`bearer` desenleriyle zaten redakte ediliyor. |
| O5 | Session paketi tabs bounds eksik | İçe aktarım 64 MB dosya sınırlı + tek-geçiş iterasyon + kullanıcı diyaloğu ile tetiklenir. |
| O6 | `safeMeta` language validation yok | `toLowerCase().slice(0,24)` normalize — eşleştirme metni, yürütülebilir değil. |
| O11 | `beginRecovery` token guard eksik | `isCurrent` `!!token` ile koruyor (`hls-recovery.js:85`). |

## KAPSAM DIŞI / DOĞRULANAMAYAN

- **O1-O12, D1-D8** kalan maddeler polish düzeyi (status metinleri, yardımcı
  organizasyonu, küçük tutarsızlıklar); rapor çoğu için dosya:satır vermedi.
  Doğrulanabilir olanlar (O5, O6, O11) yanlış pozitif çıktı.
- Ajan tabanlı denetim: bu oturumda 14 ajan görevlendirildi; 9'u oturum
  yenilenmesiyle, 5'i rate-limit ile kaybedildi. Doğrulama tamamen kaynak
  okuması + davranışsal regresyon testleriyle yapıldı.

## TEST KANITI

- `tests/report73-player-ab-search.test.js` — **14/14** davranışsal test:
  browser A-B (doğal kesiş, kendi seek'i, site seek'i, 4× hız, reklam),
  native A-B (seeking/seeked/kaçış), lastT video-zamanı, stSelectSection
  kuşak düşürme, quick-history geri bildirimi, zoom-set NaN.
- `tests/browser-skip-segments.test.js` — Y1 overlap regresyonları eklendi; geçti.
- `node --check src/renderer/renderer.js src/main.js src/browser-skip-segments.js` — temiz.
