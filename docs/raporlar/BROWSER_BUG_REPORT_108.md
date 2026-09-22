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

## Gerçek kök nedenler (bulunan 5 eksik)

1. **`sentence_part_boundary_issue` fazla katıydı.** Kural: "son parça dışında hedef cümle sonu yasak." Kaynak parça gövdesinde tam cümle barındırıyorsa ("Wait. Are you sure") istenen çıktı "Bekle." reddediliyordu. → Kural kota'ya çevrildi: hedef parçanın cümle-sonu sayısı ≤ kaynak parçanınki.
2. **Parça-seviyesi demirleme yoktu.** Sayı/özel ad/SDH kontrolü yalnız grup bütününde yapılıyordu; "2.4" veya "Lawson" başka cue'ya kayabilirdi (konuşma anından kopma). → `part_anchor_issue`: parça başına sayı (`_number_preserved`, yazıyla da sayılır), para/birim/tarih alt-kümeleri, `[..]` SDH işareti, cümle-içi büyük harfli özel ad.
3. **Ek/bağlaç ortasından kesme yakalanmıyordu.** → `part_tail_issue`: son olmayan TR parça `değil/mi/zorunda/ve/emin…` gibi devam zorunlu sözcükle bitemez (`acik_baglanti:i`). Yalnız TR hedefinde aktif.
4. **Tekrarlı parça yakalanmıyordu.** → `part_repetition_issue`: farklı kaynağa aynı hedef metin (`tekrarli_part:i`).
5. **Kurtarma aynı promptu tekrarlıyordu.** Tekil grup kurtarması kalite kapısında kalırsa ikinci deneme yoktu. → `rescue_group`: normal tekil denemeden sonra hâlâ eksikse `RESCUE_SUFFIX` (dağıtım kuralları açık) ile son deneme; o da olmazsa `failure_by_index` ile başarısız işaretlenir, cache'e yazılmaz.
6. **Cue içi ikinci cümle satıra yapışabiliyordu.** `wrap_text` dosya yazımında `\n` koyuyordu ama canlı panel/parça metninde aynı garanti yoktu. → `insert_sentence_breaks` `validate_sentence_parts` içinde uygulanıyor → kabul edilen tüm yollarda parçaya gerçek `\n` düşer.

## Değişen dosyalar

- `backend/sentence_translation.py`: `sentence_end_count`, `internal_sentence_end_count`, `part_tail_issue`, `part_repetition_issue`, `part_anchor_issue`, `insert_sentence_breaks` yeni; `sentence_part_boundary_issue` kota kuralına çevrildi; `validate_sentence_parts` çıktı parçalarına `\n` ekliyor.
- `backend/transcribe.py`: `part_gate_issue` birleşik kapısı (sıra: sınır → tekrar → açık bağlantı → demir); **üç kabul sitesi** de onu kullanıyor (cache-hit, toplu `task_once`, `refine_task`); `task_once` `prompt_suffix` parametresi; `RESCUE_SUFFIX` + `rescue_group`; prompt'a 4 satır eklendi (iç cümle istisnası, açık bağlantı yasağı, cue içi `\n`, SDH/özel ad aynı ID).
- `backend/test_sentence_distribution.py`: 24 regresyon testi (yeni).

## Önce / sonra (canlı claude-haiku-4-5 koşusu, `/tmp/trdemo/demo.en.srt`)

```
Kaynak: "Wait. Are you sure" / "you want to come with me?"
Önce:  "Bekle." dağıtımı erken-sonu kapısında reddedilirdi
        (veya "Bekle. Emin misin" tek satıra yapışırdı)
Sonra:  cue 3 → "Bekle."   cue 4 → "Emin misin benimle gelmek istediğinden?"
        (parça 0'da kaynak iç cümlesi olduğu için kota izin verdi)
```

Diğer canlı çıktılar: "I have to find her / before it is too late." → "Onu bulmam gerek / zamanı kalmadan."; 3-cue soru → "Gerçekten / başarabileceğimizi / düşünüyor musun?"; "He met Dr. Lawson / at the station." → "Dr. Lawson'u / istasyonda karşıladı." (özel ad + kısaltma korundu).

## Çalıştırılan testler

- `venv/bin/python backend/test_sentence_distribution.py` → **24/24** (tüm listedeki senaryolar: 2-cue, iç cümle, 3-cue soru, Dr./Mr./U.S., üç nokta, `?` sonrası cümle, sayı+birim, özel ad, olumsuzluk/modal, SDH, aynı-satır yasağı, id kayması, bütün-uyuşmazlık, cache'e-bozuk-yazmama, artan girdi dedupe).
- `venv/bin/python backend/test_transcribe.py` → **192/192** regresyon temiz.
- Canlı uçtan uca: `--translate-only` ile 9 blok, 2 istek (1 eksik grup tekil kurtarmada alındı), kalite raporu `untranslated=0, failed=0`.
- `npm test` bilinçli olarak tekrarlanmadı (talimat); JS tarafı dokunulmadı.

## Dürüst sınırlar

- Dağıtım noktası yine modele bağlı — kapılar yapısal/açık ihlalleri reddeder ama iki geçerli durak arasından "en doğalını" seçmek modelin işi; ret durumunda tekil kurtarma + sert prompt devreye girer.
- `part_tail_issue` liste tabanlıdır; nadir açık bağlantılar (ör. "…göre" bitişleri farklı eklerde) geçebilir; yanlış-pozitif riski düşük tutuldu (yalnız TR, yalnız son-olmayan parça, yalnız bilinen devam-zorunlu sözcükler).
- "Semantic retime" (kelime zamanlarıyla gerçek cümle başlangıcına taşıma) bilinçli YAPILMADI — gereksinimde ayrı/açık seçenek isteniyor; varsayılan timestamp korunur.
- Anlam kalitesi ("Onu bulmak zorundayım / o çok geç olmadan" gibi kelime-kelime ama yapısal geçerli çıktı) mekanik kapıyla reddedilemez; savunma bütün-cümle çevirisi + anlam kapıları. Bu tarz çıktı ancak prompt/işaret seviyesinde caydırılır.
- Kalite raporu canlı koşuda blok 6'da `modal_mismatch` gölge-uyarısı verdi ("can make it" → modal yumuşadı) — bilinen sınır, hard-reject değil.
