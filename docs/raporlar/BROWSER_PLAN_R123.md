# R123 — Browser derin denetim raporu ve baştan sona uygulama planı

**Taban:** `0937c7f` (R122) + R120 · **Tarih:** 2026-09-24
**Önceki belge:** [BROWSER_DESIGN_PLAN_R120.md](BROWSER_DESIGN_PLAN_R120.md). Oradaki hedef tasarım ve token'lar geçerlidir; bu belge onu günceller ve uygulama sırasına bağlar.

## 1. Bu turda nereye bakıldı

R117 ve R120'de incelenmeyen alanlar gerçek Electron'da (castlabs 43.2, Xvfb) tek tek çalıştırıldı. Yerel sayfa görünümü ayrıca yakalanıp birleştirildi, yani ölçümler kullanıcının gördüğü ekrandan alındı.

| Alan | Yöntem | Sonuç |
| --- | --- | --- |
| Klavye kısayolları | Ctrl+T, Ctrl+W, Ctrl+Shift+T, Ctrl+Tab, Ctrl+L, Ctrl+= / Ctrl+0, sayfa görünümüne gerçek tuş olayıyla | Hepsi doğru |
| Sayfada bul | Uygulama akışı + Chromium'un yerel `found-in-page` olayı main süreçten izlendi | **Açık bulgu** (bkz. §3) |
| Okuma görünümü | Aç / kapat, `tab.readerActive` | Doğru |
| Geçmiş / yer imleri, indirmeler, QR, sekme sağ tık menüsü, site ayarları, komut paleti | Açılış + ekran görüntüsü + konsol | Hatasız; komut paletinde Türkçe öğeler vardı → düzeltildi |
| Hata durumları | Boş gövdeli 502, gövdeli 404, var olmayan alan adı | **3 hata** → düzeltildi |
| Arka planı olmayan sayfa | Sayfa pikseli ölçüldü | **Kritik hata** → düzeltildi |
| Sekme şeridi | Favicon'suz 4 sekme, başlık güncellemesi | **Eski hata** → düzeltildi |
| Statik tarama | ESLint `no-undef` ve benzerleri; renderer yükleme sırasıyla birleştirildi + main/preload | Temiz |
| Konsol / main süreç hataları | Tüm Electron koşularında | 0 |

## 2. Düzeltilen hatalar

| # | Önem | Sorun | Çözüm | Kanıt |
| --- | --- | --- | --- | --- |
| **B1** | **Kritik** | Sekme görünümünün temel rengi `#08090a` idi. Kendi arka planını boyamayan her sayfa (düz metin, belgeler, eski siteler, basit HTML) siyah zemin üstünde varsayılan siyah metinle çiziliyordu; **okunamıyordu**. | `setBackgroundColor('#ffffff')` (Chrome/Edge/Firefox davranışı) | Sayfa pikseli (8,9,10) → (255,255,255); önce/sonra görseli |
| **B2** | Orta | Gövdesi boş HTTP ≥ 400 ana belge (ör. 502) boş siyah alan gösteriyordu. | `did-navigate` HTTP kodunu saklıyor; yükleme bitince gövde **tamamen** boşsa "Bu sayfa çalışmıyor" hata ekranı açılıyor. Kendi metni olan 404 sayfaları sitenin içeriği olarak gösterilmeye devam ediyor. | 502 → hata ekranı + "Tekrar dene"; 404 → sitenin sayfası |
| **B3** | Orta | Ana belge ağ hatasında oynatma teşhis metni gösteriliyordu ("**Oynatma adresinin** alan adı çözümlenemedi"). DNS, çevrimdışı ve zaman aşımı için ham Chromium metni çıkıyordu. | Sayfa hatası her zaman sayfa bağlamındaki mesajla. -105, -106 ve -118 için anlaşılır iki dilli mesaj. Teşhis kaydı korunuyor. | DNS → "This site's address couldn't be found…" |
| **B5** | Orta | `updateBrowserTabPresentation` başlık değişince `open.textContent = label` yapıyordu; bu, sekmedeki **favicon'u ve etiket öğesini siliyordu**. Gerçek sitelerde sayfa yüklenirken favicon kayboluyordu. | Yalnız `.browser-tab-label` güncelleniyor; ikon değiştiyse sekme yeniden çiziliyor. Yüklenemeyen favicon, döngüye girmemesi için işaretleniyor. | 4 sekme: G / W / N / + kalıcı |
| i18n | Düşük | Komut paletinde "Altyazı hedef dili", "Site uyumluluk modu", "Sayfa çeviri görünümü", "Otomatik sayfa çevirisi", "ayarlar"; hata ekranı başlıkları. | Sözlüğe eklendi | Palet tamamen İngilizce |

## 3. Açık bulgu: sayfada bul "Aranıyor…"da kalıyor

**Gözlem:** Uygulama `findInPage('fox')` çağırıyor (istek kimliği dönüyor), ama bulma çubuğuna sonuç gelmiyor. Aynı sayfada doğrudan `findInPage` 14 eşleşme buluyor.

