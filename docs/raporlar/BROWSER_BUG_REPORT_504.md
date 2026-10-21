# Rapor504 — Doğal anlatım: araştırma, gerçek GPU karşılaştırması ve kontrollü kurtarma

## Kapsam ve karar

Kullanıcı kesik kesik, her cümlede farklı tonda yeniden başlayan ses yerine tutarlı
anlatım istedi. Mevcut motor/model korunarak hem bağlam parçalama hem üretim
başarısızlığı incelendi. Ana checkout master değiştirilmedi; PR471 devamıdır.
Başlangıç HEAD 09aad3034635bd7eaa6352284ae602d71a4cafa7.
Bitiş ürün kodu 2357dd3ad88a42ef2bb5d2bc9134e0badbabbf4e.

## Birincil kaynak araştırması

- [OpenBMB resmi kullanım](https://github.com/OpenBMB/VoxCPM): Hi-Fi/continuation
  için birebir referans dökümü ile prompt audio; ayrıca aynı gerçek referansın
  reference conditioning olarak verilmesi destekleniyor. Bizim dublaj yolu zaten
  hem prompt_id hem ref_audio_latents kullanıyor. Sırf ayar değiştirildiği için
  bu özelliği yeni eklenmiş gibi sunmadık. Style/control prefix örnekleri ayrı
  kullanım biçimleridir; Hi-Fi metnine körlemesine duygu talimatı eklenmedi.
- [VoxCPM uzun ses tartışması #302](https://github.com/OpenBMB/VoxCPM/issues/302):
  uzun tek üretimde ses kimliği kayması; bağımsız parçalar arasında yeniden
  giriş uyumsuzluğu raporlanıyor. Buradaki iç latent-anchor açıklaması topluluk
  hipotezi/denemesidir, kesinleşmiş model teşhisi diye kabul edilmedi.
- [Uzun form PR313](https://github.com/OpenBMB/VoxCPM/pull/313): sabit referans ve
  kısa bağlamlarla continuation yaklaşımı öneriliyor. PR açık; resmi kararlı
  sürüm özelliği veya her dilde kesin çözüm sayılmadı. Üretilmiş sesi sürekli
  sonraki referans yapmak hataları taşıyabilir; bizim kurtarma asıl referansı korur.
- [Taming Long-form TTS](https://arxiv.org/abs/2609.16989): uzun üretimde hizalama
  bozulması, kelime atlama ve ses benzerliği sorunlarını inceliyor. LACI dikkat
  ağırlıklarını izleyerek kurtarma önerir. Bu çalışmada LACI entegre edilmedi;
  uygulanan yöntem sonradan ASR kontrolü ve sınırlı blok üretimidir. Araştırma
  sonuçları bizim Türkçe kurulumumuzun ölçümü diye aktarılmadı.
- [VoxCPM2 teknik raporu](https://arxiv.org/abs/2606.06928) ve
  [resmi demo sayfası](https://openbmb.github.io/voxcpm2-demopage/): referans/üslup
  ve model yetenekleri için incelendi. Demo seslerini dinleyerek algısal onay
  verdiğim iddia edilmez.
- [nano-vLLM kaynağı](https://github.com/a710128/nanovllm-voxcpm) ve kurulu
  server.py generate imzası karşılaştırıldı: prompt/ref latent/seed desteği var.
  Yeni sürüm kurulmadı, dış motor dosyaları değiştirilmedi.

YouTube aramasında O4TMwZlUJvQ ve qIKywJXLQhU örnekleri bulundu; doğrudan
sayfa erişimi cache miss verdi. Videolar izlenmiş/dinlenmiş gibi kullanılmadı.
Teknik kararlar birincil kod/araştırma ve yerel ölçüme dayanır.

## Gerçek Windows/GPU deneyi

Donanım NVIDIA GeForce RTX4070 SUPER, 12282 MiB. Kurulu nano-vLLM/VoxCPM2,
15 adım, sıcaklık0.8, Hi-Fi referans+döküm, model revision
32279effe8c19989596f05d353d1447f51d9e915. Kişisel referans/döküm/ham günlükler
Git'e alınmadı. Uydurulmuş, altı cümlelik tek Türkçe anlatım metni kullanıldı.
Tüm varyantlarda aynı referans ve bitirme işlemi; birleşmelerde180ms ek durak.
Aşağıdaki değerler bu tek örneğe aittir, genel kalite sıralaması değildir.

| Deneme | Ses bloğu | Ses süresi | Üretim süresi | ASR token benzerliği | İnceleme işareti |
|---|---:|---:|---:|---:|---|
| Ayrı cümleler | 6 | 29.551sn | 57.141sn | 0.9643 | yok |
| Akıcı, değişen tohum | 2 | 25.384sn | 42.672sn | 0.9643 | yok |
| Akıcı, sabit tohum42 | 2 | 25.957sn | 48.437sn | 1.0000 | yok |
| Akıcı, sabit tohum42, CFG2 | 2 | 25.529sn | 47.610sn | 0.9821 | yok |
| Bütün metin tek istek | 1 | 10.560sn | 15.000sn | 0.5195 | VAR |
| Yeni kurtarma yardımcı yolu | 2 | 25.010sn | 51.297sn* | 0.8972 | yok |

*Son satır ASR denetimleri dahil, diğer sürelerle performans karşılaştırması
olarak kullanılmaz. İlk yükleme11.25sn, tek bağlam yükleme10.08sn ayrıca ölçüldü.
İlk beş denemede clipping oranı0; bu doğallık ölçüsü değildir. ASR skoru MOS,
speaker similarity veya insan dinleme değerlendirmesi değildir. İlk dört deneme
uygulamanın source-ID hash tohumlarının birebir taklidi değil, kontrollü seed
karşılaştırmasıdır. Üretimde CFG1.65/sıcaklık0.8/tohum politikası değiştirilmedi.

Doğrulanan hata: tek uzun istek geçerli WAV ürettiği halde yalnız ilk iki cümle
ve üçüncünün başını okudu. Kalan metin okunmadı. Sırf WAV var diye başarı saymak
kalite kanıtı değildir. Aynı metin kısa bağlamlarda tamamlanabildi. Bir referans
ve bir metin tüm Türkçe içerikleri temsil etmez; birebir insan sesi garantisi yok.

## Uygulanan değişiklikler

1. Akıcı planlayıcıdaki tamamlanan cümlede140 karakterden sonra erken bölünme
   yerine, sınırlandırılmış dinamik planlama: az sayıda, dengeli boyutta ve
   cümle sonuna yakın bloklar. Kısa son blok bırakmamak tercih edilir.
2. Kaynak sınırı280 karakter/18sn. Eski550/24 üst sınırını her zaman doldurmak
   amaç değildir. Durak>600ms, konuşmacı işareti, çakışma ve seçilen zaman aralığı
   korunur. Tek kaynak cue asla kesilmez; tek cue sınırdan büyükse bu istisna
   geçerlidir. Eşzamanlı cue davranışı mevcut yol üzerinden korunur.
3. Uzun üretim ASR'da inceleme gerektirirse önce mevcut farklı tohum denemesi;
   hâlâ sorunluysa en fazla8 küçük blokla içerik kurtarma. Kelimeler yeniden
   yazılmaz, aynı gerçek ses referansı kullanılır. Her küçük blok VE birleşmiş
   ses passed olmadıkça kurtarma kabul edilmez. Başarısız kurtarma eldeki sesi
   silmez; mevcut inceleme/başarısızlık bildirimi devam eder. İptalde geçici
   dosya finally ile temizlenir; OOM üstteki mevcut fallback yoluna bırakılır.
4. Yeniden deneme sayıları/gain bitirme kayıtları raporlanır; kurtarma parçaları
   arasında80ms ek durak vardır. Bu yol sadece hata kurtarmasıdır; doğal üslup
   modeline dönüştürme iddiası yoktur. Fast/doğrulayıcı yok yolu bunu çalıştırmaz.
5. Metin stüdyosunda önerilen varsayılan300 karakter, kitap profili600 karakter.
   Görsel satır kayması konuşma parçası değildir. Eski kayıtlı özel ayarlar
   korunur; Dengeli seçilince yeni300 uygulanır. Kitap profili uzun bağlam isteyen
   kullanıcı için kalır. 15 adım/CFG1.65/sıcaklık0.8/durak1/normalize-polish açık.
6. compare_prosody.py: aynı referansla tekrarlanabilir GPU kıyaslaması, isteğe
   bağlı yerel ASR, JSON ölçümleri ve numaralı listen.html. Otomatik kazanan
   seçmez; üretim dosyalarına/ayarlarına yazmaz, çıktı klasörü varsa reddeder.
7. Cache davranış sürümü v9: eski hatalı/inceleme bekleyen konuşmalar yeni
   kurtarma davranışı yerine sessizce tekrar kullanılmaz. İlk üretim bu yüzden
   daha uzun sürebilir; eski kişisel dosyalar silinmez.

## Kısa testler ve sınırlar

- backend/test_dub_flowing_groups.py:5 test geçti;60 deterministik yoğun altyazı
  örneğinde bütün kelimeler/ID'ler,280/18 sınırları ve dengeleme kontrolü.
- backend/test_dub_recovery.py:2 test geçti; kelime koruma, başarısız denetimi
  reddetme, sabit referans/tohum çağrıları, parça+birleşim denetimi ve temizlik.
- tests/test_dub_generation_quality.py:8 test geçti; üretim akışı içinde gerçek
  helper ile sahte motor/ASR kurtarma, önceki iptal/yeniden üretim testleri.
- tests/test_dub_timing.py:12 test geçti; test_report483_dub_edges.py:3 test geçti.
- backend/test_text_studio.py:1; gerçek Tk ile test_text_studio_layout.py:1 geçti.
- node tests/dub-service.test.js geçti. Yeni280/18 CLI sözleşmesi doğrulandı.
- Yedi değişen Python py_compile, JS node --check ve git diff --check geçti.
- Gerçek5 GPU karşılaştırması, ek gerçek GPU+CPU ASR kurtarma denemesi yapıldı.
  Son helper'a yalnız bitirme metrik listesi eklendi; son kayıt biçimi hedefli
  testle kontrol edildi, aynı GPU deneyi tekrar edilmedi.

UI yerleşimi değişmedi; yalnız Tk açıklama/profil sayıları değişti. Tk layout
hedefli kontrolü yapıldı, yeni native ekran görüntüsü alınmadı. start.bat tam
uygulama, gerçek YouTube/DRM, farklı referanslar/diller, insan kör dinleme testi,
speaker embedding/wSIM ve tam npm paketi yapılmadı. Araştırmadaki LACI/latent
anchor/retraining taşınmadı. Yeni bağımlılık veya motor/model güncellemesi yok.
CI beklenmez; önceki PR Ubuntu CI başarısızlığı bu turda incelenmedi.

Yerel kanıtlar (ignore): tmp/report504/comparison, single, recovery; sesler,
ASR özetleri, loglar. Ham kişisel veri ve test WAV'ları Git'e eklenmedi.
