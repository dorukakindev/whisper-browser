# Rapor 796 — Dış R795/R796/R797 paketlerinin güncel kodda doğrulanması

Başlangıç master `122d407ad3849c2ab863f1d1c2d26e35ac6c6a0d`. Ürün bitişi `c46ea085b980da74cb9dd296d4afd85ed956f5fe`; dal `codex/audit796`. Dış raporların numaraları repo rapor numaralarından ayrı kaynak kimliğidir; önceki Rapor795 üzerine yazılmadı.

## Denetim kalitesi ve sınırları

Paket iyi ayrım yapıyor: model-free PASS, gerçek ürün hatası, hardening şüphesi ve BLOCKED_ENV ayrı. R795/R796 başlangıcı83c0af; dış R797 yeni122d407a. 500 satırın tamamı bağımsız gerçek UI/YouTube/GPU akışı değildir. Aile ve parametrik vaka sayılarıdır; eski ailelerin PASS sayılarını birbirine ekleyip yeni kapsam saymadım. R797 yalnız ortam engeli kaydeder, ürün bugı değildir. Önceki Windows/GPU kanıtı mevcut olsa da o Linux koşumunu başarılı yapmaz.

Klasörde yeniden üretim açıklamaları ve ham500JSON var; atıf verilen probe kaynakları/log klasörlerinin tamamı yok. Bu nedenle komutların tüm tarihsel çalışmasını bağımsız doğruladım denemez. Değişen alanlara kendi kısa regresyonları yazıldı; ham JSON'daki120 çeviri vakası güncel kalite kapısına tekrar verildi. Sonuç120/120 beklenen davranış. Geri kalan380vaka bu tur yeniden çalıştırılmadı; ilgili mevcut entegrasyon aileleri hedefli koşuldu. Girdi22dosyanın adı/boyutu/SHA256 [manifestte](evidence796/input-manifest.json); ham kişisel kanıtlar yayımlanmadı.

## Yeniden doğrulanan bulgular ve onarımlar

| Dış ID | Güncel repro ve çözüm |
|---|---|
| TR-795-01 | Başlamalısın/Başlayabilirdin/Başlardın modal kaybı geçti. Mevcut kök sınırlandırılmış morfoloji kapısı başla ve birkaç yaygın fiille genişletildi; İngilizce start-present karşıtı da tanınır. Özel ad/nominal yanlış eşleşmelerine karşı tam son ek ve mevcut kontroller korunur. Tam Türkçe morfoloji motoru iddiası yok. |
| TR800-01 | used-to/live → yaşadılar yalın geçmiş kaybı geçti. Açık used-to + tanınan yalın geçmiş karşıtı kontrol edilir; eskiden/önceden/yaşarlardı/used-to-be durumları korunur. |
| TR800-02 | Aynı7.500koduna number_mismatch geldi. Açık code/identifier/version ön ekine bitişik değişmemiş noktalı kimlik, hem sayısal grup kapısında hem anlam kapısında bir kez tüketilir. 7.050 değişikliği reddedilir; bütün miktarlara genel muafiyet yok. |
| TR800-03 | scored4-1 →1-4 geçti; skor fiilinin çekimleri ordered-pair bağlamına eklendi. Miktarları sırasız torba saymak artık bunu örtemez. |
| TR800-04 | Hem başarısız hem başarılı kaynak tek başarıya indirgendi. Tanınan kaynak outcome kutuplarından biri hedefte kaybolursa reddedilir; ikisi korunmuş doğal çeviri geçer. |
| TR800-05 | QuotedFailure → Başarısız adlı film yanlış negation_added oldu. Yalnız açık adlı/isimli başlık alıntıları olumsuzluk denetiminden maskelenir; tek sözcüklü alıntı eser adı da mevcut özel-ad kapısında yerelleştirilebilir. Diğer gerçek olumsuz cümle maskelenmez. |
| TR800-06 | not-a-failure → başarısızlıktı geçti. Başarısızlık/başarı ad biçimlerine outcome kanıtı eklendi. Başarısızlık değildi ve başarıydı olumlu karşılıkları geçer. |
| TR800-07 | Complete sentence → Bu geçti. Yalnız yeterince uzun kaynağın çıplak bu/şu/o hedefine çökmesi truncated sayılır. Genel uzunluk oranıyla ret yok; tek sözcüklü gerçek yanıtlar korunur. |
| TR800-08/09 | Açık Before-alarm / Until-Friday aynı başlıkta sonra karşıtına döndü. Aynı açık zaman/olay çapasıyla başlayan alt cümlede zıtlık kontrol edilir. Tüm örtük zaman ilişkilerini veya ters cümle kuruluşlarını çözmez; bilinmeyen kronolojide otomatik kesin ret iddiası yok. |
| DUB-795-02 | Aynı yola eşit uzunlukta yeni video konunca eski dublaj döndü. Yerel kaynak v2 kimliği gerçek yol + size/mtimeNs/ctimeNs/birthtimeNs/inode içerir; dosya yoksa otomatik reuse yok. fileURI ve Windows yolu eşdeğer. Gigabayt videoyu ana süreçte hashlemek yerine stat sürümü kullanılır; bu kriptografik içerik kimliği değildir, tüm metadata'nın korunabildiği harici snapshot saldırısına garanti vermez. Eski path-only yerel kayıt otomatik bağlanmaz; açık ses-ID ile erişim korunur. URL/YouTube kimliği davranışı değişmez. |
| AUDIT-795-04 | pngjs tam IDAT çözüldükten sonra IENDsiz dosyayı kabul edebiliyor. Decoder öncesi bounded chunk envelope, boş IEND+doğru terminal CRC+EOF zorunlu. Kesik son chunk ve ek trailing bytes ziyaret sayılmaz. |

