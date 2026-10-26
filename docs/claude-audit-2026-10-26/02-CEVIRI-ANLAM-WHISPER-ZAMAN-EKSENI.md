# Görev02 — Çeviri, anlam koruması ve Whisper zaman ekseni

Bu görev için ZIP içindeki 00-START-HERE.md ve KNOWN-STATE.md geçerlidir. Baseline read-only; yeni probe/fixture/raporlar audit-output/ altında. Güncel kaynak kimliğini ve bağımlılıkları doğrula. Kontrol edemediğin gerçek model davranışını statik/fake başarıyla eşitleme.

## Sonuç hedefi

Kullanıcı ses için çeviride özetlenmiş, öznesi/sayısı/olumsuzluğu değişmiş veya bağlamı kopmuş Türkçe istemiyor. Aynı zamanda normal altyazı ile dublaj metni birbirini bozmamalı. Gerçek model anahtarı olmadan da bu hattın sözleşme ve koruma açıklarını bulabilirsin; “model kötü çevirdi” demek için gerçek çıktı kanıtı gerekir.

Önce backend/{transcribe,translate_planner,translation_memory,translation_auth}.py; src/{browser-translation-scheduler,browser-translation-integrity,translation-endpoints,dub-editor-request,dub-text-guard,subtitle-sentence-layout,subtitle-output-contract}.js; tools/voxcpm2/{dub_plan,dub_finish,dub_quality}.py ve main/preload/renderer seçenek zincirini oku. KNOWN-STATE'deki v6 ve negatif ek düzeltmelerini eski halleriyle yeniden raporlama.

## A — Gerçek sözleşme ve kaynak kapsamı

| ID | Araştırma | Kanıt koşulu |
| --- | --- | --- |
| T01 | UI'daki normal/ses için çeviri seçeneklerini argv/env/prompt/cache/output'a kadar izle. | Kaybolan veya yanlış default'a düşen seçenek varsa gerçek çağrı grafiği; yoksa sözleşme tablosu. |
| T02 | Kaynak/çeviri/dublaj metninin üç ayrı kimliğini çıkar. | Dublaj editörü kaynak SRT'yi veya normal çeviriyi değiştirmesin; dosya byte karşılaştırması. |
| T03 | Kaynak1–3cümle birkaç cue'ya bölünsün veya tek cue'da birleşsin. | Anlam bağlamı korunmalı; görsel satır sarma ile zaman bölme karıştırılmamalı. |
| T04 | İki konuşmacı, tireli diyalog, kısa Evet/Hayır ve zamirli yanıt oluştur. | Komşu kişi/cümle hedefe kopyalanmasın; gruplama kimliği konuşmacı sınırını kaybetmesin. |
| T05 | Aynı metin farklı önceki/sonraki bağlam, model, hedef dil ve endpoint ile gelsin. | Cache anahtarları gerektiği yerde ayrışsın; aynı iş gereksiz ayrışmasın. |
| T06 | In-flight ayar/provider/terminoloji değişimi ve kuyrukta donmuş seçenekleri karşılaştır. | Bir işin yarısı farklı sağlayıcı/anahtarla gitmesin; aktif ve sonraki iş ayrımı açık olsun. |

## B — Anlam için zor, çift yönlü örnekler

T07: Türkçe olumsuzluk için emir/istek/geçmiş/geniş/gelecek/yeterlilik ve zarf-fiil aileleri üret. Hem kaynak→öneri hem ters yönü dene. İsim olan çalışma/dondurma/görüşme, özel ad, alıntı, soru ve koşullu “gelmezse” karşı örneklerini beraber kullan. Regex'i tüm kelimelere yaymak çözüm değildir.

T08: “Sadece üçü”, “üçü hariç”, “en az/en fazla”, “henüz”, “artık”, “belki”, “mutlaka”, “gerekmiyor” gibi küçük farkları uzun metne gizle. Benzerlik>%95 iken anlamı tersleyen değişimleri ara. Guard'ın tam semantik çözümleyici olmadığını saklama; hangi sınırlı kanıt güvenle uygulanabilir açıklansın.

T09: Çoklu/tekrarlanan miktarlar, sayı ile birimin yer değiştirmesi, +/- işaret, yüzdeler, para birimi, bilimsel üs ve oran/ölçekleri dene. Sayıların sıralı torbası eşitken ilişkileri tersine çeviren karşı örnekler üret. Bir sayının varlığı iki tekrarın yerine geçmesin.

T10: Türkçe binlik/ondalık/tarih/saat/sürüm/IP/telefon/ID örneklerini bağlamlarıyla eşleştir. “0.500kg” sayısal ayırıcı korunumu artık mevcut; yeni örnek varsa gerçek hatayı göster. Belirsizliği sessizce miktara çeviren fix önerme.

