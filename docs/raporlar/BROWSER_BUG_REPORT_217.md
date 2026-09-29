# BROWSER_BUG_REPORT_217 — R265: Navigasyon güvenliği — alt kare (iframe) boşlukları

## Özet (madde 15)
Uygulamadaki tüm webContents yüzeylerinin navigasyon güvenliği envanteri çıkarıldı:

| Yüzey | Önceki durum | Sonuç |
|---|---|---|
| Tarayıcı sekme görünümleri (WebContentsView) | `attachNavigationGuard` — will-navigate + will-redirect + will-frame-navigate | tam |
| OAuth/giriş popup'ları | aynı guard + securePopupWebPreferences + kayıt sınırı | tam |
| Görsel→PNG worker (offscreen) | webRequest ile data:/about:blank dışı iptal | tam |
| YouTube TV penceresi | will-navigate + will-redirect (domain beyaz listesi) | **subframe açık** |
| Ana pencere | will-navigate reddi + window-open → dış-politika | **subframe + will-redirect açık** |
| Mini oynatıcı penceresi | yok | **hiç koruma yok** |

## Bulgular ve düzeltmeler
1. **YouTube TV penceresi — subframe şema kaçağı:** `isAllowedTvNavigation` yalnız ana kareye
   uygulanıyordu; bir iframe `file://`/`javascript:`/`data:` hedefine gezinebilirdi. Alt kareler
   artık `http:`/`https:`/`about:` beyaz listesiyle sınırlı.
2. **Ana pencere — subframe + will-redirect:** Renderer'ımız iframe barındırmaz; enjekte
   edilmiş bir alt karenin dış dünyaya gezinmesi artık tamamen reddedilir (boş izin kümesi).
   `will-redirect` için de aynı `preventDefault` eklendi (will-navigate'in kardeş kanalı).
3. **Mini oynatıcı — hiç koruma:** Yerel `browser-mini.html` dışına hiç gezinme yok; artık
   `setWindowOpenHandler` deny + `will-navigate`/`will-redirect` preventDefault + boş
   subframe izin kümesi. `loadFile` programatik olduğundan `will-navigate`i tetiklemez —
   ana penceredeki aynı desen kanıtlı.

## Yeni bileşen
- `attachSubframeSchemeGuard(webContents, { allowSchemes, onDecision })`
  (`src/browser-navigation-policy.js`): `will-frame-navigate` için şema beyaz listesi;
  ayrıştırılamayan/kontrol karakterli/aşırı uzun hedefler fail-closed engellenir;
  detach fonksiyonu döndürür.

## Kanıt
- `tests/subframe-scheme-guard.test.js` — 6 kontrol: izin/ret matrisi, boş küme,
  fail-closed ayrıştırma, detach, kaynak-taraması bağlantısı, argüman doğrulama. PASS.
- `popup-auth-protocol-security.test.js` — 12/12 PASS (mevcut ana-kare davranışı korunur).
- `node --check` — üç değişen dosya OK.

## Windows etkisi
Olay adları ve şema denetimi platformdan bağımsız; Windows'a özgü risk yok.

## Değişen dosyalar
- `src/browser-navigation-policy.js` — `attachSubframeSchemeGuard` + dışa aktarım
- `src/main.js` — tvContents subframe guard, mainWindow will-redirect + subframe guard
- `src/browser-mini-player.js` — window-open/will-navigate/will-redirect/subframe
- `tests/subframe-scheme-guard.test.js` — yeni test dosyası

## Çalıştırılmayanlar
Tam `npm test` (CI koşar). Gerçek iframe enjeksiyonu denemesi yapılmadı — guard mantığı
EventEmitter stub'ı ile birim-test edildi; Electron olay adı mevcut
`attachNavigationGuard` ile aynı (`will-frame-navigate` zaten kullanımda).
