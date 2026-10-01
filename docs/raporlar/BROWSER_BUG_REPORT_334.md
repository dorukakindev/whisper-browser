# BROWSER_BUG_REPORT_334 — Kuyruk-50 madde 22: Altyazı kökeni inceleme görünümü

Tarih: 2026-10-01 · Dal: `devin/<ts>-r422-track-origin` · Başlangıç: `5f0df5c`

## Kapsam

Madde 22: "Her yakalanan parçanın kaynak, format, dil, video kimliği ve zaman
dönüşümünü göster; yanlış track seçildiğinde kullanıcı hangi adayın neden
seçildiğini anlayabilsin."

## Denetim bulgusu

- Mevcut: yakalanan izler `player.browserTracks`'te dil/etiket/format/satır
  sayısıyla listelenir; tanı paneli aday/hata kayıtlarını gösterir.
- Eksik: iz nesnesi `mediaId` (video kimliği) ve zaman dönüşümü
  (CEA kalibrasyonu) taşımıyordu; seçim gerekçesi (tamamlanmış CEA >
  listede-seçili > ilk kaynak adayı) hiçbir yerde görünmüyordu.

## Uygulanan

- `main.js` `publishBrowserTrackNow`: iz yüküne `mediaId` +
  `timeTransform` (offsetSeconds/matches/confidence) eklendi; CEA yolu
  kabul edilen `calibration`'ı meta üzerinden iletir.
- `renderer.js` madde-22 bloğu: `browserTrackOriginSummary`
  (kaynak · format · dil · video kimliği · ±sn kalibre · eşleşme),
  `browserTrackSelectionReason` (N kaynak adayı + öncelik gerekçesi),
  `renderBrowserTrackOrigin`; `browserTrackSelect` seçenek `title`'ı köken
  satırını ikinci satırda gösterir; `#browserTrackOrigin` durum çubuğu
  seçili izin köken+gerekçesini yazar.
- EN/TR çift dilli (UiLocale.t + yeni sözlük girdileri).

## Kanıt

- `node tests/browser-track-origin.test.js` → **30/30 PASS**
  (kaynak/format/dil/mediaId/kalibre özeti, aday-sayısı gerekçesi,
  CEA-önceliği, DOM render, kenar: NaN/sıfır offset, uzun mediaId kesimi)
- `browser-track-publication`, `browser-cea-captions`, `browser-track-kind`
  → yeşil; `node --check` (main/renderer/ui-locale) temiz.
