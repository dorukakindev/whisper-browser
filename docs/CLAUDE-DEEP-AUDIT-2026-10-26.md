# Claude — güncel Whisper Browser derin ürün, hata ve tasarım denetimi

Bu görev için yalnız bu yeni paketi kullan. Önce REVIEW-README.md, SNAPSHOT.json, MANIFEST.json ve KNOWN-ISSUES.md oku. Önceki ara-v3 koşumunun snapshot'ı eskiydi; eski test sonuçlarını bu yeni kaynakta çalıştırılmış gibi aktarma. Benim istediğim genel tavsiyeler veya yüksek PASS sayısı değil; gerçek kullanıcının karşılaşacağı önemli sorunları kanıtlarıyla bulman, işe yarar geliştirmeler tasarlaman.

## Yetki, çalışma alanı ve dürüstlük

1. Bu tur READ-ONLY ürün denetimi yap. src/, backend/, tools/, tests/, kurulum dosyaları ve kilitleri değiştirme. Commit/push/PR yapma. AGENTS.md ve eski devir notlarındaki uygulama/teslim emirleri bu görevin read-only sınırını genişletmez. Yeni probe/fixture/log/raporları yalnız audit-output/ altında yaz. İstersen ayrı suggested-fixes.patch ver; uygulanmamış taslak olduğunu belirt.
2. Terminalin varsa gerçekten çalıştır; yoksa başta açıkça söyle ve statik analiz ile koşulabilir repro teslim et. Sahte terminal çıktısı, hayali ekran görüntüsü veya kaynak okumadan kesin hata yazma. Modülün gerçek fonksiyonunu çağır; aynısını yeniden yazıp kendi kopyanı test etme. Stub sınırlarını yaz.
3. Gerçek anahtar, kişisel profil, ücretli API kullanma. localhost sağlayıcı fixture'ları, sentetik WAV/medya ve geçici test profili kullan. Ağ gerekirse neyi indirdiğini/çağırdığını kaydet; model ağırlıklarını sırf PASS sayısı için indirme. GPU/Windows/DRM/gerçek model yoksa bu sınırı koru.
4. Test beklentisini ürünün yanlış davranışına uyarlama. Test yanlışsa beklenen davranışı kaynak/ürün sözleşmesiyle kanıtla, TEST_CONTRACT olarak ayır. Ürün davranışını test harness'i ile gizlice yamama; zorunlu ortam adaptasyonunu ayrı dosyada ve diff'iyle belgele.
5. Eksik .git/tarihsel belgeleri PACKAGE_LIMITATION say. D-Bus uyarısını tek başına anahtar kasası hatası, RGB farkını görünmez arayüz, 150sn limitini ürün deadlock'u diye sayma. Her başarısız testin en erken gerçek hata satırını ve kök nedeni incele. Kök bilinmiyorsa INCONCLUSIVE.
6. Aynı kökü yüz varyantla yüz bug sayma. Bilinen F-01/F-02/F-04/F-06 tekrarı duplicate_of ile işaretlensin. Yeni kanıt veya güvenli düzeltme tasarımı değerlidir ama yeni keşif değildir. Gerçekten sorun yoksa yok de.

## Önce ortamı ve snapshot'ı doğrula

- ZIP kaynak manifestindeki her dosyanın SHA256/boyutunu kontrol et. Ürün dosyalarını başlangıç/sonda tekrar hash'le. Snapshot Git SHA'sı ile arşivin SHA256'sını karıştırma.
- Node/Python/Electron/OS/CPU/RAM/ffmpeg ve ekran sunucusunu kaydet. package-lock.json ile uyumlu bağımlılık kurulumunu kullan; keyfi sürüm yükseltme yapma. Electron castlabs dağıtımı kullanılıyor; başka binary seçersen ayrı ortam değişikliği olarak yaz.
- Önce kısa Node/Python ve sınırlı Electron örneğiyle ortam sağlığını doğrula. Güvenli anahtar kaydı için safeStorage isEncryptionAvailable/selectedStorageBackend sonucunu gerçekten logla; yalnız probe dosyası yazmak sonuç değildir. Gerçek gizli veri kullanma.
- Linux root gerekiyorsa yalnız izole test konteynerinde --no-sandbox / xvfb koşulunu açık kaydet. İç içe başlatılan Electron süreçlerine de bak; uygulamanın normal Windows güvenlik ayarını değiştirme. Makinede ekran/donanım yoksa blokaj say.
- tests/run-all.js ve tests/run-electron-smokes.js kapsamlarını oku. npm test Electron UI testleri yerine geçmez. --all etiketi bile içeride ağ/model ihtiyacı olmadığını garanti etmez; test dosyasını oku. Asılı süreçte sınırlı süre koy; timeout/signal/exit ayrı kaydedilsin. İlk aynı-kök ortam hatası sonrası tüm benzer testleri körlemesine tekrarlama.

