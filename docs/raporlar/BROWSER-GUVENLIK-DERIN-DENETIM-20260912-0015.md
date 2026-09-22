# Whisper Altyazı — Electron Browser Güvenliği ve Güven Sınırları Derin Denetim Raporu

Tarih: 2026-09-12 · Kapsam: `src/main.js`, `src/preload.js`, `src/browser-preload.js`, `src/renderer/index.html`, `src/renderer/renderer.js`, `src/renderer/styles.css`, `package.json`, browser/Electron testleri, CSP ve BrowserWindow yapılandırması.

Yöntem: statik satır-satır kaynak incelemesi + mevcut test süitinin gerçek kapsamının okunması. Ana kod, test ve yapılandırma değiştirilmedi; patch/commit/branch/silme yapılmadı; gerçek kullanıcı verisi, token, gerçek medya ve dış ağ kullanılmadı.

---

## 1. Tehdit modeli ve saldırı yüzeyi

**Aktör → birincil giriş noktası → ulaşabildiği en derin kaynak (kanıtlanan):**

| # | Aktör | Giriş noktası | Zincir | Ulaşılan kaynak | Durum |
|---|---|---|---|---|---|
| 1 | Kötü dosya adı/yolu | dropZone, `dialog:openVideo`, `paths:scanMedia` | `canonicalLocalPath` → realpath → spawn argv / `shell.openPath` | Yerel FS (kullanıcının kendi yetkisi) | ✅ Sıkı — kontrol karakteri, `\\?\`, ADS, ikinci `:` reddediliyor; `shell:openPath` uzantı whitelist'li |
| 2 | Kötü URL/video girdisi | `media:probe`, `media:download`, `media:downloadSubs`, `transcribe:start --youtube` | doğrudan yt-dlp argv | yt-dlp'nin tam şema/opsiyon yüzeyi | ❌ **F-01** (kesin) |
| 3 | Bozuk altyazı/segment/JSON | `media:readSubtitle`, NDJSON `segment` event'i | `decodeSubtitleBuffer` → DOM | DOM (escapeHtml'li), 32 MB sınır | ✅ Güvenli |
| 4 | Kötü backend stdout/stderr | Python süreçleri | `createNdjsonLineBuffer` (32 MB/8 MB satır sınırı) → `handleLine` → `sendEvent` → `logLine` | DOM log'u (escapeHtml'li), diske job log | ✅ Güvenli; traceback renderer'a hiç gönderilmiyor (main.js:12978) |
| 5 | DOM'a giren saldırgan metin | dosya adı, hata, segment, AI cevabı | innerHTML noktaları | DOM | ✅ ~40 innerHTML noktasının tamamı escapeHtml'li; **istisna F-03** |
| 6 | IPC manipülasyonu | `window.api.*` (199 satır preload) | `authorizedBrowserSender` → handler doğrulaması | Handler'a göre değişir | ✅ 90+ kanal sender+mainFrame korumalı (adversarial-ipc.test.js); argüman doğrulaması kanal bazında değişken (F-01, F-02) |
| 7 | Eksik/yanlış preload | `src/preload.js`, `src/browser-preload.js` | contextBridge | — | ✅ Sandboxed preload require yapamıyor (preload-sandbox.test.js); browser-preload yalnız 5 tip whitelist'li köprü |
| 8 | Kapalı/reload renderer'a event | Python close, browser event'leri | `sendEvent`/`sendBrowserEvent` `isDestroyed()` kontrolü | — | ✅ Sessizce düşüyor; reload sonrası `jobId` eşleşmezliği eski event'i eliyor |
| 9 | Eski + yeni iş yarışı | start/cancel/exit | `createProcessTerminalLatch` + `jobId` + `queueItemId` + `shouldAcceptRunEvent` | UI state | ✅ 3 katman; dar pencere önceki turdaki F-03/H-04 (kayıtlı) |
| 10 | Bozuk settings / taşınmış proje | `settings.json`, import | `sanitizeSettings` + `scanJsonShape` + `recoverJsonTransaction` | userData | ✅ Derinlik 12, 500k düğüm, `__proto__` reddi, enum/aralık tabloları; **istisna F-04** |

## 2. Electron güvenlik yapılandırması

| Yüzey | Kaynak | Değerler | Tehdit etkisi |
|---|---|---|---|
| Ana BrowserWindow | main.js:9100-9107 | `contextIsolation:true, nodeIntegration:false, sandbox:true, webSecurity:true, webviewTag:false, allowRunningInsecureContent:false` | Renderer RCE'si Node'a ulaşamaz; yalnız preload whitelist'i |
| Browser WebContentsView | main.js:8119-8128 | aynı + `partition: BROWSER_PARTITION`, `spellcheck:false`, `autoplayPolicy:'user-gesture-required'` | Web içeriği uygulama renderer'ından ayrı oturumda |
| Popup'lar | browser-navigation-policy.js:124-136 | `securePopupWebPreferences`: sandbox+isolation+webSecurity, `navigateOnDragDrop:false`, preload YOK | OAuth popup'ı ana pencere yetkilerini miras almaz |
| CSP | index.html:5 | `default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' file: blob: https://*.googlevideo.com; connect-src 'self' whisper-pdf: https://*.googlevideo.com` | Inline script çalışmaz; `img-src https:` geniş (M-01) |
| Navigation | main.js:9192 + attachNavigationGuard | `will-navigate` → preventDefault; `will-frame-navigate`/`will-redirect` politika guard'ı | file:// drop-navigasyonu ve şema kaçışı kapalı |
| window.open | main.js:9186-9190, 2973-2988 | `deny` + `openExternalByPolicy` (http/https/mailto) | Popup abuse kapalı |
| Devtools | main.js:9194 | yalnızca `--dev` argv bayrağı | Üretimde kapalı |
| Sertifika | main.js:9199-9209 | `certificate-error` → koşulsuz `callback(false)` | MITM sessiz geçişi yok |
| whisper-pdf şeması | main.js:334-338, 4507-4542 | privileged scheme; handler: hostname=`document`, GET/HEAD, resourceId `/^[a-f0-9]{64}$/`, `pdfFileAccess.has` + yeniden `inspect`, Range 416 doğrulaması | Renderer yalnızca main'in grant ettiği PDF'i okuyabilir; keyfi yol yok |
| Tek örnek | main.js:367-376 | `requestSingleInstanceLock` | Çift-yazar yarışı yok |
| Alt süreç env hijyeni | main.js:280-288 | `spawn`/`spawnSync` sarmalayıcıları `withoutSecretEnv(process.env)`; yalnız transcribe `buildSecretEnv` | yt-dlp/ffmpeg HF/LLM anahtarını göremez |

