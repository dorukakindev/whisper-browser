# DEEPSEEK NIGHT 1000 — koordinatör denetim raporu

> **KRİTİK REVİZYON UYARISI:** Koşu ve paketleme sırasında **başka bir oturum** HEAD'i ilerletti (PR #537–#544). Bu paketleme oturumu commit/push/merge/reset yapmadı. **pkg01–pkg06 MIXED_REVISION** sayılır (7f3b0382…19d5fb49 aralığında koştu) ve **final HEAD'de yeniden doğrulanmadı**. pkg07–pkg08 19d5fb49 üzerinde, pkg09–pkg10 ise 1b41451d→f88541f8 aralığında koştu; current HEAD daha ileridir (PR #544). Bu rapordaki hiçbir bulgu "düzeltildi" veya "final HEAD'de doğrulandı" olarak okunmamalıdır.

- **Run:** `DEEPSEEK-NIGHT1000-20261027T0441Z-n1k7`
- **Rapor üretimi (UTC):** 2026-10-27T09:39:11Z
- **Kaynak:** `D:\Whisper Local`, branch `master`
- **Başlangıç HEAD:** `7f3b0382c969ec183e7a7ebfddedf5d917c7b8ea`
- **Bitiş HEAD:** `7aaaf2083cb5f4d8d239bdbd088ba97ea542256e`
- **Araç sürümleri:** Node v25.6.1, Python 3.11.9, npm 11.9.0, Electron 43.5.0
- **Kapsam:** 10 paket × 100 satır = 1.000 senaryo; yalnız raporlama, ürün kodu/test/package-lock/venv değişmedi.

## 1. Sayılar (TASK-MATRIX.csv'den yeniden hesaplandı)

| durum | satır |
|---|---:|
| PASS | 843 |
| FAIL_CONFIRMED | 0 |
| SUSPECTED | 5 |
| BLOCKED_ENV | 0 |
| INCONCLUSIVE | 1 |
| MIXED_REVISION | 0 |
| NOT_RUN | 0 |
| SKIPPED_ALREADY_COVERED | 0 |
| NOT_APPLICABLE | 151 |
| **toplam** | **1000** |

- Uygulanabilir satır: **849**; PASS oranı **%99.3**.
- NOT_APPLICABLE satırlar bug ya da PASS sayılmadı; gerekçeleri matriste `reason` sütunundadır.
- Başlatılıp bitmemiş işlem PASS sayılmadı; alt komutların gerçek çıkış kodları `RUN-LOG.jsonl` içindedir.

### Paket bazında

| batch | satır | PASS | SUSPECTED | NOT_APPLICABLE | INCONCLUSIVE |
|---|---:|---:|---:|---:|---:|
| 01 | 100 | 94 | 0 | 6 | 0 |
| 02 | 100 | 89 | 0 | 11 | 0 |
| 03 | 100 | 77 | 0 | 23 | 0 |
| 04 | 100 | 79 | 0 | 21 | 0 |
| 05 | 100 | 78 | 2 | 20 | 0 |
| 06 | 100 | 82 | 0 | 18 | 0 |
| 07 | 100 | 81 | 1 | 18 | 0 |
| 08 | 100 | 79 | 2 | 19 | 0 |
| 09 | 100 | 95 | 0 | 4 | 1 |
| 10 | 100 | 89 | 0 | 11 | 0 |

## 2. Bulgu sayıları

| kategori | sayı |
|---|---:|
| Benzersiz kök | **6** |
| FAIL_CONFIRMED kök | 0 |
| SUSPECTED kök | 6 |
| BLOCKED_ENV | 0 |
| NOT_RUN | 0 |
| Duplicate (`duplicate_of` dolu) | 0 |
| NOT_APPLICABLE satır | 151 |

Altı benzersiz kökün **hepsi P3 / SUSPECTED**; hiçbiri FAIL_CONFIRMED'e yükseltilmedi. Dördünün matriste bağlı satırı vardır (B05-01 iki satırda tekrarlanır); **F09-01 ve F09-02'nin `finding_ids` bağlantısı yoktur** — N0837/N0999 satırları PASS (bkz. Bölüm 7).

## 3. Kök bulgular ve en önemli etkiler

Etki sırası (kullanıcıya etkisi en yüksekten):
1. **F09-02** — Bozuk gizli kasa JSON'u anahtar kaydetmeyi kalıcı olarak engelliyor; kurtarma/karantina yok, hata ham İngilizce. (pkg10)
2. **F33-01** — Silinen bölüm sesi M4B dışa aktarmada ham ENOENT ve **tam yerel yol** döndürüyor; bilgi sızıntısı + anlaşılmaz mesaj. (pkg07)
3. **F09-01** — Keşfet/arama hataları TR arayüzde ham İngilizce (`Unauthorized request.`, `Discovery HTTP 500`). (pkg09)
4. **F38-01** — Türkçe büyük İ katlanmadığı için 'İğdır'/'iğdır' mükerrer grubu ve relink adayı üretmiyor. (pkg08)
5. **F39-01** — Kesik Letterboxd CSV satırı `AttributeError` ile anlaşılmaz teknik mesaj veriyor. (pkg08)
6. **B05-01** — Tüm dublaj parçaları hazırken bile "üretilemeyen bölümler" uyarısı gösteriliyor (iki satırda aynı kök). (pkg05)

### B05-01 — P3 SUSPECTED — Dublaj kurtarma uyarısı hiç başarısız parça yokken de gösteriliyor

- **Paket / aile:** pkg05 / F23
- **Etki:** Motor zaman aşımından sonra tüm parçalar geçerliyken bile kullanıcı 'üretilemeyen bölümler kalite raporunda işaretlendi' uyarısını görür; gereksiz yeniden inceleme/üretim dürtüsü doğar.
- **Ön koşullar:** timing/engine recovery yolu: bounded_call EngineStalled sonrası dub_resume.recover_completed çağrılır ve bütün parçalar geçerli WAV döner.
- **Gerçek:** recover_completed sonunda koşulsuz `print('DUB_WARNING incomplete_audio')` çalışır (dub_resume.py:33). dub-service bu satırı koşulsuz UI uyarısına çevirir (dub-service.js:662). Probe: tek geçerli parça ile çağrıldığında stdout'ta DUB_WARNING incomplete_audio görüldü (N0441 kanıtı).
- **Beklenen:** Uyarı yalnız en az bir grup failed/recoveryReason taşıyorsa üretilmeli; tümü hazırsa sessiz kalmalı.
- **Kök neden:** Uyarı, döngüde oluşan failed satır sayısına bağlanmamış; fonksiyonun çağrılmış olması yeterli sayılmış.
- **Düzeltme yönü:** Uyarıyı `any(row['status']=='failed' ...)` koşuluna bağla; aksi halde yalnız özet satırını bas.
- **İlgili testler:** tests/test_dub_generation_quality.py, tests/test_dub_quality.py
- **Konumlar:**
  - `tools/voxcpm2/dub_resume.py:33` — `recover_completed` — sha256 `3222608a51eafe754ec0b8d56ba5b229033760be3d863a28196ac0e55b78d31c`
- **Kanıt:**
  - `logs/Tpkg05-N0441.stdout.txt`
  - `logs/Tpkg05-N0459.stdout.txt`


### F33-01 — P3 SUSPECTED — Silinen bölüm sesi M4B dışa aktarmada ham ENOENT hatası (Türkçeleştirilmemiş, mutlak yol içerir)

- **Paket / aile:** pkg07 / F33
- **Etki:** Kullanıcı proje klasöründeki bir bölüm wav dosyasını silerse/taşırsa veya antivirüs karantinaya alırsa, dışa aktarma/önizleme 'ENOENT: no such file or directory, lstat C:\...\0-....wav' gibi ham İngilizce teknik mesaj ve tam yerel yol gösterir; kullanıcı ne yapacağını anlayamaz ve dosya sistemi yolu arayüzde açığa çıkar.
- **Ön koşullar:** Kitap projesi bölümü status=ready ve c.output dolu; Bölüm wav dosyası uygulama dışında silinir veya klasör yolu değişir; book-export-preview ya da book-export çağrılır
- **Gerçek:** book-export-preview yanıtı {ok:false, error:"ENOENT: no such file or directory, lstat 'C:\\Users\\PUBLIC_USER\\0-670c2df7db808d72-a25c03311c785132.wav'"} döndürüyor (logs/Tpkg07-N0659.stdout.txt, 'kullanici-geribildirimi' mekanizması).
- **Beklenen:** Yerelleştirilmiş ve yol içermeyen mesaj; ör. 'Bölüm ses dosyası bulunamadı; bölümü yeniden üretin / Chapter audio file is missing; regenerate it.' Aynı dosyadaki diğer hatalar çift dilli ('... / Seçili bölümlerin güncel ve onaylı sesi gerekli.').
- **Kök neden:** Dışa aktarma dalında bölüm dosyaları fs.lstatSync ile doğrudan denetleniyor (src/media-workflows.js:1350); ENOENT/ENOTDIR yakalanmıyor. media-workflows hata yerelleştiricisi yalnız ' / ' ayraçlı çift dilli metinleri böldüğü için ham Node hata metni olduğu gibi dönüyor.
- **Düzeltme yönü:** Dosya denetimini try/catch ile sar; ENOENT/ENOTDIR için çift dilli, yol içermeyen hata üret (diğer bölüm hatalarıyla aynı kalıp). Yolu yalnız günlüğe yaz.
- **İlgili testler:** tests/book-export.test.js
- **Konumlar:**
  - `src/media-workflows.js:1350` — `book-export: fs.lstatSync(f) bölüm sesi denetimi` — sha256 `c85e063af2a1ff3206d9fd9e1209891aeba43ca1a62e93c88f01a5ef6cc4036d`
- **Kanıt:**
  - `logs/Tpkg07-N0659.stdout.txt`
  - `logs/Tpkg07-N0641-existing-test.stdout.txt`
  - `pkg07/TASK-MATRIX.csv`


### F38-01 — P3 SUSPECTED — Relink/mükerrer bulucu Türkçe büyük İ'yi katlamıyor: 'İğdır' ile 'iğdır' aday üretmiyor

- **Paket / aile:** pkg08 / F38
- **Etki:** Aynı filmin farklı klasörlerdeki kopyaları yalnız Türkçe büyük/küçük harfle ayrılıyorsa (ör. 'İğdır Şölen.mkv' ve 'iğdır şölen.mkv') mükerrer bulucu grubu hiç üretmez; taşınmış/yeniden kodlanmış dosyada boyut da farklıysa relink adayı listelenmez. Kullanıcı yanlışlıkla ikinci bir kütüphane kaydı tutar ya da taşınan dosyayı elle bağlamak zorunda kalır.
- **Ön koşullar:** Kütüphane kaydı dosya adı Türkçe büyük İ içerir; Diğer kopya/aday adı yalnız harf kalınlığında farklıdır; Mükerrer bulucu: her iki kayıtta da boyut bilgisi var; relink: adayın boyutu farklı
- **Gerçek:** findLibraryDuplicates([{'localPath':'D:\\a\\İğdır Şölen.mkv','sizeBytes':100},{'localPath':'D:\\b\\iğdır şölen.mkv','sizeBytes':100}]) → [] (grup yok). selectRelinkCandidates({'localPath':'D:\\a\\İğdır Şölen.mkv','sizeBytes':100},[{'path':'D:\\b\\iğdır şölen.mkv','sizeBytes':200}]) → {status:'none',ranked:[]}. ASCII karşılığı ('Igdir'/'igdir') aynı senaryoda grup üretiyor (logs/Tpkg08-N0744.stdout.txt 'unicode' mekanizması).
- **Beklenen:** Türkçe metin katlaması depo genelindeki desenle (toLocaleLowerCase('tr') / foldSearch) yapılmalı; 'İğdır'/'iğdır' aynı ada katlanıp mükerrer grubu ve (boyut eşleşmiyorsa) listelenebilir relink adayı üretmeli.
- **Kök neden:** normalizeName/stemNorm varsayılan String.prototype.toLowerCase kullanıyor; Türkçe 'İ' küçültmede 'i' + U+0307 (birleşik nokta) üretir ve 'iğdır' ile eşleşmez. Depoda Türkçe için toLocaleLowerCase('tr')/foldSearch deseni zaten var (src/browser-address-model.js, renderer foldSearch).
- **Düzeltme yönü:** normalizeName/stemNorm içinde toLocaleLowerCase('tr') ve ı/i katlaması kullan (depodaki foldSearch deseni); ASCII davranışını değiştirmediğini tests/media-relink-matcher.test.js ile doğrula.
- **İlgili testler:** tests/media-relink-matcher.test.js
- **Konumlar:**
  - `src/media-relink-matcher.js:13` — `normalizeName` — sha256 `7dd8e695a7d46f1a996be5d4ba30902554284e450e18f63e5ce5c067dfbc7d8e`
  - `src/media-relink-matcher.js:138` — `stemNorm` — sha256 `7dd8e695a7d46f1a996be5d4ba30902554284e450e18f63e5ce5c067dfbc7d8e`
- **Kanıt:**
  - `logs/Tpkg08-N0744.stdout.txt`
  - `logs/Tpkg08-N0741-existing-test.stdout.txt`


### F39-01 — P3 SUSPECTED — Kesik Letterboxd CSV satırı içe aktarmada AttributeError üretiyor (ValueError sözleşmesi bozuluyor)

- **Paket / aile:** pkg08 / F39
- **Etki:** Yarım indirilmiş/elle kesilmiş bir Letterboxd CSV'sinde son satırda alan eksikse içe aktarma kullanıcıya anlamsız teknik mesaj ("'NoneType' object has no attribute 'isdigit'") ile başarısız olur; hangi satırın/alanın bozuk olduğu söylenmez.
- **Ön koşullar:** CSV başlığı Name/Year içerir; Son kayıtta alan sayısı başlıktan az (dosya kesik); media_shelf.py letterboxd() çağrılır (tek CSV veya ZIP üyesi)
- **Gerçek:** letterboxd_archive/letterboxd → AttributeError: 'NoneType' object has no attribute 'isdigit' (girdi 'Name,Year\nFilm'). CLI bu metni stderr'e basıp çıkış kodu 1 veriyor (logs/Tpkg08-N0772.stdout.txt 'kesik' mekanizması).
- **Beklenen:** ValueError ile anlaşılır doğrulama hatası (ör. 'Row 1: missing Year value. / Satır 1: Year alanı eksik.') veya eksik alanın boş kabul edilmesi (year=''), böylece diğer satırlar içe aktarılabilir.
- **Kök neden:** csv.DictReader eksik alanları None ile doldurur; kod row.get('Year','') dönen None değerini doğrudan .isdigit() ile kullanıyor. Başlık doğrulaması var ama alan tipi normalizasyonu yok.
- **Düzeltme yönü:** year değerini str(row.get('Year') or '') ile normalize et (rating/tags için de aynı desen), eksik alanı boş say; istenirse ValueError'a satır numarası ekle.
- **İlgili testler:** backend/test_media_shelf.py
- **Konumlar:**
  - `backend/media_shelf.py:210` — `letterboxd: year.isdigit()` — sha256 `0ed176c871edbecbd14c6768273a9f676d5f09ad0787e33f16c9e2f1419b990d`
- **Kanıt:**
  - `logs/Tpkg08-N0772.stdout.txt`
  - `logs/Tpkg08-N0761-existing-test.stdout.txt`


### F09-01 — P3 SUSPECTED — Keşfet/arama arka uç hata metinleri TR arayüzde ham İngilizce gösteriliyor

- **Paket / aile:** pkg09 / F41/F42
- **Etki:** Türkçe arayüzde çevrimiçi sonuç ekleme veya ayrıntı yükleme başarısız olduğunda kullanıcı 'Unauthorized request.' / 'Discovery HTTP 500' gibi İngilizce teknik metin görür; sorunun ne olduğu ve ne yapılacağı Türkçe anlatılmaz. Aynı kök media-search-ui bildirim kutusunda da var.
- **Ön koşullar:** Çevrimiçi keşfet/arama kullanılıyor; Sağlayıcı 4xx/5xx döndürüyor veya oturum yetkisiz; Arayüz dili TR
- **Gerçek:** media-discovery-service.js hata metinlerini İngilizce üretiyor ('Unauthorized request.', 'Discovery HTTP '+status, 'Discovery is busy; try again shortly.', 'Invalid discovery page.'). media-discovery-ui.js yalnız 'Ayrıntılar alınamadı: ' önekini çevirip error.message'ı ham ekliyor (satır 38). media-search-ui.js eklenti hatasını doğrudan status.textContent'e yazıyor (satır 24/41). jsdom probu TR yerelde yetkisiz eklemede durum metninin tamamen 'Unauthorized request.' olduğunu ve hiç Türkçe karakter içermediğini doğruladı.
- **Beklenen:** TR arayüzde kullanıcıya Türkçe, eylem öneren hata metni gösterilmesi (CLAUDE.md: tüm kullanıcı metinleri Türkçe).
- **Kök neden:** Hata sözleşmesi main/backend katmanında İngilizce sabit metinlerle kurulu; renderer yalnız bağlam öneki çeviriyor ve hata kodunu Türkçe karşılığa eşleyen bir sözlük yok.
- **Düzeltme yönü:** Backend'de hata KODU döndür (unauthorized/http_500/busy/invalid_page) ve renderer'da ui-locale sözlüğüyle TR/EN metne çevir; ham error.message'ı kullanıcı yüzeyine yazma.
- **İlgili testler:** tests/media-discovery-service.test.js, tests/media-search-gallery.test.js
- **Konumlar:**
  - `src/media-discovery-service.js:95` — `authorized/media-discovery:request` — sha256 `2273d57ab6366cb5036139c2c0afbc02698a0bbce6a4b70b618857c0024ec819`
  - `src/media-discovery-service.js:65` — `request HTTP error` — sha256 `2273d57ab6366cb5036139c2c0afbc02698a0bbce6a4b70b618857c0024ec819`
  - `src/media-discovery-service.js:169` — `Unsupported discovery action` — sha256 `2273d57ab6366cb5036139c2c0afbc02698a0bbce6a4b70b618857c0024ec819`
  - `src/renderer/media-discovery-ui.js:38` — `details catch` — sha256 `b035839dddee4a1679182d7e4d787a5dee2e4fc70befcc0ac463effa609639a8`
  - `src/renderer/media-search-ui.js:24` — `row onclick catch` — sha256 `e3a8fb45b5c61a4dfa11569cdbc5c61af5d2516091702e0d19bd53d758c9e9cc`
- **Kanıt:**
  - `logs/Tpkg09-N0837.stdout.txt`
  - `probes/p42-media-search-home.js (yetki: TR ham İngilizce assert)`


### F09-02 — P3 SUSPECTED — Tamamen bozuk gizli kasa JSON'u anahtar kaydetmeyi kalıcı olarak engelliyor ve ham İngilizce hata veriyor

- **Paket / aile:** pkg10 / F50
- **Etki:** secrets.safe.json geçersiz JSON olduğunda SafeSecretStore.load() {ok:false} döner, save() de aynı ham Node ayrıştırma hatasıyla reddeder; dosya korunur ama otomatik karantina/yeniden kurma yoktur. Kullanıcı dosyayı elle silmeden API anahtarı kaydedemez ve gördüğü mesaj teknik/İngilizcedir.
- **Ön koşullar:** safeStorage kullanılabilir; Kasa dosyası geçersiz JSON (disk bozulması/elle düzenleme)
- **Gerçek:** loadFile catch'i {ok:false, error: error.message} döndürüyor (ham 'Expected property name ... JSON at position 1'). save(), existing.ok/partial/rawEntries boş olduğu için aynı nesneyi döndürüp hiç yazmıyor; geçerli sürüm/gelecek sürüm kasasında bilinçli koruma var (test 5), fakat ayrıştırılamayan dosya için karantina yolu yok. Probo bunu gerçek geçici dosyayla doğruladı.
- **Beklenen:** Bozuk kasa karantinaya alınıp (.corrupt-*) yeni kasa kurulabilmeli veya kullanıcıya Türkçe, eylemli (dosyayı yedekle/sıfırla) mesaj gösterilmeli; en azından hata metni Türkçeleştirilmeli.
- **Kök neden:** loadFile ayrıştırma hatasını ham Error.message ile döndürüyor; save() bilinmeyen/bozuk kasa üzerine yazmama güvenlik kuralını ayrıştırılamayan dosyaya da uyguluyor, fakat kurtarma yolu eklemiyor.
- **Düzeltme yönü:** loadFile catch'inde bozuk dosyayı '.corrupt-<zaman>' adına taşı (transaction journal'daki gibi) ve save() için temiz kasa kur; hata metnini Türkçe üret.
- **İlgili testler:** tests/secret-store-recovery.test.js, tests/settings-security.test.js
- **Konumlar:**
  - `src/secret-store.js:180` — `SafeSecretStore.loadFile catch` — sha256 `bd843ce1e02e07371a6b829e0b007f9e5554ac20927db11ce6c2e05efae8597b`
  - `src/secret-store.js:193` — `SafeSecretStore.save guard` — sha256 `bd843ce1e02e07371a6b829e0b007f9e5554ac20927db11ce6c2e05efae8597b`
  - `src/secret-store.js:226` — `SafeSecretStore.save catch` — sha256 `bd843ce1e02e07371a6b829e0b007f9e5554ac20927db11ce6c2e05efae8597b`
