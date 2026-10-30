# R815 — Az incelenmiş yerel motor/API yaşam döngüleri

Kaynak tabanı **db65f2e7f6e7b50649c440cb183cb88863ebf241**, dal `codex/audit815-unseen`. Ürün/test/Git/docs değişikliği yok; yalnız bu geçici kanıt klasörü yazıldı. Dört yeni doğrulanmış P2 aday; düzeltme yapılmadı.

## Kanıtın sınırı ve tekrar çalıştırma

Repo kökünden çalıştır. Probe konumu taşınabilir; varsayılan çıktılar process.cwd()/.tmp/unseen815-engines. R815_ENGINE_OUT ile ayrı çıktı klasörü seçilebilir. Torrent fixture klasörleri fs.mkdtempSync ile benzersizdir. Engine hash kontrolü yalnız nonexecutable stub için VM crypto facade ile bypass edilir; bu gerçek engine bütünlük doğrulaması değildir. net/fetch/spawn hiçbir gerçek bağlantı/child oluşturmaz.

```powershell
node .tmp/unseen815-engines/torrent-probe.cjs
node .tmp/unseen815-engines/snapshot-probe.cjs
node --check .tmp/unseen815-engines/torrent-probe.cjs
node --check .tmp/unseen815-engines/snapshot-probe.cjs
```

İki probe exit0; assertion’lar mevcut hatalı davranışı ve karşı kontrolleri doğrular. Tam npm suite/start.bat, gerçek rqbit/mpv, FFmpeg/GPU inference veya kişisel E2E yapılmadı. Gerçek GPUInfo denemesi ortam engelidir, bug değildir.

## Kapsam matrisi

|Kaynak|Aile/yeni uç|Önceki registry ilişkisi|
|---|---|---|
|src/media-torrents.js|UE01 / seçim transaction rollback: HTTP503 sonrası mevcut job alias mutasyonu ve sonraki pause kalıcılığı|Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.|
|src/media-torrents.js|UE02 / eşzamanlı seçim transaction: Aynı hash, farklı dosya; iki in-flight play ve lost update|Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.|
|src/media-torrents.js|UE03 / engine startup–quit sahipliği: Port tahsisi await sürerken close/before-quit; kapanıştan sonra spawn|Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.|
|src/renderer/renderer.js|UE04 / native snapshot tüketicisi: API sonrası Image.decode await sırasında kaynak/generation değişmesi|N0361–N0380/F19 iş kuyruğu ayar dondurma; native Image.decode sahipliği aynı senaryo değildir.|
|src/native-player.js|Native komut ve temp screenshot ömrü: B77 tekrar sayılmadı; snapshot consumer downstream sahipliği UE04|Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.|
|src/gpu-diagnostics.js|GPUInfo gerçek ortam kontrolü: Ayrı sentetik Electron profiliyle gerçek gözlem sandbox Mojo AccessDenied nedeniyle engellendi|Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.|

## UE01 — Başarısız torrent dosya seçimi mevcut job nesnesine ve sonra diske sızıyor (P2)

Kaynak: `src/media-torrents.js:88`, `src/media-torrents.js:89`, `src/media-torrents.js:97`.

**Tekrar:** node .tmp/unseen815-engines/torrent-probe.cjs — ilk dosyayı başarıyla play; ikinci play update_only_files yanıtı503; status; başarılı pause; ikinci dosyaya reopen.

**Beklenen:** Başarısız seçim önceki onaylı seçimleri değiştirmemeli; başka pause işlemi başarısız seçimi kalıcılaştırmamalı.

**Gözlenen:** İlk disk [0];503 dönen ikinci seçimden sonra status.selections [0,1] iken disk hâlâ [0]. İlgisiz başarılı pause diske [0,1] yazıyor; başarısız dosya için reopen ok:true.

**Kök:** jobs.get(hash).selections doğrudan yeniden kullanılıp await öncesi push ediliyor; sağlayıcı reddinde rollback/kopya yok.

**Etki:** UI hata gösterdiği hâlde dosya önceden seçilmiş sayılıyor; sonraki işlem başarısız değişikliği kalıcılaştırıyor ve reopen yetkilendiriyor.

**Karşı kontrol:** İlk başarılı play diskte yalnız [0]; hatadan hemen sonra disk [0]. Kalıcı sızıntı sonraki pause ile somut.

**Kanıt:** torrent-results.json#/findings/UE01

**Önceki kayıt ilişkisi:** B25 skip-range başarısız dosya yazımında bellek değişimiyle aynı genel transaction ilkesi; farklı ürün durumu/API ve kök: burada sağlayıcı HTTP reddi öncesi mevcut torrent selections dizisine alias. UE02 ile aynı değildir: tek akışta hata rollback eksikliği.

**Sınır:** Gerçek registerMediaTorrents handler ve gerçek sentetik JSON dosyası kullanıldı. HTTP/spawn/net kontrollü. Gerçek rqbit’in503 öncesi yan etkisinin olmadığı veya gerçek torrent indirildiği iddia edilmez.