## 3. Güven sınırları ve veri akışları

```
[web içeriği] ─WebContentsView(sandbox, ayrı partition)─▶ browser-preload (5 tip whitelist)
      │                                                      │ browser:trusted-bridge
      │                                                      ▶ main: senderFrame===mainFrame + tab eşleşmesi + aktif-sekme kapısı
[app renderer] ─contextBridge (window.api, ~190 metod)─▶ ipcMain.handle(*)
      │                                                   ▶ authorizedBrowserSender (sender===mainWindow.webContents && senderFrame===mainFrame)
      │                                                   ▶ kanal-bazlı argüman doğrulaması (DEĞİŞKEN — F-01/F-02)
      ▼
[main] ─spawn(argv, kabuk yok, env temiz)─▶ [python/ffmpeg/yt-dlp]
      │  stdout NDJSON (satır ≤32MB/8MB) → terminal mandalı → sendEvent(isDestroyed kontrollü)
      ▼
[renderer onEvent] jobId + queueItemId + shouldAcceptRunEvent kapıları → DOM (escapeHtml)
```

Kanıtlanan ek sınırlar: `SubtitleFileAccess`/`PdfFileAccess` grant modeli (uzantı+boyut+realpath+%PDF imzası); `whisper-pdf` handler'ı grant olmayan resourceId'yi 404'ler; `browser:trusted-bridge` `page-blocks` dışında aktif-sekme şartı; `browser:command` komut whitelist'i (back/forward/reload/stop/focus/find/zoom/seek/play...).

## 4. Kullanılan sentetik fixture ve izolasyon yöntemi

- Yöntem: statik satır-satır kaynak incelemesi + mevcut test süitinin (`tests/adversarial-ipc.test.js`, `popup-auth-protocol-security.test.js`, `preload-sandbox.test.js`, `browser-safety-controls.test.js`, `settings-security.test.js`) **gerçekten ne doğruladığının** okunması. Önceki turda `npm test` tamamen geçti (bu turda yeniden koşulmadı; kod değişmedi).
- Sentetik payload'lar kaynak üzerinde izlendi (çalıştırılmadı): `javascript:alert(1)`, `data:text/html`, `file:///C:/secret`, `https://user:secret@host`, `about:blank#payload`, `devtools://`, kontrol karakterli URL, `--no-playlist` benzeri argv öneki, `__proto__` anahtarlı settings, 64 MB+ oturum paketi, ANSI escape içeren stderr.
- Repo dışı geçici klasör: yalnızca mevcut testlerin kendi `os.tmpdir()` izolasyonu kullanıldı; yeni fixture dosyası oluşturulmadı.

## 5. Çalıştırılan testler

