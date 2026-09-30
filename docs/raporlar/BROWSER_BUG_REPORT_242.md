# BROWSER BUG REPORT 242 — series_memory birleştirme yarışı (temiz)

**Tarih:** 2026-09-30 · **Kapsam:** Plan-2 madde 8 — paralel işçi/süreç kayıp-güncelleme simülasyonu
**Sonuç:** BUG YOK — 6 senaryonun tamamında kayıp/ezme yok.

## Denetlenen yüzey
`backend/series_memory.py` — `SeriesMemory` (kilit + disk-yeniden-okuma birleştirmesi). Kritik yol: `_save()` → `_file_lock()` altında `_read()` → `_merge_latest_disk_canon()` → `_write_unlocked()` (temp + fsync + os.replace).

## Simüle edilen yarışlar
| Senaryo | Kurulum | Beklenen | Sonuç |
|---|---|---|---|
| Süreçler arası birleşim | 2 Python süreci × 40 ayrı terim, eşzamanlı `merge_many` | 80 terim birleşimde | GEÇTİ — hiçbir terim kaybolmadı |
| Erken-bölüm kanonu | Aynı kaynak kimliği, farklı bölüm numarası, iki yazım sırası | Erken bölüm her yönde kazanır | GEÇTİ |
| İş parçacığı yarışı | Aynı süreçte 4 thread × ayrı örnek × 15 tek-terim `merge()` | 60/60 terim | GEÇTİ — 0 hata, 0 kayıp |
| Kilit zaman aşımı | Tutucu `.lock`'u 2,5 sn tutar; bekleyen işçi 0,4 sn deadline | TimeoutError, ezme yok; kilit bırakılınca retry başarılı | GEÇTİ |
| Yazım anında disk bozulması | Geçerli dosya → init → disk çöpe → merge | Dosya korunur (ezilmez), merge 0 döner | GEÇTİ — `{bozuk json` birebir durdu |
| Budama sınırı | 5 thread × 30 terim = 150 istek, aynı bölüm | ≤ MAX_TERMS (80), satır bütünlüğü | GEÇTİ — tam 80, satırlar bütünlüklü |

## Sözleşme notları (bug değil)
- Tek karar kümesi `terms[:20]`, `characters[:12]`, `addresses[:12]` ile sınırlı — model başına kota. `merge_many` çağıranı raws'ı buna göre bölmeli; test fixture'ı öyle yapıyor.
- `merge_many` dönen sayı "değişiklik üreten raw sayısı"dır (terim sayısı değil).
- `_file_lock` deadline'ı hem `__init__` hem `_save` için geçerli; kilitli dosyada örnek açmak da bekler (Windows'ta açık okuyucu rename'i durdurabilir — kasıtlı tasarım).

## Kanıt
- `tests/series-memory-race.test.js` + `tests/fixtures/series_memory_race.py` (yeni).
- `WHISPER_TEST_PYTHON=backend/venv/bin/python node tests/series-memory-race.test.js` → `PASS: series-memory-race (6 kontrol)`.

## Kalan
- Plan-2: madde 9 (status-copy `err_*` EN/TR kapsama), madde 10 (CI determinizm denetimi).
