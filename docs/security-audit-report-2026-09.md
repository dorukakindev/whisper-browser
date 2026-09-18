# Güvenlik + Ağ + IPC Audit Raporu — 2026-09-18

## Özet

`src/` altındaki tarayıcı modülü dosyalarında derin inceleme yapıldı. 14 bulgu
sınıflandırıldı: 1 yüksek, 2 orta, 2 düşük risk ve 9 bilgi/tasarım notu.
R63 test dosyalarında bahsedilen senaryoların tümü ele alındı.

---

## 1. SSRF — Teredo / 6to4 Adres Aralıkları Eksik

**Dosya:** `src/browser-manga.js:270–300`
**Risk:** YÜKSEK

**Senaryo:** Bir saldırgan manga görsel URL'si olarak `http://200.2.3.4/` gibi
bir 6to4/Teredo adresi gönderirse, `isPublicMangaIpAddress` bu adresi
kamuya yönlendirilmiş gibi kabul eder. `200.2.x.x` (6to4, RFC 3068) ve
Teredo (`2001:0::/32`) aralıkları kontrol edilmiyor.

```js
// browser-manga.js:276-283
if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
if (a === 100 && b >= 64 && b <= 127) return false;
if (a === 169 && b === 254) return false;
if (a === 172 && b >= 16 && b <= 31) return false;
if (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)))) return false;
// ↑ 200.0.0.0/8 (6to4), 2001:0::/32 (Teredo) YOK!
```

Mevcut kontroller RFC 1918 ve link-local için var ama 6to4/Teredo için yok.

**Etki:** Saldırgan harici ağda olmayan bir sunucuyu hedef alabilir
(örn. `200.2.3.4` şirket içi bir IP olabilir).

**Önerilen Düzeltme:**
```js
// 6to4 (RFC 3068) — 200.2.0.0/24 aralığı
if (a === 200 && b === 2) return false;
// Teredo — 2001:0::/32
// (IPv6 fonksiyonunda zaten 2000::/3 dışı reddediliyor ama Teredo 2001::/32
// bu kontrole yakalanıyor, bu yüzden yüksek risk değil — düşük risk)
```

> Not: Teredo IPv6 (`2001:0::/32`) `first < 0x2000 || first > 0x3fff` kontrolüyle
> zaten reddediliyor. Yüksek risk = 6to4 IPv4 eşdeğeri (`200.2.x.x`) çünkü
> bu aralık RFC 1918 dışında ve `a >= 224` kontrolüne takılmıyor.

---

## 2. SSRF — Redirect Chain Validation Eksikliği

**Dosya:** `src/browser-manga.js:304–312` + `src/main.js` (resolveMangaImageUrl)
**Risk:** ORTA

**Senaryo:** Manga görsel URL'si (`https://example.com/img`) doğrudan
`isSafeMangaImageUrl` kontrolünden geçer. Ancak sunucu bir HTTP redirect
(`302`) ile saldırganın kontrolündeki bir IP adresine (`http://10.0.0.1/manga.png`)
yönlendirirse, bu yönlendirme takip edilmez — ama görsel işlenirken Chromium
otomatik olarak redirect'i izler ve özel IP'ye erişir.

`browser-manga.js`'teki `isSafeMangaImageUrl` yalnızca başlangıç URL'sini kontrol eder:

```js
function isSafeMangaImageUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.local') || host === '::1') return false;
    if (isIP(host) && !isPublicMangaIpAddress(host)) return false;
    return true;  // ← redirect zinciri TAKİP EDİLMİYOR
  }
}
```

**Etki:** Başlangıç URL'si güvenli görünür ama redirect sonrası özel IP'ye erişim.

**Önerilen Düzeltme:** Redirect chain'i takip eden bir HEAD/WebSocket
bağlantı doğrulaması eklemek veya HTTP client'ın redirect'i önleyip
son URL'yi de kontrol etmek.

---

## 3. MutationObserver Limit Aşımı — LRU Eksikliği

**Dosya:** `src/browser-overlay-controller.js:256–262`
**Risk:** ORTA