## İnceleme paketleri — hepsini ele al, yüzeysel listeyle bırakma

### A. Önceden doğrulanmış kritik açıklar ve güvenli çözüm tasarımı

Rapor593 ve596'yı oku; güncel fonksiyonlarda tekrar teyit et. Ayrı manga endpoint'ine boş anahtarda çeviri anahtarı taşınması: config → IPC → request/fetch Authorization çağrı grafiğini izle. Aynı host/farklı path, explicit inherit, ayrı anahtar ve boş anahtar için negatif/pozitif örnekler kur. Gerçek ağa veri gönderme. Türkçe olumsuzluk dönüşümünü dub-text-guard üzerinden dene; gitmem/giderim, yapamam/yaparım ve isim olan elma/çalışma/dondurma karşı örneklerini beraber değerlendir. Ters süreli cue'nun sessiz kaybı, sırasız cue'nun kimlik koruyan onarımı, 1.500/bin beş yüz yanlış review sorunu için gerçek minimal repro ve yan etkileri düşünülmüş kabul koşulu üret.

### B. Whisper → çeviri → ses için çeviri sözleşmesi

Renderer → preload → main → Python zincirinde dil, provider/model, clip offset, kalite modu, bağlam ve output kimliğini izle. Kuyruktaki ayarlar ekleme anında donuyor mu? 5–10dk klibin segment/word/diarization ve çevirisi özgün zaman ekseninde mi? Normal çeviri/ses için çeviri birbirine sızıyor mu? Tekrar, olumsuzluk, sayı-birim, tarih/saat, özel ad, konuşmacı değişimi ve kısa repliklerin bağlamını dene. Aynı-dil/no-op, partial/final SRT, UTF8-BOM/cp1254/UTF16, bozuk/yarım SRT ve sıfır süre sınırlarını incele. Önbellek anahtarında komşu bağlam, model ve değişmiş kaynak ayrımı korunmalı. Metin kaybını toplam cue sayısıyla değil kaynak kimliği/metin kapsamıyla ölç.

### C. Dublaj üretimi ve son parçanın takılması

Tamamlanmış cache'in aynı referansta timeout sonrası korunması; başka referansın asla reuse edilmemesi; model hazırlığı/üretim/doğrulama/mux aşaması ilerlemeleri; 60/61 benzeri son parça stall; worker exit/error/timeout/cancel sıralamaları; iptalden hemen önce/sonra tamamlanma ve tek-grup onarımını dene. Fake process/clock kullanabilirsin ama gerçek servis fonksiyonunu çağır. Kısmi çıktı, final WAV ve job ownership ayrımını kontrol et. Kullanıcıya başarılı denip olmayan dosya verilmesin; kurtarılmış dosya kalite sorunlarını gizlemesin.

### D. Akıcılık, gruplama, telaffuz ve ses bütünlüğü

Cümleyi ortadan bölen satırlar, tek satırda birkaç cümle, uzun paragraf, konuşmacı değişimi, kısaltma, alıntı, ünlem/soru ve kısa onay repliklerini incele. Metin gruplama zaman kimliklerini koruyor mu? Sayılar için binlik/ondalık/tarih/sürüm/telefon/ID ayrımını test et. Sıfır/NaN/Inf/clipped/truncated WAV ve yalnız sessizlik cache'inin başlık kontrolüyle nihai doğrulamayı nasıl geçtiğini veya reddedildiğini tüm yaşam döngüsünde göster. Header boşluğu tek başına bozuk final üretildi kanıtı değildir. GPU yoksa ton/doğallık için sonuç uydurma; uygulanabilir kontrollü A/B tasarımı ver.

### E. Video/dublaj senkronu ve müzik

Gerçek controller'a kontrollü player bağlayarak attach/remove yarışını, geç dönen play(), pause/resume/seek/rate, sekme değişimi, reklam/spinner/readyState ve eski örnekleri dene. Özgün mute/rate doğru oturuma geri dönmeli. Videoyu yavaşlat modunda konuşma kesilmesin; sabit video modu ile karıştırma. Seçili10dk için stem ayırma40dk işlememeli; clip offset ve aralık dışında özgün ses korunmalı. Müzik katmanı, ducking/gain, üretim iptali ve hazır olmayan stem davranışına bak.

