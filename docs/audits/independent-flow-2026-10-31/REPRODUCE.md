# Tekrar çalıştırma

Depo kökünden, mevcut bağımlılıklarla:

```powershell
node --test tests/independent-assistant-native.test.js tests/independent-assistant-preferences.test.js tests/independent-books-flow.test.js tests/independent-browser-flow.test.js tests/independent-dub-rate-ownership.test.js

$env:PYTHONUTF8 = '1'
& 'D:\Whisper Local\backend\venv\Scripts\python.exe' -m unittest -v backend.test_independent_asr_recovery backend.test_independent_dub_publication backend.test_independent_translation_flow backend.test_pipeline_control

node tests/persistent-schema-inventory.test.js
node --test tests/audit-followup.test.js tests/review-triage-r318.test.js tests/reports820-823.test.js
```

Yerel tam paket: `npm test` (aynı giriş noktası `node tests/run-all.js`). Python seçimi gerekiyorsa `WHISPER_TEST_PYTHON` ile mevcut sanal ortamın Python yolunu verin. Bu komut Electron smoke/soak kabulünü içermez.

Ayrı native kabul:

```powershell
& 'D:\Whisper Local\node_modules\electron\dist\electron.exe' tests/independent-browser-flow.smoke.cjs
```

Bu test ayrı `tmp/independent-flow-audit/native/profile-<pid>` profili açar, test pencerelerini kapatır; kişisel uygulama/profil üzerinde işlem yapmaz. Testin GPU'yu kapatması DOM/pencere/sahiplik doğrulaması içindir; donanımlı medya kabulü değildir.

Gerçek ses kabulü için `tools/voxcpm2/accept_dub.py --help` içindeki mevcut `--run` akışını kullanın. Engine/backend Python, yerel motor ve izinli referans açıkça seçilmelidir. Özel ses/anahtarları rapora veya git'e eklemeyin. Bu teslimdeki gerçek koşunun yalnız güvenli sayısal özeti `gpu-summary.json` olarak saklandı.

Başlangıç kodundaki kırmızı kontrolleri tekrar üretmek için mevcut dosyaları geri almayın; başlangıç `c13bee60` için ayrı geçici checkout kullanın. Öncesi fixture günlükleri kanıt dizinindedir. Hata enjeksiyonu ve üretici/tüketici bağlantıları yeni test dosyalarında okunabilir.
