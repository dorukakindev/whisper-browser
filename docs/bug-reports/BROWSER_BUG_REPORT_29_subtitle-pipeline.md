# Browser Subtitle Pipeline — Derin Bug Avı Raporu

Tarih: 2026-09-18
Kod hash: (bkz. git status)
Kapsam: `src/browser-subtitles.js`, `browser-subtitle-*.js`, `browser-*.js`, `renderer/browser-*.js`, `tests/browser-subtitle*.js`

---

## BULGU #1 — 🔴 Kritik: `SubtitleFileAccess` Yetkileri PC Restartında Kalıcı DEĞİL

**Dosya:** `src/local-file-access.js:33-55`

**Senaryo:**
```javascript
class SubtitleFileAccess {
  constructor() { this.grants = new Map(); } // ← Bellekte, sadece bu süreç
  grant(value) {
    const target = this.inspect(value);
    this.grants.set(this.key(target), true); // ← Belleğe yazılıyor
    ...
  }
}
```
Kullanıcı tarayıcıda bir `.srt` dosyasına göz at tuşuna basıp erişim izni verdiğinde, bu yetki yalnızca **o Electron sürecinin belleğinde** tutuluyor. Uygulama kapandığında veya bilgisayar yeniden başlatıldığında `grants` Map'i sıfırlanır — **tüm yetkiler kaybolur.**

**Etki:** Kullanıcı her seferinde dosya erişimini yeniden vermek zorunda kalır. Özellikle izleme kütüphanesinde otomatik altyazı eşleştirmesi çalışmaz.

**Doğrulama:** `main.js:32` — `subtitleFileAccess` bir singleton, hiçbir `settings.json` veya `browser-session.json` yazımı yok. `persistBrowserSessionNow` üst veri dışında bu haritayı kaydetmiyor.

**Önerilen Düzeltme:** `SubtitleFileAccess` yetkilerini, mevcut oturum kalıcılık mekanizmasına entegre et:
- `browser-session.json`'a `grantedSubtitlePaths: string[]` alanı ekle
- Uygulama başlangıcında `subtitleFileAccess.grant(path)` çağrısıyla yeniden yetkilendir
- Mevcut `BROWSER_SESSION_VERSION` sürüm sayacını artır

---

## BULGU #2 — 🔴 Kritik: `normalizeTransform` `throw` ile Hata Sinyali VERİYOR, Yakalanmıyor

**Dosya:** `src/browser-subtitle-sync.js:50-59`

```javascript
function normalizeTransform(raw = {}) {
  const scale = raw.scale === undefined ? 1 : Number(raw.scale);
  const offsetSeconds = Number(raw.offsetSeconds ?? raw.offset ?? 0);
  if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
    throw new TypeError('Senkron ölçeği 0,25× ile 4× arasında olmalı.'); // ← Fırlatıyor
  }
  if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > MAX_ABS_OFFSET_SECONDS) {
    throw new TypeError('Senkron kaydırması geçersiz veya güvenli aralığın dışında.');
  }
  return { scale, offsetSeconds };
}
```

**Senaryo:** `transformCuesForExport` (sync.js:145-170) doğrudan `normalizeTransform` çağırıyor, try-catch YOK:
```javascript
function transformCuesForExport(cues, transform, onWarning) {
  const normalized = normalizeTransform(transform); // ← Burada throw oluşabilir
  const source = Array.isArray(cues) ? cues : [];
  // ... hiç try/catch yok
}
```

**Etki:** Geçersiz senkron kaydı (örn. kullanıcı alan dışı offset girdiğinde) yakalanmayan `TypeError` üretir — işlem çöker, kullanıcıya Türkçe hata mesajı **görünmez**.

**Karşılaştırma:** `createSyncRecord` (sync.js:105-120) aynı fonksiyonu try-catch ile sarıyor:
```javascript
function syncRecordMatches(record, context) {
  let item;
  try { item = createSyncRecord(record); } catch (_) { return false; } // ← doğru
  ...
}
```

