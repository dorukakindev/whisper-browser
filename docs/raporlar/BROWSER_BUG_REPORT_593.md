# Rapor593 — Claude nihai denetiminin kodla bağımsız karşılaştırılması

## Sonuç

Bu teslim önceki files.zip araştırma taslaklarından farklıdır ve somut fayda sağlar. Kullanıcının yapıştırdığı nihai metin kaynak ZIP'inin1573dosyasının manifestle doğrulandığını ve mevcut ürün fonksiyonlarının incelendiğini söyler. İlgili gerçek `audit-output-nihai-v2.zip`, kullanıcının Downloads/Yeni klasör(10) klasöründe ayrıca bulundu;35ZIPgirdisi,6teslim belgesi,6probe+ortak yardımcı,ham test kayıtları ve2görüntü gerçekten mevcut,CRCsağlam. Önceki taslaklara ilişkin Rapor592 kararı bu ayrı nihai teslimi geçersiz kılmaz.

Yerel karşılaştırma HEAD `1687e2b625f9187f2c3220ffa04352a1dad25b7b`; Claude snapshot'ı `2aac264de454a96e10f543f37de8bba995a48dc7`. Aradaki commitler yalnız belgedir; incelenen ürün fonksiyonları aynı. Bu tur ürün kodu değiştirilmedi; denetim/önceliklendirme yapıldı. Kullanıcı ekleri içindeki 'şunu çalıştır' veya entegrasyon önerileri kendiliğinden talimat sayılmadı, script/patch körlemesine uygulanmadı.

## Yerelde yeniden doğrulananlar

### F-01 — Farklı manga endpoint'ine çeviri anahtarını devretme (yüksek)

`src/main.js:6409–6432` manga config'i ayrıendpointseçilse bile6421satırında `manga.apiKey || inherited.apiKey` kullanıyor. Yeni bağımsız Nodeprobe gerçek browserTranslationConfig/browserMangaTranslationConfig/requestMangaTranslationAtEndpointfonksiyonlarını main.js'ten okuyarak sahte ayarlarla çalıştırdı. translation.invalidv1anahtarı, manga.invalidv1veboşmangaanahtarında diğerendpointconfig'ine geçti. Gerçekrequestfonksiyonunun fetchsınırındaAuthorizationbaşlığına koyduğu da sahtefetchile gözlendi. Gerçek anahtar/ağ yok; yardımcı prompt/parsefonksiyonları stub, tamElectronUItesti değil.

Claude'un eksik bıraktığı çağrı grafiği ayrıca okundu: startBrowserManga:8800config'i alır,requestMangaTranslation:8372endpointlistesindenrequestMangaTranslationAtEndpoint:8381çağırır;8333–8335Authorizationkurar.8801anahtaryokkapısı dolu devralınan anahtarla geçilir. Dolayısıyla yalnız varsayımsal configtehlikesi değildir. Güvenli düzeltme: çeviri anahtarını yalnız açık 'inherit' modunda devralmak; ayrı sağlayıcı boşanahtarsa anahtaristemek. Aynıhostfarklıservispath'lerinde bile otomatikpaylaşım kararını netleştirmek gerekir; salt hosteşitliği yeterli politika değildir. Kullanıcının explicitseçili doğru mangaanahtarını korumak şarttır.

### F-02 — Türkçe olumsuzluk değişimi korumayı geçiyor (orta)

Gerçek `src/dub-text-guard.js:safeShortening` natural=trueile şu dördünü kabul etti: 'Ben gitmem.'→'Ben giderim.', 'Bunu yapamam.'→'Bunu yaparım.', 'Oraya gitme.'→'Oraya git.', 'Böyle olmasın.'→'Böyle olsun.'. main.js:18173bu kontrolü LLMeditörkapısı olarak kullanır. Gerçek LLM'in bunları ürettiği ölçülmedi; koruma boşluğu fonksiyon seviyesinde kesin. Geniş '-ma/-me' regex'i her yerde çözüm değildir: 'elma','çalışma','dondurma' gibi isimleri olumsuzluk sanan yeni hatalar yaratabilir. Ek aileleri/negatifpozitifregresyonlarla muhafazakâr genişletme ve belirsiz anlam değişiminde reviewgereklidir; semantik eşdeğerlik regexile garanti edilmez.

### F-03 — Sırasız SRT ve yanıltıcı mesaj (kullanılabilirlik)

3–4sncueardından1–2sncueparse_srtile2kayıtolarak okunur;make_groups(mode='akici') 'Gecersiz altyazi satiri: 2' hatasıverir. Ret fiilen doğrulandı. Sırasızgirdiyi reddetmek tekbaşına otomatikbugdeğildir; mesajın sırayı açıkça söylememesi ve güvenli onarım seçeneğinin olmaması kullanılabilirlik açığıdır. Kendiliğinden sıralama yapılacaksa source_ids/düzenleme/prozodi/simultanecuekimlikleri korunmalı. Kaynağı sessizce başka kimliklerle yeniden numaralandırmak çözüm değildir.

### F-04 — Ters süreli cue sessizce kayboluyor (orta)

`dub_plan.py:103–110` end>=startolmayancue'yu ne döndürürne skipped'e ekler.2–1sn'likkonuşma+3–4sn'likkonuşma testinde yalnız ikinci metin kaldı;ids=[1],skipped=[]. Bunun SDHetiketi olmadığı açık. Kullanıcıya atlanan konuşmayı raporlama veya açık onarım lazım; gelişigüzel1mscueyaratmak dublaj süresini ve senkronu çözmez.

### F-06 — Noktalı binlik sayıda yanlış ses kalite uyarısı (orta)

