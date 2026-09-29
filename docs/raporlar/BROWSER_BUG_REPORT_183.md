# BROWSER_BUG_REPORT_183 — R224: #153 Devin Review triage (mezar taşı/PDF/TM kapanışları)

Tarih: 2026-09-29 · Dal: `codex/r224-review-round-1790628000` · Taban: `origin/master` (00a3965)

## Kapsam

Merged PR #153'nin Devin Review turu (`pr-review-job-27b1479c1f5b44cabbfee1ae960fb78b`,
commit `8705c8c`): 3 bug + 1 flag. Üç bug doğrulandı ve düzeltildi; flag de
küçük bir kapanış düzeltmesiyle kapatıldı (TM zehirinin kullanım tarafı).

## Doğrulanmış bug'lar → düzeltildi

| # | Bulgu | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| BUG_0001 | PDF okuma döngüsü uyumlu eski dosyaya ulaşmıyor | `readPdfTranslationState` ilk VAR OLAN adayda `return` ediyordu; kimliği uyuşmayan dosya normalize'da taze duruma düşüp legacy/bak adaylarını atlıyordu (aynı pdfHash + farklı model/endpoint kombinasyonlarında eski sayfalar kayboluyordu). | Döngü adayın `pdfHash/endpoint/model/targetLanguage` alanlarını normalize öncesi karşılaştırır; uyuşmazsa sonraki adaya geçer. Uyumlu dosya ilk bulunanda döner. |
| BUG_0002 | Bayat mezar taşı yeni çeviriyi siliyor | Sıkıştırma sonrası kalan eski journal'daki `v:''` satırı koşulsuz `map.delete` uyguluyordu; temel dosyadaki DAHA YENİ kaydı da siliyordu (değer satırlarının `updatedAt` dedup kuralı mezar taşında yoktu). | Mezar taşı yalnız mevcut kayıt yoksa ya da `alive.updatedAt <= tombstone.t` ise uygulanır. Regresyon: `staletomb.json`. |
| BUG_0003 | `v` alanı olmayan satır mezar taşı sayılıyor | `String(row?.v || '')` eksik alanı `''` üretip silme olarak uyguluyordu — bozuk/yarım satır sağlam temel kaydı silebiliyordu. | `typeof row.v !== 'string'` satırlar atlanır; mezar taşı yalnız açık `v:''` satırıdır. Regresyon: `nov.json`. |
| FLAG_0001 | Eski TM zehirleri lookup'tan dönüyor | `stage_tm_rows` yeni eko girişini keser ama önceki sürümlerden kalan zehirli satırlar `tm.lookup`'tan "çeviri" diye dönebiliyordu. | Lookup isabeti `translation_is_source_echo` ile kullanımda da elenir — API yoluna düşer. Regresyon: `test_poisoned_tm_row_is_not_served`. |

## Doğrulama

- `backend/test_sentence_distribution.py`: **41/41**
- `tests/browser-translation-cache.test.js`: **12/12** (2 yeni senaryo)
- `node --check` main.js, browser-translation-cache.js ✓ · `py_compile` ✓

## Windows etkisi

- PDF okuma geriye uyumunu korur (legacy dosyalar kimlik uyuşmazsa artık
  atlanır, uyumlu olanı bulunur); sqlite/dosya kilidi yok.
