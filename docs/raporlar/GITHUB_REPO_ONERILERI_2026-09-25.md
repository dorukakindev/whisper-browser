# GITHUB REPO ÖNERİLERİ 2026-09-25 — Browser tarafına doğrudan faydalı depolar

**Tarih:** 2026-09-25 · **Tür:** Araştırma (kod değişikliği YOK) · **Kapsam:** Gömülü browser / SmartTube / altyazı yakalama-senkron-çeviri tarafına eklenebilecek GitHub depoları ve kütüphaneleri

Bu rapor `docs/GITHUB_BENZER_PROJELER_STRATEJI_RAPORU_2026-09-01.md` (180 repo, özellik-strateji ağırlıklı) ve `docs/raporlar/BROWSER_FEATURE_RESEARCH_75.md` (12 repo, özellik envanteri) çalışmalarını **tekrar etmeden**, yalnızca **kaynak kodu incelenmiş ve entegrasyon yüzeyi doğrulanmış** adayları listeler. GitHub metadata (yıldız/son push/lisans) 2026-09-25 anlık kanıtıdır; kalite kanıtı değildir. Her adayda gerçek dosya/endpoint/paket yüzeyi referans verilmiştir.

**Doğrulanmış mevcut envanter (tekrar öneri yapılmaması için):**
- Altyazı sağlayıcısı: **yalnız** OpenSubtitles REST v1 (`src/browser-subtitle-search.js`, `api.opensubtitles.com`, API anahtarı zorunlu — `MISSING_API_KEY`)
- Hizalama: `ffsubsync==0.5.1` **zaten kurulu** ama yalnız *altyazı↔altyazı parçalı eşleme* modunda (`backend/browser_align.py`, `--split-penalty 8`); **ses/VAD-referans modu kullanılmıyor**
- Kare OCR: `rapidocr-onnxruntime` kurulu — tek kare + ≤60 sn/120 kare bölge OCR (`browser_media_tools.py`, `browser_video_analysis.py`)
- Dosya-adı metadata: `guessit` kurulu (`backend/catalog_scan.py`)
- Semantik arama: `sentence-transformers` MiniLM kurulu (`browser_media_tools.py`)
- YouTube veri katmanı: Invidious REST (`backend/invidious.py`: probe, feed_popular/trending/home/subscriptions, search, channel, comments+continuation, playlist, suggest[A23]) + TVHTML5 InnerTube OAuth çoklu hesap + response pruning. **Yerel abonelik / DeArrow / transcript / storyboard / live chat / kanal sekmeleri / yorum yanıtı: yok** (R75 envanteri)
- yt-dlp: `js_runtimes: {"node": {}}` + opsiyonel browser cookies + yerel ffmpeg (PO-token sağlayıcısı yok)
- SponsorBlock hash-prefix tüketimi mevcut (`browser-sponsorblock.js`); DeArrow yok
- Okuma görünümü: kendi skorlama + güvenli DOM inşası (createElement/textContent — DOMPurify gereksizliği doğrulandı)
- HLS/DASH/WebVTT/TTML/IMSC, CEA-608/708, live PCM→Whisper fallback, sayfa çevirisi, oturum deposu v8 mevcut

---

## KADEME A — Doğrudan entegrasyon adayları

### 1. LuanRT/YouTube.js (`youtubei.js`) — MIT · aktif · ~5,3k★

**İncelenen yüzey:** `package.json` (v18.1.0, ESM, `node`/`web`/`deno`/`browser` export koşulları, 3 runtime bağımlılığı: `@bufbuild/protobuf`, `fflate`, `meriyah`), README, FreeTube'un `local.js` sarmalayıcısı.