- **Kanıt:**
  - `logs/Tpkg10-N0999.stdout.txt`
  - `probes/p50-settings-secret-atomic.js (kesik + kullanici-geribildirimi)`


## 4. Kanıt ve konum doğrulaması

- Tüm bulgu konumları gerçek dosyalara işaret ediyor; her `sha256` 64 karakter.
- **B05-01** için tekil `location` → `locations[]` düzeltildi ve `tools/voxcpm2/dub_resume.py` karması yeniden hesaplandı (`3222608a51eafe754ec0b8d56ba5b229033760be3d863a28196ac0e55b78d31c`).
- **F33-01** karması 19d5fb49 revizyonunda hesaplandı; `src/media-workflows.js` PR #541–#543 ile değiştiği için final HEAD karmasıyla **eşleşmiyor**. Değer uydurulmadı; `FINDINGS.json > location_verification.mismatches_at_final_head` ve `SNAPSHOT.json` içinde revizyon kanıtı olarak duruyor.
- Satır kanıtları `logs/TpkgNN-<id>.stdout.txt` dosyalarındadır; matristeki 849 PASS/SUSPECTED/INCONCLUSIVE satırın tamamının kanıt yolu gerçek dosyaya çözülüyor (151 NOT_APPLICABLE satırında kanıt alanı boş).

