# Rapor668 — Gerçek müzik karakterizasyonu ve kör dinleme

## Uygulama
Müzik → Analiz et → Arşivimde benzerleri → iki sonucu seç → Kör karşılaştır. A/B ataması kriptografik rastgele bit ile yer değiştirir; sonuç adları ve skorları tercih öncesinde gizlenir. Referans kesiti ayrı düğmeyle dinlenir. Her adayın gerçek oynatımında en az2saniye (çok kısa kesitte%70) ilerleme görülmeden tercih düğmeleri açılmaz; bu, insanın gerçekten duyduğunun kanıtı değildir. A/B/eşit/hiçbiri seçenekleri vardır. Adaylar RMS seviyesiyle yalnız zayıflatılarak dengelenir; LUFS veya ABX iddiası yok.

Tercih açık kullanıcı tıklamasıyla `userData/music-listening.json` v1'e atomik yazılır; en fazla500kayıt/900KB, ekranda son20tercih görünür. Ses, yerel dosya yolu veya imzalı URL yazılmaz. Ana süreç yalnız aynı pencerenin güncel tamamlanmış yerel aramasındaki iki farklı adayı kabul eder; eski iş, bilinmeyen aday, geçersiz tercih ve aynı işte ters sırayla tekrarlanan çift reddedilir. Bozuk kayıt sessizce ezilmez. Kaynak, karışım, arama, sekme veya panel değişiminde kör oturum durur. Tercihler otomatik sıralama/öğrenme değiştirmez. İnternet adaylarında mevcut referans/eşleşme A/B akışı devam eder; yeni iki-aday kör ekranı yerel arşiv içindir.

## Gerçek model ölçümü
[Ham ölçüm](MUSIC_QUALITY_2026-10-28/benchmark.json): pinli `laion/clap-htsat-unfused` / `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`, CPU. Beş kamuya açık kayıt, her birinin ilk en fazla10saniyesi; trompet daha kısadır. Beş referans×dört aday için ses sıralaması, aynı adaylarda üç İngilizce tarifle%60karışım. Bunlar80bağımsız test veya doğruluk yüzdesi değildir. Kısmen sıcak önbellekle6,81saniye; soğuk başlangıç performansı değildir.

- Nutcracker ↔ Brahms ses benzerliği0,73357 ve iki yönde ilk sırada.
- Vibe referansında trompet tarifi trompeti, orkestra tarifi Brahms'ı, elektronik davul/bas tarifi Choice'u ilk sıraya taşır.
- **Sınır:** davul/bas tarifi diğer referanslarda Choice'u tutarlı seçmez. Vibe'ın metin skoru0,44848, Choice0,42806; semantik sınıflandırma kusursuz değildir. Etki artırmak otomatik kalite artışı sayılmaz; varsayılan ağırlık değiştirilmedi.
- Bu küçük set rock, şarkılı blues, Türkçe vokal, mastering farkları, uzun eserler ve kişisel zevk için yeterli doğrulama değildir. İnsan kör tercihleri henüz alınmadı.

## Kaynak, lisans ve alınan yaklaşım
Librosa'nın [gerçek örnek veri indeksi](https://github.com/librosa/librosa/blob/main/librosa/util/example_data/index.json), [SHA256 registry](https://github.com/librosa/librosa/blob/main/librosa/util/example_data/registry.txt) ve audio yanındaki lisans metinleri incelendi. Kaynak kod alınmadı, bağımlılık eklenmedi; belgeli ses örnekleri ve checksum yaklaşımı kullanıldı. Vibe ve Nutcracker Kevin MacLeod CC-BY3; trompet Mihai Sorohan CC-BY3; Brahms/US Army Strings kamu malı. Choice'ın yan lisansı **NC** şartlıdır ve3.0/4.0metinleri çelişir: yalnız yerel ticari olmayan test; dağıtım/ürün varlığı yapılmadı. Sesler Git'te yok. Manifest ses adlarını ve doğrulanmış SHA256'yı içerir; indirme otomatik değildir.

## Yeniden çalıştırma ve kanıt
`tools/music-quality-check.py --fixtures <yerel-yasal-ornekler> --model-dir <hazir-CLAP> --output <yerel-sonuc.json>`: ffmpeg/ffprobe PATH'te yoksa açık parametrelerini ver. Modeli veya sesleri indirmez; sabit ses hashlerini kontrol eder. Windows mevcut venv ile çalıştırıldı.

- `node --test --test-isolation=none tests/music-listening.test.js tests/music-analysis.test.js`:4PASS. Eskiiş/ID/yazma güvenliği/bozuk dosya/izinli IPC ve iptal sözleşmesi.
- `tests/music-similarity.test.js tests/music-playlist667.test.js tests/assistant-music.test.js tests/music-online.test.js`:8PASS. Ayrı süreçten gerçek ücretli modele istek yok; katalog kontrolleri kontrollü testlerdir.
- Gerçek Windows Electron `tests/electron-music668.smoke.js`: pinli CLAP, gerçek ses oynatımı, gizli adlar,2/2oynatım kapısı, açık tercih sonrası kimlik açılması, diskte kayıt, geçmiş, çalma listesine otomatik yazmama, geniş/dar taşmama. Görüntüler incelendi; örnek profil kişisel değildir.
- `node --check` değişenJS ve Python `py_compile`, `git diff --check`:PASS.
- İlk Node izolasyon koşusu sandbox `spawn EPERM` verdi; mevcut izolasyonsuz hedefli düzenle geçti. İlk benchmark trompetin10saniyeden kısa olduğunu açığa çıkardı; araç gerçek süreyi okuyup `min(10,duration)` alacak şekilde onarıldı. Ürün bugı diye sayılmadı.
- Mevcut11`before-quit` listener uyarısı sürüyor; kapatılmadı.

## Doğrulanmayanlar
Kişisel `start.bat` oturumu, temiz Windows kurulumu, GPU/DRM, yeni canlı internet kalite kıyası, canlı asistan model çağrısı ve insan zevk değerlendirmesi koşulmadı. CI açık kalır; sonucu beklenmez. Kişisel ana kopya dosyaları ve açık uygulama korunur. Bu paket kaliteyi ölçülebilir yapar; uzman müzik etiket modellerini tamamladık veya en iyi öneri motorunu kanıtladık anlamına gelmez.
