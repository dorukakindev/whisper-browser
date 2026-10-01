# BROWSER_BUG_REPORT_369 — 100-kuyruk batch 6: kuyruk yaşam döngüsü

## Kapsam

queue-state.json'ı yazan üç bağımsız aktörün interleaving'i: main süreç
persistQueueRunning/persistQueueTerminal, renderer queue:save/saveSync
(gecikmeli snapshot'lar dahil), loadQueueState crash-recovery onarımı.
Tekil davranışlar önceki batch'lerde kilitliydi; bu batch çok-yazıcılı
karışımı model-düzeyinde fuzz eder.

## Yöntem

`tests/queue-writer-interleave.test.js`: tohumlu PRNG ile 40 tur × ~60 adım;
her adımda rastgele aktör eylemi (iş ekle, düzenle, başlat, terminal yaz,
bayat snapshot, çökme+onarım) ve her adım sonrası disk invariant kontrolü.

## Denetlenen invariant'lar

| # | Invariant | Sonuç |
|---|-----------|-------|
| 51 | Çok-yazıcılı interleaving (~2.400 adım): id/tip/input/status sözleşmesi + exception'sızlık | Temiz |
| 52 | Terminal durum guard'sız geri alınamaz: bayat 'running' snapshot disk 'done'ını ancak pending+recovered'a düşürür (yeniden-deneme niyeti) | Temiz — kilit |
| 53 | readQueueStateRaw .bak sırası: oversized birincil atlanır, geçerli .bak kullanılır, ikisi de yoksa _oversized işareti | Temiz — kilit |
| 54 | updateQueueSnapshotTerminal: yalnız running öğe error'a geçer; pending öğe pending kalır ama hata metni kaydedilir | Temiz — kilit (köken izi korunur) |
| 55 | cancelled exit: running→pending + error temizliği + queueRunning "devam niyeti" (koşabilir öğe varken korunur, yoksa düşer) | Temiz — kilit |
| 56 | createJobId crypto-yokluğu fallback'i: 2000 kimlik çakışmasız, 'job-' önekli | Temiz — kilit |
| 57 | snapshotOptions: derin kopya + derin dondurma + çevrimsel referans dayanıklılığı | Temiz — kilit |
| 58 | applyQueueRunEvent iptal sözleşmesi: cancelled sonrası geç terminal reddedilir, çalışma exit'e dek açık kalır, invariant'lar korunur | Temiz — kilit |
| 59 | clonePublicOptions sır matrisi: yerleşik 13 anahtar + regex varyantları (custom-api-key, access_token, ClientSecret, nested Password) | Temiz — kilit |
| 60 | MAX_QUEUE_ITEMS=500 tavanı + id tekilleştirme + invalidCount doğruluğu | Temiz — kilit |

## Bulgular

Doğrulanmış ürün kusuru yok. İki sözleşme ilk kez belgelendi ve kilitlendi:

- **Devam niyeti sözleşmesi** (55): iptal yalnız işi durdurur; kuyruk
  pending öğe varken devam niyeti taşır. Renderer'ın sonraki saveSync'i
  kullanıcı kuyruğu durdurursa bayrağı indirir — diskte yalan kalmaz
  çünkü queueSnapshotForDisk terminal-olmayan öğe şartı koşar.
- **Korunan-terminal sözleşmesi** (52): queueTerminalGuards yalnız
  bilinçli kabul edilmiş terminal durumunu korur; guardsız merge'de
  bayat 'running' normalize kurtarma yolundan pending+recovered'a
  düşürülür — 'done' asla 'running'e dirilmez.

## Teslim

- `tests/queue-writer-interleave.test.js` (yeni): 10 kontrol, tümü geçti.
- `npm test` runner'a otomatik dahil (tests/*.test.js).

## Windows etkisi

Yalnız test dosyası; davranış farkı yok, koşulmayan doğrulama yok.
