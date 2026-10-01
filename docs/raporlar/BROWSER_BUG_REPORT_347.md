# BROWSER_BUG_REPORT_347 — Kuyruk-50 madde 35: Veri bütünlüğü denetimi

Tarih: 2026-10-01 · Dal: `devin/1790888227-data-integrity` · Kod: `c23b99b` → `6b061ef`

## Görev

"Kırık ilişkiler, mükerrer kimlikler ve bozuk kayıtları tarayan yerel araç
geliştir. Onarım önizlemesi sun; kullanıcının onayladığı değişiklikleri yedekli
uygula."

## Mevcut durum (doğrulama)

Böyle bir araç yoktu: depo dosyaları (watch-library, media-catalog,
browser-session, browser-notes, history) yüklenirken kendi normalleştiricileri
bozuk kayıtları sessizce atlar veya karantinaya alır — kullanıcı bunu
göremezdi ve onarım için tek yol `.bak`'ı elle kopyalamaktı. Yeni araç
`src/data-integrity.js` üç ailede tarama yapar:

- **Bozuk dosya** (`corrupt-file`): denetlenen 6 JSON deposundan parse
  edilemeyenler; sağlam `.bak` varsa `restore-backup` onarımı önerilir.
- **Mükerrer kimlik** (`duplicate`): izleme kütüphanesi öğe + mezar taşı
  (kanonik anahtar), katalog `id`, oturum sekme `id`. Onarım `dedupe` —
  en yeni zaman damgalı kayıt kalır, zarf/ekstra alanlar korunur.
- **Kırık ilişki** (`broken-relation`): kayıtlı `subtitlePaths` girdileri
  yolda olmayanlar (`prune-paths` onarımı — yalnız kırık yol temizlenir);
  yolda olmayan yerel medya kaynağı (rapor — dosya geri gelebilir, kayıt
  silinmez); kütüphane/katalogda karşılığı kalmayan notlar (`orphan-notes`,
  info — notlar değerli, silme önerilmez).

## Uygulama

- `auditUserData(root, {io})` → yalnız okur, `{issues:[{id,kind,severity,
  store,detail,repair}]}` döner.
- `applyRepairs(root, ids, {io})` → güncel taramayı yeniden yapar, seçili
  id'ler hâlâ geçerliyse onarır; eskiyen/seçilmeyen id'ler `skipped`. Her
  onarımdan önce dosya `<ad>.integrity.bak`'a kopyalanır; yazımlar
  tmp→fsync→rename atomikliğiyle.
- IPC: `integrity:scan` + `integrity:repair` (`authorizedBrowserSender`
  bekçisi; id listesi 500 ile sınırlı).
- UI: Ayarlar → "Çalışma ortamı ve bakım" içine "Veri bütünlüğünü denetle"
  düğmesi; bulgular severity renklendirmeli listede, onarılabilir olanlar
  işaretli önizleme kutusu olarak gelir, "Seçilenleri yedekleyip onar"
  uygular ve taramayı yeniler. EN/TR çift dilli.

## Kanıt

`tests/data-integrity.test.js` — 10/10 PASS: temiz dizin, bozuk+bak,
bozuk+bozuk-bak, kanonik mükerrer (file: yol büyük/küçük harf + ters bölü),
katalog/oturum dedupe, yol-prune, rapor-only medya, yetim not, seçimlilik
ve eskiyen-id, onarım sonrası temiz tarama. İlgili suitler:
i18n-coverage, ui-locale (14), dedupe (5), dynamic (73+72), userdata (10),
ipc-parity (220 handle), ipc-payload-fuzz (217 kanal/9400 çağrı),
adversarial-ipc (17), coverage-map — hepsi yeşil.

Bu turda ayrıca master'daki iki gizli EN boşluğu kapatıldı ("Yalnızca yerel
medya kayıtları için öneri üretilir.", "Tüm zamanlama düzenlemeleri geri
alındı").

## Windows etkisi

Yok — yeni modül `fs`/`path` kullanır, `start.bat` akışına dokunmaz.
`.integrity.bak` dosya adı Windows-güvenli karakterler içerir.
