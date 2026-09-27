# BROWSER_BUG_REPORT_163 — R183: kaynak-zamanlayıcı envanteri + tam-klasör ölü işlev taraması

Tarih: 2026-09-28 · Dal: `codex/r183-test-harness-1790550000` · Temel: master `617171b`

Kapsam: `fs.watch`/`setInterval`/`eval` desen envanteri + tüm `src/`
modüllerinde tam-klasör ölü işlev taraması (fonksiyon bildirimleri ve oklar
çapraz-dosya referans sayımıyla).

## Ölü kod temizliği (6 işlev — hepsi tek bildirimli, çağıransız)

| İşlev | Dosya | Kanıt |
|---|---|---|
| `waitForBrowserAdblockReady` | `src/main.js` | Hiç çağrılmıyor; `browser-adblock.test.js` ratchet'i tam tersine ilk gezinmenin adblock hazırlığını bekle**me**diğini mühürlüyor (non-blocking tasarım). |
| `aiTimeToSeconds` | `src/renderer/renderer.js` | Tek bildirim, sıfır çağrı. |
| `sleepTimerLabel` | `src/renderer/renderer.js` | "N dk / bölüm sonunda" etiketi üretiyordu ama hiçbir UI çağırmıyor; sleep-timer select'i düz opsiyon metni gösteriyor. |
| `stPlaylistRemoveItem` | `src/renderer/renderer.js` | Tek-öğe liste silme hiç bağlanmadı; liste UI'ı yalnız bütün-liste `stPlaylistRemove` + tıkla-aç çipleri sunuyor. |
| `showTabError` | `src/renderer/renderer.js` | Kanal-sekmesi kapsamında bildirilmiş ama hiç çağrılmayan ok işlevi. |
| `pageMemoryKey` | `src/browser-page-translate.js` | Sayfaya enjekte edilen fonksiyonun içinde hiç çağrılmayan yardımcı; kalıcı çeviri belleği ana süreçte tutuluyor (sayfa içi sessionStorage güvenilir sayılmıyor — yorum korundu). |
| `sameId` | `src/media-catalog-store.js` | R170 indeksli içe-aktarım eşleşmesiyle çağıransız kaldı. |

## Bilerek korunanlar (yanlış-pozitif elemesi)

- `initialSettingsReady` — Electron smoke'ları sayfada `eval` ile bekliyor.
- `cuesToVtt` (renderer kopyası) — `subtitle-format.test.js` `new Function`
  rekonstrüksiyonuyla sözleşme yüzeyinin parçası.
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
`browser-page-translate` ✓

## Windows etkisi

Yok — yalnız ölü kod silindi; davranış değişmedi.
