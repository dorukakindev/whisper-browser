# Tarayıcı Alt Sistemi Denetim Raporu

- **Tarih:** 2026-09-11
- **Kapsam:** `src/` altındaki browser-* ana süreç modülleri, `src/main.js` tarayıcı kablolaması, `src/renderer/` (renderer.js, index.html, styles.css) tarayıcı arayüzü, `src/preload.js`, `src/browser-preload.js`
- **Yöntem:** Statik inceleme + hedefli desen taramaları (listener/timer/Map yaşam döngüsü, IPC yüzeyi, webPreferences, izin akışı) + tam test paketi
- **Test sonucu:** `node tests/run-all.js` → **140 test dosyası, 807 test, 0 başarısız** (Node + Python dahil). Bu rapordaki bulgular testlerin kapsamadığı alanlardandır; testler kırık değildir.
- **Kural:** Bu rapor yalnızca tanı ve öneri içerir; kod değişikliği yapılmamıştır.

---

## 1. Özet

Tarayıcı alt sistemi rastgele büyümüş bir özellik yığını değil; güvenlik ve yaşam döngüsü disiplini örnek düzeydedir. Buna karşılık üç yapısal borç birikmiştir: `main.js` içindeki 166 IPC işleyicisi, `renderer.js` içindeki tek küresel durum nesnesi (`player`) ve kod tabanına yayılmış **kodlama (encoding) bozulması**. Kullanıcıya görünen tek gerçek hata kategorisi budur; en yüksek öncelik budur.

---

## 2. Doğrulanan güçlü yönler (değiştirilmemesi gerekenler)

| Konu | Kanıt | Not |
|---|---|---|
| WebContents sertleştirme | `main.js:8119`, `browser-navigation-policy.js:123` | `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true` — ana görünüm ve popup'larda tutarlı |
| Merkezi navigasyon politikası | `browser-navigation-policy.js` | Tek `URL_POLICY` tablosu; kimlik bilgisi içeren URL reddi, kontrol karakteri reddi, 8 KB sınır, `will-navigate`+`will-redirect`+`will-frame-navigate` üçlü koruma, detach fonksiyonu |
| IPC yetkilendirme | `main.js:9323` `authorizedBrowserSender` | 160 çağrıda sender + mainFrame doğrulaması |
| Çökme yalıtımı | `main.js:8342` `render-process-gone` | Sekme çökünce diğerleri korunur, durum kurtarma (`restoredUrl`) |
| Sekme yıkımı | `main.js:8599` `destroyBrowserTab` | Timer, scheduler, debugger, view, Map kaydı tam temizlik |
| Çeviri önbelleği | `browser-translation-cache.js` | LRU + TTL + şema doğrulama + `.bak` kurtarma + atomik yazma + bozuk dosya arşivleme |
| Çeviri zamanlayıcı | `browser-translation-scheduler.js` | AbortSignal + generation doğrulama + üst sınırlandırılmış üstel geri çekilme; paylaşımlı istekte tüketici sayacı |
| İndirme yöneticisi | `browser-downloads.js` | `maxActive=8`, `maxRecords=100`, WeakSet ile tek attach, `done` sonrası listener temizliği, yerel kayıt yalnız düz veri (DownloadItem referansı saklanmaz) |
| Site verisi temizleme | `browser-session-privacy.js` | Temizlik öncesi `closeAllConnections` (uçuştaki Set-Cookie geri yazımını engeller), Cache Storage için eski API ile ayrıca temizlik |
| Altyazı ayrıştırıcıları | `browser-subtitles.js` | SRT/ASS/SAMI/LRC/HLS/DASH/TTML/MP4 kutu ayrıştırma; 20.000 cue tavanı; innerHTML yok |
| Oturum kalıcılığı | `main.js` ~8030 | Trailing debounce'un kayıp-son-konum sorununu bilen 10 sn üst sınırı |
| İzin akışı | `main.js:8085`, `browser-site-permissions.js` | 30 sn zaman aşımı, sekmeye olay bildirimi, kalıcı kararlar origin+izin adı normalizasyonuyla sınırlı (200 origin tavanı) |
| Adres çubuğu | `renderer.js:5966-6025` | Sıra numarası (seq) ile bayat yanıtların atılması, 130 ms debounce |
| CSS temeli | `styles.css:3306` | Tek kanonik `:root`, light tema, 4 yerde `prefers-reduced-motion`, `forced-colors` desteği |

---

## 3. Bulgular ve buglar

Önem: **[KRİTİK]** kullanıcıya görünen hata veya güvenlik açığı · **[ORTA]** belirli koşullarda hata/veri kaybı/kaynak riski · **[DÜŞÜK]** kalite/darben kolay düzeltme

### B1 [KRİTİK — kullanıcıya görünen] Kodlama (encoding) bozulması kod tabanına yayılmış

