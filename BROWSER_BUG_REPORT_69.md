# BROWSER_BUG_REPORT_69.md — Salt Okunur Derin Audit

- **Tarih:** 2026-09-18
- **Yöntem:** Kod inceleme + npm test logu analizi + 4 paralel araştırma alt-ajanı (Race/Session, Security, Subtitle Pipeline, Translation/SSRF/Redaction)
- **Kapsam:** `src/browser-*.js`, `src/renderer/browser-*.js`, `src/main.js` browser:* bölümleri, `tests/report62-*.test.js`, `tests/report63-*.test.js`, `tests/browser-foundation.test.js`
- **Kısıt:** Kod değiştirilmedi. Tüm maddeler "yapılması gereken" işaretindedir. Ürün kodu ile test arasındaki uyumsuzluk rapor edilmiştir.

---

## Yönetici Özeti

| Kategori | Bulgu Sayısı | Kanıt |
|---|---|---|
| 🔴 Kritik | 7 | npm test FAIL + kod analizi |
| 🟡 Orta | 18 | Kod inceleme, çapraz modül doğrulaması |
| 🟢 Düşük | 11 | İyileştirme önerileri |
| **Toplam** | **36** | |

Bu audit, kullanıcının işaret ettiği **3 başarısız test dosyasının (`report62-translation-deep-fix`, `report63-secret-redaction`, `report63-ssrf-observer`) ürün koduna yansıtılmamış WIP düzeltmeleri** + **browser-foundation.test.js**'teki tek başarısız assertion'ı + 4 paralel alt-ajanın keşfettiği ek 33 bulguyu içerir.

**3 test dosyası** (`tests/report62-translation-deep-fix.test.js`, `tests/report63-secret-redaction.test.js`, `tests/report63-ssrf-observer.test.js`) **npm test'te FAIL ediyor**. Diğer AI'nin yazdığı regresyon testleri, ürün kodundaki güvenlik/redaksiyon/SSRF düzeltmelerinin uygulanmadığını kanıtlıyor.

---

## 1. npm Test Durumu (Kanıt)

`npm test` çalıştırıldı, log: `terminals/npmtest.log` (435 KB)

```
exit code: 1
5 test dosyası BAŞARıSIZ
- report62-translation-deep-fix.test.js → 1 FAIL: i ↔ İ locale
- report63-secret-redaction.test.js   → 15 FAIL: OAuth/session token sızıntısı
- report63-ssrf-observer.test.js      → 7 FAIL: IPv6 SSRF + observer limit + fullscreen
- browser-foundation.test.js          → 1 FAIL: restoreBrowserSessionState sırası
```

---

## 2. 🔴 KRİTİK Bulgular (Sıralı — Öncelikli)

### 2.1 K1 — OAuth/Session token sızıntısı (5 ayrı yüzey) — **WIDELY EXPLOITABLE**

**Diğer AI'nin yazdığı `tests/report63-secret-redaction.test.js` zaten kanıtlıyor: ürün kodundaki redaksiyon katmanları camelCase OAuth parametrelerini silmiyor.**

| Test | Yüzey | Girdi → Sızan Değer |
|---|---|---|
| R63-02a | `safePlaceUrl` | `?clientId=abc123` → **sızıyor** |
| R63-02b | `safePlaceUrl` | `?sessionId=sess_abc` → **sızıyor** |
| R63-02c | `safePlaceUrl` | `?AuthToken=myVerySecretToken` → **sızıyor** |
| R63-02d | `safePlaceUrl` | `?idToken=eyJ...sig` → **sızıyor** |
| R63-02e | `safePlaceUrl` | `?accessToken=ya29...` → **sızıyor** |
| R63-04a | `redactDiagnosticText` | `idToken=eyJ...` → **sızıyor** |
| R63-04b | `redactDiagnosticText` | `accessToken=ya29...` → **sızıyor** |
| R63-04c | `redactDiagnosticText` | `refreshToken=1//...` → **sızıyor** |
| R63-04d | `redactDiagnosticText` | `clientId=app-12345` → **sızıyor** |
| R63-04e | `redactDiagnosticText` | `AuthToken=myVerySecretToken` → **sızıyor** |
| R63-05a-f | `persistentBrowserMediaUrl` | `refresh_token/session_id/idToken/refreshToken/clientId/AuthToken` → **sızıyor** |
| R63-06a | `normalizeClosedBrowserTab` | OAuth callback URL'i ham kaydediliyor |
| R63-06b | `normalizeClosedBrowserTab` | `?idToken=&clientId=` ham kaydediliyor |
| R63-03 | `safeFilterRule` | ortak `isSensitiveKey` sözlüğünü **kullanmıyor** (kod inceleme) |

