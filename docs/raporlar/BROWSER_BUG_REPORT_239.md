# BROWSER_BUG_REPORT_239 — Sekme/oturum persist şeması bozuk-veri matrisi

R291 · Tarih: 2026-09-30 · Dal: `test/r291-tab-persist` · Temel: `5d60f40`

## Sonuç: katman savunmalı; 1 sertleştirme + 402 kontrollük kilit

Sekme/grup persist şeması (`browser-session-store`) bozuk-veri matrisiyle
sınandı — tüm girişler `normalizeBrowserSession`/`normalizeSessionTab`/
`readBrowserSessionWithStatus` kapılarından geçtiği için çöküş ya da
kirli çıktı üretilemedi. Tek sertleştirme: `cloneBrowserPlaces`'ın
normalize-garantili veriye örtük güveni `Array.isArray` kapılarına
çevrildi (gelecekteki bir yazım yolu ham veri sokarsa artık fırlatmaz).

## Kilitlenen sözleşmeler
| Yüzey | Kilit |
| --- | --- |
| `normalizeBrowserSession` | kök tip-bozukluk → boş session; kapasite `MAX_SESSION_TABS`; sınır-dışı aktif başa; `splitRatio` [0.25,0.75]; secondary≠aktif+üye |
| `normalizeSessionTab` | URL kapısı (javascript:/data: reddedilir); dizi alanları her zaman dizi; enum beyaz listeleri; sayı kelepçeleri |
| `migrateBrowserSession` | v1→v6 zinciri; gelecek sürüm + bilinmeyen anahtarlar taşınır |
| `readBrowserSessionWithStatus` | [primary,.bak] döngüsü; damaged uyarıları; `droppedTabs` sayımı |
| `writeBrowserSessionAtomic` | temp+rename+fsync; `.bak` = önceki geçerli birincil; bozuk ana kayıt sağlam yedeğin üstüne yazılmaz |

## Testler
- `node tests/browser-session-corrupt.test.js` → 402 kontrol PASS.
- `node --check src/main.js` → temiz.
