# Rapor454 — Dublaj planı süreçleri ve SRT içerik bütünlüğü

2026-10-18. Başlangıç HEAD `71364d9f15bd9d08a620eff2744769ce0c4fcad5`.
Bitiş kod commit'i `d0646d6048429b15b9c2c21a75ae9d0caa23d3cf`.
Dal `codex/browser-whisper-progress-20261014`.

Kullanıcı daha derin inceleme istedi. Dublaj servisinin plan/iptal await
sınırları, arka plan sürecinin kapanışı, Python planı ve gözden geçirilmiş
metin doğrulaması incelendi. Aşağıdakiler kontrollü testle doğrulandı; diğer
raporlardaki bütün açık maddeler çözülmüş sayılmaz.

## 454-01 — Eski plan sonucu yenisini eziyor

`dub:plan` çağrıları sender başına sıralanmıyordu. Yeni plan sonuçlanıp
kaydedildikten sonra eski süreç kapanırsa `plans.set(senderId, eskiPlan)`
güncel planı eziyordu; `dub:shorten` eski metni kullanıyordu.

Sender başına istek nesnesi eklendi. Yeni istek öncekini geçersiz kılıp
sürecini sonlandırmayı ister. Hem dosya yetkilendirmesi hem süreç sonucu
sonrasında hâlâ aynı istek olup olmadığı doğrulanır. Yetkilendirme sırasında
eskimiş istek süreç başlatamaz. Sonuçlanan süreçten geç stdout/close geldiğinde
yeniden tamponlama veya parse yapılmaz. Termination Promise hatası yutulur;
plan isteğinin sonlandırılması ayrı olarak sonuçlanır.

Kanıt: eski kodda yeni plan sonrası kısaltma `latest` yerine `obsolete`
döndürdü. Düzeltmeden sonra güncel metin korunuyor. Ek test authorize beklerken
yeni istek başlatıldığında yalnız bir planner süreci oluştuğunu doğruluyor.
Süreç sonlandırma başarısızsa eski sürecin gerçekten kapandığı iddia edilmez;
sonucu yine yayınlanmaz ve stdout'u tekrar biriktirilmez.

## 454-02 — Başarısız yeni plan eski planı kullanılabilir bırakıyor

Yeni plan hazırlanırken eski `plans` girdisi temizlenmiyordu. Yeni süreç
başarısız olduğunda eski metin kısaltma/üretim için geçerli kalabiliyordu.
Yeni istek başında eski plan kaldırılır. Sender webContents `destroyed`
olduğunda tamamlanmış plan ve bekleyen istek de temizlenir; varsa süreç için
termination istenir. Her sender için en fazla bir destroyed dinleyicisi eklenir.

Kanıt: yeni plan exit 1 verdikten sonra eski kodda `dub:shorten` ok:true
döndürdü; artık ok:false döner. Sender kapanışı testi geç sonucun yayınlanmadığını
ve eski plana erişilmediğini doğrular.

## 454-03 — İptal bekleyişinde süreç referansı boşalıyor

`cancel()` `await terminate(s.proc)` sonrasında tekrar `s.proc.exitCode`
okuyordu. Arka plan işlemi aynı anda kapanıp `onProcess(null)` çağırırsa
null özellik erişimi nedeniyle iptal yanlışlıkla başarısız sayılıyor,
`s.cancelled` geri alınıyordu. Sonuç TTS'ye devam etmek de olabiliyordu.

İptal başındaki gerçek süreç nesnesi yerel değişkende tutulur. Durum kontrolü
de o süreç üzerinde yapılır. Test eski kodda `Cannot read properties of null
(reading 'exitCode')` hatası verdi. Düzeltmeden sonra iptal ok:true, terminal
olay cancelled; ayrıca yeni TTS sürecinin başlamadığı doğrulanıyor.

## 454-04 — Planın metni ve sourceHash farklı SRT sürümlerine ait olabiliyor

Python `plan()` önce parse_srt ile dosyayı okuyor, gruplayıp ardından
`read_bytes()` ile hash çıkarıyordu. Arada dosya değişirse eski cümlelerin
planı yeni dosyanın hash'iyle sunulabiliyordu. Ses üretiminde de ayrıştırma
ve reviewed-text hash doğrulaması ayrı okumalardan geliyordu.

Planlayıcı 2 MB sınırını gözeterek bir kez bytes snapshot alır; parse ve hash
aynı içerikten oluşur. `altyazi_oku.main` da tek okunan SRT içeriğini hem parse
hem `apply_edits` doğrulaması için kullanır. `parse_srt(path)` eski çağrıları
destekler; isteğe bağlı source_bytes yalnız zaten okunan içeriği paylaşır.

Kanıt: test gruplama sırasında dosyayı değiştiriyor. Eski kodda plan metni
Original sentence iken hash değiştirilmiş dosyaya aitti; yeni kodda hash
orijinal metnin bytes içeriğine ait. Boyutu aşan planın gruplamaya girmediği
ayrıca test edildi. Gerçek GPU üretimi bu testin kapsamında değildir.

## 454-05 — Dublaj SRT parser'ı bozuk saatleri kabul ediyor

Eski regex satır başlangıcına bağlı değildi, dakika/saniyede 00–99 kabul
ediyor, saat alanını iki haneyle sınırlıyordu. Örneğin 00:99 dakika normal
zaman gibi çevriliyordu; negatif işaret atlanabiliyordu. 100 saatlik geçerli
bir cue ise okunamıyordu.

Zaman satırları başlangıçtan eşleştirilir, dakika/saniye 00–59 ile sınırlıdır,
saat alanı iki haneyi aşabilir. UTF-8 BOM, CRLF, tek CR ve 1–3 basamaklı
milisaniye davranışı korunur. İlgili bozuk saat/100 saat testleri eski kodda
başarısız, yeni kodda başarılı. Bu, bütün bozuk SRT dosyalarının kesin hata
verdiği anlamına gelmez; parser okunabilir cue'ları toplamaya devam eder.

## Testler ve sınırlar

- `tests/report454-regressions.test.js`: beş yeni Node testi geçti. İlk üçü
  eski ürün kodunda çalıştırılıp hatalı davranış yeniden üretildi.
- `tests/test_dub_plan_regressions.py`: beş Python testi geçti. İlk üçü eski
  ürün kodunda başarısızdı. `tests/test_dub_timing.py`: mevcut 12 test geçti.
- Toplam 17 hedefli Node dosyası ve gerçek Electron trusted bridge smoke geçti.
  Komutlar/değişen dosyalar devir notunda.
- Yeni plan mesajı için TR/EN sözlük karşılığı eklendi. Layout/tema değişmedi.
- Node sözdizimi, Python py_compile ve diff kontrolleri geçti.
- Backend venv'de soundfile yok; ses testleri mevcut VoxCPM2 venv'siyle koştu.
  Bağımlılık kurulmadı, testlerin başarılı sonucu eksik backend ortamından alınmadı.
- Tam npm test, canlı YouTube, GPU/TTS üretimi, fiziksel ses senkronu ve hesap
  girişleri denenmedi. start.bat/install.bat değiştirilmedi veya bu tur açılmadı.
- Önceki kullanıcı talimatıyla CI incelemesine dönülmedi; CI sonucu iddia edilmez.