DUB-795-03 normal akış yarışı olarak kanıtlanmadı; raporun SUSPECTED sınıfı doğru. Yine de geçerli ama farklı bir WAV'ın aynı ready sidecar'ı taşıyabilmesi doğrudan yeniden üretildi ve hardening uygulandı: yeni yazılan üç sonuç yolunda WAV SHA256+byte size bağlanır. Eşleşmeyen mevcut WAV reuse öncesi geçersiz kılınır. Eski özetsiz WAV silinmeden dinlenebilir, fakat ready kanıtı verilmez; review/unavailable döner. Arşivlenmiş immutable take kontrolü korunur. Atomik kernel/disk dolması fault injection bu tur yapılmadı.

## Üretim hattı ve test kanıtı

Yeni backend/test_audit796.py:11 kötü çift ve19 doğru karşılık doğrudan kapıda; kötü çiftler normal+speech/lenient üretim hattında reddedilir, doğru çiftler iki modda tamamlanır. Bu, model-free kontrollü sağlayıcıdır; canlı DeepSeek kalitesi değildir. İlk yalnız kapı düzeltmesinden sonra doğru kod/tek sözcüklü başlık üretim hattında ek sayısal/özel-ad kapısına takıldı; bu yollar da ortak helper ile düzeltildi. Eşikler gevşetilmedi/test silinmedi.

- Python hedefli toplam80test metodu geçti: audit796,audit794,speech_translation,dub_cache796,dub_quality,dub_generation_quality,dub_take_cache,dub_take_selection.
- Node6dosya/23top-level test geçti: backend-sentence-translation (iç125kontrol), speech-translation, browser-translation-quality-loop, ui-surface-coverage792,dub-service,dub-group-takes.
- dub-pronunciation ek kontrolü geçti. Son service koşusu fileURI eşdeğerliğiyle ayrıca geçti.
- Dış120çeviri satırı beklenen sonuçla eşleşti: [yeniden koşum](evidence796/translation-rerun.json).
- Yeni PNG testinde IENDsiz/kesik/trailing dosyalar engellendi; eski geçerli PNG/CRC/dimension testleri korunur.
- Yeni gerçek yerel dosya service testi eşit uzunlukta replacement sonrası latest=null, eksik dosya latest=null, explicit-ID hâlâ erişilebilir koşullarını doğruladı.
- Yeni cache testi iki geçerli duyulabilir WAV'da hash uyuşmazlığını gösterir. Legacy kaydı review yaparken dosya baytları değişmez. Mevcut üretim testleri yeni sidecar yazımını da çalıştırır.
- py_compile ve node--check değişen modüllerde, git diff--check geçti.

İlk cache denemesinde AST tabanlı üretim fixture'ının global importu eksikti; üretim fonksiyonuna yerel import eklendi. Eski semantik fixture'a ses özeti bağlandı; semantik assertler korunur. Ara başarısızlıklar final başarıyla gizlenmedi.

## Kaynak, uyumluluk ve teslim

Önce mevcut sentence_translation, dub-source-identity, dub_quality ve coverage kodları incelendi. [pngjs](https://github.com/pngjs/pngjs) mevcut decoder olarak korundu; [W3C PNG IEND](https://www.w3.org/TR/png-3/#11IEND) ve [Node fs.Stats](https://nodejs.org/api/fs.html#class-fsstats) resmi sözleşmeleri kontrol edildi. Yeni dış kod/bağımlılık/sürüm/model yok. Kök sözlüğü mevcut proje yaklaşımıyla genişledi; genel dilbilgisi veya duygu modeli eklenmedi.

Windows Türkçe dosya yolu/fileURI, yerel replacement ve Node/Python sözleşmeleri kontrol edildi. Bu tur UI/CSS değişmedi; yeni görsel tasarım testi gerekmiyor. start.bat, gerçek YouTube, GPU, yeni canlı API, gerçek duygu/doğallık testi yapılmadı. Tam npm test/uzun CI beklenmedi. Kullanıcının açık uygulaması kapatılmadı. Yeni ses cache alanı audioIdentity ve local-v2 reuse geçişi yukarıdaki konservatif davranışla geriye uyumludur; ses dosyalarını toplu silme/göç yok.

Dosya amaçları: sentence_translation.py anlam/sayı/başlık kapıları; dub-source-identity.js yerel sürüm sahipliği; dub_quality.py WAV digest doğrulaması; altyazi_oku.py üç üretim sonucuna digest yazımı ve reuse öncesi kontrol; coverage.cjs PNG terminal kanıtı. İlgili yeni/mevcut test dosyaları bu davranışları korur. Kişisel ana kopya değişiklikleri commit kapsamı dışıdır.
