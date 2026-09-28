# BROWSER BUG REPORT 169 — R189 tam Electron smoke doğrulaması

**Tarih:** 2026-09-28 · **Dal:** `codex/r189-full-smoke-verification-1790600000` · **Kod commit:** `fa8d72c`

## Kapsam

`node tests/run-electron-smokes.js --all` tam seti + set dışı kalan üç `-smoke.js`/`-manual.js` dosyasının tek tek doğrulanması + `backend/transcribe.py` derin denetim devamı.

## Ürün bug'ı (düzeltildi)

- **Çeviri menüsü sağ kenardan taşıyor (1.5x ölçek / dar pencere).** `ui-scale-matrix` smoke'u 760×700@1.5 düzeninde `.browser-menu-popover`'ın viewport dışına kırpıldığını ölçtü. Kök neden: popover `absolute` konumlandırma ile menü düğmesine yaslanıyor, sağ kenar kelepçesi yoktu. Düzeltme: CSS anchor positioning — `.browser-translate-menu { anchor-name: --wb-translate-menu }` + popover `position: fixed; top: calc(anchor(--wb-translate-menu bottom) + 6px); left: anchor(--wb-translate-menu left); position-try-fallbacks: --wb-translate-menu-flip` (`@position-try` ile sağa yaslanma). Electron 43 (Chromium ~142) anchor API'yi destekliyor. Standalone PASS.

## Test altyapısı düzeltmeleri (hepsi doğrulandı)

- **"Promise was collected" CDP flake'i (7 dosya):** `Runtime.evaluate {awaitPromise:true}` döndürülen promise'ı debuggee'de referanssız bırakıyor; ardışık koşularda V8 onu GC ile toplayabiliyor → `anchorEvalExpression` deseniyle `globalThis.__cdpAnchor`'a demirleme. `returnByValue`-only çağrılar bilinçli sarılmadı (side-effect'siz).
- **`taskkill.exe` POSIX'te sessiz no-op (5 dosya):** spawnSync hata dönüyor, çocuk süreç yaşıyor → artık `process.platform==='win32'` kapısı, aksi hâlde `SIGKILL` + exit beklemesi. Yetim Electron birikimini kesti.
- **Electron→Electron iç spawn zygote FATAL (2 dosya):** `-smoke.js` dosyaları içinden ikinci Electron süreci `zygote_host_impl_linux.cc:221 Invalid argument` ile ölüyordu → linux'a özel `--no-sandbox --no-zygote --disable-gpu` (`childLinuxArgs`). Bu dosyalar `run-electron-smokes.js` glob'una girmiyor (`.smoke.js` şartı); artık Linux'ta koşulabilir.
- **subtitle-output pas geçip asılı kalma:** `stopElectron()` artık CDP soketlerini exit-beklemeden ÖNCE kapatıyor (Node inspector "Waiting for the debugger to disconnect..." bloklaması) + başarı yolu `process.exit(0)` ile bitiyor. Suite'teki `ETIMEDOUT` düzeltildi.
- **overlay-timing visibilityState:** `win.hide()` sonrası `'hidden'` beklentisi kasıtlı `backgroundThrottling:false` sözleşmesiyle çelişiyordu (main.js ~12208 — split-view altyazı zamanlayıcıları için kalıcı 'visible'). Test sözleşmeye sabitlendi; `'hidden'` expandedBad oracle'ına eklendi.
- **browser-experience bayat 3 iddia düzeltildi:** translate menü öğesi 5→4 (`browserPageTranslate` araç çubuğu düğmesi R124'te kasten kalıcı yapıldı), "readable measure" 882px eşiği→satır≤ana eşdeğişmezi (grid redesign), `parseVisible===false` (`.player-head-actions` browser workspace'te koşulsuz `display:none`).

## transcribe.py denetim devamı (temiz)

`llm_translate` kuyruğu (~3326-4192), `translate_existing_subtitle` (7039+), `reexport_from_json` ve post-merge boru hattı sıralaması (6121-6450) derin okundu — probe-then-parallel, rescue_pool ayrı executor, `id(entry)` kimlik eşlemesi, `translated_pending is None` kapısı hepsi doğru.

## Açık madde — Windows doğrulama listesine

- **browser-experience fullscreen ayağı:** `browserCommand('fullscreen')` → 6s zaman aşımı ("Oynatıcı komutu zaman aşımına uğradı"). Ayrıştırma: çıplak `BrowserWindow+WebContentsView` üzerinde `documentElement.requestFullscreen()` bu makinede ÇALIŞIYOR (enter/leave event + `isFullScreen` doğrulandı) — ortam destekliyor. Ürün yolunda asılma süreyi aşıyor: `browser:command` → `buildBrowserMediaProbeScript`/`buildBrowserMediaCommandScript` zincirinde `target.requestFullscreen()` pending kalıyor olabilir. **Aday ürün bug'ı** — Windows'ta gerçek sitede tam ekran düğmesi el kontrolü önerilir.

## Koşulan testler

- `electron-a3-acceptance`, `electron-subtitle-output`, `electron-overlay-timing`, `electron-ui-scale-matrix`, `electron-browser-subtitle-smoke`: standalone PASS (yetim süreç sıfır).
- `electron-browser-experience-smoke`: fullscreen ayağına kadar GEÇTİ; fullscreen ayağı yukarıdaki açık madde.
