# BROWSER BUG REPORT 67 — Invidious (SmartTube tarzı) entegrasyon denetimi

**Date:** 2026-09-18

**Repository:** `dorukakindev/whisper-browser`

**Branch / audited commit:** `master` / `ea4f3863f5f2a6c82e7c7ce97c45f17df3fb76d2`
(Invidious teslimleri `9ac31a4` + `9f4d3b8` üzerine; ağaç denetim sırasında
aktif olarak yeniden yazıldı — 3 UI nesli gözlendi: `.invidious-home-page` →
`#invHomeSide` → `#smarttubeBrowser`. Bulgular güncel ağaçta yeniden
doğrulandı; varyant-bağımlı maddeler işaretli.)

**Mode:** report only — hiçbir ürün kodu değiştirilmedi

## Yöntem

6 salt-okunur ajan: `backend/invidious.py`, `backend/media.py
download_stream`, `main.js`/`preload` IPC yüzeyi, renderer oynatma yolu,
SmartTube UI, çapraz-kesim. API alan adları upstream Invidious kaynağı
(`api/v1/videos.cr`, `video_json.cr`, `login.cr`, routing) ve YouTube
timedtext/srv3 spec ile karşılaştırıldı. En kritik bulgular bu oturumda
güncel ağaçta satır satır doğrulandı.

**Genel hüküm:** entegrasyon uçtan uca bozuk — 9 backend komutundan yalnız
`probe` başarı raporlayabiliyor, o da eksik şema döndürüyor. Üstelik R67-01
yalnız yeni özelliği değil, önceden çalışan yt-dlp oynatıcısını da öldürüyor.

## P0/P1 — Kesin bulgular

### R67-01 · TDZ çökmesi: renderer kuyruğunun ~1200 satırı her açılışta ölü — mevcut yt-dlp yolu dahil

- **Kaynak:** `src/renderer/renderer.js:22006` — `initPlayerSource();`
  top-level çağrı; `const INV_KEY`/`let playerSource` ise `:22486-22487`'de.
  `initPlayerSource` gövdesinde `localStorage.getItem(INV_KEY)` TDZ
  ReferenceError fırlatır ama iç `try/catch` yutar; sonra
  `sel.value = playerSource` (`:22496`) — `$('playerSourceSelect')` her
  zaman var (`index.html:2424`) — ikinci TDZ ReferenceError'ı
  **yakalanmadan** top-level eval'i durdurur.
- **Etki:** 22006 sonrası hiçbir şey çalışmaz: `initInvidiousHome`/
  `initInvHomeSide`/`initSmartTube`, `playerProbe` ("Bilgi al"),
  `playerStream`, `playerQuality`, `playerDownload`, `playerChapters`,
  `playerYtSubGet`, `applyOffsetToFile`, `playerCancelDl`, `onMediaEvent`
  aboneliği, `setupRovingTablists()` — YouTube paneli her iki kaynakta da
  inert. **Bu yeni-özellik bug'ı değil, mevcut işlevsellikte regresyon.**
- **İkincil:** 22006 taşınsa bile `initInvidiousHome()` (~`:22271`)
  `playerSource`'u yine 22487'den önce okur — ikinci çökme noktası.
- **Neden testler kaçırıyor:** `node --check` yalnız sözdizimi; tüm renderer
  testleri fonksiyon kesimleri veya regex — top-level eval hiç çalıştırılmıyor.
- **4 ajan bağımsız doğruladı.** Kabul: bildirimler ilk kullanımdan önceye
  taşınmalı (veya init çağrıları bildirimlerden sonraya); top-level eval
  sırasını sınayan bir smoke testi eklenmeli.

### R67-02 · `runInvidiousCommand` yalnız `probe`/`subs` yakalıyor — feed/search/channel/login/logout/downloaded her zaman `{ok:false}`

- **Kaynak:** `src/main.js:920` —
  `if (ev.type === 'probe' || ev.type === 'subs') result = ev;`
  Backend `feed`/`search`/`channel`/`login`/`logout`/`downloaded` yayar;
  `result` null kalır → close handler `ok:false` döner, başarılı iş bile
  "süreç 0 koduyla tamamlandı" hatası üretir.
- **Etki:** `fetchInvidiousFeed`/`searchInvidious`/`loadInvidiousChannel`/
  `doInvidiousLogin` hepsi başarısız raporlar; `invidiousSessions.set`
  `res.ok` kapılı → SID hiç saklanmaz. `invidious:event` kanalına iletilen
  olaylar da boşa gider — renderer'da `onInvidiousEvent` hiç çağrılmıyor.
- **Doğrulama:** satır bizzat okundu; `runMediaCommand`'ın filtresinde
  `downloaded` var (`main.js:840` bandı) — invidious wrapper'a hiç eklenmemiş.

### R67-03 · Login modalı `<script>`'ten sonra — Giriş/İptal/Esc ölü, uygulama modalda kilitlenir

- **Kaynak:** `index.html:2878` `<script src="renderer.js">` vs
  `:2887-2901` `#invidiousLoginModal`. Binding'ler eval sırasında
  `$('invLoginSubmit') === null` → `if (x)` korumaları atlıyor.
