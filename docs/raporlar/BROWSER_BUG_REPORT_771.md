# Rapor771 — Stüdyo dinlemesinde tek ses

P038/P058/P059 sınırlı ilerleme. Metin stüdyosunda referans ve sonuç audio elementleri bağımsız çalıyordu. Native Windows gerçek sentetik WAV decode+play ile parent f77ac6be üzerinde `Output playback must stop the reference` exit1 doğrulandı. Bu R725 video miks mute hatası değildir; ayrı stüdyo önizleme yüzeyidir.

`src/renderer/text-voice-studio.js`: iki yönlü play dinleyicisi, yeni aktif oynatıcı diğerini pause eder; currentTime sıfırlanmaz. Gecikmiş play olayı ancak element hâlâ !paused ise diğerini durdurabilir. Mevcut close ikisini durdurma davranışı korunur. Yeni UI/CSS/ayar/IPC/bağımlılık yok. Dublaj miks katmanları bu dinleyicilerin kapsamına girmez.

`tests/electron-text-voice.smoke.js --audition`: ayrı profilde gerçek native iki audio elementinde WAV metadata/readyState, referans→sonuç→referans karşılıklı pause, sonuç currentTime korunumu, close sonrası iki paused ve yeniden açılış. Sonuç slotuna test için aynı sentetik WAV bağlanır; yeni üretim veya GPU kalitesi kanıtı değildir. ParentFAIL→finalexit0 complete:true. [Kabul ölçümleri](STUDIO771_2026-10-29/acceptance.json). HTMLMediaElement pause/resume mevcut projenin A/B dinleme yaklaşımıyla uygulanır; dış kod kopyası yok.

İki mevcut Node servis testi PASS, iki JS syntax/diffcheck PASS. Görsel yerleşim değiştirilmedi; mevcut native TR/EN geniş/dar125 kontrolleri aynı akışta geçti. Donanımdan çıkan fiziksel ses, insan kalite tercihi, gerçek GPU, kişisel start.bat ve tam npm test koşulmadı.11before-quit listener uyarısı sürer; testte dış ağ kapalıdır. Uzun CI beklenmedi. Kişisel dosyalar teslim dışı.90aktifhedef sürer.
