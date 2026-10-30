# R815 ikinci genişletme — 24 yeni bug, tekrar üretme

Başlangıç HEAD `55bfcca53a995e1217edb547655a50720ff59320`; ürün değişmedi. [78 ID eşlemesi](findings.json), [ana süreç tekrarları ve başarısız uzun koşu](parent-verification.json). Üç ajan GPT‑6.1 Sol / medium effort kullandı. Önceki54 ve Night1000 aile/mekanizma imzaları karşılaştırıldı; eski başarılar yeni test sayılmadı.

Problar **mevcut hataları bekler**. Exit0, ürünün düzeldiği veya tam paketin geçtiği anlamına gelmez. Native browser scriptinin son JSON'unda ayrıca hata kaydı bulunmadığı ve beklenen altı ölçüm ana süreçte assertion ile doğrulandı. Kaynak SHA256 değerleri aggregate ve alan JSON'larındadır.

## Ayrı çalışma klasörüne kopyala

Yayın dizini altında doğrudan çalıştırma. Scriptlerin ürün importları repo kökünden iki seviye aşağıdaki konuma göredir; temiz bir checkout'ta **yeni, boş** aşağıdaki klasörleri kullan. Mevcut kişisel klasörün üzerine kopyalama. Scriptler kendi klasörlerinde sentetik fixture, test profili ve sonuç oluşturur.

```powershell
New-Item -ItemType Directory tmp/extra815-root, tmp/extra815-browser, tmp/extra815-backend, tmp/extra815-assistant | Out-Null
Copy-Item docs/raporlar/evidence815/extra/root/*.cjs tmp/extra815-root/
Copy-Item docs/raporlar/evidence815/extra/browser/*.cjs tmp/extra815-browser/
Copy-Item docs/raporlar/evidence815/extra/backend/*.py tmp/extra815-backend/
Copy-Item docs/raporlar/evidence815/extra/assistant/probe.cjs tmp/extra815-assistant/

# Önce yalnız sentetik 0,4 saniyelik siyah MP4 oluştur.
& C:/ffmpeg/bin/ffmpeg.exe -v error -f lavfi -i color=c=black:s=32x32:r=5 -t 0.4 -c:v libx264 -pix_fmt yuv420p tmp/extra815-root/synthetic.mp4
node tmp/extra815-root/workspace-probe.cjs
node tmp/extra815-root/auto-backup-probe.cjs
node tmp/extra815-root/package-preview-network-probe.cjs
node tmp/extra815-browser/prefs.cjs

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
# -Wait, Windows GUI exe'nin erken geri dönmesini önler; yalnız yeni test profili kullanılır.
Start-Process -FilePath node_modules/electron/dist/electron.exe -ArgumentList 'tmp/extra815-browser/native.cjs' -WindowStyle Hidden -Wait

& backend/venv/Scripts/python.exe tmp/extra815-backend/probe.py
& backend/venv/Scripts/python.exe tmp/extra815-backend/sync-cancel-probe.py
node tmp/extra815-assistant/probe.cjs
```

Backend ilk probu mevcut `backend/test_transcribe.py` yardımcılarını salt içe aktarır; test dosyasını değiştirmez veya tam paketi başlatmaz. İptal probu yalnız kendi Python çocuğunu, gerçek FFmpeg çıkarımı **tamamlandıktan** sonra kontrollü beklemede sonlandırır. Başka Python/FFmpeg/GPU süreci isimle kapatılmaz. Kendi klasöründeki eski/yeni scratch ayrılır; normal çıkış temizliği ayrıca ölçülür. Sentetik ses kalıntısı bulgunun kanıtıdır; kişisel medya kullanılmaz.

UNC önizleme probu bütün UNC `fs.existsSync` çağrılarını ağdan önce bloke eder. Gerçek DNS/SMB/NTLM isteği üretmez; yalnız yasaklanması gereken API çağrısına ulaşıldığını kanıtlar. Windows kimlik politikası sonucu test edilmemiştir.

## Yük ölçümü — bug sayısından ayrı

```powershell
node tmp/extra815-root/backup-load-probe.cjs
```

Bu komut yalnız test klasöründe **96 MiB rastgele sentetik blob** ve yaklaşık100MiB arşiv oluşturur. PNG isimleri gerçek afiş değildir; sıkıştırma/bellek yolu ölçülür. Ölçülen export2448ms ve export sonrası RSS artışı333479936bayttır. Timer3446ms gecikmesi sonraki geri okuma doğrulamasını da kapsar; yalnız export veya native UI blok süresi diye sunulmaz. Ölçüm makine/çalışma yüküne bağlıdır. Ürün çökmedi; bu performans önerisi kanıtıdır.

## Gerçek uzun Windows koşusu — tamamlanmadı

Mevcut `tests/run-resource-soak.js` kaynakları okunarak, ayrı geçici profilde şu komut çalıştırıldı:

```powershell
node tests/run-resource-soak.js --cycles=200 --warmup=10 --hibernation-cycles=50 --output=tmp/resource-soak815-report.json
```

Windows runner `cmd /d /s /c start.bat` çağırdı. **200/200 yakalama**, ardından **3/50 bellekten boşaltmada** bekleyen1altyazı yanıtı nedeniyle guard reddi, **exit1**. Son JSON oluşmadı. Bu koşu tam kaynak bütçesi PASS değildir. Koruma/fixture zamanlaması ayrıştırılmadığından yeni ürün bugı sayılmadı; kısmi kanıtın kaybolmaması geliştirme önerisidir. Bilinen11before-quit listener uyarısı tekrar gözlendi, yeni bug sayılmadı. Kişisel profil/etkileşimli açılış/DRM kabulü değildir.

## Kapsam ve dışarıda bırakılanlar

XB02 sıcak kapasite ve XB03 düşük güvenli dil politikası ölçümleri JSON'da korunur fakat kesin bug sayısında yoktur. `[man]` etiketinin gerçek sentez etkisi kanıtlanmadı. Gizli iframe karşı kontrolü doğru davrandı. Öneriler bazı önceki hedefleri ayrıntılandırır;27satır27bağımsız özellik veya bug değildir.

Tam npm suite, yeni bridge suite, canlı ücretli sağlayıcı/ASR/TTS/GPU modeli, fiziksel dinleme/ekran okuyucu ve genel DPI/DRM matrisi çalıştırılmadı. CI sonucu beklenmedi veya yeşil denmedi. Yeni bağımlılık/kurulum/ürün ayarı yok. Ham profil, medya, font, büyük blob veya kişisel log yayımlanmadı; yalnız seçilmiş sentetik kaynak/sonuçlar eklendi.
