# Tur 5 — 150 maddenin tamamının doğrulama sonucu

Tarih: 2026-09-04. İnceleme başlangıcı: `8474647`; önceki ilk paket: `34f17c8 → 8474647`.
Kaynak: kullanıcının `911f99d1-158b-41d5-90c5-d9e59488dcf3/pasted-text.txt` eki (BUG-241–390).
Bu belge ilk paket raporunun kalan 134 ID listesinin yerini alır. Hiçbir ID inceleme dışında bırakılmadı.

## Sonuç ve kapsam

- **Ö: 9 madde.**
- **D: 60 madde.**
- **R: 51 madde.**
- **M: 5 madde.**
- **Z: 21 madde.**
- **E: 4 madde.**

**D:** Bu turda doğrulanan yol düzeltildi veya gerçek eksik için koruma eklendi. **Ö:** Önceki ilk pakette düzeltildi, bu tur testleri yeniden çalıştırıldı. **E:** Bug değil, yararlı kullanım/erişilebilirlik eklemesi uygulandı. **Z:** Güncel kodda koruma zaten var. **R:** Raporun iddiası güncel kaynakta doğrulanmadı, tekrar/yanlış varsayım/tasarım tercihi; gereksiz davranış değişikliği yapılmadı. **M:** Kaynak incelemesi yapıldı ama gerçek cihaz/oturum olmadan kanıtlanamıyor; düzeltilmiş sayılmadı.

ID sayısı bağımsız bug sayısı değildir: 252/296, 263/284, 266/355, 268/352/353, 347/348, 362/369 gibi tekrarlar var. D satırlarının bazısı sınırlı hardening/uyarı iyileştirmesidir; hepsine kritik güvenlik açığı etiketi konulmadı.

## Kanıt ve test yaklaşımı

- Dosya adları + fonksiyon/olay isimleri aşağıda verilmiştir; eski rapordaki satır numaraları değiştiğinden semboller esas alınır.
- `tests/audit-tur5.test.js`: gerçek renderer fonksiyonları VM'de; kapanış timer'ları, no-op undo, filtre temizliği, metadata ve kullanıcı edit koruması, belirsiz bölge yedeği, ham liste round-trip, kayıtlı cümle/kelime göçü, finite seek.
- `tests/audit-tur5-main.test.js`: gerçek main fonksiyonları/IPC'leri; geciken A/B debugger attach sırası, lazy restore/kapalı sekme, SQLite/JSON yazım hata enjeksiyonu, görsel kapısı, offset sınırı, ffprobe timeout/taşma/geç close, bildirim throttle, reset sıralaması, site temizleme sırasında sekme değiştirme, partial sonucu, sınırlı günlük.
- `backend/test_transcribe.py`: gerçek parser ve transcribe döngüsü, sahte motor/exception; NaN/Inf segmentlerin atlanması ve finally cleanup. Nihai indirme yolu, remux seçeneği, strict JSON, sıfır güven, CPS=0, Unicode dedupe ve mevcut PCM testleri.
- Tam `npm test` çalıştırılır; yalnız source-regex testlerinin geçmesi gerçek Electron testi yerine sunulmaz. Node sözdizimi, Python compile ve diff whitespace kontrolü ayrıca yapılır.
- Gerçek kullanıcı verisi, cookie/token/API anahtarı okunmadı; API isteği, gerçek medya indirmesi, GPU modeli ve Electron/DRM oturumu çalıştırılmadı. Hulu yakalamanın veya monitörler arası DPI'nin düzeldiği iddia edilmiyor.

## Tam karar defteri

