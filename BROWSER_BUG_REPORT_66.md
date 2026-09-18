# BROWSER BUG REPORT 66 — Dalga 3: 10 ajanlık tamamlayıcı tarama

**Date:** 2026-09-18

**Repository:** `dorukakindev/whisper-browser`

**Branch / audited commit:** `master` / `cb3b1564a5881a9aa13362b60d1de9852a204040`
(+ ağaçtaki paralel workstream'in commit'lenmemiş değişiklikleri — bulgular
güncel dosya içeriğine göre doğrulandı)

**Mode:** report only — hiçbir ürün kodu değiştirilmedi

**Numaralandırma notu:** "Rapor 65" etiketi paralel workstream'in Invidious
tesliminde (commit `9ac31a4` / `cb3b156`) kullanıldığı için bu dosya 66 numaralı.

## Kapsam ve yöntem

Rapor 64'ün 20 ajanlık taramasından kalan bölgelere 10 salt-okunur ajan
gönderildi (dalga 3). 8 ajan tamamlandı; 2 ajan (öğrenme/notlar/AI ve
altyapı+altyazı misc kapsamları) ücretsiz-model hız limitine takılıp devamı
kullanıcı tarafından iptal edildi — o iki kapsam **taranmadı** (aşağıda işaretli).

Her P1/P2 bulgu, ajan raporunun ardından bu dosyayı yazan oturum tarafından
güncel ağaçta yeniden okunup doğrulandı. Ajanların verdiği bazı satır
numaraları paralel değişiklikler nedeniyle ~100 satır kaymıştı; rapordaki
numaralar doğrulanan güncel konumlardır.

## P1 — Kesin bulgular

### R66-01 · Gömülü tarayıcıda sayfa odaklıyken TÜM klavye kısayolları ölü

- **Kaynak:** `src/browser-command-palette.js:31` —
  `if (input.type !== 'keyDown' || !(input.control || input.meta)) return '';`
  Aynı ölü kapı `src/browser-page-find.js:30`'da (Ctrl+F). Tek üretim
  çağırıcısı `src/main.js:10527-10533` (`wc.on('before-input-event')`).
- **Kontrol-akış kanıtı:** Electron'un `before-input-event`'i yalnızca
  `kRawKeyDown` ve `kKeyUp` Blink olaylarında yayılır; `input.type` bu
  handler'da hiçbir zaman `'keyDown'` olamaz (Electron kaynağı:
  `electron_api_web_contents.cc` emit filtresi + `blink_converter.cc` 1:1
  tür haritası — castlabs v43 çatallaması bu kodu değiştirmiyor).
- **Tetik:** tarayıcı sekmesinde sayfa odaklıyken Ctrl+Alt+oklar, Ctrl+K,
  Ctrl+F, Ctrl+L, Ctrl+T/W/R/Tab, Ctrl+1..9, Ctrl+0/-/=, Ctrl+Shift+P/T/H —
  hiçbiri çalışmaz; `browserShortcutForInput` hep `''` döner ve sayfa
  tuşu kendisi alır. %100 tekrarlanabilir.
- **Etki:** altyazı senkron dürtmesi, altyazı boyutu, komut paleti,
  sayfada bul, link ipuçları, adres çubuğu, sekme aç/kapa/geri-aç, sekme
  döngüsü, rakam-sekme atlama ve sayfa zoom — tam da video izlerken lazım
  olan bağlamda ölü. Renderer'daki `type:'keyDown'` sentezleyen fallback
  yalnızca uygulama chrome'u odaklıyken çalışır.
- **Neden testler kaçırıyor:** `browser-command-palette.test.js` sentetik
  `{type:'keyDown'}` nesneleriyle sınar; `browser-page-find.test.js` mock
  emitter'a aynı sahte tipi gönderir; e2e smoke `sendInputEvent({type:'keyDown'})`
  kullanır — gerçek `before-input-event` filtresini hiçbiri geçemez.
- **Kabul:** `rawKeyDown`'u kabul et (veya tip kontrolünü kaldırıp
  `isAutoRepeat`/`key` semantiği kullan); smoke'u `rawKeyDown`'a çevir.

