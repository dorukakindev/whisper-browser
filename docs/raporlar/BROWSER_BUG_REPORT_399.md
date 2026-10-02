# BROWSER_BUG_REPORT_399 — NTP pointer-ölümü kök neden düzeltmesi: boş WebContentsView "sayfa" sayılıp HWND'i yutuyordu

Tarih: 2026-10-02 (UTC). Repo: `dorukakindev/whisper-browser`. Taban: `master` `88b6940` + Windows raporu `BROWSER_BUG_REPORT_398` (`codex/windows-manual-check-2026-10-02-r2`, `4f9e4ce` → `590bed5`).

## Bağlam

R396 + R398 Windows elle doğrulamaları "boş sekme (NTP) temiz açılışta işaretçiye ölü" kusurunu doğruladı. PR #438'in ilk düzeltmesi (yeni yaratılan view'ı oluşturma anında offscreen'e taşıma) PDF onay diyaloğu gibi yüzeylerde etkili oldu ama NTP ölümünü gidermedi; R398, slot'u kaplayan **başıboş bir WebContentsView** kanıtladı (`example.com` adresinde stale YouTube Big Buck Bunny boyanması) ve kök-neden önerisini yazdı: `browserTabHasPage`'in `getURL()===''` durumunu "sayfasız" sayması gerekiyor.

## Kök neden (doğrulanmış)

`src/main.js` `browserTabHasPage` — taze `WebContentsView`'ta `getURL()` `''` (boş dize) döner; `'' !== 'about:blank'` olduğu için fonksiyon `true` sayıyordu → boş görünüm `browserTabShouldBeVisible` → `view.setBounds(browserBounds) + setVisible(true)` ile yeni-sekme yüzeyinin ÜSTÜNE konumlanıyordu. Windows'ta görünmez/boş HWND işaretçi olaylarını compositor'dan bağımsız olarak hit-test'te yuttuğu için kutucuk/arama/×/sağ-tık tamamen ölüyordu; Linux'ta aynı durum stale içerik boyaması üretiyordu (`example.com`→BBB).

İkinci sızıntı yolu: `browser:show` ve `activateBrowserTab` `ensureBrowserView`'ı sayfasız sekmeler için koşulsuz çağırıyordu — boş HWND yaratılıp üstte kalıyordu.

Üçüncü yol: `browser-mini-player.js` close() akışı `tab.view`'ı mini-pencerenin sınırlarıyla (örn. 720×432 @0,0) `main.contentView`'a geri bağlıyor ve `restore()` koşana dek üstte görünür kalıyordu.

## Düzeltme (3 bölüm, B83-30 sözleşmesi korunarak)

1. **`browserTabHasPage`**: `url && url !== 'about:blank'` → `''` artık sayfasız sayılır; `restoredUrl`'i olan boşaltılmış sekmeler hâlâ "sayfa var" sayılır (diriliş yolu `resumeRestoredBrowserPage`).
2. **Tembel view yaratımı**: `browser:show` (`main.js:~15294`) ve `activateBrowserTab` (`main.js:~13961`) artık `ensureBrowserView`'ı yalnız `tab.view || tab.restoredUrl` varsa çağırır. Sayfasız sekme NTP'yi renderer'da çizer; ilk navigasyonda `browser:navigate` yine `ensureBrowserView` çağırır. `ensureBrowserView` hatasında `lifecycle='unloaded'` + sonraki aktivasyonda retry sözleşmesi değişmedi.
3. **Mini-player reattach**: `browser-mini-player.js` close handler'ı `main.contentView.addChildView` sonrası view'ı `hideOffscreen` (`setVisible(false)` + `-10000,-10000`) ile ekran dışına çekip sonra `restore()` koşuyor. Bağımlılık `registerBrowserFeatureServices`'e `hideOffscreen: hideBrowserViewOffscreen` olarak eklendi (`main.js:~21355`, `browser-feature-services.js:114`).

## Regresyon kilitleri

- `tests/browser-store-deadzone.test.js` `t_tab_has_page`: `getURL:()=>''` → `false`, `''` + `restoredUrl` → `true` eklendi.
- `tests/browser-mini-player.test.js`: close'ta `hideOffscreen` çağrısı + `['hide','restore']` sırası kilitlendi.

## Doğrulama

- `node --check` src/main.js, src/browser-mini-player.js, src/browser-feature-services.js — temiz.
- `node tests/browser-mini-player.test.js` — 10/10.
- `node tests/browser-store-deadzone.test.js` — 11/11.
- `node tests/browser-view-visibility.test.js` — 8/8.

## Windows etkisi

Yüksek — bug yalnız Windows HWND hit-test davranışında ölümcüldü (R396/R398 gerçek makinede kanıtlı). `start.bat` akışı etkilenmez. Doğrulanmamış sınır: düzeltmenin temiz-açılış NTP'sini gerçek Windows'ta canlandırması Windows oturumunda tekrarlanmalı (sonraki el-kontrol listesi maddesi).

## Kalan / bilinen sınırlar

- R398'deki eş-belirti "beklenmedik mini-PiP popup'ı" ayrı izlenmeli — bu düzeltme view-deadlock'unu kapatır; mini pencerenin yanlışlıkla açılması farklı bir yol olabilir (ipc `browser:mini:open` tetikleyicisi).
- Stale-content boyaması (navigasyonda eski sayfa) aynı kökten besleniyordu; `''`-düzeltmesi ile birlikte kapanması beklenir, Windows'ta teyit gerekir.
