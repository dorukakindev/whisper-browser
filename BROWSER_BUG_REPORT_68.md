# BROWSER_BUG_REPORT_68.md — Player Tarafı Tasarım ve Fonksiyon Denetimi (DERİN)

**Tarih:** 2026-09-18 (v1 + v2 derinleştirme)
**Dal:** master
**Kapsam:** R67 düzeltmeleri sonrası player tarafında kalan tasarım ve fonksiyon bugları
**Yöntem:** Salt-okunur kod denetimi — v1: 4 paralel alt-ajan + doğrulama · v2 derin: 4 ek paralel alt-ajan (race/state, security, performance, error handling)
**Önceki rapor:** BROWSER_BUG_REPORT_67 (P0–P3 = 8 + 16 + 14 = 38 bulgu; R67-01..08 onarıldı, kalanlar biliniyor)

> **Uyarı:** R67 raporunda listelenen 30 P2/P3 bulgu (probe şeması sürüklenmesi, fetch_subs doğrudan youtube.com, gizli konteyner arama, auth UI desync, başlangıçta opt-in'siz ağ çağrısı, i18n eksikleri, çift kart, modal a11y, yan-panel render kusurları vb.) **bu raporda tekrarlanmıyor**. Aşağıdakiler R67'de listelenmemiş, R67 onarımları sırasında veya sonrasında ortaya çıkan yeni bulgulardır.

> **v2 derinleştirme notu:** v1 raporundaki 46 bulguya ek olarak, race condition / state invariant / güvenlik / performans / hata kurtarma kategorilerinde **38 ek bulgu** tespit edildi (toplam **84**). Yeni bulgular `D1`, `D2`... önekiyle işaretli.

---

## Genel Hüküm

Player tarafı R67 sonrası çalışır durumda. v1 (tasarım/fonksiyon) **46 bulgu**, v2 (derin denetim: race/state, güvenlik, performans, hata kurtarma) **38 ek bulgu** tespit etti. Toplam **84 bulgu**.

**v1 dağılımı:**
1. **Kritik (7)** — işlevsel bozulma veya gizli bilgi sızıntısı
2. **Yüksek (14)** — UX veya görsel tutarsızlık
3. **Orta (15)** — polish / erişilebilirlik
4. **Düşük (10)** — küçük tutarsızlık veya gelecek çalışma

**v2 dağılımı (bu bölüm):**
1. **Kritik (7)** — state invariant ve race condition (D-K1..D-K7)
2. **Yüksek (10)** — performans, event listener, lifecycle (D-Y1..D-Y10)
3. **Orta (13)** — DOM birikimi, network, i18n, hata sınıflandırma (D-O1..D-O13)
4. **Düşük (8)** — polish ve küçük iyileştirmeler (D-D1..D-D8)

**Tasarım:** SmartTube tarzı Invidious browser UI temel yapısını tamamlamış; eksikler büyük ölçüde **CSS polish + erişilebilirlik + responsive breakpoint**.
**Fonksiyon:** Download stream iptali, instance failover, kalıcı login oturumu, **state invariant ihlalleri** ve **performans** en önemli açıklar.
**Güvenlik:** XSS, SID/parola sızıntısı, IPC validation genel olarak **iyi** (escapeHtml tutarlı, safeStorage, SID ortam değişkeninde, path validation). Birkaç küçük defensive iyileştirme önerisi var.

---

## 1.5 v2 — DERİN DENETİM EK BULGULARI

v1 raporu hazırlandıktan sonra **4 paralel derin denetim alt-ajanı** çalıştırıldı:
- **Race/State**: state invariant ihlalleri, asenkron yarış koşulları, bellek sızıntısı
- **Güvenlik**: XSS, IPC validation, gizli bilgi sızıntısı, network/file system
- **Performans**: DOM birikimi, event listener, reflow, pahalı CSS, timer birikimi
- **Hata kurtarma**: promise rejection, partial failure, resource cleanup, i18n edge case

Yeni bulgular `D` önekiyle (D-K1..D-D8) işaretli.

---

### D-K1..D-K7 — KRİTİK (P0) — Race / State Invariant

#### D-K1. `closePlayer()` SmartTube'ı geri getirmiyor → siyah ekran
- **Dosya:** `src/renderer/renderer.js:17559–17599`
- **Sorun:** `closePlayer()` `$('playerLayer').classList.add('hidden')` yapar, `showHomeWhenNoVideo()` çağırmaz. Kullanıcı video açıp kapattığında SmartTube hâlâ `hidden` kalır.
- **Repro:** 1) SmartTube'da video aç → SmartTube gizlenir. 2) Video tamamlanır veya kapatılır → `closePlayer()` → SmartTube geri gelmesi gerekirken gelmiyor.
- **Öneri:** `closePlayer()` sonuna `if (typeof setSmartTubeVisible === 'function' && playerSource === 'invidious') setSmartTubeVisible(true);`

#### D-K2. `closePlayer` sonrası `player.mediaKey` null yapılmıyor
- **Dosya:** `src/renderer/renderer.js:17559–17599`, `:22388`
- **Sorun:** `showHomeWhenNoVideo()` `if (!state.running && !player.mediaKey)` ile kontrol eder. `closePlayer` `player.mediaKey`'i sıfırlamaz. Bu kontrol her zaman `false` döner.
- **Öneri:** `closePlayer` içinde `player.mediaKey = null;` ekle.

#### D-K3. `renderInvidiousHome` paralel feed yarışı + bozuk state sırası
- **Dosya:** `src/renderer/renderer.js:22162–22170`
- **Sorun:** `popular` ve `trending` `await` ile ardışık çekilir. `trending` beklerken kullanıcı chip değiştirirse yeni istek sıraya girer. `invCallChain` tek slot — toplam 75×3 = 225 sn gecikme.
- **Öneri:** Backend'de tek `/feed?types=popular,trending` komutu veya `feedCache` ayrı anahtarlarla paralel.

#### D-K4. `playerSource` değişimi SmartTube'ı otomatik göstermiyor
- **Dosya:** `src/renderer/renderer.js:23206–23210`
- **Sorun:** `#playerSourceSelect change` event'inde `playerSource = sel.value` atanır ama `setSmartTubeVisible` çağrılmaz. Invidious kaynağına geçince SmartTube hâlâ gizli.
- **Öneri:** Handler'a `if (playerSource === 'invidious') setSmartTubeVisible(true);` ekle.

#### D-K5. `setSmartTubeVisible(true)` `stSearchActive` durumunu restore etmiyor
- **Dosya:** `src/renderer/renderer.js:22379–22381`
- **Sorun:** `setSmartTubeVisible(true)` her zaman `renderSmartTubeSection(stCurrentSection)` çağırır. Önceki arama durumu (`stSearchActive === true`) yok sayılır. Kullanıcı video açıp kapatınca arama sonuçları kaybolur.
- **Öneri:** `if (stSearchActive) { stSearchResults?.classList.remove('hidden'); } else { renderSmartTubeSection(stCurrentSection); }` ayrımı yap.

#### D-K6. `openInvidiousLogin` çift tıklama koruması yok — çift login zinciri
- **Dosya:** `src/renderer/renderer.js:22227–22245`
- **Sorun:** `_invLoginModalBound` lazy binding için ama "zaten açık mı" kontrolü yok. Çift tıklama iki paralel login başlatır, `invidiousSessions` Map'e iki ayrı SID yazılır.
- **Öneri:** Fonksiyon başına `if (!dlg.classList.contains('hidden')) return;` ekle.

#### D-K7. `lastInvidiousInstance` iki ayrı kopya — kanal thumbnail'leri bozuk host'a gider
- **Dosya:** `src/renderer/renderer.js:22431` vs `src/main.js:890`
- **Sorun:** Renderer'da `lastInvidiousInstance` global string; main.js'de `invidiousLastInstance` ayrı değişken. İkisi senkron değil. `loadInvidiousChannel` dönüşünde renderer'a yeni instance bildirilmez → `absThumb()` eski/yanlış instance ile birleştirir.
- **Öneri:** `loadInvidiousChannel` dönüşünde `lastInvidiousInstance = data.instance;` ata. Ana süreçten değişince `invidious:event` ile bildir.

### D-Y1..D-Y10 — YÜKSEK (P1) — Performans / Lifecycle

#### D-Y1. `buildSmartTubeCard` her karta 4 closure listener — 175+ listener bellekte
- **Dosya:** `src/renderer/renderer.js:22670, 22679, 22710, 22711`
- **Sorun:** Her kart için `card.click`, `card.keydown`, `author.click`, `author.keydown` = 4 closure. 30 kart = 120 closure + Up Next 15 + channels 40 = **175+ listener** aynı anda bellekte.
- **Öneri:** Tek container'a event delegation. 175 listener → 4 listener.

