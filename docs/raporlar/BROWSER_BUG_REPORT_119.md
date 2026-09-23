# BROWSER_BUG_REPORT_119 — Browser/oynatıcı derin denetimi, tema eşitliği, çeviri dağıtımı

> **Kaynak:** Bu rapor kullanıcının kendi makinesindeki yerel denetim oturumundan `git am` patch serisi olarak geldi (orada "R117" olarak numaralandırılmıştı). GitHub `master`'ında R117 ve R118 raporları zaten yer aldığı için dosya seriye **119** olarak eklendi; bulgu kimlikleri (`BUG-117-0x`, `P-01`, `P-02`) ve test dosyası adı denetimin özgün numaralandırmasını korur.

**Tarih:** 2026-09-23 · **Taban:** `f0ecb1c` (R116) · **Dal:** `master`
**Not:** İş `f624e38` (R110) üzerinde başladı. Bu sırada `master` R111–R116 ile ilerlediği için değişiklikler güncel tabana taşındı (bkz. "Upstream ile birleştirme").

## Kapsam ve yöntem

Kullanıcı talebi: browser ve oynatıcı tarafında bug, tasarım ve performans denetimi, ardından çeviri akışının kontrolü.

**1. Statik tarama**
- ESLint 9 repo dışında çalıştırıldı; bağımlılık eklenmedi.
- Kurallar: `no-undef`, `no-unreachable`, `no-dupe-*`, `no-use-before-define` ve benzerleri.
- Renderer betikleri `index.html` yükleme sırasıyla tek pakette birleştirildi; böylece çapraz-dosya tanımsız referanslar gerçek anlamda denetlendi.

**2. DOM ve CSS çapraz kontrolü**
- JS'nin eriştiği tüm id'ler tanımlı.
- Tanımsız `var(--…)` token'ı yok (R106/R107'deki şeffaf menü sınıfı kapalı).

**3. Gerçek Electron denetimi**
- Castlabs Electron 43.2, Xvfb altında çalıştırıldı.
- Oynatıcıya test videosu (1280×720, 25 fps) ve SRT yüklendi; browser'da `protocol.handle` ile sahte bir sayfa açıldı.
- Toplananlar: ekran görüntüsü, konsol hataları, long-task ve heap ölçümü.
- İki temada tüm yüzeyler için WCAG kontrast taraması yapıldı: ana ekran, oynatıcı, yan sekmeler, browser araç çubuğu, "Daha fazla" ve "Çeviri" menüleri.
- İngilizce arayüzde görünür kalan Türkçe metinler otomatik toplandı.

**4. Çeviri modülleri**
- `browser-translation-scheduler.js` satır satır okundu: kuşak koruması, paylaşılan istek iptali, devre kesici, yeniden deneme zamanlayıcısı, dağıtım.

## Performans ölçümü (gerçek Electron)

| Ölçüm | Değer |
| --- | --- |
| Açılış DOM düğümü | 3 359 (browser açıkken 3 696) |
| JS heap | ~10 MB |
| Oynatma sırasında 5 sn long-task | 0–1 adet, en fazla 50 ms |
| Konsol hatası / uyarısı | 0 |

Bu ölçümlere göre performans düzeltmesi gerekmedi.

## Bulgular ve düzeltmeler

### BUG-117-01 — Araştırma defteri dışa aktarımı her seferinde çöküyordu (yüksek)
- **Belirti:** `browser:research:export`, tanımsız `writeTextAtomic` çağırıyordu. Kullanıcı kaydet diyaloğunda yer seçtikten sonra `ReferenceError` alıyordu ve dosya yazılmıyordu.
- **Düzeltme:** `src/main.js` içine `writeTextAtomic(filePath, text, io = fs)` eklendi. BOM eklemiyor, klasörü oluşturuyor, `.tmp`'den rename ile yazıyor, hata olursa `.tmp`'yi temizliyor.