T11: ASR'nin sözel sayı↔rakam, apostrof kaybı, büyük/küçük harf, Unicode birleşik karakter ve normal noktalama değişimlerini karşılaştır. Doğru okunuşun yanlış review alması ile gerçekten eksik okumanın kaçmasını ayrı ölç.

T12: Özel ad/teknik terim/sözlük eklerini cümle içi, başlangıç, iyelik/hal eki ve yabancı dil adlarıyla dene. Alt dize eşleşmesi başka kişinin adını kabul etmesin; gereksiz baş harf algısı bütün normal cümleleri engellemesin.

T13: Kaynak duygusunu koruma iddiasını prompt ve motor parametrelerinde takip et. Soru/ünlem/alıntı/anlamlı tekrar yok olmasın; kaynakta olmayan duygu etiketi/dolgu eklenmesin. Gerçek ses olmadan “doğal/dublaj gibi” sonucu verme.

## C — Zaman ekseni, SRT ve codec sınırları

- T14: Aynı sentetik konuşmayı0offset ve5dk clip ile işle. Segment/word/diarization/source_ids/çeviri zamanları aynı sabit offset'i taşımalı; kelime listesi yokken de akış bozulmasın.
- T15: Clip başlangıcı cue'nun ortasında, bitişi sonraki cümlenin ortasında olsun. Dublajda tam cümle ve video dışı özgün ses politikalarını kaynaktan çıkar; üretimi tüm40dk'ya genişleten yanlış varsayımı ara.
- T16: SRT UTF-8/BOM/cp1254/UTF-16, CRLF/LF, boşluklu ayırıcı, kompakt dosya, eksik son newline,100saat zamanını dene. Türkçe metin gerçek byte roundtrip ile korunmalı.
- T17: end<start, sıfır süre, sırasız cue, invalid saat bileşeni ve yarım header için her tüketicinin politikasını tabloya koy. Parser→plan→UI→export divergence varsa metin/kimlik etkisini göster; her şeyi otomatik1ms'ye çevirmeyi önerme.
- T18: Source SRT üzerinde kaydırma/birleştirme/düzenleme sonrası edit/prosody/quality kimliklerini takip et. Eski ordinal artık başka konuşmaya denk geliyorsa zorunlu replan nerede yapılmalı?
- T19: Bölme/sarma/temizlik/SDH filtresi sırasını değişik sentetik girdilerde izle. “Alkış” etiketi okunmasın ama gerçek parantezli konuşma veya şarkı sözü sessizce silinmesin.

## D — Sağlayıcı yanıtı, oturum ve kalite kapıları

- T20: Localhost sunucuda boş/yarım JSON,200ama boş içerik,rate limit,gecikmiş yanıt,stream ortası kesilme ve cancellation oluştur. Retry/failover'ın aynı kaynağı koruyup korumadığını gerçek request sınırında gözle.
- T21: API anahtar izolasyonunu yalnız config'te değil gönderilen request'te ölç. Ayrı host/path/loopback/explicit inherit/kendi key/anahtar silme matrisi; sentetik key hash'lerini kullan. .every([]) mutlu yolun geçtiği anlamına gelmez; istek sayısını da assert et.
- T22: Kalite ret→cachehit→yeni hata sıraları, lenient kabul ve partial/final çıktıları dene. Bir önceki işin hata sayacı yeni işin eşiğini sessizce düşürmesin.
- T23: Satır sayısı eşitken aynı cueId'li kaynaklar, eksik cümle+eklenmiş komşu cümle ve duplicated suffix üret. Coverage yalnız N/N sayısından ibaret olmamalı; gerçek metin kapsamı oracle'ı kur.
- T24: Metin editörüne sayfa/SRT içinden talimat benzeri içerik ver. Kaynak alıntısı araç emrine veya sır istemeye dönüşmesin. Prompt katmanı ile tool yetki katmanını ayrı incele.

## Özel teslim

SEMANTIC-CORPUS.jsonl oluştur: case_id, source, proposed_or_heard, context, expected_relation, reason, actual_guard, actual_quality, class. Örnekler gerçek bug sayısını şişirmek için değil koruma/yanlış ret dengesini göstermeli. Her önemli örnekte bilerek korunması gereken negatif kontrol olsun.

PIPELINE-CONTRACT.md: her alanın UI→IPC→backend→cache→output yolu, varsayılanı ve kalıcılığı. TIMELINE-ORACLE.md: offset/kimlik eşitlikleri ve ihlaller. Son önerilerin “daha uzun prompt yazalım” ile bitmesin; uygulanabilir kod sınırı, geri dönüş ve kabul koşulu ver. Gerçek sağlayıcı yoksa çeviri kalitesi yarışması yaptığını söyleme.
