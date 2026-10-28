# Rapor 714 — Türkçe koşullu olumsuzluk ve gerçek sıcak motor kabulü

Başlangıç `a0e850b82de8dd26931bbaa827c558abe442121a`; ürün/test bitişi `6feae2258476c5e83de8381e46b19dfa47c5c044`. Dal `codex/speech-matrix714`. Kanıtlar [SPEECH714](SPEECH714_2026-10-28/summary.json). Müzik kapsam dışı; 90 hedef sürer.

## Doğrulanan tek kök hata, iki etkilenen kapı
“Yarın toplantıya **gelmezsen** bu önemli dosyaları sana ayrıca e-posta üzerinden göndereceğim.” cümlesindeki olumsuz koşul, **gelirsen** olarak tersine döndürüldü. Eski Python speech_check benzerlik0,9167, semantic_mismatch=false, review=false verdi. Eski Node safeShortening de natural=true ile bunu kabul etti. Başlangıç commit'inin gerçek modülleri salt okunur git show ile yüklenip [Python önce/sonra](SPEECH714_2026-10-28/guard-proof.json) ve [Node önce/sonra](SPEECH714_2026-10-28/rewrite-proof.json) yeniden üretildi. Son kod ikisini de reddeder.

Geçmiş zaman “açmadım→açtım” ve “onaylamadım→onayladım” zaten semantic_mismatch ile reddediliyordu; lost_negation alanı false olsa da review=true. Bunlar yeni bug diye sayılmadı. Gerçek boşluk, mevcut sınırlı kök sözlüğünün -mazsa/-mezse koşul çekimlerini ve -amazsa/-emezse yeterlik olumsuzluğunu tanımamasıydı.

## Değişiklikler
- `src/dub-text-guard.js` ve `tools/voxcpm2/dub_quality.py`: aynı sonlu koşul eki dalı iki korumaya eklendi. Gelmezsen/gelmezsek/yapmazsan/bakmazsanız/gelmezseler/gelmezse ve okuyamazsan/veremezsem gibi yeterlik biçimleri, iki yönde anlam tersine dönmesine karşı korunur. Var olan fiil kök sözlüğü kullanılır; her -ma/-me kelimesi olumsuz sayılmaz.
- `cached_record`: daha eski passed/ready kaydında saklı recognizedText varsa güncel speech_check ile yeniden değerlendirilir. Yeni kapı reddederse review'a düşer; eski review yükseltilmez, unchecked kayıt değiştirilmez, ses veya sidecar diske yeniden yazılmaz. pronunciationText varsa gerçek seslendirilen metin, numeric_reference olarak özgün metin kullanılır. Toplu cache silme/anahtar yükseltmesi veya GPU yeniden üretimi yok. Geçmişte zaten dışa aktarılmış kalite dosyaları kendiliğinden değiştirilmez; bu kontrol sonraki cache kullanımında çalışır. ASR kanıtı olmayan eski kayıtlara yeni tanıma başarısı atfedilmez.
- İki mevcut test dosyası genişletildi; ürün dört dosyada değişti. Yeni bağımlılık, ayar, IPC veya UI yok.

## Gerçek ses matrisi — mevcut davranış doğrulaması
7 sentetik SRT satırı → 6 akıcı grup. İlk “Evet.” yakındaki aynı anlatıcı cümlesiyle [1,2] grubuna girdi; tireli son replik ayrı kaldı. İlk beş grup 58,422sn içinde gerçek CUDA/VoxCPM2/nano-vLLM ile üretildi. 12 kişi, 3 kilometre, eksi5; “açmadım/çıkmadı”; ardışık iki cümle ve kısa tireli replik sınandı. Hepsi mevcut ASR kapısında ready; iki grup R713 isolated kurtarmasıyla geçti. Tanımada “Toplam→Taplam” ve “Anahtarı→Anahtar” farkları var: ready, kusursuz insan sesi veya tüm dilbilgisel anlamın doğrulandığı iddiası değildir.

Yeni koşul cümlesi eklenince beş ses cache'den korundu, yalnız altıncı grup üretildi. “Gelmezsen” ASR'de korundu,0,9167/ready; e-posta→A posta farkı raporda açık. Güncel kapı önceki beş gerçek ASR kaydını da yeniden kontrol etti, yeni yanlış ret çıkmadı. Son toplam6ready; hızlandırma/kesilme/taşma0. İnsan dinleme, gerçek iki konuşmacı ses kimliği veya genel başarı oranı yok. [Plan](SPEECH714_2026-10-28/plan.json), [ASR kanıtı](SPEECH714_2026-10-28/quality.json), [süreler](SPEECH714_2026-10-28/phases.json), [sentetik SRT metni](SPEECH714_2026-10-28/synthetic-source.txt).

