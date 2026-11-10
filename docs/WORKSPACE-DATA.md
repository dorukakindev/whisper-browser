# Çalışma paketi ve kişisel kütüphane verileri

Bu envanter `workspace-package.js` izin listesi ve gerçek servis sahiplerine bağlıdır. Standart `.wbp`, medya dosyalarının veya tüm profilin disk imajı değildir. Kullanıcı eylemiyle alınır; otomatik yedek yalnız kullanıcının mevcut zamanlama tercihiyle çalışır. Bu geliştirmede kişisel dosya okunmadı/yazılmadı.

| Dosya | Sahibi / sürüm / üst sınır | Sınıf ve paket davranışı |
|---|---|---|
| personal-collection.json | personal-collection, v1, 10.000 kayıt / 16 MB | Kişisel kimlik, puan, durum, ilerleme, kaynak varyantı/alan sürümü/son 40 aktarım makbuzu. Birlikte korunur. |
| recall-network.json | recall-network, v1, 12 MB; 2.000 referans, 6.000 ilişki, 10.000 kanıt | Kişisel referans/gizleme, not, tepki, model hipotezi ve analiz kökeni. Hipotez sayısı sıfır kalabilir; yeni analiz yapılmaz. |
| personal-smart-shelves.json | personal-library-views, v1, 30 raf / 200 KB | Kişisel koşullar, adlar ve tarihler. Sonuçlar yeniden hesaplanır. |
| personal-library-groups.json | personal-library-groups, v1, 60 tanım / 2 MB | Sabit üyelik, kapak referansı, açıklama ve sıra. Eksik kaynak referansı silinmez. |
| personal-pause-notes.json | personal-library-groups, v1, 10.000 not / 2 MB | Puan/durumdan ayrı kişisel gerekçe ve tarih. |
| franchise-tracker.json | franchise-tracker, v1, 1.000 giriş / 8 MB | Takip kararı ve görülen devamlar kişiseldir; kaynak haritası aynı dosyada olduğundan birlikte taşınır. |
| release-calendar.json | release-calendar, v1, 1.000 takvim / 8 MB | Yeniden alınabilir kaynak takvimi; ICS sıra/sürüm sürekliliği için pakete dahil. |
| recommendation-history.json | recommendation-controls, v1, 2.000 kayıt / 2 MB | Gösterim, ayrı geri bildirim ve erteleme. Yedi havuz kimliği ayrı; puan/zevk profili değildir. Paket kapsamına dahil. |
| personal-repeat-sessions.json | personal-repeat-sessions, v1, 5.000 oturum / 4 MB | Ana kaydın ilerleme/tamamlanmasından ayrı tekrar oturumları. Sabit kaynak referansı ve birimler; paket kapsamında. |
| library-workspace.json | library-workspace, v1, 5.000 oturum / 4 MB | Ayrı kitap oturumları ve açıkça kaydedilen yoğunluk/metin/hareket tercihleri. Kayıt ID/yol/format özeti kaynak sahibini sabitler; fiziksel dosya byte hash'i değildir. Dakika elle/bilinmiyor; ana kitap ilerlemesi değişmez. Kimlik/metin yeniden eşlenmeden paket kapsamında. |
| feed-reading.json | feed-reading-workspace, v1, 1000 yer + 1000 kesit / 2 MB | Açık kullanıcı eylemiyle, özgün okuyucu düzenine göreli konum ve birebir metin aralıklı kesit. Kaynak ID/revizyon/hash, eski sürüm uyarısı; okundu/puan/ilerleme değişmez. Kapasitede otomatik kayıt atılmaz. Kimlik/metin yeniden eşleştirmeden `.wbp` kapsamı; eksik/eski kaynak kişisel kesiti silmez. |
| adaptation-links.json | adaptation-links, v1, 1.000 kişisel bağ / 2 MB | Kullanıcının önizleyip onayladığı ayrı origin/ID kaynakları arasında uyarlama/sürüm beyanı. Kaynak kimliği özeti ve revizyonla korunur; kayıt/puan/ilerleme birleşmez. `.wbp` kapsamında, metin/ID yol eşleştirmesine girmez; kaynak değişirse eski bağ stale görünür. Kaynaklı AniList bağları franchise cache'inden salt okunur, bu dosyaya kopyalanmaz. |
| media-daily.json / film-watch.json / media-title-relations.json | mevcut personal-media şemaları, v1, 8/8/16 MB | Günlük, kuyruk, kişisel film sunumu, alternatif dosya ilişkisi ve eski kimlik bağları. Mevcut yerel dosya yeniden yetkilendirme kuralları sürer. |
| media-shelf.json | media-shelf-limits ve mevcut raf okuyucusu | Kitap/podcast/müzik kayıtları, günlük, yorum ve ayrı tür zevk tercihleri; mevcut paket kapsamında. |
| media-catalog.json / watch-library*.json / history.json | mevcut katalog/geçmiş şemaları | Katalog ve tüketim/oynatma geçmişi; mevcut paket kapsamında. |
| feeds.json / browser-notes.json / assistant-artifacts.json / assistant-conversations.json | ilgili mevcut depolar | Abonelik, kaynak konumu, not, çıktı ve sohbetler; mevcut paket kapsamında, kişisel içerik taşır. |
| browser-session.json / browser-subtitle-preferences.json / browser-series-context.json / browser-skip-segments.json | mevcut browser sahipleri | Yerel yedek kapsamında; paylaşılabilir dışa aktarım oturumu hariç tutar. İçe aktarılan dosya grant'i ve oturum altyazı yetkisi otomatik verilmez. |
| media-enrichment.json / media-folder-watches.json / torrent-library.json | mevcut medya servisleri | Mevcut paket kapsamında; klasör takibi/torrent geri yüklemede kapalı/duraklatılmış kalır. |
| catalog-posters, browser-subtitles, workspace-assets, subtitle-edits, OkumaListesi | mevcut dizin izin listesi | İzin verilen dosyalar dahil; linkler takip edilmez, toplam paket sınırı geçerlidir. |
| collection-cover-cache | collection-cover-cache | Yeniden indirilebilir seçili Anime/Manga kapakları; **standart pakette yok**. Katalog afişleri ayrı olarak dahildir. |
| settings.json, hesap oturumları, token/anahtar dosyaları, modeller, venv, harici medya | ilgili sahipler | Standart pakette yok. Seçili video dahil dışa aktarım mevcut ayrı seçenektir. |

