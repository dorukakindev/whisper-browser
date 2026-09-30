# BROWSER_BUG_REPORT_279 — R323-7: clipboard/drag URL sanitizasyon fuzz'ı

Tarih: 2026-09-30 · Dal: `devin/1790766290-r323-7-drop-link` · Kod commit: `a201bbe`

## Kapsam

Sürükle-bırak + pano yüzeyleri: `handleDropPayload` (renderer.js ~1788),
`paths:scanMedia`/`scanMediaFromPaths` (main.js ~17173), sekme-şeridi drag
(`browserTabStrip`), içerik-menüsü kopyalama (`copy-link`, `paste`), omnibox
navigasyonu (önceki turlarda kapandı).

## Denetim sonucu

**Sert yüzeyler temiz çıktı:**
- `scanMediaFromPaths`: kullanıcı-onay diyaloğu + TOCTOU yeniden-doğrulama +
  maxDepth=5 + maxResults=20000 + visited-set (symlink dedupe) + MEDIA_EXTS
  beyazlistesi + 1000 kök sınırı — derinlik/kota bombasına kapalı.
- Dosya bırakma yolu gerçek `webUtils.getPathForFile` disk yollarını kullanır;
  PDF/altyazı/medya dağılımı sadece dosya uzantısına bakar — URL enjeksiyonu
  kanalı yok.
- Sekme-şeridi drag'i yalnız sekme-id'si taşır (`text/plain` = id, şema yok).

## Doğrulanmış bug — B-323-05 (düşük): uri-list yorum satırı geçerli linki sessizce düşürüyor

`handleDropPayload` `text.split(/\s+/)[0]` ile ilk token'ı alıyordu. `text/uri-list`
spec'inde `#` ile başlayan satırlar yorumdur; böyle bir satırla başlayan (veya ilk
token'ı http(s) olmayan) geçerli bir bırakma metni sessizce hiçbir şey yapmadan
sonlanıyordu.

**Düzeltme:** `pickDroppedLink` (renderer-helpers) — yorum/boş satırları atlar,
satır içindeki token'ları sırayla dener, ilk `/^https?:\/\//i` eşleşmesini döndürür;
şema-beyazliste dışı her giriş `null`. Böylece hem spec uyumu hem de "metnin
ilerisindeki link" bulunması sağlandı — şema güvenlik kapısı davranışı
**sıkılaştırılarak korundu** (daha geniş değil, daha doğru seçim).

## Fuzz sonuçları

`tests/dropped-link-fuzz.test.js` (5 test) PASS:

- **Şema beyazlistesi:** 17 hostile giriş (file:, javascript:, data:, chrome:,
  view-source:, whisper-assets:, mailto:, ws:, `JAVASCRIPT:` büyük harf, `ht tp:`)
  → hepsi `null`.
- **Spec uyumu:** `#yorum` satırı atlanır, boş satırlar geçilir.
- **İçeriden bulma:** önceki çöp token'lar atlayıp geçerli URL seçilir.
- **500-tohum oracle:** çıktı ≡ ilk http(s) token'ı veya `null`; fuzz'ın ilk
  turunda oracle'ın kendisinde bir yanlış yakalandı (satır-bazlı yorum kuralı
  token-bazlı yazılmıştı — düzeltildi).
- **Hostile tipler:** null/undefined/obje/boşluk/NUL → crash yok.

## Windows etkisi

Yok — sürükle-bırak davranışı platformdan bağımsız; yalnız seçim mantığı değişti.

## Doğrulanamayan sınır

Gerçek tarayıcıdan uygulamaya sürükleme Electron el-kontrolü gerektirir; seçim
mantığı birim düzeyinde kilitlendi, entegrasyon noktası (dataTransfer.getData)
değişmedi.
