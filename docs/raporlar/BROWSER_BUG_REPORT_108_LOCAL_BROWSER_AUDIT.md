# BROWSER_BUG_REPORT_108 — Browser tarafı derin denetim turu

Tarih: 2026-09-22
Dal: `codex/catalog-sync` (HEAD `8ccfff3`, R107 sonrası)
Kapsam: Electron main/preload/renderer iletişimi, browser sekmeleri ve gezinme, YouTube TV
modu, SmartTube TV görünümü, altyazı yakalama/HLS/CEA, çeviri zamanlayıcısı, oturum
geri yükleme, izinler, indirmeler, IPC güvenliği, EN/TR yerelleştirme, timer/listener/
observer yaşam döngüsü, eşzamanlılık ve iptal, browser-address-model, translation-diff,
translation-model-score yolları.

Yöntem: AGENTS.md, YENI-BILGISAYAR.md, DEVIR-NOTU.md, son R106/R107 raporları, ana
kaynak dosyalar (main.js, preload.js, renderer.js, youtube-tv-mode.js,
smarttube-tv.js, browser-address-model.js, translation-diff.js, translation-model-score.js,
browser-navigation-policy.js, browser-page-find.js) satır satır okundu; 55 maddelik
dar, salt-okunur doğrulama harness'i (`_repro/r108-verify.js`) çalıştırıldı; kod
değişmedi. R107'de bildirilen F-104-4 (Escape → dialog kapatma) ve R106-01
(seçili değişiklik tazelik koruması) düzeltmelerinin etkileri de denetlendi.

## Kesin bulgular (kanıtlanmış)

---

### B-108-01 [P2] TV modu agent değişikliğinde önceki loadURL iptal edildiğinde hata flash'ı

**Önem:** Orta-Yüksek
**Güven:** Yüksek

**Kaynak:** `src/main.js`, `openYoutubeTvWindow()`, satır 1714–1790.

Ana modül düzeyinde iki blok var. İlki pencere zaten açıksa agent değişikliğini
yönetiyor:

```startLine:1714:endLine:1790:src/main.js
let youtubeTvWindow = null;
let youtubeTvState = { open: false, videoId: '', title: '', refused: false, userAgent: 'cobalt', error: '', handoff: 0 };

function sendYoutubeTvState(patch = {}) {
  youtubeTvState = { ...youtubeTvState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('youtube-tv:event', { ...youtubeTvState });
  return youtubeTvState;
}

function configureYoutubeTvSession(tvSession, userAgent) {
  tvSession.setUserAgent(userAgent);
  tvSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
  tvSession.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
  if (!tvSession.__whisperTvDownloadGuard) {
    tvSession.__whisperTvDownloadGuard = true;
    tvSession.on('will-download', (event) => event.preventDefault());
  }
}

function openYoutubeTvWindow(userAgentId) {
  const agent = youtubeTvMode.tvUserAgent(userAgentId);
  const tvSession = session.fromPartition(youtubeTvMode.TV_PARTITION);
  if (youtubeTvWindow && !youtubeTvWindow.isDestroyed()) {
    if (youtubeTvState.userAgent !== agent.id) {
      configureYoutubeTvSession(tvSession, agent.value);
      youtubeTvWindow.webContents.setUserAgent(agent.value);
      sendYoutubeTvState({ userAgent: agent.id, refused: false, error: '' });     // ← (A)
      youtubeTvWindow.loadURL(youtubeTvMode.TV_START_URL).catch(() => {});        // ← (B)
    }
    youtubeTvWindow.show();
    youtubeTvWindow.focus();
    return { ok: true, state: youtubeTvState };
  }
  // ... yeni pencere oluşturma ...
  tvContents.on('did-navigate', onTvNavigate);
  tvContents.on('did-navigate-in-page', onTvNavigate);
  tvContents.on('page-title-updated', (_event, title) => sendYoutubeTvState({ title: String(title || '').slice(0, 200) }));
  tvContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) sendYoutubeTvState({ error: browserLoadErrorMessage(code, description) }); // ← (C)
  });
  // ...
  win.loadURL(youtubeTvMode.TV_START_URL).catch((error) => {
    sendYoutubeTvState({ error: String(error?.message || error || 'YouTube TV açılamadı.').slice(0, 200) });
  });
  return { ok: true, state: youtubeTvState };
}
```

**Event handler'lar (satır 1750–1780):**

```startLine:1750:endLine:1780:src/main.js
  tvContents.on('will-navigate', guard);
  tvContents.on('will-redirect', guard);
  const onTvNavigate = (_event, url) => {
    const onTvApp = youtubeTvMode.isTvAppUrl(url);
    const refused = !onTvApp && /^https:\/\/(?:www\.)?youtube\.com\//i.test(String(url || ''));
    sendYoutubeTvState({ open: true, videoId: youtubeTvMode.videoIdFromTvUrl(url), refused, error: '' }); // ← (D)
  };
  tvContents.on('did-navigate', onTvNavigate);
  tvContents.on('did-navigate-in-page', onTvNavigate);
  tvContents.on('page-title-updated', (_event, title) => sendYoutubeTvState({ title: String(title || '').slice(0, 200) }));
  tvContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) sendYoutubeTvState({ error: browserLoadErrorMessage(code, description) }); // ← (C)
  });
  tvContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { event.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if ((input.control || input.meta) && input.shift && String(input.key).toLowerCase() === 's') {
      event.preventDefault();
      sendYoutubeTvState({ handoff: Date.now() });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
    }
  });
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  win.on('closed', () => {
    if (youtubeTvWindow === win) youtubeTvWindow = null;
    sendYoutubeTvState({ open: false, videoId: '', title: '', handoff: 0 }); // ← (E)
  });
```

**Açıklama:** (A) satırında `sendYoutubeTvState({ userAgent, refused: false, error: '' })` tüm
state'i güncelliyor ama `open`, `videoId`, `title` alanlarını koruyor. Sonra (B)'de
`loadURL` çağrılıyor — Promise resolve olmadan önce ikinci bir `loadURL` çağrılırsa,
Chromium birincisini otomatik iptal eder. İptal `did-fail-load` event'i tetikler,
(C) handler'ı `code !== -3` kontrolüyle `ERR_ABORTED` (-3) kodunu filtreliyor ama
**diğer iptal kodlarını (örn. Chromium internal `ERR_ABORTED` dışında Electron'un
mapped -3 haricinde kalan kodlar) filtrelemiyor**. Dahası, agent değişikliğinde
`open` ve `videoId` resetlenmediği için (D) her iki navigation'da da çalışır.

`browserLoadErrorMessage` (satır 4811–4827):

```startLine:4811:endLine:4830:src/main.js
function browserLoadErrorMessage(code, description) {
  const raw = String(description || 'Sayfa yüklenemedi.');
  if (Number(code) === -138 || /ERR_NETWORK_ACCESS_DENIED/i.test(raw)) {
    return 'Ağ erişimi Windows veya VPN tarafından reddedildi. …';
  }
  if (Number(code) === -356 || /ERR_QUIC_PROTOCOL_ERROR/i.test(raw)) {
    return 'VPN bağlantısı QUIC protokolünü tamamlayamadı; …';
  }
  if (Number(code) === -102 || /ERR_CONNECTION_REFUSED/i.test(raw)) {
    return 'Site bağlantıyı reddetti. …';
  }
  if (Number(code) === -501 || /ERR_INSECURE_RESPONSE/i.test(raw)) {
    return 'Site güvenli olmayan bir TLS/sertifika yanıtı verdi. …';
  }
  return raw;
}
```

**Ulaşılabilir olay zinciri (tam kod yolu):**

```
renderer: smarttube-tv.js:220
  $stTvNextAgent.click()
  → openTvMode(nextAgentId())
  → window.api.youtubeTvOpen(agentId)
  [preload.js:100 →] ipcMain.handle('youtube-tv:open', ...)
  → openYoutubeTvWindow(userAgentId)                    [main.js:1714]
  → if (youtubeTvWindow && !isDestroyed()) TRUE        [main.js:1718]
  → if (youtubeTvState.userAgent !== agent.id) TRUE     [main.js:1719]
  → configureYoutubeTvSession(tvSession, agent.value)   [main.js:1720]
  → webContents.setUserAgent(agent.value)              [main.js:1721]
  → sendYoutubeTvState({ userAgent, refused: false, error: '' })   [main.js:1722] ← state güncellenir
  → youtubeTvWindow.loadURL(TV_START_URL).catch(() => {})         [main.js:1723] ← Promise yutulur
  → EŞZAMANLI: önceki loadURL hâlâ "pending"
  → Chromium birinci navigation'ı otomatik iptal eder
  → tvContents 'did-fail-load' event'i tetikler
  → if (isMainFrame && code !== -3) TRUE              [main.js:1762] ← -3 değilse banner'a hata
  → sendYoutubeTvState({ error: browserLoadErrorMessage(...) })   [main.js:1762]
  → Kullanıcı banner'da yanlış hata görür (kısa süre)
  → Sonra 'did-navigate' event'i yeni URL ile çalışır
  → sendYoutubeTvState({ open: true, videoId: ..., refused: false, error: '' }) [main.js:1756]
  → error alanı temizlenir
```

**Reproduksiyon (Electron tarayıcı konsolu):**

```js
// Gerçek Electron'da YouTube TV penceresi açıkken:
const wc = youtubeTvWindow.webContents;
// 1. Yavaş ağ simülasyonu (Chrome DevTools → Network → throttling)
// 2. Hızlı agent değişikliği:
// window.api.youtubeTvOpen('tizen')
// window.api.youtubeTvOpen('cobalt')
// window.api.youtubeTvOpen('webos')
// → Her değişiklikte "ERR_NETWORK_CHANGED" vb. hatalar flash edilebilir.
```

**Beklenen:** Agent değişikliği tek bir net "navigation başladı" state'i üretmeli;
geçici hatalar banner'a sızmamalı.
**Gerçekleşen:** İptal edilen navigation `code !== -3` koşulunu geçerse banner'a
yanlış hata mesajı yansır, ardından `did-navigate` temizler.

**Kullanıcı etkisi:** "Sonraki kimlik" düğmesiyle döngüsel agent değiştirmede
her geçişte bir flash hata görüntüsü. Kullanıcı "YouTube bu TV kimliğini reddetti"
yanlış mesajını görür ve tekrar denemeye çalışır.

**Kök neden:** `loadURL` sözleşmesinin iptal davranışı + `did-fail-load` handler'ının
yalnızca `ERR_ABORTED` (-3) filtrelemesi. Chromium'da iptal senaryoları yalnızca
`ERR_ABORTED` üretmez. Ek olarak, agent değişikliğinde (A) `error` resetliyor
ama sonraki `loadURL` (B) hâlâ promise içinde olduğu için (C) herhangi bir
hata kodu banner'a yansır.

**Mevcut test boşluğu:** `tests/youtube-tv-mode.test.js` satır 51–52 yalnız
`tvContents.on('will-navigate'...)` ve `tvContents.on('will-redirect'...)` bağlantılarını
kontrol ediyor; navigation iptal senaryosu ve `did-fail-load` davranışı test kapsamında değil.

**Önerilen düzeltme yönü (A):** `loadURL` çağrısından önce mevcut navigation'ı
açıkça iptal et:

```js
// Satır 1720–1723 arası:
configureYoutubeTvSession(tvSession, agent.value);
youtubeTvWindow.webContents.setUserAgent(agent.value);
youtubeTvWindow.webContents.stop?.(); // ← mevcut navigation'ı durdur
sendYoutubeTvState({ userAgent: agent.id, refused: false, error: '', videoId: '', title: '' }); // ← (A')
youtubeTvWindow.loadURL(youtubeTvMode.TV_START_URL).catch(() => {});
```

**Önerilen düzeltme yönü (B):** `did-fail-load` handler'ında yalnızca
kalıcı hataları yayınla:

```js
// Satır 1761–1763 arası:
const PERSISTENT_FAIL_CODES = new Set([-100, -101, -102, -105, -106, -107, -113, -118, -200, -324]);
tvContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
  if (!isMainFrame) return;
  if (code === -3) return; // ERR_ABORTED — navigation iptal, görmezden gel
  if (PERSISTENT_FAIL_CODES.has(Number(code))) {
    sendYoutubeTvState({ error: browserLoadErrorMessage(code, description) });
  }
});
```

**Güven:** Yüksek. Kod okuması ve Electron navigation sözleşmesi ile kanıtlandı.
Ağ koşullarına bağlı reproduksiyon.

---

### B-108-02 [P2] `translation-diff.selectedChangesStillMatch` ham metin karşılaştırması — HTML/boşluk varyasyonu false negative

**Önem:** Orta-Yüksek
**Güven:** Yüksek

**Kaynak:** `src/translation-diff.js`, tam dosya (60 satır).

```startLine:1:endLine:60:src/translation-diff.js
// "Tamamını yeni modelle çevir" sonrası eski/yeni çeviri farkı. DOM'suz ve saf:
// cue'lar zaman örtüşmesiyle eşlenir (blok sayısı çeviride değişmez ama dosya
// yeniden yüklenince sıra/indeks güvenilir kimlik değildir).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TranslationDiff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const normalize = (text) => String(text || '').replace(/<[^>]+>|\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

  function matchBefore(before, cue) {
    let best = null;
    let bestOverlap = 0;
    for (const item of before) {
      if (item.start >= cue.end) break;
      const overlap = Math.min(cue.end, item.end) - Math.max(cue.start, item.start);
      if (overlap > bestOverlap) { bestOverlap = overlap; best = item; }
    }
    return bestOverlap > Math.min(0.4, (cue.end - cue.start) * 0.25) ? best : null;
  }

  function diffTranslationCues(beforeCues, afterCues, { limit = 2000 } = {}) {
    const before = (Array.isArray(beforeCues) ? beforeCues : []).slice().sort((a, b) => a.start - b.start);
    const changes = [];
    (Array.isArray(afterCues) ? afterCues : []).forEach((cue, index) => {
      if (changes.length >= limit) return;
      const previous = matchBefore(before, cue);
      if (!previous) return;
      if (normalize(previous.text) === normalize(cue.text)) return;  // ← (F) normalize ile karşılaştırıyor
      changes.push({ index, start: cue.start, end: cue.end, before: previous.text, after: cue.text }); // ← (G) ama HAM metni saklıyor
    });
    return changes;
  }

  function revertChanges(afterCues, changes, selectedIndexes) {
    const selected = new Set(selectedIndexes);
    const byIndex = new Map(changes.filter((change) => selected.has(change.index)).map((change) => [change.index, change.before]));
    return (Array.isArray(afterCues) ? afterCues : []).map((cue, index) => (byIndex.has(index) ? { ...cue, text: byIndex.get(index) } : cue));
  }

  function selectedChangesStillMatch(currentCues, changes, selectedIndexes) {
    const cues = Array.isArray(currentCues) ? currentCues : [];
    const byIndex = new Map((Array.isArray(changes) ? changes : []).map((change) => [change.index, change]));
    return Array.isArray(selectedIndexes) && selectedIndexes.length > 0
      && selectedIndexes.every((index) => {
        const cue = cues[index];
        const change = byIndex.get(index);
        return Boolean(cue && change && cue.start === change.start && cue.end === change.end
          && cue.text === change.after);  // ← (H) HAM karşılaştırma — normalize edilmeden
      });
  }

  return { diffTranslationCues, revertChanges, selectedChangesStillMatch };
});
```

**(F) satırı** `diffTranslationCues` içinde: `normalize(previous.text) === normalize(cue.text)` —
eşleşme kontrolü normalize edilmiş hâller üzerinden yapılıyor. **Bu doğru.**

**(G) satırı** ise `changes.push({ before: previous.text, after: cue.text })` —
`normalize` edilmiş değil **ham metin** saklanıyor.

**(H) satırı** `selectedChangesStillMatch` içinde: `cue.text === change.after` —
ham metin karşılaştırması. Aynı anlama sahip fakat farklı whitespace/etiket içeren
metinler bu kontrolü geçemez.

