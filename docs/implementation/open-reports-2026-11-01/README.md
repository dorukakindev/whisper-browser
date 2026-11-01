# Araştırma kartları — uygulama durumu

R838:18 + R839:30 + R841:73 + R842:60 + RSS:26 = **207 tekil kart**. Kaynak NEW/OLD-DEEPENING etiketi teslim durumu olarak kullanılmadı. Ayrıntılı koşullar, mevcut kod ankrajı ve pinned upstream kaynak/lisansı [research-cards.json](research-cards.json) içinde her kart için saklanır.

Bu yaşayan envanterde **uygulanacak**, tamamlandı demek değildir. Ortak teslim altına alınan kartın özgül kabulü silinmez. RSS ana program bağlantısı ve Windows geniş/dar kabulü bu teslimde tamamlandı; A842 retrieval helper/kitap/katalog slice’ı tüm çok-kaynaklı araştırma deneyimi sayılmaz.

Güncel sınıflandırma: uygulanacak: **118**, başka kartla birleşiyor: **70**, somut engeli var: **1**, zaten mevcut veya tamamlanmış: **18**. Kısmi uygulama, tamamlanmış kart sayılmaz.

## Bu slice

A842-04/05: katalog title/originalTitle’dan sınırlı alias sorguları ve rank tabanlı birleştirme; A06: gerçek kitap taramasında >%50 çocuk isabetinde sınırlı parent metin; A08: source/revision/page düzeni. Scope/revision/spoiler önfiltre helper’ı mevcut. 7 retrieval testi ve5 RSS asistan testi geçti. Seçili RSS kaynaklarında event→kapsam/özet önizlemesi→taslak→search_sources→doğrulanmış F atfı uygulanır; model çağrısı kendiliğinden yapılmaz. Katalogla ilişkili çok-film kaynak corpus/UI ve semantik kanal kalan iştir. Yeni LLM/embedding/framework bağımlılığı yok.

## Bütün kartlar

