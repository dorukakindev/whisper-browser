# BROWSER_BUG_REPORT_155 — R153 dilim-3 + dilim güvenlik kuralı sertleşmesi

**Tarih:** 2026-09-27 · **Dal:** `codex/r173-renderer-slice3` · **Tür:** refactor + test-güvenlik bulgusu

## Özet

renderer.js modülerleştirmesinin üçüncü doğrulanmış dilimi: 7 işlev
`renderer.js` → `renderer-helpers.js`. Taşıma denemesi sırasında R153'ün
dışlama kuralının eksik bir yönü bulundu ve düzeltildi — sonuç "temiz"
değil, **uygulanmış düzeltme + güncellenmiş kural**.

## Taşınan işlevler (7)

| İşlev | Grup | Neden güvenli |
|---|---|---|
| `scheduleQueuePersist` | kuyruk | yalnız `renderQueue` çağırır; testte adı/gövdesi yok |
| `removeFromQueue` | kuyruk | aynı |
| `queueItemMeta` | kuyruk | aynı |
| `blobToBase64` | canlı ASR | yalnız `startBrowserLiveAsrCapture` çağırır |
| `detailsMenuFocusable` | UI | yalnız helpers içinden çağrılır |
| `switchYoutubeAccount` | hesap | yalnız `renderYoutubeAccounts` çağırır |
| `removeYoutubeAccount` | hesap | aynı |

renderer.js 27 907 → 27 826 satır; renderer-helpers.js 921 → 1 003 satır.
`npm test` tam paket yeşil.

## Bulunan kural açığı (bu dilimde düzeltildi)

İlk deneme 26 işlevi taşıdı; tam pakette **8 test dosyası düştü**. Kök
neden analizi iki yeni risk sınıfı gösterdi:

1. **`(module-body)` çağıranlar güvenli değil.** Eval edilen dilim
   top-level kablolama kodu içeriyorsa (`el.onclick = () => fn()`), test
   o kabloyu tetiklediğinde taşınan işlev `ReferenceError` verir.
   `loadStPlaylists`, `loadStHiddenVideos`, `bindCueListDelegation`,
   `refreshBrowserAddressResults` bu yüzden geri alındı.
2. **Dilim-içi literal/bölge kapsamı isim-anchor'suz da ısırabilir.**
   `queueCurrentBrowserPage`/`applyWatchState`/`fetchSubsWithActiveSource`
   gibi işlevlerin gövde literal'ları (`formats: opts.formats`,
   `player.browserAddressQuery = query`) testlerin eval ettiği bölgelerde
   doğrudan bekleniyor.

**Güncellenmiş güvenli küme tanımı (R153 kuralı v2):** taşınabilir işlev =
isim testlerde yok + gövde literal'ları testlerde yok + hiçbir test
diliminin içinde değil + **hiçbir çağırıcısı `(module-body)` veya testte
adı geçen bir işlev değil**. Helpers-içi çağırıcılar güvenli.

Bu kurala göre kalan adayların büyük bölümü (`st*`, `loadSt*`,
`queueCurrentBrowserPage`, `applyBrowserPageExclusions`,
`handleWatchLibraryAction`, `selectVideoWithGeneration`, `applyWatchState`,
`testSelectedTranslationProvider`, `updateStopAfterBtn`,
`stopBrowserLiveAsrCapture`, `fetchSubsWithActiveSource`, zoom/NTP/
find/omnibox ailesi) **taşınamaz** — ya doğrudan test diliminin hedefi
ya da modül gövdesinden tetiklenen kablolamaya bağlı. Bir sonraki büyük
adım (R153'te işaretlenen ortak `loadRendererSource` yükleyicisi) hâlâ
geçerli; dilim-4+ için maliyet/fayda düşük, önce loader göçü önerilir.

## Doğrulanmamış sınır

- Windows'ta işlevsel fark yok (salt dosya taşıması); `start.bat` akışı
  etkilenmez.
