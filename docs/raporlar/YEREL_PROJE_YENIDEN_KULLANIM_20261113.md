# İki yerel projeden yararlanma — kaynak karşılaştırması

2026-11-13. Ana proje D:/Whisper Local; taban master 9b5f9b4b471bba416e606f83e194768a00cec498 ve önceki yerel anime/manga farkları korunur. Agent kullanılmadı. Bu çalışma kaynak incelemesi ve uygulama önerisidir; aşağıdaki maddeler uygulanmış özellik veya doğrulanmış bug değildir. Donor projeler ve kişisel dosyaları salt okunur incelendi; model çalıştırılmadı, API/hesap/ayar aktarılmadı, commit/push yok.

## Kaynaklar

Film Analizi: H:/PROJE/Diğer Projeler/Film Analizi/electron-app. Okunanlar: js/analysis.js, aspects.js, profile.js, wizard.js, compare.js, consensus.js, research.js, api-cache.js; önceki tur library.js, anime_assistant.js, manhwa_assistant.js, server.py ve recommendation_engine.py'nin ilgili işlevleri.

Altyazı Çevirisi: D:/Openai Altyazı Çevirisi. README, LICENSE, response_integrity.py, translation_memory.py, project_memory.py, series_memory.py işlev haritası, translation_review.py, provider_retry.py; subtitle_translator_gui.py:_chunk_response_retry_reason, _chain_pairs_from_chunk_response ve _chunk_content_owner_mismatch_ids bağlantıları; translation_workbench.py işlev haritası. GUI'nin tamamı incelendi iddiası yok. Donor AGENTS.md kökte yok; donor üzerinde kod çalıştırılmadı/değiştirilmedi.

Whisper karşılıkları: backend/sentence_translation.py, backend/transcribe.py:4468–4488,5016–5081; backend/translation_memory.py ve series_memory.py; src/translation-diff.js, translation-review-summary.js, renderer/translation-repair-desk.js, media-taste.js, taste-quiz.js, media-shelf-service.js, renderer/review-decision-ui.js, assistant-provider.js, assistant-agent-service.js; önceki yerel collection-title-ui ve collection-metadata.

## Öncelikli ilk grup

### 1. Anime/manga yorumlarını mevcut kanıtlı analiz yoluna bağlamak

Kaynak: Film Analizi js/analysis.js:getEffectiveCommentsForAnalysis, yorum seçme/dışlama, js/aspects.js:renderAspectScores; server.py:_scrape_anilist. Bizde collection-detail yorumları okunabilir, fakat bu sayfadaki yorumları film yorumlarıyla aynı kanıtlı analiz/kişisel karşılaştırma akışına bağlayan yüzey henüz yok. Film tarafında zaten review-analysis sözleşmesi ve alıntı doğrulaması mevcut.

Uyarlama: AniList review adapter'i (medya kimliği + reviewID + author + text + URL), seçili yorum/spoiler önizlemesi; mevcut media-tools-model/assistant-provider sözleşmesini anime/manga bağlamıyla genişletmek. Manga için animasyon/OST gibi ölçütleri göstermemek. Analiz örneklemi ve dahil edilmeyen yorumlar açık olmalı. Topluluk yorumu kullanıcı beğenisi sayılmamalı.

Kabul: yanlış yapım/eskimiş örneklem reddedilir; her iddia seçili gerçek alıntıya bağlanır; manga/anime havuzları karışmaz; sağlayıcı çağrısı kullanıcı başlatmadan çalışmaz; kaynak değişiminde eski rapor yeni yapıma uygulanmaz. Bu analiz kodu/kalitesi bu tur çalıştırılmadı.

### 2. “Neden sevdim / neden sevmedim?” kaydını zevk profiline bağlamak

Kaynak: recommendation_engine.py:extract_preferences_from_liked_reasons, extract_tag_preferences_from_liked_reasons, extract_penalties_from_disliked_reasons ve calculate_personalized_score; js/anime_assistant.js ve manhwa_assistant.js açık sinyalleri topluyor.

