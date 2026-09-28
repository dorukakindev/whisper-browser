# BROWSER_BUG_REPORT_176 — R194: renderer.js orta-boy fonksiyon kuyruğu kapandı (temiz)

Tarih: 2026-09-28 · Dal: `codex/r194-pipeline-audit` · Başlangıç: `83fb244` (master)

*(Bu rapor, Devin Review'un PR #123'te "temiz tur da raporlanmalı" bulgusu üzerine R196 dalında geriye dönük eklendi.)*

## Kapsam

`renderer.js`'in R190'dan beri açık kalan orta-boy fonksiyon listesinin tamamı
(`playerJobEvent`/`finish`, `navigateBrowserFromAddress` ve sekme şeridi
dinleyicileri, `clearBrowserCookieScope`, `renderSmartTubeSection`/`showError`,
`updateMangaEndpointUI`, `updateGpuBadge`, `runPlayerLibrarySearch`,
`saveTimelineCopy`, `syncAudioTracks`, `mkBtn` + abonelik paneli, `launch`,
`startProgressivePlayerTranscription` ve kalan tüm orta-boy fonksiyonlar)
fonksiyon düzeyinde tek tek okundu. Satır aralıkları ve kanıt notları:
`docs/devir/2026-09-28-1700.md`.

## Sonuç

- **Doğrulanmış bug: yok.** Ürün kodu değişmedi (başlangıç = bitiş).
- Tüm yüzeyler sınır doğrulama, staleness/jeton, atomik yazma, hata kapısı
  ve i18n disipliniyle korunuyor.
- Bu turun kapanmasıyla `renderer.js`'in fonksiyon düzeyinde denetlenmemiş
  bölümü kalmadı: dev fonksiyonlar R192'de, orta-boylar bu turda,
  kalanlar daha önceki turlarda kapatıldı.

## Runtime doğrulama

- Tam deterministik Electron smoke seti `--all` merged master `83fb244`
  üzerinde: ilk koşuda 34/38 — 4 smoke `No module named 'srt'` ortam hatası;
  `backend/venv` sembolik bağı eksikliği giderilince **38/38 GEÇTİ**.
- Kod regresyonu yok.

## Sınırlar

- `npm test` tam turu bu dalda koşulmadı (belge-only + smoke kapsamı);
  R195 dalında koşup yeşillendi.
- Ubuntu smoke sonuçları Windows kabulü yerine geçmez — UI sözleşmeleri
  (ikon rayı, overlay, sabit sekme boyutu) Windows'ta el kontrolü ister.
- PR #119 "1 potential issue" yorumu API'de 404; yalnız web sayfasında görünür.
