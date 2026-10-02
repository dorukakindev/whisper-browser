# BROWSER_BUG_REPORT_386 — 50-kuyruk batch 3: çeviri inceleme yüzeyi (madde 11–15)

Tarih: 2026-10-02 · Dal: `devin/1790915904-b3-translation-review` · Taban: `a6ec665`

## Kapsam

Çeviri inceleme grubu beş maddesi uçtan uca tamamlandı:

| # | Madde | Sonuç |
|---|-------|-------|
| 11 | Seçili satır/sahne yeniden çevirme | **Yeni akış** — zaman çizelgesinde Shift+tık ile aralık, "Seçili aralığı yeniden çevir" düğmesi, aralık-dışı koruma + fark inceleme |
| 12 | Proje sözlüğü | **Tamamlandı** — Genel/Bu-medya kapsam sekmeleri, içe aktarma, genel↔proje çakışma rozetleri, proje-önce öncelik |
| 13 | Kör kalite karşılaştırması | **Yeni akış** — aynı aralık iki modelle `.tr.ab-a`/`.tr.ab-b` varyantlarına üretilir, sağlayıcı gizli, 3 eksende puan + kazananı uygula |
| 14 | Maliyet/süre görünümü | **Tamamlandı** — istek/önbellek/karakter sayaçları backend'den gelir, kullanıcı fiyatlarıyla ~$ tahmini, başarı metnine eklenir |
| 15 | Kalite uyarı açıklaması | **Tamamlandı** — 12 tür × neden + kaynak/sonuç satırları + "Bu satırları yeniden çevir" eylemi tek inceleme alanında |

## Madde 11 — aralıklı yeniden çeviri (kod yolu)

- Timeline'da `Shift+tık` `player.timeline.range = {anchor,a,b}` üretir; bandı çizimde amber gösterir, `timelineRangeChip` çipi `${count} blok aralıkta · lo–hi` gösterir, `timelineRangeClear` temizler.
- `startRangeRetranslate(rangeSeconds)` → eski çeviri anlık görüntüsü (`state.retranslateSnapshot`) + `state.translateCueRange = 'lo.hi:hi.hi'` → `makeTransBtn` akışına girer; `opts.translateCueRange` + `opts.translateExisting` (kanal dosyası) main.js'e gider.
- main.js: `/^\d+(\.\d+)?:\d+(\.\d+)?$/` doğrulaması → `--translate-cue-range BASLANGIC:BITIS`.
- transcribe.py: aralıkla kesişmeyen indeksler `precompleted` olur — mevcut çeviri varsa o, yoksa kaynak metin; aralık içi satırlar yeniden üretilir. Çıktı dosyası tam kalır, elle düzeltmeler ezilmez.
- `done` → `result.loaded` + `snapshot.mediaKey` eşleşirse `openRetranslationReview(snapshot.cues)` fark listesini açar (değişmeyen satır gösterilmez).
- Ana ekran temizliği: `translateCueRange`/`translateModelOverride`/`translateVariantLabel` iş başlatma, `optsProblem` ve `startTranscribeSafe` hata yollarında sıfırlanır.

## Madde 13 — A/B varyant izolasyonu

