# BROWSER_BUG_REPORT_524 — Whisper → ses çevirisi → SRT → dublaj planı

Tarih: 2026-10-23. Dal: `codex/dub-lifecycle523` (açık PR479 genişletildi).
Tur başlangıcı: `f33e0274a6686d8e62be733d27d88b1160056da3`; master tabanı `512b16fe5a55ae28d2e1e5205b2fff8543257ce2`.
Ürün düzeltme commit'i: `84c909f6a229cdff94627bc10a56e60a2e8d9a06`.
Son kod/test commit'i: `78d5192dde44bb6594518c702f92d4544e881d47`.

## Kapsam ve sonuç

Kullanıcı özellikle ses için altyazı, çeviri, Whisper transcribe ve altyazıdan sese hattının incelenmesini istedi. Üç hata ailesi doğrulandı ve düzeltildi. Üç ayrı dosya yolu çakışması aynı adlandırma köküne bağlıdır; sayı şişirmek için ayrı sayılmadı. Önceki Rapor523 düzeltmeleri bu dalda korunur; ana kopya değiştirilmedi.

## 524-01 — Whisper + ses çevirisi normal çevirinin üzerine yazıyordu

`translate_existing_subtitle` konuşma varyantını dosya adında kullanırken, doğrudan Whisper/transcribe çıktı yolu `translate_variant_label` alanını yok sayıyordu. `video.tr.srt` hem normal hem ses çevirisi için hedef oluyordu. Çift dilli çıktılar da her iki giriş yolunda ortak `video.dual.srt` kullanıyordu. Ses çevirisi seçmek normal çeviri dosyasını değiştirebilirdi.

`translation_output_labels` iki girişin ortak adlandırma sözleşmesi oldu. Normal çıktı adları korunur; konuşma çıktıları örneğin `video.tr.speech.srt`, çift dilli konuşma `video.tr.speech.dual.srt` olur. Dil/forced gibi niteleyiciler ve özel varyant adları aynı kurala tabidir. Tam/kısmi ad ayrımı ve kaynak üzerine yazmama korumaları korunur; kaynak JSON kelimeleri çeviri sözcükleri gibi etiketlenmez.

Kanıt: gerçek parser, transcribe kontrol akışı ve çıktı transaction/yazıcıları; sentetik Whisper segmentleri ve kontrollü çeviri cevabı. Normal çıktı önce yazıldı ve byte'ları saklandı; konuşma üretimi ardından aynı dosya değişmemeli assertion'ı eski kodda başarısızdı. Normal ve konuşma dual yolu eşitsizliği de eski kodda başarısızdı. Düzeltmeden sonra iki kontrol geçti. Done descriptor dili `tr` ve durumu `complete` olarak kaldı.

## 524-02 — Tamamlanan ses çevirisinin eski partial dosyaları kalıyordu

`cleanup_owned_partial_translation_artifacts` target parametresini hem dosya öneki hem metadata hedef dili olarak kullanıyordu. Çağıran `tr.speech` veya `tr.forced.speech` verirken metadata `targetLanguage=tr` içerir; sahiplik hiç doğrulanmaz ve partial temizlenmezdi.

Dosya etiketi ve gerçek hedef dil ayrıldı. Dual temizliği de konuşma varyantının kendi dual adına bağlandı. Kaynak hash/kimlik ve izin verilen dosya biçimi kontrolleri değişmedi. Artık tamamlanan konuşma çevirisine ait `.partial.srt`, metadata ve konuşma dual partial temizlenir; normal çevirinin partial/dual dosyaları aynen kalır. Sahipliği belirsiz eski dosyalar topluca silinmez.

Kanıt: önce bir cue'su başarısız konuşma çevirisi yazıldı; ardından eksikler tamamlandı. Eski kodda ses partial dosyası hâlâ vardı. Yeni kodda bu dosya ve metadata kalktı; normal partial ve normal dual sentinel byte'ları korundu. Mevcut normal çeviri temizliği/yabancı dosya koruma regresyonu ayrıca geçti.

## 524-03 — Olumsuz emir ve zorunluluk tersine dönebiliyordu

`safeShortening` geçmiş/şimdiki/gelecek olumsuzluklar için bazı kontroller taşırken `dokunmayın → dokunun`, `çalıştırmayınız → çalıştırınız` ve `etmemelisiniz → etmelisiniz` dönüşümlerini kabul ediyordu. Bu hem doğal söz dizimi düzenlemesi hem süreye göre kısaltma yolunu etkiler.

Ses kontrolü `speech_check` de uzun metindeki aynı tersine dönüşü toplam kelime benzerliği yüksek diye kaçırıyordu. Ölçülen eski örnekte similarity0.9545, semantic_mismatch=false ve review=false idi.

