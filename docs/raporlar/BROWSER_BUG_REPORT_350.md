# BROWSER_BUG_REPORT_350 — Kuyruk-50 madde 38: PDF görev planlayıcısı

**Tarih:** 2026-10-01 · **Dal:** devin/…-kuyruk50-38-pdf-scheduler
**Kapsam:** `src/main.js` (`pdf:translatePages`, `translatePdfPage`), `src/pdf-translate.js`
(`recordPdfPageTranslation`, `normalizePdfTranslationState`, `createPdfTranslationState`),
`src/renderer/renderer.js` (`translateVisiblePdfPagesNow`), `tests/pdf-partial-retry.test.js`,
`tests/pdf-job-scheduler.test.js` (yeni)

## İstenen davranış (madde 38)

> Sayfaları sınırlı paralellikle işle; sonuçları belge sırasına yerleştir. Cache,
> iptal ve checkpoint'i birlikte sınayıp yüzlerce sayfada bellek kullanımını
> sınırlı tut.

## Mevcut durum denetimi

| Gereksinim | Önceki durum | Yer |
|---|---|---|
| Sınırlı paralellik | Renderer 3'lü paket gönderiyordu ama ana süreç paket içinde **seri** çeviriyordu | `pdf:translatePages` `for (const page of pages)` |
| Belge sırası | `result.state.pages[page]` → `renderPdfTranslation` sayfa-başına, `insertBefore` sıralı | renderer.js ~22390-22440 |
| Cache | `pendingPdfPages` tamamlanan sayfayı atlıyor | pdf-translate.js |
| İptal | `reader.cancelRequested` + `pdf:cancel` → abort + `cancelAll` | renderer/main |
| Checkpoint | `recordPdfPageTranslation` + `writePdfTranslationState` sayfa başına | main.js ~7393 |
| Bellek | Çizilmemiş sayfa kaydı paket sonunda `reader.pages.delete` | renderer.js ~22420 |

## Bulunan kusurlar

### B-350-01 — `recordPdfPageTranslation` her sayfada tüm durumu yeniden normalize ediyor (O(n²))

`recordPdfPageTranslation` her çağrıda `normalizePdfTranslationState`'i koşturuyordu:
yazılan yeni sayfanın yanında **önceki tüm sayfaların blokları** da yeniden
`normalizePdfBlock`'tan geçiyordu. 300 sayfa × 15 blok ≈ 4.500 blok × 300 kayıt
≈ 1,35M normalize çağrısı.

**Ölçü (before→after):** 300 sayfa kaydı **362ms → 5ms** (~70x); 1000 sayfa ~9ms.

**Çözüm:** `createPdfTranslationState`/`normalizePdfTranslationState` çıktılarına
non-enumerable `Symbol` işareti (`PDF_STATE_NORMALIZED`) — JSON.stringify ve
spread kopyasına taşınmıyor, dosya şeması değişmedi. `recordPdfPageTranslation`
işaretli durumda sığ kopya (`{...state, pages: {...state.pages}}`) alıyor:
girdi-nesnesini-değiştirmeme sözleşmesi korunuyor (pdf-translate.test.js'in
var olan invariant'ı yakaladı ve düzeltme orada doğrulandı). İşaretsiz durum
(disk'ten JSON.parse, elle kurulmuş nesne) eskisi gibi tam normalize edilir.

### B-350-02 — Paket içi sayfa çevirisi tamamen seri (sınırlı paralellik yok)

`pdf:translatePages` `for (const page of pages)` ile sayfaları tek tek
çeviriyordu. Madde "sınırlı paralellik" istiyor.

**Çözüm:** `translatePdfPage`'in blok-hesaplama bölümü `translatePdfPageBlocks`
olarak ayrıldı (scheduler, bağlam, abort dinleyicisi — dokunulmadı). İşleyici
içinde ≤2'li işçi havuzu: imleç üzerinden sayfa alan işçiler blokları hesaplar,
`recordPdfPageTranslation` + `writePdfTranslationState` tamamlanma sırasıyla
aynı işçi bağlamında çalışır — iki işçi aynı `state` nesnesine yazmaz çünkü
kayıt+write arasında `await` yok. `firstError` ilk gerçek hatayı saklar, diğer
işçiyi durdurur; iptal `job.controller.signal` üzerinden her sayfanın
`cancelAll`'ına yayılır. `pdf:cancel` → `canceled:true` yolu değişmedi.

Paralellik üst sınırı: sayfa başına scheduler `maxConcurrent: 2` × 2 işçi ≤ 4
eşzamanlı sağlayıcı çağrısı — önceki seri tasarımın 2'si × 2 = bounded.

## Kanıt

- `tests/pdf-job-scheduler.test.js` (yeni, 10 senaryo): `translateVisiblePdfPagesNow`
  gerçek fonksiyonu `vm` içinde koşturulur — 300 sayfada her IPC çağrısı ≤3 sayfa,
  belge sırası, çizilmemiş-kayıt tahliyesi (Map boş), mid-flight ve extract-içi
  iptal, okuyucu değişiminde erken dur, başarısız-paket sayımı, >40 sayfa onay
  reddi, rendered kayıt koruması.
- `tests/pdf-partial-retry.test.js`: 2 statik-desen testi yeni havuz biçimine
  uyarlandı + 2 yeni değişmez (havuz ≤2 ve seri durum yazımı; işçi-başı abort).
  8/8 PASS.
- `tests/pdf-translate.test.js` (mevcut invariant): girdi mutasyonu yok — PASS.
- 300-sayfa normalize benchmark: 362ms → 5ms.
- Tüm `tests/pdf*.test.js` (8 dosya) + i18n + cache-fuzz + integrity yeşil.

## Sınırlar / Windows

- Sağlayıcı API'si ile gerçek paralel istek davranışı stub sağlayıcıyla sınandı;
  canlı sağlayıcıda 4 eşzamanlı isteğin hız-sınırı davranışı Windows'ta görülmeli.
- Symbol işareti `structuredClone`/worker sınırlarını aşmaz — oralardan gelen
  durum işaretsiz olup tam normalize yoluna düşer (güvenli yedek, doğru davranış).
