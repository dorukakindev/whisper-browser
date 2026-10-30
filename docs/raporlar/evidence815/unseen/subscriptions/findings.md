# R815 — yeni alan: yerel abonelikler

5 doğrulanmış P2 kök; ürün/test/Git/docs değişmedi. HEAD `db65f2e7f6e7b50649c440cb183cb88863ebf241`. Kanıt: `results.json`; çalıştırma: `$env:AUDIT_HEAD = git rev-parse HEAD; node .tmp/unseen815-subscriptions/probe.cjs`.

Sınır: Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

## Kapsam matrisi

|Kaynak/tetikleyici|Eski kapsam ilişkisi|Yeni incelenen sınır|Bakılmayan sınır|
|---|---|---|---|
|src/subscriptions-io.js + renderer30962–31025 / JSON501 → gerçek import click → localStorage → reload|1000senaryoda açık abonelik anahtar eşleşmesi yok|Modül1000/UI500 ve kalıcı kayıt zinciri|Gerçek Windows dosya seçici; 2MiB sınırı aşan dosya|
|src/subscriptions-io.js12–67 + renderer31007 / Unicode çıplak/URL ve case-varyant handle|Açık handle/subscription aile eşleşmesi yok; tarihsel modül testleri var|Gerçek ekleme callback’i ve import kimlik karşılaştırması|Canlı handle sahipliği; Unicode casefold/normalizasyon tüm dilleri|
|src/subscriptions-io.js154–158 / Handle-only OPML export/own roundtrip|Tarihsel OPML export/parse testleri var|RSS xmlUrl tüketici sözleşmesi|Üçüncü taraf RSS okuyucusu ve canlı YouTube endpoint; bug sayılmadı|
|renderer29137–29185,31128–31164,32040–32043 / İlk açılış → force:true → TTL expire|R815103 içinde bu cache yok; açık abonelik senaryosu yok|Yenile force parametresinin yerel dala taşınması|Hesaplı YouTube/Invidious abonelik dalı|
|main19833–19900 + renderer31146–31161 / Gerçek handler → loopback503 → gerçek panel|R160/R354 bounded read/redirect geçmişi var; hata durumunun UI tüketimi ayrı|Tam kaynak arızası başarı/boş akış ayrımı|Canlı CDN, redirect sınırları, proxy/TLS, gerçek networkOnline olayları|

## UN-SUB01 — 501 kanallı içe aktarma başarılı görünürken son kanal kalıcı kayıttan düşüyor (P2)

**Kaynak:** src/renderer/renderer.js:30972 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/renderer/renderer.js:31020 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/subscriptions-io.js:11 SHA256 `cc5c51e5cf32a0bbacaddbf6bf0c409530ffe6a4f6ed204774abde2eea0d5776`

**Tekrar:** 501 ayrı sentetik UCID JSON dizisini gerçek İçe aktar düğmesinin callback’iyle yükle; canlı stSubs ile localStorage ve yeniden yüklenen listeyi karşılaştır.

**Beklenen:** Ya tüm kabul edilen kanallar kalıcı saklanmalı ya kapasite aşanlar eklenmeden açık sayıyla reddedilmeli.

**Gözlenen:** UI “501 kanal içe aktarıldı (json).”; canlı liste 501, localStorage 500, tekrar yüklemede 500. UC0000000000000000000500 kayboluyor.

**Kök:** Parser 1000 giriş kabul ediyor; import döngüsü ST_SUBS_MAX kontrol etmiyor; saveStSubs yalnız ilk500 girdiyi sessizce yazar.

**Etki:** Başarı bildirimi alan kullanıcı uygulamayı kapattığında aboneliğini kaybediyor; yeniden export canlı fazlalığı içerirken yeniden açılış içermiyor.

**Önceki ilişki:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır / karşı kontrol:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** 499 mevcut+2 yeni ve boş+501 girişte kabul/ret/persist/reload sayıları tutarlı; kayıp veya sessiz kırpma yok.


## UN-SUB02 — Kanal ekle kutusu geçerli Türkçe handle’ı çıplak biçimde reddediyor (P2)

