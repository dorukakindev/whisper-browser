# R124 — Baştan sona statik/sözleşme denetimi (A→Z), 1 kesin bulgu

Tarih: 2026-09-26. Dal: `devin/repo-research-2026-09-25`, HEAD `f8d06b7`. Kapsam: `backend/transcribe.py` (~8.5K satır), `pipeline_control.py`, `sentence_translation.py`, `translation_memory.py`, `src/main.js` (~18.7K), `src/preload.js`, `src/renderer/renderer.js` (~28K) + yardımcı modüller, kuyruk/kalıcılık/gizli-anahtar katmanları ve R116–R123 commit serisinin diff'leri. Kullanıcının izlenmeyen dosyalarına dokunulmamıştır.

## Mekanik sözleşme denetimi — temiz

- IPC kanalları: preload'da kullanılan 217 kanalın tamamı main/yardımcı modüllerde kayıtlı.
- `window.api.*` metodları renderer↔preload birebir; renderer'ın referans verdiği 876 DOM id'si `index.html`'de mevcut.
- Backend NDJSON olay tipleri renderer switch'iyle tutarlı; argparse seçenekleri main.js `args.push` zinciriyle tutarlı (`--engine` çok-satırlı tanım ilk mekanik çıkarımda kaçmıştı — elle doğrulandı, kusur yok).
- Tüm `ipcMain.handle`'lar `authorizedBrowserSender`/kaynak doğrulaması yapıyor; `shell:openExternal` URL politikası yerinde.
- Gizli anahtarlar yalnız env üzerinden (`buildSecretEnv`); chat/explain işleri `opts.translate = true` ile anahtarı kasıtlı talep ediyor (renderer.js:16174, 16463).
- `OutputTransaction`/journal: PID sahiplik kontrolü, `_entry_paths_are_local` kapsamı, ters-sıra rollback, `committed`/`prepared` ayrımı ve kilitli-hedef erteleme doğru.
- Checkpoint: atomik `.tmp`+fsync+replace, imza eşleşmesi, girdi doğrulaması (tek bozuk kayıtta tüm checkpoint reddedilir), sınır birleştirme kırpma ile örtüşmeyi önlüyor.
- Kuyruk: terminal mandalı (çift terminal olayları), iptal/başlatma yarışları, kilit dosyaları ve hassas-seçenek süzgeci sağlam.
- YouTube çoklu hesap: token yenileme hesap kimliğine bağlı (fbcdeae sonrası); eski hesap sonucu yeni seçimi ezemiyor.
- `translation-model-score.js` ret etiketleri backend anahtarlarıyla (`kimlik_araligi_disinda`, `kaynak_yankisi`, `eksik_tam_cumle`, `partlar_tam_cumleyi_olusturmuyor`) birebir eşleşiyor.
- R120/R123 tarayıcı yamaları (beyaz temel renk, boş-HTTP algısı, snapshot-öncesi-occlusion, sayfa-bağlamlı ağ mesajları, find-in-page gözlemci zamanlaması) diff bazında tutarlı.

## Kesin bulgu: R124-01 — `preview_refresh` koşulu bazı girdi-küçülten adımları kapsamıyor (önizleme/çeviri kayması)

- Konum: `backend/transcribe.py:6285–6292`. `preview_refresh` yalnız `merge_short | merge_incomplete | merge_continuation | llm_postprocess | diarize | fix_timings | drop_trailing_hallucination | fix_punctuation_collapse | dedupe | resumed_entries` doğruysa emit ediliyor.
- Kapsanmayan mutasyonlar:
  - `apply_dedupe_policy(entries, extended=…)` (6106 ve 6222) — koşulsuz güvenlik geçişi; örtüşen rolling-cue kopyalarını `same_rolling_cue` dalında **her zaman** birleştirir (4355–4377). Hiçbir seçenek açık olmasa bile entries küçülebilir.
  - `fix_common_errors` (6113, `args.fix_common_errors`, **varsayılan açık**) — `reconcile_rolling_hypotheses`, `drop_micro_blocks` ve temizlikte boşalan bloklar (`">>"` artıkları) girdi sayısını düşürür (4764–4802).
  - `drop_repeated_hallucinations` (6121, **varsayılan açık**) — düşük güvenli tekrar bloklarını siler (4761).
  - `snap_to_speech` (6253, varsayılan açık) — sayıyı değiştirmez ama başlangıçları öteler → önizleme zamanları dosyadan farklı kalır.
