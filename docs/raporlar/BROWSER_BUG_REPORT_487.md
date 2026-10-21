# BROWSER_BUG_REPORT_487 — Doğal ses metni ve ölçülen konuşma kalitesi

Kapsam: kullanıcının seçtiği 1, 2, 3, 8. Kod: 0736cb99c9429d5aa0e1cf8b7a93ae34e8882e37.
Dal: codex/dub-natural487. PR: https://github.com/dorukakindev/whisper-browser/pull/459
Önceki 485/486 teslimleri bu dalda korunur; master'a merge yapılmadı.

## Özellikler ve doğrulanan sorunlar

1. **Doğal konuşma ikinci geçişi:** SRT→Ses'te yeni, kalıcı aç/kapat seçeneği.
   Mevcut seslendirmeye uygun çeviri ilk geçişini korur; ses üretimi sırasında
   seçili sağlayıcıyla Türkçe konuşma düzenlemesi yapar. Ek süre/API kullanımı
   arayüzde açıklanır. En fazla %25 uzama; sayı/tekrar/olumsuzluk ve bazı özel ad
   korumaları. Bunlar semantik eşdeğerlik ispatı değildir. Geçersiz sonuçta metin
   korunur; sağlayıcı yapılandırma/HTTP hatasında sonraki parçalarda yeniden
   aynı servise yüklenilmez, tek uyarı verilir. Elle uygulanmış metin AI'dan geçmez.
2. **Gerçek süre geri bildirimi:** İlk okumanın son işlem sonrası süresi modele
   measuredSeconds olarak gönderilir. Hedef sözcük sayısı ölçülen oranla hesaplanır.
   Tek alternatif gerçek ses üretilir; daha kısa ve akustik ölçütü daha kötü olmayan
   aday kabul edilir. Başarısızsa tam okuma ve mevcut video yavaşlatma seçimi kalır.
   Sayılar normalleştirilmeden önceki metin editöre gönderilir: sayısal korumalar
   yazıyla genişletme nedeniyle kaybolmaz. Elle metin burada da AI ile değiştirilmez.
3. **Görünen/okunan metin ayrımı:** quality grupları displayText/text taşır;
   zaman çizelgesi ikisini gösterir. Türkçe Dr./Prof., bazı birimler ve belirsiz
   olmayan sayılar yalnız ses metninde açılır. Tarih/saat/sürüm/başında sıfır bulunan
   kimlikler ve ekli sayılara dokunulmaz. Proje dub.srt'si görünen, speech.srt'si
   okunan metindir; orijinal SRT ayrıca korunur. Taşıma/yeniden açma testi geçti.
4. **Ses son işlemi:** Kenarda yalnız çok düşük seviyeli sessizlik kırpılır,
   60 ms pay korunur. İç duraklar kesilmez. Aktif ses üzerinden en fazla ±3 dB
   seviye ayarı (tepe güvenliği daha çok azaltabilir) ve 3 ms sınır fade'i.
   Mevcut nihai loudnorm korunur. Yeni cache protokolü eski ham parçayı kullanmaz;
   endpoint/model/editör protokolünün gizli içermeyen hash'i de kimliğe katılır.
5. **Arka plan kısma:** Nihai sesin 20 ms enerji pencerelerinden konuşma etkinliği
   aralıkları çıkarılır. Önizleme, browser/player ve export aynı aralıkları kullanır;
   uzun cümle içi duraklarda ortam geri gelir. Bu enerji ölçümüdür; konuşmacı/müzik
   sınıflandırıcısı değildir. Eski çıktılarda önceki cümle penceresi davranışı sürer.
6. **Gerçek üretimde bulunan sayı doğrulama yanlış pozitifi:** Beklenen
   “on iki virgül beş” ve Whisper “12,5” tokenları farklı sayılıyordu; doğru
   okuma review oluyordu. Eşdeğer sayısal ifadeler artık normalize edilir;
   eksik/değişmiş ve tekrar eden sayı sayıları ayrıca kontrol edilir.

## Kanıtlar

- Hedefli Node: dub-service, dub-generator-ui, dub-workspace, dub-workspace-ui,
  dub-text-guard, browser-dub-audio, player-dub-ui, settings-ui-persist-roundtrip,
  speech-translation-ui, package-integrity, ui-locale, ui-locale-dedupe geçti.
- Determinism ratchet değişmedi: random0/0, aux11/11, sleep21/21, wallclock13/13.
- Python test_dub_finish4; test_dub_generation_quality4; test_dub_quality4 geçti.
  Kontrollü motor/AI testi ikinci geçişin TTS öncesinde olduğunu, gerçek sürenin
  iletildiğini, elle metinlerin kilitlendiğini ve bozuk/eksik parçaların kurtarıldığını doğrular.
- backend/test_dub_export.py2: gerçek FFmpeg WAV/MP4/çift kanal, kare/ses senkronu geçti.
- JS syntax ve Python py_compile, git diff --check geçti.
- Ayrı geçici Chrome profilinde8 yüzey (TR/EN, koyu/açık,1400/720):0 kontrast ve0
  script hatası. Ek1 TR/koyu zaman çizelgesi ekranında iki metin ayrı doğrulandı. Sentetik ekran görüntüleri docs/images/dub-natural487*.png.
- **Gerçek VoxCPM2 GPU örneği:** 15 adım,4 paralel kapasite,1 cümle.
  “Dr. Kaya 12,5 km yürüdü.” → “Doktor Kaya on iki virgül beş kilometre yürüdü.”
  Nihai konuşma5,01 sn;8 sn kaynak penceresi;0 hızlandırma/kırpma/taşma.
  Whisper small CPU doğrulama: passed, benzerlik1,0, eksik sayı/olumsuzluk/tekrar yok.
  Son koşu model12,172 sn +referans2,140 sn +üretim/doğrulama13,594 sn;
  1 deneme,0 tekrar. Özgün ses/ref/loglar Git'e konulmadı.

## Sınırlar

Gerçek sağlayıcıya istek atılmadı: AI düzenleme kontrollü sözleşme testidir,
canlı çeviri kalitesi iddiası değildir. Gerçek üretim sayı açma/ses son işlem/
ASR hattını doğrular; bu kısa örnek uzun videoların mükemmel seslenmesi demek değildir.
Windows CI başarılı: run39260824743/job118087679023,7m23s,HEAD0736cb99; tam test paketi/Windows Electron bridge/syntax geçti.
https://github.com/dorukakindev/whisper-browser/actions/runs/39260824743/job/118087679023?pr=459
Ubuntu ayrıca beklenmedi. start.bat/install.bat değişmedi; ana Windows
checkout master957bbfe9 korundu, üretim profilinde yeniden başlatma yapılmadı.
Yeni paket/model/indirme yok. Önceki gerçek sesler yeniden üretilmedikçe yeni
metin/etkinlik bilgisine sahip olmaz. Tam yerel npm test gereksiz tekrar edilmedi.
