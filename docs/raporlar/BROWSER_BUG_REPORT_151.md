# BROWSER_BUG_REPORT_151 — R153: renderer.js modül çıkarımı (ilk dilim)

- Tarih: 2026-09-27
- Dal: `codex/r153-renderer-extract-1790508234`
- Kapsam: `src/renderer/renderer.js` (28 750 satır, 926 üst-düzey `function` bildirimi) modülerleştirme çalışmasının ilk güvenli dilimi.

## Özet

`renderer.js`'ten **63 işlev / 753 satır** yeni `src/renderer/renderer-helpers.js` dosyasına taşındı; dosya, `index.html`'de `status-copy.js` ile `renderer.js` arasına yüklendi. Davranış değişikliği yok — üst düzey `function` bildirimleri klasik script'lerde aynı global alana yazılır; çağrılar çalışma anında çözülür, import/export gerekmez. Tüm Node test paketi yeşil (`npm test`, 0 başarısız).

## Neden bu kadar "küçük" bir dilim?

renderer.js'in test kapsamı kaynak-metin slicing üzerine kurulu: ~120 test dosyası `indexOf('function X')`/`slice(...indexOf('A'), indexOf('B'))` ile dosyadan blok kesip `vm`/`new Function` içinde çalıştırıyor veya gövde metnini regex'le denetliyor. Bu yüzden bir işlev yalnızca "isim olarak testte geçmiyor" olmasıyla yetmez; şu dört sınıfın tamamı dışında kalmak zorunda:

1. **İsim-anchor** — test dosyalarında harfi harfine geçen işlev adları (`indexOf('function X')`).
2. **Gövde-metni** — işlev gövdesinde bulunan ve testlerin renderer.js kaynağında aradığı literal/regex parçaları (örn. `window.api.testTranslationProvider(`, `result.kind === 'pages'`).
3. **Bölge-aralığı** — `slice(indexOf(A), indexOf(B))` ile kesilen aralığın *iç yapısı* denetlenir: A ve B arasındaki işlevlerin taşınması dilimi küçültüp içerik assertlerini kırar (örn. `flushPendingPreviewSegments`..`// Nihai segment listesini` arasındaki `addSegment`).
4. **Çağıran-zinciri (eval-time)** — testlerin eval ettiği dilimlerin çağırdığı işlevler ad olarak test dosyasında hiç görünmeyebilir (`cleanLocalCueText`, `loadStPlaylists` gibi); bunlar ancak çağıranları da taşınırsa güvenli.

İlk geçiş (yalnız isim filtresi) 319 işlev çıkarıyordu ama 36 test dosyası kırıldı; gövde-metni + bölge-dondurma + çağıran-zinciri filtreleri ve iki gözlenen ReferenceError turu sonrası güvenli küme 63 işleve indi. Taşınanlar arasında önbellek yardımcıları, liste/kütüphane render yardımcıları, YouTube-hesap ve sağlayıcı-profil yardımcıları gibi bağımsız yapraklar var.

## Değişen dosyalar

- `src/renderer/renderer-helpers.js` — yeni dosya; taşınan 63 işlev + başlık yorumu.
- `src/renderer/renderer.js` — 28 751 → 27 998 satır.
- `src/renderer/index.html` — `renderer-helpers.js` script etiketi (`status-copy.js` ile `renderer.js` arasında; sıralama sözleşmesi korunur).
- `tests/ui-locale.test.js` — script-sırası ratchet'ı yeni dosyayı kapsayacak biçimde güncellendi (sözleşme genişletme, gevşetme değil).

## Doğrulama

- `node --check` renderer.js + renderer-helpers.js: temiz.
- `npm test`: tüm dosyalar geçti (0 başarısız) — slicing/eval/regresyon testlerinin tamamı taşıma sonrası aynen çalışıyor.
- `git diff` incelemesi: taşınan bloklar birebir aynı; yalnızca kesme+yapıştırma.

## Sonraki dilimler için yol

- Daha büyük dilimler için test katmanının "metin-slicing" alışkanlığını dosya-bağımsız bir yükleyiciye (`tests`'te ortak `loadRendererSource()` gibi) taşımak gerekir; aksi hâlde her çıkarım test-kırılması riski taşır.
- İkinci aday kümeler (all-safe bileşenler): araştırma/izleme kütüphanesi (~13 işlev), kuyruk/geçmiş (~17), cue-vurgu/sözcük müfettişi (~14), PDF-reader (~6), komut paleti (~9), canlı-ASR (~6) — her biri ayrı PR dilimi olarak çıkarılabilir.

## Windows etkisi

Yok — script etiketi `index.html`'de CSP `script-src 'self'` içinde yerel dosya; `start.bat`/kurulum yolu etkilenmez. Windows CI beklenir.
