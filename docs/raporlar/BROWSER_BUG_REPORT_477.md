# BROWSER_BUG_REPORT_477 — Ses, kaynak kuyruğu ve browser ayarları

Tarih: 2026-10-19. Dal: `codex/browser-audit477`.
Başlangıç: `68775abbfdacff72ee48095e9ee8cb74009bff49` (güncel master).
Bitiş ürün kodu: `c5ffa52dceefe1b95689d9450e53372c16be22f7`.

Kullanıcı yaklaşık 10 yeni hata için geniş tarama ve kısa kontroller istedi.
470–476 bulguları yeniden sayılmadı. Aşağıdakiler kontrollü Node örnekleriyle
kod düzeyinde doğrulandı; gerçek kullanıcının bu hataların hepsini yaşadığı
iddia edilmiyor. Bozuk kayıt ve geçersiz girdi durumları ayrıca belirtilmiştir.

| No | Önem | Tetikleyici, kök neden ve düzeltme |
|---|---|---|
| 477-01 | Orta | `dub-settings.json` geçerli JSON olsa bile `null`, dizi veya nesne türünde engine/reference/transcript içerirse config IPC hata dönüyordu. Nesne şeması ve yol türleri kontrol edilerek varsayılana dönülüyor. Kullanıcının bozuk dosyası otomatik silinmiyor. |
| 477-02 | Orta | Windows `Path` ortam anahtarı, torch/lib henüz yoksa voiceEnvironment tarafından PATH'e kopyalanmadan siliniyordu. Background ayrıştırıcı ise verilen özel ortam yolunu process.env ile eziyordu. İki süreçte de yapılandırılmış yol korunup tek PATH anahtarına taşınıyor. Torch DLL yolu varsa başa ekleniyor. |
| 477-03 | Orta | Scheduler `classes:['cpu','cpu']` girdisini iki kez sayıyordu; kapasite kontrolü bir kez yapılmasına rağmen iki yuva tüketiliyordu. Sınıflar Set ile tekilleştirildi. Geçersiz/tekrarlı iş girdisine karşı koruma. |
| 477-04 | Orta | Scheduler snapshot içindeki classes dizileri canlı kayıtla aynı nesneydi. Snapshot'ı değiştiren tüketici release'in kaynakları iade etmesini engelleyebiliyordu. Running ve queued snapshot dizileri artık ayrı kopya. |
| 477-05 | Orta | CPU+disk tutan tek iş bitince yalnız bir bekleyen iş dispatch ediliyordu; bağımsız ikinci iş boş kaynakta bekliyordu. Release bütün uygun bekleyenleri dolduruyor; public dispatch hâlâ tek iş sözleşmesini koruyor. |
| 477-06 | Düşük | Site/path ayarlarında constructor/toString/__proto__ gibi kalıtılan alanlar izinli sanılıp ok:true dönebiliyordu. Site normalizasyonu sonra bunları atıyordu. Alan seçimi yalnız PROFILE_FIELDS'ın kendi özelliklerini kabul ediyor. Bu bulgu kanıtlanmış bir genel prototype pollution iddiası değildir. |
| 477-07 | Düşük | Eski zoom kaydı `[::1]:1.5` zoom modülünde geçerliyken site profiline geçişte ASCII host regex'i yüzünden kayboluyordu. IPv6 literal hostları origin doğrulamasıyla birlikte taşınıyor; açık yeni profil üstünlüğü korunuyor. |
| 477-08 | Orta | Dublaj plan subprocess'i exit 0 ile null/boş/bozuk groups JSON'u verince ana süreç ok:true dönüyordu; sonraki grup kullanımı hata veriyordu. sourceHash, grup dizisi/boyutu, benzersiz anahtar, metin ve pozitif sonlu seconds kontrol ediliyor. Başarılı yanıt yalnız sourceHash/groups alanlarını taşıyor. Gerçek model kalitesine ilişkin bulgu değildir. |
| 477-09 | Orta | Kalıcı model karnesinde null run, ayarlar render'ında batches okunurken TypeError yapıyordu; 40 bozuk model girdisi eviction sırasında da çöküyordu. Geçersiz run'lar elenip son 10 geçerli kayıt kullanılıyor, geçerli geçmiş korunuyor. |
| 477-10 | Düşük | Kapatılan sekme kaydında bilinmeyen volume/rate null/boş/boolean ise Number dönüşümü 0 kabul edip sesi sıfırlıyor veya hızı 0.25'e çekiyordu. Bu türler varsayılana dönüyor; açık volume:0 korunuyor. |

## Kanıt ve kısa doğrulama

`node tests/report477-regressions.test.js`: düzeltme öncesi 0/10, sonrası
10/10 geçti. İlk fixture denemesinde async storage hazırlığı tamamlanmadan
child okunmuştu; fixture düzeltilip ürün kodu değişmeden yeniden koşuldu,
10 başarısızlık doğrudan ürün beklentilerinden geldi. Son koşu yaklaşık 43 ms
(test rapor süresi; gerçek ses/model üretimi ölçümü değildir).

Ayrıca geçen mevcut testler:

- `node tests/dub-service.test.js`
- `node tests/dub-background.test.js`
- `node tests/job-resource-scheduler.test.js` — 14 kontrol
- `node tests/browser-site-profiles.test.js` — 15 kontrol
- `node tests/report476-regressions.test.js` — 10 kontrol
- `node tests/translation-review-tools.test.js` — 8 kontrol
- `node tests/browser-experience.test.js` — 7 kontrol
- Değişen altı ürün JS'i ve yeni test için `node --check`.
- `git diff --check`.

`node --test` izole runner'ı sandbox'ta spawn EPERM verdi. Aynı test dosyası
`node tests/report477-regressions.test.js` ile node:test harness'ini doğrudan
çalıştırarak başarıyla tamamlandı; bu ürün kusuru sayılmadı.

## Sınırlar

Windows PowerShell/Node üzerinde, geçici ve yapay verilerle çalışıldı. Gerçek
profil/anahtar kullanılmadı. Tam npm test, Electron bridge, start.bat açılışı,
GUI/DPI, gerçek YouTube, CUDA, TTS ve ses donanımı denenmedi. Kullanıcının açık
uygulaması yeniden başlatılmadı. install.bat/start.bat ve bağımlılıklar değişmedi;
CUDA uyumluluğu/model kalitesi hakkında yeni başarı iddiası yok. UI tasarımı
değişmediği için görsel ürün doğrulaması bu turda yapılmadı.