- **Kanıt:** `renderer.js:5177` (sekme grubu daralt/genişlet okları `▸/▾` yerine mojibake), benzer bozukluk `main.js`, `styles.css` yorumları, `README.md` boyunca. Kullanıcıya görünen metinlerde de yer yer bozuk karakter var (aria-label'lar, durum mesajları).
- **Etki:** Ekran okuyucular bozuk etiketleri okur; sekme grubu okları anlamsız görünür; ürün kalitesi izlenimi doğrudan zarar görür. Projenin kendisi "bozuk Türkçe karakter onarımı" özelliği satarken kendi arayüzünde aynı hatayı taşıması ikinci derecede bir imaj sorunudur.
- **Düzeltme önerisi (uygulanabilir adımlar):**
  1. Tüm `*.js`, `*.css`, `*.md` dosyalarını UTF-8 olarak yeniden kaydeden tek seferlik bir betik yaz (Node: `fs.readFileSync(path,'latin1')` → mojibake deseni tespiti → `Buffer.from(s,'binary')` tabanlı çift kodlama çözümü; tek başına iconv `cp1254→utf8` geçişi çoğu dosyayı düzeltir).
  2. Düzeltmeyi `.gitattributes` ile kilitle: `*.js text eol=lf`, `*.md text`, + repo düzeyinde `core.autocrlf=false`.
  3. Yeni dosyalar için CI'da encoding denetimi: bir dosyada UTF-8 olmayan bayt dizisi bulunursa test başarısız olsun.
  4. Bilinen çift kodlama desenleri (`Ã¼`, `Å?`, `Ǭ`, `ÅŸ` vb.) için mevcut `renderer.js` içindeki onarım mantığından faydalanılabilir.
- **Tahmini çaba:** 0,5–1 gün (doğrulama dahil; tüm testler çalıştırılmalı).

### B2 [ORTA] Popup pencerelerinde sayı sınırı yok

- **Kanıt:** `main.js:2970` `browserWindowOpenHandler` `action:'allow'` döner; `browser-navigation-policy.js` `createWindowRegistry` yalnızca Set tutar, üst sınır yok. Sekmeler `MAX_SESSION_TABS=24` ile sınırlıyken (`browser-session-store.js:13`) popup'lar sınırsız.
- **Etki:** Reklam/maliz betik ardışık `window.open` ile sınırsız `BrowserWindow` açabilir → bellek/GPU/DoS yüzeyi. Adblock çoğunu keser ama kesmezse risk açıktır.
- **Düzeltme önerisi:** `createWindowRegistry`'ye `max` seçeneği ekle; `browserWindowOpenHandler` içinde kayıt sayısı dolduysa `{action:'deny'}` + sekmeye `popup-blocked` olayı gönder. Önerilen limitler: sekme başına 3, toplamda 10 (kaynak uygulaması `download`'taki `maxActive=8` kalıbıyla uyumlu).
- **Tahmini çaba:** 2–4 saat + test.

### B3 [ORTA] WebContents odaklıyken temel tarayıcı kısayolları ölü

- **Kanıt:** `browser-command-palette.js:29` `browserShortcutForInput` yalnızca Ctrl+T/K/F/L (+Ctrl+Shift+T) geçirir. `before-input-event` kancası `main.js:8140`'ta kurulu.
- **Etki:** Kullanıcı sayfaya tıkladıktan sonra Ctrl+W (sekme kapat), Ctrl+Tab / Ctrl+Shift+Tab (sekme değiştir), Ctrl+R (yenile) çalışmaz. Tarayıcı hissi için en çok hissedilen eksik.
- **Düzeltme önerisi:** `browserShortcutForInput` listesine `w`, `r`, `tab`, `1..9` (sekmeye atla) ekle; karşılık gelen işleyiciler `main.js`'te zaten IPC olarak duruyor. Input alanları üzerindeyken geçişin engellenmesi (odaklı öğe kontrolü) mevcut desene uygundur.
- **Tahmini çaba:** 2–3 saat + `browser-command-palette.test.js` güncellemesi.

### B4 [ORTA] `configureBrowserPlaybackWebRequest` tekrarı korumalı Set dışında

- **Kanıt:** `main.js:8080` `ensureBrowserView` içinde: `browserConfiguredSessions.has(browserSession)` kontrolü User-Agent için var, ancak `configureBrowserPlaybackWebRequest(browserSession)` çağrısı bu korumanın **dışında**, her çağrıda çalışır.
- **Etki:** Aynı session için webRequest dinleyicilerinin tekrar tekrar eklenmesi riski (işleyicinin kendi içinde Set koruması varsa etkisizdir — doğrulanmalı).
- **Düzeltme önerisi:** Çağrıyı `browserConfiguredSessions` kontrolünün içine al veya işlevin kendi içinde session bazlı tek-sefer koruması koy.
- **Tahmini çaba:** 1 saat + doğrulama.

### B5 [DÜŞÜK] `renderBrowserTabs` her olayda tüm şeridi sıfırdan kuruyor

- **Kanıt:** `renderer.js:5166` `strip.replaceChildren()`; odak koruma için ayrıca `focusedTabId` mekanizması (yeniden kurulumun yan etkisini yamayan yama).
- **Etki:** 24 sekme × 3 buton her `browser:event`'te yeniden yaratılıyor; mevcut boyutlarda kullanıcı tarafından hissedilmez.
- **Düzeltme önerisi:** Sekme kimliği bazlı diff (mevcut `data-browser-tab-id` sorguları zaten var): yalnızca değişen sekmenin düğümlerini güncelle. Odak koruma kodu bu durumda gereksizleşir.
- **Tahmini çaba:** 0,5 gün.

### B6 [DÜŞÜK] Sekme etiketlerinde favicon render edilmiyor

