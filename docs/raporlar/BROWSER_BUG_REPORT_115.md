# BROWSER_BUG_REPORT_115 — UI/UX denetim raporu doğrulama ve düzeltmeler

- **Dal:** `codex/r115-ui-audit-1790173960` (master `7173d42` üzerine)
- **Tarih:** 2026-09-23
- **Yöntem:** her madde önce koddan doğrulandı → doğrulanan kusurlar minimal düzeltmeyle giderildi → gerçek Electron (ayrı profil, CDP + trusted input) ile önce/sonra ekran görüntüsü ve davranış kanıtı alındı. Kanıtlanamayan iddialar "doğrulanamadı/yanlış" olarak ayrıldı.

Kanıt dizini: `docs/raporlar/r115-evidence/`

---

## 🔴 Kritik bulgular — karar

### 1. Alt kontrol çubuğu ikonları açık temada görünmüyor — **DOĞRULANDI, DÜZELTİLDİ**
- **Kanıt (önce):** `r115-evidence/before-light-player.png` — bej daire + beyaz ikon; kök neden `.player-controls .btn-icon { background: var(--bg-3) }` token'ının açık temada bejleşmesi.
- **Düzeltme:** kontroller temadan bağımsızlaştı — `rgba(0,0,0,.45)` + `backdrop-filter: blur(8px)` + `color:#fff` (styles.css canonical blok ~3034). Süre/hap ve hız seçici de aynı koyu-cam dilime alındı; `accent-color:#fff`.
- **Kanıt (sonra):** `after-light-player.png` (açık tema) + `after-dark-player.png` (koyu tema) — ikonlar iki temada da net.

### 2. `.player-controls .btn-icon` için dört ayrı kural — **DOĞRULANDI, DÜZELTİLDİ**
- 1123/2399/2999/7629 satırlardaki tekrarlar birbirini eziyordu (8px köşe vs %50 yuvarlak çakışması).
- **Düzeltme:** hepsi tek canonical bloğa indi (3034–3043). Kalan `.player-controls .btn-icon` referansları: `.off` eğik çizgi (1123–25, bilinçli durum stili) ve dar-ekran 34px media kuralı (3428) — ikisi de durum/ölçü varyantı, stil çakışması değil.

### 3. Pasif önceki/sonraki buton arkasında koyu kare — **DOĞRULANDI, DÜZELTİLDİ**
- Pasif stil köşe yuvarlaklığını eziyordu; kare artefaktı üretiyordu.
- **Düzeltme:** pasif durum aynı dairede `opacity:.4` + koyu arka plan (`rgba(0,0,0,.28)`) — artefakt gitti.

### 4. Kontroller iki satıra taşıyor — **DOĞRULANDI, DÜZELTİLDİ**
- **Düzeltme:** butonlar 46→38px (dar ekranda 34px), seek çubuğu tam genişlikte üst satıra alındı (`order:0; flex-basis:100%`), sol/sağ gruplar (`pc-group`/`pc-right`) kuruldu, süre göstergesi oynat grubunun yanına taşındı, A-B/ekran görüntüsü/uyku zamanlayıcı/yardım tek `⋯` menüsüne (`playerMore`) toplandı, tam ekran en sağda sabit. Sonuç: tek satır — `after-light-player.png`.
- **Kalan:** "pencere daralınca önceliğe göre menüye düşürme" (öncelikli collapse) bu turda yok — bileşen bazlı öncelik modeli gerektirir, ayrı iş olarak raporlanır.

### 5. Boş Esc oynatıcıyı tamamen kapatıyor — **DOĞRULANDI, DÜZELTİLDİ**
- **Yeni zincir:** `Escape` → dialog → ytModal → downloads → places → altyazı menüsü → **açık ⋯ menüleri** → kelime denetçisi → kısayol yardımı → ayarlar → tam ekran çıkışı. Boş Esc artık oyuncuyu KAPATMIYOR.
- **Ayrı tuş:** `Backspace` → `closePlayer()` (tarayıcı modu + metin girişleri hariç). Geri butonu da aynı işi yapar; başlık ipucu "Oynatıcıdan çık (Backspace)".
- **Gerçek Electron kanıtı (trusted input):** ⋯ menüsü açıkken Esc → menü kapanır, odak `summary`'ye döner, katman açık kalır; tam ekranda Esc → yalnız tam ekrandan çıkar; Backspace → `playerLayer` gizlenir (çıkış).

### 6. Dil karışıklığı (EN'de TR dizgiler) — **DOĞRULANDI, DÜZELTİLDİ**
- Eksik anahtarlar: sistematik taramayla `index.html`'de 83 görünür dizgi eksik bulundu; tümü `ui-locale.js`'e eklendi (unique-key kapısı dahil, çift kayıtlar ayıklandı).
- Dinamik yüzeyler: `updatePlayerMeta` (metaBase → `UiLocale.t`), boş-durum kartı, "profili/fark/Aynı/Dosya bekleniyor/YouTube bekleniyor" gibi `updatePresetDiff`/`updateSignalDesk` dizgileri `interfaceChoice`/`UiLocale.t` üzerinden geçirildi; `ui-locale-change` dinleyicisi meta + boş durumu yeniden işliyor.
- **Kanıt:** `after-empty-state.png` (EN) + `after-tr-empty.png` (TR) — iki dilde de tutarlı.