### BUG-117-02 — Model önbelleği silindiğinde arayüz güncellenmiyordu (orta)
- **Belirti:** Silme başarılı olunca tanımsız `addLog` çağrılıyordu. Promise reddediliyor, `refreshModelStatus()` hiç çalışmıyor ve silinen model "indirilmiş" görünmeye devam ediyordu.
- **Düzeltme:** Üç çağrı `logLine` yapıldı.
- **Ek sağlamlaştırma:** `glossaryAdd.addEventListener`, DOM id'sinin global'e sızmasına dayanıyordu; `$('glossaryAdd')` ile değiştirildi.

### BUG-117-03 — Omnibox hesaplayıcısı işareti yanlış hesaplıyordu (düşük)
- **Belirti:** `-2^2 = 4`, `-(2+3)^2 = 25`, `-2^-2 = 0.25`.
- **Düzeltme:** Tekli eksinin önceliği `*` ile `^` arasına alındı ve önek işleç yığından hiçbir şey çıkarmıyor. Sonuç: `-2^2 = -4`; `2^-2`, `-3*2`, `2^3^2` davranışı değişmedi.

### BUG-117-04 — Açık temada oynatıcı okunmuyordu (yüksek, tasarım)
- **Belirti:** Oynatıcı katmanının metin renkleri sabit hex yazılmıştı (`#e9e9ec`, `#b8b8bd`, `#cbd5df`…). Açık temada yüzeyler açılırken metinler aynı kaldı.
- **Ölçüm (R110 tabanı):** Açık temada 32 eleman AA eşiğinin (4.5:1) altındaydı.

| Eleman | Kontrast |
| --- | --- |
| Kontrol çubuğu butonları | 1.05:1 |
| Aktif replik | 1.03:1 |
| "Generate subtitles" | 1.27:1 |
| Aktif yan sekme | 1.38:1 |

- Koyu temada 3 meta metin (replik zamanı, `001 / 003`, "File") 3.5:1'deydi.
- **Düzeltme:** `styles.css` sonuna belgelenmiş bir "tema eşitliği" bloğu eklendi.
  - Kontrol çubuğu açık temada da koyu yüzey token'larını ve `color-scheme: dark`'ı koruyor. Bu, R115'in "koyu cam" tasarım kararıyla uyumlu.
  - `--player-*` token'ları açık temada tema token'larına bağlandı. Transkript, yan sekmeler, araç satırı, kütüphane ve browser ikincil ikonları açık tema karşılığını aldı.
  - Koyu temadaki meta metinler `#8a8a90` ve `#8593a3` yapıldı (5.7 ve 6.3:1).
- **Sonuç:** R110 tabanında 35 → 0. R116 tabanında yeniden koşulan taramada bu bloğun kapsadığı yüzeylerde hata yok.

### BUG-117-05 — İngilizce arayüzde Türkçe metinler (orta)
- **Düzeltme:** Sözlüğe, R115'in eklemediği 27 giriş eklendi. Örnekler: browser durum satırı ("Sayfa hazır; altyazı yakalama kullanılabilir.", "Sayfada altyazı aranıyor…"), kütüphane sekmeleri, kontrol ipuçları.
- **Ek hata ve düzeltmesi:** Transkriptin **arama** boş durumu ("Eşleşen satır yok.") Türkçe sabitti ve dil değişince "yüklenince akar" metnine dönüşüyordu. Artık `interfaceChoice` ile etkin dilde yazılıyor ve `data-empty-kind="search"` ile ayrılıyor. Boşta durumu R115'te zaten zenginleştirilip çevrilmişti.
- **Kalan (bu tur kapsam dışı):** Sayaç/değer içeren dinamik metinler kod tarafında `interfaceChoice` gerektiriyor. Örnekler: "0 blok hazır", "Yakınlaştırmayı sıfırla (şu an 100%)", "Kaydedilen cümleleri göster (0)", AI bağlam satırı.

