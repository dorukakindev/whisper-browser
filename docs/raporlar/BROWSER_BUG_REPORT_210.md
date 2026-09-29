# BROWSER_BUG_REPORT_210 — browserSplit state-machine fuzz (R258)

**Tarih:** 2026-09-29 · **Dal:** `fix/r258-split-fuzz` · **Kapsam:** plan maddesi 7 — `browserSplit` durum makinesine tohumlu rastgele operasyon bombardımanı

## Senaryo

`tests/electron-browser-split-fuzz.smoke.js`: self-app kalıbı (izole `WHISPER_RESOURCE_SOAK_USER_DATA` profili), tarayıcı yüzeyinde **240 rastgele operasyon** (tohumlu LCG — `SPLIT_FUZZ_SEED`/`SPLIT_FUZZ_OPS` ile tekrarlanabilir):

`create` ×2, `close`, `activate` ×2, `pin/unpin`, `reorder`, `splitOn` ×2 (aralık dışı ratio değerleriyle: 0/10/120/500), `splitOff`, `ratio` (ikincil varken; 0/24.9/75.1/100/400), `reopenClosedBrowserTab`.

Her operasyondan sonra renderer görünümü ile ana süreç oracle'ı (`getBrowserState().split`) yakınsaması beklenir ve 7 invariant doğrulanır:

| # | İnvariant |
|---|---|
| 1 | `split.active` ⇔ `secondaryTabId !== ''` (main) |
| 2 | `secondaryTabId` açık sekmedir ve aktif sekmeden farklı |
| 3 | `ratio ∈ [0.25, 0.75]` (her iki tarafta da clamp) |
| 4 | `player.browserSplit` ≡ `main.split` (active/id/ratio) + `browserActiveTabId` eşit |
| 5 | DOM: sekme öğesi sayısı = `tabs.length`; `is-split-secondary` sayısı = active?1:0 ve doğru id |
| 6 | `browserTabEventGate.contexts` anahtarları ⊆ açık sekme id'leri |
| 7 | `unhandledrejection` = 0, `render-process-gone` = 0 |

## Bulgular

**Ürün bug'ı yok — 240/240 adım tüm invariantlar sağlandı.**

Özellikle doğrulanan kenar yolları:

- `browserSplitSnapshot()` normalize edici: secondary aktif sekmeyle çakışırsa `active:false/''` raporlar (main.js:3918).
- Sekme kapatılınca `browserSplitSecondaryTabId` temizlenir (main.js:13227); renderer'da `syncBrowserTabs` split argümanı yoksa stale secondary'yi sıfırlar (renderer.js:5641).
- `activateBrowserTab` secondary'yi aktifleştirirse yanları takas eder (main.js:13124) — fuzz bunu tekrar tekrar tetikledi, tutarlılık korundu.
- Aralık dışı ratio'lar (0, 500, 400) her iki katmanda da [0.25, 0.75]'e kelepçelendi.
- `reorder`/`pin`/`unload` sırasında split durumu kararlı.

## Harness notları

- `openAppDialog` otomatik-onay stub'ı (R257 bulgusu — headless onay diyaloğu promise'i hiç çözmez).
- `stepTimeout` adım bekçisi (15 sn) + `until` oracle yakınsaması (8 sn) — renderer'ın `browser:tabs` push gecikmesi için.
- Determinizm: `SPLIT_FUZZ_SEED=20260929` default; aynı tohum aynı diziyi üretir → regression tekrarlanabilir.

## Windows etkisi

Ürün kodu değişmedi. Smoke Windows'ta aynen çalışır (süreç-içi API'ler); ~240 op ~1–2 dk.

## Sınırlar

- Ops ağırlıkları eşit dağılımlı; split'a özgü pathological diziler (örn. split açıkken aktif sekmeyi kapatıp reopen) dizide doğal olarak üretildi ama hedefli deterministik senaryo olarak ayrıca kilitlenmedi — DOM invariant'ı bunu dolaylı kapsıyor.
- Görsel split yerleşimi (divider konumu, WebContentsView bounds) doğrulanmadı — `applyBrowserViewsLayout`'un geometrisi piksel-düzeyinde değil state düzeyinde test edildi.

## Koşulan komutlar

```
node --check tests/electron-browser-split-fuzz.smoke.js
SPLIT_FUZZ_SEED=20260929 xvfb-run -a npx electron tests/electron-browser-split-fuzz.smoke.js --disable-gpu
# → PASS: browserSplit state-machine fuzz (240 adım, tohum 20260929)
```
