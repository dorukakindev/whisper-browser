# BROWSER_BUG_REPORT_116 — R116: tarayıcı→oynatıcı devir + çeviri kurtarma paralelleştirme

**Tarih:** 2026-09-23 · **Dal:** `codex/r116-browser-to-player-1790179270` · **Taban:** master `3e9b52e`

## Kullanıcı talebi (3 iş)

1. Tarayıcıda açık YouTube videosunu uygulama oynatıcısında izleyebilmek — "oynatıcıda izle" seçeneği.
2. Tarayıcı tarafındaki çeviri kalitesinin oynatıcıyla aynı olması + "Cümleleri birleştir" açıkken cümlelerin çeviriye birleşik gitmesi.
3. Gerçek Windows günlüğünde görülen uzun çeviri kurtarma ("loop" algısı) incelemesi.

## BUG-R116-01 — Tarayıcıdan oynatıcıya devir yoktu (özellik)

**Durum:** Tarayıcı ⋯ menüsünde yalnızca mpv/VLC dışa aktarımı vardı; uygulama içi oynatıcıya devir yoktu. Kanıtlı eksik — `browserMoreMenu` menüsünde hiçbir "oynatıcıda izle" maddesi yoktu.

**Düzeltme (renderer):**
- `index.html`: `browserMoreMenu` → İçerik grubuna `browserWatchInPlayer` maddesi (mpv üstüne).
- `renderer.js` `updateBrowserWhisperActions()`: madde yalnızca `currentBrowserYoutubeUrl()` döndüğünde etkin (YouTube video sayfası açıkken), aksi halde disabled + açıklayıcı title — mevcut Whisper aksiyonlarıyla aynı kapı.
- `renderer.js` `watchBrowserVideoInPlayer()`: kart açılış şablonuyla birebir aynı el değiştirme — `pendingAutoOpen` niyeti + `playerLayer` gösterimi + `openYoutubePanelAndProbe(url)`; sayfadaki konum `player.browserTime`'dan `pendingLibrarySeek`'e yazılır (>2s eşiği), yoksa izleme kütüphanesi kaydı ikincil kaynak; tarayıcı sekmesindeki video `browserCommand('pause')` ile duraklatılır; stale-guard `pendingOpen.intent === player.openIntent` ile korunuyor.
- `ui-locale.js`: 4 yeni çeviri çifti (EN modunda doğrulandı).

**Kanıt (gerçek Electron, test profili):** YouTube watch sayfası açıkken ⋯ menüsünde "Watch in player" etkin (`r116-evidence/menu-oynaticida-izle.png`); tıklama sonrası `playerLayer` açıldı, video oynatıcıda akış olarak başladı — başlık "Genesis P-Orridge Rates Action Bronson… · YouTube · stream playback · 7:28" ve video karesi görünür (`r116-evidence/oynaticiya-devir-sonrasi.png`).

## BUG-R116-02 — "Cümleleri birleştir" çeviriye uygulanmıyordu

**Kök neden:** `mergeContinuation` checkbox ipucu "Çeviride de ayrıca uygulanır" diyordu; main.js `--merge-continuation` bayrağını translate-only işlerine de zaten gönderiyordu — ama `translate_existing_subtitle()` bayrağı okumuyordu (boş vaat). Transkripsiyon+çeviri yolu zaten uyguluyordu; yalnız-çeviri yolu eksikti.

**Düzeltme (backend):** `translate_existing_subtitle()` — `merge_continuation` açıksa `merge_continuation_lines(entries, max_gap=continuation_gap)` parse sonrası uygulanır; varsayılan (kapalı) davranış değişmez → R111 `same_timeline` değişmezliği korunur.

**Test:** `test_translate_existing_subtitle_merge_continuation` — 3 cue'lu SRT, birleşen ilk ikisinin tek blok `[TR]` çevirisi ve 1–7s birleşik zaman aralığı; üçüncü cue ayrı kalır.

