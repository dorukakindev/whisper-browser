# R125 — A'dan Z'ye derin bug denetimi (kod değiştirmeden)

Tarih: 2026-09-25. Dal: `haze/bug-report-2026-09-24`. Başlangıç HEAD: `b32536689497b33c5bcef05e93c4dc264fe179f1`.
Kapsam (bu tur): `src/watch-index.js`, `src/browser-page-index.js`, `src/queue-persistence.js`,
`src/pipeline-job.js`, `src/watch-folder.js`, `src/watch-library-store.js`, `src/watch-library-state.js`,
`src/watch-library-view.js`, `src/player-task-center.js`, `src/burnin-output.js`, `src/manifest-transactions.js`,
`src/browser-subtitle-files.js`, `src/secret-store.js`, `src/local-file-access.js`, `src/browser-subtitle-output.js`,
`src/browser-subtitle-sync.js`, `src/media-folders.js`, `src/ytdlp-runtime.js`, `src/browser-asset-gc.js`,
`src/renderer/queue-lifecycle.js`, `src/renderer/status-copy.js`, `src/subtitle-find-replace.js`,
`src/subtitle-sentence-layout.js`, `src/subtitle-pair-quality.js`, `src/subtitle-output-contract.js`,
`src/browser-place-url.js`, `src/process-io.js` ve `src/main.js`'in ilgili bölümleri
(`probeCommand`, `scheduleBrowserPageIndex`, `rememberBrowserVisit`, çeviri decode çağrıları).
Bu turda ürün kodu değiştirilmedi; yalnız rapor üretildi.

## Özet

| Kimlik | Seviye | Bileşen | Durum |
|---|---|---|---|
| R125-01 | P2 | `watch-index.js::safePageIndexUrl` → `pages` tablosu | Kesin — sorgu anahtarlı sayfalar tek kayda çöker, saklanan adres ölü bağlantı |
| R125-02 | P3 | `src/process-io.js` ↔ `main.js` yerel `probeCommand` | Kesin — ayrışmış kopya; modül sürümü stderr kilitlenmesiyle `null` döner |
| R125-03 | P3 | `watch-library-store.js::canonicalWatchKey` (+ `browser-subtitle-files.js`) | Kesin — case-sensitive dosya sisteminde farklı dosyalar tek anahtara birleşir |
| R125-04 | P3 | `renderer/status-copy.js::clock` | Kesin — `Infinity`/dev değerlerde `"Infinity:NaN"` (R93-05 sınıfının ikinci örneği) |
| — | — | `manifest-transactions`, `watch-library-state`, `secret-store`, `queue-lifecycle`, `escapeAssText`↔`parseAss` WJ gidiş-dönüşü, `subtitle-sentence-layout`, `browser-subtitle-sync`, `local-file-access`, `burnin-output`, `queue-persistence`, `mergeBrowserStreamCues`, `subtitle-pair-quality` | İncelendi, reddedildi (bulgu değil) |

Tam `npm test` paketi bu oturumda koşuldu: **tüm testler geçti** (exit 0; son satır
"Tüm testler geçti"). Ürün kodu değiştirilmedi.

---

## Kesin bulgu: R125-01 — `safePageIndexUrl` sorgu+hash'i toptan atıyor, sayfa indeksi çöküyor

- **Dosya/satır:** `src/watch-index.js:37-47` (`safePageIndexUrl`), `:339-353` (`upsertPage`),
  şema `:168-174` (`pages.url TEXT NOT NULL UNIQUE`). Çağrı zinciri:
  `src/main.js:4249-4267` `scheduleBrowserPageIndex` → `src/browser-page-index.js:17-41`
  `runBrowserPageIndexCapture` → `upsertPage(page)` (`main.js:4264`).
  Okuyucu: `main.js:3305` `watchIndex().searchPages(...)` (omnibox/sayfa araması).
