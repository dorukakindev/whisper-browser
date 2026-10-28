# Rapor703 — Dublaj kalite kanıtı: beklenen metin ve otomatik döküm

Başlangıçmaster67306c24aa73448e3399304fabfa9d697925d44c. Kullanım geliştirmesi ve yanıltıcı denetimsiz durum metni onarımı.

## Ne değişti

- `speech_check` özgün ASR metnini sayı/büyük-küçük harf dönüşümlerinden **önce**8000karakterle sınırlı `recognizedText` olarak döndürür. Anlam/tekrar/sayı kararları ve eşikler değişmedi. Verifier→sidecar/quality→mevcut IPC/model zinciri bu alanı taşıyor; yeni IPC yok.
- Kalite ayrıntısında beklenen metin, özgün otomatik döküm, varsa ASR metin eşleşmesi ayrı etiketlerle gösterilir. “Doğallık puanı değildir” ve “tanıma hatası içerebilir” açık yazılır. Telaffuz sözlüğünün seslendirme metni mevcut ayrı satırında korunur.
- not_checked/unavailable/eski raporlarda döküm uydurulmaz. Metin karşılaştırması yokken eski “bu kontrollerde işaret yok” açıklaması yerine dinleme gerektiği yazılır. Hazır gruptaki başlık “Kontrol ayrıntıları”; review/failed eski açıklayıcı başlık. Aynı çeviriye gelen review/review durum metni tekrarlanmaz.
- Eski cache yeniden sentezlenmez veya kalite eşiği değiştirilmez. Bu kalite metriği ilavesi ses üretimi önbellek kimliğini değiştirmez.

## Kanıt

-10Python kalite testi PASS: miktar-normalizasyonundan önceki ham50.000metni korunur;8000sınırı.20üretim orchestration testi PASS: tekrar/cache/referans/kalite kararları korunur.
-2Node renderer/locale PASS; HTML benzeri ASR içeriği textContent ile yazılır, img oluşmaz; eski/eksik rapora geçince metin temizlenir/gizlenir. Syntax/py_compile/diff PASS.
- Native Windows gerçek renderer/preload kontrollü olaylar PASS; TRdark800125% ve ENlight1100100% görüntü incelendi. İlk harness zaten aktif işe tekrar start gönderiyordu; olay sırası düzeltildi, ürün hatası sayılmadı. Final terminalJSON PASS.
- Gerçek `SpeechVerifier` sınıfı AST ile aynı kaynaktan yüklendi ve gerçek backend CPU alt süreci/cached small/R700sentetikWAV ile çalıştı: **passed,similarity1.0,recognizedText tam beklenen**. Bu yeniden koşudur; R700farklı decoding ayarındaki0.8571bulgusu geriye dönük değiştirilmedi. İlk sandbox denemesi alt süreç unavailable; izinli aynıkomut tekrarında PASS. Sınıfın normal üretim entrypoint bootstrap'ı bu bağımsız probda yok.

[Ekranlar/JSON](EVIDENCE703_2026-10-28/). Ham ses/profil/kişisel metin/API committe yok.

## Kaynak ve sınırlar

[SYSTRAN faster-whisper transcribe.py](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) Segment.text/decoding ayarları gerçek kaynakta incelendi; MITproje, dış kod kopyalanmadı. ASR olasılık/benzerlik değeri insan doğal sesi puanı değildir. Mevcut plainCSS/amber stüdyo, make-interfaces-feel-better ilkeleri; yeni dependency/şema sürümü yok, optionalalan geriyeuyumlu.

Yeni GPU sesi/canlıYouTube/LLM/insan dinlemesi/DRM/temizstart.bat/install bu turda yok. UI fixture ve gerçek CPU doğrulayıcı ayrı kabul; tek UI→GPU→ASR uçtanuca iddiası yok.11before-quit warning açık; CI beklenmedi. P028/P046 kısmi kalır;100hedef tamamlandı denmez.