`spoken_text('Toplam 1.500 kişi var.')` aynı sayısal gösterimi bıraktı. `speech_check` doğru sözel 'Toplam bin beş yüz kişi var.' için similarity=.5455,missing_numbers=['1.500'],review=trueverdi. Bu yanlışpozitif bağımsız olarak tekrarlandı. Gerçek motorun1.500okunuşu denenmedi. Türkçe sayı gruplama, tarih/ondalık/sürüm/ID/telefon ayrımıyla iyileştirilmeli; hernoktalısayıyı körlemesine binlik yapmak yeni hatadır.

## Daha sınırlı/karar gerektiren maddeler

| Madde | Bu turdaki sonuç |
|---|---|
| F-05 video sonu taşması | altyazi_oku.py:735–736soncuebitişivideodansüredaha büyüksekoşulsuzretveriyor; statik doğrulandı. Büyüktolerans/otomatikmetinatma konuşmayı koruma tercihine aykırı olabilir. Küçükyuvarlamataşmasını büyükfarktanayırmak ve soncueları açıklamak uygun. Tam GPUuçtanucatetiklenmedi. |
| F-07 kompaktSRTperformansı | dub_plan.py:81hercuede sınırsıztext.find('\n\n')yapar; karesel taramariski kodda var. Claude20binölçümüyerelde yenidenkoşulmadı,15sntetiklenmesi kanıtlanmadı. ÜstelikMAX_GROUPS5000plan sınırıyla gerçek kabul kapsamını ayrı değerlendirmek gerekir. |
| F-08NaN/sessizcache | YerelNaNfloatWAVvezerosWAVvalid_audio(header)kontrolünügeçti;finish_audioNaN'ıREDDER,zeros'ıkabul eder. Başlıkkontrolü boşluğu gerçek; tam üretim/cacheakışında bozukfinalsesçıkması henüz doğrulanmadı. Model assess_chunk özelmotorbağımlı; bu tur sesmotoru çalıştırılmadı. Şüpheyi kesin uçtanucahata diye yükseltmedik. |
| F-09iptal/tamamlanma yarışı | ClaudeSUSPECTED; bu turfakeprocess/realkayıp yeniden üretilmedi. İptaltemizliğivebaşarılıçıktısahipliği sözleşmesiyle birlikte incelenmeli. |
| F-10işayarlarınınkalıcılığı | ClaudeSUSPECTED/tasarım sorusu; 'her üretimde son seçimleri hatırla' tasarımı olabilir. Gereksinim teyidi olmadan bug sayılmaz. |

Node/Pythonkanıtıignored `tmp/audit593/node-evidence.json`,`python-evidence.json`;Nodeprobe `probe.cjs`. Hiçbirprivatekeykullanılmadı,sesdosyalarısyntheticzero/NaN. Ürün/testkaynakları değiştirilmedi.

## Tasarım ve test raporunun gerçek sınırı

Nihai ZIP'te2screenshotvar;768koyuTRgörüntüsü bu turgözleincelendi. Sağda yaklaşık56pxşerit görülebiliyor; kapsayıcıDOMölçümü/gerçekElectronpenceresi olmadan rootcauseteyidi yok. DESIGN-REVIEWde bunu ölçülmemişP1diye doğru sınırlar. Kontrast0 ve83click0bulgu kayıtları stubwindow.api/browser-homeiçin; ayarlar/asistan/PDF/sesstüdyosu incelenmiş sayılmaz.16renderın2'sigözleincelenmiş; bu 'bütün arayüz kusursuz' sonucu değildir.

Tamtestlerin10kırmızısı:2git/tarihselbelgepaketsınırı,8ortambağımlılığı; Claude8'inin kurulumsonrasıtekiltestrar geçtiğini raporlamış. Paket içi failed-filelistesimevcut. Bu turtamkoşuyutekrarlamadık ve kendi ortamımız için600+testgeçtiiddiasında bulunmadık. Python/Nodeyeni bağımsız model-freekontrolleriburadaçalıştı; ücretliLLM,gerçeksesGPU,site/DRM,Windowsstart.batUIkabulüyapılmadı.

## Benzer-repolar araştırmasının ayıklanması

60KB araştırmaMD'si ayrı, daha geniş fikir kataloğudur; kaynak kod okunmadığı kendi kapsam bölümünde yazılı. 'Dublaj yok' güncelürüniçinyanlış; kökte80+raporiddiası takiplikanoniği doğrulamıyor (raporlar docs/raporlar altında),öğrenme/Ankiürünönceliğiyürürlüktekikuralaaykırı. OCRkullanıcıiçindüşüköncelikli,başkaGPU/ASR/TTSmotoru12GBNVIDIAVoxCPM2kalitehedefi içindoğrudan kazanç sayılmaz.

QC,bağlamlıçeviri,sözlük,cache,VAD,döngüsavunması,ASRbenchmark,renderaltyapısı bizdezaten mevcut alanlardır;rapordakihermadde yeniözellikdiyeeklenmez. SubERgibibağımsızölçümileformatayrıştırıcıçaprazkontrolü ileride kontrollüdeğer sağlayabilir; bu turilgiliGitHubkaynak/lisansları okunmadığından günceluyumluluk/başarıilanı yok. Yüzlercerepoadı okunmuşkaynakuygulaması sayılmaz. DışmodelWER/skor/lisanscümleleri bu yerelincelemede ayrıca doğrulanmadı.

Öncelik: F-01anahtar sınırı; F-02anlamkoruma; F-04sessizmetinkaybı; F-06sayısalyanlışreview. F-03mesaj/onarımsonra; F-05sürepolitikasıveF-08cachegerçekyaşamdöngüsüayrıkanıt. Bu tur kapsamı inceleme olduğu için hiçbiridüzeltilmişolaraksunulmaz.