## Geri yükleme sözleşmesi

**Podcast saklama ve kuyruk · 20:09:** feeds.json v1 içindeki podcastWorkspace/previous, saved/later/link/editorial ve sourcePins; ayrıca paketli feed-reading.json referansları otomatik kapasite budamasında ve unsubscribe sırasında korunur. 4000 korunan giriş varken yeni kayıt işlemi atomik reddedilir; kişisel veri silinmez. Podcast Depolama ve saklama ekranı 4000 giriş / 16 MB ve %90 uyarısı ile en çok 100 korunan kaynağı gösterir. Yönetilen ses/metin dosya envanteri link izlemez; 2000 tarama / 200 gösterim sınırında kısmi, kişisel orijinal dosyalar yalnız rafın kayıtlı metadata’sıdır. Yeni temizlik veya arşiv motoru yok.

Yerel queue-state.json v1 optional podcastBinding alanı bölüm/sürüm/çıktı rolü/dil/kapsam ve gerektiğinde sınırlı mevcut çeviri kaynak metnini saklar. Generation/mediaKey/downloadToken/eski grant canlı yetki olarak taşınmaz; restored işler detached ve kullanıcı başlatmalı edinim/ön kontrol gerektirir. Bu kuyruk standart `.wbp` kapsamına eklenmedi. Mevcut feeds/reading kişisel metinleri paketli; yeni kişisel dosya oluşturulmadı. [Kanıt ve sınırlar](devir/2026-11-10-2009.md).

Yalnız izinli dosyalar ve bilinen v1 şemaları alınır; yinelenen kişisel kimlik, kapasite aşımı, Windows aygıt adı/yol kaçışı ve bağlantılı hedef reddedilir. Dosya çakışması ve hedef hash'leri önizlenir; onaydan sonra hedef değişmişse yeniden önizleme gerekir. Mevcut dosyalardan pakette olmayanlar silinmez. Yeni yedi kişisel belgenin serbest metni ve kaynak kimliği yol eşleştirmesine sokulmaz. Kaynak puansız 0 ile tarihli açık kişisel 0 farklı anlamlarını korur; tamamlanmış kayıt olumluya dönüştürülmez.

Şifreleme yoktur: paket kişisel not ve sohbet içerebilir. Gizlilik için mevcut dosya/alan izin listesi kullanılır; içerik özeti yalnız sayısal kapsamdadır. Eski paketlerde yeni dosyaların bulunmaması normaldir; hedefte bulunan yeni kişisel dosyalar korunur.

## Kurtarma ve bakım — 2026-11-10 17:41

`.workspace-restore/<id>/journal.json` ve numaralı orijinal dosya kopyaları yalnız yerel kurtarma sahibinindir; paylaşılabilir pakete girmez. Hazırlama günlüğü orijinal kopyalardan önce kaydedilir; kopyalar tamamlanmadan hedefler değiştirilmez. Dosya değişimleri ve günlük atomik rename/fsync kullanır. Yarım işlemde yeni export/restore ve içerik ağının otomatik eşitlemesi engellenir. Yedekleme alanından hash'li önizleme/onay ile dosyalar geri alınabilir; daha yeni düzenleme varsa üzerine yazılmaz. Sonuç restart sahibine gider. Kaynak puanı veya yeni hipotez oluşturulmaz.

Süreç içi hatada rollback denenir; rollback de başarısızsa günlük/kopyalar korunur ve başarısızlık görünür kalır. Disk dosyası günlüğü, renderer localStorage'ı ve sert kesintide çıkarılan video dizinlerini kapsamaz; renderer tercihleri tam işlem öncesi `.wbp` yedeğindedir. Tam uygulama/elektrik kesintisi atomikliği iddiası yok. Kurtarma/önceki tam yedek/bakım kopyalarında otomatik silme yoktur.

