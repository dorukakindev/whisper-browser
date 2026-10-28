# Rapor719 — Native Durdur, iş çakışması ve sıcak motordan Whisper’a geçiş

Başlangıç `b173120d5a659cb0bb8e39206048d064684acb0f`; araç/test bitişi `09a61b31c7b496ba19ad44ee3dfdac26fa6ad090`; dal codex/voice-ui-cancel719. **Yeni ürün bugı0.** R718'in doğrudan Nodeworker kanıtını tekrar yeni bug saymadan, gerçek renderer/preload/IPC/main ve Windows arayüz yoluna genişletir.

## Gerçek kabul akışı

`tools/voice-ui-cancel-check.cjs` açık `--run-real-voice-ui-cancel` ister; gerçek main.js ve 1280×960Electronpenceresi, ayrı userData/downloads, sentetik SRT/SAPI referans/video. Kişisel uygulama/sekme/ayar/kasa kullanılmaz. Yerel dosya seçicisi yalnız bu testin sentetik yolu için kontrollüdür; SRT erişim yetkisi üretim IPC'sinden geçer. Ağ fetch kapalıdır, HF offline; DeepSeek/API çağrısı yok. Model ve motor önceden kurulu olmalı.

1. Arayüzde dublaj penceresi ve SRT seçimi, gerçek GPU sentez activity'sini bekleme. Başlat disabled, Durdur enabled.
2. Aynı aktif dublaj sırasında ikinci dub:start reddedilir; transcribe:start busy true döner. İkinci motor oluşmaz. Bunlar gerçek güvenilir preload üzerinden yetkili test istekleridir, sahte busy fixture'ı değildir.
3. Durdur düğmesinin gerçek DOM sınırlarından mouseDown/mouseUp gönderilir. İptal edilen iş cancelled olayı, ekranda Durduruldu, Başlat enabled/Durdur disabled. İlk warm host PID kapalı.
4. Aynı SRT/referansla arayüzden tekrar üretim: yeni host oluşur, done ve gerçek WAV, controls tekrar hazır. Sonra motorun hâlâ sıcak/canlı olduğu kontrol edilir.
5. Gerçek sentetik video seçilir, üretim formu tiny/faster/CPU/int8/en/2–10s, çeviri kapalı. Gerçek Başlat düğmesiyle Whisper. Python transcribe.py spawn anında önceki ses motorunun close verdiği doğrulanır. Whisper done gelir. Sonunda yalnız bu aracın sahipli hostları temizlenir.

[Native kabul JSON](VOICE719_2026-10-28/acceptance.json):215ms UIiptali;2host,çakışanikiistekreddi,Whisperdone. Bu süre fare olayından kontrol yenilemesi ve iptal görüntüsü alınmasına kadar ölçümdür; saf GPU kernel iptal gecikmesi değildir. Önceki dar UIkoşusu287ms idi, onda son Whisper adımı yoktu. R718 ağaç-PIDkanıtı ayrı kalır: bu UI aracı host PID'lerini izler, çocukları tekrar tek tek ölçmez.

Tek yeniden üretim ready/ASR.9333; otomatikASR metninde telaffuz/yazım farklılıkları var. İnsan kulağıyla kusursuz dublaj/telaffuz onayı değildir. CPUWhisper çalışması GPUWhisper eşzamanlılığı kanıtı değildir. İlk dublajdaki iptal sentez başında; başka aşamalarda iptal ve tamamlanmış grup-cache kurtarma ayrı kalır.

## Görsel inceleme ve yanlış alarmın ayrılması

Gerçek [sentez](VOICE719_2026-10-28/synthesis.png), [durdurulmuş](VOICE719_2026-10-28/cancelled.png), [tamamlanmış](VOICE719_2026-10-28/completed.png) ekranlar kaydedildi; ilk UIkoşusunun durdurulmuş/tamamlanmış ekranları da açılıp görüldü. Mevcut tema/yerleşim değiştirilmedi.

Whisper done IPC'sinin hemen ardından yakalanan karede sonuç kutusu soluktu. Bu ürün katman hatası diye sayılmadı. Aynı gerçek app ile GPU'suz ayrı görselprob, showResultModal sentetik olayından800ms sonra opacity1,z-index600,merkez element modalStats,animations0 gösterdi. [Yerleşmiş yardımcı görüntüsü](VOICE719_2026-10-28/result-helper-settled.png) ayrı sentetik modal probudur, gerçek Whisper tamamlanma ekranının yerine geçirilmez. Son snapshot yardımcısı artık sonlu animasyonları bounded800ms bekler; final helper gerçek app'de opacity1/animations0PASS. Bu son yalnız-görüntü değişikliğinden sonra bütün GPU akışı gereksiz tekrar edilmedi; helper ayrı gerçek kontrol edildi. Önceki soluk kare özel kanıtta tutulur, genel tasarım bozukluğu iddia edilmez.

## Kontroller, kaynak, sınırlar

Node warm-start tek davranış ve pipeline-cancel mevcut10kontrol PASS; pipeline gerçek Python parent+child kapanışı70.652ms ayrıcaPASS. Node syntax/diff PASS. Tam npm/uzunCI beklenmedi. 11before-quituyarısı görünür kaldı; ağ kapalı testte reklam filtre indirme uyarısı beklenen, canlı reklam engelleme sonucu değildir.

[Electron webContents kaynak dokümanı](https://github.com/electron/electron/blob/main/docs/api/web-contents.md) input/capture sözleşmesi ve [MIT lisansı](https://github.com/electron/electron/blob/main/LICENSE) incelendi. Mevcut video-live-pipeline izolasyon yaklaşımı ve üretim iptal/idle-release kodları kullanıldı; dış dependency/kod eklenmedi. Yeni ürünayar/şema/kurulum/UI değişikliği yok.

start.bat/install.bat bu harness ile sınanmadı; kullanıcının açık ana programı kapatılmadı. CanlıYouTube, gerçekdosyaseçicietkileşimi, API/DRM, OSshutdown, OOM, sonparçastall, tümçakışmapermutasyonları ve insandinlemesi yapılmadı. P047/P048 kısmi ilerler; tamamı bitti denmez. P081–P090 müzik analizi kapsam dışı kalır.

Tekrar: Electron ile `tools/voice-ui-cancel-check.cjs --run-real-voice-ui-cancel --engine <VoxCPM2> --reference <sentetik.wav> --transcript <sentetik.txt> --video <sentetik.mp4>`; en az10s, konuşmalı yerel video kullan. Native geçişler ve ses üretimi nedeniyle açık opt-in ve Windows/GPU önkoşulludur. Hamprofil/loglar/WAV ve kişisel veriler Git'e konmadı; yalnız sentetik seçilmişPNG/JSON.
