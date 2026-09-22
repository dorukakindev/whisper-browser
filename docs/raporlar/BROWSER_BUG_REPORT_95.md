# BROWSER_BUG_REPORT_95 — Kapsamlı entegrasyon ve regresyon turu

Tarih: 2026-09-21 · Dal: `devin/comprehensive-tour` · Taban: `master @ 1fd9792` (9aa376a güvenlik düzeltmeleri dahil)

## Kapsam

İstenen kabul matrisi A–G: gerçek Electron masaüstü açılışı, SmartTube akışları, kuyruk yaşam döngüsü, YouTube OAuth güvenlik, altyazı/çeviri zinciri, stabilite soak, test disiplini. İzole profil: `WHISPER_RESOURCE_SOAK_USER_DATA=$HOME/qa-profile-r95`. UI doğrulamaları gerçek Electron penceresinde (DISPLAY :0, xdotool + screenshot kanıtlı) yapıldı.

## Ürün bulguları (gerçek hatalar — hepsi düzeltildi)

### F1 — Masaüstü OAuth: device-code akışı yanlış istemci tipi için (Matris D) — FAIL-FIXED

- **Dosya:satır:** `src/main.js` (`youtube:deviceCode` akışı, yeni `youtube:authCode` ~1706), `backend/youtube.py` (`device_code`, `poll`, yeni `exchange_code`), `src/renderer/index.html`/`renderer.js` (login modalı)
- **Olay yolu:** SmartTube → "YouTube ile giriş" → modal
- **Repro:** Kayıtlı bir "Web/Desktop application" OAuth istemcisiyle modal açılır → eski kod doğrudan device-code akışı başlatırdı. Google dokümanına göre device-code yalnızca **"TVs and Limited Input"** istemci tipine açıktır; masaüstü uygulamaları için önerilen akış **installed-app authorization-code + loopback redirect (`http://127.0.0.1:port`) + PKCE**'dir. Device-code, sıradan masaüstü istemcisiyle Google tarafında `invalid_client`/reddedilir.
- **Kullanıcı etkisi:** Kullanıcı kendi masaüstü istemcisini girse bile giriş akışı Google'ın beklediği tipte değildi; PR #9'da geçici olarak gömülen üçüncü-taraf TVHTML5 istemcisi bu yüzden çalışıyordu ve 9aa376a'da güvenlik nedeniyle çıkarıldı.
- **Kök neden:** Akış seçimi uygulama tipini değil yalnızca "QR ile kolay giriş" hedefini gözetmişti.
- **Düzeltme:** `youtube:authCode` IPC eklendi — PKCE (48B verifier, S256 challenge), 127.0.0.1 üzerinde tek seferlik loopback dinleyici, `state` doğrulaması, `accounts.google.com/o/oauth2/v2/auth` `openExternalByPolicy` ile açılır, `access_type=offline` + `prompt=consent`. Backend'e `exchange_code` komutu (env üzerinden `WHISPER_YT_AUTH_CODE`/`WHISPER_YT_CODE_VERIFIER`/`WHISPER_YT_REDIRECT_URI` — secret asla argv'de değil). UI: modal artık önce yöntem seçimi gösterir ("Tarayıcıda yetkilendir" birincil; "Cihaz kodu üret" yalnızca "TVs and Limited Input" istemcisi olanlar için ikincil). `youtube:cancel`/`youtube:logout` bekleyen loopback akışını iptal eder. Kapsam `youtube.readonly` sınırında kaldı; gömülü istemci geri getirilmedi.
- **Regresyon testi:** `tests/report70-youtube-oauth.test.js` R70-15/15b/15c/15d/15e (PKCE+loopback+state+env-not-argv+offline+no-token-to-renderer; iptal yolları; main/backend scope paritesi; exchange_code grant şekli; renderer wiring). `backend/test_youtube.py` ExchangeCode sınıfı (3 test). `electron-smarttube-boot` smoke'u yeni seçim ekranını doğrular.
- **Doğrulama sınırı:** Gerçek Google hesap onayı BLOCKED — yetkili test hesabı/istemcisi yok. Akışın shell tarafı (PKCE URL üretimi, loopback port, state, cancel'da listener kapanması) gerçek UI'da doğrulandı; gerçek token değişimi kullanıcının kendi istemcisiyle yapılmalı.

### F2 — Video analiz araçları Linux'ta tamamen kapalı (Matris A/G) — FAIL-FIXED

- **Dosya:satır:** `src/browser-video-analysis.js` (`checkTools`), aynı desen `src/browser-media-tools.js` `sceneStrip`
- **Olay yolu:** Browser araçları → intro tespiti / OCR / anlamsal arama; Extras → sahne şeridi
- **Repro:** `resolvePython()`/`resolveFfTool()` Linux'ta PATH'ten çözülen çıplak ad döndürür (`'python3'`, `'ffmpeg'`); `fs.existsSync` bunlara `false` veriyor → "Python, FFmpeg veya ffprobe bulunamadı." her çağrıda fırlıyor. `electron-browser-analysis` ve `electron-browser-extras` smoke'ları bu yüzden çakılıyordu.
- **Kullanıcı etkisi:** Linux (ve PATH-kurulumlu her platform) üzerinde browser video analiz araçları ve sahne algılama hiç çalışmıyor.
- **Kök neden:** Araç kontrolü yalnızca `backend/bin` + mutlak yol varsayımıyla yazılmış; PATH çözümü hesaba katılmamış.
- **Düzeltme:** İki modüle de `toolAvailable()` — mutlak/yol içeren adlar için `fs.existsSync`, çıplak komut adları için `--version`/`-version` spawn probu.
- **Regresyon testi:** `tests/browser-video-analysis.test.js` — çıplak adlarla `detectIntro` çağrısının "bulunamadı" değil doğrulama hatası vermesi (önce kırmızıydı).
- **Doğrulama:** `electron-browser-analysis` (2 smoke), `electron-browser-extras` — PASS (gerçek Electron + gerçek ffmpeg).

### F3 — SmartTube/abonelik metinleri EN dilinde Türkçe kalıyor (Matris A) — FAIL-FIXED

- **Dosya:satır:** `src/renderer/renderer.js:25340-25347` (abonelik boş-durum + ipucu), `:25847` ('Cihaz kodu alınamadı')
- **Repro:** EN locale → SmartTube → Subscriptions boş durumu → Türkçe literal; cihaz kodu hatası Türkçe.
- **Kök neden:** 3 string ham `textContent` atamasıydı (t() sarması yok) ve 4 metnin sözlük girdisi eksikti.
- **Düzeltme:** `t()` sarmaları + `ui-locale.js`'e 4 yeni girdi (Cihaz kodu alınamadı / Bu grupta kanal yok. / Yerel abonelik listesi boş… / Liste bu cihazda tutulur…).
- **Regresyon testi:** `tests/ui-locale.test.js` — R95 bloğu: 6 anahtarın EN çevirisi olduğunu doğrular.
- **Not:** Ajanın işaretlediği "Oynatma sırası", "Akış alınamadı", "Ana sayfa çizilirken hata" ve login seçim etiketleri sözlükte zaten vardı ve `translate()` doğrulaması EN dönüyor — büyük olasılıkla locale geçişinden önce yakalanan gözlem; kanıtlanmış eksik girdiler düzeltildi.

### F4 — Linux'ta sahte "Python venv bulunamadı" + ffmpeg uyarısı (Matris A) — FAIL-FIXED

- **Dosya:satır:** `src/main.js` `app:getEnvInfo` (venv/ffmpeg varlık kontrolü), `resolveFfTool`
- **Repro:** Linux'ta `backend/venv/bin/python` mevcutken açılışta "Python sanal ortamı bulunamadı — önce install.bat çalıştırın." uyarısı; `backend/bin/ffmpeg` de `.exe` uzantısı aradığı için bulunamıyordu.
- **Kök neden:** Varlık kontrolleri yalnız Windows düzenini (`Scripts/python.exe`, `ffmpeg.exe`) sınıyordu; `resolvePython()` zaten platform-farkındaydı, kontrol değildi.
- **Düzeltme:** `process.platform === 'win32'` ile `Scripts/python.exe`↔`bin/python`, `ffmpeg.exe`↔`ffmpeg` seçimi — hem `app:getEnvInfo` hem `resolveFfTool`'da.
- **Doğrulama:** `electron-a3-acceptance` + `electron-runtime-maintenance` smokes PASS.

### F5 — CSP `worker-src` eksik: hls.js demuxer worker engelleniyor (Matris A/E) — FAIL-FIXED

- **Dosya:satır:** `src/renderer/index.html` CSP meta
- **Repro:** `ELECTRON_ENABLE_LOGGING` konsolunda `Creating a worker from 'blob:…' violates … script-src 'self'` — hls.js transmuxer worker'ı açamıyor, demux ana iş parçacığında kalıyor.
- **Kullanıcı etkisi:** HLS oynatma çalışır ama düşük verimde; büyük yayınlarda takılma riski.
- **Düzeltme:** CSP'ye `worker-src 'self' blob:` eklendi (hls.js'in standart gereksinimi; script-src gevşetilmedi).
- **Doğrulama:** `electron-browser-video-e2e` dahil tüm smokes PASS; CSP meta dışında gevşeme yok.

