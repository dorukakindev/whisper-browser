# On üç deponun kaynak incelemesi ve uygulanan parçalar

Tarih: 2026-11-10. Kullanıcının istediği 13 depo; README, dosya ağacı ve seçilmiş gerçek kaynak kodları incelendi. Uzak kaynak kodu çalıştırılmadı. Kaynak anlık görüntüleri artifacts/reference-study-20261110 altında; kişisel profil bu klasöre kopyalanmadı.

## Bu teslimde somut sonuç

- AniList üzerinden MAL kimliği ve türü birlikte doğrulanan metadata, kapak, güçlü/spoilersız tema, stüdyo ve menşe bilgisi. Kişisel puan/ilerleme/durum alanları ayrı tutulur.
- Yalnız puanlardan olumlu/olumsuz kişisel vektör; IDF ağırlıklı tür/tema/stüdyo benzerliği, destek/karşıt kanıt, dar aday listesinde çeşitlendirme ve puan çıkarma katkısı. Ekranda beğeni yüzdesi uydurulmaz.
- Yerel sıradakiler ve AniList’ten yeni adaylar; aynı tür havuzu, izlenmiş/puanlanmış/başlanmış yapımları eleme; doğrulanmış yeni adayı yerel sıraya ekleme.
- Durum/puan/ilerleme olaylarını kalıcı tutma; İstanbul gün hesabı; aylık takvim, gün filtresi ve kaynak bitiş tarihinin açık etiketi.
- Kapaklı kişisel arşiv, alternatif başlıklarla arama; devam eden metadata işini tekrar açınca izleme, durdurma ve gerçek ilerleme.

Doğrudan uyarlanan kodun kaynağı Seanime Taste Engine cosine çekirdeğidir; MIT bildirimi docs/third-party/seanime-taste-engine-LICENSE.txt dosyasında korunur. Diğer depolardan teknik yaklaşım/arayüz fikirleri ürüne uygun şekilde uygulandı. Lisans kayıtları aşağıda teknik izlenebilirlik içindir.

## joshbingham/Film-Finder