**Denenenler (Xvfb):**

| Deneme | Sonuç |
| --- | --- |
| Aynı modül, sayfaya IPC gönderilmeden | 14 eşleşme |
| Aynı modül, normal akış | Sonuç yok |
| Tekrar denemeler | Tutarsız: aynı çağrı bir sonuç veriyor, bir vermiyor |

Pencere yöneticisi olmayan ortamda Chromium'un bulma olayları deterministik değil. **Kök neden bu ortamda kesinleştirilemedi.**

**Yapılan savunmacı değişiklikler** (kesin düzeltme olarak sunulmuyor):
1. Sayfa DOM gözlemcisini açan `browser:find-state` mesajı artık aramadan **önce** değil, ilk kesin sonuçtan **sonra** gönderiliyor. Gözlemci yalnız sonuçlar geldikten sonra gerekli; aramayla aynı anda sayfaya IPC gitmiyor.
2. Yeni sorgudan önce gereksiz `stopFindInPage` çağrılmıyor. Electron belgesine göre `findNext:false` zaten yeni oturum başlatıyor; durdurma yalnız kapatmada.

Birim testi (`browser-page-find.test.js`) ve yeni regresyon testi geçiyor.

**Yapılması gereken:**
- **Windows'ta elle doğrulama:** Ctrl+F → "fox" → sayaç "1 / N" olmalı; Enter ve Shift+Enter ile gezinme.
- Projeye eksik olan uçtan uca testin eklenmesi: `electron-browser-find.smoke.js`, gerçek pencere yöneticisi olan CI'da.

## 4. Tasarım: bu turda uygulananlar (Faz A'nın ilk kısmı)

- **Harf avatarı:** Favicon'u olmayan veya yüklenemeyen sekmede boş alan yerine alan adının ilk harfi, host'a göre sabit renk tonunda 16 px avatar. Yeni sekmede "+".
- **Soluklaşan başlık:** Uzun sekme başlığı son 18 px'te soluklaşıyor, sert kesilmiyor (maske `currentColor` ile; sabit renk sınırı 470/470 korunuyor).
- **× düğmesi:** Yalnız aktif, üzerine gelinen veya odaklı sekmede görünüyor. Yerini koruduğu için düzen kaymıyor; dokunmatik cihazda her zaman görünüyor.
- **Adres çubuğu:** Hap biçimli (radius 999, iç boşluk 14/6).

## 5. Baştan sona uygulama planı

Her adım bağımsız bir PR'dır. Her PR'ın kabul testi aynı:
- `npm test`.
- `electron-browser-chrome-design` ve `ui-scale-matrix` smoke'ları.
- İki temada kontrast taraması.
- Önce/sonra birleşik ekran görüntüsü.
- AGENTS.md gereği Windows etkisi notu.

### Adım 1 — Kalan doğruluk işleri (öncelik: yüksek, risk: düşük)

| İş | Ayrıntı | Dosyalar |
| --- | --- | --- |
| 1.1 Sayfada bul | §3'teki Windows doğrulaması. Sorun sürerse `found-in-page` gelmediğinde 600 ms sonra aynı sorguyla tek bir yeniden deneme ve sayaçta "Sonuç alınamadı · Tekrar dene". | `browser-page-find.js`, `renderer.js` |
| 1.2 Dinamik metinlerin İngilizcesi | Main'den gelen hata ve teşhis mesajları yalnız Türkçe. Örnekler: "Site sunucusu HTTP 502 hatası verdi…", teşhis kataloğu, "Sayfa yüklenemedi:" öneki. Öneri: mesajlarla birlikte `messageKey` + `params` gönderip renderer'da iki dilli şablonla biçimlendirmek. | `main.js`, `browser-playback-diagnostics.js`, `ui-locale.js` |
| 1.3 "Altyazı · N" çipi | Araç çubuğu çipi İngilizce arayüzde Türkçe. | `renderer.js` |
| 1.4 Belge 401/403 teşhis metni | "Oynatma isteği HTTP 403…" sayfa isteği için de kullanılıyor. Metin genelleştirilmeli; sözleşme testi güncellenmeli. | `browser-playback-diagnostics.js` + test |

### Adım 2 — Faz A'nın kalanı (yüksek etki, düşük risk)

| İş | Hedef | Kabul kriteri |
| --- | --- | --- |
| 2.1 Hayalet araç çubuğu | Geri, ileri, yenile ve ⋯ çerçevesiz 32 px; Altyazı ve Çeviri düğmeleri `--bg-2` dolgulu ama çerçevesiz. Çerçeve yalnız aktif veya odaklı durumda. | Araç çubuğunda en fazla 1 çerçeveli öğe |
| 2.2 Site çipi | Adres çubuğunun solunda kilit + host; tıklayınca site izinleri ve reklam kalkanı. Kalkan üst şeritten buraya taşınır. | Üst şeritten 1 kontrol eksilir |
| 2.3 Aktif sekme şekli | Alt çizgi yerine aktif sekme araç çubuğu yüzeyiyle birleşir (üst köşeler 10 px). | Görsel karşılaştırma |
| 2.4 Hata ekranı cilası | İkon, ana eylem "Tekrar dene", ikincil "Geri dön"; ayrıntılar katlanır. Bugün var; tipografi ve boşluk token'lara bağlanır. | Kontrast AA |

