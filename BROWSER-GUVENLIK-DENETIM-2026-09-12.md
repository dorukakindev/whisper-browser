# Whisper Local — Browser/Electron Güvenlik ve Browser Denetim Raporu (Tam)

**Denetim tarihi:** 2026-09-12 · **Kapsam:** `src/renderer/*`, `src/preload.js`, `src/main.js` (BrowserWindow/WebContentsView/IPC/pencere yönetimi), `package.json`, CSP ve browser test dosyaları · **Mod:** salt-okunur inceleme + mevcut testlerin çalıştırılması. Denetçi ana koda, testlere ve ayarlara dokunmamıştır.

> **Çalışma ağacı uyarısı (raporun doğruluğu açısından kritik):** Denetim, denetçi oturumunun başında temiz (`git diff` boş) bir ağaçta yapıldı. Raporun son doğrulaması sırasında ağaçta **denetçiye ait olmayan 62 değiştirilmiş dosya** (src + tests, +1183/−268 satır) belirdi. Bu değişiklikler paralel bir oturumun düzeltme turudur; denetçi tarafından yapılmamış, incelenmemiş ve onaylanmamıştır. Bu rapordaki tüm satır numaraları ve bulgular **denetim anındaki (değişiklik öncesi) koda** aittir. Denetim sonrası kodda yeniden doğrulanabilen noktalar §10'da ayrıca işaretlendi.

---

## 1. Yönetici özeti

**Genel değerlendirme:** Uygulamanın browser güvenlik mimarisi bu kod tabanı ölçeğinde alışılmadık derecede sağlam. Ana pencere ve tarayıcı sekmeleri `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` ile çalışıyor; CSP `script-src 'self'` ile katı; preload yüzeyi geniş ama main tarafında **her IPC handler `authorizedBrowserSender` (sender + mainFrame doğrulaması) ile korunuyor**; URL kararları tek bir politika modülünden (`browser-navigation-policy.js`) geçiyor ve `javascript:`, `file:`, `data:`, kimlik-bilgili URL'ler, kontrol karakterleri ve 8 KB üstü URL'ler reddediliyor. Renderer'daki ~40 `innerHTML` kullanımının tamamı tek tek incelendi: kullanıcı/backend kaynaklı tüm interpolasyonlar `escapeHtml` üzerinden geçiyor, geri kalanlar statik SVG/şablon. XSS yüzeyi bulunamadı.

**Bulgu sayıları:**

| Sınıf | Adet |
|---|---|
| KESİN | 0 |
| YÜKSEK OLASILIKLI | 2 |
| TEORİK | 3 |
| MANUAL DOĞRULAMA GEREKLİ | 2 |
| FALSE POSITIVE (kayıtlı) | 4 |

**En kritik gözlemler (kanıt düzeyi sınırlı):**

1. **YO-1 — CSP genişlikleri:** `img-src https:` (herhangi bir HTTPS hostundan görsel) renderer'a gereğinden geniş; pratik saldırı yüzeyi düşük ama "katı CSP" iddiasıyla çelişen tek nokta. Görsel kanalıyla dışarı veri sızdırma (ör. `https://evil/?secret`) teorik olarak mümkün; renderer'da denetim anında `<img>`/uzak görsel kullanımı yoktu.
2. **YO-2 — `media:probe` / `media:download` / `media:downloadSubs` URL doğrulaması yok:** Renderer'dan gelen herhangi bir URL, protokol/host kısıtı olmadan yt-dlp alt sürecine `--url` argümanı olarak geçiyor. Argüman enjeksiyonu yok (spawn, shell yok) ancak renderer'ı ele geçiren bir içerik rastgele iç ağ adreslerine (SSRF benzeri) yt-dlp isteği başlatabilir. `decideUrlPolicy` bu kanallarda kullanılmıyor.
3. **T-1 — `shell:openPath` uzantı listesi geniş:** `.json`, `.txt`, `.log` dahil 30+ uzantı `shell.openPath` ile işletim sistemine devredilebiliyor; yol `canonicalLocalPath` ile sertleştirilmiş ama uzantı beyaz listesi "altyazı çıktısı" ihtiyacından geniş.

**Kesin bulgu çıkmamasının nedeni:** Kritik akışların (XSS, IPC kötüye kullanımı, URL politikası, ayar doğrulama, kuyruk/iptal yarışları, event sıralaması) her biri için hem savunma kodu hem de geçen regresyon testi mevcut. Aday bulunan her noktada ikinci bir kontrol (escape, sender doğrulaması, enum/sınır doğrulaması, generation/jobId kapısı) sorunu engelliyordu; bunlar §6 "False positive" bölümünde belgelendi.

