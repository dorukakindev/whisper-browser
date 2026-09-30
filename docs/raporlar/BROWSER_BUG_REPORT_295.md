# BROWSER BUG REPORT 295 — R329-3: diarization OOM/kenar dayanıklılığı

- Tarih: 2026-09-30
- Kapsam: `run_diarization` + `_is_oom_error` (yeni) — `backend/transcribe.py`
- Sonuç: **1 dayanıklılık boşluğu düzeltildi** (B-329-02) + 4 yeni test.

## Bulgu — B-329-02: CUDA OOM işi tümden düşürüyordu

`_load_pcm_waveform_for_pyannote` bellek sınırı (512 MB) ve başlık
kapıları zaten kilitliydi (R267); model boşaltma sırası da doğruydu.
Ancak `pipeline(diarization_audio)` çağrısında oluşan **CUDA OOM** doğrudan
yukarı fırlıyordu — kullanıcı uzun dosyada veya küçük GPU'da diarization'ı
tümden kaybediyordu (başarısız `error` olayı + journal rollback ile
tüm transkripsiyon işi düşüyordu).

## Düzeltme

- Yeni `_is_oom_error(exc)`: tip adında `oom`/`outofmemory` ya da mesajda
  `out of memory`/`cublas_status_alloc`/`cudnn_status_alloc` içeren hataları
  tanır. İlk sürüm yalnız `oom` arıyordu — `OutOfMemoryError` adındaki
  `outofmemory` dizisi `oom`'u ardışık içermiyor, test yakaladı.
- `pipeline(...)` çağrısı `try`'e alındı: OOM + CUDA mevcutsa `warn`
  günlüğü, `empty_cache()`, `pipeline.to('cpu')` (çağrı kendisi başarısız
  olursa sessizce geçilir) ve **tek** yeniden deneme. OOM olmayan hata
  veya CPU yedeğindeki ikinci OOM dokunulmadan yukarı fırlatılır.

## Kilit — `backend/test_diarization.py` (+4 test)

- `oom_falls_back_to_cpu`: ilk çağrı OOM → `to: [cuda, cpu]`, `calls==2`, dönüş span'leri.
- `oom_class_name_detection`: tip-adı `OutOfMemory` taşıyan sahte sınıf da yakalanır.
- `non_oom_not_retried`: başka hata tek çağrıyla fırlatılır (`calls==1`).
- `second_oom_propagates`: CPU yedeği de OOM verirse hata korunur, üçüncü deneme yok.

Sahte `Pipeline.__call__` artık `fail` listesini sırayla tüketir
(birinci çağrı hata, ikinci başarı); `to` çağrıları liste olarak kaydeder.

## Testler

- `backend/venv/bin/python` ile tam diarization dosyası → 14/14 PASS
  (sistem pythonunda numpy yok; venv'te 2.5.3 mevcut).

## Sınırlar

- Yeniden deneme tek sefer; CPU diarization yavaştır (kullanıcıya `warn` ile bildirilir).
- `pipeline.to('cuda')` OOM verirse (yükleme sırasında) kapsam dışı — o çağrı
  try dışında; gerekirse aynı kalıbın taşınması düşük maliyetli.
