# Rapor 794 — Dış denetimi doğrulama ve düzeltmeler

Repo https://github.com/dorukakindev/whisper-browser · dal codex/audit794.
Başlangıç master `9dac83b47cae257fdd590ef8fb6915fe10f6c85a`;
bitiş ürün/test `a44be553eee473d412902f6968c35b595092a88e`.

## Denetim iyi yapılmış mı?

Gönderilen altı dosya SNAPSHOT, RUN-LOG, REPRODUCE, TASK-MATRIX, FINDINGS ve
AUDIT-REPORT incelendi. Dış kimlik `r793-deep-20261029`; kendi Rapor793'ümüz
başka bir ses teslimi olduğu için üzerine yazılmadı. Kaynak Git revizyonu
`6e89674b93129c1c5442eb4a32b582ca34d5e9d6` idi. SNAPSHOT içindeki **19 kaynak
SHA-256 değeri o revizyonun Git blob'larıyla birebir eşleşti**. Bu, revizyon
kaydını doğrular; bütün testlerin gerçekten koştuğunun tek başına kanıtı değildir.

Olumlu: ayrı temiz hedef worktree, kontrollü provider ile kabul yolu, başarısız
probe'ları yeşile çevirmemek, model-free testleri GPU/Windows/UI başarısı
saymamak ve engelleri açık yazmak iyi uygulamalar. Dublaj sayısı doldurulmamış.

Sınırlar: `logs/`, `probes/`, `evidence/` dosyaları bu altı ekin içinde yok.
Bu yüzden rapordaki 26/24/70 Node ve 121 Python sonuçları ile 54 tam-paket
başarısızlığının kök nedenleri bağımsız teyit edilmedi. TASK-MATRIX'teki pek çok
command hücresi boş, yalnız grup loguna referans var. Bulgu1 başlığı yalnız
TR→EN diyor, kanıt tablosu EN→TR boşluğunu da içeriyor. `Giderdin` yalnız
would ile çevrilmek zorunda değildir; raporun önerisi aynen uygulanmadı.
Bu, faydalı ve somut üç bulgu içeren bir denetimdir; eksiksiz E2E/kalite kabulü
olarak nitelendirilemez. Ham log olmaması bug'ların yeniden üretilmesini engellemedi.

[Ek hashleri ve bağımsız kararlar](evidence794/verification.json).

## Yeniden üretilen ve düzeltilen bulgular

### TR-793-01 — Başarı/başarısızlık yönü

Güncel başlangıç master'da `failed → başarılı` ve `başarılı → failed`
bloklayıcı hata üretmedi. EN/TR başarı/başarısızlık sonuçlarına dar, iki yönlü
lexical karşıtlık kanıtı eklendi (`outcome_reversed`). Quoted/adlandırılan
başlıklar ve aynı cümlede hem olumlu hem olumsuz sonuçlar tek kutba zorlanmaz.
`başarılı olmadı / not successful` gibi olumsuz karşılıklar korunur.

Ek karşı kontrol bir mevcut yanlış reti de gösterdi: `başarısız oldu → failed`
doğru olsa da İngilizce failed, hedef olumsuzluk kapısında kanıt sayılmıyordu.
Bu tutarsızlık da düzeltildi. `failure mode → arıza türü` gibi sonucu bildirmeyen
teknik kullanımda sırf failure sözcüğü var diye olumsuz fiil aranmaz.
Bu genel duygu/anlam çözümleyici değildir; başka bütün karşıtlıkları yakalama
iddiası yoktur. Kişi/eser adları bu kuralla keyfî değiştirilmez.

### TR-793-02 — Türkçe kaynak modal kaybı

Raporun dört kaybı yeniden üretildi: Beklemelisin→You wait,
Gidebilirdin→You went, Giderdin→You go, Yağabilir→It rains.
Bilinen fiil kökleri ve tam çekim sonlarıyla gereklilik/yeterlik kanıtı
çıkarılır. İngilizce eşdeğerleri should/ought/must/able to/could/may/might vb.
olarak kabul edilir. Salt -meli/-irdi dizisi aranmıyor; `temeli`, normal geçmiş
`bitirdin` gibi örnekler modal sanılmıyor.

Geçmiş alışkanlık özellikle dar tutuldu: yalnız tanınabilir İngilizce şimdiki
geniş-zaman cümlesi karşısında kayıp bildirilir. `used to go`, `would go`,
`knew`, `bought` gibi uygun geçmiş alternatifler reddedilmez. Bilinmeyen
çekimler ve read/put/cut gibi belirsiz İngilizce geçmişler için ispat yoksa
otomatik ret üretilmez. Türkçenin bütün morfolojisi çözüldü iddiası yoktur.

