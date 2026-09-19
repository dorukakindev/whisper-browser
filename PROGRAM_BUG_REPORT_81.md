# PROGRAM_BUG_REPORT_81 — R79/R80 bağımsız doğrulama turu (2026-09-19 ~15:10)

Paralel oturumların ürettiği `PROGRAM_BUG_REPORT_79.md` ve `PROGRAM_BUG_REPORT_80.md`
bulguları kaynakta **satır satır yeniden doğrulandı**. Ürün/test kodunda değişiklik yok;
bu rapor yalnız doğrulama kararlarını içerir.

## Sonuç: 8/8 bulgu doğru, 0 yanlış pozitif

| Bulgu | Karar | Doğrulama kanıtı (satır) |
|---|---|---|
| P79‑01 SDH 10.3× | **DOĞRU** | `backend/subtitle_sdh.py:35` `{_key(term) for term in _SDH}` (65×NFKD+regex her çağrı) + `:40-43` `modifiers` set'i fonksiyon içinde → değer için 1 + terimler için 65 = **66 `_key()`/çağrı**; `_SPEAKER`/`_SDH` zaten `frozenset` — türevlerin modül düzeyine taşınması davranışı değiştirmez |
| P79‑02 TM 19.5 ms/lookup | **DOĞRU** | `backend/translation_memory.py:192` `…LIMIT 240` → `:195-197` her adayda `SequenceMatcher(…).ratio()` + geçenlerde `fuzzy_semantically_compatible` (içinde ikinci SequenceMatcher). Ucuz-kapı önerisi geçerli: `fuzzy_semantically_compatible`'in token-sayısı şartı `ratio()`'dan önce uygulanabilir |
| P79‑03 fitTranslationParts 50–90 ms | **DOĞRU** | `src/subtitle-sentence-layout.js:251` sınır `words.length > 400 \|\| count > 12`; `:261` `cuts: [...state.cuts, end]` — her geçişte dizi kopyası → işaretçi DP'nin 1.36–1.39× "aynı çıktı" iddiası yapıyla uyumlu; pencereli DP çıktıyı değiştirebilir → raporun "altın korpus şart" uyarısı doğru ihtiyat |
| P79‑04 anlamsal arama istek-başına model | **DOĞRU** | `src/browser-media-tools.js:57` her `python()` çağrısı yeni `run()` (yeni süreç); `backend/browser_media_tools.py:67` `model = SentenceTransformer(MODEL, device="cpu")` `semantic_search` içinde, `main()` tek istek okuyup çıkıyor → **her sorgu = süreç + model yükleme**. NDJSON işçi deseni önerisi `transcribe.py`/`live_asr.py` ile uyumlu |
| C79‑01 8 backend modülü testsiz | **DOĞRU** | `browser_align`, `browser_media_tools`, `browser_video_analysis`, `catalog_scan`, `ndjson_utils`, `nmdb_catalog_import`, `separate_dialogue`, `workspace_video_package` → `backend/test_*.py` + `tests/` içinde **0 referans** (grep ile ölçüldü) |
| D79‑01 R78 düzeltmesi | **DOĞRU** | `src/main.js:461` `new BrowserClosedTabHistory(20)` bellek-içi; sızıntı yüzeyleri doğru: `browser-session-store.js:174` `safePlaceUrl(raw.url)` (kalıcı sekmeler) + `browser-session-package.js:44` → `main.js:13741-13748` `showSaveDialog`+`writeFileSync` (dışa aktarım). Önek regex'i `browser-sensitive-keys.js:67`'de (`:64` fonksiyon tanımıydı — atıf düzeltmesi doğru) |
| B80‑01 yedek sır sızıntısı **P2** | **DOĞRU** | `endpointSetting` (`settings-security.js:165-176`) yalnız şema+userinfo denetler, **sorgu taramaz** → `?api_key=`/`?token=`'li `translateBaseUrl` kabul edilir. `collectSecretValues` (`:475-481`) yalnız adlandırılmış sır alanlarını toplar → URL'deki sır `[GİZLİ]` kümesine girmez. `redactForBackup` (`:496-511`) yalnız `isSecretKey`/`DANGEROUS_KEYS` adlı anahtarları düşer → `settings.ui.translateBaseUrl` yedeğe düz metin düşer, `secretsExcluded: true` sözleşmesi ihlal. `endpointIdentity` (`:235`) `custom:${custom.toLowerCase()}` tam URL'yi kimliğe katar. Proje içi emsal doğru: `queue-persistence.js:16` `SENSITIVE_URL_PARAMS` + `:32-34` `searchParams.delete` — "URL sırrı kalıcılığa girmez" ilkesi yerleşik, yedek yolu tek istisna |
| B80‑02 probeCommand stderr **P3** | **DOĞRU (latent)** | İki kopya doğrulandı: `src/process-io.js:30-36` yalnız `stdout` dinler (stderr yok; 8 s/64 KB); `src/main.js:15569-15598` üretim kopyası da yalnız `p.stdout.on('data')` (`:15592`) — **stderr hiç tüketilmiyor**, `out += d` üst sınırsız, 30 s + `terminateProcessTree`. stderr borusu dolarsa çocuk bloklanır → `close` gelmez → zaman aşımı `null` (stdout'ta doğru cevap dururken). "Test edilen kopya üretimde değil" tespiti doğru |

## Ek notlar

- İki raporun "elenen adaylar" listeleri de tutarlı (R73 turundaki FP kalıplarının aynısı:
  backward-iter güvenli, `prev.queued` koruması, modül-düzeyi derlemeler).
- B80‑01'in düzeltme taslağı (ortak `SENSITIVE_URL_PARAMS`, `endpointIdentity`'yi
  origin+path'e indirgeme, yedekte `*BaseUrl` sorgu/fragment düşürme) kaynakla uyumlu —
  uygulanırken `publicSettings` redaksiyonunun da aynı katmandan geçmesi gerektiği unutulmamalı.
- B80‑02'nin "tek paylaşılan probeCommand" önerisi doğru: `main.js` kopyası
  `terminateProcessTree`'ye bağımlı, test kopyası değil — birleştirirken iki davranışı da
  parametreleştirmek gerekir.
- R79 §5'teki açık maddeler (DRM `mediaKeySystem` zinciri, `details.mediaTypes`, `'ask'`
  üç durumlu işleyici, smoke envanteri, çeviri kanalı senkron yarışı) bu turda
  kapsam dışı — ayrı doğrulama ister.

