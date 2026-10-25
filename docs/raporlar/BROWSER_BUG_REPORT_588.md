# Rapor588 — Aynı sahnede çeviri, telaffuz ve onarım karşılaştırması

25 Ekim 2026. Repo https://github.com/dorukakindev/whisper-browser; dal `codex/dub-scene587`. Başlangıç master `263d72c9c619630b9e193fd50cdbb8c0a32e1264`; bitiş ürün `bb6283e78f25826b3640c5479cec8b0d66458996`. Kullanıcı gerçek kısa sahne üzerinden beş çalışma alanını onayladı. Ana kopyadaki üç kişisel belge değişikliği ve untracked dosyalara dokunulmadı. Bu tur master'a merge yapılmadı.

## Çeviri için doğrulanmış hata

`translation_meaning_issues` para/birim değişimini tanıyordu fakat `translation_blocking_issues` bu işaretleri otomatik yeniden denemeye taşımıyordu. Örneğin `$45 → 45 lira`, `$100 → 100 €`, `60 miles → 60 kilometre` hataları geçiyordu. Tek açık miktar iki dilde de aynıysa, birim/para tek ve farklıysa ve açık dönüşüm/eşdeğerlik anlatımı yoksa bu iki işaret blocking olur. Farklı miktarlı gerçek dönüşümler, aynı birimin çevirisi, çok miktarlı veya eşdeğerlik anlatımları bu dar kanıtla reddedilmez. Genel tarih/birim işaretlerinin hepsi sert kapıya alınmadı.

120 vakalı mevcut korpusta: 58 doğru çeviride yanlış ret **0**, 44 yakalanabilir hatada sızıntı **3 → 0**. Tüm blocking sızıntısı **21 → 18**; kalan 18 argo/hitap kör noktası değişmedi. Korpus beklentileri bu iyileşmeye göre sıkılaştırıldı, eşik gevşetilmedi. Bu, canlı modelin bütün çevirilerinin iyi olduğu iddiası değildir. Aynı sahnenin gözden geçirilmiş 10 Türkçe grubunda yapısal çeviri kapısı ihlali yok; ücretli sağlayıcıya yeni çeviri yaptırılmadı.

## Telaffuz için doğrulanmış hata

Sözlük, standart konuşma açılımından sonra uygulanıyordu. `Dr. Newton` sözlüğe girildiğinde önce `Doktor Newton` olabildiği için kullanıcı eşleşmesi kaçabiliyordu. Şimdi sözlük ham konuşma metnine bir kez, varsayılan sayı/unvan açılımından önce uygulanır. İç bölme, yeniden deneme ve uzun cümle kurtarma aynı hazırlanmış metni kullanır; dönüşüm zincirlenmez. ASR gerçek okunuşu, sayısal kapı özgün metni denetler. Metadata `text` özgün gösterim metnini korur; `pronunciationText` üretilen okunuşu kaydeder. Özgün SRT değiştirilmez.

Sözlük eşleşen grubun cache eki `speech-pronunciation-v2-before-normalization` olur; genel cache sürümü değişmedi, sözlük eşleşmeyen grupların kimliği korunur. CPU testinde `Dr. Newton 5 kitap aldı.` → `Doktor Nyutın beş kitap aldı.`; `Nyutın → OTHER` ikinci kuralı çıktıya tekrar uygulanmaz. Yeni kuralla gerçek GPU üretimi **açıktır**: tüm uygunluk kontrollerinde başka bir compute işi görüldü, son kontrolde yaklaşık 7761 MiB boş bellek vardı. Kullanıcının işi durdurulmadı veya yarışan TTS başlatılmadı.

## Onarım öncesi/sonrası dinleme

Stüdyonun sonuçlar bölümünde, aynı oturumda aynı SRT'nin yeniden üretiminden sonra **Yeni grubu dinle / Önceki grubu dinle** yan yana görünür. İki sürüm aynı kaynak anahtarını kendi `audioStart/audioEnd` aralığında çalar; yeni sesin süresini eski ses için kullanmaz. Önceki sürüm bellekte yalnız bir adet tutulur, dosyası kopyalanmaz. Kaynak değişiminde temizlenir, başka SRT ile karşılaştırılmaz, üretimde kilitlenir. Kapanma/grup değişimi/başka önizleme mevcut dinlemeyi durdurur. Bu kalıcı bir sürüm arşivi değildir.

`review_scene.py` ayrıca iki mevcut WAV, yan dosyaları, yerel video kesiti ve kaynak SRT'den salt okunur yerel dinleme sayfası oluşturur. Kaynak/Türkçe cümleleri, yapısal çeviri işaretlerini, dalga biçimini, komşu ses yüksekliğini ve her sürümün senkron haritasını içerir. Üretim uygulamasının `DubSyncMap` doğrulama/haritalama kodunu yeniden kullanır. Kaynak video sesi kapalıdır; duygu veya doğallık puanı üretmez. EN/TR arayüzü, yeni çıktı klasörü koşulu ve en fazla 10 dakikalık sahne sınırı vardır. Kullanım `tools/voxcpm2/README.md` içinde. Ham video/ses/rapor/kişisel yol Git'e eklenmedi.

