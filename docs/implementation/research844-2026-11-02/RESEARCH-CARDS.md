# 45 araştırma kartı: güncel kodla ayrım — 2026-11-02

İncelenen kaynaklar: `D:/Whisper Local/docs/raporlar/yedi-alan-arastirma-2026-11-02/01..07` ayrıntıları ve `asistan-derin-yetenekler-2026-11-02/{KAYNAK_VE_KANIT,IS_YURUTME,YANIT_VE_KULLANICI_DEGERI}.md`. Karşılaştırma hedefi bu çalışma kopyasının **güncel sahip kodudur**; araştırma belgelerinin eski taban satır numaraları güncel davranış kanıtı kabul edilmedi. Web/API/Git işlemi, yeni ürün uygulaması veya test çalıştırması yapılmadı.

Sınıflar birbirini dışlar: **existing** = kartın dar yeni sözleşmesi zaten karşılanıyor; **partial** = önemli alt parça var, kartın tam kabulü yok; **usefulnext** = gerçek, sınırlandırılabilir sonraki dilim; **defer** = gerçek boşluk fakat önce bağımlılık, kullanım ihtiyacı veya maliyet/mahremiyet kararı gerekli. `partial`, tamamlandı demek değildir. Araştırmaların özellikle eski temelin üzerine koyduğu deltalar değerlendirildi; bu nedenle tam `existing` çıkmaması, uygulamanın yeteneksiz olduğu anlamına gelmez.

**Toplam: 45 kart = 0 existing + 13 partial + 13 usefulnext + 19 defer. Hiçbiri bu triage ile uygulanmış sayılmıyor.** R844-01/02 kontrol kapısı onarımları, RSS kaydet/read/later kartları, Keşfet görünür filtreleri ve okuma yerine dönüş bu 45 araştırma kartının topluca uygulanması değildir.

## 01 — Asistan etkileşimi

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| E01 | usefulnext | `assistant-thread-store.js: register/list` kesin sourceKey ile listeler; `renderer/assistant-overlay.js: filter` yalnız mevcut log'u arar. `assistant-workspace.js: command` eski thread seçimini sağlar. Kaynaklar arası **messageId hedefli yerel arşiv araması ve salt okunur açma** hâlâ ayrı iş; mevcut Ctrl+F tekrar yazılmamalı. |
| E02 | defer | `assistant-workspace.js: history` tamamlanmış çiftleri ve delivered runtime iletilerini son24 history öğesine alır; `assistant-thread-store.js: cleanThread` dışlanmış turn alanı saklamaz. Çifti silmeden prompt'tan çıkarma yok; önce deterministik history projeksiyonu, kalıcı schema ve dal kapsamı kararı gerekir. |
| E03 | usefulnext | Overlay copy/pin/branch sunuyor; store mesaj ID/metin tutuyor. Composer'a **originThread/message/revision/range** ile doğrulanmış yanıt alıntısı taşınmıyor. YD-02 ile aynı ankraj temelini paylaşabilir; yanlışlık bildirmeden alıntılı soru sorma ayrı kullanıcı eylemi kalmalı. |
| E04 | partial | `assistant-workspace.js: create/command('branch')` mesajları kopyalayıp parentThreadId saklar; store bunu korur. Fork mesajı/revizyonu ve iki dalın doğrulanmış ortak öncül projeksiyonu yok. Yeni branching sistemi değil, mevcut dala salt okunur soy/ayrışma görünümü gerekir. |

