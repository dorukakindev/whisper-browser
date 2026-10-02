# BROWSER_BUG_REPORT_388 — 50-kuyruk batch 5: kütüphane ve proje işleri

**Tarih:** 2026-10-02 · **Dal:** devin/1790919158-library-21-25 · **Başlangıç:** `7ff4a3f` · **Bitiş kod:** `83e70ae`

Kuyruk maddeleri 21–25 (kütüphane/proje işleri): artımlı klasör taraması, mükerrer kayıt birleştirme, devam edilecekler görünümü, toplu yol yeniden bağlama ve proje taşıma sihirbazının eksik-medya eşlemesi tamamlandı.

## Madde 21 — Artımlı klasör taraması: `missing` kaynaklar

folder-preview zaten dosya-adı tabanlı eşleme yapıyor (mtime/boyut probe'u yok — "değişmeyen dosyayı tekrar probe etme" doğal karşılanıyor). Eksik taraf: katalogda kayıtlı ama taranan kök altında artık bulunamayan kaynaklar görünmüyordu.

- `media-relink-matcher.js` → `collectMissingSources(items, root, exists)`: katalogdaki tüm `source.type === 'local'` kayıtlarını (ana kaynak + `episodes[].source`) taranan kök altında arar; var olmayanları `{title, path}` listesiyle döndürür (200 sınırı).
- `catalog-extensions.js` `folder-preview` sonucuna `missing` alanı eklendi; renderer `renderImport` "Katalogda kayıtlı, klasörde bulunamayan" uyarı bloğunu gösterir.

**Bulunan bug (düzeltildi):** `collectMissingSources` bölüm etiketini `S${ep.season} B${ep.number}` olarak biçimlendiriyordu; sezon/numarasız bölümlerde ekrana "Dizi Sundefined Bundefined" basıyordu → koşullu etiket (yalnızca alan tanımlıysa `S? B?`, ikisi de yoksa düz başlık).

## Madde 22 — Mükerrer kayıt birleştirme

- `findLibraryDuplicates(items)`: `file:` kayıtlarında normalize kök-ad (uzantısız, NFKC-katlı) gruplama; kümeleme kanıtı = **strong** (aynı ad + aynı sizeBytes>0) veya **weak** (aynı ad + süre ±%2 payı, ≥60 sn). Web kayıtları (`youtube:` vb.) asla gruplanmaz.
- `mergeWatchItems(source, target)`: `watch-library-store.mergeDuplicateItems` ile aynı sözleşme — (revision, lastWatched) otoritesiyle "yeni" üst gelir; position/duration/lastWatched max, firstWatched min, automaticCompleted OR, completionOverride hedef öncelikli; collections/subtitlePaths/legacyKeys birleşimi; prefs hedef-kazançlı merge; sessions id-dedupe (40 üst sınır) + `totalWatchSeconds` yeniden hesap; hedef key zorunlu (boş hedefe birleştirme hata verir).
- `watch-index.js` → `mergeMediaIds(sourceId, targetId)`: relink'teki `renameMediaId`'den farklı olarak hedef satırı EZMEZ — hedef yoksa kaynaktan kopyalar; tracks/annotations tablolarında çakışan satır kimliklerini kaynak yanından atar, kalanları hedefe taşır, kaynak medyayı siler. Transaction içinde; kaynak yoksa null.
- IPC: `library:dupes` (grupları 200'e sınırla döndürür), `library:dupes-merge` (JSON tarafında upsert+remove, index tarafında mergeMediaIds — hepsi index.transaction içinde; rollback `saveWatchLibrary(previous, {restoreRemoved:true})`).
- UI: Katalog "Kopyaları birleştir" — grup başına radyo seçimli "saklanacak kayıt" önizlemesi (kanıt: "Aynı ad ve dosya boyutu" / "Aynı ad ve yaklaşık süre"), sıralı birleştirme, satır sonrası grup kaldırma.

## Madde 23 — Devam edenler görünümü

Katalog nav'ına **Devam edenler** bölümü (EN: In progress — mevcut `Devam edenler` sözlük kaydı kullanıldı, yeni EN kopyası yaratılmadı). Tek ekranda üç kaynak:

- Yarım kalan izlemeler: `listWatchLibrary()` → `!completed && position>0`, lastWatched azalan; her kart süre yüzdesi + tarih + **Sürdür** eylemi (`authorizeWatchItem` → `openMediaCatalogPlayback` → katalog kapanır, mevcut oynatım yolu).
- Bitmemiş kuyruk işleri: `queue:load` → `status !== 'done'` (pending/running/error); `recovered` rozeti görünür.
- Kaydedilmemiş düzenlemeler: `browser-subtitle-drafts-v1` + `browser-source-edits-v1` localStorage sayımı.

Yeni IPC gerekmedi — üçü de var olan kanallar.

## Madde 24 — Toplu yol yeniden bağlama

- `planBulkRelink(items, {oldPrefix, newPrefix, exists})`: normalizeFsPath (`\`→`/`) ile sınır-duyarlı önek eşlemesi (`D:\Medya2` ⇏ `D:\Medya`); `candidate = newPrefix + suffix`. Durumlar: `alive` (eski hâlâ var — dokunulmaz), `ready` (eski yok, aday var), `missing` (aday da yok), `pending` (eski yok + henüz yeni kök girilmedi). UNC `\\NAS\Medya` → `//NAS/Medya` normalize edilir; dizi kaynakları bölüm bazlı işlenir.
- `relinkLibraryItem` tek-kaynak relink çekirdeği main.js'e çıkarıldı; `library:relink` ince sarmalayıcı oldu (aynı transaction semantiği: upsert+remove+renameMediaId, çakışmada rollback).
- `library:relink-bulk`: `preview` (500 satıra kadar plan + taranan sayı) ve `apply` (yalnız `ready` satırlar sırayla `relinkLibraryItem`; başarısızlar {key,error} listesiyle döner, `skipped` sayımı). `looksLikeAbsoluteDir` kök formatını sunucuda doğrular.
- UI: "Yolları yeniden bağla" — eski/yeni önek girişi, "Yeni kök seç" (catalog-extensions `choose-directory`), durum-rozetli önizleme tablosu (300 satır görünüm), apply sonrası başarı/başarısız özet.

## Madde 25 — Proje taşıma: eksik medya eşlemesi

- `workspace-package.js` → `missingLocalMedia(data, exists)`: paket içindeki `watch-library.json` (items[].localPath) ve `media-catalog.json` (items[].source + episodes[].source, type==='local') çözülür; var olmayan mutlak görünümlü yerel yollar üst-dizin köküne gruplanır → `[{root, count}]` azalan sırada (20 sınır). Bozuk/eksik dosyalar sessizce atlanır.
- `package-preview` sonucuna `missingMedia` eklendi; `package-apply` artık `input.mediaMappings` kabul eder: ≤20 [from,to] çifti, ≤4000 karakter, `to` var olan dizin olmalı — sunucuda doğrulanıp `data.videoMappings` ile birleştirilip `remapRendererValues` + `restorePackage` yoluna verilir.
- UI: preview'da eksik kökler liste + her biri için "Yeni kök seç"; seçilen eşleme `state.packageMappings` Map'inde birikir ve apply'a gider; yeniden preview/iptal sıfırlar.

## Testler

- `tests/library-maintenance-21-25.test.js` (yeni, 15 senaryo): planBulkRelink sınır/durum/UNC matrisi, looksLikeAbsoluteDir, findLibraryDuplicates strong/weak/kanıtsız, mergeWatchItems alan/oturum/prefs/throw, collectMissingSources, missingLocalMedia gruplama+bozuk dosya, mergeMediaIds gerçek-sqlite (hedef korunur + kimlik çakışması atılır + kaynak kopyalanır). **Sonuç: 15/15 geçti** — FTS5'siz Node derlemesinde sqlite bölümü atlanır (watch-index-assets konvansiyonu); Electron çalışma zamanında koşar.
- İlişkili suitler (hepsi geçti): media-relink-matcher, media-relink, media-catalog-service, media-catalog-store, workspace-privacy, workspace-restore-regressions, workspace-video-bounds, catalog-roadmap, package-parser-resilience, watch-library-migration (161), store-durability-matrix, data-integrity, dialog-locale, watch-index-assets, ui-locale, ui-locale-dedupe, ui-locale-userdata, ui-locale-dynamic, watch-experience-16-20, report-29-31-regressions, schema-migration-fixtures, atomic-write-kill, browser-dialog-occlusion, browser-report85/86-regressions, browser-library-anchor-race, browser-library-tools, browser-background-workspace, library-filters, watch-folder, watch-library{,-concurrency,-fuzz,-mutation,-performance,-subtitle-performance}, nmdb-catalog-import, ipc-parity, preload-sandbox, browser-preload-ratchet, preload-usage-ratchet, library-maintenance-21-25.
- `node --check` tüm değişen dosyalarda yeşil.
- Tur içinde 1 gerçek ürün bug'ı bulundu ve düzeltildi: `Sundefined Bundefined` bölüm etiketi.

## Windows / doğrulanamayan sınırlar

- UNC yolları ve `\\NAS\` önekleri planlama düzeyinde kilitli (test); gerçek Windows UNC erişimi Windows makinede denenmedi.
- `choose-directory` native Electron `dialog.showOpenDialog` çağırır — Windows'ta sürücü/UNC seçici davranışı doğrulanmadı.
- mergeMediaIds sqlite testi bu Node'da FTS5 olmadığından atlandı; Windows Electron'da FTS5 mevcut — orada koşar.
- media-catalog görsel akışı (Devam/Kopyaları/Yeniden bağla ekranları) Electron smoke ile yüzey doğrulandı önceki batch'lerde; bu turda ek görsel koşu yapılmadı.
