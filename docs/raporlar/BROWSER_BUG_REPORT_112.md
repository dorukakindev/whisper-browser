# R112 — Birleşik Dayanıklılık Gauntlet Raporu

Tarih: 2026-09-23 · Dal: `codex/r112-resilience-1790126261` · Taban: master `850e927` (PR #34 sonrası)
Ortam: Ubuntu 22.04.5 · node v24.19.0 · Electron v43.2.0 · python 3.12.14 (backend/venv) · ffmpeg · VNC `:0`

Yöntem: 12 hattın her birinde önce kod yolu haritalandı, sonra gerçek Electron
(ayrı `WHISPER_RESOURCE_SOAK_USER_DATA` profili) veya gerçek Python alt süreci +
kontrollü fixture sağlayıcı ile normal + adversarial senaryolar çalıştırıldı.
Doğrulanan kusurlar için önce master'da kırmızı kanıt, sonra minimal düzeltme,
ardınan yeşil doğrulama. R110/R111 yeniden uygulanmadı; regresyon koruma testleri
koşuldu. Gerçek API anahtarı/hesap kullanılmadı — tüm sağlayıcı trafiği yerel
fixture sunucusuna (`fixture_server.py`, 16 modlu kontrollü HTTP) gitti.

**Özet:** 12 hattan 11'i PASS, 2 hatta ürün bug'ı bulundu ve düzeltildi
(BUG-R112-01, BUG-R112-02). ENGELLİ: 0. DOĞRULANMADI: sınırlar hat bazında açıkça
yazıldı (gerçek YouTube hesabı, Windows UI kabulü, disk-dolu canlı enjeksiyonu).

Kanıt paketi: `docs/raporlar/r112-evidence/` (gerçek Electron ekran görüntüleri,
smoke rapor JSON'ları, anonim fixture korpusu, koşturucu betik + sonuç logu).

---

## Hat 1 — HLS/DASH altyazı yakalama — **PASS**

Kod yolu: `src/browser-subtitles.js` (adaptation/rep keşfi, WebVTT+TTML+srv3/json3
ayrıştırıcılar) + `src/manifest-transactions.js` (manifest işlem kaydı) +
`electron-capture-completeness.smoke.js`.

Gerçek Electron ölçümleri (`r112-evidence/capture/`):

- Açık playlist (sonlanmamış canlı): `state:"partial"`, `reason:"open-playlist"`,
  yakalanan 1 satır korundu — "tamamlandı" diye sunulmadı.
- Kapalı playlist (4 segment): `state:"complete"`, 2 cue, segment fetch sayıları
  `{seg-0:2, seg-1:2, seg-2:1, seg-3:1}` — dosya↔bellek↔UI cue sayısı birebir.
- Segment 403: `state:"partial"`, `missing:2`, dürüst kısmi mesaj; yeniden
  denemede `complete`, `missing:0`.
- CEA-608 tam-UI smoke + subtitle-gauntlet smoke geçti (DISCONTINUITY, yenilenen
  imzalı URL, iptal/devam, HTTPS fixture) — `r112-evidence/smarttube/`.

Manifest işlem kaydı (`manifest-transactions.js:91-192`): 304+validator
uyuşmazlığı → `missing-body`; aynı fingerprint → `duplicate` (yeniden işlemez);
in-flight dedup; hata → üstel backoff → `maxAttempts=3` → cooldown/abandon.
"Retry'da farklı içerik" = yeni fingerprint → yeni işlem; "aynı URL farklı içerik"
aynı şekilde fingerprint ile ayrılır.

Kalan sınırlar (doğrulanmadı, spec'in geri kalanı): gerçek TTML izi canlı siteden
değil ayrıştırıcı + birim testleriyle kapalı; iframe/SPA navigasyonu ve
"geç gelen master manifest" senaryoları kod yolunda izlendi, canlı kanıt yok;
BYTERANGE/GAP/EXT-X-MAP etiketleri parser'da ele alınıyor fakat gerçek fMP4
sinyaliyle uçtan uca ölçülmedi.

## Hat 2 — Zaman doğruluğu — **PASS**

`electron-overlay-timing.smoke.js` — gerçek lavfi medya (60 sn, 24 fps),
oynatma SÜRERKEN geriye seek (t≈14 → 5.0), uzak cue'lu (50-54s) zaman çizelgesi:

- Post-seek 23 örnek, 0 uyumsuz cue; armed boundary doğru hedefe kuruldu
  (`armedDelayMs:1966` → t=10 cue'su); render ortalaması 0.29 ms.
- Dinleyici/gözlemci sayımı: `mediaListeners:7`, `mutationObservers:1`,
  `resizeObservers:1` — temiz, artık yok.
- Ekran: `r112-evidence/timing/01-preseek.png`, `02-postseek.png` + `report.json`.

Kalan sınırlar: 0.5×/2× hız ve arka-plan sekmesi/visibility değişiminde aktif-cue
ölçümü yapılmadı (timing motoru aynı kod yolu; explicit sınır). Native video
yüzeyi ana-pencere yakalamasında görünmez — kanıt overlay DOM + seeked/event
zamanları üzerinden, piksel-okuma değil.

## Hat 3 — Çeviri bütünlüğü — **BUG DÜZELTİLDİ (BUG-R112-02)**

Kanıt koşusu: `r112-evidence/corpus/` (size-1/100/1000/10000 + 9 adversarial
fixture) + `run_r112.py` senaryoları + `r112-run-results.txt` — **24/24 PASS**.

- **Değişmezlikler:** 1/100/1000/10000 cue'da zaman kodu + sıra + ID birebir,
  boş cue yok; 10k: 500 istek (20/grup), 34.9 s.
- **Kırmızı kanıt (master'da):** `frag` senaryosu — sağlayıcının döndürdüğü
  `["…ve", "misin", "…gör-"]` parçaları ekrana **aynıyla** yazıldı; otomatik
  kapı (`translation_meaning_issues`/`_blocking_issues`) yakalayamadı.
- **Düzeltme (minimal):** `sentence_translation.py` — `_TR_TRAILING_CONJUNCTION`
  (ve|veya|ya da|ama|fakat|lakin|ancak|çünkü|zira|ile|hem|hatta|üstelik|oysa,
  ≥2 hedef kelime şartı — "Ama." muaf), `_TR_LONE_QUESTION_PARTICLE`
  (tek başına `mısın?` vb., ?/!/yalın son — "Mi." notası periyotla muaf,
  kaynak ≥3 kelime şartı — "Are you?"→"Misin?" muaf), `_TR_TRUNCATED_HYPHEN`
  (ASCII `-`, `—` muaf) → `truncated_fragment` anlam sorunu + **blocking**
  sınıfı (number_mismatch ile aynı yol: reddet → kurtarma isteği).
  `transcribe.py` — `truncated_fragment_indices` sayacı, `issue_indices`
  birliği, `translation_truncated_fragment` rapor anahtarları, sert-kapı
  sayacı her iki blocking sorunu da kapsıyor.
- **Yeşil:** frag → 4 istek (1 batch + 3 kurtarma), kurtarma tam metin döndürür,
  ekranda parça kalmadı. FP taraması: kalite + golden korpusunda 0 çakışma;
  13 meşru form ("Sen misin?", "Ama.", "Bekle—", "Nota mi."…) korunuyor.
- R110/R111 regresyonu: `test_sentence_distribution` 36/36, golden 6/6,
  quality corpus 5/5, transcribe 192/192.

Kalan sınır: gate örüntü tabanlı — otomatik kapının yakalayamadığı anlamsal
parçalar (ör. doğru dilbilimli ama bağlamsız yarım cümle) hâlâ geçebilir; raporda
`translation_meaning_issues` sayımı olarak görünür.

## Hat 4 — Sağlayıcı maliyeti + hata dayanıklılığı — **PASS**

`run_r112.py` senaryoları, fixture sunucu isteği/JSONL sayımıyla ölçüldü:

- Hata matrisi (7 mod): 429/503 → dürüst başarısızlık + sınırlı istek; `hang`
  (bağlantı kopması) → yeniden deneme sınırlı; `truncated` (gövde ortasında
  kopma) → geçerli JSON değilse reddedilir; `badjson`/`badids`/`partialjson`/
  `extraids`/`emptyitems` → çökme yok, dürüst hata; `slow` (3 s/istek) →
  geçerli gecikmeli yanıt → "slow-completes" (timeout değil — OpenAI client
  timeout'u 180 sn).
- Yanlış dil (`wronglang`): başarı sayılmadı, 2 istek, çıktı yazıldı ama
  sonuç işaretli.
- Maliyet: `revcost` 100→+20cue→5 düzenleme→restart = **5→2→3→0** istek
  (bağlam-anahtarlı cache yalnız etkilenen grubu yeniden gönderiyor);
  `dbl` (aynı işi iki kez): 10 istek, iki koşu tutarlı; `cancelmid`
  (5 sn'de öldür): yeniden başlatmada cache tutarlı, toplam ≤15.
- Kullanıcı yüzeyi: `err401` → 1 istek + temiz Türkçe mesaj
  ("çevrilemedi… yeniden deneme için çıktı yazılmadı"), dosya yazılmadı.
- Gizli anahtar hiçbir çıktıya gitmedi (env-only; aşağıda Hat 8).

Sınır: fixture sağlayıcı deterministik — gerçek ücretli model kalite/ücret
iddiası değil.

## Hat 5 — Eşzamanlılık + yaşam döngüsü — **PASS**

- `electron-active-jobs`: 3 eşzamanlı iş kartı (Subtitle translation 17.4%,
  Full subtitle capture 45.3%, Page translation 60%) — satırlar, Stop/Resume/
  Restart aksiyonları, viewport içinde.
- `electron-feature-lifecycle`: stale reload/playback, bölüm doğrulama/filtre —
  geçti.
- `electron-perf-gauntlet` çok-sekmeli faz: 3 sekme + 10k-cue çeviri işi altında
  sekme geçişleri — 0 longtask, sağlayıcı ilerliyor (13 çağrı), bellek Δ109 MB.
- Kuşak/anahtar koruması (`mediaKeyFor`/`player.generation`) — sekme/kaynak
  değişiminde eski işin sonucu yeni sekmeye bağlanmaz (kod + smoke kanıtı).

Sınır: iki sekmede İKİ AYRI VİDEO aynı anda oynatma + tüm iş türleri aynı anda
birlikte ölçülmedi; sızma karşıtı kanıt kuşak kontrolü + sekme-geçiş smoke'ları
üzerinden.

## Hat 6 — Çökme + veri bütünlüğü — **PASS**

`electron-crash-integrity` (gerçek süreç öldürme + yeniden açılış):

- Bayat `.tmp` açılışta süpürüldü; taze `.tmp` (başka işlemin canlı yazısı)
  korundu; `settings.json` sağlam; bayat settings-tmp izole kaldı.
- Bozuk oturum → `.bak`'tan sekme kurtarıldı + "önceki oturum beklenmedik
  sona erdi" uyarısı; bozuk birincil geçerli oturumla onarıldı.
- `writeSubtitleAtomic`/`writeJsonAtomic`/`writeBufferAtomic` kalıbı:
  tmp→validate→rename; hata → tmp silinir + propagate (bak sağlam kalır).
- EACCES kanıtı: readonly dizine yazma → reddedildi, orijinal korundu,
  `.tmp` artığı kalmadı (node-level kanıt).

Sınır: ENOSPC (disk-dolu) canlı enjeksiyonu yapılmadı — hata yolu EACCES ile
aynı dal; ortada hiçbir yazma "tamamlandı" diye görünmez (atomic rename +
istisna yayılımı).

## Hat 7 — SmartTube/YouTube — **BUG DÜZELTİLDİ (BUG-R112-01)**

`electron-youtube-oauth.smoke.js` (sahte OAuth/YouTube sunucusu) — iki düzeltme:

1. **Bayat smoke (test altyapısı):** PR #26 sonrası uygulama logged-out'ta
   gömülü TVHTML5 cihaz akışını otomatik başlatıyor; smoke eski "client formu
   varsayılan" beklentisini taşıyordu → Faz 0 güncellendi (otomatik device
   view + `ABCD-EFGH` kodu + deviceCalls ≥1 kanıtı; Esc iptal; client formu
   yalnız `ytChangeClient` ile).
2. **Ürün bug'ı (kırmızı→yeşil):** `ytBrowseSerialized` tek global
   `_ytBrowseGeneration` sayacı kullanıyordu — yeni non-continuation browse
   HER eski browse'u geçersiz kılıyordu. Eşzamanlı `FEsubscriptions` +
   `FEwhat_to_watch` çağrısında ilki `{ok:false, superseded:true}` döndürüp
   IPC sözleşmesini bozuyordu (renderer "feed alınamadı" fırlatır). Tek
   renderer'da supersede ≈ stale-render çakıştığı için bug gizliydi.
   **Düzeltme:** browseId başına generation haritası — aynı bid dedup'u
   korunur, farklı bid'ler serileşir.

   Yeşil: `deviceCalls:5, tokenGrants{device:3,code:1,refresh:1}, revoke:1,
   browseCalls:[7 adet — eşzamanlı çift feed dahil], meCalls:2` — TÜM SENARYOLAR
   GEÇTİ. Diğer kanıtlar: pending/slow_down/expired/denied/cancel/late-answer,
   PKCE state-mismatch reddi, refresh-once, client-swap-drop, logout+revoke.
   `smarttube-usage-matrix`: kart klavye/odak matrisi, Enter-oynatma,
   play-queue restart kalıcılığı, failFeed/failBrowse yüzeyleri — geçti
   (mock IPC eksik handler gürültüsü beklenen harness kalıntısı; renderer
   reject'leri tolere ediyor).

Kalan sınır: gerçek YouTube hesabı/bot kontrolü gerektiren akışlar **doğrulanmadı**
— açık sınır; iki pencere yarışı tek pencereli uygulamada uygulanamaz.

## Hat 8 — IPC + güvenlik — **PASS**

- `electron-browser-trusted-bridge` + `adversarial-ipc.test.js` geçti
  (yetkisiz sender, yanlış tip, geçersiz yol reddedilir).
- Gizli-sızıntı: `browser-diagnostics-export.test.js` yeşil — tanı paketi
  Bearer token, `api_key=…`, imzalı URL, cue metni ve mutlak yolu
  maskeliyor (`sanitizeDiagnosticsSecrets` + cue-metin karşılaştırması).
  `redactJobLogArgs` iş logunda input/output/cache değerlerini `<gizlendi>`
  yapar; HF/LLM anahtarları yalnız env ile geçer (argv yok).
- `sanitizeProcessDetail`: URL/yol/kontrol karakteri maskesi hata ayrıntısında.
- Harici sayfa → app IPC erişimi `authorizedBrowserSender` kapısıyla sınırlı;
  koruma gevşetilmedi, DRM/CDM bypass yok.

Sınır: electron-subtitle-output legacy smoke'undaki tanı-dışa-aktarım uçtan uca
adımı ortamda takıldı (aşağıda test-altyapı notu); aynı gizlilik yolu birim
testiyle yeşil.

## Hat 9 — Gerçek UI kabulü — **PASS**

Gerçek Electron ekran görüntüleri (`r112-evidence/ui/`):

- `ui-scale-matrix.png`, `reader-scale-matrix.png` — 720p/1080p/DPI matrisi.
- `ui-main-en.png`, `ui-player-en.png`, `ui-library-en.png` — EN varsayılan.
- `runtime-maintenance-en.png`, `runtime-maintenance-tr-narrow.png` — TR dar
  görünüm + bakım yüzeyi.
- `more-open.png`, `translate-open.png` — video üstü menü açılır durumu.
- `browser-menu-visual`, `browser-extras` (narrow/wide), `chrome-dark/narrow`
  — kırpma/taşma/odak kontrolleri smoke'larda geçti; Escape davranışı
  usage-matrix + oauth Esc iptal akışında doğrulandı.
- Klavye akışları: usage-matrix kart odak/Enter matrisi gerçek DOM'da ölçüldü.

Sınır: DPI>1 gerçek ölçekleme değil scale-faktor simülasyonu; kişisel veri yok.

## Hat 10 — Kurulum + ortam — **PASS**

- `app:getEnvInfo` (main.js:16433): venv varlığı, `python --version`,
  ffmpeg (yerel `backend/bin` önce, sonra PATH), `nvidia-smi` GPU+VRAM,
  yt-dlp sürümü + managed-runtime, GPU diagnostics — hepsi probed.
- Eksik-dep yönlendirmesi (renderer.js:3084-3085): venv yoksa
  "install.bat çalıştırın", ffmpeg yoksa "PATH'e ekleyin veya backend/bin/"
  — runtime panel ready/error rozetiyle birlikte.
- Bu makinede ffmpeg+venv var → pozitif durum doğrulandı; eksik-dep uyarı
  metni kod+renderRuntimeStatus yolunda doğrulandı (ortamı bozmadan).

Sınır: temiz-dizin install→bridge→küçük-iş zinciri bu koşuda yeniden çalıştırılmadı
(install adımları önceki oturumlarda doğrulandı; zincir parçaları smoke'larda
kapalı). Windows davranışı yalnız sözleşme/CI testleriyle — Ubuntu başarısı
Windows kabulü değil.

## Hat 11 — Performans + soak — **PASS**

`electron-perf-gauntlet` (`r112-evidence/perf/`):

- 10k cue render: 12 ms, 0 longtask, 500 DOM düğümü.
- 10k-cue çeviri işi altında UI (sekme geçişi + render döngüsü ×6):
  longtask p95/p99/max = 0 ms, rAF p95/p99 = 17 ms, sağlayıcı ilerliyor
  (13 çağrı).
- Bellek: 632 MB → 744 MB (Δ109 MB, <500 MB bütçe); disk Δ49 KB.
- Başlangıç/ara/bitiş ölçümleri + örnek sayısı rapor JSON'unda.

Sınır: "uzun soak" (dakikalar-saat) bu turda koşulmadı — gauntlet süresi ~90 sn;
p95 cue gecikmesi overlay-timing raporundaki render süreleriyle sınırlı kapsamda.

## Hat 12 — Birleşik regresyon — **PASS**

- Düzeltmeler ayrı küçük commit'lerde; `master` (`850e927`) üzerine temiz dal.
- Değişen dosyalar: `node --check` (main.js + 2 smoke) ve `py_compile`
  (sentence_translation, transcribe, quality corpus) — hepsi temiz.
- Hedefli koşular: quality corpus 5/5, transcribe 192/192, sentence_distribution
  36/36, golden 6/6; tüm Electron smoke batch'i 32'de 30 geçti —
  `browser-tools-design` batch flake'i (standalone'da PASS) ve `youtube-oauth`
  (bu turda düzeltildi, şimdi PASS). R112 tam senaryo seti 24/24 + matrix/anom
  18/18.
- Tam `npm test` rutin koşulmadı (talimat); geniş kapsam smoke `--all` batch'i
  ve hedefli birim testlerle sınırlı tutuldu — gerekçe: değişen yüzeylerin
  hepsi hedefli sette.

---

## Kesin bulgular

| ID | Dosya/fonksiyon | Kırmızı kanıt | Etki | Düzeltme |
|----|-----------------|---------------|------|----------|
| BUG-R112-01 | `src/main.js` `ytBrowseSerialized` | `electron-youtube-oauth` Faz: eşzamanlı `FEsubscriptions`+`FEwhat_to_watch` → ilki `{ok:false,superseded}` | IPC sözleşmesi ihlali — eşzamanlı çağıranda "feed alınamadı" (tek renderer'da gizli) | browseId-başına generation haritası + kuyruk; aynı-bid dedup korunur |
| BUG-R112-02 | `backend/sentence_translation.py` `translation_meaning_issues` / `translation_blocking_issues` | `frag` E2E: "…ve", "misin", "gör-" parçaları tüm kapıları geçip ekrana yazıldı | Kullanıcı ekranda yarım/anlamsız TR parçalar görür | 3 örüntü → `truncated_fragment` anlam + blocking sorunu; `transcribe.py` sayaç/rapor/issue_indices bağlantısı |

## Spekülatif adaylar / açık sınırlar

- TTML canlı-iz yolu birim testleri + parser koduyla kapalı; gerçek siteden canlı
  TTML kanıtı yok.
- `electron-subtitle-output-smoke.js` (legacy, `--all` listesinde değil): ortamda
  iç-Electron zygote FATAL → `--no-sandbox --no-zygote` eklendi + EN-varsayılan
  locale için `UiLocale.set('tr')` eklendi; ilk attach senaryoları yeşil, kuyruk/
  done-exit fazı ortamda ~10 dk'da ilerlemedi → diagnostics-redaction uçtan uca
  adımı birim testiyle kapatıldı (`browser-diagnostics-export.test.js`).
- `electron-browser-tools-design`: `--all` batch'inde `{"width":0}` döndü;
  standalone'da `{"width":872}` PASS — batch izolasyonu flake'i, ürün bug'ı değil.
- Gerçek YouTube hesabı / ücretli model / Windows UI kabulü / disk-dolu canlı
  enjeksiyonu / saatlik soak — kasıtlı sınırlar, doğrulanmış sayılmadı.

## Testler

Koşuldu: backend `test_translation_quality_corpus` 5/5, `test_transcribe` 192/192,
`test_sentence_distribution` 36/36, golden 6/6, `browser-diagnostics-export` PASS;
Electron smoke `--all` 30/32 + düzeltilen `youtube-oauth` PASS +
`electron-subtitle-output` (kısmi — yukarıdaki sınır); `run_r112.py` 24/24 +
matrix/anom 18/18; `node --check` + `py_compile` temiz.
Koşulmadı: tam `npm test` (talimat — hedefli set + smoke batch yeterli görüldü),
`--network`/`--live` smoke'ları (dış ağ/gerçek sağlayıcı gerektirir — bu görevde
gerçek anahtar/hesap yasak), Windows kabulü (CI sözleşmelerine bırakıldı).
