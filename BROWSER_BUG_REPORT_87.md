# BROWSER_BUG_REPORT_87 — R85 envanteri kuyruk doğrulaması + bu turun düzeltmeleri (2026-09-19)

Amaç: R85'in 126 satırlık kanonik tablosunda açık kalan `K/B/M` satırlarını güncel kodda
tek tek yeniden doğrulamak; gerçek olanları düzeltmek, düzeltilmiş / tasarlanmış /
yanlış pozitif olanları kanıtla kapatmak. Bu rapor düzeltme commit'idir — aynı
dalga içinde yapılan kod değişiklikleri aşağıda satır satır işaretlidir.

## Bu turda düzeltilenler

| ID | Bulgu | Düzeltme | Kanıt |
|----|-------|----------|-------|
| B83-13/16 | Dinamik sayfa çevirisinde eski blok kimlikleri `session.blocks`/translations/failures'ta birikiyor; rescan ile handler pending yarışı | `pruneReplacedBrowserPageBlocks()` eklendi; `acceptDynamicBrowserPageBlocks` ve exclusions rescan eski kimlikleri siliyor | `main.js` ~5981; repro: aynı index+değişen metin → eski id kümeden düşüyor |
| B83-14 | `browser-page-translate.js` restore yolu `ref.originals[index]` okurken mutasyon `state.originalValues`'ı güncelliyordu — geri yükleme güncel site metnini eski orijinalle eziyordu | `latestOriginal` yardımcısı; 4 restore sitesi önce `state.originalValues` dener | node repro: mutasyon sonrası restore yeni metni korur |
| B83-18 | `library:annotations:toggle` unsave'de eşleşen kayıt yoksa sahte başarı + silinmeyen not | `store.remove` dönüşü denetlenir; kayıt yoksa `missing:true` döner | missing:true kolu test edildi |
| B83-21/22 | `browser:page:exclusions` ve çeviri başlatma await'lerinde bayatlık kontrolü yok — ölü oturum yeni sayfaya çeviri basabilir | `exclusionStale()` kapanışı her await sonrası çalışır; start yolu kuşak denetimi taşıyor | kaynak satır denetimi |
| B83-23 | `loadRetryTimer` kullanıcı gezinmesini `reload()` ile eziyordu | `retryGeneration` yakalanır; `did-start-navigation` zamanlayıcıyı temizler | kuşak+URL denetimi testlerle |
| B83-24 | ui-locale observer sekme/yer imi/indirme başlıklarını "çeviriyordu" — sözlükte çakışan site başlığı UI metni sanılıp yazılabiliyordu | `ignored` seçicisine `#browserTabStrip,#browserAddressResults,#browserAddressSuggestions,.browser-place-title,.browser-quick-place-title,.history-title` eklendi | selector sütunu |
| B83-25 | `normalizeTimelineText('GİDİYORUM')` Unicode birleşen noktayı harfe katıyordu → 'gi di yorum'; CEA kalibrasyonu ölüyordu | NFD ayrıştırma + birleşen işaret ayıklama | `'GİDİYORUM' → 'gidiyorum'` probe |
| B83-26 | Sponsor "Atla" bölüm bitince kalıyor; tıklama `segment.end`'e geri sarıyor | segment döngüsü `time >= item.end` iken `pendingAction=null` | renderer probe |
| B83-27 | `sweepOrphans` yalnız index referanslarını sayıyor; workspace/session `trackRefs`'leri bağlı varlık siliniyordu | sweep+prune ortak koruma kümesi (R86-02 ile birlikte) | 181 günlük referanslı varlık korunur testi |
| B83-28 | `tab.loading` ataması hiç yapılmıyor → yavaş navigasyondaki arka sekme eski URL ile geri açılıyordu | `browser-tab-resources` içinde `tab.loading` kontrolü 'navigation' nedeni olarak korunur; sekme snapshot committed URL alır | kaynak doğrulaması |
| B83-30 | `lifecycle='restoring'` yazılıp `restore_failed` hiç atanmıyordu → sekme durumu takılı kalıyordu | `resumeRestoredBrowserPage` erken dönüşlerde ve catch'te `restore_failed` atar | satır denetimi |
| B83-31 | Scheduler `onResult` throw'u ikinci kez atılıyordu | `emitResult` onResult'ı try/catch içinde çağırır | satır denetimi |
| B83-35 / R78-07 | Site verisi silme `cache`/`backgroundFetch`/`clearAuthCache` kapsamıyor | **Karar düzeltildi:** site-bazlı `clearData`'da `cache`/`backgroundFetch` Electron'da origin filtresi uygulamaz — tüm profili silerdi. Mevcut davranış doğru; tam temizlik `session reset` yoluna aittir. Kod yorumuyla belgelendi | `browser-session-privacy.test.js` 'site temizliği HTTP cache ve indirmelere dokunmaz' yeşil |
| B83-36/37 | JS/Python mojibake marker listeleri farklı; `Återställ` gibi gerçek aksanlı metin "onarım"la bozuluyordu | Marker listesi Python paritesine çekildi + `U+FFFD` ve azalan-marker guard'ları | `'Återställ'` korunur, `'Åžimdi'→'Şimdi'` düzelir probe |
| B83-39 | `.browser-page-preview-panel{display:grid}` `[hidden]`'ı eziyor — gizle eylemi kutuyu bırakıyordu | `styles.css:4872` `[hidden]` görünürlüğe dönüş kuralı eklendi (önceki tur) | `panel[hidden]{display:none}` satırı mevcut |
| R86-01–05 | (R86 görev kapsamı) | Tamamı düzeltildi — ayrı rapor bölümünde | `tests/browser-report86-regressions.test.js` 44/44 |
| B80-02 | `probeCommand` stderr'i hiç tüketmiyordu → dolan boru çocuğu kilitliyor; çıktı da sınırsız | `p.stderr.resume()` + 256KB çıkış tavanı | modül testi |
| F4 | `browser-subtitle-search.js` Türkçe I/İ/ı katlaması eksik | `normalized()` katlıyor | probe |
| F8 | Boş `Location` başlığı aynı URL'ye çözülüyordu | boş Location → `INVALID_RESPONSE` | probe |
| D2 | `browser-fonts.js` statSync try dışında — ENOENT ham yol sızdırıyordu | try sarması + basename'li mesaj | hata mesajı probe |
| S2 | Aynı `cueId`+aynı metin kaymış zamanla yeniden gelince ikiz satır kalıyordu | merge'de kimlik+metin anahtarlı revizyon dedupe — son gelen kazanır | sentetik merge probe: `x@10.7` kazanır, farklı metin korunur |
| N1 | `feed_partial` sonrası full render `previewRequestId`'yi işaretlemiyordu → bayat partial sonuç full grid'i eziyordu | full section render sonrası `grid.dataset.previewRequestId = String(seq)` | satır denetimi |
| N2 | `stCloseBrowser` medya yokken ölü düğme | tıklama koşulsuz kapatır + düğmeyi gizler | satır denetimi |
| N4 | `youtube:cancel` sürecin close'unu beklemeden dönüyordu → hemen yeni akış "zaten çalışıyor" yiyordu | `close` olayını 3 sn tavanla bekler | satır denetimi + close-guard sözleşmesi (`mediaJobs[kind] === proc`) |
| PF1 | `storeBrowserTrack` her batch'te 20k cue'luk `cueFingerprint` (~45 ms) → ana iş parçacığı jankı | `cueFingerprint` hızlı yolu: işaretleyici karakter yoksa `cleanCueText` atlanır + ucuz serileştirme | **45 ms → 8.4 ms** (20k cue, bu VM); tüm eşitlik/farklılık invariantları korunur |
| PF2b | `applyEditRecord` her kayıtta `createEditRecord`'ı iki kez çalıştırıyor | `recordFieldsMatch` ayrıştırıldı; tek normalize | sync test paketi geçti |
| P79-04 | `semantic_search` her sorguda yeni Python süreci + SentenceTransformer yüklüyor (~6 sn/sorgu) | `browser_media_tools.py serve` NDJSON modu + JS tarafında kalıcı işçi (`pythonServe`): model bir kez yüklenir | **6000 ms → 11-15 ms** sonraki sorgular; hata/iptal/respawn/çıkış yolları ampirik test edildi |
| N3 (cache) | `.corrupt-*` arşivleri sınırsız birikiyordu | `archiveCorrupt` sonrası en yeni 5 korunur | test: `browser-translation-cache.test.js` 6 senaryo |
| D81-01 | `'Çalışıyor'/'Tamamlandı'/'İptal edildi'` EN modda TR kalıyor | ui-locale sözlüğüne 7 satır eklendi | sözlük girdisi |