## UE02 — Aynı torrentte eşzamanlı iki dosya seçimi bir seçimi kaybediyor (P2)

Kaynak: `src/media-torrents.js:87`, `src/media-torrents.js:88`, `src/media-torrents.js:91`, `src/renderer/media-hub-ui.js:54`.

**Tekrar:** Aynı preview token için index0 ve index1 play çağrılarını paralel başlat; iki update_only_files isteğini aynı bariyerde bekletip birlikte tamamlat. Aynısını ardışık kontrol olarak çalıştır.

**Beklenen:** İki başarılı farklı seçim kümülatif [0,1] olmalı veya çakışan istek açıkça reddedilmeli.

**Gözlenen:** İki play ok:true ve ayrı stream URL döndürüyor; iki API update gövdesi [0] ile [1], kalıcı job yalnız bir seçim içeriyor. Ardışık kontrol [0,1].

**Kök:** Hash başına kilit/birleştirme yok; iki akış boş job durumunu ayrı okuyup kendi selections dizisini oluşturuyor, son jobs.set öncekinin başarılı seçimini eziyor.

**Etki:** Kullanıcının başarılı sandığı dosya seçimi kütüphaneden ve motorun istenen only_files kümesinden düşüyor; tekrar açma/yerel dosya doğrulama geçmişi eksiliyor.

**Karşı kontrol:** Ardışık iki play [0,1] yazar. UI yalnız tıklanan düğmeyi devre dışı bırakır (media-hub-ui.js8); farklı dosyaların düğmeleri ortak kilit taşımaz (54).

**Kanıt:** torrent-results.json#/findings/UE02

**Önceki kayıt ilişkisi:** Önceki103 içinde torrent seçim concurrency kaydı yok. UE01 ile farklı: bütün HTTP yanıtları başarılı; sorun failure rollback değil lost-update.

**Sınır:** Gerçek handler ve disk; scheduler kontrollü API bariyeriyle deterministik. Gerçek rqbit/peer/scheduler performansı veya indirme davranışı ölçülmedi.


## UE03 — Bekleyen torrent motor başlangıcı close/quit sonrasında yeni süreç başlatabiliyor (P2)

Kaynak: `src/media-torrents.js:33`, `src/media-torrents.js:38`, `src/media-torrents.js:105`, `src/media-torrents.js:106`, `src/native-player.js:83`.

**Tekrar:** Preview motoru başlatırken yerel port tahsisini beklet. proc henüznull iken service.close veya before-quit çalıştır. Portu serbest bırak; spawn ve preview sonucunu gözle. Karşı kontrolde önce başlayan motoru close et.

**Beklenen:** Kapanış başladıktan sonra bekleyen startup iptal edilmeli veya kapanış yeni oluşan motoru sahiplenip durdurmalı.

**Gözlenen:** Her iki kapanış yolunda kapanış anı spawned0/killed0; bariyer sonrası spawned1/killed0 ve preview ok:true. Önceden başlamış motoru kapatma karşı kontrolü spawned1/killed1.

**Kök:** close/before-quit yalnız o andaki proc?.kill çağrısını yapıyor; starting promise için closed/epoch/cancel durumu yok, port await sonrası spawn devam ediyor.

**Etki:** Kapanış sırasında yeni torrent motoru başlatılabilir ve o kapanış çağrısı tarafından durdurulmaz. Uygulama başka asenkron kapanışı bekliyorsa kaynak/transfer ömrü kapanış isteğini aşar.

**Karşı kontrol:** Başlangıç tamamlandıktan sonraki close fake child kill1 verir; hata sadece proc oluşmadan önceki startup penceresinde. before-quit senaryosu başka listener’ın preventDefault ile kapanışı tuttuğu durumu kapsar; native-player.js83–87 üretimde bu davranışı içerir.

**Kanıt:** torrent-results.json#/findings/UE03

**Önceki kayıt ilişkisi:** R762 native-player teardown ve B103 ses oynatıcısı close sahipliği tarihsel benzer yaşam döngüleridir; burada farklı servis ve faz: bekleyen rqbit port/start promise, henüz proc yok. B31 spawn error veya B77 komut sonucu değildir.

**Sınır:** Child process yalnız EventEmitter stub; gerçek süreç, swarm veya gerçek uygulama quit çalıştırılmadı. İşletim sistemi uygulama kapandıktan sonra kesin yetim süreç bırakır iddiası yok; kanıt kapanış talebinden sonra spawn ve kill eksikliğidir.


## UE04 — Native kare çözülürken video değişirse eski kare yeni videonun altyazısı ve adıyla kaydediliyor (P2)

Kaynak: `src/renderer/renderer.js:20619`, `src/renderer/renderer.js:20620`, `src/renderer/renderer.js:20635`, `src/renderer/renderer.js:20667`.

**Tekrar:** Original capturePlayerFrame fonksiyonunu çalıştır; snapshot A sonucunu döndür; Image.decode promise beklerken mediaKey/generation/cues/currentTime değerleriniB’ye geçir; decode tamamlat.

