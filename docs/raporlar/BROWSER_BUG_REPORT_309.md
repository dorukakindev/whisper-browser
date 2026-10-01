# R410 — UI yüzeyi derin okuma: index.html + styles.css + browser-chrome.css

**Tarih:** 2026-10-01 · **Dal:** devin/1790853910-r410-ui-surface · **Kod commit:** ffaefd0

## Kapsam

Derin-okuma kampanyasının son büyük okunmamış yüzeyi: arayüzün kendi işaretleme/stil katmanı.

- `src/renderer/index.html` — 3459 satır (tamamı)
- `src/renderer/styles.css` — ~7.0k satır (mekanik envanter + hedefli okuma)
- `src/renderer/browser-chrome.css` — ~1.4k satır (aynı yöntem)

## Yöntem

1. **Mekanik denetim (temiz):**
   - 1145 `id`, 0 yinelenen; `aria-labelledby` / `aria-controls` / `for` hedeflerinin tamamı çözümleniyor.
   - JS tarafından başvurulan 917 id'nin tamamı HTML'de mevcut; hiçbir src/tools/tests dosyasında üretilmeyen id yok.
   - 40 `<script src>` dosyasının tamamı diskte mevcut (vendor ve `../` göreli yollar dahil).
   - Sıfır inline handler (`on*="`), sıfır `javascript:`/`data:` URI, sıfır harici `src`/`href` — tek dış bağlantı iki `target="_blank"` hf.co linki.
   - CSP başlığı katı (`script-src 'self'`, `object-src 'none'`, `connect-src` whitelist).
   - `data-ui-untranslated` sözleşmesi korunuyor (kullanıcı verisi sözlük dışı).

2. **Ölü-CSS envanteri:** styles.css + browser-chrome.css'teki 1089 sınıf seçici, HTML `class` öznitelikleri + JS tarafından üretilen tüm sınıf dizgileri (şablon interpolasyonları `prefix-${...}` dahil) ile çaprazlanarak tarandı.

## Bulgu ve düzeltmeler

### 1) Ölü CSS seçici sınıfı (düzeltildi — commit ffaefd0)

Üretilmeyen 18 seçici (~55 satır ölü ağırlık) silindi:

- `.cue-row` ailesi (10 kural): eski cue-liste tasarımının kalıntısı; mevcut satır yapısı `.cue-card*` / `.segment`.
- `.ai-msg-time`, `.ai-context-evidence`, `.history-empty`, `.pdf-source-text`, `.research-card-links`, `.side-tab-title`, `.tool-glyph`, `.tool-spacer` (2 kural), `.view-modes-label` (kendi kuralı + `.player-eyebrow` ile ortak seçici), `.player-task-center-list` (ortak seçicinin ölü yarısı — `#playerTaskCenterList` korundu), `.back-to-active` (2 kural — öğe artık `#backToActive` id + `tool-button-ghost` sınıfı taşıyor).
- browser-chrome.css: `.browser-empty-rule`, `.browser-signal-title` (`.browser-signal` canlı, `-title` varyantı hiç üretilmiyor), `.browser-tab-pin` (2 kural + ortak seçici; özellik bilinçli kaldırılmış — `tests/browser-reading-design.test.js` pin düğmesinin işaretlemeye dönmediğini kilitler).

**Bilinçli bırakılan:** `.tool-row-quiet` ailesi — DOM'da hiç üretilmiyor ama `tests/player-ui.test.js:1158,1208` bu kuralların varlığını sözleşme olarak kilitliyor. Silmek test kırmadan mümkün değil; raporlanıp bırakıldı (pin-korumalı mezar taşı).

### 2) `rel="noopener noreferrer"` (düzeltildi)

Diarization ipucundaki iki `target="_blank"` hf.co bağlantısına eklendi. `mainWindow.webContents.setWindowOpenHandler` zaten tüm window-open isteklerini `openExternalByPolicy`'ye yönlendirdiği için gerçek opener sızıntısı yoktu — sıfır-maliyetli savunma derinliği.

### 3) Ratchet iyileştirmesi

Ölü kural silimi sabit-renk sayısını 436→433 düşürdü; `css-hardcoded-color-baseline.txt` güncellendi (ratchet aşağı tek yönlü).

## Doğrulama

- `player-ui.test.js` 153/153, `browser-reading-design.test.js`, `css-hardcoded-colors.test.js` 433/433, `report64-contrast`, `report65/67/70`, `youtube-tv-mode`, `browser-ui-regressions-r3`, `active-jobs-center`, `browser-settings-tab`, `touch-hdpi`, `player-chrome-css`, `browser-toolbar-clickability`, `player-dual-subtitle-layout`, `renderer-state-a11y-responsive`, `deep-analysis-regressions`, `audit-2026-09-22-browser-translate`, `browser-report117/123-regressions` — tümü geçti.
- Temizlik sonrası yeniden tarama: 1089 sınıf içinde kalan tek referanssız seçici `tool-row-quiet` (pinli).

## Windows doğrulanmayan

- Yok — CSS seçici silimi ve `rel` eki platformdan bağımsız; görsel fark üretmez (kurallar hiçbir öğeye uygulanmıyordu).

## Kalan borç

- `.tool-row-quiet` mezar taşı: `player-ui.test.js`'teki pin-assert'ler ya kasıtlı sözleşme olarak anlamlı kılınmalı ya da test+CSS birlikte temizlenmeli (kullanıcı kararı).
