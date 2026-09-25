# GITHUB REPO ÖNERİLERİ 2026-09-25 — Browser tarafına derinlemesine entegrasyon araştırması (v2)

**Tarih:** 2026-09-25 · **Tür:** Araştırma (kod değişikliği YOK) · **v2:** İkinci derinleştirme turu — interception katmanı, CDP/MSE mekanikleri, paket yüzeyleri ve ~45 depo/paket doğrulandı · **Kapsam:** Gömülü browser, SmartTube, altyazı yakalama/senkron/çeviri

Bu rapor `GITHUB_BENZER_PROJELER_STRATEJI_RAPORU_2026-09-01.md` ve `BROWSER_FEATURE_RESEARCH_75.md` çalışmalarını tekrar etmeden, **kaynak kodu incelenmiş** adayları listeler. Metadata 2026-09-25 anlık kanıtıdır.

## Doğrulanmış mevcut envanter (satır kanıtlı)

**Yakalama/interception katmanı — zaten derin:**
- CDP `debugger.attach('1.3')` + `Network.enable` (12MB buffer) + `Network.getResponseBody` — gövde seviyesinde altyazı yakalama (`src/main.js` ~10416, ~10594)
- `Fetch.enable` + `Fetch.getResponseBody` + `Fetch.fulfillRequest` — YouTube player-response reklam/izleme budama (response rewrite, ~10510-10565)
- `Target.setAutoAttach` flatten — iframe/worker hedefleri yakalanıyor
- Sayfa-içi `fetch` + `XMLHttpRequest.open/send` hook'ları (~10795) + `textTracks`/`addtrack` gözlemcisi (`browser-preload.js` ~98)
- `browser-textutil.js`: UTF-8-fatal + windows-1254 Türkçe kodlama sezgisi
- `webContents.savePage` MHTML (~8147), `capturePage`, `whisper-pdf`/`whisper-assets` protokolleri
- Bağlam menüsü (`main.js:5206`), MediaSession/SMTC (renderer ~22748), getDisplayMedia loopback + AudioWorklet PCM (`browser-live-audio.js`)

**Veri/işlem katmanı:**
- Invidious REST + **instance failover** (`_iter_instances`) + **yt-dlp flat-extract yedekleri** (`_ytdlp_search_videos`, `_ytdlp_tab_videos`) + TVHTML5 OAuth çoklu hesap
- `ffsubsync` kurulu — yalnız altyazı↔altyazı parçalı mod (`browser_align.py`); **ses/VAD modu boşta**
- `rapidocr` bölge-OCR (≤60sn/120 kare), `guessit`, `sentence-transformers` semantik arama
- OpenSubtitles REST tek sağlayıcı — **yalnız `query`/`season`/`episode`; `imdb_id` parametresi kullanılmıyor**
- SponsorBlock, jassub, hls.js, imsc, vtt.js, mp4box, pdfjs, darkreader, axe-core

**Doğrulanmış gerçek boşluklar:**
- `SourceBuffer`/`appendBuffer` hook'u YOK (MSE-içi medya reconstrüksiyonu)
- WebSocket capture YOK (live chat dahil)
- POST gövdesi yakalama kullanılmıyor (`requestPostData`/`postData` hiç geçmiyor — protobuf manifestli servisler)
- Storyboard, transcript, kanal sekmeleri, yorum yanıtı, live chat, DeArrow, dislike, yerel abonelik — YOK (R75 uyumlu)
- Altyazı arşivi açma (zip/rar) ve non-Türkçe legacy encoding (cp1251/1250, Big5, EUC-JP) kapsamı sınırlı
- Altyazı sağlayıcı sayısı: 1

---

## KADEME A — Doğrudan entegrasyon

### 1. LuanRT/YouTube.js (`youtubei.js@18.1.0`) — MIT · aktif · ~5,3k★

**İncelenen yüzey:** npm registry paket tanımı (`unpackedSize: 15.8MB`, 2101 dosya), export koşulları (`node`/`deno`/`browser`/`react-native`/`cf-worker`/`web.bundle`/`agnostic`), 3 runtime dep (`@bufbuild/protobuf`, `fflate`, `meriyah`), SLSA provenance + npm trustedPublisher, `vitest` testler — ve **FreeTube `src/renderer/helpers/api/local.js`** (2200+ satır, gerçek entegrasyon deseni).