## 02 — Araç ve MCP ekosistemi

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| T02-01 | defer | `assistant-mcp-bridge.js: rpc` initialize/ping/tools list-call ve üç read-only araç sunar; resources list/read veya dış resource client yok. Yerel `assistant-context-manifest.js` kaynakları standart MCP resource yapmaz. Önce somut dış host ihtiyacı ve açık paylaşım/revoke sınırı seçilmeli; yalnız dışa sunma küçük pilot olabilir. |
| T02-02 | defer | `assistant-source-context.js: scope` ve `renderer/assistant-feed-sources.js: snapshotRevision` yerel stale-owner denetimini zaten yapar. Bridge yalnız POST RPC/tools sunar; URI subscription/notification yaşamı yok. T02-01 olmadan kurulacak abonelik katmanı şu an tüketicisizdir; notification kaynak doğruluğu kanıtı değildir. |
| T02-03 | defer | `assistant-provider.js: run` uygulama system sözleşmesini kurar; `assistant-workflow-plan.js: build` aşama notları üretir. Bridge prompts/list/get sunmaz. Parametreli MCP tarif dağıtımı mevcut workflow planının başka adı değildir; kaynak paylaşım/seçici yolu ve gerçek görev ihtiyacından sonra yapılmalı. |
| T02-04 | defer | `assistant-capabilities.js: definitions/validate` schema ve exact-ID araçları mevcut; MCP completion/complete yok. Bu, genel metadata sorgusundan farklı bir parametre tamamlama yolu. T02-01/03 seçicileri kurulmadan tek başına ürün değeri düşük; gerçek parent→child ID filtresi gerekir. |

## 03 — Medya sorusunun bağlamı

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| M03-01 | usefulnext | `renderer/assistant-app-actions.js: snapshot` zamanı yakalar; `assistant-context-manifest.js: same` owner eşitliğine zamanı katmaz; `assistant-workspace.js: searchSubtitleContext/subtitleContextRows` araç çalışırken canlı zamanı okur. Gönderilen **insan mesajına sabit time+cue+track revizyonu** yok. “Bu kısım” ile “şimdi” ayrımı için ilk güçlü küçük dilim. |
| M03-02 | defer | `browser-subtitle-sync.js: sourceToVideoTime/fit` scale+offset ve residual sağlar; `film-watch-service.js: source-preview/apply` aynı kesim veya açık offset ile konum taşır. Parça bazlı, eşleşmeyen boşlukları koruyan kesimler arası harita yok. Mevcut senkronun yerine geçmemeli; doğrulanmış iki kesim ve mapping sözleşmesi gerekir. |
| M03-03 | partial | `renderer.js: translationsForCues` en iyi örtüşmeden metin döndürür; `subtitle-pair-quality.js` daha zengin eşleme yardımcılarına sahiptir. Manifest pool'unda tek translation string var; ayrı source/target cue ID'leriyle çoktan çoğa kenarlar yok. Yeni çeviri motoru değil, mevcut eşlemeyi kanıt kimliğinde koruma işi. |
| M03-04 | usefulnext | `subtitle-word-sidecar.js: sanitizeWordSegments` start/end/words saklar; `assistant-context-manifest.js: pool/sourceText` speaker taşımıyor. Backend'deki mevcut speaker metadata'sını revizyonlu kanıta aktarmak küçük ve gerçek bir deltaydır. SRT'de bilinmeyeni korumalı; yeni diarization/model indirme otomatik başlamamalı. |

## 04 — Keşfet adayları ve sıralama

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| K7-01 | usefulnext | `media-discovery-service.js: action personal` seçili tür/yönetmen dallarını birer `list()` ile okur; dışlamalardan sonra az kalan sonuca göre nextSkip tüketmez. Normal liste pagination'ı bunu karşılamaz. Aynı açık beğeni dalında bounded refill, scanned/accepted/exhausted ve hata ayrımı ilk yararlı öneri dilimi. |
| K7-02 | usefulnext | Aynı `personal` kolu `seen` ile başlığın sonraki dal desteğini atar; sonra60 sonuç keser. `assistant-retrieval.js: fuse` mevcut olsa da chunk anahtarlıdır. Film kimliği/seed ailesi bazlı kararlı destek birleşimi gerekir; RRF'yi beğeni olasılığı veya aynı seed'in tekrarını bağımsız destek saymamalı. |
| K7-03 | defer | `recall-network.js: recommend` metadata özellik kesişimi; `media-discovery-service.js: personal` tür/yönetmen kanalları kullanır. Mevcut lexical retrieval başlık aday kanalına bağlı değil. Ancak önce kullanıcının **hangi not/terimi beğeni nedeni olarak seçtiği** sabitlenmeli; özetin tamamını zevk varsaymak yanlış. |
| K7-04 | partial | `personal-media-state` film aspect tepkilerini; `recall-network.js: reaction` açık aspect/note/revision saklar. Fakat recommend negatif başlığın ortak features'ını eksi sayar; `media-daily-service.js: recommendations` genre-less/director-more uygular. Nitelik+görev kapsamlı, kanıtlı negatif aktarım hâlâ yok; mevcut olumsuz tercih sistemi yok sayılmamalı. |

