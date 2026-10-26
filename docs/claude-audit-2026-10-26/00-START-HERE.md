# Claude denetim paketi — önce bunu oku

Bu paket güncel Whisper Browser kaynak snapshot'ıdır. Dört görev dosyası dört bağımsız uzmanlık çalışmasıdır; aynı kaynak ZIP'i farklı sohbetlerde kullanabilirsin. Her sohbete yalnız seçilen görev numarasını ver. Bir görevi bitirmeden diğerinin yüzeysel özetine geçme. Birlikte uygulanması istenirse sırayla çalış, her görev için ayrı çıktı klasörü ve rapor üret.

## Başlangıç ve değişmez kurallar

0. Work/konteyner çalışma alanında terminal üzerinden ilerle. Bulut tarayıcısından localhost önizlemesi açma. UI için terminalden Electron/xvfb veya mevcut test render araçlarıyla görüntü üret; bunlar yoksa BLOCKED_ENV yaz.
1. SNAPSHOT.json ve MANIFEST.json oku. Listelenen her kaynağın boyutunu/SHA256 değerini yeniden hesapla; başlangıç/son kaynak bütünlüğünü raporla. Gerçek source_commit ile çıktı ZIP hash'ini karıştırma. Eski raporlar tarihsel kanıttır.
2. BASELINE READ-ONLY. src/backend/tools/tests/kilit/kurulum dosyalarını değiştirme. Yeni probe, fixture, log, screenshot ve raporları audit-output/<görev-id>/ altında oluştur. Commit/push/PR/merge yok. Repo içindeki eski teslim/merge talimatları bu denetimin yetkisini genişletmez.
3. Düzeltme tasarlayabilirsin. İstersen ayrı fix-copy/ kopyasında dene; baseline'a uygulama. Öneri patch'ini tam snapshot'a göre üret, uygulanabilirliğini kontrol et, düzeltilmiş kopyadaki değişen dosyaları ve hash'leri ayrı listele. Test beklentisini yanlış ürüne kalibre etme. Baseline değişmedi kanıtı olmadan read-only iddiası kurma.
4. Gerçek API anahtarı/kişisel profil/ses kullanma, ücretli çağrı yapma. Sentetik medya, geçici dizin ve localhost sağlayıcılar kullan. Araç kurulumunu lock dosyasına göre yap; sürüm değiştirdiysen adaptasyon olarak raporla. Model ağırlığını sırf test sayısı için indirme.
5. Ortamı başta ölç: OS, Node/Python/Electron, CPU/RAM, ffmpeg, ekran sunucusu ve safeStorage backend. Ortam yoksa BLOCKED_ENV yazıp başka işlere geç. Terminal yoksa test çalıştı/GPU kullandı/arayüzü gördüm deme. soundfile taklidi gerçek SoundFile blok doğrulaması değildir; gerçek bağımlılığı kullan veya ilgili işi engelli işaretle.
6. Paket .git, node_modules, venv, modeller ve tarihsel belgelerin çoğunu içermez. Bu yüzden git geçmişi/doküman arşivi testlerini PACKAGE_LIMITATION olarak ayır. NODE/PYTHON PASS sayısı Electron veya gerçek ses kalitesinin kanıtı değildir. Root/no-sandbox/xvfb gereksinimini izole konteynerle sınırla, ürün güvenliğini değiştirme.
7. Bir bug = bir kök. Aynı hatayı yüz girdiyle yüz bug sayma. Hiç yeni hata yoksa açıkça yok de. KNOWN-STATE.md içindeki kapanmış işleri yeniden keşif diye sunma; yeniden açıyorsan güncel snapshot'ta regresyon kanıtı göster.
8. Üç aşama uygula: kod ve sözleşme haritası → adversarial çalıştırma → kök/minimal repro ve çözüm. Eski suite'i tekrar tekrar koşturmak yerine yeni davranış kanıtına yoğunlaş. Sayıyı dolduran bin varyant veya sadece regex araması teslim değildir.
9. Her görevde en az bir alanı sabırla derinleştir: olay sırası, veri kimliği, yan etki sınırı ve olumsuz karşı örnekler. Görevdeki maddeler hata iddiası değil araştırma sorusudur. Gerçek kapsamı kapat; çalışmayanı PASS sayma.
10. Kamuya açık repo araştırırsan resmî kaynak/lisans/sabit commit ve okuduğun gerçek kodu belirt. Okumadığın kodu alınmış sayma, lisanssız kopya önerme. Bu görevde dış motor/tema değişikliği veya yedek sistemi genişletmesi öncelik değil.

