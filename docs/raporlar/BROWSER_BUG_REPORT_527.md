# Rapor527 — Ses, çeviri, altyazı ve taşınabilir proje güvenilirliği

Tarih: 2026-10-23. Depo: https://github.com/dorukakindev/whisper-browser
Dal: `codex/broad-audit527`. Başlangıç master: `478265f0906f14b9302f9b224645da57a618c3a4`.
Bitiş ürün kodu: `92ca81d9fb1e57ae5b3446c1373cc6005e102f0c`.

Kullanıcı 100 yeni hata ve canlı teslim istedi. **100 bağımsız hata doğrulanmadı; 16 somut kusur aşağıda kaydedildi ve düzeltildi.** Bunların hepsi yüksek önem taşımaz; iki Windows proje uyumluluğu kusuru düşük etkilidir. Test alt senaryoları ve aynı kökün farklı formatları ayrı bug sayılmadı. Bu bir hatasızlık veya tüm ürünün denetlenmesi garantisi değildir.

## Doğrulanan kusurlar

| No | Önem | Önceki davranış ve kök neden | Düzeltme ve kanıt |
|---|---|---|---|
| 527-01 | Yüksek | Çeviri cache boş flush'ında async gövde atamadan önce biter; finally'nin temizlediği flushPromise yeniden eski resolved Promise olur. Sonraki yeni çeviriler diske yazılmaz. | Gövde microtask'a alındı. Gerçek geçici diskte ilk/boş/ikinci/üçüncü flush ve yeni cache örneğinden geri okuma. |
| 527-02 | Yüksek | coveredCueIds içindeki tekil kimlikler çıktı zaman aralığına bakılmadan tamamlanmış sayılır. 0–1 sn çıktı 4–5 sn kaynağı da kapsadığını iddia edebilir. | Zamanları verilen çıktı kaynak cue'yu kapsamalı. Sonuç/dosya/görüntü aşamalarında eksik raporu; geçerli birleşik ve eski zamansız kimlik kaydı korunur. |
| 527-03 | Yüksek | Dublaj kalite verisi doğrulanır ama normalize edilmiş sonuç atılır; verification=review/unavailable veya review=true satırı ready kalabilir. Proje kaydı da bunu taşır. | Servis ve workspace normalize edilmiş grupları kullanır; kanıt alanları korunur, bilinmeyen verification review olur. Üretim IPC sonucu ve yeniden açma testi. Hızlı modun not_checked davranışı korunur. |
| 527-04 | Orta | İçe alınan proje satırlarında boş key, kontrol karakteri veya SRT zaman satırı kabul edilir. Boş key yeniden üretimde adreslenemez; yapısal metin yeni sahte cue yaratabilir. | Satır sınırında key/text/displayText doğrulaması. Normal çok satırlı Türkçe metin geçer; yapısal ve C0 metin reddedilir. |
| 527-05 | Yüksek | Zaman haritası negatif başlangıç ve küçük örtüşmelere izin verir. Boşluk toleransı 40 ms geriye sıçramayı da kabul eder. | Negatif/geri aralıklar reddedilir; boşluk sınırında 1 ms altı yazım gürültüsü sürekliliğe oturtulur. Geri adım/boşluk/yuvarlama ve monotonluk testleri. |
| 527-06 | Yüksek | timingMode=video projesinde sync kaybolduğunda syncInvalid bayrağı yoksa normal video dışa aktarımına dönüşür; konuşma hizası bozulur. | Register ve projectOpen ayardan geçersiz haritayı türetir. Kaydedilmiş false bayrağı bunu gizleyemez; video export reddedilir. |
| 527-07 | Yüksek | Export çocuğu error verdiğinde close olmadan Promise reddedilir, kilit ve partial temizlenir. Çocuk hâlâ yazarken ikinci iş başlayabilir; ikinci error dinleyicisizdir. | Error kaydedilir, sahiplik ve partial close'a kadar tutulur. Tekrarlı error, ikinci işi engelleme ve error sonrası code0 durumunda başarısız temizleme testi. |
| 527-08 | Orta | CR-only altyazıda tüm CR silinince satırlar birleşir, SRT/VTT/ASS/LRC boş veya bozuk okunur; ASS/asset çıktısında da CR korunmaz. | CRLF/CR önce LF'ye normalize edilir. Dört parser × üç satır sonu ve üç çıktı formatı × üç satır sonu testi. |
| 527-09 | Düşük | Windows araçlarıyla BOM eklenmiş project.json JSON.parse aşamasında açılamaz. | Yalnız baştaki UTF-8 BOM kaldırılır. Kaydet/BOM ekle/yeniden aç/varlık koruma testi. |
| 527-10 | Düşük | Büyük harf .DUBPROJECT uzantısı tanınmaz, ikinci .dubproject eklenir. | Uzantı karşılaştırması case-insensitive; Windows dosya adı testi. |
| 527-11 | Orta | Toplam satır sayısı yokken açık failed sayısı sıfırlanır ve çıktı complete gösterilir. | Açık başarısızlık kanıtı korunur, partial olur. failed=1/3/10 ve hatasız eski çıktı testi. |
| 527-12 | Orta | video_duration ffprobe sınırsız bekler; başarısız çıkışın sayısı ve NaN/Inf pozitif süre sanılabilir. | 30 sn son tarih, dönüş kodu ve sonlu pozitif süre denetimi; hata/timeout None. Türkçe boşluklu yol ve metadata tablosu. |
| 527-13 | Orta | fit_to_window >2 hızda tek atempo aşaması kullanır; FFmpeg bu aralıkta örnek atlayabilir. | Hız çarpımı korunarak her atempo en fazla2 olur. 2.5 için 2×1.25 komutunun gerçek fit yolunda seçildiği kontrollü WAV testi. Varsayılan 1–1.25 değişmez; öznel kalite ölçümü yapılmadı. |
| 527-14 | Orta | NaN/Inf zamanlama girdileri karşılaştırmaları aşarak atempo kararını bozabilir veya tahsis aşamasında geç çöker. | sr/window/max_speed sonluluğu işlemden önce denetlenir. Üç alan × üç sonlu olmayan değer; ffmpeg hiç çağrılmaz. |
| 527-15 | Orta | Doğrulama worker'ından gelen geçerli JSON null/list/sayı/text:null hata üretir veya yanlış türle speech_check'e gider. | Yanıt dict ve text string olmalı; bozuk protokol unavailable olur, mevcut ses adayı korunur. Sekiz bozuk yanıt ve geçerli yanıt testi. |
| 527-16 | Yüksek | SpeechVerifier'da yalnız stdout readline zaman aşımına bağlıdır. stdin drain tıkanırsa üretim son satırda sınırsız kalır. | 120 sn son tarih write/drain/read alışverişinin tümünü kapsar. Gerçek beklemeye girmeden kontrollü tıkalı drain ve daha kısa dış watchdog testi. |