## Gerçek sahne ve ses kanıtı

Rapor585'ten mevcut NASA kamu konuşması, 102,6–227,6 saniye arası **125 saniyelik kesit** kullanıldı. Kaynak https://ntrs.nasa.gov/citations/19940010921. Özgün örnek ile önceki turda yalnız `9,10,11,12` grubunun yeniden üretildiği gerçek WAV karşılaştırıldı; bu tur yeniden GPU üretimi yapılmış gibi sayılmadı.

- İki gerçek WAV: 127,0053125 saniye, peak yaklaşık0,794342, dijital kırpılma0, sonlu değerler.
- Komşu grupların etkin örnekler üzerinden RMS düzeyi farkı: eski en fazla0,86898dB, onarılmış0,87019dB. Belirgin düzey sıçraması gözlenmedi; bu ölçüm perde/duygu/ton devamlılığını veya insan doğallığını kanıtlamaz. Ses/ton varsayılanları değiştirilmedi.
- Onarılmış dosyada eski kalite kaydına göre review grupları3→2. Bu değişim önceki turdaki tek grup onarımının sonucudur; yeni onarım iddiası değildir.
- Bu tur son dosyada CPU ASR yeniden çalıştırıldı: similarity0,9479, omission/insertion boş, kayıp/ek sayı yok, olumsuzluk/birim/anlam işareti yok; **Venüs** adı için review sürüyor. `passed=false` korunur; daha iyi görünsün diye denetim susturulmadı.
- Gerçek Windows Electron yerel sahne oynatıcısında iki WAV çözümlendi ve kaynak video173 kare çizdi. Ölçüm anı audio30,679868 / video30,654597: yaklaşık25ms fark. Oynatma/durdurma ve eski-yeni seçimleri geçti. Ses dışarı verilmedi; bu bir insan kulağıyla dinleme veya tüm sahne boyunca en kötü sapma ölçümü değildir.
- Ses dosyası SRT sonu+2sn fallback ile127sn; video125sn. Fazladan alan sessiz kuyruktur; bu çalışma gerçek video süresinin uygulamaya aktarımını doğruladığı iddiası taşımaz.
- Bu kaynakta dublajla karıştırılacak müzik yok; müzik/ambiyans dengesi bu örnekle değerlendirilmedi.

Yerel özel kanıtlar `tmp/scene587/`: `index.html`, `review.json`, önceki/sonraki WAV, kaynak kesit, `final-check.json`, `playback-evidence.json`, iki ekran görüntüsü. Bu klasör ignore edilmiştir. Eski kaynak üretim kayıtları `tmp/quality585/` altında korunur.

## Değişen dosyalar ve kontroller

- `backend/sentence_translation.py`: dar, kanıtlı para/birim değişimi engeli; `test_speech_quantity_swap.py` ve `test_meaning_loss_eval.py`: yanlış ret/dönüşüm sınırı ve iyileştirilmiş korpus metriği.
- `backend/eval_meaning_loss.py` ve korpus testi: görülen açık dosya ResourceWarning'lerini context manager ile giderme.
- `tools/voxcpm2/dub_pronunciation.py`, `altyazi_oku.py`, `backend/test_dub_pronunciation.py`: normalleştirme sırası, tek geçiş ve özgün metin/cache sözleşmesi.
- `src/renderer/dub-generator-ui.js`, `index.html`, `media-experience.css`: sınırlı önceki ses ve temaya uygun iki dinleme düğmesi.
- `tests/dub-generator-ui.test.js`, `electron-dub-runtime.smoke.js`: eski/yeni doğru aralığı, kapanma/kilitler ve EN/TR gerçek görünüm.
- `tools/voxcpm2/review_scene.py`, `scene-review.js/css`, `backend/test_scene_review.py`, README: yeniden kullanılabilir yerel sahne incelemesi ve yan dosya/dalga biçimi doğrulaması.

39 hedefli Python testi, Node servis/UI/kaynak geri yükleme/CSP/preload kontrolleri, JS/Python syntax ve diff kontrolleri geçti. Native app UI fixture testinin son koşusu exit0: `.uiprev/dub-runtime/1792955471865-4184`; koyu TR ve açık EN/%125 görüntüleri incelendi. Gerçek sahne oynatma ayrı yerel pencerede exit0; dar700px/%125 taşma kontrolü ve görüntü incelendi. Kontrollü UI olayları gerçek GPU kanıtı sayılmaz.

Yeni bağımlılık/kurulum yok. start.bat/install.bat ve CUDA/model kurulumu değişmedi; kişisel açık uygulama kapatılmadı. Tam suite, ücretli API, yeni GPU sözlük üretimi ve insan dinleme tercihi yapılmadı. CI açık kalacak, sonucu beklenmeyecek. Sonraki kabul: GPU boşken aynı kısa sahnede yeni sözlük üretimi, ardından kullanıcının perde/duygu/doğallık ve gerekirse müzikli örneği dinlemesi. Bu kanıtlar gelmeden varsayılan ses parametreleri iyileşti diye değiştirilmez.
