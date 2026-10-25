# Rapor557 — Son aşamada sınırsız ses dengeleme ve görünmeyen çalışma

2026-10-25 07:08 Europe/Istanbul. Repo https://github.com/dorukakindev/whisper-browser; codex/book-reliability549/PR487. Başlangıçc29eaa0fcdb5d27e28d39128aec5dab39bdd11c2; ürün bitiş **70baed90e8c7c029b22c16249d00d7e716d105bc**.

## Kök ve davranış

`tools/voxcpm2/altyazi_oku.py`, tüm konuşma üretildikten sonra harici kitap_ortak.loudnorm_audio çağırıyordu. Kurulu kitap_ortak.run_text timeout=None varsayılanı kullanıyor, iki FFmpeg loudnorm çağrısı süre sınırı vermiyordu. Son parça sayısı tamamlanıp bitiş markerı gelmeden sınırsız postprocess bekleyebilirdi. Harici motor dosyası değiştirilmedi; repo içinde `dub_normalize.py` aynı EBU iki geçişli hedefleri(-20LUFS/-2TP/LRA11) uygular.

Her geçiş gerçek süreye göre30–1800sn sınırlı; TimeoutExpired/FFmpeg yok/hata/geçersiz ölçüm/kilitli hedefte üretilmiş özgün WAV korunur. Normalize dosyası özgünle aynı klasörde eşsiz ad taşır; süre/kanal/okunabilirWAV doğrulanmadan atomik replace olmaz. Dizin dışına veya alternatif dosyaya yönlendirme yok; geçiciler finally temizlenir. Normalizasyon isteğe bağlı iyileştirmedir, başarısız olması ses üretimini başarısız yapmaz; UI uyarısı özgün konuşmanın korunduğunu söyler. Disk/kill hatalarının bütün olasılıkları çözülmüş veya son61/61 şikâyetinin tamamı açıklanmış sayılmaz.

Verifier'ın gerçek lock içindeki işi, timeline yerleştirme, dosya yazımı ve normalizasyon `DUB_ACTIVITY` aşama olayı basar. Main yalnız sabit izinli stage değerlerini statusa çevirir; ham model metni/dosya yolu UI protokolüne taşınmaz. EN/TR sözlükleri var. Parça sayısı aynı kalırken hangi son aşamada çalışıldığı görülür; sahte yüzde/başarı eklenmez.

## Dosyalar ve doğrulama

- `tools/voxcpm2/dub_normalize.py`: bounded iki pass/validasyon/atomik replace/özgün fallback.
- `tools/voxcpm2/altyazi_oku.py`: repo helper kullanımı, gerçek aşama başlangıçları ve koruma uyarısı.
- `src/dub-service.js`: izinli aşama durumları/normalizasyon uyarısı; `src/renderer/ui-locale.js`: EN/TR.
- `tests/test_dub_normalize.py`: timeout/bozuk/kilitli çıktıda özgün bayt ve temp korunumu; nonfinite stats/missingFFmpeg; gerçekFFmpeg1sn Türkçe dosya yolu iki pass ve48000Hz/süre kanıtı.3test PASS.
- `tests/dub-service.test.js`: stage/warning gerçek parser sözleşmesi. İlişkili generator/dynamic/dedupe4dosya8PASS. Lifecycle4PASS ve resume3PASS; py_compile/syntax/diff geçti.
- `tests/electron-dub-runtime.smoke.js`: gerçek renderer/preload, kontrollü engineolayları; nativeWindows exit0, `.uiprev/dub-runtime/1792901321544-25292/active-normalization.png` incelendi. TRdark/ENlight125% mevcut düzen kontrolleri geçti. Bu GPU/model üretim testi değildir.

Yeni dependency/kurulum/şema yok; helper soundfile/subprocess zaten mevcut. Kullanıcının harici VoxCPM2 motoruna dokunulmadı. Kişiselstart.bat/CUDA/liveYouTube/uzakCI yok; fullsuite tekrarlanmadı. Bilinen fixed-sleep26>21 ve sporadik Review timeout açık. Sonraki doğrudan kullanım işi: PDF/asistan doğru görünür sayfa bağlamı ve kalite-plan seçimi; yedek bakımına dönme.
