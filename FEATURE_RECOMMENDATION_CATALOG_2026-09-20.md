# Öneri raporları tam kataloğu — 20.09.2026

Bu belge [önceki kısa karar özetinin](FEATURE_RECOMMENDATION_REVIEW_2026-09-20.md) yerine geçer. **Öncelik sırası değildir.** Kullanıcının istediği gibi önerileri kaynağındaki ayrıntıyı kaybetmeden görünür kılar. Bu belge ürün özelliği uygulamaz. Son eşzamanlı ürün commit'i: `2b67ea34` (SmartTube oynatma sırası); katalog senkronizasyon tabanı `master`: `f90a5b4`.

İncelenen öneri belgeleri: `BROWSER_FEATURE_RESEARCH_75.md`, `BROWSER_FEATURE_RESEARCH_76.md` (derin genişleme dâhil), `FEATURE_BLUEPRINTS.md` (BP01–07), `BROWSER-KOZMETIK-ONERILER-RAPORU-2026-09-11.md`, `docs/streaming-subtitle-research-2026-09-14.md` ve 180 depolu `docs/GITHUB_BENZER_PROJELER_STRATEJI_RAPORU_2026-09-01.md`. `TUM-ONERILER-UYGULAMA-DOGRULAMA-2026-09-12.md` eski önerilerin kapanış kaydı olarak, `ENTEGRASYON-PLANI.md` tarihsel entegrasyon görevi olarak okundu; bunlardan kapanmış işleri yeni özellik gibi tekrar önermiyorum.

Etiketler: **E** = ürüne uygun, bağımsız iş olarak eklemeyi öneririm; **K** = iyi fikir ama gerçek kullanım/teknik/lisans ölçümüyle koşullu; **B** = bilinçli bekletme (ürün odağına daha uzak); **R** = mevcut hedef için önermiyorum; **V** = mevcut kodda var veya aynı kabiliyetin bir kısmı var, sıfırdan ekleme değil kapsam testi gerekir. “E” uygulandı demek değildir. GitHub kaynaklarındaki API varlığı her örneğin çalıştığı anlamına gelmez. Kaynak lisansı, model paketi veya gizlilik varsayımı yeni bağımlılık eklenmeden yeniden doğrulanmalı.

## A. R75 — SmartTube, YouTube ve ilgili GitHub repoları