## 05 — Keşfet/kütüphane yolculuğu

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| K5-01 | partial | `media-daily-service.js: continuations` açıkça recorded-episode-only döndürür; `media-catalog-store.js: episodeOf` airDate, `catalog-discovery.js` bölüm metadata'sı sağlar. Sağlayıcının tarihli yayımlanmış toplamı ile **kayıtlı/izlenen/oynatılabilir** kapsamı karşılaştıran tamlık nesnesi yok. Takvim/sonraki bölüm varlığı tamlık kanıtı değildir. |
| K5-02 | defer | `assistant-collections.js` onaylı ekle/çıkar planı; `film-watch-service.js: collection` kişisel sıra/açıklama; shelf CSV içe aktarma mevcut. Önceki dış snapshot+son dış liste+yerel kullanıcı değişikliği üçlüsünü birleştiren refresh planı yok. Önce stable list identity ve üyelik provenance gerekir; CSV importer tekrar yapılmamalı. |
| K5-03 | defer | Koleksiyon üyelikleri katalogda adlarla, `film-watch-service.js` metadata'sı collection name ile tutuluyor. Global reaction/dislike ve üyelikten çıkarma mevcut; listId bazlı kalıcı exclude/archive yok. K5-02'nin stable ID/kökeni olmadan ad değişiminde yanlış listeyi etkileyebilir; yeni global gizleme aracı olarak sunulmamalı. |
| K5-04 | partial | `catalog-library-model.js: relations` edition/cut/parts; `media-catalog-store.js` tek runtime; `film-watch-service.js: film-watch-overview/source-preview` kaynak duration ve kesim onayı tutar. Edition'e bağlı ölçülmüş süre+köken+revizyon yok. Katalog süresi ile seçili kesim süresini bütçede ayırmak gerçek kalan deltaydır. |

## 06 — Browser gezinmesi

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| N06-01 | partial | `renderer/renderer-helpers.js: duplicateBrowserTab` boş sekme yaratıp yalnız URL'ye gider. `browser-session-store.js` position/track/reader/history normalizer'ları vardır. İzinli state klonu+ayrı kimlik+duraklatılmış başlangıç eksik; aktif işleri veya mutable edit dizisini kopyalamak doğru çözüm değildir. |
| N06-02 | usefulnext | `main.js` close yolu `ordered[index+1] || ordered[index-1]` seçer; aynı sahip zaten lastActivatedAt yazar. Mevcut kapanış/onay/split hattında küçük `chooseTabAfterClose` MRU politikası mümkün. Yan sekme kapanınca oynatmaya zorlamadan önceki inceleme tabına dönme gerçek yeni davranıştır. |
| N06-03 | usefulnext | `renderer.js: syncBrowserTabItem` active/loading/pinned/activity/split; `renderer-helpers.js: browserTabActivity` yükleme/iş durumunu gösterir. `browser-session-store.js` normalizer'ında document-generation tab unseen sözleşmesi yok. Spinner'dan bağımsız new-unseen/seen küçük deltaydır; RSS read ile birleştirilmemeli, görsel taslak gerekir. |
| N06-04 | defer | Renderer tab seçimi tek tab aktivasyonu; yardımcı menü diğerleri/sağdakiler komutlarını sunar. Rastgele selectedTabIds+range anchor yok. Mevcut grup/drag/split'i tekrar kurmak yerine yeni seçim sözleşmesi gerekir; ilk ihtiyaç mute/group olarak seçilmeden toplu kapat genişletmesi uygun değil. |

