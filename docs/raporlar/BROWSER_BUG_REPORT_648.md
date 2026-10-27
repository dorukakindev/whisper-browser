# Rapor 648 — Yeni50hedef: canlı Whisper geç başlangıç ve oturum sahipliği

Başlangıç master65505a781a45573d628926e126fc0bf0ca89ff79; ürün 2afb933f991ac05552f53a1900be960dceab17f2; dal codex/product-50-648. Kullanıcı50yararlı iş istedi; [50hedef planı](PRODUCT_50_2026-10-27/PLAN.md) gerçek mevcutfonksiyonlara bağlıdır.50bug diye sunulmaz. İlk10hedef bu paketle tamamlandı; kalan40 açık. Önceki DeepSeek1000kaydı okunmuştur; eski testler gereksiz yere yeni keşif sayılmadı.

## Yeniden üretilen sorunlar ve düzeltme

1. Ses paylaşımı beklerken Durdur, geç chooser sonucunu iptal etmiyordu; aynı sekmedeki yeni video da yalnıztabId kapısından geçiyordu. Başlangıç intent'i onay penceresinden ÖNCE ayrılır; source tab/generation/mediaKey/url dondurulur. Her await sonrası doğrulanır. İptal edilen stream'in bütün trackleri kapatılır, backend yalnız aynı sessionId ile durdurulur.
2. İki hızlı tıklama iki consent penceresi açabiliyordu. Starting sahipliği ilk await öncesindedir; ikinci tıklama iptal eder. Görünür CancelLiveWhisper düğmesiEN/TR ile gelir.
3. Eski AudioWorklet.onprocessorerror global stop çağırıp yeni capture'ı kapatabiliyordu. Exactcapture+stopping kapısı eklendi. Eski blob dönüşümü artık yeni oturumda ses göndermez ve geç gönderim hatası yeni durumu ezmez.
4. Capture stop, context.close bekledikten sonra global stream'i kapatıyordu. Eski capture/stream/session snapshot'ları temizlenir; yeni stream tutulur. Tek capture için paylaşılan stopPromise tekrarlı teardown'ı önler. Son accepted chunk flush/drain korunur.
5. Backend terminal olayı yalnız active capture'ı kapatıyordu; bekleyen başlangıç yeniden canlanıyordu. Starting de iptal edilir. live-asr-state sessionId taşır; eski terminalolay yeni oturumu kapatmaz. StopIPC opsiyonel sessionId kabul eder, mismatch/type reddeder; eski explicit globalstop çağrısı geriye uyumlu kalır. Yetki kapısı değişmez.

İlk5yeni davranış eski kodda doğrudan kırmızıydı. Kalan kapsam kontrolleri aynı köklere ek savunma/kabul;5/10ayrı kritikbug sayılmaz. MainCPUfallback ve eski sonchunkdrain kontrolleri korunur. Yeni API alanı opsiyoneldir, yeni kanal veya kalıcı şema yok.

## Kanıt

- tests/live-asr-start-owner648.test.js11/11: pendingchooserStop,aynıtabsource,rapidconsent,eskiworkleterror,lateblob,sekmedeğişimi,moduleloadiptali,eskicontextcloseyenistream,terminalsessiongate,mainstopID/yetki,normalconnect/flush/restart.
- Önceki browser-live-audio10, browser-live-asr-pipeline8, live-asr-fallback5, live-asr-worklet13 davranış geçti (4Node dosyası;36davranış). Bu tekrarlar değişen ASR için regresyondur, yeni keşif sayılmaz.
- Windowsnative electron-live-asr-owner648 exit0;3kontrollübackendaccept,stop/sametabnavigation/backendterminal sonrasında0capture,6faketracktamkapalı,scopedstopkimlikleri. Gerçek düğme tıklaması chooser dönmeden cancelled=true. EN/light ve TR/dark görünür/etkin Cancel kontrolü görüntüsü incelendi.
- Nativekanıt ignored `.uiprev/live-asr-owner648/1793110655981-16892/`. İlk screenshot başlangıç sayfasını gösterdi; taşıma nedeniyle kontrol gerçekte altyazı çekmecesindeydi. Test doğru gerçekçekmeceyi açıp checkVisibility+enabled+bounds+click assertion ekledi; boş ekran başarı sayılmadı. İlk launch exitkaydı kaybolduğu için final Wait/PassThru ile gerçekexit0alındı.
- Terminalevent testinin ilk sürümü CRLF kaynakta newlinekesme sınırını bulamıyordu. Testkaynağı LFnormalize edildi; bu ürün bugı değildir.
- npm run test:electron-bridge: sandboxMojoErişimengeli ile ilkdeneme -2147483645; native yetkili ayrıprofil tekrar exit0, trustedbridge/TextTrack/EME/medya/shadow/iframe/DarkReader geçti.
- Değişen5JS syntax ve diffcheck geçti.

## Sınırlar / Windows

Native test gerçekmain/preload/renderer, fakat consent/chooser/backendaccept kontrollüdür. Gerçek sistemsesi paylaşımı, mikrofon,Whispermodel/GPU/ücretliAPI/canlıYouTube çalıştırılmadı. AudioWorkletnormal bağlama VMkontrolü gerçek ses kalitesi değildir. AktifGPUstalleddrainkill tekrar mekanizması bu paketin konusu değil; bitmişchunkları koruyan mevcutdrain sürer. UIgenel tasarımı değiştirilmedi; yeni iptalmetni mevcutpalet/düğmede. start.bat/install değişmedi; bu komutlar ayrıca koşulmadı. Yeni dependency yok. Uzun CI beklenmez/açık kalır.

Normal ürün/belge commitleri, push/PR/master ve kişisel manifest/INDEX516/untracked korunarak anaFF. Açık kişisel uygulama kapatılmaz; sonraki normal açılış yeniJS'yi yükler. Sonraki W11–W20; birkaç küçük işten sonra50tamamlandı denmez.
