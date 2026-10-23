# BROWSER_BUG_REPORT_525 — Eksik çeviri bütünlüğü ve güvenli ses zamanlama geri dönüşü

Tarih: 2026-10-23. Dal: `codex/dub-lifecycle523`; mevcut PR479 genişletilir.
Başlangıç: `6f45b8451fa225bf26bda88fd380ff4bbf230eb6`.
Bitiş kodu: `44fc15f0f75e664cf1731dafc81c2fc51f088dd6`.
Ana master tabanı: `512b16fe5a55ae28d2e1e5205b2fff8543257ce2`.

## İncelenen yollar

Kullanıcı ses için altyazı/çeviri/Whisper/SRT→TTS hattının daha ayrıntılı incelenmesini ve geliştirilmesini istedi. Bu tur eksik çeviriyi tamamlama, korunan elle düzenlenmiş parçalar, cümle önbelleği ve sesin nihai zamanlaması incelendi. İki ürün kökü düzeltildi; ikinci köke açık bir tam-konuşma geri dönüşü eklendi. Eski CI platform fixture bakımı ayrı tutulur. Önceki Rapor523/524 kodları korunur.

## 525-01 — Korunan ve yeni çevrilen parça karışınca sözcük kaybı

Kaynak iki cue: `Please open` / `the door.`. İlk cue'nun önceden tamamlanmış metni `Lütfen`. Model bu kilidi bilmeden `Lütfen kapıyı` / `açın.` döndürüyordu. Uygulama ilk metni koruyup yalnız ikinciyi alınca fiili sonuç `Lütfen açın.` oluyordu; `kapıyı` kaybolmasına rağmen completed=[0,1] dönüyordu. İkinci editorial geçiş de aynı uyuşmazlığı kaçırıyordu. Üstelik önbelleğe fiili çıktı yerine modelin farklı tam parça dağılımı yazılıyor ve sonraki koşum farklı metin döndürebiliyordu.

### Geliştirme

- Eksik tamamlama isteğindeki korunan ID, `items.locked_translation` ile hem ilk çeviriye hem ikinci gözden geçirmeye açıkça bildirilir. Prompt bu metnin aynen kalmasını ve geri kalan cümlenin ona göre tamamlanmasını ister. İçerik yine güvenilmez altyazı verisidir.
- Grup kabulü/önbellek okuma/refine aynı kilit tutarlılığını denetler. Normal çeviride lenient açık olsa bile kilit ihlali kabul edilmez. Bu, bütün cümleyi bağımsız anlam modeliyle doğrulama iddiası değildir; uygulamanın gerçekten kullanacağı parçalarla modelin kabul edilen cümlesinin uyuşmasını sağlar.
- Grup cache anahtarına korunan parçaların grup-içi konumu ve NFC/boşluk-normalize metni katılır. Farklı elle düzeltilmiş parça ve kilitsiz çeviri aynı onaylı kaydı paylaşmaz. Kilitsiz eski cache anahtarı değişmez; mevcut kayıtlar silinmez.
- Sağlayıcı kilide uymuyorsa mevcut sınırlı kurtarma denemeleri geçerli kalır. Hiç yeni tutarlı çeviri yoksa None/hata ile mevcut dosya korunur; bozuk cümle yeni başarılı çıktı diye yazılmaz. Kodun zaten var olan bu fail-closed davranışı değiştirilmedi.

### Kanıt

`backend/test_pipeline_525.py` içinde iki temel kontrol eski kodda başarısızdı: yanlış tamamlandı durumu ve doğru birleşik hedef sözcüklerin kaybı. Yeni kodda doğru `Lütfen` / `kapıyı açın.` yanıtı ilk+review geçişinden geçer. Aynı kilitli koşum tekrarlandığında istek sıfırdır; farklı korunan parça yeni istek doğurur ve kilitsiz sonraki koşum bu cache'i kullanmaz. Ayrı test normal/lenient modda kilit ihlalinin reddini doğrular.

## 525-02 — Son tempo dönüşümü süresiz bekleyebilir veya bütün hazır konuşmayı kaybettirebilirdi

`tools/voxcpm2/dub_timing.py:fit_to_window` FFmpeg'i süre sınırı olmadan çalıştırıyordu. Konuşma parçaları hazır olsa bile son hızlandırma süreci takıldığında nihai WAV aşaması ilerlemeyebilirdi. FFmpeg hatasında video-yavaşlat modunda da hazır konuşma için kullanılabilir geri dönüş yoktu; tüm zamanlama hata veriyordu.

### Geliştirme

