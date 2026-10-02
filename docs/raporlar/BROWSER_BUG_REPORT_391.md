# BROWSER BUG REPORT 391 — Kuyruk-50 batch 8 (maddeler 36–40): PDF/manga kullanım tamamlama

Tarih: 2026-10-02 · Dal: `devin/1790924363-b8-pdfmanga` · Master tabanı: `8fec44f`

Kapsam: PDF kaynak–çeviri çift görünümü + karşılık vurgusu, tablo hücre eşleştirme + belirsiz-sıra işareti, sayfa seçimi akışı (aralık/başarısızlar/çevrilmemişler), manga OCR-kaynak düzeltmesi + tek bölge yeniden çevirisi, kullanıcı düzeltmelerinin yeniden işlemelerde korunması.

## Madde bazlı teslim

### 36 — PDF kaynak–çeviri görünümü + karşılık vurgusu
- **Durum:** Çift görünüm zaten vardı (`.pdf-page-source` canvas + `.pdf-page-translation`); eksik olan, seçili çeviri paragrafının kaynak sayfadaki karşılığının vurgulanmasıydı.
- **Uygulama:** `extractPdfReaderPage`'in blok çıkarımı artık her bloğa `box` (top/bottom/left/right, sayfa pikseli) ekler; koordinat `paragraphFrom` → `preparePdfPageRequests` → `normalizePdfBlock` → durum zincirinden kaybolmadan taşınır. `.pdf-pair` tıklaması/Enter/Space → `focusPdfCounterpart` — çifti `.pdf-pair-focus` yapar, `.pdf-page-source` içinde blok konumunu gösteren `.pdf-source-marker` yerleştirir ve karşılık görünüme kayar (`scrollIntoView`, center). Yeni CSS: `pdf-pair:focus-visible`, `pdf-pair-focus`, `pdf-source-marker`.
- **Kanıt:** `tests/pdf-manga-36-40.test.js` — box passthrough birim testi + marker/odak zinciri kaynak kilitleri.

### 37 — PDF tablo inceleme + kullanıcı düzeltmesi korunması
- **Uygulama:**
  - Belirsiz okuma sırası: `paragraphFrom`, `kind==='table'` blokta satır `column===-1` (ragged bölge, sütun sınırı atanamadı) bulunca `orderAmbiguous: true` üretir; durum ve overlay'de `pdf-pair-ambiguous` + "sıra belirsiz/order uncertain" rozeti.
  - Kullanıcı düzeltmesi: pair'e çift tık → `editPdfBlockPair` → `openAppDialog` (24000 sınırı) → `window.api.editPdfBlock` → yeni `pdf:editBlock` IPC (yetkili gönderici + belge karması doğrulaması + `browserTranslationConfig`) → `applyPdfBlockEdit` → `writePdfTranslationState`. Düzeltilmiş çift `pdf-pair-edited` + "✎ düzeltildi/edited" rozeti, `title` özgün çeviriyi gösterir; boş metin düzeltmeyi kaldırır.
  - Yeniden işlemede korunma: `recordPdfPageTranslation` önceki `userText`/`edited`'i blok `id`'siyle taşır.
- **Kanıt:** birim testler — `orderAmbiguous` passthrough, `userText` birleşimi, `applyPdfBlockEdit` yaz/boşalt/reddet üçlüsü, box koordinat süzgeci.

### 38 — PDF sayfa seçimi akışı
- **Uygulama:** yeni `Sayfa seç` düğmesi → `choosePdfPageScope` diyaloğu (seçenekler: Aralık / Başarısızlar(N) / Çevrilmemiş(N) + serbest aralık metni, `openAppDialog` choices sözleşmesi) → `translateVisiblePdfPages(true, pages)`. `parsePdfPageSelection` (`src/pdf-translate.js`) ve renderer ikizi `parsePdfPageSelectionInput` — `1-4, 8, 12-14` söz dizimi, sınır/hata kapıları, sıralı tekilleştirme. İş başlamadan `pdfReaderSetStatus` kapsam önizlemesi ("Kapsam: N sayfa (...)"); >40 sayfada mevcut `PDF_TRANSLATE_ALL_CONFIRM_PAGES` onayı korunur. Paket başına `reader.lastFailedPages` güncellenir (yok/boş/failed-blok taşıyan sayfalar) → "yalnız başarısızlar" kapsamının gerçek aday kümesi. Açık liste `batchExtract` yolunu kullanır — hiç çizilmemiş sayfa da metin çıkarımından geçer.
- **Hardening:** `explicitPages=[]` artık "tümü" davranışına düşmez — boş liste erken-dönüşle güvenle kapanır (sessiz tüm-kitap çevirisi önlenir).
- **Kanıt:** `parsePdfPageSelection` söz dizimi matrisi + renderer ikizinin vm'de değer-eşitliği parity testi; diyalog/önbellek/sıralama kaynak kilitleri.

