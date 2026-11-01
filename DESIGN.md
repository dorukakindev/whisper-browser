---
version: alpha
name: Whisper Browser
description: Türkçe video, altyazı ve çeviri çalışma istasyonu.
colors:
  background: '#111215'
  surface: '#191b1f'
  raised: '#24272d'
  border: '#383c43'
  text: '#f1f0ed'
  muted: '#b0b4bd'
  primary: '#d5a35c'
  danger: '#d06b63'
typography:
  sans:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
  display:
    fontFamily: "Sora, Segoe UI, sans-serif"
  mono:
    fontFamily: "JetBrains Mono, Consolas, monospace"
rounded:
  DEFAULT: 8px
  sm: 6px
  md: 8px
spacing:
  control-gap: 8px
  section-gap: 12px
components:
  button: {}
  input: {}
  disclosure: {}
  status: {}
---

# Whisper Browser tasarım kaydı

## Overview

Ses çalışma istasyonu: video merkezde, yoğun ama ikincil ayarlar kenarda. Ürün yönü ve Türkçe metin gereksinimi AGENTS.md tarafından tanımlanır. Kullanım Windows masaüstü; İngilizce öğrenme, pazarlama sayfası veya yeni bir marka tasarımı değildir. Hedef pazar hakkında dil dışında ayrı kanıt yoktur.

Bu dosya mevcut tasarımı kaydeder; token üretmez. Kanonik sayfa paleti `src/renderer/theme-palette.css` içindedir. Ana pencere ve ayrı asistan renderer'ı bu dosyayı önce yükler; `styles.css` ve `assistant-overlay.css` mevcut bileşen adlarını bu ortak rollere bağlar. Ön yüz bu değerleri `var(--bg-0)`, `var(--bg-1)`, `var(--bg-2)`, `var(--text)`, `var(--border)` ve `var(--accent)` ile tüketir. Ürün davranışının sahibi AGENTS.md ve aşağıdaki iş akışı sözleşmesidir.

## Colors

Mürekkep/grafit katmanlar, sıcak amber etkileşim vurgusu. Hata, seçim ve pasif metin ayrı semantik token kullanır. Yeni panel açık temada da çalışma zamanı değişkenlerini izler. Dekoratif parıltı ve eski sabit mavi kullanılmaz.

## Typography

Mevcut sans serif yığını Türkçe metinleri taşır. Kod, süre ve teknik değerler için mevcut mono yığın kullanılabilir. Yeni bağımlı font veya CDN yüklenmez. Açıklamalar kısa, eylemler fiille başlayan Türkçedir.

Medya kabuğu ve asistanın mevcut self-hosted ailesi başlıklarda Sora, gövdede IBM Plex Sans'tır. Yukarıdaki font kaydı bu sahipliği belgeler; stüdyo/teknik alanların mevcut fontunu topluca değiştirmez. Kitap prose serifini korur. Runtime renklerin sahibi CSS değişkenleridir; bu belge yeni bağımsız tema değerleri üretmez.

## Layout

Video alanı ile yan panel ayrı kaydırma sahipleridir. Video araçları açılabilir panelde gruplanır; kapalı panel izlemeyi daraltmaz. Formlar dar genişlikte kırılır, sonuç listeleri sınırlı yükseklikte kayar. Native video WebContentsView, küçük oynatıcıya aynı örnek olarak taşınır. Pencere yakalaması çocuk video yüzeyini içermediğinden ayrıca video yakalanarak doğrulanır.

## Elevation & Depth

Hiyerarşi ince sınırlar ve yüzey tonlarıyla kurulur. Mini oynatıcı işletim sisteminin üstte tutulan ayrı penceresidir. Altyazı canvas'ı video üstündedir; ana uygulamanın eylem alanını kaplamaz.

## Shapes

Kontroller ve gruplarda mevcut 6–8 px köşe ailesi korunur. Eylemi açıklamayan ikon veya emoji eklenmez.

## Components

### Günlük görev ve isteğe bağlı ayrıntı

Temel sağlayıcı/model/maskeli anahtar ayarları önce; ayrı asistan yapılandırması yalnız seçildiğinde görünür. Kısa asistan panelinde kaynak tek özet satırıdır; tam bağlam açılır, ilk öneri görünür ve diğer komutlar menüdedir. Meşgulken kullanılamayan öneriler yanıt alanını daraltmaz; İptal ve taslak görünür kalır.

Hazır film yorum örneği ayar formundan önce gelir; sayı/havuz/yenileme isteğe bağlı ayrıntıdır. Dublajda etkin ses ile değiştirilmek üzere seçilmiş ses ayrı durumlardır; boş kitaplık formu yerine yerel ekleme sunulur. PDF ses hazırlığı okuma alanını sürekli işgal etmez; hazır oynatma ve aralık bilgisi açık kalır. Bu sadeleştirmeler gelişmiş seçenekleri silme gerekçesi değildir. [R825 uygulaması](docs/raporlar/plugin-design-audit825/implementation/README.md) native örnekleri ve sınırları kaydeder.

