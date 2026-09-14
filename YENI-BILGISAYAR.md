# Format sonrası projeyi devralma

Bu dosya, sohbet hafızası olmayan yeni Codex ve kullanıcı için kalıcı başlangıç rehberidir. Esas çalışma kuralları [AGENTS.md](AGENTS.md), son durum ve kanıtlar [DEVIR-NOTU.md](DEVIR-NOTU.md) indeksindedir. Bu rehber yazılırken bilgisayar formatlanmadı ve temiz Windows kurulumu denenmedi.

## Format öncesinde: GitHub'ın saklamadığı veriler

GitHub yalnız commit edilip push edilmiş repo dosyalarını geri getirir. Yerel uygulama ayarları, API anahtarları, tarayıcı oturumları, kullanıcı altyazıları/video dosyaları, izleme geçmişi, notlar, model önbellekleri ve ignore edilen dosyalar bu yedeğe dahil değildir.

- Uygulamayı kapattıktan sonra gerekli kullanıcı verilerini ve çıktı klasörlerini kullanıcının seçtiği **ayrı, güvenli bir yedeğe** al. Gerçek uygulama veri dizinini Electron `app.getPath('userData')` üzerinden doğrula; test profiliyle karıştırma, eski kullanıcı adına bağlı sabit bir yol varsayma.
- Ayar dışa aktarma tek başına bütün veriler değildir. Browser düzeltmeleri ve seçimleri profil/localStorage'da, başka kayıtlar uygulama veri dosyalarında olabilir; gerekiyorsa kapalı uygulamanın tüm veri dizinini ayrıca koru. Anahtarlar/oturumlar hassastır: GitHub'a yükleme. Windows'a bağlı şifrelenmiş oturum/anahtarların yeni kurulumda çalışacağını garanti etme; yeniden giriş gerekebilir.
- Kişisel dosya yedeği ve format işlemi bu dokümantasyon görevinde **yapılmadı**. `node_modules`, Python venv ve indirilebilir araçlar yeniden kurulabilir; bunların GitHub'da olmaması kod kaybı değildir.

## Temiz bilgisayarda başlangıç

1. Git, projenin `package.json` motor koşulunu karşılayan Node.js (**en az 22.13**) ve kurulum kodunun desteklediği **CPython 3.10 veya 3.11** kur. Sürüm bilgileri burada kurulum kodundan alınmıştır; çalışma zamanında `package.json`, `tools/install-orchestrator.js` ve lock dosyalarını tekrar oku. Python 3.14'ün saf testleri çalıştırabilmesi tam GPU kurulumunun desteklendiği anlamına gelmez.
2. FFmpeg ve ffprobe'u birlikte kur: PATH'te erişilebilir olsun veya çalıştırıcılarını `backend/bin/` içine koy. GPU kullanılacaksa uygun NVIDIA sürücüsünü kur ve `nvidia-smi` ile donanımı doğrula. GPU yoksa CPU testiyle ilerle; önceki makinenin RTX 4070 Ti olduğunu yeni makineye varsayma.
3. Repoyu klonla ve bu klasörü Codex projesi olarak aç:

```powershell
git clone https://github.com/dorukakindev/whisper-browser.git
cd whisper-browser
git remote -v
git status --short
git branch --show-current
git log -3 --oneline
```

Mevcut bir kopya varsa önce değişiklikleri kontrol et. Temiz ve doğru dalda `git fetch origin` / `git pull --ff-only` kullanılabilir; kirli çalışma ağacını reset ile silme. `package.json` ve eski README bağlantılarındaki upstream'i bu kullanıcının push deposuyla karıştırma.

4. `AGENTS.md` ve güncel devir notunu oku. Gerekli araçları kurmak kullanıcı tarafından yetkilendirilmiştir; resmî kaynakları ve projenin sabitlenmiş sürümlerini tercih et. Ardından:

```powershell
.\install.bat
.\start.bat
```

`install.bat`, `tools/install-orchestrator.js core` çağırır; kilit dosyalarıyla bağımlılıkları ve venv'i kurar/doğrular. FFmpeg veya desteklenen Python yoksa önce onları tamamla. `npm install` ile rastgele sürüm yükseltmek bu akışın yerine geçmez. Kurulum/başlatma dosyaları etkileşimli sorular ve `pause` içerebilir; hata çıktısını kontrol et, pencerenin kapanmasını başarı sayma.