## Bu turda yeniden doğrulanan eski düzeltmeler (kanıt: kaynak + test)

- **B82-01**: Invidious şifresi argv'den env'ye taşınmış — `login` args'ı artık `--password` taşımıyor (`WHISPER_INVIDIOUS_PASSWORD`).
- **B80-01**: `createBackupPayload` → `redactForBackup` sır DEĞERLERİNİ gömülü oldukları dizgelerden (URL dahil) ayıklar — mekanizma tam.
- **P79-01/02/03**: `_SDH_NORMALIZED` modül sabiti; `quick_ratio` üst-sınır filtresi; `fitTranslationParts` önden hesaplama — hepsi yerinde.
- **SL2**: `browser-preload.js` artık gerçekten ölçemediği alanlara `null` döndürüyor (sabit-0 yalanı yok).
- **B83-05** (AudioContext kapanışı), **B83-10** (recorder normalize), **B83-20** (userinfo strip), **B83-28**, **B83-29**, **B83-31** — kaynakta doğrulandı.

## Belgeli kararlar (bug değil / sınır olarak kabul)

| ID | Karar | Gerekçe |
|----|-------|---------|
| A3 | Tasarlanmış | `setPermissionCheckHandler` senkron — 'ask' kararı prompt açamaz, `false` dönmek doğru; gerçek istek `setPermissionRequestHandler` üzerinden UI'a düşer |
| R78-08a | Temiz | `whisper-dialogue-` temp klasörü finally'de prefix assert'iyle korunuyor |
| R78-08b | Tasarlanmış | CORS'suz cross-origin medyada AudioContext kasıtlı kapatılır (sessiz ses yerine grafik kurulmaz) |
| D3 | Erişilemez yol | `browser-mini-player` factory'si üretimde tek kez kurulur; ikinci handle kuran akış gösterilemedi |
| N3 (login flash) | Kozmetik-acceptable | `openYoutubeLogin` istemci çözülmeden önce 'kontrol ediliyor…' durum metniyle device görünümünü gösterir — yanlış kontrol flash'ı değil, yükleme durumu |
| D81-05 | Repro yok | 63 localStorage erişiminin dış try/catch'leri gerçek Quota/SecurityError'ı gösteren senaryo üretmedi; hijyen adayı |
| SL1/SL3/SL4/SL5 | Bakım borcu | Kaynak kopyaları/ölü girişler kullanıcıya ulaşan davranış sapması üretmedi |
| PF1b | Plato korunur | 600 batch dolu-buffer merge → heap +0.0 MB; buffer `slice(-20000)` ile sınırlı |
| PF1c | Sınırda | `cuesToSrt` 20k cue'da 88 ms + asset yazımı — finalize'da tek seferlik, kabul edilebilir |
| PF2 | Sınırda | Şema-maksimum oturum (24 sekme × 2000 edit = 1.27 MB) `writeBrowserSessionAtomic` 312 ms; ancak `scheduleBrowserSessionSave` ≥10 sn'e kademeli → gerçek etki seyrek. İleride normalize memoization adayı |
| T2 | Smoke tanısı | Çıkış tanısı child-hata enjeksiyonu yapılmadı — açık sınır |
| B83-34 | Tasarlanmış | Silme/sıfırlama yollarında `.bak` aynası artık güncel duruma çekilir (R86-03 düzeltmesi) — "tam temizlik" vaadi özel-mod ayrımı; belgeli |

