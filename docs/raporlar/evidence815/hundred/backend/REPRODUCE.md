# Tekrar üretme — R815 hundred/backend

Çalışma dizini `D:\Whisper Local`; dosyaları `.tmp/hundred815-backend/` altında tutun. Script repo kökünü kendi konumundan `parents[2]` ile bulur; kanıtı başka derinlikte doğrudan çalıştırmayın.

```powershell
& backend/venv/Scripts/python.exe .tmp/hundred815-backend/probe.py
```

Probun güncel `ae0a61a7b42c58d78bb7317680cf8f8133d5e027` üstündeki son iki çalıştırması exit0. Altı hata davranışını gözlemler; ürünün düzeldiği veya tam suite geçtiği anlamına gelmez. İlk başlangıç `da773134...` idi; R816 başka oturumda merge edilince prob güncel kaynakla tekrarlandı. Kaynak SHA256 `findings.json` içindedir.

Mevcut backend venvde yt-dlp, openai, numpy; `backend/bin/ffmpeg.exe` gerekir. Paket/model kurmaz. `backend/test_transcribe.py` içindeki `_fake_openai`, `_TrArgs`, `_sentence_translate` yardımcılarını salt import eder; test dosyasını ana program olarak çalıştırmaz/değiştirmez. Fullconsumer için gerçek `transcribe.main` parser tanımı ASTden alınır; ürün değiştirilmez. Source ASR/editor sonuçları kontrollüdür; gerçek FFmpeg ve final dosya/transaction yolu çalışır.

HB04 gerçek loopbackHTTP sunucusu ve gerçek FFmpeg ile önce sentetik video indirir, sonra aynı kaynak isteğine404verir. Eski final yalnız kendi `.tmp/hundred815-backend/downloads` klasöründe silinir. HB05 gerçek kurulu yt-dlp selector/downloaderını kullanır; sadece YouTube metadataextractor yerel iki Opus streami gösterecek biçimde kontrol edilir. İstekler127.0.0.1ile sınırlıdır; gerçek YouTube/hesap/cookie/API yok. HTTPsunucuları try/finally ile kapanır. Thread/işlem isimleriyle global kill yoktur. Prob hiçbir kullanıcı uygulamasını kapatmaz. FFmpeg işleri timeout30sn ve sentetik1–3sn dosyalardır.

Tekrar koşu bazı fixture dosyalarını yalnız aynı `.tmp/hundred815-backend/` alanında yeniden üretir; dil cache kontrolleri her koşuda yeni case klasörüne ayrılır. Video/seslerin frekansı440/880Hz ve sessizPCMdir; kişisel kayıt değildir. Dosya farkı aynı koşu içindeki hashlerle ölçülür; Opus kapsayıcı kimliği nedeniyle hashler koşular arasında değişebilir.

SAPIreferans denemesi ayrıca yapılmış fakat sistemde kullanılabilirvoice/securitysetting engeli çıkmıştır. Kişisel varsayılan referans okunmadı, GPU/TTSmodeli başlatılmadı. `synthetic-reference.wav` varsa boş/yarım SAPI deneme dosyasıdır; rapor kanıtı veya gerçek konuşma referansı olarak kullanmayın/yayımlamayın. Speakerlabel adayı bug sayılmadı.

Rapor için seçilecek küçük dosyalar: `probe.py`, `observations.json`, `findings.json`, `findings.md`, `prior-coverage.json`, bu README. Ham ses/video/cache ve boş SAPI deneme dosyası Git'e gerekli değildir. Kaynak ürün/test/ayar/kurulum/Git/docs değişikliği yapılmadı.
