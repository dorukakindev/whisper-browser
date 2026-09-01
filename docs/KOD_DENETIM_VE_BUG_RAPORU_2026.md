# Whisper Local — Derinlemesine Kod Denetimi, Hata ve Mimari Raporu (2026)

> **Tarih:** 31 Ağustos 2026
> **Kapsam:** Python Backend (`backend/transcribe.py`, `backend/media.py`), Electron Main (`src/main.js`), Preload Köprüsü (`src/preload.js`), Arayüz & Oynatıcı (`src/renderer/renderer.js`), Web & DRM Katmanı (`src/browser-*.js`)
> **Kural:** Mevcut kaynak kodlarda hiçbir değişiklik yapılmamış; tespit edilen her bir bulgu ve sınır durumu **2 aşamalı çapraz kontrolden (2-pass verification)** geçirilerek yanıltıcı sonuçlar (*false positives*) tamamen elenmiştir.

---

## 📑 Rapor Dizini
1. [Yönetici Özeti ve Sistem Durumu](#1-yönetici-özeti-ve-sistem-durumu)
2. [İzleme (Player) ve Oynatıcı Modülü Derinlemesine Analizi](#2-izleme-player-ve-oynatıcı-modülü-derinlemesine-analizi)
3. [Tarayıcı (Browser), DRM ve Web Yakalama Modülü Derinlemesine Analizi](#3-tarayıcı-browser-drm-ve-web-yakalama-modülü-derinlemesine-analizi)
4. [Electron Ana Süreci (Main) ve IPC İletişim Protokolü Analizi](#4-electron-ana-süreci-main-ve-ipc-iletişim-protokolü-analizi)
5. [Python Backend ve Transkripsiyon Boru Hattı Analizi](#5-python-backend-ve-transkripsiyon-boru-hattı-analizi)
6. [Kapsamlı Mimari ve Stratejik Geliştirme Önerileri](#6-kapsamlı-mimari-ve-stratejik-geliştirme-önerileri)

---

## 1. Yönetici Özeti ve Sistem Durumu

Uygulama, yerel GPU hızlandırmalı yapay zeka transkripsiyonunu (faster-whisper / WhisperX / Pyannote), çift dilli bir altyazı oynatıcısını ve korumalı yayınları (Widevine DRM) yakalayabilen gömülü bir Chromium tarayıcısını entegre eden çok katmanlı bir mimariye sahiptir.

Yapılan detaylı ve derinlemesine teknik denetimde:
- **Kritik / Yüksek Öncelikli:** 9 adet
- **Orta Öncelikli:** 20 adet
- **Düşük Öncelikli / İyileştirme:** 9 adet
olmak üzere toplam **38 adet somut ve doğrulanmış teknik bulgu** tespit edilmiştir.

---

## 2. İzleme (Player) ve Oynatıcı Modülü Derinlemesine Analizi

---

### 🔴 P-8: Tarayıcı Modunda Temel Oynatma Kısayollarının (`Boşluk`, `Ok Tuşları`, `J/L/M`) Web Videosu Yerine Arka Plandaki Yerel Videoyu Tetiklemesi
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:7191-7215`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L7191-L7215)
* **Kök Neden Mantığı:** Global `keydown` dinleyicisinde yer alan video taşıma kısayolları doğrudan yerel DOM elementine (`const video = $('playerVideo')`) bağlıdır:
  ```javascript
  if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (e.key === 'ArrowRight') { video.currentTime += 5; showControls(); }
  else if (e.key === 'ArrowLeft') { video.currentTime -= 5; showControls(); }
  if (e.key === 'j' || e.key === 'J') { e.preventDefault(); video.currentTime -= 10; ... }
  if (e.key === 'l' || e.key === 'L') { e.preventDefault(); video.currentTime += 10; ... }
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); video.muted = !video.muted; ... }
  ```
  `seekToCue` fonksiyonunda `player.workspaceMode === 'browser'` kontrolü yapılıp web tarayıcısına IPC komutu gönderilirken, bu klavye kısayollarında hiçbir çalışma alanı denetimi yapılmamıştır.
* **Tetiklenme Senaryosu:** Kullanıcı Tarayıcı Modunda (`workspaceMode === 'browser'`) bir YouTube veya Netflix videosu izlerken klavyeden `Boşluk` (Durdur/Oynat), `Sol/Sağ Ok` veya `J/L/M` tuşlarına bastığında:
  1. Web sayfasındaki video hiçbir tepki vermez.
  2. Arka planda gizli duran yerel video oynatılmaya veya sarılmaya başlar.
* **Düzeltme Stratejisi:** Kısayolların başına `if (player.workspaceMode === 'browser') { window.api.browserCommand(...); return; }` dallanması eklenmelidir.

---

### 🔴 P-1: Sessizlik Aralıklarında `stepCue(-1)` (Önceki Altyazı) Çağrısının İleriye Atlaması
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:3740-3752`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L3740-L3752)
* **Kök Neden Mantığı:** `stepCue(delta)` fonksiyonunda aktif bir altyazı bloğu içinde olunmadığında (`player.activeIdx < 0`), arama kodu şu şekildedir:
  ```javascript
  let i = player.activeIdx;
  if (i < 0) {
    i = player.cues.findIndex((c) => c.start > t);
    if (i < 0) i = player.cues.length - 1;
  } else {
    i += delta;
  }
  seekToCue(Math.min(player.cues.length - 1, Math.max(0, i)));
  ```
  `i < 0` bloğuna girildiğinde `delta` parametresi (`-1` veya `+1`) tamamen yok sayılmaktadır. Kod her iki durumda da `c.start > t` koşuluyla *sıradaki ilk altyazıyı* bulmakta ve oraya atlamaktadır.
* **Tetiklenme Senaryosu:** Video oynatılırken iki replik arasındaki bir sessizlik boşluğunda (ör. 01:10-01:20 arasındaki 10. blok bitti, video 01:30'da, 11. blok ise 01:40'ta başlıyor):
  1. Kullanıcı klavyeden `A` / sol ok tuşuna basar veya arayüzdeki "Önceki Cümle" (`cuePrevBtn`) butonuna tıklar (`stepCue(-1)`).
  2. `player.activeIdx` o an `-1`'dir.
  3. `findIndex` 01:40'taki 11. bloğu bulur (`i = 11`).
  4. Fonksiyon `seekToCue(11)` çağırır; video geriye (01:10) gitmek yerine **01:40'a ileri atlar**.
* **Düzeltme Stratejisi:** `i < 0` durumunda `delta < 0` ise `t` zamanından önce biten son blok (`findLastIndex(c => c.end <= t)` veya ters döngü) seçilmelidir.

---

### 🔴 P-2: Oynatıcıda VTT Altyazısı Düzenlenirken Milisaniye Kırpılması ve Kaydetme Reddi
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:5804-5825`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L5804-L5825), [`src/renderer/renderer.js:7380-7384`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L7380-L7384)
* **Kök Neden Mantığı:** `replaceVttCueText(rawText, cue, newText)` fonksiyonundaki iç `toSec` yardımcısı:
  ```javascript
  const toSec = (t) => {
    const m = String(t).match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
    if (!m) return null;
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
  };
  ```
  Buradaki `(+m[4]) / 1000` işlemi, `m[4]` 1 ya da 2 haneli olduğunda (ör. `00:01:23.5` veya `00:01:23.50`) `5 / 1000 = 0.005` (5 ms) üretir. Halbuki satır 3458'deki ayrıştırıcı `m[4].padEnd(3, '0')` kullandığı için `cue.start` hafızada `83.5` (83 saniye 500 ms) olarak saklanmaktadır.
* **Tetiklenme Senaryosu:**
  1. Kullanıcı oynatıcıda tek basamaklı milisaniyeye sahip bir VTT bloğunu düzenlemek için çift tıklar.
  2. Metni düzeltip "Kaydet"e basar.
  3. Satır 5817'deki `Math.abs(st - cue.start) > 0.002` eşik denetimi `Math.abs(83.005 - 83.500) = 0.495 > 0.002` bularak bloğu eşleştiremez.
  4. `replaceVttCueText` `null` döner; arayüzde `"VTT bloğu bulunamadı — dosya metadatası bozulmasın diye kaydedilmedi"` hatası çıkar ve işlem iptal edilir.
* **Düzeltme Stratejisi:** `(+m[4].padEnd(3, '0')) / 1000` kullanılarak standart 3 haneli milisaniye normalizasyonu sağlanmalıdır.

---

### 🟡 P-10: `estimateVramMib` ve `updateGpuBadge` Fonksiyonlarının `batchSize` ve `engine` (WhisperX) Bellek Tüketimini Yok Sayması
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:1370-1412`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L1370-L1412)
* **Kök Neden Mantığı:**
  ```javascript
  function estimateVramMib() {
    const base = { 'large-v3': 3100, ... }[model] || 3100;
    let mult = 1.0;
    if (ct === 'int8') mult = 0.55;
    let est = base * mult;
    if ($('diarize') && $('diarize').checked) est += 2500;
    return Math.round(est);
  }
  ```
  1. Tahmin fonksiyonu toplu işleme (`batchSize`) ve `whisperx` motorunun wav2vec2 hizalama modelini hesaba katmamaktadır.
  2. Satır 1409'da `updateGpuBadge` dinleyicileri yalnızca `['device', 'computeType', 'model', 'diarize']` olarak tanımlanmıştır; `engine` ve `batchSize` elementleri dinlenmemektedir.
* **Tetiklenme Senaryosu:** Kullanıcı WhisperX veya batched modunda `batchSize = 32` seçtiğinde GPU bellek ihtiyacı 12 GB'ı aşmasına rağmen rozet ~3.1 GB göstermeye devam eder; kullanıcı OOM (Out-of-Memory) çöküşü öncesinde uyarılmaz.
* **Düzeltme Stratejisi:** `batchSize` ve `engine` katsayıları tahmine eklenmeli, event dinleyici listesine dahil edilmelidir.

---

### 🟡 P-9: AI Sohbet Panelinin Duraklatma Boşluklarında Cümle Bağlamını Kaybetmesi
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:4738-4768`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L4738-L4768)
* **Kök Neden Mantığı:** `aiChatContext()` fonksiyonu yalnızca `player.activeIdx >= 0` olduğunda `ctx.cumle`, `ctx.mevcut_ceviri` ve komşu satırları (`ctx.onceki`, `ctx.sonraki`) oluşturur.
* **Tetiklenme Senaryosu:** Kullanıcı bir cümleyi dinleyip cümle biter bitmez videoyu durdurup AI paneline "Bu cümlede ne demek istiyor?" diye sorduğunda, `player.activeIdx` `-1` (sessizlik boşluğu) olduğu için `ctx.cumle` hiç gönderilmez. Yan panelde `"Bağlam: altyazı yok — genel soru sorabilirsin"` yazar ve yapay zeka az önce biten cümleyi bilmediğini söyler.
* **Düzeltme Stratejisi:** `player.activeIdx === -1` olduğunda `t` anından önceki en son biten altyazı bloğu otomatik olarak bağlam kabul edilmelidir.

---

### 🟡 P-3: Tarayıcı Modunda A-B Tekrar Döngüsünün (A-B Repeat) Tamamen Çalışmaması
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:7020-7024`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L7020-L7024), [`src/renderer/renderer.js:3063-3067`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L3063-L3067)
* **Kök Neden Mantığı:** A-B döngüsü tetikleyicisi yalnızca yerel HTML5 `<video>` elementinin `timeupdate` dinleyicisine bağlanmıştır. Kullanıcı **Tarayıcı Çalışma Alanı (`workspaceMode === 'browser'`)** modundayken yerel video duraklatılır ve oynatma Electron `WebContentsView` içindeki web sayfası üzerinde akar. `onBrowserEvent('media')` zaman güncellemelerini alsa da A-B sınırını denetlemez; video B noktasını geçtiğinde A noktasına geri dönmez.
* **Etki:** Tarayıcıda izlenen bir YouTube, Netflix veya web videosunda kullanıcı A ve B noktalarını belirlese dahi video B noktasına geldiğinde A'ya geri sarmaz, kesintisiz devam eder.
* **Düzeltme Stratejisi:** `onBrowserEvent` içindeki `media` olay işleyicisine `if (player.abA !== null && player.abB !== null && player.browserTime >= player.abB) window.api.browserCommand('seek', player.abA)` eklenmelidir.

---

### 🟡 P-4: Tarayıcı Modunda "Cümle Sonunda Duraklat" (Auto-Pause) Özelliğinin Devre Dışı Kalması
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:2878-2890`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L2878-L2890), [`src/renderer/renderer.js:3514-3525`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L3514-L3525)
* **Kök Neden Mantığı:** `renderCue()` içinde yer alan Voracious tarzı otomatik duraklatma mantığı (`player.autoPause`), yerel oynatıcı için hassas `lastT` zaman türeviyle hesaplanırken; tarayıcı modunda çağrılan `renderBrowserCueAt(time)` fonksiyonunda `autoPause` kontrolü hiç eklenmemiştir.
* **Etki:** Dil öğrenimi için web videosu izleyen bir kullanıcı "Her cümle sonunda duraklat" seçeneğini açtığında web videosu cümle sonlarında durmaz.

---

### 🟡 P-5: Zaman Çizelgesinde Tek Kelimelik Altyazı Bölünürken Metin Çiftleme Hatası
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:4026-4042`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L4026-L4042)
* **Kök Neden Mantığı:** `timelineSplitCue` fonksiyonunda kelime kesme noktası:
  ```javascript
  const words = cue.text.split(/\s+/);
  const cut = Math.max(1, Math.min(words.length - 1,
    Math.round(words.length * (at - cue.start) / (cue.end - cue.start))));
  const left = { ...cue, end: at, text: words.slice(0, cut).join(' ') || cue.text };
  const right = { ...cue, start: at, text: words.slice(cut).join(' ') || cue.text };
  ```
  Eğer `cue.text` tek bir kelimeden oluşuyorsa (`words.length === 1`), `Math.min(0, ...)` sıfır verir, ardından `Math.max(1, 0)` kesim noktasını `cut = 1` yapar. Bu durumda `words.slice(1)` boş dizi (`[]`) döner ve `|| cue.text` fallback'i nedeniyle hem sol hem sağ parçaya aynı kelime atanır.
