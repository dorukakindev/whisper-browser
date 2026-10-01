# BROWSER_BUG_REPORT_320 — Toplu düzenleme geçmişi: iki paralel yığının disk/bellek uyuşmazlığı

50'lik kuyruk · madde 8 — *"Toplu düzenleme işlemleri: Metin değiştirme, zaman kaydırma, bölme ve birleştirme için işlem geçmişi oluştur veya mevcut geçmişi genişlet. Birden fazla değişikliği birlikte geri alıp yeniden uygularken disk ve bellek tutarlı kalsın."*

## Mevcut uygulama envanteri (yeniden yapılmadı)

| Yüzey | Geçmiş | Kapsam |
|---|---|---|
| Bul/değiştir toplu yazım (`applySubtitleFindReplacement`) | `player.cueEditUndo` — `kind:'subtitle-bulk'` (dosya before/after + rollback + `subtitleBulkFileStateStillMatches`/`browserBulkStateStillMatches` bekçileri) | metin değiştirme, çok dosya |
| Tekil satır düzeltmesi (`saveCueEdit`) | `cueEditUndo` — tam-dosya before/after kopyası | metin değiştirme |
| Tarayıcı çeviri düzeltmesi | `cueEditUndo` — `kind:'browser-override'` | override kaydı |
| Hızlı düzenleyici (`saveBrowserQuickEditor`) | `cueEditUndo` — `kind:'subtitle-bulk'` + `reviewSources` | metin+zaman |
| Zamanlama paneli (bölme/birleştirme/kaydırma/sürükleme) | `player.timeline.undo/redo` — bellek-içi cue-dizisi snapshot'ı (30 kapasiteli), kirli bayrak yalnız "kopya kaydet" ile diske iner | bölme, birleştirme, zaman kaydırma |

Yani işlem geçmişi **zaten mevcuttu**; maddenin gerçek kusuru iki yığının kronolojik olarak birbirinden habersiz olmasıydı.

## Doğrulanan kusur — B-320-01: geçmişler arası sessiz veri kaybı

`player.cues`'u toptan değiştiren yollar, zamanlama panelinin bellek-içi durumunu (snapshot yığını + `dirty` bayrağı) gözetmiyordu:

1. `applySubtitleBulkMemory` (toplu bul/değiştir + hızlı düzenleyici + toplu geri-alma) dosyadan ayrıştırılmış yeni diziyi basıyordu → bekleyen zamanlama düzenlemeleri sessizce düşüyordu.
2. `applyCueEditHistoryCore` tekil-düzeltme geri alması `loadSubtitle` ile cue'ları diskten yeniliyordu → aynı kayıp.
3. `refreshBrowserEditedChannel` / `restoreBrowserTranslationSnapshot` / sekme geri yükleme aynı toptan değişimi eşzamansız yapıyordu → zamanlama yığını bayat kalıyordu; `dirty` bayrağı açıkken "kopya kaydet", dirilen durumu değişmiş tabanın üstüne yazıyordu.
4. Ters yön: zamanlama geri alması, arada yapılmış dosya düzenlemesini bellekten siliyor ama diskte bırakıyordu — bellek/disk uyuşmazlığı.
5. `saveCueEdit` SRT yolu `player.cuesRaw`'dan (zamanlama paneli `timelineMarkDirty` tarafından güncellenen) tam-dosya payload üretiyordu → "tek satır düzeltmesi" görünümüyle **tüm kaydedilmemiş zamanlama değişiklikleri dosyaya sessizce yazılabiliyordu**.

## Düzeltme

İki geçmiş artık tutarlı bir sözleşmeye bağlandı — dosya-yazan işlemler kirli paneli **reddeder**, toptan değişimler bekleyen geçmişi **görünür biçimde** sıfırlar:

- `timelineEditsPending()` — undo/redo yığını veya `dirty` bayrağı varsa doğru.
- `invalidateTimelineEdits(msg)` — yalnız kirliyken yığınları temizler, düğmeleri kapatır, duruma açıklama yazar; temizken sessiz no-op.
- `timelineBlocksFileWrites()` — kirli panelde dosya işlemini kullanıcıya yol gösteren uyarıyla reddeder.
- Engel noktaları: `applyCueEditHistoryCore`, `applySubtitleFindReplacement`, `saveCueEdit`, `saveBrowserQuickEditor`.
- Geçersizleştirme noktaları: `applySubtitleBulkMemory` (birincil kanal), `refreshBrowserEditedChannel` (birincil iz), `restoreBrowserTranslationSnapshot`, `loadSubtitle` (birincil), sekme geri yükleme.
- Adillik: zamanlama geri alması ilk snapshot'a ulaşınca bellek dosyayla aynıdır — `dirty` kaldırılır, panel "temiz" sayılır, dosya işlemleri tekrar serbest kalır (eskiden yığın boşalsa bile kirli kalıyordu).

## Test kanıtı

`tests/subtitle-edit-history.test.js` — 9/9 (vm-kesit davranış + statik kilit):
`node tests/subtitle-edit-history.test.js` → 9 geçti, 0 düştü.
İlişkili regresyonlar: `browser-bulk-edit-locks` 16/16, `browser-subtitle-sync-renderer` geçti, `player-ui` 153/153, `audit-tur5` geçti.
`node --check src/renderer/renderer.js` temiz.

## Kapsam dışı / not edilen sınırlar

- Zamanlama paneli tasarım gereği bellek-içi çalışır; "kopya kaydet" ayrı dosyaya yazar — bu akış korundu, dosyaya doğrudan yazma eklenmedi.
- Engel mesajı yalnız dosya-yazan işlemlerde görünür; salt-okuma arama özgür kalır.
- Windows etkisi: değişiklik renderer mantığıyla sınırlı, platformdan bağımsız; Windows'ta elle doğrulanmadı.