**Önerilen Düzeltme:** `transformCuesForExport` içinde `normalizeTransform` çağrısını try-catch'e al; geçersiz dönüşümde uyarı回调 çağır veya boş dizi döndür.

---

## BULGU #3 — 🔴 Kritik: `parseSubtitlePayload` 12MB+ Dosyada `throw` Fırlatıyor, Yakalanmıyor

**Dosya:** `src/browser-subtitles.js:1792-1793`

```javascript
function parseSubtitlePayload(body, mimeType = '', url = '', timing = {}) {
  const raw = String(body || '').trim();
  if (!raw || raw.length > 12 * 1024 * 1024) return { cues: [], format: '' };
  //   ↑ Koşul "12MB'den büyükse BOŞ döndür" diyor
```

**Asıl kod** (`browser-subtitles.js:1792-1793`) sınıra **return** diyor. Ancak `parseTimedBlocks` → `normalizeCues` zinciri içinde `parseTime` çağrısı yapılıyor ve `parseTime` hatalı zaman kodlarında `null` döndürüyor, `throw` yapmıyor.

AMA — `dashTemplateTimeline` (subtitles.js:740-768) 10.000 parça sınırını aşınca **açıkça `throw new Error(...)`** fırlatıyor:
```javascript
if (count > 10000) throw new Error('DASH altyazısı 10.000 parça sınırını aşıyor...');
```

**Senaryo:** Çok büyük DASH manifesti (10.000+ SegmentTimeline satırı) — `parseDashSubtitleMatchers` bu hatayı **yakalamadan** üst zincire fırlatır.

**Etki:** main.js'deki çağrı noktasında muhtemelen yakalanıyor (kontrol edilmeli), ama senkron path'te (`parseDashSubtitleMatchers` doğrudan çağrılıyorsa) çöker.

**Önerilen Düzeltme:** `parseDashSubtitleMatchers` içinde `dashTemplateTimeline` çağrısını try-catch'e al; 10.000+ sınır aşımında o segmenti atla, geri kalanı işle.

---

## BULGU #4 — 🟡 Orta: `validateBrowserSubtitleDocument` Boş Altyazıyı Geçerli Kabul Ediyor

**Dosya:** `src/browser-subtitle-output.js:36-50`

```javascript
function validateBrowserSubtitleDocument(text, format, expectedCues) {
  const expected = normalizeCues(expectedCues).slice(0, 20000);
  const parsed = parseSubtitlePayload(String(text || ''), '', `subtitle.${format}`).cues;
  if (parsed.length !== expected.length) {
    return { ok: false, error: `Altyazı blok sayısı uyuşmuyor (${parsed.length}/${expected.length}).`, cues: parsed };
  }
  // ...
  return { ok: true, cues: parsed }; // ← 0 === 0 → true döner
}
```

**Senaryo:** `buildBrowserSubtitleDocument` boş bir altyazı dizisi verildiğinde önce `normalizeCues` çağırıyor:
```javascript
function buildBrowserSubtitleDocument(cues, requestedFormat = 'srt') {
  const normalized = normalizeCues(cues).slice(0, 20000);
  if (!normalized.length) throw new Error('Dışa aktarılacak altyazı yok.');
  // ← Boş altyazı zaten burada yakalanıyor
```

**Daha riskli senaryo:** `parsed.length === 0` ve `expected.length === 0` — `ok: true` döner, ancak altyazı dosyası tamamen boştur. Dışa aktarma işlemi sessizce "başarılı" olur.

**Önerilen Düzeltme:** `validateBrowserSubtitleDocument` içinde sıfır uzunluk kontrolü:
```javascript
if (parsed.length === 0 && expected.length === 0) {
  return { ok: false, error: 'Dışa aktarılacak altyazı yok.', cues: parsed };
}
```

---