Native select ve Electron dosya seçicisi bu mevcut Windows uygulamasının kabul edilen sahipleridir; popup geometrisi işletim sistemine aittir. Metin alanları görünür etiket, düğmeler klavye odağı taşır. İşlem beklerken aynı eylem tekrar başlatılmaz; durum alanı hata ve boş sonucu bildirir. Sonuç metni HTML olarak çalıştırılmaz.

### Medya iş akışlarında görsel hiyerarşi

Aktif görev alanında bir dolu amber ana eylem kullanılır; ikinciller sessiz yüzey/hayalet veya metin biçimindedir. Mod/seçili durum ana eylem değildir; medya modları nötr yüzey, aynı düzeydeki sayfa gezinmesi ince alt çizgi kullanır. Klavye odağı seçimden ayrıdır ve korunur. Yoğun küçük kabukta kütüphane araması ikonla açılır; Escape sorguyu silmeden kapatır, açık temizleme eylemi sorguyu temizler. Geniş pencerede doğrudan arama kalır.

Alan bütçesinde medya, okuma ve konuşma içeriği önceliklidir. İkincil araçlar mevcut açılır alanlarda kalır; gelişmiş kontroller kaldırılmaz veya kullanıcının özel ayarları sıfırlanmaz. Normal panel aralığı16px, ilişkili kontroller8–12px başlangıç ritmidir; yoğun toolbar ve metin okuma kendi belgeli varyantını kullanır. Görev kontrollerini gizlemek veya okunamayacak küçültmek alan kazanımı sayılmaz.

Native browser araç çubuğu kullanılabilir içerik genişliğine göre ses eylemlerini mevcut menüye taşır; adres metni okunur kalır. Menü proxy'leri ve mevcut klavye komutları tek işlev sahibini korur. PDF/kitapta ana sayfa, gezinme, okuma ve ses araçları aynı kısa kontrol ailesini paylaşır; uzun açıklama kendi kaydırıcısında, karar düğmeleri görünür satırdadır.

### İş akışı sözleşmesi

- Home'a dönüş aynı kaynağın dublajını silmez: video/ses duraklar, owned mute/hız bırakılır; WAV, mix/offset ve zaman haritası korunur. Geri dönüş kendiliğinden Play değildir; yeni kaynak/generation eski bağlantıyı kaldırır. Arka planda çeviri ilerler, odağı çalmaz.
- Asistanın başarısız aşamayı yeniden denemesi aynı işin ledger kanıtına bağlıdır; eski başarılı adımlar yeniden oynatılmaz. Devam yalnız yeni onay kartı hazırlar. Stopped iş devam izni değildir; kısmi ses tamamlanmış çıktı sayılmaz.
- Filmde kayıtlı analiz okunurken profil/evidence güncelliği current/stale/unknown olarak ayrılır. Kayıtlı örneği yeniden kullanmak kendiliğinden ağ/model isteği göndermez; örnek değişince eski kaydedilmemiş sonucun kontrolleri temizlenir. Ses metin denetimi verilen altyazıyı karşılaştırır, kaynak ASR doğruluğu veya insan doğallığı garantisi değildir.