#### D-Y2. `stGridColumns` `offsetTop` reflow zinciri — her ok tuşunda 31 reflow
- **Dosya:** `src/renderer/renderer.js:22723–22729`
- **Sorun:** Her kart için `c.offsetTop` okuması reflow tetikler. Döngüde 30+ kez çağrılır. `stGridNavKeydown` her ArrowUp/Down'da jank yaratır.
- **Öneri:** `getBoundingClientRect()` tek çağrı veya RAF içinde okuma.

#### D-Y3. `player.ambientTimer` `setInterval(paint, 250)` + `blur(58px)` infinite animasyon
- **Dosya:** `src/renderer/renderer.js:15323`, `styles.css:994`
- **Sorun:** Video oynasa da duraklasa da sürekli çalışır. `filter: blur(58px) saturate(1.65)` + `animation: shimmer 1.6s infinite` = her 250ms GPU compositing.
- **Etki:** Pil tüketimi, fan sesi, düşük GPU'da FPS düşüşü.
- **Öneri:** Sadece `video.paused && !document.hidden` durumunda çalıştır. Blur değerini 24px'e düşür.

#### D-Y4. `MutationObserver(playerTitleNode)` asla diskonnekte edilmiyor
- **Dosya:** `src/renderer/renderer.js:18591`
- **Sorun:** `new MutationObserver(syncPlayerTitleTooltip).observe(playerTitleNode, { childList: true, subtree: true })`. Player açık kaldıkça observer bellekte, her DOM mutasyonunda `syncPlayerTitleTooltip` çağrılır. `closePlayer`'da `disconnect()` yok.
- **Öneri:** Observer referansını sakla, `closePlayer`'da `disconnect()` çağır.

#### D-Y5. `stSearchGrid.innerHTML` `resetSmartTubeSearch`'te temizlenmiyor — DOM birikimi
- **Dosya:** `src/renderer/renderer.js:22874–22890`
- **Sorun:** `resetSmartTubeSearch()` `stSearchSeen.clear()` yapar ama `stSearchGrid.innerHTML = ''` çağırmaz. 50+ arama sonrası binlerce DOM node birikir.
- **Öneri:** `if (searchGrid) searchGrid.innerHTML = '';` ekle.

#### D-Y6. Login modal çift açılma → çift login isteği
- **Öneri:** D-K6 düzeltmesi bunu da çözer.

#### D-Y7. Login sonrası `invidiousLoggedIn` set ediliyor ama sidebar instance bilgisi güncellenmiyor
- **Dosya:** `src/renderer/renderer.js:22290–22301`
- **Sorun:** `restoreInvidiousSession()` başarılıysa `invidiousLoggedIn = res.data` yapar ama `setSmartTubeStatus("Instance: ...")` çağırmaz.
- **Öneri:** Restore sonunda `setSmartTubeStatus(`Instance: ${res.data.instance}`)`.

#### D-Y8. Kanal yükleme stale olunca "Yükleniyor…" placeholder'ı kalır
- **Dosya:** `src/renderer/renderer.js:22898–22905`
- **Sorun:** `openInvidiousChannelPage` `seq !== stSectionSeq` erken `return` yapar ama `setSmartTubeStatus('')` çağırmaz.
- **Öneri:** Erken çıkıştan önce `setSmartTubeStatus('')` ekle.

#### D-Y9. `initInvidiousHome` event handler stale closure riski
- **Dosya:** `src/renderer/renderer.js:22354–22364`
- **Sorun:** `initInvidiousHome()` `playerSource === 'invidious'` kontrolünü çağrılma anında yapar. `initPlayerSource` henüz çalışmamışsa `playerSource` yanlış değer taşır.
- **Öneri:** İlk yükleme kontrolünü `DOMContentLoaded`'a taşı.

#### D-Y10. `renderInvidiousHome` 72 kart tek sync render — 30-80ms jank
- **Dosya:** `src/renderer/renderer.js:22162–22220`
- **Sorun:** `popular` (24) + `trending` (24) + `subscriptions` (24) = 72 kart tek paint. 60fps kare bütçesi 16ms; bu işlem 30-80ms sürebilir.
- **Öneri:** `DocumentFragment` ile toplu insert veya RAF chunk.

### D-O1..D-O13 — ORTA (P2) — DOM/Network/i18n/Hata

#### D-O1. `stSearchSeen` Set büyümesi (50+ sayfa → 1000+ ID)
- **Dosya:** `src/renderer/renderer.js:22822`
- **Öneri:** Set boyutu > 500 olduğunda FIFO eviction veya pagination durdurma.

#### D-O2. `renderInvidiousHome` paralel fetch await zinciri → 2× 75sn
- **Öneri:** Subscriptions ayrı render'a ertelensin (sidebar'a tıklandığında).

#### D-O3. i18n anahtar yokluğunda hard-coded fallback düşüyor
- **Dosya:** `src/renderer/renderer.js` (birçok yerde)
- **Sorun:** `window.UiLocale?.t('X') || 'X'` kalıbı. Eksik anahtarda locale değişiminde diller karışır.
- **Öneri:** Static analyzer ile eksik anahtar raporu, CI gate.

#### D-O4. `getBoundingClientRect` çoklu çağrı — layout thrash
- **Dosya:** `src/renderer/renderer.js:6215, 12869–12918`
- **Öneri:** İlk çağrıdan sonra RAF içinde toplu okuma.

#### D-O5. Thumbnail paralel fetch kontrolsüz — 72 görsel batch
- **Dosya:** `src/renderer/renderer.js:22110–22150`
- **Öneri:** IntersectionObserver viewport-based lazy load.

#### D-O6. Yorumlar pagination DOM birikimi (200+ düğüm)
- **Öneri:** Virtual scroll veya sayfa başına limit (50).

#### D-O7. `backdrop-filter: blur(6px)` 2 ayrı layer叠加
- **Öneri:** Tek compositing layer'da birleştir veya blur(4px) düşür.

#### D-O8. `invidious.py:73` — HTTP hata kodu log'da kayboluyor
- **Öneri:** `except HTTPError as e: raise RuntimeError(f"... HTTP {e.code} {e.reason}")`.

#### D-O9. Disk dolu / PermissionError için spesifik mesaj yok
- **Öneri:** `if (error.code === 'ENOSPC') throw new Error('Disk dolu; ...')`.

#### D-O10. 429 rate-limit failover loop riski
- **Öneri:** Exponential backoff, Retry-After header oku.

#### D-O11. Bozuk `queue-state.json` / `history.json` — hangisi bozuk belirsiz
- **Öneri:** Parse hatasında dosya yolu + anahtar bilgisi.

#### D-O12. `box-shadow` çok sayıda kartta — GPU layer maliyeti
- **Öneri:** `transform: translateZ(0)` ile tek layer.

#### D-O13. `idle timer` return öncesi `remove('idle')` her zaman çağrılıyor (no-op)
- **Öneri:** Değişiklik gerekmez; not olarak eklendi.

### D-D1..D-D8 — DÜŞÜK (P3) — Polish

#### D-D1. SRT + ASS aynı anda stil çakışması kontrolü yok
#### D-D2. RTL dil desteği yok
#### D-D3. Tarih/sayı formatı `Intl` API kullanmıyor
#### D-D4. Captions endpoint deprecate olursa tüm instance'lar kırılır
#### D-D5. `translation-endpoints.js:27` — 401/403 sağlayıcı failover eksik
#### D-D6. `.yt-dlp .part` dosyaları iptalde kalır
#### D-D7. `absThumb()` URL scheme kontrolü yok (`javascript:` / `data:`)
#### D-D8. IPC payload boyut limiti açık değil

### D-Güvenlik — Güçlü Yönler ✓

- **XSS koruması**: `escapeHtml()` tutarlı kullanılıyor; `textContent` kullanımı yaygın
- **Gizli bilgi**: SID ortam değişkeniyle, parola renderer'a sızmıyor, `safeStorage` şifreli kasa
- **CSP**: `script-src 'self'` katı, harici CDN yok, inline script yok
- **Path validation**: `path.win32.isAbsolute()` ile path traversal kapalı
- **IPC validation**: URL/instance validation var, payload limit 8MB
- **Hata sanitizasyonu**: `sanitizeProcessDetail` ile URL/ANSI temizleniyor
- **Cookie HttpOnly**: SID JavaScript'ten erişilemiyor

