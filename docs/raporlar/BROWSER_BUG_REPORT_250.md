# BROWSER_BUG_REPORT_250 — R301: kuyruk öncelik/yeniden-sıralama invariant'ları

**Tarih:** 2026-09-30 · **Dal:** `devin/1790740472-queue-order-invariants` · **Başlangıç:** `781416f`
**Tür:** invariant ratchet'i (bug yok — davranış belgelendi) (20'lik kuyruk madde 5)

## Özet

Kuyrukta kullanıcı-yeniden-sıralama özelliği yok; öncelik tamamen dizi
sırasıdır (FIFO). Bu tur, FIFO seçimi, retry konumlandırması, dedupe
kapsamı, kimlik sayacı ve kapıların tüm mutasyon kombinasyonlarında
korunduğunu `vm` çıkarımıyla **gerçek renderer koduna karşı** doğrulayan
17 senaryoluk bir ratchet kurdu. Davranış doğru çıktı — ürün kodu
değişmedi; elde edilen sözleşmeler testlerde belgelendi.

## Doğrulanan sözleşmeler

| # | İnvariant | Kanıt |
|---|---|---|
| 1 | `processNextQueueItem` id'ye değil **dizi sırasına** göre ilk `pending`i seçer | Seyrek id'ler [9,3,7] → id 9 çalışır |
| 2 | Ardışık işlem ekleme sırasını izler | a→b→c sırasıyla spawn edilir |
| 3 | **Retry konumu korunur** — hatadan bekleyene dönen öğe sona atılmaz, özgün yerini tutar (yerleşmiş semantik) | error@idx1 → pending → idx2'den ÖNCE çalışır |
| 4 | `addToQueue` çalışma sırasında bile sona ekler | tail öğesi `pending`, id sıralı |
| 5 | `removeFromQueue` running işi silemez; kalan sıra değişmez | [1..5] → running(1) + silme(3) → [1,2,4,5] |
| 6 | `clearQueue` yalnız `running` korur; `queueRunning`/`stopAfterCurrent`/`_queueNextTimer` sıfırlanır | sadece id 1 kalır |
| 7 | **Dedupe kapsamı = pending+running** — `done`/`error` öğeleri aynı girdiyle yeniden-koşu olarak eklenebilir (bilinçli izin) | done film.mp4 tekrar eklenebiliyor |
| 8 | `queueInputKey` kanonikleştirmesi: `\\`→`/`, `.`/`..` leksikal çözümü (sürücü kökü aşılmaz), trailing slash, büyük/küçük harf | `D:\a\x\..\film` ≡ `D:/a/film` |
| 9 | Unicode katlama muhafazakar: `İ`→`i̇` (i≠i̇) — Windows da `FİLM`/`film`'i farklı dosya sayar; dedupe'un ayırması doğru | `FİLM.MP4` ≠ `film.MP4` anahtarı |
| 10 | `watchSource` hata öğesi **yerinde dirilir** (id/sıra/files-reset korunur, kopya eklenmez) | id 2 pending, files=[] |
| 11 | `QUEUE_UI_LIMIT=500` ≡ `MAX_QUEUE_ITEMS` — 500 dolu iken ekleme reddedilir (disk kırpmasını önler) | 501. reddedilir |
| 12 | `_queueIdCounter` restore sonrası `max+1` — seyrek disk kimlikleriyle çakışmaz | [5,99] → sonraki id 100 |
| 13 | `startQueue` kapıları: pending yok / tek-iş çalışıyor → reddeder; çift çağrı birleşir | 4 senaryo |
| 14 | `persistQueueNow` reddedince öğe `pending`'e döner, kuyruk temiz kapanır, **sahipsiz süreç spawn edilmez** | spawn=0 |
| 15 | Spawn hatası öğeye `error` yazılır, hata metni saklanır, sıra devam eder | error → timer → next |
| 16 | İptal edilen spawn (`r.cancelled`) öğeyi hata yapmadan `pending`'e döndürür | cancelled → pending |
| 17 | `restorePersistedQueue`: `activeQueueItemId` yalnız id+`running` çiftiyle bağlanır; `queueRunning` restore bayrağı **ve** pending gerektirir | pending id=7 bağlanmaz |
| 18 | Çakışma soneki yalnız (stem+outputDir) çifti başka dosyayla çakışınca; kendisiyle ve farklı klasörle üretmez | 4 senaryo |
| 19 | **Fuzz:** 300 rastgele add/remove/retry/clear turunda ≤1 running, id-özgünlüğü, geçerli status, ≤500 | invariant'lar her turda |

## Tasarım notları (değişiklik yapılmadı)

- **Retry önceliği:** hatadan dönen öğe sıranın başını çalmaz ama özgün
  yerini de korur — daha sonra eklenen pending'lerin önüne geçer. Bu,
  "sıralı toplu iş" beklentisiyle uyumlu; kullanıcı-yeniden-sıralama
  eklenirse `state.queue` dizisini doğrudan yeniden düzenlemek yeterli
  olur çünkü tek doğruluk kaynağı dizi sırasıdır.
- **İd alanı:** kimlikler yalnız oturum-sayaçtır; persist'ten gelen
  kimlikler için `max+1` devam doğru.
- `queueInputKey` yalnız leksikal kanonikleştirme yapar (renderer'da fs
  yok) — gerçek symlink/hardlink aynı-fiziksel-dosya durumları dedupe'a
  girmez; bilinçli sınırdır.

## Regresyon kilidi

`tests/queue-ordering-invariants.test.js` — 17 kontrol (hepsi PASS).
vm çıkarımı: `queueInputKey`, `computeQueueCollisionSuffix`, `addToQueue`,
`clearQueue`, `queueSecretsFromCurrentUi`, `processNextQueueItem`,
`restorePersistedQueue` (renderer.js) + `startQueue`, `removeFromQueue`,
`scheduleQueuePersist` (renderer-helpers.js) — tek paylaşımlı vm bağlamı,
çağıran fonksiyonlar ve global durum stub'larıyla.

## Windows etkisi

Yalnız test dosyası — ürün kodu değişmedi. Path canonicalization
testleri Windows `\`/`D:` yollarıyla koşuldu.
