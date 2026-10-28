# Rapor684 — Eksik konuşma parçasını tamamlanmış saymama

Başlangıç6281423c763cdffe9638302d053fe7f7f3090c70; ürün ec52a1c8e1ef37f8bfa6e7d95ab5155c36301101; dal codex/speech-integrity684.

Yeni doğrulanmış alt katman hatası: tools/voxcpm2/dub_timing.py build_adaptive_timeline/build_narration_timeline zip(cues,paths) kullanıyor; uyuşmayan listede eksik son grup veya fazla WAV sessizce atılıyor. İki girişte boş/uyuşmayan sayı ValueError ile dosya okunmadan reddedilir. Hata nihai tam çıktı iddiasını engeller; üretilmiş parçalar silinmez. Bu alt katman reproducer'ıdır; normal UI'nın her zaman bu uyuşmazlığı ürettiği iddia edilmiyor.

tests/test_dub_timing.py eksik/fazla/boş liste için her iki yolu kontrol eder.15 zamanlama testi PASS; Python compile/diff PASS. backend/test_speech_translation.py18 mevcut test PASS: ses çeviri opt-in, uzun düşünce ve konuşmacı/sahne sınırı, salt-okunur bağlam, kaynak zaman koruma, anlamı bozan editten önceki taslağa dönüş, terim belleği sınırı, kaynak echo reddi. Bu18test yeni bug veya gerçek model kalitesi değildir. Kişisel anahtar/API/GPU kullanılmadı.

P028/P049/P070 ses bütünlüğüne alt katman kanıtı; çeviri P011–P020 için kontrollü kanıt ilerlemesi, tam kabul değil.100hedef aktif. Sonraki: konuşma grubu kaynak kelime bütünlüğü, gerçek TTS uzun grup akıcılığı ve tek grup sürüm seçimi yolları.

İncelenen Python resmi zip sözleşmesi https://docs.python.org/3/library/functions.html#zip kısa iterable sonunda durmayı açıklar. Mevcut dub_utterance/recovery/finish/plan ve önceki Agents/PDF.js yaklaşımları referans; yeni dış kod/dependency alınmadı. Windows venv NumPy/soundfile ile test edildi; start.bat/install.bat ve GPU/DRM/canlı çeviri denenmedi. UI değişmedi, native ekran gerekmedi. Şema/IPC yok. Tam CI beklenmedi. Kişisel dosyalar korunarak normal PR/merge teslimi.
