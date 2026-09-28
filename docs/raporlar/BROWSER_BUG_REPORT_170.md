# BROWSER_BUG_REPORT_170 — R190 Devin Review toplu triage (PR 84–117)

**Kapsam:** Birleştirilmiş PR 84–117 aralığında Devin Review'in bıraktığı **91 bulgu** (28 bug · 3 security · 59 flag · 1 info) tek tek koda karşı doğrulandı. Bug/security sınıfındaki **31 bulgunun tamamı gerçek ve bu dalda düzeltildi**; flag/info sınıfı ayrıca değerlendirilip triage edildi.

## Doğrulanmış ve düzeltilen bug/security bulguları (31)

| PR | Bulgu | Kök neden | Düzeltme |
|---|---|---|---|
| 89 | Tam kelime araması geçerli eşleşmeyi atlıyor | `wholeWord` komşuluk kontrolü ham `charCodeAt` ile işaret/emojiyi base karakter sanıyordu | `neighborBaseChar` — genişletici karakterler atlanıp gerçek base'e bakılır |
| 89 | Birleşen işaretlerde eşleşmeler kayboluyor | Eşleşme sonu birleşen işaretin ortasında kesiliyordu | `end`, `MARK_EXTEND` karakterleri kapsayacak şekilde uzatılır |
| 89 | Emoji araması yarım eşleşme üretiyor | ZWJ/emoji-modifier/regional-indicator (🇹🇷) çiftleri ortadan bölünüyordu | `isClusterBoundary`: ZWJ komşuluğu, `CLUSTER_EXTENDER`, RI-çifti paritesi; `codePointBefore`/`codePointAt` surrogate-güvenli sürümleri |
| 90 | Kapanışta yeni site simgeleri kayboluyor | `before-quit` favicon kuyruğunu boşaltmıyordu | `flushBrowserFavicons()` `before-quit`'e bağlandı |
| 90 | Geciken simge yanlış siteye kaydediliyor | `page-favicon-updated` async fetch, navigasyon sonrası eski sekmenin favicon'unu yeni URL'ye yazıyordu | `faviconPageUrl` async öncesi yakalanır; dönüşte staleness kontrolü (`isDestroyed`/`_faviconSource`/`browserPageUrl`) |
| 90 | Geçici yazım hatası simgeleri kaybettiriyor | Atomik yazı hatasında kuyruk verisi düşüyordu | 5 sn sonra tek seferlik yeniden deneme (`allowRetry` + `unref`) |
| 91 | Çıkarma hatası mevcut hedefi siliyor | `open(dest,'xb')` `FileExistsError` attığında `except` önceden var olan dosyayı da siliyordu | `created` bayrağı: yalnız bu çağrının oluşturduğu dosya silinir |
| 93 | Kısaltılmış IPv4 yazımları özel-adres kapısını atlatıyor | `ipaddress` `127.1`/hex/octal/decimal biçimlerini reddiyor → allowlist'e "eşleşmedi" olarak geçiyordu | Hostname lowercase + `socket.inet_aton` fallback normalizasyonu |
| 93 | Yönlendirmeler updater hedef kapısını atlatıyor | `urlopen` redirect zincirlerini kapısız izliyordu → allowlisted host zararlı hosta 302 verebilirdi | `_CheckedRedirectHandler` her hop'u `_url_is_allowed`'dan geçirir; `_checked_opener(allow_http_localhost)` |
| 96 | Yinelenen katalog ID'si başka kaydı eziyor | `resolveImportIndexes` yalnız `byImportRef/byImdb/byTmdb/titles` kontrol ediyor; `indexById` çakışması add-dalına düşüp mevcut kaydı eziyordu | Add dalında `indexById.has(incoming.id)` → yeni `randomUUID()` rekey |
| 97 | Geçici GPU arızası CUDA tercihini siliyor | `env-info` yokluğunda `device.value='cpu'` kalıcı tercihi eziyordu | `state.gpuMissing` ayrı bayrak; kullanıcı tercihi korunur |
| 97 | CPU fallback rozeti float16 reklamı yapıyor | GPU'suzken rozet "CUDA float16" gösteriyordu | `updateGpuBadge` → 'CUDA · algılanmadı' / 'CUDA · not detected' |
| 98 | Spesifik altyazı varyantları filtreyi kaybediyor | `sameLanguage` yalnız birincil dili karşılaştırıyordu; `pt-BR` ile `pt-PT` aynı sayılıyordu | `langTag` → `{primary, variant}` (ISO 639-2→1); iki taraf da varyantlıysa eşitlik şart, tek taraf bare ise birincil yeter |
| 101 | Canlı ASR parçaları yeni hızlarda reddediliyor | Worklet [0.0625,16] kelepçelerken `browser:liveAsr:chunk` kapısı ve `parse_chunk_rate` hâlâ [0.25,4] istiyordu → >4× oynatmada canlı transkript duruyordu | Her iki kapı [0.0625,16] ile uyumlu hale getirildi (main.js + `live_asr.py`) |
| 105 | Açık onay sırasında sekme kapanması | `Ctrl+W` modal açıkken sekmeyi kapatıyordu; modal yalnız Esc/Tab'i tutuyordu | `Ctrl+W` `dialog[open]` kontrolüyle gardlandı |
| 105 | Dil değişiminde daraltılmış gruplar açılıyor | Grup anahtarı `toLocaleLowerCase(uiLocale)` kullanıyordu; TR↔EN geçişte I/İ içeren adların anahtarı değişiyordu | `toLowerCase()` (locale-bağımsız Unicode fold) her iki siteye |
| 105 | Ekran görüntüsü seçicisinde Türkçe başlık | `saveBrowserPageCapture`/`captureBrowserVideoFrame` çağrı yerleri sabit TR başlık geçiyordu | `dt(tr,en)` sarmalı |
| 105 | Hızlı açılan diyalogda eski dil | `loadSettings()` diskten taze okuyor; renderer'ın 400ms `scheduleSave` debounce'u eski `uiLocale`'yi döndürüyordu | Anında `app:ui-locale` push (`preload.notifyUiLocale`) + `lastRendererUiLocale` — `authorizedBrowserSender` korumalı |
| 106 | Gönderici ratchet'i doğrulanmamış handler kabul ediyor | `ipc-parity` `.on` regex'i gevşekti; yeni `app:ui-locale` gibi gerçek idiomları da kaçırabilirdi | `ON_VERIFY` regex'i gerçek doğrulama deyimlerine sıkılaştırıldı (216 handle · 12 on · 0 unguarded) |
| 107 | Üst simgeli aygıt adlarında altyazı kaybı | `windowsSafeFileName` NFKC'sizdi; üst-simge "CON" varyantları Windows ayrılmış köklerini atlatıyordu | NFKC normalizasyonu + ayrılmış-kök prefix (`_`) |
| 108 | Eski yanıt yerel videoya uygulanıyor | DeArrow/RYD fetch sonucu, kullanıcı başka sekmeye geçtikten sonra oynatıcıya uygulanıyordu | `stillCurrent` katı kontrolü |
| 108 | Topluluk ayarları açık videoya uygulanmıyor | `browserDeArrowEnabled`/`browserRydDislikes` checkbox değişimi açık videoyu yenilemiyordu | Change dinleyicileri `maybeFetchPlayerVideoExtras()` çağırır |
| 108 | HLS kurtarması topluluk başlığını siliyor | Recovery sırasında `playerCommunityTitle` sıfırlanıp geri yüklenmiyordu | `{videoId, base}` anahtarlı saklama + `restorePlayerCommunityTitle()` |
| 108 | Yarım ağ yanıtları istekleri kilitliyor | `net.request` timeout 'response'da temizlenince body asılı kalıyordu; 'error'/'aborted' handle edilmiyordu | `done()` sarmalı + response'a 'error'/'aborted' dinleyicileri |
| 109 | BOM'lu TMDB metadata yüklenmiyor | `readTextLimited` baştaki `\uFEFF`'i bırakıyordu → JSON.parse başarısız | BOM strip |
| 110 | Windows paketinde iki belge bağlantısı kırılıyor | CONTRIBUTING/CODE_OF_CONDUCT paket dışında bırakıldı ama README göreli bağlantı veriyordu | Mutlak GitHub URL + açıklayıcı HTML yorumu |
| 110 | Canlı süreçte yanlış smoke başarısı | `smoke-windows-package` yalnız "alive" kontrolü yapıyordu; FATAL hatasıyla yaşayan süreç PASS dönüyordu | stderr fatal-marker taraması |
| 111 | Bozuk diyalog yanıtları EN modda Türkçe gösteriyor | `browser-dialogue` kullanıcıya dönen hataları sabit TR fırlatıyordu | `localize` parametresi (`deps.dialogText`); 5 throw sarıldı |
| 114 | Kota dolunca altyazı kaydı tutarsızlaşıyor | `writeSourceEdits` `QuotaExceededError`'ı yutup çağıranı "yazıldı" sanıyordu | Boolean dönüş + çağıranlarda uyarı |
| 115 | İngilizce aramalar görünür ayar/komutları ıskalıyor | Komut paleti haystack'i yalnız TR başlık tarıyordu | `UiLocale.t` haystack'i + her komut için çift dilli `titles[]` skorlaması |
| 117 | Dil geçişi sonrası geçmiş tarihleri İngilizce kalıyor | `ui-locale-change` `renderHistory()` çağırmıyordu | Dinleyiciye `renderHistory()` eklendi |

