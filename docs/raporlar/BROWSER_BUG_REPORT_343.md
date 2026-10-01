# BROWSER_BUG_REPORT_343 — Kuyruk-50 madde 31: medya yeniden bağlama motoru

Tarih: 2026-10-01 · Başlangıç: `79138bb`

## Denetim bulgusu

`library:relink` IPC'si mevcuttu ama tamamen manueldi: kullanıcı dosya
seçiciden yeni konumu gösterirdi. Maddenin istediği motor yoktu — otomatik
aday eşleştirme, belirsizlikte kullanıcıya aday gösterme ve yanlış-medya
koruması eksikti.

## Uygulanan

- **`src/media-relink-matcher.js` (yeni):** deterministik skorlayıcı —
  aynı ad +3, aynı kök-ad +1, aynı uzantı +1, boyut eşleşmesi +3
  (en güçlü kimlik sinyali). `unique` (tek güçlü aday) / `ambiguous`
  (eşit skorlu adaylar) / `none`. 8 adayda keser.
- **`library:relink-suggest` IPC:** eski dosyanın son klasöründe (yoksa üst
  klasörde) ≤2 seviye, ≤1500 girdi sınırlı tarama; medya uzantıları + boyut
  ile aday toplar, skorlanmış ilk-8 listeyi döner. `authorizedBrowserSender`
  korumalı.
- **`upsertWatchItem` parmak izi:** yerel medya kayıtlarına `sizeBytes`
  eklenir (statSync) — boyut gelecekteki taşınma eşleşmesinde kullanılır.
- **Renderer `offerMediaRelink`:** adaylar varsa seçimli diyalog
  (`openAppDialog` choices) sunar — her aday `ad · boyut` etiketiyle;
  "Dosya seçiciyle göster…" şıkkı manuel akışa düşürür. Yanlış-medya
  koruması: hiçbir bağlama otomatik değil, kullanıcı her zaman onaylar;
  boyut uyuşmazlığı adayın skorunu düşürür.

## Kanıt

- `tests/media-relink-matcher.test.js` → 9/9 PASS (unique/ambiguous/none
  karar matrisi, boyut uyuşmazlığı, deterministik sıralama, tavan kesimi)
- `node --check` main.js/preload.js/renderer.js temiz
- `ipc-parity` → 0 unguarded handler; `preload-usage-ratchet` → 236 export,
  0 kullanılmayan

## Sınırlar

Süre doğrulaması (ffprobe) kullanılmadı — aday adı + boyut yeterli sinyal;
süre karşılaştırması ayrı probe gerektirdiği için belirsizlikte diyalog
kullanıcıya gösteriyor. Süre eşleştirmesi ileride parmak izine eklenebilir.
Windows'ta tarama/yol davranışı platform-nötr (`path.join`, küçük-büyük
harf normalizasyonu win32 key'le uyumlu).
