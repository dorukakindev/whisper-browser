# ELECTRON/BROWSER ARAYÜZ DERİN DENETİM RAPORU — Whisper Local

**Tarih:** 2026-09-12 · **Dal:** master · **Kapsam:** Electron renderer (`src/renderer/renderer.js`, 19.765 satır), `index.html` (2.524 satır), `styles.css` (6.289 satır), `queue-lifecycle.js`, `renderer-ui-model.js`, `main.js` (13.182 satır), `preload.js` (170 API).

**Odak:** "Arayüz çalışıyor görünüyor ama kullanıcı işlemi doğru tamamlayamıyor" hataları — gerçek Chromium yerleşimi, görünürlük, tıklama hedefleri, focus, kaydırma, klavye, dinamik içerik, erişilebilirlik ağacı.

**Sınır uyumu:** Hiçbir kaynak, test, ayar veya tracked dosya değiştirilmedi. Tüm doğrulama betikleri `%TEMP%\whisper-audit\` altında, fixture'lar sentetik, userData `%TEMP%\whisper-audit-ud`'de idi (denetim sonunda silindi). Dış ağ, gerçek model, transkripsiyon, çeviri, GPU işi, credential kullanılmadı.

---

## 1. En önemli doğrulanmış kullanıcı engelleri

| # | Engel | Önem | Katman |
|---|---|---|---|
| **B-01** | **Dar/tek-sütun görünümde (≤980px) ilerleme göstergeleri, önizleme, log ve kuyruk kartı viewport dışında; kullanıcı iş başlattığında geri bildirim göremez** | P1 | Gerçek Chromium |
| **B-02** | **Kuyruk öğesi silindikten sonra focus `BODY`'ye düşüyor — klavye kullanıcısı konumunu kaybediyor** | P2 | Gerçek Chromium (frame canlı) |
| **B-03** | **Tek-sütun görünümde `.preview` `max-height` olmadan 4025px'e büyüyor; log alanı 6467px'e itiliyor** | P2 | Gerçek Chromium |
| **B-04** | **Segment `contenteditable` metinlerinde erişilebilir ad/rol yok; ekran okuyucu "düzenlenebilir metin" bağlamını duyuramaz, klavye kullanıcısı odaklayamaz** | P2 | Kaynak + DOM |
| **B-05** | **500 segment insert'i 10.6 saniye sürüyor (O(n²) DOM maliyeti); 100'de 0.53sn — uzun işlerde UI donuyor** | P2 | Gerçek Chromium ölçüm |
| **B-06** | **İş sürerken ayar kontrolleri disabled değil — kullanıcı değiştirebilir ama iş dondurulmuş opts kullanır; görsel geri bildirim yok** | P3 | Gerçek Chromium |

---

## 2. Ortam, kaynak sürümü ve test izolasyonu

- **Uygulama:** Electron 43.2.0 (castlabs, Chrome/150.0.7871.129), gerçek Chromium renderer.
- **Başlatma:** `node_modules\.bin\electron.cmd . --remote-debugging-port=9777 --user-data-dir=%TEMP%\whisper-audit-ud` — izole userData.
- **CDP harness:** `%TEMP%\whisper-audit\cdp.js` + probe betikleri (repo dışı). Compositor, `Overlay.enable` + `Overlay.setShowFPSCounter` ile canlı tutuldu.
- **Kritik ortam notu:** Gizli/arka-plan pencerede `requestAnimationFrame` **ateşlenmiyor** (`visibilityState: hidden` → override sonrası `visible` ama compositor frame üretmiyor). Bu, modal focus ve hata kutusu scroll'unun ilk testlerde "çalışmıyor" görünmesine yol açtı. Compositor canlandırıldıktan sonra her ikisi de **doğru çalışıyor** — bu bir **test ortamı artefaktı** olarak kayda geçirildi, ürün hatası değil (Bkz. Bölüm 6, Elenen Hipotez #1, #2).
- **Kaynak hash'leri (SHA256, başlangıç = son, değişmedi):**

| Dosya | SHA256 (ilk 8 + son 5) |
|---|---|
| `src/renderer/renderer.js` | 810982FA…C61CB |
| `src/renderer/index.html` | B97F83EE…3FC1A |
| `src/renderer/styles.css` | 2D099BFC…34078C |
| `src/renderer/queue-lifecycle.js` | 6B15B472…03B11 |
| `src/renderer-ui-model.js` | CBC125F2…2D91A |
| `src/main.js` | 3F8BCC41…27C087 |
| `src/preload.js` | E0376E37…DC7AAA |

- **İzolasyon:** Denetim sonrası Electron kapatıldı (kalan süreç: 0), `whisper-audit-ud` silindi.

**Kullanılan doğrulama katmanları:**
- ✅ Kaynak incelemesi (CSS breakpoint'ler, renderer.js handler'ları)
- ✅ Sentetik DOM/IPC testi (state manipülasyonu, `addSegment`, `logLine`, `showResultModal`, `addToQueue`, `setInputFile`)
- ✅ Gerçek Chromium/Electron etkileşimi (CDP `Runtime.evaluate`, `elementFromPoint` hit-test, `getBoundingClientRect`, `getComputedStyle`, `Emulation.setDeviceMetricsOverride` ile viewport)
- ✅ Erişilebilirlik ağacı incelemesi (ARIA rolleri, `aria-live`, `aria-invalid`, `aria-describedby`, accessible name)
- ❌ Gerçek yardımcı teknoloji (ekran okuyucu) testi — **yapılmadı, iddia edilmiyor**
- ❌ Gerçek browser zoom (font/rendering etkisi) — yalnızca etkili CSS genişliği (viewport) ile layout breakpoint'i test edildi

---

## 3. Gerçek kullanıcı görevleri ve doğrulama katmanları

| Görev | Gerçek kontrol | Katman | Sonuç |
|---|---|---|---|
| Girdi seçme | `dropZone` (role=button, tabindex=0, aria-label) | Gerçek Chromium | ✅ Görünür (472×208), tıklanabilir, klavye erişilebilir |
| Ayar yapma | `model`, `engine`, `language`, `beamSize`… (select/input) | Gerçek Chromium | ✅ Tab sırasında (122 focusable), label bağlı |
| Kuyruğa ekleme | `addToQueue` → `renderQueue` | Sentetik DOM | ✅ Çalışıyor, dedupe var (renderer.js:434-438) |
| Başlatma | `startBtn` (btn-primary, 250×46) | Gerçek Chromium (hit-test) | ✅ Görünür, merkez + üst kenar hit OK |
| İptal | `cancelBtn` (btn-danger) | Gerçek Chromium (hit-test) | ✅ Görünür, tıklanabilir (iç SPAN'a tıklama da çalışır — `cancelBtn.contains(hit)`) |
| Hata sonrası yeniden deneme | `jobValidation` (role=alert) + queue-retry | Gerçek Chromium (frame canlı) | ✅ Focus alıyor, viewport'ta (top:126), aria-invalid + aria-describedby bağlı |
| Sonuç inceleme | `resultModal` (role=dialog, aria-modal=true) | Gerçek Chromium (frame canlı) | ✅ Focus `reviewOutput`'a gidiyor, Escape `startBtn`'e dönüyor, arka plan inert |
| Kuyruk öğesi silme | `.queue-remove[data-id]` | Gerçek Chromium | ⚠️ **Focus BODY'ye düşüyor (B-02)** |
| İlerleme takibi (dar ekran) | `progressText`, `progressFill`, `statusPill` | Gerçek Chromium (944px) | ❌ **Viewport dışında (B-01)** |

---

## 4. Pencere/zoom/içerik test matrisi

**Ham ölçümler (gerçek Chromium, `getBoundingClientRect`, scroll=0):**

| Viewport | Layout | startBtn | dropZone | progressText | progressFill | statusPill | preview | log | queueCard | Yatay scroll |
|---|---|---|---|---|---|---|---|---|---|
| 1180×822 (100%) | İki sütun | ✅ top:750, hit OK | ✅ top:196 | ✅ top:204 | ✅ top:189 | ✅ top:146 | ✅ top:419 | ✅ top:660 | ⚠️ top:1988 (panel içi scroll) | Yok |
| 944×822 (125%) | Tek sütun | ✅ top:772, hit OK | ✅ top:192 | ❌ **top:2157** | ❌ **top:2143** | ❌ **top:2100** | ❌ **top:2359** | ❌ **top:6467** | ❌ **top:1927** | Yok |
| 787×822 (150%) | Tek sütun | ✅ top:772, hit OK | ✅ | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | Yok |
| 590×822 (200%) | Tek sütun | ✅ top:772, hit OK | ✅ | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | Yok |
| 940×680 (min) | Tek sütun | ✅ top:630, hit OK | ✅ | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | ❌ dışı | Yok |

**Scroll doğrulaması (944px):** `document.documentElement.scrollHeight` = 822 (kilitli görünüyor) ama `document.body.scrollHeight` = 6621 → **body scroll edilebilir**. `body.scrollTop = 1757` ile `progressText` viewport'a girdi (top:400, doğrulandı). Yani içerik **erişilebilir ama sezgisel değil** — kullanıcının ~1800px kaydırması gerekiyor ve bunu bilmesi beklenemez.

**İçerik taşması (uzun Türkçe dosya adı, 1180px):** `fileName` scrollWidth:767 > clientWidth:355 → `text-overflow: ellipsis` ile kırpılıyor, `clearFile` panel içinde (right:498 ≤ panel right), yatay scroll yok. **Ancak** `fileName`'in `title` attribute'u yok — kırpılan adın tamamı tooltip'te görünmüyor (kuyruk öğesinde `title` var, ana dosya gösteriminde yok).

---

## 5. Kesin bulgular ve kanıtları

Her bulgu için kanıt standardı: kaynak konum, erişilebilir başlangıç durumu, kullanıcı adımları, kontrollü yeniden üretim (ham ölçüm), beklenen davranışın gerekçesi, gözlenen etkileşim/geometri, kullanıcı etkisi, guard incelemesi, test açığı.

### B-01 · P1 · KESİN — Tek-sütun görünümde iş geri bildirimi viewport dışında

- **Görev:** 2, 3, 8, 20 · **Önem:** P1
- **Konum:** `src/renderer/styles.css:3956-3960` (`@media (max-width: 980px)`) + `3465-3471` (`.app-main` grid) + `3807-3812` (`.preview`).
- **Başlangıç durumu:** Pencere genişliği ≤980px (veya %125+ zoom'da etkili CSS genişliği ≤980px).
- **Adımlar:** Dosya seç → Başlat'a tıkla.
- **Yeniden üretim (gerçek Chromium, 944×822, scroll=0, ham veri):**
  ```
  startBtn:      top:772,  bottom:818,  inVp:true,  hit:"OK"
  progressText:  top:2157, bottom:2173, inVp:false
  progressFill:  top:2143, bottom:2148, inVp:false
  statusPill:    top:2100, bottom:2126, inVp:false
  progressTime:  top:2157, bottom:2173, inVp:false
  preview:       top:2359, bottom:6385, inVp:false
  log:           top:6467, bottom:6589, inVp:false
  queueCard:     top:1927, bottom:2043, inVp:false
  viewportH: 822, docScrollH: 822 (documentElement), bodyScrollH: 6621
  app-main grid-rows: 1939.43px 4528px
  ```
- **Beklenen:** Kullanıcı Başlat'a tıkladığında ilerleme çubuğu, durum rozeti ve canlı önizleme görünür alanda olmalı (iki sütunlu görünümde oldukları gibi, top:146-660).
- **Gözlenen:** Tek sütunda `.app-main` `grid-template-rows: 1939px 4528px` üretiyor; sağ panel (ilerleme + önizleme + log) sol panelin **1939px altına** yerleşiyor. Kullanıcı iş başlattığında ekranda yalnızca iptal düğmesi görünüyor; ilerlemeyi görmek için ~1800px aşağı kaydırması gerekiyor.
- **Kullanıcı etkisi:** Dar pencerede / yüksek zoom'da kullanıcı işin ilerleyip ilerlemediğini göremez; "dondu" sanıp iptal edebilir veya pencereyi büyütmek zorunda kalır.
- **Guard incelemesi:** `.panel-right > .card-flex { min-height: 360px }` (3959) yalnızca kart yüksekliğini garanti ediyor, görünürlüğü değil. `overflow: visible` (3958-3959) scroll'u body'ye devrediyor ama kullanıcıya bunu bildiren ipucu yok. `body.scrollTop=1757` ile progressText görünür oldu (doğrulandı) — içerik erişilebilir ama sezgisel değil.
- **Test açığı:** `renderer-state-a11y-responsive.test.js` `effectiveViewport` modelini (renderer-ui-model.js:151) test ediyor ama **gerçek Chromium'da** ilerleme göstergelerinin viewport içinde kalıp kalmadığını ölçmüyor.
- **Güven düzeyi:** Kesin (gerçek Chromium bounding rect + scroll doğrulaması).

### B-02 · P2 · KESİN — Kuyruk öğesi silindikten sonra focus kayboluyor

- **Görev:** 11, 18, 20 · **Önem:** P2
- **Konum:** `src/renderer/renderer.js:468-472` (`removeFromQueue`) + `500-560` (`renderQueue` tam yeniden kurulum).
- **Başlangıç durumu:** Kuyrukta 2+ öğe.
- **Adımlar:** Bir öğenin sil düğmesine Tab ile git → Enter ile sil.
- **Yeniden üretim (gerçek Chromium, frame canlı, ham veri):**
  ```
  removeBtn.focus(); removeBtn.click();
  → document.activeElement = BODY  (focusLost: true, remaining: 1)
  ```
- **Beklenen:** Silinen öğenin ardından focus mantıklı bir yere taşınmalı (sonraki/önceki öğenin sil düğmesi veya kuyruk başlığı) — WAI-ARIA focus management pratiği.
- **Gözlenen:** `renderQueue` tüm listeyi `innerHTML` ile yeniden kuruyor; silinen düğme DOM'dan kalkınca focus `BODY`'ye düşüyor. Klavye kullanıcısı Tab'a basarak en baştan (header) dolaşmaya başlamak zorunda.
- **Kullanıcı etkisi:** Birden çok kuyruk öğesini klavyeyle silmek isteyen kullanıcı her silme sonrası konumunu kaybeder.
- **Guard:** Yok — `removeFromQueue` focus'u yönetmiyor.
- **Test açığı:** `queue-lifecycle.test.js` state mantığını test ediyor; `document.activeElement`'i test eden yok.
- **Güven düzeyi:** Kesin.

### B-03 · P2 · KESİN — Tek-sütunda `.preview` sınırsız büyüyor, log 6467px'e itiliyor

- **Görev:** 3, 4, 6 · **Önem:** P2
- **Konum:** `src/renderer/styles.css:3807-3812` (`.preview { flex: 1; overflow-y: auto; min-height: 0 }` — **max-height yok**) + `3956-3960`.
- **Yeniden üretim (gerçek Chromium, 944×822, 100 segment, ham veri):**
  ```
  .preview:  offsetHeight: 4025px, flexGrow: 1, maxHeight: "none", children: 100
  .log:      top: 6467px
  app-main:  scrollH: 6513, gridRows: "1939.43px 4528px"
  ```
- **Beklenen:** Tek sütunda da önizleme makul bir yükseklikte sınırlı kalmalı (ör. `max-height: 40vh`) ki log ve kuyruk erişilebilir olsun.
- **Gözlenen:** 100 segment önizlemeyi 4025px'e şişiriyor; log alanı 6467px'e itiliyor. Kullanıcı log'u görmek için ~5600px kaydırmalı.
- **Kullanıcı etkisi:** Uzun işlerde dar ekranda log ve kuyruk pratik olarak erişilemez.
- **Guard:** `PREVIEW_DOM_CAP` (1500) DOM düğüm sayısını sınırlıyor ama **yüksekliği** sınırlamıyor.
- **Test açığı:** Responsive testler yükseklik sınırını ölçmüyor.
- **Güven düzeyi:** Kesin.

### B-04 · P2 · KESİN — Segment contenteditable metinlerinde erişilebilir ad/rol/tabindex yok

- **Görev:** 16, 18 · **Önem:** P2
- **Konum:** `src/renderer/renderer.js:1254-1262` (`createSegmentEl`).
- **Yeniden üretim (DOM, ham veri):**
  ```
  <span class="segment-text" contenteditable="true" spellcheck="false"
        title="Düzenlemek için tıkla — Kopyala/JSON yeniden-üret bu metni kullanır">
  segText.getAttribute('aria-label') = null
  segText.getAttribute('role')       = null
  segText.tabIndex                   = -1
  ```
- **Beklenen:** Düzenlenebilir metin alanı `role="textbox"` ve anlamlı bir `aria-label` (ör. "Segment 3 metni — düzenlemek için girin") taşımalı; `tabindex="0"` ile klavye erişilebilir olmalı.
- **Gözlenen:** `contenteditable="true"` tek başına rol vermez; `title` yalnızca tooltip. Ekran okuyucu kullanıcısı bu alanın düzenlenebilir olduğunu ve hangi segmente ait olduğunu bilemez. `tabindex="-1"` klavye erişimini kapatıyor — kullanıcı segment metnini yalnızca fareyle düzenleyebilir.
- **Kullanıcı etkisi:** Klavye/ekran okuyucu kullanıcısı altyazı segmentini düzenleyemez.
- **Guard:** Yok.
- **Test açığı:** A11y testleri bu alanı kapsamıyor.
- **Güven düzeyi:** Kesin (kaynak + DOM doğrulaması). **Not:** Gerçek ekran okuyucu testi yapılmadı.

### B-05 · P2 · KESİN — 500 segment insert'i 10.6 saniye (O(n²) DOM maliyeti)

- **Görev:** 19 · **Önem:** P2
- **Konum:** `src/renderer/renderer.js:1306-1319` (`addSegment` → `clearPreviewActiveSegment` + `appendChild` + `enforcePreviewCap`).
- **Yeniden üretim (gerçek Chromium, sentetik yük, `performance.now()`, ham veri):**
  ```
  100 segment: insertMs: 589   (temiz preview'da: 531)
  250 segment: insertMs: 2688
  500 segment: insertMs: 10641
  clickMs: 0, scrollMs: 4-16 (tıklama/scroll tepkisi insert aralarında ölçüldü)
  ```
- **Ölçüm koşulları:** Tek probe, aynı oturum, ardışık kademeler, `clearPreview()` ile her kademe öncesi temizlik. Değişkenlik: tek ölçüm; ancak 100→500 arası **~18x artış** lineer değil (5x beklenirdi), kuvvetli O(n²) sinyali.
- **Beklenen:** Segment ekleme yaklaşık lineer olmalı (100→500 ≈ 5x, ~3sn).
- **Gözlenen:** 18x artış. Muhtemel neden: her `addSegment`'te `clearPreviewActiveSegment`'in tüm preview'da `.preview-active` querySelector'ı + `isNearBottom` + `scrollTop`/`scrollHeight` layout ölçümü (layout thrashing — her ekleme style+layout recalculation zorluyor).
- **Kullanıcı etkisi:** Uzun/yoğun segmentli işlerde UI donuyor; ana thread bloklandığı için kullanıcı bu sırada tıklayamaz.
- **Guard:** `PREVIEW_DOM_CAP` 1500'de devreye giriyor ama 500'de henüz yok; 1500 segmentte maliyet çok daha yüksek olur (tahmini ~90sn+ O(n²) ile).
- **Test açığı:** Performans testi yok; `RESOURCE_SOAK.md` bellek odaklı.
- **Güven düzeyi:** Kesin (ölçüm); kök neden satır düzeyinde **yüksek olasılıklı** (querySelector + layout thrashing — profil ile teyit önerilir).

### B-06 · P3 · KESİN — İş sürerken ayar kontrolleri disabled değil

- **Görev:** 13, 20 · **Önem:** P3
- **Konum:** `src/renderer/renderer.js:2613-2694` (`startBtn` handler) — çalışırken kontroller `disabled` edilmiyor.
- **Yeniden üretim (gerçek Chromium, ham veri):**
  ```
  state.running=true iken:
  model.disabled = false, engine.disabled = false, language.disabled = false,
  pickVideosBtn.disabled = false, dropZone pointerEvents = "auto"
  ```
- **Beklenen (tartışmalı):** İş sürerken ayar değişikliği ya engellenmeli ya da "sonraki işe uygulanır" olduğu açıkça belirtilmeli.
- **Gözlenen:** Kullanıcı ayarları değiştirebiliyor; ancak iş `addToQueue`'da dondurulmuş `opts` ile çalışıyor (renderer.js:457). Değişiklik **mevcut işi etkilemiyor** — ama kullanıcı bunu bilmiyor.
- **Kullanıcı etkisi:** Kullanıcı "modeli değiştirdim ama bir şey değişmedi" diyebilir. Bu bir **tasarım kararı** olabilir (donmuş opts doğru); eksik olan **görsel geri bildirim**.
- **Guard:** Opts dondurma doğru çalışıyor; eksik UI geri bildirimi.
- **Test açığı:** Yok.
- **Güven düzeyi:** Kesin (davranış); **önem düşük** çünkü veri kaybı/yanlış çıktı yok.

---

## 6. Doğrulanmamış maddeler ve elenen hipotezler

### Elenen hipotezler (kanıtla)

1. **Modal focus çalışmıyor** — İlk testlerde `rAF` ateşlenmediği için focus `startBtn`'de kalıyor göründü (`rafFired: false`, `visibilityState: hidden`). Compositor canlandırıldıktan sonra (`Overlay.setShowFPSCounter`) **focus `reviewOutput`'a doğru gidiyor (`focusOk: true`), Escape `startBtn`'e geri dönüyor (`restored: true`).** Gizli pencerede rAF'ın ateşlenmemesi **test ortamı artefaktı** (headless/gizli pencere compositor'u durdurur), ürün hatası değil. **ELENDİ.**
2. **Hata kutusu viewport dışında kalıyor** — İlk testte `jvTop: -357` (rAF yokken). Gerçek frame'de `scrollIntoView({behavior:'smooth', block:'nearest'})` çalışıyor; kutu `top:126`'da, viewport içinde, focus alıyor, `focusOutline: rgb(213,163,92) solid 2px`. **ELENDİ.**
3. **`startBtn` üst kenarında tıklama engelleniyor** — `elementFromPoint(r.y+1)` `DIV.actions` döndürdü ama bu `startBtn`'in **kendi padding alanı** (`btnPaddingTop: 13px`); `r.y+1`, `r.y+3`, `r.y+6`'da `BUTTON.btn btn-primary` çıkıyor. `actions` flex container tıklamayı düğmeye iletiyor. **ELENDİ.**
4. **Gizli paneller tab sırasında** — `display:none` panellerdeki 415 focusable `getClientRects()=0`; Chromium bunları tab sırasından otomatik çıkarıyor (`visibleFocusableInside: 0`). **ELENDİ (güvenli).**
5. **`clearFile` tıklanamaz** — Bir ölçümde viewport dışındaydı (panel scroll edilmemişti, `top: -770`); görünür konumda `button.contains(hit)` ile tıklanabilir. **ELENDİ.**
6. **Otomatik scroll kullanıcıyı zorluyor** — `isNearBottom` mantığı doğru: kullanıcı yukarıdayken yeni log scroll'u zorlamıyor (`scrollForced: false`, `scrollBefore: 0 → scrollAfter: 0`). **ELENDİ (güvenli).**
7. **Input caret dinamik güncellemede kayboluyor** — `addSegment`, `logLine`, `setProgress` ayrı ayrı test edildi; hiçbiri focus'u çalmıyor (`afterSeg/afterLog/afterProg: focused: true, activeId: "clipStart"`). Bir önceki "focusLost" sonucu test betiğinin kendi `renderFinalPreview` çağrısından kaynaklanıyordu. **ELENDİ (caret korunuyor).**

### Doğrulanamayanlar (ortam kısıtı)

- **Gerçek browser zoom (font/rendering):** CDP `Emulation.setDeviceMetricsOverride` yalnızca viewport'u değiştiriyor; gerçek zoom'un font ölçekleme etkisini test edemedim. Layout breakpoint'leri viewport ile doğrulandı.
- **Gerçek ekran okuyucu:** ARIA öznitelikleri incelendi; sesli duyuru doğrulanmadı.
- **Gerçek Tab sırası (CDP `Input.dispatchKeyEvent`):** Sentetik `keydown` tarayıcının sekme navigasyonunu tetiklemez. Focusable envanteri DOM'dan çıkarıldı (122 öğe, mantıksal sıra, `tabindex>0` yok) ama **gerçek Tab tuşuyla baştan sona dolaşım** bu oturumda tamamlanmadı.
- **Windows DPI ölçeklemesi:** DPR 1.5 gözlendi; farklı DPI'da test edilmedi.

---

## 7. Yirmi görev — kaynak, test ve sonuç tablosu

| # | Görev | Kaynak | Test | Sonuç |
|---|---|---|---|---|
| 1 | Uçtan uca görevler | renderer.js handler'ları | Gerçek Chromium | ✅ Haritalandı (Bölüm 3) |
| 2 | Pencere sınırları | main.js:9096 (minWidth 940, minHeight 680) | Viewport 940×680 | ✅ Min boyutta startBtn/dropZone erişilebilir; progress dışarıda (B-01) |
| 3 | Breakpoint sınırları | styles.css @media 980/860/560/520 | 944/787/590 viewport | ✅ Tek sütun ≤980 doğrulandı; B-01/B-03 |
| 4 | İçerik taşması | fileName/filePath CSS | Uzun Türkçe ad (ĞÜŞİÖÇ) | ✅ Ellipsis çalışıyor; `title` eksik (küçük) |
| 5 | Hit-testing | elementFromPoint | startBtn/cancelBtn/clearFile/dropZone | ✅ Tıklanabilir (iç SPAN'a da çalışır) |
| 6 | İç içe kaydırma | panel/preview/log overflow | scroll ölçümü | ✅ Alanlar ayrı; body scroll 944'te çalışıyor (body.scrollTop) |
| 7 | Sticky/fixed kapatma | `.actions` sticky z-index 3 | getBoundingClientRect | ✅ İçerik kapatma yok (tek sticky: actions, top:474) |
| 8 | Zoom | viewport simülasyonu | 944/787/590 | ⚠️ Layout test edildi; gerçek zoom edilemedi |
| 9 | Görünürlük vs erişilebilirlik | display:none paneller | getClientRects | ✅ Güvenli (Chromium çıkarıyor, 415 focusable → 0 visible) |
| 10 | Gerçek Tab sırası | focusable envanter | DOM analizi | ⚠️ Envanter çıkarıldı (122 öğe); gerçek Tab tamamlanmadı |
| 11 | İşlem sonrası focus | modal/kuyruk silme | Gerçek Chromium | ⚠️ Modal ✅; kuyruk silme ❌ (B-02) |
| 12 | Modal/açılır | openManagedModal (renderer.js:773-847) | Gerçek frame | ✅ Focus/Escape/restore doğru; arka plan inert; backdrop tıklamayı engelliyor |
| 13 | Disabled/busy | startBtn handler | Gerçek Chromium | ⚠️ Ayarlar disabled değil (B-06) |
| 14 | Dinamik DOM + etkileşim | addSegment/logLine/setProgress | Gerçek Chromium | ✅ Caret/seçim korunuyor (3 ayrı test) |
| 15 | Otomatik scroll | isNearBottom | Gerçek Chromium | ✅ Zorlama yok (scrollForced: false) |
| 16 | Erişilebilir adlar | ARIA öznitelikleri | DOM | ⚠️ Segment contenteditable eksik (B-04); progressbar parent'ta role=progressbar + aria-valuenow güncelleniyor |
| 17 | Hata/progress duyuruları | role=alert, aria-live | DOM | ✅ jobValidation bağlı (aria-invalid + aria-describedby); preview role=log + aria-live=polite — yoğun segment patlamasında aşırı duyuru riski (not) |
| 18 | Renk/focus/kontrast | computed style | getComputedStyle | ✅ Focus outline 2px amber; kontrast ölçüldü (aşağıda) |
| 19 | Büyük içerik gecikmesi | addSegment | Kademeli ölçüm | ❌ O(n²) — 500'de 10.6sn (B-05) |
| 20 | Birleşik koşullar | 6 senaryo | Gerçek Chromium | ✅ Çalıştırıldı (B-01/B-02 teyit) |

**Kontrast ölçümleri (computed style, Görev 18):**
```
startBtn:    color rgb(27,22,15)   on bg rgb(213,163,92)  — koyu metin/amber zemin, yüksek kontrast
statusPill:  color rgb(213,163,92) on bg rgba(213,163,92,0.11) — amber/şeffaf amber, orta kontrast (11px küçük metin)
logLine:     color rgb(154,200,173) on bg rgba(0,0,0,0) — yeşilimsi/koyu zemin (11px)
body:        color rgb(237,241,243) on bg rgb(10,12,15) — açık/koyu, yüksek kontrast
focus:       outline rgb(213,163,92) solid 2px (jobValidation'da ölçüldü)
```
Durum yalnızca renkle aktarılmıyor: `statusPill` metin içeriyor ("Hazır"/"Çalışıyor"/"Hata"), `jobValidation` metin + aria-invalid kullanıyor. **Not:** `statusPill` 11px küçük metin + şeffaf amber zemin — kontrast sınırda olabilir; dekoratif tercih olarak raporlanıyor, işlevsel bug değil.

---

## 8. Mevcut testlerin kaçırdığı etkileşimler

- **Gerçek Chromium'da viewport-içi görünürlük:** `renderer-state-a11y-responsive.test.js` `effectiveViewport` modelini test ediyor ama gerçek `getBoundingClientRect` ile ilerleme göstergelerinin viewport'ta kalıp kalmadığını ölçmüyor → **B-01, B-03 kaçtı.**
- **Focus yönetimi (kuyruk silme):** `queue-lifecycle.test.js` state'i test ediyor; `document.activeElement`'i test eden yok → **B-02 kaçtı.**
- **Performans (segment insert):** Hiçbir test `addSegment`'in 500 segmentteki maliyetini ölçmüyor → **B-05 kaçtı.**
- **contenteditable a11y:** A11y testleri bu alanı kapsamıyor → **B-04 kaçtı.**
- **Busy-state disabled:** İş sürerken kontrollerin durumunu test eden yok → **B-06 kaçtı.**
- **Genel:** Testler jsdom-benzeri mock DOM kullanıyor; **gerçek Chromium hit-test, scroll, frame, compositor** davranışını doğrulayamıyorlar. Bu turda kullanılan CDP harness'ı (Electron + remote-debugging + Overlay compositor canlı tutma) bu boşluğu dolduruyor.

---

## 9. Öncelikli uygulama planı (yalnızca rapor — hiçbir düzeltme uygulanmadı)

### P1 — B-01: Tek-sütunda iş geri bildirimi görünür alana taşınmalı
- **Kök neden:** `@media (max-width: 980px)` `.app-main`'i tek sütuna çeviriyor ama sağ paneli (ilerleme + önizleme + log) sol panelin 1939px altına yerleştiriyor; kullanıcıya scroll ipucu yok.
- **En küçük çözüm:** Tek sütunda ilerleme bloğunu (`.card-flex`'in ilerleme kısmı veya `statusPill`+`progressFill`+`progressText`) sol panelin **üstüne** (yapışkan/sticky bir özet çubuğu olarak) taşı; veya `.app-main` içinde sağ paneli `order: -1` ile öne al. Alternatif: tek sütunda `statusPill`'i header'a sabitle.
- **Dosyalar:** `src/renderer/styles.css` (media query), muhtemelen `index.html` (ilerleme bloğu konumu) — **yalnızca CSS ile çözülebilir** (grid `order` veya sticky).
- **Korunması gereken:** İki sütunlu görünüm (>980px) aynen kalmalı; `panel-left`/`panel-right` scroll davranışı.
- **Responsive/klavye etkisi:** İlerleme her zaman görünür → klavye kullanıcısı Tab ile ulaşmasa bile durumu görür.
- **Regresyon senaryoları:** 980px sınırının hemen altı/üstü; 940×680 min boyut; %125/%150 zoom.
- **Kabul kriterleri:** 944×822 ve 940×680'de `progressText`, `progressFill`, `statusPill` `getBoundingClientRect().top < innerHeight` olmalı (iş başladığında, scroll=0'da).
- **Öncelik/sıra:** 1 (P1).
- **Uyumluluk riski:** Düşük (yalnızca tek-sütun media query'si). **Geri alma:** media query'deki `order`/sticky kuralını kaldır.

### P2 — B-03: Tek-sütunda `.preview` yüksekliğini sınırla
- **Kök neden:** `.preview { flex: 1; min-height: 0 }` + tek sütunda `max-height` yok → 4025px.
- **En küçük çözüm:** `@media (max-width: 980px) { .preview { max-height: 40vh; } }` (veya `min(40vh, 480px)`).
- **Dosyalar:** `src/renderer/styles.css` (tek satır media query).
- **Korunması gereken:** İki sütunda `flex: 1` davranışı; `overflow-y: auto`.
- **Kabul kriterleri:** 944×822'de 100 segment ile `.preview.offsetHeight ≤ 0.4 * innerHeight`; `.log` top < ~1500px.
- **Öncelik/sıra:** 2 (P2).
- **Uyumluluk riski:** Çok düşük. **Geri alma:** kuralı kaldır.

### P2 — B-02: Kuyruk silme sonrası focus yönetimi
- **Kök neden:** `renderQueue` tam yeniden kurulum; silinen düğmenin focus'u BODY'ye düşüyor.
- **En küçük çözüm:** `removeFromQueue`'da silmeden önce silinen öğenin index'ini kaydet; `renderQueue` sonrası aynı index'teki (veya bir önceki) öğenin sil düğmesine, yoksa `startQueueBtn`'e focus taşı. Alternatif: `renderQueue`'yu focus'u koruyacak şekilde değiştir (daha büyük iş).
- **Dosyalar:** `src/renderer/renderer.js` (`removeFromQueue`, `renderQueue`).
- **Korunması gereken:** `renderQueue`'nun persist + listener bağlama davranışı.
- **Kabul kriterleri:** Klavyeyle silme sonrası `document.activeElement` BODY değil; mantıklı bir kuyruk kontrolü.
- **Öncelik/sıra:** 3 (P2).
- **Uyumluluk riski:** Düşük. **Geri alma:** focus taşıma satırını kaldır.

### P2 — B-04: Segment contenteditable'a erişilebilir ad/rol/tabindex
- **Kök neden:** `createSegmentEl`'de `contenteditable="true"` tek başına; `aria-label`, `role`, `tabindex` yok.
- **En küçük çözüm:** `<span class="segment-text" contenteditable="true" role="textbox" aria-multiline="false" tabindex="0" aria-label="Segment {idx+1} metni — düzenlemek için girin">`.
- **Dosyalar:** `src/renderer/renderer.js` (`createSegmentEl`).
- **Korunması gereken:** Mevcut blur/Enter commit davranışı (`commitSegmentEdit`).
- **Kabul kriterleri:** Segment metni Tab ile odaklanabilir; erişilebilirlik ağacında adı ve rolü doğru.
- **Öncelik/sıra:** 4 (P2).
- **Uyumluluk riski:** Çok düşük. **Geri alma:** öznitelikleri kaldır.

### P2 — B-05: `addSegment` O(n²) maliyetini azalt
- **Kök neden (yüksek olasılıklı):** Her eklemede `clearPreviewActiveSegment`'in preview genelinde querySelector'ı + `isNearBottom`/`scrollTop` layout ölçümü (layout thrashing).
- **En küçük çözüm:** Aktif segment referansını bir değişkende tut (querySelector yerine); scroll ölçümünü `requestAnimationFrame`'e veya batch'e taşı; segmentleri `DocumentFragment` ile toplu ekle (mümkünse).
- **Dosyalar:** `src/renderer/renderer.js` (`addSegment`, `clearPreviewActiveSegment`).
- **Korunması gereken:** `PREVIEW_DOM_CAP`, otomatik scroll, `previewActive` işaretleme.
- **Kabul kriterleri:** 500 segment insert < ~3sn (lineer ölçek); 100 segment < ~600ms.
- **Öncelik/sıra:** 5 (P2).
- **Uyumluluk riski:** Orta (scroll/active davranışı). **Geri alma:** tek fonksiyon; revert.
- **Not:** Önce profil (CDP `Profiler` veya `console.time` ile `clearPreviewActiveSegment` vs `appendChild` ayrımı) — kök nedeni doğrulamadan büyük refactor yapma.

### P3 — B-06: İş sürerken ayar kontrollerine görsel geri bildirim
- **Kök neden:** Opts dondurma doğru ama kullanıcıya bildirilmiyor.
- **En küçük çözüm:** İş başladığında ayar paneline küçük bir bilgi notu ("Ayarlar bu iş için donduruldu — değişiklikler sonraki işe uygulanır") veya kontrolleri `aria-describedby` ile bu nota bağla. Disabled **yapma** (kullanıcı sonraki iş için hazırlamak isteyebilir).
- **Dosyalar:** `src/renderer/renderer.js` (start handler), `index.html` (not), `styles.css`.
- **Kabul kriterleri:** İş sürerken not görünür; iş bitince kaybolur.
- **Öncelik/sıra:** 6 (P3).
- **Uyumluluk riski:** Çok düşük. **Geri alma:** notu kaldır.

### Ek (küçük) — `fileName`'e `title` attribute
- Kırpılan dosya adının tamamı tooltip'te görünsün (kuyruk öğesinde var, ana gösterimde yok). Tek satır: `setInputFile`'da `$('fileName').title = name`.

---

## 10. Son bütünlük doğrulaması

```
Başlangıç git status --short:  ?? (10 untracked girdi — denetim öncesi/paralel raporlar + scratch/)
Son      git status --short:  ?? (11 untracked girdi — BROWSER-KOMBINASYON-DENETIM-20260911-2341.md oturum sırasında belirdi, bana ait değil)
git diff --check:  temiz (exit 0) — başlangıç = son
git diff --stat:   boş  (exit 0) — tracked dosyalarda sıfır değişiklik
Kaynak hash'leri:  7 dosya başlangıç = son (SHA256 birebir aynı, Bölüm 2 tablosu)
```

**Açık doğrulama:** Bu denetim **hiçbir kaynak, test, ayar veya tracked dosyayı değiştirmedi.** Tüm doğrulama betikleri `%TEMP%\whisper-audit\` altında, fixture'lar sentetik, userData `%TEMP%\whisper-audit-ud`'de idi ve denetim sonunda silindi. Electron süreci kapatıldı (kalan: 0). Oturum sırasında beliren `BROWSER-KOMBINASYON-DENETIM-20260911-2341.md` ve diğer untracked dosyalar **bana ait değildir** (paralel çalışma); hiçbirine dokunulmadı, silinmedi, sahiplenilmedi.

**Çalıştırılamayan / kanıtlanamayan:** Gerçek browser zoom (font etkisi), gerçek ekran okuyucu, gerçek Tab baştan-sona dolaşımı, farklı Windows DPI — bunlar "test edildi" sayılmadı; ilgili bulgular yalnızca doğrulanan katmanlara dayanıyor.

---

**Kapanış:** Arayüzün temel etkileşim katmanı (modal focus, hit-test, caret korunumu, otomatik scroll, gizli panel tab davranışı) gerçek Chromium'da **sağlam** çıktı — ilk "bozuk" görünen sonuçların çoğu gizli pencerede compositor'un durmasından kaynaklanan test artefaktıydı. Kalan gerçek engeller **dar/tek-sütun görünümde iş geri bildiriminin viewport dışında kalması (B-01)** ve onu izleyen **focus yönetimi (B-02), preview yüksekliği (B-03), a11y (B-04) ve performans (B-05)** bulguları. Hiçbir düzeltme uygulanmamıştır; plan yalnızca rapordur.


> GÜNCEL DOĞRULAMA NOTU 2026-09-12: B-05 yeniden doğrulandı ve toplu Range.deleteContents budaması ile düzeltildi; tests/renderer-log-trim.test.js geçti. B-01/B-02/B-03/B-04 düzeltmeleri güncel renderer/CSS içinde mevcut. B-06 ayarların iş sırasında görsel kilitlenmesi hâlâ açık tasarım maddesidir; düzeltilmiş sayılmamıştır.

## GÜNCEL BULGU DURUMU — 2026-09-12

### Bulgu yanıt tablosu

| ID | Durum | Ayrıntılı düzeltme |
|---|---|---|
| B-01 | DÜZELTİLDİ | Tek sütunda durum/iş geri bildirimi görünür sıraya alındı. |
| B-02 | DÜZELTİLDİ | Kuyruk silme sonrası odak uygun kalan kontrole aktarılıyor. |
| B-03 | DÜZELTİLDİ | Preview/log dar görünümde viewport'a göre sınırlandı. |
| B-04 | DÜZELTİLDİ | Segment contenteditable öğeleri role/tabindex/aria-label taşıyor. |
| B-05 | DÜZELTİLDİ | Segmentler 16 ms batch + `DocumentFragment` ile ekleniyor; cap/scroll batch başına çalışıyor. Bu madde log budamasıyla karıştırılmadı. |
| B-06 | DÜZELTİLDİ | İş/kuyruk sürerken tüm kalıcı ayar kontrolleri, dosya/klasör seçimi ve drop-zone disabled/aria kilidi alıyor. |
| Ek | DÜZELTİLDİ | Dosya adı tooltip'i ve dar panel odak/responsive davranışı korundu. |

### Ayrıntılı doğrulama dökümü

Denetim regresyonu 41/41, player 142/142, tam `npm test` çıkış 0. Gerçek DPI smoke'u hâlâ manual; kaynak/testle ölçülen altı bulgunun tümü kapalı. Tam çapraz döküm: `AUDIT-KAPANIS-MATRISI-2026-09-12.md`.
