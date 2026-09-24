# R120 — Browser'ı "premium tarayıcı" seviyesine taşıma: denetim, tasarım hedefi ve düzeltme planı

**Taban:** `d1a02b1` · **Tarih:** 2026-09-24

**Yöntem**
- Uygulama gerçek Electron'da (castlabs 43.2, Xvfb) açıldı.
- Yerel sayfa görünümü (`WebContentsView`) ayrı yakalanıp pencere görüntüsüyle birleştirildi. Böylece ekran görüntüleri kullanıcının gördüğüyle birebir.
- Test sayfaları: gerçek videolu bir "video sitesi", uzun bir makale sayfası, HTTP 502 dönen bir sayfa. Altı sekme, açık menüler ve omnibox da denendi.

## 1. Ölçülen durum: neden "premium" hissettirmiyor?

| Ölçüt | Whisper Browser (1440×900) | Chrome / Edge / Arc hedefi |
| --- | --- | --- |
| Sayfa içeriğinden önceki arayüz yüksekliği | **~230 px (%26)**: üst şerit 50 + araç çubuğu 45 + altyazı şeridi 95 + boş başlık bandı ~40 | **80–90 px (%10)** |
| Üst sağdaki kontrol sayısı | 7 (kalkan, Player/Browser, Media library, EN, panel, ⋯, ayarlar) | 1–2 (profil, menü) |
| Araç çubuğu kontrol sayısı (adres hariç) | 6 çerçeveli kutu (geri, ileri, yenile, Altyazı + ok, Çeviri, ok, ⋯) | 3 hayalet ikon + 1–2 bağlamsal düğme |
| Menü açılınca sayfa | **Tamamen siyaha dönüyordu** | Sayfa görünür kalır |
| "Daha fazla" menüsü | 20+ düz öğe, 900 px pencerede **alttan taşıp kesiliyordu** | Gruplu, alt menülü, ekrana sığar |
| Sekme görünümü | Favicon yok, sert kesilen başlık, her sekmede × | Favicon, soluklaşan başlık, × yalnız üzerine gelince |
| Hata sayfası | Boş siyah alan + şeritte yanlış teşhis | Tam sayfa hata ekranı + "Yeniden dene" |
| Bağlam | Makalede ve yeni sekmede "altyazı aranıyor" ile "bu video için altyazı yok" | Yalnız ilgili yerde görünür |

**Temel teşhis:** Tasarım dili iyi (koyu yüzeyler, amber vurgu, tutarlı tipografi). Premium hissi bozan şey **yoğunluk ve bağlamsızlık**:

- Her özellik her zaman görünür.
- Her şey çerçeveli bir kutu.
- Tarayıcının asıl işi olan sayfa ekranın yalnız %74'ünü alıyor.

Premium tarayıcılar tersini yapar: arayüz geri çekilir, yalnız işe yarayacağı anda öne çıkar.

## 2. Tasarım ilkeleri (bundan sonraki her değişiklik için ölçüt)

1. **İçerik önce.** Hedef arayüz yüksekliği ≤ 88 px (sekme 38 + araç çubuğu 44 + 6).
2. **Bağlamsal görünürlük.** Altyazı ve çeviri araçları yalnız sayfada video veya iz varken görünür; hata ve uyarı her zaman görünür.
3. **Hayalet varsayılan.** İkon düğmeleri çerçevesiz 32 px. Çerçeve ve dolgu yalnız birincil eylemde ve aktif durumda.
4. **Tek vurgu.** Amber yalnız birincil eylem, aktif sekme işareti ve odak için. İkincil durumlar nötr.
5. **Hareket.** Menü ve paneller 140 ms ease-out, `prefers-reduced-motion`'a saygı.
6. **Sayfa asla kaybolmaz.** Menü, panel veya diyalog açıkken sayfa donmuş kare olarak görünür kalır.

## 3. Bu turda düzeltilenler (R120 paketi)

