# BROWSER_BUG_REPORT_322 — Altyazı sürüm/kurtarma (kuyruk-50/10)

Kapsam: otomatik kayıt, kullanıcı kaydı ve dışarıdan değişen dosyanın ayrımı;
çakışma önizleme ve seçili değişiklik birleştirme. `src/renderer/renderer.js`
tekil düzeltme (`saveCueEdit`), `media:writeSubtitle` IPC ve düzenleme günlüğü.

## Mevcut davranış envanteri (denetim)

- **Harici-değişim bekçisi:** `media:writeSubtitle` `expect:{mtimeMs,size}`
  kontrolü yapar; uyuşmazsa "Altyazı dosyası dışarıdan değiştirildi" hatası
  (lost-update reddi). Renderer `subStat`/`sub2Stat` ile son okunan/yazılan
  disk durumunu taşır (`subtitleStatFor`/`noteSubtitleStat`).
- **Sürüm ayrımı:** düzenleme günlüğü `action` alanıyla yazar
  (`edit`, `bulk-edit`, `quick-edit`, `edit-rollback`, `bulk-rollback`);
  yeni `edit-merge` eklendi. `.bak` yedeği ilk yazımda bir kez oluşur
  (`backupOnce` — "ilk bilinen iyi" taban çizgisi).
- **Taslak koruma:** yazma reddedilirse düzenleyici taslağı korunur;
  hızlı düzenleyici taslağı localStorage'a düşer.
- **Tarayıcı tarafı çakışma önizleme:** `browserReviewConflicts` paneli
  "önceki kaynak / düzeltmeniz / yeni kaynak" üçlüsünü gösterip keep/discard
  sunar — yerel dosya tarafında karşılığı yoktu.

## B-322-01 — Dışarıdan-değişim reddinde birleştirme yoktu

`saveCueEdit` için `expect` uyuşmazsa kullanıcıya yalnız "yeniden açın"
dönüyordu: dış değişikliğin içeriği önizlenmiyor, kullanıcı metni yeni
sürüme taşınmıyordu. Tek çıkış dosyayı yeniden açmak (taslak kaybı).

**Düzeltme:** `mergeCueEditOntoExternal` — reddedildiğinde diskin güncel
sürümünü okur (`readSubtitle`), hedef cue'yu `subtitleSourceIndex` veya
zaman (±2ms) ile bulur, kullanıcı metnini yalnız o cue'ya uygular
(`replaceAssDialogueText`/`replaceVttCueText`/`draftCuesForSrtSave`) ve
güncel `{mtimeMs,size}` bekçisiyle yazar. Yanlış sürümün üzerine yazılmaz;
cue eşleşmezse (`nomatch`) veya ikinci yazma da reddedilirse taslak
korunup yazılmaz. Başarıda `loadSubtitle` ile bellek senkronlanır,
`cueEditUndo`'ya `before=güncel-disk` girdisi düşer (geri alma dış
değişiklikleri de korur).

**Önizleme:** `diffCount` (bellek↔disk farklı satır sayısı) günlükte
bildirilir; aynı satır dışarıdan da değiştiyse `externalDiffers` ile
"aynı satır diskte de değişmişti — metniniz uygulandı" uyarısı verilir.

## Kanıt

`tests/subtitle-edit-history.test.js` — 16/16:

- dış değişim korunur, yalnız hedef cue değişir (`expect` güncel mtime)
- aynı-satır çakışması `externalDiffers` ile önizlenir
- hedef cue eşleşmezse hiçbir şey yazılmaz (0 writeSubtitle çağrısı)
- ikinci yazma reddi başarısız döner, taslak korunur
- VTT cue-id ve ASS stil/ad alanları güncel sürümde korunur
- `saveCueEdit` → birleştirme yolu statik kilitleri

Ayrıca `subtitle-format` 31/31, `browser-quick-edit`, `browser-bulk-edit-locks`
16/16 yeşil.

## Sınırlar

- Birleştirme tekil düzeltme içindir; toplu değişimler (`writeSubtitleBulkFiles`)
  `expect` reddinde tüm dosyayı geri alır ve reddeder — doğru davranış, çünkü
  toplu merge belirsizliği yüksek olurdu.
- `subtitleSourceIndex` eşleşmesi toptan yeniden-numaralanmış dosyada zaman
  yedeğine düşer; zamanları da değişmiş satır eşleşmez (taslak korunur).