### R66-02 · İş günlüğü WriteStream'inde dinleyicisiz `'error'` olayı ana süreci çökertir

- **Kaynak:** `src/main.js:724` (stream yaratımı), `:768` (write), `:783-784` (end).
- **Ulaşılabilir yol:** `fs.createWriteStream` açma hatasını asenkron
  `'error'` olayı olarak yayar (logs dizini iş sırasında silinir, disk dolu,
  AV/indexer dosyayı tutar). `try/catch` blokları yalnız senkron hataları
  yakalar; `src`'in hiçbir yerinde `process.on('uncaughtException')` yok —
  dinleyicisiz `'error'` süreci öldürür. Kod tabanı bu tehlikeyi `proc.stdin`
  için `main.js`'te açıkça belgeliyor ama log stream'inde uygulanmamış.
- **Etki:** iş ortasında Electron ana süreci ölür; çalışan transkripsiyon
  sahipsiz kalır.
- **Neden testler kaçırıyor:** testler saf mantığı kesip çalıştırır; fs
  stream hatası senaryosu yok.
- **Kabul:** `jobLog.stream`'e `createWriteStream` sonrası loglayan/no-op
  `'error'` dinleyicisi tak.

### R66-03 · Watch-folder sonsuz yeniden-transkripsiyon döngüsü + `-whisper-qNNNN` dosya saçılımı

- **Kaynak:** `src/main.js:1081-1087` (çıktı yoksa sıfırlama), `:1181-1184`
  (`done` → `hadOutput:true`), `src/watch-folder.js:46-62` (beyaz liste),
  `src/renderer/renderer.js:463-476` + `queue-lifecycle.js` (çakışma soneki),
  `src/renderer/renderer.js:1715-1722` (config yenileme dinleyicisi).
- **Tetik (deterministik):** farklı alt klasörlerde aynı kök-adlı iki dosya
  (`a/film.mkv`, `b/film.mkv`), kaynak-yanı çıktı varsayılanı. Kuyruk
  çakışma soneki `b` için `b/film-whisper-q0002.srt` üretir;
  `hasConfiguredWatchOutput` beyaz listesi yalnız `stem.<fmt>`,
  `stem.dual|ceviri|tr|en.<fmt>`, `stem.<translateTo>.<fmt>` ve
  `stem.<lang>.<fmt>` (`[a-z]{2,3}`) tanır — `film-whisper-q0002.srt`
  hiçbirine uymaz. `done` raporu `hadOutput:true` yazar; sonraki tarama
  çıktıyı görmez, `queued/hadOutput` sıfırlar, dosya yeniden kuyruğa girer.
  Her tur yeni sonek (`-q0003`, `-q0004`, …) → döngü asla bitmez, klasör
  sonekli dosyalarla dolar.
- **İkinci tetik:** izleme sırasında `outputDir`/`translateTo` değiştirmek —
  config-refresh dinleyicisi yalnız `formats`/`langSuffix` değişiminde
  yeniden uygular, bayat config çıktıyı görmez → aynı döngü.
- **Etki:** dosya her ~15 sn + iş süresi kadar döngüde baştan transkript
  edilir; GPU sürekli meşgul; kuyruk slotu kalıcı tıkalı.
- **Neden testler kaçırıyor:** `watch-folder.test.js` dedektörü izole
  sınar; done→rescan→requeue döngüsünü süren test yok.
- **Kabul:** çıktı dedektörü `stem-whisper-*` soneklerini tanısın VEYA
  kuyruk sonekli çıktılar watch dedektörüne görünür olsun; döngü için
  done→rescan→requeue regresyon testi.

## P2 — Doğrulanmış bulgular

### R66-04 · `writeTextAtomic` tanımsız — araştırma Markdown dışa aktarımı her zaman başarısız

- **Kaynak:** `src/main.js:14680` — tek çağrı sitesi; fonksiyonun tanımı/
  importu tüm ağaçta yok. `ReferenceError` handler'ın try/catch'ine düşer,
  `{ok:false, error:'writeTextAtomic is not defined'}` döner.