## 07 — Browser medya/site

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| B7-01 | defer | `browser-media-controller.js` mevcut medya komut/probe sahibi; main native oynatma olaylarını, mini-player mevcut view'ı kullanır. Bunlar uygulama çapında MediaSession action sahipliği değildir. Site handler'larını koruyan tek-owner tasarımı ve gerçek Windows medya tuşu deneyi olmadan eklemek riskli; mevcut tuşların çalışmadığı iddia edilmez. |
| B7-02 | usefulnext | Controller `probe` readyState/spinner/time/frame; `browser-playback-diagnostics.js` ilerlememe/codec/EME/ağ ayrımını yapar. Buffered aralık ve gerçek waiting/seek/end özeti taşınmıyor. Mevcut tanıya küçük tampon+bağlantı birleşimi eklenebilir; online/HTTP başarıyı oynatma düzeldi diye göstermemeli. |
| B7-03 | defer | `browser-site-permissions.js` display-capture'ı genel izin enum'una alır. `main.js: installSystemAudioCaptureHandler` defaultSession için ayrı live-ASR yoludur. Browser partition'a seçili kaynak+grant ömrü+stop broker'ı değildir. Ancak somut web paylaşım ihtiyacı ve kurulu native picker desteğiyle ele alınmalı; genel kalıcı allow yetmez. |
| B7-04 | defer | `browser-downloads.js: sanitizeRecord/persistTerminal` aktif kaydı saklamaz, terminal URL/cookie tutmaz; resume yaşayan DownloadItem içindir. Restart checkpoint yok. Kaynak validator/offset ve hassas URL saklama politikası+native resume kabulü gerekli; mevcut gizlilik kararını düz metin URL yedeğiyle bozmamalı. |

## Derin — kaynak ve kanıt

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| K01 | usefulnext | `assistant-capabilities.js: search_library` query/kind/status/genre/offset; `renderer/assistant-library-actions.js: search_library` bunları gerçekten uygular. `media-source-mechanisms.js: filterCatalog` süre gibi ek yerel filtreler de içerir, fakat asistan typed AND/OR yıl/süre/puan AST'si değildir. İlk pilot yalnız gerçekten kayıtlı güvenilir alanlarla; ülke bilinmiyorsa uydurulmaz. |
| K02 | defer | `assistant-retrieval.js: search/multiSearch` top-k; `assistant-context-manifest.js: sourceText` bütçeli; workspace toolContext büyük kaynağı örnekler. Kapsam uyarıları doğru olsa da bütün chunk'ları başarılı/başarısız makbuzla tarayan resume işi yok. Açık kapsam/token bütçesi ve selected-source iş yaşamı önce belirlenmeli; her soruya otomatik tüm eser çağrısı eklenmemeli. |
| K03 | defer | `assistant-recall-contract.js: proof`, `media-tools-model.js: verifyDecision` exact quote/kapsam doğrular. Bunlar iddianın alıntıdan anlamsal olarak çıktığını kanıtlamaz. Ayrı API evaluator gecikme/maliyet ve aynı-model hata riski taşır; önce claim ankrajı ve Türkçe/ironi değerlendirme seti gerekir. |
| K04 | partial | `assistant-library-actions.js: search_library` tam mevcut filtre sonucunun count/nextOffset'unu doğru verir; `media-source-mechanisms.js: facets` unknown/incomplete ayrımı yapar. K01'in aynı predicate+revision'ına bağlı matched/eligible/unknown/excluded ve oran paydası genel aracı yok. “Count yok” değil, daha zengin sorgunun sayım sözleşmesi eksik. |
| K05 | usefulnext | `assistant-library-actions.js: get_playback_state` gerçek position/duration/rate okur; `media-source-mechanisms.js: timePlan` bütçe/break hesabı yapar. Operandı exact playback sonucu/revizyonuna bağlı remaining_wall_time/ratio aracı registry'de yok. Bounded enum matematiği yeterli; eval, mathjs paketi veya yeni model şart değil. |
| K06 | partial | `feed-store.js: entry(id,revision)` son3 revision/readSnapshot içinden eski metni açabilir; asistan feed/thread evidence sınırlı frozen alıntı tutar. Bu, tüm kaynaklarda capturedAt→immutable içerik seçen as-of aracı değildir. RSS sürümleri değerlendirilmeli; ikinci genel arşiv/DB kurmak ilk adım olmamalı. |

