# R837 browser alt denetimi — 2 yeni bug ve 3 ayrı öneri

HEAD9b3f9e462abaebfd1e3a321fcb72e9594b8c7533. Salt kaynak/gerçek modül/sentetik disk; ürün/test/ayar değiştirilmedi. Main/renderer fonksiyonları kaynak dosyasından aynen çıkarılıp vm içinde çağrıldı; bütün uygulama/native WebContents çalışmadı. İlk probda vm Map ile host Map instanceof farkı fixture hatasıydı; Map/Set paylaştırılarak düzeltildi. Bu ürün bugı sayılmadı.

## B01/P2 — Geçerli çok alt etiketli dil, arşivde Türkçe kimliğine düşüyor

Kaynak: browser-site-profiles.js:61–65 Intl.Locale, renderer:24744 ve24951 effective profile target; main:6839–6863 browserPageTranslationConfig hedefi korur; main:7043–7066 persistBrowserPageTranslationArchive gerçek archive.savePage çağırır. browser-translation-archive.js:61–64 languageCode yalnız sıfır/bir hyphen kabul eder, aksi halde tr. savePage:265/277/279; findPage:317/320; export:124/130 aynı dar normalizasyonu kullanır.

Tekrar: Aynı URL/article/source için önce tr çeviriyi gerçek main persist→archive disk yoluyla kaydet; site profilinin kabul ettiği zh-hans-cn için aynı işlemi yap. İki id aynı, sonraki tr findPage gerçek Çince metin döndürür ve record.targetLanguage=tr. Tek alt etiketli zh-hans kontrolü ayrı id oluşturur. JSON exportta aynı zh-hans-cn yanlışlıkla tr metadata üretir. Bunlar aynı normalizer kökünün varyantları, ayrı bug sayılmaz.

Etki: meşru bir site dili yanlış arşiv namespace'ine yazılır; Türkçe çeviri aynı id altında bastırılır ve sonradan Türkçe geri yükleme yanlış dilde metin getirir. Live model çevirisi gerekmez; doğru dilde üretilmiş sentetik metin kullanılır. Kabul: BCP47 normalizasyonunu üretici ve bütün arşiv tüketicilerinde ortaklaştır, geçersiz dili açık ret et; sessizce başka dile düşürme. Eski yanlış etiketli kaydı içerik dili tahminiyle otomatik düzeltme. R85C3 site-terminology regex mismatch idi ve düzeltildi; bu archive kimliği/disk/export farklı tüketici, R833 tab-terim kaçağı ve R489 bozuk index/payload dili eşleşmesi değil.

## B02/P2 — Site hedef dili otomatik arşiv geri yüklemesinde yok sayılıyor

Kaynak: renderer:9104–9120 effectiveBrowserProfile site/path/tab katmanlarını çözer; gerçek previewBrowserPage:24735–24744 effective pageTargetLanguage gönderir. Main restoreArchivedBrowserPageTranslation:7067–7075 yalnız loadSettings.ui.browserPageTarget/translateTo kullanır; mevcut effective site dili burada alınmaz. Mevcut kayıt hasPage bu yanlış dille sorgulanır ve en başta missing olur.

Tekrar: globaltr/siteen; gerçek effective profile ve preview fonksiyonu en gönderir. Gerçek archive diskte en kayıt bulunur. Gerçek main restore early lookup ok:false/missing:true döner; enhasPage true/trhasPage false kontrolü var. Bu B01'den bağımsız: yalnız basit geçerli tr/en kullanılır, normalizasyon sorunu yok. Yanlış TR çevirinin gerçekten görüntülendiği iddia edilmez, bu senaryoda doğru EN kaydı geri yüklenmez. Kabul: auto-restore lookup etkin site/path/tab hedefine bağlı olmalı; navigation generation/restore sequence güvenliği korunmalı. Scope sıfırlama için global ayar değiştirilmeye zorlanmamalı. R833 manga devam terimi ve R835 uyumsuz package import önerisi farklıdır.

## Ayrı 3 öneri

### ROOT-G01 — Manuel sayfa düzeltmelerinin kökenini arşivde koru
Mevcut main:12592 manualEditIds ekler,17506 exporta verir; archive.savePage/normalizePageRows yalnız kaynak/çeviri/tag/role/section/order taşır; restore:7133 manualEditIds boş başlar. Öneri: kullanıcı/model ayrımı, önceki çeviri özeti, değişiklik tarihi ve kaynak revizyonu sınırlı metadata ile korunsun; her geçmiş metni veya kişisel profili sınırsız saklama. Kabul: tek manuel satır yeniden açılınca kullanıcı düzeltmesi etiketi korunur, eski kayıtta köken unknown; açık geri al mevcut source snapshot uyumsuzsa ret; otomatik model çağrısı yok. Mevcut canlı edit özelliği veya R835 asistan cevap makbuzu değil, browser sayfa düzeltmesinin kalıcı provenansı. Yeni işlevsel bug sayılmadı.

### ROOT-G02 — Değişen web sayfasıyla arşivin farkını incelet
Mevcut archive.matchArchivedPage:149–190 kaynak/tag/role/section ile eşler, findPage:330 min ratio uygular; main:7184 kısmi geri yüklemeyi açık bildirir. Öneri: eşleşen/değişen/yeni/silinmiş kaynak bloklarını salt okunur karşılaştır; kullanıcı isterse yalnız değişen seçili blokları yeniden çevirsin. Kabul: tek değişen paragraf eski çeviriymiş gibi gösterilmez; aynı kalan paragraf yeniden ücretli isteğe gitmez; source generation değişirse inceleme bayat olur. Var olan eşleşme/partial uyarısı yeniymiş gibi sunulmaz. R835 package import semantic diff ve R833 dosya bulk replace farkı farklı veri/iş akışlarıdır.

### ROOT-G03 — Kalıcı çeviri arşivi için site bazlı saklama tercihi
Mevcut main persist otomatik savePage yapar; archive INDEX_LIMIT5000 ve _saveIndex eski dosyaları kapasiteye göre toplar, kullanıcı site seçimi/yaş süresi bu API'de yok. Öneri: site için hiç kalıcı saklama / sınırlı yaş / sakla tercihi; mevcut kayıtlar için URL/tokenları açığa çıkarmayan adet+disk boyutu önizlemeli açık temizleme. Kabul: optout açık site çevrilebilir fakat yeni kalıcı page JSON/Markdown oluşmaz; diğer site/altyazı/dublaj/sistem cache dosyaları silinmez; İptal0silme, hata kısmi sonuçla gösterilir. Cookie/site-data clear veya genel cache silme yeniymiş gibi sunulmaz; bu uygulamanın ayrı çevrilmiş içerik arşivinin kullanıcı denetimidir.

## Dedup ve sınırlar
AGENTS/YENI/DEVIR1325, Night1000README/ilgili kaynak imzaları, R815/R818–836 ve R85C3/R489 okundu/arandı. BCP47/archiveprofile kökleri için languageCode/zh-hans-cn/restoreArchivedBrowserPageTranslation/profil-arşiv araması yapıldı. R83311bug/R8357bug+23öneri/R834tasarım tekrarlanmadı. Kanıt2bug,3öneri. Kişisel veri yok, kontrollü .tmp arşivler. Gerçek site/UI/GPU/LLM/normalstart/tamCI sınanmadı.