**Kod düzeyinde kritik detaylar:**
- `Session.create({retrieve_player, generate_session_locally, fetch, cache, client_type})` + `new Innertube(session)` — FreeTube'un sarmaladığı desen. `fetch` enjekte edilebilir → bizim `net.fetch`/proxy katmanımıza oturur.
- **`Platform.shim.eval` köprüsü şart:** n-challenge/sig çözümü oyuncu JS'inin çalıştırılmasını ister; FreeTube bunu Electron'da **izole iframe + postMessage** ile yapıyor (CSP-güvenli alan). Node tarafında meriyah ayrıştırması yerine `eval` shim'in nerede koşacağı mimari karardır — bizde güvenli seçenek: ayrı partition'da `javascript:false` sandbox görünümü.
- Continuation serileştirme (`serializeContinuation` deseni) — sayfalı sonuçların main↔renderer taşınabilirliği.
- `enable_session_cache:false` + `generate_session_locally` — gizlilik ve hız dengesi.
- OAuth cihaz-kodu akışı destekli (mevcut çoklu-hesap altyapısıyla birleşir).
- **CJS notu:** `node` koşulu yalnız `import` — CJS main'den `await import('youtubei.js')` dinamik import gerekir (Node 22 bunu destekler); veya `web.bundle` tek dosyası.

**Fit:** `invidious*` IPC'lerinin arkasına sağlayıcı merdiveni (Invidious → yt-dlp-flat → youtubei). Açacağı yüzeyler: transcript, storyboard, kanal sekmeleri (Invidious `/channels/{id}/streams` yerine gerçek tab yapısı), yorum yanıtları, live chat, shorts filtresi, hesaplı "önerilmeyen" feedback token'ları.

**Riskler:** private API churn; 15.8MB paket; hesap/anon istek ayrımı; eval shim'in güvenli izolasyonu.

### 2. YouTube kanal RSS abonelikleri (FreeTube deseni, kod doğrulandı)

`FreeTube/src/renderer/helpers/subscriptions.js`: `feeds/videos.xml?channel_id=<id>` → `DOMParser` → `yt:videoId`/`title`/`published`/`media:statistics`. `isRSS` bayrağıyla premiere tespiti (`viewCount==='0'`).

**Fit:** R75'in "yerel abonelik boşluğu". **Ama main-process'te DOMParser yok** → `fast-xml-parser` (MIT, aktif) veya `rss-parser` (MIT) gerekir; ya da parse'ı renderer'a taşı. `subscriptions-io.js` OPML kanal listesi kaynak olur. Fan-out: kanal başına 1 istek — FreeTube bunu sınırlı paralellikle çözer.

### 3. Stremio OpenSubtitles-v3 genel uç noktası — CANLI DOĞRULANDI

`GET /subtitles/movie/tt0111161.json` → dil+`movieReleaseName`+`fpsMilli`+`releaseGroup`+UTF-8 indirme URL'leri (`subs5.strem.io/.../subencoding-stremio-utf8`). Seri: `/subtitles/series/<imdb>/<s>/<e>.json`, dil filtreli `/lang=` varyantı.

**Fit:** `browser-subtitle-search.js` sağlayıcı merdiveninin "anahtarsız" basamağı; `target.imdbId` girdisi eklenerek hem buraya hem OpenSubtitles `/subtitles?imdb_id=` sorgusuna temel olur (o parametre bugün kullanılmıyor).

### 4. Diaoul/subliminal — MIT · aktif · ~2,7k★

`src/subliminal/providers/`: **10 sağlayıcı** — opensubtitlescom, opensubtitles(legacy), podnapisi, tvsubtitles, addic7ed, gestdown, subtitulamos, subtis, bsplayer, napiprojekt + refiner'lar. Skor tabanlı seçim, `provider` bağımsız `list_subtitles`/`download_subtitle` API'si.

