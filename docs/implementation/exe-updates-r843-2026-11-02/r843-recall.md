# R843-01–06 Recall düzeltme devri — 2026-11-02

Çalışma: D:\Whisper Local\tmp\assistant618, codex/exe-updates-feeds; başlangıç08e9e851. Commit/push yok. Asıl R843/araştırma ve review843 kanıt klasörü yerel kaldı; kopyalanmadı/değiştirilmedi. Problardaki bozuk davranış ASSERT'leri başarı sayılmadı; yeni testler doğru kontratı doğruluyor.

## Uygulanan düzeltmeler

- R843-01: recall-service katalog çözümü mevcut media-tools-model.decisionIdentityMatch denetimini yeniden kullanır. Mismatch feedback beğeni/notu yeni esere katılmaz; eşleşen feedback ve mevcut kimliksiz eski kayıt uyumluluğu sahip servisin kuralıyla korunur.
- R843-02: kaynak sahiplerini birleştiren listede filtre öncesi2500 kesmesi kaldırıldı. catalog IPC server query/domain/kind filtrelerinden sonra offset/limit sayfası döndürür: rows,total,offset,limit,nextOffset. Varsayılan80, üst sınır100. İçerik ekle penceresi artık her aramayı180ms debounce ile sunucuya yollar; sonraki sayfa düğmesi ve sayfalar boyunca seçili referanslar korunur. Eski available()500 yöntemi uyumluluk için kaldı; ürün arama/pagination yolu availablePage kullanır. Tam metin IPC katalog satırlarından çıkarılır.
- R843-03: hipotez güncelliği hem support hem counter receipt durumunu kontrol eder. Yalnız support kaynakları explicitlike olmak zorunda; tüm seçili kaynakların tepki sürümü değişmezliği ayrıca korunur. Dislike/mixed karşı örnek artık kendi başına hipotezi stale yapmaz.
- R843-04: yeni receipt kimliği node/content revision/reaction revision/scope ve MUTLAK UTF-16 başlangıç/bitiş+alıntıyı içerir. Aynı notun yeni tepki sürümü, content vs user_reaction ve aynı alıntının iki ayrı pasajı çakışmaz. Yeni receipt'lerde reactionRevision kaydedilir ve güncelliğe katılır. Eski disk receipt kimlikleri yeniden yazılmaz; yanlış eski konumu varsayımla onarma yok, yeni analiz doğru ayrı receipt üretir.
- R843-05: derived purge kaldırılan kavram uçlarının alias bağlarını açar. Materialize yalnız mevcut kavram hedefine alias takip eder; önceden diskte kalmış dangling alias da bağımsız yaşayan kavramı/ilişkiyi gizlemez. Diğer kaynağın kanıtı silinmez.
- R843-06: Tüm seçili kaynaklar yalnız focusId'yi kaldırır ve ortak reload üzerinden domain/query/likedOnly/dateKind/from/depth filtrelerini korur. Kontrol ile graph kapsamı çelişmez.

## Kesin değişen dosyalar

- src/recall-service.js — feedback kimliği, kaynak erken kesmesi, sayfalı catalog IPC.
- src/recall-network.js — availablePage, role-aware freshness, receipt identity/absolute locator, alias lifecycle.
- src/renderer/recall-network-ui.js — sunucu arama/sayfalama, yarış kontrolü, tüm-graph filtre koruması.
- tests/r843-recall.test.js — altı doğru-kontrat regresyonu; sentetik owner/store ve JSDOM.

## Kısa doğrulama

`node --test --test-isolation=none tests/r843-recall.test.js`:6 passed,0 failed,1.32s. Gerçek Recall service/store ile mismatch ve matching feedback;2601 film+geç RSS arama ve sayfa devamı; counter güncelliği/sonradan değişiklik; tepki/scope/mutlak range receipt ayrımı; alias purge; gerçek DOM serverquery/more ve domain/like/date allgraph filtreleri.

Ardından eski diskten kalmış dangling alias için materialize koruması eklendi ve yalnız ilgili regresyon tekrarlandı: `node --test --test-isolation=none --test-name-pattern=R843-05 tests/r843-recall.test.js`:1 passed,0 failed,83ms. Yeni arama başlamasıyla daha-fazla düğmesi de hemen disable edilir; bu son dar yarış koruması için ek test turu yapılmadı.

Üç ürün dosyası için ilk düzeltme sonrası node --check başarılıydı; son alias/UI dar koruması sonrası bu iki dosyanın node --check kontrolü de başarılı. Tam paket, gerçek Windows native, canlı API/LLM veya kişisel profil testi yapılmadı. Yeni bağımlılık/model/şema sürümü yok. Kaynak evreni mevcut sahip dosyalarıdır; yeni capture adaptörü, semantik recommender veya fullcapture özelliği eklenmedi. Katalog offset sayfaları canlı veri üstündedir; sayfalar arasında sahip listesi değişirse atomik snapshot garantisi iddiası yok.