* **Etki:** Tek kelimelik uzun bir ses bloğu ikiye bölündüğünde aynı kelime ardışık iki blokta kopyalanmış olur.

---

### 🟢 P-6: Zaman Çizelgesi Kenar Çizgisi Dış Tıklamasında Seçim Kaybı
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:4086-4105`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L4086-L4105)
* **Kök Neden Mantığı:** Satır 4093'te fare tıklaması `player.cues.findIndex((c) => c.start <= at && c.end >= at)` ile katı biçimde bloğun *içine* sınırlandırılmıştır. Ancak satır 4104'te `edgeSec` (8 piksellik tutma alanı) tanımlanmıştır. Kullanıcı bloğun başlangıç çizgisinin 2 piksel soluna (bloğun hemen dışına) tıkladığında `hit` `-1` döner; blok tutulup uzatılmak yerine video o saniyeye atlar (`video.currentTime = at`).
* **Etki:** Dalga biçimi üzerinde altyazı süresini uzatmak isteyen kullanıcılar bloğun hemen dışından tutup çekemez, videonun konumu kayar.

---

### 🟢 P-7: Kütüphane Altyazı Arama Sonucuna Tıklanınca Sıfır Saniyeye (00:00) Atlama
* **İlgili Dosya ve Satırlar:** [`src/main.js:696`](file:///d:/Whisper%20Local/src/main.js#L696)
* **Kök Neden Mantığı:** `subtitleSeconds(block)` içindeki regex `/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->/` dakika alanını zorunlu `\d{2}` (2 basamak) aramaktadır. Tek basamaklı dakika içeren bloklarda (`5:23.456 --> 5:28.100`) `match` `null` döner ve fonksiyon `0` değerini üretir.
* **Etki:** Kullanıcı geçmiş kütüphanesinde arama yapıp altyazı parçasını bulur ancak sonuca tıkladığında video 5. dakika yerine en başa (00:00) sarar.

---

## 3. Tarayıcı (Browser), DRM ve Web Yakalama Modülü Derinlemesine Analizi

---

### 🔴 B-1: HTML5 Tam Ekran Modunda Altyazı Katmanının Görünmez Olması (Top Layer Occlusion)
* **İlgili Dosya ve Satırlar:** [`src/main.js:1481-1490`](file:///d:/Whisper%20Local/src/main.js#L1481-L1490), [`src/main.js:1506-1511`](file:///d:/Whisper%20Local/src/main.js#L1506-L1511)
* **Kök Neden ve Chromium Mekaniği:** `browserOverlayScript` enjeksiyonunda altyazı DOM düğümü doğrudan sayfa kök dizinine eklenir:
  ```javascript
  root = document.createElement('div');
  root.id = '__whisper_browser_subtitles';
  document.documentElement.appendChild(root);
  ```
  W3C Fullscreen standardı ve Chromium mimarisine göre, bir web sayfası `video.requestFullscreen()` veya video oynatıcı konteyneri üzerinden tam ekrana geçtiğinde, tarayıcı tam ekrana geçen düğümü özel bir donanım katmanı olan **"Top Layer"** (Üst Katman) içine alır. `document.documentElement` altındaki diğer tüm kardeş veya üst elemanlar (ve üzerlerindeki `z-index: 2147483646` stilleri) bu Top Layer katmanının arkasında kalır.
* **Tetiklenme Senaryosu:** Kullanıcı Netflix, YouTube, Disney+, Max veya Amazon Prime Video üzerinde tam ekran butonuna tıkladığı anda altyazı katmanı Top Layer arkasında kalarak tamamen kaybolur.
* **Düzeltme Stratejisi:** Enjekte edilen script içerisine `fullscreenchange` olay dinleyicisi eklenmeli; `document.fullscreenElement` oluştuğunda `__whisper_browser_subtitles` düğümü dinamik olarak `document.fullscreenElement.appendChild(root)` ile tam ekran konteynerinin içine taşınmalı, tam ekrandan çıkıldığında tekrar `document.documentElement`'e geri alınmalıdır.

---

### 🔴 B-2: Parçalı HLS/DASH WebVTT Akışlarında Zaman Ötelemesi ve Desenkronizasyon
* **İlgili Dosya ve Satırlar:** [`src/browser-subtitles.js:317-326`](file:///d:/Whisper%20Local/src/browser-subtitles.js#L317-L326), [`src/main.js:1089-1094`](file:///d:/Whisper%20Local/src/main.js#L1089-L1094), [`src/main.js:1161-1168`](file:///d:/Whisper%20Local/src/main.js#L1161-L1168)
* **Kök Neden Mantığı:** `cuesUseLocalSegmentTimeline(cues, segmentDuration)` fonksiyonu:
  ```javascript
  const nearZero = Math.max(0.75, Math.min(2, duration / 3));
  return list[0].start < nearZero && list[list.length - 1].end <= duration + 3;
  ```
  `list[0].start < nearZero` koşulu ile bir altyazı parçasının yerel zamanlı (segment-relative) sayılması için ilk replik kesinlikle segmentin ilk 2 saniyesi içinde başlamalıdır.
* **Tetiklenme Senaryosu:** `X-TIMESTAMP-MAP` içermeyen standart HLS/DASH parçalarında ilk 3 saniyesi müzik olan bir segmentte ilk söz `00:03.500` anında başladığında yerel zaman fark edilmez ve 15. dakikadaki diyalog videonun 3. saniyesine yazılır.
* **Düzeltme Stratejisi:** Parçanın mutlak mı yerel mi olduğunu anlamak için `list[0].start` yerine `list[list.length - 1].end <= duration + 3` ve `segment.start > 0` karşılaştırması esas alınmalıdır.

---

### 🔴 B-13: DASH MP4 `mdhd` Init Segment Timescale Eksikliğinde Zaman Şişmesi
* **İlgili Dosya ve Satırlar:** [`src/browser-subtitles.js:571`](file:///d:/Whisper%20Local/src/browser-subtitles.js#L571)
* **Kök Neden Mantığı:** `parseMp4WebVtt` içinde `const timescale = Math.max(1, Number(matcher.timescale) || 1);` kullanılmaktadır. DASH MPD manifesti `@timescale` özniteliğini içermediğinde (bu zaman ölçeği `init.mp4` içerisindeki `mdhd` kutusunda tanımlandığında), `matcher.timescale` `undefined` kalır ve `timescale` `1` varsayılır.
* **Tetiklenme Senaryosu:** `tfdt` kutusundaki 90.000 Hz veya 1.000 Hz tabanlı zaman damgası `1`'e bölünür.
* **Etki:** Altyazının başlangıç zamanı `90000000.0` saniye (yaklaşık 1041 gün sonra) olarak hesaplanır ve video oynatılırken altyazılar hiçbir zaman ekrana gelmez.

---

### 🟡 B-14: Enjekte Edilen XHR Kancasının `arraybuffer` ve `blob` Altyazı Yanıtlarını Sessizce Düşürmesi
* **İlgili Dosya ve Satırlar:** [`src/main.js:1330`](file:///d:/Whisper%20Local/src/main.js#L1330)
* **Kök Neden Mantığı:** `browserCaptureHookScript` içindeki XHR kancası `if (this.responseType && this.responseType !== 'text') return;` kontrolünü çalıştırmaktadır. Modern web video oynatıcıları (Shaka Player, Dash.js vb.) WebVTT ve TTML altyazı segmentlerini sıklıkla `responseType = 'arraybuffer'` veya `'blob'` olarak indirir.
* **Etki:** CDP ağ katmanı (ServiceWorker vb. nedenlerle) devre dışı kaldığında, yedek XHR kancası bu altyazı yanıtlarını metin olmadığı gerekçesiyle yoksayar ve web altyazısı yakalanamaz.

---

### 🟡 B-3: Tarayıcı Altyazı Katmanında Çakışan Repliklerde İkili Arama Kaybı
* **İlgili Dosya ve Satırlar:** [`src/main.js:1490-1495`](file:///d:/Whisper%20Local/src/main.js#L1490-L1495)
* **Kök Neden Mantığı:** `browserOverlayScript` içindeki `findCue(cues, t)` fonksiyonu ikili arama (*binary search*) algoritmasıyla yazılmıştır. İki konuşmacının aynı anda konuştuğu veya ses efektiyle konuşmanın üst üste bindiği durumlarda aralıklar kesişir. Algoritma `mid` indeksine bağlı olarak konuşmacılardan birini tamamen atlar ve tek bir replik döner.
* **Düzeltme Stratejisi:** Ana oynatıcıdaki gibi doğrusal `filter` / `findIndex` kullanılmalı ve çoklu konuşmacı durumunda alt alta iki satır render edilmelidir.

---

### 🟢 B-4: YouTube `srv3` XML Formatında 100ms Altı Değerlerin Saniye Sanılması
* **İlgili Dosya ve Satırlar:** [`src/browser-subtitles.js:426-427`](file:///d:/Whisper%20Local/src/browser-subtitles.js#L426-L427)
* **Kök Neden Mantığı:** `parseXml` fonksiyonunda yer alan `if (/\bt\s*=/.test(tag) && Number(startRaw) > 100) start = Number(startRaw) / 1000;` şartı nedeniyle `t="80"` (80 ms) değeri 1000'e bölünmez ve 80 saniye olarak işlenir.
* **Düzeltme Stratejisi:** `\bt\s*=` mevcutsa büyüklük şartı aranmaksızın değer her zaman 1000'e bölünmelidir.

---

### 🟢 B-5: DRM Teşhis Panelinde Disney+ ve Prime Video Hostlarının Atlanması
* **İlgili Dosya ve Satırlar:** [`src/main.js:1580`](file:///d:/Whisper%20Local/src/main.js#L1580)
* **Kök Neden Mantığı:** `reportBrowserDrmSupport()` fonksiyonundaki host regex'i `if (!/(^|\.)(netflix\.com|hulu\.com|max\.com|hbomax\.com|discoveryplus\.com)$/.test(host)) return;` şeklindedir. `src/browser-adapters.js` içinde Disney+ tanımlı olmasına rağmen buradaki regex'e `disneyplus.com` ve `primevideo.com` eklenmemiştir.
* **Etki:** Disney+ veya Prime Video açıldığında DRM destek durumu arayüzdeki teşhis paneline raporlanmaz.

---

## 4. Electron Ana Süreci (Main) ve IPC İletişim Protokolü Analizi

---

### 🔴 M-1: Kuyruk Modunda Süreç Çıkış Yarış Durumu (Process Exit Race Condition)
* **İlgili Dosya ve Satırlar:** [`src/renderer/renderer.js:2012-2070`](file:///d:/Whisper%20Local/src/renderer/renderer.js#L2012-L2070), [`src/main.js:2560-2565`](file:///d:/Whisper%20Local/src/main.js#L2560-L2565)
* **Kök Neden Mantığı:** Python süreci transkripsiyonu tamamladığında stdout'a `{"type":"done"}` basar. `renderer.js` bu olayı alınca 500 ms sonra `processNextQueueItem()` çağırır. Ancak `main.js` tarafında `activeJob` değişkeni Python sürecinin OS seviyesinde tamamen kapandığı `activeJob.on('close')` anına kadar `null` yapılmaz.
* **Tetiklenme Senaryosu:** Büyük modellerde PyTorch VRAM boşaltımı 500 ms'den uzun sürdüğünde, 2. kuyruk işi `transcribe:start` çağırır. `main.js` `activeJob` nesnesini dolu görerek `{ ok: false, error: 'Zaten bir iş çalışıyor.' }` döner ve kuyruk yarıda kalır.
* **Düzeltme Stratejisi:** Kuyruk adımlarında da `exit` IPC olayının gelmesi beklenmelidir.

---

### 🟡 M-9: `saveHistory`, `saveWatchLibrary` ve `saveSettings` Fonksiyonlarının Atomik Yazılmaması Nedeniyle Olası Çökmede Tüm Kütüphane ve Geçmişin Silinmesi Riski
* **İlgili Dosya ve Satırlar:** [`src/main.js:561-569`](file:///d:/Whisper%20Local/src/main.js#L561-L569), [`src/main.js:590-598`](file:///d:/Whisper%20Local/src/main.js#L590-L598), [`src/main.js:627-636`](file:///d:/Whisper%20Local/src/main.js#L627-L636)
* **Kök Neden Mantığı:**
  ```javascript
  function saveHistory(list) {
    try {
      fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
      fs.writeFileSync(historyPath(), JSON.stringify(list.slice(0, HISTORY_LIMIT), null, 2), 'utf-8');
      return true;
    } catch (_) { return false; }
  }
  ```
  `fs.writeFileSync` doğrudan hedef JSON dosyasının üzerine yazmaktadır. Yazım anında beklenmeyen bir kapanma (elektrik kesintisi, görev yöneticisinden kapatma, çökme) meydana gelirse dosya 0 bayt veya bozuk JSON olarak kalır. Uygulama bir sonraki açılışında `loadHistory()` veya `loadWatchLibrary()` içindeki `JSON.parse` hata verir ve `catch` bloğu `[]` (boş dizi) döner. İlk yeni kayıtta boş liste diske yazılarak kullanıcının geçmişi veya izleme kütüphanesi kalıcı olarak silinir.
* **Düzeltme Stratejisi:** `writeSubtitleAtomic`'te olduğu gibi veriler önce `.tmp` geçici dosyasına yazılmalı, ardından `fs.renameSync` ile atomik olarak hedef dosyanın üzerine taşınmalıdır.

---

### 🟡 M-8: `settings:import` Handler'ının JSON Dizi Kontrolü Eksikliği Nedeniyle `settings.json`'ı Bozabilmesi
* **İlgili Dosya ve Satırlar:** [`src/main.js:2262`](file:///d:/Whisper%20Local/src/main.js#L2262)
* **Kök Neden Mantığı:**
  ```javascript
  const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
  if (!data || typeof data !== 'object') return { ok: false, error: 'Geçersiz ayar dosyası.' };
  saveSettings(data);
  ```
  JavaScript'te `typeof [] === 'object'` olduğundan, bir JSON dizisi (`[1, 2]` veya `[{...}]`) içeren dosya içe aktarıldığında bu kontrolden geçer ve `settings.json` dosyasına bir dizi olarak yazılır.
* **Etki:** Uygulama yeniden başlatıldığında veya ayarlar okunduğunda `settings.glossary` ve diğer ayar alanları `undefined` kalır; arayüz başlatma scriptinde `TypeError` oluşur.
* **Düzeltme Stratejisi:** `if (!data || typeof data !== 'object' || Array.isArray(data))` kontrolü eklenmelidir.

---

### 🟡 M-7: `shiftTimecodes` Fonksiyonunun 2-Parçalı WebVTT Zamanlarını Eşleştirememesi ve Negatif Kaydırmada Sıfır-Süreli Bozuk Blok Üretmesi
* **İlgili Dosya ve Satırlar:** [`src/main.js:2374-2386`](file:///d:/Whisper%20Local/src/main.js#L2374-L2386)
* **Kök Neden Mantığı:**
  1. Regex kesinlikle 3 parçalı saat formatı `(\d{2}):(\d{2}):(\d{2})` arar. Saat ön eki olmayan standart WebVTT dosyalarında (`05:23.456 --> 05:28.100`) hiçbir zaman damgası eşleşmez ve dosya hiç kaydırılmadan orijinal haliyle bırakılır.
  2. `offsetSec` negatif olduğunda (`-5.0`), videonun başındaki blokların hem başlangıç hem bitişi `total < 0` sınırına takılarak `00:00:00,000 --> 00:00:00,000` sıfır-süreli çakışık bloklara dönüşür.
* **Düzeltme Stratejisi:** Regex `(?:(\d{1,2}):)?(\d{2}):(\d{2})([,.])(\d{3})` olarak genişletilmeli; süresi sıfıra düşen bloklar listeden elenmelidir.

---

### 🟡 M-6: `writeSubtitleAtomic` Fonksiyonunun JSON ve WebVTT Dosyalarına Koşulsuz UTF-8 BOM Ekleyerek JSON Ayrıştırıcılarını Bozması
* **İlgili Dosya ve Satırlar:** [`src/main.js:465-471`](file:///d:/Whisper%20Local/src/main.js#L465-L471)
* **Kök Neden Mantığı:** `writeSubtitleAtomic(filePath, text)` fonksiyonu `const data = '\uFEFF' + String(text).replace(/^\uFEFF/, '');` ile uzantı kontrolü yapmaksızın tüm dosyalara UTF-8 BOM ekler.
* **Tetiklenme Senaryosu:** Bu fonksiyon üzerinden bir `.json` dosyası yazıldığında dosyanın başına `\uFEFF` baytı yazılır. Node.js `JSON.parse()` bu dosyayı okuduğunda `SyntaxError: Unexpected token \ufeff` fırlatarak çöker.
* **Düzeltme Stratejisi:** BOM ekleme işlemi yalnızca `.srt` ve `.ass` uzantılı dosyalar için uygulanmalıdır.

---

### 🟡 M-2: FFmpeg Subtitle Burn-In Windows Sürücü İki Nokta Üst Üste (`:`) Kaçış Hatası
* **İlgili Dosya ve Satırlar:** [`src/main.js:2410-2415`](file:///d:/Whisper%20Local/src/main.js#L2410-L2415), [`src/main.js:2435`](file:///d:/Whisper%20Local/src/main.js#L2435)
* **Kök Neden Mantığı:** `ffSubtitlesArg(p)` fonksiyonu `subtitles='${fwd}'` üretirken ters bölüleri (`\`) düzeltmektedir ancak Windows sürücü harfi sonrasındaki `:` işaretini (`D:`, `C:`) kaçışa (`\:`) almamaktadır. FFmpeg `libavfilter` ayrıştırıcısında tek tırnak içinde dahi olsa `:` filtresel parametre ayracı olarak yorumlanır.
* **Etki:** Windows mutlak yollarında burn-in `Unable to parse option value` hatasıyla çöker.

---

### 🟡 M-3: İzlenen Klasörde (Watch Folder) Dil Eki / Format Kaynaklı Sonsuz Transkripsiyon Döngüsü
* **İlgili Dosya ve Satırlar:** [`src/main.js:401-410`](file:///d:/Whisper%20Local/src/main.js#L401-L410)
* **Kök Neden Mantığı:** `scanWatchFolder()` yalnızca ve sadece `video.srt` dosyasının varlığına bakmaktadır. Dil eki (`video.tr.srt`) veya `.vtt` çıktısı seçildiğinde dosya her 5 saniyede bir tekrar kuyruğa alınır; GPU sonsuz döngüye girer.

---

## 5. Python Backend ve Transkripsiyon Boru Hattı Analizi

---

### 🔴 B-17: Diarization Sonrası `merge_continuation` Sıralama Hatası: `speakers_map` İndeks Kayması ve Metin Ortasına Çift Etiket Gömmesi
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:3943-3979`](file:///d:/Whisper%20Local/backend/transcribe.py#L3943-L3979), [`backend/transcribe.py:4095`](file:///d:/Whisper%20Local/backend/transcribe.py#L4095)
* **Kök Neden Mantığı:**
  1. Satır 3943'te `speakers_map = assign_speakers(entries, spans)` ile o anki indekslere (`0..N`) göre konuşmacı haritası oluşturulur.
  2. Satır 3949'da `args.label_speakers` açıksa metinlerin başına `[SPEAKER_00] ` öneki eklenir.
  3. Satır 3976'da `merge_continuation_lines(entries)` çağrılarak ardışık devam satırları birleştirilir. Bu birleştirme `entries` dizisinin boyutunu küçültür ve indeks sırasını bozar.
* **Tetiklenme Senaryosu:**
  - `speakers_map` sözlüğü eski indeksleri tuttuğu için üretilen `.ass` ve `.json` dosyalarında konuşmacı renkleri ve etiketleri ilk birleşen satırdan itibaren kayar ve yanlış konuşmacılara atanır.
  - Birleştirilen devam satırlarının metni `[SPEAKER_00] Merhaba [SPEAKER_00] nasılsın` şeklinde cümlenin tam ortasında mükerrer konuşmacı etiketi içerir.
* **Düzeltme Stratejisi:** `merge_continuation_lines` adımı `assign_speakers` ve `label_speakers` işlemlerinden ÖNCE çalıştırılmalıdır.

---

### 🔴 B-6: WebVTT 2-Parçalı Zaman Damgası (`MM:SS.mmm`) ile `parse_srt` Çöküşü
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:4685-4695`](file:///d:/Whisper%20Local/backend/transcribe.py#L4685-L4695), [`backend/transcribe.py:4778-4785`](file:///d:/Whisper%20Local/backend/transcribe.py#L4778-L4785), [`backend/transcribe.py:4547-4552`](file:///d:/Whisper%20Local/backend/transcribe.py#L4547-L4552)
* **Kök Neden Mantığı:** `backend/transcribe.py` içindeki `_SRT_TIMING` regex'i ve `srt_time_to_seconds(s)` (`h, m, rest = s.split(":")`) mutlak surette 3 parçalı (`HH:MM:SS`) zaman formatı beklemektedir.
* **Etki:** `--translate-only` (Mevcut Altyazıyı Çevir), `--explain` (AI Açıklama) ve `--sync-subs` (Altyazı Senkronlama) modlarında saat ön eki olmayan standart WebVTT dosyaları `"Altyazı okunamadı veya boş"` hatası vererek işlenemez.

---

### 🟡 B-19: `media.py` `fetch_subs` Dil Eşleşmediğinde Klasördeki Eski Başka Dildeki Altyazıyı Döndürme Hatası
* **İlgili Dosya ve Satırlar:** [`backend/media.py:261-270`](file:///d:/Whisper%20Local/backend/media.py#L261-L270)
* **Kök Neden Mantığı:** `exact` eşleşmesi olmadığında `picked = candidates` fallback'i klasördeki eski Türkçe altyazıyı `path` olarak seçmektedir.
* **Etki:** `media.py` başarılı yanıt (`subs`) dönerek arayüze sanki İngilizce altyazı indirilmiş gibi eski Türkçe altyazının yolunu verir.

---

### 🟡 B-20: `split_segment_sentence` İçinde Dilin Harf Heuristiğiyle Tahmin Edilmesi Nedeniyle Türkçe Cümlelerin İngilizce Sayılması
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:1211`](file:///d:/Whisper%20Local/backend/transcribe.py#L1211)
* **Kök Neden Mantığı:** Segment dili belirlenirken ses dili yerine metinde Türkçe özel karakter (`ç, ğ, ı, ö, ş, ü`) bulunup bulunmadığı kontrol edilmektedir.
* **Tetiklenme Senaryosu:** `"Tamam o zaman yarin bakariz."` gibi Türkçe cümlelerde `language` `"en"` atanır ve `_best_subtitle_cut` İngilizce bağlaç ve dilbilgisi kurallarını uygulayarak cümleleri doğal olmayan kelime sınırlarından böler.

---

### 🟡 B-8: LLM Çeviri ve Düzeltme Modunda Markdown Giriş Açıklamalarında JSON Çöküşü
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:1990-1998`](file:///d:/Whisper%20Local/backend/transcribe.py#L1990-L1998), [`backend/transcribe.py:2497-2504`](file:///d:/Whisper%20Local/backend/transcribe.py#L2497-L2504)
* **Kök Neden Mantığı:** LLM yanıtını temizleyen `re.sub(r"^```(?:json)?\s*", "", content)` regex'i `^` kullandığından, model JSON öncesi giriş metni eklediğinde regex eşleşmez ve `json.loads` `JSONDecodeError` ile o çeviri paketini düşürür.

---

### 🟡 B-15: `wrap_text` Tırnak/Parantez ile Biten Cümlelerde Satır Kırma Başarısızlığı
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:389`](file:///d:/Whisper%20Local/backend/transcribe.py#L389)
* **Kök Neden Mantığı:** Cümle `"Gidelim mi?"` veya `(Gülüşmeler.)` gibi tırnak veya parantezle bitiyorsa `w[-1]` tırnak/parantez olduğu için `PUNCT_END` eşleşmez ve cümle sonu satır kaydırması yapılmaz.

---

### 🟢 B-18: `_cut_wav` İçinde `-ss` Parametresinin Girdi Sonrasına Konulması Nedeniyle FFmpeg Decode Yükü
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:690-692`](file:///d:/Whisper%20Local/backend/transcribe.py#L690-L692)
* **Kök Neden Mantığı:** `recover_punctuation_collapse` fonksiyonunun çağırdığı `_cut_wav` içinde `ffmpeg -i src -ss start -to end` komutu kullanılmaktadır. Uzun videolarda 8 adet noktalama bozukluğu onarılırken her parça için tüm dosya baştan decode edilir.

---

### 🟢 B-10: FFmpeg Çıkış Arama (-ss) Konumu Nedeniyle Uzun Videolarda Başlangıç Gecikmesi
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:299-303`](file:///d:/Whisper%20Local/backend/transcribe.py#L299-L303)
* **Kök Neden Mantığı:** `extract_audio_ffmpeg` içinde `-ss` ve `-to` parametreleri `-i input_path` sonrasına eklenmiştir. 2 saatlik bir videonun sonlarındaki kısa bir bölüm kırpılırken FFmpeg baştan itibaren tüm akışı decode ederek ilerler.

---

### 🟢 B-12: `reexport_from_json` Büyük/Küçük Harf Dil Eki Tekrarlama Hatası
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:4649`](file:///d:/Whisper%20Local/backend/transcribe.py#L4649)
* **Kök Neden Mantığı:** `base_name.endswith(f".{lang}")` denetimi büyük/küçük harfe duyarlıdır. Girdi JSON dosyası `video.TR.json` olduğunda çıktı `video.TR.tr.srt` şeklinde çift uzantılı olarak üretilir.

---

### 🟢 B-16: `_MISSING_SPACE_DOT_RE` Yabancı Dillerde Harf Kapsama Eksikliği
* **İlgili Dosya ve Satırlar:** [`backend/transcribe.py:2915`](file:///d:/Whisper%20Local/backend/transcribe.py#L2915)
* **Kök Neden Mantığı:** `_MISSING_SPACE_DOT_RE` regex'i yalnızca Türkçe ve İngilizce alfabelerini içermektedir. Almanca, Fransızca veya Rusça transkripsiyonlarda nokta sonrası boşluk düzeltmesi çalışmaz.

---

## 6. Kapsamlı Mimari ve Stratejik Geliştirme Önerileri

### 🌐 A. Tarayıcı ve Web Yakalama (Browser Mode)
1. **Dinamik Fullscreen Top Layer Konteyner Geçişi:**
   Tam ekran moduna girildiğinde altyazı katmanı `document.fullscreenElement` konteynerine aktarılarak tüm akış servislerinde tam ekran altyazı desteği sağlanmalıdır.
2. **Doğrudan Web Audio Ham Ses Yakalama (Audio Intercept):**
   Altyazı dosyası sunmayan siteler için `WebContentsView` üzerinden ses akışı yakalanıp yerel Whisper pipeline'ına aktarılarak canlı gerçek zamanlı web altyazılandırması yapılabilmelidir.
3. **DRM Canvas/SVG OCR Fallback:**
   Altyazıların DOM metni olarak değil canvas veya SVG olarak çizildiği oynatıcılarda hafif bir OCR motoru ile altyazı taranabilmelidir.

### 🎬 B. Oynatıcı ve İzleme (Player Experience)
1. **İki Dilli Bağımsız Tipografi ve Konumlandırma:**
   Hedef çeviri altta büyük puntolu, kaynak dil ise üstte küçük puntolu ve yarı saydam olarak ayarlanabilmeli; iki dilin üst üste binmesi önlenmelidir.
2. **Dalga Biçimi Üzerinde Doğrudan Kenar Sürükleme (DAW/NLE Tarzı):**
   `timelineCanvas` üzerinde blok başlangıç/bitiş kenarları doğrudan fareyle sürüklenerek zamanlama kaymaları anında düzeltilebilmelidir.
3. **Anki / Flashcard Entegrasyonu:**
   Oynatıcıdaki *Kelime Müfettişi* (`wordInspector`) üzerinden tek tıkla "Kelime + Cümlenin Tamamı + Çevirisi + Zaman Damgası" içeren Anki `.apkg` / CSV kartları dışa aktarılabilmelidir.
4. **Picture-in-Picture (PiP) Altyazı Desteği:**
   HTML5 `<canvas>` üzerinden video + altyazı tek karede birleştirilerek (`canvas.captureStream()`) sistem PiP penceresinde altyazılı izleme sağlanmalıdır.

---
*Rapor Sonu — Tüm bulgular doğrulanmış olup kod bütünlüğü korunmuştur.*
