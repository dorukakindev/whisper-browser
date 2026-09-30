# BROWSER BUG REPORT 292 — R328-4: CI flake aday analizi + workflow sertleştirme

- Tarih: 2026-09-30
- Kapsam: son ~60 CI koşusunun başarısızlık envanteri + `.github/workflows/ci.yml`
- Sonuç: **gerçek flake yok**; 2 workflow sertleştirmesi uygulandı.

## Yöntem

`gh run list` (60 koşu) içinden `failure` koşuların `--log-failed` çıktısı
`=== node tests/<dosya> ===` bölüm başlıklarına bağlanarak dosya-bazı
atıf tablosu çıkarıldı (`ytdlp-runtime.test.js`'in her düşüşte görünmesi
özet satırı sıralaması yüzünden yanlış atıftı — bölüm-içi FAIL araması
düzeltti).

## Bulgular

| Test dosyası | Koşu sayısı | Hüküm |
| --- | ---: | --- |
| `conflict-markers.test.js` | 8 | deterministik — diff3 `|||||||` artığı; `ad2a796`'da düzeldi |
| `interval-inventory.test.js` | 3 | deterministik — Windows `path.sep` whitelist kaçağı; düzeldi |
| `timeline-oracle-fuzz.test.js` | 1 (6 kontrol) | deterministik — dal ilk itişinde düştü, PR #275 merge öncesi düzeldi |
| (atıfsız) | 2 | erken-head harness stub (`p.stdout.setEncoding` vm dilimi) — dal içinde düzeldi |

**Tekrarlayan (gerçek anlamda flaky) test yok**: tüm düşüşler o revisyonda
deterministikti ve merge edilmeden önce kapatıldı.

## Uygulanan sertleştirme — `.github/workflows/ci.yml`

- `concurrency: { group: workflow-ref, cancel-in-progress: true }` — aynı
  ref'e ard arda push'ta bayat koşu iptal edilir (iki bacaklı matris
  boşa koşmaz; açık-PR churn'ünde kuyruk basıncı azalır).
- `timeout-minutes: 30` — asılı bir test süreci varsayılan 360 dk sınırını
  yemez (tipik koşu ~8–15 dk).

## Sınırlar

- Koşu geçmişi penceresi ~60 koşu (~1 günlük churn); uzun-ufuklu flake
  eğilimi için periyodik tekrar gerekir — yöntem `gh` CLI ile tekrarlanabilir.
- Windows bacak logları aynı yapıda; her iki bacak ayrı tarandı.
