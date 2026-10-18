# Rapor 425 — YouTube document-start reklam koruması

Tarih: 2026-10-15. Başlangıç: b4e3bc6d3beddff71edf84b004d31a3011613679.
Kod: a25e574706b927bd1aa146ba2fb70a6c452979d2.

## Sorun ve kanıt

Kullanıcı rapor424 düzeltmesinden sonra da ana sayfa ve video reklamları gördüğünü bildirdi. Önceki başarı yalnız kısa anonim gözlem ve genel motorun doğru betik çalıştırmasıydı; bütün reklam türlerinin engellendiği kanıtı değildi. Ghostery'nin preload → async IPC → main-frame execute zinciri, yükleme bitişini beklemese de ilk inline script'ten önce kurulmayı garanti etmiyordu. Aynı YouTube origin'inden gelen JSON reklam verisi alan bazında temizlenmediğinde genel ağ listeleri tek başına yeterli değildir. Mevcut deneysel CDP budama yalnız isteğe bağlı player yanıtında, ilk HTML literal'inden sonra çalışır; burada varsayılanı değiştirilmedi.

Yeni gerçek Electron fixture'ı ilk inline script'te literal ytInitialPlayerResponse, native Response.json ve XHR responseType=json yollarını ayrı ölçer. Koruma document.readyState=loading sırasında, ilk inline script'ten önce aktif olur. Reklam alanları ilk tüketimden önce çıkarılır; captions/streamingData ve Türkçe metin korunur. Sadece oynatıcı açıldı gözlemi başarı kabul edilmez.

## Çözüm

- src/youtube-ad-preload.js: browser session'a document başlamadan kaydedilen bağımsız preload. contextBridge.executeInMainWorld ile aynı sayfa dünyasında çalışır; Node/IPC yetkisi dışarı açılmaz. Başka sitelerde hiç kurulmaz.
- ytInitialPlayerResponse/ytInitialData literal atamaları, JSON.parse, YouTube API Response.json ve XHR response/responseText akışları temizlenir. adPlacements, playerAds, adSlots ve adBreakHeartbeatParams; açık reklam renderer kimlikleri hedeflenir. Normal kartlar/altyazı/video adresi/playability hata bilgisi korunur. Cümle veya sponsor sözcüğü arayarak normal içerik gizlenmez.
- Ana sayfa/arama SPA reklam kartları için kimliği açık DOM düğümlerini ve kendi grid hücresini dar kapsamda gizleyen yedek gözlemci eklendi; bütün bölümü/oynatıcıyı gizlemez. 150ms debounce, derinlik/düğüm sınırları ve teardown vardır. Boş reklam kartlarının kapsayıcı JSON girdileri de kaldırılır.
- Ana süreçten senkron yalnız yerel enabled politikası alınır; indirme veya ağır işlem beklenmez. Gönderen mevcut browser view ve ana frame olmalı; URL uzaktaki mesajdan alınmaz. Genel kapatma/site tercihi izlenir; görünür kartlar ve sahip olunan API sarmalayıcıları bırakılır. Sonraki başka sarmalayıcılar körlemesine ezilmez.
- Proxy ile JSON.parse/Response.json isim/arity davranışı korunur. Frozen reviver nesneleri uygulamanın normal JSON davranışını bozmaz.
- Yeni preload BOOT_CRITICAL/paket kümesindedir. Bağımlılık/kurulum değişmedi.

## GitHub araştırması

