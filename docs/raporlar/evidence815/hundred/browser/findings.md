# R815 yüz hedefine ek browser denetimi — 8 bağımsız bulgu

Başlangıç HEAD `da773134a3e744885592bafa008f81f03bcdf878`; çalışma sırasında yetkili bağımsız long-Turkish ürün teslimiyle HEAD `ae0a61a7b42c58d78bb7317680cf8f8133d5e027` oldu. Bu ajan ürün/test/git/docs değiştirmedi. Test edilen parser/asset/package/main dosyalarının SHA256ları aynı kaldı; güncel HEADte tekrar koşuldu. Speech varyant fixtureı güncel v15 protokolüne taşındı.

AGENTS/YENI-BILGISAYAR/güncel0041 devir, önceki78 eşleme ve registry1000 okundu/parse edildi. Önceki78 aynı kökleri tekrarlanmadı. R25/R304/R444/R492 ilgili tarihsel kayıtları karşılaştırıldı.

## HB01 · P2 — Altyazı varlık kaydı dikey yazım/sunum bilgisini kaybediyor

- Kaynak: `src/browser-asset-store.js:14`, `src/browser-asset-store.js:113`, `src/main.js:9834`, `src/main.js:9888`, `src/browser-overlay-controller.js:728`.
- Tekrar: Orijinal BrowserAssetStore.putTrack/getTrack round-trip içinde writingMode:rl,speaker,region,line,position taşıyan cue kaydet. Kaynak ve dönen cueyu gerçek Windows overlay scriptine sırayla ver.
- Gözlenen: Kaynakta writingMode rl, depoda alan yok. Native overlay önce vertical-rl, sonra boş writingMode döndürdü.
- Beklenen: Depo, ürünün desteklediği dikey yazım gibi cue metadata bilgisini round-tripte korumalı.
- Etki: Doğu Asya dikey altyazısı kayıttan açılınca yataya döner; konuşmacı ve sunum bilgisi JSONda da geri getirilemez.
- Kök: Asset normalizer yalnız id/start/end/text ve sınırlı identity/quality/provenance alanlarını projekte ediyor; presentation alanları kaybediliyor.
- Çağrı yolu: persistBrowserTrack→BrowserAssetStore.putTrack; restorePersistedBrowserTracks→getTrack→SRT path ve cueIdentities. Orijinal overlay writingMode alanını kullanıyor.
- Önceki kapsam: R815-B42 backend checkpoint speaker kaybından ayrı varlık depo kökü. R444 kalite warning düzeltmesi bu alanları kapsamıyor. Önceki78de aynı kök yok.
- Sınır: Native ölçüm tam renderer-main yeniden açılışı değildir: gerçek kaydedilmiş cue nesnesinin gerçek overlay tüketicisindeki sonucu. line/position/region overlayde kasıtlı uygulanmıyor; bug kanıtı özellikle desteklenen writingMode ile kuruldu.

## HB02 · P2 — Tarayıcı oturum paketi seslendirme çevirisinin forSpeech ve protokol bilgisini siliyor

- Kaynak: `src/browser-session-package.js:76`, `src/main.js:16599`, `src/renderer/renderer.js:11535`.
- Tekrar: forSpeech:true ve güncel speech-v15-idiom-anchor-feedback taşıyan gerçek asset documentı createBrowserSessionPackage→inspectBrowserSessionPackage→putTrack zincirinden geçir.
- Gözlenen: Dışa aktarım öncesi true/v15; içe aktarılan asset false/boş protokol oldu.
- Beklenen: Taşınabilir oturum, çeviri varyantının kullanım/protokol kimliğini korumalı.
- Etki: Hazır seslendirme çevirisi importtan sonra sıradan çeviri sayılır; reuse eşleşmesi bozulup kullanıcı gereksiz ücretli çeviri veya yeniden hazırlamaya yönelir.
- Kök: sanitizeVariantın izinli projeksiyonu forSpeech/speechProtocol alanlarını içermiyor; asset.safeMeta eksik değerleri false/boş varsayıyor.
- Çağrı yolu: collectBrowserSessionVariants saved.document toplar; package sanitizer düşürür; importBrowserSessionVariants putTrack yapar; renderer11535 forSpeech/protocol eşleşmesini zorunlu kılar.
- Önceki kapsam: Önceki78de yok. EX-BR07 generic streamId deposu kimlik kaybı farklı alan/normalizerdır.
- Sınır: Güncel v15 ile ae0a61a HEADte tekrarlandı; gerçek sağlayıcı/GPU kullanılmadı. Metin kaybı değil, varyant niteliği/reuse kaybı.