**Fit:** `backend/browser_align.py` deseninde tek-JSON/stdin backend modülü. Anahtarsız sağlayıcılar (gestdown/podnapisi/tvsubtitles/napiprojekt/bsplayer/subtis) ilk kazanım; kimlikliler ayrı yapılandırma. `subliminal` zaten `guessit`+`babelfish` kullanıyor — bu iki dep bizim catalog stack'inde kurulu → paylaşılan bağımlılık.

### 5. ffsubsync ses-referans modu — MIT · depo zaten kurulu

Mevcut `align()` yalnız `ref.srt -i target.srt --split-penalty 8` çalıştırıyor. Kullanılmayan mod: `ffsubsync <medya> -i subs.srt` → VAD (auditok+webrtcvad) ses-geçişi hizalaması. `ffsubsync.run(args, progress_handler)` kütüphane API'si NDJSON ilerlemesine maplenir.

**Fit:** İndirilen harici altyazının fps/sürüm uyumsuzluğunu otomatik düzeltme — `browser_align.py`'ye `{"audio":"<wav/medya>", "targetCues":[...]}` isteği. Ses zaten ffmpeg ile çıkarılabilir. Sıfır yeni bağımlılık.

### 6. Kalıcı cue/transkript deposu — seçenek karşılaştırması (derinleştirme)

| Seçenek | Lisans | Artı | Eksi |
|---|---|---|---|
| `better-sqlite3` | MIT | Senkron API, FTS5, olgun | Native rebuild (Electron ABI), `package:win` özel paketleyiciye `.node` dahil etme, main-process bloklama |
| `node:sqlite` | — | Sıfır dep | **Electron 43 → Node 22 → `--experimental-sqlite` bayrağı arkasında** (unflagged ≥23.4); güvenilmez |
| `sql.js` | MIT (LICENSE; GitHub "other" algılıyor) | WASM, sıfır native, renderer'da da koşar | Bellekte çalışır + `export()` ile diske yazma; büyük DB'de RAM maliyeti |
| `wa-sqlite` | MIT | OPFS VFS kalıcılığı, async | Async API; VFS katmanı ek yük |
| `Dexie` (IndexedDB) | Apache-2.0 | Bağımlılıksız kalıcı; renderer-native | FTS yok — MiniSearch ile eşleşir |
| `minisearch` | MIT | Saf JS FTS (fuzzy+prefix), küçük | Bellekte indeks; kalıcılık için serileştirme |
| `sqlite-vec` | Apache-2.0 | `better-sqlite3`/`wa-sqlite` ile **vektör arama** — mevcut MiniLM embedding'lerle semantik cue arama | Ek native/WASM yük |

**Karar:** Semantik arama zaten `sentence-transformers` backend'inde var → cue deposu için `better-sqlite3`+FTS5 (ana yol) veya `Dexie`+`minisearch` (sıfır-native yol). sqlite-vec iki dünyayı birleştirir.

### 7. Brainicism/bgutil-ytdlp-pot-provider — GPL-3.0 · koşullu

yt-dlp PO-token framework'üne lokal HTTP sidecar (FreeTube da `bgutils-js` kullanıyor — `local.js` import'unda görüldü). GPL ama **ayrı process/servis** olarak kalabilir → "opsiyonel harici araç" modeli (alass/PgsToSrt gibi). Lisans+güvenlik incelemesi şart; DRM değil erişim-kanıtı sınırında.

### 8. Vanilagy/mediabunny — MPL-2.0 · çok aktif · ~7,2k★ — **yeni**

Saf-TS medya toolkit: MP4/MKV/WEBM/OGG/WAV/MP3 **demux+mux+transcode** (WebCodecs), `Input`/`Output`, packet-level erişim, `Conversion` API. MPL-2.0 dosya-seviyeli copyleft → bağımlılık olarak kullanılabilir.