### F6 — Bounce sonrası istemci formu boş dönüyor (Matris D, minor UX) — FAIL-FIXED

- **Repro:** Başarısız giriş veya "İstemciyi değiştir" sonrası Client ID alanı boş — kullanıcı uzun ID'yi yeniden yapıştırmak zorunda.
- **Düzeltme:** `youtube:session` yanıtına `clientId` eklendi (public identifier — auth URL'sinde de görünür; secret asla dönmez); renderer `_ytSavedClientId` ile `ytClientView`'a dönerken boş alanı doldurur. R70-03 whitelist testine `clientId` bilinçli eklendi.
- **Regresyon:** `tests/report70-youtube-oauth.test.js` whitelist + `electron-smarttube-boot` smoke PASS.

### Açık bırakılan (FAIL-OPEN, minor)

- **O-UX1:** Bozuk istemciyle tarayıcı akışı Google'da `invalid_client` gösterir ama uygulama "Tarayıcıda Google onayı bekleniyor…"da 600 sn bekler — loopback'e callback gelmediği için hata algılanamaz (Google'ın doğası; masaüstü akışında hata tarayıcıda kalır). Modal'da "İstemciyi değiştir" ve "İptal" zaten var; dokümantasyon sınırı olarak kayıtlı.
- **O-CSP1:** `data:,WEBVTT` placeholder'ı `media-src` engelliyor uyarısı — ürün kodunda kaynak bulunamadı (fixture/harita sayfasından geliyor olabilir). CSP'yi kanıtsız genişletmemek için açık bırakıldı; zararsız uyarı.

## Test harnesi / ortam bulguları (ürün hatası değil — matris G gereği ayrı raporlanır)

- **T1:** 9 smoke dosyası `backend/bin/ffmpeg.exe` sabit yolu kullanıyordu (Windows-only) → Linux'ta ENOENT. `findMediaTool('ffmpeg')` (`tests/media-runtime.js`) ile taşındı.
- **T2:** 6 dosya `node_modules/electron/dist/electron.exe` ile alt süreç başlatıyordu → `process.execPath`.
- **T3:** `electron-media-catalog.smoke.js` `backend/venv/Scripts/python.exe` sabitini kullanıyordu → `findTestPython()`.
- **T4:** `electron-browser-video-e2e.smoke.js` repoda olmayan `.uiprev/flower.mp4` fixture'ı istiyordu → eksikse ffmpeg ile sentetik üretim; ayrıca üretim `mpeg4` (MPEG-4 Part 2) codec'i kullanıyordu — Chromium bunu oynatmaz → `libx264`'e çevrildi.
- **T5:** `electron-smarttube-boot` + `report67` eski "modal açılır açılmaz device flow" beklentisindeydi → F1'in yeni seçim akışına göre güncellendi (daraltma yok, adım eklendi).
- **O1 (ortam):** `backend/venv`'de `sentence-transformers` eksikti → `pip install sentence-transformers==5.1.2` (requirements-browser-tools.txt pin'i); eski pip resolver çöktüğü için pip 26.2.1'e yükseltildi. `faster_whisper` import doğrulandı.
- **Gürültü (ürün hatası değil):** dbus/dconf/Portal uyarıları headless Linux oturum artefaktı; tek `queue:saveSync` "without listeners" satırı smoke'un kapanış yarışı.

## Varsayım / yalnız teorik riskler (kanıtsız — ayrı tutulur)

- lockupViewModel kart formatı girişli InnerTube akışıyla gelir; parser birim testle kilitli ama gerçek girişli feed'de doğrulanmadı.
- Yt-dlp fallback (Invidious ölüyken `/feed/trending` üzerinden) canlı ağda içerik döndürebilir; bu box'ta doğrulanamadı.
- Probe başarısızlığına bağlı kuyruk yarışları (otomatik geçiş vs. kullanıcı tıklaması) probe'lar aralıklı başarılı olduğundan tam üretilemedi.

## Sınırlar (erişim nedeniyle doğrulanamayanlar)

- **Gerçek Google hesabı girişi:** BLOCKED — yetkili test hesabı/istemcisi sağlanmadı. PKCE+loopback üretimi, state doğrulaması, reddedilme/iptal yolları doğrulandı; gerçek token değişimi kullanıcı tarafında tekrarlanmalı.
- **Canlı Invidious/YouTube per-video probe'ları:** bu box'ta bot kontrolüne takılıyor. Hata/boş/yavaş/retry durumları kontrollü yerel cevaplarla gerçek UI'da test edildi; canlı servis başarısı iddia edilmez. (Bir kart probe'u arada başarılı oldu ve gerçek oynatma + otomatik-geçiş doğrulandı.)
- **safeStorage:** Linux'ta `isEncryptionAvailable()` false — token saklama bunun için düz metne düşürülmedi; davranış korundu.