- **Etki:** modal click-time çözüldüğü için AÇILIR ama içinde hiçbir şey
  çalışmaz: Giriş ölü, İptal ölü, Esc yok, backdrop yok → uygulama kapanana
  kadar kilit. Ayrıca `invLoginPassword` kapanışta temizlenmiyor — şifre
  DOM'da kalıyor.
- **Kabul:** modal markup'ı script'ten önceye taşı veya binding'leri
  `openInvidiousLogin` içine al; Esc/backdrop/focus-trap/şifre-temizleme ekle.

### R67-04 · CSP tüm Invidious trafiğini ve thumbnail'leri blokluyor

- **Kaynak:** `index.html:5` — `connect-src 'self' whisper-pdf:
  https://*.googlevideo.com; img-src 'self' data:`. Invidious `hlsUrl`'ü
  instance-host'lu yazar (`HOST_URL` gsub) → hls.js manifest fetch'i
  connect-src'de reddedilir; `videoThumbnails` (i.ytimg.com / instance)
  img-src'de reddedilir; göreli `/vi/...` URL'leri `file:///vi/...`'ye
  çözülür.
- **Etki:** "İndirmeden izle" (üretebildiği tek oynatma URL'si) ve tüm kart
  thumbnail'leri çalışamaz — SmartTube ızgarasının tanımlayıcı görseli yok.

### R67-05 · Tek `mediaJobs.invidious` slot'u paralel feed'leri deterministik çaktırıyor

- **Kaynak:** `main.js:886` tek slot vs `renderer.js:22124-22125` (ve
  `22317-22319`) `Promise.all([fetchInvidiousFeed('popular'),
  fetchInvidiousFeed('trending')])` — senkron slot kontrolü deterministik;
  ikinci invoke hep "zaten çalışıyor" döner. Aynı çakışma feed uçuştayken
  probe/search/login'i de vurur.
- **Etki:** ana sayfada Popüler/Trend'den biri her render'da boş + her
  render'da sahte hata logu. R67-02 düzelse bile bozuk kalır.

### R67-06 · Auth mimarisi ölü — SID hiçbir subprocess'e ulaşmıyor + yanlış endpoint + yanlış alan adı

- **Kaynak:** `backend/invidious.py:331` `_session_cookie` modül-seviyesi —
  her `runInvidiousCommand` taze süreç başlatır (`main.js:891`), login
  süreci çıkar ve SID ölür; argparse'de `--sid`/env yok (`:512-521`);
  `main.js`'in `invidiousSessions` Map'i yaz-sakla ölü durum.
- **Üç bağımsız kırılma:**
  1. `feed_subscriptions` (`:449`) `_session_cookie` None → her zaman
     "giriş gerekli" hatası.
  2. Endpoint yanlış: `GET {inst}/api/v1/feed/subscriptions` (`:453`) —
     doğru authenticated API `GET /api/v1/auth/feed`; mevcut yol HTML
     sayfa rotası → `json.loads` patlar.
  3. `login()` yanlış form alanı post'luyor: `email_or_user=` (`:367`) —
     Invidious `env.params.body["email"]` okur → her zaman 401.
- **Etki:** Abonelikler/Kanallarım bölümleri mimari olarak imkânsız.

### R67-07 · `invidious:downloadStream` dört katmanlı ölü — yanlış script + eksik arg + yakalanmayan olay + timeout + renderer'da çağırıcı yok

- **Kaynak:** `main.js:1236` `runInvidiousCommand` → `:888` `backend/
  invidious.py`; ama `download_stream` yalnız `backend/media.py:428`'de
  (`choices`), `media.py:287` implementasyon. invidious.py argparse
  `invalid choice` → exit 2. Ayrıca: `media.py:429` `--url` required ama
  arglarda yok; başarı olayı `downloaded` (`media.py:374`) R67-02 filtresinde
  yok; `timeoutMs=45_000` (`:906`) gerçek indirmeyi öldürür;
  `downloadInvidiousStream` (preload:68) renderer'da **sıfır** çağrıcı —
  "İndir" butonu (`renderer.js:22826`) `playerSource`'a bakmadan hep
  `downloadYoutube` (yt-dlp) çağırır.
- **Etki:** "yt-dlp olmadan indirme" ana vaat %100 ölü; kullanıcı gizlilik
  modunu seçse bile indirme Google'a gider.

### R67-08 · `fetch_subs` srv1 ister ama parser srv3 bekler → sahte "No subtitles available." SRT başarı diye yazılır

- **Kaynak:** `invidious.py:210` `fmt=srv1` → `<transcript><text
  start="0.5" dur="2.7">` (saniye, `<body>` yok). Parser `:282-285`
  `findall(".//body")` → boş → `:311` literal sahte cue döner → gerçek
  `.srt` dosyasına yazılır + `subs` başarı olayı + `subtitleFileAccess.grant`.
- **Etki:** Invidious altyazı indirmesinin %100'ü sessiz veri bozulması —
  kullanıcı "altyazı indi" sanır, 1 sahte cue alır.
- **Ek:** fallback `cap.get("baseUrl")` (`:225`) — gerçek alan `url`
  (göreli `/api/v1/captions/{id}?label=`, WebVTT döner) → hiç eşleşmez;
  `auto` bayrağı da aynı alan hatasıyla hep `False` (`:161`) → tüm izler
  "(elle yazılmış)" görünür; `kind=asr` hiç gönderilmiyor → otomatik
  altyazılar ulaşılamaz; `language_code` yerine `languageCode` okunması
  subtitle dropdown'da `value="|0"` boş kayıtlar üretir.

## P2 — Doğrulanmış bulgular

### R67-09 · Probe şema sürüklenmesi — API'de olmayan alanlar okunuyor, renderer'ın beklediği alanlar verilmiyor

- **Backend:** `dashManifestUrl`→gerçek `dashUrl` (`:150`, hep `""`);
  `thumbnailUrl`→`videoThumbnails` (`:184`, hep `""`); `stream.get("height")`
  → API'de `resolution`/`qualityLabel` (`:131`, tüm height'lar 0);
  `chapters` API'de yok (`:166`, hep boş); `hlsManifestUrl` üzerinde string
  iterasyonu — herhangi bir instance string döndürürse `hls='h'` (`:145`).