- **Kök neden:** `safePageIndexUrl` `parsed.search = ''` ve `parsed.hash = ''` yapar.
  `pages` tablosu `UNIQUE(url)` + `ON CONFLICT(url) DO UPDATE` ile anahtarlanır; dolayısıyla
  sorguyla ayrışan tüm sayfalar **tek satıra** düşer ve son ziyaret öncekinin üstüne yazar.
- **Kullanıcı etkisi:** Uygulamanın ana senaryosu video izleme; `youtube.com/watch?v=A` ile
  `?v=B` aynı anahtara çöktüğü için sayfa indeksi site-yolu başına yalnızca **son ziyaret edilen**
  sayfayı tutar. Ayrıca saklanan `https://www.youtube.com/watch` adresi `v` parametresi olmadan
  **çalışmayan bir bağlantıdır**; arama sonucuna tıklamak boş/ana sayfaya gider. Hash-rotalı
  SPA'lar (`#/player/42`) tamamen köke çöker.
- **Repo içi çelişki:** Aynı oturumda `safePlaceUrl`/`redactUrlSensitiveParams`
  (`browser-place-url.js`) ve `canonicalBrowserUrl` (`watch-library-store.js`) sorguyu **koruyup**
  yalnız hassas/izleme parametrelerini siliyor; geçmiş ve izleme anahtarları videoları doğru
  ayırt ediyor. Sayfa indeksi aynı gizlilik hedefi için aşırı budama yapıyor.
- **Deterministik yeniden üretim (bu oturumda koşuldu):**

  ```text
  "https://www.youtube.com/watch?v=abc123"      -> "https://www.youtube.com/watch"
  "https://www.youtube.com/watch?v=xyz789&t=44" -> "https://www.youtube.com/watch"
  iki farkli video ayni anahtar mi: true
  safePlaceUrl (yer imleri) ise sorguyu korur: https://www.youtube.com/watch?v=abc123
  hash-rotali SPA: https://app.example.com/#/player/42 -> "https://app.example.com/"
  ```

- **Öneri:** `safePageIndexUrl` yerine `browser-place-url.js`'deki seçici temizliği
  (`sensitive`/`hasSensitivePrefix`/`tracking` filtreleri, route-hash koruması) kullan;
  ya da anahtar için temizlenmiş tam URL'yi, gösterim için kısaltılmış adresi ayrı sakla.

## Kesin bulgu: R125-02 — `src/process-io.js` ayrışmış kopya; stderr tamponu kilitlenmesi