**Kaynak:** src/renderer/renderer.js:31007 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/subscriptions-io.js:12 SHA256 `cc5c51e5cf32a0bbacaddbf6bf0c409530ffe6a4f6ed204774abde2eea0d5776`; src/subscriptions-io.js:30 SHA256 `cc5c51e5cf32a0bbacaddbf6bf0c409530ffe6a4f6ed204774abde2eea0d5776`

**Tekrar:** Kanal ekle callback’ine önce @çağrı, temiz fixture’da https://www.youtube.com/@çağrı ver.

**Beklenen:** Kutunun vaat ettiği @handle girdisi, aynı handle URL’siyle aynı kanal kaydını oluşturmalı.

**Gözlenen:** @çağrı: sıfır kayıt ve “Kanal tanınamadı.”; URL biçimi: bir kayıt ve hata yok.

**Kök:** UI çıplak handle için ASCII \w düzenli ifadesi kullanıyor; normSub Unicode harfleri kabul ediyor fakat url alanındaki çıplak handle URL olarak çözülemiyor.

**Etki:** Türkçe/uluslararası kanal adlarını yönergede belirtilen kısa biçimde ekleme engelleniyor.

**Önceki ilişki:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır / karşı kontrol:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** Türkçe karakterli çıplak ve yüzde kodlu/tam URL handle girdileri aynı normalize kayda dönüşmeli.