## BUG-R116-03 — Çeviri kurtarma paketleri seri bekliyordu ("loop" algısı)

**Kullanıcı günlüğü analizi (gerçek Windows logu):** döngü DEĞİLDİ — meşru kurtarma. Yalnız tek parçada (40-59) 4 cümle grubu / 10 blok red yedi; 4 kurtarma paketi **sırayla** API bekledi → 233.4 sn tek parça, toplam 537 sn / 22 kurtarma isteği. Kapılar (`part_kapisi_*`) doğru çalışıyordu; sorun seri bekleyen paketlerdi.

**Kök neden:** `retry_groups_once()` paketleri çağıran parça işçisinin içinde `for` döngüsüyle çalıştırıyordu; her paket ≥1 API turu → N paket = N×RTT seri bekleme; parça işçisi de ana havuz slot'unu bloke ediyordu.

**Düzeltme (backend):** paylaşımlı `rescue_pool = ThreadPoolExecutor(translate_workers)` — paketler `rescue_pool.map(process_bundle, bundles)` ile paralel; `map` sonuç sırası gönderim sırası olduğu için ilerleme kayıtları deterministik. AYRI executor şart: ana havuza iç içe gönderim deadlock riski taşırdı. `rescue_group`/`process_bundle` saf sayaç döndürür (nonlocal yarışı yok); `done_idx`/`failure_by_index`/`records` yazımları zaten `lock` altında. Üst sınır `translate_workers` ile aynı → sağlayıcıya eşzamanlı istek düzeyi artmaz. `finally: rescue_pool.shutdown()`.

**Test:** `test_translate_rescue_bundles_run_in_parallel` — yavaş sahte sağlayıcı (150 ms/istek), toplu yanıtta 3 grup eksik bırakılır → 3 tekil kurtarma isteği; `max eşzamanlı istek ≥ 2` ve `elapsed < 0.55s` (seri olsaydı ~0.6s). Karşı-kanıt: `translate_workers=1` iken `max=1`, `elapsed=0.60s` — test seri/paraleli gerçekten ayırt ediyor.

## Doğrulanan ama değişmeyenler

- **Tarayıcı canlı çevirisi zaten cümle bazlı:** `assembleCueSentences` her zaman cümle grupları halinde istek yapar; toplu yol ile aynı sentence-group kapıları paylaşılır — kalite paritesi mevcuttu, kurtarma seriliği algıyı bozuyordu.
- **Logdaki "loop" sonsuz değil:** her kurtarma hattı farklı parça/grup kümesinde ilerliyor; toplam istek sayısı sınırlı ve sonlanıyor.

## Testler

- `backend/test_transcribe.py`: 184/194 — başarısızlar ortamsal (numpy/faster-whisper yok; master'da da aynı). Yeni: merge-continuation + parallel-rescue testleri geçti; tüm sentence/rescue regresyonları yeşil.
- `node --check` renderer.js/ui-locale.js, `py_compile` transcribe/test — temiz.
- `tests/browser-parti7.test.js` + player-ui 148/148 + toolbar-clickability + ui-locale 14 — yeşil.
- Gerçek Electron: YouTube sayfası → ⋯ → "Watch in player" → oynatıcıda akış oynatımı kanıtlı.

## Sınırlar

- mpv/VLC seçeneklerine dokunulmadı; oynatıcı devir yalnız YouTube watch URL'lerinde etkin (Whisper aksiyonlarıyla aynı kapı — diğer sitelerde disabled).
- Sayfa konumu aktarımı `player.browserTime`'a bağlı; canlı-altyazı senkronu sayfası olmayan videolarda `browserTime` 0 kalabilir → konum aktarılmaz, izleme kaydı varsa o kullanılır.
- Kurtarma paralelliği hız kazandırır, kapı reddetme oranını değiştirmez; blok başına başarısızlık aynı şekilde `partial.srt` + orijinal metin fallback'ine düşer.
