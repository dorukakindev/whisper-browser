# BROWSER_BUG_REPORT_72 — Derin Player Denetimi (10 ajanlık)

**Tarih:** 2026-09-19 · **Kapsam:** oynatıcı + SmartTube uçtan uca · **Durum:** bulgular doğrulandı, düzeltmeler uygulandı

## Denetim yapısı

10 salt-okunur ajan paralel gönderildi; **3'ü rapor döndürdü** (A1 transport, A5 auth, A10 SmartTube), **7'si model rate-limit'e takıldı** (A2 altyazı hattı, A3 oynatma politikaları, A4 YouTube streaming, A6 altyazı yazma, A7 yerleşim, A8 a11y/i18n, A9 CSS). Rate-limit düşen kapsamların kritik sözleşmeleri kaynakta elle denetlendi; sonuçlar aşağıda ayrı işaretli.

## HIGH — doğrulandı ve düzeltildi

| # | Bulgu | Kaynak | Durum |
|---|-------|--------|-------|
| R72-1 | `load()` `playbackRate`'i sıfırlıyor ama `#playerSpeed` eski değeri gösteriyordu (hız desync) | A1 | Düzeltildi — `ratechange` dinleyicisi select'i senkronlar; `loadedmetadata`'da seçili hız yeniden uygulanır; menüde olmayan hızlar custom option ile temsil edilir |
| R72-2 | A-B döngüsü B'yi geçtikten sonra da A'ya sarıyordu — kullanıcı bilinçli B'nin ötesine seek etse bile döngüden çıkış yoktu | A1 | Düzeltildi — `player._abPrevT` ile yalnız B'yi "kesen" geçişte döngü; seek sonrası prev güncellenir |
| R72-3 | Transport kontrolleri (seek/volume/select/düğme) tıklama sonrası odağı tutuyordu → global kısayollar editable-target koruyucusuna takılıyor, native ok-tuşu çakışıyordu | A1 | Düzeltildi — pointerup'ta range blur, change'te select blur, click'te düğme blur (select click'te blur YOK — açılır menü kapanırdı) |
| R72-4 | SmartTube grid tuşları (`stGridNavKeydown`) `stopPropagation` çağırmıyordu → `.st-card` div olduğu için ok tuşları hem kart gezdiriyor hem videoyu kaydırıyordu; Space kart açarken videoyu da duraklatıyordu | A10-F1 | Düzeltildi — grid + kart + up-next Enter/Space yollarında `stopPropagation` |
| R72-5 | Popular/subscriptions'ta `Yükleniyor…` kartların önünde **kalıcı** kalıyordu (temizlik yalnız ≤1 çocuk koşulundaydı) | A10-F2 | Düzeltildi — kartlar append edilmeden `:scope > .inv-status` kaldırılır. (Not: ilk düzeltmede `innerHTML=''` trend chip'lerini de siliyordu — smoke `chipCount:0` ile yakaladı, `:scope` seçicisine daraltıldı) |
| R72-6 | Probe sürerken SmartTube kartına tıklamak `playerProbe.click()`'i no-op yapıyordu (düğme disabled) → tarayıcı kapanıyor, boş sahne kalıyordu | A10-F3 | Düzeltildi — `queuePlayerProbeFromCard`: `probeRequestSeq` ile istek tekilleşir, disabled iken 80 ms'de yeniden dener |
| R72-7 | OAuth modalı deviceCode await'i sırasında İptal/Esc ile kapanırsa **görünmez 30 dk'lık poll** başlıyordu; `_ytPolling` yalnız await sonrası set edildiği için yeniden açılınca `ytClientSave` sessiz no-op, tek iptal düğmesi gizli `ytDeviceView`'de → `mediaJobs.youtube` slot'u kilitli, tüm `youtube:*` komutları bloklu | A5-F1 | Düzeltildi — iptal-kuşağı (`_ytCancelGen`) + modal kapamada `youtubeCancel` + `youtube:logout` uçuştaki poll'u öldürür; başarılı girişte iptal çağrılmaz |
| R72-8 | Invidious `_fetch_json` SID cookie'sini **her failover instance'ına** gönderiyordu → credential sızıntısı | A10-F6 | Düzeltildi — `_session_instance` takibi; SID yalnız kendi host'una (`_session_url_ok`); `feed_subscriptions` session instance'ına sabitlendi; `_auth_headers(url)` host kontrolü |
| R72-9 | Kanal yükleme hatasında uzak hata metni `innerHTML`'e gömülüyordu (tek innerHTML sink'i) | A10-F10 | Düzeltildi — DOM + `textContent` |
| R72-10 | Arama input'unda Esc hem aramayı sıfırlıyor hem global handler'a kabarcıklanıp player'ı kapatıyordu | A10-F4 | Düzeltildi — `stopPropagation`; global Esc zincirine `youtubeLoginModal` önceliği eklendi |