### D-Güvenlik — İyileştirme Önerileri (Düşük Risk)

1. `absThumb()` scheme kontrolü (`javascript:` / `data:`)
2. IPC payload boyut limiti (queue, subtitle)
3. Invidious login'de SameSite=Strict flag (cookie policy)

---

## 1. KRİTİK (P0)

### K1. `invidious:cancel` yalnızca feed komutunu sonlandırır, **indirme sürecini öldürmez**
- **Dosya:** `src/main.js:1161–1167`, `src/main.js:1324–1369`
- **Sorun:** `mediaJobs.invidious` slot'unu sonlandırır. Ancak `invidious:downloadStream` `runMediaCommand` → `mediaJobs.download` slot'unu kullanır. Kullanıcı `invidious:cancel` çağırırsa, **aktif indirme süreci yaşamaya devam eder**; UI "iptal edildi" gösterir ama `.invtmp` dosyaları diske yazılmaya devam eder.
- **Öneri:** `invidious:cancel` handler'ı `mediaJobs.download` slot'unu da sonlandırmalı. En sık kullanıcı yolu: SmartTube kartında "İndir" → yanlış video → iptal. Bug: tmp dosyaları birikir, disk dolar.

### K2. Login session token kalıcı değil — uygulama her açılışta yeniden giriş ister
- **Dosya:** `src/main.js:889–937`, `src/renderer/renderer.js:22024`
- **Sorun:** SID `invidiousSessions` (Node tarafı Map) ve `invidiousLoggedIn` (renderer tarafı bellek) içinde. Uygulama kapatılınca her ikisi de kaybolur. Bir sonraki açılışta `invidiousLoggedIn = null`; `restoreInvidiousSession()` çağrılır ama `invidiousSessions` Map boş. Kullanıcı her oturumda yeniden login yapar.
- **Öneri:** SID `electron safeStorage` ile şifreli diske kaydedilmeli, uygulama başında yüklenmeli. Bu `secret-store.js` ile aynı kalıp.
- **Not:** Şifre renderer'a hiç sızmıyor — yalnız SID (cookie) kalıcı olmalı.

### K3. `_cached_instance` cache poisoning — başarısız instance bir sonraki komutta tekrar deneniyor
- **Dosya:** `backend/invidious.py:50`, `:118`, `:134–139`
- **Sorun:** Modül seviyesi `_cached_instance` tutulur. Bir komutta A instance'ı başarısız olursa, sonraki komutta yine A deneniyor (varsayılan olarak). A hâlâ çökükse tekrar failover tetiklenir, A yine dener, sonraki komut yine A dener... Her komut 2× network round-trip.
- **Öneri:** Başarısız instance'ı geçici blacklist'e al (örn. son 5 dakika içinde 3 hata). Ya da `preferred` parametre yoksa her komutta sıfırdan tara.

### K4. `lastInvidiousInstance` senkron değil — kanal sayfasında thumbnail URL'leri bozuk
- **Dosya:** `src/renderer/renderer.js:22428`, `:22613`
- **Sorun:** Renderer `lastInvidiousInstance`'ı yalnız feed komutlarından günceller. `loadInvidiousChannel()` (renderer.js:22090) instance döndürür ama `lastInvidiousInstance`'a atamaz. Kanal sayfasındaki thumb URL'leri `absThumb()` ile `lastInvidiousInstance + '/path'` birleştirir — eski/değersiz instance'a gider. Resim bozuk olur.
- **Öneri:** `loadInvidiousChannel` dönüşünde `lastInvidiousInstance = data.instance` ataması.

### K5. `invidious:cancel` Python tarafında per-chunk iptal kontrolü yok
- **Dosya:** `backend/media.py:360–379` (`fetch` fonksiyonu)
- **Sorun:** İndirme döngüsü 256 KB chunk'lar halinde `report()` çağırır ama iptal bayrağı kontrol etmez. `terminateProcessTree` SIGTERM gönderse bile, Python'un HTTP read'i bloke olabilir, süreç ölümü 30 sn+ gecikebilir. `BaseException` finally bloğu (410–421) ancak close handler'dan sonra çalışır.
- **Öneri:** Dışarıdan `WHISPER_CANCEL_FILE` varlığını her chunk'ta kontrol et veya threading.Event kullan.