## HB03 · P2 — DASH Representation SegmentTemplate üst şablon niteliklerini devralmıyor

- Kaynak: `src/browser-subtitles.js:876`, `src/browser-subtitles.js:892`, `src/main.js:11634`.
- Tekrar: AdaptationSet düzeyinde media=sub-$Number$.vtt,duration5,timescale1 ve Representation düzeyinde yalnız initialization içeren geçerli MPD sun. Orijinal parseDashSubtitleMatchers çalıştır.
- Gözlenen: Kalıtımlı MPD0matcher; yalnız initialization childını kaldıran parent-only karşıörnek2matcher. Gerçek nativeHTTP ve flat capture2cue/complete:true.
- Beklenen: Representation şablonu belirtilmeyen media/duration/timescale alanlarını üst SegmentTemplate üzerinden devralmalı.
- Etki: Yaygın katmanlı DASH manifestinde sayfa oynarken altyazı keşfi tamamen boş kalır.
- Kök: Rep template varsa adaptationTemplate tümüyle yok sayılıyor; alan bazlı inheritance yapılmıyor.
- Çağrı yolu: captureBrowserResponse manifest dalı main11634 parseDashSubtitleMatchers→captureDashSegments. Native kontrollü HTTPde aynı orijinal fonksiyonlar kullanıldı.
- Önceki kapsam: R304 geniş DASH zinciri temiz taraması bu inheritance varyantını dinamik doğrulamamış. Önceki78de yok.
- Sınır: DASH schema validator çalıştırılmadı. Semantik Google Shaka gerçek inheritAttribute uygulaması ve resmi MPEG/DASH kaynaklarıyla karşılaştırıldı; dış kod alınmadı.
- Birincil referans: [Google Shaka MpdUtils gerçek kaynak](https://shaka-project.github.io/shaka-player/docs/api/lib_dash_mpd_utils.js.html).

## HB04 · P2 — Geçerli XML namespace önekli DASH MPD altyazısı keşfedilmiyor

- Kaynak: `src/browser-subtitles.js:878`, `src/browser-subtitles.js:1177`, `src/main.js:11634`.
- Tekrar: Aynı namespace/localName içeriğini önce default namespace <MPD>, sonra xmlns:dash bağlı <dash:MPD> şeklinde sun. Orijinal direct track parserı çağır.
- Gözlenen: Default biçim1iz; prefixed biçim0iz. Windows DOMParser localNameMPD, doğru MPEG namespace ve parserErrors0 doğruladı.
- Beklenen: XML prefix seçimi aynı expanded namesi taşıyan manifestin işlenmesini değiştirmemeli.
- Etki: Namespace öneki kullanan geçerli sağlayıcı manifestlerinde altyazı yokmuş gibi davranılır.
- Kök: MPD,Period,AdaptationSet,Representation gibi XML öğeleri namespace-aware ayrıştırma yerine çıplak isim regexleriyle taranıyor; ilk MPD guardı bile prefixed rootu reddediyor.
- Çağrı yolu: main manifest parserı parseDashSubtitleTracks ve parseDashSubtitleMatchers kullanıyor; her iki giriş çıplak MPD bekliyor.
- Önceki kapsam: HB03 nitelik mirası; bu XML ad çözümlemesi kökü. TTML namespace temizliği R492de farklı parserdaydı. Önceki78de yok.
- Sınır: Canlı sağlayıcı denenmedi; gerçek Chromium XML parse ve native HTTP sentetik manifest. XML well-formedness/namespace sonucu DASH tam schema conformance iddiası değildir.
- Birincil referans: [W3C Namespaces in XML](https://www.w3.org/TR/xml-names/#ns-qualnames).

## HB05 · P2 — TTML çocuk altyazısı üst zaman kapsayıcısının bitişinde kesilmiyor

- Kaynak: `src/browser-subtitles.js:1365`, `src/browser-subtitles.js:1382`, `src/browser-subtitles.js:1463`, `src/main.js:11796`.
- Tekrar: div begin10s dur2s altında p begin0s dur20s Hello içeren TTMLyi orijinal parseSubtitlePayload ile işle.
- Gözlenen: Cue10–30 oldu; kapsayıcı10–12 olduğundan beklenen son12. Native HTTPde aynı sonuç.
- Beklenen: Çocuk görünür aktif aralığı ebeveyn kapsayıcı aktif aralığının dışına çıkmamalı.
- Etki: Altyazı kapandığı sahneden18saniye sonra bile görünür; senkron ve çeviri sahne bağlamı bozulur.
- Kök: Parent context yalnız başlangıç offseti ve sunum taşır; ebeveyn end/dur aktif sınırı hesaplanıp childa uygulanmıyor.
- Çağrı yolu: Ağ body parseSubtitlePayload→parseXml→storeBrowserTrack→overlay/saved subtitle. Native response200/validXML→aynı parser zinciri koştu.
- Önceki kapsam: R304 ebeveyn offset birikimini inceledi; bu end/dur clipping farklı invariant. Önceki78de yok.
- Sınır: Özel TTML profillerinin tamamı test edilmedi; W3C zaman-kapsama semantiğinin küçük fixtureı.
- Birincil referans: [W3C TTML1 zamanlama](https://www.w3.org/TR/ttml1/#timing-attribute-timeContainer).

## HB06 · P2 — TTML statik metinle karışık zamanlı span tüm paragraf boyunca erken gösteriliyor

- Kaynak: `src/browser-subtitles.js:1407`, `src/browser-subtitles.js:1411`, `src/browser-subtitles.js:1422`, `src/main.js:11796`.
- Tekrar: p begin0/end10 içinde Static metni ve span begin5/end10 Late metni ver. Orijinal TTML parserını çalıştır.
- Gözlenen: 0–10 tek cue Static Late çıktı; Late 0–5 arasında5saniye erken.
- Beklenen: 0–5 Static;5–10 Static Late görünmeli veya eşdeğer zaman katmanları korunmalı.
- Etki: Paragraf içi paint-on/karaoke konuşması zamansız açığa çıkar; sahne sırası ve zaman eşlemesi bozulur.
- Kök: outsideText varsa fastpath inner metnin tamamını tek paragraph intervalinde çıkarıp timedSpans döngüsünü atlıyor.
- Çağrı yolu: Browser ağ TTML ve kullanıcı dosyası parseSubtitlePayload→parseXml; native HTTP aynı üretim parserını doğruladı.
- Önceki kapsam: R492 namespace span/br temizliği farklı; R815-B40 VTT inline timestamp başka parser ve sözdizimi. Önceki78de yok.
- Sınır: W3C statik anonim span+zamanlı child semantiğiyle karşılaştırıldı; fiziksel video yanında çizim değil, üretilen cue zamanları doğrulandı.
- Birincil referans: [W3C TTML1 zamanlama](https://www.w3.org/TR/ttml1/#timing-attribute-timeContainer).

## HB07 · P2 — Geçerli TTML sequential ve örtük başlangıçlı paragraflar tamamen düşüyor

- Kaynak: `src/browser-subtitles.js:1383`, `src/browser-subtitles.js:1397`, `src/browser-subtitles.js:1464`, `src/main.js:11796`.
- Tekrar: div timeContainer=seq içinde p dur2 First ve p dur3 Second (begin alanları olmadan) olan TTMLyi işle.
- Gözlenen: cues[] ve format boş; beklenen First0–2,Second2–5. Native XML parserErrors0 ve HTTP200.
- Beklenen: TTML seq kapsayıcıda begin yazılmayan çocukların başlangıcı önceki kardeş bitişinden türetilmeli.
- Etki: Tamamen geçerli bir timed-text dosyası altyazı yok gibi kaybolur.
- Kök: parseXml açık start/begin/t olmadan startnull bırakıyor; yalnız startnonnull satırı push ediyor. timeContainer seq/kardeş cursoru da hiç hesaplanmıyor.
- Çağrı yolu: Browser response parseSubtitlePayload→parseXml. W3C TTML1 timeContainer seq ve Pop-On Captions örneği aynı yapı/mekanizmayı tanımlar.
- Önceki kapsam: HB05 açık başlangıçlı cue ebeveyn end clipping; HB06 mixed span flattening. Bu seq/implicit temporal cursor kökü. Önceki78de yok.
- Sınır: Tek bug sayıldı: örtük begin düşmesi ve seq scheduling ayrı bug diye şişirilmedi. Profile/fps/SMPTE kapsamı denenmedi.
- Birincil referans: [W3C TTML1 zamanlama](https://www.w3.org/TR/ttml1/#timing-attribute-timeContainer).

## HB08 · P2 — İçerik adresli altyazı varlığı geçerli JSON içeriği bozulunca hashini doğrulamadan kabul ediyor

- Kaynak: `src/browser-asset-store.js:121`, `src/browser-asset-store.js:151`, `src/browser-asset-store.js:156`, `src/browser-asset-store.js:165`.
- Tekrar: putTrack ile Hello cue kaydet; dosyanın yalnız cues[0].text alanını Jello yapıp geçerli JSON/assetIdyi koru; getTrack(originalAssetId) çağır.
- Gözlenen: ok:true/Jello döndü; eski sağlam SRT de otomatik Jello içeriğiyle yeniden yazıldı. AssetId değişmedi.
- Beklenen: İçerik adresi ile kanonik meta/cues hashinin uyuşmazlığı saptanmalı; bozulmuş kanonik JSON sağlam diye kabul edilmemeli.
- Etki: Yedek/kopyalama/disk bozulması geçerli JSON olarak kaldığında altyazı ve türetilmiş SRT sessizce değişir; içerik kimliği yanlış metni işaret eder.
- Kök: getTrack yalnız version ve payload.assetId stringinin parametreye eşitliğini kontrol eder; putTrackte hesaplanan contentHash yeniden hesaplanmaz. Sonra JSON kanonik sayılıp mevcut SRT üzerine yazılır.
- Çağrı yolu: restorePersistedBrowserTracks main9898 ve session export collector getTrack kullanır; mevcut iyi SRTyi content-address id doğrulaması yapmadan onarır.
- Önceki kapsam: R25-B5 eski JSON/SRT atomik mismatch köküydü ve SRTyi kanonik JSONdan onarma giderildi. Bu ayrı içerik hash doğrulaması eksikliği; önceki78de yok.
- Sınır: Disk bozulması sentetik tek alan değişimiyle canlandırıldı; gerçek disk bozulma sıklığı veya kötü amaçlı dosya sistemine karşı güvenlik garantisi iddia edilmez.

## Kanıt/yeniden üretim ve sınırlar

`probe.cjs` üretim modüllerini değiştirmeden çalıştırır; `results.json`8gözlem ve4kaynak hashini tutar. `native-network.cjs` Windows Electron43.5.0/izoleprofil/localhost kullanır; `native-network-result.json`5XMLresponse ve2karşıkontrol içerir. Bütün XMLler200veDOMParser parserErrors0 verdi; bu XMLwellformedness, DASH/TTMLtamşema kabulü değildir. Flat DASH pozitif kontrol gerçekcaptureDashSegments ile2cue vecomplete:true verdi. Native overlay gerçekCSSwritingMode vertical-rl→boş dönüşünü ölçtü.

```powershell
node .tmp/hundred815-browser/probe.cjs ae0a61a7b42c58d78bb7317680cf8f8133d5e027
Start-Process -FilePath "D:\Whisper Local\node_modules\electron\dist\electron.exe" -ArgumentList '"D:\Whisper Local\.tmp\hundred815-browser\native-network.cjs"' -WorkingDirectory "D:\Whisper Local" -WindowStyle Hidden -PassThru
```

Native PIDler2968ve10732 kendi pencere/sunucularını kapattı; süreç varlığı ayrıca kontrol edildi. Script hata olsa da JSON yazar; başarı yalnız exitkodundan çıkarılmadı, observations/error ve beklenen değerler report.cjs içinde assert edildi. Sentetik cue değiştirme/üzerine yazma yalnız bu dizinin fixture dosyalarında yapıldı.

Tam uygulama renderer/main E2E, start.bat/install.bat, gerçeksite/hesap/DRM/GPU/ücretliAPI, fiziksel ses/ekran görüntüsü, fullnpm/CI yapılmadı. NativeHTTPmainparser harnessi kişisel browserprofiline dokunmadı. Dış kod kopyalanmadı/yeni bağımlılık yok. Bütün bulgular düzeltilmeden açık bırakıldı.