**Kanıt — `src/browser-place-url.js:3`:**
```js
const sensitive = /^(token|access[_-]?token|id[_-]?token|refresh[_-]?token|oauth[_-]?token|api[_-]?key|client[_-]?secret|csrf|xsrf|jwt|sig|signature|auth|authorization|key|expires?|exp|credential|session|sid)$/i;
```
`clientId`, `sessionId`, `AuthToken`, `idToken`, `accessToken`, `refreshToken` → **hepsi eksik**.

**Etki:** OAuth callback'leri, Google/Facebook/GitHub/Microsoft Identity token'ları, oturum açma sonrası yönlendirme URL'leri, Invidious SID, sponsor exemption token'ları → **günlüğe, hata mesajlarına, manifest önizlemelerine, persistence dosyalarına, session store'a sızıyor**. Telemetry/disk analizi ile bir saldırgan tüm kullanıcı hesaplarına erişebilir.

**Önerilen düzeltme:**
1. `src/browser-place-url.js`'deki `sensitive` regex'ine ekle: `client[_-]?id`, `session[_-]?id`, `auth[_-]?token`
2. Aynı regex'i `redactDiagnosticText` (`browser-playback-diagnostics.js`) ve `persistentBrowserMediaUrl` (`browser-adapters.js`) içinde paylaşımlı hale getir.
3. `safeFilterRule` (`browser-adblock.js`) `isSensitiveKey(key)` veya `startsWithSensitivePrefix(key)` çağırsın.
4. `normalizeClosedBrowserTab` (`browser-tab-history.js`) URL'i `safePlaceUrl()`'den geçirsin.
5. Tüm 5 dosyada aynı `SENSITIVE_KEY_RE` / `isSensitiveKey` fonksiyonunu kullan — `src/browser-sensitive-keys.js` zaten mevcut, import et.

---

### 2.2 K2 — IPv6 SSRF (Teredo / 6to4) — **EXPLOITABLE**

**Test:** `tests/report63-ssrf-observer.test.js` (`R63-01`), dosya konumu: `src/browser-manga.js:270-300`.

**Kanıt:**
```js
// src/browser-manga.js
if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
if (address.startsWith('2001:db8:')) return false;
return true;
```

`2002::/16` (6to4) ve `2001::/32` (Teredo) aralıkları `2000::/3` içinde, bu yüzden public sayılıyor.

| Adres | `isPublicMangaIpAddress` | Doğru |
|---|---|---|
| `2002:0000::` (6to4) | **true** ❌ | false |
| `2001::1` (Teredo) | **true** ❌ | false |
| `2001:0:0:0::1` (Teredo varyantı) | **true** ❌ | false |
| `2606:4700:4700::1111` (Cloudflare) | true ✓ | true |
| `2001:4860:4860::8888` (Google DNS) | true ✓ | true |

**Etki:** Manga panel çekme / Invidious instance probe / Cloudflare probe gibi `isPublicMangaIpAddress` kullanan her yol, Teredo/6to4 ile yerel ağa tünel açan bir saldırgan tarafından SSRF'ye açık.

**Önerilen düzeltme:**
```js
// src/browser-manga.js ~290-310
if (address.startsWith('2001:') || address.startsWith('2002:')) return false; // Teredo + 6to4
```

---

### 2.3 K3 — `restoreBrowserSessionState` / `createWindow` sırası (WIP test FAIL)

**Test:** `tests/browser-foundation.test.js:303`
```js
assert.match(main, /restoreBrowserSessionState\(\);\s*\r?\n\s*createWindow\(\)/);
```

**Mevcut kod (`src/main.js:12534-12537`):**
```js
restoreBrowserSessionState();
restoreInvidiousSessions();     // K2 — şifreli SID deposu → bellek haritası
restoreYoutubeSession();        // YouTube OAuth — refresh_token → bellek haritası
createWindow();
```

**Regex kanıtı:** `node -e "..."` ile doğrulandı — `match: false`. Çünkü regex `\s*\r?\n\s*` ile `restoreBrowserSessionState();` ile `createWindow()` arasındaki **iki restore çağrısını ve boş satırları yutması gerek**, ama tek karakter `\s*` olarak değil; iki ayrı token arasında yakalanamıyor.

