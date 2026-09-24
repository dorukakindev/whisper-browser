# BROWSER FEATURE RESEARCH 75 — GitHub Repo Özellik Envanteri

**Tarih:** 2026-09-19 · **Tür:** Araştırma (kod değişikliği YOK) · **Kapsam:** Browser/SmartTube/player tarafına eklenebilecek özellikler

Bu rapor 12+ GitHub reposunun **kaynak kodu, API rotası ve gerçek implementasyon** düzeyinde incelenmesiyle hazırlandı. README iddiaları değil; endpoint rotaları (`routing.cr`), presenter sınıfları, PR diff'leri ve API şemaları temel alındı. Her bulgu bizim kod tabanımızdaki mevcut durumla eşleştirildi.

**Kod tabanı mevcut envanteri (doğrulanmış):**
- SmartTube bölümleri: `home, trending (+music/gaming/news/movies çipleri), popular, subscriptions, channels`
- Backend (`backend/invidious.py`): `probe, fetch_subs, login/logout (SID cookie), feed_popular, feed_trending, feed_home, feed_subscriptions, search, channel, comments (+continuation), playlist`
- SponsorBlock: hash-prefix tüketim, per-kategori mod (auto/manual/show_in_seekbar/off), muafiyet listesi, geçici kapatma
- Player: A-B loop, hız kontrolü, chapter marker'ları, kalite/ses parçası seçimi, HLS recovery, CEA altyazı, PiP komutu
- **YOK:** storyboard önizleme, arama önerileri, yorum yanıtları yükleme, oynatma kuyruğu, kart bağlam menüsü, dislike sayısı, DeArrow, MediaSession, yerel abonelik, izleme geçmişi bölümü, playlist bölümü, shorts filtreleme, kanal sekmeleri, transcript, canlı sohbet

---

## 1. yuliskov/SmartTube — MIT

