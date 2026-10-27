# Rapor650 — Asistan gerçek sayfa işi kabulü ve kitap kanıt sınırı

Başlangıç ba2c195b28f95521dd592043db998295114bcd2c; ürün b3f0e4e5e100f1ba0a790e508433db15779c3f7f; dal codex/product-50-650. [50hedef planı](PRODUCT_50_2026-10-27/PLAN.md) W21–W30kanıtla kapsandı; toplam30/50,20açık. Eski yetenek/kimlik/stop testleri yeni bug sayılmaz.

## Ürün düzeltmeleri

- translate_page kartı fire-and-forget çağrıdan hemen accepted dönüyordu: ayar kaydı veya APIkey reddi bile asistan makbuzunda görünmüyordu. Artık yalnız hazırlıksonucu/ana süreç işkaydı beklenir; bütün sayfanın bitmesini beklemez. Rejection makbuza hata, mevcut çevirinin gösterilmesi completed ve no-new-job, kayıtlıiş accepted+exactjobId döner. Incompleteunchanged bütçe/pending durumları completed gibi gösterilmez.
- browser:page:start opsiyonelwaitForAcceptance: gerçek assistantJobs.start sonrası onAccepted ile erken makbuz, bütün çeviri mevcut backgroundscheduler'da. Erkenpreparationfailure aynen döner. Eski çağrılar tamfinalyanıtını bekleme sözleşmesini korur. Sonraki providerexception yakalanıp doğruepoch/generation'da hataeventi verir. Aktif aynın hedefdil işi varsa exactID/running; başkahedefdil işi kullanılmaz.
- Asistan source await sırasında değiştiyse yeni kabul edilen kendi işini exactledgerID ile iptal eder; önceden var olan running işi durdurmaz. Renderer stale dönüşü exactID'yi kaybetmez. Başarısızstop açık hata verir.
- Main resolver gerçekdoğrudan ledgerID'yi tanır; mevcut backendlinkleri korunur, uydurmaID null. Flow devamı yalnız bu kesin iş completed ise ilerler; aynıID running iken bekler. Böylece sayfa çevirisinden sonraki işlem körlemesine başlamaz.
- Kitapget_book_context seçilip2000karaktere kırpılan pasaj için selectedTextTruncated bilgisi eksikti. Artık kendi uzunluk/upstream bayrağı taşınır, summaryile aynısourceid olmayan seçimin metni alınmaz. Tümbookokundu iddiası yok. Üretimmetni değişmez.
- Asistan işpanelinde rawtranslation/waiting aşamaları EN/TR etiketlenir.

## Kanıt / sınırlar

İlk6pageaccepttest eskikodda kırmızıydı: yanlışaccepted,erkenreceipt,shownaccepted,stalesonucureddi,mainacceptancecallback ve existingjobreuse. Bu altıassert tek entegrasyonhattındaki kabul koşullarıdır;6bağımsızkritikbug denmez. Yeni8pageaccept + kitap1truncation; mevcut gerçekpagepipeline testi ledgerstart→onAcceptedcallback'i running iken doğrular.

10hedefliNode dosyası59entry geçti: assistant-page-accept650,app-actions,agent-service,capabilities,library-actions,book-actions,caption-actions,media-stop638,overlay,page-translation-main. Bu kontrollüyetenek/ID/iptal/continuation/pagination kanıtıdır, herhangi bircanlıLLM'nin hiçyanlışsöylemeyeceği garanti değil.5değişenJSsyntax ve diffcheck geçti.

Windowsnative electron-assistant-page650 exit0. Gerçekmain/preload/renderer,pageDOMscan,scheduler,ledger ve pageinjector; yalnızmodelyerelHTTPfixture:anahtaryokken0providerrequest/red, fixturekeykonunca1istekbekletildi,kabul exactIDrunning döndü,aynıdil reusedrunning,başkadil reddi,yerelcevapserbestbırakılınca aynıIDcompleted,DOM'dagerçekbilingualmetinvehazırçevirinin completedshown makbuzu. ÜcretliAPI/modelGPU/canlısitekullanılmadı. Screenshotasistan yüzeyi ayrıca capture edildi; maincapture nativeview'ı göstermediğinden boşgörselbaşarısayılmadı. Finalkanıt `.uiprev/assistant-page650/1793113510735-8460/`; kayıtlıiş/gösterilençeviri yüzeyi ayrıca incelendi. Sahte çeviri dilkalitesi değerlendirilmedi.

İlk native navigasyonilksekmeoluşmadan çağrılıyordu; fixture gerçektabhazır kapısı+navigation.ok ile düzeltildi. Ayrıtestprofilinde dışfetchengeli reklamfiltreindirmesine Outside localfixture uyarısı verdi; bukasıtlıtestizolasyonu, reklamengelleyicibaşarısıiddiası değil. Kişiselapp/profil/anahtar okunmadı/kapatılmadı. Yeni APIanahtarı tamamen fixture ve yalnıztestprofilinde.

Launcher/install değişmedi, start.bat/tam npm/CI/gerçekWhisper/TTSGPU/ücretlisağlayıcı denenmedi; CIbeklenmez/açıktır. Yeni dependency/kalıcışemayok; mevcutIPC'de optionalwaitForAcceptance ve yanıtalanları. Ürün/belgeayrıcommit,pushPRmasterrootFF;20hedef daha açık.
