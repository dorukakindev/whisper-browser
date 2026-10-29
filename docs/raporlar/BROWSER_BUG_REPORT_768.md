# Rapor768 — Gerçek arka plan ayırma kalite ölçümü

P056 için yeni kanıt; R696 seçili aralık/süreç doğrulamasının tekrarı yeni bug sayılmadı. Ürün kodu, model ve varsayılanlar değişmedi. Başlangıç ve bitiş ürün kimliği `7ac2203dbe34e830c9848cae1b87ad322e1bc4e6`.

## Yöntem

Windows kurulu audio-separator0.47.0 ve önceden indirilmiş UVR_MDXNET_KARA_2.onnx ile gerçek üretim `prepare_background.py` çalıştırıldı. Microsoft Tolga ile daha önce üretilmiş sentetik Türkçe konuşma ve kendimiz oluşturduğumuz deterministik üç sesli akor/perküsyon karışımı kullanıldı. Özel video, ticari müzik veya kişisel ses yok. İki farklı konuşma/müzik kazancı; 12s kaynakta yalnız2–8s ayrıldı. [Fixture](BACKGROUND768_2026-10-29/fixture.py) mevcut sentetik referans WAV gerektirir; tek başına kaynaksız yeniden üretim değildir. [Ölçüm betiği](BACKGROUND768_2026-10-29/measure.py), [tam sonuçlar](BACKGROUND768_2026-10-29/measurement.json), [gerçek süreç sonuçları](BACKGROUND768_2026-10-29/run.json).

| Karışım | Süre | Konuşma projeksiyonu | Müzik projeksiyonu | Açıklanamayan enerji oranı |
| --- | --- | --- | --- | --- |
| Konuşma ağırlıklı |12.234s|−50.999dB|−3.499dB|0.1490|
| Müzik ağırlıklı |5.672s|−41.644dB|−8.195dB|0.0155|

Her iki ayırıcı alt sürecinin gerçek exit kodu0; extract/separate/separate_gpu/ready olayları görüldü. Çıktı44100Hz stereo ve tam6s; FFmpeg tam decode exit0, clipping oranı0. GPU aşama olayı her ONNX düğümünün GPU'da çalıştığını kanıtlamaz. İşlenmemiş karışım taban çizgisinde konuşma/müzik katsayıları yaklaşık0dB ve residual yaklaşık0; ölçüm bilinen karışımı geri buluyor.

## Yorum ve sınırlar

Ölçüm bilinen hizalı stem'lere en küçük kareler projeksiyonudur; SI-SDR, algısal kalite veya duyulabilir kelime oranı değildir. Çıktı kazancı, faz değişimi ve doğrusal olmayan bozulma katsayıları etkiler. Konuşma bileşeninin düşük korelasyonu konuşmanın kesinlikle işitilmediği anlamına gelmez. Müzik seviyesi korunmuş varsayılamaz; özellikle −8.2dB fark ve ilk örnekte residual0.149 dikkate alınmalıdır. İşaret/gain düzeltmesiyle skor güzelleştirilmedi. Temiz sinüzoid testi yerine gerçek sentetik konuşma kullanıldı fakat doğal insan konuşması, gerçek müzik ve kalabalık ortam hâlâ kabul kapsamı dışıdır. P056 **Kısmi**, tamamlandı değildir. İnsan dinlemesi ve gerçek çoklu ortam karşılaştırması sonraki kabul koşuludur; bu örnekten genel model değişimi çıkarılmadı.

[Upstream MDX kodu](https://github.com/nomadkaraoke/python-audio-separator/blob/main/audio_separator/separator/architectures/mdx_separator.py) normalize/demix/compensate ve stem yazım yolları incelendi. Referans amaçlı; dış kod kopyası, yeni bağımlılık veya yükseltme yok. İncelenen main kaynak, kurulu0.47.0 ile birebir aynı revizyon kabul edilmedi.

## Kontroller

`backend/venv/Scripts/python.exe backend/test_background_measurement.py`:2PASS. Ölçüm CLI iki kez exit0; FFmpeg iki çıktı tam decode exit0. Ürün/UI değişmediği için tam npm test, yeni UI kabulü veya start.bat açılışı yapılmadı. Uzun CI beklenmez. Sesler yalnız ignore edilen tmp altında; Git'e WAV, kişisel profil veya ham log alınmadı. Ana kopyadaki kişisel değişiklikler teslim dışıdır.
