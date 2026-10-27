# Rapor 659 — Ses temelli müzik keşfi: doğrulanmış araştırma ve uygulama sözleşmesi

27 Ekim 2026. İncelenen Whisper Browser kodu: `bc964fafb2afff4e26eea6e4069757b516bfa151`. **Bu teslim araştırma/tasarım belgesidir. Ürün kodu değiştirilmedi; müzik analizi veya öneri özelliği eklenmiş değildir.** Kullanıcı hem kendi arşivinde hem internette benzer şarkı bulmak istediğini açıkça belirtti. Referans görselleri tür, mood, enerji/duygu, enstrüman/vokal zaman serileri ve benzerlik aramasını kapsıyor.

## Kullanıcı deneyimi

Müzik sayfasında bir parça seçilir: yerel dosya, mevcut çalan parça veya desteklenen bağlantı. Kullanıcı parçanın tamamını ya da zaman çubuğunda seçtiği bölümü referans yapabilir. “Sesine benzer”, “Atmosferine benzer”, “Vokale odaklan”, “Enstrüman/ritim”, “Daha farklı ama aynı his” seçenekleri; arkada gerçekten mevcut olan analiz alanlarına göre açılır.

Sonuçlar **Arşivimde / İnternette** sekmelerinde görünür. Bir adayın sesi karşılaştırılmışsa kullanılan model ve ses kapsamı belirtilir. Yalnız internet önerisi/metadata ise “Henüz ses karşılaştırması yapılmadı” durumudur. Sonuç puanı insan beğenisi yüzdesi veya istatistiksel güven olasılığı değildir. Kaynak parça ile aday arasında A/B dinleme, benzer bulunan zaman bölümüne gitme ve listeye ekleme tek ekranda yapılır. Çalma listesine yazma ayrı uygulanabilir işlemdir; sonuç araması kendiliğinden ses oynatmaz veya parça yüklemez.

## Kaynak incelemesi: ne alınır, ne doğrudan taşınmaz?