---

## 2. Ortam ve yöntem

**Kullanılan komutlar (hepsi salt-okunur veya bellek-içi/izole):**

| Komut | Amaç | Sonuç |
|---|---|---|
| `npm test` (tests/run-all.js) | Tüm Node + Python test paketi | **Tümü geçti** (son blok: "Tüm testler geçti"; 158 Python transkripsiyon testi dahil) |
| `node --check src\main.js / preload.js / renderer.js / queue-lifecycle.js / renderer-ui-model.js` | Sözdizimi doğrulama | OK |
| `node tests\renderer-state-a11y-responsive.test.js` | A11y/responsive model testleri | 11 test geçti (10.000 dizi, 400.000 olay, 25 viewport örneği) |
| `node tests\queue-lifecycle.test.js` | Kuyruk/terminal yarışları | 15 test geçti (mutasyon testi dahil) |
| `node tests\preload-sandbox.test.js` | Preload sandbox sözleşmesi | Geçti |
| `node tests\adversarial-ipc.test.js` | IPC sınır saldırıları | 11 test geçti |
| `node tests\browser-experience.test.js` / `browser-foundation` / `browser-safety-controls` / `popup-auth-protocol-security` / `browser-controls-behavior` | Browser güvenlik/davranış | Hepsi geçti (7 + 20 + 5 + 11 test) |
| `node tests\browser-subtitles` / `browser-media-controller` / `browser-script-execution` / `browser-live-audio` / `browser-downloads` / `browser-page-translate` / `browser-manga` / `browser-overlay-controller` / `browser-network-capture` / `browser-capture-recovery` | Browser alt sistemleri | Hepsi geçti (63 + 19 + 9 + 91 + 12 + 7 test vb.) |
| `node tests\browser-navigation-abort` / `browser-settings-navigation-guard` / `browser-toolbar-clickability` / `browser-tabs` / `browser-session-privacy` / `settings-persistence` / `settings-security` / `queue-persistence` / `pipeline-cancel` / `browser-subtitle-session` | Navigasyon, oturum, kalıcılık, iptal | Hepsi geçti (18 session/mahremiyet, 17 settings güvenlik, 13 queue-persistence, 8 pipeline-cancel testi vb.) |
| `node -e "…decideUrlPolicy…"` (bellek-içi) | URL politikasına sentetik payload | `javascript:`, `file:`, `data:`, `vbscript:`, `ftp:`, `user:pass@`, 8 KB+ URL → hepsi **deny**; yalnız http/https/mailto → external |
| `node -e "…sanitizeSettings…"` (bellek-içi) | Ayar doğrulamasına sentetik payload | Aralık dışı sayı, NaN, `javascript:` endpoint, 5 KB model adı, geçersiz preset, dizi-olmayan glossary, göreli yol, kimlik-bilgili endpoint → hepsi **reddedildi** |
| `node -e "…normalizeBrowserTabId…"` | Sekme kimliği doğrulaması | `../../etc`, sayı, 500 char → `""` (red) |
| Geçici statik tarama (scratch altında, sonra silindi) | `innerHTML` şablonlarında escape'siz interpolasyon | 3 aday → üçü de güvenli (statik SVG, saat damgası, `formatTime` çıktısı) |

**İzolasyon:** Hiçbir fixture dosya oluşturulmadı; bellek-içi `node -e` değerlendirmeleri kullanıldı. Tek geçici dosya (`scratch/innerhtml-scan.js`) tarama sonrası silindi. Gerçek kullanıcı verisi, credential, dış ağ ve gerçek video sitesi kullanılmadı.

**Çalıştırılamayan testler:**

- `npm run test:electron-bridge` (`electron tests/electron-browser-trusted-bridge.smoke.js`): Electron'u başlatmak uygulamanın tamamını (pencere, oturum, muhtemel ağ erişimli tarayıcı oturumu) ayağa kaldırır; görev kuralı 8 (ağ gerektiren browser testi yok) ve kural 7 (dış servislere istek yok) gereği çalıştırılmadı. Statik inceleme + mock tabanlı mevcut testlerle yetinildi.
- `node tests\electron-renderer-smoke.js`: Çalışan bir Electron örneğinin DevTools portuna (127.0.0.1:9333) ihtiyaç duyuyor; örnek yok → `fetch failed`. Beklenen davranış, hata değil.
- Headless Electron UI testi (gerçek pencere açılıp dar/geniş viewport denenmesi): aynı nedenle yapılmadı; responsive davranış `renderer-state-a11y-responsive.test.js`'in model tabanlı 25 viewport ölçek örneğiyle sınandı.

