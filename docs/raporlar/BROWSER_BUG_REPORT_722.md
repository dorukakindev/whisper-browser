# Rapor 722 — Ortak temada Electron metin stüdyosu

## Sorun ve sonuç
Kullanıcının ekran görüntüsündeki metin stüdyosu ayrı Tkinter penceresiydi. Platform çerçeveleri, sıkışık iki dilli etiketler ve uygulamadan ayrılan kontroller ortak tasarımı bozmaktaydı. Varsayılan girişler artık Electron içindeki **Metne ses ver** ekranını açar. Eski Tk modülü yalnız doğrudan Python çağıranlar için geriye dönük kalır; onun tasarımı yenilendi diye sunulmaz.

Geniş metin alanı, anlatıcı/yerel WAV seçimi ve dinleme, düzenlenebilir referans dökümü, dengeli/anlatım/hızlı hazır ayarlar, motor/klonlama/kalite/paralellik/blok boyutu, CFG/çeşitlilik/durak/tohum ve son işlem seçenekleri tek yüzeydedir. İnce ayarlar açılır. Kısa örnek, Durdur, ilerleme, günlük, sonuç dinleme/dosya/klasör açma aynı yerde bulunur. Etiketler mevcut EN/TR dilini izler. Koyu/açık tema ve dar ekran ortak token kullanır.

## Uygulama ve veri sözleşmesi
- `src/text-voice-studio.js`: gönderici doğrulanmış `dub:textVoice` kanalı; yerel dosya seçimi yalnız native picker ile, renderer'a dosya yolu yerine göndericiye bağlı seçim kimliği. Sınırlandırılmış TXT/UTF-8/UTF-16/cp1254 okuma, alan doğrulama ve dondurulmuş iş ayarları.
- `src/dub-service.js`: metin işi ortak sahiplik, GPU çakışma, sıcak motor bırakma, süreç ağacı iptali ve günlük/özet mekanizmasını kullanır. Metin çıktısı altyazı dublajı olarak videoya otomatik bağlanmaz. Hatalı/iptal edilen benzersiz WAV ve birleştirme/normalizasyon geçicileri temizlenir; önceki tamamlanan çıktı korunur.
- `tools/voxcpm2/text_studio_job.py`: mevcut `text_studio.command` komut kurucusuna başsız taşıma; kurulu nano-vLLM/VoxCPM2 veya PyTorch okuyucu korunur, dış motor kaynakları değiştirilmez.
- `src/preload.js`, renderer JS/CSS, index: aynı uygulama modalı. Ses başına döküm taslağı, yeniden açmada metin korunumu, yeni işte ayar kilidi; ilk açılıştaki boş taslağın kayıtlı dökümü ezmesi geliştirme sırasında native assert ile yakalanıp düzeltildi.
- `src/main.js`, `ses-studyosu.bat`: BAT normal `start.bat` üzerinden çalışır; açılış bayrağı ve ikinci uygulama örneği mesajı stüdyoyu açar. `start.bat`/CUDA yolu değişmedi.
- Eski Tk modülünde de ses değiştirirken taslak koruma ve yenileme koruması; bu ayrı uyumluluk yolu 2 Python kontrolüyle doğrulandı.

Girdi/istek/döküm/günlük: Downloads/Sesler/Girdi/Metin/<iş-kimliği>; sonuç WAV: Downloads/Sesler/Çıktı. Özgün referans TXT/WAV değiştirilmez. Mevcut `text-studio-settings.json` version2 ayarları kullanılır; yeni paket bağımlılığı yok. Başarılı motorun ürettiği manifest/HTML dosyaları korunur. Parça önbelleğinin temizlenmesi bu paketin amacı değildir.

