# BROWSER_BUG_REPORT_219 — R267: Diarization (pyannote) hattı birim kilitleri

**Tarih:** 2026-09-30 · **Dal:** `fix/r267-diarize-tests` · **Sonuç: TEMİZ (bug yok)** — 10 test eklendi.

## Kapsam

`backend/transcribe.py` diarization hattının test edilmemiş yüzeyi:
`_load_pcm_waveform_for_pyannote` (PCM WAV çözümleme — TorchCodec
atlatması), `run_diarization` (model yükleme + hata yolları + GPU
temizliği), `assign_speakers` (çoğunluk oyu), `offset_diarization_spans`
(kırpma ekseni geri eşlemesi).

Mevcut kapsam `test_transcribe.py` içinde sınırlıydı (yalnız GPU temizliği
ve tek span ofseti); bu dosya tüm hata dallarını kilitler.

## Yeni testler (`backend/test_diarization.py`, 10 test)

| Test | Kilitlenen davranış |
|---|---|
| `pcm_waveform_all_sample_widths` | 1/2/3/4 bayt örnek genişliği, stereo kanal düzeni, sessizlik≈0 |
| `pcm_waveform_known_values_16bit` | 16-bit PCM → float32 ölçekleme (0.5/-0.5 birebir) |
| `pcm_waveform_rejects_bad_headers` | sıkıştırılmış tip, 0 kanal/örnek oranı/kare, geçersiz 5-bayt genişlik → anlamlı RuntimeError |
| `pcm_waveform_rejects_truncated_read` | söz verilen karelerden az bayt → "kanal verisi" hatası |
| `pcm_waveform_rejects_oversized_audio` | >512MB ses model yüklemeden önce reddedilir |
| `run_diarization_success_path_and_kwargs` | model adı, `token` auth, min/max konuşmacı kwargs iletimi, span çıkarımı |
| `run_diarization_error_paths` | pyannote/torch/token eksikliği mesajları |
| `run_diarization_legacy_use_auth_token_signature` | eski pyannote imzasında `use_auth_token` dalı |
| `assign_speakers_majority_vote` | örtüşme çoğunluğu, sınır kayması, örtüşmesiz/None span |
| `offset_diarization_spans_edge_inputs` | None/boş/sıfır/negatif ofset |

## Doğrulanan hata yolları (bug yok)

- Geçersiz WAV → model **yüklenmeden** reddedilir (mevcut `R198` kilidini
  genişletti — önceden yalnız "too big" yolu test ediliyordu).
- pyannote eksik → `"pyannote.audio yüklü değil"`; token eksik →
  HF token mesajı; torch eksik → `"PyTorch gerekli"`.
- Pipeline çağrısı patlarsa `finally` içinde `gc.collect` +
  `empty_cache` çalışır (mevcut R198 testinin kapsamında).

## Windows etkisi

Test-tarafı ekleme; ürün kodu değişmedi. `install-diarize.bat` akışı
(venv + pyannote kurulumu) test edilmedi — CI'da Windows testi yalnız
`npm test` koşar.

## Doğrulanmayan sınırlar

- Gerçek pyannote modeli indirilip koşulmadı (HF token + GPU/VRAM gerekir);
  sahte pipeline ile sözleşme kilitlendi.
- CUDA dolu-bellek davranışı gerçek GPU'da doğrulanmadı.
