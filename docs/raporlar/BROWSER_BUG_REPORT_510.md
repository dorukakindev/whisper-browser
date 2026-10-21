# Rapor510 — Ses çevirisinde gereksiz kısaltma ve eski sonuç kullanımı

2026-10-21. Başlangıç HEAD:`46fbb20757279bf223c46784f6288d5daa9ff83d`; önceki ürün kodu:`5be0f88033d54a7b88eafa01ca4b2360adeb5088`. Dal:`codex/broad-bugs499`, PR471. Başlangıç temiz. Kod commit'leri:`61d561ab096cc46fde2027e8b60bb1b20e0c25e2` ve bitiş:`9f611c3b72da34ab64b17da4b49136476bfb3cbc`.

## Kullanıcı şikâyeti ve kanıt sınırı

Kullanıcı ses için çeviri çıktısının kötü olduğunu bildirdi. İncelenecek video/SRT adı veya kötü cümleler asenkron soruldu; bu teslim hazırlanırken yanıt gelmedi. Yerel dosyalarda eski tarihli bir speech örneği bulundu ancak kullanıcının kastettiği sonuç olduğuna dair kanıt yok; o dosyadan güncel çeviri kalitesi sonucu çıkarılmadı. Gerçek son kötü çıktı görülmüş/düzeltilmiş iddiası yok. Aşağıdaki hatalar doğrudan istem/uygulama yolunda doğrulandı.

## Düzeltmeler

1. `build_translate_prompt(for_speech=True)` normal altyazıdan gelen karakter/saniye ve satır uzunluğu baskısını taşıyordu; ses bölümü de hedef süreyi öne çıkarıyordu. Ses çevirisinde bunlar kaldırıldı:önce eksiksiz anlam/doğal tam cümle, süre ikincil. İstek items alanındaki `max` kotaları ses modunda gönderilmez. Normal altyazı çevirisinin bütçeleri aynen kalır. ID/zaman/konuşmacı/JSON sözleşmesi değişmez. Türkçe yerleşik ifade, neden-sonuç/koşul/belirsizlik ve teknik anlamı koruma talimatları eklendi; kaynakta olmayan samimiyet/argo/dolgu eklenmemesi açık.
2. Dublajdaki doğal düzenleme isteği de `seconds/measuredSeconds/suggestedMaxWords` içeriyordu. Bir saniyelik pencereye gelen uzun doğal metin iki kelimelik kota görebiliyordu. Yeni `dub-editor-request.js` doğal düzenleme ile açık süreye sığdırmayı ayırır. Natural isteğinde yalnız hedef metin ve sınırlı önceki/sonraki bağlam var. Fit isteği ölçülen süre/kota davranışını korur; mevcut `safeShortening` anlam delili kontrolleri kaldırılmadı.
3. “Konuşmayı tam tut; videoyu yavaşlat” modunda bile uzun ses için süreye göre yeniden yazım deneniyordu. Artık video timing modunda bu kısaltma çağrısı yapılmaz; doğal düzenleme isteğe bağlı kalır. Clip modunun açık sığdırma davranışı değişmez.
4. Eski hatalı sonuçlar cache/TM/resume ve browser'ın hazır iz seçimi üzerinden değişmeden açılabiliyordu. Speech protokolü `speech-v3-full-meaning`,editör kimliği `speech-editor-v3-full-meaning`,ses kimliği `dublaj-ses-v13-preserve-video-text` oldu. Speech metadata protokolü kaydedilir ve eski sürüm completed cue'ları yeni çalışmaya taşınmaz. Browser mevcut speech izini otomatik seçerken de sürüm ister. Eski dosyalar silinmez ve elle açılabilir; yeni kaliteli sonuç diye otomatik kullanılmaz. Kaynak Whisper izi mevcutsa yalnız çeviri yolu kullanılabilir, browser testinde bu akış korunur.

## Kontroller

- `backend/test_speech_translation.py`:6 geçti;tek geçiş,aynı ID/zamanlar,ordinary/speech ayrımı,ses isteğinde max olmaması,protokole göre cache ve eski speech metadata resume reddi.
- `tests/test_dub_generation_quality.py`:12geçti;video timing'de tam metnin süreye göre kısaltılmaması dahil.
- `node tests/dub-editor-request.test.js`:natural'da süre/kelime kotası yok,fit'te var,bağlam sınırlı.
- Node dub-text-guard,speech-translation-ui,browser-youtube-whisper,dub-service geçti. Browser testi eski speech izini yeniden üretir,mevcut protokoldeki izi yeniden kullanır.
-4Python py_compile,main/renderer/editor JS syntax ve diff kontrolü geçti.

Bu kontroller gerçek sağlayıcının iyi Türkçe çevirdiğinin kanıtı değildir. Canlı ücretli/ücretsiz model çağrısı,belirtilen kötü dosyanın kaynak/hedef karşılaştırması,GPU ses üretimi,UI görsel koşumu ve tam npm paketi yapılmadı. UI layout değişmedi. Ana master/dış motor değişmedi. Yeni bağımlılık yok. Protokol değişikliği ilk çeviri/ses üretimini yeniden gerektirebilir; önceki kullanıcı dosyaları korunur. CI açık,sonucu beklenmez.

## Açık kalan iş

Kullanıcının kötü bulduğu tam SRT/source çiftini edinip anlama kayması,eksik bağlam,yanlış terim,kırpma veya ASR kaynağı hatasını ayırmak. Gerçek örnek olmadan “çeviri artık çok iyi” veya “kötü dosyayı düzelttim” denemez. Otomatik ek ücretli native-refine geçişi açılmadı; mevcut tek çeviri isteği yaklaşımı korundu.
