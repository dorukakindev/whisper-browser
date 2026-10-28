# Rapor 724 — Hazır metin seslerini yeniden açma ve dar sonuç düzeni

## Sorunlar ve sonuç
1. Metin stüdyosu üretim WAV/iş kayıtlarını diske yazmasına rağmen uygulama yeniden açıldığında önceki sonuca ulaşacak bir arayüz sunmuyordu. **Son üretimler** bölümü son20tamamlanan işin adını/tarihini, örnek-tam üretim ayrımını ve işlem süresini gösterir. **Bu sesi aç** aynı WAV'ı açar; yeni metin/ayarlar değişmez ve motor başlamaz.
2. Sonuç ve geçmiş kartı eklenince dar düzende grid'in500px satırı, kendi yüksekliğini aşan metin/sonuç içeriğinin sonraki ayar satırına taşmasına yol açtı. Yalnız yatay taşma assertion'ı bu görsel hatayı yakalamadı. Native ekranla doğrulandı; dar düzen doğal yükseklikli flex sütuna geçti, sabit içerik küçülmez. Sonuç ses kontrolleri kendi kartı içinde, ayar alanı metin/sonuçtan sonra yerleşir.

## Dosyalar ve sözleşme
- `src/text-voice-history.js`: app userData altında version1 `text-voice-history.json` yalnız20iş kimliği tutar. İlk indeks yokluğunda mevcut Metin iş klasörlerinin en son100 kaydından en çok20tamamlanmış sonuç alınır; klasör envanteri2000adayla sınırlıdır. Bütün tarihi kapsadığı iddia edilmez. Yeni kayıt en başa gelir, aynı kimlik tekilleşir.
- Her açmada mevcut job.json/request.json tekrar okunur: text-UUID, done, text-kind, aynı çıktı yolu, kendi çıktı kökü, ad-kimlik eşleşmesi, symlink reddi ve gerçek WAV yapısı doğrulanır. Boyut sınırları32/64KiB, indeks16KiB. Başarısız/iptal/bozuk/silinmiş sonuç hazır diye listelenmez. Dosya yetkisi yalnız doğrulanmış açma isteğinde verilir.
- `src/text-voice-studio.js`: mevcut yetkili dub:textVoice içine history/open-result eylemleri. Başarılı işin summary yazımından sonra kimliği indekse ekler; indeks yazımı başarısızsa WAV başarısını bozmadan ayrı uyarı gönderir.
- `src/renderer/text-voice-studio.js`/CSS: temalı açılır geçmiş/sonuç dinleme;20sonuçlu seçim, EN/TR yerel tarih, işlem süresi, metin/ayar değişmezliği. Liste seçimi kendiliğinden ses çalmaz veya üretim başlatmaz. Dosya açılmadan kaybolursa hata/listeden çıkarma; aynı eski sonuç kartı temizlenir. Mevcut farklı hazır çıktı korunur.
- `tests/text-voice-studio.test.js`: gerçek geçici dosyalarla yeni servis restore, indekssiz mevcut günlükten alma, iptal dışlama, bozuk WAV ve kök dışı yönlendirme reddi. Mevcut engine stub testi yeni model kalitesi değildir.
- `tests/electron-text-voice.smoke.js`: gerçek üretim bitişi/iptalinin listeyle bağlanması. Yeni `tests/electron-text-results.smoke.js` ayrı bir Electron sürecinde gerçek üretilmiş WAV'ı açar; yalnız repo .uiprev/text-studio sentetik profillerine izin verir.

## Testler ve gerçek kanıt
`node --test --test-isolation=none tests/text-voice-studio.test.js tests/dub-service-warm-start.test.js tests/ipc-parity.test.js`:4alt test PASS; JS syntax/diff PASS.

Gerçek Windows `electron-text-voice.smoke --real-generation` PASS: ilk kısa iş kurulu motorun mevcut parça cache'inden birleştirme/normalizasyonla tamamlandı. **Yeni GPU sentez kabulü sayılmaz.** İkinci uzun iş gerçek nano-vLLM modelini yükleyip sentez başlangıcına ulaştı, Durdur ile cancelled; geçmişte yalnız ilk başarı kaldı. Gerçek çıktı WAV decoder/metadata yükleme PASS.

Ardından tamamen yeni Electron süreci aynı sentetik profil/Downloads ile açıldı: önceki WAV yeniden üretmeden decode edildi; yeni37karakterlik metin değişmedi. WAV kontrollü olarak geçici yeniden adlandırılınca open-result reddi ve hazır listeden çıkarma PASS; test sonunda WAV geri kondu. Kişisel dosyaya dokunulmadı.

[Restoration kabulü ve kutu ölçümleri](evidence/R724/restoration.json), [koyu Türkçe](evidence/R724/restored-history-tr.png), [açık İngilizce125%](evidence/R724/restored-history-en-light-125.png). Gerçek ekranlar açılıp incelendi.1360×1000TRkoyu ve1000×950/%125→800CSS ENaçık; historybutton46CSSpx; yatay taşma yok; çıktı kartı ses kontrollerini içerir; metin alanı bitişi<=ayar sütunu başlangıcı. İlk çakışan ekran başarılı görsel kabul diye sayılmadı, ölçüm ve CSS onarıldı.

## Tasarım, kaynak, sınırlar
Full inceleme bu geçmiş ve sonuç ekranıyla sınırlı: mevcut tipografi/palet/yuvarlatılmış kontroller,40+px hedef, açık-koyu tema; dar yerleşim kart taşmasını onarır. Mevcut modal/renk geçişleri korunur; yeni dekoratif animasyon yok. Ekran okuyucu, yavaş hareket ve renk kontrast ölçümü yapılmadı.

Mevcut dub:latest/validVoiceOutput/atomicWriteFileSync tasarımları yeniden kullanıldı; dış repo kodu, yeni bağımlılık veya yeni IPC kanalı yok. Bu bir üretim sonucu açma özelliğidir; yarım iş/GPU kurtarma/backup genişletilmedi. İndeks metin ve API anahtarı içermez. Eski çıktılar taşınmaz/silinmez. Kullanıcı tarafından çıktı kökü dışında taşınan WAV eski kimlikle yetkilendirilmez.

Tam start.bat/install/YouTube/DRM/ücretliAPI/insan ses tercihi/tam npm test/uzunCI yok; CI beklenmedi. Mevcut11before-quit listener uyarısı sürer. Standart üretim logları ve sentetik ekranlar dışında kişisel kayıt yok. P005/P092/P094/P097/P099 ek kısmi kanıt;90hedefin tamamı bitmedi, müzik kapsamı yok.
