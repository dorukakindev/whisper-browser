# R815 canlı ASR yeni entegrasyon sınırları

HEAD `6a789329d96c4f97cdc17bd9518df0b540b13444`. Yalnız rapor, ürün değişmedi. İki P2 kök parent tarafından bağımsız tekrarlandı; ana eşlemede B123–B124.

Komut: `node .tmp/next815-liveasr/probe.cjs`. Çıktı varsayılan `.tmp/next815-liveasr/result/result.json`; bağımsız tekrar için `R815_LIVEASR_OUT` ortam değişkeni. Exact HEAD ve yedi kaynak SHA256 sonuçta.

## LA01 — P2 — Canlı ASR yeniden başlatıldığında cue kimlik çakışması önceki farklı zamanlı konuşmayı siliyor

**Kaynak:** src/main.js:9648-9649, src/main.js:9667, src/main.js:9682, src/main.js:10093-10101, src/browser-subtitles.js:223-239.

**Tekrar:** Aynı sekme/video/acquisition için gerçek startBrowserLiveAsr ile oturum1 başlat; backend protokolünden Merhaba@10–11 ve Devam@20–21 segmentlerini ilet. Gerçek stopBrowserLiveAsr ve süreç close olayını işlet; videoda geriye sarılmış konumdan aynı acquisition üzerinde yeni oturum başlat. Yeni oturum ilk segmenti Merhaba@0–1 olsun; gerçek storeBrowserTrack ve mergeBrowserStreamCues tamponunu incele.

**Beklenen:** 0–1,10–11,20–21 farklı zamanlı üç cue korunmalı; yeni oturum eski ayrı repliğin revizyonu değildir.

**Gözlenen:** `{"sessions":["session-1","session-2"],"streamKey":"live-asr:7:stable-acquisition","before":[{"id":"live-0","start":10,"end":11,"text":"Merhaba"},{"id":"live-1","start":20,"end":21,"text":"Devam"}],"after":[{"id":"live-0","start":0,"end":1,"text":"Merhaba"},{"id":"live-1","start":20,"end":21,"text":"Devam"}],"countercontrolDistinctCueId":[{"id":"live-2","start":0,"end":1,"text":"Merhaba"},{"id":"live-0","start":10,"end":11,"text":"Merhaba"},{"id":"live-1","start":20,"end":21,"text":"Devam"}]}`

**Kök:** streamKey acquisition düzeyinde sabit; job.nextCueId her startta0. İki ayrı oturum live-0 kullanır. Geriye zamanlı cue genel merge yoluna girince kimlik+metin eşleşmesi önceki live-0@10 kaydını revizyon sanarak siler.

**Etki:** Aynı videoyu durdurup yeniden canlı yazıya çevirme ve geri sarma sonrasında daha önce yakalanan gerçek konuşma birikmiş altyazı tamponundan kaybolur. Bu kanıt, aynı kimlik ve aynı metnin geriye zamanlı yeni oturumda tekrarlanmasıyla sınırlıdır; ileri zamanlı hızlı yolda bu silme iddia edilmez.

**Önceki kapsam:** R815 önceki118 listesinde yok. F20 N0390 kaynak değişimi worklet hız/saatini; N0395 yeniden giriş tek worklet flush/sync ve monitor rewarn kontrolünü yapar. Main ASR session→stream/cue identity entegrasyonu yok. Genel merge fonksiyonunun sağlayıcı revizyonu temizleme davranışı bilinen ve amaçlı; hata yeni oturumun aynı identity alanını yeniden kullanmasıdır.

**Sınır:** Gerçek main başlangıç/consumer/stop, storeBrowserTrack ve merge çalıştı. Python süreç ve segmentler protokol fixture; modelin böyle döküm ürettiği, final SRT diski veya native playback kabulü iddia edilmez.

**Kabul:** Aynı acquisition üstünde iki stop/start oturumunda cue kimlikleri çakışmamalı veya oturum izleri ayrılmalı. Geriye sarılmış yeni oturum aynı metni farklı zamanda üretince eski cue korunmalı; aynı oturum gerçek sağlayıcı cue revizyonu güncellenmeye devam etmeli.

## LA02 — P2 — Worklet modülü yüklenirken biten sistem sesi izi sonrasında etkin oturum olarak kalıyor

**Kaynak:** src/renderer/renderer.js:11602-11609, src/renderer/renderer.js:11648-11655.

**Tekrar:** Gerçek startBrowserLiveAsrCapture başlat; audioWorklet.addModule yanıtını kısa beklet. Paylaşılan audio track henüz ended listener kurulmadan doğal olarak ended durumuna geçsin. Modül yüklemesini tamamla; production start fonksiyonunu ve mikro görevleri bitir.

**Beklenen:** Zaten ended ses izi yeniden etkin capture gibi bağlanmamalı; capture/context/stream temizlenip scoped backend stop çağrılmalı.

**Gözlenen:** `{"observed":{"trackReadyState":"ended","active":true,"captureRetained":true,"nodes":1,"backendStops":0},"countercontrolEndAfterListener":{"active":false,"backendStops":1,"trackStopped":true}}`

**Kök:** ended listener addModule await sonrasında kuruluyor; track.readyState başlangıçta ve await sonrasında denetlenmiyor. EventTarget geçmiş ended olayını yeni dinleyiciye tekrar iletmez.

**Etki:** Kullanıcı Windows paylaşımını ilk modül yüklemesi sırasında kapatırsa ses yakalama bitmiş olmasına rağmen active=true ve model oturumu açık kalır; yeni konuşma gelmez. Kullanıcı manuel durdurabilir.

**Önceki kapsam:** R815 önceki118 listesinde yok. R648 module-load iptal testi uygulama Stop akışını sınar; trackin await penceresinde doğal ended olmasını kapsamaz. F20 N0392 yalnız worklet process([]) kanal kaybını sınar; MediaStreamTrack listener penceresi yok.

**Sınır:** Gerçek renderer fonksiyonları VMde; AudioContext/track EventTarget sınırı kontrollü. Gerçek getDisplayMedia veya Windows paylaşım paneli açılmadı. End sonrası listener kurulumunun geçmiş olayı replay etmemesi browser event sözleşmesini temsil eder. Bağlanan ended trackin native ek davranışı ayrıca ölçülmedi.

**Kabul:** Modül beklemesinden önce veya beklerken ended olan track captureı aktif bırakmamalı; ended listener sonrası olağan stop davranışı korunmalı. Backend scoped stop bir kez, tracks/context kapalı ve active=false olmalı.

## Kapsam matrisi

Registry F20 yirmi ID/mekanizma/imzanın tamamı findings.json coverage.historicalF20 içinde korundu. N0381–N0400 yeniden yeni test diye sayılmadı. Özellikle N0390/N0395 ile LA01, N0392 ve R648 ile LA02 bağımsız invariantlar yukarıda açıklanır. Worklet ve realtime monitor SHA256ları tarihsel registry ile birebir aynı. Native paylaşım/model/gerçek ses ve disk persistence kalan sınırlar.

## Dışlananlar ve öneriler

Standart worklet/RTF mekanizmaları ve mevcut G26 tekrar sayılmadı. Blob/IPC keyfi başarısızlığı somut ürün hatası yapılmadı. İlk child git EPERM ortam engeliydi, ürün hatası değil. Ayrı yeni öneri yok.