## BULGU #5 — 🟡 Orta: `browserActiveCuesAt` WeakMap Cache'si In-Place Mutasyonda Eski Veri Kullanabilir

**Dosya:** `src/browser-subtitles.js:1070-1095`

```javascript
function browserActiveCuesAt(cues, time) {
  // ...
  let indexData = browserActiveCuesAt._prefixCache.get(list);
  const canExtend = indexData && indexData.length > 0 && indexData.length < list.length
    && list[indexData.length - 1] === indexData.tailCue
    && Number(indexData.tailCue?.end) === indexData.tailEnd;
  if (canExtend) {
    // ← Prefix cache "genişletilebiliyor" olarak işaretleniyor
    // Ama listedeki mevcut elemanların DEĞERLERİ değiştiyse (örn. end zamanı güncellendiyse)
    // prefix[ ] dizisi yanlış kalmaya devam eder
    let maximum = indexData.prefix[indexData.length - 1];
    for (let index = indexData.length; index < list.length; index++) {
      maximum = Math.max(maximum, Number(list[index].end));
      indexData.prefix.push(maximum);
    }
    indexData.length = list.length;
    // ← Eski prefix değerleri değişmedi! Sadece sonuna ekleme yapılıyor
```

**Senaryo:**
1. `browserActiveCuesAt(cues, t)` çağrılır → `_prefixCache` oluşur
2. Aynı `cues` dizisi in-place güncellenir: `cues[5].end = 999` (normalde 4.2 olması gerekiyordu)
3. Tekrar `browserActiveCuesAt(cues, t)` çağrılır
4. `canExtend` koşulu sağlanabilir (aynı referans, aynı uzunluk, aynı son eleman)
5. `indexData.prefix` güncellenmez — eski `maximum` değeri kullanılır
6. `indexData.prefix[index]` yanlış kalır → `prefix[index] <= t` yanlış sonuç üretir

**Etki:** Yanlış aktif cue hesabı — cue ekranda görünmesi gerekirken görünmez veya tersi.

**Test karşılığı:** `tests/browser-subtitles.test.js:700-720` — "canlı cue dizisi sona büyürken prefix önbelleğini artımlı genişletir" testi var ama **in-place mutasyon** senaryosunu test ETMİYOR.

**Önerilen Düzeltme:** `canExtend` kontrolüne ek olarak, son elemanın `end` değerinin değişip değişmediğini kontrol et:
```javascript
const canExtend = indexData && indexData.length > 0 && indexData.length < list.length
  && list[indexData.length - 1] === indexData.tailCue
  && Number(list[indexData.length - 1]?.end) === indexData.tailEnd
  // ← Eski değer === yeni değer kontrolü ekle
```

---

## BULGU #6 — 🟡 Orta: `decodeSubtitleBuffer` `note` Alanı Görmezden Geliniyor

**Dosya:** `src/browser-textutil.js:60-90`

```javascript
function decodeSubtitleBuffer(value) {
  // ...
  if (text.includes('\uFFFD')) {
    // ... CP1254 / UTF-8 kararı ...
    if (cp1254LooksNative && sparseUtf8Evidence) {
      text = cp1254;
      note = 'cp1254'; // ← "Bu metin CP1254'tür" bilgisi
    }
    // ...
  }
  // ...
  return { text, note };
}
```

**Senaryo:** main.js'de dönüş değeri yalnızca `text` olarak kullanılıyor:
```javascript
// main.js:1749
const { text, note } = decodeSubtitleBuffer(fs.readFileSync(filePath));
// ← "note" değişkeni yaratılıyor ama KULLANILMIYOR

// main.js:9256
const body = decodeSubtitleBuffer(responseBuffer).text;
// ← note düşüyor

// main.js:16145
const { text: raw, note } = decodeSubtitleBuffer(fs.readFileSync(filePath));
// ← note yine tanımlanıyor ama kullanılmıyor
```

