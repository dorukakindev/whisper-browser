# R277 — Çok-ekran pencere durumu (monitör kopması / ekran-dışı bounds)

**Tarih:** 2026-09-30 · Dal: `fix/r277-window-state` → `master` · **Sonuç: temiz — mevcut tasarım doğru, test kilidi eklendi**

## Bulgular (kod okuma)

Tüm pencereler pozisyon geri-yüklemesinden bağışık:

| Pencere | Pozisyon politikası |
|---|---|
| `mainWindow` | Pozisyon kasıtlı saklanmıyor/geri yüklenmiyor; yalnız boyut+maximized |
| `youtubeTvWindow` | Sabit 1280×760 — pozisyon saklanmaz |
| Mini oynatıcı | Sabit 720×480 — pozisyon saklanmaz |
| İmge çevirici worker | Gizli/offscreen — yüzeye çıkmaz |

`createWindow` açılışta boyutu birincil ekran `workAreaSize`'a kelepçeliyordu,
ancak kelepçe `createWindow` içine gömülüydü ve test edilemezdi. Bozuk
`window-state.json` değerleri zaten güvenliydi (`st.width >= 940` sayısal
karşılaştırma tip-bozuk değerleri elerdi) ama `x/y` saklamama kuralı
belgesizdi — gelecekteki bir değişiklik pozisyonu geri ekleyebilirdi.

## Değişiklik

Keçe + yazım mantığı `src/window-state.js` saf modülüne çıkarıldı:

- `clampedWindowSize(st, work)` — tip-bozuk/negatif/devasa/Infinity/eksik
  değerler varsayılana (1180×820) veya ekran sınırına düşer; `minWidth`/`minHeight`
  (940×680) sabitleri tek yerde.
- `windowStateForDisk(bounds, maximized)` — `x`/`y` alanlarının asla diske
  yazılmamasını yapısal olarak kilitler.

`main.js` iki satırlık değişimle bu modülü kullanır; davranış bit-bit aynı.

## Riskler

- Birincil ekran `workArea` küçülürse (ör. tablet/portre modu) pencere
  `minWidth`'e kadar küçülür — Electron kendi sınırını uygular; ek risk yok.
- `maximized` geri yükleme birincil ekranda olur (kaydedildiği ekran bilinmez —
  pozisyon saklanmadığı için bu bilinçli ve güvenli bir varsayılan).

## Testler

`tests/window-state.test.js` — 21 kontrol: bozuk tip matrisi, monitör-kopması
kelepçesi (2560×1440→1366×768), devasa/negatif/NaN/Infinity, minimum sınır,
float yuvarlama, karışık geçerlilik, bozuk workArea, **x/y'nin asla saklanmadığı**
sözleşme testi. `node tests/window-state.test.js` → 21/21 PASS.
`settings-load-corruption` + `settings-backcompat` + `rejection-atomicity` yeşil.