Bakım sayımı kişisel/geçmiş/cache/yönetilen modeller/kurtarma/diğer olarak ayrılır. 20.000 giriş ve 8 seviye sınırında kısmi sayım görünür; link takip edilmez. Modeller yalnız uygulamanın yönetilen klasörleri; harici cache'ler kapsam dışı. Seçili temizlik yalnız `personal-candidates.json` için hedef hash'i, ayrı onay ve önce `maintenance-backups/<id>` kopyasıyla çalışır. Kişisel kayıtlar, geçmiş, modeller ve mevcut seçili kapak cache'i bu yeni eylemle silinmez.

Önceki anime/manga dar şeması, aynı koleksiyon dosyasında saklanan kitap/podcast gibi kaynak puanları için genişletildi: gerçekten desteklenen yedi havuz kabul edilir. Yeni öneri geçmişi ve tekrar dosyaları da round-trip ile doğrulandı; eski kişisel puanlar değişmez.


## Kalıcı podcast offline kopyası · 21:21

`podcast-audio/offline` yalnız açık **kalıcı tut** eylemiyle yazılır. 1 GiB / 64 dosya, indirme başına 512 MiB ve muhafazakâr 512 MiB serbest alan rezervi; otomatik eski kayıt silme yok. Sürüm+hash adlı kopyalar her açılışta byte/hash/stat ve güncel sourceVersion ile yeniden doğrulanır. Yarım indirmeler kapasite hesabına katılır, hazır kopya sayılmaz. Başarılı kaynağın mevcut feeds.json sourcePins ve byte kanıtı aynı atomik işlemde korunur; durum/puanlar değişmez, eski konumlar önceki sürümde kalır. Bu metadata `.wbp` içinde; büyük offline ses byte'ları, geçici edinim ve transcript cache gibi **standart paketin dışındadır**. Paket geri yüklemek offline sesin varlığını garanti etmez. Kullanıcının kişisel localSource orijinal dosyaları bu işlemle okunmaz, taşınmaz veya silinmez.

`subtitle-work-status.js` kanal/dosya/kopya ve kaynak işlem makbuzları yalnız oturum belleğindedir; kişisel kalıcı dosya değildir. Mevcut edit/translation recovery ve offsetProfiles kalıcılığı kendi sahiplerinde kalır. İnsan aday seçimi yalnız görüntü/oturum ve ilgili revizyon içindir; kişisel kalıcı eşleşme dosyası oluşturulmaz.


## Kalıcı podcast kopyasında manuel devam · 21:48

`podcast-audio/offline/<sourceVersion>.partial` ve `.partial.resume.json` yönetilen kesinti kalıntılarıdır; kişisel orijinal dosya değildir. Devam metadata'sı en çok 4096 byte okunur; hash'li istek/hedef kimliği, validator, MIME, bilinen toplam, yazılan byte ve prefix SHA-256 taşır. Ham enclosure URL'si/kimlik bilgisi kaydedilmez. Dosya/link/tutar/hash doğrulanmadan Range gönderilmez. Kullanıcı açıkça “Kesilen kopyaya devam et” seçer; destek yoksa baştan, validator/aralık değişmişse eski byte'lara eklemeden açık hata. “Baştan kalıcı tut” aynı sahipteki kesinti parçasını baştan edinir. Başarılı tam kopya mevcut hash/sürüm adı ve feeds.json pin/kanıtına geçer; sidecar kalkar.

Bu yönetilen ses byte'ları ve sidecar standart `.wbp` izin listesine eklenmedi; feeds.json kaynak kanıtı paketli kalır. Offline kota sayımında kesinti dosyaları görünür; mevcut kendi parçanın devamı için iki kez alan ayrılmaz. Periyodik/otomatik temizleme eklenmedi; açık yeni edinimin kendi geçersiz/geçici parçasını temizlemesi diğer kaynağı veya kişisel orijinali kapsamaz. Sert kapanışta metadata tamamlanmamışsa güvenli devam garantisi yoktur; yeni açık deneme baştan başlar. Retry-After bekçisi süreç içidir; yeniden başlatmaya kalıcı taşınmaz.


## Son oynatma gözlemi · 2026-11-10 22:37

Mevcut feeds.json podcast entry ve media-shelf.json episode alanında optional `lastListenedAt` sayısal server tarihi bulunabilir. Native playing gözleminden ve exact sourceVersion doğrulamasından gelir; konumun ilerlemesi, yayın/aktarım tarihi, read, listened veya rating yerine geçmez. Eski kayda tarih göçü/varsayım yok. Feed gözlemi kişisel saklama gerekçesidir ve refresh/unsubscribe/kapasite budamasında korunur; mevcut 4000/16 MB sınırları dolarsa veri silmek yerine mevcut koruma politikası geçerlidir. Bu iki belge zaten standart .wbp kapsamında; yeni dosya veya canlı yetki eklenmedi. Raf envanterinde aynı enclosure'ın gerçek sayısal gözlemlerinden en yenisi gösterilir; bilinmeyen tarih bilinmiyor kalır.
