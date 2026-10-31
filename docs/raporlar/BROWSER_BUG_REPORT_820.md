# Rapor 820 — Yeni işlevsel sınırlar; yalnız rapor

31 Ekim 2026. **Tasarım kapsam dışı. Üç yeni doğrulanmış P2 bug; hiçbir düzeltme uygulanmadı.** Öneriler, eski kayıtlar ve kanıtlanmamış adaylar bug toplamına katılmadı. R815/R817/R818/R819 sayıları değiştirilmedi.

Taban **`f7e5f7156260e451496895f067bed73e15587b90`**; başlangıç `master`, çalışma dalı `codex/functional-audit820`. Üç alt ajan **GPT‑6.1 Sol / medium**: otomasyon kayıtları; oturum/izin/webRequest yaşam döngüsü; medya/katalog dosya işlemleri. Ana ajan altyazı kaydırmayı inceledi ve ajan kanıtlarını bağımsız yeniden çalıştırdı. Tasarım/tema/yerleşim incelemesi veya düzeltmesi yapılmadı.

AGENTS, YENI-BILGISAYAR, güncel devir ve [Night1000 kapsamı](../audits/deepseek-night1000-20261027/README.md) ile ilgili senaryo imzaları önceden incelendi. “Henüz bakılmamış” ifadesi bu tur **aşağıdaki özgül bileşim/invariantların önceki kanıtlarda bulunmaması** anlamındadır; dosyaların tarihte hiç okunmadığı iddia edilmez. Aynı modüllerin geçmiş genel PASS kayıtları yeni bug veya güncel kabul diye sayılmadı. [R815 düzeltme durumu](evidence815/remediation-2026-10-31/README.md) kontrol edildi; eski 133 onarım ve açık B63 yeni keşif sayılmadı.

## Sonuç tablosu

| ID | Öncelik | Yeni doğrulanan işlevsel sınır | Etki |
|---|---|---|---|
| F820-01 | P2 | Gerçek `subs:shift` dosyaya cue başlığını kaydırıp WebVTT satır içi zamanlarını eski eksende bırakıyor | Geçerli kelime zamanlı VTT, başarılı işlemden sonra kendi cue aralığı dışındaki zaman etiketlerini içeriyor |
| F820-02 | P2 | İçe aktarma doğrulayıcısının kabul ettiği null workflow/adım, başlangıç normalizasyonunu kesiyor | Geçerli kayıt da yüklenmiyor; sonraki UI/model/provider ayarlarının geri yüklemesi sessizce atlanıyor |
| F820-03 | P2 | Metadata scheduler ile gerçek tamamlayıcının eksiklik ölçütleri uyuşmuyor | Yalnız türü eksik kayıt normal yenileme ve açık retry'da sıfır iş/istekle atlanıyor |

[Makine okunur manifest](evidence820/manifest.json) kaynak/kanıt SHA256, tam taban, geçmiş kapsam ve tekrarlama kayıtlarını bağlar. Aşağıdaki PASS ifadeleri hatanın **mevcut olduğunu ve karşı kontrollerin çalıştığını** gösterir; hata düzeldi demek değildir.

## F820-01 — VTT kaydırma kelime zamanlarını geride bırakıyor