Bizde açık puanlar, zevk düzeltmeleri ve kanıta bağlı profil zaten var. Eksik tamamlayıcı: tek yapıma bağlı açık neden girişi ve önerilen profil etkisinin kullanıcıya gösterilmesi. “Dünya kurulumunu sevdim, uzayan dövüşleri sevmedim” bir sonraki benzerlik gerekçesinde ayrıştırılabilir.

Uyarlama: kayıtID/domain/revision ile ayrı beğeni nedeni; yapılandırılmış seçimler ve isteğe bağlı kısa not. Profil ağırlığı değişecekse mevcut preview/apply yolunu kullanmak; serbest nottan sessiz kesin tercih çıkarmamak. Düzeltme/silme sonucu yeniden hesaplanmalı; medya havuzları korunmalı.

Kabul: tamamlanma beğeni değildir; puansız0 olumsuz değildir; bir neden silinince etkisi kalmaz; anime nedeni film profilini değiştirmez; onaylanmamış çıkarım kalıcı profile yazılmaz.

### 3. Çeviride bölüm/dizi kapsamlı onaylı karar editörü

Kaynak: Altyazı Çevirisi translation_review.py:preference_locations, load_preferences, save_preference, preference_terms/hint; ProjectMemory'nin source/target ayrımı ve pronoun_map alanı.

Bizde glossary/locked terms, SeriesMemory ve aynı konuşan–muhatap için hitap kuralları zaten mevcut. Yararlı fark, bu kararları kullanıcıya bölüm/dizi kapsamıyla düzenletmek: terim karşılığı, karakter adı, A→B sen/siz; düzeltmenin hangi bölümlerde kullanılacağını açıkça göstermek.

Uyarlama: main servisinde mevcut hafıza sahibine kontrollü okuma/preview/apply; renderer doğrudan dosya yazmaz. İşi kuyruğa alırken tercih snapshot'ı ve sürümü dondurulur. Dizi kimliği belirsiz akışta isimden tahmin edip paylaşım yapılmaz; bölüm kapsamı kullanılabilir. Yeni Python sunucusu veya donorun kişisel hafıza dosyalarını içe aktarma yok.

Kabul: tercih değişimi çalışan işin snapshot'ını değiştirmez; diller/seriler karışmaz; bölüm tercihi bütün diziye sızmaz; sen/siz yalnız tanımlı A→B çifti için uygulanır; otomatik model belleği kullanıcı onayı gibi işaretlenmez.

## İkinci grup

### 4. Tam çeviri öncesi kısa sahne denemesi

Kaynak: translation_review.py:scene_groups, select_pilot_scenes. Baş/orta/sondan bitişik sahne örnekleri seçiliyor, kısa dosyada aynı satır tekrar edilmiyor. Bizde seçili aralık ve hedefli onarım var; bunlar otomatik temsilî pilot seçimiyle aynı şey değil.

Uyarlama: mevcut çeviri kuyruğunda isteğe bağlı pilot kapsamı, süre/satır/sağlayıcı önizlemesi, sonuç beğenilirse aynı ayar snapshot'ıyla tam işlem. Pilot ve tam çıktı kaynak/timeline kimlikleriyle ayrılmalı. Ücretsiz yerel sahne seçimi, ücretli sağlayıcı çağrısından ayrı olmalı.

Kabul: örnekler sahne sınırını aşmaz; çakışan satır yok; pilot tamamlandı diye film bütünü tamamlanmış sayılmaz; kullanıcı başlatmadan ek çağrı yok.

### 5. Çeviri geçişlerinin açıklamalı geçmişi

Kaynak: translation_review.py:build_review_record, validate_review, restore_initial, apply_review. İlk/son metin, geçiş olayları, sahne, çıktı hash'i ve seçili geri alma tutuluyor.

Bizde translation-diff.js değişiklik karşılaştırma/seçili geri alma ve reviewStillApplies var; yeniden yazılmamalı. Ek değer, “bu satırı hangi geçiş niçin değiştirdi?” kaydını mevcut diff görünümüne bağlamak. Geçiş geçmişinin eksik olduğu eski çıktıda geçmiş uydurulmaz.