### BUG-117-06 — "Yeni sekme" düğmesi sekmelerden kopuktu (düşük, tasarım)
- **Belirti:** `.browser-tab-strip { flex: 1 }` yüzünden tek sekmede bile "+" düğmesi ~750 px sağa itiliyordu.
- **Düzeltme:** Browser modunda şerit `flex: 0 1 auto` yapıldı; reklam kalkanı `margin-left: auto` ile sağa yaslanıyor. "+" artık son sekmenin yanında. Çok sekmede şerit küçülüp kendi içinde kaymaya devam ediyor.

### BUG-117-07 — Boşluksuz dillerde çeviri dağıtımı karakterleri bölüyordu (orta, çeviri)
- **Belirti:** `distributeTranslation`, yorumda "grapheme ile kayıpsız" dese de `Array.from` ile kod noktasına bölüyordu. `"👨‍👩‍👧日本"` altı cue'ya `👨 | ‍ | 👩 | ‍ | 👧 | 日本` olarak dağılıyordu: yalnız görünmez ZWJ'den oluşan replikler çıkıyor, birleşik emoji ve ayrık aksanlı heceler kopuyordu.
- **Düzeltme:** `Intl.Segmenter` ile grapheme bölmesine geçildi. Segmenter yoksa birleştirici işaretleri ve ZWJ dizilerini önceki karaktere bağlayan bir yedek yol var.

### Çeviri zamanlayıcısında incelenip sorun bulunmayanlar
- Paylaşılan sağlayıcı isteği yalnız son tüketici ayrılınca iptal ediliyor.
- Uzak seek'te pencere dışı işler hemen `pending`'den çıkıyor.
- Kuşak koruması, geç gelen yanıtın yeni sete yazılmasını engelliyor.
- 429/5xx devre kesicisi çalışıyor; `retryFailed` sayacı sıfırlıyor.
- Erken uyanan zamanlayıcı için yeniden kurma mantığı var.
- Kalite kapısı yalnız sayı uyuşmazlığını engelliyor; hata mesajı doğru.

## Oynatıcı iyileştirmeleri

### P-01 — Gerçek kare hızıyla kare kare gezinme
- **Önceki durum:** `, .` sabit 1/25 sn adım atıyordu.
- **Yeni davranış:**
  - Oynatma sırasında `requestVideoFrameCallback` ile ardışık karelerin `mediaTime` farkının medyanı ölçülüyor.
  - Adım bu süreyle atılıyor ve hedef karenin ortasına oturtuluyor.
  - Ölçüm yoksa 25 fps varsayımı sürüyor.
- **Electron'da doğrulama:** Ölçülen kare süresi 0.040 sn; 5.00 → 5.06.

### P-02 — `0`–`9` ile %0–90 atlama (YouTube paritesi)
- Yerel oynatıcıda doğrudan, browser videosunda `seek-relative` ile çalışıyor.
- Ctrl, Alt ve Meta kombinasyonlarına karışmıyor.
- Kısayol yardımına eklendi.
- **Electron'da doğrulama:** 30 sn'lik videoda `5` → 15.0 sn.

## Upstream ile birleştirme

- Çakışmalar üç dosyadaydı:
  - `renderer.js`: boşta durumu için R115'in zengin, çevrilmiş sürümü korundu.
  - `index.html`: R115'in boş bıraktığı yardım hücresine `0–9` eklendi.
  - `ui-locale.js`: R115'in `plainEmpty` kapısı korundu ve arama türü ayrımı eklendi.