| Kaynak | Gerçek kaynakta görülen | Bizim kararımız |
|---|---|---|
| [MiRemd](https://github.com/namngduc/MiRemd) | MIT; spektrogram/CNN embedding ve cosine; README 8 tür sınıflandırmasından 40 boyutlu temsil anlatıyor. API uygulaması `torch/recommend.py` ve yerel model/veriye bağlı. | Ses temelli temsil → yakın komşu yaklaşımı örnek alınabilir. Eski Flask/Docker ekranını, veri varsayımlarını ve doğrulanmamış model.pt dosyasını ürüne taşımamak. |
| [music_rec_system](https://github.com/Philippe-Guerrier/music_rec_system) | README zengin bir yerel hat anlatıyor; kod/README önemli noktalarda ayrışıyor. Repo kökünde lisans dosyası bulunmadı. | Mimari fikir: ayrı feature/embedding/index/sequence katmanları. Kodu doğrudan çalışır motor kabul etmemek ve kopyalamamak. |
| [Essentia](https://github.com/MTG/essentia) | AGPL-3.0; olgun ses analiz araçları ve model ailesi. Resmî kurulum belgesi Windows için cross-compile tarif ediyor. | Sonraki analiz sağlayıcısı adayı; mevcut çalışan Whisper/Torch ortamına rastgele pip bağımlılığı olarak eklenmez. Model lisansı, ağırlık lisansı ve Windows runtime ayrı doğrulanır. |
| [rollingstorms](https://github.com/rollingstorms/Sound-Content-Music-Recommendation-System) | 2022 notebook/autoencoder araştırması; gerçek LatentSpace cosine/embedding yardımcıları var. Repo kökünde lisans dosyası bulunmadı. | Öğrenilmiş temsil ve benzerlik deneyleri örnek alınır. Hazır global şarkı servisi veya üretim motoru kabul edilmez. |
| [Cyanite eski entegrasyon örneği](https://github.com/cyanite-ai/cyanite-integration-example) | Dosya upload/enqueue/webhook örneği; motor/ağırlıklar açık kaynakta sunulmuyor. | Ayrı sağlayıcı adaptörü için API davranışı incelenir; motoru GitHub'dan alabileceğimiz söylenmez. |
| [Cyanite yeni hackathon kiti](https://github.com/cyanite-ai/mml-hackatune-26) | MIT kod; güncel REST örnekleri, tag sözlüğü ve örnek veri var. Veri için ayrıca DATA_LICENSE/CHALLENGE_AGREEMENT dosyaları mevcut. | API/tag sözleşmesi için eski örnekten daha iyi başlangıç. Örnek veri/katalog kullanım hakkı otomatik varsayılmaz. |
| [LAION CLAP](https://github.com/LAION-AI/CLAP) | Resmî modül audio/text temsili sağlıyor; kod deposu CC0. [HF checkpoint](https://huggingface.co/laion/clap-htsat-unfused) kartı Apache-2.0 gösteriyor. | Yerel audio→audio ve text→audio denemesi için güçlü aday. Kod lisansı ile her checkpoint lisansı ayrı kaydedilir. “En iyi” olduğu henüz test edilmedi. |

Depo dalları, tree kimlikleri ve incelenen dosyaların SHA256 bilgileri [kaynak snapshot'ında](MUSIC_DISCOVERY_2026-10-27/SOURCE-SNAPSHOT.json). README'nin model kalitesi/performance iddiaları bağımsız benchmark sonucu değildir. Sıfır dış repo/model çalıştırıldı; GitHub yıldızı kalite ölçütü yapılmadı.

## music_rec_system içinde doğrudan görülen entegrasyon sorunları

- `scripts/extract_features.py` Essentia kullanmayan Windows sürümü. Valence/arousal değerleri spectral centroid/rolloff/ZCR heuristiklerinden üretiliyor. Bunlar öğrenilmiş duygu modeli gibi sunulamaz. Kaynak: [çıkarıcı](https://github.com/Philippe-Guerrier/music_rec_system/blob/main/scripts/extract_features.py).
- Aynı çıkarıcı `path` ve `key_pc` yazarken `sequencer.py` yükleyicisi `track`, maliyet fonksiyonu `key` bekliyor. Bu şema uyuşmazlığı doğrudan gözleniyor; çalıştırma yapılmadı. Kaynak: [sıralayıcı](https://github.com/Philippe-Guerrier/music_rec_system/blob/main/scripts/sequencer.py).
- `embed_clap.py`, `from laion_clap import CLAP` ve `CLAP.get_model(...)` kullanıyor. Bağladığı resmî LAION paketi `CLAP_Module` dışa aktarıyor. Bu statik API uyumsuzluğudur; yerel runtime ImportError testi yapılmadı. Ayrıca hata alan dosyayı sıfır vektörle indekslemeye devam ediyor; biz hata durumunu ayrı tutacağız, sahte embedding üretmeyeceğiz.
- Özellik çıkarıcı dosya çalışırken pip install çağırabiliyor. Biz üretim sırasında bağımlılık değiştirmeyeceğiz; pinli kurulum ve ayrı analiz ortamı kullanılacak.

Bu noktalar üçüncü tarafın bütün projesinin işe yaramadığı anlamına gelmez; README'yi okuyup uygulamayı bitmiş varsaymanın neden yanlış olduğunu gösterir.

## Önerilen iki kataloglu yapı

### Yerel ses motoru

1. Mevcut yetkili medya seçimi, ffmpeg çözümleme ve Müzik oynatıcısı korunur. Şarkı kimliği dosya adından bağımsız içerik/revizyon kimliğiyle tutulur; eski analiz yeni dosyaya uygulanmaz.
2. Parçanın intro/orta/son bölümlerinden ve kullanıcının seçtiği aralıktan örnekler alınır. Tek başlangıç örneğinin bütün şarkıyı temsil ettiği varsayılmaz. Konum/duration kapsamı her sonuçta saklanır.
3. **Müzikal embedding** ile **anlam/metin embedding'i** değiştirilebilir motorlardır. CLAP, Discogs-EffNet ve gerekirse MERT küçük dinleme karşılaştırmasında sınanır. Model/dimension/version değişirse eski indeks sessiz kullanılmaz. CLAP ile MERT vektörleri aynı uzaymış gibi karşılaştırılmaz.
4. BPM/anahtar/RMS gibi ölçümler yardımcıdır. 90/180 BPM gibi yarım/çift tempo adayları dikkate alınır; tonal belirsizlik açıklanır. Gürlük artışı tek başına duygusal enerji artışı sayılmaz.
5. Mood/enstrüman/vokal etiketleri yalnız onları üreten model mevcutsa gösterilir. Bilinmeyen alan 0 puanla doldurulmaz. Zaman çizgileri gerçek segment tahminine bağlıdır; bütün parça etiketinden dekoratif eğri çizilmez.
6. Küçük arşivde normalize vektör karşılaştırması yeterli olabilir; büyük arşivde ölçülerek FAISS/uygun indeks eklenir. Model çıkarımı renderer'da yapılmaz. Whisper/VoxCPM2 GPU işlerinin yanına kontrolsüz eklenmez; mevcut kaynak kilidi kullanılır.

### İnternet araması

İnternet kataloğu ile ses analiz motoru farklı şeylerdir. Yerel bir model, indekslenmemiş bütün interneti kendiliğinden aramaz. İki kanal gerekir:

- **Cyanite sağlayıcısı:** Resmî [similarity search](https://api-docs.cyanite.ai/docs/similarity-search/) belgeleri library/crate/Spotify hedefleri ve complete/representative/interval aramasını tanımlıyor. [Advanced Search](https://api-docs.cyanite.ai/docs/advanced-search/) metin/çoklu referans/segment skorlarını da kapsıyor; Public Preview olarak işaretli. API sürümü/yetenekleri kontrol edilerek uygulanmalı. Kullanıcının web arayüzünde hesabı bulunması API izni veya limitsiz katalog kullanımı kanıtı değildir; mevcut erişim doğrulanmadı. Hiçbir upload/ücretli istek/abonelik yapılmadı.
- **Açık aday bulma + sesle yeniden sıralama:** Mevcut web/medya arama altyapısı adaylar getirir. Erişilebilir/yetkili ses elde edilirse yerel motor karşılaştırır. Erişilemeyen aday doğrulanmış akustik sonuç olarak sıralanmaz. Bölge/önizleme/kapak sürümü/live-remaster farklılıkları kimlik eşleştirmesinde ele alınır. Toplu sınırsız YouTube indirme yapılmaz.

Cyanite skoru ile yerel cosine değeri aynı kalibre edilmiş ölçü değildir; tek bir sahte yüzde listesinde karıştırılmaz. Adayın kaynağı, sürümü ve analiz kapsamı görünür olmalıdır.

## Tasarım sözleşmesi

Mevcut mürekkep/grafit zemin ve sıcak amber korunur. Gönderilen beyaz Cyanite tabloları kopyalanmaz; işlevleri mevcut tasarım diline uyarlanır. `frontend-design` ve `make-interfaces-feel-better` yönergeleri bu tasarım planında dikkate alındı; henüz ekran kodlanmadı veya görsel kabul yapılmadı.

- Üst bölüm: referans kapak/başlık, dalga formu, seçili aralık ve birincil **Benzerlerini bul** eylemi.
- Orta bölüm: Arşivimde/İnternette; sonuç kartında kapak, sanatçı/sürüm, kanıt durumu, en fazla üç gerçek benzerlik nedeni ve dinleme/karşılaştırma.
- Sağ açılır analiz alanı: tür/mood/enstrüman/vokal/enerji. Aynı anda okunaksız onlarca çizgi yerine seçilen boyutlar; nokta seçince oynatma zamanı değişir. Eksik alan açıkça boş durumdur.
- A/B dinleme alanı: kaynak/adayı aynı algılanan ses seviyesine yaklaştırma seçeneği; “ses daha yüksek, daha iyi” yanlılığını azaltma. Ses yüksekliği düzeltmesi asıl dosyayı değiştirmez.
- İleri filtreler: aynı sanatçıyı gizle, cover/live/remaster kontrolü, keşif çeşitliliği, tempo/vokal/enstrüman ağırlığı. Motorun desteklemediği filtre etkinmiş görünmez.
- İş akışı: kaynak hazırlanıyor → ses analiz ediliyor → aday aranıyor → sesler karşılaştırılıyor → hazır/kısmi. İptal, model indirme ve hata halleri gerçek iş defterine bağlıdır. 160–220ms durum geçişi ve reduced-motion desteği; dekoratif kesintisiz animasyon yok.

## Mevcut programa bağlanacak yerler

- `src/renderer/media-home.js`: Müzik gezinmesi ve sayfa sahipliği.
- `src/renderer/media-shelf-ui.js`: mevcut audio oynatıcı, kuyruk ve referans parça seçimi.
- Yeni `src/music-analysis-service.js` / `backend/music_analysis.py`: ayrı, iptal edilebilir analiz işi ve NDJSON.
- Yeni `src/music-recommendations.js`: model/versiyon/kapsam kanıtlı yakınlık ve çeşitlilik sıralaması.
- Yeni `src/music-search-providers.js`: yerel/Cyanite/internet aday adaptörleri; sırlar main'de.
- `src/preload.js` / `src/main.js`: sınırlı açık müzik API'si; keyfi shell veya serbest dosya okuma yok.
- `src/assistant-capabilities.js` ve ilgili agent actions: `analyze_music`, `find_similar_music`, `get_music_analysis`, `compare_music`, `propose_music_playlist`; yalnız gerçek parça/sonuç ID'leri. LLM etiketlerden şarkıyı dinlediğini iddia etmez.

Bunlar **önerilen yeni dosya/araç adlarıdır**, mevcut özellikmiş gibi sunulmaz.

## Uygulama paketleri ve kabul kapıları

1. **Referans ve gerçek yerel ses analizi:** içe aktarma, aralık, segment/versiyon şeması, ayrı runtime, iptal, hata ve cache. Kabul: aynı dosyanın farklı adı aynı içerik; değişmiş dosya yeni analiz; bozuk/sessiz/kısa/stereo/Türkçe yol testleri; çalışan Whisper'a müdahale yok.
2. **Yerel benzerlik + iyi arayüz:** gerçek embedding indeksleme, arşiv araması, kanıtlı sıralama, negatif geri bildirim, A/B ve grafik. Kabul: sıfır/NaN/yanlış boyut vektör reddi; self-match/duplicate kontrolü; tekrar aramada tutarlılık; gerçek Windows dar/geniş ekran görüntüsü.
3. **İnternet/Cyanite:** sağlayıcı ayarları ve kapsam doğrulaması, sayfalama/429/zaman aşımı, sorgu bütçesi, aday/sesle doğrulanmış ayrımı. Kabul: anahtarsız dürüst boş durum; geç gelen başka şarkı cevabının reddi; desteklenmeyen API kabiliyeti gizlenmez; upload yalnız görünür kullanıcı eylemiyle.
4. **Asistan ve zevk profili:** çoklu referans, “bundaki gitar ama daha sakin vokal” sorgusu; onaylı liste oluşturma. Kabul: modelin uydurduğu parça ID'si reddi; yalnız öneri isteği playlist yazmaz; çalışma/iptal/sonuç sorgusu gerçek main job kimliğine bağlı.
5. **Dinleme kalite kapısı:** Kullanıcının Janis Joplin/Etta James/Eddie Hazel/JMSN örnekleri elde edildiğinde parça/sürüm doğrulanır. Embedding adayları kör A/B ile karşılaştırılır; sadece aynı tür/tempo olan olumsuz örnekler dahil edilir. Hem yerel hem internet sonuçları için işe yarayan top-K kullanıcı tercihi ölçülmeden “Cyanite'tan iyi” veya “en iyi varsayılan” denmez.

Bu tur bunların runtime kurulumunu, model indirmesini, müzik dinlemesini veya uygulama kodunu yapmadı. Önce uygulanabilirlik kararı ve dürüst kapsam kesinleştirildi. Mevcut Whisper/dublaj korunuyor.
