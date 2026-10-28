# Rapor 726 — Dublajlı MP4 ses izleri ve gerçek zamanlama kabulü

## Doğrulanmış hata ve onarım

MP4 dışa aktarımı `title` alanını yazıyordu ancak FFmpeg bu adı MP4 ses izi başlığına taşımıyordu. Gerçek çıktıdaki iki iz de `SoundHandler` görünüyordu. Ayrıca uygulamanın ffprobe sorgusu ve ayrıştırıcısı `handler_name` alanını okumuyordu.

- `backend/dub_export.py`: dublaj ve özgün iz için MP4 `handler_name` eklenir; mevcut başlık, dil ve varsayılan iz sözleşmesi korunur.
- `src/main.js`: handler adı sorgulanır; `src/media-audio-tracks.js` başlığı öncelikli tutar, anlamlı handler adını yedek kullanır. Genel `SoundHandler` kullanıcı başlığı yapılmaz; ses-göreli indeks korunur.
- `tests/media-audio-tracks.test.js`: Türkçe etiket, başlık önceliği, genel handler ve indeks regresyonu.
- `tests/electron-dub-export-labels.smoke.js`: ayrı Windows Electron profili, gerçek dosya seçimi/preload/main/ffprobe üzerinden üretilmiş MP4 etiketleri.
- `tools/dub-export-acceptance.py`: yalnız kendi ürettiği ton ve renk işaretleriyle gerçek FFmpeg süre/senkron kabulü; model veya kişisel veri kullanmaz.

## Ölçülen kanıt

Seçili kaynak aralığı 2–8 saniye; iki AAC ses izi. Normal çıktı 6 saniye, doğrusal ve yumuşak yavaşlatılan çıktılar 8 saniye. Üç ses işaretinin iki izdeki en büyük başlangıç farkı 70 ms; video renk işareti farkı en çok 13 ms. Kabul sınırları ses 200 ms, video 120 ms, süre 120 ms olarak koşumdan önce belirlenmiştir. Bu ölçümler uzun video veya insan sesi kalite değerlendirmesi değildir.

İlk gerçek MP4 kabulü ad kontrolünde kırmızıydı; onarım sonrası üç durum geçti. Native testin ilk koşumu Windows sandbox izin hatasıyla engellendi. İkinci koşumda test hazırlığı yanlış yetki yolunu kullanıyordu; ürün yetkisi gevşetilmedi, gerçek `selectVideo` dosya seçimi kullanıldı. Son native koşum exit 0: `Türkçe dublaj`, `Original`. Mevcut 11 before-quit listener uyarısı devam ediyor; eşik değiştirilmedi.

Node iki dosya / 6 test; Python report493 / 7 test; JS syntax, Python derleme ve diff kontrolü geçti. Ana uygulama profili ve açık penceresi kullanılmadı. Bu paket düzen veya CSS değiştirmediği için yeni görsel tasarım başarısı iddiası yok. Önceki R722–R724 tasarım kanıtları tarihsel kayıttır.

## Tekrar çalıştırma

```powershell
node --test --test-isolation=none tests/media-audio-tracks.test.js tests/dub-workspace.test.js
& 'D:\Whisper Local\backend\venv\Scripts\python.exe' -m unittest discover -s tests -p test_report493_audio.py
& 'D:\Whisper Local\backend\venv\Scripts\python.exe' tools/dub-export-acceptance.py --ffmpeg C:/ffmpeg/bin/ffmpeg.exe --output-dir .uiprev/export-acceptance-new
$env:EXPORT_ACCEPTANCE_VIDEO=(Resolve-Path .uiprev/export-acceptance-new/smooth/export.mp4).Path
# Electron testini kişisel uygulama yerine ayrı test profiliyle çalıştırır.
& 'D:\Whisper Local\node_modules\electron\dist\electron.exe' tests/electron-dub-export-labels.smoke.js
```

## Kaynak ve sınırlar

FFmpeg'in [MOV/MP4 kaynak kodu](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/movenc.c) ve [muxer belgeleri](https://github.com/FFmpeg/FFmpeg/blob/master/doc/muxers.texi) incelendi. Dışarıdan kod kopyalanmadı; bağımlılık, şema, kurulum ve start.bat değişmedi. GPU, gerçek YouTube, DRM, uzun video, fiziksel işitme, M4B, tüm test paketi ve CI bu kabulde doğrulanmadı. CI kapatılmadı ve sonucu beklenmiyor. P060 yalnız bu kısa çift izli MP4 kapsamıyla kısmi kanıt aldı; 90 hedef tamamlanmış sayılmadı.