## Hedefli doğrulama
- `node --test --test-isolation=none tests/text-voice-studio.test.js tests/dub-service-warm-start.test.js tests/voice-reference.test.js tests/voice-reference-ui.test.js tests/ipc-parity.test.js`: 6 Node alt test PASS. Yetki, sahte seçim kimliği reddi, duplicate/busy, kaynak döküm değişmezliği, başarı ve iptal temizliği, Tk açılmaması, eski referans ve sıcak motor regresyonları.
- Backend venv `python -m unittest discover -s tests -p test_studio_reference_drafts.py`: 2 PASS.
- Değişen JS `node --check`, Python `py_compile` ve `git diff --check`: PASS.
- Mevcut `test:electron-bridge` komutunun Electron scripti: gerçek Windows köprü/TextTrack/EME/shadow/iframe regresyonu PASS.
- `tests/electron-text-voice.smoke.js --reference <sentetik WAV> --transcript <sentetik TXT> --engine <kurulu VoxCPM2> --real-generation`: gerçek üretim UI → preload → IPC → Python → nano-vLLM/VoxCPM2 GPU → geçerli WAV ve yüklenen ses metadatası PASS. İkinci, 10 parçalı gerçek işte sentez başlangıcı sonrası Durdur → cancelled PASS; önceki tamamlanan WAV varlığını korudu.
- Varsayılan referans dökümü, yerel seçim, refresh sonrası taslak, eski 17 adım/400 karakter ayarı, tekrar açmada metin, başlangıç bayrağı native PASS.
- 1360×1000 TR koyu; 1000×950 fiziksel / %125 /800 CSS genişlik EN açık: yatay taşma yok, ana eylem44.4 CSS px. Gerçek PNG'ler incelendi; ilk yerleşimde toolbar/button genişliği, merkezleme ve motor select kesilmesi düzeltildi.

Kanıt: [sentetik ekranlar ve kısa sonuç](evidence/R722/acceptance.json), [koyu ekran](evidence/R722/studio-tr-dark.png), [tamamlanan üretim](evidence/R722/studio-complete-tr.png), [durdurma](evidence/R722/studio-stopped-tr.png), [dar/açık ayarlar](evidence/R722/studio-en-light-settings-125.png). Bunlar kullanıcı profili değil, sentetik test profilidir.

## Tasarım incelemesi (full; yalnız bu stüdyo)
| Alan | Önce | Sonra / kanıt |
|---|---|---|
| Tipografi | Tek ekranda TR/EN tekrarları, küçük platform etiketleri | Tek dil,28px başlık,17px metin, okunabilir hiyerarşi; native PNG |
| Yüzey/renk | Ayrı Tk çerçeveleri | Ortak grafit/amber ve açık tema token; native iki tema |
| Yerleşim | Sıkışık kontroller ve büyük günlük | Geniş metin, ayrı ayar sütunu, açılır döküm/günlük/ince ayarlar; dar ekranda kaydırmalı tek sütun |
| Etkileşim/ikon | Platform düğmeleri | Ortak düğme/focus/40px hedef, sabit alt üretim çubuğu; klavye Ctrl+Enter bağı |
| Hareket/performans | Farklı pencere yaşam döngüsü | Mevcut ortak modal açılış ve140ms renk geçişi; reduced-motion renk geçişini kapatır. Yavaşlatılmış hareket/ekran okuyucu testi yapılmadı |

Ayrı Tk penceresini yalnız boyamak reddedildi: ortak tema/ölçeklemeyi çözmüyor. Yeni UI kütüphanesi reddedildi: mevcut Electron/dialog ve tasarım tokenları yeterli. Dekoratif animasyon/başka vurgu rengi eklenmedi: ses ve üretim durumunu gölgelememeli.

## Kaynak ve sınırlar
Mevcut uygulama `dialog.media-surface`/`ui-motion` desenleri ve Python komut kurucusu yeniden kullanıldı. MDN [dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) ve Electron [single-instance](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata) birincil belgeleri kontrol edildi; dış repo kodu kopyalanmadı, yeni lisans/bağımlılık eklenmedi.

İlk sandbox içi Electron denemesi Windows ağ dizin erişiminde çöktü; aynı kontrollü test normal Windows yetkisinde başarılı oldu. Testte harici ağ kapalıydı; reklam filtre indirme uyarısı beklenen izolasyon sonucu. Mevcut 11 before-quit listener uyarısı sürüyor, eşik gevşetilmedi. Tam npm test/uzun CI, gerçek hesap/YouTube/DRM, ekran okuyucu, gerçek dosya seçiciyle fiziksel tıklama, BAT'ın tam etkileşimli DRM onarım dalı, PyTorch motorunda yeni ses üretimi ve insan kulağıyla kalite tercihi bu pakette doğrulanmadı. Native picker testte kontrollü seçimi döndürdü. Sesin insan gibi olduğuna dair iddia yok.

P035/P092/P094 kısmi ilerleme;90 hedefin tamamı bitmedi. Müzik kapsamı eklenmedi.
