# Kişisel kütüphane güvenilirliği — uygulama kaydı

Kullanıcının 24 maddelik Claude kapsamını yerelde uygulama talimatı. Tek 50 işlik ürün listesine yeni 24 iş eklemez; bu belge o kapsamın uygulama sırasıdır. Başlangıç: master `88a1335b7957b51ea48d1f81c43ceb6bc273913f`. Commit/push/PR yok; agent ve Computer Use yok. Kişisel profil yerine sentetik geçici dizinler. Gerektiğinde LG yerine **ASUS**; çözünürlük değiştirilmez. Kaynak ZIP hazırlanmaz.

**Güncel kullanıcı kararı:** **10’ar iş**. 1–23 ve 24’ün kontrollü bölümü ile izleyen gruplar yerelde tamamlandı; son grup [altı R853 onarımı + dört podcast güvenilirlik akışı](../devir/2026-11-10-2009.md). 24’ün gerçek Windows/native kısmı açık; kişisel uygulama bu test için değiştirilmez. Sıradaki kesin onlu BACKLOG başındaki **P04/E04/P07/E03/E06/E02/E01/E07/E08/E09**; denetim kökleri yeni ürün maddesi diye çoğaltılmaz.

## Yaklaşım ve kabul

Mevcut çalışma paketi ve önizleme/onay/restart zinciri genişletilir; ikinci bir yedekleme sistemi oluşturulmaz. Kişisel kayıtlar, ağdaki gizli referanslar/hipotezler, kaynak varyantları, alan sürümleri, takip ve raf tanımları birlikte korunur. Yedek tek uygulama sahibinde alınır; açık kişisel uygulamaya bu geliştirme sırasında dokunulmaz. İçe aktarılan serbest metin, kimlik ve ağ bağlantıları yol eşleştirmesiyle değiştirilmez. Ücretli/canlı GPU çalışması ve kişisel veri yazımı kapsam dışıdır.

## Gruplar

- [x] A1–A3: [Kalıcılık envanteri](../WORKSPACE-DATA.md); eksik yedi kişisel dosyayı çalışma paketine katma; şema/boyut/kimlik/hedef sürümü doğrulaması. Dosyalar: workspace-package.js, yeni workspace-library-data.js, mevcut workspace-personal-media.test.js ve paket önizleme metinleri. Önce eksik round-trip ve Windows adı testleri kırmızı görüldü; ardından gerçek servis okuyucularıyla yeniden açma, puansız 0/açık kişisel 0, gizleme/hipotezler/kişisel alanların korunması, bozuk paket ve stale hedef reddi geçti.
- [x] B4–B6: Çok dosyalı geri yükleme kurtarma günlüğü; ayrı süreç kesintisi/başarısızlık/rollback kanıtı; #50 kapsamı belli, önizlemeli veri bakımı. Dosya kurtarması hash/onay ve yeniden başlatmayla; renderer tercihleri tam işlem öncesi pakette ayrıca kalır. Eski paketi/kişisel veriyi kendiliğinden silme yok.
- [x] C7–C9: #29 puandan ayrı öneri geri bildirimi; #30 gösterim/erteleme geçmişi; #32 açık koşullar, bilinmeyen metadata dışlaması ve sessiz gevşetme yok. Film/Anime ortak Öneriler sayfası kapsamında.
- [x] D10–D12: #31 tür ve kaynak kimlikli franchise çeşitliliği; #33 sabit aday/koşul/geçmiş/zaman örneğinde yazmayan puan deneyi; #10 gerçek tarihli puan geçmişi, tarih bilinmiyorsa açık bilinmiyor.
- [x] E13: #9 ana kaydın ilk tamamlamasını, puanını ve ilerlemesini koruyan ayrı tekrar izleme/manga okuma oturumları.
- [x] E14–E15: #38 birimli kitap oturumları; #47 oynatma sahibini koruyan dönüş özeti.
- [x] F16–F18: #45 ilk gönderi eki önizlemesi; #46 dürüst eylem makbuzu/ayrı geri alma isteği; #43 mevcut kaynak konumlu notlara ortak erişim.
- [x] G19–G21: #42 seçili sürekli aralıkta çeviri masası; #41 donmuş kaynak/seçenekli dublaj makbuzu; #39 kısa prova bağlantısı (kontrollü servis kanıtı, gerçek üretim kabulü değil).
- [x] H22–H23: #48 ana belge klavye/odak; #49 kapsamlı olmayan, mevcut UI'ye bağlı yoğunluk/metin/hareket tercihleri. Kontroller geçti; gerçek Windows/start.bat estetik kabulü yapılmadı.
- [x] H24 kontrollü bölüm: Not → mevcut kaynak/konum → asistan önizlemesi → gerçek durumlu makbuz → aynı sahibine dönüş; stale ve replay kontrolleri. R853 dokuz kökün hedefli onarımı. [141/141 + 3/3 kanıt](../devir/2026-11-10-1840.md).
- [ ] H24 native bölüm: Gerçek ASUS/Windows/start.bat, site/medya/yeniden açılış ve gerekli yetki kapsamındaki sağlayıcı/GPU kabulü. Kontrollü sonuç bu kabulü kapatmaz; kişisel uygulamaya habersiz müdahale edilmez.

## İzlenecek riskler