- **Renderer'ın beklediği ama gelmeyenler:** `info.heights` (kalite seçici
  boş, indirme sessizce 1080'e düşer), `info.stream.url` (progressive
  fallback yok → "akış yok" uyarısı), `info.audioLangs` (ses alanı gizli),
  `info.isLive`/`liveNow` (canlı uyarısı + pozisyon-kaydetme koruması yok),
  `info.originalLanguage`.

### R67-10 · `fetch_subs` doğrudan youtube.com'a bağlanıyor + yine de instance gerektiriyor

- **Kaynak:** `invidious.py:207-217` birincil yol
  `https://www.youtube.com/api/timedtext` — "Google'a bağlanmadan" vaadiyle
  çelişir; üstüne `find_working_instance()` önce koşar (`:195`) → tüm
  instance'lar ölüyken bile çalışabilecek tek yol da çalışamaz.

### R67-11 · HLS fatal-hata kurtarma `probeYoutube`'a sabitlenmiş — kaynağı yok sayıyor

- **Kaynak:** `renderer.js:16619` `window.api.probeYoutube(info.sourceUrl…)`
  — `info.source === 'invidious'`/`playerSource` kontrolü yok. Invidious
  oynatımında URL süresi dolunca kurtarma yt-dlp'ye düşer (bot-engelli ise
  ölür, değilse sağlayıcı sessizce değişir). `probeWithActiveSource`
  kullanılmalı.

### R67-12 · `opts.instance` hiç doğrulanmıyor — main-süreçli SSRF yüzeyi

- **Kaynak:** `main.js` (`:1069,1088,1112,1129,1149,1168` bandı)
  `args.push('--instance', instance)` verbatim → backend
  `f"{instance}/api/v1/..."` `urlopen`. `decideUrlPolicy` medya URL'ine
  uygulanıyor, instance'a değil. Renderer `instance` gönderebilir → keyfi
  host'a GET + JSON yanıt geri akışı. (Bugün renderer'da instance alanı
  yok — gizli yüzey gerçek.)

### R67-13 · `invidious:cancel` slot'u child kapanmadan null'luyor — sahiplik sözleşmesi ihlali