Kabul: dışarıdan düzenlenen çıktı için eski geri alma uygulanmaz; yinelenen zaman damgaları yalnız zamana göre yanlış eşleşmez; kaynak ve diğer medya değişmez; dublaj eski metin revizyonuna bağlıysa güncelmiş gibi kalmaz.

### 6. Anime/manga için kısa, isteğe bağlı zevk tanıma akışı

Kaynak: js/wizard.js:openOnboardingWizard ve recommendation_engine.py kişisel ağırlıklar. Bizde film taste-quiz var; media-shelf-service taste-quiz işlemi film dışı domain'i özellikle reddediyor. Bu kısıt kaldırılarak aynı film soruları manga altında gösterilmemeli.

Uyarlama: anime/manga için kendi kısa soruları (tempo, karakter odağı, dünya, çizim, kaçınılan temalar); mevcut domain preferences kayıtları. Model gerektirmeyen yapılandırılmış giriş tercih edilebilir. Verilen yanıtlar mevcut açık puanları ezmez; kullanıcı düzenleyebilir/sıfırlayabilir.

Kabul: doğru domain/sürüm, atlanabilir sorular, açık tercih ile puandan gözlenen sinyal ayrı görünür; kaydetmeden çıkış profile yazmaz; boş yanıtlar nötr kalır.

## Zaten mevcut: yeniden eklenmeyecekler

- Anlamsal kalite, part sınırı, isim/sayı kontrolleri: backend/sentence_translation.py; transcribe.py:5051 sonrası güvenilmeyen grup cache/TM'e yazılmıyor. Donor cue_content_owner_mismatch yaklaşımı yararlı karşılaştırma/test kaynağıdır; bizde koruma yok diye raporlanamaz.
- Anlam güvenli bulanık çeviri hafızası: backend/translation_memory.py:fuzzy_semantically_compatible; olumsuzluk/sayı/zamir/noktalama kapıları mevcut. Donor translation_memory'nin tamamını taşımak gereksiz.
- Dizi hafızası ve kaynak/hedef dil ayrımı: backend/series_memory.py; geçmiş bölüm cutoff ve veri/talimat ayrımı mevcut.
- Diff ve geri alma, hedefli onarım, review seçimi ve alıntı kanıtı film tarafında var. Yeni iş, eksik yüzey/bağlantıdır.
- Model karşılaştırması için recommendation-comparison-sample ve recommendation-model-compare mevcut. Eski consensus/compare.js'in çoklu model arayüzü veya otomatik ek ücretli geçişi doğrudan taşınmayacak.
- Genel API cache'i yerine kaynak/iş/dil/model bağlamına sahip mevcut cache'ler korunacak; eski global renderer cache'i yeni gerçeklik kaynağı yapılmayacak.

## Teknik aktarım ve sınırlar

Altyazı Çevirisi LICENSE dosyası GPL-3.0'dır; olası kaynak aktarımında kaynak/lisans bildirimi dosya bazında tutulmalı. Bu tur yalnız mekanizmalar ve uygulama planı kaydedildi, kod kopyalanmadı. İki uygulamanın ayarları, anahtarları, kişisel profilleri, çeviri hafızaları ve kullanıcı içeriği kendiliğinden birleştirilmeyecek. Yaşlı GUI monoliti veya ayrı Flask/Tk uygulaması Whisper'a gömülmeyecek; mevcut Electron main/servis/preload/renderer ve backend sahipleri kullanılacak.

Bu çalışma canlı kullanım, test, benchmark veya görsel kabul değildir. Önceki yerel anime/manga/Whisper düzeltmeleri değiştirilmedi. Öneriler BACKLOG'a tamamlanmış iş/bug diye yazılmadı. Başlangıç için en faydalı sıra1→2→3; ardından kullanıcı ihtiyacına göre pilot ve geçiş geçmişi.
