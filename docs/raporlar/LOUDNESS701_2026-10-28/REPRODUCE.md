# Gerçek ses yüksekliği kabulü

`verify.py <project-root> <generated-WAV> <output-folder>` komutunu numpy/soundfile yüklü backend Python ile çalıştır. WAV yanında üretimin `.quality.json` dosyası bulunmalı. R685 sentetik referansla gerçek CUDA üretimi kullanıldı; ses Git içine kopyalanmadı. Script yalnız çıktı klasöründeki kopyaları değiştirir; kaynağı değiştirmez. FFmpeg projenin mevcut bulucusuyla bulunur.

Sessiz (0.1x), yüksek (2x floating WAV) ve stereo varyantları gerçek `loudnorm_audio` ile normalize edilir. Sonucun **input_i/input_tp** değerleri ölçülür; ölçüm komutunun varsayımsal output_i değeri nihai dosya ölçümü sanılmaz. Kabul: -20±0.5LUFS, true peak≤-1.9dBTP, süre farkı≤1örnek, aynı kanal sayısı, sonlu örnekler ve kırpılmamış peak. Bağımsız kısa regresyon: `backend/venv/Scripts/python.exe tests/test_dub_normalize.py`.

Bu dinleme/doğallık/duygu değerlendirmesi değildir. Geçiş ölçümü tek iki-gruplu örnektir; bütün metinler için iddia yok.
