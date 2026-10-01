# BROWSER_BUG_REPORT_326 — Kuyruk görevi 14: GPU bellek bütçesi yönetimi

- Tarih: 2026-10-01 (UTC)
- Dal: `devin/1790882021-item14-vram-budget` (taban `88a2728`)
- Kapsam: `backend/transcribe.py` VRAM/OOM yüzeyi + `src/renderer/renderer.js` rozet tarafı

## Görev metni (kuyruk 14/50)

"GPU bellek bütçesi yönetimi: Transkripsiyon, hizalama ve konuşmacı tanıma için ortak
kaynak bütçesi oluştur. OOM, model boşaltma ve CPU'ya geçişi kontrollü senaryolarla
sınayıp yarım çıktı oluşmasını önle."

## Mevcut uygulamanın gereksinim karşılığı (denetim sonucu)

| Gereksinim | Önceki durum | Kanıt noktası |
|---|---|---|
| Model boşaltma (ortak bellek) | VAR | Transkripsiyon modeli diarization'dan önce `del`+`empty_cache` (~7050); WhisperX ASR modeli `load_align_model`'den önce finally'de serbest (5132) |
| Diarization OOM→CPU | VAR | `run_diarization`: `_is_oom_error` + `pipeline.to('cpu')` tek deneme + finally temizliği (R329-3 kilitleri mevcut) |
| Yükleme OOM eylemlenebilirliği | VAR | `WhisperModel` ve `whisperx.load_model` OOM → "CPU/int8 dene + start.bat" metni |
| Yarım çıktı önleme | VAR | Yazıcılar segment döngüsü sonrası koşar; hata yolunda çıktı dosyası yazılmaz, checkpoint korunur |
| Ortak kaynak bütçesi | EKSİKTİ | UI'da `estimateVramMib` vardı ama backend tarafında ortak hesap yoktu |
| Segment-akışı OOM sınıflandırması | EKSİKTİ | Döngü ortasındaki CTranslate2 OOM'u ham metin olarak düşüyordu |

## Uygulananlar

1. **`estimate_transcription_vram_mib(model, compute_type, engine, batch_size, diarize)`** —
   renderer `estimateVramMib` ile aynı taban tablo (large-v3 3100, turbo 1700, medium 1600,
   small 750, base 400, tiny 250; int8×0.55, float32×1.9; batched/whisperx batch çarpanı
   üst-sınırlı +1.35; whisperx +1400 align payı; diarize +2500 pyannote). Tek sözleşme:
   UI rozeti ve backend uyarısı aynı sayıyı gösterir.
2. **`check_vram_budget(args, device)`** — CUDA işinde `torch.cuda.mem_get_info()` boş
   VRAM'i okur; tahmin > boş×0.85 ise işe başlamadan `warn` (int8/CPU/batch önerisi).
   CPU'da, torch yoksa veya ölçüm bozuksa sessiz — engel değil bilgi.
3. **`_oom_guard_iter(segments_iter)`** — döngü ortasındaki `_is_oom_error` istisnasını
   "VRAM doldu + çözüm önerileri + checkpoint korundu" metinli `RuntimeError`'a çevirir;
   OOM olmayan hata aynen geçer. `for segment in _oom_guard_iter(segments_iter)` olarak
   bağlandı — yarım çıktı sözleşmesi korunur (yazıcılar döngüden sonra).

## Test kanıtı

- `test_oom_guard_iter_classifies_and_preserves`: normal geçiş / mesaj-ve-tip-adı OOM
  sınıflandırması / OOM-olmayan hata aynen geçer.
- `test_estimate_transcription_vram_mib_contract`: model tablosu, compute çarpanları,
  whisperx/diarize payları, batch tavanı, bilinmeyen-model varsayımı.
- `test_check_vram_budget_warns_only_when_tight_on_cuda`: CPU sessiz, torch'suz sessiz,
  bol VRAM sessiz, dar VRAM tek warn + öneri.
- `test_transcribe.py` tam koşu: **219/219**.

## Bilinen sınırlar

- Tahmin tablosu kabaca — gerçek tepe kullanım aktivasyon + VAD + encode ile büyür;
  bu yüzden kapı değil uyarı.
- `torch` yoksa (kurulum arızalı) ölçüm atlanır — kurulum tanıları ayrı madde.

## Windows etkisi

RTX 4070 Ti hedefi için doğrudan ilgili: dar-VRAM uyarısı `start.bat` akışında kullanıcıya
görünür; OOM metni Windows çözüm yollarını (start.bat, install.bat, int8/CPU) önerir.
Windows'ta ayrı doğrulama: `test_check_vram_budget` stub'lı — gerçek `mem_get_info`
çağrısı Windows+CUDA'da aynı API; ek doğrulama gerektirmez.