## Derin — iş yürütme

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| Y01 | partial | `assistant-workflow-plan.js: build` sıralı plan ve requires; `film-watch-service.js: overview/source-preview` somut hazırlık/konum önizlemesi; koleksiyon planı üyelik etkisini gösterir. Çok araçlı aynı snapshot üzerinden saf before→projectedAfter yok. Tek kart veya rota notlarını bütün görevin yan etkisiz provası saymamalı. |
| Y02 | partial | `assistant-agent-service.js: subtitleBinding`, jobBindings ve `use_job_subtitles` exact iş/owner/rol/tamamlık denetler; `assistant-flows.js: record` args/result tutar. Şema sahibi producer-run+artifact-revision→consumer arg `OutputRef` kenarı yok. Mevcut exact-job güvenceleri atılıp graph framework kurulması gerekmiyor. |
| Y03 | defer | `assistant-library-actions.js: commitPreferences` ve workflow/settings yollarında tek işlem undo/rollback var. `assistant-flows.js` çok araçlı effectId/before/applied/conditional compensate manifesti tutmaz. Kullanıcının sonraki düzenlemesini ezmeyen cross-effect geri alma ayrı yüksek dikkat işi; üretilmiş dosya/API maliyeti geri alınabilir ilan edilmemeli. |
| Y04 | defer | `assistant-runtime.js: orderedBatch` en çok2 safe read; jobs ledger ve koleksiyon batch'i var. Genel sourceId+revision çocuk görevleri için parent sonuç manifesti/terminal upsert yok. Önce açık çoklu-source seçimi ve tekil görev makbuzu gerekir; paralelliği artırmak bu kartı tamamlamaz. |
| Y05 | partial | Workflow plan requires, service exact subtitle attachment kapısı ve job artifact partial denetimi var; R844 restore istisnası da bu özel kapının sınırını düzeltti. Genel required/optional artifact roles + revision'lı named barrier yok. Özel mevcut güvenceyi tüm voice araçlarına yeniden yaymak yanlış olur. |
| Y06 | partial | `film-watch-service.js: overview/asset` dosya varlığı/grant denetler; `assistant-flows.js: retryAllowed` başarısız son aşamayı aynı args ile yeniden dener. Kalıcı artifact bağımlılık grafı üzerinden taşınmış/kayıp çıktının minimum yeniden bağla/üret planı yok. Mevcut hazır dosyayı kullanma akışı gerçek temeldir; tam repair sayılmaz. |

## Derin — yanıtın kalıcı değeri

