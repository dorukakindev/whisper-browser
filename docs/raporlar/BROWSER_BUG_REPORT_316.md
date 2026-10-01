# BROWSER_BUG_REPORT_316 — kuyruk-50 madde 4: uyarlanabilir çeviri planlayıcısı

Tarih: 2026-10-01 · Kapsam: `backend/translate_planner.py` (yeni) + `transcribe.py` `llm_translate` gönderim hattı · Durum: **UYGULANDI**

## Görev

"Parça büyüklüğü ve eşzamanlılığı sağlayıcının gecikmesi, token sınırı ve hata oranına göre ayarla. Kontrollü sağlayıcılarla hız, maliyet, adalet ve iptal davranışını karşılaştır."

## Mevcut durum (doğrulanan kusur)

- `CHUNK_SIZE = 20` sabit; tüm parçalar iş başında `pack_sentence_groups` ile **önceden** paketleniyordu — iş ortasında öğrenilen hiçbir sinyal paketlemeyi etkileyemiyordu.
- `ThreadPoolExecutor`'a **tüm parçalar tek seferde** submit ediliyordu (200 blok → 10 future anında kuyrukta). Eşzamanlılık yalnız `translate_workers` üst sınırıydı; sağlayıcı yavaşlasa/hata üretse bile kuyruk dolu kalıyordu.
- `TranslationTruncatedError` tek seferlik ayrıştırma yapıyordu; öğrenilmiş token tavanı yoktu — aynı boyutta paketler yeniden kesilebiliyordu.
- Kalıcı hata sonrası `fatal_stop` yalnız uçuştaki istekleri kesiyordu; gönderilmemiş parçaların `failure_by_index` kaydı eski submit-all düzenine bağlıydı.

## Uygulanan değişiklik

`AdaptivePlanner` (`backend/translate_planner.py`):

| Sinyal | Kural |
|---|---|
| hata oranı ≥ 0.30 (10'lu pencere) veya son sonuç `truncated` | `chunk_size //= 2` (min 4), `workers = max(1, base//2)` |
| hata oranı ≥ 0.15 veya gecikme EMA > 45 sn | `workers = min(workers, base-1)` (büyüme donar) |
| üst üste 8 `ok` | `chunk_size = min(40, chunk×1.25+1)`, `workers = base` |
| `truncated` | `token_ceiling = min(ceiling, est×0.8)` öğrenilir; sonraki paketler bu bütçeyle kesilir |

- **Tembel paketleme + sınırlı inflight:** parçalar `pack_next()` ile gönderim anında güncel boyut/kapla üretilir; `wait(FIRST_COMPLETED)` döngüsü her boşluğu doldurur. Probe parçası korundu.
- **Üst sınır:** `planner.workers` asla `translate_workers`'ı aşmaz — kullanıcı tavanı korunur.
- **İptal/kalıcı hata:** `submit_available` `fatal_stop` görünce yeni gönderim keser; paketlenmemiş gruplar aynı nedenle `failure_by_index`'e işlenir (eski submit-all muhasebesi korunur).
- **Adalet:** kurtarma (`rescue_pool`) akışı dokunulmadı; ana havuz kurtarma işini boğamaz — kurtarma ayrı executor.

## Kanıt (ölçülebilir)

`backend/test_translate_planner.py` — 13 test:

- Kural tablosu: büyüme/küçülme/dondurma/token-tavanı/paketleme invariant'ları (grup asla bölünmez, boşluk → yeni parça, tekil aşan grup tek parça).
- Kontrollü sağlayıcı karşılaştırması (`llm_translate` + sahte `openai`):
  - **hız/maliyet:** 100 blok temiz sağlayıcı → istek sayısı sabit-20 eşdeğerini aşmaz (büyüme ile azalır); tüm payload'lar tüm blokları kapsar.
  - **flaky:** ilk 3 toplu istek bozuk JSON → planlayıcı küçülür, fırtına sonrası hiçbir gönderim 10 bloğu aşmaz.
  - **truncating:** `finish_reason=length` → token tavanı öğrenilir, sonraki paketler ≤10 blok.
  - **iptal:** `WHISPER_CANCEL_FILE` ortada düşerse yeni gönderim durur (200 blokta ≤6 istek).
- **Preexisting bug yakalandı:** `test_probe_refinement_r273` master'da kırmızıydı — sahne sınırı (#349) sonrası 28 sn boşlukta `context_before` boşalır, test bayat cache anahtarı üretiyordu. Üretim tarafının hesapladığı boş bağlamla düzeltildi.

## Regresyon

- `test_transcribe.py` 213/213 · `test_translate_planner.py` 13/13 · `test_probe_refinement_r273.py` 3/3 · `test_golden_corpus` 6/6 · `test_sentence_distribution` 43/43 · `test_pack_sentence_fuzz` 5/5 · `test_translation_routes` 4/4 · `test_translation_audit_2026_09_22` 11/11
- Güncellenen pinler: `test_translate_rescue_scales...` (sabit 40-istek → toplu/tekil denge karşılaştırması), `test_translate_thousand_cues` (50-istek → <50 büyüme kanıtı), `test_translate_midrun_fatal` (kalıcı-hata muhasebesi korundu — davranış değişmedi, doğrulandı).

## Windows etkisi

Planlayıcı saf Python (threading + deque yok, ek bağımlılık yok). `wait(FIRST_COMPLETED)` stdlib. Windows'ta davranış aynı; ayrı doğrulama gerektiren platform yüzeyi yok.

## Sınırlar / doğrulanmayanlar

- Gerçek sağlayıcı gecikme dağılımıyla kalibrasyon (SLOW_LATENCY=45 sn, ERR_GROWTH=0.15, ERR_SHRINK=0.30) muhafazakâr başlangıç değerleri; canlı ölçümle ayarlanabilir.
- `refine` geçişi (`pack_sentence_groups`) bilinçli olarak sabit bırakıldı — 1. geçiş kanıtı olmadan tavan yok; ikinci turda planlayıcıya bağlanabilir.