- [Ghostery Electron](https://github.com/ghostery/adblocker/blob/master/packages/adblocker-electron/README.md) ve [resmî filtre kaynakları](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/src/fetch.ts): genel motor ve mevcut cache/listeler korunur.
- [uAssets Quick fixes](https://github.com/uBlockOrigin/uAssets/blob/master/filters/quick-fixes.txt): reklam verisinin player/playlist/JSON yollarında ele alınması incelendi; dışarıdan rastgele userscript kurulmadı.
- [Pear Desktop açık PR4690](https://github.com/pear-devs/pear-desktop/pull/4690): benzer Electron contextIsolation/document-start sorunu ve adBreakHeartbeatParams alanı tartışılıyor. Bu açık PR'ın doğruluk/kalite iddiaları burada bağımsız kanıt sayılmaz; kodu kopyalanmadı.
- [FreeTube](https://github.com/FreeTubeApp/FreeTube): ayrı oynatıcı/çıkarıcı mimarisi incelendi; mevcut browser'ı başka ürüne dönüştürmek yerine yerel preload yolu kullanıldı.
- [Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge#contextbridgeexecuteinmainworldexecutionscript-experimental): deneysel API, mevcut kurulu Castlabs43.5 ile gerçek Windows smoke'ta doğrulandı.

## Doğrulama

- Yeni unit: literal/JSON/fetch/XHR, SPA kartı/normal kart ayrımı, aynı kurulumun tekrarlanmaması, kapatma/geri yükleme, dış hostname, main policy/site/global kapalı durumu, yabancı sender ve subframe reddi. Senkron IPC tek yanıt semantiği ayrıca test edilir.
- Yeni gerçek Electron smoke: ilk inline script reklam alanı görmedi, guardStage=loading; fetchAd/xhrAd=false, captions/streamingData korundu, normal kart görünür/ad kartı kapalı, window.api/require undefined. Kapatma sonrası JSON ve kart geri döndü.
- Son canlı kontrol **uygulamanın src/main.js üzerinden açılan gerçek WebContentsView'ında**, ayrı anonim profildeydi: ana sayfa8, laptop araması13, Rick Astley videosu16, Blender videosu13 reklam alanı/renderer girdisi temizlendi. Bunlar reklam sayısı değildir. Guard her sayfada loading aşamasında aktifti. Görünür kart/oynayan reklam/enforcement yoktu. İki video readyState4; ölçülen zamanlar1.95sn/10.02sn, paused=false. Genel motor10 istek engelledi; yakalanan unhandled rejection yok. Video ekran görüntüsü incelendi. Özel kanıt: tmp/youtube-app-acceptance-1792035610900/report.json ve page-*.png; Git dışında.
- Ara gerçek-app kontrolü yeni politika handler'ında iki returnValue atamasının ilk yanıtı hemen göndermesi nedeniyle guard'ın kapalı kaldığını yakaladı; tek yanıtla düzeltildi ve unit modeli gerçek semantiğe uyarlandı. Bu ara sürüm push edilmedi. Önceki bir testte GPU'suz capturePage UnknownVizError verdi; son kontrol/son görüntü alındı, bunu video başarısı diye örtmedik.
- Windows: youtube-ad-guard, browser-adblock, media-controller33, browser-preload-ratchet9, electron-security1430, interval-inventory2, player-response pruner/integration, preload-usage ratchet ve package-integrity9 geçti. electron-adblock + electron-youtube-guard smoke, test:electron-bridge geçti. JS syntax/diff temiz.

## Sınırlar

Oturumlu kullanıcı hesabı, bütün bölgeler/A-B deneyleri, sunucu tarafı videoya gömülü SSAI ve uzun video reklam araları doğrulanmadı. Ana/arama sayfasında temizlenen reklam verisi gözlendi; her olası kart tasarımı garanti edilmez. Normal YouTube içeriği/kanal promosyonları reklam diye gelişigüzel gizlenmez. Tam npm test, paketli EXE yeniden derlemesi ve yeni start.bat açılışı yapılmadı; gerçek uygulama harness'ı start.bat kabulü değildir. Kullanıcı güncel kaynak için uygulamayı start.bat ile yeniden açmalı. CI önceki kullanıcı talimatıyla beklenmez. Profil/çerez/API anahtarı veya ses verisi kullanılmadı/yayımlanmadı.
