# BROWSER_BUG_REPORT_249 — R300: önizleme/thumbnail görüntü-sink güvenlik turu

**Tarih:** 2026-09-30 · **Dal:** `test/r300-preview-security` · **Başlangıç:** `2defb2e`
**Tür:** güvenlik denetimi + hedefli düzeltmeler (20'lik kuyruk madde 4)

## Özet

Sayfa/medya kökenli görüntü URL'lerinin renderer'daki sink'leri (favicon
`<img>`, seekbar storyboard `background-image`, omnibox ikonları, Invidious
thumbnail'ları) denetlendi. Yüzey çoğunlukla güvenliydi; **2 gerçek boşluk**
düzeltildi, davranışın merkezi kapısı (`safeRemoteImageUrl`) oluşturuldu.

## Denetim sonucu (temiz alanlar)

| Yüzey | Durum |
|---|---|
| Metin sink'leri (başlık, önizleme metni) | textContent — güvenli |
| `absThumb` (Invidious thumbnail) | http(s)-only; `//`→`https:` — güvenli |
| Favicon canlı akış | Ana süreç mime `image/` + 256KB + public-IP assert → data: — güvenli |
| Omnibox sonuç ikonu | `/^data:image\//i` kapısı — güvenli |
| Storyboard kare koordinatları | sayısal parse — güvenli |

## Düzeltilen bulgular

### 1) Storyboard sprite `background-image` kaçışsız + şemasız
`seek-previews` sprite URL'i doğrudan `el.style.backgroundImage =
\`url(${url})\`` biçiminde basılıyordu. Sayfa kontrollü bir URL (kart verisi
IPC'ten gelir ama kart içeriği sayfadan türetilir) `"` karakterleriyle CSS
kapanışı kırıp enjeksiyon yapabilir; `javascript:`/`file:` gibi şemalar da
istenebilirdi.
**Düzeltme:** `safeSeekSheetImageUrl` kapısı + `JSON.stringify` ile URL
tırnak-kapalı literal olarak basılıyor; reddedilen URL'de kart `hidden`.

### 2) Persist'ten gelen `tab.favicon` kapısız `<img>.src`'e
Oturum geri yüklendiğinde `tab.favicon` ham dizgi olarak img.src'e
basılıyordu. Canlı favicon akışı data:'ya indirgenmiş olsa da persist alanı
güvenilmezdi.
**Düzeltme:** `safeRemoteImageUrl(tab.favicon)` kapısı; boşta glyph/placeholder
dalları korunuyor.

## Yeni merkezi kapı

```js
safeRemoteImageUrl(url) → http(s) | data:image/ | blob: dışı → ''
  + tırnak/boşluk/backtick taraması
safeSeekSheetImageUrl(url) → +4096 sınırı → safeRemoteImageUrl
```

## Regresyon kilitleri

`tests/image-sink-security.test.js` (5 kontrol):
- şema matrisi: http/https/data:image(raster+svg)/blob kabul;
  javascript:/data:text/html/file:/vbscript://`//proto-relative`/tırnak-boşluk
  taşıyanlar/4096+ red.
- favicon sink'i `safeRemoteImageUrl(tab.favicon)` üzerinden (statik).
- sheet sink'i `JSON.stringify` (statik) + JSON.parse roundtrip.
- omnibox `/^data:image\//i` kapısı (statik).
- `absThumb` şema matrisi.

## Doğrulanmayan / notlar
- Gate `blob:` için köken ayrımı yapmaz; blob URL'leri renderer-içi obje
  kayıtlarından türer, sayfa enjekte edemez.
- svg data: favicon'lar kabul (img bağlamında script çalıştırmaz) — mime
  beyanı dışındaki svg içeriği ana süreç `image/` kontrolünden geçmiştir.