---

## 3. Kesin bulgular

**Yok.** KESİN etiketi için gereken altı kanıtın (konum, tetikleme yolu, deterministik yeniden üretim, somut etki, test açığı, başka kontrolün engellemediği kanıtı) tamamını sağlayan bir bulgu üretilemedi. Adayların her birinde ya mevcut bir kontrol sorunu engelliyordu (bkz. §6) ya da yeniden üretim Electron'u ağ erişimiyle başlatmayı gerektiriyordu (bkz. §5, MANUAL).

### Kesin bulgu kanıt standardı (bu denetimde uygulanan)

Bir bulgunun KESİN sayılması için altı koşulun tamamı zorunlu tutuldu:

1. **Dosya ve satır/sembol konumu** — bulgu okunabilir koda bağlanmalı.
2. **Browser kullanıcı akışı veya event tetikleme yolu** — saldırgan/kullanıcı eyleminden koda giden yol gösterilmeli.
3. **Deterministik yeniden üretim veya kontrollü test** — `node -e` payload'ı, mevcut test veya statik kanıt; "muhtemelen" yetmez.
4. **Somut kullanıcı, güvenlik, veri bütünlüğü veya kullanılabilirlik etkisi** — soyut sertleştirme önerisi kesin bulgu sayılmadı.
5. **Mevcut testlerin neden yakalayamadığı** — test açığı adlandırılmalı.
6. **Başka bir kontrolün sorunu zaten engellemediğine dair kanıt** — derinlemesine savunmanın her katmanı elenmeli.

Bu standart altında YO-1 ve YO-2, 3. ve 6. koşulları tam sağlayamadığı için (sırasıyla: injection önkoşulu var olmayan bir primitive'e bağlı; kötüye kullanım renderer'ın zaten ele geçirilmiş olmasına bağlı) KESİN değil YÜKSEK OLASILIKLI olarak sınıflandırıldı.

---

## 4. Yüksek olasılıklı bulgular

### YO-1 — CSP'de `img-src https:` ve `media-src file:` gereğinden geniş
- **Görev:** 2 (CSP)
- **Konum:** `src/renderer/index.html:5` — `img-src 'self' data: https:` ve `media-src 'self' file: blob: https://*.googlevideo.com`
- **Bulgu:** CSP herhangi bir HTTPS hostundan görsel yüklenmesine izin veriyor; `media-src file:` ise renderer'ın rastgele yerel dosya yolunu `<video>` kaynağı yapabilmesine izin veriyor (oynatıcı `pathToFileUrl` ile bunu kullanıyor — meşru ihtiyaç).
- **Tetikleme yolu:** Renderer'da herhangi bir XSS/injection primitive'i oluşursa, `img-src https:` sayesinde veri dışarı `https://` görsel isteğiyle sızdırılabilir (connect-src buna kapalı, img-src açık). Denetim anında renderer'da uzak görsel kullanımı yoktu — kural yalnızca saldırganın işine yarar.
- **Etki:** Savunma-derinliği kaybı. Tek başına istismar edilemez; bir injection önkoşulu gerekir (ve injection yüzeyi denetimde bulunamadı).
- **Test açığı:** CSP'nin kendisi için hiçbir test yok; `grep` ile doğrulandı.
- **Neden KESİN değil:** Somut sızıntı, var olmayan bir injection primitive'ine bağlı.
- **Güven düzeyi:** Yüksek (kural metni kesin; etki zinciri koşullu).