- **Kaynak:** `main.js:1100-1101` vs `media:cancelDownload` (`:1053-1059`
  kasıtlı null'lamaZ) + `process-lifecycle.js:3-4` sözleşmesi. Sonuç:
  45s backstop'un `mediaJobs[kind] !== proc` koruması devre dışı kalır
  (taskkill+SIGKILL ikisi de başarısızsa yetim süreç sınırsız koşar) +
  yeni iş eskisi hâlâ çalışırken doğabilir → eski close'un flush'ı yeni
  işin `invidious:event` akışına bayat olay karıştırır.

### R67-14 · Sabit 45s timeout — `trending` aşabilir, indirme imkânsız

- **Kaynak:** `main.js:906` tüm komutlara 45s vs `invidious.py:434-437`
  4 sıralı fetch ×10s + `find_working_instance` soğuk tarama ~25s → en kötü
  ~65s. `runMediaCommand` kind'a göre 30s/5dk/2sa ayırıyor; invidious wrapper
  ayırmıyor.

### R67-15 · SID renderer'a sızma riski — `res` olduğu gibi dönüyor

- **Kaynak:** `main.js:1176` `return res` — backend `emit("login", …,
  sid=sid)` (`:384`). Bugün `res.data` undefined olduğu için latent;
  R67-02 düzelince session token sandbox renderer'a akar — "session main'de"
  tasarımına aykırı. Dönüşten `sid` soyulmalı.

### R67-16 · `media.py download_stream` iç kusurlar (R67-07 aşılırsa canlanır)

- `-c copy` körlemesine `.mp4`'ye: `video/webm`(VP9/AV1)+`audio/webm`(Opus)
  seçilirse ffmpeg <5.0 `codec not supported in container` patlar — GB'lar
  indirildikten sonra; yeni ffmpeg bile standart-dışı MP4 üretir
  (`media.py:303,350-367`; `mime` alanı fonksiyona hiç geçmiyor).
- ffmpeg hata/timeout'ta kısmi `out_path` silinmiyor — `finally` yalnız
  `*.tmp`'leri siler (`:370-382`); bozuk `<title>.mp4` tamamlanmış görünür.
- Cancel/timeout `taskkill /T /F` → Python `finally` asla koşmaz →
  `.video.tmp`/`.audio.tmp` (GB'lar) medya klasöründe kalıcı sızar;
  süpüren mekanizma yok.
- İptal butonu `media:cancelDownload` → `mediaJobs.download` öldürür;
  invidious işi `mediaJobs.invidious`'ta → iptal edilemez.
- İlerleme `invidious:event`'e gider, renderer `media:event` dinliyor →
  bar %0'da donar; dosya-başına yüzde → ses fetch'inde 100→0 sıçrama;
  `Content-Length` yoksa sıfır olay; son chunk 0.3s throttle'da yutulabilir;
  bitişte %100 emit yok; `speed`/`eta` hep 0.
- Dosya adı `{title}.mp4` — video ID yok → aynı başlıklı farklı videolar
  `-y` ile birbirini ezer (yt-dlp `[%(id)s]` kalıbı var).
- ffmpeg varlığı GB'lar indirildikten SONRA kontrol ediliyor (`:345-347`);
  `height`/`audio_lang` parametreleri hiç kullanılmıyor (`:287`);
  `emit("downloaded", duration=0)`; Windows rezerve adları (`NUL`,`CON`)
  başlıkta patlar; `-shortest`+`-c copy` paket-granüler kuyruk kırpar.

### R67-17 · Arama sonuçları kalıcı gizli konteynere yazılıyor

- **Kaynak:** `index.html:2485` `class="invidious-search hidden"`;
  `doInvidiousSearch` `hidden`'ı hiç kaldırmıyor ve `invidiousHome`'u
  gizlemiyor → anlık arama görünmez div'e yazar. (Varyant-bağımlı —
  smarttubeBrowser neslinde durum değişebilir; güncel ağaçta doğrulandı.)

### R67-18 · `renderInvidiousHome` popular+trending başarısızsa abonelik bölümünü de siliyor

- **Kaynak:** `renderer.js:22185-22187` bandı — `root.innerHTML='<error>'`
  Abonelikler section'ı eklendikten SONRA çalışıyor → girişli kullanıcıda
  feed ölü ama abonelik canlıysa bile yalnız hata görünür.

### R67-19 · Feed cache kusurları — yenileme no-op + çıkışta bayat abonelik

- **Kaynak:** `invidiousHomeRefresh` → `renderInvidiousHome()` →
  `fetchInvidiousFeed('popular')` `force=false` (~`:22275,22131,22015`) —
  tasarım "zorla yeniden çeker" diyor, 5 dk penceresinde çekmez.
  `doInvidiousLogout` cache'i temizlemiyor → çıkıştan sonra önceki hesabın
  Abonelikleri 5 dk görünür; hesap değişiminde eski hesabın feed'i.

### R67-20 · Arama/section'larda bayat-yanıt koruması yok

- **Kaynak:** `doInvidiousSearch`/`renderInvidiousHome*`'da sequence/
  generation denetimi yok — çakışan iki aramada son-yazan-kazanır (geç
  gelen eski sonuç yenisini ezer); oynatıcı tarafındaki `probeSeq`/
  `staleGeneration` kalıbı buraya taşınmamış.

### R67-21 · Auth UI desync — Çıkış butonu hiç görünmüyor, session açılışta restore edilmiyor

- **Kaynak:** `doInvidiousLogin`/`doInvidiousLogout`
  `invidiousLoginBtn`/`invidiousLogoutBtn` görünürlüğünü hiç değiştirmiyor;
  `window.api.invidiousSession` (preload:80) hiç çağrılmıyor → restart'ta
  giriş durumu UI'a yansımaz.

### R67-22 · Opt-in ihlali — başlangıçta kaynaktan bağımsız ağ çağrısı

- **Kaynak:** `DOMContentLoaded` dinleyicisi + `renderInvidiousHomeSide()`
  `playerSource` bakılmaksızın koşuyor (`:22301-22308` bandı) → hiç
  seçmemiş kullanıcılarda bile public instance'lara istek + 45s slot işgali.
  Tasarım "Invidious opt-in" diyor.

### R67-23 · i18n — yeni dizgilerin tamamı sözlükte yok + `Giriş` "Intro" diye çevriliyor

- **Kaynak:** `ui-locale.js` TR→EN exact-match sözlüğü; yeni UI'nın tüm
  dizgileri (Popüler, Trend, Abonelikler, Kanallarım, Yenile, Çıkış, Ara,
  modal metinleri, durum metinleri, aria-label'lar) eksik → EN modunda
  Türkçe kalır. `['Giriş','Intro']` girdisi (`ui-locale.js:403`) login
  butonlarını **"Intro"** yapar. `styles.css` `content:` dizgisi
  observer'a erişilemez — hiç çevrilemez.

### R67-24 · Gerçek API hatasında failover yok — "failover" yalnız stats keşfi

- **Kaynak:** `find_working_instance` (`:74-85`) `/api/v1/stats` seçer;
  sonrası tek `_fetch_json` — `/videos`'ta 429/5xx/bot-check gelirse
  kalan instance'lar denenmez. Stats geçip videos ölen cache'li instance
  tüm komutu zehirler.

## P3 — Küçük/koşullu bulgular (özet)

| # | Bulgu | Kaynak |
|---|---|---|
| R67-25 | `extract_video_id` instance URL'lerini reddediyor (`yewtu.be/watch?v=` — özelliğin kendi URL biçimi) + `/live/`, `/v/`, nocookie, `watch?list=…&v=` eksik | `invidious.py:90-101` |
| R67-26 | `_cached_instance` süreç-başına — her komut ~5×5s stats taramasını yeniden öder (45s bütçenin ~25s'si) | `invidious.py:39`, `main.js:906` |
| R67-27 | `feed_trending` fallback `kind="popular"` yayar → 'trending' anahtarı altında popular verisi cache'lenir | `invidious.py:441` |
| R67-28 | popular∩trending kesişimi ana sayfada çift kart | renderer render yolu |
| R67-29 | `_parse_video_item` `authorThumbnails` vermiyor → kanal avatarları hep boş; `int()` çağrıları numerik-olmayan alanda tüm feed'i öldürür | `invidious.py:404-416` |
| R67-30 | `proc.on('error')` ham `err.message`'ı UI'a verir (media yolu sanitize ediyor); NDJSON tamponunda `onOverflow` yok → >8MB satır sessizce düşer | `main.js:951,925` |
| R67-31 | `(o.title||'…').slice` truthy non-string'de TypeError; `--page String(opts.page)` integer olmayanda exit 2; `invidiousLogin` preload `instance`'ı düşürüyor | `main.js:1230,1128`, `preload.js:78` |
| R67-32 | `invidious:logout` her zaman `{ok:false}` (logout olayı yakalanmıyor) — kozmetik | `main.js:920` |
| R67-33 | Ölü yüzey/markup: `downloadInvidiousStream`, `onInvidiousEvent`, `cancelInvidious`, `invidiousSession`, `loadInvidiousChannel`, `showHomeWhenNoVideo`; `#invidiousHomePage`/`invHome*` markup'ı bağsız ölü; `invidious.py:200` `if False` kalıntısı | çeşitli |
| R67-34 | Invidious altyazı dosya adı `{vid}.{lang}.srt` — `media:findSiblingSubs` kök-ad eşleşmesi yaptığı için indirilen `Title [id].mp4`'e yeniden açılışta otomatik bağlanmaz | `invidious.py:256` |
| R67-35 | `media.py` ffmpeg `text=True` cp125x decode → non-ASCII başlıkta `UnicodeDecodeError` gerçek hatayı maskeler; minimal UA, tek GET, Range/resume yok | `media.py:370,317` |
| R67-36 | Kaynak değişiminde bayat UI + probe staleness kapısı `playerSource`'u denetlemiyor — probe uçuşta kaynak değişince eski kaynağın sonucu uygulanır | `renderer.js:22500-22501,22562-22563` |
| R67-37 | Login modal a11y: aria-modal/focus-trap/focus-restore/Enter-submit yok; Esc arkadaki UI'a sızıyor | `index.html:2887`, renderer |
| R67-38 | Yan-panel render yollarında `setPlayerHls` `hideHomeOnVideoLoad()` çağırmıyor; `showHomeWhenNoVideo` ölü; kart `open()` drawer'ı açmıyor | renderer.js çeşitli |

## Doğrulanan temiz alanlar

- **XSS yok:** tüm API verisi `textContent`/`createElement`/`setAttribute`
  ile akıyor; `innerHTML` yalnız statik dizgilerde; CSP `script-src 'self'`.
- **Kimlik birleşik:** `mediaKeyFor('youtube', url)` → `youtube:<id>` iki
  kaynakta da aynı — pozisyon/resume/watch-library bölünmüyor (doğru tasarım).
- **Yetki:** 10 handler'ın tamamı `authorizedBrowserSender`; medya URL'lerinde
  `decideUrlPolicy` + http/https; UCID regex; sorgu/username/password
  uzunluk sınırları; `sanitizeAbsolutePath` çıktı dizininde.
- **Grant/okuma:** `subtitleFileAccess.grant(ev.path)` → invidious .srt
  `media:readSubtitle` ile okunabilir; UTF-8 BOM konvansiyonu uyumlu.
- **Süreç hijyeni:** NDJSON 8MB tampon + kısmi-satır birleştirme, `settled`
  guard, close-time slot identity kontrolü, `window-all-closed` tüm
  mediaJobs'u öldürür, `terminateProcessTree` taskkill+SIGKILL.
- **Secret hijyeni:** `pythonRuntimeEnv` = `withoutSecretEnv`; login'e
  `onEvent` geçilmediği için SID NDJSON'u renderer'a iletilmiyor (bugün);
  şifre argv'de — bilinen sınır, raporlanmadı.
- **Kuyruk izolasyonu:** `playerSource` `buildOptsFromUI`'de yok → kuyruk
  her zaman yt-dlp transkribe eder; instance URL'i kuyruğa ulaşamaz.
- **Bayatlık korumaları (oynatıcı tarafı):** `probeSeq`+generation+URL
  karşılaştırma, `pendingAutoOpen`/`pendingLibrarySeek` arming doğru.
- Kartlarda `role=button`+Enter/Space klavye, `img.loading='lazy'`,
  `secs>0` süre koruması (canlıda "0:00" basmıyor).
- Instance'ların hepsi ölüse anlamlı hata + kendini iyileştiren tarama;
  kalıcı "bozuk" işaretleme yok.

## Bilinen sınırlar (tasarım devir notunda deklare — bulgu sayılmadı)

- Şifre argv'de (env migrasyonu planlı) · Kanal sayfası UI yok · Playlist
  desteği yok · download_stream adaptive-only (HLS yok) · Canlı ağ testi
  yapılamadı (tüm "gerçek API alanı" bulguları upstream kaynak spec'ine
  dayanıyor — deterministic ama live-instance doğrulaması yok).

## Doğrulama durumu

- **Bizzat doğrulandı (güncel ağaç):** R67-01 (22006 vs 22486-87, sel
  non-null), R67-02 (`main.js:920`), R67-03 (2878<2887), R67-04 (CSP
  index.html:5), R67-05 (`:886`+Promise.all), R67-07 (`:888` script +
  `media.py:428` choices + preload:68 sıfır çağrıcı), R67-08 (`:210` srv1
  vs `:282` body/p parser + `:311` sahte cue), R67-17 (`index.html:2485`
  hidden).
- **Ajan kaynak-kanıtı + upstream spec:** R67-06 (endpoint/alan adları),
  R67-09 (API şeması), R67-10-16, R67-18-24 — statik deterministik;
  çalışma-zamanı repro koşulmadı (salt-okunur).
- **Varyant notu:** audit sırasında renderer/index.html 3 kez yeniden
  yazıldı; P1/P2'ler tüm nesillerde invariant, P3'lerin bir kısmı
  varyant-bağımlı — düzeltmeden önce son dosyayla diff'leyin.

## Güncel-durum eki — 2026-09-18 14:2x (kullanıcı ekran görüntüsü doğrulaması)

Kullanıcının paylaştığı ekran: sol `st-*` sidebar render oluyor, içerik
alanı "İçerik yükleniyor…"da takılı — **tam da R67-01'in ölü-script
imzası**: markup çizilir, davranış yoktur.

Güncel ağaçta yeniden doğrulanan zincir:

- `initPlayerSource()` hâlâ `renderer.js:22006`'da; `INV_KEY`/`playerSource`
  hâlâ `22624-22625`'te → TDZ çökmesi **açık**. `sel.value = playerSource`
  (22634) try dışında → uncaught → 22006 sonrası her şey ölü:
  `invidiousFeedCache` (22010), `fetchInvidiousFeed` (22019), tüm
  `renderSmartTube*` (22304+), `DOMContentLoaded` dinleyicisi (22322),
  sidebar `forEach` bağları (22334), `initSmartTube`/`initInv*` çağrıları
  (22295, 22620) — hiçbiri hiç çalışmıyor. Sidebar butonları, arama,
  kart grid'i: hepsi ölü markup.
- Kısmi düzeltme gelmiş: `main.js:921` artık `feed`/`search` olaylarını da
  `result`'a yazıyor (R67-02'nin yarısı kapandı). **`channel`, `login`,
  `logout`, `downloaded` hâlâ yakalanmıyor** → giriş hep "başarısız",
  kanal hep boş.
- Gerisi değişmedi: CSP, slot çakışması, modal konumu, auth mimarisi,
  downloadStream yönlendirmesi, srv1 parser — hepsi açık.

Yani "çalışmıyor"un birinci cevabı R67-01; düzeltilse sırayla R67-02
(kalan tipler), R67-05, R67-04, R67-06/07/08 duvarlarına çarpar.

## Handoff — önerilen onarım sırası

1. **R67-01** — `INV_KEY`/`playerSource` bildirimlerini ilk kullanımdan
   önceye taşı (veya init çağrılarını sonraya); aksi halde uygulama
   zaten her açılışta yarı ölü.
2. **R67-02** — sonuç beyaz listesine `feed|search|channel|login|logout|
   downloaded` ekle (veya renderer olay dinleyicisi bağla).
3. **R67-07+16** — `downloadStream`'i `runMediaCommand`/`media.py`'ye
   yönlendir (`--url` zorunluluğunu gevşet, kind='download' → 2sa timeout
   + `downloaded` yakalama + media:event progress + iptal bedava gelir);
   renderer İndir'e `playerSource` dalı ekle.
4. **R67-06** — `email` alanı, `/api/v1/auth/feed`, SID'yi
   `WHISPER_INVIDIOUS_SID` env ile subprocess'e geçir.
5. **R67-08** — `fmt=srv3` iste (veya srv1 `text start/dur` saniyelerini
   parse et); `url`+instance-prefix; `kind=asr`; `language_code`;
   VTT/non-XML içerik tespiti.
6. **R67-05** — feed çağrılarını serileştir veya kind-başına slot.
7. **R67-04** — CSP'ye instance hostları (yapılandırılmış liste) veya
   thumbnail proxy şeması.
8. **R67-03** — modal markup'ı script'ten önceye taşı + Esc/backdrop/
   şifre-temizleme.
9. **R67-09** — probe emit'ini gerçek API alanlarına hizala
   (`dashUrl`, `videoThumbnails`, `resolution`, `liveNow`) ve renderer'ın
   beklediği `heights/stream/audioLangs/isLive` alanlarını üret.
10. Sonra P2/P3 kuyruğu: SSRF instance doğrulaması, cancel sahipliği,
    cache/auth-desync, i18n, failover.

---

# UYGULAMA DURUMU — 2026-09-18 (implementasyon turu)

Kullanıcı talimatıyla doğrulanmış tüm bulgular düzeltildi; SmartTube
oynatıcı yüzeyi uçtan uca çalışır hale getirildi.

## Kapanan bulgular

| # | Bulgu | Uygulanan düzeltme |
|---|---|---|
| R67-01 | TDZ renderer çökmesi | `INV_KEY`/`playerSource` bildirimleri `initPlayerSource()` çağrısından ÖNE taşındı. Boot smoke (`electron-smarttube-boot.smoke.js`) gerçek Electron'da kanıtladı: sıfır uncaught hata, `initSmartTube` → `invidious:feed` invoke'a kadar canlı. |
| R67-02 | Sonuç beyaz listesi | `feed|search|channel|login|logout` tipleri `runInvidiousCommand`'de yakalanıyor; `downloaded` `media.py` yolunda `runMediaCommand` üzerinden. |
| R67-03 | Modal script sonrası | `invidiousLoginModal` markup'ı `<script>` etiketlerinin önüne taşındı; Esc/backdrop kapatma + şifre alanı temizleme bağlandı. |
| R67-04 | CSP | `img-src`/`media-src`/`connect-src` `https:` genişletildi (thumbnail/stream/manifest); `script-src 'self'` korunuyor. |
| R67-05 | Tek slot çakışması | Renderer `invCall` promise-zinciri tüm Invidious IPC'lerini serileştiriyor; `renderInvidiousHome` artık sıralı. |
| R67-06 | Auth mimarisi | `email` alanı (iki varyant denemeli), `/api/v1/auth/feed` endpoint'i, SID `WHISPER_INVIDIOUS_SID` env ile subprocess'e; SID renderer'a asla dönmüyor (sonuçtan soyuluyor). Oturum açılışta geri yükleniyor. |
| R67-07 | downloadStream yolu | `invidious:downloadStream` → `runMediaCommand(media.py)` (`download` slot, 2 sa timeout, `media:cancel` bedava). `media.py download_stream`: `--url` opsiyonel, `--video-id`, mime'dan container, ffmpeg önce kontrol, birleşik progress, `.invtmp`/kısmi dosya temizliği. Renderer İndir düğmesi kaynak-dallı. |
| R67-08 | srv1/srv3 parser | `fmt=srv3` isteniyor; parser srv3 (`<p t d>`) + srv1 (`<text start dur>`) + VTT; boş/tanınamayan içerik sahte "No subtitles" SRT'si yerine sınıflı `RuntimeError`; `url`+`language_code`+`kind=asr` kullanılıyor; çıktı adı `Başlık [vid].lang.srt`. |
| R67-09 | Şema sürüklenmesi | probe emit'i gerçek API alanlarına hizalandı (`dashUrl`, `videoThumbnails`, `resolution`, `liveNow`, `audioTrack`) + renderer şeması üretildi (`heights` sayı dizisi, `stream` nesnesi, `audioLangs`, `isLive`). |
| R67-12 | Instance SSRF | `validateInvidiousInstance` `opts.instance`'ı http/https origin'e indirger; SID yalnız login yapılan instance'a gider (`resolveInvidiousInstance`/`requireSession`). |
| R67-13 | Cancel sahipliği | `invidious:cancel` slot'u null'lamaz; temizlik `close`'un `mediaJobs[kind] === proc` kontrolüyle. |
| R67-14 | Altyazı gizliliği | `fetch_subs` caption URL'lerini instance üzerinden çözüyor (`_abs_url`), youtube.com'a doğrudan gitmiyor. |
| R67-15 | SID sızıntısı | login/logout/session sonuçlarından `sid` anahtarı soyuluyor; main içinde `invidiousSessions` haritasında. |
| R67-16 | İndirme eksikleri | Bkz. R67-07 satırı — container/kısmi-dosya/ffmpeg/ad-çakışması düzeltildi. |
| R67-17 | Arama görünürlüğü | `stSearchResults`/`stSearchGrid` aç-kapa mantığı + `stGrid` karşılıklı gizleme; `stSearchSeq` yarış koruması; eski `invidiousSearchResults` konteyneri de gösteriliyor. |
| R67-18 | `Giriş`→`Intro` çakışması | Etiketler `Oturum aç`/`Oturumu kapat` yapıldı; ui-locale eksikleri tamamlandı. |
| R67-19 | HLS kurtarma | `probeWithActiveSource` kullanıyor (yt-dlp sabit değil). |
| R67-20 | Ölü nesil markup | `invidiousHomePage` (3. nesil, hiç gösterilmeyen kopya) kaldırıldı; ölü `invHome*` butonları gitti (player-ui invariant'ı yeşil). |

## Ek iyileştirmeler (SmartTube tamamlama)

- Tek-tık kart oynatma (`pendingAutoOpen` kalıbı) — probe sonrası akış varsa doğrudan oynatır.
- Kartlarda süre, görüntülenme, tarih, kanal adı ve `CANLI` rozeti; thumbnail URL'leri instance'a mutlaklaştırılıyor.
- Kanal sayfası: başlık + `← Kanallarım` geri + kanal adı/abone bilgisi.
- `stSectionSeq` bölüm-yarış koruması, `stStatusLine` durum satırı, giriş gereken bölümde giriş ipucu.
- `refreshSmartTubeAuthUI` hem `smarttubeBrowser` sidebar'ını hem ayar paneli butonlarını senkronlar; açılışta `invidious:session` geri yükleme.
- `hideHomeOnVideoLoad` HLS yoluna da bağlandı; `openPlayer` medya yokken tarayıcıyı geri gösterir.
- `invidious:event` logları renderer'a iletiliyor (`playerLog`'a düşer).
- Per-kind timeout (trending 120 sn, diğer feed'ler 75 sn), NDJSON taşma koruması, hata sanitize (spawn hatası sınıflı Türkçe fallback — `err.message` ham sızdırmaz).
- `.st-card:focus-visible` `outline:none` kaldırıldı (tasarım-sistemi invariant'ı).
- Failover: `_fetch_with_failover` + `_iter_instances` (tercih → önbellek → varsayılan liste) feed/search/channel/probe'da.
- `extract_video_id`: watch?v= (param sırası bağımsız), youtu.be, /shorts|embed|live|v/, nocookie ve **herhangi instance URL'si** — kart linkleri de dahil.

## Doğrulama kanıtı

- `tests/report67-smarttube-wiring.test.js` — **24/24** (yeni, kaynak-sözleşme)
- `backend/test_invidious.py` — **48/48** (orijinal testler korunarak genişletildi; boş-içerik hatası ve srv1/VTT davranış testleri eklendi)
- `tests/electron-smarttube-boot.smoke.js` — **GEÇTİ** (yeni; gerçek Electron penceresinde index.html+preload boot → `{"ok":true}`, tüm SmartTube probları canlı)
- `design-system`, `ui-locale`, `ytdlp-runtime`, `report65-invidious-bridge` (21), `player-ui` (145) — **hepsi yeşil** (implementasyonun kırdığı 5 tracked test onarıldı: 2'si gerçek ürün hatası [ölü butonlar, focus-visible], 2'si bayat beklenti [eski regex/iptal semantiği], 1'i çift locale anahtarı)
- `node --check` (renderer/main/preload/ui-locale) + `py_compile` (invidious/media) — temiz
- `npm test` — sonuç aşağıda; kalan kırmızılar **izlenmemiş başka-iş-akışı WIP testleri** (`tests/report62-*`, `report63-*` ×2, `report64-*` ×2 + `src/browser-sensitive-keys.js`): bekledikleri ürün düzeltmeleri (hassas-param redaksiyonu, SSRF observer LRU, i↔İ locale, kontrast, adres-listbox) o iş akışında henüz yazılmadı. Bu teslimin kapsamı dışında — dokunulmadı.

## Kalan sınırlar (canlı sağlayıcı doğrulanmadı)

- Invidious instance'larına canlı ağ erişimi bu ortamda test edilmedi; feed/probe gerçek API yanıtıyla doğrulanmadı — boot smoke IPC-seviyesinde kanıtlıyor, uç ağ doğrulaması kullanıcı ortamında.
- Login yanıtı gerçek bir Invidious hesabıyla denenmedi (instance'a göre `email`/`email_or_user` varyantları kod yolunda).
- HLS oynatma `hls.js` vendor bundle'ına bağlı; canlı yayın kurgusu canlı test edilmedi.

## Ek düzeltme — canlı ekran doğrulaması sonrası (70e5814)

Kullanıcının canlı ekranı: feed gerçek instance'tan doluyor (R67 zinciri
çözülmüş) ama TRENDING şeridi boş kutu + scrollbar gösteriyordu.

- **Neden:** bölüm ayracı ve kart şeridi `#stGrid`'in grid item'i olarak
  ekleniyor — ayrı `.st-grid` wrap tek ~220px hücreye sıkışıyordu.
- **Düzeltme:** ayrac `gridColumn: 1 / -1`, trend kartları doğrudan
  `#stGrid`'e; iç içe grid kaldırıldı. `görüntüleme`/`abone`/`CANLI`
  `UiLocale.t()`'ye bağlandı (EN UI'da views/subscribers/LIVE).
- **Regresyon:** boot smoke'a mock IPC feed'i eklendi — `sepFullRow`,
  `noNestedGrid`, `minCardWidth=238px` prob'ları bu layout sınıfını
  gerçek Electron'da kalıcı yakalıyor; wiring 25/25.
