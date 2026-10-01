# BROWSER_BUG_REPORT_321 — Biçim kayıpsız düzenleme denetimi + etiket düşürme uyarısı

50'lik kuyruk · madde 9 — *"Biçim kayıpsız düzenleme: ASS stilleri, VTT cue kimlikleri ve zamanlı metin etiketlerini koruyan düzenleme senaryolarını genişlet. Aç→düzenle→kaydet→yeniden aç döngüsünde yalnız amaçlanan alanların değiştiğini kanıtla."*

## Mevcut uygulama envanteri (yeniden yapılmadı)

- **ASS:** `replaceAssDialogueText` yalnız `Text` alanını değiştirir — `[V4+ Styles]`, Script Info, Effect/Name alanları, alan sırası (`Format:`), CRLF, `{\pos}` lead etiketi korunur; satır/zaman uyuşmazlığında `null` (dosya bozulmaz); `{` `}` enjeksiyonu tam-genişlikli karaktere çevrilir.
- **VTT/SRT:** `replaceTimedCueTexts` cerrahi gövde değişimi — WEBVTT başlığı, `Kind`/`Language`, `STYLE`/`REGION`/`NOTE` blokları, cue kimlikleri (`cue-1`), zamanlama ayarları (`position:10%`), BOM ve CRLF korunur; eşleşmeyen blokta `null`.
- **SRT:** dokunulmayan cue'ların ham gövdesi `cue.rawText` ile saklanır (`<i>`/`<font>` etiketleri yeniden üretimde kaybolmaz).
- **Zamanlama paneli:** "kopya kaydet" yeni `.srt` yazar — biçim dönüşümü bilinçli (kaynak dosya hiç üzerine yazılmaz).

## Doğrulanan kusur — B-321-01: düzenlenen cue'nun kendi etiketi sessizce düşüyordu

- ASS yolunda `assInner` uyarısı vardı ("biçim etiketleri kaldırıldı"), fakat:
  - `saveCueEdit` **VTT** ve **SRT** dallarında aynı uyarı yoktu — `<v Ali>`, `<i>`, karaoke `<00:00.0>` veya `&amp;` entity'si taşıyan cue'yu düzenleyen kullanıcı etiketi kaybettiğini öğrenmiyordu.
  - Toplu bul/değiştir (`applySubtitleFindReplacement`) uyarısı yalnız `format === 'ass'` kontrol ediyordu — VTT/SRT dosyasında etiketli cue değişen kullanıcı uyarılmıyordu.
  - Hızlı düzenleyici (`saveBrowserQuickEditor`) etiket uyarısını hiç basmıyordu.

## Düzeltme

- Yeni saf yardımcılar: `draftCuesForSrtSave(rawCues, index, text)` (saveCueEdit'in SRT taslağı test-edilebilir fonksiyona çıkarıldı) ve `cueHasInlineMarkup(cue)` (`rawText !== undefined` — kaynak gövde etiket/entity/görünmez içeriyordu).
- `saveCueEdit`: VTT ve SRT dallarında `cueHasInlineMarkup(sourceCue)` → aynı uyarı.
- `applySubtitleFindReplacement` + `saveBrowserQuickEditor`: uyarı koşulu `operation.format === 'ass' ? change.cue.assInner : cueHasInlineMarkup(change.cue)` — üç yol da kendi alanında biçim düşürme bildiriyor.

## Döngü kanıtı (aç→düzenle→kaydet→yeniden aç)

`tests/subtitle-format.test.js` +4 test (31/31): satır-diff ile yalnız amaçlanan satırın değiştiği doğrulandı —
- **ASS:** `{\k30}Ka{\k20}raoke`, `fade(200)` efekti, `Style: Alt`, `{\pos}` — tek `Dialogue` satırı değişti, kalanı bayt-bayt aynı; yeniden açma 3/3.
- **VTT:** `cue-a`/`cue-c` kimlikleri, `position:10%` ayarı, `<v Ali>`/`<i>`/karaoke `<00:00:02.000>` etiketleri — yalnız hedef gövde satırı değişti; yeniden açma 3/3 + `rawText` işareti korunuyor.
- **SRT:** `<i>`/`<font>`/`<v>` — `draftCuesForSrtSave` taslağında dokunulmayan cue'lar bayt-bayt korunuyor.
- Statik kilit: üç uyarı noktası (tekil + toplu + hızlı düzenleyici) kaynakta sabit.

## Test kanıtı

`node tests/subtitle-format.test.js` → 31 geçti, 0 başarısız.
İlişkili: `subtitle-edit-history` 9/9, `browser-quick-edit` geçti, `browser-bulk-edit-locks` 16/16.
`node --check src/renderer/renderer.js` temiz.

## Kapsam dışı / sınırlar

- Düzenlenen cue'nun etiketi **korunmuyor**, kullanıcıya **uyarı** veriliyor — ASS yoluyla tutarlı davranış. Otomatik etiket geri-birleştirme ayrı tasarım işi.
- Windows etkisi: renderer mantığı, platformdan bağımsız; elle doğrulanmadı.
