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

---

# DERİN GENİŞLETME — İkinci araştırma turu (40+ ek bulgu)

İkinci turda oynatıcı/güç-tarayıcı ekosistemleri, yerel ML, CDP derin API'leri, medya-takip servisleri, indirme motorları, test altyapısı ve altyazı derinliği katmanları açıldı. Tüm lisans/durum bilgileri repo kaynağından doğrulandı.

## 9. Oynatıcı/güç-tarayıcı ekosistemi desenleri

### 9.1 thumbfast — isteğe bağlı kare yakalama (po5/thumbfast, MIT)
Tile-sprite üretimi yerine **yardımcı mpv'yi on-demand seeklettirme**: `--no-config --idle --pause --keep-open --no-sub --no-audio --start=T --hr-seek=yes --demuxer-readahead-secs=0 --vd-lavc-fast --sws-scaler=fast-bilinear --of=image2 --o=thumb.jpg`. Tek kare/istek → önbelleksiz, CPU dostu. Bizde ffmpeg eşdeğeri: `ffmpeg -ss T -i file -frames:v 1 -vf scale=W:-1`. Ayrıca mpv PR#17518 `user-data/thumbnailer` protokolünü standardize ediyor (UI↔thumbnailer sözleşmesi — bizim seekbar↔üretici ayrımı için temiz model).
**Karar:** Trickplay alternatifi olarak **Adapt** — sprite öncesi hızlı kazanım veya düşük-IO cihazlar için tek kare modu.

### 9.2 Vieb — Electron Vim tarayıcısı (Jelmerro/Vieb, GPL-3)
Kod kopyalanamaz ama Electron'da kanıtlanmış desenler:
- **Pointer mode** — klavyeyle sanal imleç (hover/click/drag) — link-hints'in ötesi; bizde yok
- **searchreach** — çok-sekmeli metin araması (sayfalar arası bul)
- **`:split`/`:vsplit` + Ctrl-w** — bizde split var; çoklu bölme/buffer modeli referansı
- **`erwic`** — site başına konteyner pencereleri (SSB deseninin olgun versiyonu)
- **marks / historyswipe / visual mode** — sayfa-içi işaretler ve görsel seçim
- **`userAgentData` kaldırma** — gizlilik override'ı isolated-world injection'la
- **Linkedom ile reader ayrıştırma** — JSDOM'dan hızlı/hafif alternatif

### 9.3 Nyxt — auto-rules + ağaç geçmişi (atlas-engineer/nyxt, BSD-3)
- **Auto-rules:** URL-koşullu mod kuralları — `match-domain/host/url/regex/scheme`, `:included`/`:excluded` mod listesi, `:exact-p`, **en-spesifik kural kazanır** (apply-all-matching kapalıyken). Kural dosyası insan-yazabilir. → **`browser-site-profiles`'ı genel "otomatik eylem" motoruna yükseltme deseni**: "bu sitede reader+dark+çeviri+zoom aç" kuralları; şu an profiller tekil bayraklar, birleşik kural motoru değil.
- **Ağaç geçmişi:** geri/ileri yığın değil, **dallanan geçmiş ağacı** — yeni navigasyonda forward-stack kaybolmaz. `browser-tab-history`'ye dal görünümü eklenebilir (geçmiş silinmez, düğümler korunur).
- Diğer: bookmark etiketleri, clipboard ring, çok-sekme arama, noscript/noimage modları (bizim lite-mode'a eş).

### 9.4 qutebrowser (GPL) — klavye-tarayıcı kataloğu
Domain-başına ayar (`config-cycle`), quickmarks, hint filtre modları, session lazy-load, **textarea'yı harici editörde açma** (`open_editor`). → "Bu alanı düzenleyicide aç" özelliği (metin alanını bizim editor/panel'de aç, kaydedince geri yaz) — benzersiz, ucuz.

