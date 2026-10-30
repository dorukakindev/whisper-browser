# Ek backend kanıtını tekrar üretme

Çalışma dizini `D:\Whisper Local`; yalnız mevcut `backend/venv/Scripts/python.exe` ve `backend/bin/ffmpeg.exe` gerekir. Yeni kurulum/indirilen model yoktur. `probe.py`, mevcut `backend/test_transcribe.py` içindeki `_TrArgs` ve `_sentence_translate` kontrollü sağlayıcı yardımcılarını salt import eder; o test dosyasını çalıştırmaz/değiştirmez. `srt`, `ffsubsync`, numpy, soundfile mevcut venv bağımlılıklarıdır.

```powershell
& backend/venv/Scripts/python.exe .tmp/extra815-backend/probe.py
& backend/venv/Scripts/python.exe .tmp/extra815-backend/sync-cancel-probe.py
```

Her iki probun son yeniden koşusu exit0. İlk prob gerçek ürün fonksiyonlarını çağırır ama Whisper/OpenAI/kapasite sağlayıcı yanıtları kontrollüdür. Ağ/API/GPUya çıkmaz. `CANDIDATE-speaker`, `XB02` ve `XB03` ölçümleri observations.json içinde bilinçli korunur; findings.json bug listesinde yoktur. XB02 XI01 önerisine taşındı.

İkinci prob yalnız kendisinin başlattığı Python `Popen` çocuğuna `terminate()` uygular. Bu çocuk gerçek FFmpeg ile sentetik4sn PCM WAV çıkarır. **FFmpeg bitip EXTRACTED_READY yayımlandıktan sonra**, test extract wrapper'ındaki beklemede Python öldürülür. Aktif başka FFmpeg/Python/GPU süreçlerine isimle toplu kill yoktur. READY görülmezse assertion verir; eski kanıt yeni başarı diye sayılmaz. Önceki kalıntı listesi alınır, yalnız bu koşuda yeni oluşan WAV kanıta eklenir. İkinci ayrı kooperatif iptal koşusu çıkarımdan sonra gerçek CancellationController markerını yazar; sync yine done verir. Marker veya scratch yalnız bu klasör altındadır.

Üretilen4sn sıfır PCM, sentetik SRT/VTT, cache, iptal işareti ve128078bayt scratch yalnız `.tmp/extra815-backend/` altında kalır. Bu dosyaları kullanıcının gerçek medya/profil/anahtarıyla değiştirmeyin. Tekrar çalışma yeni sentetik series-cache ve bir yeni kaçak-scratch örneği bırakır; bunlar bulgunun kanıtıdır. Normal kontrolün scratch temizliği ayrıca kaydedilir. Hiçbir kişisel dosya temizlenmez.

HEAD `55bfcca53a995e1217edb547655a50720ff59320`; `findings.json` kaynak SHA256 değerlerini içerir. Ürün/test/ayar/kurulum/Git değişikliği yoktur. Genel npm/CI/native UI kabulü veya canlı model kalitesi iddiası yoktur.

Ana süreç karşı denetimi sonrası XB03 (düşük güvenli ara gözlemlerde dil aday sayacı) strict bug sayısından çıkarıldı: düşük güvenli gözlemleri saymama tasarım politikası olasılığı vardır. Deterministik gözlem JSON/probda korunur ve XI07 kabul ölçütüne taşınır. Nihai5bug: XB01, XB04, XB05, XB06, XB07;7öneri.