- Medya araçları etkin sekme, gezinme nesli ve medya kimliğine bağlıdır. Gecikmiş sonuçlar farklı videoya uygulanmaz.
- Sessizlikte hızlanma, ses profili ve otomatik jenerik/özet atlama varsayılan kapalıdır. Kaydedilen açık tercih kullanıcı kararıdır.
- Altyazı aday puanı sürüm metadatası eşleşmesidir; zaman senkronunun garantisi veya yüzde güven değildir.
- OCR seçilen video karesindeki bölgeyi okur. Sahne şeridi kullanıcının seçtiği yerel video dosyasından çıkarılır. Anlamsal arama yüklü altyazıda yerel çokdilli model kullanır.
- OpenSubtitles alanları maskeli, oturumluk girişlerdir. API anahtarı argv, log, devir notu veya normal ayar dosyasına yazılmaz.
- Jenerik/özet aralıkları video veya açıkça seçilen dizi kapsamında saklanır. Video değişimi atlama durumunu sıfırlar; geriye sarma tekrarlı otomatik atlamayı bastırır.
- Senkron ve video önizlemesi açılır grubunda kullanıcı aynı sürümdeki yerel referans videoyu seçer. Dalga biçimi mevcut zamanlama editörünü kullanır; kare önizlemesi zaman çubuğunun hover/klavye etkileşimindedir.
- Parçalı senkron doğru zamanlı referans altyazıyla hesaplanır. Önce değişiklikler gösterilir; düşük kanıtlı sonuç uygulanamaz. Uygulama geri alınabilir taslağı değiştirir, dosyayı kendiliğinden yazmaz.
- Aralık OCR'ı en fazla 60 saniyeden düzenlenebilir zaman ve metin blokları çıkarır. SRT kaydı ayrı kullanıcı eylemidir. Jenerik analizi iki bölümün ilk 120 saniyesindeki ses benzerliğini önerir; kayıt otomatik atlamayı açmaz.
- Dizi çeviri profili site ve açık dizi adına bağlıdır. Yeni bölümde “Bölümü diziye bağla ve tercihleri yükle” mevcut profili korur; “kaydet” düzenlenen profili günceller. Değişiklik sonraki çeviriye uygulanır. Terim kontrolü kaynak/çeviri rollerini ve ayrı zaman dönüşümlerini izler, metni kendiliğinden düzeltmez.
- Film ve dizi arşivi ana başlıktan ve oynatıcıdaki Arşiv eyleminden açılan native dialog'dur. Filmler, Diziler ve İzlenecekler aynı katalog üzerinde filtrelenir; mevcut izleme geçmişi ayrı kalır. Eser dosyasız var olabilir; oynatma için yerel dosya veya browser bağlantısı gerekir.
- Afişli kartlar sabit 2:3 görüntü alanı taşır; afişler görünür oldukça küçültülmüş olarak yüklenir. Eksik afiş bir boş durumdur. Katalog grafit/amber ve açık tema token'larını kullanır; kendi modal kaydırma alanı vardır. Modal açıldığında native browser yüzeyi mevcut occlusion sözleşmesiyle gizlenir.
- Eser ve bölüm düzenleme açık kaydetme kullanır. Silme iki adımlıdır; yalnız katalog kaydı silinir, medya dosyası ve izleme geçmişi kalır. İzlenecekler bölümünden yeni kayıt başlangıçta İzlenecek durumundadır. Bölüm sırası sezon/numaraya göre, sıradaki öneri kaynaklı ve tamamlanmamış ilk bölümdür.
- nMDB içe aktarımı salt okunur önizleme → seçim → uygula akışıdır. Kimlik çakışmaları ve atlamalar gösterilir; tekrar içe aktarım mevcut izleme durumu, favori, kaynak ve puanları ezmez. İthal puanlar kaynak değerleridir; canlı sağlayıcı doğrulaması veya otomatik film önerisi değildir.

### Browser araçlarının gezinmesi

- Yan panelin sekme çubuğu browser modunda en üstte kalır. **Araçlar** yalnız browser modunda görünür; Altyazılar, AI ve Kütüphane ile aynı `setSideTab` ve klavye gezinmesi sahibini kullanır.
- Araçlar sekmesinde mini oynatıcı/ASS hızlı işlemleri ve dokuz native açılır grup vardır. Senkron, altyazı bulma, anlam arama, kare OCR, sahne şeridi, atlama aralıkları, dizi bağlamı, aralık analizi ve konuşma ayırma ayrı açılır. Gizleme DOM'u yeniden kurmaz; alan değerleri ve devam eden iş durumu korunur.
- Araçların tek ana kaydırma sahibi `.bf-workspace` alanıdır; sonuç listeleri mevcut sınırlı kaydırmasını korur. Altyazılar sekmesinde araç formları yer kaplamaz. Dar pencerede mevcut panel devralma ve Sayfaya dön eylemi kullanılır.
- Yerel oynatıcıya geçerken açık Araçlar sekmesi Altyazılar'a döner. Yeni tercih/ayar şeması yoktur; otomatik hızlanma/atlama varsayılanları değişmez.
- Gruplar, düğmeler ve formlar mevcut renk/font token'larını kullanır; yeni font, CDN veya uygulama bağımlılığı eklenmez. Superdesign önizlemesi uygulamadan ayrı, statik inceleme materyalidir; uygulama IPC eylemlerini çalıştırmaz.

### Browser üst durum alanı

Altyazı sinyali normal genişlikte iki kompakt satır kullanır: yakalama/sayfa durumu üstte, hazır blok veya hata durumu ve dosya ayrıntısı altta. Dosya ayrıntısı açılırsa tüm genişliği kullanır; hata metni kısaltılmaz ve eylemi gizlenmez. 650 px altındaki browser konteynerinde sıralı düzene geçilir. Önceki sinyal metni yalnız Ayrıntılar açıkken görünür. Durum metni açık/koyu tema için `--text-dim`, hata `--danger`, bağlantı bekleme `--warning` kullanır.

## Verification

### Katalog otomasyonu ve çalışma paketi

