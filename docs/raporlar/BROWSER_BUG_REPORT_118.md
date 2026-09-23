# BROWSER_BUG_REPORT_118 — Gauntlet T1/T3/T4 doğrulama turu

**Dal:** `codex/r118-gauntlet-1790190179` · **Baz:** `origin/master` (`f0ecb1c`)
**Tarih:** 2026-09-23 · **Kapsam:** T1 (HLS/DASH altyazı yakalama), T3 (çeviri bütünlüğü — 1k cue + R116 paralel kurtarma regresyonu), T4 (sağlayıcı maliyet + hata dayanıklılığı)

## Özet

- **T1 — doğrulandı, yeni düzeltme yok.** HLS ve DASH yakalama yüzeyi zaten geniş: `EXT-X-MEDIA TYPE=SUBTITLES` ve `CLOSED-CAPTIONS`, mediaSequence'li rolling playlist, byte-range; DASH'ta `SegmentTemplate` ($Number$/$Time$/$SubNumber$ + `%0Nd` formatları), `SegmentTimeline` (r-tekrarlı S girdileri), `SegmentList`, `SegmentBase` `indexRange`, dinamik MPD'lerde sınırlı zaman çizelgesi kapısı (`dashTemplateHasFiniteLiveTimeline`), statik dönem süresi sınırları, init-segmenti URL'si, 10.000 parça üst sınırı, 6'lı eşzamanlı indirme, 64 MB limiti, 64 girişlik tamamlanmışlık LRU'su. Birim kapsamı: `browser-dash-capture.test.js`, `browser-subtitle-gauntlet*.test.js`, `hls-recovery.test.js`, `browser-capture-*.test.js` — dal üzerinde hepsi yeşil.
- **T3 — regresyon kanıtı eklendi (R116 `rescue_pool` ölçeği).** 400 blok × 20 parça, her parçanın son cümle grubu düşürülüyor → 20 tekil kurtarma paketi ayrı işçilerden paylaşımlı havuza akıyor. Doğrulama: tüm bloklar çevrildi, `max_inflight ≥ 2`, istek sayısı deterministik (40 = 20 toplu + 20 tekil). Ayrıca 1000 blok değişmezlik testi: sıra, zaman damgaları ve blok sayısı korunuyor; tam 50 toplu istek.
- **T4 — gerçek boşluk bulundu ve düzeltildi:** prob-sonrası kalıcı sağlayıcı hatası (kota/kimlik/model) kalan parçaları durdurmuyordu. `fatal_stop` bayrağı eklendi.

## T4 bulgusu — orta-koşu fatal durma (DÜZELTİLDİ)

**Belirti:** sağlayıcı kotası/kimliği işin ORTASINDA biterse, kalan her parça sırayla tüm rotaları (shuaiapi: 4 rota × 2 deneme) dolaşıp boşa istek ve geri-çekilme bekleme süresi yakıyordu. Prob yalnızca ilk parçada denetleniyordu (`remaining_chunks.pop(0)` + `FATAL_TRANSLATION_ERRORS`).

**Kök:** `record_chunk_result` hata kodunu döndürüyordu ama `as_completed` döngüsü bunu yalnızca prob yolunda kullanıyordu; bayrak hiç yoktu.

**Düzeltme (minimal):**
- `fatal_stop = {"error": None}` — ilk FATAL sınıflı hata (`authentication`/`quota`/`model_unavailable`) `as_completed` döngüsünde bayrağı kurar.
- `call_api_with` rota döngüsünün başında bayrak denetlenir: kuruluysa yeni istek/rota-denemesi açılmadan aynı hata yeniden fırlatılır. Kuyruktaki parçalar ve kurtarma paketleri böylece API'ye hiç gitmez; `classify` zinciri `failedReasons`'a doğru kodu (`quota` vb.) yazar.

**Tasarım notu:** uçuştaki (in-flight) istekler iptal edilmez — yalnızca henüz başlamamış/sonraki rota denemesi engellenir. Bu, ağ üzerinde devam eden birkaç isteğin doğal olarak bitmesine izin veren bilinçli bir üst sınırdır.

## Eklenen testler (backend/test_transcribe.py)

| Test | Doğruladığı |
|---|---|
| `test_translate_rescue_scales_across_chunks_parallel` | 400 blok, 20 parça × 1 eksik grup → paralel kurtarma, `inflight.max ≥ 2`, 40 istek, eksiksizlik |
| `test_translate_rescue_bundle_server_error_marks_only_missing` | tekil kurtarmada 503 → `call_api_with_retry` içinde retry → toparlanma, `status.failed` boş |
| `test_translate_midrun_fatal_error_stops_queued_chunks` | 10 parçadan 2. sinde kota → toplam 2 API isteği (önceden 10+ olurdu); `failedReasons` = `quota` |
| `test_translate_thousand_cues_invariance_order_and_count` | 1000 blok: sıra + zaman + tam çeviri + 50 istek |

## Doğrulanan mevcut davranışlar (değişiklik yok)

- `rescue_pool` ayrı executor → parça havuzuna iç içe gönderim deadlock'u yok; `map` sıralı sonuç → deterministik ilerleme.
- `bundle_width = 2 if batched and len>2 else 1` → geçersiz toplu yanıtta ikili paket, bilinen eksikte tekil.
- `record_chunk_result`: eksik bloklar `invalid_response` sayılır; `translation_chunk`/`llm_progress` yayımı kilit altında.
- `failure_by_index.setdefault` → önce başarılı sayılan indeksin üzerine yazılmaz.
- Tekil kurtarmada ikinci deneme yalnızca yapısal/boş yanıtta (`RESCUE_SUFFIX`); ağ/kimlik hatasında ek tur yok (gereksiz maliyet).

## Çalıştırılanlar

- `python3 backend/test_transcribe.py` → **188 geçti, 10 başarısız** — 10'unun tamamı ortamsal (`numpy`/`faster-whisper` eksik; master'da aynı). Bu dalın eklediği 4 test dahil tüm çeviri testleri yeşil.
- `node tests/browser-dash-capture.test.js` · `hls-recovery` · `browser-capture-completeness` · `browser-capture-queue` (20.000 rastgele interleaving) · `browser-subtitle-gauntlet` → tümü yeşil.
- `python3 -m py_compile backend/transcribe.py backend/test_transcribe.py` ✓

## Sınırlar

- Gerçek sağlayıcı anahtarı yok — T4 maliyet senaryoları sahte istemcide deterministik doğrulandı; gerçek API gecikmesi/kota davranışı kullanıcının Windows ortamında gözlemlenebilir.
- T1'de canlı yayın uçtan-uca kanıtı bu turda tekrar koşulmadı (R114'te live-server fixture'ı ile doğrulanmıştı); bu tur kod haritası + mevcut birim kapsamıyla sınırlı.
- `llm_refine` ikinci geçişi `fatal_stop` bayrağını paylaşır — kasıtlı: kalıcı hata durumunda ikinci geçiş de API'ye gitmez.
