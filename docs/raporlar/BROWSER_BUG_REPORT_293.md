# BROWSER BUG REPORT 293 — R329-1: Yazıcı seçenek matrisi golden kilidi (temiz)

- Tarih: 2026-09-30
- Kapsam: `backend/transcribe.py` yazıcı hattı — seçenek permütasyonları
- Sonuç: bug yok; 15 permütasyon sha256 kilidi eklendi.

## Boşluk

`test_golden_writers.py` byte-exact kilitleri yalnız **varsayılan** seçenekleri
kapsıyordu: `wrap_mode='sentence'`, `max_line_width=42`, `max_lines=2`,
`language='tr'`, dual'da `translation_first=True`, json'da `info` var.
İzin verilen diğer değerler — `wrap_mode` üçlüsü (none/sentence/balanced),
line_width/lines sınırları, `language='en'` (ordinal kümesi değişir),
`dual` ters sıra, `json` no-info/words+speakers, `write_confidence_report`
(tamamen kilitsizdi) — kapsam dışıydı: bir regresyon fark edilmezdi.

## Eklenen kilit — `backend/test_golden_matrix.py`

15 varyant, her birinin sha256 özeti `EXPECTED` tablosunda:

- srt: wrap-none, balanced-30, balanced-80x3, sentence-maxlines-1, lang-en
- vtt: wrap-none, balanced-30, lang-en
- ass: speakers'ız, speakers+balanced
- dual: source-first
- json: no-info, words+speakers
- confidence: 0.3 / 0.6 eşikleri — **(yazıldı, sayı, sık_kelime) üçlüsü de**
  kilidin parçası; eşik üstünde düşük-güven kelime yokken dosya YAZILMAZ
  kararı da korunur.

Fixture `test_golden_writers`'tan import edilir (tek kaynak). Yeniden üretim:
`python backend/test_golden_matrix.py --regen`.

## Testler

- `python3 backend/test_golden_matrix.py` → 2/2 PASS.

## Sınırlar

- sha256 kilidi içerik değişimini yakalar; hangi satırın değiştiğini göstermez
  (gözden geçirme `--regen` çıktısıyla yapılır).
- `write_checkpoint` / re-export akışı bu matriste değil.
