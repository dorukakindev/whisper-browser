# Rapor637 — Birleştirilmiş kısa altyazı gruplarında kimlik sözleşmesi

## Kök ve gerçek repro

Planlayıcının `make_groups` fonksiyonuna100 adet100ms, o/bu kısa satırı verildi. Tek10saniyelik249karakter konuşma bloğu ve1–100source ordinalinden oluşan291karakter anahtar üretti. Bu geçerli plan, Nodekalite/workspace modelindeki200key sınırında Invalid dubbing timeline ile reddedildi. Aynı anahtar asistanın get_voice_status ve voice_group şemasındaki genel200string sınırını da aşıyordu. Ses tamamlanabilirken kalite listesi/düzenleme/yeniden üretme araçları kaybolabiliyordu.

Üretim dub:start zaten grup anahtarına2000 ve toplam12000 sınırlaması uyguluyor. Model grupları ve yalnız asistan group_id alanları aynı2000üst sınırına bağlandı; genelaraçstring200 ve diğer güvenlik/sayı/kalite eşikleri değişmedi. Kaynak kimlikleri yeniden numaralandırılmadı;2001 hâlâ reddediliyor. Bu aynı kökün iki kapıdaki düzeltmesidir, iki bağımsız bug sayılmaz.

## Kanıt

- Yeni test gerçek Pythonplanlayıcısından key291 alır; önce kalite modelinde kırmızı, sonrasında Model.groups ve get_voice_status/voice_group open/listen/regenerate şemaları yeşil. İlkçalışmada testkeşfi sistemPythonunu seçti ve soundfile yoktu; mevcut backend/venv açık WHISPER_TEST_PYTHON ile seçildi. Bağımlılık kurulmadı, testskip yok.
- `WHISPER_TEST_PYTHON=<projevenv> node --test --test-isolation=none tests/dub-group-identity637.test.js tests/dub-workspace.test.js tests/assistant-capabilities.test.js tests/assistant-voice-actions.test.js`15/15.
- Native electron-assistant-captions:3kontrollüHTTPistek,1indirme,1normal+1örneksesişibaşlatmakabulü. Son örneğe key291 review metadata eklendi; gerçek AssistantAppActions get_voice_status exactlookup döndürdü; not_checked korunur. Kalite seçicisi açık ve görünür PNGde incelendi: `.uiprev/assistant-captions/1793084116310-14324/long-group-review-en-light.png`. Nativeexit0.
- İlkekran görüntüsünde kalite details kapalıydı; kullanılabilirlik kanıtı sayılmadı. Details açılıp seçici merkeze kaydırıldı ve sınırgeometrisiyle yeniden sınandı.
- Syntax/diff başarılı. Yeni bağımlılık,IPC veya kişisel ayar/depolama şeması yok. start.bat değişmedi; gerçekYouTube/GPU/model/akustikkalite veCI sonucu doğrulanmadı. UzunCI beklenmedi.

1000planına yalnız iki kabul için DÜZELTİLDİ, bir darpanel erişimi için kapsamı sınırlı İLERLEDİ yazıldı. Diğer maddelerle ilgili başarı üretilmedi; çalışma sürüyor.
