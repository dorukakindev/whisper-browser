# FEATURE_BLUEPRINTS — Uygulama-hazır şartnameler (2026-09-19 ~15:40)

R76 araştırma matrisi + R81 denetim bulgularından seçilen özellikler için
uygulama şartnameleri. Her madde: hedef, entegrasyon noktaları (doğrulanmış
dosya:satır), sözleşme taslağı, kenar durumları, güvenlik notları, test planı.
Bu belge tasarımdır; ürün kodu değiştirmez.

---

## BP‑01 — Sekme dondurma (`Page.setWebLifecycleState`)

**Hedef:** Arka-plan sekmelerini DOM'u koruyarak dondur (Edge sleeping-tabs /
Vivaldi hibernate eşdeğeri) — yok-etmekten üstün, geri dönüş anlık.

**Mevcut dayanak:**
- `tab.view.webContents.debugger` zaten her sekmede attach ediliyor
  (`src/main.js:7278-9840` boyunca `wc.debugger.sendCommand` çağrıları).
- Sekme yaşam döngüsü `browser-tabs`/`renderBrowserTabs` içinde yönetiliyor;
  `browserClosedTabs` (`main.js:461`) ve `MAX_BROWSER_TABS` sınırları mevcut.

**Sözleşme:**
```js
// main.js — yeni yardımcı
async function setTabLifecycle(tab, state /* 'active'|'frozen' */) {
  const wc = tab?.view?.webContents;
  if (!wc || wc.isDestroyed() || !wc.debugger.attached) return false;
  return wc.debugger.sendCommand('Page.setWebLifecycleState', { state }).then(() => true).catch(() => false);
}
```
- Tetik: sekme arka-plana düştükten N dakika sonra (ayar, varsayılan 15) +
  `MAX_BROWSER_TABS` aşımında en eski arka-plan sekmesi.
- Aktifleşince `state:'active'` gönder; `document.wasDiscarded` true dönerse
  sekme durumunu (scroll/form) restore et — bizim için minimum: scroll konumu.
- Donmuş sekmede medya oynuyorsa DONdurma (audio/playing bayrağı — media
  event akışı zaten `tab` üzerinde biliniyor).

**Kenar durumları:** donmuş sekmede zamanlayıcı-bağımlı işler (poll, canlı-ASR
yakalama, SponsorBlock enjeksiyonu) durur → yakalama aktifken o sekmeyi
dondurma (CEA/DASH capture aktifse skip). DevTools açık sekme: CDP komutu
reddedebilir → catch ile sessiz geç.

