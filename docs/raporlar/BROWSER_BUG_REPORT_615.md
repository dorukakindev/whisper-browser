# Rapor 615 — Ortak hareket ve etkileşim cilası

Repo: https://github.com/dorukakindev/whisper-browser. Dal: `codex/ui-polish615`.
Başlangıç HEAD: `048a84265d47fa07da515b86653b69f4fc9e5045`.
Bitiş ürün commit'i: `fa2797cf8e59c5dfacd24b76a048f2c34c36b3f5`.

## Tasarım yönü ve kapsam

Mevcut Whisper Browser/Luna esintili tema korunur: mevcut mürekkep/grafit ve açık tema yüzeyleri, IBM Plex Sans/Sora, mevcut SVG ikonlar ve vurgu token'ları. Yeni palet, font, framework veya animasyon bağımlılığı eklenmedi. Luna'nın yeni beta kodunu içeri alma çalışması değildir; mevcut uygulamanın ortak etkileşim katmanı geliştirildi.

`luna-ui-design`, `frontend-design`, `make-interfaces-feel-better` ve `web-design-guidelines` rehberleri uygulandı. [Güncel arayüz kılavuzu](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) hareket azaltma, açık geçiş özellikleri ve görünür odak için kontrol kaynağıdır. Kapsam: ana sayfa/keşfet, kartlar, öne çıkan içerik, ayar bölümleri, ortak menü/modal girişleri, asistan ve bitişik PDF/kitap deneyimi. Denetim modu: full; stil sistemi mevcut düz CSS + tarayıcının Web Animations API'sidir.

## Somut değişiklikler

| Önem | Konum | Önce | Sonra | Kullanıcıya etkisi |
|---|---|---|---|---|
| Orta | `ui-motion.js`, `media-home.js` | Sayfa/bölüm değişimi aniden geliyordu | 180 ms, 6 px ve opaklık geçişi; önceki hareket iptal edilir | Hızlı gezinmede kuyruk veya gecikme birikmez |
| Orta | `app-settings-ui.js` | Ayar alt sayfası sert yenileniyordu | Aynı bölüm geçişi, ilk modal açılışından ayrı | Bölüm değişimi anlaşılır, form boyutu/fokus akışı korunur |
| Düşük | `media-home.js` | Öne çıkan içerik metni doğrudan değişiyordu | Seçim değişiminde kısa metin geçişi | Başlık değişimi daha akıcı görünür; veri/oynatma akışı aynı |
| Orta | `ui-motion.css` | Düğme, form ve kart durumları farklı süreler kullanıyordu | 100/150/180 ms token'ları, sınırlı renk/gölge/scale geçişleri | Tutarlı hover, basma ve odak geri bildirimi |
| Orta | `media-discovery.css` | Paint containment, yeni hover hareketinin kenarını kesiyordu | 24 px overflow clip payı, content-visibility korunur | Afiş/gölge kesilmez; büyük liste optimizasyonu kaldırılmaz |
| Orta | `media-discovery-ui.js`, `ui-motion.css` | İlk istek sırasında grid boş kalıyordu | Altı dekoratif afiş iskeleti ve grid aria-busy durumu | Yükleniyor durumu belli; hata/başarıda iskelet temizlenir |
| Orta | `assistant-overlay.html/js`, `ui-motion.css` | Asistan açılışı aniydi; üst simgeler küçüktü | 160 ms opaklık girişi, 40 px üst kontroller, en az36 px form düğmeleri | Panel yerini değiştirmeden daha rahat etkileşim |
| Orta | `ui-motion.js/css` | Bu yeni hareketler için ortak azaltma/iptal sözleşmesi yoktu | Reduced-motion tercihi, tercih değişiminde iptal ve pagehide temizliği | Hareket istemeyen kullanıcıya zorlanmaz |
| Düşük | `ui-motion.css` | Başlık/metin kırılımı ve güncellenen sayılar tutarsızdı | Seçili başlıklarda balance, metinlerde pretty, sürelerde tabular-nums | Uzun başlıklar daha dengeli; sayılar daha sabit |

Girişler kısa tutuldu. `close()`, hidden sınıfı, odak dönüşü ve native webview görünürlüğü animasyon bitimine bağlanmadı. Çıkışta native yüzeyin yanlış zamanda görünmesi riskini artıracak gecikmeli modal kapatma eklenmedi. Her açılır panelin bütün kapanış karelerinin artık animasyonlu olduğu iddia edilmez. Başlangıç yüklemesi, arama tuşları veya her akış mesajı için toplu stagger yok. Sürekli shimmer/bounce/blur döngüsü yok. Kart hover'ı yalnız ince işaretçi/hover cihazında çalışır.

## Beş tasarım alanında inceleme

