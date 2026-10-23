# Rapor531 — Dublajın anlatım dinamiğini ve niyetini koruma

2026-10-24. Kullanıcı YouTube Türkçe dublajının doğallığına odaklanılmasını ve araştırma/uygulama istedi.
Başlangıç HEAD `73682baa0782551d632ab5e82d1ebe6ffed79165`, önceki ürün `7f4aebf43aa74bd8f2aabaabc60bf3c6cb222c03`.
Bitiş ürün `e1faeeaf3e06bc8f15e49ccd03b6687e0ab59c1b`.
Dal `codex/deep-audio528`, açık [PR481](https://github.com/dorukakindev/whisper-browser/pull/481).
[Araştırma, kaynaklar ve GPU sonuçları](DUBLAJ_DOGALLIGI_ARASTIRMA_2026-10-24.md).

## Doğrulanan3 kök

### 531-01 — Son normalizasyon ifade dinamiğini değiştiriyor

`dub_finalize.normalize_audio` iki geçişli loudnorm'a `linear=true`, sabitLRA11 ve true-peak hedefi veriyordu. FFmpeg, kaynakLRA hedefi aşarsa veya kazanç peak sınırına sığmazsa sessizce dinamik moda döner. Dolayısıyla `preserve_dynamics=True` ile korunan ifade bile nihai WAV'da değişebiliyordu.

Gerçek FFmpeg ile30sn sentetik kayıtta6 adet5sn bölüm kullanıldı: genlikler `.03,.03,.12,.12,.03,.03`. Önce bölümlerin uygulanan kazancı yaklaşık12.73,12.74,6.15,3.78,6.28,7.20dB idi; bölümler arası kazanç farkı8.951837dB. Aynı test düzeltmeden önce kırmızıydı. Artık R128 input_i/input_tp ölçülür, tek kazanç `min(-20-input_i,-2-input_tp)` uygulanır. Yeni kazançlar yaklaşık6.919867–6.920000dB, aralık0.000133dB; örnek hızı ve frame sayısı aynı. Kaynak performans sıkıştırılmaz. Peak payı yetmiyorsa −20LUFS'a ulaşamama, dinamiği ezmeye tercih edilir. Hata/timeout/Windows kilidinde eski WAV'ı koruyan atomik sahiplik devam eder.

### 531-02 — Boş kaynak anlatımı haritası Hi-Fi bağlamını gereksiz kapatıyor

`uret` dosyanın varlığını otomatik yönlendirme var sayıyordu. `delivery_rows` yeterli güvenilir veri bulamadığında tüm satırlarıNone bıraksa da Hi-Fi prompt kurulmazdı. Model aynı ses referansını kullansa bile dökümlü devam bağlamını kaybediyordu. Kontrollü üretim testinde beklenen prompt'lar yerine `[None,None]` görülerek doğrulandı.

Artık en az bir geçerli delivery satırı varsa otomatik yönlendirme etkin. Hiçbiri yoksa orijinal Hi-Fi prompt tüm oturumda korunur; TR/EN uyarı eklenir. Kısmi haritada oturum içinde prompt modunun değişmemesi için önceki referans-only yaklaşımı sürer. Kaynak duygusunun başarıyla aktarıldığı iddia edilmez.

### 531-03 — Metin editörü açık vurguyu silebiliyor/uydurabiliyor

`safeShortening` soru işaretini korurken ünlemi korumuyordu. `Harika! Bunu başardık!` → `Harika. Başardık.` kabul ediliyordu. Reddetmesi beklenen regresyon düzenleme öncesi kırmızıydı. Şimdi doğal düzenleme ve açık süre kısaltmada ünlem sayısı korunur; yeni ünlem eklenmesi de reddedilir. Yalnız prompt'a güvenilmez; kod kapısı uygulanır. Bu, duyguyu otomatik ölçmek veya bütün semantiği kanıtlamak değildir.

## İki tamamlayıcı geliştirme

- Dublaj editörü nefes/noktalama niyetini korumaya, hedef metin cümle ortasındaki bir parçaysa komşudan söz ekleyerek tamamlamamaya ve sahte oyunculuk etiketi koymamaya yönlendirildi. Gerçek sağlayıcı çıktısı bu tur ölçülmedi; kontrollü sözleşme ve mevcut anlam kapıları test edildi. Editor identity v5 ile eski düzenlenmiş önbellek ayrılır.
- Türkçe SRT dublajı `--verify-language tr` taşır. Worker NDJSON üzerinden doğrulanmış dil kodunu ASR'ye verir; beklenen metin initial_prompt yapılmaz. GenelCLI `auto`, önceki compare araçları da otomatik dil desteğini korur. Dili yanlış tanımış gerçek kullanıcı klibi bu tur bulunmadı; bu önleyici bir iyileştirmedir.

Yeni ses cache kimliği `dublaj-ses-v17-performance-preservation`; dil seçimi anahtara dahildir. Eski dosyalar silinmez, yeni üretim eski davranışı cache'den geçerli saymaz. İlk üretim daha fazla sentez gerektirebilir. Model/bağımlılık/kurulum/kalıcı ayar değişmedi.

## Kontroller

9 hedefli Python dosyasında67 yöntem geçti;5.36sn. Gerçek FFmpeg dinamik koruma testi dahil:

```powershell
$env:PATH='D:\Whisper Local\backend\bin;'+$env:PATH
@'
import sys,unittest
sys.path[:0]=['backend','tests']
names=['test_audio531','test_audio528','test_dub_verify','test_dub_generation_quality',
       'test_dub_recovery','test_dub_flowing_groups','test_dub_finish',
       'test_report491_audio','test_audit527']
r=unittest.TextTestRunner().run(unittest.TestLoader().loadTestsFromNames(names))
raise SystemExit(not r.wasSuccessful())
'@ | & 'D:\Whisper Local\backend\venv\Scripts\python.exe' -
```

13 kısa Node dosyası geçti: dub-service, dub-text-guard, dub-editor-request, report491-audio, report494-regressions, report495-regressions, report497-regressions, report524-negative-instructions, report528-audit, ui-locale, ui-locale-dedupe, ui-locale-dynamic, ui-locale-userdata. Her biri `node tests/<ad>.test.js` ile çalıştırılabilir. Değişen Python'lar py_compile, değişenJS ve main/preload/renderer node --check, diff kontrolü geçti.

Gerçek GPU: RTX4070SUPER/CUDA ile önbellekteki VoxCPM2 kullanılarak yeni sentetik referans ve4 Türkçe örnek üretildi.4/4 ham akustik puan0;4/4 sözcük denetimi geçti. Aynı4 ses yeni Türkçe ASR yolundan da4/4 geçti. Kişisel ses/profil kullanılmadı. Mod/süre/ayar tablosu araştırma notunda; ASR puanı doğallık veya kimlik benzerliği değildir. Kör dinleme sonucu yoktur. Üretim betiğinin ilk sample_rate alanı hatası, mevcut runtime fallback kalıbıyla giderildi ve deneme tekrar çalıştı; ürün bugı sayılmadı.

## Windows, kapsam ve teslim

Çalışma ana Windows kopyaya dokunmayan `tmp/audit470` checkout'unda. Master `fb86bb3264cecc6acf3d6806b28780468e01072c`; üç kullanıcı belge değişikliği/untracked dosyaları korunur. Gerçek Türkçe WAV yolları, CPU ASR, kurulu GPU ve FFmpeg sınandı. `start.bat`/`install.bat` değişmedi ve gerçek normal uygulama açılışı, canlı sağlayıcı/YouTube/DRM, kişisel referans, saatler süren üretim denenmedi. Görsel yerleşim değişmedi; yalnız mevcut warning alanında yerelleştirilmiş bir metin var, yeni görsel denetim yapılmadı. Tam npm test tekrarlanmadı.

Önceki HEAD73682baa için CI40032299826 son okumada in_progress/conclusionnull idi; sonucu beklenmedi veya yeşil denmedi. Bu tur kod/belge ayrı commit ve normal push yapılır, PR481 güncellenir; master'a merge yapılmaz. Yeni CI açık kalır. Araştırmadan kod kopyalanmadı; yeni lisans/bağımlılık eklenmedi. Ses örnekleri ve ham loglar ignoredtmp'de, Git'e dahil değil.
