# R840 — Review, Debug, Superpowers ve omgskills ile kod incelemesi

1 Kasım 2026. **Yalnız inceleme ve rapor; ürün/test/ayar/bağımlılık düzeltmesi yok.** Önceki raporlar korunmuştur. İncelenen HEAD `f3713c9fe7855f9e9a92bab5fcf65e2d5a69a74d`; karşılaştırma tabanı `d78242ead655c3257b2139d3b5690d7d15c63e26`. Kullanıcı güncel kod ve son ürün değişiklikleri kapsamını seçti.

İnceleme; asistan/iş/sohbet, Letterboxd/Keşfet/yorum analizi, dublaj çeviri bağlamı ve bunların bağlı servislerini kapsar. Ek mevcut-kod taraması ayar/dosya işlemlerini ve browser okuyucusunu ele alır. Bu risk odaklı tarama, repodaki her satırın veya uygulamanın her ekranının eksiksiz denetlendiği anlamına gelmez.

**Doğrulanmış bulgular: dört P2 ve bir P3, toplam beş bağımsız hata.** Bunların hepsi son diff'te yaratılmış yeni regresyon değildir: yeni entegrasyon boşluğu ile önceden bulunan kökün ilk doğrulanması aşağıda ayrılmıştır. İki mimari ve bir kanıt taşınabilirliği önerisi ayrıca tutulur. Kullanıcı sayı istemediği için tekrarlar, yalnız kod kokuları ve kanıtlanmamış kaygılar bug sayısına eklenmedi.

## Kullanılan yöntemler ve gerçek katkıları

| Kaynak | Kullanılan özellik | Bu çalışmada yapılan |
|---|---|---|
| Review | Sabit base/HEAD üzerinde bağımsız Standards ve Spec incelemesi | İki ayrı GPT‑6.1 Sol medium ajanı; standart bulguları ile gereksinim uyumsuzlukları birbirinin yerine geçirilmedi |
| Debug | Tekrarlama, katmanları ayırma, minimal vaka ve karşı örnek | Gerçek servis/parser/çeviri çağrı zincirleri; dış sağlayıcı/ağ sınırı kontrollü; ürün koduna teşhis logu veya düzeltme eklenmedi |
| Superpowers | Kök nedenden önce düzeltme yapmama, bağımsız review ve taze doğrulama | Ana ajan adayları yeniden çalıştırdı; bir hipotez üretim paketleme yolu tarafından çürütüldü; doğru davranışı isteyen kırmızı kontrol ayrıca çalıştırıldı |
| omgskills | Sabit commit ve katalog hash'i doğrulanmış code-review-checklist | Doğruluk, sınırlar, hata yönetimi, mimari, performans, test ve kaynak güveni için kontrol rubriği; otomatik analiz veya güvenlik sertifikası gibi sunulmadı |