**Kod düzeyinde bulgular:**
- Tipik InnerTube istemcisi: `Innertube.create()` → `search()`, `getSearchSuggestions()`, `getHomeFeed()`, `getChannel()` (sekmeler dahil), `getPlaylist()`, `getInfo()` (caption track'ler, storyboard'lar, formatlar), `getComments()` + continuation, `getTranscript()`, `live_chat`, müzik/guide feed'leri.
- **`meriyah` bağımlılığı kritik:** `getInfo()` stream URL'lerini ve `n`-challenge'ı harici runtime gerektirmeden, oyuncu JS'ini içeride ayrıştırarak çözer. yt-dlp'nin `js_runtimes.node` ihtiyacına denk işi JS içinde yapar.
- OAuth cihaz-kodu akışı destekli — mevcut YouTube OAuth altyapımızla (`youtubeAuth` slotları) uyumlu.

**Bizdeki fit:** `invidious*` IPC'lerinin arkasına ikinci veri sağlayıcısı. Invidious instance kopması/limitinde (sık görülen kırılma) SmartTube bölümleri çalışmaya devam eder; ayrıca Invidious'un hiç vermediği yüzeyleri açar: transcript, storyboard, kanal sekmeleri, yorum yanıtları, live chat, "ilgisiz değilim" feedback token'ları.

