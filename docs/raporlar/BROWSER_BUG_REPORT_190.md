# BROWSER_BUG_REPORT_190 — R233: tur-2 paketi kalanı + #165 Devin Review triage

**Tarih:** 2026-09-29 · **Dal:** `fix/browser-ui-round3` (başlangıç `75b278e`) · **Kapsam:** tur-2 paketinin ertelenen 2 maddesi (Ctrl+F çift gönderim, ⋯ menü ilk-ok odağı) + PR #165 Devin Review bulguları (2 bug, 1 flag)

## Uygulanan düzeltmeler

### 1. Sayfa odaklıyken Ctrl+F iki köprüden de olay gönderiyordu — `src/main.js`

**Kök neden:** `browserShortcutForInput` tablosu `Ctrl+F → 'f'` döndürüyor; tablo iki tüketici paylaşıyor — (a) `before-input-event` köprüsü `browser-shortcut` olayı gönderiyor, (b) `browser-page-find.js` aynı tuşu `find-open` olarak üretiyordu (aktif-sekme + `browserModalOccluded` kapılı). İkisi aynı anda ateşleniyordu.

**Düzeltme:** Genel köprü `key === 'f'` girişini atlıyor; `browser-page-find` kapılı `find-open` tek sayfa yolu kalıyor. `mainWindow` odak taşıması `find-open` işleyicisinde zaten yapılıyor — odak listesi `['l','k','p']`'ye indirildi ('f' çıkarıldı). Renderer'ın DOM-odaklı Ctrl+F'i aynı tablonun 'f' girdisini kullanmaya devam ediyor — tabloda 'f' bilinçli bırakıldı.

**Neden diğer yol seçilmedi:** sayfa-find işleyicisini kaldırmak `browserModalOccluded` kapısını da kaybettirirdi — DOM-odalı bir pencere (diyalog) açıkken sayfa native odakta kalabilir ve kapısız köprü bul çubuğunu perdenin arkasında açardı.

### 2. ⋯ menüsü ilk ok tuşunda arama kutusunu atlıyordu — `src/renderer/renderer.js`

**Kök neden:** paket erteleme listesi (BULGULAR.md). Menü açılınca odak gitmiyordu; klavyeyle ilk ↓ doğrudan hızlı eylemlere düşüyordu.

**Düzeltme:** `toggle` açılışında `moreSearch.focus()`; arama kutusunda ↓ ilk gezilebilir öğeye, ↑ menü özet düğmesine gider. `moreMenuItems` ortak süzgeci (`hidden`, `disabled`, `aria-disabled`, gizli `.browser-more-sub` içi) üzerinden iki liste: `moreMenuNavigables` (↓/↑ — alt-grup özetleri dahil, yalnız `[open]` grup öğeleri) ve `moreMenuActionables` (Enter — yalnız komut öğeleri; özet Enter'la grup açar, komut değildir). Enter'a kapalı grup içindeki görünmez öğe tıklanmıyordu — `.browser-more-sub[open]` seçicisi bunu da düzeltti.

### 3. Yer-imleri yenilemesi yanlış kayda odaklanıyordu — `src/renderer/renderer.js` (#165 BUG_0001)

**Kök neden:** `renderBrowserPlaces` odağı satır **sırasıyla** (`focusIndex`) geri veriyordu; odaklı satırın önüne kayıt eklenince (yeni gezinti/yer imi) aynı sıra farklı kayda düşüyor, sonraki klavye eylemi yanlış kaydı açıyor/siliyordu.

**Düzeltme:** odaklı satırın kayıt kimliği yakalanır (`data-place-open`=URL / `data-offline-open`=id); çizimden sonra aynı kimliği taşıyan satır aranır, kayıt silinmişse sıra-kelepçesi (`Math.min(focusIndex, …)`) yedeğe düşer.

### 4. Bölünmüş görünüm ikincil sayfasında kısayol odağı çalıyordu — `src/renderer/renderer.js` (#165 BUG_0002)

**Kök neden:** `main.js` köprüsü `['l','k','p']` kısayollarında `mainWindow.webContents.focus()` ile odağı alıyor ama gönderdiği `browser-shortcut` olayını renderer kapısı `event.tabId !== player.browserActiveTabId` diye reddediyordu — ikincil sayfada hiçbir giriş açılmadan odak kaybediliyordu.

**Düzeltme:** ikincil sekmeden gelen olayda (`tabId === browserSplit.secondaryTabId`) sayfa önce `activateBrowserTab` ile aktifleştirilir (uygulamanın kendi kuralı gereği bölünmeyi kapatır — aktif sekme ikincil olamaz), sonra kısayol o sayfaya uygulanır. Diğer sekmelerin olayları yine reddedilir.

### 5. #165 FLAG_0001 — Ctrl+K temizleme/seçme çelişkisi → `needs_human`

Paketin §3 el-kontrol listesi "metni temizleyip odağı koruması" diyor; uygulama Ctrl+K'da sorguyu **seçiyor** (Ctrl+L/Alt+D ve Chrome ile aynı kural; silme Esc'nin işi). Davranış doğru — kabul kontrolü "seçer" olarak güncellenmeli; PR thread'ine analiz yazıldı, triage `needs_human`.

## Doğrulama

- `node --check`: `src/main.js`, `src/renderer/renderer.js` temiz.
- Hedefli testler (8/8 PASS): `browser-places-filter` (yeni kimlik-bazlı odak senaryosu dahil), `browser-menu-proxy` (yeni açılış-odak/↓/↑ senaryosu dahil), `browser-ui-round2`, `browser-page-find`, `browser-command-palette`, `browser-context-menu`, `browser-subtitle-menu`, `audit-tur5`, `browser-experience`, `browser-toolbar-clickability`.
- Regresyon kilitleri: `tests/browser-places-filter.test.js` sahte DOM'u `closest/querySelector*/contains/focus/className` ile genişletildi — "yeni kayıt öne eklenince odak aynı kayıtta kalır" senaryosu. `tests/browser-menu-proxy.test.js` — menü açılışında arama odağı + ↓ ilk eylem + ↑ özet senaryosu.

## Windows etkisi

Klavye köprüsü `before-input-event` Windows'ta aynı `control` bayrağıyla gelir — davranış değişimi platformdan bağımsız. El-kontrol önerisi: sayfa odaklıyken Ctrl+F'in tek bul çubuğu açması; ⋯ menüde açılış odağı + ↓/↑ gezintisi; bölünmüş görünümde ikincil sayfadayken Ctrl+L'nin o sayfayı aktifleştirip adres çubuğunu açması; yer imleri açıkken bir gezinti tamamlanınca odağın aynı kayıtta kalması.

## Çalıştırılmayan kontroller

- Tam `npm test` paketi koşulmadı (kapsam: hedefli 10 dosya); Windows CI'da koşacak.
- Electron smoke'ları koşulmadı — değişiklik DOM/IPC mantığında, smoke kapsama dışı.
- Bölünmüş görünüm ikincil-sekme akışı yalnız kod incelemesiyle doğrulandı (oluşturma yolu `activateBrowserTab` ortak sözleşme).
