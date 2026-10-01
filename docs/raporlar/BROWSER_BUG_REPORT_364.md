# BROWSER BUG REPORT 364 — 100-kuyruk batch 2: renderer/UI kenarları

- **Tarih:** 2026-10-01 · **Dal:** `devin/…-batch2-renderer-edge` · **Başlangıç HEAD:** `d50c7f9` · **Kapsam:** 100-görev duran emrinin 2. demeti (madde 11–20) — renderer/UI kenar invariantları.

## Bulgular

### B-364-01 (düzeltildi, ürün bug'ı) — `speakerMap` persist listesinde yok: sanitize'da sessiz kayıp
`index.html`'deki `speakerMap` metin alanı (diarization konuşmacı adı eşlemesi) renderer'ın `PERSIST_VALUE_CONTROLS` listesinde vardı ama `settings-security.js`'in kanonik listesinde yoktu. Sonuç: kullanıcının kaydettiği konuşmacı eşlemesi `sanitize`/import yolundan geçerken sessizce düşüyordu — ayar kalıcı görünüyor ama yeniden başlatmada/dışa aktarımda kayboluyordu. `settings-ui-persist-roundtrip` testinin "iki liste birebir aynı" ratchet'i düşerek yakaladı. Düzeltme: `'speakerMap'` güvenlik listesine eklendi (min/maxSpeakers yanına).

### B-364-02 (düzeltildi, sınıflandırma borcu) — 4 form kontrolü sınıflandırılmamıştı
Testin index.html tam-tarama ratchet'i 4 sınıflandırılmamış kontrol yakaladı (son merge'lerde eklenen): `speakerMap` (B-364-01 ile persist kümesine girdi), `sub2Offset` (medya-bazlı `whisper-player-saved:` deposuna gitti → OTHER_STORE), `playerLibraryLang`/`playerLibrarySubs` (oturum-içi kütüphane filtreleri → TRANSIENT).

### B-364-03 (kilitlendi) — renderer/UI kenar invariant ratchet'i
Mevcut UI test yüzeyi geniş olduğundan boşluk "davranış" değil "invariantların geri düşmesi" riskindeydi. Yeni `tests/renderer-edge-ratchet.test.js` 16 statik kilit kurdu:

| İnvariant | Neden |
|---|---|
| Tüm `localStorage.setItem` try içinde (38 yer, tüm dosyalar) | Kota/özel-mod istisnası kullanıcı metnini kaybettirmesin |
| `unhandledrejection` işleyicisi + `LOG_LINE_LIMIT` kırpması | Rejection sessizliği + sınırsız günlük DOM'u |
| `enforcePreviewCap` odaklı düzenlemeyi silmeden önce commit eder | DOM sınırı odaklı düzenlemeyi yutmasın |
| `flushPendingPreviewSegments` altta-yapışma (stick) | Kullanıcı yukarı kaydırdıysa ekleme ekranı zıplatmasın |
| Her `setPointerCapture` dosyasında pointercancel | R316 dokunmatik sürükleme töreni |
| Düzenleme bekçileri: `quickEditorStillCurrent`, `cueEditTarget` imzası, `openedRevision`/`baseTranslation` revizyon kontrolü, `player.editing` | Çakışmalı kayıt koruması üç katmandır; birinin silinmesi sessiz bozulma |
| `renderCueList` metinleri `escapeHtml` üzerinden | Boş-durum/CTA dizgileri kaçışsız kalmasın |

## Madde kapanışı (11–20)

| # | Planlanan kenar | Sonuç |
|---|---|---|
| 11 | Sürükleme/pointercancel yüzeyi | ✅ Tüm setPointerCapture dosyaları iptalli (ratchet) |
| 12 | Kalıcı-yazım koruması | ✅ 38/38 setItem try içinde (ratchet) |
| 13 | Düzenleme çakışma bekçileri | ✅ Üç katman kilitli (ratchet) |
| 14 | Odak-kaybı commit'i | ✅ enforcePreviewCap kilitli |
| 15 | Canlı-ekleme kaydırma | ✅ stick invariant kilitli |
| 16 | Günlük/rejection sınırları | ✅ kilitli |
| 17 | persist liste bütünlüğü | ✅ B-364-01 gerçek bug düzeltildi |
| 18 | Kontrol sınıflandırması | ✅ B-364-02 borç giderildi |
| 19 | UI regresyon suiti | ✅ 15 dosya yeniden koşuldu PASS |
| 20 | persist roundtrip | ✅ 5/5 PASS (düzeltme sonrası) |

## Kanıt

```
$ node tests/renderer-edge-ratchet.test.js
renderer-edge-ratchet: 16 kontrol geçti
$ node tests/settings-ui-persist-roundtrip.test.js
settings-ui-persist-roundtrip: 5 kontrol geçti   (öncesi: 2 FAIL — speakerMap kayması + 4 sınıflandırılmamış kontrol)
$ for t in browser-ui-r4 … settings-ui-persist-roundtrip → 15/16 PASS + 1 düzeltildi
```

## Windows etkisi

`speakerMap` listesi platformdan bağımsız; pointercancel Chromium'da aynı. Windows özel risk yok.

## Kalan

Batch 3 (backend hata/kenar yolları) ve sonrası açık.