Ortak `translation_blocking_issues` normal ve ses çevirisinde kullanılıyor.
Gerçek `llm_translate` kontrollü-provider testinde 8 yanlış çift, iki modda
da completed olmadı ve kaynak korundu. 15 doğru karşılık da iki modda completed.
Normal moddaki **kullanıcının açık lenient seçimi** mevcut tasarımla değişmedi;
bu normal kabul testi strict kalite modundadır. Ses modunda lenient=True bile
anlam kapısını atlayamaz ve bu ayrıca test edildi. İlk test taslağı normal
lenient modundan strict ret beklediği için düştü; ürün davranışı incelendikten
sonra test gerçek sözleşmeye bağlandı, gizlenmedi. Cache/TM okuması da güncel
blocking kapısından geçer; gereksiz toplu cache silme/protokol göçü yapılmadı.

### UI-793-01 — Olmayan ekran görüntüsü ziyaret sayılıyordu

Doğrudan summarize repro'su olmayan dosyayla visited1 döndürdü. Artık dosya
mevcudiyeti, boyut, PNG başlığı, boyut üst sınırı ve gerçek decode/CRC kontrolü
zorunlu. Hatalı artifact `blockedArtifacts` içine yazılır, root UNVISITED kalır.
Geçerli kanıtta byte size, SHA-256 ve pixelWidth/pixelHeight vardır. Çıktıya
göreli yol `evidenceRoot: OUT` ile çözülür; CWD'ye bağlı sahte başarı yoktur.
Duplicate capture hash'leri raporlanır; tek görüntünün birden fazla iç içe kökü
kapsaması geçerli olduğundan bu durum tek başına hata sayılmaz.

## Dosyalar ve bağımlılık

| Dosya | Amaç |
|---|---|
| backend/sentence_translation.py | Dar sonuç karşıtlığı ve ters yön modal/olumsuzluk kanıtı |
| backend/test_audit794.py | Doğru/yanlış çiftler, isim/teknik terim, iki mod gerçek kabul yolu |
| tools/ui-surface-coverage.cjs | PNG decode/CRC/size/hash ve engellenen/tekrar eden kanıt kaydı |
| tools/audit-ui.mjs | Screenshot yolunu OUT'a bağlama; geçersiz artifact için strict başarısızlığı |
| tests/ui-surface-coverage792.test.js | Gerçek PNG ve eksik/boş/bozuk/kesik artifact negatifleri |
| package.json, package-lock.json | Zaten kilitli transitif pngjs5.0.0'ı doğrudan dev bağımlılığına alma |
| tools/UI-SURFACE-COVERAGE.md | Yeni kanıt sözleşmesi ve doğrudan summarize kullanımı |

[pngjs kaynak/API](https://github.com/pngjs/pngjs),
[MIT lisansı](https://github.com/pngjs/pngjs/blob/main/LICENSE) incelendi;
PNG decoder yeniden icat edilmedi. Yeni sürüm/ürün runtime bağımlılığı veya
toplu npm yükseltmesi yok. Kurulu5.0.0 kullanıldı; temiz kurulum npm ci ile
kilit dosyasından aynı paketi alır. Kurulum/batch/IPC/kişisel ayar değişmedi.

## Kendi kontrollerimiz

- Python test_audit794:5 test metodu,17+ doğru karşı çift,8 yanlış çift,
  yanlış/15 doğru adayın normal+speech üretim kabul yolu; PASS.
- test_speech_translation27, test_meaning_loss_eval4, test_negation6341: PASS.
  Toplam **37 Python test metodu**; veri satırları ayrı test diye şişirilmedi.
- Node iki dosyada4alt-test PASS: backend-sentence-translation içinde125iç
  kontrol; coverage3davranış testi. Eksik/boş/geçersiz başlık/kesik/CRC bozuk
  PNG'nin hiçbiri ziyaret sayılmadı.
- Gerçek Windows Edge: `audit-ui --surface voice-studio --widths800 --strict`,
  TR/EN×açık/koyu4PNG, exit0,0kontrast,0blocked artifact; hepsinde boyut/hash
  mevcut. Dar TR görüntüsü elle incelendi. **1/87kök ziyaret**,86UNVISITED;
  bütünUI başarı iddiası yok. Görseller yalnız izole fixture profiline aittir,
  ignored tmp/audit794-real altında; JSONözet yukarıdaki kanıtta.
- inventory-only+coverage-strict:87declared/0visited/87unvisited, beklenenexit1.
- DeğişenJS node --check,Python py_compile,diffkontrolü PASS.

Canlı sağlayıcı/DeepSeek, yeni GPU/dublaj, Windows start.bat/install.bat,
tam npm, gerçek YouTube ve CI bu tur koşulmadı; öncekiR793GPUkanıtı yenitest
sayılmadı. CI açık kalır, teslim beklemez. Kullanıcının açık uygulaması
kapatılmadı, dosyaları/API ayarları korunur. Kalan90hedef aktif.
