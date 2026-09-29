# BROWSER_BUG_REPORT_206 — R249: tam Electron smoke regresyonu + #187 review bulgusu

Tarih: 2026-09-29 · Dal: `audit/r249-translate-chain` · Taban: `057f6ac` (R248 sonrası master)

## Kapsam

R248 sonrası sıfır-açık-PR tabanında derin denetim: çeviri zinciri (backend
aynı-dil kapısı, Electron reasoning-model parametreleri, `finish_reason`,
think-blok temizliği, journal+compaction önbellek) kod okumasıyla doğrulandı —
hepsi zaten doğru. Ardından tam regresyon tabanı:

- `npm test` — tamamı yeşil.
- `node tests/run-electron-smokes.js --all` — 46 dosya; **2 deterministic
  düşüş** bulundu ve kök nedenine indi.

## Bulgular

### 1) `electron-browser-menu-formcontrols.smoke.js` — test-tarafı kusur (düzeltildi)
Smoke, `browserSplitMenu` içindeki `input#browserSplitRatio`'ya `focus()`
çağırıp `document.activeElement` bekliyordu; gerçekte `BODY` dönüyordu.
Kök neden: menü `<details>` öğesi `#aiChat.hidden` → `#playerLayer.hidden`
ataları altında yaşar (index.html:2667); `display:none` alt ağacındaki
elemanlar odak alamaz. Smoke ne oynatıcı katmanını ne AI sekmesini açıyordu —
**oluşturulduğu günden beri kırmızıydı** (R235'te eklendi, `npm test`'te
yok, ilk `--all` koşusunda yakalandı). Düzeltme: `openPlayer() +
setSideTab('ai')` gerçek UI yoluyla panel açılıyor.

### 2) `electron-browser-split-shortcut.smoke.js` — test-tarafı kusur (düzeltildi)
Smoke, bölünmüş görünümü ham `window.api.setBrowserSplit(...)` IPC'siyle
kurup `player.browserSplit.active`'i bekliyordu; zaman aşımı. Kök neden:
renderer'da `player.browserSplit` yalnız `setBrowserSplit()` yardımcısının
`result.split`'i `syncBrowserTabs`'a geçirmesiyle güncellenir (renderer.js
6329–6337); `tabs-changed` push olayı `split` taşımaz — `git log -L` ile
hiç taşımadığı doğrulandı. Smoke, oluşturulduğu 7fd4f2e'den (R234/#169)
beri kusurluydu. Düzeltme: gerçek renderer yardımcısı
`setBrowserSplit(tab2, 50)` çağrılır — artık ürün sözleşmesini olduğu gibi
test ediyor (IPC + renderer senkronu + Ctrl+K köprüsü dahil).

### 3) `browserSubtitleRetryable` — #187 review bug'ı (düzeltildi)
Node-pin indirme yolunun boyut-sınırı hatası `ESUBTITLE_LIMIT`
`browserSubtitleRetryable`'ın (main.js:9462) açık listesinde yoktu →
varsayılan `return true` koluna düşüyordu → `fetchBrowserBufferWithRetry`
aynı boyut-aşan yanıtı ikinci kez indiriyordu. Chromium yolu aynı durumu
`EBROWSER_UNSAFE_RESPONSE`'a çeviriyor (zaten yeniden-denemez). Düzeltme:
`ESUBTITLE_LIMIT` yeniden-denemez kod listesine eklendi.

### Needs_human bırakılanlar
- **#187 flag — `auto` kaynak dilinde sıra sayısı:** `source_lang='auto'`
  iken `_lang_ordinals` False sayar; gerçek ordinal-dil kaynaklarında
  ('3. Selim') kaynak cümle sayısı bir fazla çıkar → kota gevşer (daha
  sıkı değil, daha hoşgörülü — kalite kapısı sertleştirme fırsatı, hatalı
  çıktı değil). `file_looks_turkish` yalnız `target=='tr'` iken hesaplanır;
  auto kaynağı genel bir sezgiyle bağlamak heuristic'in güven yarıçapını
  genişletir. Tasarım kararı → needs_human.

## Doğrulanan-yanlışlar (temiz yüzey)
- `translate_existing_subtitle` aynı-dil kapısı (7740–7780) doğru:
  `source_is_auto` + `file_looks_turkish` + precompleted map + durum yayını.
- Electron LLM istekleri: `sentenceTranslationGenerationParameters` /
  `sentenceTranslationMessageRole` reasoning aileleri kapsıyor
  (`gpt-5|o[1-9]`), `finish_reason` kontrollü, think-blok temiz.
- `browser-translation-cache` journal+compaction modeli write-amplification'ı
  karşılıyor (50k kayıtta R222/R223 ölçümleri).

## Test kanıtları

| Komut | Sonuç |
|-------|-------|
| `npm test` | PASS (tam paket) |
| `node tests/run-electron-smokes.js --all` | 2 deterministic düşüş → düzeltme sonrası aşağıdaki ikisi yeşil |
| `npx electron tests/electron-browser-menu-formcontrols.smoke.js` | `{"ok":true,"nav":"range 50→51, select korundu, düğme gezindi → browserSplitSecondary"}` |
| `npx electron tests/electron-browser-split-shortcut.smoke.js` | `{"ok":true,"split":"secondary Ctrl+K → sekme terfisi + palet açıldı"}` |
| `node tests/browser-subtitles.test.js` | 81 test geçti |
| `node tests/browser-subtitle-actions.test.js` / `browser-lifecycle-policy.test.js` / `browser-manifest-recovery.test.js` | PASS |
| `node --check src/main.js` + smoke dosyaları | OK |

Kırmızı kanıtı: her iki smoke düzeltmeden ÖNCE `npx electron` ile
deterministik FAIL (BODY / browserSplit timeout) — ayrıca
`b85c3f9~1` üzerinde R235 dosyalarıyla da FAIL (kusur ilk günden var).

## Çalıştırılmayanlar / sınırlar
- `--all` setinin kalanı tek tek yeniden koşulmadı; düşenler hedefli
  doğrulandı. Tam set son durumu CI'nin smoke olmadığını unutmadan: smoke
  hattı `npm test`'te değil; Windows'ta elle koşulması önerilir.
- `ESUBTITLE_LIMIT` davranışı birim-test seviyesinde listeye eklendi;
  canlı büyük-dosya indirmesi Windows/proxy ortamında doğrulanmadı.