Resmî sözleşme: [support.google.com](https://support.google.com/youtube/answer/11585688?hl=en), [blog.youtube](https://blog.youtube/inside-youtube/international-handles/).

## UN-SUB03 — YouTube handle kimliği harf büyüklüğüne göre iki ayrı abonelik sayılıyor (P2)

**Kaynak:** src/subscriptions-io.js:60 SHA256 `cc5c51e5cf32a0bbacaddbf6bf0c409530ffe6a4f6ed204774abde2eea0d5776`; src/renderer/renderer.js:30974 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/renderer/renderer.js:30979 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`

**Tekrar:** Gerçek stSubToggle ile @NewsFeed ve @newsfeed ekle; aynı ikiliyi gerçek parseSubscriptions ile JSON’dan geçir. Karşı kontrol olarak @newsfeed’i iki kez parse et.

**Beklenen:** YouTube case-insensitive handle kimliğine göre bir abonelik; görüntü biçimi korunabilir.

**Gözlenen:** Toggle ve import parser ikisi de iki ayrı kayıt tutuyor; birebir aynı handle iki kez verilince bir kayıt oluyor.

**Kök:** Kimlik anahtarında handle için case normalization yok; UCID ve handle aynı case-sensitive string yolu kullanıyor.

**Etki:** Aynı kanal iki kez listelenir, kota tüketir; başka harf biçiminden abonelik denetimi/çıkışı tutarsızlaşır.

**Önceki ilişki:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır / karşı kontrol:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** ASCII case varyantları tek abonelikte birleşmeli; UCID harf büyüklüğünün anlamı korunmalı.

Resmî sözleşme: [support.google.com](https://support.google.com/youtube/answer/11585688?hl=en).

## UN-SUB04 — Yerel aboneliklerde Yenile komutu beş dakikalık önbelleği aşamıyor (P2)

**Kaynak:** src/renderer/renderer.js:32043 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/renderer/renderer.js:29143 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/renderer/renderer.js:29180 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/renderer/renderer.js:31144 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`

**Tekrar:** Hesapsız subscriptions bölümünü gerçek renderSmartTubeSection ile aç, ardından gerçek Yenile callback’inin çağırdığı {force:true} ile tekrar aç. Cache zamanını sıfırlayıp üçüncü kez çağır.

**Beklenen:** Açık Yenile eylemi aynı liste için yeni akış isteği yapmalı.

**Gözlenen:** İlk açılış+force:true toplam1 API çağrısı; cache süresi geçmiş karşı kontrolde toplam2. Testte errors=0; ağ hatası gerekmiyor.

**Kök:** Üst işlev opts.force okur fakat yerel abonelik dalı renderStSubsPanel/renderStSubsFeed’e force iletmiyor; alt işlev yalnız TTL/anahtar kontrol ediyor.

**Etki:** Kullanıcı yeni yüklenen videoları istemesine rağmen eski akışta kalır; TTL dolmadan düğme etkisizdir.

**Önceki ilişki:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır / karşı kontrol:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** Taze cache ile normal yeniden açış çağrısız; açık Yenile her seferinde tek yeni istek üretmeli.


## UN-SUB05 — RSS kaynağındaki tüm istekler başarısızken kullanıcıya boş akış gösterilip başarı önbelleği yazılıyor (P2)

**Kaynak:** src/main.js:19883 SHA256 `93f0b76d0f463599bea346e9e0b4fd2714ab2bfa4b0bd9c265e94e02908a514b`; src/main.js:19900 SHA256 `93f0b76d0f463599bea346e9e0b4fd2714ab2bfa4b0bd9c265e94e02908a514b`; src/renderer/renderer.js:31148 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/renderer/renderer.js:31152 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`; src/renderer/renderer.js:31158 SHA256 `6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93`

**Tekrar:** Orijinal subs:rssFeed IPC handler’ını tek sentetik UCID ile çağır; yalnız fetch hedefini loopback HTTP503 sunucusuna yönlendir. Orijinal yanıtı gerçek renderer abonelik paneline ver.

**Beklenen:** Hiçbir kanal alınamadığında hata/yeniden dene durumu; geçerli boş kanal sonucu ile kaynak arızası ayrılmalı.

**Gözlenen:** Gerçek handler: ok:true,videos:[],errors:1. Renderer “Akışta video yok.” yazar ve errors:1 yanıtını taze beş dakikalık akış cache’ine koyar.

**Kök:** Main tümü başarısız sonucu da ok:true döndürür; renderer errors alanını cache’e taşır fakat hiç yorumlamaz.

**Etki:** Sunucu kesintisi veya HTTP hatası yeni video olmadığı bilgisine dönüşür; kullanıcı doğru teşhisi ve hemen tekrar deneme fırsatını kaybeder.

**Önceki ilişki:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır / karşı kontrol:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı. Main sender/online guard’ı yetkili/online fixture; fetch gerçek Node HTTP isteğini yalnız 127.0.0.1’e yaptı. HTTP503 gövde okunmadan reddedildiğinden bounded-reader stub çağrılmadı. UN-SUB04’ten bağımsız olarak ilk cache-miss istekte hata oluşur; force aktarımı düzeltilse bile yanlış boş mesaj devam eder.

**Kabul ölçütü:** HTTP503/tüm timeout ve geçerli boş Atom feed ayrı durumlar; kısmi hatada alınan videolar gösterilirken eksiklik görünür.


## Sayılmayan ek gözlemler / öneriler

- **Handle-only OPML RSS adresinde boş channel_id:** Çıktı kusuru belirgin: htmlUrl geçerli handle fakat xmlUrl channel_id boş; kendi importer htmlUrl önceliğiyle gizliyor. Üçüncü taraf okuyucu/canlı endpoint doğrulanmadığı için strict sayımdan ayrı tutuldu. Handle’ı UCID’ye çözümle veya RSS aktarımı yapılamayan girdileri açık sayıyla bildir; kabul: her type=rss outline tüketilebilir kanal beslemesini göstermeli. [Resmî OPML sözleşmesi](https://opml.org/spec2.opml).
- **30 kanal sabit bütçe ve skipped metriği:** Main ilk30 kanal sonrası duruyor; tüketilen channels dizisi boşaldığı için skipped=raw.length oluyor. Mevcut UI skipped okumadığından ayrı maddi bug sayılmadı. Kanal başına güncelleme durumu/rotasyon ve doğru işlenen-atlanan sayıları; kabul: 31kanallı listede hiçbiri süresiz görünmez kalmamalı ve sayılar toplamla tutarlı olmalı.

## Doğrulama sınırı

Electron veya başka native süreç başlatılmadı. Tek loopback HTTP sunucusu finally server.close ile kapatıldı. Probe childprocess başlatmaz; HEAD PowerShell env ile verilir. Yenileme ve hata kökleri ayrı: UN-SUB04 errors=0 yanıtıyla force kontratını bozar; UN-SUB05 ilk istekte hata ayrımını bozar. Unicode girdi kabulü ile case-normalizasyonu da ayrı sınırlar: ASCII-only düzeltmesi case tekilleştirmesini sağlamaz. Native UI, canlı hesap ve üçüncü taraf RSS başarısı iddia edilmedi.
