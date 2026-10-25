# Rapor592 — Claude araştırma taslaklarının bağımsız kabul incelemesi

## Kapsam ve karar

Kaynak snapshot: `aec95756aa301b615877674df9da536e05f5d630`, master. Gelen files.zip 15dosya içerir: sekiz bağımsız taslak, iki test dosyası, shell koşucusu, patch ve üç belge. Bu, gönderilen kaynak/test paketi üzerinde yapılmış bug/tasarım denetimi değildir. README ve nihai rapor kendi ifadeleriyle depo ağacına erişemediklerini ve entegrasyon yapılmadığını belirtir. Git HEAD/satır temelli uygulama bulguları, gerçek tasarım ekran görüntüleri ve istenen FINDINGS/TASK-MATRIX yok. Araştırma belgesinin tam metni ZIP'te yok; harici Claude artifact bağlantısı bu incelemede açılmadı. Araştırma/repo sayıları ve üçüncü taraf sayısal iddiaları teyit edilmiş sayılmaz.

Karar: patch UYGULANMADI. Ürün kaynakları/testleri değiştirilmedi. Aşağıdaki bulgular teslim edilen taslaklara aittir; Whisper Browser'da yeni doğrulanmış bug diye sayılmaz. Sekiz dosyanın tamamının okunması, mevcut karşılıklarla dar karşılaştırma ve bağımsız uç durum kontrolleri yapıldı. Yeni varsayılan ASR eşiği/kelime zamanlaması/maliyet politikası alınmadı.

## Gerçek çalıştırma

İnceleme klasörü Git dışı `tmp/claude-snippets-review-20261025`; girdi ZIP'i yalnız düz dosyalar olduğu ve CRC sağlam olduğu doğrulanarak oraya açıldı, patch çalıştırılmadı. Python `python -m unittest test_snippets`:18/18 geçti. Node `node --test snippets.test.mjs`:sandbox spawn EPERM nedeniyle ilk çalışmadı, izinli yeniden koşum14/14 geçti. Yerel HTTP fixture dışında API/GPU/model/site çağrısı yok. Bu32test, taslakların yazılmış örneklerini doğrular; uygulama entegrasyonu veya gerçek LLM/ses kalitesi değildir.

Bağımsız Python ve Node uç durumları aşağıda ölçüldü. JSON kanıtları aynı yerel klasörde python-edge-evidence.json ve node-edge-evidence.json; Node probe edge-probe.mjs olarak saklanır. Ürün testlerini tekrar koşmaya gerek olmadığından bu tur npm test/GPU/UI/start.bat koşulmadı.

## Doğrulanmış altı taslak sorunu

| ID | Önem | Dosya/satır | Kanıt ve sonuç | Güvenli yaklaşım |
|---|---|---|---|---|
| S592-01 | Yüksek | whisper_guard_lite.py:72–75 | Tek başına korunan iyi konuşma (`no_speech_prob=.05`), üç boş `.95` segmentle birlikte L1 toplu ortalama yüzünden tamamen atılıyor. Aynı konuşmanın sonucu batch içeriğine bağlı. | Tüm partiyi sessizlik ortalamasıyla silme; segment kanıtı ve kaynak ses kabulü gerekir. |
| S592-02 | Orta | tr_bakeoff.py:46–55 | `score([('', 'tamamen uydurma konuşma')])` WER=0,CER=0 veriyor; sessiz referanstaki eklenmiş konuşma kusursuz sanılıyor. Ayrıca zip(refs,hyps) eşit olmayan liste boylarını sessizce keser (statik ek risk). | Boş referansta insertion sayısını/ölçüm tanımını açık raporla; eşit uzunluk zorunlu olsun. |
| S592-03 | Yüksek | bounded_live_queue.mjs:18–24 | maxAudioSec=5 iken tek30snparça tutuluyor. durSec=0 olan1000adet1KBparça da kuyrukta kalıyor (1024000byte); süre bütçesi bellek sınırı değil. İlk durum orijinal testte özellikle kabul edilmiş. | Süre/örnek/byte/adet üst sınırı, finitepozitif süre doğrulaması, büyük parçayı bölme veya açık ret. |
| S592-04 | Orta | translate_cues.mjs:67 | Aynı id=1 olan A/Biki kaynak için iki geçerli cevap üretildi; Map yalnızTR:Bile tek sonuç tutuyor, ilk çeviri kayboluyor. | Giriş kimliklerini tekilleştirme/doğrulama veya konum+kimlik sözleşmesi; sessiz overwrite yok. |
| S592-05 | Orta | translate_cues.mjs:43,79 | Başarısız ilk çeviri özgün metinleMap'e yazılıyor. Sonraki isteğin context'ine `{src:'untranslated',tgt:'untranslated'}` giriyor. Koddaki 'yalnız kabul edilmiş çiftler' açıklaması sağlanmıyor. | Başarılı çeviri durumunu fallback'ten ayrı izle; özgün fallback'i hedef çeviri diye bağlama katma. |
| S592-06 | Orta | qc.mjs:56 | start=2,end=3cue ve next.start=1.5girdisinde extendedEnd=1.5dönüyor; düzeltme önerisi bitişi başlangıçtan önceye götürüyor. | Örtüşme/sıralama önkoşullarını doğrula; geçerli düzeltme yoksa ayrı sorun döndür, negatif süre üretme. |