| BUG | Karar | Kaynak / ulaşılabilir yol | Kanıt, düzeltme veya gerekçe |
| --- | --- | --- | --- |
| 241 | Ö | `backend/media.py:download` | Nihai post-hook/filepath kullanılıyor; başlığı benzeyen dosya seçilmez. |
| 242 | Ö | `backend/media.py:download` | Bileşen requested_downloads başarı yolu kaldırıldı. Her merge hatasının yutulduğu iddiası değil, yanlış dosya seçimi doğrulandı. |
| 243 | D | `backend/media.py:download_clip` | MP4 remux eklendi; klipte de yalnız nihai hook/filepath kabul edilir. |
| 244 | D | `src/main.js:library:remove` | Not/kelime içeren medya satırı korunur. Kütüphaneden kaldırmak öğrenme verisini CASCADE ile silmez. |
| 245 | D | `src/main.js:resumeRestoredBrowserPage` | Seçilen boş sekme kayıtlı adresi bir kez yükler; kapanmış/başka adrese geçmiş görünüm yüklenmez. Gerçek DRM yüklemesi ayrıca sınanmalı. |
| 246 | R | `src/main.js:upsertWatchItem` | subtitlePaths keşfedilmiş dosyaların birleşimidir; UI'daki altyazıyı gizleme dosyayı kütüphaneden silme işlemi değildir. Eksik patch alanının silme niyeti olduğu gösterilmedi. |
| 247 | R | `src/main.js:upsertWatchItem` | Senkron read/modify/write arasında await yok; raporun iki IPC'nin iç içe geçmesi senaryosu bu yolda oluşmaz. |
| 248 | D | `src/main.js:upsertWatchItem/saveWatchLibrary` | 128 KiB girdi ve 256 KiB kayıt sınırı; başarısız disk yazımı başarı sayılmaz, cache ancak yazım sonrası değişir. |
| 249 | M | `src/main.js:installYoutubeStreamHeaders; backend/media.py:download_clip` | Başlık kancası progressive isteği de kapsıyor; raporda gerçek 403 yanıtı yok. Süresi dolmuş URL, CDN ve cookie davranışı oturum/ağ testi gerektirir. |
| 250 | R | `src/main.js:shell:openPath` | Yetkili geçerli çağrı string hata/boş string sözleşmesinde. Yetkisiz IPC reddi başka sözleşmedir; beş farklı başarı tipi iddiası doğrulanmadı. |
| 251 | D | `src/renderer/renderer.js:subtitleModeMenu keydown` | Ok/Home/End gezinmesi, varsayılan olayın durdurulması eklendi. |
| 252 | Z | `src/renderer/renderer.js:setupRovingTablists` | defaultPrevented kısa devresi mevcut; 296 ile aynı kök. |
| 253 | E | `src/renderer/renderer.js:timelineCanvas keydown` | Yukarı/aşağı seçim, sağ/sol zaman kaydırma, Enter oynatma noktasına gitme eklendi. |
| 254 | Ö | `src/renderer/renderer.js:playerSeek input` | Süre/oran finite doğrulaması; canlı yayında Infinity currentTime ataması önlendi. |
| 255 | D | `src/renderer/renderer.js:renderCue, seeking/seeked` | Seek sürerken otomatik duraklatma çalışmaz; seek sınırında önceki zaman sıfırlanır. |
| 256 | D | `src/renderer/renderer.js:resetMediaBoundState` | lastT sıfırlanır; yeni videoda eski geçiş hesabı kullanılmaz. |
| 257 | D | `src/renderer/renderer.js:bindHoldToSpeed/applyPlaybackLearningPolicy` | Geçici basılı-tut hızında öğrenme politikası askıda; blur/kapanış/kaynak değişiminde hız geri alınır. |
| 258 | R | `src/renderer/index.html:subOffset; renderer.js:nudgeOffset` | Kontrol ve nudge -10/+10 sınırında. 24 saat üstü slider iddiası geçersiz; ayrı IPC sınırı 278'de ele alındı. |
| 259 | D | `src/renderer/renderer.js:restoreLocalSubtitleWorkspace` | Offset etiketi yenilenir; geri yüklenen dosya seçeneklerinin yeniden eklenmesini engelleyen eski dolu liste de temizlendi. |
| 260 | D | `src/renderer/renderer.js:browserCommand/openCueEditor/key/pointer handlers` | Elle oynat/duraklat/seek ve düzenleme, bekleyen shadow-resume'u iptal eder. Web sayfasının kendi düğmelerinin bütün senaryoları gerçek oturum testi ister. |
| 261 | D | `src/renderer/renderer.js:video play/pause/emptied` | Oynat/duraklat simgesi ve aria-label gerçek medya durumuyla güncellenir. |
| 262 | D | `src/renderer/renderer.js:playerSeek pointer/timeupdate` | Sürükleme sırasında periyodik güncelleme slider değerini ezmez; bırakma/iptal/blur kilidi açar. |
| 263 | D | `src/renderer/renderer.js:restoreWatchProfile` | learningBaseRate kayıtlı oynatma hızıyla eşitlenir. |
| 264 | D | `src/renderer/renderer.js:subSize handlers` | CSS değişkenine ek olarak px yazan çakışan listener kaldırıldı. |
| 265 | R | `backend/transcribe.py:parse_timecode/srt_time_to_seconds` | 190:30 uzun dakika biçimi olarak geçerlidir; uzun süre tek başına hata değildir. Sonlu/negatif denetimleri mevcut. |
| 266 | Ö | `backend/transcribe.py:write_json` | Strict JSON ve sonlu metadata; bozuk zamanlarda atomik yazıcı eski dosyayı korur. |
| 267 | Ö | `backend/transcribe.py:_wrap_whisperx_segment` | Sıfır probability/score korunur; None varsayılanla ayrılır. end=0<start gibi geçersiz aralıklar 268'de elenir. |
| 268 | D | `backend/transcribe.py:transcribe segment/chunk loop` | None/NaN/Inf/ters/negatif zamanlı motor kayıtları yazıcılara ulaşmadan elenir. Yazıcıda sahte 0 zaman üretmiyoruz. |
| 269 | D | `backend/transcribe.py:translation_char_budget` | CPS kapalıyken modele sıfır karakter bütçesi yerine kaynak uzunluğunu gözeten pozitif bütçe verilir. |
| 270 | R | `backend/transcribe.py:_ass_escape` | ASS override için süslü parantez gerekir ve bunlar kaçırılıyor. Yalnız ters eğik çizginin varlığı override enjeksiyonu kanıtı değildir. |
| 271 | R | `src/renderer/renderer.js:setSubtitleModeMenuOpen` | Dışarı tıklanınca odak tıklanan kontrole gider; her kapanışta toggle'a zorla taşımak doğru değildir. Menü içinde odak varsa dönüş mevcut. |
| 272 | D | `src/renderer/renderer.js:setShortcutHelpOpen` | Açılışta kapatma düğmesi odaklanır, kapanışta önceki odak geri gelir. |
| 273 | D | `src/renderer/renderer.js:renderBrowserPlaces` | Etkin sekme tabindex=0, diğerleri -1 olarak yenilenir. |
| 274 | D | `src/main.js:media:findSiblingSubs` | canonicalLocalPath uygulanır; göreli/özel yol biçimleri reddedilir. Kullanıcının seçtiği tüm diskleri keyfi yasaklamadık. |
| 275 | D | `src/main.js:scanMediaFromPaths` | Kanonik yol doğrulaması ve ziyaret edilmiş dizin koruması eklendi; mevcut derinlik/sonuç sınırları korunur. |
| 276 | D | `src/main.js:media:saveImage` | 24 MiB data URL sınırı, sıkı base64 öneki ve PNG imzası; geçersiz veri kaydetme diyaloğundan önce reddedilir. |
| 277 | D | `src/main.js:appendSubtitleEditLog` | Dosya başına 4 MiB, toplam 64 MiB/1000 günlük sınırı; eski günlükler silinmez. Günlük hatası başarılı altyazı yazımını başarısız göstermiyor; uyarı dönüyor. |
| 278 | D | `src/main.js:subs:shift` | Sonlu sayı ve ±24 saat sınırı; sınır dışı giriş dosyaya dokunmaz. |
| 279 | R | `src/main.js:process close/error handlers` | Promise ikinci resolve'u zaten yok sayar. Sırf iki resolve bulunması ayrı bir yarış/bozulma kanıtı değildir; ffprobe kapanışı ayrıca 280'de tekilleştirildi. |
| 280 | D | `src/main.js:media:probeTracks` | 30 saniye timeout, 4 MiB çıktı sınırı, süreç sonlandırma ve tek finish kapısı. |
| 281 | D | `src/main.js:browser:liveAsr:chunk` | PCM16 için 9 saniyelik 288000 byte ve çift-byte sınırı; base64 üst sınırı buna uyumlu. |
| 282 | Z | `src/renderer/renderer.js:resetMediaBoundState` | cueQualitySource=[] zaten mevcut. |
| 283 | R | `src/renderer/renderer.js:subtitleModeMenu` | Gerçek DOM focus kullanan menüde aria-activedescendant zorunlu ikinci yöntem değildir. |
| 284 | D | `src/renderer/renderer.js:restoreWatchProfile` | 263 ile aynı sorun. Yapay change olayı yerine eksik öğrenme hızı doğrudan eşitlenir. |
| 285 | D | `src/renderer/index.html:wordInspector` | Programatik odak için tabindex=-1 eklendi. |
| 286 | D | `src/renderer/renderer.js:showWordInspector/hideWordInspector` | Açılış odağı ve önceki kontrole güvenli dönüş eklendi. |
| 287 | D | `src/renderer/index.html:shortcutHelp; renderer.js:setShortcutHelpOpen` | Diyalog rolü, açık kapatma düğmesi, klavye kapanışı/odak kontrolü eklendi. Ekran okuyucuyla canlı doğrulama yapılmadı. |
| 288 | Z | `src/main.js:loadQueueState; src/queue-persistence.js:normalizeQueueSnapshot` | Başlangıçta eski running, gerçek activeQueueItemId yoksa kurtarılıyor. job-recovery testleri bu yolu kapsıyor. |
| 289 | Z | `src/browser-subtitles.js:normalizeCues/parseSubtitlePayload` | Sonlu zaman ve geçerli metin normalizasyonu var; raporda bu kapıyı geçen girdi verilmemiş. |
| 290 | R | `src/preload.js:getFilePath; renderer drop handler` | webUtils hatası yakalanır, boş sonuç filtrelenir. Exception'ın tüm renderer'ı düşürdüğü yol gösterilmedi. |
| 291 | R | `src/renderer/renderer.js:loadLearningAnnotations` | Başka yüklenen izle eşleşmeyen kalıcı kaydı saklamak veri kaybı değildir; güncel iz sayacı 341'de düzeltildi. |
| 292 | Z | `src/renderer/renderer.js:renderCueList` | Sayfa anahtarı arama ve filtre durumunu içerir; değişince pagination sıfırlanır. |
| 293 | M | `src/renderer/renderer.js:notifyDone` | document.hasFocus kontrolü mevcut. Windows focus/bildirim davranışını bozan somut olay sırası verilmedi; gerçek pencere testi olmadan hata sayılmadı. |
| 294 | Z | `src/main.js:dialog:openVideo` | MEDIA_EXTS ortak filtre mevcut; Tur 4 testi de doğruluyor. |
| 295 | D | `src/main.js:queue:saveSync; preload.js; renderer.js:beforeunload` | Kapanış kuyruk kaydı senkron IPC ile onaylanır; normal akış debounce kullanır. Gönderici doğrulaması/terminal guard korunur. |
| 296 | Z | `src/renderer/renderer.js:setupRovingTablists` | 252 ile aynı; defaultPrevented koruması mevcut. |
| 297 | R | `src/renderer/renderer.js:notifyDone` | Her çağrıda IPC listener eklemiyor; bildirim metodunu çağırıyor. Listener leak iddiası farklı kavramları karıştırıyor. |
| 298 | D | `src/browser-place-url.js:tracking` | ref_.* ve ref desenleri eklendi; ref_src/ref_url da kalıcı adresten temizlenir, navigasyon adresi değiştirilmez. |
| 299 | R | `src/browser-place-url.js:safePlaceUrl` | Desteklenen #/route?query ayrımı çalışıyor. Tanınmayan fragmentin atılması kasıtlı veri minimizasyonu. |
| 300 | Z | `src/main.js:safeBrowserBounds` | Dışarıda kalan x/y ve geçersiz alan reddedilir; sıfır görünüm kabulü iddiası güncel koda uymuyor. |
| 301 | R | `src/main.js:safeTranslationEndpoint` | Kullanıcının ayarladığı yerel OpenAI-uyumlu sağlayıcı destekleniyor. Manga dış URL indirme güvenliğiyle aynı sınır değildir; yerel sağlayıcıları bozacak engel eklenmedi. |
| 302 | Z | `src/main.js:requestBrowserSentenceTranslationAtEndpoint` | 20 saniyelik AbortController fetch ve sınırlı gövde okumasını kapsar; finally daha sonra çalışır. |
| 303 | R | `src/subtitle-sentence-layout.js:assembleCueSentences` | Tek cue içinde çok cümle destekleniyor; testler var. Hatalı beklenen/gerçek çıktısı olmayan 'edge case' ifadesi tek başına bug değil. |
| 304 | Z | `backend/transcribe.py:translate_cache_key` | Önbellek anahtarında NFC zaten var; cleanText'te bulunmaması anahtar uyumsuzluğu kanıtı değil. |
| 305 | D | `backend/transcribe.py:_norm_for_dedupe` | NFC ve kıvrık/angle tırnak normalizasyonu eklendi. |
| 306 | Z | `backend/transcribe.py:parse_ass` | Events varsayılan alanları mevcut. Geçerli Events bölümü olmayan belgeyi geçerli ASS gibi kabul etmek gerekmiyor. |
| 307 | R | `backend/transcribe.py:compute_quality_report` | Sıfır süreyi 0.001 ile sınırlayıp yüksek CPS raporlamak bölme hatasını gizlemez; doğrudan sıfıra bölme yok. |
| 308 | R | `backend/transcribe.py:set_language_conventions` | Uygulama her işi ayrı Python sürecinde çalıştırıyor; aynı globali eşzamanlı farklı transkripsiyonların değiştirdiği yol yok. |
| 309 | R | `backend/transcribe.py:merge_resumed_words/read_checkpoint` | Checkpoint girdisi finite doğrulamasından geçiyor; rapordaki or 0 kodu güncel değil. Motor tarafı None/NaN 268'de ele alındı. |
| 310 | Z | `backend/transcribe.py:_flush_chunk/transcribe` | None chunk sınırları ana döngüde segment.start/end ile tamamlanıyor; ardından offset uygulanıyor. |
| 311 | M | `backend/transcribe.py:transcribe finally` | Kısa temp kökü ve sabit iç dosya adları kullanılıyor; silinemeyen dizin uyarısı mevcut. Windows kilit/uzun yol senaryosu gerçek cihaz testi gerektirir. |
| 312 | R | `backend/transcribe.py:checkpoint_resume_from` | min([candidate, *crossing_starts]) hiçbir zaman boş listeye uygulanmaz. |
| 313 | R | `backend/transcribe.py:merge_short_entries` | -0.15 <= gap koşulu büyük negatif aralığı reddeder; rapor eşitsizliği ters yorumlamış. |
| 314 | R | `backend/transcribe.py:merge_incomplete_sentences` | -0.05 <= gap aynı şekilde büyük negatif aralığı reddeder. |
| 315 | R | `backend/transcribe.py:_is_false_sentence_end` | Rakamla başlayan ifade yeni cümle olabilir. Somut dilsel karşı örnek olmadan heuristiği tersine çevirmek doğru değil. |
| 316 | R | `src/renderer/renderer.js:mergeLiveCues` | Milisaniye anahtarı SRT hassasiyetiyle uyumlu; raporun alt-ms farkı aynı satır güncellemesiyle ayrıştırılmamış. Metni anahtara eklemek güncellenen canlı satırı çoğaltır. |
| 317 | D | `src/renderer/renderer.js:save/restoreLocalSubtitleWorkspace; save/restoreActiveBrowserTabWorkspace` | Ham cue listeleri ayrı saklanıp geri yüklenir; mod/sekme geçişinde yalnız birleştirilmiş listeye düşülmez. |
| 318 | D | `src/renderer/renderer.js:loadSubtitle` | Altyazı kapatılınca ilgili cuesRaw/cues2Raw da sıfırlanır; toggle eski metni geri getirmez. |
| 319 | D | `src/renderer/renderer.js:cueSearch input` | IME composition sırasında arama/yeniden çizim atlanır. |
| 320 | E | `src/renderer/renderer.js:historySearch input` | 120 ms debounce ve composition koruması eklendi. |
| 321 | Ö | `src/renderer/renderer.js:clearPreview` | Yeni işte eski filtre ve bekleyen arama temizlenir. |
| 322 | D | `src/renderer/renderer.js:renderFinalPreview` | Tekil zaman aralığıyla kullanıcı metni korunur; yeniden bölünen/belirsiz eşleşen düzenleme kopyalanabilir yedekte tutulur. Yalnız odaktaki bitmemiş edit commit edilir. |
| 323 | R | `src/renderer/renderer.js:renderCue` | İkinci altyazı ayrı findCueAt çağrısıyla zaman ekseninden seçiliyor; aynı indeks varsayımı yok. |
| 324 | Z | `src/main.js:applyBrowserOverlayStyleFromPage; renderer.js:overlay-style` | Sürükleme değeri ana süreç stiline birleşir, renderer kontrolüne geri yazılıp kaydedilir. |
| 325 | R | `src/renderer/renderer.js:translationFor/translationsForCues` | Tek sorgu M üzerinde gezer; toplu liste cursor kullanır. Her frame N×M/64M işlem iddiası doğru değil. Daha ileri indeksleme ölçüm olmadan zorunlu hata düzeltmesi sayılmadı. |
| 326 | R | `src/renderer/renderer.js:closePlayer` | Kapanış katmanı gizler, içerik yeniden açılabilsin diye korunur. playerEmpty'yi zorla açmak beklenen davranışı bozabilir. |
| 327 | Ö | `src/renderer/renderer.js:closePlayer` | Shadow ve canlı cue zamanlayıcıları iptal edilir. |
| 328 | R | `src/main.js:hideBrowserView; browser-manga overlay` | Gizlenen WebContents'in manga katmanı tekrar açılma için korunur; kapatılmış sekme ayrı destroy yoluna sahiptir. |
| 329 | Z | `src/main.js:hideBrowserView/startBrowserPolling` | Capture frame kaydı sıfırlanıyor; gösterme/polling yeniden kurulum yoluna sahip. |
| 330 | D | `src/renderer/renderer.js:closeTimeline` | Pointer capture bırakılır; devam eden gerçek hareket kapatılırken dirty/raw state'e işlenir. |
| 331 | Z | `src/renderer/renderer.js:renderSeekMarkers` | Yalnız .seek-marker siliniyor; A-B işaretleri korunur. |
| 332 | Ö | `src/renderer/renderer.js:timelineNudge` | No-op/finite denetimi; gerçek hareket dışında undo oluşturmaz. |
| 333 | R | `src/renderer/renderer.js:timelineSplitCue/translationFor` | Çeviri eşlemesi indeks değil zaman örtüşmesi; kaynak bölmek ikinci iz indekslerini kaydırmaz. |
| 334 | R | `src/renderer/renderer.js:timelineMergeCue/translationFor` | 333 ile aynı bağımsız zaman ekseni. Farklı metin eşleşmesi iddiasına örnek yok. |
| 335 | E | `src/renderer/renderer.js:timelineUndo/timelineRedo` | Redo düğmesi/yığını eklendi; yeni düzenleme redo'yu temizler. |
| 336 | R | `src/renderer/renderer.js:timelineMarkDirty` | Komşu altyazıların örtüşmesi geçerli olabilir, zorla clamp edilmedi. İlgili gerçek sorun olan sıralı indeks önkoşulu, düzenleme sonrası yeniden sıralamayla korundu. |
| 337 | E | `src/renderer/renderer.js:timelineCanvas wheel` | Ctrl+tekerlek yakınlaştırması eklendi; normal tekerlek sayfa kaydırmayı sürdürür. |
| 338 | Z | `src/renderer/renderer.js:resetMediaBoundState` | A-B durum ve render temizliği zaten mevcut. |
| 339 | D | `src/renderer/renderer.js:timelineCanvas pointer handlers` | Undo yalnız ilk gerçek hareketle eklenir; sırf seçim dolu yığının en eski girdisini düşürmez. |
| 340 | R | `src/renderer/renderer.js:timelineWindow/drawTimeline` | Yakınlaştırılmış pencere dışının çizimde kırpılması veriyi silmez. Tüm zaman çizelgesini aynı anda gösterme beklentisi zoom davranışıyla çelişir. |
| 341 | D | `src/renderer/renderer.js:updateCueMeta` | Kayıt sayacı yalnız mevcut cue imzalarıyla eşleşenleri sayar. |
| 342 | R | `src/renderer/styles.css:.cue-card.saved` | Kayıt durumu border-color ile gösteriliyor. Kullanılmayan ::after renk kuralı tek başına görünürlük hatası değil. |
| 343 | D | `src/renderer/renderer.js:commitSegmentEdit` | Normalize edilen metin DOM'a da uygulanır; state/ekran ayrışmaz. |
| 344 | D | `src/renderer/renderer.js:preview search/filter/segment dataset` | Türkçe toLocaleLowerCase('tr') tüm karşılaştırma taraflarında kullanılır. |
| 345 | R | `src/renderer/renderer.js:openHistoryItem/setPlayerSource` | Kayıtlı konuma devam istemi mevcut; her açılışta kullanıcı tercihi olmadan otomatik seek yapılmaması bug sayılmadı. |
| 346 | D | `src/renderer/renderer.js:migrateSavedCueAssociation/saveCueEdit/applyCueEditHistory` | Metin düzenlemesi ve undo/redo, kayıtlı cümle/kelime imzalarını taşır; geç kalan dosya yazımı yeni medyayı ezmez. |
| 347 | D | `src/renderer/renderer.js:migrateTimelineAssociations` | Tekil metnin zaman değişikliğinde kayıt yeni imzaya taşınır. Yinelenen veya bölünen metinde tahmin yerine eski kayıt korunur. |
| 348 | D | `src/renderer/renderer.js:migrateSavedCueAssociation` | 347'nin kelime kartı karşılığı aynı geçişte güncellenir. |
| 349 | R | `src/renderer/renderer.js:clearJobValidation` | describedby ekleme/çıkarma senkron; raporda araya girecek await/olay ya da yinelenme girdisi yok. |
| 350 | Z | `src/main.js:upsertWatchItem` | prefs mevcut değerlerle birleştirilir; raporda adı geçen appliesMangaState bu işlemin kaynağı değil. |
| 351 | R | `src/browser-place-url.js:safePlaceUrl` | 299 ile aynı desteklenen hash-route ayrımı; hassas query temizliği var. |
| 352 | D | `backend/transcribe.py:transcribe` | 268 ile aynı giriş kapısı; NaN/Inf VTT yazıcısına gönderilmez. |
| 353 | D | `backend/transcribe.py:transcribe` | 268 ile aynı giriş kapısı; NaN/Inf ASS yazıcısına gönderilmez. |
| 354 | R | `backend/transcribe.py:write_dual_srt` | Kaynak satırlar zaman örtüşmesiyle birleştiriliyor. Raporda yanlış hesaplayan somut zaman/metin örneği yok; mevcut dual/sentence testleri geçiyor. |
| 355 | Ö | `backend/transcribe.py:write_json` | 266'nın tekrarı; strict/atomik yazım önceki pakette giderildi. |
| 356 | D | `backend/transcribe.py:_load_pcm_waveform_for_pyannote` | Chunk frame bütçesine channels yanında sample_width de dahil edildi. |
| 357 | R | `backend/transcribe.py:_ass_escape` | 270'in tekrarı; süslü parantez kaçışı bulunan kod için override enjeksiyonu kanıtlanmadı. |
| 358 | R | `backend/transcribe.py:_load_pcm_waveform_for_pyannote` | Önceden ayrılmış, sınırlı float32 tampon + küçük parçalar kullanılıyor; torch.from_numpy tamponu paylaşır. İddia edilen tam iki kopya yolu yok. |
| 359 | D | `backend/transcribe.py:transcribe finally` | Model/batched/iterator referansları exception yolunda da bırakılır ve GPU cleanup çağrılır. Fake engine exception testi var; gerçek VRAM ölçümü yapılmadı. |
| 360 | M | `backend/transcribe.py:atomic_text_writer` | Dosya fsync+atomik replace mevcut. Windows'ta dizin fsync'inin yokluğu tek başına tekrar üretilebilir veri kaybı kanıtı değil; güç kesintisi/dayanıklılık ayrı ortam testi. |
| 361 | Z | `src/main.js:transcribe:start chat-file cleanup` | Hazırlık/spawn hata ve süreç error/close yollarında cleanup mevcut; geçici dosya yolu iş kapsamına bağlı. |
| 362 | D | `src/main.js:transcribe:start` | Spawn öncesi ihtiyatlı 30000 komut satırı birimi sınırı ve açıklayıcı hata. |
| 363 | D | `src/main.js:notify` | Gönderici başına üç saniye throttle; yetkisiz gönderici doğrulaması korunur. |
| 364 | R | `src/main.js:browser:liveAsr:chunk` | Burada ayrı encoder işi yok; PCM WAV yazımı var. Sınırsız bloklama iddiasına karşı 281'de tek parça 288 KB ile sınırlandı; küçük sync yazım tasarım tercihi. |
| 365 | Z | `src/main.js:stopBrowserLiveAsr/process close/sweepBrowserLiveAsrTemp` | Job bağından ayrılma, süreç kapanışında chunk cleanup ve startup sweep mevcut. |
| 366 | R | `src/main.js:browser:adapters:openFolder` | Çalışırken plugin hot-reload eksikliği bug değil; yeniden başlatmalı yükleme mevcut. Güvenilir plugin yaşam döngüsünü bu hata turunda keyfi değiştirmedik. |
| 367 | R | `src/main.js:browser:setOccluded` | Diyalog açarken sesin devam etmesi geçerli kullanım; görünümü gizlemek otomatik pause talimatı değildir. |
| 368 | D | `src/main.js:browser:session:reset/browser:show/queueBrowserTabTransition` | Reset ve yeni sekme/gösterme serileştirildi; eski save timer iki sınırda iptal, disk yazımı sonucu denetlenir. |
| 369 | D | `src/main.js:transcribe:start` | 362 ile aynı argv boyut kapısı; hata halinde mevcut cleanup yolu çalışır. |
| 370 | M | `src/main.js:safeBrowserBounds; renderer.js:browserSlotBounds` | CSS/DIP alanları mevcut; monitörler arası DPI taşıma gerçek Electron/Windows testi olmadan doğrulanamaz. |
| 371 | D | `src/main.js:attachBrowserDebugger` | Gerçek yarış doğrulandı: geç kalan A yeni B'yi detach edebiliyordu. WebContents başına deneme sahipliği, current guard ve timeout temizliği eklendi. Enjeksiyon bypass etiketi kanıtlanmadı. |
| 372 | R | `src/main.js:dialog:openVideo; src/local-file-access.js:grant` | Video için grant güvenli no-op; koruma atlama ya da hata üreten bir işlem değil. |
| 373 | D | `src/main.js:browser:places:remove` | Geçersiz liste/adres için açıklayıcı Türkçe hata döner. |
| 374 | Z | `src/main.js:normalizeBrowserPlaces/browser:workspace:open` | Boş/geçersiz sekmeli workspace normalizasyonda eleniyor; added[0] boşluğu ulaşılabilir gösterilmedi. |
| 375 | D | `src/main.js:readBrowserPlaces; renderer.js:loadBrowserPlaces` | Sağlam .bak zaten okunuyor. İkisi de bozuksa kurtarma iddiası yapılmaz, görünür uyarı döner. Bozuk dosyadan kayıp bilgi uydurulmaz. |
| 376 | R | `src/main.js:flushBrowserPlaces` | Başarılı yazımdan sonra hata-bildirildi bayrağını sıfırlamak doğru: sonraki bağımsız hata tekrar bildirilebilmeli. |
| 377 | R | `src/watch-index.js:annotation identity` | Not/çeviri içeriğini ID'ye katmamak düzenlenebilir alanlar için bilinçli; her düzenlemeyi yeni not yapmaz. |
| 378 | D | `src/main.js:library:remove` | SQLite/JSON hata sonucu kullanıcıya döner; transaction rollback ve commit başarısızlığında JSON geri yazımı var. İki depolu güç kesintisi atomikliği iddia edilmiyor. |
| 379 | R | `src/main.js:readBrowserPlaces/setBrowserPlaces` | Dirty cache en yeni kullanıcı değişikliğidir; diskten eski sürümü okumak veri kaybettirir. |
| 380 | D | `src/main.js:browser:session:setRestore` | Persist başarısızsa etkin flag önceki değerine geri alınır, hata döner. |
| 381 | R | `src/main.js:subtitleSearchCache` | 8 MiB sınırın kendisi LRU hatası değil; rapor yanlış tahliye/yanlış sonuç girdisi sunmuyor. |
| 382 | D | `src/main.js:upsertWatchItem` | lastWatched=0 geçerli sonlu değer olarak korunur. |
| 383 | R | `src/main.js:hideBrowserView; renderer.js:closePlayer` | Yakalama tercihini kapatırken silmemek istenen kalıcılık; timer/debugger durdurma ayrı işlem. |
| 384 | Z | `src/main.js:browser:setOverlay; renderer.js:scheduleBrowserOverlaySync` | Çağıran tam mode/style payload gönderiyor; kısmi payload varsayımına dayalı sıfırlanma güncel UI yolunda gösterilmedi. |
| 385 | D | `src/main.js:browser:cookies:clearSite` | İşlem başındaki görünüm+URL tutulur; kullanıcı başka sekmeye geçtiğinde yeni aktif sekme yenilenmez. |
| 386 | R | `src/browser-place-url.js:safePlaceUrl` | 299/351 tekrarı; desteklenmeyen fragmenti saklamamak hata değil. |
| 387 | D | `src/main.js:clearBrowserSiteData; renderer.js:clearBrowserCookieScope` | Kısmi başarı, silinen çerez/hata sayısıyla gösterilir; yalnız storage başarılı olsa da partial doğru hesaplanır. |
| 388 | R | `src/main.js:browserTabSnapshot; renderer.js:scheduleBrowserOverlaySync` | Mode/style genel kalıcı görünüm ayarlarından tam olarak gönderiliyor; per-tab farklı stil sözleşmesi yok. Ayrı özellik isteği olabilir, veri kaybı kanıtı değil. |
| 389 | R | `src/main.js:translation scheduler callbacks` | İptal edilen/eski scheduler'ın tab.translationScheduler ile eşleşmemesi beklenen generation korumasıdır. |
| 390 | R | `src/renderer/renderer.js:updatePlayerAutoSyncState` | Birkaç düğmenin metin/durum güncellemesi tam DOM kurma değildir; rapordaki maliyet iddiası doğrulanmadı. |