| ID | Sınıf | Güncel sahip kanıtı ve gerçek delta |
|---|---|---|
| YD-01 | partial | `renderer/assistant-film-actions.js: compare_film_titles/showComparison` iki exact film ve verified citations ile geçici karşılaştırma kurar. Kalıcı row/entity/cell evidenceRefs+revision, üçüncü filmi yalnız yeni hücrelerle ekleme yok. İki-film karşılaştırması eksik değil; artımlı kaynaklı artifact ayrı deltaydır. |
| YD-02 | usefulnext | Overlay pin/copy/branch ve delivered steer/followup var; thread cleaner revizyonlu answer-span annotation tutmaz. E03'ün doğrulanmış quote ankrajından sonra scope=this-answer/thread düzeltme notu küçük pilot olabilir. Film reaction/taste araçları cevap doğruluk geri bildirimi yerine kullanılmamalı. |
| YD-03 | defer | `assistant-film-actions.js: revealCitation` değişmiş/kayıp exact alıntıyı reddeder; Recall kaynak ilişkileri stale olabilir. Serbest yanıt span→claim→citation revision bağı yok. Önce YD-01/02 kimlikleri; kaynak değişikliği yerel tespit edilir ama “iddia yanlış” sonucu veya otomatik API yeniden sentezi üretmemeli. |
| YD-04 | usefulnext | `assistant-overlay.js: export` tüm snapshot mesajlarını düz Markdown yapar; thread store kaynaklı evidence/citations saklar. Açık seçili mesaj/not+frozen kısa kaynaklar için report.md/manifest.json yolu gerçek küçük delta. Mevcut workspace package yerine yeni tam medya arşivi kurulmamalı; seçim dışı not/profil/path/anahtar dışa çıkmamalı. |
| YD-05 | defer | Thread history/pin, personal media/taste ve flow.humanIntent ayrı otoriteler olarak mevcut. İnsan tarafından benimsenmiş exact eserli decision+alternatives+scope/expiry kaydı yok. R844 canlı intent onarımı bitmiş karar belleği değildir. Önce araştırma/karar nesnesi ve açık yeniden kullanım tasarımı; akşam sınırı genel zevke sessiz taşınmamalı. |

## İlk yararlı takip kümesi

**Birinci küçük küme: M03-01 + K05 — sorunun anı ve o ana dayanan hesap.** Yeni sistem gerektirmeden mevcut `snapshot.time`, subtitleKey, source owner ve playback read sonucunu **insan messageId'sine bağlı, revizyonlu bir soru makbuzunda** birleştir. Önce sabit “bu kısım” vs canlı “şimdi” ayrımı; ardından yalnız o gerçek durumdan bounded kalan süre/hız/ara hesabı. Hesap aracı kendi başına ses/video anlama iddiası taşımaz. Değişen kaynakta yeni okuma, bilinmeyen canlı duration'da açık unknown gerekir. UI gereken dilim görsel taslak olmadan uygulanmamalı.

**İkinci küme: K01 + K04 — tek typed predicate, aynı revizyonda liste+sayım.** Mevcut katalog alanlarıyla sınırla; yıl/runtime/watchStatus/reaction gibi gerçekten sahip olunan alanları envanterle. Ülke/puan anlamı normalize edilmediyse unsupported/unknown döndür. AND/OR güvenlik sınırını ve matched/unknown paydasını aynı saf değerlendirici üretmeli. RRF veya yeni DB bu sorunu çözmek için şart değil.

**Bağımsız düşük model maliyetli işler:** E01 yerel sohbet arşiv araması; K7-01/02 bounded kişisel aday refill+destek birleştirme; N06-02 MRU kapanış hedefi. Bunlar ayrı küçük teslimler olmalı, birini yapmak diğer kartları tamamlamaz. E03/YD-02 aynı ankraj altyapısını paylaşabilir ama alıntılı soru ile itirazın niyetleri ayrı tutulmalı.

MCP resources/prompts/subscriptions, genel workflow graph/compensation, ekran paylaşımı ve indirme restart kurtarması gerçek boşluklardır; somut ihtiyaç ve bağlı sözleşmeleri çözülmeden bu ilk kümeye eklenmemelidir. Hiçbir kartın canlı model, native Windows/site, OS medya tuşu veya restart davranışı bu belgeyle doğrulanmış sayılmaz. Bu çıktı bir kapsam/öncelik incelemesidir; 45 özelliğin geliştirme onayı veya tamamlanma kaydı değildir.
