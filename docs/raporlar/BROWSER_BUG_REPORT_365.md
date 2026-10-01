# Rapor 365 — 100-kuyruk batch 3 (maddeler 21–30): backend hata/kenar yolları

- **Başlangıç:** `0f703ca` (batch-2 merge sonrası master)
- **Bitiş:** batch-3 squash-merge (bu PR)
- **Tarih:** 2026-10-01 UTC

## Yöntem

Batch 3 backend hata ve kenar yollarını doğrulamak için tüm Python test süiti (59 `backend/test_*.py` dosyası, `tests/python-runtime.js` `findTestPython()` ile aynı yorumlayıcı: `backend/venv/bin/python`) uçtan uca koşturuldu ve ardından modül↔test referans taramasıyla ölü bölge arandı.

## Madde kapanışları (21–30)

| # | Konu | Sonuç |
|---|------|-------|
| 21 | Backend süit bütünlüğü | **60/60 dosya yeşil** — venv python'u ile `timeout 600` her dosya; sıfır FAIL. (İlk denemede sistem python3 ile `srt`/`genanki` eksikliği 4 sahte FAIL üretti; venv ile tekrar hepsi geçti — test altyapı kusuru değil, yanlış yorumlayıcı seçimi.) |
| 22 | Transcribe hata yolları | `test_transcribe*.py` ailesi yeşil — KeyboardInterrupt sözleşmesi (B-329-01), kuyruk, segment kapıları kilitli. |
| 23 | Diarization kenarları | `test_diarization.py` 14/14 — CUDA OOM CPU geri dönüşü (B-329-02) dahil kilitli. |
| 24 | Yazıcı/ayrıştırıcı | `test_writer*.py`, `test_parser*.py`, golden/roundtrip kilitleri yeşil. |
| 25 | Çeviri hattı | `test_llm_translate*.py`, `test_sentence_translation*.py` yeşil — echo-kabul, paketleme, TM sözleşmeleri kilitli. |
| 26 | yt-dlp/güncelleyici | `test_update_ytdlp*.py` yeşil — wheel traversal/SSRF kapıları (R168) kilitli. |
| 27 | Workspace paket hattı | `workspace_video_package.py` `tests/workspace-video-bounds.test.js` + `browser-report86-regressions.test.js` üzerinden uçtan uca kapsalı (bounded copy, sondaki-nokta, eksik-giriş). |
| 28 | nMDB katalog içe aktarım | `nmdb_catalog_import.py` `tests/nmdb-catalog-import.test.js` üzerinden sentetik SQLite ile uçtan uca kapsalı (okuma-yalnız URI, eksik-tablo, bozuk değer). |
| 29 | Ölü-bölge taraması | 25 backend modülü × test referansı süpürmesi: 3 referanssız aday çıktı → 2'si JS-spawn ile kapsalı (maddeler 27–28); **1 gerçek ölü bölge: `separate_dialogue.py`** → madde 30. |
| 30 | `separate_dialogue.py` sözleşme kilidi | **DÜZELTME:** `backend/test_separate_dialogue.py` eklendi — stdin↔stdout JSON zarfı kilitlendi (5 kontrol). |

## Düzeltilen kusur

**B-365-01 — `separate_dialogue.py` tamamen testsizdi.** `src/browser-dialogue.js`'in kısa-kesit konuşma ayırma/tekil transkripsiyon subprocess'i hiçbir test dosyasında referanssızdı. Sözleşme doğrulandı ve kilitlendi: modül her hata yolunda stdout'a tam olarak **tek satırlık `{"ok": false, "error": ...}`** yazar ve çıkış kodu 0'dır (JS tarafı JSON'u okur, exit code'a bakmaz). Kilitler: bozuk JSON → zarf, boş stdin → zarf, transcribe + yok-dosya → `Konuşma işlemi tamamlanamadı` zarfı, separate + eksik `audio_separator` motoru → zarf, stdout'ta traceback kaçağı yok.

## Windows etkisi

Yok — yeni test dosyası `sys.executable` + `subprocess` ile taşınabilir; `separate_dialogue.py`'nin kendisi değişmedi. Gerçek `audio_separator`/faster-whisper davranışı Windows'ta kuruluma bağlı (el-kontrol listesinde kaldı).

## Çalıştırılmayanlar

- CI (GitHub Actions hesapta kalıcı kapalı) — yerel doğrulama: `backend/venv/bin/python backend/test_separate_dialogue.py` 5/5 OK; tam Python süiti 60/60 yeşil.
- `devin_review_manage` 404 (bakiye bildirimi bekliyor).
- Windows el-kontrolü (ayrı oturumda).

## Kanıt

```
$ backend/venv/bin/python backend/test_separate_dialogue.py
.....
Ran 5 tests in 0.763s
OK
$ for f in backend/test_*.py; do timeout 600 backend/venv/bin/python $f; done
=== süit bitti ===   # sıfır FAIL
```
