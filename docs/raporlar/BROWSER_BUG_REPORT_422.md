# Rapor 422 — Aralık seslendirme ve CI kontrolü

Önce ses üretimi tam SRT veya ilk11cue örneğiyle sınırlıydı. Kullanıcı belirli video aralığını istedi. Başlangıç/bitiş, yalnız kesişen cue planı, kompakt WAV ve senkron range metadata eklendi. Aralık dışındaki özgün ses geri yüklenir; önceden mute tercihi korunur. SRT değişmez.

Kanıt: gerçek araçta2–6sn→4snWAV/0kırpma/önbellek; 11Python testi ve hedefli Node/controller testleri; Chrome geniş/dar görsel kontrol. Canlı YouTube/start.bat yeni E2E yapılmadı. Sınır cue tam metni okunur, gerekirse sonu kırpılabilir; kelime sınırı garantisi yok.

4934ab8b Windows/Ubuntu CI test-suite failure. Yeni form kontrol sınıflandırması ve rapor index eksikleri tamamlandı. Daha önceki VM fixture bağımlılıkları (dubService/syncBrowserLiveAsrClock), CSS431>430, golden-corpus adr-01 register ve Windows separate-dialogue envelope/import hataları ayrıca kaldı. Tam CI yeşil değil; hedefli Windows dublaj kontrolleri yeşil. İlgisiz geniş hata düzeltmesi yapılmadı.