### YO-2 — `media:probe` / `media:download` / `media:downloadSubs` URL doğrulamasız
- **Görev:** 4, 11 (IPC kötüye kullanımı, URL akışı)
- **Konum:** `src/main.js:727` (`media:probe`), `src/main.js:738` (`media:download`), `src/main.js:785` (`media:downloadSubs`) — denetim anındaki satırlar
- **Bulgu:** Üç handler da yalnızca `input.url` boş mu diye bakıyor; protokol, host, uzunluk veya şema kontrolü yok. URL doğrudan Python yardımcı sürecine `--url` argümanı olarak veriliyor. Uygulamanın kendi URL politika motoru (`decideUrlPolicy`, `browser-navigation-policy.js:50`) bu kanallarda kullanılmıyor.
- **Tetikleme yolu:** Renderer'ı etkileyen herhangi bir içerik (veya gelecekteki bir renderer hatası) `window.api.probeYoutube('http://169.254.169.254/…')` / `file://…` / `rtsp://…` gibi değerlerle IPC çağırabilir. yt-dlp http dışı şemaları ve iç ağ adreslerini de deneyebilir → sınırlı SSRF / yerel ağ taraması. Argüman enjeksiyonu yok: `spawn` shell'siz, `--url` tek argüman.
- **Etki:** Ana süreç ayrıcalığıyla rastgele ağ isteği başlatma; indirme klasörüne keyfi içerik yazma (yt-dlp'nin çıktısı). Kullanıcı etkileşimiyle normal akışta yalnız kullanıcının yapıştırdığı URL gider — risk, renderer bütünlüğünün bozulduğu senaryodadır.
- **Test açığı:** `adversarial-ipc.test.js` bu kanalların şema/host reddini sınamıyor.
- **Neden KESİN değil:** Normal UI akışında kötüye kullanım yolu kapalı (kullanıcı kendi URL'sini giriyor); etki, renderer'ın zaten ele geçirilmiş olmasına bağlı.
- **Güven düzeyi:** Yüksek (handler gövdesi doğrudan okundu; doğrulama çağrısı yok).

---

## 5. Teorik ve manual doğrulama gerektiren maddeler

### T-1 (TEORİK) — `shell:openPath` uzantı beyaz listesi geniş
`src/main.js` (`ipcMain.handle('shell:openPath')` — denetim anında ~11575). Yol `canonicalLocalPath` ile sertleştiriliyor (mutlak yol, kontrol karakteri, ADS, symlink çözümü) ve dizinler serbest; ancak uzantı listesi `.json/.txt/.log/.png/.jpg/...` dahil 30+ türü kapsıyor. Renderer'dan gelen herhangi bir geçerli yol (ör. kuyruk `item.files[0]`, geçmiş kaydı) işletim sisteminin varsayılan uygulamasıyla açılabilir. Beklenen ürün davranışıyla örtüştüğü ve yol her zaman uygulamanın kendi ürettiği/izin verdiği dosyalardan geldiği için teorik.

### T-2 (TEORİK) — `whisper-pdf` protokolü `Access-Control-Allow-Origin: *` ve `CORP: cross-origin`
`src/main.js:4495-4554` (denetim anı). Protokol yalnızca 64-hex `resourceId` + `pdfFileAccess` grant'i olan belgeleri sunuyor ve renderer `fetch` ile kullanıyor (CSP `connect-src whisper-pdf:`). Ancak şema `standard/secure/corsEnabled` olarak kayıtlı ve yanıtlar `Access-Control-Allow-Origin: *` taşıyor: aynı renderer'da çalışan herhangi bir içerik, resourceId'yi bilirse PDF'i okuyabilir. resourceId 256-bit rastgele ve yalnızca açılan belge için üretiliyor → pratik risk düşük; yine de `*` yerine şema-kısıtlı okuma daha sıkı olur.

### T-3 (TEORİK) — Tarayıcı sekmesi ayrımı (partition) kalıcı ve paylaşımlı
`src/main.js` (`BROWSER_PARTITION` — WebContentsView oluşturma, denetim anında ~8160). Tek, kalıcı bir oturum: tüm sekmeler aynı çerez/depolama havuzunda. Bu bir tarayıcı için normal; ancak "oturumu sıfırla" dışında site bazlı izolasyon yok. `browser-session-privacy` testleri site-bazlı temizliğin origin ile sınırlı olduğunu doğruluyor. Güvenlik sınırı beklentisi "site başına ayrım" ise bu tasarım kararı dokümante edilmeli; bug değil.

### M-1 (MANUAL DOĞRULAMA GEREKLİ) — DevTools yalnızca `--dev` bayrağıyla; uzaktan hata ayıklama anahtarı engeli görülmedi
`src/main.js` (`process.argv.includes('--dev')` → detached DevTools). Paketlenmiş dağıtımda bu bayrağın son kullanıcıya ulaşıp ulaşmadığı (kısayol/launcher üzerinden enjekte edilebilirliği) ve `--remote-debugging-port` gibi Chromium anahtarlarının engellenip engellenmediği yalnızca paketlenmiş kurulumda doğrulanabilir. Kaynak kodda `--remote-debugging-port` engeli görülmedi; Electron varsayılan olarak bu anahtarı kabul eder. **Doğrulama önerisi:** paketlenmiş uygulamayı `--remote-debugging-port=9222` ile başlatıp portun kapalı olduğunu sınamak.

### M-2 (MANUAL DOĞRULAMA GEREKLİ) — Gerçek pencerede responsive/DPI davranışı
`minWidth: 940, minHeight: 680` ve model testleri (25 viewport ölçeği, `renderer-state-a11y-responsive.test.js`) taşma olmadığını gösteriyor; ancak Windows %125/%150 font ölçekleme + `titleBarOverlay` (36 px) + dar pencerede oynatıcı kontrollerinin gerçek piksel düzeni yalnızca çalışan uygulamada doğrulanabilir. Bu oturumda Electron başlatılmadı (kural 8).

---

## 6. False positive kayıtları

| # | Aday bulgu | Neden elendi |
|---|---|---|
| FP-1 | `innerHTML` ile XSS (kuyruk, log, önizleme, modal, geçmiş) | ~40 kullanım tek tek incelendi: tüm dinamik değerler `escapeHtml` (`renderer.js`) üzerinden; statik taramada escape'siz 3 interpolasyon çıktı — `icon` (sabit SVG literal), `ts` (`HH:MM:SS` padStart'lı), `start/end` (`formatTime` sayı biçimi). `renderGlossary`, `renderHistory`, `renderCueList`, `renderBrowserTabs`, `renderBrowserPlaces`, `renderAiText` gibi büyük yüzeyler `textContent`/`createElement` kullanıyor. |
| FP-2 | Renderer'dan keyfi IPC kanalı çağırma | Preload (`src/preload.js`) yalnız sabit kanal adlarıyla `invoke/send` sarıyor; kanal adı parametre olarak geçmiyor. Main tarafında tüm handler'lar `authorizedBrowserSender` (`event.sender === mainWindow.webContents && event.senderFrame === mainFrame`) ile korunuyor. `preload-sandbox.test.js` ve `adversarial-ipc.test.js` bunu sınıyor. |
| FP-3 | Geç/out-of-order event'in yeni işi bozması | Çift kapı: `queueItemId` eşleşmesi + `jobId` (`eventMatchesActiveJob`, `queue-lifecycle.js:67`) + `shouldAcceptRunEvent` (`renderer-ui-model.js:129`: terminal sonrası canlı olayları reddeder). `queue-lifecycle.test.js`'te mutasyon testi dahil 15 test geçiyor. |
| FP-4 | Ayar yarışında eski değerin yeniyi ezmesi | `_applyingSettings` bayrağı yükleme sırasında `scheduleSave`'i kesiyor; main tarafında `sanitizeSettings` enum/aralık/uçbirim doğruluyor (sentetik payload'ların tamamı reddedildi); `settings-persistence.test.js` + `settings-security.test.js` (17 test) geçiyor. |

