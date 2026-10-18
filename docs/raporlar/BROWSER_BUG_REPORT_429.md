# 429 — CUDA arka plan ayırma, aralık ve durdurma doğrulaması

Kullanıcı GPU ayırma, ekran kartı modelinin belirlenmesi ve seçilen dublaj aralığında ayırma/durdurmanın görünür olmasını istedi. NVIDIA sorgusu RTX 4070 SUPER, 12282MiB, sürücü617.42 gösterdi. Önceki rapor428'in CPU kurulumu bu çalışmayla GPU'ya geçirildi.

## Uygulama

Yalnız backend/separator-venv değişti: torch2.5.1+cpu → 2.5.1+cu124, torchvision0.20.1+cpu → 0.20.1+cu124, onnxruntime1.20.1 kaldırılıp onnxruntime-gpu1.20.2 kuruldu. PyTorch resmî cu124 indeksi ve resmî PyPI kullanıldı; GPU1.20.1 yayımlanmadığı için mevcut1.20.2 patch seçildi. pip check temiz. Ana Whisper/VoxCPM2 ortamı veya sürücü değiştirilmedi.

Yeni GPU kilidi mevcut CPU kilidinin yalnız üç paket farkını içerir. install-browser-extras.bat NVIDIA tespitinde GPU kilidi/cu124 indeksini seçer ve çakışan CPU ONNX paketini kaldırır. NVIDIA yoksa CPU; --cpu açık CPU dönüşüdür. Çevrimdışı manifest GPU kilidi/indeksiyle yenilendi. Büyük paketler/profil/çıktılar Git'e alınmadı.

Ayırma seçilen aralığı zaten alıyordu: prepareBackground --start/--end geçirir, prepare_background.py FFmpeg -ss başlangıç ve -t süre ile kırptıktan sonra modele input.wav verir. 40dk videodan10dk seçilince ayırma yalnız10dk'dır. Kaynak YouTube sesinin indirilmesi daha geniş olabilir; tüm sesin indirilmesi tümünün ayrıldığı anlamına gelmez. Testler600–1200sn aralığını renderer→servis→Python argüman sınırlarında doğrular.

Durduruluyor… hemen gösterilir; terminal cancelled gelince Durduruldu. Geç gelen ilerleme, durduruluyor durumunu ezmez. Durdur başarısızsa başarısızlık görünür kalır ve tekrar denenebilir. Terminal iptal/hata, belirsiz ilerleme animasyonunu durdurur. Python süreci Windows taskkill /T /F ile sahipli alt süreç ağacından kapatılır; mevcut süreç yaşam döngüsü kodu korundu.

Ayırma GPU(CUDA)/CPU cihaz durumu gösterilir ve üretim özeti settings.backgroundDevice alanına yazılır. Önceden hazırlanmış arka plan önbelleği tekrar hesaplanmaz.

## Kanıt

- Gerçek Windows Audio Separator0.47.0 + UVR_MDXNET_KARA_2.onnx: torch_device=cuda; modelin gerçek ONNX oturumu CUDAExecutionProvider/CPUExecutionProvider. CPU listede fallback olarak bulunabilir; aktif CUDA oturumu doğrulandı. 11sn civarı yerel ses fixture'ından2–5sn seçildi; sonuç tam3.0sn. İşlem3.863sn; PyTorch allocation73,437,184bayt, bu ONNX toplam VRAM ölçümü değildir. CPU yedeği aynı bölümde5.112sn/3.0sn sonuç verdi; kısa tek ölçüm uzun video hız garantisi değildir.
- Gerçek GPU ayırma aşamasında taskkill: süreç kapandı, final çıktı yok; başlatmadan kapanmaya3.49sn (iptal gecikmesi değil). Erken başlatma iptali de320ms'de kapandı.
- Beş hedefli test: dub-background, dub-generator-ui, dub-service, browser-dub-audio, ui-locale geçti. process-lifecycle10 testi yükseltilmiş süreç izniyle geçti; ilk sandbox koşumu spawn EPERM verdi. Canlı grup-kill alt testi bash/POSIX yoludur, Windows taskkill için ayrıca yukarıdaki gerçek ayırma testi yapıldı.
- Gerçek Electron ayrı profil/kontrollü dub IPC: Durduruluyor ve Durduruldu UI durumları geçti; ekran görüntüsü incelendi. Görselde belirsiz çubuk hareketi fark edilince son küçük kod commit'inde terminal durumda durduruldu; hedefli UI testi tekrar geçti. Bu son metin/çubuk durumu üretim fonksiyonlarını çalıştıran JSDOM testinde de doğrulandı.
- pip check, JS syntax, Python py_compile, diff check temiz. Özel kanıtlar tmp/separator-gpu-proof, separator-cpu-proof, cancel-background-real, dub-stop-ui-* içinde Git dışında.

## Sınırlar ve kaynaklar

Tam npm test,40dk video, gerçek kullanıcı SRT/hesabı, yeni start.bat açılışı ve install-browser-extras.bat baştan sona çalıştırılmadı. Yerel paketler doğrudan resmî pip komutlarıyla kuruldu; temiz makine batch akışı ayrıca doğrulanmalıdır. Test sırasında süren kurulum esnasında erken CPU kontrolü geçici DLL import hatası verdi; kurulum bitince GPU/CPU gerçek üretimleri geçti. CPU benchmark harness'ının --cpu bayrağı argv yeniden yazılırken kaybolmuştu; özel test aracı düzeltildi, ürün etkilenmedi. CI kullanıcı talimatıyla beklenmez. Ses ayrıştırmanın tüm konuşma/müzik türlerinde kusursuzluğu iddia edilmez.

Resmî kaynaklar: [Audio Separator](https://github.com/nomadkaraoke/python-audio-separator), [ONNX CUDA/PyTorch uyumluluğu](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html), [PyTorch cu124 paket indeksi](https://download.pytorch.org/whl/cu124).