İki kapıya açık olumsuz emir/olumsuz zorunluluk biçimlerinin korunması eklendi. Hatalı düzenleme reddedilince özgün metin korunur. ASR karşılaştırmasında bu kanıt farkı inceleme gerektirir; otomatik metin silme veya konuşma kesme yetkisi değildir. Sözcük sırasını değiştirip olumsuz fiili koruyan örnekler kabul edilir, aynı metin kendisiyle karşılaştırıldığında review olmaz. Bu sınırlı biçimsel kanıttır; bütün Türkçe olumsuzlukları çözen morfolojik çözümleyici veya anlam eşdeğerliği ispatı değildir.

Yeni kontrollerin önceki zayıf onaylı üretim parçalarını kullanmaması için ses parçası önbellek kimliği `dublaj-ses-v14-negative-instructions` oldu. Eski dosyalar/çıktılar silinmez ve otomatik yeniden üretilmez; sonraki üretim yeni kimlikle hazırlanır, ilk yeniden üretim daha uzun sürebilir. Metin promptu/model/CFG veya sıcaklık değiştirilmedi.

## Hat boyunca ayrıca doğrulananlar

- 5:00–5:10 kesitli sentetik Whisper işi: .5 saniyelik segment ve kelime başlangıcı özgün videoda300.5 olur. SRT'den TTS planına geçince başlangıç300500ms kalır; çift offset yok.
- SRT/TR yazıcılarından ses planına iki cümlenin tüm metni ve cue kimlikleri taşınır; satır sarma sözcük kaybettirmez.
- Kontrollü çeviri kalite/test cevabı kullanıldı. Bu, gerçek Whisper doğruluğu, canlı çeviri modeli kalitesi veya insan gibi doğal ses kanıtı değildir.

## Kontroller ve sınırlar

- Yeni `backend/test_pipeline_524.py`:4 test geçti; iki çıktı çakışması, partial temizliği, yüksek benzerlikte ters talimat ve ters yöndeki ek olumsuzluk; aynı test akışında SRT→plan ve JSON kelime offset'i. İlk üç çakışma/temizlik repro'su eski kodda3/3 başarısızdı. Eklenen verifier kontrolü iki örnekte eski kodda başarısızdı.
- `tests/report524-negative-instructions.test.js`: natural/fit yanlış önerileri reddetme, değişmeyen metin ve doğal sözcük sırası kontrolü geçti; eski kod ilk yanlış öneriyi kabul ediyordu.
- `python -m unittest test_pipeline_524 test_speech_translation test_dub_completion test_transcribe_helpers_locks` backend dizininden:37 geçti.
- `python -m unittest tests/test_report491_audio.py tests/test_report494_audio.py tests/test_report495_audio.py tests/test_report521_regressions.py`:27 geçti.
- Node dub-text-guard, report524-negative-instructions, speech-translation-ui:3 dosya geçti. Kaynak/çeviri zamanlarını koruma, birleştirme, partial'ın tam çıktıyı ezmemesi, transaction ve normal partial temizliği için5 mevcut backend fonksiyonu doğrudan geçti.
- Değişen JS syntax, üç Python ürün dosyası py_compile ve git diff --check geçti. İlk birleşik unittest komutu yanlış çalışma dizininden import hatası verdi; doğru backend dizininde yukarıdaki37 kontrol tamamlandı. Yeni JSON kontrolü gerçek segment-altı words sözleşmesiyle eşitlendi; kök words varsayımı ürün bugı sayılmadı.
- `backend-sentence-translation.test.js` sarmalayıcısı bu ayrı checkout'ta yerel venv klasörü olmadığı için atlandı; gerçek geçmiş gibi başarılı denmedi. Üstteki Python koşumları ana venv executable'ı ile bu checkout kodunu çalıştırdı.

## Gelmiş önceki CI

Önceki PR head f33e0274 için [Windows işi](https://github.com/dorukakindev/whisper-browser/actions/runs/39936020561/job/120355628382) başarısız geldi. report450 testindeki eski zaman aşımı beklentisi kapanış gelmeden promise reddi bekliyordu; Rapor523'ün close-sahipliği değişikliğiyle çelişiyordu. Bu önceki hedefli seçimde kaçmıştı. Test gerçek require bağlamıyla güncellendi: termination promise'i hiç bitmese de canlı worker sahipliği korunur; child close verdiğinde zaman aşımı hatası tamamlanır. Test silinmedi/eşik gevşetilmedi. Report450 ve523 hedefli Node koşumu22/22 geçti (523 dosyasının kendi içinde7 davranış kontrolü var). Ubuntu son bakışta hâlâ çalışıyordu; sonucu beklenmedi. Yeni head CI için başarı iddiası yoktur.

Normal start.bat, gerçek GPU/model üretimi, YouTube/DRM hesabı ve ses dinleme karşılaştırması yapılmadı. Tam npm test tekrarlanmadı. Yeni bağımlılık/model/ayar şeması yok. UI düzeni değişmedi; mevcut speech UI jsdom kontrolü yapıldı. Açık PR479 güncellenecek; otomatik master birleştirmesi bu isteğin kapsamında değildir.