## 5. Engellenen / koşulmayan / uygulanamaz

- **BLOCKED_ENV:** 0 satır. **NOT_RUN:** 0 satır. **MIXED_REVISION satırı:** 0 (paket düzeyinde revizyon uyarısı ayrıdır).
- **NOT_APPLICABLE:** 151 satır; teknik gerekçeler matriste.
- Canlı YouTube/Letterboxd/Cloudflare, ücretli API, GPU/Whisper modeli ve gerçek TTS bu denetimde **kasıtlı olarak** koşulmadı; sentetik fixture ve CPU kullanıldı. Bu alanlardaki PASS'ler modül/state-machine sözleşmesidir, gerçek site/model başarısı değildir.
- UI uçtan uca açılmadığı için altı kökün tamamı SUSPECTED'da bırakıldı.

## 6. Çürütülen / yeniden üretilemeyen iddialar

- **T03-F001** (PDF spoken map Türkçe locale; İngilizce büyük I eşleşmiyor): güncel kaynakta yeniden üretilemedi (N0664).
- **T04-F001** (Letterboxd ZIP giriş sırası): sıralama priority+filename ile deterministik; yeniden üretilemedi (N0766).
- **T04-F002** (aynı reviews.csv iki kez): (başlık,yıl,tarih,metin) anahtarıyla tekilleşiyor; yeniden üretilemedi (N0766).
- **T04-F004** (keşfet önerilerinde 3/5 düğme): `electron-media-discovery.smoke.js` N0820'de geçti; yeniden üretilemedi.
- **i18n-coverage testi** başlangıç HEAD'inde kırmızıydı, ancak gerçek index.html düğümleriyle koşulan N0939 probu EN ve TR metnin tamamen doğru olduğunu gösterdi; kullanıcı etkisi yok, kapı kapsamı eksik.
- **electron-media-home smoke (N0840)** INCONCLUSIVE: renderer içi `querySelector(...).click()` null döndü; stack/adım bilgisi yok. Ürün kökü olarak iddia edilmedi.