### 39 — Manga çeviri inceleme: görsel + OCR + çeviri birlikte, tek bölge yeniden üretimi
- **Durum:** Editör görsel kırpımı + çeviriyi gösteriyordu; OCR kaynağı salt-okunurdu ve yeniden üretim yolu bölgeyi yeniden OCR+çeviriden geçiriyordu.
- **Uygulama:** `openEditor`'de kaynak artık düzenlenebilir `textarea` (4000 sınırı); kirli-kapama kapısı kaynak farkını da sayar. Yeni "Kaynaktan yeniden çevir" düğmesi → `manga-retranslate` trusted-bridge mesajı → `retranslateMangaRegionFromSource` (köprü token + sayfa/index doğrulaması) → `requestBrowserSentenceTranslation(correctedSource)` metin yolu — **yeniden OCR yok** → bölge, `browserMangaCache`, overlay yerinde güncellenir; düzeltilmiş kaynak→çeviri çifti `learnTerminology` ile site terminolojisine öğrenilir (`persistMangaSiteTerminology`).
- **Kanıt:** kaynak-slice kilitleri — textarea, köprü rotası, metin-yolu çağrısı, önbellek yazımı, terminoloji öğrenmesi.

### 40 — Manga kullanıcı düzeltmeleri bölüm boyunca korunur
- **Uygulama:** `sourceEdited`/`edited` bayrakları uçtan uca taşınır — `group.dataset` → `emitEdit` payload'u → `applyMangaEditFromPage` (kaynak farklıysa `sourceEdited=true` yazar) → `page.regions` → `normalizeMangaRegions` passthrough → `browserMangaCache` → `mangaRegionsStateScript` satırları → `retrySelectedMangaRegion` `merged` birleşimi.
- **Retry davranışı:** overlay satırları artık OCR/indirme **öncesinde** okunur; seçili bölge `sourceEdited` ise görüntü indirme + `requestMangaTranslation` tamamen atlanır ve yalnız metin-yolu çeviri koşar (madde 39'un "yalnız ilgili sonuç" kuralı). Diğer bölgelerdeki kullanıcı kaynak/bayrakları `merged`'de korunur — sessiz ezilme yok.
- **Kanıt:** `normalizeMangaRegions`/`mangaRegionsStateScript`/`applyMangaEditFromPage`/`merged`/`sourceEdited`-dalı kaynak kilitleri.

## Testler

- `tests/pdf-manga-36-40.test.js` — **18/18 PASS** (5 birim davranış + 13 kaynak/sözleşme kilidi).
- `node --check`: `main.js`, `pdf-translate.js`, `browser-manga.js`, `preload.js`, `renderer-helpers.js`, `renderer.js` — temiz.
- Yakın süitler: `pdf-translate`, `pdf-translate-depth`, `pdf-partial-retry`, `pdf-reading-order`, `pdf-state-deadzone`, `pdf-job-scheduler` (imza genişlemesi regex güncellendi — 10/10), `pdf-ocr-capability`, `pdf-file-access`, `browser-manga` (105), `manga-*` (6 dosya), `ipc-parity`, `preload-sandbox`, `preload-usage-ratchet`, `ui-locale-dynamic` — hepsi yeşil.

## Değişen dosyalar

`src/pdf-translate.js` (orderAmbiguous, box, userText/edited, applyPdfBlockEdit, parsePdfPageSelection, kayıt birleşimi) · `src/main.js` (pdf:editBlock IPC, retranslateMangaRegionFromSource, manga-retranslate rotası, merged koruması, metin-yolu retry) · `src/preload.js` (editPdfBlock) · `src/renderer/renderer-helpers.js` (box çıkarımı, focusPdfCounterpart, editPdfBlockPair, parsePdfPageSelectionInput, pdfFailedPages/pdfUntranslatedPages, choosePdfPageScope, render işaretleri) · `src/renderer/renderer.js` (explicitPages sözleşmesi, batchExtract, lastFailedPages, Sayfa seç handler'ı) · `src/renderer/index.html` (pdfTranslateScope) · `src/renderer/styles.css` (marker/focus/ambiguous/edited) · `src/renderer/ui-locale.js` ('Sayfa seç' EN) · `src/browser-manga.js` (bayrak passthrough, emitEdit payload, stateScript satırları, editör kaynak textarea + retranslate düğmesi, dataset bayrakları) · `tests/pdf-manga-36-40.test.js` (yeni) · `tests/pdf-job-scheduler.test.js` (imza regex).

## Windows etkisi / doğrulanmayan sınırlar

- Tüm değişiklikler DOM/IPC düzeyinde — Windows'a özgü yol, GPU, paket davranışı etkilenmez. Gerçek Windows'ta denenmedi (Linux Electron koşusu); manga retranslate'in canlı sağlayıcı ucundan dönen çeviri kalitesi sağlayıcıya bağlı.
- Overlay `manga-retranslate` mesajı sayfa betiğinden gelir; köprü token doğrulaması aynen korunur.