| # | Tür | Sorun | Çözüm | Doğrulama |
| --- | --- | --- | --- | --- |
| P1 | Tasarım (kritik) | Herhangi bir menü, omnibox önerisi veya panel açılınca web sayfası siyaha dönüyordu (Electron'da HTML, yerel görünümün altında kalır; kod görünümü gizliyordu) | Gizlemeden önce etkin sekmenin karesi alınıp (`browser:snapshotActive`, JPEG 82) sayfa yuvasına boyanıyor; kapanınca temizleniyor. Hızlı aç/kapa yarışları sıra numarasıyla eleniyor. | Electron: menü açıkken sayfa görünür |
| P2 | Tasarım | Yeni sekmede ve makalede iki satırlık altyazı şeridi ~95 px çalıyordu | Sayfada medya, iz veya cue yoksa şerit sessize alınıyor. Öncelik ≥ 25 bir mesaj (hata, uyarı, aksiyon) 20 sn boyunca şeridi geri getiriyor. | Yeni sekme ve makale: şerit yok; 502: şerit görünür |
| P3 | Bug | "Daha fazla" menüsü alttan taşıyor, son öğeler kesiliyordu | `max-height: min(680px, 100vh − 150px)` ve menü içinde kaydırma | Electron: menü sığıyor |
| B1 | Bug | Sayfada altyazı izi bulunmuşken (araç çubuğunda "· 1") panel "Bu video için altyazı yok" diyordu; videosuz sayfada "Whisper ile oluştur" çağrısı anlamsızdı | Boş durum üç bağlam ayırıyor: iz var ("Sayfada altyazı izi bulundu · N" + "Altyazı izini seç"), video yok ("Bu sayfada video yok", eylem yok), video var iz yok (eski davranış) | Electron: üç durum doğru |
| B2 | Bug | Sıradan bir sayfanın HTTP 5xx yanıtı "Oynatma veya **lisans** servisi hatası" olarak gösteriliyor, kullanıcıyı DRM'e yönlendiriyordu | Ana belge 5xx için ayrı teşhis: "Site sunucusu hatası… bu bir oynatma veya DRM sorunu değildir". Belge 401/403 sözleşmesine dokunulmadı (mevcut testlerde tanımlı). | Birim test + Electron |
| B3 | i18n | İngilizce arayüzde "Yeni sekme", "Kaynak altyazı hazır…", "Çevir ve göster" | Etkin dile göre yazılıyor | Electron: "New tab", "Translate and show" |

**Testler**
- Yeni: `tests/browser-report120-regressions.test.js` (6 test).
- Etkilenen mevcut testler geçiyor: `audit-followup`, `browser-playback-diagnostics`, `ui-locale`, `player-ui` (148/148).

## 4. Hedef tasarım: yüzey yüzey

### 4.1 Üst çerçeve: tek satırda sekmeler + uygulama kontrolleri (en büyük kazanç)

**Şu an**
- Satır 1'de: geri/çık oku, sekmeler, reklam kalkanı, Player/Browser anahtarı, Media library, dil seçici, panel, ⋯ ve ayarlar.
- Linux'ta üstte ayrıca ~40 px boş başlık bandı var.

**Hedef (Chrome/Edge düzeni)**
- Sekmeler **başlık çubuğunun içinde** (`titleBarOverlay` alanı sürükleme bölgesi olarak kalır; sekmeler `-webkit-app-region: no-drag`). Windows'ta pencere kontrolleri sağda kalır.
- Sol uç: uygulama logosu. Tıklayınca Oynatıcı / Browser / Media library geçişi (bugünkü segment kontrol ve Media library düğmesi buraya taşınır).
- Sağ uç: tek profil/uygulama menüsü. Dil, ayarlar, görev merkezi ve PDF bunun içinde.
- Reklam kalkanı adres çubuğunun **içine** taşınır (site izinleri çipinin yanına), Chrome'daki site bilgisi gibi.
- "Oynatıcıdan çık" oku kaldırılır; geri dönüş logo menüsünden ve `Esc`/`Backspace` ile.

**Kabul kriteri:** 1440×900'de sayfa içeriği y ≤ 90 px'ten başlar.
**Dosyalar:** `index.html` (player-head), `styles.css` (browser-tabbar, player-head), `main.js` (`titleBarOverlay` yüksekliği 38).

### 4.2 Sekmeler

| Özellik | Şu an | Hedef |
| --- | --- | --- |
| Şekil | Alt çizgili düz kutu | Aktif sekme araç çubuğu yüzeyiyle birleşir (üst köşeler 10 px, alt köşelerde ters kavis); pasifler şeffaf, üzerine gelince `--bg-2` |
| Favicon | Yok | 16 px favicon (`page-favicon-updated` olayından); yoksa host'un ilk harfiyle renkli avatar |
| Başlık | Sert kesiliyor | Son 24 px'te `mask-image` ile soluklaşma |
| × düğmesi | Her sekmede sürekli | Aktif sekmede ve üzerine gelince; genişlik < 110 px ise yalnız aktifte |
| Genişlik | Sabit ~150 px | `min 72 / max 220`, eşit dağıtım (bugünkü taşma kaydırması korunur) |
| Durum | — | Yükleniyor: favicon yerine 14 px dönen halka; ses: hoparlör ikonu (bugün var, favicon ile hizalanacak) |
| "+" | Son sekmenin yanında (R117) | Aynı, 28 px yuvarlak hayalet düğme |

### 4.3 Araç çubuğu ve adres çubuğu

**Şu an:** geri, ileri, yenile, adres, `[Altyazı ▾]`, `[Çeviri]`, `[▾]`, `⋯` — çoğu çerçeveli.

**Hedef**
- `← → ↻` 32 px hayalet ikonlar.
- Adres çubuğu:
  - 36 px hap (radius 18), `--bg-2` dolgu, çerçevesiz. Odakta 2 px vurgu halkası; bugünkü kalın amber çerçeve yerine yumuşak.
  - Solda **site çipi**: kilit ikonu + host. Tıklayınca site izinleri ve reklam kalkanı açılır.
  - Odak dışında domain vurgulu (bugün var), odakta tam URL.
  - Sağda yer imi yıldızı (içeride, hayalet).
- Bağlamsal **Whisper düğmesi** (tek düğme, bugünkü Altyazı + Çeviri + ok üçlüsünün yerine):
  - Medya yok: gizli.
  - Medya var, iz yok: "Altyazı" (nötr).
  - İz var: "Altyazı · N" (amber nokta).
  - Çeviri sürüyor: ilerleme halkası.
  - Tıklayınca tek popover: iz seçimi, çeviri, Whisper, manga. Bugünkü iki menü birleşir.
- `⋯` menüsü (bkz. 4.5).
- **Kabul kriteri:** Araç çubuğunda en fazla 1 çerçeveli/dolu öğe (bağlamsal Whisper düğmesi aktifken).

### 4.4 Altyazı durum şeridi

**R120:** Videosuz sayfada gizleniyor.

**Hedef (sonraki adım)**
- Medya sayfasında da iki satır yerine **tek satır, 32 px "durum hapı"**, araç çubuğunun altında ortada, yarı saydam. İçerik: "Altyazı hazır · Çevir".
- "Ayrıntılar", "Yakalama açık" ve "Bu video için altyazılar" gibi ikincil eylemler Whisper popover'ına taşınır.
- Hata ve uyarılar aynı hapta kırmızı/amber tonda, kapatılabilir.
- **Kabul kriteri:** Medya sayfasında şerit ≤ 32 px, videosuz sayfada 0 px.

### 4.5 "Daha fazla" menüsü

**Şu an:** 20+ düz öğe (bul, kapalı sekme, sabitle, zoom, okuma görünümü, video indir, PDF, PDF kaydet, Markdown bağlantı, QR, öğe gizle, gizlileri geri yükle, oynatıcıda izle, mpv, VLC, çevrimdışı liste, anı kaydet…).

**Hedef:** En fazla 10 satır görünür.
- **Üst hızlı satır** (ikon düğmeleri): Yeni sekme, Kapalı sekmeyi aç, Sayfada bul, Yakınlaştırma `− 100% +`.
- **Sayfa ▸** (alt menü): Okuma görünümü, PDF olarak kaydet, Bağlantıyı kopyala (Markdown), QR kodu, Çevrimdışı listeye ekle.
- **Video ▸:** Oynatıcıda izle, mpv ile oynat, VLC ile oynat, Videoyu indir, Bu anı kaydet.
- **Site ▸:** Öğe gizle, Gizlenenleri geri yükle, Sekmeyi sabitle, Site izinleri.
- PDF aç · İndirilenler · Geçmiş · Ayarlar.
- Menü içi arama (yazınca filtreler). Komut paleti zaten var; aynı veri modelini kullanır.
- Devre dışı öğeler ("Oynatıcıda izle" videosuzken) gizlenir, soluk gösterilmez.

### 4.6 Yan panel

**Şu an:** Videosuz sayfada da ~30% genişlikte açık ve boş durum gösteriyor.

**Hedef**
- Videosuz sayfada otomatik olarak **48 px ikon rayına** daralır (Altyazılar, AI, Kütüphane, Araçlar). Video görülünce, kullanıcı elle kapatmadıysa açılır. Tercih site başına hatırlanır.
- Varsayılan genişlik 360 px; sürükleyerek 300–520.
- "Tools" bölümü (Auto-pause, Follow, Source, Translation) bugün her zaman açık ve 4 büyük satır tutuyor. Hedef: tek satır anahtar çipleri, ayrıntılar katlanır.

### 4.7 Yeni sekme sayfası

**Şu an:** Ortada logo, büyük slogan, üç kart, "About this browser".

**Hedef**
- Ortada **büyük arama/adres kutusu** (omnibox ile aynı öneri motoru).
- Altında 8 **hızlı erişim kutucuğu** (en sık ziyaret edilenler; favicon + başlık; sürükle-bırak, sağ tık kaldır).
- **"İzlemeye devam et"** satırı: Media library'deki yarım kalan videolar, ilerleme çubuklu küçük kartlar.
- Slogan ve "About this browser" ayarlara taşınır; üç kart, kullanıcı ilk kez açtığında tek seferlik karşılama olarak gösterilir.

### 4.8 Hata ve yükleme durumları

**Hata sayfası:** Ana belge ağ hatası veya boş gövdeli ≥ 400 yanıtta renderer'a ait bir hata ekranı gösterilir:
- İkon ve başlık ("Bu siteye ulaşılamıyor" / "Site sunucusu hata verdi").
- Tek cümle açıklama, **Yeniden dene** (birincil) ve **Ayrıntılar** (kod, URL).
- Bugün yalnız boş siyah alan var.

**Yükleme göstergeleri:**
- Sayfa yuvasının üstünde 2 px amber ilerleme çizgisi (`did-start-loading` → `did-stop-loading`, belirsiz animasyon).
- Sekmede favicon yerine dönen halka.

### 4.9 Tasarım token'ları (tek kaynak)

| Token | Değer |
| --- | --- |
| Radius | 6 (çip) · 10 (düğme, sekme) · 14 (kart, menü) · 999 (hap) |
| Kontrol yükseklikleri | 28 (kompakt) · 32 (ikon) · 36 (adres, birincil) |
| Yükselti | `--elev-1: 0 1px 2px rgb(0 0 0/.24)`, `--elev-2: 0 8px 24px rgb(0 0 0/.32)`, `--elev-3: 0 18px 44px rgb(0 0 0/.4)` |
| Tipografi | Arayüz 13/18, ikincil 12/16, başlık 15/20 semibold; `font-variant-numeric: tabular-nums` süre/sayaçlarda |
| Hareket | `--motion-fast: 120ms`, `--motion-base: 160ms`, `cubic-bezier(.2,.8,.2,1)` |

`styles.css`'teki dağınık tekrar tanımlar (aynı seçici 3–4 yerde) bu token'lara bağlanarak sadeleştirilir. Önerilen yol: bir sonraki turda yalnız browser chrome bölümünü `browser-chrome.css` adlı ayrı dosyaya taşımak.

## 5. Önceliklendirilmiş yol haritası

| Faz | İş | Etki | Risk | Tahmini kapsam |
| --- | --- | --- | --- | --- |
| **Tamamlandı (R120)** | P1 donmuş kare, P2 sessiz şerit, P3 menü taşması, B1 boş durum, B2 teşhis, B3 i18n | Yüksek | Düşük | — |
| **A — hızlı kazanımlar** | 4.2 favicon + soluklaşan başlık + × davranışı; 4.3 hayalet ikonlar + hap adres çubuğu; 4.8 ilerleme çizgisi ve hata sayfası | Yüksek | Düşük–orta | CSS ağırlıklı; favicon için main'de `page-favicon-updated` → sekme durumu |
| **B — yapısal** | 4.1 tek satır üst çerçeve (sekmeler başlık çubuğunda); 4.3 birleşik Whisper düğmesi; 4.4 durum hapı; 4.5 gruplu menü | Çok yüksek | Orta (odak sırası, klavye kısayolları ve smoke testleri etkilenir) | `index.html` player-head yeniden düzeni, menü veri modeli |
| **C — cila** | 4.6 ikon rayı; 4.7 yeni sekme; 4.9 token birleştirme ve `browser-chrome.css` | Orta–yüksek | Orta | — |
| **Sürekli** | Dinamik Türkçe teşhis/durum metinlerinin İngilizcesi (teşhis kataloğu yalnız TR); "Altyazı · N" çipi; açık tema eşitliği | Orta | Düşük | Katalogda `labelEn/messageEn` alanları |

**Her fazın kabul testi:** Mevcut `electron-browser-chrome-design` ve `ui-scale-matrix` smoke'ları, kontrast taraması (iki tema), ayrıca bu rapordaki birleşik ekran görüntüsü karşılaştırması (arayüz yüksekliği ölçümü dahil).

## 6. Açık bulgular (bu turda düzeltilmedi)

- Teşhis kataloğu (`browser-playback-diagnostics.js`) yalnız Türkçe. İngilizce arayüzde şerit mesajları Türkçe kalıyor.
- Araç çubuğundaki "Altyazı · N" çipi İngilizce arayüzde Türkçe.
- Ana belge 401/403 teşhis mesajı "Oynatma isteği HTTP 401/403" diyor. Sözleşme testlerde sabit olduğu için dokunulmadı; metin genelleştirilmeli ("İstek HTTP 403 ile reddedildi").
- Donmuş kare, menü açıkken video oynuyorsa hareketsiz görünür. Bu Electron katman sınırının kabul edilebilir bedeli; tam çözüm menüleri ayrı bir üst `WebContentsView`'da çizmek (Faz B+).