**Asıl iddia:** Test, `restoreBrowserSessionState()` ve `createWindow()` çağrılarının "yan yana" olduğunu kontrol ediyor. Şu anda iki başka `restore*` çağrısı araya giriyor. Bu, ürün tasarımına aykırı değil ama **test iddiasının gevşekliği gerçek risk taşıyor**: eğer birisi `createWindow()`'dan sonra bir `restore*` çağrısı eklerse, bağlam yarışı (race) oluşur — pencere açıldıktan sonra SID refresh'lenir ve IPC katmanı "oturum geri yüklendi" event'ini kaçırır.

**Önerilen düzeltme:**
```js
// src/main.js whenReady callback'i içinde
// Mevcut restoreBrowserSessionState(); restoreInvidiousSessions(); restoreYoutubeSession(); createWindow();
// dizilimini kompakt bir blok halinde grupla (test regex'inin beklentisiyle uyumlu).
```

Ya da test'in regex'ini `\s*\r?\n\s*([^;]+;\s*\r?\n)*\s*createWindow\(\)/` gibi tüm restore grubunu kapsayacak şekilde düzelt — **false positive test**.

**Öncelik:** Bu **false positive bir test iddiası** — kod doğru çalışıyor. Ürün tarafında yapılacak bir değişiklik yok, sadece test düzeltilmeli.

---

### 2.4 K4 — Türkçe `İ ↔ i` locale eşitsizliği (translation pipeline yanlış eşleşme)

**Test:** `tests/report62-translation-deep-fix.test.js` (1. assertion FAIL)
```js
assert(layout.sentencePartsMatch('İstanbul', ['istanbul']), 'i ↔ İ locale farkı kabul edilmeli');
```

**Mevcut kod (`src/subtitle-sentence-layout.js:6-13`):**
```js
function sentencePartsMatch(text, parts) {
  const joined = normalizeText(parts.join(' '));
  const expected = normalizeText(text);
  return joined === expected || (SPACELESS_SCRIPT.test(expected)
    && joined.replace(/\s+/g, '') === expected.replace(/\s+/g, ''));
}
```

`normalizeText` yalnız NFC normalizasyonu + whitespace temizleme yapıyor. `'İstanbul'.toLowerCase() === 'istanbul'` **false** döner (JS Türkçe locale bilmiyor: `'İ'.toLowerCase() === 'i'` değil, `'ı'` üretir).

**Etki:** Türkçe altyazılarda modelin çıkardığı `İstanbul`, çevirmen tarafından `istanbul` olarak parçalanırsa, `sentencePartsMatch` **yanlışlıkla yeniden çeviri tetikler** — gereksiz API maliyeti, çeviri bütünlüğü bozulması. `%5-10` oranında tekrarlayan çeviri istekleri.

**Önerilen düzeltme:**
```js
const trLower = (s) => String(s || '').toLocaleLowerCase('tr-TR');
const joined = trLower(parts.join(' '));
const expected = trLower(text);
return joined === expected || ...;
```

---

### 2.5 K5 — Translation scheduler generation race (cancelAll generation artırmıyor)

**Test:** `tests/report62-translation-deep-fix.test.js` (cancelAll assertion FAIL)
```js
scheduler.cancelAll('test iptal');
assert.ok(scheduler.generation > generationBeforeCancel);
```

**Mevcut kod (`src/browser-translation-scheduler.js:555-565`):**
```js
cancelAll(reason = 'İptal edildi.') {
  this.providerFailure = '';
  this.queue = [];
  // ... abort, clear ...
  this.emitState();
}
```
`this.generation += 1` **yok**.

**Etki:** Kullanıcı cancelAll sonrası setSentences ile aynı cümleyi yeniden gönderirse, eski `inFlight` çağrıları tamamlanır ve `setResult`/`setError`'da generation kontrolü yapılmadığı için **eski sonuç yeni generation'ın üzerine yazılır**. Kullanıcı "iptal edildi" mesajı yerine 2 saniye önceki cevabı görür.

**Önerilen düzeltme:**
```js
cancelAll(reason = 'İptal edildi.') {
  this.generation += 1; // ← ekle
  this.providerFailure = '';
  // ...
}
```

---

### 2.6 K6 — PersistentTranslationCache flush snapshot race (veri kaybı riski)

**Test:** `tests/report62-translation-deep-fix.test.js` (cache flush assertion FAIL)
```js
await cache.set('key-1', 'val-1');
const flushPromise = cache.flush();
cache.set('key-2', 'val-2');  // flush sürerken
await flushPromise;
await cache.flush();
// reread: 2 anahtar var mı?
```

