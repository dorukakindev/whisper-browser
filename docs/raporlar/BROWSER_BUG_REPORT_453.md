# Rapor453 — Ses ve çeviri işlerinde geç yanıt / eşzamanlılık

Tarih: 2026-10-18. Kullanıcı isteği: önceki incelemeye daha derin devam et.
Başlangıç: `b4fe65c6e508d26b9005896fc916e15e54004178`.
Bitiş kod commit'i: `0076f2e1f6feba22adc4c0ab6d185edf8bb4f3aa`.
Dal: `codex/browser-whisper-progress-20261014`.

## Yöntem

İnceleme; çeviri önbelleği, dublaj servis/oynatma oturumu, referans ses UI'sı,
arka plan sesi kaynağı ve dublaj planı/kısaltma isteklerinin await sınırlarına
odaklandı. Keyfi uyku yerine kontrol edilebilir Promise kapılarıyla olayların
sırası oluşturuldu. Yeni test dosyası: `tests/report453-regressions.test.js`.
Tam uygulamanın veya önceki raporların bütün açık maddelerinin çözüldüğü iddia edilmez.

## Doğrulanan sorunlar

### 453-01 — İlk cache sıkıştırması sırasında yeni çeviri kayboluyor

`compact()` bekleyen journal satırlarının yalnız sayısını tutuyordu.
Yazım beklerken `set('late', ...)` yeni satır ekliyor; `get('first')` eski
satırı filtreleyip sona taşıyordu. Sonraki `splice(0, eskiUzunluk)` yeni satırı
siliyordu. Bellekte görünen çeviri, yeniden açılışta yoktu ve yeniden API isteği
gerektirebiliyordu.

Sıkıştırmaya ait satırlar artık başlangıçta ayrı bir diziye alınır. Yazım
sırasında gelen satırlar ayrı kalır. Yazma başarısızsa ayrılan satırlar yeni
satırların önüne geri konur. Test önce eski kodda `undefined !== 'new translation'`
ile hata verdi, düzeltmeden sonra geçti. İkinci test başarısız disk yazımını,
eşzamanlı eklemeyi ve sonraki başarılı yeniden açılışı doğrular.

### 453-02 — Dublaj bağlamı cleanup await'i sırasında eskise de yeniden mute gönderiliyor

`attach()` önceki sesi kaldırmayı bekledikten sonra yalnız intent sırasını
kontrol ediyordu. Kullanıcı bu arada başka videoya geçtiğinde eski bağlam için
yeniden mute gönderiliyor, ancak bundan sonra bağlam fark edilip geri alınıyordu.

Bağlam hem attach girişinde hem önceki cleanup tamamlandığında doğrulanır.
Kontrollü testte eski kodun mute dizisi `[true,false,true,false]`, düzeltmeden
sonra `[true,false]`; eskimiş ikinci bağlama ek mute yapılmaz.

### 453-03 — Aynı sayfadaki yeni medya öğesi eski dublajla eşleşiyor

Controller eşleşmesinde mode/tab/mediaKey/generation vardı, mediaId yoktu.
Sayfa anahtarı ve navigation generation aynı kalırken medya öğesi değişirse
eski ses oturumu geçerli sayılıyordu. Controller, dosya seçici sonucu ve
otomatik üretilen sesi bağlama köprüsü artık mediaId'yi de karşılaştırır.
Yerel player'da iki tarafın boş mediaId'si önceki davranışı korur.
Önce eski kodda `matches() === true` nedeniyle hata veren test artık geçer.

### 453-04 — Arka plan sesi yanlış YouTube videosundan alınabiliyor

Generator isteği tabId/generation taşıyor, main de yalnız bunları doğruluyordu.
Aynı sekmede farklı medya kimliği görüldüğünde istek o anki yeni URL'yi
okuyabiliyordu. Generator artık mediaId taşır; main verilen kimlik eskiyse
kaynak alma başlamadan reddeder. Request aktarımı ve gerçek main callback'inin
VM'de eski mediaId'yi reddetmesi test edildi. Bu canlı YouTube indirme testi değildir.

### 453-05 — Eski dublaj iptal hatası yeni işin durumunu değiştiriyor

İş A'nın cancel RPC'si beklerken terminal olayı gelebiliyor. Kullanıcı iş B'yi
başlattıktan sonra A'nın başarısız yanıtı, global `current` üzerinden B'ye
"İptal doğrulanamadı" yazıyordu. Cancel başında yakalanan iş nesnesi ile
yanıtın geldiği andaki current artık aynı olmalı. JSDOM testi önce mevcut
UI'da yanlış mesajla hata verdi; düzeltmeden sonra yeni iş durumu korunuyor.

### 453-06 — Referans ses iptalinde aynı geç yanıt yarışı

`voice-reference-ui` de eski iptal yanıtını o anki yeni `active` kimliğine
uygulayabiliyordu. Yanıt yalnız başlatıldığı referans işine uygulanır. Test;
referans A'yı durdurur, A sonlanınca B'yi başlatır, ardından eski iptal hatasını
döndürür. B'nin durum mesajı ve durdurma butonu korunur.

### 453-07 — Geç plan / kısaltma yanıtı önceki videonun metnini seçili bırakıyor

Plan hazırlanırken `inheritSubtitleRange()` bilerek erken dönüyor. Kullanıcı
bu sırada video değiştirip paneli açınca, geç gelen plan eski SRT'yi yeni
videoda üretime açık bırakıyordu. Kısaltma yanıtında da video kimliği kontrolü yoktu.

İstek başındaki medya kimliği tutulur, eski sonuç yayınlanmaz. Planning kilidi
kaldırıldıktan sonra yeni videonun altyazı/aralık durumu devralınır; eski SRT,
plan ve arka plan seçimi temizlenir. Kısaltmada plan nesnesi de karşılaştırılır.
Plan/kısaltma handler'larına aynı anda ikinci giriş kilidi eklendi. Eski plan
testi düzeltmeden önce `fixture.srt !== '—'` ile hata verdi; artık geçer.
Kısaltma testi de önceki videonun metninin editörü doldurmadığını doğrular.

## Doğrulama ve sınırlar

- Dokuz yeni regresyon testi geçti. İlk üç test ve plan/iptal UI testleri,
  düzeltmeden önce başarısız çalıştırılarak kök neden doğrulandı.
- Devir notunda listelenen 16 hedefli Node test dosyası geçti.
- Gerçek Electron trusted bridge smoke testi geçti; JS sözdizimi ve diff kontrolü geçti.
- DOM durumları JSDOM'da gerçek HTML ve UI koduyla test edildi. Görünüm, tema,
  layout veya kontrol eklenmedi; yeni ekran görüntüsü alınmadı.
- Tam `npm test`, Python paketi, gerçek TTS/GPU üretimi, fiziksel ses senkronu,
  canlı YouTube ve hesap girişi bu tur çalıştırılmadı.
- Windows install/start dosyaları değişmedi; `start.bat` yeniden çalıştırılmadı.
- Kullanıcı CI incelemesini bırakmıştı; CI takibi veya kimlik bilgisi okuma yapılmadı.
