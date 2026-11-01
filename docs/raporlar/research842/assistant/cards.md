# R842 — Medya kütüphanesini bilen ve kaynağıyla araştıran asistan

22 kart, 15 yeni mekanizma ve 7 önceki öneri derinleştirmesi; 6 yeni repo, 65 sabit kaynak/lisans/paket dosyası. **6 ürün ailesi**: 22 bağımsız büyük özellik veya bug değildir. F2 retrieval mekanizmaları tek kütüphane kanıt arama deneyiminin parçalarıdır; F6 tarih mekanizmaları tek tarihli bilgi ailesidir.

Yerel taban df972383ab5a9b736b832ba64401b206beb6dedc. R838/R839/R841 korunur; ürün/bağımlılık/config değişikliği, kurulum, API/model çağrısı, test, branch, commit, push yapılmadı. GitHub kamu kaynakları yalnız ignored cache altına indirildi; üçüncü taraf gövdeleri rapora kopyalanmadı. Anahtar veya kişisel profil kullanılmadı. Lisans sınırları her karttadır.

**Önce seçeceğim pilot:** A04 alias sorguları + A06 bölüm hiyerarşisi + A08 film/kaynak sırası ile seçilmiş 3 filmin metinlerinde kanıt arama; sonra F1 araştırma boşlukları. F3 grafik ve F4 video çok modlu indeks büyük, isteğe bağlı pilotlardır. Hazır framework taşımak gerekmiyor.

**Tekrar kontrolü:** Vane/eski Perplexica R839’da zaten bulunduğu için yeni repo değil. Önceki 17 asistan deposu yeniden aday listesine alınmadı. Bellek, genel tool keşfi, bütçe, artifact, workspace, model keşfi, replay ve RSS bu alt çalışmanın yeni kartı değildir. NEW etiketi tüm tarihsel kayıtları kapsamaz.

**Kaynak sınırı:** README başarı iddiası kabul edilmedi; aşağıda observed alanı gerçek kod okumasıdır. Ürün sentezi ve gelecekteki kabul bunun dışındadır. Onyx yalnız non-ee MIT; enterprise lisans şartı ayrı. Memvid frame video karesi değildir. RAG-Anything görüntü sorgusu CLIP araması değildir. Gözlenen zaman kuralları çoğunlukla İngilizcedir; Türkçe hazır destek iddiası yok. LLM kaynak puanı gerçek doğrulama değildir.

## Depolar