## Yanlış pozitif / geçersiz repro notları

- **B83-37 repro**: `ÅŞimdi eve git.` kendi başına geçerli metin — bozuk bayt kanıtı değildi; gerçek kusur (marker listesi farkı + U+FFFD guard eksikliği) bu tur düzeltildi. Verilen repro doğru, yorum yanlıştı.
- **PROGRAM 81 "8/8 doğru"**: P79-02'nin "her zaman 241" iddiası invariant değil (240 aday → 240 ratio ölçüldü); mekanik "262 metin" sayısı DOM görünürlük kanıtı değil.

## Çalıştırılamayanlar / ortam sınırları

- `node:sqlite` fts5 eksik (Node rebuild gerektirir) — belgeli ortam sınırı.
- Windows `backend\venv\Scripts\python.exe` yolu Linux VM'de yok — Python doğrulaması `/usr/bin/python3` ile yapıldı.
- Electron smoke kararsızlığı: A3 acceptance child'ına `--no-sandbox --no-zygote --disable-gpu` eklendi (zygote SIGTRAP kök nedeni); üç ardışık `--all` turu 20/20.
- N4 fix sözleşme düzeyinde doğrulandı; uçtan uca YouTube device flow gerçek Google istemcisi gerektirdiği için canlı koşulmadı.
