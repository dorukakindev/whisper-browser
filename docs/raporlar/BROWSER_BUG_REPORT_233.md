# BROWSER_BUG_REPORT_233 — R284: kuyruk öğesi seçenek-serileştirme roundtrip'i

## Özet
Persist → disk → resume zincirinin alan sadakati fuzz'ı: 3.000 tohumlu
iterasyon / 10.305 öğe, `queueSnapshotForDisk → JSON.stringify →
normalizeQueueSnapshot` üzerinden. Bug bulunmadı.

## Ölçülen invariant'lar
- opts sadakati: yüklenen `item.opts` ≡ `clonePublicOptions(kaynak)` (byte-exact).
- Sır sızdırmazlık: gizli anahtar/değerler ve `S3CR3T-*` literal disk JSON'ında yok;
  skip-anahtarlar (`chat/explain/queueItemId/input/youtube`) taşınmaz.
- URL hijyeni: `*url|*uri|*endpoint` anahtarlarında userinfo düşer, sır-parametreler
  (token/key/sig/auth/secret/jwt/session) sorgudan silinir.
- Sınırlar: >512 KB opts ve >5000 öğeli dizi tüm öğeyi düşürür (927 sınır-aşımı
  gözlendi), derinlik ≤10'a budanır.
- Yükleme idempotansı: `normalizeQueueSnapshot` çıktısı tekrar aynı fonksiyona
  sokulunca bit-bit aynı kalır.
- Statü normalizasyonu: yalnız pending/running/done/error.

## Not
`queueRunning` alanının iki anlamı belgelendi: disk yazımında "devam niyeti",
yüklemede "aktif koşu" (currentQueueId'den türetilir). İdempotans bu yüzden
yükleme yolunda arandı — iki yazımın arka arkaya normalize edilmesi
farklı bayraklar üretir; bu tasarım gereği.

## Doğrulama
`node tests/queue-opts-roundtrip.test.js` → 61.379 kontrol geçti.


## Kapsam notu (#232 review sonrası)

Roundtrip artık gerçek dosya yoluyla da kilitli: snapshot diske yazılıp
`readQueueStateRaw` deseniyle (birincil → .bak) geri okunur — persist →
disk → resume iddiası saf fonksiyonun ötesine taşındı. `dropped === 0`
kilidi eklendi.