**Fit:** Yakalanan segmentleri tarayıcı-içi remux/inceleme (mux.js+mp4box'un modern halefi), indirilen webm→mp4 dönüşümü ffmpeg'e düşmeden, kırpma/çekirdek-anahtar düzeltme, canlı yakalama buffer'ından oynanabilir dosya üretme. Eski `ts-ebml` ihtiyacını da karşılar (ts-ebml lisanssız çıktı — elendi).

### 9. streamlink/streamlink — BSD-2 · aktif · ~11,8k★ — **yeni**

Canlı akış çözümleyici: yt-dlp'nin zayıf kaldığı **canlı** servislerde (Twitch vb.) doğrudan akış URL'si/FFmpeg stream'i çıkarır. Python kütüphanesi + CLI. **Fit:** canlı yakalama/izleme fallback'i — `streamlink --stream-url <url> best`. yt-dlp ile örtüşse de canlıda tamamlayıcı.

### 10. Web-scrobbler konnektör kataloğu — **MIT** · aktif · ~3k★ — **yeni, beklenmedik bulgu**

500+ site için "şu an ne oynuyor" konnektörleri (`src/connectors/*`): DOM-selector + MediaSession + musickit API'leriyle site başına metadata çıkarma kalıpları. MIT → kopyalanabilir.

**Fit:** `browser-media-identity.js` + `browser-adapters.js` — adapter'larımızın "kanonik kimlik" çıkarımını site-bazlı selector kataloğuyla besler (YouTube-dışı sitelerde başlık/sanatçı/süre). Scrobbler hedefi değil; **kimlik-çıkarım kalıpları** hedef.

---

## Interception derinliği — referans teknikler (kod kopyalanmaz, desen alınır)

| Repo | Lisans | Teknik | Bizdeki karşılık |
|---|---|---|---|
| `xifangczy/cat-catch` (22k★, aktif) | GPL-3.0 | **`SourceBuffer.prototype.appendBuffer` hook → MSE'den medya reconstrüksiyonu**; mime/manifest desen DB; "deep sniffing" | appendBuffer hook'umuz YOK — yt-dlp/URL-koklamasının çözemediği blob/MSE kaynaklarda son basamak. **Desen:** `addSourceBuffer` wrap → chunk'ları mime'a göre buffer'a biriktir → `endOfStream`'de blob indirme. Altyazı değil medya düzeyi; DRM'li akışta yalnız şifreli bayt gelir → sınırımızın içinde |
| `54ac/stream-detector` (MPL-2.0, archived 2023) | MPL | Protokol/manifest desen kataloğu (HLS/DASH/HDS/MSS uzantı+MIME+regex) | `browser-network-capture` URL-desen tablomuzun genişletme referansı (archived ama desen DB değerli) |
| `jpillora/xhook` | MIT | XHR/fetch intercept lib | **Gereksiz — kendi hook'larımız var** (XHR open/send + fetch, ~10795) |
| Subadub-tarzı eklentiler | çeşitli | `video.textTracks` + addcue + XHR patch ile altyazı dökümü | Hepsi mevcut (`browser-preload.js` gözlemci + XHR/fetch + CDP body) |
| `asbplayer` | AGPL-3.0 | Sayfa-içi altyazı enjeksiyonu + dual-sub render + crop-OCR akışı | UX referansı; mining tarafı kapsam dışı |
| YouTube live chat | — | WebSocket/fetch polling | WS capture yok → live chat istenirse `youtubei.js` `live_chat` yolu daha sağlam |

**Eklenen boşluk:** `Network.requestWillBeSent`'te `request.postData`/`Fetch` aşamasında `requestPostData` hiç okunmuyor → protobuf-POST manifest (Netflix-tarzı) isteyen servislerde manifest gövdesi görünmüyor. `Network.enable` çağrısına `maxPostDataSize` eklenmesi tek satırlık açılım (repo değil, mevcut kodun genişlemesi).

---

## KADEME B — Koşullu / orta

| Repo | Lisans | Ne verir | Not |
|---|---|---|---|
| `kepano/defuddle` | MIT · aktif | HTML→temiz içerik/**Markdown** çıkarımı (Obsidian Web Clipper motoru) | Okuma görünümü çıkarımına fallback; Markdown çıkışı research-notebook'a doğrudan akar |
| `mozilla/readability` | Apache-2.0 | Referans çıkarıcı | defuddle ile aynı rol; biri seçilir |
| `mixmark-io/turndown` | MIT | HTML→Markdown | Okuma/arşiv dışa aktarımında defuddle yerine küçük parça |
| `katspaugh/wavesurfer.js` | BSD-3 · aktif | Ses dalga formu + bölgeler | **Senkron düzenleyici UX'i**: cue'ları dalga formu üzerinde sürükle-ayarla; ffsubsync önizlemesinin görsel eşi |
| `alphacep/vosk-api` | Apache-2.0 | CPU'da streaming ASR (20+ dil, Türkçe dahil) | live_asr.py'nin GPU'suz alternatifi; whisper'tan hafif ama kalitesi düşük |
| `k2-fsa/sherpa-onnx` | Apache-2.0 | ONNX streaming ASR + dahili VAD | vosk'tan daha doğru modern modeller; onnxruntime zaten kurulu (browser-tools) |
| `jitsi/rnnoise-wasm` | Apache-2.0 | WASM gürültü bastırma | Live PCM parçalarını whisper'a vermeden önce temizleme — worklet'e takılır |
| `moonshine-ai/moonshine` | "other" ⚠ | Ultra-düşük-latency STT | Lisans dosyası GitHub'da karışık raporlanıyor — önce LICENSE teyidi |
| `kha-white/manga-ocr` | Apache-2.0 | Japonca manga OCR (transformer) | Manga akışımız LLM-vizyon; Japonca özelinde ucuz hızlı alternatif motor |
| `jianfch/stable-ts` | MIT ama **archived** | Whisper segment sonrası iyileştirme/regroup | Arşivlenmiş — bağımlılık değil algoritma referansı (halüsinasyon/bölme politikaları) |
| `nilaoda/N_m3u8DL-RE` | **MIT** · aktif | Güçlü HLS/DASH/ISM indirici, canlı DVR kayıt | **Harici Windows binary** — yakalanan manifestleri "derin indir" kuyruğuna göndermede ffmpeg'den güçlü (multi-period, canlı kayıt). Şifreleme anahtarı yolları kullanılmaz — sınırımız içi |
| `yt-dlp/ejs` | Unlicense | yt-dlp EJS runtime'ının resmi kaynağı | Zaten `yt-dlp[default]` ile geliyor — bilgi/envanter notu |
| `johnfactotum/foliate-js` | MIT | EPUB/CBZ/FB2/MOBI render | Reading-list/reader'a "yerel e-kitap aç" yüzeyi — sayfalık/konum kalıcılığı dahili |
| `wooorm/franc` | MIT | Metin dili tespiti (saf JS) | Dil-etiketi-eksik yakalanan cue'lara otomatik dil tahmini; sayfa-çevirisi kaynak-dil sezgisi |
| `NaturalIntelligence/fast-xml-parser` | MIT | main-process XML/RSS parse | RSS abonelik maddesinin main-tarafı çözümü (DOMParser orada yok) |
| `gsantiago/subtitle.js` (`subtitle`) | MIT | SRT/VTT/ASS/SCC/TTML parse+compose | Parser tutarlılık katmanı; mevcut parser'larımızın karşı-örnek testleri için de değerli |
| `nextapps-de/flexsearch` | Apache-2.0 | JS FTS (MiniSearch alternatifi) | Cue/arama; biri seçilir |
| `lucaong/minisearch` | MIT | JS FTS | Bkz. depo tablosu §6 |
| `rhashimoto/wa-sqlite` · `sql-js/sql.js` | MIT | WASM SQLite | Bkz. §6 |
| `asg017/sqlite-vec` | Apache-2.0 | sqlite vektör arama | Bkz. §6 — MiniLM vektörleriyle cue semantik arama |
| `dexie/Dexie.js` | Apache-2.0 | IndexedDB sarmalayıcı | Renderer-taraflı kalıcı depo alternatifi |
| `sindresorhus/p-queue` + `p-retry` | MIT | Sınırlı paralellik + retry | Yakalama/kurtarma döngülerinde el-yapımı throttling yerine standart |
| `sindresorhus/file-type` | MIT | Magic-byte format tespiti | İndirilen/yakalanan blob'un gerçek tipi (`.bin` gelen `.vtt` vakaları) — manga'da el-yapımı benzeri var, genelleştirilebilir |
| `medialize/URI.js` değil → `remusao/tldts` | MIT | eTLD+1 site anahtarı | site-profiles/permissions/adapter host-eşleme doğruluğu |
| `floating-ui/floating-ui` | MIT | Popup/tooltip konumlandırma | ⋯ menüler, altyazı seçici, overlay konumlarının kenar-durum sağlamlığı |
| `focus-trap/focus-trap` | MIT | Modal focus tuzağı | a11y: modal/diyaloglar (axe-core testleriyle birlikte) |
| `paulmillr/chokidar` | MIT | Klasör izleme | Catalog klasörlerinin otomatik yeniden taraması (`catalog_scan` bugün manuel tetikli görünüyor) |
| `codemirror/dev` | MIT | Metin editörü | Cue düzenleyiciye gerçek editör (undo/redo geçmişi dahili) — güçlü kullanıcı senaryosu |
| `markedjs/marked` | MIT | Markdown render | research-notebook/çeviri-arsivi önizlemesi |
| `buzz/mediainfo.js` | BSD-2 | WASM MediaInfo | Renderer-içi hızlı track/codec probe — ffprobe'u ayağa kaldırmadan |
| `megahertz/electron-log` | MIT | Rotating log | Mevcut tanılama geniş — marjinal |
| `domenic`/`autolinker` | MIT | URL'leri linkleme | Reader/çeviri çıktılarında URL tıklanabilirliği (FreeTube da kullanıyor) |
| `YuJianrong` rar/zip araçları / `fflate` | MIT/— | Altyazı arşivi açma | `.rar`/`.zip` gelen sağlayıcı indirmeleri; fflate zaten youtubei.js dep'i olacak |
| `iconv-lite` + `jschardet` | MIT / LGPL-2.1 | Legacy encoding decode | **Türkçe cp1254 zaten özel mantıkla çözülü**; kalan açık: cp1251/1250 (Slav/Balkan), Big5, EUC-JP, GB2312 — subliminal sağlayıcılarında sık |
| `xqq/mpegts.js` | Apache-2.0 | FLV/TS MSE oynatma | Twitch-tarzı sitelerde hls.js dışı boşluk — fixture'a bağlı |
| `videojs/m3u8-parser` + `mpd-parser` | Apache-2.0 | Manifest ayrıştırma sağlamlığı | Mevcut parser'larda edge-case fixture'ı görülürse |
| `aniskip` genel API (`api.aniskip.com`) | servis | Anime OP/ED atlama zamanları | SponsorBlock'un yanına ikinci segment kaynağı; anime ağırlıklı kullanıcıda değerli — endpoint doğrulaması yapılmalı (v2 sorgum 404 döndü, şema araştırılacak) |
| `returnyoutubedislikeapi.com` | servis (kod GPL-3.0) | Dislike sayısı | R75 eksik listesi; tek GET `votes?videoId=` — minik istemci |
| PeerTube REST API | servis | `/api/v1/videos/{id}/captions` açık altyazı listesi | Adapter registry'ye ucuz yeni servis — joinpeertube instance listesi |

---

## KADEME C — Yalnız referans / harici araç rafı

| Repo | Lisans | Kullanım |
|---|---|---|
| `FreeTubeApp/FreeTube` | AGPL-3.0 | RSS subs + youtubei.js entegrasyon deseni (yukarıda çıkarıldı), distraction toggles |
| `TeamPiped/Piped` | AGPL-3.0 | Genel API = Invidious'a ikinci instance sınıfı — **bugün `pipedapi.kavin.rocks/trending` 502 döndü**; kararsızlık kanıtıyla birlikte değerlendir |
| `ViewTube/viewtube` | AGPL-3.0 | Invidious'suz doğrudan-scrape YouTube istemcisi mimarisi |
| `ajayyy/DeArrow` | GPL-3.0 | `/api/branding` genel API'sine kendi istemcimiz; `DeArrowBrowser` ayna |
| `Anarios/return-youtube-dislike` | GPL-3.0 | API-only (yukarıda) |
| `asbplayer/asbplayer` | AGPL-3.0 | Altyazı-overlay/mining UX referansı; mining kapsam dışı |
| `immersive-translate` | AGPL-3.0 | Bilingual sayfa-çevirisi UX'i (bizim `browser-page-translate` referansı) |
| `LibreTranslate/LibreTranslate` | AGPL-3.0 | Kendi-host'lanabilir Argos MT API — çeviri ladder'ına self-host basamağı |
| `DIYgod/RSSHub` | AGPL-3.0 | YouTube-dışı siteler için genel RSS üreteci (self-host/public) — feed katmanının uzak akrabası |
| `minbrowser/min` | Apache-2.0 | Sekme/gizlilik mimarisi referansı |
| `imputnet/cobalt` | AGPL-3.0 | İndirme UX'i — yt-dlp'miz üstün |
| `Bazarr` (morpheus65535) | GPL-3.0 | Subliminal tabanlı sağlayıcı-merdiveni UI/UX referansı (dil profilleri, zorunlu/isteğe bağlı skorları) |
| `Aegisub` | BSD/MIT karışımı | Altyazı zamanlama/düzenleme araç seti referansı (audio display, kanji-timing) — wavesurfer'la aynı boşluk |
| `CCExtractor/ccextractor` | GPL-2.0 harici binary | TS/DVB/teletext çıkarımı — mevcut CEA modüllerinin üstü |
| `Tentacule/PgsToSrt` | AGPL harici binary | PGS→SRT |
| `kaegi/alass` | GPL-3.0 (2019 binary) | Referans-altyazı hizalama alternatifi/benchmark |
| `YaoFANGUK/video-subtitle-extractor` | Apache-2.0 | Tam-video hardsub→SRT; mevcut rapidocr ≤60sn'nin ötesi — ağır/deneysel |
| `manga-image-translator` | GPL-3.0 | Manga pipeline referansı/opsiyonel harici |
| `electron-chrome-extensions` | **GPL/ücretli-patron çift lisans** | MIT ürüne linklenemez — Chrome-extension desteği ancak ayrı lisans stratejisiyle |
| `castv2-client`/`node-ssdp` | MIT ama 2021'den beri durgun | Chromecast/DLNA gönderme — niche, eski kod |
| `edge-tts` (`rany2`) | Lisans belirsiz (GitHub "other") + servis ToS | Altyazı→seslendirme fikri varsa önce lisans+ToS teyidi |
| `iptv-org/iptv` | liste lisansı karışık | Kamu/ücretsiz IPTV akış indeksi — yasal gözden geçirme şart, deneysel raf |

---

## Reddedilenler / gereksiz çıkanlar (bu turun düzeltmeleri)

- `electron-context-menu` — **webview bağlam menüsü zaten var** (`main.js:5206`)
- `jpillora/xhook` — kendi XHR/fetch hook'larımız daha ileride
- `node:sqlite` — Electron 43/Node 22'de `--experimental-sqlite` bayrağı arkasında; güvenilmez yol
- `legokichi/ts-ebml` — **lisansı yok** (`license: null`); webm onarımı ihtiyacı mediabunny ile karşılanır
- `mikesteele/dual-captions` — MIT ama 2022 archived; dual-sub zaten üründe
- `naudiodon` sistem loopback — `getDisplayMedia` loopback zaten çalışıyor
- `iconv-lite` (tek başına) — cp1254 Türkçe patika mevcut; yalnız non-TR legacy seti için değerli
- `savePage`/MHTML depoları — `webContents.savePage` zaten kullanılıyor
- `stable-ts` — archived; bağımlılık değil referans
- Dil-öğrenme repo'ları (yomitan vb.) — kapsam dışı
- `shaka-player`/`dash.js`/`Vidstack`/`media-chrome` — özel oynatıcı yeterli
- `transformers.js` çeviri — argos/deep-translator daha hafif
- `tesseract.js` — rapidocr backend üstün

---

## Güncel öncelik matrisi

| Aday | Browser faydası | Efor | Lisans | Bakım | Öncelik |
|---|---|---|---|---|---|
| youtubei.js sağlayıcı katmanı | Çok yüksek | Orta-Yüksek | MIT ✓ | Aktif | **1** |
| Kanal RSS subs (fast-xml-parser ile) | Yüksek | Düşük | MIT ✓ | Aktif | **2** |
| Stremio OS-v3 + `imdb_id` desteği | Yüksek | Düşük | API | Aktif | **3** |
| subliminal backend modülü | Yüksek | Orta | MIT ✓ | Aktif | **4** |
| ffsubsync ses modu | Yüksek | Düşük | MIT ✓ (kurulu) | Aktif | **5** |
| mediabunny remux/onarım | Orta-Yüksek | Orta | MPL-2.0 ✓ | Çok aktif | **6** |
| `requestPostData` + MSE-appendBuffer hook genişlemesi | Yüksek ama ince iş | Orta | — (kendi kodumuz; cat-catch GPL desen) | — | **7** |
| bgutil POT sidecar | Orta-Yüksek | Orta | GPL ⚠ ayrı-process | Aktif | **8** |
| Depo seçimi: better-sqlite3+FTS5+sqlite-vec vs Dexie+minisearch | Orta | Yüksek | ✓ | Aktif | **9** |
| DeArrow + RYD + aniskip istemcileri | Orta | Düşük | API-only | Aktif | **10** |
| wavesurfer senkron editörü | Orta | Orta | BSD-3 ✓ | Aktif | **11** |
| streamlink canlı fallback | Orta | Düşük | BSD-2 ✓ | Aktif | **12** |
| web-scrobbler konnektör deseni | Orta | Orta | MIT ✓ | Aktif | **13** |
| defuddle/turndown reader sağlamlaştırma | Orta | Düşük-Orta | MIT/Apache ✓ | Aktif | **14** |
| N_m3u8DL-RE harici indirici | Orta | Düşük | MIT (harici) | Aktif | **15** |
| sherpa-onnx/vosk/rnnoise CPU-ASR rafı | Orta | Orta | Apache ✓ | Aktif | **16** |
| foliate-js e-kitap | Düşük-Orta | Orta | MIT ✓ | Aktif | **17** |
| franc, tldts, floating-ui, focus-trap, p-queue, file-type, fflate, iconv-lite, minisearch, marked, autolinker, subtitle.js, electron-log | Küçük cilalar | Düşük | ✓ | Aktif | Paket halinde |
| manga-ocr, mediainfo.js, chokidar, CodeMirror, argos/LibreTranslate/deep-translator/lingva | Koşullu | Değişken | ✓/⚠ | Karışık | İhtiyaç bazlı |

---

## Etap planı (güncel)

1. **Etap 1 — hızlı kazanım:** RSS subs, Stremio sağlayıcısı + `imdb_id` parametresi, ffsubsync ses modu, DeArrow/RYD minik istemcileri.
2. **Etap 2 — veri katmanı:** youtubei.js (anon → hesaplı; `Platform.shim.eval` izolasyon tasarımı ilk iş), Piped ikinci-instance eklentisi, `requestPostData` açılımı.
3. **Etap 3 — altyazı arzı+onarım:** subliminal modülü + merdiven UI, iconv-lite legacy-encoding seti, fflate arşiv açma, mediabunny remux pilotu.
4. **Etap 4 — derin yakalama:** MSE `appendBuffer` reconstrüksiyonu (cat-catch deseni, kendi kodumuz), WebSocket gözlemi (live chat zemini), stream-detector desen DB'siyle URL kataloğu genişletme.
5. **Etap 5 — mimari:** cue deposu (sqlite/FTS5 veya Dexie+MiniSearch kararını fixture performansıyla), sqlite-vec semantik arama, PySceneDetect sahne-bölüm köprüsü, bgutil sidecar (lisans incelemesi sonrası).

**Sınırlar:** Ürün kodu değişmedi; canlı testler yalnız listelenen endpoint'lere yapıldı; hiçbir dış repo tüm sitelerde çalışır varsayılmadı; GPL/AGPL adaylar desen/API/harici-araç olarak işaretlendi; DRM/CDM atlatma yolları kapsam dışı ve öneri değil.
