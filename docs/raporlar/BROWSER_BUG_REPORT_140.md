# BROWSER_BUG_REPORT_140 — R145 kaynak-soak ölçüm tasarımı sertleştirme

Tarih: 2026-09-27 · Dal: `codex/r145-soak-hardening-1790503366` · Taban: `f40cccf`

## Özet

R113'te eklenen kaynak-soak harness'ının smoke koşusu ardışık çalıştırmalarda
farklı kontrollerde **sahte kırmızı** üretiyordu: run A `browser-heap-slope` +
`disk-write-ops-per-cycle`, run B `listener-delta`. Bu turda üç ölçüm kusuru
ayrık düzeltildi ve sahte kırmızının kök nedenleri kanıtlandı — **üründe
gerçek kaynak sızıntısı bulunmadı** (aynı-durum probu doğruladı).

## Kök nedenler

### K1 — Karma-faz heap regresyonu (sahte pozitif)

Tarayıcı heap'i döngü fazına göre iki platoda salınıyor: metin-sayfası
döngüleri ~1.1 MB, video (hls.js + mux.js CEA fixture) döngüleri ~2.6 MB.
`linearSlope` tüm örnekleri tek seri sayıp least-squares uygulayınca faz
salınımı "büyüme" diye okunuyordu (bir koşuda 143 KB/döngü eğimi; gerçek
faz-içi eğim ~25 KB/döngü ve bütçe 48 KB).

**Çözüm:** `runResourceSoakSession` her döngü sonrası
`collectResourceSoakHeapPoint` ile faz-etiketli iz noktası kaydeder
(`report.heapTrace: [{cycle, kind:'video'|'page', browserHeapBytes, ...}]`).
Değerlendirici `heapTraceSlope(trace, kind, field)` ile her fazı ayrı
regresler ve iki fazın **büyük** eğimini alır — hangi faz büyürse büyüsün
yakalanır, faz karışması artık sızıntı sayılmaz.

### K2 — Çapraz-reload dinleyici karşılaştırması (sahte pozitif)

`listener-delta`, `start` ↔ `final` örneklerinin `listeners.total` farkını
alıyordu. Soak `cycles/2`'de renderer'ı **yeniden yüklüyor**; reload sonrası
UI durumu başlangıçtan farklıdır (ör. ilk SmartTube render'ı). Ölçülen +1
`button|click` sızıntı değil UI-durum farkıydı; postreload sonrası stable
serisi zaten 1455/1455/1455 düzdü.

Ayrıca `stable-6 → stable-8` arasında +108 görüldü: kök nedeni `cycle % 8`
döngüsündeki `workspacePlayerMode→workspaceBrowserMode` geçişinin SmartTube
ızgarasını **ilk kez** kurması (watch-library'deki soak kayıtlarıyla ~12 kart
× ~9 dinleyici). İlk-render + veri büyümesi, sızıntı değil.

**Çözüm (üç katman):**
- `listener-delta` artık yalnız **ana süreç emitterlarında** uygulanır
  (`mainWindow`, `mainContents`, `browserContents`, `browserDebugger`) —
  bu emitter'lar reload'dan etkilenmez ve sıfır tolerans korunur.
- Her mod geçişi (artık `cycle % 4 === 0`) öncesi/sonrası renderer dinleyici
  sayacı `report.toggleProbes`'a yazılır — **aynı-durum** delta. İlk render
  ısınmaya taşındı; ölçülen problarda after−before ≤ `toggleListenerDeltaMax`
  (8; tek kart ~9 dinleyici, gerçek sızıntı her geçişte ≥ kart-başına kadar
  büyür). Kanıt: bu koşuda problar +2 ve +0.
- Problar yoksa (çok kısa koşu) `renderer-listener-drift` postreload
  sonrası stable serisinin ilk↔son farkına düşer.

Ayrıca prob etiketi: idsiz `<button>`'lar `button` yerine
`button["<aria-label|text>"]` olarak raporlanır — yukarıdaki +108'i
`Sıraya ekle` düğmelerine izleyen kanıt bu sayede çıktı.

### K3 — Toplu disk-yazım bütçesi (sahte pozitif)

`disk-write-ops-per-cycle` (max 10) tüm yazarları topluyordu; debounce
flush'larının zamanlaması smoke'da bazen bütçeyi aşıyordu. İncelemede tüm
yazımların kasıtlı atomik/debounced persist olduğu doğrulandı:
watch-library `tmp + fsync + bak.tmp + rename` ≈ 2 op/upsert; session 700 ms
trailing + 10 sn leading flush; places 400 ms debounce; yayınlanan
`web-*.srt` + asset `json.tmp/srt.tmp` çiftleri.

**Çözüm:** yazımlar `io.byFile` deltasından yazar kategorisine ayrılır
(`WRITE_CATEGORY_PATTERNS`: watchLibrary / browserPlaces / browserSession /
queueState / settings / subtitleFiles / browserAssets / other) ve her
kategoriye kendi döngü-başına bütçesi uygulanır
(`writeOpsPerCycle`; toplu bütçe 24). Bir yazarın flood'u artık
`disk-write-<kategori>-per-cycle` olarak tek başına kırmızı verir.

### K4 — CHANGELOG'a diff3 çatışma işareti commit edilmiş (doküman bug'ı)

PR #74'ün rebase çözümünde `CHANGELOG.md` içinde tek satırlık
`||||||| parent of 6aa9233` işareti master'a commit edilmiş. İşaret bu PR'da
silindi ve `tests/conflict-markers.test.js` ile tracked metin dosyalarında
`<<<<<<<` / `>>>>>>>` / `|||||||` / tam-satır `=======` kalıntısı CI'da
yasaklandı.

## Eklenen testler (`tests/resource-soak.test.js`, 16/16)

- `heap eğimi faz-etiketli iz noktalarında ayrık regreslenir`
- `heap izi aynı faza ait gerçek büyümeyi yakalar`
- `disk yazımı yazar kategorisine ayrılır ve yazar başına bütçelenir`
- `dinleyici deltası ana süreç emitterlarında sıfır toleranslıdır`
- `renderer dinleyici kayması reload sınırındaki UI farkını sızıntı saymaz`

## Doğrulama

```
node tests/resource-soak.test.js                          # 16/16 OK
node tests/run-resource-soak.js --smoke --cycles=8        # 33/33 OK, GEÇTİ
```

Son smoke: heap eğimleri faz-ayrık (browser 25.3 KB/döngü ≤ 48), listener-delta
0, renderer-listener-drift 2 ≤ 8 (toggle probları +2/+0 — ilk-render artığı),
tüm yazıcı kategorileri bütçe içinde.

## Windows etkisi

Ürün kodu değişmedi — yalnız test harness'ı (`main.js`'in soak sürücüsü,
`resource-soak.js` değerlendiricisi, renderer probu). Windows'ta soak
koşusu aynı komutla çalışır; `WRITE_CATEGORY_PATTERNS` hem `/` hem `\`
yol ayracını tanır.