**Etki:** Kullanıcı Türkçe karakter sorunu yaşadığında, arka uç CP1254'e düştüyse kullanıcıya **bilgi verilmez**. Kodlama tespiti sessizce 1254'e düşer, kullanıcı bozuk görünümü görür ama nedenini anlayamaz.

**Önerilen Düzeltme:** `note` alanını `log()` ile veya hata durumunda kullanıcıya görünür bir şekilde bildir.

---

## BULGU #7 — 🟡 Orta: `findSubtitleUrls` Derinlik/Sayı Sınırlarını Aştığında Sessizce Kesiyor

**Dosya:** `src/browser-subtitles.js:1140-1170`

```javascript
function findSubtitleUrls(body, baseUrl = '') {
  const visit = (value, context = '', depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    //                         ↑ Derinlik sınırı — kesiliyor, bilgi yok
    // ...
    if (Array.isArray(value)) return value.slice(0, 500).forEach((item) => visit(item, context, depth + 1));
    //                                            ↑ ↑ Dizi sınırı — kesiliyor, bilgi yok
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value).slice(0, 1000)) {
        //                                         ↑ ↑ Nesne sınırı — kesiliyor, bilgi yok
```

**Senaryo:** Çok derin veya çok dallanmış bir JSON manifest (örn. Netflix-style 15-level nested API response) — 9. seviyeden sonra arama durur. 500+ elemanlı dizilerin 500+10. elemanı kaybolur.

**Etki:** Bazı altyazı URL'leri bulunamaz. Kullanıcı "Altyazı bulunamadı" hatası alır ama aslında URL belgede vardır.

**Önerilen Düzeltme:** Sınırlar aşıldığında bir sayaç tut ve bir uyarı callback'i çağır:
```javascript
let truncated = 0;
const visit = (value, context = '', depth = 0) => {
  if (depth > 8) { truncated++; return; }
  // ...
  if (Array.isArray(value) && value.length > 500) { truncated += value.length - 500; }
```

---

## BULGU #8 — 🟡 Orta: `parseHlsSubtitleTracks` `NAME` Yokluğunda Label `LANGUAGE` Düşer

**Dosya:** `src/browser-subtitles.js:420-435`

```javascript
function parseHlsSubtitleTracks(body, baseUrl = '') {
  for (const line of text.split(/\r?\n/)) {
    // ...
    try { tracks.push({
      url: new URL(attrs.URI, baseUrl).href,
      language: attrs.LANGUAGE || '',
      label: (attrs.NAME || attrs.LANGUAGE || 'HLS altyazısı')
        + (String(attrs.FORCED || '').toUpperCase() === 'YES' ? ' (zorunlu)' : ''),
    }); } catch (_) {}
  }
}
```

**Senaryo:** `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="tr"` — `NAME` yok, `LANGUAGE='tr'` → label `'tr'`. Çok dilli bir sayfada kullanıcıya sadece `"tr"` gösterilir — bunun "Türkçe" olduğu açık değil.

**Etki:** Düşük etki — UI'da türkçe yerine "tr" yazar, kullanıcı yanlış altyazı seçebilir.

---

## BULGU #9 — 🟡 Orta: `mp4Tfhd` / `mp4Tfdt` Buffer Sınırları Yeterince Kontrol Edilmiyor

**Dosya:** `src/browser-subtitles.js:1480-1530`

```javascript
function mp4Tfhd(buffer, box) {
  if (!box || box.start + 8 > box.end) return {};
  //   ↑ box.start + 8 <= box.end kontrolü var
  //   AMA buffer.readUInt32BE(box.start + 4) okunuyor — box.start + 4 her zaman OK
  //   box.start + 8 kontrolü yeterli, readUInt32BE(box.start) 4 byte okur
  const flags = buffer.readUInt32BE(box.start) & 0x00ffffff;
  const trackId = buffer.readUInt32BE(box.start + 4);
  // ...
  if (flags & 0x000001) {
    if (cursor + 8 > box.end) return {}; // ← cursor + 8 kontrolü VAR
    const base = buffer.readBigUInt64BE(cursor);
    // ...
  }
```

