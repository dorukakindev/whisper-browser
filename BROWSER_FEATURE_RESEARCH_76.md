# BROWSER FEATURE RESEARCH 76 — Tarayıcı Tarafı GitHub Repo Envanteri

**Tarih:** 2026-09-19 · **Tür:** Araştırma (kod değişikliği YOK) · **Kapsam:** Tarayıcının kendisi — sekme/medya/gizlilik/okuma/platform özellikleri (R75'teki SmartTube/YouTube araştırmasından ayrı; o rapor duruyor)

15+ repo ve platform API'si kaynak düzeyinde incelendi. **Önemli bağlam:** Browser tarafı zaten çok olgun — ~90 `browser-*` modülü mevcut (adblock + cosmetic executor, reader modu, page-translate, CEA/DASH ağ yakalama, canlı-ASR, mini-player, komut paleti, link-hints, sekme grupları, izinler, site profilleri, OpenSubtitles, DRM host sınıflandırması, savePage MHTML, full-page screenshot `captureBeyondViewport`, context menu, reopen-closed-tab, session package, manga modu, workflow-recorder, page-index). `package.json` **castlabs ECS `v43.2.0+wvcus`** kullanıyor → Widevine zaten entegre.

Bu rapor yalnız **doğrulanmış gerçek boşlukları** listeler; var olan özellik tekrar önerilmez.

---

## 1. Yerel medya/player tarafına repo-desenli özellikler

### 1.1 Trickplay — yerel videoda seekbar önizlemesi (Jellyfin deseni)
- **Repo:** `jellyfin/jellyfin` → `Jellyfin.Server.Implementations/Trickplay/TrickplayManager.cs` + PR #9554 + issue #11336
- **Desen:** ffmpeg ile aralıklı kare çıkarımı → karo (tile) sprite + manifest `{width,height,tileCount,interval}`; scrub'da karo kırpma
- **Hızlandırma:** `-skip_frame nokey` ile yalnız keyframe çıkarımı ~**110× hızlı** (244 vs 2.2 fps; `-vsync passthrough` şart). Keyframe aralığı istenen interval'den seyrekse en yakın zamana hizala/çoğalt.
- **Bizde durum:** YOK — yerel videoda `seekTip` yalnız metin. ffmpeg zaten bundle'da; sprite üretimi metadata klasörüne cache'lenebilir.
- **Entegrasyon:** `src/` yeni `trickplay.js` (ffmpeg spawn, tile manifest); `renderSeekMarkers`/seekTip'e `background-position` hesabı. NewPipe boyut kuralı uygulanabilir.
- **Karar:** **Adapt — yüksek görünürlük, orta maliyet.** (YouTube storyboard'u R75'te ayrı madde; bu yerel dosyalar içindir.)

### 1.2 İntro/jenerik algılama (intro-skipper deseni)
- **Repo:** `intro-skipper/intro-skipper` (GPL-3.0 — desen adaptasyonu)
- **4 yöntem:** (a) bölüm-adı regex ("Opening", "Intro", "Credits"), (b) chromaprint ses parmak izi (jellyfin-ffmpeg gerektirir — bizim ffmpeg'de yok), (c) siyah-kare algılama (CPU yoğun), (d) sessizlik algılama
- **Bizde durum:** Chapter algılama var (`browser-chapters`, yerel chapter'lar); sessizlik için VAD altyapımız hazır (`snap_entries_to_speech` `threshold=0.35`).
- **Uygulanabilir parça:** Bölüm-adı regex + sessizlik + opsiyonel blackframe → "İntroyu atla" düğmesi (SponsorBlock `intro` kategorisi zaten modelimizde var). Chromaprint'i atla — özel ffmpeg build gerekir.
- **Karar:** **Adapt (kısmi) — bölüm+sessizlik yöntemleri düşük maliyet.**

### 1.3 OpenSubtitles moviehash araması
- **Durum:** `browser-subtitle-search.js` `api.opensubtitles.com` REST kullanıyor ama **moviehash yok** — yalnız metin/imdb araması. OpenSubtitles `moviehash+moviebytesize` eşleşmesi dosya-adı bağımsız kesin sonuç verir (VLC "altyazı indir" mantığı).
- **Ek sağlayıcılar:** `subliminal` (Python, MIT) — addic7ed, podnapisi, tvsubtitles, gestdown, napiprojekt; backend'den subprocess çağrısıyla çok-sağlayıcılı arama. Skorlama (`guessit` + release-group eşleşmesi) hazır desen.
- **Karar:** **Adopt (hash) + Adapt (subliminal subprocess) — altyazı kapsama alanını genişletir.**

---

## 2. Sekme/oturum modeli

### 2.1 Gizli (incognito) sekmeler
- **Desen:** `partition` olmadan veya in-memory `partition: 'incognito'` WebContentsView — kalıcı cookie/storage yok. Tek sınır: `loadExtension` in-memory'de çalışmaz (zaten yok).
- **Bizde durum:** Tek `BROWSER_PARTITION='persist:whisper-browser'`; `browser-session-privacy` politikaları var ama in-memory sekme yok.
- **Karar:** **Adopt — düşük maliyet** (tab oluştururken partition seçimi + UI rozeti; session-store gizli sekmeyi dışlar).

### 2.2 Konteyner sekmeler (Firefox Multi-Account Containers deseni)
- **Desen:** `persist:container-<name>` partition'ları → site başına ayrı cookie jar (iş/kişisel hesaplar aynı anda).
- **Karar:** **Adapt — orta maliyet;** site-profiles altyapısına `container` alanı eklenir. Tab rengi/rozeti.

### 2.3 Site/partition başına proxy
- **Desen:** `ses.setProxy({proxyRules})` partition özelinde → "proxy'li konteyner" profili. FreeTube'un Tor seçeneğiyle aynı yaklaşım.
- **Karar:** **Adapt — orta;** konteyner özelliğiyle birleşik.

### 2.4 Sekme önizleme kartı
- **Desen:** `wc.capturePage()` (zaten kullanılıyor) → sekme hover'ında küçük görüntü kartı (Edge/Arc kalıbı). Askıya alınmış sekmede son kare gösterilir.
- **Karar:** **Adopt — küçük, cilâlı.**

### 2.5 Sekme menüsü eksikleri
- **Durum:** reopen-closed (`Shift+T`) var; **duplicate-tab, close-others/close-right, copy-URL** bağlam menüsü öğeleri doğrulanamadı.
- **Karar:** **Adopt — ucuz tamamlama.**

### 2.6 Sekmeyi başka pencerede aç / SSB (site-specific browser)
- **Desen:** Site için standalone `BrowserWindow` (kendi ikonu/taskbar girdisi) — Chrome "kısayol oluştur"/Ice kalıbı. YouTube/Netflix için uygulama hissi.
- **Karar:** **Adapt — orta.**

---

## 3. Gizlilik/içerik filtreleme

### 3.1 ClearURLs izleme-parametresi temizliği
- **Repo:** `ClearURLs/Addon` + `ClearURLs/Rules` (LGPL-3.0). `data.minify.json` provider tabanlı: `urlPattern, rules[], rawRules[], exceptions[], redirections[]`.
- **Özellikler:** navigasyonda parametre temizliği, "temiz linki kopyala" bağlam öğesi, yönlendirme-ortağı atlatma (`url=...` çözümleme), **hyperlink-auditing (`ping`) engelleme**, ETag/history-API izleme karşıtları.
- **Lisans notu:** Katalog çalışma zamanında `rules2.clearurls.xyz`'den çekilebilir (kopyalama yok) veya kendi kısa param listemiz yazılır; LGPL veri kullanımı değerlendirilmeli.
- **Entegrasyon:** `browser-navigation-policy` will-navigate hook'unda URL sanitize + context menu "temiz linki kopyala".
- **Karar:** **Adapt — orta; gizlilik değeri yüksek.**

### 3.2 Çerez onayı otomatik-ret (Consent-O-Matic)
- **Repo:** `cavi-au/Consent-O-Matic` — lisans "NOASSERTION" (Aarhus Üniversitesi, özel; **kod/veri kopyalamadan önce doğrula**). 200+ CMP kuralı JSON'da: detector + action zinciri (hide→click sequence).
- **Desen:** Sayfa yüklendiğinde CMP dedektörü çalıştır → gizlilik-koruyucu seçimleri uygula. Kurallar ayrı güncelleniyor (remote rule list).
- **Entegrasyon:** isolated-world executor'ımız + cosmetic-executor altyapısı hazır; kural motoru yazılıp uzak kural listesi fetch edilir.
- **Karar:** **Adapt — orta; lisans doğrulaması şart.**

### 3.3 Kozmetik kural seçici (element picker)
- **Desen:** uBlock `element-picker` — element hover → CSS selector üret → kurala ekle. `browser-cosmetic-executor` çalıştırıcısı hazır; eksik **üretici UI**.
- **Karar:** **Adopt — mevcut altyapıyla küçük tamamlama.**

### 3.4 Site başına JS/resim/large-media kapatma ("lite mode")
- **Desen:** JS kapatma → CDP `Emulation.setScriptExecutionDisabled` (debugger'ımız zaten attach ediyor); resim/video bloklama → `webRequest` `resourceType` filtresi site-profiliyle.
- **Karar:** **Adopt — düşük maliyet;** `browser-site-profiles` alanlarına `blockJs/blockImages/blockMedia` eklenir.

### 3.5 Üçüncü-parti çerez/referer kısıtlama + ETag koruması
- **Desen:** `onBeforeSendHeaders` ile 3p isteklerde Cookie/Referer kırpma; `onHeadersReceived` ile ETag'ı If-None-Match'e çevirme (ClearURLs'nin ETag hilesi).
- **Karar:** **Adapt — küçük ama kırılgan; kapsamlı test ister.**

### 3.6 De-AMP + yönlendirme çözümleme
- **Desen:** AMP sayfası → `<link rel=canonical>` hedefine git; `google.com/url?q=` tipi ara URL'lerde gerçek hedefi çıkar.
- **Karar:** **Adopt — küçük.**

---

## 4. Medya/oynatma platformu

### 4.1 DLNA/Chromecast'e gönder (cast)
- **Repolar:** `thibauts/upnp-mediarenderer-client` (load/play/pause/seek; DIDL-Lite ile **dış altyazı** `subtitlesUrl`), `@edenware/dlnacasts` (SSDP keşif + seek/dlnaFeatures), `GPMDP/electron-chromecast` (chrome.cast API inject — bakımsız).
- **Bizde durum:** YOK — local dosya + yazdığımız altyazıyla TV'ye gönderme tam uygun (DLNA `subtitlesUrl` başlık gereksinimi gist notunda; yerel HTTP mini-sunucu gerekir).
- **Karar:** **Adapt — orta/ağır;** `@edenware/dlnacasts` + local static serve + altyazı URL'si. Chromecast tarafı bakımsız; DLNA'dan başlanır.

### 4.2 Dış oynatıcıya ver (mpv/VLC handoff)
- **Desen:** FreeTube "Watch in external player" — kokan/stream URL'yi `spawn('mpv', [url])`. Kokan URL'lerimiz zaten sniff ediliyor (network-capture).
- **Karar:** **Adopt — çok küçük,** context menu + ayar (oynatıcı yolu).

### 4.3 Otomatik PiP (sekme değişince)
- **Durum:** `browser-mini-player` var; eksik **otomatik tetik** — video oynarken başka sekmeye geçince mini-player öner/aç. Chrome'un auto-PiP davranışı.
- **Not:** `documentPictureInPicture` API'si Electron'da bozuk (issue #39633 — istek başarılı ama pencere açılmıyor); kendi mini-player'ımız doğru yol.
- **Karar:** **Adopt — küçük.**

### 4.4 Video filtreleri + ses yükseltme (site videosunda)
- **Desen:** Enjekte script: `video.style.filter = brightness/contrast/saturate` (CSS filtreleri) + `AudioContext` gain ile %100 üstü ses (video element MediaStreamSource sarması).
- **Karar:** **Adapt — orta;** site videosuna dokunan enjeksiyon, adapter kalıbı mevcut.

### 4.5 Sinema/odak modu (video dışı karartma)
- **Desen:** Tek video elementi dışında sayfayı `opacity/filter` karartan enjeksiyon; kaçış için ESC.
- **Karar:** **Adopt — küçük.**

### 4.6 Uyku zamanlayıcısı
- **Desen:** N dk sonra `browserCommand pause` + isteğe bağlı `powerMonitor` idle'a bağlama.
- **Karar:** **Adopt — küçük.**

### 4.7 Sekme sesini dosyaya kaydet (podcast/stream capture)
- **Desen:** `browser-live-audio` zaten PCM16 üretiyor → WAV'e dökme (`pcm16Wav` hazır!). "Sekme sesini kaydet" toggle'ı.
- **Karar:** **Adopt — altyapı hazır, küçük.**

---

## 5. Girdi/erişilebilirlik

### 5.1 Uzamsal navigasyon (TV kumandası ok tuşları)
- **Repo:** `WICG/spatial-navigation` → `spatial-navigation-polyfill` (npm). Yön tuşu = en yakın odaklanabilir öğe; `keyMode: 'ARROW'`.
- **Bizde durum:** link-hints (vim-style harf etiketleri) + SmartTube roving grid var; **genel sayfa spatial nav yok.**
- **Karar:** **Adapt — orta;** kendi enjeksiyonumuz (polyfill'i sayfaya değil overlay mantığına uyarlamak daha güvenli). Gamepad API ile kumanda desteği eşlenebilir.

### 5.2 Whisper ile sesli giriş/dikte
- **Desen:** Adres çubuğu/arama alanında bas-konuş → mikrofon → **kendi faster-whisper backend'imiz** → metni alana yaz. Tarayıcıda `webkitSpeechRecognition` Google anahtarı ister — bizde hazır lokal motor var.
- **Genişletme:** Sesli komut ("duraklat", "sonraki sekme") — küçük grammar.
- **Karar:** **Adapt — benzersiz fit;** canlı-ASR boru hattı (`live-asr-worklet` + `pcm16Wav` + backend) yeniden kullanılır.

### 5.3 TTS okuma (reader/seçim seslendirme)
- **Desen:** `speechSynthesis` ücretsiz; reader içeriği veya seçili metni okut; hız kontrolü.
- **Karar:** **Adopt — küçük.**

---

## 6. Sayfa araçları

### 6.1 PDF'e yazdır (`wc.printToPDF`)
- **Durum:** savePage MHTML var; **PDF yok.** `printToPDF({printBackground, pageSize})` → kaydet diyalogu.
- **Karar:** **Adopt — çok küçük.**

### 6.2 QR ile telefona geçir
- **Desen:** `qrcode` npm → mevcut URL'yi QR olarak göster; telefon kamerasıyla handoff.
- **Karar:** **Adopt — çok küçük.**

### 6.3 Markdown olarak kopyala
- **Desen:** `turndown` (MIT) — seçim/sayfa → clipboard'a markdown; AI chat bağlamına besleme.
- **Karar:** **Adopt — küçük.**

### 6.4 Çevrimdışı okuma listesi
- **Desen:** Mevcut `savePage MHTML` + `browser-page-index` birleşimi → "sonra oku" listesi; çevrimdışı açılabilir arşiv.
- **Karar:** **Adopt — mevcut parçaların birleşimi.**

### 6.5 Mobil görünüm / cihaz emülasyonu
- **Desen:** CDP `Emulation.setDeviceMetricsOverride` + `setUserAgentOverride` → mobil site görünümü toggle'ı (bazı sitelerde daha hafif arayüz).
- **Karar:** **Adopt — küçük.**

### 6.6 Adres çubuğu anahtar-kelime aramaları (DDG bangs)
- **Desen:** `!yt sorgu` → YouTube araması; Min'in bangs + custom engine kalıbı. Mevcut suggestion altyapısına kural tablosu.
- **Karar:** **Adopt — küçük.**

---

## 7. Uzantı/genişletme

### 7.1 Userscript yöneticisi (Min deseni)
- **Repo:** `minbrowser/min` — userscript klasörü + `==UserScript==` başlık parser (`@match`, `@exclude`, `@run-at context-menu`, `!run` arama tetikleyici). Topluluk script koleksiyonu (`Sestowner/min-userscripts`) ve dark-mode userscript örneği var.
- **Bizde durum:** `executeJavaScriptInIsolatedWorld` + güvenli enjeksiyon altyapısı hazır; eksik: başlık parser + etkinleştirme UI + per-script depolama.
- **Karar:** **Adopt — orta;** Chrome-uzantısından çok daha sürdürülebilir (Min'in de vardığı sonuç).

### 7.2 Chrome uzantıları (`session.extensions.loadExtension`)
- **Durum:** Electron **yalnız unpacked** uzantıları, MV3 `host_permissions` + `content_scripts` dahil kısmi API setiyle destekliyor; `.crx` yok, her açılışta `loadExtension` gerekir, in-memory session'da çalışmaz. `chrome.scripting` desteği son PR'larla eklendi. `electron-chrome-extensions` kütüphanesi tabs/popups/action yüzeyini tamamlar (min Electron 35).
- **Gerçekçilik:** Tam uyumluluk Electron'un "non-goal"u; uBlock Lite/Dark Reader gibi MV3 uzantıları kısmen çalışabilir ama garanti yok.
- **Karar:** **Stratejik deneme — önce userscript yöneticisi;** uzantı desteği ayrı spike.

### 7.3 Yerel şifre kasası (Min Keychain deseni)
- **Repo:** Min `passwordManager` — `credentialStore` IPC + built-in keychain + CSV import/export (papaparse).
- **Karar:** **Adapt — orta + güvenlik duyarlı;** `safeStorage` zaten import'ta. Düşük öncelik.

---

## 8. Platform/dağıtım

### 8.1 Otomatik güncelleme (`electron-updater`)
- **Durum:** **package.json'da updater yok** — GitHub releases feed'iyle `electron-updater` (`publish: github` yapılandırması zaten repo'ya işaret edebilir).
- **Karar:** **Adopt — dağıtım kalitesi için önemli;** imzalama gereksinimi Windows'ta SmartScreen'i etkiler (imzasız pakette auto-update yine çalışır ama uyarı çıkar).

### 8.2 Widevine — **ZATEN VAR**
- `package.json` `castlabs/electron-releases#v43.2.0+wvcus` — ECS fork drop-in. Üretim akışı için EVS production VMP imzalaması gerekir (ücretsiz kayıt; `castlabs-evs` pip CLI, electron-builder afterSign hook). `browser-drm.js` host sınıflandırması mevcut — eksik parça **EVS üretim imzalama süreci** olabilir.
- **Karar:** Doğrulama görevi — `components.status()` çıktısında Widevine CDM yüklü/versiyon kontrolü + korunan-site smoke'u.

### 8.3 youtube.com/tv (TV arayüzü hilesi)
- **Desen:** `youtube.com/tv` + konsol UA → resmi TV arayüzü tarayıcıda; spatial nav (5.1) + link-hints ile kumanda kullanılabilirliği.
- **Karar:** **Adapt — deneysel;** YouTube politikaları değişebilir, SmartTube bölümümüz zaten var — düşük öncelik.

---

## Öncelik Matrisi

### S — Ucuz + hemen değer
1. `printToPDF` (sayfa→PDF)
2. Sekme menüsü: duplicate/close-others/close-right/copy-URL
3. Dış oynatıcıya ver (mpv)
4. QR handoff
5. Uyku zamanlayıcısı
6. Sekme ses kaydı (hazır `pcm16Wav`)
7. Sinema/odak modu enjeksiyonu
8. Otomatik PiP tetiki
9. De-AMP + "temiz linki kopyala" (kendi kısa param listemizle başlanabilir)
10. DDG bangs
11. Markdown kopyala (turndown)
12. TTS okuma

### A — Orta maliyet, yüksek değer
13. **Trickplay yerel seekbar önizleme** (keyframe hızlandırmalı ffmpeg tile)
14. **İncognito sekmeler** → ardından **konteyner** + **partition proxy**
15. **ClearURLs motoru** (katalog fetch veya yerel kurallar)
16. **Element picker** (cosmetic-executor üstüne üretici UI)
17. **Lite mode** (site başına JS/resim/medya bloklama — debugger zaten attach)
18. **OpenSubtitles moviehash** + subliminal çok-sağlayıcı arama
19. **İntro/jenerik atlama** (bölüm-adı + sessizlik; chromaprint'siz)
20. **DLNA cast** (dlnacasts + local HTTP + subtitlesUrl)
21. **Userscript yöneticisi** (@match parser + yönetim UI)
22. **Whisper sesli giriş/dikte** (canlı-ASR boru hattı yeniden kullanım)
23. **Video filtreleri + ses yükseltme**
24. **Çevrimdışı okuma listesi** (MHTML + page-index birleşimi)
25. **Spatial navigation** (TV kumandası/gamepad)
26. **Auto-update (electron-updater)**

### B — Stratejik/ağır
27. Chrome uzantı desteği (MV3 subset spike; electron-chrome-extensions)
28. EVS üretim VMP imzalama süreci (DRM'yi gerçek korunan servislerde çalışır hale getirir — castlabs hesabı gerekir)
29. Şifre kasası (safeStorage + autofill enjeksiyonu)
30. SSB/app-mode pencereleri
31. Sekme önizleme kartları (polish)

### C — Referans/düşük öncelik
32. 3p-cookie/ETag kırpma (kırılgan)
33. youtube.com/tv hilesi
34. WebRTC sızıntı kontrolleri
35. Consent-O-Matic — lisans belirsizliği çözülünce B'ye çıkar

### Reddet
- `documentPictureInPicture` API kullanımı — Electron'da bozuk (#39633); kendi mini-player'ımız üstün
- Chromaprint intro algılama — özel jellyfin-ffmpeg build gerektirir
- `electron-chromecast` — bakımsız; DLNA öncelikli
- SingleFile — AGPL ve savePage MHTML zaten var

## Güvenlik/lisans notları
- **Kopyalanamaz:** Jellyfin (GPL-2), intro-skipper (GPL-3), ClearURLs kod+veri (LGPL-3), subliminal desen referansı (MIT ama Python bağımlılığı — subprocess olarak çağrılabilir), Consent-O-Matic (lisans doğrula)
- **Kopyalanabilir/özgür:** spatial-navigation-polyfill, turndown, qrcode, upnp-mediarenderer-client/dlnacasts (MIT), ghostery/adblocker (MIT — ama kendi adblock'umuz var; yalnız eksik kozmetik/scriptlet desteği için değerlendirilir)
- **Üçüncü-parti veri sızıntısı:** ClearURLs katalog fetch (kural verisi — URL sızıntısı yok), OpenSubtitles (zaten var). Kullanıcı-görünür URL'lerin uzak servislere gönderilmemesi kuralı korunmalı.

**Kaynaklar:** jellyfin/jellyfin TrickplayManager+PR#9554+#11336 · intro-skipper/intro-skipper · ClearURLs/Addon+Rules · cavi-au/Consent-O-Matic · minbrowser/min (userscripts wiki, passwordManager) · thibauts/upnp-mediarenderer-client + @edenware/dlnacasts · GPMDP/electron-chromecast · WICG/spatial-navigation · electron/electron extensions.md + issue #39633 + #37876 · ghostery/adblocker-electron · Diaoul/subliminal · FreeTubeApp/FreeTube (external player pattern) · castlabs/electron-releases wiki (EVS)