| Repo | Sabit HEAD | Lisans ve edinim sınırı |
|---|---|---|
| [assafelovic/gpt-researcher](https://github.com/assafelovic/gpt-researcher) | `3582a6841fe7dc801e2a34e34ee408641aea9bce` | [Apache-2.0](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/LICENSE) — Seçilen Python kaynakları; Apache notice ve varsa NOTICE korunur. Arama/LLM servis koşulları ayrı. |
| [onyx-dot-app/onyx](https://github.com/onyx-dot-app/onyx) | `3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48` | [MIT (non-ee)](https://github.com/onyx-dot-app/onyx/blob/3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48/LICENSE) — Yalnız backend/onyx/context/search altındaki incelenen non-ee kod. backend/ee/LICENSE üretimde abonelik/lisans koşulu içerir; enterprise kod aktarımı önerilmez. |
| [deepset-ai/haystack](https://github.com/deepset-ai/haystack) | `8e38c633190ee43b80c136b335f8c9d6c79cc5d6` | [Apache-2.0](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE) — Seçilen dosyaların SPDX Apache-2.0 başlığı da gözlendi; model ve üçüncü taraf adapter lisansları bu kapsam değildir. |
| [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) | `aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a` | [MIT](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/LICENSE) — İncelenen çekirdek kaynaklar; çıkarım modeli,embedding ağırlıkları ve store bağımlılıklarının koşulları ayrıca incelenir. |
| [HKUDS/RAG-Anything](https://github.com/HKUDS/RAG-Anything) | `2cd2b3329c470ccb53923f8a6d320596b34e56c5` | [MIT](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/LICENSE) — Seçilen raganything kaynakları; MinerU/model/FFmpeg/OpenCV opsiyonel bileşenlerinin dağıtım hakları otomatik devralınmaz. |
| [memvid/memvid](https://github.com/memvid/memvid) | `e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813` | [Apache-2.0](https://github.com/memvid/memvid/blob/e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813/LICENSE) — İncelenen Rust kaynakları ve Cargo.toml; core2.0.140,Rust1.85/edition2024. Native/model özellikleri ayrıca değerlendirilmeli. |

## A842-01 — “Bu filmin tarihsel arka planını araştır” sorusunu görünür alt sorulara ayır

**F1 · film araştırması · OLD-DEEPENING · Efor M.** Önceki: R839-A06, R839-A05. Önceki fikrin bu yeni depodaki gözlenmiş kodla somut derinleştirmesi; yeni fikir sayımına eklenmez.

**Bugün:** [src/assistant-browser-research.js:3](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-browser-research.js#L3) — Arama motorlarını sırayla dener,4 URL toplar,ilk 3 sayfanın ilk 6000 karakterini okur. Hedef sorulara ayrılmış araştırma ağacı yok.

**Gerçekte okunan kod:** [assafelovic/gpt-researcher · gpt_researcher/skills/deep_research.py · generate_research_plan](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/gpt_researcher/skills/deep_research.py#L298) · HEAD `3582a6841fe7dc801e2a34e34ee408641aea9bce`. DeepResearchSkill plan sorularını üretir; generate_search_queries her sorguyu researchGoal ile eşler. Böylece sorgunun hangi bilgi ihtiyacına hizmet ettiği metin olarak korunur. Bu bir film uzmanlığı veya kaynak doğruluk garantisi değildir.

**Kütüphanede önerilen sonuç:** Seçili film için “yapım koşulları/yönetmen açıklaması/gerçek olay farkı” planı gösterilir; kullanıcı ilgisiz dalı çıkarabilir. Daha önce önerilen derin modun içi bu sözleşmeyle doldurulur. Metadata özeti tam eser analizi diye sunulmaz; araştırma yalnız seçilen yapımın doğrulanmış kimliğine bağlanır.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/LICENSE). Seçilen Python kaynakları; Apache notice ve varsa NOTICE korunur. Arama/LLM servis koşulları ayrı.

**Gelecekte kabul:** Aynı adlı iki filmin planı karışmaz; kaldırılan alt soru için arama yapılmaz; yanıt her plan maddesinde bulunan/eksik kanıtı ayırır.

**Windows / CSP / sağlayıcı / veri sınırı:** Renderer CSP korunur; ağ ve dosya erişimi main IPC üzerinden. Seçilmeyen kişisel film/izleme geçmişi sağlayıcıya gönderilmez. Bu tur kurulum, canlı model çağrısı ve Windows UI kabulü yapılmadı.

## A842-02 — “İki videonun iddiası neden çelişiyor?” araştırmasında yalnız açık kalan soruyu takip et

**F1 · film araştırması · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-browser-research.js:3](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-browser-research.js#L3) — Arama motorlarını sırayla dener,4 URL toplar,ilk 3 sayfanın ilk 6000 karakterini okur. Hedef sorulara ayrılmış araştırma ağacı yok.

**Gerçekte okunan kod:** [assafelovic/gpt-researcher · gpt_researcher/skills/deep_research.py · process_research_results](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/gpt_researcher/skills/deep_research.py#L352) · HEAD `3582a6841fe7dc801e2a34e34ee408641aea9bce`. process_research_results sonuçtan learnings ve followUpQuestions çıkarır. deep_research bunları önceki researchGoal ile sonraki sorguya taşır; başarısız boş sonuçta alt araştırmaya inmeyi durdurur. Soru ağacı URL gezinme grafından ayrıdır.

**Kütüphanede önerilen sonuç:** Kullanıcının seçtiği iki video veya röportajdaki tarih/isim iddiası için kanıtlı bulgular ve hâlâ açık kalan soru görünür. “Hangi sürümden söz ediyorlar?” dalı açılabilir; aynı aramayı yalnız uzun rapor üretmek için tekrarlamak yerine bilgi boşluğuna yönelir. Çelişkiyi otomatik hakem kararıyla çözmüş sayılmaz.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/LICENSE). Seçilen Python kaynakları; Apache notice ve varsa NOTICE korunur. Arama/LLM servis koşulları ayrı.

**Gelecekte kabul:** Bir kaynak sürüm tarihini açıklarken diğeri açıklamıyorsa sonuç “çelişki kesin çözüldü” demez; takip sorgusu yalnız eksik sürüm bilgisini arar; iki kaynak kimliği korunur.

**Windows / CSP / sağlayıcı / veri sınırı:** Çok dallı araştırma LLM ve arama maliyetini katlar; kullanıcıya alt soru sayısı/üst sınır gösterilmeli. Kaynak metni talimat olamaz; döngü ve iptal kontrolleri mevcut job hattına bağlanmalı.

## A842-03 — Film araştırmasında her bulguyu onu söyleyen URL ile birlikte tut

**F1 · film araştırması · OLD-DEEPENING · Efor M.** Önceki: R839-A05, R839-F08. Önceki fikrin bu yeni depodaki gözlenmiş kodla somut derinleştirmesi; yeni fikir sayımına eklenmez.

**Bugün:** [src/assistant-agent-service.js:119](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-agent-service.js#L119) — Web kaynakları W kimliğiyle oturumda birikir,yanıta liste eklenir;kitap alıntıları ayrıca tutulur. Her web iddiasına doğrulanmış kanıt kenarı üretilmiş sayılmaz.

**Gerçekte okunan kod:** [assafelovic/gpt-researcher · gpt_researcher/skills/deep_research.py · parse_research_results_response](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/gpt_researcher/skills/deep_research.py#L149) · HEAD `3582a6841fe7dc801e2a34e34ee408641aea9bce`. Parser learnings içindeki insight/learning ve sourceUrl/citation alanlarını okur; alternatif satır biçimlerinden de alıntı URL çıkarır. Eksik URL boş kalabilir. Bu kaynak metninin iddiayı gerçekten desteklediğini doğrulayan entailment motoru değildir.

**Kütüphanede önerilen sonuç:** “Yönetmen bu sahneyi nereden esinlenmiş?” cevabında bulgu→kaynak bağı araştırma boyunca korunur; URL bulunmayan model çıkarımı ayrı işaretlenir. Önceki kaynaklı dosya ve yorum-alıntı zinciri fikri film gerçekleri düzeyinde derinleşir. İddia metni aynı olsa bile farklı kaynak desteklerini tek sözlük anahtarında kaybetmemek bizim veri modelimizde ayrıca çözülür.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/LICENSE). Seçilen Python kaynakları; Apache notice ve varsa NOTICE korunur. Arama/LLM servis koşulları ayrı.

**Gelecekte kabul:** Desteksiz yorum “yönetmenin açıklaması” diye görünmez; iki URL aynı bulguyu destekleyebilir; geçersiz veya hiç okunmamış URL alıntıya dönüştürülmez.

**Windows / CSP / sağlayıcı / veri sınırı:** Renderer CSP korunur; ağ ve dosya erişimi main IPC üzerinden. Seçilmeyen kişisel film/izleme geçmişi sağlayıcıya gönderilmez. Bu tur kurulum, canlı model çağrısı ve Windows UI kabulü yapılmadı.

## A842-04 — Türkçe/orijinal ad ve çeviri terimleriyle aynı film kaynağını bul

**F2 · kütüphane kanıt araması · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/renderer/assistant-library-actions.js:72](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/assistant-library-actions.js#L72) — Başlık/orijinal başlık/özet içinde substring ve tür/durum/genre filtreleri;8 sonuç sayfalama. Film bilgisi,kişi,yorum,zevk ve koleksiyon araçları zaten var.

**Gerçekte okunan kod:** [deepset-ai/haystack · haystack/components/retrievers/multi_query_text_retriever.py · def run_async](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/components/retrievers/multi_query_text_retriever.py#L137) · HEAD `8e38c633190ee43b80c136b335f8c9d6c79cc5d6`. MultiQueryTextRetriever sorguları sınırlı eşzamanlılıkla çalıştırır, dönen belgeleri kimliğine göre tekilleştirir ve puana göre sıralar. Sorgu alternatiflerini kendisi üretmez; film alias doğrulaması bu bileşende yoktur.

**Kütüphanede önerilen sonuç:** “Esaretin Bedeli özgürlük teması” sorusu doğrulanmış originalTitle ile ikinci bir arama yapabilir; İngilizce makale ve Türkçe kişisel not aynı kaynak rafında bulunur. Aliasları katalog kimliğinden alırız; rastgele LLM çevirisiyle yanlış filme genişleme yapılmaz. Bir başarısız varyant kalan sonuçları yok etmez.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE). Seçilen dosyaların SPDX Apache-2.0 başlığı da gözlendi; model ve üçüncü taraf adapter lisansları bu kapsam değildir.

**Gelecekte kabul:** Türkçe adla bulunmayan kayıt orijinal adla gelir; aynı pasaj bir kez görünür; remake/yıl farkı korunur; iptal tüm varyantları durdurur.

**Windows / CSP / sağlayıcı / veri sınırı:** Algoritma Node portuyla CPU düzeyinde ucuzdur; web varyantları dış servise film ilgisini açar ve arama sayısını artırır. Her varyantın amacı/sayısı görünür olmalı; kişisel yorum sorguya kendiliğinden eklenmemeli.

## A842-05 — Hatırladığım ifade ile anlattığım temayı aynı kaynak aramasında birleştir

**F2 · kütüphane kanıt araması · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-retrieval.js:6](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-retrieval.js#L6) — Sözcük eşleşmesiyle puanlar; satırın eşleşen bölgesinden en fazla900 karakter çıkarır,en fazla12 sonuç. Embedding/graf/hiyerarşik bölüm araması yok.

**Gerçekte okunan kod:** [deepset-ai/haystack · haystack/utils/misc.py · def _reciprocal_rank_fusion](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/utils/misc.py#L175) · HEAD `8e38c633190ee43b80c136b335f8c9d6c79cc5d6`. Gerçek _reciprocal_rank_fusion gövdesi farklı sonuç listelerinin sıralarından birleştirilmiş puan üretir; belge kimliğine göre destekleri toplar. DocumentJoiner._rrf bunu çağırır. Bu yöntem embedding üretmez ve tek başına semantik arama sağlamaz.

**Kütüphanede önerilen sonuç:** “İzlediğim filmlerde eve dönme ve aidiyet üzerine notları bul” sorusunda tam sözcük eşleşmesi, varsa semantik pasaj adayları ve başlık eşleşmesi ayrı kanallardan birleşir. Kullanıcı sonuçta “notta tam ifade/tematik benzerlik” desteğini görür. Bu film öneri rankerı değil, seçilen kütüphane metinlerinde kanıt bulma sıralamasıdır.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE). Seçilen dosyaların SPDX Apache-2.0 başlığı da gözlendi; model ve üçüncü taraf adapter lisansları bu kapsam değildir.

**Gelecekte kabul:** Bir kanalın100puanı diğerinin0.8puanını ölçek farkıyla ezmez; aynı sourceRevision/passage tek sonuçtur; semantik kanal kapalıyken sözcüksel arama sürer.

**Windows / CSP / sağlayıcı / veri sınırı:** Embedding ancak ayrıca ölçülen opt-in pilotla eklenir; model/indeks Windows dağıtımı ve Türkçe kalite sınırı ayrı. Füzyon portu ağ gerektirmez; rank skoru doğruluk olasılığı gibi gösterilmez.

## A842-06 — Röportajdan tek cümle yerine gerektiğinde ilgili bölümün tamamını getir

**F2 · kütüphane kanıt araması · NEW · Efor M–L.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-retrieval.js:6](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-retrieval.js#L6) — Sözcük eşleşmesiyle puanlar; satırın eşleşen bölgesinden en fazla900 karakter çıkarır,en fazla12 sonuç. Embedding/graf/hiyerarşik bölüm araması yok.

**Gerçekte okunan kod:** [deepset-ai/haystack · haystack/components/retrievers/auto_merging_retriever.py · def run(](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/components/retrievers/auto_merging_retriever.py#L117) · HEAD `8e38c633190ee43b80c136b335f8c9d6c79cc5d6`. AutoMergingRetriever yaprakları parent ID ile toplar; bulunan çocukların tüm çocuklara oranı threshold değerini aşınca parent belgeye çıkar ve hiyerarşide tekrarlayabilir. Threshold eşitliği değil, büyüktür koşulu kullanılır.

**Kütüphanede önerilen sonuç:** Film hakkında dört komşu paragraf isabet ettiğinde asistana kopuk parçalar yerine aynı “çekim süreci” bölümü verilir. Tek ufak eşleşmede bütün röportaj gönderilmez. Kütüphane araştırma kaydında bölüm başlığı ve içerdiği alt pasajlar açılabilir. Kaynak ve bölüm sınırları yeni indeks metadata sözleşmesi gerektirir; upstream bunu mevcut document store üzerinde uygular.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE). Seçilen dosyaların SPDX Apache-2.0 başlığı da gözlendi; model ve üçüncü taraf adapter lisansları bu kapsam değildir.

**Gelecekte kabul:** Aynı makalede farklı bölümler birleşmez; eşik altındaki tek pasaj korunur; parent kayıpsa açık hata/leaf fallback; spoiler sınırını aşan parent verilmez.

**Windows / CSP / sağlayıcı / veri sınırı:** Renderer CSP korunur; ağ ve dosya erişimi main IPC üzerinden. Seçilmeyen kişisel film/izleme geçmişi sağlayıcıya gönderilmez. Bu tur kurulum, canlı model çağrısı ve Windows UI kabulü yapılmadı.

## A842-07 — “Burada kimden söz ediyor?” sorusunda komşu replikleri zaman sınırıyla getir

**F2 · kütüphane kanıt araması · OLD-DEEPENING · Efor M.** Önceki: R839-A08, B841-19. Önceki fikrin bu yeni depodaki gözlenmiş kodla somut derinleştirmesi; yeni fikir sayımına eklenmez.

**Bugün:** [src/assistant-retrieval.js:6](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-retrieval.js#L6) — Sözcük eşleşmesiyle puanlar; satırın eşleşen bölgesinden en fazla900 karakter çıkarır,en fazla12 sonuç. Embedding/graf/hiyerarşik bölüm araması yok.

**Gerçekte okunan kod:** [deepset-ai/haystack · haystack/components/retrievers/sentence_window_retriever.py · def _build_filter_conditions](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/components/retrievers/sentence_window_retriever.py#L345) · HEAD `8e38c633190ee43b80c136b335f8c9d6c79cc5d6`. SentenceWindowRetriever source_id ve split_id metadata aralığıyla komşu parçaları alır; pencereleri birleştirir ve overlap metnini tekrar ettirmemeye çalışır. Kodun veri birimi cümle parçalarıdır, video cue/timestamp değildir.

**Kütüphanede önerilen sonuç:** Sahne açıklaması veya zamir sorusunda bulunan repliğin önceki/sonraki iki cue’su açılır. Önceki sahne araması ve ilgili pasaj fikrinin uygulama derinleştirmesidir. Cue zamanına eşleme, kaynak revizyonu ve izlenen noktaya kadarki spoiler filtresi bize aittir. Kullanıcı “eşleşme” ile “bağlam için eklenen” satırları ayırabilir; normal altyazı düzenleyicisine yeni hedef eklenmez.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE). Seçilen dosyaların SPDX Apache-2.0 başlığı da gözlendi; model ve üçüncü taraf adapter lisansları bu kapsam değildir.

**Gelecekte kabul:** Komşu pencere başka videoya veya bölüm sonrasına geçmez; örtüşen pencereler çift replik üretmez; kaynağa tıklama orijinal video zamanına gider.

**Windows / CSP / sağlayıcı / veri sınırı:** Renderer CSP korunur; ağ ve dosya erişimi main IPC üzerinden. Seçilmeyen kişisel film/izleme geçmişi sağlayıcıya gönderilmez. Bu tur kurulum, canlı model çağrısı ve Windows UI kabulü yapılmadı.

## A842-08 — İki filmi karşılaştırırken alıntıları film→kaynak→zaman sırasıyla düzenle

**F2 · kütüphane kanıt araması · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/renderer/assistant-library-actions.js:72](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/assistant-library-actions.js#L72) — Başlık/orijinal başlık/özet içinde substring ve tür/durum/genre filtreleri;8 sonuç sayfalama. Film bilgisi,kişi,yorum,zevk ve koleksiyon araçları zaten var.

**Gerçekte okunan kod:** [deepset-ai/haystack · haystack/components/rankers/meta_field_grouping_ranker.py · def run(](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/components/rankers/meta_field_grouping_ranker.py#L77) · HEAD `8e38c633190ee43b80c136b335f8c9d6c79cc5d6`. MetaFieldGroupingRanker önce belge kimliğiyle dedup yapar, group_by ve isteğe bağlı subgroup_by ile gruplar; sort_docs_by alanıyla içeriyi sıralar. Çıktı düz listedir; kaynak çeşitliliği veya adil kota algoritması değildir.

**Kütüphanede önerilen sonuç:** “Bu iki film yalnızlığı nasıl anlatıyor?” cevabına seçilmiş pasajlar karışık skor yığını olarak gitmez. Film kimliği altında makale/röportaj, onun altında sayfa veya video zamanı düzeni korunur. Her filmin bölümünü kullanıcı açarak kanıt akışını okuyabilir. Film başına eşit sonuç kotası ve önem sırası ayrıca tasarlanır; gruplama sırf düzen sağlar.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE). Seçilen dosyaların SPDX Apache-2.0 başlığı da gözlendi; model ve üçüncü taraf adapter lisansları bu kapsam değildir.

**Gelecekte kabul:** Aynı isimde iki film ID ile ayrı kalır; eksik metadata “bilinmiyor” grubuna gider; sıralanamaz karma tarih tipleri açıklanır; kaynakların doğal replik sırası korunur.

**Windows / CSP / sağlayıcı / veri sınırı:** Renderer CSP korunur; ağ ve dosya erişimi main IPC üzerinden. Seçilmeyen kişisel film/izleme geçmişi sağlayıcıya gönderilmez. Bu tur kurulum, canlı model çağrısı ve Windows UI kabulü yapılmadı.

## A842-09 — “Kütüphanemdeki göç ve aidiyet temasını hangi kaynaklar bağlıyor?” diye sor

**F3 · kaynaklı medya bilgi grafı · NEW · Efor L.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/renderer/assistant-library-actions.js:72](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/assistant-library-actions.js#L72) — Başlık/orijinal başlık/özet içinde substring ve tür/durum/genre filtreleri;8 sonuç sayfalama. Film bilgisi,kişi,yorum,zevk ve koleksiyon araçları zaten var.

**Gerçekte okunan kod:** [HKUDS/LightRAG · lightrag/operate.py · async def _perform_kg_search](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/lightrag/operate.py#L5280) · HEAD `aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a`. _perform_kg_search low-level anahtarlarla entity, high-level anahtarlarla relation arar; local/global/hybrid/mix yollarını ayırır. Mix vektör chunklarını da ekler. Entity/ilişki çıkarımı ve embedding gerektirir; hazır film ontolojisi yoktur.

**Kütüphanede önerilen sonuç:** Film/kişi metadata bağlantısının ötesinde kullanıcının seçtiği eleştiriler, video çözümlemeleri ve notlardan tema ilişkileri bulunur. “Göç→aidiyet→iki filmde farklı sonuç” gibi bağlantı yalnız kaynak pasajlarıyla önerilir. Filmin gerçeği, eleştirmenin yorumu ve kişisel not ayrı ilişki türleri olmalıdır; bütün kütüphanenin gizlice modele çıkarılması önerilmez.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/LICENSE). İncelenen çekirdek kaynaklar; çıkarım modeli,embedding ağırlıkları ve store bağımlılıklarının koşulları ayrıca incelenir.

**Gelecekte kabul:** Sadece ortak tür etiketine sahip iki film “aynı tema kanıtı” sayılmaz; her bağa kaynak açılır; çıkarım/alıntı ayrılır; kapsam dışı yapım sonuçta görünmez.

**Windows / CSP / sağlayıcı / veri sınırı:** MIT algoritma uyarlaması veya opt-in Python sidecar pilotu; tam graph server şart değil. Entity çıkarımı çok sayıda ücretli LLM/embedding çağrısı doğurabilir; indeks önizleme, miktar ve iptal gerekir. Windows GPU/venv mevcut ASR ortamından ayrılmalı.

## A842-10 — Bir sahneye yakıştırılan etkiyi ilişki zinciri ve dayanak pasajıyla incele

**F3 · kaynaklı medya bilgi grafı · NEW · Efor L.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-retrieval.js:6](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-retrieval.js#L6) — Sözcük eşleşmesiyle puanlar; satırın eşleşen bölgesinden en fazla900 karakter çıkarır,en fazla12 sonuç. Embedding/graf/hiyerarşik bölüm araması yok.

**Gerçekte okunan kod:** [HKUDS/LightRAG · lightrag/operate.py · async def _find_most_related_edges_from_entities](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/lightrag/operate.py#L6260) · HEAD `aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a`. Fonksiyon entity graphlarından komşu ilişkileri alır; ilişki verisi degree/rank ve ağırlıkla sıralanabilir. _get_node_data ve _get_edge_data bunları query bağlamına taşır. Graph kenarı tek başına nedensellik veya tarihsel etki kanıtı değildir.

**Kütüphanede önerilen sonuç:** “Bu sahneye neden Alman dışavurumculuğu deniyor?” sorusunda sahne notu→görsel tema→eleştiri kaynağı bağlantıları gösterilir. Kaynak açıkça esinlenme demiyorsa “olası benzerlik” olarak kalır. TMDB ortak ekip listesi olan D841-07’den farklı hedef kaynaklı eleştirel ilişkilerdir; isimleri birleştirmenin otomatik doğru olduğu varsayılmaz. Kullanıcı her adımda hangi yoruma dayandığını görebilir.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/LICENSE). İncelenen çekirdek kaynaklar; çıkarım modeli,embedding ağırlıkları ve store bağımlılıklarının koşulları ayrıca incelenir.

**Gelecekte kabul:** Bir modelin ürettiği ilişki “yönetmenin itirafı” olamaz; en az bir somut pasaj yoksa etki iddiası kurulmaz; döngüde aynı kaynak tekrar kanıt diye sayılmaz.

**Windows / CSP / sağlayıcı / veri sınırı:** Bu kaynak graph komşuluğu sağlar; film sahnesi çözümleme/ilişki tipi ve kimlik çözümü ürün sentezidir. Dış metinler güvensiz girdidir; renderer’a yürütülebilir graph HTML taşınmaz. Görselleştirme kendi CSP ile güvenli metin olarak kurulmalı.

## A842-11 — Yanlış röportajı kaldırınca ona dayanan film bilgisini de geri çek

**F3 · kaynaklı medya bilgi grafı · NEW · Efor L.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-source-context.js:16](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-source-context.js#L16) — Seçimin kimlik ve excerpt hashleriyle bağlamı sabitler. Kaynak revizyonu kontrolü var;türetilmiş tema grafı deposu yok.

**Gerçekte okunan kod:** [HKUDS/LightRAG · lightrag/lightrag.py · async def adelete_by_doc_id](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/lightrag/lightrag.py#L6727) · HEAD `aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a`. adelete_by_doc_id ve yardımcı rollback yolu kaynak chunk sahipliğini inceler. Başka kaynağı kalan entity/relations için yeniden kurma, hiç kaynağı kalmayanlar için silme vardır; chunk ve recovery kayıtlarının silme sırası ayrıca korunur. Yalnız belge listesinden satır silme değildir.

**Kütüphanede önerilen sonuç:** Kullanıcı yanlış filme bağlanan bir incelemeyi araştırma paketinden kaldırırsa “bu yönetmen şu romandan etkilendi” gibi türetilmiş bilgiler hâlâ cevaplarda yaşamaz. Başka bağımsız kaynakla desteklenen ilişki korunur. Böylece kütüphanedeki bilgi grafı kendi kanıt yaşam döngüsüne sahip olur; genel kişisel bellek silme özelliğinin tekrar sayımı değildir.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/LICENSE). İncelenen çekirdek kaynaklar; çıkarım modeli,embedding ağırlıkları ve store bağımlılıklarının koşulları ayrıca incelenir.

**Gelecekte kabul:** A ve B kaynaklı ilişki A kaldırılınca B ile kalır; yalnızA kaynaklı iddia kaybolur; yarıda kapanan temizleme devam edebilir; orijinal video veya kullanıcı not dosyası silinmez.

**Windows / CSP / sağlayıcı / veri sınırı:** Doğrudan port büyük store işlem sözleşmesi gerektirir; önce mevcut manifest üstünde bağımsız dependency index daha hafif olabilir. Bu tur hata kurtarma çalıştırılmadı. Silme açık kullanıcı kapsamı ve türetilmiş veriye sınırlı olmalı.

## A842-12 — Yanıt ürettirmeden “bu film hakkında elinde hangi kanıt var?” diye bak

**F3 · kaynaklı medya bilgi grafı · NEW · Efor M–L.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-retrieval.js:6](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-retrieval.js#L6) — Sözcük eşleşmesiyle puanlar; satırın eşleşen bölgesinden en fazla900 karakter çıkarır,en fazla12 sonuç. Embedding/graf/hiyerarşik bölüm araması yok.

**Gerçekte okunan kod:** [HKUDS/LightRAG · lightrag/base.py · only_need_context](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/lightrag/base.py#L102) · HEAD `aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a`. QueryParam only_need_context ve only_need_prompt bayraklarını tanımlar. _build_query_context arama, truncation, merge, format aşamalarından context ve structured raw_data döndürür; keywords ve processing_info içerir. Retrieval hâlâ embedding/anahtar çıkarım çağrısı yapabilir; tamamen modelsiz mod değildir.

**Kütüphanede önerilen sonuç:** Film bilgi sayfasında önce kanıt görünümü açılır:bilinen kişi/tema bağlantıları, alınan pasajlar, hangi kaynakların elendiği. Kullanıcı zayıf/yanlış eşleşmeyi son sentez çağrısından önce fark eder. Bu genel token bütçesi kartı değil, cevabın dayanağını inceleme yoludur; kaynakta hazır bulunan teknik bağlamı grafit/amber medya paneline dönüştürmek bize aittir.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/LightRAG/blob/aaebfe1bb8d55deb6a4304d357a3bf4c92fcd40a/LICENSE). İncelenen çekirdek kaynaklar; çıkarım modeli,embedding ağırlıkları ve store bağımlılıklarının koşulları ayrıca incelenir.

**Gelecekte kabul:** Yalnız kanıt görüntüleme son cevap LLM’ini çağırmaz; yine de yapılan embedding/keyword çağrıları açık görünür; hiç pasaj yoksa uydurma film açıklaması gelmez.

**Windows / CSP / sağlayıcı / veri sınırı:** Bağlam önizlemesi kişisel notu dış modele göndermeden önce yerel gösterilebilir. Upstream full path referanslarını arayüze veya sağlayıcıya ham geçirmek yerine yetkili sourceID gerekir. CSP için kendi güvenli metin rendererı kullanılmalı.

## A842-13 — Repliği olmayan sahneyi görüntü ve konuşmayı bir arada kullanarak bul

**F4 · video araştırma kanıtı · OLD-DEEPENING · Efor L.** Önceki: R839-A08, R839-A10. Önceki fikrin bu yeni depodaki gözlenmiş kodla somut derinleştirmesi; yeni fikir sayımına eklenmez.

**Bugün:** [src/renderer/global-assistant.js:80](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/global-assistant.js#L80) — Seçili yapımın metadata/pasajı ile kaynak bağlamını ayırır;bütün eser ekli değildir uyarısı var. Pixel analizi yapılmadığını açıklar.

**Gerçekte okunan kod:** [HKUDS/RAG-Anything · raganything/modalprocessors_video.py · def _merge_channels](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/raganything/modalprocessors_video.py#L440) · HEAD `2cd2b3329c470ccb53923f8a6d320596b34e56c5`. VideoModalProcessor sahne algılama, keyframe VLM açıklaması ve audio transcription çıktısını zaman aralıklarıyla birleştirir. generate_chunk_sections çoklu pencere üretir. Kare seek yaklaşık olabilir; bu gerçek kare hassasiyetli sahne tanıma garantisi değildir.

**Kütüphanede önerilen sonuç:** “Kırmızı koridorda yürüdüğü ama konuşmadığı sahne” seçilmiş yerel videolarda görsel açıklamayla bulunabilir; sonuçta “görsel betimleme/konuşma” ayrımı ve zaman aralığı gösterilir. R839 sahneyi tarifle bulma ve görsel bağlamın gerçek kaynak derinleştirmesidir. Mevcut transkripsiyon yeniden çalıştırılmamalı; bizim faster-whisper çıktısı adapterla kullanılmalı. Film kimliği veya oyuncu tanıma bu modülden hazır gelmez.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/LICENSE). Seçilen raganything kaynakları; MinerU/model/FFmpeg/OpenCV opsiyonel bileşenlerinin dağıtım hakları otomatik devralınmaz.

**Gelecekte kabul:** Sessiz sahne sonuç verebilir; modelin görmediği aralık açık kalır; kare zamanı yaklaşık etiketi korunur; altyazı zamanları orijinal videoya hizalanır.

**Windows / CSP / sağlayıcı / veri sınırı:** Opt-in Python sidecar veya algoritma adapterı; OpenCV/SceneDetect/MoviePy, FFmpeg ve VLM uyumu Windows’ta doğrulanmalı. Karelerin ücretli sağlayıcıya gönderimi ayrı açık seçim ister; DRM/korunan browser videosu kopyalanmış sayılmaz.

## A842-14 — Sahne taramasının atladığı açılış/kapanış konuşmasını araştırmada kaybetme

**F4 · video araştırma kanıtı · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/renderer/global-assistant.js:80](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/global-assistant.js#L80) — Seçili yapımın metadata/pasajı ile kaynak bağlamını ayırır;bütün eser ekli değildir uyarısı var. Pixel analizi yapılmadığını açıklar.

**Gerçekte okunan kod:** [HKUDS/RAG-Anything · raganything/modalprocessors_video.py · def _add_audio_only_segments](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/raganything/modalprocessors_video.py#L401) · HEAD `2cd2b3329c470ccb53923f8a6d320596b34e56c5`. _add_audio_only_segments retained görsel sahnelerle örtüşmeyen ASR segmentlerini audio-only satırlara ekler; örtüşenler iki kez eklenmez. Sahne dizisindeki boşluklar ile konuşma aralıkları karşılaştırılır. Video analiz hattında somut tamamlayıcı mekanizmadır.

**Kütüphanede önerilen sonuç:** Film sonundaki yönetmen söyleşisi veya görselde değişim olmayan giriş açıklaması sahne seçicisi tarafından atlandığında kullanıcı “bu videoda söylenmedi” cevabı almaz. Sonuçta görüntü kanıtı bulunmayan ama ses kaynağı olan satır açık görünür. Bu tek başına ayrı video ürünü değil, F4 ailesinin eksik konuşmayı koruyan seçilebilir parçasıdır; upstream’deki kaynak hata fallback metni başarılı transkripsiyon sayılmaz.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/LICENSE). Seçilen raganything kaynakları; MinerU/model/FFmpeg/OpenCV opsiyonel bileşenlerinin dağıtım hakları otomatik devralınmaz.

**Gelecekte kabul:** İlk sahneden önce ve son sahneden sonra konuşma aranabilir; aynı ASR satırı çift kanıt olmaz; ses yoksa görüntü açıklamasına konuşma uydurulmaz; kaynak zamanı korunur.

**Windows / CSP / sağlayıcı / veri sınırı:** Mevcut ASR segmentleriyle yerel hesap yeterlidir; yeni ücretli VLM çağrısı şart değildir. Windows yol/loglarda kişisel video adı maskelenmeli. Ürün mevcut görüntü analizi yok uyarısını yalnız gerçekten indekslenen aralıklarda değiştirebilir.

## A842-15 — Basın dosyasındaki fotoğrafı başlığı ve çevresindeki açıklamayla araştır

**F5 · film yan kaynakları · NEW · Efor L.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/renderer/global-assistant.js:80](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/global-assistant.js#L80) — Seçili yapımın metadata/pasajı ile kaynak bağlamını ayırır;bütün eser ekli değildir uyarısı var. Pixel analizi yapılmadığını açıklar.

**Gerçekte okunan kod:** [HKUDS/RAG-Anything · raganything/modalprocessors.py · def _extract_page_context](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/raganything/modalprocessors.py#L154) · HEAD `2cd2b3329c470ccb53923f8a6d320596b34e56c5`. ContextExtractor page/chunk penceresiyle çevre metni toplar; ImageModalProcessor caption/footnote ve bağlamı VLM açıklamasına ekleyebilir. Filtrelenen içerik türleri ve context_window sınırı vardır. PDF/presskit özel film tanıma motoru değildir.

**Kütüphanede önerilen sonuç:** Kullanıcı seçili filmin basın PDF’ini eklediğinde “bu kostüm hangi döneme dayanıyor?” sorusunda görsel tek başına tahmin edilmez; sayfa başlığı, tasarımcı açıklaması ve altyazısı beraber kullanılır. Kaynak sayfası gösterilir, üretilmiş görsel betimleme alıntı metniyle karışmaz. Mevcut kitap/PDF araçları korunarak film araştırmasının yan kaynak katmanı oluşur; altyazı editörüne hedef eklenmez.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/LICENSE). Seçilen raganything kaynakları; MinerU/model/FFmpeg/OpenCV opsiyonel bileşenlerinin dağıtım hakları otomatik devralınmaz.

**Gelecekte kabul:** Bir sonraki filmin sayfasındaki caption komşuluk nedeniyle bağlanmaz; görselin kendisinde olmayan dönem metinden geldiyse belirtilir; sayfaya geri dönüş çalışır.

**Windows / CSP / sağlayıcı / veri sınırı:** MIT seçilmiş adapter veya sidecar; MinerU ve opsiyonel parser/model lisansları ayrıca incelenmeli. Kişisel PDF tamamı otomatik VLM’ye gitmez. Dosya yolu ve görseller renderer’dan doğrudan okunmaz; main yetkili ID verir.

## A842-16 — Elimdeki afiş/kareyle ilgili kayıtlı eleştirileri bul

**F5 · film yan kaynakları · OLD-DEEPENING · Efor M.** Önceki: R839-A10. Önceki fikrin bu yeni depodaki gözlenmiş kodla somut derinleştirmesi; yeni fikir sayımına eklenmez.

**Bugün:** [src/renderer/global-assistant.js:80](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/global-assistant.js#L80) — Seçili yapımın metadata/pasajı ile kaynak bağlamını ayırır;bütün eser ekli değildir uyarısı var. Pixel analizi yapılmadığını açıklar.

**Gerçekte okunan kod:** [HKUDS/RAG-Anything · raganything/query.py · async def _process_multimodal_query_content](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/raganything/query.py#L478) · HEAD `2cd2b3329c470ccb53923f8a6d320596b34e56c5`. QueryMixin görsel dahil multimodal içeriği açıklamaya çevirerek sorgu metnine ekler. _describe_image_for_query yerel görüntüyü base64 VLM çağrısına gönderir; yoksa caption/footnote fallback kullanır. Bu CLIP görsel benzerlik indeksi değildir.

**Kütüphanede önerilen sonuç:** Kullanıcı bir afişi veya seçtiği kareyi “bu motif üzerine kaydettiğim yazılar var mı?” sorusuna ekler. Yanıt görseldeki nesne/renk betimlemesini metin kaynaklarıyla ilişkilendirir; aynı filmi veya kişiyi tanıdığı iddia edilmez. R839 görsel bağlam önerisinin somut sorgu genişletme dalıdır, ayrı yeni görüntü ürünü diye sayılmaz. Arama kapsamı seçilen kütüphane paketidir.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/LICENSE). Seçilen raganything kaynakları; MinerU/model/FFmpeg/OpenCV opsiyonel bileşenlerinin dağıtım hakları otomatik devralınmaz.

**Gelecekte kabul:** Belirsiz kare başka filmle kesin eşleşmez; VLM çalışmadıysa fallback nedeni görünür; görsel açıklaması arama metni olarak gösterilir; kullanıcı sorgudan çıkarabilir.

**Windows / CSP / sağlayıcı / veri sınırı:** Gönderilecek kare ve sağlayıcı açık seçilmeli; görsel başına token/maliyet olabilir. Windows görsel yolu yetkili ID ile çözülür; raw file path prompt’a girmez. Görüntüye gömülü talimatlar kaynak içeriğidir.

## A842-17 — Filmin ilk gösterim dönemindeki kaynakları bugünkü güncellenmiş yazılardan ayır

**F6 · tarihli medya bilgisi · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-browser-research.js:3](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-browser-research.js#L3) — Arama motorlarını sırayla dener,4 URL toplar,ilk 3 sayfanın ilk 6000 karakterini okur. Hedef sorulara ayrılmış araştırma ağacı yok.

**Gerçekte okunan kod:** [onyx-dot-app/onyx · backend/onyx/context/search/models.py · class TimeRange](https://github.com/onyx-dot-app/onyx/blob/3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48/backend/onyx/context/search/models.py#L75) · HEAD `3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48`. BaseFilters created_at_range ve updated_at_range alanlarını ayrı taşır; TimeRange inclusive aralıkları kesiştirir ve start>end durumunu boş olarak tanır. Model naive tarihi UTC sayar. Kaynak yayın tarihini otomatik çıkardığı anlamına gelmez.

**Kütüphanede önerilen sonuç:** “Film çıktığında eleştiriler ne diyordu?” sorusunda 2012’de yayımlanıp 2025’te güncellenmiş yazı iki tarihiyle görünür. Bugün kaydedilmiş olması ilk gösterim dönemine ait olmadığını göstermez. Yayın/güncelleme tarihi güvenle bulunamadıysa “tarihi bilinmiyor” seçeneği olur. Bu kaynak güncelliği B841-22’ye komşudur ama amaç geçmiş dönem bilgi kesitidir; yaş filtresiyle tarihsel iddia kurulmaz.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT (non-ee)](https://github.com/onyx-dot-app/onyx/blob/3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48/LICENSE). Yalnız backend/onyx/context/search altındaki incelenen non-ee kod. backend/ee/LICENSE üretimde abonelik/lisans koşulu içerir; enterprise kod aktarımı önerilmez.

**Gelecekte kabul:** Yayın tarihi 2012, güncelleme 2025 olan yazı istenen yayın kesitine girer; kayıt tarihi 2026 diye dışlanmaz; çelişen tarih aralıkları tüm web’e genişlemez.

**Windows / CSP / sağlayıcı / veri sınırı:** Non-ee MIT sözleşme portu; Onyx enterprise backend taşınmaz. Europe/Istanbul ve UTC sınırları açık dönüştürülmeli. Kaynak tarih metadata’sı çıkarım ise etiketlenmeli; tam kaynak güvenilirlik ölçümü yapılmış sayılmaz.

## A842-18 — “Yapım aşamalarını sırayla anlat” cevabında yazı tarihi ile anlattığı olayı ayır

**F6 · tarihli medya bilgisi · NEW · Efor L.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-agent-service.js:119](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-agent-service.js#L119) — Web kaynakları W kimliğiyle oturumda birikir,yanıta liste eklenir;kitap alıntıları ayrıca tutulur. Her web iddiasına doğrulanmış kanıt kenarı üretilmiş sayılmaz.

**Gerçekte okunan kod:** [memvid/memvid · src/memvid/timeline.rs · fn build_timeline_temporal_metadata](https://github.com/memvid/memvid/blob/e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813/src/memvid/timeline.rs#L148) · HEAD `e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813`. Timeline metadata anchor ile mentions ayrımını taşır; mention kaydı orijinal text ve tarih içerir. Search time_filter önce temporal mentions/anchors, sonra mevcut zaman index fallback yollarını kullanır. Memvid frame burada kayıt birimidir, video karesi değildir.

**Kütüphanede önerilen sonuç:** 2025 tarihli röportajın 2010 çekim anısını doğru yere yerleştirmek için olay tarihi, belge tarihi ve alınma zamanı ayrı saklanır. Film yapım kronolojisi kaynak cümlesine geri döner; belirsiz olaylar keskin gün uydurmak yerine aralıkla gösterilir. Hazır film kronolojisi upstream’de yoktur; tarihli kayıt modelini mevcut film ID/araştırma manifestiyle birleştirmek bize aittir.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/memvid/memvid/blob/e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813/LICENSE). İncelenen Rust kaynakları ve Cargo.toml; core2.0.140,Rust1.85/edition2024. Native/model özellikleri ayrıca değerlendirilmeli.

**Gelecekte kabul:** Yeni yüklenen eski anı kronolojinin 2026 sonuna düşmez; yalnız belge tarihi biliniyorsa olay tarihi diye kullanılamaz; her satır kaynak cümlesini gösterir.

**Windows / CSP / sağlayıcı / veri sınırı:** Apache küçük temporal DTO/algoritma portu önce; Rust sidecar ancak değer ölçülürse. Memvid feature flags ve Rust native bağımlılıkları Windows’ta denenmedi. Web kaynağındaki kişisel/veri içeren ayrıntılar yalnız seçilen kapsamda kalmalı.

## A842-19 — Eski röportajdaki “geçen yıl” ifadesini bugüne göre yorumlama

**F6 · tarihli medya bilgisi · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/assistant-agent-service.js:119](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-agent-service.js#L119) — Web kaynakları W kimliğiyle oturumda birikir,yanıta liste eklenir;kitap alıntıları ayrıca tutulur. Her web iddiasına doğrulanmış kanıt kenarı üretilmiş sayılmaz.

**Gerçekte okunan kod:** [memvid/memvid · src/analysis/temporal_enrich.rs · pub fn enrich_chunk](https://github.com/memvid/memvid/blob/e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813/src/analysis/temporal_enrich.rs#L656) · HEAD `e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813`. TemporalAnchorTracker document metadata, explicit header, inline date veya inherited kaynaktan anchor tutar. enrich_chunk relative phrase konumu ve çözümünü üretir; İngilizce regex/phrase kuralları gözlendi. Film dilindeki her tarihi anlayan çok dilli parser değildir.

**Kütüphanede önerilen sonuç:** 2018 röportajındaki “last year” 2017 olarak,2022 röportajındaki aynı söz 2021 olarak araştırma notuna eklenebilir; orijinal alıntı değiştirilmez. Kullanıcı varsayılan tarihi ve kaynağını görebilir. Türkçe “geçen yıl” desteği bağımsız kurallar ve yanlış anchor değerlendirmesi gerektirir. Aynı belge içindeki tarih başlığı değişince sonraki sözlerin bağlamı da değişmelidir; kullanıcı görmeden kesin üretim kronolojisi kurulmaz.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/memvid/memvid/blob/e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813/LICENSE). İncelenen Rust kaynakları ve Cargo.toml; core2.0.140,Rust1.85/edition2024. Native/model özellikleri ayrıca değerlendirilmeli.

**Gelecekte kabul:** İki tarihli bölüm birbirinden anchor devralmaz; tarih belirsizse çözüm bilinmiyor kalır; orijinal cümle ve offset korunur; Türkçe destek yokken varmış gibi sunulmaz.

**Windows / CSP / sağlayıcı / veri sınırı:** Yerel port ücretli çağrı gerektirmez. Kaynak tarihi güvenilmez olabilir; dosyanın indirme zamanı anchor yapılmamalı. Yanlış tarih çekim/ödül bilgisi gibi gerçek kabul edilmeden kullanıcı incelemesine açık kalmalı.

## A842-20 — “Geçen sonbahar gördüğüm film yazısı” sorgusunda tarih yorumunu göster

**F6 · tarihli medya bilgisi · NEW · Efor M.** NEW yalnız R838/R839/R841 yakın kartlarına göre yeni mekanizma farkıdır; bütün tarihsel raporlarda yokluk iddiası değildir.

**Bugün:** [src/renderer/assistant-library-actions.js:72](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/assistant-library-actions.js#L72) — Başlık/orijinal başlık/özet içinde substring ve tür/durum/genre filtreleri;8 sonuç sayfalama. Film bilgisi,kişi,yorum,zevk ve koleksiyon araçları zaten var.

**Gerçekte okunan kod:** [memvid/memvid · src/analysis/temporal.rs · pub fn resolve(](https://github.com/memvid/memvid/blob/e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813/src/analysis/temporal.rs#L92) · HEAD `e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813`. TemporalNormalizer bağlam anchor/timezone/week_start taşır; çözüm Date, DateRange, DateTime veya Month olabilir. Ambiguous/Relative bayrakları ve sayısal confidence var. Örnek İngilizce sabitler ve numeric date belirsizliği mevcut; confidence kalibre başarı oranı değildir.

**Kütüphanede önerilen sonuç:** Kütüphane kaynak aramasında “geçen ay kaydettiğim yönetmen yazıları” tarih çipine dönüşür. Kullanıcı kayıt zamanı mı yayım zamanı mı arandığını seçer;“03/04” belirsizliğinde gizli Amerikan tarih varsayımıyla filtrelenmez. Bu genel takvim özelliği değil, kendi medya araştırma kaydını tekrar bulma yoludur. Önceki alanlı arama fikrine doğal dil tarih yorumunu görünür ekler; hazır Türkçe NLP olarak sunulmaz.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/memvid/memvid/blob/e6bd9f7b9c38cd8d5370fa0fc936ac1dcd751813/LICENSE). İncelenen Rust kaynakları ve Cargo.toml; core2.0.140,Rust1.85/edition2024. Native/model özellikleri ayrıca değerlendirilmeli.

**Gelecekte kabul:** TR ve EN tarihleri açık ISO aralığına çevrilir; belirsizlik sorulur veya çip düzenlenir; boş kesişim tüm sonuçları döndürmez; yerel saat gece sınırında kaymaz.

**Windows / CSP / sağlayıcı / veri sınırı:** Algoritma referansı ve Türkçe bağımsız parser; doğrudan Rust dependency zorunlu değil. UTC/Istanbul/DST geçmişi ve İngilizce kural kapsamı ayrı doğrulanmalı. Kullanıcı sorgusunu dış modele göndermeden yerelde çözülebilir.

## A842-21 — “Yalnız şu üç filmin eklediğim kaynaklarını kullan” sınırını bütün arama dallarında koru

**F2 · kütüphane kanıt araması · OLD-DEEPENING · Efor M.** Önceki: A841-24, B841-16. Önceki fikrin bu yeni depodaki gözlenmiş kodla somut derinleştirmesi; yeni fikir sayımına eklenmez.

**Bugün:** [src/renderer/assistant-library-actions.js:72](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/renderer/assistant-library-actions.js#L72) — Başlık/orijinal başlık/özet içinde substring ve tür/durum/genre filtreleri;8 sonuç sayfalama. Film bilgisi,kişi,yorum,zevk ve koleksiyon araçları zaten var.

**Gerçekte okunan kod:** [onyx-dot-app/onyx · backend/onyx/context/search/retrieval/search_runner.py · def search_chunks](https://github.com/onyx-dot-app/onyx/blob/3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48/backend/onyx/context/search/retrieval/search_runner.py#L89) · HEAD `3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48`. search_chunks source_types/document_set_names filtrelerini federated retrieval seçimine verir; indexed kaynak kalmadıysa normal hybrid aramayı açmaz. forced_document_set modülü eksik adın sonuçları genişletmemesini hedefler. Bu tenant kapsamı bizim film koleksiyonuna hazır adapter değildir.

**Kütüphanede önerilen sonuç:** Üç yapımlık araştırma seçimiyle sorulan karşılaştırma web’e veya tüm kişisel arşive sessiz genişlemez. Önceki scope-before-ranking fikri birden fazla arama kolunda somutlaşır. Ancak kullanıcı “dış kaynakları da araştır” seçerse kapsam genişleme açık yeni aşama olur; cevapta eski ve yeni kaynak kümeleri ayrılır. Eşleşme yok cevabı genel kültürle doldurulmaz.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [MIT (non-ee)](https://github.com/onyx-dot-app/onyx/blob/3eb6420f6c7d6c0a94a0b7107a6138509c6d0f48/LICENSE). Yalnız backend/onyx/context/search altındaki incelenen non-ee kod. backend/ee/LICENSE üretimde abonelik/lisans koşulu içerir; enterprise kod aktarımı önerilmez.

**Gelecekte kabul:** Seçili koleksiyon silinmiş veya boşsa sıfır sonuç gelir; federated branch filtreyi atlayamaz; dış web kapalıysa dış servis çağrısı olmaz; yeniden adlandırma yetkiyi genişletmez.

**Windows / CSP / sağlayıcı / veri sınırı:** Yalnız non-ee MIT referans/port; bütün Onyx ACL sistemi alınmaz. Main sourceID/revision yetkisi renderer filtresinden önce doğrulanmalı. Kişisel medya adları arama sağlayıcısına kapsam genişletme seçimi olmadan gitmemeli.

## A842-22 — “Bu iddia hangi kaynaktan?” sorusunda uydurma alıntı numarasını tıklanabilir yapma

**F1 · film araştırması · OLD-DEEPENING · Efor M.** Önceki: B841-20, R839-F08. Önceki fikrin bu yeni depodaki gözlenmiş kodla somut derinleştirmesi; yeni fikir sayımına eklenmez.

**Bugün:** [src/assistant-agent-service.js:119](https://github.com/dorukakindev/whisper-browser/blob/df972383ab5a9b736b832ba64401b206beb6dedc/src/assistant-agent-service.js#L119) — Web kaynakları W kimliğiyle oturumda birikir,yanıta liste eklenir;kitap alıntıları ayrıca tutulur. Her web iddiasına doğrulanmış kanıt kenarı üretilmiş sayılmaz.

**Gerçekte okunan kod:** [deepset-ai/haystack · haystack/components/builders/answer_builder.py · def _extract_reference_idxs](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/haystack/components/builders/answer_builder.py#L281) · HEAD `8e38c633190ee43b80c136b335f8c9d6c79cc5d6`. AnswerBuilder yanıt reference pattern eşleşmelerini belge dizisine bağlar; range expansion seçeneğinde aralık sonunu belge sayısıyla sınırlar. Parser ID bağını kurar, iddianın semantik doğruluğunu kanıtlamaz. Kaynak indeksinin her turda aynı sıralanması önemli.

**Kütüphanede önerilen sonuç:** Film araştırma yanıtındaki [2] tıklandığında gerçekten o tur sağlanan ikinci belge ve pasajı açılır. Model [999] üretirse sahte kaynak kartı yaratılmaz. Önceki yapılı alıntı sözleşmesinin ayrıştırma ve bounds denetimi derinleşir. Kitap alıntılarındaki var olan doğrulama korunarak web/film kanıtlarına ortak kayıt eklenebilir; gösterilen URL tek başına okunmuş sayılmaz.

**Edinim / lisans:** Seçilmiş algoritma/sözleşme Node portu; tam upstream sunucu veya arayüz gömülmez. [Apache-2.0](https://github.com/deepset-ai/haystack/blob/8e38c633190ee43b80c136b335f8c9d6c79cc5d6/LICENSE). Seçilen dosyaların SPDX Apache-2.0 başlığı da gözlendi; model ve üçüncü taraf adapter lisansları bu kapsam değildir.

**Gelecekte kabul:** Geçersiz numara alıntı olarak işaretlenmez;[1-999999999] belleği şişirmez; belge sırası değişse sourceID bağı bozulmaz; desteklemeyen pasaj “doğrulandı” etiketi almaz.

**Windows / CSP / sağlayıcı / veri sınırı:** Apache küçük parser portu; regex alanları uygulama kontrolünde olmalı. Güvenli URL/açma politikası ve main kaynak çözümü korunur. Bu tur model halüsinasyonu ölçülmedi; kabul gelecekteki kontrollü örnekleri tarif eder.

## Doğrulama sınırı

JSON parse, tekil ID, sabit HEAD, kart→manifest eşleşmesi, raw/canonical SHA256 ve yerel canonical taban kontrolleri verification.json içindedir. Kaynakların çalışması/derlenmesi, provider kalitesi, Windows UI/GPU/DRM ve start.bat/install.bat kabulü yapılmadı; dokümantasyon araştırması ürün testi sayılmaz. Transitive dependency, model ve veri lisanslarının tamamı bu tur incelenmedi. Kabul maddeleri gelecek pilot şartlarıdır.