| ID | Kart | Sınıf | Mevcut durum / takip |
|---|---|---|---|
| R838-Ö01 | SSE ayrıştırıcısını küçük, olgun bir parçayla değiştirme adayı | uygulanacak | Aynı mantıksal yanıt için bütün byte sınırları/CR-LF fixture pilotunu tamamla; yeni parser bağımlılığı zorunlu değil. |
| R838-Ö02 | Paylaşılan, sürümlü veri sözleşmeleri için Ajv standalone | uygulanacak | Paylaşılan sürümlü schema ve eski sürüm göçü; build-time CSP uyumlu validator üretimi. |
| R838-Ö03 | Bir karmaşık akışta XState geçiş tablosu pilotu | başka kartla birleşiyor | → R838-Ö04 |
| R838-Ö04 | LangGraph'tan kaynak ve yan etki bağlı checkpoint deseni | uygulanacak | Kalıcı kaynak/revizyon checkpoint; operation adoption; completed/delivered ayrımı ve yeniden teslim; önceki başarılı ücretli adımları yeniden yürütmeden restart sınırı. |
| R838-Ö05 | Subtitle Edit'ten seçilebilir kalite kuralları ve değişiklik önizlemesi | uygulanacak | Karttaki kural/önizleme/undo veya hizalama adaptörünü ayrı incele; kaynak zaman ve timingLocked korumalarını taşı. |
| R838-Ö06 | Türkçe bozuk karakterleri dil bağlı ve geri alınabilir onarma | uygulanacak | Karttaki kural/önizleme/undo veya hizalama adaptörünü ayrı incele; kaynak zaman ve timingLocked korumalarını taşı. |
| R838-Ö07 | pysubs2 ile isteğe bağlı stil/format dönüşüm adaptörü | somut engeli var | Review pinned1.8.0 source/license and run style roundtrip under supported Python; do not upgrade project Python solely for this adapter. |
| R838-Ö08 | Var olan ffsubsync'e teşhisli gelişmiş hizalama modu | uygulanacak | Karttaki kural/önizleme/undo veya hizalama adaptörünü ayrı incele; kaynak zaman ve timingLocked korumalarını taşı. |
| R838-Ö09 | Dalga biçiminde hassas cue sınırı düzenleme | uygulanacak | Karttaki kural/önizleme/undo veya hizalama adaptörünü ayrı incele; kaynak zaman ve timingLocked korumalarını taşı. |
| R838-Ö10 | OpenTimelineIO'dan açık zaman tabanı sözleşmesi | uygulanacak | Her kartın çıktı davranışını gerçek FFmpeg ve sentetik medya fixture ile uygula; native HDR/listening kabulü ayrı. |
| R838-Ö11 | Dublaj projesini editöre taşımak için OTIO dışa aktarımı | uygulanacak | Her kartın çıktı davranışını gerçek FFmpeg ve sentetik medya fixture ile uygula; native HDR/listening kabulü ayrı. |
| R838-Ö12 | Son birleşik sese ölçüm ve iki geçişli loudness kontrolü | uygulanacak | Her kartın çıktı davranışını gerçek FFmpeg ve sentetik medya fixture ile uygula; native HDR/listening kabulü ayrı. |
| R838-Ö13 | Ayrı ses katmanları, son zamanlı altyazı ve teslim fişi | uygulanacak | Her kartın çıktı davranışını gerçek FFmpeg ve sentetik medya fixture ile uygula; native HDR/listening kabulü ayrı. |
| R838-Ö14 | HDR kaynağı için açık koruma veya SDR dönüşüm seçimi | uygulanacak | Her kartın çıktı davranışını gerçek FFmpeg ve sentetik medya fixture ile uygula; native HDR/listening kabulü ayrı. |
| R838-Ö15 | Jellyfin'deki sağlayıcı kimliği ayrımından bağımsız film kimlik modeli | başka kartla birleşiyor | → A842-04 |
| R838-Ö16 | Film varlığı ile yeniden izleme olayını ayıran tercih kanıtı | başka kartla birleşiyor | → L842-15 |
| R838-Ö17 | Defuddle güncellemesini kaynak sadakati fixture'larıyla değerlendirme | uygulanacak | Tablo/kod/TR/uzun makale extraction corpus; ölçümden sonra seçici Readability fallback veya kontrollü Defuddle güncellemesi. |
| R838-Ö18 | Readability'yi önce test karşılaştırıcısı, sonra gerekirse seçici fallback yapma | uygulanacak | Tablo/kod/TR/uzun makale extraction corpus; ölçümden sonra seçici Readability fallback veya kontrollü Defuddle güncellemesi. |
| R839-A01 | Konuşmaya açıkça seçilen çoklu kaynaklar | uygulanacak | Seçili kaynakların açık attach/remove ve revizyonlu manifesti; otomatik tüm sekme taraması yok. |
| R839-A02 | “Bul → öner → uygula → sonucu doğrula” browser eylemleri | uygulanacak | Read-only pilot; şemalı extraction, hedef generation ve doğrulanmış eylem makbuzu; keyfi JS/shell yetkisi ekleme. |
| R839-A03 | Aynı işi tekrarlayan asistana etki temelli döngü koruması | uygulanacak | Kaynak+tool+args+sonuç imzasıyla etkisiz read tekrarı bütçesi; daralan sorguyu yanlış engelleme. |
| R839-A04 | Uzun konuşmada özetten ayrı, kodla tutulan eylem defteri | başka kartla birleşiyor | → R838-Ö04 |
| R839-A05 | Araştırmayı sohbet metninden kalıcı bir medya dosyasına dönüştürme | başka kartla birleşiyor | → A841-20 |
| R839-A06 | Hızlı yanıt / normal inceleme / derin araştırma seçimi | başka kartla birleşiyor | → A842-01 |
| R839-A07 | Başarılı bir okuma görevini yeniden kullanılabilir iş akışına kaydetme | başka kartla birleşiyor | → R838-Ö04 |
| R839-A08 | Repliği hatırlamadan sahneyi tarif ederek arama | uygulanacak | Mevcut Whisper/kare/PDF metni yeniden kullanarak opt-in ölçülen model/adapter seç; gerçek TR kalite ve model lisansı; tüm kişisel arşivi sessiz indeksleme yok. |
| R839-A09 | İzlenen noktaya kadar gerçekten sınırlandırılan spoiler güvenli yardım | uygulanacak | Bütün kaynak türlerinde spoiler sınırı; şemalı blok/span alıntısı, örnek büyüklüğü/görüş ayrışması ve kaynak revizyonu UI; uydurma ID link olmaz. |
| R839-A10 | İsteğe bağlı görüntü bağlamı ve sonuç denetimi | başka kartla birleşiyor | → A842-13 |
| R839-F01 | Doğal dilde aramayı düzenlenebilir filtrelere çevirme | uygulanacak | Doğrulanmış kimlikli partial fanout; provider capability filtreleri, izleme ülke/tazelik ve metadata kapsamını görünür kıl; filmografi boşlukları. |
| R839-F02 | “Bunlara benzesin ama daha az ağır olsun” devamlı keşfi | uygulanacak | Geçici niyet/feedback nedeni ve TTL, kaynaklı deterministik snapshot; undo aynı tura dönsün; geçici tercih kalıcı zevki bozmasın. |
| R839-F03 | Letterboxd izlenecekler listesini kişisel zevke göre sıralama | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| R839-F04 | Sıralama önceliklerini kullanıcı seçsin | uygulanacak | Geçici niyet/feedback nedeni ve TTL, kaynaklı deterministik snapshot; undo aynı tura dönsün; geçici tercih kalıcı zevki bozmasın. |
| R839-F05 | “Neden bana önerildi?” açıklamasını gerçek destekleyen filmlerle verme | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| R839-F06 | Aynı seri ve aynı popüler filmlerle dolmayan sonuç çeşitliliği | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| R839-F07 | İki kişinin ortak film seçimi | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| R839-F08 | Yorum analizinde görüş kümesi → alıntı → orijinal yorum zinciri | uygulanacak | Bütün kaynak türlerinde spoiler sınırı; şemalı blok/span alıntısı, örnek büyüklüğü/görüş ayrışması ve kaynak revizyonu UI; uydurma ID link olmaz. |
| R839-F09 | Keşfet raflarını filtreleriyle kaydetme ve yeniden sıralama | uygulanacak | Seri/sonraki oynanabilir bölüm, kaynaklı koleksiyon snapshot/order/policy, kapsamlı kişisel öneri ve opt-in takvim. |
| R839-F10 | “Bunu istemiyorum” geri bildirimini nedenine göre kullanma | uygulanacak | Geçici niyet/feedback nedeni ve TTL, kaynaklı deterministik snapshot; undo aynı tura dönsün; geçici tercih kalıcı zevki bozmasın. |
| R839-F11 | Az puanlı yeni profilde aşırı kesinleşmeyen öneri | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| R839-F12 | Kişisel yorumdan çıkarılan tercihi kullanıcı tarafından yönetilen belleğe dönüştürme | başka kartla birleşiyor | → A841-04 |
| R839-D01 | Yazı alanı, kaynak tepsisi ve eylem alanını tek düzen içinde toplama | uygulanacak | İlgili kartın dar/native/DPI/klavye kabulü; aynı kimlikli film kartı ve veri bilinmiyor durumları; üst medya menüsü tasarımını koru. |
| R839-D02 | “Yanıt / kaynaklar / yapılanlar / çıktı” arasında net ayrım | uygulanacak | Artifact ID/revision/source manifest, hazır/kayıp/temizleme yaşam döngüsü; dosya/diff önizlemesi; konuşma sonrası tool sonucu erişimi. |
| R839-D03 | Konuşmanın içinde gerçek film kartları | uygulanacak | İlgili kartın dar/native/DPI/klavye kabulü; aynı kimlikli film kartı ve veri bilinmiyor durumları; üst medya menüsü tasarımını koru. |
| R839-D04 | İki veya üç film için karar odaklı karşılaştırma | uygulanacak | İlgili kartın dar/native/DPI/klavye kabulü; aynı kimlikli film kartı ve veri bilinmiyor durumları; üst medya menüsü tasarımını koru. |
| R839-D05 | Film ayrıntısında bir ana eylem ve sakin ikincil eylemler | zaten mevcut veya tamamlanmış | Kartın mevcut in-session kapsamı var; daha geniş yeniden başlatma/corpus/native kabulü ayrı kartlarda takip edilir. |
| R839-D06 | Ana sayfayı “devam et → sana uygun → keşfet” akışına göre düzenleme | uygulanacak | İlgili kartın dar/native/DPI/klavye kabulü; aynı kimlikli film kartı ve veri bilinmiyor durumları; üst medya menüsü tasarımını koru. |
| R839-D07 | Filtreler ve sonuç kartlarında iki ayrı yoğunluk seviyesi | uygulanacak | İlgili kartın dar/native/DPI/klavye kabulü; aynı kimlikli film kartı ve veri bilinmiyor durumları; üst medya menüsü tasarımını koru. |
| R839-D08 | Oynatıcıda bağlamsal yardım, tam ekran form yığını yerine küçük panel | uygulanacak | İlgili kartın dar/native/DPI/klavye kabulü; aynı kimlikli film kartı ve veri bilinmiyor durumları; üst medya menüsü tasarımını koru. |
| A841-01 | Sürümlü görev talimatları: taslak ile etkin profili ayır | uygulanacak | Taslak/etkin görev profili, düzenlenebilir komutlar ve sohbet dalına görünür model/talimat revizyonu. |
| A841-02 | Kullanıcının düzenlediği hızlı komut kitaplığı | başka kartla birleşiyor | → A841-01 |
| A841-03 | Sohbete bağlı çalışma klasörü ve çıktı hedefi | başka kartla birleşiyor | → A841-20 |
| A841-04 | Açıkça kaydedilen ve düzenlenebilen asistan belleği | uygulanacak | Opt-in kapsamlı bellek, kaynak ve global tercih ayrımı; kapatma ve düzeltme/silme makbuzu; atomik revizyonlu onarım. |
| A841-05 | Belleğin kaynak/proje ve genel kapsamını açık ayır | başka kartla birleşiyor | → A841-04 |
| A841-06 | Belleği kullanmayı durdurma ve değişiklik makbuzu | başka kartla birleşiyor | → A841-04 |
| A841-07 | Araç şemalarını ihtiyaç halinde keşfetme | uygulanacak | Önce gerçek token ve görev başarısı ölçümü; deferred şema pilotu, açık model yetenekleri ve unsupported attachment dönüşümü; yerel model discovery opt-in. |
| A841-08 | Araç seçiminde ölçülen yerel reranker pilotu | başka kartla birleşiyor | → A841-07 |
| A841-09 | Büyük araç çıktısına konuşma boyunca dayanıklı erişim | uygulanacak | Artifact ID/revision/source manifest, hazır/kayıp/temizleme yaşam döngüsü; dosya/diff önizlemesi; konuşma sonrası tool sonucu erişimi. |
| A841-10 | Gönderilmeden önce görünür bağlam bütçesi | başka kartla birleşiyor | → A841-07 |
| A841-11 | Sağlayıcı yetenek ve taşıma modu profili | uygulanacak | Önce gerçek token ve görev başarısı ölçümü; deferred şema pilotu, açık model yetenekleri ve unsupported attachment dönüşümü; yerel model discovery opt-in. |
| A841-12 | Model değişince desteklenmeyen ekleri açıkça dönüştür | başka kartla birleşiyor | → A841-11 |
| A841-13 | İsteğe bağlı yerel asistan model keşfi | başka kartla birleşiyor | → A841-11 |
| A841-14 | Sohbet dalına model ayarı anlık görüntüsü | başka kartla birleşiyor | → A841-01 |
| A841-15 | Arka plan işinde değişmez çağrı sahipliği | zaten mevcut veya tamamlanmış | Kartın mevcut in-session kapsamı var; daha geniş yeniden başlatma/corpus/native kabulü ayrı kartlarda takip edilir. |
| A841-16 | Başlamış medya operasyonunu asistan işine devralma | uygulanacak | Kalıcı kaynak/revizyon checkpoint; operation adoption; completed/delivered ayrımı ve yeniden teslim; önceki başarılı ücretli adımları yeniden yürütmeden restart sınırı. |
| A841-17 | İş bitti ile sonuç asistana teslim edildi durumunu ayır | uygulanacak | Kalıcı kaynak/revizyon checkpoint; operation adoption; completed/delivered ayrımı ve yeniden teslim; önceki başarılı ücretli adımları yeniden yürütmeden restart sınırı. |
| A841-18 | Yalnız başarısız aşamadan devam; restart ayrı eylem | zaten mevcut veya tamamlanmış | Kartın mevcut in-session kapsamı var; daha geniş yeniden başlatma/corpus/native kabulü ayrı kartlarda takip edilir. |
| A841-19 | Gecikmiş sonuç için ilk çağrının denetimlerini yeniden kur | zaten mevcut veya tamamlanmış | Kartın mevcut in-session kapsamı var; daha geniş yeniden başlatma/corpus/native kabulü ayrı kartlarda takip edilir. |
| A841-20 | Yanıt çıktısının sohbetten ayrı sürüm geçmişi | uygulanacak | Artifact ID/revision/source manifest, hazır/kayıp/temizleme yaşam döngüsü; dosya/diff önizlemesi; konuşma sonrası tool sonucu erişimi. |
| A841-21 | Asistan düzeltmesinde dosya ve diff önizlemesi | başka kartla birleşiyor | → A841-20 |
| A841-22 | Artifact yaşam döngüsü: taslak, hazır, kayıp ve temizleme | başka kartla birleşiyor | → A841-20 |
| A841-23 | Kullanıcı geri bildirimini tekrar oynatılabilir görev değerlendirmesine bağla | uygulanacak | Task/tool/source revizyonlu değerlendirme kaydı ve tekrar oynatılabilir kontrollü fixture. |
| A841-24 | Kapsam kontrolünü sıralamadan önce yapan retrieval | başka kartla birleşiyor | Strict pre-ranking item/source/revision/end-time filter implemented/tested; integration into all retrieval producers still pending. |
| A841-25 | Bellek düzeltmesinde tek sahipli ve sınırlandırılmış onarım | başka kartla birleşiyor | → A841-04 |
| D841-01 | Tek sorguda kütüphane ve dış katalog | uygulanacak | Doğrulanmış kimlikli partial fanout; provider capability filtreleri, izleme ülke/tazelik ve metadata kapsamını görünür kıl; filmografi boşlukları. |
| D841-02 | Arama filtresinde sağlayıcının gerçekten desteklediği seçenekler | başka kartla birleşiyor | → R839-F01 |
| D841-03 | İzleme ülkesi ve uygunluk bilgisinin tarihi | uygulanacak | Doğrulanmış kimlikli partial fanout; provider capability filtreleri, izleme ülke/tazelik ve metadata kapsamını görünür kıl; filmografi boşlukları. |
| D841-04 | Seriyi tamamlama ve doğru sırada izleme | uygulanacak | Seri/sonraki oynanabilir bölüm, kaynaklı koleksiyon snapshot/order/policy, kapsamlı kişisel öneri ve opt-in takvim. |
| D841-05 | Bütün profil yerine seçilen koleksiyonun ruhundan öneri | başka kartla birleşiyor | → R839-F09 |
| D841-06 | Yalnız takip ettiğim yapımların yayın takvimi | uygulanacak | Seri/sonraki oynanabilir bölüm, kaynaklı koleksiyon snapshot/order/policy, kapsamlı kişisel öneri ve opt-in takvim. |
| D841-07 | Kişi filmografisinde izleme boşlukları ve ortak ekip | uygulanacak | Doğrulanmış kimlikli partial fanout; provider capability filtreleri, izleme ülke/tazelik ve metadata kapsamını görünür kıl; filmografi boşlukları. |
| D841-08 | Editoryal listeyi kaynağı ve güncelliğiyle izleme | başka kartla birleşiyor | → L842-17 |
| D841-09 | Çevrimdışı da açılan son Keşfet oturumu | uygulanacak | Geçici niyet/feedback nedeni ve TTL, kaynaklı deterministik snapshot; undo aynı tura dönsün; geçici tercih kalıcı zevki bozmasın. |
| D841-10 | Kartı görmek, geçmek ve beğenmemek farklı olaylar olsun | başka kartla birleşiyor | → R839-F10 |
| D841-11 | Öneri turunu sabitle, kararı geri alınca aynı yere dön | başka kartla birleşiyor | → D841-09 |
| D841-12 | “Bu akşam” tercihi kalıcı zevk profilini değiştirmesin | başka kartla birleşiyor | → R839-F02 |
| D841-13 | “Bu tercihi çıkarırsam neden sıra değişir?” | başka kartla birleşiyor | → R839-F05 |
| D841-14 | Yeni kullanıcıya rastgele altı soru yerine ayırt edici ikili film seçimi | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| D841-15 | Öneri motorunu geleceği sızdırmadan kişisel geçmişle ölç | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| D841-16 | “Çeşitli görünüyor” yerine popülerlik ve katalog kapsama denetimi | başka kartla birleşiyor | → R839-F06 |
| D841-17 | Eski zevk ile yeni zevk arasındaki değişimi isteğe bağlı göster | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| D841-18 | Yeni eklenen filmler için modeli baştan kurmadan kimlik/özellik güncelleme | uygulanacak | Bileşen katkısı + ölçülen offline baseline; cold-start/coverage/diversity ve profil ayrımı; model benchmark geçmeden ürün varsayılanı yapma. |
| D841-19 | Neden dün başka önerildiğini yeniden üretebilme | başka kartla birleşiyor | → D841-09 |
| D841-20 | Davranışı olmayan yeni filmi metadata ile puanlama | başka kartla birleşiyor | → R839-F11 |
| D841-21 | Yorumdan spoiler sızmayan kanıt paketi | başka kartla birleşiyor | → R839-F08 |
| D841-22 | Az yorumun “izleyici ortak fikri” diye sunulmasını önleyen ayrışma görünümü | başka kartla birleşiyor | → R839-F08 |
| D841-23 | Letterboxd'a geri taşınabilir izleme günlüğü | uygulanacak | Movary MIT exporter davranışı Node CSV portu; 0–10/0.5–5 puan dönüşümü, rewatch, tarih ve TR UTF-8. |
| D841-24 | Eksik metadata'nın kişisel öneriyi ne kadar sınırladığını gör | uygulanacak | Doğrulanmış kimlikli partial fanout; provider capability filtreleri, izleme ülke/tazelik ve metadata kapsamını görünür kıl; filmografi boşlukları. |
| A842-01 | “Bu filmin tarihsel arka planını araştır” sorusunu görünür alt sorulara ayır | uygulanacak | Ortak plan ve kaynak/sayfa/derinlik bütçesi; açık sorularla ilerle, host backoff ve iptal; ücretli çağrı artışı otomatik değil. |
| A842-02 | “İki videonun iddiası neden çelişiyor?” araştırmasında yalnız açık kalan soruyu takip et | başka kartla birleşiyor | → A842-01 |
| A842-03 | Film araştırmasında her bulguyu onu söyleyen URL ile birlikte tut | uygulanacak | Bütün kaynak türlerinde spoiler sınırı; şemalı blok/span alıntısı, örnek büyüklüğü/görüş ayrışması ve kaynak revizyonu UI; uydurma ID link olmaz. |
| A842-04 | Türkçe/orijinal ad ve çeviri terimleriyle aynı film kaynağını bul | uygulanacak | Catalog aliases + local RRF implemented/tested; selected linked-source corpus integration and visible grouped sources still pending. RSS selected corpus now also has lexical query/parent/groups tool; catalog-linked alias guard is a separate next step. |
| A842-05 | Hatırladığım ifade ile anlattığım temayı aynı kaynak aramasında birleştir | başka kartla birleşiyor | RRF algorithm implemented/tested; no semantic channel or claimed thematic quality; common source corpus still pending. |
| A842-06 | Röportajdan tek cümle yerine gerektiğinde ilgili bölümün tamamını getir | uygulanacak | Actual bounded reader search produces whole parent page/chapter only for >50% matched children within 3600/3000-char cap. Multi-document section index still pending. |
| A842-07 | “Burada kimden söz ediyor?” sorusunda komşu replikleri zaman sınırıyla getir | başka kartla birleşiyor | → B841-19 |
| A842-08 | İki filmi karşılaştırırken alıntıları film→kaynak→zaman sırasıyla düzenle | başka kartla birleşiyor | Source/revision/page grouping helper and actual book tool groups implemented/tested; multi-film evidence UI still pending. |
| A842-09 | “Kütüphanemdeki göç ve aidiyet temasını hangi kaynaklar bağlıyor?” diye sor | uygulanacak | Seçili küçük corpus ile kaynaklı graph pilot; çıkarım ile doğrudan alıntıyı ayır; kaynak silmede yalnız desteklenmeyen ilişkileri geri çek. |
| A842-10 | Bir sahneye yakıştırılan etkiyi ilişki zinciri ve dayanak pasajıyla incele | başka kartla birleşiyor | → A842-09 |
| A842-11 | Yanlış röportajı kaldırınca ona dayanan film bilgisini de geri çek | başka kartla birleşiyor | → A842-09 |
| A842-12 | Yanıt ürettirmeden “bu film hakkında elinde hangi kanıt var?” diye bak | başka kartla birleşiyor | → A842-09 |
| A842-13 | Repliği olmayan sahneyi görüntü ve konuşmayı bir arada kullanarak bul | uygulanacak | Mevcut Whisper/kare/PDF metni yeniden kullanarak opt-in ölçülen model/adapter seç; gerçek TR kalite ve model lisansı; tüm kişisel arşivi sessiz indeksleme yok. |
| A842-14 | Sahne taramasının atladığı açılış/kapanış konuşmasını araştırmada kaybetme | başka kartla birleşiyor | → A842-13 |
| A842-15 | Basın dosyasındaki fotoğrafı başlığı ve çevresindeki açıklamayla araştır | başka kartla birleşiyor | → A842-13 |
| A842-16 | Elimdeki afiş/kareyle ilgili kayıtlı eleştirileri bul | başka kartla birleşiyor | → A842-13 |
| A842-17 | Filmin ilk gösterim dönemindeki kaynakları bugünkü güncellenmiş yazılardan ayır | uygulanacak | Kaynak tarihi ile olay tarihini ayrı sakla; belirsizliği göster; TR relative-date kalite kabulü, tek tarih varsayma. |
| A842-18 | “Yapım aşamalarını sırayla anlat” cevabında yazı tarihi ile anlattığı olayı ayır | başka kartla birleşiyor | → A842-17 |
| A842-19 | Eski röportajdaki “geçen yıl” ifadesini bugüne göre yorumlama | başka kartla birleşiyor | → A842-17 |
| A842-20 | “Geçen sonbahar gördüğüm film yazısı” sorgusunda tarih yorumunu göster | başka kartla birleşiyor | → A842-17 |
| A842-21 | “Yalnız şu üç filmin eklediğim kaynaklarını kullan” sınırını bütün arama dallarında koru | başka kartla birleşiyor | Prefilter helper implemented/tested; unified selected-three-film source UI/store still pending. |
| A842-22 | “Bu iddia hangi kaynaktan?” sorusunda uydurma alıntı numarasını tıklanabilir yapma | başka kartla birleşiyor | → A842-03 |
| B842-01 | Açık sayfadan tekrar giriş istemeden gerçek okuma kaydı | başka kartla birleşiyor | → B841-11 |
| B842-02 | Haricî Edge/Chrome’dan medya kütüphanesine tek seferlik gönderim | uygulanacak | Küçük companion/receiver protokolü; kaynak URL + onaylı yerel dosya + katalog ID taslağı; otomatik izleme/taşıma yok. |
| B842-03 | Web PDF’sini sayfa metni sanmadan dosya ve okunabilir belge olarak alma | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B842-04 | Tamamlanan indirmeyi kaynağıyla kütüphane taslağına devretme | uygulanacak | Küçük companion/receiver protokolü; kaynak URL + onaylı yerel dosya + katalog ID taslağı; otomatik izleme/taşıma yok. |
| B842-05 | Bir sayfa listesini eklemeden önce gerçek örnekleri gösterme | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B842-06 | Büyük kütüphane ithalini kaldığı öğeden devam ettirme | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B842-07 | Omnivore ve Pocket arşivlerini tarih/etiket/okundu bilgisiyle alma | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B842-08 | Film araştırma dosyasını bölüm bölüm EPUB antolojisi yapma | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B842-09 | Okumaya kalan süreyi medya seçimine katma | uygulanacak | Dil ve kişisel hızla açıklanan süre tahmini; cursor ile en ileri nokta ayrımı B842-16 ile birlikte. |
| B842-10 | Kaynak yenilenirken kullanıcının düzelttiği medya bilgisini koruma | başka kartla birleşiyor | → L842-07 |
| B842-11 | Tekrarlanan sayfa görevini DOM uygunsa model çağırmadan yürütme | uygulanacak | Read-only pilot; şemalı extraction, hedef generation ve doğrulanmış eylem makbuzu; keyfi JS/shell yetkisi ekleme. |
| B842-12 | Sayfadan serbest özet yerine denetlenebilir medya kayıt şeması | uygulanacak | Read-only pilot; şemalı extraction, hedef generation ve doğrulanmış eylem makbuzu; keyfi JS/shell yetkisi ekleme. |
| B842-13 | Sonsuz kaydırmada yalnız istenen bölümü sınırlı açma | uygulanacak | Read-only pilot; şemalı extraction, hedef generation ve doğrulanmış eylem makbuzu; keyfi JS/shell yetkisi ekleme. |
| B842-14 | Açık oturumu kullanırken taşınabilir araştırma paketini ayrı tutma | başka kartla birleşiyor | → B841-11 |
| B842-15 | Uzun browser adımına yeniden bağlanıp aynı işi ikinci kez başlatmama | başka kartla birleşiyor | → A841-16 |
| B842-16 | Son kaldığı yer ile en ileri okunan noktayı ayırma | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B842-17 | JSON dönen kaynakları boş web sayfası yerine yapılı kaynak öğesi alma | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B842-18 | Tek film kaydındaki web çıktılarında tutarlı dosya ve önizleme sırası | başka kartla birleşiyor | → B841-10 |
| L842-01 | Aynı eserin kesim ve dosya sürümlerini tek kayıtta seçme | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-02 | Fragman, sahne arkası ve bonus videolarını esere bağlı raf yapma | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-03 | CD1/CD2 gibi bölünmüş filmi tek oynatma eseri olarak yönetme | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-04 | Bölüm kimliğinden ayrı izleme sırası ve özel bölüm yerleşimi | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-05 | Dizide kaldığım yerden sonraki gerçekten oynatılabilir bölüm | başka kartla birleşiyor | → D841-04 |
| L842-06 | Kodi/Jellyfin NFO yan dosyasından çevrimdışı katalog zenginleştirme | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-07 | Elle düzeltilen metadata alanını kalıcı kilitleme | uygulanacak | Alan sahipliği ve kilitleri kalıcılaştır; provider refreshte koru; çoklu seçili metadata diff/undo receipt. |
| L842-08 | Seçilen kütüphane klasörü için artımlı değişiklik gelen kutusu | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-09 | Kütüphane seçiminde gerçek dosyanın ses ve görüntü özellikleri | başka kartla birleşiyor | → D841-24 |
| L842-10 | Altyazı hazır mı: dosya ve dil durumunu çalışma kuyruğuna bağlama | başka kartla birleşiyor | → D841-24 |
| L842-11 | Dosya ve yan dosyalar için çakışma gösteren düzenleme planı | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-12 | Birden fazla eserde alan bazlı metadata düzeltme makbuzu | başka kartla birleşiyor | → L842-07 |
| L842-13 | Koleksiyona yalnız eser değil sezon ve bölüm de ekleme | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-14 | Ara verdim ve bıraktım durumlarını izleniyor listesinden ayırma | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-15 | İzleme günlüğünde yeniden izleme oturumunu ayrı tutma | uygulanacak | Alias/provenance birleştirme UX ve rewatch etkisi kontrolü; tam günlük exportu D841-23 ile birlikte. |
| L842-16 | Bölüme bağlı kısa not ve izleme sonrası düşünce | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-17 | Koleksiyon yenilemesinde ekle/çıkar farkı ve üyelik politikası | uygulanacak | Seri/sonraki oynanabilir bölüm, kaynaklı koleksiyon snapshot/order/policy, kapsamlı kişisel öneri ve opt-in takvim. |
| L842-18 | İzlenmemiş bölümün görsel ve açıklamasını kütüphanede gizleme | başka kartla birleşiyor | → R839-A09 |
| L842-19 | Yerel arşiv için sahne küçük görselleriyle görsel göz atma | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| L842-20 | Eklenme tarihi ile yayın ve izleme tarihini ayrı sıralama | uygulanacak | Kartın kayıt şeması ve kullanıcı eylemini ayrı uygula; mevcut import/oynatma/backup uyumluluğu; otomatik medya silme/taşıma yok. |
| B841-01 | Workspace'i kaydedilmiş fotoğraftan çalışan araştırma alanına yükseltmek | uygulanacak | Workspace state ve yönlendirme; alanlar arası arama ve kontrollü restore kartı; native view/dar ekran kabulü. |
| B841-02 | Tüm alanlarda arama, sonucu ilgili alanda açma | başka kartla birleşiyor | → B841-01 |
| B841-03 | Açılışta önceki araştırmayı güvenle arka planda tutma | başka kartla birleşiyor | → B841-01 |
| B841-04 | Yerel aramada “neden bu sonuç?” ve konu yakınlığı sırası | uygulanacak | Kaydedilmiş sorgu, alanlı parser ve açıklanabilir model-free yerel sıralama/tag önerisi; kaynağa dönen alıntı görünümü. |
| B841-05 | Ücretli model olmadan kişisel etiket önerisi | uygulanacak | Kaydedilmiş sorgu, alanlı parser ve açıklanabilir model-free yerel sıralama/tag önerisi; kaynağa dönen alıntı görünümü. |
| B841-06 | Kayıtlı sorgudan canlı araştırma koleksiyonu | uygulanacak | Kaydedilmiş sorgu, alanlı parser ve açıklanabilir model-free yerel sıralama/tag önerisi; kaynağa dönen alıntı görünümü. |
| B841-07 | Sayfa kaydında yerel düzenleme kuralları | başka kartla birleşiyor | → B841-06 |
| B841-08 | Aramada yazılabilir alan ve olumsuz filtreler | başka kartla birleşiyor | → B841-06 |
| B841-09 | Tüm vurguları kaynaklarına geri götüren ayrı görünüm | uygulanacak | Kaydedilmiş sorgu, alanlı parser ve açıklanabilir model-free yerel sıralama/tag önerisi; kaynağa dönen alıntı görünümü. |
| B841-10 | MHTML yanında taşınabilir tek HTML arşiv pilotu | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B841-11 | Tam sayfa yerine seçilmiş bölümün kaynak paketi | uygulanacak | Mevcut archive ID/izin/safe render üstünde kartın format veya import özelliği; kısmî yakalama, revizyon, alt kaynak ağ ve offline ölçümleri. |
| B841-12 | Arşivleme sırasında kısmi yakalama nedenleri | başka kartla birleşiyor | → B841-10 |
| B841-13 | Aynı kaynağın okunabilir metin, görüntü ve PDF durumu | başka kartla birleşiyor | → B841-10 |
| B841-14 | Arşiv alt kaynakları için ayrı ağ sınırı | başka kartla birleşiyor | → B841-10 |
| B841-15 | Dosya yolu yerine yetkili arşiv kimliğiyle açma | başka kartla birleşiyor | → B841-10 |
| B841-16 | Sağlayıcı sorgusundan sonra da zorlanan kaynak filtreleri | uygulanacak | Sorgu filtrelerini sonuçta zorla; domain sınırı, değişti/değişmedi/bilinmiyor, case-sensitive URL, açık endpoint ve kısmi hata. |
| B841-17 | Kaynak sayısından ayrı sayfa derinliği ve gezinme grafiği | başka kartla birleşiyor | → A842-01 |
| B841-18 | Hangi bağlantıyı önce okuyacağını gerekçeli seçme | başka kartla birleşiyor | → A842-01 |
| B841-19 | İlk 6000 karakter yerine soruyla ilgili pasajlar | uygulanacak | Seçilmiş film kaynak corpus/RSS/not metinlerini aynı gerçek kullanıcı akışında arama ve film→kaynak UI; webin sonundaki blok seçimi ve video cue window; semantik kanal yok, tam kart kabulü iddiası yok. |
| B841-20 | Tablo ve listeyi bozmayan alıntı parçaları | uygulanacak | Bütün kaynak türlerinde spoiler sınırı; şemalı blok/span alıntısı, örnek büyüklüğü/görüş ayrışması ve kaynak revizyonu UI; uydurma ID link olmaz. |
| B841-21 | Aynı URL'yi tekrar okumayla yeni araştırma niyetini ayırma | uygulanacak | Sorgu filtrelerini sonuçta zorla; domain sınırı, değişti/değişmedi/bilinmiyor, case-sensitive URL, açık endpoint ve kısmi hata. |
| B841-22 | Kaynak güncelliğini “değişmedi / değişti / bilinmiyor” diye ayırma | uygulanacak | Sorgu filtrelerini sonuçta zorla; domain sınırı, değişti/değişmedi/bilinmiyor, case-sensitive URL, açık endpoint ve kısmi hata. |
| B841-23 | Host başına bekleme, görünür kısmi toplama ve devam | başka kartla birleşiyor | → A842-01 |
| B841-24 | Araştırma aramasında seçilebilir SearXNG adaptörü | uygulanacak | Sorgu filtrelerini sonuçta zorla; domain sınırı, değişti/değişmedi/bilinmiyor, case-sensitive URL, açık endpoint ve kısmi hata. |
| R842-01 | Site, feed URL veya RSSHub URI yapıştır; ne bulunduğunu ve hangi adresin izleneceğini gör. Bir sitedeki review/podcast feed'leri ayrı aday olsun. | uygulanacak | RSS service discovery/preview backend in progress by library agent; root UI integration pending verification. |
| R842-02 | Abone olmadan son 5 girdi, tür, dil, güncellik, yaklaşık sıklık ve içerik kapsamı önizlensin. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-03 | İlk abonelikte “şimdiden itibaren / son 20 / tüm mevcut” seç. Yıllarca eski içerik okunmamış sayısını patlatmasın. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-04 | Ana Akışlar sayfasında Tümü/Makale/Video/Podcast; kart biçimi türe uygun olsun. Sesin kapağı, videonun16:9önizlemesi; makalenin kısa başlığı. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-05 | Okunmamış, kaydedilmiş, sonra izle, kütüphanede var, izlenmiş ayrı durumlar. “Kaydet” bir film izleme olayı üretmesin. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-06 | Review/röportajın film kimliği eşleştirme önizlemesi: aynı adlı remake'ler karışmasın; otomatik emin olunmayan ilişki öneri kalsın. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-07 | Film ayrıntısında “Bu yapım hakkında yeni kaynaklar”; RSS girdisinin asıl yeri Akışlar, yapımda yalnız ilişkili kısa görünüm. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-08 | Aynı makale iki feed'den gelirse tek kaynak kümesi; iki feed'in provenance'ı korunur. Aynı başlıklı farklı yazılar birleşmez. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-09 | Feed kısa özetse “Özet” yaz; “Tam metni al” mevcut Browser reader'ına gider. Başarısızsa özet korunur. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-10 | Seçili3makale için “ortak noktalar / çelişkiler / bu filmle ilişkisi” sor. Girdi sayısı ve kullanılan tam/özet metin önce görünür olsun. | uygulanacak | Actual selected RSS assistant event→context→draft/coverage preview→source-bound search_sources→verified F citations implemented.5controlled frontend/agent tests pass; native root page acceptance pending. |
| R842-11 | Spoiler bilinmiyor / kaynak işaretli / kullanıcı izinli durumları; izlenmemiş yapımla bağlantılı özet kapalı kalabilir. | uygulanacak | Bütün kaynak türlerinde spoiler sınırı; şemalı blok/span alıntısı, örnek büyüklüğü/görüş ayrışması ve kaynak revizyonu UI; uydurma ID link olmaz. |
| R842-12 | Günlük/haftalık seçili kaynak özeti, okunmamış sayısının tamamını tüketmek yerine bütçeli toplama. Model çağrısından önce önizleme. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-13 | “Kütüphanemdeki filmlerle ilgili” veya “Takip ettiğim yönetmenler” filtresi; neden eşleştiği gösterilsin. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-14 | Podcast enclosure'ını mevcut oynatıcıda aç; URL sayfası, ses dosyası ve takip edilen program kimliği ayrı kalsın. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-15 | Podcast dinleme konumu kalsın; makale okundu ve bölüm dinlendi iki farklı sonuç. Yeni feed çekimi konumu sıfırlamasın. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-16 | OPML import önizlemesi: klasörler, yeni/mevcut/bilinmeyen adresler, seçili ithal; export abonelikleri taşır. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-17 | Durum ekranında son deneme/son başarılı çekim/son yeni girdi ve hata ayrı. “Yeni yok” ile “bağlantı başarısız” karışmasın. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-18 | Conditional fetch, feed başına yenileme aralığı, host bekleme; uyku sonrası tek sefer toparlama. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-19 | Uygulama kapalıyken çalışmadığı açık; açılışta sınırlandırılmış catch-up. Gizli Windows servisi ilk sürümde gerekmez. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-20 | “Bu görünen listeyi okundu yap” yalnız snapshot'taki ID/cursor'a uygular; o sırada gelen yeni girdileri yutmaz. Undo olsun. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-21 | Kuralı etkinleştirmeden önce hangi girdileri etiketleyeceğini/öne alacağını gör. Toplu silme/otomatik indirme ilk kural kümesine girmez. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-22 | Çok gürültülü feed'i sessize al/haftalık grupta tut; kaydedilen kaynakları silmeden aboneliği bırak. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-23 | Feed adresi taşınınca abonelik kimliği, okuma durumu ve kütüphane bağları korunur; yeni host açıkça görünür. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-24 | İstenirse film kaynak koleksiyonunu RSS/XML olarak dışa ver. Açıkça paylaşmadıkça yerel/private; yerel dosya yolları dışarı çıkmaz. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-25 | RSSHub route kataloğunda kaynak dili/türü/bakım durumu; normal feed varsa onu tercih et. Giriş isteyen rota “hesapsız” diye sunulmasın. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |
| R842-26 | Keşfet'e “kaynaklardan gelen yapım önerileri” rafı; kaynakta geçen filmi keşif adayı yap, sahip olunan/izlenenle ilişkilendir, kullanıcı istemeden kütüphaneyi büyütme. | uygulanacak | Her RSS kartı için gerçek end-to-end UI/store ölçümü gerekir; kapsam/fetch/304/bozukXML/OPML/read≠watch/oynatma/spoiler/retention ayrı kabul satırlarıdır. |

## Somut sınırlar

- `R838-Ö07`: incelenen pysubs2 HEAD, desteklenen Python sürümüyle uyumsuz.1.8.0 alternatifinin kaynak incelemesi/roundtrip kabulü henüz yapılmadı. Bu format adaptörünün seçilen sürüm yoluna ait engeldir; bütün projeyi durdurmaz.
- Graph/multimodal/reranker kartları mühendislik/kalite pilotu olarak **uygulanacak**; yalnız zor veya büyük oldukları için hayalî dış engel atanmadı.
- Page Assist/Filmly/Reelix lisans belirsizliği doğrudan kod kopyasını engeller; bağımsız implementation yolu açık tutuldu. GPL/AGPL kaynaklar otomatik reddedilmedi.
- Gerçek Windows/DPI/native view, canlı web/provider, GPU, HDR, full-suite/CI kabulü her kart için ayrı kanıt gerektirir. Araştırma raporundaki PASS/hash bu ürün kabulü değildir.
