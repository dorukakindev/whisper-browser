# BROWSER_BUG_REPORT_212 — PDF çeviri uçtan-uca E2E (plan maddesi 9)

**Tarih:** 2026-09-29 · **Dal:** `fix/r260-pdf-translate` · **Tür:** test kapsamı (ürün bug'ı yok)

## Kapsam

20 maddelik planın 9. maddesi: PDF okuyucu çeviri hattının gerçek Electron süreçlerinde uçtan-uca doğrulanması. Daha önce bu hat yalnızca birim testlerle parça parça sınanmıştı; bu smoke ilk kez tam döngüyü tek senaryoda kilitler.

## Doğrulanan zincir (hiçbir halkası mock değil)

1. `openPdfReader()` → `dialog.showOpenDialog` stub'ı fixture'a yönlendirilir (seçici yolu = otomatik dosya-erişim grant'i).
2. `pdf:open` → `pdfFileAccess` grant → `inspectPdfDocument` → `player.pdfReader` oluşur (pdfHash alınır).
3. `extractPdfReaderPage(1..2)` → gerçek pdf.js (`vendor/pdf.min.mjs`, pdfjs-dist 6.3.289) metin bloklarını çıkarır.
4. `translateVisiblePdfPages(true)` → `pdf:translatePages` IPC → `translatePdfPage` → `BrowserTranslationScheduler` → gerçek HTTP isteği.
5. Sağlayıcı: aynı süreçte `http.createServer` ile OpenAI-uyumlu stub (ephemeral port; dış ağ bağımlılığı yok — CI güvenli).
6. Ayarlar: `WHISPER_RESOURCE_SOAK_USER_DATA` altında `settings.json` tohumlanır (`translate.endpointPreset=custom`, `customBaseUrl=http://127.0.0.1:<port>`).
7. Beklentiler: her iki sayfanın blokları `status:'translated'` + `tr~ ` öneki; `pdf-translations/*.json` durum dosyası yazılmış; `pdf:export` (`showSaveDialog` stub'lı) çıktısında çeviri metni; `render-process-gone` = 0.

## Bulgular

**Ürün bug'ı yok.** Zincir uçtan uca sağlam: 2 sayfa → 2 blok → 2 istek → durum dosyası → dışa aktarım.

**Harness bulguları (test yazılırken):**
- Tek-parça cue protokolü `{metin, onceki, sonraki}` düz-metin yanıt bekler; `sentence_groups` zarfı yalnız `pieces>1` gruplu isteklerde kullanılır. İlk stub sürümü yanlış şemayla cevap veriyordu (ürün değil, test hatası).
- `pdf:export` `dialog.showSaveDialog` çağırır — headless koşuda stub gerektirir (yoksa IPC sonsuza dek bekler).

## Test

- `xvfb-run -a npx electron tests/electron-pdf-translate.smoke.js --disable-gpu` → **PASS** (2 sayfa, 2 blok, 2 istek)
- `node --check tests/electron-pdf-translate.smoke.js` → temiz
- `tests/run-electron-smokes.js --all` glob'u `electron-*.smoke.js` desenini otomatik keşfeder — CI ubuntu+windows matrisinde koşar.

## Windows etkisi

Smoke platform-bağımsız; CI windows-latest'da koşar. `dialog.showSaveDialog` stub'ı gerçek Windows dosya seçici davranışını test etmez (kapsam dışı — mevcut export yolu zaten elle doğrulanmış durumda).

## Doğrulanmayan sınırlar

- Gerçek LLM sağlayıcısı (stub, OpenAI şemasına sadık).
- pdf.js'in karmaşık belgelerdeki (taranmış/etiketsiz/şifreli) çıkarımı kapsam dışı.
