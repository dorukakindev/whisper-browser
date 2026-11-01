# R837 dublaj — salt denetim, 8 öneri, yeni bug yok

Taban HEAD: `9b3f9e462abaebfd1e3a321fcb72e9594b8c7533`. Ürün/test/ayar değiştirilmedi. AGENTS/YENI/güncel devir1325, Night1000 README ve ilgili registry aileleri, R815/R818–836 tarandı. R833 rollback/waveform ve R835 speechEditing/kayıp pasaj kökleri tekrarlanmadı. İlgisiz müzik analizi kapsamı yok.

`node .tmp/audit837-dub/probe.cjs`: gerçek JS mix modeli ve gerçek Python export fonksiyonu; yalnız probe/FFmpeg yürütmesi kontrollü adapter. Gerçek exporter grafiği diske yazılır; sentetik isimler, medya baytı yok. Bu çıktı bir bug reprodüksiyonu veya gerçek FFmpeg/GPU/native UI kabulü değildir. Karşı kontroller mevcut 3 export türünü, 4 katmanlı karışımı, ikinci orijinal ses izini ve harita zaman dönüşümünü doğrular.

Ortam engeli: Node spawnSync Python alt sürecini EPERM ile başlatamadı; ilk koşu sonuç sayılmadı. Ürettiği `export-probe.py`, PowerShell üzerinden doğrudan `& backend/venv/Scripts/python.exe -B .tmp/audit837-dub/export-probe.py 'D:/Whisper Local' 'D:/Whisper Local/.tmp/audit837-dub/output.tmp' | Out-File -LiteralPath .tmp/audit837-dub/graph-result.json -Encoding utf8` ile exit0 çalıştırıldı; ardından Node aynı gerçek fonksiyon çıktısını okuyarak exit0,4kontrol verdi. Tekrar için eski graph-result.json önceden kaldırılmalı veya Python açıkça tekrar çalıştırılmalı; cache dosyası yeni medya kabulü değildir.

## D-G01 — Aynı zaman çizelgesine yerleşmiş bağımsız katmanları dışa aktar

Mevcut: `src/renderer/index.html:3923` audio/video/dual; `backend/dub_export.py:152–173` voice/background/music/ambience önce ayrı filtre düğümlerinde hazırlanır, sonra amix ile birleştirilir. `prepare_background.py` bir instrumental kaynak üretir; bu teslim edilebilir ayrı hizalı stem export özelliği değildir. Yeni davranış: kullanıcı açıkça seçerse voice/background/music/ambience ayrı WAV dosyaları ve aynı örnek hızı/süre/başlangıç makbuzu. Ham kaynak stem ile duck/warp uygulanmış teslim stem'i farklı adla seçilmeli. Kullanım: başka editörde karışım düzeltmek için tekrar TTS gerekmez. Kabul: +2sn sync örneğinde bütün seçili stem'ler aynı final süreye ve doğru yerleşime sahip, dosya olmayan katman 'üretildi' sayılmaz; İptal mevcut dosyayı değiştirmez. R815-G25 mix preflight, R835-G15 bundle hash veya G18 stream fişi yeniden önerilmiyor.

## D-G02 — Final videoya uygun zamanlı isteğe bağlı altyazı teslimi

Mevcut: proje save `dub-workspace.js:68–79` kaynak zamanlı SRT'leri korur; `dub_export.py:174–196` final video/ses map eder, altyazı izi map etmez. Yeni davranış: kullanıcı görüntülenen çeviri veya okunan metni seçerek final MP4'e seçilebilir altyazı izi veya final zamanlı SRT/VTT yan dosyası ekleyebilsin. Kaynak SRT'yi aynen eklemek yeterli değildir; aralık başlangıcı çıkarılmalı, sync at() ile sınırlar dönüştürülmeli. Kabul: 60sn'de başlayan klipte kaynak 61–63 cue'su lokal1–3 olur, +2sn genişlemede haritanın doğru final sınırlarına gider; kaynak dosya değişmez; eklenen altyazı dili kullanıcı onayına dayanır. Mevcut burn-in ve proje subtitle kopyası yeni özellik diye sunulmuyor.

## D-G03 — Konuşma normalizasyonundan ayrı final karışım yüksekliği kontrolü

Mevcut: `tools/voxcpm2/dub_normalize.py:14–36` konuşmayı -20 LUFS/-2TP/LRA11 hedefiyle iki geçişte normalize eder. `backend/dub_export.py:173` final amix'e limiter uygular; bu final karışımın entegre LUFS ölçümü değildir. Yeni davranış: final mix'in ölçülen LUFS/dBTP'sini ve kullanıcı seçerse ayrı teslim hedefini sun; konuşma üretimini yeniden başlatma, ölçüm başarısızlığında sayı uydurma. Kabul: aynı konuşma + sessiz/yüksek BGM iki farklı final ölçüm üretir; seçilen hedefe yapılan exportta süre/sync korunur ve ölçüm final dosyadan tekrar alınır. R701 konuşma normalizasyonu veya R835-G18 stream metadata fişi tekrar değil; müzik içeriği analizi yapılmaz.

## D-G04 — Ayrıştırılmış arka plandaki kalıntı konuşmayı yerinde işaretle