**Riskler:** resmi olmayan API — YouTube değişikliklerinde kırılma penceresi; ESM paket (CJS main'den `await import('youtubei.js')` veya backend köprüsü); hesaplı/anon istek ayrımı titizlik ister; ~birkaç MB dist boyutu.

**Karar:** Birincil aday. "Veri sağlayıcısı merdiveni" (Invidious → youtubei.js → RSS) olarak etap etap entegre edilmeli; önce **salt-okur feed/search/suggest fallback'i** olarak, hesap işlemleri sonraya.

---

### 2. YouTube kanal RSS beslemeleri (FreeTube deseni) — kod doğrulandı

**İncelenen yüzey:** `FreeTubeApp/FreeTube` → `src/renderer/helpers/subscriptions.js` `parseYouTubeRSSFeed()` + `parseRSSEntry()`.

**Kod düzeyinde bulgular:** `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` uç noktası anahtarsız/instance'sız çalışır; yanıtı `DOMParser` ile ayrıştırıp `yt:videoId`, `title`, `published`, `media:statistics views` alır. FreeTube RSS premieres'i `viewCount==='0'` kontrolüyle eler (`isRSS` bayrağı).

**Bizdeki fit:** R75'te "yerel abonelik fallback'i önemli boşluk" olarak işaretlenen açığı kapatır — Subscriptions bölümü Invidious oturumu olmadan da kanal listesinden feed üretebilir. `subscriptions-io.js` OPML içe/dışa aktarımı zaten var; kanal id listesi besleme kaynağı olur.

**Riskler:** RSS'te süre (`lengthSeconds:"0:00"`) ve thumb detayı sınırlı — kart için ikinci istek gerekebilir; yüzlerce abonelikte istek fan-out'u (FreeTube bunu paralel sınırlayarak çözüyor).

**Karar:** En düşük maliyetli yüksek-etki madde. Ek bağımlılık gerektirmez (DOMParser yeterli; istenirse `rss-parser` MIT).

---

### 3. Diaoul/subliminal — MIT · aktif · ~2,7k★

**İncelenen yüzey:** repo ağacı `src/subliminal/providers/` — 10 sağlayıcı modülü doğrulandı: `opensubtitlescom`, `opensubtitles` (legacy), `podnapisi`, `tvsubtitles`, `addic7ed`, `gestdown`, `subtitulamos`, `subtis`, `bsplayer`, `napiprojekt`; artı `refiner`'lar ve skor tabanlı en-iyi-seçim.

**Bizdeki fit:** `browser-subtitle-search.js` tek sağlayıcılı + API anahtarı zorunlu. subliminal ile `backend/browser_align.py` deseninde tek-JSON/stdin modülü: girdi `{title, imdbId, season, episode, langs, providers}`, çıktı aday listesi + indirme. OpenSubtitles-anahtarsız kullanıcılar için gestdown/podnapisi/tvsubtitles gibi anahtarsız sağlayıcılar ilk kazanım.

**Riskler:** sağlayıcı kırılganlığı (addic7ed scraping tabanlı), bazı sağlayıcılar kimlik ister, rate-limit/ToS ayrı yönetilmeli; skorlayıcı bizim `movieReleaseName`/fps eşleşmemizden farklı önceliklendirir.

**Karar:** Sağlayıcı merdiveninin ana genişlemesi. Kimliksiz sağlayıcılarla başla; kimlikli sağlayıcıları ayrı yapılandırma sayfasına.

---

### 4. Stremio OpenSubtitles-v3 genel uç noktası — CANLI DOĞRULANDI

**İncelenen yüzey:** `GET https://opensubtitles-v3.strem.io/subtitles/movie/tt0111161.json` — gerçek HTTP çağrısıyla doğrulandı. Yanıt: dil alanlı (`eng/tur/por/...`), `movieReleaseName`, `fpsMilli`, `releaseGroup`, doğrudan UTF-8 normalize edilmiş indirme URL'leri (`subs5.strem.io/.../subencoding-stremio-utf8/...`). Seri için `/subtitles/series/<imdb>/<sezon>/<bölüm>.json` deseni.

**Bizdeki fit:** IMDB id'si bilinen browser içeriği (SmartTube değil; catalog/Plex-benzeri sayfalar ve "altyazı getir" akışı) için **sıfır-anahtar fallback**. OpenSubtitles REST üyelik kotasına takılan kullanıcıya ilk gün değeri.

**Riskler:** anahtarsız → ToS/rate-limit belirsiz; eşleşme IMDB-bazlı (IMDB'siz içerikte devre dışı); stremio altyapısına bağımlılık.

**Karar:** Küçük bir provider modülüyle hemen denenebilir; subliminal ile çakışmaz (bu, o merdivenin "anahtarsız" basamağıdır).

---

### 5. smacke/ffsubsync ses-referans modu — MIT · depo zaten kurulu

**İncelenen yüzey:** README + `requirements.txt` (`auditok==0.1.5`, `webrtcvad-wheels`, `srt`, `pysubs2`, `ffmpeg-python`, `charset_normalizer`) + bizim `backend/browser_align.py`.

**Kod düzeyinde bulgular:** Mevcut entegrasyon yalnız `ref.srt -i target.srt` (altyazı↔altyazı). Kullanılmayan mod: `ffsubsync video.mkv -i subs.srt` — VAD tabanlı ses-geçişi hizalaması; `--no-fix-framerate`, çok-segmentli senkron, kodlama çıkarımı, `progress_handler` ile kütüphane modu.

**Bizdeki fit:** Yakalanan/araçtan gelen altyazılar için "sesine göre hizala" — özellikle yanlış fps'li veya sürüm-uymazlıklı indirilen altyazılarda (browser'da indirilen + yerel). Live-PCM hattındaki sesle eşleme bile düşünülebilir.

**Riskler:** ses çıkarımı ffmpeg süresi kadar maliyetli (bounded clip ile sınırlanmalı); uzun içerikte bellek; `webrtcvad` hassasiyeti gürültülü seste sapıtabilir.

**Karar:** Sıfır yeni bağımlılıkla açılacak ikinci mod — mevcut `browser_align.py` yanına `audio_align` isteği. Uygulaması küçük, değeri yüksek.

---

### 6. WiseLibs/better-sqlite3 — MIT · aktif · ~7,5k★

**Bizdeki fit:** Eylül strateji raporunun "kalıcı web-cue deposu + FTS arama" maddesi. `browser-session-store.js` v8 halen JSON dosyası; subtitle edits (2000 kayıt sınırı), sync records, yakalanan cue'lar ve transkriptler FTS5 ile aranabilir hale gelir → "izlediğim herhangi bir şeyde şu cümle geçti mi" sorgusu.

**Riskler:** native addon — Electron ABI için `electron-rebuild`/prebuild; Windows package akışına DLL dahil edilmeli; büyük import'ta main-process bloklama (worker'a taşımak gerekir); şema migrasyon disiplini.