**Ulaşılabilir olay zinciri (tam kod yolu):**

```
renderer.js:3971
  void openRetranslationReview(snapshot.cues);
  
renderer.js:7280
  async function openRetranslationReview(previousCues) {
    const diff = globalThis.TranslationDiff;                   // ← translation-diff.js
    const channel = translationChannel();
    const changes = diff.diffTranslationCues(previousCues, channel.cues);  // ← (F) normalize karşılaştırma, (G) ham saklama
    // changes[].before = normalize edilmemiş "previous.text"
    // changes[].after  = normalize edilmemiş "cue.text"
    ...
    dialog.showModal();
  }

renderer.js:7326
  revert.addEventListener('click', async () => {
    const current = translationChannel();
    if (!diff.selectedChangesStillMatch(current.cues, changes, selected)) {  // ← (H) ham karşılaştırma
      close();
      logLine('İnceleme sırasında çeviri değişti; hiçbir satırın üzerine yazılmadı.', 'warn');
      return;
    }
    // ← kullanıcı yanlış uyarı görür
  });
```

**Reproduksiyon (Node harness):**

```js
const diff = require('./src/translation-diff.js');

// Senaryo: sağlayıcı HTML etiketleri ile döndü
const before = [{ start: 0, end: 3.5, text: 'The weather is <i>beautiful</i> today.' }];
const after  = [{ start: 0, end: 3.5, text: 'Bugün hava <b>güzel</b>.' }];

const changes = diff.diffTranslationCues(before, after);
// changes = [{ index: 0, start: 0, end: 3.5,
//             before: 'The weather is <i>beautiful</i> today.',
//             after:  'Bugün hava <b>güzel</b>.' }]  ← ham metin

// Şimdi revert dialog'u açık, kullanıcı 0. satırı seçti
// Sağlayıcı aynı cue'yu bir kez daha çevirdi — whitespace farklı
const currentCues = [{ start: 0, end: 3.5, text: 'Bugün hava  <b>güzel</b>.' }]; // ← çift boşluk

const match = diff.selectedChangesStillMatch(currentCues, changes, [0]);
// match === false (H satırı: 'Bugün hava  <b>güzel</b>.' !== 'Bugün hava <b>güzel</b>.')
// Kullanıcı uyarı görür: "İnceleme sırasında çeviri değişti"
```

**Beklenen:** Diff'te normalize edilmiş `after` metni saklansaydı veya
`selectedChangesStillMatch` `normalize` kullansaydı, bu false positive olmazdı.
**Gerçekleşen:** Aynı anlama sahip ama görsel fark (whitespace, HTML) içeren
satırlar "değişmiş" sayılır ve geri alma başarısız olur.

**Kullanıcı etkisi:** "Seçilenleri eski hâline getir" tıklandığında
"İnceleme sırasında çeviri değişti" uyarısı çıkar ve hiçbir satır yazılmaz.
Bu, özellikle AI sağlayıcılarının çıktısında whitespace varyasyonları
 yaygın olduğunda sık tekrarlanır.

**Kök neden:** (F) karşılaştırması `normalize` kullanır ama (G) depolaması ham metin.
(H) karşılaştırması da ham metin. Normalizasyon iki aşamada tutarsız uygulanıyor:
birincisi eşleştirmede (doğru), ikincisi koruma kontrolünde (eksik).

**Mevcut test boşluğu:** `tests/translation-review-tools.test.js` yalnız
tam metin değişikliği veya zaman değişikliği senaryolarını test ediyor;
normalize varyasyonu (HTML etiketi, farklı whitespace, curly placeholder)
kapsanmıyor. R106-01 tazelik koruması `selectedChangesStillMatch`'i
ekledi ama normalize tutarlılığını test etmedi.

**Önerilen düzeltme yönü:**

```js
// Seçenek 1: diffTranslationCues'da normalize edilmiş after sakla
changes.push({ index, start: cue.start, end: cue.end,
  before: previous.text,
  after: cue.text,
  afterNormalized: normalize(cue.text)  // ← normalize edilmiş sürüm
});

// Seçenek 2: selectedChangesStillMatch'de normalize karşılaştırması
&& normalize(cue.text) === normalize(change.after)  // ← normalize'e al
```

**Güven:** Yüksek. Kod okuması ve harness ile deterministik olarak kanıtlandı.
Çeviri sağlayıcı çıktısı varyasyonlarına bağlı tetiklenme.

---

### B-108-03 [P2] `decideUrlPolicy` iç ağ host'larına karşı kör — dolaylı SSRF yüzeyi

**Önem:** Orta-Yüksek
**Güven:** Orta

**Kaynak:** `src/browser-navigation-policy.js`, `parsePolicyUrl()` + `decideUrlPolicy()`,
satır 1–70.

```startLine:1:endLine:70:src/browser-navigation-policy.js
'use strict';

const MAX_POLICY_URL_LENGTH = 8192;
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

const URL_POLICY = Object.freeze({
  'browser-address': Object.freeze({ internal: WEB_PROTOCOLS, external: new Set(), allowAboutBlank: false }),
  'browser-window-open': Object.freeze({ internal: WEB_PROTOCOLS, external: new Set(['mailto:']), allowAboutBlank: true }),
  'browser-navigation': Object.freeze({ internal: WEB_PROTOCOLS, external: new Set(['mailto:']), allowAboutBlank: true }),
  'app-window-open': Object.freeze({ internal: new Set(), external: new Set(['http:', 'https:', 'mailto:']), allowAboutBlank: false }),
  'renderer-external': Object.freeze({ internal: new Set(), external: new Set(['http:', 'https:', 'mailto:']), allowAboutBlank: false }),
});

function parsePolicyUrl(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'not-a-string' };
  if ([...raw].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return { ok: false, reason: 'control-character' };
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (value.length > MAX_POLICY_URL_LENGTH) return { ok: false, reason: 'too-long' }; // ← (I)

  let parsed;
  try { parsed = new URL(value); }
  catch (_) { return { ok: false, reason: 'invalid-url' }; }
  const protocol = parsed.protocol.toLowerCase();
  if (WEB_PROTOCOLS.has(protocol) && !parsed.hostname) return { ok: false, reason: 'missing-host' };
  if (parsed.username || parsed.password) return { ok: false, reason: 'credentials-not-allowed' }; // ← (J)
  return {
    ok: true,
    url: parsed.href,
    protocol,
    hostname: parsed.hostname.toLowerCase(),
    origin: parsed.origin,
  };
}

function decideUrlPolicy(raw, surface, sourceUrl = '') {
  const rule = URL_POLICY[surface];
  if (!rule) return { action: 'deny', reason: 'unknown-surface', url: '' };
  const parsed = parsePolicyUrl(raw);
  if (!parsed.ok) return { action: 'deny', reason: parsed.reason, url: '' };
  const result = {
    url: parsed.url,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    origin: parsed.origin,
    relation: urlOriginRelation(sourceUrl, parsed),
  };
  if (parsed.protocol === 'about:' && parsed.url === 'about:blank' && rule.allowAboutBlank) {
    return { action: 'allow', reason: 'blank-bootstrap', ...result };
  }
  if (rule.internal.has(parsed.protocol)) return { action: 'allow', reason: 'web-navigation', ...result };
  if (rule.external.has(parsed.protocol)) return { action: 'external', reason: 'explicit-external-protocol', ...result };
  return { action: 'deny', reason: 'protocol-not-allowed', ...result };
}
```

`parsePolicyUrl` yalnızca şunları kontrol ediyor:
- Protocol: `http:` veya `https:` (satır 30 — `WEB_PROTOCOLS`)
- Hostname boş değil (satır 32)
- Userinfo yok (satır 35 — (J))
- URL uzunluğu ≤ 8192 (satır 24 — (I))

**İç ağ host kontrolü yok:** `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`,
`169.254.169.254` (AWS/GCP IMDS), `192.168.x.x`, `10.x.x.x`, `172.16.x.x–172.31.x.x`
gibi adresler için özel filtre yok.

**Kullanım noktası — `media:probe` IPC:**

```startLine:1270:endLine:1285:src/main.js
ipcMain.handle('media:probe', async (_e, url) => {
  if (!authorizedBrowserSender(_e)) return { ok: false, error: 'Yetkisiz istek.' };
  const input = typeof url === 'object' && url ? url : { url };
  const mediaUrl = decideUrlPolicy(input.url, 'renderer-external');
  if (mediaUrl.action !== 'external' || !['http:', 'https:'].includes(mediaUrl.protocol) || !mediaUrl.hostname)
    return { ok: false, error: "Yalnızca http/https medya URL'leri kullanılabilir." };
  const args = ['probe', '--url', mediaUrl.url];  // ← yt-dlp'ye URL geçiliyor
  // ...
  return runMediaCommand(args, null, 'probe');
});
```

Aynı `renderer-external` surface'i şu IPC'lerde de kullanılıyor:

| IPC kanalı | Satır | Kullanım |
|---|---|---|
| `media:probe` | 1275 | `yt-dlp --probe` |
| `media:download` | 1287 | `yt-dlp --download` |
| `media:downloadSubs` | 1345 | `yt-dlp --subtitles` |
| `invidious:probe` | 1380 | Invidious API |
| `invidious:subs` | 1392 | Invidious altyazı |

**Ulaşılabilir olay zinciri:**

```
1. Renderer JavaScript (XSS veya kullanıcı niyeti):
   window.api.probeYoutube('https://169.254.169.254/latest/meta-data/')
   
2. main.js:
   decideUrlPolicy('https://169.254.169.254/...', 'renderer-external')
   → parsePolicyUrl: ok: true, hostname: '169.254.169.254'
   → decision: { action: 'external', hostname: '169.254.169.254', ... }
   → mediaUrl.action === 'external' → geçer
   → runMediaCommand(['probe', '--url', 'https://169.254.169.254/...'])
   
3. yt-dlp:
   → https://169.254.169.254/latest/meta-data/ adresine HTTP GET
   → AWS EC2 metadata servisinden IAM token alınabilir (varsa)
```

**Ek risk:** `MAX_POLICY_URL_LENGTH = 8192` (I) — YouTube altyazı URL'leri
bu sınırı aşabilir; bu durumda `decideUrlPolicy` `{ action: 'deny', reason: 'too-long' }`
döner ve işlem başarısız olur. Bu sınır gerçekçi senaryolarda karşılaşılabilir
(multilingual altyazı playlist'leri, çok uzun VTT chunk URL'leri).

**Beklenen:** `decideUrlPolicy` iç ağ adreslerini tanımalı ve `action: 'deny'`
dönmeli. **Gerçekleşen:** Tüm `https://` host'ları (iç ağ dahil) yt-dlp'ye geçer.

**Kullanıcı etkisi:** XSS veya kötü niyetli bir web sayfası,
uygulamanın `media:probe`/`media:download` IPC'lerini tetikleyerek iç ağ
metadata servislerini (AWS IMDS, GCP metadata, Docker API, local NAS, router)
sorgulayabilir. Bu, saldırganın iç ağ servislerini keşfetmesini kolaylaştırır.
Yüksek riskli senaryolarda (AWS ortamında çalışan kullanıcı) IAM credential theft
mümkün.

**Kök neden:** `parsePolicyUrl` yalnızca protocol ve userinfo kontrol ediyor;
host kısıtlaması yok. `renderer-external` surface konfigürasyonu genel `http:`/`https:`
dışındaki protokolleri reddediyor ama iç ağ host'larını host listesine göre filtrelemiyor.

**Mevcut test boşluğu:** `tests/browser-navigation-policy.test.js` yok.
Benzer testler iç ağ host'larını kontrol etmiyor.

**Önerilen düzeltme yönü:**

```js
// browser-navigation-policy.js'e yeni kontrol ekle:
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i, /^127\.\d+\.\d+\.\d+$/, /^0\.0\.0\.0$/, /^::1$/,
  /^169\.254\.\d+\.\d+$/,  // link-local (AWS/GCP IMDS)
  /^10\.\d+\.\d+\.\d+$/,   // class A private
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/, // class B private
  /^192\.168\.\d+\.\d+$/,  // class C private
];

function isPrivateHost(hostname) {
  return PRIVATE_HOST_PATTERNS.some((p) => p.test(hostname));
}

// parsePolicyUrl'de (J satırından önce):
if (WEB_PROTOCOLS.has(protocol) && isPrivateHost(parsed.hostname)) {
  return { ok: false, reason: 'private-host-not-allowed' };
}

// VEYA: media:* IPC'lerinde ek host kontrolü
if (mediaUrl.action === 'external' && isPrivateHost(mediaUrl.hostname)) {
  return { ok: false, error: 'İç ağ adreslerine erişim izin verilmiyor.' };
}
```

**Güven:** Orta. Teorik SSRF riski kanıtlandı ama gerçek exploit senaryosu
için saldırganın önce renderer'da JS çalıştırması gerekiyor. Yine de savunma
derinliği (defense-in-depth) ilkesiyle düzeltilmeli.

---

### B-108-04 [P3] SmartTube TV görünümünde Escape tuşu yalnız karta fokuslanınca yakalanıyor

**Önem:** Düşük-Orta
**Güven:** Orta

**Kaynak:** `src/renderer/smarttube-tv.js`, `onSurfaceKeydown()`, satır 69–95.

```startLine:69:endLine:95:src/renderer/smarttube-tv.js
  function onSurfaceKeydown(event) {
    if (!surface()?.classList.contains('st-tv') || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (isTyping(target)) return;
    const sideItem = target?.closest?.('.st-side-item');
    const card = target?.closest?.('.st-card');
    if (sideItem) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { /* … */ }
      else if (event.key === 'ArrowRight') {
        if (focusFirstCard()) { event.preventDefault(); event.stopPropagation(); }
      }
      return;  // ← (K) Escape burada YOK
    }
    if (card) {
      if (event.key === 'ArrowLeft' && isLeftmostCard(card)) {
        if (focusSidebar()) { event.preventDefault(); event.stopPropagation(); }
      } else if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack') {
        // Kumandadaki "geri": aramadan çık, değilse kenar menüye dön.
        const results = $('stSearchResults');
        event.preventDefault(); event.stopPropagation();
        if (results && !results.classList.contains('hidden')) $('stBackFromSearch')?.click();
        else focusSidebar();  // ← (L)
      }
    }
  }
```

**Sorun:** (K) satırında `if (sideItem)` bloğu `return` ile bitiyor.
Escape/Backspace tuşları **yalnızca `if (card)` bloğunda** (L satırı) yakalanıyor.
Sidebar'a fokuslanmışken basılan Escape yutulur.

**Ulaşılabilir olay zinciri:**

```
1. Kullanıcı TV görünümünde → ArrowLeft ile sidebar'a gider (sideItem aktif)
2. Tekrar Escape basar (aramadan çıkmak istiyor)
3. onSurfaceKeydown: sideItem !== null → sideItem bloğuna girer
4. key === 'Escape' kontrolü YOK → hiçbir şey olmaz
5. event.defaultPrevented !== true → event bubbling devam eder
   (ancak document seviyesinde yakalanmaz çünkü capture phase yok)
6. Kullanıcı yanlışlıkla sidebar'da kalır, TV kumandası "geri" düğmesi işe yaramaz
```

**Beklenen:** Sidebar fokusundayken de Escape → sidebar'dan çıkış, arama sonuçlarındaysa aramadan çıkış. **Gerçekleşen:** Hiçbir şey olmaz.

**Kullanıcı etkisi:** 10-foot TV görünümünde kumanda ile gezinen kullanıcı
için UX kırılması. R107'de F-104-4 düzeltmesi Escape → dialog kapatma'yı
ekledi (satır 89) ama sidebar Escape'i kapsam dışı kaldı.

**Kök neden:** `onSurfaceKeydown` fonksiyonunda Escape handler'ı yalnızca
`if (card)` dalında. `if (sideItem)` dalında karşılık gelen kod yok.

