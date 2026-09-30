# R287 — yt-dlp/backend argüman-kaçış matrisi

**Tarih:** 2026-09-30 · **Dal:** `test/r287-ytdlp-argv` · **Kapsam:** main.js → `transcribe.py`/`invidious.py`/`ffmpeg` argv geçişi

## Bulgu özeti

Tüm kullanıcı-serbest metin seçenekleri (39 seçenek, 54 itim noktası) iki-parça
argv ile gönderiliyordu: `args.push('--opt', value)`. `spawn` kabuksuz çalıştığı
için kabuk-enjeksiyonu zaten olanaksız; risk **seçenek-enjeksiyonu** idi:
argparse `-` ile başlayan değeri yeni bayrak sanıp `SystemExit(2)` ile süreci
erkenden kapatır — fail-closed (güvenli ama meşru `-foo.mp4` gibi değerleri de
reddeder). `--output-name-suffix` tek istisnaydı ve `=` biçimiyle gönderiliyordu.

Değişiklik: `src/argv-escape.js` — `pushBoundOption(argv, ad, değer)`: değer `-`
ile başlıyorsa `--ad=değer` tek öğesine bağlar (argparse `=` sonrasını tekrar
çözümlemez), aksi halde iki-parça olarak kalır. Tüm serbest-metin seçenekleri
bu yardımcıdan geçirildi: `--youtube`, `--input`, `--input-dir`, `--output-dir`,
`--sync-srt`, `--initial-prompt`, `--glossary`, `--formats`, `--model`, `--engine`,
`--language`, `--task`, `--split-mode`, `--wrap-mode`, `--compute-type`, `--device`,
`--llm-*`, `--translate-*`, `--explain-*`, `--audio-preprocess`, `--instance`,
`--tab`, `--continuation`, `--audio-url`, `--audio-lang`, `--cookie-browser`,
`--search-type`, `--features`, `--compare-model`, `--youtube-audio-lang`,
`--youtube-cookie-browser`. Sayısal/bayrak/enum seçenekler (`--temperature`,
`--batch-size`, `String()` sarmalı değerler, `true/false` literalleri) doğası
gereği `-` başlayamaz; dokunulmadı. `--cache-dir` dahili `app.getPath` yoludur.

## Kanıtlar

- `python3` canlı argparse probu: `['--youtube','--help']`, `['--youtube','--input','/etc/passwd']`, `['--input','-evil.mp4']` → hepsi `SystemExit 2` (fail-closed).
- `tests/argv-escape-matrix.test.js` (4 kontrol): yardımcı semantiği; kaçmamış
  değer denetimi (`argvHasUnboundOptionValue`); kaynak ratchet'i — duyarlı
  seçeneklerin iki-parça `args.push` ile kalmadığı; ve main.js'ten çıkarılan
  tüm `pushBoundOption` adlarının gerçek Python argparse'la `--ad=<7 hostile değer>`
  parse edilip bayt-bayt geri döndüğü.
- Harness uyarlamaları: `adversarial-ipc` (vm bağlamlarına enjeksiyon),
  `main-args` (Function parametresi + `argValue` `=` biçimini çözer),
  `media-folders`/`unicode-paths` kaynak-desen iddiaları güncellendi.

## Doğrulanmayan sınırlar

- `transcribe.py` içi `--opt değer` tüketimi argparse'ın kendisi; ek güvenlik
  katmanı JS tarafında. Sayısal seçeneklere negatif değer göndermek yine
  argparse reddiyle biter (fail-closed, kabul edilebilir).
- Windows'ta spawn davranışı CI'da doğrulanır.
