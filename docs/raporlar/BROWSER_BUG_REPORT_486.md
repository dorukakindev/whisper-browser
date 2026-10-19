# Rapor 486 — Dublaj zaman çizelgesi, karıştırıcı ve taşınabilir proje

Tarih: 2026-10-19. Kullanıcı önceki fikir listesinden 1,7,8 numaralı işleri seçti.
Repo: https://github.com/dorukakindev/whisper-browser
Dal: codex/dub-workspace486. PR: https://github.com/dorukakindev/whisper-browser/pull/458
Başlangıç HEAD: c7add4680a3998233205cad18189f8182232812a.
Başlangıç master: 957bbfe91edee709accb24624e9e945e7a7a2969.
Bitiş ürün kodu: 9a60c4c2c383d8f14438c2f2b28ddd887dc3dfeb.
PR457 henüz master'a alınmadığından onun yetkili ses geliştirmeleri korunarak ilerlenmiştir;
PR458 bu önceki commit'leri de içerir. Ana Windows checkout değiştirilmedi, merge yapılmadı.

## Özellikler

1. SRT→Ses içindeki Dublaj zaman çizelgesi ve proje bölümü; kaynak zamanı, gerçek
   söylenen metin, durum ve esneme katsayılı cümle blokları. Blok seçimi videoda
   ilgili noktaya gider; cümle dinleme yalnız o ses aralığını çalar. Kontrol gerekenler
   süzgeci, klavye düğmeleri ve yeniden üretim seçicisine aktarım bulunur.
2. Konuşma / birlikte ayrılmış müzik-ortam / ayrı müzik / ayrı ortam kanalları.
   Otomatik ayırıcı hâlâ birleşik instrumental çıkarır; iki ayrı kanalmış gibi
   gösterilmez. Kullanıcı ayrı kanallarını ekleyebilir; ek dosyanın 0 saniyesi
   seçilen kaynak aralığının başlangıcıdır. Ses pencereleri boyunca80ms atak,
   350ms bırakma ile arka plan kısılır. Seviye/kanallar Sesi kullan'a ve projeye
   taşınır. Karışım önizlemesi ve oynatıcı/browser şeridi aynı tercihleri kullanır.
3. .dubproject bir klasördür: project.json, voice.wav, varsa background.wav,
   ayrı kanallar, kaynak SRT ve gerçek söylenen grup metinleriyle UTF-8 BOM dub.srt.
   İstenirse yerel video da kopyalanır. Motor cache yolları ve referans/anahtarlar
   gömülmez. project.json seçilince ses/zamanlama/metin/karışım geri gelir;
   kopyalanmış video oynatıcıda açılabilir ve sonraki export onu kullanır.
4. WAV karışımı, dublajlı MP4 ve orijinal+Türkçe ses parçalı MP4. Yerel kaynak
   seçimi gerekir; kayıtlı proje videosu varsa tekrar seçilmez. Aralıklı işte
   yalnız seçili bölüm çıkarılır. Video PTS'leri smooth zaman haritasını aynen
   uygular. Orijinal/arka plan sesinde perdeyi koruyan rubberband tempo komutları
   aynı haritanın küçük aralıklarına göre verilir. Ses süresi haritayla doğrulanır.
   İki sesli çıktıda Türkçe varsayılan; orijinal kanal aynı video zamanına uzatılır.

## İncelemede doğrulanan sınırlar ve onarımlar

| Bulgu | Neden / çözüm | Kanıt |
|---|---|---|
| Yeni karışım başlangıcında mute geri alma yarışı | İlk setMix tick'i henüz sample yokken rangeMute başlatıyordu. Başlangıçta tick ertelendi. | Mevcut geç gelen play/race regresyonları geçti. |
| Yeni cümle zamanları kayboluyordu | Önceki quality çıktısı durum/key içeriyor, kaynak ve ses koordinatları içermiyordu. Timeline üretiminden sonra gerçek koordinatlar/metin sidecar'a eklendi. | Python syntax; renderer ve model zaman doğrulaması. |
| Üretim biterken başka videoya bağlanmış inceleme | Panel o anki sekmeyi seçiyordu. İşin özgün context'i saklanır; medya/generation uyuşmazsa seek yapılmaz. Açık Sesi kullan onayı yeni context'i bağlar. | Player eski çıktı/generation korumaları ve hedefli UI testleri. |
| Karışım önizlemesinde iki ses | Kaynak video çalmayı sürdürebilirdi. Eşleşen kaynak önizlemede duraklatılır; eski dublaj katmanı kaldırılır. | Player/UI regresyonu; gerçek YouTube ayrıca denenmedi. |
| Çok kanallı offline tempo komutlarının karışması | Aynı rubberband instance adı diğer kanalı etkileyebilirdi. Her kanala ayrı ad/komut dosyası verildi. | Çok kanallı gerçek FFmpeg WAV/video/dual denemesi geçti. |
| FFmpeg script seçeneği sürüm farkı | Yerel FFmpeg eski filter_complex_script seçeneğini kaldırmış. /filter_complex kullanılır; yalnız desteklenmeyen seçenek hatasında legacy biçime dönülür. | Yerel gerçek FFmpeg entegrasyonu. |
| Aktarımda dosya ezme / patika kaçışı | Registry dışı çıktı kabul edilmez; dosyalar yetkilendirilir; proje varlıkları yalnız aynı klasörde basit adlarla çözümlenir, link/kaçış reddedilir. Önceki çıktının üstüne yazılmaz. | Yetkisiz IPC, ../, eksik dosya, bozuk zaman, taşınabilir kopya testleri. |
| Durdurma/kapanışta yetim export | Tek işlem kilidi, sender yaşamı, process-tree sonlandırma ve yalnız işe ait temp/partial temizliği. Kapanış temizliğin tamamlanmasını bekler. | Kontrollü süreç regresyonu: başka sender reddi, ilgili süreci sonlandırma, partial silme ve ilgisiz dosyayı koruma geçti. |
| Mevcut player testi milisaniyeye bağlıydı | Gerçek Date.now bazen20 yerine20.001 veriyordu. Test saati sabitlendi, eşik gevşetilmedi. | Player testinin ses/seek ve ek kanal doğrulamaları geçti. |

