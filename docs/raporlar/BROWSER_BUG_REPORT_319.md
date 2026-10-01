# BROWSER_BUG_REPORT_319 — Okuma hızına göre dağıtım (kuyruk-50/7)

Tarih: 2026-10-01 · Dal: devin/1790878300-multipoint-sync (madde 7 kodu
bu dalda ilerledi; PR ayrı)

## Görev
"Uzun çevirileri süre, satır uzunluğu ve cümle bütünlüğünü birlikte
gözeterek cue'lara dağıt. Zaman sınırlarını koruyup zor diyaloglarda
mevcut yöntemle karşılaştır."

## Mevcut durum denetimi
Tek mekanik dağıtıcı: `fitTranslationParts` (JS yedek yol; model `parts`
vermezse `distributeTranslation` çağırır). Backend `sentence_translation.py`
model parçalarını doğrular ama mekanik dağıtım yapmaz — reddeder.
Var: süre-orantılı hedef + kesim cezaları + zaman sınırı koruması
(parça→cue eşlemesi). Eksik:
- **F-319-01:** Okunabilirlik üst sınırı yok — `sentenceTranslationRequest`
  modele `max_chars = süre×21` söyler ama yedek DP'de CPS kapasitesi yoktu.
- **F-319-02:** Kesim ikramiyesi tüm noktalama için tek seviye (-0.8);
  cümle sonu ile yan cümle sınırı ayrılmıyordu.

## Düzeltme
- Per-slot `capacity = max(4, süre×21 CPS)`; `chars > capacity` için
  ağır ikinci derece taşma cezası (OVERFLOW_WEIGHT=20 — ~7 karakter
  aşımda cümle ikramiyesini yener, marjinal aşımda ikramiyeye boyun eğer).
- Cümle-sonu noktalama ikramiyesi -2 (kısaltma/sıra sayısı bekçili:
  `Dr.`, `21.` sonrası cümle sonu sayılmaz), yan cümle virgülü -0.4.
- Zaman sınırları: `distributeTranslation` parçaları orijinal cue
  start/end'lerine eşler — dokunulmadı.

## Mevcut yöntemle karşılaştırma (eski maliyet taklidi vs yeni)
| Vaka | Eski max CPS | Yeni max CPS |
|---|---|---|
| hizli-3 (4×0.9s, uzun çeviri) | **30** | **22** |
| esit-uzun-metin (3×1s) | 42 | 40 |
| hizli-orta-sikisik | 21 | 21 |
| tek-uzun-tek-kisa | 14 | 14 |
| bonus-kaybi (cümle sınırları) | 16 | 16 |
| dengesiz (0.3s cue) | 33 | 33 (geometrik alt sınır: 10 karakter zorunlu) |
| noktalama | 23 | 23 |
| ornek (soru eki "mi") | 24 | 24 (parçacık bütünlüğü marjinal aşımı korur) |
| kisaltma (Dr.) | 16 | 16 |

Dürüst sınır: toplam metin/toplam süre ≥21 CPS olduğunda hiçbir bölme
sihir yaratmaz; yeni maliyet en-kötü-CPS'i minimize eder.

## Kapsam dışı (not)
- Model-üretimli `parts` CPS denetlenmez — reddetme yeniden istek
  maliyeti doğurur; model `max_chars` ipucunu zaten alıyor.
- `words.length < pieces.length` birleştirme yolu değişmedi.

## Kanıt
- `node tests/subtitle-sentence-layout.test.js` → PASS (yeni: hızlı
  diyalog ≤23 CPS, dengesiz geometri, Dr./sıra sayısı bekçisi)
- `node tests/browser-report85-regressions.test.js` → 12/12 PASS
- distributeTranslation bağlı testleri (workflow-core, subtitle-gauntlet,
  report89, translation-merged) → PASS

## Windows etkisi
Saf JS — platform bağımsız.