## 🟠 Oynatıcı sayfası — karar

### 7. Video alanı dengesiz / ambient asimetri — **KISMEN DOĞRULANDI**
- Ambient katman simetrik (`-12%..124%` her kenara) — asimetri iddiası doğrulanamadı. Ancak açık temada `.player-stage` zemin rengi `--bg-0` (bej) idi → **gerçek kusur**: letterbox alanları bej görünüyordu. `background:#000` yapıldı; `.player-body` açık temada `#15181d`. Sonuç `after-light-player.png` — video bölgesi tamamen koyu.

### 8. Altyazısız sağ panel karmaşık — **DOĞRULANDI, DÜZELTİLDİ**
- Kaynak/Both/Translation seçimi, arama, araç satırı ve ilerleme altyazı yokken artık gizleniyor (`.player-side.no-cues`); yerine tek boş durum: `▭ Bu video için altyazı yok → [Whisper ile oluştur] [Altyazı dosyası seç]` (locale-aware).
- **Kanıt:** `after-empty-state.png`.

### 9. Pasif butonlar okunmuyor — **DOĞRULANDI, DÜZELTİLDİ**
- `.player-layer :disabled` opaklığı .45→.52; retranslate/export gibi pasif butonlara nedenini söyleyen `title` ipuçları eklendi ("Önce kaynak altyazı yükle" / "Önce bir çeviri oluştur").
- 4 butonu tek "Altyazı işlemleri ▾" menüsüne toplama önerisi bu turda yok — mevcut `no-cues` gizlemesi sorunun çoğunu çözüyor; menüleştirme ayrı tasarım işi.

### 10. `‹ ⟳ ›` etiketsiz + ~11px metinler — **KISMEN DOĞRULANDI**
- Etiket iddiası **yanlış**: üç butonun da `title` tooltip'i zaten vardı (Önceki cümle / Tekrarla / Sonraki cümle).
- Küçük yazı doğru: `.mini-toggle` 10→12px.

### 11. Başlık çubuğu gruplama + yinelenen tam ekran — **DOĞRULANDI, DÜZELTİLDİ**
- Üç grup + ince ayraçlar (`ph-sep`): [indir, yer imi] | [düzen, panel] | [ayarlar]. PDF + aktif işler `ph-more` (⋯) menüsüne taşındı. Başlıktaki `playerHeadFullscreen` kaldırıldı — tam ekran yalnız alt çubukta, en sağda.

### 12. Başlıkta video bilgisi zayıf — **DOĞRULANDI, DÜZELTİLDİ**
- `updatePlayerMeta()` başlığa gerçek bilgi basıyor: kaynak etiketi (locale-aware `metaBase`) + süre (`0:30`) + `SRT n` / `TR n` rozetleri + `CANLI`. Örnek: `Local video · bilingual work · 0:30 · SRT 7`.
- Kanal adı/daha zengin şerit (video altı bilgi alanı) ayrı iş — yerel videoda kanal kavramı yok.

## 🟡 Tarayıcı tarafı ve açılır menüler

