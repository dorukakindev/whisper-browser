# BROWSER_BUG_REPORT_220 — R268: Benchmark/diagnostics roundtrip + bozuk dosya

**Tarih:** 2026-09-30 · **Dal:** `fix/r268-bench-corrupt` · **Sonuç: TEMİZ (bug yok)** — 3 test eklendi.

## Kapsam

20'lik plan maddesi 18. İki yüzey incelendi:

1. **Diagnostics export roundtrip** — `browser:diagnostics:export` IPC'sinin
   hassas-veri sızıntısı ve dosya yazımı zaten `electron-subtitle-output.smoke.js`
   ile uçtan uca kilitli (`--electron-diagnostics-sensitive-smoke` +
   `--electron-diagnostics-output`); `browser-diagnostics-export.test.js`
   birim katmanında redaksiyon kurallarını kapsıyor. Tek yönlü export'tur —
   yeniden-içe-aktarma yolu yok; ek boşluk bulunamadı.

2. **Benchmark (`model_benchmark.py`) bozuk-dosya + roundtrip** — mevcut
   F17 testleri sözleşme/ölçüm tarafını kapsıyordu; bozuk girdi ve süre-aşımı
   gibi hata yolları kilitsizdi.

## Yeni testler (`backend/test_model_benchmark.py` +3 → 11 test)

| Test | Kilitlenen davranış |
|---|---|
| `corrupt_input_raises_called_process_error` | Bozuk medya dosyası ffmpeg'i patlatır → `__main__` sarmalının `ok:false` emit ettiği `CalledProcessError` main()'den sessizce yutulmadan yukarı taşır |
| `start_beyond_duration_reports_no_measurable_audio` | `--start` dosya süresini aşınca boş wav → `"ölçülebilir ses bulunamadı"` RuntimeError (çöküş değil, anlamlı hata) |
| `result_json_roundtrip_preserves_schema` | Emit edilen sonuç `JSON.parse` roundtrip'inden bozulmadan çıkar; clipHash/diff şeması korunur |

## Doğrulanan hata yolları (bug yok)

- Bozuk/okunamaz medya → çöküş değil, `ok:false` + stderr detayı.
- Boş kesim (start > süre) → anlamlı RuntimeError, NaN/0 değerli sahte
  sonuç emit edilmez.
- Emit şeması JSON roundtrip'e dayanıklı (finite değerler, dize tipleri).

## Windows etkisi

Test-tarafı ekleme; ürün kodu değişmedi. ffmpeg çağrı yolu Windows'ta
aynı; `start.bat` ortam değişkenleri bu birim testleri etkilemez.

## Doğrulanmayan sınırlar

- Gerçek model yükleme süresi/VRAM ölçümü CI'da sahte whisper ile
  kilitli; gerçek GPU ölçümü yapılmadı.
- `__main__` sarmalının emit çıktısı alt-süreç olarak ayrıca
  doğrulanmadı (main() hatasının sarmala ulaştığı kilitli).