Bu turda test koşulmadı (kaynak değişikliği yok; önceki turun tam geçen `npm test` sonucu geçerli). Okunarak doğrulanan güvenlik testleri: `adversarial-ipc.test.js` (90+ kanal × 3 yetkisiz gönderici + SubtitleFileAccess ADS/boyut), `popup-auth-protocol-security.test.js` (12 senaryo: scheme reddi, origin ilişkisi, frame guard, popup prefs), `preload-sandbox.test.js` (sandbox'ta require reddi + IPC sözleşmesi), `browser-safety-controls.test.js` (sertifika reddi, site-verisi origin izolasyonu, pin/kapatma koruması).

## 6. Çalıştırılamayan testler ve nedenleri

- **Gerçek Chromium'da CSP/navigation davranışı**: Electron smoke script'leri (`tests/electron-*.smoke.js`) GUI + castlabs ikilisi gerektirir; bu oturumda başlatılmadı. CSP analizi statik.
- **yt-dlp'ye gerçek saldırgan argv gönderme**: dış ağ ve gerçek süreç yasağı gereği yalnızca argv inşası statik kanıtlandı (F-01); yt-dlp'nin `file:` şemasını kabul edip etmediği **kalan belirsizlik** olarak işaretli.
- **Renderer DOM XSS çalıştırma**: jsdom yok; innerHTML noktaları kaynak üzerinden denetlendi.

## 7. Kesin güvenlik bulguları

### F-01 — `media:probe` / `media:download` / `media:downloadSubs` URL'si doğrulanmadan yt-dlp argv'sine geçiyor
- **Aktör:** 2, 6 | **Görev:** 3, 5, 19 | **Önem:** Yüksek
- **Dosya/satır:** `src/main.js:725-734` (probe), `736-752` (download), `782-799` (downloadSubs); preload `src/preload.js:50-52`
- **Girdi kaynağı:** `api.probeYoutube(url)`, `api.downloadYoutube(opts)` — renderer'daki herhangi bir kod (veya renderer'ı ele geçiren XSS).
- **Güven sınırı:** renderer → main → subprocess argv.
- **Zincir:** `ipcRenderer.invoke('media:probe', {url})` → handler'da yalnızca `!input.url` kontrolü → `args=['probe','--url', input.url]` → `runMediaCommand` → `spawn(resolvePython(), [media.py, ...args])`.
- **Yeniden üretim (deterministik, kaynak):** `api.probeYoutube('file:///C:/Users/K/secret.txt')` veya `api.probeYoutube('--no-warnings')` çağrısı handler'dan **reddedilmeden** geçer; karşılaştırma: `browser:navigate` (9574) `normalizeBrowserUrl` ile http/https + host + `!username` zorunluluğu uyguluyor, `browser:clip:export` (11074) aynı kontrolü yapıyor — bu üç medya kanalı yapmıyor. `cookieBrowser` whitelist'li; `url`, `outputDir`, `height`, `audioLang`, `lang` değil.
- **Beklenen:** `normalizeBrowserUrl`/`parsePolicyUrl` ile http/https zorunluluğu ve `--` öneki reddi.
- **Gerçek:** Herhangi bir string argv'ye yazılıyor. Kabuk olmadığı için komut enjeksiyonu yok; fakat yt-dlp'nin kendi yüzeyi (desteklediği şemalar, `--` ile başlayan değerlerin opsiyon olarak ayrışması, hata çıktısında URL yankısı) renderer'a açık.
- **Güvenlik etkisi:** Renderer-compromise senaryosunda saldırgan yt-dlp üzerinden ağ/dosya erişimi ve hata mesajı üzerinden bilgi sızıntısı elde eder; `transcribe:start`'ın `--youtube` argümanı da aynı doğrulamadan yoksun (main.js:12668).
- **Kullanıcı etkisi:** Normal kullanıcıda düşük (kendi girdisi); hata mesajları URL'yi log'a/UI'a taşıyabilir.
- **Guard analizi:** `authorizedBrowserSender` yalnızca göndereni doğrular; `runMediaCommand` tür-bazlı tekil iş kontrolü yapar ama argümanı denetlemez.
- **Test açığı:** `adversarial-ipc.test.js` yetkisiz göndericiyi sınıyor, yetkili-kötü-argümanı sınamıyor; `browser-youtube-whisper.test.js` mutlu yol.
- **Güven:** Kesin (kod zinciri doğrudan). **Kalan belirsizlik:** yt-dlp'nin `file:` şemasını kabulü sürüme bağlı — bu, azaltıcı değil kapsam belirsizliğidir.
- **Önerilen çözüm:** Üç handler + `transcribe:start --youtube` için ortak `assertPublicHttpUrl(value)` (parsePolicyUrl + `!username` + `!value.startsWith('-')`); argv'de `--` ayırıcı.
- **Etkilenecek dosyalar:** `src/main.js`. **Kabul kriterleri:** `file:`, `javascript:`, `-`-önekli, kullanıcı-bilgili URL'ler `{ok:false}` döner; meşru YouTube URL'leri çalışır. **Regresyon:** adversarial-ipc'ye yetkili-kötü-argüman testleri.

### F-02 — `media:waveform` / `media:probeTracks` / `media:extractSubtitleTrack` keyfi yerel dosya yolunu ffmpeg/ffprobe'a veriyor
- **Aktör:** 1, 6 | **Görev:** 3, 6 | **Önem:** Orta
- **Dosya/satır:** `src/main.js:12081` (waveform: yalnız `fs.existsSync` kontrolü), `11966` (probeTracks: yalnız tip kontrolü), `12029` (extractSubtitleTrack: `fs.existsSync` + `buildSubtitleExtractionArgs`).
- **Zincir:** `api.getWaveform('C:\\Windows\\System32\\config\\SAM')` → handler → `spawn(ffmpeg, ['-i', filePath, ...])`. `subtitleFileAccess`/`canonicalLocalPath`'ten **geçmiyor** — altyazı handler'larındaki grant modelinin aksine.
- **Yeniden üretim:** Renderer'dan yukarıdaki çağrı; ffmpeg dosyayı okur, PCM çıktısı 12 MB'a kadar renderer'a döner (waveform) veya ffprobe JSON'u döner (probeTracks).
- **Beklenen:** Medya dosyaları için de grant/uzantı kontrolü (`MEDIA_EXTS` + canonical path) veya kullanıcı onayı.
- **Gerçek:** Kullanıcının okuyabildiği **her dosya** ffmpeg'e verilebiliyor. Etki kullanıcının kendi yetkisiyle sınırlı (privilege escalation yok) ama minimum-yetki ihlali: renderer, uygulamanın dosya diyaloğuyla hiç seçilmemiş dosyaları dolaylı okuyabiliyor (içerik sızıntısı: waveform PCM'i ve ffprobe metadata'sı gerçek içerik taşır).
- **Guard analizi:** `shell:openPath`'teki uzantı whitelist'i bu kanallarda yok; `dialog:openVideo` grant'ı yalnızca altyazı erişimini kapsıyor.
- **Test açığı:** `media-source.test.js` mutlu yol; grant-modeli testleri (`pdf-file-access.test.js`) bu kanalları kapsamıyor.
- **Güven:** Kesin.
- **Önerilen çözüm:** Üç handler'da `MEDIA_EXTS` uzantı + `canonicalLocalPath` + (probeTracks/extract için) kullanıcının oynatıcıda açtığı medya anahtarıyla eşleşme. **Etkilenen:** `src/main.js`. **Kabul:** izinsiz yol `{ok:false}`; oynatıcıdaki dosya çalışır.