### K6. SmartTube init'te `restoreInvidiousSession` çağrılmıyor → kullanıcı login gözükür
- **Dosya:** `src/renderer/renderer.js:22970`, `:22290–22301`
- **Sorun:** `initSmartTube()` yalnız event listener bağlar. `setSmartTubeVisible(true)` (DOMContentLoaded'ta) `invidiousLoggedIn === null` ile başlar; sidebar login butonu "Oturum aç" gösterir. Gerçekte oturum açıksa bile SmartTube bunu bilmez.
- **Öneri:** `setSmartTubeVisible(true)` içinde `invidiousLoggedIn === null` ise `restoreInvidiousSession()` çağrısı.

### K7. `validateInvidiousInstance` HTTP'yi reddetmiyor → SID plain-text taşınabilir
- **Dosya:** `src/main.js:895–907`
- **Sorun:** `validateInvidiousInstance` yalnız `http:` ve `https:` kabul eder. HTTP instance kullanıcı SID'si açık metin olarak gönderilir. Saldırgan aynı ağdaysa SID'i yakalayabilir.
- **Öneri:** `if (u.protocol !== 'https:') return '';` — HTTPS zorunlu.

---

## 2. YÜKSEK (P1)

### Y1. Topbar sticky değil — grid'de scroll ederken arama çubuğu kaybolur
- **Dosya:** `src/renderer/styles.css:6975`, `:6979–7020`
- **Sorun:** `.st-main`'da `overflow: hidden` var; topbar sticky değil. Kullanıcı 60+ videolu grid'de scroll ederken üstteki arama + Yenile + Kapat düğmeleri görünmez olur, "Kapat" düğmesini bulmak için en üste dönmek gerekir.
- **Öneri:** `position: sticky; top: 0; z-index: 1; background: var(--bg);` topbar'a ekle.

### Y2. Eski Invidious DOM'u (`#invidiousHome`, `#invidiousSearchResults`) hâlâ DOM'da — erişilebilirlik ağacında çift panel
- **Dosya:** `src/renderer/index.html:1860–1930` (yeni SmartTube), `:2484–2491` (eski Invidious panel)
- **Sorun:** İki ayrı Invidious paneli aynı anda DOM'da. CSS ile yalnız biri görünür olsa da, erişilebilirlik ağacında (screen reader) iki ayrı panel var. NVDA/JAWS kullanan kullanıcılar "iki arama kutusu" duyar.
- **Öneri:** Eski Invidious panel DOM'dan tamamen kaldırılmalı veya `aria-hidden="true"` ile gizlenmeli.

### Y3. `stSearchInput` debounce yok — yalnız Enter / buton ile arama
- **Dosya:** `src/renderer/renderer.js:22991–22997`
- **Sorun:** YouTube/Netflix'teki gibi her tuş vuruşunda 300 ms bekleme sonrası otomatik arama yok. Kullanıcı yazıp beklerse arama yapılmaz.
- **Öneri:** `input` event listener + debounce 350 ms.

### Y4. `stTrendTab` değişimi `stSectionSeq`'i artırmıyor — chip'ler arası geçişte eski sonuç yeni section'ı ezer
- **Dosya:** `src/renderer/renderer.js:22541–22542`
- **Sorun:** `stSelectSection` her section değişiminde `stSectionSeq++` yapar (22409). Ama trend chip tıklaması `stSelectSection` çağırmaz, doğrudan `renderSmartTubeSection('trending')` çağırır. Seq artmaz. Kullanıcı hızlı chip değişiminde eski fetch sonucu yeni grid'i override edebilir.
- **Öneri:** Chip handler'ında `++stSectionSeq` ekle veya `stSelectSection('trending')` çağır.

### Y5. Home bölümünde çift paralel `fetchInvidiousFeed` — yarış koruması yetersiz
- **Dosya:** `src/renderer/renderer.js:22487`
- **Sorun:** `renderSmartTubeSection('home')` popular+trending için iki ayrı `fetchInvidiousFeed` çağırır. `stSectionSeq` koruması var ama yalnız section sınırında; trending chip'inde değil (Y4). 75 sn × 2 = 150 sn yükleme süresi (ardışık; `invCallChain` sıralı çalıştırır).
- **Öneri:** Home'da popular+trending için **tek komut** (paralel veya backend birleştirme) ya da `mediaJobs` slot genişletme.

### Y6. Seek-marker overflow — A-B / chapter işaretleri seek-track dışına çıkıyor
- **Dosya:** `src/renderer/styles.css:1246`, `:2963`
- **Sorun:** `.seek-markers` `height: 100%` + `pointer-events: none`, parent `.seek-wrap` `height: 18px`. Markerlar `top: 50%; translate(-50%, -50%)` ile ortalı, ~9 px yükseklik. Seek-wrap'ta `overflow: hidden` yok → markerlar yukarı/aşağı taşabilir. Çok sayıda chapter varsa dikey çakışma olur.
- **Öneri:** `.seek-wrap { overflow: hidden; }` ekle.

### Y7. Seek bar canlı yayın (live) modunda input event'i `currentTime = Infinity * x` → `NaN`
- **Dosya:** `src/renderer/renderer.js:20572–20580`
- **Sorun:** `playerSeek input` event'i `video.currentTime = fraction * video.duration`. Canlı yayında `video.duration = Infinity`. `NaN * x = NaN`, `currentTime` çöp olur. Kullanıcı seek bar'ı sürüklerse seek uçabilir.
- **Öneri:** `playerSeek` input handler'ında `if (player.isLive) { e.preventDefault(); return; }`.

### Y8. `pSecToTime` Infinity/NaN koruması yok — time göstergesi `NaN:NaN` yazabilir
- **Dosya:** `src/renderer/renderer.js:20463`, `:13857` (`syncPlayerSpeedControl`)
- **Sorun:** Canlı yayında `video.duration === Infinity`. `!isFinite(video.duration)` kontrolü var ama `pSecToTime(video.currentTime)` çağrılırken `currentTime` Infinity olabilir. `pSecToTime`'da Number.isFinite koruması yok.
- **Öneri:** `pSecToTime` içinde `Number.isFinite(t) ? format : '--:--'`.

### Y9. Seek bar sol/sağ ok klavye ile seek — seek-track görseli güncellenmiyor
- **Dosya:** `src/renderer/renderer.js:20843–20844`
- **Sorun:** `video.currentTime += 5` yapılır, `showControls()` çağrılır ama `updateSeekVisuals()` çağrılmaz. `timeupdate` event'i 250 ms sonra günceller. Slider görsel olarak geride kalır.
- **Öneri:** Keyboard seek sonrası `updateSeekVisuals()` zorla çağır.

### Y10. V kısayolu menü açıkken altyazıyı da toggle ediyor (çift aksiyon)
- **Dosya:** `src/renderer/renderer.js:20824`
- **Sorun:** V tuşu her zaman `setSubtitlesVisible(player.subsHidden)` çağırır. Menü açıkken V'ye basınca menü kapanır **ve** altyazı toggle olur — beklenmedik iki eylem.
- **Öneri:** `if (menuOpen) { setSubtitleModeMenuOpen(false); return; }` V handler başına.

### Y11. Altyazı modu (`player.lastSubtitleMode`) `settings.json`'a yazılmıyor
- **Dosya:** `src/renderer/renderer.js:16149`, `:16143`
- **Sorun:** Browser modunda `tab.subtitleMode = mode` kaydedilir (tab-bazlı). Player modunda `player.lastSubtitleMode` kullanılır ama `PERSIST_VALUE_CONTROLS`'ta yok. Kullanıcı browser modunda "kaynak" seçtiyse player moduna geçince bu tercih korunmaz.
- **Öneri:** `player.lastSubtitleMode`'u `settings.json`'a ayrı anahtarla yaz.

### Y12. Mute simgesi değişmiyor — `volumechange` listener yok
- **Dosya:** `src/renderer/renderer.js:20600`
- **Sorun:** `muteBtn` click yalnız `video.muted = !video.muted` yapar. SVG ikonu değişmez — sessiz ve açık aynı ikon. Kullanıcı hangi durumda olduğunu görsel olarak ayırt edemez.
- **Öneri:** `video.addEventListener('volumechange', ...)` ile mute durumuna göre `muteBtn.dataset.muted = '1'|'0'` set et, CSS ile ikon değişimi yap.

### Y13. `renderSeekMarkers` A-B marker'larını silmiyor — A-B döngüsü aktifken arama yenilenirse çakışma
- **Dosya:** `src/renderer/renderer.js:15804`, `:15442`
- **Sorun:** `renderSeekMarkers` yalnız `.seek-marker` sınıfını siler. `renderAbMarkers` ayrı çalışır (15442'de `.ab-marker` ve `.ab-range` silinir). İki fonksiyon bağımsız. A-B aktifken kullanıcı "Ara" yaparsa A-B görsel işaretleri kalır, chapter marker'ları A-B'yi ezer.
- **Öneri:** `renderSeekMarkers` içinde `.ab-marker, .ab-range` da sil; veya iki fonksiyonu birleştir.

### Y14. Ekran görüntüsü alınırken altyazı offset uygulanmamış cue'dan alınıyor
- **Dosya:** `src/renderer/renderer.js:15481`
- **Sorun:** `player.cues[player.activeIdx].text` alınır ama `player.offset` (altyazı gecikmesi) uygulanmaz. Kullanıcı -500 ms gecikme ayarladıysa, ekran görüntüsündeki altyazı aslında o anda göstermesi gerekenin 500 ms sonrasına ait olabilir.
- **Öneri:** `findCueAt(player.cues, v.currentTime - player.offset, ...)` ile doğru cue'u bul.

---

## 3. ORTA (P2)

### O1. `.st-section-title` renk tanımı yok — koyu temada görünmez
- **Dosya:** `src/renderer/styles.css:7022–7024`
- **Sorun:** `padding`, `font-size`, `font-weight` var ama `color` yok. Tarayıcı varsayılan metin rengine düşer; koyu arka plan üstünde "ANA SAYFA" başlığı görünmez. Light mode test edilmedi.
- **Öneri:** `.st-section-title { color: var(--fg); }` ekle.

### O2. SmartTube responsive breakpoint YOK — 480px altında grid 220px min ile yatay scroll
- **Dosya:** `src/renderer/styles.css:7038`
- **Sorun:** `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`. 480px altında hâlâ 220px min — 2 sütun sığmaz, yatay scroll. Sidebar 88px sabit → mobil ekranda orantısız geniş. Hiçbir `@media (max-width: 480px|768px)` SmartTube kuralı yok.
- **Öneri:**
  ```css
  @media (max-width: 480px) {
    .smarttube-browser { grid-template-columns: 52px 1fr; }
    .st-side-label { display: none; }
    .st-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  }
  ```

### O3. Up Next paneli açılış animasyonu yok — ani `display: none → flex`
- **Dosya:** `src/renderer/styles.css:7230–7245`
- **Sorun:** `.st-upnext.hidden { display: none }` → açılışta aniden görünür. SmartTube'daki "sağdan kayarak açılma" hissi yok.
- **Öneri:**
  ```css
  .st-upnext { transform: translateX(100%); transition: transform .22s ease, opacity .22s ease; opacity: 0; }
  .st-upnext:not(.hidden) { transform: translateX(0); opacity: 1; }
  ```

### O4. Sidebar toggle butonu yok — küçük ekranda sidebar gizlenemiyor
- **Dosya:** `src/renderer/index.html:1866–1898`
- **Sorun:** Sidebar 88px sabit, kapatma/küçültme yok. Klavye shortcut (Ctrl+B gibi) yok. Tablet/pencere küçültme senaryosunda grid alanı daralır ama sidebar sabit kalır.
- **Öneri:** Sidebar başlığına collapse toggle ekle + Ctrl+B kısayolu.

### O5. Sidebar ikonlarında `aria-hidden="true"` eksik — screen reader Unicode okur
- **Dosya:** `src/renderer/index.html:1870–1898`
- **Sorun:** `<span class="st-side-icon">⌂</span>` gibi Unicode ikonlar. `<button>` metin içeriyor olsa da, screen reader ikon metnini de okur: "Ev, house symbol, Ana sayfa, button" gibi.
- **Öneri:** `<span class="st-side-icon" aria-hidden="true">⌂</span>` ekle.

### O6. Arama input clear (×) butonu yok
- **Dosya:** `src/renderer/index.html:1900`
- **Sorun:** `type="search"` tarayıcı native clear verebilir ama Electron/Windows'ta görünmeyebilir. Kullanıcı aramayı iptal etmek için tüm metni seçip silmek zorunda.
- **Öneri:** Input içine SVG "×" butonu + `resetSmartTubeSearch()` çağrısı.

### O7. Login modal şifre görünürlük toggle (göz simgesi) yok
- **Dosya:** `src/renderer/index.html:2888`
- **Sorun:** `<input type="password">` sabit gizli. Kullanıcı uzun şifre girdikten sonra yanlışlık var mı diye kontrol edemez.
- **Öneri:** Şifre alanı yanına `aria-label="şifreyi göster"` butonu, `type` toggle eder.

### O8. `.st-card:focus-visible` outline yok — klavye odak görünmüyor
- **Dosya:** `src/renderer/styles.css:7058–7060`
- **Sorun:** `.st-card:hover, .st-card:focus-visible` → `transform + border-color`. Ancak `outline` tanımsız. Chrome varsayılan outline `border-radius: 8px` içinde kaybolur. Klavye kullanıcısı hangi karta odaklandığını göremez.
- **Öneri:** `.st-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.

### O9. `#stSearchInput` odak durumunda outline/box-shadow yok
- **Dosya:** `src/renderer/styles.css:7000`
- **Sorun:** `outline: none` mevcut, ama focus state tanımlı değil. Kullanıcı input'a tıklayıp yazıyor ama odak görsel ipucu yok.
- **Öneri:** `#stSearchInput:focus { box-shadow: 0 0 0 2px var(--accent); }`.

### O10. `#stSearchInput::placeholder` özel rengi yok
- **Dosya:** `src/renderer/styles.css:7000` civarı
- **Sorun:** Genel `::placeholder` kuralı `var(--text-muted)` ama SmartTube input'una özel kural yok. Tarayıcı varsayılanı (açık gri) `var(--bg-elev)` arka plan üstünde yetersiz kontrast.
- **Öneri:** `#stSearchInput::placeholder { color: var(--text-muted); opacity: 1; }`.

### O11. Thumbnail `<img>` — `decoding="async"` eksik → layout shift riski
- **Dosya:** `src/renderer/renderer.js:22571–22574`, `:22632`, `:23040`
- **Sorun:** `loading="lazy"` var, `decoding="async"` yok. Aspect-ratio container var, CLS düşük ama decoding sync zorla ana iş parçacığında çalışır → liste render'ı yavaşlar.
- **Öneri:** `<img>` oluşturulurken `img.decoding = 'async'`.

### O12. `stUpNextList` keydown listener panel gizli olsa bile çalışıyor
- **Dosya:** `src/renderer/renderer.js:22760`
- **Sorun:** Listener DOM'da kaldığı için panel gizli (`.hidden`) olsa bile klavye olayları yakalanabilir. Kullanıcı video izlerken yanlışlıkla ArrowDown basarsa Up Next listesinde gezinmeye çalışır.
- **Öneri:** `stUpNextToggle(false)` sırasında listener'ı kaldır veya `if (panel.classList.contains('hidden')) return;` listener başına.

### O13. Sidebar aktif öğe padding `1px` magic number — açıklama gerektiriyor
- **Dosya:** `src/renderer/styles.css:6952–6956`
- **Sorun:** `.st-side-item.is-active { padding-left: 1px }`. Diğer öğeler `padding: 10px 4px` → 4px sol boşluk; aktifte 3px border + 1px padding = 4px → hizalı. Magic number.
- **Öneri:** `padding-left: 0` ve açıklama yorumu; ya da CSS calc kullan.

### O14. Hard-coded renkler — token sistemi dışı
- **Dosya:** `src/renderer/styles.css:7065, 7079, 7142–7143, 1155, 2366, 2965, 2967`
- **Sorun:** `#000` (thumb bg), `#fff` (overlay), `#c0392b` (live badge), `#cfd4da`, `#e9e9ec`, `#c3c3c7`, `#f6c984` → token sistemi (`var(--fg)`, `var(--accent)`) ile uyumsuz. Tema değişince bozulur.
- **Öneri:** Token'lara çevir — `--st-live-bg`, `--text-faint`, vs.

### O15. `border-radius` token dışı karışık kullanım
- **Dosya:** `src/renderer/styles.css:7049, 7078, 7218, 7241`
- **Sorun:** `.st-card` → `8px`, `.st-card-duration` → `3px`, `.st-more-btn` → `999px`, `.st-upnext` → `10px`. Token sistemi var (`--radius-sm: 8px`, `--radius: 12px`, `--radius-pill`) ama kullanılmıyor.
- **Öneri:** `var(--radius-sm)`, `var(--radius-pill)`, vb. kullan.

---

## 4. DÜŞÜK (P3)

### D1. `stSearchInput` aria-live eksik — "Aranıyor…" ekran okuyucu tarafından okunmuyor
- **Dosya:** `src/renderer/renderer.js:22777`
- **Öneri:** `<output>` veya `aria-live="polite"` ile sonuç duyurulmalı.

### D2. Kanal yazar butonunda klavye navigation grid'in roving tabindex'ine çıkmıyor
- **Dosya:** `src/renderer/renderer.js:22672–22683`
- **Sorun:** `goChannel` her tuşta `stopPropagation` yapıyor. ArrowRight/Left sonraki karta gitmiyor.
- **Öneri:** `stopPropagation` yalnız Enter/Space'de uygulansın, diğer tuşlarda kabarcıklanma.

### D3. Sidebar öğesi focus-visible outline tanımsız — tarayıcı varsayılanına bağlı
- **Dosya:** `src/renderer/styles.css:6933` civarı
- **Öneri:** `.st-side-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }`.

### D4. `style.gridColumn = '1 / -1'` JS inline — CSS'te yönetilmeli
- **Dosya:** `src/renderer/renderer.js:22910` (`.st-channel-head`)
- **Öneri:** `.st-channel-head { grid-column: 1 / -1; }` CSS'e ekle.

### D5. `st-card` reduced-motion kapsamında değil — kart hover efekti reduced-motion kullanıcıda da çalışıyor
- **Dosya:** `src/renderer/styles.css:5834–5843` (global reset)
- **Öneri:** `.st-card` ve `.st-upnext-item` için de reduced-motion reset'e ekle.

### D6. Kanal açıklaması 2 satırla kesiliyor — genişletme yok
- **Dosya:** `src/renderer/styles.css:7160–7167`, `renderer.js:22929`
- **Öneri:** Uzun açıklamalar için detay paneli veya hover tooltip.

### D7. `playerSpeed` 0.5× gösterimi `&times;` entity — tutarsız
- **Dosya:** `src/renderer/index.html:1991`
- **Sorun:** `syncPlayerSpeedControl` Unicode `×` kullanıyor (13870), HTML entity tutarsız.
- **Öneri:** HTML'de de Unicode `×`.

### D8. Prev/Next video düğmeleri playlist yoksa sürekli disabled — kullanıcı ne yapacağını bilemez
- **Dosya:** `src/renderer/renderer.js:14479`, `index.html:1966/1968`
- **Öneri:** Disabled durumda tooltip göster: "Çalma listesi yok" veya düğmeleri gizle.

### D9. `player-resumeChip` 12 sn sonra otomatik gizlenir ama `player.resumeOffered` resetlenmiyor
- **Dosya:** `src/renderer/renderer.js:15929`
- **Öneri:** Aynı video tekrar açılırsa chip tekrar gösterilir mi kontrol et (CLAUDE.md "kullanıcı onaylar" diyor, bu doğru olabilir).

### D10. Up Next thumb 128px sabit — mobil altında büyük
- **Dosya:** `src/renderer/styles.css:7275`
- **Öneri:** `width: 30%; max-width: 128px; flex-shrink: 0`.

---

## 5. DOĞRULANAN DAVRANIŞLAR (Bug Olmayan, Tasarım Notu)

Aşağıdaki iddiaları alt-ajanlar "bug" olarak işaretledi ama doğrulama sonucu **bug olmadığı** anlaşıldı:

| İddia | Doğrulama |
|-------|-----------|
| `playerSpeed` PERSIST_VALUE_CONTROLS'ta yok | **VAR** — satır 2319 (`'playerSpeed'` listede). Kalıcı. |
| Idle class yarış koşulu var | **YOK** — `clearTimeout` her zaman önceki timer'ı iptal eder. |
| Player stage akranları inert kontrolü yanlış | **DOĞRU** — `syncResponsivePlayerLayout` ile yönetiliyor. |
| Beyaz listede `error` eksik → mesaj kayboluyor | **ÇALIŞIYOR** — `handleLine`'da `error` ayrı branch'te işleniyor. |
| `ndjson-lines` parser Windows `\r\n` bozar | **ÇALIŞIYOR** — JSON parse öncesi `.trim()` var. |
| `_cached_instance` her spawn'da sıfırlanır (process başına) | **DOĞRU** — kötü bir bug değil, her komut yeni tarama. |
| Şifre renderer'a sızıyor mu | **HAYIR** — Python sürecinde kalır, `safeData` ile çıkarılır. |

---

## 6. ETKİ HARİTASI

```
        Yüksek Etki
            ↑
            |
  K1    K2      |    Y1    Y2    Y3    Y4
  K3    K4  K5  |    Y5    Y6    Y7    Y8
  K6    K7      |    Y9    Y10   Y11   Y12
            |   Y13   Y14
            |
  ─────────┼─────────────────────────────────→ Düşük Efor
            |
       O1..O15      D1..D10
```

**Hızlı kazanç (1-2 saat):** Y1 (topbar sticky), O1 (st-section-title renk), O2 (responsive), O3 (Up Next animasyon), K6 (restoreInvidiousSession çağrısı).
**Orta vadeli (yarım gün):** Y2 (eski DOM kaldır), Y11 (altyazı modu persist), Y12 (mute simgesi), K2 (SID kalıcı), K4 (lastInvidiousInstance senkron).

---

## 7. YARIM İŞ / SINIRLAR

- Bu rapor **yalnız player tarafı** (SmartTube/Invidious browser + player kontrolleri) içindir.
- Browser workspace (PDF, manga, note vb.) bu denetim kapsamında değildi.
- Altyazı pipeline (transcribe.py, çeviri, diarization) bu denetim kapsamında değildi.
- Canlı Invidious ağı/login/HLS bu ortamda doğrulanmadı (ağ erişimi yok); gerçek davranış kullanıcı ortamında `start.bat` ile test edilmeli.
- WIP test dosyaları (`tests/report62-*`, `tests/report63-*`, `tests/report64-*`) bu denetim dışı.

**v2 ek sınırlar:**
- Performans ölçümleri alt-ajan tahminidir; gerçek kullanıcı ortamında DevTools Performance tab ile doğrulanmalı.
- Güvenlik denetimi **client-side** (renderer + preload + main IPC) ile sınırlı. Backend Python subprocess'leri sandbox'lanmamış; OS-level saldırı yüzeyi bu raporun dışında.
- Race condition senaryoları çoğunlukla teorik; gerçek ortamda deterministik olmayabilir ama tetikleyici koşullar (hızlı kullanıcı, düşük network) olduğunda ortaya çıkar.
- Memory leak senaryoları uzun süreli kullanımda (8+ saat) test edilmeli.
- v2 güvenlik denetimi `src/browser-sensitive-keys.js` (yeni eklenmiş) ve `src/main.js`'teki `installYoutubeStreamHeaders` üzerinde yoğunlaştı; her ikisi de **güvenli** bulundu.

---

## 8. EYLEM ÖNERİSİ SIRASI (v1 + v2 birleşik)

**Acil (1 tur, ~2 saat, 8 bulgu):**
1. **D-K1** — `closePlayer` sonuna `setSmartTubeVisible(true)` (5 dk)
2. **D-K5** — `setSmartTubeVisible(true)` arama durumu restore (10 dk)
3. **D-K7** — `loadInvidiousChannel` `lastInvidiousInstance` ataması (5 dk)
4. **D-Y4** — `MutationObserver.disconnect()` `closePlayer`'a (5 dk)
5. **D-Y5** — `resetSmartTubeSearch`'e `searchGrid.innerHTML = ''` (3 dk)
6. **D-K6** — `openInvidiousLogin` çift tıklama koruması (3 dk)
7. **Y1** — topbar `position: sticky` (10 dk)
8. **O1** — `.st-section-title { color: var(--fg); }` (2 dk)
9. **K6** — `setSmartTubeVisible(true)` → `restoreInvidiousSession()` (5 dk)
10. **K7** — `validateInvidiousInstance` HTTPS zorunlu (10 dk)

**Yüksek öncelik (2-3 tur, ~yarım gün, ~20 bulgu):**
11. **D-Y1** — event delegation (175 listener → 4) (1 saat)
12. **D-Y2** — `stGridColumns` RAF ile tek okuma (30 dk)
13. **D-Y3** — `ambientTimer` koşullu + blur 24px (30 dk)
14. **Y2** — eski Invidious DOM kaldır (`index.html:2484–2491`) (15 dk)
15. **Y10** — V tuşu menü açıkken yalnız menüyü kapat (10 dk)
16. **Y11** — `player.lastSubtitleMode` persist (30 dk)
17. **Y12** — `volumechange` ile mute simgesi güncelle (20 dk)
18. **K2** — SID `safeStorage` ile kalıcı (1 saat)
19. **K4** — `lastInvidiousInstance` çift kopya senkron (30 dk)
20. **Y3** — search input debounce (15 dk)
21. **Y4** — trend chip'lerinde `stSectionSeq` artışı (10 dk)
22. **Y6** — seek-markers overflow (5 dk)
23. **Y7** — canlı yayında seek bar input koruması (15 dk)
24. **K1** — `invidious:cancel` → `mediaJobs.download` da kapat (30 dk)

**Orta vadeli (yarım gün, ~28 bulgu):**
25-40. **O2** responsive breakpoint (480/768/1200) — O3 Up Next animasyon — O5/O6 a11y — O7/O8/O9 a11y — O10/O11 polish — D-Y7 status satırı — D-Y8/Y9/Y10 render performansı — D-O1/O2 i18n — D-O8/O9 hata sınıflandırma — D-O10 429 backoff — D-D7 absThumb scheme kontrolü

**Polish (1 tam gün, kalan bulgular):**
41-84. Erişilebilirlik, token sistemi, performans polish, küçük UX/DOM düzeltmeleri

---

**Rapora erişim:**
- Dosya: `D:\Whisper Local\BROWSER_BUG_REPORT_68.md`
- Önceki rapor: `docs/devir/2026-09-18-1421.md` (R67 referansı)

**Hazırlayan:** 4 (v1) + 4 (v2 derin) = 8 paralel salt-okunur alt-ajan:
- **v1:** SmartTube UI · Player kontrolleri · Invidious backend/IPC · CSS tasarım
- **v2:** Race/State invariant · Güvenlik · Performans · Hata kurtarma

**Yöntem:** Tüm dosyalar yalnız okundu. Hiçbir kod değişikliği yapılmadı.

**v1 + v2 toplam bulgu:** 84 (K: 14, Y: 24, O: 28, D: 18)
**En kritik 5 bulgu:** K1 (download iptali çalışmıyor), K2 (SID kalıcı değil), D-K1 (closePlayer SmartTube restore), D-K6 (login çift tıklama), D-K7 (lastInvidiousInstance senkron)

---

## 9. DOĞRULAMA SONUÇLARI (v3 — kod'a karşı tek tek denetim)

Her bulgu mevcut kod ile karşılaştırıldı. Sınıflar:
- **GERÇEK → DÜZELTİLDİ**: kod'da yeniden üretildi, düzeltme + regresyon testi eklendi
- **GERÇEK → İYİLEŞTİRME**: küçük mantıklı iyileştirme olarak uygulandı
- **FALSE POSITIVE**: iddia kod'da doğrulanamadı — değişiklik YOK
- **ZATEN DOĞRU**: raporun bug dediği davranış bilinçli tasarım

### 9.1 KRİTİK (P0)

| Bulgu | Karar | Kanıt / Değişiklik |
|---|---|---|
| K1 `invidious:cancel` indirme işini öldürmüyor | **GERÇEK → DÜZELTİLDİ** (etki abartılıydı: renderer `invidious:cancel` çağırmıyor, `media:cancelDownload` doğru slot'u vuruyordu; yine de sahiplik etiketi eklendi) | `downloadStream` işi `'invidious-stream'` jobTag taşır; `invidious:cancel` etiketli download işini de öldürür. `main.js` |
| K2 SID kalıcı değil | **GERÇEK → DÜZELTİLDİ** | `invidious-session.safe.json` + `safeStorage` şifreli kalıcılık; `persistInvidiousSessions`/`restoreInvidiousSessions`; login/logout'ta yazma, `whenReady`'de geri yükleme |
| K3 `_cached_instance` cache poisoning | **FALSE POSITIVE** | `_cached_instance` süreç-içi değişken; her komut yeni Python süreci — süreçler arası sızıntı yok. Raporun kendi §5 tablosu da bunu itiraf ediyor |
| K4 `lastInvidiousInstance` senkron | **GERÇEK → DÜZELTİLDİ** (D-K7 ile aynı kök) | `loadInvidiousChannel` kanal yanıtındaki `instance`'ı `lastInvidiousInstance`'e yazar — göreli thumbnail doğru host'ta |
| K5 Python'da per-chunk iptal | **FALSE POSITIVE** | `terminateProcessTree` `taskkill /T /F` — süreç ağacı zorla öldürülür; bloke HTTP read ölümü geciktirmez. `.invtmp-*` artıkları bir sonraki indirmede süpürülüyor |
| K6 `restoreInvidiousSession` çağrılmıyor | **FALSE POSITIVE** | `initSmartTube()` içinde `restoreInvidiousSession()` zaten çağrılıyor |
| K7 HTTP'ye SID | **GERÇEK → DÜZELTİLDİ** | `isLocalInvidiousInstance()`: https her zaman, http yalnız loopback/`.local`/RFC1918 özel IPv4. Uzak düz-http'ye SID gitmez |
| D-K1 closePlayer SmartTube'u geri getirmiyor | **GERÇEK → DÜZELTİLDİ** | `closePlayer`: `!closedVideo.currentSrc` ise `setMediaKey('')` + `showHomeWhenNoVideo()` |
| D-K2 closePlayer sonrası mediaKey kalıyor | **GERÇEK → DÜZELTİLDİ** | D-K1 ile aynı düzeltme — ölü kaynakta `mediaKey` sıfırlanıyor |
| D-K3 paralel feed yarışı | **GERÇEK → DÜZELTİLDİ** | Backend `feed_home`: tek süreçte `ThreadPoolExecutor(2)` ile popular+trending, tek `feed` emit'i (`runInvidiousCommand` tek sonuç tutar — iki emit ilki kaybederdi). Emit/log `_emit_lock` altında (NDJSON karışması) |
| D-K4 playerSource değişimi SmartTube açmıyor | **GERÇEK → DÜZELTİLDİ** | `playerSourceSelect`: `playerSource==='invidious' && !player.mediaKey` → `setSmartTubeVisible(true)` |
| D-K5 `setSmartTubeVisible` arama durumunu unutuyor | **GERÇEK → DÜZELTİLDİ** | `stSearchActive` iken `stSearchResults` geri getiriliyor, `stGrid` gizli kalıyor |
| D-K6 login çift tıklama | **GERÇEK → DÜZELTİLDİ** | `_invLoginBusy` guard — uçuşta Enter/click ikinci isteği engeller |
| D-K7 = K4 | **GERÇEK → DÜZELTİLDİ** | yukarıda |

### 9.2 YÜKSEK (P1)

| Bulgu | Karar | Kanıt / Değişiklik |
|---|---|---|
| Y1 topbar sticky değil | **FALSE POSITIVE** | `.st-topbar` `.st-grid`'in kardeşi; kaydırılan yalnız `.st-grid` (`overflow-y:auto`) — topbar zaten kaybolmuyor |
| Y2 eski inv-* DOM çift panel | **GERÇEK → DÜZELTİLDİ** | `renderInvidiousHome/renderInvidiousCard/initInvidiousHome` + `index.html` paneli + `.inv-*` CSS silindi; modal düğme bağlantıları `initSmartTube`'a taşındı |
| Y3 arama debounce yok | **GERÇEK → İYİLEŞTİRME** | input'ta 450ms debounce'lu canlı arama; Enter anında, Esc sıfırlar, boşalınca reset |
| Y4 chip `stSectionSeq` artmıyor | **FALSE POSITIVE** | `renderSmartTubeSection` her çağrıda `++stSectionSeq` yapıyor — chip tıklaması da o yoldan geçiyor |
| Y5 home çift feed | **GERÇEK → DÜZELTİLDİ** | D-K3 birleşik `feed_home` ile aynı düzeltme |
| Y6 seek-marker overflow | **FALSE POSITIVE** | `renderSeekMarkers` `t>=0 && t<=duration` filtreli + `%` konum — taşma imkânsız |
| Y7 canlı yayında `Infinity*x → NaN` | **FALSE POSITIVE** | seek handler `Number.isFinite(video.duration)` guard'lı |
| Y8 `pSecToTime` NaN | **FALSE POSITIVE** | `!isFinite(sec)` guard'ı zaten var (`0:00` döner) |
| Y9 klavye seek görsel tazeleme | **GERÇEK → DÜZELTİLDİ** | `±10s`/`±5s` seek sonrası `updateSeekVisuals()` çağrısı eklendi |
| Y10 V tuşu menü açıkken çift aksiyon | **GERÇEK → DÜZELTİLDİ** | `subMenu` açıkken V yalnız menüyü kapatır |
| Y11 `lastSubtitleMode` persist yok | **GERÇEK → DÜZELTİLDİ** | `playerLastSubtitleMode` → `collectUiSettings`/`applyUiSettings`; `setSubtitleMode` `scheduleSave()` tetikler |
| Y12 mute simgesi volumechange'siz | **GERÇEK → DÜZELTİLDİ** | `volumechange → syncMuteIcon` + `aria-pressed` |
| Y13 renderSeekMarkers A-B siliyor | **FALSE POSITIVE** | A-B işaretleri `.ab-marker`/`.ab-range` sınıfı; `renderSeekMarkers` yalnız `.seek-marker` siler — bilinçli tasarım (kod yorumu da bunu belgeliyor) |
| Y14 screenshot offset'siz cue | **FALSE POSITIVE** | `activeIdx` zaten `video.currentTime - player.offset` ile hesaplanıyor |
| D-Y1 kart başına 4 listener | **İYİLEŞTİRME — kısmen** | Bellek sızıntısı yok (`innerHTML` temizliği listener'ları da toplar); delegation refactor'ı riskli/eskik kazanç — `content-visibility` ile asıl maliyet (çizim) düşürüldü |
| D-Y2 offsetTop reflow zinciri | **FALSE POSITIVE** | `stGridColumns` ilk satır bitince `break`; yazma yokken ardışık okumalar tek layout'a düşer. "31 reflow" iddiası doğrulanamadı |
| D-Y3 ambient boyama gizli sekmede de çalışıyor | **GERÇEK → DÜZELTİLDİ** | `paint` başına `document.hidden` kontrolü |
| D-Y4 MutationObserver leak | **FALSE POSITIVE** | Tek kalıcı observer, `playerTitleNode` canlı DOM'da — leak değil |
| D-Y5 stSearchGrid temizlenmiyor | **GERÇEK → DÜZELTİLDİ** | `resetSmartTubeSearch` `searchGrid.innerHTML=''` + `stSearchSeen.clear()` |
| D-Y6 login modal çift açılma | **FALSE POSITIVE → ek güvence** | Lazy-binding (`_invLoginModalBound`) tekil; `_invLoginBusy` zaten submit'i kilitliyor |
| D-Y7 login sonrası status güncel değil | **GERÇEK → DÜZELTİLDİ** | `restoreInvidiousSession` `setSmartTubeStatus` ile yansıyor |
| D-Y8 stale kanal "Yükleniyor" kalıyor | **FALSE POSITIVE** | seq guard bayat yanıtı düşürür; yeni render grid'i sahiplenir — placeholder eski yanıtla değil yeni render'la örtülür |
| D-Y9 initInvidiousHome stale closure | **ÇÖZÜLDÜ (Y2)** | Fonksiyon komple silindi |
| D-Y10 72 kart sync render | **İYİLEŞTİRME → DÜZELTİLDİ** | `.st-card { content-visibility:auto; contain-intrinsic-size }` — ekran dışı kartlar çizilmez |

### 9.3 ORTA (P2)

| Bulgu | Karar | Kanıt / Değişiklik |
|---|---|---|
| O1 `.st-section-title` renk yok | **FALSE POSITIVE** | `color: var(--accent)` zaten tanımlı |
| O2 responsive breakpoint yok | **GERÇEK → DÜZELTİLDİ** | 1100px/720px media query'leri: grid min 170/140px, sidebar 60px ikon rayı |
| O3 up-next animasyon yok | **FALSE POSITIVE** | `.st-upnext` `animation: st-upnext-in .18s` zaten var (+ reduced-motion kapatma) |
| O4 sidebar toggle yok | **İYİLEŞTİRME — kısmen** | 720px'te sidebar otomatik 60px ikon rayına düşer; manuel toggle düğmesi eklenmedi (deferred) |
| O5 ikonlar `aria-hidden` eksik | **GERÇEK → DÜZELTİLDİ** | `st-side-icon`lara `aria-hidden="true"` |
| O6 arama × butonu yok | **GERÇEK → DÜZELTİLDİ** | `#stSearchClear` + input senkronu |
| O7 şifre göster/gizle yok | **GERÇEK → DÜZELTİLDİ** | `#invLoginPassToggle` Göster/Gizle + `aria-pressed` |
| O8 `.st-card:focus-visible` yok | **FALSE POSITIVE** | `border-color: var(--accent)` + translate zaten tanımlı |
| O9 search input focus stili yok | **ZATEN DOĞRU** | `.st-search-wrap:focus-within { border-color: var(--accent) }` mevcut |
| O10 placeholder rengi yok | **İYİLEŞTİRME → DÜZELTİLDİ** | `#stSearchInput::placeholder { color: var(--muted) }` |
| O11 `decoding=async` eksik | **GERÇEK → DÜZELTİLDİ** | Kart img'lerine `img.decoding='async'` |
| O12 gizli up-next keydown çalışıyor | **FALSE POSITIVE** | `display:none` içindeki öğelere klavye odağı gidemez — handler tetiklenemez |
| O13 sidebar `padding-left:1px` magic | **FALSE POSITIVE** | `.is-active`'in `border-left:3px`'ini telafi eder — içerik kaymasın diye bilinçli |
| O14 hard-coded renkler | **GERÇEK → DÜZELTİLDİ** | st-* blokları token'lara çekildi (`--bg-card/--fg/--muted/--accent/--border`) |
| O15 radius token dışı | **GERÇEK → DÜZELTİLDİ** | `var(--radius-sm)` ile uyumlu hale getirildi |
| D-O1 stSearchSeen sınırsız | **GERÇEK → DÜZELTİLDİ** | `ST_SEARCH_MAX=500` — grid/dedupe tavanı |
| D-O2 paralel fetch await zinciri | **ÇÖZÜLDÜ (D-K3)** | `feed_home` tek süreçte paralel; eski zincir yok |
| D-O3 i18n anahtar yokluğu | **ZATEN DOĞRU** | `UiLocale.t(k) || k` fallback kalıbı bilinçli |
| D-O4 getBoundingClientRect thrash | **FALSE POSITIVE** | D-Y2 ile aynı — okuma-yazma karışımı yok |
| D-O5 thumbnail paralel fetch | **FALSE POSITIVE** | `loading="lazy"` native batching zaten var |
| D-O6 yorum DOM birikimi | **GERÇEK → DÜZELTİLDİ** | `ST_COMMENTS_MAX=200` — sayfalama tavanı |
| D-O7 iki backdrop-filter katmanı | **KABUL EDİLMİŞ MALİYET** | `.st-upnext` blur(10px) + topbar blur(6px) farklı yüzeyler — polish deferred |
| D-O8 HTTP kodu log'da kayboluyor | **FALSE POSITIVE** | `str(HTTPError)` "HTTP Error 429: ..." içerir — kod log'da görünür |
| D-O9 disk dolu/izin mesajı | **GERÇEK → İYİLEŞTİRME** | `ENOSPC`/`EACCES`/`EPERM` → dostça Türkçe mesaj (`media.py` error emit) |
| D-O10 429 failover loop | **FALSE POSITIVE** | `_fetch_with_failover` her hatada sonraki instance'a geçer (429 dahil); `seen` seti bounded |
| D-O11 bozuk JSON belirsiz | **FALSE POSITIVE** | `readPublicSettings`/`loadWindowState` try/catch + default |
| D-O12 kart box-shadow GPU | **FALSE POSITIVE** | `.st-card`'da box-shadow yok |
| D-O13 idle timer no-op remove | **FALSE POSITIVE** | Olmayan sınıfı `remove()` zararsız standart kalıp |

### 9.4 DÜŞÜK (P3)

| Bulgu | Karar | Kanıt / Değişiklik |
|---|---|---|
| D1 statü `aria-live` | **GERÇEK → DÜZELTİLDİ** | `#stStatusLine role="status" aria-live="polite"` |
| D2 kanal butonu roving'e çıkmıyor | **FALSE POSITIVE** | `stopPropagation` yalnız Enter/Space'te — ok tuşları grid nav'a kabarcıklanıyor |
| D3 sidebar focus-visible | **GERÇEK → DÜZELTİLDİ** | `.st-side-item:focus-visible` outline |
| D4 inline `gridColumn` | **GERÇEK → DÜZELTİLDİ** | `.st-grid-row` CSS sınıfı; tüm inline atamalar taşındı |
| D5 reduced-motion kapsamı | **GERÇEK → DÜZELTİLDİ** | `@media (prefers-reduced-motion: reduce)` st-card/st-upnext |
| D6 kanal açıklaması kesik | **İYİLEŞTİRME — deferred** | 2-satır clamp kasıtlı yoğunluk tercihi |
| D7 `&times;` tutarsız | **FALSE POSITIVE** | Tüm hız seçenekleri aynı entity kullanıyor |
| D8 prev/next disabled | **FALSE POSITIVE** | Böyle düğmeler mevcut değil |
| D9 resumeChip `resumeOffered` | **FALSE POSITIVE** | `resetMediaBoundState` sıfırlıyor; 12sn gizleme kasıtlı |
| D10 up-next thumb mobil | **İYİLEŞTİRME → DÜZELTİLDİ** | `clamp(96px,38%,128px)` zaten duyarlıydı; 720px'te 72-96px |
| D-D1 SRT+ASS stil çakışması | **ZATEN DOĞRU** | `applySubtitleStyle` CSS değişkenleriyle tek kaynak |
| D-D2 RTL desteği | **İYİLEŞTİRME — deferred** | `dir="rtl"` kapsamlı iş; altyazı metni Unicode-bidi ile doğru diziliyor |
| D-D3 Intl kullanılmıyor | **GERÇEK → İYİLEŞTİRME** | `formatCount` → `Intl.NumberFormat({notation:'compact'})` |
| D-D4 captions endpoint deprecate | **NOT EDİLDİ** | srv1/srv3 çift-format fallback zaten var |
| D-D5 401/403 provider failover | **FALSE POSITIVE** | `shouldFailoverTranslationStatus` `sameProviderAliases` ile 401/403'ü alias'larda dener — belgelenmiş |
| D-D6 `.part` artıkları | **FALSE POSITIVE** | `.invtmp-*` süpürme var; yt-dlp `.part` resume için kendi yönetir |
| D-D7 `absThumb` şema kontrolü | **GERÇEK → DÜZELTİLDİ** | `^https?://` beyaz liste — `javascript:`/`data:`/`file:` img'ye basılmaz |
| D-D8 IPC payload limiti | **İYİLEŞTİRME — deferred** | NDJSON satırları bounded; `send` boyut sınırı not edildi |

### 9.5 ÖZET

| Sınıf | Adet |
|---|---|
| GERÇEK → düzeltildi | **30** |
| İyileştirme → uygulandı | **6** (D-D7 dahil güvenlik) |
| İyileştirme — deferred | **6** (O4, D6, D-D2, D-D8, D-O7, D-Y1 delegation) |
| FALSE POSITIVE | **36** |
| ZATEN DOĞRU / çözüldü | **6** |

**Değişen dosyalar:** `src/renderer/renderer.js`, `src/renderer/index.html`, `src/renderer/styles.css`, `src/main.js`, `src/preload.js`, `backend/invidious.py`, `backend/media.py`, `tests/report67-smarttube-wiring.test.js`, `tests/report65-invidious-bridge.test.js`, `tests/adversarial-ipc.test.js`, `tests/electron-smarttube-boot.smoke.js`

**Doğrulama:**
- `tests/report67-smarttube-wiring.test.js`: **66/66** (27 yeni R68 regresyonu dahil)
- `tests/report65-invidious-bridge.test.js`: 21/21 (SmartTube eşleniklerine güncellendi)
- `tests/adversarial-ipc.test.js`: 15/15 (init sandbox mock'una `restoreInvidiousSessions` eklendi)
- `tests/electron-smarttube-boot.smoke.js`: **GEÇTİ** — gerçek Electron DOM'unda birleşik feed, `sepFullRow`, `channelHead`, roving nav, up-next, yorumlar
- `backend/test_invidious.py`: 59/59 · `design-system`: OK · `node --check` ×3 + `py_compile` ×2: temiz
- `npm test` kalan kırıklar: `report62`/`report63-secret`/`report63-ssrf` — başka iş akışının commit'siz WIP'i, bu kapsamın dışında

**Kalan sınır:** Canlı Invidious instance davranışı mock/fixture seviyesinde — gerçek ağ doğrulaması `start.bat` ile kullanıcı ortamında yapılmalı.
