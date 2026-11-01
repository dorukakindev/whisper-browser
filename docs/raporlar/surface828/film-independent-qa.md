# R828 — bağımsız film görsel QA

Salt okunur inceleme; ürün/test dosyası değiştirilmedi. Sonuç: **görülen kapsamda engelleyici görsel regresyon yok; hiyerarşi iyileşmiş.** Bu karar canlı sağlayıcı, etkileşim veya erişilebilirlik sertifikası değildir.

## Kayıtlı analiz önce / sonra

Önce `tmp/workflow826-film-native/1793518921394/film-saved-result-tr.png`; sonra `tmp/workflow826-film-native/1793519198745/film-saved-result-tr.png` ve `film-saved-result-en.png` bağımsız karşılaştırıldı.

Önce dış kart, dolu amber Yönet düğmesi ve büyük güncellik kutusu aynı anda dikkati çekiyordu. Sonra bölüm tek üst ayraçla başlıyor; yorum başlığı ve gerçek sentez daha önce okunuyor. Yönet görünür üst sağ düğme olarak kalıyor; nötr görünümü kayıtlı çıktının okunmasına uygun. Güncel durum hâlâ okunur metin, içerikten bağımsız ikinci kart değil. Türkçe ve dar açık İngilizce görüntülerde metin/eylem kırpılması veya yatay taşma görmedim. Sağdaki puan kaydetme bir düğme olarak kalmış; Kaynak düzenleme/TMDB eşleştirme açık metin eylemlerine dönüşmüş ama aynı yerlerinde ve okunur. İnce dikey ayraç sağdaki yönetimi prose'dan ayırıyor.

Ayrıca `film-changed-taste-tr.png` incelendi: güncelliğini kaybetmiş analiz, mevcut içerikten önce açık açıklamalı kutuda duruyor ve Yönet yolunu söylüyor. Güncel durumun sakinleşmesi stale uyarıyı silmemiş.

## Discovery/art/dar durumlar

`tmp/design824-fixes-film/1793519440751/` içindeki14PNG'nin tümü açılarak incelendi:

- film-top-1440-tr-dark.png / film-top-800-en-light.png
- film-empty-1440-tr-dark.png / film-empty-800-en-light.png
- film-editor-1440-tr-dark.png / film-editor-800-en-light.png
- film-loading-1440-tr-dark.png / film-loading-800-en-light.png
- film-sample-1440-tr-dark.png / film-sample-800-en-light.png
- film-change-sample-1440-tr-dark.png / film-change-sample-800-en-light.png
- film-error-1440-tr-dark.png / film-error-800-en-light.png

Afişli başlık/metadata/ekleme/yorum girişleri sığıyor; dar açık temada uzun sayfa gezinmesi doğal şekilde ikinci satıra geçiyor. Boş yorum durumunda yükleme eylemi önceliği açık. Editor alanlarında havuz ve sayı etiketi görünür; yükleme sırasında Durdur, hata sırasında Tekrar oku; hazır örnekte Oku/Önizle/örneği değiştir/gelişmiş/tat tercihleri bulunabilir. Açılır başlıklarda çizilen chevron açık/kapalı yönü ayırt ettiriyor. Klavye focus halkaları screenshot'ta belirgin; bunları seçili durum hatası saymıyorum. Aşağı uzayan hata/gelişmiş içerikler sayfa kaydırıcısına ait; viewport altına devam etmeleri kırpılma değil.

`film-metrics.json` tüm14durum için overflow:false kaydediyor; son 800 adlı fixture'ların gerçek innerWidth640/innerHeight800 olduğu dikkate alındı. Ekran görüntülerinde de yatay clipping görülmedi.

No-art discovery klasöründe ayrı adlandırılmamış. Ancak aynı son workflow klasörünün `film-long-title-tr.png` ve `film-long-title-en.png` görüntüleri afişsiz gerçek render'ı gösteriyor ve ayrıca incelendi: boş afiş kutusu yok, uzun başlık üç satırda okunuyor; kaynak seçme/favori/yapımı yönetme ve alt gezinme görünür. Kaynak CSS265–266'daki özgül :has/data-art-expected/md-art-empty kuralları da aynı tek-kolon sözleşmesini koruyor. Dolayısıyla afişsiz sonuç yalnız source çıkarımı değildir.

## Dürüst sınır / küçük kalite notu

Sentez üstünde kayıt bilgisi, örnek uyarısı ve güncellik hâlâ üç ayrı satır; şimdi makul ağırlıkta fakat daha da sıkıştırılabilecek tek yoğunluk alanı bu. Bu teslimde zorunlu değişiklik gerektirmiyor; uyarı metnini gizlemek anlam kaybı yaratır. Açık temada Yönet nötr düğmesinin çerçevesi görünür; renk farkı ölçülmeden kontrast sertifikası verilmedi. Fixture'ın İngilizce analiz metninin Türkçe kabukta görünmesi içerik verisidir, bu CSS değişikliğinin yerelleştirme regresyonu sayılmadı.

Etkileşim çalıştırılmadı; PNG/source/var olan geometri kaydı üzerinden bağımsız visual QA yapıldı. Canlı site/API/DRM/GPU, tüm DPI/zoom, ekran okuyucu, hover ve reduced-motion runtime bu incelemenin kanıtı değildir. Engelleyici bulgu saptanmadığı için yeni ürün edit'i önerilmiyor.

Ek kapsam ayrımı: No-art kabulü yerel film başlığının workflow826 görüntüleridir; discovery no-art doğrulandı denmiyor. Discovery art/empty/editor/loading/error ayrı design824 fixture'larıyla incelendi. .uiprev/home-discovery-design-after-1793519440739/detail-tr-dark-1440.png genel fixture kimliğinden doğan kasıtlı decision-get eşleşme hatası içerir; onu düzgün empty/editor state yerine kanıt saymadım.