- R115'in zaten eklediği 5 sözlük anahtarı bu turun bloğundan çıkarıldı.
- **Doğrulanması gereken gözlem (R115'e ait):** `#playerTaskCenterToggle` ve `#pdfReaderOpen` kapalı "Diğer araçlar" menüsünde ölçüldü.
  - Değerler: açık temada 2.08:1; browser modunda koyu temada 2.12:1 (koyu temada açık temanın `--text-dim` değeri görünüyor).
  - Kapalı `<details>` içeriği yanlış-pozitif üretebildiği için düzeltilmedi; menü açıkken Windows'ta kontrol edilmeli.

## Doğrulama

| Kontrol | Sonuç |
| --- | --- |
| `tests/browser-report117-regressions.test.js` | **15/15** (yeni) |
| Tüm `tests/*.test.js` (R110 tabanında) | Taban çizgisiyle aynı. Yalnız konteynerde olmayan Python paketleri yüzünden `browser-alignment`, `browser-video-analysis` ve `catalog-roadmap` düşüyor. |
| R116 tabanında hedefli testler | `ui-locale`, `player-ui` (148/148), R117 regresyonları geçti |
| Çeviri zamanlayıcısını kullanan 17 test dosyası (R110 tabanında) | Hepsi geçti |
| `electron-browser-chrome-design.smoke.js` | Geçti |
| `electron-browser-menu-visual.smoke.js` | **Ortam kısıtı:** Xvfb'de `desktopCapturer` pencereyi göremiyor; değişiklik öncesi kodda da aynı hatayla düşüyor. |
| Patch'lerin temiz klona uygulanması | `f0ecb1c` üzerine `git am` ile uygulandı |

## Sınırlar

- R116 tabanında tüm `npm test` paketi yeniden koşulmadı; yalnız hedefli testler koşuldu. **Push'tan önce `npm test` önerilir.**
- Python testleri, gerçek çeviri sağlayıcısı ve DRM bu ortamda koşulamadı.
- Browser sayfasının yerel `WebContentsView` yüzeyi yakalanamadı.
- `fitTranslationParts` boşluksuz dillerde parçayı kelime ortasından bölebiliyor ("いい天 | 気ですね"). Sözcük sınırıyla iyileştirme önerilir.

## Eki — gerçek-Electron uçtan uca doğrulama (2026-09-23, dal `codex/r117-local-patch-1790200226`)

Devin test ajanı 7 yüzeyi gerçek Electron'da doğruladı: 6/7 düzeltme çalışıyor; 3 kusur bulundu:

- **F6 (düzeltildi, `dff919f`):** Omnibox öneri paneli `.browser-address-results` sabit `#11161b` zemin + temalı koyu metin → açık temada ~1.3:1 kontrastla okunamaz. Panel `var(--surface-panel)` oldu; koyu tema davranışı korundu.
- **F4 (düzeltildi, `dff919f`):** `.research-library-controls` 5-sütun ızgarası 416px varsayılan yan panelde taşıyordu (scrollW 509 > clientW 416) — "Markdown dışa aktar" fareyle ulaşılamıyordu. `.player-side` bağlamında `workspace-browser` deseni uygulandı (2 sütun + tam-satır filtreler).
- **F5 (kapsam kararı açık):** ui-locale'de EN karşılığı olmayan kalan TR dizgiler ("Ara" sekmesi, "Etiket", "devam eden", "Yerel", "Baştan izle", "Tamamlanmadı", "Koleksiyon" düğmesi, "0 araştırma kaydı" + araştırma boş-durumu, "Çevir ve göster", "Altyazı·1", "Sil" ipucu). Sayaçlı dinamik metinler zaten bu notun "Açık kalanlar" bölümünde `interfaceChoice` gereksinimi olarak işaretli — EN anahtar ekleri ayrı bir i18n turuna ayrıldı.

Doğrulananlar (hepsi yeşil): araştırma dışa aktarımı dosya üretiyor; model-önbelleği silme onay→silme→logLine akışı; sözlük "+" çipi; omnibox `-2^2=-4` dahil 9 ifade; açık+koyu tema kontrastı; EN i18n yüzeyleri; "+" son sekmenin yanında (5px); `,`/`.` kare adımı ±1 kare; `0`–`9` %0–90 atlama.

Kanıt: test ajanı kaydı + ekran görüntüleri PR #42 yorumunda.
