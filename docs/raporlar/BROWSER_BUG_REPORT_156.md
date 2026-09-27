# BROWSER_BUG_REPORT_156 — R175: T9 Windows UI kabul bulgularının düzeltilmesi

**Tarih:** 2026-09-27 · **Dal:** `codex/r175-t9-fixes` · **Tür:** gerçek bug düzeltmesi + ratchet

## Kaynak

T9 gerçek Windows UI kabul turu (child session
`devin-b252cca8f27b4474aab60d0f67a505c8`): 720p/1080p/DPI matrisi,
EN/TR geçişi, klavye kısayolları — 8/9 kabul adımı geçti; iki gerçek
bug sınıfı raporlandı. Bu dal o iki sınıfı kök-nedenli kapatır.

## Bug A — Klavye köprüsü tag korumasının altında kalıyordu

**Olay:** Tarayıcı çalışma alanında odak bir `input`/`button`/`a`
üzerindeyken pencere düzeyi kısayollar (Ctrl+T yeni sekme, Ctrl+W kapat,
Ctrl+L adres çubuğu, Ctrl+F sayfada bul, Alt+← geri, F5 yenile) ölüydü.
Ctrl+T ile sekme açtıktan sonra odaklı adres çubuğunda Ctrl+W çalışmıyor —
kullanıcı sekmeyi kapatamıyor.

**Kök neden:** `renderer.js` global `keydown` dinleyicisinde
`tag === 'input' …` erken-dönüş koruması, tarayıcı-kısayol köprüsünden
(`browserShortcutForInput` + `runBrowserShortcut`) **önce** koşuyordu;
odaklı kontrol tuşu daha köprüye ulaşmadan yutuyordu.

**Düzeltme:** Köprü, tag korumasının üstüne taşındı. Güvenlik kanıtı:
`browserShortcutForInput` (`src/browser-command-palette.js`) yalnız
pencere düzeyi akorları eşler — `a/c/v/x/z` gibi metin düzenleme tuşları
tabloda yok; eşleşmeyen tuşlar boş dönüp alttaki tag korumasına düşer,
yani odaklı girişte yazı davranışı değişmez.

## Bug B — EN arayüzde Türkçe kalan metin sınıfları

T9'un "EN modunda TR kalıntı yok" adımı üç ayrı sızıntı kanalı buldu;

### B1 — Native diyaloglar (~28 konum)

`dialog.showMessageBox`/`showOpenDialog`/`showSaveDialog`,
`setSaveDialogOptions` ve dosya-filtresi `name:` alanları sabit TR
literal taşıyordu (dosya seçici başlıkları, Kaydet düğmesi, kapanış
uyarıları, izin istemleri). Windows'ta EN kullanıcısı tüm sistem
diyaloglarını Türkçe görüyordu.

**Düzeltme:** `main.js`'e `dt(tr, en)` yardımcısı eklendi
(`browserUiLocale()`'u okur); ~28 diyalog konumu sarıldı. Servis
modüllerine `dialogText` parametresi aşılandı: `browser-downloads.js`
(`dl`), `browser-feature-services.js` (7 başlıklı `chooseTitles` Map),
`browser-mini-player.js` (pencere başlığı), `catalog-extensions.js`
(3 başlık + filtre adları), `media-catalog-service.js` (4 başlıklı
`chooseTitles` Map).

### B2 — Statik index.html dizgileri + adalar

`ui-locale.js` `ignored` listesi sekme şeridini bütünüyle çeviri dışı
bırakıyordu; 'Yeni sekme' etiketi ve rozetler EN'de TR kalıyordu.
Ayrıca statik taramayı atlatmış dizgiler vardı: `Hepsi`,
`OPERASYON MASASI`, `50/100/200 bin`, `2× kenar`, `∓10 sn seek`,
klavye-ipucu paragrafının `<strong>`/`<code>` sınırlarında bölünen
metin parçaları (`, tekrar:`, `, kopyala:`, `, 10 sn:`, `, ses:`).

**Düzeltme:** `uiIslands` `.browser-tab-close,.browser-tab-audio,
.browser-settings-tab` ile genişledi; ~15 yeni sözlük girişi (parça
dizgileri birleşince doğal EN okunacak şekilde); `index.html`
'Uygulama dili' → 'Arayüz dili'. Sekme şeridi ada bölgesi olduğundan
observer dışında kalır; `ui-locale-change` dinleyicisine
`renderBrowserTabs()` eklendi — dil değişiminde etiketler yeniden
çizilir. `browserTabActivity` metinleri `interfaceChoice()`'a geçti.

### B3 — Renderer'a taşan `message:`/`detail:` alanları

`sendBrowserEvent` payload'ları ve `messageKey`'li hata nesneleri DOM'da
gösterilir; bunlar native diyalog değildir — sözlük kapsamına alındı:
Castlabs API, Widevine hazırlık/hazır/arka-plan, Proton VPN reddi,
gizli-cue tanı uyarısı, geçici sohbet dosyası.

**Kasıtlı istisna:** `Whisper Altyazı` pencere başlığı — marka adı her
dilde aynı (BROWSER düğmesiyle aynı gerekçe); test istisna listesinde.

## Ratchet'lar

- **`tests/dialog-locale.test.js` (yeni):** 6 main-süreç dosyasında
  `title|message|detail|buttonLabel|name:` ve `buttons[]` alanlarında
  TR karakterli ham literal bulursa düşer. `dt()/dl()/dialogText()`
  argümanları ve sözlük kapsamlı renderer-alanları hariç.
- **`tests/ui-locale.test.js` (sertleşti):** eski tarama yalnız TR
  karakter içeren dizgileri denetliyordu; artık HTML entity'leri çözülüp
  **tüm** statik dizgiler ya sözlükte ya `NEUTRAL` listesinde olmalı.
- Güncellenen sözleşme sabitlemeleri: `browser-capture-queue`
  (kapanış düğmeleri dt biçimi), `browser-recovery-tools` (PNG filtre
  adı dt biçimi), `ui-locale-dynamic` (uiIslands artık başlangıç
  elemanını kilitler — liste büyüyebilir).
- Vm-harness uyumları: `adversarial-ipc` + `audit-tur4` +
  `audit-tur5-main` sandbox'larına `dt: (tr) => tr` stub'ı
  (işlevlerin yeni bağımlılığı; assertion semantiği değişmedi).

## Testler

`npm test` tam paket yeşil (EXIT=0); `node --check` dokunulan 10 dosya
temiz. Sözlük benzersizlik kilidi korunuyor (2390 giriş, 0 yinelenme).

## Sınırlar / Windows notu

- `open.title` (sekme başlık baloncuğu) bilinçli çevrilmez — kullanıcı
  verisi + UI karışık (`[tab.title, tab.url, activity.label]`).
- Windows'ta el kontrolü önerilir: EN modunda dosya seçici + kapanış
  uyarısı TR görünmemeli; odaklı adres çubuğunda Ctrl+W/L/F ölmeli
  değil. Native diyalog metinleri EN'de İngilizce görünmeli.