- **Kanıt:** `main.js:8381` `page-favicon-updated` dinleniyor, `tab.favicon` saklanıyor; `renderer.js:5185-5200` DOM'da kullanılmıyor.
- **Düzeltme önerisi:** `browser-tab-open` içine favicon ekle (kaynaksızken gizli). Pinned sekmelerde yalnız favicon göster (Chrome kalıbı) → yer kazancı.
- **Tahmini çaba:** 2 saat.

### B7 [DÜŞÜK] İzin varsayılanları: `fullscreen` ve `clipboard-sanitized-write` sorulmadan izinli

- **Kanıt:** `browser-site-permissions.js:52` `browserPermissionDecision` bu iki izin için kayıt yoksa `allow` döner.
- **Etki:** Fullscreen için savunulabilir UX tercihi; `clipboard-sanitized-write`'ın sessiz izni tartışmalı.
- **Düzeltme önerisi:** Ayarlar > Site İzinleri sayfasına "Varsayılan izinler" bölümü ekle. `SUPPORTED_BROWSER_PERMISSIONS` listesi hazır olduğundan UI tarafı ucuz.
- **Tahmini çaba:** 0,5 gün.

### B8 [DÜŞÜK] İndirme panelinde tek küresel `message` alanı

- **Kanıt:** `browser-downloads.js` içinde `message` tek dize; ikinci bir ret mesajı öncekini ezer (kod, `done` içinde `message=''` ile slot boşalınca temizliyor — farkındalıklı).
- **Düzeltme önerisi:** `message` yerine son olayın `{text, at}` damgalı kaydı + birkaç saniye sonra solma; ya da olay bazlı toast.
- **Tahmini çaba:** 2 saat.

### B9 [BİLGİ — hata değil] main.js'te 91 `.on(` kaydına karşılık 0 `removeListener`

- Sekme dinleyicileri `webContents.close()` ile dolaylı temizlenir; `mainWindow`/session düzeyi dinleyiciler uygulama ömrü boyunca yaşar. **Pratik sızıntı küçük** (B4 düzeltilirse daha da küçülür). Popup tarafında `popup.once('closed', detachNavigationGuard)` deseni doğru kullanılmış.

---

## 4. Mimari öneriler

### M1 [YÜKSEK ÖNCELİK] `main.js`'ten tarayıcı IPC katmanının ayrılması

- **Kanıt:** `main.js` 644 KB; 166 `ipcMain.handle/on` işleyicisinin önemli bölümü `browser:*` kanalları.
- **Öneri:** Kayıt tabanlı bir `browser-ipc.js` oluşturun: her modül kendi `handlers` sözlüğünü ihrac eder, tek `registerBrowserIpc()` işlevi `authorizedBrowserSender` + `queueBrowserTabTransition` sarmalayıcılarını uygular. Adım adım taşıma güvenlidir (her taşınan grupta test paketini çalıştır). Sıra: sekme işlemleri → altyazı işlemleri → manga → sayfa çevirisi.

### M2 [ORTA] Renderer tarafında sekme başına bellek temizliği garanti altına alınsın

- **Kanıt:** `renderer.js` 504 `addEventListener` / 3 `removeEventListener`; tek küresel `player` nesnesi tüm sekme durumunu taşır.
- **Risk:** Sekme kapanınca `player` üzerinde bayat alan kalması; `browserTabEventGate` var ama sekme kapanışında renderer tarafında simetrik temizlik garantisi bulgusu yok.
- **Öneri:** Sekme kapanış olayında tüm sekme-başına verilerin tek yerden temizlendiği bir `releaseBrowserTabState(tabId)` işlevi (ana süreçteki `destroyBrowserTab` ile simetrik).

### M3 [ORTA] Üç ayrı polling interval tek zamanlayıcıda birleştirilsin

- **Kanıt:** `main.js:7838-7850` `browserTrackTimer` (6,5 sn) + `browserCaptureTimer` (0,9 sn) + `browserMediaTimer` (1 sn).
- **Öneri:** Tek interval (900 ms) içinde faz sayaçları — tek başlangıç/durdurma yolu, tek sızıntı yüzeyi, kaynak gömme testlerinde gözlemi kolaylaşır.

### M4 [DÜŞÜK] `browser:event` zarfındaki çifte uyumluluğa son kullanma tarihi

- **Kanıt:** `main.js:2612` — zarf hem düz alanlar hem `payload` taşıyor.
- **Öneri:** Tüm renderer tüketicileri `payload`'a geçince düz alanları kaldır; geçiş bir sürüm boyunca `console.warn` ile izlenebilir.

---

## 5. Tasarım / UX önerileri

### T1 [YÜKSEK] Token disiplinini sıkılaştır

- **Kanıt:** `--player-amber` iki farklı değerde tanımlı (`styles.css:2052` `#e4a85d`, `styles.css:2824` `#f3bd4f`); `#858589`, `#5a4523`, `#64bdcc`, `#dedee2` başta olmak üzere 20+ hex değer token dışında. Oyuncu katmanı (`--player-*`) kendi ikinci paletini üretmiş durumda.
- **Öneri:** `--player-*` setini ana `:root` semantik token'larına bağla (`--player-amber: var(--accent)`); serbest hex'leri semantik token'lara taşı. CI'a styles.css için hex lint eklenebilir.

### T2 [YÜKSEK] Kısayollar ve klavye erişilebilirliği tamamlansın