**Kaynak:** [main.js:20546](../../src/main.js#L20546) `shiftTimecodes`; [main.js:20593](../../src/main.js#L20593) `subs:shift` gerçek yetkilendirme/okuma/yedek/atomik yazma handler'ı.

**Tekrar:** Sentetik UTF-8 `.vtt` dosyası:

```vtt
WEBVTT

cue1
00:00:05.000 --> 00:00:09.000
First <00:00:06.000>second <00:00:08.000>third.
```

Gerçek preload → `window.api.shiftSubs(file,10)` → ana süreç IPC → kontrollü dosya erişim onayı → dosya yazma. **Yanıt `ok:true`**, `.bak` orijinali birebir koruyor; yeni dosyada cue **15–19 saniye**, iç zamanlar hâlâ **6 ve 8**. Beklenen iç zamanlar **16 ve18**. [Kanıt sonucu](evidence820/shift/result.json), [tekrar betiği](evidence820/shift/probe.cjs).

**Beklenen/gözlenen:** Satır içi WebVTT zamanları cue başlangıcından büyük, bitişinden küçük olmalıdır; W3C bu etiketleri ilgili metnin etkinleştiği mutlak zaman olarak tanımlar. Kaydırma önce geçerli olan bu ilişkiyi bozuyor. [WebVTT cue timestamp tanımı](https://www.w3.org/TR/webvtt1/#webvtt-cue-timestamp). Kaynak konuşma metni silinmedi; oynatıcının yanlış/uygunsuz etiketleri tam olarak nasıl sunacağı bu tur fiziksel oynatma ile ölçülmedi. Dosya zaman sözleşmesinin bozulması ve başarı yanıtı doğrudan kanıtlandı.

**Kök:** Fonksiyon yalnız `-->` içeren zaman satırını tanıyor; gövde içindeki `<hh:mm:ss.mmm>` etiketlerine aynı offset'i uygulamıyor. Bu VTT çıktısına görünüm eklemek veya tasarım tercihi değil, mevcut zaman kaydırma aracının dosya doğruluğu sorunudur.

**Karşı kontroller:** Offset0 orijinali korudu. Düz SRT +10 doğru15–19 oldu. VTT yedeği orijinalle aynı. Gerçek ana süreç yetkilendirme ve atomik writer kullanıldı; kullanıcı dosyası kullanılmadı.

**Önceki kapsam/dedup:** R302 `subs-shift-accuracy` başlık ms/CRLF/negatif clamp/VTT ayarlarını sınar; mevcut12 kontrol geçti, fakat payload inline timestamp yok. R815-B40 çeviri boru hattında inline etiketin konuşma olarak alınmasıydı ve düzeltildi; bu ayrı tüketici `subs:shift` dosya dönüşümüdür. Aynı kökün farklı offsetleri ayrı sayılmadı. Yeni sınır cue başlığı ve inline etkinleşme zamanının birlikte dönüşümüdür.

**Kabul ölçütü:** Pozitif/negatif offsette cue başlığı ve iç etkinleşme zamanları tutarlı kaymalı; aralık dışına düşen/clamp edilen etiketlerin ne yapılacağı açık ve geçerli olmalı. SRT düz metin, VTT voice/class/ayarlar ve yedek korunmalı. Bu davranış uygulanmadı.

## F820-02 — Kabul edilen workflow verisi sonraki açılışta diğer ayarları atlatıyor

**Kaynak:** [settings-security.js:400](../../src/settings-security.js#L400) genel yapı/boyut doğrulaması ve554–557 workflow alanı; [browser-workflow-recorder.js:32](../../src/browser-workflow-recorder.js#L32),76–95 normalizer; [renderer.js:3904](../../src/renderer/renderer.js#L3904) startup workflow yüklemesi;3933–3950 sonraki UI/provider/preset geri yükleme ve boş catch. Gerçek import tüketicisi [main.js:20065](../../src/main.js#L20065) `parseImportText` sonucunu kullanır.

**Tetikleyici:** Yapısal JSON ayar yedeği içinde `browserWorkflows:[validWorkflow,null]` veya bir kaydın `steps:[validStep,null]` olması. Bu **bozuk/elle düzenlenmiş iç veri** gerektirir; olağan recorder'ın null ürettiği veya her geçerli yedeğin bozuk olduğu iddia edilmez. Ürün doğrulayıcısı bu veriyi reddetmeden kabul ettiği için hata dosya sınırında yakalanmıyor.

**Doğrulama1 — gerçek parser ve başlangıç kodu:** `parseImportText → sanitizeSettings → normalizeWorkflowLibrary` ve renderer'ın eksiksiz başlangıç try/catch bloğu, değiştirilmeden VM'de kontrollü adaptörlerle çalıştırıldı. İki bozuk girdi de parserAccepted:true. İlki `null.steps`, ikincisi `null.command` TypeError. Geçerli workflow bile atanmadı; `applyUiSettings` çağrısı0, provider halkası başlangıcı0. Geçerli ve bilinmeyen-komut kontrollerinde sırasıyla1 UI/2 provider başlangıcı ve sağlam workflow kaldı. [Dört senaryo](evidence820/workflows/results.json), [prob](evidence820/workflows/probe.cjs). Null kayıt ve null adım aynı eksik nested-shape doğrulama kökü, **tek bug**.

**Doğrulama2 — gerçek Windows açılışı:** Ana ajan ayrı sentetik userData `settings.json` dosyasına kabul edilen yapı ile `ui.beamSize:"3", model:"tiny"` yazıp gerçek uygulamayı açtı. Main `loadSettings` hâlâ beamSize3/null workflow döndürüyor; renderer'da **beamSize5 (varsayılan), workflow sayısı0**. Yalnız null'u çıkartan karşı kontrol aynı uygulamada **beamSize3, workflow sayısı1**. [Bozuk başlangıç](evidence820/startup/invalid-result.json), [geçerli karşı kontrol](evidence820/startup/valid-result.json), [Electron probu](evidence820/startup/probe.cjs). İki süreç de exit0.

**Kök/etki:** Generic yapı/boyut doğrulaması derin workflow/adım tipini kabul ediyor; normalizer null'a tolerans göstermiyor. Çağrı, bütün ayar geri yüklemesinin broad try/catch'i içinde ve sonraki ayarlardan önce; catch sessiz. Uygulama süreci çökmedi, disk ayarları silinmedi. **UI'nin sonraki ayarları uygulamaması** gerçek açılışla, provider başlangıcının atlanması unchanged startup VM ile kanıtlandı. Gerçek provider anahtarı veya canlı sağlayıcı kullanılmadı.

**Önceki kapsam/dedup:** R83-B10/R84/R85 playback `normalizeContext(null)` kökü başka üretici/tüketiciydi; burada import/library/startup sınırı var. R46 timeout/stale executor, R815-B125 metin bütçesi ve settings undo geçmişi yeniden sayılmadı. F50 ayar/atomik kalıcılık geçmişi nested-null workflow sonrası unrelated startup devamını kanıtlamıyordu.

**Kabul ölçütü:** İçe aktarma, kaydetmeden önce bozuk workflow/adımı açıklanabilir biçimde reddetmeli veya bozuk öğeyi izole ederek geçerli kayıtları ve diğer ayarları geri yüklemeli. Gerçek startup ve import karşı kontrolleri gerekir; sessiz broad catch'e dayanılmamalı. Bu onarım uygulanmadı.

## F820-03 — Yalnız türü eksik katalog kaydı yenilemeden dışlanıyor

**Kaynak:** [catalog-metadata-sync.js:19](../../src/catalog-metadata-sync.js#L19) `missing` predicate;29 iş seçimi. [catalog-extensions.js:24](../../src/catalog-extensions.js#L24) `metadata-complete-missing` completeness kapısı; [media-home.js:457](../../src/renderer/media-home.js#L457),464 normal/retry UI bağlantıları.

**Tetikleyici:** Kayıtlı TMDB kimliği, mevcut poster dosyası, özet, yönetmen ve süre var; **`genres:[]`**. Schedulerın kontrol ettiği diğer alanlar dolu. Ana sayfa/ayar akışındaki eksik bilgileri yenile veya açık yeniden deneme çağrısını çalıştır.

**Gözlenen:** Gerçek store + `createMetadataSync` normal start ve retry **total0/updated0**, sağlayıcı isteği **0**, tür boş kalıyor. Aynı kayda aynı gerçek `metadata-complete-missing` tamamlayıcısı doğrudan verilince **tek kontrollü ayrıntı isteği**, kalıcı tür **Drama**. Dolu kayıt tamamlayıcıda `skipped:true` ve ek istek yok. Özet boşaltılmış karşı kontrol scheduler üzerinden **total1/updated1** çalışıyor. [Ölçüm](evidence820/mediafiles/results.json), [prob](evidence820/mediafiles/probe.cjs).

**Kök:** Scheduler eksikliği poster/özet/yönetmen/süre ile ölçüyor, `genres` yok. Gerçek completion kapısı ise bunlara ek **genres.length** istiyor. Dolayısıyla düzeltilebilen kayıt işçiye hiç giremiyor; retry yalnız zaman önbelleğini aşar, eksiklik filtresini aşamaz. [R536](BROWSER_BUG_REPORT_536.md) otomatik metadata tamamlama sözleşmesini ve tür alanını tanımlar; özellik isteği değil mevcut iki katmanın uyuşmazlığıdır.

**Etki ve sınır:** Tür etiketleri ve tür tabanlı katalog filtre/tercih verisi eksik kalır. Diğer metadatanın kaybolması veya tüm TMDB'nin çalışmaması iddia edilmez. Sağlayıcı yanıtı gerçek anahtarsız sentetik fetch sınırıydı; gerçek ağ/model başarısı değildir. Gerçek store dosyası ve gerçek completion consumer ile yazma doğrulandı; native UI tıklaması bu tur çalıştırılmadı, UI→IPC→sync bağlantısı kaynakta izlendi.

**Önceki kapsam:** F37 N0721–N0740 geçmiş metadata test/probları, özellikle N0735 list/list/save tekrar girişini sınar; genres-only admission/retry kombinasyonu değildi. R536/R539/R542 özellik/onarımları ve R815 mapping ile karşılaştırıldı; aynı kök bulunmadı. Tür ve oyuncu eksikliklerini ayrı buglar diye çoğaltmadık; bu tur genres-only kaydı doğrulandı.

**Kabul ölçütü:** Scheduler ve completion aynı completeness sözleşmesini kullanmalı. Genres-only kayıtta normal/retry türü tamamlamalı, tam dolu kayıtta fetch olmamalı; mevcut veriyi ezmeme ve stop/rate/auth davranışı korunmalı. Hiçbir değişiklik uygulanmadı.

## Kapsam kaydı ve sıfır bulgulu alan

| Alan | Gerçek kontrol | Sonuç |
|---|---|---|
| Oturum/izin/webRequest | Mux header birleştirme/callback once, unsubscribe sahipliği; opaque origin; mixed camera/mic; explicit ask; session mirror reset; site clear origin sınırı | **7/7 kontrol**, yeni bug0. [Prob](evidence820/sessions/probe.cjs), [sonuç](evidence820/sessions/results.json), [80 geçmiş imza](evidence820/sessions/registry-reviewed.json). Tüm browser'ın hatasızlığı iddiası değil. |
| Otomasyon | Kabul edilmiş null iç veri ve gerçek startup devamı |1 yeni kök; R30/R46 timeout/stale/fallback ve R815-B125 dışlandı.|
| Medya dosyası envanteri | Bağımsız CUE/M3U importer bulunmadı; browser-chapters, folder/metadata, gerçek katalog/store ve probe yolları incelendi |1 yeni scheduler kökü. Scanner tip/derinlik R42-B167–169, reparse/junction R30-B53, önceki font/torrent/download kökleri yeniden sayılmadı.|
| Ana ajan altyazı aracı | Gerçek IPC/disk/VTT inline etiket bileşimi, offset0/SRT/backup kontrolleri |1 yeni kök.|

Session alanında R42-B126/B127, R31-B86, R46-32, R51-07/R53, R83-35/R78-07/R87, R73-Y7 eski kökleri dışlandı. Sadece owner cache teorisi, açık sitenin temizlik sonrası kendi verisini yeniden yazabilmesi gibi kanıtlanmamış adaylar bug sayılmadı. Müzik analizi hedefi, tasarım incelemesi veya yedek kapsamını büyüten yeni özellik eklenmedi. Ayrı yeni geliştirme önerisi toplamı oluşturulmadı; kabul ölçütleri mevcut buglara aittir.

## Tekrar ve kontroller

Problar yeni sentetik çıktı dizini kullanır; `AUDIT820_OUT` ile **ayrı, boş** çıktı kökü seçilebilir. Kişisel settings/medya/profil kullanmayın.

```powershell
node docs/raporlar/evidence820/workflows/probe.cjs
node docs/raporlar/evidence820/mediafiles/probe.cjs
node docs/raporlar/evidence820/sessions/probe.cjs
& ./node_modules/electron/dist/electron.exe docs/raporlar/evidence820/shift/probe.cjs
& ./node_modules/electron/dist/electron.exe docs/raporlar/evidence820/startup/probe.cjs
& ./node_modules/electron/dist/electron.exe docs/raporlar/evidence820/startup/probe.cjs --valid
```

Ana ajan yayımlanacak üç Node probunu ve iki Electron betiğinin üç koşusunu bağımsız tekrar çalıştırdı: hepsi **exit0**. Beş CJS `node --check` geçti. Mevcut `node tests/subs-shift-accuracy.test.js` **12 kontrol geçti**. İki test dosyasını standart `node --test` ile ilk çalıştırma sandbox worker spawn **EPERM** nedeniyle başlamadı; `--test-isolation=none` ile tekrar çalıştı: workflow dosyasının **8 iç kontrolü**, metadata'nın **5 testi**, toplam Node runner **6/6** geçti. Test içeriği/eşik değiştirilmedi. Bu PASS'ler yeni bileşimlerin kapsandığı veya bugların düzeldiği anlamına gelmez.

Gerçek Windows disk/SQLite değil JSON store ve gerçek Electron başlangıç/IPC kanıtları var. SQLite bu tur gerekmedi. Windows yolları/UTF-8 ve start.bat/install.bat kaynak akışları gözden geçirildi; normal start.bat açılışı/temiz kurulum, gerçek dosya seçici (onay sınırı kontrollü), fiziksel video/ses/GPU/CUDA/DRM, gerçek site/hesap/LLM/TMDB ve tüm ürün entegrasyonu doğrulanmadı. Tam npm/backend paketi/CI sonucu çalıştırılmadı veya beklenmedi; testler kapatılmadı. Sırlar ve kullanıcı profili/logları yayımlanmadı; yalnız sentetik sonuçlar ve tekrar betikleri eklendi. Ürün dosyalarında düzeltme yok.