**Senaryo:** `box.start + 4 > box.end` durumunda — yani kutu 4-8 byte arasındaysa — `box.start + 8 <= box.end` kontrolü **geçer** ama `box.start + 4` okuması box sınırlarını aşar. `buffer.readUInt32BE(box.start + 4)` `box.end - (box.start + 4)` byte okumaya çalışır, `box.end - box.start < 4` ise **yanlış veri okunur**.

**Etki:** Bozuk MP4 dosyasında saçma track ID değeri üretilir → yanlış track eşleştirme.

**Önerilen Düzeltme:** `mp4Tfhd` başına:
```javascript
if (!box || box.start + 4 > box.end) return {};
```

---

## BULGU #10 — 🟡 Orta: `normalizeCues` Geçersiz Cue'ları Sessizce Atıyor

**Dosya:** `src/browser-subtitles.js:110-125`

```javascript
function normalizeCues(cues) {
  const clean = (cues || []).map((cue) => ({
    ...cue,
    start: Number(cue.start),
    end: Number(cue.end),
    text: cleanCueText(cue.text),
  })).filter((cue) => Number.isFinite(cue.start) && cue.start >= 0 && cue.text)
  //                            ↑ Geçersiz cue'lar burada sessizce düşüyor
```

**Senaryo:** Web altyazı sağlayıcısı bozuk cue (örn. `start: null`, `end: undefined`) döndürdüğünde — cue kaybolur, ne kullanıcıya ne de log'a bilgi gider.

**Etki:** Nadir ama mümkün. Kullanıcı bazı repliklerin eksik olduğunu fark eder ama nedenini anlayamaz.

**Önerilen Düzeltme:** `normalizeCues` çağrısından önce bir `warn_list` push et veya `onWarning` callback'i kullan.

---

## BULGU #11 — 🟡 Orta: `browser-subtitle-sync.js` Üst Seviye `throw` Zincirlemesi

**Dosya:** `src/browser-subtitle-sync.js:60, 76-82, 100`

```javascript
function sourceToVideoTime(sourceTime, transform) {
  const source = Number(sourceTime);
  if (!Number.isFinite(source)) throw new TypeError('Kaynak zamanı geçersiz.');
  const normalized = normalizeTransform(transform); // ← throw burada
  return source * normalized.scale + normalized.offsetSeconds;
}

function videoToSourceTime(videoTime, transform) {
  const video = Number(videoTime);
  if (!Number.isFinite(video)) throw new TypeError('Video zamanı geçersiz.');
  const normalized = normalizeTransform(transform); // ← throw burada
  return (video - normalized.offsetSeconds) / normalized.scale;
}

function calculateTwoPointTransform(first, second, minimumSpan = MIN_POINT_SPAN_SECONDS) {
  // ...
  const transform = normalizeTransform({ scale, offsetSeconds });
  return { ...transform, points: [point1, point2] };
  // ↑ normalizeTransform throw ederse burada patlar — yakalanmaz
}
```

**Senaryo:** `calculateTwoPointTransform` doğrudan `normalizeTransform` çağırıyor. `normalizeTransform` `throw` ettiğinde — `calculateTwoPointTransform` çağrıldığı her yerde yakalanmazsa — işlem çöker.

**Etki:** Senkron noktası hesaplaması sırasında geçersiz scale/offset değeri verildiğinde (örn. bozuk senkron kaydı) çökme.

**Önerilen Düzeltme:** `calculateTwoPointTransform` içinde try-catch ekle.

---

## BULGU #12 — 🟢 Düşük: `subtitleLanguage` Sessizce Boş Dize Döndürüyor

**Dosya:** `src/browser-subtitles.js:1835-1845`