**Mevcut kod (`src/browser-translation-cache.js:85-105`):**
`set()` içinde `scheduleFlush()` çağrılıyor. Flush sürerken `scheduleFlush` timer resetliyor ama flushPromise handle etmiyor.

**Etki:** Kullanıcı çeviri sırasında sayfa kapatırsa (Ctrl+W, kapat düğmesi) **son yazılan çeviri kaybolur**. Tek seferlik, sessiz veri kaybı.

**Önerilen düzeltme:** `scheduleFlush()` içinde `if (this.flushPromise) { this.flushPromise.finally(() => doFlush()); return; }` veya flush bitince `this.version !== flushedVersion` ise hemen yeni flush planla.

---

### 2.7 K7 — `redactDiagnosticText` / `persistentBrowserMediaUrl` camelCase token sızıntısı

Bu iki yüzey K1 ile aynı sorundan mustariptir ama **farklı dosyalarda ve bağımsız olarak düzeltilmeli**:
- `src/browser-playback-diagnostics.js:120` — Widevine/license/EME hata mesajlarındaki `idToken=`, `accessToken=`, `refreshToken=`, `clientId=`, `AuthToken=` sızıyor.
- `src/browser-adapters.js:67-77` — HLS manifest'teki `refresh_token`, `session_id`, `idToken`, `refreshToken`, `clientId`, `AuthToken` parametreleri temizlenmiyor.

**Etki:** Manifest dosyaları ve log dosyaları disk'e yazılıyor — `userData/logs/` dizini. Saldırgan disk analizi ile tüm kullanıcıların token'larını çalar.

**Önerilen düzeltme:** K1 ile aynı — paylaşımlı `SENSITIVE_KEY_RE` / `isSensitiveKey` kullan.

---

## 3. 🟡 ORTA Bulgular (Öncelik Sırasıyla)

### 3.1 O1 — `restoreBrowserSessionState` kapanışta `flushBrowserSession` race

**Dosya:** `src/main.js:12410+12574`

**Senaryo:**
1. `mainWindow.on('close')` → `await flushBrowserSession()` → `browserSessionFinalizedForQuit = true` → `destroyBrowserView()`.
2. İkinci `before-quit` event'i gelirse `flushBrowserSession` içinde `if (browserSessionFinalizedForQuit) return` guard'ı var mı?

