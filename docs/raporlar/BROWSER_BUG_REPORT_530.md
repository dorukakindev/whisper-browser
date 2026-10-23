# Rapor530 — Ses adayını doğru değerlendirme ve başarısız akıcı grupları onarma

Tarih: 2026-10-24. Kullanıcı daha iyi ses geliştirmelerine devam istedi.
Başlangıç: `bc3aaaba560754125e950b38a8cee2596ad8b1a5`, ürün kodu `6fd868ca83c58493c5c95cc2030625d118e0e031`.
Bitiş ürün kodu: `7f4aebf43aa74bd8f2aabaabc60bf3c6cb222c03`.
Dal: `codex/deep-audio528`, [PR481](https://github.com/dorukakindev/whisper-browser/pull/481).

## Doğrulanan sorunlar

### 530-01 — Yeni iyi ses, önceki adayın hata puanını taşıyor

`altyazi_oku.uret` süre düzenlemesini veya ASR denetiminden geçen yeni adayı kabul ederken dalga biçimini ve finishing bilgisini değiştiriyor, `quality_score` değerini eski adaydan bırakıyordu. Tam onarım da aynı sorunu taşıyordu. Sonuç: iyi ses hâlâ review işaretli; sorunlu parçaları yeniden üret düğmesi gereksiz tekrar seçebiliyor.

Artık kabul edilen düzenleme/yeniden denemenin kendi ham akustik puanı taşınır. Her alt parçası akustik denetimden ve hem parça hem bütün metin denetiminden geçen onarım sıfır puanla kaydedilir. Sırf deneme yapıldı diye puan sıfırlanmaz.

### 530-02 — ASR yeniden denemesinde finishing ham kusurları gizleyebiliyor

İlk üretim ham seste `assess_chunk` çalıştırırken ASR sonrası yeniden deneme, prepare/finish sonrasında ölçülüyordu. Seviye sınırlama veya uç temizliği ham kusuru gizleyip bozuk adayı iyi adayın yerine geçirebiliyordu.

Artık aday önce ham örneklerde, aynı metin ve örnek hızıyla ölçülür. Puan sonlu olmalı ve korunan adaydan kötü olmamalıdır. Sonra finishing ve anlam denetimi çalışır. Denetimden geçerse dosya ile metadatası birlikte terfi eder.

### 530-03 — Varsayılan akıcı gruplar eksik okunduğunda onarıma giremiyor

`akici` varsayılanı grupları en fazla280 karakterle birleştiriyor; eski onarım `len(text) <= 280` olduğunda hemen çıkıyordu. Dolayısıyla normal uzunluktaki eksik cümleler iki tam okuma başarısız olduğunda daha küçük bağlamlarla kurtarılamıyordu.

Onarım, başarısız metin140 karakterden uzun ve en az12 sözcükse denenebilir. Bölme sınırı metnin uzunluğuna uyarlanır, mevcut cümle/yan cümle sınırı önceliği korunur. En fazla8 alt parça; her biri en az40 karakter ve4 sözcük. Bütün sözcükler korunur; bu yol içerik düzenlemez veya özetlemez. Sağlıklı normal üretim bütün bağlamıyla tek istek kalır.

## Ek geliştirme ve güvenlik sınırları

- ASR sözcükleri doğru bulsa bile, tam okuma denemeleri sonunda akustik kusur sürüyorsa aynı denetimli onarım yolu kullanılabilir. Hızlı profilde ASR/onarıma zorunlu geçiş eklenmedi.
- Referans koşullandırması ve onarım seed'i alt parçalar boyunca sabittir. Üretilmiş ses sonraki parçanın referansı yapılmaz.
- Her alt parçanın ham sesi akustik olarak kontrol edilir; alt parça ve birleşmiş ses ASR/semantik kapılarını geçmelidir. `passed` ile birlikte çelişkili `review:true` onay sayılmaz.
- Birleştirme mevcut noktalama ve mevcut sessizliği dikkate alan `join_pause_frames` kullanır; nefesler kesilmez.
- Herhangi bir parça veya son birleşim reddedilirse onarım kullanılmaz, önceki gerçek ses review olarak korunur. Geçici onarım dosyası temizlenir. Motor/CUDA kesintileri mevcut bounded yeniden başlatma yoluna bırakılır.
- Yeni ses önbellek kimliği `dublaj-ses-v16-verified-repair`. Eski dosyalar silinmez veya değiştirilmez; yeni üretim eski v15 parça sonucunu otomatik başarı saymak yerine yeni kimlikle üretir. Bu nedenle ilk yeni üretim önbellekten daha az yararlanabilir.

## Kanıt ve kontroller

Ürün düzenlenmeden önce eklenen3 regresyon yöntemi5 alt koşulda kırmızıydı: süre düzenlemesi ve ASR adayında puan1 kalması, normal grupta içerik onarımı olmaması, doğru metin/kusurlu seste onarım olmaması ve finishing ile gizlenen kusurlu adayın ready kabul edilmesi. Aynı kontroller düzeltmeyle geçti.

Toplam7 hedefli Python dosyasında66 yöntem geçti,4.7 saniye:

```powershell
$env:PATH='D:\Whisper Local\backend\bin;'+$env:PATH
@'
import sys, unittest
sys.path[:0]=['backend','tests']
names=['test_dub_generation_quality','test_dub_recovery','test_dub_flowing_groups',
       'test_dub_finish','test_dub_timing','test_dub_resume','test_dub_lifecycle']
r=unittest.TextTestRunner().run(unittest.TestLoader().loadTestsFromNames(names))
raise SystemExit(not r.wasSuccessful())
'@ | & 'D:\Whisper Local\backend\venv\Scripts\python.exe' -
```

Kapsam: kabul edilen adayın disk kaydı, ham kusur kapısı, kısa grupta eksik içerik ve akustik onarım, sağlıklı grubu bölmeme, son bütünlük reddinde eski WAV'ı koruma, küçük/aşırı onarım sınırları, çelişkili review reddi; mevcut gruplama, nefes/noktalama, zamanlama, kaldığı yerden sürme ve süreç yaşamı kontrolleri de geçti. Sentetik motor/ASR kullanılır; gerçek model kalitesi kanıtı değildir.

`py_compile`: değişen4 Python dosyası ve `backend/transcribe.py` geçti. `node --check`: `src/main.js`, `src/preload.js`, `src/renderer/renderer.js` geçti. `git diff --check` temiz.

`node tests/docs-index-integrity.test.js`:764 devir ve489 rapor satırı doğrulandı. İlk `node --test` sarmalayıcısı sandbox'ta child spawn EPERM verdi; aynı proje testi doğrudan Node ile başarıyla çalıştı. Bu ürün kusuru veya CI sonucu değildir.

Önceki başlık `bc3aaaba...` için [CI40020119589](https://github.com/dorukakindev/whisper-browser/actions/runs/40020119589) tamamlanmış/success olarak bu tur API'den görüldü. Bu yeni ürün commit'inin CI sonucu değildir. Yeni CI teslimden sonra arkada çalışır; sonucu beklenmez.

## Sınırlar ve teslim

Yeni bağımlılık/model/kurulum/IPC/kalıcı ayar şeması veya görsel UI değişikliği yok. Windows yolları ve mevcut aynı dizindeki WAV replace/cleanup akışı korunuyor; sentetik WAV'lar geçici dizinde işlendi. `start.bat`/`install.bat` değişmedi; normal Windows uygulama açılışı, gerçek GPU/model, kişisel referansla dinleme, uzun video, canlı sağlayıcı/YouTube/DRM koşulmadı. Tam npm test veya görsel test tekrarlanmadı; değişiklik backend ses seçim/onarma davranışıyla sınırlı.

Ana `D:\Whisper Local` kopyası master `fb86bb3264cecc6acf3d6806b28780468e01072c` ve kullanıcının üç belge değişikliği korundu. Rapor528/529 dahil aynı PR481 güncellenir; yeni AGENTS gereği master'a merge yapılmaz. Önce ürün, sonra bu rapor/devir ayrı commit edilir ve normal push ile teslim edilir.