**Güvenlik:** `Page.setWebLifecycleState` experimental CDP — Electron
sürümünde davranışı smoke ile doğrula (WICG spec: frozen'da görev kuyruğu
askıda, `freeze`/`resume` event'leri sayfaya gider).

**Test:** mock smoke — iki sekme aç, arka-planı dondur, `document.readyState`
+ zamanlayıcı duraklaması ve geri-aktivasyonu doğrula; `wasDiscarded` restore yolu.

**Efor:** küçük-orta (1 dosya + ayar + smoke probu).

---

## BP‑02 — Seekbar hover önizleme (yerel medya)

**Hedef:** Seekbar üzerinde hover'da kare önizleme (YouTube/trickplay tarzı).

**Mevcut dayanak (kritik):** Altyapı **zaten var** —
`src/browser-reference-media.js:58` `thumbnail(videoPath, time)` tam thumbfast
deseni (`ffmpeg -ss T -i file -frames:v 1`); `browser-feature-services.js:188-216`
per-sekme `thumbnails` Map (60-lık LRU) + `reference-thumbnail` iş tipi +
`thumbnail-cancel` abort + `generation` koruması. Eksik yalnız **UI bağlantısı**.

**Sözleşme:**
- Renderer: seekbar `pointermove` → `t = duration * (x/width)` → debounce
  (~80 ms) → `api.referenceThumbnail(path, t)` (varsa) → dönen data-URL'i
  seek-üstü tooltip'te göster (mevcut `seekTip` öğesi genişletilir).
- En yakın anahtar-kare yokluğu: ffmpeg `-ss` zaten önce-sonra arar;
  `-skip_frame nokey` ile keyframe'e yasla (Jellyfin PR#11336 hız deseni)
  veya tam kare (doğruluk) — ayar: hız/kesinlik.
- İptal: hover çıkışı + medya değişimi `thumbnail-cancel` (altyapı hazır).

**Kenar durumları:** uzak/HLS kaynakta thumbnail yok (yalnız `file:` yerel);
hızlı süpürmede kuyruklanma → tek-uçuş + son-konum kazanır (mevcut `generation`
deseni); küçük ekranda tooltip'i viewport'a kliple.

**Test:** mevcut `reference-thumbnail` IPC'si varsa birim-testi; UI tarafı
smoke'ta `seekTip` görünürlük probu.

**Efor:** küçük (backend yok, yalnız renderer+IPC yüzeyi). **En hızlı kazanım.**

---

## BP‑03 — Userscript yöneticisi (GM_* yüzeyi)

**Hedef:** `userScripts/` klasöründeki `@match`-başlıklı `.user.js`
dosyalarını sayfalara enjekte et (Min'in kanıtladığı sürdürülebilir yol).

**Mevcut dayanak:**
- `executeJavaScriptInIsolatedWorld(999, [{code}])` izole dünya zaten
  kullanılıyor (`main.js:2950, 4372, 10239`) → script'ler sayfa bağlamından
  ayrı dünyada koşar.
- `wc.debugger.sendCommand` → `Page.addScriptToEvaluateOnNewDocument`
  ile **navigasyondan ÖNCE** enjeksiyon mümkün (post-load `executeJavaScript`'ten
  doğru yol; R76 §11.2).

**Sözleşme:**
- `userData/userScripts/*.user.js` tara; meta bloğu: `@match`, `@run-at`,
  `@grant`, `@noframes`.
- `document-start` → `Page.addScriptToEvaluateOnNewDocument` (her `did-navigate`
  yeniden kur); `document-end`/`document-idle` → izole dünya inject.
- **GM_* shim** (izole dünyada script'e sarılan prelude):
  `GM_setValue/GM_getValue` → per-script JSON dosyası (settings altı);
  `GM_xmlhttpRequest` → main'de `net.fetch` (CORS bypass — script'in asıl
  gücü burada); `GM_notification` → `osd()`; `GM_openInTab` → `browserOpen`.
- Sekme/kuşak iptali: `tab.generation` deseni — sayfa değişince eski
  script'in zamanlayıcıları ölür (izole dünya her navigasyonda sıfırlanır).

**Kenar durumları:** `@noframes` → yalnız mainFrame (`wc.mainFrame`);
iframe'ler ayrı dünya ister (deferred). CSP: izole dünya sayfanın CSP'sinden
etkilenmez (Chromium). Hatalı script tek sayfayı kırmamalı → `try/catch` +
`console` log'u.

**Güvenlik:** `GM_xmlhttpRequest` SSRF kapısıdır — izin listesi: script'in
`@connect` bildirimi + `localhost`/RFC1918 reddi; yanıt boyutu sınırı;
redirect takibi saydam log'la. Kullanıcıya "userscript ağa erişiyor" göstergesi.

**Test:** fixture script (`@match` test sayfası) → `GM_setValue` kalıcılığı +
`GM_xmlhttpRequest` mock endpoint; `@match` ayrıştırma birim testi.

**Efor:** orta-büyük (meta parser + GM shim + lifecycle). R76'da A-grubu.

---

## BP‑04 — TTML/DFXP altyazı kolu (DASH boşluğu)

**Hedef:** Ağ yakalamada tespit edilen TTML track'leri gösterilebilir cue'lara
çevir (Netflix/DASH sitelerinin çoğu TTML).

**Mevcut dayanak:** Tespit hazır — `SUBTITLE_URL_RE` `ttml|dfxp` içeriyor
(`browser-subtitles.js:4`), adaptasyon `format:'ttml'` olarak işaretleniyor
(`:846, :1143`), ham içerikte `<tt` tespiti var (`:1825`). Eksik: **TTML→cue
ayrıştırıcı** (grep'te `parseTtml`/`ttmlToVtt` yok).

**Sözleşme:** Minimal çekirdek (imsc'nin tamamı yerine):
- `<p begin="…" end="…">` → `{start,end,text}`; `dur` özniteliği destekle;
  `<br/>`→`\n`; `<span>`'ları düz metne indir (ilk sürüm stil yok).
- Zaman biçimleri: `HH:MM:SS.mmm`, `SS.s`, `MM:SS`, tick/frame (`ttp:frameRate`
  varsa). Bilinmeyen zaman → cue'yu at + sayaç log'u.
- Çıktı mevcut `cues` sözleşmesine girsin (aynı overlay/search/sync tüketir).
- İleri aşama (ayrı iş): `region`/`tts:` stilleri → imsc adaptasyonu değerlendir.

**Kenar durumları:** `xml:space` koruma; iç-içe `<span>`; `begin`'in
üst-elemandan miras alınması (`<div>`'e toplu begin); çok-dilli `<p>`'lerde
`xml:lang` filtresi (kullanıcı dilini tercih et).

**Test:** gerçek DASH TTML örneği (küçük fixture) → cue sayısı/zaman doğruluğu;
`format:'ttml'` işaretli track'in overlay'de görünmesi (smoke).

**Efor:** orta (ayrıştırıcı + fixture). P1 değer — en yaygın yakalanan-ama-
gösterilemeyen format.

---

## BP‑05 — Semantik geçmiş/sayfa araması

**Hedef:** `browser-page-index`'e embedding'li semantik arama — "o makale
neydi" sorguları anahtar-kelime eşleşmesini aşar.

**İki yol (karar gerekir):**

| Yol | Artı | Eksi |
|---|---|---|
| **transformers.js** (`Xenova/all-MiniLM-L6-v2`, ~23 MB q8) | Python bağımlılığı yok, worker'da çalışır, WebGPU hızlı | Model indirme/önbellek yönetimi eklenecek |
| **Python SentenceTransformer** (mevcut `paraphrase-multilingual-MiniLM-L12-v2`) | Model zaten biliniyor | **P79‑04 engeli önce çözülmeli** — şu an her istekte süreç+model yüklüyor; kalıcı NDJSON işçisi gerekir |

**Öneri:** Önce P79‑04'ü düzelt (tek Python işçisi + istek döngüsü —
`live_asr.py` stdin/stdout NDJSON deseni hazır); aynı işçi hem `semantic_search`
hem geçmiş embedding'i karşılar. transformers.js'i ikinci faz (çevrimdışı özet
için de kullanılabilir) olarak değerlendir.

**Sözleşme:** `page_index` kaydına `embedding BLOB` sütunu; sayfa kaydedilirken
başlık+özet (≤512 token) embed edilir (arka plan, rate-limit'li); sorgu embed'i
→ kosinüs top-N → mevcut geçmiş UI'sına "anlamsal" sekmesi.

**Kenar durumları:** embedding boyutu (float32×384=1.5KB/satır — 20k sayfa ≈30MB,
kabul edilebilir); dil kapsamı (multilingual MiniLM TR+EN iyi); dupe önleme —
aynı URL'nin embedding'i güncellenir.

**Güvenlik:** embedding'ler yerel kalır; model indirme bir kez (HF) — offline
sonrası cache'ten.

**Test:** fixture sayfa metinleri → semantik sorgu keyword-miss eşleşmesi;
P79‑04 işçi testi (iki ardışık istek aynı süreçte → ikinci hızlı).

**Efor:** orta (işçi + indeks + UI sekmesi).

---

## BP‑06 — Remote Playback probe → yerel cast

**Hedef:** Ucuz probe: `video.remote` varsa Chromium cast menüsü; yoksa
R76'daki DLNA yoluna düş.

**Sözleşme (faz 0 — probe, ~20 satır):**
```js
const supportsCast = 'remote' in video && typeof video.remote.watchAvailability === 'function';
if (supportsCast) {
  video.remote.watchAvailability((ok) => castBtn.hidden = !ok).catch(() => { castBtn.hidden = false; });
  castBtn.onclick = () => video.remote.prompt().catch((e) => { if (e.name !== 'AbortError') osd('Cast başarısız'); });
}
```
- MSE/blob src için `cast-src` gerekir (muxinc/castable-video deseni) —
  bizde site videoları blob; kullanılabilir URL varsa `video.remote` ile,
  yoksa DLNA'ya düş.
- Electron'da Cast servisi derli olmayabilir → probe sonucunu raporla.

**Test:** `'remote' in video` smoke probu (Electron'da false dönerse
DLNA'ya işaretle).

**Efor:** probe çok küçük; DLNA tarafı orta (R76 §13 detayında).

---

## BP‑07 — Telefon kumandası (Kodi JSON-RPC deseni)

**Hedef:** Main'de küçük HTTP+WS sunucu → telefondan transport/ses/altyazı/seek.

**Sözleşme:** `main.js`'e `remote-server.js` (localhost+LAN bağla):
- `GET /` → minimal web UI (oynat/duraklat/±10s/ses/altyazı-toggle).
- `WS /ws` → JSON komut kanalı: `{play,pause,seek:+10,vol,subToggle,next,prev}`.
- Token: başlangıçta üretilen tek-seferlik PIN, QR ile göster (mevcut QR
  önerisiyle birleşir); token'sız istekleri reddet; yalnız LAN arayüzünde dinle.
- Komutlar mevcut `window.api` eşdeğerlerini tetikler (video transport IPC'leri
  zaten var).

**Güvenlik:** yerel ağda dinle → token zorunlu; CORS yok (kendi sayfası);
komut seti whitelist; `file://` dışı kaynaklara dokunma. SSDP/bonjour
keşfi ileride.

**Test:** mock istek → komut→IPC yönlendirme; token olmadan 403.

**Efor:** orta; benzersiz değer (rakip uygulamalarda yok).

---

## Hazır düzeltme spec'leri (rapordan alıntı — ayrıca spec gerekmez)

| Bulgu | Kaynak | Adım |
|---|---|---|
| B80‑01 (P2) | R80 raporu + R81 doğrulama | `SENSITIVE_URL_PARAMS`'ı `queue-persistence`↔`settings-security` ortaklaştır; `endpointSetting` sorgu/fragment tara; `endpointIdentity`→origin+path; `createBackupPayload`'da `*BaseUrl` sorgu düşür; `publicSettings` aynı katmandan geçsin |
| B80‑02 (P3) | R80 + R81 | Tek paylaşılan `probeCommand`: stdout sınırı + `stderr.resume()`/`errorTail` + `terminateProcessTree` parametreli |
| D81‑01 (P2) | bu rapor | 262 dizgeyi `ui-locale.js` entries'e toplu ekle (`_repro/audit-i18n.js` çıktısı hazır liste); CI'a tablo-denetimi |
| P79‑01 (10×) | R79 | `_NORMALIZED_TERMS`/`_MODIFIERS` frozenset'i modül düzeyine |
| P79‑04 | R79 + BP‑05 | `browser_media_tools.py`'ye kalıcı NDJSON işçi döngüsü |