## Çalıştırılan doğrulama sonucu

- `npm test`: **50 Node test dosyasının tamamı ve 135/135 Python testi geçti.** Gerçek modüller/fonksiyonlar yanında mevcut sözleşme testleri de çalıştırıldı; bunların hepsi uçtan uca UI testi değildir.
- `node --check`: `src/main.js`, `src/preload.js`, `src/renderer/renderer.js` başarılı.
- `python -m py_compile`: `backend/transcribe.py`, `backend/media.py`, `backend/test_transcribe.py` başarılı.
- `git diff --check`: başarılı.
- Karar defteri: BUG-241–390 aralığında **150 tekil ID, eksik/tekrarlı satır yok**. Sonuç: 60 D + 9 Ö + 4 E + 21 Z + 51 R + 5 M.

## Ek notlar ve kalan doğrulama sınırı

- Zamanlama kopyası SRT içerik üretiyorsa önerilen uzantı da artık **.srt**; ASS/VTT adı altında bozuk SRT yazılmaz. Bu işlem ASS stilini koruyan tam editör dönüşümü değildir.
- Timeline değişimleri cue listesini tekrar sıralar, ham listeyi ve browser overlay'i günceller. Kasıtlı örtüşen diyalogları zorla kesmez.
- Kütüphane silme normal hata yollarında rollback içerir; SQLite ve JSON arasında güç kesintisine dayanıklı tek transaction vaat etmez.
- Önizleme düzenleme yedeği mevcut renderer oturumundadır; “Düzenleme yedeği” ile kopyalanabilir. Yeniden bölünmüş metni yanlış satıra otomatik taşımak yerine kullanıcı kontrolüne bırakır.
- Kayıtlı cümle/kelime göçü yalnız güvenilir eşleşmelerde yapılır. Aynı metnin birkaç yerde tekrarlandığı veya blokların bölündüğü durumda eski kayıt korunur; otomatik bulanık eşleştirme uygulanmaz.
- Elle doğrulama: gerçek Electron'da klavye/IME/focus, hold-speed+seek, yeniden başlatma sonrası seçili DRM sekmesi, Hulu/Discovery altyazı yakalama, Windows bildirim/DPI ve gerçek VRAM. Bunlar için kullanıcı oturumlarını otomatik açmadık ve sonuç uydurmadık.
- Kullanıcıya ait `BUG_REPORT.md` ve `b-search.txt` değiştirilmedi.