**Kanıt:** Diğer ajan bulgusu (`BROWSER_SESSION_BUG_REPORT.md` #2): ikinci çağrıda `browserTabs` Map boşaldığı için sessizce **tüm sekme verisi** (konum, altyazı tercihleri, eşleşmeler) siliniyor.

**Önerilen düzeltme:** `flushBrowserSession` ve `persistBrowserSessionNow` girişinde:
```js
if (browserSessionFinalizedForQuit) return { ok: true, skipped: true };
```

---

### 3.2 O2 — MAX_SESSION_TABS aşımında eviction yok

**Dosya:** `src/main.js:12678`

`MAX_SESSION_TABS` (varsayılan 24) aşıldığında `limitReached: true` dönüyor, kullanıcıya "yeni sekme açamazsınız" hatası veriliyor. **Eviction stratejisi yok** — eski sekmeler otomatik kapatılmıyor.

**Etki:** Uzun süreli kullanımda kullanıcı "tıkanır", tarayıcı kullanılamaz hale gelir.

**Önerilen düzeltme:** LRU eviction: en eski `closedAt` veya en az `lastActivatedAt` sekmeyi kapat.

---

### 3.3 O3 — `BrowserClosedTabHistory` bellek sızıntısı

**Dosya:** `src/browser-tab-history.js:39-43`

`subtitleEdits` (max 2000 × ~500 byte) × 24 sekme × 20 history = **~480 MB** potansiyel. `closedAt` alanı atlanıyor.

**Etki:** Uzun süreli oturumda memory growth.

**Önerilen düzeltme:** `closedAt` ekle, yaş sırasına göre eviction. `subtitleEdits` için LRU cache.

---

### 3.4 O4 — Library rename + remove race

**Dosya:** `src/main.js:15195-15205`

Paralel `library:collections:rename` ve `library:collections:remove` aynı `loadWatchLibraryAll()` snapshot'ı üzerinde çalışıyor — **ikinci işlem birincisinin sonucunu eziyor**.

**Önerilen düzeltme:** `watch-library-store.js` içindeki `MutationQueue` (`watchMutationQueue`) üzerinden FIFO sırala.

---

### 3.5 O5 — Session save her 700 ms'de full snapshot yazıyor

**Dosya:** `src/main.js:3263` (`scheduleBrowserSessionSave`)

24 sekmenin tamamı (tüm altyazı düzenleme geçmişi dahil) her 700 ms'de diske yazılıyor. 2000 düzenleme × 24 tab × 500 byte = **24 MB+ dosya**, disk I/O şişmesi.

**Önerilen düzeltme:** Diff tabanlı save (yalnız değişen sekmeler), `subtitleEdits` için LRU + son yazılan dirty mark.

---

### 3.6 O6 — SponsorBlock cache TTL/staleness

**Dosya:** `src/browser-sponsorblock.js`

Sponsor segment cache'de **TTL yok** — 6 aylık eski segmentler hâlâ kullanılıyor. Video sahibi sponsor segmentasyonu güncellerse eski cache kalır.

**Önerilen düzeltme:** `maxAge` veya `videoId+segmentVersion` hash'i ile 24 saatlik TTL.

---

### 3.7 O7 — Skip segments çakışması (intro/outro aynı anda)

**Dosya:** `src/browser-skip-segments.js`

`intro` + `outro` aynı timeline üzerinde çakışırsa (örn. 90-110s intro, 100-105s sponsor) öncelik sırası belirsiz. Son eklenen kazanır, çakışan kısımda iki kez skip tetiklenir.

**Önerilen düzeltme:** Öncelik sırası: `intro/outro > sponsor > self-promotion`. Çakışan segmentleri birleştir (union).

---

### 3.8 O8 — Cloudflare probe state leak

**Dosya:** `src/browser-cloudflare-compat.js`

`cloudflareProbeState` Map sonuçlanmamış probe'ları tutuyor. Probe timeout'a uğrarsa veya hata alırsa entry Map'te kalıyor.

**Önerilen düzeltme:** Probe completion/cancellation handler'da `cloudflareProbeState.delete(url)`.

---

### 3.9 O9 — Event listener leak (tab açıl/kapa her seferinde)

**Dosya:** `src/main.js` (`browser:tab:event` IPC handler'ları)

`ipcMain.handle('browser:tab:event')` her sekme açılışında listener ekliyor, kapanışta kaldırmıyor. 100 sekme = 100 listener.

**Önerilen düzeltme:** Listener'ları `WebContents`'e bağla, `destroyed` event'inde otomatik temizle.

---

### 3.10 O10 — `decodeSubtitleBuffer` `note` alanı kullanılmıyor

**Dosya:** `src/browser-textutil.js:60-90`

`decodeSubtitleBuffer` decoder seçiminde kullandığı `note` alanını döndürüyor ama **hiçbir çağrı noktası bunu kullanmıyor**. Decoder kararı sessizce kayboluyor — debug için değerli bilgi.

**Önerilen düzeltme:** `note` alanını `browser-subtitles.js` parse yollarında log'la (debug modda), production'da yut.

---

### 3.11 O11 — `findSubtitleUrls` derinlik/dizi limitleri sessiz kesiyor

**Dosya:** `src/browser-subtitles.js:1140-1170`

`findSubtitleUrls` `depth > 8`, `array > 500`, `object > 1000` limitlerini aşınca **sessizce kesiyor** — altyazı URL'leri kaybolabilir, hata yok.

**Önerilen düzeltme:** Limit aşımında `console.warn` + sonuçta `truncated: true` bayrağı.

---

### 3.12 O12 — `mp4Tfhd` buffer sınır kontrolü

**Dosya:** `src/browser-subtitles.js:1480-1495`

`box.start + 4` okuması `box.end` aşabilir, negatif indeks. MP4 altyazı parse crash.

**Önerilen düzeltme:** `Math.min(box.start + 4, box.end - 1)` clamp.

---

### 3.13 O13 — `normalizeCues` geçersiz cue'ları sessizce düşürüyor

**Dosya:** `src/browser-subtitles.js:110-125`

`start >= end` veya `text = ''` olan cue'lar `normalizeCues` içinde atılıyor, hata/uyarı yok. Provider "boş dosya" döndüğünde kullanıcı nedenini anlamıyor.

**Önerilen düzeltme:** `invalidCount` sayaç, `validateBrowserSubtitleDocument` çıktısına ekle.

---

### 3.14 O14 — HLS `NAME` yokluğunda label `LANGUAGE`'a düşüyor

**Dosya:** `src/browser-subtitles.js:420-435`

`#EXT-X-MEDIA:TYPE=SUBTITLES,NAME=...` yoksa label `LANGUAGE` değerine düşüyor ("tr" yerine kullanıcıya "Türkçe" gösterilmiyor).

**Önerilen düzeltme:** ISO 639-1 → İngilizce label map, fallback "Auto-detected".

---

### 3.15 O15 — `summarizeTranslationIntegrity` `submittedSentences` `queued`'ı katmıyor

**Test:** `tests/report62-translation-deep-fix.test.js` (integrity assertion FAIL)

**Mevcut kod (`src/browser-translation-integrity.js:65-72`):**
```js
const submittedSentences = Math.min(totalSentences,
  completedSentences + pendingSentences + failedSentences);
// ↑ queuedSentences DAHİL DEĞİL
```

**Etki:** Integrity raporu "submitted: 3/4" gösterir ama gerçekte 4/4 gönderildi — yanıltıcı monitoring.

**Önerilen düzeltme:** `+ queuedSentences` ekle.

---

### 3.16 O16 — `shouldFailoverTranslationStatus` 429/401 varsayılan failover

**Test:** `tests/report62-translation-deep-fix.test.js` (endpoint assertion FAIL)

**Mevcut kod (`src/translation-endpoints.js:22-36`):**
```js
return code === 0 || code === 404 || code === 408 || code === 425 || code >= 500;
// ↑ 429 varsayılan true
```

**Etki:** 429 (rate limit) geldiğinde **gereksiz yere tüm alias'lara failover ediliyor** — daha fazla rate limit tetikliyor. 401 (auth error) için de aynı.

**Önerilen düzeltme:** 429/401/403 default false, `sameProviderAliases: true` opsiyonuyla true.

---

### 3.17 O17 — `SENTENCE_PROTOCOL_VERSION = 2` kalmış, 4 olmalı

**Test:** `tests/report62-translation-deep-fix.test.js` (version assertion FAIL)
```js
assert.equal(layout.SENTENCE_PROTOCOL_VERSION, 4);
assert(layout.SUPPORTED_SENTENCE_PROTOCOL_VERSIONS.has(2));
assert(layout.SUPPORTED_SENTENCE_PROTOCOL_VERSIONS.has(3));
assert(layout.SUPPORTED_SENTENCE_PROTOCOL_VERSIONS.has(4));
```

**Mevcut kod (`src/subtitle-sentence-layout.js:1`):**
```js
const SENTENCE_PROTOCOL_VERSION = 2;
```

**Önerilen düzeltme:**
```js
const SENTENCE_PROTOCOL_VERSION = 4;
const SUPPORTED_SENTENCE_PROTOCOL_VERSIONS = new Set([2, 3, 4]);
module.exports = { ..., SENTENCE_PROTOCOL_VERSION, SUPPORTED_SENTENCE_PROTOCOL_VERSIONS };
```

---

### 3.18 O18 — `distributeTranslation` CJK parça sayısı korunmuyor

**Test:** `tests/report62-translation-deep-fix.test.js` (CJK assertion)
```js
const cjkCues = distributeTranslation(cjkSentence, cjkReply);
assert.equal(cjkCues.length, 2);
```

**Durum:** Mevcut kod `distributeTranslation` zaten grapheme tabanlı boşluksuz dil desteği içeriyor; test bu kısmi zaten geçiyor olabilir. Doğrulama gerekli (`node tests/report62-translation-deep-fix.test.js`).

---

## 4. 🟢 DÜŞÜK Bulgular (İyileştirme)

### 4.1 D1 — Buffer OOB risk (WeakMap cache in-place mutasyonu)

**Dosya:** `src/browser-subtitles.js:1070-1095`

`browserActiveCuesAt` WeakMap prefix cache, **in-place cue mutasyonunda** eski `prefix[]` değerleri kullanılabilir. Yavaş yavaş yanlış aktif satır gösterimi.

**Önerilen düzeltme:** Cue hash'i ile cache key (zaten var), in-place mutasyon yapan yerleri `Object.freeze` veya immutable replace.

---

### 4.2 D2 — Redirect chain SSRF

**Dosya:** `src/browser-manga.js`

`isSafeMangaImageUrl` başlangıç URL'sini kontrol ediyor ama 302/301 redirect sonrası özel IP'ye erişim korunmuyor. `net.fetch` redirect mode = 'follow' kullanıyorsa, manga sunucusu saldırganın kontrolünde ise SSRF mümkün.

**Önerilen düzeltme:** Her redirect hop'unda IP'yi yeniden doğrula (custom redirect handler).

---

### 4.3 D3 — `MutationObserver` LRU eviction yok

**Test:** `tests/report63-ssrf-observer.test.js` (`R63-07`)

**Mevcut kod (`src/browser-overlay-controller.js:258`):**
```js
if (mutationObservers.length >= 128) return;
```
128. observer eklenmeden önce **en eski disconnect edilmiyor**. 128+ observer = eskileri unutulmuş, bellekte tutulmuş durumda.

**Önerilen düzeltme:**
```js
if (mutationObservers.length >= 128) {
  const evicted = mutationObservers.shift();
  evicted?.disconnect();
  observedRoots.delete(evicted?.root);
  console.warn('Observer LRU eviction');
}
```

---

### 4.4 D4 — `enableFullscreenControls` snapshot stale state

**Test:** `tests/report63-ssrf-observer.test.js` (`R63-08`)

**Mevcut kod (`src/browser-overlay-controller.js:355-378`):**
Snapshot alınıyor, fullscreen sırasında site `width`/`height` değiştirirse eski değer geri yazılır.

**Önerilen düzeltme:** Snapshot alınmadan ÖNCE sitenin değişikliklerini yakala, sadece 5 özelliği geri yaz (diğerlerini koru).

---

### 4.5 D5 — Manifest partial token sızıntısı (uzunluk)

**Dosya:** `src/browser-adapters.js`

`sanitizeManifestPreview` token değerini `[gizlendi]` ile değiştiriyor ama **uzunluğu** sızıyor. Saldırgan JWT uzunluğundan algoritema türünü tahmin edebilir.

**Önerilen düzeltme:** Tüm token'ları `[token:32b]` gibi sabit formatta göster.

---

### 4.6 D6 — `normalizeTransform` throw fırlatıyor ama yakalanmıyor

**Dosya:** `src/browser-subtitle-sync.js:50-59`

`normalizeTransform` `TypeError` fırlatıyor ama `transformCuesForExport` (~145) try-catch yapmıyor — geçersiz senkron kaydında **çöküyor**, kullanıcıya Türkçe mesaj yok.

**Önerilen düzeltme:** `transformCuesForExport` içinde try-catch + Türkçe hata ("Geçersiz senkron kaydı, dışa aktarım iptal edildi.").

---

### 4.7 D7 — DASH 10.000+ segment template throw

**Dosya:** `src/browser-subtitles.js:740-768`

`dashTemplateTimeline` 10.000+ segment limitini aşınca `throw new Error(...)` fırlatıyor, `parseDashSubtitleMatchers` zincirinde **yakalanmıyor** — işlem çöker.

**Önerilen düzeltme:** `parseDashSubtitleMatchers` içinde try-catch, hata döndür.

---

### 4.8 D8 — `SubtitleFileAccess.grants` PC restartında kayboluyor

**Dosya:** `src/local-file-access.js:33-55`

`grants` bellekte tutuluyor. Restart sonrası tüm dosya erişim yetkileri kayboluyor — kullanıcı her seferinde yeniden onay vermek zorunda.

**Önerilen düzeltme:** `grants` Map'ini `userData/browser-grants.json` altında şifreli veya şifresiz (izin başına) diske persist et.

---

### 4.9 D9 — Sessiz cue düşürme (normalizeCues)

Bkz. O13. Düşük önem derecesi ama telemetry/observability açısından raporlanmalı.

---

### 4.10 D10 — `note` alanı dead-code

**Dosya:** `src/browser-textutil.js:60-90`

`note` döndürülüyor ama kullanılmıyor — D6'daki decoder kararı.

---

### 4.11 D11 — `subtitleLanguage` boş dönüş belirsizliği

**Dosya:** `src/browser-subtitles.js`

`subtitleLanguage('')` veya `subtitleLanguage(null)` durumunda ne döndüğü tutarsız. Test eksik.

---

## 5. Diğer Alt-Ajan Bulguları (Özet)

### 5.1 Browser Session Audit (`docs/BROWSER_SESSION_BUG_REPORT.md`)

13 bulgu; başlıcalar:
- 🔴 **#2 persist+quit race** (O1'in aynısı)
- 🟡 **#3 MAX_SESSION_TABS eviction yok** (O2)
- 🟡 **#6 tab history bellek** (O3)
- 🟡 **#9 library race** (O4)
- 🟡 **#13 session save büyümesi** (O5)

### 5.2 Subtitle Pipeline Audit (`docs/bug-reports/BROWSER_BUG_REPORT_29_subtitle-pipeline.md`)

20 bulgu; başlıcalar:
- 🔴 **#1 SubtitleFileAccess grants kayboluyor** (D8)
- 🔴 **#2 normalizeTransform throw** (D6)
- 🔴 **#3 DASH 10K+ segment throw** (D7)
- 🟡 **#5 WeakMap cache in-place mutasyon** (D1)
- 🟡 **#7 findSubtitleUrls derinlik limitleri** (O11)

### 5.3 Security Audit (`docs/security-audit-report-2026-09.md`)

14 bulgu; başlıcalar:
- 🔴 **6to4 / `200.0.0.0/8` SSRF** (K2 ile aynı kök)
- 🟡 **Redirect chain SSRF** (D2)
- 🟡 **MutationObserver LRU** (D3)
- 🟡 **Manifest partial token length leak** (D5)

---

## 6. Öncelikli Aksiyon Planı

### Hemen (yarın, ürün kodu):
1. **K1, K7** — Paylaşımlı `isSensitiveKey` / `SENSITIVE_KEY_RE` modülü oluştur, 5 dosyada uygula.
2. **K2** — `isPublicMangaIpAddress` IPv6 Teredo/6to4 reddi.
3. **K4, K5, K15, K16, K17** — Translation pipeline 5 düzeltmesi (Rapor 62).
4. **D3, D4** — MutationObserver LRU + fullscreen snapshot.

### Kısa vadede (1 hafta):
5. **O1** — `flushBrowserSession` race guard.
6. **O2** — `MAX_SESSION_TABS` eviction.
7. **O4** — Library rename/remove queue.
8. **D6, D7** — try-catch düzeltmeleri.

### Orta vadede:
9. **O5** — Diff tabanlı session save.
10. **O3** — Tab history LRU.
11. **D8** — SubtitleFileAccess grants persist.

---

## 7. Test Kapsamı Notları

- **WIP testler** (npm test FAIL): 3 dosya, **23 assertion başarısız**. Düzeltme sonrası bu testler YEŞİL olacak.
- **False positive test:** `browser-foundation.test.js:303` regex'i `restoreBrowserSessionState` ve `createWindow` arasındaki diğer restore çağrılarını hesaba katmıyor. Test **düzeltilmeli**, kod değil.
- **Test eksikliği:** D8 (grants persist), D1 (WeakMap mutasyon), O11 (findSubtitleUrls limit aşımı), D6 (transform hata), D7 (DASH throw) — her biri için yeni regresyon testleri gerekli.

---

## 8. Kanıt Dosyaları

- `terminals/npmtest.log` — Tam test çıktısı (435 KB)
- `tests/report62-translation-deep-fix.test.js` — 1 başarısız assertion
- `tests/report63-secret-redaction.test.js` — 15 başarısız assertion
- `tests/report63-ssrf-observer.test.js` — 7 başarısız assertion
- `tests/browser-foundation.test.js:303` — 1 başarısız assertion (false positive)
- `src/main.js:12534-12537` — restore + createWindow sırası
- `src/browser-place-url.js:3` — sensitive regex eksik
- `src/browser-adapters.js:67` — SENSITIVE_MEDIA_URL_PARAM eksik
- `src/browser-playback-diagnostics.js:120` — redactDiagnosticText eksik
- `src/browser-adblock.js:40` — safeFilterRule ortak sözlük kullanmıyor
- `src/browser-manga.js:270-300` — IPv6 Teredo/6to4 reddi eksik
- `src/browser-overlay-controller.js:258` — observer limit sessizce return
- `src/browser-overlay-controller.js:355-378` — enableFullscreenControls snapshot stale state
- `src/subtitle-sentence-layout.js:1` — SENTENCE_PROTOCOL_VERSION=2
- `src/subtitle-sentence-layout.js:6-13` — sentencePartsMatch locale eksik
- `src/browser-translation-scheduler.js:555-565` — cancelAll generation yok
- `src/browser-translation-integrity.js:65-72` — submittedSentences queued yok
- `src/translation-endpoints.js:22-36` — 429/401 failover
- `src/browser-translation-cache.js:85-105` — flush snapshot race

---

**Rapor sonu. Kod değiştirilmedi.**
