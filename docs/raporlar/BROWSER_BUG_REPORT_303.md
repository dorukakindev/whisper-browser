# BROWSER BUG REPORT 303 — R384–R386 derin okuma turu

## Kapsam

| Modül | Satır | Sonuç |
|---|---|---|
| `src/browser-page-translate.js` | 1466 | Temiz |
| `src/browser-manga.js` | 1066 | 1 kozmetik kusur (B-303-01) |
| `backend/sentence_translation.py` | 1363 | Temiz |

## Bulgular

### B-303-01 — Manga bölge ipucunda bozuk kısayol metni (`Ctrl+Manga`) — DÜZELTİLDİ

`mangaOverlayScript`'te bölge çerçevesinin `title` ipucu
`"…Seçili bölgeyi yeniden çevirmek için Ctrl+Manga."` yazıyordu — `Ctrl+Manga`
diye bir kısayol yok. Seçili bölgenin gerçek yeniden-çeviri tetikleyicisi
araç çubuğundaki Manga düğmesine **Ctrl+tık**'tır (`renderer.js`
`browser:manga:retrySelected`, düğme ipucu satırı 6739/6741). Kullanıcıya
olmayan bir kısayol öğretiliyordu.

Düzeltme: `src/browser-manga.js` bölge ipucu
`"Manga düğmesine Ctrl+tık seçili bölgeyi yeniden çevirir."` ile uyumlu hale
getirildi. Kanıt: `node --check` temiz; 7 manga test dosyası PASS
(browser-manga, lookahead-lifecycle, layout-state, restore-deadzone,
ocr-hardening, region-layout, fetch-deadzone).

## Temiz doğrulananlar

- **browser-page-translate.js:** `state.refs`/`knownIds` büyümesi emisyon
  bütçesiyle sınırlı (≤1500 — refs.set yalnız bütçe içinde). ownWrites ile
  kendi yazılarımız observer'da sayfa-mutasyonu sayılmıyor. Kopan shadow-root
  observer'ı güçlü Map'ten düşürülüyor. scroll/visibility/action dinleyicileri
  restore'da kaldırılıyor. `decodePageTranslation` blok-bazlı katı kabul
  (bilinmeyen anahtar/fazla-satır/çift-id reddi + korumalı-token ve
  bağlam-sızıntısı kapıları). `pageMemory`/`persistTranslation` boş saplamalar
  bilinçli (bellek ana süreçte). `insertAfterRoot` TABLE/ebeveyn güvenliği.
  Düzenleme dirty-guard, isTrusted kapıları, token'lı köprü.
- **browser-manga.js:** `extractJsonPayload` 16-aday sınırlı O(n) ayıklama.
  Bölge/kutu kısıtları (≤160 bölge, ≤1200 metin, ≤48000 toplam, kutu
  [0,1000] min 8×8). `isSafeMangaImageUrl` trailing-dot FQDN atlama kapısı +
  `isPublicMangaIpAddress` (CGNAT/6to4/Teredo/localhost retleri) — SSRF
  dayanıklı. Kimlik içerik-URL'sine bağlı (srcset değişimi eski çeviriyi
  taşımaz). Editör dirty-guard + isTrusted + undo-50 + tainted-canvas
  okunmaz. `mangaClearScript` tüm dinleyici/observer/katman temizliği.
- **sentence_translation.py:** kaynak parça sayımı kaynak dilinin
  sıra-sayısı kuralıyla, hedef kendi kuralıyla (`language` parametreleri).
  `part_anchor_issue` saat/sayı/birim/tarih/SDH/özel-ad demirleri —
  birim-dönüşümü bağışı bitişiklik-gerektirir, ad-yerelleştirme kapalı
  eşdeğer listesine bağlı. `reply_id_range_issue` + `normalize_reply_ids`
  (uniform +1 kayması yalnız tam-küme eşleşmede). Çok bloklu grup atomik
  kabul. `blocking_issues` daraltması bilinçli (negation tanı-kalıcı).

## Doğrulanmayan (Windows)

Bu tur Windows'a özgü risk yok — tek değişiklik sayfa-içi tooltip metni.
