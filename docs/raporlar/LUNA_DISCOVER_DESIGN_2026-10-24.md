# Keşfet ve Luna tasarım denetimi

Kullanıcı tasarımın öncelikli olduğunu ve Luna'daki Keşfet'in eksik kaldığını söyledi. Sadece menü öğesi eklenmedi: anahtarsız gerçek film/dizi kataloğu, ayrıntı, izlenecek listesine ekleme ve gerekçeli tür önerileri uygulandı. Önceki müzik/kitap/radyo/podcast/CSV özellikleri ve Whisper browser/altyazı/dublaj motorları korunur.

## Çalışan Keşfet

Resmî [Cinemeta manifesti](https://v3-cinemeta.strem.io/manifest.json) `com.linvo.cinemeta` kimliğini, film/dizi, popüler/yıl/yüksek puan kataloglarını ve genre/search/skip sözleşmesini yayımlar. Bu tur gerçek uçlardan veri okundu; başka projenin gömülü API anahtarı kopyalanmadı. Kullanıcı hesabı/API anahtarı gerekmez. Ağ yalnız Keşfet açıldığında veya kullanıcı filtrelediğinde kullanılır; normal başlangıç gizlice katalog indirmez.

- Yeni ve popüler / Sana özel bölümleri.
- Film/dizi, tür, yıl, popüler/yüksek puan, arama ve artan sayfalama. En fazla 300 görünür kayıt; katalog yanıtları 4MB/15sn ile sınırlı.
- Afişli kartlar; yıl/varsa IMDb puanı; yapım ayrıntısında açıklama, oyuncular, türler ve süre. Kaynak metinler kullanıcı arayüzü sözlüğüne sokulmaz; Türkçe özet garantisi verilmez.
- Ayrıntıdan İzleneceklere ekle mevcut katalogda planned kayıt oluşturur; mevcut IMDb kimlikli kaydı çoğaltmaz, kullanıcının puan/kaynaklarını ezmez. Video indirilmez; kendi dosyası sonradan mevcut katalogda bağlanır.
- Afiş servisi çalışırsa kayıt için yerel afiş kaydedilir. Afiş indirilemese de metadata kaydı yapılır; sahte kapak üretilmez.
- Sana özel, mevcut favori/kişisel puanlı yapımların bilinen türlerinden en fazla üç tür listesi kullanır; kütüphanedeki yapımları dışlar ve her kartta hangi beğeniden geldiğini gösterir. AI/arkadaş uyumu ya da tüm Luna öneri algoritması taşındı iddiası yok.
- Hata/boş/yükleniyor/yeniden deneme durumları görünür. Ağ hatası katalog verisini silmez. Önceki görünümden geç gelen yanıt yeni sayfayı ezmez.

## Canlı denemede bulunan somut entegrasyon sorunu

İlk canlı Electron denemesi fixture geçtiği halde listeyi açamadı. Doğrudan ağ incelemesi katalog uçlarının `v3-cinemeta.strem.io` → `cinemeta-catalogs.strem.io` şeklinde meşru HTTP307 yönlendirdiğini gösterdi. İlk sürüm bütün yönlendirmeleri reddediyordu. Düzeltme: en fazla dört adım; yalnız HTTPS ve bu iki resmî host; credentials yok; toplam 15sn sınırı. Harici/localhost yönlendirmesi daha istek yapılmadan reddedilir. Regresyonu ayrıca test edildi. Afiş indirmede de yalnız bilinen görsel hostları ve 2MB/10sn sınırı vardır.

İlk yalnız genre URL'si bu ağda 403 verebildi; sağlayıcının normal sayfalı biçimi her istekte açık `skip=0` dahil kullanılır. Bu önlem bütün internet/servis hatalarının ortadan kalktığı anlamına gelmez; UI hata/tekrar yolunu korur.

## Görsel denetim — full, sınırlı kapsam

Kapsam: yeni medya ana sayfası, Keşfet listesi/ayrıntısı ve ortak yeni medya diyalogları. Teknoloji Electron + özgün DOM/vanilla CSS; ikinci stil sistemi eklenmedi. Önceki Whisper stüdyo/browser bütün ekranları bu tur yeniden tasarlanmadı/denetlenmedi.

| Kategori | İncelenen kanıt | Sonuç |
|---|---|---|
| Tipografi | Luna kaynak aileleri, yerel fontlar, TR karakterli computed style/font-load kontrolü, 1920/940/680 ekranlar | IBM Plex Sans/Sora gerçekten yüklendi; başlık sarma iyileştirildi |
| Yüzeyler | Afiş listesi, ayrıntı, filtreler, medya modal/dock CSS ve ekranlar | Tutarlı koyu/turuncu yüzey; ufak hit alanları büyütüldü |
| Animasyon | Yeni CSS ve yükleme/hata durumları | Yeni özel animasyon/transition-all yok; bu nedenle %10 hızla özel animasyon testi uygulanmadı |
| İkonlar | Marka SVG currentColor, modal kapatma ve klavye odağı | Yeni ikon kütüphanesi yok; kapatma erişilebilir adı ve 40px alanı kontrol edildi |
| Performans | Sayfalama/tekilleştirme, 24 yanıt önbelleği, altı eşzamanlı ağ sınırı, lazy afiş/content-visibility | Kontroller geçti; uzun süreli RAM/GPU soak yapılmadı |

### Bulgular ve uygulanan değişiklikler

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| MEDIUM | `media-home.css`, `media-discovery.css` | Kaynak Luna fontları yerine sistem fontu | Yerel IBM Plex Sans 400/500/600 ve Sora600, Latin + Latin Extended | Pinned Luna görünümüne uyum ve Türkçe glifler |
| MEDIUM | Yeni medya diyalogları | Modal/dock eski stüdyo paletini miras alıyor | Yalnız yeni `media-surface` kapsamına Luna token'ları | Ana sayfa–ayrıntı tutarlılığı; eski browser paleti korunur |
| MEDIUM | `.md-close`, medya düğmeleri | Bazı hedefler 35–38px | En az 40px | Yoğun masaüstü arayüzünde hedef alanı |
| LOW | Başlıklar/kısa açıklamalar | Varsayılan satır dağılımı | Başlık balance, kısa açıklama pretty | Son satırda tek kelimeyi azaltma |
| LOW | Afişler | Görsel sınırı arka planda kaybolabiliyor | Koyu temada saf beyaz %10, açıkta saf siyah %10 iç outline | Görsel kenarının temiz ayrılması |
| MEDIUM | Keşfet sekme/mod düğmeleri | Seçili olmayan bazı kontrollerde hover işareti yok | Renk/zemin geri bildirimi | Tıklanabilirliği görünür kılma; gerçek Electron pointer girdisiyle ölçüldü |

### Düşünülen ve reddedilenler

| Location | Candidate | Rejected because |
|---|---|---|
| Sekmeler/kartlar | Her etkileşimde animasyon/scale ve stagger | Medya aracında sık tekrar eden harekete gerek yok; kullanıcının Luna düzeni daha önemli |
| Eski browser/stüdyo | Yeni paleti global `:root` üstüne yazmak | Kullanıcının mevcut araçlarını/görünümünü bozma riski; yeni yüzeylere scope edildi |
| Playwright kurulumu | Yeni Electron paketi yükleyerek test düzeneğini değiştirmek | Mevcut Castlabs sürümü/DRM korunmalı; çalışan gerçek Electron harness bu tur yeterli |

### Doğrulama ve karar

- Dört discovery Node testi: kimlik/görsel origin normalizasyonu, cache/route/personal/duplicate koruması, HTTP/büyük yanıt reddi, resmî yönlendirme kabulü/harici yönlendirme reddi — geçti.
- Son hedefli koşu: discovery + home-model + preload-sandbox, runner9 sonuç geçti. Önceki katalog hizmet testi de bu tur geçti.
- Fixture Electron: liste/ayrıntı/ekleme, tür sayfası ve film/dizi dönüşü, yıl filtresi, sayfa sonu, yinelenen kayıt reddi, sağlayıcı hatası ve geri dönüş, kişisel gerekçe, TR/EN/açık/koyu/940/680 — geçti. Gerçek Electron mouseMove hover ve Tab keyboard focus kontrolleri geçti. Font check Türkçe `İstanbul şğ` / `Keşfet` ile yapıldı.
- **Canlı Electron:** gerçek Cinemeta verisiyle liste/ayrıntı/izleneceklere ekleme/kişisel öneri ve dar görünüm testi geçti. Son kaynak `5787c1cc` üzerinde `WHISPER_DISCOVERY_LIVE=1 electron tests/electron-media-discovery.smoke.js` geçti. Bu, ücretli LLM/YouTube/GPU veya bütün içeriklerin doğrulandığı anlamına gelmez.
- Son canlı ekranlar ignored `.uiprev/media-discovery/1792832505561-1280-live/`; fixture son ekranlar `.uiprev/media-discovery/1792832466195-12444-fixture/`. Kişisel profil kullanılmadı. Canlı afişli ekranlar Git'e eklenmedi. Ekranlar liste/ayrıntı/kişisel/dar durumlarda incelendi; ölçüler sayfa taşması göstermedi. Uzak afişler yavaş yüklenebilir/yok olabilir; metadata bütünlüğüyle karıştırılmaz.
- Syntax ve `git diff --check` geçti. Tam paket ve CI sonucu beklenmedi. Önceki nottaki bağımsız katalog smoke takılması bu tur çözülmüş gösterilmedi.

**Verdict: Approve — yalnız yukarıdaki yeni medya/Keşfet kapsamı.** Doğrulanmayanlar: gerçek dokunmatik ekran, bütün mevcut browser sayfaları, uzun süreli animasyon/GPU soak, tüm sağlayıcı filtrelerinin canlı kombinasyonları ve bütün diller. Kapsam içinde açık yüksek bulgu bırakılmadı.

## Yazı tipi lisansları

Luna'nın kaynakta kullandığı aileler, mevcut yerel resmî `@fontsource/ibm-plex-sans` ve `@fontsource/sora` **5.3.0** paketlerinden değişmeden kopyalandı. Sekiz WOFF2 alt kümesi + tam SIL OFL1.1 lisansları yaklaşık151KB. Yeni npm bağımlılığı/lock değişikliği yok; CDN gerekmez. [Font kaynak/lisans notu](../../src/renderer/fonts/media/README.md). Eski browser/stüdyo fontu değiştirilmez.

## Kullanıcının önerdiği beceriler

- `frontend-design`, `luna-ui-design`, `web-design-guidelines`: bu işte zaten uygulanıyor.
- [Make Interfaces Feel Better](https://github.com/jakubkrehel/make-interfaces-feel-better): MIT; sabit commit `35545ea1512ad59fa463e6b1f95ca9c052981fe6` resmi Skill Installer ile kullanıcı beceri klasörüne kuruldu, mevcut beceriler ezilmedi. Yönergeler okunup yukarıdaki polish kontrolünde uygulandı. Sonraki kullanıcı turunda kurulu beceri olarak listelenebilir.
- [Impeccable](https://github.com/pbakaus/impeccable): Apache-2.0. Resmî kaynak/yönerge `936867543ac2576920d663cc9803597f6044f3ac` incelendi; bu tur kurulmadı ve otomatik hook/binary çalıştırılmadı. Kullanıldı gibi gösterilmez.
- [Playwright Interactive](https://github.com/openai/skills/tree/main/skills/.curated/playwright-interactive): resmî açık kaynak beceri incelendi; bu tur kurulmadı/çalıştırılmadı. Kendi js_repl/Playwright önkoşulları vardır; mevcut imzalı Electron sürümünü, sandbox/global ayarlarını değiştirmek yerine çalışan test harness'i kullanıldı.

Becerilerin açık kaynak dosyalarını kullanmak için ayrı bir lisans ücreti gerekmez. Kullanılan model/harici API ücretleri ve yerel çalışma kaynakları bundan ayrıdır. Bu tur beceri araştırması için ücretli API çağrısı yapılmadı.