### Adım 3 — Faz B: yapısal düzen (en büyük premium kazanç, orta risk)

| İş | Hedef | Risk ve önlem |
| --- | --- | --- |
| 3.1 Tek satır üst çerçeve | Sekmeler başlık çubuğunda (`titleBarOverlay` 38 px, sekmeler `no-drag`). Soldaki logo menüsünde Oynatıcı / Browser / Media library geçişi. Sağda tek uygulama menüsü: dil, ayarlar, görev merkezi, PDF. | Klavye odak sırası ve smoke seçicileri değişir → aynı PR'da `ui-scale-matrix` ve `browser-chrome-design` güncellenir |
| 3.2 Birleşik Whisper düğmesi | Altyazı + Çeviri + ok yerine tek bağlamsal düğme: medya yok → gizli; iz var → "Altyazı · N"; çeviri sürüyor → ilerleme halkası. Tek popover. | Menü veri modeli ortaklaşır; komut paleti aynı modeli kullanır |
| 3.3 Durum hapı | Medya sayfasında altyazı şeridi iki satır yerine 32 px tek satır hap; ikincil eylemler popover'a. | `setBrowserSignal` API'si korunur; yalnız sunum değişir |
| 3.4 Gruplu "Daha fazla" | Hızlı satır (yeni sekme, kapalı sekme, bul, zoom) ve Sayfa ▸ / Video ▸ / Site ▸ alt menüleri; devre dışı öğeler gizli; menü içi arama. | Menü öğesi kimlikleri korunur (testler ve kısayollar) |

**Faz B kabul kriteri:** 1440×900'de sayfa içeriği y ≤ 90 px'ten başlar. R120'deki ölçüm ~230 px; R120 sonrası yeni sekme ve makalede ~135 px.

### Adım 4 — Faz C: cila

- **Yan panel ikon rayı:** Videosuz sayfada 48 px ikon rayına daralır; video görülünce, kullanıcı kapatmadıysa açılır; tercih site başına tutulur.
- **Yeni sekme sayfası:** Ortada arama kutusu, 8 hızlı erişim kutucuğu, "İzlemeye devam et" satırı. Slogan ve kartlar yalnız ilk açılışta.
- **Token birleştirme:** Browser chrome kuralları `browser-chrome.css`'e taşınır; tekrar tanımlar R120 §4.9 token'larına bağlanır. Sabit renk sayısı sınırı 470'ten aşağı çekilir.
- **Açık tema eşitliği:** Browser chrome ve yan panel için R117'deki kontrast taraması CI'a eklenir.

### Adım 5 — Test altyapısı (sürekli)

| Eksik | Öneri |
| --- | --- |
| Sayfada bul uçtan uca | `electron-browser-find.smoke.js`: Ctrl+F, sayaç, sonraki/önceki, Esc |
| Hata sayfaları | `electron-browser-error-pages.smoke.js`: boş 502, gövdeli 404, DNS, çevrimdışı |
| Sayfa temel rengi | Arka plansız sayfada piksel beyaz olmalı (bu turdaki ölçümün testleşmiş hali) |
| Sekme ikonları | Başlık güncellemesinden sonra favicon/avatar DOM'da kalmalı |
| Menü açıkken sayfa | R120'deki donmuş kare: menü açıkken yuvada görüntü olmalı |

## 6. Bu turun doğrulaması

| Kontrol | Sonuç |
| --- | --- |
| `tests/browser-report123-regressions.test.js` | 6/6 |
| `tests/browser-report120-regressions.test.js` | 6/6 |
| Etkilenen mevcut testler (`browser-page-find`, `browser-overlay-readiness`, `browser-page-index-integration`, `css-hardcoded-colors`, `ui-locale`, `player-ui`, `audit-followup`, `browser-subtitle-health`, `browser-playback-diagnostics`) | Geçti. Bu turda kırılan üç test (`browser-overlay-readiness`, `browser-page-index-integration`, `css-hardcoded-colors`) değişiklik düzeltilerek geçirildi; testlerin sözleşmesi değiştirilmedi. |
| Tüm `tests/*.test.js` | Yalnız `browser-alignment`, `browser-video-analysis` ve `catalog-roadmap` düşüyor; üçü değişiklik öncesinde de aynı şekilde düşüyor (konteynerde Python bağımlılıkları yok) |
| Electron önce/sonra | Makale okunur hale geldi; 502 hata ekranı görünür; sekme avatarları kalıcı |