Klasör tarama mevcut içe aktarma önizlemesi/seçim sahibini kullanır; dosyaları yeniden adlandırmaz ve arka planda kendiliğinden çalışmaz. TMDB eşleştirme ekranı katalog ayrıntısından açılır. Yerel dolu alanlar başlangıçta seçilmez; değiştirmek açık seçim gerektirir. Kişisel puan/favori/izleme durumu metadata kapsamına girmez. Maskeli TMDB okuma belirteci katalog kapanınca temizlenir. TMDB sağlayıcı atfı ekranın altındadır.

Takvim katalog gezinmesinin dördüncü bölümüdür. Yaklaşan, yayınlanmış/izlenmemiş, kaynağı eksik ve tarihi açıklanmamış bölümler ayrı gruplardır. Tarih alanı ürünün Türkçe YYYY-AA-GG metin sözleşmesini kullanır; OS tarih popup'ı yoktur. Metadata, kodlama ve model seçimleri mevcut native select sözleşmesini izler.

Çalışma paketi ekranı dışa aktarma ve önizlemeli geri yükleme sunar. Video dahil etme başlangıçta kapalıdır. Son eylem kayıt değiştirme ve yeniden başlatmayı açıkça söyler; Vazgeç önce gelir. Katalog, kayıtlı altyazı dosyaları/düzeltmeleri, browser sekme senkronu, izleme geçmişi ve posterler taşınır. Anahtarlar/cookie oturumları, aktif kuyruk ve genel uygulama ayarları bu paketin kapsamında değildir. Genel ayar yedeği mevcut Ayarlar dışa aktarımıdır.

Araçlar alanında dokuz açılır grup vardır. Yeni konuşma ayırma grubu aynı `.bf-workspace` kaydırıcısındadır; yalnız tıklamayla başlar, 60 saniye sınırı ve model/dil seçimi sunar. CPU üzerinde ayrı ortamda çalışır, sonuç SRT metnidir ve özgün videoya offset uygulanır; mevcut altyazıyı otomatik değiştirmez. ASS hızlı eylemleri ayrı font ve MKV font seçenekleri içerir. Kodlama kurtarma önizlemesi özgün dosyayı koruyarak yeni kopyayı mevcut altyazı seçim sahibine bağlar.

Değişen akışlar ayrı Electron test profillerinde sınanır. ASS, küçük oynatıcı ve ürün entegrasyonu için `tests/electron-browser-*.smoke.js` dosyaları; ses, tercih ve kayıt kararları için ilgili hedefli testler kullanılır. Canlı OpenSubtitles hesabı, tüm siteler ve DRM başarısı kontrollü testlerden çıkarılmaz.


### Ortak tema sahipliği — R827

Grafit basamaklar `#111215 → #191b1f → #24272d → #2d3037`; ana metin `#f1f0ed`, ikincil `#c1c4cb`, pasif `#b0b4bd`. Sıcak amber `#d5a35c` korunur. Renk kopyaları medya/browser kapsayıcılarında yeniden tanımlanmaz. Asistan bağımsız WebContentsView olduğu için aynı paleti kendi HTML girişinde yükler; ana sayfadan CSS mirası aldığı varsayılmaz. Açık tema mevcut sıcak değerleri kullanır. Video üstü kontrol ve TV kontrast varyantları ayrı, belgeli istisnadır. `design-system/whisper-local-theme.css` eski taşınabilir v1.1 örneğidir, çalışma zamanı kaynağı değildir.

Günlük ikincil düğmeler8px, arama10px, panel16px ailesini izler; mod seçicisi ve sohbet balonu bağlama özgü şekillerini korur. Genel ikincil hover nötrdür; tüm butonları amberle çerçevelemez. Kapalı asistan balonu nötr yüzeydir; Send/işin ana eylemi vurguyu taşır. Hero'nun okunabilirlik örtüsü sabit eski siyah yerine güncel sayfa zeminiyle karışır. Klavye odağı silinmez; native testin odak halkası seçim stili sanılıp kaldırılmaz.

Hareket sahibi `ui-motion.css` ve `ui-motion.js`: panel160ms/seyahat yok; bölüm180ms/4px; kontrol renk150ms, basış100ms/.985; ince pointer'da kapak2px yükselir. WAAPI bu CSS rollerini doğrulayarak okur; eksik/geçersiz değerler güvenli varsayılana döner. Tekrarlı giriş eski hareketi iptal edip mevcut görünümden devam eder. Reduced-motion ve pagehide etkin animasyonu iptal eder; gezinme animasyonu beklemez. Bu süreler ürün kararıdır, FPS/performans ölçümü iddiası değildir.

Hesapsız tema yöntemi ve gerçek önce/sonra kanıtı [R827](docs/raporlar/BROWSER_BUG_REPORT_827.md) altında saklanır. Statik üretilmiş tasarım panosu çalışan uygulama kanıtı değildir; native görüntüler ayrı tutulur. Yeni dış hesap, CDN, font, paket veya ayar şeması eklenmez.
