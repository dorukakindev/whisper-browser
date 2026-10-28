# Rapor701 — Ses yüksekliği: gerçek ölçüm ve hedefli regresyon

Başlangıç master `74bca3ec3a5e61816dfe5abf95353762ecc631a4`. Yeni ürün kusuru bulunmadı; çalışan normalizasyon gereksiz değiştirilmedi. P025 ölçülebilir çıktı kabulü ilerletildi; P026 insan doğallığı hâlâ kısmi.

- Gerçek VoxCPM2 CUDA/sentetik referans R685 çıktısı21.140145833s: **-20.00LUFS**, **-3.17dBTP**, LRA3.50.
- Aynı ses0.1x→-40.00LUFS;2x float→-13.98LUFS/+2.85dBTP;stereo→-16.99LUFS. Üretim `loudnorm_audio` sonrasında üçü de **-20.00LUFS**. Peakler mono-3.17dBTP/stereo-6.18dBTP. Süre ve kanal sayısı korundu, sonlu örnekler/kırpılma yok.
- Gerçek iki grup arasında0.193958s boşluk, ikinci grup başlangıç örnek farkı0.0. Bu tek sınır ölçümüdür; bütün geçişlerin insan kulağıyla kusursuzluğunu ispatlamaz.
- Mevcut normalizer testine sessiz/yüksek/stereo gerçek FFmpeg ölçümü eklendi.4test PASS2.232s; timeout/kilit/geçersizçıktı fallback kontrolleri de korunur. Eşik gevşetilmedi.

[Kanıt ve tekrar](LOUDNESS701_2026-10-28/REPRODUCE.md). Kaynak WAV SHA256 acceptance.json içinde, ham ses/profil/API yok. Baseline ve türetilen kopyalar ignore alanında; kişisel veri kullanılmadı.

## Araştırma ve sınırlar

[FFmpeg upstream filters.texi loudnorm](https://github.com/FFmpeg/FFmpeg/blob/master/doc/filters.texi) gerçek kaynak dokümanı incelendi: iki geçiş measured I/TP/LRA/thresh ve linear koşulları; dinamik modda açık output sample-rate gereği. Mevcut uygulama bunları kullanıyor. Yeni dependency/alıntı kod/şema yok. Mono/stereo aynı algısal eşitlik iddiası yapılmadı; burada EBU ölçüm hedefi sınanır. Resmî HTML doküman isteği timeout; upstream raw metin okundu.

UI değiştirilmedi; yeni ekran testi gerekmedi. start.bat/install/DRM/canlıYouTube/LLM/insan dinlemesi bu pakette koşulmadı. CI beklenmedi. R700'deki11before-quit uyarısı açık. Ürün100 tamamlandı denmez.