### F-03 — `renderBrowserPagePreview` sonuç alanlarını kaçışsız `innerHTML`'e gömüyor
- **Aktör:** 3, 5 (web sayfası içeriğinden türeyen sayaçlar) | **Görev:** 4 | **Önem:** Orta
- **Dosya/satır:** `src/renderer/renderer.js:16598-16606`
- **Zincir:** `browser:page:preview` sonucu (main'de `pagePreviewSummary` — sayfa içi script'in `pageBlockScanScript` çıktısından üretiliyor) → `panel.innerHTML = '...' + result.totalBlocks + ' ... ' + result.apiBlocks + ...`. İlk beş alan `Number()` zorlaması **olmadan** birleştiriliyor; aynı dosyadaki eşdeğer kod (`renderBrowserPageReport`, 16660+) her alanı `escapeHtml`'den geçiriyor.
- **Yeniden üretim:** `window.api.previewBrowserPageTranslation` mock'undan `{ok:true, totalBlocks:'<img src=x onerror=alert(1)>'}` döndürmek → payload DOM'a ham yazılır. Gerçek akışta değerler main'de `pagePreviewSummary`'den geliyor; main'in her yolda sayıya zorladığı tek noktadan garanti edilmiyor (block sayaçları sayfa içeriğinden türetiliyor).
- **Beklenen:** `Number(result.totalBlocks)||0` veya `escapeHtml`.
- **Gerçek:** CSP `script-src 'self'` sayesinde script çalışmaz, fakat attribute-injection/DOM manipülasyonu (ör. `data-page-*` hedefli) mümkün; savunma derinliği eksik.
- **Guard analizi:** CSP ikinci hat; kod seviyesinde guard yok.
- **Test açığı:** `browser-page-translation-main.test.js` main tarafı; bu renderer fonksiyonu için XSS fixture'ı yok.
- **Güven:** Kesin (kaçışsız birleştirme doğrudan görülüyor); istismar için main'den string sızması gerekir — bu yüzden etki derecesi orta.
- **Önerilen çözüm:** Tüm alanları `Number(x)||0` ile zorla. **Etkilenen:** `src/renderer/renderer.js:16598`. **Regresyon:** preview renderer testi + bozuk payload fixture'ı.

### F-04 — Ayar import'u `outputDir`/`watchDir`/`lastInputDir` için yalnızca "mutlak yol" denetliyor; tehlikeli hedef kabul ediliyor
- **Aktör:** 10 (dışarıdan taşınmış/kötü niyetli yedek dosyası) | **Görev:** 13 | **Önem:** Orta
- **Dosya/satır:** `src/settings-security.js:296-300` (`pathSetting`: `\0` reddi + 4000 karakter + `path.win32.isAbsolute` — hepsi bu); `src/main.js:11873+` (`settings:import`).
- **Zincir:** Kullanıcı "Ayarları içe aktar" → hazırlanmış `yedek.json` (`{"outputDir":"C:\\Windows\\System32"}` veya UNC `\
AS\public`) → `parseImportText` → `sanitizeSettings` → **kabul** → `writeJsonTransaction(settingsPath())` → sonraki transkripsiyonda çıktılar bu klasöre yazılır; `watchDir` benzer şekilde klasör izlemeyi sistem klasörüne bağlar.
- **Yeniden üretim:** Yukarıdaki JSON'u import etmek; `pathSetting` hatayı yalnızca göreli yolda verir.
- **Beklenen:** Sistem kökleri (`C:\Windows`, `C:\Program Files`, sürücü kökü) ve muhtemelen ağ paylaşımları için en azından uyarı/onay; `shell:openPath`'teki gibi amaç sınırlaması.
- **Gerçek:** Herhangi bir mutlak yol sessizce kalıcı ayara yazılıyor. Veri bütünlüğü riski: transcribe çıktıları (`writeSubtitleAtomic` + `backupOnce`) hedef klasördeki aynı adlı dosyaların üzerine yazar.
- **Guard analizi:** `scanJsonShape` ve enum tabloları diğer alanları sıkı tutuyor; yol alanları kasıtlı olarak serbest (kullanıcı her klasörü seçebilmeli) — ama import, diyalogla seçimden farklı bir güven bağlamı.
- **Test açığı:** `settings-security.test.js` sanitize kurallarını sınıyor; "tehlikeli ama mutlak yol" fixture'ı yok.
- **Güven:** Kesin (kontrolün kapsamı doğrudan okunuyor); etki kullanıcının import ettiği dosyaya güvenmesine bağlı — bu yüzden orta.
- **Önerilen çözüm:** `pathSetting`'e ayrılmış-kök listesi + import akışında yol alanları için kullanıcı onayı diyalogu. **Etkilenen:** `src/settings-security.js`, `src/main.js` (import). **Regresyon:** system32/UNC/kök fixture'ları.

