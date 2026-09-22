# BROWSER_BUG_REPORT_108 — TR altyazı çevirisi: sentence-group dağıtım kapıları

Dal: `codex/tr-sentence-groups-1790094000` · Taban: `master` (PR #30 sonrası)
İş: Kaynak cue sınırları cümleyi ortadan kesse bile çevirinin cümle seviyesinde kalması — gruplama, bütün-çeviri ve Türkçe'nin cue'lara geri dağıtımı derinlemesine doğrulandı; eksik kapılar eklendi.

## Ölçüm: zaten doğru olanlar (yeniden yazılmadı)

Kaynak + test incelemesi ve canlı sağlayıcı koşusuyla doğrulandı:

- **Gruplama** (`sentence_groups`): boşluk ≤1.2sn + ≤280 kar + ≤12sn + ≤6 parça; kısaltma (`ABBREVIATIONS`), üç nokta devamı, konuşmacı değişimi (`_BOUNDARY`), SDH, overlap ve bozuk zaman koruması mevcut.
- **Bütün gönderim**: her grup `sentence_groups` alanıyla tek cümle olarak modele gider; `pack_sentence_groups` grubu asla bölmüyor.
- **Yapısal sözleşme**: `{"items":{id:parça}, "sentences":{ilkId:bütün}}` isteniyor; `accept_sentence_reply` → `validate_sentence_parts` parçaların boşluk-normalize birleşiminin bütün cümleyi birebir üretmesini zorunlu kılıyor (`eksik_tam_cumle` ret'i canlı koşuda görüldü ve kurtarmaya düştü).
- **Timestamp'ler**: varsayılan modda blok sayısı ve zamanlar hiç değişmiyor (canlı koşuda 9/9 aynı damga).
- **Cache/dedupe**: yalnız `done_idx` grupları yazılıyor; artan girdi testinde yalnız yeni 10 cue sağlayıcıya gitti (25 eski cue cache'ten).
- **Küçük paket kurtarma** (`retry_groups_once`): ikili → tekil grup düşüşü çalışıyordu.
- **Anlam kapıları (bütün seviyesi)**: sayı/olumsuzluk/modal/para/birim/tarih kontrolü `translation_blocking_issues`/`translation_meaning_issues` ile grup bütünü üzerinde vardı.

## Gerçek kök nedenler (6 eksik + ikinci turda 4 yanlış-pozitif düzeltmesi)

1. **`sentence_part_boundary_issue` fazla katıydı.** Kural: "son parça dışında hedef cümle sonu yasak." Kaynak parça gövdesinde tam cümle barındırıyorsa ("Wait. Are you sure") istenen çıktı "Bekle." reddediliyordu. → Kural kota'ya çevrildi: hedef parçanın cümle-sonu sayısı ≤ kaynak parçanınki.
2. **Parça-seviyesi demirleme yoktu.** Sayı/özel ad/SDH kontrolü yalnız grup bütününde yapılıyordu; "2.4" veya "Lawson" başka cue'ya kayabilirdi (konuşma anından kopma). → `part_anchor_issue`: parça başına sayı (`_number_preserved`, yazıyla da sayılır), para/birim/tarih alt-kümeleri, SDH işaret **türü** (köşeli/paren/♪/konuşmacı etiketi — içerik yerelleşebilir: `[GUNFIRE]`→`[SİLAH SESLERİ]` geçer, işaretin düşmesi reddedilir), cümle-içi özel ad (`_proper_names`: cümle-ilk token, kısaltmalar, gün/ay adları, tek harfli `I` ve satır başı SDH/konuşmacı öneki sonrası ilk kelime atlanır; `_name_preserved`: birebir veya `Kök'ek` çekimi — `Lizbon'dan` ✓, `Majesteleri` gibi apostrofsuz unvan çekimi büyük harfli hedef tokenında ≥%70 ortak önekle ✓; çıplak `Larson`/`Shen` bozması ✗).
3. **Ek/bağlaç ortasından kesme yakalanmıyordu.** → `part_tail_issue`: son olmayan TR parça `değil/zorunda/ve/emin/çünkü…` gibi devam zorunlu sözcükle bitemez (`acik_baglanti:i`). Liste CI'da daraltıldı: edatlar (`için/gibi/kadar/ile/beri/göre/dolayı/yüzünden`), soru eki (`mi/mı/mu/mü`) ve `de/da/ya/ki` sonda doğal cümlecik kapanışıdır ("Fırtına elektrikleri kestiği için,", "Doğru mu?") — yanlış-pozitif kaynağıydı, çıkarıldı. Yalnız TR hedefinde aktif.
4. **Tekrarlı parça yakalanmıyordu.** → `part_repetition_issue`: farklı kaynağa aynı hedef metin (`tekrarli_part:i`).
5. **Kurtarma aynı promptu tekrarlıyordu ve tekil grupta ikinci denemeye hiç ulaşmıyordu.** `task_once` tam reddedilen grupta istisna atıyor → eski akış `rescue_group`'un RESCUE_SUFFIX dalını ölü kod hâline getiriyordu. → Tek-grup paketleri doğrudan `rescue_group`'a gider; normal deneme `invalid_response`/`empty_response` ile kalırsa (veya kısmen dolarsa) dağıtım kuralları açık `RESCUE_SUFFIX` ile son deneme; o da olmazsa `failure_by_index`, cache'e yazılmaz.
6. **Cue içi ikinci cümle satıra yapışabiliyordu — ve sayılar bölünebiliyordu.** `insert_sentence_breaks` `"3.000"`/`"2.4"` içindeki rakam-arası noktayı cümle sonu sanıp `"3.\n000"` üretiyordu; bu da demirleme kapısını (`sayi_kaydi`) tetikleyip doğru çeviriyi reddediyordu (num-05 CI hatası). → `_numeric_separator` üç `_END_RUN` döngüsüne de eklendi (`sentence_end_count`, `internal_sentence_end_count`, `insert_sentence_breaks`). Kısaltma korunması eskisi gibi; `"Toplantı 5.30'da. Hazır ol."` iki cümle sayılır.

## Değişen dosyalar

- `backend/sentence_translation.py`: `sentence_end_count`, `internal_sentence_end_count`, `_numeric_separator`, `part_tail_issue`, `part_repetition_issue`, `part_anchor_issue` (+ `_proper_names`/`_name_preserved`/`_sdh_issue`/`_edit_distance`/`_common_prefix_len`), `insert_sentence_breaks` yeni; `sentence_part_boundary_issue` kota kuralına çevrildi; `validate_sentence_parts` çıktı parçalarına `\n` ekliyor.
- `backend/transcribe.py`: `part_gate_issue` birleşik kapısı (sıra: sınır → tekrar → açık bağlantı → demir); **üç kabul sitesi** de onu kullanıyor (cache-hit, toplu `task_once`, `refine_task`); `task_once` `prompt_suffix` parametresi; `RESCUE_SUFFIX` + `rescue_group` (tek-grup paketleri rescue akışına bağlandı); prompt'a 4 satır eklendi (iç cümle istisnası, açık bağlantı yasağı, cue içi `\n`, SDH/özel ad aynı ID).
- `backend/test_sentence_distribution.py`: 26 regresyon testi (yeni).
- `backend/test_golden_corpus.py`: `test_defect_pass_blocking_and_boundary_only` yeni sözleşmeye güncellendi — `expected_blocked` artık 'blocking' denetimi + **gerçek parça kapılarının** bozuk parçalar üzerinde çalıştırılmasıyla hesaplanıyor (isim/SDH/para/birim/tarih kusurları sert kapıya girer; danışman katman kusurları dürüstçe geçer invariant'ı korunur); bloklanan grup maliyeti 1→2 istek (tekil kurtarma + son deneme).
- `backend/test_transcribe.py`: `test_sentence_translation_failed_groups_never_reach_refine` çağrı sayısı 3→4 (ikinci kurtarma denemesi spec gereği eklendi); invariant korunuyor — başarısız grup refine'a asla gitmiyor.

## Önce / sonra (canlı claude-haiku-4-5 koşusu, `/tmp/trdemo/demo.en.srt`)

```
Kaynak: "Wait. Are you sure" / "you want to come with me?"
Önce:  "Bekle." dağıtımı erken-sonu kapısında reddedilirdi
        (veya "Bekle. Emin misin" tek satıra yapışırdı)
Sonra:  cue 1 → "Bekle."   cue 2 → "Benimle gelmek istediğinden emin misin?"
        (spec'teki istenen örnekle birebir aynı dağıtım)
```

İkinci canlı koşu (revize kapılarla): "The vault held 3,000 coins." → "Hazine 3.000 madeni para içeriyordu." (sayı bölünmeden korundu); "Your Majesty already spoke." → "Majesteleri zaten konuşmuştu." (unvan çekimi kabul); "Dr. Chen"→"Chen" korunur ama "Chen"→"Shen" reddedilir.

İlk canlı çıktılar: "I have to find her / before it is too late." → "Onu bulmam gerek / zamanı kalmadan."; 3-cue soru → "Gerçekten / başarabileceğimizi / düşünüyor musun?"; "He met Dr. Lawson / at the station." → "Dr. Lawson'u / istasyonda karşıladı." (özel ad + kısaltma korundu).

## Çalıştırılan testler

- `venv/bin/python backend/test_sentence_distribution.py` → **26/26** (tüm listedeki senaryolar + rakam-ayraç, edat-kapanışı, ad çekimi).
- `venv/bin/python backend/test_transcribe.py` → **192/192** regresyon temiz.
- `venv/bin/python backend/test_golden_corpus.py` → **6/6** (56 girdili sözleşme paketi: golden cevaplar 0 retle kabul, `names/sdh/cur/unt/dat` kusurları sert kapıda bloklanır, `meaning/register/context` danışmanı dürüstçe geçer).
- Canlı uçtan uca (claude-haiku-4-5, shuaiapi): `--translate-only` ile 9 blok, 2 istek (1 eksik grup tekil kurtarmada alındı), `untranslated=0, failed=0`; ikinci 4-blok koşu spec örneğini birebir üretti.
- `npm test` bilinçli olarak tekrarlanmadı (talimat); JS tarafı dokunulmadı. PR CI'ı tam koşuyor.

## Dürüst sınırlar

- Dağıtım noktası yine modele bağlı — kapılar yapısal/açık ihlalleri reddeder ama iki geçerli durak arasından "en doğalını" seçmek modelin işi; ret durumunda tekil kurtarma + sert prompt devreye girer.
- Özel-ad korunması kural-tabanlıdır: birebir yazım, `Kök'ek` çekimi (ilk 2 harf + ≤2 edit mesafesi) veya büyük harfli hedefte ≥%70 ortak önek kabul edilir. Apostrofsuz egzotik biçimler (`Persephone`→`Persefone` tarzı serbest transliterasyon) reddedilir — kasıtlı muhafazakârlık: `Larson` gibi bozma yakalanır.
- `part_tail_issue` liste tabanlıdır; nadir açık bağlantılar (ör. "…göre" bitişleri farklı eklerde) geçebilir; yanlış-pozitif riski düşük tutuldu (yalnız TR, yalnız son-olmayan parça, yalnız bilinen devam-zorunlu sözcükler).
- "Semantic retime" (kelime zamanlarıyla gerçek cümle başlangıcına taşıma) bilinçli YAPILMADI — gereksinimde ayrı/açık seçenek isteniyor; varsayılan timestamp korunur.
- Anlam kalitesi ("Onu bulmak zorundayım / o çok geç olmadan" gibi kelime-kelime ama yapısal geçerli çıktı) mekanik kapıyla reddedilemez; savunma bütün-cümle çevirisi + anlam kapıları. Bu tarz çıktı ancak prompt/işaret seviyesinde caydırılır.
- Kalite raporu canlı koşuda blok 6'da `modal_mismatch` gölge-uyarısı verdi ("can make it" → modal yumuşadı) — bilinen sınır, hard-reject değil.
