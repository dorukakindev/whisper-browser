# İzlediklerim, okuma listeleri ve ayrı zevk havuzları

Kullanıcı onayı: görünür İzlediklerim girişi, tamamlanan/yarım kalan içerikler, durum işaretleme tarihi, puana dayalı ve içerik türüne göre ayrılmış zevk profili; eklenen dört MAL dosyasının içe aktarılması. Çakışma seçimi kullanıcı tarafından uygulayıcıya bırakıldı.

Görsel yön: mevcut grafit/amber, IBM Plex Sans + Sora, üst medya gezinmesi korunur. İzlediklerim üst menüde; Anime ve Manga aynı kişisel arşivin ayrı görünümüdür. Sayfada durum şeridi, içerik havuzu seçimi, arama ve kapak yerine kaynağı dürüstçe belirten tipografik kimlik; seçilen yapımın düzenleme alanı ayrı çekmecedir. Puan, ilerleme, kaynak ve tarihin görsel rolleri ayrılır. Sora başlık, amber gerçek ilerleme, yüzey/border mevcut CSS tokenlarından gelir. Filtreler klavye ile kullanılabilir, boş/hata/işleniyor durumları görünürdür.

Davranış: tamamlandı puansızsa beğeni değildir. Puan /10; MAL 0 puansızdır. Film, dizi, belgesel, anime, manga, podcast, kitap ayrı havuzlar. Manga/manhwa/manhua açık kullanıcı sınıflandırmasıyla ayrılabilir; MAL dosyası menşe bilgisini taşımadığında tahmin edilmez. Ağ ilişkileri ile hesaplanan profil tek Zevkim girişinden ulaşılır ama sahipleri ve kanıt/onay kapıları korunur.

İçe aktarma: MAL kimliğiyle tekilleştirme, mruniversee XML önce; sıkıştırılmış MAL dosyaları eksik metadata doldurur. Çakışan kaynak değerleri variants içinde korunur; mevcut kullanıcı düzenlemesi ezilmez. Dosyada olmayan izleme tarihi uydurulmaz, importedAt izleme tarihi değildir. Güncel durum değişimi statusMarkedAt, tamamlandı işareti completedMarkedAt, dış kaynaktaki gerçek tarih finishDate olarak ayrı kalır. Asıl XML dosyaları değişmez. Yeni veriler userData/personal-collection.json sahibinde, katalog/ses dosyalarına dönüştürülmez.

Uygulama sırası: (1) kaynak parser/birleştirme, durum tarihleri ve puan alanı ayrımı; (2) görünür arşiv/Anime/Manga ve düzenleme; (3) Zevkim alan seçimi/ağ bağlantısı, hedefli test, izole LG kabulü, yetkilendirilmiş gerçek dosya aktarımı. Git teslimi bekler.