### F-05 — `browser:trusted-bridge`'in `page-blocks` mesajı aktif-olmayan sekmeden kabul ediliyor
- **Aktör:** 5 (ziyaret edilen sayfa) | **Görev:** 11, 12 | **Önem:** Orta
- **Dosya/satır:** `src/main.js:9344-9360` — `(message.type !== 'page-blocks' && message.type !== 'page-action' && tab.id !== browserActiveTabId) return;` → **`page-blocks` ve `page-action` aktif-sekme şartından muaftır.**
- **Zincir:** Arka plan sekmesindeki sayfa (main'in `executeJavaScriptInIsolatedWorld` ile kurduğu köprü üzerinden) `page-blocks` gönderir → `acceptDynamicBrowserPageBlocks(tab, payload)` → sekmenin çeviri oturumu güncellenir → renderer'a `browser:event`.
- **Yeniden üretim:** İki sekme: A aktif, B arka planda. B'nin sayfası enstrümante edilmişse B'nin blokları B'nin oturumuna yazılır — bu kısmen tasarım (arka plan çevirisi); ancak `handleBrowserPageAction`'da `payload.bridgeToken !== tab.bridgeToken` kontrolü varken `acceptDynamicBrowserPageBlocks` yolunda token kontrolünün tüm girişlerde zorunlu olup olmadığı kaynakta tek noktadan garanti edilmiyor (`page-action` için var, `page-blocks` için bridgeToken scan script'e parametre olarak veriliyor ama kabul tarafında doğrulama satırı bu okumada görülmedi).
- **Beklenen:** Her trusted-bridge mesajında `bridgeToken` + sekme/generation doğrulaması.
- **Gerçek:** `page-blocks` için aktif-sekme muafiyeti + token doğrulamasının kanıtlanamaması → arka plan/kapanmakta olan sekmenin sayfası yanlış oturuma blok enjekte edebilir (confused-deputy: çeviri yanlış sayfaya uygulanır).
- **Guard analizi:** `event.senderFrame === event.sender.mainFrame` (iframe engeli) ve tab↔webContents eşleşmesi var; token/generation katmanı eksik olabilir.
- **Test açığı:** `electron-browser-trusted-bridge.smoke.js` GUI gerektiriyor; birim testlerde bu muafiyet sınanmıyor.
- **Güven:** Kesin (muafiyet satırı doğrudan); token boşluğu **kaynakla desteklenen yüksek olasılık** olarak not ediliyor.
- **Önerilen çözüm:** `acceptDynamicBrowserPageBlocks` girişinde `payload.bridgeToken === tab.bridgeToken && session.generation === tab.generation` zorunluluğu. **Etkilenen:** `src/main.js`. **Regresyon:** arka-plan-sekme enjeksiyon testi.

## 8. Yüksek olasılıklı bulgular

- **H-01 (Görev 8/16 — bilgi sızıntısı):** `startJobLog` `# Ayarlar: args.slice(1).join(' ')` satırını diske yazıyor (main.js:565-570). Token'lar argv'de değil env'de olduğu için secret sızıntısı yok; **ama** `--initial-prompt`, `--glossary`, `--translate-context`, tam girdi yolu ve `--output-dir` düz metin olarak `userData/logs/*.log`'a yazılıyor ve `logs:openFolder` ile kullanıcıya açılıyor. Hassas içerik (ör. prompt'taki bağlam) log'da kalıcı. Sınıf: kaynakla desteklenen; etki düşük-orta.
- **H-02 (Görev 9/10):** `runMediaCommand`'in `stderrTail` (son 500 karakter) hata durumunda `writeJobLog` ve `{ok:false, error}` üzerinden renderer'a taşınıyor; yt-dlp/ffmpeg stderr'i URL ve yol yankısı içerir. ANSI escape karakterleri DOM'da `escapeHtml`'lenir ama **temizlenmez** — log satırında kontrol karakteri olarak kalır (görsel bozulma, enjeksiyon değil). Sınıf: kaynakla desteklenen.
- **H-03 (Görev 17 — DoS):** `browser:liveAsr:chunk` 384 KB/parça ve 8 dosya kuyruğu sınırlı ✓; fakat `browser:setOverlay` 2×20000 cue ve `browser:translation:snapshot` 2×20000 kayıt döndürüyor — tek IPC'de ~onlarca MB structured-clone. Renderer bunu isterse ana thread kısa süreli kilitlenir. Sınır var ama gevşek. Sınıf: kaynakla desteklenen, etki düşük.
- **H-04 (Görev 14 — clipboard):** `clipboard:write` tip kontrolü dışında sınırsız (main.js:11642). Renderer keyfi pano yazabiliyor (tasarım gereği "Kopyala" düğmeleri); HTML pano içeriği yalnızca `writeText` ile yazılıyor — HTML yorumlaması yok ✓. Boyut sınırı yok: 100 MB metin panoya yazılabilir. Sınıf: düşük.

## 9. Manual doğrulama gerektiren maddeler

- **M-01:** `img-src 'self' data: https:` — tarayıcıdan gelen favicon'lar herhangi bir HTTPS hostundan yükleniyor; tracking-pixel sızıntısı. Doğrulama: ağ paneliyle favicon isteği gözlemi.
- **M-02:** `whisper-pdf` şeması `corsEnabled:true` + `connect-src whisper-pdf:` — renderer fetch ile yalnızca grant'lı resourceId'ye ulaşır (handler 404); fakat `standard:true` şemanın adres çubuğuna yazılabilirliği ve diğer WebContents'lerden erişilebilirliği (browser view'ları aynı `protocol.handle`'ı paylaşıyor — web sayfası `whisper-pdf://document/<64hex>` tahminiyle istek atabilir; 2^256 tahmin uzayı pratikte kapalı ama **handler'da isteyen-frame kontrolü yok**). Doğrulama: browser sekmesinden fetch denemesi.
- **M-03:** `browser:command` `speed`/`seek` gibi komutlar `executeJavaScriptInIsolatedWorld` ile sayfaya kod gönderiyor; `value` sayısallaştırma kontrolleri handler'da var ama tüm komut kollarının tamamı bu okumada görülmedi (9854+ devamı). Doğrulama: her komut kolu için value fuzz.
- **M-04:** `browser:open-link` (browser-preload Ctrl/middle-click) main tarafında yeni sekme açıyor — `decideUrlPolicy` uygulanıyor mu, yoksa doğrudan `createBrowserTabRecord` + navigate mi, bu okumada handler'ı bulunamadı. Doğrulama: `javascript:` href'li linke Ctrl+tık.

## 10. False positive'ler

- **FP-01 — "Renderer Node'a erişebilir":** sandbox+isolation+preload whitelist; `require` sandbox'ta atıyor (preload-sandbox.test.js kanıtlı).
- **FP-02 — "Eski işin event'i yeni işe sızar":** `jobId`+`queueItemId`+`shouldAcceptRunEvent`+terminal mandalı (4 katman, audit-tur5/6/7 testleri).
- **FP-03 — "innerHTML XSS":** ~40 innerHTML noktasının tamamı escapeHtml'li veya statik SVG; tek istisna F-03.
- **FP-04 — "will-navigate ile file:// açılır":** `will-navigate` preventDefault + document drop preventDefault + CSP `default-src 'self'`.
- **FP-05 — "Popup'tan preload yetkisi sızar":** `securePopupWebPreferences` preload içermiyor (popup-auth testi `Object.hasOwn(prefs,'preload')===false` doğruluyor).
- **FP-06 — "Token argv ile sızar":** `buildSecretEnv` + `withoutSecretEnv` sarmalayıcıları; `startJobLog` yorumu bunu belgeliyor (main.js:567).
- **FP-07 — "whisper-pdf keyfi dosya okur":** 64-hex resourceId + `pdfFileAccess.has` + yeniden `inspect` + Range 416 — grant'sız erişim yok (M-02'deki frame kontrolü notu ayrı).

## 11. 20 görev sonuç tablosu

| # | Görev | Sonuç |
|---|---|---|
| 1 | Electron yapılandırması | ✅ §2 — tüm yüzeyler kaynak konumlarıyla; eksik: M-02 frame kontrolü |
| 2 | Renderer–preload sınırı | ✅ ~190 metod envanteri; F-01/F-02 minimum-yetki ihlalleri |
| 3 | IPC whitelist + argüman doğrulama | ✅ `authorizedBrowserSender` her kanalda; argüman doğrulaması değişken → F-01, F-02 |
| 4 | DOM XSS | ✅ FP-03 + F-03 |
| 5 | URL/scheme abuse | ✅ popup-auth testleriyle kanıtlı kapalı; medya kanalları F-01 |
| 6 | Dosya yolu güvenliği | ✅ `canonicalLocalPath` (kontrol karakteri/ADS/`\\?\`/ikinci `:` reddi) + grant modeli; F-02 istisnası |
| 7 | Çıktı üzerine yazma | ✅ `writeSubtitleAtomic` (tmp+rename) + `backupOnce` + `validateSubtitleExport` + burn-in atomic replace; UI↔main yol ayrışması: `sendEvent`'te grant edilen `files` renderer'a aynen dönüyor ✓ |
| 8 | Hassas veri sızıntısı | ✅ Token hijyeni FP-06; H-01/H-02 log içeriği notları |
| 9 | Subprocess stdout/stderr | ✅ Satır sınırları + stderr tail kelepçesi + traceback renderer'a yok; H-02 ANSI notu |
| 10 | NDJSON güvenliği | ✅ `createNdjsonLineBuffer` overflow reddi; bilinmeyen type `log`'a düşer; `jobId` kapısı |
| 11 | Job identity / confused-deputy | ✅ transcribe akışı kapalı; **F-05** trusted-bridge muafiyeti |
| 12 | Navigation izolasyonu | ✅ FP-04; M-04 `browser:open-link` doğrulaması gerekli |
| 13 | Ayar import/export | ✅ sanitize+shape+transaction; **F-04** yol kabulü |
| 14 | Clipboard | ✅ H-04 (boyut sınırı yok, HTML yorumlaması yok) |
| 15 | Kapanış/reload güvenliği | ✅ `isDestroyed` kontrolleri + `saveSettingsSync`/`queue:saveSync` sender doğrulamalı; reload'da eski jobId düşer |
| 16 | Hata yönetimi / bilgi sızıntısı | ✅ Hata mesajları sınırlı (`err.message`); stack renderer'a gitmiyor; `unhandledRejection` 2000 karakter kelepçeli |
| 17 | DoS / kaynak | ✅ Satır/parça/sekme/cue sınırları envanterde; H-03 gevşek nokta |
| 18 | Güvenli varsayılanlar | ✅ Bozuk settings→`{glossary:[]}`; permission reddi→block; eksik API→`window.api.X?.` opsiyonel zincirler; hata yetkiyi genişletmiyor (import hatası eski dosyayı korur) |
| 19 | Testlerin güvenlik kapsamı | ⚠️ §14 |
| 20 | Tehdit zincirleri | ✅ §12 |

## 12. Saldırı zinciri ve blast-radius analizi

| Zincir | Uçtan uca durum |
|---|---|
| Kötü dosya adı → IPC → main → çıktı dosyası | `canonicalLocalPath` + atomic write + backup; **kapalı**. Blast radius: kullanıcının kendi çıktı klasörü. |
| Kötü URL → navigation → popup | `normalizeBrowserUrl` + `decideUrlPolicy` + `deny`; **kapalı** (M-04 hariç). |
| Kötü URL → **medya subprocess** | **AÇIK (F-01)**: renderer → `media:probe/download/downloadSubs` → yt-dlp argv. Blast radius: yt-dlp'nin ağ/dosya yüzeyi + hata yankısı üzerinden bilgi sızıntısı; subprocess env'i temiz (secret yok). |
| Kötü backend logu → NDJSON → DOM | satır sınırı + JSON.parse + escapeHtml; **kapalı** (H-02 kozmetik ANSI notu). |
| Eski event → yanlış job → yanlış preview | 4 katman; **kapalı**. |
| Bozuk settings → tehlikeli varsayılan → süreç başlatma | sanitize enum/aralık tabloları çoğu alanı kelepçeliyor; **F-04** yol alanları açık → blast radius: kullanıcının yazma yetkisi olan her klasör (transcribe çıktıları + watch hedefi). |
| Web sayfası → trusted-bridge → yanlış çeviri oturumu | **F-05**: arka plan sekmesinden `page-blocks` kabulü; blast radius: yanlış sayfaya çeviri uygulanması (görsel/veri bütünlüğü, kod çalıştırma değil). |

## 13. P0/P1/P2 uygulama planı (yalnızca plan — uygulanmadı)

| Öncelik | Madde | Kök neden | En küçük güvenli çözüm | Değişecek fonksiyonlar | Yetki etkisi | Geriye uyumluluk | Veri riski | Testler | Kabul kriterleri | Rollback |
|---|---|---|---|---|---|---|---|---|---|---|
| **P0** | F-01 medya URL doğrulama | Handler'larda şema kontrolü yok | Ortak `assertPublicHttpUrl` + `--` ayırıcı | `media:probe`, `media:download`, `media:downloadSubs`, `transcribe:start --youtube` (main.js) | Renderer'ın yt-dlp yüzeyi http/https ile sınırlanır | `ytsearch:` gibi egzotik girdiler reddedilir — bilinçli whitelist | Yok | adversarial-ipc'ye yetkili-kötü-argüman seti | `file:`/`javascript:`/`-x`/userinfo'lu URL `{ok:false}`; YouTube URL çalışır | Tek commit revert |
| **P1** | F-02 ffmpeg yol grant'i | Medya handler'ları grant modeli dışında | `MEDIA_EXTS` + `canonicalLocalPath` + oynatıcı-medya eşleşmesi | `media:waveform`, `media:probeTracks`, `media:extractSubtitleTrack` | Keyfi dosya okuma kapanır | Diyalogla seçilmemiş dosyalar reddedilir | Yok | grant-modeli testlerine medya fixture'ı | İzinsiz yol reddedilir; açık medya çalışır | Revert |
| **P1** | F-05 bridge token | `page-blocks` aktif-sekme muafiyeti + token doğrulaması eksik | `bridgeToken` + generation şartı | `acceptDynamicBrowserPageBlocks` çağrı noktası (main.js:9356) | Arka plan enjeksiyonu kapanır | Meşru arka-plan çevirisi token taşıdığı sürece çalışır | Yanlış oturuma yazılmış bloklar temizlenmeli | trusted-bridge smoke'a arka-plan senaryosu | Token'sız/eski token reddedilir | Revert |
| **P2** | F-03 preview kaçışı | Sayısal alanlar kaçışsız | `Number(x)\|\|0` zorlaması | `renderBrowserPagePreview` (renderer.js:16598) | Yok | Yok | Yok | Bozuk payload fixture'lı renderer testi | String alan DOM'a metin dışında giremez | Revert |
| **P2** | F-04 import yol onayı | `pathSetting` yalnız mutlaklık denetliyor | Ayrılmış-kök listesi + import'ta yol onay diyaloğu | `pathSetting` (settings-security.js), `settings:import` (main.js) | Import'un kalıcı hedef değiştirme yetkisi kullanıcı onayına bağlanır | Mevcut meşru yollar korunur | Onay öncesi eski settings korunur | system32/UNC/kök fixture'ları | Ayrılmış kök reddedilir veya onay ister | Revert |
| **P3** | M-02 pdf frame kontrolü | Protokol handler'ı isteyeni denetlemiyor | `request.referrer`/frame origin ana pencereyle sınırlama | `protocol.handle('whisper-pdf')` | Web sekmelerinden pdf şemasına erişim kapanır | Renderer akışı değişmez | Yok | browser sekmesinden fetch smoke'u | WebContentsView'dan istek 403/404 | Revert |
| **P3** | H-01 log hijyeni | Prompt/glossary/yol log'da düz metin | `--initial-prompt`/`--glossary` değerlerini log'da uzunlukla değiştir | `startJobLog` (main.js:565) | Yok | Log formatı değişir | Eski log'lar olduğu gibi kalır | Log içeriği snapshot testi | Log'da secret-benzeri değer yok | Revert |

## 14. Eksik güvenlik testleri

1. **Yetkili-kötü-argüman sınıfı:** adversarial-ipc yalnızca kimliği sınıyor. F-01/F-02'yi yakalayacak "doğru sender + zehirli argüman" matrisi yok — mevcut testlerin sahte güven ürettiği ana nokta.
2. **trusted-bridge muafiyeti:** `page-blocks`/`page-action` için arka-plan sekmesi senaryosu yalnızca GUI smoke'unda var; birim testi yok (F-05).
3. **Renderer DOM XSS harness'ı:** innerHTML noktaları jsdom'suz test edilemiyor; F-03 sınıfı kaçışsız birleştirmeler statik analizle bulunabiliyor ancak.
4. **CSP çalışma-zamanı doğrulaması:** meta-CSP'nin gerçek Chromium'da uygulandığını sığayan test yok; `browser-safety-controls.test.js` kaynak regex'iyle yetiniyor.
5. **Import yol fixture'ları:** settings-security testleri sanitize kurallarını sınıyor ama "tehlikeli ama geçerli mutlak yol" senaryosu yok (F-04).
6. **`browser:open-link` politikası:** Ctrl/middle-click akışının `decideUrlPolicy`'den geçtiğini doğrulayan test yok (M-04).

## 15. Son değişiklik ve bütünlük doğrulaması

**Başlangıç Git durumu (tur başında kaydedildi):** branch `master`, ahead 0 / behind 0, izlenen dosyalarda değişiklik yok; izlenmeyenler: 7 rapor dosyası + `scratch/`.

**Son durum:**
```
git status --short  → 10 izlenmeyen rapor dosyası + scratch/  (başlangıçtaki 7'ye
                       BROWSER-EVENT-DENETIM-20260911-2333.md,
                       BROWSER-KOMBINASYON-DENETIM-20260911-2341.md,
                       BROWSER-UI-DENETIM-TAM-20260911-2320.md eklenmiş —
                       paralel çalışanların çıktıları; bu oturumda oluşturulmadı,
                       sahiplenilmiyor, dokunulmadı)
git diff --check    → temiz (exit 0)
git diff --stat     → boş (izlenen hiçbir dosyada değişiklik yok)
```

**Doğrulama kapsamı:** Bu oturumda hiçbir kaynak dosya, test, yapılandırma değiştirilmedi; patch/refactor/format/commit/branch/silme yapılmadı. Bunu kanıtlayabildiğim kapsam: `git diff` (izlenen dosyalar) tamamen boş ve `git diff --check` temiz. İzlenmeyen dosyaların içeriği Git tarafından izlenmediği için onlar hakkında yalnızca "bu oturumda oluşturulmadı/dokunulmadı" diyebilirim — paralel çalışanların eklediği 3 yeni rapor başlangıç listesinde yoktu ve tarafımdan yazılmadı. Statik inceleme ile test sonucu ve manuel doğrulama gerektiren maddeler raporda birbirinden ayrı işaretlendi; hiçbir düzeltme uygulanmadı.

## GÜNCEL BULGU DURUMU — 2026-09-12

### Bulgu yanıt tablosu

| ID | Durum | Ayrıntılı düzeltme / ret gerekçesi |
|---|---|---|
| F-01 | DÜZELTİLDİ | Üç media URL handler'ı ve `transcribe:start --youtube` ortak http/https politikasıyla doğrulanıyor. |
| F-02 | DÜZELTİLDİ | `MediaFileAccess` canonical dosya, uzantı ve kullanıcı grant'i uygular. Probe/extract/waveform/transcribe izinsiz yolu reddeder; drop API yalnız Electron `File` nesnesinden yol çıkarır. |
| F-03 | DÜZELTİLDİ | Beş preview sayaç alanı `Number(...) || 0` ile DOM öncesi sayıya zorlandı. |
| F-04 | DÜZELTİLDİ | Import edilen output/watch/lastInput yolu değişiyorsa yazımdan önce açık kullanıcı onayı istenir; iptal hiçbir değişiklik yazmaz. |
| F-05 | FALSE/RET | Arka plan çevirisi kasıtlıdır. Kabul yolu hem tab generation hem bridgeToken eşitliği ister; rapordaki “token yok” varsayımı güncel kaynakta yanlış. |
| H-01 | DÜZELTİLDİ | Job log tam yol/prompt/glossary/context yazmıyor; taban ad + redakte argümanlar. |
| H-02 | DÜZELTİLDİ | stderr ANSI/control, HTTP(S) URL ve Windows yol redaksiyonu sonrası 500 karakter. |
| H-03 | DÜZELTİLDİ | Overlay/snapshot 20000 kayıt + toplam 4 MiB; cue alanları minimal ve kelepçeli. |
| H-04 | DÜZELTİLDİ | Clipboard en fazla 4 MiB metin kabul ediyor. |
| M-01 | DÜZELTİLDİ | Uzak HTTPS görsel CSP izni kaldırıldı. |
| M-02 | DÜZELTİLDİ | PDF protokolü origin/referrer 403 kapısı ve resource grant kullanıyor. |
| M-03 | FALSE/RET | Komut/value whitelist, finite ve aralık denetimi mevcut; sayı fuzz testleri geçiyor. |
| M-04 | FALSE/RET | `browser:open-link` yalnız politika tarafından kabul edilen http/https URL açıyor. |
| FP-01…07 | FALSE/RET | Node erişimi, stale job, genel innerHTML, file navigation, popup preload, token argv ve grantsiz PDF iddiaları savunmalarla çürütüldü; gerçek tek DOM istisnası F-03 idi ve düzeltildi. |

### Ayrıntılı doğrulama dökümü

Medya grant, preload drop, URL politikası, log redaksiyonu, IPC/clipboard sınırı, PDF origin ve remote-debug kontrolleri `tests/audit-report-regressions.test.js`, `tests/media-file-access.test.js`, `tests/adversarial-ipc.test.js` ve tam pakette geçti. `npm test` çıkış 0. Tam çapraz döküm: `AUDIT-KAPANIS-MATRISI-2026-09-12.md`.