## Gerçek hazır motor ve referans önbelleği
Aynı üretim EngineSession'ında üç ardışık clone işi, her biri yeni sentetik Türkçe metin:

| İş | Model yeniden kullanımı | Referans yeniden kullanımı | Model hazırlığı | Referans | Toplam |
|---|---|---|---|---|---|
|1|hayır|hayır|11,016sn|1,641sn|25,375sn|
|2|evet|evet|0,000sn|0,000sn|7,687sn|
|3|evet|hayır|0,000sn|0,187sn|11,203sn|

Üçünde ASR1,0/ready. Üçüncü referans aynı sentetik utterance'ın yüzde80 genlikli WAV'ıdır: değişen byte kimliği önbelleği yenilerken modelin korunması kanıtlandı; farklı insan konuşmacı kimliği testi değildir. [Ham temiz olay/kalite özeti](SPEECH714_2026-10-28/warm-engine.json). EngineSession.close başarıyla döndü; en yüksek VRAM ve uygulamanın gerçek keep-ready menüsünden uzun boşta kalma ölçülmedi. CPU/GPU aşama süreleri paralel işlerde örtüşür; toplam süre elde etmek için toplanmaz.

## Kontroller ve yeniden üretme
- Python `test_dub_quality.py`:12 PASS; yeni koşul çekimleri iki yönde, aynı metin kabulü ve eski cache kanıtının ses değiştirmeden reddi.
- Python `test_dub_generation_quality.py`:23 PASS; `test_dub_finish.py`:23 PASS.
- Node `dub-text-guard.test.js` + `dub-service.test.js`:2 test dosyası PASS (ilk dosyada çoklu assert). Python/JS syntax, diff ve belge indeksi PASS.
- İlk kırmızı koşuda yeni testin json import'u eksikti; test hazırlığı düzeltildi, ürün bugı sayılmadı. Node salt okunur git alt süreci ilk sandbox'ta EPERM verdi; yetkili tekrar aynı eski/yeni modülü doğruladı. Ret/başarı ölçütleri gevşetilmedi.
- Gerçek CLI: mevcut `tools/voxcpm2/altyazi_oku.py`, sentetik SRT, mevcut sentetik reference.wav + doğru English transcript; `--mode hifi --seed 42 --steps 15 --cfg 1.65 --temperature 0.8 --eszamanli 2 --verification detailed --verify-python <backend Python> --timing-mode video --gruplama akici --grup-max-karakter 280 --grup-max-sn 18` (argüman adı ve değeri ayrı token). VOXCPM_ROOT kurulu motoru gösterir. Yerel tmp/speech714 generation günlükleri; tmp/warm714.py/acceptance.json üç işin gerçek sürücüsü ve sonuçlarıdır, kişisel ses yok.

## Kaynak incelemesi ve sınırlar
[Zemberek TurkishMorphotactics gerçek kaynak kodu](https://github.com/ahmetaa/zemberek-nlp/blob/master/morphology/src/main/java/zemberek/morphology/morphotactics/TurkishMorphotactics.java) ve [Apache2.0 lisansı](https://github.com/ahmetaa/zemberek-nlp/blob/master/LICENSE) incelendi. Fiil olumsuzluğu/koşul morfemlerini ayrı tutma yaklaşımı karşılaştırıldı; Java analiz motoru veya sözlük kopyalanmadı, yeni bağımlılık eklenmedi. Önce yanlış resource yolu404 çıktı; başarılı Java kaynağı esas alındı. Mevcut nano-vLLM/EngineSession ve akıcı gruplama kodu tekrar kullanıldı. Bu küçük sonlu kural tam Türkçe morfolojik/semantik çözümleyici değildir; kök listesi dışındaki fiiller garanti edilmez.

Windows'ta gerçek CUDA ve Türkçe dosya yolu kullanıldı. UI değişmedi, ekran testi tekrarlanmadı. start.bat/install/DRM/gerçek YouTube/kişisel referans/insan dinleme/gerçek OOM/idle expiry kapsam dışı. Uzun CI beklenmez. GPU referans/model dosyaları ve kişisel uygulama ayarları değiştirilmedi; yalnız sentetik türev referans üretildi. Normal PR/merge ve ana kopya güncellemesinde kullanıcı dosyaları korunur.
