# BROWSER_BUG_REPORT_522 — Son güvenilirlik incelemesi ve kaynak araştırması

Tarih: 2026-10-23. Dal: `codex/final-stability522`.
Başlangıç: `a1ce4543ebe00a0e386d90060becc0a25cea6abd`.
Bitiş ürün kodu: `3d7e0431efafbff2d3c5c340c70af43b0f7b116e`.

## Sonuç ve doğrulanmış kusurlar

Bu çalışma hata kotası doldurmaz. Beş ürün kökü giderildi; CI ve test bakımı ayrıca gösterilmiştir. Bu, uygulamanın bütün koşullarda hatasız veya sesinin insan sesinden ayırt edilemez olduğu kanıtı değildir.

| No | Kök neden ve önceki davranış | Düzeltme ve kanıt |
|---|---|---|
| 522-01 | Motor sıfır koduyla çıktıysa kalite raporundaki bütün gruplar failed olsa bile tanı sessizliği başarılı dublaj sayılıyordu. | Tüm gruplar başarısızsa hata/kurtarılabilir tanı olarak tutulur; WAV ve yan raporlar silinmez, başarılı çıktı olarak kaydedilmez. Eski done kayıtları da latest'ten elenir. dub-service regresyonu öncesinde done, sonrasında error gösterdi. |
| 522-02 | Kayıtlı video zamanlaması seçilmiş fakat sync=null olan çıktı güvenli senkron sayılıyordu. | WAV korunur; syncInvalid=true olur. Bozuk eşlemeyle otomatik senkron kullanım engellenir. Kayıt yeniden yükleme testi geçti. |
| 522-03 | Kaydedilmiş arka plan katmanının yalnız varlığı denetleniyordu; geçersiz WAV iyi konuşma çıktısına eklenebiliyordu. | İsteğe bağlı katman gerçek PCM/WAV doğrulamasından geçer; bozuksa yalnız katman elenir. Konuşma korunur. Regresyon geçti. |
| 522-04 | Stop yardımcısı exitCode/signalCode görünmesini stdio kapanması sayıyordu. Alt süreç çıkmışken miras alınan pipe açık kalabilir. | close olayı beklenir; zaman aşımı başarı sayılmaz. Onaylanmayan iptal işi sahipliğinde tutar. exit/close ayrı testleri ve Windows gerçek parent/grandchild sonlandırması geçti. |
| 522-05 | BAT araç yolunu yakalayan regex tools/voxcpm2/... yolunu klasöre kesiyordu; paket denetimi klasörü dosya sayıyordu. Ayrıca sibling Python yardımcıları manifestte eksikti. | Tam nested yollar ve VoxCPM Python yardımcı dosyaları kapsanır; pycache dışarıda. Manifestte her öğenin dosya olduğu ve dub_finish/dub_recovery dahil olduğu denetlenir. Gerçek kopyalama/eksik dosya fixture'ı geçti. |

## Araştırma ve bilinçli olarak değiştirilmemiş alanlar

