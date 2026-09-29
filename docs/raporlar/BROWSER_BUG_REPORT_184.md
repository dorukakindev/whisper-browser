# BROWSER_BUG_REPORT_184 — R225: #154 Devin Review triage (TM kaynak-drifti + PDF yedek gizlenmesi)

Tarih: 2026-09-29 · Dal: `codex/r225-review-round-1790628000` → `codex/r225-review-round-1790629000` · Taban: `origin/master` (6f942a0)

## Kapsam

Merged PR #154'ün Devin Review turu (`pr-review-job-6fca0c1cdcb24e49a2d7381fb556227f`,
commit `41d0244`): 2 bug + 2 flag. Her iki bug doğrulanıp düzeltildi; flag'ler
dosya-tabanlı regresyon testi ve devir notuyla kapandı.

## Doğrulanmış bug'lar → düzeltildi

| # | Bulgu | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| BUG_0001 | TM kaynağı yazım hatasıyla ayrılınca eko bekçisi kaçıyor | `tm.lookup` eşleşen satırın DEPODAKİ kaynağını da döndürüyor (`source` alanı). Bekçi yalnız `echo(güncel kaynak, hedef)` kontrolü yapıyordu; depodaki kaynak bir yazım hatasıyla farklıysa yankı hedef "çeviri" diye uygulanıyordu. | Zehir testi hem depodaki kaynağa (`fuzzy["source"]`) hem güncel kaynağa karşı yapılır. Regresyon: `test_poisoned_tm_row_with_source_drift_is_not_served`. |
| BUG_0002 | Bozuk PDF durumu sağlam yedeği gizliyor | Kimliği uyumlu ama `version`/`pages` geçersiz birincil dosya `normalize`'da taze duruma düşüyordu; döngü `.bak`/legacy adaylarına hiç geçmiyordu → kaydedilmiş sayfa çevirileri kaybolmuş görünüyordu. | Uyumluluk kalıbı tek noktada toplandı: `isPdfTranslationStateCompatible`. Okuma döngüsü `loadPdfTranslationState` olarak `pdf-translate.js`'e taşındı (uyumsuz/bozuk aday atlanır); `main.js` ince sarıcı. |

## Flag kapanışları

- **FLAG_0001** (devir hash): yeni not `docs/devir/2026-09-29-0229.md`.
- **FLAG_0002** (aday sırası testi yoktu): `loadPdfTranslationState` artık
  dosya sistemiyle çalışan saf modül — 4 dosya-tabanlı senaryo eklendi
  (bozuk birincil→.bak, uyuşmaz .bak→legacy, uyumlu yok→taze, predicate kilidi).

## Doğrulama

- `backend/test_sentence_distribution.py`: **42/42** (+1 drift senaryosu)
- `tests/pdf-translate.test.js`: geçti (4 yeni dosya senaryosu)
- `node --check` main.js / pdf-translate.js ✓ · `py_compile` ✓

## Windows etkisi

- `loadPdfTranslationState` `node:fs`/`node:path` kullanır — Windows'ta aynı
  davranış; `.bak` dosya adı `<stem>.json.bak` (writeJsonAtomic ile aynı).
- Eski endpoint'siz legacy dosyalar boş-endpoint kimliğinde okunmaya devam eder.