- **Yol:** `index.html` "Markdown dışa aktar" → `exportResearchAnnotations`
  → `browser:research:export` handler'ı.
- **Not:** R46-09 olarak daha önce raporlanmış, hâlâ açık. Kardeş
  `exportAnki` yolu çalışıyor.

### R66-05 · `.bak` rotasyonu doğrulanmamış (bozuk olabilen) primary'yi sağlam yedeğin üstüne kopyalıyor

- **Kaynak:** `src/main.js:1386` (`writeQueueState`), `:1720` (`saveHistory`),
  `:5394` (`writePdfTranslationState`), `:15559` (`writeBurninRecoveryState`)
  — kopya koşulsuz. Doğru örnek aynı dosyada var: `writeBrowserPlacesAtomic`
  (~`:2900` bandı) primary'yi önce `JSON.parse` ile doğrular.
- **Tetik:** primary bozulur → okuyucu `.bak`'a düşer → bir sonraki yazma
  bozuk primary'yi sağlam `.bak`'ın üstüne kopyalar. Kuyruk için bu
  başlangıçta otomatik: `loadQueueState`'in repair yazımı stale `running`
  kurtarınca aynı tikte sağlam yedeği yok eder.
- **Etki:** kuyruk/geçmiş/pdf-çeviri/burnin-recovery durumunda çifte kayıp
  riski; güvenlik ağı bir sonraki hataya karşı yok olur.

### R66-06 · `settings.json` yedeksiz + bozulmada sessiz sıfırlama

- **Kaynak:** `readPublicSettings` (~`main.js:1490-1500` bandı) her parse
  hatasında `{glossary:[]}` döner ve `settingsLoadWarning` kurulmaz;
  `saveSettings` `.bak` rotasyonu yapmaz.
- **Tetik:** settings.json bozulur → varsayılanlar yüklenir → renderer'ın
  debounce'lu `scheduleSave()`'i ilk kontrol değişiminde kısmi varsayılanları
  yazar → tüm genel ayarlar (sözlük, çıktı klasörleri, presetler, UI
  tercihleri) geri dönüşsüz kaybolur.

### R66-07 · `burnin:start` check-then-act yarışı — iki eşzamanlı ffmpeg işi

- **Kaynak:** `src/main.js:15662` busy kontrolü → `await authorizeMediaFile`/
  `authorizeSubtitleFile` (`:15667-15668`, onay diyaloğu kullanıcı hızında)
  → `burninStartPending = true` ancak `:15698`'de. Yorum "İlk await öncesi
  kilidi al" diyor ama kilit ilk iki await'ten SONRA alınıyor; spawn'dan
  önce yeniden kontrol yok.
