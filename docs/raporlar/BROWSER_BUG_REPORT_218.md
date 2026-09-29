# BROWSER_BUG_REPORT_218 — R266: Çeviri önbelleği disk-büyüme soak'u

**Tarih:** 2026-09-30 · **Dal:** `fix/r266-cache-soak` · **Sonuç: TEMİZ (bug yok)** — soak ratchet'i eklendi.

## Kapsam ve yöntem

Uzun süreli aktif çeviri yükü altında `translate-cache.json` +
`.journal`/`.bak` dosyalarının disk tüketiminin ve yazım maliyetinin
sınırlı kaldığını doğrulayan kalıcı soak testi:
`tests/browser-translation-cache-soak.test.js` (saf Node, CI güvenli).

Ölçüm ortamı: Ubuntu CI kutusu, gerçek `fs` (tmpfs değil, fiziksel disk).

## Ölçümler

| Senaryo | Ölçek | Sonuç |
|---|---|---|
| A — 40 tur × 120 yazım churn (limit 1000, journalMax 64K) | 4.800 set+flush | temel 143K, en kötü journal 48.6K ≤ eşik, en kötü dizin 332K (~2.3× temel) |
| B — gerçek ölçek 50.000 kayıt | temel 7.1 MB | sıkıştırma 70 ms vs journal append ~0 ms (aynı Node döngüsünde) |
| C — 10 tur churn + yeniden açılış (limit 500) | 1.500 kayıt | 500 kayıt doğru, kesilen eski kayıt dirilmedi (mezar taşı çalışıyor) |

## Kilitlenen değişmezler

1. Journal boyutu hiçbir ölçümde `2 × journalMaxBytes`'i aşmaz
   (sıkıştırma eşikte tetiklenir).
2. Dizin toplamı (temel + .bak + journal) temel dosyanın ~3 katını aşmaz —
   sınırsız büyüme yok.
3. Artımlı flush (journal append) tam sıkıştırmadan anlamlı ölçüde ucuz —
   3 saniyelik aktif çeviri yazımları ana süreci dondurmaz.
4. Sınır kesimi journal'a mezar taşı yazar; yeniden açılışta kesilmiş
   kayıt replay ile dirilmez.

## Kapsam notu

İş-çıktısı işlem journalları (`watch-index.js`, `MAX_TRANSACTION_RECORDS`)
açılışta doğrulanıp temizleniyor — ayrı soak gerektirmez. Kuyruk durumu,
geçmiş, not ve favicon depoları kendi limitlerine sahip.

## Doğrulanmayan sınırlar

- Windows'ta antivirüs eşliğinde gerçek çeviri sırasında append gecikmesi
  ölçülmedi (CI ölçümü Unix'te).
- 50k limiti aşınca kullanıcının seçtiği `limit` değeri için değil,
  varsayılan 50k için ölçüldü.
