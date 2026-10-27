# Rapor 656 — shuaiapi Sol 6.1 ve DeepSeek V4.1 canlı karşılaştırması

Ürün değişmedi: başlangıç/bitiş ürün revizyonu `62f985cdc1621cd89d5d83bd02eb09ecd038e199`. Dal `codex/shuai-sol-comparison656`. 27 Ekim 2026.

## Yöntem ve sınırlar

Kullanıcının açık isteğiyle kasada kayıtlı shuaiapi anahtarı yalnız bellekte ve `https://oai.sb/v1` Authorization isteğinde kullanıldı. İstenen model kayıtlı `gpt-6.1-sol`. Bu, shuaiapi'nin sunduğu model etiketidir; sağlayıcının arka plandaki ağırlık kimliği bağımsız doğrulanmadı. Ayarlar değiştirilmedi, kartlar gerçek uygulamaya uygulanmadı, üretim başlatılmadı. DeepSeek sonuçları [R655](BROWSER_BUG_REPORT_655.md) aynı ürün kodu ve aynı sentetik metinlerle birkaç dakika önce alınan standart katman sonuçlarıdır. Ağ/yük ve ardışık ölçüm farkı var; istatistiksel benchmark veya genel model sıralaması değildir.

Gerçek uygulama normal/speech/refine sistem promptları, dört aynı kaynak metin, `items`/`sentence_groups`/bağlam payload'ı ve beş aynı asistan sorusu kullanıldı. Asistan `assistant-provider.run` üzerinden gerçek canlı modelle; araç kanıtları kontrollü sentetik yanıtlardı. İsteklerde Flex alanı yok. Sözcük seçimi manuel kaynak karşılaştırmasıyla değerlendirildi; bağımsız kör puanlayıcı yok.

## Kalite karşılaştırması

| Alan | DeepSeek V4.1 Flash | shuaiapi gpt-6.1-sol |
|---|---|---|
| 1924 / 1942 ve olumsuzluk | Doğru | Doğru |
| Maya/Leyla kime teşekkür ediyor | Doğru; normal geçişte özne örtük | Doğru; özne daha açık |
| Yüzde 15 / azaltabilir / garanti etmez | Doğru | Doğru |
| İronik another two-hour delay | İlk üç üretim-biçimi geçişinde “Bir iki saatlik gecikme” ile kesin süre belirsiz | Üçünde de “Yine iki saatlik…” ile kesin süre korundu |
| Speech refine | “Bir de iki saatlik gecikme” ile hatayı giderdi | “Yine iki saatlik bir gecikme. İhtiyacımız olan da tam buydu.”; süre/ironi korundu |
| JSON / kimlikler | Beklenen çıktı döndü | Dört geçişin tümünde JSON parse, 4/4 ID ve sentences/items birebir eşitliği geçti |
| Kaynak içi saldırgan yönerge | Uygulamadı | Uygulamadı |
| Bilinmeyen anne adı | İsim uydurmadı; tüm video için fazla kesin konuştu. Hata veren aramayı sonuç yok gibi sundu | “sağlanan metin bölümünde” diyerek kapsamını doğru sınırladı; arama çağırmadı |

Önemli sınır: Sol arama aracını çağırmadığından onun araç hatası ile boş sonuç ayrımını geçtiği söylenemez. Bu senaryoda yalnız kaynak sınırı anlatımı daha iyi. “Guard” her iki modelde gardiyan/güvenlik/bekçi/muhafız arasında değişti; kaynak bağlamı mesleği kesinleştirmediği için mutlak doğru çeviri puanı verilmedi. Sol bazı normal çıktıları daha çok satıra sardı; görsel yerleşim ayrı üretim katmanıdır, burada tam SRT oynatımı test edilmedi.

## Asistan komutları ve süreler

| Aynı soru/akış | DeepSeek | Sol |
|---|---:|---:|
| Bağlamı özetle (2 istek) | 3,736 s | 6,157 s |
| tiny / beam 3 ayar kartı (3 istek) | 7,442 s | 41,889 s |
| captured-en 5–25 s / tr / forSpeech kartı (3 istek) | 7,581 s | 11,035 s |
| Saldırgan kaynak özeti (2 istek) | 6,611 s | 7,039 s |
| Eksik bilgiye yanıt | 4,306 s / 2 istek | 5,933 s / 2 istek |

Her iki model doğru ayar ve çeviri araçlarını, değerlerini seçti; yapılmamış kartı uygulanmış gibi anlatmadı; çeviri akışında Whisper başlatmadı. Sol, kaynak manifestinde verilen track kimliğini kullandı; DeepSeek list_subtitle_tracks ile de okudu. Bunlar gerçek model araç seçimi kanıtlarıdır; gerçek UI uygulaması bu turda yapılmadı.

Normal çeviri DeepSeek 5,197 s / Sol 10,472 s; speech 4,160 / 12,493; speech tekrar 5,953 / 12,089; refine 5,828 / 22,593. Tek speech+refine örneğinde yaklaşık 9,99 / 35,09 s. Özellikle Sol ayar turunda gecikme artışı görüldü; bunun modele mi shuaiapi rota yoğunluğuna mı ait olduğu ayrıştırılmadı. Fiyatlar sağlayıcılar arasında karşılaştırılmadı.

## Karar

Bu küçük örneklemde kalite odaklı ses için çeviri/son kontrol için Sol tercih edilebilir: kesin süreyi ilk geçişte daha iyi korudu, bağlam sınırını daha dikkatli anlattı. Hızlı günlük asistan için DeepSeek daha kısa sürdü ve iki esas komut kararında aynı doğru araçları seçti. “Sol her durumda daha iyi” veya “DeepSeek kötü” sonucu yok. Kullanıcı varsayılanı değiştirilmedi.

Kanıtlar: [asistan](SHUAI_SOL_COMPARISON_2026-10-27/live656-results.json), [normal/speech](SHUAI_SOL_COMPARISON_2026-10-27/live656-production-results.json), [refine](SHUAI_SOL_COMPARISON_2026-10-27/live656-refine-results.json). Sır desen kontrolü, JSON parse ve sözleşme alanları doğrulandı. Kişisel veri, anahtar veya ham profil yayımlanmadı. Ürün kodu/testleri değişmedi; canlı GPU/video/ses/UI/start.bat ve tam test/CI koşulmadı. CI açık, beklenmedi.