**Beklenen:** Kaynak değişirse capture iptal edilmeli veya A karesi A altyazısı/kimliğiyle bütünlüklü kaydedilmeli.

**Gözlenen:** drawImage SOURCE_A kullanıyor; fillText Subtitle B; saveImage.suggestedName synthetic_B_45s.png. API yanıtından önce değişen kaynak kontrolünde hiç save yok; sabit kaynak A/A/12s tutarlı.

**Kök:** key/generation yalnız snapshot API await sonrası denetleniyor; sonraki await Image.decode tamamlandığında sahiplik yeniden denetlenmeden canlı player altyazısı/kimliği okunuyor.

**Etki:** Dışa aktarılan görsel eski videonun karesini başka videonun altyazısı ve dosya kimliğiyle birleştiriyor; yanlış sahne kanıtı oluşuyor.

**Karşı kontrol:** Sabit kaynak kaydı A/A; API yanıtından önce değişim save0. Yalnız decode sırasında değişim save1 ve A/B karışımı.

**Kanıt:** snapshot-results.json

**Önceki kayıt ilişkisi:** B18 PDF/MHTML save-dialog sırasında belge snapshotı ve B24 browser kırpılmış video geometrisinden farklı tüketici/faz: native snapshot PNG decode await. B77 native komut hatası değildir.

**Sınır:** Gerçek capturePlayerFrame metni değişmeden VM’de çalıştı. Image.decode bariyeri, canvas ve API kontrollü; gerçek mpv screenshot PNG pikseli, FFmpeg, fiziksel ekran veya Electron E2E çalıştırıldığı iddia edilmez.

## Bug sayılmayanlar

- **UE-X-GPU:** Gerçek Electron GPUInfo ayrı sentetik profilde Mojo platform_channel AccessDenied ile başlayamadı. Sadece bilinen kendi electron PID28564 kapatıldı. GPU fallback yanlış sınıflama iddiası için gerçek adapter kanıtı yok; bug sayılmaz.
- **UE-X-AUDIO:** Native track aid ile Whisper audioTrack seçimlerinin senkronu statik olarak şüpheli; ürünün ayrı ses izi seçim sözleşmesi ve gerçek tüketici kanıtı tamamlanmadı. Bug sayılmaz.

## Ayrı geliştirme önerileri

- **UE-G01 — Torrent hash başına işlem kuyruğu ve commit sonrası state değişimi:** Seçim kaybını ve başarısız API mutasyonunun kütüphaneye sızmasını önler. Kabul ölçütü: Aynı hash iki farklı play [0,1] ile sonuçlanır; HTTP503 sonrası RAM/disk eski state ile aynı kalır.
- **UE-G02 — Torrent motoru için kapanış durum makinesi:** Kapanış sırasında yeni engine doğmasını ve sahipliği belirsiz çocuk süreçleri engeller. Kabul ölçütü: Port tahsisi/healthcheck dahil her startup await noktasında close sonrası spawn0 veya doğrulanmış kill; before-quit aynı kapanış promise’ini bekler.
- **UE-G03 — Native kare işini kaynak kimliği ve altyazı snapshotıyla dondurma:** Kaydedilen kare ve metnin aynı medya anına ait olmasını sağlar. Kabul ölçütü: Snapshot API ve decode await sırasında kaynak değişimleri save0; sabit kaynak kare/metin/isim aynı kimlikten gelir.

## Kaynak SHA256

- `src/media-torrents.js`: `a6447f3320fa5dd14969358df6eeccf4fd51791069725a1dc1f053aed9953041`
- `src/native-player.js`: `f45125fce23922f55bb4f13d87216a8797ae41b1cdafec5446d94bd8de39c6d7`
- `src/gpu-diagnostics.js`: `78afb006160e10b0e23e6f474c0a4d11af601c9540beb4e4525f4e3164b675df`
- `src/renderer/renderer.js`: `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`
- `src/renderer/media-hub-ui.js`: `cc951bd28f49e7ac74b8f8069e91ce170a8368e2fbe2da816ec2a011213ca167`
- `src/main.js`: `93f0b76d0f463599bea346e9e0b4fd2714ab2bfa4b0bd9c265e94e02908a514b`
- `src/fsync-utils.js`: `7bdc3c1ebc7bfa349fdb2f092590e308865c787d0e89668b551997c3c5f744c9`
- `src/settings-security.js`: `e7c83df14a93def06a3e72f110a6e5048de233f3980dfd46714fda847a5bfa2d`
- `src/catalog-discovery.js`: `75679d276303888bfb35d6748c20bd0e25ae3f3d5c1e8df84fdb42e0547bdbfa`

Registry/önceki mapping kimlikleri ve tüm senaryo kaynak eşlemeleri findings.json içindedir. Problar gerçek ürün modülünü/fonksiyonunu okur; ürün kaynağına test enjeksiyon export’u veya edit yapılmaz.