### 9.5 mpv script ekosistemi desenleri
`sponsorblock_minimal.lua`, `chapterskip`, `autosubsync`, `quality-menu`, `uosc` — bizim modüllerle paralel script desenleri; özellikle **chapterskip** (bölüm-adı regex ile atlama) bizim intro-tespiti maddesiyle örtüşür.

## 10. Yerel makine-öğrenmesi katmanı

### 10.1 transformers.js (@huggingface/transformers, MIT)
ONNX Runtime WASM + **WebGPU** (Electron'da kullanılabilir). Worker'da çalıştırma deseni hazır:
- `feature-extraction` + `Xenova/all-MiniLM-L6-v2` (~23MB q8, 384-boyut) → **semantik geçmiş/sayfa araması**: `browser-page-index`'e embedding sütunu; "o makale neydi" tarzı anlam-araması, kosinüs benzerliği
- distilbart özetleme → **çevrimdışı sayfa özeti** (API sağlayıcısı gerektirmez)
- zero-shot görsel sınıflama → thumbnail NSFW/blur filtresi
- metin sınıflama → sayfa dili/içerik türü otomatik etiketleri
**Karar:** **Adapt — orta;** model indirme+cache yönetimi main'de, hesap worker'da.

### 10.2 Piper (rhasspy/piper, MIT)
Yerel nöral TTS — speechSynthesis'ten belirgin doğal; ONNX ses dosyaları subprocess veya WASM ile. TTS okuma özelliğinin kaliteli versiyonu; Türkçe ses mevcut.
**Karar:** **Adapt — orta.**

### 10.3 rnnoise/silero — ASR öncesi gürültü temizleme
Canlı-ASR hattına ön-işlem olarak denoise → Whisper doğruluğu. `live-asr-worklet`'e WASM rnnoise modülü.

## 11. CDP derin API'leri (debugger'ımız zaten attach — marjinal maliyet düşük)

| API | Kazanım | Durum |
|---|---|---|
| `Page.setWebLifecycleState('frozen'/'active')` | **Gerçek sekme dondurma** — DOM korunur, görevler askıya alınır (Vivaldi hibernate / Edge sleeping-tabs eşdeğeri); yok-ettirme yerine üstün | WICG spec + puppeteer issue #3339'da doğrulandı; experimental |
| `Page.addScriptToEvaluateOnNewDocument` | **Navigasyondan ÖNCE enjeksiyon** — userscript yöneticisinin doğru yolu (şu an load-sonrası executeJavaScript) | CDP standart |
| `Network.setBlockedURLs` | Sekme-özelinde hafif URL bloklama | CDP standart |
| `Emulation.setTimezoneOverride/setLocaleOverride` | Sekme başına saat/dil spoof | CDP standart |
| `netLog` + `crashReporter` | Tanı paketine ağ-logu + çökme dökümü | Electron API'leri |
| `utilityProcess` | Adblock/ML işini main'den ayır | Electron API |
| `MessageChannelMain` | Büyük altyazı/veri aktarımında structured stream | Electron API |

## 12. Medya takibi ve kütüphane zenginleştirme

### 12.1 Scrobble servisleri — Trakt/Simkl/AniList
- **Trakt:** `POST /sync/history` (watched_at ile geçmişe yazma — media-center sync deseni), `POST /checkin` (canlı "izliyor"); OAuth. Duplicate'den uygulama sorumlu.
- **Simkl:** `/sync/all-items?date_from=` delta senkron + `/sync/history` + **scrobble ≥%80'de otomatik watched** (bizim watchLibrary akışına birebir uyur).
- **AniList:** GraphQL, anahtarsız okuma — anime izleme.
**Karar:** **Adapt — orta;** opt-in OAuth, `watchLibrary` olaylarına scrobble köprüsü.

### 12.2 guessit (LGPLv3 — CLI/subprocess kullanımı)
Dosya adı → `title/season/episode/source/codec/release_group/type`; Türkçe `sezon`/`bölüm` dahil 12+ dilde sezon-bölüm işaretleri; `expected_title` ile seri düzeltmesi.
**Kullanım:** media-catalog eşleştirme + OpenSubtitles sorgu üretimi + series-context iyileştirme. Python subprocess olarak çağrı (kütüphane linkleme yok → LGPL sorunsuz).

### 12.3 TMDB/fanart zenginleştirme
Poster/özet/episode başlığı — media-catalog'u görselleştirir. API anahtarı gerekir (ücretsiz).

### 12.4 PeerTube — ikinci içerik kaynağı
Federe video platformu, açık REST API, auth'suz browse/search/comment/subtitle. SmartTube dışı bağımsız medya kaynağı olarak bölüm eklenebilir.

## 13. İndirme/yakalama

### 13.1 aria2 (GPL binary — subprocess) + Motrix deseni (MIT)
Çok-bağlantılı, devam-edebilir indirme; `Motrix` Electron+Vue aria2 GUI'si — aynı stack, doğrudan referans. Büyük dosyalarda hız/kesinti-dayanıklılık.
**Karar:** **Adapt — orta;** `browser-downloads`'a aria2c backend seçeneği.

### 13.2 WebTorrent (MIT)
Magnet → in-app stream; WebTorrent Desktop aynı stack (Electron). Protokol-nötr; yasal içerik (ISO'lar, Creative Commons, arşiv) varsayımıyla opsiyonel kaynak.
**Karar:** **Adapt — ağır; düşük öncelik.**

### 13.3 Sekme kaydı — getDisplayMedia
`desktopCapturer.getSources` + `getMediaSourceId` zaten var → `getDisplayMedia` ile **sekmenin video+ses'ini WebM'e kaydet** (audio-only WAV kaydından bir üst seviye).
**Karar:** **Adopt — orta;** mevcut capturer altyapısına bağlanır.

### 13.4 Remote Playback API — yerel cast menüsü
`video.remote.watchAvailability(cb)` + `video.remote.prompt()` → Chromium'un kendi cast diyaloğu. **Electron'da Cast servisinin derli olup olmadığı `'remote' in video` probe'uyla doğrulanmalı** — derliyse DLNA implementasyonu gereksizleşir. MSE/blob src için `cast-src` gerekir (muxinc/castable-video deseni).
**Karar:** **Önce probe — sonra Adopt/Reddet.**

## 14. Test/altyapı repoları

| Repo | Ne verir | Karar |
|---|---|---|
| `playwright` `_electron.launch` | Gerçek E2E: pencere etkileşimi, screenshot, `electronApp.evaluate` ile dialog stubbing (deterministik) | **Adapt — orta;** custom smoke'ların üstünde UI katmanı |
| `deque/axe-core` (MPL-2) / pa11y | Renderer'da otomatik a11y denetimi → teste bağlama | **Adopt — küçük;** mevcut ARIA işini regresyona çevirir |
| `knip` (ISC) + `madge` (MIT) | 90+ browser modülünde ölü-kod/döngüsel-bağımlılık haritası | **Adopt — küçük;** bakım hijyeni |
| `jest-image-snapshot` / playwright diff | Görsel regresyon — `_repro/`'daki manuel screenshot akışını otomatikleştirir | **Adapt — orta** |
| `dependency-cruiser` | Modül-grafik + kural bazlı mimari kısıtlar | Küçük |
| `eruda`/`vConsole` (MIT) | Sayfa-içi debug konsolu enjeksiyonu (site incelemesi için) | Küçük, dev-özellik |

## 15. Altyazı derinliği (browser tarafıyla kesişen)

### 15.1 imsc (W3C Software License — permissive)
**TTML/IMSC1 → HTML renderer.** Kritik boşluk: DASH/Netflix-tipi altyazıların çoğu TTML — ağ yakalamamız TTML track'i ham tutuyorsa overlay'de gösteremeyiz. imsc TTML'i DOM'a çizer; dash.js'in TTML pipeline'ı referans. Ayrıca `vtt.js` (Mozilla, WebVTT parser referansı).
**Karar:** **Adapt — orta;** `browser-subtitles`'a TTML kolu.

### 15.2 JASSUB (MIT wrapper + libass LGPL-2.1 WASM)
Tüm SSA/ASS özellikleri (karaoke `\k`, `\t` transform, çizim komutları, gömülü fontlar) WebGL-hızlı WASM render — `browser-ass-renderer`'ımızın kapsamadığı derin ASS özelliklerinin olgun implementasyonu. SharedArrayBuffer çok-iş parçacığı için COEP/COOP başlığı gerekir (bizim sayfalar kontrolümüzde; fallback tek-iş parçacıklı).
**Karar:** **Adapt — orta;** kapsam boşluklarında fallback/ikinci renderer. LGPL ayrı-WASM-modül olarak kullanılabilir, doğrula.

### 15.3 Subtitle Edit özellik kataloğu (GPL-3 — desen)
SE, altyazı editörü referansı: **waveform üzerinde düzenleme**, "hearing-impaired metni temizle", yaygın-hata toplu düzeltme, shot-change yaslama, 30+ format, **PGS/VobSub→SRT OCR** (tesseract), batch convert, point-sync. Bizim editor'e uygulanabilir desen seti (özellikle hearing-impaired temizliği ve OCR borusu — tesseract gerektirir).
**Karar:** Desen referansı — editör roadmap'ine.

### 15.4 aeneas / alass — zorlu hizalama
`aeneas` forced-alignment (metin+ses→senkron), `alass` (Rust) ses-aktivite hizalaması — ffsubsync-benzeri sync'imize alternatif/tamamlayıcı.

## 16. Platform/UX küçük-kazanç listesi (Chromium+Electron API)

**Pencere/entegrasyon:**
- Tray ikonu + menü (oynat/duraklat/hızlı-sekme) — `Tray`
- Windows JumpList görevleri ("Son videolar", "Yeni sekme") — `app.setJumpList`
- Açılışta başlat — `app.setLoginItemSettings`
- **`setAsDefaultProtocolClient('whisper')`** + `second-instance` arg → `whisper://open?url=` derin bağlantı + "birlikte aç"
- `navigator.setAppBadge` — görev çubuğu rozeti
- `Notification` — indirme-bitti, abonelik-yeni-video, queue-bitti toastları
- `navigator.share` (Web Share) — sayfa paylaşımı

**Girdi/navigasyon:**
- **Gamepad API** — kumanda/gamepad ile spatial nav eşli (TV hedefi)
- **`navigator.virtualKeyboard` + özel OSK** — TV/kiosk ekran klavyesi (arama kutusunda)
- **caret browsing** — `app.commandLine.appendSwitch('enable-caret-browsing')` → F7 metin-imleçli gezinme
- Vieb pointer-mode (9.2)
- orta-tık autoscroll + scroll-anywhere (enjeksiyon)
- EyeDropper API — sayfa renk seçici

**Medya:**
- `MediaCapabilities.decodingInfo` — codec desteğine göre otomatik kalite/codec seçimi
- `getVideoPlaybackQuality` + `requestVideoFrameCallback` — **"stats for nerds" overlay** (dropped frames, buffer, çözünürlük) + kare-kare ilerleme (herhangi site videosu dahil)
- Speculation Rules enjeksiyonu — tahmine dayalı prefetch
- Ambient mod (video arkası blur-kopya parlama — cosmetic)

**Sayfa araçları:**
- Sekme başına **auto-refresh/periodic reload** (canlı paneller)
- **multi-highlight** — kalıcı terim vurgusu
- **form recovery** — Lazarus-deseni; yazılan metni çökmeye karşı sakla
- omnibox'ta `= ifade` hesap/birim çevirici (Vivaldi quick-commands deseni)
- `[başlık](url)` markdown link kopyalama
- hover-zoom görsel önizleme (Imagus deseni)
- `eruda` debug konsolu enjeksiyonu
- **textarea'yı düzenleyicide aç** (qutebrowser deseni)

**Gizlilik/engelleme (ilk rapora ek):**
- **HTTPS-First** — http→https yükseltme denemesi + uyarı rozeti
- **Privacy-Badger-sezgisel** — N+ first-party'de izlenen 3p domain'i öğren-engelle (liste-gerektirmez; kendi implementasyonumuz — EFF GPL desen)
- **uMatrix-lite** — site × kaynak-türü izin matrisi UI'ı (siteProfiles'ın güç-görünümü)
- **Lightbeam grafiği** — network-capture verisinden tracker bağlantı haritası
- **userAgentData kaldırma** (Vieb deseni) + isteğe bağlı canvas/audio fingerprint gürültüsü (Chameleon deseni — site kırabilir, opt-in)
- **WebRTC kısıtı** — izin/politika ile yerel-IP sızıntısını azalt
- **DDG Fire Button** — tek-tık tüm-sekme+veri silme (onaylı)
- **Konteyner + proxy** birleşimi (ilk rapora ek detay: partition→setProxy zinciri)

**Okuma/senkron/arşiv:**
- **floccus deseni** — yer imleri/ayarlar WebDAV/GDrive senkronu (kendi sunucumuz yok → gizlilik-koruyucu sync)
- **wallabag/linkding/archivebox hedefleri** — self-hosted read-later/yer imi/WARC arşivi API'larına gönderme
- **archive.org SPN** — "sayfayı Wayback'e kaydet" + son snapshot açma (research-notebook'a uyar)
- **warcio.js/replayweb** — MHTML ötesi WARC arşiv+replay (etkileşimli sayfa arşivi)
- **RSS/podcast** — `<link rel=alternate type=rss>` algıla → `rss-parser` (MIT) + podcast enclosure → oynatıcı; PodcastIndex arama
- **Vivaldi desenleri** — chained commands (komut zincirleri), hibernate (11.tablo), adaptive tema (site rengine uyum)
- **Opera desenleri** — sidebar'da sabit-site mini-webview (mesajlaşma/müzik), GX-control tarzı CPU/RAM/ağ sınırlayıcı UI (`browser-resource`/`resource-soak` modülümüze bağlanır)
- **Arc desenleri** — easel (sayfa üstü çizim → note-store), boosts (site-başına CSS düzenleme UI — `browser-youtube-style` desenini genelleştir), live-folders (RSS)

**Medya bitişik:**
- **LosslessCut deseni (GPL, aynı stack Electron+ffmpeg)** — **kayıpsız kesit/birleştirme** (`-c copy`, re-encode yok) + altyazı senkron koruma → "medya kesici" özelliği; trim dışı reklam/intro kesme
- **Kodi JSON-RPC deseni** — main'de küçük HTTP+WS sunucu → **telefondan kumanda** (transport/ses/altyazı/seek/queue); benzersiz, stack'e uygun
- **Syncplay (Apache-2)** — izleme-partisi protokolü (referans)
- **KDE Connect** — telefon entegrasyonu (referans; MPris-subset)
- **OBS-websocket** — yayın kontrol köprüsü (referans)

## Genişletilmiş reddet/defer listesi

- `documentPictureInPicture` — Electron'da bozuk (#39633) → kendi mini-player'ımız
- Remote Playback → **önce probe**; Cast servisi derli değilse DLNA'ya düş
- TrackMeNot/AdNauseam — sahte sorgu/sahte tıklama (etik dışı)
- Tam Chrome-uzantı uyumluluğu — Electron "non-goal"; userscript+GM yüzeyi öncelikli
- Chromaprint intro algılama — özel ffmpeg build
- Push-notification servisi — FCM Electron'da yok; Notification'lar yerel kalır
- ipfs/hyper protokolleri (agregore tarzı) — niş
- Tor-snowflake köprüsü — ağır

## Genişletme öncelik eklentileri (ana matrise ekle)

**S (ucuz):** rVFC kare-kare ilerleme · "stats for nerds" overlay · MediaCapabilities codec seçimi · `=` omnibox hesap · `[başlık](url)` kopyala · auto-refresh · orta-tık autoscroll · multi-highlight · hover-zoom · caret browsing · OSK+virtualKeyboard · gamepad-nav eşliği · tray+JumpList+login-item · `whisper://` protokol · native Notification'lar · Badging · EyeDropper · form recovery · archive.org SPN · DDG fire-button · AMOLED-siyah tema · adaptive-tema · Opera sidebar sabit-site · textarea-düzenleyici

**A:** semantik geçmiş (MiniLM embeddings) · piper TTS · **sekme dondurma setWebLifecycleState** · **userscript GM_* yüzeyi** (`GM_xmlhttpRequest`→main-net CORS bypass, `GM_setValue`, `GM_notification`, `GM_openInTab` — gerçek scriptlerin çalışması için şart) · **pre-nav enjeksiyon addScriptToEvaluateOnNewDocument** · uMatrix-lite · Privacy-Badger-sezgisel · HTTPS-First · timezone/locale spoof · WebRTC kısıtı · sekme video+ses kaydı (getDisplayMedia) · Remote-Playback probe+cast-src · aria2 indirme · Kodi-remote HTTP+WS · floccus-sync · RSS/podcast · Trakt/Simkl scrobble · guessit+TMDB zenginleştirme · LosslessCut-kesici · Nyxt-auto-rules genelleştirme (siteProfiles→auto-actions) · ağaç geçmişi · Vieb pointer-mode · çok-sekmeli arama · Playwright-E2E · axe-core a11y-regresyon · knip/madge · görsel-regresyon · utilityProcess ayrımı · netLog+crashReporter tanı paketi · rnnoise ASR ön-işlemi

**B:** imsc TTML renderer · JASSUB fallback · subtitleedit desen-seti (waveform/HI-temizliği/OCR) · subliminal-subprocess genişlemesi · wallabag/linkding/archivebox uçları · PeerTube kaynağı · WARC arşivi · WebTorrent · fingerprint-gürültüsü · lightbeam-grafiği · SSB→erwic · chained-commands

**C/Referans:** Syncplay watch-party · KDE-Connect · OBS-websocket · ipfs/hyper · aeneas/alass · SubtitleEdit OCR (tesseract bağımlılığı)

## Genişletme kaynakları

po5/thumbfast (+mpv PR#17518 thumbnailer API) · Jelmerro/Vieb (vieb.dev/features + CHANGELOG: userAgentData override, erwic, searchreach) · atlas-engineer/nyxt (auto-rules.lisp şeması, match-* fonksiyonları, ağaç geçmişi) · qutebrowser · huggingface/transformers.js (MiniLM/distilbart/zero-shot + WebGPU) · rhasspy/piper · ThaUnknown/jassub (MIT+LGPL-2.1) · W3C imsc + mozilla/vtt.js · muxinc/media-elements castable-video · playwright.dev/docs/api/class-electron (dialog stubbing) · deque/axe-core · knip/madge/dependency-cruiser · guessit-io/guessit (LGPLv3 CLI) · trakt.tv+simkl.com+anilist API'ları · aria2 + nathan-e/motrix · webtorrent/webtorrent · WICG page-lifecycle (`setWebLifecycleState`) · sindresorhus ekosistemi · floccus · wallabag/linkding/archivebox · webrecorder warcio.js/replayweb · archive.org SPN2 · podcastindex · nickoala/SubtitleEdit (desen kataloğu) · LosslessCut · Syncplay/syncplay · KDE Connect · Opera/Vivaldi/Arc/DDG ürün desenleri (kaynak kapalı — yalnız davranış referansı)