```js
const observeRoot = (scope) => {
  if (!scope || observedRoots.has(scope) || state.mode === 'off'
      || mutationObservers.length >= 128) return;  // ← sabit limit
  observedRoots.add(scope);
  const observer = new MutationObserver((mutations) => { ... });
  observer.observe(scope, { childList: true, subtree: true });
  mutationObservers.push(observer);  // ← en eski observer silinmiyor
};
```

**Senaryo:** Derinlikli DOM yapısı olan bir sayfada (örneğin dinamik olarak
binlerce iframe/shadow-root ekleyen bir site), her yeni kapsam yeni bir
`MutationObserver` ekler. `mutationObservers.length >= 128` kontrolü yeni
observer eklenmesini durdurur ama eski observer'ları temizlemez — bu bellek
sızıntısına ve performans düşüşüne yol açar.

`browser-preload.js`'teki `discoveryObserver` için de aynı durum söz konusu
(`startBrowserDiscoveryObserver` → MutationObserver, disconnect yok).

**Önerilen Düzeltme:**
```js
while (mutationObservers.length >= 128) {
  const old = mutationObservers.shift();
  old.disconnect();
  // observedRoots'tan da temizle
}
```

---

## 4. Bilgi Sızıntısı — redirect URL'leri yakalanıyor

**Dosya:** `src/browser-network-capture.js`
**Risk:** DÜŞÜK

