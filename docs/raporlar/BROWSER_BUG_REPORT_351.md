# BROWSER_BUG_REPORT_351 — Kuyruk-50 madde 39: manga görüntü dönüşümü geometrisi

Tarih: 2026-10-01 · Kapsam: `src/browser-manga.js` enjekte kaplama hattı, `src/renderer/browser-video-analysis.js` kırpma yolu, `backend/browser_media_tools.py` + `backend/browser_video_analysis.py` piksel kesimi.

## Denetim bulguları

### B-351-01 (düzeltildi): bölge % konumu element kutusuna göreydi — object-fit letterbox'ta sistematik kayma

Kaplama `target.getBoundingClientRect()` (element kutusu) üzerine kuruluydu ve bölgeler normalize 0-1000 koordinatları doğrudan `%` olarak uygulanıyordu. Bu yalnız `object-fit: fill` + dönüşümsüz durumda doğrudur.

- `object-fit: contain`: içerik element içinde letterbox'lı — bölgeler sabit bir eksen kaymasıyla yanlış yere düşerdi (ör. 400×300 kutuda 400×150 görselde %25'lik üst banda kayma).
- `object-fit: cover`: içerik taşar — bölgeler kırpılmış alanlara göre hizalanır, görünür bantla uyuşmaz.
- `object-fit: none/scale-down` ve `object-position` ≠ center: benzer kayma.

**Düzeltme:** `mangaImageContentRect` (yeni `src/manga-geometry.js`) element içi gerçek içerik kutusunu hesaplar; bölge kesri artık `(contentOffset + normalized × contentSize) / elementSize` formülüyle eşlenir. Taşan kesirler kaplamanın `overflow:hidden`'ıyla kırpılır — cover'da görünür bantla birebir örtüşür.

### B-351-02 (düzeltildi): CSS transform (rotate/flip) altında bölgeler yanlış çeyreğe düşerdi

Manga okuyucuları sayfa döndürme/aynalama sunar (`transform: rotate(90deg)`, `scaleX(-1)`). Element rect'i dönüşümü içerir ama `%` eşlemesi eksen permütasyonunu bilmezdi → dosya-uzayı sol-üst çeyreği rot90 altında ekranda sağ-üstte gösterilmeliyken sol-üstte kalırdı; OCR/inceleme önizlemesi dosya-uzayında doğru kalırken ekran gösterimiyle çelişirdi.

**Düzeltme:** `mangaAxisTransform` computed matrix'i sınıflandırır:
- `axes` (kimlik/ölçek/flip/rot90/180/270): `mangaMapAxisPoint` ile eksen eşlenir — bölgeler doğru çeyreğe düşer.
- `arbitrary` (rot45, skew, perspektif, bozuk matrix): axis-aligned kutuya indirgenemez → `frame.supported=false` ile kaplama gizlenir. Bölge tıklanamaz hale gelir → **yanlış bölgenin seçilip OCR/incelemeye gönderilmesi engellenir.**

Her düzen (`state.layout`) kutuları yeniden eşler — sayfanın çalışma zamanında dönüşüm değiştirmesi (okuyucu rotate düğmesi) anında yansır.

### Doğrulanan doğru yollar (kusur yok)

- **Editör önizleme kesimi** (`browser-manga.js` ~870): normalize → `naturalWidth/Height` doğrudan — dosya-uzayı; ekran dönüşümlerinden bağımsız olarak doğru bölgeyi keser.
- **Renk örnekleme** (`decorateMangaRegionColors`): çözülen görüntü üzerinde piksel-uzay — doğru.
- **Video OCR kırpması** (`browser-video-analysis.js` `crop()` + `ocr-range`): kullanıcı yüzde (0-100) girer → kesir → ffmpeg çıkarılmış kare pikselleri. `scale=1280:-2` yeniden ölçekleme en-boy oranını koruduğu için kesir eşlemesi çözünürlükten bağımsız doğrudur; sınır doğrulaması `crop.x+width>1` ile kilitli.
- **Backend piksel kırpma** (`browser_media_tools.py:36-41`, `browser_video_analysis.py:32-38`): piksel koordinat doğrulaması eksiksiz (`x<0||w<1||x+w>img.width` → ValueError). Yanlış-bölge riski koordinat eşleme tarafındaydı (B-351-01/02), kesim tarafında değildi.
- **Zoom/scroll**: `getBoundingClientRect` zaten post-transform viewport koordinatı döndürür; pinch-zoom `visualViewport` olayları + ResizeObserver yeniden düzeni tetikler — mevcuttu, korundu.

### Bilinen sınır (dokümante)

- `image-orientation: none` verilen `<img>`lerde Chromium `naturalWidth`'i EXIF-uyarlı raporlarken piksel düzlemi ham kalabilir — uç durum; gerçekte manga sayfaları bu CSS'i kullanmaz. Gerekirse ileride prob-piksel okumasıyla tespit edilebilir.
- İç-içe (nested) transform zincirlerinde yalnız elementin kendi transformu sınıflandırılır; atalardan gelen rastgele dönüşüm bounding rect'i zaten sarıyor — atalardan axis-dışı transform gelen patolojik sayfalarda bölge konumu hala sınırlı kalabilir (kaplama gizlenmez ama küçük kayma mümkün).

### Bonus — master'da bulunan 2 önceden-varolan kusur

- **`--font-ui` tanımsız token:** `eb4dd60` (madde 37) `.pdf-ocr-note { font-family: var(--font-ui) }` eklemişti; token `:root`'ta hiç tanımlanmamış → `audit-2026-09-22` ratchet'i master'da FAIL. `:root`'a Inter yığını olarak tanımlandı.
- **Electron wvcus pini eskimiş:** `browser-subtitles.test.js:1188` `v43.2.0+wvcus` beklerken package.json `v43.5.0+wvcus` (GHSA yükseltmesi) taşıyor → master'da FAIL. Pin `v43\.\d+\.\d+\+wvcus` ailesine esnetildi — Castlabs/Widevine kilidi korunur, sürüm yükseltmeleri testi düşürmez.

## Test kanıtı

- `tests/manga-geometry.test.js` (yeni): **105 kontrol PASS** — içerik kutusu matrisi (fill/contain/cover/none/scale-down × object-position %/px/anahtar), matrix sınıflandırma (17 vaka), nokta eşleme, bölge kesir matrisi, **8 transform × 4 kutu gidiş-dönüş oracle** (ekran kesri → ters eşleme = özgün normalize kutu), enjekte-script bütünlük ratchet'i.
- `tests/manga-region-layout.test.js`: 10/10 (güncellenen desenler + yeni geometri ratchet'i).
- `tests/manga-layout-state.test.js`: VM sandbox'a `getComputedStyle` stub — geçti.
- `tests/audit-2026-09-22-browser-translate.test.js`: 19/19 (önceden FAIL).
- `tests/browser-subtitles.test.js`: 81/81 (önceden FAIL).
- `browser-manga.test.js` 93, `manga-ocr-hardening` 65, `manga-restore-deadzone` 6, `manga-fetch-deadzone` 6, `browser-manga-lookahead-lifecycle` 10 — tümü PASS.

## Windows etkisi

Enjekte script sayfa içinde çalışır; `getComputedStyle`/`getBoundingClientRect` tüm platformlarda aynı API. `--font-ui` Windows'ta Segoe UI'a düşer (yığın içinde). Windows'a özgü doğrulanamayan: gerçek manga sitesinde rotasyon düğmesiyle canlı UI turu (sayfa bağlı).