Minimal Python kontrolü (inceleme klasöründen):
```python
from types import SimpleNamespace as S
from whisper_guard_lite import guard
from tr_bakeoff import score
speech=S(text='Bugün doktorla görüşeceğim.',start=0,end=3,avg_logprob=-.2,no_speech_prob=.05,compression_ratio=1.1)
silent=[S(text='',start=3+i,end=4+i,avg_logprob=-2,no_speech_prob=.95,compression_ratio=1) for i in range(3)]
assert len(guard([speech]).kept)==1
assert not any(s is speech for s in guard([speech,*silent]).kept)
assert score([('', 'tamamen uydurma konuşma')])=={'wer':0.0,'cer':0.0}
```
Node minimal kontrol:
```javascript
import {BoundedLiveQueue} from './bounded_live_queue.mjs';
import {translateCues} from './translate_cues.mjs';
import {extendedEnd} from './qc.mjs';
const q=new BoundedLiveQueue({maxAudioSec:5});q.pushAudio({durSec:30,pcm:new Uint8Array(1)});
console.log(q.audioSeconds()); //30
const r=await translateCues([{id:1,text:'A'},{id:1,text:'B'}],async({items})=>items.map(c=>({id:c.id,text:'TR:'+c.text})));
console.log(r.translations.size); //1
console.log(extendedEnd({start:2,end:3,text:'example'},{start:1.5})); //1.5
```

## Bizdeki karşılıklar ve alınabilir fikirler

- ASR/halüsinasyon: backend/transcribe.py içinde has_repetition_loop:2209,collapse_repetition:2234,should_skip_hallucination:2286 ve daha geniş bağlamsal kontroller var. no_repeat_ngram_size/condition_on_previous_text zaten motor çağrılarında. Yeni sade wrapper daha iyi olduğunu kanıtlamıyor; zorunlu word_timestamps tüm işlerde ek hesap yaratabilir. Kurulu faster-whisper imzası bu tur yeniden doğrulanmadı.
- Çeviri: backend/translate_planner.py:131–138 adaptif grup/token bütçesini zaten yönetiyor; backend/eval_meaning_loss.py gerçek anlam kaybı korpusunu değerlendiriyor. İskelet çevirici mevcut semantik/sayı/önbellek/iptal sözleşmelerinin yerine konmaz.
- Canlı ses: src/renderer/live-asr-worklet.js:13–16,44–47 bounded in-flight ACK/backpressure ve sabit örnek tamponu kullanıyor. Gelen süresel kuyruk bunun yerine alınmaz. Bu gözlem tüm sistemin kusursuz bellek kanıtı değildir.
- Altyazı QC: src/renderer/timeline-issue-scan.js:29–61 zaten invalid/short/overlap/fast/lines tarar ve finite/zaman sırası kontrolü yapar; yeni ayrıQCotoritesi eklenmez. Mevcut eşikler kullanıcı gereksinimiyle ayarlanabilir; Türkçe için ölçülmemiş17CPS/42karakter varsayılanını küresel dayatmayız.
- Türkçe model A/B: ölçüm fikri yararlı; backend/model_benchmark.py ve var olan ses kalite araçlarıyla tek bir ölçüm akışına eklenmesi, önce sessiz referans/eksik kayıt sözleşmesinin düzeltilmesi gerekir. Bu taslak doğrudan alınmadı.
- OCR kullanıcı önceliği düşük; ocr_merge.py eklenmedi. Harici STT istemcisi bu görevde gerekmiyor; ek endpoint/gizli anahtar yüzeyi açılmadı.

## Eksik teslimi tamamlamak için

Gelen raporun kendisi 'depo dosyalarına erişilemedi' diyor. Claude'a daha önceki 10,31MBkaynak ZIP'ini açıp REVIEW-README ve SNAPSHOTkimliğini okuduğunu teyit ettirerek gerçek dosya yolları/satırlarıyla denetim yaptırmak gerekir. İstenen çıktı: AUDIT-REPORT.md,FINDINGS.json,TASK-MATRIX.csv,REPRODUCE.md,DESIGN-REVIEW.md,RUN-LOG.md. Kaynak erişimi yoksa dürüst statik sınır; tasarım için gerçek render/screenshot gerekir. Mevcut32taslaktesti 'Whisper Browser testleri geçti' diye aktarılmaz. Üçüncü taraf kod alma öncesi kaynak/lisans ayrıca doğrulanmalıdır.

ZIP SHA256: `e5bff50517ba70db465f8cc1a1fd510b52c30da527fe48989c8ea5d0ee05e232`. Orijinal dosyalar değiştirilmedi; yerel materyal ve kanıtlar Git'e konmadı. Bu raporda gerçek yeni ürün hatası0; taslak kabul sorunu6.
