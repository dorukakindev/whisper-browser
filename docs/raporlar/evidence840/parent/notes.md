# R840 — Ana inceleme: sahne sözleşmesi ve karşı örnekler

HEAD `f3713c9fe7855f9e9a92bab5fcf65e2d5a69a74d`. Ürün/test/ayar değiştirilmedi. [probe.py](probe.py), [kontrollü sonuç](speech-result.json), [ilgili eski senaryo imzaları](registry-reviewed.json).

## F840-04 — Rol incelemesi gerçek sahne sınırlarını yeniden kullanmıyor

`transcribe.py:4351–4352` gerçek `translate_scene_gap` ile `detect_scene_boundaries` çağırır. `sentence_translation.py:2115–2144` özel sessizlik eşiğini ve INT./EXT. işaretini tanır. `speech_relations.py:43–46` aynı kaynak grupları için yalnız literal 8 saniyeden sahne numarası yeniden üretir; özel eşik ve mekan işaretini taşımaz. Prompt sahneler arasında zamir çözülmemesini isterken farklı sahneler aynı etiketle gönderilebilir.

Gerçek `llm_translate` içinden iki cue: 0–2 ve5–7 saniye; `translate_scene_gap=2`. Ana fonksiyon break `[1]`; bağımsız rol isteği `scene:[0,0]`. Varsayılan8 kontrolünde break `[]`, aynı `[0,0]` doğrudur. Ayrı kontrol: varsayılan8, ikinci cue `EXT. GARDEN.` ile açılır; ana break `[1]`, rol yine `[0,0]`. Aynı kökün iki tetikleyicisidir. Ağ taşıması sentetik; kaynak gruplama, paketleme, çağrı üretimi ve rol kodu gerçek. Kontrollü cevaplar doğru metni döndürür; canlı modelde yanlış çeviri ölçülmedi. İki cue da sonuçta korunur, warnings `[]`.

Kök tabanda da vardır; ba04414f bu fonksiyona giren riskli cümleleri çoklu şahıs göndermesine genişletir. Literal8 satırının bu commit'te eklendiği iddia edilmez. R734 ayrı rol incelemesini ve8sn tasarımını anlatır; gerçek caller sahne sınırıyla çelişkiyi raporlamaz. R815-B41/B70 cache bağlamı farklı mekanizmadır. R829 Q11/Q13 ile genişleyen akışta yeni doğrulanmış sözleşme hatası; P2. Kabul: caller'ın sahne kimlikleri/sınırları rol çağrısına korunarak taşınır; özel eşik ve mekan işaretinde `[0,1]`; varsayılan kontrol `[0,0]`; bir sahnenin komşusu diğerine bağlam diye eklenmez.

## Çalıştırılan kontroller

- `backend/venv/Scripts/python.exe docs/raporlar/evidence840/parent/probe.py`: exit0; mevcut hatalı metadata + güvenli karşı örnekler doğrulanır, düzeltme başarısı değildir.
- Aynı komut `--expect-correct` ile: **beklenen exit1**, `Caller splits scenes but role request merges both into scene 0`. Düzeltilmiş davranışı isteyen assertion kırmızıdır; repo regresyon testlerinin başarısızlığıyla karıştırılmaz.
- `backend/venv/Scripts/python.exe backend/test_speech_relations.py`: mevcut14 test exit0. Test dosyası değiştirilmedi; yeni özel eşik/mekan eşleşmesi bu14 testte yoktur.
- Standards ajanı aynı üretim probunu bağımsız tekrar çalıştırıp root/dedup yorumunu doğruladı; [inceleme](../standards/notes.md).

Son bağımsız rapor incelemesi, probun ilk halinde `--expect-correct` öncesinde koşulsuz yanlış-davranış assertion'ları bulunduğunu yakaladı. Yalnız bu rapor probunda iki mod ayrıldı: normal mod mevcut `[0,0]` kusurunu, correctness modu `[0,1]` sözleşmesini bekler. Çelişkili assertion kaldırıldı; ürün/test dosyası değişmedi. Son sürüm normal mod exit0, correctness modu beklenen exit1 ile yeniden yürütüldü. Bu kanıt düzeltmesi altıncı ürün bugı diye sayılmadı.

## Çürütülen ilk hipotez

“Riskli ve normal cümleler ayrı paketlenince aradaki ELIF öncülü kaybolur” varsayımı üretim yolunda **çürüdü**. `pack_sentence_groups` ardışık olmayan kaynak gruplarını ayırıyor. Beş cue'lu gerçek zincirde iki ayrı rol isteği oluştu; ikinci istekte ELIF var. Aynı bölüm tek başına işlendiğinde de ELIF korunuyor. Bu varsayım bug/öneri sayısına eklenmedi; helper'ı üreticiyle birlikte çalıştırmak yanlış pozitiften korudu.

## Kanıt taşınabilirliği önerisi (ürün bugı değil)

R839'un commit öncesi raw snapshot'ı12 dosya hash'i içerir. Windows Git checkout LF→CRLF dönüşümünden sonra raw eşleşme0/12, LF normalizasyonuyla11/12 ölçüldü; karma satır sonlu DEVIR indeksi ayrı durumdur. Bu, geçmiş snapshot'ın alındığı anda yanlış olduğu veya içerik kaybolduğu iddiası değildir. [Ölçüm](hash-portability.json). Metin için açık `canonical-lf-utf8`, binary için raw-byte hash politikası gelecekteki denetimleri yeniden üretilebilir yapar. R838/R839'a dokunulmadı; bu rapor metin manifestinde hash modu açık tanımlanır.
