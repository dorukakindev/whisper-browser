# BROWSER_BUG_REPORT_378 — Yeni-100 batch 5: çeviri kalite/kapsam derinleştirme

Tarih: 2026-10-02 · Dal: `devin/1790908057-yeni100-b5-ceviri-kalite` · Başlangıç: `86f445d` (master) · Bitiş kod: `68584ba`

## Özet

Batch-5 (yeni-100 kuyruk maddeleri 41–50) çeviri hattının kalite kapılarını
uçtan uca yeniden doğruladı. Bu turda **4 doğrulanmış kusur** düzeltildi —
hepsi kullanıcının gördüğü çeviri çıktısını doğrudan etkiliyordu:

1. **Anlam kapıları dile kapsamlı değildi** (kritik kapsam kusuru)
2. **Yerelleşmiş SDH betimlemeleri sessizce İngilizceye düşüyordu**
3. **SDH içeriği özel-ad kapısına takılıyordu**
4. **Latin-dışı alfabeli satırlar hiç çevrilmiyordu** (kritik)

Ayrıca kalite raporu muhasebesinde bilinçli-korunan satırlar "çevrilmedi"
sayılıyordu — uyarı/istatistik düzeltildi.

## Bulgular

### B-378-01 · Anlam kapıları hedef dile göre kapsamlanmamış (KOD DÜZELTMESİ)

`translation_meaning_issues(source, translated, target_lang)` içindeki
`negation_missing` ve `modal_missing` kapıları `_TARGET_NEGATION` /
`_TARGET_MODAL` kalıplarını **hedef dilden bağımsız** çalıştırıyordu;
`compute_translation_quality_report` da çağrıya `target_lang` geçirmiyordu
(sabit `'tr'` varsayılanı). Sonuç: `'You must wait.'` → Almanca
`'Du musst warten.'` gibi doğru çeviriler `modal_missing` ile reddedilip
`.partial` çıktıya düşüyordu — yalnız TR'nin modal ek listesi vardı.

**Düzeltme** (`backend/sentence_translation.py`, `backend/transcribe.py`):
- `_NEGATION_TARGET_LANGS = {tr,en,de,fr,es,it,pt}` —
  `_TARGET_NEGATION` karşılık listesinin tanıdığı diller.
- `_MODAL_TARGET_LANGS = {tr}` — modal ek kalıbı yalnız Türkçe.
- Kapılar `lang` kapsamında çalışıyor; TR'ye özgü kalan kapılar
  (kesilmiş parça, saat biçimi, …) `lang == 'tr'` altında korundu.
- `compute_translation_quality_report(..., target_lang='tr')` parametresi
  eklendi; iki canlı çağrı noktası gerçek hedefi geçiriyor.
- Doğrulama: `'You must wait.'`→`'Du musst warten.'` (de) artık temiz;
  TR `'Beklemelisin.'`→`'Bekle.'` hâlâ `modal_missing` veriyor
  (negatif kontrol); DE `'nicht'` düşürülmesi yakalanıyor; JA hedefi
  kapılardan muaf.

### B-378-02 · Yerelleşmiş SDH etiketi İngilizceye geri düşüyordu (KOD DÜZELTMESİ)

`restore_sdh_markers('[MUSIC]', '[MÜZİK]')` → `'[MUSIC]'` dönüyordu:
`_SDH_EQUIVALENTS` yalnız `music↔muzik` ve `applause↔alkış` eşlemesi
içeriyordu, dolayısıyla modelin ürettiği `'[Müzik]'`/`'(Kahkaha)'` gibi
yerelleşmiş betimleme kimlik eşleşmesi bulamıyor, "belirsiz" dalında
kaynak (İngilizce) işaret korunuyordu — Türkçe çıktıda İngilizce SDH
etiketi sızıyordu. Canlı doğrulama: stub `'(Kahkaha)'` döndürdüğünde
`restore` çıktısı `'(LAUGHTER)'` oluyordu.

**Düzeltme** (`backend/subtitle_sdh.py`): `_SDH_EQUIVALENTS` tam sözlüğe
genişletildi — `_SDH` listesindeki her EN terim kanonik anahtar, TR (ve
DIY'a yakın) karşılıkları aynı anahtara düşüyor (music/laughter/applause/
whispers/phone-rings/door-slams/gunshot/thunder/garbled-voices/inaudible
vb. ~25 küme). `'[MÜZİK]'`→kimlik `('[','music')` = kaynak `'[MUSIC]'`
kimliği → yerelleşmiş biçim korunuyor.

### B-378-03 · SDH içeriği özel-ad kapısında "ad bozulması" sayılıyordu (KOD DÜZELTMESİ)

`part_anchor_issue(['[MUSIC]'], ['[Müzik]'])` → `ozel_ad_bozulma:0`
reddediyordu: `_initial_name_swap` satır-ilk token'ı `'[MUSIC]'` olarak
alıp `'MUSIC'`→`'Müzik'`i 2-edit ad takası sanıyordu. İkinci katman:
`_proper_names` `(WHISPERS)`/`(PHONE RINGS)` gibi gömülü betimlemeleri de
büyük-harfli ad adayı çıkarıyordu → `'(fısıldar)'` yerelleşmesi
`ozel_ad_kaydi` diye reddediliyordu.

**Düzeltme** (`backend/sentence_translation.py`):
- `_initial_name_swap`: ilk token saf köşeli/parantezli işaretse atlanır
  (içerik SDH kapısına aittir).
- `_proper_names`: parantez derinliği izlenir — `(...)`/`[...]` içindeki
  token'lar ad adayı sayılmaz (tek-token ve çok-token işaretler).
