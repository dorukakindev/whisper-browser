# Rapor791 — DeepSeek ortak varsayılanı ve konuşma çevirisi kabulü

Başlangıçmaster a975bf2e171fe34d3ca1912184482ab38acf6616; dal codex/deepseek-speech791; bitişürün/test 0ece1b4ee02c2508d12ca359e63cb6f7467f9dab. Kullanıcı, ses/konuşmaçevirisine odaklanmayı ve tümAI alanlarında DeepSeekV4.1 varsayılanını istedi.

## Uygulananlar

- Yeni metin işlerinin varsayılanı DeepInfra `https://api.deepinfra.com/v1/openai`, model `deepseek-ai/DeepSeek-V4.1-Flash-1017`. src/assistant-settings.js fillTextDefaults, main loadSettings/browserTranslationConfig, renderer HTML/buildOpts ve backend argparse translate/LLM varsayılanları uyumlu. Mevcut başka sağlayıcı/özel model tercihi genel güncellemede zorla ezilmez; endpoint'siz eski anahtar eski sağlayıcısına bağlanır, yeni adrese otomatik taşınmaz.
- Kullanıcıya özgü açık tercih ayrıca uygulandı: asistan,çeviri,LLMmetindüzeltme,manga alanları aynı DeepSeekprovider/model ve mevcut şifreli anahtarla kaydedilip tekrar çözülerek doğrulandı. İlk otomatik onay denetimi bu credential kullanımını reddetti; kullanıcıdan açık izin istendi ve kullanıcı 'evet' yanıtladı. Ardından uygulamanın SafeSecretStore ve sanitizeSettings yolu kullanıldı. Eski çeviri/manga sağlayıcı profilleri korundu. Anahtar argv/log/rapor/Git'e yazılmadı; kişiselayar dosyaları commitdışı. İlk kayıt denemesi apiKeyProfiles nesnesini şemanın beklediği stringe dönüştürmediği için sanitizationda durdu; profil serialize edilerek onarıldı, şema bypass edilmedi. Asistan Flex tercihi korunur. Standart canlı testlerde service_tier gönderilmedi.
- Whisper transkripsiyon ve VoxCPM2/nano-vLLM ses üretimi değiştirilmedi. DeepSeek mevcut altyazı çevirisi, AI doğalmetin/süre düzenlemesi, asistan,kitap/sayfaçevirisi ve LLMdüzeltme yollarında kullanılır; görüntü istemleri seçili manga modeline gider.
- Dublaj seçicisinde `.partial.srt` dosyası açıkça uyarılır: kalan satırlar özgün dilde okunabilir. Dosya adı tek başına gerçek eksik satır sayısı kanıtı değildir; uyarı bu yüzden sayısal başarı iddiası vermez. NormalSRT seçilince uyarı kaybolur. EN/TR ve ortakambertema.
- Canlı sentetik corpus'ta 'Although the experiment failed' → 'Deney başarısız olsa da' doğru çıktısı negation_added ile reddedildi. failed/s/ing biçimi için dar kaynak istisnası eklendi; succeeded→başarısız negatifkontrolü hâlâ reddedilir. Bu yalnız ölçülen yanlış reddi giderir, genel anlam anlayışı garantisi değildir.

## Doğrulama

- Gerçek DeepSeekV4.1standard, üretimPython translate-only/for-speech/refine hattı,8sentetikcue. İlkkoşu1başarısız; dar onarım sonrası2APIisteği,8/8tamam,0kaynakmetin/boş/zaman farkı. Sonkanıt `.uiprev/speech-translation-live/1793308989867-26720/acceptance.json`; hamyanıtlar Gitdışı. İnsan kulağıyla dublajkalitesi veya tümkorpus garantisi değil.
- DeepInfra'ya2sentetik32x32resim: kırmızı ve mavi soruldu; ikisi200ve doğru tek-kelimecevap. Görselrequestkabulü ve bu darayırtetme doğrulandı; gerçekOCR/manga/belgekalitesi doğrulanmadı. Kanıt `.uiprev/deep791/vision-colors.json`. Yeni dışbağımlılık/kod alınmadı; mevcut güvenlibroker/APIuyumu kullanıldı.
- `python -m unittest discover -s backend -p test_speech_translation.py`:27PASS; yeni failednegatifçifti dahil.
- `node --test tests/assistant-settings.test.js tests/subtitle-model-default.test.js tests/dub-generator-ui.test.js tests/speech-translation-ui.test.js tests/backend-sentence-translation.test.js`:9Nodealt-testPASS,125sentencecheckdahil. EskiGemini varsayılanını bekleyen test yeni kullanıcıtalebine göre güncellendi; eskiShuai migration ve özelmodelkoruma kontrolleri korunur.
- GerçekWindows `tests/electron-deepseek-dub791.smoke.js`:TRkoyu1440/ENaçık800,6görüntü;partialSRTuyarısı/görünürlük,DeepSeektranslate/LLMkontrolleri,modal/altçubuk/yataytaşmaPASS. Görüntüler incelendi. Kanıt `.uiprev/dub-layout791-1793308680891`.
- JSsyntax/Pythonpy_compile/gitdiffcheckPASS. MevcutWindowsElectron listeneruyarısı ve izoleağfiltreuyarısı gizlenmedi.

## Dosyalar ve sınırlar

src/assistant-settings.js: boşprofillerindefaultları/eski credential koruması; src/main.js:load/browserdefault; backend/transcribe.py:CLIdefaultları; backend/sentence_translation.py:failedyanlışret; backend/test_speech_translation.py:regresyon. src/renderer/index.html/renderer.js:DeepSeekmodelseçenekleri; browser-chrome.css/dub-generator-ui.js:partialSRTuyarısı; tests/assistant-settings.test.js/subtitle-model-default.test.js/dub-generator-ui.test.js:varsayılan/eskiayar/uyarıtestleri; yeni electron-deepseek-dub791.smoke.js:ayrıWindowsprofilikabul.

YeniGPUüretimi,tamvideoçevirisi,canlıYouTube,gerçekOCRmanga,normalstart.bat açılışı ve tamnpm/CIbu turda koşulmadı. CIaçıkbeklenmiyor. start.bat/install.batdeğişmedi; kişiseluygulamakapatılmadı. Açıkuygulamaeskiayarlarıbellektetutabilir; kullanıcımevcutişibitinceyenidenaçmalı. Yeni bağımlılık/kurulum yok. Kişiselayar değişikliği kullanıcıyetkisiyleyalnızyerelde, Gitteslimine dahil değil. Ana kopyadaki430untracked/kullanıcımanifest/index/start.shsilinmişdurumukorunur.90hedefaktif,müzikkapsamıgenişletilmedi.