## Kanıt ve testler

- Node: dub-workspace, dub-workspace-ui, dub-service, dub-generator-ui,
  browser-dub-audio, player-dub-ui, dub-sync-map geçti.
- settings-ui-persist-roundtrip5, ui-locale14 assertion, ui-locale-dedupe5,
  coverage-map3, package-integrity9 geçti. Eşik/whitelist gevşetilmedi.
- backend/test_dub_export.py2: gerçek kısa sentetik medya; WAV stereo48kHz,
  MP4 bir/iki ses kanalı,75/75 kaynak kare,10/37/60'ıncı kare PTS'lerinin gerçek
  smooth haritaya65ms içinde hizası. Kaynak1.4sn civarındaki ses darbesi de
  haritanın beklenen iç noktasına150ms içinde geldi; yalnız padded süreye bakılmadı.
- tests/test_dub_generation_quality.py3 geçti; değişen Python ve JS syntax geçti.
- Windows npm run test:electron-bridge geçti; izole test profili kullanıldı.
- Yerelde tam npm test tekrar edilmedi; Windows CI sonucu son devir notuna eklenecek.
- TR/EN × açık/koyu ×1400/720:8 sentetik yüzey,0 kontrast ihlali ve script error
  kaydı yok. Güvenli örnek ekranlar docs/images/dub-workspace486*.png.
  Screenshot/fixture dışındaki kullanıcı sesleri/loglar Git'e eklenmedi.

## Kullanım ve sınırlamalar

SRT→Ses panelinde üretimden sonra yeni bölüme kaydırın. Bloktan cümleyi seçip
videoya gidin/dinleyin; karıştırıcıyı açıp seviyeleri ayarlayın; Sesi kullan ile
videoya bağlayın. Proje kaydına gerekirse video ekleyin. Yeniden açmak için
proje klasöründeki project.json seçilir; dosyalar beraber taşınmalıdır.

Yeni paket bağımlılığı/kurulum veya küresel ayar göçü yok. Proje şeması yeni ve
version1'dir. Kaydedilmiş ham ses kaydı yeniden eğitim/model ağırlığı içermez;
yeniden üretim için mevcut VoxCPM2 kurulumu ve referans ayarı gerekir. Metinler
etkin SRT'de tutulur; kaydedilmiş bir proje eski yürütülebilir retry isteğini açmaz.

Eski çıktıda cümle koordinatları yoksa açıkça bildirilir; yeni üretim gerekir.
Bağımsız müzik/ortam ayıran yeni model bu turda eklenmedi. Otomatik birleşik
kanalda eski konuşma sızıntısı kalabilir. Kısma gerçek waveform VAD yerine
konuşma grup pencerelerini kullanır; pencere içindeki duraklarda da kısık kalır.
Video kaynağının aynı içerik olduğu otomatik tanınmaz; doğru yerel dosyayı
seçmek gerekir. Export H264/AAC'tir; video yeniden kodlanır. Uzun video export
hızı/disk kullanımı, gerçek YouTube/DRM, canlı sağlayıcı, GPU modeli ve normal
start.bat yeniden açılışı bu turda test edilmedi. Yavaşlatılmış arka plan/orijinal
ses export'u rubberband içeren FFmpeg ister. Önizleme örneği yalnız WAV olarak
export edilebilir; tam video diye dışa aktarılmaz. Ranged export tüm40dk videoya
10dk dublajı gömmek yerine seçilen10dk bölümü çıkarır; arayüz bunu açıklar.