Mevcut: `prepare_background.py` instrumental katman üretir, workspace background volume+mix preview sunar. `measure_background.py:1–4,14–30` yalnız bilinen ayrı konuşma/müzik stem'leriyle kontrollü projeksiyon ölçer; gerçek filmde temiz stem'ler genellikle yoktur. Yeni davranış: kullanıcı seçili zaman aralığını yalnız ayrılmış arka plandan dinleyip 'eski konuşma kalmış / müzik zarar görmüş' notu ekleyebilsin; not exact output/background hash+aralığa bağlı olsun. İnceleme otomatik ayrıştırma başarısı veya TTS yanlışlığı diye puanlanmasın. Kabul: bir işaret yeniden açılan aynı projede aynı aralığa gider; farklı background hash'inde bayat olur; sessizce katman silme veya yeniden model çağrısı yapmaz. Genel insan grup onayı R548/R587'den farklı: konuşma take'i değil arka plan ayrıştırma kalıntısı kontrolü.

## D-G05 — Eklenen müzik/ortam katmanına açık başlangıç, bitiş ve fade ayarı

Mevcut: `dub-workspace-model.js:4–11` sabit kazanç+duck; `dub_export.py:161–165` her ek katmanı sıfırdan keser, gerekirse pad eder. Yeni davranış: yalnız kullanıcının eklediği music/ambience için kaynak başlangıcı, sahneye giriş/çıkış ve kısa fade süresi seçimi. Otomatik kaynak background'u ayrı kalmalı. Kabul: 3sn giriş/7sn çıkış/0.2sn fade sentetik kontrolünde hem preview hem export aynı eğriyi uygular; uzun/negatif/sahne dışı değer ret; sync dönüşümü tek koordinat sözleşmesine bağlı. Yeni otomatik müzik seçimi/analizi veya mevcut duck özelliğinin tekrar sunumu değil.

## D-G06 — Aynı konuşma kaydı için adlandırılmış karışım karşılaştırmaları

Mevcut: `dub-workspace-ui.js:5,59–63` tek aktif mix/layers durumu; proje save bunun bir snapshot'ını korur. Grup take A/B ve önceki konuşmayı dinleme zaten var. Yeni davranış: 'konuşma önde' ve 'kaynak ortam önde' gibi kullanıcı adlandırdığı iki mix snapshot'ını aynı konuşma WAV'ında aynı zaman noktasında A/B karşılaştır; seçim açıkça exporta uygulansın. Kabul: snapshot değişimi TTS/cache/ref ayarı değiştirmez, dinleme zamanı zıplamaz; katman dosyası değişirse snapshot bayat gösterilir; başka projeye taşmaz. Bu yeni voice-take A/B değildir ve otomatik mix kalitesi yargısı üretmez.

## D-G07 — Kaynak videonun HDR/renk dönüşümü için görünür export kararı

Mevcut: `dub_export.py:176–177` sabit libx264/yuv420p transcode; probe yalnız duration+codec_type ister (`:118`). HDR/bit derinliği korunmuş diye ürün iddiası bulunmadığından bug sayılmadı. Yeni davranış: export preflight video color_primaries/transfer/space/pixel formatını okuyup kullanıcıya 'uygun SDR dönüşümü' veya destekleniyorsa 'renk bilgisini koru' seçimi sun; desteklenmeyen durumda açık sınır. Kabul: sentetik HDR metadata girişinde gerçek tonemap/koruma yolu seçimi doğrulanır, final ffprobe beklenen renk alanlarını gösterir; SDR kaynak gereksiz değişmez. Genel codec planı R815-G09'dan dar ama farklı içerik koruma işi: ses codec uyumluluğu değil görüntünün transfer fonksiyonu.

## D-G08 — Konuşmalı aralık ile sessiz sahneler için ayrı, kullanıcı belirlediği duck zarfı

Mevcut: `dub-workspace-model.js:44–53` ve `dub_export.py:94–99` attack0.08/release0.35 sabittir; `speechRanges` gerçek ses etkinliğini zaten kullanır. Yeni davranış: sabit kazanç ve mevcut duck korunarak saldırı/bırakma sürelerini sınırlı aralıkta düzenleme, envelope'u grup civarında görme/dinleme. Çok kısa duraklarda BGM'nin pompalamasını kullanıcı isteğine göre azaltır; yeni VAD veya model gerekmez. Kabul: aynı speechRanges için preview ve render aynı envelope'u üretir; 80ms varsayılan mevcut sonucu korur, kullanıcı seçimi sınırlandırılır, failed gruplar duck tetiklemez. D-G05 katman giriş/çıkış fadesinden farklıdır: bütün katmanın sahne sınırı değil mevcut konuşmaya bağlı dinamik envelope'un kontrolü.

## Sayılmayan adaylar ve sınırlar

`qualityIncomplete`, delivery ve benzer proje alan kayıpları R835-07 ile aynı projeksiyon köküne bağlı, yeni bug sayılmadı. Küçük zaman örtüşmesinin coverage kabulü R835-G20 tekrar. Yerel çok-sesli kaynak seçimi R513 açık sınırı ve R815-G21 önerisi. Manuel take 'dinledim' onayı R548/R587 kapsamı. Telaffuz önizlemesi zaten var. Tüm öneriler tasarım/uygulama kabulü gerektirir; ürün bu tur düzeltilmedi. Gerçek Windows start.bat/install.bat/native UI, FFmpeg medya render, GPU, model/ücretli sağlayıcı, gerçek site veya insan doğallığı kabulü yapılmadı.
