# Rapor702 — İşaretli grupları tek işlemde yeniden üret

## Gereksinim ve davranış

Eski “Eksik parçaları tamamla” düğmesi forceGroups=[] gönderiyordu. Bu, dosyası hiç oluşmamış gruplar için doğru; ancak dosyası mevcut review grupları önbellekten tekrar geliyordu. Mevcut tek-grup yeniden üretme işlevi çalışıyordu; burada yeni kullanım geliştirmesi yapıldı, eski etiketin anlamı yanlış bug olarak sunulmadı.

Artık kalite raporunda review/failed varsa aynı düğme **İşaretli grupları yeniden üret · N** olur. Yalnız bu anahtarlar forceGroups ile gider; ready gruplar korunur. İşaretli yoksa eski eksik-tamamlama davranışı sürer. Önceki gerçek üretim ayarları korunur, tooltip bunu ve hazır önbelleği açıklar. EN/TR; mevcut CSS/tema/düğme düzeni, ek bağımlılık veya düğme yığını yok.

Main'deki eski video1grup sınırı, var olan kitap seçim taşımasıyla aynı5000grup/100000karakter sınıra alındı.12000karakter üzeri seçim mevcut JSONdosya yolu üzerinden geçer; Windows argv büyütülmez. forceAll video için hâlâ yasak. Backend güncel plan dışında anahtarı reddeder. Yeni IPC/ayar/şema yok.

## Kanıt

- Renderer: karışık ready/failed/review grubunda yalnız failed/review seçimi; hepsi ready→forceGroups=[]; eski üretim kalite profili korunur.
- Main:2video grubu doğru argv,4000seçim doğru JSONdosyası,5001reddi; mevcut yetki/iptal/regeneration sınırları PASS.
-3ilgili Node dosyası PASS; Python2regeneration testi PASS; syntax/diff PASS.
- Native Windows gerçek Electron/renderer/preload kontrollü olaylar PASS:review1+failed2seçildi,ready3dışlandı; tümü hazır→eksik-tamamla. TRdark800125% ve ENlight1000100% görüntü incelendi; düğmeler modal sınırlarında.
- Gerçek VoxCPM2/nano-vLLM CUDA sentetik referans15step: **1grup üretildi,1cache**; seçili1hash değişti, hazır2hash aynı. Wall36.141s. Terminal/artifact kabulü; exitcode yakalanmadı. Fast verification doğal kalite kanıtı değildir.

[Kanıt](RETRY702_2026-10-28/REPRODUCE.md). Ham ses/profil/anahtar committe yok; kişisel uygulama kapatılmadı.

## Kaynak ve sınırlar

Mevcut uygulamanın dub_regeneration/force-groups-file/seed/cache akışı tekrar kullanıldı. [OpenBMB VoxCPM core](https://github.com/OpenBMB/VoxCPM/blob/main/src/voxcpm/core.py) gerçek generate/retry_badcase/seed ve prompt cache ayrımı incelendi; upstream tekrar denemesi uygulamanın çok-grup cache seçimi değildir. Apache2proje; dış kod kopyalanmadı/yeni dependency yok. İlk yanlış eski core.py URL404; güncel src/voxcpm/core.py okundu.

UItesti motor fixture, GPU kabulü ayrıCLI üretimdir; tek UI düğmesiyle canlı GPU uçtanuca iddiası yok. CanlıYouTube/LLM/OOM/timeout/start.bat/install/DRM koşulmadı.11before-quit listener uyarısı açık; CI beklenmedi. P009 kısmi; tüm aşamaların tekrarını tamamlandı sayma.