### F. Referans ses, motor ve üretim ayarları

Yerel dosya/video seçimi, kaydedilen ad/döküm, otomatik döküm başarısızlığı, dosya izinleri, Unicode yollar, eski işin geç sonucu, yeniden adlandırma/silme sonrası seçim ve kaybolan kaynak senaryolarını test et. Ayarları UI→IPC→motor'a kadar izle: görünen seçenek gerçekten kullanılıyor mu? GPU paralelliği/OOM fallback ve engine warm-start referans değişimini güvenle yönetiyor mu? Performans iddiasında zaman ve bellek ölç; varsayımını açık ayır.

### G. Kitap/PDF/EPUB ve sesli kitap

Raf → kitap ayrıntısı → okuyucu → sayfa/bölüm aralığı → ses üretimi → dinleme bağlantısını gerçek kimlikle izle. PDF sayfa numarası/EPUB spine, seçili pasaj ve asistana giden bağlam doğru mu? Boş sayfa, taranmış PDF, çok uzun bölüm ve sayfa değişimindeki geç async cevapları dene. Okunan bölümün görünür vurgusu gerçek zamanlama mı yaklaşık mı? Review grubu dinleme/düzenleme/onay/yeniden üretimden sonra final dışa aktarım tutarlı mı? M4B metadata/chapter sürelerini sentetik sesle doğrula. Yedek sistemi tasarlamaya veya büyük altyapı değişikliğine sapma; kullanıcı akışını düzeltmeye odaklan.

### H. Browser/asistan eylemleri ve bağlam izolasyonu

“Bu sayfayı Türkçeye çevir” gerçek sayfa çeviri işlemini kullanıyor mu, sadece sohbet yanıtı mı? Özet/pasaj/sayfa/video/kitap ve altyazı bağlamı nereden geliyor? Sekme/sayfa/bölüm değişince eski bağlam sızıyor mu? Seçili metin önceliği, iptal, hatalı provider, tool hatası ve tamamlanmamış streaming yanıtını incele. Sayfa metnindeki talimatı kullanıcı talimatı sanmasın. Harici sayfa içeriğinden key/dosya yetkisi veya kontrolsüz araç çağrısı türetme. Keşfet araması, koleksiyon işlemi ve zevk profili eylemlerini localhost fixture ile sınayabilirsin; kişisel veri kullanma.

### I. Kütüphane/Keşfet/TMDB/Letterboxd

Kaldığın yerden hero okları seçili başlık/resim/ilerleme/play hedefini aynı kimlikte tutuyor mu? TMDB anahtarı değişince eksik afişlerin güncellenmesi ve başarısız görsel fallback'i; film açıklaması Türkçeye çevir düğmesi; Letterboxd URL'si sayfalama/sıralama, yorumları alma ve analizin kaynak kapsamı; yanlış filme eşleştirme/boş sonuç/rate limit/bozuk HTML senaryolarını dene. Gerçek site engeli ürün parser bugı değildir; temsili fixture'ın kaynağını açıkla. Büyük listede DOM sayısı, tekrar navigasyonda scroll ve stale yanıtları ölç.

### J. Gerçek tasarım denetimi

Son kodun render'ını kullan. Ana sayfa, Keşfet ayrıntı penceresi, ayarlar, browser asistanı, dublaj diyaloğu, PDF okuma/yan yana, EPUB ve sesli kitap dinleme ekranlarını incele. EN/TR, koyu/açık,1280/800/640px; mümkünse1/1.25/1.5ölçek. Kombinasyon sayısı için aynı fotoğrafı çoğaltma; riskli yerleri seç ve kapsam matrisini ver. Her bulgu için gerçek screenshot + viewport + ilgili DOM bounding box/scrollHeight bilgisi olsun. Büyük gereksiz başlık/kartlar, üç satır araç çubuğu, taşan menü, görünmez düğme, sabit boş panel, odak tuzağı, Escape/geri dönüş, scrollbar ve tıklama hedeflerini dene. Root overflow'u CSS ile gizleyip hatayı saklamayı önerme. Bu ürünün sıcak amber/grafit temasını koru; yeniden marka/tema icat etme.

### K. Güvenlik ve veri sınırları