- Negatif kontroller: `'Lawson arrived.'`→`'Larson geldi.'` hâlâ
  `ozel_ad_bozulma`; `'Maria met John.'`→`'Maria Hans…'` hâlâ
  `ozel_ad_kaydi`.

### B-378-04 · Latin-dışı alfabeli satırlar hiç çevrilmiyordu (KOD DÜZELTMESİ — kritik)

`line_keeps_source(source_text, target)` `'harf var mı?'` denetimini
`[A-Za-zÀ-ÿ]` ile yapıyordu. Japonca (`こんにちは`), Çince, Korece,
Arapça, Kiril, Yunanca metinlerde Latin harf yok → fonksiyon `True`
dönüyor → satır **API'ye hiç gönderilmeden kaynak metniyle korunuyordu**.
Canlı doğrulama: `film.ja.srt` (3 cue) işinde üç satır da "çevrilmeden
korunan" sayılıyor ve çıktı Japonca kalıyordu; `line_keeps_source`
çağrıları `True` dönüyordu.

**Düzeltme** (`backend/transcribe.py`): harf denetimi Unicode'a çevrildi
(`[^\W\d_]`). Korunan sınıflar değişmedi: yalnız-sayı/sembol `'123'`,
`'—'`, emoji `'🔥'` hâlâ korunuyor; `'NASA FAA'`, `'iPhone 15 Pro'`,
`'♪ la la la ♪'`, vokalizasyonlar korunuyor. Artık `'こんにちは。'`,
`'Привет мир.'`, `'مرحبا بالعالم'`, `'αυτό είναι ελληνικά'` API'ye
gidiyor.

### B-378-05 · Kalite raporunda korunan satırlar "çevrilmedi" sayılıyordu (KOD DÜZELTMESİ)

`compute_translation_quality_report` `translation_is_source_echo` yankısını
`untranslated` sayarken `line_keeps_source` satırlarını hariç tutmuyordu
(SDH yapısı hariç tutuluyordu ama şarkı/vokalizasyon/ad-kod satırları
değil). `quality_failed` hesabı zaten `unchanged` kümesini çıkarıyordu,
fakat rapordaki `translation_untranslated` metriği ve "N kaynak metinli
cue" uyarısı bilinçli korunanları da sayıyordu.

**Düzeltme** (`backend/transcribe.py`): yankı kapısına
`not line_keeps_source(src_text, target_lang)` eklendi. Canlı doğrulama:
SDH+♪+Çeviri fixture'ında rapor `untranslated:0, failed:0` ve uyarı yok.

## Yeni test kapsamı

- `tests/e2e-translate-stub-server.test.js` (YENİ, 46 kontrol): süreç-içi
  OpenAI-uyumlu stub sunucu + gerçek `transcribe.py` alt süreci; senaryolar:
  mutlu yol (satır/zaman/kapsama), tek-429 iç-retry, sürekli-500 temiz hata,
  cümle-grubu üye ayrışması, workers=4 sıra güvenliği, SDH+yerelleşme+♪
  muhasebesi, CJK kapsama, HTTP hata matrisi (401/boş/bozuk — error olayı,
  stderr'de çıplak traceback yok, stdout yalnız NDJSON), TM önbelleği
  ikinci-tur baypas (0 istek).
- `tests/backend-sentence-translation.test.js` (YENİ, 125 kontrol): modül
  düzeyinde kapı matrisi — dil kapsamı (de/en/fr/es/ja/tr), sayı/birim/
  tarih/SDH demirleri, ad koruma/yerelleşme, raporun target_lang kapsamı.
- `backend/test_transcribe.py`: `test_translation_meaning_gates_are_scoped_to_target_language`.

## Test kanıtı

| Süit | Sonuç |
|---|---|
| `backend/test_transcribe.py` | 222/222 GEÇTİ |
| `tests/backend-sentence-translation.test.js` | 125/125 GEÇTİ |
| `tests/e2e-translate-stub-server.test.js` | 46/46 GEÇTİ |
| `backend/test_subtitle_sdh.py` | OK |
| `backend/test_sentence_distribution.py` | 43/43 |
| `backend/test_translation_number_gate.py` | OK |
| `backend/test_translation_quality_corpus.py` | OK |
| `backend/test_meaning_loss_eval.py` | OK |
| `backend/test_name_consistency.py` | PASS |
| `backend/test_pack_sentence_fuzz.py` | OK |

## Windows etkisi

Tüm değişiklikler saf Python metin mantığı — platformdan bağımsız;
Windows'ta da aynı davranış beklenir. `start.bat`/kurulum dokunulmadı.
Japonca/CJK kaynaklı `.srt` çevirisi Windows kullanıcısında artık gerçekten
çevrilir (önceki davranış: sessizce kaynak metin çıkıyordu).

## Çalıştırılmayanlar

- `npm test` tam suit koşturulmadı (değişen alanla ilgili tüm süitler ayrı
  ayrı yeşil; tam suit CI'da koşar — Actions şu an kullanıcı flag'i nedeniyle
  kapalı, yerel hedefli koşu yapıldı).
- Gerçek sağlayıcı (OpenAI vb.) doğrulaması yok — stub sözleşme
  doğrulamasıyla sınırlı.
- Windows elle doğrulama yapılmadı (Ubuntu geliştirme ortamı).

## Açık borç / sonraki adımlar

- `docs/ACIK-KARARLAR.md` maddeleri kullanıcı kararı bekliyor.
- `devin_review_manage` org'unda 404 — ~103 bulgunun `report_triage`
  bildirimi flag kalkınca yapılacak.
- GitHub Actions depolama %90'da (kullanıcı bildirdi); Actions zaten
  kapalı olduğundan mevcut çalışmayı etkilemiyor.