- Etki zinciri: `segment` olayları akış sırasında ön-işleme öncesi listeyi basar (6024–6035); renderer `addSegment` ile `state.previewSegs`'i sırayla doldurur (1550–1555). Yenileme emit edilmediğinde `previewSegs`, son `entries`'ten uzun ve kayık kalır:
  1. `applyPreviewTranslations` `event.index`'i in-bounds iken doğrudan `previewSegs[index]`'e uygular; zaman-anahtarı fallback'i yalnız sınır dışında devreye girer (1397–1414). İlk silinen bloktan sonraki **tüm** `translation_chunk`/`translation_refresh` yazımları yanlış kaynak satıra düşer — çeviri doğrulama yüzeyi güvenilmez olur.
  2. Silinmesi gereken "hayalet" satırlar önizlemede iş bitince de kalır (`done`'da `previewSegs` yeniden kurulmuyor; 4430+).
  3. `copyPreview` bayat listeyi SRT olarak panoya kopyalar (1293–1311).
  4. `contenteditable` düzenlemeleri kayan indekse yazılır; zaman eşlemeli geri-yazma yolları (`previewTimeKey`) snap kaymasıyla sessizce ıskalar.
  5. Oynatıcı canlı katmanı `mergeLiveCues` üzerinden ham cue'ları tutar (3925–3932); iş bitince dosyadan tazelenir → geçici.
  6. **Aşamalı (progressive) modda** `finishProgressiveJob` `job.liveSource`'u `job.sourceFile`'a `writeSubtitle` ile yazar (3613–3625): hayalet cue'lar kullanıcıya ait çıktı dosyasına sızar — etki yalnız görüntü değil dosya bütünlüğü.
- Erişilebilirlik: varsayılan yapılandırmada `mergeShort`/`fixTimings`/`dedupe` açık olduğu için yenileme zaten emit ediliyor; kusur "işleme seçeneklerinin tamamını kapatan + varsayılan `fixCommonErrors`/`dropRepeatedHallucinations` açık bırakan" ya da yalnız koşulsuz dedupe'un tetiklendiği yapılandırmalarda ortaya çıkar. "Ham cue" isteyen kullanıcı profili gerçekçi; kod kusuru deterministik (koşul bayrak beyaz listesi, gerçek değişiklik değil).
- Önerilen yön: emit'i bayrak listesine değil `len(entries)`/`id` özetinin son segment-akışı listesiyle farkına bağlamak ya da kapsanmayan adımları koşula eklemek; uzun vadede `applyPreviewTranslations`'a zaman-öncelikli eşleme eklemek savunma derinliği sağlar.

## Düşük / savunma notu: R124-02 — boş `--sync-srt` dizine çözümlenir

- Konum: `backend/transcribe.py` ~8155 (`sync_subtitles`). `Path(args.sync_srt or "")` boş değerde `Path('.')` üretir; `.exists()` geçer, `read_subtitle_text('.')` dizin okuma hatasıyla ("[Errno 21] Is a directory" / Windows'ta `PermissionError`) anlaşılmaz bir mesaj basar.
- Erişilebilirlik: UI'dan erişilemez — iki çağrı yolu da truthy guard'lı (`renderer.js` ~4911 ve 21240; buton zaten `disabled`). Yalnız elle hazırlanmış `transcribe:start` IPC'si veya doğrudan CLI ile tetiklenir. Veri kaybı yok; yalnız tanı mesajı yanıltıcı.
- Öneri: `if not args.sync_srt or not srt_path.is_file():` tarzı doğrudan doğrulama.

## Elenen hipotezler (yanlış-pozitif kaydı)

- `preview_refresh` 1-bazlı `index` vs `translation_refresh` 0-bazlı: `renderFinalPreview` index alanını kullanmıyor; sıra+zaman eşlemesiyle kuruluyor → elendi.
- `chat_about_video`'da `messages` değişkeninin hata sözlüğüyle gölgelenmesi (6999): döngü sonrası atama, işlevsel etki yok → elendi.
- `parse_srt` satır-sonu-sayı düşürme sezgiselliği: yalnız ayracı/kimliği olmayan bozuk SRT'de metin kırpabilir; standart girdide doğru → raporlanmadı.
- `browser:find-state` gözlemcisi yeni sorguda açık kalması (R123-B4 sonrası): kapatmada `stop()` ile kapanıyor → elendi.
- `--sync-srt`/`--translate-existing`/`--explain-translation` yetkilendirmesi: `authorizeSubtitleFile` boş değeri atlıyor ama boş argüman argv'ye de eklenmiyor → yalnız yukarıdaki düşük not.
- `npm test` (node tests/run-all.js): tamamı yeşil, exit 0. `node --check` main.js/renderer.js temiz.

## Kalan sınırlar

- GPU'lu gerçek Whisper koşusu ve Electron görsel doğrulama bu oturumda yapılmadı (statik + sözleşme denetimi). R124-01'in uçtan-uca yeniden üretimi Windows ortamında "işleme seçenekleri kapalı" yapılandırmayla doğrulanmalı.
- İzlenmeyen kök dosyaları (`PROGRAM_BUG_REPORT_83–85.md`, `_repro/`, `tests/r92-deep/` vb.) bu çalışmanın parçası değil; dokunulmadı.