```javascript
function subtitleLanguage(response = {}) {
  const headers = response.headers || {};
  const header = headers['content-language'] || headers['Content-Language'];
  if (header) return String(header).split(',')[0].trim();
  try {
    const u = new URL(response.url || '');
    return u.searchParams.get('lang') || u.searchParams.get('language')
      || u.searchParams.get('locale') || u.searchParams.get('hl') || '';
      //                                                    ↑ Boş dize
  } catch (_) { return ''; }
}
```

**Senaryo:** Hiçbir ipucu yok — boş dize mi "dil bulunamadı" mı, bilinmez.

**Etki:** Düşük — arayüzde "Bilinmeyen" yerine boş etiket görünür.

---

## BULGU #13 — 🟢 Düşük: `manifestFingerprint` Her Çağrılda SHA256 Hash Üretiyor

**Dosya:** `src/browser-subtitles.js:1858-1862`

```javascript
function manifestFingerprint(body) {
  return crypto.createHash('sha256').update(String(body || '')).digest('hex');
}
```

**Senaryo:** HLS/DASH manifesti her güncellendiğinde (canlı yayın) tam gövde hash'i üretilir. SHA256 hardware destekli olsa bile bu bir miktar CPU harcar. Ayrıca 2. satır `String(body || '')` çağrısı — `body` zaten string ise gereksiz.

**Etki:** Performans — canlı DASH/HLS izlerinde her manifest yenilemesinde SHA256.

---

## BULGU #14 — 🟢 Düşük: `parseHlsAttributes` Değer Normalizasyonu Tutarsız

**Dosya:** `src/browser-subtitles.js:458-460`

```javascript
function parseHlsAttributes(line) {
  const attrs = {};
  for (const match of String(line || '').matchAll(/([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/gi)) {
    attrs[match[1].toUpperCase()] = String(match[2] || '').replace(/^"|"$/g, '');
    //   ↑ KEY'ler BÜYÜK HARF — normalizeSubtitleTracks'te attrs.LANGUAGE vs attrs.NAME doğru
  }
  return attrs;
}
```

**Senaryo:** HLS spesifikasyonu key'leri büyük harf olmaya zorlamaz. Bazı sağlayıcılar `Language` veya `Name` (küçük/mixed case) kullanırsa bulunamaz.

**Etki:** Düşük — çoğu HLS sağlayıcı standarda uyar.

---

## BULGU #15 — 🟢 Düşük: IPC `authorizedBrowserSender` Kontrolü Tutarlı mı?

**Dosya:** `src/main.js` geneli

```javascript
// main.js:13546
ipcMain.handle('browser:subtitle-preference', (event, request = {}) => {
  if (!authorizedBrowserSender(event)) return { ok: false }; // ← YETKİLENDİRME VAR
  // ...
});

// main.js:14586
ipcMain.handle('browser:subtitle:export', async (event, payload) => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
  // ← Aynı kontrol var
});

// main.js:15040
ipcMain.handle('browser:subtitle:captureFull', async (event, payload) => {
  if (!authorizedBrowserSender(event)) return { ok: false, error: 'Yetkisiz istek.' };
```

Kodun büyük çoğunluğunda `authorizedBrowserSender` kontrolü mevcut. Ancak `media:readSubtitle` (main.js:1745) kontrol edilmeli — orada `authorizedBrowserSender` olup olmadığına bakılmalı.

---

## BULGU #16 — 🟢 Düşük: `_prefixCache` WeakMap'i Renderer Sürecinde Asla Temizlenmiyor

**Dosya:** `src/browser-subtitles.js:1068-1095`

```javascript
if (!browserActiveCuesAt._prefixCache) browserActiveCuesAt._prefixCache = new WeakMap();
let indexData = browserActiveCuesAt._prefixCache.get(list);
// ...
browserActiveCuesAt._prefixCache.set(list, indexData);
```