1. Kaynak 0 puansızken açık kişisel 0 olumsuz kalmalı; tamamlanma beğeni olmamalı.
2. Oynak önizleme, kök/üst dizin linki, boyut/şema ve yinelenen kimlikte yazma başlamamalı.
3. Paket, not içindeki yolu ve eski kaynak kimliğini değiştirmemeli; yedi tercih havuzu ayrı kalmalı.
4. Çok dosyalı hata/çökme ve rollback hatası, başarı gibi gösterilmemeli.
5. Eski paket yok alanları silmemeli; kapak cache'i veya medya dosyası dahil değilse açık söylenmeli.

## Uygulama günlüğü

- **20:09 sonraki onlu:** R853-28/27/29/26/25/30 + P01/P03/P05/P09 yerelde uygulandı; [devir](../devir/2026-11-10-2009.md). 114/114 izole Node; kuyruk 16/16, senkron 10/10 ve 13 JS syntax. Kişisel çalışma kapasite/unsubscribe korumasında, kuyruk kaydı canlı yetki taşımaz; salt okunur inceleme/ilerleme. H24 gerçek/native kısmı ve Git teslimi açık. Sonraki kesin 10 BACKLOG başında; eski gruplar tekrarlanmaz.

- **19:50 sonraki onlu:** R853-24/22/20/21/23 + ürün #37/#44/#21/#40/#34 yerelde uygulandı; [devir](../devir/2026-11-10-1950.md). 100/100 hedefli test, iki standalone, 18 JS sözdizimi. Yeni RSS okuma dosyası paketli; kişisel profil/açık uygulama değişmedi, H24 native bölümü açık. Sonraki kesin onlu BACKLOG başında; 25–30 ayrı açık kökler ve P01/P03/P05/P09 geliştirilmeleri. Git teslimi yok.

- **19:18 sonraki onlu:** R853-16/15/18/19/17/02 ve ürün #7/#8/#22/#27 yerelde uygulandı; [devir](../devir/2026-11-10-1918.md). Yeni uyarlama dosyası mevcut çalışma paketine dahil; kaynaklı/salt-okunur dönem ve plan hesapları. 171/171 + paket 3/3; H24 native bölümü açık. Sonraki kesin sıra BACKLOG ve 50 iş planının en üstünde; aşağıdaki bitmiş gruplar tekrarlanmaz.

- **Sonraki onlu, 18:40:** kontrollü bağlı kabul ve R853 05/06/07/13/14/12/09/04/11 yerelde düzeltildi; [devir](../devir/2026-11-10-1840.md). Gerçek/native sınır açık, Git yok. Aynı rapordaki yeni 15/16/17 sonraki grupta; tekrar numaralanmaz.

- **14–23 yerelde uygulandı:** [18:22 devir](../devir/2026-11-10-1822.md). 133/133 Node, yeni paket round-trip 1/1, Python 6/6, çeviri yüzeyi 15/15, servis/axe kontrolü. R853-08/10 aynı bilinen kökler olarak doğrulanıp düzeltildi; denetim raporu/genel native kabulü kapatılmadı. Kişisel profil, açık uygulama, gerçek sağlayıcı/GPU ve Git teslimi yok. Aşağıdaki “başladı” kayıtları tarihsel.

- **Yeni grup 14–23 başladı:** kitap oturumları → devam özeti → asistan bağlamı → işlem makbuzu → kaynaklı notlar → çeviri masası → dublaj bütünlüğü → prova → klavye → yoğunluk. Mevcut sourceText, action receipts, translation repair ve kısa örnek akışları genişletilir. Ana medya sahibi/kimlik/hash ve kullanıcı onayı kapıları değişmez. UI, mevcut grafit/amber araç dialogları ve katlanır inceleme alanlarında kalır. Asistan önizlemesi ilk gönderi ekiyle sınırlı olduğunu söyler; yeni araç okumalarını önceden olmuş gibi göstermez. Üretim başlatmak yerine gerçek mevcut onaylı üretim sahibine devredilir. Git ve kişisel profil yazımı yok.

- Başlangıç kontrolü: master/HEAD/remote doğrulandı. Kişisel OFFLINE-MANIFEST/rapor indeksi ve start.sh silinmesi korunuyor. A grubunda eksik yedek kapsamı kodda doğrulandı. Eski genel geri yüklemede zaten hedef hash önizlemesi ve onay/restart var; tekrar yapılmayacak.
- A1–A3 tamamlandı: 9 çalışma paketi testi, 5 gizlilik kontrolü ve mevcut geri yükleme regresyon betiği. Son betikte onay verilmeden yazma bekleyen ve eksik tercih için silme bekleyen eski iki test beklentisi mevcut koruma sözleşmesine uyarlandı. Ürün eşiği gevşetilmedi. Yeni kişisel kapsam için yalnız sentetik veri; gerçek profil veya normal uygulama açılışı denenmedi. Yeni kurtarma günlüğü ve bakım ekranı henüz uygulanmadı; sıradaki grup B4–B6.
- **4–13 tamamlandı:** [devir ve sınırlar](../devir/2026-11-10-1741.md). Oturum/öneri geçmişi de çalışma paketine dahil. Önceki A şemasının kitap/podcast gibi kaynak puanlarını gereksiz reddetmesi, MAL puansız 0'ın metadata motorunda negatif sayılması ve anime günlüğünün film havuzuna sızması doğrulanıp düzeltildi. Yerel/kontrollü sonuçlar gerçek profil veya sağlayıcı/GPU kabulü sayılmaz. Şimdi 14–23 uygulanacak; 1–13 tekrarlanmayacak.
