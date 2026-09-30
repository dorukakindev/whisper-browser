# BROWSER_BUG_REPORT_257 — R308: çoklu-pencere kapanış sırası (mini oynatıcı × bellekten boşaltma)

- Tarih: 2026-09-30
- Kapsam: 20'lik kuyruk maddesi 11 — çoklu-pencere kapanış sırası (mini player + ana pencere).
- Dal: `devin/1790747140-mini-unload-order` (master `035fa4d` üzerine)

## Denetim yöntemi

`browser-mini-player.js` modülü tam okundu; `destroyBrowserTab`, `unloadBrowserTab`,
`destroyBrowserView`, ana pencere `close` akışı, `before-quit`, `window-all-closed`,
`shutdownPersistentBrowserSession` ve görüntü-dönüştürme worker penceresi incelendi.
İzlenen senaryolar: sekme yok edilirken mini'ye taşınmış görünüm, ana pencere kapanırken
mini açık, mini kapanırken ana pencere yarı-destroy, `open(B)` esnasında mini'nin A'yı
geri bağlaması, Cmd+Q / `before-quit`, popup ve worker pencereler.

## Bulunan bug ve düzeltme

**Boşaltılan sekme mini pencereyi ölü kareyle açık bırakıyordu.**

`destroyBrowserTab` mini'ye taşınmış sekme için `browserExtras.mini.close()` çağırıyordu
(main.js:13290) ama `unloadBrowserTab` bu çağrıyı yapmıyordu. Mini'de **duraklatılmış**
bir sekme arka-plana düşünce `media_playing` koruması kalkar; kullanıcı "etkin olmayan
sekmeyi bellekten boşalt" komutunu çalıştırdığında (ya da bellek baskısı boşaltırsa)
sekmenin `WebContentsView`'ü `wc.close()` ile yok edilirken mini pencere açık kalıyor ve
ölü son kareyi gösteriyordu. Kullanıcı ancak pencereyi elle kapatarak kurtuluyordu.

Düzeltme iki parçadan oluşur:

- `src/main.js` — `unloadBrowserTab`: `browserExtras?.cancel(tab)` sonrası
  `if (browserExtras?.mini.owns(tab)) browserExtras.mini.close();` — destroyBrowserTab
  ile aynı sıra ve semantik.
- `src/browser-mini-player.js` — `close` handler geri-bağlama bekçisine
  `currentTab.lifecycle !== 'unloading'` koşulu: boşaltım yolunda görünüm az sonra
  yok edileceği için ana pencereye geri bağlama + `applyBrowserViewsLayout` boşuna
  iş olurdu.

## İncelenip temiz çıkan yollar

- Sekme destroy + mini barındırma: `tab.closing` bekçisi geri-bağlamayı zaten atlıyordu.
- Ana pencere kapanışı: `destroyBrowserView` → `destroyBrowserTab` zinciri mini'yi
  kapatır; mini `close` handler'ı ölü wc'de `removeChildView`'i try/catch'ler.
- `before-quit` mini'yi ilk sırada kapatır; `window-all-closed` süreç temizliği doğru.
- `open(B)` esnasında eski mini'nin `close` handler'ı `window !== currentWindow`
  bekçisiyle bayat pencereyi yok sayar.
- Görüntü-dönüştürme worker'ı `finally { worker.destroy() }` ile geçicidir.
- `shutdownBrowserSession` pencere listesi `excludedWindow` olarak yalnız ana pencereyi
  tutar; mini zaten `destroyBrowserView` tarafından kapatılmış olur.

## Doğrulama

- `node tests/browser-mini-player.test.js` → 10 senaryo PASS (yeni: closing + unloading
  kapanışlarında geri-bağlama/restore atlanır).
- `node tests/browser-retry-state.test.js` → OK (vm simülasyonunda `miniClosed === true`).
- `node tests/browser-lifecycle-policy.test.js`, `browser-view-visibility.test.js` → PASS.
- `node --check src/main.js src/browser-mini-player.js` → temiz.
- **Kırmızı kanıtı:** master'daki eski kodda aynı testler FAIL (`restore çağrılmamalı`
  ve `boşaltım mini pencereyi kapatmıyor`).

## Windows etkisi / doğrulanmayan sınırlar

Değişiklik Electron `contentView`/`WebContentsView` sahipliği düzeyinde; platform
bağımsız. Gerçek Windows'ta mini pencerenin boşaltım anında görsel olarak kapanması
elle doğrulanmadı (başsız ortam) — beklenen davranış: "bellekten boşalt" komutu mini
oynatarak izlenen duraklatılmış sekmeyi boşaltırsa mini pencere de kapanır.

## Kalan bilinçli sınırlar

- Aynı anda iki mini pencere yok (open, varsa eskisini kapatır) — tasarım gereği.
- Split-ikincil sekmenin mini'ye taşınması komut yüzeyinde engelli değil; ikincil
  sekme `activeBrowserTab` olmadığı için pratikte ulaşılmıyor.