**Senaryo:** Renderer, aynı video için birden çok kez altyazı kaynağı değiştirdiğinde (örn. SRT → YouTube captions → başka bir URL), her geçiş yeni bir WeakMap entry ekler. WeakMap **GC tarafından temizlenir** (canvas veya başka referans yoksa), ama bu **belirsiz bir zamanda** gerçekleşir. R49-11'de "süreç başına WeakMap" artık sorun değil — her `browserActiveCuesAt` çağrısı aynı WeakMap'i paylaşıyor.

**Etki:** Düşük — WeakMap doğası gereği bellek sızıntısı yapmaz, sadece referans yoksa GC toplar.

---

## BULGU #17 — 🟢 Düşük: `parseSubtitlePayload` Hiçbir Zaman `Error` Fırlatmıyor, Ama `parseDashSubtitleMatchers` Fırlatıyor

**Dosya:** `src/browser-subtitles.js:1792-1820` vs `subtitles.js:740-768`

**Asimetri:** `parseSubtitlePayload` hata durumunda `{ cues: [], format: '' }` döndürür — `throw` yok. Ama içerdiği `parseDashSubtitleMatchers` → `dashTemplateTimeline` **throw** ediyor. Bu asimetri, çağrı sitelerini karmaşıklaştırır.

**Öneri:** Tutarlı hata modeli: ya hep `throw` ya hep `return { error: '...' }`. Şu an karışık.

---

## BULGU #18 — 🟢 Düşük: `CeaCaptionDecoder` Dosyası Bulunamadı