---

## 7. Görev durum tablosu (1–20)

| # | Görev | İnceleme | Test | Bulgular | Kalan belirsizlik |
|---|---|---|---|---|---|
| 1 | BrowserWindow güvenlik ayarları | Tam | Statik + popup-auth testleri | Yok — ana pencere ve WebContentsView: `sandbox:true, contextIsolation:true, nodeIntegration:false, webSecurity:true`; popup'lar `securePopupWebPreferences` | `--remote-debugging-port` paket davranışı (M-1) |
| 2 | CSP | Tam | Statik + payload analizi | YO-1 | — |
| 3 | Preload API yüzeyi | Tam | preload-sandbox.test.js | Yok — ~150 metod, kanal adları sabit, geniş ama her biri main'de yetkili | — |
| 4 | IPC kötüye kullanımı | Tam | adversarial-ipc + sentetik payload | YO-2 (media:* URL) | — |
| 5 | DOM enjeksiyonu/XSS | Tam | Statik tarama + escape denetimi | Yok (FP-1) | — |
| 6 | Renderer state yönetimi | Tam | queue-lifecycle, renderer-state testleri | Yok — kuyruk opts dondurma, generation kapıları yerinde | — |
| 7 | Event listener yaşam döngüsü | Tam | Statik | Yok — `onEvent/onBrowserEvent` tek kayıt, `onWatchFiles` unsubscribe döndürüyor; liste yeniden-render'ları `replaceChildren`/`innerHTML=''` ile eski listener'ları atıyor | — |
| 8 | IPC event sıralaması | Tam | queue-lifecycle (mutasyon dahil) | Yok (FP-3) | — |
| 9 | Cancel/stop | Tam | pipeline-cancel (8 test) | Yok — `cancelled` bayrağı + `event.cancelled` + `cancelTooLate` + idempotent cancel | — |
| 10 | Dosya seçme / drag-drop | Tam | Statik | Yok — `webUtils.getPathForFile`, boş drop'ta URI-list fallback, belge genelinde navigate engeli; PDF drop `pdf:open`'da imza+boyut doğrulamalı | — |
| 11 | URL/YouTube girdisi | Tam | decideUrlPolicy payload testi | YO-2 | — |
| 12 | Navigation/popup | Tam | navigation-abort, settings-navigation-guard, popup-auth (11 test) | Yok — `will-navigate` preventDefault (ana pencere), guard (sekmeler), `setWindowOpenHandler` her yüzeyde | — |
| 13 | Clipboard | Tam | Statik | Yok — yalnız `clipboard:write` (string şartı, sender kontrolü); pano okuma yok; kopyalanan metin SRT/düz metin olarak üretiliyor, HTML yorumlanmıyor | — |
| 14 | Ayar kontrolleri tip/sınır | Tam | sanitizeSettings payload testi | Yok — range kontroller min/max'li; main'de UI_NUMERIC_RANGES/UI_ENUMS | — |
| 15 | Ayar yükleme/kaydetme tutarlılığı | Tam | settings-persistence + settings-security (17 test) | Yok (FP-4) | — |
| 16 | Responsive | Model düzeyinde | renderer-state-a11y-responsive (25 viewport) | Yok | M-2 (gerçek pencere/DPI) |
| 17 | Erişilebilirlik | Tam | Aynı test paketi (odak, roving tabindex, WCAG AA kontrast) | Yok — `role=status/log/progressbar`, `aria-live`, modal odak hapsetme, inert arka plan mevcut | Ekran okuyucuyla canlı doğrulama yapılmadı |
| 18 | Performans | Tam | Statik + model testleri | Yok — log 500 satırda budanıyor, önizleme `PREVIEW_DOM_CAP`, cue listesi 500'lük sayfalama, `resourceIpcTimestamps` 1200 ile sınırlı, session kayıt debounce | Uzun süreli gerçek kullanımda bellek (soak testi ayrı script; çalıştırılmadı) |
| 19 | Hata/kurtarma | Tam | browser-capture-recovery, navigation-abort, sertifika reddi testleri | Yok — `unhandledrejection` günlüğe düşüyor; sertifika hatası kesin red + Türkçe yüzey; tab çökmesi `tab-crashed` yüzeyi; sessiz başarı yok (`saveAppSettings` hatası log + sinyal) | — |
| 20 | Test kapsamı | Tam | Tüm paket çalıştırıldı | Bkz. §9 boşluklar | — |

