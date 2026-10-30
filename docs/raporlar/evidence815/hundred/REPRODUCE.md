# R815 — 100 hedefi için tekrar üretme

Bu tur **25 yeni bug**, önceki78 ile **103 toplam**; öneriler ayrı G01–G32 bölümlerindedir. Başlangıç `da773134a3e744885592bafa008f81f03bcdf878`, son doğrulanan ürün tabanı `ae0a61a7b42c58d78bb7317680cf8f8133d5e027`. Aradaki R816 ürün değişiklikleri başka çalışmanındır. Bu denetim ürün/test/ayar değiştirmedi. [ID/hash eşlemesi](findings.json), [altı yeni iş akışının tekrar kaydı](parent-verification.json), [etkilenen önceki bulguların tekrar doğrulaması](prior-revalidation.json).

Problar **mevcut hataları bekler**. Exit0 ürünün düzeldiği veya tüm testlerin geçtiği anlamına gelmez. Her kayıt gerçek modül/consumer ve hangi sınırın kontrollü olduğunu söyler. Raw profiller, test medyası, model ağırlığı, kişisel veri ve boş SAPI denemesi yayımlanmadı.

## Doğru klasör ve sıra

Yayımlanan kaynaklar depo kökünden iki seviye aşağıdaki test klasörüne göre import eder. Temiz checkout'ta aşağıdaki **yeni ve boş** dizinleri oluştur; mevcut kişisel klasörün üzerine kopyalama. Kanıt dizininde doğrudan çalıştırma; aksi halde kaynak yolları yanlış olur veya kayıtlı sonuçlar değişir.

```powershell
New-Item -ItemType Directory tmp/hundred815-root, tmp/hundred815-browser, tmp/hundred815-backend, tmp/hundred815-assistant | Out-Null
Copy-Item docs/raporlar/evidence815/hundred/root/probe.cjs tmp/hundred815-root/
Copy-Item docs/raporlar/evidence815/hundred/browser/*.cjs tmp/hundred815-browser/
Copy-Item docs/raporlar/evidence815/hundred/backend/probe.py tmp/hundred815-backend/
Copy-Item docs/raporlar/evidence815/hundred/assistant/*.cjs tmp/hundred815-assistant/

node tmp/hundred815-root/probe.cjs
node tmp/hundred815-browser/probe.cjs
# Browser native scripti önceki probe'un results.json dosyasını kullanır.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Start-Process -FilePath node_modules/electron/dist/electron.exe -ArgumentList 'tmp/hundred815-browser/native-network.cjs' -WindowStyle Hidden -Wait

& backend/venv/Scripts/python.exe tmp/hundred815-backend/probe.py
node tmp/hundred815-assistant/probe.cjs ae0a61a7b42c58d78bb7317680cf8f8133d5e027
Start-Process -FilePath node_modules/electron/dist/electron.exe -ArgumentList 'tmp/hundred815-assistant/native-redirect.cjs' -WindowStyle Hidden -Wait
```

Gerekenler mevcut repo Node bağımlılıkları, Python backend venv (yt-dlp/openai/numpy dahil) ve FFmpeg/ffprobe. Yeni paket/model indirilmez. Backend probu mevcut `backend/test_transcribe.py` yardımcılarını salt import eder; test dosyasını değiştirmez veya tam paketi başlatmaz. Kaynak ASR ve LLM cevapları kontrollüdür; FFmpeg çıkarımı, final SRT/transaction ve indirme/yt-dlp davranışları gerçektir.

## Dosya ve ağ sınırları

- Root probu yalnız kendi `fixtures-*` dizininde model-cache dosyaları ve bozuk JSON oluşturur. Silinecek hedefin çözümlenmiş yolu önce bu test dizini altında doğrulanır. Model dosyaları sahte metadata/bayttır; gerçek model veya kişisel önbellek yoktur. `applyRepairs` yalnız sentetik kataloğa uygulanır; kullanıcı verisi onarılmaz.
- Backend indirme, yalnız yeni oluşturulan sentetik MP4/WebM ve localhostHTTP ile çalışır. Yeniden indirme hatasında silinen final, bu probun oluşturduğu dosyadır. Dil karşı kontrolü her koşuda ayrı case klasörünü kullanır. Sunucular try/finally ile kapanır; başka süreçler ismen kapatılmaz.
- Native browser, kendi profili/penceresi ve localhost sunucusunda HTTP200 XML/namespace, gerçek parser/capture ve overlay ölçer. `parserErrors=0` tam DASH şema doğrulaması değildir; düz DASH kontrolünün iki cue/complete sonucu ayrıca kaydedilir.
- Native araştırma yönlendirmesi yalnız kendi Electron sürecinde `public-fixture.invalid→127.0.0.1` host-resolver kuralı kullanır; sistem hosts/proxy/ayarları değiştirmez. Sunucu sadece sentetik HTML döndürür. Gerçek LAN/özel servis, DNS veya kimlik bilgisi kullanılmaz. Güvenlik hatasından önce hedef sayacının1 olması assert edilir; içerik/kimlik sızıntısı iddia edilmez.
- Standalone native fonksiyon/script kanıtı, kullanıcının kişisel uygulamasında tam E2E/DRM/hesap kabulü değildir. Fiziksel ses dinleme ve ekran okuyucu yapılmadı.

## Eski bulgular tekrar yeni sayılmadı

R816 kodu ortak kopyaya geldiğinde değişen backend için önceki yayınlanmış üç prob ayrı `hundred815-prior-*` klasörlerine kopyalanıp tekrarlandı. Sonuçlar `prior-revalidation/` altında; kesin komutlar ve kapsam [prior-revalidation.json](prior-revalidation.json) içindedir. İlgili14 önceki davranış sürdü; bunlar25yeni sayısına katılmadı. Diğer kayıtlar için değişmemiş kaynak veya ilgili davranıştan bağımsız protokol diff'i esas alındı; bütün78 için yeni E2E koşu iddia edilmez.

## Sayıya alınmayanlar

SSE eşit isim fragmenti şüphesi gerçek tüketicide çürüdü; MP4+Vorbis remux karşı kontrolü çalıştı. Boş API key politikası/HLS delta anchoring/uyarı yorumu kesin bug yapılmadı. Sentetik SAPI sesi üretilemeyince speakerlabel GPU adayı kanıt boşluğu kaldı; kişisel referans aranmadı veya model başlatılmadı. GPU gücü tek başına bug kanıtı değildir.

Yeni tam npm suite, kurulum/normal launcher açılışı, ücretli API, gerçek ASR/TTS/GPU inference, fiziksel dinleme/DPI/ekran okuyucu ve CI sonucu doğrulanmadı. Önceki tamamlanmayan uzun soak geçti diye sunulmaz. Ürün kodu ve mevcut testler değişmedi.