- **Tetik:** onay diyaloğu gereken çiftte (restart sonrası grant'ler bellekte)
  A çağrısı diyalogda beklerken B çağrısı kontrolü geçer → ikisi de spawn
  eder; `burninJob` yalnız son atananı izler.
- **Etki:** kaybeden iş yetim kalır (`burnin:cancel` yalnız `burninJob`'u
  öldürür); farklı `subPath` taşıyorlarsa kullanıcı sessizce diğer işin
  altyazısını yakmış olur; tek-slot kurtarma dosyası ezilir → crash'te
  `*.tmp.mp4` sızar.
- **Neden testler kaçırıyor:** `audit-report-regressions.test.js:72` kilidin
  ikinci await'ten (`probeCommand`) önce alındığını sınar — ilk ikisini değil.
  `models:benchmark`'ın eşdeğer diyalog yarışı testi var; burnin'de yok.

### R66-08 · Hassas-anahtar sözlüğü yaygın imzalı-URL parametrelerini kaçırıyor — token'lar diske/export'a sızıyor

- **Kaynak:** `src/browser-sensitive-keys.js:16-47` (`SENSITIVE_KEY_NAMES`).
  Eksikler: `auth_key` (Aliyun/Huawei CDN), `wmsAuthSign` (Wowza — HLS için
  doğrudan ilgili), `sign` (Tencent), `wsSecret`/`wsTime` (Baidu),
  `oauth_signature`/`oauth_nonce`/`oauth_verifier`/`oauth_consumer_key`/
  `oauth_timestamp` (OAuth 1.0a blok — `oauth_token` listede ama imza yok),
  `auth_token`/`session_token` varyantları, `access_key`/`accessKey`,
  `private_key`/`secret_key`/`secret`, `x-goog-signature`/`x-goog-credential`/
  `x-goog-security-token` (GCS — `isSensitiveKey`-only tüketicilerde
  `startsWithSensitivePrefix` çağrılmıyor).
- **Yol:** `persistentBrowserMediaUrl` → watch-library kayıtları +
  `settings:export` `learningAnnotations[].mediaUrl`; `safePlaceUrl` →
  kapanan-sekme geçmişi, oturum deposu, session-package export, asset-store;
  `redactDiagnosticText` → tanı paneli + tanı export dosyası.
- **Tetik:** `?wmsAuthSign=…`/`?auth_key=…`/`oauth_signature=…` taşıyan
  sayfa/akış açık → geçmiş/oturum/export yazılır → canlı erişim token'ı
  diskte kalıcı ve paylaşım için tasarlanmış dosyalarda.
- **Neden testler kaçırıyor:** `report63-secret-redaction.test.js`
  sözlükteki adlar üzerinden döner; sözlüğü harici bilinen-parametre
  listesiyle çapraz sınayan test yok.

### R66-09 · Overlay `observeRoot` LRU eviction ulaşılamaz ölü kod — 128 shadow root'ta gözlem sert tavana takılır

- **Kaynak:** `src/browser-overlay-controller.js:256` erken çıkışı
  `mutationObservers.length >= OBSERVER_LIMIT` iken zaten reddediyor →
  `:260-263`'teki eviction `while` döngüsü asla çalışamaz. Yorum amaçlanan
  düzeltmeyi anlatıyor ama davranış düzeltme-öncesiyle aynı.
- **Tetik:** ≥128 gözlenen kök üreten sayfa (web-component ağırlıklı SPA,
  shadow DOM içine gömülü oynatıcı/yorum widget'ları) → 129.+ kök asla
  gözlenmez, içine sonradan eklenen video `mediaCandidates`'e girmez.
- **Etki:** ağır sayfalarda altyazı overlay'i sessizce yok; telemetri bile
  `mutationObservers ≤ 128` raporladığı için gizli.
- **İkincil:** eviction çalışsaydı bile çıkarılan scope `observedRoots`
  WeakSet'inde kalıp yeniden gözlenemezdi.

### R66-10 · `scanMediaNode` eklenen düğümün kendi `shadowRoot`'unu taramıyor — doğrudan-eklenen shadow host'taki video overlay'e görünmez

- **Kaynak:** `src/browser-overlay-controller.js:231-252` — `scanShadowHosts`
  yalnız `node.children`'ı dolaşır; `node.shadowRoot` hiç kontrol edilmez.
  Kardeş `browser-media-controller.js:262-268` tam bu durumu düzeltmiş
  ("SPA'nın söküp yeniden taktığı host'un kendi shadowRoot'u" yorumuyla) —
  overlay kopyasında blok eksik.
- **Tetik:** site `<x-player>` custom element'ini doğrudan eklenen düğüm
  olarak mount eder ve `connectedCallback`'te içine `<video>` koyan açık
  `shadowRoot` kurar (`container.innerHTML = '<x-player>'` deseni).
- **Etki:** overlay video için kalıcı kör — medya komutları çalışır
  (controller buluyor) ama altyazı katmanı bulamaz: split-brain.

### R66-11 · Bekleyen watch-kuyruk öğesini silmek/temizlemek dosyayı kalıcı atlatır

- **Kaynak:** `renderer.js:559-577` (`removeFromQueue`/`clearQueue` hiç
  `reportWatchFile` çağırmaz) + `main.js:1074-1088` + `watch-folder.js:74`
  (`if (prev.queued) return false`).
- **Tetik:** watch dosyası stabilize olup kuyruğa girer (`queued:true,
  hadOutput:false`) → kullanıcı bekleyen öğeyi siler veya kuyruğu temizler
  → `watch:report` hiç gönderilmez → un-stick dalı `hadOutput` gerektirdiği
  için çalışmaz → dosya oturum sonuna kadar tarayıcıya görünmez.
- **Etki:** dosya sessizce hiç işlenmez; log/tekrar/UI sinyali yok.

### R66-12 · Paylaşılan watch `outputDir`'de aynı-kök-ad maskelemesi — dosya sessizce atlanır

- **Kaynak:** `src/watch-folder.js:43` (`outputDir: normalized.outputDir ||
  path.dirname(videoPath)`) + `main.js` tarama kayıt dalı.
- **Tetik:** yapılandırılmış ortak `outputDir`; `a/film.mkv` → `out/film.srt`
  üretir → `b/film.mkv` taranırken dedektör `out/film.srt`'yi bulur →
  `b` asla kuyruğa girmez ve transkript edilmez.

### R66-13 · Watch-key canonicalizasyonu ile player `mediaKey` uyuşmuyor — hash'li SPA'larda resume ölü, kayıtlar çakışıyor, secret parametreler diske yazılıyor

- **Kaynak:** `src/watch-library-store.js:25-36` (`canonicalBrowserUrl`:
  kendi `SECRET_QUERY_KEY` listesi + TÜM hash'i siler) vs
  `src/browser-place-url.js:11-30` (`safePlaceUrl`: daha geniş
  `SENSITIVE_KEY_SET` + `#!/route` ve `#t=` hash'lerini KORUR). Tüketiciler:
  `renderer.js:9569` (mediaKey), `:9615` + `:11610-11615` (pendingLibrarySeek
  kapısı), `:13847`/`:13992` (watchItemByKey/restoreWatchProfile),
  `:20106` (watchRemovedKey), `:13944` (`patch.key = player.mediaKey`).
- **Tetik:** `#!/route` veya `#t=` hash'li sayfa → izleme kaydı hash'siz
  key'e, `mediaKey` hash'li key'e yazılır → `pendingSeek.key ===
  player.mediaKey` sonsuza dek başarısız (resume ölü); farklı `#!/route`
  videoları tek kayda çöker ve pozisyonları birbirini ezer; yalnız bir
  listenin sildiği parametreler (`code`, `state`, `session_id`, `nonce`,
  `refresh_token`, `x-amz-*`…) canonical tarafta verbatim saklanır ve her
  oturum değeri için yeni watch öğesi üretir.
- **Etki:** bozuk resume, yanlış paylaşılan ilerleme, kütüphanede çoğalan
  öğeler, diske secret'lı URL.
- **Ek kusur:** `watchRemovedKey`/`watchItemByKey` ıskalayınca tüm mutation
  yazımları `allowCreate:true, baseItemRevision:0` ile gidiyor — flag'ler
  de ölü (`upsert` `_watchMutation`'ı hiç okumuyor).

### R66-14 · Silinen watch-library öğesi izleyerek asla yeniden yaratılamıyor

- **Kaynak:** `src/watch-library-store.js:534-536`
  (`removed && !restoreRemoved → null`) + `main.js:14380-14388`
  (`library:upsert` restore çağırmaz); `store.restore` yalnız import/rollback
  yollarında kullanılıyor.
- **Tetik:** kütüphane kaydını sil → aynı videoyu açıp izle → her
  `updateWatchItem` tombstone'a takılır → `{ok:false}` sessizce yutulur →
  öğe geri gelmez, pozisyon bir daha kaydedilmez.
- **Etki:** otomatik dirilmeyi engellemek için konan tombstone yeni,
  kullanıcı-başlattığı aktiviteyi de bastırıyor; geri-alma yolu yok.

### R66-15 · HLS kurtarma manifest'i yeniden ayrıştırınca kullanıcının duraklattığı videoyu kendiliğinden oynatıyor

- **Kaynak:** `renderer.js:16584` — `MANIFEST_PARSED` handler'ı koşulsuz
  `video.play().catch(() => {})` ile bitiyor; fatal `NETWORK_ERROR` yolu
  (`:16592`) `setPlayerHls(fresh, …, preserveMediaState=true)` çağırıp
  handler'ı yeniden kuruyor. `wasPlaying` korumalı `resume` dinleyicisi
  (`:16625-16631`) var ama manifest handler'ı ondan önce oynatmayı tetikliyor.
- **Tetik:** YouTube HLS'te duraklat → arka planda fatal NETWORK_ERROR
  (canlı yayında neredeyse kesin, VOD'da süresi dolan manifest) → kurtarma
  yeni HLS örneği → `MANIFEST_PARSED` → `video.play()` `wasPlaying===false`
  iken bile çalışır.
- **Etki:** kullanıcının bilerek duraklattığı video sessiz kurtarma sonrası
  kendiliğinden sesli oynar.

## P3 — Doğrulanmış küçük bulgular (özet)

| # | Bulgu | Kaynak |
|---|---|---|
| R66-16 | `terminateProcessTree` `exitCode` set ama `close` gelmemişken no-op → stdio-mirasçı torun varsa iş kalıcı iptal-edilemez, sonraki işler "Başka bir iş çalışıyor" ile reddedilir; `_terminating` da asla temizlenmiyor | `src/process-lifecycle.js:7,10`, `main.js:16286` |
| R66-17 | `-` ile başlayan serbest-metin argümanları argparse'i kırar (`--initial-prompt`, `--glossary`, `--explain-word` ayrı argv; `--opt=value` kalıbı yalnız `--output-name-suffix`'te var) | `main.js` arg kurulumu ~`:16090+` bandı |
| R66-18 | `handleLine` catch'i terminal-olay iletimini de yutar — `acceptTerminalEvent` sonrası bir throw `done/error`'un renderer'a gitmesini engeller (yapısal; bugünkü yardımcılar güvenli) | `main.js:16217-16251` bandı |
| R66-19 | Backend'den `{"type":"exit"}` satırı süreç-çıkışını taklit edebilir — main her parse edilen tipi verbatim iletiyor; `exit` beyaz listeye alınmalı | `main.js` NDJSON iletimi |
| R66-20 | `redactJobLogArgs` eksik bayraklar: `--sync-srt`, `--translate-existing`, `--explain-translation`, `--explain-word`, `--chat-file`, `--llm-base-url`, `--translate-base-url` (user:pass@host taşıyabilir) log'a düz yazılıyor | `main.js:696-698` |
| R66-21 | `flush:true` `fs.writeFileSync`'te ölü seçenek — fsync hiç yapılmıyor (R66-05/06'nın "bozuk primary" üreticisi) | `main.js` `writeJsonAtomic`/`writeBufferAtomic` |
| R66-22 | Atomik-olmayan doğrudan yazımlar: `media:saveImage`, `saveBrowserContextImage`, `session/diagnostics/pdf export`, `publishBrowserTrackNow` (kendi kuralı "her yazma yolu backupOnce + atomic") | `main.js` çeşitli |
| R66-23 | `settings:export` `.json` dışı dosya adında deterministik başarısız (kafa karıştırıcı hata) | `main.js:15002` → `settings-security.js:569` |
| R66-24 | `media:saveSubtitleCopy`'de `media:writeSubtitle`'in 32 MB metin sınırı yok | `main.js:1336` vs `:1378-1414` |
| R66-25 | `browser-downloads.json` `.bak`'sız — bozulmada sessiz kayıp | `main.js:2670-2687` bandı |
| R66-26 | `player.userScrolled` medya değişiminde sıfırlanmıyor → transkript oto-takip sonraki videoda sessizce kapalı kalır | `renderer.js:4706`, reset yok `15927-16030` |
| R66-27 | Öğrenme durumu (`loopCueId`, `loopCueRepeats`, `shadowPausedCueId`) medya değişiminde taşınıyor — konumsal cue-id çakışmasıyla yanlış tekrar sayısı/atlanan shadow-pause | `renderer.js:4880-4882`, `12565-12566` |
| R66-28 | Karışık sürükle-bırak: video+altyazı birlikte bırakılınca altyazı açık olan (farklı) videoya bağlanır, bırakılan video kuyruğa gider; çoklu altyazıda ilki dışındakiler sessizce düşer | `renderer.js:1812-1834` |
| R66-29 | `writingMode` IPC cue beyaz listesinde düşürülüyor → dikey CJK (`vertical:rl`) desteği ölü kod; `speaker`/`confidence` tutulurken tek gerekli alan atılıyor | `main.js:13191-13197` vs `browser-overlay-controller.js:520-524` |
| R66-30 | Overlay cue şeritlerinde tıklama videoya geçmiyor (pointerdown preventDefault + pointerup her durumda yutulur) — yerel overlay'in "sürüklenmeyen tıklama iletilir" kuralı browser overlay'de yok | `browser-overlay-controller.js:115-136,90-112` |
| R66-31 | `pickFolderBtn` ölü kontrol ID'si — işlem kilidi `pickFoldersBtn`'ı atlıyor (tutarsız kilit) | `renderer.js:836` vs `index.html:71,341` |
| R66-32 | `stopAfterCurrent` butonu `queueRunning`'den desync — iptal/restore'da görünürde kalır veya gizli kalır | `renderer.js:4383-4389`, çağrılar eksik `:3121-3129`, `:133-175` |
| R66-33 | `.jobs-tab` ve `.drawer-page-tab` roving tabindex ama ok-tuşu dinleyicisi yok → Geçmiş/Kontrol ve iki ayar sayfası klavyeyle ulaşılamaz (a11y) | `renderer.js:1053,17938`, bağlar `:20367-20372` |
| R66-34 | EN locale: JS-render dizgilerinin büyük bölümü sözlükte yok (kuyruk durumları, task-center, geçmiş/kontrol boş-durumları, `⏸ ` önekli buton metni ayrıca SVG markup'ı eziyor) | `ui-locale.js` sözlük vs `renderer.js` üretimleri |
| R66-35 | "Kuyruğa" sonrası iş özeti kartı az önce kuyruklanan dosyayı kaynak göstermeye devam ediyor (`updateSignalDesk` çağrısı eksik) | `renderer.js:4347-4354` vs `clearFile:1927-1933` |
| R66-36 | Birleşik kütüphane araması 1000-öğe görünür cap'in ötesindeki öğeleri hiç döndürmüyor (`searchWatchLibrary`'nin tümünü yükleyen yolu ölü IPC) | `main.js:2021` vs `:1911-1913` |

## Doğrulanan temiz alanlar (ajan doğrulamaları)

- **Pencere/oturum sertleştirmesi:** contextIsolation+sandbox her iki
  WebContents'te, `setWindowOpenHandler` politika yönlendirmeli, will-navigate
  tamamen engelli, DevTools yalnız `--dev`, sertifika hatası koşulsuz ret,
  `whisper-pdf`/`whisper-assets` protokolleri grant + sınırlı aralık,
  popup zinciri `securePopupWebPreferences` + recursion, 179 IPC kaydı
  tekil ve sender-authorization tutarlı.
- **Preload yüzeyi:** `__whisperTrustedBridgeSend` non-enumerable + 6 tiplik
  allowlist + `isTrusted` + bridgeToken (navigasyon başına yenilenen);
  browser-preload keşif sinyalleri cue metni/HTML taşımıyor; mini-preload
  tek invoke + 4 eylemlik allowlist.
- **`local-file-access`:** canonicalLocalPath `\\?\`/ADS/kontrol-karakter
  reddi + realpath; tüm erişim sınıfları hem özgün hem çözülmüş uzantıyı
  denetliyor; PDF `%PDF-` imzası şart.
- **`secret-store`:** safeStorage şifreli; plaintext fallback YOK; kısmen
  çözülebilen kasa yeniden yazımı reddediliyor.
- **NDJSON tamponu (`ndjson-lines.js`):** sınır-yeniden-kurma, >max satır
  düşürme + resync, close'ta kısmi satır flush — doğru.
- **Terminal latch + deferred cancel:** tek done/error, `jobStarting`
  tüm await'lerden önce — interleaving deliği yok.
- **Atomik yardımcılar:** `writeJsonAtomic`/`writeSubtitleAtomic`/
  `writeBufferAtomic` tmp+rename doğru; 25 dialog sitesinin tamamı
  `result.canceled` denetimli; `shell:openPath`/`showItemInFolder` consent +
  uzantı beyaz liste + junction-swap yeniden-çözümü.
- **Kuyruk çekirdeği (renderer):** opts dondurma, secret hijyeni, collision
  soneki her başlatmada yeniden üretim, terminal eşleşme jobId kapılı,
  cancel restore'u, 500-cap — doğru.
- **Medya seçim/kademe:** `browser-media.js`/`media-selection.js` alan→piksel
  haritası ve kademe sırası tutarlı; `browser-media-tools.js` spawn yaşam
  döngüsü (settled guard, abort temizliği, 5MB cap) temiz;
  `playback-policy` + `applyPlaybackLearningPolicy` naturalAdvance/loop/
  shadowing/gap kararları tutarlı; `hls-recovery` token/epoch modeli sağlam;
  `browser-chapters`, `cue-timeline-calibration` (offset işareti doğru),
  `live-audio` WAV başlığı, `mini-player` reparent sırası, `reference-media`
  binning, `series-context` binary-search, `skip-segments` suppression —
  hepsi doğrulandı.
- **watch/library deposu (diğer yönler):** tombstone'lu upsert, revizyon
  takibi, migration — kuralları içinde tutarlı (kusur R66-14'teki kapsam
  taşması).

## Taranmayan kapsam (ajan limitine takıldı)

- **`69f9a679` — Öğrenme/notlar/AI:** `browser-learning.js`,
  `browser-note-store.js`, `browser-research-notebook.js`,
  `browser-dialogue.js` (JS), `browser-workflow-recorder.js`,
  `browser-ai-context.js`, `browser-automation-rules.js`,
  `browser-video-analysis.js` (JS), `browser-diagnostics-export.js`.
- **`de02f0fa` — Altyapı+altyazı misc:** `queue-persistence.js`,
  `manifest-transactions.js`, `persistent-schema-inventory.js`,
  `renderer-ui-model.js`, `subtitle-*` yardımcıları (corpus-discovery,
  encoding-preview, export-validation, find-replace, output-contract,
  pair-quality, sentence-layout, word-sidecar), `text-stability-evaluator.js`,
  `workspace-package.js`, `workspace-video-package.js`, `pdf-translate.js`,
  `translation-endpoints.js`, `youtube-player-response-pruner.js`,
  `browser-adblock.js`, `browser-adapters.js`, `browser-adapter-registry.js`.

Bu iki kapsam için bulgu iddiası yok — dosyalar incelenmedi.

## Doğrulama durumu

- R66-01: kaynak-analiz kanıtı (Electron emit filtresi deterministik);
  ağaçta kapı doğrulandı (`browser-command-palette.js:31`, `main.js:10527`).
  Gerçek Electron koşusu ek kanıt olur ama kontrol-akışı kesin.
- R66-02/03/05/07/09/10: güncel ağaçta satır-satır doğrulandı.
- R66-04: `writeTextAtomic` tanımsızlığı tüm-ağaç grep ile doğrulandı
  (bilinen R46-09, açık).
- R66-08/11/12/13/14/15 + P3'ler: ajan kaynak-kanıtı + nokta kontrolleri;
  çalışma-zamanı repro'su koşulmadı (salt-okunur audit).
- Paralel workstream'in açık işi ağaçta duruyor; bu rapor ona dokunmadı.

## Handoff

Önce R66-01/02/03'ü (P1) onarın; her biri için önce başarısız regresyon
testi (rawKeyDown fixture'ı, stream-error simülasyonu, done→rescan→requeue
döngüsü), sonra minimal sahip-modül değişikliği, hedefli + tam paket koşusu.
R66-08 için `SENSITIVE_KEY_NAMES`'i bilinen imzalı-URL parametre listeleriyle
(Aliyun/Tencent/Baidu/Wowza/GCS/OAuth 1.0a) genişletip `isSensitiveKey`-only
tüketicilerin `x-goog-*` prefix'ini de görmesini sağlayın. Taranmayan iki
kapsamı sonraki turda ayrıca gönderin.
