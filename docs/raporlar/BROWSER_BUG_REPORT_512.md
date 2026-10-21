# Rapor 512 — Ses çevirisi gözden geçirme, yerel referans ve anlatım tonu

2026-10-21. Kullanıcı mevcut altyazı dosyasının elle düzeltilmesini değil, ses için çeviri özelliğinin iyileştirilmesini istedi; ardından yerel ses referansının görünür olmasını ve duygu olanaklarını sordu. Bu tur kullanıcı SRT'leri değiştirilmedi.

## Doğrulanmış eksikler ve değişiklikler

1. Speech modu backend ve renderer'da ikinci geçişi zorla kapatıyordu. Önceki tek-geçiş tasarımı yerine kalite odaklı, kaynak + ilk çeviriyle tek editör geçişi açıldı. Yalnız speech modu bunu zorunlu kılar; normal çeviri ayarı korunur. Bu bilinçli ürün tercihi daha fazla süre/token tüketir; TR/EN açıklamalar güncellendi.
2. Olağan refine istemi karakter/saniye ve süre baskısı içeriyordu. Yeni speech varyantında bunlar yok; anlamı kısaltmadan doğal cümle kurulur. Karşılaştırmalı kabulde speech için süre bütçesi 0; sayı, olumsuzluk, anlam ve parça kapıları korunur. Gerileyen veya alınamayan editör yanıtı ilk metni ezmez.
3. Speech kalite kapıları gevşek ayarda atlanabiliyordu. Speech'te strict etkin; normal mod kullanıcının ayarını korur.
4. İki kaynak yankısı, normal kurtarmada başarılı/önbellekli değişmez metin sayılabiliyordu. Speech'te olağan yabancı dil nesri bu yoldan hazır sayılamaz; yalnız önceden belirlenen korunabilir şarkı/vokalizasyon/kod gibi satırlar istisna. Başarısız kaynak görünür kalır; sahte Türkçe tamamlanma yok.
5. Gözden geçirilmemiş speech taslağı fuzzy hafızaya girebiliyordu. Speech fuzzy yazımı yalnız editörün doğruladığı gruplarda; `refined:false` cache taslağı sonraki koşuda yalnız editör isteğiyle tamamlanır. Kontrol başarısız diye ödenmiş ilk çeviri kaybolmaz.
6. Parti aday terimleri yalnız dizi hafızası açıkken toplanıyordu. Speech için kaynak ve kabul edilmiş hedefte gerçekten bulunan en fazla 24 aday editöre salt veri olarak veriliyor. Sıra deterministik, uzunluk sınırlı; aday doğruluk kanıtı/otomatik sözlük değildir. Bozuk `memory.terms/characters/addresses` tipleri güvenle yok sayılır.
7. İstek kalite özeti refine öncesinde yayınlanıyor ve editör isteklerini saymıyordu. Tek nihai olay artık editör istekleri ve karakter hacmini de kapsıyor. Sayım uygulama mantıksal istek sayısıdır; sağlayıcı içi token/ücret muhasebesi garantisi değildir.
8. Yerel referans seçme zaten mevcut PR kodundaydı, açılır alan içinde kalıyordu; kullanıcı görüntüsü eski düzeni gösteriyordu. Düğme referans kartında daima görünür. Dosya seçince hazırlama açılır. Mevcut yetkili dosya seçici/3–30 sn kesme/döküm/dinleme/etkinleştirme yolu kullanılır, yeni IPC veya geniş dosya yetkisi yok.

Speech protokolü `speech-v5-reviewed`: backend cache/TM/resume ve browser iz yeniden kullanımı aynı sürüme geçti. Eski dosyalar silinmez; ilk v5 çalışması tekrar model isteği açabilir.

## Duygu ve anlatım

