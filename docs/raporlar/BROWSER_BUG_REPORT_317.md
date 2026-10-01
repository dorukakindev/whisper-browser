# BROWSER_BUG_REPORT_317 — Çeviri değişiklik karşılaştırıcısı (kuyruk-50/5)

Tarih: 2026-10-01 · Dal: devin/1790877700-translation-diff-review

## Görev (kuyruk 50, madde 5)
"İki çeviri sürümünü cue ve cümle düzeyinde karşılaştıran inceleme görünümü;
değişen anlamı, terimleri ve eksik satırları göster; seçili sonucu güvenli
biçimde kabul ettir."

## Mevcut durum denetimi
Var: `TranslationDiff.diffTranslationCues` (zaman-örtüşme eşlemesi),
`retranslate-review` diyaloğu (checkbox + selectedChangesStillMatch +
SRT'ye geri yazım). Eksik:
- **F-317-01:** Eski sürümde olup yenisinde karşılığı olmayan cue'lar
  (çeviride kaybolan replik) hiçbir yerde görünmüyordu → veri kaybı sessiz.
- **F-317-02:** Eskide olmayıp yenisinde beliren cue'lar görünmüyordu.
- **F-317-03:** Değişen satır bütün metin olarak gösteriliyordu; satır
  içinde hangi kelimelerin değiştiği (anlam değişimi) okunmuyordu.
- **F-317-04:** Özel ad/terim farklılığı işaretlenmiyordu.

## Düzeltme
- `src/translation-diff.js`: `wordParts` (kelime LCS, ≤20k token² üstünde
  bütün-blok geri dönüş), `changedTerms` (özel-ad belirteci),
  `fullTranslationDiff` → {changed+parts+terms, missing, added},
  `applyReviewChoice` (değişen→eski metin, yeni→sil, eksik→zaman sırasına
  geri ekle), `reviewStillApplies` (tek güvenlik kontrolü: satır hâlâ
  incelenen sürüm mü; eksik yuvası hâlâ boş mu).
- `renderer.js openRetranslationReview`: üç bölümlü liste
  (Değişen/Eksik/Yeni), satır-içi `diff-del`/`diff-add` işaretleri,
  `terim: X` rozeti; seçimler `data-kind` gruplu; güvenli kabul
  reviewStillApplies → applyReviewChoice → writeSubtitle → yeniden yükle.
- `styles.css`: işaret renkleri, bölüm başlığı, terim rozeti, eksik
  (kırmızı şerit) / yeni (yeşil şerit) satır görünümü.

## Kanıt
- `node tests/translation-review-tools.test.js` → 8/8 PASS
  (yeni: eksik/yeni görünürlük + güvenli uygulama, kelime-diff ve terim
  işareti, reviewStillApplies yuva-dolu/yeni-metin-drifti reddi).
- `node tests/browser-dialog-occlusion.test.js` → 4/4 PASS
  (dilim fonksiyon-boyu kesite genişletildi — bölümlü pencere 4000-char
  pencereyi aşıyordu; aynı assertion'lar korunuyor).
- `node --check` src/translation-diff.js + renderer.js → temiz.
- `node tests/browser-parti7.test.js` → OK.

## Windows etkisi
Saf JS/CSS/DOM — platform bağımsız. Diyalog Electron'da doğrulanmadı
(IPC'siz jsdom birimi; görsel tur Windows paketinde el kontrolüne
eklenebilir).
