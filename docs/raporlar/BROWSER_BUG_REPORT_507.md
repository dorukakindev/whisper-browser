# Rapor507 — Güvenilir ses seçimi ve derin araştırma

2026-10-21. Başlangıç HEAD:`0872532a909ec698f6b0a465a81c2cba3b3f9070`; önceki ürün kodu:`e10bcc52b4a332b9277d702d87d4a55fcb47fd12`. Çalışma ağacı temizdi. Dal:`codex/broad-bugs499`, PR471. Bitiş ürün kodu:`4276113b9cfac48cc2a82495845791775e2a0c86`. Ana master ve dış VoxCPM2 dosyaları değiştirilmedi.

## Araştırma

[11 yeni kaynak ve kararlar](SES_ARASTIRMA_507_DURAK_VE_KARARLILIK.md). Öncekiyle150 kayıt,134 ilgili/erişilebilir kaynak. Tam metin, seçili bölüm, özet ve issue okumaları ayrıdır;150 tam makale okuma iddiası yok. Kaynak ses ekleri dinlenmedi, YouTube videosu izlenmedi. Eğitim gerektiren farklı mimariler, doğrulanmamış prompt etiketleri veya yapay nefes eklenmedi.

##507-01 — Aday seçimi bütün anlam kontrollerini kullanmıyordu

`altyazi_oku.uret` ilk ASR sonucu review ise ikinci aday üretiyor. Eski kod daha yüksek token benzerliği yanında elle listelenmiş birkaç bayrağa bakıyordu. `added_numbers`, `percentage_mismatch`, `semantic_mismatch` listede yoktu; yüksek benzerlikli ama anlam hatalı aday ilk sesin yerine seçilebiliyordu. Bütün kontrolleri geçen adayın benzerliği ilk hatalı adaydan biraz düşükse ise aday reddediliyordu.

Yeni karar ortak verifier sonucunu kullanır:yalnız `status=passed` ve review olmayan aday seçilir. Böylece bütün doğrulama kapıları tek yerde kalır; unavailable kabul edilmez. İlk sonuç review olduğundan passed aday için benzerlik artışı aranmaz. Akustik kalite eşiği korunur.

Kontrollü test:%95 benzerlikli ama sayı eksik ilk aday →%90 benzerlikli passed aday kabul; %99 benzerlikli added_numbers/percentage/semantic hatalı adaylar ret; unavailable ret. Bu ürün seçim hatasıdır; test model doğallığı kanıtı değildir.

##507-02 — İkinci denemenin hatası ilk sesi kaybettirebiliyordu

İsteğe bağlı ikinci üretim ValueError/OSError/timeout verince dış grup hata yoluna düşüyor, ilk kullanılabilir ses geçici dosyada kalıp hata/boşluk akışına gidiyordu. Artık bu deneme hataları ilk ses korunarak raporlanır (`verification_retry_error`:yalnız exception sınıfı). Ses review kalır; başarılı diye sunulmaz. OOM/CUDA RuntimeError ve cancellation mevcut üst seviye yönetime geçer.

İkinci WAV önce ayrı dosyaya yazılır/doğrulanır; kabul edilince aynı klasörde replace ile ilk geçici WAV'ın yerine alınır. Bellek metadatası yalnız terfi başarılıysa değişir. İkinci geçici dosya finally içinde temizlenir. Ses cache kimliği `dublaj-ses-v12-verified-retry`; eski dosyalar silinmez, ilk üretimin maliyeti artabilir.

Kontrollü test:ikinci seed ValueError verir;16.000 frame ilk ses diskte kalır, durum review, verify WAV kalmaz. Mevcut uzun-metin kurtarması gerektiğinde devam eder.

##507-03 — Seyrek perde kanıtı yanıltıcı özet üretiyordu

Önceki opt-in araç10 güvenilir10ms çerçeveyle birkaç saniyelik ses için özet çıkarıyordu. Gerçek6WAV'da çerçeve sayısı7–23, span kapsaması yalnız%1.05–3.21 çıktı. Artık `pitch_summary` en az500ms ve span'ın%10'u kadar güvenilir çerçeve ister. Yetmezse medyan/aralık null; çerçeve/kapsama ve pitch_sufficient=false yazılır. Bu konservatif raporlama eşiği kalibre edilmiş insan kalite eşiği değildir, üretimi değiştirmez.

## Gerçek Windows ölçümü

Önceki sandbox yavaşlığının kesin kök nedeni bilinmiyor. Bu tur sandbox dışında, proje içi `NUMBA_CACHE_DIR=tmp/report507/numba-cache` ile:

-1sn sentetik160Hz sinyal:160.122Hz medyan,0.1semitone90–10 aralık,97güvenilir çerçeve; ilk koşum15.19sn. Tolerans3Hz ve aralık<0.3 kontrolü geçti.
- Önceki505 turunda gerçek GPU ile üretilmiş6WAV'ın pYIN analizi tamamlandı. Yeni kapsama şartıyla hepsinin F0 özetleri null. Bu seslerin kötü olduğu veya sabit bağlamın daha kötü olduğu anlamına gelmez; ölçüm yeterli kanıt üretmedi.
- Yerel sonuçlar:`tmp/report507/prosody.json` ve `prosody-checked.json`. Ses/kişisel referans Git'e eklenmedi. Yeni bağımlılık/model kurulmadı, dış motor değiştirilmedi, kalıcı ortam ayarı yazılmadı.

## Kontroller ve sınırlar

- `tests/test_dub_generation_quality.py`:10 geçti,5 aday varyasyonu dahil; mevcut8 kontrol korunur.
- `backend/test_prosody_diagnostics.py`:3 geçti.
- Recovery4, completion3, dub_quality4 Python kontrolü ve Node dub-service geçti.
- Değişen4Python dosyası py_compile ve diff kontrolü geçti.

Yeni GPU üretimi, insan dinleme/MOS/speaker embedding, bütün npm paketi, Windows start.bat/gerçek YouTube/DRM, Ubuntu veya görsel UI koşumu yapılmadı. UI değişmedi. CI açık; sonucu beklenmedi, yeşil iddiası yok. Doğallığın mükemmelleştiği veya modelin bütün ton kaymalarının çözüldüğü iddia edilmiyor.