[Sabit kaynak](https://github.com/joshbingham/Film-Finder/tree/abd300b749e974dd2be45f4cb92b7b0166b11802) · Kök/API lisans kaydı belirtilmemiş · `abd300b749e974dd2be45f4cb92b7b0166b11802`

**İncelenen veri/kod:** TMDB; api/tmdb.js, script.js, helpers.js.

**Nasıl çalışıyor:** TMDB isteklerini sunucuya alma, yerel liste/tepki/öneri geçmişi ve çok alanlı aday skoru.

**Bizde kullanılan / karar:** Main/preload sağlayıcı sınırımız korunur; tüm uygulamayı taşımak yerine aday eleme ve alan bazlı sıralama yaklaşımı kullanıldı.

**Sonraki somut fırsat:** TMDB aday keşfi ile kişisel metadata önerilerini birleştirmek; seçilen/atlanmış öneri geçmişi.

## victorverma3/Letterboxd-Movie-Recommendations

[Sabit kaynak](https://github.com/victorverma3/Letterboxd-Movie-Recommendations/tree/13ab7f17c97142facc3acfa993df9a860b78f726) · MIT · `13ab7f17c97142facc3acfa993df9a860b78f726`

**İncelenen veri/kod:** Letterboxd profil/veri işleme; backend/model/recommender.py.

**Nasıl çalışıyor:** Kişisel, genel ve collaborative model yolları; tür/yıl/süre gibi aday koşulları; kullanıcı verisiyle kişiselleştirme.

**Bizde kullanılan / karar:** Tür havuzu ve aday filtresi ayrımı uygulandı; modelin puanı doğrudan bizde beğeni olasılığı diye sunulmadı.

**Sonraki somut fırsat:** Açık koşullarla iki film arasında açıklanabilir karşılaştırma; izleme listesinden seçim.

## riyosha/letterboxd-review-analyzer

[Sabit kaynak](https://github.com/riyosha/letterboxd-review-analyzer/tree/18052ed22c70e60488a5e80d983e6b036a285acc) · MIT · `18052ed22c70e60488a5e80d983e6b036a285acc`

**İncelenen veri/kod:** Letterboxd HTML scraper + Gemini; backend/src/helpers/scrapers.py, letterboxd_analyzers.py.

**Nasıl çalışıyor:** Film/kullanıcı yorumları; özet ve aspect duygu grafikleri. Modelden pozitif/negatif yüzde isteme yaklaşımı var.

**Bizde kullanılan / karar:** Mevcut alıntı/doğrulanmış kanıt ve onay kapıları korundu. Modelin tahmin ettiği yüzdeler doğrulanmış izleyici oranına çevrilmedi.

**Sonraki somut fırsat:** Kaynak alıntılarına dayanan aspect dağılımı, örneklem dengesi ve karşıt yorum görünümü.

## hajarbenjat/MovieRecommendationSystem

[Sabit kaynak](https://github.com/hajarbenjat/MovieRecommendationSystem/tree/739eab5a1ce759029a536408da42ec7c82568f1a) · MIT · `739eab5a1ce759029a536408da42ec7c82568f1a`

**İncelenen veri/kod:** movies.csv, ratings.csv, tags.csv; movieRecom.ipynb.

**Nasıl çalışıyor:** Surprise SVD collaborative filtering; MAE/RMSE ile değerlendirme.

**Bizde kullanılan / karar:** Notebook ve veri ihtiyacı doğrulandı; tek kullanıcının 53 puanına genel kullanıcı modeli eğitilmiş gibi davranılmadı.

**Sonraki somut fırsat:** Sabit doğrulama kümesi ve gerçek çok kullanıcılı veri/çalışan ağırlık varsa alternatif model denemesi.

## FuzzyGrim/Yamtrack

[Sabit kaynak](https://github.com/FuzzyGrim/Yamtrack/tree/387274467e771845cf84fe3ceb1b249ad8405e41) · AGPL-3.0 · `387274467e771845cf84fe3ceb1b249ad8405e41`

**İncelenen veri/kod:** AniList/TMDB provider adaptörleri; src/app/providers/anilist.py, services.py, history_processor.py; events/calendar.

**Nasıl çalışıyor:** Kaynak kimliği, metadata adapterı, her etkileşim için tarihli geçmiş; takvim ve .ics; çok medya türü.

**Bizde kullanılan / karar:** MAL→AniList kesin kimlik doğrulaması, kaynak tarihi/işlem tarihi ayrımı, kalıcı durum/puan/ilerleme olayları ve aylık takvim uygulandı.

**Sonraki somut fırsat:** Sezon yayın takvimi, tekrar izleme oturumu, yeniden okuma sayacı, .ics dışa aktarımı.

## sbondCo/Watcharr

[Sabit kaynak](https://github.com/sbondCo/Watcharr/tree/86f4a681e811f444392f485823f39c9fcd164dd2) · GPL-3.0 · `86f4a681e811f444392f485823f39c9fcd164dd2`

**İncelenen veri/kod:** TMDB provider ve transform; server/media/tmdb/tmdb.go, provider_transform.go.

**Nasıl çalışıyor:** Ortak provider modeli, kapaklı izleme listesi, kaynak verisini kişisel kayıt alanından ayırma.

**Bizde kullanılan / karar:** Provider metadata ayrı alan ve kapaklı kayıt görünümü uygulandı; mevcut film TMDB sahipliği korundu.

**Sonraki somut fırsat:** Film/dizi poster önbelleği ve servis/ülke bazlı nerede izlenir bilgisini mevcut köprüyle genişletmek.

## MRamazan/AnimeRecBERT

[Sabit kaynak](https://github.com/MRamazan/AnimeRecBERT/tree/afca0980b24a3018d6cefdf63029aa743ca1cd44) · GPL-3.0 · `afca0980b24a3018d6cefdf63029aa743ca1cd44`

**İncelenen veri/kod:** MAL kimlikli AnimeRatings54M; datasets/AnimeRatings54m.py, inference_gui.py, models/bert.py.

**Nasıl çalışıyor:** Transformer/BERT tabanlı sıralı öneri; model sözlüğü ve checkpoint gerektiriyor.

**Bizde kullanılan / karar:** Kaynak/kod ve model sözlüğü şartı incelendi. Ağır model veya 54M veri otomatik indirilmedi; çalışan BERT çıkarımı iddiası yok.

**Sonraki somut fırsat:** Uyumlu checkpoint bulunursa ayrı Python servisinde yerel inference; yeni/soğuk başlıklar için metadata geri dönüşü.

## Salierigator/anigator

[Sabit kaynak](https://github.com/Salierigator/anigator/tree/afd9f449dc0f4fec27f0a760e085015e10c1d27e) · Kök/API lisans kaydı belirtilmemiş · `afd9f449dc0f4fec27f0a760e085015e10c1d27e`

**İncelenen veri/kod:** MAL metadata; model/ranker/src/features.py, pool.py, user_encode.py.

**Nasıl çalışıyor:** İki-tower retrieval ardından LightGBM LambdaRank; genre/theme/history özellikleri; yeni başlıklar ayrı cold-item bölümü.

**Bizde kullanılan / karar:** Aday getirme ve yerel tekrar sıralama ayrıldı; yeni keşif ile sıradakiler ayırt edilir, izlenmiş/kayıtlı durumları aynı aşamada elenir.

**Sonraki somut fırsat:** Model ağırlığı ve özellik sözlüğü doğrulanırsa ikinci aşama ranker; cold-item sonuçlarının ayrı gösterilmesi.

## tokyo720022-create/What-Next

[Sabit kaynak](https://github.com/tokyo720022-create/What-Next/tree/25a70e3970096b1e66e2339a593fa838f5cb5e96) · MIT · `25a70e3970096b1e66e2339a593fa838f5cb5e96`

**İncelenen veri/kod:** AniList; js/features/taste-math.js, pick-taste.js, calendar.js.

**Nasıl çalışıyor:** Güçlü ve spoiler olmayan etiketler; anime/manga ayrı tat raporu; süreye göre seçim; takvim ve franchise haritası.

**Bizde kullanılan / karar:** Spoiler etiketlerini dışlama, tür havuzları, kapaklı takvim/ayrıntı yaklaşımı ve yeni aday kaynağı kullanıldı.

**Sonraki somut fırsat:** Tema portresi, nişlik/çeşitlilik raporu, süreye göre izleme akşamı, franchise izleme sırası.

## atharv-patil/anime-recommendation-system

[Sabit kaynak](https://github.com/atharv-patil/anime-recommendation-system/tree/7dc2c4c5fcc0cc69a80a2da4c71c51f0e7a583ad) · Kök/API lisans kaydı belirtilmemiş · `7dc2c4c5fcc0cc69a80a2da4c71c51f0e7a583ad`

**İncelenen veri/kod:** Anime-Planet CSV; app/main.py, hazırlanmış similarity.pkl.

**Nasıl çalışıyor:** İçerik tabanlı benzerlik; metin/tür özellikleri ve cosine; Streamlit sunumu.

**Bizde kullanılan / karar:** Benzerlik beğeni tahmini diye adlandırılmaz; çalıştırılabilir .pkl yüklenmedi. Kimlikli güncel metadata kullanıldı.

**Sonraki somut fırsat:** Özet metni özellikleriyle açıklanabilir benzerlik; veri sürümü sabit çevrimdışı değerlendirme.

## Garretthall27/Crunchyroll-Recommender-System

[Sabit kaynak](https://github.com/Garretthall27/Crunchyroll-Recommender-System/tree/005d352d27df85e39c57b7618d7b5e506a7cd16d) · Kök/API lisans kaydı belirtilmemiş · `005d352d27df85e39c57b7618d7b5e506a7cd16d`

**İncelenen veri/kod:** JustWatch verisi / hazırlanmış CSV; streamlit_app.py.

**Nasıl çalışıyor:** İçerik vektörleri; cosine ve nearest neighbours; format/tür filtreleri.

**Bizde kullanılan / karar:** Süre/tür filtresi ve metadata benzerliği ayrımı yerel motorda var. Eski servis kataloğu güncel bulunabilirlik diye kullanılmadı.

**Sonraki somut fırsat:** Doğrulanmış ülke/servis bulunabilirliği; yayıncı filtresi.

## SauwenBlush/seanime-taste-engine

[Sabit kaynak](https://github.com/SauwenBlush/seanime-taste-engine/tree/1c0db322bf06cd2734ff5068af544b73d537ac5e) · MIT · `1c0db322bf06cd2734ff5068af544b73d537ac5e`

**İncelenen veri/kod:** AniList + Seanime playback/list olayları; src/index.ts.

**Nasıl çalışıyor:** Seyrek özellik vektörü, IDF ağırlığı, cosine, küçük aday havuzu, poster ve kısa gerekçe.

**Bizde kullanılan / karar:** Cosine çekirdeği MIT bildirimiyle uyarlandı. Tür/tema/stüdyo özellikleri, IDF ve puanlardan imzalı olumlu/olumsuz profil uygulandı. Tamamlama/tekrar izleme örtük beğeni yapılmadı.

**Sonraki somut fırsat:** İsteğe bağlı davranış sinyallerini puandan ayrı göstermek; tercih olarak açılmadan profile karıştırmamak.

## Ameobea/sprout

[Sabit kaynak](https://github.com/Ameobea/sprout/tree/5130250219415c63fd57bee293640dcba0801597) · Kök/API lisans kaydı belirtilmemiş · `5130250219415c63fd57bee293640dcba0801597`

**İncelenen veri/kod:** MAL/AniList; anilistAPI.ts, offlineMetadataDB.ts; recommendation/recommendation.ts.

**Nasıl çalışıyor:** Yerel/browser model, profil analitiği ve her puanın katkısını tek tek çıkararak açıklama; büyük model/dataset süreci ayrı.

**Bizde kullanılan / karar:** Bir destek puanı çıkarıldığında benzerlik değişimi hesaplanıp Dayanak ve sınırlar altında gösterilir. Bu bizim metadata motorumuzun katkısıdır; Sprout model tahmini değildir.

**Sonraki somut fırsat:** Etkileşimli puan denemesi, anime atlası, offline metadata katmanı, doğrulanmış ağırlıklarla ayrı yerel model.

## Öncelikli devam planı

1. Mevcut kimlikli motorun adaylarından kullanıcı tarafından seçilen beğenme/beğenmeme geri bildirimini ayrı tutmak; öneri tekrarlarını azaltmak.
2. Anime/manga franchise ilişkileri ve izleme/okuma sırası; AniList relation kimliğiyle, kullanıcı tamamlamasını değiştirmeden.
3. Tür/tema portresi ve çeşitlilik raporu; puan ve gözlem sayısı ayrı, puansız tamamlama beğeni sayılmadan.
4. Yalnız gözden geçirilmiş şartlarla sezon/yayın takvimi ve .ics; kişisel tüketim takviminden ayrı.
5. TMDB film/dizi adayları, stüdyo/yönetmen kaynaklarının ayrımı, ülke/servis bulunabilirliği.
6. BERT / two-tower / ranker / Sprout modellerini isteğe bağlı ayrı süreçte denemek: gerçek checkpoint, vocabulary, veri sürümü ve ölçülebilir karşılaştırma doğrulanmadan etkin model diye sunmamak.

Bu araştırma Git teslimi değildir; commit/push/PR/merge ve GitHub Actions yapılmadı.

## İsteğe bağlı ek araştırma: ortak film/anime öneri merkezi

Kullanıcı ayrıca kaynak araştırmasını ilk 13 depoyla sınırlamama talimatı verdi. Aşağıdaki dört ek deponun güncel README ve kaynak ağacı incelendi; bu ek değerlendirmedeki kaynaklar çalıştırılmadı.

- [DeiYui/AniMatch](https://github.com/DeiYui/AniMatch): seçilen başlığı önce açıkça tanıma, bağlamlı anime adayları ve gerekçeleri. Ortak sayfada arama sonucu seçimi ile öneri ayrı adımlardır; bir yapımdan başlamak kullanıcının onu beğendiği varsayımı değildir.
- [sdl60660/letterboxd_recommendations](https://github.com/sdl60660/letterboxd_recommendations): halka açık profil puanlarını aday üretiminden ayıran profil girişli öneri akışı. Bizde profil okuması oturumluk; mevcut kişisel profil sessiz güncellenmez. Hazır eğitilmiş collaborative model bu teslimde yüklenmedi.
- [gavxm/ani-mcp](https://github.com/gavxm/ani-mcp): adla arama, kesin yapım ayrıntısı, benzerleri ve kullanıcı listesinden zevke göre önerileri ayrı işlemler olarak sunar. Bizde aynı ortak sayfada Film/Anime ve Puanlarımdan/Profilden/Bir yapıma benzer seçenekleri vardır.
- [alpboraeris/movie-recommendation-system](https://github.com/alpboraeris/movie-recommendation-system): TMDB metadata'sı ve adla seçilen film üzerinden içerik benzerliği. Bizde Cinemeta arama sonuçları kesin IMDb kimliğinin ayrıntısıyla zenginleştirilir; başlık benzerliği tek başına eşleştirme sayılmaz.

Ortak öneri merkezi: Letterboxd kullanıcı adı/profil URL'si, AniList kullanıcı adı/profil URL'si, yerel puanlar ve kesin yapım seçimi. Keşfet/İzlediklerim düğmeleri aynı akışı açar. Film ve anime ayrı tutulur. Letterboxd HTML erişimi engellenirse herkese açık RSS son kayıt örneği okunur ve kapsam açıkça sınırlı diye etiketlenir. Tam profil okunmuş gibi davranılmaz; puansız izleme beğeniye dönüştürülmez. Cinemeta'da türsüz kısa arama sonucu önce ayrıntıdan tamamlanır, doğrulanamayan tekil kayıt dayanağa katılmaz.
