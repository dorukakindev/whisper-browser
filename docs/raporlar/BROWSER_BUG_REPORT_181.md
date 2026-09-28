# BROWSER_BUG_REPORT_181 — R222 devam turu: echo-kabul ölü yol, .partial yanlış-pozitif, sıra sayısı kapısı

Tarih: 2026-09-30 · Dal: `codex/r222-electron-translate-1790625177` · İlgili: PR #152, rapor 179/180

## Kapsam

Kullanıcının `ceviri-denetimi` harness paketinin kalan betikleri
(`e2e_resume`, `e2e_gates`, `gate_corpus`, `gate_corpus2`, `hang_test`,
`sched_test.js`, `term_cache.js`, `pairing_test.js`, `fuzz_parts.js`,
`live_page.js`, `replace_links2.js`) PR #152 sonrası master+branş
üzerinde koşturuldu; çıkan 2 kalıntının kök nedenine inilip düzeltildi.

## Düzeltilen bulgular

### 1. "Değişmeden kabul" hiç devreye girmiyordu (R220-1'in tamamlanmamış parçası)

`rescue_group` içinde ikinci `task_once` da raise ettiğinde
`except` bloğu `return rec` ile erken çıkıyordu — `echo_seen >= 2`
kabul kontrolü yalnızca ikinci deneme *hatasız dönünce* çalışıyordu.
Saf-yankı gruplar ('Rock and roll!') iki denemede de raise ettiği için
kabul yolu ölü koddu: satır 2 ek istek yakıp yine başarısız sayılıyordu.

**Kanıt:** `e2e_gates` altın korpusu — `("Rock and roll!", "Rock and roll!")`
girdisi beklenen cevabın kendisiyle yankılanıyor; iş `.partial.srt`
ile bitiyordu ve meta.json'da cue `failed`/`untranslated_source` idi.
Ayrıca kurtarma içindeki erken çıkış, ek `RESCUE_SUFFIX` isteğini de
gereksiz ödüyordu.

**Düzeltme:** kabul bloğu `accept_unchanged_echo` yardımcısına çıkarıldı
ve kurtarma fonksiyonunun üç çıkış noktasına da bağlandı — ilk kurtarma
turundan hemen sonra (echo_seen≥2 ise üçüncü istek ödenmez), ikinci
denemenin `except`'inde ve normal dönüş sonrasında.

### 2. Bilinçli değişmeden kalan satırlar işi `.partial` yapıyordu

`compute_translation_quality_report` çıktıyı yeniden tarayıp kaynakla
aynı görünen metni `untranslated_source` sayıyor ve
`translation_failed_count`'a ekliyordu. Echo-kabul, `line_keeps_source`
ile API'siz korunanlar ve kullanıcının önceden çevrilmiş satırları
hep bu sayıma düşüyordu — tamamlanan iş `.partial` uzantısıyla ve
meta.json'da `status:"failed"` ile yazılıyordu.

**Düzeltme:** `status_out` artık `unchanged` ve `precompleted` index
setlerini taşıyor; iki finalize sitesi kalite `issue_indices`'ten bu
setleri muaf tutuyor. `accept_unchanged_echo` kabul ettiği grubu
`unchanged_idx`'e ekliyor.

### 3. Türkçe sıra sayıları cümle sonu sanılıyordu

`_numeric_separator` yalnızca rakam-rakam arasındaki noktayı koruyordu
(`3.000`, `2.4`). `'21. yüzyıldayız.'` cümlesinde `21.` ikinci cümle
sonu sayılıp `part_kapisi_fazla_cumle_sonu` doğru çeviriyi reddediyordu.

**Kanıt:** `gate_corpus2` — `("It's the 21st century." → '21. yüzyıldayız.')`
tek blok koridorunda `1/20` yanlış-ret kalıntısı.

**Düzeltme:** rakam+nokta, ifade/parça başındaysa ('21. Yüzyılda…' —
öncesinde kapanacak cümle yok) ya da küçük harfle devam ediyorsa
('3. sınıf', 'Onu 3. kez denedi') cümle sonu sayılmaz. Büyük harfle
devam eden ara konum hâlâ sayılır (muhafazakâr).

## Harness sonuçları (bu tur)

| Betik | Sonuç |
|---|---|
| `e2e_resume.py` | eksikleri-tamamla tam bağlamla: 2 istek, korunan satırlar ('senin', 'İyi geceler.') olduğu gibi kaldı |
| `e2e_gates.py` | `corpus.tr.srt` (partial YOK), 6 istek, meta'da 0 failed |
| `gate_corpus.py` | 1/81 — 'Rock and roll!' artık **kabul** (audit'in naif echo sayacı beklenen=eşit çıktıyı sayıyor; meta `completed`) |
| `gate_corpus2.py` | 0/20 tek blok + 0/13 çok-cue — tamamen temiz |
| `hang_test.py` | timeout=1sn ölçekli: paket başına 3 HTTP isteği, sınırlı |
| `sched_test.js` | 8/8 — geç yanıt, kalıcı parse (istek=3), 503 kesici, duraklatma, iptal, 20k-cue seek maliyeti |
| `term_cache.js` | terminoloji açıkken 2. izleme 33/60, 3. izleme 26/60 istek |
| `pairing_test.js` | aynı-aralık cue eşleşmesi doğru |
| `fuzz_parts.js` | 20.000 iterasyon "sorun yok" |
| `live_page.js` | 30sn gözlem: 30 otomatik devam, 40 yeni blok |
| `replace_links2.js` | replace + bilingual modlarda üst-blok birleşimi doğru |

## Kalan sınır

- `gate_corpus`'un `1/81` sayımı yalnızca denetim çıktısı — beklenen
  çevirisi kaynakla aynı olan satır doğru korunuyor; sayaç bunu
  ayırt edemiyor. meta.json `completed` doğrulandı.

## Testler

- `backend/test_sentence_distribution.py`: 39/39 (yeni
  `test_ordinal_not_sentence_end` + `test_dialogue_echo_accepted_after_two_rounds`)
- `backend/test_transcribe.py` 203/203, `test_golden_corpus` 6/6,
  `test_translate_pipeline_r220` 23/23, `test_translation_audit` 11/11
- Node: cache, i18n, cue-pairing, page-translate, merged, pair-recovery — geçti