- `runAbVariant(model, range, label)` `state.abCollect = {resolve}` kurar; varyant işi `--translate-variant-label ab-a|ab-b` ile `film.tr.ab-a.srt`/`film.tr.ab-b.srt` yazarak yüklü çevirinin üzerine yazmaz.
- `done` kolunda `abCollect` `{cues, file}` çözer: `cues` kaynak-girdi diziniyle anahtarlı sözlük (`liveTranslation` Map'ten) — yalnız aralık içi satır taşıdığı için sıralı dizin kayması olmaz; `file` sonradan okunup uygulanacak dosya.
- Açılan `openAbReview` `Math.random()<0.5` ile sütunları karıştırır; satır başına Kaynak + Çeviri 1 + Çeviri 2; üç eksen (anlam doğruluğu/doğallık/tutarlılık) `Eşit/1/2` puanlarıyla toplanır, `votes<0` sütun-1 kazanır. Model adları 'Modelleri göster' ile açılır; karar localStorage `whisper-ab-compare-log`'a yazılır (son 50 kayıt).
- Kazanan uygulama: varyant dosyası `readSubtitle` ile okunur, `writeSubtitle(channel.path, variant.text, null, subtitleStatFor)` + `noteSubtitleStat` + `loadSubtitle(..., silent, role:'translation')` — bayt-sadık, geri alma yoluyla aynı sözleşme.
- Açma koşulları: düğme yalnız aralık varken ve kuyruk boşta değilken aktif; iki model farklı olmalı.

## Madde 14 — maliyet görünümü

- transcribe.py `translation_metrics`'e `prompt_chars`/`completion_chars` eklendi; `task_once` ve `refine_task` kilit altında artırır. `translation_quality` olayı `cache_hits = cached + precompleted + unchanged` toplamını taşır.
- Renderer `lastTranslateStats` saklar; `renderTranslateCost()` `translateCostLine` ipucuna `Son iş: N istek · M önbellek · Xk karakter · ~$ · Y sn` yazar. `~$` kullanıcı fiyatı `$/1M token` × `karakter/4` yaklaşık token'dan hesaplanır.
- `translatePriceIn`/`translatePriceOut` kalıcı kontrollerdir; başarı metnine aynı özet `translateStatsSuffix` ile eklenir.

## Madde 15 — kalite uyarı paneli

- `QUALITY_ISSUE_KINDS` 12 tür: çevrilmemiş, boş, sayı/olumsuzluk/kip/para/birim/tarih/zamanlama uyuşmazlığı, kesik parça, anlam şüphesi (kesin retler bu kümenin içindedir — ayrı satır yok çünkü indeksler üst-küme).
- `qualityIssueGroups()` → `reviewItems()` satırı `Çeviri uyarısı: N <tür>`; tıklanınca `openQualityIssueDetail` dialog'u: başlık + neden + ne-yapılır, satır listesi (Kaynak/Çeviri, 40 satırda kırpılır `+N satır daha`), "Bu satırları yeniden çevir" eylemi `startRangeRetranslate`'e bağlanır.

## Düzeltmeler (tur içinde yakalanan kusurlar)

1. `abCollect` askı riski — varyant işi `done`'a ulaşmadan `error`/iptal/`exit`/doğrulama-hatası/başlatma-hatası yolları promise'i sonsuza bekletirdi; beş yolun tamamında `resolve(null)` eklendi.
2. `runAbVariant` başlatma kapısı — düğme kapalı/çalışırken state kirlenmeden `null` çözer.
3. `abCompareLog` bozuk-JSON'da kalıcı sükût — ayrı try'la `[]` sıfırlanır.
4. Bayat `retranslateSnapshot` — A/B varyantı review dalını atlar; anlık görüntü collect kolunda sıfırlanır.
5. `liveTranslation` dizin kayması — varyant inceleme satırları artık kaynak-girdi indeksli sözlükten okur (önceki dizi modeli aralık-dışı boşlukları yanlış eşlerdi).
6. `Kazanan uygulanamadı: dosya okunamadı/yazma hatası` son eki `uiText`'e alındı; `${elapsed} sn` locale pattern'i eklendi.
7. `translation_meaning_hard_rejected` türü kaldırıldı — rapor sayı taşır dizi değil, indeksler zaten `shadow_rejected_indices` kümesinde (çift satır önlendi).

## Testler

- `tests/translation-review-surface.test.js` — yeni, 15 kontrol: sözlük önceliği/dedupe/kapsam, kalite gruplama, aralık kelepçe/tolerans, maliyet tahmini/istatistik metni, A/B günlük + varyant bekçileri. `node tests/translation-review-surface.test.js` → 15/15.
- `tests/translation-review-tools.test.js` — anlık-görüntü ratchet'i aralık koşuluna genişletildi; 8/8.
- `node --check` renderer.js/ui-locale.js/main.js temiz; `python -m py_compile` temiz.
- Electron smoke `--all` (`xvfb-run -a node tests/run-electron-smokes.js --all`): **61/61 geçti** — iptal/medya-değişimi karışma sözleşmesi, ui-locale (EN'de kalan TR: []), narrow-TR taşma, tema kontrastı dahil.

## Windows etkisi / doğrulanmayanlar

- Arayüz katmanı platform-bağımsız; backend argüman yolu `--translate-cue-range BASLANGIC:BITIS` Windows `spawn` satırında aynen gider (`:` yoklama regex'i platformdan bağımsız). Varyant dosya adları `film.tr.ab-a.srt` — Windows'un ayrılmış kökleriyle çakışmaz.
- `ab-a`/`ab-b` varyant dosyaları diskte kalır; kullanıcı isterse elle siler — otomatik temizleme yapılmadı (iz kaydı amaçlı).
- A/B incelemesi ve aralık seçimi Electron smoke kapsamında; gerçek Windows'la uçtan uca deney kullanıcıda.
