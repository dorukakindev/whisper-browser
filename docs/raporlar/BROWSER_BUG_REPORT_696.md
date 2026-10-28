# Rapor 696 — Seçili aralıkta gerçek ayırma ve Windows durdurma kabulü

Başlangıç ve bitiş ürün kodu: `ee4dcc005d5433caf6b25372431316b3911b825c` (PR594 sonrası master `aab8e16bb997e88927bb158e7d47cf41d718e4a6`). Bu paket ürün kodu değiştirmez; mevcut davranışın gerçek çalışma kanıtını ekler. Dal `codex/background-range696`.

## Gerçek motor kabulü
Kaynak: kişisel olmayan, 44.1kHz stereo 12 saniyelik sentetik sinüs karışımı; sol 220/440Hz, sağ 330/660Hz. UTF-8 BOM Türkçe dosya adı/SRT ile 3–7 saniye seçildi. Üretimdeki `tools/voxcpm2/prepare_background.py` doğrudan kurulu separator-venv Python ile çağrıldı. Model `UVR_MDXNET_KARA_2.onnx` zaten diskteydi; yeniden indirme/ücretli servis/kişisel medya yok.

- CUDA Torch kullanılabilir; ONNX Runtime CUDAExecutionProvider kurulu.
- Worker `extract → separate → separate_gpu → ready`, exit0; toplam 10.422 saniye.
- FFmpeg'den ayırıcıya giren gerçek input.wav **4.0 saniye**, nihai sonuç **4.0 saniye**, stereo/44100Hz. Seçim dışındaki sekiz saniye ayırma motoruna verilmedi.
- Bu ses niteliği/müzik-vokal temizliği değerlendirmesi değildir. GPU aşama bildirimi ve gerçek motor işlemi var; ORT her düğümünün CUDA üzerinde çalıştığı profillenmedi.

## Gerçek durdurma kabulü
`src/dub-background.js.prepareBackground` + `src/process-lifecycle.js.terminateProcessTreeAndWait`, gerçek worker/Windows taskkill `/T /F` ile iki kez çalıştırıldı:
- `extract` bildirimi üzerine durdur: close doğrulandı, sahiplik null, nihai dosya yok; 0.279 saniye.
- `separate_gpu` bildirimi üzerine durdur: close doğrulandı, sahiplik null, nihai dosya yok; 3.606 saniye.
Bunlar API/arayüz düğmesi tıklaması değil üretim servis ve süreç yaşamı yoludur. GPU çöküşü ve aynı anda başka kişisel iş senaryosu denenmedi. Kullanıcının açık uygulamasına dokunulmadı.

## Hedefli kontroller
- dub-background Node testi PASS; mevcut 14 Python background-cache testi PASS (gerçek FFmpeg kesimi/cache, örnek aralığı, geçersiz çıktı dahil).
- dub-service + dub-service-warm-start PASS, kontrollü worker iptal/tek iş/çıkış sahipliği.
- process-lifecycle ilk sandbox koşusunda gerçek spawn EPERM verdi; başarılı sayılmadı. İzinli tekrar exit0 ve gerçek parent/grandchild dahil 10 kontrol PASS.
- Test scriptinin ilk göreli import yolu hatası worker başlamadan düzeltildi. Ürün bulgusu sayılmadı.

## Önceki kapsam ve açık sınırlar
F27/N0521–N0540 tarihsel wrapper ailesi tekrar yeni bug olarak sayılmadı. Bu paketin farkı gerçek kurulu ayırma modeli, Windows süreç ağacı ve çıktı/input süre kanıtı. [audio-separator güncel kaynak](https://github.com/nomadkaraoke/python-audio-separator/blob/main/audio_separator/separator/separator.py) ve kurulu MDX yükleme yolu incelendi: Torch aygıtı ile ORT sağlayıcı seçimi ayrı katmanlar; mevcut bağımlılık korunur, kod kopyası/yeni paket yok.

Tam npm test/CI, temiz start.bat, canlı YouTube indirme ve gerçek müzik temizliği bu tur koşulmadı. YouTube kaynağı hâlâ bütün sesi indirebilir; yalnız seçili kesitin **ayırıcıda işlenmesi** doğrulandı. P055 mevcut-doğrulandı; P008 iki aşamada kısmi gerçek kabul. Diğer aşamalar ve kullanıcı arayüzündeki kapanış göstergeleri bütünüyle tamamlandı sayılmaz.

Kanıt: BACKGROUND696_2026-10-28/acceptance.json ve cancel.json. WAV ve test profilleri Git'e eklenmedi.
