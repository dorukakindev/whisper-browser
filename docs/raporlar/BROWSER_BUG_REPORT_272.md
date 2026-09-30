# R322 — renderer omnibox/palet/klavye + PDF/manga görüntüleyici + oynatıcı çekirdek derin okuma

**Tarih:** 2026-09-30
**Dal:** `devin/1790762656-r322-renderer-audit`
**Kapsam:** R322-a/b/c tek tur: `renderer.js` (28.8k satır) omnibox + komut paleti + klavye zinciri; PDF/manga görüntüleyici yüzeyi; oynatıcı çekirdek (seek/loop/shadowing).

## Sonuç: temiz — 1 bulgu, önceki turlarda zaten kapalı

Bölgelerdeki tüm büyük kusur sınıfları önceki turlarda kapatılmıştı (R230–R237 omnibox/palet, R246+ occlusion, R236/R312 PDF, R278 oynatıcı zamanlama fuzz'ı). Bu turda yeni gerçek bug bulunamadı.

## Doğrulanan temiz alanlar

### R322-a — omnibox/palet/klavye
- **Adres çubuğu sonuçları:** `browserAddressSearchSeq` monotonic sayaç + 130 ms debounce ile bayat-sonuç reddi; Enter sırasında `typedBrowserAddressQuery() === player.browserAddressQuery` tazelik kapısı (130 ms penceresinde eski metnin sonucuna gitme engeli); Home/End = Alt+Home/End, Esc = tam geri alma + `stopImmediatePropagation` zinciri.
- **Satır-içi tamamlama:** yalnız `insertText` ve imleç-sonunda; görünmez/aksan farklı sorguda `prefix` alanı adayın özgün başını kullanır — yanlış karakter sızmaz (R297 unicode katlaması).
- **Komut paleti:** `browserCommandContextMatches` (tabId+generation+mediaId) eşleşmesi şart; bayat bağlamda "yeniden seçilmeli" sinyali. Sonuç satırları `enabled===false` koşulunda Enter'a girmez; workflow kayıt adımı hata kapsamlı (EWORKFLOW_LIMIT dostu mesaj).
- **Klavye zinciri:** `_activeModal` capture dinleyicisi Esc/Tab'ı trap eder ve diğer tuşları keser; `dialog[open]` varken Esc hedefi her yerde diyaloga aitir; PDF okuyucu açıkken oyuncu kısayolları kapanır; tag/modifier/`e.repeat` strobe kapıları sırayla; tarayıcı kısayolları metin-düzenleme tuşlarını eşlemez — Ctrl+W odakta da çalışır (R119/R124/R234 dizisi).
- **⋯ menü arama:** `stopPropagation` çift-işleme fix'i (R234), devre-dışı öğeler eşleşme sayılmaz, MutationObserver ile durum tazeleme, Enter ilk görünür eyklenebilir öğeyi çalıştırır.

### R322-b — PDF/manga görüntüleyici
- `renderPdfReaderPage`: `renderGeneration` + `reader !== player.pdfReader` çift kapısı her await sonrasında; `rendering` seti aynı sayfanın çift işini önler; sıra `insertBefore(after)` ile korunur (50. sayfaya atlamada sıra karışmaz); `intent:'print'` rAF'tan bağımsız (Windows'ta gizli pencerede kilitlenme yoktu).
- `openPdfReader`: eski belge tam serbest (observer.disconnect + renderGeneration++ + loadingTask.destroy + cancelPdfTranslation), içerik boyutu `content-length` + `buffer.byteLength` çift kontrolü, `isEvalSupported:false` + sandbox PDF.js kümeleri.
- Kapanış: `browserWorkspace` geri açılması düzeltilmişti (önceki turda); `root.onscroll=null` + `replaceChildren` + `syncBrowserOcclusion`.

### R322-c — oynatıcı çekirdek (seek/loop/shadowing)
- `applyPlaybackLearningPolicy`: editing/seeking/holdingSpeed/AB-loop kapıları; browser seek 750 ms throttling + `browserLearningRateSequence` bayat-komut kesici; `loop-cue`/`set-rate`/`pause-*` ayrımları ayrı durum taşır.
- `stepCue`/`seekToCue`/`replayCue`: aktif-indeks yoksa en yakın cue'yu hesaplar; `subtitleSourceTime`/`subtitleVideoTime` NaN güvenli (sayısal olmayan → NaN; tarayıcı dönüşüm hatası ham değere düşer).
- `toggleAbLoop`: B>A+0.2 koşulu + marker render'ı; A-B panel tuşu `active` senkronu.

## Yeni regresyon kilidi

`tests/player-time-transform.test.js` (3 senaryo):
- yerel modda `source↔video` çift yönlü dönüşüm (offset±42) tam tersinir,
- NaN/±Infinity/string girdi NaN döner (bölme karışmaz),
- tarayıcı modunda `browserSubtitleSync` delege edilir; sarmalıcı hata atarsa ham değere düşülür (yalnız sayfasız fallback değil, `try/catch` da doğrulanır).

## Windows etkisi

Yok — test kilidi platform bağımsız; denetlenen davranış `start.bat`/`install.bat`ı etkilemez.

## Doğrulanmayan sınırlar

- Klavye zincirinin tam tablosu gerçek Electron'da değil birim-test kesitlerinde doğrulandı (önceki turların Electron smoke'ları yeterli).
- `browserSubtitleSync` karmaşık transform zincirleri (çok noktalı eğri) bu turun dışında.

## Test

- `node --test tests/player-time-transform.test.js` → 3/3 PASS
- `node --test tests/browser-view-visibility.test.js` → 7/7 PASS (önceki dalın kilidiyle birlikte)
