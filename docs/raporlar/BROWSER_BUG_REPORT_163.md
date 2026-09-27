# BROWSER_BUG_REPORT_163 — R183: kaynak-zamanlayıcı envanteri + tam-klasör ölü işlev taraması

Tarih: 2026-09-28 · Dal: `codex/r183-test-harness-1790550000` · Temel: master `617171b`

Kapsam: `fs.watch`/`setInterval`/`eval` desen envanteri + tüm `src/`
modüllerinde tam-klasör ölü işlev taraması (fonksiyon bildirimleri ve oklar
çapraz-dosya referans sayımıyla).

## Ölü kod temizliği (4 işlev — hepsi tek bildirimli, çağıransız)

| İşlev | Dosya | Kanıt |
|---|---|---|
| `waitForBrowserAdblockReady` | `src/main.js` | Hiç çağrılmıyor; `browser-adblock.test.js` ratchet'i tam tersine ilk gezinmenin adblock hazırlığını bekle**me**diğini mühürlüyor (non-blocking tasarım). |
| `showTabError` | `src/renderer/renderer.js` | Kanal-sekmesi kapsamında bildirilmiş ama hiç çağrılmayan ok işlevi. |
| `pageMemoryKey` | `src/browser-page-translate.js` | Sayfaya enjekte edilen fonksiyonun içinde hiç çağrılmayan yardımcı; kalıcı çeviri belleği ana süreçte tutuluyor (sayfa içi sessionStorage güvenilir sayılmıyor — yorum korundu). |
| `sameId` | `src/media-catalog-store.js` | R170 indeksli içe-aktarım eşleşmesiyle çağıransız kaldı. |

## Bilerek korunanlar (yanlış-pozitif elemesi)

- `initialSettingsReady` — Electron smoke'ları sayfada `eval` ile bekliyor.
- `cuesToVtt` (renderer kopyası) — `subtitle-format.test.js` `new Function`
  rekonstrüksiyonuyla sözleşme yüzeyinin parçası.
- `aiTimeToSeconds` — `browser-reading-design.test.js` kaynak-metonu
  sözleşmesiyle mühürlü (ilk süpürme `| head` kesmesiyle gözden kaçtı;
  testler test edilmeden silinemez kuralı doğrulandı).
- `sleepTimerLabel` — `player-extras-parti3.test.js` metin-slice ile
  işlevi çıkarıp çalıştırıyor (sözleşme sabiti).
- `stPlaylistRemoveItem` — `smarttube-playlists-parti5b.test.js` vm-harness
  `__api`'sinde referanslı; liste-öğe silme API yüzeyi sabitlenmiş.
- `initPlayerLayout` — isimli IIFE, kendi kendine çalışıyor.
- `exposeBrowser*` / `init*` / `tracked*` aileleri — UMD/window-köprüsü
  fabrikaları; kendi dosyasında tek bildirimli ama çapraz-script canlı.
- `executeRecordedBrowserWorkflowStep`, `browserCommandPaletteCommands` —
  `renderer-helpers.js`'ten çapraz-kapsam çağrılıyor (classic-script ortak
  global'i).

## Kaynak envanteri (temiz)

- `fs.watch`/`watchFile`: ürün kodunda yok.
- `setInterval` (18 site): tümü ya eşleşmiş `clearInterval`'lı (medya
  kontrolör, watchTimer, browserTrack/Capture/MediaTimer, manga lookahead,
  ambient, taskPulse, ytCode, upnext geri sayım) ya kasıtlı sayfa-ömürlü
  ucuz yoklamalar (uyku zamanlayıcı, stale-check 1s, OSD pulse).
- `eval`/`new Function`/`vm.runIn*`: ürün kodunda yok (yalnız testlerde).

## Testler

`node --check` 4 dosya ✓ · `browser-adblock` ✓ · `subtitle-format` 27 ✓ ·
`subtitle-timecode` 33 ✓ · `player-ui` 153 ✓ · `media-catalog-store` ✓ ·
`browser-page-translate` ✓ · `player-extras-parti3` ✓ ·
`smarttube-playlists-parti5b` ✓ · `browser-reading-design` ✓

## Windows etkisi

Yok — yalnız ölü kod silindi; davranış değişmedi.