Üretim uygulamasını **start.bat üzerinden** başlat: cuDNN/cuBLAS ve yerel FFmpeg PATH ayarlarını o yapar. Backend kullanmayan Electron test dosyalarını doğrudan Electron ile çalıştırmak farklıdır. WhisperX ve konuşmacı tanıma gerekiyorsa sırasıyla `install-whisperx.bat` / `install-diarize.bat` kullan; ihtiyaç yoksa zorunlu kurma. DRM/EVS kurulumu hesap ve imza işlemi gerektirebilir; `start.bat`/`drm-kur.bat` açıklamalarını incele, hesap yetkisi varsayma. Electron'u yeniden kurmak önceki yerel imzayı korumayabilir.

5. GitHub'a push için kullanıcının Git kimlik doğrulamasının yeni bilgisayarda kurulmuş olduğunu kontrol et. Şifre/token isteme veya notlara yazma; kullanıcı GitHub'ın normal giriş akışıyla giriş yapabilir. Git commit kimliğini uygun repo/hesap ayarından kullan; kişisel kimlik uydurma veya global ayarları izinsiz değiştirme.

## İlk doğrulama ve geçmiş test engelleri

```powershell
npm test
npm run test:electron-bridge
& "backend/venv/Scripts/python.exe" -m py_compile backend/transcribe.py
node --check src/main.js
node --check src/preload.js
node --check src/renderer/renderer.js
```

2026-09-14 tarihli önceki ürün çalışmasında 193 test dosyasının 188'i geçti. Kalanlar eski ortamda şu nedenlerle engelliydi:

| Test dosyası | Önceki ortam engeli |
| --- | --- |
| `tests/browser-stream-fixtures.test.js` | localhost TCP bağlantısı reddedildi. |
| `backend/test_export_anki.py` | genanki kurulmamıştı. |
| `backend/test_ffmpeg_integration.py` | FFmpeg yoktu. |
| `backend/test_transcribe.py` | numpy/faster-whisper gerektiren kurulum eksikti. |
| `backend/test_ytdlp_update.py` | localhost bağlantısı reddedildi. |

Kullanıcı eski makinede bu engellerin atlanmasını kabul etti. **Yeni makinede otomatik atlama:** yeniden dene; bağımlılık veya erişim düzelmişse testleri çalıştır. Başarısızlıkları silme/gizleme, güvenlik duvarını kapatarak aşmaya çalışma. Test sayıları zamanla değişebilir; güncel koşunun gerçek sonucunu yaz.

Browser testlerini ayrı profilde çalıştır. `tests/electron-browser-video-e2e.smoke.js` içindeki AI, QUICK, DURABLE ve COMBINED_SOAK kipleri için güncel devir notundaki komutları kullan; farklı test kiplerinin ortam değişkenlerini birbirine karıştırma. Canlı site gözlemi `tests/electron-browser-public-sites.smoke.js` içindedir. Geçmiş sonuçlar:

- Açık MDN MP4 oynatma/seek geçti; YouTube bot doğrulaması için oturum istedi. Bütün siteler/DRM doğrulanmış değildir.
- 606 saniyelik kısa video döngüsünde altyazı, AI, seek, sekme ve kontrollü çevrimdışı çeviri kuyruğu birlikte denendi. Bu uzun film testi değildir.
- Ayrı iki Electron sürecinde video konumu, iki altyazı düzeltmesi ve ayrı kanal senkronları geri geldi.
- Altı sahnelik AI kural aracı `tools/audit-browser-ai.js` içindedir. Kontrollü cevap/taşıma başarısı gerçek sağlayıcının semantik kalitesini kanıtlamaz. Kullanıcı şimdilik kontrollü sağlayıcı testlerini kabul etmiştir.

## Yeni Codex'e verilecek kısa mesaj

> Bu repo üzerinde çalışacağız. Önce AGENTS.md, YENI-BILGISAYAR.md ve DEVIR-NOTU.md indeksindeki güncel notu oku. Gerçek Git durumunu ve ortamı kontrol et. Gerekli araçları güvenilir kaynaklardan kurabilirsin. Browser/video/altyazı uygulamasını geliştiriyoruz, İngilizce öğrenme uygulaması değil. Yetkilendirdiğim işi uygulayıp doğrula; her tamamlanan çalışma için yeni tarihli devir notu oluştur, eski notları koru, indeksi güncelle ve kod/notları commit edip doğru GitHub deposuna push et. Push'u uzak commit kimliğiyle doğrula. Gizli anahtarları ve kişisel verileri yayımlama; çalıştırmadığın testleri veya kanıtlanmamış işleri tamamlandı gösterme. Sonunda repo, devir notu bağlantısı ve push edilen commit kimliğini ver.