**İncelenen yüzey:** `BrowseSection.java` (section type'ları), `VideoMenuPresenter` (initMenuMapping), changelog, deepwiki mimari dökümanları.

### Bulunan özellikler

| Özellik | Teknik detay | Bizdeki durum |
|---|---|---|
| **Kart bağlam menüsü** (uzun basış / sağ tık) | `VideoMenuPresenter.initMenuMapping()` → `ACTION_ADD_TO_QUEUE, ACTION_PLAY_NEXT, ACTION_REMOVE_FROM_QUEUE, ACTION_UNSUBSCRIBE, ACTION_REMOVE, ACTION_REMOVE_AUTHOR, Add/Remove playlist (son kullanılan = Watch Later dahil), Pin to sidebar, Share link, Select account, Move section up/down` | **YOK** — kartlar yalnız click→probe. En yüksek SmartTube-parite açığı |
| **Oynatma kuyruğu** | Session playlist: Add to Queue (sona), Play Next (mevcut+1'e ekle), Remove from Queue, Show Queue. Kuyruk restart'ta hayatta kalıyor | **YOK** — mevcut `queue` transkripsiyon kuyruğu, oynatma kuyruğu değil |
| **"Not interested" / "Don't recommend channel"** | YouTube feedback token'larıyla işaretleniyor | **YOK** — Invidious bunu desteklemez; yerel gizleme listesiyle yapılabilir |
| **Bölüm seti** | Home, Subscriptions, History, Playlists, Trending, Music, Gaming, News, My Videos, Live + Settings/General/Setup sections ile aç/kapa/sırala | Kısmi — 5 bölüm var; History/Playlists/Live/Music-Gaming-News bölümü yok (music/gaming/news yalnız trend çipi) |
| **Bölüm görselleştirme tipleri** | `TYPE_GRID, TYPE_ROW (yatay satırlar), TYPE_SETTINGS_GRID, TYPE_MULTI_GRID (kanal sayfası), TYPE_SHORTS_GRID (dikey)` | Yalnız TYPE_GRID — ROW tipi (YouTube'un yatay rafları) home'da zenginlik katardı |
| **Abonelik grupları (PocketTube-benzeri)** | Context menu → "Add channel to new subscription group" → grup sidebar'a pinleniyor | YOK — yerel gruplama yapılabilir, hesap gerekmez |
| **Anonim deneyim** | Hesap seçili olmadan tam işlevsel subscriptions/channels bölümleri (yerel liste) | Bizde subscriptions Invidious-oturum gerektiriyor — **yerel abonelik fallback'i önemli boşluk** |
| **Hide Shorts / hide watched** | Settings/General/Hide unwanted content → aramadan ve feed'lerden shorts/watched gizleme | YOK — `isShort`/`isWatched` flag'leri Invidious item'larında var |
| **Son kullanılan altyazılar üstte** | Altyazı seçicide recently-used üstte listeleniyor | Kısmi — `lastCaptionPrefs` var ama sıralama yok |
| **Kart boyutu / UI ölçeği** | Settings/Interface → card size, text size, UI scale | YOK — tek sabit grid |
| **Canlı sohbet** | Live chat panel | YOK — Invidious chat endpoint'i yok; YouTube.js livechat mümkün |
| **SponsorBlock tüketim** | Consume-only (TV'de submission yok) — bizim için aynı karar mantıklı olabilir ama bizde hassas seek var | Consume-only ✓ |

**Karar:** Mimari referans olarak **birincil kaynak**. Kart bağlam menüsü + oynatma kuyruğu + yerel abonelik en yüksek-parite boşlukları. Java/Android kodu doğrudan taşınamaz ama menü eylem seti ve bölüm modeli birebir uyarlanabilir.

---

## 2. FreeTubeApp/FreeTube — AGPL-3.0 ⚠️ copyleft

**İncelenen yüzey:** README feature list, v0.26 release notes (SABR, Electron 41), mimari (Electron + built-in extractor + Invidious failover).

En yakın mimari (Electron). **AGPL nedeniyle kod kopyalanamaz — fikir/desen adaptasyonu.**

| Özellik | Detay | Uygulanabilirlik |
|---|---|---|
| **Yerel abonelikler** | Hesapsız, disk'e kaydedilen abonelik listesi; OPML/CSV/JSON import-export; **Profiles** (abonelikleri gruplama) | Invidious-session bağımlılığını kaldırır; SmartTube'un anonim modeliyle aynı |
| **Distraction-free ayarları** | Hide trending, hide shorts, hide comments, hide suggested, hide live | Basit filtre bayrakları; Invidious item'larında `isShort`/`lengthSeconds` var |
| **Kart üzeri izleme ilerlemesi** | Thumbnail altında progress bar overlay (watch history'den) | `watchLibrary` verimizle doğrudan yapılabilir |
| **SABR playback** | YouTube'un yeni streaming protokolü; FreeTube local API üzerinden implemente etti; download feature'ı **kaldırdılar** (SABR kırdı) → yt-dlp öneriyorlar | İzleme notu: HLS stream'lerimiz SABR'a geçerse probe fallback'i gerekebilir; yt-dlp seçimimiz doğrulandı |
| **DeArrow** | Başlık/thumbnail düzeltme | §6'ya bak |
| **Ekran görüntüsü** | Video frame → PNG | `video.toDataURL`/`captureStream` ile kolay |
| **External player handoff** | Videoyu mpv/VLC'de aç | `spawn('mpv', [url])` — tek komut; bizde zaten yt-dlp stream probe var |
| **Kanal gönderileri (community/posts)** | Invidious `/api/v1/channels/:ucid/posts` veya `:ucid/community` | Kanal sekmesi olarak eklenebilir |
| **Klavye kısayolları** | YouTube-parite kısayol seti | Mevcut set geniş; eksikler: t (theater), i (miniplayer), k |

---

## 3. TeamNewPipe/NewPipe — GPL-3.0 ⚠️ copyleft

**İncelenen yüzey:** PR #6434 (seekbar thumbnail preview), NewPipeExtractor PR #647 (frameset çıkarımı).

| Özellik | Teknik detay |
|---|---|
| **Storyboard seekbar önizleme** | `playerResponse.storyboards.playerStoryboardSpecRenderer.spec` → frameset listesi (L0/L1/L2 detay seviyeleri). Sprite sheet'ten seek konumuna göre karo kırpma: `SeekbarPreviewThumbnailHolder`. Boyut kuralları: min 100dp, tercihen player-width/4, max 2.5× orijinal |
| **Arka plan oynatma** | Ses-only mod |
| **Enqueue/local playlist** | Kuyruk + yerel çalma listeleri |

Storyboard spec formatı (NewPipeExtractor'dan): `spec` pipe-ayrımlı — `[base_url_with_$L_$N] | [level0: cols#rows#count#width#height#interval#...] | [level1...] | [sigh]`. Her level N sheet döndürür: `M$M.jpg?sqp=...&sigh=...`. **Imza (`sigh`) playerResponse'a bağlı — yt-dlp/Invidious probe yanıtından çıkarılmalı.**

---

## 4. iv-org/invidious — AGPL-3.0 (API tüketicisiyiz)

**İncelenen yüzey:** `src/invidious/routing.cr` — **tam API rotası listesi**. Kullanmadığımız endpoint'ler:

| Endpoint | Ne veriyor | Bizdeki durum |
|---|---|---|
| `GET /api/v1/storyboards/:id` | Sprite spec + width/height/interval — **seekbar hover önizlemesi için hazır veri** | **YOK — en değerli kullanılmayan endpoint** |
| `GET /api/v1/search/suggestions?q=` | `{"query": ..., "suggestions": [String]}` — YouTube `suggestqueries` proxy | **YOK — stSearchInput'a autocomplete** |
| `GET /api/v1/captions/:id?tlang=XX` | İngilizce altyazıdan otomatik çeviri (YouTube auto-translate) | `fetch_subs` tlang'siz — **bedava altyazı çevirisi** |
| `GET /api/v1/transcripts/:id` | Transcript paneli verisi | YOK |
| `GET /api/v1/clips/:id` | Clip bilgisi | YOK |
| `GET /api/v1/channels/:ucid/{shorts,streams,podcasts,releases,courses,playlists,community,channels,search,latest}` | Kanal sekmeleri — **kanal içi arama dahil** | Yalnız `/channels/:ucid` (home) kullanılıyor |
| `GET /api/v1/hashtag/:tag` | Hashtag sayfası | YOK |
| `GET /api/v1/mixes/:id` | YouTube Mix/radio | YOK |
| `GET /api/v1/playlists/:id?page=` | Playlist içeriği | Backend `playlist()` var, **UI bölümü yok** |
| `hl=LANG` parametresi | Tüm JSON yanıtlarında alan çevirisi | Kullanılmıyor — UI locale'e bağlanabilir |
| `/api/v1/auth/{feed,playlists,history,subscriptions}` | Oturumlu feed/geçmiş/playlist (SID cookie'mizle) | `feed_subscriptions` var; **history/playlists/feed auth uçları kullanılmıyor** |
| `/api/v1/auth/notifications` | Yeni video bildirimleri | YOK |
| İzleme işaretleme | Auth session ile watched işaretleme | YOK |

**Karar:** Storyboard + search suggestions + tlang + kanal sekmeleri + auth history/playlists → **mevcut backend'e ek endpoint wrapper'larıyla düşük maliyetle kazanılır.** En yüksek ROI grubu.

---

## 5. TeamPiped/Piped + Piped-Backend — AGPL-3.0 (API)

**İncelenen yüzey:** `docs.piped.video` API şeması, `piped_dart` OpenAPI sınıfları, instance listesi.

| Özellik | Değerlendirme |
|---|---|
| `/feed/unauthenticated?channels=a,b,c` | **Hesapsız çok-kanallı feed** — yerel abonelik listemizle birleşirse Invidious-session'sız subscriptions bölümü yapılabilir |
| `/streams/:id` | Stream bilgisi — Invidious probe failover'ı olarak ikinci backend sınıfı |
| `/opensearch/suggestions` | Arama önerileri (Invidious'un alternatifi) |
| `/sponsors/:id` | SponsorBlock passthrough |
| RYD-Proxy entegrasyonu | Dislike verisi passthrough |
| `/comments/:id`, `/nextpage/comments` | Yorumlar + replies |

**Karar:** **İkinci backend sınıfı olarak adapt.** Tüm Invidious instance'ları çöktüğünde probe/feed/search için Piped failover'ı `backend/piped.py` modülüyle eklenebilir — `_iter_instances` kalıbı aynen uygulanır.

---

## 6. ajayyy/DeArrow — MIT (API)

**İncelenen yüzey:** README + API akışı + `DeArrowThumbnailCache` (screenshot üretim servisi).

- `GET https://sponsor.ajay.app/api/branding?videoID=X` → `{"titles": [...], "thumbnails": [{"timestamp": ...}], "randomTime": ...}`
- Gönderim yoksa fallback: başlık formatlama (title/sentence case) + rastgele timestamp'ten thumbnail (SponsorBlock segment'ine düşmeyen)
- Thumbnail'lar video karesi → üretim servisi `dearrow-thumb.ajay.app` veya yerel canvas/screenshot
- "Show original" peek butonu kalıbı

**Uygulanabilirlik:** SmartTube kartlarında clickbait başlık/thumbnail değişimi. Grid'de her kart için branding fetch → batch/cache gerekir (FreeTube bunu kart-render zamanında yapıyor). **Adapt — orta maliyet, ayara bağlı.**

---

## 7. Anarios/return-youtube-dislike — GPL-3.0 (API)

**İncelenen yüzey:** README API dökümanı + issue'lar (rate limit, rawLikes).

- `GET https://returnyoutubedislikeapi.com/votes?videoId=X` → `{likes, dislikes, rawLikes, rawDislikes, rating, viewCount}`
- **Rate limit: 100 req/dk, 10.000 req/gün** → grid kartlarında toplu fetch uygun DEĞİL; yalnız video detayında (probe sonrası) tek istek
- Oy gönderme PoW puzzle gerektiriyor → **yapmayalım**

**Uygulanabilirlik:** Probe/player detail'de `👎 12K` rozeti. `viewCount` zaten Invidious'ta var; RYD'nin ek değeri `dislikes` + `rating` (0-5 yıldız). **Adopt — küçük, ayara bağlı, tek endpoint.**

---

## 8. LuanRT/YouTube.js — MIT ✓

**İncelenen yüzey:** `src/Innertube.ts`, `CommandEndpoints.ts` (tam endpoint şeması), managers (AccountManager, PlaylistManager, InteractionManager).

InnerTube (YouTube'un kendi private API'si) JS istemcisi — Node/Electron main'de çalışır. `youtubei.js` npm: 149K haftalık indirme, aktif.

**Kapasite envanteri (bizde karşılığı olmayanlar):**

| Kapasite | Bizdeki durum |
|---|---|
| `getInfo` → video info + **storyboards** + streaming data | Invidious probe var; storyboard yok |
| `search` + suggestions + filter params (duration/type/uploadDate) | Invidious search var; suggestions yok |
| `getComments` + **replies (tam thread)** | Sadece replyCount sayısı var, yanıtlar yüklenmiyor |
| `PlaylistManager` — create/edit/add/remove, Watch Later | Playlist UI hiç yok |
| `InteractionManager` — like/dislike/rate (gerçek YT aksiyonu) | YOK |
| `Guide` (subscriptions), `History`, `Library`, `NotificationsMenu` | Subscriptions Invidious'a bağlı; history/library yok |
| `getHomeFeed`, kanal sekmeleri, `ShortFormVideoInfo` (shorts), live chat | Kısmi |
| Cookie/OAuth auth (SAPISIDHASH) | Invidious SID kullanıyoruz; YouTube.js kendi cookie flow'u ister |

**Karar:** **Ağır ama en güçlü tek bağımlılık.** İki yol:
- (a) Invidious'u koruyup YouTube.js'i yalnız *auth gereken* işlerde (playlist edit, like, subscribe, history sync, comment replies) kullanmak — OAuth device flow'umuzla cookie üretme köprüsü gerekir
- (b) Piped/Invidious failover zincirine devam, YouTube.js'i hiç almamak
(a) önerilir — MIT lisans, tek bağımlılıkla authenticated-YouTube'nun tamamı.

---

## 9. Electron platform API'leri (electron/electron docs)

**İncelenen yüzey:** `docs/tutorial/windows-taskbar.md`, PR #32848 (MediaSession main-process API), MDN MediaSession.

| API | Ne verir | Maliyet |
|---|---|---|
| `navigator.mediaSession` (renderer) | Donanım medya tuşları (kulaklık/klavye play/pause/FF/RW), OS now-playing overlay'i (başlık+kanal+kapak), `setPositionState` ile OS seviyesinde seek konumu, `previoustrack/nexttrack` (playlist/queue ile bağlanır) | **Çok düşük** — metadata + action handler'ları; browser modunda webContents'in kendi medya oturumuyla çakışmayı yönetmek gerekir |
| `win.setThumbarButtons` | Windows taskbar önizlemede ▶/⏸/⏭ butonları | Düşük — main-process IPC wiring |
| `win.setProgressBar` | Taskbar ikonunda ilerleme (indirme/transkripsiyon/oynatma) | Düşük — mevcut ilerleme olaylarını bağla |
| `session.setProxy` | Tor/SOCKS proxy desteği (FreeTube'un yaptığı gibi) | Orta |

**Karar:** MediaSession → **Adopt, en kolay yüksek-hisset özelliği.** Thumbar → Adopt (Windows hedef kitle). Progress → Adopt (mevcut indirme/transkripsiyon ilerlemesine bağla).

---

## 10. omersusin/piTube — referans (Kotlin/Android)

Yeni repo, ilginç desenler: **storyboard hover, çift-dokunuş seek, ses-normalizasyonu, uyku zamanlayıcısı, crossfade, radio modu (related-video chain), restart-surviving queue, shuffle-all, most-played history sort, live chat polling, cookie-refresh rotation, subscription import (NewPipe JSON / Takeout CSV / OPML), notification inbox parser.**

Dikkat çekenler bizim için: **uyku zamanlayıcısı** (sleep timer — yok), **radio modu** (up-next zincirinden sonsuz oynatma — `autoNext` ile yakın, genişletilebilir), **subscription import/export** (OPML/CSV — yerel abonelikle birlikte).

**Karar:** Tasarım referansı — koda bakmaya değmez (farklı platform), fikir listesi değerli.

---

## 11. ViewTube / Materialious / Clipious — Invidious frontend'leri

**Materialious (Svelte):** seekbar'da storyboard, chapter'lı seekbar, watch-party. **ViewTube (Vue):** self-hosted Invidious frontend — basit kart/feed desenleri. **Clipious (Flutter):** mobil Invidious istemcisi — abonelik/playlist yönetimi UX'i.

**Karar:** UX referansı; kod adaptasyonu yok (farklı stack).

---

## Öncelik Matrisi

### S — Yüksek değer, düşük maliyet (ilk sprint)
1. **MediaSession entegrasyonu** — donanım tuşları + OS now-playing. Renderer'da ~80 satır.
2. **Arama önerileri** — `/api/v1/search/suggestions` → `stSearchInput` dropdown (mevcut `browserAddressSuggestions` datalist kalıbı hazır desen).
3. **Dislike rozeti** — RYD `/votes` probe sonrası tek fetch, ayara bağlı.
4. **Kart ilerleme overlay'i** — `watchLibrary` verisiyle thumbnail altı progress bar.
5. **Yorum yanıtları** — Invidious `comments` replyCount var; `?h=...` reply continuation ile thread açılımı.
6. **Hide Shorts / hide watched** ayarı — item flag'lerinde filtre.

### A — Yüksek değer, orta maliyet
7. **Storyboard seekbar önizleme** — `/api/v1/storyboards/:id` (spec hazır geliyor, sigh parse gerekmez) → hover'da sprite karo. Seekbar'da `seekTip` var, canvas/img genişletilir. **En görünür "premium player" özelliği.**
8. **Kart bağlam menüsü** — sağ-tık: Play Next / Add to Queue / Watch Later / Hide channel / Not interested (yerel) / Share link / Open channel. `st-card`'a contextmenu handler + menü komponenti.
9. **Oynatma kuyruğu** — `queue` (transkripsiyon) ile çakışmaması için ayrı isim (`playQueue`); `autoNext`/`ended` akışına bağlanır, panelde sıra listesi.
10. **Yerel abonelikler + import/export** — OPML/CSV/JSON; Invidious session'sız `feed_subscriptions` fallback'i (kanal başına `/api/v1/channels/:ucid/latest` veya Piped `/feed/unauthenticated`).
11. **Kanal sekmeleri** — videos/shorts/streams/playlists/community/search; `channel()` backend'i zaten genişletilebilir.
12. **Playlist bölümü** — backend `playlist()` hazır; UI section + arama sonucu playlist kartlarından açılım.
13. **Altyazı oto-çeviri (tlang)** — `fetch_subs`'a `tlang` parametresi; İngilizce→TR bedava çeviri (LLM'siz).

### B — Değerli, stratejik karar gerektirir
14. **YouTube.js (InnerTube)** — authenticated YT'nun tamamı (like/playlist-edit/history-sync/live-chat). OAuth→cookie köprüsü araştırması gerekir.
15. **Piped backend failover** — `backend/piped.py`; Invidious-down senaryosunda feed/probe/search devamı.
16. **DeArrow** — kart başına branding fetch + thumbnail üretimi; ayara bağlı.
17. **History bölümü** — `watchLibrary`'den SmartTube section olarak sunma (yerel veri hazır) + opsiyonel auth history.
18. **Thumbar buttons + setProgressBar** — Windows taskbar paritesi.

### C — Uzun vade / izleme listesi
19. **SABR hazırlığı** — YouTube'un yeni protokolü; FreeTube'un deneyimini izle (download'ı öldürdü). yt-dlp probe zaten fallback.
20. **Uyku zamanlayıcısı, ses normalizasyonu, radio modu, shuffle-all** — piTube'dan desenler.
21. **Canlı sohbet** — YouTube.js livechat veya polling.
22. **Watch-party / remote control** — Materialious deseni; düşük öncelik.
23. **Tor/proxy** — `session.setProxy` + ayar UI.

### Reddet / yapma
- **SponsorBlock segment gönderimi** — SmartTube'un kararıyla aynı: masaüstünde hassas seek'imiz olsa da submission UX maliyeti > değer. İsteğe bağlı voting düşünülebilir.
- **RYD oy gönderimi** — PoW puzzle, değmez.
- **FreeTube/NewPipe'dan kod kopyalama** — AGPL/GPL; fikir adaptasyonu yeterli.
- **Invidious iç playlist'leri** (`/api/v1/auth/playlists`) — Invidious hesabına bağlı; YouTube playlist'iyle karışır, YouTube.js gelirse anlamsızlaşır.

---

## Uygulama notları (sonraki tur için)

- **Storyboard:** `/api/v1/storyboards/:id` yanıtı `{storyboards: [{url, width, height, count, interval, columns, rows}], width, height}` — `backend/invidious.py`'ye `storyboards(url)` wrapper + probe'a `storyboardSpec` alanı. Seekbar hover'da `seekTip` yanına sprite `background-position` hesabı. NewPipe'ın boyut kuralı uygulanabilir: width = playerWidth/4, max 2.5× tile.
- **Search suggestions:** `backend/invidious.py`'ye `suggest(query)` → renderer'da `stSearchInput` input event'inde debounce + datalist/dropdown. `browserAddressSuggestions` ARIA kalıbı tekrar kullanılabilir.
- **MediaSession:** `navigator.mediaSession.metadata = new MediaMetadata({title, artist: channel, artwork: thumbnail})`; action handler'lar `play/pause/seekbackward/seekforward/seekto/previoustrack/nexttrack` → mevcut `playerCommand`/`browserCommand` köprüsü. **Dikkat:** browser modunda site kendi mediaSession'ını kurar — bizim overlay ile çakışmayı `media-session` IPC'siyle main'de koordine etmek gerekebilir.
- **Yerel abonelik:** `browserSubscriptions.json` (settingsDir) + `channels:import/export` IPC + `feed_subscriptions` fallback: kanallar → `Promise.all(/channels/:ucid/latest)` → tarih sıralı merge. Piped `/feed/unauthenticated?channels=` tek istekle alternatif.
- **Bağımlılık politikası:** YouTube.js (MIT) tek büyük eklenti; diğer her şey mevcut fetch/Invidious kalıbında ek dependency gerektirmez. RYD/DeArrow/SponsorBlock yalnızca HTTPS API çağrısı.
- **Güvenlik:** Tüm üçüncü-parti API çağrıları (RYD/DeArrow) video ID'sini üçüncü partiye sızdırır → ayar altında, varsayılan kapalı veya "video detail'de yükle" modu önerilir (FreeTube yaklaşımı).
- **A11y:** Kart bağlam menüsü `role=menu` + ArrowUp/Down/Esc; kuyruk paneli `role=listbox`; storyboard img `aria-hidden` (dekoratif).

**Kaynaklar:** yuliskov/SmartTube (MIT) · FreeTubeApp/FreeTube (AGPL-3.0) · TeamNewPipe/NewPipe + NewPipeExtractor PR#6434/#647 (GPL-3.0) · iv-org/invidious `routing.cr` (AGPL-3.0) · TeamPiped/Piped + piped_dart OpenAPI (AGPL-3.0) · ajayyy/SponsorBlock + DeArrow (MIT) · Anarios/return-youtube-dislike (GPL-3.0) · LuanRT/YouTube.js (MIT) · electron/electron docs + PR#32848 · omersusin/piTube · ViewTube/Materialious/Clipious