Varsayılan **Referansın tonunu koru**: mevcut Hi-Fi referans+döküm yolu değişmez. İsteğe bağlı **sakin/sıcak/canlı** deneysel stiller, resmî VoxCPM2 reference-only style-control yolunu kullanır. Aynı referansın latent ses kimliği verilir; devam prompt'u bu modlarda gönderilmez. Parantezli stil etiketi yalnız sentez girdisine eklenir; SRT, editör metni ve ASR doğrulama hedefi değişmez. Stil cache kimliğinde, ayarlarda ve iş günlüğünde saklanır. Rastgele talimat girilemez; sabit allowlist vardır.

Bu otomatik kaynak duygu çıkarımı, birebir oyunculuk veya ses benzerliği garantisi değildir. Deneysel seçenek olduğu açık; referans tarzı varsayılan bırakılır. En iyi referans aynı kişinin hedef tonda temiz konuşmasıdır.

## Araştırma ve karar sınırları

- [ACL 2026 — refinement incelemesi](https://aclanthology.org/2026.acl-long.268/): kaynak bağlamından sonra segment düzeyinde gözden geçirme, özellikle akıcılıkta fayda; anlam yeterliliği kazanımı sınırlı. Bu çalışmadan Türkçe/VoxCPM için ölçülmüş üstünlük sonucu çıkarılmadı.
- [Iterative Translation Refinement](https://arxiv.org/abs/2306.03856): kaynak ve makul ilk çeviriye bağlı kalmanın önemi; burada sonsuz döngü değil tek editör geçişi.
- [Document-level context](https://aclanthology.org/2023.wmt-1.41/): bağlam faydalı, ciddi anlam eksikleri yine mümkün. Yapısal test kaliteli model sonucu diye sunulmaz.
- [Resmî VoxCPM2 style control](https://voxcpm.readthedocs.io/en/latest/models/voxcpm2.html#style-control): referansla ses kimliği, baştaki parantezli etiketle anlatım kontrolü. Kurulu nano-vLLM üzerinden kısa GPU örneği ayrıca koşuldu.

## Kanıt

- Speech 14 Python kontrolü: doğal daha uzun ifadeyi kabul, sayı bozan adayı ret, başarısız editörde ilk metni koru, cache taslağından yalnız kontrolü yeniden dene, yankıyı sahte başarı sayma, terim tipleri/sınırları, istek muhasebesi, zaman/ID koruması.
- Türkçe refine 3, prompt golden 6, sentence-distribution 48, generation-quality 12, expression 1: geçti.
- Node speech UI, browser YouTube Whisper, voice-reference UI, dub-generator UI ve dub-service: geçti.
- Python compile/JS syntax/diff: geçti.
- Ayrı geçici profilde headless Chrome: speech ayarları 900 px ve referans kartı 1400 px, TR/EN × açık/koyu, her yüzeyde 0 kontrast ihlali. Ekran görüntüleri incelendi, yeni düğme ve ton listesi görünür. Bu start.bat/gerçek Electron native medya testi değildir.
- Gerçek GPU kısa örneği: sıcak anlatım, 15 adım, paralellik 1; yükleme 11,047 sn, referans 1,641 sn, üretim+ASR 11,468 sn. 1/1 grup hazır; bağımsız ASR benzerlik 1,0, eksik/fazla sözcük 0; hızlandırma/kırpma 0. Bu nesnel okuma kontrolüdür, öznel duygu/kimlik kalitesi ölçülmedi; diğer iki stil GPU'da koşulmadı.
- Sandbox'ta UI debug bağlantısı ve GPU multiprocessing WinError 5 ile engellendi; aynı kısa kontroller yetkili kapsamda yeniden çalıştırılınca geçti. Ham referans/log/WAV yalnız ignored tmp'de, Git dışında. Dış VoxCPM2 dosyaları değiştirilmedi.
- Yeni canlı çeviri sağlayıcısı çağrısı yok; metin kalitesinde ölçülmüş başarı/“mükemmel” iddiası yok. Tam npm, Windows start.bat/DRM/YouTube hesabı ve uzun video koşumu yapılmadı. CI açık, beklenmiyor. Master'a merge edilmedi.
