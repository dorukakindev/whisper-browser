# BROWSER_BUG_REPORT_348 — Kuyruk-50 Madde 36: PDF yerleşimini koruyan çeviri

**Tarih:** 2026-10-01 · **Dal:** `devin/1790888809-pdf-reading-order` · **Başlangıç:** `512c9c3` · **Kod bitiş:** `8cd7bee`

## Kapsam ve mevcut-durum kontrolü

Madde 36: *"Çok sütun, dipnot, başlık ve tablo içeren belgelerde okuma sırasını çıkar. Kaynak/hedef eşlemesini göster; farklı düzenlerde metin sırasının ve sayfa ilişkilerinin korunmasını ölç."*

Mevcut uygulama incelemesi (`src/pdf-translate.js`):
- Çok sütun okuma sırası zaten vardı (gutter kümeleme + sütun-öncelikli sıralama + ayraç satırlar) — **tekrar yapılmadı**.
- Dipnot/başlık/tablo türü tespiti **yoktu** — tüm satırlar gövde varsayımıyla paragraf birleştirmeye giriyordu: başlık gövdeyle, dipnot gövdeyle birleşebiliyor; tablo hücreleri sütun-öncelikli sırada karışık okunuyordu.
- Kaynak/hedef eşleşmesi **yoktu** — `renderPdfTranslation` yalnız çeviri metnini basıyordu.
- Okuma sırası ölçümü **yoktu**.

## Doğrulanmış kusurlar ve düzeltmeler

1. **Tür-kör paragraf birleştirme:** `mergePdfLines` artık satırları sınıflandırır — `heading` (yükseklik ≥1.45×medyan, ≤200 karakter), `footnote` (alt %14 bölgede, yükseklik ≤0.78×medyan, tek-sayfa-numarası hariç), `table` (tablo hücresi), `body`. Farklı türler paragrafta birleşmez.
2. **Tablo okuma sırası:** `markTableRegions` — art arda ≥3 satırda aynı hizada ≥3 parça + tıraşlı sağ kenar (hücre bandı <%60 dolu) → hücreler `tableCell` + spanning (-1) sütununa alınır; spanning döngüsü y-öncelikli sıraladığından tablo satır-öncelikli (R1C1,R1C2,R1C3…) okunur. ≥3 parça şartı iki sütunlu gövde metnini tablo saymaz (regresyon kilidi testle sabit). Hücreler atomik — `tableBoundary` ile hiçbir hücre başka satırla birleşmez.
3. **Kaynak/hedef eşleşmesi:** `renderPdfTranslation` her bloğu `.pdf-pair` olarak çizer — kaynak metin küçük/soluk `.pdf-pair-source`, çeviri `.pdf-pair-target`; blok `kind`'ı `pdf-kind-{heading|footnote|table}` sınıfı olarak taşınır (başlık kalın/büyük, dipnot küçük, tablo tabular-nums). `kind` main.js'te paragraf→blok→durum zincirinde korunur (`normalizePdfBlock` whitelist'ten geçirir).
4. **Ölçüm:** yeni `readingOrderMetrics(rawPages)` export'u — sayfa başına paragraf sayısı, tür dağılımı (`kinds.{body,heading,footnote,table}`) ve okuma sırası özeti (`order[]`) döndürür.

## Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/pdf-translate.js` | `markTableRegions`, satır `kind` sınıflandırması, `kindChanged`/`tableBoundary` paragraf sınırları, `paragraphFrom.kind`, `readingOrderMetrics` export, `normalizePdfBlock` kind passthrough |
| `src/main.js` | paragraf→blok `kind` passthrough (translatePdfPackage + translatePdfPage) |
| `src/renderer/renderer-helpers.js` | `renderPdfTranslation` → `.pdf-pair` kaynak/hedef çiftleri |
| `src/renderer/styles.css` | `.pdf-pair*`, `.pdf-kind-*` stilleri |
| `tests/pdf-reading-order.test.js` | 12 senaryo (yeni) |

## Test kanıtı

```
node tests/pdf-reading-order.test.js  → PASS (başlık ayrımı, dipnot ayrımı, 3×3 tablo satır-öncelikli sıra,
                                          iki-sütun regresyonu, metrics tür sayımı, kind persist roundtrip)
node tests/pdf-translate.test.js      → PASS
node tests/pdf-translate-depth.test.js→ PASS
node tests/pdf-partial-retry.test.js  → PASS 7/7
node tests/pdf-file-access.test.js    → PASS
node tests/pdf-state-deadzone.test.js → PASS 5/5
node tests/i18n-coverage.test.js      → PASS (yeni UI dizgesi yok — CSS sınıfları metin içermez)
node --check (tüm değişen dosyalar)   → PASS
```

## Windows etkisi / doğrulanamayanlar

- Değişiklik saf JS (pdf.js metin öğeleri) + renderer DOM — Windows'a özgü risk yok; gerçek PDF fixture'ıyla Electron'da görsel doğrulama Ubuntu'da yapılabilir, bu PR'da çalıştırılmadı (CI kapalı — hesap flag'i).
- Tablo sezgisi metin öğelerine dayanır; çizgi/border'a bakmaz — çerçevesiz düzenlerde kaçak tablo tespiti teoride mümkün (≥3 sütunlu gövde metni + tıraşlı kenar), rapor-açıklaması düzeyinde notlandı.
- `data-pdf-view="both"` modunda sol panel PDF canvas'ıdır; eşleme görünümü `both`/`translation` modlarında sağ panelde aynı şekilde çalışır.

## Sonraki adımlar

- Madde 37 (OCR yetenek yönetimi) ile başlayan kalan 14 madde sırayla.
