# BROWSER_BUG_REPORT_401 — Anlam kapıları (anlam_*) yanlış-pozitif turu

Tarih: 2026-10-02 · Durum: DÜZELTİLDİ (PR bekleniyor) · Önceki tur: rapor 400 (part kapıları)

## Tetikleyici

PR #443 (part kapıları FP turu) sonrası kullanıcının yeni Windows günlüğünde
retlerin büyük kısmı anlamsal kalite kapılarına kaydı:
`anlam_modal_certainty_flip`, `anlam_modal_missing`, `anlam_negation_missing`.
Önceki turda bu sınıf probe'un `args` alanı boş geldiği için ölçülememişti;
bu turda hem `T` hem `ST` ad alanı sarılarak kaynak+hedef çiftleri yakalandı.

## Ölçüm yöntemi

- Korpus: `/tmp/border_120.srt` — 120 cue gerçek YouTube altyazısı (Border
  Security Australia), rolling-window karakterli.
- Sağlayıcı: codecraftapi.com/v1 + gemini-3.7-flash, kullanıcının deneme
  anahtarı (oturum ortam değişkeni, commit'e girmedi).
- Probe: `translation_meaning_issues` + `translation_blocking_issues` hem
  `transcribe` hem `sentence_translation` ad alanında sarıldı; her ret için
  `{gate, issue, source, target}` `/tmp/trun5/rejects.ndjson`'a yazıldı.

## Bulgular — ret sınıflandırması

65 kayıtlı ret, üç sınıf:

**A. Doğru ret — model echo'su (çoğunluk).** Hedef = kaynak İngilizce, verbatim.
Anlam kapısı bunları olumsuzluk/modal kanıtı yokluğundan reddediyor — ret doğru,
etiket yanıltıcı (asıl kusur çevrilmemiş echo). Kök neden ayrı: rolling-window
kaynak metni modeli echo'ya itiyor (ayrı iş maddesi, kullanıcıya sunuldu).

**B. Doğrulanmış yanlış-pozitifler (5 sınıf, hepsi düzeltildi):**

| # | Sınıf | Örnek | Kök neden |
|---|-------|-------|-----------|
| 1 | `modal_certainty_flip` | "Could you open the bag?" → "Çantayı açar mısınız?" | 'could you/we' kibar istek kalıbı belirsizlik sanılıyordu |
| 2 | `modal_missing`+`certainty_flip` | "will not believe" → "inanmazsın", "won't" → "Gelmez", "couldn't" → "Bulamadım" | olumsuz modal Türkçe olumsuz çekimde bütünleşir; ayrı modal kanıtı aranıyordu |
| 3 | `modal_missing`/`certainty_flip` | "could see" → "görebiliyordun", "may" → "olabileceği" | _TARGET_MODAL/_TARGET_UNCERTAINTY yalnız 'abilir/ebilir' arıyordu; -AbIl aorist-dışı biçimler kaçıyordu |
| 4 | `negation_missing` | "no luggage" → "yoktu", "Nobody" → "Kimsenin", "won't" → "söylemeyeceğim", "mustn't" → "Girmeyin" | 'yok/hiçbir/kimse' çekimlerinde \w* yoktu; -mAyAcAğ/-mAyIp/-mAyIn kalıpları eksikti |
| 5 | `modal_missing` | "don't have to" → "gerekmiyor" | gerek(?:iyor\|ir\|ecek)? dar kalıbı olumsuz çekimleri kaçırıyordu |

**C. Doğru ret — gerçek anlam taklası (korundu):**
- "It might rain" → "Yağmur yağacak" (ihtimal→kesinlik) — hâlâ RET.
- "Could he be mistaken?" → "Yanıldı mı?" — hâlâ RET ('could you/we' maskesi
  üçüncü şahısa dokunmaz).
- "You should not do that" → "Bunu yapmalısın" — hâlâ RET (negation_missing).
- "You must wait" → "Bekle." — hâlâ RET (modal_missing+weakened).
- "They won't release him" → "bırakacaklar" — hâlâ RET (negation_missing).

## Değişiklik

`backend/sentence_translation.py`:

- `_NEGATED_MODAL` (yeni): olumsuzlaştırılmış kaynak modalı modal denetimi
  öncesi maskeler. Olumsuzluk kapısı etkilenmez — 'not' hâlâ kaynak işaret
  olarak durur; gerçek taklaflar negation_missing'den yakalanır.
- `_REQUEST_COULD` (yeni): `could you/we/u` kalıbını yalnız ihtimal
  denetiminden maskeler.
- `_TARGET_NEGATION`: `yok`→`yok\w*`, `hiçbir`→`hiçbir\w*`, `kimse`→`kimse\w*`;
  `m[ae]y?[ae]c[ae]k`→`[kğ]`; -mAyIp ve -mAyIn(Iz) dalları eklendi.
  `yoksa` ayrık girdi `yok\w*` içinde kaldı.
- `_TARGET_MODAL`: `abilir|ebilir`→`abil|ebil` (görebiliyordu, yapabildi,
  olabileceği); `gerek(?:iyor|ir|ecek)?`→`gerek\w*`.
- `_TARGET_UNCERTAINTY`: `abilir|ebilir`→`abil|ebil` (aynı gerekçe).
- `translation_meaning_issues`: kıvırcık kesme (’) düz kesmeye katlanır
  (`src_norm`); modal denetimleri maskeli kaynak üzerinde.

Bilerek değiştirilmeyenler:
- _TARGET_MODAL'a -mAz EKLENMEDİ — eklenirse olumlu kaynak → olumsuz hedef
  taklası ('will come'→'Gelmeyecek') modal kanıtı sağlanmış sayılıp olumsuzluk
  kapısını da atlatırdı. Kaynak-maskesi yaklaşımı bu deliği açmaz.
- 'maybe/perhaps/probably' küçük-harfe bağlı kaldı (cümle başında yakalanmaz) —
  belgelenmiş sınırlama, genişletmek özel-ad FP riski taşır.
- Ters yön (olumlu kaynak → olumsuz hedef ekleme) ayrı kapı gerektirir;
  deyimsel olumsuz çeviriler ("Get lost" → "Kaybol gitme") FP üreteceği için
  eklenmedi.

## Testler

- `backend/test_sentence_distribution.py`: 5 yeni test —
  `test_negation_inflected_target_forms_count`,
  `test_negated_english_modals_skip_modal_gate_not_negation`,
  `test_ability_modal_non_aorist_forms_count`,
  `test_could_you_request_not_uncertainty`,
  `test_modal_gates_still_catch_real_flips`. Toplam 48/48 yeşil.
- `test_transcribe.py` 222/222, `test_translation_quality_corpus.py` 5/5.
- Canlı korpus yeniden koşusu (düzeltilmiş kapılar): sonuçlar aşağıda.

## Windows etkisi

Yalnız backend regex + maske; UI/IPC/sürüm değişikliği yok. `start.bat` akışı
etkilenmez. Kullanıcının gördüğü etki: aynı içerikte daha az anlam-kapısı reti,
daha az kurtarma isteği, daha az orijinal-bırakılan blok.

## Sınırlar

- Echo-retleri (sınıf A) kapı sorunu değil; rolling-window kaynak dedup'ı ayrı
  iş olarak bekliyor.
- 'could afford' → 'finanse etti' gibi gerçek modalite kayıpları hâlâ
  flag'lenir (borderline-TP; gevşetilmedi).
- Ölçüm tek model/tek korpus; başka dil çiftleri (_NEGATION_TARGET_LANGS
  tr+en+de+fr+es+it+pt) aynı genişletmelerden yararlanır ama ölçülmedi.