---

## 8. Uygulama planı (uygulanmadı — yalnızca öneri)

### P1-1 — `media:*` kanallarına URL politikası uygula (YO-2)
- **Kök neden:** `media:probe/download/downloadSubs` handler'ları `decideUrlPolicy`'den geçmiyor.
- **Önerilen çözüm:** Üç handler'da URL'yi `decideUrlPolicy(url, 'renderer-external')` benzeri bir kuralla doğrula; yalnız `http:`/`https:` kabul et, kimlik bilgili/kontrol karakterli/8 KB+ URL'leri reddet. yt-dlp'nin desteklediği şema kümesi http/https ile sınırlıysa bu yeterli.
- **Etkilenecek dosyalar:** `src/main.js` (3 handler), muhtemelen `src/browser-navigation-policy.js` (yeni yüzey kuralı).
- **Browser güvenlik etkisi:** Renderer ele geçirilse bile ana süreçten rastgele şema/iç ağ isteği başlatılamaz.
- **Geriye dönük uyumluluk riski:** Düşük — meşru YouTube/medya URL'leri http/https. yt-dlp'nin kabul ettiği egzotik şemaları kullanan varsa kırılır (bilinçli kısıt).
- **Gerekli testler:** `adversarial-ipc.test.js`'e `http://169.254.x`, `file://`, `rtsp://`, user:pass@, 16 KB URL ret senaryoları.
- **Rollback:** Tek satırlık politika çağrısı; geri alınması kolay.