### 13. Araç çubuğu kalabalığı — **DOĞRULANDI (kısmen bayat), DÜZELTİLDİ**
- "~14 kontrol" iddiası bayat: çoğu kaynak zaten `.browser-action-source{display:none}` ile gizliydi; gerçek çiftlik "Sayfayı çevir"in hem buton hem Çeviri menüsünde olmasıydı → menü öğesi kaldırıldı.
- Zoom (−/100%/+), "Yakalama ayrıntıları" ve "Altyazı sinyali" araç çubuğundan `hidden` yapıldı (⋯ Daha fazla menüsündeki proxy'ler çalışmaya devam ediyor).
- Öncelikli collapse (media-query bazlı menüye düşürme) kapsam dışı — ayrı iş.

### 14. Sayfa çevirisi menüsü form gibi — **DOĞRULANDI, DÜZELTİLDİ**
- Üç `select` + üç buton `<details class="browser-page-advanced"><summary>Gelişmiş ayarlar</summary>` altına alındı; menüde hızlı seçenekler + Gelişmiş ayarlar bölmesi kaldı.

### 15. Menülerde klavye/okluzyon/animasyon — **DOĞRULANDI, DÜZELTİLDİ**
- Tüm `<details>` menülerine (4 tarayıcı + player ⋯ + başlık ⋯) ortak ok tuşu gezinmesi (ArrowDown/Right sonraki, Up/Left önceki, Home/End ilk/son, devre dışı atlar) ve Esc→kapat+`summary`'ye odak döndürme eklendi: `wireDetailsMenuNav` + `closePlayerDetailsMenus`.
- Taşma: popover'lara `menuFadeIn` (opacity+translateY, ~120ms) eklendi; `prefers-reduced-motion` korumalı. Çeviri menüsü sağ kenara değil sola yaslanıyor (`right:auto;left:0`) — sağdan taşma önlendi. Doğrulanan ölçüm: ⋯ popover right=793 < vw=1180.
- **Kanıt (gerçek Electron):** ⋯ açık → ArrowDown sırayla `abLoopBtn`→`shotBtn` odaklıyor, ArrowUp geri; Esc kapanıp odağı `summary`'ye veriyor.

### 16. Adres çubuğu — **KISMEN UYGULANDI**
- Odaklanınca tüm adresi seçme eklendi (`browserAddress` focus → `select()`).
- Alan adı koyu / yol soluk: tek renk `<input>`'ta uygulanamaz — Chrome bunu katmanlı render ile yapar; adres alanını contenteditable'a çevirmek kapsam dışı (raporda açık sınır).

## ⚪ Genel

### 17. 335 hex renk / 28 `!important` — **DOĞRULANDI (ölçüm), kapsam dışı**
- Ölçüm doğru; 1 numaralı hata da buradan çıktı. Tam token konsolidasyonu dosya bazlı büyük bir tasarım-sistemi işi — bu turda düzeltilen yüzeyler (kontrol çubuğu, sahne zemini, panel boş durumu) sabit renklerini token/bağımsız değerlerle düzeltti; toplu konsolidasyon ayrı PR ister.

### 18. "Karanlık tema yok / prefers-color-scheme yok" — **YANLIŞ**
- `themeMedia`/`applyUiTheme`/`#uiTheme` mevcut; `prefers-color-scheme` dinleniyor; koyu tema gerçek Electron'da doğrulandı (`after-dark-player.png`).

## İkinci liste (1–7) eşlemesi
- Seek tam genişlik üstte ✓ · sol/sağ gruplar ✓ · ⋯ menüsü (A-B/shot/uyku/yardım) ✓ · süre oynat yanında ✓ · idle fade (~2.5s, duraklatmada görünür) zaten vardı — kodda doğrulandı · hız/uyku `select` stilleri koyu-cam pill'e uyarlandı (açılır liste yapmak kapsam dışı) · başlık 3 grup + ⋯ (PDF/işler) ✓ · gerçek video bilgisi (süre+rozet) ✓ (kanal yok — yerel) · video zemini koyu ✓ · boş durum CTA'ları: oynatıcı boşken `playerEmpty` artık `syncPlayerEmpty()` ile gösteriliyor (SmartTube grid ana yüzey olarak kalır) ✓ · up-next geri sayım kartı — kapsam dışı · token konsolidasyonu — kapsam dışı · `prefers-color-scheme` — zaten var.

## Doğrulanamayan / ertelenen
- Öncelikli araç çubuğu collapse'ı (dar pencerede az kullanılanları menüye düşürme)
- Adres çubuğu alan-adı koyulaştırma (tek-renk input sınırı)
- "Altyazı işlemleri ▾" menü birleşimi
- Up-next 5 sn geri sayım kartı
- 335 hex → token toplu konsolidasyonu
- Hız select'ini liste açan butona çevirme (stil uyumu yapıldı, yeniden bileşen değil)
- Ambient simetri (iddia doğrulanamadı — katman zaten simetrik; bej zemin bug'ı ayrı düzeltildi)

## Test
- `player-ui.test.js` 148/148 · `ui-locale.test.js` 14/14 · `player-escape-dialog.test.js` PASS · `player-extras-parti3.test.js` PASS · `report67-smarttube-wiring.test.js` 84/84 · `browser-experience` 7 · `browser-reading-design` · `browser-controls-behavior` · `browser-dark-mode` 9 · `audit-tur5` · `browser-subtitles` 80 · `browser-subtitle-selection`/`browser-subtitle-actions` · `crash-integrity` — hepsi yeşil.
- `node --check`: renderer.js, ui-locale.js ✓
- Tam `npm test` kasıtlı koşulmadı (talimat: hedefli set yeterli).
- Sözleşme-güncellenen testler: `player-ui.test.js` (Sayfayı-çevir yinelenme kapısı + `playerBookmark` sınırı + `closePlayerDetailsMenus` ctx), `player-escape-dialog.test.js` (ctx stub), `report67-smarttube-wiring.test.js` (metaBase üzerinden t() deseni — eşdeğer davranış, yeni dolayım).

## Gerçek Electron kanıtları
- `before-light-player.png` / `after-light-player.png` — aynı profil/boyut önce-sonra
- `after-dark-player.png` — koyu tema regresyon kontrolü
- `after-empty-state.png` / `after-tr-empty.png` — EN/TR boş durum kartı
- `after-browser-toolbar.png` — sadeleşmiş araç çubuğu + ⋯ menü (zoom taşınmış)
- Klavye zinciri: trusted `Input.dispatchKeyEvent` ile ölçüldü (menü aç→ok nav→Esc→odak; fs-Esc; Backspace→çıkış)
