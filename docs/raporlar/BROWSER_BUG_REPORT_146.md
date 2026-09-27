# BROWSER_BUG_REPORT_146 — Gerçek E2E transkripsiyon doğrulaması (R149)

Tarih: 2026-09-27 · Dal: codex/r149-e2e-transcribe

## Bug değil — gerçek uçtan uca doğrulama kanıtı

R114-A olarak bekleyen gerçek model koşusu bu makinede tamamlandı:
faster-whisper 1.2.1 / tiny / CPU / int8, gTTS ile sentezlenmiş İngilizce
konuşma → `transcribe.py` → SRT/VTT/JSON.

## Kanıt (2026-09-27, bu makine)

- Girdi: 14.45 sn wav (3 cümle, 0.8s sessizliklerle ayrılmış).
- Sonuç: 2 segment, metin %100 doğru ("Hello and welcome to the subtitle
  test…", "The quick brown fox jumps over the lazy dog near the river."),
  RTF 11.96x gerçek zaman, kalite raporu temiz (0 çakışma, 0 CPS ihlali).
- SRT UTF-8 BOM'lu ve zaman damgaları geçerli; `done` olayı
  `files/segments/perf/sourceId` şemasıyla tam.
- Tekrarlanabilir test: `tests/e2e-transcribe-local.test.js`
  (`WHISPER_E2E=1`, model/gTTS yoksa CI'da skip — opt-in armatür).

## Notlar
- gTTS test armatürü; proje venv'ine bağımlılık eklenmedi (sistem python'u).
- tiny model sürükleyici doğrulukta değerlendirme için yeterli değil —
  gerçek içerik kalitesi RTX 4070 Ti + daha büyük modelde farklıdır;
  bu koşu hattın uçtan uca çalıştığını kanıtlar.