**Karar:** Mimari iş — küçük PR değil. Önce depo sözleşmesi (tablolar, migration, backup) tasarlanıp ayrı kademe olarak.

---

### 7. Brainicism/bgutil-ytdlp-pot-provider — GPL-3.0 · aktif · ~800★

**Bizdeki fit:** yt-dlp YouTube çıkarımının güncel kırılma noktası PO-token; biz zaten `js_runtimes: {"node": {}}` kullanıyoruz — bu sağlayıcı lokal HTTP sidecar olarak PO-token üretir ve indirme başarısını belirgin artırır.

**Riskler:** GPL-3.0 (yt-dlp plugin'ı olarak **ayrı process/servis** çalışır → dağıtımda ayrık araç olarak sunulabilir, ürün koduna linklenmez; yine de lisans incelemesi şart); lokal port/process yaşam döngüsü; token sağlayıcının davranışı "yetkili erişim/DRM-bypass yok" sınırlarımız içinde tutulmalı — PO-token erişim kanıtıdır, DRM çözümü değildir.

**Karar:** Operasyonel değeri yüksek ama lisans+güvenlik incelemesi ayrı yapılmalı. Koşullu.

---

## KADEME B — Koşullu / orta öncelik

| # | Repo | Lisans | Ne verir | Neden B |
|---|---|---|---|---|
| 8 | `mozilla/readability` veya `p0n1k/defuddle` | Apache-2.0 / MIT | Okuma görünümü çıkarımında fallback parser; defuddle figür/kod/tablo temizliği daha iyi | Mevcut scorer çalışıyor; ancak fixture'da kırılma görülürse değerli. Kod sanitizer değil — mevcut DOM inşasımız zaten güvenli |
| 9 | `argosopentech/argos-translate` | MIT · aktif | Tamamen çevrimdışı çeviri motoru (CTranslate2 tabanlı — halihazırda kurulu stack!) | Model paket yönetimi + kalite LLM'in altında; "çevrimdışı mod" katmanı olarak uzun vade |
| 10 | `nidhaloff/deep-translator` | Apache-2.0 · 2024'te durgun | GoogleTranslator/MyMemory/Pons gibi anahtarsız çeviri sağlayıcıları | Bakım sinyali zayıf; sağlayıcı başına doğrulama şart — "no-key tier" olarak sınırlı rol |
| 11 | Lingva genel instanceları | AGPL frontend (API kullanımı serbest) | `GET /api/v1/{src}/{tgt}/{q}` tek satırlık çeviri proxy'si | Invidious-benzeri instance kararsızlığı; anahtarsız tier'a eklenebilir |
| 12 | `xqq/mpegts.js` | Apache-2.0 · aktif | FLV/MPEG-TS MSE oynatma (Twitch-tarzı canlı siteler) | hls.js+Chromium çoğunu kapsıyor; somut desteklenmeyen-stream fixture'ı görülürse |
| 13 | `videojs/m3u8-parser` + `mpd-parser` | Apache-2.0 | Manifest ayrıştırma sağlamlığı (diagnostik/edge-case) | Mevcut parser'lar kapsamlı; yalnız hata fixture'ı varsa |
| 14 | `Breakthrough/PySceneDetect` | BSD-3 | Sahne-kesit tespiti → bölüm üretimi + AI bağlam pencereleri | `browser_video_analysis.py` yanında; "sahne" = AI bağlamının doğal sınırı — değerli ama ikincil |
| 15 | `k2-fsa/sherpa-onnx` | Apache-2.0 | CPU'da streaming ASR + dahili VAD | live_asr.py var; GPU'yu whisper transkripsiyonuna bırakmak isteyenler için opsiyonel motor |
| 16 | `megahertz/electron-log` | MIT | Rotating dosya logu | Mevcut tanı/export altyapısı geniş; marjinal |
| 17 | `sindresorhus/electron-context-menu` | MIT | webview sağ-tık menüsü (geri/kopyala/resim-kaydet) | Küçük UX cilası; sekme/webview'da halen bağlam menüsü yok |
| 18 | `remusao/tldts` | MIT | eTLD+1 doğru site-anahtarı | `browser-site-profiles`/permissions/adapter host-eşleme hassasiyeti için |
| 19 | `farzher/fuzzysort` | MIT | Omnibox/komut-palet/altyazı-içi-arama için hızlı fuzzy match | UX cilası |
| 20 | `buzz/mediainfo.js` | BSD-2 | WASM MediaInfo — renderer'da codec/track probe | ffprobe zaten var; ~20MB WASM — düşük |
| 21 | `CCExtractor/ccextractor` | GPL-2.0 **harici binary** | DVR/yayın TS kayıtlarından EIA-608/708/teletext çıkarımı | CEA modüllerimiz HLS/MP4 in-band'i kapsıyor; TS/dvr fixture'ı gelirse opsiyonel araç |
| 22 | `Tentacule/PgsToSrt` | AGPL **harici binary** | PGS(Bluray)→SRT | Opsiyonel araç; tesseract tabanlı |
| 23 | `kaegi/alass` | GPL-3.0, son release 2019 (win64 zip mevcut) | Referans-altyazı hizalama alternatifi — daha hızlı, split-aware | ffsubsync'in referans modu zaten kurulu; yalnız kıyas/benchmark için |
| 24 | `YaoFANGUK/video-subtitle-extractor` | Apache-2.0 · aktif | Uzun videoda hardsub→SRT (DR + OCR) | Mevcut rapidocr zaten bölge-seçimli ≤60sn OCR yapıyor; VSE tam-video batch için — ağır, deneysel/uzun vade |

---

## KADEME C — Yalnız referans (lisans veya mimari nedeniyle kod taşınmaz)

| Repo | Lisans | Alınacak fikir |
|---|---|---|
| `FreeTubeApp/FreeTube` | AGPL-3.0 | RSS abonelik deseni (yukarıda çıkarıldı), yerel-geçmiş önceliği, distraction-free toggles |
| `TeamPiped/Piped` | AGPL-3.0 | Genel API'si Invidious'a **ikinci instance fallback** olabilir (kod değil, endpoint); instance kararsızlığı aynı |
| `ajayyy/DeArrow` | GPL-3.0 | `GET /api/branding?videoID=` + `/api/branding/:sha256prefix` genel API — SponsorBlock'un yanına küçük **kendi** istemcimiz; sunucu emülasyonu `mini-bomba/DeArrowBrowser` ayna olarak kullanılabilir |
| `samuelmaddock/electron-chrome-extensions` | GPL/ücretli-patron **çift lisans** | Chrome extension desteği MIT ürüne **linklenemez**; istenirse ayrı lisans değerlendirmesi veya gereken API yüzeyinin ince reimplementasyonu |
| `minbrowser/min` | Apache-2.0 | Sekme/gizlilik UX mimarisi referansı |
| `imputnet/cobalt` | AGPL-3.0 | İndirme UX'i; yt-dlp'miz zaten üstün |
| `manga-image-translator` | GPL-3.0 | Manga OCR/çeviri pipeline fikirleri; mevcut LLM-vizyon akışımız var — opsiyonel harici araç |

**Reddedilenler:** dil-öğrenme repo'ları (kapsam dışı — ürün İngilizce öğrenme uygulaması değil), `shaka-player`/`dash.js` (uygulama-içi DASH oynatma ihtiyacı kanıtlanmadıkça gereksiz ağırlık), `transformers.js` ile çeviri (argos/deep-translator daha hafif başlangıç), DualSub/Substital klonları (örnek repo bulunamadı; "lokal .srt enjeksiyonu" deseni üründe zaten var — `web-*.srt` deposu).

---

## Öncelik matrisi

| Aday | Browser faydası | Efor | Lisans | Bakım | Windows/Electron riski | Runtime riski | Öncelik |
|---|---|---|---|---|---|---|---|
| YouTube.js | Çok yüksek (veri katmanı + yeni yüzeyler) | Orta-Yüksek | MIT ✓ | Aktif | Düşük (ESM köprüsü) | Orta (private API churn) | **1** |
| Kanal RSS subs | Yüksek (yerel abonelik boşluğu) | Düşük | — (desen) | — | Yok | Yok | **2** |
| Stremio OS-v3 endpoint | Yüksek (anahtarsız altyazı) | Düşük | — (API) | Aktif servis | Yok | Düşük (ToS belirsiz) | **3** |
| subliminal | Yüksek (10 sağlayıcı) | Orta | MIT ✓ | Aktif | Düşük (pure py) | Orta (sağlayıcı kırılganlığı) | **4** |
| ffsubsync ses modu | Yüksek (auto-sync) | Düşük | MIT ✓ (kurulu) | Aktif | Yok | Düşük | **5** |
| bgutil POT provider | Orta-Yüksek (yt-dlp dayanıklılığı) | Orta | GPL-3.0 ⚠ | Aktif | Orta (sidecar süreci) | Orta (lisans+güvenlik incelemesi) | **6** |
| better-sqlite3 FTS | Orta (kalıcı arama) | Yüksek | MIT ✓ | Aktif | Orta (native rebuild/paketleme) | Düşük | **7** |
| DeArrow API | Orta (metadata kalitesi) | Düşük | GPL kod ⚠ / API serbest | Aktif | Yok | Düşük | **8** |
| PySceneDetect | Orta (bölüm/AI bağlam) | Orta | BSD-3 ✓ | Aktif | Düşük | Düşük | **9** |
| deep-translator / Lingva / argos | Orta (anahtarsız-çevrimdışı tier) | Orta | Apache/AGPL-api/MIT | Karışık | Düşük-Orta | Orta | **10-12** |
| mpegts.js, m3u8-parser, mediainfo.js, electron-log, context-menu, tldts, fuzzysort, sherpa-onnx, readability/defuddle | Koşullu | Değişken | ✓ çoğu | Aktif | Değişken | Düşük | Fixture-ihtiyacına bağlı |
| ccextractor, PgsToSrt, VSE, alass | Niche | Orta | GPL/AGPL harici | Karışık | Orta | Düşük | Opsiyonel araç rafı |

---

## Önerilen etap planı

1. **Etap 1 (hızlı kazanım, küçük PR'lar):** kanal-RSS abonelik fallback'i; Stremio anahtarsız sağlayıcı modülü; ffsubsync ses modu (`browser_align.py`'ye `audio` isteği); electron-context-menu.
2. **Etap 2 (veri katmanı):** youtubei.js provider katmanı (anon feed/search/suggest → sonra hesaplı yüzeyler, transcript/storyboard); DeArrow branding istemcisi.
3. **Etap 3 (altyazı arzı):** subliminal backend modülü + sağlayıcı merdiveni UI'ı; OpenSubtitles REST mevcut kalır.
4. **Etap 4 (mimari):** better-sqlite3 FTS deposu tasarımı; PySceneDetect sahne-bölüm köprüsü; koşullu: bgutil POT sidecar (lisans incelemesi sonrası).

**Sınırlar:** Bu rapor hiçbir ürün kodunu değiştirmedi; tüm "canlı" iddialar yalnız listelenen endpoint/dosya kanıtlarına dayanır; hiçbir dış repo tüm hedef sitelerde çalışır diye varsayılmadı; GPL/AGPL adaylar kod kopyalama için değil API/desen/harici-araç kullanımı için işaretlendi.