**Karar:** İki rapor da güvenilir; bulgular düzeltmeye hazır (P2 öncelikli: B80‑01).

---

# BÖLÜM 2 — Paralel AI diff incelemesi (commit `59174a7` + çalışma ağacı)

İncelenen kapsam: `feat(player): streamline YouTube device login and TV browsing`
(215 satır, 5 dosya) + commit'lenmemiş çalışma-ağacı diff'i (sidebar sıralaması,
`.browsing` yüzey ayrımı, `feed_partial` progressive preview, feed retry/loading UX).

## Karar: yapı sağlam, ürün hatası yok; 4 nit

**Doğrulanan doğruluklar:**

- **OAuth kuşak refaktörü tutarlı.** `openYoutubeLogin` → `openingGen` → `startYoutubeDeviceFlow`
  zinciri `_ytFlowGen` ile korunuyor; eski akışın `finally`'si `gen === _ytFlowGen` şartıyla
  yeni akışın `_ytPolling` bayrağını temizlemiyor. `closeYoutubeLogin` (`:23253-23266`)
  tüm çıkış yollarında `gen++` + `youtubeCancel` + `_ytPolling=false` yapıyor →
  "sonsuz _ytPolling" senaryosu kapalı. Çift-cancel düzeltmesinin gerekçesi (kapanış yolu
  zaten iptal ederken yeniden cancel'ın yeni kuşağı öldürmesi) kod yoluyla uyumlu.
- **`else if (!feedData)` dallanması doğru.** `home` + girişli → `FEwhat_to_watch`;
  kişisel akış boş/hatalıysa `feedData=null` kalır → Invidious genel akışına düşer +
  `youtubeHomeFallback` notu. `subscriptions` hatasında `feedData={}` kalır → Invidious'a
  düşmez (YouTube otoritesi korunur — bilinçli).
- **`feed_partial` tüketicisi iyi kapılı** (`renderer.js:24222-24233`): `requestId ===
  stActiveHomeRequestId` + `stCurrentSection==='home'` + `!stSearchActive` + görünürlük +
  `previewRequestId` dedupe → bayat/yabancı önizleme giremez.
- **`.browsing` yüzey ayrımı** tutarlı: JS `playerStage.classList.toggle('browsing')` ↔
  CSS `display:none` (controls/subtitle/resume-chip) ↔ smoke probu (`browseControlsHidden`,
  `playbackControlsRestored`).
- **`showError`+retry**: `grid.innerHTML=''` loading div'i temizler; retry `force:true`
  ile yeni seq açar → eski akış stale.
- **a11y**: `role="status"`+`aria-live="polite"` poll durumu ve loading için doğru.

**Nit'ler (P3 — engel değil):**

| # | Konum | Not |
|---|---|---|
| N1 | `feed_partial` → full render | Ana süreç partial'ı resolve'dan **sonra** emit edebilirse (şu an emit→resolve sırası) geç gelen önizleme tam grid'in üstüne yazar. `previewRequestId` dedupe sadece aynı request'in ikinci partial'ını engeller; "full geldi" bilgisini denetlemiyor. Main tarafı emit sırasını koruduğu sürece latent. |
| N2 | `setSmartTubeVisible` → `stCloseBrowser` | Görünürlük yalnız toggle anında `player.mediaKey`'e göre değerlendiriliyor; browse açıkken medya sonlanırsa düğme bayat kalır (sonraki toggle'a dek). |
| N3 | `openYoutubeLogin` akışı | İstemcisiz kullanıcıda diyalog önce `ytDeviceView` gösterip sonra `ytClientView`'a döner — kısa görsel flaş (kabul edilebilir, belki başlangıç görünümünü session sonucuna ertelemek daha temiz). |
| N4 | `youtubeCancel` fire-and-forget | Main tarafındaki poll döngüsü iptal geç uygularsa yeniden açılan akış aynı istemci durumunda ikinci `youtubePoll` başlatabilir; main'in kuyruklamasına bağlı — latent. |

