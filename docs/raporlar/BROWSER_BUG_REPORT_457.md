# Rapor457 — Oturum kurtarma ve içe aktarma tutarlılığı

2026-10-18. Başlangıç `0d44a2c2245283ee44da7ee8025c99dc232d9425`.
Bitiş kod commit'i `011e056d44942c22da61c9556d839c4a78b2526a`.
Dal `codex/browser-whisper-progress-20261014`.

Kullanıcı daha derin inceleme istedi. Oturum şeması, yeniden yaratılan sekme
kimlikleri ve taşınabilir paket içe aktarmanın yazma sırası incelendi. Beş
hata grubu altı testle doğrulandı. Önceki raporların tüm açıkları kapanmış sayılmaz.

## 457-01 — Aktif sekme fallback'i split referansıyla çakışıyor

`normalizeBrowserSession` aktif kimlik geçersizse ilk sekmeyi seçiyor fakat
split kimliğini hâlâ ham aktif kimlikle karşılaştırıyordu. Güncel şemalı bir
kayıtta active=missing, split=a, tabs=[a,b] sonucu active=a ve split=a
olabiliyordu. Aktif kimlik önce çözülür, split bununla karşılaştırılır.
Güncel sürümlü fixture eski kodda çakışmayı üretti; artık secondary boş.
Eski sürüm migrasyonu split'i zaten temizlediği için repro güncel şema ile yapıldı.

## 457-02 — Eksik kimlikler tekilleştirilmiyor

Boş `id` tekilleştirme yolundan doğrudan geçiriliyordu. Birden fazla boş
kimlikli sekmenin aktif/split/kayıt referansı belirsiz kalıyordu. Bunlara
deterministik `tab-restored-*` kimliği verilir; özgün başka sekmenin kimliği
çalınmaz. Test iki boş kimlik ve gerçek `tab-restored-1` girdisinin üç ayrı
ve tekrar normalize edilince sabit kimlik taşıdığını doğrular.

## 457-03 — Uzun yinelenen kimlik sonraki okumada değişiyor

128 karakterlik kimliğe `-dup2` eklemek şema sınırını aşıyor, sonraki
normalize işlemi suffix'i kesip tekrar kimlik üretimine giriyordu. Artık
suffix için taban kimlikte yer bırakılır; 128 sınırı ve tekrar okunabilirlik
korunur. Normal kısa yinelenen kimliklerin önceki adlandırması korunur.

## 457-04 — Yeniden yaratılan sekmenin active/split bağlantısı kopuyor

`createBrowserTabRecord` çalışma zamanı sekme regex'ine uymayan eski/paket
kimliğini yeniden üretir. Başlangıç kurtarma ve paket içe aktarma ise aktif
ve split'i eski kimliklerle arıyordu; ilk sekmeye dönülüp split kayboluyordu.
İki yolda da snapshot id → gerçek oluşturulan id eşlemesi kullanılır.

Gerçek fonksiyon/IPC gövdesi VM'de çalıştırılan iki testte, kimlikleri
yenilenen ikinci sekmenin aktifliği ve birinci sekmenin secondary bağlantısı
korunur. Eski kodda her iki test active için `tab-new-1 !== tab-new-2` verdi.
Fixture tab oluşturmayı simüle eder; gerçek pencere oluşturma kanıtı değildir.

## 457-05 — Başarısız yer imi/geçmiş yazımı açık sekmeleri yine kapatıyor

`browser:session:import` mevcut view'ları yok ediyor, ardından
`writeBrowserPlaces` false sonucunu kontrol etmiyordu. Yazma engelinde
mevcut sekmeler kapanıp bellek içe aktarılan yerlerle değişebiliyordu; en
son oturum kaydı başarılıysa API genel işlemi başarılı bile sunabiliyordu.

Yer imi/geçmiş yazımı artık sekmeler kapatılmadan ve varyantlar içe
alınmadan yapılır. Başarısızlıkta eski bellek cache'i geri alınır, dirty
korunur, restore tercihi ve açık sekmeler değiştirilmeden TR/EN hata döner.
Test eski kodda ok:true gördü; düzeltmeden sonra ok:false, destroy sayısı 0,
aktif eski sekme ve aynı eski places nesnesi korunur.

Sınır: bu, bütün paket içe aktarımını çok dosyalı crash transaction yapmaz.
Places yazımı başarılı olduktan sonraki varyant/activation/oturum yazımı
hatalarının tamamında tam rollback bu çalışmanın kapsamında değildir.

## Doğrulama ve sınırlar

- Yeni `tests/report457-regressions.test.js`: 6 test. Altısı da eski kodda
  başarısız çalıştırıldı, düzeltmeden sonra geçti.
- 15 hedefli Node dosyası geçti. Bunlar içinde 1000 tohumlu oturum matrisi,
  426 bozuk oturum kontrolü, paket checksum/redaction ve disk dayanıklılık testleri var.
- Gerçek Electron trusted bridge smoke, JS sözdizimi, py_compile ve diff geçti.
- Normalizer şema sürümü artmadı; eski dosyalar okunur, yeni alan eklenmedi.
- Kullanıcı profili/oturumu veya gerçek paketleri testte kullanılmadı.
- Tam npm test, start.bat/install.bat, gerçek profil ile import, canlı siteler,
  GPU/DRM/hesap testleri yapılmadı. Layout değişmedi; görsel test yok.
- CI incelemesini bırakma talimatı korundu. Diğer raporlar topluca kapatılmaz.