- Mevcut durum iyi: `focus-visible` 34 kural, `role="tab"`, `aria-selected`, `aria-busy`, roving tabIndex. Eksikler: B3'teki kısayol listesi + sekme şeridi sağ tık menüsünün klavye alternatifi (Shift+F10 / Menü tuşu).

### T3 [ORTA] `!important` stratejisi (25 kullanım) tek mekanizmaya insin

- **Kanıt:** Çoğu `.hidden` çakışmasından (`styles.css:4-6` kendi yorumu itiraf ediyor). Gizleme `[hidden]` + tek kurala indirgenebilir. Medya sorguları da 10 farklı eşikte (520–1280) dağılmış; tek eşik seti tanımlanmalı.

### T4 [ORTA] Adres çubuğu arama sağlayıcısı ayara taşınmalı

- **Kanıt:** `main.js:2962` Google araması kod içinde sabit.
- **Öneri:** Ayarlar > Tarayıcı'ya sağlayıcı seçimi (Google/DuckDuckGo/Brave/Startpage + özel şablon). Uygulamanın gizlilik bilinçli kitlesiyle uyumlu; değişiklik yüzeyi küçük.

### T5 [DÜŞÜK] Okuma modu dar ekran mantığı tek yerde toplansın

- **Kanıt:** `matchMedia('(max-width: 1020px)')` 6 ayrı yerde (`renderer.js:15792, 15800, 16123, 17275, 17297, 18286`).
- **Öneri:** Tek `isNarrowLayout()` işlevi + `resize` değişiminde olay.

### T6 [DÜŞÜK] Sekme şeridine yükleme göstergesi

- `tab.loading` sınıfı var (`styles.css:4312` border rengiyle); spinner noktası + "Yükleniyor..." başlık yer tutucusu eklenebilir. B6 (favicon) ile birlikte yapılması doğal.

---

## 6. Yol haritası (önerilen uygulama sırası)

- [ ] **1. Encoding düzeltme geçişi (B1)** — kullanıcıya görünen tek gerçek hata kategorisi; riski düşük, etkisi yüksek. `.gitattributes` + CI denetimi ile kalıcı çözüm.
- [ ] **2. Popup sınırı (B2)** — küçük değişiklik, kaynak riskini kapatır.
- [ ] **3. Kısayollar (B3/T2)** — kullanıcının en çok hissedeceği iyileştirme, ucuz.
- [ ] **4. webRequest tekrarı kontrolü (B4)** — saatlik iş; önce doğrula, sonra düzelt.
- [ ] **5. Token birleştirme (T1) + favicon/spinner (B6/T6)** — görsel tutarlılık paketi.
- [ ] **6. Adres çubuğu arama sağlayıcısı (T4)** — küçük, bağımsız.
- [ ] **7. renderBrowserTabs diff (B5) + !important azaltma (T3)** — performans/bakım paketi.
- [ ] **8. `main.js` IPC ayrımı (M1)** — en büyük iş; sürüm sürüm taşınmalı. Yeni özellikler M1 sonrası yeni katmana yazılmalı, aksi takdirde borç büyür.
- [ ] **9. Renderer sekme temizliği (M2) + polling birleştirme (M3)** — M1 sonrası doğal devam.
- [ ] **10. İzin varsayılanları ayarı (B7) + indirme mesaj olayı (B8) + IPC çifte uyumluluk temizliği (M4)** — küçük kapanış işleri.

## 7. Not: ikinci tur incelemede temiz çıkan alanlar

Aşağıdaki modüller hedefli desen taramalarında (yaşam döngüsü, tekrar, sızıntı, dönüş hataları) somut bulgu vermedi; raporun güvenilirliği için kayda geçer:

