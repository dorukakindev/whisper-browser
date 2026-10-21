# Rapor 493 — Ses, oynatma ve kütüphanede 20 doğrulanmış hata

Tarih: 2026-10-20. Başlangıç HEAD: e8c7a66e17c8f4593c7828c01b166a35d73cadce.
Ürün/test düzeltmesi: 63dd4c16cd3a5cd5ea711e85ac43888a312dc96e.
Dal: codex/audio-bugs493. [PR465](https://github.com/dorukakindev/whisper-browser/pull/465).

Yeni 20 senaryo başlangıç kodunun yerel kopyasında başarısız, düzeltmede başarılıdır.
Bunlar 11 Node, 7 Python saf fonksiyon ve 2 kontrollü üretim regresyonudur.
Mock model sonuçları gerçek VoxCPM2 kalitesi olarak değerlendirilmemiştir.

| No | Hata ve kullanıcı etkisi | Düzeltme / kanıt |
|---|---|---|
| 493-01 | Boş ayırıcı satırı olmayan SRT'de sonraki cue'nun numarası, zaman kodu ve metni önceki konuşmanın içine giriyordu. | Gövde sonraki zaman kodunda biter; ardışık cue sayacı ayrılır. İki replik temiz kalır; sayaçsız dosyadaki gerçek `42` diyaloğu korunur. |
| 493-02 | Kurtarılan veya açılan projenin zaman haritası geçersizken Sesi kullan görünür ve çalışabilir kalıyordu. | Düğme görünürlüğü ve tıklama kapısı syncInvalid kontrol eder. Proje açılınca da harita uyarısı gösterilir. |
| 493-03 | Taşınabilir projeye kaydet/aç işlemi syncInvalid bayrağını kaybediyordu; geçersiz çıktı video dışa aktarım kilidini aşabiliyordu. | Bayrak manifestte korunur; tekrar açılan projede video export reddedilir, ses kurtarma kullanılabilir. |
| 493-04 | Python video dışa aktarımı küçük sıkışma ve mutlak ses başlangıçlarını JS oynatıcıdan farklı hesaplıyordu. | map_time ve setpts aynı ankraj/germe kuralını kullanır; sıkışmada smooth uygulanmaz. Arka plan tempo filtresi de bu haritalarda açılır. Kabul edilen iki haritanın iç ve uç noktaları karşılaştırılır. |
| 493-05 | Tempo komutlarında yalnız pencere başına sınır vardı; çok pencereli projede toplam nokta sayısı sınırsız büyüyebiliyordu. | Toplam 200.000 nokta bütçesi grid kurulmadan kontrol edilir. Tek başına geçerli 101 pencerenin toplamı hızlıca reddedilir. |
| 493-06 | Aynı export için eşzamanlı durdurmalar süreci iki kez sonlandırıyordu; başarısız durdurma cancelled bayrağını bırakıp başarılı çıktıyı çöpe atıyordu. | Ortak cancelPromise, başarısız girişimde bayrak/kilit geri alma; pencere kapanışı aynı yolu kullanır. Reddedilmiş stop sonrasında başarılı export korunur. |
| 493-07 | Metin düzenle/uygula sonrasında seçili grubu yeniden üret eski lastRequest metnini gönderiyordu. | Yeniden üretim güncel planın sourceHash ve edits değerlerini alır. Gönderilen yeni metin doğrulanır. |
| 493-08 | Browser işlerinin gerçek ilerlemesi descriptor.progress içinde kalıyor, oynatıcı görev satırına taşınmıyordu. | Tamamlanan/toplam/yüzde satıra aktarılır; 39/224 artık gerçek yüzdeyi gösterir. |
| 493-09 | ASR doğrulamasında eksi işareti tokenizasyonla siliniyor; uzun cümlede -5 yerine +5 okunması geçebiliyordu. | Her negatif miktarın işaretli okunuşu ayrı, tüketimli eşleştirilir. Kayıp işaret review üretir; eksi beş doğru tanınır. |
| 493-10 | İkinci ses adayı daha yüksek metin benzerliği taşıyorsa olumsuzluğu kaybetmiş olsa bile önceki sesten iyi sayılıyordu. | Aday seçimi sayı, olumsuzluk, işaret kaybı ve tekrar kusurunu da reddeder. Kontrollü adayda güvenli önceki ses tutulur. |
| 493-11 | Zorla yeniden üretim başarısız olunca eski WAV korunuyor ama JSON'a yeni, gerçekte okunmamış metin yazılıyordu. | Kullanılabilir yeni geçici ses tercih edilir; eski ses tutulursa önceki metin ve doğrulama bilgisi korunup regenerationFailed/review işaretlenir. Short. sesinin Different. diye raporlanmadığı doğrulanır. |
| 493-12 | Kütüphane relink/merge dış transaction içinde renameMediaId/mergeMediaIds çağırınca ikinci BEGIN SQLite hatası veriyordu. | İç işlemler SAVEPOINT kullanır; yalnız iç hatanın geri alınması ve dış işlemin devamı gerçek SQLite üzerinde doğrulanır. |
| 493-13 | Relink/merge sırasında JSON yazıldıktan sonra SQL hatası olursa written ancak en sonda işaretlendiğinden eski JSON geri yüklenmiyordu. | İlk başarılı JSON değişiminde geri alma sorumluluğu alınır. Birleştirmede SQL upsert hatası da yutulmaz. Kontrollü SQL hatasında özgün liste geri gelir. |
| 493-14 | Sayfa arama indeksi bütün query/hash alanını silerek ?id=1, ?id=2 ve SPA rotalarını aynı belgeye indiriyor, önceki içeriği eziyordu. | Ortak URL temizleyicisi gizli/veri izleme parametrelerini ayıklar, güvenli sorgu ve SPA kimliğini korur; fazla uzun URL kesilmez, reddedilir. Gerçek indeks artık 1 yerine 4 belge tutar. |
| 493-15 | Çeviri hafızasında Unicode eksi işareti sayı imzasına girmediği için −5 ile 5 aynı anlamlı sayılabiliyordu. | Sayı imzasından önce U+2212 normalleştirilir; olumlu ve negatif sıcaklıklar aynı çeviriyi paylaşmaz. |
| 493-16 | Relink/merge yalnız SQLite not gölgesini taşıyor, birincil JSON not deposunu eski medya kimliğinde bırakıyordu. Yeniden açılışta notlar eski kayda dönebiliyordu. | Birincil notlar atomik batch yazımıyla taşınır; kimlik/metin korunur. Sonraki işlem hatasında eski not bağlantıları geri yazılır. Gerçek diskte relink, merge, hedef notunu koruma ve rollback test edilir. |
| 493-17 | don't/can't gibi kısaltmalardaki olumsuzluk sözcük tokenizasyonunda tanınmıyordu; uzun cümlede don't → do kaybı geçiyordu. | Kısaltılmış ve açık not biçimlerinin toplamı kontrol edilir. don't → do reddedilir; don't → do not olumsuzluk kaybı sayılmaz. |
| 493-18 | Sıfır süreli cue'lar TTS SRT planında sessizce atılıyordu; altyazıda görünen kısa söz seslendirmeden kayboluyordu. | Eşit başlangıç/bitiş 1 ms plan penceresiyle korunur. Ters aralıklar yine alınmaz; Wait! metni plan içinde kalır. |
| 493-19 | Eski yerel dublajın bekleyen mute/rate temizliği player-video kimliğini kullandığından yeni açılan videoyu da sessize alabiliyor/hızını değiştirebiliyordu. | İşlemlere medya kimliği taşınır; yerel adapter farklı mediaKey için yazma yapmaz. Yeni videonun ses/hız ayarı aynı kalır, doğru video için işlem çalışır. |
| 493-20 | İlerleme yüzdesi null olduğunda Number(null)=0 dönüşümü yeni aşamayı hatalı kesin %0 gösteriyordu; bilinen tamamlanan/toplam sayacı da eziliyordu. | null/boş yüzde bilinmiyor kabul edilir; 5/10 yüzde 50 olur, açık yüzde 0 korunur. |

## Çalıştırılan doğrulamalar

- Değişiklik öncesi ignored tmp/report493/before kopyasında 11 yeni Node testi kırmızı;
  7 yeni Python testi ve GenerationTests içindeki 2 yeni üretim testi kırmızı.
  Başarısızlıklar assertion/SQLite hatalarıdır, eksik import veya ortam hatası değildir.
- Yeni kodda aynı 20 senaryo yeşil.
- Node hedefli dosyalar: report493-audio, browser-dub-audio, browser-note-store,
  dub-service, dub-generator-ui, dub-workspace, dub-workspace-ui, dub-sync-map,
  player-dub-ui, watch-index-assets, voice-reference-ui, media-relink,
  browser-library-tools. İki kısa gruptaki tüm testler geçti.
- Python: backend/test_dub_export.py (3, gerçek FFmpeg dahil),
  backend/test_translation_memory.py (6), tests/test_report493_audio.py (7),
  tests/test_dub_generation_quality.py (7), tests/test_dub_quality.py (4),
  tests/test_dub_plan_regressions.py (5): 32/32 başarılı.
- Windows Electron trusted bridge smoke başarılı. Ayrı geçici profil ve gerçek
  Electron renderer ile harita uyarısı/düğme görünürlüğü doğrulandı;
  tmp/report493/invalid-map.png incelendi. Fixture ekranı, kullanıcı profili değil.
- Değişen JS dosyalarında node --check, Python dosyalarında py_compile ve
  git diff --check başarılı.

## Sınırlar

Tam npm test, start.bat üzerinden gerçek açılış, gerçek YouTube/DRM,
GPU/nano-vLLM/VoxCPM2 üretimi ve canlı sağlayıcı çağrıları bu tur koşulmadı.
CI kapatılmadı; kullanıcı tercihiyle sonuç beklenmedi ve başarılı iddia edilmiyor.
Model kontrollü üretim testleri yalnız orkestrasyonu kanıtlar.
JSON kütüphane, not dosyası ve SQLite tek bir crash-atomic depo değildir;
yazımlar arasında güç kesilmesi hâlâ ek kurtarma gerektirebilir.
Eski indeks kayıtlarında önceden ezilmiş sayfa içerikleri geri getirilemez;
yeni ziyaretler güvenli belge kimliğiyle kaydedilir.
Şema ve bağımlılık değişmedi. Ana Windows checkout güncellenmedi; PR merge edilmedi.