- FFmpeg artık `-nostdin` ve parçanın süresine bağlı30–180 saniyelik üst sınırla çağrılır. Python subprocess timeout süreci sonlandırıp bekler; başarılı çıktıdan örnek hızı, mono kanal, dolu ve finite örnekler doğrulanır. Ara dosyalar kapanışta temizlenir.
- Yalnız konuşmayı kesmeden video süresini uzatabilen `overflow=uzat`/adaptive yolunda timeout veya dönüşüm hatası olursa orijinal waveform örnekleri aynen tutulur. Tempo1, kesilen frame0 olarak raporlanır; video daha fazla yavaşlayabilir.
- `tempo_error` raporu ve `tempoFallback` grup işareti kaydedilir; hazır görünen grup review olur. Mevcut generic inceleme akışı otomatik bağlamayı durdurur. TR/EN uyarı kullanıcıya konuşmanın korunup videonun daha yavaş oynayabileceğini anlatır.
- Sabit/strict zamanlama sınırları gevşetilmez; hata bu modlarda hâlâ hata verir. Varsayılan maxSpeed değiştirilmedi: maxSpeed1 yolunda FFmpeg hızlandırma zaten çalışmaz. Bu geri dönüş özellikle hızlandırmanın açıldığı adaptive işlerde devreye girer.

### Kanıt

Kontrollü FFmpeg çağrısı deadline yokluğunu eski kodda yakaladı; başarısız exit eski kodda RuntimeError veriyordu. Yeni timeout denemesinde orijinal16000 örnek byte-değerleri korunur, rapor timeout der, grup review olur ve tmp dosyaları temizlenir. Başarısız dönüşüm için aynı koruma ve strict hata davranışı doğrulandı. Gerçek Windows FFmpeg ile2s sentetik220Hz mono ses1.25× hızlandırıldı; sonuç1.599s, tempo_error yok ve tmp dosyaları temizdi. Bu gerçek konuşmanın doğallık ölçümü değildir.

## CI sonucu ve platform testi bakımı

Önceki6f45b845 head için [Windows CI](https://github.com/dorukakindev/whisper-browser/actions/runs/39938105294/job/120362819970) tamamlandı ve geçti. [Ubuntu CI](https://github.com/dorukakindev/whisper-browser/actions/runs/39938105294/job/120362820240) tamamlandı ve tek dosyada başarısızdı: `backend/test_text_studio.py` fixture'ı yalnız `.venv/Scripts/python.exe` yaratırken ürün Linux'ta doğru biçimde `.venv/bin/python` bekliyordu. Test artık ürünün gerçek platform sözleşmesine uygun sahte executable oluşturur. Test silinmedi/atlanmadı; Windows'ta geçti. Bu tur Linux runtime çalıştırılmadı; yeni uzak CI'nin geçeceği önceden ilan edilmez. Önceki CI'nin kaba ENOENT tanı logları testte beklenen fixture davranışıdır, ek ürün bugı sayılmadı.

## Doğrulama

- Yeni `backend/test_pipeline_525.py`:5 hedefli kontrol geçti (kilitli cümle, lenient, cache/review; timeout ve dönüşüm hatası).
- `python -m unittest test_pipeline_525 test_pipeline_524 test_speech_translation test_dub_completion test_dub_flowing_groups` backend dizininden ilk koşum33 geçti; bu koşumdan sonra eklenen normal/lenient kontrolü yeni dosyanın5/5 son koşumunda geçti. Sayılar ayrı koşumlardır; toplanıp benzersiz test diye sunulmaz.
- `python -m unittest tests/test_dub_timing.py tests/test_dub_quality.py tests/test_report521_regressions.py`:29 geçti.
- Mevcut4 doğrudan transcribe kontrolü: cache tekrar kullanımı, doğal cümle sırası/orijinal zamanlar, sadece sahip olunan partial temizliği ve API sırasında kullanıcı düzenlemesini koruma geçti.
- Son Node hedefleri dub-service, ui-locale ve speech-translation-ui:3 dosya geçti; locale içinde14 assertion. Yeni warning'in renderer'a ulaşması ayrıca dub-service fixture'ında denetlendi.
- `backend/test_text_studio.py`:1 geçti. Gerçek kısa FFmpeg dönüşümü ayrıca geçti.
- Değişen ürün JS node --check, Python py_compile ve git diff --check geçti.

Tam npm test tekrarlanmadı. Normal start.bat, gerçek Whisper/GPU/TTS üretimi, canlı sağlayıcı, YouTube/DRM hesabı, uzun doğal konuşma dinleme ve gerçek süreç takılması bu tur çalıştırılmadı. Model cevapları kontrollü fixture'dır; doğal çeviri/ses kalitesi kanıtı değildir. Süre aşımı testte kontrollü tetiklendi,180 saniye beklenmedi. Görünüm geometrisi/CSS değişmedi; UI jsdom ve locale kontrolüdür. Yeni bağımlılık/model/kurulum/ayar şeması yok. Yeni CI arkada açık kalır; master'a otomatik merge yapılmaz.