## 7. Tutarsızlıklar (düzeltilmedi, raporlandı)

1. **F09-01 / F09-02 matriste yok.** FINDINGS'te SUSPECTED olan bu iki kökün CSV satırları (N0837, N0999) **PASS** ve `finding_ids` boş. CSV talimat gereği değiştirilmedi; bu nedenle matris SUSPECTED sayısı 5 satır (4 kök), FINDINGS ise 6 kök gösterir.
2. **F33-01 sha256** final HEAD'de eşleşmiyor (revizyon; Bölüm 4).
3. **Dokuz NOT_APPLICABLE satırında** teknik gerekçe yerine prob çıktısı (`exit=77 ...`) yazılı: N0227, N0228, N0247, N0248, N0250, N0251, N0267, N0268, N0271. Durum doğru; gerekçe metni zayıf.
4. **pkg01–06 MIXED_REVISION**: satır bazında kesin revizyon yok; FAIL/SUSPECTED sonuçlar final HEAD'de yeniden doğrulanmadan kesin bug sayılmamalı. Paketleme sırasında HEAD PR #544 ile bir kez daha ilerledi; pkg09–pkg10 sonuçları f88541f8'de kaldı.

## 8. Ayrı geliştirme önerileri (bug değil)

- pkg01–03'teki üç davranış gözlemi (diakritiksiz Türkçe kalite kapısı, iptal sonrası delta, `evidenceOf` çeviri anahtarı) **kanıt/konum taşımadığı için** FINDINGS'e alınmadı; `FINDINGS.json > suggestions` (SUG-A01..A03) içinde notlu duruyor.
- M4B/boş disk hata metinlerini çift dilli kalıba taşı (SUG-B01).
- Türkçe katlama için tek `foldSearch` yardımcısı (SUG-B02).
- Letterboxd CSV alanları için tek normalize yardımcısı (SUG-B03).
- i18n kapsam testini `data-en` panelini tanıyacak şekilde genişlet (SUG-C01).
- `electron-media-home` smoke'una adım etiketi/stack ekle (SUG-C02).

