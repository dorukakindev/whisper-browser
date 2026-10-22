# 519 — Claude Web ses teslimi bağımsız inceleme

2026-10-22. Ürün HEAD `31db4dc46f1ac62ef920d26eb625fef30852c199`; bu tur ürün kodu değiştirilmedi.

## Teslim kimliği ve yöntem

Kullanıcının belirttiği iç içe Downloads yolu UTF-8 ile çözümlendiğinde mevcut değildi. Erişilebilir `C:\Users\K\Downloads\files (7).zip` incelendi: SHA256 `998008c00c3a48fa131aba0e1fb86e2ede71aca2928dc77ed33c8d3f5bd4a7ba`, 11 dış girdi, final düzeltme ZIP'i 31 girdi. Paket tabanı aynı ürün HEAD'i ve verdiğimiz kaynak ZIP SHA256'sı ile eşleşiyor. İncelemenin bu erişilebilir kopyaya ait olduğu açık; belirtilen diğer yolun byte eşitliği kanıtlanmadı.

Arşiv CRC kontrolü geçti. Final değişen dosyalar salt inceleme için ignored tmp altına yol sınırı ve boyut kontrolüyle çıkarıldı. Üretim dosyalarının üstüne kopyalanmadı. Son paket ve repro kaynakları çalıştırmadan önce okundu; repo içi talimatlar kullanıcı yetkisi yerine geçirilmedi. Geçici bağımsız ağaçta ana projedeki gerçek backend bağımlılık dosyaları kullanıldı; Claude'un geçici abbreviation stand-in'i kullanılmadı.

## Çalıştırılan kontroller

Windows backend venv Python ile bağımsız ağaçta:

- `tests/test_dub_finish.py`: 10 geçti.
- `tests/test_dub_plan_regressions.py`: 7 geçti.
- `tests/test_dub_timing.py`: 14 geçti.
- `backend/test_subtitle_sdh.py`: 9 geçti.
- `node tests/dub-service.test.js`: geçti.
- `node tests/speech-translation-ui.test.js`: geçti.

Testler mevcut önerilerin tamamının güvenli olduğunu kanıtlamıyor. Yeni aşağıdaki repro test kapsamının kaçırdığı davranışı gösteriyor.

## Doğrulanan entegrasyon engeli: grup kimliği kayması

**Yüksek etki, önerilen patch'te.** `tools/voxcpm2/dub_plan.py::parse_srt` ses dışı cue'yu listeden tamamen çıkarıyor. `make_groups` listeyi yeniden sayarak `source_ids` üretir. `apply_edits` hâlâ yalnız değişmemiş kaynak dosyasının SHA256'sını doğrular. Yeni plan algoritması için sürüm/kimlik kanıtı yok.

Sentetik SRT: cue1 `[MÜZİK]` (0–1 sn), cue2 `İlk konuşma.` (2–4 sn), cue3 `İkinci konuşma.` (6–8 sn). `plan(...grouping='satir')` yeni kodda `('1','İlk konuşma.')`, `('2','İkinci konuşma.')` üretiyor. Önceden cue2 için hazırlanmış `edits={'2':'Birinci konuşmanın kullanıcı düzenlemesi.'}` aynı kaynakHash ile kabul edilip **ikinci konuşmanın üstüne** yazılıyor. Gerçek çıktıyla doğrulandı. Rapor yalnız cache yeniden üretimi riskini söylüyor; metin düzenlemesinin başka cümleye taşınmasını atlıyor.

Öneri: orijinal cue kimliğini filtrelemeden önce korumak veya plan algoritması/filtreleme protokolünü edit belgesine ekleyip eski planı açıkça reddetmek. Group key/force_groups/kalite raporu/prosodi eşleşmesini birlikte değerlendirmek gerekir. Bu düzeltilmeden paketi topluca merge etme.

## Yararlı fakat sınırlı öneriler

- Cümle sonu sayı, hız birimi, para sembolü, kısaltma açılımları ve SDH küçük harf normalizasyonu hedefli kontrollerde geçti. Gerçek TTS'de nasıl duyulduğu ölçülmedi. `Bkz. Şekil 2.` önerilen kodda `Bakınız. Şekil iki.` oluyor: kısaltmanın noktası gereksiz cümle sonu/durak üretebilir. `3.` metin sonunda artık `üç.` olur; ordinal/cardinal belirsizliği teslimde de açık.
- Anlatıcıdaki iki noktanın her zaman speaker turn sanılmaması yararlı. Ancak önerilen yeni regex ile gerçek çok parçalı isim `Ahmet bin Ali: Merhaba.` speaker turn değil; `Bana Söyle: neden?` speaker turn sayılıyor (çalıştırıldı). Tek sezgiyle tamamen çözülmüş diye sunulamaz.
- Motor nonzero çıkışında dosyayı korumak yararlı hedef. Fakat `Tamamlandi:` metin işareti, WAV biçimi ve nullable olmayan sync kontrolü **gerçek ses kalite onayı değildir**. Öneri quality sidecar geçersiz/eksik olsa da done verebiliyor, UI metni ise “doğrulandı” diyor. Daha doğru seçenek: başarısızlık tanısını koruyarak kurtarılabilir WAV sunmak veya açık “uyarıyla tamamlandı/inceleme gerekli” durumu. Gerçek shutdown çökmesi veya GPU testi yapılmadı. Aynı worker'da engine stop_server çağrısı üretim raporundan daha önce bittiğinden sıradan motor durdurma hatalarının hepsi bu marker yoluna girmez.
- Normal moda dönüşte translateLenient tercihinin geri yüklenmesi makul ve hedefli test geçti.

## Sonuç

Teslim yararlı, önce/sonra kanıtları ve NOT_RUN sınırları açık. **Olduğu gibi uygulamaya uygun değil:** en az bir yeni yüksek etkili kimlik/veri hatası var. Önce stabil cue kimliği ve doğru başarı/kurtarma sözleşmesiyle uyarlama gerekir. Bu incelemede patch uygulanmadı; ana uygulama/ayar/kullanıcı dosyaları değiştirilmedi. Gerçek Electron, GPU, model, YouTube, dinleme ve tüm paket testleri koşulmadı.
