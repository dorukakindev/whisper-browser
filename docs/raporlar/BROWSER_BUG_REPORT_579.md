# Rapor579 — Devam görselleri ve Keşfet'te görünmeyen eylemler

25 Ekim2026 17:19. Başlangıç `a25e439a04ca66c4079d30b293c9c72c3d14513b`; ürün bitiş `1e8df6bb3fb4a380a8649e919e178fe6bbf8c3e8`. Dal `codex/book-reliability549`, PR487.

## Kullanıcının ekranları ve kök nedenler

1. Ana sayfa `art()` yalnız katalog kimliği/hasPoster ile afiş istiyordu. Katalogla eşleşmeyen YouTube geçmişinde bu alanlar olmadığından devam kartı ve hero yalnız yer tutucu gösteriyordu. `MediaHomeModel.thumbnail` canonical youtube/browser anahtarı veya doğrulanmış YouTube URL'sinden11karakter video kimliği çıkarır; HTTPS i.ytimg hqdefault görseli, lazy/referrer kapalı, başarısızlıkta mevcut simge. Güvenilmeyen URL'den serbest görsel yükleme yok. Kimlik/yol/kullanıcı başlığı değiştirilmez.
2. Kütüphane film sayfasında konu çevirisi vardı; Keşfet'in **ayrı küçük ayrıntı penceresinde yoktu**. Doğrudan Konu başlığında Türkçeye çevir/Özgününü göster eklendi. Aynı mevcut AI sağlayıcı callback'i kullanılır. Çeviri geçici/bounded24önizleme cache'inde, kaynak hash'iyle saklanır; kütüphaneye eklemez. Kaynak değişimi/yanlış istek tokenı engeli; pencere kapanınca iptal. Metadata beklerken gelen iptal de daha sonra ücretli/gerçek sağlayıcı işi başlatmaz. Canlı ücretli sağlayıcı bu turda çağrılmadı.
3. Keşfet ayrıntısından mevcut Letterboxd araçlarına yol yoktu. **Letterboxd yorumları ve analiz** düğmesi yapımı açıkça belirtilen izlenecekler kaydıyla mevcut karar paneline bağlar. Panelde açık Browser yorumlarını kullan, açık film sayfasını getir, TXT/JSON yükle ve mevcut kanıtlı analiz akışı var. Bu tur otomatik doğru film URL'sini bulma veya Cloudflare'ı aşma eklenmedi; panel hâlâ geçerli film yorum URL'si ister. Otomatik çekim engellenirse Browser/yapıştırma seçenekleri korunur.
4. PDF seslendirme düğmesi ve yeni okuyucu **teslim dalında zaten var**; kullanıcının `D:/Whisper Local` ana kopyası `658d93374e3230488a01c990ca1e75bb9b2b87d4` (master490c2f84+rapor547belgesi), PR487 kodlarını içermiyor. Ekrandaki eski üst menü bununla uyumlu. Ana kopya kullanıcı belgeleri/untracked dosyaları nedeniyle otomatik reset/kopyalama yapılmadı. Yeni kopyada gerçek PDF açıp Sesli oku→başlangıç/bitiş/üretime hazırlama alanlarının görünürlüğü doğrulandı. Kullanıcının açık uygulaması kapatılmadı.

## Dosyalar ve doğrulama

- `media-home-model.js`, `media-home.js`, `media-home.css`: YouTube resim kimliği/yerleştirme/fallback.
- `media-discovery-service.js`, `media-catalog-service.js`: mevcut sağlayıcıyı geçici konu çevirisine bağlama; önizleme cache/iptal/izin kontrolleri.
- `media-discovery-ui.js`, CSS: ilgili içeriğin yanında konu çevirisi ve Letterboxd erişimi, doğal satır sarma ve özgün metne dönüş. Yorum kaydı etkisi görünür.
- İki hedefli test dosyası: video kimliği host/credential/yol reddi, geçici çeviri cache/iptal/kütüphaneyi değiştirmeme.
- `electron-home-entry-actions.smoke.js`: gerçek Windows Electron/main/preload/IPC, ayrı profil; kontrollü metadata/görsel/çeviri sınırları. Hero+devam kartında gerçek img load, konu Türkçeye/özgüne dönüş, çeviride0katalog kaydı, Letterboxd araçlarının açılması, gerçek iki sayfa PDF'de seslendirme paneli. Son koşu exit0 `.uiprev/home-entry-actions-1792937872841`,4görüntü incelendi. İlk denemede test yanlış PDF hazır alanını bekledi; test existing gerçek `pages.get(1).article.dataset.state` sözleşmesine düzeltildi, ürün hatası sayılmadı.

16hedefliNode PASS; değişenJS syntax/diff temiz. Gerçek kamuya açık örnek thumbnail endpoint'i HTTP200/image/jpeg/32195byte döndü. Native görseller kontrollü fixture'dır; kullanıcının tüm videoları veya canlı ücretli AI/Letterboxd erişimi başarılı sayılmaz. Yeni bağımlılık/kurulum/kalıcı ayar şeması yok. UI için frontend-design rehberi uygulandı, mevcut tema korundu. Kişisel profil/veri/log Git'e konmadı.

Ana sürümle birleştirme ve `start.bat` ana kopyasını güncelleme henüz yapılmadı: AGENTS.md açıkça ayrı PR ve kendiliğinden master merge yapmama kuralı koyuyor. Kullanıcı son mesajda durumunu sordu; açık güncel PR487 merge onayı istenir. CI beklenmez; eski ratchet/fullsuite sınırları önceki notta geçerli. Uygulama yeniden başlatılması tek başına henüz alınmamış commitleri ana kopyaya taşımaz.