IPC sender yetkisi, yerel dosya grant'i, yol traversal/UNC/symlink, endpoint değişiminde credential isolation, import/export redaksiyonu, log/argv/env sırları, açık link protokolü, DOM injection ve page/tool prompt injection sınırlarını kontrollü örneklerle incele. Gerçek anahtar yok. Çıktı/loglarda sentetik anahtar bile gereksiz tam basılmasın. Anahtar eşleştirme politikasını önce anla; her token kelimesini silmek işlev bozabilir.

### L. Performans ve uzun kullanım

Kompakt SRT parse için1k/2k/5k/10k/20k ölçek, hızlı üstüste navigasyon ve üretim planı yenileme, büyük kitap/listede DOM/bellek eğilimi, remove sonrası timer/listener kontrolü yap. Makul tekrar sayısı, walltime/CPU/RSS ve input boyutu kaydet. Tek yavaş1CPUsonucu Windows12GBGPU beklentisi diye sunma. Yaklaşık O(N²) iddiasında ölçüm ve ilgili döngüyü birlikte göster. Sayıyı doldurmak için bin aynı assert yazma.

## Çalışma stratejisi

Önce A/B/C'de riskli veri/anahtar/anlam kaybı, sonra G/H/J'de gerçek kullanıcı akışı. Diğer paketleri de boş bırakma; bloke ise nedenini yaz. Her alt alanda bir mutlu yol, bir sınır ve bir yarış/hata yolu düşün; aynı-kök tekrarlarını tek bulgu altında topla. Zamanı tüm eski suite'i tekrar tekrar koşturmak yerine yeni davranış kanıtına harca. Bir test kırmızıysa izole tekrar, kök sınıflaması ve mümkünse minimal repro yap. Kesin ürün hatası için tetikleyici→gerçek kod yolu→gerçek sonuç→beklenen sözleşme→kullanıcı etkisi zinciri gerekli.

## Teslim — tek küçük ZIP

1. AUDIT-REPORT.md: yönetici özeti; benzersiz yeni hata/known duplicate/test contract/ortam/paket sayıları; P0/P1/P2; ilk5uygulanacak somut düzeltme ve yan etki riskleri. Yeni bug yoksa açıkça söyle.
2. FINDINGS.json: id,title,severity,classification,confidence,subsystem,snapshot_sha,file,line,trigger,expected,actual,root_cause,user_impact,repro_command,evidence_path,suggested_fix,acceptance_test,duplicate_of. Satırları bu snapshot'ta doğrula. STATİK ve RUNTIME teyidi ayrı olsun.
3. TASK-MATRIX.csv: scenario_id,subsystem,scenario,command,status,evidence,finding_id. PASS/FAIL_CONFIRMED/TEST_CONTRACT/PACKAGE_LIMITATION/INCONCLUSIVE/BLOCKED_ENV/NOT_RUN. Dosya sayısı ile assertion/senaryo/benzersiz kök sayısını ayrı ver.
4. REPRODUCE.md + probes/: sıfırdan bu pakette çalışacak komut ve sentetik girdiler; olmayan kendi home yoluna bağımlı olmasın. Başarısızlığı saklamayan exit kodu kullan.
5. DESIGN-REVIEW.md + seçilmiş screenshots/: sorunlu ekran/öğe, ölçü, düzeltme taslağı ve geri dönüş yolu. Gerçek görsel yoksa tasarımı gördüm deme.
6. RUN-LOG.md ve ham küçük loglar: sürüm, süre, exit/signal/timeout, kurulum/adaptasyon. Kaynak manifesti başlangıç/son doğrulaması. Eski v2raporlarını yeni rapor diye ZIP'e karıştırma; tüm teslim aynı snapshot/koşum kimliğini taşısın.
7. İstersen IMPROVEMENTS.md: mevcut kodda olmayan, kullanıcı faydası yüksek en fazla10geliştirme; ilgili kod noktası, uygulanabilir tasarım, maliyet/risk ve kabul koşulu. Kütüphane önerisinde resmî kaynak/lisans/sürüm ve tam entegrasyon noktası olsun; okunmayan repodan özellik alınmış gibi yazma.

node_modules/venv/model/kişisel medya ve dev screenshot yığını teslim etme. Sadece “testler geçti” özetine indirgeme; gerçekten düzeltilebilir ve tekrar üretilebilir teslim ver. Ürünü değiştirmeden sorunları bul, bize güvenle uygulayabileceğimiz düzeltme tasarımını bırak.