## Kanıt ve kontroller

- Yeni Node regresyon dosyası `tests/report527-audit.test.js`: 10 davranış testi. Başlangıç HEAD'inin ürün kaynaklarının ignored tmp kopyasında aynı testlerin 10/10'u başarısız; düzeltilen kaynakta 10/10 geçti.
- Yeni Python `backend/test_audit527.py`: 5 yöntem geçti. Başlangıç kaynaklarında yeni tempo_filter bulunmadığından ilk import karşılaştırması çalışmadı; bu ürün hatası olarak sayılmadı. Yardımcıya bağımlı test hariç dört eski-yol testi ayrıca koşuldu ve eski davranışı başarısızlık/hatalarla gösterdi. Kalibrasyon yalnız ignored baseline test kopyasında yapıldı, üretim veya teslim test beklentileri gevşetilmedi.
- Hedefli Node paketi: 13 dosya / Node runner 25 test, sıfır başarısız. report527-audit, browser-subtitles, browser-subtitle-output, browser-subtitle-export, subtitle-output-contract, subtitle-export-validation, browser-translation-cache, browser-translation-integrity, dub-workspace, dub-workspace-ui, dub-sync-map, dub-generator-ui, dub-service. Son küçük kalite ve gap sıkılaştırmasından sonra etkilenen dört dosya tekrar geçti (runner16).
- Python: test_audit527(5), test_report491_audio(5), test_dub_timing(14), test_dub_quality(5), test_pipeline_524(4), test_pipeline_525(5), test_dub_generation_quality(16): toplam54 yöntem geçti.
- Windows gerçek ffmpeg/ffprobe ile `test_dub_export.DubExportTests.test_real_audio_video_and_dual_export` geçti. Sentetik video, ses ve arka plan katmanından audio/video/dual üretimi; süre, kare ve darbe hizası doğrulandı. Bunlar insan sesi dinleme veya GPU kalite kanıtı değildir.
- Ek geniş subtitle roundtrip taraması: 162 varyasyon;156 kabul ve6 kasıtlı yapısal cue metninin korumalı reddi. Yeni bağımsız bug çıkmadı; bu sayılar16 bulguya eklenmedi.
- Değişen JS/Python sözdizimi, main/preload/renderer node --check ve git diff --check geçti.
- Ham kişisel veri içermeyen geçici test çıktıları ignored tmp/audit527-baseline ve tmp/audit527-probes içinde; Git'e eklenmedi.

## Kapsam ve sınırlar

Cache/integrity, proje/export/sync/mix, altyazı parse/yazma, ses worker ve süreç sahipliği incelendi. Çeviri/auth/planner, indirme, referans ve live-ASR komşu kodları okundu; kanıtlanmamış şüpheler düzeltme sayılmadı. Uygulama testleri kontrollü fixture kullanır; gerçek YouTube, sağlayıcı, Whisper/VoxCPM2 GPU üretimi, referansla öznel dinleme, DRM ve kullanıcı oturumu koşulmadı. Gerçek Electron ekran görüntüsü veya start.bat açılışı bu turda yapılmadı; görünüm/HTML/CSS değişmedi. Jsdom UI sözleşmeleri geçti. install.bat/start.bat ve bağımlılıklar değişmedi; Windows süreçleri gizli, argümanlar dizi, Türkçe yollar ve dosya uzantıları hedefli doğrulandı.

Tam npm test tekrar edilmedi. CI açık kalır ve teslim onun bitmesine bağlanmaz; görülmeyen sonuç başarılı denmez. Yeni bağımlılık/model/kurulum/ayar şeması yok. Üretim motorunun varsayılan ses karakteri veya model parametreleri değiştirilmedi. İlk100 isteğinin kalan84 bağımsız kusuru doğrulanmış değildir.