## Flag/info triage'ı (60)

59 flag + 1 info, bulgu başına kod karşılaştırmasıyla üç sepette değerlendirildi:
- **Düzeltmeyle kapatılan** (ör. komut paleti yerelleştirme kapsamı, ipc-parity regex gücü, README bağlantıları) — yukarıdaki tabloda.
- **Kasıtlı tasarım / risk bilinçli kabul** (ör. kullanıcı-ayarlı uçlara bare-fetch, UX trade-off'ları, bilinen flake davranışı) — `needs_human` olarak işaretlendi; ilgili PR thread'lerinde gerekçeli yanıt bırakılacak.
- **Sınır semantiği / politika kararı gerektirenler** — kullanıcı onayı olmadan davranış değiştirilmez; `needs_human`.

## Testler

- Yeni/güncellenen: `subtitle-find-replace` (+5 cluster, 23 toplam) · `browser-subtitle-search` (varyant matrisi pt-BR/pt-PT/pob/zh-CN) · `media-catalog-store` (dup-id rekey) · `browser-command-palette` (EN stub, 6) · `browser-favicon-cache` (flush-retry, 37) · `workspace-video-bounds` (existing-target, 16) · `ipc-parity` (regex) · `test_ytdlp_update` (+4, 22) · `test_transcribe` (chunk-rate aralığı) · `subtitle-find-replace-integration` (13) · `subtitle-find-perf` (2015) · `player-ui` (153) · `ui-locale`/`ui-locale-dynamic`/`dialog-locale`/`browser-dialogue`/`browser-video-extras`/`browser-subtitles`/`browser-controls-behavior`/`audit-tur5-main`/`audit-report-regressions` — hepsi yeşil.
- `test_transcribe.py` içindeki 9 `numpy` + 1 `faster-whisper` hatası çevresel (paketler bu kutuda yok) — değişiklikle ilgisiz.
- `node --check` / `py_compile` tüm dokunulan dosyalarda temiz.

## Windows etkisi

- `windowsSafeFileName` NFKC + ayrılmış-kök düzeltmesi Windows'a doğrudan yarar (üst-simge "CON" varyantları).
- Favicon flush + retry: Windows paket kalıcılığını iyileştirir.
- Live-ASR hız kapısı: >4× oynatan sitelerde Windows'ta da canlı transkript artık durmaz.
- **Doğrulanmadı (Windows el kontrolü):** uygulama kapanış/yeniden açılışta favicon kalıcılığı; dil değiştirildikten hemen sonra açılan dosya seçicinin dili; >4× oynatmada canlı altyazı akışı; komut paletinde İngilizce arama.
