# Rapor742 — Gerçek metin stüdyosu GPU kabulü ve motor bitiş işareti

## Gerçek zincir
Windows RTX4070SUPER üzerinde başlangıçta10320MiB boş bellek, mevcut9500MiB test önkoşulunu geçti. Başka süreç durdurulmadı. Ayrı uygulama profili, yazılmış112karakter/17kelimelik Türkçe kısa metin ve System.Speech sentetik referans kullanıldı. Kişisel ses/ayar/kitap veya ücretliAPI kullanılmadı. Gerçek Electron arayüz→preload→textVoice→nano-vLLM/VoxCPM2→WAV→geçmiş→ikinci gerçek sentezde Durdur zinciri çalıştı.

İlk deneme9949/9747MiB civarı boş GPU ile başlatılmış olsa da eski aynı metin/tohum önbelleği kullanıldı: günlük1parça/0eksik,7.109sn içinde doğrudan birleştirme. Bu GPU sentezi kabulü değildir. Test yanlış biçimde sentez aşaması beklediği için kırmızı oldu; ürünün meşru önbellek davranışı hata sayılmadı. Önbellek silinmedi. Teste yalnız izole ayarda rastgele taze seed eklendi; yeni üretim gerçek1parça/1eksik yoluyla çalıştı.

## Gerçek koşuda ortaya çıkan ek düzeltme
R741 yalnız cache yolunda bulunan Tum parçalar hazır/birleştiriliyor satırına bağlıydı; yeni nano üretimi bu satırı yazmadan finalize'a geçiyordu. Mevcut motor kodu incelendi: nano son `[N/N]` sayacını parça üretimi bittikten sonra, Torch ise parça üretimi başlamadan önce yazıyor. Aynı kural iki motora uygulanamaz.

- `src/text-voice-studio.js`: nano tamamlanmışson sayaç→postprocess; Torch'ta son sayaç tek başına geçiş yapmaz, döngü sonrası GPU tepe bellek satırı→postprocess. Cache yolunun açık birleştirme satırı da korunur. Dış motor dosyası değiştirilmedi; yeni bağımlılık/protokol/IPC/şema yok.
- `tests/text-voice-studio.test.js`: nano son sayaçtan sonra birleştirme logu olmadan geçiş, Torch son sayaçta henüz geçmeme ve son GPUtepe işaretinde geçiş doğrulandı.
- `tests/electron-text-voice.smoke.js`: gerçek kabulde taze seed, aşama sırası ve sonlu süreler,100e yalnız hazır çıktı, tam FFmpeg decode, sonraki gerçek iş iptalinde önceki WAV SHA256 eşitliği. Bu rastgele testseed kişisel ayara yazılmaz, yalnız ayrı profildedir.

## Sonuçlar
[Sanitize edilmiş kabul](evidence742/acceptance.json):

| Ölçüm | Sonuç |
|---|---|
| Gerçek kısa üretim |37.110sn,1parça|
| Başlangıç/model/ref hazırlığı sınırı |20.207sn|
| Gözlenen sentez sınırı |14.693sn|
| Son işlem sınırı |2.159sn|
| Dosya kontrolü |0.000417sn|
| Durum sırası |model_load→synthesis→postprocess→output_check→done|
| Tam FFmpeg decode |exit0|
| İkinci gerçek üretim |sentez başladığı görülünce iptal|
| UI Durdur→cancelled gözlem |185ms|
| Önceki tamamlanmış WAV |SHA256 aynı, geçmişte1kayıt|

Süreler host gözlem sınırlarıdır; model/ref ayrık kernel süreleri değildir. İkinci iş başlangıç/model hazırlığı19.632sn,sentezde0.199sn sonra iptal kaydedildi. Bu metin stüdyosu motoru sıcak tutma başarısı veya uzun kitap benchmarkı değildir.

[Gerçek tamamlandı](evidence742/studio-complete-tr.png) ve [gerçek durduruldu](evidence742/studio-stopped-tr.png) Windows görüntüleri açılarak incelendi. Aynı koşu ENaçık ve480CSS125kontrollerini de geçti. Yeni tasarım eklenmedi; ortak tema korunumu kabul edildi.

`node --test --test-isolation=none tests/text-voice-studio.test.js tests/preload-sandbox.test.js`:3PASS/0skip. JSsyntax/diffPASS. Gerçek GPU koşusu exit0; unit testler motor işaretlerini eklediğimiz son test değişikliğinden sonra tekrar geçti. Tam CI beklenmedi ve kapatılmadı.

## Kaynak ve sınırlar
Kurulu nanovllm_oku.py/kitap_voxcpm.py günlüklerinin yerleri okundu; önceki R741'deki Nodechild_process sözleşmesi ve mevcut tek-sahipli akış kullanıldı. Harici kod alınmadı. Testin ilk cache koşusu başarısız GPU kabulü olarak açık tutuldu; son koşu yeni tohumla eksik parçayı üretti.

İnsan dinleme/ASRanlam puanı, gerçek insan referansı, uzun/çokparçalı üretim, doğalOOM/sonparçatakılması, ayrıTorchGPU,YouTube/DRM,ana start.bat etkileşimli kabulü bu turda yok. Ürünün tüm ses kalitesi tamamlandı denmez.11before-quitlistener ve bilerek kapalı dış ağ filtre uyarısı sürer. Model örnekleri/kişisel profil/ham engine yolları Git'e eklenmedi. P007/P041/P046/P047 gerçek kısa metin yolu için mevcut-doğrulandı/kısmi;90hedef sürer,müzik kapsam dışı.
