# Rapor784 — Yeniden üretimde eski ham grup kaydını koruma

Başlangıç master53eb9ed08de5a5cc618bde2b597a503e6c5b3f12. Ürün bitiş641f06ad01c3b85312de40553e9028471298dac1; son hedefli test bitişf4d214bc481b7fca0b652f2f775168f66ca2b089.

## Sorun ve kapsam

P030 grup sürümü seçimi incelenirken manifestteki file alanının değişebilir `_dub_chunks_v4/<cache-key>.wav` yoluna bağlı olduğu görüldü. Aynı grup force ile yenilenince cache slotu aynı kalırken ham WAV baytları değişir. Bu, önceki üretimin ham grubuna güvenilir dönüşü engeller. Nihai üretim WAV'larının silindiği veya değiştiği iddiası değildir.

Yeni manifestler ham sesi değişmez içerik kimliğine bağlar. dub_take_cache.snapshot bir bağımsız geçici kopyayı1MiB bloklarla SHA256 hesaplayarak yazar/fsync eder; değişen kaynak veya bozuk mevcut snapshot reddedilir. Aynı içerik aynı hedefi kullanır. Exclusive hardlink yalnız bağımsız staged kopyadan kurulur; canlı cache inode'u paylaşılmaz. Geçici dosya finally ile temizlenir. Üretilen ham kayıtlar nihai WAV'ın yanındaki `_dub_takes_v1/` altındadır; uygulamada yönetilen çıktı klasörü devralınır. Motor klasörüne yeni take arşivi koyulmaz.

Manifest sürümü2 korunur; file artık sabit snapshot, sha256 ve cache_key ek kanıttır. Sentez cache/seed/tempo/zamanlama ve nihai ses akışı değişmez. Snapshot saklama başarısızsa nihai WAV yine kullanılabilir; manifest mutable cache yolunu sabit kayıt diye yayınlamaz, file boş/takeUnavailable=true olur ve EN/TR uyarı verilir. Bu ham grup kaydı için erişilemezliktir, bütün üretimin başarısızlığı değildir.

## Dosyalar

- tools/voxcpm2/dub_take_cache.py: hash tabanlı sabit ham kayıt, dedup, exclusive install ve optional failure sınırı.
- tools/voxcpm2/altyazi_oku.py: manifest ham grup yollarını yakalar; nihai WAV yanında tutar.
- src/dub-service.js: backend snapshot uyarısını kullanıcıya aktarır.
- src/renderer/ui-locale.js: yeni uyarının İngilizcesi.
- tests/test_dub_take_cache.py: yeniden üretim/eski hash, dedup, bozuk arşiv reddi ve write-refusal temizliği/kaynak korunumu.

## Gerçek Windows/CUDA kabulü

RTX4070SUPER, sentetik8.83s Türkçe referans, iki sentetik cümle;10adım/seed42/clone/parallel2/video timing/fast doğrulama/no norm. Test yalnız ayrı tmp/r784/final çıktı ve cache'ini kullanır; kişisel ayar/motor/ref dosyası değişmedi.

İlk iki grup28.063s, aynı hazır motorla yalnız2.grubun force yeniden üretimi3.640s. İlk grubun hash'i aynı kaldı; ikinci grubun eski ve yeni hash'leri farklı ve iki dosya da korunuyor.2×2 segment için3 benzersiz snapshot var. Her manifest hash'i dosya baytlarıyla eşleşir. İki nihai WAV FFmpeg full decode exit0. Test sürücüsü gerçek OS exit0; iş sonrası boş GPU belleği10953MiB.

[Kesin temiz sonuç ve cache metrikleri](evidence784/result.json), [sentetik SRT](evidence784/source.srt). Önceki mutable ifade aynı gerçek canonical cache üzerinde yeniden hesaplandı: slot aynı, baytlar yeni kayda ait ve eski hash farklı. Parent revizyonunda tekrar GPU çalıştırılmadı; bu yeniden kurulmuş önceki ifade kanıtıdır. İlk ön deneme de geçti fakat snapshot konumu motor cache köküne bağlıydı; teslim öncesi çıktı yanı konumuna düzeltildi, son kabul ayrı temiz klasörde tekrarlandı. Esas ölçüm son koşudur.

## Hedefli kontroller

- test_dub_take_cache3PASS; test_dub_generation_quality23PASS.
- dub-service.test.js1dosyaPASS.
- Python py_compile iki üretim modülü; Node --check servis ve locale; git diff --check PASS.
- Kalite kapısı fast olduğundan bu sesin anlam/doğallık/ASR doğruluğu kabulü değildir. İnsan dinlemesi yok.
- UI düzeni değişmedi; yeni uyarı görsel olarak tetiklenmedi. start.bat/gerçekYouTube/bütün kitap akışı bu tur çalışmadı. Uzun CI beklenmedi.

## Açık kalan gerçek gereksinim

P030 tamamlanmadı. Bu paket eski/yeni ham sürümlerin güvenilir kimlikle saklanmasını sağlar. Sonraki paket bu kayıtları kaynak/cümle/ref/settings kimliğiyle güvenli listeleyip dublaj kalite bölümünde dinleme/seçme ve seçilen gruplarla yeniden zaman çizelgesi oluşturmayı bağlamalıdır. Önceki üretimi bütünüyle seçmek, tek grup seçimi yerine sunulmayacak. Eski mutable manifestler geriye dönük onarılmadı; kaybolmuş eski raw baytları varmış gibi gösterilmeyecek. Snapshotlar sürüm kullanımı için tutulur; yeni benzersiz ham kayıtlar disk alanı kullanır, otomatik geçmiş silinmez.

## Açık kaynak incelemesi

npm/cacache'in gerçek [content write kaynağı](https://github.com/npm/cacache/blob/main/lib/content/write.js) ve [ISC lisansı](https://github.com/npm/cacache/blob/main/LICENSE.md) incelendi. Geçici dosya→içerik hash'i→overwrite:false yerleştirme yaklaşımı karşılaştırıldı; Node paketinden kod alınmadı/bağımlılık eklenmedi. Python standard library ve mevcut üretim hattı kullanıldı. Yeni ağ/API/şema göçü yok.90aktifhedef sürer.