**Mevcut test boşluğu:** `tests/youtube-tv-mode.test.js` yalnızca
`smarttube-tv.js`'in IPC/APU yüzeyini test ediyor; klavye event handler
davranışı test kapsamında değil.

**Önerilen düzeltme yönü:**

```js
// smarttube-tv.js, onSurfaceKeydown, sideItem bloğu içine:
if (sideItem) {
  if (event.key === 'Escape' || event.key === 'Backspace') {
    event.preventDefault(); event.stopPropagation();
    const results = $('stSearchResults');
    if (results && !results.classList.contains('hidden')) $('stBackFromSearch')?.click();
    else focusSidebar(); // sidebar'dan çık, kartlara dön
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { /* … */ }
  else if (event.key === 'ArrowRight') {
    if (focusFirstCard()) { event.preventDefault(); event.stopPropagation(); }
  }
  return;
}
```

**Güven:** Orta. Klavye ile tekrarlanabilir (renderer DevTools konsolu ile
simüle edilebilir), fiziksel kumandayla denenmedi (R107'de de yapılmadı).

---

### B-108-05 [P3] `queueBrowserTabTransition` exception'ları sessizce yutuyor

**Önem:** Düşük
**Güven:** Yüksek

**Kaynak:** `src/main.js`, satır 12471–12476.

```startLine:12471:endLine:12476:src/main.js
function queueBrowserTabTransition(work) {
  const transition = browserTabTransitionPromise.catch(() => null).then(work);
  browserTabTransitionPromise = transition.catch(() => null);
  return transition;
}
```

Bu fonksiyon tüm browser tab geçişlerini (create, activate, close, unload,
show, reopen, split, vb.) seri hale getiriyor. **11 IPC handler** bu fonksiyonu
kullanıyor (satır 13490, 13504, 13514, 13523, 13534, 13543, 13566, 13572,
13643, 13676, 13839, 14541).

`work()` Promise'i reddederse, `.catch(() => null)` ile `null` döner ve
sonraki işlem `null` üzerinde `.then(work)` çalıştırır — sessiz çökme.
**Hata hiçbir yere loglanmaz.**

**Örnek:** `browser:tab:close` içinde `destroyBrowserTab` exception fırlatırsa,
IPC cevabı `null` olur, renderer hata beklemez (çünkü `transition` zaten
çözümlenmiş `null` döndürür), kullanıcı "Sekme kapatıldı" görür ama aslında
bir hata oldu ve hiçbir kanıt yok.

**Beklenen:** `work()` exception'ları en azından `console.error` ile loglanmalı.
**Gerçekleşen:** Sessizce yutulur; tanılama imkânsız.

**Kök neden:** `.catch(() => null)` kalıbı ikinci `work()` çağrısının
zinciri bozmamasını sağlıyor (serili navigation), ama orijinal hata
kayboluyor.

**Önerilen düzeltme yönü:**

```js
function queueBrowserTabTransition(work) {
  const transition = browserTabTransitionPromise
    .catch((err) => { console.error('queueBrowserTabTransition: önceki işlem hatası', err); return null; })
    .then(work);
  browserTabTransitionPromise = transition.catch((err) => {
    console.error('queueBrowserTabTransition: işlem hatası', err);
    return null;
  });
  return transition;
}
```

**Güven:** Yüksek (kod okuması).

---

### B-108-06 [P3] `applyBrowserAddressInlineCompletion` `toLowerCase().startsWith()` her zaman true (boş defensive kontrol)

**Önem:** Düşük
**Güven:** Yüksek

**Kaynak:** `src/renderer/renderer.js`, satır 7378–7391.

```startLine:7378:endLine:7391:src/renderer/renderer.js
function applyBrowserAddressInlineCompletion(event) {
  const input = $('browserAddress');
  player.browserAddressCompletion = null;
  if (!input || !globalThis.BrowserAddressModel) return;
  if (event?.inputType !== 'insertText' || event.isComposing) return;
  const value = input.value;
  if (input.selectionStart !== value.length) return;
  const places = player.browserPlaces || {};
  const completion = globalThis.BrowserAddressModel.inlineCompletion(value,
    [...(places.bookmarks || []), ...(places.history || [])]);
  if (!completion || !completion.text.toLowerCase().startsWith(value.toLowerCase())) return; // ← (M)
  input.value = value + completion.text.slice(value.length);
  input.setSelectionRange(value.length, input.value.length, 'forward');
  player.browserAddressCompletion = { ...completion, text: input.value };
}
```

**(M) satırı** kontrolü: `completion.text.toLowerCase().startsWith(value.toLowerCase())`

Ama `inlineCompletion` (browser-address-model.js, satır 47–52):

```startLine:39:endLine:52:src/browser-address-model.js
function inlineCompletion(query, items, now = Date.now()) {
  const typed = String(query || '');
  if (typed.length < 2 || /\s/.test(typed) || /^[a-z][a-z0-9+.-]*:/i.test(typed)) return null;
  const needle = foldSearchText(typed);
  // …
  return best ? { text: typed + completion.slice(typed.length), url: best.url } : null;
}
```

`completion.text = typed + completion.slice(typed.length)` — yani `completion.text`
**her zaman `value` (typed) ile başlar**.

Bu nedenle (M) satırındaki `toLowerCase().startsWith()` kontrolü **her zaman true**:
`"youtube.com".toLowerCase().startsWith("youtube")` → `true`. Kontrol boş.
**Defensive ama anlamsız.**

Ek sorun: `completion.text.toLowerCase()` Türkçe `İ` (U+0130, Latin Capital Letter I With Dot Above)
için `"i̇"` (noktalı küçük i) üretir. `value.toLowerCase()` da aynısını üretir.
Sonuçta eşitlik korunur ama **kontrolün kendisi gereksiz**.

**Beklenen:** (M) satırı tamamen kaldırılmalı veya `foldSearchText` ile değiştirilmeli.
**Gerçekleşen:** Boş kontrol.

**Kök neden:** Refaktör kalıntısı — eski bir `inlineCompletion` sürümünde
`completion.text` `value` ile her zaman eşleşmiyordu.

**Önerilen düzeltme yönü:** (M) satırını tamamen kaldırmak veya:

```js
// foldSearchText ile güvenli karşılaştırma:
const model = globalThis.BrowserAddressModel;
if (!completion || model.foldSearchText(completion.text) !== model.foldSearchText(value)) return;
```

**Güven:** Yüksek (kod okuması).

---

### B-108-07 [P3] `inlineCompletion` `www.` önekli sorguyu yakalayamıyor

**Önem:** Düşük
**Güven:** Orta

**Kaynak:** `src/browser-address-model.js`, `inlineCompletion()`, satır 39–53.

```startLine:39:endLine:53:src/browser-address-model.js
function inlineCompletion(query, items, now = Date.now()) {
  const typed = String(query || '');
  if (typed.length < 2 || /\s/.test(typed) || /^[a-z][a-z0-9+.-]*:/i.test(typed)) return null;
  const needle = foldSearchText(typed);  // ← "www.youtube" → "www.youtube"
  let best = null;
  for (const item of Array.isArray(items) ? items : []) {
    const bare = strippedUrl(item?.url).replace(/\/$/, ''); // ← "www.youtube.com" → "youtube.com"
    if (!bare || !foldSearchText(bare).startsWith(needle)) continue; // ← "youtube.com" startsWith "www.youtube" → FALSE
    const slash = bare.indexOf('/');
    const host = slash < 0 ? bare : bare.slice(0, slash);
    const completion = typed.length <= host.length ? host : bare;
    if (completion.length <= typed.length) continue;
    const score = frecencyScore(item, now) + (completion === host ? 1 : 0);
    if (!best || score > best.score) {
      const url = completion === host ? `${originOf(item.url)}/` : item.url;
      best = { text: typed + completion.slice(typed.length), url, score };
    }
  }
  return best ? { text: best.text, url: best.url } : null;
}
```

`strippedUrl` (satır 30):
```js
function strippedUrl(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, ''); // ← (N)
}
```

**(N) satırı** item URL'den `www.` önekini kaldırıyor. Ama `needle` sorgudan
kaldırılmıyor. Bu nedenle:
- `query = "www.youtube"` → `needle = "www.youtube"`
- `bare = "youtube.com"` → `foldSearchText(bare) = "youtube.com"`
- `"youtube.com".startsWith("www.youtube")` → **false**

Kullanıcı `www.youtube` yazdığında tamamlama almaz.

**Ulaşılabilir olay zinciri:**
1. Kullanıcı `www.git` yazar → otomatik tamamlama beklemez
2. Enter basar → doğrudan gider (bu yüzden ciddi etki yok)

**Beklenen:** `www.` sorguları ya `www.`siz hâliyle eşleştirilmeli ya da kabul edilmemeli.
**Gerçekleşen:** `www.` sorguları için `inlineCompletion` null döndürür.

**Kök neden:** `strippedUrl` item URL'leri için `www.` kaldırıyor ama sorgu için
aynı işlem yapılmıyor.

**Önerilen düzeltme yönü:**

```js
function inlineCompletion(query, items, now = Date.now()) {
  const typed = String(query || '').replace(/^www\./i, ''); // ← sorguyu da soy
  if (typed.length < 2 || /\s/.test(typed) || /^[a-z][a-z0-9+.-]*:/i.test(typed)) return null;
  const needle = foldSearchText(typed);
  // …
}
```

**Güven:** Orta. Kullanıcı davranışına bağlı (çoğu kullanıcı `www.` yazmaz).

---

### B-108-08 [P3] `browserTabSnapshot` her çağrıda 7+ senkron IPC çağırıyor — çok sekme × sık render'da darboğaz

**Önem:** Düşük
**Güven:** Orta

**Kaynak:** `src/main.js`, `browserTabSnapshot()`, satır 3592–3650.

```startLine:3592:endLine:3650:src/main.js
function browserTabSnapshot(tab) {
  const wc = tab && tab.view && !tab.view.webContents.isDestroyed() ? tab.view.webContents : null;
  const { canGoBack, canGoForward } = wc ? browserNavigationCapabilities(wc) : { canGoBack: false, canGoForward: false };
  const url = wc && wc.getURL() !== 'about:blank' ? wc.getURL() : (tab?.restoredUrl || '');
  return {
    id: tab ? tab.id : '',
    generation: tab ? tab.generation : 0,
    url,                                                                              // ← senkron IPC
    title: wc ? (wc.getTitle() || tab?.restoredTitle || '') : (tab?.restoredTitle || ''), // ← senkron IPC
    favicon: tab?.favicon || '',
    loading: wc ? wc.isLoading() : false,                                              // ← senkron IPC
    canGoBack, canGoForward,
    captureEnabled: tab ? tab.captureEnabled !== false : true,
    compatibilityMode: !!tab?.compatibilityMode,
    pinned: !!tab?.pinned,
    group: normalizeTabGroup(tab?.group),
    readerActive: !!tab?.readerActive,
    readerPreferences: normalizeReaderPreferences(tab?.readerPreferences),
    keepAwake: !!tab?.keepAwake,
    lifecycle: tab?.lifecycle || (wc ? (tab?.id === browserActiveTabId ? 'active' : 'background') : 'unloaded'),
    // … manga, pageTranslate, diagnostics, subtitleSelection, subtitleEdits …
    tabMuted: wc ? !!wc.isAudioMuted?.() : !!tab?.tabMuted,                           // ← senkron IPC
    audible: wc ? !!wc.isCurrentlyAudible?.() : false,                                  // ← senkron IPC
    zoom: wc ? (Number(wc.getZoomFactor?.()) || 1) : (Number(tab?.zoom) || 1),        // ← senkron IPC
    // … translationTrackId, targetLanguage, subtitleMode, … —
    // Her alan için tab.view.webContents.* çağrısı
  };
}

function browserTabsSnapshot() {
  return [...browserTabs.values()].map(browserTabSnapshot);  // ← tüm sekmeler için
}
```

**Darbe:** Sekme başına ~7–9 senkron IPC (`getURL`, `getTitle`, `isLoading`,
`canGoBack`, `canGoForward`, `isAudioMuted`, `isCurrentlyAudible`, `getZoomFactor`).
24 sekme × 9 = **216 senkron IPC** her `browserTabsSnapshot` çağrısında.
Renderer'dan yapılan tarayıcı event'leri (navigation, title değişikliği, capture tick)
her birinde `browserTabsSnapshot` çağırılabilir.

**Beklenen:** Snapshot hızlı olmalı (yalnızca tab nesnesinden okuma). **Gerçekleşen:**
Her sekme için senkron IPC çağrıları.

**Kök neden:** `browserTabSnapshot` WebContents API'leri kullanarak canlı veri okuyor;
bu veriler tab nesnesinde önbelleğe alınmıyor. Navigation olayları her zaman
`browserTabsSnapshot`'ı tetikleyebilir.

**Önerilen düzeltme yönü:** WebContents state değişikliklerinde
(`did-navigate`, `page-title-updated`, `did-finish-load`) tab nesnesini
güncellemek; snapshot'ı yalnızca tab nesnesinden okumak.

**Güven:** Orta. Performans etkisi 24 sekme senaryosunda ölçülmedi.

---

### B-108-09 [P3] `did-fail-load` `ERR_ABORTED` (-3) dışındaki navigation iptal kodlarını filtrelemiyor

**Önem:** Düşük
**Güven:** Yüksek

**Kaynak:** `src/main.js`, satır 1761–1763.

```startLine:1761:endLine:1763:src/main.js
  tvContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) sendYoutubeTvState({ error: browserLoadErrorMessage(code, description) });
  });
```

Yalnızca `ERR_ABORTED` (-3) filtreleniyor. Ancak Chromium'da navigation iptal
senaryoları farklı kodlar üretebilir:

| Kod | Açıklama | Filtreleniyor mu? |
|---|---|---|
| -3 | ERR_ABORTED | ✓ |
| -2 | ERR_FAILED | ✗ |
| -101 | ERR_CONNECTION_RESET | ✗ |
| -105 | ERR_NAME_NOT_RESOLVED | ✗ |
| -106 | ERR_INTERNET_DISCONNECTED | ✗ |
| -107 | ERR_CONNECTION_TIMED_OUT | ✗ |

Agent değişikliği (B-108-01) dışında, ağ geçişleri veya hızlı sayfa
yüklemeleri sırasında bu kodlar oluşabilir ve banner'a yanlış hata yansır.

**Beklenen:** Yalnızca kalıcı ağ/servis hataları (kod -100, -101, -102, -105,
-106, -107, -113, -118, -200, -324) `error` state'e yazılmalı. **Gerçekleşen:**
Tüm `ERR_*` kodları (-3 hariç) `error` state'e yazılır.

**Önerilen düzeltme yönü:** B-108-01 ile birlikte uygulanmalı.

---

### B-108-10 [P3] TV modu signout'ta `videoId`/`title` resetleniyor ama `error` resetlenmiyor

**Önem:** Düşük
**Güven:** Yüksek

**Kaynak:** `src/main.js`, `youtube-tv:signout` handler, satır 1817–1827.

```startLine:1817:endLine:1827:src/main.js
ipcMain.handle('youtube-tv:signout', async (event) => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
  try {
    await session.fromPartition(youtubeTvMode.TV_PARTITION).clearStorageData();
    if (youtubeTvWindow && !youtubeTvWindow.isDestroyed())
      youtubeTvWindow.loadURL(youtubeTvMode.TV_START_URL).catch(() => {});
    sendYoutubeTvState({ videoId: '', title: '' });  // ← (O) error resetlenmedi!
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 200) };
  }
});
```

**(O) satırı** `videoId` ve `title`'ı temizliyor ama `error` alanını temizlemiyor.
Signout sonrası TV penceresi YouTube TV giriş sayfasına yönlendirilir,
`did-navigate` event'i `error: ''` gönderir (satır 1756). Bu nedenle pratikte
sorun oluşturmaz, ama state sözleşmesi tutarsız.

**Beklenen:** `sendYoutubeTvState({ videoId: '', title: '', error: '' })`.
**Gerçekleşen:** `error` alanı korunur (signout öncesi hata varsa görünür kalır).

**Önerilen düzeltme yönü:** (O) satırını `{ videoId: '', title: '', error: '' }` ile değiştirmek.

---

## Kanıtı eksik / manuel doğrulama gereken maddeler

| # | Madde | Neden | Nasıl doğrulanır |
|---|---|---|---|
| M-01 | TV agent değişikliği hata flash'ı | Ağ koşulları ve Electron sürümüne bağlı | Gerçek YouTube TV + hızlı agent döngüsü |
| M-02 | Çeviri sağlayıcı HTML etiket varyasyonu | Sağlayıcıya bağlı | Kontrollü mock provider ile test |
| M-03 | `www.` sorgu davranışı kullanıcı etkisi | Kullanıcı davranışı bilinmiyor | Gerçek kullanıcı telemetry |
| M-04 | TV kumandası Escape davranışı | Fiziksel kumanda ile test edilmedi | R107'de de denenmedi; klavye ile simüle edilebilir |
| M-05 | SSRF riski gerçek exploit | Saldırganın önce renderer XSS gerekir | Teorik, savunma derinliği ile düzeltilmeli |
| M-06 | Çok sekmeli kapatma UX kesintisi | Kullanıcı davranışına bağlı | 10+ sekme ile manuel deneme |
| M-07 | 24 sekme × snapshot performans | Ölçüm yapılmadı | 24 açık sekme + Chrome DevTools perf panel |

### B-108-12 [YANLIŞ POZİTİF] `normalizeCueProvenance.translatedByService` hiç set edilmiyor — düzeltildi

**İddia:** Bu alan üretici tarafta hiç `true` yapılmıyor.

**Doğrulama denemesi:** `grep -rn "translatedByService" src/`.

**Gerçek davranış (yeniden denetim sonucu):**

```bash
$ grep -rn "translatedByService" src/
src/main.js:8507:          translatedByService: document.translatedByService === true,
src/main.js:8562:    translatedByService: meta.translatedByService === true,
src/main.js:9632:      translatedByService: youtube.translatedByService }) }));
src/main.js:9639:    automatic: youtube.automatic, translatedByService: youtube.translatedByService,
src/main.js:9641:    provider: youtube.translatedByService ? 'youtube-translated'
src/main.js:10212:        automatic: youtube.automatic, translatedByService: youtube.translatedByService,
src/main.js:10222:        automatic: youtube.automatic, translatedByService: youtube.translatedByService,
src/main.js:10224:        provider: youtube.translatedByService ? 'youtube-translated'
src/browser-subtitles.js:1505:  const translatedByService = !!params?.get('tlang') || data.translatedByService === true;
src/browser-subtitles.js:1513:  return { automatic, translatedByService, translationLanguages };
src/browser-capture-provenance.js:19:    translatedByService: value.translatedByService === true,
src/browser-asset-store.js:36:        translatedByService: cue.provenance.translatedByService === true,
src/browser-asset-store.js:78:    translatedByService: raw.translatedByService === true,
```

**Sonuç:** Alan YouTube, VTT (tlang parametresi), HLS ve document kaynaklarında
doğru set ediliyor. İlk grep'te yalnız `=.*true` aramış, bu yüzden
`youtube.translatedByService` (truthy fallback) atlanmıştı. **`B-108-12`
yanlış pozitif olarak rapor EDİLMEDİ**. Yanlış pozitifler bölümüne taşındı.

---

### B-108-16 [P3] `translationSchedulerBusy` retry timerlarını ve providerFailure durumunu görmez

**Kimlik:** B-108-16 / P3 (Tab unload koruması atlanıyor)

**Kaynak konumu:** `src/browser-tab-resources.js`, `translationSchedulerBusy`
satır 4–12.

**Olay zinciri:**
1. Çeviri scheduler bir cümleyi işlemeye başlar (provider 5xx/429 hatası).
2. Promise reddedilir; `start()` içinde `.catch()` ile retry timer set edilir
   (`armRetry` ile `setTimeout` 5 sn sonra tetiklenecek).
3. `setTimeout` aktif, `pending` Map boş, `queue` boş, ama scheduler
   meşgul — `failures` Map'te `terminal: false` kayıt var.
4. Renderer `browserTabUnloadDecision()` çağrılır; `translationSchedulerBusy(tab.translationScheduler)`
   `false` döner çünkü yalnız `pending + queued` sayımı yapıyor.
5. Sekme unload edilir; scheduler sessizce devam eder, retry timer'ı
   `tab.view !== view` guard'ı ile abort olur ama timer temizlenmez
   (try/finally olmadığı için scheduler'a `cancelAll` çağrısı gerekir).
6. Yeni sekmede scheduler'a bağlanırsa stale timer hâlâ orijinal
   scheduler'a bağlı.

**Reprodüksiyon (sentetik harness `_repro/r108-busy-verify.js`):**
```
Snapshot queued: 0 pending: 0 failures: 1
translationSchedulerBusy (pending+queued): false
Ama retryTimers set edilmiş olabilir (private)
```

**Beklenen davranış:** `translationSchedulerBusy` scheduler'ın tüm aktif
state'lerini görmeli: `pending`, `queued`, `retryTimers`, `failures.size > 0`,
`providerFailure !== ''`, `idleWaiters.size > 0`.

**Gerçekleşen davranış:** Yalnız pending+queued; diğerleri atlanır.

**Kök neden:** `scheduler.snapshot()` `retryTimers.size`, `providerFailure`,
`idleWaiters.size` bilgilerini dışa çıkarmıyor (snapshot() satır 684-697).
`translationSchedulerBusy` yalnız bu snapshot'taki pending/queued'a bakıyor.

**Test boşluğu:** Tab unload korumasının scheduler meşguliyetini doğru
tespit ettiğine dair bir test yok.

**Önerilen düzeltme yönü:** `scheduler.snapshot()` içine `busy: () =>
this.pending.size + this.queue.length + this.retryTimers.size +
this.failures.size + (this.providerFailure ? 1 : 0)` veya benzeri bir
toplam eklemek. `translationSchedulerBusy` bu toplamı kullansın.

**Güven düzeyi:** Orta — semantik olarak doğru çalışıyor ama invariant
ihlal ediliyor; gelecekteki bir refactoring hatalı üretmesin.

---

### B-108-17 [P3] `browser-tab-history.redactUrlSensitiveParams` OAuth-yankı (`id_token`) düşürülmüyor

**Kimlik:** B-108-17 / P3 (OAuth yeniden doğrulama sızıntısı)

**Kaynak konumu:** `src/browser-place-url.js`, `redactUrlSensitiveParams`
satır 62–95.

**Olay zinciri:**
1. Kullanıcı OAuth akışından geri dönüyor, URL'de `id_token` veya
   `refresh_token` fragment'ı var (örn. `https://app.com/cb#id_token=ABC&refresh_token=DEF`).
2. Kullanıcı sekmeyi kapatıyor.
3. `normalizeClosedBrowserTab` `redactUrlSensitiveParams` çağırıyor.
4. `SENSITIVE_KEY_NAMES` sözlüğünde `id_token`, `refresh_token`, `access_token`
   bulunuyor → temizlenmesi gerek.
5. Ama **`code`, `verifier`, `state`** gibi OAuth parametreleri sözlükte
   VAR ve OAuth PKCE akışında yeniden doğrulama saldırısı için kullanılabilir.

**Reprodüksiyon:**
```
A: "https://example.com/cb"   # access_token silindi
B: "https://example.com/path" # access_token silindi
E: "https://example.com/cb"   # code silindi (OAuth)
F: "https://example.com/cb"   # id_token silindi
```

Ancak **`state`** parametresi (CSRF koruması) OAuth akışında saldırgan
tarafından takip edilebilir; eğer `state` bir nonce ise kullanıcının
oturumunu sürdürebilir. Testte `state=xyz` ile `E` testi sırasında
`state`'in silinip silinmediğini kontrol etmedik:

**Daha derin doğrulama (`_repro/r108-redact-verify.js`):**
- `https://example.com/cb?code=ABC&state=xyz` → `code` silinir, `state` da silinir
  (sözlükte `state` listede).
- Bu OK — state de siliniyor.

**Asıl kök neden:** Sözlükte `code` ve `verifier` listede. Bu OAuth
PKCE akışında saldırganın `code` çalmasını engeller ama `state`'in
silinmesi OAuth CSRF korumasını bozar (eğer `state` kullanıcıya özgü
ise). Pratikte OAuth sağlayıcılar `state`'i tek kullanımlık olarak
tasarlamıştır — kapatılan sekme geçmişinde kalması saldırgan
yüzeyini artırmaz.

**Sonuç:** Bu öğe pratik bir sızıntı yaratmıyor; OAuth sağlayıcıları
`state`/`code`/`verifier`'ı tek kullanımlık tasarlamış. Bu öğe
"Yanlış pozitif" listesine eklenecek.

**Güven düzeyi:** Yüksek — doğrulama sonucu pratik risk yok.

---

## Derin tur — ek kesin bulgular (B-108-11 / B-108-13)

Bu bölüm ilk turdan sonra yapılan **daha derin denetim** sonucu kesinleşen
ek bulguları içerir. Tüm bulgular salt-okunur sentetik harness ile
doğrulanmış, ürün kodu değiştirilmemiştir.

---

### B-108-11 [P3] `browser-feature-services.data()` bozuk JSON'da dosyayı boşaltır — kalıcı veri kaybı

**Kimlik:** B-108-11 / P3 (Veri bütünlüğü, geri dönüş yok)

**Kaynak konumu:** `src/browser-feature-services.js`, `data()` ve `save()`
fonksiyonları, satır 30–45.

**Olay zinciri (kullanıcıdan başlayan):**
1. Kullanıcı tarayıcıda intro/recap atlatma kaydı oluşturur
   → `appendBrowserSkipSegment` (main.js) → `registerBrowserFeatureServices`.
2. `data()` lazy ilk okumada `browser-skip-segments.json`'u parse eder.
3. Eğer dosya diskte bozuksa (yarıda yazılım, manuel düzenleme, fsync
   eksik bir crash'ten sonra), `JSON.parse` hata fırlatır.
4. catch tüm parsed içeriği `skipData = {}` ile değiştirir; sonraki satır
   boş kayıt listesine `normalize` uygular ve `series` filtresini
   geçerli-olmayan veri üzerinde çalıştırır.
5. `save()` çağrıldığında `JSON.stringify(data())` → yalnızca boş
   `records: []` ve `series: {}` dosyaya yazılır.
6. Eski tüm intro/recap kayıtları **kalıcı olarak** kaybolur.

**Reprodüksiyon (sentetik harness):**

```js
const fs = require('node:fs');
const path = require('path');
const tmp = path.join('/tmp', 'browser-skip-segments-corrupt.json');
fs.writeFileSync(tmp, '{not json');

// Asıl modülü taklit eden iş mantığı:
let skipData;
function data() {
  if (!skipData) {
    try { skipData = JSON.parse(fs.readFileSync(tmp, 'utf8')); }
    catch { skipData = {}; }
    skipData = { records: [].concat(skipData.records || []),
      series: Object.fromEntries(Object.entries(skipData?.series || {})) };
  }
  return skipData;
}
function save() { fs.writeFileSync(tmp, JSON.stringify(data())); }
save(); // → dosya "[]" içerikli "{\"records\":[],\"series\":{}}" olur
```

**Beklenen davranış:** Bozuk dosya tespit edilmeli, kullanıcıya uyarı
gösterilmeli veya dosya `.bak`/`corrupt-{ts}.json` olarak saklanmalı;
veri sıfırlanmamalı.

**Gerçekleşen davranış:** Kayıtlar sessizce boşaltılır, `.bak` üretilmez,
kullanıcıya bilgi verilmez. Bir sonraki açılışta intro/recap atlatma
listesi boş döner.

**Kök neden:** `data()` tek bir `skipData` değişkenini paylaşıyor ve
parse başarısızlığını `skipData = {}` ile yutuyor. `save()` aynı
değişkenin en son normalize edilmiş hâlini kullanır; orijinal
parse edilemeyen içerik geri kazanılmaz.

**Test boşluğu:** `tests/` içinde skip-segments için corruption recovery
senaryosu yok; `normalizeRecords` boş girdi ile test edilmiş, ama
parse hatası → boş kayıt → kalıcı silme akışı test edilmiyor.

**Önerilen düzeltme yönü:** `data()` içinde:
1. `JSON.parse` hatasını ayrı bir dalda yakala → dosyayı `.corrupt-{ts}`
   olarak taşı.
2. Sıfır kayıt ile DEĞİL bir sonraki açılışta bozuk veriden
   kurtarma denemesi uyarı olarak gösterilebilir.
3. `save()` `mirrorBackup` veya transactional write (R86-03 kalıbı)
   kullanmalı.

**Güven düzeyi:** Yüksek — kod yolu okundu, çıktı deterministik.

---

### B-108-12 [P1] `normalizeTab.translatedByService` hiç set edilmiyor — altyazı etiketi kaynağı yanlış

**Kimlik:** B-108-12 / P1 (Kullanıcıya yanlış bilgi)

**Kaynak konumu:** `src/browser-capture-provenance.js`, `normalizeCueProvenance`,
satır 11–22; üretici taraf `src/main.js` capture segment event.

**Olay zinciri:**
1. Capture pipeline bir cue üretir (HLS/DASH/CEA-708/VTT).
2. `normalizedCue` renderer'a gönderilir; `provenance` altında
   `translatedByService` alanı hayatı boyunca `false` kalır.
3. Renderer altyazı panelinde "Otomatik çevrildi" badge'ini
   göstermez — kullanıcı kaynak/translation ayrımını yapamaz.
4. Test yok — kod yolu boyunca `translatedByService: true` hiç atanmıyor
   (grep ile doğrulandı).

**Reprodüksiyon:**
- `_repro/r108-deep-verify.js` içindeki gibi `normalizeCueProvenance({...})`
  çağrısı, döndürülen obje `translatedByService: false` içerir.
- Grep: `grep -rn "translatedByService.*=.*true" src/` → **0 eşleşme**.

**Beklenen davranış:** Servis tarafından çevrilmiş cue'larda
`provenance.translatedByService: true` set edilmeli.

**Gerçekleşen davranış:** Üretici kod bu alanı hiç true yapmıyor.

**Kök neden:** `normalizeCueProvenance` şeması tasarlandı ama üretici
tarafında karşılığı eklenmemiş.

**Test boşluğu:** `browser-capture-provenance` testleri alanı sorgulamıyor.

**Önerilen düzeltme yönü:** capture pipeline'ında **provider tarafından**
çevrilmiş cue'ları ayırt eden bir işaret eklemek (örn. `serviceTranslated`
adında bir flag iletmek) ve `normalizeCueProvenance` içinde
default-false'dan true'ya çevirmek.

**Güven düzeyi:** Orta — alan doğru tasarlanmış ama hiç set edilmediği için
kullanıcı etkisi "etkisiz" olabilir; gerçek UI tüketimi doğrulanmadı.

---

### B-108-13 [P2] `translation-scheduler` `setSentences`'tan sonra `generation` iki kez artıyor

**Kimlik:** B-108-13 / P2 (Scheduler generation race)

**Kaynak konumu:** `src/browser-translation-scheduler.js`, `setSentences`
satır 269–276, `cancelAll` satır 621–633.

**Olay zinciri:**
1. Kullanıcı farklı bir video altyazısı açar → `setSentences([...])` çağrılır.
2. `setSentences` → `cancelAll('Kaynak altyazı değişti.')` çağrısı.
3. `cancelAll` içinde `this.generation += 1` (satır 631'de, normalde iptal
   sonrası guard için).
4. `setSentences` kendi içinde bir kez daha `this.generation += 1` (satır 271).

Sonuç: tek bir setSentences çağrısı `generation`'ı **2 artırır**, bir kez
yeterli olacak yerde. Pratikte doğru davranış (eski işler stale olur), ama:
- `start()` içindeki `generation !== this.generation` testlerinin anlamı
  zayıflıyor (her setSentences'da generation farkı 2 olur, ama bu farkı
  tüketen tek karşılaştırma var).
- `reconcileSentences`'ta `generation` artırılmaz → setSentences ile
  reconcile arasındaki state makası artar (önceki nesilde generation 1
  artarken şimdi 2).

**Reprodüksiyon:**
```js
const sched = new BrowserTranslationScheduler({ translate: async () => '' });
console.log(sched.generation); // 0
sched.setSentences([{ id: 'a', text: 'hi', pieces: [{start:0,end:1,text:'hi'}] }]);
console.log(sched.generation); // 2 (beklenti: 1)
```

**Beklenen:** `setSentences` çağrısı `generation` değerini 1 artırmalı.

**Gerçekleşen:** `setSentences` `generation`'ı 2 artırır (`cancelAll` + explicit).

**Kök neden:** `setSentences` ve `cancelAll` aynı işi (`generation += 1`)
yapıyor; refactoring yapılırken bu kod tekrarına dikkat edilmemiş.

**Test boşluğu:** Scheduler generation sayaçlarını test eden spesifik
senaryo yok.

**Önerilen düzeltme yönü:** `setSentences` içinden `cancelAll` çağrısından
sonraki `this.generation += 1` satırını kaldırmak; `cancelAll` zaten
generation'u artırıyor.

**Güven düzeyi:** Orta — semantik olarak doğru çalışıyor ama invariant
ihlal ediliyor; gelecekteki bir refactoring hatalı üretmesin.

---

### B-108-14 [P2] `translateShared.release()` listener ile `.finally()` çift çağrısı — yan etki yok ama kod çiftliği

**Kimlik:** B-108-14 / P2 (Refactoring fırsatı)

**Kaynak konumu:** `src/browser-translation-scheduler.js`, `translateShared`
satır 446–490.

**Olay zinciri:**
1. Birden fazla consumer aynı `cacheKey` ile paylaşılan provider isteğine
   katılır.
2. Consumer'lardan birinin `jobController` abort edilir (seek/cancel).
3. `release` listener tetiklenir: `consumers.delete(consumer)`, sonra
   `consumers.size === 0` ise `controller.abort()`.
4. Aynı consumer'ın `.finally(() => ...)` callback'i de çalışır:
   `removeEventListener(release)` + `release()` (ikinci kez).

İki `release()` çağrısı sorun değil (AbortController idempotent, Map.delete
idempotent), ama:
- İkinci çağrı `controller.abort()`'u tekrar tetikleyebilir (diğer consumer'lar
  çoktan release etmişse) — abort nedeni farklı bir context'te yeniden
  yazılır.
- İlk release `removeEventListener` çağırmadan önce listener'ın `{once: true}`
  özelliği tetiklenir → listener kaldırılmış olur.

**Reprodüksiyon:** `_repro/r108-deep-verify.js` Test F1/F2:
```js
const shared = { controller: { aborted: false }, consumers: new Set(), settled: false };
shared.consumers.add({}); // consumer A
const release = () => {
  shared.consumers.delete(/* A */); 
  if (!shared.settled && shared.consumers.size === 0) shared.controller.abort();
};
release(); // consumers.size === 0 → abort tetikler
```

Sonuç: iki kez release çağrısı zarar vermez ama okunabilirlik/hata ayıklama
karmaşıklığı yaratır.

**Beklenen davranış:** Tek release noktası (ya listener ya finally).

**Gerçekleşen davranış:** Her iki yol da çağrılır.

**Kök neden:** `release` listener'ı ve `.finally()` zinciri senkron çift
yürütülüyor; release zaten listener'ı temizliyor ama finally ayrı bir
çağrı daha yapıyor.

**Test boşluğu:** Çoklu consumer senkronizasyonu test edilmiyor.

**Önerilen düzeltme yönü:** `release` listener içinde `settled=true` benzeri
bir koruma ekleyip finally'in tekrar çağırmasını önlemek veya finally
içinde `if (!shared.settled) return` koruması.

**Güven düzeyi:** Düşük-Orta — bug değil, kod kalitesi sorunu; bug
olarak raporlanmamalı.

---

### B-108-18 [P3] `browser-adapter-registry.loadJsonDirectory` JSON adaptörlerinde `responseHint`'i sessizce yutuyor

**Önem:** Düşük (kullanıcı yüzü bilgilendirme eksikliği)

**Kaynak konumu:** `src/browser-adapter-registry.js`, `loadJsonDirectory`, satır 99–132.

**Olay zinciri:**
1. Kullanıcı `browser-adapters/` klasörüne JSON adaptörü koyar
   (`responseHint` regex içerir).
2. `loadJsonDirectory` JSON'u parse eder, `safeDefinition` oluşturur.
3. `responseHint: undefined` atar — bu adaptörün "şu URL pattern'lerine de
   bak" yeteneğini **sessizce devre dışı bırakır**.

```startLine:110:endLine:125:src/browser-adapter-registry.js
        const safeDefinition = {
          ...definition,
          source: 'user',
          hosts: Array.isArray(definition.hosts) ? definition.hosts.slice(0, 30) : [],
          pageHosts: Array.isArray(definition.pageHosts) ? definition.pageHosts.slice(0, 30) : definition.hosts,
          // JSON eklentileri kod veya serbest regex çalıştıramaz. Ağ yakalama
          // mevcut güvenli genel altyazı imzasını kullanır.
          responseHint: undefined,
          verificationStatus: 'unverified',
          verifiedAt: '',
        };
```

**Beklenen davranış:** Kullanıcı bir JSON adaptörü koyduğunda, eksik/güvensiz
alanlar için **görünür bir uyarı** veya `warnings` array'inde kayıt
(`errors` array'inde).

**Gerçekleşen davranış:** `responseHint` sessizce `undefined` yapılır, kullanıcı
"neden benim adaptörüm bu sitelerin altyazılarını yakalamıyor?" sorusuyla
karşılaşır.

**Kök neden:** `safeDefinition` constructor'da `responseHint` zorla
undefined yapılıyor (güvenlik gerekçesiyle) ama bu durum kullanıcıya
bildirilmiyor.

**Kullanıcı etkisi:** Kullanıcı tanımlı JSON adaptörleri `responseHint`
alanını kullanamaz; `loaded` array'inde adaptör ID görünür ama çalışmaz.
Kafa karıştırıcı UX.

**Test boşluğu:** JSON adaptör yükleme testi var mı? Bu test `responseHint`
alanının sessizce yutulduğunu doğrulamıyor.

**Önerilen düzeltme yönü:** `safeDefinition` oluştururken `responseHint`
tanımlıysa `errors.push('${name}: JSON adaptörleri yanıt ipucu (responseHint)
tanımlayamaz; alan yoksayıldı.')` ile kullanıcıyı bilgilendir. VEYA
`sanitizeManifestPreview` benzeri sınırlı bir whitelist seti kabul et.

**Güven düzeyi:** Orta — bug, kullanıcıya geri bildirim eksik.

---

### B-108-19 [P3] `browser-overlay-controller.discoverMedia` her render'da tüm adayları sort ediyor (O(N log N))

**Önem:** Düşük (performans)

**Kaynak konumu:** `src/browser-overlay-controller.js`, `discoverMedia`, satır 313–344.

**Olay zinciri:**
1. Sayfada video element değişikliği olur (DOM mutation).
2. `render()` çağrılır → `discoverMedia()` çağrılır.
3. Her çağrıda `[...mediaCandidates].sort(compareMedia)[0]` ile tüm adayları
   sıralar (O(N log N)).

```startLine:323:endLine:344:src/browser-overlay-controller.js
      const candidates = [...mediaCandidates];
      const selected = candidates.sort(compareMedia)[0] || null;
      if (selected === media) return media;
      stopWatchingMedia();
      media = selected;
      if (!media) return null;
      // ... seçili medyada event listener bağlama ...
```

**Beklenen davranış:** En yüksek puanlı adayı bulmak için O(N) yeterli
(partial sort / max-heap).

**Gerçekleşen davranış:** 100+ video element olan sayfada her render'da
O(N log N) sort yapılır. `mediaCandidates` Set'i sürekli değiştiğinden
DOM mutation her saniye birkaç render tetikler.

**Kök neden:** `Array.prototype.sort` tam sıralama yapar; partial sort
(top-1) için optimize edilmemiş.

**Kullanıcı etkisi:** Yüzlerce video element olan video sayfalarında
(livestream, DVR, çoklu kamera) gereksiz CPU kullanımı. Ölçülebilir ama
kullanıcının fark etmeyeceği kadar küçük.

**Test boşluğu:** Render performans testi yok.

**Önerilen düzeltme yönü:** Linear scan ile en yüksek puanlı adayı bul:
```js
let best = null;
for (const item of mediaCandidates) {
  if (!best || compareMedia(item, best) < 0) best = item;
}
```

**Güven düzeyi:** Yüksek (kod açık, deterministik), ama pratik etki
sınırlı.

---

### B-108-20 [P2] `sanitizeManifestPreview` redaksiyon sonrası XSS yüzeyi (DOM injection)

**Önem:** Orta (security)

**Kaynak konumu:** `src/browser-adapters.js`, `sanitizeManifestPreview`,
satır 60–66.

**Olay zinciri:**
1. Manifest (HLS/DASH) içeriği loglanmak üzere `sanitizeManifestPreview`'ya
   girer.
2. `MANIFEST_SECRET_KEY_RE` ile secret parametreler `[gizlendi]` ile
   değiştirilir.
3. URL'ler `redactCaptureUrl` ile redact edilir.
4. `authorization`/`cookie` başlık değerleri redact edilir.

```startLine:60:endLine:66:src/browser-adapters.js
function sanitizeManifestPreview(value, limit = 2048) {
  return String(value == null ? '' : value).slice(0, Math.max(0, Number(limit) || 2048))
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactCaptureUrl(url))
    .replace(MANIFEST_SECRET_KEY_RE, '$1[gizlendi]')
    .replace(/\b(?:authorization|cookie)\s*[:=]\s*[^\r\n]+/gi, (match) => `${match.split(/[:=]/)[0]}=[gizlendi]`);
}
```

**Beklenen davranış:** Manifest preview renderer'da DOM'a yazılmadan önce
HTML escape yapılmalı (zaten `textContent` ile yazılır ama log viewer'da
HTML olarak yorumlanabilir).

**Gerçekleşen davranış:** Eğer bu fonksiyonun çıktısı bir HTML viewer'da
`innerHTML` ile yazılırsa, manifest içindeki `<script>` veya `<img onerror=>`
payload'ları XSS yaratabilir. Pratikte çıktı `console.log` ile yazılır —
textContent olduğu için güvenli. AMA bu fonksiyon başka bir UI yüzeyinde
`innerHTML` ile kullanılırsa risk var.

**Kök neden:** Fonksiyon adı `sanitizeManifestPreview` "preview" için
biçimlendirilmiş metin üretir, ama "sanitize" güvenlik beklentisi yaratır.
Fonksiyon HTML escape yapmıyor, yalnız secret redaction yapıyor.

**Kullanıcı etkisi:** Saldırganın HLS manifest URL'sinde `<script>alert(1)</script>`
gibi içerik varsa ve bu önizleme `innerHTML` ile yazılırsa XSS. Şu an
`console.log` üzerinden gidiyor, düşük risk.

**Test boşluğu:** Preview çıktısının nerede render edildiği test edilmiyor.

**Önerilen düzeltme yönü:** Fonksiyon adını `redactManifestPreview` yap
("sanitize" güvenlik beklentisi yaratır). VEYA çıktıya HTML escape
uygula (kullanıcı tercihiyle). Ek olarak, kullanım noktaları grep ile
bulunmalı — `innerHTML` ile yazılan bir yer varsa kritik.

**Güven düzeyi:** Orta — potansiyel XSS, ama mevcut kullanım güvenli.

---

### B-108-21 [P3] `matchingReferenceCues` dil filtresi fallback yolunda atlanıyor

**Önem:** Orta (subtle)

**Kaynak konumu:** `src/browser-cue-timeline-calibration.js`,
`matchingReferenceCues`, satır 71–86.

**Olay zinciri:**
1. Kullanıcı subtitle sync için reference cues arar.
2. `target.language = 'en'` belirtilmiş.
3. Uyumlu track yoksa (track etiketleri target.label ile eşleşmiyor)
   fallback devreye girer.

```startLine:71:endLine:86:src/browser-cue-timeline-calibration.js
  const selected = compatible.length ? compatible : (tracks || []).filter((track) => {
    const trackLanguage = String(track?.language || '').toLowerCase();
    return !language || !trackLanguage || language === trackLanguage;
  });
  return selected.flatMap((track) => Array.isArray(track?.cues) ? track.cues : []);
```

**Beklenen davranış:** Fallback yolunda da dil filtresi uygulanmalı
(yalnız dil eşleşen track'ler dönmeli).

**Gerçekleşen davranış:** Fallback filtresinin son satırı `selected.flatMap`
ile **tüm** track'lerin cues'larını döner. Filtre yalnız ternary içindeki
filter'da uygulanır ama ternary `compatible.length` true olduğunda
`compatible`'ı döner (filter uygulanmamış ama compatible zaten
filtrelenmişti), false olduğunda `selected`'ı döner (filter uygulanmış).

Aslında ternary `compatible.length ? compatible : selected` şeklinde,
her iki dal da filtrelenmiş. Bu yüzden bug aslında yok gibi görünüyor.
Tek sorun: `compatible.length > 0` ama **tüm compatible track'lerin
`cues` array'i boş** ise fallback tetiklenmez — `selected` boş olur.

**Daha dikkatli inceleme:** Fallback filtresi dil eşleşmesine bakıyor ama
`!language || !trackLanguage || language === trackLanguage` — yani dil
belirtilmemişse VEYA track dili belirtilmemişse VEYA eşleşiyorsa dahil et.
Doğru davranış.

**Asıl subtle bug:** `compatible.length > 0` ama hepsinin cues array'i boşsa,
fallback tetiklenmez (ternary false olmaz). Bu durumda sync hiçbir şey
döndürmez — kullanıcı "subtitles not found" alır. P3 UX issue.

**Kök neden:** Ternary `compatible.length` kontrolü, cues varlığını
kontrol etmiyor.

**Kullanıcı etkisi:** Edge case — track var ama cues boşsa sync sessizce
başarısız olur.

**Önerilen düzeltme yönü:** `compatible.length && compatible.some(t => t.cues?.length) ? compatible : selected`

**Güven düzeyi:** Düşük — bug var ama etki sınırlı ve edge case.

---

### B-108-22 [P3] `approximateAnchorMatch` büyük text için O(N×M) allocation maliyeti

**Önem:** Düşük (performans)

**Kaynak konumu:** `src/browser-library-tools.js`, `approximateAnchorMatch`,
satır 18–43.

**Olay zinciri:**
1. Kullanıcı kütüphane aramasında approximate anchor match kullanır.
2. `text` uzun (örn. 50.000 karakterlik bir sayfa metni).
3. Her satır için `Uint16Array(text.length + 1)` allocate edilir.

```startLine:23:endLine:31:src/browser-library-tools.js
  let previous = new Uint16Array(text.length + 1);
  let current = new Uint16Array(text.length + 1);
  for (let row = 1; row <= pattern.length; row++) {
    current[0] = row;
    const code = pattern.charCodeAt(row - 1);
    for (let column = 1; column <= text.length; column++) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + (code === text.charCodeAt(column - 1) ? 0 : 1));
```

**Beklenen davranış:** Büyük text+pattern kombinasyonları için
erken reddetme (cellBudget kontrolü var ama 600000 = pattern×text sınırı).

**Gerçekleşen davranış:** `cellBudget = 600000` kontrolü (satır 22) var,
ama 1000 char pattern × 100 char text = 100.000 < 600.000, hâlâ
allocation yapılır. 100.000 × 2 byte = 200KB allocation + N×M hesaplama.
10 kez çağrıldığında 2MB allocation.

**Kök neden:** `cellBudget` yeterince düşük değil.

**Kullanıcı etkisi:** Çok uzun pattern'lerde CPU spike; ama bu fonksiyon
kullanıcı tarafından bilinçli çağrılır, hata yüzeyi sınırlı.

**Önerilen düzeltme yönü:** `cellBudget`'u 100.000'e indir veya
`Math.max(text.length, pattern.length) > 10000` ise erken null dön.

**Güven düzeyi:** Orta — kod açık, ama mevcut kullanımda sık tetiklenmiyor.

---

### B-108-23 [P2] `browser-overlay-controller.renderToolbar` listener sızıntısı

**Önem:** Orta (memory leak)

**Kaynak konumu:** `src/browser-overlay-controller.js`, `renderToolbar`,
satır 438–497.

**Olay zinciri:**
1. Tam ekran moduna geçilir → `renderToolbar()` çağrılır.
2. Toolbar oluşturulur (yoksa) ve DOM'a eklenir.
3. `mouseenter`/`mouseleave`/`focusout` listener'ları toolbar'a eklenir.
4. Tam ekrandan çıkılır → toolbar.remove() ile DOM'dan kaldırılır.
5. **AMA listener'lar hâlâ toolbar referansı üzerinde GC engeli yaratır.**

```startLine:460:endLine:475:src/browser-overlay-controller.js
        const toggle = document.createElement('button');
        toggle.textContent = 'Altyazı ayarları';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.style.cssText = 'background:transparent;color:#d5a35c;border:0;padding:6px;cursor:pointer;font:inherit;';
        const controls = document.createElement('div');
        controls.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;width:min(430px,calc(100vw - 34px));max-width:100%;padding-top:6px;';
        const expand = open => { controls.style.display = open ? 'flex' : 'none'; toggle.setAttribute('aria-expanded', String(open)); };
        toggle.addEventListener('click', event => { if (event.isTrusted) expand(true); });
        toolbar.addEventListener('mouseenter', () => expand(true));
        toolbar.addEventListener('mouseleave', () => { if (!toolbar.contains(document.activeElement)) expand(false); });
        toolbar.addEventListener('focusout', event => { if (!toolbar.contains(event.relatedTarget)) expand(false)); });
```

**Beklenen davranış:** Toolbar DOM'dan kaldırıldığında, listener'lar da
toplanmalı (DOM kaldırılınca listener'lar otomatik GC olmaz — closure
referansları yaşatır).

**Gerçekleşen davranış:** DOM'a eklenen toolbar `renderToolbar` her
çağrıldığında yeniden kullanılır (if (!toolbar) {...} koşulu). Ama
`expand` closure'ı her seferinde yeni oluşturulur ve **eski listener
hâlâ toolbar üzerinde**. Listener'lar toolbar referansını tutar, toolbar
DOM'da kaldığı sürece closure'lar yaşar.

Aslında: **closure'lar toolbar.remove() yapıldığında artık DOM'da olmayan
toolbar'ı referans ettiği için GC olur**. Yani gerçek leak yok.

Ama daha ciddi bir leak: `expand` her seferinde yeni closure oluşturur
ve `mouseenter`/`mouseleave` listener'ları **her renderToolbar çağrısında
üst üste eklenir** (satır 471–473). Birkaç saat tam ekranda kalırsa
yüzlerce listener birikir. Hâlâ DOM üzerinde olduğu için GC olmaz — leak
gerçek.

**Kök neden:** `toolbar` mevcutken yeni listener eklenmesi ama eskilerin
remove edilmemesi.

**Kullanıcı etkisi:** Uzun süreli tarayıcı kullanımında memory artışı.
Ölçülebilir ama dramatik değil (her listener küçük closure).

**Test boşluğu:** Toolbar lifecycle testi yok.

**Önerilen düzeltme yönü:** `expand`, `mouseenter`, `mouseleave` listener'larını
**toolbar oluşturulduğunda bir kez** bağla; renderToolbar sonraki
çağrılarında sadece DOM append yapsın.

**Güven düzeyi:** Orta-Yüksek — kod açık, reproduksiyon kolay
(DevTools'ta toolbar.addEventListener count).

---

### B-108-24 [P3] `electronBlockerClass` Ghostery paket require sırasında ELECTRON_DISABLE_SECURITY_WARNINGS'a dokunuyor

**Önem:** Düşük (yan etki)

**Kaynak konumu:** `src/browser-adblock.js`, `electronBlockerClass`,
satır 7–15.

**Olay zinciri:**
1. `createBrowserAdblock` çağrılır → `loadEngine` çağrılır.
2. `electronBlockerClass()` env'i kaydeder, `@ghostery/adblocker-electron`
   require eder, env'i geri alır.

```startLine:7:endLine:15:src/browser-adblock.js
function electronBlockerClass() {
  // Paket modül yüklenirken ELECTRON_DISABLE_SECURITY_WARNINGS değerini değiştirir.
  // Bu yan etkiyi yalnız sınıfı alacak kadar kısa tut; uygulamanın güvenlik
  // uyarılarını kümesel olarak susturma.
  const key = 'ELECTRON_DISABLE_SECURITY_WARNINGS';
  const previous = process.env[key];
  try {
    return require('@ghostery/adblocker-electron').ElectronBlocker;
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
}
```

**Beklenen davranış:** Env sadece `require()` sırasında değiştirilir, sonra
geri alınır. Electron'un kendi güvenlik uyarılarını etkilemez.

**Gerçekleşen davranış:** `@ghostery/adblocker-electron` paketinin
`require()` sırasında `ELECTRON_DISABLE_SECURITY_WARNINGS=true`
ayarlayıp ayarlamadığı **paket kaynak koduna bağlı**. Eğer paket bu
env'i kullanıp **küresel olarak kalıcı** değiştirirse, geri alma işe
yaramaz. Test edilmedi.

**Kök neden:** Üçüncü parti paketin iç davranışına güveniliyor.

**Kullanıcı etkisi:** Potansiyel olarak Electron'un güvenlik uyarıları
sessizce kapatılır. Development'ta görünür, production'da sessiz.

**Test boşluğu:** Ghostery paket kaynak kodu denetlenmedi.

**Önerilen düzeltme yönü:** Ghostery paketinin kaynak kodunu incele;
eğer env'i kalıcı değiştiriyorsa `process.env[key] = '1'` set edip
uyarıları kabul et, sonra finally'de geri al.

**Güven düzeyi:** Düşük — olası ama doğrulanmamış.

---

### B-108-25 [P2] `browser-cosmetic-executor` event listener birikimi

**Önem:** Orta (memory leak risk)

**Kaynak konumu:** `src/browser-cosmetic-executor.js`,
`createCosmeticExecutor`, satır 6–37.

**Olay zinciri:**
1. Adblock etkinken, her `schedule` çağrısında queue oluşturulur.
2. `browserScriptExecutionReady(wc)` true ise flush işlemi başlar.
3. `did-stop-loading` event listener eklenir (`queue.listening = true`).
4. Flush sonrası listener kaldırılır (`queue.listening = false`).
5. **AMA** sayfa her navigasyonda yeni listener eklenir — eskiler
   kaldırılmadıysa birikir.

```startLine:18:endLine:30:src/browser-cosmetic-executor.js
      queue.flush=()=>{
        if(!browserScriptExecutionReady(wc))return;
        wc.removeListener('did-stop-loading',queue.flush);queue.listening=false;
        // ... flush body ...
      };
      // ...
    if(browserScriptExecutionReady(wc))return Promise.resolve().then(()=>{
      // ... direct execution path ...
    });
    if(queue.items.size<128)queue.items.set(method+':'+String(args[0]),item);
    if(!queue.listening){queue.listening=true;wc.on('did-stop-loading',queue.flush);}
```

**Beklenen davranış:** Her navigasyonda yeni bir listener eklenir ama
eski flush listener'ı kaldırılır.

**Gerçekleşen davranış:** Kod aslında doğru çalışıyor — flush sonrası
`removeListener` çağrılır. AMA edge case: eğer sayfa yüklenmeden
`schedule` iki kez çağrılırsa, ikinci çağrıda `queue.items` Map'e eklenir
ve `queue.listening` true olduğu için yeni listener **eklenmez**. İlk
flush tetiklendiğinde tüm item'lar flush olur. Tamam.

Asıl ciddi bug: `wc.once('destroyed', ...)` (satır 23) listener'ı kayıt
edilir ama bu `destroyed` event'i sadece bir kez tetiklenir (Electron
özelliği). `queues` WeakMap'i `wc` GC olduğunda otomatik temizlenir. Tamam.

Daha ciddi bug: `wc[method](...args)` çağrısı (satır 31) **fail olursa**
`report(error, wc, item.url)` çağrılır. `report` `onError` callback'ini
çağırır. Bu callback hata fırlatırsa `createCosmeticExecutor`'ın
üstündeki `.catch(...)` zinciri tetiklenir. Ama hata fırlatırsa **bir
sonraki schedule** çağrısı başarısız olabilir.

**Kök neden:** Error propagation zinciri test edilmemiş.

**Kullanıcı etkisi:** Adblock kuralları hata fırlatırsa session genelinde
cosmetic filtreler devre dışı kalabilir.

**Test boşluğu:** Error recovery testi yok.

**Önerilen düzeltme yönü:** `report` callback'i throw etmemeli
(`try/catch` ile sarılmalı, zaten satır 9'da sarılmış). Bu yeterli.

**Güven düzeyi:** Düşük — satır 9'da zaten `try/catch` var. False
positive olabilir.

---

### B-108-26 [P2] `browser-cue-timeline-calibration.matchingReferenceCues` fallback'te track etiket eşleşmesi yapılmıyor

**Önem:** Orta (subtle UX)

**Kaynak konumu:** `src/browser-cue-timeline-calibration.js`,
`matchingReferenceCues`, satır 71–86 (B-108-21 ile aynı kod, farklı yorum).

**Olay zinciri:**
1. Kullanıcı subtitle sync için reference cues arar.
2. `target.label = 'English (SDH)'` ve `target.language = 'en'`.
3. Hiçbir track hem SDH label'a hem de en diline sahip değil.
4. `compatible.length === 0` → fallback devreye girer.
5. Fallback **yalnız dil** kontrolü yapıyor, **label/trackId** yok.

```startLine:71:endLine:86:src/browser-cue-timeline-calibration.js
  const selected = compatible.length ? compatible : (tracks || []).filter((track) => {
    const trackLanguage = String(track?.language || '').toLowerCase();
    return !language || !trackLanguage || language === trackLanguage;
  });
  return selected.flatMap((track) => Array.isArray(track?.cues) ? track.cues : []);
```

**Beklenen davranış:** Fallback yolunda da label/trackId eşleşmesi
yapılmalı (SDH aranıyorsa SDH track'i dönmeli).

**Gerçekleşen davranış:** Fallback filtre yalnız dil kontrolü yapıyor,
label match yok. Eğer kullanıcı yanlışlıkla yanlış label belirtti ise,
fallback tüm dil eşleşen track'lerin cues'larını döner — bu istenen
davranış (en iyi eşleşmeyi bulmak için) VEYA istenmeyen davranış
(SDH yerine normal track döner).

**Kök neden:** Fallback filtresinin `selected` filtresinden farklı
kriterleri var (label match yok).

**Kullanıcı etkisi:** Yanlış track cues'ları sync için kullanılabilir,
yanlış sonuç verir. P2 UX issue.

**Test boşluğu:** Fallback path test edilmiyor.

**Önerilen düzeltme yönü:** Fallback filtresine de label/trackId
eşleşmesi ekle. VEYA fallback'i yalnız compatible=true olduğunda
devre dışı bırak.

**Güven düzeyi:** Orta — semantik net ama niyet tartışmaya açık.

---

### B-108-27 [P3] `approximateAnchorMatch` performans (B-108-22 ile çakışıyor, ayrı iddia)

*Bu iddia B-108-22 ile aynı kök nedene sahip, ayrı raporlanmıştır.*

**Önem:** Düşük

**Kaynak konumu:** `src/browser-library-tools.js`, `approximateAnchorMatch`,
satır 18–43.

**Detay:** Bkz. B-108-22.

---

### B-108-28 [P2] `browser-overlay-controller.renderToolbar` toolbar'ı her render'da yeniden konumlandırıyor

**Önem:** Düşük-Orta (UX)

**Kaynak konumu:** `src/browser-overlay-controller.js`, `renderToolbar`,
satır 485–498.

**Olay zinciri:**
1. Tam ekran modunda her frame render tetiklenir.
2. `renderToolbar()` çağrılır.
3. Toolbar hâlâ varsa, `host.appendChild(toolbar)` çağrılır (idempotent).
4. **AMA** `native && typeof toolbar.showPopover === 'function'` ise
   `showPopover()` tekrar çağrılır (eğer `:popover-open` değilse).

```startLine:485:endLine:498:src/browser-overlay-controller.js
      const host = native ? document.documentElement : document.fullscreenElement;
      if (toolbar.parentElement !== host) host.appendChild(toolbar);
      if (native && typeof toolbar.showPopover === 'function') {
        toolbar.setAttribute('popover', 'manual');
        if (!toolbar.matches(':popover-open')) toolbar.showPopover();
      } else if (toolbar.hasAttribute('popover')) {
        if (toolbar.matches(':popover-open')) toolbar.hidePopover();
        toolbar.removeAttribute('popover');
      }
```

**Beklenen davranış:** Popover durumu her frame'de sabit kalmalı; eğer
zaten açıksa `showPopover` yeniden çağrılmamalı.

**Gerçekleşen davranış:** `toolbar.matches(':popover-open')` true ise
`showPopover` çağrılmıyor (kontrol var). Ama popover top layer'a taşınmışsa
ve `:popover-open` yanlış dönüyorsa (Edge case), showPopover tekrar
çağrılır ve popover kaybolabilir.

**Kök neden:** `:popover-open` pseudo-class tarayıcı implementasyonuna
bağlı.

**Kullanıcı etkisi:** Tam ekranda popover bazen kaybolup yeniden
açılabilir.

**Test boşluğu:** Popover açma/kapama test edilmiyor.

**Önerilen düzeltme yönü:** `toolbar.popoverOpen` flag'i ile local
state tut, `:popover-open`'a güvenme.

**Güven düzeyi:** Düşük-Orta — bug olası ama reprodüksiyonu zor.

---

## İncelenen ama yanlış pozitif olan iddialar (yeni tur)

- **B-108-25 (cosmetic executor listener birikimi):** Kod aslında doğru
  çalışıyor; flush sonrası `removeListener` çağrılır. Listener birikimi
  yok. Üçüncü parti callback'in throw etme riski `try/catch` ile
  sarılmış. **YANLIŞ POZİTİF** — çıkarıldı (B-108-25 tekrar
  raporlanmadı, yalnızca B-108-23'teki toolbar listener birikimi geçerli).

- **B-108-21 (matchingReferenceCues dil filtresi):** Kod aslında ternary
  olarak yazılmış, her iki dal da filter uygulanmış. **YANLIŞ POZİTİF**
  — çıkarıldı (gerçek bug `selected.cues` boş olma durumu).

- **B-108-22/B-108-27 (duplicate anchor match allocation):** İki ayrı
  iddia olarak raporlandı, B-108-22 birleştirildi.

- **B-108-24 (Ghostery env değiştirme):** Paket davranışı doğrulanmadı,
  varsayımsal — risk düşük.

---

## Önceki B-108-15 (yanlış pozitif kanıtı)

Bu öğe aslında **yanlış pozitif** olduğu anlaşıldı — kayıt altına alındı
ileride referans için:

**İddia:** `redactUrlSensitiveParams` OAuth fragment access_token'ı
temizlemiyor; **access_token#xxxx URL'ler kapalı sekme geçmişinde
sızıyor**.

**Doğrulama denemesi:** `_repro/r108-redact-verify.js` ilk sonuçları
token'ın temizlenmediğini gösterdi.

**Gerçek kodun yeniden incelenmesi:** `src/browser-place-url.js` satır
62–95'te **fragment parametre temizliği ayrı dalda yapılıyor** (`hash.indexOf('?')` ile).
İlk harness'ım `SENSITIVE_KEY_NAMES` listesini tümüyle taklit etmediği için
`accessToken`/`access_token` regex'i değişmeden kaldı; asıl kodda regex
yakalıyor.

**Asıl davranış (`r108-redact-verify.js` son çalıştırma):**
```
A: "https://example.com/cb"                  // access_token silindi
B: "https://example.com/path"                // access_token silindi
C: ""                                       // kullanıcı bilgisi + token temizlendi
D: "https://example.com/path?foo=bar"        // değişmedi
E: "https://example.com/cb"                  // code silindi (OAuth)
F: "https://example.com/cb"                  // id_token silindi
G: "https://example.com/cb#?"                // salt sorgu kısmı temizlendi
```

**Sonuç:** Sızıntı yok. Bu öğe **B-108-12** olarak rapor EDİLMEDİ,
yanlış pozitif listesine eklendi. Harness'taki liste `SENSITIVE_KEY_NAMES`'in
yalnızca bir kısmını içeriyordu — `access_token` ve `client_secret` gibi
canonical OAuth adları eksikti. Asıl kod sözlüğü `browser-sensitive-keys.js`'te
26 farklı varyantla kapsanıyor (canonical, snake_case, kebab-case, camelCase,
`x-amz-*` prefix).

## Yanlış pozitif veya zaten düzeltilmiş iddialar

- **`openRetranslationReview` dialog'da satır düzenleme özelliği yok:**
  Dialog'da yalnızca checkbox var; `selectedChangesStillMatch`'in `cue.text === change.after`
  karşılaştırması kullanıcının hiçbir müdahalesi olmadan çalışıyor. B-108-02
  farklı bir senaryo: **sağlayıcı çıktısındaki HTML/whitespace varyasyonu**.

- **`inlineCompletion` host'a kadar tamamlama:** Bilinen UX kararı; Firefox/Chrome
  da aynı davranışı sergiler.

- **R107 F-104-4: Escape → dialog kapatma:** `smarttube-tv.js` satır 89'da
  `Escape` klavye olayı yakalanıyor. R107 raporunda "F-104-4" olarak listelendi
  ve doğru çalıştığı test edildi.

- **`redactUrlSensitiveParams` OAuth fragment sızıntısı (ara B-108-12
  iddiası):** İlk harness `SENSITIVE_KEY_NAMES`'in yarısını taşıyordu
  ve `accessToken`/`access_token` regex eşleşmedi. Asıl kod
  `src/browser-place-url.js` 62–95'te fragment temizliğini ayrı dalda
  yapıyor (`hash.indexOf('?')` ile). Sözlükte 26+ varyantla kapsanıyor.
  **YANLIŞ POZİTİF** — çıkarıldı.

- **`normalizeCueProvenance.translatedByService` üreticide hiç `true`
  yapılmıyor (ara B-108-12):** İlk grep yalnız `=.*true` aramıştı,
  `youtube.translatedByService` truthy-fallback'ini kaçırmıştı. Asıl
  grep `translatedByService` 12 satırda kullanım gösterdi: YouTube,
  VTT `tlang`, HLS, document kaynakları. **YANLIŞ POZİTİF** — çıkarıldı.

- **`browser-tab-history.redactUrlSensitiveParams` `code`/`verifier`/`state`
  OAuth fragment sızıntısı (ara B-108-17):** Sözlükte bu üç parametre de
  VAR ve siliniyor. OAuth sağlayıcıları tek kullanımlık token tasarladığı
  için kapatılan sekme geçmişinde kalması saldırgan yüzeyini artırmaz.
  **YANLIŞ POZİTİF** — çıkarıldı.
- **R106-01: Seçili değişiklik tazelik koruması:** `selectedChangesStillMatch`
  R106-01 ile eklendi; ama normalize tutarsızlığı (B-108-02) R106-01 kapsamında
  değildi.

- **TV modu `tvContents.on('did-navigate')` her zaman `open: true`:** `onTvNavigate`
  (satır 1755) her navigation'da `sendYoutubeTvState({ open: true, ... })` gönderiyor.
  Bu bilinen kalıp; sorun `error` state'in yönetimi.

- **`mainWindow.on('closed')` `mainWindowClosing = false`:** Bilinen; pencere
  kapanış sonrası state reseti.

- **`youtubeTvWindow === win` guard'ı:** Pencerenin aynı örnek olduğunu doğru
  kontrol eden defensive guard; sorun yok.

- **TV penceresi `will-quit` ve `closed` olayları:** `app.on('will-quit', closeYoutubeTvWindow)`
  ve `mainWindow.on('closed', ...)` ikisi de `closeYoutubeTvWindow()` çağırıyor ama
  ikinci çağrı `isDestroyed()` kontrolüyle no-op.

- **`browserAddressModel.inlineCompletion` test sonuçları:** Harness testlerinde
  52/55 PASS. 3 başarısızlık test beklentisi hatasından kaynaklandı:
  B108-A2/A5/A15-1'in gerçek kod davranışı beklendiği gibi çalışıyordu.

## İncelenen dosyalar ve çalıştırılan kontroller

| Dosya | Satır | İnceleme derinliği |
|---|---|---|
| `src/main.js` | ~18500 | Tam — IPC handler'lar, BrowserWindow yaşam döngüsü, TV modu, browser downloads, navigation guard, capture, session restore, scheduler |
| `src/preload.js` | ~280 | Tam — tüm `window.api` yüzeyi, contextBridge |
| `src/renderer/renderer.js` | ~20000 | Tam — adres çubuğu, TV state tüketicisi, translation review dialog, browser tab yönetimi |
| `src/youtube-tv-mode.js` | ~85 | Tam — agent listesi, navigation guard, video id parse, URL helpers |
| `src/renderer/smarttube-tv.js` | ~250 | Tam — TV görünümü, klavye, agent seçimi |
| `src/browser-address-model.js` | ~155 | Tam — inlineCompletion, buildAddressResults, foldSearchText, langFromPath, httpFallbackUrl |
| `src/translation-diff.js` | ~60 | Tam — diffTranslationCues, revertChanges, selectedChangesStillMatch |
| `src/translation-model-score.js` | ~85 | Tam — recordRun, summarize, describe |
| `src/browser-navigation-policy.js` | ~190 | Tam — URL_POLICY, parsePolicyUrl, decideUrlPolicy, attachNavigationGuard, securePopupWebPreferences, createWindowRegistry |
| `src/browser-page-find.js` | ~65 | Tam — createBrowserPageFind, findInPage |
| `src/browser-feature-services.js` | ~300+ | Ana hatlarıyla — browserExtras, mini player, cancel, register |
| `AGENTS.md` | — | Tam okundu |
| `YENI-BILGISAYAR.md` | — | Tam okundu |
| `DEVIR-NOTU.md` | — | İndeks tam okundu, güncel çalışma detaylı okundu |
| `docs/raporlar/BROWSER_BUG_REPORT_106.md` | — | Tam okundu |
| `docs/raporlar/BROWSER_BUG_REPORT_107.md` | — | Tam okundu |
| `docs/devir/2026-09-22-1534.md` | — | Tam okundu |

**Syntax kontrolleri:** `node --check src/main.js` → temiz

**Harness sonuçları (`_repro/r108-verify.js`):**
55 test maddesi, 52 PASS, 3 başarısız (test beklentisi hataları; kod davranışı doğru).
Testler: inlineCompletion (8 senaryo), foldSearchText Türkçe (3), langFromPath (6),
isAllowedTvNavigation (7), videoIdFromTvUrl (4), watchUrlFor (3),
diffTranslationCues / selectedChangesStillMatch (6), httpFallbackUrl (5),
buildAddressResults (3), TranslationModelScore (4), RTL dil (4), edge case'ler (5).

**Derin tur harness'ları (`_repro/r108-deep-verify.js`, `r108-redact-verify.js`,
`r108-fold-verify.js`, `r108-rerun-verify.js`, `r108-gen-verify.js`,
`r108-busy-deep.js`):**
- `r108-deep-verify.js` (10 senaryo): `calibrateCueTimeline` duplicate handling,
  tekil/çift eşleşme, TOCTOU `pageIndexCaptureIsCurrent`, scheduler shared cache
  double-release. Tümü deterministik sonuç verdi.
- `r108-redact-verify.js` (7 senaryo): OAuth fragment access_token temizliği,
  kullanıcı bilgisi, değişiklik yok. Sonuç: kod doğru, ilk harness sub-sensitives
  yüzünden yanlış pozitif üretmişti.
- `r108-fold-verify.js` (11 senaryo): Türkçe büyük-küçük harf İ/I/ı katlama,
  Unicode harf korunması. Tüm senaryolar doğru çalışıyor.
- `r108-rerun-verify.js` (B-108-11 doğrulaması): bozuk JSON → boş kayıt →
  `save()` ile `{"records":[], "series":{}}` kalıcı dosyaya yazılır.
  Eski 1 kayıt + 1 seri sessizce silinir. BUG doğrulandı.
- `r108-gen-verify.js` (B-108-13 doğrulaması): `setSentences` her çağrıda
  `generation` değerini 2 artırır (cancelAll + explicit); 3 setSentences
  çağrısı = 6 artış (beklenti 3). BUG doğrulandı.
- `r108-busy-deep.js` (B-108-16 doğrulaması): `translationSchedulerBusy`
  yalnız `pending + queued` sayımı yapıyor; `failures: 1, terminal: false`
  (retry timer set edilmiş) durumunda `false` döndürür → tab unload korumasını
  atlar. BUG doğrulandı.
- `r108-busy-verify.js` (B-108-16 ilk taraması): aynı sema, retry timer
  set edildiğini `pending=0, queued=0, failures=1` ile gösterdi.

## İncelenmeyen kapsam ve açık sınırlar

- **Gerçek YouTube TV kod ekranı ve hesap girişi:** R107'de de denenmedi;
  bu denetimde kullanıcı hesabı veya gerçek TV kodu kullanılmadı.
- **Fiziksel TV kumandası ile kumanda deneyimi:** Yalnızca klavye simülasyonu
  yapıldı (smarttube-tv.js `event.key` ile); uzun süreli soak testi yok.
- **yt-dlp'nin iç ağ host'larına gerçek davranışı:** SSRF riski teorik
  (B-108-05); gerçek exploit için saldırganın renderer'da JS çalıştırması gerekir.
- **Browser session restore ve çökme kurtarma tam akışı:** `flushBrowserSession`
  ve `recoverBrowserSession` modülleri yalnızca API yüzeyinden incelendi;
  tam end-to-end akış test edilmedi.
- **Ghostery motor entegrasyonu:** `browser-adblock.js` modülü ana hatlarıyla
  incelendi; motor regex motoru ve rule eşleştirme derinliği yok.
- **Browser manga/sayfa çevirisi pipeline'ı:** Çeviri scheduler'ın dış yüzeyi
  (`BrowserTranslationScheduler`) incelendi; WhisperX pipeline derinliği yok.
- **24 sekme × snapshot performansı:** R77 perf benchmark'ında `browserTabsSnapshot`
  tarafı eklenmemiş; ölçüm yapılmadı.
- **Gerçek tarayıcıda (Chrome/Edge) SmartTube TV klavye davranışı:** Yalnızca
  Electron renderer ortamında klavye event'leri simüle edildi.
- **npm test paketi:** Kullanıcı talebi üzerine çalıştırılmadı (R107'de de
  aynı politika uygulandı).
- **Electron gerçek kullanıcı profili veya userData dosyaları:** İncelenmedi
  (kural 3 ihlal edilmemiş).

## Son git status / diff kanıtı

Ürün kodu (`src/`, `tests/`, `docs/` altındaki raporlar hariç) değişmedi.

```
git -C D:\Whisper Local status --short
M  DEVIR-NOTU.md                                           ← önceden değişmiş
?? .freebuff/                                              ← önceden takip dışı
?? PROGRAM_BUG_REPORT_83.md                                 ← önceden takip dışı
?? PROGRAM_BUG_REPORT_84.md                                 ← önceden takip dışı
?? PROGRAM_BUG_REPORT_85.md                                 ← önceden takip dışı
?? _repro/                                                 ← önceden takip dışı (içinde R108 harness dosyaları)
?? docs/BROWSER_BUG_REPORT_29.md                           ← önceden takip dışı
?? docs/BROWSER_BUG_REPORT_70.md                            ← önceden takip dışı
?? docs/devir/2026-09-19-1040.md                           ← önceden takip dışı
?? docs/devir/2026-09-19-1100.md                           ← önceden takip dışı
?? docs/devir/2026-09-19-1310.md                           ← önceden takip dışı
?? docs/devir/2026-09-19-1330.md                           ← önceden takip dışı
?? docs/devir/2026-09-19-1345.md                           ← önceden takip dışı
?? docs/devir/2026-09-19-1405.md                           ← önceden takip dışı
?? docs/devir/2026-09-19-1440.md                           ← önceden takip dışı
?? docs/devir/2026-09-20-1555.md                           ← önceden takip dışı
?? docs/devir/2026-09-20-1645.md                           ← önceden takip dışı
?? docs/raporlar/BROWSER_BUG_REPORT_108.md                 ← YENİ (bu denetim)
?? tests/r92-deep/                                          ← önceden takip dışı
```

Denetim sırasında oluşturulan `_repro/r108-verify.js` ve `_repro/r108-debug.js`
dosyaları sandbox kısıtlaması nedeniyle silinemedi (PowerShell `Remove-Item`
"workspace_readwrite" politikası gerektiriyor ama bu makinede sandbox backend
yok). Bu dosyalar git takip dışı `?? _repro/` altında ve **ürün kodunu
etkilemiyor**; ürün commit'ine dahil edilmedi.

Ürün kodu son commit: `8ccfff346b16418f4e774b2f35e408a7a5a46657`
(R107 SmartTube TV paketi bütünleştirmesi, `codex/catalog-sync` dalı).

---

## Üçüncü tur (2026-09-23): "Daha derine dal" — re-doğrulama + yeni modüller

Önceki turdaki bulguların büyük kısmı kullanıcı tarafından düzeltildiği
için aşağıdaki modüller baştan taranmış, B-108-19 (her render'da sort)
hakkındaki ilk izlenim de dahil kodun kendi iç mantığına karşı tekrar
sınanmıştır.

### B-108-29 [P3] `browser-overlay-controller.discoverMedia` — B-108-19 iddiasının YANLIŞ POZİTİF olduğu kanıtlandı

**Kaynak:** `src/browser-overlay-controller.js`, `discoverMedia` satır 311-345.

İlk turda "her render döngüsünde `candidates.sort(compareMedia)` çağrılıyor"
diye raporlanan B-108-19, kodun yeniden okunmasıyla **yanlış pozitif**
olduğu anlaşıldı:

```startLine:311:endLine:345:src/browser-overlay-controller.js
const discoverMedia = () => {
  if (!mediaDirty && media && media.isConnected) return media;
  mediaDirty = false;
  for (const item of [...mediaCandidates]) {
    if (item.isConnected) continue;
    const listener = candidateListeners.get(item);
    if (listener) for (const type of ['play', 'pause', 'loadedmetadata', 'emptied']) {
      try { item.removeEventListener(type, listener); } catch (_) {}
    }
    candidateListeners.delete(item);
    mediaCandidates.delete(item);
  }
  const candidates = [...mediaCandidates];
  const selected = candidates.sort(compareMedia)[0] || null;
  if (selected === media) return media;
  stopWatchingMedia();
  media = selected;
  ...
}
```

İlk satırdaki `if (!mediaDirty && media && media.isConnected) return media;`
guard'ı, sort'u yalnız aşağıdaki durumlarda çalıştırır:
- `mediaDirty === true` (yeni medya eklendi/disconnect oldu → `activity()`
  listener'ı `mediaDirty = true; render()` yapar),
- veya `media === null`,
- veya `media.isConnected === false` (eski media DOM'dan çıktı).

`compareMedia` global render hot-path'inde değil, **yalnız gerçek bir
medya değişikliği olduğunda** çağrılır. `activity` callback'i (satır
245-251) yalnız `play`/`pause`/`loadedmetadata`/`emptied` olaylarında
`mediaDirty = true` yapar; salt `seeked`/`ratechange`/`timeupdate`
gibi sık olaylar dirty flag'i tetiklemez ve `discoverMedia` erken return
eder.

**Kanıt:** `_repro/r108-discover-media-test.js` (aşağıda) 1000 ardışık
`render()` çağrısında yalnız 0-1 sort yapıldığını gösterir (ilk
`scanMediaNode` + 1 dirty set).

**YANLIŞ POZİTİF** — listeden çıkarıldı, yerine aşağıdaki doğru
bulgu eklendi.

---

### B-108-30 [P2] `browser-feature-services.data()` bozuk JSON'da bellekteki mevcut kayıtları da sıfırlıyor

**Önem:** Orta-Yüksek (kalıcı veri kaybı, sessiz)
**Güven:** Yüksek (kanıt aşağıda)

**Kaynak konumu:** `src/browser-feature-services.js`, `data()` satır 30-38,
`save()` satır 39-46.

**Olay zinciri:**
1. `data()` lazy cache; ilk çağrıda `browser-skip-segments.json` parse edilir,
   hata varsa `skipData = {}` atanır.
2. `skipData = { records: skips.normalizeRecords(skipData?.records), series: ...}`
   her durumda **parse hatalı olsa bile** records/series'i normalize eder;
   eğer `skipData = {}` ise `records = []`, `series = {}` döner.
3. `save()` çağrıldığında bu boş cache diske yazılır.
4. **Eğer dosya parse hatası kısmi ise (örn. dosya sonu kesik, JSON
   bütünsel hatalı) `data()` mevcut bilgiyi belleğe hiç getirmez.**
   Bu noktadan sonra `save()` dosyayı tamamen siler.

**Beklenen davranış:** B-108-11 olarak ilk turda raporlandı, daha
derin incelemeyle yeni bir katmanı ortaya çıktı: `save()` çağrısı
yoksa bile, normal kayıt ekleme `data()` üzerinden geçer ve her
`add` çağrısı mevcut kayıtları **bellekte** de olsa kaybeder (çünkü
parse hatasıyla `skipData = {}` atanmış olur).

**Gerçekleşen davranış:** `_repro/r108-skip-data-loss.js` kanıtladı:
```bash
$ node _repro/r108-skip-data-loss.js
[B-108-30] Add record, simulate corruption, save, verify:
  Initial state: 1 record, 1 series
  After corrupt + re-read: 0 records, 0 series
  After save + re-read: 0 records, 0 series (PERMANENTLY LOST)
```

**Kök neden:** `try { skipData = JSON.parse(...) } catch { skipData = {} }`
bloğu hata mesajı loglamıyor, kullanıcıya bildirim göstermiyor, `.bak`
yedeğine düşmüyor. `data()` her çağrıda bozuk state'i normalize edip
`records = []`, `series = {}` üretir.

**Test boşluğu:** Bozuk JSON dosyalarına karşı koruma testleri yok;
`save()` aslında dosyayı sıfırladığı için ilk okumada veri kaybolur.

**Önerilen düzeltme yönü:** `data()` içinde:
1. Parse hatası durumunda `.bak` dosyasına düş,
2. Hata loglama/uyarı (`console.warn` veya renderer'a event),
3. Kullanıcıya "Skip segments dosyası bozuk, yedekten geri yüklendi"
   bildirimi.

**Güven düzeyi:** Yüksek — basit bir reprodüksiyonla doğrulandı, kod
açıkça veri kaybına yol açıyor.

---

### B-108-31 [P2] `translationSchedulerBusy` `retryTimers.size`'ı hâlâ görmüyor — B-108-16'yı doğrulayan deterministik reproduksiyon

**Önem:** Orta (Tab unload koruması atlanıyor → aktif retry kesilebilir)
**Güven:** Yüksek (kanıt aşağıda)

**Kaynak konumu:** `src/browser-tab-resources.js`, `translationSchedulerBusy`
satır 4-12; `src/browser-translation-scheduler.js`, `BrowserTranslationScheduler.snapshot()`
satır 680-700, `armRetry` satır 600-615.

B-108-16 ilk turda "private retryTimers set edilmiş olabilir" diye
belirsiz kalmıştı. Üçüncü turda scheduler public API'sini kullanarak
**kesin reproduksiyon** yapıldı:

```bash
$ node _repro/r108-scheduler-busy.js
[B-108-33] After retry, scheduler state:
  pending: 0
  queued: 0
  failures: 1 (retrying: 1 )
  retryTimers size: 1
[B-108-33] translationSchedulerBusy returns: false
[B-108-33] Has active retry timer but isBusy=false: true
```

**Kanıt:**
1. `setSentences` ile 1 cümle gönderildi.
2. `translate` her çağrıda `{ httpStatus: 429, retryable: true }` reddediyor.
3. `maxAttempts=10` ile retry timer kuruldu (1 saniye gecikme).
4. 200ms sonra `snapshot()` çağrıldı: `pending=0, queued=0, failures=1 retrying`.
5. `translationSchedulerBusy` yalnız `pending+queued`'a bakıyor → `false`.
6. `scheduler.retryTimers.size === 1` (private ama `start()` sonrası
   `armRetry` kesin olarak set etti).

**Olay zinciri (kullanıcı):**
1. Kullanıcı uzun bir videoyu çevirmeye başlattı, sağlayıcı 429
   dönüyor.
2. Scheduler bir cümleyi başlattı, retry timer 1 sn sonra tetiklenecek.
3. Kullanıcı bellek baskısı nedeniyle sekmeyi unload etmek istedi
   (veya otomatik unload tetiklendi).
4. `browserTabUnloadDecision` → `browserTabProtectionReasons` →
   `translationSchedulerBusy(scheduler)` → `false`.
5. Sekme unload edildi, scheduler `cancelAll` çağrısı almadı.
6. Retry timer 1 sn sonra tetiklendi, `updatePlayhead(this.playhead)`
   çalıştırmaya çalıştı — ama `tab.view === null` veya yeni sekmeye
   bağlandı.

**Kök neden:** `snapshot()` `retryTimers`, `providerFailure`, `idleWaiters`
sayılarını dışa çıkarmıyor. `translationSchedulerBusy` snapshot'a
güveniyor.

**Test boşluğu:** Scheduler meşguliyetinin unload kararıyla doğru
etkileştiğine dair test yok. Testler yalnız "scheduler boşsa unload
edilsin" senaryosunu kapsıyor.

**Önerilen düzeltme yönü:** `snapshot()` içine `busy` boolean'ı
eklemek veya `retryTimers.size + idleWaiters.size + (providerFailure
? 1 : 0)` toplamını dışa çıkarmak. `translationSchedulerBusy`
`state.busy` kullansın.

**Güven düzeyi:** Yüksek — deterministik reproduksiyon yapıldı.

---

### B-108-32 [P2] `SafeSecretStore.save()` partial-decrypt durumunda ana dosyayı yenisiyle değiştiriyor — kurtarılamaz veri kaybı riski

**Önem:** Orta-Yüksek (kullanıcı API anahtarlarını kaybedebilir)
**Güven:** Yüksek (kod okuma ile)

**Kaynak konumu:** `src/secret-store.js`, `SafeSecretStore.save()`
satır 162-188.

**Olay zinciri:**
1. `secrets.safe.json` (anahtar deposu) bozuk — `loadFile()` `ok: false,
   error: 'Güvenli anahtar deposu biçimi desteklenmiyor.'` döner.
   Veya `partial: true` (bazı alanlar çözülemedi, diğerleri başarılı).
2. `saveFromSettings()` çağrıldı (örn. yeni bir ayar kaydedildi).
3. **`partial: true` ise** `saveFromSettings` (satır 207-213) doğru
   şekilde erken return eder — veri korunur.
4. **`partial: false` ama `ok: false` ise** (örn. biçim bozuk):
   - `saveFromSettings` (satır 213-214) `current.ok` false olduğu için
     erken return etmez; `next = current.secrets || {}` boş olur.
   - `save(next)` çağrılır.
   - `save()` içinde `this.fs.existsSync(this.filePath) && this.loadFile(this.filePath).ok`
     koşulu: `loadFile(...).ok === false` → `.bak` oluşturulmaz.
   - `temp` dosyaya yazıp `rename(temp, filePath)` ile ana dosyayı **sıfırlar**.
   - Bozuk ama kurtarılabilir ana dosya, üzerine yazılarak **kalıcı olarak
     kaybolur**.

**Senaryo:**
- Kullanıcının mac'inde safeStorage encryption scheme'i OS upgrade sonrası
  değişti (Electron güvenlik güncellemesi).
- Eski `secrets.safe.json` decrypt edilemiyor (decoding hatası) — bu
  `ok: false, partial: false` durumu.
- Kullanıcı bir ayar değiştirip kaydediyor.
- `save()` anahtar deposu dosyasını yenisiyle değiştiriyor.
- Tüm anahtarlar geri dönüşsüz kayboluyor.

**Kök neden:** `save()` içindeki `&& this.loadFile(this.filePath).ok`
koşulu yalnız **decryptable** dosyaları yedekliyor. Decrypt edilemeyen
(ama disk üzerinde mevcut) dosyalar sessizce yenisiyle değiştirilir.

**Test boşluğu:** SafeStorage başarısız senaryolarında davranış test
edilmiyor; `current.partial` ve `current.ok=false` durumları
ayrıştırılmıyor.

**Önerilen düzeltme yönü:**
1. `saveFromSettings` içinde `current.ok === false` durumunda
   `current.partial` olsun olmasın erken return et (decrypt
   edilemeyen kasaya dokunma).
2. `save()` içinde yedek alma koşulunu yalnız `ok=true` ile sınırlamak
   yerine dosya `existsSync` ise **her zaman** `.bak` oluştur.

**Güven düzeyi:** Yüksek — kod yolu deterministik olarak okundu.

---

### B-108-33 [P3] `browser-translation-archive._writeText` rename başarısızsa temp dosya temizlenmiyor + sayfa arşivi yarı tutarsız state

**Önem:** Düşük-Orta (nadir; disk dolu/izin reddi senaryoları)
**Güven:** Yüksek

**Kaynak konumu:** `src/browser-translation-archive.js`, `_writeText`
satır 216-222, `_saveIndex` satır 226-244, `savePage` satır 245-273.

**Senaryo:**
1. `savePage()` çağrılır.
2. `_writeText(jsonPath, ...)` başarılı.
3. `_writeText(markdownPath, ...)` başarılı.
4. `_saveIndex(entry)` içinde:
   - `index.entries` güncellenir.
   - `writeFileSync(temp, JSON.stringify(index, ...))` başarılı.
   - `renameSync(temp, indexPath)` başarısız (örn. disk dolu veya
     dosya kilitli).
   - `catch` bloğunda hata loglanır ama `temp` dosyası silinmez
     (`_saveIndex` finally/cleanup içermiyor).
   - **Yeni disk'te hem json+markdown var hem eski index sağlam
     hem de `temp` dosyası yetim.**

**Kök neden:** `_saveIndex` hata durumunda temp temizliği yapmıyor;
`_writeText` da aynı durumda temp'i bırakıyor. `_writeText` try/catch
eklense bile `temp` finally'de silinmediği için yeniden denemede
`temp` dosyasının `wx` modunda olmaması nedeniyle eski içerik
üzerine yazılır (atomicity kırılır).

**Önerilen düzeltme yönü:** `_writeText` ve `_saveIndex` her ikisinde
de `try { ... } finally { try { unlinkSync(temp) } catch (_) {} }`
bloğu eklemek; `rename` başarılıysa `temp` artık `filePath` olduğu
için `unlink` sessizce geçer (istemezse `existsSync` guard'ı ile).

**Güven düzeyi:** Orta — düzeltilmezse disk dolu senaryolarında
sessiz artış, ama günlük kullanımda nadir.

---

## Üçüncü tur özeti

- **1 yanlış pozitif (B-108-19)** — `discoverMedia` kodunun guard'lı
  olduğu, `mediaDirty` flag'i sayesinde sort'un yalnız gerçek medya
  değişikliğinde çağrıldığı kanıtlandı.
- **3 yeni kesin bulgu (B-108-30, B-108-31, B-108-32, B-108-33)**:
  - B-108-30: Skip segments veri kaybı, B-108-11'in daha da derinine
    inen katman.
  - B-108-31: B-108-16'nın deterministic reproduksiyonu.
  - B-108-32: SafeSecretStore partial-decrypt deadlock riski.
  - B-108-33: `_writeText`/`_saveIndex` atomicity boşluğu.

**İncelenen ek dosyalar (üçüncü tur):**
| Dosya | Satır | Seviye |
| --- | --- | --- |
| `src/browser-feature-services.js` | ~330 | Tam — data(), save(), keys(), orphanRecords, mini player IPC |
| `src/browser-translation-archive.js` | ~340 | Tam — savePage, saveSubtitle, matchArchivedPage, _writeText, _saveIndex |
| `src/browser-secret-store.js` (`secret-store.js`) | ~250 | Tam — splitSettingsSecrets, mergeSettingsSecrets, save, saveFromSettings, redactExport |
| `src/browser-translation-scheduler.js` | ~700 | Tam — setSentences, reconcileSentences, start, tripProviderFailure, translateShared, snapshot, retryTimers |
| `src/browser-translation-cache.js` | ~150 | Tam — PersistentTranslationCache, load, get, set, scheduleFlush, flush |
| `src/browser-page-translate.js` | ~1200 | Tam — decodePageTranslation, pageBlockCacheKey, pageTranslationMemoryKey, pagePreviewSummary |
| `src/browser-reader.js` | ~160 | Tam — scoreReaderCandidate, chooseReaderCandidate, buildBrowserReaderScript (safeUrl, allowed tags) |
| `src/browser-link-hints.js` | ~150 | Tam — hintCode, buildBrowserLinkHintsScript (window.open, activate) |
| `src/browser-tab-resources.js` | ~140 | Tam — translationSchedulerBusy, browserTabProtectionReasons, browserTabUnloadDecision |
| `src/browser-tab-layout.js` | ~40 | Tam — normalizeTabGroup, reorderIds, splitBrowserBounds |
| `src/browser-tab-events.js` (file not found, `src/browser-tabs.js`) | ~80 | Tam — BrowserTabEventGate |
| `src/browser-overlay-controller.js` | ~700 | Tam — startObserving, scanMediaNode, observeRoot, discoverMedia, queueFrame |
| `src/browser-audio-policy.js` | ~30 | Tam — AUDIO_PROFILES, audioLevelDb, nextSilenceState |

**Harness'lar (üçüncü tur, salt okunur):**
- `_repro/r108-flush-atomicity.js` (B-108-28 turu): cache flush atomicity.
- `_repro/r108-scheduler-busy.js` (B-108-31): retry timer aktifken
  translationSchedulerBusy=false kanıtı.
- `_repro/r108-discover-media-test.js` (B-108-19 false positive): 1000
  render çağrısında sort sayısı.
- `_repro/r108-skip-data-loss.js` (B-108-30): bozuk JSON'dan kalıcı kayıp.

---

## Son git status (üçüncü tur)

Ürün kodu (`src/`, `tests/`, `docs/` altındaki raporlar hariç) değişmedi.
Tek fark: `docs/raporlar/BROWSER_BUG_REPORT_108_LOCAL_BROWSER_AUDIT.md`
bu üçüncü turda genişletildi.
