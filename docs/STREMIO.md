# Stremio eklentileri

Yerel birleşme ve güncel doğrulama: [2026-11-11-0349](devir/2026-11-11-0349.md). Önceki paket notlarının “yapılmadı” kayıtları tarihsel bağlamdır; gerçek mpv/medya kabulü hâlâ ayrı sınırdır. Kütüphane/puan/geçmiş kapasitesinde eski kişisel kayıtlar sessizce silinmez; yeni kayıt açık kapasite hatası verir. Bozuk kayıt dosyası boş veriyle ezilmez. Puanlar diğer medya havuzlarına sessizce birleştirilmez. Sorgulu manifest adresleri korunur; belirsiz çok dosyalı sezonda başka bölüm seçilmez.

Kullanım: Medya ana sayfası → **Stremio** → **Eklentiler**. Adresi gir (https:// veya stremio://), **Eklentiyi kontrol et**, onaylayınca eklenir. Öneri düğmeleri (Cinemeta, OpenSubtitles v3, Torrentio) yalnız adres kutusunu doldurur.

Akış: bir filme/diziye gir → **Oynat** → eklentilerden kaynaklar gelir (kalite, eklenti, seeder/boyut filtreleri; **En iyi kaynakla oynat**) → seçince oynatıcıda açılır. Keşfet'teki film/dizi sayfalarında IMDb kimliği varsa **Kaynak bul (Stremio)** düğmesi aynı akışı açar.

Oynatıcı alt çubuğundaki menü düğmesi: **Kaynaklar** (konumu koruyarak kaynak değiştir), **Altyazı** (önce altyazı eklentileri, yoksa OpenSubtitles), **Ses** (ses izi / dublaj dosyası ekle), **Yapay zekâ** (altyazıyı çevir, Whisper ile çıkar, tek tık çıkar+çevir, dublaj üret — mevcut düğmeleri tetikler).

Devam: ilerleme kaynaktan bağımsız `stremio-progress.json` içinde tutulur; bölüm bitince sıradaki bölüm önerilir; Stremio sayfasında **İzlemeye devam et** rafı vardır.

## Güvenlik sözleşmesi
- Eklenti adresi gizli sayılır (debrid anahtarı taşıyabilir): yalnız ana süreç dosyasında; renderer yalnız `host/…` etiketini görür. Kaynak/altyazı listeleri kısa ömürlü seçim jetonları kullanır; seçilen akışın gerçek URI’si oynatma için renderer belleğine verilir. Yeni izleme geçmişinde URI yerine hash kimlik yazılır; yeniden açma main’de mevcut OS güvenli deposuyla saklanan adresten çözülür.
- Eklenti/katalog/altyazı isteği main'de: DNS-pinli genel adres kontrolü, elle ve her sıçramada doğrulanan yönlendirme, bayt/süre sınırları. Özel ağ hedefleri yalnız eklentinin kendisi yerel (loopback) ise kabul edilir.
- Torrent kaynakları mevcut rqbit hattından (magnet → dosya seçimi → `whisper-media://`) geçer; motor kurulu değilse oynatma başlamaz ve kurulum için kullanıcıya yönlendirilir.
- `configurationRequired` eklentiler yapılandırılmadan eklenmez. YouTube ve dış bağlantı kaynakları oynatılmaz (neden gösterilir). `proxyHeaders` isteyen kaynaklar yalnız başlıkların tamamı güvenli listedeyse (Referer, Origin, User-Agent, Authorization, Cookie, Accept, Accept-Language, `X-*`) oynatılır; başlıklar ana süreçte kalır ve yalnız seçilen tam adrese eklenir (Chromium: `sessionMux` yuvası `stremio`; native mpv: `http-header-fields`).

## Oynatıcı paneli (altı sekme)
Kaynaklar · Altyazı · Ses · **Oynatma** (hız, ±10 sn/+85 sn atlama, önceki/sonraki bölüm, uyku zamanlayıcı, otomatik sıradaki) · **Dublaj** · Yapay zekâ. Shift+N / Shift+P bölüm değiştirir.

**İçerik profilleri** (Film, Dizi, Belgesel, Animasyon, Video/ders) türden otomatik seçilir, sekmeden değiştirilebilir ve içerik başına saklanır. Profil; çeviri üslubunu (`translateRegister`), dublaj hazır ayarını (Dengeli / Hızlı deneme / Ayrıntılı kontrol), otomatik sıradaki bölümü belirler; hız ana oynatıcının kişisel tercihidir. **Dublaj** sekmesi oynatıcıda aktif altyazıyı gösterir (iki altyazı varsa çeviri öncelikli), Whisper / çıkar+çevir kısayolları verir ve stüdyoyu profille birlikte açar. Stremio altyazıları kaydedilirken VTT→SRT'ye çevrilir; dublaj hattı yalnız SRT kabul eder.

Sıradaki bölüm aynı `bingeGroup`/eklenti/kaliteyi tercih eder. Native mpv'de ses/altyazı izi seçilir; bölüm adından (intro/recap/giriş/özet…) atla düğmesi çıkar. MKV/HEVC/HDR veya yerleşik oynatıcı hatasında native öneri gösterilir.

**Listem**: `stremio-library.json` (en çok 500; `.wbp` paketine girmez). Ana sayfa: vitrin, tür çipleri, Listem, devam et, raflar; **Keşfet**: tür/katalog/kategori/puan/yıl/sıralama ve sayfalama; kaynak karşılaştırma (en çok 3).

## Kütüphane, puanlama ve kaynak puanı
**Kütüphane** sekmesi: *Geçmiş* (güne göre gruplu, istatistik: yapım, biten, saat, bu hafta, gün serisi; devam et / sıradaki bölüm / kaldır), *Listem*, *Puanlarım* (durum + puan + not süzgeci). Başlık sayfasında **Benim değerlendirmem**: 10 yıldız, durum (planlıyorum/izliyorum/izledim/bıraktım), not; `stremio-ratings.json` (paketlenmez). Oyuncu/yönetmen/senarist/ödül/ülke eklenti verirse gösterilir. Bölüm satırında "İzlendi işaretle"; sezon hapında ilerleme (S1 · 3/10).

**Kaynak puanı** (0–100): çözünürlük, seeder (log), kaynak türü (remux > Blu-ray > WEB-DL…), ses/HDR, çoklu ses/altyazı, uyumluluk cezası (HEVC/HDR için native), kamera kaydı/az seeder/çok büyük uyarıları. "En yüksek puan" sıralaması ve karşılaştırma tablosunda Puan satırı.

**Oynatıcı Pro** (`src/renderer/player-pro.js`) tüm medya için: görüntü (renk/gama/keskinlik/en-boy/yakınlaştırma/döndürme), altyazı-ses eşitleme, hız, uyku zamanlayıcı, canlı bilgi. Kısayol: X, Q, Z. Ayrıntı: [CODEX-TEST-NOTLARI.md](CODEX-TEST-NOTLARI.md).

## Kayıt hatası ve stüdyo girişi

İlerleme kaydı başarısızsa oynatıcı başlığının altındaki kalıcı satır nedeni gösterir. “Kaydetmeyi yeniden dene” aynı kaynak/kuşak için o andaki konumu kaydeder; başarılı yanıt satırı kaldırır. Kapasite veya bozuk dosya nedeniyle mevcut kişisel kayıtlar otomatik silinmez. Başka kaynaktan gelen geç hata yeni oynatmada gösterilmez. Bu, devam depolarını birleştirmez.

Stremio dublaj girişi `DubGeneratorUI.prepareWithPreset({preset,isCurrent})` üzerinden mevcut stüdyoyu hazırlar; DOM düğmesi aramaz veya üretim başlatmaz. Normal `prepareCurrent()` girişi korunur. Hazır ayar uygulaması kaynak/konfigürasyon/busy kontrolü ve mevcut gruplama onayını kullanır.

## Gizli kaynak ve ortak oynatma tercihleri

Yeni akış geçmişi tam URL kaydetmez; `stream:<sha256>` referansıyla yetkili MediaHub `network {key}` yoluna döner. `stream-sources.safe.json` mevcut SafeSecretStore/safeStorage ile main’de tutulur ve `.wbp` paketine girmez. Güvenli depo yoksa plaintext dosya oluşmaz; yalnız oturum belleğiyle açılabilir, yeniden başlatma için güncel kaynak gerekebileceği görünür bildirilir. Adres kapasitesi 2000; eski kayıtlar otomatik silinmez. Bozuk kasa korunur. Eski geçmiş/yedekler otomatik temizlenmez; sağlayıcı süresi/başlıkları ayrıca taze kaynak isteyebilir. Medya baytlarını Chromium veya native mpv alır; renderer’ın aktif URI görmediği iddia edilmez.

Stremio/Pro hız ve uyku kontrolleri ana oynatıcının `PlayerPlaybackControls` cephesini kullanır; ayrı timer kurulmaz. Profil açılışı hızı ezmez. Önceki Stremio hız değeri silinmez; panelde açık eylemle kullanılabilir. Dublajın efektif hız/senkron politikası ayrı kalır.

## Bağımsız altyazı dili ve native araç alanı

Altyazı araması/otomatik seçim ilk kullanımda mevcut çeviri hedefini, sonra `stremio.subtitleLanguage` açık tercihini kullanır; arayüz dili değişmesi tercihi değiştirmez. Boş Any seçimi saklanır; listede olmayan geçerli hedef de gösterilir. Eski arama veya indirme yanıtı değişmiş kaynak/kuşağa uygulanmaz.

Native modda mevcut Stremio menüsü/sıradaki/atla için sahne içinde ayrı alan ayrılır, mpv görüntü sınırları bu alanı dışlar. Darda araç alanı alttadır; menü yoksa eylemler kompakt alt alan kullanır. Native kapandığında eski yerleşime döner, zaten native’deyken geçiş önerisi kaldırılır. Bu araçlar snapshot/occlusion ile videoyu dondurmaz; diğer modal/Pro/asistan örtme davranışı korunur. Gerçek mpv/Windows tam ekran kabulü ayrıca gereklidir.

## Yapıt kimliği ve sürümler

Main, katalog oturumunun type/id/sezon/bölümünden opak work key üretir; URL/torrent key ayrı kalır. Bilinmeyen bölüm veya yerel dosya adıyla yapıt tahmini yapılmaz. Yeni geçmiş work key’i korur; eski geçmiş topluca değiştirilmez. Pro görüntü tercihleri aynı yapıtta paylaşılır, ses gecikmesi kaynakta kalır. Eski kaynak tercihleri silinmez; bozuk work tercih kaydı üzerine yazılmaz.

Altyazı sekmesindeki “Önceki kaynakların altyazıları” kayıtları salt okunur sürüm referansıdır. Dosya adı/rol/dil/sayı/ofset metadata’sı kalıcı, kısa örnekler oturum belleğindedir; tam yol/döküm metni bu yeni depoya yazılmaz. Yapıt başına32 kaynak, dolduğunda mevcut kayıt silinmez ve kaydetmeme bildirilir. Kart apply/seek yetkisi vermez; eşleşmemiş zamanlı iz, çeviri veya gecikme yeni kaynağa otomatik aktarılmaz. Kart açıkken native görüntü devam eder; diğer modal/menü kapıları korunur.

## Eklentiyi yapılandırma ve debrid

Yüklü eklentide **Ayarlar**, yeni önizlemede **Eklentiyi yapılandır** kendi `/configure` sayfasını açar. Site sağlayıcı/debrid seçeneklerini yönetir; kullanıcı kendi hesabını orada kullanır. Sayfanın Install/Yükle düğmesi `stremio://…/manifest.json` dönüşünü Whisper’a getirir. **Ayarları kaydet** origin/manifest kimliği doğrulanmış kaydı mevcut sırada, açık/kapalı durumunu koruyarak günceller. İptal/çakışmada eski kayıt kalır. OS protokol ilişkisi değiştirilmez; ayar penceresinin geçici session callback’i aynı sayfa/popup/iframe’yi destekler. Config adresleri ve debrid anahtarları liste/hata/loglara basılmaz.

Doğrudan/debrid HTTPS akışı torrent motoru istemez. Ham torrent için rqbit gerekir: eksik/bozuk durumda kaynak ekranından motoru kur/onar; doğrulandıktan sonra **Seçilen kaynağı yeniden dene**. Kurulum tek başına film indirmez; retry aynı kaynağı korur, değişmiş kaynağın geç sonucunu kullanmaz. Medya merkezi Torrentler bölümünde kontrol/onarım da vardır. Bu bilgisayarda9.0.1 motoru gerçekten kurulup --version ile doğrulandı; kullanıcı kayıtları ve açık uygulama korunur.

Eski kayıtta yapılandırma yeteneği alanı yoksa Ayarlar gizlenmez; tıklanınca yalnız seçilen eklentinin güncel manifest kimliği/yeteneği doğrulanır. Bu inceleme tek başına kayıt yazmaz.
