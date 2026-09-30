# BROWSER_BUG_REPORT_265 — R316: Dokunmatik/HDPI kenar durumları denetimi

Tarih: 2026-09-30 · Dal: `devin/1790753129-touch-hdpi` · Kod commit'i: `41f2253`

## Kapsam ve yöntem

125% ölçekleme (Windows dokunmatik dizüstü/tablet) ve dokunmatik girdi
açısından renderer'ın tüm işaretçi (pointer) yüzeyi denetlendi: 10
`pointerdown` sitesi, 4 `pointercancel` sitesi, `mouse*` dinleyicileri,
`touch-action` CSS'i, hover'a bağlı etkileşimler, `devicePixelRatio`
kullanımı ve Electron titleBarOverlay.

## Doğrulanan bulgular

- **B1 — `browserSplitDivider` `pointercancel` dinlemiyordu:** dokunmatikte
  sistem jesti (bildirim perdesi, ikinci parmak, kenar kaydırması) sürüklemeyi
  iptal ettiğinde `pointerup` hiç gelmez → `dragging=true` ve `is-dragging`
  sınıfı kalıcı kalıyor; sonraki parmak hareketleri bölünmüş görünümü
  izinsiz kaydırıyordu. İptalde artık sürüklenen oran işlenip durum
  temizleniyor.
- **B2 — `sideResizer` yalnız `mousedown/mousemove/mouseup` kullanıyordu:**
  dokunmatikte yan panel genişliği hiç ayarlanamıyordu (uyum mouse olayları
  sürükleme için üretilmez). Pointer olaylarına çevrildi + `setPointerCapture`
  + `pointerup`/`pointercancel` sonlandırması + sol-düğme kapısı.
- **B3 — İki tutamakta `touch-action` yoktu:** `touch-action: auto` olan
  öğede tarayıcı ilk parmak hareketini pan jestine sayar ve `pointercancel`
  basar → sürükleme daha başlamadan ölür (B1'in durumu ortaya çıkar).
  `.side-resizer` ve `.browser-split-divider`'a `touch-action: none`
  eklendi.

## Gerçek bug olmayanlar (denetimde temiz çıktı)

- Diğer `pointerdown` siteleri tek-dokunma eylemleri (sürükleme durumu yok —
  cancel gerekmez): zaman çizelgesi, sekme strip'i, dış-tık kapatıcılar.
- `mouse*` dinleyicilerinin kalanı enhancement düzeyinde (kelime vurgusu,
  sekme önizlemesi, seek ipucu) — dokunmatikte uyum olayları ilk dokunmada
  üretildiği için dış-tık kapatma ve tek dokunma çalışıyor.
- `@media (hover: none)` geri dönüşleri mevcut: `ntp-tile-remove` ve
  `browser-tab-close` dokunmatikte görünür kalıyor.
- `devicePixelRatio` kullanımı (`Math.min(2, dpr)`) zaman çizelgesi tuvalini
  125%'te doğru ölçekliyor; titleBarOverlay Electron tarafından DIP
  biriminde yönetiliyor.
- Altyazı sürükleme (`makeSubtitleDraggable`), hold-speed ve `playerSeek`
  zaten pointer+pointercancel'lı.

## Düzeltmeler

- `src/renderer/renderer.js` — divider `endDrag` (up+cancel'de oranı işler,
  durumu temizler); resizer pointer olaylarına çevrildi.
- `src/renderer/styles.css` — iki tutamağa `touch-action: none`.
- `tests/touch-hdpi.test.js` (yeni, 3 kontrol) — davranış: cancel'de
  sürükleme kapanışı + oran işlemi; resizer pointer sürüklemesi + sağ-düğme
  reddi; kaynak ratchet'i (mouse-olayı yok + touch-action zorunlu).
- `tests/dom-innerhtml-ratchet.test.js` — izin listesi satır kayması.

## Doğrulama

- Yeni test master'da 3/3 FAIL (kırmızı kanıt), dalda 3/3 PASS.
- `node --check renderer.js` temiz; ratchet/design-system/css testleri yeşil.

## Windows etkisi ve sınırlar

Doğrudan Windows dokunmatik senaryosu: gerçek dokunmatik ekranda sürükleme
elle doğrulanmadı (başsız kutu). Davranış vm-dilim testleriyle kilitli;
pointer-capture/cancel yolu tarayıcı seviyesinde sözleşmeye bağlı.

## Kalan / izleme

- Kıstırma (pinch) yakınlaştırma hiçbir yüzeyde desteklenmiyor — özellik
  isteği sınıfı, bug değil.
- Video sahnesinde kontrol görünürlüğü `mousemove`+olay odaklı; dokunmada
  uyum olayları kapsıyor ama saf-sürükleme senaryosu kalabilir (düşük).