- `browser-downloads.js` (B8'deki mesaj alanı hariç temiz)
- `browser-translation-scheduler.js` (abort/generation/backoff desenleri doğru)
- `browser-session-privacy.js` (bağlantı kesme sıralaması bilinçli ve doğru)
- `browser-subtitles.js` (innerHTML yok, tavanlar tanımlı, ayrıştırıcı kapsamı geniş)
- `browser-adblock.js` (çevre değişkeni geri yükleme disiplinli, önbellek boyut sınırlı)
- `browser-command-palette.js` (B3'teki kapsam kısıtı dışında temiz)

---

## 8. Ek tur: fonksiyon düzeyi yoklama testleri (2026-09-11)

Yukarıdaki bulgular statik incelemeden geliyordu; bu turda tarayıcı modüllerinin **saf fonksiyonları** ayrı bir yoklama betiğiyle (`\.tmp\browser-probes.js`, denetim amaçlı, test dizinine ait değildir) kenar durumlarıyla çalıştırıldı. Toplam **94 denetim noktası**: 13 bölüm (navigasyon politikası, parseTime, SRT/VTT/LRC ayrıştırma, aktif cue ikili arama, HLS, URL temizleme, sekme grupları, komut paleti, senkron, indirmeler, çeviri önbelleği, medya kimliği).

**Sonuç: 89 PASS, 5 şüpheli bulgu — 5'inin de doğrulama turunda kodun doğru, test beklentisinin hatalı olduğu kanıtlandı. Fonksiyon katmanında yeni gerçek bug bulunamadı.**

### 8.1 Doğrulanan sağlamlık (PASS özetleri)

| Alan | Doğrulanan davranışlar |
|---|---|
| Navigasyon politikası | `javascript:`/`data:`/`file:`/`ftp:`/`blob:`/`chrome:` şemaları reddedilir; büyük harf protokol/hostname normalize edilir; URL içi kimlik bilgisi reddi; 8 KB üstü URL reddi; control karakter reddi; `mailto` yalnız `browser-window-open` yüzeyinde harici; about:blank yalnız açılış yüzeyinde; same/cross-origin ilişkisi doğru |
| parseTime | `1:30`, `01:02:03,500`, `1h`, `250ms`, `.5` doğru; `1:2:3:4`, `abc`, boş → null |
| SRT/VTT/LRC | sıra bozuk küre sıralanır; ters süreli cue en az 80 ms olur; çakışan tekrar metin birleşir (rolling dedupe); WebVTT NOTE/STYLE blokları metne karışmaz; 12 MB üstü gövde boş döner; HTML sayfası cue üretmez; `cuesToSrt` gidiş-dönüş kayıpsız; çok etiketli LRC satırı çok cue üretir; kesirli LRC zamanı doğru |
| browserActiveCuesAt | yarı-açık aralık (biten cue aynı karede üst üste binmez); t=başlangıç anı doğru; NaN zaman boş; WeakMap prefix-önbelleği liste mutasyonundan sonra bile doğru (tail-cue kimlik koruması çalışıyor) |
| HLS | `#EXT-X-MEDIA` altyazı ortamı bulunur, URI mutlaklaştırılır; segment URI'leri çözülür; ana liste/altyazı listesi ayrımı doğru |
| safePlaceUrl | `token`/`utm`/`fbclid` temizlenir; URL içi kimlik bilgisi düşer; `#t=95` korunur; rota fragmentindeki `token`/`auth` da temizlenir; 4000+ karakter boş döner |
| Komut paleti | Türkçe I/İ normalizasyonu doğru (`ISTANBUL İSTANBUL` → `istanbul istanbul`); kısayol girdi filtresi Alt/keyUp/tanımsız tuşları reddeder |
| Senkron | scale aralık dışı ve aşırı offset reddedilir; kimliksiz kayıt reddedilir |
| İndirmeler | `attach` idempotent; maxActive sınırı uygulanır; `cancelAll` aktifleri bitirir ve terminal kayıtları kalıcılaştırır; `active:true` kalıntı geri yüklenmez |
| Çeviri önbelleği | limit < 100 → 100'e yükseltilir; boş anahtar/değer reddedilir; LRU 100 ile sınırlı ve diske yansır; bozuk ana dosya `.bak`'tan kurtarılır |
| Medya kimliği | `www.` / `t=30s` / utm farklarından bağımsız stabil kimlik anahtarı (`youtube:abc`); canonicalUrl yalnız meta veri |

### 8.2 Sahte alarm turu (5 bulgunun çözümü — kod doğru)

1. **Aktif cue t=2** — "uzun" cue 2.5'te başladığından t=2'de aktif olmaması doğru; t=2.6'da `[b, uzun]` döndüğü doğrulandı.
2. **Rota fragmenti `tkn`** — `tkn` kısaltması hassas-parametre listesinde yok (bilinçli kapsam); `token`/`auth` fragmentte de temizleniyor.
3. **Türkçe arama beklentisi** — yazım hatası test beklentisindeydi; fonksiyon doğru.
4. **`maxActive=0`** — destructuring varsayılanı yalnız `undefined`'da devreye girer; 0 "tüm indirmeleri reddet" anlamındadır ve doğru uygulanır.
5. **Medya kimliği** — kimlik nesnenin tamamı değil `key` alanı üzerinden kurulmuş; `t=30s` URL'de kalsa da anahtar stabil. Doğru tasarım.

### 8.3 Bu turdan kalan düşük öncelikli notlar

- **[DÜŞÜK] İndirme mesaj alanı (B8) betikle de teyit edildi:** ardışık iki ret durumunda tek global `message` yalnız son mesajı taşır; olay tabanlı mesaj kuyruğu daha doğru olur.
- **[DÜŞÜK] `maxActive`/`maxRecords` için 0 anlamlı bir değer** ("hepsini reddet") — davranış doğru ama belgelenmemiş; fabrika JSDoc'unda belirtilmeli.
- **[NOT] `safePlaceUrl` hassas-parametre listesi kısaltmaları kapsamaz** (`tkn`, `pwd`, `sig2` gibi) — `signature`/`sig` var; kapsam bilinçli, genişletmek ucuz.

### 8.4 Yöntem ve tekrarlanabilirlik

- Betik: `D:\Whisper Local\.tmp\browser-probes.js` — `node .tmp/browser-probes.js` ile çalışır; yalnız saf modülleri `require` eder, Electron gerektirmez.
- Tam proje test paketi (aynı gün): **140 dosya, 807 test, 0 başarısız.**
- Fonksiyon katmanı bu denetimle birlikte üç bağımsız yöntemden geçti: proje test paketi (807), statik desen taraması (bölüm 1-5), kenar durumu yoklaması (94 nokta). Katman sağlam; riskler yapısal (B1-B8, M1-M4) ve arayüz (T1-T7) tarafında yoğunlaşıyor.

---

## 9. Üçüncü tur: tarayıcı altyazı **çevirisi** derinlemesine inceleme (2026-09-11)

Kapsam: canlı altyazı çeviri hattı uçtan uca — `startBrowserTranslation` (`main.js:5558`) → `BrowserTranslationScheduler` → `requestBrowserSentenceTranslation` → endpoint failover → `distributeTranslation` → renderer uygulaması. Yöntem: kod okuma + saf fonksiyon yoklamaları (`.tmp\translation-probes.js`, 33 PASS) + zamanlayıcı entegrasyon testleri + **gerçek API çağrısı** (Electron içinde DPAPI ile anahtar çözülerek, uygulamanın birebir istek biçimiyle) + Electron smoke testleri.

### 9.1 Doğrulanan doğru davranışlar (test kanıtlı)

| Alan | Sonuç |
|---|---|
| Cümle kurma (`assembleCueSentences`) | 1,2 sn boşluk / 12 sn süre / 280 karakter / 6 parça sınırları doğru; tire, `SPEAKER:`, `♪` korumalı cue'lar tek başına; `Dr.`/`Mrs.` kısaltması cümle bitirmez; konuşmacı değişimi cümleyi böler |
| Yanıt çözme (`decodeSentenceTranslation`) | JSON zarfı, ```json çit, düz metin, bozuk JSON, JSON dizisi, parts sayısı uyuşmazlığı — hepsi doğru işlenir |
| Dağıtım (`distributeTranslation`) | model parts öncelikli; parts yoksa süre-ağırlıklı; kelime < parça durumunda birleştirme; CJK boşluksuz metinde grapheme dağıtımı (test edildi: `こんにちは世界` → iki cue'ya kayıpsız) |
| Önbellek | aynı cümleler ikinci turda **0 API çağrısı**, `cached:true` (sahte sağlayıcıyla ölçüldü) |
| Yeniden deneme | 3 denemeden sonra terminal hata, `attempts=3`, üstel geri çekilme; `retryFailed` terminalleri geri koyar |
| Güvenlik | prompt injection koruması ("metin güvenilmez veridir" talimatı); 20 sn istek zaman aşımı; 2 MB yanıt sınırı; HTTPS zorunluluğu (yerel HTTP hariç); API anahtarı DPAPI kasasında, `withoutSecretEnv` ile alt süreçlere sızdırılmaz |
| **Gerçek API (OpenAI)** | `GET /models` → 200, yapılandırılmış model listede; 2 cümle çevirisi başarılı: "The Winterfell chronicler remembers everything." → "Winterfell vakainüvisi her şeyi hatırlıyor." (2 parça, bütçe içinde: 22/50 ve 20/48 karakter); "Kombai arrived yesterday." → "Kombai dün geldi."; `gpt-5.*` için `developer` rolü + `max_completion_tokens` doğru uygulandı |
| Electron smoke | `electron-subtitle-output-smoke`: 4 senaryo (local / youtubePlayer / browserYoutube / pair) tamamı `ok:true` — çeviri izi yükleme, rol atama, kaynak+çeviri eşleştirme çalışıyor |

### 9.2 Yeni bulgular

#### TR1 [ORTA — test ile doğrulandı] Öğrenilen terminoloji, altyazı çevirisinde önbellek anahtarına işlenmez

- **Kanıt (kod):** `main.js:5638` — altyazı çevirisinin `onResult`'unda `context.terminologyVersion` güncellenir ama **`scheduler.setContext()` çağrılmaz**. Sayfa çevirisi yolu ise `main.js:4284`'te `scheduler.setContext(...)` çağırır — iki yol tutarsız.
- **Kanıt (test):** `translationCacheKey` `terminologyVersion`'ı anahtara dahil eder (doğrulandı). Zamanlayıcı kurucudaki bağlamı tuttuğu için, terminoloji öğrenildikten sonra çevrilen cümleler **eski (`terminologyVersion:''`) anahtarla önbelleklenir**. Doğrulama betiği (`.tmp\tr1-verify.js`): `s2 ESKI anahtar altinda yazildi: true / YENI anahtar altinda: false`.
- **Etki:** Terminoloji etkinken önbellek isabet oranı düşer (aynı cümle yeni terimlerle tekrar çevrilir); daha önemlisi, sonraki oturumlarda terminoloji değişse bile eski çeviri yanlışlıkla isabet edebilir (anahtar öğrenilmiş terimleri yansıtmaz). Sayfa çevirisi bu hatadan etkilenmez.
- **Düzeltme önerisi:** `main.js:5638`'deki `onResult` içine, sayfa yolundakiyle aynı satırı ekleyin: `scheduler.setContext({ terminologyVersion: context.terminologyVersion });` (yalnızca `config.terminologyEnabled` dalında).
- **Tahmini çaba:** 15 dakika + `browser-translation-cache.test.js`'e yeni terminoloji sürümüyle anahtar değişimini doğrulayan bir test.

#### TR2 [ORTA — kullanıcıya görünen] Taze profilde tarayıcı çalışma alanı ilk açılışta gecikiyor; smoke testi bu yüzden başarısız

- **Kanıt:** `npx electron tests\electron-browser-subtitle-smoke.js` taze temp profille çalıştırıldığında `AssertionError: Browser çalışma alanı açılmadı` (15 sn içinde `player.browserActiveTabId` oluşmadı). Aynı test, profil önceden ısınmışken sorunsuz geçer.
- **Kök neden (kod kanıtı):** İlk navigasyon yolu `main.js:3174`'te `await waitForBrowserAdblockReady()` çağırır. Taze profilde reklam filtresi motoru (`browser-adblock.js` `loadEngine`) Ghostery listelerini ağdan indirir (önbellek dosyası yok). Bu indirme `waitUntilReady` zincirini ve dolayısıyla ilk sekme/view yaratımını bloklar; `fetchTimeoutMs` 10 sn + yeniden denemelerle 15 sn'yi aşabilir.
- **Etki:** İlk kurulumda (veya `browser-adblock-engine.bin` silindikten sonra) kullanıcı tarayıcıyı ilk açtığında boş/gecikmeli bir ekran görür; CI'da taze profil kullanan smoke testi güvenilmezdir (flaky).
- **Düzeltme önerisi:** İlk navigasyonu adblock hazırlığına **bloklamayın**: `waitForBrowserAdblockReady` çağrısını `await` yerine arka planda başlatıp (`void ensureBrowserAdblockReady()`), motor hazır olunca `enableBlockingInSession` uygulayın. Adblock zaten `setEnabled` içinde `enablePromise` ile idempotent; ilk sayfalar filtrelenmeden yüklenir, sonrakiler filtrelenir — kabul edilebilir bir ilk-açılış ödünü. Alternatif: motor indirilirken sekme hemen açılsın, durum çubuğunda "Reklam filtreleri hazırlanıyor…" gösterilsin.
- **Tahmini çaba:** 2–3 saat + smoke testinin taze profilde tekrar geçtiğinin doğrulanması.

#### TR3 [DÜŞÜK] Smoke testleri süreçleri arkada bırakıyor

- **Kanıt:** `electron-subtitle-output-smoke.js` ve `electron-browser-subtitle-smoke.js` çalıştırıldıktan sonra 3 `electron.exe` süreci açık kaldı (elle `Stop-Process` gerekmedi; `taskkill /T /F` ile temizlendi). `electron-subtitle-output-smoke` kendi `cleanup`'ında `taskkill` çağırıyor ama başarı yolunda süreç ağacı her zaman ölmüyor.
- **Etki:** Ardışık test çalıştırmalarında port/profil çakışması; CI'da zombi süreç.
- **Düzeltme önerisi:** Smoke betiklerinin `finally` bloğunda `taskkill /pid <pid> /T /F` **her durumda** çalışsın (şu an bazı erken-çıkış yollarında atlanıyor). `process.on('exit')` ve `process.on('SIGINT')`'e de aynı temizlik bağlanmalı.
- **Tahmini çaba:** 1 saat.

### 9.3 Geliştirme önerileri (çeviri hattı)

- **[ÖNERİ — ORTA] TR1 ile aynı satırda:** terminoloji öğrenimi her sonuçta `terminologyPrompt` + sha1 hesaplıyor (`main.js:5638`). Cümle başına hash maliyeti küçük ama 500 cümlelik izde birikir. `setContext` çağrısı eklendiğinde, hash'i yalnızca `terms` Map'i gerçekten değiştiğinde (sayı arttığında) yeniden hesaplayın — `learnTerminology` dönüş değeri zaten `qualified` sayısı veriyor.
- **[ÖNERİ — DÜŞÜK] Çeviri ilerlemesinde tahmini kalan süre:** `emitState` `estimatedTokens` üretiyor (`browser-translation-scheduler.js`); renderer'da bu gösterilmiyor. "X cümle kaldı (~Y sn)" göstergesi, uzun izlerde kullanıcıya gerçek beklenti verir. Token hızı ilk birkaç sonuçtan ölçülüp kaba bir ETA üretilebilir.
- **[ÖNERİ — DÜŞÜK] 429 için ayrı geri çekilme:** `shouldFailoverTranslationStatus` 429'u failover dışı bırakıyor (doğru — kota sorunu rota sorunu değil). Zamanlayıcı ise tüm hatalara aynı üstel geri çekilmeyi uygular (1s→2s→4s, max 10s). 429 için `Retry-After` başlığı okunup ona uyulması, kota dostu olur ve gereksiz istekleri önler. `requestBrowserSentenceTranslationAtEndpoint` hataya `httpStatus` ekliyor; `Retry-After` de eklenebilir.
- **[ÖNERİ — DÜŞÜK] Sözlük kesintisi kalıcı uyarı:** `browserGlossaryTruncationNotified` tek seferlik modül bayrağı (`main.js:3601`). Uygulama ömrü boyunca bir kez loglanır; kullanıcı sözlüğünün kesildiğini ayarlarda görmez. Ayarlar > Çeviri'de "Sözlük N terimle sınırlı, M terim kesildi" göstergesi daha görünür olur.

### 9.4 Bu turun test araçları (tekrarlanabilir)

- `.tmp\translation-probes.js` — 33 noktalı saf fonksiyon + zamanlayıcı yoklaması (`node .tmp/translation-probes.js`).
- `.tmp\tr1-verify.js` — TR1'in minimal kanıtı (`node .tmp/tr1-verify.js`).
- `.tmp\electron-api-probe.js` — gerçek API zinciri (DPAPI anahtar çözme + uygulamanın istek biçimiyle OpenAI çağrısı; `npx electron .tmp/electron-api-probe.js`). Anahtar yalnızca bellekte kullanılır, hiçbir yere yazılmaz.
- Electron smoke: `electron-subtitle-output-smoke` (geçti), `electron-browser-subtitle-smoke` (TR2 nedeniyle taze profilde başarısız), `electron-browser-trusted-bridge` (geçti).

### 9.5 Güncellenmiş öncelik listesi (çeviri hattı ekleri)

1. **TR2** — ilk açılış gecikmesi + flaky smoke (kullanıcıya görünen, CI güvenilirliği)
2. **TR1** — önbellek doğruluğu (15 dakikalık düzeltme, kalıcı etki)
3. **TR3** — test hijyeni
4. B1 encoding (önceki turdan, hâlâ en yüksek kullanıcı-görünür etki)
5. 429 `Retry-After` + ETA göstergesi (kota dostu iyileştirmeler)

---

## 10. Düzeltme doğrulama turu (2026-09-11)

Başka bir oturum, BROWSER_BUG_REPORT_15-21 + bu rapor + Rapor-2026-09-11 üzerine 5 dosyada düzeltme yaptı (`src/browser-subtitles.js`, `src/settings-security.js`, `src/subtitle-word-sidecar.js`, `src/text-stability-evaluator.js`, `tests/browser-subtitles.test.js`; commit edilmemiş). Bu bölüm bağımsız doğrulama turunun sonucudur.

**Yöntem:** tam test paketi + bu raporun 94 noktalık bağımsız yoklaması (`\.tmp\browser-probes.js`, değişiklik öncesiyle birebir aynı sonuç → regresyon yok) + 17 hedefli doğrulama testi + `mergeBrowserStreamCues` çağıran analizi (tek çağıran atama tabanlı: `browserTrackBuffers.set(streamKey, merged)` — mutasyonsuz sürüm güvenli).

### 10.1 Doğrulanan düzeltmeler

| İddia | Sonuç | Not |
|---|---|---|
| `parseTime(0)` sıfırı korur | DOĞRULANDI | `value ?? ''` — minimal ve doğru |
| `mergeBrowserStreamCues` mutasyonsuz | DOĞRULANDI | `merged.slice(-maximum)` önceki `splice` davranışıyla eşdeğer; test de güncellenmiş |
| WebVTT `v.class` temizliği | DOĞRULANDI | `<v.buyuk Kim>`, `<v.buyuk>`, `<v Kim>` formlarının üçü de temizleniyor |
| Zaman satırı satır başına sabitlendi | DOĞRULANDI | diyalog metnindeki `-->` artık cue bölmüyor; satır başı boşluklarına izin veriliyor |
| Kısmi X-TIMESTAMP-MAP ofset üretmez | DOĞRULANDI | yalnız MPEGTS varsa ofset 0 (önceki kodmapped-0 uyguluyordu); tam haritada ofset doğru |
| SAMI `</Sync>` sızması yok | DOĞRULANDI | |
| DASH tüm Representation kayıtları | DOĞRULANDI* | baseUrl verildiğinde (gerçek kullanım) 2/2 keşfediliyor; bkz. 10.2 N1 |
| Göreli uzantısız altyazı yolu | DOĞRULANDI | ipucu taşıyan anahtar gerektirir (`captions`, `subtitleUrl`...) — tasarım gereği, `src` gibi genel anahtarlar reddediliyor (doğru) |
| Kararlı metin yeniden yayını | DOĞRULANDI | `duplicateWindowMs` koşulu kalktı; aynı fingerprint süresiz duplicate; metin değişince (`delete publishedAt`) yeni yayın hakkı — 6 senaryo testte doğru |
| Bozuk/dil ekli kelime yan-dosyası | DOĞRULANDI | bozuk JSON → boş dönüş (çökme yok); `video.en.srt` → `video.json` yedeği çalışıyor |
| `translateDedupe` ayar şemasında | DOĞRULANDI | `PERSIST_CHECKBOX_CONTROLS` listesinde |

### 10.2 Bu turdan yeni bulgular

- **N1 [DÜŞÜK]** `parseDashSubtitleTracks`: baseUrl boş/çözülemez olduğunda boş URL'li iz push edilebiliyor ve boş URL'ler birbirini tekilleştiriyor (ikinci representation sessizce eleniyor). Gerçek kullanımda manifest URL'si her zaman verildiğinden etkisi sınırlı; `if (!url) continue;` savunması önerilir.
- **TR1 ve TR2 düzeltilmedi:** `main.js`'e dokunulmadı. Terminoloji önbellek anahtarı tutarsızlığı (TR1, tek satırlık `scheduler.setContext` düzeltmesi) ve taze profilde ilk gezinmenin `waitForBrowserAdblockReady`'de beklemesi (TR2) açık kalıyor.

### 10.3 Doğrulama testleri

- `node tests/run-all.js` → **exit=0, tüm paket geçti** (Node + Python).
- Bağımsız 94 noktalık yoklama → öncekiyle birebir aynı sonuç (89 PASS + 5 bilinen test-hatası) → parser değişiklikleri regresyon yaratmadı.
- Hedefli doğrulama: 17 PASS (10 parser/stability + 6 stability senaryosu + DASH baseUrl'li).
- Diğer oturumun çalıştırdığı alt kümeler de bağımsız olarak tekrarlandı ve geçti.

**Sonuç:** Düzeltilen 11 madde gerçek ve doğru; değişiklikler dar kapsamlı ve testleri kırmıyor. TR1/TR2 ve yol haritasındaki B/M/T maddeleri dokunulmadan duruyor.