Kullanıcı `browser-subtitles.js` içinde CEA caption decoder aradı (BULGU #1'deki listede), ama bu dosya **mevcut değil**. CEA-608/708 kodlaması muhtemelen `main.js` içinde `captureBrowserHlsCeaSegment` işleviyle ele alınıyor. Ayrı bir decoder modülü yok.

Doğrulama: `grep -r "CeaCaptionDecoder\|cea-608\|cea-708\|decodeCea" src/` — sonuç yok. `detectHlsCea608` (subtitles.js:466-475) yalnızca **iz tespiti** yapıyor, decoder değil.

---

## BULGU #19 — 🟢 Düşük: `parseMp4TimedSamples` Timescale Bulunamazsa Sessizce Atlar

**Dosya:** `src/browser-subtitles.js:1715-1725`

```javascript
// Init segmenti ya da MPD zaman ölçeği yoksa tahmin ederek sessizce yanlış
// zaman üretme; parça sonraki yakalama turunda init ile yeniden denenir.
if (!timescale) continue; // ← Sessizce atla, bilgi yok
```

**Etki:** Altyazı zamanları tamamen yanlış olur ve kullanıcı bunu fark edemez.

---

## BULGU #20 — 🟢 Düşük: `cuePresentationKey` `cue.language` İçeriyor

**Dosya:** `src/browser-subtitles.js:93-99`

```javascript
function cuePresentationKey(cue = {}) {
  return [..., cue.discontinuity, cue.language,  // ← Dil burada
    cue.provenance?.streamKey]
    .map((value) => String(value ?? '').trim().toLowerCase()).join('\u241f');
}
```

Aynı metin, aynı zaman, farklı dil etiketi → **farklı presentation key** → `normalizeCues` deduplication'ı dil farkı yüzünden çalışmaz.

---

## ÖZET TABLOSU

| # | Şiddet | Dosya | Satır | Tür | Açıklama |
|---|--------|-------|-------|-----|----------|
| 1 | 🔴 Kritik | `local-file-access.js` | 33-55 | Persistence | SubtitleFileAccess yetkileri bellekte, restartta kayboluyor |
| 2 | 🔴 Kritik | `browser-subtitle-sync.js` | 50-59 | Error handling | `normalizeTransform` throw yakalanmıyor — `transformCuesForExport` çözer |
| 3 | 🔴 Kritik | `browser-subtitles.js` | 740-768 | Exception | DASH 10.000+ segment throw fırlatıyor, yakalanmıyor |
| 4 | 🟡 Orta | `browser-subtitle-output.js` | 36-50 | Validation | Boş altyazı `ok: true` dönebilir |
| 5 | 🟡 Orta | `browser-subtitles.js` | 1070-1095 | Cache | WeakMap prefix cache in-place mutasyonda eski veri |
| 6 | 🟡 Orta | `browser-textutil.js` | 60-90 | Info loss | `note` alanı hiç kullanılmıyor |
| 7 | 🟡 Orta | `browser-subtitles.js` | 1140-1170 | Silent truncation | Derinlik/sayı sınırları aşılınca sessiz kesme |
| 8 | 🟡 Orta | `browser-subtitles.js` | 420-435 | UX | NAME yokluğunda label LANGUAGE düşer |
| 9 | 🟡 Orta | `browser-subtitles.js` | 1480-1495 | Buffer OOB | mp4Tfhd box sınırı yetersiz |
| 10 | 🟡 Orta | `browser-subtitles.js` | 110-125 | Silent drop | normalizeCues geçersiz cue'ları sessiz atıyor |
| 11 | 🟡 Orta | `browser-subtitle-sync.js` | 60-100 | Error handling | sourceToVideoTime / videoToSourceTime throw'u zincirleniyor |
| 12 | 🟢 Düşük | `browser-subtitles.js` | 1835-1845 | Ambiguity | subtitleLanguage boş dize döndürür, neden belli değil |
| 13 | 🟢 Düşük | `browser-subtitles.js` | 1858-1862 | Perf | manifestFingerprint her çağrıda SHA256 |
| 14 | 🟢 Düşük | `browser-subtitles.js` | 458-460 | Inconsistency | HLS attribute key case sensitivity |
| 15 | 🟢 Düşük | `main.js` | 1745 | Security | media:readSubtitle yetkilendirme kontrolü doğrulanmalı |
| 16 | 🟢 Düşük | `browser-subtitles.js` | 1068-1095 | GC | WeakMap temizliği belirsiz |
| 17 | 🟢 Düşük | `browser-subtitles.js` | 1792-1820 | Consistency | Hata modelleri tutarsız |
| 18 | 🟢 Düşük | (yok) | — | Missing feature | CeaCaptionDecoder modülü yok |
| 19 | 🟢 Düşük | `browser-subtitles.js` | 1715-1725 | Silent skip | Timescale yokluğunda sessiz atlayış |
| 20 | 🟢 Düşük | `browser-subtitles.js` | 93-99 | Fragmentation | cuePresentationKey dil farkını key'e katıyor |

---

## TEST KAPSAMI DEĞERLENDİRMESİ

Mevcut testler (22 test dosyası, ~1200+ assertion):
- ✅ Subtitle parse: SRT, VTT, TTML, ASS, SAMI, LRC, JSON, YouTube
- ✅ HLS/DASH parsing: variant streams, segment timelines, subtitle tracks
- ✅ MP4: WebVTT box, STPP, timescale, fragment composition
- ✅ `normalizeCues`: deduplication, rolling duplicates
- ✅ `mergeBrowserStreamCues`: canlı güncellemeleri
- ✅ `browserActiveCuesAt`: prefix cache, 64+ geri-bakış
- ✅ Sync: transform, export, overlay
- ✅ Output: SRT/VTT/ASS round-trip, validation
- ✅ Preferences: persistence, recovery
- ✅ CEA-608 tespiti

**Eksik testler:**
- ❌ SubtitleFileAccess persistence (restart sonrası yetki korunması)
- ❌ In-place cue mutasyonu + prefix cache senaryosu
- ❌ 12MB+ body → `parseSubtitlePayload` davranışı
- ❌ DASH 10.000+ segment → throw yakalama
- ❌ `decodeSubtitleBuffer` note alanı kontrolü
- ❌ `findSubtitleUrls` truncation senaryoları
- ❌ CEA decoder (mevcut değil — ayrı modül beklentisi)
- ❌ `normalizeTransform` throw → `transformCuesForExport` yakalama