## MEDIUM — doğrulandı ve düzeltildi

| # | Bulgu | Kaynak | Durum |
|---|-------|--------|-------|
| R72-11 | `playerPlaylist` non-local kaynağa geçişte hayatta kalıyordu; `ended` autoNext `playlistIndex=-1` iken `files[0]`'a atlıyordu | A1 | Düzeltildi — kaynak değişiminde playlist temizlenir; autoNext yalnız geçerli index'te çalışır |
| R72-12 | Kaynak değişiminde seekbar dolgusu/thumb/marker'lar eski videodan kalıyordu | A1 | Düzeltildi — `resetMediaBoundState` görselleri sıfırlar; A-B marker'lar `loadedmetadata`'da yeniden çizilir |
| R72-13 | `N` kısayolu gizli up-next panelini açıyordu (toggle'a gidiyordu) | A1 | Düzeltildi — panel kapalıysa N açmaz |
| R72-14 | Arama sonucundan kanal açılınca render gizli `#stGrid`'e gidiyordu; arama grid'i bayat kalıyordu | A10-F5 | Düzeltildi — kanal/arama geçişlerinde grid görünürlüğü + içerik senkronu |
| R72-15 | Yorum cap'e takılınca bayat "Daha fazla" düğmesi kalıyordu | A10 | Düzeltildi |
| R72-16 | YouTube→YouTube geçişte `ytInfo` bayat kalıyordu (önceki video metadatası yeni videoda görünebiliyordu) | A10-F11 | Düzeltildi — `mediaKeyFor` kararlı kimliğiyle eşleşme kontrolü |
| R72-17 | YouTube kanal URL'si `encodeURIComponent` olmadan gönderiliyordu | A10-F16 | Düzeltildi |
| R72-18 | `e.repeat` strobo: basılı tutulan geçiş tuşları (Space/F/B/M/V/N/E/?) hızla çift tetikleniyordu | A1 | Düzeltildi — yalnız geçiş tuşlarında repeat yutulur; ok/ses/adım tuşları tekrarlanabilir |
| R72-19 | `video.play()` promise retleri unhandled'dı | A1 | Düzeltildi — `.catch(() => {})` |
| R72-20 | `seekTip` sonsuz/NaN sürede bozuk gösteriyordu | A1 | Düzeltildi |
| R72-21 | `#playerSpeed` custom (menüde olmayan) hızda boş görünüyordu | A1 | Düzeltildi — dinamik option |
| R72-22 | `V` kısayolu (altyazı görünümü) bazı odaklarda ulaşılamıyordu | A1 | Düzeltildi — editable-target korumasıyla birlikte çalışır |
| R72-23 | Hold-speed bırakılınca kullanıcının seçili hızı eziliyordu | A1 | Düzeltildi — restore select'e de senkronlanır |
| R72-24 | `img.src = ''` ataması (boş thumbnail URL) 3 kart üreticide | A10 | Düzeltildi — boş URL'de `<img>` eklenmez (ana kart, kanal kartı, up-next) |
| R72-25 | Kanal yükleme hatası sahte boş kanal sayfası gösteriyordu; arama hatası "Sonuç yok" gibi görünüyordu | A10 | Düzeltildi — hata durumları ayrı status metniyle gösterilir |
| R72-26 | OAuth poll'da tek geçici ağ hatası 30 dk'lık device-flow penceresini öldürüyordu | A5-F9 | Düzeltildi — `backend/youtube.py` geçici network hatalarında polling'e devam eder |
| R72-27 | `ensureYoutubeAccessToken` eşzamanlı refresh'te ikinci çağrı "oturum yok" diyordu | A5-F3b | Düzeltildi — single-flight promise |
| R72-28 | `#ytModalStatus` yoktu — client kaydetme/poll hataları gizli status satırına düşüyordu | A5-F5 | Düzeltildi — `ytClientView`'e status satırı eklendi; `ytClientSave` hatası oraya yazılır |
| R72-29 | YouTube modalında Esc/dışarı-tıklama yoktu (Invidious modalında vardı) | A5 | Düzeltildi — backdrop tıklaması + Esc + global Esc önceliği |
| R72-30 | Önceki turun `.player-panel` flex-gap dönüşümü üstüne kalan margin'ler → `.source-actions`/`player-auto-next`/`.hint` üstünde 18–20 px **çift boşluk** | Öz-denetim (A9 kapsamı) | Düzeltildi — margin'ler gap'e devredildi |
| R72-31 | `chipCount:0` smoke regresyonu — R72-5'in ilk düzeltmesi `innerHTML=''` ile trend chip'lerini siliyordu | Smoke yakaladı | Düzeltildi — `:scope > .inv-status` |

## Elle denetlenen sözleşmeler — TEMİZ (rate-limit düşen kapsamlar)

| Sözleşme | Sonuç |
|----------|-------|
| Kalite seçici değeri = piksel yüksekliği, HLS index `dataset.level`'de | Doğru — ihlal yok |
| `playerStreamAudio` (yayın dublajı) ↔ `playerAudioLang` (indirme ses dili) ayrımı | Doğru — paylaşım yok |
| `saveCueEdit` format koruması (ass→Dialogue satırı, vtt→cuesToVtt, srt→cuesToSrt) + `backupOnce` + atomik yazım | Doğru |
| Altyazı select ↔ segment senkronu (tek `setSubtitleMode`) | Doğru |
| `mediaKeyFor`/`generation` kuşak korumaları probe hattında | Doğru — `queuePlayerProbeFromCard` da `probeRequestSeq` ile aynı kalıbı izler |
| `.hidden` `!important` ↔ `.ptab-content` flex çakışması | Çakışma yok |

## Ajan bulgusu olup bu turda kapsam dışı bırakılanlar

- A10'un düşük öncelikli maddeleri (feed kartı genişlik min/max iyileştirmeleri, comment pagination derinliği vb.) — davranış bozucu değil, sonraki tur.
- A2/A3'ün rate-limit öncesi yakalayamadığı derin altyazı-senkron ve politika köşe durumları için hedefli yeniden denetim gerekebilir — elle bakılan sözleşmeler temiz çıktı ama tam kapsama iddia edilmiyor.

## Düzeltme dosyaları

- `src/renderer/renderer.js` — R72-1..5,7,10..25,28..30 (transport, SmartTube, OAuth modal, grid, kart üreticileri)
- `src/main.js` — R72-7 (`youtube:logout` poll kill), R72-8 (session-instance env kilidi)
- `backend/invidious.py` — R72-8 (`_session_instance`, `_session_url_ok`, `_auth_headers(url)`, `feed_subscriptions` sabitleme)
- `backend/youtube.py` — R72-26 (geçici network hatası toleransı)
- `backend/test_invidious.py` — R72-8 regresyonları (SID başka host'a sızmaz, instance bilinmezse fail-safe)
- `src/renderer/styles.css` — R72-30 (margin→gap devri)
- `src/renderer/index.html` — R72-28 (`#ytModalStatus`)

## Doğrulama

- `node --check` renderer.js / main.js · `py_compile` invidious.py / youtube.py — temiz
- `backend.test_invidious + backend.test_youtube`: **79/79** (2 yeni SID-leak regresyonu dahil)
- `tests/electron-smarttube-boot.smoke.js`: **geçti** — `chipCount:5`, roving-grid, up-next, comments, channel, OAuth senkron (`ytPlayerBtnSynced`, `ytPlayerCleanup`) dahil tüm problar
- `ui-locale` 14/14 · `design-system` OK · `browser-experience` OK
- `npm test` tam paket — sonuç bu raporun yazımı sırasında koşuyor; devir notuna nihai çıktı yazılır

## Sınırlar

- 7 ajan rate-limit'e takıldığı için A2/A3/A6 derinliği elle denetimle sınırlı — tam ajan kapsamı iddia edilmiyor.
- OAuth cihaz akışı uçtan uca Google'a karşı canlı doğrulanmadı (anahtar/hesap gerektirir) — iptal/kuşak mantığı kaynakta doğrulandı.
- SID-leak düzeltmesi subprocess içinde host-kontrolüyle sağlanıyor; main tarafındaki env kilidi değişmedi.