- [OpenBMB VoxCPM kaynak ve kullanım açıklaması](https://github.com/OpenBMB/VoxCPM), [VoxCPM2 model kartı](https://huggingface.co/openbmb/VoxCPM2), [koşullama kodu](https://github.com/OpenBMB/VoxCPM/blob/main/src/voxcpm/core.py): dökümlü Hi-Fi koşullama ile reference-only stil yolu farklıdır. Mevcut uygulamanın açık anlatım/stil yolundaki ayrım korundu; rastgele kalite/CFG/engine değişikliği yapılmadı. SRT tek başına özgün konuşmacının tüm duygu bilgisini kanıtlamaz.
- [nano-vLLM VoxCPM deposu](https://github.com/a710128/nanovllm-voxcpm): prompt ve reference koşullama ile asenkron havuz davranışı incelendi. Harici motor kurulumu değiştirilmedi.
- [Node child_process sözleşmesi](https://nodejs.org/api/child_process.html): exit ve close ayrımı 522-04'ün temelidir.
- [Python subprocess boruları](https://docs.python.org/3/library/asyncio-subprocess.html): bekleme/pipe riskleri gözden geçirildi; mevcut sınırlı verifier kapanışı yeniden yazılmadı.
- [HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play): geç sonuçlanan Promise korumaları incelendi; önceki oturum token korumaları korundu.
- [FFmpeg atempo belgesi](https://www.ffmpeg.org/ffplay-all.html): yüksek hızın ses kalitesi sınırları dikkate alındı. Mevcut muhafazakâr hız sınırına yeni agresif varsayılan eklenmedi.

Doğallık için sonraki anlamlı kanıt, aynı izinli referans ve metinle kör dinleme karşılaştırmasıdır: uzun/kısa cümle, Türkçe özel ad, soru/itiraz, grup geçişi, uzun üretim ve zamanlama birlikte değerlendirilmelidir. Bu turda kişisel sesler kullanılmadı; araştırma, dinleme testinin yerine sunulmaz.

## Önceden tamamlanmış kırmızı CI ve bakım

[Önceki Windows işi](https://github.com/dorukakindev/whisper-browser/actions/runs/39873846592/job/120155036441) ve [Ubuntu işi](https://github.com/dorukakindev/whisper-browser/actions/runs/39873846592/job/120155037278) incelendi. Windows'taki 19 başarısız test dosyası bu tur hedefli yerelde tekrar koşuldu ve geçti. Yeni dalın CI sonucu beklenmedi; bu sonuçlar uzak CI'nin yeşil olduğu anlamına gelmez.

- Node22.13 SQLite derlemesinde FTS5 tanımı yokken [22.16 derleme kaynağında](https://raw.githubusercontent.com/nodejs/node/v22.16.0/deps/sqlite/sqlite.gyp) var; [22.13 kaynağı](https://raw.githubusercontent.com/nodejs/node/v22.13.0/deps/sqlite/sqlite.gyp) karşılaştırıldı. CI sabit22.13 yerine güncel22 kullanır. Electron veya kullanıcının runtime'ı yükseltilmedi; testler kapatılmadı.
- Şema envanteri, zaten protokol4 olan cümle gruplamasını3 diye gösteriyordu; envanter4 olarak eşitlendi. Bu tur yeni şema geçişi yoktur.
- Ses testlerindeki sahte metin dosyaları geçerli PCM fixture'larına geçirildi; geçersiz ses reddi testleri korundu. İptal mock'ları gerçek dönüş sözleşmesine uyarlandı. Stale browser testi yanlış player bağlamı yerine browser kullanır; yerel oynatıcı sessizleme politikası gevşetilmedi.
- Çeviri VM testine gerçek güvenli endpoint denetleyicisi ve URL sağlandı. AST testlerinin kapsamına güncel gerekli argümanlar eklendi. Kaynak HTML izin listesinin yalnız kaymış satır numaraları düzeltildi; yeni güvensiz HTML istisnası veya tolerans eşiği eklenmedi. Dinamik preset bağlama testi gerçek kayıt desenini kontrol eder. Kalıcılık testi mevcut dub:config deposunu tanır.

## Doğrulama

- `node --test tests/report522-lifecycle.test.js tests/dub-service.test.js tests/package-integrity.test.js`: geçti (11 test çıktısı; dub-service dosyasında birden fazla davranış assertion'ı).
- `node --test tests/process-lifecycle.test.js`: 10 geçti; gerçek Windows alt süreç ağacı dahil.
- Önceki 19 kırmızı dosya: browser-page-translation-main, dom-innerhtml-ratchet, package-integrity, player-ui, pure-modules-deadzone, report477/479/491-audio/492/493-audio/495/496/498/518, settings-ui-persist-roundtrip, test_report491_audio.py, test_report494_audio.py, test_report495_audio.py ve persistent-schema-inventory ilgili kontrolü: hedefli yerel koşum geçti. Ham çalışma çıktıları ignored tmp/audit522-targeted altındadır; kişisel günlükler commit edilmedi.
- dub-generator-ui, report521 regresyonları ve ui-locale hedefli kontrolleri geçti; değişen JS sözdizimi ve git diff --check geçti.
- Gerçek Windows Electron trusted bridge smoke, ayrı test profili ve sentetik medya ile exit0 verdi: TextTrack/EME, shadow/iframe yaşam döngüsü, link ipuçları, isolated-world Dark Reader köprüsü. Bu test gerçek DRM hesabı kanıtı değildir.
- Gerçek Electron runtime Node24.19.0 üzerinde SQLite FTS5, WatchIndex oluşturma/kayıt/arama geçti; geçici test verisi temizlendi.
- Sandbox ilk son-kontrol denemesinde alt süreç spawn EPERM verdi; aynı testler yetkili süreç çalıştırmasıyla yeniden koşuldu. Yeni manifest assertion'ı eksik sibling yardımcılarını yakaladı; ürün manifesti düzeltildikten sonra geçti.

## Sınırlar

Tam npm test bu tur tekrar koşulmadı. Normal start.bat oturumu, gerçek YouTube hesabı/reklam/DRM, CUDA model üretimi ve uzun dinleme karşılaştırması yapılmadı. Yeni CI arkada kalır. close onayı yoksa stop başarısı vaat edilmez; miras pipe açıkken ölmüş parent'ın tüm torunlarının öldüğü iddia edilmez. Ana Windows kopyası ve kullanıcının açık oturumu değiştirilmedi; bu teslim ayrı dal/PR'dır.