omgskills kaynağı: [code-review-checklist/SKILL.md](https://github.com/pfangueiro/claude-code-agents/blob/f343c57ac51bb4a6f4ea6a81dbc83b79ba9bac27/.claude/skills/code-review-checklist/SKILL.md). Tam içerik okundu; `verified:true`, `truncated:false`; kurulum yapılmadı. Yerel plugin sürümleri, kullanılan skill dosyalarının hash'leri, ajan modeli ve kapsam uyarlamaları [methods.json](evidence840/methods.json) içindedir. Bunlar statik kod inceleme/teşhis yöntemleridir; dört plugin'in bağımsız tarayıcı motorlarıyla ürüne otomatik tam tarama yaptığı iddia edilmez.

Review karşılaştırması `git diff d78242ea...f3713c9f -- src backend tests`; ürün değişiklikleri ba04414f, 5ca05b8d ve0096aa6d. Originating issue-tracker dosyası yok; R829 planı, R832 tam yorum sözleşmesi, R836 okuma akışı, AGENTS/CONTRIBUTING/DESIGN ve üretici-tüketici sözleşmeleri kullanıldı. Kullanıcının yalnız rapor talebi nedeniyle skill'lerin düzeltme/uygulama aşamaları yürütülmedi.

## Standards

**Ajan sonucu:** Son diff ve bağlı asistan modüllerinde yeni, bağımsız, doğrulanmış bir standart ihlali/işlevsel asistan bugı bulunmadı. Bu eksen tüm uygulama için “standartlara tam uygun” onayı değildir. Fowler kokuları ölçülmüş hata gibi sayılmadı; proje kuralları genel heuristiklerden üstün tutuldu.

Asistanın değişen plan/onay/kaynak yolları ile thread-store, jobs, collections, workspace sahipliği, flow-state, tool-results ve retrieval komşuluğu incelendi. R815-B98/R830-01 kaynak bütçesi sorunu, R835 sayfa/kitap atıf sorunları ve R837 CR-only SSE tekrarlanmadı. Continuation UI'sı özgün soruyu yeniden gönderiyor; “Continue kelimesi yeni belirsizlik kapısına takılır” şüphesi üretim çağrısıyla desteklenmedi. Proposal süre temizliği ve jobBindings sınırı var; sınırsız bellek kaçağı uydurulmadı.

Bu eksenin kendi mevcut testleri52/52 geçti. Ana ajan daha geniş ama hedefli10 dosyalık çalıştırmada102/102 mevcut testi yeniden doğruladı; **52+102 ayrı testmiş gibi toplanmadı.** Ayrı iki mimari öneri aşağıdadır. [Standards ayrıntısı](evidence840/standards/notes.md), [incelenen tarihsel imzalar](evidence840/standards/registry-reviewed.json).

### Ö840-01 — Planın kavramsal adımlarını gerçek araç referanslarından ayır

`assistant-workflow-plan.js:20–35`, `tool` alanında hem gerçek registry araçlarını hem `choose_translation_source`, `translate_selected_source`, `review_attached_translation` gibi kavramsal işlemleri taşıyor. Mevcut plan salt okunur olduğu için bugün bunların yanlış yürütüldüğü kanıtlanmadı; bu bir bug değil, iç sözleşmenin evrilebilirliği sorunu.

Öneri: `choice/check/action` ayrımı; yalnız action'da doğrulanmış araç referansı; bağımlılık için ayrı, tekil step ID'si. UI'da bunlar teknik sınıf adı olarak gösterilmesin. **Kabul:** Gerçek araçlar registry'de var; kavramsal seçimler çağrılabilir araç gibi görünmüyor; dependency yalnız önceki benzersiz step'e gidiyor; plan izin/kuyruk/uygulama yetkisine dönüşmüyor. R830 kaynak seçtirici veya R839 yeni agent framework'ü önerisinin tekrarı değildir.

### Ö840-02 — Asistan mutasyon politikasını dar bir sahiplik sınırında birleştir

`assistant-agent-service.js:138–196,228–249` kaynak eşitliği, ön koşul kartları, tekrar deneme uygunluğu, ayar snapshot'ı, katalog kimliği, süre bitimi ve gerçek uygulamayı birlikte koordine ediyor. Aynı araç isimleri farklı aşamalarda ayrı kümelerde yer alıyor; tek yetenek değişikliğinde politika noktalarının ayrışma riski var. Bunun gerçekleştiği yeni bir onay atlatma bugı bulunmadı.

Öneri: Yalnız **kabul/snapshot/yeniden doğrulama** kararlarını sahiplenen küçük bir politika modülü. Genel amaçlı ikinci dispatcher veya yeni agent framework'ü eklenmesin. Servis istek/IPC yaşam döngüsünü, provider taşımasını sürdürsün. **Kabul:** Mevcut kaynak/owner/approval regresyonları değişmeden geçer; yeni yetki kazanılmaz; doğrulama tek yerden izlenir. Amaç karmaşıklığı başka dosyaya taşımak değil, ayrı karar kopyalarını azaltmaktır.

## Spec

Gereksinim ekseni üç mevcut davranış uyumsuzluğu doğruladı. İlki yeni tam-yorum entegrasyonunda, ikisi mevcut kodun komşu yollarında. Bunların aşağıdaki ayrı kaynak/sınır kayıtları korunur; Standards sonucu bu hataları maskelemez. [Spec ayrıntısı](evidence840/spec/notes.md), [üretim zinciri probu](evidence840/spec/probe.cjs), [sonuçlar](evidence840/spec/results.json).

### F840-01 · P2 — Tam yorum alt isteğindeki403, normal Browser devamına ulaşmıyor

**Tetikleyici:** Film kimliği ve yorum liste sayfası geçerli/HTTP200; uzun yorumun `/s/full-text/viewing:123/` devam isteği HTTP403 dönüyor. Kullanıcının “Find” akışı `reviews-auto` üzerinden çalışıyor.

**Beklenen sözleşme:** `review-decision-ui.js:178`, doğrudan erişim engellenirse normal Letterboxd penceresinin devam etmek için açılacağını söylüyor. R832, HTTP403 ile normal sandbox BrowserWindow devamını kabul kapsamında anlatıyor. Liste403'ü sınamak, yeni alt isteğin403'ünü sınamak değildir.

**Gözlenen:** Gerçek `registerMediaTools.handle → fetchReviews → expandReviewHtml` zincirinde bütün yorumlar collapsed ise `ok:false`, “No readable non-spoiler reviews found”, Browser çağrısı **0**. Bir tam yorum da varsa `ok:true`, `partial:true`, Browser çağrısı yine **0**. Aynı fixture'da yorum **liste** isteğini403 yapan kontrol, Browser'ı **1 kez** çağırıyor ve başarılı dönüyor.

**Kök:** `letterboxd-reviews.js:31` alt istek hata türünü yalnız incomplete durumuna indiriyor. `letterboxd-auto.js:96,105` genel uyarı/okunabilir yorum yok hatası üretiyor. `media-tools-service.js:138–140` yalnız TimeoutError veya `^Letterboxd HTTP 403\.` mesajını fallback'e alıyor. Bu sinyal tam yorum yolunda korunmuyor.

**Etki ve sınır:** Kullanıcı vaat edilen normal doğrulama penceresine götürülmüyor; örnek eksik kalıyor veya iş başarısız oluyor. Eksik teaser'ın yanlışlıkla tam yorum diye analize alındığı iddia edilmez; o koruma çalışıyor. Ağ ve BrowserWindow adaptörü sentetik, handler/parser gerçektir; canlı Cloudflare sıklığı ölçülmedi.

**Kabul/öncelik:** HTTP erişim engeli, eksik içerik, parse hatası ve iptal ayrılmalı; uygun alt istek403'ü de mevcut Browser devamına ulaşmalı. Bu aynı bugın çözüm ölçütüdür, ayrı öneri sayılmadı. R835 yazar dedup veya önceki “More metnini hiç okuma” hatasıyla aynı kök değildir.

### F840-02 · P2 — Bekleyen public yorum yüklemesi eski film kimliğini hâlâ matched döndürüyor

**Tetikleyici:** `reviews-fetch` Witness/movie123 için başlar. Tam metin devamı beklerken katalogdaki aynı item Another Film/movie999 olur. Bekleyen yanıt özgün Witness metniyle tamamlanır.

**Gözlenen:** Gerçek handler/parser yanıtı `ok:true`, `identity.tmdbId:movie123`, `match.state:matched`; o andaki katalog movie999. Katalog getter'ı yalnız **1 kez** çağrılmıştır. `reviews-auto` ve `reviews-browser` yolları karşı örnek olarak await sonrası ikinci kez item alıp snapshot karşılaştırıyor.

**Kök/kaynak:** `media-tools-service.js:157` selected'ı yakalar; :161 devamı bekler; :163 dönüşte yine bu eski nesneyle matchFilm çağırır. Main'in güncel katalog revizyonu yeniden okunmaz. R832:15, film değişimi ve geç callback kaynak korumasını açıkça anlatır; bu yol aynı korumayı taşımıyor.

**Etki ve sınır:** Geç gelen eski kaynak, yeni item durumuna rağmen doğrulanmış taslak yanıtı olarak dönebilir. Renderer panel yaşam döngüsü ve daha sonraki decision-save snapshot kapıları farklı kontrollerdir. **Diske yanlış analiz kaydedildiği kanıtlanmadı.** Katalog getter ve ağ beklemesi kontrollü, üretim handler/expander/parser zinciri gerçektir; native metadata düzenleme penceresi açılmadı.

**Kabul:** Tam okuma dönüşünde mevcut item/revizyon eşitliği doğrulanmalı; değiştiyse yeniden yükleme istenmeli; iptal ve geçersiz kimlik yolları korunmalı. Eksik guard tabanda da vardır; son commit'in bu satırı ilk yarattığı iddia edilmez. R815-B72 save-time IMDb veya R837 alias kaybı farklıdır.

### F840-03 · P2, koşullu girdi — Yorumcunun TMDB bağlantısı film metadata'sı sayılıyor

**Tetikleyici:** Desteklenen `data-tmdb-id` bulunmayan metadata-link fallback biçimi. Sayfanın gerçek filmi Witness2026/movie123. Yorumcu olağan bir cümlede başka film/movie999'a TMDB bağlantısı verir; gerçek film metadata bağlantısı da sayfada vardır.

**Gözlenen:** Gerçek `reviewPageScript → parseLetterboxdReviews → matchFilm` zincirinde aynı yorumun bağlantısız hali `movie123/matched`; aynı sözcüklü bağlantılı hali `movie999/mismatch`. Tek değişken yorumdaki köprüdür. JSDOM yalnız sayfa DOM sınırıdır; üretimde kullanılan çıkarım script'i ve parser çalıştırılmıştır.

**Kök:** `letterboxd-reviews.js:136` TMDB linklerini yorum/metadata kapsamına göre ayırmadan kopyalar. :103, `data-tmdb-id` yoksa HTML'deki ilk TMDB movie linkini kimlik sayar. `filmImdbId` :39–50, özellikle :48 ise başka sağlayıcı için yorum linklerini zaten ayırıyor; mevcut iyi örnek vardır.

**Etki ve sınır:** Doğru filmin yorumları, başka filme yapılan normal atıf nedeniyle reddedilebilir. Gerçek `data-tmdb-id` varsa öncelikli olduğu için bu varyant oluşmaz. Canlı sitede bugün hangi sayfaların bu fallback biçimini kullandığı ölçülmedi; bütün Letterboxd sayfaları bozuk denmez. Mevcut kod bulgusudur, yeni diff regresyonu değildir.

**Kabul:** Film metadata'sının sağlayıcı kimliği yorum içeriğinden ayrılmalı; birden fazla çelişen metadata varsa sessiz ilk-link seçimi yerine unverified/mismatch politikası açık olmalı. R835 yazar tekilleştirme ve R837 profil başlık eşlemesiyle farklı köktür. Bağlantı varlığı tek başına bir güvenlik açığı veya hesaba erişim iddiası değildir.

## Debug — Dublaj kaynak bağlamında bağımsız doğrulama

### F840-04 · P2 — Ayrı sahneler rol inceleme isteğinde aynı sahne etiketiyle birleşiyor

**Tetikleyici A:** Kaynakta0–2 ve5–7 saniyelerde iki ayrı çoklu şahıs cümlesi; `translate_scene_gap=2`. Gerçek ana sınır fonksiyonu ikinci cue'yu yeni sahne olarak tanır.

**Tetikleyici B:** Varsayılan8sn eşik, ikinci cue `EXT. GARDEN.` mekan işaretiyle açılır. Ana sınır fonksiyonu yine yeni sahne bulur.

**Gözlenen:** Her ikisinde ana `detect_scene_boundaries` sonucu `[1]`, gerçek rol isteği `source_items.scene:[0,0]`. Aynı iki cue'yu varsayılan8sn ve mekan işareti olmadan veren güvenli kontrolün ana sonucu `[]`; `[0,0]` burada doğrudur. İki tetik aynı köktür, iki bug sayılmadı.

**Kök:** `transcribe.py:4351–4352` özel eşik ve mekan işaretini tanıyan kanonik sınırı kullanırken `speech_relations.py:43–46` yalnız hardcoded8sn ile sahne numarasını yeniden oluşturur. Caller'ın scene bilgisi payload'a taşınmaz. Kaynak rol prompt'u farklı sahnelerde zamir çözülmemesini ister; verilen scene etiketleri bu sözleşmeyle çelişir.

**Etki ve sınır:** Bağımsız rol okuyucu iki konuşmayı aynı sahne olarak alır; rol bağlamı yanlış birleşebilir. **Canlı modelin yanlış rol çıkardığı, çevirinin bozulduğu veya sesin yanlış üretildiği kanıtlanmadı.** Kontrollü model doğru metni döndürdü; iki cue korundu, warnings boştu. Kanıt yanlış istek metadata'sıdır.

**Köken/kabul:** Sınırı kopyalayan algoritma önceden mevcut. ba04414f çoklu şahıs cümlelerini de risky yaparak bu yolun kapsamını büyütür; literal8'in bu commit'te eklendiği söylenmez. Rol çağrısı gerçek caller sahne kimliğini taşımalı; eşik/mekan kontrollerinde `[0,1]`, güvenli kontrolde `[0,0]` kalmalı. R734 rol incelemesi tasarımını anlatır ama bu caller uyumsuzluğunu raporlamaz; R815 cache bağlamı kökleri ayrı.

[Üretim probu](evidence840/parent/probe.py), [payload/karşı örnekler](evidence840/parent/speech-result.json), [ana notlar](evidence840/parent/notes.md). Standards ajanı bulguyu bağımsız tekrar çalıştırıp kabul etti. `--expect-correct` kontrolü beklenen exit1 üretir; bu, onarım yapılmadığını gösterir.

## Ek mevcut-kod taraması — Browser ve dosya işlemleri

### F840-05 · P3 — Okuyucunun kendi A+/Kapat düğmeleri ana pencere durumunu güncellemiyor

**Tetikleyici:** Gerçek reader IPC ile makaleyi20px aç; okuyucu içindeki A+ düğmesine basıp21px yap; yine okuyucunun kendi Kapat düğmesine bas. Gezinme, tab unload veya hesap değişimi gerekmez.

**Gözlenen:** Gerçek script'in controller'ı21px, main tercihi hâlâ20px. Kapat sonrası reader host/controller yok; main `readerActive:true`, yalnız ilk açılışa ait1 event var. Sonraki toolbar toggle okuyucuyu20px tekrar açıyor: düğme etkin/kapat durumundayken gerçekte okuyucu kapalı, son yazı boyutu unutulmuş. **Karşı kontrol:** A+ ardından gerçek IPC close, main'i inactive/font21px yapıyor.

**Kök:** `browser-reader.js:162–170` kendi kontrolleriyle sayfa durumunu değiştirir; `main.js:15796–15800` ise yalnız browser:reader IPC sonucunda state/preferences toplayıp yayınlar. İç eylemler için ana sürece eşdeğer bildirim yolu yok. `renderer.js:7771–7782` chrome active/aria-pressed değerini bu eski main state'inden kurar; oturum snapshot'ı main'deki eski tercihi kullanır. Font ve Kapat aynı bildirim eksikliğidir, iki ayrı bug sayılmadı.

**Kanıt ve sınır:** Gerçek handler kaynak dilimi VM'de, gerçek reader script'i/gerçek düğmeler JSDOM WebContents adaptöründe yürüdü; kapalı shadow-root yalnız gözlem için tutuldu. Native Electron görüntüsü veya gerçek font pikseli ölçülmedi. Ana ajan probu bağımsız tekrar çalıştırdı. [Probe](evidence840/browser/probe.cjs), [sonuç](evidence840/browser/results.json), [ayrıntı/dedup](evidence840/browser/notes.md).

**Kabul:** İç eylemlerden sonra chrome ve kalıcı tercihler gerçek snapshot'la senkron kalmalı; kapat/aç21px'i korumalı; sender/generation kontrolleri gevşetilmemeli. Eski R42-B131 farklı unload→restore yaşam döngüsüdür; bu mevcut-kod bulgusu eski hatanın yeni regresyonu diye sunulmaz.

Ayrı ayar/dosya taraması yeni bağımsız bug doğrulamadı. Güvenli ayar içe/dışa aktarma, subtitle shift ve atomik yazma yollarının sınırları [system/notes.md](evidence840/system/notes.md) içinde kayıtlıdır; native diyalog/OS kesintisi kabulü yoktur.

## Ayrı kanıt kalitesi önerisi

### Ö840-03 — Metin ve binary checksum kurallarını açıkça ayır

R839 commit öncesi raw snapshot'ındaki12 dosya, Windows Git checkout sonrası raw-byte olarak0/12 eşleşiyor; LF normalizasyonuyla11/12. DEVIR indeksinin önceki karma satır sonları ayrı fark yaratıyor. Bu eski snapshot'ın alındığı anda yanlış olduğu veya metinlerin kaybolduğu anlamına gelmez. [Salt okunur ölçüm](evidence840/parent/hash-portability.json).

Öneri: Metinde UTF-8/BOM ve CRLF→LF normalizasyonunu açık sürümlü hash modu olarak belirt; görüntü/ses/ZIP/exe için raw-byte hash kullan. Ürün koduna müdahale gerekmez; kanıt manifesti sözleşmesidir. **Kabul:** Aynı metin Linux/Windows checkout'unda aynı kanonik hash'i verir; gerçek karakter değişikliği yakalanır; binary'de bir byte değişimi farklı hash verir. R838/R839 bu işte düzeltilmedi veya silinmedi. Bu raporun kendi metin hash modu manifestte açık tanımlanır.

## Kapsam, tekrar sayılmayanlar ve çürütülen iddialar

- Night1000 README ve ilgili F01–F05/F09/F13–F15/F18/F40/F46/F47/F48/F50 imzaları incelendi; ilgili satırlar alan kayıtlarında saklandı. Tarihsel PASS bugünün kabulü yapılmadı; bütün1000 tekrar koşulmadı.
- R815/R818–R839 ve ilgili eski rapor kökleri karşılaştırıldı. Bilinen kaynak bütçesi, S1/B1-0 atıf, spoiler history, feedback namespace, author-dedup, alias/rewatch ve CR-only SSE tekrarları yeni sayılmadı.
- Riskli/normal cümle paketlerinin ara öncülü düşürdüğü ilk hipotez **çürütüldü**: üretim pack_sentence_groups ardışık olmayan grupları ayırıyor, ikinci istek ELIF öncülünü koruyor. Yalnız helper'a bakılarak bug yazılmadı.
- Settings import'un birden çok store'u aynı transaction'a almaması kaynak incelemesinde takip konusu oldu; gerçek başarısız store/IPC vakası üretilmediğinden veri kaybı bugı sayılmadı.
- Kuyruk ve VTT sorunlarının eski R833/R820 kökleri tekrar sayılmadı. Büyük dosya, kısa değişken adı veya test sayısı tek başına bug değildir.

## Doğrulama ve açık kalan kabul alanları

Ana ajan10 mevcut Node dosyasında **102/102**, mevcut Python rol testinde **14/14** başarı gördü. Ajanın ilk52 kontrolü102 içinde yer alır; tekrar toplanmaz. Ayrı system taramasında iki Node file-test geçti; kendi iç10+12 assertion sayısı22 bağımsız yeni uçtan uca test diye sunulmaz. [Komutlar ve çıkış kodları](evidence840/parent-verification.json).

Film probu dört servis senaryosu + iki DOM kontrolünde mevcut hatayı ve güvenli karşı örnekleri doğrular. Python probu mevcut yanlış metadata'yı yakalar; `--expect-correct` **beklenen başarısız kontrol** olarak exit1 döner. Bu, mevcut14 regresyon testinin başarısızlığı veya bir düzeltmenin geçtiği iddiası değildir. İlk ajan normal Node test worker'ı sandbox spawn EPERM ile başlamadı; `--test-isolation=none` ile test gövdeleri çalıştı. Ortam hatası ürün bugı sayılmadı.

Gerçek servis/parser/disk yollarının kullanıldığı ve kontrollü sınırlar alan notlarında açıklanır. Tam npm paketi/CI, normal `start.bat`, temiz `install.bat`, native Windows UI/DPI/ekran okuyucu, DRM/GPU, canlı Letterboxd/Cloudflare/hesap, ücretli sağlayıcı, öneri kalitesi, gerçek çeviri/ses doğallığı ve uzun video/soak bu tur doğrulanmadı. CI kapatılmadı; sonucu beklenmedi. Güvenlik/bağımlılık envanterinin tamamına temiz raporu verilmez.

**İnceleme kararı:** Bulgular açık; ürün davranışı için tam onay verilmiyor. Kullanıcının talebi gereği hiçbir düzeltme uygulanmadı. Standards ekseninde0 doğrulanmış yeni ihlal/bug ve2 mimari öneri; Spec ekseninde3 davranış uyumsuzluğu (en belirgin entegrasyon boşluğu F840-01); bağımsız Debug incelemesinde1 sahne sözleşmesi hatası; ek browser taramasında1 durum senkronizasyonu hatası. Kanıt taşınabilirliği önerisi ürün buglarına dahil değildir.
