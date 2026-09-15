# BROWSER BUG REPORT 30 — Yeni browser özellikleri + medya kataloğu denetimi

Tarih: 2026-09-15 · Dal: `master` · Tür: statik denetim + üretim koduyla deneysel doğrulama (Electron + node harness)
Kapsam: son eklenen browser özellikleri (workflow kayıt/oynatma, video-analiz paneli, atlama aralıkları, referans medya, OCR, altyazı kodlama önizleme, çeviri iş akışları, komut paleti, mini oynatıcı) ve medya kataloğu özelliği (catalog store/service/extensions/renderer + IPC).

Bu turda 8 paralel denetim ajanı planlandı; çoğu model hız sınırına takıldı, katalog ajanı tam rapor döndürdü. Ajan bulgularının tamamı rapora alınmadan önce satır seviyesinde doğrulandı. Ürün koduna dokunulmadı.

## Doğrulanmış bulgular

### B27 · P2 — Workflow: son adımda iptal, başarı olarak raporlanıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (deneysel):** `.uiprev/browser-audit-30-workflow.cjs` gerçek `BrowserWorkflowPlayer` koduyla koştu. Son adımın `await`'i sırasında `controller.abort()` → `play()` `{ ok: true, completed: 1, total: 1 }` döndürdü. Kontrol: ara adımda iptal doğru şekilde `EWORKFLOW_ABORTED` fırlatıyor.
- **Kök neden:** `src/browser-workflow-recorder.js` `play()` döngüsü iptali yalnızca her adımın **öncesinde** kontrol ediyor; son `await options.execute(...)` çözüldükten sonra tekrar bakmıyor.
- **Etki:** Kullanıcı "İptal"e basmasına rağmen UI "Workflow tamamlandı: 1/1 adım" gösteriyor; iptal edilen komutun yan etkisi (ör. ayar sayfası açılmış) kalıyor. Tek adımlı workflow'larda %100 tekrarlanabilir.

### B28 · P2 — Jenerik aralığı kaydı atlama paneline ulaşmıyor (bayat bellek içi liste) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (deneysel, Electron):** `.uiprev/browser-audit-30/` harness'i değiştirilmemiş üretim modüllerini (`browser-skip-segments.js`, `browser-features.js`, `browser-analysis-tools.js`, `browser-video-analysis.js`) gerçek BrowserWindow'da koşturdu. Sonuç: `VERDICT BUG REPRODUCED`, 10/10 assertion:
  - `skip-save` kalıcı depoya yazıyor (kayıt 1), analiz paneli "kaydedildi" gösteriyor.
  - 2.6 s (>2 tick) sonra atlama paneli hâlâ "kayıtlı aralık yok" gösteriyor, aday düğmesi yok, kayıt sonrası **hiçbir `skip-list` çağrısı yapılmıyor**.
  - Elle "Kayıtları yenile" → kayıt görünüyor, aday düğmesi çıkıyor.
- **Kök neden:** `src/renderer/browser-video-analysis.js` `detectIntro()` kaydı `request('skip-save')` ile yazıyor ama `src/renderer/browser-features.js` içindeki `skipRecords` dizisini güncelleyen bir bildirim/yenileme yok. `tick()` → `decideSkip()` hep bayat diziye bakıyor.
- **Etki:** Kullanıcı "kaydedildi" görüyor ama kayıt ne listede görünüyor ne atlama önerisi üretiyor — manuel yenileme veya bağlam değişimine kadar özellik ölü gibi davranıyor.

### B29 · P3 — Workflow: başarısız adım "tamamlandı" diye raporlanıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (deneysel):** Aynı harness'te `completeSelectedBrowserTranslation`'ın iç hatasını simüle eden kontrollü senaryo → IPC hatası iç `catch`'te yutuluyor, fonksiyon `undefined` dönüyor → `playLastBrowserWorkflow` bunu başarı sayıp `Workflow tamamlandı: 1/1 adım.` mesajını basıyor. Log: `["Workflow çalışıyor: 0/1","Workflow çalışıyor: 1/1","controlled failure","Workflow tamamlandı: 1/1 adım."]`.
- **Kök neden:** `src/renderer/renderer.js` `executeRecordedBrowserWorkflowStep()` delegasyonu; çağrılan komutlar (ör. `completeSelectedBrowserTranslation` ~7720+) kendi IPC hatalarını yakalayıp durum metnine basıyor, player'a geri fırlatmıyor.
- **Etki:** Altyapısal olarak adım başarısızken kullanıcıya tam başarı bildiriliyor; kaydedilmiş iş akışlarının güvenilirliği sorgulanır hale geliyor.

### B30 · P3 — `media-catalog-store` `.bak` dayanıklılığı yok (katalog tek bozuk yazıda ölüyor) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `src/media-catalog-store.js:162` `SyntaxError` → `fail('Katalog dosyası okunamadı; veri korunuyor.')`; `commit()` (167-176) yalnız tmp+rename. Kardeş depo `watch-library-store.js:390-424` `.bak` + fsync + okurken kurtarma yapıyor.
- **Etki:** `media-catalog.json` bir kez bozulursa (disk hatası, antivirüs kilidi, elle karışma) **her** katalog işlemi aynı hatayla başarısız olur; kullanıcı elle dosya onarımı yapana dek katalog tamamen ölü. Watch-library aynı senaryoda kendini iyileştiriyor — tutarsız dayanıklılık standardı.

