# BROWSER_BUG_REPORT_446 — Güvenli dublaj/ref temizliği ve oynatma oturumu

Tarih: 2026-10-17. Başlangıç: bc0f9b52493a45bfc4d4a6b90a027b6cb0869269.
Bitiş kod: 46cfdfe24ec8175f6bff3b27195a4ffd890c902a.
Kullanıcı rapor445'teki değerlendirmeden sonra düzeltmeleri uygulamamızı istedi. Dış patch topluca uygulanmadı; ilgili üç hata ve incelemede bulunan veri kaybı riskini karşılayan küçük değişiklikler yapıldı.

## Düzeltmeler

1. BrowserDubAudio eski ses/arka plan play Promise'i yeni oturumun ortak öğesini duraklatamaz. Ayrıca playPending ve backgroundPlayPending oturuma taşındı. Eski bekleyen Promise yeni oturumun play çağrısını engellemez; eski finally yeni oturumun pending bayrağını sıfırlayamaz. Hata callback'lerinin session kapıları korunur.
2. Dublaj çıktı ailesi (WAV, sync, partial) önce tamamıyla çakışma denetiminden geçer. Herhangi biri mevcutsa hiçbiri yeni işe ait sayılmaz. Yalnız bu denetimden geçen isimler işin temizlik kümesine alınır. Aynı ID ile reddedilen tekrar, önceki ses/sync/arka plan dosyasını silmez. Sadece sync dosyası kalmışsa da üzerine yazılmaz.
3. Hata/iptal terminal yolunda bu işe ait WAV/sync/partial dosyaları temizlenir. Arka plan fallback'i yalnız ayrıştırma işinin kendi çıktı ailesini temizler, dublaj üretimi devam eder. Bekleyen alt süreçte cancel() tek başına dosya silmez; normal close/prepare dönüşündeki terminal yol temizler. Gerçek alt sürecin kapandığını process yardımcılarının sözleşmesi belirler.
4. Referans klasörü mkdir ile yalnız yeni oluşturulur; sonra referans WAV/transcript/metadata ve bilinen partial isimleri işe atanır. Hata/iptalde yalnız bu dosyalar temizlenir. Başarılı eski referanslara, tanı kayıtlarına, kullanıcı girdisine ve diğer klasörlere dokunulmaz.
5. Kod0 ile üretilmiş WAV'ın sadece sync haritası geçersizse WAV korunur; error olayında/özetinde recoverablePath döner. Bu kayıt otomatik başarılı dublaj sayılmaz. Sağlam sesi sırf harita okunamadı diye silmez.
6. Silme recursive değildir. Dosya silme başarısızlıkları özet JSON'daki cleanupErrors alanında dosya basename'i ve hata koduyla kayıtlıdır. Windows kilitli dosya hemen silinemeyebilir; başarılı temizlik gibi raporlanmaz. Arka planda retry/süpürme eklenmedi.

## Davranış matrisi ve kanıt

| Senaryo | Test | Sonuç |
|---|---|---|
| Eski ses play'i beklerken yeni oturum play yapabilmeli | browser-dub-audio | Geçti |
| Eski background play'i beklerken yeni background play yapabilmeli | browser-dub-audio | Geçti |
| Eski resolve yeni ses/background öğesini pause yapmamalı | browser-dub-audio, her iki kanal | Geçti |
| Eski finally yeni oturumun pending bayrağını bozmamalı | browser-dub-audio, her iki kanal | Geçti |
| Yeni promise tamamlandığında kendi pending'i kalkmalı | browser-dub-audio | Geçti |
| Aynı ID tekrarında önceki WAV/sync/background byte'ları korunmalı | dub-service | Geçti |
| Sadece eski sync dosyası varsa işe başlanmamalı, dosya korunmalı | dub-service | Geçti |
| Üretim hatasında WAV/sync/partial temizlenmeli | dub-service | Geçti |
| Ayırma hatasında background WAV/partial temizlenip ses üretimi sürmeli | dub-service | Geçti |
| Ayırma iptalinde background WAV/partial temizlenmeli | dub-service | Geçti |
| Silinecek yerde klasör varsa içine girilmemeli, hata özetlenmeli | dub-service, gerçek sentetik dizin | Geçti |
| Bozuk haritada kurtarılabilir WAV korunmalı ve yol raporlanmalı | dub-service | Geçti |
| İptal referansın WAV/transcript/metadata/partial dosyası kalmamalı | voice-reference | Geçti |
| Hatalı referansın WAV/transcript/metadata/partial dosyası kalmamalı | voice-reference | Geçti |
| Başka referansın hatası önceki başarılı referansı bozmamalı | voice-reference | Geçti |

İlk üç yeni regresyon dosyası kendi eski HEAD arşivindeki kaynakla tmp/regression446 içinde çalıştırıldı: browser-dub-audio eski pending'in yeni play'i engellemesinde, dub-service hata çıktısının kalmasında, voice-reference iptal çıktısının kalmasında beklenen exit1 verdi. Eski snapshot d38fa5bb ile başlangıç bc0f9b52 arasında ürün kaynakları aynıydı; arada yalnız inceleme belgeleri vardı. Düzeltilmiş çalışma ağacında aynı üç test exit0 verdi. İncelenen dış yamanın önceki dosyayı silme regresyonu da yeni duplicate-ID/byte karşılaştırmasıyla önleniyor.

## Çalıştırılanlar ve sınırlar

Windows terminalinde node tests/browser-dub-audio.test.js, dub-service.test.js, voice-reference.test.js, dub-background.test.js, voice-reference-process.test.js, voice-reference-ui.test.js ve dub-generator-ui.test.js geçti. node node_modules/electron/cli.js tests/electron-browser-trusted-bridge.smoke.js --disable-gpu ayrı test penceresiyle geçti. Değişen kaynaklar ve main/preload/renderer node --check, backend/transcribe.py py_compile, diff-check temiz. Son belge index kontrolü teslimde ayrıca çalıştırılır.

Tam paket/CI incelemesi yapılmadı; kullanıcının hedefli test ve önceki CI bırak tercihi korundu. Gerçek YouTube/CUDA/VoxCPM2 üretimi, aygıt sesi/Windows dosya kilidi/start.bat açılışı test edilmedi. Görsel yerleşim/CSS değişmedi; yeni UI ekran görüntüsü gerektiren tasarım değişikliği yok. Testler fixture süreçleri ve gerçek sınıf/dosya sistemiyle yapıldı; gerçek model kalitesi kanıtı değildir.

Yeni bağımlılık/kurulum yok. job özetine opsiyonel cleanupErrors, recoverable hata olayına recoverablePath eklendi; preload API/NDJSON backend sözleşmesi değiştirilmedi. Yeni klasörlerde yalnız mevcut olmayan isimler iş için ayrılır; bu in-process iş sahipliğidir, başka bir programın aynı anda bu rastgele iş isimlerine dosya yazmasına karşı dosya sistemi kilidi değildir. Kullanıcı girdisi/üretim cache'i ve tanı logları korunur. Dış teslimin bozuk CSV'si ürüne alınmadı, kullanıcı orijinal dosyaları değiştirilmedi. Genel YouTube ses dili/dialogue track/loopback geliştirmeleri bu çalışmanın kapsamı değildir.