- **Dosya/satır:** `src/process-io.js:5-42` (`probeCommand`). Karşılaştırma sürümü
  `src/main.js` içinde yerel `probeCommand` (modül **değil** — `terminateProcessTree`,
  `stderr.resume()`, 256 KB en-iyi-gayret tamponu, `unref`'li zamanlayıcı).
- **Kök neden:** Modül sürümü `child.stderr`'i hiç tüketmez. Pipe tamponu dolunca child
  `write(stderr)`'de bloklanır; `stdout`'a hiç ulaşamaz, `close` gelmez → zamanlayıcı
  `child.kill()` yapar ve `null` döner. Ayrıca `output > maxChars` (64 KB) anında
  **tüm sonucu** `null`'a düşürür; main.js sürümü ilk satırı korur. `kill()` ağaç değil
  (Windows'ta torun süreçler kalabilir) ve zamanlayıcı `unref` değil.
- **Erişilebilirlik:** Modülü üretimde **hiçbir şey çağırmıyor** — tek tüketici
  `tests/process-io.test.js`. Yani bug "uyuyor": yarın bir IPC/handler bu modülü `require`
  ederse stderr basan komutlar sessizce `null` döner ve testler bunu yakalamaz (testte
  stderr basan child yok). Ek risk: testler **yanlış sürümü** doğruluyor — yeşil paket
  prod'daki davranış hakkında yanlış güven veriyor.
- **Deterministik yeniden üretim (bu oturumda koşuldu):**

  ```text
  child: 256 KB stderr -> stdout 'ok' -> exit 0
  modül probeCommand sonucu : null   (5009 ms — tam zaman aşımı)
  aynı child + stderr.resume(): "ok" (54 ms, kod 0)
  ```

- **Öneri:** Tek doğruyu seç: ya `main.js` modülü kullanacak şekilde değiştirilsin
  (modül `stderr.resume()` + ağaç-kill + unref kazanır), ya da `process-io.js` silinip
  testler yerel sürüme taşınsın. İki kopyanın yaşaması R-serisi denetimlerde tekrar
  yakalanan "aynı sınıf iki yerde" deseninin tipik örneği.

## Kesin bulgu: R125-03 — `canonicalWatchKey` `file:` yolunu koşulsuz küçük harfe indiriyor

- **Dosya/satır:** `src/watch-library-store.js:56`
  (`'file:' + key.slice(5).replace(/\\/g,'/').toLowerCase()`). Aynı sınıf:
  `src/browser-subtitle-files.js:8,14,40-41` (`directoryKey`, `protectedSet`,
  `isOwnedFile` hep `toLowerCase()` karşılaştırması).
- **Kök neden:** Windows'ta NTFS büyük/küçük harf duyarsız olduğu için lowercase
  normalizasyon orada doğru; fakat AGENTS.md'ye göre geliştirme ortamı Ubuntu ve
  kod platform ayrımı yapmıyor. Case-sensitive dosya sisteminde
  `file:/media/Film-A.mkv` ile `file:/media/film-a.mkv` **farklı dosyalardır** ama
  aynı kütüphane anahtarına düşer.
- **Kullanıcı etkisi:** Linux/macOS'ta (case-sensitive FS) adı yalnız harf büyüklüğüyle
  ayrışan iki medya dosyası tek izleme kaydına birleşir: oturumlar/prefs birleşir,
  `completed`/`lastWatched` karışır, birinin silinmesi diğerini de siler.
  `browser-subtitle-files` tarafında `isOwnedFile` lowercase dizin karşılaştırması
  yapıldığından `/TMP/subs` gibi birebir-olmayan dizin `/tmp/subs` deposuna "owned"
  sayılabilir ve `touch()`'un budaması yanlış dizinden dosya silebilir.
- **Deterministik yeniden üretim (bu oturumda koşuldu):**

  ```text
  canonicalWatchKey('file:/media/Film-A.mkv') -> file:/media/film-a.mkv
  canonicalWatchKey('file:/media/film-a.mkv') -> file:/media/film-a.mkv
  iki farkli dosya ayni anahtar mi: true
  ```

- **Öneri:** `process.platform === 'win32'` koşuluna bağla (bu kalıp zaten
  `local-file-access.js` `key()` metotlarında kullanılıyor) veya `fs.realpath` +
  platform duyarlı normalize. `browser-subtitle-files` için de aynı platform koşulu.

## Kesin bulgu: R125-04 — `StatusCopy.clock` sınırsız değerde bozuk etiket üretiyor

- **Dosya/satır:** `src/renderer/status-copy.js:9-12` (`clock`), tüketen
  `burnIn` `'progress'` kolu (`:42-50`).
- **Kök neden:** `Math.max(0, Math.floor(Number(seconds) || 0))` — `Infinity` truthy
  olduğu için `|| 0` devreye girmez, `Math.floor(Infinity)` = `Infinity` geçer.
  `Infinity % 60` = `NaN` → etiket `"Infinity:NaN"`. Dev finite değerlerde de
  (`1e308`) saat alanı üstel gösterime düşer: `"1.6666666666666665e+306:56"`.
- **Sınıf notu:** R93-05'te aynı desen `browser-transcript-search.js` saat
  gösteriminde bulunup doğrulanmıştı; bu ikinci örnek desenin modüller arasında
  kaldığını gösteriyor. `burnin:event` `current`/`total` ffmpeg ilerlemesinden
  beslenir — normalde sonlu, ama ayrıştırma/süre bilinmeyen akışlarda sınır
  değer UI'a sızabilir.
- **Deterministik yeniden üretim:**

  ```text
  clock(Infinity) = "Infinity:NaN"
  clock(1e308)    = "1.6666666666666665e+306:56"
  clock(3661)     = "61:01"     (sağlıklı)
  clock(NaN)      = "0:00"      (sağlıklı)
  ```

- **Öneri:** `Number.isFinite` kontrolü ekle; sonlu değilse `0`/boş. R93-05
  düzeltmesiyle aynı koruma buraya da uygulanmalı.

---

## İncelenip reddedilen adaylar (bulgu değil)

- **`manifest-transactions.js`** — 304+validator-mismatch, fingerprint dedupe,
  in-flight token, üstel backoff+cooldown, epoch reset: tutarlı, yarış güvenli.
- **`watch-library-state.js`** — revision/`_createdRevision`/tombstone semantiği,
  `canApplyField` progress gating'i, oturum birleştirme (`mergeSession`) doğru.
- **`secret-store.js`** — kısmen-çözülebilen kasaya yazma reddi, `.bak` önce-iyi-kopya
  sıralaması, proto-pollution koruması, export redaksiyonu sağlam.
- **`queue-lifecycle.js`** — terminal latch, tek-açık-run invariant'ı, iptal/exit
  sentezi, single-flight scheduler: doğru.
- **`browser-subtitle-output.js` ↔ `browser-subtitles.js`** — `escapeAssText`'in
  U+2060 işaretlemesi (`\{⁠`, `\⁠N`) `parseAss`'te birebir geri çözülüyor;
  `stripAssOverrideBlocks`/`stripAssDrawing` işaretli dizilere dokunmuyor.
  Gidiş-dönüş doğrulandı.
- **`subtitle-sentence-layout.js`** — sayı/saat/inkâr koruma kontrolleri,
  400-kelime/12-parça sınırlı DP bölme, `decodeSentenceTranslation` JSON kafes
  soyma: tutarlı.
- **`browser-subtitle-sync.js`** — iki-nokta ölçek reddi (`<1s` span), hash'te
  görünmez-karakter ayıklama, append-only prefix uyumu: doğru.
- **`local-file-access.js`** — `\\?\`/`\\.\` red, realpath-canonicalization
  (symlink/ADS), çift uzantı kontrolü, boyut/imza sınırları: sağlam.
- **`burnin-output.js`** — replace-backup/geri-yükleme, token'lı temp deseni,
  mtime-taze çıktı kontrolü, PID+ad+yaş süreç eşleşmesi: sağlam.
- **`queue-persistence.js`** — stale snapshot'ta terminal sonuçların korunması,
  `exit`+`cancelled` → pending sentezi, sürüm+sağlık kapıları: doğru.
- **`browser-subtitle-files.js`** temizlik politikası (yalnız kendi adlandırma
  desenlerini siler, protectedSet) — lowercase karşılaştırma kısmı R125-03'te;
  geri kalanı sağlam.
- **`media-folders.js`, `ytdlp-runtime.js`, `browser-asset-gc.js`,
  `watch-library-view.js`, `player-task-center.js`, `status-copy.js` (R125-04 dışında),
  `subtitle-find-replace.js`, `subtitle-pair-quality.js`, `subtitle-output-contract.js`,
  `browser-page-index.js` (staleness üretimleri doğru), `queue-lifecycle.js` —
  inceleme temiz.

## Doğrulama

- `npm test` — tam paket, exit 0, "Tüm testler geçti" (Node + Python unittest'ler dahil).
- Tüm bulgular bu oturumda `node -e` prob'larıyla yeniden üretildi; çıktılar yukarıda.
- Ürün kodu değişmedi; tek dosya bu rapor.