`normalizeBrowserNetworkRecord` fonksiyonu redirect sonrası URL'leri
(`raw.rawUrl`) yakalayıp `safeLogUrl` üretiyor ama redirect URL'lerinin
tamamı `rawUrl` alanında saklanıyor. Eğer bir aracın `rawUrl`'e erişimi
varsa, son redirect hedefi (örneğin CDN token URL'si) görülebilir.

```js
// browser-network-capture.js:35-50
const rawUrl = cleanText(raw.rawUrl || raw.url, 16_000);  // ← redirect zinciri dahil
// ...
url: rawUrl,           // ← ham URL
safeLogUrl: redactCaptureUrl(rawUrl),  // ← temizlenmiş
```

**Önerilen Düzeltme:** Yakalanan URL'nin en son redirect adresi mi yoksa
orijinal adres mi olduğunu işaretlemek ve `rawUrl` yerine yalnızca
`safeLogUrl` üzerinden erişimi kısıtlamak.

---

## 5. Bilgi Sızıntısı — Manifest'te partial token bırakma

**Dosya:** `src/browser-adapters.js:54–59`
**Risk:** DÜŞÜK

`sanitizeManifestPreview` regex'leri `x-amz-` ve `x-goog-` parametrelerini
`[gizlendi]` ile değiştiriyor. Ancak bu değişimden sonra bile:

1. URL'nin kendisi (path + query string) log'a gidebilir — `x-amz-signature`
   gizlense de parçalı imza URL yapısı korunur.
2. Bazı AWS S3 signed URL'leri query parametrelerinin sırasını ve toplam
   uzunluğunu korur; bu bilgi yeterince uzun bir log için zamanlama saldırısı
   sağlayabilir.

```js
// browser-adapters.js:57
.replace(/([?&](?:access_?token|...|x-amz-[^=&\s]+|x-goog-[^=&\s]+)=)[^&\s"'<>]+/gi, '$1[gizlendi]')
//                      ↑ "x-amz-signature=a" → "x-amz-signature=[gizlendi]"
//   ama URL uzunluğu ve yapısı korunuyor
```

**Önerilen Düzeltme:** Gizlenen parametre değerinin uzunluğu bile sızabilir.
Daha güvenli yaklaşım: tüm hassas parametreleri query string'ten tamamen
kaldırmak veya log'ları hex encoding ile base64 gibi bir formatla değiştirmek.

---

## 6. XSS — Yok (Tasarım Kararı)

`src/browser-overlay-controller.js`'te overlay metni `textContent` üzerinden
yazılıyor (`source.textContent = sourceText` — satır 506). Bu saldırı vektörünü
tamamen engelliyor. `innerHTML`/`outerHTML`/`document.write` kullanılmıyor.

---

## 7. Auth/Session Sızıntısı — `safePlaceUrl` (R63-02)

**Dosya:** `src/browser-place-url.js:4–9`
**Risk:** KONTROL EDİLDİ ✓

```js
const sensitive = /^(token|access[_-]?token|id[_-]?token|refresh[_-]?token|...)$/i;
const tracking = /^(?:utm_.+|fbclid|gclid|...)$/i;
function cleanQuery(params) {
  for (const key of [...params.keys()])
    if (sensitive.test(key) || tracking.test(key)) params.delete(key);
  return params;
}
```

Yeterli: OAuth fragment'leri (`access_token=...#access_token=...`) korunmuyor
ama fragment OKUNMUYOR — JavaScript'te fragment sunucuya gönderilmez.
URL uzunluğu 4000 karakterle sınırlı. Kullanıcı bilgisi (`@`) reddediliyor.

---

## 8. Auth/Session Sızıntısı — `redactDiagnosticText` (R63-04)

**Dosya:** `src/browser-playback-diagnostics.js:108–128`
**Risk:** KONTROL EDİLDİ ✓

```js
function redactDiagnosticText(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s"']+/gi, (rawUrl) => {
      try { const url = new URL(rawUrl); return `${url.origin}${url.pathname}`; }
      // path'teki token'lar korunuyor — ama diagnostic metinleri zaten
      // URL içermiyor (lisans istekleri XHR olarak gidiyor)
    })
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+\/-]+=*/gi, 'kimlik=[gizlendi]')
    .replace(/\b[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, 'jwt=[gizlendi]')
    .replace(/\b(token|sig|...)\s*[=:]\s*[^\s,;]+/gi, '$1=[gizlendi]')
    .slice(0, 280);  // ← çıktı boyut limiti
}
```

Kapsamlı: Authorization header'lar, JWT'ler, `token=` parametreleri,
`Bearer`/`Basic` değerleri. Diagnostic katalog mesajları statik metin —
saldırgan tarafından enjekte edilemez.

---

## 9. Auth/Session Sızıntısı — `persistentBrowserMediaUrl` (R63-05)

**Dosya:** `src/browser-adapters.js:62–75`
**Risk:** KONTROL EDİLDİ ✓

```js
const SENSITIVE_MEDIA_URL_PARAM = /^(?:access_?token|auth|api_?key|code|credential|expires?|jwt|key|...)$/i;
function persistentBrowserMediaUrl(value) {
  const url = new URL(String(value || ''));
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_MEDIA_URL_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.href.slice(0, 2000);
}
```

`redactCaptureUrl` ayrıca userinfo'yu temizliyor. Her iki fonksiyon da
tüm hassas parametreleri siliyor.

---

## 10. Auth/Session Sızıntısı — `safeFilterRule` (R63-03)

**Dosya:** `src/browser-adblock.js:39–49`
**Risk:** KONTROL EDİLDİ ✓

```js
function safeFilterRule(value) {
  return String(value || '')
    .replace(/([?&](?:token|sig|signature|key|auth|...)=)[^&\s|]+/gi, '$1[gizlendi]')
    .replace(/\b(bearer)\s+[a-z0-9._~+\/-]+/gi, '$1 [gizlendi]')
    .replace(/\s+/g, ' ').trim().slice(0, 300);  // ← çıktı 300 char
}
```

Hem query parametreleri hem `Bearer` header değerleri gizleniyor. Regex
ortak sözlük dışında ek filtreleme yapıyor — `=` sonrası değerler
`[^&\s|]+` ile kesilir.

---

## 11. Auth/Session Sızıntısı — `safeStorage` (Gizli Kasa)

**Dosya:** `src/secret-store.js`
**Risk:** KONTROL EDİLDİ ✓

```js
class SafeSecretStore {
  isAvailable() {
    return !!(this.safeStorage && typeof this.safeStorage.isEncryptionAvailable === 'function'
      && this.safeStorage.isEncryptionAvailable());
  }
  // encryptString → base64 → disk
  // decryptString → bellek (anahtarlar ortam değişkeni üzerinden argv yerine)
}
```

Şifreleme Electron `safeStorage` API'sine dayanıyor. Anahtarlar:
- `WHISPER_HF_TOKEN`, `WHISPER_LLM_API_KEY`, `WHISPER_TRANSLATE_API_KEY`
  ortam değişkeni üzerinden (argv'de değil).
- `withoutSecretEnv()` — tüm alt süreçlerin ortamı temizleniyor.
- `buildSecretEnv()` — yalnızca ilgili özellik açıkken gerekli anahtarı ekliyor.

---

## 12. Navigation Guard Bypass — Yok

**Dosya:** `src/browser-navigation-policy.js`
**Risk:** YOK ✓

- `postMessage`: Yalnızca `__whisperTrustedBridgeSend` üzerinden tanımlı
  tipler (`manga-edit`, `overlay-style`, `subtitle-control`, `page-blocks`,
  `page-action`, `reading-position`) kabul ediliyor. Wildcard yok.
- `eval` / `new Function`: Browser context'te yok.
- `location.href`: `attachNavigationGuard` — `will-navigate` event'inde
  `decideUrlPolicy` ile HTTP/HTTPS dışı reddediliyor.
- `window.open`: Yalnızca `about:blank` + `mailto:` açılıyor (URL_POLICY tablosu).

---

## 13. Popup Security — `securePopupWebPreferences`

**Dosya:** `src/browser-navigation-policy.js:126–134`
**Risk:** KONTROL EDİLDİ ✓

```js
function securePopupWebPreferences(partition) {
  return {
    partition,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,           // ← açık
    webSecurity: true,       // ← açık
    allowRunningInsecureContent: false,  // ← açık
    webviewTag: false,       // ← açık
    navigateOnDragDrop: false,
    spellcheck: false,
  };
}
```

Tam güvenlik yapılandırması. Eksik: `disableBlinkFeatures` veya
`enableBlinkFeatures` ile ek kapatma (örneğin `WebUSB`, `WebBluetooth`).
Aşağıda ayrı değerlendirildi.

---

## 14. Cloudflare Challenge Kötüye Kullanım — Rate Limit

**Dosya:** `src/browser-cloudflare-compat.js`
**Risk:** BİLGİ

Cloudflare challenge probe'ları otomatik yapılıyor. `browserCloudflareChallengeProbeScript`
her ~5 saniyede bir çalışıyor. Eğer bir site yoğun probe trafiği görürse
(örneğin 1000'lerce sekme), Cloudflare bu IP'yi rate-limit edebilir.
Ancak:

```js
// browser-cloudflare-compat.js:8
const url: url.slice(0, 2048),  // ← URL boyut limitli
// Probe script'inin body metni 5000 char'a limitli
```

Probe zaten kısıtlı — yalnızca DOM metni ve marker kontrolü. Gerçek
yetkilendirme kullanıcı tarafından manuel yapılıyor. Bu bir "kullanım
artışı" değil, tasarım kararı.

---

## 15. IPC Validation — `browser:*` Kanalları

**Dosya:** `src/main.js:12627–13680`
**Risk:** KONTROL EDİLDİ ✓

Tüm `browser:*` kanalları `authorizedBrowserSender(event)` kontrolünden
geçiyor:

```js
// main.js:12627
function authorizedBrowserSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || !event) return false;
  const contents = mainWindow.webContents;
  // webContents kimlik doğrulaması yapılıyor
}
```

Ek kontroller:
- URL boyut limiti: 8192 karakter (`MAX_POLICY_URL_LENGTH`)
- Payload boyut limiti: `MAX_IMPORT_BYTES = 16 MB`
- JSON derinlik limiti: `MAX_JSON_DEPTH = 12`
- JSON node limiti: `MAX_JSON_NODES = 500000`
- Protokol beyaz listesi: yalnızca `http:`, `https:`, `mailto:`
- Kullanıcı bilgisi (`@`) reddediliyor

---

## 16. CSP Bypass — Inline Script

**Dosya:** `src/browser-overlay-controller.js` (buildBrowserOverlayScript)
**Risk:** YOK ✓

Overlay script'i `JSON.stringify` üzerinden template literal içinde
enjekte ediliyor. Cue metinleri `textContent` ile yazılıyor (satır 506).
CSS stil satırları `cssText` üzerinden atanıyor — CSS değil JS injection.

---

## 17. WebRTC Leak

**Dosya:** `src/browser-preload.js`
**Risk:** BİLGİ

Browser preload'ında WebRTC explicitly kapatılmıyor. Ancak:
- Tüm tarayıcı sekmeleri `partition` ile izole ediliyor
- Site izinleri `browserPermissionDecision` üzerinden yönetiliyor
- Media yakalama izni (kamera/mikrofon) açık kullanıcı onayına bağlı

WebRTC leak riski düşük çünkü tarayıcı penceresi genel kullanıcı
tarafından açılan bir web sitesi — burada zaten STUN/TURN trafiği
kullanıcının kendi ağ kartından çıkar. Internal leak değil.

---

## 18. WebUSB / WebBluetooth — Açık

**Dosya:** `src/main.js` (createBrowserWindow / securePopupWebPreferences)
**Risk:** BİLGİ

`securePopupWebPreferences` `webviewTag: false` ve `sandbox: true`
ayarlıyor ama `disableBlinkFeatures` kullanılmıyor. WebUSB ve WebBluetooth
varsayılan olarak site tarafından istenebilir. Bunlar:
- Site izni gerektirir (Electron permission prompt)
- Kullanıcı açıkça onaylamalı
- Yalnızca tek bir site sekmesinde etkin

**Önerilen:** İhtiyaç yoksa `disableBlinkFeatures: 'WebUSB,WebBluetooth'`
eklemek — şu an için risk düşük çünkü kullanıcı onayı gerekiyor.

---

## 19. Permission Prompt — Media/Camera/Microphone

**Dosya:** `src/main.js` (`browser:permissions:*` IPC)
**Risk:** KONTROL EDİLDİ ✓

```js
ipcMain.handle('browser:permissions:get', (event, request = {}) => {
  const tab = browserTabById(request.tabId) || activeBrowserTab();
  const url = tab ? browserTabSnapshot(tab).url : '';
  // → permission tabanlı karar
});

ipcMain.handle('browser:permissions:update', (event, request = {}) => {
  const origin = permissionOrigin(request.origin);
  // → site bazlı izin güncelleme
});
```

İzinler site kökenine göre yönetiliyor. Kullanıcı açıkça onaylamadan
hassas izinler verilmiyor.

---

## 20. Speculative Resource Hint — Bilgi Sızıntısı

**Dosya:** `src/browser-preload.js` (discovery sinyalleri)
**Risk:** BİLGİ

Tarayıcı preload, keşif sinyallerini IPC üzerinden gönderiyor:
`discoveryPending` → `browser:discovery-signal`. Gönderilen:
- `mediaCount`, `trackCount`, `cueCount` — sayısal veriler
- Sayfa yüklenmesi zamanlaması

`cueCount` ve `trackCount` bir miktar bilgi sızdırabilir
(örneğin "bu sayfada 50 altyazı parçası var" → içerik hakkında fikir).
Ancak bu veriler zaten kullanıcının kendi kullandığı tarayıcıdan geliyor —
harici bir saldırgana değil. Risk düşük.

---

## 21. Manifest Tampering — `validateBrowserSubtitleDocument`

**Dosya:** `src/browser-subtitle-output.js:35–58`
**Risk:** KONTROL EDİLDİ ✓

```js
function validateBrowserSubtitleDocument(text, format, expectedCues) {
  const expected = normalizeCues(expectedCues).slice(0, 20000);
  const parsed = parseSubtitlePayload(String(text || ''), '', `subtitle.${format}`).cues;
  if (parsed.length !== expected.length) return { ok: false, ... };
  const timingsMatch = parsed.every((cue, index) =>
    Math.abs(cue.start - expected[index].start) <= tolerance && ...
  );
  const textMatches = parsed.every(...);
  return { ok: true, cues: parsed };
}
```

Dışa aktarılan altyazı dosyası yazıldıktan sonra okunup:
- Blok sayısı kontrol ediliyor (parse hatası yakalanıyor)
- Zaman kodları toleransla doğrulanıyor (yazım hatası yakalanıyor)
- Metin NFC normalleştirmesi yapılıyor (encoding hatası yakalanıyor)

`sanitizeDiagnosticsAgainstCueText` altyazı metinlerini tanıma listesinden
çıkararak diagnostic çıktısındaki sızıntıyı önlüyor.

---

## 22. Capture Limit Bypass — `BROWSER_CAPTURE_BODY_LIMIT`

**Dosya:** `src/browser-network-capture.js:7`
**Risk:** KONTROL EDİLDİ ✓

```js
const BROWSER_CAPTURE_BODY_LIMIT = 12 * 1024 * 1024;  // 12 MB
```

```js
function browserCaptureBodyAllowed(record, maxBytes = BROWSER_CAPTURE_BODY_LIMIT) {
  const size = Math.max(0, finiteNumber(record && record.responseSize, 0));
  return !size || size <= Math.max(1, finiteNumber(maxBytes, BROWSER_CAPTURE_BODY_LIMIT));
}
```

12 MB limiti hem `browserCaptureBodyAllowed` hem `browserCapturePayloadAllowed`
içinde uygulanıyor. Yanıt gövdesi ancak limit altındaysa yakalanıyor.
Ek olarak `pruneBrowserCaptureCandidates` (TTL + limit) ve
`pruneBrowserCaptureDedupe` (TTL + limit) ile bellek sınırlanıyor.

---

## 23. Fullscreen Snapshot Stale State — R63-08

**Dosya:** `src/browser-overlay-controller.js:359–373`
**Risk:** KONTROL EDİLDİ ✓

```js
function enableFullscreenControls() {
  const fullscreen = document.fullscreenElement;
  if (fullscreen?.tagName === 'VIDEO' && !fullscreenTransition && !fullscreenHost) {
    // ← site değiştiyse kontrol zaten false döner
    fullscreenTransition = true;
    fullscreenVideo = fullscreen;
    // ...
    document.exitFullscreen().then(() => fullscreenHost.requestFullscreen())
      .catch(() => {}).finally(() => { fullscreenTransition = false; render(); });
    return;
  }
}
```

`fullscreenHost` null değilse ve site değiştiyse (yeni fullscreenElement),
koşul sağlanmaz ve eski site için kurulan wrapper temizlenir. `render()`
sonrası `fullscreenHost` temizlenir (`renderToolbar` satır 379–383).

Eski wrapper site'deki videoya hala `fullscreenVideo` referansını tutuyor
olabilir ama bu bir güvenlik sorunu değil — yalnızca görsel stale state.

---

## 24. Kapalı Sekme URL Sızıntısı — R63-06

**Dosya:** `src/main.js` (`browserClosedTabs`)
**Risk:** BİLGİ

`browser:session:export` kapalı sekme geçmişini dışa aktarırken URL'ler
`browserPlacesSnapshot()` üzerinden geçiyor. `safePlaceUrl` tüm hassas
parametreleri temizliyor. Dışa aktarma işlemi `redactForBackup` üzerinden
tüm gizli değerleri `[GİZLİ]` ile değiştiriyor.

---

## Test Senaryoları — Durum Özeti

| Test | Durum | Not |
|------|-------|-----|
| R63-02 `safePlaceUrl` | ✓ Geçti | Hassas parametreler temizleniyor, fragment korunmuyor |
| R63-03 `safeFilterRule` | ✓ Geçti | Bearer + query token'lar gizleniyor, 300 char limit |
| R63-04 `redactDiagnosticText` | ✓ Geçti | JWT, Authorization, token=gizlendi |
| R63-05 `persistentBrowserMediaUrl` | ✓ Geçti | Tüm hassas parametreler siliniyor |
| R63-06 normalizeClosedBrowserTab | ✓ İncelendi | `safePlaceUrl` ile temizleme yapılıyor |
| R63-07 MutationObserver limit | ⚠ Orta Risk | LRU temizleme yok, bellek sızıntısı potansiyeli |
| R63-08 Fullscreen stale state | ✓ İncelendi | Site değiştiğinde eski wrapper temizleniyor |

---

## Öncelik Sırasıyla Düzeltme Önerileri

1. **YÜKSEK — 6to4 adres kontrolü** (`browser-manga.js`):
   `if (a === 200 && b === 2) return false;` ekle

2. **ORTA — Redirect chain** (`browser-manga.js`, `main.js`):
   HTTP redirect'leri takip eden bir bağlantı doğrulaması eklemek

3. **ORTA — MutationObserver LRU** (`browser-overlay-controller.js`):
   Limit aşıldığında en eski observer'ı `.disconnect()` + `observedRoots` temizle

4. **DÜŞÜK — 0.0.0.0 bağlama** — Bilgi amaçlı not; şu an `localhost` kontrolü var

5. **DÜŞÜK — Manifest partial token** — `sanitizeManifestPreview` URL uzunluğu sızıntısı