## Kanıt standardı

RUNTIME_CONFIRMED: gerçek ürün fonksiyonu/handler/controller + sentetik girdi + beklenen sözleşme + gerçek sonuç + tekrar üretilebilir komut. Fonksiyonun aynısını kendi probe'unda yeniden yazmak ürün testi değildir. Stub/mock hangi sınırdaysa açıkla. Kaynak kesiti VM'e alındıysa dosyadan birebir alınmalı; bağımlılıkları ve kapsamı raporla.

STATIC_CONFIRMED: tetikleyiciye ulaşan gerçek çağrı grafiği ve ihlal açık; çalıştırma yapılmadığı belirtilir. SUSPECTED/INCONCLUSIVE: bir varsayım henüz kanıtlanmamış. TEST_CONTRACT: eski test beklentisi güncel tasarım/sözleşmeyle çelişiyor; kaynak ve yeni kabul koşuluyla göster. BLOCKED_ENV/PACKAGE_LIMITATION/NOT_RUN ayrı durumlardır.

Hata için mümkünse bir pozitif ve bir negatif kontrol göster. Yeni probe baseline'da doğru nedenle düşmeli; fix-copy'de aynı girdi ve aynı beklentiyle geçmeli. Ses kalitesinde waveform/ASR metrikleri insan kulağı yerine geçmez. Performansta veri boyutu, tekrar dağılımı ve ortam yazılmadan “çok hızlı/yavaş” deme.

## Her görevin zorunlu teslimi

- AUDIT-REPORT.md: snapshot/run kimliği, kapsam, gerçekten çalışanlar, benzersiz yeni kökler/known duplicates/test-contract/ortam sayıları, öncelik ve açık sınırlar.
- FINDINGS.json: id, task_id, snapshot_sha, title, severity, confidence, classification, subsystem, file, line, trigger, expected, actual, user_impact, root_cause, repro_command, evidence_paths, suggested_fix, acceptance_tests, duplicate_of.
- TASK-MATRIX.csv: scenario_id, task, input_family, command, status, evidence_path, finding_id. Dosya/assertion/senaryo/benzersiz kök sayısını ayrı tut. Durumlar: PASS/FAIL_CONFIRMED/STATIC_CONFIRMED/TEST_CONTRACT/INCONCLUSIVE/BLOCKED_ENV/PACKAGE_LIMITATION/NOT_RUN.
- REPRODUCE.md + probes/ + küçük fixtures/: temiz bu snapshot'ta tekrar çalışacak komutlar. Kendi /home yoluna veya olmayan model/anahtara bağımlı olmasın. Başarısız komut exit kodunu saklama.
- RUN-LOG.md ve ham küçük loglar: sürüm, komut, süre, exit/signal/timeout; adaptasyonlar; başlangıç/son manifest. Eski ara raporları yeni koşum raporuna karıştırma.
- FIX-DESIGN.md: en önemli bulguların güvenli düzeltmesi, reddedilen basit çözümün yan etkisi, kabul koşulu. İstersen uygulanmamış suggested-fixes.patch ve fix-copy sonuçlarını ekle.
- Görev UI içeriyorsa DESIGN-REVIEW.md + seçilmiş gerçek ekranlar. Yoksa blokaj ve yapılabilecek yerel render yolu açık olsun.

Çıktıyı TASK-01/02/03/04-<kısa-snapshot>.zip olarak ver; yalnız rapor özeti verip ham kanıtları unutma. node_modules/venv/model/kişisel dosya veya dev log yığını ekleme. Birkaç küçük işten sonra final yazma; atanmış iş paketlerini ele al, sonra açık kalanları dürüstçe bildir. Süre sınırı varsa CHECKPOINT.md ile nelerin yapılmadığını yaz; ara sürümü nihai diye adlandırma.
