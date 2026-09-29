# BROWSER_BUG_REPORT_196 — R239: sekme önizleme kartı native yüzey altında kırpılıyordu

- Tur: R239 (tur-3 BULGULAR son açık madde) · Tarih: 2026-09-29
- Teslim dalı: `fix/r239-tab-preview-clip` · Başlangıç kod kimliği: `0510569` (master)
- Kapsam: `showBrowserTabPreview` (`src/renderer/renderer-helpers.js`)

## Bulgu

BULGULAR.md §102: "Sekme önizleme kartı sayfanın üstünde kırpılabiliyor."
Doğrulandı: hover kartı `position:fixed` + `z-index:9998` ile `document.body`'ye
ekleniyor ama tarayıcı sayfası **native `WebContentsView`** — renderer DOM'unun
üstünde boyanır. Kart sekme şeridinin 6px altına yerleştirildiği için alt kısmı
native yüzeyin başladığı yere denk geliyordu → kart sayfa çizgisinde kırpılıyordu.

## Kök neden

`showBrowserTabPreview`'in dikey sınırı `window.innerHeight` idi:

```js
card.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - ch - 4)}px`;
```

Kart, DOM'un görebildiği bölgede (pencere içinde) kalsa bile native yüzeyin
kapladığı alana taşabiliyordu — DOM için "ekran içi" ≠ görünür alan.

## Düzeltme

Dikey sınır `#browserViewSlot`'un üst kenarıdır (native yüzeyin başladığı
piksel — `browserSlotBounds()`'un gönderdiği aynı rect):

```js
const slotTop = $('browserViewSlot')?.getBoundingClientRect?.().top;
const topLimit = Number.isFinite(slotTop) && slotTop > 0 ? Math.min(window.innerHeight, slotTop) : window.innerHeight;
card.style.top = `${Math.max(4, Math.min(rect.bottom + 6, topLimit - ch - 4))}px`;
```

Sığmadığında kart şeridin üstüne doğru çekilir (BULGULAR'ın önerdiği "şeridin
içine al" davranışı); slot yok/gizliyse eski `innerHeight` davranışı korunur.
`Math.max(4, …)` sadece dejenere durumda (kart > chrome alanı) üstte kalmasını
sağlar.

## Testler

Yeni `tests/browser-tab-preview.test.js` (vm-ayırma + stub):

- Normal yerleşim: top=48, kart altı 108 ≤ slotTop=120.
- Sığmayan durum: slotTop=100, ch=60 → top=36 (eski formül 48 → alt 108, kırpılırdı).
- Slot yok: `innerHeight` fallback aynen çalışır.

Sonuç: 3/3 test yeşil. `node --check` temiz.

## Windows etkisi

Bug'ın kendisi zaten Windows'a özgü etkiydi (native yüzey tüm platformlarda
DOM üstünde ama görünür kırpma, WebContentsView'in yerleşim katmanında en net
Windows'ta görünür). Düzeltme platform bağımsız; Windows el kontrolü: sekme
üzerine fareyle gel → kart tamamen görünür, sayfa çizgisinde kesilmez.

## Çalıştırılmayan kontroller

`npm test` tam seti (hedefli koşuldu), Electron smoke (başsız kutu), gerçek
Windows'ta hover kartının görsel doğrulaması.
