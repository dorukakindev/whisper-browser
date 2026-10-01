# BROWSER_BUG_REPORT_346 — Kuyruk-50 madde 34: Veri şeması geçişleri

Tarih: 2026-10-01 · Dal: `devin/1790887898-schema-migration` · Kod: `443dcdf` → `a987013`

## Madde

> "Veri şeması geçişleri: Eski katalog ve oturum şemalarından güncele geçişi gerçekçi fixture'larla sınayıp geliştirilmesi gereken kısmı tamamla. Başarısız geçişte eski veri okunabilir kalsın ve geri dönüş mümkün olsun."

## Bulunan kusur (düzeltildi)

**`watch-library-store.js` `loadDocument`**: birincil dosya bozukken `.bak` yedeğine düşülüyor; ancak `.bak` parse'ı try/catch DIŞINDAYDI. Birincil+yedek ikisi de bozuksa tasarlanan "İzleme kütüphanesi ve yedeği okunamadı; dosyalar korunuyor" hatası yerine ham `SyntaxError: Unexpected token ...` sızıyordu — kullanıcıya anlaşılmaz teknik hata + koruma iletisi kayboluyordu. Ayrıca `.bak` bozuk ama birincil YOKSA da aynı sızıntı vardı.

**Düzeltme:** `.bak` parse'ı sarmalandı; `!parsed && (birincil var || .bak var)` durumunda tasarlanan koruma hatası fırlatılır. Yalnız iki dosya da gerçekten yoksa boş kütüphane yüklenir (önceki davranış korundu). Dosyalar her durumda diskte değişmeden kalır.

## Fixture matrisi (yeni test dosyası, 14 test)

`tests/schema-migration-fixtures.test.js` — gerçekçi eski-şema dosyalarıyla uçtan uca geçiş:

- **browser-session.json v1 → v8**: `recoveryJobs`/`subtitleSyncRecords`/`mangaPosition`/`compatibilityMode`/`keepAwake`/`lifecycle`/`group`/`splitRatio`/`cleanExit` öncesi şekil; sekmeler + varsayılanlar; v4 ara sürüm.
- **watch-library.json ham dizi/zarf/gömülü/sidecar → schemaVersion 3**: ham dizi (en eski), `schemaVersion:1` zarf (overflow+mezar+bozuk kayıt → `migrationQuarantine`), `backupVersion:2` gömülü, sidecar mezar taşı bir kez içe aktarım.
- **media-catalog.json minimal kayıtlar**: `kind`+`title` dışı hiçbir alan yok → varsayılanlar tamamlanır; geçersiz kayıt → koruma hatası + dosya değişmez.
- **Geri dönüş (3 depo)**: geçiş/yazım sonrası önceki ham dosya `.bak`'ta kalır, eski şema okunabilir.
- **Başarısız geçiş (3 senaryo)**: her iki dosya bozuksa koruma hatası + dosyalar olduğu gibi durur; bozuk birincil + sağlam yedek → yedekten yüklenir, birincil silinmez.

## Test kanıtı

- `node tests/schema-migration-fixtures.test.js` → 14/14 PASS
- Dokunulan depoya ait suitler: watch-library-migration (161), -fuzz (6000), -concurrency (12), -mutation, -performance (9), -subtitle-performance (8), watch-library (8), catalog-roadmap, media-catalog-store, browser-session-corrupt (426), browser-foundation (24), workspace-restore, browser-report86 (44), audit-tur5-main, audit-followup — hepsi yeşil.

## Windows etkisi

Yok — hata metni ve parse sarmalı; dosya düzeni değişmedi.

## Kalan

- `settings.json` bozuk-deserialize ayrı depoda (`settings-security`) korunuyor; bu madde kapsamı katalog/oturum/kütüphane ile sınırlı tutuldu.