| Alan | İncelenen kanıt | Sonuç |
|---|---|---|
| Tipografi | Açık/koyu ayar, keşfet ve asistan kareleri; uzun başlık kuralları | Mevcut fontlar korundu; seçili kırılımlar iyileşti |
| Yüzeyler | Native ayarlar/kartlar; fixture afişli hover ve öncesi stil katmanı karşılaştırması | Gölge/odak uyumu ve clipping düzeltildi |
| Animasyon | Native başlangıç/bitiş değerleri, hızlı rota değişimi, emüle reduced-motion | 180 ms sonunda opaklık1, translate none ve0 animasyon; hızlı değişimde en fazla1 |
| İkonlar | Mevcut SVG/kapat/genişlet kontrolleri ve asistan görüntüleri | Yeni ikon seti eklenmedi; üst hedefler40 px |
| Performans | Sonlu opacity/translate animasyonları; content-visibility ve iptal temizliği | Yeni bağımlılık veya kalıcı will-change yok; FPS/GPU profil ölçümü yapılmadı |

## Doğrulama

- `node --test tests/ui-motion.test.js tests/media-home-model.test.js tests/player-chrome-css.test.js tests/css-hardcoded-colors.test.js`: **11/11 geçti**. Yeni üç test hızlı tekrar iptali, tercih değişimi ve yaşam döngüsü içindir; CSS satırı kopyalayan test değildir. Renk sınırı gevşetilmedi.
- Değişen beş JS dosyasının `node --check` kontrolleri geçti. `git diff --check` geçti.
- `node tools/ui-smoke.mjs --strict --out tmp/ui615-interaction`: **83 tıklama,0 bulgu**. Ortak kontrollerin işlev testi; bütün uygulamanın kusursuzluk kanıtı değil.
- Ayrı Windows Electron profili: 1280/940 × açık/koyu dört durumda sayfa hareketi başlangıçta opacity0,55/translate6 px/1 animasyon,230 ms sonra opacity1/translate none/0 animasyon. Hızlı ardışık gezinmede1 animasyon. Ayar açma/alt bölüm/kapatma geçti; kart hover görüntüleri alındı ve incelendi. Chromium reduced-motion emülasyonunda0 animasyon. Bu, gerçek işletim sistemi ayar panelini değiştirme testi değildir.
- Edge renderer fixture'ı: TR/koyu/1280 ve EN/açık/940; altı iskelet ve aria-busy=true, başarı/hata sonrası0 iskelet ve aria-busy=false, hover translate=-3 px. Console hatası0. Afışlı son görüntü ve yeni stil katmanı kapalı karşılaştırma incelendi; gerçek TMDB hesabı kullanılmadı.
- Asistan: TR/EN × açık/koyu ×420/700 px, konuşma/araçlar/hata24 görüntü. Kontakt sayfaları ve dar hata görünümü incelendi; sekiz konfigürasyonda Enter→send. API istekleri test action kaydıdır, model yanıtı değildir.
- `electron.exe tests/electron-pdf-reader-experience.smoke.js`: sonuç `ok:true`; PDF/TXT, sayfa aralığı, yerel kontrollü WAV ile takip, asistan kaynak bağlamı ve kitap üretim alanı korundu. Kontakt sayfaları incelendi. Gerçek model/GPU üretimi değil.

Ham kanıtlar kişisel veri içermeyen test profillerinde ve Git dışında: `tmp/ui615/`, `.uiprev/motion615-1793034668862/`, `.uiprev/pdf-reader547-1793034836923/`. Ekran görüntüsü animasyonun tek başına akıcılık ölçümü değildir; zamanlı değerler ve iptal kontrolleri ayrıca kullanıldı. Önceki rapor614'ün bütün geniş matrisini yeniden koştum iddiası yok.

## Dosyalar, Windows ve teslim sınırları

Yeni `src/renderer/ui-motion.js/css` ana renderer ve ayrı asistan HTML'sinde yerel olarak yüklenir; CSP self kuralı korunur. Diğer değişen ürün dosyaları tablodadır; `tests/ui-motion.test.js` yeni kısa regresyon kontrolüdür. Yeni kurulum, bağımlılık, şema veya Python/IPC değişikliği yok. UTF-8/Türkçe içerik ve dar pencere görüntüleri incelendi.

`start.bat` değişmedi; kişisel uygulama kapatılmadı. Native test ayrı Electron profiliyle yapıldı; normal start.bat/CUDA açılışı, gerçek YouTube/DRM/Cloudflare/OAuth ve canlı sağlayıcı bu turun kabulü değildir. Tam npm test/uzun CI beklenmedi; görülmeyen sonuç başarılı ilan edilmedi. Ana sürüme normal PR ile teslim edilir; kişisel dosyalar korunur. Yeni CSS ve modülün görünmesi için açık uygulamanın normal yeniden açılması gerekir.