### P1-2 — CSP'de `img-src https:` kaldır (YO-1)
- **Kök neden:** Geçmişte uzak görsel ihtiyacı için açılmış; denetim anında renderer uzak görsel kullanmıyordu.
- **Önerilen çözüm:** `img-src 'self' data:` yap. `media-src file:` oynatıcı için gerekli — koru; `blob:` ve googlevideo kapsamını olduğu gibi bırak.
- **Etkilenecek dosyalar:** `src/renderer/index.html` (tek meta etiketi).
- **Browser güvenlik etkisi:** Injection senaryosunda görsel kanalıyla veri sızıntısı kapanır.
- **Geriye dönük uyumluluk riski:** Gelecekte favicon/uzak kapak görseli gösterilmek istenirse yeniden açmak gerekir (denetim anında favicon DOM'a basılmıyordu).
- **Gerekli testler:** CSP meta'sını ayrıştırıp yasaklı kaynakları doğrulayan küçük bir statik test (yeni dosya — bu denetimde yazılmadı).
- **Rollback:** Tek satır.

### P2-1 — `whisper-pdf` yanıtlarında CORS'u daralt (T-2)
- **Çözüm:** `Access-Control-Allow-Origin: *` yerine başlığı kaldır veya `whisper-pdf:` origin'le sınırla; `CORP: cross-origin` → `same-origin` değerlendir (renderer aynı şemadan fetch ediyor).
- **Dosyalar:** `src/main.js` (`pdfProtocolHeaders`).
- **Risk:** PDF.js worker'ının fetch davranışı farklı origin sayarsa okuma kırılır — Electron smoke testiyle doğrulanmalı.
- **Test:** `electron-renderer-smoke.js` PDF fixture'ı zaten bu yolu kullanıyor; onu CI'da çalıştırmak yeterli.

### P2-2 — Paketlenmiş uygulamada hata ayıklama yüzeylerini kilitle (M-1)
- **Çözüm:** `app.isPackaged` iken `--dev` bayrağını yok say ve/veya `remote-debugging-port` anahtarını `app.commandLine` incelemesiyle reddet; `webContents.on('devtools-opened')` ile paketli sürümde kapat.
- **Dosyalar:** `src/main.js`.
- **Risk:** Yok (geliştirme akışı `isPackaged === false`).
- **Test:** Paketli binary'yi `--remote-debugging-port=9222` ile başlatıp portun kapalı olduğunu sınamak (manuel).

### P2-3 — `shell:openPath` uzantı listesini gözden geçir (T-1)
- **Çözüm:** Çıktı türleriyle sınırla (srt/vtt/ass/ssa/json/txt/log + video/ses) veya medya uzantılarını `showInFolder`'a yönlendir; `.png/.jpg` gibi görsel türlerin hangi akıştan geldiğini doğrula (burn-in önizleme?).
- **Dosyalar:** `src/main.js` (`shell:openPath` handler'ı).
- **Risk:** Düşük; hangi akışların hangi uzantıyı açtığı önce envanter çıkarılmalı.
- **Test:** Uzantı reddi için IPC testi.

---

## 9. Test boşlukları (yeni test yazılmadı — yalnızca envanter)

1. **CSP statik testi yok:** `index.html`'deki meta CSP'yi ayrıştırıp `script-src`'te `'unsafe-inline'`/`http:` olmadığını, `img-src`'te `https:` olmadığını doğrulayan bir Node testi eksik.
2. **`media:*` URL reddi testi yok:** `adversarial-ipc.test.js` şema/host saldırılarını `media:probe/download` üzerinde sınamıyor.
3. **Gerçek Electron renderer testi CI'a bağlı değil:** `electron-renderer-smoke.js` ve `electron-browser-trusted-bridge.smoke.js` çalışan örnek + CDP portu gerektiriyor; `npm test` bunları koşmuyor. Headless (Windows'ta `show:false` + `userData` izolasyonu) bir duman testi kancası eksik.
4. **Erişilebilirlik testleri model düzeyinde:** `renderer-state-a11y-responsive.test.js` DOM'suz model testi; gerçek DOM'da tab sırası, modal odak hapsetme ve `aria-live` duyuruları için jsdom/Playwright-Electron tabanlı test yok.
5. **Performans/soak otomatik değil:** `run-resource-soak.js` ayrı script; uzun oturumda DOM/listener sızıntısını ölçen otomatik eşik testi `npm test`'e dahil değil.
6. **Pano akışı testi yok:** `clipboard:write`'ın string-olmayan girdiyi reddi ve kopyalanan SRT'nin HTML olarak yorumlanmadığı doğrulanmıyor.
7. **Drag-drop akışı testi yok:** `handleDropPayload`'ın boş drop, yalnız-PDF drop, çoklu drop ve URI-list fallback'i mock DataTransfer ile sınanmıyor.
8. **`whisper-pdf` protokol testi yok:** Range istekleri, geçersiz resourceId, grant'siz erişim reddi yalnızca manuel gözle doğrulandı.

---

## 10. Son değişiklik doğrulaması

**Denetim oturumu başında (denetçi eylemleri öncesi):**

```
git status --short   → yalnızca önceki oturumlardan kalma izlenmemiş rapor dosyaları (?? BROWSER-*.md, ?? Rapor-2026-09-11.md, ?? scratch/)
git diff --check     → (çıktı yok)
git diff --stat      → (çıktı yok — izlenen dosyalarda değişiklik yok)
```

**Denetim oturumu sonunda (bu rapor yazılırken):**

```
git status --short   → 62 adet " M" (modified) dosya: src/*.js (30), src/renderer/renderer.js, src/renderer/styles.css, tests/*.test.js (30)
                        + izlenmemiş: önceki raporlar, bu rapor, ?? tests/browser-media-selection.test.js, ?? tests/browser-textutil.test.js, ?? tests/renderer-log-trim.test.js, ?? GUVENLIK-KALITE-DENETIM-RAPORU-2026-09-12.md, ?? BROWSER-ARAYUZ-DERIN-DENETIM-20260912.md, ?? Rapor-2026-09-11-Tur4.md
git diff --check     → (çıktı yok — whitespace hatası yok)
git diff --stat      → 62 files changed, 1183 insertions(+), 268 deletions(-)
git log -1           → 5b000ca fix: close browser report 22 regressions
```

**Açık doğrulama:**

1. **Denetçi oturumu ana kodda hiçbir değişiklik yapmadı.** Oturum başında `git diff` boştu; denetçi yalnızca okuma, test çalıştırma ve bellek-içi payload değerlendirmesi yaptı; oluşturduğu tek geçici dosyayı (`scratch/innerhtml-scan.js`) sildi; bu rapor dosyasını (izlenmemiş) yazdı.
2. **Çalışma ağacında şu an denetçiye ait OLMAYAN değişiklikler var.** 62 değiştirilmiş dosya (+1183/−268) ve yeni test dosyaları, denetim sürerken paralel bir oturumun düzeltme turunda ortaya çıktı. Kural gereği bunların üzerine yazılmadı, temizlenmedi, geri alınmadı ve gizlenmedi — olduğu gibi raporlanıyor.
3. **Raporun geçerlilik sınırı:** §3–§7'deki satır numaraları ve bulgular denetim anındaki koda aittir. Değişiklik sonrası yeniden doğrulanan noktalar: CSP metni (`img-src https:` hâlâ mevcut — YO-1 açık), webPreferences güvenlik bayrakları (değişmedi), `decideUrlPolicy` payload reddi (değişmedi), `sanitizeSettings` payload reddi (değişmedi), `media:probe/download` handler gövdelerinde URL doğrulaması (hâlâ yok — YO-2 açık). Değişen dosyalar arasında `browser-navigation-policy.js`, `browser-overlay-controller.js`, `local-file-access.js`, `main.js` ve `renderer.js` de olduğundan, bu raporun kapsadığı diğer yüzeylerin **güncel ağaçta yeniden denetlenmesi** önerilir.

## GÜNCEL BULGU DURUMU — 2026-09-12

### Bulgu yanıt tablosu

| ID | Durum | Ayrıntılı düzeltme / ret gerekçesi |
|---|---|---|
| YO-1 | DÜZELTİLDİ | Kullanılmayan `img-src https:` kaldırıldı; `media-src file:` yerel oynatıcı ihtiyacı nedeniyle korunuyor. |
| YO-2 | DÜZELTİLDİ | `media:probe/download/downloadSubs` ve `transcribe:start --youtube` yalnız http/https + host URL politika sonucunu kabul ediyor. |
| T-1 | TASARIM/RET | `shell:openPath` canonical path ve desteklenen uzantı whitelist'i uygular. Kullanıcının ürettiği belge/medyayı OS varsayılanıyla açmak ürün özelliğidir; ayrıcalık yükseltme yok. |
| T-2 | DÜZELTİLDİ | `whisper-pdf` yalnız `Origin: null`/file renderer bağlamını, 64-hex resourceId ve grant'i kabul ediyor; diğer istek 403. |
| T-3 | TASARIM/RET | Ortak kalıcı partition tarayıcı login/oturum paylaşımıdır; site temizliği origin ile sınırlı. |
| M-1 | DÜZELTİLDİ + MANUAL PAKET | Paketlenmiş açılış remote-debugging port/address/pipe switch'lerini kaldırıyor. Gerçek EXE port smoke'u bu oturumda yapılmadı. |
| M-2 | MANUAL | Gerçek DPI/titlebar/oynatıcı piksel yerleşimi GUI gerektirir. |
| FP-1…4 | FALSE/RET | DOM kaçışı, sabit preload kanalları, stale event kapıları ve ayar kayıt korumaları güncel kaynak/testte doğrulandı. |

### Ayrıntılı doğrulama dökümü

`adversarial-ipc`: 11 test ve 156 handler × 3 yetkisiz gönderici; preload sandbox ve URL/CSP/PDF regresyonları geçti. `npm test` çıkış 0. Tam çapraz döküm: `AUDIT-KAPANIS-MATRISI-2026-09-12.md`.
