# BROWSER BUG REPORT 363 — 100-kuyruk batch 1: kalıcılık/bozulma dayanıklılığı

- **Tarih:** 2026-10-01 · **Dal:** `devin/…-batch1-atomic-kill` · **Başlangıç HEAD:** `fd96d9d` · **Kapsam:** kullanıcının 100-görev duran emrinin 1. demeti (madde 1–10) — kalıcılık ve bozulma dayanıklılığı.

## Yöntem

Her madde için önce mevcut kapsam envanteri çıkarıldı (`ls tests` + içerik taraması); zaten kilitli olanlar yeniden koşturulup "kapsam mevcut" diye kapatıldı, gerçek boşluklar yeni test/düzeltmeyle kapatıldı.

## Bulgular

### B-363-01 (düzeltildi) — Katalog afişi çıplak `writeFileSync` ile yazılıyordu
`src/catalog-extensions.js` TMDB afişini `fs.writeFileSync(posterPath, png)` ile doğrudan hedefe yazıyordu. Süreç SIGKILL/disk dolu/ENOSPC ile kesilirse yarım PNG kalıcı dosya olarak kalıyor; galeri bozuk afiş gösteriyordu. Düzeltme: ortak `atomicWriteFileSync` (temp → fsync → rename → dir-fsync) törenine bağlandı. `fsync-utils` zaten repoda mevcuttu; satır artık tek çağrı.

### B-363-02 (kapanık boşluk) — Süreç düzeyi kill-ortasında-yazım testi yoktu
Depoda ~40 bozulma testi var ama hepsi *içerik* düzeyinde bozuk dosya enjekte ediyordu; hiçbiri gerçek sürece SIGKILL gönderip dosya sisteminde ne kaldığını ölçmüyordu. Yeni `tests/atomic-write-kill.test.js` üç yazıcıyı canlı SIGKILL döngüsüyle sınıyor (her senaryoda 22 tur, `-e` çocuk süreci rastgele 45–160 ms'de öldürülüyor):

| Senaryo | İnvariant |
|---|---|
| `atomicWriteFileSync` (tek dosya) | Hedef asla yarım değil; okunursa tam JSON, `gen` tam sayı |
| `writeMirroredJsonAtomic` (file + .bak) | En az biri ayrışır ve tutarlı |
| `writeJsonTransaction` (3 dosya + journal) | Kill sonrası karışık nesil serbest; iyileştirme yazımı sonrası hepsi `healed` |
| Statik ratchet | `catalog-extensions` afiş satırı çıplak `writeFileSync`'e geri düşemez |

**201 kontrol, 66 öldürme turu — hepsi yeşil.**

## Madde bazında kapanış (1–10)

| # | Madde | Sonuç |
|---|---|---|
| 1 | settings.json kill-mid-write | ✅ Yeni — `atomic-write-kill` `txn` senaryosu (`writeJsonTransaction` = settings yazıcısı) |
| 2 | queue-state bozuk matris | ✅ Mevcut — `queue-state-corruption` (25k kontrol) PASS |
| 3 | session-store eksik sekme | ✅ Mevcut — `session-restore-matrix` + `browser-session-corrupt` PASS |
| 4 | translation-cache TTL eviction | ✅ Mevcut — `browser-translation-cache-soak` PASS |
| 5 | watch-index sürüm migrasyonu | ✅ Mevcut — `watch-library-migration` + `watch-index-assets` PASS |
| 6 | note-store eşzamanlı yazım | ✅ Mevcut — `browser-note-store` PASS (debounce+birleşme kilitli) |
| 7 | favicon bozuk ikilik | ✅ Tasarım gereği — kayıtlar `data:image/*` dizgisi; bozuksa `normalizeBrowserFavicons` eler (`browser-favicon-cache` PASS) |
| 8 | burnin-recovery sürüm sınırı | ✅ Mevcut — `burnin-recovery-schema` PASS (v>1 reddi dahil) |
| 9 | history 100k başlangıç perf | ✅ Tasarım gereği — `loadHistory` `HISTORY_LIMIT=300`'e keser; 100k satır okunsa da ilk 300'e iner (`history` PASS) |
| 10 | places dedupe bütünlüğü | ✅ Mevcut — `browser-places-import-matrix` + `browser-places-filter` PASS |

## Doğrudan yazım (atomik olmayan) envanteri — tur 2

| Konum | Değerlendirme |
|---|---|
| `catalog-extensions.js` afiş PNG | **Düzeltildi** (B-363-01) |
| `main.js` live-asr WAV parçası | Geçici dizin + iş sonu silinir; yarım parça yalnız başarısız kayıtta kalır — kabul edilebilir |
| `main.js` chat payload (`userData/tmp`) | Hata yolunda `cleanupChatFile` — kalıcı değil |
| `main.js` iptal bayrağı (6 bayt) | Yazım yarım kalsa da kill fallback'i var |
| `workspace-video-package.js` manifest temp | `finally`'de `unlink` — kalıcı değil |
| `settings-security.js` journal yazıları | Zaten işlem töreninin parçası |

## Kanıt

```
$ node tests/atomic-write-kill.test.js
atomic-write-kill: 201 kontrol geçti (22 tur/senaryo)
$ node tests/queue-state-corruption.test.js … PASS
$ node tests/session-restore-matrix.test.js … PASS
$ node tests/browser-translation-cache-soak.test.js … PASS
$ node tests/watch-library-migration.test.js … PASS
$ node tests/browser-note-store.test.js … PASS
$ node tests/browser-favicon-cache.test.js … PASS
$ node tests/burnin-recovery-schema.test.js … PASS
$ node tests/history.test.js … PASS
$ node tests/browser-places-import-matrix.test.js … PASS
$ node tests/browser-places-filter.test.js … PASS
```

## Windows etkisi

`atomicWriteFileSync` Windows'ta rename semantiğiyle aynı (NTFS rename atomik); `fsyncDirectory` Windows'ta ENOTSUP/EINVAL'a toleranslı — kod yolu platformdan bağımsız. Kill-mid-write testi POSIX `SIGKILL` kullanıyor; Windows'ta `taskkill /F` eşdeğeri — test POSIX işaretini doğrudan kullandığından Windows CI'da koşarsa spawn sinyal adlandırması kontrol edilmeli (Node `taskkill` yerine `SIGKILL`i `TerminateProcess`'e çevirir — davranış eşdeğer).

## Kalan

- Batch 2–10 (renderer/UI, backend kenarları, çeviri sözleşmesi, güvenlik tur-2, kuyruk yaşam döngüsü, perf, doküman senkronu, Windows hazırlık, kapanış temizliği).