**Smoke değişikliği** (`electron-smarttube-boot.smoke.js`): `failNextHome`/`slowNextHome`
mock kolları + `feed_partial` emit'i + browsing/close-hidden/sepFullRow probları — yeni
davranışların regresyon koruması yerinde.

---

# BÖLÜM 3 — Bağımsız derin denetim (salt-okunur)

Beş yüzey tarandı: IPC güvenlik, performans, i18n, test kapsamı, kalıcılık.

## D81‑01 — **P2 (i18n boşluğu, doğrulandı)** — 262 Türkçe UI dizgesi yerelleştirme tablosunda yok

**Mekanizma:** `ui-locale.js` TR→EN tablosu + `MutationObserver` (`:1329`) DOM'daki Türkçe
metinleri tablo eşleşmesiyle İngilizceye çevirir. **Tabloda olmayan dizge EN modunda
Türkçe kalır.**

**Ölçüm** (`node _repro/audit-i18n.js`): renderer.js'deki `osd/setStatus/textContent/
placeholder/status` atamalarındaki Türkçe dizgeler — **57 tabloda var, 262 yok.**

Örnekler: `'Çalışıyor'` (`:149`, `:744`, `:3093`, `:4540`, `:4595` — iş durumu rozeti),
`'Tamamlandı'` (`:3165`), `'İptal edildi'` (`:4196`), `'İptal doğrulanamadı…'` (`:3134`),
`'Dosya seçimi bekleniyor…'` (`:2957`), `'AI işi iptal edildi.'` (`:3129`),
`'Kuyruk boş. Bir kaynak seçip…'` (`:606`), `'Henüz terim yok…'` (`:2032`).

**Notlar / abartmama:** (a) sayı üst sınırdır — interpolasyonlu şablon dizgeler (`${…}`)
kısmi eşleşmeyle yine de çevrilebilir, `(İndirilenler\Whisper\…)` gibi dosya-yolu
varsayılanları veri sayılabilir; (b) EN modunun gerçek görünümü dinamik doğrulanmadı —
statik analiz + tablo-sözlük kesişimi. (c) `AGENTS.md` "yeni kullanıcı metinlerinde iki
dili de planla" kuralıyla uyumlu düzeltme: eksikleri tabloya eklemek yeterli, kod
değişikliği gerektirmez.

**Öneri:** `_repro/audit-i18n.js`'nin çıktısı `ui-locale.js` entries listesine
toplu ek adayı olarak kullanılabilir; CI'a "tabloda olmayan TR UI dizgesi" denetimi eklenebilir.

## D81‑02 — IPC güvenlik yüzeyi: temiz

- `src/main.js`'te **185 `ipcMain.handle`** — her birinin gövdesinde ilk ~14 satırda
  `authorizedBrowserSender`/`senderFrame` denetimi var → **guard'sız handler 0**
  (statik tarama, `_repro` olmadan node one-liner ile).
- `executeJavaScript` sink sayısı: `main.js` 22 + `browser-feature-services.js` 6 —
  tek-tek enjeksiyon-kaynağı denetimi bu turun kapsamı dışında (yüzey sayısı kayda alındı).

## D81‑03 — Performans: P79‑01 deseni tek örnek, yeni isabet yok

- `def` içinde `{f(x) for x in _MODUL_SETI}` / fonksiyon-içi `set(dict)` deseni
  6 backend dosyasında tarandı (`subtitle_sdh`, `transcribe`, `youtube`, `invidious`,
  `media`, `live_asr`) → **yalnız zaten raporlanan `subtitle_sdh.py:35`** çıktı.
  P79‑01'in "genel ders" korkusu bu kapsamda doğrulanmadı — sorun lokal.
- `renderer.js`'te 69 `new Map()/Set()` — sınırlılık sınıflandırması yapılmadı
  (envanter notu; çoğu yaşam-döngüsüne bağlı state'tir, tek tek analiz ister).

## D81‑04 — Test kapsamı: browser modülleri iyi durumda

`src/browser-*.js` ~90 modülün yalnız **3'ü** hiçbir testte anılmıyor:
`browser-dialogue`, `browser-mini-preload`, `browser-sensitive-keys`.
(C79‑01'in 8 backend modülü ayrı bulgu — orada kör nokta daha büyük.)

## D81‑05 — Kalıcılık: ayar yolu sağlam, localStorage savunmasız kısımlar var

- `settings.json` yalnız `writeJsonTransaction` üzerinden yazılıyor (3 çağrı noktası,
  doğrudan `writeFileSync(settings.json)` yok) → atomik + journal'lı.
- `localStorage` erişimi: 61 nokta, **27'si satır-içi korumasız** (try/catch yok;
  fonksiyon-düzeyi sarmalama sınıflandırılmadı). Electron'da kota/devre-dışı kenarı
  nadir → P4 hijyen notu; `safeStorage` sarmalayıcı önerilebilir.
