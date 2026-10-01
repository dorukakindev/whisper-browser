# BROWSER_BUG_REPORT_349 — Kuyruk-50 Madde 37: Yerel OCR yetenek yönetimi

Tarih: 2026-10-01 · Dal: `devin/1790889339-k50-37-ocr` · Kod commit'i: `a984101` (önceki master: `9fb4648`)

## Görev (verbatim)

> Yerel OCR yetenek yönetimi: Görüntü tabanlı PDF için mevcut OCR yolunu inceleyip eksik akışı tamamla. Motor yokluğu, dil paketi ve düşük güven durumlarını açık göster; metin katmanı olan sayfaları gereksiz OCR'dan geçirme.

## İnceleme bulguları (eksik akış)

1. **Görüntü tabanlı PDF sayfaları çıkmazdaydı.** `extractPdfReaderPage` boş metin katmanında `blocks=[]` döndürüyordu — sayfa hiçbir zaman çevrilemezdi ve kullanıcıya neden görünmezdi.
2. **Kutu koordinatları atılıyordu.** `ocr_frame` RapidOCR sonucunun `row[0]` quad'ını okumuyordu; satır bazlı konum olmadan OCR çıktısı okuma sırasına dizilemezdi.
3. **Yetenek probu yoktu.** Motor (rapidocr_onnxruntime) ve Python/venv yokluğu ancak OCR denemesi patlayınca belli oluyordu; dil paketi kapsamı hiç raporlanmıyordu.
4. **Güven puanı yüzeye çıkmıyordu.** Satır `score` değerleri çeviriye güven bağlamı veya uyarı olarak yansımıyordu.
5. **`browser:extras` IPC'si PDF okuyucuya uymuyordu.** `valid()` aktif tarayıcı sekmesi + `generation` + `mediaId` koşulu ister; PDF okuyucu ayrı bağlam — kendi IPC yüzeyi gerekti.

## Uygulanan değişiklikler

- `backend/browser_media_tools.py`: `ocr_frame` her satıra `box` `{left,top,right,bottom}` ekler. Yeni `ocr_status(request)` — `available/engine/version/languages/languageNote`; ImportError'da kurulum rehberiyle `available:False`. `serve()`/`main()` dispatch'ine `ocrStatus` dalı.
- `src/browser-media-tools.js`: `ocrStatus()` sarmalayıcı (tek-sefer `python('ocrStatus')`).
- `src/main.js`: `ocr:status` (sonuç `ocrStatusCache`'de saklanır; `payload.refresh` ile yenilenir; Python/venv yokluğu da `{available:false}` raporu olarak döner) ve `ocr:frame` (≤11MB payload) — ikisi de `authorizedBrowserSender` kapılı.
- `src/preload.js`: `window.api.ocrStatus(refresh)`, `window.api.ocrFrame(payload)`.
- `src/renderer/renderer-helpers.js`:
  - `ocrPdfPage()`: önce `ocr:status` (okuyucu genelinde tek prob, `reader.ocrStatusPromise`); mevcutsa sayfa ayrı tuvalde `≤2048px` ölçekle render edilip `ocr:frame`'e gider.
  - `ocrLinesToBlocks()`: satırları `(top,left)` sırasıyla dizip medyan satır yüksekliğinin 1,6 katından büyük boşlukta paragraf keser; kimlik `sayfa:ocr:i` deterministic — kalıcı durumla çakışmaz.
  - `extractPdfReaderPage()`: `items.length===0` ise OCR yedeği koşar; `entry.ocr` teşhis kaydı tutulur. Metin katmanlı sayfa OCR'a girmez.
  - `renderPdfOcrNote()`: dört durum rozeti — motor yokluğu (kurulum rehberiyle), OCR hatası, metin bulunamadı, düşük güven (% eşik <0.6 + dil paketi notu) — `interfaceChoice` ile EN/TR.
- `src/renderer/renderer.js` (`renderPdfReaderPage`): `entry.ocr` varsa rozeti çağırır.
- `src/renderer/styles.css`: `.pdf-ocr-note` / `.pdf-ocr-warn` stilleri (token'lı).
- `src/renderer/ui-locale.js`: `'Kare verisi geçersiz veya çok büyük.'` EN girdisi (i18n-coverage ratchet'i main.js `error:` taraması yakaladı).

## Ölçülebilir kanıt

- `node tests/pdf-ocr-capability.test.js` → **20/20 PASS** (yeni dosya: sözleşme + IPC kapısı + sıralama/gruplama + rozet durumları).
- `node tests/i18n-coverage.test.js` → 0 eksik.
- `node tests/pdf-reading-order.test.js`, `pdf-translate.test.js`, `pdf-partial-retry.test.js`, `pdf-translate-depth.test.js`, `pdf-state-deadzone.test.js`, `manga-ocr-hardening.test.js` → hepsi yeşil.
- `node --check` (main/preload/renderer/renderer-helpers/browser-media-tools) + `py_compile` → temiz.
- **Gerçek motor E2E**: `backend/venv/bin/python backend/browser_media_tools.py` ile `ocrStatus` → `{available:true, engine:'RapidOCR (onnxruntime)', version:'1.4.4', languages:['en','zh']}`; PIL ile üretilen test görselinde `ocr_frame` → 2 satır, kutu koordinatları ve %95/97 güven puanlarıyla döndü.

## Windows etkisi / doğrulanmayanlar

- Windows'ta `start.bat` venv yoluyla `resolvePython()` aynı `backend/venv`'i bulur; RapidOCR paketi `requirements-browser-tools.txt` içinde — `install.bat` bu dosyayı kuruyor mu Windows'ta elle doğrulanmalı (requirements kontrolü: dosya mevcut, install.bat içeriği bu oturumda doğrulanmadı).
- Gerçek PDF sayfa render + OCR + çeviri uçtan-uca akışı Electron'da elle denenmedi (otomasyon: sözleşme testleri + gerçek backend çağrıları). Windows makinede taramalı PDF ile görsel doğrulama önerilir.
- OCR yalnız metin katmanı boş sayfada koşar; sayfa başına ~1-4s. Çok sayfalı taramalı belgelerde "Tümünü çevir" akışı artık OCR'lı sayfaları da kapsar (3'lü yığınlarla).
