# BROWSER_BUG_REPORT_224 — R273: Devin Review toplu triage (master'ın birikmiş bulguları)

## Kapsam
Merge edilmiş PR'ların (#202/#203/#211/#212/#219 + çevre doküman/test PR'ları) Devin Review bulgularının toplu triage'ı. Kod bulguları `fix/r273-review-triage` dalında düzeltildi; belirsiz/tasarım-seçimi bulguları ilgili PR thread'lerinde `needs_human` olarak bırakılacak.

## Kod bulguları → düzeltme

### 1) backend/transcribe.py — probe `skipped` sayımı şişiyordu (#203)
`pack_sentence_groups(pending_groups)` parçalarındaki önbellek/önceden-çevrilmiş (done_idx) konumlar `sum(len(ch))` ile başarısız sayılıyordu — bir grubun yalnız bir kısmı done olabilir (önbellek isabeti + partial). Artık yalnız `index not in done_idx` sayılır. `llm_progress.failed` doğru.

### 2) backend/transcribe.py — refine prob sonrası sağlayıcıya giderdi (#203)
`probe_stop` bayrağı yalnız `remaining_chunks` doluyken atanıyordu; kalan parça yoksa (probe tek son parçadaysa) kalıcı hata bayrağı boş kalıp 2. geçiş ölü sağlayıcıya tüm refine paketlerini ücretle deniyordu. Kapı artık `fatal_reason` (prob'un kalıcı sınıfı) + `fatal_stop["error"]` (orta-koşu fatal) üzerinde — kalan parça sayısına bakmaz. Atlama durumunda log + warn_list yazılır, 1. geçiş korunur.

### 3) src/browser-overlay-controller.js — bayat indeks in-place mutasyonları kaçırıyordu (#211)
- `extendable`/rebuild kararına üç sabit nokta probu eklendi: head(0)/mid(n>>1)/tail(n-1) start+end kimlikleri — listedeki herhangi bir in-place değişiklik (cues[i].end=20) bayat prefixMax'le erken-kesmeli taramaya girip gelecekteki geçerli sınırı kaçırıyordu.
- `keep(indexData.suffixMin[last+1])` sondaki minimum-sonsuz hesabı yerine `last+1`'den ileri tarama; `start > best` ile erken kesilir — bozuk `end` değerleri (end<start, end<t) gelecekteki geçerli sınırları gizlemez. O(n) yeniden-kurma maliyeti de gitti (`rebuildSuffix` silindi — her extendable çağrısında O(n²) idi).
- Üretimde WeakMap zaten her güncellemede taze dizi görür; problar dışa-açık API için savunma derinliği.

### 4) src/browser-overlay-controller.js — BOUNDARY_EPS epsilon kapısı (#211)
FP asimetrisi: `(videoTime - offset) / scale` ↔ `src * scale + offset` ~1e-9'lık sınırı "geçmişe" itebiliyordu → strict `>` sınırı düşürüyordu → timer kurulmuyordu → stale cue. `BOUNDARY_EPS = 0.001` 1 ms'lik tolerans ekler; `delayMs` zaten ≥0'a kenetleniyor, erken-ateşleme riski yok.

### 5) src/main.js — eksik-glif taraması parça sınırına takılıyordu (#212)
`failed to find any fallback with glyph 0x…` ifadesi stderr parça sınırından ikiye kesilirse kalıcı olarak kaçıyordu. Tarama artık `errTail` (yuvarlanan son-1500 karakter) üzerinde `matchAll` — parça-sınırına dayanıklı.

### 6) src/main.js + src/burnin-output.js + src/renderer/renderer.js — kayıp-glif sayacı (#212)
- `job.missingGlyphs` seti done/fail/recover yollarında `missingGlyphs` sayısı olarak yüzeye taşınır; recovery kaydında saklanır (resume sonrası da sayı doğru: `recoveredGlyphCount` seed'i).
- `normalizeBurninRecovery` whitelist'e `missingGlyphs` eklendi.
- renderer'da `logBurninMissingGlyphs(count)` — hem `recovered` hem `done` yolunda EN/TR uyarı.

### 7) src/main.js — transcribe stdout JSON-olmayan satır iletimi geri alındı (#219)
R271'in toleranslı `parseNdjsonLine` geçişinde `if (!_parsed)` dalı boş kalmıştı: yt-dlp `[download]`/`[info]` ve ffmpeg uyarıları artık hem `writeJobLog` hem `sendJobEvent` ile log olarak iletiliyor (önce davranışıyla aynı, bir dereksiyon). Diğer 6 tüketici zaten önceden düşürüyordu — dokunulmadı.

### 8) src/renderer/status-copy.js — disk-dolu dosya-kaybı sanılıyordu (#202)
`err_disk_full` (Electron hata kodu) `err_file_not_found` kuralının içindeydi → "Dosyaya erişilemedi" mesajı. Artık ENOSPC/no-space-left/dis full kodlarıyla aynı "Diskte yer kalmadı" kuralına girdi.

## Belirsizler (needs_human)
- PR #209: otomatik-ordinal kaynak dili (`.tr.srt` dosya adından `auto`→ kaynak dili türetme) — davranış değişikliği, kullanıcı kararı ister.
- PR #217: devir-indeks "R234 05:12" kaydı — metin amaçlı kapsam notu.
- Test-altyapı flag'leri (bazıları test-beklentisi darlığı olarak işaretlendi) — PR thread'lerinde ayrı.

## Kırmızı kanıtı (master'da FAIL → dalda PASS)
- `backend/test_probe_refinement_r273.py`: 21-entry, [19,20] grubu 20 done → `llm_progress.failed` 21 (bug) → 20; `refined:false` isabeti + ölü sağlayıcı → refine isteği 0.
- `tests/r273-review-triage.test.js`: head/mid in-place mutasyonları sınır kaçırıyor (master'da 10 döndü, düzeltilmişte 9).

## Windows etkisi
- `errTail` yuvarlanan tamponu stderr olay sırasından bağımsız — Windows ffmpeg aynı metni aynı şekilde böler; düzeltme platform-nötr.
- Glif sayacı recovery kaydında — Windows'ta resume aynı davranışı alır.
- Disk-dolu kuralı kullanıcı-görünür metin — ENOSPC/`err_disk_full` her iki platformda da üretilir.

## Çalıştırılmayanlar
- UI smoke'ları (bu turda UI davranışı değişmedi; status-copy yalnız metin eşleme).
- Gerçek sağlayıcı testi — stub/deneme bütünüyle.