## Kabul matrisi

| Satır | Durum | Komut / UI adımı | Beklenen ↔ Gerçekleşen | Kanıt |
|---|---|---|---|---|
| A | PASS | `npm start` izole profil, DISPLAY :0; Player/Browser/SmartTube/Ayarlar geçişi; EN↔TR; 100/125/150% + 1100×680 | Tüm workspace'ler açılır, hata/boş/yükleniyor durumları doğru ↔ aynen; 3 ürün hatası (F2/F3/F4/F5) bulunup düzeltildi | `~/screenshots/ss_*`, `~/qa-report-r95-comprehensive.md` |
| B | PASS | Home/Trending/Popular/Subs/Search + boş/hata/yavaş/401-403-500/retry (kontrollü cevaplar) | Hiçbir durumda sonsuz Loading veya boş siyah sahne ↔ fallback + CTA + retry doğru | ss_40d3a33d (hata), ss_fd8fc1fd/ss_9c811c39 (fallback+rail) |
| C | PASS | Kuyruk ekle/çıkar/dedupe/baş-orta-son/Next/auto-next/dequeue; kalıcılık kill+relaunch | Sıra ve konum korunur ↔ leveldb `stPlayQueue` + ray yeniden render doğrulandı; gerçek oynatmada auto-next kafa kartı aldı | ss_214fb828, ss_86f1eed3, soak.log |
| D | FAIL-FIXED (F1) + PASS | PKCE+loopback, device-code yalnız TV istemcisine; cancel/logout abort | Google desktop akışı ↔ eski akış yanlış tipteydi; üçüncü-taraf istemci geri gelmedi | report70 25/25, test_youtube 22/22, boot smoke |
| E | PASS | Gerçek kısa video → tiny/CPU transcribe → TR çeviri (refine 2. geçiş) → önizleme → `.tr.srt`; aynı-zamanlı cue'lar ayrı çevrildi | Zincir uçtan uca ↔ `mxa4HDgfWFs.tr.srt` diske yazıldı, `translation_refresh.index` doğru satırı güncelledi | `~/Downloads/Whisper/ÇIKTI/*.tr.srt`, `/tmp/qa-r95/dup.tr.srt` |
| F | PASS | ~9 dk xdotool soak (39 iter) + uzun manuel turlar; RAM/süreç/listener gözlemi | Sızıntı/çökme yok ↔ aynen; tek ölçümle "leak" iddiası yok | `/tmp/qa-r95/soak.log` |
| G | PASS | `npm test` (tümü geçti), `npm run test:electron-bridge` (geçti), `run-electron-smokes.js --all` (22/22) | Ürün hatası başına önce kırmızı test → dar düzeltme; harness hataları ayrı (T1–T5) | komut çıktıları |

## Çalıştırılan komutlar (exit code)

- `npm test` → 0 ("Tüm testler geçti"; report70 25/25, report67 84/84, test_youtube 22/22, ui-locale 14+6, browser-video-analysis OK)
- `npm run test:electron-bridge` → 0 (trusted-bridge geçti)
- `node tests/run-electron-smokes.js --all` → 0 (22 smoke, 0 başarısız)
- `node --check` src/{main,preload,renderer/renderer,browser-media-tools,browser-video-analysis,renderer/ui-locale}.js → 0