### B31 · P3 — Yetim dosya birikimi: posterler + geri-yükleme yedekleri [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:**
  - `media-catalog-service.js:82` `remove` → `store().remove` çağırıyor, `posterPath` dosyası silinmiyor.
  - `media-catalog-service.js:97-108` `poster-file` → yeni `catalog-posters/<uuid>.png` yazıyor, eski poster silinmiyor.
  - `catalog-extensions.js:43-49` `metadata-apply` → indirilen poster yazılıyor; `catch` yalnız upsert hatasında **yeni** dosyayı siliyor, eski dosya başarıda da yetim kalıyor.
  - `catalog-extensions.js:99` `package-apply` → her geri yüklemede `before-restore-complete-<ts>.wbp` yedek yazılıyor, hiçbir yerde temizlenmiyor (`workspace-package.js`'teki `before-restore-` yedeğiyle birlikte geri yükleme başına 2 dosya).
- **Etki:** `userData/catalog-posters/` ve `userData/before-restore-*.wbp` sınırsız büyüyor; aynı sınıftaki B9 (çeviri arşivi sızıntısı) ile aynı örüntü.

### B32 · P4 — `list` tüm izleme geçmişini renderer'a gönderiyor + O(items×history) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `media-catalog-service.js:64-65` `watchItems: history` — oturumlar, `subtitlePaths`, tercihler dahil tüm kütüphane her `list` çağrısında paketleniyor; renderer tarafında `state.watchItems` hiç okunmuyor (ölü payload). `progress()` (15-23) her öğe ve bölüm için `history.find` + her karşılaştırmada `canonicalWatchKey` (URL parse) çağırıyor → ~10k öğe × 1k geçmiş satırında milyonlarca parse.
- **Etki:** Katalog büyüdükçe `list` yanıtı şişiyor ve yavaşlıyor; hassas izleme verisi gereksiz yere IPC'ye taşınıyor.

### B33 · P4 — Öğeler arasında bayat `seasonData`/`metadata` görünüyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `media-catalog.js:73` `show(id)` `state.selected`'ı değiştiriyor ama `state.seasonData`/`state.metadata`/`state.metadataResults` temizlenmiyor (temizlik yalnız 216, 379, 389'da). Dizi A'da "Sezonu önizle" → listeye dön → dizi B detayı → 385-390'da **A'nın bölüm listesi** görünüyor.
- **Etki:** Kullanıcı B'nin sayfasında A'nın bölümlerini ve "Bölümleri takvime aktar" düğmesini görüyor. Uygula token-bağlı olduğu için veri A'ya yazılıyor (B bozulmuyor) ama kullanıcı yanlış öğeyi güncellediğini sanıyor.

### B34 · P4 — 100-adım sınırında kayıt, başarılı komutu "çalıştırılamadı" gösteriyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (kod incelemesi):** `browser-workflow-recorder.js` `record()` `MAX_WORKFLOW_STEPS` aşımında hata fırlatıyor; `renderer.js` `executeRecordedBrowserWorkflowStep` çevresindeki `try` bloğu bu hatayı "adım çalıştırılamadı" olarak raporluyor — oysa komut zaten başarıyla çalıştı, yalnız kaydı atlandı.
- **Etki:** 101. adımdan sonra her başarılı eylem hata gibi görünüyor; kayıt zaten doluyken gösterim sessizce atlanmalıydı. Kozmetik ama yanıltıcı.

### B35 · P2 — Bozuk `browser-series-context.json` tüm browser çevirilerini kırıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (zincir):** `browser-series-context.js:52` bozuk JSON → `fail('Dizi bağlamı dosyası okunamadı; veri korunuyor.')` ilk `read()`'de fırlatıyor. `main.js:6246` `config.seriesContext = browserExtras?.translationContext(tab) || null` **korumasız**; `browser:translation:start` handler'ı (`main.js:12669-12682`) `startBrowserTranslation`'ı try/catch'siz doğrudan döndürüyor.
- **Etki:** Dosya bir kez bozulursa (çökme-anı yazma, disk hatası) **her** browser altyazı çevirisi ham IPC hatasıyla başarısız olur; uygulama-içi kurtarma yok, elle dosya silme/onarım gerekir. B30 ile aynı dayanıklılık sınıfı.
- **Öneri:** `try { config.seriesContext = browserExtras?.translationContext(tab) || null } catch { config.seriesContext = null }`.

### B36 · P3 — Sekme geneli `cancel` diğer panellerin işlerini de öldürüyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-feature-services.js:76-77` `key.startsWith(`${tab.id}:`)` — `cancel` eylemi sekmenin **tüm** işlerini abort ediyor. Panellerin `busy` bayrakları ayrı (`browser-features.js:7/32`, `browser-analysis-tools.js:38-58`, `browser-dialogue.js:13`, `browser-series-context.js:8`) → farklı panellerde eşzamanlı işler mümkün.
- **Etki:** Analiz panelinde "İşlemi durdur" → aynı sekmede süren `scenes`/`reference-waveform`/OCR işi sessizce ölüyor ve `encoding-apply` token'ı siliniyor; öldürülen iş `{ok:false, stale:true}` dönüp yanıltıcı "Video değişti" mesajı gösteriyor. Sekme-bazlı panik durdurma tasarım olabilir ama çapraz-panel etki ve hata etiketi hatalı.
- **Ek not:** `previewAt()` (`browser-analysis-tools.js:124`) ve `backgroundSkips` (`browser-features.js:235-240`) `busy` kilitlerini tamamen atlıyor.

### B37 · P3 — `alignment-preview` referans altyazıyı ham UTF-8 okuyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-feature-services.js:171` `fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')` — `decodeSubtitleBuffer` yerine düz okuma. cp1254 referans dosyada Türkçe karakterler U+FFFD oluyor.
- **Etki:** Bozulmuş cue metinleri eşleştirme kalitesini düşürüyor/bozuyor; CLAUDE.md'de belgelenen `subs:shift` hatasının aynısı. `ass-load` (:207) doğru çözücüyü kullanıyor — tutarsızlık.

### B38 · P3 — `browser-alignment.align` subprocess'inde zaman aşımı yok [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-alignment.js:28-79` — spawn'da yalnız abort dinleyicisi; kardeş çalıştırıcıların (video-analysis, reference-media, media-tools) hepsinde timeout var, burada yok.
- **Etki:** Takılan/aşırı büyük bir eşleme (10k×10k cue tavanına kadar) kullanıcı iptaline veya sekme kapanışına kadar sürer; `hasJobs()` bu sırada `canRestore`'u kilitler.

### B39 · P3 — UUID altyazı dosyaları hiç süpürülmüyor + atomik olmayan yazımlar [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-subtitle-files.js:15,23` süpürge/indeks yalnız `^web-.*\.srt$` desenli; `subtitle-download` (`:265-267`) ve `encoding-apply` (`:131`) aynı dizine `<uuid>.<ext>` yazıyor → kalıcı sınırsız birikim (≤2 MB/dosya).
- **Ek:** :131 ve :267 doğrudan `writeFileSync` (tmp+rename yok) — yazma ortasında çökme yarım yetkili altyazı dosyası bırakıyor.
- **Etki:** `userData/browser-subtitles/` süpürge dışı dosyalarla büyüyor; B9/B31 ile aynı disk-sızıntısı örüntüsü.

### B40 · P3 — `skip-save`/`skip-list` medyayı sessizce başka diziye bağlıyor (veya çözüyor) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `skip-save` :284 `associate(identity); save()` geçerli kayıttan sonra **koşulsuz**; `keys()` :47-49 alan değerinden `seriesKey` türetiyor, `associate()` :56-59 `seriesKey` boşsa bağlamayı **siliyor**. `skip-list` :272 de `seriesName` string geldiğinde okuma eyleminde yazıyor.
- **Etki:** Medya-kapsamlı atlama kaydı kaydederken alanda düzenlenmiş/boş bir dizi adı varsa medya sessizce başka diziye taşınıyor veya bağlantısı kopuyor; mevcut dizi-kapsamlı kayıtlar `visibleRecords` filtresiyle görünmez oluyor (veri kaybolmuyor ama sürpriz yeniden bağlanma). `linkSeries`'in tasarlanmış bağlama yolu dışında görünmez bir yan etki.

### B41 · P4 (spekülatif) — `skip-save` sahiplik kontrolü normalize edilmemiş id ile yapılıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** :277 `existing` araması ham `raw.id` ile; `normalizeRecord` id'yi 128 karaktere kırpıyor (`browser-skip-segments.js:14`). >128 karakterlik, kurban kaydın id'sine kırpılan bir `raw.id` → `existing` bulunamaz → "başka videoya ait" kontrolü atlanır → `upsertRecord` normalize id ile eşleşip başka videonun kaydının üzerine yazar.
- **Etki:** Çapraz-video kayıt üzerine yazma; ancak hazırlanmış IPC `browser:extras`'a yalnızca güvenilir ana renderer gönderebildiği için pratik erişilebilirlik düşük.

### B42 · P4 — Küçük kusurlar (extras servisi) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- `ass-clear` :232-234 — `executeJavaScript` reddederse `tab.assFrame` bayat kalıyor (sonraki lifecycle cancel yine temizliyor).
- `encoding-apply` :126 — TTL'i geçmiş önizleme hata veriyor ama `encodingPreviews` girdisi silinmiyor; ≤8 MB buffer bir sonraki önizleme/cancel'e kadar duruyor (TTL yalnız uygulamada denetleniyor).
- Aşılan referans üzerinde `reference-waveform`/`ocr-range`/`dialogue-transcribe`/`intro-detect` sonuna dek çalışıyor — bayatlık yalnız await-sonrası `reference() !== ref` kontrolüyle anlaşılıyor; dakikalarca ffmpeg boşa gidiyor (doğruluk korunuyor).
- `bestFrame`/`ass-load` `executeJavaScript`'leri timeoutsuz (:62-66, :225) — kilitli sayfada iş sonsuza bekler, `hasJobs()` `canRestore`'u kalıcı kilitler (`executeBrowserViewFrames`'teki 5 sn deseni burada yok).
- `scenes` :258 — `finally`'deki `rmSync` hatası (kilitli temp dosya) başarılı sonucu maskeliyor.
- :29-31 — bozuk `browser-skip-segments.json` sessizce `{}` ile başlayıp ilk `save()`'de üzerine yazıyor (series-context'in "veri korunuyor" reddiyle tutarsız); >2048 karakterlik dizi-anahtarı yazılıyor ama sonraki yüklemede filtreleniyor → yeniden başlatmada bağlama sessizce kayboluyor; URL-query dalgalanması kayıtları parçalıyor, imzalı URL'ler dosyaya yazılıyor.
- `reference-waveform` 120 sn varsayılanı uzun videolarda (≤4 saat ses çözümü) zaman aşımına takılabilir (donanıma bağlı, spekülatif).
- `ocr-frame` tam-görünüm PNG'si büyük ekranlarda `ocr-read`'in 11 MB tavanını aşabilir (spekülatif); stat→read ayrı syscall'leri (TOCTOU); `ref.thumbnails` Map set-recency yenilemiyor (gerçek LRU değil).

### B43 · P3 — Kurcalanmış `.wbp` paketi substring-yeniden-yazımla tüm geri yüklenen veriyi bozabilir [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `workspace-package.js:96-128` `rewrite()` her `from`'u düz substring olarak değiştiriyor. `from` kaynakları saldırgan kontrollü: `data.sourceRoot` (yalnız `length>=3`, :81), `data.mappings[i][0]` (yalnız `length>=3`+`allowed(m[1])`, :94) ve `data.videos[i].source` (yalnız `length>=3`, `workspace-video-package.js:50` → `videoMappings` `from` olarak :64).
- **Etki:** `sourceRoot:'C:\'` veya `videos:[{source:'C:\'}]` içeren bir paket → geri yüklenen `media-catalog.json`/`watch-library.json`/`browser-session.json` ve localStorage'daki **her `C:\` geçişi** userData'ya yeniden yazılır → tüm yerel yollar kütüphane genelinde bozulur. `path.isAbsolute('C:\\')` true olduğundan mutlak-yol kontrolü yetmez. Kullanıcının düşman paketi seçmesi gerekir; `before-restore-*.wbp` yedekleri elle kurtarmayı mümkün kılıyor.

### B44 · P4 — nMDB dostu hata metni ölü kod [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `nmdb-catalog-import.js:80` sıfır-olmayan çıkışta `stderr || 'nMDB önizlemesi okunamadı.'` ile reddediyor; `backend/nmdb_catalog_import.py` dostu hatayı **stdout'a JSON** olarak basıp 1 ile çıkıyor → stdout parse edilmiyor → :85'teki `parsed.error` dalı gerçek hatalarda erişilemez.
- **Etki:** "tablolar eksik / sürüm uyumsuz" gibi belirli mesaj yerine genel hata gösteriliyor.

### B45 · P4 (spekülatif) — Kurcalanmış nMDB ile UNC yolu → giden SMB [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `localPath()` (`media-catalog-store.js:11-13`) `path.win32.isAbsolute` kabul ediyor → `\\sunucu\paylaşım` geçiyor; `mapWorks` `poster_yolu`/`media_files.path`'i aynen saklıyor → `imageFor`/`inspectMedia` poster görünümünde/oynatmada SMB bağlantısı açıyor.
- **Etki:** Kullanıcının düşman DB seçmesi koşuluyla istenmeyen giden SMB (NTLM relay yüzeyi). `localPath()`'te `\\` reddi değerlendirilebilir.

### B46 · P4 — Önizleme token'ları diyalog kapanışında iptal edilmiyor + abort yok [SONUÇ: KISMEN DOĞRULANDI · SERTLEŞTİRİLDİ]
- **Kanıt:** `close()` (`media-catalog.js:72`) yalnız `cancelImport()` çağırıyor; `metadata`/`seasonData`/`packageData` token'ları 15 dk yaşıyor (`catalog-extensions.js:11-16`). Ayrıca tüm subprocess/fetch çağrıları `signal:null` ile çalışıyor — `api()` oturum koruması sonucu çöpe atıyor ama kapalı diyalog 300 sn'lik taramayı/1 saatlik paket çıkarmayı durduramıyor.
- **Etki:** Sınırlı (4 girdi, 15 dk) ama tutarsız iptal davranışı + boşa işlem.

### B47 · P4 — Katalog deposu öğeleri yüklemede normalize etmiyor + tombstone yok [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `read()` (:153-159) yalnız zarfı doğruluyor; şema-bozuk ama geçerli JSON `visible()`/`resolveImport`'ta ham TypeError ile çöküyor (B30'un üstüne ikinci kırılganlık). `remove()` (:185-189) kalıcı siliyor — tombstone yok → aynı kaynağın yeniden içe aktarımı silinmiş öğeyi `added` olarak diriltiyor (watch-library-store'da `tombstones` var).
- **Etki:** Bozuk-şema dosyasında katalog kilitleniyor; sil-sonra-tara akışında silinen eser geri geliyor (tutarsızlık kasıtlıysa belgelenmeli).

### B48 · P4 — `canRestore` tam-altyazı yakalama işini saymıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (ajan bildirimi):** `main.js:15234` `activeJob`/`burninJob`/`browserExtras.hasJobs()` kontrol ediyor ama modül-seviyesindeki `browserHlsCeaFullCaptureJob` (main.js:516) ve browser indirmeleri dahil değil → yakalama sırasında `package-apply` yeniden başlatmayı tetikleyip işi öldürüyor (yazımlar girdi dizinine gittiği için veri bozulmuyor, yalnız ilerleme kaybı).

### B49 · P4 — `season-apply` yerel `airDate`'i koşulsuz eziyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `catalog-extensions.js:66` `airDate: next.airDate` — TMDB boş `air_date` döndürürse elle girilen tarih siliniyor; `title` yalnız boşken alınıyor ama tarih değil. `mergeRecord` (:135-136) da gelen `airDate`'i düşürüyor.

### B50 · P4 — Küçük kusurlar (katalog) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- `browser-media-tools.js:11` `run()` tam `process.env`'i çocuğa veriyor → `WHISPER_HF_TOKEN`/`WHISPER_LLM_API_KEY` tarama/içe-aktarma Python'larına gereksiz görünür.
- `metadata-apply` posteri 8 MB kontrolünden önce tamamen belleğe alıyor (`catalog-extensions.js:44-46`).
- `import-cancel` sender kontrolü yapmıyor (`:149` vs `catalog-extensions.js:112` — bugün tek yetkili gönderen, etkisiz).
- Store `.avif` kabul, `imageFor` red (`store.js:17` vs `service.js:38`) — avif poster hiç çizilmiyor.
- `edit()` `state.removeId` temizlemiyor (`media-catalog.js:96` — kozmetik); renderer `posterCache` sınırsız; `LIMIT 20000` vs `>10000` red uyumsuzluğu (10-20k'lık DB toptan reddediliyor); `allowed()` `catalog-posters` içine `.json` izinli; `source.watchKey` ölü veri; `previewImport`'taki `!dialog.open` dalı erişilemez.
- `package-apply` pencere-ölümünde `executeJavaScript` TypeError (dış catch'e düşüyor); `season-apply`/içe aktarım tek geçersiz bölümde toptan düşüyor; `renderEpisodeForm` korunmasız `item` (tek pencerede erişilemez); `data.poster` regex'i `..` kabul (host sabit, zararsız).

## Doğrulanan temiz alanlar (extras servisi)

- `reference()` kuşak+mediaId+mtime/size yeniden doğrulaması; `references` sekme kapanışı + her navigasyonda temizleniyor (`invalidateBrowserTabSubtitles` → `cancel(tab)`, main.js:3708); post-await `reference() !== ref` kimlik kontrolleri.
- `jobs` aynı-eylem öncülünü abort ediyor; `skip-*` mutasyonları tamamen senkron (atomik); `tab.assFrame` yalnız `current()` altında set.
- `thumbnail-cancel`/hızlı-küçükresim zinciri: LRU 60, öncül-abort, renderer `thumbSequence` bayat elemesi, ffmpeg kill.
- ASS enjeksiyonu: `JSON.stringify` kaçışı, operationId-kapsamlı clear, abort dinleyicisi add/remove doğru (`browser-ass-renderer.js:44-125`).
- `subtitle-search`/`subtitle-download`: kimlik bilgileri loglanmıyor/kalıcı değil; indirme URL allowlist'i katı (https + `*.opensubtitles.com`, ≤3 yeniden-doğrulanan yönlendirme); 4 MB/2 MB gövde tavanları.
- `scenes`: maxScenes 24/sert 48, ~320 px JPEG, temp dir `finally` temizliği; `semantic-search`/cue doğrulamaları sınırlı.
- `browser:extras` `authorized` kapsamı; `mini-open`/mini-player komut allowlist'i; `skip-delete` sahiplik kontrolü; geçersiz-kayıt-önce-ilişkilendirme sırası (testle sabit).
- Subprocess hijyeni: stdout/stderr tavanları, `windowsHide`, stdin EPIPE yutması, abort dinleyicileri settle'da kaldırılıyor, mkdtemp + finally rmSync (alignment dahil — abort'ta da temizliyor).

## Doğrulanan temiz alanlar (katalog + yeni özellikler)

- **Kimlik doğrulama:** tüm `media-catalog:request` eylemleri (uzantılar dahil) `authorized(event)` = `mainWindow.webContents` + `mainFrame` arkasında (`media-catalog-service.js:57-61`).
- **Önizleme token'ları:** gönderen+tip bağlı, 15 dk TTL, kapasiteli, tek kullanımlık; `take()` çapraz-eylem tekrarını reddediyor; çift `before` snapshot ile iyimser eşzamanlılık.
- **TMDB token:** yalnız bellekte, Bearer header'da (URL'de değil — testle sabit), uzunluk/CRLF doğrulamalı; kapanışta temizleniyor.
- **`save` whitelist:** renderer `source`/`posterPath`/harici puan enjekte edemiyor; bölüm `source`'u `previous`'tan alınıyor.
- **Oynatma:** yerel yol `inspect` + grant + çift uzantı kontrolü; browser URL http/https + kimliksiz doğrulaması.
- **nMDB içe aktarım:** salt-okur SQLite URI, `query_only`, yol tırnaklama, LIMIT'ler, 32 MB stdout tavanı, 30 s öldürme.
- **Klasör taraması:** `followlinks=False`, symlink budama, 5000 satır tavanı, 5 MB/5 dk subprocess sınırı.
- **Paket geri yükleme:** `allowed()` allowlist (`..`/`\`/`:`/boş), her seviyede symlink kontrolü, boyut tavanları, `startsWith` yeniden denetimi, secrets hariç (`settings.json` ROOTS'ta değil).
- **Renderer (katalog):** tüm async akışlarda oturum-token koruması, DOM yalnız `createElement`/`textContent`, `safePoster` regex.
- **`subtitle-encoding-preview.js`:** saf, `ENCODINGS` whitelist, BOM soyma doğru.
- **Workflow temeli:** ara adım iptali `EWORKFLOW_ABORTED` doğru çalışıyor; kayıtlar `settings-security.js` ile temizleniyor; panel element ID'leri ve script yükleme sırası `index.html`'de tutarlı.
- **`browser-mini.js`/`browser-series-context.js` (renderer):** köprü sınırlı; requestId + context-key çift koruması.
- **Skip-segment modeli (`browser-skip-segments.js`):** kind/scope whitelist, 24 saat tavanı, normalize/upsert sağlam.

### B62 · P4 — Extras `cancel` bağlam bayatladıktan sonra erişilemez [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-feature-services.js:95-98` `valid()` kapısı `cancel` hızlı-yolundan **önce** çalışıyor — kuşak/mediaId değiştikten sonra gelen iptal `{stale:true}` dönüp süren subprocess'i abort etmiyor.
- **Önlem:** navigasyon/kapanış `browserExtras.cancel(tab)` çağırıyor (`main.js:3708,10140,10876`) → çoğu yol zaten işi öldürüyor; kalan boşluk renderer-iptalinin geç ulaştığı dar pencere + boşa işlem. `assertCurrent()` sonuç uygulamasını engelliyor.

### B63 · P4 — Skip deposu `save()` kardeş kalıptan zayıf [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-feature-services.js:38-39` sabit `target+'.tmp'` adı + `0o600` yok; kardeş depolar uuid-temp + `mode:0o600` kullanıyor (`media-catalog-store.js:171-175`, `browser-series-context.js:60-65`). Tek-süreçli senkron yazımda çakışma pratik değil; dosya izinleri ve tutarlılık için not.

### B64 · P4 — Test-kapsamı boşlukları (ajan bulgusu, doğrulandı) [SONUÇ: KISMEN DOĞRULANDI · SERTLEŞTİRİLDİ]
- **Token sözleşmesi hiç test edilmiyor:** üç önizleme sistemi de (catalog-extensions `take()`, media-catalog `previews`, extras `encodingPreviews`) TTL+sender+tek-kullanım uyguluyor ama hiçbir test yanlış-gönderen/süresi-dolmuş/tekrar-kullanım/yanlış-tip token'ı denemiyor — sözleşme sessizce gerileyebilir.
- **Adversarial kapsam dışı:** `adversarial-ipc.test.js` main.js'ten çıkarılan ~90 handler'ı vm-çalıştırıyor ama modül-içi kayıtlar (mini-player IPC, extras dispatch, katalog eylem switch'i) kapsam dışı — sender-spoofing testi yok.
- **Renderer localStorage şekil-doğrulamasız okumalar:** `playerAudioLocks`/`savedCues`/`savedWords` okumada doğrulanmıyor; `browser-note-draft:*` anahtarları silinmiş cue'lar için hiç GC'lenmiyor.
- **`.wbp` renderer-değer içeriği şemasız:** paket restore 5 allowlist anahtarını JSON-parse'a kadar denetliyor ama içerik şeması yok → kurcalanmış paket `browser-source-edits-v1`'e keyfi JSON yazabiliyor (okuyucular savunmacı, B43 sınıfının zayıf halkası).

## Düşmanca sayfa tehdit modeli — enjekte-sayfa denetimi (ajan + satır doğrulamalı)

Gömülü browser keyfi siteler gezdiği için sayfanın kendi JS'i tehdit aktörüdür. Tüm iddialar satır seviyesinde doğrulandı.

### B65 · P3 — Sayfa-çeviri dinleyicilerinde `isTrusted` yok → sentetik olaylar `page-action` IPC'sine ulaşıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-page-translate.js`'te sıfır `isTrusted` (grep: 0 eşleşme; 1088-1149 pointer/click/key dinleyicileri). Karşılaştırma: `browser-manga.js` ve `browser-overlay-controller.js`'teki **tüm** kullanıcı dinleyicileri `isTrusted` kapılı — tutarsız savunma.
- **Zincir:** `send()` köprü jetonunu kendi içinden ekliyor → main'deki jeton kontrolü geçiyor. Ref id'ler paylaşımlı DOM'da okunabilir (`data-whisper-tr`, `data-whisper-id`).
- **Etki:** Sayfa, `PointerEvent`/`click` dispatch ederek: `retry` → çeviri-API kotası yakma; `edit`+`edit-save` → keyfi metnin **`browserTranslationCache()` kalıcı önbelleğine** ve arşive yazılması; `exclude` → çeviri kaplamalarının silinmesi.
- **Düzeltme yönü:** 1088-1149'daki her dinleyiciye `event.isTrusted` kapısı (manga/overlay kalıbı).

### B66 · P3 — Sahte `__whisperCaptureQueue` girdileri → kimlikli kör fetch + stream kimliği zehirleme [SONUÇ: KISMEN DOĞRULANDI · SERTLEŞTİRİLDİ]
- **Kanıt:** `main.js:6865-6866` `session.fetch(url, {credentials:'include'})`; kuyruk drain'i `captureId`+`retryAt` dışında köken doğrulamıyor; HLS/DASH manifestlerinden türetilen URL'lere ≤24 keşif fetch'i. `adoptBrowserStreamMediaIdentity` `tab.streamMediaId`'yi sahte manifest URL'siyle ezebiliyor (sonraki `mediaId`-bağlı kapılar bunu temel alıyor).
- **Sağlam kalan savunmalar:** http/https only, kullanıcı adı/parola yok, `assertPublicBrowserSubtitleUrl` her yönlendirmede DNS+özel-IP reddi → **intranet/loopback SSRF yok**; ≤5 yönlendirme, ≤12 MB gövde, kuyruk kapakları (128/32).
- **Etki:** Kullanıcının girişli olduğu sitelere çerezli kör GET'ler (yan-etkili GET uçlarına CSRF-by-proxy), ~24+ fetch amplifikasyonu, altyazı ardışık düzenine enjeksiyon, stream kimliği zehirleme. Yanıtlar sayfaya dönmez — kör.
- **Düzeltme yönü:** kuyruk girdilerini hook'un kendi imzaladığı jetonla/nonce ile bağla veya sayfa-kökenine sınırla; `streamMediaId` evlat edinmesini orijin doğrulamalı yap.

### B67 · P3 — `browser:open-link` sentetik tıklama + iframe ile hareketsiz sekme açma [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-preload.js:35-48` `handleNewTabLink`'te `isTrusted` yok → `a.dispatchEvent(new MouseEvent('auxclick',...))` yeterli. `main.js:11308-11315` `browserTabForWebContents`'i denetliyor ama **`senderFrame === mainFrame` yok** — üstelik yorum "subframe'ler açamaz" diyor, kod denetlemiyor. Aynı boşluk `browser:page-mutated`'de de var (11320-11324).
- **Etki:** Saldırgan sayfa/iframe kullanıcı hareketi olmadan `MAX_SESSION_TABS`'a kadar arka plan WebContentsView açabiliyor (bellek/CPU), popup politikasından bağımsız yol.
- **Düzeltme yönü:** `event.isTrusted` (preload) + `senderFrame === sender.mainFrame` (main) + isteğe bağlı oran sınırı.

### B68 · P3 — `whisperPageTranslate:v2` sessionStorage sayfa-yazılabilir → güvenilir çeviri enjeksiyonu [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-page-translate.js:424-431` `sessionStorage.getItem('whisperPageTranslate:v2')` → `restoredTranslations` → `main.js:4890-4895` session'a → `persistBrowserPageTranslationArchive` (8827). Web Storage dünyalar arası paylaşılır → sayfa `setItem` ile satır enjekte/değiştirebilir.
- **Etki:** Saldırgan metin "hatırlanan düzeltme" olarak DOM'a uygulanıyor, arşiv+belleğe kalıcı yazılıyor; `edit` yolundaki `pre===current` kontrolünü de baypas ediyor, sentetik olay gerektirmiyor.
- **Düzeltme yönü:** belleği sayfa-yazılamaz yere taşı (izole state + köprü üzerinden yazma) veya satırları imzala/doğrula.

### B69 · P4 — `pageContextScript` MAIN dünyada çalışıyor (sayfa indeksleme tutarsızlığı) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-page-index.js:18` `webContents.mainFrame.executeJavaScript` — diğer tüm `pageContextScript` çağrıları izole dünya 999 kullanıyor. Sayfa `__whisperPageContextState`'i önceden ekebilir (`refs.clear()` korumasız → kalıcı `capture-failed`) veya prototip zehirleyerek indeks içeriğini sahtebilir.
- **Etki:** Sayfa indeksine (AI-bağlam/arama besleyici) keyfi içerik + indekslemenin deterministik kırılması.

### B70 · P4 — Sayfa-eklenebilir global kaçırma + sınırsız shadow-root observer'ları [SONUÇ: KISMEN DOĞRULANDI · SERTLEŞTİRİLDİ]
- **Kanıt:** `browser-media-controller.js:6` `if (window.__whisperMediaController) return ...` — sahte `{select,probe,...}` ekilince tüm sorgu/komutlar ona güveniyor (sahte `textTracks` → `storeBrowserTrack`; `skipAd` sayfa seçili elemana tıklıyor). Aynı kalıp `__whisperLinkHints` (early-return + sentetik keydown aktivasyonu) ve `__whisperCapture*` bayrakları.
- **Observer bütçesi:** `media-controller:238-251`, `page-translate:510-525`, `overlay:254-266` shadow-root başına bir MutationObserver, **üst sınır yok** → N host → N observer × mutasyon oranı CPU amplifikasyonu (magnitude spekülatif).
- **Spekülatif ek maddeler:** Cloudflare probe tek-yönlü DoS (sayfa `#challenge-running` ekiyor → yakalama sonsuza pause), `whisper-assets://` Origin denetimsiz parmak izi, `browser:page-mutated`'de mainFrame yok (B67 ile aynı kök), `browser-ass-renderer` `__whisperAssState` sahtelenebilir, overlay `ensureRoot` sayfa ekli elemanı evlat ediniyor.

## Renderer yaşam döngüsü — son ajan (satır-doğrulandı)

### B71 · P2 — "Yükle ve çevir" düğmesi bekleme-iptali sonrası kalıcı ölü [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `renderer.js:7697-7704` — `useBrowserTrack(true)` düğmeyi `disabled=true` yapıyor (7699); `prepareSeq` değişirse 7702'deki erken `return` 7703-7704'teki `preparing=false`/`disabled=false` temizliğini atlıyor. `clearBrowserTracks` (7207-7208) `browserTranslatePreparing`'i sıfırlıyor ama **düğmeyi hiçbir yerde açmıyor** — `browserTrackTranslate.disabled` yazan tek iki satır 7699/7704 (grep-doğrulu).
- **Etki:** "Yükle ve çevir" tıklanıp 1.2–5 sn'lik `waitForBrowserTrackStable` penceresinde navigasyon/media-identity gelirse düğme oturum sonuna kadar ölü. Tek kurtuluş: "Tüm izi tamamla" başarısı.
- **Düzeltme yönü:** temizliği `finally`'ye taşı veya `clearBrowserTracks` içinde düğmeyi aç.

### B72 · P2 — Aktif-sekme browser olayları player modunda yerel çalışma alanını eziyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (dispatch seviyesi):** `renderer.js:10779+` `onBrowserEvent` aktif-sekme dallarında `player.workspaceMode` kontrolü yok; `browserActiveTabId` player modunda da set kalıyor ve `restoreLocalSubtitleWorkspace` browser alanlarını (`browserTranslationTrackId`, `browserTracks`, `browserLiveTranslations`) temizlemiyor → eşleştiriciler player modunda da çalışıyor.
- **Doğrulanan alt-mekanizmalar:** `browser-shortcut` (10813) yalnız `tabId` karşılaştırıyor → `runBrowserShortcut` player modunda çalışıyor; `tabs-changed` (10819) `saveActiveBrowserTabWorkspace()` koşulsuz → yerel `cues`/`subPath` aktif sekmenin oturum kaydına yazılıyor, `subtitleSelection.primaryFile` olarak **yerel .srt yolu** browser sekmesine persist ediliyor; `subtitle-found` `autoLoad` → `loadPersistedBrowserTranslation` → `loadSubtitle(track.path)` yerel `player.cues`/`subPath`'i web çevirisiyle değiştiriyor + `setSubtitleMode('translation')`; `navigation` → `updateBrowserNavigation` → `setMediaKey` → `resetMediaBoundState()` yerel `cues/subPath/subtitles`'i siliyor.
- **Kanıtlı emsal:** aynı koruma başka yerlerde var (`probeActiveBrowserTracks` `browserVisible`, `scheduleBrowserNoTrackSuggestion`, `restoreBrowserTranslationSnapshot`, watch-session yardımcıları) — bu yolda uygulanmamış.
- **Etki:** Browser sekmesi canlıyken player moduna geçmek sessizce: yerel `player.cues`'u web iziyle değiştiriyor, `subPath`'i web temp dosyasına bağlıyor (sonraki `saveCueEdit` **yanlış dosyaya** yazıyor), yerel overlay'i "yalnızca çeviri"ye çeviriyor, izleme kayıtlarını `browser:` anahtarlarıyla kirletiyor. Diskteki kullanıcı dosyası ezilmiyor ama birkaç yazma yanlış hedefe gidiyor.
- **Düzeltme yönü:** aktif-sekme `browser:event` dallarına + `save/restoreActiveBrowserTabWorkspace`, `updateBrowserNavigation`, `applyBrowserTranslationResult`, `loadPersistedBrowserTranslation`, `restoreBrowserSubtitleSelection.isCurrent`, `useBrowserTrack`/`startBrowserLiveTranslation` sonrası kontrollere `workspaceMode==='browser'` kapısı (veya `browserTabState(event.tabId)` yazımı).

### B73 · P3 — `hideBrowserView` mini-oynatıcıyı karartıyor + duraklatıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `main.js:10177-10179` `hideBrowserView` **tüm** `browserTabs` görünümlerine `setVisible(false)` uyguluyor — mini-pencereye taşınmış (reparented) görünüm dahil; `browserView` hâlâ o view'i gösterdiği için 10186'daki pause script'i mini'nin medyasını duraklatıyor.
- **Etki:** "Küçük oynatıcıyı aç" → ana pencere player moduna geç → mini pencere boş/donuk ve video duraklı; komutlar `ok` döndüğü için kırık görünmüyor.

### B74 · P3 — Özellikler panelinde Enter tuşu `busy` kapısını atlıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-features.js:310-314` `keydown` Enter → `semanticSearch()`/`searchSubtitles()` doğrudan çağırıyor; tıklama delegesindeki `if (busy) return` (287) Enter'a uygulanmıyor. İkinci `call()` `sequence`'i artırıyor → süren isteğin sonucu `current(ctx, seq)` tarafından atılıyor, `finally` `setBusy(false)`'u atlıyor.
- **Etki:** Süren aramada Enter → ikinci `browserExtras` isteği (OpenSubtitles kotası / dakikalarca semantik embedding işlemi iki katına çıkıyor) + ilk sonuç sessizce düşüyor.

### B75 · P4 — Küçükler (renderer) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Thumbnail catch bağlamsız:** `browser-analysis-tools.js:122-129` başarı `seq+signature` denetliyor, catch yalnız `seq` — boşlukta "Kare alınamadı." eski bağlamın UI'ına yazılabiliyor; `hidePreview`'in `thumbnail-cancel`'i süren önceki-bağlam isteğini sunucuda iptal etmiyor.
- **Sekme çalışma alanı altyazı rollerini persist etmiyor:** `saveActiveBrowserTabWorkspace` `subRole`/`sub2Role`'u saklamıyor → sekme değişiminde elle-açılmış çeviri-rolü birincil izi 'source'a düşüyor → "Yalnızca çeviri" kapanıyor.
- **Zoom yanlış sekmeye atfediliyor:** `changeBrowserZoom` IPC sonrası `browserTabState()` güncel aktifi okuyor — await sırasında sekme değişirse A'nın zoom'u B'ye yazılıp persist ediliyor.
- **Kayıt bağlamı adım başına yeniden doğrulanmıyor (spec):** `record()` kayıt ortası navigasyonda farklı medyanın adımlarını karıştırıyor; playback'te `resolveWorkflowTrack` dil/etiket fallback'i yanlış-ama-mantıklı iz seçebiliyor.

### B57 · P2 — `browser:subtitle:captureFull` retry-wait'te iptal → özellik kalıcı kilitleniyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (zincir):** `main.js:13197-13204` iptal dalı `cancelled=true` + `autoRetryTimer` temizliyor ama **`job.state`'e dokunmuyor ve ilerleme olayı yayınlamıyor**. `state` yalnız `sendBrowserHlsCeaFullProgress` (`:7220`) ile değişiyor. `retry-wait` (`:7280`) iptal sonrası öylece kalıyor → yeni başlatma `:7452-7455` koruyucusuna takılıyor ("zaten çalışıyor") → resume yolu `:7463-7465` yalnız `partial|error|cancelled` kabul ettiği için erişilemez. Renderer tarafında `player.browserCeaCapture.state` `'retry-wait'` kalıyor → düğme hep `cancel` gönderiyor → `{ok:true}` + hiçbir değişim → sonsuz kısır döngü.
- **Etki:** Canlı/event HLS'de (açık playlist, eksik segment, süre belirsiz — retry-wait'in sık çıktığı senaryolar) "durdur" → özellik o sayfada navigasyona/sekme değişimine dek ölü (`resetBrowserCaptureState` :3727 glob'i sıfırlıyor).
- **Tekrar:** HLS+CEA sayfası → "Tüm altyazıyı getir" → "manifest otomatik yenilenecek" bekleme mesajı → "Yakalamayı durdur" → tekrar başlat denemesi hep no-op.
- **Düzeltme yönü:** iptal dalında `job.state='cancelled'` + `sendBrowserHlsCeaFullProgress(job,'cancelled',…)` (veya glob'i null'la).

### B58 · P3 — `browser:translation:start` `sourceComplete`'i düşürüyor → kısmi yakalama tam gibi raporlanıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** handler `main.js:12673-12681` `trackId`/`targetLanguage`/`sourceLanguage`/`register`/`profanity`/`completeTrack`/`refresh` iletiyor ama renderer'ın gönderdiği `sourceComplete` (`renderer.js:7774,8549` — `track.captureComplete !== false`) iletilmiyor → `tab.translationSourceComplete = options.sourceComplete !== false` (`:6252`) hep **true** → `onState` (:6308) hep `true` yayıyor → renderer'daki "Yakalanan kısmın çevirisi hazır" dalı (`:11177`) ölü kod → `persistCompletedBrowserTranslation` kısmi sonucu tam-çeviri gibi GİRDİ/ÇIKTI klasörüne + arşive yazıyor.
- **Etki:** `captureComplete:false` biten yakalamanın çevirisi "tam kapsam" diye sunuluyor ve kalıcı depoya kısmi işaret olmadan yazılıyor.
- **Ek:** `terminologyOptions` da düşüyor ama renderer'da göndereni yok (ölü alan).

### B59 · P3 — Sekme kapatma onayı tam-yakalama işini saymıyor (F4) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser:tab:close` `activeWork` (`main.js:11078-11079`) `mangaJob`/`pageTranslateJob`/çeviri zamanlayıcısını sayıyor; `browserHlsCeaFullCaptureJob` dahil değil → yakalama ortasında sekmeyi kapatmak onaysız geçiyor; iş sekmenin gittiğini ancak bir sonraki `isCurrentBrowserContext` kontrolünde fark ediyor. B48'in (`canRestore`) aynı sınıftan ikinci kapısı.

### B60 · P4 — Çeviri/yakalama yaşam döngüsü küçükleri [SONUÇ: KISMEN DOĞRULANDI · SERTLEŞTİRİLDİ]
- **`unloadBrowserTab`** (`:11456-11503`) scheduler'a `cancelAll` çağırmıyor; `translationSchedulerBusy` kapısı yalnız pending/queued sayıyor → retry-timer'lı scheduler boşaltılmış sekmede çalışmaya devam ediyor (`isCurrent` view kontrolü yok) → görünmez sekmeye API harcaması + sonuç commit'i (veri güvenli, israf).
- **`sendBrowserEvent` bayat kaynaklı olayı taze bağlamla zarflıyor** (`:2822` `browserEventContext(tab)` gönderim anında kuruluyor) → ölü CEA işinin terminal `cancelled`/`error`'u yeni sayfa bağlamını damgalayabiliyor; bayat `subtitle-found`'da `subtitleFileAccess.grant` çalışıyor.
- **`resetBrowserCaptureState` çeviri alanlarını yarım temizliyor** (`:3734-3738` — scheduler cancel + `translationResults` siliniyor; `translationTrackId`/`SourceCues`/`DisplayedCueIds`/`FileCueIds`/`PersistedSignature`/`SourceComplete` kalıyor) — bugün tüm çağıranlar `invalidateBrowserTabSubtitles` ile tamamlıyor; gizli kırılganlık.
- **`tab.translationSourceHash` hiçbir yerde atanmıyor** (`:2197` okuyor, yazan yok) → recovery satırları `sourceHash:''` taşıyor.
- Refresh yolu `options.trackId`'yi ham haliyle 180-kırpılmış `translationTrackId` ile kıyaslıyor (`:6223` vs `:6250`) → >180 karakterlik id'de refresh hep "oturum yok" (pratik erişilemezlik).
- **Spekülatif:** `onState` içinde throw, cümle işinin `.catch`'ine düşüp cümle-çeviri hatası gibi raporlanabilir.

### B61 · P2 (spekülatif, zamanlama-bağımlı) — İlk stream-kimlik evlat edinmesi süren çeviriyi sessizce askıya alıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (mantık zinciri):** `isCurrent` (`main.js:6319-6320`) `browserWatchMediaId(tab) === mediaIdentity` istiyor; `adoptBrowserStreamMediaIdentity` (`:3873-3890`) ilk evlat edinmede `invalidateBrowserTabSubtitles`'i doğru şekilde atlıyor ama `streamMediaId` yine de `browser:<mediaId>` → `browser:<mediaId>:stream:<hash>` çeviriyor → `isCurrent()` kalıcı false → `onResult`/`onState` bastırılıyor, persist çalışmıyor; scheduler API kotasını sonuna dek tüketiyor.
- **Erişilebilirlik:** manifest işleme (`:7896-7897`) çeviri başladıktan sonra gerçekleşirse (tembel HLS manifest'i, kullanıcı oynatmadan çeviriye basarsa) tetiklenir — harness'le çalıştırılmadı, mekanizma satır-doğrulandı.

### B52 · P2 — Python↔JS kodlama uyumsuzluğu: ASCII-dışı metin bozuluyor, CJK'da işlem çöküyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (deneysel):** `browser-video-analysis.test.js` gerçek çalıştırmasında JSON yanıtı `"method":"Yerel spektral ses eletirme"` döndü — `eşleştirme`'deki `ş`'ler JS tarafında **bozuk**. Kök neden: `browser_video_analysis.py:119` `print(json.dumps(..., ensure_ascii=False))` — Python 3.11'de `sys.stdout` ANSI kod sayfası (cp1254); JS tarafı baytları UTF-8 okuyor (`browser-video-analysis.js:24`) → Türkçe karakterler mojibake; CJK/kodlanamayan karakter `UnicodeEncodeError` → işlem toptan başarısız.
- **Kritik yüzey:** `ocr-range` — gömülü **CJK altyazı** okumak bu özelliğin ana kullanımı; OCR metni yanıtta → bozulma veya `UnicodeEncodeError`.
- **Aynı sınıf, giriş yönünde:** `browser_align.py:89` `json.load(sys.stdin)` — metin-kipi stdin UTF-8 payload'unu ANSI kod sayfasıyla çözüyor; payload'da tanımsız bayta denk gelen karakter (CJK örn. `あ`=E3 81 82 → 0x81 tanımsız) → `UnicodeDecodeError` → hizalama `{"ok":false}` ile düşüyor. `browser-alignment.js:29-30` env'e `PYTHONUTF8`/`PYTHONIOENCODING` koymuyor (tek sağlam köprü `browser-media-tools.js:11` `run()`).
- **`catalog_scan.py:34-35` aynı sorunun en kötü hali — deneysel kanıtlı:** `Şiddetli Diziler` adlı klasörde gerçek tarama çıktısı cp1254 `0xDE` baytı içeriyor → UTF-8 okunamaz → JS `toString('utf8')` U+FFFD üretir → JSON parse geçer ama `path` alanı `iddetli Diziler` olarak **kataloğa bozuk işleniyor** → oynatma/içe-aktarım zinciri kalıcı kırık. Türkçe karakterli klasör/dosya adı olan her taramada görünür.
- `catalog_scan.py` ayrıca tamamen handlersız — `echo '{}' | python catalog_scan.py` → ham traceback (tam dosya yolu + satır) stderr'e → `run()` kuyruğu UI'a basıyor. **Deneyle doğrulandı.**
- Bağışık: `nmdb_catalog_import.py` `ensure_ascii=True` kullanıyor (çıkış ASCII-güvenli).

### B53 · P3 — `catalog_scan.py` exception handler'sız + Windows junction kaçağı/döngüsü [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `:33-35` `json.load(sys.stdin)`/`request['folder']`/`scan()` korumasız → bozuk girdi (`{}`, `{"folder":42}`) → ham traceback stderr'e → JS `run()` stderr kuyruğunu UI'a basıyor (dosya yolları + kaynak satırları görünür).
- **Kanıt:** `:10-11` `os.path.islink` Windows dizin junction'larında `False` (MOUNT_POINT ≠ SYMLINK) → `followlinks=False`+islink filtresi junction'ı durdurmaz → (i) seçili klasörün dışına tarama; (ii) junction döngüsü (`C:\Users\...\Application Data` tipik) sınırsız walk — 5000-satır kontrolü yalnız video dosyasında değerlendiriliyor → videosuz döngü ağacında 300 sn JS kill'e kadar spin.

### B54 · P3 — `browser_align.py` `overlap_score` O(n×m) + timeoutsuz (B38 birleşiyor) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser_align.py:27-41` iç döngü `rs >= end`'de `break` ama `re <= start`'da `continue` — örtüşmeyen referanslarda her aday tüm referansları tarıyor → doğrulamanın kabul ettiği 10k×10k girdi ~10⁸ iterasyon ×2 çağrı (:76-77) → onlarca saniye saf-Python; JS tarafında timeout da yok (B38) → meşru büyük altyazıda algılanan donma.

### B55 · P4 — Python subprocess'lerinde confused-deputy sertleştirme boşlukları [SONUÇ: REDDEDİLDİ]
- `workspace_video_package.py:9-35`: stdin'den gelen `output`/`manifest`/`archive`/`source`/`name`/`target` Python'da hiç doğrulanmıyor → hazırlanmış stdin ile keyfi dosya paketleme/çıkarma primitifi. JS tarafı isimleri regex'leyip `basename` türetiyor — normal akışta erişilemez; derinlemesine savunma boşluğu. Ayrıca `action != 'write'` her şeyi read/extract dalına düşürüyor.
- `separate_dialogue.py:10-16`: `request['toolDirectory']` PATH'e ekleniyor; `output`/`models`/`audio`/`model` (HF repo id) doğrulanmıyor — crafted-stdin'e bağlı (JS beyaz-listeli değerler gönderiyor).
- `browser_video_analysis.py:15-23`: `frames`/`audioFiles` keyfi yol; `Image.open`'da px tavanı yok (media_tools'taki 16Mpx sınırının aksine); `wavfile.read` boyut kontrolünden ÖNCE tüm dosyayı okuyor.

### B56 · P4 (spekülatif) — Diğer backend maddeleri [SONUÇ: REDDEDİLDİ]
- `workspace_video_package.py:28-31` 100 GB tavanı beyan edilen `file_size`'a güveniyor → kurcalanmış zip decompress'te sınırı aşabilir (kullanıcının düşman paketi seçmesi gerekir).
- `export_anki.py:93-118` `_stage_media` renderer-verdiği `screenshotRef`/`audioRef`'i verbatim kabul ediyor → yetkili renderer `.apkg`'e keyfi yerel görsel/ses gömebilir (≤32 MB/dosya, ≤256 MB toplam, uzantı allowlist — düşük-seviyeli yerel dosya sızıntısı ilkesi).
- `nmdb_catalog_import.py:64` BLOB kolonları → `json.dumps` TypeError — except tuple'ında yok → traceback (boş stdout); REAL ±Inf/NaN → geçersiz JSON literal'leri.
- `separate_dialogue.py:28` `float(request['start'])` NaN → yanıtta `NaN` literal → JS `JSON.parse` hatası (crafted-stdin; JS :7'de finite doğruluyor).
- `browser_align.py:19` `isinstance(start,(int,float))` `True`'yu kabul ediyor (kozmetik); ağır kütüphaneler (ffsubsync/RapidOCR/SentenceTransformer) `redirect_stdout(sys.stderr)` olmadan çalışıyor — bağımlılık stdout'a yazarsa tek-JSON sözleşmesi kırılır (spekülatif).

### B51 · P2 — `electron-browser-extras.smoke.js` sekme refaktöründen beri kırık; tüm extras kapsamı sessizce ölü [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (deneysel):** Test şu an `:66`'da düşüyor — `browserFeatures.open=true` yapıyor ama `setSideTab('tools')` çağırmıyor; panel `#browserFeatures { display:none }` (`browser-features.css:97`) olduğundan `getBoundingClientRect().width > 100` false → `error.txt`'ye AssertionError, exit 1. Kardeş smoke `electron-browser-analysis-ui.smoke.js:69` doğru şekilde `setSideTab('tools')` çağırıyor — extras smoke'un tab sonrası güncellenmediği kesin.
- **Doğrulama:** `.uiprev/smoke-fixed/` kopyasına tek satır (`setSideTab('tools')`) eklendi → **tüm smoke geçti**: skip CRUD+UI, semantic-search (2 hit), ocr-frame/ocr-read, ass-load/clear, scenes (1 sahne + JPEG), mini-open. Yani ürün sağlıklı, test ölü.
- **Etki:** Yan sekme refaktöründen bu yana extras smoke her çalıştırmada erken düşüyor → skip UI, semantic, OCR, ASS, scenes, mini-player otomasyonu fiilen kapsamsız. B28 sınıfı hataların CI'da yakalanamamasının doğrudan sebebi.
- **Düzeltme:** :64'e `setSideTab("tools")` eklemek yeterli (ürün değişikliği gerekmez).

## Bu turda çalıştırılan deneyler

| Deney | Yöntem | Sonuç |
|---|---|---|
| Workflow iptal/başarısızlık | `.uiprev/browser-audit-30-workflow.cjs`, gerçek `BrowserWorkflowPlayer` | `cancelledFinal {ok:true,1/1}`; ara iptal `EWORKFLOW_ABORTED`; kontrollü hata → "tamamlandı" |
| Atlama paneli bayatlığı | Electron BrowserWindow + üretim modülleri (`.uiprev/browser-audit-30/`) | `VERDICT BUG REPRODUCED`, 10/10 assertion |
| Baseline | `node tests/browser-workflow-recorder.test.js`, `browser-workflow-core.test.js`, nine-features | Yeşil |
| Hedefli node testleri | `browser-feature-services.test.js`, `browser-video-analysis.test.js` (gerçek RapidOCR + spektral intro), `browser-skip-segments.test.js` | Yeşil |
| `electron-browser-extras.smoke.js` | Electron v43.2.0, ayrı profil | **Kırık** — B51; düzeltilmiş kopya `.uiprev/smoke-fixed` tam geçti |
| `electron-browser-analysis.smoke.js` | Electron, ayrı profil | Yeşil — referans/waveform/thumbnail/alignment/series/intro/ocrRange |
| `electron-browser-analysis-ui.smoke.js` | Electron, ayrı profil | Yeşil — dalga UI (840 nokta), önizleme, 28 değişim taslağı, uygula+geri al |
| Tam paket | `npm test` (tur başında) | Yeşil |

## Eksik test önerileri

1. `browser-workflow-recorder.test.js`: son-adım iptali → `EWORKFLOW_ABORTED` beklenmeli; adım içi hata yutması → `play()` başarısız dönmeli.
2. Electron/browser-features UI smoke: `skip-save` sonrası atlama panelinin `skipRecords`'ının güncellendiğini doğrula (ortak olay veya kayıt sonrası `skip-list`).
3. `media-catalog-store.test.js`: bozuk JSON → `.bak`'tan kurtarma (eklendiğinde); `.avif` poster uyumu.
4. `media-catalog-service.test.js`/`electron-media-catalog.smoke.js`: `remove`/`poster-file`/`metadata-apply` sonrası eski poster dosyasının silindiği; `package-apply` yedek temizliği; `list` yanıtında `watchItems` taşınmıyor; dizi geçişinde `seasonData` sıfırlanıyor.
5. `folder-preview`/`folder-apply` token akışı ve `import-cancel`/`extension-cancel` temizliği için IPC testleri.

## Sınırlar

- 9 denetim ajanından 3'ü tam rapor döndürdü (katalog ×2, extras servisi); 6'sı model hız sınırına takıldı — renderer.js bakiye, main.js'in yeni-özellik dışı bölgeleri ve backend `browser_*.py` betiklerinin derin doğrulaması rapor 31 için açık iş.
- İki eşzamanlı `showOpenDialog` modalının gerçek Electron davranışı, uzun videoda waveform zaman aşımı ve B43/B45'in uçtan-uca istismarı çalışma-zamanında doğrulanamadı (mekanizma satır-doğrulandı, spekülatif işaretlendi).
- Ürün kodu değişmedi; tüm harness dosyaları `.uiprev/` altında (gitignore'da).

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü — 2026-09-15

Güncel kaynakta 49 numaralı bulgu tek tek yeniden incelendi: 42 bulgu düzeltildi, 5 bulgu erişilebilir kısmı sertleştirilerek kısmen kapatıldı, 2 crafted-stdin/spekülatif küme ürün hatası olarak reddedildi.

| Bulgu | Nihai karar | Düzeltme / ret gerekçesi |
|---|---|---|
| B27 | Düzeltildi | Her await sonrası abort denetimi; son adım iptali başarı sayılmıyor. |
| B28 | Düzeltildi | Video analiz sonucu `browser-skips-changed` yayımlıyor; panel belleği olayı tüketiyor. |
| B29 | Düzeltildi | Workflow adım sonucu ve seçili track kimliği açık `{ok}` sözleşmesiyle doğrulanıyor. |
| B30 | Düzeltildi | Katalog ana dosyası bozuksa `.bak` kurtarma ve yükleme normalizasyonu uygulanıyor. |
| B31 | Düzeltildi | Değişen/silinen posterler temizleniyor; restore yedekleri üç adetle sınırlı. |
| B32 | Düzeltildi | Geçmiş Map ile indeksleniyor ve `list` payload'ından çıkarıldı. |
| B33 | Düzeltildi | Katalog öğesi değişiminde metadata/season/package geçici durumları sıfırlanıyor. |
| B34 | Düzeltildi | Komut başarısı ile workflow kayıt hatası ayrı raporlanıyor. |
| B35 | Düzeltildi | Bozuk dizi bağlamı tanıya yazılıp bağlamsız çeviriyle devam ediyor. |
| B36 | Düzeltildi | İptal `targetAction` ile yalnız ilgili extras işini sonlandırıyor. |
| B37 | Düzeltildi | Hizalama referansı BOM/UTF-16/Windows-1254 destekli ortak çözücüden geçiyor. |
| B38 | Düzeltildi | Alignment subprocess sınırlı zaman aşımı ve process-tree iptali kullanıyor. |
| B39 | Düzeltildi | UUID temp + atomik rename; UUID çıktılar LRU sahiplik alanına dahil. |
| B40 | Düzeltildi | Skip liste/kayıt medya-seri sahipliğini değiştirmiyor; yeniden bağlama yalnız açık seri eyleminde. |
| B41 | Düzeltildi | Sahiplik kontrolünden önce medya kimliği normalize ediliyor. |
| B42 | Düzeltildi | Probe timeout, geçici önizleme temizliği, ASS/scenes finally hata yolları kapatıldı. |
| B43 | Düzeltildi | Paket yolu yalnız tam eşleşme veya gerçek path-prefix sınırında yeniden yazılıyor; metin ve anahtar substringleri korunuyor. |
| B44 | Düzeltildi | nMDB nonzero çıkışında stdout JSON hata gövdesi okunuyor. |
| B45 | Düzeltildi | UNC yolları içe aktarım öncesi reddediliyor. |
| B46 | Kısmen kapatıldı | Diyalog kapanışında metadata/season/package token'ları iptal edilip siliniyor. IPC invoke'u başladıktan sonra çalışan subprocess'i renderer tarafından abort edecek ayrı kanal yok; sonuç artık uygulanamıyor fakat alt süreç erken durdurma mimarisi sonraki ayrı iş. |
| B47 | Düzeltildi; alt iddia ret | Yükleme normalizasyonu eklendi. Tombstone isteği mevcut açık silme ürün davranışını değiştiren özellik önerisi; kanıtlanmış hata olmadığı için eklenmedi. |
| B48 | Düzeltildi | Restore kapısı tam yakalama işini aktif iş sayıyor. |
| B49 | Düzeltildi | Uzak metadata boşsa yerel `airDate` korunuyor. |
| B50 | Düzeltildi | AVIF poster destekli; yardımcı süreç env'inden gizli anahtarlar çıkarılıyor. |
| B51 | Düzeltildi | Electron extras smoke doğru `tools` sekmesini açıyor. |
| B52 | Düzeltildi | JS env ve üç Python köprüsü UTF-8'e sabitlendi; gerçek çıktı `eşleştirme` olarak doğrulandı. |
| B53 | Düzeltildi | Tarama hataları kontrollü JSON olur; junction/reparse dizinleri izlenmez; kök yeniden doğrulanır. |
| B54 | Düzeltildi | Hareketli referans indeksiyle doğrusal tarama; B38 zaman aşımı ikinci güvenlik katmanı. |
| B55 | Reddedildi | Sayılan yollar yalnız doğrudan crafted-stdin ile çağrılan iç betik primitifi; ürün IPC'leri beyaz liste ve seçilmiş dosya üretir. Erişilebilir ürün yolu gösterilmedi; savunma-derinliği önerisi olarak korundu. |
| B56 | Reddedildi | NaN/BLOB/stdout varsayımları crafted-stdin veya üçüncü tarafın varsayımsal stdout davranışına bağlı; güncel ürün doğrulama kapılarıyla deterministik repro yok. |
| B57 | Düzeltildi | Retry beklemesindeki iptal terminal `cancelled` ilerlemesini yayımlayıp kilidi açıyor. |
| B58 | Düzeltildi | `sourceComplete` ana çeviri çağrısına taşınıyor. |
| B59 | Düzeltildi | Sekme kapatma `captureFull` işini aktif çalışma sayıyor. |
| B60 | Kısmen kapatıldı | Unload scheduler/manga/page işlerini iptal ediyor; reset tüm çeviri alanlarını temizliyor; source hash yazılıyor; uzun track kimliği normalize. Eski async üreticilerin tamamına immutable event-context eklemek daha geniş protokol değişikliği olduğundan bu alt madde açık sınır olarak kaydedildi. |
| B61 | Düzeltildi | İlk stream kimliği evlat edinilirken scheduler bağlamı yeni kimliğe taşınıyor; sonraki gerçek medya değişimi yine bayat sonucu reddediyor. |
| B62 | Düzeltildi | Cancel, stale/valid kapısından önce ve hedef eylem kapsamıyla çalışıyor. |
| B63 | Düzeltildi | UUID temp, exclusive create ve `0600` dosya modu. |
| B64 | Kısmen kapatıldı | Taslak şekil/TTL/sınır ve paket ekimi kapatıldı; sender testleri genişletildi. Üç önizleme altyapısının tüm TTL/tek-kullanım kombinasyonlarını kapsayan ortak mutasyon matrisi hâlâ yok. |
| B65 | Düzeltildi | Sayfa eylemleri yalnız güvenilir kullanıcı olayından; Ctrl+Enter iç güven köprüsüyle çalışıyor. |
| B66 | Kısmen kapatıldı | Cross-origin discovery fetch artık `credentials: omit`, yalnız aynı-origin istek `include`; kör kimlikli GET kaldırıldı. Main-world kuyruğun sayfa tarafından biçimlendirilebilir olması mimari sınır olarak kaldı. |
| B67 | Düzeltildi | Yeni sekme jesti `isTrusted`; open-link/page-mutated yalnız main frame. |
| B68 | Düzeltildi | Sayfa-yazılabilir `sessionStorage` çeviri belleği kaldırıldı; paketle hızlı taslak ekimi de kapatıldı. |
| B69 | Düzeltildi | Sayfa indeksleme world 999 izole dünyada yürütülüyor. |
| B70 | Kısmen kapatıldı | Page-translate, media-controller ve overlay shadow observer sayıları 128 ile sınırlı. Main-world kontrol globalleri sayfayla ortak dünyada kaldığı için tam izolasyon daha geniş preload/CDP protokolü gerektiriyor. |
| B71 | Düzeltildi | Track hazırlama `finally` ile düğmeyi açıyor; toplu temizleme de kilidi kaldırıyor. |
| B72 | Düzeltildi | Browser olayları yalnız aktif browser çalışma alanında yerel player durumuna uygulanıyor. |
| B73 | Düzeltildi | Mini-owned sekme görünür ve oynar durumda korunuyor. |
| B74 | Düzeltildi | Enter yolu click ile aynı busy kapısını kullanıyor. |
| B75 | Düzeltildi | Thumbnail, workspace rolü, zoom ve workflow recorder sonuçları kuşak/sekme/medya bağlamını yeniden doğruluyor. |

### Doğrulama

- Tam `npm test` paketi geçti.
- Hedefli workflow, katalog, extras, alignment, page-index/page-translate, background-navigation, player ve UTF-8 medya analizi testleri geçti.
- B46/B60/B64/B66/B70 “tamamlandı” diye şişirilmedi; kalan mimari sınırları yukarıda açıkça yazıldı.
