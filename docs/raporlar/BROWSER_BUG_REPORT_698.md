# Rapor 698 — Spotify analizinde sürüm ve önizleme kaynağı

Başlangıç master `b3f400751d6793813c7762673427c1ffe2bc3bc1`; ürün `550329224eff6849552200823ee9f4f528e1a03d`; dal `codex/music-version698`.

## Somut eksik ve değişiklik
Spotify içe aktarımı YouTube başlığını ve süresini zaten kaydediyordu. Ancak `music-remote-source` → `music-analysis-service.remember` → renderer zinciri bu alanları aktarmadığından analiz ekranı yalnız genel “incelenmiş YouTube sürümü” yazıyordu. Kullanıcı stüdyo/canlı/uzatılmış kaydı ayırt edemiyordu.

- `music-source-version.js` canonical YouTube video URL'si, başlık ve iki kaydın sürelerini açık alan listesiyle normalize eder. Signed googlevideo URL'si, yabancı origin, query ile taşınan token ve geçersiz süreler provenance sayılmaz.
- Hem yeni hazırlanan ses hem mevcut remote cache, güncel Spotify satırının sürüm bilgisini döndürür. Yalnız metadata değişikliği yeni indirme istemez; R691'in rematch cache kimliği korunur.
- Analiz kaynak kartı eşleşen YouTube başlığını, Spotify/YouTube sürelerini ve eşleşen videoyu açma düğmesini gösterir. Mevcut ses oynatıcısı gerçek hazırlanmış kesiti dinletir. İki süre farkı `max(10sn, Spotify süresinin%15'i)` üzerinde ise canlı/remiks/alternatif kayıt kontrolü önerilir; yanlış eşleşme olduğu kesin ilan edilmez ve kullanıcı analizi engellenmez.
- Asistanın `MusicAnalysisUI.read()` bağlamı da bu normalize sürümü görür. Yerel dosya yolu veya signed stream URL'si eklenmez. Spotify sesi indirildiği iddia edilmez; analiz YouTube'dan hazırlanmış en fazla90s kesittir.

## Kanıt
- 6 ilgili Node dosyasında17 kontrol PASS: kaynak whitelist, service projection, cache metadata güncellemesi, rematch/red, kalıcı sonuçlar, asistan typed batch ve Spotify import; ayrıca i18n-coverage PASS. Syntax/diff PASS.
- Gerçek Windows `electron-music679.smoke.js`: üretim renderer/preload/service ve gerçek FFmpeg/DSP; yalnız Spotify/Deezer sağlayıcıları kontrollü. Spotify3:40/YouTube8:00 farkı ve gerçek5s sentetik decode ayrı gösterildi. Kesit gerçekten oynadı. Video düğmesinin canonical YouTube URL'si gönderdiği main handler'da yakalandı; kullanıcının harici tarayıcısı açılmadı.
- Kayıtlı ölçüm/tag/geçmiş geri yüklemesi, toplu analiz hata sonrası devam/retry/stop, grafik karşılaştırması ve diğer mevcut native kabul adımları geçti. EN açık ve TR koyu%125 dar görüntüleri incelendi, sürüm kartında yatay taşma yok. Asistan bağlamında doğru sürüm URL'si assert edildi.
- Kanıt dizini `MUSIC698_2026-10-28`; WAV/profil/signedURL Git'e eklenmedi. Gerçek müzikal benzerlik/CLAP kalitesi veya canlı katalog erişimi bu tur doğrulanmadı.

## Açık kaynak ve kapsam
[yt-dlp güncel YouTube çıkarıcısı](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube/_video.py) ve [Unlicense](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE) incelendi: kalıcı video kimliği/title/duration ile geçici stream adresi ayrı tutulur. Projenin mevcut yt-dlp eşleştirme ve90s FFmpeg yolu korundu; yeni paket veya harici kod kopyası yok.

P082 uygulandı/kontrollü native kabul edildi. P083 kullanıcıdan yeniden eşleşme seçme hâlâ ayrı; R691cache onarımını yeniden yeni hata saymadık. Öneri sıralamasının insan tercihi ve canlı Spotify sürüm doğruluğu tamamlanmış sayılmaz. 11before-quit uyarısı açık. Tam CI beklenmedi, temiz start.bat/kurulum/GPU yapılmadı; launcher/CUDA/şema değişmedi. Geri uyum: eski kayıtlarda başlık/süre eksikse boş alan gösterilmez, canonical video bağlantısı çalışır; yerel/Deezer kaynaklarında Spotify kartı gizlidir.
