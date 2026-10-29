# Rapor 747 — Gerçek altyazı dönüşüm sırası ve doğru hata sonucu

## Bulgular ve düzeltmeler

1. **Yalnız altyazı indirirken VTT → SRT aşaması çalışmıyordu.** `skip_download=True`, varsayılan postprocessor aşamasını atlıyordu. R746 gerçek otomatik isteği başarısızdı; o rapor nedeni doğrulanmamış olarak bıraktı. Bu turdaki ilk tanı yalnız genel RuntimeError gösterdi; ortak hata metninden altyazı yokluğu çıkarımı yeterli değildi. Daha ayrıntılı güvenli metadata gerçek otomatik en altyazısının VTT dosyası olarak mevcut olduğunu gösterdi. `backend/media.py` dönüştürücüye `when=before_dl` ekler. Gerçek anonim YouTube isteği artık exit0;416byteSRT, otomatik klasörü. R746'nın bozuk sonucu doğrulayıp reddetmesi kaldırılmadı; eksik dönüşüm aşaması onarıldı.
2. **Özel altyazı hataları genel ağ/oturum hatasına düşüyordu.** `CaptionDownloadError`, üç sabit kod taşır: caption_unavailable, caption_conversion_failed, caption_invalid_result. Backend NDJSON yalnız bu güvenli kodları ekler; diğer ağ/işletim sistemi hatalarının mevcut sınıflandırması korunur. `src/caption-download-errors.js` kodları EN/TR sabit kullanıcı mesajına çevirir. URL, yol veya ham exception mesajı yeni metinlere katılmaz. `src/main.js` bunu yalnız subs süreci için kullanır.
3. **Kısmi sonuç ardından hatayla biten altyazı süreci başarı olabiliyordu.** Main artık subs için hem exit0 hem hata olmaması koşulunu arar. Önce subs sonra error ve exit0 da başarısızdır; yalnız subs ve exit1 de başarısızdır. Diğer indirme/probe davranışları bu paketle değiştirilmedi.

Bu üç kök, testteki dil/biçim varyantlarıyla daha fazla bug diye sayılmaz. Önceki raporların aynı dosya sahipliği düzeltmesi yeniden sayılmadı.

## Dosyalar ve test kapsamı

- `backend/media.py`: aşama kaydı, türlenmiş güvenli caption hataları ve NDJSON kodu.
- `src/caption-download-errors.js`: yalnız tanımlı kodlara ait yerelleştirme; bilinmeyen kodda mevcut sanitize yolu korunur.
- `src/main.js`: mesaj yerelleştirmesi, kısmi/başarısız subs reddi.
- `tests/test_media_caption_artifact.py`: eski8 davranışa ek olarak CLI hata kodları, HTTP429'un korunması ve gerçek yt-dlp işlem zinciri. Sonuç11PASS/0SKIP. İsteğe bağlı yt-dlp/FFmpeg yoksa yalnız ilgili entegrasyon testleri açıkça SKIP olur.
- `tests/electron-assistant-captions.smoke.js`: gerçek main/preload/renderer ile üç kod × iki dil; kısmi sonuç+hata+exit0/exit1 ve hatasız kısmi sonuç+exit1 reddi. Başarısız gerçek kart çeviri başlatmaz. Dış model/download motorları kontrollüdür.

[İşlem zinciri önce](evidence747/stage-before.txt): 11 testin biri gerçek dönüşüm aşaması atlandığı için hata. Doğrudan FFmpeg postprocessor testinin daha önce geçmesi, skip_download entegrasyonunu kanıtlamıyordu. Yeni fixture gerçek InfoExtractor → YoutubeDL → data URI VTT → before_dl → FFmpeg → SRT yolunu kullanır; video indirilmez ve dış ağa çıkmaz. Düzeltme sonrası11PASS.

[IPC önce](evidence747/ipc-before.txt): parent main kısmi sonuç+hata için ok=true verdi; yeni native assertion kırmızı. Son kod [native sonuç](evidence747/native-results.json) exit0;6yerelleştirme ve başarısız sonucu kabul etmeme geçti. İlk yeni native denemede test UiLocale.set() çağırıp main'e gerçek ayar bildirimi göndermediği için EN beklerken TR gördü. Ürün eşiği gevşetilmedi; test gerçek uiLocale change kontrolüne geçirildi ve geçti. Mevcut11 before-quit listener uyarısı açık.

Mevcut assistant-caption-actions10PASS; Pythoncompile, üçJS syntax ve diff PASS. Tam npm test/uzunCI beklenmedi.

## Gerçek site ve görsel kanıt

[İlk genel hata](evidence747/initial-general-error.json), [VTT tanısı](evidence747/conversion-diagnosis.json), [son otomatik başarı](evidence747/automatic-success.json). Kullanıcı çerezi/oturumu/API anahtarı yok; aynı herkese açık kısa video kullanıldı. Son istek2.047sn,exit0,416byteSRT; no video/audio download. R746 manuel yol kanıtı ayrı kalır. R747 başarısı tüm YouTube videoları veya hesaplar için genellenmez.

[TR açık tema hata kartı](evidence747/caption-unavailable-tr-light.png) gerçek Windows Electron'da açılıp incelendi.480CSS genişlik, yatay taşma yok, gönder düğmesi görünür; mevcut ortak tasarım kullanılır, yeni CSS veya yeniden tasarım iddiası yok. Mesaj kısa durum ve kart ayrıntısında mevcut bileşenlerle görünür. EN/TR metinleri gerçek IPC ile doğrulandı; EN hata kartı ayrıca görüntülenmedi.

## Kaynak ve sınırlar

[yt-dlp resmî CLI kodu](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/__init__.py) get_postprocessors(), FFmpegSubtitlesConvertor için before_dl kullanır. Aynı kurulu2026.08.27.231323 kodu ve process_info() akışı incelendi. Bu olgun mevcut API davranışı izlendi; dış kaynak dosyası kopyalanmadı, yeni bağımlılık/lisans yükü eklenmedi. yt-dlp kaynak lisansı Unlicense.

Yeni IPC kanalı/kalıcı JSON şeması/ayar yok; NDJSON error olayına isteğe bağlı güvenli code eklendi. start.bat, kişisel profil ve kaynak dosyaları korunur. Gerçek dublaj/Whisper/çeviri üretimi, GPU, insan dinleme, tetiklenmiş timeout/iptal ve tüm site kabulü bu pakette yok.90aktif hedef devam; müzik kapsam dışı. Tasarım becerileri bu tur tekrar yeni tasarım yapılmış gibi sayılmaz.