| No | Öneri | Karar ve somut sınır |
| --- | --- | --- |
| A01 | SmartTube kartında sağ-tık/uzun-bas menüsü (sonra oynat, kuyruğa ekle, kanalı aç, paylaş, yerel gizle, Watch Later) | **E** — mevcut kart click/klavye davranışını bozmadan ayrı menü; hesap gerektiren aksiyonlar menüye sahte işlev olarak konmaz. |
| A02 | Kullanıcının yönettiği oynatma kuyruğu (Play Next, sona ekle, sırala, çıkar, sonraki video, yeniden açılışta toparla) | **V** — `2b67ea3` ile kalıcı SmartTube sırası ve ended/Next bağlantısı eklendi. Yeni iş ancak sıralama/çıkarma/yarış kabulünde somut açık varsa. |
| A03 | “İlgilenmiyorum / bu kanalı gösterme” yerel filtreleri | **E** — YouTube hesabına geri bildirim gönderiyormuş gibi gösterilmez; geri alma ve görünür filtre durumu gerekir. |
| A04 | History, Playlists, Live, Music/Gaming/News için gerçek bölüm/sekme düzeni | **E** — mevcut trend çipleri ve watch-library geçmişiyle çift kayıt yapılmaz; bölüm seçimi/kaydı test edilir. |
| A05 | Yatay raf, çoklu grid ve Shorts dikey grid kart yerleşimleri | **K** — önce ekran ölçüsü/klavye gezinmesi ve mevcut grid performansı; TV görünümü için anlamlı olabilir. |
| A06 | Yerel abonelikler ve abonelik grupları, kenar çubuğuna sabitleme | **E** — Invidious oturumu olmasa çalışır; kanal ID tekilleştirme, profil/grup ve import/export birlikte. |
| A07 | OPML/CSV/JSON/NewPipe Takeout abonelik içe-dışa aktarma | **E** — biçimler ayrı doğrulanır; hesap parolası/oturum dışa aktarılmaz. |
| A08 | SmartTube sonuçlarında Shorts/izlenen/live/trending/yorum/önerilenleri kullanıcıya göre gizleme | **E** — ayar bazlı, geri alınabilir. YouTube sayfasındaki mevcut Hide Shorts CSS ile karıştırılmamalı. |
| A09 | Altyazı seçicisinde son kullanılan dil/izleri üste alma | **E** — mevcut `lastCaptionPrefs` kullanılarak; zorunlu/SDH ve otomatik iz yanlış seçilmez. |
| A10 | Kart boyutu, yazı ölçeği ve geniş TV grid ayarı | **E** — gerçek pencere/DPI testleriyle; salt kozmetik ama somut. |
| A11 | Canlı sohbet paneli | **B** — canlı yayın kullanım kanıtı ve kaynak/yenileme maliyeti gerekiyor. |
| A12 | SponsorBlock segmentlerini tüketme | **V** — mevcut; yeniden entegrasyon değil. Segment gönderimi/RYD oy gönderimi önerilmez. |
| A13 | Kart thumbnail'ında izleme ilerleme çubuğu ve tamamlandı rozeti | **V** — `fc42b40` ile kart ilerlemesi ve ana sayfada “İzlemeye devam et” rayı eklendi. Tamamlandı rozeti ayrı eksikse yalnız o dar parça ölçülür. |
| A14 | SABR/YouTube oynatma kırılmasına karşı probe/fallback izleme | **K** — gerçek kırılma oranı ve sürüm fixtürü olmadan yeni akış motoru eklenmez. |
| A15 | DeArrow alternatif başlık/thumbnail + “orijinali göster” | **K** — açık opt-in, tekil istek/caching ve üçüncü tarafa video ID gönderimi bildirimi. |
| A16 | Video kare ekran görüntüsü | **V** — mevcut video/altyazılı kompozit yolu önce tekrar doğrulanır. |
| A17 | Yerel veya açık URL'yi mpv/VLC'ye verme | **E** — doğrulanmış oynatıcı yolu ve yalnız yetkili/açık kaynak; imzalı/DRM URL'yi sızdıran genel menü değil. |
| A18 | Kanal community/post görünümü | **K** — kanal sekmesiyle birlikte, eksik instance'da düzgün boş durum. |
| A19 | YouTube-parite kısayolları `t`, `i`, `k`; çift-tıklama/dokunma seek | **E** — mevcut kısayol haritası ve sayfadaki input odaklarıyla çakışma testi. |
| A20 | YouTube storyboard sprite ile seekbar kare önizlemesi | **E** — [Invidious video API](https://docs.invidious.io/api/) metadata'sı kaynak olabilir; yoksa zaman/cue tooltip'i kalır, sprite/cache sınırlandırılır. |
| A21 | Yalnız-ses/arka plan oynatma | **K** — mevcut video/sekme lifecycle ve ses odağıyla davranış netleştirilmeli. |
| A22 | Yerel çalma listeleri ve Enqueue | **E** — oynatma kuyruğu ile farklı kalıcılık sözleşmesi; iki kavram UI'da ayrılır. |
| A23 | Invidious arama önerileri | **E** — [resmî endpoint](https://docs.invidious.io/api/) var; debounce, iptal, isteğin uzak instance'a gittiği görünür olmalı. |
| A24 | Invidious `captions?tlang=` üzerinden otomatik çeviri | **K** — [API bunu desteklediğini söylüyor](https://docs.invidious.io/api/), fakat kalite/zaman eşleşmesi kanıtlanmadan LLM çevirisinin yerine otomatik konmaz; servis çevirisi diye etiketlenir. |
| A25 | Invidious transcript endpoint'inden metin edinme | **K** — mevcut altyazı/transcript paneli ve cue kimliklerini bozmadan yalnız kaynak alternatifi olarak. |
| A26 | Clips ve hashtag sayfası | **B** — video/altyazı iş akışına sınırlı katkı. |
| A27 | Kanal sekmeleri: videos, shorts, streams, podcasts, releases, courses, playlists, community, related channels, kanal içi arama | **E** — tek kanal sayfası kapsamında, desteklenmeyen endpoint/instance fallback'iyle. |
| A28 | Playlist detay sayfası ve arama sonuçlarından playlist açma | **E** — backend `playlist()` mevcut; UI ve sayfalama eksikliği ayrıca test edilir. |
| A29 | Invidious `hl` ile yerelleştirilmiş API alanları | **K** — kaynak başlık/altyazı ve UI locale birbirine karıştırılmamalı. |
| A30 | Auth history, playlists, feed, notifications ve watched işaretleme | **K** — yalnız kullanıcı hesabı açıkça bağlanınca; yerel geçmişten ayrı tut. |
| A31 | Piped hesapsız çok-kanallı feed ve arama önerisi yedeği | **K** — örnek instance güvenilirliği, şema ve veri sızıntısı ölçülmeli. |
| A32 | Piped stream/search/comment/reply failover'ı | **K** — Invidious başarısızlıklarının ölçüsü ve tutarlı kaynak kimliği olmadan ikinci motor maliyetli. |
| A33 | Piped SponsorBlock/RYD passthrough | **B** — mevcut kaynaklar çalışırken çoğaltma. |
| A34 | Return YouTube Dislike sayısı/puanı | **K** — yalnız detayda, opt-in ve video-ID başına tek istek; oylama göndermek **R**. |
| A35 | YouTube.js ile auth gerektiren playlist, beğeni, abonelik, geçmiş, yanıt ve live chat | **K** — [proje MIT ve etkin](https://github.com/LuanRT/YouTube.js/) ama InnerTube özel API ve kimlik köprüsü ağır; ayrı güvenlik/oturum deneyi gerekir. |
| A36 | `navigator.mediaSession` oynatma tuşları/OS now-playing/seek | **E** — yerel oynatıcı ile web sayfasının medya oturumu çakışmamalı; aktif kaynak ve kapanış temizliği. |
| A37 | Windows thumbar butonları ve görev çubuğu ilerlemesi | **K** — `setProgressBar` kodda kısmen kullanılıyor; önce mevcut kullanım/Windows smoke'u, sonra oynatma/iş ilerlemesi ayrımı. |
| A38 | Uyku zamanlayıcısı, radio/related-video zinciri, shuffle-all, most-played sıralaması | **E** — her biri ayrı görünür kontrol; otomatik video zinciri varsayılan kapalı. |
| A39 | Canlı sohbet polling, cookie rotation, bildirim kutusu parser'ı | **B** — servis bakım/hesap riski; kullanıcı senaryosu çıkarsa tekrar bak. |
| A40 | Materialious/ViewTube/Clipious görünüm desenleri ve watch-party | **K** — bölüm/altyazı kartı fikirleri alınabilir; doğrudan kod portu ve watch-party şimdilik yok. |

## B. R76 — yerel medya, tarayıcı, gizlilik ve sayfa araçları

| No | Öneri | Karar ve somut sınır |
| --- | --- | --- |
| B01 | Yerel videoda seekbar görseli: ffmpeg tek kare veya Jellyfin tile-sprite / thumbfast deseni | **E** — mevcut browser-reference thumbnail'ı yerel oynatıcıya doğrudan bağlı değil; yetkili dosya IPC'si, iptal/önbellek, zoom ve scrub performansı gerekir. |
| B02 | Chapter adı/sessizlik/siyah kareyle intro-jenerik algılama | **K** — chapter/SponsorBlock zaten var; önce yanlış atlama korpusu, sonra açık onaylı öneri. Chromaprint'i özel build kanıtı olmadan ekleme. |
| B03 | OpenSubtitles moviehash + dosya boyutu ile daha kesin altyazı arama | **E** — dosya yetkisi ve doğru sürüm/rank doğrulamasıyla; genel çok-sağlayıcılı `subliminal` **K**. |
| B04 | Gizli sekme | **K** — in-memory partition ve oturum/indirilenler/yer imleri/DRM sınırları tasarlanmalı. |
| B05 | Konteyner sekmeleri, site başına proxy/Tor | **B** — SSO/DRM/izin etkisi yüksek; sırf tarayıcı-paritesi için değil. |
| B06 | Sekme hover önizleme kartları ve duplicate/close-others/close-right/copy-URL menüsü | **E** — mevcut sekme yaşam döngüsüne ve klavye/a11y akışına uyarlanabilir. |
| B07 | Siteyi ayrı pencere/SSB olarak açma | **K** — BrowserWindow çoğalması, profil/izin ve geri-dönüş davranışı ölçülmeli. |
| B08 | ClearURLs/De-AMP/temiz link kopyalama ve yönlendirme çözme | **K** — küçük, açık kural listesi + istisnalar; imzalı/ödeme/oturum URL'lerini bozmama testi. Tam uzak kural kataloğu ayrıca lisans/mahremiyet incelemesi. |
| B09 | Çerez onayını otomatik-ret | **K** — üçüncü taraf kural lisansı ve sitenin işlevini bozma/yanlış tıklama testleri olmadan genel enjeksiyon yok. |
| B10 | Kozmetik element picker | **E** — mevcut uygulayıcıya UI eklemek; seçici yalnız kullanıcının onayıyla saklanır, geri alma var. |
| B11 | Site profiliyle JS/resim/büyük medya kapatma | **K** — video/altyazı keşfini bozacağından açık site istisnası ve görünür durum gerekli. |
| B12 | Üçüncü taraf Cookie/Referer/ETag kırpma, Privacy-Badger sezgisi, uMatrix-lite, Lightbeam grafiği | **B** — karmaşık mahremiyet motoru ve streaming uyumluluk maliyeti; somut izleyici sorunu ölçülmeden değil. |
| B13 | DLNA/Chromecast ve Remote Playback probe'u | **K** — önce Electron'da açık yerel medya ile yetenek testi; [W3C API tanımı](https://www.w3.org/TR/remote-playback/) derli Cast servisinin kanıtı değildir. DLNA için eşleme/altyazı yetkisi gerekir. |
| B14 | Otomatik PiP ve sinema/odak modu | **E** — mevcut mini-player üzerinden opt-in; site kontrollerini örtmemeli. |
| B15 | Video parlaklık/kontrast/saturation ve ses yükseltme | **V/K** — parlaklık/kontrast ve normalleştirme mevcut; yeni saturation/gain yalnız CORS/ses güvenliği testiyle. |
| B16 | Sekme sesini WAV'e veya video+sesini WebM'e kaydetme | **K** — mevcut PCM/capture parçaları, ama rıza/DRM/depoya sızma ve dosya boyutu sınırları tasarlanmalı. |
| B17 | TV/gamepad için uzamsal gezinme ve ekran klavyesi | **K** — SmartTube grid gezinmesi var; genel web sayfası değil. Kumanda hedefi netleşirse. |
| B18 | Whisper ile adres/arama alanına sesli giriş | **K** — hazır ASR hattının mikrofon izni ve hedef alanı açık gösterilerek. |
| B19 | Reader/seçim TTS (`speechSynthesis` veya güncel yerel motor) | **K** — okuma kullanımı doğrulanırsa; arşivli eski Piper doğrudan bağımlılık yapılmaz. |
| B20 | Web sayfasını PDF'e kaydetme | **E** — MHTML'den ayrı çıktı, dosya seçimi ve gizli sayfa verisi uyarısı. |
| B21 | Sayfa bağlantısını QR gösterme; Markdown olarak kopyalama | **E** — basit paylaşım/araştırma aracı; URL/userinfo temizliği ve clipboard testi. |
| B22 | Çevrimdışı okuma listesi (MHTML + sayfa indeksi) | **E** — mevcut iki parçayı birleştirme, silme/yenileme ve arşiv kapsamı belli olsun. |
| B23 | Mobil görünüm/cihaz emülasyonu | **K** — site oynatıcı ve oturum etkisi için site bazlı, kolay geri alma. |
| B24 | Adres çubuğu arama kısayolları (DDG bangs, `!yt`) | **E** — açık eşleme, arama verisinin hedef servise gidişi görünür. |
| B25 | Userscript yöneticisi ve GM_* yetkileri; pre-nav script | **K** — yalnız açık kullanıcı yüklemesi, `@match` sınırı, izole dünya, izin modeli ve `GM_xmlhttpRequest` için güçlü yetki duvarı. Genel CORS bypass varsayılan olamaz. |
| B26 | Tam Chrome eklentileri, şifre kasası | **B/R** — Electron tam Chrome uyumluluğu hedefi değil; kimlik bilgisi kasası güvenlik ürünüdür, bu uygulamanın çekirdeği değil. |
| B27 | Otomatik güncelleme, EVS üretim imzası, youtube.com/tv deneyi | **K** — güncelleme imza/geri alma/dağıtım kanalıyla; EVS gerçek dağıtım sözleşmesiyle; TV sitesi UA hilesi deneysel. |

## C. R76 derin genişleme — ayrı fikirlerin tamamı

| No | Öneri / kaynak deseni | Karar ve sınır |
| --- | --- | --- |
| C01 | Vieb pointer-mode, çok-sekmeli arama, marks/historyswipe/visual mode | **K** — klavye kullanıcısı için işlevli; link-hints/split mevcut, tekrar etmeyip yeni etkileşimleri ayrı test et. |
| C02 | Vieb erwic/site-pencereleri, userAgentData override, linkedom reader ayrıştırma | **B** — ilki profil karmaşıklığı; spoof site bozabilir; reader değiştirmek için ölçülmüş darboğaz gerekir. |
| C03 | Nyxt auto-rules: siteye göre reader/dark/çeviri/zoom birleşik eylemleri | **E** — mevcut site profiline sınırlı deklaratif kural olarak; döngü/çakışma ve en özgül kural sözleşmesi. |
| C04 | Nyxt dallanan geçmiş ağacı, yer imi etiketleri, clipboard ring | **K** — düz geri/ileri ve mevcut geçmişten farklı UX; veri şeması/geri uyum ölçülür. |
| C05 | qutebrowser quickmarks, domain ayar döngüsü, hint filtreleri, lazy-load | **K** — mevcut komut paleti/link-hints/hibernation ile farkı netleştir. |
| C06 | Textarea'yı uygulama editöründe açıp geri yazma | **K** — sayfa kimliği/DOM değiştirme yarışı ve hassas form metni mahremiyeti. |
| C07 | mpv chapterskip/quality-menu/uosc/autosubsync desenleri | **V/K** — chapter/quality/senkron modülleri mevcut; yalnız başarısız fixture ile eksik alanı seç. |
| C08 | transformers.js ile yerel semantik sayfa geçmişi | **K** — sayfa FTS mevcut, altyazı semantik işçi mevcut; sayfa embedding'i yeni saklama/mahremiyet/model boyutu işi. |
| C09 | Çevrimdışı sayfa özeti, sayfa dili/türü sınıflama, NSFW thumbnail bulanıklaştırma | **K/B** — üç ayrı ML işi; gerçek kullanıcı senaryosu ve yanlış-pozitif ölçüsü olmadan paket ekleme. |
| C10 | rnnoise/silero canlı-ASR gürültü temizleme | **K** — konuşma doğruluk korpusu ve gecikme/CPU ölçümüyle. |
| C11 | `Page.setWebLifecycleState` ile DOM'u koruyan sekme dondurma | **K** — mevcut unload/hibernation'dan ayrı; oynayan video, yakalama, DevTools ve geri açılma gerçek Electron smoke'u şart. |
| C12 | `Page.addScriptToEvaluateOnNewDocument` ile yükleme öncesi enjeksiyon | **K** — yalnız yetkili dahili site-scriptleri/userscript sözleşmesi kapsamında. |
| C13 | `Network.setBlockedURLs`, timezone/locale override | **B** — site/altyazı bağlantısı ve oturum davranışını bozabilir; özel ihtiyaca bağla. |
| C14 | `netLog`/`crashReporter`, `utilityProcess`, `MessageChannelMain` | **K** — sırasıyla gizlilik ayıklanmış tanı, ölçülmüş main-thread yükü, büyük IPC darboğazı varsa. |
| C15 | Trakt, Simkl, AniList izleme/scrobble köprüsü | **K** — ayrı opt-in OAuth, idempotency ve hesap verisi denetimi. |
| C16 | guessit dosya adından dizi/bölüm/release eşleştirme | **K** — mevcut series-memory ayrıştırıcısına karşı yanlış eşleşme/başarı matrisiyle. |
| C17 | TMDB/fanart poster-özet-bölüm zenginleştirme | **K** — kimlik eşleştirme ve API anahtarı/başlık telifi; medya kitaplığına yarayabilir. |
| C18 | PeerTube bağımsız video kaynağı | **B** — video keşfi genişler ama çekirdek altyazı/YouTube akışını çözmez. |
| C19 | aria2 devam-edebilir indirme | **K** — mevcut indirme başarısızlığı ve çok büyük dosya ölçümü varsa, yeni binary/lisans yönetimiyle. |
| C20 | WebTorrent/Magnet akışı | **R** — ürün ve destek kapsamını gereksiz büyütür. |
| C21 | Playwright Electron E2E; görsel snapshot | **K** — mevcut gerçek Electron smoke'un kapsayamadığı belirli UI yarışı/farkı için hedefli senaryo, bağımlılık olsun diye değil. |
| C22 | axe-core/pa11y erişilebilirlik testi | **E** — mevcut ARIA/klavye davranışını regresyonla korumak için; gerçek odak akışı ayrıca el ile incelenir. |
| C23 | knip/madge/dependency-cruiser kod ve modül grafiği | **K** — rapor çıktısı önce yanlış-pozitif süzgecinden geçmeli; yeni CI kapısı için kanıt gerekir. |
| C24 | eruda/vConsole sayfa içi debug paneli | **B** — yalnız geliştirici test profilinde; yabancı sayfaya varsayılan script enjekte edilmez. |
| C25 | imsc gelişmiş TTML/IMSC render, vtt.js parser referansı | **K/V** — temel TTML/stpp parser zaten var; yalnız stil/konum/IMSC gerçek fixture'ında eksiğin kanıtı olursa. |
| C26 | JASSUB/libass ile tam ASS animasyon/font/karaoke | **K** — mevcut ASS renderer'a karşı somut destek farkı ve WASM/COOP/COEP maliyetiyle. |
| C27 | Subtitle Edit: waveform edit, SDH temizleme, toplu hata, shot-change, 30+ format, PGS/VobSub OCR, point-sync | **K/V** — waveform/SDH/senkronun mevcut kısımları tekrarlanmaz; OCR yeni ağır boru, gerçek örnek şart. |
| C28 | aeneas/alass ses-metin hizalama | **K** — mevcut ffsubsync/Whisper yollarının başarısız olduğu ölçülü örneklerle. |
| C29 | Tray, Windows JumpList, login-at-start | **K** — üçü ayrı kullanıcı seçimi; otomatik açılış varsayılan olmasın. |
| C30 | `whisper://` deep link, app badge, yerel bildirim, Web Share | **K** — URL/doğrulama ve tek-örnek güvenliği; bildirim gürültüsü sınırı. |
| C31 | Gamepad nav, sanal klavye/OSK, caret browsing, orta-tık autoscroll, EyeDropper | **K/B** — TV/klavye senaryosu kanıtlanırsa; her biri ayrı erişilebilirlik/sayfa etkileşim testi. |
| C32 | MediaCapabilities otomatik codec/kalite seçimi | **K** — mevcut kalite seçimi ve gerçek dekoder başarısı ölçülmeden otomatik karar yok. |
| C33 | `getVideoPlaybackQuality`/rVFC “stats for nerds” ve kare-kare ilerleme | **E/V** — frame-step yerel oynatıcıda mevcut; site videosu ve tanı overlay'i ayrı, gerçek ölçümle. |
| C34 | Speculation Rules prefetch, ambient video blur | **B** — birincisi gereksiz ağ/gizlilik, ikincisi kozmetik ve GPU maliyeti. |
| C35 | Sekme auto-refresh, multi-highlight, form recovery | **K** — her biri ayrı kullanıcı verisi/zamanlayıcı sözleşmesi; form metni varsayılan saklanmaz. |
| C36 | Omnibox hesaplayıcı, Markdown bağlantı kopyası, hover-zoom görsel | **E/K** — hesaplayıcı ve kopya küçük; hover-zoom sayfa tıklama/mahremiyet etkisi nedeniyle koşullu. |
| C37 | HTTPS-First ve WebRTC yerel IP kısıtı | **K** — kırılan siteler için açık geri alma ve hedef tarayıcı testi. |
| C38 | Fingerprint gürültüsü, canvas/audio/timezone/locale spoof | **R** — bot/DRM/oturum sorunları ve yanlış güvenlik hissi. |
| C39 | DDG Fire Button (oturum/veri silme) | **K** — hedefleri tek tek gösterip onaylatan, geri alınamayan işlem uyarılı tasarım; tek-tık kör silme olmaz. |
| C40 | floccus/WebDAV/GDrive yer imi-ayar senkronu | **B** — veri modeli ve gizli anahtar senkronu güvenliği çözülmeden. |
| C41 | wallabag/linkding/archivebox dışa gönderim; archive.org SPN; WARC/replayweb | **K** — kullanıcı seçimi ve uzak URL/veri paylaşımı bildirimi; MHTML zaten var. |
| C42 | RSS/podcast keşfi ve oynatma | **K** — açık medya kaynağı olarak ilginç, ancak ayrı ürün akışı. |
| C43 | Vivaldi komut zincirleri/uyarlanır tema; Opera sabit-site sidebar/GX-kaynak kontrolleri | **K/B** — kaynak sınırı varsa GX ölçülebilir; sidebar/tema asıl video akışına ikincil. |
| C44 | Arc tarzı sayfa çizimi/easel, site CSS boosts, RSS live-folders | **K** — not defterine gerçek yarar gösterilirse; uzaktan sayfa CSS'i kalıcı olarak bozmama. |
| C45 | Kayıpsız medya kesme/birleştirme ve altyazı senkronu (LosslessCut deseni) | **K** — yerel medya kullanımı için güçlü ama ayrı ffmpeg/export ürünü; ilk/son GOP sınırları dürüst gösterilmeli. |
| C46 | Kodi desenli LAN telefon kumandası; Syncplay watch-party; KDE Connect/OBS köprüsü | **K/B** — kumanda için explicit pairing/token/bind/CSRF, diğerleri kullanım kanıtı olmadan ertelenir. |
| C47 | AMOLED siyah/adaptive tema ve sekme/okuyucu görsel cilası | **K** — mevcut grafit/amber palet korunarak ayrı tasarım ve ekran görüntüsü denetimi. |
| C48 | TrackMeNot/AdNauseam sahte sorgu/tıklama, tam Chrome uyumluluğu, ipfs/hyper/Tor snowflake | **R** — etik/ürün/platform maliyeti; raporun ret kısmıyla aynı. |

## D. Yedi hazır şartname ve servis araştırması

| No | Madde | Karar |
| --- | --- | --- |
| D01 | BP-01 sekme dondurma | **K** — C11; mevcut unload yerine üstün olduğu iddiası kanıtlanmadı. |
| D02 | BP-02 seekbar hover önizleme | **E** — B01/A20; şartnamedeki “sadece UI bağlantısı” eksik, yerel oynatıcı dosya-yetki yolu ayrıca gerekir. |
| D03 | BP-03 userscript + GM_* | **K** — B25; en ağır güven sınırı `GM_xmlhttpRequest`. |
| D04 | BP-04 TTML/DFXP | **V** — `src/browser-subtitles.js` XML süre/paragraf/span ve `parseMp4Stpp`, `src/browser-dash-capture.js` statik parça yolu mevcut. Yalnız eksik biçim fixture'ı. |
| D05 | BP-05 semantik sayfa geçmişi | **K** — C08; FTS mevcut, semantik cue işçisi mevcut, sayfa embedding'i değil. |
| D06 | BP-06 Remote Playback/cast | **K** — B13; gerçek Electron probe şart. |
| D07 | BP-07 telefon kumandası | **K** — C46; LAN açmadan önce tehdit modeli. |
| D08 | Discovery+/Max/Netflix/Hulu/MUBI/Great Courses tam altyazı yolları | **K** — servis başına izinli gerçek manifest/yanıt fixtürü; önce parça bütünlüğü, cue zaman haritası ve son parça kanıtı. DRM kırma veya URL tahmini yok. |
| D09 | DASH SegmentTemplate/Timeline/period, HLS/CEA tam yakalama | **V/K** — genel statik DASH/stpp/CEA kodu sonradan eklendi; 14 Eylül araştırmasının “yok” teşhisi tarihseldir. Yeni site açığı ayrı fixture ve uygulama sürümünde doğrulanır. |

## E. Kozmetik/UX raporu — ayrı tutulması gereken somut maddeler

| No | Öneri | Karar |
| --- | --- | --- |
| E01 | Kapalı içindekiler bağlantısında hover/focus ve otomatik kaydırma affordance'ı | **E** — klavye odağı ve okunabilir durumla. |
| E02 | Uzun okuyucu metninin 180 karakter eşiğini kullanıcıya açıklama | **E** — teknik sınıra uygun kısa mikro metin. |
| E03 | Komut paleti `Ctrl+P` kısayolu | **K** — yazdır/PDF ve tarayıcı kısayoluyla çatışma denetimi. |
| E04 | Durum rozetlerinin hiyerarşisi | **V/K** — altyazı arama, burn-in ve çalışma ortamı/bakım durumları renk dışında açık metin ve simge taşır; uygulamanın kalan eski rozetleri ancak ekran-bazlı bir açık bulunursa ele alınır. |
| E05 | Boş durum metinleri ve yeniden dene geri bildirimi | **V** — altyazı aramasında hata, boş sonuç ve kısmi sonuç ayrıldı; davranış testleri locale-bağımsız saf durum kopyasını doğruluyor. |
| E06 | Burn-in işinde GPU kullanımı ve ilerleme görünürlüğü | **V** — doğrulanmamış GPU iddiası gösterilmez; aşama, `m:ss/m:ss` süre ve “İptal ediliyor…” durumu görünür. |
| E07 | Bakım ekranı parantezli açıklamaları sadeleştirme | **V** — çalışma ortamı/bakım paneli kısa EN/TR metin, Python/FFmpeg/yt-dlp/GPU/model diski durumu ve açık eylemlerle gerçek Electron ekranında doğrulandı. |
| E08 | Responsive, reader spacing, overlay clipping ve tooltip düzeltmeleri | **V/K** — yeni bakım paneli geniş İngilizce ve dar Türkçe gerçek Electron ekranlarında taşmasız doğrulandı; reader/overlay/tooltip kapsamının tamamı için zoom/DPI ve video üstü menü matrisi hâlâ açık. |
| E09 | Rapor terminolojisini mevcut HTML/renderer adlarıyla eşitleme | **V** — bu katalog ve kabul matrisi güncel `Runtime and maintenance`, model benchmark ve bakım eylemleriyle eşlendi; ürün özelliği değildir. |

## F. 180 GitHub deposu araştırması — atlanmış strateji önerilerinin tamamı

Kaynak: `docs/GITHUB_BENZER_PROJELER_STRATEJI_RAPORU_2026-09-01.md`. Bu rapor 180 depoyu beş kümede taramış, 38 projeyi daha derin okumuş ve aşağıdaki ayrı ürün kararlarını çıkarmıştır. Eski rapordaki “eksik” tespitleri 1 Eylül anlık görüntüsüdür; aşağıdaki durumlar 20 Eylül güncel ağacına göre yeniden sınıflandırılmıştır.

| No | Öneri / kaynak dersi | Güncel karar ve kanıt sınırı |
| --- | --- | --- |
| F01 | Kalıcı browser oturumu + kanonik medya kimliği | **V** — `src/browser-session-store.js`, workspace/session IPC'leri ve geri yükleme regresyonları var. Yeni iş ancak belirli servis kimliği veya geri yükleme vakası bozuksa açılır. |
| F02 | Oynatma kafasının önünde cümle tabanlı web çeviri zamanlayıcısı | **V** — `src/browser-translation-scheduler.js` ve seek/revision/provider hata testleri mevcut. Bellek sızıntısı varsayımı ayrıca doğrulanmış bir açık değildir. |
| F03 | Görünür caption edinme merdiveni | **V** — `src/browser-acquisition.js` hazır iz → ağ/manifest → saklanan/elle verilen → Live ASR/OCR basamaklarını modelliyor. UI'da belirli bir basamak anlaşılmıyorsa mikrocopy/teşhis işi açılabilir. |
| F04 | Servis yetenek matrisi: giriş, oynatma, caption, iki iz, overlay, çeviri, son doğrulama | **E/K** — edinme/adaptör altyapısı var; tarihli gerçek-site matrisi sürekli bakım belgesi olarak değerli. Giriş gerektiren servisler “kod var” diye doğrulandı sayılmaz. |
| F05 | Browser mimarisini küçük servis sınırlarına ayırma ve ortak olay zarfı | **V/K** — session, acquisition, adapter, overlay, asset, diagnostics, scheduler gibi modüller ayrılmış. Toplu yeniden yazım yok; yalnız ölçülmüş monolitik bağımlılıklar küçük adımlarla çıkarılır. |
| F06 | API/HF anahtarlarını OS güvenli deposuna taşıma | **V** — `src/secret-store.js`, `src/settings-security.js` ve Electron `safeStorage` entegrasyonu mevcut; export/redaction/göç testleri var. |
| F07 | Overlay ve medya gözlem yaşam döngüsü; görünmez/kapalıyken pahalı döngüyü durdurma | **V/K** — controller/lifecycle testleri ve kaynak bütçeleri var. Genel refactor değil, gerçek uzun-oturum CPU/observer büyümesi bulunursa hedefli düzeltme. |
| F08 | Kalıcı web cue varlığı + SQLite FTS ve zamana deep-link | **V** — watch index/assets ve FTS yolu mevcut. Ortamda FTS5 derlenmemişse bu ürün tasarımı değil paketleme/ortam kabul maddesidir. |
| F09 | Cümleyi alıntı/not/kelime/görsel/ses referanslı kalıcı çalışma nesnesi yapmak | **V** — note store, learning durumu, screenshot/audio referansı, Markdown ve Anki dışa aktarımı mevcut. Yeni tür ancak gerçek kullanım verisiyle. |
| F10 | İzleme politikaları: normal / boşluğu hızlandır / boşluğu atla / shadowing / cue loop | **V** — playback policy ve güvenlik-media-learning testleri mevcut. |
| F11 | Yerel medyadaki gömülü altyazı izlerini birinci sınıf kaynak yapmak | **V** — `src/media-subtitle-tracks.js`, `media:probeTracks` ve `media:extractSubtitleTrack` metin/bitmap ayrımını yapıyor; bitmap için OCR gereksinimi açık dönüyor. |
| F12 | Browser'dan transkripsiyon/altyazı/klip kuyruğuna köprü | **V/K** — queue persistence ve browser medya/asset yolları var; DRM'li akış indirme kapsam dışı kalmalı. Eksik olduğu iddia edilen her eylem ayrı UI→IPC→iş testiyle gösterilmeli. |
| F13 | Cue editörünü undo/redo, taslak, işlem günlüğü, find/replace ve sabit kimlikli belge modeline yükseltme | **V/K** — timeline undo/redo, taslak uygulama, find/replace ve düzenleme regresyonları var. “Tek kanonik belge modeli” geniş refactor olarak değil, kanıtlanan veri yarışı varsa ele alınır. |
| F14 | Kullanıcı tetiklemeli sekme/sistem sesi Live Whisper yedeği | **V** — `backend/live_asr.py`, edinme basamağı, stop-drain ve worklet testleri mevcut. Gerçek cihaz/ses yönlendirme matrisi ayrı kabul sınırı. |
| F15 | Seçili alan/klip için hard-sub OCR | **V** — browser video analysis ve frame/ROI OCR mevcut; sürekli tam-kare OCR varsayılan yapılmaz. |
| F16 | Opsiyonel yerel çeviri motoru + deneysel eklenti yüzeyi | **K** — localhost sağlayıcı endpoint'i kullanılabiliyor, fakat genel eklenti ABI'si ayrı güvenlik/versiyonlama ürünüdür. Somut yerel motor ve kalite ölçümü olmadan çekirdeğe yeni runtime eklenmez. |
| F17 | Aynı 30–120 saniyelik klipte iki ASR/model ayarını ölçen kalite karşılaştırması | **V/K** — kullanıcı başlangıç/süre seçer; iki model aynı `clipHash` üzerinde RTF/speed, süreç veya GPU-delta VRAM ve bire-bir zamansal cue eşleştirmesiyle karşılaştırılır. Gerçek CUDA yükleme koşusu yapıldı; konuşma kalitesi kabulü için sesli referans klibi hâlâ gerekir. |
| F18 | Model/bağımlılık yöneticisi: boyut, disk, VRAM, devam, checksum, güvenli temizlik, capability registry | **V/K** — model kataloğu, kurulu/yarım önbellek ayrımı, disk alanı, kök-içi açık kullanıcı onaylı silme, çalışma sırasında ret ve Python/FFmpeg/yt-dlp/GPU görünürlüğü tamamlandı. yt-dlp güncellemesi HTTPS metadata + SHA-256 + bağımsız import + atomik pointer/rollback kullanır; byte-range indirme devamı iddia edilmez. |
| F19 | Prime Video, Crunchyroll, BBC iPlayer/ARTE/RaiPlay, Plex/Stremio, Coursera/Udemy, Vimeo adaptör genişlemesi | **K** — genel parser/adaptör yapısı kullanılmalı; bölgesel girişli servis gerçek cihazda doğrulanmadan “destekli” ilan edilmez. |
| F20 | Tarayıcı/altyazı için tarihli gerçek-site, performans, çeviri ve veri-güvenlik kabul matrisi | **V/K** — `docs/KABUL_MATRISI_2026-09-20.md` sürüm kapısı olarak mevcut ve otomatik satırlar güncel kanıt taşıyor; giriş/cihaz/uzun-soak isteyen manuel satırlar açıkça bekliyor. |

### F kaynağındaki açık retler — yanlışlıkla yeniden önerilmeyecek

- Genel amaçlı Chrome klonu, password manager ve geliştirici eklentisi ekosistemi.
- React/Tauri'ye toplu yeniden yazım.
- DRM çözme veya korumalı akış indirme.
- Varsayılan sürekli OCR ve her videoda otomatik AI özet.
- Bulut tabanlı ortak çeviri cache'i.
- Dublaj/TTS'yi ana ürün yapmak veya motor sayısını başarı metriği saymak.
- Ana ekranı bağlamsız ayar kartlarıyla şişirmek.
- GPL/AGPL kodunu lisans incelemesi olmadan doğrudan taşımak.

### 180 repo envanterinin bu katalogdaki karşılığı

Kaynak rapordaki 180 depo tek tek “180 ayrı özellik” değildir. Tam kaynak listesi kaybolmadan aynı raporun Ek A bölümünde korunur: 38 ASR/motor, 36 editör-senkron-OCR, 30 oynatıcı/çift altyazı, 34 browser/canlı çeviri, 42 indirme-arşiv-kütüphane aracı. Bu katalog, o depolardan çıkarılan **20 bağımsız kararın tamamını** F01–F20 olarak taşır; 38 derin okunan proje ve 142 taranan adayın adlarını yapay biçimde özellik diye çoğaltmaz.

## Tekrar eklenmeyecek kapanmış öneriler

`TUM-ONERILER-UYGULAMA-DOGRULAMA-2026-09-12.md` üzerindeki dizi hafızası, fuzzy çeviri hafızası, SDH temizliği, prompt güvenliği, kalite korpusu, link hints, site hız hafızası, cue loop, video-kare kompoziti, sayfa FTS, ses normalizasyonu/temel video filtreleri, Dark Reader, tam sayfa screenshot, Anki export, condensed/auto-pause, SponsorBlock chapter, parser fixtürü, site bazlı adblock pause ve cue'ya tıklayıp seek zaten var/önceden tamamlandı. Yeni iş ancak bu özelliklerden biri için *somut açık* ve test olursa açılmalı.

## Kaynak ve doğrulama sınırı

Yerel kodda odaklı kontrol: `src/renderer/renderer.js` SmartTube kartı/kuyruk/recommendation, `backend/invidious.py` altyazı yolu, `src/browser-feature-services.js` referans thumbnail, `src/browser-reference-media.js`, `src/browser-subtitles.js`, `src/browser-dash-capture.js`, `src/watch-index.js` ve bunların testleri. **Bu belge her fikir için çalışır ürün prototipi veya her GitHub reposunun bugünkü tüm API/lisans ayrıntısının yeni baştan denetimi değildir.** Güncel olarak [Invidious API](https://docs.invidious.io/api/), [YouTube.js](https://github.com/LuanRT/YouTube.js/), [FreeTube](https://github.com/FreeTubeApp/FreeTube), [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents) ve [W3C Remote Playback](https://www.w3.org/TR/remote-playback/) birincil kaynakları yeniden kontrol edildi. [Eski Piper deposu arşivli](https://github.com/rhasspy/piper); SmartTube'un [MIT'e geçiş duyurusu](https://github.com/yuliskov/SmartTube/issues/5376) tarihsel tüm katkıların lisansını kendiliğinden ispatlamaz. GPL/AGPL/LGPL kaynak veya veri doğrudan kopyalanmadı. Ürün kodu ve kullanıcı verisi değişmedi; testler yalnız belge turu olduğu için çalıştırılmadı.