## 9. Sınırlar ve dürüstlük notları

- Bu paketleme oturumu **ürün testi koşmadı**, ürün kodunu/testleri/package-lock/venv'i değiştirmedi, commit/push/merge yapmadı. Yalnız bu run klasörüne yazdı.
- Bulguların hiçbiri gerçek Electron arayüzünde uçtan uca doğrulanmadı; bu yüzden FAIL_CONFIRMED değil SUSPECTED'dır.
- `npm test` tamamı koşulmadı; her paket kendi mevcut testlerini ve problarını koştu.
- `screenshots/` boş; gerçek Electron smoke ekran görüntüleri `.uiprev/` altında kaldı ve bu pakete kopyalanmadı.
- pkg01–06 MIXED_REVISION olduğu için sonuçlar final HEAD'in tek bir anlık görüntüsü değildir.

## 10. Kanıt dosyaları (göreli)

- [`FINDINGS.json`](FINDINGS.json) — birleşik şema, öneriler, konum doğrulaması
- [`TASK-MATRIX.csv`](TASK-MATRIX.csv) — 1.000 satır, CSV durumları birebir
- [`SNAPSHOT.json`](SNAPSHOT.json) — revizyon haritası, commit listesi, kirli dosyalar
- [`RUN-LOG.jsonl`](RUN-LOG.jsonl) — tüm alt komutların gerçek çıkışları
- [`REPRODUCE.md`](REPRODUCE.md) — Windows yeniden üretim komutları
- [`MANIFEST.json`](MANIFEST.json) — dosya boyutu/sha256
- Paket raporları: [`pkg01/`](pkg01/), [`pkg02/`](pkg02/), [`pkg03/`](pkg03/), [`pkg04/`](pkg04/), [`pkg05/`](pkg05/), [`pkg06/`](pkg06/), [`pkg07/`](pkg07/), [`pkg08/`](pkg08/), [`pkg09/`](pkg09/), [`pkg10/`](pkg10/)
